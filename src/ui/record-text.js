// Presentation only; edited fields retain the original value when left unchanged.
export function displayRecordText(text = '') {
  const cleaned = text
    .replace(/(?:既有)?(?:實際拉法|姿勢|姿式|型號|機型|機台|握法)?待(?:核對|確認)(?:仍保留)?/gu, '')
    .replace(/[（(]\s*[）)]/gu, '')
    .replace(/[，,、／/]\s*(?=[。；;\n]|$)/gu, '')
    .replace(/[；;。]\s*。/gu, '。')
    .trim();
  return /^[\s，,。；;、／/]*$/u.test(cleaned) ? '' : cleaned;
}
export function machineDisplayName(machine = '') {
  return displayRecordText(machine) || '未指定機台';
}

// Display cleanup must not silently become a data migration when a form is saved.
export function recordTextValue(original = '', edited, display = displayRecordText) {
  return edited === display(original) ? original : edited;
}
