"""Continuous entry through actual UI/IndexedDB/SW, synthetic health records."""
from pathlib import Path
import functools
import http.server
import json
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/'
results = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome',headless=True)
        context = browser.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True,timezone_id='Asia/Taipei')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(url)
        page.locator('#record').click()
        assert 'null' not in page.locator('dialog').inner_text()
        page.get_by_label('機台／場地識別').fill('A 館胸推 02')
        page.get_by_label('第 1 組重量').fill('65')
        page.get_by_label('第 1 組次數').fill('12')
        page.get_by_role('button',name='增加一組',exact=True).click()
        page.get_by_label('第 2 組重量').fill('60')
        page.get_by_label('第 2 組次數').fill('9')
        page.get_by_text('感受與備註（選填）',exact=True).click()
        page.get_by_role('combobox',name='疼痛',exact=True).select_option('mild')
        page.get_by_role('combobox',name='動作狀況',exact=True).select_option('corrected')
        page.get_by_label('備註',exact=True).fill('只屬於上次的觀察')
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        page.locator('.equipment-shortcut').filter(has_text='A 館胸推 02').click()
        page.get_by_text('感受與備註（選填）',exact=True).click()
        assert page.get_by_role('combobox',name='疼痛',exact=True).input_value() == 'unknown'
        assert page.get_by_role('combobox',name='動作狀況',exact=True).input_value() == 'unknown'
        assert page.get_by_label('備註',exact=True).input_value() == ''
        assert page.get_by_label('第 2 組重量').input_value() == '60'
        assert page.get_by_label('第 1 組次數').input_value() == ''
        assert page.get_by_label('第 2 組次數').input_value() == ''
        page.get_by_label('第 1 組次數').fill('12')
        page.get_by_label('第 2 組次數').fill('9')
        page.get_by_text('日期與器材設定',exact=True).click()
        page.get_by_label('時間（台灣時間，選填）',exact=True).fill('21:10')
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        page.locator('.history-archive > summary').click()
        page.locator('#history').get_by_role('button',name='再練一次',exact=True).last.click()
        assert page.get_by_label('第 2 組次數').input_value() == ''
        assert '× 9' in page.locator('.set-reference').nth(1).inner_text()
        page.get_by_role('button',name='關閉',exact=True).click()
        results.append('repeat preserves per-set setup, clears old observations, creates new identity; history supports any workout')

        for date, weight, time in [('2026-01-01','70','08:00'),('2026-02-13','71','08:10'),('2026-04-10','72','08:05')]:
            page.locator('#inbody').click()
            page.get_by_label('日期',exact=True).fill(date)
            page.get_by_label('時間（台灣時間，選填）',exact=True).fill(time)
            page.get_by_label('體重（kg）',exact=True).fill(weight)
            assert page.get_by_label('骨骼肌重（kg）',exact=True).input_value() == ''
            page.get_by_label('量測機型／地點（選填）',exact=True).fill('A 館 InBody')
            page.get_by_label('量測條件（選填）',exact=True).fill('起床後；尚未訓練')
            if date == '2026-04-10':
                page.get_by_text('其他報告欄位（選填）',exact=True).click()
                page.get_by_label('右臂 Lean 參考比（%）',exact=True).fill('99.1')
                page.get_by_label('軀幹 Lean 參考比（%）',exact=True).fill('101.2')
            page.get_by_role('button',name='儲存 InBody',exact=True).click()
            page.locator('dialog[open]').wait_for(state='hidden')
        page.locator('#range').select_option('30')
        card = page.locator('[data-metric="weight"]')
        assert '前次可用值至本次：+1 kg' in card.inner_text()
        assert '相隔 56 天' in card.inner_text()
        assert '3 個量測日期' in card.inner_text()
        card.locator('summary').click()
        assert '2026-01-01 08:00' in card.inner_text()
        card.screenshot(path=str(OUT/'longitudinal-metric.png'))
        results.append('three irregular measurements stay visible under 30-day training filter with 56-day delta and actual dates')
        report = page.locator('#history .record').filter(has_text='2026 / 04 / 10')
        report.get_by_role('button',name='修改',exact=True).click()
        assert page.get_by_label('時間（台灣時間，選填）').input_value() == '08:05'
        assert page.get_by_label('量測條件（選填）').input_value() == '起床後；尚未訓練'
        page.locator('dialog').screenshot(path=str(OUT/'longitudinal-form.png'))
        page.get_by_label('備註',exact=True).fill('補充報告原文')
        page.get_by_role('button',name='儲存 InBody',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        page.locator('#settings').click()
        with page.expect_download() as info:
            page.get_by_role('button',name='匯出備份',exact=True).click()
        backup = OUT/'longitudinal-backup.json'
        info.value.save_as(backup)
        parsed = json.loads(backup.read_text(encoding='utf-8'))
        assert len(parsed['events']) == 6
        assert len({e['recordId'] for e in parsed['events']}) == 5
        assert all(e['data']['metrics']['skeletal_muscle_mass'] is None for e in parsed['events'] if e['kind']=='inbody')
        page.get_by_role('button',name='關閉',exact=True).click()
        page.evaluate('navigator.serviceWorker.ready')
        page.reload()
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        context.set_offline(True)
        page.reload()
        assert page.locator('#history .record').count() == 5
        page.locator('#inbody').click()
        page.get_by_label('體重（kg）',exact=True).fill('73')
        page.get_by_role('button',name='儲存 InBody',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        page.reload()
        assert page.locator('#history .record').count() == 6
        results.append('offline reload/new InBody persists; editing retains conditions, optional metrics and original event')
        context.set_offline(False)
        fresh = browser.new_context(viewport={'width':412,'height':915})
        restored = fresh.new_page()
        restored.goto(url)
        restored.locator('#settings').click()
        restored.get_by_label('匯入 JSON 備份').set_input_files(str(backup))
        restored.get_by_text('備份已合併',exact=False).wait_for()
        restored.get_by_label('匯入 JSON 備份').set_input_files(str(backup))
        restored.get_by_role('button',name='關閉',exact=True).click()
        assert restored.locator('#history .record').count() == 5
        snapshot = restored.evaluate("""async()=>{ const {openRepository}=await import('./src/storage/repository.js'); return (await openRepository()).read(); }""")
        assert len(snapshot['events']) == 6
        assert any(e['data'].get('measurementContext',{}).get('conditions')=='起床後；尚未訓練' for e in snapshot['events'])
        results.append('fresh-browser backup restore and repeat import retain all six immutable versions without duplicate records')
        for width in [320,412]:
            page.set_viewport_size({'width':width,'height':915})
            page.locator('#inbody').click()
            page.get_by_text('其他報告欄位（選填）',exact=True).click()
            assert page.evaluate("document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth + 1")
            page.get_by_role('button',name='關閉',exact=True).click()
        page.screenshot(path=str(OUT/'longitudinal-phone.png'),full_page=True)
        assert errors == [], errors
        results.append('320/412px entry form fits; no runtime errors')
        browser.close()
finally:
    server.shutdown()
print(json.dumps(results, ensure_ascii=False, indent=2))
