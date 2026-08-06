// 게임 루프, 입력 라우팅, 제한시간, HUD, 결과 화면.
// 담당: A
//
// 이번 단계 범위: world.js 연결 + 좌우 입력 라우팅 + 렌더 루프 + 플레이 타이머 +
// 도착 결과 화면(최종 시간 + 다시 시작) + 폰·퀴즈 마운트(state.quizOpen 연동,
// world의 회전·게이트 안내를 phone.pushMap으로 배선).

import { createWorld } from "./world.js";
import { mountPhone } from "./phone-a.js";
import { mountQuiz } from "./quiz-a.js";
import { state } from "./state.js";

const stage = document.getElementById("stage");

// phone-a.js/quiz-a.js, content/day1-a.json은 B가 만든 실제 구현이다 — 정식
// 이름(phone.js/quiz.js/day1.json)은 아직 주석뿐인 빈 스텁이라 그쪽을 부르면
// 아무것도 못 뜬다. B가 정식 이름으로 옮기면 이 경로 세 곳만 고치면 된다.
const content = await fetch("./content/day1-a.json").then((r) => r.json());
const phone = mountPhone(document.body, { content, state });
const quiz = mountQuiz(document.body, { content, state });

const world = createWorld(stage, {
  // 회전·게이트·공사장·신호등 안내가 새로 뜰 때마다 이벤트 그대로 폰에 넘긴다
  // (휴대폰 이벤트 큐 3단계). event.kind별 문장 조립은 phone.pushMap이 한다
  // — world.js의 onNavHint 주석 참조.
  onNavHint: (event) => phone.pushMap(event),
});

// 회전(방향키 좌우)과 이동(A/D)을 분리해서 라우팅한다 — world.js는 키 이름을
// 몰라도 되게 { turnLeft, turnRight, moveLeft, moveRight }로만 받는다.
const input = {
  turnLeft: false,
  turnRight: false,
  moveLeft: false,
  moveRight: false,
};
const KEY_MAP = {
  arrowleft: "turnLeft",
  arrowright: "turnRight",
  a: "moveLeft",
  d: "moveRight",
};

// 기본은 폰을 보는 자세다 — Space를 누르고 있는 동안만 고개를 들어 정면(길)을
// 본다(prototype과 동일, docs/기획_1차_보완.md). phone.js는 키보드를 안 듣기로
// 했으므로(파일 상단 주석) 이 라우팅도 A(main.js) 몫이다.
addEventListener("keydown", (e) => {
  if (e.key === " ") {
    phone.setVisible(false);
    e.preventDefault();
    return;
  }
  const k = e.key.toLowerCase();
  const field = KEY_MAP[k];
  if (field) {
    input[field] = true;
    e.preventDefault();
  }
});
addEventListener("keyup", (e) => {
  if (e.key === " ") {
    phone.setVisible(true);
    return;
  }
  const k = e.key.toLowerCase();
  const field = KEY_MAP[k];
  if (field) input[field] = false;
});
addEventListener("resize", () => world.resize());

// ── 플레이 시간(타이머) ─────────────────────────────
// elapsed: 경과 시간(초). clearTime: 클리어 순간 확정되는 별도 상태 — 향후 기록
// 저장/최고 기록에 쓰려고 따로 둔다. isPaused(): 퀴즈가 뜬 동안(state.quizOpen)
// 타이머와 이동을 함께 멈춘다.
let elapsed = 0;
let clearTime = null;
function isPaused() {
  return state.quizOpen;
}

function restart() {
  world.reset();
  phone.reset();
  quiz.reset();
  elapsed = 0;
  clearTime = null;
  result.hide();
}

function formatTime(sec) {
  if (sec < 60) return sec.toFixed(1) + "s";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

// ── HUD / 결과 UI (index.html은 그대로 두고 여기서 인라인으로 만든다) ──
const hud = makeHud();
const result = makeResult(restart);
document.body.appendChild(hud.el);
document.body.appendChild(result.el);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  // 퀴즈로 멈췄거나 이미 도착했으면 시간·이동을 멈춘다. 화면은 계속 그린다.
  if (!isPaused() && !world.arrived) {
    elapsed += dt;
    world.update(dt, input);
  }
  world.render();

  // 도착 순간 한 번만 클리어 시간을 확정하고 결과를 띄운다.
  if (world.arrived && clearTime === null) {
    clearTime = elapsed;
    result.show(clearTime, world.hits);
  }

  hud.set(formatTime(elapsed), world.hits);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ── UI 빌더 ────────────────────────────────────────
function makeHud() {
  const el = document.createElement("div");
  el.style.cssText = `
    position:fixed; top:16px; left:16px; z-index:10; pointer-events:none;
    display:flex; gap:14px; align-items:baseline;
    padding:8px 14px; border-radius:10px; background:rgba(27,29,33,0.72); color:#fff;
    font:600 15px -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
  `;
  const time = document.createElement("span");
  time.style.cssText = "font-variant-numeric:tabular-nums; font-size:18px;";
  const hits = document.createElement("span");
  hits.style.cssText = "font-size:13px; color:#cfd4da;";
  el.appendChild(time);
  el.appendChild(hits);
  return {
    el,
    set(t, h) {
      time.textContent = "⏱ " + t;
      hits.textContent = "부딪힘 " + h;
    },
  };
}

function makeResult(onRestart) {
  const el = document.createElement("div");
  el.style.cssText = `
    position:fixed; inset:0; z-index:20; display:none;
    align-items:center; justify-content:center; background:rgba(16,18,20,0.55);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
  `;
  const card = document.createElement("div");
  card.style.cssText = `
    background:#fff; color:#1B1D21; border-radius:16px; padding:28px 40px;
    text-align:center; box-shadow:0 18px 60px rgba(0,0,0,0.35); min-width:260px;
  `;
  const title = document.createElement("div");
  title.textContent = "도착!";
  title.style.cssText = "font-size:20px; font-weight:700; color:#2F6F6B;";
  const big = document.createElement("div");
  big.style.cssText =
    "font-size:52px; font-weight:800; margin:10px 0 2px; font-variant-numeric:tabular-nums;";
  const sub = document.createElement("div");
  sub.style.cssText = "font-size:14px; color:#5C626B; margin-bottom:22px;";
  const btn = document.createElement("button");
  btn.textContent = "다시 시작";
  btn.style.cssText = `
    font-family:inherit; font-size:16px; font-weight:600; color:#fff; cursor:pointer;
    background:#2F6F6B; border:0; padding:11px 28px; border-radius:10px;
  `;
  btn.addEventListener("click", onRestart);
  card.append(title, big, sub, btn);
  el.appendChild(card);
  return {
    el,
    show(sec, hits) {
      big.textContent = formatTime(sec);
      sub.textContent = "부딪힘 " + hits + "회";
      el.style.display = "flex";
    },
    hide() {
      el.style.display = "none";
    },
  };
}
