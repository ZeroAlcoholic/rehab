export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on"))
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "value") node.value = value;
    else if (key === "checked" || key === "disabled") node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return node;
}
export const button = (text, onClick, attrs = {}) =>
  el("button", { type: "button", onClick, ...attrs }, text);
export function field(text, input) {
  return el("label", { class: "field" }, el("span", {}, text), input);
}
export function select(options, value, attrs = {}) {
  const node = el(
    "select",
    attrs,
    options.map(([id, label]) => el("option", { value: id }, label)),
  );
  node.value = value;
  return node;
}
export function modal(title) {
  const dialog = el("dialog", { "aria-label": title }),
    body = el("div", { class: "dialog-body" }),
    error = el("p", { class: "error", role: "alert" });
  dialog.append(
    el(
      "header",
      { class: "dialog-header" },
      el("h2", {}, title),
      button("關閉", () => dialog.close(), { class: "quiet" }),
    ),
    body,
    error,
  );
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body, error, close: () => dialog.close() };
}
const submitting = new WeakSet();
export async function submit(dialog, action) {
  if (submitting.has(dialog.dialog)) return;
  submitting.add(dialog.dialog);
  const controls = [...dialog.dialog.querySelectorAll('button,input,select,textarea')]
    .map(control => ({control, disabled: control.disabled}));
  const preventClose = event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  dialog.dialog.addEventListener('cancel', preventClose, true);
  controls.forEach(({control}) => (control.disabled = true));
  dialog.error.textContent = "";
  try {
    await action();
    dialog.close();
  } catch (error) {
    dialog.error.textContent = error.message;
    dialog.error.tabIndex = -1;
    dialog.error.focus();
  } finally {
    controls.forEach(({control, disabled}) => (control.disabled = disabled));
    dialog.dialog.removeEventListener('cancel', preventClose, true);
    submitting.delete(dialog.dialog);
  }
}
export const localDate = (date = new Date()) =>
  new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
export const formatDate = (date) =>
  date ? date.replaceAll("-", " / ") : "尚無資料";
export const numberInput = (value, attrs = {}) =>
  el("input", {
    type: "number",
    inputmode: "decimal",
    min: 0,
    step: "any",
    value: value ?? "",
    ...attrs,
  });
