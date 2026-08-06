import test from 'node:test';
import assert from 'node:assert/strict';

import { SOURCE_VISIBLE_SEC, advanceQuizSchedule, isSourceEligible } from '../src/quiz-eligibility.mjs';

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

test('조기 만료된 주기는 자격을 얻을 때까지 0에서 보류된다', () => {
  const shownAt = 10;
  const deferred = advanceQuizSchedule(0.05, 0.1, shownAt, 12);
  assert.deepEqual(deferred, { askLeft: 0, shouldOpen: false });

  const eligible = advanceQuizSchedule(deferred.askLeft, 0.1, shownAt, 13);
  assert.deepEqual(eligible, { askLeft: 0, shouldOpen: true });
});

test('활성 시간이 멈춰 있으면 모달 중 자격 시간이 소비되지 않는다', () => {
  const shownAt = 8;
  const beforePause = advanceQuizSchedule(0, 0, shownAt, 10.9);
  const afterPause = advanceQuizSchedule(beforePause.askLeft, 0, shownAt, 10.9);
  assert.equal(afterPause.shouldOpen, false);
});
