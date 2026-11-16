// Translate the computed policy directly; never infer a lock from target count.
export function buildGuide(calculation, mods, settings) {
  const {goal, width, policy, ps, originalCraft} = calculation;
  const forced = ps.reduce((mask,p,i)=>p === 1 ? mask | (1 << i) : mask,0);
  const variable = mods.map((m,i)=>i).filter(i=>ps[i] < 1);
  const side = settings.side === 'suffix' ? 'suffix' : 'prefix';
  const lock = k => `${k}-mod ${side} lock`;
  const crafts = Array.from({length:width},(_,i)=>i).filter(i=>settings.canCraft !== false || i === 0 || i === originalCraft || i === settings.initialCraft);
  const craftName = k => k === originalCraft ? 'Original bench craft still present' : k ? `${lock(k)} already applied` : originalCraft >= 0 ? 'Original craft removed; no lock' : 'No lock applied';
  function instruction(action, current) {
    if (action === null) return current > 0 && current !== originalCraft ? 'Stop Divining. Remove the remaining lock craft; your targets are complete.' : 'Stop. Your targets are complete; no more Divines needed.';
    if (!action) return current > 0 && current !== originalCraft ? 'Remove the lock, then use one Divine without a lock.' : 'Use one Divine without a lock.';
    if (action === current) return `Keep the ${lock(action)} and use one Divine.`;
    const removal = current === originalCraft ? `Remove the crafted ${side === 'prefix' ? 'suffix' : 'prefix'} to make room. ` : current > 0 ? 'Remove the current lock. ' : '';
    return `${removal}Apply a ${lock(action)}, then use one Divine.`;
  }
  const rows = [];
  for (let mask = 0; mask <= goal; mask++) {
    if ((mask & forced) !== forced) continue;
    const hit = variable.filter(i=>mask & (1 << i));
    const missed = variable.filter(i=>!(mask & (1 << i)));
    const groups = [];
    for (const craft of crafts) {
      const action = mask === goal ? null : policy[mask * width + craft];
      let group = groups.find(g=>g.action === action);
      if (!group) {group = {action,crafts:[],instructions:[]};groups.push(group);}
      group.crafts.push(craft);
      group.instructions.push({craft,label:craftName(craft),text:instruction(action,craft)});
    }
    rows.push({mask,hit,missed,complete:mask === goal,groups});
  }
  const startCraft = originalCraft >= 0 && !settings.initialCraft ? originalCraft : settings.initialCraft || 0;
  const first = instruction(calculation.results.find(r=>r.id === 'optimal').next,startCraft);
  return {rows,variable,first,lock};
}
