"""Visual reading of synthetic training: diagrams, exact set values and progressive disclosure."""
from pathlib import Path
import functools, http.server, threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(viewport={'width':412,'height':915},is_mobile=True,has_touch=True)
        page.set_default_timeout(6000)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.locator('#record').wait_for()
        page.evaluate("""async()=>{
          const {openRepository}=await import('./src/storage/repository.js');
          const {createService}=await import('./src/app/service.js');
          const {localDate}=await import('./src/ui/dom.js');
          const service=createService(await openRepository());
          for(const [exerciseId,machine,unit,sets,extra] of [
            ['chest_press','測試 A','kg',[{load:20,reps:10},{load:25,reps:8}],{}],
            ['chest_press','測試 B','lb',[{load:50,reps:12}],{}],
            ['assisted_chinup','測試輔助（型號待核對）','lb',[{load:40,reps:6}],{review:{posture:'握法待確認'}}],
            ['v_squat','測試掛片','lb',[{load:30,reps:8}],{loadBasis:'added_plates'}],
            ['calf_raise','測試暖身','kg',[{load:20,reps:10}],{analysisExcludedReason:'暖身'}]
          ]) await service.save('training',{date:localDate(),exerciseId,machine,unit,sets,
            pain:'unknown',technique:'unknown',note:'合成測試備註',...extra});
        }""")
        baseline=page.evaluate("async()=>JSON.stringify(await (await import('./src/storage/repository.js')).openRepository().then(r=>r.read()))")
        page.reload()
        # A user can reach today's records before scrolling past the equipment list.
        assert page.locator('.dashboard-nav').bounding_box()['y'] < page.locator('#entry').bounding_box()['y']
        assert not page.locator('.equipment-search').evaluate('n=>n.open')
        first_card=page.locator('.equipment-shortcut').first.bounding_box()
        assert first_card['y']+first_card['height'] < 915, 'First equipment must fit in the initial phone viewport'
        panel=page.locator('#training-day')
        panel.locator('.day-body-views svg').first.wait_for()
        assert panel.locator('.day-body-views svg[role=img]').count()==2
        assert panel.locator('.day-body-views [tabindex]').count()==0
        assert panel.locator('.day-body-views text').count()==0
        assert panel.locator('.day-body-views [data-region=chest]').first.get_attribute('data-tone')=='primary'
        assert panel.locator('.day-body-views [data-region=calves]').first.get_attribute('data-tone')=='none'
        assert not panel.get_by_text('合成測試備註',exact=True).first.is_visible()
        assert not panel.locator('.day-region-details').evaluate('n=>n.open')
        panel.locator('.day-primary').get_by_role('button',name='胸大肌 3 組',exact=True).click()
        assert panel.locator('.day-region-details').evaluate('n=>n.open')
        assert '胸推' in panel.locator('.day-region-details').inner_text()
        press=panel.locator('.day-record').filter(has_text='測試 A')
        assert press.locator('.set-tile').count()==2
        assert press.locator('.set-tile').nth(0).get_attribute('aria-label')=='第 1 組，20 kg，10 次'
        assert press.locator('.set-tile').nth(1).get_attribute('aria-label')=='第 2 組，25 kg，8 次'
        assisted=panel.locator('.day-record').filter(has_text='測試輔助')
        assert '輔助' in assisted.locator('.set-strip').inner_text()
        assert assisted.locator('.set-shared-load').inner_text()=='40 lb'
        assert assisted.locator('.set-tile').get_attribute('aria-label')=='第 1 組，輔助 40 lb，6 次'
        assert press.locator('.set-shared-load').count()==0
        plates=panel.locator('.day-record').filter(has_text='測試掛片')
        assert '掛片' in plates.locator('.set-strip').inner_text()
        assert page.locator('.equipment-shortcut .exercise-illustration').count()==4
        assisted_card=page.locator('.equipment-shortcut').filter(has_text='測試輔助')
        assert assisted_card.locator('.equipment-name').inner_text()=='測試輔助'
        assert '待核對' not in assisted_card.inner_text()
        assert '待核對' not in panel.inner_text()
        assert assisted.locator('.record-review-details').count()==0
        assert panel.locator('.day-totals').inner_text().startswith('已記錄')
        assert page.locator('svg [id]').evaluate_all('nodes=>new Set(nodes.map(n=>n.id)).size===nodes.length')
        press.get_by_text('備註',exact=True).click()
        assert press.get_by_text('合成測試備註',exact=True).is_visible()
        # Every public catalog action has an explicitly labelled, code-native illustration.
        count=page.evaluate("""async()=>{
          const {EXERCISES}=await import('./src/domain/catalog.js');
          const {exerciseIllustration}=await import('./src/ui/exercise-illustration.js');
          const gallery=document.createElement('section');gallery.id='illustration-gallery';
          gallery.style.cssText='display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;padding:20px;background:var(--surface)';
          for(const exercise of EXERCISES){const card=document.createElement('div');card.append(exerciseIllustration(exercise.id),exercise.name);gallery.append(card);}
          document.body.append(gallery);return EXERCISES.length;
        }""")
        assert page.locator('#illustration-gallery svg[role=img]').count()==count
        (ROOT/'artifacts').mkdir(exist_ok=True)
        page.set_viewport_size({'width':1100,'height':915})
        page.locator('#illustration-gallery').screenshot(path=str(ROOT/'artifacts/exercise-illustrations.png'))
        page.locator('#illustration-gallery').evaluate('n=>n.remove()')
        for width in [320,412,1100]:
            page.set_viewport_size({'width':width,'height':915})
            for size in ['100%','200%']:
                page.evaluate('(size)=>document.documentElement.style.fontSize=size',size)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,size)
        page.set_viewport_size({'width':412,'height':915})
        page.evaluate("document.documentElement.style.fontSize='100%'")
        panel.locator('.day-region-details > summary').click()
        panel.evaluate("n=>n.scrollIntoView({block:'start'})")
        page.screenshot(path=str(ROOT/'artifacts/visual-day-mobile.png'))
        page.evaluate('scrollTo(0,0)')
        page.screenshot(path=str(ROOT/'artifacts/visual-equipment-mobile.png'))
        assert page.evaluate("async()=>JSON.stringify(await (await import('./src/storage/repository.js')).openRepository().then(r=>r.read()))")==baseline, "Browsing must preserve the entire stored state"
        page.evaluate("""async()=>{
          const {openRepository}=await import('./src/storage/repository.js');
          const {createService}=await import('./src/app/service.js');
          const {localDate}=await import('./src/ui/dom.js');
          await createService(await openRepository()).save('training',{
            date:localDate(),exerciseId:'chest_press',machine:'測試 A',unit:'lb',
            sets:[{load:45,reps:9}],pain:'unknown',technique:'unknown',note:''});
        }""")
        page.reload()
        assert page.get_by_role('button',name='記錄 胸推，測試 A，重量 kg',exact=True).count()==1
        page.get_by_role('button',name='記錄 胸推，測試 A，重量 lb',exact=True).click()
        assert page.locator('.training-identity svg[role=img]').count()==1
        assert page.locator('.training-machine').inner_text()=='測試 A'
        page.get_by_text('日期與器材設定',exact=True).click()
        page.get_by_role('combobox',name='動作',exact=True).select_option('leg_extension')
        assert page.locator('.training-identity svg').get_attribute('aria-label')=='腿伸展動作示意'
        page.get_by_role('combobox',name='動作',exact=True).select_option('chest_press')
        assert '45 lb × 9' in page.locator('.set-reference').inner_text()
        page.get_by_role('button',name='關閉',exact=True).click()
        page.get_by_role('button',name='記錄 輔助反握引體向上，測試輔助，輔助重量 lb',exact=True).click()
        assert '待核對' not in page.locator('dialog[open]').inner_text()
        assert page.locator('.training-machine').inner_text()=='測試輔助'
        page.get_by_text('日期與器材設定',exact=True).click()
        assert page.get_by_label('機台／場地識別').input_value()=='測試輔助'
        page.get_by_text('更多設定',exact=True).click()
        assert page.get_by_label('姿勢待核對',exact=True).count()==0
        assert '待核對' not in page.locator('dialog[open]').inner_text()
        page.get_by_role('button',name='關閉',exact=True).click()
        page.get_by_role('button',name='記錄 V-Squat 槓桿深蹲，測試掛片，掛片重量（不含起始阻力） lb',exact=True).click()
        assert page.locator('.set-row .field').first.inner_text()=='掛片（lb）'
        assert page.locator('.training-context').get_by_text('掛片重量（不含起始阻力）',exact=True).is_visible()
        assert not page.get_by_label('負荷記錄方式',exact=True).is_visible()
        page.get_by_role('button',name='關閉',exact=True).click()
        assert not errors,errors
        browser.close()
        print('PASS: front/back roles, excluded coverage, non-interactive map, source chips, exact variable sets, assistance/plates, disclosed notes, all catalog diagrams, unique SVG IDs, 320/412px 200%')
finally: server.shutdown()
