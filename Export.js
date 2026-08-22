// ============================================================
// Export.js — turns a filtered slice of New_Matches into a
// downloadable CSV, commits it to Ledger, and removes it from
// New_Matches. Also handles re-downloading a past batch and
// downloading the Errors tab. Called from the HTML dialogs via
// google.script.run.
// ============================================================

// Filters New_Matches rows in-memory; returns sheet + matches with
// their real (1-based) sheet row numbers so callers can delete them.
function filterNewMatches_(filters) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateTab_(ss, SHEETS.NEW_MATCHES, NEW_MATCHES_HEADERS);
  const rows = readDataRows_(sheet);
  const dateIdx = NEW_MATCHES_HEADERS.indexOf('Date_Matched');
  const bandIdx = NEW_MATCHES_HEADERS.indexOf('Band');

  const matches = [];
  rows.forEach((row, i) => {
    const date = row[dateIdx];
    const band = row[bandIdx];
    if (filters.dateFrom && date < filters.dateFrom) return;
    if (filters.dateTo && date > filters.dateTo) return;
    if (filters.bands && filters.bands.length && filters.bands.indexOf(band) === -1) return;
    matches.push({ sheetRow: i + 2, values: row });
  });
  return { sheet, matches };
}

// Called by DownloadDialog.html before the user commits — no writes.
// Company count is by normalized website, not the raw `Company` text —
// the same contact's employer can be spelled several different ways
// across Master Contacts rows ("Acme Industries" vs "Acme Industries
// Pvt Ltd"), which would otherwise inflate the distinct-company count.
function previewMatches(filters) {
  const { matches } = filterNewMatches_(filters);
  const websiteIdx = NEW_MATCHES_HEADERS.indexOf('Company Website');
  const companies = new Set(matches.map(m => normalizeWebsite_(m.values[websiteIdx])));
  return { count: matches.length, companyCount: companies.size };
}

// Called by DownloadDialog.html on confirm. Creates the CSV,
// commits the batch to Ledger, deletes the rows from New_Matches.
function exportBatch(filters) {
  const { sheet, matches } = filterNewMatches_(filters);
  if (!matches.length) return { count: 0 };

  const batchId = nextBatchId_();
  const today = todayString_();

  const idx = {};
  NEW_MATCHES_HEADERS.forEach((h, i) => { idx[h] = i; });

  // Order must match EXPORT_HEADERS exactly (the friendly BD-facing labels).
  const csvRows = matches.map(m => [
    m.values[idx['Profile ID']], m.values[idx['Company']], m.values[idx['Full Name']],
    m.values[idx['Phones']], m.values[idx['Emails']], m.values[idx['Title']],
    m.values[idx['Location']], m.values[idx['Summary']], m.values[idx['Education']],
    m.values[idx['Company Domain']],
  ]);

  const csvContent = buildCsv_(EXPORT_HEADERS, csvRows);
  const fileName = `BD_Export_${batchId}${bandSuffix_(matches.map(m => m.values[idx['Band']]))}.csv`;
  const file = createDriveExportFile_(fileName, csvContent);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = getOrCreateTab_(ss, SHEETS.LEDGER, LEDGER_HEADERS);
  // Order must match LEDGER_HEADERS exactly.
  const ledgerRows = matches.map(m => [
    m.values[idx['Profile ID']], m.values[idx['Company']], m.values[idx['Full Name']],
    m.values[idx['Phones']], m.values[idx['Emails']], m.values[idx['Title']],
    m.values[idx['Location']], m.values[idx['Summary']], m.values[idx['Education']],
    m.values[idx['Company Domain']], m.values[idx['Company Website']],
    m.values[idx['Domain']], m.values[idx['Sector']],
    m.values[idx['Band']], m.values[idx['Revenue_Band']],
    m.values[idx['Date_Matched']], today, batchId, file.getUrl(),
  ]);
  appendRows_(ledgerSheet, ledgerRows);

  removeSheetRows_(sheet, matches.map(m => m.sheetRow));

  return { count: matches.length, fileUrl: file.getUrl(), fileName, batchId };
}

// e.g. ["B","A","B"] -> "_A-B" — so the Bands in a batch are visible
// straight from the Drive file name, not just inside the file.
function bandSuffix_(bands) {
  const distinct = Array.from(new Set(bands.filter(Boolean))).sort();
  return distinct.length ? `_${distinct.join('-')}` : '';
}

function nextBatchId_() {
  const props = PropertiesService.getScriptProperties();
  const dateKey = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd');
  const propKey = CONFIG.BATCH_SEQ_PROPERTY_PREFIX + dateKey;
  const seq = Number(props.getProperty(propKey) || '0') + 1;
  props.setProperty(propKey, String(seq));
  return `${dateKey}-${String(seq).padStart(3, '0')}`;
}

// Called by RedownloadDialog.html — groups Ledger by Batch_Id so
// the user can pick one and get back the ORIGINAL file link
// (nothing is regenerated, so re-downloading has no side effects).
function listBatches() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = getOrCreateTab_(ss, SHEETS.LEDGER, LEDGER_HEADERS);
  const rows = readDataRows_(ledgerSheet);
  const idx = {};
  LEDGER_HEADERS.forEach((h, i) => { idx[h] = i; });

  const batches = {};
  rows.forEach(row => {
    const id = row[idx['Batch_Id']];
    if (!id) return;
    if (!batches[id]) {
      batches[id] = {
        batchId: id,
        dateExported: row[idx['Date_Exported']],
        fileUrl: row[idx['Export_File_URL']],
        count: 0,
        bandSet: new Set(),
      };
    }
    batches[id].count += 1;
    batches[id].bandSet.add(row[idx['Band_At_Export']]);
  });

  return Object.keys(batches)
    .map(id => {
      const b = batches[id];
      return { batchId: b.batchId, dateExported: b.dateExported, fileUrl: b.fileUrl, count: b.count, bands: Array.from(b.bandSet).sort().join(', ') };
    })
    .sort((a, b) => (a.batchId < b.batchId ? 1 : -1));
}

// Called by RedownloadDialog.html's "Regenerate" button — for when
// the original Drive file was deleted. Rebuilds the CSV straight
// from that batch's Ledger rows (the permanent record — nothing is
// re-matched or re-sent), creates a fresh Drive file, and updates
// Export_File_URL on every row of that batch to point at it.
function regenerateBatchCsv(batchId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = getOrCreateTab_(ss, SHEETS.LEDGER, LEDGER_HEADERS);
  const lastRow = ledgerSheet.getLastRow();
  if (lastRow < 2) return { count: 0 };

  const idx = {};
  LEDGER_HEADERS.forEach((h, i) => { idx[h] = i; });

  const values = ledgerSheet.getRange(2, 1, lastRow - 1, LEDGER_HEADERS.length).getValues();

  const matchingRowNums = [];
  const csvRows = [];
  const bands = [];
  values.forEach((row, i) => {
    if (String(row[idx['Batch_Id']]) !== String(batchId)) return;
    matchingRowNums.push(i + 2);
    bands.push(row[idx['Band_At_Export']]);
    // Order must match EXPORT_HEADERS exactly (same shape as exportBatch's CSV).
    csvRows.push([
      row[idx['Profile ID']], row[idx['Company']], row[idx['Full Name']],
      row[idx['Phones']], row[idx['Emails']], row[idx['Title']],
      row[idx['Location']], row[idx['Summary']], row[idx['Education']],
      row[idx['Company Domain']],
    ]);
  });

  if (!csvRows.length) return { count: 0 };

  const csvContent = buildCsv_(EXPORT_HEADERS, csvRows);
  const fileName = `BD_Export_${batchId}${bandSuffix_(bands)}.csv`;
  const file = createDriveExportFile_(fileName, csvContent);

  const urlCol = idx['Export_File_URL'] + 1;
  matchingRowNums.forEach(r => ledgerSheet.getRange(r, urlCol).setValue(file.getUrl()));

  return { count: csvRows.length, fileUrl: file.getUrl(), fileName, batchId };
}

// Called by the "Download Errors" menu item.
function exportErrorsCsv() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errorsSheet = getOrCreateTab_(ss, SHEETS.ERRORS, ERRORS_HEADERS);
  const rows = readDataRows_(errorsSheet);
  if (!rows.length) return { count: 0 };
  const csvContent = buildCsv_(ERRORS_HEADERS, rows);
  const fileName = `BD_Errors_${todayString_()}.csv`;
  const file = createDriveExportFile_(fileName, csvContent);
  return { count: rows.length, fileUrl: file.getUrl(), fileName };
}

function buildCsv_(headers, rows) {
  const escape = v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(escape).join(',')];
  rows.forEach(r => lines.push(r.map(escape).join(',')));
  return lines.join('\n');
}

// Folder id is cached in Script Properties after first creation so
// we never need broader Drive search scope — drive.file is enough
// because the script itself owns everything it reads back.
function getExportFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cachedId = props.getProperty(CONFIG.DRIVE.FOLDER_ID_PROPERTY);
  if (cachedId) {
    try {
      return DriveApp.getFolderById(cachedId);
    } catch (e) {
      // cached id no longer resolves (folder deleted) — recreate below
    }
  }
  const folder = DriveApp.createFolder(CONFIG.DRIVE.EXPORT_FOLDER_NAME);
  props.setProperty(CONFIG.DRIVE.FOLDER_ID_PROPERTY, folder.getId());
  return folder;
}

function createDriveExportFile_(fileName, csvContent) {
  return getExportFolder_().createFile(fileName, csvContent, MimeType.CSV);
}
