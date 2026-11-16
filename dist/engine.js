// Exact finite-state expectations; no simulation is used in the calculator.
export const popcount = n => n.toString(2).replaceAll('0', '').length;

export function rollProbability(roll) {
  const { min, max, step, target, direction } = roll;
  if (![min, max, step, target].every(Number.isFinite) || step <= 0 || max < min)
    throw new Error('Enter valid minimum, maximum, target and positive step values.');
  if (!['atLeast', 'atMost', 'exact'].includes(direction)) throw new Error('Invalid target direction.');
  const intervals = (max - min) / step;
  if (Math.abs(intervals - Math.round(intervals)) > 1e-7 || intervals > 1e8)
    throw new Error('The range must contain a whole number of steps (at most 100 million).');
  const count = Math.round(intervals) + 1;
  if (target < min - 1e-9 || target > max + 1e-9) throw new Error('The target must be within the roll range.');
  const index = (target - min) / step;
  let wins;
  if (direction === 'atLeast') wins = count - Math.ceil(index - 1e-7);
  else if (direction === 'atMost') wins = Math.floor(index + 1e-7) + 1;
  else wins = Math.abs(index - Math.round(index)) < 1e-7 ? 1 : 0;
  if (!wins) throw new Error('The exact target cannot be rolled with this step.');
  return wins / count;
}

export function probabilities(mods) {
  if (!Array.isArray(mods) || mods.length < 1 || mods.length > 3) throw new Error('Enter one to three modifiers on the selected side.');
  return mods.map(mod => {
    if (!Array.isArray(mod.rolls) || mod.rolls.length < 1 || mod.rolls.length > 3) throw new Error('Use one to three numeric rolls per modifier.');
    return mod.rolls.reduce((p, r) => p * rollProbability(r), 1);
  });
}

// A lock selects k DISTINCT modifiers uniformly on EACH Divine. All numeric
// components of a selected modifier retain their current success/failure state.
export function transition(ps, mask, k) {
  const size = 1 << ps.length;
  const result = Array(size).fill(0);
  const locks = Array.from({length: size}, (_, i) => i).filter(i => popcount(i) === k);
  for (const locked of locks) {
    for (let next = 0; next < size; next++) {
      if ((next & locked) !== (mask & locked)) continue;
      let p = 1 / locks.length;
      for (let i = 0; i < ps.length; i++) if (!(locked & (1 << i))) p *= next & (1 << i) ? ps[i] : 1 - ps[i];
      result[next] += p;
    }
  }
  return result;
}

function solve(matrix, rhs) {
  const a = matrix.map((row, i) => [...row, rhs[i]]), n = a.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-14) throw new Error('These odds are too extreme for a reliable calculation. Broaden a target.');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) if (row !== col) {
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map(row => row[n]);
}

export function calculate(ps, settings = {}) {
  if (!ps.length || ps.length > 3 || ps.some(p => !Number.isFinite(p) || p <= 0 || p > 1)) throw new Error('Invalid modifier probabilities.');
  if (ps.reduce((a, b) => a * b, 1) < 1e-10) throw new Error('Combined odds are below 1 in 10 billion. Broaden a target for reliable results.');
  const { one = 1, two = 2, removal = 0, initialMask = 0, initialCraft = 0, specific = 0 } = settings;
  if ([one, two, removal].some(v => !Number.isFinite(v) || v < 0 || v > 1e8)) throw new Error('Craft costs must be between 0 and 100 million Divines.');
  const n = ps.length, size = 1 << n, goal = size - 1;
  // Locking all modifiers cannot make progress. Existing full-side locks must
  // be removed before using this one-side optimizer.
  const actions = Array.from({length: n}, (_, i) => i), width = n;
  if (!Number.isInteger(initialMask) || initialMask < 0 || initialMask > goal || !actions.includes(initialCraft) || !Number.isInteger(specific) || specific < 0 || specific >= n) throw new Error('Invalid starting state.');
  const forced = ps.reduce((m, p, i) => p === 1 ? m | (1 << i) : m, 0);
  const startMask = initialMask | forced;
  const states = Array.from({length: goal * width}, (_, id) => ({mask: Math.floor(id / width), craft: id % width}));
  const distributions = Array.from({length: goal}, (_, mask) => actions.map(k => transition(ps, mask, k)));
  const craftCosts = [0, one, two];
  function reward(craft, action, metric) {
    const changed = craft !== action;
    if (metric === 'rolls') return 1;
    if (metric === 'crafts') return Number(changed && action > 0);
    if (metric === 'removals') return Number(changed && craft > 0);
    return 1 + (changed ? craftCosts[action] + (craft > 0 ? removal : 0) : 0);
  }
  function terminal(craft, metric) {
    if (metric === 'cost') return craft > 0 ? removal : 0;
    if (metric === 'removals') return Number(craft > 0);
    return 0;
  }
  function evaluate(policy, metric) {
    const matrix = states.map((s, id) => {
      const row = Array(states.length).fill(0), a = policy[id]; row[id] = 1;
      distributions[s.mask][a].forEach((p, next) => { if (next !== goal) row[next * width + a] -= p; });
      return row;
    });
    const rhs = states.map((s, id) => {
      const a = policy[id];
      return reward(s.craft, a, metric) + distributions[s.mask][a][goal] * terminal(a, metric);
    });
    return solve(matrix, rhs);
  }
  function result(id, policy) {
    const values = {};
    for (const metric of ['cost', 'rolls', 'crafts', 'removals']) {
      values[metric] = startMask === goal ? terminal(initialCraft, metric) : evaluate(policy, metric)[startMask * width + initialCraft];
      if (!Number.isFinite(values[metric]) || values[metric] < -1e-5) throw new Error('Numerical calculation failed. Broaden a target.');
      values[metric] = Math.max(0, values[metric]);
    }
    return {id, ...values, policy, next: startMask === goal ? null : policy[startMask * width + initialCraft]};
  }
  const none = states.map(() => 0);
  const chosen = states.map(s => n > 1 && (s.mask & (1 << specific)) ? 1 : 0);
  const all = states.map(s => Math.min(popcount(s.mask), n - 1));
  const best = [...none];
  let iterations = 0;
  for (; iterations < 100; iterations++) {
    const values = evaluate(best, 'cost');
    let changed = false;
    states.forEach((s, id) => {
      let bestCost = values[id], bestAction = best[id];
      for (const action of actions) {
        const q = reward(s.craft, action, 'cost') + distributions[s.mask][action].reduce((sum, p, next) => sum + p * (next === goal ? terminal(action, 'cost') : values[next * width + action]), 0);
        if (q < bestCost - 1e-9 * Math.max(1, Math.abs(bestCost))) { bestCost = q; bestAction = action; }
      }
      if (best[id] !== bestAction) {best[id] = bestAction; changed = true;}
    });
    if (!changed) break;
  }
  if (iterations === 100) throw new Error('Optimizer did not converge. Try less extreme inputs.');
  const results = [result('none', none), result('specific', chosen), result('all', all), result('optimal', best)];
  return { results, states, goal, startMask, width, ps, policy: best };
}
