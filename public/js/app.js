(() => {
  const token = () => localStorage.getItem('qoria_token') || '';
  const uiLang = () => {
    if (window.QoriaI18n && typeof QoriaI18n.getLang === 'function') {
      const l = QoriaI18n.getLang();
      if (l === 'en' || l === 'fr') return l;
    }
    return 'fr';
  };

  const headers = () => {
    const h = { 'Content-Type': 'application/json', 'X-Qoria-Lang': uiLang() };
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

  const t = (key, vars) => (window.QoriaI18n && QoriaI18n.t(key, vars)) || key;
  const uiLocale = () => (window.QoriaI18n && QoriaI18n.localeTag()) || (navigator.language || 'fr');
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
    if (msg) msg.textContent = message || t('js.proGate.default');
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
      try { alert(d.error || t('js.sessionExpired')); } catch {}
      location.href = '/login.html';
      throw new Error(d.error || t('js.notLoggedIn'));
    }
    if (!r.ok) {
      const err = new Error(d.error || t('js.errorStatus', { n: r.status }));
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
      line = t('js.usage.pro');
    } else {
      const imgUsed = u.images || 0;
      const vidUsed = u.videos || 0;
      const imgLim = limits.images ?? 3;
      const vidLim = limits.videos ?? 1;
      line = t('js.usage.free', { img: imgUsed, imgLim, vid: vidUsed, vidLim });
    }
    if ($('usageChip')) $('usageChip').textContent = line;
    if ($('usageLine')) {
      $('usageLine').textContent = isPro
        ? line
        : line + t('js.usage.freeExtra');
    }
  }

  async function loadConvs() {
    const d = await api('/api/conversations');
    const list = $('convList');
    list.innerHTML = '';
    const convs = d.conversations || [];
    if (!convs.length) {
      const empty = document.createElement('div');
      empty.className = 'conv-empty';
      empty.textContent = t('js.conv.empty');
      list.appendChild(empty);
      return;
    }
    const loc = uiLocale();
    convs.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'conv-item' + (c.id === conversationId ? ' active' : '');
      b.innerHTML = `${escapeHtml(c.title || t('js.conv.fallback'))}<small>${new Date(c.updatedAt || c.createdAt).toLocaleString(loc)}</small>`;
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
        im.alt = t('js.img.sent');
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
      showProGate(t('js.proGate.default'));
      return false;
    }
    // Video: if provider not configured, honest bientôt (not a silent fail)
    if (next === 'video' && !caps.video) {
      showProGate(
        isProUser()
          ? t('js.video.proNeedKey')
          : t('js.video.freeNeedKey')
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
        headers: {
          'X-Qoria-Lang': uiLang(),
          ...(token() ? { Authorization: 'Bearer ' + token() } : {}),
        },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t('js.upload.fail'));
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
      $('attachLabel').textContent = d.name || t('js.file');
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
      alert(t('js.speech.unsupported'));
      return;
    }
    if (recognizing && recognition) {
      recognition.stop();
      return;
    }
    recognition = new SR();
    recognition.lang = preferredLang();
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
      showProGate(err.message || t('js.proGate.default'));
      return;
    }
    if (code === 'weekly_limit' || code === 'ensemble_limit') {
      const title = $('proGateTitle');
      if (title) title.textContent = t('js.weeklyCap');
      showProGate(err.message || t('js.weeklyLimit'));
      return;
    }
    if (code === 'image_limit' || code === 'video_limit') {
      showProGate(err.message || t('js.freeLimit'));
      return;
    }
    if (code === 'video_unavailable' || code === 'video_not_implemented') {
      showProGate(err.message || t('js.video.needPaid'));
      return;
    }
    pushBubble('assistant', '⚠️ ' + (err.message || t('js.error')), { skipHistory: true });
  }

  // send
  $('composer').onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = $('input').value.trim();
    if (!text && !attach && mode !== 'video') return;

    // Gate again at send time for ensemble / video
    if (mode === 'ensemble' && !isProUser()) {
      showProGate(t('js.proGate.default'));
      return;
    }
    if (mode === 'video' && !caps.video) {
      showProGate(
        isProUser()
          ? t('js.video.proNeedKeyShort')
          : t('js.video.freeNeedKeyShort')
      );
      return;
    }

    busy = true;
    $('btnSend').disabled = true;

    try {
      if (mode === 'video') {
        const prompt = text || t('js.video.defaultPrompt');
        pushBubble('user', '🎬 ' + prompt);
        $('input').value = '';
        clearAttach();
        const thinking = document.createElement('div');
        thinking.className = 'msg assistant';
        thinking.innerHTML = '<div class="bubble">' + t('js.video.thinking') + '</div>';
        messagesEl.appendChild(thinking);
        try {
          const d = await api('/api/video', {
            method: 'POST',
            body: JSON.stringify({ prompt }),
          });
          thinking.remove();
          if (d.usage) updateUsage(d.usage, d.limits);
          if (d.url) {
            const note = d.costHint ? `\n\n_${d.provider || 'video'} · ${d.costHint}_` : '';
            pushBubble('assistant', `${t('js.video.here')}\n\n[video](${d.url})${note}`, {
              model: d.model,
              provider: d.provider,
              video: d.url,
            });
            history.push({ role: 'assistant', content: t('js.video.generated') + d.url });
          } else {
            pushBubble('assistant', d.message || d.error || t('js.video.unavailable'), { skipHistory: true });
          }
        } catch (err) {
          thinking.remove();
          if (err.payload?.usage) updateUsage(err.payload.usage, err.payload.limits);
          handleApiError(err);
        }
        return;
      }

      if (mode === 'image') {
        const prompt = text || t('js.image.defaultPrompt');
        pushBubble('user', '🖼️ ' + prompt);
        $('input').value = '';
        clearAttach();
        const thinking = document.createElement('div');
        thinking.className = 'msg assistant';
        thinking.innerHTML = '<div class="bubble">' + t('js.image.thinking') + '</div>';
        messagesEl.appendChild(thinking);
        try {
          const d = await api('/api/image', {
            method: 'POST',
            body: JSON.stringify({ prompt, size: '1024x1024' }),
          });
          thinking.remove();
          const url = d.url || d.b64;
          if (!url) {
            pushBubble('assistant', t('js.image.none'));
          } else {
            const note = d.qualityNote ? `\n\n_${d.qualityNote}_` : '';
            pushBubble('assistant', `${t('js.image.here')}\n\n![image](${url})${note}`, {
              model: d.model,
              provider: d.provider,
            });
            history.push({ role: 'assistant', content: t('js.image.generated') + (d.url || '[embedded]') });
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
          { type: 'text', text: text || t('js.analyze.image') },
          { type: 'image_url', image_url: { url: attach.dataUrl } },
        ];
        pushBubble('user', text || t('js.analyze.image'), { skipHistory: true, image: attach.dataUrl });
        history.push({ role: 'user', content });
      } else if (attach?.kind === 'text') {
        const combined = `${text || t('js.analyze.doc')}\n\n---\n${t('js.file.header', { name: attach.name })}\n${attach.text.slice(0, 60000)}`;
        content = combined;
        pushBubble('user', text || (t('js.file.label') + attach.name));
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
      pending.innerHTML = '<div class="bubble">' + t('js.thinking') + '</div>';
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
    if (!(d.memories || []).length) list.innerHTML = '<p style="color:var(--muted);font-size:.85rem">' + t('js.mem.empty') + '</p>';
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
    if (!confirm(t('js.mem.clearConfirm'))) return;
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
      const st = p.connected ? '<span class="ok">' + t('js.prov.ok') + '</span>' : `<span class="warn">${escapeHtml(p.status || t('js.prov.missing'))}</span>`;
      row.innerHTML = `<span><strong>${escapeHtml(p.name)}</strong><br/><small style="color:var(--muted)">${escapeHtml(p.id)}</small></span><span>${st}</span>`;
      list.appendChild(row);
    });
  }
  $('btnProviders').onclick = () => { $('provModal').classList.add('show'); refreshProv(); };
  $('btnCloseProv').onclick = () => $('provModal').classList.remove('show');
  $('btnSmoke').onclick = async () => {
    $('btnSmoke').textContent = t('js.prov.testing');
    await api('/api/providers/smoke', { method: 'POST', body: '{}' });
    await refreshProv();
    $('btnSmoke').textContent = t('js.prov.retest');
  };


  // Voice call removed — mic dictation (btnMic) remains above.

  // Empty-state suggestion chips
  document.querySelectorAll('#emptySuggestions [data-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-prompt') || '';
      const input = $('input');
      if (!input) return;
      if (/^(Génère une image|Generate an image)/i.test(p)) {
        selectMode('image');
        input.value = p.replace(/^(Génère une image|Generate an image)\s*:\s*/i, '');
      } else {
        selectMode('chat');
        input.value = p;
      }
      input.focus();
      input.dispatchEvent(new Event('input'));
    });
  });

  // Re-apply usage / dynamic chrome when language toggles
  document.addEventListener('qoria:lang', () => {
    try {
      if (user) updateUsage(null, limits);
      const smoke = $('btnSmoke');
      if (smoke && !smoke.disabled) smoke.textContent = t('js.prov.retest');
      const title = $('proGateTitle');
      if (title && !$('proGate')?.classList.contains('show')) title.textContent = t('app.proGate.title');
    } catch {}
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
