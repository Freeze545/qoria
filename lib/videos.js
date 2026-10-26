/**
 * Video generation providers.
 *
 * Reality check (Oct 2026): there is NO free public text-to-video API that
 * returns excellent clips without a paid key. Pollinations video, fal, Runway,
 * Luma, and OpenAI Sora all require credentials / credits.
 *
 * When keys are present we run a real end-to-end generation.
 * When not: honest FR paywall (Free 1/day vs Pro unlimited once live).
 */

const fs = require('fs');
const path = require('path');
const { enrichPrompt } = require('./images');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function videoEnv() {
  const provider = String(process.env.VIDEO_PROVIDER || '').trim().toLowerCase();
  const falKey = (process.env.FAL_KEY || process.env.FAL_API_KEY || '').trim();
  const pollKey = (process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '').trim();
  const runwayKey = (process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY || '').trim();
  const lumaKey = (process.env.LUMA_API_KEY || process.env.LUMAAI_API_KEY || '').trim();
  const openaiKey = (process.env.OPENAI_OWN_API_KEY || process.env.OPENAI_API_KEY_REAL || '').trim();
  const genericKey = (process.env.VIDEO_API_KEY || '').trim();
  const genericUrl = (process.env.VIDEO_API_URL || '').trim();
  const model = (process.env.VIDEO_MODEL || '').trim();

  // Auto-detect provider from available keys if VIDEO_PROVIDER unset
  let resolved = provider;
  if (!resolved) {
    if (genericKey && genericUrl) resolved = 'generic';
    else if (falKey || (genericKey && /fal/i.test(genericUrl || ''))) resolved = 'fal';
    else if (pollKey || (genericKey && /pollinations/i.test(genericUrl || ''))) resolved = 'pollinations';
    else if (runwayKey) resolved = 'runway';
    else if (lumaKey) resolved = 'luma';
    else if (openaiKey && /sora/i.test(model || 'sora')) resolved = 'openai';
    else if (genericKey && genericUrl) resolved = 'generic';
  }

  const keyByProvider = {
    fal: falKey || genericKey,
    pollinations: pollKey || genericKey,
    runway: runwayKey || genericKey,
    luma: lumaKey || genericKey,
    openai: openaiKey || genericKey,
    generic: genericKey,
  };

  const key = keyByProvider[resolved] || '';
  const configured = Boolean(resolved && key && (resolved !== 'generic' || genericUrl));

  return {
    provider: resolved || null,
    key,
    url: genericUrl,
    model:
      model ||
      ({
        fal: 'fal-ai/wan/v2.2-a14b/text-to-video/turbo',
        pollinations: 'alibaba/wan-2.2-fast',
        runway: 'gen4.5',
        luma: 'ray-2',
        openai: 'sora-2',
        generic: '',
      }[resolved] || ''),
    configured,
    duration: Math.min(Math.max(Number(process.env.VIDEO_DURATION || 5), 2), 10),
    costHint: costHintFor(resolved),
  };
}

function costHintFor(provider) {
  switch (provider) {
    case 'fal':
      return '~0,05–0,10 $/clip (Wan turbo 480p–720p)';
    case 'pollinations':
      return '~0,05 $/clip (Wan 2.2 fast 5s ≈ 0,05 Pollen)';
    case 'runway':
      return '~0,25–0,50 $/clip 5s (selon modèle)';
    case 'luma':
      return '~0,20–1,00 $/clip selon durée/qualité';
    case 'openai':
      return 'Sora — tarif OpenAI (crédits compte)';
    case 'generic':
      return 'Selon ton VIDEO_API_URL';
    default:
      return null;
  }
}

function videoStatus() {
  const cfg = videoEnv();
  return {
    configured: cfg.configured,
    provider: cfg.provider,
    model: cfg.model || null,
    costHint: cfg.costHint,
    freePath: false,
    qualityNote: cfg.configured
      ? `Vidéo via ${cfg.provider} (${cfg.model || 'modèle par défaut'}) — ${cfg.costHint || 'coût selon fournisseur'}`
      : 'Aucune clé vidéo. Excellent clip = clé payante (fal / Pollinations Pollen / Runway / Luma / Sora). Free = 1/jour, Pro = illimité une fois branché.',
  };
}

function enrichVideoPrompt(raw) {
  const { prompt, style, original } = enrichPrompt(raw);
  // Motion / cinematic boosters for video models
  const motion =
    'smooth camera motion, natural movement, cinematic, high detail, coherent physics, no flicker';
  const already = /cinematic|camera motion|smooth/i.test(prompt);
  return {
    prompt: already ? prompt.slice(0, 900) : `${prompt}, ${motion}`.slice(0, 900),
    style,
    original,
  };
}

async function saveVideoBuffer(buf, ext = 'mp4') {
  ensureUploadDir();
  const name = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const full = path.join(UPLOAD_DIR, name);
  await fs.promises.writeFile(full, buf);
  return `/uploads/${name}`;
}

async function fetchToBuffer(url, headers = {}, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw Object.assign(new Error(`Téléchargement vidéo HTTP ${r.status}: ${t.slice(0, 160)}`), {
        status: r.status,
      });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 5000) {
      throw Object.assign(new Error('Fichier vidéo trop petit / invalide'), { status: 502 });
    }
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pollinations gen video — needs POLLINATIONS_API_KEY (Pollen). */
async function generatePollinationsVideo(prompt, cfg) {
  const q = encodeURIComponent(prompt.slice(0, 700));
  const params = new URLSearchParams({
    model: cfg.model || 'alibaba/wan-2.2-fast',
    duration: String(cfg.duration || 5),
  });
  const url = `https://gen.pollinations.ai/video/${q}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.VIDEO_FETCH_MS || 300000));
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        Accept: 'video/*,application/json,*/*',
        'User-Agent': 'Qoria/1.0 (+https://qoria.onrender.com)',
      },
      signal: controller.signal,
    });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      const msg =
        r.status === 402
          ? 'Crédits Pollinations (Pollen) insuffisants pour la vidéo.'
          : `Pollinations vidéo HTTP ${r.status}: ${errBody.slice(0, 160)}`;
      throw Object.assign(new Error(msg), { status: r.status === 402 ? 402 : 502 });
    }
    if (ct.includes('application/json')) {
      const data = await r.json();
      const videoUrl = data.url || data.video?.url || data.data?.[0]?.url;
      if (!videoUrl) throw Object.assign(new Error('Réponse vidéo JSON sans URL'), { status: 502 });
      const buf = await fetchToBuffer(videoUrl, { Authorization: `Bearer ${cfg.key}` });
      const local = await saveVideoBuffer(buf);
      return { ok: true, provider: 'pollinations', model: cfg.model, url: local, remoteUrl: videoUrl };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 5000) {
      throw Object.assign(new Error('Vidéo Pollinations trop petite'), { status: 502 });
    }
    const local = await saveVideoBuffer(buf);
    return { ok: true, provider: 'pollinations', model: cfg.model, url: local };
  } finally {
    clearTimeout(timer);
  }
}

/** fal.ai Wan turbo — needs FAL_KEY. Sync via fal.run. */
async function generateFalVideo(prompt, cfg) {
  const endpoint = cfg.model || 'fal-ai/wan/v2.2-a14b/text-to-video/turbo';
  const pathId = endpoint.replace(/^https?:\/\/[^/]+\//, '');
  const url = pathId.startsWith('http') ? pathId : `https://fal.run/${pathId}`;
  const body = {
    prompt,
    resolution: process.env.VIDEO_RESOLUTION || '480p',
    aspect_ratio: process.env.VIDEO_ASPECT || '16:9',
    enable_prompt_expansion: true,
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Key ${cfg.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error(raw.slice(0, 200)), { status: r.status || 502 });
  }
  if (!r.ok) {
    throw Object.assign(new Error(data?.detail || data?.error || raw.slice(0, 200)), {
      status: r.status,
    });
  }
  const videoUrl = data.video?.url || data.video_url || data.data?.video?.url;
  if (!videoUrl) {
    // Queue-style response — poll
    const reqId = data.request_id || data.requestId;
    if (!reqId) throw Object.assign(new Error('fal: pas d’URL vidéo ni request_id'), { status: 502 });
    const polled = await pollFal(pathId, reqId, cfg.key);
    const local = await saveVideoBuffer(await fetchToBuffer(polled));
    return { ok: true, provider: 'fal', model: endpoint, url: local, remoteUrl: polled };
  }
  const local = await saveVideoBuffer(await fetchToBuffer(videoUrl));
  return { ok: true, provider: 'fal', model: endpoint, url: local, remoteUrl: videoUrl };
}

async function pollFal(modelPath, requestId, key, maxAttempts = 60) {
  const statusUrl = `https://queue.fal.run/${modelPath}/requests/${requestId}/status`;
  const resultUrl = `https://queue.fal.run/${modelPath}/requests/${requestId}`;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000);
    const s = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` } });
    const sj = await s.json().catch(() => ({}));
    const st = String(sj.status || '').toUpperCase();
    if (st === 'COMPLETED' || st === 'FINISHED') {
      const r = await fetch(resultUrl, { headers: { Authorization: `Key ${key}` } });
      const dj = await r.json();
      const u = dj.video?.url || dj.data?.video?.url || dj.video_url;
      if (!u) throw Object.assign(new Error('fal terminé sans URL'), { status: 502 });
      return u;
    }
    if (st === 'FAILED' || st === 'ERROR' || st === 'CANCELLED') {
      throw Object.assign(new Error(`fal échoué: ${sj.error || st}`), { status: 502 });
    }
  }
  throw Object.assign(new Error('fal: délai dépassé'), { status: 504 });
}

/** Runway Dev text_to_video — needs RUNWAYML_API_SECRET. Async + poll. */
async function generateRunwayVideo(prompt, cfg) {
  const start = await fetch('https://api.dev.runwayml.com/v1/text_to_video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model: cfg.model || 'gen4.5',
      promptText: prompt,
      ratio: process.env.VIDEO_RATIO || '1280:720',
      duration: cfg.duration || 5,
    }),
  });
  const startRaw = await start.text();
  let startData;
  try {
    startData = JSON.parse(startRaw);
  } catch {
    throw Object.assign(new Error(startRaw.slice(0, 200)), { status: start.status || 502 });
  }
  if (!start.ok) {
    throw Object.assign(new Error(startData?.error || startRaw.slice(0, 200)), { status: start.status });
  }
  const taskId = startData.id || startData.task;
  if (!taskId) throw Object.assign(new Error('Runway: pas d’id de tâche'), { status: 502 });

  for (let i = 0; i < 90; i++) {
    await sleep(4000);
    const s = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        'X-Runway-Version': '2024-11-06',
      },
    });
    const dj = await s.json().catch(() => ({}));
    const st = String(dj.status || '').toUpperCase();
    if (st === 'SUCCEEDED' || st === 'COMPLETED') {
      const out = dj.output?.[0] || dj.artifacts?.[0]?.url || dj.video;
      const videoUrl = typeof out === 'string' ? out : out?.url;
      if (!videoUrl) throw Object.assign(new Error('Runway: terminé sans URL'), { status: 502 });
      const local = await saveVideoBuffer(await fetchToBuffer(videoUrl));
      return { ok: true, provider: 'runway', model: cfg.model, url: local, remoteUrl: videoUrl };
    }
    if (st === 'FAILED' || st === 'CANCELLED' || st === 'ERROR') {
      throw Object.assign(new Error(`Runway échoué: ${dj.failure || dj.error || st}`), { status: 502 });
    }
  }
  throw Object.assign(new Error('Runway: délai dépassé'), { status: 504 });
}

/** Luma Dream Machine — needs LUMA_API_KEY. */
async function generateLumaVideo(prompt, cfg) {
  const start = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      model: cfg.model || 'ray-2',
      aspect_ratio: process.env.VIDEO_ASPECT || '16:9',
    }),
  });
  const startRaw = await start.text();
  let startData;
  try {
    startData = JSON.parse(startRaw);
  } catch {
    throw Object.assign(new Error(startRaw.slice(0, 200)), { status: start.status || 502 });
  }
  if (!start.ok) {
    throw Object.assign(new Error(startData?.detail || startData?.error || startRaw.slice(0, 200)), {
      status: start.status,
    });
  }
  const id = startData.id;
  if (!id) throw Object.assign(new Error('Luma: pas d’id'), { status: 502 });

  for (let i = 0; i < 90; i++) {
    await sleep(4000);
    const s = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${id}`, {
      headers: { Authorization: `Bearer ${cfg.key}` },
    });
    const dj = await s.json().catch(() => ({}));
    const st = String(dj.state || dj.status || '').toLowerCase();
    if (st === 'completed' || st === 'succeeded') {
      const videoUrl = dj.assets?.video || dj.video?.url || dj.video;
      if (!videoUrl) throw Object.assign(new Error('Luma: terminé sans URL'), { status: 502 });
      const local = await saveVideoBuffer(await fetchToBuffer(videoUrl));
      return { ok: true, provider: 'luma', model: cfg.model, url: local, remoteUrl: videoUrl };
    }
    if (st === 'failed' || st === 'error' || st === 'cancelled') {
      throw Object.assign(new Error(`Luma échoué: ${dj.failure_reason || st}`), { status: 502 });
    }
  }
  throw Object.assign(new Error('Luma: délai dépassé'), { status: 504 });
}

/** OpenAI Sora (when available on account) — needs OPENAI_OWN_API_KEY. */
async function generateOpenAIVideo(prompt, cfg) {
  const r = await fetch('https://api.openai.com/v1/videos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model || 'sora-2',
      prompt,
      seconds: String(cfg.duration || 5),
      size: process.env.VIDEO_SIZE || '1280x720',
    }),
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error(raw.slice(0, 200)), { status: r.status || 502 });
  }
  if (!r.ok) {
    throw Object.assign(new Error(data?.error?.message || raw.slice(0, 200)), { status: r.status });
  }
  // Async job style
  const id = data.id;
  if (data.url || data.data?.[0]?.url) {
    const videoUrl = data.url || data.data[0].url;
    const local = await saveVideoBuffer(await fetchToBuffer(videoUrl, { Authorization: `Bearer ${cfg.key}` }));
    return { ok: true, provider: 'openai', model: cfg.model, url: local, remoteUrl: videoUrl };
  }
  if (!id) throw Object.assign(new Error('OpenAI vidéo: réponse inattendue'), { status: 502 });

  for (let i = 0; i < 90; i++) {
    await sleep(5000);
    const s = await fetch(`https://api.openai.com/v1/videos/${id}`, {
      headers: { Authorization: `Bearer ${cfg.key}` },
    });
    const dj = await s.json().catch(() => ({}));
    const st = String(dj.status || '').toLowerCase();
    if (st === 'completed' || st === 'succeeded') {
      // Content endpoint
      const content = await fetch(`https://api.openai.com/v1/videos/${id}/content`, {
        headers: { Authorization: `Bearer ${cfg.key}` },
      });
      if (content.ok) {
        const buf = Buffer.from(await content.arrayBuffer());
        const local = await saveVideoBuffer(buf);
        return { ok: true, provider: 'openai', model: cfg.model, url: local };
      }
      const videoUrl = dj.url || dj.video_url;
      if (!videoUrl) throw Object.assign(new Error('Sora: terminé sans contenu'), { status: 502 });
      const local = await saveVideoBuffer(await fetchToBuffer(videoUrl, { Authorization: `Bearer ${cfg.key}` }));
      return { ok: true, provider: 'openai', model: cfg.model, url: local, remoteUrl: videoUrl };
    }
    if (st === 'failed' || st === 'cancelled' || st === 'error') {
      throw Object.assign(new Error(`Sora échoué: ${dj.error?.message || st}`), { status: 502 });
    }
  }
  throw Object.assign(new Error('Sora: délai dépassé'), { status: 504 });
}

/** Generic POST {prompt} → {url} webhook for custom backends. */
async function generateGenericVideo(prompt, cfg) {
  if (!cfg.url) throw Object.assign(new Error('VIDEO_API_URL manquant'), { status: 500 });
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, model: cfg.model || undefined, duration: cfg.duration }),
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error(raw.slice(0, 200)), { status: r.status || 502 });
  }
  if (!r.ok) {
    throw Object.assign(new Error(data?.error || raw.slice(0, 200)), { status: r.status });
  }
  const videoUrl = data.url || data.video_url || data.video?.url;
  if (!videoUrl) throw Object.assign(new Error('Réponse générique sans URL vidéo'), { status: 502 });
  const local = await saveVideoBuffer(await fetchToBuffer(videoUrl));
  return { ok: true, provider: 'generic', model: cfg.model || null, url: local, remoteUrl: videoUrl };
}

async function generateVideo(prompt, opts = {}) {
  const raw = String(prompt || '').trim();
  if (!raw) throw Object.assign(new Error('prompt requis'), { status: 400 });

  const cfg = videoEnv();
  if (!cfg.configured) {
    const err = new Error(
      'Vidéo excellente indisponible sans clé payante. Branche FAL_KEY, POLLINATIONS_API_KEY (Pollen), RUNWAYML_API_SECRET, LUMA_API_KEY ou OPENAI (Sora). Free = 1/jour · Pro = illimité.'
    );
    err.status = 501;
    err.code = 'video_unavailable';
    err.stub = true;
    throw err;
  }

  const enriched = enrichVideoPrompt(raw);
  const p = enriched.prompt;
  let out;
  switch (cfg.provider) {
    case 'fal':
      out = await generateFalVideo(p, cfg);
      break;
    case 'pollinations':
      out = await generatePollinationsVideo(p, cfg);
      break;
    case 'runway':
      out = await generateRunwayVideo(p, cfg);
      break;
    case 'luma':
      out = await generateLumaVideo(p, cfg);
      break;
    case 'openai':
      out = await generateOpenAIVideo(p, cfg);
      break;
    case 'generic':
      out = await generateGenericVideo(p, cfg);
      break;
    default:
      throw Object.assign(new Error(`Fournisseur vidéo inconnu: ${cfg.provider}`), { status: 500 });
  }
  return {
    ...out,
    enrichedPrompt: p,
    originalPrompt: enriched.original,
    costHint: cfg.costHint,
  };
}

module.exports = {
  generateVideo,
  videoStatus,
  videoEnv,
  enrichVideoPrompt,
};
