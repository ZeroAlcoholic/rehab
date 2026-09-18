"""Real Chromium + IndexedDB + service worker checks; no real Google account."""
from pathlib import Path
import functools
import http.server
import json
import threading
from urllib.parse import urlsplit, parse_qs, unquote
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/rehab/'):
            self.path = self.path[len('/rehab'):]
        super().do_GET()
    def log_message(self, *args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/rehab/'
results=[]
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        context=browser.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True,device_scale_factor=2)
        page=context.new_page()
        errors=[]
        page.on('pageerror', lambda e: (errors.append(str(e)), print('BROWSER ERROR:',str(e),flush=True)))
        page.goto(url)
        page.get_by_role('button',name='其他器材',exact=True).click()
        page.get_by_role('combobox',name='動作',exact=True).select_option('chest_press')
        page.get_by_label('機台／場地識別').fill('健身房 A 胸推')
        page.get_by_role('combobox',name='單位',exact=True).select_option('lb')
        page.get_by_label('第 1 組重量').fill('65')
        page.get_by_label('第 1 組次數').fill('12')
        page.get_by_text('感受與備註（選填）',exact=True).click()
        page.get_by_role('combobox',name='疼痛',exact=True).select_option('none')
        page.get_by_role('combobox',name='動作狀況',exact=True).select_option('stable')
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.get_by_text('已存手機',exact=False).first.wait_for()
        page.reload()
        page.locator('.history-archive > summary').click()
        page.locator('#history').get_by_role('button',name='修改',exact=True).first.click()
        assert page.get_by_label('第 1 組重量').input_value()=='65'
        page.get_by_label('第 1 組次數').fill('11')
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        results.append('training create/reload/edit persists in real IndexedDB')

        page.locator('.equipment-shortcut').filter(has_text='健身房 A 胸推').click()
        assert page.get_by_label('第 1 組次數').input_value()==''
        page.get_by_label('第 1 組次數').fill('11')
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        assert page.locator('#history').get_by_role('button',name='修改',exact=True).count()==2
        results.append('equipment shortcut creates another record with actual reps required')

        page.get_by_role('button',name='記錄 InBody',exact=True).click()
        page.get_by_label('體重（kg）',exact=True).fill('70.5')
        page.get_by_role('button',name='儲存 InBody',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        snapshot=page.evaluate("""async()=>{ const {openRepository}=await import('./src/storage/repository.js'); return (await openRepository()).read(); }""")
        assert len(snapshot['events'])==4
        inbody=next(e['data']['metrics'] for e in snapshot['events'] if e['kind']=='inbody')
        assert inbody['weight']==70.5
        assert all(v is None for k,v in inbody.items() if k!='weight')
        results.append('InBody omitted measurements remain missing')

        page.get_by_role('button',name='資料設定',exact=True).click()
        with page.expect_download() as info:
            page.get_by_role('button',name='匯出備份',exact=True).click()
        backup=OUT/'browser-backup.json'
        info.value.save_as(backup)
        parsed=json.loads(backup.read_text(encoding='utf-8'))
        assert len(parsed['events'])==4
        page.get_by_label('匯入 JSON 備份').set_input_files(str(backup))
        page.get_by_text('備份已合併',exact=False).wait_for()
        page.get_by_role('button',name='關閉',exact=True).click()
        results.append('backup download and idempotent import through UI')

        page.evaluate('navigator.serviceWorker.ready')
        page.reload()
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        context.set_offline(True)
        page.reload()
        page.get_by_role('button',name='其他器材',exact=True).click()
        page.get_by_label('機台／場地識別').fill('離線 A')
        page.get_by_label('第 1 組重量').fill('20')
        page.get_by_label('第 1 組次數').fill('10')
        page.get_by_role('button',name='儲存紀錄',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        page.reload()
        page.locator('.history-archive > summary').click()
        assert page.locator('#history').get_by_role('button',name='修改',exact=True).count()==4
        results.append('project-subpath service worker offline reload + save')

        page.once('dialog',lambda d:d.accept())
        page.locator('#history').get_by_role('button',name='刪除',exact=True).first.click()
        page.wait_for_function("document.querySelectorAll('#history [data-action=edit]').length === 3")
        page.reload()
        page.locator('.history-archive > summary').click()
        assert page.locator('#history').get_by_role('button',name='修改',exact=True).count()==3
        results.append('deletion tombstone survives reload')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT/'android-width.png'),full_page=True)
        assert not errors,errors
        results.append('412px layout fits and no uncaught browser errors')

        # Exercise full UI -> GIS adapter -> sync -> Sheets adapter -> IndexedDB,
        # with only external Google responses controlled, never production code replaced.
        cloud={}
        gis="""window.google={accounts:{oauth2:{initTokenClient: options=>({requestAccessToken:()=>options.callback({access_token:'fixture-token',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})})}}};"""
        def google_route(route):
            request=route.request
            if request.url.startswith('https://accounts.google.com/'):
                route.fulfill(status=200,content_type='application/javascript',body=gis);return
            parsed_url=urlsplit(request.url)
            if parsed_url.path=='/drive/v3/files':
                result={'files':[{'id':'sheet-test','name':'個人訓練紀錄'}]}
            elif parsed_url.path.endswith('/v4/spreadsheets'):
                body=request.post_data_json
                for tab in body['sheets']:
                    cloud[tab['properties']['title']]=[[cell['userEnteredValue']['stringValue'] for cell in row['values']] for row in tab['data'][0]['rowData']]
                result={'spreadsheetId':'sheet-test','properties':{'title':'個人訓練紀錄'}}
            elif parsed_url.path.endswith('/values:batchGet'):
                names=[r.split('!')[0].strip("'") for r in parse_qs(parsed_url.query)['ranges']]
                result={'spreadsheetId':'sheet-test','valueRanges':[{'values':cloud[name]} for name in names]}
            elif parsed_url.path.endswith('/sheet-test'):
                result={'spreadsheetId':'sheet-test','sheets':[{'properties':{'sheetId':i,'title':name}} for i,name in enumerate(cloud)]}
            elif parsed_url.path.endswith(':batchUpdate'):
                requests=request.post_data_json['requests']
                assert len(requests)==3
                assert requests[0]['addSheet']['properties']['title']=='rehab_log'
                cloud['rehab_log']=[[v['userEnteredValue']['stringValue'] for v in requests[1]['updateCells']['rows'][0]['values']]]
                assert requests[2]['updateCells']['start']=={'sheetId':0,'rowIndex':2,'columnIndex':1}
                cloud['_meta'][2][1]='2'
                result={'spreadsheetId':'sheet-test'}
            elif parsed_url.path.endswith(':append'):
                assert parse_qs(parsed_url.query)['valueInputOption']==['RAW']
                tab=unquote(parsed_url.path.split('/values/')[1]).split('!')[0].strip("'")
                values=request.post_data_json['values']
                cloud[tab].extend(values)
                result={'spreadsheetId':'sheet-test','updates':{'updatedRows':len(values)}}
            else:
                raise AssertionError(request.url)
            route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
        def route_google(ctx):
            ctx.route('https://accounts.google.com/**',google_route)
            ctx.route('https://sheets.googleapis.com/**',google_route)
            ctx.route('https://www.googleapis.com/drive/**',google_route)
        def authorize(tab):
            tab.get_by_role('button',name='資料設定',exact=True).click()
            client_id = tab.get_by_label('Google 用戶端 ID',exact=True)
            assert client_id.input_value().endswith('.apps.googleusercontent.com')
            client_id.fill('test-client.apps.googleusercontent.com')
            tab.get_by_role('button',name='儲存設定並準備授權',exact=True).click()
            tab.get_by_role('button',name='連線 Google',exact=True).click()
            tab.get_by_text('Google 已連線',exact=True).wait_for()
        context.set_offline(False)
        route_google(context)
        authorize(page)
        page.get_by_role('button',name='建立私人試算表',exact=True).click()
        page.get_by_text('已建立並綁定：個人訓練紀錄',exact=True).wait_for()
        assert page.get_by_role('button',name='建立私人試算表',exact=True).is_disabled()
        page.get_by_role('button',name='關閉',exact=True).click()
        assert len(cloud['training_log'])==6 and len(cloud['inbody'])==2
        page.wait_for_function("document.querySelector('#sync-status').textContent.includes('已同步紀錄')")
        results.append('full Google UI boundary: authorization/create/upload/readback (controlled HTTP)')

        # Reload deliberately drops the in-memory token, but must retain the original binding.
        page.reload()
        page.locator('#sync').click()
        page.get_by_role('dialog',name='資料設定').wait_for()
        assert page.get_by_label('Google 用戶端 ID',exact=True).input_value()=='test-client.apps.googleusercontent.com'
        page.get_by_role('button',name='連線 Google',exact=True).click()
        page.get_by_text('Google 已連線',exact=True).wait_for()
        assert page.get_by_role('button',name='建立私人試算表',exact=True).is_disabled()
        page.get_by_role('button',name='關閉',exact=True).click()
        page.wait_for_function("document.querySelector('#sync-status').textContent.includes('已同步紀錄')")
        assert len(cloud['training_log'])==6 and len(cloud['inbody'])==2
        page.locator('.history-archive > summary').click()
        results.append('reload then sync opens reconnect; stored Client ID and original Sheet reused without duplicate records (controlled HTTP)')

        page.locator('.rehab-options > summary').click()
        page.get_by_role('button',name='記錄不適',exact=True).click()
        page.get_by_label('右坐骨附近',exact=True).check()
        page.get_by_label('疼痛分數（0–10，選填）',exact=True).fill('3')
        page.get_by_role('button',name='儲存狀況',exact=True).click()
        page.locator('dialog[open]').wait_for(state='hidden')
        page.wait_for_function("document.querySelector('#sync-status').textContent.includes('已同步紀錄')")
        assert cloud['_meta'][2][1]=='2' and len(cloud['rehab_log'])==2
        assert len(cloud['training_log'])==6 and len(cloud['inbody'])==2
        results.append('new symptom UI upgrades legacy Sheet and confirms appended rehab record without changing existing journals (controlled HTTP)')

        second=browser.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True)
        route_google(second)
        other=second.new_page()
        other.goto(url)
        authorize(other)
        other.get_by_role('button',name='尋找既有試算表',exact=True).click()
        other.get_by_label('選擇既有試算表',exact=True).select_option('sheet-test')
        other.get_by_role('button',name='載入選取的試算表',exact=True).click()
        other.get_by_text('已載入試算表',exact=True).wait_for()
        other.get_by_role('button',name='關閉',exact=True).click()
        other.locator('.history-archive > summary').click()
        assert other.locator('#history').get_by_role('button',name='修改',exact=True).count()==4
        restored=other.evaluate("async()=>{const {openRepository}=await import('./src/storage/repository.js');const {createService}=await import('./src/app/service.js');return createService(await openRepository()).read();}")
        symptom=next(r['data'] for r in restored['records'] if r['kind']=='rehab')
        assert symptom['score']==3 and symptom['locations']==['right_ischium']
        assert symptom['redFlags']['bladder_bowel']=='unknown'
        results.append('fresh browser profile restores from controlled Sheets responses')

        context.set_offline(True);second.set_offline(True)
        for tab,note in [(page,'裝置 A 修改'),(other,'裝置 B 修改')]:
            tab.locator('#history .record').filter(has_text='胸推').first.get_by_role('button',name='修改',exact=True).click()
            tab.locator('dialog').wait_for()
            if not tab.locator('.training-observations').evaluate('n=>n.open'):
                tab.get_by_text('感受與備註（選填）',exact=True).click()
            tab.get_by_label('備註',exact=True).fill(note)
            tab.get_by_role('button',name='儲存紀錄',exact=True).click()
            tab.locator('dialog[open]').wait_for(state='hidden')
        context.set_offline(False)
        page.get_by_role('button',name='同步',exact=True).click()
        page.wait_for_function("document.querySelector('#sync-status').textContent.includes('已同步紀錄')")
        second.set_offline(False)
        other.get_by_role('button',name='同步',exact=True).click()
        other.get_by_text('這筆紀錄有不同版本',exact=True).wait_for()
        other.locator('.conflict-version').filter(has_text='裝置 B 修改').get_by_role('button',name='保留這個版本',exact=True).click()
        other.get_by_text('這筆紀錄有不同版本',exact=True).wait_for(state='hidden')
        other.get_by_role('button',name='同步',exact=True).click()
        other.wait_for_function("document.querySelector('#sync-status').textContent.includes('已同步紀錄')")
        page.get_by_role('button',name='同步',exact=True).click()
        page.locator('#history .record').filter(has_text='裝置 B 修改').wait_for()
        assert page.locator('.conflict').count()==0
        results.append('two isolated profiles retain divergent edits and resolve via UI (controlled HTTP)')
        added=page.evaluate("""async()=>{
          const {openRepository}=await import('./src/storage/repository.js');
          const {createService}=await import('./src/app/service.js');
          const a=await openRepository(), b=await openRepository();
          const before=await a.read();
          const data=before.events.find(e=>e.kind==='training'&&!e.deleted).data;
          await Promise.all([createService(a).save('training',{...data,note:'parallel A'}),createService(b).save('training',{...data,note:'parallel B'})]);
          const after=await a.read();return after.events.length-before.events.length;
        }""")
        assert added==2
        results.append('simultaneous IndexedDB connections preserve both committed writes')
        page.evaluate("document.documentElement.style.fontSize='200%'")
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.get_by_role('button',name='其他器材',exact=True).click()
        assert page.locator('dialog').evaluate('(d)=>d.scrollWidth <= d.clientWidth')
        page.screenshot(path=str(OUT/'android-large-text.png'))
        page.get_by_role('button',name='關閉',exact=True).click()
        results.append('200% root text enlargement fits page and training dialog at 412px')
        assert not errors,errors
        browser.close()
    (OUT/'browser-results.json').write_text(json.dumps({'checks':results,'google':'not tested with real account','device':'Edge Chromium Android viewport; not Android hardware'},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(results,ensure_ascii=False))
finally:
    server.shutdown()
