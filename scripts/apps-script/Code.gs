/**
 * BUNII allowlist — Google Apps Script web app.
 *
 * The durable store behind GOOGLE_SHEETS_WEBAPP_URL. A serverless filesystem is
 * read-only in production, so the local data/allowlist.json fallback only works
 * in development; deployed, every submission lands here.
 *
 * Contract with src/lib/allowlist-store.ts:
 *
 *   GET  ->  { count: number }
 *   POST {handle, wallet, xUserId, quoteLink, inviteCode}
 *        ->  { position: number }            on success
 *        ->  { error: "duplicate" }          wallet already listed
 *        ->  { error: "duplicate_x" }        X account already listed
 *        ->  { error: "<message>" }          anything else; the site treats an
 *                                            unrecognised error as a 502
 *
 * Setup is in README.md next to this file.
 */

/**
 * Bumped whenever this file changes. `?version` returns it, so a deployment
 * can be checked against the repo without guessing from behaviour — the whole
 * reason the breakdown endpoint went unnoticed as missing for three rounds.
 */
var SCRIPT_VERSION = 3;

/** Tab the entries live on. Created on first write if missing. */
var SHEET_NAME = 'Allowlist';

/**
 * The eligibility list: every wallet holding one of the Furnace collections,
 * and which collection. Written by scripts/push-gtd.mjs from the snapshots.
 *
 * This is not the claim list. Claims land in Allowlist with source=claim, and
 * the 1,111 cap counts those — a wallet being here only means it may claim.
 */
var GTD_SHEET = 'GTD';
var GTD_HEADERS = ['Wallet', 'Community'];

var HEADERS = [
  'Joined At',
  'Handle',
  'Wallet',
  'Invite Code',
  'X User ID',
  'Quote Link',
  'Source',
  'Community',
];

/**
 * Optional shared secret. Leave empty to accept any caller — the URL itself is
 * unguessable, which is usually enough for an allowlist. To turn it on, set a
 * value here and the same value as ALLOWLIST_WEBHOOK_SECRET in the site's env,
 * then add it to the POST body as `secret` in submitToSheet().
 */
var SHARED_SECRET = '';

// --- entry points -----------------------------------------------------

function doGet(e) {
  try {
    // The site polls this for the "N already in" counter. `?source=claim`
    // narrows it to one flow, which is how the claim portal's cap stays
    // honest while both doors write to the same sheet.
    var p = (e && e.parameter) || {};

    // ?wallet=0x… asks whether that wallet is on the GTD list, and for which
    // communities. This is what the claim portal checks before letting a
    // holder through.
    // ?version says which copy is deployed.
    if (p.version !== undefined) {
      return json({ version: SCRIPT_VERSION });
    }

    if (p.wallet) {
      return json({ communities: gtdCommunitiesFor(p.wallet) });
    }

    // ?breakdown=claim reports how many claims each community has taken, so
    // the portal can show a ring per card rather than one bar for the lot.
    if (p.breakdown) {
      return json({ byCommunity: countByCommunity(p.breakdown) });
    }

    return json({ count: p.source ? countBySource(p.source) : countEntries() });
  } catch (err) {
    return json({ error: String(err) });
  }
}

function doPost(e) {
  // One writer at a time: two submissions arriving together would otherwise
  // both read the same row count and the second would overwrite the first.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json({ error: 'Busy, try again.' });
  }

  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (SHARED_SECRET && body.secret !== SHARED_SECRET) {
      return json({ error: 'unauthorised' });
    }

    // Bulk load of the eligibility list, rather than a single signup.
    if (body.action === 'gtd') {
      return json(writeGtd(body.rows || [], body.replace === true));
    }

    var handle = String(body.handle || '').trim();
    var wallet = String(body.wallet || '').trim();
    var inviteCode = String(body.inviteCode || '').trim();
    var xUserId = String(body.xUserId || '').trim();
    var quoteLink = String(body.quoteLink || '').trim();
    // Which door the entry came through, so the claim's cap can count only
    // claims and the two flows stay tellable apart in the sheet.
    var source = String(body.source || 'quests').trim();
    var community = String(body.community || '').trim();

    if (!handle || !wallet || !inviteCode) {
      return json({ error: 'Missing handle, wallet or invite code.' });
    }

    var sheet = getSheet();
    var rows = sheet.getLastRow() - 1; // minus the header row

    if (rows > 0) {
      // Both key columns in one read: fetching the whole sheet per submission
      // is the slow path that eventually times Apps Script out. The columns
      // are looked up by header rather than hard-coded, so reordering the
      // sheet can't silently point the duplicate check at the wrong data.
      var walletCol = HEADERS.indexOf('Wallet') + 1;
      var xIdCol = HEADERS.indexOf('X User ID') + 1;
      var first = Math.min(walletCol, xIdCol);
      var width = Math.abs(xIdCol - walletCol) + 1;

      var values = sheet.getRange(2, first, rows, width).getValues();
      var walletAt = walletCol - first;
      var xIdAt = xIdCol - first;

      for (var i = 0; i < values.length; i++) {
        var rowWallet = String(values[i][walletAt] || '').trim();
        var rowXId = String(values[i][xIdAt] || '').trim();

        if (rowWallet.toLowerCase() === wallet.toLowerCase()) {
          return json({ error: 'duplicate' });
        }
        if (xUserId && rowXId === xUserId) {
          return json({ error: 'duplicate_x' });
        }
      }
    }

    // Built from HEADERS for the same reason: the row's shape follows the
    // header order rather than being written out positionally.
    var row = [];
    row[HEADERS.indexOf('Joined At')] = new Date().toISOString();
    row[HEADERS.indexOf('Handle')] = handle;
    row[HEADERS.indexOf('Wallet')] = wallet;
    row[HEADERS.indexOf('Invite Code')] = inviteCode;
    row[HEADERS.indexOf('X User ID')] = xUserId;
    row[HEADERS.indexOf('Quote Link')] = quoteLink;
    row[HEADERS.indexOf('Source')] = source;
    row[HEADERS.indexOf('Community')] = community;
    sheet.appendRow(row);

    // Position is 1-based and counts entries, not spreadsheet rows.
    return json({ position: sheet.getLastRow() - 1 });
  } catch (err) {
    return json({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// --- helpers ----------------------------------------------------------

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function countEntries() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  // No tab yet means nobody has joined; don't create one just to count.
  if (!sheet) return 0;
  return Math.max(0, sheet.getLastRow() - 1);
}

// --- GTD: the eligibility list ----------------------------------------

function getGtdSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GTD_SHEET);
  if (!sheet) sheet = ss.insertSheet(GTD_SHEET);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(GTD_HEADERS);
    sheet.getRange(1, 1, 1, GTD_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Appends a batch of [wallet, community] rows, clearing first when asked.
 * Written with one setValues() call rather than appendRow per line: tens of
 * thousands of individual appends is the shape that times Apps Script out.
 */
function writeGtd(rows, replace) {
  var sheet = getGtdSheet();

  if (replace) {
    var had = sheet.getLastRow();
    // deleteRows, not clearContent: clearing empties the cells but leaves the
    // rows behind, so getLastRow() keeps counting them and the next append
    // lands past a block of blanks.
    if (had > 1) sheet.deleteRows(2, had - 1);
  }

  if (rows.length > 0) {
    var start = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(start, 1, rows.length, GTD_HEADERS.length).setValues(rows);
  }

  return { ok: true, added: rows.length, total: Math.max(0, sheet.getLastRow() - 1) };
}

/** Which communities a wallet holds, or [] if it holds none. */
function gtdCommunitiesFor(wallet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GTD_SHEET);
  if (!sheet) return [];

  var rows = sheet.getLastRow() - 1;
  if (rows < 1) return [];

  var needle = String(wallet || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(needle)) return [];

  var values = sheet.getRange(2, 1, rows, 2).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === needle) {
      out.push(String(values[i][1]).trim());
    }
  }
  return out;
}

/**
 * Claims per community, as { slug: n }.
 *
 * One pass over two columns rather than a query per community: sixteen
 * separate scans of the same sheet is the shape that makes Apps Script slow
 * enough to time the page out.
 */
function countByCommunity(source) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return {};

  var rows = sheet.getLastRow() - 1;
  if (rows < 1) return {};

  var sourceCol = HEADERS.indexOf('Source') + 1;
  var commCol = HEADERS.indexOf('Community') + 1;
  var first = Math.min(sourceCol, commCol);
  var width = Math.abs(commCol - sourceCol) + 1;

  var values = sheet.getRange(2, first, rows, width).getValues();
  var sourceAt = sourceCol - first;
  var commAt = commCol - first;

  var out = {};
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][sourceAt] || 'quests').trim() !== source) continue;
    var slug = String(values[i][commAt] || '').trim();
    if (!slug) continue;
    out[slug] = (out[slug] || 0) + 1;
  }
  return out;
}

/** Entries from one flow: 'claim' or 'quests'. */
function countBySource(source) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return 0;

  var rows = sheet.getLastRow() - 1;
  if (rows < 1) return 0;

  var col = HEADERS.indexOf('Source') + 1;
  var values = sheet.getRange(2, col, rows, 1).getValues();

  var n = 0;
  for (var i = 0; i < values.length; i++) {
    // Rows written before this column existed are quest entries.
    var v = String(values[i][0] || 'quests').trim();
    if (v === source) n++;
  }
  return n;
}

function json(obj) {
  return ContentService.createTextOutput(
    JSON.stringify(obj)
  ).setMimeType(ContentService.MimeType.JSON);
}

// --- manual test ------------------------------------------------------

/**
 * Run this from the Apps Script editor to check the wiring before pointing the
 * site at it, then read the Execution log. It exercises the real handlers, so
 * it writes a test row and then a duplicate of it — delete the row afterwards.
 */
function selfTest() {
  var entry = {
    secret: SHARED_SECRET,
    handle: '@test',
    wallet: '0x0000000000000000000000000000000000000001',
    inviteCode: 'BUNII-TEST01',
    xUserId: 'selftest-user-id',
    quoteLink: 'https://x.com/test/status/1234567890123456789',
  };
  var send = function (body) {
    return JSON.parse(
      doPost({ postData: { contents: JSON.stringify(body) } }).getContent()
    );
  };

  var before = JSON.parse(doGet({}).getContent()).count;
  var added = send(entry);
  var again = send(entry);
  var after = JSON.parse(doGet({}).getContent()).count;

  Logger.log('count before      : ' + before);
  Logger.log('submit            : ' + JSON.stringify(added));
  Logger.log('submit again      : ' + JSON.stringify(again));
  Logger.log('count after       : ' + after);

  var ok =
    typeof added.position === 'number' &&
    again.error === 'duplicate' &&
    after === before + 1;

  Logger.log(
    ok
      ? 'PASS — wiring is good. Delete the @test row before going live.'
      : 'FAIL — see the lines above; the site will not work against this sheet.'
  );
}
