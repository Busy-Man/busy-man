# 작업 계획: phone.js · quiz.js 1차 구현

- 출처 스펙: `.omc/specs/deep-interview-phone-quiz.md` (deep-interview 7라운드, 모호도 19%)
- 상태: **pending approval** — Architect 2회 · Critic 2회 합의 완료 (Critic APPROVED)
- 작성: 2026-08-04 · 브랜치: `feat/phone-quiz`

---

## 0. 코드보다 먼저 — 오늘 밤 대면 안건

19건이 테이블에 오른다. **우선순위 없이 읽으면 뒤가 잘린다.** 아래 6개만 30분에 끝내면
나머지는 종이로 넘겨도 된다.

### 절대 잘리면 안 되는 것 — 6개

| 순 | 항목 | 잘리면 무엇이 터지나 |
|---|---|---|
| 1 | **`state.js` export 형태** — `export const state = { speedMul: 1, gauge: 0, quizOpen: false };` | 나머지 전부가 무효. `export let`이면 B의 대입이 ES 모듈 바인딩 규칙상 TypeError이거나 조용히 무시된다 |
| 2 | **`onGate`의 소유자와 시그니처** (§0-A) | 8/5에 양쪽이 서로를 기다린다. **컴파일되고, 예외도 안 나고, 게이트만 안 뜬다** |
| 3 | **`day1.json` 스키마 승인** + §0-A·0-B·0-C 문서 정정 | `AGENTS.md:75`의 유일한 열린 항목이고 8/5 병합의 정본이다 |
| 4 | **fetch 순서 + `try/catch` + `res.ok`** (Step 7-1) | B의 JSON 오타가 A의 3D 복도를 지운다 |
| 5 | **z-index 대역** — 캔버스 0~9 / A의 HUD 10~99 / B의 폰 100~199 / B의 모달 200~299 | 종이에 숫자 넷. 비용 0, 안 하면 8/5에 30분 |
| 6 | **90초가 `quizOpen` 동안 멈추는가 · 실제 런 길이는 몇 초인가** | 콘텐츠 분량·질문 배치·8/6 밸런싱이 전부 여기 매달려 있다 |

**대면 전에 2·4·6을 텍스트로 미리 보낸다.** A도 `main.js` 구조를 어느 정도 정해 놔야 즉석에서
답할 수 있다. 이게 대면 성공률을 가장 크게 올린다.

그리고 말로 할 것 하나 — **`docs/team-plan.html:217`의 8/4 산출물 "접점 4개 연결"은 오늘
mock 기준까지만 달성된다.** A가 "연결 완료"로 듣고 8/5 계획을 세우면 그날 반나절이 어긋난다.

### 0-A. 접점 표의 A/B가 §1과 네 줄 전부 반대다

```
AGENTS.md:33   §1 →  content/*.json | B | 대화 로그, 질문, 정답, 함정 단서
AGENTS.md:51   §2 →  state.speedMul   A가 감속 패널티로 낮춤 → B가 주행 속도에 곱함
```

**원인 확인 — 과거 커밋에서 `docs/team-plan.html`의 A/B 역할을 바꿀 때 접점 부분(§03)만 빠졌고,
`AGENTS.md` §2가 그 미정정분을 복사했다.**

뒤집힌 표는 저장소에 **네 벌** 있다. 세 곳을 고친다.

| 위치 | 고치는 사람 | 왜 |
|---|---|---|
| `AGENTS.md:51-54`, `:75` | 함께 | 규약 정본 |
| `docs/team-plan.html:204-207` | 함께 | **오류의 발원지.** 안 고치면 다음에 누가 또 복사한다 |
| `src/state.js:8-11` | **A** | 8/5에 실제로 열어 볼 파일. **B가 고치면 AC-21(state.js diff 0)이 깨진다.** A가 오늘 밤 `export const state`를 채울 때 같은 커밋에 넣는다 |
| `content/README.md:7` | B | `:3`("담당: B")과 자기모순. Step 1에서 함께 |

`src/phone.js:5`의 같은 문장은 Step 3이 파일을 다시 쓰면서 자동 소멸한다.

**이 계획은 §1 해석으로 구현한다.** 그리고 §2가 말하지 않는 것을 오늘 밤 확정한다 —

> **`onGate`의 소유자.** `AGENTS.md:54`는 "누가 `cb`를 받는 함수를 소유하는지"를 말하지 않는다.
> 이 계획의 설계는 **A가 `onGate(cb)` 등록 함수를 구현해 주입 → B가 `onGate(핸들러)`로 등록 →
> A가 갈림길에서 그 핸들러를 호출**이다. `AGENTS.md:54`의 정정 문안도 이 형태로 쓴다.

### 0-B. `state.speedMul`에 기록자가 둘이면 서로를 지운다

```
t=0.0   오답     speedMul = 0.6,  3.0초 후 복귀 예약
t=1.0   충돌     speedMul = 0.35, 0.55초 후 복귀 예약
t=1.55  월드 복귀 → 1      ← 퀴즈 패널티가 1.45초 일찍 소멸
```

프로토타입에서 충돌 감속은 지역 변수다 (`prototype/busy-man-prototype.html:151`의 `stun`).
→ **`state.speedMul`은 퀴즈 패널티 전용 채널.** 충돌 감속은 `world.js` 내부 값으로 두고
`SPEED * state.speedMul * collisionMul`로 **곱한다.** 기록자가 하나가 되고 접점은 4개 그대로다.

### 0-C. 오답 시 게이지를 깎는가 — 깎지 않는다

`AGENTS.md:52` / `src/state.js:9`는 `gauge: 정답 +, 오답 −`, `AGENTS.md:68` §3은
"오답 패널티는 **감속 3초 고정**"이다.

**"§3이 더 나중이니까"는 근거가 안 된다** — 두 규칙은 `docs/team-plan.html:152`와 `:205`에
**같은 커밋(`9ce58cf`, 8/3 03:11)** 안에 함께 있다. 시간 순서가 없다. 오늘 밤 그 논거를 말하면
그 자리에서 반박당한다. 대신:

```
docs/game_balance_review.html:488   게이지 감소 | 벌 | 직접 | 단, 하한 문제 있음
docs/game_balance_review.html:495   "게이지가 0이면 게이지 감소도 무효입니다"
```

오답이 몰리는 초반에 게이지는 0이고, 그때 이 벌은 **아무 일도 하지 않는다.** 나중이라서가 아니라
**작동하지 않아서** 뺀다.

---

## 1. 요구사항 요약

`src/phone.js`와 `src/quiz.js`를 DOM 오버레이 모듈로 구현한다. 두 모듈은 `src/state.js`를
import하지 않고 mount 시 의존을 **주입**받으며, `content/day1.json`의 평면 스키마에서 더미
콘텐츠를 읽는다. 퀴즈는 정답·오답·무응답을 판정하고 접점을 실제로 건드리되 수치는 각 파일의
`TUNING` 블록에 모은다. `dev/` 하네스로 **2026-08-04 밤 대면 시연**이 가능해야 한다.

건드리는 파일: `src/phone.js` · `src/quiz.js` · `content/day1.json` · `content/README.md` · `dev/`.

---

## 2. RALPLAN-DR 요약 (short mode)

### Principles

1. **소유 경계가 성능·우아함보다 우선한다** (`AGENTS.md` §1)
2. **조용한 실패를 만들지 않는다** (`src/main.js:6`)
3. **바뀔 것과 안 바뀔 것을 파일 안에서 분리한다.** 8/6에 열 블록을 파일마다 하나로 고정한다
4. **오늘 밤 돌아가는 것이 완성도보다 먼저다**
5. **투기적 코드를 쓰지 않는다.** 단, "이 계획서 안에서 오늘 생기는 요구"는 투기가 아니다

### Decision Drivers (top 3)

| # | 드라이버 | 왜 |
|---|---|---|
| D1 | 8/4 밤 대면 시연까지 남은 시간 (반나절, 1인) | 오늘 안에 하네스에서 두 모듈이 돌아야 한다 |
| D2 | 8/5 병합일의 **기대 불일치** 위험 | 코드가 안 도는 것보다 A와 B가 서로 다른 것을 기대하는 쪽이 비싸다 |
| D3 | 8/6 밸런싱·콘텐츠 교체의 재작업 비용 | 수치가 구조에 섞이면 그날 두 파일을 다시 읽어야 한다 |

**D2는 낮춰 잡았다.** 오늘 도는 것은 **B가 만든 mock을 상대로 B의 코드를 부르는 것**이다.
`state.js`는 diff 0이므로 실제 배선은 8/5에 처음 한다.

### Viable Options — 콘텐츠를 누가 읽는가

**Option A — 호출자가 읽어 주입한다 (채택).** 하네스에서 시나리오별 콘텐츠를 즉시 갈아끼울 수 있고
접점 주입 방식과 일관된다. 대가로 **A의 `main.js`에 fetch 의무**가 생기고, 그 의무는
`docs/team-plan.html:259`가 "두 사람의 코드가 처음 합쳐지는 날"이라 부른 8/5에 떨어진다.
async도 사라지지 않고 호출자로 옮겨갈 뿐이다.

**Option B — 각 모듈이 스스로 읽는다.** A가 할 일이 없고 `import.meta.url` 기준이라 Pages
하위 경로에서도 안전하다. **8/6 밸런싱·컨셉 교체(문자열 수정)는 이쪽도 재작업 0이다.**
단점은 하네스 교체성 상실뿐이고, 파일 중복 읽기는 HTTP 캐시가 처리한다.

**Option C — `content/day1.js`가 `export const DAY1 = {…}` (명시적 기각).** fetch·async·A의
의무·CORS가 전부 사라져 D1·D2 두 축에서 A·B를 모두 지배한다. 그러나 `AGENTS.md:33`이 소유
대상을 `content/*.json`으로 **확장자까지 명시**했다. 확장자 변경은 소유 경계 재협상이고 오늘 밤
안건을 하나 더 늘린다. 원칙 1에 걸려 **기각**.

**채택: Option A. 근거는 하네스 교체성 하나뿐이다.** 초안이 Option B에 붙였던 "D3 위반"은
사실이 아니었으므로 철회했다. 폭발 반경은 Step 7-1의 `try/catch`로 폰·모달까지만 제한한다.

### 스펙에서 벗어나는 지점

| 스펙 | 계획 | 근거 |
|---|---|---|
| `mountPhone(root, { state })` | `mountPhone(root, { content, state })` | **`state.quizOpen`은 오늘 밤 이미 필요하다.** 원칙 5는 "아직 없는 요구"에 적용된다 |
| AC-17 "오답과 동일 경로" | 같은 함수 + `TUNING.noAnswerScale` | `game_balance_review.html:698` — "무응답 페널티는 정의하되 **작게** (`I ≈ 0.2~0.4 × L`)". 스펙이 인용한 `:460`은 "0이면 안 됨"만 말한다 |

---

## 3. 수용 기준

스펙의 AC-1 ~ AC-24를 상속하되 **6개는 문안을 고친다.**

| AC | 개정 문안 | 왜 |
|---|---|---|
| **AC-7** | (육안) 내려갈 때가 올라올 때보다 **빠르다** · (grep) `--bm-dur-away: .225s` 1건 | 93ms 차이를 화면으로 판정할 수 없다 |
| **AC-8** | (육안) 올라올 때가 더 느리다 · (grep) `--bm-dur-back: .318s` 1건이고 `transition`에 두 변수가 걸림 | 값이 `.5s`여도 원래 문안은 통과했다 |
| **AC-10** | **렌더되는** 한국어 문자열 리터럴 0건. 크롬 텍스트도 `content.chrome`에서 온다. **진단 문자열(`throw`/`console.*`)은 제외** | 원칙 2가 요구하는 한국어 에러 메시지 때문에 원래 문안은 **통과 자체가 불가능**했다. 콘솔·예외 메시지는 렌더되지 않으므로 예외를 둬도 AC의 목적(8/6에 JSON만 갈아끼우기)은 훼손되지 않는다 |
| **AC-17** | 6초 무응답이 오답과 **같은 함수**를 호출한다(코드 확인) + 크기만 `TUNING.noAnswerScale`로 곱한다 | 화면상 구별되지 않아 복붙된 두 경로도 통과했다 |
| **AC-18** | **두 파일 각각** 상단 `TUNING` 블록 하나에 수치가 모여 있고, 블록 **밖으로는 CSS 변수로만 나간다** | 원래 문안은 `quiz.js`만 봤다. 8/6 B의 항목(`docs/team-plan.html:219` "대화 속도")은 전부 `phone.js`에 있다. 맨숫자 grep은 z-index·padding에 묻히므로 **판정 기준을 "CSS 변수로만 나간다"로 바꾼다** |
| **AC-22** | 하네스가 `window.onerror`·`unhandledrejection` 카운터를 표시하고, 조작을 한 바퀴 돈 뒤 값이 **0**이며 `.bm-phone` 노드가 DOM에 존재한다 | "콘솔 에러 0건"은 정보량이 0이고 AC-20(`throw` 시연)과 양립할 수 없었다 |

**AC-21의 명령도 고친다** — `git diff`는 untracked를 못 본다. `git status --porcelain`을 쓴다.
단 `?? dev/…`는 **정상**이다(새 디렉터리). 금지 목록은 `src/state.js` · `index.html` ·
`src/main.js` · `src/world.js` · `prototype/` · `vendor/` 여섯이다.

---

## 4. 구현 순서

**하네스 뼈대를 `phone.js` 앞에 둔다.** 하네스 없이 `phone.js`부터 짜면 완성될 때까지
한 번도 못 돌린다. 총 5시간 30분, 반나절에 들어간다.

### Step 1 — `content/day1.json` · `content/README.md` (20분)  → AC-1, AC-2, AC-3

```json
{
  "chrome":      { "clock": "08:41", "channel": "팀 채널" },
  "laneNames":   ["왼쪽", "가운데", "오른쪽"],
  "mapTemplate": "환승 통로 — {lane}",
  "messages": [
    { "from": "김 팀장", "kind": "person", "text": "늦지 마요" },
    { "from": "알림",    "kind": "notice", "text": "캘린더 — 스프린트 리뷰 11:00" }
  ],
  "quizzes": [
    { "prompt": "박PM이 미룬 회의는 몇 분이었나요?",
      "choices": ["5분", "10분", "15분"], "answer": 1 }
  ]
}
```

- **`kind: "map"`을 `messages[]`에 넣지 않는다.** 프로토타입에서 길 안내는 런타임 합성이다 —
  `prototype:167`의 `` `지도: 환승 통로 — ${LANE_NAME[g.lane]}` ``이고 `g.lane`은 매 판
  무작위(`:103`)이며 `world.js`(A)만 안다. 정적으로 박으면 **실제 갈림길과 무관한 시점에 무관한
  방향을 안내한다.** 실콘텐츠로 갈아끼워도 여전히 틀린다
- `chrome`을 둬서 `phone.js`의 렌더 리터럴을 0건으로 만든다 (개정 AC-10)
- **분량: messages 12개 + 순환.** 오늘 밤 AC-5 판정에 필요한 최소는 8개이고, 선례도
  프로토타입 12개(`:82-95`) · 시안 8개(`dev/phone-look-compare.html:151-160`)이며 둘 다
  `% length`로 순환했다. 전량 폐기 대상(실콘텐츠 교체)인 한국어 34줄을 오늘 쓰는 것은 D1 위반이다
- **`content/README.md`에 세 줄:**
  ① 필요 개수를 **식으로** — `(런 길이 − 질문수 × 6[스트림 정지 시]) ÷ 2.6`.
  숫자를 박으면 안 된다. 스트림 정지 여부(§8-1)와 런 길이(§0 안건 6)가 둘 다 미결이다
  ② **실콘텐츠 투입 = 8/5 B** (`docs/team-plan.html:218`), **8/8 영상 촬영 전 필수**.
  안 들어오면 제출 영상에 같은 문자가 세 번씩 지나간다
  ③ `:7`의 "A가 AI로 뽑는 JSON"을 B로 정정 (§0-A)

### Step 2 — `dev/harness.html` 뼈대 (30분)  → AC-24

`fetch` + 빈 컨테이너 + 버튼 6개 + 체크박스 1개만. 계기판은 Step 5에서.

- 버튼: **[폰 토글]** **[문자 1개 추가]** **[길 안내]** **[게이트 발생]** **[리셋]** **[주입 없이 mount]**
- 체크박스: **[모달 중 스트림 정지]** (기본 켬)
- `./../content/day1.json` fetch, 모든 경로 `./`
- 파일 상단에 **"8/7 빌드 동결 전 삭제"**

`dev/`는 **커밋한다** — A가 오늘 밤 이후에도 열어봐야 한다. scope는 `build`
(`AGENTS.md` §5 목록에 `dev`가 없다). 삭제 항목은 `docs/team-plan.html:220`의 8/7 행에 적는다.

### Step 3 — `src/phone.js` (2시간)  → AC-4 ~ AC-10, AC-19, AC-20

```js
// 8/6 밸런싱에서 이 블록만 손댄다. 짝: src/quiz.js 의 TUNING
// (docs/team-plan.html:219 "대화 속도·난이도 밸런싱")
const TUNING = {
  streamSec:  2.6,    maxBubbles: 7,
  travelPx:   436,    // 396 높이 + 40 여유
  durAwaySec: 0.225,  // prototype:69 의 up 2.4rad/s 를 폰 구간 0.54rad 로 환산
  durBackSec: 0.318,  // 같은 방식, down 1.7rad/s
  blurPx:     7,      dimAlpha: 0.35
};

export function mountPhone(root, opts) {
  if (!opts || !opts.content || !opts.state)
    throw new Error('mountPhone: main.js에서 fetch("./content/day1.json") 후 { content, state } 로 넘길 것');
  ...
  return { setVisible, pushMessage, pushMap, reset, destroy };
}
```

- **DOM 오버레이.** `root`에 `<div class="bm-phone">` append. `position: fixed`,
  z-index는 §0 안건 5의 합의값. `.away`에 `pointer-events: none`
- **CSS 상수는 `TUNING`에서 `style.setProperty`로 주입.** 시안은 `TRAVEL = 436`(`:139`)과
  `translateY(436px)`(`:54`)로 같은 값을 두 곳에 뒀다. **그 중복을 옮겨 심지 않는다**
- **이징은 CSS transition 그대로.** 시안 `:51-56`이 사용자 검증을 거쳤고, 스펙 `:123`이
  "끈적임은 **감수**, `setLook`이 퇴로"라고 적었다 — **사용자는 그 비용을 알고 골랐다.**
  검증된 CSS 4줄을 버리고 오늘 밤 전에 다시 만들고 다시 비교하는 것은 D1 위반이다
  *(초안의 "내부 이징 = 다섯 번째 접점"은 **틀렸다.** 등속 적분기는 불린 target만 있으면 되고
  `pitch`가 필요 없다 — `prototype:136-139`가 그 계산이다. 이 오류를 남기면 8/6에 `setLook`
  퇴로가 잘못된 이유로 막힌다.)*
- **스트림 타이머는 rAF delta 누적**(시안 `:229-231`). `setInterval`이 아니다.
  초안은 `prototype:179`를 벽시계 근거로 인용했으나 **그 줄은 `step(dt)` 안이고 `:128,132`에서
  정지한다**
- **dt 상한 필수:** `const dt = Math.min(0.033, (now - last) / 1000)`. 숨은 탭에서 rAF는
  호출되지 않고 복귀 시 `now`가 통째로 점프한다. 상한이 없으면 이탈 시간 전체가 한 프레임에
  들어간다 (`prototype:372`, `dev/phone-look-compare.html:200` 둘 다 갖고 있다)
- **rAF 수명:** mount에서 **하나만** 시작, `destroy`에서 `cancelAnimationFrame`,
  `reset`은 **누적치만 0**. `reset`이 새 루프를 시작하면 문자가 두 배로 흐른다
- **`state.quizOpen === true`인 동안 누적을 건너뛰되 마지막 프레임 시각은 갱신한다.**
  갱신을 빼면 모달이 닫히는 순간 6초치가 한 번에 들어가 문자가 쏟아진다 — 정지시켜 막으려던
  현상 그 자체다. **이 스킵 규칙은 스트림에만 적용한다** (카운트다운에 적용하면 영원히 안 준다)
- 말풍선은 `from`과 `text`를 분리 렌더 (`<b>김 팀장</b> 늦지 마요`). 프로토타입은 텍스트에
  `'박PM: '`를 섞었지만(`:83`) 스키마가 필드를 분리했다
- `kind` 3종 색: `person` 회색 / `notice` 베이지 / `map` accent + 좌측 3px 바 + 굵게 (`:299-303`)
- **`pushMap(laneIndex)`** — `mapTemplate`의 `{lane}`을 `laneNames[i]`로 치환.
  정수·범위 검증 후 아니면 `console.error`. 규약은 **`0=왼쪽 1=가운데 2=오른쪽`**
  (`prototype:60-61`이 이미 좌→우 순서라 A가 프로토타입에서 출발하면 자동 일치한다)
- **`reset()`** — 말풍선·누적치 초기화
- **키 리스너 없음** — `keydown`·`keyup`·`keypress` 전부. 시안 `:182,189`에 둘 다 있으니 복붙 주의

### Step 4 — `src/quiz.js` (1시간 30분)  → AC-11 ~ AC-18, AC-19, AC-20

```js
// 8/6 밸런싱에서 이 블록만 손댄다. 짝: src/phone.js 의 TUNING
const TUNING = {
  gaugeOnCorrect: +1,   slowMul: 0.6,
  slowSeconds:    3,    // AGENTS.md:68 확정 — 밸런싱 대상 아님
  countdownSec:   6,    // AGENTS.md §3 확정 — 밸런싱 대상 아님
  noAnswerScale:  1.0   // game_balance_review.html:698 → 8/6에 0.2~0.4 로
};
```

- **`gaugeOnWrong`을 두지 않는다** (§0-C)
- `onGate(cb)`로 콜백 등록 — **`onGate`는 A가 구현해 주입한다** (§0-A)
- `content.quizzes[i]`를 순서대로. **`i >= length`면 `console.warn` 후 모달을 띄우지 않는다.**
  하네스에서 [게이트 발생]을 5번 누르면 `undefined`가 나오는 경로가 열려 있다
- 보기 3개는 `<button>`. **어떤 보기에도 자동 포커스를 주지 않는다** — 포커스된 버튼에서
  Space는 브라우저 기본 동작상 클릭이고, A의 Space는 고개 들기다
- `state.quizOpen`을 열 때 `true`, 닫을 때 `false`
- **카운트다운·패널티 복귀를 같은 rAF 누산기로 센다. 파일당 시간 소스 하나.**
  `setTimeout`을 쓰면 rAF(카운트다운) + 벽시계(패널티)가 공존해 방금 제거한 축 불일치를
  파일 내부에 다시 만든다. 알트탭 중 감속 3초가 정지한 게임 위에서 소멸한다.
  ```js
  applyPenalty(scale) { state.speedMul = 1 - (1 - TUNING.slowMul) * scale;
                        penaltyLeft = TUNING.slowSeconds; }
  // loop: if (penaltyLeft > 0 && (penaltyLeft -= dt) <= 0) state.speedMul = 1;
  ```
  **재대입 한 줄로 R10(패널티 중첩)이 자동 해소된다** — 타이머 핸들도 `clearTimeout`도 없다
- **dt 상한 `Math.min(0.033, …)`** — 없으면 6초 카운트다운이 탭 복귀 즉시 만료된다.
  `quiz.js`의 루프는 프로토타입·시안 어디에도 베낄 줄이 없는 새 코드다
- **rAF 수명을 `phone.js`와 같게.** 모달을 열 때마다 새로 걸고 안 취소하면 루프가 누적돼
  **카운트다운이 2배·3배로 빨라진다.** 하네스 [게이트 발생] 연타가 오늘 밤 반드시 눌린다
- **mount 진입부 스키마 검증기는 8/5 아침으로 이월** — R2가 실현되는 시점이 8/5(실콘텐츠 AI
  생성 투입일)이고, 오늘 콘텐츠는 손으로 쓴 13줄이라 어긋날 수 없다. 검증 0단계가 오늘 몫을 덮는다
- 정답: `state.gauge += TUNING.gaugeOnCorrect`
- 오답·무응답: **같은 함수** `applyPenalty(scale)`. 오답 `1`, 무응답 `noAnswerScale`
- **키 리스너는 모달 생존 기간에만** 붙였다 뗀다
- **`reset()`** — 퀴즈 인덱스·열린 모달·`penaltyLeft` 초기화

### Step 5 — 하네스 계기판 (20분)  → AC-20, AC-22, AC-23

상단 표시: `speedMul` · `gauge` · `quizOpen` · **에러 카운터**(`window.onerror` /
`unhandledrejection`) · 마지막 문자 이후 경과 초.

- **[리셋]의 정의:** 두 모듈의 `reset()` + 하네스 더미 상태 초기화
- **[주입 없이 mount]** 는 `try/catch` 안에서 인자 없이 mount해 `throw`가 잡혔음을 화면에 표시.
  이래야 AC-20과 AC-22가 같은 실행에서 공존한다

`setVisible` 호출 카운터는 **두지 않는다.** 하네스에서 `setVisible`을 부르는 것은 하네스 자신의
[폰 토글]뿐이라 "내가 방금 누른 버튼이 눌렸다"를 표시할 뿐이다 — AC-22의 "콘솔 에러 0건"을
정보량 0이라며 갈아엎은 것과 같은 구조다. R1의 대응은 **8/5 병합 체크리스트**로 옮긴다.

### Step 6 — 소유 경계 검증 (30분)  → AC-9, AC-19, AC-21, AC-24

```bash
git status --porcelain     # 금지: src/state.js, index.html, src/main.js, src/world.js,
                           # prototype/, vendor/    ( ?? dev/… 는 정상 )
grep -rn "state\.js" src/phone.js src/quiz.js                          # 0건
grep -rniE "addEventListener\(.(keydown|keyup|keypress)" src/phone.js   # 0건
grep -rniE "addEventListener\(.(keydown|keyup|keypress)" src/quiz.js    # 모달 함수 안에서만
grep -rnE "src=\"/|href=\"/|from \"/|from '/" dev/ src/                 # 0건
```

### Step 7 — A에게 넘길 스니펫 한 장 (20분)

**계획 전문을 복사하지 않는다.** `docs/ai-log/specs/` 복사는 **8/5 아침**으로 이월한다 —
대면에 필요한 것은 A5 한 장짜리 안건·스니펫이지 계획서가 아니고, 훅이 이미
`docs/ai-log/raw/2026-08-04.md`에 원문을 쌓고 있어 기록 손실이 0이다.
(복사할 때는 §0을 "확인 안건" 목록으로 축약한다 — 그 디렉터리는 제출물 4번의 재료이고
루트 전체가 Pages로 서빙되므로 "우리 규약이 틀렸다"는 서술이 심사 재료에 섞인다.)

1. **fetch는 world 초기화 뒤에, `try/catch` 안에서**
   ```js
   // main.js — world 시작이 먼저다
   try {
     const res = await fetch('./content/day1.json');   // ./content/… 이다. 하네스의 ./../ 아님
     if (!res.ok) throw new Error('day1.json ' + res.status);
     const content = await res.json();
     const phone = mountPhone(document.body, { content, state });
     const quiz  = mountQuiz(document.body, { content, state, onGate });
   } catch (e) { console.error('[content]', e); }
   ```
   `res.ok`가 없으면 404 HTML을 파싱한 SyntaxError가 원인을 안 가리킨다.
   `try/catch`가 없으면 **B의 JSON 오타가 A의 3D 복도를 지운다**
2. **`onGate`는 A가 구현해 주입**
   ```js
   // main.js / world.js — A쪽
   const gateCbs = [];
   export function onGate(cb) { gateCbs.push(cb); }        // B가 이걸 부른다
   // 갈림길 진입 시
   gateCbs.forEach(cb => cb(gateIndex));                    // A가 발화한다
   ```
3. `phone.setVisible(bool)` — Space 처리에서. **기본 상태 = 보임(`true`)**
4. `phone.pushMap(laneIndex)` — **`0=왼쪽 1=가운데 2=오른쪽`**
5. `phone.reset()` / `quiz.reset()` — 결과 화면에서 재시작할 때
6. `state.quizOpen === true`인 동안 **이동·입력을 막아야 한다** (`AGENTS.md:53`)
7. mount는 인자를 못 받으면 `throw`한다 — **의도된 동작**이다. 1번의 `try/catch`가 있으면
   폰·모달만 죽고 게임은 돈다
8. **`vendor/`가 없다.** `AGENTS.md` §1·§3은 three.js 동봉을 확정으로 적었는데 디렉터리가
   존재하지 않는다. B 범위 밖이지만 **8/7 동결이 마감**이다. 질문 한 줄

---

## 5. 위험과 완화

| # | 위험 | 완화 |
|---|---|---|
| R1 | A가 fetch·`setVisible`·`pushMap`·mount 주입을 안 함 | mount 인자 `throw`(AC-20) + Step 7-1의 `try/catch`로 폭발 반경 제한 + **8/5 병합 체크리스트: "갈림길 3회 통과, 폰 안내 방향과 실제 정답 통로가 같은지 눈으로 확인"**. `setVisible` 미배선은 Space 한 번에 자기 탐지된다 |
| R2 | **B가 8/5에 생성할 콘텐츠가 오늘 스키마와 어긋남** (초안은 "A가 뽑는 JSON"이라 적었으나 소유자는 B — `AGENTS.md:33`) | **8/5 아침 착수 전** mount 진입부 검증기 투입 + 오늘 스키마를 그대로 붙인 생성 프롬프트를 미리 써 둔다. 오늘 몫은 검증 0단계가 덮는다 |
| R3 | 임시 `TUNING` 수치가 그대로 제출 | 두 파일 각각 단일 블록(개정 AC-18) + 각 블록 첫 줄 짝 주석 + `docs/team-plan.html:219` 8/6 행에 기재 |
| R4 | `dev/`가 제출본에 남음 | 커밋하되 `docs/team-plan.html:220` 8/7 행에 삭제 항목 + 두 파일 상단 주석 |
| R5 | 폰·모달이 A의 HUD·캔버스와 겹침 | z-index 대역 합의 (§0 안건 5) |
| R6 | (위험 아님 — **확정 결정**) `setVisible`의 CSS transition은 짧게 톡 누를 때 남은 거리와 무관하게 전체 시간을 다시 쓴다 | 시안 비교 후 사용자가 감수 (스펙 `:123`). 시간 상수가 `TUNING`에 있어 `setLook` 전환 시 값만 옮기면 된다 |
| R7 | 모달 키 리스너가 `main.js` 입력 라우팅과 겹침 | 모달 생존 기간에만 + 자동 포커스 금지 |
| R8 | `speedMul` 이중 기록자 (A↔B) | §0-B — 퀴즈 전용 채널, 충돌 감속은 world 내부 값으로 곱한다 |
| R9 | 문서 A/B 라벨 반전 | §0-A — 네 곳 중 세 곳 정정, `state.js`는 A가 |
| R10 | `quiz.js` 내부 패널티 중첩 | rAF 누산기 단일화로 자동 해소 (Step 4) |
| R11 | rAF 루프 중복 — `reset()`이 새 루프를 시작하면 문자·카운트다운이 두 배 | **두 파일 모두** mount에서 하나, `destroy`에서 취소, `reset`은 누적치만 0 |
| R12 | 숨은 탭 복귀 시 dt 점프로 카운트다운 즉시 만료 | 두 파일 모두 `Math.min(0.033, …)` |
| R13 | 실콘텐츠가 8/8 영상 촬영까지 안 들어옴 | `content/README.md`에 소유(8/5 B)·기한(8/8 전) 명기 |

---

## 6. 검증 절차

```bash
npx http-server . -p 8080          # AGENTS.md §6 — python -m http.server 쓰지 않는다
```

| 단계 | 확인 | 닫는 AC |
|---|---|---|
| **0** | `node -e "…JSON.parse…"` + `kind`/`choices.length`/`answer` 범위 스크립트 1회 | AC-1, 2, 3 |
| 1 | 하네스 열기 → 에러 카운터 0, `.bm-phone` 노드 존재 | AC-22 |
| 2 | 경과 초로 2.6초 확인. **[문자 1개 추가] 8회**로 8개째에서 첫 번째 소멸 | AC-4, AC-5 |
| 3 | `person`/`notice` 색 구분 + **[길 안내]** 로 `map` 색 | AC-6 |
| 4 | [폰 토글] — 내려갈 때가 올라올 때보다 빠르다 (육안) | AC-7, AC-8 |
| 5 | [게이트 발생] → 모달, 보기 3개, 카운트다운 6→0 | AC-11, 13, 14 |
| **5-b** | **[주입 없이 mount]** → `throw` 잡힘 표시 · **[리셋] 3회 후에도 간격 2.6초** · **[게이트 발생] 3회 후에도 카운트다운이 6→0에 6초** (rAF 중복 없음) | AC-20, AC-23 |
| 6 | 정답 → `gauge` +1 / 오답 → `speedMul` 0.6, 3초 후 1 / 무응답 → 같은 함수 / **오답 직후 다시 오답 → 마지막 시점 기준 3초** | AC-15, 16, 17 |
| 7 | 모달 열림·닫힘에 `quizOpen`이 따라간다 | AC-12 |
| 8 | Step 6의 5종 통과 | AC-9, 19, 21, 24 |
| **8-b** | 아래 grep 0건 · `TUNING` 블록 밖으로 수치가 CSS 변수로만 나감 (육안) | AC-10, AC-18 |

```bash
# 8-b — 진단 문자열은 제외한다. 원칙 2가 한국어 에러 메시지를 요구하기 때문.
# 따옴표 세 종류를 다 본다 — DOM 오버레이는 템플릿 리터럴로 들어갈 확률이 높다
grep -nE "['\"\`][^'\"\`]*[가-힣][^'\"\`]*['\"\`]" src/phone.js src/quiz.js \
  | grep -vE "console\.(log|warn|error|info)|throw new Error"
```

**24개 전부 닫힌다.** 초안은 7개(AC-1·2·3·10·18·20·23)가 열린 채였다.

**오늘 밤 생략:** `destroy()` 구현(하네스는 리로드가 대신한다) · 시크릿 창 재실행(로컬
하네스에서는 값이 없다. `AGENTS.md` §6의 요구는 Pages 확인용이고 그건 8/5다).
**단 R11의 "루프는 mount에서 하나, `reset`은 누적치만 0"은 생략하지 않는다.**

---

## 7. ADR — 접점을 `state.js` import가 아니라 mount 주입으로 받는다

**Decision.** `src/phone.js`·`src/quiz.js`는 `src/state.js`를 import하지 않는다. mount 시
`{ content, state, onGate }`를 주입받고, 인자가 없으면 `throw`한다. 접점 4개의 **이름과 방향은
그대로**이고 거처만 호출 지점으로 옮긴다.

**Drivers.** D2(8/5 기대 불일치) · D1(오늘 밤 시연) · 원칙 1(소유 경계).

**Alternatives considered.**
- *`state.js`를 오늘 B가 채우고 import* — `AGENTS.md` §2 문구와 코드가 문자 그대로 일치하고
  8/5에 A가 할 일이 없다. 그러나 `state.js`는 공동 파일이고 **8/3에 잊혀서 비어 있다.**
  혼자 채우면 그 사실이 기록되지 않고 사라지며, A가 같은 날 AI로 뽑으면 한쪽이 덮인다.
- *import하되 주입 가능하게(기본 인자)* — 규약과 하네스를 둘 다 만족하지만 `state.js`를 오늘
  채워야 하는 것은 같고, 경로가 둘이 되어 "왜 안 움직이지"를 두 군데서 찾게 된다.

**Why chosen.** 되돌리기 비용이 **비대칭**이다 — 주입 → import는 두 모듈 상단에 한 줄씩(5분),
import → 주입은 8/6에 밸런싱 값이 `state.js`에 쌓인 뒤라면 반나절이다. 그리고 `state.js`가
비어 있는 것은 **잊힌 결과**이므로 혼자 메우는 것보다 오늘 밤 안건으로 올리는 편이 팀에 정직하다.

**Consequences.**
- (+) 공동 파일 충돌 위험 0. 하네스에서 시나리오별 상태를 즉시 재현. B의 파일 3개가 A와 안 겹침
- (−) A가 주입을 잊으면 조용히 안 붙는다 → mount `throw`로 시끄럽게 만들었다
- (−) 그 `throw`가 나는 곳은 `main.js`(A 소유)이고 **B는 그 파일을 고칠 수 없다** →
  Step 7-1의 `try/catch`로 폭발 반경을 폰·모달까지 제한했다
- (−) `AGENTS.md` §2 문구와 코드가 어긋난 채 남는다 → 오늘 밤 §0-A 정정 때 함께 처리

**Follow-ups.** ① 오늘 밤 `state.js` export 형태 확정(§0 안건 1) ② import로 전환하기로 하면
두 모듈 상단에 한 줄씩 ③ `AGENTS.md` §2를 실제 구조에 맞게 정정.

---

## 8. 범위 밖 · 남은 열린 질문

**범위 밖 (스펙 Non-Goals 계승):** `src/state.js` 구현 · 실제 콘텐츠 작성 · 밸런싱 수치 확정 ·
`setLook(k)` 경로 · 스크랩/찜/메모장 · 랜덤 페널티 3종 · 실시간 질문 방식 · three.js 동봉 ·
모바일 대응(8/6).

**8/5 아침 첫 항목:** `/ai-log` 승격 + 스펙·계획을 `docs/ai-log/specs/`로 복사 + 스키마 검증기 투입.

**열린 질문:**
1. **모달 중 문자 흐름을 멈출 것인가** — 하네스 토글로 둘 다 보여주고 오늘 밤 고른다
2. **90초가 `quizOpen` 동안 멈추는가 · 실제 런 길이** — §0 안건 6. 질문 4개 × 6초 = 24초(27%)가
   걸려 있고 `game_balance_review.html:633`의 목표 정답률 밴드 계산도 여기 의존한다
3. **`gauge` 상한·하한** (`game_balance_review.html:460`) — 오늘 범위 밖
4. **폰 말풍선의 `from` 렌더** — `<b>발신자</b> 본문`으로 잡았으나 참조 레이아웃이 없다
5. **`vendor/` 미동봉** — Step 7-8

---

## 합의 이력

| 라운드 | 판정 | 주요 반영 |
|---|---|---|
| 초안 | — | 5단계, AC 24개 상속 |
| Architect 1 | REVISE | §2 라벨 반전 · `speedMul` 이중 기록자 · 스트림 타이머 근거 오독 · `reset()` · `kind:"map"` 정적 배치 · `quizOpen` 입력 차단 · 자동 포커스 · `gaugeOnWrong` · 무응답 크기 인자화 |
| Critic 1 | REVISE | AC-7·8·10·17·18·22 문안 개정 · 검증 7개 AC 누락 폐쇄 · Option B 기각 근거 허위 · D2 미달성 · R2 전제 오류 · z-index · `phone.js` `TUNING` |
| Architect 2 | REVISE | §0-C 근거 교체(`9ce58cf` 대조) · 카운트다운 벽시계 → rAF · messages 34 → 12 · AC-10 grep 통과 불가 · `applyPenalty` 중첩 · rAF 수명 · `setVisible` 경고 오탐 · fetch `try/catch` · `state.js` export 형태 · 실제 런 길이 · "다섯 번째 접점" 오류 자인 |
| **Critic 2** | **APPROVED** | dt 상한 · `quiz.js` 루프 수명 · `onGate` 소유자 모호(계획 내부 모순) · §0-A 정정 대상 2곳 누락 + AC-21 충돌 · 90초 정지 여부 · 안건 우선순위 · 실행 순서(하네스 선행) · 오늘 밤 3개 절감 |
