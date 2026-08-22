// ============================================================
// Matching.js — joins Master Contacts to Profiles by normalized
// website, excludes anything already in the Ledger or already
// queued in New_Matches, and files gaps into Errors.
//
// A contact is sent to BD at most once, ever: exclusion is keyed
// purely on Profile ID, so a company's Band changing on a later
// profiling run does NOT bring an already-exported contact back.
// ============================================================

// Reads the PROFILES tab into normalized-website -> {companyName,
// website, band, revenueBand, domain, sector}. Shared by runMatching()
// (for new rows) and backfillProfileFields() (for rows matched before
// these columns existed), so the DUPLICATE_WEBSITE tie-break logic
// only lives in one place.
function buildProfileIndex_() {
  const profileSheet = getSheetByGid_(CONFIG.PROFILES.SPREADSHEET_ID, CONFIG.PROFILES.GID);
  const pMap = headerMap_(profileSheet);
  requireHeaders_(pMap, Object.values(CONFIG.PROFILE_HEADERS), 'PROFILES tab');
  const pRows = readDataRows_(profileSheet);

  const profileByWebsite = {};
  const today = todayString_();
  const errors = [];

  pRows.forEach(row => {
    const companyName = row[pMap[CONFIG.PROFILE_HEADERS.COMPANY_NAME]];
    const website      = row[pMap[CONFIG.PROFILE_HEADERS.WEBSITE]];
    const band          = row[pMap[CONFIG.PROFILE_HEADERS.BAND]];
    const revenueBand   = row[pMap[CONFIG.PROFILE_HEADERS.REVENUE_BAND]];
    const domain        = row[pMap[CONFIG.PROFILE_HEADERS.DOMAIN]];
    const sector         = row[pMap[CONFIG.PROFILE_HEADERS.SECTOR]];
    const norm = normalizeWebsite_(website);
    if (!norm) return; // no website on this profile row, can't ever match — skip silently

    if (profileByWebsite[norm]) {
      const existing = profileByWebsite[norm];
      const candidate = { companyName, website, band, revenueBand, domain, sector };
      const [winner, loser] = bandRank_(candidate.band) > bandRank_(existing.band)
        ? [candidate, existing]
        : [existing, candidate];
      profileByWebsite[norm] = winner; // stronger Band wins, regardless of row order
      errors.push([
        ERROR_TYPES.DUPLICATE_WEBSITE, '', '', loser.companyName, loser.website, loser.band,
        `Same website also profiled as "${winner.companyName}" (Band ${winner.band}) — kept the higher band; this entry was Band ${loser.band}.`,
        today,
      ]);
      return;
    }
    profileByWebsite[norm] = { companyName, website, band, revenueBand, domain, sector };
  });

  return { profileByWebsite, errors };
}

function runMatching() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const masterSheet     = getSheetByGid_(CONFIG.MASTER.SPREADSHEET_ID, CONFIG.MASTER.GID);
  const newMatchesSheet = getOrCreateTab_(ss, SHEETS.NEW_MATCHES, NEW_MATCHES_HEADERS);
  const ledgerSheet     = getOrCreateTab_(ss, SHEETS.LEDGER, LEDGER_HEADERS);
  const errorsSheet     = getOrCreateTab_(ss, SHEETS.ERRORS, ERRORS_HEADERS);

  const today = todayString_();
  const { profileByWebsite, errors } = buildProfileIndex_();

  // ---- Ledger + New_Matches: Profile IDs already accounted for ----
  const alreadySent = new Set(
    readDataRows_(ledgerSheet).map(r => String(r[LEDGER_HEADERS.indexOf('Profile ID')]))
  );
  const alreadyQueued = new Set(
    readDataRows_(newMatchesSheet).map(r => String(r[NEW_MATCHES_HEADERS.indexOf('Profile ID')]))
  );

  // ---- Master Contacts: join + row-level dedupe ----
  const mMap = headerMap_(masterSheet);
  requireHeaders_(mMap, Object.values(CONFIG.MASTER_HEADERS), 'Master Contacts tab');
  const mRows = readDataRows_(masterSheet);

  const seenProfileIds = new Set();
  const matchedWebsites = new Set();
  const newMatchRows = [];

  mRows.forEach(row => {
    const profileId = String(row[mMap[CONFIG.MASTER_HEADERS.PROFILE_ID]] || '').trim();
    if (!profileId) return; // no identity, can't dedupe-track — skip

    const fullName      = row[mMap[CONFIG.MASTER_HEADERS.FULL_NAME]];
    const title          = row[mMap[CONFIG.MASTER_HEADERS.TITLE]];
    const company        = row[mMap[CONFIG.MASTER_HEADERS.COMPANY]];
    const companyDomain  = row[mMap[CONFIG.MASTER_HEADERS.COMPANY_DOMAIN]];
    const website         = row[mMap[CONFIG.MASTER_HEADERS.COMPANY_WEBSITE]];
    const location        = row[mMap[CONFIG.MASTER_HEADERS.LOCATION]];
    const emails           = row[mMap[CONFIG.MASTER_HEADERS.EMAILS]];
    const phones           = row[mMap[CONFIG.MASTER_HEADERS.PHONES]];
    const summary           = row[mMap[CONFIG.MASTER_HEADERS.SUMMARY]];
    const education          = row[mMap[CONFIG.MASTER_HEADERS.EDUCATION]];

    if (seenProfileIds.has(profileId)) {
      errors.push([
        ERROR_TYPES.DUPLICATE_PROFILE_ID, profileId, fullName, company, website, '',
        'Profile ID appears more than once in Master Contacts — kept the first occurrence.',
        today,
      ]);
      return;
    }
    seenProfileIds.add(profileId);

    const norm = normalizeWebsite_(website);
    const profile = profileByWebsite[norm];
    if (!profile) return; // company not in the current Profiles set — out of scope

    matchedWebsites.add(norm);

    if (alreadySent.has(profileId) || alreadyQueued.has(profileId)) return; // sent once, ever

    if (!emails && !phones) {
      errors.push([
        ERROR_TYPES.NO_PHONE_EMAIL, profileId, fullName, company, website, profile.band,
        'Contact matched a profiled company but has no email and no phone on file.',
        today,
      ]);
      return;
    }

    // Order must match NEW_MATCHES_HEADERS exactly.
    newMatchRows.push([
      profileId, company, fullName, phones, emails, title,
      location, summary, education, companyDomain,
      website, profile.domain, profile.sector, profile.band, profile.revenueBand, today,
    ]);
  });

  // ---- Profiled companies with zero contacts at all ----
  Object.keys(profileByWebsite).forEach(norm => {
    if (matchedWebsites.has(norm)) return;
    const profile = profileByWebsite[norm];
    errors.push([
      ERROR_TYPES.NO_CONTACT_FOUND, '', '', profile.companyName, profile.website, profile.band,
      'No contact rows in Master Contacts matched this company website.',
      today,
    ]);
  });

  // ---- Write results ----
  appendRows_(newMatchesSheet, newMatchRows);

  // Errors is a live diagnostic snapshot, not a history — rebuild it each run.
  const errLastRow = errorsSheet.getLastRow();
  if (errLastRow > 1) {
    errorsSheet.getRange(2, 1, errLastRow - 1, ERRORS_HEADERS.length).clearContent();
  }
  appendRows_(errorsSheet, errors);

  ui.alert(
    'Run Matching complete',
    `${newMatchRows.length} new contact(s) queued in New_Matches.\n` +
    `${errors.length} row(s) in Errors.`,
    ui.ButtonSet.OK
  );
}

// Safety-net cleanup: removes any New_Matches row whose Profile ID is
// already present in Ledger. This should normally never find anything
// — Run Matching and exportBatch both already guard against it — but
// exportBatch used to delete exported rows from New_Matches one at a
// time, which could time out mid-batch on a large export and leave
// some already-Ledger'd contacts stranded in New_Matches. Safe to run
// anytime: only ever removes exact Profile-ID duplicates, never
// touches Ledger itself.
function cleanupNewMatches() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const newMatchesSheet = getOrCreateTab_(ss, SHEETS.NEW_MATCHES, NEW_MATCHES_HEADERS);
  const ledgerSheet     = getOrCreateTab_(ss, SHEETS.LEDGER, LEDGER_HEADERS);

  const alreadySent = new Set(
    readDataRows_(ledgerSheet).map(r => String(r[LEDGER_HEADERS.indexOf('Profile ID')]))
  );

  const idCol = NEW_MATCHES_HEADERS.indexOf('Profile ID');
  const staleRowNums = [];
  readDataRows_(newMatchesSheet).forEach((row, i) => {
    if (alreadySent.has(String(row[idCol]))) staleRowNums.push(i + 2);
  });

  removeSheetRows_(newMatchesSheet, staleRowNums);

  ui.alert(
    'Cleanup complete',
    `${staleRowNums.length} row(s) removed from New_Matches (already present in Ledger).`,
    ui.ButtonSet.OK
  );
}

// Master Contacts, keyed by Profile ID -> Education. Separate from
// buildProfileIndex_ because Education is a Master-Contacts field,
// not a Profiles field — it can't be looked up by website.
function buildMasterEducationIndex_() {
  const masterSheet = getSheetByGid_(CONFIG.MASTER.SPREADSHEET_ID, CONFIG.MASTER.GID);
  const mMap = headerMap_(masterSheet);
  requireHeaders_(mMap, [CONFIG.MASTER_HEADERS.PROFILE_ID, CONFIG.MASTER_HEADERS.EDUCATION], 'Master Contacts tab');
  const mRows = readDataRows_(masterSheet);

  const educationByProfileId = {};
  mRows.forEach(row => {
    const profileId = String(row[mMap[CONFIG.MASTER_HEADERS.PROFILE_ID]] || '').trim();
    if (!profileId) return;
    educationByProfileId[profileId] = row[mMap[CONFIG.MASTER_HEADERS.EDUCATION]];
  });
  return educationByProfileId;
}

// One-time migration for rows matched before Revenue_Band/Domain/Sector/
// Education existed. Revenue_Band/Domain/Sector are looked up by
// Company Website against the live Profiles index; Education is looked
// up by Profile ID against Master Contacts (a different join, since
// it's a Master field, not a Profiles field). Doesn't touch any other
// column, doesn't re-match, doesn't affect Ledger dedupe.
function backfillProfileFields() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { profileByWebsite } = buildProfileIndex_();
  const educationByProfileId = buildMasterEducationIndex_();

  const newMatchesSheet = getOrCreateTab_(ss, SHEETS.NEW_MATCHES, NEW_MATCHES_HEADERS);
  const ledgerSheet     = getOrCreateTab_(ss, SHEETS.LEDGER, LEDGER_HEADERS);

  const fields = [
    { header: 'Revenue_Band', key: 'revenueBand' },
    { header: 'Domain',       key: 'domain' },
    { header: 'Sector',       key: 'sector' },
  ];

  let nmCount = fillProfileColumns_(newMatchesSheet, NEW_MATCHES_HEADERS, profileByWebsite, fields);
  let ledgerCount = fillProfileColumns_(ledgerSheet, LEDGER_HEADERS, profileByWebsite, fields);

  nmCount += fillEducationColumn_(newMatchesSheet, NEW_MATCHES_HEADERS, educationByProfileId);
  ledgerCount += fillEducationColumn_(ledgerSheet, LEDGER_HEADERS, educationByProfileId);

  ui.alert(
    'Backfill complete',
    `New_Matches: ${nmCount} cell(s) updated.\nLedger: ${ledgerCount} cell(s) updated.`,
    ui.ButtonSet.OK
  );
}

function fillEducationColumn_(sheet, headers, educationByProfileId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const idCol = headers.indexOf('Profile ID') + 1;
  const eduCol = headers.indexOf('Education') + 1;
  if (eduCol === 0) return 0;
  const numRows = lastRow - 1;

  const ids = sheet.getRange(2, idCol, numRows, 1).getValues();
  const eduValues = sheet.getRange(2, eduCol, numRows, 1).getValues();

  let updated = 0;
  for (let i = 0; i < numRows; i++) {
    const profileId = String(ids[i][0] || '').trim();
    if (!profileId || !(profileId in educationByProfileId)) continue;
    const newVal = educationByProfileId[profileId] || '';
    if (eduValues[i][0] !== newVal) {
      eduValues[i][0] = newVal;
      updated++;
    }
  }
  sheet.getRange(2, eduCol, numRows, 1).setValues(eduValues);
  return updated;
}

function fillProfileColumns_(sheet, headers, profileByWebsite, fields) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const websiteCol = headers.indexOf('Company Website') + 1;
  const numRows = lastRow - 1;
  const websites = sheet.getRange(2, websiteCol, numRows, 1).getValues();

  let updated = 0;
  fields.forEach(({ header, key }) => {
    const col = headers.indexOf(header) + 1;
    if (col === 0) return; // this sheet doesn't have that column
    const values = sheet.getRange(2, col, numRows, 1).getValues();
    for (let i = 0; i < numRows; i++) {
      const profile = profileByWebsite[normalizeWebsite_(websites[i][0])];
      if (!profile) continue;
      const newVal = profile[key] || '';
      if (values[i][0] !== newVal) {
        values[i][0] = newVal;
        updated++;
      }
    }
    sheet.getRange(2, col, numRows, 1).setValues(values);
  });
  return updated;
}
