import test from 'node:test';
import assert from 'node:assert/strict';

import { SOURCE_VISIBLE_SEC, advanceAskTimer, isSourceEligible, selectEligibleQuiz } from '../src/quiz-eligibility.mjs';

test('근거 메시지가 없으면 퀴즈를 열지 않는다', () => {
  assert.equal(isSourceEligible(undefined, 100), false);
});

test('근거 메시지는 활성 시간 3초 뒤부터만 유효하다', () => {
  const shownAt = 12.4;
  assert.equal(isSourceEligible(shownAt, shownAt + SOURCE_VISIBLE_SEC - 0.001), false);
  assert.equal(isSourceEligible(shownAt, shownAt + SOURCE_VISIBLE_SEC), true);
});

test('무관한 메시지 시각은 근거 메시지의 대기 시간을 바꾸지 않는다', () => {
  const sourceShownAt = 4;
  const unrelatedShownAt = 6.6;
  assert.equal(isSourceEligible(sourceShownAt, unrelatedShownAt + 0.4), true);
});

test('끝난 질문 주기는 다음 근거가 자격을 얻을 때까지 0에서 보류된다', () => {
  assert.equal(advanceAskTimer(0.05, 0.1), 0);
  assert.equal(advanceAskTimer(0, 0.1), 0);
});

test('활성 시간이 멈춰 있으면 모달 중 자격 시간이 소비되지 않는다', () => {
  assert.equal(advanceAskTimer(2.5, 0), 2.5);
});

test('선택기는 근거가 3초 이상 보인 미출제 퀴즈만 고른다', () => {
  const quizzes = [
    { id: 'early', sourceMessageId: 'm-early' },
    { id: 'late', sourceMessageId: 'm-late' },
    { id: 'asked', sourceMessageId: 'm-asked' }
  ];
  const renderedAt = new Map([['m-early', 2], ['m-late', 8], ['m-asked', 1]]);

  const selected = selectEligibleQuiz(quizzes, renderedAt, new Set(['asked']), 6, () => 0);

  assert.equal(selected.id, 'early');
});

test('선택기는 자격을 얻은 미출제 문항이 없으면 null을 반환한다', () => {
  const quizzes = [{ id: 'not-yet', sourceMessageId: 'm-not-yet' }];
  const renderedAt = new Map([['m-not-yet', 5]]);

  assert.equal(selectEligibleQuiz(quizzes, renderedAt, new Set(), 7.9, () => 0), null);
});

test('선택기는 여러 자격 문항 중 RNG가 고른 문항을 반환한다', () => {
  const quizzes = [
    { id: 'first', sourceMessageId: 'm-1' },
    { id: 'second', sourceMessageId: 'm-2' }
  ];
  const renderedAt = new Map([['m-1', 1], ['m-2', 2]]);

  assert.equal(selectEligibleQuiz(quizzes, renderedAt, new Set(), 8, () => 0.99).id, 'second');
});
