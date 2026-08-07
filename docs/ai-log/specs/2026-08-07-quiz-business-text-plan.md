---
workflow: ralplan
status: waiting
consensus_gate_complete: false
blocking_step: architect_review
execution_authorized: false
---

# Ralplan — 업무 문자형 퀴즈 입력 및 발신자 표시

## 상태

Waiting for Architect review — implementation is not authorized. This surface blocked the required typed Architect delegation and repository inspection; therefore Critic review cannot begin and the consensus gate remains incomplete.

## Source brief

- `.omx/specs/deep-interview-quiz-business-text.md`
- `.omx/context/quiz-business-text-20260807T000000Z.md`

## Outcome

Make the existing quiz accept `1`–`3` as immediate mouse-equivalent choices only while its modal is open, and make Day 1 quiz wording/readout feel like workplace messages with a sender for every question.

## Binding constraints

- Touch only B-owned `src/quiz.js` and `content/day1.json` during execution unless discovery proves a local owned-file dependency.
- Preserve question meaning, option correctness, difficulty, count, cadence, timer, and penalty behavior.
- No numeric-key behavior outside an open quiz modal.
- No new dependency or UI redesign.
- Do not add a new cross-owner state channel.

## RALPLAN-DR

### Principles

1. Route keyboard selection through the same answer path as pointer selection.
2. Treat a sender as content metadata, not a new runtime contract.
3. Preserve gameplay semantics while changing presentation copy.
4. Verify behavior at the modal boundary, where input mistakes are most likely.

### Decision drivers

1. Prevent double-answer or non-modal input side effects.
2. Keep the JSON schema minimally extensible and local to quiz content.
3. Keep the first pass reversible after visual review.

### Options

| Option | Advantages | Drawbacks | Decision |
|---|---|---|---|
| Add a per-question `sender` field and dispatch key input to the existing option handler | Data remains explicit; mouse/keyboard share logic | Requires schema/rendering update | Chosen, subject to source confirmation |
| Derive sender from question index in `quiz.js` | No JSON edits for names | Couples presentation to item order and obscures authorship | Rejected |
| Add dedicated keyboard-only answer evaluation | Fast to write | Risks divergence, duplicate submissions, and penalty differences | Rejected |

## Execution plan

1. **Ground the existing implementation.** Inspect `src/quiz.js` for modal lifecycle, option click handler, event listener registration/removal, and answer-lock behavior; inspect `content/day1.json` for its exact item and option schema. Confirm no existing key listener consumes `1`–`3`.
2. **Extend content locally.** Add exactly one sender field per Day 1 quiz item. Rewrite only question/option phrasing to sound like short workplace text exchanges; preserve each option's semantics and the existing correct-answer marker/value.
3. **Render sender.** In the existing quiz modal header/body, present the sender using the smallest existing text element/style hook; do not alter layout hierarchy beyond the extra label.
4. **Unify answer input.** Add a keyboard listener guarded by the same open/active state used by the modal. Map `1`/`2`/`3` to option indices and invoke the existing click-equivalent submit handler. Ignore all other numeric-key input and do nothing when the modal is closed or an answer is already being resolved. Prevent default only after the key is accepted in an open modal.
5. **Verify.** Exercise one correct and one wrong keyboard choice, one mouse choice, repeated key presses after submission, keys with the modal closed, and timeout. Confirm state/penalty/timer behavior is unchanged except for the new input route. Run available project static checks or a served-browser smoke test.

## Acceptance tests

1. Open a quiz, press each of `1`, `2`, `3` in independent runs: the corresponding visible option is submitted exactly once and produces the same result as a click.
2. Press numeric keys before opening, after closing, and after answer submission: no answer action or gameplay side effect occurs.
3. Every Day 1 item displays a fictional sender and uses work-message-style prompt/choice wording.
4. For every revised item, the pre-existing correct option and its intended meaning remain unchanged.
5. Timeout, scoring/gauge, speed penalty, and modal pause behavior remain unchanged.

## Risks and mitigations

- **Wrong JSON field assumption:** inspect exact schema before edit; do not introduce a parallel content shape.
- **Double submit:** reuse existing answer lock/handler and gate key listener on it.
- **Listener leak across rounds:** register/remove beside existing modal lifecycle or use the existing global listener with a strict modal-state guard.
- **Tone rewrite changes answer semantics:** compare each old/new option one-to-one before saving.

## Review-readiness audit (not an Architect verdict)

The draft is internally consistent only if source inspection confirms all of the following:

1. A single existing handler accepts an option index or option element and already owns answer locking. Keyboard input must call that handler, rather than synthesize a DOM click if the click path has view-only side effects.
2. The modal lifecycle exposes a reliable open/closed condition. A document-level listener without that guard would violate the numeric-key non-goal.
3. Day 1 questions have a stable per-item object where a presentation field can be added without changing the evaluator's expected data shape.
4. Sender text can be rendered in the existing modal without requiring an owner-A `index.html` or global-style change. If it cannot, execution must stop and request a cross-owner decision instead of editing another owner's file.

Until those facts are verified, the chosen option is provisional and the consensus gate must remain incomplete.

## Required Architect review packet

The next role-specific Architect review must receive this plan, the deep-interview specification, and the exact current contents of `src/quiz.js` and `content/day1.json`. It must decide:

- whether a per-question `sender` field is compatible with the actual content parser;
- whether keyboard dispatch can reach the exact pointer submission path without re-entrancy;
- whether sender rendering remains inside B-owned files;
- whether a document-level listener has a safe lifecycle or needs a modal-local listener.

An `APPROVE` verdict requires an explicit answer to all four. Any uncertainty requires `ITERATE`; Critic review must not start first.

## ADR

**Decision:** Store sender per question in Day 1 content and send accepted numeric keys through the existing option-submission flow.

**Drivers:** semantic preservation, minimal touch surface, input parity, and reversibility.

**Alternatives considered:** index-derived senders and a separate keyboard evaluator; both weaken maintainability or behavioral parity.

**Consequences:** Day 1 schema gains a presentation-only field; future content must provide it or renderer must have an explicit fallback decided separately.

**Follow-up:** After visual review, decide separately whether quiz content itself—not just wording—needs redesign.

## Verification and handoff

The recommended execution lane is `$ultragoal`, using this plan and the deep-interview specification. `$team` is unnecessary for this two-file, single-owner change. `$ralph` remains an explicit fallback if persistent single-owner verification is desired.

## Consensus gate

- Planner draft: complete (main planning lane)
- Architect review: pending
- Critic review: pending
- `ralplan_consensus_gate.complete`: false
- Terminal planning disposition: waiting for required Architect review on a surface that permits typed reviewer delegation
