// ============================================================
// SheetIO.js — tab names + column layouts for the sheets this
// project owns (New_Matches, Ledger, Errors). Sheet I/O structure
// for THIS spreadsheet lives here; Config.js holds only references
// to the external Profiles/Master sheets.
// ============================================================

const SHEETS = {
  NEW_MATCHES: 'New_Matches',
  LEDGER:      'Ledger',
  ERRORS:      'Errors',
};

// getOrCreateTab_ enforces this exact order on the live sheet every
// time it's touched (see enforceHeaderOrder_ in Utils.js), migrating
// any existing rows by header name — so changing the order here is
// enough; no manual sheet surgery needed. These internal names are
// NOT what BD sees — see EXPORT_HEADERS below for the friendly CSV
// labels, kept deliberately decoupled from these so renaming a sheet
// column here can never silently blank out live data (data carries
// over by matching header TEXT during migration).
//
// First block = also sent to BD in the download. Second block
// (Company Website onward) = sheet-only / internal reference,
// never appears in the downloaded CSV.
const NEW_MATCHES_HEADERS = [
  'Profile ID', 'Company', 'Full Name', 'Phones', 'Emails', 'Title',
  'Location', 'Summary', 'Education', 'Company Domain',
  'Company Website', 'Domain', 'Sector', 'Band', 'Revenue_Band', 'Date_Matched',
];

const LEDGER_HEADERS = [
  'Profile ID', 'Company', 'Full Name', 'Phones', 'Emails', 'Title',
  'Location', 'Summary', 'Education', 'Company Domain',
  'Company Website', 'Domain', 'Sector', 'Band_At_Export', 'Revenue_Band',
  'Date_Matched', 'Date_Exported', 'Batch_Id', 'Export_File_URL',
];

const ERRORS_HEADERS = [
  'Error_Type', 'Profile_ID', 'Full_Name', 'Company', 'Website',
  'Band', 'Detail', 'Date_Checked',
];

// The exact column set, order, AND header LABELS sent to BD in a
// download batch — deliberately friendlier names than the sheet's
// internal columns above (e.g. "Unique ID" not "Profile ID"). Only
// the label text differs; buildCsv_ never reads sheet headers, so
// this is purely presentational.
const EXPORT_HEADERS = [
  'Unique ID', 'Company Name', 'Person Name', 'Phone No', 'Email',
  'Title', 'Geography', 'Summary', 'Education', 'Company Domain',
];

const ERROR_TYPES = {
  NO_CONTACT_FOUND:     'NO_CONTACT_FOUND',     // profiled company, zero matching contacts in Master
  NO_PHONE_EMAIL:       'NO_PHONE_EMAIL',       // matched contact, both Emails and Phones blank
  DUPLICATE_WEBSITE:    'DUPLICATE_WEBSITE',    // two Profiles rows normalize to the same website
  DUPLICATE_PROFILE_ID: 'DUPLICATE_PROFILE_ID', // same Profile ID appears twice in Master Contacts
};
