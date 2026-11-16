import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate} from '../dist/engine.js';
import {buildGuide} from '../dist/guide.js';

test('wand guide covers all variable outcomes and uses the actual optimal policy',()=>{
  const settings={side:'prefix',removableCraft:true,fracturedMask:1,initialCraft:0};
  const mods=[{name:'Fractured hybrid',fractured:true},{name:'Added Physical Damage'},{name:'Increased Physical Damage'}];
  const calc=calculate([1,1/64,1/15],settings);
  const guide=buildGuide(calc,mods,settings);
  assert.deepEqual(guide.variable,[1,2]);
  assert.deepEqual(guide.rows.map(r=>r.mask),[1,3,5,7]);
  assert.match(guide.first,/without a lock/);
  for(const row of guide.rows)for(const group of row.groups)for(const craft of group.crafts){
    assert.equal(group.action,row.complete?null:calc.policy[row.mask*calc.width+craft]);
  }
  const hit=guide.rows.find(r=>r.mask===3);
  const original=hit.groups.flatMap(g=>g.instructions).find(i=>i.craft===3);
  assert.match(original.text,/Remove the crafted suffix/);
  assert.match(original.text,/2-mod prefix lock/);
  const completed=guide.rows.at(-1).groups[0].instructions;
  assert.match(completed.find(i=>i.craft===3).text,/no more Divines/);
  assert.doesNotMatch(completed.find(i=>i.craft===3).text,/Remove/);
  assert.match(completed.find(i=>i.craft===2).text,/Remove the remaining lock/);
});

test('guide distinguishes current crafts when switching costs change the action',()=>{
  const settings={side:'suffix',one:10,two:20,removal:5,initialCraft:1};
  const calc=calculate([.2,.3,.4],settings);
  const guide=buildGuide(calc,[{},{},{}],settings);
  assert.ok(guide.rows.some(row=>row.groups.length>1));
  for(const row of guide.rows) {
    assert.equal(row.groups.flatMap(g=>g.crafts).length,3);
    for(const group of row.groups)for(const craft of group.crafts)
      assert.equal(group.action,row.complete?null:calc.policy[row.mask*calc.width+craft]);
  }
  assert.match(guide.lock(1),/suffix/);
});

test('always-satisfied targets omit impossible outcomes and unavailable locks are not suggested',()=>{
  const settings={side:'prefix',canCraft:false,initialCraft:0};
  const guide=buildGuide(calculate([1,.2,1],settings),[{},{},{}],settings);
  assert.deepEqual(guide.variable,[1]);
  assert.deepEqual(guide.rows.map(r=>r.mask),[5,7]);
  assert.deepEqual(guide.rows[0].groups.map(g=>g.action),[0]);
  assert.deepEqual(guide.rows[0].groups[0].crafts,[0]);
  const done=buildGuide(calculate([1,1],settings),[{},{}],settings);
  assert.equal(done.rows.length,1);assert.equal(done.rows[0].complete,true);
  assert.match(done.first,/Stop/);
});
