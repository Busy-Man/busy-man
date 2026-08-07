# Conversation-to-quiz minimum separation

## Metadata

| Field | Value |
|---|---|
| Workflow | deep-interview (standard) |
| Context | brownfield |
| Rounds | 6 |
| Final ambiguity | 8% (threshold: 20%) |
| Context snapshot | `.omx/context/conversation-quiz-separation-20260806T061004Z.md` |
| Transcript | `.omx/interviews/conversation-quiz-separation-20260806T062835Z.md` |

## Intent

Keep the game's intended attention challenge while preventing unfair-feeling cases where a question appears before, or almost simultaneously with, the dialogue needed to answer it.

## Desired outcome

Every quiz opens only after its declared source message has been visible for at least three seconds of active game time.

## In scope

- Add `sourceMessageIndex` to every quiz in `content/day1.json`; it references the zero-based `messages` array index that supplies the answer.
- Record when each source message is actually displayed by the phone stream.
- Gate the current sequential quiz scheduler on source-message eligibility.
- Keep the existing 6–8 second active-time cadence. If its timer elapses before the next quiz is eligible, defer that quiz until it is eligible and then open it; start the following cadence after the modal closes.
- Use active game time: dialogue/quiz scheduling remains paused while the quiz modal is open.

## Non-goals

- No queue-based message/quiz event redesign.
- No requirement for a quiet three-second period after every message.
- No change to quiz ordering, answer-choice shuffle behavior, modal UI, 10-second countdown, or penalties.
- No `state.js` contract addition or changes to A-owned files.

## Decision boundaries

- Implementation may choose the private callback/API between `phone.js` and `quiz.js`, because both are B-owned, provided no shared cross-owner state is introduced.
- Implementation may choose a safe validation/error behavior for malformed or out-of-range `sourceMessageIndex` values; it must not silently allow a quiz to precede its declared source.
- Exact test harness choice is open; verification must demonstrate the eligibility boundary.

## Acceptance criteria

1. A quiz with source message index `i` cannot open before message `i` has been rendered.
2. It cannot open until at least 3.0 seconds of active game time have elapsed since that rendering.
3. An unrelated message rendered during those three seconds does not reset or extend the delay.
4. If the base quiz cadence elapses early, the next sequential quiz is deferred, not skipped, rerolled, or replaced.
5. Once eligible, that deferred quiz opens without waiting for an additional random 6–8 second interval.
6. Once the quiz closes, the following quiz receives a newly sampled 6–8 second cadence as before.
7. Existing modal pause behavior stays intact, so hidden-tab and quiz-modal elapsed time cannot consume eligibility time.

## Evidence and assumptions

- [from-code][auto-confirmed] `phone.js` emits messages every 2.6 seconds, while `quiz.js` schedules independent 6–8 second quiz gaps.
- [from-code][auto-confirmed] `content/day1.json` currently lacks a quiz-to-message mapping.
- [from-user] Three seconds is sufficient only relative to the specific source dialogue; unrelated messages may continue to flow.
- [from-user] Queue-based sequencing is deliberately out of scope for this pass.

## Pressure finding

The confirmed edge case is source A at t=0, unrelated message B at t=2.6, and quiz A′ at t=3.0. This is valid. The implementation must record source-message render time rather than use a global latest-message timestamp.

## Relevant repository surfaces

- `src/phone.js` — B-owned message stream and actual render point.
- `src/quiz.js` — B-owned sequential quiz scheduler and modal lifecycle.
- `content/day1.json` — B-owned content mapping.
- `AGENTS.md` §1–§3 — ownership and shared-state restrictions.
- `docs/기획_1차_보완.md` — fixed modal behavior and 6–8 second cadence.
- `docs/balance-todo.md` — stream speed is tunable, so correctness must not depend on the current 2.6-second value.
