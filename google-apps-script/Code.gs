/** 이 프로젝트는 점수 기록용 스프레드시트에 연결하여 사용합니다. */
const SHEET_NAME = '점수 기록';
const PASS_PERCENT = 85;
const HEADERS = ['기록 시각', '학생 이름', '미션', '맞힌 문제', '전체 문제', '점수(100점)', '통과 여부', '활동 구분', '획득 도장', '선택 관문', '남은 라이프', '완주 여부', '풀이 시각', '여행 ID', '도전 ID', '기록 ID'];
const MISSIONS = {words:'소중한 우리말 첩', dialect:'사투리 오아시스 탐험', school:'우리말 한옥 서당', exam:'우리말 순화어 과거시험', initials:'초성별 고유어 퀴즈', master:'도전! 우리말 달인'};
const MODES = {challenge:'정식 도전', practice:'라이프 회복 복습', review:'자유 복습'};

function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('점수 기록 시트의 확장 프로그램 → Apps Script에서 설치해 주세요.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  verifyHeaders_(sheet);
  spreadsheet.setSpreadsheetTimeZone('Asia/Seoul');
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#eeeeee').setFontWeight('bold').setWrap(true);
  sheet.setColumnWidth(1, 160); sheet.setColumnWidth(2, 110); sheet.setColumnWidth(3, 220);
  sheet.setColumnWidths(4, 9, 100); sheet.setColumnWidth(13, 160); sheet.setColumnWidths(14, 3, 240);
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).createFilter();
  return '점수 기록 준비 완료';
}

function verifyHeaders_(sheet) {
  const actual = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (HEADERS.some((header, i) => actual[i] !== header)) throw new Error('점수 기록 시트의 열 제목을 확인해 주세요.');
}

function validate_(p) {
  const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9-]{8,100}$/.test(value);
  if (!p || p.version !== 1 || !identifier(p.eventId) || !identifier(p.journeyId) || !identifier(p.attemptId) || p.eventId !== p.attemptId || !identifier(p.nonce)) throw new Error('잘못된 기록');
  if (typeof p.studentName !== 'string' || !p.studentName.trim() || p.studentName.trim().length > 16 || /[\x00-\x1f\x7f]/.test(p.studentName)) throw new Error('이름 확인');
  if (!Object.prototype.hasOwnProperty.call(MISSIONS, p.missionId) || !Object.prototype.hasOwnProperty.call(MODES, p.mode)) throw new Error('미션 확인');
  if (![p.correct,p.total,p.clearedCount,p.selectedCount,p.hearts].every(Number.isInteger) || p.total < 10 || p.total > 200 || p.correct < 0 || p.correct > p.total || p.selectedCount < 1 || p.selectedCount > 6 || p.clearedCount < 0 || p.clearedCount > p.selectedCount || p.hearts < 0 || p.hearts > 3) throw new Error('점수 확인');
  if (typeof p.completed !== 'boolean' || p.completed !== (p.clearedCount === p.selectedCount) || !Number.isSafeInteger(p.completedAt) || p.completedAt < 1577836800000 || p.completedAt > Date.now() + 86400000) throw new Error('진행 기록 확인');
  if (!allowedOrigin_(p.origin)) throw new Error('게임 주소 확인');
}

function allowedOrigin_(origin) {
  return origin === 'https://junho1-commits.github.io' || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
}

function doPost(e) {
  let p = {}, ok = false;
  try {
    if (!e || !e.parameter || typeof e.parameter.payload !== 'string' || e.parameter.payload.length > 6000) throw new Error('잘못된 요청');
    p = JSON.parse(e.parameter.payload); validate_(p);
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
      if (!id) throw new Error('setup 실행 필요');
      const sheet = SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
      if (!sheet) throw new Error('기록장 없음');
      verifyHeaders_(sheet);
      const count = sheet.getLastRow() - 1;
      const duplicate = count > 0 && sheet.getRange(2, 16, count, 1).createTextFinder(p.eventId).matchEntireCell(true).useRegularExpression(false).findNext();
      if (!duplicate) {
        const passed = p.correct * 100 >= p.total * PASS_PERCENT;
        // Prefix formula-looking names so a name is always stored as plain text.
        const name = /^[=+\-@']/.test(p.studentName.trim()) ? "'" + p.studentName.trim() : p.studentName.trim();
        const row = [new Date(), name, MISSIONS[p.missionId], p.correct, p.total, Math.round(p.correct * 1000 / p.total) / 10,
          passed ? '통과' : '미통과', MODES[p.mode], p.clearedCount, p.selectedCount, p.hearts, p.completed ? '완주' : '진행 중', new Date(p.completedAt), p.journeyId, p.attemptId, p.eventId];
        const at = sheet.getLastRow() + 1;
        sheet.getRange(at, 1, 1, HEADERS.length).setValues([row]);
        sheet.getRange(at, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
        sheet.getRange(at, 6).setNumberFormat('0.0');
        sheet.getRange(at, 13).setNumberFormat('yyyy-mm-dd hh:mm:ss');
        SpreadsheetApp.flush();
      }
      ok = true;
    } finally { lock.releaseLock(); }
  } catch (error) { console.warn('점수 저장 실패: ' + error.message); }
  const receipt = {source:'modeok-score-receipt', ok:ok, eventId:p.eventId || '', nonce:p.nonce || ''};
  const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const target = allowedOrigin_(p.origin) ? p.origin : 'https://junho1-commits.github.io';
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>점수 기록 처리 완료</p><script>window.top.postMessage(' + safeJson(receipt) + ',' + safeJson(target) + ');</script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({service:'modeok-village-scores', version:2, passPercent:PASS_PERCENT, ready:!!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')})).setMimeType(ContentService.MimeType.JSON);
}
