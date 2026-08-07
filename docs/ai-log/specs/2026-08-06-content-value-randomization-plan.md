# Plan: 대화/퀴즈 수치 랜덤화 (RALPLAN-DR, short mode)

Source spec: `.omc/specs/deep-interview-content-value-randomization.md` (모호성 12%, PASSED)
Iteration: 5 (Critic 3차 검토 반영 — 기존 콘텐츠 오프바이원 2건 수정, 전수 리터럴 스캔 추가, buildBubble 호출부 정정, A와의 합의 요건 명확화)

## Requirements Summary

`content/day1.json`의 quiz 20개 중 19개(수치/고유명사 근거)를 판(게임 세션) 시작 시 한 번, 문항마다 독립적으로 랜덤 배정하고, 1개(서사적 상태 문구, `sourceMessageIndex: 4`)는 기존 고정 방식을 유지한다. 값은 `{token}` 플레이스홀더로 메시지 텍스트에 삽입하되 **원본 텍스트는 불변 템플릿으로 유지**하고, 렌더링 시점에만 치환한다. `content/day1.json` 안에 새로 두는 최상위 `values` 키(필드 타입별 공용 값 풀)에서 정답 후보를 뽑고, 그 후보에 **미리 저작해 둔 오답(함정 포함)을 그대로 함께** 쓴다(런타임 파생 없음). `choices`/`answer`는 더 이상 고정되지 않고 런타임에 생성된다. 전부 B 소유 파일(`content/*.json`, `src/quiz.js`, `src/phone.js`, `dev/check-content.mjs`) 경계 안에서 끝난다.

## Iteration 1 → 2 변경 요약 (Architect 1차 검토 반영)

1. **치명적 결함 — 원본 파괴적 치환**: `content.messages[i].text`를 제자리에서 덮어쓰면 플레이스홀더가 사라져 `reset()` 후 재추첨이 불가능했다. → **템플릿(불변)과 렌더값(가변)을 분리**한다. `content.messages[*].text`는 항상 `{token}`을 포함한 원본 그대로 두고, `buildBubble()`이 렌더링 시점에 치환한다.
2. **누락된 의존성 — `dev/check-content.mjs`**: 정적 스키마 검사기가 `choices`/`answer` 고정 스키마를 가정하고 있어 마이그레이션 즉시 FAIL한다. → 이번 스코프에 포함해 동적 스키마도 검사하도록 갱신한다.
3. **함정 보존이 실제로는 후퇴함**: `messages[12]` "203호 아니고요?"처럼 대화 속 고정 대사가 랜덤 정답과 안 맞을 수 있었다. → 대화 속 함정 언급도 플레이스홀더(`{room_alt1}` 등)로 만든다.
4. **재진입 지점 부재**: `reset()`이 플래그만 지우고 다시 계산을 트리거하지 않았다. → `reset()`이 즉시 재계산을 트리거한다.

## Iteration 2 → 3 변경 요약 (Architect 2차 검토 반영, REVISE)

1. **런타임 "파생" 오답 폐기**: `adjacent`/`digit-shuffle` 같은 런타임 생성 규칙은 `4,500원`(쉼표), `v2.3.1`(버전 문자열), `수요일 6시`(요일+시각 복합) 같은 실제 형식과 안 맞아 정의 자체가 불완전했다. → **오답도 정답과 함께 값 풀 항목에 미리 저작**한다(`alts` 배열, 정확히 2개). 형식 문제가 원천적으로 사라지고, 함정 문구도 항상 실제 저작된 오답과 일치한다.
2. **`q.id` 충돌 무방비**: 서로 다른 quiz가 같은 `id`를 쓰면 딕셔너리에서 조용히 덮어써져 한쪽 정답이 대화에 안 나타난다. → `dev/check-content.mjs`에 `id`(및 `_alt1`/`_alt2` 네임스페이스) 중복 검사를 추가.
3. **고아 플레이스홀더 무방비**: 메시지에 `{rom}` 같은 오타가 있으면 치환되지 않고 그대로 노출된다. → `dev/check-content.mjs`가 모든 `messages[*].text`의 `{\w+}` 토큰을 수집해, 그 판에서 실제로 채워질 키(quiz `id`/`id_alt1`/`id_alt2`) 집합과 양방향으로 대조한다.
4. **부분 reset 위험**: `phone.reset()`과 `quiz.reset()`이 각각 강제 재계산을 걸면, 향후 호출부(`main.js`)가 둘 중 하나만 부를 경우 스트림엔 새 값·퀴즈엔 옛 값이 섞일 여지가 있었다. → **재계산 소유자를 `phone.js` 하나로 단일화**한다. `quiz.js`는 마운트 시 방어적으로 한 번(멱등, 비강제) 호출할 뿐, 자신의 `reset()`에서는 강제 재계산을 걸지 않는다.

## Iteration 3 → 4 변경 요약 (Critic 검토 반영, REVISE)

1. **치명적 결함 — `content/values.json`을 로드할 경로가 없음**: `content`는 `fetch('./../content/day1.json')` 한 번으로만 만들어지고(`dev/harness.html:222-224`), `resolveContentValues()`는 마운트 경로 안에서 동기로 실행돼 별도 파일을 다시 `fetch`할 수 없다. 별도 파일을 로드하려면 A 소유/소유 불명 파일을 고쳐야 하는데(계획이 Option B로 이미 기각한 경로), 그건 모순이다. → **`values`를 `content/values.json`이 아니라 `content/day1.json`의 최상위 키로 합친다.** `content/values.json`은 만들지 않는다.
2. **`sourceMessageIndex`↔`id` 결속이 검사되지 않음**: 지금 콘텐츠는 `quizzes[i].sourceMessageIndex`가 가리키는 메시지가 실제로 정답 근거를 담고 있다는 것이 게임의 전제다(`quiz-eligibility.mjs`가 그 메시지를 봤는지로 질문 자격을 판단, `quiz.js:115-120`). 마이그레이션 후에도 이 결속이 깨지지 않는지 아무도 검사하지 않았다. → `dev/check-content.mjs`에 `messages[q.sourceMessageIndex].text.includes('{' + q.id + '}')` 단언을 추가한다.
3. **Acceptance Criteria #7이 설계와 모순**: "`phone.reset()`과 `quiz.reset()`을 각각 호출한 뒤... 값이 새로 뽑히는지"라고 썼는데, Step 4/Principle 6은 `quiz.reset()` 단독으로는 재계산이 안 되게 설계했다. → 기준을 설계와 일치시킨다(아래 Acceptance Criteria 참조).
4. **중복 보기 검사 소실**: 기존 `dev/check-content.mjs:56`(`new Set(q.choices).size`)이 동적 quiz 검사에서 빠졌다. `alts` 저작 실수로 두 보기가 같은 문구가 될 수 있다. → Step 6에 `choice`/`message` 3종 모두 서로 달라야 한다는 검사를 추가한다.

## Iteration 4 → 5 변경 요약 (Critic 3차 검토 반영, REVISE — 범위 좁음)

Iteration 4에서 반영한 4가지는 모두 해소로 확인됐다. 새로 3가지를 반영했다:

1. **기존 콘텐츠의 실재 오프바이원 2건**: 실제 `content/day1.json`을 결속 검사 기준으로 대조해보니, `이 대리는 지금 몇 번 출구 쪽이죠?` 문항의 `sourceMessageIndex: 31`은 실제로는 `messages[32]`("저 지금 3번 출구쪽이에요")를 가리켜야 했고, `결제 모듈 테스트 케이스가 몇 개라고 했죠?` 문항의 `sourceMessageIndex: 42`도 `messages[43]`이어야 했다. 지금까지 드러나지 않은 이유는 `sourceMessageIndex`가 "질문 자격이 언제 열리는지"에만 쓰였고 텍스트 내용과 대조된 적이 없었기 때문이다. → Step 3에 두 인덱스의 선행 수정을 명시했다.
2. **"양방향" 검사가 실제로는 근거 문장 안쪽만 봤음**: 값이 근거 문장 밖 먼 메시지에 리터럴로 재등장해도(예: 티켓 번호가 근거에서 16칸 떨어진 알림에 다시 나옴) 아무 검사도 잡지 못했다. → Step 6에 전수 리터럴 잔존 스캔(경고 수준)을 추가했다.
3. **문항 간 서사적 종속**(예: "터진 버전" ↔ "핫픽스 버전")은 독립 추첨으로 깨질 수 있다. → 이번 스코프에서는 강제하지 않고 8/6 플레이테스트에서 값 풀 구성으로 조정하는 것으로 명시했다(Step 3).

부차적으로: `buildBubble`이 모듈 스코프라 `content`를 클로저로 못 갖는다는 점을 반영해 Step 5의 "호출부 변경 없음" 서술을 정정했고, `dev/check-content.mjs`가 "8/7 동결 전 삭제 예정" 임시 파일이라는 점과 AGENTS.md §3 "열림"이 요구하는 것이 통지가 아니라 **합의**라는 점을 "사용자 확인 필요" 절에 명시했다.

## RALPLAN-DR Summary

### Principles
1. 접점 4개(`speedMul`/`gauge`/`quizOpen`/`onGate`) 밖으로 새 공유 상태를 만들지 않는다 (AGENTS.md §2).
2. 파일 소유권 경계(AGENTS.md §1) 안에서만 구현한다 — `content/*.json`, `src/quiz.js`, `src/phone.js`, `dev/check-content.mjs`만 건드린다.
3. **원본 `messages[*].text`는 불변 템플릿이다** — 런타임이 그 위에 값을 덮어쓰지 않는다. 그래야 재추첨·재검증이 항상 원본에서 다시 시작할 수 있다. (`quizzes[*].choices`/`answer`는 예외 — 원래도 런타임 생성 대상이라 매 판 채워 넣는다.)
4. 같은 판 안에서는 같은 사실이 항상 같은 값으로 보여야 한다(재현 가능한 판 단위 랜덤).
5. 함정(오답)은 런타임에 생성하지 않는다 — 정답과 함께 값 풀에 미리 저작해, 대화 속 함정 언급과 항상 물려 있게 한다.
6. 재계산(강제 재추첨)은 단일 소유자(`phone.js`)만 트리거한다 — 두 모듈이 각자 강제 재계산을 걸지 않는다.
7. 최소 변경 — 번들러·프레임워크·새 추상화 계층을 넣지 않는다(AGENTS.md §7).

### Decision Drivers (top 3)
1. **템플릿/렌더값 분리** — 원본 텍스트를 살아있게 두어야 `reset()` 재추첨, `dev/check-content.mjs` 정적 검사, 향후 콘텐츠 재사용이 모두 성립한다(Architect 1차 지적).
2. **함정이 대화와 항상 물려야 한다, 형식 문제 없이** — `messages[12]`처럼 화자가 언급하는 오답 후보가 이번 판에 실제로 쓰이는 오답과 일치해야 하고, 그 오답이 쉼표·버전 문자열 같은 실제 형식을 정확히 갖춰야 한다(Architect 2차 지적 1).
3. **8/7 빌드 동결 D-1** — 오늘(2026-08-06)이 시작이고 내일 동결이다. 스코프가 20개 전수 마이그레이션이므로 시간 리스크를 최종 승인 단계에서 사용자에게 명시적으로 보여야 한다(Architect antithesis). 오답 사전 저작 방식은 런타임 생성 로직을 없애 구현 시간도 줄인다.

### Options

**Option A'' (권장) — 공유 모듈 분리 + 렌더 시점 치환 + 오답 사전 저작 + 단일 재계산 소유자 + 값 풀 단일 파일 통합**
`src/content-values.js`에 `resolveContentValues(content, opts)`를 둔다. 매 마운트 시 멱등하게(처음 1회만) 계산하고, **`phone.reset()`에서만** `force: true`로 즉시 재계산한다(`quiz.reset()`은 강제하지 않음 — 재계산 소유자 단일화). 계산 결과는 `content.__resolved`(플레이스홀더 → 텍스트 딕셔너리)에만 쓰고 **원본 `content.messages[*].text`는 절대 수정하지 않는다.** `buildBubble()`이 렌더링 시점에 `content.__resolved`로 치환한다. 오답은 런타임 생성 없이, 값 풀 항목에 **미리 저작된 `alts`(정확히 2개)**를 그대로 쓴다. 값 풀(`values`)은 별도 파일이 아니라 **`content/day1.json`의 최상위 키**로 둔다 — `content`는 한 번의 `fetch`로만 만들어지므로(`dev/harness.html:222-224`), 별도 파일은 로드할 경로가 없다.
- Pros: 원본이 항상 유효한 템플릿으로 남아 재추첨·재검증이 자연스럽다. 오답이 값 풀에 저작 시점부터 정답과 짝지어져 있으므로 형식·함정 문제가 원천적으로 없다. 재계산 소유자가 하나라 부분 reset 시나리오에서도 일관성이 깨지지 않는다. 값 풀을 같은 파일에 두므로 로딩 경로 문제가 없고 `fetch` 호출이 하나로 유지된다.
- Cons: `buildBubble()`을 반드시 수정해야 한다(원안보다 변경 범위가 phone.js 쪽으로 조금 넓어짐). 값 풀 저작 시 오답 2개를 사람이 직접 써야 한다(다만 기존 20개 문항도 원래 사람이 손으로 쓴 것이라 추가 비용은 크지 않음). `content/day1.json` 파일 하나가 더 커진다(별도 파일로 나누고 싶다면 향후 `main.js`가 구현될 때 A와 함께 두 번째 `fetch`를 넣는 것으로 재검토 가능).

**Option B — 호출부에서 명시적으로 1회 호출 (기각)**
`main.js`(A 소유, 현재 스텁)나 `dev/harness.html`(소유 불명)에서 `content = await res.json()` 직후 명시적으로 랜덤화를 1회 호출. **기각.** A가 아직 `main.js`를 구현하지 않았고, `dev/harness.html`을 B가 임의로 바꾸면 A의 검증 도구가 깨질 위험이 있다(AGENTS.md §1 "남의 파일을 고치지 않는다").

**Option C — 스코프 축소(함정 없는 5~6문항만 이번에 랜덤화)**
Architect가 제기한 antithesis: 스테이지는 90~150초 1회성이라 반복 학습 방지 효과가 제한적인데, 20문항 전수 마이그레이션 + 함정 재구성은 8/7 동결 D-1에 비용이 크다. `time`/`count`류(함정 없는 단순 필드) 5~6문항만 먼저 랜덤화하고, 함정형(`room_number`/`ticket_number`/`amount_krw`)은 8/6 밸런싱 이후나 여유가 되면 추가한다.
- Pros: 동결 전 완료 가능성이 높아진다. 함정 재구성이라는 가장 리스크 큰 부분을 미룬다.
- Cons: 사용자가 "20개 전부, 이번 스코프로 확정"이라고 이미 명시적으로 결정했다(스펙 Round 7). 임의로 축소하면 그 결정을 번복하는 것이라 계획 단계에서 일방적으로 정할 사안이 아니다.

**채택: Option A''를 구현 설계로 채택.** Option C(스코프 축소)는 계획이 임의로 결정하지 않고, **최종 승인 단계에서 사용자에게 시간 리스크로 명시**해 선택지로 남긴다(아래 "사용자 확인 필요" 참조).

## 사용자 확인 필요 — 승인 전 명시

- **일정 리스크**: 오늘(2026-08-06) 시작, 내일(2026-08-07) 빌드 동결. 20개 전수 마이그레이션(값 풀 저작 + `dev/check-content.mjs` 갱신 + 기존 오프바이원 2건 수정)을 하루 안에 끝내야 한다. 시간이 부족하면 Option C(함정 없는 5~6문항 우선, 함정형은 후속)로 축소하는 것을 고려할 것.
- **A와 합의 필요 (통지가 아니다)**: `content/day1.json` 스키마는 AGENTS.md §3에서 "열림" 항목이고, §3 원문은 "**합의 전에 코드를 쓰지 않는다**"이다. B 파일 경계 안에서 끝나는 변경이라도 이 규약은 착수 전 합의를 요구한다 — 단순 통지로 대체할 사안이 아니다. 착수 전에 A에게 스키마 변경 사실과 이 계획을 공유하고 이견이 없는지 확인한다.
- **`dev/check-content.mjs`의 수명**: 파일 머리말이 "임시 — 8/7 빌드 동결 전에 지운다"라고 명시한다. 이 계획의 Acceptance Criteria와 Verification Steps가 이 스크립트에 의존하므로, 지우기 전에(또는 지우지 않기로 재결정한 뒤) 검증을 마쳐야 한다.

## Acceptance Criteria

- [ ] 같은 판을 두 번 이상 새로고침해서 회의실 번호/티켓 번호/시간 등 값이 실제로 바뀌는 것을 `dev/harness.html`에서 육안으로 확인한다.
- [ ] 정답을 선택하면 "맞았어요", 오답을 선택하면 "틀렸어요" 피드백이 뜨는지 — 값이 랜덤이어도 판정이 항상 정확한지 확인한다.
- [ ] 기존 20개 퀴즈 전부(19개 동적 + 1개 고정)를 마이그레이션한 뒤 `src/quiz.js`의 `validateContent()`와 `node dev/check-content.mjs`가 모두 에러 없이 통과하는지 확인한다.
- [ ] 같은 판 안에서 같은 사실을 두 번 이상 언급하는 메시지(예: 회의실 번호가 나오는 `messages[11]`/`[12]`/`[13]`)가 항상 서로 모순 없는 값을 보여주는지 확인한다 — 정답 언급은 정답끼리, 함정 언급은 그 판에 실제로 생성된 오답과 일치해야 한다.
- [ ] 티켓 번호/금액처럼 원래 "숫자 섞기" 함정이 있던 문항은 마이그레이션 후에도 오답이 근접값/자릿수 섞기 형태로 나오는지 확인한다.
- [ ] `mountPhone`을 먼저 호출하든 `mountQuiz`를 먼저 호출하든(순서를 바꿔 테스트) 결과가 동일한지 확인한다(멱등성 검증).
- [ ] `phone.reset()`을 호출하면 재시작된 판에서 값이 실제로 새로 뽑히는지(이전 판과 달라지는지) 확인한다 — 원본 템플릿이 살아있어야 성립하는 기준. 반대로 `quiz.reset()`만 단독 호출했을 때는 값이 재계산되지 않고 직전 판의 값을 유지하는지도 함께 확인한다(재계산 소유자가 `phone.js` 하나라는 설계 그대로).
- [ ] 원본 `content/day1.json`의 `messages[*].text`가 게임 실행 후에도(reset 반복 포함) 항상 `{token}` 플레이스홀더를 포함한 원래 모습 그대로인지(즉, 런타임이 원본을 변형하지 않는지) 확인한다.
- [ ] `node dev/check-content.mjs`가 `id` 중복과 고아 플레이스홀더(정의되지 않은 `{token}`)를 실제로 잡아내는지 — 의도적으로 오타를 하나 넣어 FAIL하는지 확인한 뒤 되돌린다.

## Implementation Steps

1. **`content/day1.json`에 최상위 `values` 키 추가 (B 소유, 별도 파일 아님)**
   - `content/day1.json` 최상위에 `"values": { ... }`를 추가한다(별도 `content/values.json` 파일을 만들지 않는다 — `content`가 `fetch('./../content/day1.json')` 한 번으로만 만들어지므로, 별도 파일은 지금 시점에는 로드할 경로가 없다. Iteration 3의 이 판단은 Critic 검토에서 치명 결함으로 지적됐다).
   - 필드 타입별 값 풀을 정의한다. 각 후보는 다음 형태의 객체:
     ```json
     { "id": "room-302", "message": "302호", "choice": "302호요",
       "alts": [ { "message": "203호", "choice": "203호요" },
                 { "message": "320호", "choice": "320호요" } ] }
     ```
     `message`(메시지 문장용, 예: `"302호"`)와 `choice`(퀴즈 보기용, 예: `"302호요"`)가 다른 이유는 실제 콘텐츠가 그렇기 때문(`content/day1.json:27` vs `content/day1.json:95` 비교). `alts`는 **정확히 2개**, 사람이 미리 저작한 오답 — 런타임 생성 규칙 없음. 티켓/금액처럼 원래 숫자 섞기 함정이 있던 타입은 `alts`에 그 패턴을 그대로 옮겨 적는다(`NAN-417`의 `alts`는 `NAN-471`/`NAN-174`). 같은 값 풀 항목 안에서 `message`/`choice`/`alts[0].*`/`alts[1].*` 표기 텍스트는 서로 달라야 한다(중복 보기 방지, Step 6에서 검사).
   - 기존 19개 quiz에서 쓰이는 타입 전부를 포함(예: `duration_minutes`, `time_hm`, `count`, `room_number`, `ticket_number`, `amount_krw`, `version_string`, `weekday`, `exit_number`) — 정확한 타입 목록은 마이그레이션 단계에서 실제 20개 문항을 훑으며 확정한다. 한 타입에 값 풀 항목을 최소 2개 이상 둬서 판마다 다른 항목이 뽑히게 한다(항목이 1개뿐이면 정답이 매판 고정됨).

2. **`src/content-values.js` 신설 (B 소유)**
   - `resolveContentValues(content, { force = false } = {})`:
     - `if (content.__bmResolved && !force) return content.__resolved;`
     - `content.quizzes`를 순회하며 `field`가 있는 항목마다:
       a. `content.values[q.field].pool`에서 항목 1개(정답+저작된 `alts` 2개 포함)를 뽑는다.
       b. `q.choices = [항목.choice, 항목.alts[0].choice, 항목.alts[1].choice]`, `q.answer = 0`으로 quiz 객체를 채운다(이후 `shuffleChoices()`가 순서를 섞음, 기존 로직 무변경).
       c. 딕셔너리에 `{ [q.id]: 항목.message, [q.id+'_alt1']: 항목.alts[0].message, [q.id+'_alt2']: 항목.alts[1].message }`를 채운다. `q.id`는 콘텐츠 작성자가 quiz마다 지정하는 짧은 토큰(예: `"room"`, `"ticket"`) — 메시지 텍스트의 `{room}`, `{room_alt1}` 같은 플레이스홀더와 대응된다.
     - `content.__resolved = dict; content.__bmResolved = true; return dict;`
   - `substitute(text, dict)`: 순수 함수. `text.replace(/\{(\w+)\}/g, (m, key) => dict[key] ?? m)` — 딕셔너리에 없는 토큰은 원문 그대로 남겨 눈에 띄게 한다(치환 누락을 조용히 삼키지 않음. 1차 방어는 `dev/check-content.mjs`의 정적 검사, 이건 최후 방어선).

3. **`content/day1.json` 마이그레이션 (B 소유)**
   - **선행 수정 — 기존 콘텐츠의 `sourceMessageIndex` 오프바이원 2건**(Critic 3차 검토에서 실제 파일 대조로 확인): `이 대리는 지금 몇 번 출구 쪽이죠?` 문항은 `sourceMessageIndex: 31`(알림 "새 댓글 — NAN-417")로 돼 있지만 실제 근거는 `messages[32]`("저 지금 3번 출구쪽이에요")다 → `32`로 고친다. `결제 모듈 테스트 케이스가 몇 개라고 했죠?` 문항도 `sourceMessageIndex: 42`(박PM "회고는 오후 4시 반입니다")로 돼 있지만 실제 근거는 `messages[43]`("결제 모듈 테스트 케이스가 12개예요")다 → `43`으로 고친다. 이 두 건은 지금까지는 `sourceMessageIndex`가 오직 "질문 자격이 언제 열리는지"(근거 문자를 봤는지)에만 쓰였고 텍스트 내용 자체와 대조된 적이 없어 드러나지 않았다 — 이번 Step 6의 결속 검사가 정확히 이런 버그를 잡기 위한 것이다.
   - 19개 quiz에 `id`(짧은 토큰, quiz 전체에서 유일해야 함), `field`(값 풀 타입)를 추가하고 기존 고정 `choices`/`answer`는 제거한다.
   - 해당 메시지들의 하드코딩 값을 `{id}` 형태 플레이스홀더로 치환한다. **원본 텍스트는 이 치환 결과가 최종 형태다 — 런타임이 다시 손대지 않는다.**
   - 같은 필드를 여러 메시지가 언급하는 경우(`messages[11]`·`[12]`·`[13]` — 302/203호 사례) 전수 검토: 정답 언급은 `{room}`, 함정(203호) 언급은 `{room_alt1}`로 바꿔 그 판에 실제로 뽑힌 값 풀 항목의 `alts[0]`과 항상 일치하게 만든다.
   - **근거 문장 "근처"만으로는 부족하다.** 같은 값이 `sourceMessageIndex`에서 멀리 떨어진 메시지에도 등장할 수 있다 — 실제로 티켓 번호 `NAN-417`은 근거 문장(`messages[15]`)뿐 아니라 16칸 떨어진 `messages[31]`("새 댓글 — NAN-417")에도 리터럴로 다시 나온다. 마이그레이션 시 값 풀에 저작한 `message`/`choice`/`alts[*].message`/`alts[*].choice` 문자열 전부를 `messages[*].text` 전체(58개)에서 검색해, 근거 문장 밖에서도 리터럴로 남아있는 곳을 빠짐없이 플레이스홀더로 바꾼다(Step 6의 전수 스캔 검사가 이를 기계적으로 보조).
   - **문항 간 서사적 종속**은 이번 스코프에서 강제하지 않는다(예: "터진 버전"과 "핫픽스 버전"이 논리적으로는 이후 버전이어야 하지만, 두 quiz는 서로 다른 값 풀에서 독립적으로 뽑힌다). 눈에 띄게 어색한 조합이 나오면 8/6 플레이테스트에서 값 풀 항목 구성으로 조정하거나, 두 quiz를 한 값 풀 항목으로 묶어 함께 뽑히게 하는 후속 개선으로 남긴다.
   - 서사적 문구(`sourceMessageIndex: 4`)는 기존 `choices`/`answer` 방식 그대로 둔다.

4. **`src/quiz.js` 수정**
   - `mountQuiz`(63행) 진입부, `validateContent(content)` 호출(71행) 앞에 `resolveContentValues(content)` 호출 추가(비강제 — 방어적 1회용. 보통은 `mountPhone`이 먼저 실행해 두므로 캐시를 읽기만 함).
   - `validateContent()`(269-293행)에 분기 추가: `q.field`가 있으면 `q.id` 존재 및 `content.values[q.field]` 존재, 풀 크기 ≥2 검증, 없으면 기존 정적 검증(choices/answer) 유지.
   - `reset()`(228-240행)에는 **강제 재계산을 추가하지 않는다** — 재계산 소유자는 `phone.js` 하나다(리스크 참조). `quiz.js`는 현재 `content.__resolved`를 그대로 신뢰한다.
   - `open(source)`(156-161행), `shuffleChoices()`(255-266행)는 변경 없음.
   - `TUNING` 블록(29-47행)은 손대지 않는다(8/6 밸런싱과 충돌 방지).

5. **`src/phone.js` 수정**
   - `mountPhone`(54행) 진입부, `validateContent(content)` 호출(66행) 앞에 `resolveContentValues(content)` 호출 추가(비강제, 멱등 — 실질적으로 여기가 최초 실행 지점이 되도록 함).
   - `reset()`(149-157행)에 `resolveContentValues(content, { force: true })` 호출 추가 — **재계산의 유일한 소유자.** `content/day1.json` 원본은 여전히 불변이므로 강제 재계산은 안전하게 반복 가능하다.
   - `buildBubble(msg)`(217-229행) 수정: `content-values.js`의 `substitute()`를 import해 `msg.text`를 그대로 넣는 대신 `substitute(msg.text, dict)` 결과를 텍스트 노드로 넣도록 시그니처를 `buildBubble(msg, dict)`로 바꾼다. `buildBubble`은 모듈 스코프 함수라 `content`를 클로저로 갖지 않으므로, 호출부인 `pushMessage(msg)`(122-127행, `mountPhone` 안에 있어 `content`에 접근 가능)에서 `buildBubble(msg, content.__resolved)`로 인자를 넘기도록 **그 한 줄은 바뀐다**(Critic 3차 검토에서 "호출부 변경 없음"이 부정확하다고 지적됨).

6. **`dev/check-content.mjs` 갱신**
   - `quizzes[i]`가 `field`를 가지면: `choices`/`answer` 검사(51-52행) 대신 `id` 존재, `c.values`에 해당 `field` 타입이 있고 풀 크기 ≥2인지 검사.
   - `field`가 없으면(1개 고정 문항) 기존 검사 그대로.
   - `c.values`(같은 `content/day1.json` 안의 최상위 키)를 읽어 각 타입의 `pool` 항목이 `{ id, message, choice, alts: [정확히 2개] }` 형태를 갖췄는지 검사.
   - **`id` 중복 검사**: 모든 동적 quiz의 `id`, `id+'_alt1'`, `id+'_alt2'`를 합친 키 집합에 중복이 없는지 검사(하나라도 겹치면 딕셔너리에서 조용히 덮어써져 오답이 대화에 안 나타남).
   - **중복 보기 검사(기존 `check-content.mjs:56` 대체)**: 동적 quiz도 정적 quiz와 동일하게, 그 판에서 뽑힐 수 있는 `[값풀항목.choice, alts[0].choice, alts[1].choice]` 세 문구가 서로 달라야 한다 — 값 풀 항목 저작 시점에 검사(Step 1의 값 풀 전체를 순회하며 각 항목 안에서 3개 `choice`가 서로 다른지, 3개 `message`도 서로 다른지 확인).
   - **`sourceMessageIndex`↔`id` 결속 검사**: 동적 quiz마다 `messages[q.sourceMessageIndex].text`가 `'{' + q.id + '}'`를 반드시 포함하는지 검사한다. 이 결속이 깨지면 그 문항은 근거 문자를 실제로 띄우지 않고도 질문 자격이 열리거나(`quiz-eligibility.mjs`가 다른 메시지의 노출 시각을 근거로 오판), 정답이 어느 메시지에도 등장하지 않는 채로 퀴즈만 뜬다.
   - **고아/미정의 플레이스홀더 검사(양방향)**: (a) 모든 `messages[*].text`에서 `{\w+}` 패턴을 전부 수집하고, 그 판에서 실제로 채워질 키 집합(동적 quiz들의 `id`/`id_alt1`/`id_alt2` 전체 합집합, `{lane}`은 `mapTemplate` 전용이므로 별도 취급)에 없는 토큰이 있으면 FAIL(메시지 쪽 오타 검출). (b) 반대로 각 동적 quiz의 `id`가 **자신의 `sourceMessageIndex` 메시지**에 실제로 등장하는지는 위 결속 검사가 담당한다 — 두 검사를 합쳐야 "메시지에 있는 토큰은 다 정의돼 있고, 정답 근거 메시지에는 반드시 그 토큰이 있다"는 양방향 보장이 성립한다.
   - **전수 리터럴 잔존 스캔(마이그레이션 누락 검출, 휴리스틱)**: `sourceMessageIndex` 근처만으로는 놓치는 사례가 있다(예: 티켓 번호가 근거 문장에서 16칸 떨어진 알림 메시지에 리터럴로 재등장). 각 값 풀 항목의 `message`/`choice`/`alts[*].message`/`alts[*].choice` 문자열을, 그 값이 채워질 자리(자기 자신의 플레이스홀더로 치환된 위치)를 제외한 **모든** `messages[*].text`에서 `String.includes()`로 검색해 걸리면 경고(짧은 값은 오탐이 날 수 있으므로 FAIL이 아니라 `console.warn`으로 사람이 확인하게 한다).

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| 같은 필드를 언급하는 여러 메시지 중 일부가 마이그레이션에서 누락되면, 정답/함정 플레이스홀더가 실제 대화 맥락과 안 맞게 된다 | 마이그레이션 단계(Step 3)에서 각 quiz의 `sourceMessageIndex` 주변 메시지를 전수 검토, Acceptance Criteria의 "일관성" 항목으로 검증 |
| `mountPhone`/`mountQuiz` 호출 순서가 향후 `main.js` 구현 시 바뀌어도 랜덤화 타이밍이 깨지면 안 됨 | `content.__bmResolved` 플래그를 `content` 객체 자체에 둬 순서 무관(모듈 스코프 상태 금지 — 하네스가 `?v=` 캐시 무력화로 모듈을 이중 인스턴스화하기 때문, `dev/harness.html:140-143`) |
| 향후 `main.js`가 `phone.reset()`과 `quiz.reset()` 중 하나만 호출하면(둘 다 호출하는 현재 `dev/harness.html:258-259` 패턴이 안 지켜지면) 재계산이 아예 안 일어날 수 있음 | 재계산 소유자를 `phone.js` 하나로 고정해 "둘 다 강제 재계산 → 이중 실행" 문제 자체를 없앰. 다만 `phone.reset()`이 호출되지 않는 시나리오가 생기면 재추첨이 안 되므로, 이 가정(재시작 시 `phone.reset()`은 항상 호출된다)을 코드 주석과 `dev/harness.html` 패턴으로 명시해 둔다 |
| 값 풀 항목의 `alts`가 2개가 아니면(저작 실수) `choices.length !== 3`이 되어 UI가 깨짐 | `dev/check-content.mjs`가 `alts` 길이를 정확히 2로 검증(Step 6) |
| `q.id` 중복 시 딕셔너리가 조용히 덮어써져 한쪽 정답이 대화에 안 나타남 | `dev/check-content.mjs`의 id 중복 검사(Step 6) |
| 메시지 텍스트의 오타(`{rom}` 등)로 고아 플레이스홀더가 플레이어에게 그대로 노출됨 | `dev/check-content.mjs`의 고아 토큰 검사(Step 6) + `substitute()`의 "못 찾으면 원문 유지" 폴백(최후 방어선) |
| 마이그레이션 중 `id`를 붙였지만 정작 `sourceMessageIndex` 메시지에는 그 플레이스홀더를 안 넣는 실수 — 퀴즈는 뜨는데 정답 근거가 대화에 없음 | `dev/check-content.mjs`의 `sourceMessageIndex`↔`id` 결속 검사(Step 6) |
| 값 풀을 별도 파일(`content/values.json`)로 분리하면 `content`가 한 번의 `fetch`로만 만들어져 로드할 경로가 없음(Iteration 3의 치명 결함) | `values`를 `content/day1.json`의 최상위 키로 통합(Step 1) |
| `dev/check-content.mjs`를 갱신하지 않으면 마이그레이션 직후 정적 검사가 즉시 FAIL함 | Step 6으로 스코프에 명시 포함 |
| 8/7 빌드 동결 D-1 — 20개 전수 마이그레이션이 하루 안에 안 끝날 수 있음 | "사용자 확인 필요" 절에 명시, 필요 시 Option C(축소)로 전환 가능하게 설계를 필드 단위로 점진 적용 가능하게 둠(마이그레이션은 quiz 단위로 독립적). 오답 사전 저작 방식이 런타임 생성 로직 구현 시간을 줄여 리스크를 완화 |
| 8/6 밸런싱 작업이 같은 날 `quiz.js`의 `TUNING` 블록을 건드리면 병합 충돌 가능 | 새 로직을 `TUNING` 블록과 분리된 위치에 추가, `TUNING` 블록 자체는 손대지 않음 |

## Verification Steps

1. `npx http-server . -p 8080 -c-1`로 로컬 서버 실행 후 `dev/harness.html`을 시크릿 창에서 연다(AGENTS.md §6).
2. `node dev/check-content.mjs`로 마이그레이션된 `content/day1.json`이 정적 검사를 통과하는지 먼저 확인.
3. 판을 두 번 이상 새로고침해 회의실/티켓/시간 값이 바뀌는지 확인(Acceptance Criteria 1).
4. 정답/오답 클릭 각각에서 피드백 문구가 값과 무관하게 항상 정확한지 확인(Acceptance Criteria 2).
5. 같은 판 안에서 같은 필드를 두 번 언급하는 메시지 쌍(정답끼리, 함정끼리)이 일치하는지 확인(Acceptance Criteria 4).
6. 브라우저 콘솔에 `validateContent` 관련 에러/경고가 없는지 확인(Acceptance Criteria 3).
7. 함정형 필드(티켓/금액) 오답이 근접값/숫자 섞기 형태인지, 대화 속 함정 언급과 일치하는지 육안 확인(Acceptance Criteria 5).
8. `dev/harness.html`에서 `mountPhone`/`mountQuiz` 호출 순서를 바꿔(임시 테스트) 결과가 동일한지 확인(Acceptance Criteria 6).
9. `phone.reset()` 호출 후 값이 이전 판과 달라지는지, 반대로 `quiz.reset()`만 단독 호출했을 때는 값이 그대로인지 확인(Acceptance Criteria 7).
10. 게임을 몇 판 반복한 뒤 `content/day1.json` 원본 파일이 디스크상 그대로인지(런타임이 파일을 쓰지 않으니 당연하지만, in-memory `content` 객체의 `messages[*].text`도 `{token}` 형태 그대로인지 콘솔에서 확인) — Acceptance Criteria 8.
