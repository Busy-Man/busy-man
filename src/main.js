// 게임 루프, 입력 라우팅, 제한시간, HUD, 결과 화면.
// 담당: A
//
// 이번 단계 범위: world.js 연결 + 좌우 입력 라우팅 + 렌더 루프 + 플레이 타이머 +
// 도착 결과 화면(최종 시간 + 다시 시작) + 폰·퀴즈 마운트(state.quizOpen 연동,
// world의 회전·게이트 안내를 phone.pushMap으로 배선).

import { createWorld } from "./world.js";
import { mountPhone } from "./phone.js";
import { mountQuiz } from "./quiz.js";
import { state } from "./state.js";

const stage = document.getElementById("stage");

const content = await fetch("./content/day1.json").then((r) => r.json());
const phone = mountPhone(document.body, { content, state });
let quiz = mountQuiz(document.body, { content, state });

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
  boost: false,
};
const KEY_MAP = {
  arrowleft: "turnLeft",
  arrowright: "turnRight",
  a: "moveLeft",
  d: "moveRight",
  w: "boost",
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
  if (e.key === " " && !world.arrived) {
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
let timedOut = false; // 성공 제한 시간을 넘겨 실패한 상태
function isPaused() {
  return state.quizOpen;
}

// 도착이든 시간초과든 게임이 끝나면 폰을 내리고 퀴즈 루프를 끊는다 — 결과 모달 위에
// 폰·퀴즈가 얹히지 않게. clearTime === null 게이트로 한 번만 부른다.
function endGame() {
  phone.setVisible(false);
  quiz.destroy();
}

function restart() {
  world.reset();
  phone.reset();
  // 도착·시간초과 시 quiz.destroy()가 raf 루프를 끊어 두므로 reset()만으로는 되살아나지 않으므로 다음과 같이 처리한다.
  quiz = mountQuiz(document.body, { content, state });
  elapsed = 0;
  clearTime = null;
  timedOut = false;
  result.hide();
}

function formatTime(sec) {
  if (sec < 60) return sec.toFixed(1) + "s";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

// ── HUD / 결과 UI (index.html은 그대로 두고 여기서 인라인으로 만든다) ──
const timeBar = makeTimeBar();
const boostBar = makeBoostBar();
const result = makeResult(restart);
// 좌상단에 [시간][부스터]를 같은 줄에 가로로 둔다(요구사항: 타임→부스터 순, 둘 다 왼쪽,
// 일직선). 부딪힘 횟수는 상시 HUD에서 빼고 결과 모달에서만 보여준다(요구사항).
const topLeft = document.createElement("div");
topLeft.style.cssText =
  "position:fixed; top:16px; left:16px; z-index:10; display:flex; align-items:center; gap:12px;";
topLeft.append(timeBar.el, boostBar.el);
document.body.append(topLeft, result.el);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  // 퀴즈로 멈췄거나 게임이 끝났으면(도착·시간초과) 시간·이동을 멈춘다. 화면은 계속 그린다.
  if (!isPaused() && !world.arrived && !timedOut) {
    elapsed += dt;
    world.update(dt, input);
    // 성공 제한 시간을 넘기면 실패로 확정한다. 도착 판정보다 뒤에서 보므로, 같은
    // 프레임에 도착과 시간초과가 함께 성립하면 아래에서 도착(성공)이 이긴다.
    if (elapsed >= world.timeLimit) timedOut = true;
  }
  world.render();

  // 끝나는 순간 한 번만(clearTime===null) 결과 모달을 띄운다. 도착=성공, 시간초과=실패.
  if (world.arrived && clearTime === null) {
    endGame();
    clearTime = elapsed;
    result.show(clearTime, world.hits, true);
  } else if (timedOut && clearTime === null) {
    endGame();
    clearTime = elapsed;
    result.show(clearTime, world.hits, false);
  }

  // 성공 제한 시간 대비 경과 비율만 폭으로. 숫자는 보여주지 않는다(요구사항).
  timeBar.set(elapsed / world.timeLimit);
  boostBar.set(state.gauge);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ── UI 빌더 ────────────────────────────────────────
// 시간 게이지 — 좌상단 맨 위. 부스터 게이지와 같은 크기(요구사항). 0%에서 시작해
// 성공 제한 시간에 닿으면 100%가 된다. 숫자는 절대 표시하지 않는다(요구사항).
// 퀴즈·결과로 멈춘 동안은 elapsed가 흐르지 않으므로 게이지도 자동으로 함께 멈춘다.
// 위치는 좌상단 flex 컨테이너(topLeft)가 잡는다.
function makeTimeBar() {
  const el = document.createElement("div");
  el.style.cssText = `
    flex:0 0 auto; width:min(320px,66vw); height:14px; border-radius:999px;
    background:rgba(27,29,33,0.55); overflow:hidden;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,0.18);
  `;
  const fill = document.createElement("div");
  fill.style.cssText = `
    height:100%; width:0%; background:#E0A458;
    transition:width .1s linear;
  `;
  el.appendChild(fill);
  return {
    el,
    set(frac) {
      const pct = Math.min(100, Math.max(0, frac * 100));
      fill.style.width = pct + "%";
    },
  };
}

// 부스터 게이지 바 — 좌상단, 시간 게이지 바로 아래. state.gauge(0~100, B가 quiz.js에서
// 채우고 깎는다)를 그대로 폭 %로 그린다. 상한을 넘거나 음수로 내려오는 경우까지
// 방어적으로 클램프한다 — quiz.js 쪽 상한 처리 유무와 무관하게 바가 안 깨지게.
// 위치는 좌상단 flex 컨테이너(topLeft)가 잡는다.
function makeBoostBar() {
  const el = document.createElement("div");
  el.style.cssText = `
    flex:0 0 auto; width:min(320px,66vw); height:14px; border-radius:999px;
    background:rgba(27,29,33,0.55); overflow:hidden;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,0.18);
  `;
  const fill = document.createElement("div");
  fill.style.cssText = `
    height:100%; width:0%; background:#A3324A;
    transition:width .12s linear;
  `;
  el.appendChild(fill);
  return {
    el,
    set(gauge) {
      const pct = Math.min(100, Math.max(0, gauge));
      fill.style.width = pct + "%";
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
    show(sec, hits, success = true) {
      // 도착=성공(청록 "도착!"), 시간초과=실패(적색 "시간 초과"). 버튼(다시 시작)은 공용.
      title.textContent = success ? "도착!" : "시간 초과";
      title.style.color = success ? "#2F6F6B" : "#A3324A";
      big.textContent = formatTime(sec);
      sub.textContent = "부딪힘 " + hits + "회";
      el.style.display = "flex";
    },
    hide() {
      el.style.display = "none";
    },
  };
}
