'use strict';
(() => {
  const G = VillageGame;
  const KEY = 'modeok-hanok-journey-v2';
  const $ = id => document.getElementById(id);
  const spots = [[22, 58], [29, 27], [49, 30], [60, 52], [80, 29], [79, 75]];
  const houseSpots = [[143, 326], [224, 88], [466, 95], [564, 270], [785, 80], [770, 445]];
  let state = null, closing = false, walkAnimation = null, savingFailed = false, readyTimer = null, lastSave = 0;
  const mission = id => G.MISSIONS.find(m => m.id === id);
  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4000);
  }
  function save() {
    if (!state) return;
    state.updatedAt = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      lastSave = state.updatedAt; savingFailed = false;
      $('save-state').textContent = '이 기기에 자동 저장했어요';
    } catch (e) {
      $('save-state').textContent = '저장 공간을 확인해 주세요 · 현재 창에서만 진행돼요';
      if (!savingFailed) toast('기기에 기록을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
      savingFailed = true;
    }
  }
  try {
    const loaded = JSON.parse(localStorage.getItem(KEY));
    if (G.valid(loaded)) state = loaded;
    else if (loaded) toast('기존 기록을 읽지 못했어요. 새 여행을 시작해 주세요.');
  } catch (e) { toast('기존 기록을 읽지 못했어요. 새 여행을 시작할 수 있어요.'); }
  let scoreStorage;
  try { scoreStorage = window.localStorage; } catch (e) { scoreStorage = { getItem() { throw e; }, setItem() { throw e; } }; }
  const scoreSync = VillageScores.create({
    storage: scoreStorage, endpoint: (window.VILLAGE_SCORE_CONFIG || {}).endpoint,
    transport: VillageScores.browserTransport, onChange: showScoreStatus
  });
  function showScoreStatus(info) {
    let message = !info.configured ? '선생님 기록장 연결 준비 중' : info.busy ? `선생님 기록장에 저장 중 · ${info.pending}건` : info.pending ? `선생님 기록장 저장 대기 · ${info.pending}건` : info.lastSaved ? '선생님 기록장에 저장했어요' : '미션을 마치면 선생님 기록장에 저장해요';
    if (!info.configured && info.pending) message += ` · ${info.pending}건 대기`;
    if (info.error) message = `${info.error} · ${info.pending}건 대기`;
    if (!info.persisted && info.pending) message += ' · 이 창을 닫지 말고 다시 저장해 주세요';
    document.querySelectorAll('[data-score-status]').forEach(element => element.textContent = message);
    $('score-retry').hidden = !info.pending || !info.configured;
    $('score-retry').disabled = info.busy;
  }
  $('score-retry').onclick = () => scoreSync.flush();
  window.addEventListener('online', () => scoreSync.flush());
  window.addEventListener('storage', event => { if (event.key === 'modeok-score-outbox-v1') scoreSync.flush(); });
  setInterval(() => { if (scoreSync.status().pending) scoreSync.flush(); }, 60000);
  scoreSync.flush();
  function openDialog(id) { if (!$(id).open) $(id).showModal(); }
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  $('help-btn').onclick = () => openDialog('help-dialog');
  $('new-btn').onclick = () => openDialog(state ? 'reset-dialog' : 'welcome-dialog');
  $('confirm-reset').onclick = () => {
    $('reset-dialog').close(); $('nickname').value = ''; $('welcome-error').textContent = '';
    openDialog('welcome-dialog');
  };
  $('mission-options').replaceChildren(...G.MISSIONS.map(m => {
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.value = m.id; input.name = 'mission'; input.checked = true;
    label.append(input, document.createTextNode(m.title)); return label;
  }));
  $('welcome-form').onsubmit = event => {
    event.preventDefault();
    const name = $('nickname').value.trim();
    if (!name || /[\x00-\x1f\x7f]/.test(name)) { $('welcome-error').textContent = '선생님이 알아볼 수 있도록 이름을 입력해 주세요.'; $('nickname').focus(); return; }
    const ids = [...document.querySelectorAll('input[name="mission"]:checked')].map(input => input.value);
    if (!ids.length) { $('welcome-error').textContent = '함께 여행할 미션을 하나 이상 골라 주세요.'; return; }
    state = G.create(name, ids); state.studentNameConfirmed = true; save();
    $('welcome-error').textContent = ''; $('welcome-dialog').close();
    render(); animateTraveler(true); toast(state.order[0] === 'dialect' ? '사투리(방언) 관문부터 여행을 시작해요!' : '선택한 미션으로 여행을 시작해요!');
  };
  $('identity-form').onsubmit = event => {
    event.preventDefault();
    const name = $('student-name').value.trim();
    if (!name || /[\x00-\x1f\x7f]/.test(name)) { $('identity-error').textContent = '이름을 입력해 주세요.'; return; }
    state.name = name; state.studentNameConfirmed = true;
    if (!state.journeyId) state.journeyId = crypto.randomUUID();
    save(); render(); $('identity-dialog').close();
    toast('이제부터 마치는 미션의 점수를 선생님 기록장에 저장해요.');
  };
  function render() {
    const order = state ? state.order : G.MISSIONS.map(m => m.id);
    const current = state && G.current(state), clearedCount = state ? Object.keys(state.cleared).length : 0;
    const allDone = !!state && !current;
    document.body.classList.toggle('completed', allDone);
    $('traveler-name').textContent = state ? state.name : '우리말 여행자';
    $('progress-label').textContent = `${clearedCount} / ${order.length} 관문`;
    $('progress-bar').style.width = `${clearedCount / order.length * 100}%`;
    const hearts = state ? state.hearts : 3;
    $('hearts').textContent = '♥ '.repeat(hearts) + '♡ '.repeat(3 - hearts);
    $('hearts').setAttribute('aria-label', `남은 라이프 ${hearts}개`);
    $('stamp-count').textContent = `${clearedCount} / ${order.length}`;
    $('stamps').replaceChildren(...order.map(id => {
      const stamp = document.createElement('div'); stamp.className = 'stamp' + (state && state.cleared[id] ? ' earned' : '');
      stamp.textContent = mission(id).seal; stamp.title = `${mission(id).title} · ${state && state.cleared[id] ? '통과' : '아직 도장이 없어요'}`;
      stamp.setAttribute('aria-label', stamp.title); return stamp;
    }));
    $('village-houses').replaceChildren(...order.map((id, index) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      el.setAttribute('href', '#house'); el.setAttribute('x', houseSpots[index][0]); el.setAttribute('y', houseSpots[index][1]);
      el.setAttribute('width', '150'); el.setAttribute('height', '125');
      el.setAttribute('opacity', !state || id === current || state.cleared[id] ? '1' : '.6'); return el;
    }));
    $('map-stops').replaceChildren(...order.map((id, index) => {
      const m = mission(id), cleared = state && state.cleared[id], isCurrent = current === id;
      const stop = document.createElement('button');
      stop.className = 'stop ' + (cleared ? 'cleared' : isCurrent ? 'current' : 'locked');
      stop.style.left = spots[index][0] + '%'; stop.style.top = spots[index][1] + '%';
      stop.dataset.mission = id;
      const number = document.createElement('span'); number.className = 'stop-number'; number.textContent = cleared ? '✓' : isCurrent ? String(index + 1) : '🔒';
      const label = document.createElement('span'); label.className = 'stop-label'; label.textContent = m.place;
      const sub = document.createElement('span'); sub.className = 'stop-subtitle'; sub.textContent = cleared ? '도장 획득 · 복습 가능' : `관문 ${index + 1} · ${m.title.replace('우리말 ', '').replace('소중한 ', '')}`;
      stop.append(number, label, sub);
      stop.setAttribute('aria-label', `${index + 1}번째 ${m.title}, ${cleared ? '통과, 복습 가능' : isCurrent ? '도전 가능' : '잠김'}`);
      if (!isCurrent && !cleared) stop.setAttribute('aria-disabled', 'true');
      stop.onclick = () => {
        if (!state) { openDialog('welcome-dialog'); return; }
        if (!cleared && !isCurrent) { toast('앞 관문에서 정답률 85% 이상을 얻으면 이 길이 열려요.'); return; }
        launch(id);
      };
      return stop;
    }));
    if (!state) {
      $('next-kicker').textContent = '첫 번째 발걸음'; $('next-title').innerHTML = '우리말 마을로<br>떠나 볼까요?';
      $('next-desc').textContent = '여섯 관문에서 우리말의 보물을 찾아요.'; $('continue-btn').textContent = '여행 시작하기';
      $('checkpoint-note').textContent = '여행 기록은 자동으로 저장돼요.';
    } else if (allDone) {
      $('next-kicker').textContent = '우리말 유람 완주'; $('next-title').textContent = `${state.name}, 장원급제!`;
      $('next-desc').textContent = `모든 ${order.length}개 관문을 통과했어요. 도장을 누르듯 지도에서 다시 복습해 보세요.`;
      $('continue-btn').textContent = '완주 수첩 내려받기'; $('checkpoint-note').textContent = '통과한 관문은 언제든 복습할 수 있어요.';
    } else {
      const m = mission(current), index = order.indexOf(current), active = state.active;
      $('next-kicker').textContent = `여행의 ${index + 1}번째 관문`;
      $('next-title').textContent = m.place; $('next-desc').textContent = m.title + ' · ' + m.tag;
      $('continue-btn').textContent = hearts === 0 ? '복습으로 라이프 회복' : active && active.id === current && active.status === 'playing' ? '멈춘 곳부터 이어 하기' : '이 관문 도전하기';
      $('checkpoint-note').textContent = hearts === 0 ? '복습 85% 이상으로 회복한 뒤 정식 도전해요.' : '85% 이상이면 다음 길이 열려요.';
    }
    if (state && !savingFailed) $('save-state').textContent = '이 기기에 자동 저장된 여행이에요';
    animateTraveler(false);
  }
  function animateTraveler(walk) {
    if (walkAnimation) cancelAnimationFrame(walkAnimation);
    const traveler = $('travelers'), path = $('travel-path');
    const order = state ? state.order : [], id = state && G.current(state), index = id ? order.indexOf(id) : order.length;
    const target = state ? (id ? [spots[index][0] - 7, spots[index][1] + 2] : [93, 79]) : [9, 83];
    if (!walk || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      traveler.classList.remove('walking'); traveler.style.left = target[0] + '%'; traveler.style.top = target[1] + '%'; return;
    }
    // Follow the actual SVG path until the next waypoint, then settle beside its sign.
    const length = path.getTotalLength();
    let nearest = 0, best = Infinity;
    for (let t = 0; t <= length; t += 5) {
      const p = path.getPointAtLength(t), distance = (p.x / 11 - target[0]) ** 2 + (p.y / 7.2 - target[1]) ** 2;
      if (distance < best) { best = distance; nearest = t; }
    }
    const startLength = Number(traveler.dataset.pathLength || 0), endLength = nearest;
    const started = performance.now(), duration = Math.min(2400, Math.max(1100, Math.abs(endLength - startLength) * 2));
    traveler.classList.add('walking');
    function frame(now) {
      const t = Math.min(1, (now - started) / duration), smooth = t * t * (3 - 2 * t);
      const at = startLength + (endLength - startLength) * smooth, p = path.getPointAtLength(at);
      traveler.style.left = p.x / 11 + '%'; traveler.style.top = p.y / 7.2 + '%';
      if (t < 1) walkAnimation = requestAnimationFrame(frame);
      else { traveler.dataset.pathLength = endLength; traveler.style.left = target[0] + '%'; traveler.style.top = target[1] + '%'; traveler.classList.remove('walking'); }
    }
    walkAnimation = requestAnimationFrame(frame);
  }
  $('continue-btn').onclick = () => {
    if (!state) return openDialog('welcome-dialog');
    const id = G.current(state); if (id) launch(id); else downloadRecord();
  };
  function downloadRecord() {
    const text = [`모덕초 우리말 유람 완주 수첩`, `여행자: ${state.name}`, `완주한 관문: ${state.order.length}개`, '',
      ...state.order.map((id, i) => { const r = state.cleared[id]; return `${i + 1}. ${mission(id).title}: ${r.correct}/${r.total} 정답 (${formatAccuracy(r.accuracy)}%)`; }), '', '우리말을 아끼는 마음이 자라는 여행을 마쳤습니다.'].join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '우리말_유람_완주수첩.txt'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function launch(id) {
    if (!state.studentNameConfirmed) return openDialog('identity-dialog');
    const prior = state.active;
    if (prior && prior.status === 'playing' && prior.id !== id) {
      toast('진행 중인 관문을 먼저 마친 뒤 다른 관문을 복습해 주세요.'); return;
    }
    let active;
    try { active = G.begin(state, id); } catch (e) { toast(e.message); return; }
    save(); closing = false;
    $('mission-title').textContent = mission(id).title;
    $('mission-mode').textContent = active.mode === 'practice' ? '라이프 회복을 위한 복습' : active.mode === 'review' ? '통과한 관문 자유 복습' : `${state.order.indexOf(id) + 1}번째 관문 · 라이프 ${state.hearts}개`;
    $('mission-target').textContent = active.mode === 'practice' ? '85% 이상이면 라이프 회복' : '통과 기준 정답률 85%';
    $('result-panel').hidden = true; $('show-result').hidden = true;
    $('mission-loading').textContent = '미션을 준비하고 있어요…'; $('mission-loading').hidden = false;
    $('mission-frame').src = `missions/${mission(id).file}?journey=${encodeURIComponent(active.token)}&mission=${id}`;
    openDialog('mission-dialog');
    clearTimeout(readyTimer); readyTimer = setTimeout(() => {
      $('mission-loading').textContent = '미션을 불러오는 중이에요. 파일과 연결 상태를 확인해 주세요. 지도에 돌아온 뒤 이어 할 수 있어요.';
    }, 15000);
  }
  function send(type, extra = {}) {
    if (!state || !state.active) return;
    $('mission-frame').contentWindow.postMessage({ source: 'modeok-village', type, token: state.active.token, ...extra }, location.origin === 'null' ? '*' : location.origin);
  }
  function returnToMap() {
    if (closing) return;
    closing = true; send('save-now');
    setTimeout(() => {
      save(); $('mission-dialog').close(); $('mission-frame').src = 'about:blank';
      clearTimeout(readyTimer); render(); animateTraveler(true); closing = false;
    }, 160);
  }
  $('map-return').onclick = returnToMap; $('result-map').onclick = returnToMap;
  $('mission-dialog').addEventListener('cancel', event => { event.preventDefault(); returnToMap(); });
  function formatAccuracy(value) { return Number.isInteger(value) ? String(value) : (Math.floor(value * 10) / 10).toFixed(1); }
  function resultPanel(result) {
    const mode = result.mode, passed = result.passed;
    $('show-result').hidden = false; $('result-panel').hidden = false;
    $('result-kicker').textContent = mode === 'review' ? '이미 통과한 관문 · 자유 복습' : mode === 'practice' ? '마음 든든, 다시 준비하는 시간' : '우리말 여행 수첩에 기록했어요';
    $('result-emblem').textContent = passed ? mission(result.id).seal : '힘';
    $('result-title').textContent = mode === 'practice' ? (passed ? '라이프 3개를 회복했어요!' : '한 번 더 익혀 볼까요?') : mode === 'review' ? '복습을 마쳤어요!' : passed ? '다음 길이 열렸어요!' : '배움은 한 걸음씩!';
    $('result-detail').textContent = `${result.total}문제 중 ${result.correct}문제 정답 · 통과 기준 85%`;
    $('result-number').textContent = formatAccuracy(result.accuracy) + '%';
    $('result-message').textContent = mode === 'review' ? '복습은 도장과 라이프에 영향을 주지 않아요.' : mode === 'practice' ? (passed ? '이제 같은 관문에 정식 도전해 도장을 받아 보세요.' : '라이프는 더 줄지 않아요. 풀이를 살펴보고 다시 복습해요.') : passed ? (G.current(state) ? '여행 도장이 새겨졌어요. 다음 한옥으로 함께 가요.' : '모든 도장을 모았어요! 우리말 유람을 완주했어요.') : state.hearts > 0 ? `라이프가 1개 줄어 ${state.hearts}개 남았어요. 풀이를 살펴보고 다시 도전해요.` : '라이프를 모두 썼어요. 이 관문을 복습해 85% 이상을 얻으면 라이프 3개가 회복돼요.';
    $('result-next').textContent = mode === 'review' ? '지도로 돌아가기' : mode === 'practice' ? (passed ? '정식 도전하기' : '다시 복습하기') : passed ? (G.current(state) ? '다음 관문으로 가기' : '완주한 지도 보기') : state.hearts === 0 ? '라이프 회복 복습하기' : '이 관문 다시 도전';
    $('result-next').onclick = () => {
      if (mode === 'review' || (passed && mode === 'challenge')) returnToMap();
      else launch(result.id);
    };
  }
  $('review-answers').onclick = () => { $('result-panel').hidden = true; $('mission-frame').focus(); };
  $('show-result').onclick = () => { if (state.active && state.active.result) resultPanel(state.active.result); };
  window.addEventListener('message', event => {
    if (event.source !== $('mission-frame').contentWindow || event.origin !== location.origin) return;
    const data = event.data, active = state && state.active;
    if (!data || data.source !== 'modeok-mission' || !active || data.id !== active.id || data.token !== active.token || !$('mission-dialog').open) return;
    if (data.type === 'ready') {
      clearTimeout(readyTimer); $('mission-loading').hidden = true;
      send('init', { snapshot: active.snapshot, mode: active.mode, name: state.name });
    } else if (data.type === 'snapshot' && active.status === 'playing' && data.snapshot && typeof data.snapshot === 'object') {
      const size = JSON.stringify(data.snapshot).length;
      if (size < 450000) { active.snapshot = data.snapshot; save(); }
    } else if (data.type === 'result') {
      const result = G.accept(state, data);
      if (result) {
        if (result.mode === 'challenge') $('mission-mode').textContent = `${state.order.indexOf(result.id) + 1}번째 관문 · 라이프 ${state.hearts}개`;
        save(); scoreSync.enqueue(VillageScores.entry(state, result));
        scoreSync.flush(); render(); resultPanel(result);
      }
    } else if (data.type === 'practice-note') toast('틀린 문제 복습은 도장을 주지 않아요. 지도 화면에서 전체 미션에 다시 도전해요.');
  });
  // A second open tab must use the newest record, so an old tab cannot overwrite it.
  window.addEventListener('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    try {
      const next = JSON.parse(event.newValue);
      if (G.valid(next) && next.updatedAt > lastSave) {
        const sameAttempt = state && state.active && next.active && state.active.token === next.active.token && state.active.status === 'playing' && next.active.status === 'playing';
        if (sameAttempt) { state.active.snapshot = next.active.snapshot; state.updatedAt = next.updatedAt; lastSave = next.updatedAt; return; }
        state = next; lastSave = next.updatedAt;
        if ($('mission-dialog').open) { $('mission-dialog').close(); $('mission-frame').src = 'about:blank'; }
        render(); toast('다른 탭에서 저장한 최신 여행 기록을 불러왔어요.');
      }
    } catch (e) { /* Ignore unrelated or malformed storage events. */ }
  });
  window.addEventListener('pagehide', () => { send('save-now'); });
  render();
  if (!state) openDialog('welcome-dialog');
  else if (!state.studentNameConfirmed) openDialog('identity-dialog');
})();
