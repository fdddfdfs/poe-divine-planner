import test from 'node:test';
import assert from 'node:assert/strict';
import {rollProbability, probabilities, transition, calculate, fractureMask} from '../dist/engine.js';
const close = (a,b,t=1e-8) => assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test('inclusive, decimal, reversed-desirability and exact targets',()=>{
  close(rollProbability({min:100,max:109,step:1,target:109,direction:'atLeast'}),.1);
  close(rollProbability({min:1,max:2,step:.1,target:1.5,direction:'atLeast'}),6/11);
  close(rollProbability({min:-10,max:-5,step:1,target:-9,direction:'atMost'}),2/6);
  close(rollProbability({min:2,max:2,step:1,target:2,direction:'exact'}),1);
  assert.throws(()=>rollProbability({min:1,max:2,step:.3,target:2,direction:'exact'}));
  assert.throws(()=>rollProbability({min:1,max:3,step:1,target:1.5,direction:'exact'}));
  assert.throws(()=>rollProbability({min:5,max:1,step:1,target:2,direction:'atLeast'}));
});
test('hybrid rolls belong to one modifier',()=>{
  const r={min:1,max:10,step:1,target:10,direction:'exact'};
  const ps=probabilities([{rolls:[r,r]},{rolls:[r]}]);
  close(ps[0],.01);close(ps[1],.1);
  // One of two mods is protected: the entire successful hybrid survives half the time.
  const next=transition(ps,1,1);
  close(next[3],.05);
});
test('random protection is resampled and never guarantees chosen modifier',()=>{
  const p=transition([.1,.2,.3],1,1);
  assert.ok(p[0]>0,'A previously successful modifier can be lost');
  close(p.reduce((a,b)=>a+b,0),1);
  close(p[7],.2*.3/3);
  close(transition([.1,.2,.3],3,2)[7],.3/3);
  for(let mask=0;mask<8;mask++)for(let k=0;k<3;k++)close(transition([.1,.2,.3],mask,k).reduce((a,b)=>a+b,0),1);
});
test('plain Divine exact geometric expectation and initial completion',()=>{
  close(calculate([.1,.2,.25]).results[0].rolls,200);
  for(const r of calculate([.1]).results)close(r.cost,10);
  for(const r of calculate([.1,.2],{initialMask:3}).results)close(r.cost,0);
  for(const r of calculate([.1,.2],{initialMask:3,initialCraft:1,removal:.25}).results){close(r.cost,.25);close(r.rolls,0);close(r.removals,1);}
  close(calculate([1,1]).results[0].cost,0);
});
test('plain strategy removes an existing craft just once',()=>{
  const r=calculate([.5,.5],{initialCraft:1,removal:.2}).results[0];
  close(r.rolls,4);close(r.cost,4.2);close(r.crafts,0);close(r.removals,1);
});
test('optimal policy is no more expensive than each fixed strategy across inputs',()=>{
  for(const ps of [[.1,.2,.3],[.5,.5],[.01,.9,.5],[1,.1,.2],[.99,.99,.99],[.1]])
    for(const initialMask of [0,(1<<ps.length)-1])
      for(const one of [0,1,100]){
        const r=calculate(ps,{one,two:one*2,initialMask,removal:.2}).results;
        for(const other of r.slice(0,3))assert.ok(r[3].cost<=other.cost+1e-6);
      }
});
test('reject impossible or numerically unreliable inputs',()=>{
  assert.throws(()=>calculate([0,.5]));
  assert.throws(()=>calculate([.00001,.00001,.00001]));
  assert.throws(()=>calculate([.5,.5],{one:-1}));
  assert.throws(()=>calculate([.5,.5],{specific:2}));
});
test('fractures contribute no divine requirement, including an all-fractured side',()=>{
  const mods=[{fractured:true,rolls:[{min:1,max:10,step:1,target:10,direction:'atLeast',current:2}]},{rolls:[{min:1,max:5,step:1,target:5,direction:'atLeast'}]}];
  assert.deepEqual(probabilities(mods),[1,.2]);assert.equal(fractureMask(mods),1);
  close(calculate(probabilities(mods),{fracturedMask:1}).results[0].rolls,5);
  for(const result of calculate([.01,.1,.2],{fracturedMask:7}).results){close(result.rolls,0);close(result.cost,0);}
  close(calculate([.000001,.000001,.1],{fracturedMask:3}).results[0].rolls,10);
  assert.throws(()=>calculate([.5],{fracturedMask:2}),/mask/);
});
test('fractures never change but remain eligible for random partial locks',()=>{
  const next=transition([1,.2],1,1,1);
  close(next[0],0);close(next[2],0);
  close(next[3],.1); // The lock protects the fracture half the time.
  close(next[1],.9);
  for(let mask=0;mask<8;mask++)for(let k=0;k<3;k++){
    const p=transition([1,.2,.3],mask,k,1);
    close(p.reduce((a,b)=>a+b,0),1);
    close(p.filter((_,i)=>!(i&1)).reduce((a,b)=>a+b,0),0);
  }
});
test('target-count and specific strategies do not lock merely because a fracture is fixed',()=>{
  const result=calculate([1,.2,.3],{fracturedMask:1,specific:0,initialMask:1});
  assert.equal(result.results[1].next,0);
  assert.equal(result.results[2].next,0);
  const oneHit=calculate([1,.2,.3],{fracturedMask:1,specific:1,initialMask:3});
  assert.equal(oneHit.results[2].next,1);
});
test('independent seeded Monte Carlo agrees with all four policy expectations',()=>{
  for (const fracturedMask of [0,1]) {
  const ps=[.25,.5,.2], config={one:1,two:2,removal:.1,specific:2,fracturedMask};
  const expected=calculate(ps,config);
  let seed=4201;
  const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const trials=60000;
  for(const result of expected.results){
    let total=0,rolls=0;
    for(let trial=0;trial<trials;trial++){
      let mask=fracturedMask,craft=0,cost=0,count=0;
      while(mask!==7){
        const a=result.policy[mask*3+craft];
        if(a!==craft){if(craft)cost+=config.removal;cost+=[0,config.one,config.two][a];}
        craft=a;cost++;count++;
        const indices=[0,1,2];
        for(let i=2;i>0;i--){const j=Math.floor(rng()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}
        const locked=indices.slice(0,craft);
        for(let i=0;i<3;i++)if(!(fracturedMask&(1<<i)) && !locked.includes(i)){
          if(rng()<ps[i])mask|=1<<i;else mask&=~(1<<i);
        }
        assert.ok(count<100000,'Simulation should terminate');
      }
      if(craft)cost+=config.removal;
      total+=cost;rolls+=count;
    }
    close(total/trials,result.cost,.025);close(rolls/trials,result.rolls,.025);
  }
  }
});
