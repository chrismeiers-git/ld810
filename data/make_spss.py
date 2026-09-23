#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Convert LD810_items_master.csv to an SPSS .sav file with variable labels and
measure levels set, and drop it into the course Drive folder.

Requires: pandas, pyreadstat   (pip3 install pandas pyreadstat)
"""
import os, pandas as pd, pyreadstat

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'LD810_items_master.csv')
DEST_DIR = os.environ.get(
    'LD810_SPSS_DEST',
    os.path.expanduser('~/mnt/Data Sets/Class Quiz App Data'))
DEST = os.path.join(DEST_DIR, 'LD810_items_master.sav')

NUMERIC = ['item_number', 'session_primary', 'n_options', 'correct_position',
           'stem_chars', 'key_chars', 'mean_distractor_chars',
           'key_length_advantage', 'numeric_item', 'n_responses']

LABELS = {
    'item_number': 'Item number (position in the LD 810 item bank, 1-1289)',
    'item_id': 'Item ID in bank.json',
    'topic': 'Topic tested',
    'tier_code': 'Item source tier (code)',
    'tier_label': 'Item source tier (description)',
    'session_primary': 'Content session the item belongs to (1-13)',
    'session_name': 'Content session title',
    'session_all': 'All sessions the item is tagged to',
    'theme_code': 'Themed set (code); blank if not a themed item',
    'theme_label': 'Themed set (name); blank if not a themed item',
    'exam_block': 'Exam the item falls under (exam1 / exam2 / none)',
    'lab_block': 'Lab Foundations Check the item falls under (lab1-lab4 / none)',
    'source_note': 'Source line shown under the item; blank for authored items',
    'news_outlet': 'Current-events items: reporting outlet',
    'news_date': 'Current-events items: date the figure refers to',
    'news_sourced': 'Current-events items: date the figure was sourced',
    'news_url': 'Current-events items: source URL',
    'n_options': 'Number of answer options',
    'correct_position': 'Which option slot holds the correct answer (1-4)',
    'correct_option_text': 'Text of the correct answer',
    'stem_chars': 'Length of the question stem, in characters',
    'key_chars': 'Length of the correct option, in characters',
    'mean_distractor_chars': 'Mean length of the wrong options, in characters',
    'key_length_advantage': 'key_chars minus mean_distractor_chars (the length tell)',
    'numeric_item': 'Stem contains a number, i.e. likely requires calculation (0/1)',
    'item_text_full': 'Full item: stem and all options, [X] marking the key',
    'n_responses': 'Times this item was answered in the response dataset',
}

MEASURE = {
    'item_number': 'nominal', 'item_id': 'nominal', 'topic': 'nominal',
    'tier_code': 'nominal', 'tier_label': 'nominal',
    'session_primary': 'ordinal', 'session_name': 'nominal',
    'session_all': 'nominal', 'theme_code': 'nominal', 'theme_label': 'nominal',
    'exam_block': 'nominal', 'lab_block': 'nominal', 'source_note': 'nominal',
    'news_outlet': 'nominal', 'news_date': 'nominal', 'news_sourced': 'nominal',
    'news_url': 'nominal', 'n_options': 'scale', 'correct_position': 'nominal',
    'correct_option_text': 'nominal', 'stem_chars': 'scale',
    'key_chars': 'scale', 'mean_distractor_chars': 'scale',
    'key_length_advantage': 'scale', 'numeric_item': 'nominal',
    'item_text_full': 'nominal', 'n_responses': 'scale',
}

df = pd.read_csv(SRC, encoding='utf-8-sig', dtype=str, keep_default_na=False)

# extra_topic is empty for every answered item (the presets never draw from the
# good-to-know tier), so it carries nothing in SPSS. Dropped.
df = df.drop(columns=[c for c in ['extra_topic'] if c in df.columns])

for c in NUMERIC:
    df[c] = pd.to_numeric(df[c].replace('', None), errors='coerce')

cols = list(df.columns)
os.makedirs(DEST_DIR, exist_ok=True)
pyreadstat.write_sav(
    df, DEST,
    column_labels=[LABELS.get(c, c) for c in cols],
    variable_measure=dict((c, MEASURE.get(c, 'nominal')) for c in cols),
    file_label='LD 810 practice quiz item bank - items answered at least once',
)
print('wrote %s  (%d rows, %d variables, %.0f KB)'
      % (DEST, len(df), len(cols), os.path.getsize(DEST) / 1024))
