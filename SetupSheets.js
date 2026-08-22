// ============================================================
// SetupSheets.js — idempotent creation of the tabs this project
// owns. Safe to run repeatedly; never clears existing data.
// ============================================================

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateTab_(ss, SHEETS.NEW_MATCHES, NEW_MATCHES_HEADERS);
  getOrCreateTab_(ss, SHEETS.LEDGER, LEDGER_HEADERS);
  getOrCreateTab_(ss, SHEETS.ERRORS, ERRORS_HEADERS);
  SpreadsheetApp.getUi().alert('Setup complete: New_Matches, Ledger, and Errors tabs are ready.');
}
