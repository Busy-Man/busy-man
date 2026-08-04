# Deep Interview Spec: 리뷰 지침 · 브랜치 전략 · PR/커밋 규칙

## Metadata
- Interview ID: `di-2026-0803-review-conventions`
- Rounds: 3 (+ Round 0 topology gate)
- Final Ambiguity Score: **17.1%**
- Type: brownfield
- Generated: 2026-08-03
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: no
- Status: **PASSED**

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.86 | 0.35 | 0.301 |
| Constraint Clarity | 0.88 | 0.25 | 0.220 |
| Success Criteria | 0.68 | 0.25 | 0.170 |
| Context Clarity | 0.92 | 0.15 | 0.138 |
| **Total Clarity** | | | **0.829** |
| **Ambiguity** | | | **0.171** |

## Topology

| # | Component | Status | Description | 완료 판정 |
|---|-----------|--------|-------------|-----------|
| 1 | Copilot 리뷰 지침서 | active | `.github/copilot-instructions.md` — 한국어 리뷰 + 이 저장소 리뷰 기준 | 파일 존재 + 첫 PR에서 실제 한국어 리뷰 확인 |
| 2 | 브랜치 전략 | active | **develop 미도입 확정.** 현행 `feature → PR → main` 유지 | `AGENTS.md §5`에 근거와 함께 명시됨 |
| 3 | Pages 배포 방식 | active | **Branch 방식 (`main` / root)** + `.nojekyll` | `.nojekyll` 존재 + `AGENTS.md §6`에 설정 절차 기재 |
| 4 | PR/commit 규칙 skill | active | `.claude/skills/`에 커밋 분할 → 메시지 → PR 본문 전 과정 | skill 호출 가능 + 규칙을 복사하지 않고 `AGENTS.md §5` 참조 |
| 5 | GitHub PR 템플릿 | active | `.github/pull_request_template.md` — 개요 / 변경 사항 / 체크리스트 | 파일 존재 + skill이 만드는 본문과 섹션이 일치 |

## Goal

2인 팀이 8/3 오후부터 각자 AI로 코드를 뽑기 시작할 때, **리뷰와 커밋·PR이 사람마다 다른 모양으로 쌓이지 않도록** 공통 규약의 실행 수단을 만든다. 규칙 자체는 이미 `AGENTS.md §5`에 있으므로 새로 쓰지 않는다. 이번에 만드는 것은 **그 규칙을 자동으로 지키게 하는 도구**다.

동시에, 열려 있던 브랜치·배포 결정 두 건을 닫아 8/3 오전 합의 안건에서 제거한다.

## Constraints

- **`AGENTS.md §5`가 규칙의 정본.** 지침서·skill·템플릿 어느 것도 규칙 전문을 복사하지 않는다.
  `ai-log` skill에서 같은 이유로 중복을 걷어낸 선례를 따른다
- **Pages 게시 소스는 저장소당 1개.** 확인된 사실 (GitHub Docs). `main`/root로 확정
- **Branch 방식은 저장소 루트 전체를 서빙한다.** `docs/`, `prototype/`, `docs/ai-log/raw/`가 웹에서 열린다. 이 노출은 **수용하기로 결정**
- 실질 개발 8/3~8/6 (3.5일), 8/7 동결, **버퍼 0**
- 심사 요건: 커밋 기록 유지 → **squash·force-push 금지**
- 파일 소유권이 A(world/main/index) B(phone/quiz/content)로 갈려 있음 (`AGENTS.md §1`)
- 기존 브랜치 3개(`chore/repo-foundation`, `docs/agent-conventions`, `chore/ai-logging`)는 **아직 push되지 않았고 8/3 오전 팀 합의 대기 중**
- 산출물 언어: 한국어

## Non-Goals

- **develop 브랜치 도입** — 아래 근거로 기각
- **GitHub Actions 배포 워크플로** — 실패 지점을 늘리지 않는다
- **8/7 동결 태그 생성** — 그날 만든다. 이번 범위 아님
- `AGENTS.md §5` 규칙 자체의 변경 — 결정 사항 반영과 문구 보강만
- GitHub Settings에서의 Pages 활성화 — 사용자가 직접 수행
- 브랜치 보호 규칙(branch protection) 설정 — 2인 팀에 과투자
- CI 워크플로(테스트·린트) — 테스트 러너 자체가 없음

## Acceptance Criteria

**공통**
- [ ] 어떤 산출물도 `AGENTS.md §5`의 규칙 문구를 복사하지 않고 참조만 한다
- [ ] 모든 문서가 한국어

**1. Copilot 리뷰 지침서**
- [ ] `.github/copilot-instructions.md` 생성
- [ ] **한국어로 리뷰하라는 지시**가 첫머리에 명시
- [ ] 이 저장소 고유의 리뷰 기준 포함 — 파일 소유 경계 침범, 접점 4개 밖의 상태 공유, 절대경로 모듈 참조, 렌더러 미결 상태에서의 렌더 코드
- [ ] 리뷰가 지적하지 **않아야** 할 것 명시 — 빈 스켈레톤 파일, 번들러 부재, 포매터 부재 (전부 의도된 결정)
- [ ] ⚠️ **첫 PR에서 실제로 한국어 리뷰가 오는지 확인.** 영어로 오면 지시 문구를 강화하거나 대안을 기록

**2. 브랜치 전략**
- [ ] `AGENTS.md §5`에 develop을 쓰지 않는다는 것과 **그 근거**가 적힘 (근거 없이 적으면 나중에 누군가 다시 제안한다)
- [ ] 8/7 동결 태그는 그때 만든다는 것이 명시

**3. Pages 배포 방식**
- [ ] 저장소 루트에 `.nojekyll` 생성
- [ ] `AGENTS.md §6`에 Settings 설정값(`Deploy from a branch` / `main` / `/ (root)`)이 적힘
- [ ] 루트 전체가 서빙된다는 사실과 그것을 수용했다는 결정이 기록됨

**4. PR/commit 규칙 skill**
- [ ] `.claude/skills/<name>/SKILL.md` 생성, frontmatter에 `name`·`description`
- [ ] 절차에 포함: git 상태 읽기 → **소유 경계 침범 점검** → 응집도로 커밋 분할 제안 → `type(scope)` 메시지 작성 → PR 본문 생성
- [ ] `scope` 유효값을 `AGENTS.md §5`에서 참조 (목록을 복사하지 않는다)
- [ ] 메시지 본문 기준: "왜"만, 2~3줄 — 이번 세션에서 확립된 기준
- [ ] PR 본문 섹션이 5번 템플릿과 동일

**5. GitHub PR 템플릿**
- [ ] `.github/pull_request_template.md` 생성
- [ ] 섹션: 개요 / 변경 사항 / 체크리스트
- [ ] 체크리스트에 이 저장소 고유 항목 — 남의 담당 파일 미수정, 접점 4개 유지, 상대경로 모듈, squash 안 함

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| develop을 두면 안전하다 | Pages 소스가 1개라 develop을 별도 URL로 띄울 수 없다. develop의 핵심 이점이 원천 봉쇄됨 | **미도입.** 게다가 8/7 전까지 main이 깨져도 손해가 없고, 파일 소유권 분리로 충돌 자체가 적다 |
| 배포 방식은 아무거나 상관없다 | Branch 방식은 저장소 루트 **전체**를 웹에 노출한다 (`docs/ai-log/raw/` 포함) | 노출을 **수용**하고 Branch 방식 선택. Actions는 실패 지점을 늘려 3.5일 일정에 맞지 않음 |
| skill은 규칙을 담은 문서다 | `ai-log` skill에서 규칙 중복이 문제가 되어 걷어낸 선례가 있다 | **규칙은 `AGENTS.md §5` 참조, skill은 절차만.** 존재 이유는 "대신 해주는 것"에서 나온다 |
| Copilot이 한국어로 리뷰한다 | GitHub Docs가 리뷰 **언어 지정**은 다루지 않는다 | 지시는 쓰되 **보장으로 취급하지 않는다.** 첫 PR에서 실증하고 결과를 기록 |
| PR 템플릿과 skill은 중복이다 | 독자가 다르다 — 템플릿은 GitHub UI에서 사람이, skill은 에이전트가 쓴다 | **둘 다 만들되 섹션 구조를 일치**시켜 산출물이 같아지게 한다 |

## Technical Context (brownfield)

**확인된 외부 사실**

- GitHub Pages: 저장소당 **활성 게시 소스 1개**. branch 방식 또는 Actions 방식 중 하나. 여러 브랜치를 동시에 별도 URL로 서빙 불가
- `.github/copilot-instructions.md`: Copilot 코드 리뷰가 읽으며 **기본 활성**. 저장소 설정에서 토글 가능
- `.github/instructions/NAME.instructions.md`: 경로별 지침. 코드 리뷰와 클라우드 에이전트가 지원, GitHub.com의 Copilot Chat은 미지원
- 지침 우선순위: 개인 > 저장소 > 조직
- 리뷰 **언어 지정**은 문서화되어 있지 않음

**저장소 현황**

- `.github/` 디렉터리 **없음** — 이번에 처음 생성
- 기존 skill은 `.claude/skills/ai-log/` 하나
- `AGENTS.md §5`에 이미 있는 것: `type(scope)` 형식, scope 목록(`world` `main` `phone` `quiz` `state` `content` `build` `docs` `ai-log`), main 직접 push 금지, squash·force-push 금지, 브랜치 이름 규칙
- `AGENTS.md §6`에 이미 있는 것: `npx http-server` 권장, Windows `python -m http.server` MIME 함정, 상대경로 필수, 시크릿 창 확인
- 브랜치 3개 모두 **미푸시**. `main`은 `origin/main`과 동일(`da80c9c`)

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| 저장소 | core domain | root=`busy-man/`, remote=`Busy-Man/busy-man` | 브랜치와 Pages 사이트를 담음 |
| 브랜치 | core domain | `main`, `feature/*` (develop 없음) | PR로 main에 병합됨 |
| Pages 사이트 | external system | 소스=`main`/root, URL=`busy-man.github.io/busy-man/` | 브랜치 하나에만 종속 |
| Copilot 리뷰 | external system | 지침=`.github/copilot-instructions.md`, 기본 활성 | PR을 읽고 코멘트를 남김 |
| PR | core domain | base=`main`, 본문=개요/변경사항/체크리스트 | 템플릿과 skill이 본문을 만듦 |
| 커밋 규약 | core domain | `type(scope)`, 본문은 "왜"만 | `AGENTS.md §5`에 거주. skill이 참조 |
| skill | supporting | `.claude/skills/*/SKILL.md` | 규약을 실행 절차로 옮김 |
| 팀원 A / B | external actor | A=맵·주행·배포·제출, B=대화·질문·문서·영상 | 파일 소유 경계를 가짐 |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 8 | 8 | - | - | N/A |
| 2 | 8 | 0 | 0 | 8 | 100% |
| 3 | 8 | 0 | 0 | 8 | 100% |

R1부터 안정. 앞선 저장소 초기화 인터뷰에서 이미 도메인이 정리된 상태로 시작했기 때문이다.

## 미확정 가정 (실행 전 확인 필요)

**어느 브랜치에 놓을 것인가** — 기존 3개 브랜치가 미푸시 상태이고 파일 집합이 겹치지 않게 관리되고 있다. 이번 산출물은 네 곳에 흩어진다.

| 산출물 | 자연스러운 소속 |
|---|---|
| `.github/copilot-instructions.md`, `.github/pull_request_template.md` | 새 브랜치 (기존 어디에도 속하지 않음) |
| `.claude/skills/<name>/SKILL.md` | `chore/ai-logging` (`.claude/` 소유) |
| `AGENTS.md` §5·§6 갱신 | `docs/agent-conventions` |
| `.nojekyll` | `chore/repo-foundation` (루트 빌드 파일 소유) |

기본 가정: **기존 3개 브랜치에 각각 흡수 + `.github/`용 새 브랜치 1개**, 총 4개 PR. 실행 승인 시점에 확인한다.

**`.gitignore` 부재 주의** — 기존 브랜치들은 `.gitignore`가 `chore/repo-foundation`에만 있다. 다른 브랜치에서 `git add -A`를 쓰면 `.omc/`가 딸려 들어간다 (이미 한 번 발생). 파일을 명시해 스테이징한다.

## Interview Transcript

<details>
<summary>Full Q&A (Round 0 + 3 rounds)</summary>

### Round 0 — 토폴로지 확정
**Q:** 3개 최상위 컴포넌트로 읽었습니다 (Copilot 지침 / 브랜치 전략 / PR·commit skill). 맞습니까?
**A:** 2, 3번 채택 → **PR 템플릿 추가**, **브랜치 전략을 "develop 여부"와 "Pages 배포 방식"으로 분리**. 최종 5개.

### Round 1 — develop 도입 여부 (Goal Clarity)
**Q:** develop 브랜치를 도입할까요? (Pages 소스가 1개라 develop을 별도 URL로 띄울 수 없음을 근거로 제시)
**A:** develop 미도입. **태그는 추후 생성.**
**Ambiguity:** 30.0% (Goal 0.70, Constraints 0.72, Criteria 0.55, Context 0.92)

### Round 2 — Pages 배포 방식 (Constraint Clarity)
**Q:** Branch 방식은 저장소 루트 전체를 웹에 노출합니다. 어느 쪽으로 할까요?
**A:** Branch 방식 (`main`/root), `.nojekyll` 포함. 노출 수용.
**Ambiguity:** 22.4% (Goal 0.78, Constraints 0.88, Criteria 0.58, Context 0.92)

### Round 3 — skill의 동작 (Goal Clarity)
**Q:** `AGENTS.md §5`에 규칙이 이미 있는데, skill이 무엇을 **대신 해주면** 됩니까?
**A:** 커밋 분할 → 메시지 → PR 본문 전 과정. 규칙 자체는 `AGENTS.md §5` 참조만.
**Ambiguity:** 17.1% (Goal 0.86, Constraints 0.88, Criteria 0.68, Context 0.92) ✅

</details>
