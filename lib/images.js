/**
 * Image generation: IMAGE_API_KEY (paid) → optional Pollinations key (flux) → free classic.
 * Enriches FR prompts → EN quality boosters. Only returns ok when bytes look like an image
 * so Free quota is not burned on failed gens.
 */

const QUALITY_SUFFIX = {
  photo:
    'photorealistic photograph, natural skin and materials, soft cinematic lighting, shallow depth of field, sharp focus, high detail, 8k',
  art:
    'highly detailed digital art, coherent composition, rich lighting, professional illustration, masterpiece',
  logo:
    'clean vector logo, flat design, high contrast, centered, simple shapes, professional brand mark, white background',
  default:
    'high quality, sharp details, well-composed, professional lighting, visually striking',
};

const NEGATIVE =
  'blurry, low quality, watermark, text artifacts, deformed, extra limbs, oversaturated, jpeg artifacts';

/** Lightweight FR→EN for common image prompts (no network; avoids burning rate limits). */
/** Multi-word phrases first; short tokens use full \b...\b to avoid "violet"→"violand". */
const FR_PHRASES = [
  [/coucher(s)?\s+de\s+soleil/gi, 'sunset'],
  [/lever(s)?\s+de\s+soleil/gi, 'sunrise'],
  [/s['']il\s+te\s+pla[iî]t/gi, ''],
  [/photo\s+r[eé]aliste/gi, 'photorealistic photo'],
  [/intelligence\s+artificielle/gi, 'AI'],
];

const FR_WORDS = [
  [/chatons?\b/gi, 'kitten'],
  [/chats?\b/gi, 'cat'],
  [/chiens?\b/gi, 'dog'],
  [/oiseaux?\b/gi, 'bird'],
  [/chevaux\b|cheval\b/gi, 'horse'],
  [/femmes?\b/gi, 'woman'],
  [/hommes?\b/gi, 'man'],
  [/enfants?\b/gi, 'child'],
  [/personnes?\b/gi, 'person'],
  [/gens\b/gi, 'people'],
  [/paysages?\b/gi, 'landscape'],
  [/montagnes?\b/gi, 'mountain'],
  [/for[eê]ts?\b/gi, 'forest'],
  [/plages?\b/gi, 'beach'],
  [/oc[eé]ans?\b|\bmers?\b/gi, 'ocean'],
  [/villes?\b/gi, 'city'],
  [/rues?\b/gi, 'street'],
  [/maisons?\b/gi, 'house'],
  [/appartements?\b/gi, 'apartment'],
  [/toits?\b/gi, 'rooftop'],
  [/voitures?\b/gi, 'car'],
  [/v[eé]los?\b/gi, 'bicycle'],
  [/avions?\b/gi, 'airplane'],
  [/trains?\b/gi, 'train'],
  [/nourriture\b|repas\b/gi, 'food'],
  [/caf[eé]s?\b/gi, 'coffee'],
  [/soleils?\b/gi, 'sun'],
  [/lunes?\b/gi, 'moon'],
  [/ciels?\b/gi, 'sky'],
  [/nuits?\b/gi, 'night'],
  [/pluies?\b/gi, 'rain'],
  [/neiges?\b/gi, 'snow'],
  [/fleurs?\b/gi, 'flower'],
  [/arbres?\b/gi, 'tree'],
  [/robots?\b/gi, 'robot'],
  [/espaces?\b/gi, 'space'],
  [/plan[eè]tes?\b/gi, 'planet'],
  [/portraits?\b/gi, 'portrait'],
  [/photographies?\b|photos?\b/gi, 'photograph'],
  [/illustrations?\b|images?\b/gi, 'image'],
  [/dessins?\b/gi, 'drawing'],
  [/peintures?\b/gi, 'painting'],
  [/logos?\b/gi, 'logo'],
  [/photor[eé]aliste\b|r[eé]aliste\b/gi, 'photorealistic'],
  [/cin[eé]matique\b/gi, 'cinematic'],
  [/studios?\b/gi, 'studio'],
  [/[eé]clairages?\b/gi, 'lighting'],
  [/lumi[eè]res?\b/gi, 'light'],
  [/ombres?\b/gi, 'shadow'],
  [/couleurs?\b/gi, 'color'],
  [/bleus?\b/gi, 'blue'],
  [/rouges?\b/gi, 'red'],
  [/verts?\b/gi, 'green'],
  [/jaunes?\b/gi, 'yellow'],
  [/noirs?\b/gi, 'black'],
  [/blancs?\b|blanches?\b/gi, 'white'],
  [/violets?\b|violettes?\b|indigos?\b/gi, 'violet'],
  [/qu[eé]bec\b/gi, 'Quebec'],
  [/montr[eé]al\b/gi, 'Montreal'],
  [/hivers?\b/gi, 'winter'],
  [/[eé]t[eé]s?\b/gi, 'summer'],
  [/automnes?\b/gi, 'autumn'],
  [/printemps\b/gi, 'spring'],
  [/beaux?\b|belles?\b/gi, 'beautiful'],
  [/grands?\b|grandes?\b/gi, 'large'],
  [/petits?\b|petites?\b/gi, 'small'],
  [/anciens?\b|anciennes?\b/gi, 'ancient'],
  [/modernes?\b/gi, 'modern'],
  [/futuristes?\b/gi, 'futuristic'],
  [/\btr[eè]s\b/gi, 'very'],
  [/\bune?\b/gi, 'a'],
  [/\bdes\b/gi, ''],
  [/\bles?\b/gi, ''],
  [/\bla\b/gi, ''],
  [/\bdu\b/gi, ''],
  [/\bau\b/gi, 'at the'],
  [/\baux\b/gi, 'at the'],
  [/\bd['']\b/gi, ''],
  [/\bl['']\b/gi, ''],
  [/\bde\b/gi, ''],
  [/\bdans\b/gi, 'in'],
  [/\bavec\b/gi, 'with'],
  [/\bsans\b/gi, 'without'],
  [/\bsur\b/gi, 'on'],
  [/\bpour\b/gi, 'for'],
  [/\bet\b/gi, 'and'],
  [/\bou\b/gi, 'or'],
  [/\ben\b/gi, 'in'],
  [/(^|\s)à(?=\s|$)/gi, '$1at'],
];

function looksFrench(text) {
  const t = String(text || '');
  if (/[àâäéèêëïîôùûüçœæ]/i.test(t)) return true;
  return /\b(une?|des|les?|dans|avec|pour|chat|chien|maison|soleil|photo|g[eé]n[eè]re|cr[eé]e|fais|toit|femme|homme)\b/i.test(t);
}

function detectStyle(prompt) {
  const p = String(prompt || '').toLowerCase();
  if (/\b(logo|ic[oô]ne|icone|icon|marque|brand)\b/.test(p)) return 'logo';
  if (/\b(dessine|dessin|illustration|peinture|anime|manga|cartoon|art|aquarelle|pixel|sketch)\b/.test(p)) return 'art';
  if (/\b(photo|photoreal|r[eé]aliste|realiste|portrait|selfie)\b/.test(p)) return 'photo';
  // Default to photo look — users expect "clearly better photos"
  return 'photo';
}

function frToEnLite(text) {
  let out = String(text || '').trim();
  for (const [re, repl] of FR_PHRASES) out = out.replace(re, repl);
  for (const [re, repl] of FR_WORDS) out = out.replace(re, repl);
  return out.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Enrich user prompt for image models: FR→EN + style/lighting boosters.
 */
function enrichPrompt(raw) {
  const original = String(raw || '').trim();
  if (!original) return { prompt: '', style: 'default', original: '' };
  const style = detectStyle(original);
  let body = looksFrench(original) ? frToEnLite(original) : original;
  // Drop leftover French filler / imperatives that survived translation
  body = body
    .replace(/\b(g[eé]n[eè]re|genere|cr[eé]e|cree|fais|faire|dessine|svp|please|monte|montre)\b/gi, '')
    .replace(/(^|\s)à(?=\s|$)/gi, '$1at')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
  if (!body) body = original;
  const boost = QUALITY_SUFFIX[style] || QUALITY_SUFFIX.default;
  // Avoid double-appending if user already asked for quality
  const alreadyBoosted = /cinematic lighting|soft cinematic|8k|masterpiece|high detail/i.test(body);
  const prompt = alreadyBoosted ? body : `${body}, ${boost}`;
  return { prompt: prompt.slice(0, 900), style, original };
}

function parseSize(size) {
  const m = String(size || '1024x1024').match(/(\d+)\s*x\s*(\d+)/i);
  let w = m ? Number(m[1]) : 1024;
  let h = m ? Number(m[2]) : 1024;
  // Classic free Pollinations soft-caps around ~1MP; keep usable but sharp
  const maxSide = Number(process.env.IMAGE_MAX_SIDE || 1024);
  w = Math.min(Math.max(w, 512), maxSide);
  h = Math.min(Math.max(h, 512), maxSide);
  return { width: w, height: h };
}

function resolvePaidImage() {
  const explicitKey = (process.env.IMAGE_API_KEY || '').trim();
  const explicitBase = (process.env.IMAGE_BASE_URL || '').trim().replace(/\/$/, '');
  const openaiOwn = (process.env.OPENAI_OWN_API_KEY || '').trim();
  const xai = (process.env.XAI_API_KEY || '').trim();
  if (explicitKey && explicitBase) {
    return { key: explicitKey, base: explicitBase, model: process.env.IMAGE_MODEL || 'dall-e-3' };
  }
  if (explicitKey) {
    return {
      key: explicitKey,
      base: explicitBase || 'https://api.openai.com/v1',
      model: process.env.IMAGE_MODEL || 'dall-e-3',
    };
  }
  if (openaiOwn) {
    return {
      key: openaiOwn,
      base: 'https://api.openai.com/v1',
      model: process.env.IMAGE_MODEL || 'dall-e-3',
    };
  }
  if (xai) {
    return {
      key: xai,
      base: 'https://api.x.ai/v1',
      model: process.env.IMAGE_MODEL || 'grok-2-image',
    };
  }
  return null;
}

function pollinationsKey() {
  return (process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || '').trim();
}

async function generatePaid(prompt, size = '1024x1024') {
  const cfg = resolvePaidImage();
  if (!cfg) return null;
  const body = {
    model: cfg.model,
    prompt,
    n: 1,
    size,
    response_format: 'url',
  };
  // DALL·E 3 quality knob when applicable
  if (/dall-e-3/i.test(cfg.model)) body.quality = process.env.IMAGE_QUALITY || 'hd';
  const r = await fetch(`${cfg.base}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
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
    throw Object.assign(new Error(data?.error?.message || raw.slice(0, 200)), { status: r.status });
  }
  const item = data.data?.[0] || {};
  if (!item.url && !item.b64_json) {
    throw Object.assign(new Error('Réponse image vide du fournisseur payant'), { status: 502 });
  }
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

function buildClassicUrl(prompt, { width, height, seed, model }) {
  const q = encodeURIComponent(prompt.slice(0, 700));
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    nologo: 'true',
    enhance: 'true',
    model: model || process.env.POLLINATIONS_MODEL || 'flux',
  });
  return `https://image.pollinations.ai/prompt/${q}?${params.toString()}`;
}

function buildGenUrl(prompt, { width, height, seed, model }) {
  const q = encodeURIComponent(prompt.slice(0, 700));
  const params = new URLSearchParams({
    model: model || process.env.POLLINATIONS_MODEL || 'flux',
    width: String(width),
    height: String(height),
    seed: String(seed),
    enhance: 'true',
    nologo: 'true',
  });
  return `https://gen.pollinations.ai/image/${q}?${params.toString()}`;
}

async function fetchImageBytes(url, { authKey } = {}) {
  const headers = {
    'User-Agent': 'Qoria/1.0 (+https://qoria.onrender.com)',
    Accept: 'image/*,*/*',
    Referer: 'https://www.pollinations.ai/',
  };
  if (authKey) headers.Authorization = `Bearer ${authKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.IMAGE_FETCH_MS || 90000));
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', headers, signal: controller.signal });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      const msg =
        r.status === 402
          ? 'Limite gratuite Pollinations atteinte — réessaie dans ~1 min.'
          : `Génération image HTTP ${r.status}${errBody ? ': ' + errBody.slice(0, 120) : ''}`;
      throw Object.assign(new Error(msg), { status: r.status === 402 ? 429 : 502 });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50;
    const isWebp = buf.length > 12 && buf.slice(8, 12).toString() === 'WEBP';
    const looksImage = isJpeg || isPng || isWebp || ct.includes('image/');
    // Reject tiny error cards / HTML disguised as images
    if (!looksImage || buf.length < 8000) {
      throw Object.assign(new Error('Image invalide ou trop petite renvoyée — quota non consommé.'), {
        status: 502,
      });
    }
    return { buf, ct: ct || (isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg') };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate via Pollinations. Prefer authenticated gen (flux) when key present;
 * otherwise classic free URL. Verifies bytes before success.
 */
async function generatePollinations(prompt, opts = {}) {
  const { width, height } = parseSize(opts.size || '1024x1024');
  const seed = Math.floor(Math.random() * 1e9);
  const model = process.env.POLLINATIONS_MODEL || 'flux';
  const key = pollinationsKey();

  const attempts = [];
  if (key) {
    attempts.push({
      label: 'pollinations-gen',
      url: buildGenUrl(prompt, { width, height, seed, model }),
      authKey: key,
      model,
    });
  }
  // Classic free — always available (logo / rate limits possible)
  attempts.push({
    label: 'pollinations-classic',
    url: buildClassicUrl(prompt, { width, height, seed, model }),
    authKey: null,
    model: model || 'flux',
  });
  // Last resort: gen without key (sometimes open with Referer)
  if (!key) {
    attempts.push({
      label: 'pollinations-gen-anon',
      url: buildGenUrl(prompt, { width: Math.min(width, 1024), height: Math.min(height, 1024), seed, model }),
      authKey: null,
      model,
    });
  }

  let lastErr = null;
  for (const a of attempts) {
    try {
      const { buf, ct } = await fetchImageBytes(a.url, { authKey: a.authKey });
      // Prefer shareable URL for classic; for gen-auth return data URL so UI always shows bytes we verified
      const useDataUrl = a.label !== 'pollinations-classic';
      return {
        ok: true,
        provider: 'pollinations',
        model: a.model,
        url: useDataUrl ? `data:${ct};base64,${buf.toString('base64')}` : a.url,
        prompt,
        bytes: buf.length,
        note:
          a.label === 'pollinations-classic'
            ? 'Gratuit Pollinations — qualité limitée vs DALL·E / Flux payant'
            : undefined,
      };
    } catch (e) {
      lastErr = e;
      console.warn(`[Qoria] image attempt ${a.label} failed:`, e.message);
    }
  }
  throw Object.assign(new Error(lastErr?.message || 'Génération image échouée'), {
    status: lastErr?.status || 502,
  });
}

async function generateImage(prompt, opts = {}) {
  const raw = String(prompt || '').trim();
  if (!raw) throw Object.assign(new Error('prompt requis'), { status: 400 });

  const enriched = enrichPrompt(raw);
  const p = enriched.prompt;

  if (!opts.forceFree) {
    try {
      const paid = await generatePaid(p, opts.size || '1024x1024');
      if (paid && (paid.url || paid.b64)) {
        return { ...paid, enrichedPrompt: p, style: enriched.style };
      }
    } catch (e) {
      console.warn('[Qoria] paid image failed, fallback Pollinations:', e.message);
      // If paid was explicitly configured, still fall through to free rather than burning nothing
    }
  }

  const free = await generatePollinations(p, opts);
  return { ...free, enrichedPrompt: p, style: enriched.style, originalPrompt: enriched.original };
}

function imageStatus() {
  const paid = resolvePaidImage();
  const pollKey = Boolean(pollinationsKey());
  return {
    paidConfigured: Boolean(paid),
    pollinationsKey: pollKey,
    freeFallback: 'pollinations',
    model: process.env.POLLINATIONS_MODEL || 'flux',
    alwaysWorks: true,
    qualityNote:
      paid || pollKey
        ? 'Images haute qualité (clé configurée)'
        : 'Images via Pollinations gratuit — mieux qu’avant (prompts enrichis + flux), mais encore en-dessous de DALL·E 3 / Flux payant.',
  };
}

function pollinationsUrl(prompt, opts = {}) {
  const { width, height } = parseSize(opts.size || opts.width ? `${opts.width}x${opts.height}` : '1024x1024');
  const enriched = enrichPrompt(prompt);
  return buildClassicUrl(enriched.prompt, {
    width,
    height,
    seed: opts.seed || Math.floor(Math.random() * 1e9),
    model: process.env.POLLINATIONS_MODEL || 'flux',
  });
}

module.exports = {
  generateImage,
  imageStatus,
  pollinationsUrl,
  resolvePaidImage,
  enrichPrompt,
  NEGATIVE,
};
