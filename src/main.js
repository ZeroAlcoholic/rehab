import { openRepository } from "./storage/repository.js";
import { createService } from "./app/service.js";
import { createAuth } from "./google/auth.js";
import { readDefaultClientId } from "./google/config.js";
import { createSheets } from "./google/sheets.js";
import { createSyncEngine } from "./sync/engine.js";
import { analyze } from "./domain/analytics.js";
import { openTraining } from "./ui/training.js";
import { renderTrainingDay } from "./ui/training-day.js";
import { openInbody } from "./ui/inbody.js";
import { renderDashboard } from "./ui/dashboard.js";
import { renderHistory } from "./ui/history.js";
import { openSettings } from "./ui/settings.js";
import { renderEquipmentShortcuts } from "./ui/equipment-shortcuts.js";
import { localDate } from "./ui/dom.js";
import { startFromEquipment } from "./domain/training-template.js";
import {openSymptom,openRehabPlan} from './ui/rehab-form.js';

const initialRange = new URL(location.href).searchParams.get("range");
if (["30", "56", "0"].includes(initialRange))
  document.querySelector("#range").value = initialRange;
const notice = document.querySelector("#notice"),
  status = document.querySelector("#sync-status"),
  syncButton = document.querySelector("#sync");
// Native text zoom can wrap the sticky navigation; anchors need its actual height.
const navigation = document.querySelector('.dashboard-nav');
const updateScrollOffset = () => document.documentElement.style.setProperty(
  '--section-scroll-offset', `${Math.ceil(navigation.getBoundingClientRect().height) + 12}px`,
);
new ResizeObserver(updateScrollOffset).observe(navigation);
navigation.addEventListener('click', updateScrollOffset);
updateScrollOffset();
function message(text, error = false) {
  notice.textContent = text;
  notice.classList.toggle("error", error);
}
try {
  const repository = await openRepository(),
    service = createService(repository),
    auth = createAuth();
  const remote = createSheets({ getToken: () => auth.token() }),
    engine = createSyncEngine({ repository, remote });
  const channel = globalThis.BroadcastChannel
    ? new BroadcastChannel("rehab-log-updates")
    : null;
  let state,
    busy = false,
    renderVersion = 0;
  async function render() {
    const version = ++renderVersion,
      next = await service.read();
    if (version !== renderVersion) return;
    state = next;
    const pending = state.pending.length;
    status.textContent = busy
      ? "正在同步…"
      : pending
        ? '已存手機 · 待同步'
        : state.settings.sheetId
          ? `已同步紀錄${auth.isConnected() ? "" : " · Google 待連線"}`
          : "僅存手機 · 尚未設定雲端";
    if (!navigator.onLine) status.textContent += " · 離線";
    showEquipment();
    renderTrainingDay(document.querySelector('#training-day'), state.records, {onEdit: edit, conflicts: state.conflicts});
    const days = Number(document.querySelector("#range").value),
      to = localDate(),
      from = days
        ? localDate(
            new Date(Date.parse(`${to}T00:00:00+08:00`) - (days - 1) * 86400000),
          )
        : "1900-01-01";
    renderDashboard(
      document.querySelector("#dashboard"),
      analyze(state.records, { from, to, inbodyFrom: null }),
      {onSymptom:()=>openSymptom({onSave:data=>save('rehab',data)}),onPlan:editPlan,onExercise:recordPlanned,onRepeat:repeat,onFindEquipment:findEquipment},
    );
    renderHistory(document.querySelector("#history"), {
      records: state.records,
      conflicts: state.conflicts,
      onEdit: edit,
      onRepeat: repeat,
      onDelete: remove,
      onResolve: resolve,
    });
    document.querySelector("#last-sync").textContent = state.lastSync
      ? `上次確認雲端：${new Date(state.lastSync).toLocaleString("zh-TW")}`
      : "尚未確認雲端同步";
  }
  async function changed(text) {
    await render();
    channel?.postMessage("changed");
    if (text) message(text);
  }
  async function sync() {
    if (busy) return;
    busy = true;
    syncButton.disabled = true;
    status.textContent = "正在同步…";
    try {
      await engine.run();
      await changed("已讀回並確認雲端資料。");
    } catch (error) {
      if (error.code === "auth") auth.disconnect();
      message(error.message, true);
    } finally {
      busy = false;
      syncButton.disabled = false;
      await render();
    }
  }
  async function autoSync() {
    if (
      document.visibilityState === "visible" &&
      navigator.onLine &&
      auth.isConnected() &&
      state?.settings.sheetId
    )
      await sync();
  }
  async function save(kind, data, options) {
    await service.save(kind, data, options);
    if (kind === 'training') document.querySelector('#training-day').dataset.date = data.date;
    await changed("已存手機。");
    void autoSync();
  }
  function edit(record) {
    const open = record.kind === 'rehab' ? (record.data.type==='plan'?openRehabPlan:openSymptom) : record.kind === "training" ? openTraining : openInbody;
    open({
      data: record.data,
      editing: true,
      onSave: (data) =>
        save(record.kind, data, {
          recordId: record.recordId,
          parents: [record.eventId],
        }),
    });
  }
  function repeat(record) {
    openTraining({data:startFromEquipment(record.data,localDate()),reference:record.data,repeating:true,quick:true,onSave:(data)=>save("training",data)});
  }
  function showEquipment(regionId) {
    renderEquipmentShortcuts(document.querySelector('#equipment-shortcuts'),state.records,{onSelect:repeat,regionId});
  }
  function findEquipment(regionId) {
    showEquipment(regionId);
    const target = document.querySelector('#equipment-shortcuts select');
    target?.focus({preventScroll:true});
    document.querySelector('#entry').scrollIntoView({block:'start'});
  }
  function editPlan(){
    const plan=state.records.filter(r=>r.kind==='rehab'&&r.data.type==='plan').at(-1);
    if(plan)edit(plan);else openRehabPlan({onSave:data=>save('rehab',data)});
  }
  function recordPlanned(exerciseId){
    const old=state.records.filter(r=>r.kind==='training'&&r.data.exerciseId===exerciseId&&!r.data.analysisExcludedReason).at(-1);
    if(old){repeat(old);return;}
    openTraining({data:{date:localDate(),exerciseId,machine:'',unit:'kg',sets:[{load:null,reps:null}],pain:'unknown',technique:'unknown',note:''},onSave:data=>save('training',data)});
  }
  async function remove(record) {
    if (!confirm("刪除這筆紀錄？刪除狀態也會同步；歷史版本仍保留在備份。"))
      return;
    try {
      await service.remove(record.recordId, [record.eventId]);
      await changed("已儲存刪除狀態。");
      void autoSync();
    } catch (error) {
      message(error.message, true);
    }
  }
  async function resolve(conflict, version) {
    try {
      const parents = conflict.versions.map((e) => e.id);
      if (version.deleted) await service.remove(conflict.recordId, parents);
      else
        await service.save(version.kind, version.data, {
          recordId: conflict.recordId,
          parents,
        });
      await changed("已儲存選擇的版本。");
      void autoSync();
    } catch (error) {
      message(error.message, true);
    }
  }
  document
    .querySelector("#record")
    .addEventListener("click", () =>
      openTraining({ onSave: (data) => save("training", data) }),
    );
  document
    .querySelector("#inbody")
    .addEventListener("click", () =>
      openInbody({ onSave: (data) => save("inbody", data) }),
    );
  document
    .querySelector("#range")
    .addEventListener("change", () =>
      render().catch((e) => message(e.message, true)),
    );
  syncButton.addEventListener("click", () => {
    if (!auth.isConnected() || !state.settings.sheetId) {
      document.querySelector("#settings").click();
      return;
    }
    void sync();
  });
  document.querySelector("#settings").addEventListener("click", () =>
    openSettings({
      settings: state.settings,
      defaultClientId: readDefaultClientId(),
      connected: auth.isConnected(),
      onPrepare: async (id) => {
        await service.setClientId(id);
        await changed();
        await auth.prepare(id);
      },
      onConnect: async (id) => {
        await auth.connect(id);
        await changed("Google 已連線。");
        void autoSync();
      },
      onDisconnect: () => {
        auth.disconnect();
        void render();
      },
      onCreate: async () => {
        if (state.settings.sheetId) throw new Error("目前已綁定試算表。");
        const file = await remote.create();
        await service.bind(file.id, await remote.read(file.id));
        await changed();
        await sync();
        return file;
      },
      onList: () => remote.list(),
      onBind: async (id) => {
        await service.bind(id, await remote.read(id));
        await changed();
        await sync();
      },
      onExport: () => service.exportBackup(),
      onImport: async (text) => {
        await service.importBackup(text);
        await changed();
        void autoSync();
      },
    }),
  );
  channel?.addEventListener("message", () =>
    render().catch((e) => message(e.message, true)),
  );
  window.addEventListener("online", () => {
    void render();
    void autoSync();
  });
  window.addEventListener("offline", () => void render());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void render();
      void autoSync();
    }
  });
  await render();
  document
    .querySelectorAll("[data-startup]")
    .forEach((button) => (button.disabled = false));
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("./sw.js")
      .catch(() =>
        message(
          "離線功能尚未準備完成；本機紀錄仍可儲存，下次連線後再試。",
          true,
        ),
      );
  const install = document.querySelector("#install");
  let installPrompt;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    install.hidden = false;
  });
  install.addEventListener("click", async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      installPrompt = null;
      install.hidden = true;
    }
  });
} catch (error) {
  message(error.message || "程式無法開啟，請重新載入。", true);
}
