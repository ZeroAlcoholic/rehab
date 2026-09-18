"""A sync tap must lead to usable setup; mobile help works under a project path and offline."""
from pathlib import Path
import functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Handler(http.server.SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path.startswith('/rehab/') : self.path=self.path[len('/rehab'):]
  super().do_GET()
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='chrome',headless=True)
  ctx=browser.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True)
  page=ctx.new_page();page.set_default_timeout(5000);errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  url=f'http://127.0.0.1:{server.server_port}/rehab/'
  page.goto(url);page.locator('#sync').click()
  page.get_by_role('dialog',name='資料設定').wait_for()
  assert page.get_by_label('Google 用戶端 ID',exact=True).is_visible()
  assert not page.locator('#notice.error').count()
  with page.expect_popup() as info:page.get_by_role('link',name='開啟設定指南',exact=True).click()
  help=info.value;help.wait_for_load_state()
  assert help.url==url+'docs/start.html'
  assert help.get_by_role('heading',name='先設定一次，之後用手機記錄。',exact=True).is_visible()
  help.get_by_text('交給設定者：Google 要填什麼',exact=True).click()
  assert help.get_by_text('Web application',exact=True).is_visible()
  help.locator('details').evaluate_all('nodes=>nodes.forEach(node=>node.open=true)')
  for width in [320,412,1100]:
   help.set_viewport_size({'width':width,'height':915})
   for size in ['100%','200%']:
    help.evaluate('(s)=>document.documentElement.style.fontSize=s',size)
    assert help.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,size)
  help.set_viewport_size({'width':412,'height':915});help.evaluate("document.documentElement.style.fontSize='100%'")
  help.locator('details').evaluate_all('nodes=>nodes.forEach(node=>node.open=false)')
  help.evaluate('scrollTo(0,0)')
  help.screenshot(path=str(ROOT/'artifacts/setup-guide-phone.png'))
  help.close();page.get_by_role('button',name='關閉',exact=True).click()
  page.evaluate('navigator.serviceWorker.ready');page.reload();page.wait_for_function('navigator.serviceWorker.controller!==null')
  ctx.set_offline(True)
  page.goto(url+'docs/start.html')
  assert page.get_by_role('heading',name='先設定一次，之後用手機記錄。',exact=True).is_visible()
  page.get_by_role('link',name='回到練習誌',exact=True).click()
  page.locator('#record').click();page.get_by_label('第 1 組重量').fill('20');page.get_by_label('第 1 組次數').fill('10')
  page.get_by_role('button',name='儲存紀錄',exact=True).click();page.locator('dialog[open]').wait_for(state='hidden')
  page.reload();assert page.locator('#history .record').count()==1
  assert not errors,errors
  browser.close()
  print('PASS: sync routes to setup, rendered mobile guide and return link under project path, 320/412/1100px 200%, offline help and training save')
finally:server.shutdown()
