"""Public recovery from an old cache, with unsynced data and another editor protected."""
from pathlib import Path
import functools,http.server,threading,re
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
legacy=True
fail_update=False
files=re.search(r'const files = (\[.*?\]);',(ROOT/'sw.js').read_text(encoding='utf-8'),re.S).group(1)
old_sw=f'''const files={files},name='rehab-shell-old-fixture:/';
self.addEventListener('install',e=>e.waitUntil(caches.open(name).then(c=>c.addAll(files))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{{const u=new URL(e.request.url);if(u.origin!==location.origin||!files.some(f=>new URL(f,registration.scope).pathname===u.pathname))return;e.respondWith(caches.open(name).then(async c=>(await c.match(u.pathname))??fetch(e.request)));}});'''
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        path=self.path.split('?')[0]
        if fail_update and path=='/sw.js':self.send_error(503);return
        if legacy and path in ['/sw.js','/src/ui/settings.js']:
            source=old_sw if path=='/sw.js' else (ROOT/'src/ui/settings.js').read_text(encoding='utf-8')+'\n// old-settings-fixture'
            body=source.encode();self.send_response(200);self.send_header('Content-Type','application/javascript');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        for mode in ['single','other-tab','download-failure']:
            legacy=True;fail_update=False
            ctx=browser.new_context(viewport={'width':412,'height':915})
            page=ctx.new_page();page.set_default_timeout(10000)
            base=f'http://127.0.0.1:{server.server_port}'
            page.goto(base+'/');page.evaluate('navigator.serviceWorker.ready');page.reload()
            page.evaluate("""async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');await createService(await openRepository()).save('training',{date:'2026-01-01',exerciseId:'chest_press',machine:'fixture',unit:'kg',sets:[{load:20,reps:10}],pain:'unknown',technique:'unknown',note:'unsynced'});}""")
            before=page.evaluate("async()=>{const {openRepository}=await import('./src/storage/repository.js');return (await openRepository()).read();}")
            other=None
            if mode=='other-tab':
                other=ctx.new_page();other.goto(base+'/');other.locator('#record').click();other.get_by_label('機台／場地識別').fill('unsaved draft')
            legacy=False;fail_update=mode=='download-failure'
            page.goto(base+'/update.html')
            assert page.title()=='更新練習誌'
            page.wait_for_function("!document.querySelector('#retry').hidden || !document.querySelector('#open-app').hidden")
            if fail_update:
                expect(page.locator('#retry')).to_be_visible()
                fail_update=False;page.locator('#retry').click()
            if other:
                assert '其他分頁' in page.locator('#status').inner_text()
                assert other.get_by_label('機台／場地識別').input_value()=='unsaved draft'
                other.close();page.locator('#retry').click()
            expect(page.locator('#open-app')).to_be_visible()
            version=re.search(r'const VERSION = "([^"]+)"',(ROOT/'sw.js').read_text(encoding='utf-8')).group(1)
            assert version in page.locator('#status').inner_text()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.locator('#open-app').click()
            page.locator('#settings').wait_for()
            assert 'old-settings-fixture' not in page.evaluate("fetch('./src/ui/settings.js').then(r=>r.text())")
            after=page.evaluate("async()=>{const {openRepository}=await import('./src/storage/repository.js');return (await openRepository()).read();}")
            assert after==before,'Updating shell must not alter any stored records or pending state'
            ctx.set_offline(True);page.reload();page.locator('#record').wait_for()
            ctx.close()
        browser.close()
        print('PASS: public update activates new shell, preserves exact IndexedDB state, protects other-tab draft, retries failed download, works offline afterward')
finally:server.shutdown()
