const STORAGE_KEYS = {
  baseVoice: 'commently_baseVoice',
  presets: 'commently_presets',
  log: 'commently_log',
  activePreset: 'commently_activePreset',
};

const DEFAULT_PRESETS = [
  { name: 'AI/Tech Founders', creatorType: 'Founder', industry: 'AI/Tech', voiceProfile: 'Technical + precise' },
  { name: 'Creative/Design', creatorType: 'Designer', industry: 'Creative/Design', voiceProfile: 'Reflective + warm' },
  { name: 'Finance/Investing', creatorType: 'Investor', industry: 'Fintech/Investing', voiceProfile: 'Sharp + data-driven' },
  { name: 'Wellness', creatorType: 'Practitioner', industry: 'Wellness', voiceProfile: 'Reflective + warm' },
  { name: 'Founder Reflections', creatorType: 'Founder', industry: 'General/Cross-industry', voiceProfile: 'Reflective + candid' },
];

function loadPresets() {
  const raw = localStorage.getItem(STORAGE_KEYS.presets);
  if (!raw) return DEFAULT_PRESETS.slice();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_PRESETS.slice();
  } catch {
    return DEFAULT_PRESETS.slice();
  }
}

function savePresets(presets) {
  localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(presets));
}

function loadLog() {
  const raw = localStorage.getItem(STORAGE_KEYS.log);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLog(log) {
  localStorage.setItem(STORAGE_KEYS.log, JSON.stringify(log));
}

function loadBaseVoice() {
  const raw = localStorage.getItem(STORAGE_KEYS.baseVoice);
  if (!raw) return ['', '', ''];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length === 3 ? parsed : ['', '', ''];
  } catch {
    return ['', '', ''];
  }
}

function saveBaseVoice(voice) {
  localStorage.setItem(STORAGE_KEYS.baseVoice, JSON.stringify(voice));
}

let presets = loadPresets();
let log = loadLog();

const els = {
  voice1: document.getElementById('voice-1'),
  voice2: document.getElementById('voice-2'),
  voice3: document.getElementById('voice-3'),
  presetSelect: document.getElementById('preset-select'),
  contextDetail: document.getElementById('context-detail'),
  addPresetBtn: document.getElementById('add-preset-btn'),
  addPresetForm: document.getElementById('add-preset-form'),
  cancelPresetBtn: document.getElementById('cancel-preset-btn'),
  newPresetName: document.getElementById('new-preset-name'),
  newPresetCreator: document.getElementById('new-preset-creator'),
  newPresetIndustry: document.getElementById('new-preset-industry'),
  newPresetVoice: document.getElementById('new-preset-voice'),
  postText: document.getElementById('post-text'),
  postUrl: document.getElementById('post-url'),
  generateBtn: document.getElementById('generate-btn'),
  resultArea: document.getElementById('result-area'),
  resultMeta: document.getElementById('result-meta'),
  resultComment: document.getElementById('result-comment'),
  copyBtn: document.getElementById('copy-btn'),
  errorArea: document.getElementById('error-area'),
  logList: document.getElementById('log-list'),
};

function initBaseVoice() {
  const [v1, v2, v3] = loadBaseVoice();
  els.voice1.value = v1;
  els.voice2.value = v2;
  els.voice3.value = v3;
  [els.voice1, els.voice2, els.voice3].forEach((input) => {
    input.addEventListener('input', () => {
      saveBaseVoice([els.voice1.value, els.voice2.value, els.voice3.value]);
    });
  });
}

function getActivePreset() {
  const idx = Number(els.presetSelect.value);
  return presets[idx] || presets[0];
}

function renderPresetSelect() {
  els.presetSelect.innerHTML = presets
    .map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`)
    .join('');
  const savedIdx = Number(localStorage.getItem(STORAGE_KEYS.activePreset));
  if (!Number.isNaN(savedIdx) && presets[savedIdx]) {
    els.presetSelect.value = String(savedIdx);
  }
  renderContextDetail();
}

function renderContextDetail() {
  const p = getActivePreset();
  els.contextDetail.innerHTML = p
    ? `<b>Creator type:</b> ${escapeHtml(p.creatorType)} &nbsp;·&nbsp; <b>Industry:</b> ${escapeHtml(p.industry)} &nbsp;·&nbsp; <b>Voice:</b> ${escapeHtml(p.voiceProfile)}`
    : '';
}

els.presetSelect.addEventListener('change', () => {
  localStorage.setItem(STORAGE_KEYS.activePreset, els.presetSelect.value);
  renderContextDetail();
});

els.addPresetBtn.addEventListener('click', () => {
  els.addPresetForm.classList.toggle('hidden');
});

els.cancelPresetBtn.addEventListener('click', () => {
  els.addPresetForm.classList.add('hidden');
  els.addPresetForm.reset();
});

els.addPresetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const newPreset = {
    name: els.newPresetName.value.trim(),
    creatorType: els.newPresetCreator.value.trim(),
    industry: els.newPresetIndustry.value.trim(),
    voiceProfile: els.newPresetVoice.value.trim(),
  };
  if (!newPreset.name) return;
  presets.push(newPreset);
  savePresets(presets);
  renderPresetSelect();
  els.presetSelect.value = String(presets.length - 1);
  localStorage.setItem(STORAGE_KEYS.activePreset, els.presetSelect.value);
  renderContextDetail();
  els.addPresetForm.classList.add('hidden');
  els.addPresetForm.reset();
});

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderLog() {
  if (!log.length) {
    els.logList.innerHTML = '<p class="empty-state">No comments generated yet. Your log will appear here.</p>';
    return;
  }
  const sorted = log.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  els.logList.innerHTML = sorted
    .map(
      (entry) => `
      <div class="log-entry" data-id="${entry.id}">
        <div class="log-entry-top">
          <span class="log-entry-context">${escapeHtml(entry.context)}</span>
          <span class="log-entry-time">${formatTime(entry.timestamp)}</span>
        </div>
        <p class="log-entry-post">${escapeHtml(truncate(entry.postText, 140))}</p>
        <p class="log-entry-comment">${escapeHtml(entry.generatedComment)}</p>
        <div class="log-entry-actions">
          <button class="star-btn ${entry.revisit ? 'active' : ''}" data-action="star">${entry.revisit ? '★ Marked to revisit' : '☆ Mark to revisit'}</button>
          <button class="btn-secondary" data-action="copy">Copy</button>
        </div>
      </div>`
    )
    .join('');
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

els.logList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const entryEl = btn.closest('.log-entry');
  const id = entryEl.getAttribute('data-id');
  const entry = log.find((l) => String(l.id) === id);
  if (!entry) return;

  if (btn.dataset.action === 'star') {
    entry.revisit = !entry.revisit;
    saveLog(log);
    renderLog();
  } else if (btn.dataset.action === 'copy') {
    navigator.clipboard.writeText(entry.generatedComment).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
  }
});

els.generateBtn.addEventListener('click', async () => {
  const postText = els.postText.value.trim();
  const postUrl = els.postUrl.value.trim();
  els.errorArea.classList.add('hidden');
  els.resultArea.classList.add('hidden');

  if (!postText) {
    els.errorArea.textContent = 'Paste the LinkedIn post text first.';
    els.errorArea.classList.remove('hidden');
    return;
  }

  const preset = getActivePreset();
  const baseVoice = [els.voice1.value, els.voice2.value, els.voice3.value];

  els.generateBtn.disabled = true;
  els.generateBtn.textContent = 'Generating…';

  try {
    const res = await fetch('/api/generate-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postText,
        postUrl,
        context: {
          presetName: preset.name,
          creatorType: preset.creatorType,
          industry: preset.industry,
          voiceProfile: preset.voiceProfile,
        },
        baseVoice,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong generating the comment.');
    }

    els.resultMeta.textContent = `Generated via ${data.source}`;
    els.resultComment.textContent = data.comment;
    els.resultArea.classList.remove('hidden');

    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      context: preset.name,
      postText,
      postUrl,
      generatedComment: data.comment,
      revisit: false,
    };
    log.push(entry);
    saveLog(log);
    renderLog();
  } catch (err) {
    els.errorArea.textContent = err.message;
    els.errorArea.classList.remove('hidden');
  } finally {
    els.generateBtn.disabled = false;
    els.generateBtn.textContent = 'Generate comment';
  }
});

els.copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(els.resultComment.textContent).then(() => {
    els.copyBtn.textContent = 'Copied!';
    setTimeout(() => (els.copyBtn.textContent = 'Copy to clipboard'), 1500);
  });
});

initBaseVoice();
renderPresetSelect();
renderLog();
