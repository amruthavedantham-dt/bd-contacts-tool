// ============================================================
// Utils.js — generic helpers shared across the project.
// ============================================================

// Looks a sheet up by gid (stable tab id) rather than name, so a
// tab rename in the external Profiles/Master spreadsheets can't
// silently break this project.
function getSheetByGid_(spreadsheetId, gid) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheets().find(s => s.getSheetId() === gid);
  if (!sheet) {
    throw new Error(
      `Sheet with gid ${gid} not found in spreadsheet ${spreadsheetId}. ` +
      `Check CONFIG in Config.js against the current tab URL.`
    );
  }
  return sheet;
}

// Reads the header row (row 1) into { headerText: zeroBasedColIndex }.
function headerMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {};
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h).trim();
    if (key) map[key] = i;
  });
  return map;
}

// Confirms every needed header exists in the map; throws a clear
// error naming the sheet and the missing header, instead of a
// confusing "undefined" downstream.
function requireHeaders_(map, neededHeaders, sheetLabel) {
  for (const h of neededHeaders) {
    if (!(h in map)) {
      throw new Error(`Expected column "${h}" not found in ${sheetLabel}. ` +
        `Found columns: ${Object.keys(map).join(', ')}`);
    }
  }
}

// Reads all data rows (everything below the header) as a 2D array.
function readDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

// Strips scheme/www/path/trailing-slash and lowercases, so
// "https://www.acme.com/", "acme.com", "Acme.com" all match.
function normalizeWebsite_(url) {
  if (!url) return '';
  let s = String(url).trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.split('/')[0];
  s = s.replace(/\/+$/, '');
  return s;
}

function getOrCreateTab_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  enforceHeaderOrder_(sheet, headers);
  return sheet;
}

// Makes the sheet's physical column layout match `desiredHeaders`
// exactly — reordering, adding, or (for columns no longer listed)
// dropping columns as needed. Existing data rows are carried along
// by header name, not position, so changing a header's position in
// the JS constant migrates any existing rows on the next call
// instead of silently misaligning them. A no-op if already correct.
function enforceHeaderOrder_(sheet, desiredHeaders) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    sheet.setFrozenRows(1);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const sameOrder = currentHeaders.length === desiredHeaders.length &&
    currentHeaders.every((h, i) => h === desiredHeaders[i]);
  if (sameOrder) return;

  const numDataRows = lastRow - 1;
  const dataValues = numDataRows > 0 ? sheet.getRange(2, 1, numDataRows, lastCol).getValues() : [];

  const oldIndexByHeader = {};
  currentHeaders.forEach((h, i) => { if (h) oldIndexByHeader[h] = i; });

  const reorderedData = dataValues.map(row =>
    desiredHeaders.map(h => (h in oldIndexByHeader) ? row[oldIndexByHeader[h]] : '')
  );

  sheet.clearContents();
  sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
  if (reorderedData.length) {
    sheet.getRange(2, 1, reorderedData.length, desiredHeaders.length).setValues(reorderedData);
  }
  sheet.setFrozenRows(1);
}

function todayString_() {
  return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
}

function appendRows_(sheet, rows) {
  if (!rows.length) return;
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

// Removes the given 1-based sheet row numbers in ONE bulk read +
// rewrite, instead of calling sheet.deleteRow() once per row. On a
// large sheet, hundreds/thousands of individual deleteRow() calls
// each cost a separate round-trip and can burn through Apps Script's
// 6-minute execution limit — this does the same job as a single
// read + single write, regardless of how many rows are removed.
function removeSheetRows_(sheet, sheetRowNumbers) {
  const toRemove = new Set(sheetRowNumbers);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || !toRemove.size) return;

  const numDataRows = lastRow - 1;
  const allRows = sheet.getRange(2, 1, numDataRows, lastCol).getValues();
  const kept = allRows.filter((_, i) => !toRemove.has(i + 2));

  sheet.getRange(2, 1, numDataRows, lastCol).clearContent();
  if (kept.length) {
    sheet.getRange(2, 1, kept.length, lastCol).setValues(kept);
  }
}
