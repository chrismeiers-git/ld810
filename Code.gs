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
    sh.appendRow(['timestamp', 'run_id', 'item_id', 'correct', 'sessions', 'topics', 'timer', 'cohort', 'name',
                  'item_position', 'chosen_option', 'response_time_sec', 'answered_at']);
    sh.setFrozenRows(1);
  }
  // migrate sheets created before the cohort column existed
  if (sh.getLastColumn() < 8) {
    sh.getRange(1, 8).setValue('cohort');
  }
  // migrate sheets created before the guest-name column existed
  if (sh.getLastColumn() < 9) {
    sh.getRange(1, 9).setValue('name');
  }
  // migrate sheets created before the per-response detail columns existed.
  // Older rows keep blanks in J..M; that is missing data, not zero.
  if (sh.getLastColumn() < 13) {
    sh.getRange(1, 10, 1, 4).setValues([['item_position', 'chosen_option', 'response_time_sec', 'answered_at']]);
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
  return { active: false, idx: -1, revealed: false, items: [], runId: '', label: '', test: false, guest: false };
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
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
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
    test: !!s.test,
    guest: !!s.guest
  };
}

/* ---------- POST ---------- */

/* =====================================================================
   Access roster.

   Lives in a tab of THIS spreadsheet, never in the public repo. Columns:
     A email | B role | C note | D added
   Roles:
     student    - the LD 810 class link: course pool + class reporting
     viewer     - the public reporting view only
     instructor - everything, including the console

   This gates convenience, not secrets. Anyone who knows a listed address
   could type it. It exists so the roster stays private and so you can add
   or remove someone without touching the site.
   ===================================================================== */

var ROSTER_NAME = 'roster';

function roster_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ROSTER_NAME);
  if (!sh) {
    sh = ss.insertSheet(ROSTER_NAME);
    sh.appendRow(['email', 'role', 'note', 'added']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function normEmail_(v) {
  return String(v || '').trim().toLowerCase();
}

/* Returns {ok, role, label} for an email, or {ok:false} if not listed. */
function lookupAccess_(email) {
  var want = normEmail_(email);
  if (!want || want.indexOf('@') < 1) return { ok: false, error: 'That does not look like an email address.' };
  var sh = roster_();
  var last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'No one has been granted access yet.' };
  var vals = sh.getRange(2, 1, last - 1, 3).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (normEmail_(vals[i][0]) === want) {
      var role = String(vals[i][1] || 'viewer').trim().toLowerCase();
      if (['student', 'viewer', 'instructor'].indexOf(role) < 0) role = 'viewer';
      return { ok: true, role: role, email: want, note: String(vals[i][2] || '') };
    }
  }
  return { ok: false, error: 'That address is not on the list. Ask Chris to add it.' };
}

/* Add or update one address. Run from the editor:
     grantAccess('colleague@example.edu', 'viewer', 'reporting only')
     grantAccess('someone@example.edu', 'student', 'LD 810 Fall 2026')  */
function grantAccess(email, role, note) {
  var want = normEmail_(email);
  if (!want || want.indexOf('@') < 1) throw new Error('Not an email address: ' + email);
  role = String(role || 'student').trim().toLowerCase();
  if (['student', 'viewer', 'instructor'].indexOf(role) < 0) throw new Error('role must be student, viewer or instructor');
  var sh = roster_();
  var last = sh.getLastRow();
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (normEmail_(vals[i][0]) === want) {
        sh.getRange(i + 2, 2).setValue(role);
        if (note) sh.getRange(i + 2, 3).setValue(note);
        Logger.log('Updated ' + want + ' -> ' + role);
        return want;
      }
    }
  }
  sh.appendRow([want, role, note || '', new Date()]);
  Logger.log('Added ' + want + ' as ' + role);
  return want;
}

/* Add several at once: grantMany(['a@x.edu','b@x.edu'], 'student', 'LD 810') */
function grantMany(emails, role, note) {
  (emails || []).forEach(function (e) { grantAccess(e, role, note); });
  Logger.log('Roster now holds ' + Math.max(0, roster_().getLastRow() - 1) + ' address(es).');
}

/* Remove one address. */
function revokeAccess(email) {
  var want = normEmail_(email);
  var sh = roster_();
  var last = sh.getLastRow();
  if (last < 2) { Logger.log('Roster is empty.'); return 0; }
  var vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (normEmail_(vals[i][0]) === want) { sh.deleteRow(i + 2); Logger.log('Removed ' + want); return 1; }
  }
  Logger.log('Not found: ' + want);
  return 0;
}

/* Print the roster to the log. */
function listAccess() {
  var sh = roster_();
  var last = sh.getLastRow();
  if (last < 2) { Logger.log('Roster is empty.'); return []; }
  var vals = sh.getRange(2, 1, last - 1, 3).getValues();
  Logger.log(vals.length + ' address(es):');
  vals.forEach(function (r) { Logger.log('  ' + r[0] + '  [' + r[1] + ']  ' + (r[2] || '')); });
  return vals;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var op = body.op || 'practice';
    if (op === 'practice') return postPractice_(body);
    if (op === 'live_start') return postLiveStart_(body);
    if (op === 'live_state') return postLiveState_(body);
    if (op === 'live_end') return postLiveEnd_();
    if (op === 'live_answer') return postLiveAnswer_(body);
    if (op === 'access_check') return json_(lookupAccess_(body.email));
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
  var rows = results.map(function (r, k) {
    var ms = Number(r.ms);
    return [
      stamp, runId, String(r.id), Number(r.correct) ? 1 : 0,
      sessions, topics, timer, cohort, String(body.name || '').slice(0, 40),
      Number(r.pos) || (k + 1),
      (r.choice === undefined || r.choice === null) ? '' : Number(r.choice),
      (isNaN(ms) || ms <= 0) ? '' : Math.round(ms / 100) / 10,
      r.at ? String(r.at) : ''
    ];
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
    test: !!body.test,
    guest: !!body.guest
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
      var liveCohort = s.guest ? 'guest' : String(body.cohort || 'open');
      var lms = Number(body.ms);
      appendRows_([[new Date(), s.runId, itemId, correct, '', '', 'live', liveCohort,
                    String(body.name || '').slice(0, 40),
                    idx + 1, choice + 1,
                    (isNaN(lms) || lms <= 0) ? '' : Math.round(lms / 100) / 10,
                    new Date().toISOString()]]);
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

    /* Reporting scopes.
         public - everything pooled, no cohort split. Open to anyone who is
                  on the roster; the client shows topics and themes only.
         class  - LD 810 rows only. Requires a student or instructor address.
       An unlisted address gets an empty result, never data. */
    if (mode === 'summary') {
      var scope = String(p.scope || '').toLowerCase();
      if (scope === 'public' || scope === 'class') {
        var acc = lookupAccess_(p.email || '');
        if (!acc.ok) return json_({ error: acc.error || 'Not authorized.', denied: true });
        if (scope === 'class' && acc.role === 'viewer') {
          return json_({ error: 'That address has reporting access, but not to the class view.', denied: true });
        }
        var out = summary_(scope === 'class' ? (p.cohort || 'LD810') : 'all');
        out.scope = scope;
        out.role = acc.role;
        return json_(out);
      }
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


/* =====================================================================
   Maintenance helpers — run these from the Apps Script editor only.
   They are not reachable over the web app: no `op` routes to them, so
   deploying is not required and no student can trigger them.

   Order of use:  backupResponses_()  ->  listRuns()  ->  deleteRuns([...])
   ===================================================================== */

/* Snapshot the responses tab before any deletion. Returns the new tab name.
   deleteRuns() calls this for you; you can also call it on its own. */
function backupResponses_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('No "' + SHEET_NAME + '" tab to back up.');
  var name = 'backup_' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd_HHmmss');
  sh.copyTo(ss).setName(name);
  Logger.log('Backup tab created: ' + name);
  return name;
}

/* List every practice/live run in the sheet, newest first, so you can see
   what is actually there before deleting anything. Read the output in
   Executions (or View -> Logs). Copy the run ids you want gone into
   deleteRuns([...]). */
function listRuns() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) { Logger.log('No responses yet.'); return []; }
  var vals = sh.getRange(2, 1, last - 1, 8).getValues();
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var byRun = {};
  vals.forEach(function (r) {
    var id = String(r[1]);
    if (!byRun[id]) {
      byRun[id] = { id: id, when: r[0], rows: 0, correct: 0, cohort: String(r[7] || ''), timer: String(r[6] || '') };
    }
    byRun[id].rows++;
    byRun[id].correct += Number(r[3]) ? 1 : 0;
    if (r[0] instanceof Date && r[0] < byRun[id].when) byRun[id].when = r[0];
  });
  var runs = Object.keys(byRun).map(function (k) { return byRun[k]; });
  runs.sort(function (a, b) { return b.when - a.when; });
  Logger.log(runs.length + ' run(s), ' + (last - 1) + ' answer rows total. Newest first:');
  runs.forEach(function (r) {
    Logger.log([
      Utilities.formatDate(new Date(r.when), tz, 'yyyy-MM-dd HH:mm'),
      r.rows + ' answers',
      r.correct + ' correct',
      'cohort=' + (r.cohort || '(none)'),
      (r.timer === 'live' ? 'LIVE' : 'practice'),
      r.id
    ].join('  |  '));
  });
  return runs;
}

/* Preview only: what deleteRuns() would remove for these run ids.
   Nothing is changed. */
function previewDeleteRuns(runIds) {
  var ids = {};
  (runIds || []).forEach(function (id) { ids[String(id)] = true; });
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) { Logger.log('Nothing to delete.'); return 0; }
  var vals = sh.getRange(2, 1, last - 1, 8).getValues();
  var n = 0;
  vals.forEach(function (r) { if (ids[String(r[1])]) n++; });
  Logger.log('previewDeleteRuns: ' + n + ' row(s) across ' + Object.keys(ids).length + ' run id(s) would be removed. ' + (last - 1 - n) + ' row(s) would remain.');
  return n;
}

/* Delete every answer row belonging to the given run ids.
   Takes a backup tab first. Pass the ids as an array of strings, e.g.
     deleteRuns(['3f2c...','9ab1...'])
   Rows are removed bottom-up so the indexes stay valid. */
function deleteRuns(runIds) {
  var ids = {};
  (runIds || []).forEach(function (id) { ids[String(id)] = true; });
  if (!Object.keys(ids).length) { Logger.log('deleteRuns: no run ids given, nothing done.'); return 0; }
  var backup = backupResponses_();
  var sh = sheet_();
  var last = sh.getLastRow();
  var vals = sh.getRange(2, 1, last - 1, 8).getValues();
  var targets = [];
  for (var i = 0; i < vals.length; i++) {
    if (ids[String(vals[i][1])]) targets.push(i + 2); // sheet row number
  }
  for (var j = targets.length - 1; j >= 0; j--) sh.deleteRow(targets[j]);
  Logger.log('deleteRuns: removed ' + targets.length + ' row(s). Backup tab: ' + backup);
  return targets.length;
}

/* Convenience: delete every run that started strictly before a cutoff.
   Dates are yyyy-MM-dd in the spreadsheet's time zone.
     previewDeleteBefore('2026-09-14')   // look first
     deleteBefore('2026-09-14')          // then act
   Use this only if you are sure no student practice sits in that window;
   otherwise pick run ids from listRuns() and use deleteRuns(). */
function previewDeleteBefore(cutoff) {
  return previewDeleteRuns(runsBefore_(cutoff));
}

function deleteBefore(cutoff) {
  return deleteRuns(runsBefore_(cutoff));
}

function runsBefore_(cutoff) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var edge = new Date(cutoff + 'T00:00:00');
  var out = [];
  listRuns().forEach(function (r) {
    if (new Date(r.when) < edge) out.push(r.id);
  });
  Logger.log('runsBefore_(' + cutoff + '): ' + out.length + ' run(s) match (tz ' + tz + ').');
  return out;
}
