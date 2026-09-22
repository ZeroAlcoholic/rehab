"""Real dialog submission: duplicate events, lock, failure recovery, original disabled states."""
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
        page=browser.new_page()
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.evaluate("""async()=>{
          const {modal,el,submit}=await import('./src/ui/dom.js');
          const view=modal('測試儲存失敗');
          window.submitView=view;
          view.body.append(el('input',{'aria-label':'測試輸入',value:'保留內容'}),
            el('button',{disabled:true},'原先停用'),el('button',{},'原先啟用'));
          window.calls=0;
          const action=()=>{window.calls++;return new Promise((resolve,reject)=>{window.rejectSave=reject;});};
          window.firstSave=submit(view,action);
          window.secondSave=submit(view,action);
        }""")
        assert page.evaluate('window.calls')==1, 'Repeated submit must not invoke the save action twice'
        assert page.get_by_label('測試輸入').is_disabled()
        page.keyboard.press('Escape')
        assert page.locator('dialog[open]').count()==1
        page.evaluate("async()=>{window.rejectSave(new Error('測試儲存失敗'));await window.firstSave;await window.secondSave;}")
        assert page.get_by_label('測試輸入').input_value()=='保留內容'
        assert page.get_by_label('測試輸入').is_enabled()
        assert page.get_by_role('button',name='原先停用',exact=True).is_disabled()
        assert page.get_by_role('button',name='原先啟用',exact=True).is_enabled()
        assert page.locator('dialog [role=alert]').inner_text()=='測試儲存失敗'
        page.evaluate("""async()=>{
          const {submit}=await import('./src/ui/dom.js');
          await submit(window.submitView,async()=>{window.calls++;});
        }""")
        assert page.evaluate('window.calls')==2
        page.locator('dialog[open]').wait_for(state='hidden')
        browser.close()
        print('PASS: single save, immutable pending input, Escape lock, visible failure, input retained, disabled state restored, successful retry')
finally: server.shutdown()
