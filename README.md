# LD 810 — Applied Statistics Practice Questions for Learning and Fun

Self-paced practice app for LD 810: Applied Statistics and Quantitative Research
Methods, Saint Martin's University. Built and maintained by Chris Meiers, PhD.

The app exists to build statistics muscle memory - reading a mean, a p-value or a
confidence interval correctly without stopping to think - and to practice turning
data into visualizations that support leadership decisions.

## Files

| File | What it is |
|---|---|
| `index.html` | The student app. Self-contained React page; loads `bank.json` and `config.json` at runtime. |
| `bank.json` | The question pool, session map, exam presets, themed-set labels, skins and credits. The only file that changes when questions change. |
| `console.html` | Instructor console - live in-class polling and class results. |
| `Code.gs` | Google Apps Script behind the results endpoint; writes practice runs to the results Sheet. Deploy in Apps Script, not from here. |
| `config.example.json` | Template for `config.json` (endpoint + cohort password). Copy it, fill it in; the real file is gitignored. |

## Question tiers (`c` field on every item)

| Tier | What it is | Shows a source line |
|---|---|---|
| `authored` | Written to the lecture slides | no |
| `lecture` | Textbook items rewritten as scenarios to match lecture | yes |
| `exam` | Used on a Fall 2025 quiz or exam | no |
| `pub` | Publisher test-bank items, application level | yes |
| `news` | Built from real reported figures, each with outlet, date and link | yes, with the link |
| `theme` | Themed sets - same statistics, different scenery | no |
| `extra` | Chapters the course does not cover; excluded from the default pool behind the "Good to know" toggle | yes |

## Running it locally

The page fetches `bank.json`, so `file://` will not work. Serve the folder:

    python3 -m http.server 8811

then open http://localhost:8811/index.html

## Editing questions

Edit `bank.json` only. `index.html` reads the themed-set labels, skins, source
lines, credits and counts from it, so most wording changes need no HTML edit.
Validate before committing: unique `i` ids, 2-6 options, every `a` index inside
range, and every session in `s` present in the `m` map.

## Attribution

Textbook items are drawn from or adapted from Salkind & Frey, *Statistics for
People Who (Think They) Hate Statistics* (SAGE). A tribute to the Department of
Educational Psychology at the University of Kansas and to Dr. William Skorupski.

"The grammar of science is statistics." - Karl Pearson

## Running a session

Three buttons on the console's **Build a quiz** screen, after you have selected items:

| Button | Who joins | Recorded as |
|---|---|---|
| Run this live in class | Students, via the banner on the main page | `cohort=LD810` |
| Open session — guests welcome | Anyone, no class password | `cohort=guest`, plus a first name if they give one |
| Test run — nothing recorded | Anyone | nothing at all |

Each writes a banner at the top of the console that only turns green once the
Apps Script confirms the mode. **A red banner means the deployment is stale** —
redeploy (Deploy → Manage deployments → edit → New version) or end the session.

Filters include **themed sets** as well as sessions and topics, so a live round
can be all Sporting KC, or Sporting KC narrowed to ANOVA.

## No-record practice

`index.html?norecord=1` opens the student app in a mode that never posts a
practice run. Read from the URL only, never stored, so it cannot stick on a
student's device.

## Results sheet

Columns: `timestamp, run_id, item_id, correct, sessions, topics, timer, cohort, name`.
The `name` column is new and back-fills as blank on existing rows; `sheet_()`
adds it automatically on the next write.

Maintenance functions live at the bottom of `Code.gs` and are **editor-only** —
no `op` routes to them, so no deployment is needed and no student can reach them.
Run `listRuns()` to see what is there, `previewDeleteRuns([...])` to check, then
`deleteRuns([...])` to remove. Deletion snapshots the whole tab first.

## The three links

| Who | Link | Practice pool | Reporting |
|---|---|---|---|
| Anyone | `https://chrismeiers-git.github.io/ld810/` | everything | topics and themes, pooled — needs a granted email |
| LD 810 students | `https://chrismeiers-git.github.io/ld810/?class=1` | everything, tagged to the class | sessions, topics and themes for LD 810 — needs a `student` email |
| You | `console.html` | — | full detail, including per-item |

Both site links are permanent. `?class=1` is the only difference between them.

## Granting access

The roster is a **`roster` tab in the results spreadsheet** — never in this repo.
This repo is public, so a list of student addresses here would be a public
roster, in git history forever, and would gate nothing: the check would run in
JavaScript the visitor controls. Keeping it in the Sheet means the list stays
private and you can add or remove someone without touching the site.

Run these from the Apps Script editor:

```
grantAccess('colleague@example.edu', 'viewer', 'reporting only')
grantMany(['one@example.edu','two@example.edu'], 'student', 'LD 810 Fall 2026')
revokeAccess('someone@example.edu')
listAccess()
```

Roles: `student` = class link and class reporting · `viewer` = public reporting
only · `instructor` = both.

**What this is and is not.** It keeps the roster private and lets you add and
revoke people. It is not authentication: anyone who knows a listed address
could type it. That is proportionate here — the data is anonymous, ungraded
practice answers — but do not treat the class view as private to the class.

The server decides every time. An address that is not on the roster gets a
refusal, never data; a `viewer` asking for the class scope is refused. The
browser only remembers which address was typed, on that person's own device.
