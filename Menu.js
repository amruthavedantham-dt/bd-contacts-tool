// ============================================================
// Menu.js
// Custom menu for the BD Contacts Tool spreadsheet. onOpen() is
// an Apps Script simple trigger — runs automatically whenever the
// spreadsheet is opened.
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BD Contacts')
    .addItem('Run Matching',            'runMatching')
    .addSeparator()
    .addItem('Download Contacts...',     'showDownloadDialog')
    .addItem('Re-download a Batch...',   'showRedownloadDialog')
    .addItem('Download Errors',          'downloadErrorsAndShowLink')
    .addSeparator()
    .addItem('Setup Sheets',             'setupSheets')
    .addItem('Backfill Revenue/Domain/Sector/Education', 'backfillProfileFields')
    .addItem('Clean Up New_Matches',     'cleanupNewMatches')
    .addToUi();
}

function showDownloadDialog() {
  const html = HtmlService.createHtmlOutputFromFile('DownloadDialog').setWidth(480).setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html, 'Download Contacts');
}

function showRedownloadDialog() {
  const html = HtmlService.createHtmlOutputFromFile('RedownloadDialog').setWidth(560).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'Re-download a Batch');
}

function downloadErrorsAndShowLink() {
  const result = exportErrorsCsv();
  if (!result.count) {
    SpreadsheetApp.getUi().alert('No rows in the Errors tab right now.');
    return;
  }
  const template = HtmlService.createTemplateFromFile('LinkDialog');
  template.fileUrl = result.fileUrl;
  template.fileName = result.fileName;
  template.message = `${result.count} row(s) exported.`;
  const html = template.evaluate().setWidth(420).setHeight(160);
  SpreadsheetApp.getUi().showModalDialog(html, 'Errors CSV Ready');
}
