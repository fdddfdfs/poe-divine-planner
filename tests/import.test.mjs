import test from 'node:test';
import assert from 'node:assert/strict';
import {parseItem,atTarget,EXAMPLE_ITEM} from '../dist/import.js';
import {probabilities,calculate} from '../dist/engine.js';
const item = stats => `Item Class: Wands\nRarity: Rare\nDoom Branch\nImbued Wand\n--------\nItem Level: 85\n--------\n${stats}`;
test('full advanced item: both sides, current rolls, hybrid grouping and implicit exclusion',()=>{
  const parsed = parseItem(EXAMPLE_ITEM.replaceAll('\n','\r\n'));
  assert.equal(parsed.itemName,'Storm Shelter');
  const p=parsed.banks.prefix,s=parsed.banks.suffix;
  assert.equal(p.mods.length,3);assert.equal(s.mods.length,2);
  assert.equal(p.mods[0].rolls[0].min,100);assert.equal(p.mods[0].rolls[0].max,109);
  assert.equal(p.mods[0].rolls[0].current,104);assert.equal(p.mods[0].hit,false);
  assert.equal(p.mods[1].hit,true);assert.equal(s.mods[0].hit,true);
  assert.equal(p.mods[2].rolls.length,2);
  assert.equal(probabilities(p.mods)[2],1/8);
  assert.equal(p.canCraft,true);assert.equal(s.canCraft,false);
});
test('flat added damage is one modifier with two ranges',()=>{
  const m=parseItem(item('{ Prefix Modifier "Gleaming" (Tier: 5) }\nAdds 19(14-21) to 34(32-38) Physical Damage')).banks.prefix.mods[0];
  assert.equal(m.rolls.length,2);assert.equal(m.rolls[1].current,34);
  assert.equal(m.name,'Adds # to # Physical Damage');
});
test('negative/reversed ranges and decimal precision',()=>{
  const m=parseItem(item('{ Suffix Modifier "Test" (Tier: 1) }\n-9(-5--10)% to Fire Resistance\n0.34(0.2-0.4)% of Damage Leeched as Life')).banks.suffix.mods[0];
  assert.deepEqual(m.rolls[0],{min:-10,max:-5,step:1,target:-5,direction:'atLeast',current:-9});
  assert.equal(m.rolls[1].step,.01);
  assert.equal(m.rolls[1].current,.34);
});
test('fixed modifiers occupy a lock candidate, reminder numbers do not add rolls',()=>{
  const parsed=parseItem(item('{ Prefix Modifier "Fixed" (Tier: 1) }\n+1 to Level of all Spell Skill Gems\n{ Suffix Modifier "Hybrid" (Tier: 1) }\nAttacks have 25% chance to cause Bleeding\n(Bleeding deals 70% of damage over 5 seconds)\n38(31-40)% increased Damage with Bleeding'));
  assert.equal(parsed.banks.prefix.mods[0].hit,true);
  assert.equal(probabilities(parsed.banks.prefix.mods)[0],1);
  assert.equal(parsed.banks.suffix.mods[0].rolls.length,1);
});
test('non-numeric and fixed-parenthesis modifiers remain represented',()=>{
  const mods=parseItem(item('{ Prefix Modifier "Fixed" }\nHits cannot be Evaded\n{ Suffix Modifier "Other" }\n80(80)% increased Damage')).banks;
  assert.equal(mods.prefix.mods.length,1);assert.equal(probabilities(mods.prefix.mods)[0],1);
  assert.equal(mods.suffix.mods[0].rolls[0].min,80);
});
test('crafted modifiers count and prevent invalid lock recommendations',()=>{
  const parsed=parseItem(item('{ Master Crafted Prefix Modifier "Crafted" (Rank: 3) }\n+62(56-70) to maximum Life (crafted)\n{ Suffix Modifier "Test" }\n+40(36-41)% to Fire Resistance'));
  assert.equal(parsed.banks.prefix.mods[0].crafted,true);
  assert.equal(parsed.banks.prefix.canCraft,false);assert.equal(parsed.banks.suffix.canCraft,true);
  assert.equal(parsed.banks.suffix.removableCraft,true);
  const result=calculate([.1,.05,.1],{canCraft:false}).results;
  assert.ok(Math.abs(result[3].cost-2000)<1e-6);
  assert.equal(result[3].crafts,0);
  assert.ok(result[3].policy.every(k=>k===0));
});
test('target changes re-evaluate copied values including lower-is-better',()=>{
  const mod=parseItem(EXAMPLE_ITEM).banks.prefix.mods[0];
  mod.rolls[0].target=103;assert.equal(atTarget(mod),true);
  mod.rolls[0].direction='exact';assert.equal(atTarget(mod),false);
  mod.rolls[0].target=104;assert.equal(atTarget(mod),true);
  mod.rolls[0].direction='atMost';mod.rolls[0].target=105;assert.equal(atTarget(mod),true);
});
test('plain copy, unsupported items and ambiguous/scaled ranges fail explicitly',()=>{
  assert.throws(()=>parseItem(item('+104 to maximum Life')),/advanced/i);
  assert.throws(()=>parseItem(EXAMPLE_ITEM+'\n--------\nUnidentified'),/outside/);
  assert.throws(()=>parseItem(EXAMPLE_ITEM+'\n--------\nFractured Item'),/no modifier is marked/);
  assert.throws(()=>parseItem(EXAMPLE_ITEM.replace('Rarity: Rare','Rarity: Unique')),/rare equipment/i);
  assert.throws(()=>parseItem(EXAMPLE_ITEM.replace('Item Class: Body Armours','Item Class: Maps')),/rare equipment/i);
  assert.throws(()=>parseItem(EXAMPLE_ITEM.replace('Armour: 1250','Quality (Life and Mana Modifiers): +20%')),/Catalyst/);
  assert.throws(()=>parseItem(item('{ Prefix Modifier "X" }\n120(100-109) to maximum Life')),/outside its raw range/);
  assert.throws(()=>parseItem(item('{ Prefix Modifier "X" }\n+(100-109) to maximum Life')),/current value/);
  assert.equal(parseItem(item('{ Prefix Modifier "X" }\n10(1-10)% increased Damage (fractured)')).banks.prefix.mods[0].fractured,true);
  assert.throws(()=>parseItem(item('{ Master Crafted Suffix Modifier "Meta" }\n1 Prefix Modifier cannot be changed (crafted)')),/metacraft/);
  assert.throws(()=>parseItem(EXAMPLE_ITEM+'\n'+EXAMPLE_ITEM),/one complete item/);
});
test('fractured hybrid stays fixed below maximum and remains an occupied affix',()=>{
  const text=EXAMPLE_ITEM.replace('39(39-42)% increased Armour','39(39-42)% increased Armour (fractured)')+'\n--------\nFractured Item';
  const parsed=parseItem(text), mod=parsed.banks.prefix.mods[2];
  assert.equal(mod.fractured,true);assert.equal(mod.hit,true);assert.equal(atTarget(mod),true);
  assert.deepEqual(mod.rolls.map(r=>r.current),[39,16]);
  assert.deepEqual(mod.rolls.map(r=>r.target),[39,16]);
  assert.equal(probabilities(parsed.banks.prefix.mods)[2],1);
  assert.equal(parsed.banks.suffix.canCraft,false,'Three occupied prefixes still prevent a suffix lock');
});
test('fracture headers work and item mutability flags are ignored for planning',()=>{
  const text=item('{ Fractured Prefix Modifier "Fixed" }\n5(1-10)% increased Damage')+'\n--------\nCorrupted\nMirrored\nUnmodifiable';
  const parsed=parseItem(text);
  assert.equal(parsed.banks.prefix.mods[0].fractured,true);
  assert.deepEqual(parsed.itemFlags,['Corrupted','Mirrored','Unmodifiable']);
  assert.equal(parsed.banks.prefix.canCraft,true);
  for(const flag of parsed.itemFlags){
    const p=parseItem(EXAMPLE_ITEM+'\n--------\n'+flag);
    assert.deepEqual(probabilities(p.banks.prefix.mods),probabilities(parseItem(EXAMPLE_ITEM).banks.prefix.mods));
    assert.equal(p.banks.prefix.canCraft,true);
  }
});
test('more than three same-side modifiers is rejected rather than truncated',()=>{
  const lines=Array.from({length:4},(_,i)=>`{ Prefix Modifier "Test${i}" }\n10(1-10)% increased Damage`).join('\n');
  assert.throws(()=>parseItem(item(lines)),/More than three modifiers/);
});


test('full suffixes with crafted Double Damage allow prefix locks without dropping targets',()=>{
  const text=EXAMPLE_ITEM+'\n{ Master Crafted Suffix Modifier "of Craft" }\n5(4-5)% chance to deal Double Damage';
  const parsed=parseItem(text), p=parsed.banks.prefix, s=parsed.banks.suffix;
  assert.equal(s.mods.length,3);assert.equal(s.mods[2].crafted,true);
  assert.equal(p.canCraft,true);assert.equal(p.removableCraft,true);
  assert.equal(s.canCraft,false);assert.equal(s.removableCraft,false);
  assert.match(p.reason,/removed when the first lock/);
  const fixed=parseItem(text.replace('Master Crafted Suffix','Fractured Master Crafted Suffix'));
  assert.equal(fixed.banks.prefix.canCraft,false);
  assert.equal(fixed.banks.prefix.removableCraft,false);
});
