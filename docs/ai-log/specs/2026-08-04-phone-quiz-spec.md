# Deep Interview Spec: phone.js · quiz.js 1차 구현

## Metadata
- Interview ID: di-2026-08-04-phone-quiz
- Rounds: 7 (+ Round 0 topology)
- Final Ambiguity Score: 19%
- Type: brownfield
- Generated: 2026-08-04
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED
- **pending approval** — 실행 승인 전

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|---|---|---|---|
| Goal Clarity | 0.85 | 0.35 | 0.298 |
| Constraint Clarity | 0.80 | 0.25 | 0.200 |
| Success Criteria | 0.75 | 0.25 | 0.188 |
| Context Clarity | 0.85 | 0.15 | 0.128 |
| **Total Clarity** | | | **0.813** |
| **Ambiguity** | | | **0.188** |

## Topology

| Component | Status | Description | Coverage |
|---|---|---|---|
| content-schema | active | `content/day1.json` 평면 스키마 + 더미 콘텐츠 | AC-1 ~ AC-3 |
| phone | active | 폰 패널 + 대화 스트림, DOM 오버레이 | AC-4 ~ AC-10 |
| quiz | active | 질문 모달, 보기 3개, 6초, 정오답 판정 | AC-11 ~ AC-18 |
| state-contract | active | 접점 4개를 **주입**으로 받음. `state.js`는 안 건드림 | AC-19 ~ AC-21 |
| harness | active | `dev/` 임시 검증 페이지. 8/7 동결 전 삭제 | AC-22 ~ AC-24 |

## Goal

`src/phone.js`와 `src/quiz.js`를 DOM 오버레이 모듈로 구현한다. 두 모듈은 `src/state.js`를 import하지
않고 mount 시 상태를 **주입**받으며, `content/day1.json`의 평면 스키마에서 더미 콘텐츠를 읽는다.
퀴즈는 정오답(무응답 포함)을 판정하고 접점 4개를 실제로 건드리되 수치는 `TUNING` 상수 블록에 모은다.
`dev/` 아래 임시 하네스로 2026-08-04 밤 대면 시연이 가능해야 한다.

## Constraints

- `index.html` · `src/main.js` · `src/world.js` · `src/state.js` · `prototype/` — **diff 0** (`AGENTS.md` §1, §7)
- `vendor/` 미수정. 모든 모듈·에셋 경로는 `./` 상대경로 (`AGENTS.md` §6)
- 공유 상태는 `speedMul` `gauge` `quizOpen` `onGate` 넷 그대로. 다섯 번째를 만들지 않는다 (`AGENTS.md` §2)
- 대화·질문·정답은 코드에 박지 않고 `content/day1.json`에서 읽는다
- 번들러·프레임워크·포매터 없음. ES 모듈 + 세미콜론 유지 (`AGENTS.md` §3, §7)
- 주석은 **왜**만 적는다. 무엇을 하는지는 적지 않는다
- 커밋 scope는 `phone` `quiz` `content` `build` 중에서 (`AGENTS.md` §5)

### 확정된 설계 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 렌더 표면 | **DOM 오버레이.** 각 모듈이 자기 요소를 만들어 `body`에 append | `index.html`이 A 소유라 script 태그를 못 붙임. three.js와 독립 |
| 접점 결합 | **주입.** `mountPhone(root, {state})` / `mountQuiz(root, {state, onGate})` | `state.js`는 8/3에 잊혀 비어 있음. 공동 파일이라 혼자 채우면 충돌. 되돌리기 비용이 주입→import 쪽만 쌈 |
| 조용한 실패 방지 | mount가 인자를 못 받으면 `throw` | 주입은 안 붙어도 에러가 안 나 8/5에 "왜 안 뜨지"로 시간을 씀 |
| 폰 제어 | **`setVisible(bool)`** + CSS transition. away `.225s` / back `.318s`, `linear` | 시안 비교 후 선택. 결합이 얇고 A가 매 프레임 안 불러도 됨 |
| 폰 기본 상태 | ~~보임. Space가 전방~~ → **정면. Space를 누르고 있는 동안 폰을 본다** (2026-08-04 구현 중 사용자 지시로 뒤집힘) | `docs/기획 초안.md:19`("휴대폰 열기: space")를 따른다. `prototype/…html:98,135`는 반대 방향이므로 그 코드를 그대로 옮기면 뒤집힌다 |
| 입력 | phone·quiz는 **키를 안 듣는다** | 입력 라우팅은 `main.js`(A) 담당 (`AGENTS.md` §1) |
| 스키마 | **평면.** `messages[]` + `quizzes[]` 독립. 질문은 게이트 순서대로 | 가장 단순. 컨셉이 바뀌어도 문자열만 갈아끼움 |
| `Message.kind` | `person` \| `notice` \| `map` | 길 안내를 프로토타입에서 살림 |
| 판정 후 처리 | 접점을 **실제로 건드림.** 수치만 `TUNING` 상수 | 8/5의 "접점 4개 연결"이 그날 처음 하는 일이 되지 않게 |
| 6초 타임아웃 | **오답과 동일 경로** | 무응답이 최적해가 되는 구멍을 막음 (`docs/game_balance_review.html:460`) |
| 콘텐츠 | 전부 **더미** | 대화 컨셉(회사원 유지 여부) 미정 |

## Non-Goals

- **스크랩 · 찜 · 메모장 · 보기에 원문 노출** — `AGENTS.md` §3에서 잘림
- **룰렛 · 카드 뽑기 · 랜덤 페널티 3종** — §3에서 감속 3초 고정으로 축소됨
- **실시간(비모달) 질문** — §3에서 모달로 확정
- **`src/state.js` 구현** — 2026-08-04 밤 팀 미팅 안건
- **실제 콘텐츠 작성** — 컨셉 확정 후
- **밸런싱 수치 확정** — 8/6
- **`setLook(k)` 연속값 경로** — 실플레이에서 끈적임이 걸리면 그때 추가
- **좌·우회전 카메라 전환, 역할 여러 종** — §3에서 잘림

## Acceptance Criteria

**content/day1.json**
- [ ] AC-1 `messages[]`와 `quizzes[]`를 가진 평면 JSON으로 파싱된다
- [ ] AC-2 각 message가 `kind`를 갖고 값이 `person`/`notice`/`map` 중 하나다
- [ ] AC-3 각 quiz가 보기 정확히 3개와 정답 인덱스를 갖는다

**phone.js**
- [ ] AC-4 하네스를 열면 폰 패널이 뜨고 더미 문자가 2.6초 간격으로 흐른다
- [ ] AC-5 문자가 7개를 넘으면 오래된 것부터 사라진다
- [ ] AC-6 `person`/`notice`/`map` 세 종류가 색으로 구분된다
- [ ] AC-7 `setVisible(false)` 시 폰이 아래로 내려가며 blur·투명도가 걸린다 (`.225s linear`)
- [ ] AC-8 `setVisible(true)` 시 `.318s linear`로 복귀한다
- [ ] AC-9 `phone.js`에 `addEventListener('keydown')`이 **없다**
- [ ] AC-10 대화 내용 문자열이 `phone.js` 안에 **없다**

**quiz.js**
- [ ] AC-11 하네스의 게이트 버튼을 누르면 모달이 뜬다
- [ ] AC-12 모달이 뜬 동안 `state.quizOpen === true`, 닫히면 `false`
- [ ] AC-13 보기 3개가 표시되고 클릭으로 선택된다
- [ ] AC-14 6초 카운트다운이 화면에 보이고 실제로 줄어든다
- [ ] AC-15 정답 시 `state.gauge`가 `TUNING.gaugeOnCorrect`만큼 증가한다
- [ ] AC-16 오답 시 `state.speedMul`이 `TUNING.slowMul`이 되고 3초 후 1로 돌아온다
- [ ] AC-17 6초 무응답 시 오답과 동일한 경로를 탄다
- [ ] AC-18 임시 수치가 전부 `TUNING` 한 블록에 모여 있다 (8/6에 여기만 손대면 됨)

**접점**
- [ ] AC-19 `phone.js`·`quiz.js` 어디에도 `import … from './state.js'`가 없다
- [ ] AC-20 `mountPhone`/`mountQuiz`를 인자 없이 부르면 `throw` 한다
- [ ] AC-21 `git diff`에 `src/state.js` · `index.html` · `src/main.js` · `src/world.js` · `prototype/`가 없다

**하네스**
- [ ] AC-22 `npx http-server . -p 8080` 후 하네스 URL이 200을 반환하고 콘솔 에러가 0이다
- [ ] AC-23 게이트 발생 · 문자 추가 · 폰 토글 · 리셋을 버튼으로 조작할 수 있다
- [ ] AC-24 모든 경로가 `./`로 시작한다 (절대경로 0건)

## Assumptions Exposed & Resolved

| 가정 | 도전 | 결론 |
|---|---|---|
| 프로토타입 `phone()`을 그대로 옮긴다 | `index.html`이 A 소유고 three.js 캔버스는 A가 붙인다 | DOM 오버레이로 재구현. 프로토타입은 **모양과 수치만** 참고 |
| `state.js`를 먼저 채워야 두 모듈이 돈다 | (Contrarian) 붙일 상대(`world.js`)가 아직 없다. 공동 파일이고 8/3에 잊혔다 | 주입으로 우회. `state.js`는 밤 미팅 안건 |
| "거북목 컨셉 제거"가 폰 연출 제거를 뜻한다 | 사용자 정정 — 컨셉 라벨만 뺀 것이고 기능은 동일 | 프로토타입 각도 연출 유지 |
| 폰 숨김이 필요 없을 수도 (Simplifier) | 코어가 "Space를 언제 누를지 고민"인데 그게 곧 폰 숨김이다 | 숨김 유지. 단 제어는 A가 부른다 |
| 불린 제어의 어긋남은 눈에 안 띈다 | 짧게 톡 누를 때 CSS transition이 남은 거리와 무관하게 전체 시간을 다시 씀 (5배 느림) | 시안으로 직접 비교 후 **불린 채택**. 끈적임은 감수, `setLook`이 퇴로 |
| 질문이 대화 원문을 참조해야 한다 | 스크랩이 §3에서 잘려 원문 노출 기능이 없다 | 평면 스키마. 참조 없음 |
| 6초 후 모달이 그냥 닫힌다 | 그러면 무시가 최적해가 된다 (`game_balance_review.html:460`) | 타임아웃 = 오답 |
| `docs/기획 초안.md`의 미정 사항이 많이 남아 있다 | §3이 이미 대부분 확정·삭제했다. 남은 열린 항목은 스키마 하나 | 이번 라운드에서 스키마도 확정 |

## Technical Context

- `src/{state,main,world,phone,quiz}.js` 전부 주석만 있는 스켈레톤. **실코드 0줄**
- `content/day1.json`은 `{}`. `vendor/` 디렉터리 없음 (three.js 미동봉 — A 소관)
- `prototype/busy-man-prototype.html:268` `phone()` — 292×396, 8px 베젤, `k = clamp((pitch-0.18)/(rest-0.18))`,
  `blur = (1-k)*7`, `alpha = 0.35+0.65k`, 메시지 최대 7개
- 각도 상수 (`prototype/…:69`): `rest 0.72` `top 0.03` `up 2.4 rad/s` `down 1.7 rad/s`
  → 폰 이동 구간 0.54rad → **away 0.225s · back 0.318s**
- `docs/game_balance_review.html:633` — 목표 정답률 밴드 `p* ≈ 0.45~0.70`. 8/6 밸런싱 기준
- 시안 산출물: `dev/phone-look-compare.html` (두 제어 방식 나란히 비교). **8/7 동결 전 삭제**

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|---|---|---|---|
| DayContent | core domain | messages, quizzes | `content/day1.json`에서 로드 |
| Message | core domain | from, kind(person/notice/map), text | DayContent has many Message |
| Quiz | core domain | prompt, choices, answer | DayContent has many Quiz |
| Choice | supporting | text | Quiz has exactly 3 Choice |
| PhonePanel | supporting | visible, messages(max 7) | PhonePanel renders Message |
| QuizModal | supporting | open, countdown(6s), selected | QuizModal renders Quiz |
| GateEvent | core domain | gateIndex | GateEvent triggers Quiz |
| Gauge | core domain | value | quiz가 정/오답으로 증감 |
| StateContract | external system | speedMul, gauge, quizOpen, onGate | **주입**으로 전달. `state.js`에 아직 없음 |
| Tuning | supporting | gaugeOnCorrect, gaugeOnWrong, slowMul, slowSeconds | quiz.js 상단 단일 블록. 8/6 밸런싱 대상 |
| Harness | supporting | 버튼(게이트/문자/토글/리셋) | 임시. 8/7 전 삭제 |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability |
|---|---|---|---|---|---|
| 1 | 9 | 9 | – | – | N/A |
| 2 | 10 | 1 (Harness) | 0 | 9 | 90% |
| 3 | 10 | 0 | 0 | 10 | 100% |
| 4 | 10 | 0 | 0 | 10 | 100% |
| 5 | 11 | 1 (Tuning) | 0 | 10 | 91% |
| 6 | 11 | 0 | 0 | 11 | 100% |
| 7 | 11 | 0 | 0 | 11 | 100% |

3라운드 연속 무변동 — 도메인 모델이 수렴했습니다.

## 남아 있는 열린 항목

이 스펙 밖이며, 구현을 막지 않습니다.

1. **`src/state.js` 확정** — 2026-08-04 밤 팀 미팅 안건. import로 전환하면 두 모듈 상단에 한 줄씩
2. **대화 컨셉** — 회사원 유지 여부. 확정 후 더미를 실콘텐츠로 교체
3. **밸런싱 수치** — 8/6. `TUNING` 블록만 손대면 됨
4. **`setVisible` 끈적임** — 실플레이에서 걸리면 `setLook(k)` 추가
5. **A에게 알려야 할 목록** — `phone.setVisible()` / `phone.pushMessage()` / `quiz` mount 주입.
   안 알리면 조용히 안 붙음

## Interview Transcript

<details>
<summary>Round 0 ~ 7</summary>

**R0 (topology)** — 5개 구성 확정. 콘텐츠는 더미, 퀴즈는 정오답 판정까지·이후는 플레이스홀더.

**R1** phone / context — 렌더 표면? → **DOM 오버레이.** Ambiguity 65%

**R2** harness / criteria — 무엇을 열어 확인? → **임시 파일 생성, 오늘 밤 대면 시연.** 56%

**R3** schema / goal — 질문과 대화의 연결? → **평면(가장 단순).** 56% (C4가 바닥이라 총점 불변)

**R4** state / constraints (Contrarian) — `state.js`를 지금 채워야 하나? → **주입 + 밤에 둘이 결정.**
사용자 요청으로 메모리에 기록. 38%

**R5** quiz / constraints — 플레이스홀더의 경계? → **접점은 건드림, 수치만 `TUNING`.** 36%

**R6** phone / constraints (Simplifier) — 폰 표시/숨김?
사용자 정정: 거북목은 라벨만 뺀 것, 기능 동일 / 길 안내 살림.
제어 방식은 시안 두 개를 만들어 비교 (`dev/phone-look-compare.html`). 24%

**R7** quiz / criteria — 6초 타임아웃? → **오답 처리.** 폰 제어는 시안 확인 후 **B안(setVisible)** 채택. **19% — 임계 통과**

</details>
