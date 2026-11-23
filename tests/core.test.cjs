const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game-core.js');
function result(s, c, n, extras = {}) { return G.accept(s, { ...s.active, correct: c, total: n, answered: n, ...extras }); }
test('selected HTML missions appear once; random shuffle preserves a permutation', () => {
  const ids = G.MISSIONS.map(m => m.id);
  const seen = new Set();
  for (let i = 0; i < 40; i++) { const s = G.create('학생'); assert.deepEqual([...s.order].sort(), [...ids].sort()); seen.add(s.order.join()); }
  assert.ok(seen.size > 1);
  assert.deepEqual(G.create('학생', ['words','words','invalid']).order, ['words']);
  assert.throws(() => G.create('학생', []));
});
test('only the first uncleared mission can be started', () => {
  const s = G.create('학생'); assert.throws(() => G.begin(s, s.order[1]));
  G.begin(s, s.order[0]); result(s, 9, 10); G.begin(s, s.order[1]);
  assert.equal(G.current(s), s.order[1]); assert.equal(s.hearts, 3);
});
test('85 percent is inclusive, actual ratio is used rather than rounded percentage', () => {
  for (const [c,n,pass] of [[17,20,true],[16,20,false],[9,10,true],[8,10,false],[22,25,true],[21,25,false],[26,30,true],[25,30,false],[28,33,false],[34,40,true]]) {
    const s=G.create('학생',['words']); G.begin(s,'words'); assert.equal(result(s,c,n).passed,pass,`${c}/${n}`);
  }
});

test('dialect starts every new journey that includes it; the remaining selected missions stay shuffled', () => {
  const seen = new Set();
  for (let i=0;i<40;i++) {
    const s=G.create('학생'); assert.equal(s.order[0],'dialect');
    assert.equal(new Set(s.order).size,6); seen.add(s.order.slice(1).join());
  }
  assert.ok(seen.size>1);
  assert.deepEqual(G.create('학생',['words','dialect']).order,['dialect','words']);
  assert.deepEqual(G.create('학생',['words']).order,['words']);
});

test('85 percent clears, restores saved progress, and recovers lives in practice', () => {
  const s=G.create('학생',['words']);
  for(let i=0;i<3;i++){G.begin(s,'words');result(s,16,20);}
  assert.equal(G.begin(s,'words').mode,'practice');result(s,17,20);
  assert.equal(s.hearts,3);assert.equal(G.current(s),'words');
  G.begin(s,'words');result(s,17,20);
  assert.equal(G.current(s),null);assert.ok(G.valid(JSON.parse(JSON.stringify(s))));
});
test('three failed missions consume exactly three lives; practice cannot unlock a stage', () => {
  const s=G.create('학생',['words']);
  for (const lives of [2,1,0]) { G.begin(s,'words'); result(s,8,10); assert.equal(s.hearts,lives); assert.equal(G.current(s),'words'); }
  assert.equal(G.begin(s,'words').mode,'practice'); result(s,8,10); assert.equal(s.hearts,0);
  assert.equal(G.begin(s,'words').mode,'practice'); result(s,9,10); assert.equal(s.hearts,3); assert.equal(G.current(s),'words');
  assert.equal(G.begin(s,'words').mode,'challenge'); result(s,9,10); assert.equal(G.current(s),null);
});
test('duplicate result, previous-attempt messages and malformed scores are ignored', () => {
  const s=G.create('학생',['master']); G.begin(s,'master'); const old={...s.active};
  assert.equal(result(s,100,25),null); assert.equal(result(s,9,10,{answered:9}),null);
  assert.equal(result(s,9,9),null); assert.equal(result(s,8.8,10),null); assert.equal(result(s,9,10,{token:'wrong'}),null);
  result(s,8,10); assert.equal(result(s,8,10),null); assert.equal(s.hearts,2);
  G.begin(s,'master'); assert.equal(G.accept(s,{...old,correct:9,total:10,answered:10}),null); assert.equal(s.hearts,2);
});
test('saving and restoring keeps order, lives, active attempt and the question checkpoint', () => {
  const s=G.create('학생'); G.begin(s,s.order[0]); s.active.snapshot={index:4,score:3,questions:[1,2,3,4,5]};
  const copy=JSON.parse(JSON.stringify(s)); assert.ok(G.valid(copy));
  const active=G.begin(copy,copy.order[0]); assert.deepEqual(active,s.active); assert.deepEqual(copy.order,s.order);
});
test('reviewing cleared stages never costs a life or changes the next gate', () => {
  const s=G.create('학생'); G.begin(s,s.order[0]); result(s,9,10); const next=G.current(s);
  assert.equal(G.begin(s,s.order[0]).mode,'review'); result(s,0,10);
  assert.equal(s.hearts,3); assert.equal(G.current(s),next); assert.equal(s.cleared[s.order[0]].correct,9);
});
test('all six must pass in sequence before the journey is complete', () => {
  const s=G.create('학생');
  for (let i=0;i<6;i++) { assert.equal(G.current(s),s.order[i]); G.begin(s,s.order[i]); result(s,10,10); assert.ok(G.valid(s)); }
  assert.equal(G.current(s),null); assert.equal(Object.keys(s.cleared).length,6);
});
test('corrupt save data and out-of-order clears are rejected', () => {
  for (const bad of [null,{}, {version:2}, {...G.create('학생'),hearts:-1}]) assert.equal(G.valid(bad),false);
  const s=G.create('학생'); s.cleared[s.order[1]]={correct:9,total:10}; assert.equal(G.valid(s),false);
});
