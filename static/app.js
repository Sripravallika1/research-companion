/* ═══════════════════════════════════════════════════════════════════════════
   Research Companion — app.js
   Pure vanilla JS, no frameworks.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── DOM refs ──────────────────────────────────────────────────────────── */
  const uploadZone    = document.getElementById('uploadZone');
  const fileInput     = document.getElementById('fileInput');
  const uploadStatus  = document.getElementById('uploadStatus');
  const docList       = document.getElementById('docList');
  const messages      = document.getElementById('messages');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const questionInput = document.getElementById('questionInput');
  const sendBtn       = document.getElementById('sendBtn');
  const resetBtn      = document.getElementById('resetBtn');
  const modeGroup     = document.getElementById('modeGroup');
  const toast         = document.getElementById('toast');

  /* ── State ─────────────────────────────────────────────────────────────── */
  let currentMode = 'simple';
  let isSending   = false;
  let toastTimer  = null;

  /* ══════════════════════════════════════════════════════════════════════════
     UTILITIES
     ══════════════════════════════════════════════════════════════════════════ */

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Parse JSON from a fetch Response, throwing a readable error if the server
   *  returned HTML (e.g. a Flask/Werkzeug 500 error page) instead of JSON. */
  async function parseJSON(resp) {
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const text = await resp.text();
      throw new Error('Server error (HTTP ' + resp.status + '). ' +
        (text.length < 200 ? text : text.slice(0, 200) + '…'));
    }
    return resp.json();
  }

  /** Minimal markdown → HTML: **bold**, `code`, bullet lists */
  function renderMarkdown(text) {
    return escHtml(text)
      // **bold**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // `code`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // bullet lines starting with - or *
      .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
      // wrap consecutive <li> blocks in <ul>
      .replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>')
      // newlines to <br>
      .replace(/\n/g, '<br>');
  }

  function docIcon(filename) {
    if (/\.pdf$/i.test(filename))  return '📄';
    if (/\.md$/i.test(filename))   return '📝';
    return '📃';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     TOAST
     ══════════════════════════════════════════════════════════════════════════ */
  function showToast(msg, type) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className   = 'show ' + (type || '');
    toastTimer = setTimeout(function () { toast.className = ''; }, 3500);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MODE TOGGLE
     ══════════════════════════════════════════════════════════════════════════ */
  modeGroup.addEventListener('click', function (e) {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    document.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
  });

  /* ══════════════════════════════════════════════════════════════════════════
     UPLOAD — drag-and-drop + file input
     ══════════════════════════════════════════════════════════════════════════ */
  uploadZone.addEventListener('click', function () { fileInput.click(); });

  uploadZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', function () { uploadZone.classList.remove('drag-over'); });
  uploadZone.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    handleFiles(Array.from(e.dataTransfer.files));
  });

  fileInput.addEventListener('change', function () {
    handleFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });

  function handleFiles(files) {
    const allowed = files.filter(function (f) { return /\.(pdf|txt|md)$/i.test(f.name); });
    if (!allowed.length) {
      showToast('Only PDF, TXT and MD files are accepted.', 'error');
      return;
    }
    uploadFiles(allowed);
  }

  async function uploadFiles(files) {
    uploadStatus.innerHTML = '';
    const items = {};

    files.forEach(function (f) {
      const el = document.createElement('div');
      el.className = 'upload-item';
      el.innerHTML =
        '<span class="status-icon">\u23F3</span>' +
        '<span class="name" title="' + escHtml(f.name) + '">' + escHtml(f.name) + '</span>' +
        '<span class="info">uploading\u2026</span>';
      uploadStatus.appendChild(el);
      items[f.name] = el;
    });

    const formData = new FormData();
    files.forEach(function (f) { formData.append('files', f); });

    try {
      const resp = await fetch('/api/docs', { method: 'POST', body: formData });
      const data = await parseJSON(resp);

      if (!resp.ok) throw new Error(data.error || 'Upload failed');

      (data.uploaded || []).forEach(function (r) {
        const el = items[r.filename];
        if (!el) return;
        if (r.error) {
          el.querySelector('.status-icon').textContent = '\u274C';
          el.querySelector('.info').textContent        = r.error;
          el.querySelector('.info').style.color        = 'var(--error)';
        } else {
          el.querySelector('.status-icon').textContent = '\u2705';
          el.querySelector('.info').textContent        =
            r.chunks + ' chunks \u00B7 ' + r.pages + ' page' + (r.pages !== 1 ? 's' : '');
          el.querySelector('.info').style.color        = 'var(--success)';
        }
      });

      showToast('Indexed ' + files.length + ' file' + (files.length > 1 ? 's' : '') + ' successfully.', 'success');
      loadDocs();
    } catch (err) {
      Object.values(items).forEach(function (el) {
        el.querySelector('.status-icon').textContent = '\u274C';
        el.querySelector('.info').textContent        = err.message;
        el.querySelector('.info').style.color        = 'var(--error)';
      });
      showToast(err.message, 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     DOCUMENT LIST
     ══════════════════════════════════════════════════════════════════════════ */
  async function loadDocs() {
    try {
      const resp = await fetch('/api/docs');
      const data = await parseJSON(resp);
      renderDocs(data.docs || []);
    } catch (_) { /* silent on initial load */ }
  }

  function renderDocs(docs) {
    if (!docs.length) {
      docList.innerHTML =
        '<div class="empty-docs">' +
        '<div class="big">\uD83D\uDCED</div>' +
        '<p>No documents yet.<br>Upload a file to get started.</p>' +
        '</div>';
      return;
    }

    docList.innerHTML = '';
    docs.forEach(function (doc) {
      const card = document.createElement('div');
      card.className = 'doc-card';
      card.innerHTML =
        '<span class="doc-icon">' + docIcon(doc.filename) + '</span>' +
        '<div class="doc-info">' +
          '<div class="doc-name" title="' + escHtml(doc.filename) + '">' + escHtml(doc.filename) + '</div>' +
          '<div class="doc-id">' + escHtml(doc.doc_id) + '</div>' +
        '</div>' +
        '<button class="btn-summarize" data-id="' + escHtml(doc.doc_id) + '" data-name="' + escHtml(doc.filename) + '">Summarize</button>';
      docList.appendChild(card);
    });

    docList.querySelectorAll('.btn-summarize').forEach(function (btn) {
      btn.addEventListener('click', function () { summarizeDoc(btn.dataset.id, btn.dataset.name, btn); });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SUMMARIZE
     ══════════════════════════════════════════════════════════════════════════ */
  async function summarizeDoc(docId, filename, btn) {
    btn.disabled    = true;
    btn.textContent = '\u23F3';

    appendMessage('user', 'Summarize: ' + filename);
    const typingEl = appendTyping();

    try {
      const resp = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_id: docId, filename: filename })
      });
      const data = await parseJSON(resp);
      typingEl.remove();

      if (!resp.ok) throw new Error(data.error || 'Summarize failed');

      appendMessage('ai', data.summary || 'No summary returned.', []);
    } catch (err) {
      typingEl.remove();
      appendMessage('ai', '\u274C Error: ' + err.message, []);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Summarize';
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CHAT
     ══════════════════════════════════════════════════════════════════════════ */
  sendBtn.addEventListener('click', sendMessage);

  questionInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea (max height kept in sync with CSS max-height)
  const INPUT_MAX_HEIGHT = parseInt(getComputedStyle(questionInput).maxHeight, 10) || 120;
  questionInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, INPUT_MAX_HEIGHT) + 'px';
  });

  // Quick-question chips
  document.querySelectorAll('.chip[data-prompt]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      questionInput.value = chip.dataset.prompt;
      questionInput.focus();
    });
  });

  async function sendMessage() {
    const question = questionInput.value.trim();
    if (!question || isSending) return;

    isSending           = true;
    sendBtn.disabled    = true;
    questionInput.value = '';
    questionInput.style.height = '';

    // Hide welcome screen on first message
    if (welcomeScreen) welcomeScreen.style.display = 'none';

    appendMessage('user', question);
    const typingEl = appendTyping();

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question, mode: currentMode })
      });
      const data = await parseJSON(resp);
      typingEl.remove();

      if (!resp.ok) throw new Error(data.error || 'Chat request failed');

      appendMessage('ai', data.answer || '(no answer)', data.citations || []);
    } catch (err) {
      typingEl.remove();
      appendMessage('ai', '\u274C ' + err.message, []);
      showToast(err.message, 'error');
    } finally {
      isSending        = false;
      sendBtn.disabled = false;
      questionInput.focus();
    }
  }

  /* ── Message rendering ─────────────────────────────────────────────────── */
  function appendMessage(role, text, citations) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '\uD83D\uDC64' : '\uD83E\uDD16';

    const bubbleWrap = document.createElement('div');
    bubbleWrap.className = 'bubble-wrap';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = role === 'ai' ? renderMarkdown(text) : escHtml(text);
    bubbleWrap.appendChild(bubble);

    // Citations
    if (citations && citations.length) {
      const citeSection = document.createElement('div');
      citeSection.className = 'citations';

      const label = document.createElement('div');
      label.className = 'citation-label';
      label.textContent = '\uD83D\uDCCE Sources';
      citeSection.appendChild(label);

      citations.forEach(function (c, idx) {
        const card = document.createElement('div');
        card.className = 'citation-card';

        const score = typeof c.score === 'number' ? (c.score * 100).toFixed(0) + '%' : '';
        card.innerHTML =
          '<div class="citation-header">' +
            '<span class="citation-badge">#' + (idx + 1) + '</span>' +
            '<span class="citation-filename">' + escHtml(c.filename || 'Unknown') + '</span>' +
            (c.page ? '<span class="citation-page">p.' + c.page + '</span>' : '') +
            (score   ? '<span class="citation-score">' + score + '</span>' : '') +
            '<span class="citation-chevron">\u25B6</span>' +
          '</div>' +
          '<div class="citation-body">' + escHtml(c.snippet || '') + '</div>';

        card.querySelector('.citation-header').addEventListener('click', function () {
          card.classList.toggle('open');
        });

        citeSection.appendChild(card);
      });

      bubbleWrap.appendChild(citeSection);
    }

    wrap.appendChild(avatar);
    wrap.appendChild(bubbleWrap);
    messages.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function appendTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'typing-indicator';
    wrap.innerHTML =
      '<div class="avatar">\uD83E\uDD16</div>' +
      '<div class="typing-dots"><span></span><span></span><span></span></div>';
    messages.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     RESET
     ══════════════════════════════════════════════════════════════════════════ */
  resetBtn.addEventListener('click', async function () {
    if (!confirm('This will clear ALL uploaded documents and reset the knowledge base. Continue?')) return;

    try {
      const resp = await fetch('/api/reset', { method: 'POST' });
      const data = await parseJSON(resp);
      if (!resp.ok) throw new Error(data.error || 'Reset failed');

      // Clear UI
      messages.innerHTML = '';
      if (welcomeScreen) {
        welcomeScreen.style.display = '';
        messages.appendChild(welcomeScreen);
      }
      uploadStatus.innerHTML = '';
      renderDocs([]);
      showToast('All documents cleared.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════════════════ */
  loadDocs();

}());
