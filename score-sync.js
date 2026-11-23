(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VillageScores = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'modeok-score-outbox-v1';
  const endpointValid = value => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(value || '');
  function entry(state, result) {
    if (!state.studentNameConfirmed || !state.name.trim() || !state.journeyId || !result.attemptId) return null;
    return {
      version: 1, eventId: result.attemptId, journeyId: state.journeyId,
      attemptId: result.attemptId, studentName: state.name.trim(), missionId: result.id,
      correct: result.correct, total: result.total, mode: result.mode, completedAt: result.at,
      clearedCount: Object.keys(state.cleared).length, selectedCount: state.order.length,
      hearts: state.hearts, completed: !state.order.some(id => !state.cleared[id])
    };
  }
  function create(options) {
    const {storage, transport, onChange = () => {}, endpoint = ''} = options;
    let memory = [], persisted = true, busy = false, error = '', lastSaved = false;
    function read() {
      if (!persisted) return memory;
      try {
        const value = JSON.parse(storage.getItem(KEY) || '[]');
        if (!Array.isArray(value)) throw new Error('잘못된 기록');
        const items = value.filter(item => item && typeof item.eventId === 'string');
        memory = items;
      } catch (e) { persisted = false; }
      return memory;
    }
    function write(items) {
      memory = items;
      try { storage.setItem(KEY, JSON.stringify(items)); persisted = true; }
      catch (e) { persisted = false; }
    }
    function status() { return {configured: endpointValid(endpoint), pending: read().length, busy, persisted, error, lastSaved}; }
    function notify() { onChange(status()); }
    function enqueue(item) {
      if (!item) return;
      write([...new Map([...read(), item].map(value => [value.eventId, value])).values()]);
      error = ''; notify();
    }
    async function flush() {
      if (busy || !endpointValid(endpoint)) { notify(); return; }
      busy = true; error = ''; notify();
      try {
        while (read().length) {
          const item = read()[0];
          const ack = await transport(endpoint, item);
          if (!ack || ack.ok !== true || ack.eventId !== item.eventId) throw new Error('저장 확인을 받지 못했어요');
          // Refresh before removal so records queued by another tab are preserved.
          write(read().filter(value => value.eventId !== item.eventId));
          lastSaved = true; notify();
        }
      } catch (e) { error = '아직 선생님 기록장에 저장하지 못했어요'; }
      finally { busy = false; notify(); }
    }
    notify();
    return {enqueue, flush, status};
  }
  // A form POST works across origins without pretending an opaque fetch response
  // proves success. Only the Apps Script acknowledgement removes a queued result.
  function browserTransport(endpoint, item) {
    return new Promise((resolve, reject) => {
      const nonce = crypto.randomUUID(), frame = document.createElement('iframe'), form = document.createElement('form');
      frame.name = 'score-' + nonce; frame.hidden = true; frame.title = '점수 저장 확인';
      form.method = 'POST'; form.action = endpoint; form.target = frame.name; form.hidden = true;
      const input = document.createElement('input'); input.type = 'hidden'; input.name = 'payload';
      input.value = JSON.stringify({...item, nonce, origin: location.origin}); form.append(input);
      let timer;
      function finish(error, data) {
        clearTimeout(timer); window.removeEventListener('message', receive); form.remove(); frame.remove();
        if (error) reject(error); else resolve(data);
      }
      function receive(event) {
        if (!/^https:\/\/[\w-]+\.googleusercontent\.com$/.test(event.origin)) return;
        const data = event.data;
        if (!data || data.source !== 'modeok-score-receipt' || data.nonce !== nonce || data.eventId !== item.eventId) return;
        finish(data.ok ? null : new Error('저장 실패'), data);
      }
      window.addEventListener('message', receive);
      timer = setTimeout(() => finish(new Error('저장 확인 시간 초과')), 30000);
      document.body.append(frame, form);
      try { form.submit(); } catch (e) { finish(e); }
    });
  }
  return {entry, create, browserTransport, endpointValid};
});
