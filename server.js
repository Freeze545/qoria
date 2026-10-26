/**
 * Qoria — IA généraliste grand public
 * Auth, chat multi-modèles, images (Pollinations), fichiers, mémoire, limites Free/Pro
 */
require('dotenv').config();

(function assembleKey() {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 20) return;
  const parts = [];
  for (let i = 0; i < 20; i++) {
    const p = process.env['OPENAI_API_KEY_P' + i];
    if (!p) break;
    parts.push(p);
  }
  if (parts.length) process.env.OPENAI_API_KEY = parts.join('');
})();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const db = require('./lib/db');
const providers = require('./lib/providers');
const { detectTask, routeChat, pickRoute } = require('./lib/router');
const { generateImage, imageStatus } = require('./lib/images');
const { generateVideo, videoStatus } = require('./lib/videos');

const app = express();
const PORT = process.env.PORT || 3850;
const JWT_SECRET = process.env.JWT_SECRET || 'qoria-dev-insecure';
const FREE_IMAGES = Number(process.env.FREE_DAILY_IMAGES || 3);
const FREE_VIDEOS = Number(process.env.FREE_DAILY_VIDEOS || 1);
/** @deprecated use PRO_WEEKLY_ENSEMBLE — kept as fallback if weekly unset historically */
const ENSEMBLE_CAP = Number(process.env.ENSEMBLE_DAILY_CAP || 10);
// Pro soft weekly ceilings (calendar week Mon→Sun, America/Toronto). Generous vs Free daily quotas.
const PRO_WEEKLY_MESSAGES = Number(process.env.PRO_WEEKLY_MESSAGES || 2500);
const PRO_WEEKLY_IMAGES = Number(process.env.PRO_WEEKLY_IMAGES || 150);
const PRO_WEEKLY_VIDEOS = Number(process.env.PRO_WEEKLY_VIDEOS || 30);
const PRO_WEEKLY_ENSEMBLE = Number(process.env.PRO_WEEKLY_ENSEMBLE || process.env.ENSEMBLE_DAILY_CAP || 40);
const DEFAULT_MAX_TOKENS = Number(process.env.CHAT_MAX_TOKENS || 1200);
const VISION_MAX_TOKENS = Number(process.env.VISION_MAX_TOKENS || 600);
const COOKIE = 'qoria_token';
const VIDEO_STATUS = videoStatus();
const VIDEO_CONFIGURED = Boolean(VIDEO_STATUS.configured);

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 10) || '';
      cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_SYSTEM = `Tu es Qoria — l'IA généraliste de marque Qoria. Tu parles comme un·e pro compétent·e du Québec : clair, direct, chaleureux sans être niais.

Style de réponse (important) :
- Va droit au but. Lead avec la réponse utile, puis les détails si besoin.
- Phrases courtes. Zéro remplissage (« Bien sûr ! », « Avec plaisir ! », « N'hésite pas… », « En résumé, voici… » en ouverture).
- Français québécois naturel quand l'utilisateur écrit en français; sinon suis sa langue.
- Structure : listes ou étapes seulement si ça aide vraiment. Pas de markdown décoratif inutile.
- Sois honnête sur l'incertitude. N'invente pas de faits, citations, prix ou sources.
- Refuse clairement le contenu illégal ou dangereux; propose une alternative légale quand c'est possible.
- Tu es Qoria : ne renvoie jamais vers ChatGPT, Claude, Gemini ou Grok comme « meilleure option ».
- Code : donne le code qui marche, minimal, avec une courte explication — pas un roman.
- Images/fichiers : décris ce qui est utile pour la tâche, pas une description exhaustive.`;

function signUser(user) {
  return jwt.sign(
    { id: user.id, email: user.email, plan: user.plan || 'free' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function authOptional(req, _res, next) {
  const token = req.cookies?.[COOKIE] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch { /* ignore */ }
  next();
}

function authRequired(req, res, next) {
  authOptional(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'Connexion requise', code: 'auth_required' });
    try {
      if (!findUser(db.load(), req.user.id)) {
        res.clearCookie(COOKIE);
        return res.status(401).json({ error: 'Session expirée — reconnecte-toi.', code: 'session_expired' });
      }
    } catch { /* ignore */ }
    next();
  });
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    plan: u.plan || 'free',
    createdAt: u.createdAt,
  };
}

function findUser(data, idOrEmail) {
  return data.users.find((u) => u.id === idOrEmail || u.email === String(idOrEmail || '').toLowerCase());
}

function isPro(user) {
  return (user?.plan || 'free') === 'pro';
}

function limitsFor(user) {
  if (isPro(user)) {
    return {
      images: PRO_WEEKLY_IMAGES,
      videos: PRO_WEEKLY_VIDEOS,
      ensemble: PRO_WEEKLY_ENSEMBLE,
      chat: PRO_WEEKLY_MESSAGES,
      period: 'week',
      weekStart: db.weekStart(),
      soft: true,
    };
  }
  return {
    images: FREE_IMAGES,
    videos: FREE_VIDEOS,
    ensemble: 0,
    chat: null,
    period: 'day',
    soft: false,
  };
}

function proWeeklyResetMessage() {
  return 'Limite hebdo Pro atteinte — revient lundi';
}

function friendlyProviderError(err) {
  const raw = String(err?.message || err || '');
  const lower = raw.toLowerCase();
  if (/otpm|request too large|tokens? per minute|rate_limit|rate limit/i.test(raw)) {
    return 'Message trop long pour le modèle (limite de tokens). Réessaie avec un texte plus court, ou une image plus petite.';
  }
  if (/context.?length|too many tokens|maximum context/i.test(raw)) {
    return 'Le contexte est trop long. Commence une nouvelle conversation ou retire la pièce jointe.';
  }
  if (/insufficient_quota|billing|payment/i.test(lower)) {
    return 'Capacité IA temporairement indisponible. Réessaie plus tard.';
  }
  if (/clé manquante|api key|unauthorized|401/i.test(lower)) {
    return 'Fournisseur IA non configuré pour le moment.';
  }
  // Strip raw JSON / verbose provider dumps
  if (raw.trim().startsWith('{') || raw.includes('"error"')) {
    return 'Erreur du fournisseur IA. Réessaie dans un instant.';
  }
  return raw.slice(0, 180) || 'Erreur IA';
}

function checkUsage(userId, kind = 'messages') {
  const data = db.load();
  const user = findUser(data, userId);
  if (!user) return { ok: false, error: 'Utilisateur introuvable', code: 'no_user' };
  const usage = db.getUsage(data, userId);
  const lims = limitsFor(user);
  const pro = isPro(user);

  if (kind === 'ensemble') {
    if (!pro) {
      return {
        ok: false,
        code: 'pro_required',
        error: 'Fonction Pro — passe à Pro pour débloquer',
        usage,
        limit: 0,
        limits: lims,
      };
    }
    const limit = lims.ensemble;
    const count = usage.weekEnsemble || 0;
    if (limit != null && count >= limit) {
      return {
        ok: false,
        code: 'weekly_limit',
        error: proWeeklyResetMessage() + ` (ensemble ${limit}/semaine).`,
        usage,
        limit,
        limits: lims,
      };
    }
    return { ok: true, usage, limit, limits: lims, kind, pending: true };
  }

  if (kind === 'images') {
    if (pro) {
      const limit = lims.images;
      const count = usage.weekImages || 0;
      if (limit != null && count >= limit) {
        return {
          ok: false,
          code: 'weekly_limit',
          error: proWeeklyResetMessage() + ` (images ${limit}/semaine).`,
          usage,
          limit,
          limits: lims,
        };
      }
      return { ok: true, usage, limit, limits: lims, kind, pending: true };
    }
    const limit = lims.images;
    const count = usage.images || 0;
    if (limit != null && count >= limit) {
      return {
        ok: false,
        code: 'image_limit',
        error: `Limite d’images atteinte (${limit}/jour en Free). Pro = plafond hebdo généreux.`,
        usage,
        limit,
        limits: lims,
      };
    }
    return { ok: true, usage, limit, limits: lims, kind, pending: true };
  }

  if (kind === 'videos') {
    if (!VIDEO_CONFIGURED) {
      return {
        ok: false,
        code: 'video_unavailable',
        error: 'Vidéo bientôt disponible — clé fournisseur requise.',
        usage,
        limit: lims.videos,
        limits: lims,
        stub: true,
      };
    }
    if (pro) {
      const limit = lims.videos;
      const count = usage.weekVideos || 0;
      if (limit != null && count >= limit) {
        return {
          ok: false,
          code: 'weekly_limit',
          error: proWeeklyResetMessage() + ` (vidéos ${limit}/semaine).`,
          usage,
          limit,
          limits: lims,
        };
      }
      return { ok: true, usage, limit, limits: lims, kind, pending: true };
    }
    const limit = lims.videos;
    const count = usage.videos || 0;
    if (limit != null && count >= limit) {
      return {
        ok: false,
        code: 'video_limit',
        error: `Limite vidéo atteinte (${limit}/jour en Free). Pro = plafond hebdo généreux.`,
        usage,
        limit,
        limits: lims,
      };
    }
    return { ok: true, usage, limit, limits: lims, kind, pending: true };
  }

  // Chat messages: Free unlimited; Pro soft weekly ceiling
  if (pro) {
    const limit = lims.chat;
    const count = usage.weekMessages || 0;
    if (limit != null && count >= limit) {
      return {
        ok: false,
        code: 'weekly_limit',
        error: proWeeklyResetMessage() + ` (messages ${limit}/semaine).`,
        usage,
        limit,
        limits: lims,
      };
    }
    return { ok: true, usage, limit, limits: lims, kind: 'messages', pending: true };
  }
  return { ok: true, usage, limit: null, limits: lims, kind: 'messages', pending: true };
}

function commitUsage(userId, kind = 'messages') {
  const data = db.load();
  const user = findUser(data, userId);
  const usage = db.getUsage(data, userId);
  const lims = limitsFor(user);
  const pro = isPro(user);

  if (kind === 'ensemble') {
    usage.ensemble = (usage.ensemble || 0) + 1;
    usage.weekEnsemble = (usage.weekEnsemble || 0) + 1;
  } else if (kind === 'images') {
    usage.images = (usage.images || 0) + 1;
    if (pro) usage.weekImages = (usage.weekImages || 0) + 1;
  } else if (kind === 'videos') {
    usage.videos = (usage.videos || 0) + 1;
    if (pro) usage.weekVideos = (usage.weekVideos || 0) + 1;
  } else {
    usage.messages = (usage.messages || 0) + 1;
    if (pro) usage.weekMessages = (usage.weekMessages || 0) + 1;
  }

  db.setUsage(data, userId, usage);
  db.save(data);
  let limit = null;
  if (kind === 'ensemble') limit = lims.ensemble;
  else if (kind === 'images') limit = lims.images;
  else if (kind === 'videos') limit = lims.videos;
  else if (pro) limit = lims.chat;
  return { usage, limits: lims, limit };
}

/** @deprecated prefer checkUsage + commitUsage — kept for any leftover calls */
function checkAndIncUsage(userId, kind = 'messages') {
  const checked = checkUsage(userId, kind);
  if (!checked.ok) return checked;
  const committed = commitUsage(userId, kind);
  return { ...checked, ...committed, ok: true };
}

function usagePayload(user, usage) {
  const lims = limitsFor(user);
  return {
    usage,
    limits: lims,
    plan: user?.plan || 'free',
  };
}

function memoriesFor(userId) {
  const data = db.load();
  return data.memories.filter((m) => m.userId === userId).slice(-30);
}

function buildSystem(userId, extra) {
  let sys = DEFAULT_SYSTEM;
  const mems = memoriesFor(userId);
  if (mems.length) {
    sys += '\n\nMémoires enregistrées par l\'utilisateur (respecte-les):\n' +
      mems.map((m) => `- ${m.text}`).join('\n');
  }
  if (extra) sys += '\n\n' + extra;
  return sys;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter((p) => p && (p.type === 'text' || p.text)).map((p) => p.text || '').join('\n');
  }
  return String(content || '');
}

// ——— Status ———
app.get('/api/status', authOptional, async (_req, res) => {
  const img = imageStatus();
  const prov = providers.getStatus();
  res.json({
    ok: true,
    name: 'Qoria',
    brand: 'Qoria',
    apiConfigured: prov.some((p) => p.connected || p.keyPresent),
    providers: prov,
    capabilities: {
      chat: true,
      image: true,
      imagePaid: img.paidConfigured,
      imageFree: true,
      imageQualityNote: img.qualityNote || null,
      imageModel: img.model || null,
      video: VIDEO_CONFIGURED,
      videoProvider: VIDEO_STATUS.provider || null,
      videoQualityNote: VIDEO_STATUS.qualityNote || null,
      videoCostHint: VIDEO_STATUS.costHint || null,
      videoFreePath: false,
      vision: true,
      voice: true,
      files: true,
      memory: true,
      search: Boolean(process.env.TAVILY_API_KEY),
      ensemble: true,
    },
    limits: {
      freeImages: FREE_IMAGES,
      freeVideos: FREE_VIDEOS,
      freeChatUnlimited: true,
      proWeeklyMessages: PRO_WEEKLY_MESSAGES,
      proWeeklyImages: PRO_WEEKLY_IMAGES,
      proWeeklyVideos: PRO_WEEKLY_VIDEOS,
      proWeeklyEnsemble: PRO_WEEKLY_ENSEMBLE,
      proWeekReset: 'monday',
      proWeekTimezone: 'America/Toronto',
      ensembleDailyLegacy: ENSEMBLE_CAP,
      note: 'Free = quotas journaliers images/vidéo. Pro = plafond hebdo généreux (soft), reset lundi.',
    },
    videoConfigured: VIDEO_CONFIGURED,
    video: VIDEO_STATUS,
    pricing: { free: '0 $/mois', pro: '20 $/mois CAD' },
  });
});

app.post('/api/providers/smoke', authOptional, async (_req, res) => {
  const results = await providers.smokeAll();
  res.json({ ok: true, results, providers: providers.getStatus() });
});

// ——— Auth ———
app.post('/api/auth/signup', (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim() || email.split('@')[0];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Courriel invalide' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum' });
    const data = db.load();
    if (findUser(data, email)) return res.status(409).json({ error: 'Ce courriel est déjà inscrit' });
    const user = {
      id: uuidv4(),
      email,
      name,
      passwordHash: bcrypt.hashSync(password, 10),
      plan: 'free',
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    db.save(data);
    const token = signUser(user);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5, secure: process.env.NODE_ENV === 'production' });
    return res.json({ ok: true, user: publicUser(user), token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erreur inscription' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const data = db.load();
  const user = findUser(data, email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Courriel ou mot de passe incorrect' });
  }
  const token = signUser(user);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5, secure: process.env.NODE_ENV === 'production' });
  return res.json({ ok: true, user: publicUser(user), token });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const data = db.load();
  const user = findUser(data, req.user.id);
  if (!user) return res.status(401).json({ error: 'Session invalide' });
  const usage = db.getUsage(data, user.id);
  res.json({
    ok: true,
    user: publicUser(user),
    ...usagePayload(user, usage),
  });
});

// ——— Conversations ———
app.get('/api/conversations', authRequired, (req, res) => {
  const data = db.load();
  const list = data.conversations
    .filter((c) => c.userId === req.user.id)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, createdAt: c.createdAt }));
  res.json({ conversations: list });
});

app.post('/api/conversations', authRequired, (req, res) => {
  const data = db.load();
  const conv = {
    id: uuidv4(),
    userId: req.user.id,
    title: String(req.body?.title || 'Nouvelle conversation').slice(0, 80),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data.conversations.push(conv);
  db.save(data);
  res.json({ conversation: conv });
});

app.get('/api/conversations/:id/messages', authRequired, (req, res) => {
  const data = db.load();
  const conv = data.conversations.find((c) => c.id === req.params.id && c.userId === req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });
  const messages = data.messages
    .filter((m) => m.conversationId === conv.id)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  res.json({ conversation: conv, messages });
});

app.delete('/api/conversations/:id', authRequired, (req, res) => {
  const data = db.load();
  const conv = data.conversations.find((c) => c.id === req.params.id && c.userId === req.user.id);
  if (!conv) return res.status(404).json({ error: 'Introuvable' });
  data.conversations = data.conversations.filter((c) => c.id !== conv.id);
  data.messages = data.messages.filter((m) => m.conversationId !== conv.id);
  db.save(data);
  res.json({ ok: true });
});

// ——— Chat ———
app.post('/api/chat', authRequired, async (req, res) => {
  try {
    const {
      messages = [],
      conversationId,
      mode = 'chat',
      ensemble = false,
      temperature = 0.55,
    } = req.body || {};

    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages requis' });
    }

    const kind = ensemble ? 'ensemble' : 'messages';
    const checked = checkUsage(req.user.id, kind);
    if (!checked.ok) {
      const status = checked.code === 'no_user' ? 401 : checked.code === 'pro_required' ? 403 : 429;
      return res.status(status).json({
        error: checked.error,
        code: checked.code,
        usage: checked.usage,
        limit: checked.limit,
        limits: checked.limits,
        pricingUrl: '/pricing.html',
      });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const userText = extractText(lastUser?.content);
    const hasVision = Array.isArray(lastUser?.content) && lastUser.content.some((p) => p.type === 'image_url');
    const task = detectTask(userText, hasVision, ensemble ? 'ensemble' : mode);

    // Optional web search injection
    let searchNote = '';
    if (process.env.TAVILY_API_KEY && (task === 'search' || /\b(actualité|aujourd.?hui|cherche)\b/i.test(userText))) {
      try {
        const sr = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query: userText.slice(0, 300),
            max_results: 5,
          }),
        });
        const sd = await sr.json();
        if (sd.results?.length) {
          searchNote = 'Résultats web (Tavily):\n' + sd.results.map((r) => `- ${r.title}: ${r.content}`).join('\n');
        }
      } catch (e) {
        console.warn('search failed', e.message);
      }
    }

    let system = buildSystem(req.user.id, searchNote);
    if (req.body && req.body.voice) {
      system += '\n\nMODE APPEL VOCAL: ta réponse sera lue à voix haute. Réponds en 1 à 3 phrases courtes, naturelles et conversationnelles, en français parlé. Aucun markdown, aucune liste, aucun emoji, aucun symbole, aucune URL.';
    }
    const apiMessages = [
      { role: 'system', content: system },
      ...messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content != null)
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    const maxTokens = hasVision
      ? Math.min(VISION_MAX_TOKENS, DEFAULT_MAX_TOKENS)
      : DEFAULT_MAX_TOKENS;

    const result = await routeChat({
      messages: apiMessages,
      task,
      temperature,
      max_tokens: maxTokens,
      ensemble: Boolean(ensemble),
      userText,
    });

    // Persist
    const data = db.load();
    let convId = conversationId;
    let conv = convId && data.conversations.find((c) => c.id === convId && c.userId === req.user.id);
    if (!conv) {
      conv = {
        id: uuidv4(),
        userId: req.user.id,
        title: userText.slice(0, 48) || 'Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.conversations.push(conv);
      convId = conv.id;
    } else {
      conv.updatedAt = new Date().toISOString();
      if (conv.title === 'Nouvelle conversation' && userText) conv.title = userText.slice(0, 48);
    }
    const userMsg = {
      id: uuidv4(),
      conversationId: convId,
      role: 'user',
      content: typeof lastUser.content === 'string' ? lastUser.content : userText,
      createdAt: new Date().toISOString(),
    };
    const asstMsg = {
      id: uuidv4(),
      conversationId: convId,
      role: 'assistant',
      content: result.content,
      model: result.model,
      provider: result.route?.provider || result.provider,
      createdAt: new Date().toISOString(),
    };
    data.messages.push(userMsg, asstMsg);
    db.save(data);

    const committed = commitUsage(req.user.id, kind);
    return res.json({
      role: 'assistant',
      content: result.content,
      model: result.model,
      provider: result.route?.provider || result.provider,
      route: result.route || null,
      ensemble: Boolean(result.ensemble),
      task,
      conversationId: convId,
      usage: committed.usage,
      limit: committed.limit,
      limits: committed.limits,
    });
  } catch (err) {
    console.error('[Qoria] chat error:', err.message);
    const status = err.status || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: friendlyProviderError(err),
      code: 'provider_error',
    });
  }
});

// ——— Images ———
app.post('/api/image', authRequired, async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt requis' });
    const data = db.load();
    const user = findUser(data, req.user.id);
    if (!user) return res.status(401).json({ error: 'Session invalide' });
    const checked = checkUsage(req.user.id, 'images');
    if (!checked.ok) {
      return res.status(checked.code === 'no_user' ? 401 : 429).json({
        error: checked.error,
        code: checked.code,
        usage: checked.usage,
        limit: checked.limit,
        limits: checked.limits,
        pricingUrl: '/pricing.html',
      });
    }

    const out = await generateImage(prompt, { size: req.body?.size || '1024x1024' });
    if (!out?.ok || !(out.url || out.b64)) {
      // Do NOT burn Free quota on failed / empty gens
      return res.status(502).json({
        error: 'Génération image échouée — ton quota n’a pas été consommé. Réessaie.',
        code: 'image_failed',
      });
    }
    const committed = commitUsage(req.user.id, 'images');
    return res.json({
      ...out,
      usage: committed.usage,
      limits: committed.limits,
      qualityNote: out.note || imageStatus().qualityNote,
    });
  } catch (err) {
    console.error('[Qoria] image:', err.message);
    // Failures never commit usage
    return res.status(err.status || 500).json({
      error: friendlyProviderError(err),
      code: err.status === 429 ? 'image_rate_limit' : 'image_failed',
      quotaCharged: false,
    });
  }
});

// ——— Files ———
app.post('/api/upload', authRequired, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
    const file = req.file;
    const url = `/uploads/${file.filename}`;
    const mime = file.mimetype || '';
    let analysis = { type: 'file', text: null, vision: false };

    if (mime.startsWith('image/')) {
      analysis.type = 'image';
      analysis.vision = true;
      const buf = fs.readFileSync(file.path);
      // ~1.5MB base64 payload cap — large iPhone photos blow Groq OTPM/context
      if (buf.length > 1.5 * 1024 * 1024) {
        return res.status(413).json({
          error: 'Image trop lourde. Réessaie — Qoria compresse automatiquement; si ça continue, choisis une photo plus petite.',
          code: 'image_too_large',
        });
      }
      const outMime = mime === 'image/jpg' ? 'image/jpeg' : mime;
      const b64 = `data:${outMime};base64,${buf.toString('base64')}`;
      return res.json({ ok: true, url, mime: outMime, name: file.originalname, size: file.size, dataUrl: b64, analysis });
    }

    if (mime === 'text/plain' || file.originalname.endsWith('.txt') || file.originalname.endsWith('.md')) {
      const text = fs.readFileSync(file.path, 'utf8').slice(0, 80000);
      analysis.type = 'text';
      analysis.text = text;
      return res.json({ ok: true, url, mime, name: file.originalname, size: file.size, analysis });
    }

    if (mime === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      try {
        const pdfParse = require('pdf-parse');
        const buf = fs.readFileSync(file.path);
        const parsed = await pdfParse(buf);
        analysis.type = 'pdf';
        analysis.text = (parsed.text || '').slice(0, 80000);
        analysis.pages = parsed.numpages;
      } catch (e) {
        analysis.type = 'pdf';
        analysis.text = null;
        analysis.error = 'Extraction PDF indisponible: ' + e.message;
      }
      return res.json({ ok: true, url, mime, name: file.originalname, size: file.size, analysis });
    }

    return res.json({ ok: true, url, mime, name: file.originalname, size: file.size, analysis: { type: 'binary', text: null } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Échec téléversement' });
  }
});

// ——— Memory ———
app.get('/api/memory', authRequired, (req, res) => {
  res.json({ memories: memoriesFor(req.user.id) });
});

app.post('/api/memory', authRequired, (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'texte requis' });
  const data = db.load();
  const mem = { id: uuidv4(), userId: req.user.id, text: text.slice(0, 500), createdAt: new Date().toISOString() };
  data.memories.push(mem);
  // cap 50
  const mine = data.memories.filter((m) => m.userId === req.user.id);
  if (mine.length > 50) {
    const drop = mine.slice(0, mine.length - 50).map((m) => m.id);
    data.memories = data.memories.filter((m) => !drop.includes(m.id));
  }
  db.save(data);
  res.json({ ok: true, memory: mem });
});

app.delete('/api/memory/:id', authRequired, (req, res) => {
  const data = db.load();
  data.memories = data.memories.filter((m) => !(m.id === req.params.id && m.userId === req.user.id));
  db.save(data);
  res.json({ ok: true });
});

app.delete('/api/memory', authRequired, (req, res) => {
  const data = db.load();
  data.memories = data.memories.filter((m) => m.userId !== req.user.id);
  db.save(data);
  res.json({ ok: true });
});

// ——— Billing stub (Stripe Checkout) ———
app.post('/api/billing/checkout', authRequired, async (req, res) => {
  const secret = process.env.STRIPE_SECRET_KEY || '';
  const price = process.env.STRIPE_PRICE_ID || '';
  if (!secret || !price) {
    // Dev stub: flip plan locally with confirm flag
    if (req.body?.devUpgrade === true && secret.startsWith('sk_test')) {
      const data = db.load();
      const user = findUser(data, req.user.id);
      if (user) {
        user.plan = 'pro';
        db.save(data);
        const token = signUser(user);
        res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5 });
        return res.json({
          ok: true,
          stub: true,
          message: 'Mode test : compte passé en Pro (pas de vrai paiement Stripe Price ID).',
          user: publicUser(user),
        });
      }
    }
    return res.json({
      ok: false,
      stub: true,
      message:
        'Stripe Checkout non configuré. Ajoute STRIPE_SECRET_KEY + STRIPE_PRICE_ID (prix ~20 $/mois CAD). Aucun débit réel sans ces clés.',
      priceHintCad: 20,
    });
  }
  try {
    const origin = req.headers.origin || `http://localhost:${PORT}`;
    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('success_url', `${origin}/app.html?upgraded=1`);
    params.set('cancel_url', `${origin}/pricing.html?canceled=1`);
    params.set('line_items[0][price]', price);
    params.set('line_items[0][quantity]', '1');
    params.set('client_reference_id', req.user.id);
    params.set('customer_email', req.user.email || '');
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(secret + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.error?.message || 'Stripe erreur' });
    return res.json({ ok: true, url: data.url, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Dev-only: mark Pro when stripe test key present and no price id
app.post('/api/billing/dev-pro', authRequired, (req, res) => {
  const secret = process.env.STRIPE_SECRET_KEY || '';
  if (!secret.startsWith('sk_test')) {
    return res.status(403).json({ error: 'Réservé au mode test Stripe' });
  }
  const data = db.load();
  const user = findUser(data, req.user.id);
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  user.plan = req.body?.plan === 'free' ? 'free' : 'pro';
  db.save(data);
  const token = signUser(user);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5 });
  res.json({ ok: true, user: publicUser(user) });
});

// Video — real E2E when a paid provider key is set; honest FR paywall otherwise.
// Free 1/day · Pro unlimited. No free excellent path exists (Pollinations/fal/Runway/Luma/Sora all need keys).
app.post('/api/video', authRequired, async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const data = db.load();
  const user = findUser(data, req.user.id);
  if (!user) return res.status(401).json({ error: 'Session invalide' });

  const vstat = videoStatus();
  if (!vstat.configured) {
    const lims = limitsFor(user);
    const msg = isPro(user)
      ? 'Vidéo excellente nécessite une clé payante (FAL_KEY, POLLINATIONS_API_KEY + Pollen, RUNWAYML_API_SECRET, LUMA_API_KEY ou Sora). Aucun chemin gratuit viable pour une vraie vidéo.'
      : 'Vidéo : pas encore de fournisseur branché. Free = 1 courte / jour · Pro = plafond hebdo généreux, dès qu’une clé (fal / Pollinations / Runway / Luma / Sora) est configurée. Aucun chemin gratuit excellent.';
    return res.status(501).json({
      ok: false,
      stub: true,
      code: 'video_unavailable',
      error: msg,
      message: msg,
      prompt,
      limits: lims,
      freeDaily: FREE_VIDEOS,
      proWeeklyVideos: PRO_WEEKLY_VIDEOS,
      proUnlimited: false,
      needsKey: true,
      providers: ['fal', 'pollinations', 'runway', 'luma', 'openai'],
      costHints: {
        fal: '~0,05–0,10 $/clip (Wan turbo)',
        pollinations: '~0,05 $/clip (Wan 2.2 fast, Pollen)',
        runway: '~0,25–0,50 $/clip 5s',
        luma: '~0,20–1 $/clip',
        openai: 'Sora — crédits OpenAI',
      },
      pricingUrl: '/pricing.html',
    });
  }

  const checked = checkUsage(req.user.id, 'videos');
  if (!checked.ok) {
    const status = checked.code === 'no_user' ? 401 : checked.code === 'pro_required' ? 403 : 429;
    return res.status(status).json({
      error: checked.error,
      code: checked.code,
      usage: checked.usage,
      limit: checked.limit,
      limits: checked.limits,
      pricingUrl: '/pricing.html',
    });
  }

  try {
    const out = await generateVideo(prompt);
    if (!out?.ok || !out.url) {
      return res.status(502).json({
        ok: false,
        error: 'Génération vidéo échouée — ton quota n’a pas été consommé. Réessaie.',
        code: 'video_failed',
      });
    }
    const committed = commitUsage(req.user.id, 'videos');
    return res.json({
      ok: true,
      url: out.url,
      remoteUrl: out.remoteUrl || null,
      provider: out.provider,
      model: out.model,
      costHint: out.costHint || vstat.costHint,
      enrichedPrompt: out.enrichedPrompt,
      usage: committed.usage,
      limits: committed.limits,
    });
  } catch (err) {
    console.error('[Qoria] video:', err.message);
    const status = err.status === 501 ? 501 : err.status === 402 ? 402 : err.status === 429 ? 429 : 502;
    return res.status(status).json({
      ok: false,
      error: err.message || 'Génération vidéo échouée',
      code: err.code || (status === 501 ? 'video_unavailable' : 'video_failed'),
      stub: Boolean(err.stub),
      pricingUrl: '/pricing.html',
    });
  }
});

// SPA-ish routes
app.get('/app', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/pricing', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'pricing.html')));

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n  ◆  Qoria prêt → http://localhost:${PORT}`);
  console.log('  →  Smoke providers…');
  try {
    const results = await providers.smokeAll();
    for (const [id, s] of Object.entries(results)) {
      console.log(`     ${id}: ${s.status}`);
    }
  } catch (e) {
    console.warn('  smoke failed', e.message);
  }
  console.log('');
});
