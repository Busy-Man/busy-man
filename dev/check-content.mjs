// content/day1.json 스키마 검사. 임시 — 8/7 빌드 동결 전에 지운다.
//
// phone.js·quiz.js 도 mount 진입부에서 같은 것을 보지만 거기서는 console.error 로 흘릴 뿐
// 게임은 계속 돈다. 콘텐츠를 뽑고 나서 눈으로 58개를 세지 않으려고 여기서 한 번에 막는다.
//
//   node dev/check-content.mjs

import { readFileSync } from 'node:fs';

const KINDS = ['person', 'notice', 'map'];
const path = 'content/day1.json';
const fails = [];

let c;
try {
  c = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error('FAIL: ' + path + ' 파싱 실패 — ' + e.message);
  process.exit(1);
}

// 폰 크롬·길 안내 — 코드에 한국어를 안 박으려면 여기 있어야 한다
if (!c.chrome || !c.chrome.clock || !c.chrome.channel) fails.push('chrome.clock / chrome.channel 누락');
if (!Array.isArray(c.laneNames) || c.laneNames.length !== 3) fails.push('laneNames 는 3개여야 함');
if (typeof c.mapTemplate !== 'string' || !c.mapTemplate.includes('{lane}')) fails.push('mapTemplate 에 {lane} 없음');
// penaltySlow / penaltyGauge 는 8/5에 늘었다. 랜덤 패널티가 되살아나면서 어느 쪽이
// 걸렸는지 알릴 곳이 모달 글자뿐이 됐기 때문이다 (AGENTS.md §3, docs/ui-spec.md §판정).
['correct', 'wrong', 'timeout', 'penaltySlow', 'penaltyGauge'].forEach((k) => {
  if (!c.feedback || !c.feedback[k]) fails.push(`feedback.${k} 누락`);
});

// messages
if (!Array.isArray(c.messages) || c.messages.length === 0) {
  fails.push('messages 가 비어 있음');
} else {
  c.messages.forEach((m, i) => {
    if (!KINDS.includes(m.kind)) fails.push(`messages[${i}].kind = ${JSON.stringify(m.kind)} (person|notice|map)`);
    if (typeof m.text !== 'string' || !m.text) fails.push(`messages[${i}].text 비어 있음`);
  });
  // 스트림 2.6초 간격 × 스테이지 상한 150초 ≈ 58개. 모자라면 순환하는데,
  // 한 판에 같은 문자가 두 번 지나가면 8/8 촬영본에서 그대로 보인다 (content/README.md).
  if (c.messages.length < 58) fails.push(`messages 가 ${c.messages.length}개 — 순환 없이 한 판을 덮으려면 58개 필요`);
}

// quizzes
if (!Array.isArray(c.quizzes) || c.quizzes.length === 0) {
  fails.push('quizzes 가 비어 있음');
} else {
  c.quizzes.forEach((q, i) => {
    if (typeof q.prompt !== 'string' || !q.prompt) fails.push(`quizzes[${i}].prompt 비어 있음`);
    if (!Array.isArray(q.choices) || q.choices.length !== 3) fails.push(`quizzes[${i}].choices 가 3개가 아님`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 2) fails.push(`quizzes[${i}].answer = ${q.answer} (0~2)`);
    if (new Set(q.choices).size !== q.choices.length) fails.push(`quizzes[${i}].choices 에 같은 보기가 둘 있음`);
  });

  // 정답 위치는 검사하지 않는다. quiz.js 가 모달을 띄울 때마다 보기를 섞기 때문이다 —
  // JSON 쪽에서 흩어 놓는 방법도 있었지만 그건 한 판 안에서만 고르고 다시 하면 같은
  // 자리라 외우면 그만이다. 여기서는 보기를 자연스러운 순서(시각순·오름차순)로 둬서
  // 사람이 정답을 눈으로 검토할 수 있게 하는 편이 낫다.
}

if (fails.length) {
  console.error('FAIL (' + fails.length + ')');
  fails.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log(`OK: messages ${c.messages.length}개 · quizzes ${c.quizzes.length}개 · 스키마 이상 없음`);
