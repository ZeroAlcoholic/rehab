import { qualityEditor } from "./record-quality.js";
import { displayRecordText, recordTextValue } from "./record-text.js";
import { INBODY_FIELDS } from "../domain/catalog.js";
import { el, field, modal, submit, localDate, numberInput } from "./dom.js";

export function openInbody({ data = null, editing = false, onSave }) {
  const view = modal(editing ? "修改 InBody" : "記錄 InBody"),
    form = el("form");
  const quality = qualityEditor("inbody", data ?? {});
  const date = el("input", {
    type: "date",
    required: true,
    value: data?.date ?? localDate(),
  });
  const time = el("input", {type:"time", value:data?.time ?? ""});
  const device = el("input", {type:"text",maxlength:2000,value:displayRecordText(data?.measurementContext?.device ?? ""),placeholder:"例如：A 館 InBody 270"});
  const conditions = el("textarea", {"aria-label":"量測條件（選填）",rows:2,maxlength:2000}, displayRecordText(data?.measurementContext?.conditions ?? ""));
  const controls = [...INBODY_FIELDS]
    .sort((a, b) => Number(!!a.optional) - Number(!!b.optional))
    .map((f) => ({
      field: f,
      input: numberInput(data?.metrics?.[f.id]),
    }));
  const note = el(
    "textarea",
    {
      "aria-label": "備註",
      rows: 3,
      maxlength: 10000,
      placeholder: "量測條件、報告上的其他項目",
    },
    displayRecordText(data?.note ?? ""),
  );
  const core = new Set(["weight", "skeletal_muscle_mass", "body_fat_mass", "body_fat_percentage"]);
  const inputs = (items) => items.map(({field:f,input})=>field(`${f.label}${f.unit ? `（${f.unit}）` : ""}`, input));
  form.append(
    el(
      "p",
      { class: "muted" },
      "依報告填入數值。沒有的項目留白，不由其他數值推算。",
    ),
    el("div", {class:"form-grid"}, field("日期", date), field("時間（台灣時間，選填）", time)),
    el(
      "div",
      { class: "form-grid" },
      inputs(controls.filter(c=>core.has(c.field.id))),
    ),
    el("details", {}, el("summary", {}, "其他報告欄位（選填）"), el("div",{class:"form-grid"},inputs(controls.filter(c=>!core.has(c.field.id))))),
    field("量測機型／地點（選填）", device),
    field("量測條件（選填）", conditions),
    field("備註", note),
    quality.element,
    el("button", { type: "submit", class: "primary wide" }, "儲存 InBody"),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit(view, () =>
      onSave({
        ...quality.value(),
        date: date.value,
        ...(time.value || data?.time !== undefined ? {time:time.value} : {}),
        ...(device.value || conditions.value || data?.measurementContext !== undefined ? {
          measurementContext: {
            device: recordTextValue(data?.measurementContext?.device, device.value),
            conditions: recordTextValue(data?.measurementContext?.conditions, conditions.value),
          },
        } : {}),
        metrics: Object.fromEntries(
          controls.map(({ field: f, input }) => [
            f.id,
            input.value === "" ? null : Number(input.value),
          ]),
        ),
        note: recordTextValue(data?.note, note.value),
      }),
    );
  });
  view.body.append(form);
}
