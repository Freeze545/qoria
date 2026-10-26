(() => {
  const token = () => localStorage.getItem('qoria_token') || '';
  const headers = () => {
    const h = { 'Content-Type': 'application/json' };
    if (token()) h.Authorization = 'Bearer ' + token();
    return h;
  };

  let user = null;
  let conversationId = null;
  let mode = 'chat';
  let attach = null; // { kind, dataUrl, text, name }
  let busy = false;
  let caps = { video: false };
  let limits = { images: 3, videos: 1, ensemble: 0, chat: null };
  const history = []; // {role, content} for API

  const $ = (id) => document.getElementById(id);
  const messagesEl = $('messages');
  const emptyEl = $('empty');

  function clearAttach() {
    attach = null;
    const preview = $('attachPreview');
    if (preview) preview.hidden = true;
    const thumb = $('attachThumb');
    if (thumb) {
      thumb.removeAttribute('src');
      thumb.style.display = 'none';
    }
    const label = $('attachLabel');
    if (label) label.textContent = '';
    const file = $('fileInput');
    if (file) file.value = '';
  }

  function showProGate(message) {
    const bg = $('proGate');
    const msg = $('proGateMsg');
    if (msg) msg.textContent = message || 'Fonction Pro — passe à Pro pour débloquer';
    if (bg) bg.classList.add('show');
  }
  function hideProGate() {
    $('proGate')?.classList.remove('show');
  }

  async function api(path, opts = {}) {
    const r = await fetch(path, {
      credentials: 'include',
      ...opts,
      headers: { ...headers(), ...(opts.headers || {}) },
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) {
      localStorage.removeItem('qoria_token');
      try { alert(d.error || 'Session expirée — reconnecte-toi.'); } catch {}
      location.href = '/login.html';
      throw new Error(d.error || 'Non connecté');
    }
    if (!r.ok) {
      const err = new Error(d.error || ('Erreur ' + r.status));
      err.code = d.code;
      err.payload = d;
      err.status = r.status;
      throw err;
    }
    return d;
  }

  async function ensureAuth() {
    try {
      const d = await api('/api/auth/me');
      user = d.user;
      const plan = (user.plan || 'free').toUpperCase();
      const chip = $('planChip');
      if (chip) {
        chip.textContent = plan;
        chip.classList.toggle('pro', plan === 'PRO');
      }
      if (d.limits) limits = d.limits;
      updateUsage(d.usage, d.limits);
      const cta = $('proCtaBar');
      if (cta) cta.classList.toggle('show', plan !== 'PRO');
      return true;
    } catch {
      location.href = '/login.html';
      return false;
    }
  }

  function updateUsage(usage, lims) {
    const u = usage || {};
    if (lims) limits = lims;
    const plan = (user?.plan || 'free');
    const isPro = plan === 'pro';
    let line;
    if (isPro) {
      // Soft: don't show harsh Free-style counters. Pro feels generous.
      line = 'Pro · plafond hebdo généreux (reset lundi)';
    } else {
      const imgUsed = u.images || 0;
      const vidUsed = u.videos || 0;
      const imgLim = limits.images ?? 3;
      const vidLim = limits.videos ?? 1;
      line = `Images : ${imgUsed}/${imgLim} · Vidéo : ${vidUsed}/${vidLim} · Free`;
    }
    if ($('usageChip')) $('usageChip').textContent = line;
    if ($('usageLine')) {
      $('usageLine').textContent = isPro
        ? line
        : line + ' · chat illimité · Pro = plus généreux';
    }
  }

  async function loadConvs() {
    const d = await api('/api/conversations');
    const list = $('convList');
    list.innerHTML = '';
    (d.conversations || []).forEach((c) => {
      const b = document.createElement('button');
      b.className = 'conv-item' + (c.id === conversationId ? ' active' : '');
      b.innerHTML = `${escapeHtml(c.title || 'Conversation')}<small>${new Date(c.updatedAt || c.createdAt).toLocaleString('fr-CA')}</small>`;
      b.onclick = () => openConv(c.id);
      list.appendChild(b);
    });
  }

  async function openConv(id) {
    conversationId = id;
    const d = await api('/api/conversations/' + id + '/messages');
    history.length = 0;
    messagesEl.innerHTML = '';
    emptyEl.style.display = 'none';
    (d.messages || []).forEach((m) => {
      pushBubble(m.role, m.content, { model: m.model, provider: m.provider, skipHistory: false });
    });
    if (!(d.messages || []).length) {
      messagesEl.appendChild(emptyEl);
      emptyEl.style.display = '';
    }
    closeSidebar();
    loadConvs();
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function safeMediaUrl(url) {
    const s = String(url || '');
    if (/^\/uploads\//.test(s)) return s;
    if (/^data:image\//.test(s)) return s;
    try {
      const u = new URL(s, location.origin);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch {}
    return null;
  }

  function renderRich(el, text) {
    // Combined tokenizer: [video](url) | ![alt](url) | bare pollinations URL
    const re = /\[video\]\(([^)\s]+)\)|!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/uploads\/[^\s)]+|data:image\/[^\s)]+)\)|(https?:\/\/image\.pollinations\.ai\/[^\s<>"')]+)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1]) {
        const src = safeMediaUrl(m[1]);
        if (src) {
          const v = document.createElement('video');
          v.className = 'gen video';
          v.src = src;
          v.controls = true;
          v.playsInline = true;
          v.preload = 'metadata';
          el.appendChild(v);
        } else {
          el.appendChild(document.createTextNode(m[0]));
        }
      } else {
        const url = m[3] || m[4];
        const src = safeMediaUrl(url);
        if (src) {
          const img = document.createElement('img');
          img.className = 'gen';
          img.src = src;
          img.alt = m[2] || 'image';
          img.loading = 'lazy';
          el.appendChild(img);
        } else {
          el.appendChild(document.createTextNode(m[0]));
        }
      }
      last = re.lastIndex;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }

  function pushBubble(role, content, meta = {}) {
    if (emptyEl.parentNode) emptyEl.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (typeof content === 'string') {
      if (meta.image && /^(data:image\/|https?:|\/)/.test(meta.image)) {
        const im = document.createElement('img');
        im.className = 'gen user-img';
        im.src = meta.image;
        im.alt = 'image envoyée';
        bubble.appendChild(im);
      }
      if (meta.video && safeMediaUrl(meta.video)) {
        const v = document.createElement('video');
        v.className = 'gen video';
        v.src = safeMediaUrl(meta.video);
        v.controls = true;
        v.playsInline = true;
        v.preload = 'metadata';
        bubble.appendChild(v);
      }
      renderRich(bubble, content);
    } else {
      bubble.textContent = String(content);
    }
    wrap.appendChild(bubble);
    if (meta.model || meta.provider) {
      const m = document.createElement('div');
      m.className = 'meta';
      m.textContent = [meta.provider, meta.model].filter(Boolean).join(' · ');
      wrap.appendChild(m);
    }
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (!meta.skipHistory) {
      history.push({ role, content: typeof content === 'string' ? content : String(content) });
    }
  }

  async function newChat() {
    conversationId = null;
    history.length = 0;
    messagesEl.innerHTML = '';
    messagesEl.appendChild(emptyEl);
    emptyEl.style.display = '';
    closeSidebar();
  }

  function isProUser() {
    return (user?.plan || 'free') === 'pro';
  }

  function selectMode(next) {
    // Ensemble is Pro-only — warn immediately
    if (next === 'ensemble' && !isProUser()) {
      showProGate('Fonction Pro — passe à Pro pour débloquer');
      return false;
    }
    // Video: if provider not configured, honest bientôt (not a silent fail)
    if (next === 'video' && !caps.video) {
      showProGate(
        isProUser()
          ? 'Vidéo excellente : clé payante requise (fal ≈0,05–0,10$/clip, Pollinations Pollen, Runway, Luma ou Sora). Aucun chemin gratuit viable.'
          : 'Vidéo : Free = 1/jour · Pro = plafond hebdo généreux, dès qu’une clé fournisseur est branchée. Pas de chemin gratuit excellent — fal / Pollinations / Runway / Luma / Sora.'
      );
      return false;
    }
    document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === next));
    mode = next;
    return true;
  }

  document.querySelectorAll('.mode').forEach((btn) => {
    btn.onclick = () => selectMode(btn.dataset.mode);
  });

  function openSidebar() {
    $('sidebar').classList.add('mobile-open');
    $('overlay').classList.add('show');
  }
  function closeSidebar() {
    $('sidebar').classList.remove('mobile-open');
    $('overlay').classList.remove('show');
  }
  $('btnMenu').onclick = openSidebar;
  $('overlay').onclick = closeSidebar;
  $('btnNew').onclick = newChat;
  $('btnPricing').onclick = () => (location.href = '/pricing.html');
  $('btnLogout').onclick = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    localStorage.removeItem('qoria_token');
    location.href = '/';
  };

  $('btnProGateClose')?.addEventListener('click', hideProGate);
  $('btnProGatePricing')?.addEventListener('click', () => { location.href = '/pricing.html'; });
  $('proGate')?.addEventListener('click', (e) => { if (e.target.id === 'proGate') hideProGate(); });

  // Compress / resize large images before upload (iPhone photos blow OTPM/context)
  function compressImageFile(file, maxSide = 1280, quality = 0.72) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) return resolve(file);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            const name = (file.name || 'photo.jpg').replace(/\.\w+$/, '') + '.jpg';
            resolve(new File([blob], name, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // attach
  $('btnAttach').onclick = () => $('fileInput').click();
  $('btnClearAttach').onclick = () => clearAttach();
  $('fileInput').onchange = async () => {
    const raw = $('fileInput').files?.[0];
    if (!raw) return;
    let file = raw;
    try {
      if (raw.type.startsWith('image/')) file = await compressImageFile(raw);
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        headers: token() ? { Authorization: 'Bearer ' + token() } : {},
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Upload échoué');
      if (d.analysis?.vision && d.dataUrl) {
        attach = { kind: 'image', dataUrl: d.dataUrl, name: d.name };
        $('attachThumb').src = d.dataUrl;
        $('attachThumb').style.display = '';
      } else if (d.analysis?.text) {
        attach = { kind: 'text', text: d.analysis.text, name: d.name, type: d.analysis.type };
        $('attachThumb').style.display = 'none';
      } else {
        attach = { kind: 'file', name: d.name, url: d.url };
        $('attachThumb').style.display = 'none';
      }
      $('attachLabel').textContent = d.name || 'Fichier';
      $('attachPreview').hidden = false;
    } catch (e) {
      alert(e.message);
      clearAttach();
    }
    $('fileInput').value = '';
  };

  // mic
  let recognizing = false;
  let recognition = null;
  $('btnMic').onclick = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Reconnaissance vocale non supportée sur ce navigateur (limite Safari fréquente).');
      return;
    }
    if (recognizing && recognition) {
      recognition.stop();
      return;
    }
    recognition = new SR();
    recognition.lang = 'fr-CA';
    recognition.interimResults = true;
    recognition.onresult = (ev) => {
      let text = '';
      for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript;
      $('input').value = text;
    };
    recognition.onerror = () => { recognizing = false; $('btnMic').style.outline = ''; };
    recognition.onend = () => { recognizing = false; $('btnMic').style.outline = ''; };
    recognizing = true;
    $('btnMic').style.outline = '2px solid #a855f7';
    recognition.start();
  };

  function handleApiError(err) {
    const code = err.code || err.payload?.code;
    if (code === 'pro_required' || err.status === 403) {
      showProGate(err.message || 'Fonction Pro — passe à Pro pour débloquer');
      return;
    }
    if (code === 'weekly_limit' || code === 'ensemble_limit') {
      const title = $('proGateTitle');
      if (title) title.textContent = 'Plafond hebdo';
      showProGate(err.message || 'Limite hebdo Pro atteinte — revient lundi');
      return;
    }
    if (code === 'image_limit' || code === 'video_limit') {
      showProGate(err.message || 'Limite Free atteinte — Pro offre un plafond hebdo généreux');
      return;
    }
    if (code === 'video_unavailable' || code === 'video_not_implemented') {
      showProGate(err.message || 'Vidéo : clé fournisseur payante requise. Free = 1/jour · Pro = plafond hebdo généreux.');
      return;
    }
    pushBubble('assistant', '⚠️ ' + (err.message || 'Erreur'), { skipHistory: true });
  }

  // send
  $('composer').onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = $('input').value.trim();
    if (!text && !attach && mode !== 'video') return;

    // Gate again at send time for ensemble / video
    if (mode === 'ensemble' && !isProUser()) {
      showProGate('Fonction Pro — passe à Pro pour débloquer');
      return;
    }
    if (mode === 'video' && !caps.video) {
      showProGate(
        isProUser()
          ? 'Vidéo excellente : clé payante requise (fal / Pollinations / Runway / Luma / Sora).'
          : 'Vidéo : Free = 1/jour · Pro = plafond hebdo généreux une fois branchée. Pas de chemin gratuit excellent.'
      );
      return;
    }

    busy = true;
    $('btnSend').disabled = true;

    try {
      if (mode === 'video') {
        const prompt = text || 'une courte vidéo cinématique';
        pushBubble('user', '🎬 ' + prompt);
        $('input').value = '';
        clearAttach();
        const thinking = document.createElement('div');
        thinking.className = 'msg assistant';
        thinking.innerHTML = '<div class="bubble">Génération de la vidéo… (peut prendre 1–2 min)</div>';
        messagesEl.appendChild(thinking);
        try {
          const d = await api('/api/video', {
            method: 'POST',
            body: JSON.stringify({ prompt }),
          });
          thinking.remove();
          if (d.usage) updateUsage(d.usage, d.limits);
          if (d.url) {
            const note = d.costHint ? `\n\n_${d.provider || 'vidéo'} · ${d.costHint}_` : '';
            pushBubble('assistant', `Voici ta vidéo:\n\n[video](${d.url})${note}`, {
              model: d.model,
              provider: d.provider,
              video: d.url,
            });
            history.push({ role: 'assistant', content: 'Vidéo générée: ' + d.url });
          } else {
            pushBubble('assistant', d.message || d.error || 'Vidéo non disponible.', { skipHistory: true });
          }
        } catch (err) {
          thinking.remove();
          if (err.payload?.usage) updateUsage(err.payload.usage, err.payload.limits);
          handleApiError(err);
        }
        return;
      }

      if (mode === 'image') {
        const prompt = text || 'une image abstraite indigo et violet';
        pushBubble('user', '🖼️ ' + prompt);
        $('input').value = '';
        clearAttach();
        const thinking = document.createElement('div');
        thinking.className = 'msg assistant';
        thinking.innerHTML = '<div class="bubble">Génération de l’image…</div>';
        messagesEl.appendChild(thinking);
        try {
          const d = await api('/api/image', {
            method: 'POST',
            body: JSON.stringify({ prompt, size: '1024x1024' }),
          });
          thinking.remove();
          const url = d.url || d.b64;
          if (!url) {
            pushBubble('assistant', 'Pas d’image renvoyée — ton quota n’a pas été consommé. Réessaie.');
          } else {
            const note = d.qualityNote ? `\n\n_${d.qualityNote}_` : '';
            pushBubble('assistant', `Voici ton image:\n\n![image](${url})${note}`, {
              model: d.model,
              provider: d.provider,
            });
            history.push({ role: 'assistant', content: 'Image générée: ' + (d.url || '[embedded]') });
          }
          if (d.usage) updateUsage(d.usage, d.limits);
        } catch (err) {
          thinking.remove();
          if (err.payload?.usage) updateUsage(err.payload.usage, err.payload.limits);
          handleApiError(err);
        }
        return;
      }

      // Build multimodal content
      let content;
      if (attach?.kind === 'image') {
        content = [
          { type: 'text', text: text || 'Analyse cette image.' },
          { type: 'image_url', image_url: { url: attach.dataUrl } },
        ];
        pushBubble('user', text || 'Analyse cette image.', { skipHistory: true, image: attach.dataUrl });
        history.push({ role: 'user', content });
      } else if (attach?.kind === 'text') {
        const combined = `${text || 'Analyse ce document.'}\n\n---\nFichier (${attach.name}):\n${attach.text.slice(0, 60000)}`;
        content = combined;
        pushBubble('user', text || ('Fichier: ' + attach.name));
        history.push({ role: 'user', content });
      } else {
        content = text;
        pushBubble('user', text);
        history.push({ role: 'user', content });
      }
      clearAttach();
      $('input').value = '';

      const pending = document.createElement('div');
      pending.className = 'msg assistant';
      pending.innerHTML = '<div class="bubble">Qoria réfléchit…</div>';
      messagesEl.appendChild(pending);

      const payloadMessages = history.map((m) => ({ role: m.role, content: m.content }));

      try {
        const d = await api('/api/chat', {
          method: 'POST',
          body: JSON.stringify({
            messages: payloadMessages,
            conversationId,
            mode: 'chat',
            ensemble: mode === 'ensemble',
          }),
        });
        pending.remove();
        conversationId = d.conversationId || conversationId;
        const last = history[history.length - 1];
        if (last && last.role === 'assistant') history.pop();
        pushBubble('assistant', d.content, { model: d.model, provider: d.provider });
        if (d.usage) updateUsage(d.usage, d.limits);
        loadConvs();
      } catch (err) {
        pending.remove();
        if (err.payload?.usage) updateUsage(err.payload.usage, err.payload.limits);
        handleApiError(err);
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      busy = false;
      $('btnSend').disabled = false;
    }
  };

  // textarea enter
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('composer').requestSubmit();
    }
  });

  // memory modal
  async function refreshMem() {
    const d = await api('/api/memory');
    const list = $('memList');
    list.innerHTML = '';
    (d.memories || []).forEach((m) => {
      const row = document.createElement('div');
      row.className = 'mem-item';
      row.innerHTML = `<span>${escapeHtml(m.text)}</span>`;
      const del = document.createElement('button');
      del.className = 'btn';
      del.textContent = '×';
      del.onclick = async () => {
        await api('/api/memory/' + m.id, { method: 'DELETE' });
        refreshMem();
      };
      row.appendChild(del);
      list.appendChild(row);
    });
    if (!(d.memories || []).length) list.innerHTML = '<p style="color:var(--muted);font-size:.85rem">Aucune mémoire.</p>';
  }
  function openMem() { $('memModal').classList.add('show'); refreshMem(); }
  function closeMem() { $('memModal').classList.remove('show'); }
  $('btnMemory').onclick = openMem;
  $('btnMemoryTop').onclick = openMem;
  $('btnCloseMem').onclick = closeMem;
  $('btnAddMem').onclick = async () => {
    const text = $('memInput').value.trim();
    if (!text) return;
    await api('/api/memory', { method: 'POST', body: JSON.stringify({ text }) });
    $('memInput').value = '';
    refreshMem();
  };
  $('btnClearMem').onclick = async () => {
    if (!confirm('Effacer toute la mémoire ?')) return;
    await api('/api/memory', { method: 'DELETE' });
    refreshMem();
  };

  // providers
  async function refreshProv() {
    const d = await api('/api/status');
    const list = $('provList');
    list.innerHTML = '';
    (d.providers || []).forEach((p) => {
      const row = document.createElement('div');
      row.className = 'prov-row';
      const st = p.connected ? '<span class="ok">connecté</span>' : `<span class="warn">${escapeHtml(p.status || 'clé manquante')}</span>`;
      row.innerHTML = `<span><strong>${escapeHtml(p.name)}</strong><br/><small style="color:var(--muted)">${escapeHtml(p.id)}</small></span><span>${st}</span>`;
      list.appendChild(row);
    });
  }
  $('btnProviders').onclick = () => { $('provModal').classList.add('show'); refreshProv(); };
  $('btnCloseProv').onclick = () => $('provModal').classList.remove('show');
  $('btnSmoke').onclick = async () => {
    $('btnSmoke').textContent = 'Test…';
    await api('/api/providers/smoke', { method: 'POST', body: '{}' });
    await refreshProv();
    $('btnSmoke').textContent = 'Relancer les tests';
  };


  // ——— Voice call (speech in → chat → TTS out) ———
  let callActive = false;
  let callRec = null;
  let callListening = false;

  function setCallUI(state, status, transcript) {
    const el = $('voiceCall');
    if (!el) return;
    el.classList.remove('listening', 'speaking');
    if (state) el.classList.add(state);
    if (status != null && $('voiceStatus')) $('voiceStatus').textContent = status;
    if (transcript != null && $('voiceTranscript')) $('voiceTranscript').textContent = transcript;
  }

  function stripForSpeech(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu, '')
      .replace(/[#>*_`~|\\^=<>{}\[\]•●▪►→←↑↓✓✔✗×÷§©®™°…]+/g, ' ')
      .replace(/^\s*[-+]\s+/gm, '')
      .replace(/\s*\n+\s*/g, '. ')
      .replace(/([.!?,;:])\s*[.]+/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
  }

  // Free browser TTS (Web Speech API). For a truly human voice, a paid TTS
  // (ElevenLabs / OpenAI TTS) would be required — see README "Voix".
  let bestVoice = null;
  function pickVoice() {
    const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    const fr = vs.filter((v) => /^fr/i.test(v.lang));
    if (!fr.length) return null;
    const score = (v) => {
      let s = 0;
      const n = v.name.toLowerCase();
      if (/premium|enhanced|améliorée|neural|natural|naturel/.test(n)) s += 100;
      if (/online|siri/.test(n)) s += 60;
      if (/google/.test(n)) s += 50;
      if (/samantha|thomas|amélie|amelie|audrey|aurélie|denise|sylvie|antoine|marie/.test(n)) s += 30;
      if (/fr[-_]ca/i.test(v.lang)) s += 15; else if (/fr[-_]fr/i.test(v.lang)) s += 10;
      if (/compact|espeak|robot|novelty/.test(n)) s -= 80;
      if (v.localService === false) s += 5;
      return s;
    };
    return fr.sort((a, b) => score(b) - score(a))[0];
  }
  if (window.speechSynthesis) {
    bestVoice = pickVoice();
    speechSynthesis.onvoiceschanged = () => { bestVoice = pickVoice(); };
  }

  // Split into short natural sentences; merge tiny fragments so it never sounds choppy.
  function splitForSpeech(text) {
    const parts = (text.match(/[^.!?;:]+[.!?;:]*/g) || [text]).map((x) => x.trim()).filter(Boolean);
    const out = [];
    for (const p of parts) {
      const subs = p.length > 160 ? p.split(/,\s+/).map((x, i, arr) => (i < arr.length - 1 ? x + ',' : x)) : [p];
      for (const sub of subs) {
        const last = out[out.length - 1];
        if (last && (sub.split(/\s+/).length < 4 || last.split(/\s+/).length < 4) && (last + ' ' + sub).length < 180) out[out.length - 1] = last + ' ' + sub;
        else out.push(sub);
      }
    }
    return out;
  }

  let speakToken = 0;
  function speakText(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      try { window.speechSynthesis.cancel(); } catch {}
      const clean = stripForSpeech(text);
      if (!clean) return resolve();
      const chunks = splitForSpeech(clean);
      const my = ++speakToken;
      bestVoice = bestVoice || pickVoice();
      setCallUI('speaking', 'Qoria parle…', clean.slice(0, 180));
      let i = 0;
      const next = () => {
        if (my !== speakToken || (typeof callActive !== 'undefined' && !callActive) || i >= chunks.length) return resolve();
        const u = new SpeechSynthesisUtterance(chunks[i++]);
        if (bestVoice) u.voice = bestVoice;
        u.lang = bestVoice ? bestVoice.lang : 'fr-CA';
        u.rate = 0.9;
        u.pitch = 1.0;
        u.volume = 1;
        const done = () => setTimeout(next, /[.!?]$/.test(u.text) ? 220 : 120);
        u.onend = done;
        u.onerror = done;
        window.speechSynthesis.speak(u);
      };
      next();
    });
  }

  async function voiceSend(text) {
    const cleaned = String(text || '').trim();
    if (!cleaned || !callActive) return;
    pushBubble('user', cleaned);
    history.push({ role: 'user', content: cleaned });
    setCallUI('speaking', 'Qoria réfléchit…', cleaned);
    try {
      const d = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          conversationId,
          mode: 'chat',
          ensemble: false,
          voice: true,
        }),
      });
      conversationId = d.conversationId || conversationId;
      pushBubble('assistant', d.content, { model: d.model, provider: d.provider });
      if (d.usage) updateUsage(d.usage, d.limits);
      loadConvs();
      await speakText(d.content);
    } catch (err) {
      handleApiError(err);
      await speakText(err.message || 'Une erreur est survenue.');
    }
  }

  function stopCallRecognition() {
    callListening = false;
    try { callRec && callRec.stop(); } catch {}
    callRec = null;
  }

  function startCallListen() {
    if (!callActive) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setCallUI('', 'Reconnaissance vocale non supportée sur ce navigateur.', '');
      return;
    }
    stopCallRecognition();
    callRec = new SR();
    callRec.lang = 'fr-CA';
    callRec.interimResults = true;
    callRec.continuous = false;
    let finalText = '';
    callRec.onstart = () => {
      callListening = true;
      setCallUI('listening', 'À toi — parle maintenant', '');
    };
    callRec.onresult = (ev) => {
      let interim = '';
      finalText = '';
      for (let i = 0; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setCallUI('listening', 'À toi — parle maintenant', finalText || interim);
    };
    callRec.onerror = () => {
      callListening = false;
      if (callActive) setTimeout(startCallListen, 400);
    };
    callRec.onend = async () => {
      callListening = false;
      const said = finalText.trim();
      if (!callActive) return;
      if (said) {
        await voiceSend(said);
      }
      if (callActive) startCallListen();
    };
    try { callRec.start(); } catch (e) {
      setTimeout(() => { if (callActive) startCallListen(); }, 500);
    }
  }

  function endVoiceCall() {
    callActive = false;
    stopCallRecognition();
    speakToken++; try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {}
    $('voiceCall')?.classList.remove('show', 'listening', 'speaking');
    $('btnVoiceCall')?.classList.remove('live');
  }

  function startVoiceCall() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Appel vocal non supporté sur ce navigateur (essaie Chrome).');
      return;
    }
    if (!window.speechSynthesis) {
      alert('Synthèse vocale non supportée sur ce navigateur.');
      return;
    }
    callActive = true;
    $('voiceCall')?.classList.add('show');
    $('btnVoiceCall')?.classList.add('live');
    setCallUI('listening', 'Dis bonjour à Qoria…', '');
    // Short greeting then listen
    speakText('Allô, c’est Qoria. Je t’écoute.').then(() => {
      if (callActive) startCallListen();
    });
  }

  $('btnVoiceCall')?.addEventListener('click', () => {
    if (callActive) endVoiceCall();
    else startVoiceCall();
  });
  $('btnEndCall')?.addEventListener('click', endVoiceCall);


  // Empty-state suggestion chips
  document.querySelectorAll('#emptySuggestions [data-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-prompt') || '';
      const input = $('input');
      if (!input) return;
      if (/^Génère une image/i.test(p)) {
        selectMode('image');
        input.value = p.replace(/^Génère une image\s*:\s*/i, '');
      } else {
        selectMode('chat');
        input.value = p;
      }
      input.focus();
      input.dispatchEvent(new Event('input'));
    });
  });

  // boot
  (async () => {
    if (!(await ensureAuth())) return;
    await loadConvs();
    try {
      const st = await api('/api/status');
      caps.video = Boolean(st.capabilities?.video || st.videoConfigured);
      const me = await api('/api/auth/me');
      if (me.limits) limits = me.limits;
      else if (st.limits) {
        limits = {
          images: st.limits.freeImages ?? 3,
          videos: st.limits.freeVideos ?? 1,
          ensemble: st.limits.proWeeklyEnsemble ?? st.limits.ensembleDaily ?? 10,
          chat: st.limits.proWeeklyMessages ?? null,
        };
      }
      updateUsage(me.usage, me.limits || limits);
    } catch {}
  })();
})();
