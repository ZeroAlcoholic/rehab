"""Real cache-first SW upgrade, preserving an unsynced record and another tab's draft."""
from pathlib import Path
import functools,http.server,threading,json,re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
legacy=True
fail_update=False
files=re.search(r'const files = (\[.*?\]);',(ROOT/'sw.js').read_text(encoding='utf-8'),re.S).group(1)
# Previous worker's relevant lifecycle: cache-first, no activation handshake.
old_sw=f'''const files={files}; const name='rehab-shell-v7-fixture:/';
self.addEventListener('install',e=>e.waitUntil(caches.open(name).then(c=>c.addAll(files))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{{const u=new URL(e.request.url);if(u.origin!==location.origin||!files.some(f=>new URL(f,registration.scope).pathname===u.pathname))return;e.respondWith(caches.open(name).then(async c=>(await c.match(u.pathname))??fetch(e.request)));}});'''
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=self.path.split('?')[0]
  if fail_update and not legacy and path=='/sw.js':
   self.send_error(503,'temporary fixture failure');return
  if legacy and path in ['/sw.js','/src/domain/journal.js']:
   source=old_sw if path=='/sw.js' else (ROOT/'src/domain/journal.js').read_text(encoding='utf-8').replace('["training", "inbody", "rehab"]','["training", "inbody"]')
   content=source.encode('utf-8');self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content)
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  for mode in ['single','other-tab','download-failure']:
   keep_tab=mode=='other-tab'
   fail_update=False
   legacy=True
   ctx=browser.new_context(viewport={'width':412,'height':915})
   page=ctx.new_page();page.set_default_timeout(10000)
   base=f'http://127.0.0.1:{server.server_port}'
   page.goto(base+'/');page.evaluate('navigator.serviceWorker.ready');page.reload();page.wait_for_function('navigator.serviceWorker.controller!==null')
   page.evaluate("""async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');await createService(await openRepository()).save('training',{date:'2026-09-16',exerciseId:'chest_press',machine:'unsynced A',unit:'kg',sets:[{load:20,reps:12}],pain:'unknown',technique:'unknown',note:'keep me'});}""")
   cached=page.evaluate("fetch('./src/domain/journal.js').then(r=>r.text())")
   assert '["training", "inbody"].includes' in cached
   other=None
   if keep_tab:
    other=ctx.new_page();other.goto(base+'/');other.locator('#record').click()
    other.get_by_label('機台／場地識別').fill('unfinished draft')
   legacy=False
   fail_update=mode=='download-failure'
   page.goto(base+'/private/rehab-start.html')
   page.wait_for_function("location.pathname==='/'||document.querySelector('#retry')?.hidden===false||document.querySelector('#status')?.textContent.includes('版本類型不正確')")
   if '版本類型不正確' in page.locator('body').inner_text():
    print('REPRODUCED: network starter + cached old journal rejects rehab backup',flush=True)
   assert '版本類型不正確' not in page.locator('body').inner_text()
   if fail_update:
    assert page.locator('#retry').is_visible()
    count=page.evaluate("""()=>new Promise((resolve,reject)=>{const r=indexedDB.open('rehab-log-v1');r.onsuccess=()=>{const db=r.result;const q=db.transaction('state').objectStore('state').getAll();q.onsuccess=()=>{resolve(q.result[0].events.length);db.close();};q.onerror=reject;};r.onerror=reject;})""")
    assert count==1,'Failed update must not import the new dataset'
    fail_update=False;page.locator('#retry').click()
   if keep_tab:
    assert '其他分頁' in page.locator('#status').inner_text()
    assert other.get_by_label('機台／場地識別').input_value()=='unfinished draft'
    # No new data was imported while an old editor was still open.
    assert other.evaluate("async()=>{const {openRepository}=await import('./src/storage/repository.js');return (await (await openRepository()).read()).events.length;}")==1
    other.close();page.locator('#retry').click()
   page.wait_for_url('**/?range=0');page.locator('#rehab-panel').wait_for()
   state=page.evaluate("async()=>{const {openRepository}=await import('./src/storage/repository.js');return (await (await openRepository()).read());}")
   assert len(state['events'])==24 and len(state['pending'])==24
   assert any(e['data'].get('note')=='keep me' for e in state['events'])
   assert '["training", "inbody", "rehab"].includes' in page.evaluate("fetch('./src/domain/journal.js').then(r=>r.text())")
   ctx.set_offline(True);page.reload();page.locator('#rehab-panel').wait_for()
   assert page.locator('#history .record').count()==24
   ctx.close()
  browser.close()
  print('PASS: cached old guard upgrades before import; 24 pending records preserved; other tab draft protected; failed download preserves data and retries; offline reload')
finally:server.shutdown()
