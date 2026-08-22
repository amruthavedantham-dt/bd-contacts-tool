# BD Contacts Tool

A Google Apps Script tool that connects your **company profiling pipeline** to your
**master contacts list**, and hands the BD (Business Development) team a clean,
de-duplicated list of people to call — while making an ironclad guarantee: **no
contact is ever sent to BD more than once, ever.** This document explains what the
tool does, why it's built the way it is, and how to use it from a completely fresh
start, for someone who has never touched it before.

## 1. The problem this tool solves

You have (or will have) two separate Google Sheets that already exist independently
of this tool:

1. **Profiles** — the output of a company-profiling pipeline (e.g. the [Company
   Profiler RocketReach](../Company_Profiler_RocketReach/README.md) tool). Each row
   is one company, with a Band (A/B/C/D priority), a Website, and other scoring
   fields.
2. **Master Contacts** — a large list of individual people (scraped/collected
   separately, e.g. via RocketReach), each with a Company, a Company Website, an
   Email/Phone, a Title, etc.

The problem: these two sheets don't talk to each other. You have companies you want
to prioritize, and you have a giant pool of people — but nothing automatically tells
you *which people belong to which profiled companies*, and nothing stops you from
accidentally sending the same contact to BD twice across different exports.

**This tool is the join between them.** It matches contacts to profiled companies by
website, keeps a permanent record of who's already been sent, and gives you a
button-driven way to download only the *new* people for BD to call.

## 2. What this tool does NOT do

- It does not scrape or generate contacts itself — Master Contacts is an input this
  tool only reads, never writes to.
- It does not re-score or re-profile companies — Profiles is also read-only input.
- It does not decide who to call — it just surfaces the match and lets you filter by
  date and Band before sending.

Both source sheets are treated as **read-only references** — this tool never
modifies either of them.

## 3. The core guarantee: "sent once, ever"

Once a contact (identified by their unique `Profile ID`) has been included in a
download batch sent to BD, this tool will **never** surface that same contact again
in a future match or download — even if:
- You run the matching process again days or weeks later.
- The company's Band changes on a later profiling run (e.g. it goes from Band C to
  Band A).
- You accidentally try to include it again.

This is a deliberate design decision: once BD has a contact, re-sending it (even
under a "better" Band) creates confusion and duplicate outreach. The exclusion is
tracked purely by `Profile ID` against a permanent, append-only **Ledger** — nothing
in this system ever "un-sends" a contact.

## 4. How the matching works

### The join key: normalized website, not company name

Company names are unreliable for matching — the same company can appear as "Acme
Industries", "Acme Industries Pvt Ltd", or "ACME INDUSTRIES" across different rows.
Websites are far more consistent. So every match is done by **normalized website**:
`https://www.acme.com/` → `acme.com`. Scheme, `www.`, path, and trailing slashes are
all stripped and the result is lowercased, so all the variations above collapse to
the same key.

### What "Run Matching" actually does, step by step

1. Reads every row of **Profiles**, keyed by normalized website. If the same website
   appears twice (e.g. a company was accidentally profiled twice under two different
   name spellings), the entry with the **stronger Band wins** (A beats B beats C
   beats D) — Band is a real computed signal, whichever row happens to appear first
   in the sheet is not. The losing entry is logged to Errors as `DUPLICATE_WEBSITE`.
2. Reads every row of **Master Contacts**. For each contact:
   - If the same `Profile ID` appears more than once in Master Contacts, only the
     first occurrence is kept; the rest are logged as `DUPLICATE_PROFILE_ID`.
   - Its website is normalized and looked up against the Profiles index from step 1.
     If there's no match, that contact is simply out of scope (not an error — most
     people in Master Contacts won't belong to a currently-profiled company).
   - If the contact's `Profile ID` is already in the Ledger (sent before) or already
     sitting in New_Matches (queued but not yet sent), it's skipped — this is where
     "sent once, ever" is enforced.
   - If the contact has neither an email nor a phone number, it's logged as
     `NO_PHONE_EMAIL` instead of being queued — there's nothing for BD to call.
   - Otherwise, it's added to **New_Matches** as a fresh, ready-to-send contact.
3. Any profiled company (any Band) that ended up with **zero** matching contacts at
   all is logged as `NO_CONTACT_FOUND` — a visibility flag that a company you care
   about has no known people yet.
4. The **Errors** tab is a live snapshot, not a history — it's fully rebuilt every
   time you run matching, not appended to.

### The Errors tab, explained

| Error Type | What it means |
|---|---|
| `NO_CONTACT_FOUND` | A profiled company has no contact rows in Master Contacts matching its website. |
| `NO_PHONE_EMAIL` | A contact matched a profiled company, but has neither an email nor a phone on file — not sent to BD since there's no way to reach them. |
| `DUPLICATE_WEBSITE` | The same website appears on two different Profiles rows (usually the same company profiled twice under different name spellings). The stronger-Band row was kept; this row's `Detail` column names the winner and both Bands so you can see the conflict at a glance. |
| `DUPLICATE_PROFILE_ID` | The same person's unique ID appears more than once in Master Contacts. The first occurrence was kept. |

## 5. Setup — before your first run

1. Open the BD Contacts Tool Google Sheet, or the Apps Script project bound to it
   (Extensions → Apps Script) if you need to edit code.
2. Confirm the spreadsheet references in `Config.js` point at your actual Profiles
   and Master Contacts sheets — each is referenced by **gid** (the tab's stable ID
   from its URL, e.g. `...#gid=1003288694`), not by tab name, so renaming a tab in
   either source sheet later won't silently break the match.
3. Your Google account needs at least **Viewer access** to both the Profiles and
   Master Contacts spreadsheets for the lookups to work.
4. This project requests three OAuth permissions on first authorization: edit this
   spreadsheet, full Google Drive access (needed specifically because creating a new
   folder via Apps Script's Drive service requires it, even though the tool only
   ever touches its own export folder afterward), and the ability to show its custom
   dialogs. You'll see a one-time Google authorization prompt the first time you use
   a menu action that needs it.
5. Local source is managed with [`clasp`](https://github.com/google/clasp) — after
   editing any file in this folder, run `clasp push` to deploy it live.

## 6. How to run it, step by step

Open the spreadsheet — a **"BD Contacts"** menu appears in the menu bar.

### One-time setup
1. **Setup Sheets** — creates the `New_Matches`, `Ledger`, and `Errors` tabs with
   the correct headers if they don't already exist. Safe to run any time — it never
   clears existing data, so you can run it again after code changes without worry.

### Regular workflow
2. **Run Matching** — does everything described in §4: reads the current state of
   Profiles and Master Contacts, queues new never-before-seen contacts into
   `New_Matches`, and rebuilds the `Errors` tab. Run this whenever you want to pull
   in new companies or new contacts since the last run — it's always safe to
   re-run; nothing already sent or already queued gets duplicated.
3. **Download Contacts...** — opens a dialog where you:
   - Optionally set a From/To date range (filtering on when contacts were matched,
     `Date_Matched`).
   - Choose which Bands to include (A/B/C/D, all checked by default).
   - Click **Preview** to see how many contacts and how many distinct companies
     match your filter, before committing to anything.
   - Click **Confirm & Download** to actually export. This builds a CSV, saves it
     to a Drive folder named `BD_Contact_Exports`, permanently records those
     contacts in the `Ledger` (so they can never be re-sent), and removes them from
     `New_Matches`. You get a link to open the file straight from the dialog.
4. Hand the downloaded CSV to BD. The CSV's column headers are deliberately
   friendlier than the internal sheet's — "Unique ID", "Company Name", "Person
   Name", "Phone No", "Email", "Title", "Geography", "Summary", "Education",
   "Company Domain" — since BD never needs to see internal-only fields like Band or
   Sector.

### If you need to go back to a previous export
5. **Re-download a Batch...** — lists every past export batch (by date, Bands
   included, and contact count) with a link to the *original* file. This never
   regenerates anything by default — it just hands you back the exact file that was
   sent before.
   - If that original Drive file was deleted, click **Regenerate** next to that
     batch — it rebuilds the CSV straight from the permanent Ledger record (never
     re-matches or re-sends anything) and updates the link.

### Other tools
6. **Download Errors** — exports the current `Errors` tab as its own CSV to the same
   Drive folder, for whoever needs to investigate data-quality gaps (missing
   contacts, missing phone/email, duplicates).
7. **Backfill Revenue/Domain/Sector/Education** — a one-time migration tool. If you
   add a new field to the schema after contacts have already been matched, this
   re-looks-up every existing row in `New_Matches` and `Ledger` against the current
   Profiles/Master Contacts data and fills in the new column, without re-matching or
   affecting the "sent once, ever" guarantee. You'll typically only need this if a
   sheet-owner adds a new tracked field later — most users won't need to run it.
8. **Clean Up New_Matches** — a safety-net tool. Normally does nothing, since the
   normal flow already prevents it — but if a very large export was ever interrupted
   partway through, this removes any leftover `New_Matches` rows that were actually
   already recorded in the Ledger, restoring the "sent once, ever" guarantee. Safe
   to run any time.

## 7. Sheet reference

### Sheets this tool reads only (never writes to)

| Sheet | What it holds | Relevant columns this tool uses |
|---|---|---|
| **Profiles** | Output of the company profiling pipeline | Company Name, Website, Band, Revenue_Band, Domain (industry classification, e.g. "SaaS"), Sector |
| **Master Contacts** | The full pool of individual contacts | Full Name, Title, Company, Company Domain (a per-contact website-like field — not the same thing as Profiles' "Domain"), Company Website, Location, Emails, Phones, Summary, Education, Profile ID (the unique identity key) |

### Sheets this tool owns (creates and writes to)

| Sheet | What it holds |
|---|---|
| **New_Matches** | The queue of matched-but-not-yet-sent contacts, waiting to be downloaded. Includes both the BD-facing fields (Company, Full Name, Phones, Emails, Title, Location, Summary, Education, Company Domain) and internal-reference-only fields (Company Website, Domain, Sector, Band, Revenue_Band, Date_Matched) that never leave the sheet. |
| **Ledger** | The permanent, append-only record of everything ever exported. Same fields as New_Matches plus Band_At_Export (the Band at the time it was sent — frozen, so a later Band change doesn't retroactively change history), Date_Exported, Batch_Id, and Export_File_URL (a direct link back to the Drive file it was sent in). This is the source of truth for the "sent once, ever" guarantee and for re-downloading past batches. |
| **Errors** | A live snapshot (rebuilt every "Run Matching", not a history) of data-quality gaps — see §4's Errors table above. |

## 8. How "Overwrite the exact same list every time" is avoided (technical notes, for anyone maintaining this)

A few design choices exist specifically to make this tool safe to run repeatedly
and to survive schema changes without breaking existing data:

- **Column layout is self-migrating.** The exact column order for `New_Matches` and
  `Ledger` lives in one place (`SheetIO.js`). Every time a tab is opened by the
  tool, it checks the live sheet's actual headers against that list — if they don't
  match, it automatically reorders/adds/drops columns and carries existing data
  along **by matching header text**, not position. This means adding or reordering
  a column is as simple as editing the header list in code; no manual spreadsheet
  surgery is ever needed, and existing rows are never silently misaligned.
- **Bulk operations, not row-by-row.** Removing rows (e.g. after an export) is done
  as one read + one rewrite of the whole sheet, not a loop of individual row
  deletions — important because Apps Script has a hard 6-minute execution limit,
  and looping single-row deletes on a sheet with hundreds or thousands of rows can
  approach or exceed that limit.
- **Export commits to Ledger before removing from New_Matches**, in that order —
  so if anything ever interrupts an export partway through, the worst case is a
  contact that's recorded as sent but not yet cleaned out of the queue (safely
  fixable with **Clean Up New_Matches**), never a contact that gets lost or
  double-counted.

## 9. Code file reference

| File | What it does |
|---|---|
| `Config.js` | Spreadsheet IDs/gids for the external Profiles and Master Contacts sheets, the exact column-header names expected in each, the Drive export-folder name, and the Band-strength ranking used to break duplicate-website ties. |
| `SheetIO.js` | This project's own tab names and column layouts (`New_Matches`, `Ledger`, `Errors`), the friendly BD-facing CSV column labels, and the list of Error types. |
| `Utils.js` | Shared helpers: looking up a sheet by gid, reading/validating headers, normalizing a website for matching, the self-migrating column-layout enforcement, and the bulk row-removal helper. |
| `SetupSheets.js` | Creates the three owned tabs with correct headers if they don't exist yet. Safe to re-run. |
| `Matching.js` | The core join logic — `runMatching()` does the full match+dedupe+errors process described in §4. Also holds the cleanup and backfill tools. |
| `Export.js` | Everything related to turning a filtered slice of `New_Matches` into a downloadable CSV: preview counts, building and saving the CSV to Drive, committing to `Ledger`, listing/regenerating past batches, and exporting the Errors tab. |
| `Menu.js` | Builds the "BD Contacts" custom menu when the spreadsheet is opened, and wires each menu item to its function or dialog. |
| `DownloadDialog.html` | The popup for downloading contacts — date range, Band checkboxes, a live preview count, and the export action. |
| `RedownloadDialog.html` | The popup listing past export batches, with links to the original files and a regenerate option if a file was deleted. |
| `LinkDialog.html` | A small popup showing a link to a just-exported file (used for the Errors CSV export). |
| `appsscript.json` | Project manifest — timezone `Asia/Kolkata`, V8 runtime, and the three OAuth scopes this project needs (Sheets, full Drive, and dialog UI). |

## GitHub

This folder does not currently have its own git repository or remote — it is not
yet tracked on GitHub. If you'd like it version-controlled, it can be initialized
as its own repo (the same way the Manufacturing and RocketReach pipelines were).
