const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const {MISSIONS}=require('../game-core.js');
// Execute the original scripts against a minimal DOM stand-in to verify each
// activity's real completion function, lexical score variables and bridge adapter.
function context(id, savedSnapshot = null) {
  const elements=new Map(), events={}, posts=[], timers=[];
  function element(key) {
    if (elements.has(key)) return elements.get(key);
    const classes=new Set();
    const canvasContext=new Proxy({measureText:()=>({width:50}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})}, {get:(target,k)=>target[k]??(()=>{})});
    const el={style:{setProperty(){}},dataset:{},value:'',innerHTML:'',textContent:'',innerText:'',width:1000,height:700,children:[],disabled:false,
      classList:{add(...args){args.forEach(a=>classes.add(a));},remove(...args){args.forEach(a=>classes.delete(a));},contains(a){return classes.has(a);},toggle(a){classes.has(a)?classes.delete(a):classes.add(a);}},
      appendChild(child){this.children.push(child);return child;},append(){},remove(){},setAttribute(){},getAttribute(){return null;},addEventListener(){},
      querySelector:selector=>element(key+':'+selector),querySelectorAll:()=>[],getContext:()=>canvasContext};
    elements.set(key,el);return el;
  }
  const parent={postMessage(message){posts.push(JSON.parse(JSON.stringify(message)));}};
  const doc={getElementById:element,querySelector:element,querySelectorAll:()=>[],createElement:type=>element(type+Math.random()),
    addEventListener(type,fn){events['doc:'+type]=fn;},documentElement:element('html'),body:element('body')};
  const ctx={document:doc,parent,console,URLSearchParams,location:{search:'?mission='+id+'&journey=test-token',origin:'http://localhost'},
    innerWidth:1200,innerHeight:800,performance:{now:()=>0},requestAnimationFrame(){},cancelAnimationFrame(){},
    setInterval(fn){timers.push(fn);},setTimeout(){},clearTimeout(){},scrollTo(){},addEventListener(type,fn){(events[type]??=[]).push(fn);},
    localStorage:{getItem(){return null;},setItem(){}},navigator:{clipboard:{writeText(){}}}};
  ctx.window=ctx;
  const sandbox=vm.createContext(ctx);
  const html=fs.readFileSync(path.join(root,'missions',MISSIONS.find(m=>m.id===id).file),'utf8');
  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) vm.runInContext(script[1],sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'mission-bridge.js'),'utf8'),sandbox);
  for (const fn of events.message) fn({source:parent,origin:'http://localhost',data:{source:'modeok-village',type:'init',token:'test-token',name:'테스트',snapshot:savedSnapshot}});
  return {sandbox,posts,events,parent,timers,run:code=>vm.runInContext(code,sandbox)};
}
const scenarios={
  words: "quizQuestions=WORDS_DATA.slice(0,10); quizScore=9; quizHistory=quizQuestions.map((wordObj,i)=>({wordObj,isCorrect:i<9,userAnswer:'답'})); showQuizResult();",
  dialect: "totalQuestions=10; score=9; player.name='테스트'; startTime=Date.now(); items=Array.from({length:10},()=>({active:false})); wrongAnswers=[]; endGame();",
  school: "totalQuestionsCount=10; correctCount=9; score=99999; wrongAnswers=[{foreign:'외래어',korean:'우리말'}]; showResults();",
  exam: "state.screen='result'; state.activeQuestions=initialQuizData.slice(0,10); state.userAnswers=state.activeQuestions.map((questionObj,i)=>({questionObj,isCorrect:i<9,selectedIdx:0})); renderResult();",
  initials: "score=9; userHistory=quizData.map((q,i)=>({qNum:i+1,consonant:q.consonant,correctAnswer:'답',isCorrect:i<9})); showResults();",
  master: "score=23; currentQuestionIndex=quizData.length; showResult();"
};
for (const [id,scenario] of Object.entries(scenarios)) test(id+': real result function reports correct count, denominator and one completion',()=>{
  const c=context(id);c.run(scenario);
  const messages=c.posts.filter(p=>p.type==='result');
  assert.equal(messages.length,1);assert.equal(messages[0].id,id);
  assert.equal(messages[0].correct,id==='master'?23:9);assert.equal(messages[0].total,id==='master'?25:10);assert.equal(messages[0].answered,messages[0].total);
  c.run(scenario);assert.equal(c.posts.filter(p=>p.type==='result').length,1);
});
test('wrong-only retry in the original exam is practice, never a mission clear',()=>{
  const c=context('exam');c.run("state.isRetryMode=true;"+scenarios.exam);
  assert.equal(c.posts.filter(p=>p.type==='result').length,0);assert.ok(c.posts.some(p=>p.type==='practice-note'));
});
test('incomplete original activities cannot report a completion',()=>{
  const c=context('words');c.run("quizQuestions=WORDS_DATA.slice(0,10); quizScore=1; quizHistory=[]; showQuizResult();");
  assert.equal(c.posts.filter(p=>p.type==='result').length,0);
});
const checkpoints={
  words:{setup:"quizQuestions=WORDS_DATA.slice(0,10); quizScore=1; quizHistory=[{wordObj:quizQuestions[0],userAnswer:'답',isCorrect:true}]; currentQuizIdx=0; quizAnswered=true;",check:'currentQuizIdx===1 && quizScore===1 && quizHistory.length===1'},
  school:{setup:"currentQuestions=wordData.slice(0,10); totalQuestionsCount=10; currentIndex=0; isAnswered=true; correctCount=1; score=100;",check:'currentIndex===1 && correctCount===1 && score===100 && !isAnswered'},
  exam:{setup:"state.screen='quiz'; state.activeQuestions=initialQuizData.slice(0,10); state.currentIdx=0; state.userAnswers=[{questionObj:state.activeQuestions[0],isCorrect:true,selectedIdx:0}]; state.isAnswered=true; state.selectedOption=0;",check:'state.currentIdx===0 && state.isAnswered && state.userAnswers.length===1'},
  initials:{setup:"document.getElementById('start-screen').classList.add('hidden'); currentIdx=0; score=1; answered=true; userHistory=[{qNum:1,consonant:'ㄱ',correctAnswer:'관솔불',isCorrect:true}];",check:'currentIdx===1 && score===1 && userHistory.length===1 && !answered'},
  master:{setup:"startScreen.classList.add('hidden'); currentQuestionIndex=0; score=1; isAnswering=true;",check:'currentQuestionIndex===1 && score===1 && !isAnswering'},
  dialect:{setup:"selectedQuestions=allDialects.slice(0,10);generateDesertMap();placeItems();gameState='playing';isAnswering=true;score=1;items[0].active=false;player.x=450;startTime=Date.now();",check:"gameState==='playing' && score===1 && items.filter(x=>!x.active).length===1 && player.x===450"}
};
for (const [id,checkpoint] of Object.entries(checkpoints)) test(id+': real checkpoint restores answered questions without losing or doubling credit',()=>{
  const before=context(id);before.run(checkpoint.setup);before.timers[0]();
  const snapshot=before.posts.find(p=>p.type==='snapshot');assert.ok(snapshot,id+' saved a checkpoint');
  const after=context(id,snapshot.snapshot);assert.equal(after.run(checkpoint.check),true);
  assert.equal(after.posts.filter(p=>p.type==='result').length,0);
});
