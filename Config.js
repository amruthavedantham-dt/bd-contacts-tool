// ============================================================
// Config.js — spreadsheet references and tab schemas for the
// BD Contacts Tool.
//
// Profiles and Master_Contacts are READ-ONLY external sheets —
// this project never writes to them. Lookup is by gid (the tab's
// stable internal id, visible in the URL after "gid=") rather than
// tab name, so renaming a tab in either source sheet can't break
// the match.
//
// New_Matches / Ledger / Errors live IN this spreadsheet and are
// owned by this project — see SetupSheets.js for their headers.
// ============================================================

const CONFIG = {
  PROFILES: {
    SPREADSHEET_ID: '1nvGgM2cVy4bOtCRW55wM89SfLjySITApWi21DaYic7U',
    GID: 1003288694,
  },

  MASTER: {
    SPREADSHEET_ID: '1keZ16hZ4fwykjmGjMHI_kBQgici2sd5ryOwo3yLX2tQ',
    GID: 1104688671,
  },

  // Column headers expected in the PROFILES tab (exact text, as given).
  // Only these are read; extra/blank trailing columns are ignored.
  PROFILE_HEADERS: {
    COMPANY_NAME: 'Company Name',
    WEBSITE:      'Website',
    BAND:         'Band',
    REVENUE_BAND: 'Revenue_Band',
    DOMAIN:       'Domain', // industry classification (e.g. "SaaS") — NOT the same thing as Master's "Company Domain"
    SECTOR:       'Sector',
  },

  // Column headers expected in the Master Contacts tab (exact text, as given).
  MASTER_HEADERS: {
    FULL_NAME:       'Full Name',
    TITLE:           'Title',
    COMPANY:         'Company',
    COMPANY_DOMAIN:  'Company Domain',
    COMPANY_WEBSITE: 'Company Website',
    LOCATION:        'Location',
    EMAILS:          'Emails',
    PHONES:          'Phones',
    SUMMARY:         'Summary',
    EDUCATION:       'Education',
    PROFILE_ID:      'Profile ID',
  },

  DRIVE: {
    EXPORT_FOLDER_NAME: 'BD_Contact_Exports',
    FOLDER_ID_PROPERTY: 'EXPORT_FOLDER_ID', // Script Property cache
  },

  BATCH_SEQ_PROPERTY_PREFIX: 'BATCH_SEQ_', // + yyyyMMdd

  // Used only to break DUPLICATE_WEBSITE ties in Matching.js — when
  // the same website appears on two Profiles rows (a company profiled
  // twice under different name spellings), the entry with the
  // stronger Band wins. Band is a real computed signal; Profiles-sheet
  // row order is not, so it's not used as the tie-break.
  BAND_RANK: { A: 4, B: 3, C: 2, D: 1 },
};

function bandRank_(band) {
  return CONFIG.BAND_RANK[String(band || '').trim().toUpperCase()] || 0;
}
