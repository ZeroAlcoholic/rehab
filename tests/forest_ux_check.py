"""User-facing hierarchy, non-nagging unknowns, readability and mobile navigation."""
from pathlib import Path
import functools,http.server,threading,json
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
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/')
  page.locator('#record').wait_for()
  page.evaluate("""async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');const s=createService(await openRepository());for(let n=0;n<5;n++)await s.save('training',{date:'2026-09-16',exerciseId:'chest_press',machine:'A',unit:'kg',sets:[{load:30,reps:12}],pain:'unknown',technique:'unknown',note:''});await s.save('training',{date:'2026-09-16',exerciseId:'leg_curl',machine:'B',unit:'kg',sets:[{load:20,reps:10}],pain:'mild',technique:'compensation',note:'實際不適'});}""")
  page.reload();page.locator('#range').select_option('0')
  assert '疼痛或動作狀況未填' not in page.content()
  assert '疼痛或動作狀況未記錄' not in page.content()
  assert '今日狀況未記錄' not in page.content()
  page.get_by_role('button',name='可比進步',exact=True).click()
  assert '疼痛：未填' not in page.locator('#body-map-detail').inner_text()
  page.get_by_label('選擇身體部位',exact=True).select_option('back_thigh')
  assert '疼痛：輕微' in page.locator('#body-map-detail').inner_text()
  assert '動作：代償' in page.locator('#body-map-detail').inner_text()
  state=page.evaluate("async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');return createService(await openRepository()).read();}")
  assert sum(r['data']['pain']=='unknown' for r in state['records'])==5
  color=page.locator('.workspace').evaluate("n=>getComputedStyle(n).backgroundColor")
  rgb=[int(v) for v in color.removeprefix('rgb(').removesuffix(')').split(',')]
  assert rgb[1]>rgb[0] and rgb[1]>rgb[2],color
  ratios=page.evaluate(r"""()=>{
   function lum(c){const a=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
   return ['#settings','#record','#reuse','#sync','.stats span','.body-view-switch button[aria-pressed=true]','.body-mode-switch button[aria-pressed=true]','.body-selection','.rehab-panel .secondary'].map(selector=>{
    const e=document.querySelector(selector);let n=e,bg;do{bg=getComputedStyle(n).backgroundColor;n=n.parentElement;}while(bg==='rgba(0, 0, 0, 0)'&&n);
    const a=lum(getComputedStyle(e).color),b=lum(bg);return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
   });
  }""")
  assert all(r['ratio']>=4.5 for r in ratios),ratios
  for width in [320,412,1100]:
   page.set_viewport_size({'width':width,'height':915})
   for size in ['100%','200%']:
    page.evaluate('(s)=>document.documentElement.style.fontSize=s',size)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,size)
    nav=page.get_by_role('navigation',name='訓練概覽導覽')
    assert min(nav.locator('a').evaluate_all('xs=>xs.map(x=>x.getBoundingClientRect().height)'))>=44
    nav.get_by_role('link',name='人體圖',exact=True).click()
    assert page.locator('#movement').bounding_box()['y']>=nav.bounding_box()['height'], (width,size,page.locator('#movement').bounding_box()['y'],nav.bounding_box())
  page.evaluate("document.documentElement.style.fontSize='100%'")
  page.set_viewport_size({'width':412,'height':915})
  page.get_by_role('navigation',name='訓練概覽導覽').get_by_role('link',name='總覽',exact=True).click()
  page.locator('#record').click()
  assert page.locator('dialog').evaluate('n=>n.scrollWidth<=n.clientWidth')
  assert not errors,errors
  (ROOT/'artifacts/forest-contrast.json').write_text(json.dumps(ratios,indent=2),encoding='utf-8')
  browser.close()
  print('PASS: no missing-field nags, unknown data intact, actual symptoms visible, forest controls and contrast, 320/412/1100px 200%, navigation and entry')
finally:server.shutdown()
