/* Rebuild integrated copies. The six files in the parent directory are never changed. */
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const specs = [
  { source: '6_4 (1).html', target: 'words.html', patches: [
    ['function showQuizResult() {', 'function showQuizResult() {\n            window.VillageBridge?.report(quizScore, quizQuestions.length, quizHistory.length);'],
    ['function startQuiz(count, customList = null) {', 'function startQuiz(count, customList = null) {\n            window.VillageBridge?.review(!!customList);']
  ] },
  { source: 'code_artifact (1).html', target: 'dialect.html', patches: [
    ['function endGame() {', 'function endGame() {\n            window.VillageBridge?.report(score, totalQuestions, items.filter(item => !item.active).length);']
  ] },
  { source: 'code_artifact (6) (1).html', target: 'school.html', patches: [
    ['function showResults() {', 'function showResults() {\n      window.VillageBridge?.report(correctCount, totalQuestionsCount, correctCount + wrongAnswers.length);']
  ] },
  { source: 'code_artifact (6).html', target: 'exam.html', patches: [
    ["const score = Math.round((correctCount / total) * 100);", "const score = Math.round((correctCount / total) * 100);\n      window.VillageBridge?.report(correctCount, total, state.userAnswers.length, state.isRetryMode);"]
  ] },
  { source: 'code_artifact (9).html', target: 'initials.html', patches: [
    ['function showResults() {', 'function showResults() {\n            window.VillageBridge?.report(score, quizData.length, userHistory.length);']
  ] },
  { source: 'code_artifact (10).html', target: 'master.html', patches: [
    ['function showResult() {', 'function showResult() {\n            window.VillageBridge?.report(score, quizData.length, currentQuestionIndex);'],
    ['// shuffleArray(quizData);', 'shuffleArray(quizData);']
  ] }
];
const vendor = {
  'https://cdn.tailwindcss.com': '../vendor/tailwind.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js': '../vendor/confetti.js',
  'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js': '../vendor/tone.js'
};
for (const spec of specs) {
  let html = fs.readFileSync(path.join(root, '..', spec.source), 'utf8');
  for (const [before, after] of spec.patches) {
    if (!html.includes(before) || html.indexOf(before) !== html.lastIndexOf(before)) throw new Error('Ambiguous patch: ' + spec.target + ': ' + before);
    html = html.replace(before, after);
  }
  for (const [url, local] of Object.entries(vendor)) html = html.replaceAll(url, local);
  // Avoid remote font requests; the originals retain their Korean system-font fallbacks.
  html = html.replace(/<link\b[^>]*href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi, '');
  html = html.replace(/@import url\(['"]https:\/\/fonts\.googleapis\.com[^;]*;/g, '');
  html = html.replace(/url\(['"]https:\/\/cdn\.jsdelivr\.net\/gh\/projectnoonnu\/[^)]+\)/g, 'local("Malgun Gothic")');
  html = html.replace('</head>', '<style>.hidden{display:none!important}button:focus-visible{outline:3px solid #b77142;outline-offset:3px}</style>\n</head>');
  html = html.replace('</body>', '<script src="../mission-bridge.js"></script>\n</body>');
  fs.writeFileSync(path.join(root, 'missions', spec.target), html);
  console.log('Integrated: ' + spec.target);
}
