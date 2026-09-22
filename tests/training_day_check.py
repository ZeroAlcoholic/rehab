"""Daily review and beginner muscle associations in real Chrome, synthetic data only."""
from pathlib import Path
import functools, http.server, threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(viewport={'width':412,'height':915}, is_mobile=True, has_touch=True)
        page.set_default_timeout(6000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.locator('#record').wait_for(state='visible')
        assert page.get_by_text('今天尚未記錄訓練。',exact=True).is_visible()
        page.evaluate("""async()=>{
          const {openRepository}=await import('./src/storage/repository.js');
          const {createService}=await import('./src/app/service.js');
          const s=createService(await openRepository());
          for(const [exerciseId,machine,count,extra] of [
            ['chest_press','測試胸推',3,{}],['shoulder_press','測試肩推',2,{}],
            ['calf_raise','測試暖身',1,{analysisExcludedReason:'暖身'}]])
            await s.save('training',{date:'2026-01-01',exerciseId,machine,unit:'kg',
              sets:Array.from({length:count},()=>({load:20,reps:10})),
              pain:'unknown',technique:'unknown',note:'',...extra});
        }""")
        page.reload()
        assert page.get_by_text('今天尚未記錄訓練。',exact=True).is_visible()
        page.get_by_role('button',name='看最近一次訓練',exact=True).click()
        panel = page.locator('#training-day')
        assert '3 筆紀錄 · 2 個動作 · 5 組' in panel.inner_text()
        assert '胸大肌 3 組' in panel.locator('.day-primary').inner_text()
        assert '三角肌 2 組' in panel.locator('.day-primary').inner_text()
        assert '肱三頭肌 5 組' in panel.locator('.day-support').inner_text()
        assert '小腿後側' not in panel.locator('.day-primary').inner_text()
        page.locator('#range').select_option('30')
        assert panel.locator('.day-record').count() == 3
        record = panel.locator('.day-record').filter(has_text='測試胸推')
        record.get_by_role('button',name='修改這筆紀錄',exact=True).click()
        page.get_by_label('第 1 組次數',exact=True).fill('12')
        page.get_by_role('button',name='移除第 3 組',exact=True).click()
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        assert '3 筆紀錄 · 2 個動作 · 4 組' in panel.inner_text()
        assert '胸大肌 2 組' in panel.locator('.day-primary').inner_text()
        assert '12' in panel.locator('.day-record').filter(has_text='測試胸推').inner_text()
        page.locator('.equipment-shortcut').filter(has_text='測試胸推').click()
        assert page.get_by_text('已填 0 / 2 組',exact=True).is_visible()
        page.get_by_role('button',name='第 1 組同前次 12 次',exact=True).click()
        assert page.get_by_text('已填 1 / 2 組',exact=True).is_visible()
        page.get_by_role('button',name='第 2 組同前次 10 次',exact=True).click()
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        assert '今天練了哪些' in panel.inner_text()
        assert panel.locator('.day-record').count() == 1
        page.reload()
        assert panel.locator('.day-record').count() == 1
        page.get_by_text('查看部位對應明細',exact=True).click()
        assert '胸推' in panel.locator('.day-region-details').inner_text()
        for width in [320,412,1100]:
            page.set_viewport_size({'width':width,'height':915})
            page.evaluate("document.documentElement.style.fontSize='200%'")
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.evaluate("document.documentElement.style.fontSize='100%'")
        page.set_viewport_size({'width':412,'height':915})
        panel.scroll_into_view_if_needed()
        (ROOT/'artifacts').mkdir(exist_ok=True)
        page.screenshot(path=str(ROOT/'artifacts/training-day-mobile.png'))
        page.evaluate("""async()=>{
          const {openRepository}=await import('./src/storage/repository.js');
          const {makeEvent,project,mergeEvents}=await import('./src/domain/journal.js');
          const {localDate}=await import('./src/ui/dom.js');
          const repo=await openRepository();
          await repo.update(state=>{
            const record=project(state.events).records.find(r=>r.data.date===localDate());
            const versions=['分歧 A','分歧 B'].map(note=>makeEvent({
              recordId:record.recordId,parents:[record.eventId],kind:'training',data:{...record.data,note}}));
            return {...state,events:mergeEvents(state.events,versions)};
          });
        }""")
        page.reload()
        panel.get_by_role('link',name='前往紀錄庫核對',exact=True).wait_for()
        assert panel.locator('.day-record').count()==0
        assert '今天尚未記錄訓練。' not in panel.inner_text()
        assert '版本衝突' in panel.inner_text()
        # A historical day containing only conflicting versions must remain selectable.
        page.evaluate("""async()=>{
          const {openRepository}=await import('./src/storage/repository.js');
          const {makeEvent,mergeEvents}=await import('./src/domain/journal.js');
          const repo=await openRepository();
          await repo.update(state=>{
            const data={date:'2026-02-02',exerciseId:'chest_press',machine:'衝突測試',unit:'kg',
              sets:[{load:20,reps:10}],pain:'unknown',technique:'unknown',note:''};
            const versions=['A','B'].map(note=>makeEvent({recordId:'historical-conflict',parents:[],kind:'training',data:{...data,note}}));
            return {...state,events:mergeEvents(state.events,versions)};
          });
        }""")
        page.reload()
        page.get_by_label('查看哪一天的訓練',exact=True).select_option('2026-02-02')
        assert panel.get_by_role('link',name='前往紀錄庫核對',exact=True).is_visible()
        assert '2026-02-02 訓練紀錄' in panel.inner_text()
        assert not errors, errors
        browser.close()
        print('PASS: explicit day, latest lookup, primary/support sources, exclusion, direct edit, exact set count, new-save date, reload, 320/412px at 200%')
finally:
    server.shutdown()
