#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LD 810 - build the practice-response teaching dataset.

Reads ../bank.json (the real 1,289-item pool) and writes:

  LD810_items_master.csv                 one row per ITEM        (real)
  LD810_responses_master_SIM.csv         one row per ITEM RESPONSE (simulated)
  LD810_dataset_codebook.md              what every column means

IMPORTANT
---------
Every ITEM column is real: stems, options, keys, tiers, sessions, topics and
source notes come straight out of bank.json.

Every RESPONSE row is SIMULATED. No student produced it. The rows describe a
fictional prior cohort at Big Tree State University - the invented institution
the course's own scenarios already use - so the file can never be mistaken for
a real class. When the live app has collected enough real responses, the same
column layout takes them and this file is retired.

Deterministic: seed 810. Re-running reproduces the identical files.
"""

import json, csv, math, random, os, re
from datetime import datetime, timedelta

SEED = 810
random.seed(SEED)

HERE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.join(HERE, '..', 'bank.json')

COHORT = 'BIGTREE-FA25'
TERM_START = datetime(2025, 8, 27)   # a Wednesday
N_WEEKS = 15
N_STUDENTS = 18

TRACKS = ['K-12 Leadership', 'Higher Ed Leadership', 'Healthcare Leadership']
DEVICES = ['desktop', 'laptop', 'mobile', 'tablet']

# ----------------------------------------------------------------- item side

bank = json.load(open(BANK, encoding='utf-8'))
M, X, THEMES, TIERS, PRESETS = bank['m'], bank['x'], bank['themes'], bank['tiers'], bank['presets']
RAW = bank['items']

LETTERS = 'ABCDEFGH'
NUMRE = re.compile(r'\d')


def block_for(sessions, keys):
    hits = [k for k in keys if any(s in X[k] for s in sessions)]
    return '|'.join(hits) if hits else 'none'


items = []
for n, it in enumerate(RAW, start=1):
    opts = it['o']
    key = it['a'][0]
    sess = it.get('s') or []
    prim = min(sess) if sess else ''
    stem = it['q']
    key_txt = opts[key]
    distr = [o for j, o in enumerate(opts) if j != key]
    mean_d = sum(len(o) for o in distr) / len(distr) if distr else 0.0
    shown = '  |  '.join(
        '%s) %s%s' % (LETTERS[j], o, ' [X]' if j == key else '')
        for j, o in enumerate(opts)
    )
    items.append({
        'item_number': n,
        'item_id': it['i'],
        'topic': it.get('t', ''),
        'tier_code': it['c'],
        'tier_label': TIERS.get(it['c'], ''),
        'session_primary': prim,
        'session_name': M.get(str(prim), '') if prim else '',
        'session_all': '|'.join(str(s) for s in sess),
        'theme_code': it.get('th', ''),
        'theme_label': THEMES.get(it.get('th', ''), ''),
        'exam_block': block_for(sess, ['exam1', 'exam2']),
        'lab_block': block_for(sess, ['lab1', 'lab2', 'lab3', 'lab4']),
        'extra_topic': it.get('x', ''),
        'source_note': it.get('src', ''),
        'news_outlet': it.get('outlet', ''),
        'news_date': it.get('d', ''),
        'news_sourced': it.get('sourced', ''),
        'news_url': it.get('url', ''),
        'n_options': len(opts),
        'correct_position': key + 1,
        'correct_option_text': key_txt,
        'stem_chars': len(stem),
        'key_chars': len(key_txt),
        'mean_distractor_chars': round(mean_d, 1),
        'key_length_advantage': round(len(key_txt) - mean_d, 1),
        'numeric_item': 1 if NUMRE.search(stem) else 0,
        'item_text_full': 'Q: %s  ||  %s' % (stem, shown),
        '_opts': opts,
        '_key': key,
        '_stem': stem,
    })

BY_ID = {i['item_id']: i for i in items}

ITEM_COLS = [k for k in items[0].keys() if not k.startswith('_')]
# LD810_items_master.csv is written at the END of this script, once the
# responses exist, because it carries only the items that were actually
# answered. See "items master" below.

# ------------------------------------------------------- latent item difficulty

TIER_B = {'theme': -0.35, 'authored': 0.00, 'lecture': 0.05, 'exam': 0.10,
          'news': 0.20, 'pub': 0.40, 'extra': 0.45}

for i in items:
    b = random.gauss(0, 0.60)
    b += TIER_B.get(i['tier_code'], 0.0)
    if i['session_primary']:
        b += (i['session_primary'] - 6) * 0.10
    if i['numeric_item']:
        b += 0.30
    if i['n_options'] == 2:
        b -= 0.60
    b += i['key_length_advantage'] * -0.004     # small, deliberately underpowered
    i['_b'] = b
    i['_guess'] = 1.0 / i['n_options']

# ------------------------------------------------------------------ students

students = []
for s in range(1, N_STUDENTS + 1):
    prior = 1 if s % 3 == 0 else 0
    students.append({
        'student_id': 'BTS-%02d' % s,
        'student_track': TRACKS[(s - 1) % 3],
        'student_prior_stats': prior,
        '_theta0': random.gauss(0.0, 0.85) + (0.45 if prior else 0.0),
        '_growth': max(0.15, random.gauss(0.55 if prior else 1.05, 0.35)),
        '_engage': max(0.25, random.gauss(1.0, 0.45)),
        '_device': random.choices(DEVICES, weights=[3, 4, 3, 1])[0],
    })

# --------------------------------------------------------------- pool filters

COURSE = [i for i in items if i['tier_code'] != 'extra']


def pool(preset):
    if preset.startswith('theme_'):
        return [i for i in items if i['theme_code'] == preset[6:]]
    if preset == 'freeplay':
        return COURSE
    sess = X[preset]
    return [i for i in COURSE if any(s in sess for s in (
        [int(v) for v in i['session_all'].split('|') if v] or []))]


PRESET_LABEL = dict(PRESETS)
PRESET_LABEL['freeplay'] = 'Free play - whole course pool'
for code, name in THEMES.items():
    PRESET_LABEL['theme_' + code] = 'Theme - ' + name

# week -> which presets a student is plausibly drilling, and how hard
WEEK_PRESETS = {
    1:  ['lab1', 'freeplay'],           2:  ['lab1', 'freeplay'],
    3:  ['lab1', 'freeplay'],           4:  ['lab1', 'exam1'],
    5:  ['lab2', 'exam1', 'freeplay'],  6:  ['lab2', 'exam1'],
    7:  ['exam1', 'lab2'],              8:  ['exam1', 'exam1', 'lab2'],
    9:  ['lab3', 'freeplay'],           10: ['lab3', 'exam2'],
    11: ['lab3', 'lab4', 'exam2'],      12: ['lab4', 'exam2'],
    13: ['lab4', 'exam2'],              14: ['exam2', 'exam2', 'lab4'],
    15: ['exam2', 'freeplay'],
}
WEEK_INTENSITY = {1: 0.5, 2: 0.7, 3: 0.9, 4: 1.0, 5: 1.1, 6: 1.3, 7: 1.8,
                  8: 3.0, 9: 0.8, 10: 1.0, 11: 1.2, 12: 1.4, 13: 1.9,
                  14: 3.1, 15: 1.6}

DOW_W = [0.9, 1.4, 1.8, 0.7, 0.8, 0.9, 1.5]   # Mon..Sun; class is Wednesday
HOURS = list(range(5, 24)) + [0, 1]
HOUR_W = [0.4, 0.8, 0.9, 0.6, 0.5, 0.5, 0.6, 0.7, 0.8, 0.8, 0.9, 1.0,
          1.2, 1.6, 2.4, 3.0, 3.2, 2.6, 1.6, 0.8, 0.5]


def time_block(h):
    if 5 <= h < 12:  return 'Morning'
    if 12 <= h < 17: return 'Afternoon'
    if 17 <= h < 22: return 'Evening'
    return 'Late night'


def p_correct(theta, i, pos, exposure, hour):
    th = theta - 0.012 * (pos - 1)
    th += min(0.55 * (exposure - 1), 1.20)
    if hour >= 22 or hour <= 1:
        th -= 0.20
    z = 1.0 * (th - i['_b'])
    p = 1.0 / (1.0 + math.exp(-z))
    return i['_guess'] + (1 - i['_guess']) * p


def resp_time(i, correct, pos, exposure, week):
    lt = 2.15
    lt += 0.0022 * i['stem_chars']
    lt += 0.22 if i['numeric_item'] else 0.0
    lt += 0.0 if correct else 0.15
    lt -= 0.35 * min(exposure - 1, 2)
    lt -= 0.006 * pos
    lt -= 0.20 * (week / N_WEEKS)
    lt += random.gauss(0, 0.45)
    return math.exp(lt)

# ------------------------------------------------------------------- generate

rows = []
rid = 0
seen = {s['student_id']: {} for s in students}

def emit(stu, run_id, mode, preset, pos, when, item, theta, week):
    global rid
    exposure = seen[stu['student_id']].get(item['item_id'], 0) + 1
    seen[stu['student_id']][item['item_id']] = exposure
    h = when.hour
    p = p_correct(theta, item, pos, exposure, h)
    correct = 1 if random.random() < p else 0
    t = resp_time(item, correct, pos, exposure, week)

    flag = random.random()
    if flag < 0.015:                      # tab left open
        t *= random.uniform(20, 300)
    elif flag < 0.035:                    # click-through, no reading
        t = random.uniform(0.8, 2.2)
        correct = 1 if random.random() < item['_guess'] else 0

    if correct:
        chosen = item['_key']
    else:
        wrong = [j for j in range(item['n_options']) if j != item['_key']]
        chosen = random.choice(wrong)

    t_out = '' if random.random() < 0.012 else round(t, 1)
    dev = '' if random.random() < 0.006 else (
        stu['_device'] if random.random() < 0.8
        else random.choice(DEVICES))

    rid += 1
    ctxt = item['_opts'][chosen]
    if correct:
        rtxt = 'Chose %s) %s - CORRECT' % (LETTERS[chosen], ctxt)
    else:
        rtxt = 'Chose %s) %s - INCORRECT (key: %s) %s)' % (
            LETTERS[chosen], ctxt, LETTERS[item['_key']], item['correct_option_text'])

    r = {k: item[k] for k in ITEM_COLS}
    r['has_source_line'] = 1 if item['source_note'] else 0
    r.update({
        'response_id': 'R%06d' % rid,
        'data_source': 'simulated',
        'cohort': COHORT,
        'student_id': stu['student_id'],
        'student_track': stu['student_track'],
        'student_prior_stats': stu['student_prior_stats'],
        'run_id': run_id,
        'mode': mode,
        'preset': preset,
        'preset_label': PRESET_LABEL.get(preset, preset),
        'item_position': pos,
        'response_date': when.strftime('%Y-%m-%d'),
        'response_datetime': when.strftime('%Y-%m-%d %H:%M:%S'),
        'week_of_term': week,
        'day_of_week': when.strftime('%a'),
        'hour_of_day': h,
        'time_block': time_block(h),
        'exposure_number': exposure,
        'device': dev,
        'chosen_position': chosen + 1,
        'chosen_option_text': ctxt,
        'correct': correct,
        'response_time_sec': t_out,
        'response_text': rtxt,
    })
    rows.append(r)
    return t


run_n = 0
for week in range(1, N_WEEKS + 1):
    wstart = TERM_START + timedelta(days=7 * (week - 1))

    # ---- practice runs
    for stu in students:
        lam = 1.35 * stu['_engage'] * WEEK_INTENSITY[week]
        n_runs = sum(1 for _ in range(6) if random.random() < lam / 6.0)
        theta = stu['_theta0'] + stu['_growth'] * (week / N_WEEKS) * 1.2
        for _ in range(n_runs):
            preset = random.choice(WEEK_PRESETS[week])
            if random.random() < 0.10:
                preset = 'theme_' + random.choice(list(THEMES))
            p = pool(preset)
            if len(p) < 8:
                continue
            length = min(len(p), random.choices([10, 15, 20, 25, 30],
                                                weights=[3, 4, 4, 2, 1])[0])
            picks = random.sample(p, length)
            dow = random.choices(range(7), weights=DOW_W)[0]
            hour = random.choices(HOURS, weights=HOUR_W)[0]
            when = wstart + timedelta(days=dow, hours=hour,
                                      minutes=random.randint(0, 59))
            run_n += 1
            run_id = 'run-%04d' % run_n
            for pos, item in enumerate(picks, start=1):
                t = emit(stu, run_id, 'practice', preset, pos, when, item, theta, week)
                when = when + timedelta(seconds=min(t, 240) + random.uniform(0.5, 2.5))

    # ---- one in-class live session most weeks (Wednesday evening)
    if week not in (1, 9) and random.random() < 0.85:
        run_n += 1
        run_id = 'live-%04d' % run_n
        preset = random.choice(WEEK_PRESETS[week])
        p = pool(preset)
        picks = random.sample(p, min(len(p), random.choice([8, 10, 12])))
        base = wstart + timedelta(days=0, hours=15, minutes=random.randint(10, 50))
        for stu in students:
            if random.random() < 0.18:      # absent or not joined
                continue
            theta = stu['_theta0'] + stu['_growth'] * (week / N_WEEKS) * 1.2
            when = base
            for pos, item in enumerate(picks, start=1):
                emit(stu, run_id, 'live', preset, pos, when, item, theta, week)
                when = when + timedelta(seconds=random.uniform(28, 55))

# ----------------------------------------------------------------- write out

ORDER = ['response_id', 'data_source', 'cohort', 'student_id', 'student_track',
         'student_prior_stats', 'run_id', 'mode', 'preset', 'preset_label',
         'item_position', 'response_date', 'response_datetime', 'week_of_term',
         'day_of_week', 'hour_of_day', 'time_block',
         'item_number', 'item_id', 'topic', 'tier_code', 'tier_label',
         'session_primary', 'session_name', 'session_all',
         'theme_code', 'theme_label', 'exam_block', 'lab_block', 'extra_topic',
         'has_source_line', 'news_outlet', 'news_date', 'news_sourced', 'news_url',
         'n_options', 'correct_position', 'correct_option_text',
         'stem_chars', 'key_chars', 'mean_distractor_chars',
         'key_length_advantage', 'numeric_item',
         'exposure_number', 'device', 'chosen_position', 'chosen_option_text',
         'correct', 'response_time_sec',
         'item_text_full', 'response_text']

out = os.path.join(HERE, 'LD810_responses_master_SIM.csv')
with open(out, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=ORDER, extrasaction='ignore')
    w.writeheader()
    for r in rows:
        w.writerow(r)

LITE = [c for c in ORDER if c not in ('item_text_full','response_text','correct_option_text','chosen_option_text')]
lp = os.path.join(HERE, 'LD810_responses_master_SIM_lite.csv')
with open(lp, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=LITE, extrasaction='ignore')
    w.writeheader()
    for r in rows:
        w.writerow(r)
print('lite: %d cols, %.1f MB' % (len(LITE), os.path.getsize(lp)/1e6))

# ------------------------------------------------- items master (answered only)

n_by_item = {}
for r in rows:
    n_by_item[r['item_id']] = n_by_item.get(r['item_id'], 0) + 1

answered = [i for i in items if n_by_item.get(i['item_id'])]
IT_COLS = ITEM_COLS + ['n_responses']
ip = os.path.join(HERE, 'LD810_items_master.csv')
with open(ip, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=IT_COLS, extrasaction='ignore')
    w.writeheader()
    for i in answered:
        row = dict((k, i[k]) for k in ITEM_COLS)
        row['n_responses'] = n_by_item[i['item_id']]
        w.writerow(row)
print('items_master: %d of %d items answered at least once, %d cols'
      % (len(answered), len(items), len(IT_COLS)))

print('responses_master: %d rows, %d cols, %.1f MB'
      % (len(rows), len(ORDER), os.path.getsize(out) / 1e6))
print('runs: %d | students: %d | distinct items used: %d'
      % (len({r['run_id'] for r in rows}), N_STUDENTS,
         len({r['item_id'] for r in rows})))
print('overall accuracy: %.3f' % (sum(r['correct'] for r in rows) / len(rows)))
