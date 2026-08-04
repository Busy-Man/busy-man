// 주행 레이어 — 복도 렌더, 자동 전진, 좌우 이동, 3통로 갈림길 판정,
//                보행자 충돌 감속, 게이지 소비 가속.
// 담당: A
//
// 렌더러는 three.js로 확정됐다. 저장소에 동봉한 vendor/ 파일을 상대경로로 부른다 —
// CDN을 쓰면 심사 당일 외부 서버 상태에 게임이 종속된다. 결정 근거는
// docs/renderer-comparison.html, 규약은 AGENTS.md §3.
//
// prototype/busy-man-prototype.html 에 복도·보행자·게이트가 이미 구현돼 있으나
// Canvas 2D 자체 투영이라 그대로 옮겨오지 못한다. 형태와 수치만 참고한다.
