"""Actual mobile entry, guidance, overlay, privacy, backup and offline behavior."""
from pathlib import Path
import functools,http.server,threading,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='chrome',headless=True)
  ctx=browser.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(url)
  page.locator('#record').wait_for()
  page.evaluate("""async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');await createService(await openRepository()).save('rehab',{type:'plan',date:'2026-09-16',regions:['abs','obliques','lower_back'],items:[{id:'brace',exerciseId:'abdominal_bracing',name:'仰躺輕收腹呼吸',status:'review',dose:'先確認，少量起步',cue:'保持自然呼吸',next:'記錄當次與隔日反應'},{id:'single',exerciseId:'',name:'負重單側髖鉸鏈',status:'paused',dose:'',cue:'',next:'確認替代方式'}]});}""")
  page.reload()
  panel=page.locator('#rehab-panel');panel.wait_for()
  assert not panel.locator('.rehab-options').evaluate('n=>n.open')
  panel.locator('.rehab-options > summary').click()
  assert '仰躺輕收腹呼吸' in panel.inner_text()
  assert '暫緩' in panel.inner_text()
  assert panel.locator('.rehab-trend').count()==0, 'No empty symptom chart before the first record'
  assert page.locator('[data-adjust-region="abs"]').count()>0
  # The group's center is the gap between bilateral muscles. Tap an actual muscle surface.
  page.locator('#body-map [data-region="abs"] path').first.click()
  assert '動作需確認' in page.locator('#body-map-detail').inner_text()
  page.get_by_role('link',name='查看動作計畫 →',exact=True).click()
  # The support panel now sits near the page end; the browser may reach maximum scroll.
  bounds=panel.locator('.rehab-options > summary').bounding_box()
  nav=page.locator('.dashboard-nav').bounding_box()
  assert bounds['y']>=nav['y']+nav['height'] and bounds['y']+bounds['height']<=915
  assert page.get_by_role('button',name='編輯計畫',exact=True).is_visible()
  # Public tests use synthetic sentinels; real medical-history phrases stay private.
  for word in ['PRIVATE_HISTORY_SENTINEL','PRIVATE_DIAGNOSIS_SENTINEL']:
   assert word not in page.content()
  page.get_by_role('button',name='記錄不適',exact=True).click()
  assert page.get_by_label('往腿放射',exact=True).input_value()=='unknown'
  page.get_by_label('右坐骨附近',exact=True).check()
  page.get_by_label('疼痛分數（0–10，選填）',exact=True).fill('3')
  page.get_by_label('日期',exact=True).fill('2026-09-15')
  page.get_by_role('button',name='儲存狀況',exact=True).click()
  page.locator('dialog[open]').wait_for(state='hidden')
  page.get_by_role('button',name='記錄不適',exact=True).click()
  assert page.get_by_label('疼痛分數（0–10，選填）').input_value()==''
  assert not page.get_by_label('右坐骨附近',exact=True).is_checked()
  page.get_by_label('日期',exact=True).fill('2026-09-16')
  page.get_by_label('右坐骨附近',exact=True).check()
  page.get_by_label('疼痛分數（0–10，選填）').fill('2')
  page.get_by_text('警訊確認',exact=True).click()
  page.get_by_label('新出現排尿／大小便控制改變',exact=True).select_option('yes')
  page.get_by_role('button',name='儲存狀況',exact=True).click()
  page.locator('dialog[open]').wait_for(state='hidden')
  assert page.locator('.rehab-alert').is_visible()
  assert '立即就醫' in page.locator('.rehab-alert').inner_text()
  panel.locator('.rehab-trend > summary').click()
  assert panel.locator('.pain-chart circle').count()==2
  assert panel.locator('[data-pain-location="right_ischium"]').count()==1
  assert 'PRIVATE_INFERENCE_SENTINEL' not in panel.inner_text()
  page.locator('#settings').click()
  with page.expect_download() as info: page.get_by_role('button',name='匯出備份',exact=True).click()
  dest=OUT/'rehab-test-backup.json';info.value.save_as(dest)
  backup=json.loads(dest.read_text(encoding='utf-8'));assert len(backup['events'])==3
  assert all('history' not in e['data'] for e in backup['events'])
  page.get_by_role('button',name='關閉',exact=True).click()
  page.evaluate('navigator.serviceWorker.ready');page.reload();page.wait_for_function('navigator.serviceWorker.controller!==null')
  ctx.set_offline(True);page.reload()
  panel.locator('.rehab-options > summary').click()
  assert page.locator('.rehab-alert').is_visible()
  page.get_by_role('button',name='記錄不適',exact=True).click()
  page.get_by_label('疼痛分數（0–10，選填）').fill('1')
  page.get_by_role('button',name='儲存狀況',exact=True).click();page.locator('dialog[open]').wait_for(state='hidden')
  page.reload()
  assert page.locator('#history .record').count()==4
  assert page.locator('.rehab-alert').is_visible(), 'Blank follow-up must not clear a reported warning'
  restored=browser.new_context(viewport={'width':412,'height':915})
  other=restored.new_page();other.goto(url)
  other.locator('#settings').click()
  other.get_by_label('匯入 JSON 備份').set_input_files(str(dest))
  other.get_by_text('備份已合併',exact=False).wait_for()
  other.get_by_role('button',name='關閉',exact=True).click()
  assert other.locator('#history .record').count()==3
  assert other.locator('.rehab-alert').is_visible()
  other.locator('.rehab-options > summary').click()
  assert '仰躺輕收腹呼吸' in other.locator('#rehab-panel').inner_text()
  restored.close()
  for width in [320,412]:
   page.set_viewport_size({'width':width,'height':915})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  browser.close()
  print('PASS: concise plan, adjustment overlay, no medical history in DOM, independent unknown symptoms, position/score chart, visible red flag, backup and offline save')
finally:server.shutdown()
