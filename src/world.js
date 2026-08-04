// 주행 레이어 — "길" 검증용 최소 버전 + 건물 게이트.
// 담당: A
//
// 목표는 게임성이 아니라 길(맵) 구조와 이동감이 자연스러운지만 확인하는 것 —
// 그래서 진짜 건물 진입·퀴즈 이벤트·씬 전환·보행자는 아직 없다. T(신호등)·C(공사장)는
// 여전히 평범한 도로로 취급한다. B(건물)만 이번에 되살렸는데, prototype의 게이트
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
[ TODO-0805 ]
- B7 경로 조정
- 행인 추가
- 신호등, 공사장 추가
- 가속 기능 추가
- 도착지 표시
**/

import * as THREE from "../vendor/three.module.js";

// ── 튜닝 상수 ────────────────────────────────────
const EYE = 1.62;
const SPEED = 6.0;

const STEER_ACCEL = 26,
  STEER_DAMP = 30,
  STEER_MAX = 4.6; // 좌우 이동(A/D)
const TURN_ACCEL = 6,
  TURN_DAMP = 7,
  TURN_MAX = 1.6; // 회전(방향키)

const CEIL = 3.0; // 벽 높이 — prototype 그대로
const ROAD_HALF = 3.5; // 복도 반폭 — prototype 그대로
const PLAYER_MARGIN = 0.4; // 벽에 실제로 파묻히지 않게 두는 여유 — prototype 그대로
const HINT_LOOKAHEAD = 10; // 갈림길·게이트 이 거리 앞에서 토스트를 띄운다
const TOAST_DURATION = 2.2;

// 게이트 — prototype의 4기둥(3통로) 아치를 그대로 가져왔다. LANE_X 값도 동일.
const GATE_LANE_X = [-3.5, -1.15, 1.15, 3.5];
const DOOR_NAME = ["왼쪽 문", "가운데 문", "오른쪽 문"];
const DOOR_ARROW = ["←", "↑", "→"];
const BUILDING_H = 4.0; // 게이트 위에 얹는 상자 높이
const BUILDING_LEN_SCALE = 0.8; // docs/맵 시간 배분.md의 초를 미터로 줄이는 비율(지도 스케일에 맞춤)

// prototype/busy-man-prototype.html의 타일 방식(줄무늬 텍스처, 3유닛 주기)은
// 그대로 가져오되, 벽은 바닥과 확실히 구분되게 더 어둡게 잡았다 — 원래 값(둘 다
// 밝은 회색)은 눈으로 구분이 잘 안 됐다. 이제 모든 도로(선택된 길 포함)를
// 똑같은 스타일로 그린다 — "선택 안 된 길도 실제 길이랑 UI가 똑같아야 한다".
const COLOR = {
  bg: 0xbfe3f5, // 하늘 — 예전엔 검은색이었다
  ground: 0xf3f1ea, // 도로망 바깥 빈 땅
  floor: 0xedeff2,
  floor2: 0xe6e9ed,
  wall: 0xb7c2cc,
  wall2: 0xa9b5c0,
  lane: 0xc9d1d9,
  gate: 0x5c6470, // 게이트 기둥·상판과 건물 상자를 전부 이 색 하나로 — "색깔을 똑같게"
};

// ── docs/aaa.jpg의 노드 좌표 — 그래프 구조는 그대로 둔다(나중에 건물/신호등/
// 공사장을 되살릴 때 다시 쓴다). 이번 버전은 이 중 일부만 잇는다. ────────
const N = {
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

// docs/맵 시간 배분.md §4-1의 유효 경로 7개를, 위 노드 이름을 잇는 "홉" 목록으로
// 그대로 옮겼다. 각 홉은 이전 홉의 끝점에서 이어진다(반대로 쓰여 있으면 뒤집는다).
const ROUTES = [
  [
    ["START", "N1"],
    ["N1", "C1", "B3"],
    ["B3", "N3"],
    ["N3", "N4"],
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

// docs/맵 시간 배분.md의 B1~B8 구간 초를 그대로 옮겼다 — 상자 길이 스케일에 쓴다.
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

export function createWorld(container) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.bg);
  scene.fog = new THREE.Fog(COLOR.bg, 8, 90);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 300);

  // 시작할 때 유효 경로 7개 중 하나를 무작위로 고르고, 그 경로만 짓는다.
  const routeIndex = Math.floor(Math.random() * ROUTES.length);
  const { names: routeNames, waypoints } = buildRouteWaypoints(
    ROUTES[routeIndex],
  );
  const segments = toSegments(waypoints);
  const totalLength = segments.reduce((a, s) => a + s.len, 0);

  buildCityRoads(scene);
  const buildings = buildBuildings(scene, routeNames, waypoints);

  // 회전 안내(turn)와 게이트 문 안내(door)를 거리(s) 순서 하나로 합친다 —
  // 토스트 하나가 둘 다 처리하니 순서만 맞으면 된다.
  const hints = [
    ...computeTurnHints(waypoints).map((h) => ({
      s: h.s,
      arrow: h.dir === "left" ? "←" : "→",
      text: h.dir === "left" ? "왼쪽" : "오른쪽",
    })),
    ...computeDoorHints(buildings, routeNames, segments),
  ].sort((a, b) => a.s - b.s);

  const toast = buildToast(container);
  showToast(toast, "↑", "직진");

  // ── 주행 상태 ────────────────────────────────────
  let x = waypoints[0][0],
    z = waypoints[0][1],
    heading = 0,
    headingVel = 0;
  let pvx = 0,
    s = 0,
    arrived = false;
  let nextHint = 0,
    toastTimer = 0;

  function update(dt, input) {
    const turnLeft = !!(input && input.turnLeft),
      turnRight = !!(input && input.turnRight);
    const moveLeft = !!(input && input.moveLeft),
      moveRight = !!(input && input.moveRight);

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

    const fwd = dirVec(heading),
      perp = perpVec(heading);
    let nx = x + (fwd.x * SPEED + perp.x * pvx) * dt;
    let nz = z + (fwd.z * SPEED + perp.z * pvx) * dt;
    ({ x: nx, z: nz } = clampToRoad(segments, nx, nz));
    x = nx;
    z = nz;
    s = nearestArcLength(segments, x, z);

    if (
      !arrived &&
      nextHint < hints.length &&
      s + HINT_LOOKAHEAD >= hints[nextHint].s
    ) {
      showToast(toast, hints[nextHint].arrow, hints[nextHint].text);
      toastTimer = TOAST_DURATION;
      nextHint++;
    }
    if (!arrived && s >= totalLength - 1) {
      arrived = true;
      showToast(toast, "●", "도착 — 성공", true);
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0 && !arrived) hideToast(toast);
    }
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
    get hits() {
      return 0;
    }, // 보행자를 뺐으니 항상 0 — main.js 접점 모양은 유지
    get distance() {
      return s;
    },
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

function computeTurnHints(waypoints) {
  const hints = [];
  let acc = 0;
  for (let i = 1; i < waypoints.length - 1; i++) {
    const [x0, z0] = waypoints[i - 1],
      [x1, z1] = waypoints[i],
      [x2, z2] = waypoints[i + 1];
    acc += Math.hypot(x1 - x0, z1 - z0);
    const h0 = Math.atan2(z1 - z0, x1 - x0),
      h1 = Math.atan2(z2 - z1, x2 - x1);
    let diff = h1 - h0;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 0.2) continue; // 거의 직진이면 갈림길로 안 친다
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
  const half = (BUILDING_SEC[id] * BUILDING_LEN_SCALE) / 2;
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

function buildBuildings(scene, routeNames, waypoints) {
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
    addGate(scene, gateMat, b.entry, b.dirs[0]);
    addGate(scene, gateMat, b.exit, b.dirs[2]);
    addBuildingBox(scene, gateMat, labelMat, b.chain, b.dirs);
  }
  return placements;
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

// 지금 고른 경로에 실제로 있는 건물만 안내한다 — 회전 안내와 같은 원리로,
// 안 지나갈 건물까지 안내하면 의미가 없다. 어느 문이 정답인지는 매번 무작위.
function computeDoorHints(placements, routeNames, segments) {
  const hints = [];
  for (const b of placements) {
    if (!routeNames.includes(b.id)) continue;
    const door = Math.floor(Math.random() * 3);
    hints.push({
      s: nearestArcLength(segments, b.entry[0], b.entry[1]),
      arrow: DOOR_ARROW[door],
      text: DOOR_NAME[door],
    });
  }
  return hints;
}

// ── 도로 지오메트리 — 선택된 경로든 아니든 도로망(ROADS) 전부를 똑같은
// 스타일(바닥·벽 타일, 차선)로 그린다. 실제로 걸을 수 있는 건 여전히 선택된
// 경로(waypoints, clampToRoad에서 씀)뿐이지만 겉모습은 구분하지 않는다.
// 건물·신호등·공사장 없음. 이음매는 offsetDirs로 마이터 처리한다. ────
function buildCityRoads(scene) {
  const groundMat = new THREE.MeshBasicMaterial({ color: COLOR.ground });

  const xs = Object.values(N).map((p) => p[0]),
    zs = Object.values(N).map((p) => p[1]);
  const pad = 20;
  scene.add(
    new THREE.Mesh(
      quadGeometry(
        [Math.min(...xs) - pad, 0, Math.min(...zs) - pad],
        [Math.max(...xs) + pad, 0, Math.min(...zs) - pad],
        [Math.max(...xs) + pad, 0, Math.max(...zs) + pad],
        [Math.min(...xs) - pad, 0, Math.max(...zs) + pad],
      ),
      groundMat,
    ),
  );

  const floorMat = new THREE.MeshBasicMaterial({
    map: stripeTexture(COLOR.floor, COLOR.floor2),
  });
  const wallMat = new THREE.MeshBasicMaterial({
    map: stripeTexture(COLOR.wall, COLOR.wall2),
    side: THREE.DoubleSide,
  });
  const laneMat = new THREE.MeshBasicMaterial({
    map: dashTexture(COLOR.lane),
    transparent: true,
  });

  // ROADS는 T/C 표시점 때문에 그래프 노드 하나가 여러 짧은 배열로 쪼개져 있다
  // (예: N1→C1→B3와 B3→N3는 사실 한 길인데 배열이 둘로 나뉨). 이 경계마다
  // 독립된 벽 계산을 하면, 실제로는 그냥 지나가는 지점(끝점 차수 2)까지
  // "교차로"로 오판해서 이음매가 다시 깨지고 있을 필요 없는 곳까지 벽이
  // 뚫렸다 — 방금 겪은 버그. mergeStraightRoads로 차수 2인 경계를 먼저
  // 이어붙여서, 실제 갈림길(차수 3 이상)에서만 벽을 물리게 한다.
  const junctions = computeJunctions(ROADS); // 차수 3 이상 = 진짜 갈림길
  const logicalRoads = mergeStraightRoads(ROADS);
  logicalRoads.forEach((road, i) => {
    buildRoadStrip(scene, road, floorMat, wallMat, laneMat, junctions, i);
  });
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

function buildRoadStrip(
  scene,
  names,
  floorMat,
  wallMat,
  laneMat,
  junctions,
  roadIdx,
) {
  const waypoints = names.map(pt);
  const n = waypoints.length;
  const dirs = offsetDirs(waypoints);
  const floorY = 0.01 + roadIdx * 0.0002; // 겹치는 교차로 바닥끼리 z-fighting 안 나게 살짝 어긋냄

  // 벽을 그릴 때 쓰는 기준점 — 교차로 쪽 끝점이면 그 방향으로 ROAD_HALF만큼
  // 안으로 당긴다. 바닥·차선은 그대로 waypoints를 써서 교차로까지 꽉 채운다.
  const wallBase = waypoints.map((p) => [...p]);
  if (n >= 2) {
    if (junctions.has(names[0])) {
      const [x0, z0] = waypoints[0],
        [x1, z1] = waypoints[1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const inset = Math.min(ROAD_HALF, len * 0.45);
      wallBase[0] = [
        x0 + ((x1 - x0) / len) * inset,
        z0 + ((z1 - z0) / len) * inset,
      ];
    }
    if (junctions.has(names[n - 1])) {
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
    const vRepeat = Math.max(1, len / 6); // prototype 기준 3유닛마다 색이 바뀌도록 주기 6유닛

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
      scene.add(
        new THREE.Mesh(
          quadGeometry(
            [wx0 + d0.x * ROAD_HALF * side, 0, wz0 + d0.z * ROAD_HALF * side],
            [
              wx0 + d0.x * ROAD_HALF * side,
              CEIL,
              wz0 + d0.z * ROAD_HALF * side,
            ],
            [
              wx1 + d1.x * ROAD_HALF * side,
              CEIL,
              wz1 + d1.z * ROAD_HALF * side,
            ],
            [wx1 + d1.x * ROAD_HALF * side, 0, wz1 + d1.z * ROAD_HALF * side],
            vRepeat,
          ),
          wallMat,
        ),
      );
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
          laneMat,
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
  el.style.cssText = `
    position:fixed; top:24px; left:50%; transform:translate(-50%,-8px);
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
