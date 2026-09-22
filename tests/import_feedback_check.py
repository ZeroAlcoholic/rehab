"""Visible import outcomes, repeat imports, validation errors and navigation with synthetic data."""
from pathlib import Path
import functools,http.server,threading,json
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(viewport={'width':412,'height':915})
        page.route('https://accounts.google.com/**',lambda r:r.fulfill(content_type='application/javascript',body="window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'fixture',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})})}}};"))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        backup=page.evaluate("""async()=>{const {makeEvent}=await import('./src/domain/journal.js');return JSON.stringify({format:'rehab-log-backup',schemaVersion:1,sourceSheetId:'',events:[makeEvent({kind:'training',data:{date:'2026-01-01',exerciseId:'chest_press',machine:'fixture',unit:'kg',sets:[{load:20,reps:10}],pain:'unknown',technique:'unknown',note:''}})]});}""")
        page.locator('#settings').click()
        upload=page.get_by_label('匯入 JSON 備份',exact=True)
        for _ in range(2):
            upload.set_input_files({'name':'fixture.json','mimeType':'application/json','buffer':backup.encode()})
            result=page.get_by_role('status',name='備份匯入結果',exact=True)
            expect(result).to_contain_text('目前共 1 筆紀錄')
            assert result.evaluate('n=>n===document.activeElement')
            box=result.bounding_box();assert 0<=box['y'] and box['y']+box['height']<=915
            expect(upload).to_be_enabled()
        page.get_by_role('button',name='查看紀錄',exact=True).click()
        assert page.locator('dialog[open]').count()==0
        assert page.locator('.history-archive').evaluate('n=>n.open')
        assert page.locator('#history .record:visible').count()==1
        page.locator('#settings').click()
        upload.set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'not-json'})
        error=page.get_by_role('alert',name='備份匯入結果',exact=True)
        expect(error).to_contain_text('無法讀取 JSON')
        assert error.evaluate('n=>n===document.activeElement')
        assert page.get_by_role('button',name='查看紀錄',exact=True).is_hidden()
        expect(upload).to_be_enabled()
        page.context.set_offline(True)
        page.get_by_role('button',name='連線 Google',exact=True).click()
        expect(page.get_by_role('button',name='建立私人試算表',exact=True)).to_be_enabled()
        bound=json.loads(backup);bound['sourceSheetId']='fixture-bound-sheet'
        upload.set_input_files({'name':'bound.json','mimeType':'application/json','buffer':json.dumps(bound).encode()})
        expect(page.get_by_role('status',name='備份匯入結果',exact=True)).to_contain_text('目前共 1 筆紀錄')
        # Restoring a bound backup must update the same open settings dialog.
        assert page.get_by_role('button',name='建立私人試算表',exact=True).is_disabled()
        wrong=json.loads(backup);wrong['sourceSheetId']='other-sheet'
        upload.set_input_files({'name':'other.json','mimeType':'application/json','buffer':json.dumps(wrong).encode()})
        expect(page.get_by_role('alert',name='備份匯入結果',exact=True)).to_contain_text('另一份試算表')
        count=page.evaluate("async()=>{const {openRepository}=await import('./src/storage/repository.js');return (await (await openRepository()).read()).events.length;}")
        assert count==1
        print('PASS: import count and focused visible result, duplicate import remains one record, direct history view, malformed/wrong-sheet errors preserve data')
        browser.close()
finally:server.shutdown()
