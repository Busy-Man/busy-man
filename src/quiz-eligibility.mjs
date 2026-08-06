// 퀴즈가 근거 문자를 본 뒤에만 열리게 하는 순수 판정.
// DOM·rAF와 분리해 두면 활성 시간 경계는 브라우저 없이도 검증할 수 있다.

export const SOURCE_VISIBLE_SEC = 3;

export function isSourceEligible(sourceShownAt, activeTime) {
  return Number.isFinite(sourceShownAt) && activeTime - sourceShownAt >= SOURCE_VISIBLE_SEC;
}

export function advanceQuizSchedule(askLeft, dt, sourceShownAt, activeTime) {
  const nextAskLeft = Math.max(0, askLeft - dt);
  return {
    askLeft: nextAskLeft,
    shouldOpen: nextAskLeft === 0 && isSourceEligible(sourceShownAt, activeTime)
  };
}
