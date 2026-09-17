"""Calibration regressions in actual Chromium, with synthetic local data only."""
from pathlib import Path
import functools,http.server,threading,json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        context=browser.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True,device_scale_factor=2,reduced_motion='reduce')
        page=context.new_page();page.set_default_timeout(6000)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.locator('#body-map').wait_for()
        page.evaluate('''async()=>{
          const {openRepository}=await import('./src/storage/repository.js');
          const {createService}=await import('./src/app/service.js');
          const {localDate}=await import('./src/ui/dom.js');
          const service=createService(await openRepository());
          for(const [offset,exerciseId,machine,load,pain] of [[10,'chest_press','A',30,'none'],[5,'chest_press','B',90,'none'],[1,'chest_press','A',35,'none'],[2,'leg_curl','C',25,'mild']]){
            const day=new Date();day.setDate(day.getDate()-offset);
            await service.save('training',{date:localDate(day),exerciseId,machine,unit:'kg',sets:[{load,reps:12}],pain,technique:pain==='mild'?'compensation':'stable',note:pain==='mild'?'測試備註：需要核對動作':''});
          }
        }''')
        page.reload();page.locator('#body-map').wait_for()
        # Collect the actual regressions before asserting to expose all three causes.
        evidence={}
        chooser=page.get_by_label('選擇身體部位',exact=True)
        page.get_by_role('button',name='正面',exact=True).click()
        chooser.select_option('calves')
        assert page.get_by_role('button',name='背面',exact=True).get_attribute('aria-pressed')=='true'
        chooser.focus();chooser.select_option('back')
        evidence['selection_focus_retained']=page.evaluate("document.activeElement?.getAttribute('aria-label')==='選擇身體部位'")
        focus=page.locator('#body-map .body-focus');focus.locator('summary').click()
        before=focus.inner_text()
        focus.locator('button').first.click()
        evidence['disclosure_stays_open']=focus.get_attribute('open') is not None
        stream=page.get_by_label('動作／器材',exact=True)
        stream_id=stream.locator('option').evaluate_all("xs=>xs.find(x=>x.textContent.includes('胸推')&&x.textContent.includes('A')).value")
        stream.select_option(stream_id)
        if focus.get_attribute('open') is None:focus.locator('summary').click()
        evidence['next_steps_independent_of_filter']=focus.inner_text()==before
        (OUT/'atlas-ux-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(evidence),flush=True)
        assert all(evidence.values()),evidence
        # Values must remain usable independently of color and small SVG hit targets.
        page.get_by_role('button',name='數值清單',exact=True).click()
        assert not page.locator('#body-map .body-canvas').is_visible()
        region_buttons=page.locator('#body-map .body-region-list button')
        assert region_buttons.count()==15
        assert min(region_buttons.evaluate_all('xs=>xs.map(x=>x.getBoundingClientRect().height)'))>=44
        target=region_buttons.filter(has_text='股四頭肌');target.focus();page.keyboard.press('Enter')
        assert target.get_attribute('aria-pressed')=='true'
        assert target.evaluate('n=>n===document.activeElement')
        page.get_by_role('button',name='查看選取部位明細',exact=True).click()
        assert page.locator('#body-map-detail').evaluate('n=>n===document.activeElement')
        assert 0<=page.locator('#body-map-detail').bounding_box()['y']<200
        stream.select_option('')
        page.get_by_role('button',name='可比進步',exact=True).click()
        chooser.select_option('back_thigh')
        assert '疼痛：輕微' in page.locator('#body-map-detail').inner_text()
        assert '動作：代償' in page.locator('#body-map-detail').inner_text()
        assert '測試備註：需要核對動作' in page.locator('#body-map-detail').inner_text()
        assert '0 / 1' in page.locator('#body-map-detail').inner_text()
        chooser.select_option('chest')
        assert '1 / 2' in page.locator('#body-map-detail').inner_text()
        page.locator('details.performance[data-exercise-id="chest_press"] > summary').click()
        assert '1 / 2' in page.locator('details.performance[data-exercise-id="chest_press"]').inner_text()
        page.locator('#range').select_option('56')
        assert page.get_by_role('button',name='數值清單',exact=True).get_attribute('aria-pressed')=='true'
        assert focus.get_attribute('open') is not None
        page.get_by_role('button',name='肌群圖',exact=True).click()
        page.locator('#body-map').screenshot(path=str(OUT/'atlas-calibrated-progress.png'))
        page.get_by_role('button',name='期間累積',exact=True).click()
        page.locator('#body-map .body-ranking > summary').click()
        page.locator('#body-map .body-bar-name').first.click()
        assert page.locator('#body-map .body-ranking').get_attribute('open') is not None
        page.locator('#body-map .body-ranking > summary').click()
        focus.locator('summary').click()
        page.locator('#body-map').screenshot(path=str(OUT/'atlas-calibrated-phone.png'))
        page.set_viewport_size({'width':1100,'height':950})
        page.locator('#body-map').screenshot(path=str(OUT/'atlas-calibrated-desktop.png'))
        for width in [320,412]:
            page.set_viewport_size({'width':width,'height':915})
            page.evaluate("document.documentElement.style.fontSize='200%'")
            for name in ['肌群圖','數值清單']:
                page.get_by_role('button',name=name,exact=True).click()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,name)
        page.evaluate("document.documentElement.style.fontSize=''")
        page.evaluate('navigator.serviceWorker.ready');page.reload()
        page.wait_for_function('navigator.serviceWorker.controller!==null')
        context.set_offline(True);page.reload()
        page.get_by_role('button',name='可比進步',exact=True).click()
        page.get_by_label('選擇身體部位',exact=True).select_option('back_thigh')
        assert '動作：代償' in page.locator('#body-map-detail').inner_text()
        assert not errors,errors
        print('PASS: evidence parity, context and notes, native focus, disclosures, overview scope, list targets, keyboard, detail navigation, redraw state, 320/412px at 200%, desktop, offline',flush=True)
        browser.close()
finally:server.shutdown()
