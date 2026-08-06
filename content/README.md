# content/

대화 로그·질문·정답·함정 단서를 담는 정적 JSON이며 B가 관리한다. 런타임은 한 판마다
`day1.json`의 미니 대화 묶음을 뽑아 순서를 섞고, 선택된 묶음의 값과 보기를 새로 만든다.

## 스키마

```
chrome       { clock, channel }          폰 상태바
laneNames    ["왼쪽", "가운데", "오른쪽"]   길 안내용
mapTemplate  "… {lane}"
feedback     { correct, wrong, timeout, penaltySlow, penaltyGauge }
bundles      [{ id, messages, quiz }]
messages     [{ id, from, kind, text }]  kind = person | notice | map
quiz         { id, sourceMessageId, sender, prompt, field? }
values       { [field]: { pool: [{ message, choice, alts[2] }] } }
```

각 `bundle`은 자연스러운 순서를 가진 작은 대화 하나와 질문 하나를 갖는다. 메시지·번들·질문
ID는 전역에서 유일하며, `sourceMessageId`는 반드시 같은 묶음 안의 답 근거 메시지를 가리킨다.

동적 질문은 `field`를 가지며, 근거 메시지에는 해당 질문 ID 토큰(예: `{q06}`)이 포함된다.
세션 생성기는 `values[quiz.field].pool`에서 정답 후보 하나를 고르고, 그 항목의 `message`로
토큰을 치환한다. `choice`가 정답 보기이고 `alts`의 두 항목이 사전 작성한 오답 보기다. 각 풀은
최소 세 후보를 제공해 시간·회의실·장소·금액 같은 사실이 매 판 달라진다.

`field`가 없는 질문은 고정 서사형이다. 이 경우에만 `choices[3]`와 `answer`를 직접 둔다.
현재 `q35`가 유일한 고정 서사형 질문이다.

## 분량과 선택 규칙

전체 풀은 40묶음·116메시지·40문항이다. 36개 묶음은 3메시지, 4개 묶음은 2메시지다.
한 판에는 두 길이 그룹에서 각각 절반을 무복원으로 뽑아 20묶음·58메시지·20문항 후보를
만든다. 묶음 내부 순서는 유지하지만, 묶음의 표시 순서는 매 판 섞는다.

## 보기 순서

`quiz.js`가 모달을 열 때마다 보기를 섞는다. JSON의 동적 풀은 정답과 오답을 의미로만
정의하며, 정답의 화면상 위치에 의존하지 않는다. 질문은 반드시 답 근거 메시지가 실제로
표시되고 3초가 지난 뒤에만 출제된다.

생성에 쓴 프롬프트는 훅이 `docs/ai-log/raw/`에 자동으로 남긴다. 웹 대화 등 훅이 못 잡는
도구를 썼다면 원문을 직접 그 파일에 붙여넣는다.
