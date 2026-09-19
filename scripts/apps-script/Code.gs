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

/** Tab the entries live on. Created on first write if missing. */
var SHEET_NAME = 'Allowlist';

var HEADERS = [
  'Joined At',
  'Handle',
  'Wallet',
  'Invite Code',
  'X User ID',
  'Quote Link',
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
    // The site polls this for the "N already in" counter.
    return json({ count: countEntries() });
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

    var handle = String(body.handle || '').trim();
    var wallet = String(body.wallet || '').trim();
    var inviteCode = String(body.inviteCode || '').trim();
    var xUserId = String(body.xUserId || '').trim();
    var quoteLink = String(body.quoteLink || '').trim();

    if (!handle || !wallet || !inviteCode) {
      return json({ error: 'Missing handle, wallet or invite code.' });
    }

    var sheet = getSheet();
    var rows = sheet.getLastRow() - 1; // minus the header row

    if (rows > 0) {
      // Read both key columns in one call. Reading the whole sheet per
      // submission is the slow path that makes Apps Script time out.
      var values = sheet.getRange(2, 2, rows, 4).getValues(); // B..E
      for (var i = 0; i < values.length; i++) {
        var rowWallet = String(values[i][1] || '').trim();
        var rowXId = String(values[i][3] || '').trim();

        if (rowWallet.toLowerCase() === wallet.toLowerCase()) {
          return json({ error: 'duplicate' });
        }
        if (xUserId && rowXId === xUserId) {
          return json({ error: 'duplicate_x' });
        }
      }
    }

    sheet.appendRow([
      new Date().toISOString(),
      handle,
      wallet,
      inviteCode,
      xUserId,
      quoteLink,
    ]);

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

function json(obj) {
  return ContentService.createTextOutput(
    JSON.stringify(obj)
  ).setMimeType(ContentService.MimeType.JSON);
}

// --- manual test ------------------------------------------------------

/**
 * Run this from the Apps Script editor to check the sheet wiring before
 * pointing the site at it. It writes a row, so delete it afterwards.
 */
function selfTest() {
  var res = doPost({
    postData: {
      contents: JSON.stringify({
        secret: SHARED_SECRET,
        handle: '@test',
        wallet: '0x0000000000000000000000000000000000000001',
        inviteCode: 'BUNII-TEST01',
        xUserId: 'test-user-id',
        quoteLink: 'https://x.com/test/status/1234567890123456789',
      }),
    },
  });
  Logger.log('POST -> ' + res.getContent());
  Logger.log('GET  -> ' + doGet({}).getContent());
}
