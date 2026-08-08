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

// quiz.js는 mountQuiz 직후부터 자체 타이머로 질문 주기를 세므로 시작 전에는
// 표지만 렌더링한다. 월드·폰·퀴즈는 체크인 버튼을 누른 뒤 함께 만든다.
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
    // 부스터 게이지는 world.reset()도 quiz.destroy/mount도 건드리지 않는다 — 남겨두면
    // 이전 판 게이지를 그대로 들고 다음 판을 시작한다. AGENTS.md §2는 gauge 기록자를
    // B 하나로 두지만(A는 W 소비만), 재시작 초기화는 그 판정 밖의 별개 동작이라
    // 여기서 0으로 둔다.
    state.gauge = 0;
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
    "position:fixed; top:18px; left:16px; z-index:10; display:flex; align-items:center; gap:15px;";
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
// 게이지 바 공통 뼈대 — 아이콘이 막대 왼쪽 끝에 반쯤 겹쳐 얹힌 최초 모양 그대로다
// (흰 배경 캡슐로 감싸는 시도는 되돌렸다). 막대 굵기만 20px → 25px로 살짝 키웠다.
const GAUGE_ICON_SIZE = 34;
const GAUGE_ICON_OVERLAP = 14;

function makeGaugeWrap() {
  const wrap = document.createElement("div");
  wrap.style.cssText = "flex:0 0 auto; display:flex; align-items:center;";
  const bar = document.createElement("div");
  bar.style.cssText = `
    flex:0 0 auto; width:min(320px,66vw); height:22px; border-radius:999px;
    background:rgba(27,29,33,0.55); overflow:hidden;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,0.3);
  `;
  const fill = document.createElement("div");
  fill.style.cssText = "height:100%; width:0%; transition:width .1s linear;";
  bar.appendChild(fill);
  return { wrap, bar, fill };
}

// 시간 게이지 — 좌상단 맨 위. 부스터 게이지와 같은 크기(요구사항). 0%에서 시작해
// 성공 제한 시간에 닿으면 100%가 된다. 숫자는 절대 표시하지 않는다(요구사항).
// 퀴즈·결과로 멈춘 동안은 elapsed가 흐르지 않으므로 게이지도 자동으로 함께 멈춘다.
// 위치는 좌상단 flex 컨테이너(topLeft)가 잡는다.
function makeTimeBar() {
  const { wrap, bar, fill } = makeGaugeWrap();
  fill.style.background = "#FFF8E0";

  // timer.png는 이미 노란 원판이 그림에 포함돼 있어 별도 배경 원을 덧대지 않고
  // 이미지 그대로 쓴다. z-index는 flex 아이템이라 position 없이도 먹는다.
  const icon = document.createElement("img");
  icon.src = "./assets/map/gauge/timer.png";
  icon.alt = "";
  icon.style.cssText = `
    width:${GAUGE_ICON_SIZE}px; height:${GAUGE_ICON_SIZE}px; object-fit:contain;
    z-index:2; margin-right:-${GAUGE_ICON_OVERLAP}px;
    filter:drop-shadow(0 0 3px rgba(255,196,0,.55));
  `;
  wrap.append(icon, bar);
  return {
    el: wrap,
    set(frac) {
      const pct = Math.min(100, Math.max(0, frac * 100));
      fill.style.width = pct + "%";
    },
  };
}

// 부스터 게이지 바 — 좌상단, 시간 게이지 옆(요구사항: 같은 줄, 일직선). state.gauge
// (0~100, B가 quiz.js에서 채우고 깎는다)를 그대로 폭 %로 그린다. 상한을 넘거나
// 음수로 내려오는 경우까지 방어적으로 클램프한다 — quiz.js 쪽 상한 처리 유무와
// 무관하게 바가 안 깨지게. 위치는 좌상단 flex 컨테이너(topLeft)가 잡는다.
function makeBoostBar() {
  const { wrap, bar, fill } = makeGaugeWrap();
  fill.style.background = "#E31D20";

  // booster.png는 배경이 투명한 불꽃 모양뿐이라, timer.png와 크기·존재감을
  // 맞추려면 원형 배지를 직접 씌워야 한다.
  const badge = document.createElement("div");
  badge.style.cssText = `
    width:${GAUGE_ICON_SIZE}px; height:${GAUGE_ICON_SIZE}px; border-radius:50%;
    flex:0 0 auto; background:#1B1D21;
    box-shadow:0 0 0 2px rgba(255,255,255,0.18) inset;
    display:flex; align-items:center; justify-content:center;
    z-index:2; margin-right:-${GAUGE_ICON_OVERLAP}px;
  `;
  const icon = document.createElement("img");
  icon.src = "./assets/map/gauge/booster.png";
  icon.alt = "";
  icon.style.cssText =
    "width:60%; height:60%; object-fit:contain; filter:drop-shadow(0 0 3px rgba(255,120,40,.6));";
  badge.appendChild(icon);
  wrap.append(badge, bar);
  return {
    el: wrap,
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
      title.textContent = success ? "도착" : "시간 초과";
      title.style.color = success ? "#2F6F6B" : "#A3324A";
      big.textContent = success ? "정시 출근 성공!" : "지각하셨습니다.";
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

// 정식 표지는 무문자 키아트 위에 판교 테크 오피스풍의 간결한 패널을 얹는다.
// 제목·상황·조작·시작 행동 외 장식성 정보는 두지 않아 첫 화면을 빠르게 훑게 한다.
function makeStartScreen(onStart) {
  const el = document.createElement("div");
  el.className = "bm-start";

  const style = document.createElement("style");
  style.textContent = `
    .bm-start {
      position:fixed; inset:0; z-index:30; display:grid; place-items:center start;
      box-sizing:border-box; overflow:auto; padding:clamp(18px,3vw,42px) clamp(24px,5vw,92px);
      color:#EEF5F7;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR","Noto Sans KR",sans-serif;
      background-color:#0B1B24;
      background-image:
        linear-gradient(90deg,rgba(6,18,27,.98) 0%,rgba(8,25,35,.90) 34%,rgba(9,27,37,.56) 56%,rgba(8,21,28,.08) 82%),
        url("./assets/cover/cover-keyart.png");
      background-position:center; background-size:cover; background-repeat:no-repeat;
    }
    .bm-cover-panel {
      width:min(660px,52vw); box-sizing:border-box; display:grid; gap:22px;
      padding:clamp(34px,3.4vw,52px) clamp(34px,3.8vw,56px);
      border:1px solid rgba(170,207,216,.22); border-radius:18px;
      background:rgba(9,28,36,.90); box-shadow:0 28px 72px rgba(0,0,0,.38);
      backdrop-filter:blur(16px); animation:bm-panel-in .36s ease-out both;
    }
    .bm-title {
      margin:0; width:max-content; max-width:100%;
      font-family:"Arial Black","Segoe UI Black","Pretendard","Malgun Gothic",sans-serif;
      font-size:clamp(62px,6.8vw,94px); line-height:.88; letter-spacing:-.065em; font-weight:950;
      background:linear-gradient(90deg,#F5FAFB 0%,#F5FAFB 57%,#65D8C2 57%,#65D8C2 100%);
      -webkit-background-clip:text; background-clip:text; color:transparent;
      filter:drop-shadow(0 12px 24px rgba(0,0,0,.24));
    }
    .bm-story {
      margin:0; max-width:570px; color:#AEC4CB; font-size:clamp(15px,1.25vw,18px);
      font-weight:560; line-height:1.7; word-break:keep-all;
    }
    .bm-story strong { color:#F4F9FA; font-weight:780; }
    .bm-control-grid {
      display:grid; grid-template-columns:1fr 1fr; gap:0;
      padding:18px 0; border-top:1px solid rgba(159,197,206,.18);
      border-bottom:1px solid rgba(159,197,206,.18);
    }
    .bm-control-group:first-child { padding-right:24px; border-right:1px solid rgba(159,197,206,.18); }
    .bm-control-group:last-child { padding-left:24px; }
    .bm-control-title {
      margin-bottom:9px; color:#65D8C2; font-size:11px; font-weight:850; letter-spacing:.04em;
    }
    .bm-control-item { display:grid; grid-template-columns:96px 1fr; align-items:center; gap:8px; min-height:34px; }
    .bm-control-item kbd {
      padding:0; border:0; color:#A9EADF; background:none; box-shadow:none;
      font:900 14px/1.2 ui-monospace,"SFMono-Regular",Consolas,"Malgun Gothic",monospace;
      letter-spacing:.01em;
    }
    .bm-control-item span { color:#D1DEE2; font-size:13px; font-weight:600; line-height:1.35; }
    .bm-start-button {
      justify-self:start; min-width:184px; border:0; border-radius:11px; padding:14px 28px;
      color:#092229; background:#65D8C2; cursor:pointer; box-shadow:0 10px 24px rgba(30,172,147,.20);
      font-family:inherit; font-size:18px; font-weight:900; line-height:1.2; letter-spacing:-.02em;
      transition:transform .16s ease,background .16s ease,box-shadow .16s ease;
    }
    .bm-start-button:hover { background:#79E2CE; transform:translateY(-1px); box-shadow:0 13px 28px rgba(30,172,147,.26); }
    .bm-start-button:active { transform:translateY(1px); }
    .bm-start-button:focus-visible { outline:2px solid #D9FFF7; outline-offset:3px; }
    @keyframes bm-panel-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    @media (max-width:980px) {
      .bm-start {
        place-items:center; padding:16px;
        background-image:
          linear-gradient(90deg,rgba(6,18,27,.88),rgba(8,24,33,.62)),
          url("./assets/cover/cover-keyart.png");
        background-position:64% center;
      }
      .bm-cover-panel { width:min(660px,100%); max-height:calc(100vh - 32px); overflow:auto; }
    }
    @media (max-width:620px) {
      .bm-cover-panel { gap:18px; padding:28px 22px; border-radius:14px; }
      .bm-title { font-size:clamp(54px,16vw,72px); }
      .bm-control-grid { grid-template-columns:1fr; }
      .bm-control-group:first-child {
        padding:0 0 14px; border-right:0; border-bottom:1px solid rgba(159,197,206,.18);
      }
      .bm-control-group:last-child { padding:14px 0 0; }
      .bm-start-button { justify-self:stretch; width:100%; }
    }
    @media (prefers-reduced-motion:reduce) {
      .bm-cover-panel { animation:none; }
      .bm-start-button { transition:none; }
    }
  `;

  const panel = document.createElement("section");
  panel.className = "bm-cover-panel";
  panel.setAttribute("aria-labelledby", "bm-start-title");

  const title = document.createElement("h1");
  title.className = "bm-title";
  title.id = "bm-start-title";
  title.textContent = "BUSY MAN";

  const story = document.createElement("p");
  story.className = "bm-story";
  const storyLead = document.createElement("strong");
  storyLead.textContent = "출근 시각은 다가오고, 업무 문자는 멈추지 않는다.";
  story.append(
    storyLead,
    document.createElement("br"),
    "길을 놓치지 말고 답장을 이어가며, 늦지 않게 회사에 도착하라.",
  );

  function makeControlGroup(label, controls) {
    const group = document.createElement("div");
    group.className = "bm-control-group";
    const groupTitle = document.createElement("div");
    groupTitle.className = "bm-control-title";
    groupTitle.textContent = label;
    group.appendChild(groupTitle);
    controls.forEach(([key, description]) => {
      const item = document.createElement("div");
      item.className = "bm-control-item";
      const keyLabel = document.createElement("kbd");
      keyLabel.textContent = key;
      const text = document.createElement("span");
      text.textContent = description;
      item.append(keyLabel, text);
      group.appendChild(item);
    });
    return group;
  }

  const controls = document.createElement("section");
  controls.className = "bm-control-grid";
  controls.setAttribute("aria-label", "전체 조작법");
  controls.append(
    makeControlGroup("주행", [
      ["← / →", "좌우 회전"],
      ["A / D", "좌우 이동"],
      ["SPACE", "누르는 동안 정면 보기"],
    ]),
    makeControlGroup("업무", [
      ["숫자키 (1~4)", "답장 선택"],
      ["W", "가속 · 행인 무적"],
      ["R", "게임 다시 시작"],
    ]),
  );

  const btn = document.createElement("button");
  btn.className = "bm-start-button";
  btn.textContent = "출근 시작";
  btn.addEventListener("click", onStart);

  panel.append(title, story, controls, btn);
  el.append(style, panel);
  return {
    el,
    hide() {
      el.remove();
    },
  };
}
