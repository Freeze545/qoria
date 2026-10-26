/**
 * Qoria model router — cost-aware routing behind one brand.
 *
 * RULES (cheap-first):
 * 1. Default / casual chat → Groq only (cheapest). Never escalate for "salut",
 *    short Q&A, summaries, light write, or simple code snippets.
 * 2. Escalate to paid providers (OpenAI / Claude / Gemini / xAI) ONLY when
 *    complexity warrants it:
 *      - hard reason: proofs, multi-step strategy, deep analysis
 *      - hard code: large patches, architecture, multi-file, heavy debugging
 *      - vision: image attached (prefer vision-capable; Groq if it has vision else paid)
 *      - ensemble (Pro): deliberately multi-model
 * 3. Soft tasks (write email, translate, light code) stay on Groq.
 * 4. If the preferred expensive provider has no key, fall back to Groq — never fail
 *    solely because a premium key is missing.
 * 5. User never sees provider signup; responses stay branded Qoria.
 */
const { PROVIDERS, getKey, chatWithProvider, statusCache } = require('./providers');

const TASK_HINTS = {
  // Soft hints — still stay on Groq unless isComplex() flips
  code: [/```/, /\b(code|python|javascript|typescript|react|bug|fonction|function|compile|debug|html|css|sql|api)\b/i],
  reason: [/\b(pourquoi|analyse|raisonne|compare|stratégie|planifie|explique en détail|prove|déduis)\b/i],
  write: [/\b(rédige|écris|email|lettre|article|traduis|résume|rewrite|blog)\b/i],
  vision: [/\b(image|photo|screenshot|vois|décris cette|analyse (ce|cette) (image|photo|fichier))\b/i],
  image_gen: [/\b(génère|génère une image|crée une (image|photo)|dessine|illustration)\b/i],
  search: [/\b(cherche sur (le )?web|actualité|aujourd.?hui|prix actuel|search the web)\b/i],
};

/** Signals that warrant paying for a stronger model */
const COMPLEX_HINTS = [
  /\b(prouve|proof|irrationnel|théorème|theorem|dérivée|intégrale|complexity|big-?o|optimis[ea]|architecture|microservices?|refactor(ing)?\b.*\b(entire|tout|complet)|multi-?step|étape par étape|step by step|raisonne (fort|profond)|chain of thought|critique (rigoureuse|approfondie))\b/i,
  /\b(implement(e|er)?|écris|write)\b.{0,40}\b(from scratch|complet|enti[eè]re|full (app|stack)|production[- ]ready)\b/i,
  /\b(debug|corrige)\b.{0,60}\b(toute|entire|codebase|plusieurs fichiers|multi-?file)\b/i,
  /```[\s\S]{800,}/, // large code fence in the prompt
];

function isComplex(userText, task) {
  const t = userText || '';
  if (t.length > 2500) return true;
  if (COMPLEX_HINTS.some((r) => r.test(t))) return true;
  // Explicit ensemble always complex
  if (task === 'ensemble') return true;
  // Vision often needs a capable VLM — treat as escalate-eligible
  if (task === 'vision') return true;
  // Long code blocks without the soft "code" alone
  if (task === 'code' && (t.length > 900 || (t.match(/```/g) || []).length >= 4)) return true;
  if (task === 'reason' && t.length > 400) return true;
  return false;
}

function detectTask(userText, hasVisionAttachment, mode) {
  if (mode === 'image' || mode === 'photo') return 'image_gen';
  if (mode === 'ensemble') return 'ensemble';
  if (hasVisionAttachment) return 'vision';
  const t = userText || '';
  for (const [task, regs] of Object.entries(TASK_HINTS)) {
    if (regs.some((r) => r.test(t))) return task;
  }
  return 'default';
}

function isConnected(id) {
  const s = statusCache[id];
  if (s && s.connected) return true;
  return Boolean(getKey(id));
}

/**
 * Preference order per task.
 * Cheap lane (default/fast/write/soft-code): Groq first, paid only as last resort.
 * Escalate lane (hard reason/code, vision, ensemble): paid first, Groq fallback.
 */
const PREFERENCE = {
  default: ['groq', 'openai', 'gemini', 'xai', 'anthropic'],
  fast: ['groq', 'gemini', 'openai', 'xai', 'anthropic'],
  // Soft code stays cheap; hard code uses escalateCode
  code: ['groq', 'anthropic', 'openai', 'xai', 'gemini'],
  reason: ['groq', 'anthropic', 'openai', 'xai', 'gemini'],
  write: ['groq', 'anthropic', 'openai', 'xai', 'gemini'],
  vision: ['openai', 'gemini', 'anthropic', 'xai', 'groq'],
  ensemble: ['groq', 'openai', 'anthropic', 'xai', 'gemini'],
  // Escalated variants
  escalateReason: ['anthropic', 'openai', 'xai', 'gemini', 'groq'],
  escalateCode: ['anthropic', 'openai', 'xai', 'gemini', 'groq'],
  image_gen: [],
};

function resolveTaskKey(task, userText) {
  const complex = isComplex(userText, task);
  if (task === 'reason' && complex) return 'escalateReason';
  if (task === 'code' && complex) return 'escalateCode';
  if (task === 'vision') return 'vision';
  if (task === 'ensemble') return 'ensemble';
  // Soft write / light code / default → cheap
  if (task === 'write' || task === 'code' || task === 'reason' || task === 'search' || task === 'fast') {
    return complex ? (task === 'code' ? 'escalateCode' : 'escalateReason') : (task === 'fast' ? 'fast' : task === 'write' ? 'write' : 'default');
  }
  return 'default';
}

function pickRoute(task, userText) {
  const key = resolveTaskKey(task || 'default', userText || '');
  const order = PREFERENCE[key] || PREFERENCE.default;
  for (const id of order) {
    if (!isConnected(id)) continue;
    const s = statusCache[id];
    if (s && s.connected === false && s.status && s.status.includes('clé')) continue;
    if (s && s.connected === false) continue;
    const p = PROVIDERS[id];
    const modelKey =
      key === 'escalateCode' || task === 'code' ? 'code' :
      key === 'escalateReason' || task === 'reason' || task === 'ensemble' ? 'reason' :
      task === 'write' ? 'write' :
      task === 'vision' || key === 'vision' ? 'vision' :
      key === 'fast' ? 'fast' : 'default';
    let model = p.models[modelKey] || p.models.default;
    if (!model && modelKey === 'vision') continue;
    if (!model) model = p.models.default;
    return {
      provider: id,
      model,
      task,
      routeKey: key,
      escalated: key.startsWith('escalate') || key === 'vision' || key === 'ensemble',
      name: p.name,
    };
  }
  for (const id of PREFERENCE.default) {
    if (getKey(id)) {
      const p = PROVIDERS[id];
      return { provider: id, model: p.models.default, task, routeKey: 'fallback', name: p.name, fallback: true };
    }
  }
  return null;
}

function pickEnsemblePair(task) {
  const order = PREFERENCE.ensemble;
  const picked = [];
  for (const id of order) {
    if (statusCache[id]?.connected || getKey(id)) {
      const p = PROVIDERS[id];
      picked.push({ provider: id, model: p.models.reason || p.models.default, name: p.name });
    }
    if (picked.length >= 2) break;
  }
  return picked;
}

async function routeChat({ messages, task, temperature, max_tokens, ensemble, userText }) {
  const text = userText || extractLastUserText(messages);

  if (ensemble) {
    const pair = pickEnsemblePair(task || 'ensemble');
    if (pair.length < 2) {
      const route = pickRoute(task || 'default', text);
      if (!route) throw Object.assign(new Error('Aucun fournisseur IA configuré'), { status: 503 });
      const result = await chatWithProvider(route.provider, { model: route.model, messages, temperature, max_tokens });
      return { ...result, route, ensemble: false };
    }
    const results = await Promise.all(
      pair.map(async (r) => {
        try {
          const out = await chatWithProvider(r.provider, {
            model: r.model,
            messages,
            temperature,
            max_tokens: Math.min(max_tokens || 800, 600),
          });
          return { ok: true, ...out, route: r };
        } catch (e) {
          return { ok: false, error: e.message, route: r };
        }
      })
    );
    const okOnes = results.filter((r) => r.ok && r.content);
    if (!okOnes.length) {
      throw Object.assign(new Error(results.map((r) => r.error).join(' | ') || 'Ensemble échoué'), { status: 502 });
    }
    const merged = mergeEnsemble(okOnes);
    return {
      content: merged,
      model: okOnes.map((o) => o.model).join(' + '),
      provider: 'ensemble',
      ensemble: true,
      routes: okOnes.map((o) => o.route),
      parts: okOnes.map((o) => ({ provider: o.route.provider, model: o.model, content: o.content })),
    };
  }

  const route = pickRoute(task || 'default', text);
  if (!route) throw Object.assign(new Error('Aucun fournisseur IA configuré. Ajoute GROQ_API_KEY ou une autre clé.'), { status: 503 });
  const result = await chatWithProvider(route.provider, {
    model: route.model,
    messages,
    temperature,
    max_tokens,
  });
  return { ...result, route, ensemble: false };
}

function extractLastUserText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      return m.content.filter((p) => p?.type === 'text').map((p) => p.text || '').join('\n');
    }
  }
  return '';
}

function mergeEnsemble(okOnes) {
  if (okOnes.length === 1) return okOnes[0].content;
  const blocks = okOnes.map((o, i) => {
    return `### Perspective ${i + 1} — ${o.route.name} (${o.model})\n\n${o.content}`;
  });
  return (
    `**Mode ensemble Qoria** — deux modèles ont répondu. Voici leurs perspectives, puis une synthèse courte.\n\n` +
    blocks.join('\n\n---\n\n') +
    `\n\n---\n\n### Synthèse Qoria\n\n` +
    `Les deux réponses ci-dessus couvrent le sujet. Retiens les points communs et les nuances utiles; ` +
    `si elles divergent, vérifie les faits avant d'agir.`
  );
}

module.exports = {
  detectTask,
  pickRoute,
  pickEnsemblePair,
  routeChat,
  isComplex,
  resolveTaskKey,
  TASK_HINTS,
  PREFERENCE,
};
