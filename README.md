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
