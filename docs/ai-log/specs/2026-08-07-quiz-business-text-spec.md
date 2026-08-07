# Deep Interview Spec — Quiz business text

## Metadata

- Profile: standard
- Context: brownfield (source inspection was blocked by the active workflow hook)
- Rounds: 4
- Final ambiguity: 8% (threshold: 20%)
- Date: 2026-08-07

## Intent

Make quiz interactions feel like work-message replies rather than exam questions, while adding keyboard choice input.

## Desired outcome

- A quiz can be answered with `1`, `2`, or `3` only while its modal is open.
- That keystroke follows the same immediate-submit path as clicking the corresponding choice.
- The quiz question and answers use natural workplace-text phrasing.
- Every question displays a fictional workplace sender.

## In scope

- `src/quiz.js`: bind numeric keys only for an open quiz modal and route them through the existing click-equivalent answer submission.
- `content/day1.json`: retain the existing question meaning, correct answer, and difficulty; revise only the wording and assign a sender to each item.
- Use a small fictional contact set such as `최 과장님`, `김 대리`, and `이 팀장님`, assigning senders where natural.

## Out of scope / non-goals

- Do not add numeric-key behavior outside an open quiz modal.
- Do not change quiz meaning, answer correctness, difficulty, count, cadence, or penalty rules.
- Do not redesign the UI or add dependencies.
- Do not rewrite quiz content beyond wording in this pass; assess the rendered result first before deciding on deeper content changes.

## Decision boundaries

The implementation may select a small set of fictional workplace contacts and a compact sender display treatment. It must preserve the content semantics and use the existing choice-submission route.

## Acceptance criteria

1. With a quiz modal open, pressing `1`, `2`, or `3` immediately submits the matching option exactly as a mouse click would.
2. Outside an open quiz modal, those keys do nothing.
3. Repeated numeric input after submission does not cause another answer action.
4. Each Day 1 question has a sender and workplace-message wording for both prompt and choices.
5. Existing answers and intended difficulty remain unchanged.

## Pressure pass

The initial request for numeric keys was stress-tested against the game input boundary: keyboard input is intentionally active only during the open modal and ignored otherwise. The initial request to make content feel less like an exam was narrowed to wording and sender metadata, not semantic or balancing edits.

## Evidence and validation gap

Active deep-interview hook blocked repository read commands on this surface, so current implementation details must be checked during planning/execution before selecting exact functions and JSON fields.

## Transcript

1. User: workplace scenarios may be mixed; the essential requirement is a workplace-text feel.
2. User: first change wording and sender only; decide later whether to change quiz content.
3. User: numeric keys should immediately submit like clicks when modal is open and be ignored otherwise.
4. User: approve a small fictional sender set assigned per question.
