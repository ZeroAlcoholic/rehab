"""Real Chrome flow using synthetic records; no account or private data."""
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
        page = browser.new_page(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True)
        page.set_default_timeout(6000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.locator('#record').wait_for(state='visible')
        page.evaluate("""async () => {
          const {openRepository}=await import('./src/storage/repository.js');
          const {createService}=await import('./src/app/service.js');
          const s=createService(await openRepository());
          for(let i=0;i<8;i++) await s.save('training', {
            date:'2026-01-01',exerciseId:i===7?'leg_extension':'chest_press',
            machine:`測試機台 ${i}`,unit:i===6?'lb':'kg',
            sets:[{load:30,reps:10},{load:35,reps:8}],
            pain:'none',technique:'stable',note:'前次備註'
          });
        }""")
        page.reload()
        page.locator('.equipment-search > summary').click()
        page.get_by_label('搜尋已記錄器材').fill('測試機台 6')
        assert page.locator('.equipment-shortcut:visible').count() == 1
        page.locator('.equipment-shortcut:visible').click()
        assert page.get_by_label('第 1 組次數').input_value() == ''
        assert page.get_by_label('第 1 組重量').input_value() == '30'
        assert page.get_by_label('第 1 組重量').get_attribute('inputmode') == 'decimal'
        assert page.get_by_label('第 1 組次數').get_attribute('inputmode') == 'numeric'
        assert '30 lb × 10' in page.locator('.set-reference').first.inner_text()
        assert not page.get_by_label('機台／場地識別').is_visible()
        page.get_by_role('button', name='儲存紀錄', exact=True).click()
        assert page.locator('dialog[open]').count() == 1
        page.get_by_role('button', name='第 1 組同前次 10 次', exact=True).click()
        page.get_by_role('button', name='第 2 組同前次 8 次', exact=True).click()
        page.get_by_role('button', name='增加一組', exact=True).click()
        assert page.get_by_label('第 3 組重量').input_value() == '35'
        assert page.get_by_label('第 3 組次數').input_value() == ''
        page.get_by_role('button', name='移除第 3 組', exact=True).click()
        page.get_by_role('button', name='儲存紀錄', exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        records = page.evaluate("""async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');return (await createService(await openRepository()).read()).records;}""")
        assert len(records) == 9
        saved = records[-1]['data']
        assert saved['machine'] == '測試機台 6' and saved['unit'] == 'lb'
        assert saved['sets'] == [{'load':30,'reps':10},{'load':35,'reps':8}]
        assert saved['pain'] == 'unknown' and saved['note'] == ''
        assert page.get_by_label('搜尋已記錄器材').input_value() == '測試機台 6'
        page.get_by_role('button', name='清除篩選', exact=True).click()
        page.get_by_label('依訓練部位找器材').select_option('front_thigh')
        assert page.locator('.equipment-shortcut:visible').count() == 1
        assert '測試機台 7' in page.locator('.equipment-shortcut:visible').inner_text()
        page.get_by_label('搜尋已記錄器材').fill('找不到')
        assert page.get_by_text('沒有符合的已記錄器材，請調整或清除篩選。', exact=True).is_visible()
        page.get_by_role('button', name='清除篩選', exact=True).click()
        page.get_by_label('選擇身體部位', exact=True).select_option('front_thigh')
        page.get_by_role('button', name='找股四頭肌相關器材', exact=True).click()
        assert page.get_by_label('依訓練部位找器材').input_value() == 'front_thigh'
        page.locator('.equipment-shortcut:visible').click()
        page.get_by_text('日期與器材設定', exact=True).click()
        page.get_by_label('機台／場地識別').fill('變更機台')
        assert page.locator('.set-reference').count() == 0
        dismiss = lambda d: d.dismiss()
        page.on('dialog', dismiss)
        page.get_by_role('button', name='關閉', exact=True).click()
        assert page.locator('dialog[open]').count() == 1
        # Native Escape/back dismissal uses the same unsaved guard.
        page.keyboard.press('Escape')
        assert page.locator('dialog[open]').count() == 1
        page.get_by_label('機台／場地識別').fill('測試機台 7')
        for name, other, original in [('單位','lb','kg'),('動作','chest_press','leg_extension')]:
            page.get_by_role('combobox',name=name,exact=True).select_option(other)
            assert page.locator('.set-reference').count() == 0
            page.get_by_role('combobox',name=name,exact=True).select_option(original)
            assert page.locator('.set-reference').count() == 2
        page.get_by_text('更多設定', exact=True).click()
        page.get_by_role('combobox',name='負荷記錄方式',exact=True).select_option('added_plates')
        assert page.locator('.set-reference').count() == 0
        page.get_by_role('combobox',name='負荷記錄方式',exact=True).select_option('')
        assert page.locator('.set-reference').count() == 2
        page.get_by_label('姿勢條件', exact=True).fill('改變握法')
        assert page.locator('.set-reference').count() == 0
        page.get_by_label('姿勢條件', exact=True).fill('')
        assert page.locator('.set-reference').count() == 2
        page.get_by_label('不納入統計', exact=True).check()
        # Incomplete exclusion reason must not throw while merely editing.
        page.get_by_role('button', name='第 1 組同前次 10 次', exact=True).click()
        page.get_by_role('button', name='第 2 組同前次 8 次', exact=True).click()
        page.get_by_role('button', name='儲存紀錄', exact=True).click()
        assert page.get_by_text('請填寫不納入統計的原因',exact=True).is_visible()
        page.get_by_label('不納入統計', exact=True).uncheck()
        for width in [320,412,1100]:
            page.set_viewport_size({'width':width,'height':915})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.locator('dialog').evaluate('n=>n.scrollWidth<=n.clientWidth')
        page.set_viewport_size({'width':412,'height':915})
        page.get_by_text('日期與器材設定',exact=True).click()
        page.get_by_text('更多設定',exact=True).click()
        page.locator('dialog').evaluate('n=>n.scrollTop=0')
        (ROOT/'artifacts').mkdir(exist_ok=True)
        page.screenshot(path=str(ROOT/'artifacts/gym-entry-mobile.png'))
        save_box = page.get_by_role('button',name='儲存紀錄',exact=True).bounding_box()
        assert save_box['y'] >= 0 and save_box['y'] + save_box['height'] <= 915
        page.get_by_role('button',name='移除第 1 組',exact=True).click()
        assert '35 kg × 8' in page.locator('.set-reference').first.inner_text()
        assert page.get_by_label('第 1 組重量').input_value() == '35'
        page.remove_listener('dialog', dismiss)
        page.once('dialog',lambda d:d.accept())
        page.keyboard.press('Escape')
        page.locator('dialog[open]').wait_for(state='hidden')
        page.locator('.equipment-shortcut:visible').click()
        page.get_by_role('button',name='關閉',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        page.evaluate('scrollTo(0,0)')
        assert 'null' not in page.locator('#equipment-shortcuts').inner_text()
        page.screenshot(path=str(ROOT/'artifacts/gym-home-mobile.png'))
        assert not errors, errors
        browser.close()
        print('PASS: search, region entry, exact reference, explicit reps, save/readback, filter retention, context change, unsaved close, responsive layout')
finally:
    server.shutdown()
