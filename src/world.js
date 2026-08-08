// 주행 레이어 — "길" 검증용 최소 버전 + 건물 게이트.
// 담당: A
//
// 목표는 게임성이 아니라 길(맵) 구조와 이동감이 자연스러운지만 확인하는 것 —
// 그래서 진짜 건물 진입·퀴즈 이벤트·씬 전환은 아직 없다. 보행자는 prototype 방식
// 그대로 되살렸다(장애물 + 충돌 감속, 진짜 AI는 없다). T(신호등)·C(공사장)는
// 이벤트가 붙었다 — C는 한 차선을 바리게이트로 막고, T는 횡단보도 군중이 안전
// 차선만 열어 준다(안전 차선이 아니면 갇힌다). B(건물)만 이번에 되살렸는데, prototype의 게이트
// (3통로 아치)를 그대로 세우고 그 위에 건물처럼 보이는 상자를 얹은 장식이다 —
// 실제로 문을 통과했는지 판정하지는 않는다(충돌 없음). "지금 안 쓴다"로 남겨 둔
// 부분은 주석으로 표시했다.
//
// docs/aaa.jpg 노드 좌표(N)와 도로 연결(ROADS)은 이전 버전 그대로다 — 도로망 전체는
// 지도 맥락으로 화면에 다 그리지만("선택 안 된 길도 UI에 나와야 한다"), 실제로
// 걸을 수 있는(충돌·갈림길 판정이 붙는) 건 docs/맵 시간 배분.md의 유효 경로 7개 중
// 시작할 때 무작위로 고른 하나뿐이다. 갈림길에서는 화면 위 토스트로 "이 방향으로
// 꺾인다"만, 건물 게이트 앞에서는 "이 문으로 들어간다"만 미리 알려준다 — 알려만
// 주지 실제로 대신 해주지는 않는다. 다른 문(게이트)·다른 길은 실제로 쓰는 것과
// 겉모습을 완전히 같게 해서 안내 없이는 구분이 안 되게 한다 — 사용자를 속이는
// 용도로 일부러 그런 것.
//
// 렌더러는 three.js로 확정됐다. 저장소에 동봉한 vendor/ 파일을 상대경로로 부른다 —
// CDN을 쓰면 심사 당일 외부 서버 상태에 게임이 종속된다. 규약은 AGENTS.md §3.

/**
[ TODO ]
+ B7 경로 조정
+ 행인 추가
+ 신호등, 공사장 추가 (바리게이트 · 횡단보도 군중 이벤트)
+ 도착지 표시
- B7 건물 안 그래픽 버그 수정
+ 바리게이트 시작점에서 올라는 걸로 수정
+ 바리게이트 유저 접근 2초 -> 1초 전으로 수정
+ 신호등 행인 배치 세로 일자X -> 시작점에 가로로 2줄로 수정
+ 루트셋 확장 검토
- 가속 기능 추가(가속키: w)
- 방향, 신호등, 공사장 이벤트 호출
- 잘못된 길 진입 시 뒤로 보내기
+ 루트별 시간 계산
**/

import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { state } from "./state.js";

// ── 튜닝 상수 ────────────────────────────────────
const EYE = 1.62;
const SPEED = 6.0;
const BOOST_SPEED = 12.0; // 부스터 사용 중 이동 속도 (기본 SPEED=6 대비)
// 부스터 게이지 초당 소모량(%). 풀 게이지가 약 3.3초 지속되는 값이다 —
// 근거가 있는 값이 아니라 잠정치이고, 8/6류 밸런싱 대상이다
// (quiz.js TUNING.gaugeOnCorrect/gaugeOnWrong과 짝, docs/balance-todo.md 참고).
const BOOST_DRAIN_PER_SEC = 30;

const STEER_ACCEL = 26,
  STEER_DAMP = 30,
  STEER_MAX = 4.6; // 좌우 이동(A/D)
const TURN_ACCEL = 6,
  TURN_DAMP = 7,
  TURN_MAX = 1.6; // 회전(방향키)

// 맵 전체 확대 배율 — 노드 좌표(N)에만 곱한다. 그래프 구조·모양·이음매는
// 그대로 두고 "구간 길이(거리)"만 늘려 전체 주행 시간을 맞추는 유일한 손잡이다.
// docs/aaa.jpg 원본 좌표로는 대표 경로가 33초 안팎(SPEED=6)이라 짧았다 → 2.1을
// 곱해 자주 나오는 경로들이 약 70초에 들어오게 했다. 비율을 유지하는 균등 확대라
// 특정 구간만 급격히 짧거나 길어지지 않는다. 속도(SPEED)는 건드리지 않는다.
const MAP_SCALE = 2.1;

// 구간 목표 시간(초) → 월드 거리. 길이는 언제나 SPEED × 시간이다 — 이후 T(신호등)·
// C(공사장) 체류를 붙일 때도 각자의 초만 정하면 이 함수로 길이가 정해지도록 남긴다.
function durationToDistance(sec) {
  return SPEED * sec;
}

const CEIL = 3.0; // 벽 높이 — prototype 그대로
const ROAD_HALF = 3.5; // 복도 반폭 — prototype 그대로
const PLAYER_MARGIN = 0.4; // 벽에 실제로 파묻히지 않게 두는 여유 — prototype 그대로
const HINT_LOOKAHEAD = 21; // 갈림길·게이트 이 거리 앞에서 안내를 발화한다(맵 확대에 맞춰 10→21)

// 게이트 — prototype의 4기둥(3통로) 아치를 그대로 가져왔다. LANE_X 값도 동일.
const GATE_LANE_X = [-3.5, -1.15, 1.15, 3.5];
const DOOR_NAME = ["왼쪽 문", "가운데 문", "오른쪽 문"];
const DOOR_ARROW = ["←", "↑", "→"];
// 기둥 4개 사이 3칸(문)의 중심 — nearestLane으로 "지금 몇 번 문 앞인지" 판정할 때 쓴다.
// LANE_X(신호등 차선, ±2.1)와 값이 달라서 따로 둔다 — 게이트 폭은 기둥 간격에서 나온다.
const GATE_DOOR_X = [
  (GATE_LANE_X[0] + GATE_LANE_X[1]) / 2,
  (GATE_LANE_X[1] + GATE_LANE_X[2]) / 2,
  (GATE_LANE_X[2] + GATE_LANE_X[3]) / 2,
];

// 갈림길·게이트를 잘못 선택했을 때 되돌리는 거리 — "3초 전"을 위치가 아니라
// 거리로 환산한 것(SPEED × 3초). 되돌린 자리에서 다시 판정선에 접근하면
// 같은 이벤트가 다시 안내된다(재안내) — 실패해도 큐(이벤트)는 그대로 두고
// resolved만 안 켠다.
const WRONG_CHOICE_REWIND = 2;
// 잘못된 게이트 안내 토스트가 떠 있는 시간(초). 신호등 갇힘 토스트와 달리 "끝나는
// 순간"이 없어서(되돌린 뒤 곧바로 다시 달린다) 시간으로 자동 소멸시킨다.
const WRONG_GATE_TOAST_SEC = 1.6;
// 성공 제한 시간 = 이 경로의 순수 이동 시간 + 여유(초). docs/map/맵 시간 배분.md가
// "예상 소요 시간 + 10초"로 정한 값을, 표에서 시간을 옮겨 적지 않고 경로 길이에서
// 직접 잰다 — 그 문서의 예상 소요 시간 자체가 totalLength / SPEED 로 역산된 것이라
// (§2 검증) 같은 결과가 나오고, ROUTES가 바뀌어도 표를 다시 손볼 필요가 없다.
const TIME_LIMIT_BONUS_SEC = 10;
const BUILDING_H = 4.0; // 게이트 위에 얹는 상자 높이
// 건물 안에 머무는 시간(초). 건물은 노드에 얹힌 상자라 플레이어가 상자 길이만큼
// 통과하고, 체류 시간 = 상자 길이 / SPEED다. 요구사항: 최소 5초 이상.
// docs의 원래 건물 초(10~15)를 그대로 쓰면 상자가 인접 노드를 넘어 다른 길과
// 겹치므로(특히 B3은 스케일 후에도 7초 남짓이 한계) 지금 맵 길이에 들어오는
// 균일 값 5.5초로 둔다 — 최소치 5초를 넘기고 가장 빡빡한 B3에도 들어간다.
const BUILDING_DWELL_SEC = 5.5;
// 건물 안 게이트(문) 간격 — 평균 이만큼 이동할 때마다 문 하나. 건물 통과 시간이
// 길수록 문 개수도 자연히 늘어난다(개수 = 통과시간 / 이 값, 반올림). 길이는
// durationToDistance로 나오므로 초만 정하면 위치가 따라온다.
const GATE_INTERVAL_SEC = 3;
// 건물 하나(B7 제외)에 세우는 게이트 개수 — 렌더링과 판정이 같은 수를 보게
// 상수 하나로 뽑아 둔다. 양 끝(진입·진출) 포함, 그 사이는 고르게 나눈다.
const REGULAR_GATE_COUNT = Math.max(
  2,
  Math.round(BUILDING_DWELL_SEC / GATE_INTERVAL_SEC) + 1,
);
// 게이트 주변 생성 금지 범위 — 약 1초 이동 거리. 건물 기준 제한은 없앴고, 이제
// 게이트(문)만 이 범위로 행인 생성을 막는다. T/C 등 다른 이벤트도 같은 값을
// 따로 두고 addSpawnBlock으로 등록하면 동일한 방식으로 확장된다.
const GATE_CLEAR = durationToDistance(1);

// 신호등(T)·공사장(C) 구간의 색칠 길이(초). 아직 이벤트(정지·서행)는 없고 일반
// 도로처럼 지나가되, 노드를 중심으로 이만큼의 길이만 다른 색으로 칠해 "여기가 T/C
// 자리"임을 보여 준다. 요구사항: 각 T/C 구간은 최소 2초 이상 이동 길이. durationToDistance로
// 길이가 정해지므로, 이후 실제 이벤트를 붙일 때 이 초만 바꾸면 구간 길이가 따라온다.
const ZONE_SEC = 2.2;

// prototype/busy-man-prototype.html의 타일 방식(줄무늬 텍스처, 3유닛 주기)은
// 그대로 가져오되, 벽은 바닥과 확실히 구분되게 더 어둡게 잡았다 — 원래 값(둘 다
// 밝은 회색)은 눈으로 구분이 잘 안 됐다. 이제 모든 도로(선택된 길 포함)를
// 똑같은 스타일로 그린다 — "선택 안 된 길도 실제 길이랑 UI가 똑같아야 한다".
const COLOR = {
  bg: 0xbfe3f5, // 하늘 — 예전엔 검은색이었다
  ground: 0x8fc328, // 도로망 바깥 빈 땅 — 잔디(연두)
  ground2: 0x86b42b, // 잔디 줄무늬(약간 진한 연두) — floor/floor2와 같은 방식
  floor: 0xedeff2,
  floor2: 0xe6e9ed,
  lane: 0xc9d1d9,
  gate: 0x5c6470, // 게이트 기둥·상판과 건물 상자를 전부 이 색 하나로 — "색깔을 똑같게"
  // 신호등(T) 바닥은 횡단보도 텍스처, 벽은 없앴다(도시 거리와 트이게) → 색 상수 불필요.
  // 공사장(C) 바닥만 주황으로 구분한다(벽은 fence2.glb라 구분색 없음).
  cFloor: 0xf5c9a0, // C 공사장 바닥 — 주황 계열
  cFloor2: 0xf0b986,
  ped: 0x7c848e, // 행인 몸통 — prototype 그대로
  pedHead: 0x69717b, // 행인 머리 — prototype 그대로
  goal: 0x2f6f6b, // 도착 지점 — prototype의 accent(청록)
  crosswalk1: 0x22262b, // 신호등 바닥 횡단보도 — 진한 회색/검정
  crosswalk2: 0xf2f4f7, // 횡단보도 흰 줄
  treeTrunk: 0xa0671b, // tree.glb 줄기 — 원본 재질에 색이 없어(흰색) 코드에서 새로 입힌다
  treeLeaf: 0x84a641, // tree.glb 잎
  // barricade.glb 큐브 이름(검정/주황/하양) 그대로 색만 입힌다 — 요구사항: 주황은 최대한 쨍하게.
  barricadeBlack: 0x2e2e2e,
  barricadeOrange: 0xf57c00,
  barricadeWhite: 0xfefefe,
  // ── 배경 도시 꾸미기 — docs/map/맵분위기.png의 추천 팔레트 그대로. office/light/
  // flowerBed 에셋도 tree.glb처럼 원본 재질에 색이 없어(흰색) 노드 이름으로 여기 색을 입힌다.
  bldgWall: 0xe6e8ec, // 외벽
  bldgAccent: 0xb8bec8, // 외벽포인트 — 외벽보다 살짝 진하게
  bldgRoof: 0xc7ccd3, // 옥상·옥상장식품
  bldgWin: 0xb8e6fa, // 창문(밝게)
  bldgWinBar: 0x9fd8f6, // 창문구분선(창틀 기둥)
  bldgDoor: 0x7d7985, // 입구(문)
  bldgAwning: 0xd1d3d7, // 차양 — 상가 포인트(주황/빨강 계열)
  bldgSign: 0xf7e19e, // 가게 간판
  potBody: 0x9a6a3c, // 장식용 화분
  potPlant: 0x7bc96f, // 화분 식물
  lampPole: 0x666666, // 가로등 기둥
  lampBulb: 0xffe9a8, // 가로등 전구
  flowerBed: 0x8ed081, // 화단(관상풀)
  treeBase: 0x6f9e3a, // tree2의 밑동 바닥(관목 흙/풀)
  // trafficLight.glb 노드 이름 → 색. 폴(기둥)은 가로등과 같은 색을 재사용한다.
  trafficBody: 0x3a3f46, // 신호등본체(신호 박스)
  trafficRed: 0xe6483c, // 빨간불
  trafficGreen: 0x3ea84c, // 초록불
};

// ── 행인(보행자) — prototype/busy-man-prototype.html의 peds를 그대로 옮겼다.
// 복도 안에 흩어 세우고 플레이어 쪽으로 걸어오게 한다. 부딪히면 잠깐 감속되고
// 옆으로 튕긴다. 아직 진짜 AI는 없다 — 앞을 보게 만드는 장애물일 뿐. 좌표계가
// 곧은 z-복도가 아니라 꺾이는 경로라, 위치는 "경로 진행거리(s) + 좌우 오프셋"으로
// 잡아 길을 따라 배치한다.
const PED_BODY_H = 1.42; // 몸통 높이 — prototype
const PED_HEAD_TOP = 1.76; // 머리 꼭대기 — prototype
const PED_HALF = 0.32; // 몸통 반폭 — prototype
const PED_HEAD_HALF = 0.17; // 머리 반폭 — prototype
const PED_LANE_HALF = 3.2; // 좌우로 흩어지는 범위(복도 반폭 3.5보다 안쪽) — prototype
const PED_SPEED_MIN = 1.4; // 다가오는 속도 하한 — prototype
const PED_SPEED_VAR = 0.9; // 속도 편차 — prototype
const PED_GAP_MIN = 3.5; // 앞뒤 간격 하한 — prototype
const PED_GAP_VAR = 3.0; // 간격 편차 — prototype
const PED_START_S = 10; // 시작점 바로 앞은 비워 둔다
const HIT_DEPTH = 0.6; // 충돌 판정 앞뒤 반깊이 — prototype의 dz 창(±0.6)
const HIT_HALF = 0.62; // 충돌 판정 좌우 반폭 — prototype의 좌우 임계값
const HIT_STUN = 0.55; // 부딪힌 뒤 감속 지속 — prototype
const HIT_SLOW = 0.35; // 감속 배율(전진 속도에 곱함) — prototype
const HIT_KNOCK = 2.2; // 옆으로 튕기는 속도 — prototype

// ── 이벤트(공사장 C · 신호등 T) 공통: 3개 차선 ──────
// 복도(반폭 3.5)를 왼쪽/가운데/오른쪽 3차선으로 나눈다. 플레이어의 좌우 오프셋으로
// 지금 어느 차선인지 판정한다. prototype의 LANES 개념 그대로.
const LANE_X = [-2.1, 0, 2.1];
const LANE_NAME = ["왼쪽", "가운데", "오른쪽"];
const LANE_HALF = 1.05; // 차선 반폭

// ── 공사장(C) 바리게이트 ──
const BARR_LEAD_SEC = 1; // 도착 약 1초 전 바닥에서 올라온다
const BARR_RISE_SEC = 0.6; // 올라오는 애니메이션 시간
const BARR_H = 2.3; // 다 올라온 높이
const BARR_STOP = 0.9; // 막힐 때 바리게이트 이만큼 앞에서 멈춘다

// ── 신호등(T) ──
const TL_HALF_SEC = 2; // 구역 반깊이(초) → 정상 통과 약 4초(2×half/ SPEED)
const TL_TRAP_SEC = 6; // 안전 차선을 못 타면 약 6초 갇혀 천천히 끌려간다
const TL_OPEN_LEAD_SEC = 0.3; // 충돌 약 0.5초 전 안전 차선이 열린다
const TL_JUDGE_DELAY_SEC = 0.75; // 진입선(startS)에서 이만큼 더 간 뒤에야 차선을 판정한다 —
// 요구사항: 들어가자마자 정해지는 느낌을 줄이려는 것. 군중이 갈라지는 연출
// 시점(TL_OPEN_LEAD_SEC)은 그대로 startS 기준이라 이 값의 영향을 받지 않는다.
const TL_CROWD_GAP = 1.6; // 군중 앞뒤 간격(줄 간격)
const TL_STEP = 5.5; // 군중이 옆 차선으로 비켜서는 속도(유닛/초)
const TL_CROWD_PER_SLOT = 3; // 줄×차선 한 자리에 세울 인원 — 요구사항: 더 많아 보이게, 겹쳐도 무방
const TL_CROWD_JITTER_S = 0.5; // 한 자리 안에서 앞뒤로 흩어지는 폭(겹침 허용)
const TL_CROWD_JITTER_LAT = 0.5; // 한 자리 안에서 좌우로 흩어지는 폭

// ── docs/aaa.jpg의 노드 좌표(원본) — 그래프 구조는 그대로 둔다(나중에 건물/신호등/
// 공사장을 되살릴 때 다시 쓴다). 이번 버전은 이 중 일부만 잇는다. 실제 좌표(N)는
// 이 원본에 MAP_SCALE만 곱한 것 — 모양·연결은 같고 거리만 늘어난다. ────────
const N_RAW = {
  START: [0, 33],
  N1: [13, 33],
  N2: [13, 9],
  T1: [13, 20],
  B1: [13, 50],
  N7: [13, 69],
  B2: [30, 9],
  C1: [26, 33],
  B3: [39, 33],
  N3: [49, 33],
  J1: [49, 9],
  T3: [49, 19],
  B4: [49, 50],
  N5: [49, 69],
  T2: [27, 69],
  J2: [61, 9],
  C2: [61, 20],
  N4: [61, 33],
  B5: [61, 47],
  N6: [61, 69],
  B6: [72, 9],
  T4: [68, 33],
  J3: [87, 9],
  B7: [87, 33],
  C3: [87, 50],
  N8: [87, 69],
  T5: [106, 9],
  END2: [122, 9],
  B8: [103, 66],
  END3: [122, 69],
};

// 원본 좌표에 MAP_SCALE만 곱한 실제 좌표 — 코드는 전부 이 N을 쓴다.
const N = Object.fromEntries(
  Object.entries(N_RAW).map(([k, [x, z]]) => [
    k,
    [x * MAP_SCALE, z * MAP_SCALE],
  ]),
);

// 전체 도로망 — 실제로 걸을 수 있는 건 이 중 선택된 경로(ROUTES) 하나뿐이지만,
// 나머지 길도 지도 맥락으로 화면에는 그려 준다("선택 안 된 길도 UI에 나와야 한다").
const ROADS = [
  ["START", "N1"],
  ["N1", "T1", "N2"],
  ["N2", "B2"],
  ["B2", "J1"],
  ["N1", "C1", "B3"],
  ["B3", "N3"],
  ["N1", "B1"],
  ["B1", "N7"],
  ["N7", "T2", "N5"],
  ["J1", "T3", "N3"],
  ["J1", "J2"],
  ["N3", "B4"],
  ["B4", "N5"],
  ["N3", "N4"],
  ["J2", "C2", "N4"],
  ["J2", "B6"],
  ["B6", "J3"],
  ["N4", "T4", "B7"],
  ["N5", "N6", "B5"],
  ["B5", "N4"],
  ["B7", "J3"],
  ["B7", "C3", "N8"],
  ["N8", "B8"],
  ["B8", "END3"],
  ["J3", "T5", "END2"],
];

// 노드별 차수 — 이 노드에서 갈라지는 서로 다른 도로(ROADS 항목) 수. 3 이상이면
// 실제 갈림길이다(유저가 화면에서 다른 길도 볼 수 있는 지점). T/C 표지는 도로
// 중간의 마커일 뿐 ROADS 항목의 끝점이 아니라서 여기 안 잡힌다 — 마커에는
// 실제로 고를 다른 길이 없으니 그게 맞다.
const NODE_DEGREE = {};
for (const road of ROADS) {
  const a = road[0],
    b = road[road.length - 1];
  NODE_DEGREE[a] = (NODE_DEGREE[a] || 0) + 1;
  NODE_DEGREE[b] = (NODE_DEGREE[b] || 0) + 1;
}

// docs/map/맵 시간 배분.md §4-1의 유효 경로 9개(60~81초 밴드)를, 위 노드 이름을
// 잇는 "홉" 목록으로 그대로 옮겼다. 각 홉은 이전 홉의 끝점에서 이어진다(반대로
// 쓰여 있으면 뒤집는다). 예전 7개(90~100초 밴드) 중 "중간 직진→END3"(55.5초, 우회
// 0회 급행)는 새 밴드 밖이라 빠졌고, 대신 B4 우회 2종(END2/END3)과 하단(B1)→END3가
// 새로 들어왔다 — 나머지 6개는 두 밴드 모두에 걸쳐 그대로 재사용된다.
const ROUTES = [
  [
    ["START", "N1"],
    ["N1", "C1", "B3"],
    ["B3", "N3"],
    ["N3", "B4"],
    ["B4", "N5"],
    ["N5", "N6", "B5"],
    ["B5", "N4"],
    ["N4", "T4", "B7"],
    ["B7", "J3"],
    ["J3", "T5", "END2"],
  ],
  [
    ["START", "N1"],
    ["N1", "C1", "B3"],
    ["B3", "N3"],
    ["N3", "B4"],
    ["B4", "N5"],
    ["N5", "N6", "B5"],
    ["B5", "N4"],
    ["N4", "T4", "B7"],
    ["B7", "C3", "N8"],
    ["N8", "B8"],
    ["B8", "END3"],
  ],
  [
    ["START", "N1"],
    ["N1", "B1"],
    ["B1", "N7"],
    ["N7", "T2", "N5"],
    ["N5", "N6", "B5"],
    ["B5", "N4"],
    ["N4", "T4", "B7"],
    ["B7", "J3"],
    ["J3", "T5", "END2"],
  ],
  [
    ["START", "N1"],
    ["N1", "B1"],
    ["B1", "N7"],
    ["N7", "T2", "N5"],
    ["N5", "N6", "B5"],
    ["B5", "N4"],
    ["N4", "T4", "B7"],
    ["B7", "C3", "N8"],
    ["N8", "B8"],
    ["B8", "END3"],
  ],
  [
    ["START", "N1"],
    ["N1", "T1", "N2"],
    ["N2", "B2"],
    ["B2", "J1"],
    ["J1", "T3", "N3"],
    ["N3", "N4"],
    ["N4", "T4", "B7"],
    ["B7", "J3"],
    ["J3", "T5", "END2"],
  ],
  [
    ["START", "N1"],
    ["N1", "T1", "N2"],
    ["N2", "B2"],
    ["B2", "J1"],
    ["J1", "T3", "N3"],
    ["N3", "N4"],
    ["N4", "T4", "B7"],
    ["B7", "C3", "N8"],
    ["N8", "B8"],
    ["B8", "END3"],
  ],
  [
    ["START", "N1"],
    ["N1", "T1", "N2"],
    ["N2", "B2"],
    ["B2", "J1"],
    ["J1", "J2"],
    ["J2", "C2", "N4"],
    ["N4", "T4", "B7"],
    ["B7", "J3"],
    ["J3", "T5", "END2"],
  ],
  [
    ["START", "N1"],
    ["N1", "T1", "N2"],
    ["N2", "B2"],
    ["B2", "J1"],
    ["J1", "J2"],
    ["J2", "C2", "N4"],
    ["N4", "T4", "B7"],
    ["B7", "C3", "N8"],
    ["N8", "B8"],
    ["B8", "END3"],
  ],
  [
    ["START", "N1"],
    ["N1", "T1", "N2"],
    ["N2", "B2"],
    ["B2", "J1"],
    ["J1", "J2"],
    ["J2", "B6"],
    ["B6", "J3"],
    ["B7", "J3"],
    ["B7", "C3", "N8"],
    ["N8", "B8"],
    ["B8", "END3"],
  ],
];

// docs/맵 시간 배분.md의 B1~B8 구간 초. 지금 상자 길이는 BUILDING_DWELL_SEC로
// 균일하게 정한다(현재 맵 길이에 이 값들 10~15초가 다 들어가지 않아서) — 이 표는
// 건물별 체류 시간을 되살릴 때의 목표값으로 남겨 둔다.
const BUILDING_SEC = {
  B1: 10,
  B2: 10,
  B3: 15,
  B4: 10,
  B5: 10,
  B6: 10,
  B7: 11,
  B8: 10,
};

// 건물마다 실제 도로에서 어느 두 지점 사이에 서 있는지 — ROADS 그래프 그대로.
// B7만 없다 — B7은 진짜 3방향 갈림길(N4/T4 쪽, J3 쪽, C3 쪽)이라 방향이 하나로
// 안 정해진다. 그때그때 고른 경로가 실제로 어느 쪽에서 들어와 어느 쪽으로
// 나가는지를 보고 정한다(computeBuildings 안에서 처리).
const BUILDING_NEIGHBORS = {
  B1: ["N1", "N7"],
  B2: ["N2", "J1"],
  B3: ["C1", "N3"],
  B4: ["N3", "N5"],
  B5: ["N6", "N4"],
  B6: ["J2", "J3"],
  B8: ["N8", "END3"],
};

function dirVec(h) {
  return { x: Math.cos(h), z: Math.sin(h) };
}
function perpVec(h) {
  return { x: -Math.sin(h), z: Math.cos(h) };
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function pt(id) {
  return N[id];
}

// 노드 이름이 신호등(T#)·공사장(C#)이면 그 타입을, 아니면 null을 준다.
// 도로를 색칠할 때 이 노드 주변만 다른 색으로 칠하는 데 쓴다. 타입은 유지하고
// (S로 안 바꾼다) 색만 구분하는 것이 목적이다.
function nodeZone(name) {
  if (/^T\d+$/.test(name)) return "T";
  if (/^C\d+$/.test(name)) return "C";
  return null;
}

// 각 웨이포인트에서 "이 폭만큼 옆으로 벌리면 옆 구간과 이가 맞는" 방향을 구한다.
// 그냥 각 구간마다 자기 방향의 수직으로만 벌리면(perpVec(구간 heading)) 꺾이는
// 지점에서 안쪽은 틈이, 바깥쪽은 겹침(계단처럼 튀어나온 턱)이 생긴다 — 실제로
// 이 문제를 겪었다(docs/image.png). 인접한 두 구간의 수직 방향을 평균 내고
// 그 각도만큼 늘여서(마이터 조인) 폭을 유지하면 이음매가 깔끔하게 맞는다.
function offsetDirs(waypoints) {
  const n = waypoints.length;
  const headAt = (i, j) =>
    Math.atan2(
      waypoints[j][1] - waypoints[i][1],
      waypoints[j][0] - waypoints[i][0],
    );
  const dirs = [];
  for (let i = 0; i < n; i++) {
    let d;
    if (i === 0) d = perpVec(headAt(0, 1));
    else if (i === n - 1) d = perpVec(headAt(n - 2, n - 1));
    else {
      const p0 = perpVec(headAt(i - 1, i)),
        p1 = perpVec(headAt(i, i + 1));
      let mx = p0.x + p1.x,
        mz = p0.z + p1.z;
      const mlen = Math.hypot(mx, mz);
      if (mlen < 1e-6)
        d = p0; // 거의 정반대로 꺾이는 경우(급반전) — 평균이 0에 가까워 그냥 이전 방향 사용
      else {
        mx /= mlen;
        mz /= mlen;
        const cosHalf = clamp(mx * p0.x + mz * p0.z, 0.2, 1); // 너무 뾰족한 꺾임에서 과하게 안 늘어나게 제한
        d = { x: mx / cosHalf, z: mz / cosHalf };
      }
    }
    dirs.push(d);
  }
  return dirs;
}

// 홉 목록(각 홉이 노드 이름 배열)을 하나의 이어진 웨이포인트 이름·좌표로 편다.
// 이름도 같이 돌려주는 이유 — 건물(B7 등) 방향과 게이트 안내를 계산하려면
// 좌표만으론 부족하고, 그 지점이 무슨 노드였는지 알아야 한다.
function buildRouteWaypoints(hops) {
  let names = [...hops[0]];
  for (let i = 1; i < hops.length; i++) {
    let hop = hops[i];
    if (hop[0] !== names[names.length - 1]) hop = [...hop].reverse();
    names = names.concat(hop.slice(1));
  }
  return { names, waypoints: names.map(pt) };
}

// opts.onNavHint(event) — 큐 맨 앞 항목이 새로 안내될 때마다 그 항목 전체를
// 그대로 넘긴다(회전·게이트·공사장·신호등 전부). main.js가 이걸 그대로
// phone.pushMap(event)에 넘기면, 폰 쪽이 event.kind로 문장을 고른다
// (turn→event.lane, gate→event.door, construction/traffic→event.lane —
// phone-a.js pushMap 참고). world.js는 phone.js를 몰라도 되게(§1 파일 경계)
// 콜백 하나로만 내보낸다 — state.onGate/fireGate와 같은 모양의, 접점이 아닌
// "밖으로 내주는 함수".
export function createWorld(container, opts = {}) {
  const onNavHint = opts.onNavHint;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.bg);
  scene.fog = new THREE.Fog(COLOR.bg, 8, 90);
  // 나머지 오브젝트는 전부 MeshBasicMaterial(무광원)이라 빛의 영향을 안 받지만,
  // fence.glb는 GLTFLoader가 만드는 MeshStandardMaterial(PBR)이라 광원이 없으면
  // 새까맣게 나온다 — fence만을 위한 최소 광원.
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(5, 12, 3);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 300);

  // 시작할 때 유효 경로 7개 중 하나를 무작위로 고르고, 그 경로만 짓는다.
  const routeIndex = Math.floor(Math.random() * ROUTES.length);
  const { names: routeNames, waypoints } = buildRouteWaypoints(
    ROUTES[routeIndex],
  );
  const segments = toSegments(waypoints);
  const totalLength = segments.reduce((a, s) => a + s.len, 0);
  // 이 경로의 성공 제한 시간. 시작할 때 경로가 정해지면 함께 확정된다(요구사항).
  const timeLimitSec = totalLength / SPEED + TIME_LIMIT_BONUS_SEC;

  buildCityRoads(scene);
  // 행인 생성 금지 구간(게이트 + 신호등 구역)은 도로(pedRoads) 위의 s로 등록한다 —
  // 건물·게이트·이벤트가 pedRoads/spawnBlocks를 공유해야 같은 도로 객체로 매칭되므로
  // 여기서 한 번만 만들어 그대로 넘긴다. createPedestrians가 이 등록을 읽어야 하므로
  // 반드시 그보다 먼저 채운다(순서 중요).
  const pedRoads = buildPedRoads();
  const spawnBlocks = [];
  const buildings = buildBuildings(
    scene,
    routeNames,
    waypoints,
    pedRoads,
    spawnBlocks,
  );
  // 공사장(C)·신호등(T) 이벤트 — 바리게이트/안전 차선을 여기서 한 번만 정한다.
  // 신호등 구역엔 패널티용 군중(buildCrowd)이 이미 서 있으므로, 지도 전체에
  // 흩뿌리는 랜덤 배치 행인이 그 위에 겹쳐 나오지 않게 spawnBlocks에도
  // 등록한다(게이트와 같은 방식) — 다른 구역의 랜덤 행인은 그대로 둔다.
  const { events, navHints, barricadePending, trafficLightPending } =
    createEvents(
      scene,
      routeNames,
      segments,
      totalLength,
      pedRoads,
      spawnBlocks,
    );
  // barricade.glb도 비동기 로드 — fence.glb/tree.glb와 같은 패턴(자리는 미리
  // 잡아 두고, 모델은 로드되는 대로 붙인다). 폭(w)·높이(BARR_H)는 모든
  // 바리게이트가 같으니 스케일도 한 번만 계산한다.
  loadBarricadeUnit()
    .then((unit) => {
      const w = LANE_HALF * 0.95 * 2;
      const scaleX = w / unit.width,
        scaleY = BARR_H / unit.height;
      for (const group of barricadePending) {
        const clone = unit.unit.clone(true);
        clone.scale.set(scaleX, scaleY, scaleY);
        group.add(clone);
      }
    })
    .catch((err) => {
      console.error(
        "barricade.glb 로드 실패 — 공사장 바리게이트가 안 보인다",
        err,
      );
    });
  // trafficLight.glb — office/tree와 같은 loadModelUnit(이름→색 매핑)을 재사용한다.
  // 목표 높이는 light.glb(가로등, 목표 2.25)의 1.3배(요구사항).
  loadModelUnit(TRAFFICLIGHT_MODEL_URL, TRAFFICLIGHT_PART_COLOR)
    .then((unit) => {
      if (unit.height < 1e-6) return;
      const sc = TRAFFICLIGHT_TARGET_HEIGHT / unit.height;
      for (const group of trafficLightPending) {
        const clone = unit.unit.clone(true);
        clone.scale.setScalar(sc);
        group.add(clone);
      }
    })
    .catch((err) => {
      console.error(
        "trafficLight.glb 로드 실패 — 신호등 모델이 안 보인다",
        err,
      );
    });
  const peds = createPedestrians(scene, pedRoads, spawnBlocks);
  buildGoalMarker(scene, waypoints);
  // 안내 큐 — 회전·게이트·공사장/신호등 경고를 거리(s) 순서 하나로 합친다.
  // update()는 이 중 "아직 안 끝난 것 중 가장 가까운 것"(맨 앞) 하나만 본다.
  // 회전·경고는 판정이 없어서 도착하는 순간 그냥 resolved=true(통과)가 되고,
  // 게이트만 차선이 틀리면 resolved를 안 켜고 되돌린다 — 실패해도 소비되지
  // 않고 큐 맨 앞에 그대로 남는 이유(요구사항). door(정답 차선)는 게임 시작
  // 시 게이트마다 한 번만 뽑고 reset()에서도 유지한다(T/C 랜덤과 같은 원칙).
  const queue = [
    ...computeTurnHints(waypoints, routeNames).map((h) => ({
      kind: "turn",
      s: h.s,
      arrow: h.dir === "left" ? "←" : h.dir === "right" ? "→" : "↑",
      text: h.dir === "left" ? "왼쪽" : h.dir === "right" ? "오른쪽" : "직진",
      lane: h.dir === "left" ? 0 : h.dir === "right" ? 2 : 1, // onNavHint용
      resolved: false,
      announced: false,
    })),
    ...navHints.map((h) => ({
      ...h,
      resolved: false,
      announced: false,
    })),
    ...computeGateEvents(buildings, routeNames, segments),
  ].sort((a, b) => a.s - b.s);

  const toast = buildToast(container);

  // ── 주행 상태 ────────────────────────────────────
  let x = waypoints[0][0],
    z = waypoints[0][1],
    heading = 0,
    headingVel = 0;
  let pvx = 0,
    s = 0,
    arrived = false;
  let stun = 0, // 행인과 부딪힌 뒤 감속이 남은 시간
    hitCount = 0;
  let toastLeft = 0; // > 0 이면 잘못된 게이트 토스트가 떠 있고, 0이 되면 지운다

  function update(dt, input) {
    // 이동 전에: 신호등에 안전 차선이 아닌 채로 진입했는지(=갇힘) 먼저 판단한다.
    // 갇히면 좌/우회전·좌우 이동 입력을 막고 전진을 느리게 한다(요구사항).
    const prevS = s;
    const lane0 = nearestLane(lateralOffset(segments, x, z));
    const trap = stepEventControl(events, prevS, lane0);
    // 갇힘 시작·종료 경계에서만 안내 문구를 띄우고 지운다(요구사항) — sticky라
    // hideToast가 알아서 지우지 않으니 여기서 직접 뗀다.
    if (trap.trapStarted) {
      // 회전 입력으로 미세하게 틀어져 있던 시야를 즉시 정면(그 지점 길의 방향)
      // 으로 바로잡는다(요구사항) — 이후 회전 입력도 막히니 갇힌 동안 계속
      // 정면을 본다.
      heading = segHeadingAt(segments, prevS);
      headingVel = 0;
      showToast(toast, "⚠", "잘못된 길: 가속 및 방향 조작이 제한됩니다.", true);
    }
    if (trap.trapEnded) {
      toast.dataset.sticky = "";
      hideToast(toast);
    }
    // 잘못된 게이트 토스트 자동 소멸. 신호등 갇힘(sticky) 토스트가 이미 떠 있으면
    // hideToast가 sticky를 보고 건너뛰므로 여기서 실수로 지워지지 않는다.
    if (toastLeft > 0) {
      toastLeft = Math.max(0, toastLeft - dt);
      if (toastLeft === 0) hideToast(toast);
    }

    const turnLeft = !trap.trapped && !!(input && input.turnLeft),
      turnRight = !trap.trapped && !!(input && input.turnRight);
    const moveLeft = !trap.trapped && !!(input && input.moveLeft),
      moveRight = !trap.trapped && !!(input && input.moveRight);

    // 부스터 — 신호등 잘못된 차선에 갇힌 동안은 못 쓴다(요구사항). 게이지가
    // 남아 있는 동안만 켜지고, 0이 되면 다음 프레임부터 자동으로 꺼진다.
    const boosting =
      !trap.trapped && !!(input && input.boost) && state.gauge > 0;
    if (boosting) {
      state.gauge = Math.max(0, state.gauge - BOOST_DRAIN_PER_SEC * dt);
    }

    if (turnLeft && !turnRight) headingVel -= TURN_ACCEL * dt;
    else if (turnRight && !turnLeft) headingVel += TURN_ACCEL * dt;
    else
      headingVel -=
        Math.sign(headingVel) * Math.min(Math.abs(headingVel), TURN_DAMP * dt);
    headingVel = clamp(headingVel, -TURN_MAX, TURN_MAX);
    heading += headingVel * dt;

    const acc = STEER_ACCEL;
    if (moveLeft && !moveRight) pvx -= acc * dt;
    else if (moveRight && !moveLeft) pvx += acc * dt;
    else pvx -= Math.sign(pvx) * Math.min(Math.abs(pvx), STEER_DAMP * dt);
    pvx = clamp(pvx, -STEER_MAX, STEER_MAX);

    // 충돌 감속(collisionMul)은 world.js 안에서만 걸고 복귀 타이머도 여기서 관리한다
    // (AGENTS.md §2 — speedMul에 두면 퀴즈 쪽 복귀 타이머와 서로 지운다). 퀴즈 오답
    // 패널티(state.speedMul)는 B(quiz.js)가 기록하는 값을 곱해서만 반영한다 —
    // AGENTS.md §2가 못 박은 공식 SPEED * state.speedMul * collisionMul.
    const collisionMul = stun > 0 ? HIT_SLOW : 1;
    // 가속 중엔 무적(docs/기획_1차_보완.md §조작) — 충돌 감속(collisionMul)과
    // 퀴즈 감속(state.speedMul)을 모두 무시하고 BOOST_SPEED를 그대로 낸다.
    const forward = trap.trapped
      ? trap.trapSpeed
      : boosting
        ? BOOST_SPEED
        : SPEED * state.speedMul * collisionMul;
    const fwd = dirVec(heading),
      perp = perpVec(heading);
    let nx = x + (fwd.x * forward + perp.x * pvx) * dt;
    let nz = z + (fwd.z * forward + perp.z * pvx) * dt;
    ({ x: nx, z: nz } = clampToRoad(segments, nx, nz));
    x = nx;
    z = nz;

    // 이벤트: 바리게이트 상승·차단, 군중 이동·안전 차선 열기. s도 여기서 확정한다
    // (바리게이트에 막히면 s가 그 앞으로 고정된다).
    ({ x, z, s } = stepEventVisual(events, dt, prevS, x, z, heading, segments));

    // 안내 큐 — 맨 앞(아직 안 끝난 것 중 가장 가까운 것) 하나만 본다. 뒤에
    // 있는 항목은 앞이 안 끝나면 절대 안내되지 않는다 — 여러 항목이 각자
    // lookahead로 동시에 안내되던 예전 방식(간격이 lookahead보다 좁은 게이트가
    // 연달아 있으면 뒤엣것이 먼저 뜨고 못 보고 지나치던 문제)이 이걸로 없어진다.
    if (!arrived && !trap.trapped) {
      const front = queue.find((e) => !e.resolved);
      if (front) {
        if (!front.announced && s + HINT_LOOKAHEAD >= front.s) {
          front.announced = true;
          if (onNavHint) onNavHint(front);
        }
        // prevS < front.s를 함께 요구하면 안 된다 — N4처럼 실제로 꺾이는 갈림길
        // 바로 뒤에 다음 안내(T4 신호등 등)가 1유닛 간격으로 바짝 붙어 있으면,
        // 회전 중 한 프레임이 두 s를 동시에 넘는 순간 앞엣것만 resolved되고
        // 뒤엣것은 prevS가 이미 자기 s를 지나친 채로 front가 된다 — 그러면 이
        // 조건을 다시는 못 만족해 뒤엣것부터 끝까지 안내가 통째로 멈춘다(B7 이후
        // 안내가 안 뜨던 원인). s >= front.s만 보면 늦게라도(다음 프레임에) 반드시
        // resolved된다.
        if (s >= front.s) {
          if (front.kind === "gate") {
            const lane = nearestLane(
              lateralOffset(segments, x, z),
              GATE_DOOR_X,
            );
            if (lane === front.door) {
              front.resolved = true;
            } else {
              // 잘못된 문 — 되돌리기 전에 신호등 패널티와 같은 토스트로 알린다(요구사항).
              // 큐를 소비하지 않는다(resolved 유지 false). 되돌린 자리에서 다시
              // 접근하면 announced가 꺼져 있어 같은 안내가 다시 뜬다.
              showToast(toast, "⚠", "잘못된 게이트 진입", false);
              toastLeft = WRONG_GATE_TOAST_SEC;
              s = Math.max(0, s - durationToDistance(WRONG_CHOICE_REWIND));
              const p = pointAtArcLength(segments, s, 0);
              x = p.x;
              z = p.z;
              heading = segHeadingAt(segments, s);
              headingVel = 0;
              pvx = 0;
              front.announced = false;
            }
          } else {
            // 회전·공사장/신호등 경고는 판정이 없다 — 지나치면 그냥 통과.
            front.resolved = true;
          }
        }
      }
    }

    // 행인 이동·빌보드·충돌. 감속 중이거나 갇힌 동안엔 재판정하지 않는다.
    if (stun > 0) stun = Math.max(0, stun - dt);
    const hit = stepPedestrians(
      peds,
      dt,
      x,
      z,
      heading,
      stun <= 0 && !trap.trapped,
    );
    // 가속 중엔 무적이라 부딪혀도 사람만 밀치고 지나간다 — hitCount·감속·
    // 넉백을 적용하지 않는다(stepPedestrians가 이미 그 행인을 hit 처리해
    // 다시 판정 대상이 되지는 않는다).
    if (hit && !boosting) {
      hitCount++;
      stun = HIT_STUN;
      pvx = hit.pushSign * HIT_KNOCK; // 옆으로 튕긴다
    }

    if (!arrived && s >= totalLength - 1) {
      arrived = true;
      hideToast(toast); // 도착 UI(결과·시간·다시 시작)는 main.js가 띄운다
    }
  }

  // 현재 맵 그대로 처음부터 다시 — 지오메트리(길·건물·행인 메시)는 그대로 두고
  // 움직이는 상태만 초기화한다. 행인은 원래 자리(s0)로 되돌리고 부딪힘 표시를 지운다.
  function reset() {
    x = waypoints[0][0];
    z = waypoints[0][1];
    heading = 0;
    headingVel = 0;
    pvx = 0;
    s = 0;
    arrived = false;
    stun = 0;
    hitCount = 0;
    toastLeft = 0;
    for (const p of peds) {
      p.s = p.s0;
      p.hit = false;
    }
    resetEvents(events);
    // 문 번호(door) 등 게임 시작 시 뽑은 값은 다시 뽑지 않는다 — T/C 차선과
    // 같은 원칙(같은 판 안에서는 랜덤이 한 번뿐). 큐 진행 상태만 되돌린다.
    for (const item of queue) {
      item.resolved = false;
      item.announced = false;
    }
    // 재시작 시점에 이전 판의 잘못된 차선 경고가 sticky로 남아 있을 수 있어 지운다.
    toast.dataset.sticky = "";
    hideToast(toast);
  }

  function render() {
    camera.position.set(x, EYE, z);
    const look = dirVec(heading);
    camera.lookAt(x + look.x, EYE, z + look.z);
    renderer.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth || 1,
      h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  resize();

  return {
    update,
    render,
    resize,
    reset,
    get hits() {
      return hitCount;
    }, // 행인과 부딪힌 누적 횟수 — main.js가 HUD로 읽는다
    get distance() {
      return s;
    },
    get arrived() {
      return arrived;
    }, // 도착 여부 — main.js가 타이머를 멈추고 결과를 띄운다
    get timeLimit() {
      return timeLimitSec;
    }, // 이 경로의 성공 제한 시간(초) — main.js 시간 게이지가 elapsed/timeLimit로 채운다
  };
}

// ── 경로 좌표 헬퍼 ────────────────────────────────
function toSegments(waypoints) {
  const segs = [];
  let acc = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [x0, z0] = waypoints[i],
      [x1, z1] = waypoints[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    segs.push({ x0, z0, x1, z1, len, startS: acc });
    acc += len;
  }
  return segs;
}

function clampToRoad(segments, x, z) {
  let best = null;
  for (const seg of segments) {
    const dx = seg.x1 - seg.x0,
      dz = seg.z1 - seg.z0;
    const len2 = dx * dx + dz * dz;
    const t =
      len2 > 0
        ? clamp(((x - seg.x0) * dx + (z - seg.z0) * dz) / len2, 0, 1)
        : 0;
    const cx = seg.x0 + dx * t,
      cz = seg.z0 + dz * t;
    const ddx = x - cx,
      ddz = z - cz;
    const dist = Math.hypot(ddx, ddz);
    if (!best || dist < best.dist) best = { dist, cx, cz, ddx, ddz };
  }
  const limit = ROAD_HALF - PLAYER_MARGIN; // 벽 텍스처에 실제로 파묻히지 않게 여유를 둔다
  if (!best || best.dist <= limit) return { x, z };
  const k = limit / best.dist;
  return { x: best.cx + best.ddx * k, z: best.cz + best.ddz * k };
}

function nearestArcLength(segments, x, z) {
  let best = null,
    bestS = 0;
  for (const seg of segments) {
    const dx = seg.x1 - seg.x0,
      dz = seg.z1 - seg.z0;
    const len2 = dx * dx + dz * dz;
    const t =
      len2 > 0
        ? clamp(((x - seg.x0) * dx + (z - seg.z0) * dz) / len2, 0, 1)
        : 0;
    const cx = seg.x0 + dx * t,
      cz = seg.z0 + dz * t;
    const dist = Math.hypot(x - cx, z - cz);
    // best===0(정확히 그 선분 위)일 때 !best가 true가 되는 버그가 있었다 — 그
    // 뒤로 훑는 아무 선분에나 최고 기록이 덮어써져서, 선분 경계에 정확히
    // 걸치는 건물 게이트의 s가 완전히 엉뚱한 값으로 나왔다(문 안내가 안 뜨던 원인).
    if (best === null || dist < best) {
      best = dist;
      bestS = seg.startS + t * seg.len;
    }
  }
  return bestS;
}

// ── s(진행 거리) 기반 생성 금지 구간 ──────────────────
// 행인은 도로망(ROADS) 전체에 흩어 세우므로(createPedestrians), "이 지점 근처엔
// 두지 않는다"를 세계 좌표(x, z) 거리가 아니라 그 행인이 걷는 도로 위에서의 s로
// 판정한다 — 같은 도로가 아니면 애초에 비교 대상이 아니다. 도로 식별은
// mergeStraightRoads가 만든 이름 체인(pedRoads)을 그대로 객체 참조로 쓴다(문자열
// 키를 만들 필요가 없다 — 생성 쪽과 소비 쪽이 항상 같은 pedRoads 배열을 공유한다).
//
// 게이트가 첫 사용처지만 구간 등록 자체는 게이트를 모른다 — 신호등(T)·공사장(C)
// 이벤트도 자기 s와 반경만 정해서 addSpawnBlock을 호출하면 동일한 방식으로 생성
// 금지 구간이 는다.
function buildPedRoads() {
  return mergeStraightRoads(ROADS).map((names) => ({
    names,
    segs: toSegments(names.map(pt)),
  }));
}

// 이름(들)이 함께 들어 있는 합쳐진 도로를 찾는다. 건물은 대부분 도수 2라 이웃
// 둘과 함께 도로 하나로 합쳐지므로 id만으로 찾을 수 있다. B7은 도수 3이라 세
// 방향이 서로 다른 도로에 남으므로, 어느 방향(nb)인지까지 같이 봐야 한다.
function findPedRoad(pedRoads, id, nb) {
  return pedRoads.find(
    (r) => r.names.includes(id) && (!nb || r.names.includes(nb)),
  );
}

function addSpawnBlock(spawnBlocks, road, s, clear) {
  if (road) spawnBlocks.push({ road, s, clear });
}

function isSpawnBlocked(spawnBlocks, road, s) {
  return spawnBlocks.some(
    (b) => b.road === road && Math.abs(s - b.s) < b.clear,
  );
}

// 경로 진행거리 s와 좌우 오프셋 off로 월드 좌표를 구한다 — 행인을 "길 위 어디쯤,
// 중앙선에서 얼마만큼 옆"으로 배치·이동시키는 데 쓴다. 길이 꺾여도 s만 따라가면
// 알아서 굽은 복도를 탄다. cx/cz는 중앙선 위 점(충돌 판정 등에 쓸 수 있게 같이 준다).
function pointAtArcLength(segments, s, off) {
  let seg = segments[0];
  for (const sg of segments) {
    if (s <= sg.startS + sg.len) {
      seg = sg;
      break;
    }
    seg = sg; // s가 전체 길이를 넘으면 마지막 선분 끝
  }
  const t = seg.len > 0 ? clamp((s - seg.startS) / seg.len, 0, 1) : 0;
  const cx = seg.x0 + (seg.x1 - seg.x0) * t,
    cz = seg.z0 + (seg.z1 - seg.z0) * t;
  const p = perpVec(Math.atan2(seg.z1 - seg.z0, seg.x1 - seg.x0));
  return { x: cx + p.x * off, z: cz + p.z * off, cx, cz };
}

// ── 행인(보행자) ──────────────────────────────────
// 행인은 카메라를 향해 서는 납작한 판(빌보드)이다 — prototype이 z를 향한 사각형을
// 그린 것과 같은데, 여기선 길이 꺾이므로 매 프레임 플레이어 쪽으로 Y축만 돌린다.
// 지오메트리는 원점 기준(로컬 XY 평면, 발이 y=0)으로 만들어 위치·회전만 갱신한다.
function pedBillboardGeometry(halfW, y0, y1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([
        -halfW,
        y0,
        0,
        halfW,
        y0,
        0,
        halfW,
        y1,
        0,
        -halfW,
        y1,
        0,
      ]),
      3,
    ),
  );
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  return geo;
}

// 맵 전체 도로망에 행인을 흩어 세운다 — 플레이어가 걷는 경로뿐 아니라 다른 길에도.
// 각 논리 도로(pedRoads, mergeStraightRoads 결과)를 자기 진행거리로 따라가며 같은
// 간격(prototype 상수)으로 배치하므로, 어디를 봐도 밀도가 같고 특정 구간에 몰리지
// 않는다. 몸통·머리 지오메트리와 재질은 하나씩만 만들어 공유한다. 건물 기준 생성
// 제한은 없다(건물 내부 포함 자유 배치) — 게이트(spawnBlocks) 근처와 출발 지점
// 바로 앞만 비운다.
function createPedestrians(scene, pedRoads, spawnBlocks) {
  const bodyGeo = pedBillboardGeometry(PED_HALF, 0, PED_BODY_H);
  const headGeo = pedBillboardGeometry(PED_HEAD_HALF, PED_BODY_H, PED_HEAD_TOP);
  const bodyMat = new THREE.MeshBasicMaterial({
    color: COLOR.ped,
    side: THREE.DoubleSide,
  });
  const headMat = new THREE.MeshBasicMaterial({
    color: COLOR.pedHead,
    side: THREE.DoubleSide,
  });

  const startPt = pt("START");

  const peds = [];
  for (const road of pedRoads) {
    const { segs } = road;
    const len = segs.reduce((a, sg) => a + sg.len, 0);
    if (len < PED_GAP_MIN) continue;
    for (
      let s = PED_GAP_MIN;
      s < len - 1;
      s += PED_GAP_MIN + Math.random() * PED_GAP_VAR
    ) {
      if (isSpawnBlocked(spawnBlocks, road, s)) continue;
      const off = (Math.random() * 2 - 1) * PED_LANE_HALF;
      const c = pointAtArcLength(segs, s, off);
      if (Math.hypot(c.x - startPt[0], c.z - startPt[1]) < PED_START_S)
        continue;
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      const head = new THREE.Mesh(headGeo, headMat);
      scene.add(body);
      scene.add(head);
      peds.push({
        segs,
        len,
        s,
        s0: s,
        off,
        v: PED_SPEED_MIN + Math.random() * PED_SPEED_VAR,
        dir: Math.random() < 0.5 ? -1 : 1, // 도로 따라 오가는 방향(양방향 섞임)
        sway: Math.random() * Math.PI * 2,
        hit: false,
        body,
        head,
      });
    }
  }
  return peds;
}

// 매 프레임: 행인을 자기 도로를 따라 걷게 하고(끝에 닿으면 반대 끝으로 되돌아
// 흐른다), 좌우로 살짝 흔들고(sway), 플레이어를 향해 빌보드 회전시킨다. 행인은
// 자기 도로(segs)를 가지므로 경로 밖 도로의 행인도 각자 걷는다. canHit일 때만
// (감속 중이 아닐 때만) 충돌을 판정한다 — 한 프레임에 한 번만. 부딪힌 행인은
// hit로 표시해 다시 세지 않는다. 반환값은 부딪힘 여부와 튕길 방향(±1).
function stepPedestrians(peds, dt, px, pz, heading, canHit) {
  const fwd = dirVec(heading),
    perp = perpVec(heading);
  let hit = null;
  for (const p of peds) {
    p.s += p.dir * p.v * dt;
    if (p.s < 0) p.s += p.len;
    else if (p.s > p.len) p.s -= p.len;
    p.sway += dt * 3;
    const pos = pointAtArcLength(p.segs, p.s, p.off + Math.sin(p.sway) * 0.12);
    p.body.position.set(pos.x, 0, pos.z);
    p.head.position.set(pos.x, 0, pos.z);
    const theta = Math.atan2(px - pos.x, pz - pos.z); // 플레이어를 바라보게
    p.body.rotation.y = theta;
    p.head.rotation.y = theta;
    // 충돌은 원이 아니라 상자로 판정한다 — prototype처럼 진행방향으로 ±HIT_DEPTH,
    // 좌우로 ±HIT_HALF. 원(반경)으로 하면 빠른 전진 때 판정 창이 너무 얕아 거의
    // 안 부딪힌다. 진행방향/좌우 성분으로 분해해서 각각 임계값과 비교한다.
    if (canHit && !p.hit && !hit) {
      const rx = pos.x - px,
        rz = pos.z - pz;
      const fwdGap = rx * fwd.x + rz * fwd.z,
        latGap = rx * perp.x + rz * perp.z;
      if (Math.abs(fwdGap) < HIT_DEPTH && Math.abs(latGap) < HIT_HALF) {
        p.hit = true;
        hit = { pushSign: latGap >= 0 ? -1 : 1 }; // 행인 반대쪽으로 튕긴다
      }
    }
  }
  return hit;
}

// ── 이벤트(공사장 C · 신호등 T) ─────────────────────
// 경로 위 좌표 헬퍼들 — 차선 판정과 바리게이트·군중 배치에 쓴다.
function segHeadingAt(segments, s) {
  let seg = segments[0];
  for (const sg of segments) {
    if (s <= sg.startS + sg.len) {
      seg = sg;
      break;
    }
    seg = sg;
  }
  return Math.atan2(seg.z1 - seg.z0, seg.x1 - seg.x0);
}

// 플레이어의 중앙선 대비 좌우 오프셋(부호 포함). 왼쪽 음수, 오른쪽 양수(perpVec 기준).
function lateralOffset(segments, x, z) {
  let best = Infinity,
    lat = 0;
  for (const seg of segments) {
    const dx = seg.x1 - seg.x0,
      dz = seg.z1 - seg.z0,
      l2 = dx * dx + dz * dz;
    const t =
      l2 > 0 ? clamp(((x - seg.x0) * dx + (z - seg.z0) * dz) / l2, 0, 1) : 0;
    const cx = seg.x0 + dx * t,
      cz = seg.z0 + dz * t;
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) {
      best = d;
      const p = perpVec(Math.atan2(dz, dx));
      lat = (x - cx) * p.x + (z - cz) * p.z;
    }
  }
  return lat;
}

function nearestLane(lat, positions = LANE_X) {
  let best = 0,
    bd = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const d = Math.abs(lat - positions[i]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// 경로 위 T/C 노드마다 이벤트를 만든다. 바리게이트 차선(C)·안전 차선(T)은 여기서
// 딱 한 번 랜덤으로 정하고, 통과할 때까지 바뀌지 않는다(요구사항). 메시(바리게이트·
// 군중)도 여기서 만든다. 반환: events 배열과, 안내 토스트로 쓸 navHints.
// pedRoads/spawnBlocks는 신호등(T) 구역에 랜덤 배치 행인이 겹쳐 나오지 않게
// 막는 데만 쓴다(게이트와 같은 방식) — createPedestrians보다 먼저 호출돼야 한다.
function createEvents(
  scene,
  routeNames,
  segments,
  totalLength,
  pedRoads,
  spawnBlocks,
) {
  const events = [];
  const navHints = [];
  const nodeS = (i) => (i < segments.length ? segments[i].startS : totalLength);

  const bodyGeo = pedBillboardGeometry(PED_HALF, 0, PED_BODY_H);
  const headGeo = pedBillboardGeometry(PED_HEAD_HALF, PED_BODY_H, PED_HEAD_TOP);
  const bodyMat = new THREE.MeshBasicMaterial({
    color: COLOR.ped,
    side: THREE.DoubleSide,
  });
  const headMat = new THREE.MeshBasicMaterial({
    color: COLOR.pedHead,
    side: THREE.DoubleSide,
  });
  // barricade.glb는 비동기로 로드되므로, 자리(위치·회전)만 여기서 정해 빈
  // 그룹을 세워 두고 모델은 loadBarricadeUnit이 끝난 뒤 붙인다(fence.glb와
  // 같은 방식) — 그 그룹을 여기 모아 뒀다가 createWorld가 로드 완료 후 순회한다.
  const barricadePending = [];
  // trafficLight.glb도 같은 패턴(비동기 로드) — 자리만 여기서 잡아 두고
  // createWorld가 로드 완료 후 순회하며 clone을 붙인다.
  const trafficLightPending = [];

  for (let i = 1; i < routeNames.length - 1; i++) {
    const zone = nodeZone(routeNames[i]);
    if (!zone) continue;
    const centerS = nodeS(i);
    // 미리 알려주는 폭(BARR_LEAD_SEC·TL_HALF_SEC + 6)이 바로 앞 구간보다 길면
    // 안내 s가 앞 노드(갈림길 등)보다 먼저 새어나가 안내 순서가 뒤바뀐다 —
    // 예: N4→T4는 14.7유닛인데 신호등 사전 안내 폭은 18유닛이라, 클램프가
    // 없으면 T4 안내가 N4의 갈림길 안내보다 먼저 떴다(모든 경로에서 재현,
    // docs/map/맵 시간 배분.md §4-1과 대조해 확인). nodeS(i-1)을 하한으로 둔다.
    //
    // 하한을 nodeS(i-1) 그대로 쓰면 앞 노드가 실제 갈림길(computeTurnHints의
    // turn 항목)일 때 두 안내의 s가 정확히 같아진다 — update()의 전진 판정은
    // prevS < front.s && s >= front.s라서, s가 같은 두 항목 중 앞엣것이 그
    // 지점을 지나가는 순간 뒤엣것은 이미 prevS >= front.s인 채로 front가 되어
    // 영원히 그 조건을 못 만족한다. 그러면 안내 큐 전체가 거기서 멈춘다 —
    // T4 뒤의 B7, C3 뒤의 B8 안내가 통째로 안 뜨던 원인이 이것이었다(update()의
    // announced/resolved 전이를 그대로 시뮬레이션해서 재현·확인). +1로 반드시
    // 앞 노드보다 뒤에 오게 한다.
    const navFloor = nodeS(i - 1) + 1;

    if (zone === "C") {
      const lane = Math.floor(Math.random() * 3);
      const barrS = centerS - durationToDistance(ZONE_SEC) / 2; // 공사장 출구
      const mesh = buildBarricadeGroup(segments, barrS, lane);
      scene.add(mesh);
      barricadePending.push(mesh);
      events.push({ type: "C", lane, centerS, barrS, mesh, risen: 0 });
      navHints.push({
        kind: "construction",
        s: Math.max(centerS - durationToDistance(BARR_LEAD_SEC) - 6, navFloor),
        arrow: "⚠",
        text: `주의!! ${LANE_NAME[lane]} 공사 중`,
        lane, // phone.pushMap(event)이 event.lane으로 읽는다 — 막힌(피해야 할) 차선
      });
    } else {
      const safeLane = Math.floor(Math.random() * 3);
      const half = durationToDistance(TL_HALF_SEC);
      // 색칠된(=펜스 없는) 구역의 반폭 — expandZones가 벽을 안 세우는 구간과
      // 정확히 같은 폭(ZONE_SEC)이다. endS를 TL_HALF_SEC 대신 여기 맞춰서,
      // 안전 차선을 못 타 끌려가는 구간이 펜스가 다시 시작되는 지점을 넘지
      // 않게 한다 — 넘으면 펜스 있는 구간에서까지 계속 끌려가 보였다(요구사항).
      const zoneHalf = durationToDistance(ZONE_SEC) / 2;
      const startS = centerS - half,
        endS = centerS + zoneHalf;
      // 군중은 갇힘 판정 구간(startS)이 아니라 실제로 색칠되는 노란 구역
      // 경계에 세운다(요구사항) — expandZones와 같은 폭(ZONE_SEC)을 쓴다.
      const zoneStartS = centerS - zoneHalf;
      const crowd = buildCrowd(
        scene,
        segments,
        zoneStartS,
        bodyGeo,
        headGeo,
        bodyMat,
        headMat,
      );
      // 이 구역엔 패널티용 군중이 이미 서 있다 — 지도 전체에 흩뿌리는 랜덤 배치
      // 행인이 그 위에 겹쳐 나오면 사람이 몰려 보이고 충돌 판정도 꼬인다. 갇힘
      // 판정 구간(startS~endS)과 같은 반경(half)으로 이 구역만 생성 금지시킨다 —
      // 다른 구역의 랜덤 행인은 건드리지 않는다.
      const road = findPedRoad(pedRoads, routeNames[i]);
      if (road) {
        const TRAFFICLIGHT_TARGET_HEIGHT = LIGHT_TARGET_HEIGHT * 1.5;
        const centerPt = pointAtArcLength(segments, centerS, 0);
        addSpawnBlock(
          spawnBlocks,
          road,
          nearestArcLength(road.segs, centerPt.x, centerPt.z),
          half,
        );
      }
      events.push({
        type: "T",
        safeLane,
        centerS,
        startS,
        endS,
        crowd,
        opened: false,
        phase: "pending", // pending → active(통과/갇힘 결정됨) → done
        trap: false,
        trapSpeed: 3, ////
      });
      // 구역 끝지점(endS, 펜스가 다시 시작되는 바로 그 지점)의 우측 펜스 앞에
      // trafficLight.glb를 세운다(요구사항) — endS는 바로 위에서 zoneHalf로
      // 다시 잡은 그 좌표라 펜스 시작점과 정확히 맞아떨어진다.
      const tlGroup = buildTrafficLightGroup(segments, endS);
      scene.add(tlGroup);
      trafficLightPending.push(tlGroup);
      navHints.push({
        kind: "traffic",
        s: Math.max(startS - 6, navFloor),
        arrow: "↑",
        text: `${LANE_NAME[safeLane]}로 건너기`,
        lane: safeLane, // phone.pushMap(event)이 event.lane으로 읽는다 — 건너야 할(안전한) 차선
      });
    }
  }
  return { events, navHints, barricadePending, trafficLightPending };
}

// 바리게이트 자리 — 차선 폭 중앙에 빈 그룹만 세운다(위치·회전). barricade.glb는
// 비동기로 로드되므로 모델은 없이 시작하고, loadBarricadeUnit이 끝나면
// createWorld가 이 그룹에 clone을 붙인다(barricadePending). 처음엔 지하
// (position.y = -BARR_H)에 숨겼다가 y만 올려 등장시키는 것은 그대로다 — 그룹도
// Object3D라 애니메이션 코드가 손 안 대고 그대로 동작한다.
function buildBarricadeGroup(segments, barrS, lane) {
  const c = pointAtArcLength(segments, barrS, 0);
  const perp = perpVec(segHeadingAt(segments, barrS));
  const cx = c.x + perp.x * LANE_X[lane],
    cz = c.z + perp.z * LANE_X[lane];
  const group = new THREE.Group();
  group.position.set(cx, -BARR_H, cz); // 지하에 숨겨 둔다
  group.rotation.y = Math.atan2(-perp.z, perp.x); // 로컬 +X를 perp(차선을 가로지르는) 방향으로
  return group;
}

// 신호등 구역 끝(s, 펜스가 다시 시작되는 지점)의 우측 펜스 바로 앞에 자리를 잡는다.
// trafficLight.glb도 비동기 로드라 barricade와 같은 패턴 — 빈 그룹만 여기서 세우고
// createWorld가 loadModelUnit 완료 후 clone을 붙인다(trafficLightPending).
function buildTrafficLightGroup(segments, s) {
  const heading = segHeadingAt(segments, s);
  const c = pointAtArcLength(segments, s, 0);
  const perp = perpVec(heading);
  // LANE_X처럼 +side가 오른쪽이다(§LANE_NAME) — ROAD_HALF+0.8은 가로등(light.glb)과
  // 같은 여유폭. 펜스는 정확히 ROAD_HALF에 서므로 이 정도 바깥이 "펜스 바로 앞"이다.
  const cx = c.x + perp.x * (ROAD_HALF + 0.8),
    cz = c.z + perp.z * (ROAD_HALF + 0.8);
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  // buildGoalMarker의 회사 건물과 같은 이유로 오는 방향(-fwd)을 보게 한다 —
  // 신호등 얼굴이 다가오는 플레이어를 향해야 신호가 보인다.
  const fwd = dirVec(heading);
  group.rotation.y = Math.atan2(-fwd.x, -fwd.z);
  return group;
}

// 신호등 군중 — 노란 벽(시각 구역, zoneStartS)을 기준으로 가로 2줄(줄마다 세
// 차선 모두)로 세운다. zoneStartS는 게임 로직상의 갇힘 구간(startS)이 아니라
// 실제로 색칠된 구역의 경계다 — 로직 구간(TL_HALF_SEC 기준)이 시각 구역
// (ZONE_SEC 기준)보다 넓어서, 로직 startS를 그대로 쓰면 군중이 일반 도로(S) 위로
// 튀어나와 있었다(버그 리포트). 마지막 줄(플레이어가 먼저 만나는, 문지기 역할)을
// 노란 벽 바로 앞(zoneStartS)에 세우고, 나머지 한 줄은 그만큼 벽 안쪽
// (zoneStartS + GAP)으로 넣는다(요구사항) — 둘 다 노란 구역 안에 머문다. 자리
// 하나(줄×차선)에 TL_CROWD_PER_SLOT명을 겹쳐도 되게 살짝 흩어(지터) 세워 사람이
// 더 많아 보이게 한다(요구사항). 각 행인은 home 위치를 기억하고(재시작 시
// 되돌아갈 자리), 안전 차선이 열리면 그 차선 행인만 나머지 두 차선으로 흩어져
// 비켜선다.
function buildCrowd(
  scene,
  segments,
  zoneStartS,
  bodyGeo,
  headGeo,
  bodyMat,
  headMat,
) {
  const crowd = [];
  for (let row = 0; row < 2; row++) {
    const cs = zoneStartS + (1 - row) * TL_CROWD_GAP; // row0(안쪽)=+GAP, row1(마지막,벽 앞)=zoneStartS
    for (let lane = 0; lane < 3; lane++) {
      for (let n = 0; n < TL_CROWD_PER_SLOT; n++) {
        const s0 = cs + (Math.random() * 2 - 1) * TL_CROWD_JITTER_S;
        const off0 =
          LANE_X[lane] + (Math.random() * 2 - 1) * TL_CROWD_JITTER_LAT;
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        const head = new THREE.Mesh(headGeo, headMat);
        scene.add(body);
        scene.add(head);
        crowd.push({
          s: s0,
          s0,
          lane,
          homeOff: off0,
          off: off0,
          targetOff: off0,
          sway: Math.random() * Math.PI * 2,
          body,
          head,
        });
      }
    }
  }
  return crowd;
}

// 이벤트 상태 갱신 중 "조작 제약"만 먼저 판단한다(이동 계산 전에 호출). 신호등
// 구역에 들어선 뒤(startS + TL_JUDGE_DELAY_SEC 이동 거리) 안전 차선이 아니면
// 갇힌다(phase=active, trap=true) — 진입선에서 바로 판정하면 "들어가자마자
// 정해진다"는 느낌이 들어 그만큼 더 들어간 지점의 차선으로 판정한다(요구사항).
// 갇힘이 결정되면 구역이 끝날 때까지 유지된다. trapStarted/trapEnded는 갇힘이
// 이번 프레임에 막 시작·종료됐는지 알려준다 — 호출부(update)가 이 경계에서만
// 안내 문구를 띄우고 지우면 되게 하려는 것(매 프레임 다시 그릴 필요 없음).
// 반환: { trapped, trapSpeed, trapStarted, trapEnded }.
function stepEventControl(events, s, lane) {
  let trapped = false,
    trapSpeed = SPEED,
    trapStarted = false,
    trapEnded = false;
  for (const ev of events) {
    if (ev.type !== "T") continue;
    if (
      ev.phase === "pending" &&
      s >= ev.startS + durationToDistance(TL_JUDGE_DELAY_SEC)
    ) {
      ev.phase = "active";
      ev.trap = lane !== ev.safeLane; // 판정 지점 차선으로 통과/갇힘 확정
      if (ev.trap) trapStarted = true;
    }
    if (ev.phase === "active" && s >= ev.endS) {
      ev.phase = "done";
      if (ev.trap) trapEnded = true;
    }
    if (ev.phase === "active" && ev.trap) {
      trapped = true;
      trapSpeed = ev.trapSpeed;
    }
  }
  return { trapped, trapSpeed, trapStarted, trapEnded };
}

// 이동을 마친 뒤: 바리게이트를 올리고(플레이어가 가까워지면), 막힌 차선이면 전진을
// 막고, 군중을 움직인다(안전 차선 열기 + 빌보드). 바리게이트에 막히면 조정된
// {x, z, s}를 준다.
function stepEventVisual(events, dt, prevS, x, z, heading, segments) {
  let s = nearestArcLength(segments, x, z);
  let lat = lateralOffset(segments, x, z);
  let lane = nearestLane(lat);

  for (const ev of events) {
    if (ev.type === "C") {
      // 도착 약 2초 전부터 올라온다
      if (
        prevS >= ev.barrS - durationToDistance(BARR_LEAD_SEC) &&
        ev.risen < 1
      ) {
        ev.risen = Math.min(1, ev.risen + dt / BARR_RISE_SEC);
        ev.mesh.position.y = -BARR_H * (1 - ev.risen);
      }
      // 다 올라온 뒤, 막힌 차선으로 앞서 나가려 하면 바리게이트 앞에서 멈춘다.
      // 다른 차선이면 그냥 지나간다(우회).
      if (
        ev.risen >= 0.8 &&
        lane === ev.lane &&
        prevS < ev.barrS &&
        s > ev.barrS - BARR_STOP
      ) {
        s = ev.barrS - BARR_STOP;
        const p = pointAtArcLength(segments, s, lat);
        x = p.x;
        z = p.z;
      }
    } else {
      // 신호등: 판정이 끝난 뒤(phase active)엔 이번 프레임에 플레이어가 실제로
      // 전진한 만큼(s - prevS) 군중도 같이 전진시킨다. 갇혔을 때는 사람들 사이에
      // 끼여 함께 떠밀려 가는 느낌을(요구사항), 올바른 차선으로 통과할 때는 안전
      // 차선을 비운 옆 차선 사람들이 플레이어와 나란히 직진하는 느낌을 준다
      // (요구사항) — 어느 쪽이든 판정된 뒤에는 군중이 제자리에 머물지 않는다.
      if (ev.phase === "active") {
        const advance = s - prevS;
        for (const c of ev.crowd) c.s += advance;
      }
      // 충돌 약 0.5초 전 안전 차선을 연다(그 차선 행인들이 옆으로 비켜선다).
      if (
        !ev.opened &&
        prevS >= ev.startS - durationToDistance(TL_OPEN_LEAD_SEC)
      ) {
        ev.opened = true;
        // 안내 차선만 비우고 그 자리에 있던 사람들은 나머지 두 차선으로 나눠
        // 흩어진다(요구사항) — 한쪽 차선에만 몰아넣지 않는다.
        const others = [0, 1, 2].filter((l) => l !== ev.safeLane);
        let i = 0;
        for (const c of ev.crowd) {
          if (c.lane === ev.safeLane) {
            c.targetOff = LANE_X[others[i % others.length]];
            i++;
          }
        }
      }
      for (const c of ev.crowd) {
        // 목표 차선으로 스르륵 이동 + 좌우 흔들림
        const d = c.targetOff - c.off;
        c.off += clamp(d, -TL_STEP * dt, TL_STEP * dt);
        c.sway += dt * 3;
        const pos = pointAtArcLength(
          segments,
          c.s,
          c.off + Math.sin(c.sway) * 0.1,
        );
        c.body.position.set(pos.x, 0, pos.z);
        c.head.position.set(pos.x, 0, pos.z);
        const theta = Math.atan2(x - pos.x, z - pos.z);
        c.body.rotation.y = theta;
        c.head.rotation.y = theta;
      }
    }
  }
  return { x, z, s };
}

// 리셋: 바리게이트를 지하로, 군중을 제자리로, 진행 상태를 처음으로 되돌린다.
// 차선(바리게이트·안전)은 그대로 둔다 — 같은 맵을 다시 도는 것이므로.
function resetEvents(events) {
  for (const ev of events) {
    if (ev.type === "C") {
      ev.risen = 0;
      ev.mesh.position.y = -BARR_H;
    } else {
      ev.opened = false;
      ev.phase = "pending";
      ev.trap = false;
      for (const c of ev.crowd) {
        c.s = c.s0; // 갇힌 동안 함께 전진했던 것도 되돌린다
        c.off = c.homeOff;
        c.targetOff = c.homeOff;
      }
    }
  }
}

function computeTurnHints(waypoints, names) {
  const hints = [];
  let acc = 0;
  for (let i = 1; i < waypoints.length - 1; i++) {
    const [x0, z0] = waypoints[i - 1],
      [x1, z1] = waypoints[i],
      [x2, z2] = waypoints[i + 1];
    acc += Math.hypot(x1 - x0, z1 - z0);
    // 건물(B7 제외) 안쪽 노드는 실제 갈림길이 아니다. buildingPlacement 주석이
    // 말하듯 B8처럼 이웃 노드 두 개가 일직선이 아니면 물리적으로는 꺾이지만,
    // 그건 건물 상자가 도로 방향에 맞춰 꺾인 것일 뿐 유저가 고를 다른 길이
    // 없다 — 게이트 안내만으로 충분하다. docs/map/맵 시간 배분.md §4-1의 9개
    // 경로 어디에도 건물 안 갈림길 안내가 없는데 B8만 새고 있었다.
    if (/^B\d+$/.test(names[i]) && NODE_DEGREE[names[i]] < 3) continue;
    const h0 = Math.atan2(z1 - z0, x1 - x0),
      h1 = Math.atan2(z2 - z1, x2 - x1);
    let diff = h1 - h0;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 0.2) {
      // 거의 직진이면 방향은 안 꺾인다 — 다만 여기가 실제 갈림길(차수 3 이상)
      // 이면 유저는 화면에서 다른 길도 보고 있으므로, 직진도 안내해야 헷갈리지
      // 않는다(요구사항). 차수 2 이하(T/C 표지 등 갈림길이 아닌 지점)는 계속
      // 건너뛴다.
      if (NODE_DEGREE[names[i]] >= 3) hints.push({ s: acc, dir: "straight" });
      continue;
    }
    hints.push({ s: acc, dir: diff > 0 ? "right" : "left" });
  }
  return hints;
}

// ── 건물(게이트 + 상자) ────────────────────────────
// docs/건물.png 그대로 — prototype 게이트(3통로 아치) 위에 건물처럼 보이는
// 상자를 얹는다. 상자 시작·끝 둘 다에 게이트를 세운다. 실제 충돌 판정은 없다
// (통과 여부를 검증하지 않는다) — 지금은 안내가 자연스러운지만 보는 단계다.
//
// B7(과 꺾이는 경로에서의 다른 건물들)은 들어오는 방향과 나가는 방향이 다르다
// (진짜 갈림길이거나, B8처럼 이웃 노드 두 개가 일직선이 아닌 경우). 이웃 노드
// 끝점 두 개를 그냥 직선으로 이으면 실제 도로 방향과 안 맞아 "길에 안 맞게
// 배치된 건물"이 된다 — 그래서 진입/중심/진출 3점을 도로 이음매와 같은 방식
// (offsetDirs 마이터)으로 처리해서, 꺾이는 자리에서는 상자도 같이 꺾이게 했다.
function buildingPlacement(id, center, neighborA, neighborB) {
  const hIn = Math.atan2(center[1] - neighborA[1], center[0] - neighborA[0]);
  const hOut = Math.atan2(neighborB[1] - center[1], neighborB[0] - center[0]);
  // 상자 길이 = 체류 시간 × SPEED. 절반을 진입/진출 양쪽으로 나눠 붙인다.
  const half = durationToDistance(BUILDING_DWELL_SEC) / 2;
  const dirIn = dirVec(hIn),
    dirOut = dirVec(hOut);
  const entry = [center[0] - dirIn.x * half, center[1] - dirIn.z * half];
  const exit = [center[0] + dirOut.x * half, center[1] + dirOut.z * half];
  const chain = [entry, center, exit];
  const dirs = offsetDirs(chain); // [진입 게이트용, 꺾이는 중심용(마이터), 진출 게이트용]
  return { id, chain, dirs, entry, exit };
}

// B1~B6, B8은 도로 그래프에서 이웃이 고정이라 경로와 무관하게 자리를 잡을 수
// 있다. B7은 진짜 갈림길이라 지금 고른 경로가 실제로 어느 쪽에서 들어와
// 어느 쪽으로 나가는지를 routeNames/waypoints에서 찾아야 한다.
function computeBuildings(routeNames, waypoints) {
  const placements = [];
  for (const [id, [a, b]] of Object.entries(BUILDING_NEIGHBORS)) {
    placements.push(buildingPlacement(id, pt(id), pt(a), pt(b)));
  }
  const i = routeNames.indexOf("B7");
  if (i > 0 && i < routeNames.length - 1) {
    placements.push(
      buildingPlacement("B7", pt("B7"), waypoints[i - 1], waypoints[i + 1]),
    );
  }
  return placements;
}

function buildBuildings(scene, routeNames, waypoints, pedRoads, spawnBlocks) {
  const gateMat = new THREE.MeshBasicMaterial({
    color: COLOR.gate,
    side: THREE.DoubleSide,
  });
  const placements = computeBuildings(routeNames, waypoints);
  for (const b of placements) {
    const labelMat = new THREE.MeshBasicMaterial({
      map: labelTexture(b.id),
      side: THREE.DoubleSide,
    });
    if (b.id === "B7") {
      // B7은 T4·J3·C3 세 방향으로 뻗은 'ㅗ'(T자) 건물이다. 두 갈래만 지나가도
      // 천장·벽은 세 갈래 전부를 덮어야 형태가 산다 → 세 갈래를 다 세운다.
      buildB7(scene, gateMat, labelMat, pedRoads, spawnBlocks);
    } else {
      // B7 이외는 도수 2라 이웃 둘과 함께 도로 하나로 합쳐져 있다(findPedRoad
      // 주석 참고) — id만으로 그 도로를 특정할 수 있다.
      const road = findPedRoad(pedRoads, b.id);
      addGatesAlongChain(
        scene,
        gateMat,
        b.chain,
        REGULAR_GATE_COUNT,
        road,
        spawnBlocks,
      );
      addBuildingBox(scene, gateMat, labelMat, b.chain, b.dirs);
    }
  }
  return placements;
}

// 폴리라인 체인(진입→중심→진출)을 따라 게이트 count개의 좌표를 고르게 계산한다.
// 양 끝을 포함하므로 count=2면 진입·진출만, 3이면 가운데에 하나 더 생긴다.
// 렌더링(addGatesAlongChain)과 판정(computeGateEvents)이 같은 자리를 보도록
// 이 함수 하나로 통일한다 — 따로 계산하면 둘이 조금씩 어긋날 수 있다.
function computeChainGatePoints(chain, count) {
  const segLens = [];
  let total = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const l = Math.hypot(
      chain[i + 1][0] - chain[i][0],
      chain[i + 1][1] - chain[i][1],
    );
    segLens.push(l);
    total += l;
  }
  const points = [];
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    let acc = 0,
      si = 0;
    while (si < segLens.length - 1 && acc + segLens[si] < target) {
      acc += segLens[si];
      si++;
    }
    const t = segLens[si] > 0 ? (target - acc) / segLens[si] : 0;
    const [x0, z0] = chain[si],
      [x1, z1] = chain[si + 1];
    points.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
  }
  return points;
}

// 각 게이트의 수직 방향은 그 지점이 놓인 선분의 수직이다(문은 얇아서 마이터가
// 필요 없다). road가 주어지면 게이트 세계 좌표를 그 도로의 s로 바꿔
// spawnBlocks에 등록한다.
function addGatesAlongChain(scene, mat, chain, count, road, spawnBlocks) {
  for (const [gx, gz] of computeChainGatePoints(chain, count)) {
    const perp = perpVec(nearestChainHeading(chain, gx, gz));
    addGate(scene, mat, [gx, gz], perp);
    if (road)
      addSpawnBlock(
        spawnBlocks,
        road,
        nearestArcLength(road.segs, gx, gz),
        GATE_CLEAR,
      );
  }
}

// 체인 위의 한 점(computeChainGatePoints가 준 점) 근처 선분의 진행 방향을 다시
// 구한다 — addGate의 perp(문 방향)를 위해서만 쓴다. 체인이 짧아(2~3점) 선형
// 탐색으로 충분하다.
function nearestChainHeading(chain, x, z) {
  let best = Infinity,
    heading = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const [x0, z0] = chain[i],
      [x1, z1] = chain[i + 1];
    const dx = x1 - x0,
      dz = z1 - z0;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? clamp(((x - x0) * dx + (z - z0) * dz) / l2, 0, 1) : 0;
    const cx = x0 + dx * t,
      cz = z0 + dz * t;
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) {
      best = d;
      heading = Math.atan2(dz, dx);
    }
  }
  return heading;
}

// B7 전용 — 세 갈래(T4/J3/C3)를 각각 center에서 tip까지 독립된 통로로 세운다.
// 각 갈래: 양옆 벽 + 천장 + 끝에 번호벽. 세 천장이 center에서 겹쳐 가운데 교차
// 지점까지 빈틈없이 덮는다(세 방향이 축에 정렬돼 있어 겹침이 깔끔하다). 어느
// 갈래가 진짜 통로인지 겉으론 구분 안 되게 셋을 완전히 똑같이 만든다.
//
// 게이트는 좌/우회전이 일어나는 가운데 'ㅁ' 공간엔 두지 않고, 곧게 걷는 갈래에만
// 둔다(요구사항). tip에서 안쪽으로 GATE_INTERVAL_SEC 간격으로 놓되, 중심에서
// GATE_CENTER_CLEAR 안쪽엔 두지 않아 교차 공간을 비운다. 갈래 하나가 2.75초라
// 지금은 갈래마다 tip 문 하나씩이다.
function buildB7(scene, wallMat, labelMat, pedRoads, spawnBlocks) {
  const center = pt("B7");
  const half = durationToDistance(BUILDING_DWELL_SEC) / 2;
  const gateStep = durationToDistance(GATE_INTERVAL_SEC);
  const centerClear = ROAD_HALF * 1.6; // 가운데 회전 공간을 비워 둘 반경
  for (const nb of ["T4", "J3", "C3"]) {
    const h = Math.atan2(pt(nb)[1] - center[1], pt(nb)[0] - center[0]);
    const perp = perpVec(h),
      dir = dirVec(h);
    const tip = [center[0] + dir.x * half, center[1] + dir.z * half];
    addBuildingArm(scene, wallMat, center, tip, perp);
    // B7은 도수 3이라 세 방향이 서로 다른 도로에 남는다 — id(B7)만으론 못
    // 좁히므로 방향(nb)까지 같이 넘겨 findPedRoad가 정확한 갈래를 찾게 한다.
    const road = findPedRoad(pedRoads, "B7", nb);
    for (const [gx, gz] of computeArmGatePoints(
      center,
      dir,
      half,
      gateStep,
      centerClear,
    )) {
      addGate(scene, wallMat, [gx, gz], perp);
      if (road)
        addSpawnBlock(
          spawnBlocks,
          road,
          nearestArcLength(road.segs, gx, gz),
          GATE_CLEAR,
        );
    }
    addEndWall(scene, labelMat, tip, perp, CEIL, CEIL + BUILDING_H);
  }
}

// center에서 dir 방향으로 half까지, centerClear 안쪽은 비우고 gateStep마다
// 게이트 좌표를 계산한다. buildB7의 세 갈래 렌더링과 computeB7GateEvents(판정)가
// 같은 자리를 보도록 이 함수 하나로 통일한다.
function computeArmGatePoints(center, dir, half, gateStep, centerClear) {
  const points = [];
  for (let d = half; d >= centerClear; d -= gateStep) {
    points.push([center[0] + dir.x * d, center[1] + dir.z * d]);
  }
  return points;
}

// B7 전용 게이트 판정 좌표 — 실제로 걷는 두 갈래(진입 쪽·진출 쪽)만. 세 번째
// (안 쓰는) 갈래는 장식이라 판정 대상이 아니다. b.entry/b.exit는 buildingPlacement가
// center에서 half만큼 나간 지점으로 이미 계산해 뒀다(각 갈래의 tip과 같은 자리) —
// 그 방향을 다시 구해 buildB7과 같은 반경(half~centerClear)으로 게이트를 나열한다.
function computeB7GatePoints(b) {
  const center = pt("B7");
  const half = durationToDistance(BUILDING_DWELL_SEC) / 2;
  const gateStep = durationToDistance(GATE_INTERVAL_SEC);
  const centerClear = ROAD_HALF * 1.6;
  const points = [];
  for (const tip of [b.entry, b.exit]) {
    const h = Math.atan2(tip[1] - center[1], tip[0] - center[0]);
    points.push(
      ...computeArmGatePoints(center, dirVec(h), half, gateStep, centerClear),
    );
  }
  return points;
}

// 한 갈래(직선)의 양옆 벽 + 천장. from(center)에서 to(tip)까지, perp는 진행
// 방향의 수직. 곧은 한 구간이라 마이터가 필요 없다(B7 세 갈래는 모두 축 정렬).
function addBuildingArm(scene, mat, from, to, perp) {
  const yb = CEIL,
    yt = CEIL + BUILDING_H;
  const [x0, z0] = from,
    [x1, z1] = to;
  for (const side of [-1, 1]) {
    scene.add(
      new THREE.Mesh(
        quadGeometry(
          [x0 + perp.x * ROAD_HALF * side, yb, z0 + perp.z * ROAD_HALF * side],
          [x0 + perp.x * ROAD_HALF * side, yt, z0 + perp.z * ROAD_HALF * side],
          [x1 + perp.x * ROAD_HALF * side, yt, z1 + perp.z * ROAD_HALF * side],
          [x1 + perp.x * ROAD_HALF * side, yb, z1 + perp.z * ROAD_HALF * side],
        ),
        mat,
      ),
    );
  }
  scene.add(
    new THREE.Mesh(
      quadGeometry(
        [x0 - perp.x * ROAD_HALF, yt, z0 - perp.z * ROAD_HALF],
        [x0 + perp.x * ROAD_HALF, yt, z0 + perp.z * ROAD_HALF],
        [x1 + perp.x * ROAD_HALF, yt, z1 + perp.z * ROAD_HALF],
        [x1 - perp.x * ROAD_HALF, yt, z1 - perp.z * ROAD_HALF],
      ),
      mat,
    ),
  );
}

// prototype의 게이트를 그대로 옮겼다 — 기둥 4개(왼쪽 문/가운데 문/오른쪽 문 3칸)
// + 위쪽 상판. "세 통로가 완전히 동일하게 보여야 한다"는 prototype 주석 그대로
// 지켰다 — 어느 문이 진짜인지 구분하는 표시를 일부러 안 넣었다.
function addGate(scene, mat, [gx, gz], perp) {
  for (const lx of GATE_LANE_X) {
    const bx = gx + perp.x * lx,
      bz = gz + perp.z * lx;
    scene.add(
      new THREE.Mesh(
        quadGeometry(
          [bx - perp.x * 0.12, 0, bz - perp.z * 0.12],
          [bx + perp.x * 0.12, 0, bz + perp.z * 0.12],
          [bx + perp.x * 0.12, CEIL, bz + perp.z * 0.12],
          [bx - perp.x * 0.12, CEIL, bz - perp.z * 0.12],
        ),
        mat,
      ),
    );
  }
  scene.add(
    new THREE.Mesh(
      quadGeometry(
        [gx - perp.x * ROAD_HALF, CEIL - 0.45, gz - perp.z * ROAD_HALF],
        [gx + perp.x * ROAD_HALF, CEIL - 0.45, gz + perp.z * ROAD_HALF],
        [gx + perp.x * ROAD_HALF, CEIL, gz + perp.z * ROAD_HALF],
        [gx - perp.x * ROAD_HALF, CEIL, gz - perp.z * ROAD_HALF],
      ),
      mat,
    ),
  );
}

// 게이트 위(y=CEIL)부터 얹는 상자 — 사방(양옆 + 앞 + 뒤)을 다 막고 지붕까지
// 덮는다. 진입~중심, 중심~진출 두 구간으로 나눠서 도로 이음매와 같은 마이터
// 처리를 하기 때문에, 꺾이는 건물(B7 등)도 상자가 그 자리에서 같이 꺾인다.
// 앞뒤 면에는 건물 번호를 큼직하게 붙인다.
function addBuildingBox(scene, wallMat, labelMat, chain, dirs) {
  const yb = CEIL,
    yt = CEIL + BUILDING_H;
  for (let i = 0; i < chain.length - 1; i++) {
    const [x0, z0] = chain[i],
      [x1, z1] = chain[i + 1];
    const d0 = dirs[i],
      d1 = dirs[i + 1];
    for (const side of [-1, 1]) {
      scene.add(
        new THREE.Mesh(
          quadGeometry(
            [x0 + d0.x * ROAD_HALF * side, yb, z0 + d0.z * ROAD_HALF * side],
            [x0 + d0.x * ROAD_HALF * side, yt, z0 + d0.z * ROAD_HALF * side],
            [x1 + d1.x * ROAD_HALF * side, yt, z1 + d1.z * ROAD_HALF * side],
            [x1 + d1.x * ROAD_HALF * side, yb, z1 + d1.z * ROAD_HALF * side],
          ),
          wallMat,
        ),
      );
    }
    scene.add(
      new THREE.Mesh(
        quadGeometry(
          [x0 - d0.x * ROAD_HALF, yt, z0 - d0.z * ROAD_HALF],
          [x0 + d0.x * ROAD_HALF, yt, z0 + d0.z * ROAD_HALF],
          [x1 + d1.x * ROAD_HALF, yt, z1 + d1.z * ROAD_HALF],
          [x1 - d1.x * ROAD_HALF, yt, z1 - d1.z * ROAD_HALF],
        ),
        wallMat,
      ),
    );
  }
  // 앞(진입)·뒤(진출) 마감벽 — "상자 사방이 막혀있어야" 해서 추가. 게이트 문(y<CEIL)
  // 보다 위쪽이라 실제 통행로는 안 막는다. 번호판을 여기 붙인다.
  const [ex, ez] = chain[0],
    [xx, xz] = chain[chain.length - 1];
  addEndWall(scene, labelMat, [ex, ez], dirs[0], yb, yt);
  addEndWall(scene, labelMat, [xx, xz], dirs[dirs.length - 1], yb, yt);
}

function addEndWall(scene, mat, [gx, gz], perp, yb, yt) {
  scene.add(
    new THREE.Mesh(
      quadGeometry(
        [gx - perp.x * ROAD_HALF, yb, gz - perp.z * ROAD_HALF],
        [gx + perp.x * ROAD_HALF, yb, gz + perp.z * ROAD_HALF],
        [gx + perp.x * ROAD_HALF, yt, gz + perp.z * ROAD_HALF],
        [gx - perp.x * ROAD_HALF, yt, gz - perp.z * ROAD_HALF],
      ),
      mat,
    ),
  );
}

// 건물 번호 텍스처 — 배경은 게이트와 같은 색을 유지하고("색깔 똑같게") 그 위에
// 흰 글자만 크게 얹는다.
function labelTexture(text) {
  const cnv = document.createElement("canvas");
  cnv.width = 256;
  cnv.height = 256;
  const ctx = cnv.getContext("2d");
  ctx.fillStyle = hexColor(COLOR.gate);
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 140px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 136);
  return new THREE.CanvasTexture(cnv);
}

// ── 도착 지점(GOAL) 표시 ──────────────────────────
// 실제 도착 판정은 update의 s >= totalLength - 1 그대로다(여긴 표시만) — 결승선
// 위치·색은 그대로 두고, "도착" 기둥·배너 대신 결승선 뒤로 길을 살짝 더 뽑아
// myCompany.glb(회사 건물)를 세운다. ROUTES(§316)는 END2/END3 두 갈래로 끝나지만
// 이 함수는 그때그때 골라진 경로의 마지막 웨이포인트 좌표만 보고 세우므로
// 도착지 두 곳 모두 별도 분기 없이 이걸로 커버된다.
const GOAL_EXT_SEC = 0.8; // 결승선 뒤로 연장할 길이 — 초 단위(SPEED로 거리 환산)
const MYCOMPANY_MODEL_URL = "./assets/map/myCompany2.glb";
const MYCOMPANY_TARGET_HEIGHT = 20; // 배경 건물(5~8, decorateGrass)보다 한 단 커서 목적지로 눈에 띈다
// myCompany.glb 노드 이름 → 팔레트 색(docs/map/맵분위기.png). office/tree 배치에
// 쓰는 이름·색을 그대로 재사용해 도시 전체 톤을 맞춘다.
const MYCOMPANY_PART_COLOR = {
  외벽: COLOR.bldgWall,
  옥상: COLOR.bldgRoof,
  창문: COLOR.bldgWin,
  "창문(입구)구분선": COLOR.bldgWinBar,
  입구: COLOR.bldgDoor,
  바닥: COLOR.bldgAccent,
  관상풀: COLOR.flowerBed,
  나무잎: COLOR.treeLeaf,
  "나무 줄기": COLOR.treeTrunk,
};

function buildGoalMarker(scene, waypoints) {
  const end = waypoints[waypoints.length - 1],
    prev = waypoints[waypoints.length - 2];
  const h = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
  const fwd = dirVec(h),
    perp = perpVec(h);
  const mat = new THREE.MeshBasicMaterial({
    color: COLOR.goal,
    side: THREE.DoubleSide,
  });

  // 바닥 결승선 — 도로를 가로지르는 청록 띠(끝점 살짝 앞에 둔다). 도착 판정
  // 지점이라 위치·색 모두 그대로 유지한다.
  const b = [end[0] - fwd.x * 1.3, end[1] - fwd.z * 1.3];
  scene.add(
    new THREE.Mesh(
      quadGeometry(
        [b[0] - perp.x * ROAD_HALF, 0.04, b[1] - perp.z * ROAD_HALF],
        [b[0] + perp.x * ROAD_HALF, 0.04, b[1] + perp.z * ROAD_HALF],
        [end[0] + perp.x * ROAD_HALF, 0.04, end[1] + perp.z * ROAD_HALF],
        [end[0] - perp.x * ROAD_HALF, 0.04, end[1] - perp.z * ROAD_HALF],
      ),
      mat,
    ),
  );

  // 결승선 뒤로 길을 GOAL_EXT_SEC(0.5초)만큼 더 뽑아 그 끝에 회사 건물을 세운다.
  // 일반 구간(S)과 같은 줄무늬 바닥재를 써서 결승선 앞뒤 도로와 이음매가
  // 어색하지 않게 한다.
  const extLen = SPEED * GOAL_EXT_SEC;
  const far = [end[0] + fwd.x * extLen, end[1] + fwd.z * extLen];
  const extMat = new THREE.MeshBasicMaterial({
    map: stripeTexture(COLOR.floor, COLOR.floor2),
  });
  scene.add(
    new THREE.Mesh(
      quadGeometry(
        [end[0] - perp.x * ROAD_HALF, 0.01, end[1] - perp.z * ROAD_HALF],
        [end[0] + perp.x * ROAD_HALF, 0.01, end[1] + perp.z * ROAD_HALF],
        [far[0] + perp.x * ROAD_HALF, 0.01, far[1] + perp.z * ROAD_HALF],
        [far[0] - perp.x * ROAD_HALF, 0.01, far[1] - perp.z * ROAD_HALF],
      ),
      extMat,
    ),
  );

  // myCompany.glb도 fence/barricade와 같은 패턴 — 비동기 로드라 자리(far)만 먼저
  // 정해 두고 로드되는 대로 붙인다. 입구가 결승선(플레이어가 오는 방향)을 보게
  // decorateGrass의 건물 배치와 같은 공식(atan2(dx,dz))에 "오는 방향"(-fwd)을 넣는다.
  loadModelUnit(MYCOMPANY_MODEL_URL, MYCOMPANY_PART_COLOR)
    .then((unit) => {
      if (unit.height < 1e-6) return;
      const sc = MYCOMPANY_TARGET_HEIGHT / unit.height;
      const clone = unit.unit.clone(true);
      clone.position.set(far[0], 0, far[1]);
      clone.rotation.y = Math.atan2(-fwd.x, -fwd.z);
      clone.scale.setScalar(sc);
      scene.add(clone);
    })
    .catch((err) => {
      console.error(
        "myCompany.glb 로드 실패 — 도착 지점 건물이 안 보인다",
        err,
      );
    });
}

// 지금 고른 경로에 실제로 있는 건물만 판정한다 — 회전 안내와 같은 원리로,
// 안 지나갈 건물까지 안내하면 의미가 없다. 어느 문이 정답인지는 게이트마다
// 게임 시작 시 딱 한 번 뽑고(door), 다시 시작해도 다시 뽑지 않는다(reset()에서
// 유지) — T/C 이벤트의 랜덤과 같은 원칙. 건물 안 게이트마다 독립적으로 뽑으므로
// 같은 건물이라도 진입·중간·진출 문이 서로 다를 수 있다(요구사항).
//
// 판정 지점은 진입 게이트 하나가 아니라 그 건물에 실제로 서 있는 게이트
// 전부다(진입·중간·진출) — addGatesAlongChain/buildB7이 렌더링에 쓰는 것과
// 같은 좌표 계산(computeChainGatePoints/computeB7GatePoints)을 그대로 써서,
// 화면에 보이는 문과 판정 지점이 어긋나지 않는다.
function computeGateEvents(placements, routeNames, segments) {
  const events = [];
  for (const b of placements) {
    if (!routeNames.includes(b.id)) continue;
    const points =
      b.id === "B7"
        ? computeB7GatePoints(b)
        : computeChainGatePoints(b.chain, REGULAR_GATE_COUNT);
    for (const [gx, gz] of points) {
      const door = Math.floor(Math.random() * 3);
      events.push({
        kind: "gate",
        id: b.id,
        s: nearestArcLength(segments, gx, gz),
        door,
        arrow: DOOR_ARROW[door],
        text: DOOR_NAME[door],
        resolved: false, // 맞는 문으로 통과하면 true — 그 뒤로는 다시 판정 안 함
        announced: false, // 안내를 이미 띄웠으면 true — 되돌아가면 다시 false로
      });
    }
  }
  return events.sort((a, b) => a.s - b.s);
}

// ── 도로 지오메트리 — 선택된 경로든 아니든 도로망(ROADS) 전부를 똑같은
// 스타일(바닥·벽 타일, 차선)로 그린다. 실제로 걸을 수 있는 건 여전히 선택된
// 경로(waypoints, clampToRoad에서 씀)뿐이지만 겉모습은 구분하지 않는다.
// 건물·신호등·공사장 없음. 이음매는 offsetDirs로 마이터 처리한다. ────
function buildCityRoads(scene) {
  // 도로 바닥(floor/floor2)과 같은 방식(줄무늬 텍스처) — "잔디를 깔아 둔" 느낌만
  // 내는 것이 목적이라 무늬는 도로와 같게, 색만 초록으로 바꿨다.
  // side: DoubleSide — 이 사각형은 항상 같은 정점 순서(min→max)를 쓰기 때문에
  // 카메라가 위에서 내려다볼 때 뒷면이 걸려 컬링되어 안 보이던 문제가 있었다
  // (그동안 "바닥이 파랗게 보인다"는 게 사실 이 사각형이 아예 안 그려지고 배경색이
  // 그대로 비친 것이었다) — wallMat과 같은 방식으로 양면을 그려 해결한다.
  const groundMat = new THREE.MeshBasicMaterial({
    map: stripeTexture(COLOR.ground, COLOR.ground2),
    side: THREE.DoubleSide,
  });

  const xs = Object.values(N).map((p) => p[0]),
    zs = Object.values(N).map((p) => p[1]);
  const pad = 20;
  const groundMinZ = Math.min(...zs) - pad,
    groundMaxZ = Math.max(...zs) + pad;
  // 도로 줄무늬와 같은 주기(6유닛)로 반복시킨다 — 땅 전체가 하나의 거대한 사각형이라
  // 반복 없이 늘리면(vRepeat=1) 줄무늬가 안 보일 만큼 늘어나 버린다.
  const groundVRepeat = Math.max(1, (groundMaxZ - groundMinZ) / 6);
  scene.add(
    new THREE.Mesh(
      quadGeometry(
        [Math.min(...xs) - pad, 0, groundMinZ],
        [Math.max(...xs) + pad, 0, groundMinZ],
        [Math.max(...xs) + pad, 0, groundMaxZ],
        [Math.min(...xs) - pad, 0, groundMaxZ],
        groundVRepeat,
      ),
      groundMat,
    ),
  );

  // 일반 도로(S)와 T·C 구간의 바닥·벽 재질. 구조는 전부 같고 색만 다르다.
  // 벽(연석)은 S·C 모두 fence2.glb로 세우고 T는 벽이 없어졌다 — 이제 타입별로
  // 다른 건 바닥 재질뿐이다.
  const mats = {
    S: {
      floor: new THREE.MeshBasicMaterial({
        map: stripeTexture(COLOR.floor, COLOR.floor2),
      }),
    },
    T: {
      // 신호등 구역 바닥은 횡단보도(검정/흰 줄무늬).
      floor: new THREE.MeshBasicMaterial({
        map: crosswalkTexture(),
      }),
    },
    C: {
      floor: new THREE.MeshBasicMaterial({
        map: stripeTexture(COLOR.cFloor, COLOR.cFloor2),
      }),
    },
    lane: new THREE.MeshBasicMaterial({
      map: dashTexture(COLOR.lane),
      transparent: true,
    }),
  };

  // ROADS는 T/C 표시점 때문에 그래프 노드 하나가 여러 짧은 배열로 쪼개져 있다
  // (예: N1→C1→B3와 B3→N3는 사실 한 길인데 배열이 둘로 나뉨). 이 경계마다
  // 독립된 벽 계산을 하면, 실제로는 그냥 지나가는 지점(끝점 차수 2)까지
  // "교차로"로 오판해서 이음매가 다시 깨지고 있을 필요 없는 곳까지 벽이
  // 뚫렸다 — 방금 겪은 버그. mergeStraightRoads로 차수 2인 경계를 먼저
  // 이어붙여서, 실제 갈림길(차수 3 이상)에서만 벽을 물리게 한다.
  const junctions = computeJunctions(ROADS); // 차수 3 이상 = 진짜 갈림길
  const logicalRoads = mergeStraightRoads(ROADS);
  // 일반(S) 구간의 벽 선분만 여기 모은다 — fence.glb는 비동기로 로드되므로,
  // 동기 패스에서는 T/C(이벤트 색 구분)·건물(buildBuildings) 벽만 즉시 그리고
  // 나머지는 모델이 준비된 뒤 한 번에 붙인다.
  const fenceSegments = [];
  logicalRoads.forEach((road, i) => {
    buildRoadStrip(scene, road, mats, junctions, i, fenceSegments);
  });
  loadFenceUnit()
    .then((unit) => {
      for (const [p0, p1] of fenceSegments)
        buildFenceSegment(scene, unit, p0, p1);
    })
    .catch((err) => {
      console.error("fence.glb 로드 실패 — 일반 도로 벽이 비어 보인다", err);
    });

  // 잔디(도로망 바깥)를 도시처럼 꾸민다 — 건물·가로등·화단·나무. 도로 좌표 범위를
  // 그대로 넘겨 배치 경계로 쓴다(fence.glb와 별개의 비동기 로드).
  decorateGrass(scene, xs, zs, pad);
}

// ── 도로 경계(일반 S + 공사장 C 공용) — fence.glb ─────────────
// assets/map/fence2.glb를 한 번만 로드해 재사용한다(요구사항: 매번 새로 로드하지
// 않는다). index.html이 저장소 루트라 경로는 그 기준 상대경로(./)를 쓴다 —
// import 문과 달리 런타임 로더 경로는 모듈 파일이 아니라 문서 기준이다.
const FENCE_MODEL_URL = "./assets/map/fence2.glb";
// CEIL(3.0, 예전 벽 높이)에 맞춰 키우면 원본 비례가 깨진다 — 눈대중으로 맞춘
// 고정 목표 높이로 스케일한다.
const FENCE_TARGET_HEIGHT = 0.9;
let fenceUnitPromise = null;

function loadFenceUnit() {
  if (!fenceUnitPromise) {
    fenceUnitPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(
        FENCE_MODEL_URL,
        (gltf) => {
          const raw = gltf.scene;
          const box = new THREE.Box3().setFromObject(raw);
          const width = box.max.x - box.min.x; // 패널 하나의 길이 방향(로컬 X) 폭
          const height = box.max.y - box.min.y;
          // 로컬 원점을 시작 모서리(x=0)·바닥(y=0)·두께 중앙(z=0)으로 옮겨 둔다 —
          // 그래야 벽을 이어 붙일 때 "패널 폭만큼 이동"으로 계산이 끝난다.
          raw.position.set(
            -box.min.x,
            -box.min.y,
            -(box.min.z + box.max.z) / 2,
          );
          const unit = new THREE.Group();
          unit.add(raw);
          resolve({ unit, width, height });
        },
        undefined,
        reject,
      );
    });
  }
  return fenceUnitPromise;
}

// 기존 벽 선분(p0→p1, 바닥 y=0) 하나를 fence.glb 패널로 이어 붙인다. 높이는
// CEIL이 아니라 FENCE_TARGET_HEIGHT(턱 정도)에 맞춰 균일 스케일하고, 패널
// 개수×폭이 구간 길이와 정확히 같아지도록 길이 방향(로컬 X)만 따로 늘이거나
// 줄인다 — 이음매에 틈·겹침이 남지 않는다. 매번 새로 로드하지 않고
// loadFenceUnit이 한 번 만든 unit을 clone(true)만 해서 쓴다(지오메트리·재질은
// 참조 공유, three.js 권장 재사용 방식).
function buildFenceSegment(scene, fenceUnit, p0, p1) {
  const dx = p1[0] - p0[0],
    dz = p1[1] - p0[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-6 || fenceUnit.width < 1e-6 || fenceUnit.height < 1e-6) return;
  const heightScale = FENCE_TARGET_HEIGHT / fenceUnit.height;
  const panelWidth0 = fenceUnit.width * heightScale;
  const panelCount = Math.max(1, Math.round(len / panelWidth0));
  const panelLen = len / panelCount;
  const scaleX = panelLen / fenceUnit.width;
  const heading = Math.atan2(-dz, dx); // three.js rotation.y 부호 — 로컬 +X를 (dx,dz) 방향으로
  const ux = dx / len,
    uz = dz / len;
  for (let k = 0; k < panelCount; k++) {
    const t = k * panelLen;
    const clone = fenceUnit.unit.clone(true);
    clone.position.set(p0[0] + ux * t, 0, p0[1] + uz * t);
    clone.rotation.y = heading;
    clone.scale.set(scaleX, heightScale, heightScale);
    scene.add(clone);
  }
}

// ── 배경 도시 꾸미기 — office/light/flowerBed/tree 에셋 ─────────────
// docs/map/맵분위기.png의 "배치 아이디어"를 따른다: 도로를 따라 건물을 늘어세우고
// 그 사이를 가로등·화단·나무로 채워 리듬을 준다. 새 에셋도 tree.glb처럼 원본 재질에
// 색이 없어(흰색) 노드 이름으로 팔레트 색을 입힌다. fence*/barricade는 배경 장식에
// 쓰지 않는다(도로 연석 전용) — 요구사항.
//
// 한 URL당 한 번만 로드해 clone(true)로 재사용한다(three.js 권장). 로컬 원점은
// 밑동 바닥(y=0)·수평 중심으로 옮겨, 배치할 땐 "그 좌표에 놓기"만으로 끝나게 한다.
const OFFICE_URLS = [
  "./assets/map/office1.glb",
  "./assets/map/office2.glb",
  "./assets/map/office3.glb",
];
const LIGHT_URL = "./assets/map/light.glb";
const LIGHT_TARGET_HEIGHT = 2.25; // decorateGrass의 가로등 목표 높이(sc 계산에 쓰는 값과 동일)
const TRAFFICLIGHT_MODEL_URL = "./assets/map/trafficLight.glb";
// 요구사항: 가로등(light.glb) 목표 높이의 1.3배.
const TRAFFICLIGHT_TARGET_HEIGHT = LIGHT_TARGET_HEIGHT * 1.3;
const FLOWERBED_URLS = [
  "./assets/map/flowerBed1.glb",
  "./assets/map/flowerBed2.glb",
  "./assets/map/flowerBed3.glb",
];
// tree.glb(기존)와 새 변종 3종을 섞어 심어 단조로움을 줄인다.
const TREE_URLS = [
  "./assets/map/tree.glb",
  "./assets/map/tree2.glb",
  "./assets/map/tree3.glb",
  "./assets/map/tree4.glb",
];

// 노드 이름 → 팔레트 색. GLTFLoader가 같은 이름을 "이름_1"처럼 고유화하므로 숫자
// 꼬리를 떼고 찾는다(barricade와 같은 방식). 표에 없는 이름은 회색 기본값이 된다.
const OFFICE_PART_COLOR = {
  외벽: COLOR.bldgWall,
  외벽포인트: COLOR.bldgAccent,
  옥상: COLOR.bldgRoof,
  옥상장식품: COLOR.bldgRoof,
  창문: COLOR.bldgWin,
  창문구분선: COLOR.bldgWinBar,
  입구: COLOR.bldgDoor,
  차양: COLOR.bldgAwning,
  가게간판: COLOR.bldgSign,
  장식용화분: COLOR.potBody,
  장식용화분식물: COLOR.potPlant,
};
const LIGHT_PART_COLOR = { 가로등: COLOR.lampPole, 전구: COLOR.lampBulb };
const FLOWERBED_PART_COLOR = { 관상풀: COLOR.flowerBed };
// tree 변종들이 쓰는 이름을 모두 합쳐 둔다(줄기/잎 계열 + tree2의 바닥).
const TREE_PART_COLOR = {
  줄기: COLOR.treeTrunk,
  잎: COLOR.treeLeaf,
  잎2: COLOR.treeLeaf,
  잎3: COLOR.treeLeaf,
  나무줄기: COLOR.treeTrunk,
  "나무 줄기": COLOR.treeTrunk,
  나무잎: COLOR.treeLeaf,
  바닥: COLOR.treeBase,
};
// trafficLight.glb 노드 이름 그대로.
const TRAFFICLIGHT_PART_COLOR = {
  "폴(기둥)": COLOR.lampPole,
  신호등본체: COLOR.trafficBody,
  빨간불: COLOR.trafficRed,
  초록불: COLOR.trafficGreen,
};

const modelUnitCache = {};
function loadModelUnit(url, partColor) {
  if (!modelUnitCache[url]) {
    modelUnitCache[url] = new Promise((resolve, reject) => {
      new GLTFLoader().load(
        url,
        (gltf) => {
          const raw = gltf.scene;
          raw.traverse((child) => {
            if (!child.isMesh) return;
            const name = child.name.replace(/_\d+$/, "");
            const color = partColor[name];
            child.material = new THREE.MeshStandardMaterial({
              color: color !== undefined ? color : 0xcfd4da,
              side: THREE.DoubleSide,
            });
          });
          const box = new THREE.Box3().setFromObject(raw);
          raw.position.set(
            -(box.min.x + box.max.x) / 2,
            -box.min.y,
            -(box.min.z + box.max.z) / 2,
          );
          const unit = new THREE.Group();
          unit.add(raw);
          resolve({
            unit,
            width: box.max.x - box.min.x,
            height: box.max.y - box.min.y,
            depth: box.max.z - box.min.z,
          });
        },
        undefined,
        reject,
      );
    });
  }
  return modelUnitCache[url];
}

// 잔디(도로망 바깥)를 도시처럼 채운다. 배치 순서가 곧 공간 우선권이다 —
// 건물(가장 큼) → 가로등(연석 옆) → 화단(빈틈) → 나무(남은 잔디). 모든 후보는
// 도로 전체(ROADS)와 이미 놓인 것들로부터 최소 간격을 확인하고 통과할 때만 놓는다.
// 도로가 선택 경로뿐 아니라 ROADS 전체로 그려지므로(§buildCityRoads) 간격 판정도
// ROADS 전체를 기준으로 해야 어느 길 위에도 안 겹친다.
function decorateGrass(scene, xs, zs, pad) {
  const roadSegs = [];
  for (const road of ROADS) roadSegs.push(...toSegments(road.map(pt)));
  const minX = Math.min(...xs) - pad,
    maxX = Math.max(...xs) + pad;
  const minZ = Math.min(...zs) - pad,
    maxZ = Math.max(...zs) + pad;
  const logicalRoads = mergeStraightRoads(ROADS);

  function distToRoads(x, z) {
    let best = Infinity;
    for (const seg of roadSegs) {
      const dx = seg.x1 - seg.x0,
        dz = seg.z1 - seg.z0;
      const len2 = dx * dx + dz * dz;
      const t =
        len2 > 0
          ? clamp(((x - seg.x0) * dx + (z - seg.z0) * dz) / len2, 0, 1)
          : 0;
      const cx = seg.x0 + dx * t,
        cz = seg.z0 + dz * t;
      const d = Math.hypot(x - cx, z - cz);
      if (d < best) best = d;
    }
    return best;
  }

  // 놓은 것들을 원(중심+반지름)으로 근사해 서로 안 겹치게 한다. roadClear는 도로
  // 중앙선에서 이만큼은 떨어져야 한다는 최소 거리(도로 위·연석에 안 박히게).
  const placed = [];
  function fits(x, z, r, roadClear) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
    if (distToRoads(x, z) < roadClear) return false;
    return placed.every((p) => Math.hypot(p.x - x, p.z - z) >= p.r + r);
  }

  // 로컬 +Z를 (dx,dz) 방향으로 돌리는 rotation.y (three.js Y축 회전 규약:
  // +Z=(0,0,1) → (sinθ,cosθ)). 건물의 넓은 면과 가로등 팔이 도로를 바라보게 한다.
  const faceRotY = (dx, dz) => Math.atan2(dx, dz);

  // 도로(논리 도로)를 따라 s를 훑으며 양쪽에 후보를 넘긴다. place에는 그 지점에서
  // 도로 중앙을 향하는 단위 벡터(dirx,dirz)도 같이 준다 — 방향 맞추는 데 쓴다.
  function alongRoads(spacing, place) {
    for (const names of logicalRoads) {
      const segs = toSegments(names.map(pt));
      const total = segs.reduce((a, sg) => a + sg.len, 0);
      for (let s = spacing * 0.5; s < total; s += spacing) {
        for (const side of [-1, 1]) {
          const probe = pointAtArcLength(segs, s, side * (ROAD_HALF + 0.5));
          let tx = probe.cx - probe.x,
            tz = probe.cz - probe.z;
          const tl = Math.hypot(tx, tz) || 1;
          place(segs, s, side, tx / tl, tz / tl);
        }
      }
    }
  }

  Promise.all([
    Promise.all(OFFICE_URLS.map((u) => loadModelUnit(u, OFFICE_PART_COLOR))),
    loadModelUnit(LIGHT_URL, LIGHT_PART_COLOR),
    Promise.all(
      FLOWERBED_URLS.map((u) => loadModelUnit(u, FLOWERBED_PART_COLOR)),
    ),
    Promise.all(TREE_URLS.map((u) => loadModelUnit(u, TREE_PART_COLOR))),
  ])
    .then(([offices, light, beds, trees]) => {
      // ── 건물: 도로를 따라 양쪽에 늘어세운다. 넓은 면(±Z)이 도로를 향하고,
      // 높이를 5~8로 섞어 스카이라인이 단조롭지 않게 한다(맵분위기 배치 팁).
      let buildingCount = 0;
      const BUILDING_CAP = 64;
      alongRoads(13, (segs, s, side, dirx, dirz) => {
        if (buildingCount >= BUILDING_CAP) return;
        const unit = offices[Math.floor(Math.random() * offices.length)];
        if (unit.height < 1e-6) return;
        const sc = (5 + Math.random() * 3) / unit.height;
        const halfDepth = (unit.depth * sc) / 2;
        const radius = (Math.max(unit.width, unit.depth) * sc) / 2;
        const a = pointAtArcLength(
          segs,
          s,
          side * (ROAD_HALF + halfDepth + 1.2),
        );
        if (!fits(a.x, a.z, radius, radius + 1)) return;
        const clone = unit.unit.clone(true);
        clone.position.set(a.x, 0, a.z);
        clone.rotation.y = faceRotY(dirx, dirz);
        clone.scale.setScalar(sc);
        scene.add(clone);
        placed.push({ x: a.x, z: a.z, r: radius });
        buildingCount++;
      });

      // ── 가로등: 연석 바로 옆에서 팔이 도로 위로 뻗게(+Z가 도로 방향).
      if (light.height > 1e-6) {
        const sc = LIGHT_TARGET_HEIGHT / light.height;
        const radius = 0.7;
        alongRoads(15, (segs, s, side, dirx, dirz) => {
          const a = pointAtArcLength(segs, s, side * (ROAD_HALF + 0.8));
          if (!fits(a.x, a.z, radius, ROAD_HALF - 0.3)) return;
          const clone = light.unit.clone(true);
          clone.position.set(a.x, 0, a.z);
          clone.rotation.y = faceRotY(dirx, dirz);
          clone.scale.setScalar(sc);
          scene.add(clone);
          placed.push({ x: a.x, z: a.z, r: radius });
        });
      }

      // ── 화단: 건물·가로등이 못 채운 연석 옆 빈틈을 낮고 촘촘하게 메운다.
      alongRoads(6, (segs, s, side) => {
        const unit = beds[Math.floor(Math.random() * beds.length)];
        if (unit.height < 1e-6) return;
        const sc = (0.7 + Math.random() * 0.3) / unit.height;
        const radius = (Math.max(unit.width, unit.depth) * sc) / 2 + 0.2;
        const a = pointAtArcLength(segs, s, side * (ROAD_HALF + 0.7 + radius));
        if (!fits(a.x, a.z, radius, ROAD_HALF + 0.3)) return;
        const clone = unit.unit.clone(true);
        clone.position.set(a.x, 0, a.z);
        clone.rotation.y = Math.random() * Math.PI * 2;
        clone.scale.setScalar(sc);
        scene.add(clone);
        placed.push({ x: a.x, z: a.z, r: radius });
      });

      // ── 나무: 남은 잔디에 변종을 섞어 흩어 심는다. 후보가 부족하면 목표보다
      // 적게 심긴다(도로·기존 배치와 간격을 못 지키면 건너뛴다).
      const TREE_COUNT = 55;
      const MAX_TRY = TREE_COUNT * 25;
      let planted = 0,
        tries = 0;
      while (planted < TREE_COUNT && tries < MAX_TRY) {
        tries++;
        const unit = trees[Math.floor(Math.random() * trees.length)];
        if (unit.height < 1e-6) continue;
        const x = minX + Math.random() * (maxX - minX);
        const z = minZ + Math.random() * (maxZ - minZ);
        const radius = 1.4;
        if (!fits(x, z, radius, ROAD_HALF + 1.5)) continue;
        const sc = (2.4 + Math.random() * 1.2) / unit.height;
        const clone = unit.unit.clone(true);
        clone.position.set(x, 0, z);
        clone.rotation.y = Math.random() * Math.PI * 2;
        clone.scale.setScalar(sc);
        scene.add(clone);
        placed.push({ x, z, r: radius });
        planted++;
      }
    })
    .catch((err) => {
      console.error("배경 도시 에셋 로드 실패 — 잔디가 비어 보인다", err);
    });
}

// ── 공사장 바리게이트 — barricade.glb ─────────────────
// 한 번만 로드해 재사용한다. 원본 재질 3개(검정/주황/하양, material 0/1/2)에
// 색이 없어 그대로 쓰면 흰색이 된다 — 큐브 이름(검정/주황/하양) 그대로 색만
// 입힌다(요구사항). 주황은 COLOR.barricadeOrange로 최대한 채도 높게 잡았다.
const BARRICADE_MODEL_URL = "./assets/map/barricade.glb";
const BARRICADE_PART_COLOR = {
  검정: COLOR.barricadeBlack,
  주황: COLOR.barricadeOrange,
  하양: COLOR.barricadeWhite,
};
let barricadeUnitPromise = null;

function loadBarricadeUnit() {
  if (!barricadeUnitPromise) {
    barricadeUnitPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(
        BARRICADE_MODEL_URL,
        (gltf) => {
          const raw = gltf.scene;
          raw.traverse((child) => {
            if (!child.isMesh) return;
            // GLTFLoader는 같은 이름(검정/주황/하양)이 여럿이면 "이름_1", "이름_2"…로
            // 고유화한다 — 뒤에 붙는 번호를 떼고 원래 큐브 이름으로 찾는다.
            const partName = child.name.replace(/_\d+$/, "");
            const color = BARRICADE_PART_COLOR[partName];
            if (color === undefined) return;
            child.material = new THREE.MeshStandardMaterial({
              color,
              side: THREE.DoubleSide,
            });
          });
          const box = new THREE.Box3().setFromObject(raw);
          const width = box.max.x - box.min.x;
          const height = box.max.y - box.min.y;
          // 로컬 원점을 폭 중앙·바닥(y=0)으로 옮겨 둔다 — 차선 중앙에 그대로
          // 놓이고, 세로로만 자연스럽게 늘어나게(buildBarricadeGroup 참고).
          raw.position.set(
            -(box.min.x + box.max.x) / 2,
            -box.min.y,
            -(box.min.z + box.max.z) / 2,
          );
          const unit = new THREE.Group();
          unit.add(raw);
          resolve({ unit, width, height });
        },
        undefined,
        reject,
      );
    });
  }
  return barricadeUnitPromise;
}

function computeJunctions(roads) {
  const count = {};
  for (const road of roads) {
    for (const name of [road[0], road[road.length - 1]])
      count[name] = (count[name] || 0) + 1;
  }
  return new Set(Object.keys(count).filter((k) => count[k] >= 3));
}

// 끝점 차수가 정확히 2인 노드(딱 한 길이 그냥 지나가는 지점)를 찾아 양쪽
// 배열을 하나로 이어붙인다. 진짜 갈림길(차수 3+)이나 막다른 끝(차수 1)은
// 건드리지 않는다 — 그래야 offsetDirs가 이어붙인 배열 전체를 하나의 체인으로
// 보고 안쪽 굴곡을 전부 마이터 처리한다(예전의 "이음매 버그" 수정과 동일한 원리).
function mergeStraightRoads(roads) {
  const degree = {};
  for (const road of roads) {
    for (const name of [road[0], road[road.length - 1]])
      degree[name] = (degree[name] || 0) + 1;
  }

  let segments = roads.map((r) => [...r]);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < segments.length; i++) {
      const a = segments[i];
      for (const end of [a[0], a[a.length - 1]]) {
        if (degree[end] !== 2) continue;
        for (let j = 0; j < segments.length; j++) {
          if (j === i) continue;
          const b = segments[j];
          if (b[0] !== end && b[b.length - 1] !== end) continue;
          let A = a[a.length - 1] === end ? a : [...a].reverse();
          let B = b[0] === end ? b : [...b].reverse();
          const combined = A.concat(B.slice(1));
          const rest = segments.filter((_, k) => k !== i && k !== j);
          segments = [...rest, combined];
          merged = true;
          break outer;
        }
      }
    }
  }
  return segments;
}

// 합쳐진 논리 도로(names)에서, T/C 노드를 중심으로 ZONE_SEC 길이만큼을 잘라
// 별도의 색 구간으로 표시하기 위해 점 목록을 부풀린다. 모든 T/C 노드는 곧은
// 구간 위에 있어(좌표로 확인) 자른 지점이 꺾임과 겹치지 않는다 — 그래서 삽입한
// 경계점은 그 구간과 일직선이고 offsetDirs가 마이터를 잘못 걸지 않는다.
// 반환: 부풀린 점 목록 pts와, 각 구간(pts[k]→pts[k+1])의 타입(segType[k]: "S"/"T"/"C").
function expandZones(names, waypoints) {
  const half = durationToDistance(ZONE_SEC) / 2;
  const pts = [waypoints[0]];
  const segType = [];
  for (let j = 0; j < waypoints.length - 1; j++) {
    const A = waypoints[j],
      B = waypoints[j + 1];
    const zA = nodeZone(names[j]),
      zB = nodeZone(names[j + 1]);
    const dx = B[0] - A[0],
      dz = B[1] - A[1];
    const L = Math.hypot(dx, dz);
    // T/C는 서로 인접하지 않으므로(그래프상 사이에 늘 S/B/J가 있다) 한 구간의
    // 양 끝이 동시에 T/C인 경우는 없다 — 최대 한쪽만 자른다.
    const h = Math.min(half, L * 0.5);
    if (zA && !zB) {
      pts.push([A[0] + (dx / L) * h, A[1] + (dz / L) * h]);
      segType.push(zA); // A(=T/C 노드) 쪽 절반만 색칠
      pts.push(B);
      segType.push("S");
    } else if (zB && !zA) {
      pts.push([B[0] - (dx / L) * h, B[1] - (dz / L) * h]);
      segType.push("S");
      pts.push(B);
      segType.push(zB); // B(=T/C 노드) 쪽 절반만 색칠
    } else {
      pts.push(B);
      segType.push("S");
    }
  }
  return { pts, segType };
}

function buildRoadStrip(scene, names, mats, junctions, roadIdx, fenceSegments) {
  const endName0 = names[0],
    endName1 = names[names.length - 1];
  const { pts: waypoints, segType } = expandZones(names, names.map(pt));
  const n = waypoints.length;
  const dirs = offsetDirs(waypoints);
  const floorY = 0.01 + roadIdx * 0.0002; // 겹치는 교차로 바닥끼리 z-fighting 안 나게 살짝 어긋냄

  // 벽을 그릴 때 쓰는 기준점 — 교차로 쪽 끝점이면 그 방향으로 ROAD_HALF만큼
  // 안으로 당긴다. 바닥·차선은 그대로 waypoints를 써서 교차로까지 꽉 채운다.
  const wallBase = waypoints.map((p) => [...p]);
  if (n >= 2) {
    if (junctions.has(endName0)) {
      const [x0, z0] = waypoints[0],
        [x1, z1] = waypoints[1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const inset = Math.min(ROAD_HALF, len * 0.45);
      wallBase[0] = [
        x0 + ((x1 - x0) / len) * inset,
        z0 + ((z1 - z0) / len) * inset,
      ];
    }
    if (junctions.has(endName1)) {
      const [x0, z0] = waypoints[n - 2],
        [x1, z1] = waypoints[n - 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const inset = Math.min(ROAD_HALF, len * 0.45);
      wallBase[n - 1] = [
        x1 - ((x1 - x0) / len) * inset,
        z1 - ((z1 - z0) / len) * inset,
      ];
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const [x0, z0] = waypoints[i],
      [x1, z1] = waypoints[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) continue;
    const d0 = dirs[i],
      d1 = dirs[i + 1];
    // prototype 기준 3유닛마다 색이 바뀌도록 주기 6유닛 — T(신호등)만 예외다.
    // crosswalkTexture는 그 자체로 완결된 사다리 무늬(흰줄 4개)라, 구간 길이로
    // 반복시키면 T 구간마다 반복 횟수가 달라져 무늬가 뭉개지거나 늘어난다.
    // 대신 vRepeat=1로 고정해 무늬 하나를 구간 길이에 맞춰 통째로 늘인다.
    const vRepeat = segType[i] === "T" ? 1 : Math.max(1, len / 6);
    const mat = mats[segType[i]] || mats.S; // 이 구간이 S/T/C 중 무엇이냐에 따라 색
    const floorMat = mat.floor;

    scene.add(
      new THREE.Mesh(
        quadGeometry(
          [x0 - d0.x * ROAD_HALF, floorY, z0 - d0.z * ROAD_HALF],
          [x0 + d0.x * ROAD_HALF, floorY, z0 + d0.z * ROAD_HALF],
          [x1 + d1.x * ROAD_HALF, floorY, z1 + d1.z * ROAD_HALF],
          [x1 - d1.x * ROAD_HALF, floorY, z1 - d1.z * ROAD_HALF],
          vRepeat,
        ),
        floorMat,
      ),
    );

    const [wx0, wz0] = wallBase[i],
      [wx1, wz1] = wallBase[i + 1];
    for (const side of [-1, 1]) {
      const p0 = [wx0 + d0.x * ROAD_HALF * side, wz0 + d0.z * ROAD_HALF * side];
      const p1 = [wx1 + d1.x * ROAD_HALF * side, wz1 + d1.z * ROAD_HALF * side];
      // 일반(S)·공사장(C) 구간의 연석은 fence2.glb로 세운다(비동기 로드라 여기선
      // 선분만 모은다). T(신호등)는 벽을 세우지 않는다 — 교차로가 주변 도시
      // 거리와 트여 보이도록 예전의 노란 벽을 없앴다(맵분위기 배치 아이디어).
      // 충돌은 이 메시와 무관하게 clampToRoad가 ROAD_HALF로만 판정하므로 벽
      // 유무는 판정에 영향을 주지 않는다.
      if (segType[i] === "S" || segType[i] === "C")
        fenceSegments.push([p0, p1]);
    }

    for (const lo of [-1.15, 1.15]) {
      scene.add(
        new THREE.Mesh(
          quadGeometry(
            [x0 + d0.x * (lo - 0.05), 0.02, z0 + d0.z * (lo - 0.05)],
            [x0 + d0.x * (lo + 0.05), 0.02, z0 + d0.z * (lo + 0.05)],
            [x1 + d1.x * (lo + 0.05), 0.02, z1 + d1.z * (lo + 0.05)],
            [x1 + d1.x * (lo - 0.05), 0.02, z1 + d1.z * (lo - 0.05)],
            vRepeat,
          ),
          mats.lane,
        ),
      );
    }
  }
}

function quadGeometry(p0, p1, p2, p3, vRepeat = 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([...p0, ...p1, ...p2, ...p3]),
      3,
    ),
  );
  geo.setAttribute(
    "uv",
    new THREE.BufferAttribute(
      new Float32Array([0, 0, 1, 0, 1, vRepeat, 0, vRepeat]),
      2,
    ),
  );
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  return geo;
}

// prototype 그대로 — 두 색이 번갈아 나오는 1x2 텍스처를 반복시켜 줄무늬를 만든다.
function stripeTexture(colorA, colorB) {
  const cnv = document.createElement("canvas");
  cnv.width = 1;
  cnv.height = 2;
  const ctx = cnv.getContext("2d");
  ctx.fillStyle = hexColor(colorA);
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = hexColor(colorB);
  ctx.fillRect(0, 1, 1, 1);
  return finishTexture(cnv);
}

// 횡단보도 — 진행방향(세로 v)으로 굵은 검정/흰 줄이 번갈아 나오게 세로로 2칸.
// 바닥 UV는 v가 진행방향이라, 세로 2픽셀이 도로를 가로지르는 줄무늬가 된다.
// 신호등 구역 바닥 — docs/map/image.png 참고: 검정 바탕에 흰 가로줄 4개가 같은
// 간격으로 늘어선 사다리꼴 모양. 1×9칸 중 홀수 칸(1·3·5·7)만 흰색으로 채우면
// 위아래 여백까지 검정 다섯 칸·흰색 네 칸이 전부 같은 두께가 되어 그 모양이 된다.
// buildRoadStrip이 T 구간엔 vRepeat=1을 고정으로 넘긴다 — 길이에 따라 반복되던
// 예전 줄무늬(2×1)와 달리 이 무늬는 구간 길이에 맞춰 한 번만 늘어난다.
function crosswalkTexture() {
  const rows = 9;
  const cnv = document.createElement("canvas");
  cnv.width = 1;
  cnv.height = rows;
  const ctx = cnv.getContext("2d");
  ctx.fillStyle = hexColor(COLOR.crosswalk1);
  ctx.fillRect(0, 0, 1, rows);
  ctx.fillStyle = hexColor(COLOR.crosswalk2);
  for (let r = 1; r < rows; r += 2) ctx.fillRect(0, r, 1, 1);
  return finishTexture(cnv);
}

function dashTexture(color) {
  const cnv = document.createElement("canvas");
  cnv.width = 1;
  cnv.height = 2;
  const ctx = cnv.getContext("2d");
  ctx.clearRect(0, 0, 1, 2);
  ctx.fillStyle = hexColor(color);
  ctx.fillRect(0, 0, 1, 1); // 위 칸만 칠해 점선 효과
  return finishTexture(cnv);
}

function finishTexture(cnv) {
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function hexColor(n) {
  return "#" + n.toString(16).padStart(6, "0");
}

// ── 임시 토스트 — 검증용. 나중에 진짜 HUD가 생기면 이 자리를 대체한다. ──────
function buildToast(container) {
  // position:fixed로 뷰포트 기준 배치한다 — container.style.position을 건드리면
  // index.html의 #stage{position:fixed;inset:0}를 인라인 스타일이 덮어써서
  // 캔버스 크기 계산이 깨진다(실제로 겪은 버그).
  const el = document.createElement("div");
  // top:44px — 상단 중앙의 부스터 게이지 바(top:16, 높이 14)와 겹치지 않게 그 아래에 둔다.
  el.style.cssText = `
    position:fixed; top:44px; left:50%; transform:translate(-50%,-8px);
    display:flex; align-items:center; gap:10px; padding:10px 20px;
    background:rgba(27,29,33,0.82); color:#fff; border-radius:10px;
    font:600 15px -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
    opacity:0; transition:opacity .15s, transform .15s; pointer-events:none; z-index:10;
  `;
  container.appendChild(el);
  return el;
}
function showToast(el, arrow, text, sticky = false) {
  el.innerHTML = `<span style="font-size:20px;line-height:1">${arrow}</span><span>${text}</span>`;
  el.style.opacity = "1";
  el.style.transform = "translate(-50%,0)";
  el.dataset.sticky = sticky ? "1" : "";
}
function hideToast(el) {
  if (el.dataset.sticky === "1") return;
  el.style.opacity = "0";
  el.style.transform = "translate(-50%,-8px)";
}
