"""Training-first entry: optional observations, exact-machine reuse and reachable support."""
from pathlib import Path
import functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  ctx=browser.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True)
  page=ctx.new_page();page.set_default_timeout(6000);errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/')
  page.locator('#record').click()
  page.get_by_label('第 1 組次數').wait_for()
  assert not page.get_by_role('combobox',name='疼痛',exact=True).is_visible(), 'Routine entry should not present another status form'
  page.get_by_label('機台／場地識別').fill('胸推 A')
  page.get_by_label('第 1 組重量').fill('30');page.get_by_label('第 1 組次數').fill('10')
  page.get_by_role('button',name='儲存紀錄',exact=True).click();page.locator('dialog[open]').wait_for(state='hidden')
  state=lambda:page.evaluate("async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');return createService(await openRepository()).read();}")
  records=state()['records'];assert len(records)==1 and records[0]['kind']=='training'
  assert records[0]['data']['pain']=='unknown' and records[0]['data']['technique']=='unknown'
  assert '1' in page.locator('.stats').inner_text()
  assert '主要 1 組' in page.locator('#body-map-detail').inner_text()
  # A newer workout on another machine must not leak into the chosen result's repeat action.
  page.evaluate("""async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');const s=createService(await openRepository());await s.save('training',{date:'2026-09-16',exerciseId:'chest_press',machine:'胸推 B',unit:'lb',sets:[{load:65,reps:8}],pain:'mild',technique:'compensation',note:'只屬於 B'});await s.save('rehab',{type:'plan',date:'2026-09-16',regions:['abs'],items:[{id:'brace',exerciseId:'abdominal_bracing',name:'呼吸練習',status:'review',dose:'',cue:'',next:''}]});}""")
  page.reload();page.locator('#range').select_option('0')
  support=page.locator('#rehab-panel')
  assert not page.get_by_role('button',name='記錄不適',exact=True).is_visible()
  assert support.bounding_box()['y']>page.locator('#composition').bounding_box()['y']
  page.locator('[data-exercise-id="chest_press"] > summary').click()
  stream=page.locator('#progress .body-stream').filter(has_text='胸推 A')
  stream.get_by_role('button',name='再記一次',exact=True).click()
  assert page.get_by_label('機台／場地識別').input_value()=='胸推 A'
  assert page.get_by_role('combobox',name='單位',exact=True).input_value()=='kg'
  assert page.get_by_label('第 1 組重量').input_value()=='30'
  page.get_by_label('第 1 組次數').fill('12')
  page.get_by_text('感受與備註（選填）',exact=True).click()
  page.get_by_role('combobox',name='疼痛',exact=True).select_option('mild')
  page.get_by_role('combobox',name='動作狀況',exact=True).select_option('corrected')
  page.get_by_label('備註',exact=True).fill('最後一組有調整')
  page.get_by_role('button',name='儲存紀錄',exact=True).click();page.locator('dialog[open]').wait_for(state='hidden')
  assert page.locator('[data-exercise-id="chest_press"]').evaluate('n=>n.open'), 'Saving from a result should keep that result open'
  assert page.locator('#progress').get_by_text('最後一組有調整',exact=True).is_visible()
  records=state()['records'];assert len(records)==4
  saved=[r for r in records if r['kind']=='training' and r['data']['note']=='最後一組有調整'][0]
  assert saved['data']['machine']=='胸推 A' and saved['data']['sets']==[{'load':30,'reps':12}]
  assert not any(r['kind']=='rehab' and r['data']['type']=='symptom' for r in records)
  page.get_by_role('button',name='可比進步',exact=True).click()
  assert '最後一組有調整' in page.locator('#body-map-detail').inner_text()
  assert '疼痛：輕微' in page.locator('#body-map-detail').inner_text()
  # Diagram opens the collapsed plan, preserving an actionable destination.
  page.get_by_label('選擇身體部位',exact=True).select_option('abs')
  page.get_by_role('link',name='查看動作計畫 →',exact=True).click()
  assert page.get_by_role('button',name='編輯計畫',exact=True).is_visible()
  page.get_by_role('button',name='記錄不適',exact=True).click()
  page.get_by_label('疼痛分數（0–10，選填）').fill('3')
  page.get_by_text('警訊確認',exact=True).click()
  page.get_by_label('新出現排尿／大小便控制改變',exact=True).select_option('yes')
  page.get_by_role('button',name='儲存狀況',exact=True).click();page.locator('dialog[open]').wait_for(state='hidden')
  page.reload()
  assert page.locator('.rehab-alert').is_visible()
  assert not page.get_by_role('button',name='記錄不適',exact=True).is_visible()
  assert '立即就醫' in page.locator('.rehab-alert').inner_text()
  for width in [320,412,1100]:
   page.set_viewport_size({'width':width,'height':915})
   page.evaluate("document.documentElement.style.fontSize='200%'")
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert not errors,errors
  browser.close()
  print('PASS: minimal training entry, unknowns preserved, correct-machine repeat, optional context saved once and visualized, collapsed plan reachable, alert visible, mobile 200%')
finally:server.shutdown()
