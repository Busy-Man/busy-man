// 게임 루프, 입력 라우팅, 제한시간, HUD, 결과 화면.
// 담당: A
//
// 아래 import와 로그는 게임 코드가 아니라 배포 점검용이다.
// GitHub Pages는 하위 경로(/busy-man/)로 서빙되므로 ES 모듈 상대경로가
// 깨질 수 있고, 그 사실을 8/5 병합일에 처음 알게 되는 것이 이 프로젝트의
// 실제 리스크였다. 구현을 시작하면서 이 두 줄은 지워도 된다.

import './state.js';

console.log('[boot] main.js loaded');
console.log('[boot] state.js import OK');
