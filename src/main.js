// 게임 루프, 입력 라우팅, 제한시간, HUD, 결과 화면.
// 담당: A
//
// 이번 단계 범위: world.js 연결 + 좌우 입력 라우팅 + 렌더 루프까지.
// 제한시간·HUD·결과 화면은 quiz.js 쪽 접점(state.quizOpen 등)이 붙은 뒤에 이어서 구현한다.

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

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  world.update(dt, input);
  world.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
