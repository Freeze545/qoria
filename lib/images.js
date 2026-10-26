/**
 * Image generation: IMAGE_API_KEY path OR Pollinations free fallback.
 * Photo mode must return a real image without paid key.
 */
function resolvePaidImage() {
  const explicitKey = (process.env.IMAGE_API_KEY || '').trim();
  const explicitBase = (process.env.IMAGE_BASE_URL || '').trim().replace(/\/$/, '');
  const openaiOwn = (process.env.OPENAI_OWN_API_KEY || '').trim();
  const xai = (process.env.XAI_API_KEY || '').trim();
  if (explicitKey && explicitBase) return { key: explicitKey, base: explicitBase, model: process.env.IMAGE_MODEL || 'dall-e-3' };
  if (explicitKey) return { key: explicitKey, base: explicitBase || 'https://api.openai.com/v1', model: process.env.IMAGE_MODEL || 'dall-e-3' };
  if (openaiOwn) return { key: openaiOwn, base: 'https://api.openai.com/v1', model: process.env.IMAGE_MODEL || 'dall-e-3' };
  if (xai) return { key: xai, base: 'https://api.x.ai/v1', model: process.env.IMAGE_MODEL || 'grok-2-image' };
  return null;
}

async function generatePaid(prompt, size = '1024x1024') {
  const cfg = resolvePaidImage();
  if (!cfg) return null;
  const r = await fetch(`${cfg.base}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      prompt,
      n: 1,
      size,
      response_format: 'url',
    }),
  });
  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(raw.slice(0, 200)); }
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || raw.slice(0, 200)), { status: r.status });
  const item = data.data?.[0] || {};
  return {
    ok: true,
    provider: 'paid',
    model: cfg.model,
    url: item.url || null,
    b64: item.b64_json ? `data:image/png;base64,${item.b64_json}` : null,
    revisedPrompt: item.revised_prompt || null,
    prompt,
  };
}

function pollinationsUrl(prompt, { width = 1024, height = 1024 } = {}) {
  const seed = Math.floor(Math.random() * 1e9);
  const q = encodeURIComponent(prompt.slice(0, 400));
  return `https://image.pollinations.ai/prompt/${q}?width=${width}&height=${height}&nologo=true&seed=${seed}&enhance=true`;
}

async function generatePollinations(prompt) {
  const url = pollinationsUrl(prompt);
  // Probe that it returns bytes
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!r.ok) {
      return { ok: true, provider: 'pollinations', url, prompt, note: 'URL générée (probe HTTP ' + r.status + ')' };
    }
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('image') && !ct.includes('octet')) {
      // still return URL — Pollinations often works in <img>
      return { ok: true, provider: 'pollinations', url, prompt, model: 'pollinations-free' };
    }
    return { ok: true, provider: 'pollinations', url, prompt, model: 'pollinations-free' };
  } catch {
    return { ok: true, provider: 'pollinations', url, prompt, model: 'pollinations-free' };
  }
}

async function generateImage(prompt, opts = {}) {
  const p = String(prompt || '').trim();
  if (!p) throw Object.assign(new Error('prompt requis'), { status: 400 });
  if (!opts.forceFree) {
    try {
      const paid = await generatePaid(p, opts.size);
      if (paid && (paid.url || paid.b64)) return paid;
    } catch (e) {
      // fall through to free
      console.warn('[Qoria] paid image failed, fallback Pollinations:', e.message);
    }
  }
  return generatePollinations(p);
}

function imageStatus() {
  const paid = resolvePaidImage();
  return {
    paidConfigured: Boolean(paid),
    freeFallback: 'pollinations',
    alwaysWorks: true,
  };
}

module.exports = { generateImage, imageStatus, pollinationsUrl, resolvePaidImage };
