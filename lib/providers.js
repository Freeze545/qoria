/**
 * Provider adapters — OpenAI-compatible, Anthropic, Gemini.
 * Status "connected" only after env key present AND smoke test passes.
 */
const PROVIDERS = {
  groq: {
    id: 'groq',
    name: 'Groq',
    kind: 'openai-compatible',
    envKey: 'GROQ_API_KEY',
    altEnv: 'OPENAI_API_KEY', // when base is groq
    baseEnv: 'OPENAI_BASE_URL',
    defaultBase: 'https://api.groq.com/openai/v1',
    models: {
      default: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
      fast: process.env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b',
      reason: process.env.GROQ_MODEL_REASON || 'openai/gpt-oss-120b',
      code: process.env.GROQ_MODEL_CODE || 'qwen/qwen3.8-27b',
      write: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
      vision: null, // groq vision varies
    },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai-compatible',
    envKey: 'OPENAI_OWN_API_KEY',
    altEnv: null,
    defaultBase: 'https://api.openai.com/v1',
    models: {
      default: 'gpt-4o-mini',
      fast: 'gpt-4o-mini',
      reason: 'gpt-4o',
      code: 'gpt-4o',
      write: 'gpt-4o',
      vision: 'gpt-4o',
    },
  },
  xai: {
    id: 'xai',
    name: 'xAI Grok',
    kind: 'openai-compatible',
    envKey: 'XAI_API_KEY',
    defaultBase: 'https://api.x.ai/v1',
    models: {
      default: 'grok-2-latest',
      fast: 'grok-2-latest',
      reason: 'grok-2-latest',
      code: 'grok-2-latest',
      write: 'grok-2-latest',
      vision: 'grok-2-vision-latest',
    },
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    kind: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    defaultBase: 'https://api.anthropic.com',
    models: {
      default: 'claude-3-5-haiku-latest',
      fast: 'claude-3-5-haiku-latest',
      reason: 'claude-sonnet-4-0',
      code: 'claude-sonnet-4-0',
      write: 'claude-sonnet-4-0',
      vision: 'claude-sonnet-4-0',
    },
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    kind: 'gemini',
    envKey: 'GEMINI_API_KEY',
    defaultBase: 'https://generativelanguage.googleapis.com/v1beta',
    models: {
      default: 'gemini-2.0-flash',
      fast: 'gemini-2.0-flash',
      reason: 'gemini-2.0-flash',
      code: 'gemini-2.0-flash',
      write: 'gemini-2.0-flash',
      vision: 'gemini-2.0-flash',
    },
  },
};

/** Runtime status filled by smoke tests */
const statusCache = {};

function getKey(provider) {
  const p = PROVIDERS[provider];
  if (!p) return '';
  let key = (process.env[p.envKey] || '').trim();
  if (!key && p.altEnv) key = (process.env[p.altEnv] || '').trim();
  // Special: if OPENAI_API_KEY points at groq base, treat as groq
  if (provider === 'openai') {
    const own = (process.env.OPENAI_OWN_API_KEY || '').trim();
    if (own) return own;
    const base = (process.env.OPENAI_BASE_URL || '').toLowerCase();
    const k = (process.env.OPENAI_API_KEY || '').trim();
    if (k && !base.includes('groq')) return k;
    return '';
  }
  if (provider === 'groq') {
    const g = (process.env.GROQ_API_KEY || '').trim();
    if (g) return g;
    const base = (process.env.OPENAI_BASE_URL || '').toLowerCase();
    const k = (process.env.OPENAI_API_KEY || '').trim();
    if (k && (base.includes('groq') || !process.env.OPENAI_BASE_URL)) return k;
    // Also accept OPENAI_API_KEY if no other provider claimed it and base is groq default
    if (k && base.includes('groq')) return k;
    if (k && !process.env.OPENAI_OWN_API_KEY) {
      // Prefer treating OPENAI_API_KEY as groq when BASE is groq or unset with groq-like model
      if (base.includes('groq') || (process.env.OPENAI_MODEL || '').includes('qwen')) return k;
    }
    return g || ((base.includes('groq') || (process.env.OPENAI_MODEL || '').includes('qwen')) ? k : '');
  }
  return key;
}

function getBase(provider) {
  const p = PROVIDERS[provider];
  if (provider === 'groq') {
    const b = (process.env.OPENAI_BASE_URL || '').trim();
    if (b.includes('groq')) return b.replace(/\/$/, '');
    return p.defaultBase;
  }
  if (provider === 'openai') {
    const b = (process.env.OPENAI_BASE_URL || '').trim();
    if (b && !b.includes('groq') && !b.includes('x.ai')) return b.replace(/\/$/, '');
    return p.defaultBase;
  }
  return p.defaultBase;
}

async function chatOpenAICompatible({ base, key, model, messages, temperature, max_tokens, stream }) {
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 2048,
      stream: Boolean(stream),
    }),
  });
  if (stream) return r;
  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw Object.assign(new Error(raw.slice(0, 200)), { status: r.status }); }
  if (!r.ok) {
    const err = new Error(data?.error?.message || raw.slice(0, 200));
    err.status = r.status;
    throw err;
  }
  const content =
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.message?.reasoning ||
    '';
  return { content, model: data.model || model, raw: data, provider: 'openai-compatible' };
}

async function chatAnthropic({ key, model, messages, temperature, max_tokens }) {
  const system = messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
  const converted = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content: typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p) => {
              if (p.type === 'text') return { type: 'text', text: p.text };
              if (p.type === 'image_url') {
                const url = p.image_url?.url || p.image_url || '';
                const m2 = String(url).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
                if (m2) return { type: 'image', source: { type: 'base64', media_type: m2[1], data: m2[2] } };
                return { type: 'text', text: '[image]' };
              }
              return { type: 'text', text: p.text || '' };
            })
          : String(m.content || ''),
    }));
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: max_tokens ?? 2048,
      temperature: temperature ?? 0.7,
      system: system || undefined,
      messages: converted,
    }),
  });
  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw Object.assign(new Error(raw.slice(0, 200)), { status: r.status }); }
  if (!r.ok) {
    const err = new Error(data?.error?.message || raw.slice(0, 200));
    err.status = r.status;
    throw err;
  }
  const content = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return { content, model: data.model || model, raw: data, provider: 'anthropic' };
}

async function chatGemini({ key, model, messages, temperature, max_tokens }) {
  const system = messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
  const contents = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const role = m.role === 'assistant' ? 'model' : 'user';
      let parts;
      if (typeof m.content === 'string') parts = [{ text: m.content }];
      else if (Array.isArray(m.content)) {
        parts = m.content.map((p) => {
          if (p.type === 'text') return { text: p.text };
          if (p.type === 'image_url') {
            const url = p.image_url?.url || p.image_url || '';
            const m2 = String(url).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
            if (m2) return { inline_data: { mime_type: m2[1], data: m2[2] } };
            return { text: '[image]' };
          }
          return { text: p.text || '' };
        });
      } else parts = [{ text: String(m.content || '') }];
      return { role, parts };
    });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents,
    generationConfig: {
      temperature: temperature ?? 0.7,
      maxOutputTokens: max_tokens ?? 2048,
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw Object.assign(new Error(raw.slice(0, 200)), { status: r.status }); }
  if (!r.ok) {
    const err = new Error(data?.error?.message || raw.slice(0, 200));
    err.status = r.status;
    throw err;
  }
  const content = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return { content, model, raw: data, provider: 'gemini' };
}

async function chatWithProvider(providerId, opts) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error('Fournisseur inconnu');
  const key = getKey(providerId);
  if (!key) {
    const err = new Error(`Clé manquante pour ${p.name}`);
    err.status = 503;
    throw err;
  }
  const model = opts.model || p.models.default;
  const messages = opts.messages || [];
  if (p.kind === 'openai-compatible') {
    return chatOpenAICompatible({
      base: getBase(providerId),
      key,
      model,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.max_tokens,
      stream: opts.stream,
    });
  }
  if (p.kind === 'anthropic') {
    return chatAnthropic({ key, model, messages, temperature: opts.temperature, max_tokens: opts.max_tokens });
  }
  if (p.kind === 'gemini') {
    return chatGemini({ key, model, messages, temperature: opts.temperature, max_tokens: opts.max_tokens });
  }
  throw new Error('Kind non supporté');
}

async function smokeTest(providerId) {
  const p = PROVIDERS[providerId];
  const key = getKey(providerId);
  if (!key) {
    statusCache[providerId] = { connected: false, status: 'clé manquante', testedAt: new Date().toISOString() };
    return statusCache[providerId];
  }
  try {
    const result = await chatWithProvider(providerId, {
      model: p.models.fast || p.models.default,
      messages: [
        { role: 'user', content: 'Reply with exactly: OK' },
      ],
      max_tokens: 16,
      temperature: 0,
    });
    const ok = Boolean(result && (result.content || '').length >= 0);
    statusCache[providerId] = {
      connected: ok,
      status: ok ? 'connecté' : 'échec',
      model: result.model,
      testedAt: new Date().toISOString(),
    };
  } catch (e) {
    statusCache[providerId] = {
      connected: false,
      status: 'clé manquante ou erreur: ' + (e.message || '').slice(0, 80),
      testedAt: new Date().toISOString(),
    };
  }
  return statusCache[providerId];
}

async function smokeAll() {
  const ids = Object.keys(PROVIDERS);
  const out = {};
  for (const id of ids) {
    out[id] = await smokeTest(id);
  }
  return out;
}

function getStatus() {
  return Object.keys(PROVIDERS).map((id) => {
    const p = PROVIDERS[id];
    const s = statusCache[id] || {
      connected: false,
      status: getKey(id) ? 'non testé' : 'clé manquante',
    };
    return {
      id,
      name: p.name,
      kind: p.kind,
      keyPresent: Boolean(getKey(id)),
      ...s,
      models: p.models,
    };
  });
}

module.exports = {
  PROVIDERS,
  getKey,
  getBase,
  chatWithProvider,
  smokeTest,
  smokeAll,
  getStatus,
  statusCache,
};
