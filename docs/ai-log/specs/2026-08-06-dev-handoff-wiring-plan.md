# dev/ 핸드오프 마무리 — main.js를 정식 phone.js/quiz.js/day1.json로 갈아끼우기

## Context

`dev/handoff-to-A.md`는 B가 A에게 남긴 8/5 배선 안내 문서다. 그 시점엔 `phone.js`/`quiz.js`가
빈 스텁이라 A는 B가 임시로 준 스냅숏(`src/phone-a.js`, `src/quiz-a.js`, `content/day1-a.json`,
전부 git에 올라간 적 없는 미추적 파일)을 참조해 `main.js`를 짰다. 그 흔적이 지금
`src/main.js`에 남아 있다 — "정식 이름은 아직 빈 스텁"이라는 주석과 함께 `-a` 파일들을 그대로
import하고 있다.

그런데 그 사이 B는 정식 파일들을 실제로 완성해 `main`에 병합했다(`82cd71b` 등). 지금 두 쌍은
서로 다른 방향으로 앞서 있다:

- **`quiz.js`(정식)가 `quiz-a.js`보다 앞선다.** `src/quiz-eligibility.mjs` + `phone.js`가 쏘는
  `bm:phone-timeline` 이벤트를 엮어 "근거 문자가 3초 이상 노출된 뒤에만 질문을 연다"는 게이팅을
  구현했고, `content/day1.json`의 `quizzes[].sourceMessageIndex`를 검증한다.
  `content/day1-a.json`은 이 필드가 없어 `dev/check-content.mjs` 스키마 검사를 통과하지 못한다.
- **`phone-a.js`(임시본)가 `phone.js`(정식)보다 앞선다.** `world.js`의 `onNavHint`는 지금
  `{kind:'turn'|'gate'|'construction'|'traffic', lane, door, ...}` 형태의 이벤트 객체를 보내는데,
  `phone.js`의 `pushMap(laneIndex)`은 여전히 정수 하나만 받는 옛 시그니처다. 이 상태로 그냥
  가져다 쓰면 매 안내마다 `Number.isInteger` 체크에 걸려 콘솔 에러만 찍히고 화면엔 아무것도 안
  뜬다. `phone-a.js`의 `pushMap(event)`는 이미 이 이벤트 모양에 맞게 `switch (event.kind)`로
  고쳐져 있다.

사용자가 확인해 준 범위: **`main.js` 배선을 정식 파일로 옮기고, `phone.js`의 `pushMap`
시그니처도 함께 맞춘다(`AGENTS.md` §1상 B 담당 파일이지만 이번엔 손대는 것으로 합의됨).
정리가 끝나면 미추적 스냅숏 3개(`content/day1-a.json`, `src/phone-a.js`, `src/quiz-a.js`)는
삭제한다.**

## 변경 사항

### 1. `src/phone.js` — `pushMap`을 이벤트 객체 기반으로 교체 (B 파일, 합의됨)

`pushMap(laneIndex)` 본문을 `phone-a.js`가 이미 구현해 둔 `pushMap(event)`의
`switch (event.kind)` 로직으로 바꾼다. **다른 부분(특히 `activeTime`/`renderedAt`/
`publishTimeline`, `quiz.js`가 의존하는 타임라인 발행)은 절대 건드리지 않는다** — 이게
`quiz.js`의 게이팅 기능을 살리는 유일한 연결고리다.

```js
function pushMap(event) {
  const names = content.laneNames;
  let text = "";
  switch (event.kind) {
    case "turn":
      text = `${names[event.lane] === "오른쪽" ? "우회전" : names[event.lane] === "왼쪽" ? "좌회전" : "직진"}`;
      break;
    case "gate":
      text = `${names[event.door]}`;
      break;
    case "construction":
      text = `주의! ${names[event.lane]} 공사 중`;
      break;
    case "traffic":
      text = `${names[event.lane]} 안전 차선을 이용하세요.`;
      break;
    default:
      return;
  }
  pushMessage({ from: null, kind: "map", text });
}
```

`world.js`에서 실제로 쏘는 이벤트 필드를 확인했다 — `turn`/`construction`/`traffic`은 `lane`을,
`gate`는 `door`를 갖고 있어 이 스위치와 맞는다(`src/world.js:556-560, 1090-1094, 1126-1130,
1848-1854`).

`pushMap` 위의 "TODO(합의 대기)" 주석(`src/phone.js:129-135`)은 "A와 합의하기 전까지 부르지
않는다"는 정책이었는데, `main.js`가 이미 `onNavHint: (event) => phone.pushMap(event)`로 부르고
있으므로(커밋 `613e373`) 이 조건은 이미 지난 일이다. 주석을 지우거나, 합의된 사실만 남기고
"부르지 않는다" 문구는 뗀다.

### 2. `src/main.js` — 정식 파일로 배선 교체 (A 파일)

```diff
- import { mountPhone } from "./phone-a.js";
- import { mountQuiz } from "./quiz-a.js";
+ import { mountPhone } from "./phone.js";
+ import { mountQuiz } from "./quiz.js";
  import { state } from "./state.js";

  const stage = document.getElementById("stage");

- // phone-a.js/quiz-a.js, content/day1-a.json은 B가 만든 실제 구현이다 — 정식
- // 이름(phone.js/quiz.js/day1.json)은 아직 주석뿐인 빈 스텁이라 그쪽을 부르면
- // 아무것도 못 뜬다. B가 정식 이름으로 옮기면 이 경로 세 곳만 고치면 된다.
- const content = await fetch("./content/day1-a.json").then((r) => r.json());
+ const content = await fetch("./content/day1.json").then((r) => r.json());
```

`onNavHint: (event) => phone.pushMap(event)` 배선은 그대로 둔다 — 이미 이벤트 객체를 넘기고
있고, phone.js가 이번에 그 모양을 받도록 바뀌므로 변경이 필요 없다.

### 3. 미추적 스냅숏 삭제

`content/day1-a.json`, `src/phone-a.js`, `src/quiz-a.js` 세 파일을 지운다. 전부 git 미추적
파일이라 삭제해도 커밋 기록에는 안 남는다.

## 검증

- 세 파일 모두 `node --check`로 문법 확인.
- `node dev/check-content.mjs`로 `content/day1.json`이 여전히 스키마를 통과하는지 재확인(이미
  통과하는 것은 확인했지만 회귀 확인 차원).
- `npx http-server . -p 8080 -c-1`로 띄우고 브라우저에서 실제로 열어(시크릿 창, `AGENTS.md`
  §6) 확인한다:
  - 콘솔에 `pushMap`/`mountPhone`/`mountQuiz` 관련 에러가 없는지
  - 갈림길·게이트·공사장·신호등을 지날 때 폰에 안내 문구가 실제로 뜨는지 (`turn`/`gate`/
    `construction`/`traffic` 네 종류 중 최소 두어 개는 실제 주행으로 확인)
  - 질문이 무작위 타이머가 아니라 근거 문자가 뜬 뒤 게이팅되어 열리는지(=`quiz.js`가 실제로
    쓰이고 있다는 증거)
- 확인 후 `git status`로 `-a` 파일들이 더 이상 나타나지 않는지 확인.
