// content/day1.json의 번들/값 풀 계약 검사.
//
//   node dev/check-content.mjs

import { readFileSync } from 'node:fs';

const KINDS = new Set(['person', 'notice', 'map']);
const path = 'content/day1.json';
const fails = [];
const warn = [];

let content;
try {
  content = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  console.error(`FAIL: ${path} 파싱 실패 — ${error.message}`);
  process.exit(1);
}

function fail(message) {
  fails.push(message);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (!nonEmptyString(value)) continue;
    if (seen.has(value)) fail(`${label} 중복: ${value}`);
    seen.add(value);
  }
  return seen;
}

function tokens(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
}

if (!content.chrome || !nonEmptyString(content.chrome.clock) || !nonEmptyString(content.chrome.channel)) {
  fail('chrome.clock / chrome.channel 누락');
}
if (!Array.isArray(content.laneNames) || content.laneNames.length !== 3) fail('laneNames 는 3개여야 함');
if (!nonEmptyString(content.mapTemplate) || !content.mapTemplate.includes('{lane}')) fail('mapTemplate 에 {lane} 없음');
for (const key of ['correct', 'wrong', 'timeout', 'penaltySlow', 'penaltyGauge']) {
  if (!content.feedback || !nonEmptyString(content.feedback[key])) fail(`feedback.${key} 누락`);
}

if (!Array.isArray(content.bundles) || content.bundles.length !== 40) {
  fail(`bundles 는 정확히 40개여야 함 (현재 ${Array.isArray(content.bundles) ? content.bundles.length : '없음'})`);
}
if ('messages' in content || 'quizzes' in content) fail('평면 messages/quizzes 는 bundles 마이그레이션 후 남기면 안 됨');
if (!content.values || typeof content.values !== 'object' || Array.isArray(content.values)) fail('최상위 values 객체 누락');

const bundles = Array.isArray(content.bundles) ? content.bundles : [];
unique(bundles.map(bundle => bundle?.id), 'bundle id');

const allMessages = [];
const allQuizzes = [];
for (const [bundleIndex, bundle] of bundles.entries()) {
  const label = `bundles[${bundleIndex}]`;
  if (!bundle || typeof bundle !== 'object') {
    fail(`${label} 객체가 아님`);
    continue;
  }
  if (!nonEmptyString(bundle.id)) fail(`${label}.id 누락`);
  if (!Array.isArray(bundle.messages) || ![2, 3].includes(bundle.messages.length)) {
    fail(`${label}.messages 는 2개 또는 3개여야 함`);
  } else {
    bundle.messages.forEach((message, messageIndex) => {
      const messageLabel = `${label}.messages[${messageIndex}]`;
      if (!nonEmptyString(message?.id)) fail(`${messageLabel}.id 누락`);
      if (!KINDS.has(message?.kind)) fail(`${messageLabel}.kind 는 person|notice|map 이어야 함`);
      if (!nonEmptyString(message?.text)) fail(`${messageLabel}.text 비어 있음`);
      allMessages.push(message);
    });
  }
  if (!bundle.quiz || typeof bundle.quiz !== 'object' || Array.isArray(bundle.quiz)) {
    fail(`${label}.quiz 는 정확히 하나의 객체여야 함`);
  } else {
    allQuizzes.push({ ...bundle.quiz, __bundleIndex: bundleIndex });
  }
}

const twoMessageBundles = bundles.filter(bundle => bundle?.messages?.length === 2).length;
const threeMessageBundles = bundles.filter(bundle => bundle?.messages?.length === 3).length;
if (twoMessageBundles !== 4 || threeMessageBundles !== 36) {
  fail(`번들 길이 분포는 2문장 4개 + 3문장 36개여야 함 (현재 ${twoMessageBundles} + ${threeMessageBundles})`);
}
if (allMessages.length !== 116) fail(`전체 메시지는 116개여야 함 (현재 ${allMessages.length})`);
if (allQuizzes.length !== 40) fail(`전체 퀴즈는 40개여야 함 (현재 ${allQuizzes.length})`);

const messageIds = unique(allMessages.map(message => message?.id), 'message id');
unique(allQuizzes.map(quiz => quiz?.id), 'quiz id');
const dynamicQuizzes = allQuizzes.filter(quiz => nonEmptyString(quiz?.field));
const staticQuizzes = allQuizzes.filter(quiz => !nonEmptyString(quiz?.field));
if (dynamicQuizzes.length !== 39 || staticQuizzes.length !== 1) {
  fail(`퀴즈는 동적 39개 + 고정 1개여야 함 (현재 ${dynamicQuizzes.length} + ${staticQuizzes.length})`);
}

const definedTokens = new Set();
for (const quiz of dynamicQuizzes) {
  const label = `bundles[${quiz.__bundleIndex}].quiz`;
  if (!nonEmptyString(quiz.id)) fail(`${label}.id 누락`);
  if (!nonEmptyString(quiz.field)) fail(`${label}.field 누락`);
  if (!content.values?.[quiz.field]) fail(`${label}.field ${JSON.stringify(quiz.field)} 값 풀이 없음`);
  definedTokens.add(quiz.id);
  definedTokens.add(`${quiz.id}_alt1`);
  definedTokens.add(`${quiz.id}_alt2`);
}

for (const quiz of allQuizzes) {
  const label = `bundles[${quiz.__bundleIndex}].quiz`;
  if (!nonEmptyString(quiz.prompt)) fail(`${label}.prompt 비어 있음`);
  if (!nonEmptyString(quiz.sourceMessageId)) fail(`${label}.sourceMessageId 누락`);
  if ('sourceMessageIndex' in quiz) fail(`${label}.sourceMessageIndex 는 안정 ID로 교체해야 함`);
  if (!messageIds.has(quiz.sourceMessageId)) fail(`${label}.sourceMessageId 가 존재하지 않음: ${quiz.sourceMessageId}`);
  const source = bundles[quiz.__bundleIndex]?.messages?.find(message => message.id === quiz.sourceMessageId);
  if (!source) fail(`${label}.sourceMessageId 는 같은 번들 메시지를 가리켜야 함`);

  if (nonEmptyString(quiz.field)) {
    if (!source?.text.includes(`{${quiz.id}}`)) fail(`${label} 근거 메시지에 {${quiz.id}} 토큰이 없음`);
    if ('choices' in quiz || 'answer' in quiz) fail(`${label} 동적 퀴즈는 choices/answer를 템플릿에 두면 안 됨`);
  } else {
    if (!Array.isArray(quiz.choices) || quiz.choices.length !== 3) fail(`${label}.choices 는 3개여야 함`);
    if (!Number.isInteger(quiz.answer) || quiz.answer < 0 || quiz.answer > 2) fail(`${label}.answer 는 0~2 정수여야 함`);
    if (Array.isArray(quiz.choices) && new Set(quiz.choices).size !== quiz.choices.length) fail(`${label}.choices 에 중복이 있음`);
  }
}

for (const [field, valueSet] of Object.entries(content.values ?? {})) {
  if (!valueSet || !Array.isArray(valueSet.pool) || valueSet.pool.length < 3) {
    fail(`values.${field}.pool 은 정답 후보를 최소 3개 가져야 함`);
    continue;
  }
  valueSet.pool.forEach((candidate, index) => {
    const label = `values.${field}.pool[${index}]`;
    if (!nonEmptyString(candidate?.message) || !nonEmptyString(candidate?.choice)) fail(`${label}.message / choice 누락`);
    if (!Array.isArray(candidate?.alts) || candidate.alts.length !== 2) fail(`${label}.alts 는 정확히 2개여야 함`);
    const messages = [candidate?.message, ...(candidate?.alts ?? []).map(alt => alt?.message)];
    const choices = [candidate?.choice, ...(candidate?.alts ?? []).map(alt => alt?.choice)];
    if (messages.some(value => !nonEmptyString(value))) fail(`${label}.alts[*].message 누락`);
    if (choices.some(value => !nonEmptyString(value))) fail(`${label}.alts[*].choice 누락`);
    if (new Set(messages).size !== 3) fail(`${label} 메시지 정답/오답이 중복됨`);
    if (new Set(choices).size !== 3) fail(`${label} 보기 정답/오답이 중복됨`);
  });
}

for (const [index, message] of allMessages.entries()) {
  for (const token of tokens(message?.text ?? '')) {
    if (!definedTokens.has(token)) fail(`messages 전체[${index}]에 정의되지 않은 토큰 {${token}}`);
  }
}

// 값이 템플릿 문장에 리터럴로 남으면 세션마다 달라지지 않을 수 있다. 다만 서로 다른
// 미니 대화가 "10분 전"이나 "결제 모듈"처럼 같은 일반 표현을 쓸 수 있으므로, 이 검사는
// 저작 누락을 찾는 경고로만 남긴다. 정답 근거의 토큰 존재는 위에서 오류로 강제한다.
for (const [field, valueSet] of Object.entries(content.values ?? {})) {
  for (const candidate of valueSet?.pool ?? []) {
    for (const value of [candidate?.message, ...((candidate?.alts ?? []).map(alt => alt?.message))]) {
      if (!nonEmptyString(value)) continue;
      const residual = allMessages.some(message => message?.text.includes(value));
      if (!residual) continue;
      const note = `values.${field} 값 ${JSON.stringify(value)} 이 메시지 템플릿에 리터럴로 남아 있음`;
      warn.push(note);
    }
  }
}

if (fails.length) {
  console.error(`FAIL (${fails.length})`);
  fails.forEach(message => console.error(`  - ${message}`));
  process.exit(1);
}
warn.forEach(message => console.warn(`WARN: ${message}`));
console.log(`OK: bundles ${bundles.length}개 · messages ${allMessages.length}개 · quizzes ${allQuizzes.length}개 · 스키마 이상 없음`);
