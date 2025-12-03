function normalizeDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeLeadState(raw = {}) {
  const answers = raw?.answers instanceof Map
    ? Object.fromEntries(raw.answers)
    : { ...(raw?.answers || {}) };

  return {
    status: raw?.status || "idle",
    userMessageCount: Number(raw?.userMessageCount || 0),
    softPromptCount: Number(raw?.softPromptCount || 0),
    lastSoftPromptAt: normalizeDate(raw?.lastSoftPromptAt),
    currentStepIndex: Number(raw?.currentStepIndex || 0),
    answers,
    trigger: raw?.trigger || null,     
  };
}

export function detectSoftReply(userText = "") {
  const t = String(userText || "").toLowerCase();
  const text = t.trim();
  if (!text) return "ignore";


 const matchesAny = (value, patterns) =>
    patterns.some((p) => {
      if (p instanceof RegExp) return p.test(value);

      const phrase = p.toLowerCase();
      if (value === phrase) return true;
      if (value.startsWith(phrase + " ")) return true;
      if (value.endsWith(" " + phrase)) return true;
      if (value.includes(" " + phrase + " ")) return true;
      return false;
    });

  const yesPatterns = [
    // EN — короткие подтверждения
    "yes",
    "yep",
    "yup",
    "yeah",
    "ya",
    "sure",
    "of course",
    "absolutely",
    "definitely",
    "exactly",
    "affirmative",
    "yessir",
    "for sure",

    // EN — с оттенком согласия / разрешения
    "ok",
    "okay",
    "okey",
    "k",
    "alright",
    "all right",
    "sounds good",
    "sounds great",
    "that works",
    "works for me",
    "fine",
    "that's fine",
    "go ahead",
    "please do",
    "why not",
    "let's go",
    "lets go",
    "let's do it",
    "let's start",
    "let us start",
    "you can",
    "you may",

    // RU — явные «да»
    "да",
    "ага",
    "угу",
    "давай",
    "поехали",
    "конечно",
    "разумеется",
    "само собой",
    "естественно",

    // RU — разрешения / согласие
    "хорошо",
    "ладно",
    "ок",
    "окей",
    "да, можно",
    "можно",
    "да, давай",
    "да, конечно",
    "да, хорошо",
    "да, ок",
    "да, окей",
    "всё верно",
    "все верно",
    "подходит",
    "подойдет",
    "мне подходит",
    "мне подойдет",

    // Эмодзи «да»
    /👍/,
    /👌/,
    /✅/,
    /🤝/,
  ];
  const noPatterns = [
    // EN — явные отказы
    "no",
    "nope",
    "nah",
    "not really",
    "i don't think so",
    "i do not think so",
    "no thanks",
    "no thank you",
    "i'm good",
    "im good",
    "i'm fine",
    "im fine",
    "i'll pass",
    "ill pass",
    "pass",

    // EN — отложить / отказ сейчас
    "not now",
    "maybe later",
    "later",
    "another time",
    "some other time",
    "not today",
    "not interested",
    "i'm not interested",
    "im not interested",

    // EN — остановка / отмена
    "stop",
    "don't",
    "do not",
    "cancel",
    "nevermind",
    "never mind",

    // RU — явные «нет»
    "нет",
    "неа",
    "не, спасибо",
    "нет, спасибо",
    "не хочу",
    "не надо",
    "не нужно",
    "не интересует",
    "не интересно",
    "меня не интересует",

    // RU — позже / не сейчас
    "не сейчас",
    "потом",
    "позже",
    "в другой раз",
    "пока нет",
    "может быть позже",
    "да, но позже",
    "давай потом",

    // RU — остановить
    "стоп",
    "остановись",
    "хватит",
    "отмена",

    // Эмодзи «нет»
    /👎/,
    /❌/,
    /🚫/,
  ];

  // if (yesPatterns.some((p) => t.includes(p))) return "accept";
  // if (noPatterns.some((p) => t.includes(p))) return "decline";
  if (matchesAny(text, yesPatterns)) return "accept";
  if (matchesAny(text, noPatterns)) return "decline";
  return "ignore";
}

function canShowSoftPrompt(state, cfg) {
  if (!cfg?.triggers?.afterN?.enabled) return false;
  const t = cfg.triggers.afterN;
  const now = new Date();

  const enoughMessages = state.userMessageCount >= (t.minUserMessages || 6);
  const underCap = (state.softPromptCount || 0) < (t.maxPromptsPerSession || 1);
  const cooldownMinutes = t.cooldownMinutes || 60;
  const sinceLast = state.lastSoftPromptAt ? (now - new Date(state.lastSoftPromptAt)) / 60000 : Infinity;
  const cooldownPassed = sinceLast >= cooldownMinutes;

  return enoughMessages && underCap && cooldownPassed;
}

export function leadStateMachine({ leadState, leadCfg, event }) {
    const next = {
    ...leadState,
    answers: { ...(leadState.answers || {}) },
    trigger: leadState.trigger || null,      
  };
  const actions = [];

  if (!leadCfg || !leadCfg.enabled) {
    return { nextState: next, actions: [{ type: "none" }] };
  }

  switch (event.type) {
    case "user_message": {
      next.userMessageCount = (next.userMessageCount || 0) + 1;

if (next.status === "soft_prompted") {
  const res = detectSoftReply(event.userText);

  if (res === "accept") {
    next.status = "capturing";
    next.currentStepIndex = next.currentStepIndex || 0;

    // Определяем итоговый триггер
    let trigger;
    if (next.trigger === "llm_soft_prompt") {
      trigger = "llm_soft_accept";
    } else if (next.trigger === "afterN_soft_prompt") {
      trigger = "afterN_accept";
    } else {
      trigger = "soft_prompt_accept";   
    }

    next.trigger = trigger;             
    actions.push({ type: "start_capture", reason: trigger });
    actions.push({ type: "ask_next_question" });
  } else if (res === "decline") {
    next.status = "suppressed";
    next.trigger = "declined";        
    actions.push({ type: "suppress" });
  }

  return { nextState: next, actions };
}

      if (next.status === "capturing") {
        const steps = leadCfg.steps || [];
        const step = steps[next.currentStepIndex] || null;
        if (step) {
          next.answers[step.id] = event.userText;
          actions.push({ type: "store_answer", stepId: step.id, answer: event.userText });

          next.currentStepIndex += 1;
          if (next.currentStepIndex < steps.length) {
            actions.push({ type: "ask_next_question" });
          } else {
            next.status = "completed";
            actions.push({ type: "finish_capture" });
          }
        }
        return { nextState: next, actions };
      }

      if (next.status === "idle" && canShowSoftPrompt(next, leadCfg)) {
        next.status = "soft_prompted";
        next.softPromptCount = (next.softPromptCount || 0) + 1;
        next.lastSoftPromptAt = new Date();
        next.trigger = "afterN_soft_prompt";
        actions.push({ type: "show_soft_prompt" });
      }

      return { nextState: next, actions };
    }

case "llm_signal": {
  // если уже не idle (например, уже soft_prompted / capturing / suppressed) —
  // ничего не делаем
  if (next.status !== "idle") {
    return { nextState: next, actions };
  }

  const llmCfg = leadCfg.triggers?.llm || {};

  if (
    llmCfg.enabled &&
    event.leadIntent === "strong" &&
    (event.confidence || 0) >= (llmCfg.strongThreshold || 0.75)
  ) {
    // ВМЕСТО немедленного capturing → показываем мягкий промпт
    next.status = "soft_prompted";
    next.softPromptCount = (next.softPromptCount || 0) + 1;
    next.lastSoftPromptAt = new Date();
    next.trigger = "llm_soft_prompt"; 
    actions.push({ type: "show_soft_prompt" });
    // НЕ пушим start_capture / ask_next_question здесь
  }

  return { nextState: next, actions };
}

    default:
      return { nextState: next, actions };
  }
}

export function normalizeAnswers(answers = {}) {
  if (answers instanceof Map) return Object.fromEntries(answers);
  if (typeof answers === "object" && !Array.isArray(answers)) return { ...answers };
  return {};
}

export function shouldSuppressLead(leadState) {
  return ["suppressed", "completed"].includes(leadState?.status);
}

export function hasLeadActions(actions = []) {
  return actions.some((a) => a?.type && a.type !== "none");
}