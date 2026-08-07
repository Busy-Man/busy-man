# Deep Interview Spec: 대화/퀴즈 수치 랜덤화

## Metadata
- Interview ID: content-value-randomization
- Rounds: 8
- Final Ambiguity Score: 12%
- Type: brownfield
- Generated: 2026-08-06
- Threshold: 20%
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.85 | 0.25 | 0.2125 |
| Success Criteria | 0.85 | 0.25 | 0.2125 |
| Context Clarity | 0.95 | 0.15 | 0.1425 |
| **Total Clarity** | | | **0.8825** |
| **Ambiguity** | | | **0.1175** |

## Topology

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|--------------|---------------------------|
| 콘텐츠 스키마 확장 | active | 고정 문자열 대신 `{field}` 플레이스홀더 + 값 풀 참조 도입, 기존 20개 quiz 마이그레이션 | Round 1, 4, 5, 7에서 커버 |
| 랜덤값 생성 및 보기 구성 규칙 | active | 필드 타입별 값 풀, 판 시작 시 1회 독립 배정, 타입별 오답 함정 전략 | Round 2, 3, 6에서 커버 |
| 렌더링 치환 | active | `phone.js`가 메시지 텍스트의 플레이스홀더를 실제 값으로 치환 | Round 5에서 커버(파일 위치·문법 확정, 구현 세부는 실행 단계) |

(4번째 후보였던 "오답 보기 생성"은 Round 1에서 사용자가 "랜덤값 생성 규칙"에 통합하는 것으로 확인 — 별도 컴포넌트로 분리하지 않음.)

## Goal

`content/day1.json`의 20개 퀴즈 중, 근거 문장에 구체적 수치/고유명사(시간, 개수, 회의실 번호, 티켓 번호, 금액, 버전, 요일, 출구 번호 등)가 등장하는 19개를 **판(게임 세션) 시작 시 한 번, 문항마다 독립적으로 랜덤 배정**하도록 바꾼다. 서사적 상태 문구인 1개(`sourceMessageIndex: 4`, "어제 배포는 어떻게 됐죠?")는 기존 고정 choices/answer 방식을 그대로 유지한다. 목적은 플레이어가 답을 외워서 반복 플레이 시 유리해지는 것을 막는 것 — 지금은 보기 "순서"만 랜덤이라 값 자체를 암기하면 무력화된다.

## Constraints

- **값 표현**: 메시지 텍스트 안에서는 `{field}` 중괄호 플레이스홀더 문법을 쓴다 (기존 `phone.js`의 `mapTemplate.replace('{lane}', ...)` 패턴과 동일 계열).
- **값 풀 저장 위치**: 새 파일 `content/values.json`에 필드 타입별 값 풀을 둔다. `content/day1.json`과 분리해, 향후 다른 날짜/맵 콘텐츠와도 공유 가능하게 한다.
- **랜덤 타이밍**: 값은 판(게임) 시작 시 한 번 뽑는다. `content.quizzes` 전체를 순회하며 각 퀴즈가 필요로 하는 필드 타입 값을 독립적으로 배정한다. 같은 quiz를 참조하는 여러 메시지(예: "302호로 잡았어요" → "302호 맞죠?")는 그 판 안에서 항상 같은 값을 공유한다. 판이 새로 시작되면(새로고침) 다시 뽑는다.
- **정답 표현 방식**: JSON은 더 이상 고정 `choices`/`answer`(인덱스)를 갖지 않는다 — 랜덤화된 19개 항목은 `field`(필드 타입)와 오답 개수만 지정하고, `choices`/`answer`는 런타임에 값 풀에서 생성한다. `prompt` 문구는 작성자가 그대로 쓴다. 1개(고정 항목)는 기존 `choices`/`answer` 방식을 그대로 유지 — **스키마는 두 형태가 공존**해야 한다(예: `field` 키 유무로 분기).
- **오답(함정) 생성 전략은 필드 타입마다 다르다**: `room_number`, `ticket_number`, `amount_krw`처럼 원본 콘텐츠가 이미 "인접값/숫자 섞기" 함정을 쓰고 있던 타입은 그 패턴을 유지하는 오답 생성 전략을 쓴다. `time`, `count`처럼 단순 값 풀에서 뽑아도 되는 타입은 순수 랜덤으로 충분하다. 타입별 전략은 값 풀 정의와 함께 관리한다.
- **판정 로직**: `quiz.js`의 `judge()`는 인덱스 비교(`picked === quiz.answer`) 방식을 유지하되, 런타임에 생성된 `choices`/`answer`에 대해 동작해야 한다. 기존 `shuffleChoices()`의 순서 셔플 로직과 값 생성은 독립적으로 합성 가능해야 한다(먼저 값 생성 → 그 다음 순서 셔플).
- **검증**: `quiz.js`의 `validateContent()`는 스키마가 두 형태(고정형/동적형)로 나뉘므로, 동적형에 대한 검증 규칙(예: `field`가 정의된 타입인지, 값 풀에 최소 3개 이상 후보가 있는지)을 추가해야 한다.
- 접점 4개(`speedMul`, `gauge`, `quizOpen`, `onGate`)는 이 작업 범위 밖 — 건드리지 않는다.
- 파일 소유권(AGENTS.md §1): `content/*.json`, `src/quiz.js`, `src/phone.js` 모두 B 소유 — 이번 작업은 전부 B의 파일 경계 안에서 끝난다. `src/world.js`, `src/main.js`, `src/state.js`는 건드릴 이유 없음.

## Non-Goals

- `sourceMessageIndex: 4`("어제 배포는 어떻게 됐죠?")처럼 서사적 상태 문구는 이번 스코프에서 랜덤화하지 않는다 — 기존 고정 방식 유지.
- 랜덤 부여 연출(룰렛·카드 뽑기 등, AGENTS.md §3 "잠정" 항목)은 이번 작업과 무관 — 건드리지 않는다.
- 질문 개수·주기(6~8초) 변경은 스코프 밖.
- 접점 4개 확장이나 `src/world.js`/`src/main.js`/`src/state.js` 수정은 스코프 밖.
- 다른 날짜/콘텐츠 파일(`content/day2.json` 등)이 아직 없으므로 그 마이그레이션은 스코프 밖. 다만 `content/values.json`을 분리 파일로 두는 이유가 향후 재사용을 위한 것임을 기록해 둔다.

## Acceptance Criteria

- [ ] 같은 판을 두 번 이상 새로고침해서 회의실 번호/티켓 번호/시간 등 값이 실제로 바뀌는 것을 육안으로 확인한다.
- [ ] 정답을 선택하면 "맞았어요" 피드백이, 오답을 선택하면 "틀렸어요" 피드백이 뜨는지 — 값이 랜덤이어도 판정이 항상 정확한지 확인한다.
- [ ] 기존 20개 퀴즈 전부(19개 동적 + 1개 고정)를 마이그레이션한 뒤 `quiz.js`의 `validateContent()`를 통과하는지 확인한다.
- [ ] 같은 판 안에서 같은 사실을 두 번 이상 언급하는 메시지(회의실 번호처럼)가 항상 같은 랜덤값을 보여주는지 확인한다.
- [ ] 티켓 번호/금액처럼 원래 "숫자 섞기" 함정이 있던 문항은 마이그레이션 후에도 오답이 여전히 헷갈리는 형태(근접값/자릿수 섞기)로 나오는지 확인한다.

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "시간이나 회의실 번호, 장소 등"이 예시로 든 3개 필드로 한정될 것 | Round 1에서 "등"의 열린 범위를 지적 | 20개 quiz 근거 문장의 모든 구체적 수치/고유명사로 확대(19/20 해당), 향후 문항 증가 고려 |
| 값 풀이 문항별 커스텀일 것 | Round 2에서 문항 증가 시 유지보수 비용 지적 | 필드 타입별 공용 값 풀로 결정 |
| 값이 매 퀴즈 노출마다 다시 뽑힐 것 | Round 3에서 같은 사실을 여러 메시지가 참조하는 경우의 일관성 문제 제기 | 판 시작 시 1회, quiz마다 독립 배정, 같은 판 내 일관성 유지 |
| 정답을 JSON에 고정 인덱스로 계속 박아둘 수 있을 것 | Round 4에서 choices 자체가 판마다 달라지므로 고정 인덱스가 성립하지 않음을 지적 | `field` 타입만 지정, `choices`/`answer`는 런타임 생성 |
| 오답도 순수 랜덤이면 충분할 것 | Round 6에서 실제 콘텐츠(NAN-417/471/174, 4,500/4,050/5,400원)가 이미 숫자 섞기 함정을 쓰고 있음을 근거로 제기 | 타입별로 "순수 풀" vs "인접값/숫자 섞기" 전략을 구분 |
| 20개 전부를 이번에 마이그레이션할 것 | Round 7에서 1개(서사적 문구)가 스코프 밖일 수 있음을 확인 | 20개 전부 마이그레이션(19개 동적 + 1개는 기존 고정 방식 유지)으로 확정 |

## Technical Context

- `content/day1.json`: `messages[]`(자유 텍스트, 필드 없음), `quizzes[]`(`sourceMessageIndex`, `prompt`, `choices`, `answer`). 퀴즈 20개 확인 완료(본문 참조).
- `src/quiz.js:255-266` `shuffleChoices()` — Fisher–Yates 순서 셔플, `answer`를 `order.indexOf()`로 재계산.
- `src/quiz.js:180-195` `judge(picked)` — 인덱스 비교, `picked === -1`은 타임아웃(오답과 동일 패널티).
- `src/quiz.js:269-293` `validateContent()` — `choices.length===3`, `answer` 0~2, `sourceMessageIndex` 범위만 검사(동적 스키마 검증 규칙 추가 필요).
- `src/phone.js:217-229` `buildBubble()` — `msg.text`를 `textContent`로 그대로 삽입(치환 없음, 확장 필요).
- `src/phone.js:136-147` `pushMap()` — `content.mapTemplate.replace('{lane}', ...)`이 유일한 기존 치환 사례, 참고 패턴으로 사용 가능.
- `src/state.js` — 접점 4개(`speedMul`, `gauge`, `quizOpen`, `onGate`)만 존재, 이번 작업과 무관 확인.
- AGENTS.md §1: `content/*.json`, `src/phone.js`, `src/quiz.js` 모두 B 소유 파일 — 파일 경계 충돌 없음.
- AGENTS.md §3 "열림": `content/day1.json` 스키마는 "합의 전 코드 금지" 항목이었으나, 8/5 병합일이 지난 시점이라 크로스 팀원 합의 이슈는 없음(전부 B 파일 경계 내).

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|----------------|
| Quiz | core domain | `sourceMessageIndex`, `prompt`, `field`(동적) 또는 `choices`/`answer`(고정), `wrongCount` | Message를 참조(`sourceMessageIndex`), FieldType을 참조(`field`) |
| Message | supporting | `from`, `kind`, `text`(플레이스홀더 포함 가능) | Quiz에서 참조됨 |
| FieldType | core domain | `id`(예: room_number), `pool`(후보 값 목록), `distractorStrategy`(순수 랜덤 / 인접·숫자섞기) | 여러 Quiz/Message가 공유 |
| ValuePool 파일(`content/values.json`) | supporting | FieldType 목록 | day1.json과 분리, 재사용 가능 |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|-------------------|
| 1 | 2 (Quiz, 랜덤필드) | 2 | - | - | N/A |
| 3 | 3 (+ValuePool) | 1 | - | 2 | 67% |
| 5 | 4 (+FieldType 세분화, ValuePool 파일로 구체화) | 1 | 1 | 2 | 75% |
| 8 | 4 (Quiz, Message, FieldType, ValuePool 파일) | 0 | 0 | 4 | 100% |

## Interview Transcript

<details>
<summary>Full Q&A (8 rounds, Round 0 토폴로지 포함)</summary>

### Round 0 — 토폴로지 확인
**Q:** 3개 컴포넌트(콘텐츠 스키마 확장 / 랜덤값 생성 규칙 / 렌더링 치환 / 오답 생성)로 나눠도 될지
**A:** 4개 범위 확인 후 "오답은 필드별 값 풀에서 마찬가지로 랜덤 2개 뽑으면 되지 않나?" → 오답 생성을 랜덤값 생성 규칙에 통합, 3개 컴포넌트로 확정

### Round 1
**Q:** 랜덤화 대상 필드를 3개(시간/회의실/장소)로 한정할지, 모든 quiz 근거 문장의 수치/고유명사로 확대할지
**A:** 모든 quiz 근거 문장의 구체적 수치/고유명사 전부(향후 문항 증가 고려)

### Round 2
**Q:** 값 풀을 필드 타입별 공용으로 관리할지, 문항별 커스텀으로 둘지
**A:** 필드 타입별 공용 값 풀

### Round 3
**Q:** 랜덤값을 언제 뽑는지(판 시작 1회 vs 매 노출마다 vs 다른 타이밍)
**A:** 판 시작 시 한 번, 전체 quiz에 각각 독립 배정

### Round 4
**Q:** 랜덤화된 항목에서 JSON이 고정 choices/answer 대신 무엇을 가질지
**A:** field 타입과 오답 개수만 지정, choices/answer는 런타임에 생성

### Round 5
**Q:** 플레이스홀더 문법과 값 풀 저장 위치
**A:** `{field}` 중괄호 문법 + `content/values.json` 새 파일

### Round 6
**Q:** 오답(함정) 생성 방식 — 순수 랜덤 vs 타입별 전략
**A:** 타입별로 "순수 풀" vs "인접값/숫자 섞기" 전략을 지정

### Round 7
**Q:** 기존 20개 quiz 전부 마이그레이션할지, 서사적 문구(sourceMessageIndex 4)는 제외할지
**A:** 20개 전부 마이그레이션(19개 랜덤화 + 1개는 기존 정적 방식 유지)

### Round 8
**Q:** 완료를 무엇으로 확인할지
**A:** (1) 새로고침 시 값 변화 육안 확인, (2) 판정 정확성 확인, (3) validateContent() 통과 확인 — 3개 모두 채택

</details>
