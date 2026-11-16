"""Independent exact-rational audit of the Blood Song warstaff model.
Run with Python 3; the app engine is used only for the final cross-check.
"""
from fractions import Fraction as F
from itertools import combinations
from pathlib import Path
import json
import subprocess

P, Q = F(1, 8), F(1, 182)
STATES = [(mask, craft) for mask in range(3) for craft in range(3)]

def distribution(mask, action):
    # Bits 0/1 are %/flat physical. Prefix 2 is the fixed-value support mod.
    # Choose the UNLOCKED prefixes, then branch only over variable rolls.
    choices = list(combinations(range(3), 3-action))
    out = [F(0)] * 4
    for unlocked in choices:
        paths = {mask: F(1, len(choices))}
        for prefix, chance in enumerate((P, Q)):
            if prefix not in unlocked:
                continue
            updated = {}
            for before, weight in paths.items():
                for hit, probability in ((False, 1-chance), (True, chance)):
                    after = (before | (1 << prefix)) if hit else (before & ~(1 << prefix))
                    updated[after] = updated.get(after, F(0)) + weight*probability
            paths = updated
        for after, weight in paths.items():
            out[after] += weight
    assert sum(out) == 1
    return out

TRANSITIONS = {(mask,a):distribution(mask,a) for mask in range(3) for a in range(3)}

def solve(matrix, rhs):
    rows = [list(row)+[value] for row,value in zip(matrix,rhs)]
    for column in range(len(rows)):
        pivot = next(i for i in range(column,len(rows)) if rows[i][column])
        rows[column],rows[pivot] = rows[pivot],rows[column]
        divisor = rows[column][column]
        rows[column] = [x/divisor for x in rows[column]]
        for i,row in enumerate(rows):
            if i != column:
                factor = row[column]
                rows[i] = [x-factor*y for x,y in zip(row,rows[column])]
    return [row[-1] for row in rows]

def reward(craft, action, metric):
    application = action > 0 and craft != action
    return F(1 if metric == 'rolls' else int(application) if metric == 'crafts' else 1 + action*application)

def evaluate(policy, metric):
    matrix, rhs = [], []
    for i,(mask,craft) in enumerate(STATES):
        action = policy[i]
        row = [F(int(i==j)) for j in range(len(STATES))]
        for after,probability in enumerate(TRANSITIONS[mask,action][:3]):
            row[after*3+action] -= probability
        matrix.append(row)
        rhs.append(reward(craft,action,metric))
    return solve(matrix,rhs)

policies = {
    'no_lock': [0]*9,
    'specific_1': [1 if mask & 2 else 0 for mask,craft in STATES],
    'flat_only_2': [2 if mask & 2 else 0 for mask,craft in STATES],
    'all_targets': [mask.bit_count() for mask,craft in STATES],
    'optimal': [0,0,0,1,1,2,2,2,2],
}
report = {}
for name,policy in policies.items():
    metrics = {metric:evaluate(policy,metric) for metric in ('cost','rolls','crafts')}
    report[name] = {label:{metric:float(values[mask*3]) for metric,values in metrics.items()}
                    for label,mask in [('neither',0),('percent_only',1),('flat_only',2)]}

# Exact Bellman certificate: no alternative action improves any of 9 states.
values = evaluate(policies['optimal'],'cost')
for i,(mask,craft) in enumerate(STATES):
    alternatives = [reward(craft,a,'cost') + sum(prob*values[after*3+a]
                    for after,prob in enumerate(TRANSITIONS[mask,a][:3])) for a in range(3)]
    assert values[i] == min(alternatives), (mask,craft,alternatives)

root = Path(__file__).resolve().parents[1]
engine = json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {calculate} from './dist/engine.js'; console.log(JSON.stringify([1,3,5].map(initialMask=>calculate([1,1/8,1/182],{initialMask,specific:2}).results.map(({cost,rolls,crafts})=>({cost,rolls,crafts})))));"],cwd=root,text=True))
for index,label in enumerate(('neither','percent_only','flat_only')):
    for card,name in enumerate(('no_lock','specific_1','flat_only_2','all_targets','optimal')):
        for metric,actual in engine[index][card].items():
            expected = report[name][label][metric]
            assert abs(actual-expected) < 1e-7, (name,label,metric,actual,expected)
print(json.dumps(report,indent=2))
print('PASS: exact Bellman certificate for all 9 states; all 45 app metrics match within 1e-7.')
