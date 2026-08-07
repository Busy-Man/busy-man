# main 최신화 + 재시작 버그 2건 수정

## Context

`feat/start-screen` 브랜치(이 worktree)는 옛 `main`(e7e9114, PR #18까지)에서 갈라져
지인 테스트용 시작 화면(`makeStartScreen`, `startGame()` 게이팅)을 `src/main.js`에
추가했다(커밋 `15bab51`). 그 사이 `origin/main`은 PR #19(pr19-merge-main)와 PR #20
(complex-quizzes)을 거치며 크게 앞서 나갔다 — 부스터 게이지(W), 제한시간 실패
(`timedOut`), R키 재시작 확인 모달, 좌상단 시간·부스터 게이지 바가 전부 이미
구현되어 있다.

사용자가 보고한 버그 2건을 조사한 결과:

1. **"재시작하면 퀴즈가 다시 안 뜬다"** — 이미 `origin/main`에 고쳐져 있다
   (커밋 `44c4e48`, `fix(main): 결과 화면 동안 퀴즈가 뜨지 않게 하고 재시작 시
   되살린다`). 원인은 `quiz.destroy()`가 `raf` 루프를 영구히 멈추는데
   `quiz.reset()`은 그걸 재가동하지 않는 것이었고, 고친 방법은 재시작 시
   `quiz.reset()` 대신 `quiz.destroy(); quiz = mountQuiz(...)`로 **인스턴스를
   통째로 새로 만드는 것**이다. `main`을 병합하면 자동으로 딸려온다. 이
   worktree의 현재 `restart()`는 옛 `quiz.reset()`을 그대로 쓰고 있어 병합 전
   상태로는 여전히 버그가 있다.
2. **"재시작해도 부스터 게이지가 안 비워진다"** — 아직 아무도 안 고쳤다.
   `state.gauge`(`src/state.js`)는 퀴즈 정답/오답으로 B(`quiz.js`)만 쓰기로
   되어 있고(AGENTS.md §2: `gauge B가 정답 +, 오답 랜덤 시 − → A가 W로 소비`),
   `world.js`의 부스트 소비 코드도, `world.reset()`도, `quiz.reset()`도
   재시작 시 `state.gauge`를 0으로 되돌리지 않는다. A(`main.js`)의 `restart()`
   가 명시적으로 `state.gauge = 0`을 써야 한다 — 이는 "W 소비 외에 쓰지
   않는다"는 §2 관례 밖의 새로운 쓰기이므로, 커밋 메시지에 그 사실과 이유를
   분명히 남겨 B가 나중에 `git log`로 알 수 있게 한다.

## 작업 순서

### 1. `origin/main`을 병합한다

```
git merge origin/main
```

병합 대상 커밋: `e7e91141` → `14ce0dc`(현재 fetch된 `origin/main`).
`git diff --stat`로 확인한 결과 이 구간에서 우리 쪽과 origin 양쪽이 함께 건드린
파일은 **`src/main.js`뿐**이다(`world.js` `quiz.js` `content-session.mjs`
`AGENTS.md` `docs/*` `assets/*` `vendor/*` `content/day1.json` 등은 우리가
손대지 않았으므로 자동 병합). 즉 충돌은 `src/main.js` 하나로 좁혀진다.

### 2. `src/main.js` 충돌을 수동으로 푼다

두 버전을 이미 전문 확보함(`git show origin/main:src/main.js` / 현재 워크트리
파일). 결과물은 **origin/main의 실제 구현을 그대로 두고, 그 위에 우리
`startGame()` 래핑 + `makeStartScreen()`만 다시 얹는 것**이다. 구체적으로:

- 파일 최상단 주석: origin 버전 + 우리가 붙였던 `+ 시작 화면` 문구 유지
- `const startScreen = makeStartScreen(startGame); document.body.appendChild(startScreen.el);`
  는 그대로 모듈 최상위에 남긴다
- `async function startGame() { startScreen.hide(); ... }` 안에 origin/main의
  본문을 **통째로** 넣는다 — `content` fetch, `phone`/`quiz`(`let`) 마운트,
  `world` 생성, `input`/`KEY_MAP`(`boost: false` / `w: "boost"` 포함),
  keydown/keyup 리스너(R 확인모달 분기, Space의 `!world.arrived` 가드
  포함), `resize` 리스너, `elapsed`/`clearTime`/`timedOut`/`confirmOpen`/
  `isPaused()`, `endGame()`, `restart()`, `timeBar`/`boostBar`/`result`/
  `restartConfirm` 생성과 `topLeft` DOM 조립, `loop()`(제한시간 실패 판정,
  `timeBar.set`/`boostBar.set` 포함), 마지막 `requestAnimationFrame(loop)`.
  들여쓰기만 한 단계 늘리면 되고 로직은 origin 그대로다.
- `restart()` 안에 버그 2 수정 라인을 추가한다:
  ```js
  function restart() {
    world.reset();
    phone.reset();
    quiz.destroy();
    quiz = mountQuiz(document.body, { content, state });
    // 부스터 게이지는 world.reset()도 quiz.destroy/mount도 건드리지 않는다 — 남겨두면
    // 이전 판 게이지를 들고 다음 판을 시작한다. AGENTS.md §2는 gauge 기록자를 B
    // 하나로 두지만, 재시작 초기화는 그 판정 밖의 별개 동작이라 여기서 0으로 둔다.
    state.gauge = 0;
    elapsed = 0;
    clearTime = null;
    timedOut = false;
    result.hide();
  }
  ```
- `startGame()` 바깥, 모듈 레벨에 남는 함수: `formatTime`, `makeTimeBar`,
  `makeBoostBar`, `makeResult`(origin의 `success` 파라미터 포함 버전),
  `makeRestartConfirm` — 전부 origin/main 버전 그대로.
- 파일 맨 끝의 `makeStartScreen()`은 우리 버전을 그대로 둔다(제목 "Busy Man",
  규칙 목록에 R/W/게이지 문구 이미 포함되어 있고 이제 전부 실제 동작과
  일치한다 — 수정 불필요).

### 3. 검증

- `node --check src/main.js`로 문법 확인
- `npx http-server . -p 8099 -c-1`로 띄운 뒤(이미 로컬에 한 번 띄워봤던 방식),
  가능하면 브라우저로 시작 화면 → 시작 → R 재시작 확인 모달 → 재시작 후
  부스터 게이지 바가 0으로 비는지 확인. 이번 세션에서 Chrome 확장이
  연결되지 않았으므로 안 되면 그 사실을 사용자에게 명시한다.

### 4. 커밋 2개

1. 병합 커밋 — `git merge origin/main`이 만든 병합 커밋에 `src/main.js`
   해결본을 올린다. 메시지는 기본 병합 메시지 그대로 둔다(squash/rebase
   금지, AGENTS.md §5).
2. 버그 수정 커밋 — `fix(main): 재시작 시 부스터 게이지 초기화`. 본문에 위
   "왜"(퀴즈 재시작 버그는 병합으로 이미 해결됨 / 게이지 초기화는 아직
   아무도 안 함 / AGENTS.md §2 관례 밖의 쓰기라는 점)를 한두 줄 + 리스트로
   적는다.

## 참고

- 퀴즈 재시작 버그는 별도 코드 수정이 필요 없다 — 병합 자체가 수정이다.
  커밋 2개 중 "버그 수정" 커밋 본문에 이 사실을 한 줄로 언급해 사용자가
  "왜 diff에 퀴즈 관련 줄이 없지"라고 헷갈리지 않게 한다.
- `src/quiz.js` `src/world.js` `content/*.json`은 이번 작업에서 전혀 건드리지
  않는다(B 소유 파일 / world.js는 A 소유지만 이번 변경 범위 밖).
