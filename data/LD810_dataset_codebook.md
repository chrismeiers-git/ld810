# LD 810 — Practice Quiz Response Dataset · Codebook

**Prepared by Chris Meiers**

---

## Read this first

**The response rows in this dataset are simulated.** No student produced them.
They describe a fictional prior cohort at **Big Tree State University** — the
invented institution the course's own quiz scenarios already use — so the file
cannot be mistaken for a real class. Every row carries `data_source = simulated`
and `cohort = BIGTREE-FA25`.

**The item columns are real.** Every stem, option, answer key, tier, topic,
session tag and source note comes straight out of `bank.json`, the live
1,289-item pool behind the practice app at
<https://chrismeiers-git.github.io/ld810/>. When you look up an item here, you
are looking at the actual item.

The dataset is deterministic. `build_dataset.py` (seed 810) reproduces these
files byte for byte from `bank.json`.

---

## Files

| File | Rows | What it is |
|---|---|---|
| `LD810_responses_master_SIM.csv` | 12,906 | **The master file.** One row per item response, with every item attribute merged on. 51 columns. |
| `LD810_responses_master_SIM_lite.csv` | 12,906 | Same rows, minus the four long text columns. 47 columns, much faster in JASP. |
| `LD810_items_master.csv` | 1,144 | One row per item **that was actually answered at least once**. Adds `n_responses`. Use it to check an item, or as a small dataset in its own right. |
| `build_dataset.py` | — | The generator. Re-run it after any change to `bank.json`. |

All three CSVs are UTF-8 with a byte-order mark, so Excel, SPSS and JASP open
them without a character-encoding step.

---

## Structure

Each row is **one student answering one item on one occasion**. The same
student can meet the same item more than once — `exposure_number` says which
time this was. Rows nest three deep:

```
student  (18)  →  run  (630 quiz sittings)  →  response  (12,906)
                  item (1,144 answered; the pool holds 1,289)
```

`LD810_items_master.csv` holds only the 1,144 items that were answered at least
once, so it joins to the response file one-to-one on `item_id` with nothing left
over on either side. The 145 items with no responses are mostly `extra`-tier
(good-to-know chapters, which the presets never draw from) plus a few that the
random draws simply never reached. The full 1,289 remain in `bank.json`, and
`build_dataset.py` will pick any of them up once they get answered.

`n_responses` (items file only) is how many times that item was answered. It is
a count, not an outcome — item difficulty is yours to compute.

**Decide your unit of analysis before you start.** Most questions in this
dataset live at the *response* level or the *item* level. Only 18 students
exist, so any test that treats the student as the case has n = 18 — which is a
real constraint worth writing about, not a flaw to hide.

---

## Columns

### Who and when

| Column | Type | Notes |
|---|---|---|
| `response_id` | string | Unique key. `R000001`–`R012906`. |
| `data_source` | string | Always `simulated`. |
| `cohort` | string | Always `BIGTREE-FA25`. |
| `student_id` | string | `BTS-01` … `BTS-18`. Pseudonym. |
| `student_track` | nominal | K-12 / Higher Ed / Healthcare Leadership. |
| `student_prior_stats` | 0/1 | Took a stats course before this one. |
| `run_id` | string | One quiz sitting. `run-####` or `live-####`. |
| `mode` | nominal | `practice` (on their own) or `live` (in class, instructor-paced). |
| `preset` / `preset_label` | nominal | Which button they pressed: a Lab Check, an Exam set, a theme, or free play. |
| `item_position` | ratio | 1 = first item in that run. Use it to test fatigue. |
| `response_date` | date | `YYYY-MM-DD`. |
| `response_datetime` | datetime | To the second. |
| `week_of_term` | ratio | 1–15. Term runs Aug 27 – Dec 10. |
| `day_of_week` | nominal | `Mon` … `Sun`. Class meets Wednesday. |
| `hour_of_day` | ratio | 0–23, local. |
| `time_block` | ordinal | Morning / Afternoon / Evening / Late night. |

### The item

| Column | Type | Notes |
|---|---|---|
| `item_number` | ratio | 1–1,289, the item's position in `bank.json`. |
| `item_id` | string | The bank's own id, e.g. `S07-23`, `NORM-01`, `BRO-42`. |
| `topic` | nominal | Fine-grained topic, e.g. "Confidence intervals". |
| `tier_code` / `tier_label` | nominal | Where the item came from: `authored`, `lecture`, `exam`, `pub`, `theme`, `news`, `extra`. |
| `session_primary` | ordinal | 1–13, the content session the item belongs to. |
| `session_name` | nominal | e.g. "The Normal Curve and z-Scores". |
| `session_all` | string | Pipe-separated when an item spans sessions (`9\|10`). |
| `theme_code` / `theme_label` | nominal | Blank unless it is a themed item (Broncos, Taylor's Version, AI, Adam Kay, Higher Ed, Sporting KC). |
| `exam_block` | nominal | `exam1`, `exam2`, or `none`. |
| `lab_block` | nominal | `lab1`–`lab4`, or `none`. |
| `extra_topic` | nominal | Set only for good-to-know items outside the course. |
| `has_source_line` | 0/1 | Whether the item shows a textbook source line. Full text is in `LD810_items_master.csv`. |
| `news_outlet`, `news_date`, `news_sourced`, `news_url` | string | Current-events items only. |
| `n_options` | ratio | Almost always 4; a few are 2. Drives the guessing floor. |
| `correct_position` | nominal | 1–4. Which slot holds the key. |
| `correct_option_text` | string | The keyed answer. |
| `stem_chars` | ratio | Length of the question. |
| `key_chars` | ratio | Length of the correct option. |
| `mean_distractor_chars` | ratio | Mean length of the wrong options. |
| `key_length_advantage` | ratio | `key_chars − mean_distractor_chars`. Positive means the correct answer is the longest — a classic test-writing tell. |
| `numeric_item` | 0/1 | The stem contains a number, i.e. it probably requires calculation. |

### The response

| Column | Type | Notes |
|---|---|---|
| `exposure_number` | ratio | 1 = first time this student saw this item. |
| `device` | nominal | desktop / laptop / mobile / tablet. **Has missing values.** |
| `chosen_position` | nominal | 1–4, which option they picked. |
| `chosen_option_text` | string | The text of what they picked. |
| `correct` | 0/1 | **The main outcome.** |
| `response_time_sec` | ratio | Seconds on that item. **Has missing values and severe outliers.** |

### The two text fields

| Column | What it holds |
|---|---|
| `item_text_full` | The whole item on one line: `Q: <stem> \|\| A) … \| B) … [X] \| C) … \| D) …`. The `[X]` marks the correct answer. |
| `response_text` | What the student did: `Chose B) … - CORRECT`, or `Chose D) … - INCORRECT (key: B) …)`. |

---

## The messy parts (these are deliberate)

- **`response_time_sec` has a long right tail.** Median 10.1 s, 95th percentile
  26 s, maximum 7,775 s. Those extremes are people who left the tab open and
  came back. Decide what to do with them and say so — trimming, winsorizing,
  a log transform, or a defended cut-off are all reasonable; ignoring them is not.
- **226 responses came in under 2 seconds.** Nobody reads a question that fast.
  They are click-throughs, and they are near chance. Whether they belong in the
  analysis is a judgment call you have to make and justify.
- **160 rows have no `response_time_sec` and 78 have no `device`.** Missing, not
  zero. Check that your software is treating blanks as missing rather than as 0.
- **Runs are unbalanced.** Students answered between 205 and 1,210 items each.
  A raw pooled mean is weighted toward whoever practiced most.
- **Items were not randomly assigned.** Students chose which preset to drill,
  so the mix of items differs by student and by week. Any comparison across
  weeks is confounded with which items were on offer.

---

## Starter questions, mapped to the course

| Session | Question you could ask of this dataset |
|---|---|
| 2 — Variables and shape | What level of measurement is each column? Plot `response_time_sec` — describe the shape before you touch a test. |
| 3 — Center and spread | Mean vs. median response time. Which one would you report, and to whom? |
| 4 — Reliability and validity | Is "seconds on an item" a valid measure of effort? What does the 7,775-second row do to that claim? |
| 6 — Normal curve, *z* | Convert item difficulty (`p`-value per item) to *z*. Which items are more than 2 SD from the mean, and what do they have in common? |
| 7 — Confidence intervals | Put a 95% CI around each week's accuracy. Do the weekly intervals overlap? |
| 8 — Hypothesis testing | Is late-night practice worse than afternoon practice, or is that gap noise? |
| 9 — *t*-tests | Themed items vs. authored items: real difference in accuracy, or not? |
| 10 — ANOVA | Accuracy across the 13 content sessions. Which sessions differ, and post-hoc, from which? |
| 11 — Correlation and regression | Does `item_position` predict accuracy — do people fade as a run goes on? |
| 12 — Multiple regression | Predict `correct` from position, exposure, week, tier and whether the item is numeric. Which predictors survive together? |
| 13 — Factor analysis | Take the items tagged to one session and ask whether they hang together. |

### Three questions with more in them than they look

1. **Does practice actually help, or do people just get easier items?**
   Accuracy climbs from about .51 in week 1 to about .75 in week 15. Before
   calling that learning, check what changed alongside it: exposure count,
   item mix, and who was still practicing by week 15.

2. **Does the answer-key length tell still work?**
   `key_length_advantage` is the exact thing the item audit went after. Across
   794 items with enough responses, the correlation with item difficulty is
   r ≈ .05 — small, and probably not significant at this n. Writing up *why a
   null result is the good outcome here*, and what sample size would have been
   needed to detect a real effect of that size, is a better paper than most
   significant findings.

3. **When do people practice, and does it matter?**
   Volume spikes in weeks 8 and 14 — the exam weeks. Is cramming associated
   with worse accuracy in the moment? And does it tell you anything about
   what happens next?

---

## When the real data arrives

The live app writes to a Google Sheet through the Apps Script endpoint. Once it
has been collecting the added fields for long enough — per-item elapsed seconds,
chosen option, item position, per-item timestamp — the real responses drop into
this same column layout and this simulated file is retired.

Two things have to happen first: the class has to be told that pooled,
de-identified practice data will be used as a course dataset, and anyone who
would rather not be in it needs a way to say so.
