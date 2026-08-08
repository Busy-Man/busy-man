# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-08-08
- Primary product surfaces: 시작 표지, 3D 주행 화면, 폰 질문 모달
- Evidence reviewed: `AGENTS.md`, `src/main.js`, `src/world.js`, `docs/기획_1차_보완.md`, `docs/ui-spec.md`, `assets/cover/cover-keyart.png`

## Brand

- Personality: 촉박한 출근길의 긴장감과 판교 테크 오피스의 정돈된 실용성
- Trust signals: 표지에서 게임의 주행·메시지 이중 과업을 시각화하고 전체 조작을 명시한다
- Avoid: 이미지 안의 글자, 사원증 슬롯·상태·사번·직무처럼 플레이에 필요 없는 장식성 메타 정보, 중첩 카드

## Product goals

- Goals: 전방 주행과 업무 문자 응답을 번갈아 보게 만든다
- Non-goals: 별도 서사·계정·튜토리얼 화면을 추가하지 않는다
- Success signals: 시작 전 목표와 모든 조작을 이해하고 바로 플레이를 시작할 수 있다

## Personas and jobs

- Primary personas: 키보드로 짧게 플레이하는 심사자와 테스트 플레이어
- User jobs: 제한 시간 안에 길을 달리고 메시지 퀴즈에 답한다
- Key contexts of use: 데스크톱 브라우저, 전체 화면에 가까운 주행 장면

## Information architecture

- Primary navigation: 표지 → 주행/폰 → 결과 → 재시작
- Core routes/screens: 시작 표지, 주행 HUD, 질문 모달, 결과 모달
- Content hierarchy: 게임명 → 상황·목표 → 전체 조작 → 시작 행동

## Design principles

- Principle 1: 키아트는 출근길·행인·스마트폰을 한 장면에 담아 코어 플레이를 간접 설명한다
- Principle 2: 정보는 이미지가 아니라 HTML에 두어 대비·반응형·접근성을 유지한다
- Principle 3: 키와 행동을 고정된 행으로 짝지어 짧은 시간에도 훑을 수 있게 한다
- Principle 4: 플레이 판단에 쓰이지 않는 표지 정보와 장식은 추가하지 않는다
- Tradeoffs: 생성 이미지는 1.6MB PNG로 동봉한다. 변환 도구·새 의존성을 넣지 않는 대신 압축 최적화는 보류한다

## Visual language

- Color: 딥 틸·블루그레이 배경, 화이트 타이틀과 민트 포인트, 청회색 본문
- Typography: 기울기 없는 굵은 테크 계열 영문 타이틀, Pretendard·맑은 고딕 계열 한글, 모노스페이스 키 표기, CTA는 18px·900 굵기
- Spacing/layout rhythm: 왼쪽 단일 정보 패널과 오른쪽 액션 장면의 비대칭 구도, 패널 안 2열 조작 표
- Shape/radius/elevation: 18px 단일 패널, 얇은 구분선, 중첩 카드·키 캡·장식 배경 없음
- Motion: 카드만 짧게 진입하며 `prefers-reduced-motion`에서는 제거한다
- Imagery/iconography: 무문자 스타일라이즈드 3D 키아트. 알림은 원·사각형·링으로만 표현한다

## Components

- Existing components to reuse: `makeStartScreen`, `createWorld`
- New/changed components: 최소 표지 패널, 큰 키 표기의 2열 조작 표, 출근 시작 버튼
- Variants and states: 시작 전 표지 / 시작 후 제거 / 980px 이하 중앙 카드 / 620px 이하 단일 열
- Token/component ownership: `src/main.js` (A 소유), `assets/cover/cover-keyart.png` (공동)

## Accessibility

- Target standard: 키보드와 마우스로 시작 가능
- Keyboard/focus behavior: Tab으로 시작 버튼에 접근하면 포커스를 표시하고 표준 Enter/Space 버튼 동작을 사용한다
- Contrast/readability: 키아트 왼쪽을 그라데이션으로 낮추고 별도 불투명 패널 안에 텍스트를 둔다
- Screen-reader semantics: 제목은 `h1`, 조작 목록은 `section`, 시작은 `button`
- Reduced motion and sensory considerations: 키아트는 정지 이미지이며 감소 모션 설정에서 카드 애니메이션을 끈다

## Responsive behavior

- Supported breakpoints/devices: 데스크톱 우선, 좁은 브라우저 폭까지
- Layout adaptations: 980px 이하에서 카드를 중앙으로 옮기고, 620px 이하에서 조작 그룹을 한 열로 바꾼다
- Imagery adaptation: 좁은 화면에서는 키아트 초점을 오른쪽 64%에 두되 짙은 오버레이로 글자 대비를 보존한다
- Touch/hover differences: 버튼은 클릭 가능하며 hover 효과에 의존하지 않는다

## Interaction states

- Loading: 로컬 키아트가 로드되는 동안 딥 틸 배경색과 패널이 먼저 보인다
- Empty: 해당 없음
- Error: 키아트 로드 실패 시 단색 배경 위 동일한 HTML 정보 구조를 유지한다
- Success: 버튼 클릭 후 표지를 제거하고 월드·폰·퀴즈를 만든 뒤 게임 루프를 시작한다
- Disabled: 해당 없음
- Offline/slow network, if applicable: 모든 코드와 에셋은 저장소 상대경로로 동봉한다

## Content voice

- Tone: 짧고 긴급하지만 명확한 회사 시스템 문구
- Terminology: 출근, 업무 문자, 답장, 부스터
- Microcopy rules: 서사는 상황과 플레이어 과업을 두 줄로 분리하고, 답장 입력은 복합 문항까지 포함하는 `숫자키 (1~4)`로 표기한다

## Implementation constraints

- Framework/styling system: 번들러 없는 HTML + ES 모듈, `makeStartScreen()` 내부 DOM·CSS
- Design-token constraints: 기존 월드의 청록·코럴 팔레트와 Pages 상대경로 규칙을 지킨다
- Performance constraints: 표지 이미지 한 장만 추가하고 시작 전 월드 업데이트는 실행하지 않는다
- Compatibility constraints: 외부 CDN·웹폰트·새 패키지를 추가하지 않는다
- Asset constraints: `./assets/cover/cover-keyart.png`, 1672×941, 이미지 내부 텍스트 없음
- Test/screenshot expectations: 1440×900과 1280×720 표지, 이미지 200 응답, 시작 전 게이팅, 시작 후 주행을 확인한다

## Open questions

- [ ] 실제 플레이 테스트 후 조작 행의 문구 밀도를 더 줄일지 결정 / A / 낮음
