// 질문 모달 — 단순 3개·복합 4개 보기, 정오답 처리, 오답 패널티.
// 담당: B
//
// 확정된 것 (AGENTS.md §3):
//   - 모달 방식. 뜨는 동안 이동 정지 + 시간 정지 + 10초 카운트다운
//   - 오답과 타임아웃의 벌은 같다. 감속 / 게이지 감소 2종 중 랜덤
//   - 정답 시 게이지 충전 → A가 Shift로 소비
//
// 8/3 시점의 docs/team-plan.html §02를 가리키고 있던 탓에 6초 카운트다운과
// 감속 고정이 여기 박혀 있었다. 확정 사항의 정본은 AGENTS.md §3 하나다.
//
// 수치는 전부 잠정이다 — 랜덤 비율도 감속량도 게이지 감소량도 정해지지 않았고
// 8/6에 경험으로 잡는다. docs/balance-todo.md
//
// 룰렛·카드 뽑기 연출은 아직 보류다. 지금은 어느 쪽이 걸렸는지 결과만 적는다.
//
// state.js 를 import 하지 않는다. 이유는 phone.js 와 같다.
//
// **질문은 주기로 뜬다. 갈림길과 아무 관계가 없다** (docs/기획_1차_보완.md §질문 이벤트 —
// "주기를 가짐 6초~8초"). 8/4 판은 onGate 에 물려 갈림길마다 띄웠는데, 그러면 질문 수가
// 맵 구조에 묶여 스테이지마다 달라지고 주기 6~8초가 성립하지 않는다.
// state.onGate 는 갈림길 신호이지 질문 신호가 아니다 — 지금 그것을 듣는 쪽은 없다(§4-1 참조).
//
// 생김새는 docs/ui-spec.md 다. 「문제 상자」가 아니라 **폰**이어야 한다 —
// 질문이 수신 문자로 읽히지 않으면 대화를 기억하는 게임이라는 것이 전달되지 않는다.

import { prepareContentSession } from './content-session.mjs';
import { advanceAskTimer, selectEligibleQuiz } from './quiz-eligibility.mjs';

// ── 8/6 밸런싱에서 이 블록만 손댄다. 짝: src/phone.js 의 TUNING ──────────────
const TUNING = {
  countdownSec:   10,    // AGENTS.md §3 확정 — 밸런싱 대상 아님

  // 질문이 도착하는 주기. 매번 이 사이에서 새로 뽑는다 — 고정 간격이면 다음 질문이 언제
  // 올지 세게 되고, 그러면 문자를 읽는 대신 초를 센다.
  askMinSec:      6,
  askMaxSec:      8,

  gaugeOnCorrect: +1,

  // 오답·타임아웃은 아래 2종 중 하나가 랜덤으로 걸린다 (AGENTS.md §3, 등급 잠정).
  // slowChance 가 balance-todo.md §1 의 `r` 이다. 반반에서 시작할지조차 정해진 적이
  // 없어서 0.5 로 둔다 — 근거가 있는 값이 아니라 시작점이다.
  slowChance:     0.5,
  slowMul:        0.6,   // 걸렸을 때의 state.speedMul
  slowSeconds:    3,
  gaugeOnWrong:   1      // 걸렸을 때 깎는 칸 수
};

// 숨은 탭에서 rAF 가 멈춘 뒤 복귀하면 첫 프레임의 dt 가 통째로 점프한다.
// 상한이 없으면 카운트다운이 돌아오자마자 만료된다.
const DT_MAX = 0.033;

// 무응답과 오답의 벌은 같다. game_balance_review.html §05 는 무응답을 오답의 0.2~0.4 로
// 작게 두라고 계산해 뒀지만 그 권고는 따르지 않기로 했다 (AGENTS.md §3) —
// 규칙이 단순하고, 찍기 쪽으로 기우는지는 8/6에 본다.

let styleInjected = false;

/**
 * @param {HTMLElement} root
 * @param {{ content: object, state: object }} opts
 */
export function mountQuiz(root, opts) {
  if (!opts || !opts.content || !opts.state) {
    throw new Error('mountQuiz: main.js에서 fetch("./content/day1.json") 후 { content, state } 로 넘길 것');
  }

  const { content, state } = opts;
  const host = root || document.body;
  let session = prepareContentSession(content);

  validateContent(session, content);
  injectStyle();

  let askedIds = new Set();
  let countdownLeft = 0;    // > 0 이면 모달이 떠 있다
  let penaltyLeft = 0;      // > 0 이면 감속 중
  let current = null;       // { quiz, el, timerEl }
  let askLeft = nextGap();  // 0이면 주기는 끝났고, 근거 문자 자격만 기다린다
  let exhausted = false;    // 풀을 다 쓴 뒤 경고를 매 주기 찍지 않으려고 둔다
  let phoneActiveTime = 0;
  let sourceRenderedAt = new Map();
  let last = performance.now();
  let raf = requestAnimationFrame(tick);

  // phone.js 와 quiz.js 가 캐시 무력화 쿼리로 서로 다른 모듈 인스턴스가 되어도,
  // 실제 DOM에 붙은 스트림의 시간선 하나만 읽는다.
  function onPhoneTimeline(event) {
    const timeline = event.detail;
    if (!timeline) return;
    phoneActiveTime = timeline.activeTime;
    sourceRenderedAt = new Map(timeline.renderedAt);
  }
  document.addEventListener('bm:phone-timeline', onPhoneTimeline);
  document.addEventListener('keydown', onKeyDown);

  // 카운트다운과 감속 복귀를 같은 누산기로 센다.
  // setTimeout 을 섞으면 한 파일에 시간 소스가 둘이 되고, 탭을 나간 사이
  // 감속만 벽시계로 흘러 정지한 게임 위에서 소멸한다.
  function tick(now) {
    const dt = Math.min(DT_MAX, (now - last) / 1000);
    last = now;

    if (countdownLeft > 0) {
      countdownLeft -= dt;
      if (countdownLeft <= 0) {
        countdownLeft = 0;
        judge(-1);                     // 무응답
      } else if (current) {
        current.timerEl.textContent = countdownLeft.toFixed(1);
      }
    } else {
      // 모달이 떠 있는 동안에는 다음 질문까지의 시간이 흐르지 않는다. 답하는 데 쓴 10초가
      // 주기에 포함되면 모달이 닫히자마자 다음 질문이 뜨는 구간이 생긴다.
      askLeft = advanceAskTimer(askLeft, dt);
      if (askLeft === 0) openNext();
    }

    // 재대입만으로 중첩이 풀린다. 타이머 핸들을 들고 있으면 오답 직후 무응답에서
    // 먼저 걸린 타이머가 두 번째 패널티를 조기 해제한다.
    if (penaltyLeft > 0) {
      penaltyLeft -= dt;
      if (penaltyLeft <= 0) {
        penaltyLeft = 0;
        state.speedMul = 1;
      }
    }

    raf = requestAnimationFrame(tick);
  }

  function nextGap() {
    return TUNING.askMinSec + Math.random() * (TUNING.askMaxSec - TUNING.askMinSec);
  }

  function openNext() {
    if (current) return;                       // 이미 떠 있으면 무시
    if (askedIds.size >= session.quizzes.length) {
      if (!exhausted) {
        exhausted = true;
        console.warn('[quiz] 이번 판 질문 ' + session.quizzes.length + '개를 다 썼습니다');
      }
      return;
    }
    const source = selectEligibleQuiz(
      session.quizzes,
      sourceRenderedAt,
      askedIds,
      phoneActiveTime
    );
    if (!source) return;
    askedIds.add(source.id);
    open(source);
  }

  function open(source) {
    // 보기 순서는 뜰 때마다 섞는다. JSON 쪽에서 정답 위치를 흩어 놓는 방법도 있지만
    // 그건 한 판 안에서만 고르고 다시 하면 같은 자리라 외우면 그만이다.
    // 섞어 두면 콘텐츠를 쓸 때 보기를 자연스러운 순서(시각순·오름차순)로 둘 수 있어
    // 사람이 정답을 눈으로 검토하기도 쉬워진다.
    const quiz = shuffleChoices(source);
    const el = buildModal(quiz, content);
    host.appendChild(el);

    // 이 줄이 없으면 브라우저가 「붙였다」와 「클래스를 뗐다」를 한 프레임에 계산해
    // 전환이 아예 돌지 않는다. 폰이 올라오는 것이 아니라 그냥 나타난다.
    void el.offsetWidth;
    el.classList.remove('bm-quiz-enter');

    current = { quiz, el, timerEl: el.querySelector('.bm-quiz-timer') };
    countdownLeft = TUNING.countdownSec;
    state.quizOpen = true;
  }

  function onKeyDown(event) {
    const picked = Number(event.key) - 1;
    if (!current || !Number.isInteger(picked) || picked < 0 || picked >= current.quiz.choices.length) return;
    event.preventDefault();
    judge(picked);
  }

  // picked === -1 이면 무응답. 오답과 같은 경로를 타고 벌도 같다.
  function judge(picked) {
    if (!current) return;
    const { quiz, el } = current;
    const correct = picked === quiz.answer;

    let penaltyKind = null;
    if (correct) {
      state.gauge += TUNING.gaugeOnCorrect;
    } else {
      penaltyKind = applyPenalty();
    }

    countdownLeft = 0;
    if (picked >= 0) {
      const pickedButton = el.querySelectorAll('.bm-quiz-choice')[picked];
      if (pickedButton) pickedButton.classList.add('bm-quiz-picked');
    }
    showResult(el, content, correct, picked === -1, penaltyKind);
    close(el);
  }

  // 감속 / 게이지 감소 2종 중 랜덤 (AGENTS.md §3). 어느 쪽이 걸렸는지 돌려준다 —
  // 룰렛·카드 연출이 보류라 모달에 글자로 적는 것이 유일한 전달 수단이다.
  function applyPenalty() {
    if (Math.random() < TUNING.slowChance) {
      state.speedMul = TUNING.slowMul;
      penaltyLeft = TUNING.slowSeconds;
      return 'slow';
    }

    // 0 에서 멈춘다. state.js 의 gauge 주석이 말하는 "게이지가 0이면 감소가 아무 일도
    // 하지 않는다" 가 성립하려면 여기서 막아야 한다 — 음수로 내려가면 그 뒤 정답 한 번이
    // 게이지를 못 올리므로 벌이 오히려 커지고, A 의 Shift 소비 쪽도 음수를 안 본다.
    // 못하는 플레이어일수록 오답이 저렴해지는 역상관은 알고 받아들인 것이고,
    // 실제로 관측되는지는 8/6에 본다 (docs/balance-todo.md §1).
    state.gauge = Math.max(0, state.gauge - TUNING.gaugeOnWrong);
    return 'gauge';
  }

  function close(el) {
    current = null;
    // 다음 간격은 결과 판정으로 모달이 닫힌 뒤부터 새로 잰다. 자격 대기로 이미
    // 끝난 간격을 다시 뽑으면, 근거를 충분히 본 뒤에도 한 번 더 기다리게 된다.
    askLeft = nextGap();
    // 판정 결과를 잠깐 보여주고 내려보낸다. 즉시 사라지면 맞았는지 모른다.
    setTimeout(() => {
      el.classList.add('bm-quiz-enter');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
        // 모달이 완전히 사라진 뒤 게임 재개
        state.quizOpen = false;
      }, 260);
    }, 900);
  }

  function reset() {
    if (current && current.el.parentNode) current.el.parentNode.removeChild(current.el);
    current = null;
    session = prepareContentSession(content);
    askedIds = new Set();
    exhausted = false;
    askLeft = nextGap();
    countdownLeft = 0;
    penaltyLeft = 0;
    phoneActiveTime = 0;
    sourceRenderedAt = new Map();
    state.quizOpen = false;
    state.speedMul = 1;
  }

  function destroy() {
    cancelAnimationFrame(raf);
    document.removeEventListener('bm:phone-timeline', onPhoneTimeline);
    document.removeEventListener('keydown', onKeyDown);
    reset();
  }

  return { reset, destroy };
}

// ── 내부 ────────────────────────────────────────────────────────────────────

// 원본을 건드리지 않고 섞인 사본을 만든다. 세션 quizzes 를 제자리에서 섞으면
// reset() 뒤에 같은 판을 다시 돌릴 때 원래 순서가 이미 사라져 있다.
function shuffleChoices(quiz) {
  const order = quiz.choices.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    difficulty: quiz.difficulty,
    sender: quiz.sender,
    prompt: quiz.prompt,
    choices: order.map((i) => quiz.choices[i]),
    answer: order.indexOf(quiz.answer)
  };
}

// 스키마가 어긋나면 화면에는 모달이 안 뜨는 것으로만 보인다. 어디가 틀렸는지 말해 준다.
function validateContent(session, content) {
  if (!Array.isArray(session.quizzes) || session.quizzes.length === 0) {
    console.error('[quiz] session.quizzes 가 비어 있습니다');
    return;
  }
  const messageIds = new Set(session.messages.map((message) => message.id));
  session.quizzes.forEach((q, i) => {
    const expectedChoices = q.difficulty === 'complex' ? 4 : 3;
    if (!Array.isArray(q.choices) || q.choices.length !== expectedChoices) {
      console.error('[quiz] quizzes[' + i + '].choices 는 ' + expectedChoices + '개여야 합니다:', q.choices);
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= expectedChoices) {
      console.error('[quiz] quizzes[' + i + '].answer 는 0..' + (expectedChoices - 1) + ' 이어야 합니다:', q.answer);
    }
    if (typeof q.sender !== 'string' || !q.sender) {
      console.error('[quiz] quizzes[' + i + '].sender 가 없습니다:', q.sender);
    }
    if (typeof q.sourceMessageId !== 'string' || !messageIds.has(q.sourceMessageId)) {
      throw new Error('[quiz] quizzes[' + i + '].sourceMessageId 가 이번 판 메시지에 없습니다: ' + q.sourceMessageId);
    }
  });
  ['correct', 'wrong', 'timeout', 'penaltySlow', 'penaltyGauge'].forEach((k) => {
    if (!content.feedback || !content.feedback[k]) {
      console.error('[quiz] content.feedback.' + k + ' 가 없습니다');
    }
  });
}

// docs/ui-spec.md 의 구성 — 위에서 아래로
//   상태바(시계 · 카운트다운) / 수신 말풍선 / 장식 입력란 / 보기 3~4개
function buildModal(quiz, content) {
  const el = document.createElement('div');
  // 붙일 때는 화면 밖에 있다. 붙인 뒤에 이 클래스를 떼면 위로 올라온다.
  el.className = 'bm-quiz bm-quiz-enter';

  const phone = document.createElement('div');
  phone.className = 'bm-quiz-phone';

  const bar = document.createElement('div');
  bar.className = 'bm-quiz-bar';
  const clock = document.createElement('span');
  // 연출용 시계다. 스테이지 남은 시간이 아니다 (docs/ui-spec.md).
  clock.textContent = (content.chrome && content.chrome.clock) || '';
  const timer = document.createElement('span');
  timer.className = 'bm-quiz-timer';
  timer.textContent = TUNING.countdownSec.toFixed(1);
  bar.appendChild(clock);
  bar.appendChild(timer);

  const rule = document.createElement('div');
  rule.className = 'bm-quiz-rule';

  const body = document.createElement('div');
  body.className = 'bm-quiz-body';

  // 질문은 문제 상자가 아니라 **수신 말풍선**이다.
  const sender = document.createElement('div');
  sender.className = 'bm-quiz-sender';
  sender.textContent = quiz.sender;
  const ask = document.createElement('div');
  ask.className = 'bm-quiz-ask';
  ask.textContent = quiz.prompt;

  // 장식이다. 실제로 타이핑하지 않는다 — 답장하는 화면으로 읽히게 하는 것이 전부다.
  const compose = document.createElement('div');
  compose.className = 'bm-quiz-compose';
  const field = document.createElement('div');
  field.className = 'bm-quiz-field';
  const send = document.createElement('div');
  send.className = 'bm-quiz-send';
  send.textContent = '↵';
  compose.appendChild(field);
  compose.appendChild(send);

  const choices = document.createElement('div');
  choices.className = 'bm-quiz-choices';
  quiz.choices.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = 'bm-quiz-choice';
    btn.type = 'button';
    // textContent 로만 넣는다. 콘텐츠가 AI 생성물이라 마크업이 섞여 들어올 수 있다.
    const number = document.createElement('span');
    number.className = 'bm-quiz-choice-number';
    number.textContent = String(i + 1);
    const reply = document.createElement('span');
    reply.className = 'bm-quiz-choice-text';
    reply.textContent = text;
    btn.appendChild(number);
    btn.appendChild(reply);
    choices.appendChild(btn);
    // 보기의 순서와 단축키만 맞춘다. 마우스로 답을 고르면 앞을 보지 않아도 되므로,
    // 선택은 모달이 열린 동안의 숫자키로만 받는다.
  });

  body.appendChild(sender);
  body.appendChild(ask);
  body.appendChild(compose);
  body.appendChild(choices);

  phone.appendChild(bar);
  phone.appendChild(rule);
  phone.appendChild(body);
  el.appendChild(phone);
  return el;
}

function showResult(el, content, correct, timedOut, penaltyKind) {
  const line = document.createElement('div');
  line.className = 'bm-quiz-result ' + (correct ? 'bm-ok' : 'bm-no');

  let text = correct ? content.feedback.correct
           : timedOut ? content.feedback.timeout
           : content.feedback.wrong;
  // 어느 패널티가 걸렸는지 여기서만 알 수 있다. 룰렛·카드 연출이 보류이기 때문이다.
  if (penaltyKind) {
    text += ' — ' + (penaltyKind === 'slow' ? content.feedback.penaltySlow
                                            : content.feedback.penaltyGauge);
  }
  line.textContent = text;

  el.querySelector('.bm-quiz-body').appendChild(line);
  // 판정 뒤에 다시 누르면 두 번 채점된다. 실제로는 judge 가 current 로 막지만,
  // 눌리는 것처럼 보이는 것 자체가 오해를 만든다.
  el.querySelectorAll('.bm-quiz-choice').forEach((b) => { b.disabled = true; });
}

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;

  const css = `
.bm-quiz{
  position:fixed; inset:0; z-index:200;          /* 대역: 캔버스 0~9 / HUD 10~99 / 폰 100~199 / 모달 200~299 */
  display:flex; align-items:center; justify-content:center;
  background:rgba(20,24,30,.42);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
  transition:background .26s linear;
}
/* 세로로 길어야 폰으로 읽힌다. 내용에 맞춰 높이가 줄면 카드가 되고,
   그러면 「문자에 답장한다」가 아니라 「문제를 푼다」로 보인다.
   9:16 근처를 잡되 vh 를 넘지 않게 한다 — 노트북 화면에서 잘리면 보기가 안 보인다. */
.bm-quiz-phone{
  /* 기존 크기: width:min(330px,86vw); height:min(620px,86vh); */
  width:min(320px,84vw); height:min(520px,78vh);
  display:flex; flex-direction:column;
  background:#FBFCFD; border-radius:22px; overflow:hidden;
  box-shadow:0 0 0 8px #20242A, 0 18px 44px rgba(20,24,30,.34);
  will-change:transform;
  transition:transform .26s cubic-bezier(.16,.84,.44,1);
}
/* 등장은 화면 바깥에서 위로. 페이드인이 아니다 —
   문자가 도착해서 폰을 들어 올리는 동작으로 읽혀야 한다 (docs/ui-spec.md §등장) */
.bm-quiz-enter{ background:rgba(20,24,30,0) }
.bm-quiz-enter .bm-quiz-phone{ transform:translateY(calc(50vh + 100%)) }

.bm-quiz-bar{
  display:flex; justify-content:space-between; align-items:center; padding:12px 16px 0;
  font:11px ui-monospace,SFMono-Regular,Menlo,monospace; color:#8A9099;
}
.bm-quiz-timer{
  padding:2px 8px; border-radius:999px; background:#F6E7EB; color:#A3324A;
  font-weight:600; font-variant-numeric:tabular-nums;
}
.bm-quiz-rule{ height:1px; background:#E6E9ED; margin:9px 14px 0 }
/* 질문은 위, 답장 후보는 아래. 실제 대화창의 배치이고, 길어진 높이가 그 사이를 벌린다 */
.bm-quiz-body{ padding:14px; flex:1; display:flex; flex-direction:column; min-height:0 }

/* 수신 말풍선. phone.js 의 .bm-person 과 같은 언어여야 한 대의 폰으로 읽힌다 */
.bm-quiz-ask{
  background:#F1F3F6; color:#2A2F36; border-radius:9px; padding:11px 13px;
  font-size:13.5px; line-height:20px; font-weight:600; word-break:break-all;
}
.bm-quiz-sender{
  margin:0 0 5px 4px; color:#69717C; font-size:11px; font-weight:650;
}
.bm-quiz-compose{
  display:flex; align-items:center; gap:8px; margin:12px 0 12px;
  margin-top:auto;                               /* 질문과 답장 후보 사이를 벌려 아래로 붙인다 */
}
.bm-quiz-field{
  flex:1; height:28px; border-radius:999px; background:#fff; border:1px solid #DFE3E8;
}
.bm-quiz-send{
  width:28px; height:28px; border-radius:999px; background:#2F6F6B; color:#fff;
  display:flex; align-items:center; justify-content:center; font-size:13px;
}
.bm-quiz-choice{
  display:flex; align-items:center; gap:10px; width:100%; text-align:left; margin-bottom:7px;
  padding:10px 13px; font:inherit; font-size:13px; color:#2A2F36;
  background:#fff; border:1px solid #D3D8DE; border-left:3px solid #2F6F6B;
  border-radius:8px; cursor:default; pointer-events:none;
}
.bm-quiz-choice-number{
  flex:0 0 20px; height:20px; border-radius:50%; background:#E6F0EF; color:#2F6F6B;
  display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;
}
.bm-quiz-choice-text{ flex:1; min-width:0; }
.bm-quiz-choice.bm-quiz-picked{
  transform:translateY(1px); background:#E8EBEF; border-color:#8A9099;
  box-shadow:inset 0 2px 4px rgba(42,47,54,.18);
}
.bm-quiz-choice.bm-quiz-picked:disabled{ opacity:1; }
.bm-quiz-choice:disabled{ cursor:default; opacity:.55 }
.bm-quiz-result{
  margin-top:10px; font-size:13px; font-weight:640; text-align:center;
}
.bm-quiz-result.bm-ok{ color:#2F6F6B }
.bm-quiz-result.bm-no{ color:#A3324A }`;

  const tag = document.createElement('style');
  tag.textContent = css;
  document.head.appendChild(tag);
}
