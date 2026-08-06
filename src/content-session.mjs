const SESSION_BUNDLE_COUNTS = new Map([
  [3, 18],
  [2, 2]
]);

export function prepareContentSession(content, { force = false, rng = Math.random } = {}) {
  if (content.__bmSession && !force) return content.__bmSession;

  const selected = [];
  for (const [messageCount, take] of SESSION_BUNDLE_COUNTS) {
    const candidates = content.bundles.filter((bundle) => bundle.messages.length === messageCount);
    if (candidates.length < take) {
      throw new Error(`[content] ${messageCount}문장 묶음이 ${take}개보다 적습니다`);
    }
    selected.push(...shuffle(candidates, rng).slice(0, take));
  }

  const bundles = shuffle(selected, rng);
  const resolvedBundles = [];
  const messages = [];
  const quizzes = [];

  for (const bundle of bundles) {
    const resolved = resolveBundle(bundle, content.values, rng);
    resolvedBundles.push(resolved);
    messages.push(...resolved.messages);
    quizzes.push(resolved.quiz);
  }

  const session = Object.freeze({
    sessionId: (content.__bmSession && content.__bmSession.sessionId || 0) + 1,
    bundleIds: Object.freeze(bundles.map((bundle) => bundle.id)),
    bundles: Object.freeze(resolvedBundles),
    messages: Object.freeze(messages),
    quizzes: Object.freeze(quizzes)
  });

  Object.defineProperty(content, '__bmSession', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: session
  });
  return session;
}

export function substituteContentValue(text, values) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{([a-z0-9_]+)\}/gi, (token, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : token
  ));
}

function resolveBundle(bundle, values, rng) {
  const quiz = bundle.quiz;
  let resolvedQuiz;
  let replacements = {};

  if (quiz.field) {
    const definition = values && values[quiz.field];
    const pool = Array.isArray(definition) ? definition : definition && definition.pool;
    if (!Array.isArray(pool) || pool.length === 0) {
      throw new Error(`[content] values.${quiz.field}.pool 이 비어 있습니다`);
    }
    const picked = pool[Math.floor(rng() * pool.length)];
    replacements = {
      [quiz.id]: picked.message,
      [quiz.id + '_alt1']: picked.alts[0].message,
      [quiz.id + '_alt2']: picked.alts[1].message
    };
    resolvedQuiz = Object.freeze({
      id: quiz.id,
      field: quiz.field,
      sourceMessageId: quiz.sourceMessageId,
      sender: substituteContentValue(quiz.sender, replacements),
      prompt: substituteContentValue(quiz.prompt, replacements),
      choices: Object.freeze([picked.choice, picked.alts[0].choice, picked.alts[1].choice]),
      answer: 0
    });
  } else {
    resolvedQuiz = Object.freeze({
      id: quiz.id,
      sourceMessageId: quiz.sourceMessageId,
      sender: quiz.sender,
      prompt: quiz.prompt,
      choices: Object.freeze([...quiz.choices]),
      answer: quiz.answer
    });
  }

  const messages = bundle.messages.map((message) => Object.freeze({
    id: message.id,
    bundleId: bundle.id,
    from: message.from,
    kind: message.kind,
    text: substituteContentValue(message.text, replacements)
  }));

  return Object.freeze({ id: bundle.id, messages: Object.freeze(messages), quiz: resolvedQuiz });
}

function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
