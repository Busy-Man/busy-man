// 폰 레이어 — 폰 UI, 대화 스트림(사람·알림·길안내 색 구분, 흐름 속도).
// 담당: B
//
// state.js 를 import 하지 않는다. mount 할 때 주입받는다 —
// state.js 는 공동 소유 파일이라 어느 쪽이 언제 무엇을 넣었는지가 호출부에 보여야 한다.
// 되돌리기 비용도 한쪽으로만 싸다: 주입 → import 는 이 줄 위에 import 한 줄이면 된다.
//
// 키보드를 듣지 않는다. 입력 라우팅은 main.js(A) 담당이고,
// 둘이 같은 키를 들으면 8/5 병합일에 서로를 덮는다.
//
// 생김새와 규칙은 docs/ui-spec.md §대화 스트림 폰 이다.

// ── 8/6 밸런싱에서 이 블록만 손댄다. 짝: src/quiz.js 의 TUNING ──────────────
// 블록 밖으로는 CSS 변수로만 나간다. 값이 코드에 흩어지면 그날 파일을 통째로 읽어야 한다.
const TUNING = {
  streamSec:  2.6,     // 문자 간격
  maxBubbles: 7,       // 말풍선 상한. 넘으면 오래된 것부터 사라진다
  travelPx:   436,     // 숨을 때 내려가는 거리 (폰 높이 396 + 화면 밖 여유 40)
  durAwaySec: 0.225,   // 프로토타입의 고개 드는 속도 2.4rad/s 를 폰 구간 0.54rad 로 환산
  durBackSec: 0.318,   // 같은 방식, 내리는 속도 1.7rad/s. 올라올 때가 더 느린 것이 원본이다
  blurPx:     7,
  dimAlpha:   0.35
};

// rAF 는 숨은 탭에서 호출되지 않는다. 복귀 시 첫 프레임의 시각이 통째로 점프하므로
// 상한을 걸지 않으면 이탈한 시간 전체가 한 프레임에 누적된다.
const DT_MAX = 0.033;

const KINDS = ['person', 'notice', 'map'];

let styleInjected = false;
// 퀴즈는 이 기록만 읽는다. 실제 말풍선이 붙은 뒤에 적으므로, 콘텐츠 순서나
// 스케줄 예정 시각으로 퀴즈를 앞당기는 길이 생기지 않는다.
let activeTime = 0;
let renderedAt = new Map();

// quiz.js 를 서로 다른 캐시 버전으로 불러와도 ES 모듈 인스턴스가 갈라지지 않게
// DOM 이벤트로 시간선을 건넨다. state.js 접점이 아니라 B 내부 UI 전달이다.
function publishTimeline(reset = false) {
  document.dispatchEvent(new CustomEvent('bm:phone-timeline', {
    detail: { activeTime, renderedAt, reset }
  }));
}

/**
 * @param {HTMLElement} root
 * @param {{ content: object, state: object, visible?: boolean }} opts
 */
export function mountPhone(root, opts) {
  // 주입을 안 받으면 아무 일도 안 일어나고, 그 실패는 8/5에 발견된다.
  if (!opts || !opts.content || !opts.state) {
    throw new Error('mountPhone: main.js에서 fetch("./content/day1.json") 후 { content, state } 로 넘길 것');
  }

  const { content, state } = opts;
  // 시작 상태. 기본이 폰이고 Space 를 눌러야 정면을 보는 조작이므로(docs/기획_1차_보완.md
  // — "space 눌렀을 때의 동작은 프로토타입과 동일") 기본값은 true 다.
  // 마운트 뒤에 setVisible() 로 맞추면 시작하자마자 폰이 한 번 미끄러지는 게 보인다.
  const initialVisible = opts.visible !== false;

  validateContent(content);
  injectStyle();

  const el = buildPhone(content.chrome);
  el.style.setProperty('--bm-travel', TUNING.travelPx + 'px');
  el.style.setProperty('--bm-dur-away', TUNING.durAwaySec + 's');
  el.style.setProperty('--bm-dur-back', TUNING.durBackSec + 's');
  el.style.setProperty('--bm-blur', TUNING.blurPx + 'px');
  el.style.setProperty('--bm-dim', String(TUNING.dimAlpha));
  // append 전에 클래스를 붙인다. 붙이고 나서 바꾸면 첫 프레임에 전환이 한 번 돈다.
  if (!initialVisible) el.classList.add('bm-away');
  (root || document.body).appendChild(el);

  const stream = el.querySelector('.bm-phone-stream');

  let acc = 0;          // 마지막 문자 이후 누적 시간
  let idx = 0;          // content.messages 순회 위치. 소진되면 순환한다
  let last = performance.now();
  let raf = 0;
  activeTime = 0;
  renderedAt = new Map();
  publishTimeline(true);

  // 루프는 여기서 한 번만 시작한다. reset() 이 다시 시작하면 루프가 둘이 되어
  // 문자가 두 배 속도로 흐르는데, 화면상으로는 조금 빠른 정도로만 보여서 못 잡는다.
  raf = requestAnimationFrame(tick);

  function tick(now) {
    const dt = Math.min(DT_MAX, (now - last) / 1000);
    last = now;   // 건너뛰는 프레임에서도 갱신한다. 안 하면 모달이 닫히는 순간
                  // 그동안의 시간이 한꺼번에 들어와 문자가 쏟아진다.

    // 모달이 뜬 동안 스트림은 멈춘다. 모달 중에는 시간이 멈추므로(AGENTS.md §3) 문자만
    // 흐르면 답하는 사이에 놓치는 문자가 생기고, 그건 기억력 테스트가 아니라 벌이 된다.
    //
    // 이 스킵은 스트림에만 적용한다. 퀴즈 카운트다운에 적용하면 영원히 안 준다.
    if (!state.quizOpen) {
      activeTime += dt;
      acc += dt;
      if (acc >= TUNING.streamSec) {
        acc = 0;
        const messageIndex = idx++ % content.messages.length;
        pushMessage(content.messages[messageIndex]);
        // 같은 메시지가 스트림 순환으로 다시 나와도 최초 관찰 시각을 보존한다.
        // 이미 본 근거를 다시 흘렸다고 퀴즈 대기 시간이 늘어나면 안 된다.
        if (!renderedAt.has(messageIndex)) renderedAt.set(messageIndex, activeTime);
      }
      publishTimeline();
    }
    raf = requestAnimationFrame(tick);
  }

  function setVisible(visible) {
    el.classList.toggle('bm-away', !visible);
  }

  function pushMessage(msg) {
    stream.appendChild(buildBubble(msg));
    while (stream.children.length > TUNING.maxBubbles) {
      stream.removeChild(stream.firstChild);
    }
  }

  // 길 안내 소유권은 AGENTS.md §3 의 「열림」 항목이었다(안내 문구는 content/*.json(B),
  // 갈림길 판정은 world.js(A)라 §1 의 파일 경계에 걸쳤다) — main.js가 onNavHint를
  // pushMap으로 배선하면서 합의됐다.
  //
  // world.js의 onNavHint는 { kind, lane|door, ... } 형태의 이벤트 객체를 그대로 넘긴다.
  // 어느 통로가 맞는지는 매 판 달라지고 world.js만 알므로, 문장 조립은 여기서 한다.
  function pushMap(event) {
    const names = content.laneNames;

    let text = '';

    switch (event.kind) {
      case 'turn':
        text = `${names[event.lane] === '오른쪽' ? '우회전' : names[event.lane] === '왼쪽' ? '좌회전' : '직진'}`;
        break;

      case 'gate':
        text = `${names[event.door]}`;
        break;

      case 'construction':
        text = `주의! ${names[event.lane]} 공사 중`;
        break;

      case 'traffic':
        text = `${names[event.lane]} 안전 차선을 이용하세요.`;
        break;

      default:
        return;
    }

    pushMessage({
      from: null,
      kind: 'map',
      text,
    });
  }

  function reset() {
    while (stream.firstChild) stream.removeChild(stream.firstChild);
    acc = 0;
    idx = 0;
    activeTime = 0;
    renderedAt = new Map();
    publishTimeline(true);
    setVisible(initialVisible);   // 시작 상태로 되돌린다. 여기서 true 를 박으면
  }                               // Space 로 폰을 여는 조작에서 재시작마다 폰이 떠 있다

  function destroy() {
    cancelAnimationFrame(raf);
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  return { setVisible, pushMessage, pushMap, reset, destroy };
}

// ── 내부 ────────────────────────────────────────────────────────────────────

// 스키마가 어긋나면 화면에는 문자가 안 뜨는 것으로만 보인다. 어디가 틀렸는지 말해 준다.
function validateContent(content) {
  if (!Array.isArray(content.messages) || content.messages.length === 0) {
    console.error('[phone] content.messages 가 비어 있습니다');
    return;
  }
  content.messages.forEach((m, i) => {
    if (!KINDS.includes(m.kind)) {
      console.error('[phone] messages[' + i + '].kind 가 person/notice/map 이 아닙니다:', m.kind);
    }
  });
}

function buildPhone(chrome) {
  const el = document.createElement('div');
  el.className = 'bm-phone';

  const bar = document.createElement('div');
  bar.className = 'bm-phone-bar';
  const clock = document.createElement('span');
  const channel = document.createElement('span');
  // 시계·채널명도 콘텐츠에서 온다. 컨셉이 바뀌면 이 두 글자도 같이 바뀐다.
  clock.textContent = (chrome && chrome.clock) || '';
  channel.textContent = (chrome && chrome.channel) || '';
  bar.appendChild(clock);
  bar.appendChild(channel);

  const rule = document.createElement('div');
  rule.className = 'bm-phone-rule';

  const stream = document.createElement('div');
  stream.className = 'bm-phone-stream';

  el.appendChild(bar);
  el.appendChild(rule);
  el.appendChild(stream);
  return el;
}

function resolveTone(kind) {
  return KINDS.includes(kind) ? kind : 'person';
}

function buildBubble(msg) {
  const b = document.createElement('div');
  b.className = 'bm-msg bm-' + resolveTone(msg.kind);
  if (msg.from) {
    const who = document.createElement('b');
    who.textContent = msg.from;
    b.appendChild(who);
    b.appendChild(document.createTextNode(' '));
  }
  // textContent 로만 넣는다. 콘텐츠가 AI 생성물이라 마크업이 섞여 들어올 수 있다.
  b.appendChild(document.createTextNode(msg.text));
  return b;
}

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;

  const css = `
.bm-phone{
  position:fixed; left:50%; bottom:14px; width:292px; height:396px; margin-left:-146px;
  z-index:100;                                   /* 대역: 캔버스 0~9 / HUD 10~99 / 폰 100~199 / 모달 200~299 */
  background:#FBFCFD; border-radius:15px; overflow:hidden;
  box-shadow:0 0 0 8px #20242A, 0 -6px 22px rgba(20,24,30,.18);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
  will-change:transform,filter,opacity;
  transition:transform var(--bm-dur-back) linear,
             filter    var(--bm-dur-back) linear,
             opacity   var(--bm-dur-back) linear;
}
.bm-phone.bm-away{
  transform:translateY(var(--bm-travel));
  filter:blur(var(--bm-blur));
  opacity:var(--bm-dim);
  transition-duration:var(--bm-dur-away);
  pointer-events:none;                           /* 내려간 폰이 뒤쪽 클릭을 삼키지 않게 */
}
.bm-phone-bar{
  display:flex; justify-content:space-between; padding:12px 16px 0;
  font:11px ui-monospace,SFMono-Regular,Menlo,monospace; color:#8A9099;
}
.bm-phone-rule{ height:1px; background:#E6E9ED; margin:9px 14px 0 }
.bm-phone-stream{ padding:14px }
.bm-msg{
  border-radius:9px; padding:7px 12px; margin-bottom:8px;
  font-size:12.5px; line-height:19px; word-break:break-all;
}
.bm-msg b{ font-weight:600 }
.bm-person{ background:#F1F3F6; color:#4A5058 }
.bm-notice{ background:#F4F1EC; color:#6B5F4C }
.bm-map{
  background:#E3F0EE; color:#1E4F4B; font-weight:600; font-size:13.5px;
  border-left:3px solid #2F6F6B; padding-left:9px;
}`;

  const tag = document.createElement('style');
  tag.textContent = css;
  document.head.appendChild(tag);
}
