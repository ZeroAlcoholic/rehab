"""Training entry shortcuts preserve user input and immutable history (synthetic data)."""
from pathlib import Path
import functools, http.server, threading, sys
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
READ="async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');return createService(await openRepository()).read();}"
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(viewport={'width':412,'height':915},is_mobile=True,has_touch=True)
        page.set_default_timeout(6000)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(sys.argv[1] if len(sys.argv)>1 else f'http://127.0.0.1:{server.server_port}/')
        page.locator('#record').click()
        copy=page.get_by_role('button',name='複製上一組',exact=True)
        assert copy.is_disabled()
        assert not page.get_by_label('日期',exact=True).is_visible()
        page.locator('.training-setup > summary').click()
        page.get_by_label('日期',exact=True).fill('2026-01-02')
        page.locator('.training-setup > summary').click()
        assert page.locator('.training-setup > summary').inner_text()=='日期與時間 · 2026-01-02'
        page.get_by_label('機台／場地識別',exact=True).fill('測試器材')
        load=page.get_by_label('第 1 組重量',exact=True)
        reps=page.get_by_label('第 1 組次數',exact=True)
        assert load.get_attribute('inputmode')=='decimal'
        assert reps.get_attribute('inputmode')=='numeric'
        load.fill('22.5');load.press('Enter')
        assert reps.evaluate('n=>n===document.activeElement')
        assert page.locator('dialog[open]').count()==1
        reps.fill('10');copy.click();copy.click()
        assert page.locator('.set-row').count()==3
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        state=page.evaluate(READ)
        assert state['records'][0]['data']['date']=='2026-01-02'
        assert state['records'][0]['data']['sets']==[{'load':22.5,'reps':10}]*3
        original=state['events']
        page.locator('.equipment-shortcut').click()
        bulk=page.get_by_role('button',name='空白次數同前次',exact=True)
        assert page.get_by_label('第 1 組次數').input_value()==''
        page.get_by_label('第 1 組次數').fill('8')
        page.get_by_label('第 2 組重量').fill('25')
        bulk.click()
        assert [n.input_value() for n in page.locator('[data-reps]').all()]==['8','10','10']
        assert page.get_by_label('第 2 組重量').input_value()=='25'
        assert bulk.is_disabled()
        page.get_by_label('第 3 組次數').fill('')
        page.get_by_text('日期與器材設定',exact=True).click()
        page.get_by_role('combobox',name='單位',exact=True).select_option('lb')
        assert bulk.is_disabled()
        page.get_by_role('combobox',name='單位',exact=True).select_option('kg')
        assert not bulk.is_disabled()
        bulk.click()
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        state=page.evaluate(READ)
        assert len(state['records'])==2 and all(e in state['events'] for e in original)
        # Imported machine identity and review metadata survive editing unchanged.
        page.evaluate("""async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');const {localDate}=await import('./src/ui/dom.js');await createService(await openRepository()).save('training',{date:localDate(),exerciseId:'lat_pulldown',machine:'測試滑輪（型號待核對）',unit:'kg',sets:[{load:30,reps:8}],review:{machine:'型號待核對',posture:'姿勢待確認'},source:'舊資料待核對',pain:'unknown',technique:'unknown',note:'座椅 3'});}""")
        page.reload()
        before=page.evaluate(READ)
        record=page.locator('.day-record').filter(has_text='測試滑輪')
        record.get_by_role('button',name='修改這筆紀錄',exact=True).click()
        assert page.get_by_label('第 1 組次數').is_visible()
        assert not page.get_by_label('日期',exact=True).is_visible()
        page.get_by_text('日期與器材設定',exact=True).click()
        assert page.get_by_label('機台／場地識別').input_value()=='測試滑輪'
        page.get_by_text('更多設定',exact=True).click()
        assert '待核對' not in page.locator('dialog[open]').inner_text()
        assert '待確認' not in page.locator('dialog[open]').inner_text()
        assert page.get_by_role('checkbox',name='機台待核對',exact=True).count()==0
        page.get_by_label('第 1 組次數').fill('9')
        for width in [320,412,1100]:
            page.set_viewport_size({'width':width,'height':915})
            for size in ['100%','200%']:
                page.evaluate('(size)=>document.documentElement.style.fontSize=size',size)
                assert page.locator('dialog').evaluate('n=>n.scrollWidth<=n.clientWidth'),(width,size)
        page.evaluate("document.documentElement.style.fontSize='100%'")
        page.set_viewport_size({'width':412,'height':915})
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        after=page.evaluate(READ)
        saved=next(r['data'] for r in after['records'] if r['data'].get('exerciseId')=='lat_pulldown')
        assert saved['machine']=='測試滑輪（型號待核對）'
        assert saved['review']=={'machine':'型號待核對','posture':'姿勢待確認'}
        assert saved['source']=='舊資料待核對' and saved['sets']==[{'load':30,'reps':9}]
        assert all(e in after['events'] for e in before['events'])
        page.reload();assert page.evaluate(READ)['events']==after['events']
        assert not errors,errors
        (ROOT/'artifacts').mkdir(exist_ok=True)
        page.locator('.equipment-shortcut').first.click()
        page.screenshot(path=str(ROOT/'artifacts/training-efficiency-mobile.png'))
        browser.close()
        print('PASS: native numeric inputs, keyboard next, duplicate sets, bulk fills blanks only, context guard, compact edit, hidden review metadata retained, immutable history, reload, 320/412/1100px at 200%')
finally:server.shutdown()
