# Deep Interview Spec: 스태시 복원 + 8/5 기획 동기화 + 나머지 구현

## Metadata
- Interview ID: di-busyman-20260805
- Rounds: 5 (+ Round 0 토폴로지 게이트)
- Final Ambiguity Score: 14%
- Type: brownfield
- Generated: 2026-08-05
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.88 | 0.35 | 0.308 |
| Constraint Clarity | 0.85 | 0.25 | 0.2125 |
| Success Criteria | 0.85 | 0.25 | 0.2125 |
| Context Clarity | 0.85 | 0.15 | 0.1275 |
| **Total Clarity** | | | **0.8605** |
| **Ambiguity** | | | **0.1395** |

## Topology

| Component | Status | Description | Coverage / Deferral Note |
|---|---|---|---|
| `restore-strategy` | active | 스태시를 어느 브랜치에 어떻게 되살릴지 | `feat/phone-quiz`를 `git rebase main`(고유 커밋 0개 → fast-forward)으로 따라잡고 `stash pop`. PR 1개 |
| `quiz-sync` | active | `src/quiz.js`를 8/5 기획·`ui-spec.md`에 맞춤 | 10초, 랜덤 패널티, 클릭 전용, 폰 형태 재구현 |
| `phone-sync` | active | `src/phone.js`를 8/5 기획에 맞춤 | 알림 색 랜덤, `pauseOnQuiz=true` 고정, 길안내 주석 |
| `content-day1` | active | `content/day1.json` 실콘텐츠 | 문자 ~58개, 질문 20문항 |
| `dev-harness` | active | `dev/` 검증 하네스 | 새 기획 반영 + 실물 `state.js` 배선 + 커밋 |
| `navigation-ownership` | **deferred** | 길 안내를 A/B 중 누가 갖는가 | `AGENTS.md` §3 **열림** — A와 합의 전 코드 금지. 사용자 확인 2026-08-05. 기존 코드는 유지하고 주석에 합의 대기 TODO를 남긴다 |

## Goal

2026-08-04 22:34에 스태시된 `phone.js`·`quiz.js`·`content/` 작업을 `feat/phone-quiz`에
되살리고, 스태시 이후 main에 들어온 8/5 기획 변경(`fbd518b` `31105f6` `1e129fe` `79de839`)에
맞춰 동기화한 뒤, `docs/ui-spec.md`가 요구하는 폰 형태 모달로 `quiz.js`를 재구현하고
`content/day1.json`을 실제 분량으로 채워 PR 1개로 낸다. 검증은 갱신한 `dev/harness.html`로 한다.

## Constraints

- **파일 소유권** (`AGENTS.md` §1) — B는 `src/phone.js` `src/quiz.js` `content/*.json`만 고친다.
  `src/main.js` `src/world.js` `index.html`은 A 소유이므로 건드리지 않는다
- **접점 4개** (`AGENTS.md` §2) — `speedMul` `gauge` `quizOpen` `onGate`/`fireGate`.
  다섯 번째를 만들지 않는다. `src/state.js`는 이미 실물로 구현돼 있고(`746d5eb`) 고칠 이유가 없다
- **`gauge` 기록자는 B 하나** — 정답 +, 오답·타임아웃 −. A는 Shift 소비만 한다
- **`speedMul`은 퀴즈 패널티 전용** — 보행자 충돌 감속을 여기 쓰지 않는다
- **번들러·프레임워크 없음.** HTML + ES 모듈. CDN 금지, 상대경로(`./`)만
- **브랜치 규칙 예외 승인** — `AGENTS.md` §5는 rebase를 금지하지만, `feat/phone-quiz`는
  고유 커밋이 0개이고 main보다 15 뒤이므로 `git rebase main`은 fast-forward다.
  갈아끼울 해시가 없어 §5가 지키려는 것(`docs/ai-log/raw/`의 해시 인용)이 발생하지 않는다.
  사용자가 근거와 함께 명시적으로 승인했다 (2026-08-05)
- **밸런싱 수치는 잠정** (`AGENTS.md` §3) — 랜덤 비율 `r`, 게이지 감소량, 감속량·지속시간은
  정해진 적이 없다. `TUNING` 블록에 플레이스홀더로 두고 8/6에 만진다 (`docs/balance-todo.md`)
- **커밋 규약** (`AGENTS.md` §5) — `type(scope): 요약`, 본문은 "왜"만, 개요 + 리스트.
  scope는 `phone` `quiz` `content` `docs`. 인용은 첫 등장 시 파일명 병기

## Non-Goals

- **길 안내 소유권 합의** — 보류. 기존 `pushMap`/`laneNames`/`mapTemplate`/`kind:'map'` 코드는
  **그대로 두고 주석에 합의 대기 TODO만 명시**한다. A가 부르기 전까지 아무 일도 일어나지 않는다
- **룰렛·카드 뽑기 연출** — 에셋 0. 모달에 어느 패널티가 걸렸는지 **결과만 적는다**
- **스크랩** — 이번 스코프에서 뺐다 (보류, 폐기 아님)
- **`main.js`에서의 실제 배선** — A 소유 파일. 하네스로 대신 검증하고 `dev/handoff-to-A.md`를 갱신한다
- **인플레이 질문 랜덤 추출** — 최종 방향이지만 풀이 커진 뒤의 일. 지금은 풀 20개 ≈ 한 판 분량이라
  순차 소비로 충분하다. 방향만 주석에 남긴다
- **PR 병합** — PR 생성까지가 범위

## 스태시와 8/5 기획의 어긋난 지점 (전수)

| # | 항목 | 정본 | 스태시 현재 | 근거 |
|---|---|---|---|---|
| 1 | 카운트다운 | **10초** | 6초 | `AGENTS.md` §3 확정 |
| 2 | 오답·타임아웃 패널티 | **감속 / 게이지 감소 2종 랜덤** | 감속 고정 | `AGENTS.md` §3 잠정 |
| 3 | `gauge` 방향 | 정답 +, 오답·타임아웃 − | *"오답 시 게이지는 건드리지 않는다"* 주석 명시 | `src/state.js:30-42` |
| 4 | 답안 입력 | **마우스 클릭만** | 클릭 + 숫자키 1/2/3 | `docs/ui-spec.md` §입력 |
| 5 | 모달 형태 | **폰 모양** (상태바+시계 / 수신 말풍선 / 장식 입력란+↵ / 보기 3개) | 평범한 흰 카드 | `docs/ui-spec.md` §구성 |
| 6 | 모달 등장 | **화면 바깥에서 위로 올라옴** | 없음 (중앙 고정) | `docs/ui-spec.md` §등장 |
| 7 | 알림 색 | **랜덤** — 사람과 같기도 다르기도 | `.bm-notice` 고정색 | `docs/ui-spec.md` §대화 스트림 폰 |
| 8 | 모달 중 스트림 | **멈춘다** (`pauseOnQuiz=true` 고정) | 미결 (옵션으로 열어 둠) | 사용자 결정 2026-08-05 |
| 9 | 스테이지 길이 | 90~150초 (잠정) | `content/README.md`가 "90초인지 35초인지 A에게 확인" | `AGENTS.md` §3 |
| 10 | `content/README.md` 주석 | main이 이미 A/B 뒤집힘을 고침(`e7ed1ee`) | *"같은 뒤집힘이 `AGENTS.md` §2·§3에도 남아 있다"* — stale | `git log` |
| 11 | `quiz.js` 헤더 | main이 이미 갱신(`1a87300`) | 옛 헤더 | **`stash pop` 충돌 지점** |

## Acceptance Criteria

### restore-strategy
- [ ] `git switch feat/phone-quiz && git rebase main` — fast-forward로 15 커밋 따라잡음
- [ ] `git stash pop` 후 `quiz.js` 충돌을 **main 헤더 유지 + 스태시 본문** 으로 해소
- [ ] `git status`에 `src/main.js` `src/world.js` `index.html` `src/state.js`가 **나타나지 않는다**
      (소유권 경계 침범 없음 — `AGENTS.md` §1)
- [ ] 커밋이 응집도 단위로 나뉘고 메시지가 §5 형식(`type(scope): 요약` + 왜 + 리스트)을 따른다

### quiz-sync
- [ ] `TUNING.countdownSec === 10`
- [ ] 오답·타임아웃이 **감속 / 게이지 감소 중 하나를 랜덤으로** 뽑는다. 비율 `r`은 `TUNING`에
      플레이스홀더(0.5)로 있고 8/6 대상임이 주석에 적혀 있다
- [ ] 게이지 감소가 `state.gauge`를 낮춘다. **게이지 0에서 하한을 막지 않는다** —
      알고 받아들인 구멍이다 (`src/state.js:36`, `docs/balance-todo.md` §1)
- [ ] 숫자키 `1/2/3` 핸들러가 **제거**됐다. `keydown` 리스너가 없다
- [ ] 모달이 `ui-spec.md`의 폰 구성을 갖는다 — 상태바(시계 + 카운트다운 배지),
      수신 말풍선 질문, 장식 입력란 + 엔터 화살표, 보기 3개
- [ ] 모달이 **화면 아래에서 위로 올라온다** (페이드인 아님)
- [ ] 판정 후 어느 패널티가 걸렸는지 모달에 텍스트로 표시된다
- [ ] `content/*.json` 밖의 문자열 리터럴이 UI에 노출되지 않는다

### phone-sync
- [ ] `pauseOnQuiz`가 `true`로 고정됐다 (옵션 분기 제거 또는 기본값 확정)
- [ ] 알림(`kind:'notice'`)의 색이 **문자마다 랜덤**으로 사람 색과 같기도/다르기도 하다
- [ ] `pushMap`·`kind:'map'` 코드는 남아 있고, 그 위에 합의 대기 TODO 주석이 있다 —
      `AGENTS.md` §3 열림 항목이며 A가 부르기 전까지 발화하지 않음을 적는다
- [ ] `src/state.js`를 import하지 않고 주입받는 구조가 유지된다

### content-day1
- [ ] `messages`가 **~58개** — 스트림 2.6초 간격 × 스테이지 상한 150초 기준.
      순환(`idx % length`) 없이 한 판을 덮는다
- [ ] `quizzes`가 **20문항**. 각 문항이 `messages`에 실제로 나온 사실을 묻는다
- [ ] 모든 `quizzes[i].choices.length === 3`, `answer`가 0..2 범위
- [ ] 모든 `messages[i].kind`가 `person|notice|map` 중 하나
- [ ] `content/README.md`의 stale한 서술 갱신 — ①"AGENTS.md §2·§3에도 뒤집힘이 남아 있다"는
      `e7ed1ee`로 해소됨 ②런 길이 미확인 → 90~150초 ③카운트다운 6→10 ④`pauseOnQuiz` 확정

### dev-harness
- [ ] `dev/harness.html`이 더미 `state`·`onGate` 대신 **실물 `src/state.js`** 를 import한다
- [ ] 하네스가 10초 카운트다운, 랜덤 패널티 결과 표시, 폰 형태 모달, 알림 색 랜덤을
      눈으로 확인할 수 있게 한다
- [ ] `dev/check-content.mjs`가 `day1.json`의 스키마·`answer` 범위·보기 3개를 검사하고 통과한다
- [ ] `dev/handoff-to-A.md`가 갱신됐다 — 특히 *"오답에 게이지를 깎지 않는다"* 항목은
      8/5 기획으로 **뒤집혔으므로** 반드시 고친다. `state.js` 배선 요청도 이미 해소됨(`746d5eb`)
- [ ] `dev/`가 커밋된다. 8/7 빌드 동결 전 삭제 대상임이 문서에 남아 있다
- [ ] `npx http-server . -p 8080` → `http://localhost:8080/dev/harness.html` 에서 동작 확인
      (`python -m http.server` 금지 — Windows에서 `.js`를 `text/plain`으로 내보낸다)

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|---|---|---|
| 스태시를 pop하면 바로 이어서 작업할 수 있다 | main이 15 커밋 앞서 있고 그중 4개가 기획을 바꿨다 | 11개 항목이 어긋났음을 전수 조사. `quiz.js`는 충돌까지 예상됨 |
| rebase는 규약 위반이다 | 브랜치에 고유 커밋이 0개라 갈아끼울 해시가 없다 | 사용자가 근거와 함께 예외 승인. fast-forward이므로 §5의 실패 모드가 발생하지 않음 |
| 스태시 `quiz.js`는 값만 고치면 된다 | `ui-spec.md`가 8/5에 폰 형태를 명세로 굳혔다 | 형태 재구현까지 산출 경계에 포함 (사용자 선택 C) |
| 길 안내 코드가 이미 있으니 살려 쓴다 | `AGENTS.md` §3이 길 안내를 "열림"으로 올렸다 | 코드는 유지하되 **부르지 않는다** + 합의 대기 TODO 주석 |
| 질문 20개는 인플레이 소비량이다 | 20 × 10초 = 200초가 스테이지보다 길다 | 20개는 **풀**이다. 최종적으로 풀을 키워 랜덤 추출하되 지금은 순차 소비 |
| 모달 중 스트림 정지는 미결이다 | 정지 여부가 문자 개수를 2배 이상 바꾼다 | `pauseOnQuiz=true` 확정 → 문자 ~58개 |
| B가 실제 게임에서 검증할 수 있다 | `main.js`(A 소유)가 아직 mount를 부르지 않는다 | 하네스로 검증. 실물 `state.js`에 물려 A 작업 완료 시 합류 비용을 낮춘다 |

## Technical Context

**스태시:** `stash@{0}` — `On feat/phone-quiz: feat(phone,quiz): 폰·모달 구현 + dev 하네스 — 기획 문서 최신화 대기`
2026-08-04 22:34:33, base `f8ea594`.

| 파일 | 추적 | 규모 |
|---|---|---|
| `src/phone.js` | tracked | +230 |
| `src/quiz.js` | tracked | +245 |
| `content/day1.json` | tracked | +35 (더미 messages 12 / quizzes 4) |
| `content/README.md` | tracked | +24 |
| `dev/harness.html` | untracked | +437 |
| `dev/handoff-to-A.md` | untracked | +144 |
| `dev/phone-look-compare.html` | untracked | +248 |
| `dev/check-content.mjs` | untracked | +55 |

**브랜치:** `feat/phone-quiz` — 고유 커밋 0, main보다 15 뒤. 원격에 없음.
A는 `origin/feat/world-map-buildings`에서 작업 중이며 main에 병합되지 않았다.

**접점 실물** (`src/state.js`, `746d5eb`): `state.{speedMul, gauge, quizOpen}` + `onGate(cb)` / `fireGate(gateIndex)`.
`onGate`는 A가 발화하고 B가 듣는다. `fireGate`는 콜백 예외를 삼켜 나머지가 계속 돌게 한다.

**z-index 대역:** 캔버스 0~9 / HUD 10~99 / 폰 100~199 / 모달 200~299.

**타이밍:** `rAF`는 숨은 탭에서 멈추므로 `DT_MAX = 0.033` 상한이 이미 걸려 있다.
`setTimeout`을 섞지 않는다 — 한 파일에 시간 소스가 둘이 되면 탭 이탈 시 벽시계만 흐른다.

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|---|---|---|---|
| 스태시 | 프로세스 | base, 추적/미추적 8파일, 8/4 22:34 | `feat/phone-quiz`에 pop된다 |
| 질문 모달 (`quiz.js`) | core domain | countdownSec, 랜덤패널티, 보기3, 폰형태 | `state.{gauge,speedMul,quizOpen}`에 쓴다 / `onGate`를 듣는다 |
| 대화 스트림 폰 (`phone.js`) | core domain | streamSec, maxBubbles, kind 3종, pauseOnQuiz | `state.quizOpen`을 읽는다 / `content.messages`를 소비 |
| `content/day1.json` | core domain | chrome, messages(~58), quizzes(20), feedback, laneNames | 두 모듈이 함께 읽는다 |
| 접점 `state` | 외부 계약 | speedMul, gauge, quizOpen, onGate/fireGate | A·B 공동 소유. 4개 고정 |
| dev 하네스 | 지원 | harness.html, check-content.mjs, handoff-to-A.md | 8/7 삭제 대상 |
| 질문 풀 | core domain | 현재 20, 최종적으로 확대 후 랜덤 추출 | `quizzes` 배열이 실체 |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|---|---|---|---|---|---|
| 1 | 7 | 7 | - | - | N/A |
| 2 | 7 | 0 | 0 | 7 | 100% |
| 3 | 7 | 0 | 0 | 7 | 100% |
| 4 | 7 | 0 | 0 | 7 | 100% |
| 5 | 7 | 0 | 0 | 7 | 100% |

Round 1에서 전 엔티티가 등장하고 이후 4라운드 동안 이름·타입·관계가 한 번도 바뀌지 않았다.
`AGENTS.md`가 도메인 모델을 이미 고정해 둔 덕이고, 인터뷰가 좁힌 것은 엔티티가 아니라
각 엔티티의 **값과 경계**였다.

## Interview Transcript

<details>
<summary>Full Q&A (Round 0 + 5 rounds)</summary>

### Round 0 — 토폴로지 확인
**Q:** 6개 최상위 컴포넌트로 읽었습니다. 맞습니까?
**A:** ⑥ 길 안내는 보류 (5 active / 1 deferred)

### Round 1 — Goal / `restore-strategy`
**Q:** 이번 세션의 산출물 경계는 어디까지입니까?
**A:** C(기획 동기화 + ui-spec 폰 형태 재구현 + 실콘텐츠). "질문 문항 수는 최종적으로는 단조로움 탈피를 위해 보다 많은 질문을 구성하고 인플레이에서 랜덤으로 뽑는 것을 생각중이나, 지금은 20개 내외만 생성."
**Ambiguity:** 34% (Goal 0.70 / Con 0.80 / Cri 0.35 / Ctx 0.85)

### Round 2 — Success Criteria / `restore-strategy`
**Q:** 어떤 브랜치·PR 단위로 냅니까?
**A:** 기존 브랜치를 쓰되 rebase. "규칙은 rebase 금지지만, 지금은 발생할 위험이 없으니."
**Ambiguity:** 27% (Goal 0.72 / Con 0.85 / Cri 0.55 / Ctx 0.85)

### Round 3 — Goal / `phone-sync`
**Q:** 스태시에 이미 있는 길 안내 구현을 어떻게 합니까?
**A:** 그대로 둔다. 주석에 TODO 명시.
**Ambiguity:** 24% (Goal 0.80 / Con 0.85 / Cri 0.55 / Ctx 0.85)

### Round 4 — Success Criteria / `dev-harness` — 🔥 CONTRARIAN
**Q:** '동작한다'고 말할 근거를 무엇으로 삼습니까?
**A:** 하네스 갱신 + dev/ 커밋. "추후 A 작업 끝나면 적은 비용으로 합칠 수 있게."
**Ambiguity:** 18.5% (Goal 0.75 / Con 0.85 / Cri 0.85 / Ctx 0.85)

### Round 5 — Goal / `content-day1`
**Q:** 모달이 떠 있는 10초 동안 대화 스트림은 어떻게 됩니까?
**A:** 멈춘다 (`pauseOnQuiz=true`)
**Ambiguity:** 14% ✅ (Goal 0.88 / Con 0.85 / Cri 0.85 / Ctx 0.85)

</details>
