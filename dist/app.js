import { probabilities, calculate, fractureMask, isFixed } from './engine.js?v=20261116-5';
import { parseItem, atTarget, EXAMPLE_ITEM } from './import.js?v=20261116-5';
import { buildGuide } from './guide.js?v=20261116-5';
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n >= 1e7 ? n.toExponential(3) : n.toLocaleString('en-US', {maximumFractionDigits:2});
const pct = p => (p * 100).toLocaleString('en-US', {maximumSignificantDigits:4}) + '%';
const roll = (min = 1, max = 10) => ({min, max, step:1, target:max, direction:'atLeast'});
const templates = {
  prefix: ['Maximum Life', 'Increased Physical Damage', 'Increased Spell Damage', 'Maximum Energy Shield', 'Maximum Mana', 'Added Physical Damage', 'Custom modifier'],
  suffix: ['Fire Resistance', 'Cold Resistance', 'Lightning Resistance', 'Chaos Resistance', 'Attack Speed', 'Critical Strike Multiplier', 'Strength', 'Dexterity', 'Intelligence', 'Custom modifier']
};
function defaults() {
  const item = parseItem(EXAMPLE_ITEM);
  return {v:1, side:'prefix', one:1, two:2, removal:0, ...structuredClone(item.banks.prefix), banks:item.banks, itemName:item.itemName, itemFlags:item.itemFlags, itemText:EXAMPLE_ITEM};
}
let state = defaults(), restoreNotice = '';
function validState(s) {
  if (!s || s.v !== 1 || !['prefix','suffix'].includes(s.side)) throw new Error('Unsupported setup.');
  if (s.itemText !== undefined && (typeof s.itemText !== 'string' || s.itemText.length > 50000)) throw new Error('Invalid item text.');
  probabilities(s.mods);
  for (const m of s.mods) if (typeof m.name !== 'string' || m.name.length > 120 || typeof m.hit !== 'boolean') throw new Error('Invalid modifier.');
  for (const m of s.mods) if (m.fractured !== undefined && typeof m.fractured !== 'boolean') throw new Error('Invalid fracture state.');
  if (s.itemFlags && (!Array.isArray(s.itemFlags) || s.itemFlags.length > 3 || s.itemFlags.some(f => typeof f !== 'string' || !/^(Corrupted|Mirrored|Unmodifiable)$/i.test(f)))) throw new Error('Invalid item flags.');
  if (s.canCraft !== undefined && typeof s.canCraft !== 'boolean') throw new Error('Invalid crafting availability.');
  if (s.banks) {
    for (const side of ['prefix','suffix']) {
      const bank = s.banks[side];
      if (!bank || !Array.isArray(bank.mods)) throw new Error('Invalid imported item.');
      if (bank.mods.length) validState({v:1,side,...bank});
    }
  }
  calculate(probabilities(s.mods), {...s, initialMask:0, fracturedMask:fractureMask(s.mods)});
  return s;
}
try {
  const shared = new URLSearchParams(location.hash.slice(1)).get('setup');
  if (shared && shared.length > 15000) throw new Error('Setup link too long.');
  const saved = shared || localStorage.getItem('divine-planner-v1');
  if (saved) state = validState(JSON.parse(saved));
} catch { restoreNotice = 'Could not restore the saved setup; showing the demo.'; }
function save() {
  if (state.banks) state.banks[state.side] = bankFromState();
  try { localStorage.setItem('divine-planner-v1', JSON.stringify(state)); $('save-status').textContent = 'Saved in this browser'; }
  catch { $('save-status').textContent = 'Browser storage unavailable'; }
}
function renderMods() {
  $('can-craft').checked = state.canCraft !== false;
  $('craft-reason').textContent = state.canCraft === false ? state.reason || 'Lock crafting is unavailable. Only the no-lock strategy can be used.' : state.removableCraft ? state.reason : 'Requires a free opposite-side slot and room for a bench craft.';
  $('item-context').hidden = !state.itemName;
  $('item-context').textContent = state.itemName ? `${state.itemName} · ${state.side === 'prefix' ? 'Prefixes' : 'Suffixes'} imported. Switch sides to see the other modifiers.${state.itemFlags?.length ? ` Planning as modifiable: ${state.itemFlags.join(', ')} flags ignored.` : ''}` : '';
  for (const side of ['prefix','suffix']) $(side).disabled = !!state.banks && !state.banks[side].mods.length;
  $('prefix').setAttribute('aria-pressed', state.side === 'prefix');
  $('suffix').setAttribute('aria-pressed', state.side === 'suffix');
  const fixedCount = state.mods.filter(m => m.fractured).length;
  $('mod-count').textContent = fixedCount ? `${state.mods.length-fixedCount} to divine · ${fixedCount} fractured` : `${state.mods.length} / 3 modifiers`;
  $('mods').innerHTML = state.mods.map((mod, i) => mod.fractured ? fixedModifierMarkup(mod,i) : `<article class="mod" data-mod="${i}"><div class="mod-head"><span class="mod-id">${state.side === 'prefix' ? 'P' : 'S'}${i+1}</span><label class="mod-name"><input data-field="name" aria-label="Modifier ${i+1} name" list="mod-names" value="${esc(mod.name)}" maxlength="120"></label><button class="remove" data-action="remove" aria-label="Remove modifier ${i+1}" ${state.mods.length === 1 ? 'disabled' : ''}>×</button></div><label class="check fracture-toggle"><input type="checkbox" data-field="fractured">Fractured · fixed</label>${mod.source ? `<p class="copied-stat">${esc(mod.source)}</p>` : ""}${mod.rolls.map((r,j) => `<div data-roll="${j}">${Number.isFinite(r.current) ? `<p class="copied-value">Copied value: ${esc(r.current)}</p>` : ""}${mod.rolls.length > 1 ? `<div class="roll-label">NUMERIC ROLL ${j+1} · same modifier</div>` : ''}<div class="roll">${[['min','Min'],['max','Max'],['step','Step'],['target','Target']].map(([key,label]) => `<label>${label}<input type="number" step="any" data-field="${key}" aria-label="Modifier ${i+1} roll ${j+1} ${label}" value="${r[key]}" ${key === 'target' ? 'class="target-input"' : ''}></label>`).join('')}</div><div class="roll-options"><label>Accept <select data-field="direction" aria-label="Modifier ${i+1} roll ${j+1} target rule">${[['atLeast','At least'],['atMost','At most'],['exact','Exactly']].map(([value,label]) => `<option value="${value}" ${r.direction === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${mod.rolls.length > 1 ? '<button class="quiet" data-action="remove-roll">Remove roll</button>' : '<button class="quiet" data-action="max-target">Target maximum ↗</button>'}</div></div>`).join('')}<div class="mod-bottom"><label class="check"><input type="checkbox" data-field="hit" ${mod.hit || isFixed(mod) ? 'checked' : ''} ${isFixed(mod) ? 'disabled' : ''}>Already at target${isFixed(mod) ? ' · fixed value' : ''}</label><span class="chance" id="chance-${i}"></span></div><button class="quiet" style="margin-top:9px" data-action="add-roll" ${mod.rolls.length === 3 ? 'disabled' : ''}>＋ Add numeric roll (hybrid mod)</button></article>`).join('') + `<datalist id="mod-names">${templates[state.side].map(name => `<option value="${esc(name)}"></option>`).join('')}</datalist>`;
  $('add').disabled = state.mods.length >= 3;
  renderSettings();
}
function renderSettings() {
  if (isFixed(state.mods[state.specific] || {rolls:[]})) state.specific=Math.max(0,state.mods.findIndex(m=>!isFixed(m)));
  for (const key of ['one','two','removal']) $(key).value = state[key];
  $('current-craft').innerHTML = state.mods.map((_,i) => `<option value="${i}" ${state.initialCraft === i ? 'selected' : ''}>${i ? `${i}-mod lock` : 'No lock'}</option>`).join('');
  $('current-craft').disabled = state.canCraft === false;
  renderSpecific();
}
function renderSpecific() {
  if (isFixed(state.mods[state.specific] || {rolls:[]})) state.specific=Math.max(0,state.mods.findIndex(m=>!isFixed(m)));
  $('specific').innerHTML = state.mods.map((m,i) => `<option value="${i}" ${state.specific === i ? 'selected' : ''} ${isFixed(m) ? 'disabled' : ''}>${i+1}. ${esc(m.name)}${m.fractured ? ' (fractured)' : isFixed(m) ? ' (fixed value)' : ''}</option>`).join('');
  $('specific').disabled = state.mods.every(isFixed);
}
function fixedModifierMarkup(mod,i) {
  return `<article class="mod fractured-mod" data-mod="${i}"><div class="mod-head"><span class="mod-id">${state.side === 'prefix' ? 'P' : 'S'}${i+1}</span><label class="mod-name"><input data-field="name" aria-label="Modifier ${i+1} name" value="${esc(mod.name)}" maxlength="120"></label><button class="remove" data-action="remove" aria-label="Remove modifier ${i+1}" ${state.mods.length === 1 ? 'disabled' : ''}>×</button></div><label class="check fracture-toggle"><input type="checkbox" data-field="fractured" checked>Fractured · fixed</label>${mod.source ? `<p class="copied-stat">${esc(mod.source)}</p>` : ''}<p class="fracture-values">Fixed value${mod.rolls.length > 1 ? 's' : ''}: ${mod.rolls.map(r=>esc(r.current ?? r.target)).join(' / ')}</p><p class="hint">Excluded from Divine targets. Still occupies an affix slot and can receive a random lock.</p><span class="chance" id="chance-${i}"></span></article>`;
}
const actionName = k => k ? `${k}-mod lock` : 'No lock';
function renderGuide(calculation) {
  const guide = buildGuide(calculation,state.mods,state);
  const name = i => `${state.side === 'prefix' ? 'P' : 'S'}${i+1} · ${state.mods[i].name}`;
  const target = r => `${({atLeast:'≥',atMost:'≤',exact:'='})[r.direction]} ${r.target}`;
  $('guide').hidden = false;
  $('guide').innerHTML = `<span class="eyebrow">03 / FOLLOW THE OPTIMAL STRATEGY</span><h2>What to do after each roll</h2><ol class="guide-steps"><li><strong>Start with your current item.</strong><p>${esc(guide.first)}</p></li><li><strong>Check your targets after every Divine.</strong><ul class="guide-targets">${guide.variable.map(i=>`<li><b>${esc(name(i))}</b><span>${state.mods[i].rolls.map((r,j)=>`${state.mods[i].rolls.length > 1 ? `Roll ${j+1}: ` : ''}${esc(target(r))}`).join(' · ')}${state.mods[i].rolls.length > 1 ? ' — all rolls must qualify' : ''}</span></li>`).join('') || '<li>Every modifier is fixed or always meets its target.</li>'}</ul><p class="hint">Fractured and always-satisfied modifiers do not need checking. A target can be lost on the next Divine: protection is random each time.</p></li><li><strong>Find the matching outcome below.</strong><p class="hint">These instructions use your targets and craft prices. If a lock is already applied, keep it when the guide calls for the same lock; otherwise remove it before changing crafts.</p><div class="guide-outcomes">${guide.rows.map(row=>{
    const title = row.complete ? 'All targets met' : !row.hit.length ? 'No targets met' : `Only ${row.hit.map(i=>name(i)).join(' + ')} at target`;
    const uniform = row.groups.length === 1;
    const action = row.groups[0].action;
    const simple = row.complete ? 'Stop Divining. Remove any remaining lock craft.' : action === 0 ? 'Use one Divine without a lock. Remove an existing lock first.' : `Use a ${guide.lock(action)}, then one Divine. Keep that lock if already applied; otherwise ${state.removableCraft ? 'remove the original bench craft if still present, or any different lock, and apply it.' : 'remove any different lock and apply it.'}`;
    return `<article class="guide-outcome${row.complete ? ' guide-done' : ''}"><h3>${esc(title)}</h3>${row.missed.length ? `<p class="guide-missed">Still needed: ${row.missed.map(i=>esc(name(i))).join('; ')}</p>` : ''}${uniform ? `<p>${esc(simple)}</p>` : `<ul class="guide-branches">${row.groups.flatMap(g=>g.instructions).map(instruction=>`<li><b>${esc(instruction.label)}:</b> ${esc(instruction.text)}</li>`).join('')}</ul>`}</article>`;
  }).join('')}</div></li><li><strong>Repeat until every target is met.</strong><p>Use one Divine at a time, check the result, and follow the matching instruction again. ${state.removableCraft ? 'Recrafting the original bench modifier afterward is not included in the cost.' : ''}</p></li></ol>`;
}
function update() {
  try {
    const ps = probabilities(state.mods);
    state.mods.forEach((m,i)=>{
      if (isFixed(m)) m.hit=true;
      const checkbox=$('mods').querySelector(`[data-mod="${i}"] [data-field="hit"]`);
      if (checkbox) {checkbox.checked=m.hit;checkbox.disabled=isFixed(m);}
    });
    renderSpecific();
    const initialMask = state.mods.reduce((mask, m, i) => m.hit ? mask | (1 << i) : mask, 0);
    const fracturedMask = fractureMask(state.mods);
    const calculation = calculate(ps, {...state, initialMask, fracturedMask});
    const {results, goal, startMask, width, policy, originalCraft, forced} = calculation;
    state.mods.forEach((m,i) => {$(`chance-${i}`).textContent = m.fractured ? 'Fixed · no Divines needed' : isFixed(m) ? 'Fixed value · already at target' : `${pct(ps[i])} · 1 in ${fmt(1/ps[i])}`;});
    const none=results.find(r=>r.id==='none'), best=results.find(r=>r.id==='optimal');
    const saving = none.cost > 0 ? Math.max(0, (1-best.cost/none.cost)*100) : 0;
    let next;
    if (startMask === goal) next = state.initialCraft ? 'All targets are met. Remove the remaining craft; no more Divines needed.' : 'All targets are met. You are done; no Divines needed.';
    else if (best.next === state.initialCraft) next = `${best.next ? `Keep the ${best.next}-mod lock` : 'Leave the item unlocked'}, use a Divine, then re-check your targets.`;
    else next = `${state.initialCraft ? 'Remove the current craft. ' : state.removableCraft && best.next ? `Remove the crafted ${state.side === 'prefix' ? 'suffix' : 'prefix'}. ` : ''}${best.next ? `Apply the ${best.next}-mod lock` : 'Leave the item unlocked'}, then use a Divine.`;
    $('error').hidden = true;
    $('output').hidden = false;
    const descriptions = {
      none:['No lock','Reroll until every target hits on the same Divine.'],
      specific:['Lock specific with 1-lock',state.mods.every(isFixed) ? 'All modifiers are fixed; no Divines needed.' : `Use a 1-mod craft while “${state.mods[state.specific].name}” is at target. Random protection still applies.`],
      specific2:['Lock specific with 2-lock',state.mods.every(isFixed) ? 'All modifiers are fixed; no Divines needed.' : `Use a 2-mod craft while “${state.mods[state.specific].name}” is at target. Random protection still applies.`],
      all:['Lock all targets','Use 1- or 2-mod protection according to the number of variable targets currently met. Fixed and always-satisfied modifiers do not trigger locks.'],
      optimal:['Optimal adaptive',state.canCraft === false ? 'Uses no lock while lock crafting is unavailable. This is the strategy behind the top estimate.' : 'Chooses no lock, a 1-mod lock or a 2-mod lock after each roll, accounting for targets met and the current craft. This is the strategy behind the top estimate.']
    };
    const max = Math.max(...results.map(r=>r.cost), .001);
    $('output').innerHTML = `<div class="recommendation"><span class="eyebrow">LOWEST EXPECTED COST · ADAPTIVE STRATEGY</span><h3>${startMask === goal ? 'No Divine rolls needed.' : saving > .05 ? 'Let the math choose your locks.' : 'No lock is already cost-optimal.'}</h3><div class="big-number">${fmt(best.cost)}<span>Divines on average</span></div><p>${saving > .05 ? `${fmt(saving)}% less than plain Divining. ` : ''}${fmt(best.rolls)} Divine rolls + ${fmt(Math.max(0,best.cost-best.rolls))} Divines in crafting costs.</p><div class="next-step"><strong>YOUR NEXT MOVE</strong>${esc(next)}</div><a class="guide-link" href="#guide">Follow the step-by-step guide ↓</a></div><p class="compare-title">ALL FIVE STRATEGIES / EXPECTED TOTAL COST</p>${results.map(r => (state.canCraft === false && ["specific","specific2","all"].includes(r.id)) || (r.id === "specific2" && state.mods.length < 3) ? `<article class="strategy unavailable"><h3>${descriptions[r.id][0]}</h3><p>${r.id === "specific2" && state.mods.length < 3 ? "Requires three modifiers on this side: a 2-lock would protect every modifier and prevent progress." : "Unavailable on this item: a lock craft cannot currently be applied."}</p></article>` : `<article class="strategy${r.id === 'optimal' ? ' strategy-optimal' : ''}"><div class="strategy-top"><div><h3>${descriptions[r.id][0]}</h3>${r.id === 'optimal' ? '<span class="strategy-badge">TOP ESTIMATE</span>' : ''}</div><div class="strategy-cost">${fmt(r.cost)}<span>Divines total</span></div></div><p>${esc(descriptions[r.id][1])}</p><div class="metrics"><span>${fmt(r.rolls)} Divine rolls</span><span>${fmt(r.crafts)} craft applications</span><span>${fmt(r.removals)} removals</span></div><div class="cost-bar"><div style="width:${100*r.cost/max}%"></div></div></article>`).join('')}<p class="budget-note">Plain-roll success: <strong>${pct(ps.reduce((a,b)=>a*b,1))}</strong>. Costs include rolls, craft changes and final removal. Averages can hide long unlucky streaks.</p>`;
    const columns = Array.from({length:width},(_,i)=>i);
    const headings = columns.map(i => `<th>${i === originalCraft ? 'Original craft present' : i ? `With ${i}-mod lock` : state.removableCraft ? 'After removal, no lock' : 'With no lock'}</th>`).join('');
    $('policy').innerHTML = `<table><thead><tr><th>Targets met</th>${headings}</tr></thead><tbody>${Array.from({length:goal},(_,mask)=>mask).filter(mask=>(mask & forced) === forced).map(mask=>`<tr><td>${state.mods.map((m,i)=>!(forced & (1<<i)) && (mask&(1<<i))?`${state.side === 'prefix' ? 'P' : 'S'}${i+1}`:null).filter(Boolean).join(' + ') || 'None'}</td>${columns.map(k=>`<td>${k === originalCraft && policy[mask*width+k] ? 'Remove craft → ' : ''}${actionName(policy[mask*width+k])}</td>`).join('')}</tr>`).join('')}<tr><td>All Divine targets</td><td colspan="${width}">Stop; remove any lock craft.</td></tr></tbody></table>`;
    renderGuide(calculation);
    save();
  } catch (err) {
    $('error').hidden = false; $('error').textContent = err.message;
    $('output').hidden = true; $('policy').textContent = 'Enter valid ranges to see the policy.';
    $('guide').hidden = true;
    state.mods.forEach((_,i)=>{$(`chance-${i}`).textContent = 'Check inputs';});
  }
}
let timer;
function bankFromState() {
  return structuredClone({mods:state.mods,canCraft:state.canCraft !== false,removableCraft:!!state.removableCraft,reason:state.reason || '',initialCraft:state.initialCraft,specific:state.specific});
}
function importItem() {
  try {
    clearTimeout(timer);
    const item = parseItem($('item-paste').value);
    const side = item.banks[state.side].mods.length ? state.side : state.side === 'prefix' ? 'suffix' : 'prefix';
    state = {...state,...structuredClone(item.banks[side]),side,banks:item.banks,itemName:item.itemName,itemFlags:item.itemFlags,itemText:$('item-paste').value};
    history.replaceState(null,'',location.pathname+location.search);
    $('import-status').className = 'import-success';
    $('import-status').textContent = `Imported ${item.banks.prefix.mods.length} prefixes and ${item.banks.suffix.mods.length} suffixes from ${item.itemName}. ${item.notes.join(' ')}`;
    renderMods(); update();
  } catch (error) {
    $('import-status').className = 'import-error';
    $('import-status').textContent = `${error.message} Your existing setup was kept.`;
  }
}
$('import-item').addEventListener('click',importItem);
$('item-paste').addEventListener('paste',()=>setTimeout(importItem,0));
$('import-example').addEventListener('click',loadDemo);
$('can-craft').addEventListener('change',event=>{
  state.canCraft=event.target.checked;
  if (!state.canCraft) state.initialCraft=0;
  renderMods(); update();
});
$('mods').addEventListener('input', event => {
  const field = event.target.dataset.field; if (!field) return;
  const i = Number(event.target.closest('[data-mod]').dataset.mod), mod = state.mods[i];
  if (field === 'fractured') {
    mod.fractured=event.target.checked;
    if (mod.fractured) mod.rolls.forEach(r=>{r.current ??= r.target;});
    else mod.rolls.forEach(r=>{r.target=r.max;});
    mod.hit=atTarget(mod);
    clearTimeout(timer);renderMods();update();return;
  }
  if (field === 'hit') {mod.hit = event.target.checked;mod.rolls.forEach(r=>delete r.current);}
  else if (field === 'name') {mod.name = event.target.value; renderSettings();}
  else { const j = Number(event.target.closest('[data-roll]').dataset.roll); mod.rolls[j][field] = field === 'direction' ? event.target.value : event.target.value === '' ? NaN : Number(event.target.value); mod.hit=atTarget(mod);event.target.closest('[data-mod]').querySelector('[data-field="hit"]').checked=mod.hit; }
  clearTimeout(timer); timer = setTimeout(update, 100);
});
$('mods').addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const i = Number(button.closest('[data-mod]').dataset.mod), mod = state.mods[i];
  const action = button.dataset.action;
  if (action === 'remove') {
    state.mods.splice(i,1);
    state.specific = Math.max(0, Math.min(state.specific - Number(i < state.specific), state.mods.length-1));
    state.initialCraft = Math.min(state.initialCraft, state.mods.length-1);
  } else if (action === 'add-roll') mod.rolls.push(roll());
  else if (action === 'remove-roll') mod.rolls.splice(Number(button.closest('[data-roll]').dataset.roll),1);
  else if (action === 'max-target') {mod.rolls[0].target=mod.rolls[0].max; mod.rolls[0].direction='atLeast';}
  mod.hit=atTarget(mod);
  renderMods(); update();
});
for (const side of ['prefix','suffix']) $(side).addEventListener('click',()=>{
  clearTimeout(timer);
  if (state.banks) {state.banks[state.side]=bankFromState();Object.assign(state,structuredClone(state.banks[side]));}
  state.side=side;renderMods();update();
});
$('add').addEventListener('click',()=>{if(state.mods.length<3){state.mods.push({name:'Custom modifier',rolls:[roll()],hit:false});renderMods();update();}});
for (const key of ['one','two','removal']) $(key).addEventListener('input',event=>{state[key]=event.target.value === '' ? NaN : Number(event.target.value);update();});
for (const [id,key] of [['current-craft','initialCraft'],['specific','specific']]) $(id).addEventListener('change',event=>{state[key]=Number(event.target.value);update();});
function loadDemo() {
  clearTimeout(timer);state=defaults();$('item-paste').value=EXAMPLE_ITEM;
  $('import-status').className='import-success';$('import-status').textContent='Loaded Oblivion Beak demo with its copied rolls. Mirrored is ignored for planning.';
  history.replaceState(null,'',location.pathname+location.search);renderMods();update();
}
$('reset').addEventListener('click',loadDemo);
$('share').addEventListener('click',async()=>{
  try {
    validState(state);
    if (state.banks) state.banks[state.side]=bankFromState();
    const url = new URL(location.href);url.hash=new URLSearchParams({setup:JSON.stringify(state)}).toString();
    history.replaceState(null,'',url);
    await navigator.clipboard.writeText(url.href);
    $('save-status').textContent='Setup link copied';
  } catch { $('save-status').textContent = $('error').hidden ? 'Copy the setup link from the address bar' : 'Fix the inputs before sharing'; }
});
$('item-paste').value=state.itemText || '';
renderMods(); update();
if (restoreNotice) $('save-status').textContent=restoreNotice;
