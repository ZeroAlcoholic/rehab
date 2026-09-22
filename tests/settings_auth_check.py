"""Settings concurrency/error visibility using controlled GIS; no real account."""
from pathlib import Path
import functools,http.server,threading
from playwright.sync_api import sync_playwright, expect
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
        assert 'Google 登入視窗' in page.locator('dialog [data-connection-status]').inner_text()
        for name in ['儲存設定並準備授權','中斷 Google 連線','關閉']:
            assert page.get_by_role('button',name=name,exact=True).is_disabled(),name
        assert page.get_by_label('Google 用戶端 ID',exact=True).is_disabled()
        page.keyboard.press('Escape')
        assert page.locator('dialog[open]').count()==1
        page.evaluate("window.authConfig.error_callback({type:'popup_closed'})")
        expect(connect).to_be_enabled()
        assert page.get_by_role('button',name='關閉',exact=True).is_enabled()
        error=page.locator('dialog [role=alert]')
        assert '視窗已關閉' in error.inner_text()
        box=error.bounding_box()
        assert 0<=box['y'] and box['y']+box['height']<=915,'Auth error must be visible without searching below settings'
        assert error.evaluate('n=>n===document.activeElement')
        connect.click()
        page.evaluate("window.authConfig.callback({error:'access_denied'})")
        expect(connect).to_be_enabled()
        assert 'access_denied' in error.inner_text()
        assert page.evaluate('window.authRequests')==2
        connect.click()
        page.evaluate("window.authConfig.callback({access_token:'fixture',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})")
        page.get_by_text('Google 已連線',exact=True).wait_for()
        assert page.get_by_role('button',name='已連線',exact=True).is_disabled()
        assert page.get_by_role('button',name='建立私人試算表',exact=True).is_enabled()
        page.get_by_role('button',name='關閉',exact=True).click()
        # A restored session can be explicitly disconnected and reconnected immediately.
        page.reload()
        page.locator('#settings').click()
        assert page.get_by_role('button',name='已連線',exact=True).is_disabled()
        assert page.evaluate('window.authRequests || 0')==0
        assert page.get_by_role('button',name='建立私人試算表',exact=True).is_enabled()
        page.get_by_role('button',name='中斷 Google 連線',exact=True).click()
        page.get_by_role('button',name='連線 Google',exact=True).click()
        page.evaluate("window.authConfig.callback({access_token:'fixture',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})")
        # Expiry while settings stays open must restore a usable reconnect action.
        page.clock.install()
        page.clock.fast_forward(3600000)
        page.get_by_role('button',name='連線 Google',exact=True).wait_for()
        page.get_by_role('button',name='連線 Google',exact=True).click()
        page.evaluate("window.authConfig.callback({access_token:'fixture',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})")
        assert page.get_by_role('button',name='已連線',exact=True).is_disabled()
        page.get_by_role('button',name='中斷 Google 連線',exact=True).click()
        expect(page.get_by_role('button',name='連線 Google',exact=True)).to_be_enabled()
        page.get_by_role('button',name='關閉',exact=True).click()
        page.reload()
        page.locator('#settings').click()
        page.get_by_role('button',name='連線 Google',exact=True).click()
        page.evaluate("window.authConfig.callback({access_token:'fixture',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})")
        page.route('https://www.googleapis.com/drive/**',lambda route:route.fulfill(status=401,content_type='application/json',body='{}'))
        page.get_by_role('button',name='關閉',exact=True).click()
        page.reload()
        page.locator('#settings').click()
        page.get_by_role('button',name='尋找既有試算表',exact=True).click()
        expect(page.get_by_role('button',name='已連線',exact=True)).to_have_count(0)
        assert page.get_by_role('button',name='尋找既有試算表',exact=True).is_disabled()
        assert page.evaluate("Object.keys(sessionStorage).filter(k=>k.startsWith('rehab.google-session.')).length")==0
        page.get_by_role('button',name='連線 Google',exact=True).click()
        page.wait_for_function('window.authRequests === 1')
        page.evaluate("window.authConfig.callback({access_token:'fixture',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})")
        assert page.get_by_role('button',name='已連線',exact=True).is_disabled()
        page.get_by_role('button',name='中斷 Google 連線',exact=True).click()
        page.get_by_role('button',name='關閉',exact=True).click()
        page.reload()
        page.locator('#settings').click()
        page.get_by_role('button',name='連線 Google',exact=True).click()
        page.evaluate("window.authConfig.callback({access_token:'fixture',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})")
        page.get_by_label('Google 用戶端 ID',exact=True).fill('other.apps.googleusercontent.com')
        assert page.get_by_role('button',name='連線 Google',exact=True).is_disabled(),'Changing client must require fresh preparation'
        assert page.get_by_role('button',name='建立私人試算表',exact=True).is_disabled()
        assert page.get_by_role('button',name='尋找既有試算表',exact=True).is_disabled()
        page.get_by_role('button',name='關閉',exact=True).click()
        browser.close()
        print('PASS: auth gesture/lock/errors, connected button disabled, F5 resumes without popup, expiry/disconnect/401/client change reconnect correctly')
finally:server.shutdown()
