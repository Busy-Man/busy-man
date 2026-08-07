import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { prepareContentSession } from '../src/content-session.mjs';

const contentPath = new URL('../content/day1.json', import.meta.url);

const COMPLEX_DIMENSIONS = new Map([
  ['q41', [['13일', '15일'], ['신규 시스템 교육', '계약 협의']]],
  ['q42', [['오후 2시', '오후 4시'], ['503호', '302호']]],
  ['q43', [['16일', '18일'], ['PDF', 'PPT']]],
  ['q44', [['운영 환경', '스테이징 환경'], ['v2.4.1', 'v2.4.3']]],
  ['q45', [['PAY-184', 'AUTH-207'], ['최 선임', '이 대리']]],
  ['q46', [['인증 서버', '결제 서버'], ['밤 11시', '새벽 1시']]],
  ['q47', [['한빛물산', '새봄전자'], ['4부', '2부']]],
  ['q48', [['14일', '16일'], ['B12', 'C08']]],
  ['q49', [['금요일', '월요일'], ['7층 교육장', '4층 세미나실']]],
  ['q50', [['오후 4시', '오후 5시'], ['견적 범위', '점검 일정']]]
]);

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

test('콘텐츠는 단순 40문항과 복합 10문항으로 구성된다', () => {
  const content = readContent();
  const complex = content.bundles.filter(bundle => bundle.quiz.difficulty === 'complex');

  assert.equal(content.bundles.length, 50);
  assert.equal(content.bundles.flatMap(bundle => bundle.messages).length, 146);
  assert.equal(complex.length, 10);
  assert.equal(content.bundles.length - complex.length, 40);
});

test('세션은 어떤 시드에서도 복합 4문항과 단순 16문항을 만든다', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const session = prepareContentSession(readContent(), { rng: seededRng(seed) });
    const complex = session.quizzes.filter(quiz => quiz.difficulty === 'complex');
    const simple = session.quizzes.filter(quiz => quiz.difficulty === 'simple');

    assert.equal(complex.length, 4, `seed ${seed}`);
    assert.equal(simple.length, 16, `seed ${seed}`);
    assert.ok(complex.every(quiz => quiz.choices.length === 4), `seed ${seed}`);
    assert.ok(simple.every(quiz => quiz.choices.length === 3), `seed ${seed}`);
  }
});

test('복합 문항 보기는 두 정보의 완전한 2×2 조합이다', () => {
  const content = readContent();
  const messagesById = new Map(
    content.bundles.flatMap(bundle => bundle.messages).map(message => [message.id, message])
  );

  for (const bundle of content.bundles.filter(bundle => bundle.quiz.difficulty === 'complex')) {
    const quiz = bundle.quiz;
    const dimensions = COMPLEX_DIMENSIONS.get(quiz.id);
    assert.ok(dimensions, `${quiz.id}의 검증 기준이 없습니다`);
    assert.equal(quiz.choices.length, 4, quiz.id);
    assert.equal(new Set(quiz.choices).size, 4, quiz.id);

    const combinations = new Set();
    for (const choice of quiz.choices) {
      const first = dimensions[0].filter(value => choice.includes(value));
      const second = dimensions[1].filter(value => choice.includes(value));
      assert.equal(first.length, 1, `${quiz.id}: ${choice}`);
      assert.equal(second.length, 1, `${quiz.id}: ${choice}`);
      combinations.add(first[0] + '|' + second[0]);
    }
    assert.equal(combinations.size, 4, quiz.id);

    const sourceText = messagesById.get(quiz.sourceMessageId).text;
    const answer = quiz.choices[quiz.answer];
    for (const dimension of dimensions) {
      const correctValue = dimension.find(value => answer.includes(value));
      assert.ok(sourceText.includes(correctValue), `${quiz.id}: ${correctValue}`);
    }
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
