(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VillageGame = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PASS_PERCENT = 85;
  const passes = (correct, total) => correct * 100 >= total * PASS_PERCENT;
  const MISSIONS = [
    { id: 'dialect', file: 'dialect.html', title: '사투리 오아시스 탐험', tag: '사투리 보물상자를 찾아요', seal: '벗', place: '이야기 주막' },
    { id: 'words', file: 'words.html', title: '소중한 우리말 첩', tag: '고유어의 뜻을 찾아요', seal: '말', place: '낱말 서원' },
    { id: 'school', file: 'school.html', title: '우리말 한옥 서당', tag: '외래어를 우리말로 바꿔요', seal: '글', place: '풍류 서당' },
    { id: 'exam', file: 'exam.html', title: '우리말 순화어 과거시험', tag: '바른 우리말로 장원급제!', seal: '빛', place: '장원 시험장' },
    { id: 'initials', file: 'initials.html', title: '초성별 고유어 퀴즈', tag: '초성 속 우리말을 찾아요', seal: '꿈', place: '초성 책방' },
    { id: 'master', file: 'master.html', title: '도전! 우리말 달인', tag: '우리말 실력을 완성해요', seal: '꽃', place: '달인 누각' }
  ];
  function shuffle(list, random = Math.random) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function token() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }
  function create(name, ids = MISSIONS.map(m => m.id)) {
    const selected = [...new Set(ids)].filter(id => MISSIONS.some(m => m.id === id));
    if (!selected.length) throw new Error('미션을 하나 이상 선택하세요.');
    const order = selected.includes('dialect') ? ['dialect', ...shuffle(selected.filter(id => id !== 'dialect'))] : shuffle(selected);
    return { version: 2, journeyId: token(), name: String(name || '우리말 여행자').trim().slice(0, 16), order, hearts: 3,
      cleared: {}, history: [], active: null, createdAt: Date.now(), updatedAt: Date.now() };
  }
  function current(state) { return state.order.find(id => !state.cleared[id]) || null; }
  function begin(state, id) {
    if (!state.order.includes(id) || (!state.cleared[id] && current(state) !== id)) throw new Error('앞 미션을 먼저 통과하세요.');
    if (state.active && state.active.id === id && state.active.status === 'playing') return state.active;
    state.active = { id, token: token(), status: 'playing', snapshot: null,
      mode: state.cleared[id] ? 'review' : (state.hearts === 0 ? 'practice' : 'challenge') };
    return state.active;
  }
  function accept(state, payload) {
    const active = state.active;
    if (!active || active.status !== 'playing' || active.token !== payload.token || active.id !== payload.id) return null;
    const { correct, total, answered } = payload;
    if (![correct, total, answered].every(Number.isInteger) || total < 10 || total > 200 || correct < 0 || correct > total || answered !== total) return null;
    if (active.mode !== 'review' && current(state) !== active.id) return null;
    const passed = passes(correct, total);
    const result = { id: active.id, attemptId: active.token, correct, total, passed, accuracy: correct * 100 / total, mode: active.mode, at: Date.now() };
    if (active.mode === 'challenge') {
      if (passed) state.cleared[active.id] = result;
      else state.hearts = Math.max(0, state.hearts - 1);
    } else if (active.mode === 'practice' && passed) state.hearts = 3;
    active.status = 'result'; active.result = result; active.snapshot = null;
    state.history.push(result);
    state.history = state.history.slice(-150);
    return result;
  }
  function valid(state) {
    if (!state || state.version !== 2 || typeof state.name !== 'string' || !Array.isArray(state.order) || !state.order.length || state.order.length > 6) return false;
    if (new Set(state.order).size !== state.order.length || !state.order.every(id => MISSIONS.some(m => m.id === id))) return false;
    if (!Number.isInteger(state.hearts) || state.hearts < 0 || state.hearts > 3 || !state.cleared || !Array.isArray(state.history)) return false;
    let gap = false;
    for (const id of state.order) {
      if (!state.cleared[id]) gap = true;
      else if (gap || !Number.isInteger(state.cleared[id].correct) || !Number.isInteger(state.cleared[id].total) || state.cleared[id].total < 10 || state.cleared[id].correct > state.cleared[id].total || !passes(state.cleared[id].correct, state.cleared[id].total)) return false;
    }
    if (state.active && (!state.order.includes(state.active.id) || typeof state.active.token !== 'string' || !['playing', 'result'].includes(state.active.status) || !['challenge', 'review', 'practice'].includes(state.active.mode))) return false;
    return true;
  }
  return { MISSIONS, PASS_PERCENT, passes, shuffle, create, current, begin, accept, valid };
});
