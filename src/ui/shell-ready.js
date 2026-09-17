// The starter must not import application modules before its cached shell is ready.
function ask(worker, type) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (error, value) => {
      clearTimeout(timer);
      channel.port1.close();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('更新尚未完成，請連線後再試。原有紀錄保留。')), 10000);
    channel.port1.onmessage = event => finish(null, event.data);
    worker.postMessage({type}, [channel.port2]);
  });
}

function waitFor(worker, condition, container = null) {
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', check);
      container?.removeEventListener('controllerchange', check);
      error ? reject(error) : resolve();
    };
    const check = () => {
      if (worker.state === 'redundant') finish(new Error('新版下載失敗，請連線後重試。原有紀錄保留。'));
      else if (condition()) finish();
    };
    const timer = setTimeout(() => finish(new Error('更新尚未完成，請稍後重試。原有紀錄保留。')), 30000);
    worker.addEventListener('statechange', check);
    container?.addEventListener('controllerchange', check);
    check();
  });
}

export async function ensureCurrentShell() {
  if (!('serviceWorker' in navigator)) throw new Error('請使用支援離線功能的 Chrome／Edge 開啟。');
  const container = navigator.serviceWorker;
  const script = new URL('../../sw.js', import.meta.url);
  const registration = await container.register(script, {updateViaCache:'none'});
  await registration.update();
  if (registration.installing) {
    const installing = registration.installing;
    await waitFor(installing, () => ['installed','activated'].includes(installing.state));
  }
  const worker = registration.waiting ?? registration.active;
  if (!worker) throw new Error('離線程式尚未就緒，請連線後重試。');
  if (registration.waiting) {
    const result = await ask(worker, 'ACTIVATE_FROM_STARTER');
    if (!result.ready) throw new Error('請先儲存並關閉這個網站的其他分頁，再按「重試」。原有紀錄保留。');
  }
  await waitFor(worker, () => worker.state === 'activated' && container.controller === worker, container);
  const info = await ask(container.controller, 'SHELL_INFO');
  if (!info.rehabRecords) throw new Error('目前程式尚不支援這份資料，請更新後重試。');
}
