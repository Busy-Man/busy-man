// 게임 루프, 입력 라우팅, 제한시간, HUD, 결과 화면.
// 담당: A
//
// 이번 단계 범위: world.js 연결 + 좌우 입력 라우팅 + 렌더 루프 + 플레이 타이머 +
// 도착 결과 화면(최종 시간 + 다시 시작). 퀴즈(state.quizOpen)가 붙으면 isPaused만
// 바꿔 타이머·이동을 함께 멈춘다.

import { createWorld } from './world.js';

const stage = document.getElementById('stage');
const world = createWorld(stage);

// 회전(방향키 좌우)과 이동(A/D)을 분리해서 라우팅한다 — world.js는 키 이름을
// 몰라도 되게 { turnLeft, turnRight, moveLeft, moveRight }로만 받는다.
const input = { turnLeft: false, turnRight: false, moveLeft: false, moveRight: false };
const KEY_MAP = {
  arrowleft: 'turnLeft', arrowright: 'turnRight',
  a: 'moveLeft', d: 'moveRight',
};

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  const field = KEY_MAP[k];
  if (field) { input[field] = true; e.preventDefault(); }
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  const field = KEY_MAP[k];
  if (field) input[field] = false;
});
addEventListener('resize', () => world.resize());

// ── 플레이 시간(타이머) ─────────────────────────────
// elapsed: 경과 시간(초). clearTime: 클리어 순간 확정되는 별도 상태 — 향후 기록
// 저장/최고 기록에 쓰려고 따로 둔다. isPaused(): 퀴즈 등으로 멈춘 동안 true면
// 타이머와 이동을 함께 멈춘다. 지금은 퀴즈가 없어 항상 false지만, state.quizOpen이
// 붙으면 여기 한 줄만 바꾸면 된다.
let elapsed = 0;
let clearTime = null;
function isPaused() {
  return false; // TODO: state.quizOpen이 생기면 return state.quizOpen;
}

function restart() {
  world.reset();
  elapsed = 0;
  clearTime = null;
  result.hide();
}

function formatTime(sec) {
  if (sec < 60) return sec.toFixed(1) + 's';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
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
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; top:16px; left:16px; z-index:10; pointer-events:none;
    display:flex; gap:14px; align-items:baseline;
    padding:8px 14px; border-radius:10px; background:rgba(27,29,33,0.72); color:#fff;
    font:600 15px -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
  `;
  const time = document.createElement('span');
  time.style.cssText = 'font-variant-numeric:tabular-nums; font-size:18px;';
  const hits = document.createElement('span');
  hits.style.cssText = 'font-size:13px; color:#cfd4da;';
  el.appendChild(time);
  el.appendChild(hits);
  return {
    el,
    set(t, h) { time.textContent = '⏱ ' + t; hits.textContent = '부딪힘 ' + h; },
  };
}

function makeResult(onRestart) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; inset:0; z-index:20; display:none;
    align-items:center; justify-content:center; background:rgba(16,18,20,0.55);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
  `;
  const card = document.createElement('div');
  card.style.cssText = `
    background:#fff; color:#1B1D21; border-radius:16px; padding:28px 40px;
    text-align:center; box-shadow:0 18px 60px rgba(0,0,0,0.35); min-width:260px;
  `;
  const title = document.createElement('div');
  title.textContent = '도착!';
  title.style.cssText = 'font-size:20px; font-weight:700; color:#2F6F6B;';
  const big = document.createElement('div');
  big.style.cssText = 'font-size:52px; font-weight:800; margin:10px 0 2px; font-variant-numeric:tabular-nums;';
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:14px; color:#5C626B; margin-bottom:22px;';
  const btn = document.createElement('button');
  btn.textContent = '다시 시작';
  btn.style.cssText = `
    font-family:inherit; font-size:16px; font-weight:600; color:#fff; cursor:pointer;
    background:#2F6F6B; border:0; padding:11px 28px; border-radius:10px;
  `;
  btn.addEventListener('click', onRestart);
  card.append(title, big, sub, btn);
  el.appendChild(card);
  return {
    el,
    show(sec, hits) {
      big.textContent = formatTime(sec);
      sub.textContent = '부딪힘 ' + hits + '회';
      el.style.display = 'flex';
    },
    hide() { el.style.display = 'none'; },
  };
}
