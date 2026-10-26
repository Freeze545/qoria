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
  const history = []; // {role, content} for API

  const $ = (id) => document.getElementById(id);
  const messagesEl = $('messages');
  const emptyEl = $('empty');

  async function api(path, opts = {}) {
    const r = await fetch(path, {
      credentials: 'include',
      ...opts,
      headers: { ...headers(), ...(opts.headers || {}) },
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) {
      localStorage.removeItem('qoria_token');
      location.href = '/login.html';
      throw new Error('Non connecté');
    }
    if (!r.ok) throw new Error(d.error || ('Erreur ' + r.status));
    return d;
  }

  async function ensureAuth() {
    try {
      const d = await api('/api/auth/me');
      user = d.user;
      $('planChip').textContent = (user.plan || 'free').toUpperCase();
      updateUsage(d.usage, d.limit);
      return true;
    } catch {
      location.href = '/login.html';
      return false;
    }
  }

  function updateUsage(usage, limit) {
    const u = usage || {};
    const lim = limit || 30;
    const msg = u.messages || 0;
    $('usageChip').textContent = `${msg}/${lim} messages · ${u.images || 0} images`;
    $('usageLine').textContent = `Aujourd’hui : ${msg}/${lim} messages` + (user?.plan === 'pro' ? ' · Pro' : ' · Free');
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

  function pushBubble(role, content, meta = {}) {
    if (emptyEl.parentNode) emptyEl.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (typeof content === 'string') {
      // basic markdown-ish: images markdown ![alt](url)
      const html = escapeHtml(content)
        .replace(/!\[([^\]]*)\]\((https?:[^)]+)\)/g, '<img class="gen" src="$2" alt="$1" />')
        .replace(/(https?:\/\/image\.pollinations\.ai\/[^\s<]+)/g, '<img class="gen" src="$1" alt="image" />');
      bubble.innerHTML = html;
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

  // modes
  document.querySelectorAll('.mode').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.mode').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      mode = btn.dataset.mode;
    };
  });

  // sidebar
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

  // attach
  $('btnAttach').onclick = () => $('fileInput').click();
  $('btnClearAttach').onclick = () => {
    attach = null;
    $('attachPreview').hidden = true;
  };
  $('fileInput').onchange = async () => {
    const file = $('fileInput').files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
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

  // send
  $('composer').onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = $('input').value.trim();
    if (!text && !attach) return;

    busy = true;
    $('btnSend').disabled = true;

    try {
      if (mode === 'image') {
        const prompt = text || 'une image abstraite indigo et violet';
        pushBubble('user', '🖼️ ' + prompt);
        $('input').value = '';
        const thinking = document.createElement('div');
        thinking.className = 'msg assistant';
        thinking.innerHTML = '<div class="bubble">Génération de l’image…</div>';
        messagesEl.appendChild(thinking);
        const d = await api('/api/image', {
          method: 'POST',
          body: JSON.stringify({ prompt }),
        });
        thinking.remove();
        const url = d.url || d.b64;
        pushBubble('assistant', url ? `Voici ton image (${d.provider || 'qoria'}):\n\n![image](${url})` : 'Pas d’image renvoyée.', {
          model: d.model,
          provider: d.provider,
        });
        if (d.url) history.push({ role: 'assistant', content: 'Image générée: ' + d.url });
        return;
      }

      // Build multimodal content
      let content;
      if (attach?.kind === 'image') {
        content = [
          { type: 'text', text: text || 'Analyse cette image.' },
          { type: 'image_url', image_url: { url: attach.dataUrl } },
        ];
        pushBubble('user', text || 'Analyse cette image.', { skipHistory: true });
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
      attach = null;
      $('attachPreview').hidden = true;
      $('input').value = '';

      const pending = document.createElement('div');
      pending.className = 'msg assistant';
      pending.innerHTML = '<div class="bubble">Qoria réfléchit…</div>';
      messagesEl.appendChild(pending);

      const payloadMessages = history.map((m) => ({ role: m.role, content: m.content }));
      // Avoid duplicating last if already pushed — history already has it

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
      // replace last history assistant if any — we pushed user already; push assistant
      // Remove the user we double-count? history already has user; add assistant only
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') history.pop();
      pushBubble('assistant', d.content, { model: d.model, provider: d.provider });
      if (d.usage) updateUsage(d.usage, d.limit);
      loadConvs();
    } catch (err) {
      pushBubble('assistant', '⚠️ ' + err.message, { skipHistory: true });
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

  // boot
  (async () => {
    if (!(await ensureAuth())) return;
    await loadConvs();
    // warm status
    try { await api('/api/status'); } catch {}
  })();
})();
