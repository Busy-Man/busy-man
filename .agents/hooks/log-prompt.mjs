#!/usr/bin/env node
// 프롬프트 원문을 docs/ai-log/raw/ 에 쌓는 훅. 두 단계로 동작한다.
//
//   node log-prompt.mjs prompt <도구>   UserPromptSubmit — 원문을 적고 커밋 칸은 비워 둔다
//   node log-prompt.mjs resolve <도구>  Stop            — 그 사이에 생긴 커밋을 그 칸에 채운다
//
// 왜 도구가 인자로 들어오는가
//   Claude Code와 Codex가 같은 날짜 파일에 함께 쌓는다. 도구를 안 적으면 /ai-log가
//   엔트리의 `도구` 필드를 채울 근거를 잃는다 (docs/ai_log_guidelines.md §3).
//   훅을 도구별로 나누지 않은 것은 나뉘는 순간 한쪽만 고쳐지기 때문이다.
//
// ⚠ stdout에 아무것도 쓰지 않는다. Codex의 Stop 훅은 exit 0일 때 stdout이 비어 있거나
//   JSON이어야 하고 평문은 무효다. 로그는 파일로만 남긴다.
//
// 왜 두 단계인가
//   기록하고 싶은 것은 "이 프롬프트가 반영된 커밋"인데, 프롬프트를 받는 시점에는
//   그 커밋이 아직 없다. 그래서 원문을 먼저 적어 두고, 응답이 끝난 뒤에
//   그 사이 늘어난 커밋을 찾아 채운다.
//
// 왜 원문만 자동화하는가
//   제출물 4번이 요구하는 필드 중 "사람이 한 것"과 "반영 판정"은 사후 판단이라
//   훅이 알 수 없다. 반면 원문은 훅만 알 수 있고, 그 순간이 지나면 복원이 불가능하다.
//   그래서 훅은 작성이 아니라 원자재 포획만 한다. 정제는 /ai-log가 사람에게 물어서 한다.
//
// 실패해도 절대 세션을 막지 않는다. 무슨 일이 있어도 exit 0.

import {
  appendFileSync, readFileSync, writeFileSync, mkdirSync, readdirSync,
  openSync, readSync, closeSync, fstatSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const mode = process.argv[2] === 'resolve' ? 'resolve' : 'prompt';
const tool = (process.argv[3] || '').trim();

// 훅이 저장소 루트에서 돌아간다는 보장이 없다 — Codex 문서의 훅 예시부터 명령 안에서
// git rev-parse로 루트를 다시 찾고 있다. 그래서 페이로드가 주는 cwd에서 루트까지 올린다.
// CLAUDE_PROJECT_DIR는 Claude Code에만 있으므로 여기에만 기대지 않는다.
let root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function setRoot(payload) {
  root = payload.cwd || root;
  root = git('rev-parse', '--show-toplevel') || root;
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const pad = (n) => String(n).padStart(2, '0');

function today() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

const rawDir = () => join(root, 'docs', 'ai-log', 'raw');
const logFile = () => join(rawDir(), `${today().date}.md`);

// 파일 끝 일부만 읽는다. 트랜스크립트는 6MB까지 자라는데 훅에 주어진 시간은 5초다.
function tailOf(path, bytes = 256 * 1024) {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

// 모델까지 적는 것은 docs/ai_log_guidelines.md §3이 "모델·버전까지"를 요구하기 때문이다.
// Codex는 페이로드로 주지만 Claude Code는 주지 않는다 — SessionStart만 받을 수 있고
// 그마저 보장되지 않는다. 대신 트랜스크립트에 남아 있으므로 마지막 값을 집는다.
// 실패하면 도구명만 남긴다. 지나가면 복원할 수 없는 정보라 한 번은 시도할 값이 있다.
function modelOf(payload) {
  if (payload.model) return payload.model;
  if (!payload.transcript_path) return '';
  try {
    let last = '';
    for (const m of tailOf(payload.transcript_path).matchAll(/"model"\s*:\s*"([^"]+)"/g)) last = m[1];
    return last;
  } catch {
    return '';
  }
}

function label(payload) {
  const name = tool || '(도구 미상)';
  const model = modelOf(payload);
  return model ? `${name} (${model})` : name;
}

// 프롬프트 안에 코드 펜스가 있어도 깨지지 않도록 더 긴 펜스를 고른다.
function fenceFor(text) {
  const longest = (text.match(/^`{3,}/gm) || []).reduce((n, m) => Math.max(n, m.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function writePrompt(payload) {
  const prompt = (payload.prompt || '').trim();
  if (!prompt) return;

  const { time } = today();
  const fence = fenceFor(prompt);
  const before = git('rev-parse', '--short', 'HEAD') || 'none';

  mkdirSync(rawDir(), { recursive: true });
  appendFileSync(
    logFile(),
    `\n## ${time} · ${git('branch', '--show-current') || '(detached)'} · ${label(payload)}\n` +
      `반영 커밋: <!--pending:${before}--> _작업 중_\n\n` +
      `${fence}text\n${prompt}\n${fence}\n`,
    'utf8',
  );
}

// 가장 최근의 대기 항목 하나만 채운다. Stop이 걸러진 과거 항목까지 지금 HEAD로
// 채우면 남의 커밋을 그 프롬프트의 산출물로 잘못 붙이게 된다.
//
// 오늘 날짜 파일을 고정으로 열면 자정을 넘겨 끝난 턴이 영영 안 채워진다 —
// 프롬프트는 어제 파일에 적혔는데 Stop이 도는 시점에는 오늘 파일을 찾기 때문이다.
// 그래서 날짜가 아니라 "가장 최근 파일"을 연다.
function resolvePending() {
  const files = readdirSync(rawDir())
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
    .sort();
  if (files.length === 0) return;

  const file = join(rawDir(), files[files.length - 1]);
  const text = readFileSync(file, 'utf8');

  const marker = /^반영 커밋: <!--pending:([0-9a-f]+|none)--> .*$/gm;
  let last = null;
  for (const m of text.matchAll(marker)) last = m;
  if (!last) return;

  const before = last[1];
  const commits =
    before === 'none' ? [] : git('log', '--format=%h', `${before}..HEAD`).split('\n').filter(Boolean);

  const filled =
    commits.length === 0
      ? '반영 커밋: _없음_'
      : `반영 커밋: ${commits.reverse().map((h) => `\`${h}\``).join(', ')}`;

  writeFileSync(file, text.slice(0, last.index) + filled + text.slice(last.index + last[0].length), 'utf8');
}

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { stdin += c; });
process.stdin.on('end', () => {
  try {
    const payload = stdin.trim() ? JSON.parse(stdin) : {};
    setRoot(payload);
    if (mode === 'prompt') writePrompt(payload);
    else resolvePending();
  } catch {
    // 기록에 실패해도 작업은 계속되어야 한다.
  }
  process.exit(0);
});
