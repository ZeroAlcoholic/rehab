"""Settings concurrency/error visibility using controlled GIS; no real account."""
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
        browser=p.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(viewport={'width':412,'height':915},is_mobile=True,has_touch=True)
        page.route('https://accounts.google.com/gsi/client',lambda route:route.fulfill(content_type='application/javascript',body="""
          window.authRequests=0;
          window.google={accounts:{oauth2:{initTokenClient(config){window.authConfig=config;
            return {requestAccessToken(){window.authRequests++;window.authActiveGesture=navigator.userActivation.isActive;}};
          }}}};
        """))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.locator('#settings').click()
        connect=page.get_by_role('button',name='連線 Google',exact=True)
        connect.click()
        assert page.evaluate('window.authRequests')==1
        assert page.evaluate('window.authActiveGesture')
        assert 'Google 登入視窗' in page.locator('dialog [role=status]').inner_text()
        for name in ['儲存設定並準備授權','中斷 Google 連線','關閉']:
            assert page.get_by_role('button',name=name,exact=True).is_disabled(),name
        assert page.get_by_label('Google 用戶端 ID',exact=True).is_disabled()
        page.keyboard.press('Escape')
        assert page.locator('dialog[open]').count()==1
        page.evaluate("window.authConfig.error_callback({type:'popup_closed'})")
        assert connect.is_enabled()
        assert page.get_by_role('button',name='關閉',exact=True).is_enabled()
        error=page.locator('dialog [role=alert]')
        assert '視窗已關閉' in error.inner_text()
        box=error.bounding_box()
        assert 0<=box['y'] and box['y']+box['height']<=915,'Auth error must be visible without searching below settings'
        assert error.evaluate('n=>n===document.activeElement')
        connect.click()
        page.evaluate("window.authConfig.callback({error:'access_denied'})")
        assert 'access_denied' in error.inner_text()
        assert page.evaluate('window.authRequests')==2
        connect.click()
        page.evaluate("window.authConfig.callback({access_token:'fixture',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})")
        page.get_by_text('Google 已連線',exact=True).wait_for()
        assert page.get_by_role('button',name='建立私人試算表',exact=True).is_enabled()
        page.get_by_label('Google 用戶端 ID',exact=True).fill('other.apps.googleusercontent.com')
        assert connect.is_disabled(),'Changing client must require fresh preparation'
        assert page.get_by_role('button',name='建立私人試算表',exact=True).is_disabled()
        assert page.get_by_role('button',name='尋找既有試算表',exact=True).is_disabled()
        page.get_by_role('button',name='關閉',exact=True).click()
        browser.close()
        print('PASS: synchronous gesture, exclusive auth controls, Escape lock, visible focused errors, retry, success, edited client invalidates cloud UI')
finally:server.shutdown()
