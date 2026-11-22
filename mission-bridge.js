/* Shared adapter for the six original learning activities. Scores stay in the originals. */
(() => {
  'use strict';
  const query = new URLSearchParams(location.search), id = query.get('mission'), token = query.get('journey');
  if (!id || !token || parent === window) return;
  const target = location.origin === 'null' ? '*' : location.origin;
  let initialized = false, sent = false, lastSnapshot = '', reviewOnly = false;
  const post = (type, extra = {}) => parent.postMessage({ source: 'modeok-mission', type, id, token, ...extra }, target);
  const show = name => document.getElementById(name).classList.remove('hidden');
  const hide = name => document.getElementById(name).classList.add('hidden');
  const adapters = {
    words: {
      get() {
        if (!quizQuestions.length || reviewOnly) return null;
        return { questions: quizQuestions, index: quizHistory.length, score: quizScore, history: quizHistory };
      },
      restore(s) {
        quizQuestions = s.questions; quizHistory = s.history; quizScore = s.score; currentQuizIdx = s.index;
        if (currentQuizIdx >= quizQuestions.length) showQuizResult();
        else { switchView('view-quiz'); renderCurrentQuestion(); }
      }
    },
    dialect: {
      get() {
        if (gameState === 'start' || (gameState === 'quiz' && isAnswering)) return null;
        return { maze, items, player, animals, score, selectedQuestions, totalQuestions, wrongAnswers, elapsed: Date.now() - startTime,
          quizIndex: gameState === 'quiz' ? items.indexOf(currentQuiz) : -1 };
      },
      restore(s) {
        maze = s.maze; items = s.items; player = s.player; animals = s.animals; score = s.score; selectedQuestions = s.selectedQuestions;
        totalQuestions = s.totalQuestions; wrongAnswers = s.wrongAnswers; startTime = Date.now() - s.elapsed;
        hide('start-screen'); show('hud'); updateHud();
        keys = { w: false, a: false, s: false, d: false }; isAnswering = false; gameState = 'playing';
        if (!items.some(item => item.active)) endGame();
        else if (s.quizIndex >= 0 && items[s.quizIndex].active) openQuiz(items[s.quizIndex]);
        else requestAnimationFrame(gameLoop);
      }
    },
    school: {
      get() {
        if (!currentQuestions.length) return null;
        return { questions: currentQuestions, index: currentIndex + (isAnswered ? 1 : 0), score, combo, wrongStreak, maxCombo,
          correctCount, wrongAnswers, totalQuestionsCount, difficultyMode };
      },
      restore(s) {
        currentQuestions = s.questions; currentIndex = s.index; score = s.score; combo = s.combo; wrongStreak = s.wrongStreak; maxCombo = s.maxCombo;
        correctCount = s.correctCount; wrongAnswers = s.wrongAnswers; totalQuestionsCount = s.totalQuestionsCount; difficultyMode = s.difficultyMode;
        hide('start-screen');
        if (currentIndex >= totalQuestionsCount) showResults();
        else { show('quiz-screen'); renderQuestion(); }
      }
    },
    exam: {
      get() { return state.screen === 'start' || state.isRetryMode ? null : { state }; },
      restore(s) { state = s.state; render(); }
    },
    initials: {
      get() { return document.getElementById('start-screen').classList.contains('hidden') ? { index: userHistory.length, score, history: userHistory } : null; },
      restore(s) {
        currentIdx = s.index; score = s.score; userHistory = s.history; hide('start-screen');
        if (currentIdx >= quizData.length) showResults(); else { show('quiz-screen'); renderQuestion(); }
      }
    },
    master: {
      get() {
        return startScreen.classList.contains('hidden') ? { index: currentQuestionIndex + (isAnswering && currentQuestionIndex < quizData.length ? 1 : 0), score, questions: quizData } : null;
      },
      restore(s) {
        quizData.splice(0, quizData.length, ...s.questions); currentQuestionIndex = s.index; score = s.score;
        hide('start-screen'); updateScoreDisplay();
        if (currentQuestionIndex >= quizData.length) showResult();
        else { show('quiz-screen'); quizScreen.classList.add('flex'); loadQuestion(); }
      }
    }
  };
  function snapshot() {
    if (!initialized || sent || !adapters[id]) return;
    try {
      const s = adapters[id].get(); if (!s) return;
      const next = JSON.stringify(s);
      if (next !== lastSnapshot) { lastSnapshot = next; post('snapshot', { snapshot: JSON.parse(next) }); }
    } catch (error) { console.error('여행 중간 기록 저장 오류', error); }
  }
  window.VillageBridge = {
    review(value) { reviewOnly = value; },
    report(correct, total, answered, isReview = false) {
      if (!initialized || sent) return;
      if (reviewOnly || isReview) { post('practice-note'); return; }
      if (![correct, total, answered].every(Number.isInteger) || total < 10 || answered !== total) return;
      sent = true;
      post('result', { correct, total, answered });
      const note = document.createElement('div');
      note.textContent = '여행 지도에 결과를 기록했어요. 다음 도전은 위쪽의 지도 버튼에서 선택하세요.';
      note.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);background:#244b43;color:#fff9e8;z-index:99999;border-radius:8px;padding:10px 18px;font:13px sans-serif;max-width:90%;text-align:center;pointer-events:none;box-shadow:0 4px 15px #0002';
      document.body.appendChild(note); setTimeout(() => note.remove(), 7000);
    }
  };
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin || !event.data || event.data.source !== 'modeok-village' || event.data.token !== token) return;
    if (event.data.type === 'init' && !initialized) {
      initialized = true;
      try { if (event.data.snapshot) adapters[id].restore(event.data.snapshot); }
      catch (error) { console.error('중간 풀이 복원 오류', error); post('snapshot', { snapshot: null }); }
      // Fill the nickname used by the original desert game.
      if (id === 'dialect') document.getElementById('nickname').value = String(event.data.name || '여행자');
    } else if (event.data.type === 'save-now') snapshot();
  });
  document.addEventListener('click', () => setTimeout(snapshot, 0), true);
  document.addEventListener('change', () => setTimeout(snapshot, 0), true);
  setInterval(snapshot, 1200);
  window.addEventListener('pagehide', snapshot);
  // Same-origin direct checkpoint on page teardown: postMessage may be discarded as the frame unloads.
  window.addEventListener('pagehide', () => {
    if (sent || !initialized) return;
    try {
      const s = adapters[id].get(); if (!s) return;
      const raw = localStorage.getItem('modeok-hanok-journey-v2'), journey = JSON.parse(raw);
      if (journey && journey.active && journey.active.token === token && journey.active.status === 'playing') {
        journey.active.snapshot = s; journey.updatedAt = Date.now(); localStorage.setItem('modeok-hanok-journey-v2', JSON.stringify(journey));
      }
    } catch (e) { /* The parent displays storage errors; never block leaving the page. */ }
  });
  post('ready');
})();
