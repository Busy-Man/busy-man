// 주행 레이어 — 복도 렌더, 자동 전진, 좌우 이동, 3통로 갈림길 판정,
//                보행자 충돌 감속, 게이지 소비 가속.
// 담당: A
//
// 착수 전 확인: 렌더러(Canvas 2D vs three.js)는 8/3 오전 팀 결정 사항이다.
// 결정 전에 렌더 코드를 쓰면 버려진다. docs/renderer-comparison.html 참조.
// 기존 구현은 prototype/busy-man-prototype.html 에 있다 (382줄, 단일 파일).
