// ═══════════════════════════════════════════════════════════
// GLOBAL APP UTILITIES
// ═══════════════════════════════════════════════════════════

const API = '/api';

// ── HTTP Helpers ─────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'সার্ভার ত্রুটি');
    return data;
  } catch (err) {
    throw err;
  }
}

// ── Toast Notifications ──────────────────────────────────────
function toast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-msg">${msg}</span>
  `;
  container.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    el.style.transition = '0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ── Format file size ──────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Format Date ───────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('bn-BD', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('bn-BD', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

// ── File type badge ───────────────────────────────────────────
function fileBadgeHTML(type) {
  if (!type) return '<span class="file-badge none">📎 কোনো ফাইল নেই</span>';
  if (type === 'pdf') return '<span class="file-badge pdf">📄 PDF</span>';
  return '<span class="file-badge image">🖼️ ছবি</span>';
}

// ── Category badge ────────────────────────────────────────────
const categoryColors = [
  'purple','green','orange','blue','gray','red',
  'purple','green','orange','blue'
];
const _catMap = {};
let _catColorIdx = 0;
function catBadge(cat) {
  if (!cat) return '';
  if (!_catMap[cat]) {
    _catMap[cat] = categoryColors[_catColorIdx % categoryColors.length];
    _catColorIdx++;
  }
  return `<span class="badge badge-${_catMap[cat]}">${cat}</span>`;
}

// ── Active nav item ───────────────────────────────────────────
function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

// ── Confirm modal ─────────────────────────────────────────────
function confirmAction(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-header"><h3 class="modal-title">⚠️ নিশ্চিত করুন</h3></div>
        <div class="modal-body"><p style="font-size:15px">${msg}</p></div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="confirm-no">বাতিল</button>
          <button class="btn btn-danger" id="confirm-yes">হ্যাঁ, করুন</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.querySelector('#confirm-yes').onclick = () => {
      overlay.remove(); resolve(true);
    };
    overlay.querySelector('#confirm-no').onclick = () => {
      overlay.remove(); resolve(false);
    };
  });
}

// ── Tag input helper ──────────────────────────────────────────
function initTagInput(wrapId, inputId, hiddenId) {
  const wrap = document.getElementById(wrapId);
  const input = document.getElementById(inputId);
  const hidden = document.getElementById(hiddenId);
  if (!wrap || !input || !hidden) return;

  let tags = [];

  function render() {
    wrap.querySelectorAll('.tag-chip').forEach(c => c.remove());
    tags.forEach((tag, i) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `${tag}<span class="tag-chip-remove" data-i="${i}">×</span>`;
      wrap.insertBefore(chip, input);
    });
    hidden.value = tags.join(',');
  }

  input.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      const val = input.value.trim().replace(/,$/, '');
      if (val && !tags.includes(val)) { tags.push(val); render(); }
      input.value = '';
    }
    if (e.key === 'Backspace' && !input.value && tags.length) {
      tags.pop(); render();
    }
  });

  wrap.addEventListener('click', e => {
    if (e.target.classList.contains('tag-chip-remove')) {
      tags.splice(parseInt(e.target.dataset.i), 1);
      render();
    }
    input.focus();
  });

  return {
    setTags: (arr) => { tags = arr || []; render(); },
    getTags: () => tags
  };
}

// ── Drag & Drop File Input ────────────────────────────────────
function initDropZone(zoneId, inputId, previewId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!zone || !input) return;

  function showPreview(file) {
    if (!preview) return;
    const isImg = file.type.startsWith('image/');
    preview.innerHTML = `
      <div class="file-preview">
        <span class="file-preview-icon">${isImg ? '🖼️' : '📄'}</span>
        <div class="file-preview-info">
          <div class="file-preview-name">${file.name}</div>
          <div class="file-preview-size">${formatSize(file.size)}</div>
        </div>
        <button type="button" class="btn btn-sm btn-danger" id="remove-file">✕</button>
      </div>`;
    preview.querySelector('#remove-file').onclick = () => {
      input.value = '';
      preview.innerHTML = '';
    };
  }

  input.addEventListener('change', () => {
    if (input.files[0]) showPreview(input.files[0]);
  });

  zone.addEventListener('dragover', e => {
    e.preventDefault(); zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      showPreview(file);
    }
  });
}

// ── Load categories into a <select> ──────────────────────────
async function loadCategories(selectId, selected = '') {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const cats = await apiFetch('/categories');
    select.innerHTML = '<option value="">সব ক্যাটাগরি</option>' +
      cats.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
  } catch {
    // ignore
  }
}

// ── Delete document ───────────────────────────────────────────
async function deleteDocument(id, onSuccess) {
  const ok = await confirmAction('এই ডকুমেন্টটি স্থায়ীভাবে মুছে ফেলা হবে। নিশ্চিত?');
  if (!ok) return;
  try {
    await apiFetch(`/documents/${id}`, { method: 'DELETE' });
    toast('ডকুমেন্ট সফলভাবে মুছে ফেলা হয়েছে', 'success');
    if (typeof onSuccess === 'function') onSuccess();
  } catch (err) {
    toast(err.message, 'error');
  }
}
