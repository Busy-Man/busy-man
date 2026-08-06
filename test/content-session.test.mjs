import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { prepareContentSession } from '../src/content-session.mjs';

const contentPath = new URL('../content/day1.json', import.meta.url);

function readContent() {
  return JSON.parse(readFileSync(contentPath, 'utf8'));
}

function seededRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

function withoutSession(content) {
  const { __bmSession, ...template } = content;
  return template;
}

test('세션은 어떤 시드에서도 20개 번들, 58개 메시지, 20개 퀴즈를 만든다', () => {
  for (const seed of [1, 9, 42, 2026]) {
    const content = readContent();
    const session = prepareContentSession(content, { rng: seededRng(seed) });

    assert.equal(session.bundles.length, 20);
    assert.equal(session.messages.length, 58);
    assert.equal(session.quizzes.length, 20);
  }
});

test('세션은 한 번 고른 번들을 중복하지 않는다', () => {
  const session = prepareContentSession(readContent(), { rng: seededRng(42) });

  assert.equal(new Set(session.bundles.map(bundle => bundle.id)).size, session.bundles.length);
});

test('다른 난수 시드는 번들 표시 순서를 다시 섞는다', () => {
  const first = prepareContentSession(readContent(), { rng: seededRng(1) });
  const second = prepareContentSession(readContent(), { rng: seededRng(9) });

  assert.notDeepEqual(first.bundleIds, second.bundleIds);
});

test('세션은 각 번들 안의 메시지 순서를 보존한다', () => {
  const content = readContent();
  const session = prepareContentSession(content, { rng: seededRng(77) });
  const positions = new Map(session.messages.map((message, index) => [message.id, index]));

  for (const bundle of session.bundles) {
    const templateBundle = content.bundles.find(candidate => candidate.id === bundle.id);
    const indices = templateBundle.messages.map(message => positions.get(message.id));
    assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  }
});

test('세션의 모든 퀴즈 근거 메시지는 세션에 정확히 한 번 존재한다', () => {
  const session = prepareContentSession(readContent(), { rng: seededRng(101) });
  const sourceCounts = new Map();
  for (const message of session.messages) {
    sourceCounts.set(message.id, (sourceCounts.get(message.id) ?? 0) + 1);
  }

  for (const quiz of session.quizzes) {
    assert.equal(sourceCounts.get(quiz.sourceMessageId), 1, quiz.id);
  }
});

test('세션 생성은 콘텐츠 템플릿을 바꾸지 않는다', () => {
  const content = readContent();
  const before = structuredClone(content);

  prepareContentSession(content, { rng: seededRng(3) });
  prepareContentSession(content, { force: true, rng: seededRng(4) });

  assert.deepEqual(withoutSession(content), before);
});

test('강제 재생성은 새 세션을 캐시한다', () => {
  const content = readContent();
  const first = prepareContentSession(content, { rng: seededRng(10) });
  const second = prepareContentSession(content, { force: true, rng: seededRng(11) });

  assert.notStrictEqual(second, first);
  assert.equal(content.__bmSession, second);
  assert.strictEqual(prepareContentSession(content), second);
  assert.notEqual(second.sessionId, first.sessionId);
});

test('강제 재생성이 아니면 캐시된 세션을 그대로 반환한다', () => {
  const content = readContent();
  const first = prepareContentSession(content, { rng: seededRng(10) });
  const second = prepareContentSession(content, { rng: seededRng(11) });

  assert.strictEqual(second, first);
});

test('동적 퀴즈의 정답 보기는 선택된 값의 근거 문장과 일치한다', () => {
  const content = readContent();
  const session = prepareContentSession(content, { rng: seededRng(19) });
  const messagesById = new Map(session.messages.map(message => [message.id, message]));

  for (const quiz of session.quizzes.filter(quiz => quiz.field)) {
    assert.equal(quiz.choices.length, 3, quiz.id);
    assert.equal(new Set(quiz.choices).size, 3, quiz.id);
    assert.ok(Number.isInteger(quiz.answer) && quiz.answer >= 0 && quiz.answer < 3, quiz.id);

    const answerChoice = quiz.choices[quiz.answer];
    const candidates = content.values[quiz.field].pool;
    const selected = candidates.find(candidate => candidate.choice === answerChoice);
    assert.ok(selected, `${quiz.id}의 정답이 ${quiz.field} 값 풀에 없음`);
    assert.ok(messagesById.get(quiz.sourceMessageId).text.includes(selected.message), quiz.id);
  }
});
