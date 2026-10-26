/**
 * Qoria model router — picks best available provider/model per task.
 * User never sees provider sign-up; single Qoria brand.
 */
const { PROVIDERS, getKey, chatWithProvider, statusCache } = require('./providers');

const TASK_HINTS = {
  code: [/```/, /\b(code|python|javascript|typescript|react|bug|fonction|function|compile|debug|html|css|sql|api)\b/i],
  reason: [/\b(pourquoi|analyse|raisonne|compare|stratégie|planifie|explique en détail|prove|déduis)\b/i],
  write: [/\b(rédige|écris|email|lettre|article|traduis|résume|rewrite|blog)\b/i],
  vision: [/\b(image|photo|screenshot|vois|décris cette|analyse (ce|cette) (image|photo|fichier))\b/i],
  image_gen: [/\b(génère|génère une image|crée une (image|photo)|dessine|illustration)\b/i],
  search: [/\b(cherche sur (le )?web|actualité|aujourd.?hui|prix actuel|search the web)\b/i],
};

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
  // Allow first-use if key present (before smoke); prefer post-smoke
  return Boolean(getKey(id));
}

/**
 * Preference order per task. First connected wins.
 */
const PREFERENCE = {
  default: ['groq', 'openai', 'gemini', 'xai', 'anthropic'],
  fast: ['groq', 'gemini', 'openai', 'xai', 'anthropic'],
  code: ['anthropic', 'openai', 'groq', 'xai', 'gemini'],
  reason: ['anthropic', 'openai', 'xai', 'groq', 'gemini'],
  write: ['anthropic', 'openai', 'xai', 'gemini', 'groq'],
  vision: ['openai', 'gemini', 'anthropic', 'xai', 'groq'],
  ensemble: ['groq', 'openai', 'anthropic', 'xai', 'gemini'],
  image_gen: [], // handled separately
};

function pickRoute(task) {
  const order = PREFERENCE[task] || PREFERENCE.default;
  for (const id of order) {
    if (!isConnected(id)) continue;
    // Prefer smoke-confirmed when available
    const s = statusCache[id];
    if (s && s.connected === false && s.status && s.status.includes('clé')) continue;
    if (s && s.connected === false) continue;
    const p = PROVIDERS[id];
    const modelKey =
      task === 'code' ? 'code' :
      task === 'reason' || task === 'ensemble' ? 'reason' :
      task === 'write' ? 'write' :
      task === 'vision' ? 'vision' :
      task === 'fast' ? 'fast' : 'default';
    let model = p.models[modelKey] || p.models.default;
    if (!model && modelKey === 'vision') {
      // fall through to next provider that has vision
      continue;
    }
    if (!model) model = p.models.default;
    return { provider: id, model, task, name: p.name };
  }
  // Fallback: any connected
  for (const id of PREFERENCE.default) {
    if (getKey(id)) {
      const p = PROVIDERS[id];
      return { provider: id, model: p.models.default, task, name: p.name, fallback: true };
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

async function routeChat({ messages, task, temperature, max_tokens, ensemble }) {
  if (ensemble) {
    const pair = pickEnsemblePair(task || 'ensemble');
    if (pair.length < 2) {
      // degrade to single
      const route = pickRoute(task || 'default');
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
            max_tokens: Math.min(max_tokens || 2048, 1200),
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
    // Merge via first available model as synthesizer, or simple compare format
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

  const route = pickRoute(task || 'default');
  if (!route) throw Object.assign(new Error('Aucun fournisseur IA configuré. Ajoute GROQ_API_KEY ou une autre clé.'), { status: 503 });
  const result = await chatWithProvider(route.provider, {
    model: route.model,
    messages,
    temperature,
    max_tokens,
  });
  return { ...result, route, ensemble: false };
}

function mergeEnsemble(okOnes) {
  if (okOnes.length === 1) return okOnes[0].content;
  const blocks = okOnes.map((o, i) => {
    return `### Perspective ${i + 1} — ${o.route.name} (${o.model})\n\n${o.content}`;
  });
  // Simple synthesis note
  const synth =
    `**Mode ensemble Qoria** — deux modèles ont répondu. Voici leurs perspectives, puis une synthèse courte.\n\n` +
    blocks.join('\n\n---\n\n') +
    `\n\n---\n\n### Synthèse Qoria\n\n` +
    `Les deux réponses ci-dessus couvrent le sujet. Retiens les points communs et les nuances utiles; ` +
    `si elles divergent, vérifie les faits avant d'agir.`;
  return synth;
}

module.exports = {
  detectTask,
  pickRoute,
  pickEnsemblePair,
  routeChat,
  TASK_HINTS,
};
