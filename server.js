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

const app = express();
const PORT = process.env.PORT || 3850;
const JWT_SECRET = process.env.JWT_SECRET || 'qoria-dev-insecure';
const FREE_DAILY = Number(process.env.FREE_DAILY_MESSAGES || 30);
const PRO_DAILY = Number(process.env.PRO_DAILY_MESSAGES || 500);
const ENSEMBLE_CAP = Number(process.env.ENSEMBLE_DAILY_CAP || 10);
const COOKIE = 'qoria_token';

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

const DEFAULT_SYSTEM = `Tu es Qoria, une intelligence artificielle généraliste utile, honnête et amicale.
Tu aides le grand public : études, travail, projets, vie quotidienne, code, écriture, analyse.
Réponds en français (québécois naturel) quand l'utilisateur écrit en français; sinon suis sa langue.
Sois clair, précis, et n'invente pas de faits. Refuse le contenu illégal ou clairement dangereux.
Tu fais partie du produit Qoria — ne renvoie pas l'utilisateur vers ChatGPT, Claude ou Gemini comme alternative.
Si tu analyses une image ou un fichier, décris ce qui est utile.`;

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
    if (!req.user) return res.status(401).json({ error: 'Connexion requise' });
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

function dailyLimit(user) {
  return (user?.plan === 'pro') ? PRO_DAILY : FREE_DAILY;
}

function checkAndIncUsage(userId, kind = 'messages') {
  const data = db.load();
  const user = findUser(data, userId);
  if (!user) return { ok: false, error: 'Utilisateur introuvable' };
  const usage = db.getUsage(data, userId);
  const limit = kind === 'ensemble'
    ? (user.plan === 'pro' ? ENSEMBLE_CAP : 0)
    : dailyLimit(user);
  const count = usage[kind] || 0;
  if (kind === 'ensemble' && user.plan !== 'pro') {
    return { ok: false, error: 'Le mode ensemble est réservé à Pro.', usage, limit: 0 };
  }
  if (count >= limit) {
    return {
      ok: false,
      error: kind === 'ensemble'
        ? `Limite ensemble atteinte (${ENSEMBLE_CAP}/jour).`
        : `Limite quotidienne atteinte (${limit} messages). Passe à Pro pour continuer.`,
      usage,
      limit,
    };
  }
  usage[kind] = count + 1;
  db.setUsage(data, userId, usage);
  db.save(data);
  return { ok: true, usage, limit };
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
      video: Boolean(process.env.VIDEO_API_KEY && process.env.VIDEO_API_URL),
      vision: true,
      voice: true,
      files: true,
      memory: true,
      search: Boolean(process.env.TAVILY_API_KEY),
      ensemble: true,
    },
    limits: { freeDaily: FREE_DAILY, proDaily: PRO_DAILY, ensembleDaily: ENSEMBLE_CAP },
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
    usage,
    limit: dailyLimit(user),
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
      temperature = 0.7,
    } = req.body || {};

    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages requis' });
    }

    const inc = checkAndIncUsage(req.user.id, ensemble ? 'ensemble' : 'messages');
    if (!inc.ok) return res.status(429).json({ error: inc.error, usage: inc.usage, limit: inc.limit });

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

    const system = buildSystem(req.user.id, searchNote);
    const apiMessages = [
      { role: 'system', content: system },
      ...messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content != null)
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    const result = await routeChat({
      messages: apiMessages,
      task,
      temperature,
      max_tokens: 2048,
      ensemble: Boolean(ensemble),
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

    return res.json({
      role: 'assistant',
      content: result.content,
      model: result.model,
      provider: result.route?.provider || result.provider,
      route: result.route || null,
      ensemble: Boolean(result.ensemble),
      task,
      conversationId: convId,
      usage: inc.usage,
      limit: inc.limit,
    });
  } catch (err) {
    console.error('[Qoria] chat error:', err.message);
    const status = err.status || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: err.message || 'Erreur IA',
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
    const usage = db.getUsage(data, req.user.id);
    const lim = dailyLimit(user);
    if ((usage.images || 0) >= lim) {
      return res.status(429).json({ error: 'Limite images quotidienne atteinte', usage, limit: lim });
    }
    usage.images = (usage.images || 0) + 1;
    db.setUsage(data, req.user.id, usage);
    db.save(data);

    const out = await generateImage(prompt, { size: req.body?.size || '1024x1024' });
    return res.json(out);
  } catch (err) {
    console.error('[Qoria] image:', err.message);
    return res.status(err.status || 500).json({ error: err.message || 'Erreur image' });
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
      // Return data URL hint for client to include in multimodal message
      const buf = fs.readFileSync(file.path);
      const b64 = `data:${mime};base64,${buf.toString('base64')}`;
      return res.json({ ok: true, url, mime, name: file.originalname, size: file.size, dataUrl: b64, analysis });
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

// Video stub
app.post('/api/video', authRequired, (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!process.env.VIDEO_API_KEY || !process.env.VIDEO_API_URL) {
    return res.json({
      ok: false,
      stub: true,
      message: 'Vidéo non branchée. Ajoute VIDEO_API_KEY + VIDEO_API_URL pour activer.',
      prompt,
    });
  }
  return res.status(501).json({ error: 'Hook vidéo générique à compléter pour ton fournisseur' });
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
