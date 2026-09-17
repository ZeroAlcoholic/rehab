// Add one journal without moving or rewriting existing records.
export async function addRehabJournal(request, base, header) {
  const info=await request(`${base}?fields=spreadsheetId,sheets.properties`);
  const sheets=info?.sheets?.map(s=>s.properties);
  if(!Array.isArray(sheets)||sheets.some(s=>!Number.isInteger(s?.sheetId)||typeof s.title!=='string')) throw new Error('無法確認試算表結構，尚未新增復健資料表。');
  const meta=sheets.find(s=>s.title==='_meta');
  if(!meta||sheets.some(s=>s.title==='rehab_log')) throw new Error('試算表結構已改變，請重新同步後再試。');
  const sheetId=Math.max(0,...sheets.map(s=>s.sheetId))+1;
  const cells=values=>values.map(value=>({userEnteredValue:{stringValue:value}}));
  // Sheets batchUpdate is atomic: table, header and version advance together.
  await request(`${base}:batchUpdate`,{method:'POST',body:{requests:[
    {addSheet:{properties:{sheetId,title:'rehab_log',gridProperties:{frozenRowCount:1}}}},
    {updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows:[{values:cells(header)}],fields:'userEnteredValue'}},
    {updateCells:{start:{sheetId:meta.sheetId,rowIndex:2,columnIndex:1},rows:[{values:cells(['2'])}],fields:'userEnteredValue'}},
  ]}});
}
