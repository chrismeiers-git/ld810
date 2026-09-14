/**
 * LD 810 — practice results + live in-class sessions
 *
 * Two jobs:
 *   1. Receives anonymous practice results and appends them to a Sheet.
 *   2. Runs host-paced live sessions: the console sets which question is
 *      active, students poll for it, answers tally in cache for the live
 *      dashboard and land in the Sheet for the durable record.
 *
 * Live state lives in CacheService rather than the Sheet, so 2-second polling
 * from every student never touches a spreadsheet lock. The Sheet is only ever
 * appended to.
 *
 * Deploy: Extensions > Apps Script, paste this, Deploy > New deployment >
 * Web app, "Execute as: Me", "Who has access: Anyone", copy the /exec URL.
 * After editing later: Deploy > Manage deployments > pencil icon >
 * Version: New version > Deploy. The URL stays the same.
 */

var SHEET_NAME = 'responses';
var STATE_KEY = 'ld810_live_state';
var CACHE_TTL = 21600; // 6 hours, the CacheService maximum

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['timestamp', 'run_id', 'item_id', 'correct', 'sessions', 'topics', 'timer', 'cohort']);
    sh.setFrozenRows(1);
  }
  // migrate sheets created before the cohort column existed
  if (sh.getLastColumn() < 8) {
    sh.getRange(1, 8).setValue('cohort');
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function cache_() { return CacheService.getScriptCache(); }

function blankState_() {
  return { active: false, idx: -1, revealed: false, items: [], runId: '', label: '', test: false };
}

function getState_() {
  var raw = cache_().get(STATE_KEY);
  if (!raw) return blankState_();
  try { return JSON.parse(raw); } catch (e) { return blankState_(); }
}

function putState_(s) {
  cache_().put(STATE_KEY, JSON.stringify(s), CACHE_TTL);
  return s;
}

function tallyKey_(runId, idx) { return 'ld810_tally_' + runId + '_' + idx; }

function appendRows_(rows) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sh = sheet_();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
    return rows.length;
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function publicState_(s) {
  return {
    active: !!s.active,
    idx: s.idx,
    revealed: !!s.revealed,
    items: s.items || [],
    n: (s.items || []).length,
    label: s.label || '',
    test: !!s.test
  };
}

/* ---------- POST ---------- */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var op = body.op || 'practice';
    if (op === 'practice') return postPractice_(body);
    if (op === 'live_start') return postLiveStart_(body);
    if (op === 'live_state') return postLiveState_(body);
    if (op === 'live_end') return postLiveEnd_();
    if (op === 'live_answer') return postLiveAnswer_(body);
    return json_({ ok: false, error: 'Unknown op: ' + op });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function postPractice_(body) {
  var results = body.results || [];
  if (!results.length) return json_({ ok: true, written: 0 });
  var runId = Utilities.getUuid();
  var stamp = new Date();
  var sessions = (body.sessions || []).join('|');
  var topics = (body.topics || []).join('|');
  var timer = body.timer || '';
  var cohort = String(body.cohort || 'open');
  var rows = results.map(function (r) {
    return [stamp, runId, String(r.id), Number(r.correct) ? 1 : 0, sessions, topics, timer, cohort];
  });
  return json_({ ok: true, written: appendRows_(rows) });
}

function postLiveStart_(body) {
  var items = body.items || [];
  if (!items.length) return json_({ ok: false, error: 'No items supplied.' });
  var s = putState_({
    active: true, idx: -1, revealed: false,
    items: items.map(String),
    runId: Utilities.getUuid(),
    label: body.label || 'Live session',
    // A test session behaves exactly like a real one - students can join and
    // the live bars still update - but nothing is written to the Sheet.
    test: !!body.test
  });
  return json_({ ok: true, state: publicState_(s) });
}

function postLiveState_(body) {
  var s = getState_();
  if (!s.active) return json_({ ok: false, error: 'No live session is running.' });
  if (typeof body.idx === 'number') s.idx = body.idx;
  if (typeof body.revealed === 'boolean') s.revealed = body.revealed;
  putState_(s);
  return json_({ ok: true, state: publicState_(s) });
}

function postLiveEnd_() {
  var s = getState_();
  s.active = false; s.idx = -1; s.revealed = false;
  putState_(s);
  return json_({ ok: true });
}

function postLiveAnswer_(body) {
  var s = getState_();
  if (!s.active) return json_({ ok: false, error: 'No live session is running.' });

  var idx = Number(body.idx);
  var choice = Number(body.choice);
  var correct = Number(body.correct) ? 1 : 0;
  var itemId = String(body.id || '');
  if (isNaN(idx) || isNaN(choice) || !itemId) {
    return json_({ ok: false, error: 'Bad answer payload.' });
  }

  // tally in cache, guarded so simultaneous submissions don't clobber each other
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var key = tallyKey_(s.runId, idx);
    var raw = cache_().get(key);
    var t = raw ? JSON.parse(raw) : { counts: {}, total: 0, right: 0 };
    t.counts[choice] = (t.counts[choice] || 0) + 1;
    t.total += 1;
    t.right += correct;
    cache_().put(key, JSON.stringify(t), CACHE_TTL);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }

  // durable copy, so live answers feed the same analytics pool as practice.
  // Skipped entirely for a test session: the tally above still drives the live
  // display, but the Sheet never sees the row.
  if (!s.test) {
    try {
      appendRows_([[new Date(), s.runId, itemId, correct, '', '', 'live', String(body.cohort || 'open')]]);
    } catch (err) { /* tally is already in; never fail a student's submit over this */ }
  }

  return json_({ ok: true });
}

/* ---------- GET ---------- */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var mode = p.mode || 'summary';

    if (mode === 'live') return json_(publicState_(getState_()));

    if (mode === 'live_tally') {
      var s = getState_();
      var idx = Number(p.idx);
      var raw = cache_().get(tallyKey_(s.runId, idx));
      var t = raw ? JSON.parse(raw) : { counts: {}, total: 0, right: 0 };
      return json_({
        idx: idx, counts: t.counts, total: t.total,
        right: t.right, state: publicState_(s)
      });
    }

    return json_(summary_(p.cohort || ''));
  } catch (err) {
    return json_({ error: String(err) });
  }
}

/**
 * cohort '' or 'all' -> everything. Otherwise only rows matching that cohort.
 * Rows written before the cohort column existed are treated as 'open'.
 */
function summary_(cohort) {
  var sh = sheet_();
  var last = sh.getLastRow();
  var want = String(cohort || '').toLowerCase();
  var blank = { runs: 0, answers: 0, items: [], cohort: want || 'all', cohorts: [] };
  if (last < 2) return blank;

  // columns B..H: run_id, item_id, correct, sessions, topics, timer, cohort
  var values = sh.getRange(2, 2, last - 1, 7).getValues();
  var tally = {}, runs = {}, seen = {}, answers = 0;

  for (var i = 0; i < values.length; i++) {
    var runId = values[i][0];
    var itemId = String(values[i][1]);
    if (!itemId) continue;
    var row = String(values[i][6] || 'open').toLowerCase();
    seen[row] = (seen[row] || 0) + 1;
    if (want && want !== 'all' && row !== want) continue;
    runs[runId] = true;
    answers += 1;
    if (!tally[itemId]) tally[itemId] = { id: itemId, n: 0, right: 0 };
    tally[itemId].n += 1;
    tally[itemId].right += Number(values[i][2]) ? 1 : 0;
  }

  var items = Object.keys(tally).map(function (k) { return tally[k]; });
  return {
    runs: Object.keys(runs).length,
    answers: answers,
    items: items,
    cohort: want || 'all',
    cohorts: Object.keys(seen).map(function (k) { return { name: k, answers: seen[k] }; })
  };
}
