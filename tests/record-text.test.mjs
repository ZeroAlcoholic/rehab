import test from 'node:test';
import assert from 'node:assert/strict';
import { displayRecordText, machineDisplayName } from '../src/ui/record-quality.js';

test('legacy review prompts disappear without removing measurements or useful instructions', () => {
  assert.equal(machineDisplayName('測試器材（型號待核對）'), '測試器材');
  assert.equal(machineDisplayName('測試器材 (機型待確認)'), '測試器材');
  assert.equal(displayRecordText('實際拉法待核對'), '');
  assert.equal(displayRecordText('座椅 3；姿式待核對。'), '座椅 3。');
  assert.equal(displayRecordText('30 kg × 8，待核對。'), '30 kg × 8。');
  assert.equal(displayRecordText('座椅 3／握法待核對'), '座椅 3');
  assert.equal(displayRecordText('疼痛明顯；座椅 3；30 kg × 8。'), '疼痛明顯；座椅 3；30 kg × 8。');
  assert.equal(displayRecordText('型號 A12（座椅 3）'), '型號 A12（座椅 3）');
  assert.equal(displayRecordText(''), '');
});
