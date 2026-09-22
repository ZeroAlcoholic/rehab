import { el, button, field, modal } from "./dom.js";

export function openSettings({
  settings,
  defaultClientId = "",
  connected,
  onPrepare,
  onConnect,
  onDisconnect,
  onCreate,
  onList,
  onBind,
  onExport,
  onImport,
}) {
  const view = modal("資料設定");
  let bound = Boolean(settings.sheetId);
  let authorizing = false, prepared = false, cloudConnected = connected;
  const effectiveClientId = settings.clientId || defaultClientId;
  const clientId = el("input", {
    type: "text",
    value: effectiveClientId,
    autocomplete: "off",
    spellcheck: "false",
    placeholder: "…apps.googleusercontent.com",
  });
  const status = el(
    "p",
    { class: "muted", role: "status" },
    connected ? "Google 已連線" : "Google 尚未連線",
  );
  const connect = button(
    "連線 Google",
    () =>
      run(connect, async () => {
        enableCloud(false);
        status.textContent = '請在 Google 登入視窗完成授權，再回到這裡。';
        await onConnect(clientId.value.trim());
        status.textContent = "Google 已連線";
        enableCloud(true);
      }, {authorization:true}),
    { class: "primary", disabled: true },
  );
  const create = button(
    "建立私人試算表",
    () =>
      run(create, async () => {
        const file = await onCreate();
        bound = true;
        status.textContent = `已建立並綁定：${file.name}`;
      }),
    { class: "secondary", disabled: !connected || bound },
  );
  const options = el("select", { "aria-label": "選擇既有試算表" });
  const bind = button(
    "載入選取的試算表",
    () =>
      run(bind, async () => {
        if (!options.value) throw new Error("請先選取試算表。");
        await onBind(options.value);
        bound = true;
        status.textContent = "已載入試算表";
        create.disabled = true;
      }),
    { class: "secondary", disabled: !connected },
  );
  const list = button(
    "尋找既有試算表",
    () =>
      run(list, async () => {
        const files = await onList();
        options.replaceChildren(
          ...files.map((f) => el("option", { value: f.id }, f.name)),
        );
        status.textContent = files.length
          ? "選取之前由此程式建立的試算表。"
          : "此帳號尚未找到可存取的試算表。";
      }),
    { class: "secondary", disabled: !connected },
  );
  function enableCloud(value) {
    cloudConnected = value;
    create.disabled = !value || bound;
    list.disabled = !value;
    bind.disabled = !value;
  }
  async function run(control, action, {authorization = false} = {}) {
    if (authorizing) return;
    const locked = authorization ? [...view.dialog.querySelectorAll('button,input,select,textarea')]
      .map(node=>({node,disabled:node.disabled})) : [];
    const preventClose = event => {event.preventDefault();event.stopImmediatePropagation();};
    if (authorization) {
      authorizing = true;
      locked.forEach(({node})=>{node.disabled=true;});
      view.dialog.addEventListener('cancel',preventClose,true);
    }
    control.disabled = true;
    view.error.textContent = "";
    try {
      await action();
    } catch (error) {
      view.error.textContent = error.message;
      if (authorization) status.textContent = 'Google 連線未完成，請查看下方原因。';
      view.error.tabIndex = -1;
      view.error.focus();
    } finally {
      if (authorization) {
        authorizing = false;
        locked.forEach(({node,disabled})=>{node.disabled=disabled;});
        view.dialog.removeEventListener('cancel',preventClose,true);
        enableCloud(cloudConnected);
      }
      control.disabled = control === create && bound;
      if (control === connect) connect.disabled = !prepared;
    }
  }
  const prepare = button(
    "儲存設定並準備授權",
    () =>
      run(prepare, async () => {
        const requestedId = clientId.value.trim();
        connect.disabled = true;
        prepared = false;
        await onPrepare(requestedId);
        if (clientId.value.trim() !== requestedId) return;
        prepared = true;
        connect.disabled = false;
        status.textContent = "已準備，可按連線 Google。";
      }),
    { class: "secondary" },
  );
  const download = button(
    "匯出備份",
    () =>
      run(download, async () => {
        const text = await onExport(),
          url = URL.createObjectURL(
            new Blob([text], { type: "application/json" }),
          ),
          link = el("a", {
            href: url,
            download: `training-backup-${new Date().toISOString().slice(0, 10)}.json`,
          });
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }),
    { class: "secondary" },
  );
  const upload = el("input", {
    type: "file",
    accept: ".json,application/json",
    "aria-label": "匯入 JSON 備份",
    onChange: async (e) => {
      view.error.textContent = "";
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > 10_000_000)
          throw new Error("備份超過 10 MB，請檢查檔案。");
        await onImport(await file.text());
        status.textContent = "備份已合併；尚未確認雲端的版本會保持待同步。";
      } catch (error) {
        view.error.textContent = error.message;
      } finally {
        upload.value = "";
      }
    },
  });
  clientId.addEventListener('input',()=>{
    prepared = false;
    connect.disabled = true;
    onDisconnect();
    enableCloud(false);
    status.textContent = '設定已變更，請先按「儲存設定並準備授權」。';
  });
  view.body.append(
    el("h3", {}, "Google 連線"),
    el(
      "p",
      { class: "muted" },
      "只存取由此程式建立或已授權的檔案。首次需完成 Google Cloud 設定。",
    ),
    el(
      "a",
      { href: "./docs/start.html", target: "_blank", rel: "noopener" },
      "開啟設定指南",
    ),
    field("Google 用戶端 ID", clientId),
    prepare,
    connect,
    button(
      "中斷 Google 連線",
      () => {
        onDisconnect();
        enableCloud(false);
        status.textContent = "已中斷連線；手機資料仍保留。";
      },
      { class: "quiet" },
    ),
    status,
    view.error,
    el("h3", {}, "私人試算表"),
    settings.sheetId
      ? el(
          "p",
          { class: "muted" },
          "此手機已綁定一份資料檔，避免誤將紀錄寫到另一份。",
        )
      : el(
          "p",
          { class: "muted" },
          "首次使用請建立；換機時請尋找並載入原本的試算表。",
        ),
    create,
    list,
    options,
    bind,
    el("h3", {}, "獨立備份"),
    el(
      "p",
      { class: "muted" },
      "匯出所有版本，不包含 Google 權杖。匯入會驗證後合併，不取代現有紀錄。",
    ),
    download,
    field("匯入 JSON 備份", upload),
  );
  if (effectiveClientId)
    run(prepare, async () => {
      await onPrepare(effectiveClientId);
      if (clientId.value.trim() !== effectiveClientId) return;
      prepared = true;
      connect.disabled = false;
    }).catch(() => {});
}
