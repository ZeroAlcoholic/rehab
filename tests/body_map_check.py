"""Body map interaction checks in real Chromium; all data are synthetic."""
from pathlib import Path
import functools, http.server, threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'
OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/rehab/'):
            self.path=self.path[len('/rehab'):]
        super().do_GET()
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        context=browser.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True,device_scale_factor=2)
        page=context.new_page();page.set_default_timeout(8000)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/rehab/')
        page.locator('#body-map').wait_for()
        page.get_by_role('button',name='本次訓練',exact=True).click()
        page.get_by_role('button',name='期間累積',exact=True).click()
        assert page.locator('#body-map [data-coverage="recorded"]').count()==0
        page.evaluate('''async()=>{
          const {openRepository}=await import('./src/storage/repository.js');
          const {createService}=await import('./src/app/service.js');
          const {localDate}=await import('./src/ui/dom.js');
          const service=createService(await openRepository());
          for(const [exerciseId,load,pain] of [['chest_press',30,'mild'],['lat_pulldown',40,'none'],['leg_press',80,'none'],['glute_bridge',null,'unknown']]) {
            await service.save('training',{date:localDate(),exerciseId,machine:'示範機台',unit:'kg',sets:[{load,reps:12},{load,reps:10}],pain,technique:'stable',note:'畫面展示用測試資料'});
          }
          await service.save('training',{date:'2020-01-01',exerciseId:'calf_raise',machine:'示範機台',unit:'kg',sets:[{load:20,reps:10}],pain:'none',technique:'stable',note:''});
          const previous=new Date();previous.setDate(previous.getDate()-7);
          await service.save('training',{date:localDate(previous),exerciseId:'lat_pulldown',machine:'示範機台',unit:'kg',sets:[{load:35,reps:12},{load:35,reps:10}],pain:'none',technique:'stable',note:'進步比較用測試資料'});
        }''')
        page.reload()
        page.locator('#body-map [data-region="chest"] path').first.click()
        assert '1 筆' in page.locator('#body-map-detail').inner_text()
        assert '胸推' in page.locator('#body-map-detail').inner_text()
        assert '位置未記錄' in page.locator('#body-map-detail').inner_text()
        assert page.locator('#body-map [data-region="chest"]').get_attribute('data-coverage')=='recorded'
        page.get_by_role('button',name='本次訓練',exact=True).click()
        records=page.get_by_label('單筆紀錄',exact=True)
        chest_id=records.locator('option').evaluate_all("options=>options.find(o=>o.textContent.includes('胸推')).value")
        records.select_option(chest_id)
        assert page.locator('#body-map [data-region="chest"]').get_attribute('data-tone')=='primary'
        assert page.locator('#body-map [data-region="triceps"]').get_attribute('data-tone')=='support'
        assert '主要 2 組' in page.locator('#body-map-detail').inner_text()
        page.get_by_role('button',name='可比進步',exact=True).click()
        # A first record with pain must stay flagged even without a comparable pair.
        assert page.locator('#body-map [data-region="chest"]').get_attribute('data-tone')=='review'
        page.get_by_role('button',name='背面',exact=True).click()
        page.locator('#body-map [data-region="back"] path').first.click()
        assert page.locator('#body-map [data-region="back"]').get_attribute('data-tone')=='improving'
        assert '35 kg' in page.locator('#body-map-detail').inner_text()
        assert '40 kg' in page.locator('#body-map-detail').inner_text()
        streams=page.get_by_label('動作／器材',exact=True)
        lat_id=streams.locator('option').evaluate_all("options=>options.find(o=>o.textContent.includes('滑輪下拉')).value")
        streams.select_option(lat_id)
        assert '滑輪下拉' in page.locator('#body-map-detail').inner_text()
        page.locator('#body-map .body-canvas').screenshot(path=str(OUT/'atlas-progress-body.png'))
        page.locator('#body-map').screenshot(path=str(OUT/'body-map-progress.png'))
        streams.select_option('')
        page.get_by_role('button',name='正面',exact=True).click()
        page.locator('#body-map [data-region="chest"] path').first.click()
        page.get_by_role('button',name='期間累積',exact=True).click()
        page.locator('#body-map').screenshot(path=str(OUT/'body-map-front.png'))
        page.locator('#body-map .body-canvas').screenshot(path=str(OUT/'atlas-coverage-body.png'))
        page.get_by_role('button',name='背面',exact=True).click()
        page.locator('#body-map [data-region="calves"] path').first.click()
        assert '尚無相關訓練紀錄' in page.locator('#body-map-detail').inner_text()
        page.locator('#range').select_option('0')
        page.get_by_role('button',name='背面',exact=True).click()
        page.locator('#body-map [data-region="calves"]').focus()
        page.keyboard.press('Enter')
        assert '提踵' in page.locator('#body-map-detail').inner_text()
        page.get_by_role('checkbox',name='顯示骨架',exact=True).uncheck()
        assert not page.locator('#body-map .body-skeleton').is_visible()
        page.get_by_role('checkbox',name='顯示骨架',exact=True).check()
        page.locator('#body-map [data-region="back"] path').first.click()
        page.locator('#body-map').screenshot(path=str(OUT/'body-map-back.png'))
        page.get_by_role('button',name='查看滑輪下拉進程',exact=True).click()
        assert page.locator('details[data-exercise-id="lat_pulldown"]').get_attribute('open') is not None
        page.screenshot(path=str(OUT/'with-body-map-phone.png'),full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.evaluate("document.documentElement.style.fontSize='200%'")
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.evaluate("document.documentElement.style.fontSize=''")
        page.evaluate('navigator.serviceWorker.ready');page.reload()
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        context.set_offline(True);page.reload()
        page.get_by_role('button',name='背面',exact=True).click()
        page.locator('#body-map [data-region="back"] path').first.click()
        assert '滑輪下拉' in page.locator('#body-map-detail').inner_text()
        page.get_by_role('button',name='可比進步',exact=True).click()
        assert page.locator('#body-map [data-region="back"]').get_attribute('data-tone')=='improving'
        page.set_viewport_size({'width':320,'height':915})
        for label in ['本次訓練','期間累積','可比進步']:
            page.get_by_role('button',name=label,exact=True).click()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),label
        assert not errors,errors
        browser.close()
        print('PASS: empty state, coverage, unlocalized flags, front/back, keyboard, skeleton toggle, date range, 412px/200%, offline modules')
finally:
    server.shutdown()
