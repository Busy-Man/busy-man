// 게임 루프, 입력 라우팅, 제한시간, HUD, 결과 화면.
// 담당: A
//
// 이번 단계 범위: world.js 연결 + 좌우 입력 라우팅 + 렌더 루프 + 플레이 타이머 +
// 도착 결과 화면(최종 시간 + 다시 시작) + 폰·퀴즈 마운트(state.quizOpen 연동,
// world의 회전·게이트 안내를 phone.pushMap으로 배선) + 시작 화면.

import { createWorld } from "./world.js";
import { mountPhone } from "./phone.js";
import { mountQuiz } from "./quiz.js";
import { state } from "./state.js";

const stage = document.getElementById("stage");

// 지인 테스트용 임시 시작 화면. quiz.js는 mountQuiz 직후부터 자체 타이머로
// 질문 주기를 세기 시작하므로(파일 상단 주석), "시작" 전에는 아예 마운트하지
// 않아야 화면을 보기도 전에 질문이 도착하는 일이 없다.
const startScreen = makeStartScreen(startGame);
document.body.appendChild(startScreen.el);

async function startGame() {
  startScreen.hide();

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
    // R — 다시 시작 확인 모달. 게임이 끝났거나(도착·시간초과) 이미 떠 있으면 무시한다.
    // 퀴즈가 뜬 동안(isPaused())에도 무시한다 — quiz.js가 자기 rAF로 카운트다운을
    // 돌리는데(B 소유), 그 위에 모달을 얹어도 이쪽에선 그 타이머를 멈출 수 없다.
    if (k === "r") {
      if (!confirmOpen && !isPaused() && !world.arrived && !timedOut) {
        confirmOpen = true;
        restartConfirm.show();
      }
      e.preventDefault();
      return;
    }
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
  let confirmOpen = false; // R로 띄운 "다시 시작" 확인 모달이 떠 있는 동안 true
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
    // R 확인 모달로 게임 도중 재시작하면 endGame()이 아직 quiz.destroy()를 부르지
    // 않은 상태다 — 살아있는 rAF 루프를 그대로 두면 새로 만든 인스턴스와 겹쳐 돌며
    // 퀴즈가 중복으로 뜬다. destroy()는 멱등이라 도착·시간초과 경로(이미 destroy된
    // 상태)에서 다시 불러도 안전하다.
    quiz.destroy();
    quiz = mountQuiz(document.body, { content, state });
    elapsed = 0;
    clearTime = null;
    timedOut = false;
    result.hide();
  }

  // ── HUD / 결과 UI (index.html은 그대로 두고 여기서 인라인으로 만든다) ──
  const timeBar = makeTimeBar();
  const boostBar = makeBoostBar();
  const result = makeResult(restart);
  // R로 여는 "다시 시작" 확인 모달. 취소하면 그냥 닫고, 확인하면 restart()를 부른다 —
  // 둘 다 confirmOpen을 반드시 꺼야 loop()가 다시 시간·이동을 흘려보낸다.
  const restartConfirm = makeRestartConfirm(
    () => {
      confirmOpen = false;
      restartConfirm.hide();
      restart();
    },
    () => {
      confirmOpen = false;
      restartConfirm.hide();
    },
  );
  // 좌상단에 [시간][부스터]를 같은 줄에 가로로 둔다(요구사항: 타임→부스터 순, 둘 다 왼쪽,
  // 일직선). 부딪힘 횟수는 상시 HUD에서 빼고 결과 모달에서만 보여준다(요구사항).
  const topLeft = document.createElement("div");
  topLeft.style.cssText =
    "position:fixed; top:16px; left:16px; z-index:10; display:flex; align-items:center; gap:12px;";
  topLeft.append(timeBar.el, boostBar.el);
  document.body.append(topLeft, result.el, restartConfirm.el);

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    // 퀴즈로 멈췄거나, R 확인 모달이 떠 있거나, 게임이 끝났으면(도착·시간초과)
    // 시간·이동을 멈춘다. 화면은 계속 그린다.
    if (!isPaused() && !confirmOpen && !world.arrived && !timedOut) {
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
}

function formatTime(sec) {
  if (sec < 60) return sec.toFixed(1) + "s";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

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

// R로 여는 "다시 시작" 확인 모달. 퀴즈 모달(z-index 200~299, world.js/quiz.js 대역
// 구분 참고) 위까지 덮어도 되게 그보다 위(300)에 둔다 — 지금은 퀴즈가 뜬 동안
// R 자체를 안 받으므로 실제로 겹칠 일은 없지만, 나중에 그 가드가 풀려도 안전하게.
function makeRestartConfirm(onConfirm, onCancel) {
  const el = document.createElement("div");
  el.style.cssText = `
    position:fixed; inset:0; z-index:300; display:none;
    align-items:center; justify-content:center; background:rgba(16,18,20,0.55);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
  `;
  const card = document.createElement("div");
  card.style.cssText = `
    background:#fff; color:#1B1D21; border-radius:16px; padding:26px 32px;
    text-align:center; box-shadow:0 18px 60px rgba(0,0,0,0.35); min-width:260px;
  `;
  const msg = document.createElement("div");
  msg.textContent = "게임을 다시 시작하시겠습니까?";
  msg.style.cssText = "font-size:16px; font-weight:650; margin-bottom:20px;";
  const row = document.createElement("div");
  row.style.cssText = "display:flex; gap:10px; justify-content:center;";
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "취소";
  cancelBtn.style.cssText = `
    font-family:inherit; font-size:15px; font-weight:600; color:#2A2F36; cursor:pointer;
    background:#E6E9ED; border:0; padding:10px 24px; border-radius:10px;
  `;
  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "확인";
  confirmBtn.style.cssText = `
    font-family:inherit; font-size:15px; font-weight:600; color:#fff; cursor:pointer;
    background:#A3324A; border:0; padding:10px 24px; border-radius:10px;
  `;
  cancelBtn.addEventListener("click", onCancel);
  confirmBtn.addEventListener("click", onConfirm);
  row.append(cancelBtn, confirmBtn);
  card.append(msg, row);
  el.appendChild(card);
  return {
    el,
    show() {
      el.style.display = "flex";
    },
    hide() {
      el.style.display = "none";
    },
  };
}

// 지인 테스트용 임시 화면. 꾸미지 않는다 — 단색 배경 + 텍스트로 목표와 조작법만
// 전달한다. 정식 타이틀 화면은 이번 스코프가 아니다.
function makeStartScreen(onStart) {
  const el = document.createElement("div");
  el.style.cssText = `
    position:fixed; inset:0; z-index:30;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:18px; padding:24px; text-align:center;
    background:#2F6F6B; color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
  `;

  const title = document.createElement("div");
  title.textContent = "Busy Man";
  title.style.cssText = "font-size:30px; font-weight:800;";

  const goal = document.createElement("div");
  goal.textContent = "목표: 부딪히지 않고, 문자에도 잘 답하면서 최대한 빨리 회사에 도착하기";
  goal.style.cssText = "font-size:15px; line-height:1.6; max-width:360px;";

  const rules = document.createElement("div");
  rules.style.cssText =
    "font-size:14px; line-height:1.9; text-align:left; background:rgba(0,0,0,0.18); padding:14px 20px; border-radius:10px;";
  [
    "← → : 좌우 회전",
    "A / D : 좌우 이동",
    "Space (누르고 있기) : 고개 들어 정면 보기",
    "문자가 오면 숫자 1~3 : 답장 고르기 (10초 안에)",
    "W (누르고 있기) : 부스터 — 가속 + 행인 무적",
    "좌상단 게이지 — 왼쪽: 남은 시간, 오른쪽: 부스터",
    "R : 다시 시작",
  ].forEach((line) => {
    const p = document.createElement("div");
    p.textContent = line;
    rules.appendChild(p);
  });

  const btn = document.createElement("button");
  btn.textContent = "시작하기";
  btn.style.cssText = `
    font-family:inherit; font-size:18px; font-weight:700; color:#2F6F6B; cursor:pointer;
    background:#fff; border:0; padding:13px 36px; border-radius:10px;
  `;
  btn.addEventListener("click", onStart);

  el.append(title, goal, rules, btn);
  return {
    el,
    hide() {
      el.remove();
    },
  };
}
