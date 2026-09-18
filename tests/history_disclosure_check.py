"""Real DOM/IndexedDB disclosure and conflict visibility; synthetic records."""
from pathlib import Path
import functools, http.server, threading
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(viewport={'width':412,'height':915})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.locator('#record').wait_for(state='visible')
        page.evaluate("""async()=>{
          const {openRepository}=await import('./src/storage/repository.js');
          const {createService}=await import('./src/app/service.js');
          const s=createService(await openRepository());
          // Explicit observation time makes "latest is 19" independent of same-millisecond writes.
          for(let i=0;i<20;i++) await s.save('training',{date:'2026-09-01',time:'12:'+String(i).padStart(2,'0'),exerciseId:'chest_press',machine:'A',unit:'kg',sets:[{load:30,reps:12}],pain:'unknown',technique:'unknown',note:'完整原始備註 '+i,source:'來源待核對'});
        }""")
        page.reload()
        archive=page.locator('.history-archive')
        archive.wait_for()
        assert not archive.evaluate('(n)=>n.open')
        assert not page.locator('.supporting-info').evaluate('(n)=>n.open')
        assert page.locator('#history').get_by_role('button',name='修改',exact=True).count()==0
        archive.locator(':scope > summary').click()
        assert page.locator('#history').get_by_role('button',name='修改',exact=True).count()==20
        first=page.locator('#history .record').first
        assert not first.locator('.record-details').evaluate('(n)=>n.open')
        assert not first.get_by_text('完整原始備註 19',exact=True).is_visible()
        first.locator('.record-details > summary').click()
        assert first.get_by_text('完整原始備註 19',exact=True).is_visible()
        first.get_by_role('button',name='修改',exact=True).click()
        page.get_by_label('備註',exact=True).fill('修改後仍保留內容')
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        assert archive.evaluate('(n)=>n.open')
        assert first.locator('.record-details').evaluate('(n)=>n.open')
        assert first.get_by_text('修改後仍保留內容',exact=True).is_visible()
        archive.locator(':scope > summary').click()
        page.locator('#range').select_option('0')
        assert not archive.evaluate('(n)=>n.open')
        # Conflict must remain actionable outside the closed archive.
        page.evaluate("""async()=>{
          const {openRepository}=await import('./src/storage/repository.js');
          const {makeEvent,project,mergeEvents}=await import('./src/domain/journal.js');
          const repo=await openRepository();
          await repo.update(state=>{
            const r=project(state.events).records[0];
            return {...state,events:mergeEvents(state.events,[makeEvent({recordId:r.recordId,parents:[r.eventId],kind:r.kind,data:{...r.data,note:'分歧 A'}}),makeEvent({recordId:r.recordId,parents:[r.eventId],kind:r.kind,data:{...r.data,note:'分歧 B'}})])};
          });
        }""")
        page.reload()
        page.get_by_text('這筆紀錄有不同版本',exact=True).wait_for()
        assert not archive.evaluate('(n)=>n.open')
        page.locator('.conflict-version').filter(has_text='分歧 B').get_by_role('button',name='保留這個版本',exact=True).click()
        page.get_by_text('這筆紀錄有不同版本',exact=True).wait_for(state='hidden')
        assert not archive.evaluate('(n)=>n.open')
        assert page.locator('#history .record').count()==20
        for width in [320,412]:
            page.set_viewport_size({'width':width,'height':915})
            page.evaluate("document.documentElement.style.fontSize='200%'")
            archive.locator(':scope > summary').click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            archive.locator(':scope > summary').click()
        assert not errors,errors
        print('PASS: 20 records hidden by default, nested raw details, edit/disclosure persistence, visible conflicts with closed archive, 320/412px at 200%')
        browser.close()
finally:
    server.shutdown()
