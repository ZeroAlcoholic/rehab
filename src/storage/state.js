export function initialState() {
  return {
    schemaVersion: 1,
    events: [],
    pending: [],
    settings: { clientId: "", sheetId: "" },
    lastSync: null,
  };
}
