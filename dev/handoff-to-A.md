# A에게 — 8/5 배선 안내

임시 문서. `dev/`와 함께 **8/7 빌드 동결 전에 지운다.**
`phone.js`·`quiz.js`가 무엇을 기대하는지만 적었다. 배경은 말로.

> **8/5 개정.** 8/4 밤 판은 "먼저 정해야 하는 것 6개"였는데 그중 4개가 그 사이에
> 닫혔다 — `state.js`가 실물로 들어왔고(`746d5eb`), 문서의 A/B 뒤집힘이 정정됐고(`e7ed1ee`),
> 스테이지 길이와 모달 중 시간 정지가 `AGENTS.md` §3에 확정됐다.
> **닫힌 항목은 지우지 않고 아래 「닫힌 것」으로 옮겼다** — 다시 묻지 않기 위해서다.
>
> ⚠️ **뒤집힌 것이 하나 있다.** 8/4 판이 *"오답에 게이지를 깎지 않는다"*고 적었는데
> 8/5에 랜덤 패널티가 되살아나면서 **반대가 됐다.** 아래 「접점 사용 규약」을 보라.

---

## A가 해야 하는 것

### 1. `main.js`의 콘텐츠 로딩

```js
import { state, fireGate } from './state.js';
import { mountPhone } from './phone.js';
import { mountQuiz }  from './quiz.js';

// world 시작이 먼저다. 아래가 실패해도 복도는 돌아야 한다
try {
  const res = await fetch('./content/day1.json');   // ./content/… 이다 (하네스는 ./../)
  if (!res.ok) throw new Error('day1.json ' + res.status);
  const content = await res.json();

  const phone = mountPhone(document.body, { content, state, visible: false });
  const quiz  = mountQuiz(document.body, { content, state });
} catch (e) { console.error('[content]', e); }
```

- `res.ok`가 없으면 404 HTML을 파싱한 SyntaxError가 원인을 안 가리킨다
- `try/catch`가 없으면 **B의 JSON 오타가 A의 3D 복도를 지운다**
- mount는 인자를 못 받으면 **일부러 `throw`한다.** `try/catch`가 있으면 폰·모달만 죽는다

### 2. 갈림길에서 `fireGate()`를 부른다 — 다만 **질문과는 무관하다**

```js
// world.js 또는 main.js — 갈림길 진입 시
fireGate(gateIndex);
```

⚠️ **지금 이걸 듣는 쪽이 없다. 그게 정상이다.**
8/4 판은 `quiz.js`가 `onGate`에 질문을 물려 두었는데, 그러면 질문 수가 맵 구조에 묶여
스테이지마다 달라지고 `docs/기획_1차_보완.md` §질문 이벤트의 **주기 6~8초**가 성립하지 않는다.
**질문은 `quiz.js`가 자기 타이머로 띄운다.** 갈림길과 질문은 관계가 없다.

`onGate`에 남은 소비처는 **길 안내**뿐이고 그건 `AGENTS.md` §3의 **열림** 항목이라
합의 전까지 아무도 등록하지 않는다. `fireGate`는 그냥 부르면 된다 — 콜백이 없어도
예외는 나지 않고, 콜백이 던져도 `fireGate`가 삼킨다.

### 3. `state.quizOpen === true`인 동안 이동·입력을 막는다

`AGENTS.md` §2. B는 값을 세우고 내릴 뿐이다. **시간도 같이 멈춘다** (§3 확정).

### 4. Space 방향 — 프로토타입과 **같다**

**기본이 폰이고, 누르고 있는 동안 정면을 본다.**
`docs/기획_1차_보완.md` §조작이 *"space 눌렀을 때의 동작은 프로토타입과 동일"*이라 적었고,
`prototype/busy-man-prototype.html`은 *"Space를 누르고 있으면 고개를 듭니다"*이다.

> ⚠️ **8/4 판이 이걸 반대로 적었다.** 같은 문서 §조작의 `휴대폰 보기: space`를 방향으로
> 읽은 탓이다 — 그건 그 키가 폰↔정면 전환이라는 **뜻이지 방향이 아니다.**
> `docs/ui-spec.md`에도 같은 뒤집힘이 있었고 8/5에 함께 정정했다.

```js
// main.js — 키 상태가 바뀔 때만 부른다. 매 프레임 부를 필요 없다
if (key === ' ' && down) { pitchTarget = PITCH_TOP;  phone.setVisible(false); }
if (key === ' ' && up)   { pitchTarget = PITCH_REST; phone.setVisible(true);  }
```

- **마운트에 `visible`을 주지 않는다.** 기본값이 `true`이고 게임은 폰을 보며 시작한다.
  `visible: false`로 마운트하면 시작하자마자 폰이 미끄러져 내려가는 게 보인다
- 고개 각도 보간 속도는 프로토타입 값을 그대로 쓴다 — 내릴 때 `1.7 rad/s`, 올릴 때 `2.4 rad/s`.
  폰의 CSS 전환 시간(`.318s` / `.225s`)이 그 값에서 환산된 것이라 어긋나면 따로 논다

### 4-1. 좌우 직선 이동은 A·D다

방향키는 **좌/우회전**이다 (`docs/기획_1차_보완.md` §조작, `AGENTS.md` §3).
하네스는 A·D만 쓴다 — 가짜 복도에 갈림길이 없어 회전할 데가 없다.

글자키는 **`e.code`로 본다.** `e.key`는 자판 배열을 타서 한글 입력 상태에서 A가 `'ㅁ'`으로
들어오고, 그러면 이동이 안 되는데 콘솔에는 아무것도 안 찍혀 원인을 못 찾는다.

### 5. z-index 대역

```
캔버스 0~9  ·  A의 HUD 10~99  ·  B의 폰 100~199  ·  B의 모달 200~299
```

숫자는 임의여도 된다. B는 이미 100/200으로 넣어 뒀다.

---

## B가 export한 것

```js
const phone = mountPhone(root, { content, state, visible: false });
// → { setVisible, pushMessage, pushMap, reset, destroy }

const quiz = mountQuiz(root, { content, state });
// → { reset, destroy }   질문은 자기 주기(6~8초)로 알아서 뜬다
```

| 호출 | 언제 | 비고 |
|---|---|---|
| `phone.setVisible(bool)` | Space 처리에서 | 위 4번 |
| `phone.pushMessage(msg)` | 필요하면 | `{ from, kind, text }` |
| `phone.reset()` / `quiz.reset()` | 결과 화면에서 재시작할 때 | 마운트 시 `visible` 값으로 돌아간다 |
| `phone.pushMap(laneIndex)` | **아직 부르지 않는다** | 아래 |

### `pushMap`은 합의 전까지 부르지 않는다

길 안내 소유권은 `AGENTS.md` §3의 **열림** 항목이다 — 안내 문구는 `content/*.json`(B)인데
갈림길 판정은 `world.js`(A)라 §1의 파일 경계에 걸친다.

수신부는 이미 서 있다(`0=왼쪽 1=가운데 2=오른쪽`). **부르지 않는 한 아무 일도 일어나지 않으므로
코드를 남겨 뒀다.** 합의가 나면 그날 살리거나 지운다. 먼저 이야기하자.

---

## 접점 사용 규약

- **`state.speedMul`은 퀴즈 패널티 전용이다.** 보행자 충돌 감속을 여기 쓰면 두 개의 복귀
  타이머가 서로를 지운다 — 충돌은 `world.js` 내부 값으로 두고
  `SPEED * state.speedMul * collisionMul`로 **곱한다**

- ⚠️ **`state.gauge`는 정답에 +, 오답·타임아웃에 −다.** 8/4 판이 적었던
  *"오답에 게이지를 깎지 않는다"*는 **틀렸다.** 그날은 `AGENTS.md` §3이 패널티를 감속으로
  고정하고 있었는데, 같은 날 늦게 **감속 / 게이지 감소 2종 중 랜덤**으로 되돌아갔다
  (`docs/기획_1차_보완.md` §오답 및 타임아웃 시).
  **기록자는 여전히 B 하나다** — A는 Shift 소비 외에 `gauge`에 쓰지 않는다.

- **`gauge`는 0 아래로 내려가지 않는다.** `quiz.js`가 막는다.
  게이지가 0일 때 감소가 아무 일도 하지 않는 것은 **알고 받아들인 구멍**이고
  (`src/state.js`의 `gauge` 주석), 8/6에 관측한다 → `docs/balance-todo.md` §1.
  **A쪽에서 음수를 방어할 필요는 없다.**

- **가속 중에는 무적이다** (§3 확정). 사람만 밀치고 지나간다.
  속도만 올리면 충돌 확률도 같이 올라 상이 상이 아니게 된다는 것이 채택 사유다
  (`docs/game_balance_review.html` §04③).

---

## 닫힌 것 — 8/4에 물었고 그 뒤에 정해졌다

| 8/4에 물은 것 | 지금 |
|---|---|
| `state.js`가 무엇을 export하는가 | **닫힘.** `746d5eb`에서 실물로 들어왔다. 객체 하나 + `onGate`/`fireGate` |
| `onGate`를 누가 구현하는가 | **닫힘.** `state.js`가 둘 다 내준다. A는 `fireGate`만 부르면 된다 — 다만 듣는 쪽은 지금 없다 (2번) |
| 문서 세 곳의 A/B 뒤집힘 | **닫힘.** `e7ed1ee`에서 정정됐다 |
| 제한시간이 모달 중 멈추는가 | **닫힘.** 멈춘다 (`AGENTS.md` §3). 대화 스트림도 같이 멈춘다 |
| 실제 런 길이가 몇 초인가 | **닫힘.** 스테이지 90~150초, 등급 잠정. 콘텐츠는 상한 150초 기준으로 뽑았다 |
| 카운트다운 | **6초 → 10초** (§3 확정) |

## 콘텐츠 분량

`content/day1.json`은 **문자 58개 · 질문 20문항**이다.

- 문자 58개 = 스트림 2.6초 간격 × 150초. 순환 없이 한 판을 덮는다
- 질문 20문항 = 주기 7초 기준 한 판 분량. **다 쓰면 `quiz.js`가 콘솔에 경고를 찍는다**
- 질문은 전부 문자에 실제로 나온 사실을 묻는다. 근접 숫자를 함정으로 심어 뒀다
  (`203호↔302호`, `NAN-417↔NAN-471`, `4,500원↔5,400원`)
- **보기 순서는 `quiz.js`가 뜰 때마다 섞는다.** JSON의 `answer`가 한 자리에 몰려 있어도
  찍기로 통과할 수 없다 — JSON은 사람이 검토하기 쉬운 자연스러운 순서로 둔 것이다

`node dev/check-content.mjs`로 스키마를 검사한다.

## 열어보는 법

```bash
npx http-server . -p 8080 -c-1
# http://localhost:8080/dev/harness.html
```

⚠️ **`-c-1`이 없으면 고친 `.js`가 한 시간 동안 반영되지 않는다.** `http-server`의 기본값이
`Cache-Control: max-age=3600`이라 "고쳤는데 화면이 안 바뀐다"로 시간을 태운다. 8/5에 겪었다.

하네스는 **실물 `src/state.js`를 import한다.** 8/4 밤에는 더미였는데, 더미로 통과시키면
실제 배선에서만 깨지는 자리가 남기 때문이다. 하네스의 복도·보행자·게이트는 여전히
가짜이고 A의 `world.js`와 무관하다 — **절대 `src/`로 옮기지 않는다.**

`python -m http.server`는 쓰지 말 것 — Windows에서 `.js`를 `text/plain`으로 내보내
브라우저가 ES 모듈 실행을 거부한다.
