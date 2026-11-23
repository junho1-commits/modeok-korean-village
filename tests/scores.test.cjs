const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const G = require('../game-core.js');
const S = require('../score-sync.js');
function storage() {
  const values = new Map();
  return {getItem:key => values.get(key) || null, setItem:(key,value) => values.set(key,value)};
}
function completed(correct=9) {
  const state = G.create('홍길동',['words']); state.studentNameConfirmed = true;
  G.begin(state,'words');
  const result = G.accept(state,{...state.active,correct,total:10,answered:10});
  return {state,result,item:S.entry(state,result)};
}
const endpoint = 'https://script.google.com/macros/s/test-deployment/exec';
test('only confirmed student names produce records, with stable per-attempt IDs and no answers',()=>{
  const {state,result,item} = completed();
  assert.equal(item.studentName,'홍길동'); assert.equal(item.eventId,state.active.token);
  assert.equal(item.completed,true); assert.equal(item.correct,9);
  assert.equal(item.snapshot,undefined); assert.equal(item.answers,undefined);
  state.studentNameConfirmed=false; assert.equal(S.entry(state,result),null);
});
test('offline record survives reload and is removed only on matching positive acknowledgement',async()=>{
  const disk=storage(), {item}=completed();
  const offline=S.create({storage:disk,endpoint,transport:async()=>{throw new Error('offline');}});
  offline.enqueue(item); offline.enqueue(item); await offline.flush();
  assert.equal(offline.status().pending,1); assert.equal(offline.status().lastSaved,false);
  const reloaded=S.create({storage:disk,endpoint,transport:async()=>({ok:true,eventId:'wrong'})});
  await reloaded.flush(); assert.equal(reloaded.status().pending,1);
  const online=S.create({storage:disk,endpoint,transport:async(e,p)=>({ok:true,eventId:p.eventId})});
  await online.flush(); assert.equal(online.status().pending,0); assert.equal(online.status().lastSaved,true);
});
test('new student and second tab preserve pending records without mixing names',async()=>{
  const disk=storage(), first=completed().item, second={...completed().item,studentName:'김학생'};
  const a=S.create({storage:disk,endpoint,transport:async(e,p)=>({ok:true,eventId:p.eventId})});
  const b=S.create({storage:disk,endpoint,transport:async(e,p)=>({ok:true,eventId:p.eventId})});
  a.enqueue(first); b.enqueue(second); assert.equal(a.status().pending,2);
  const seen=[];
  const sender=S.create({storage:disk,endpoint,transport:async(e,p)=>{seen.push(p.studentName);return {ok:true,eventId:p.eventId};}});
  await sender.flush(); assert.deepEqual(seen,['홍길동','김학생']);
  assert.equal(a.status().pending,0); assert.equal(b.status().pending,0);
});
test('unavailable browser storage reports volatile records and does not loop after acknowledgement',async()=>{
  const queue=S.create({storage:{getItem(){throw Error();},setItem(){throw Error();}},endpoint,transport:async(e,p)=>({ok:true,eventId:p.eventId})});
  queue.enqueue(completed().item); assert.equal(queue.status().persisted,false);
  await queue.flush(); assert.equal(queue.status().pending,0);
});
test('unconfigured deployment retains records without reporting save success',async()=>{
  let calls=0;
  const queue=S.create({storage:storage(),endpoint:'',transport:async()=>{calls++;}});
  queue.enqueue(completed().item); await queue.flush();
  assert.equal(calls,0); assert.equal(queue.status().pending,1); assert.equal(queue.status().configured,false);
});
function backend() {
  const rows=[['기록 시각','학생 이름','미션','맞힌 문제','전체 문제','점수(100점)','통과 여부','활동 구분','획득 도장','선택 관문','남은 라이프','완주 여부','풀이 시각','여행 ID','도전 ID','기록 ID']];
  let lock=false;
  const sheet={getLastRow:()=>rows.length,getRange:(r,c,n=1,w=1)=>({
    getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),
    setValues:values=>{assert.equal(lock,true);rows.splice(r-1,values.length,...values);},setNumberFormat(){},
    createTextFinder:value=>({matchEntireCell(){return this;},useRegularExpression(){return this;},findNext:()=>rows.slice(1).some(row=>row[15]===value)})
  })};
  const sandbox=vm.createContext({console:{warn(){}},SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-sheet'})},
    LockService:{getScriptLock:()=>({waitLock(){lock=true;},releaseLock(){lock=false;}})},
    HtmlService:{createHtmlOutput:html=>({html,setXFrameOptionsMode(){return this;}}),XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../google-apps-script/Code.gs'),'utf8'),sandbox);
  function post(item) {
    sandbox.event={parameter:{payload:JSON.stringify({...item,nonce:'test-nonce-123456',origin:'https://junho1-commits.github.io'})}};
    return vm.runInContext('doPost(event)',sandbox).html;
  }
  return {rows,post};
}
test('server writes numeric score once under a lock, recomputes pass/fail, and acknowledges duplicate retry',()=>{
  const b=backend(), {item}=completed(8);
  assert.match(b.post({...item,passed:true,accuracy:100}),/"ok":true/);
  assert.equal(b.rows.length,2); assert.equal(b.rows[1][5],80); assert.equal(b.rows[1][6],'미통과');
  assert.match(b.post(item),/"ok":true/); assert.equal(b.rows.length,2);
});
test('server rejects invalid scores, unknown missions, invalid origins, and invalid progress',()=>{
  for (const changes of [{total:0},{correct:11},{correct:1.2},{missionId:'__proto__'},{studentName:'  '},{origin:'https://evil.example'},{completed:true,clearedCount:0}]) {
    const b=backend(), item={...completed().item,...changes};
    // Origin is envelope metadata, so test it with the raw entry function.
    if (changes.origin) {
      const source=fs.readFileSync(path.join(__dirname,'../google-apps-script/Code.gs'),'utf8');
      const ctx=vm.createContext({});vm.runInContext(source,ctx);ctx.p={...item,nonce:'test-nonce-123456'};
      assert.throws(()=>vm.runInContext('validate_(p)',ctx));
    } else { assert.match(b.post(item),/"ok":false/); assert.equal(b.rows.length,1); }
  }
});
test('server stores formula-looking student names as literal text',()=>{
  const b=backend();b.post({...completed().item,studentName:'=1+1'});
  assert.equal(b.rows[1][1],"'=1+1");
});
