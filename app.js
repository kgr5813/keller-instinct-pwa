'use strict';

// ================================================================
// Config (stored in localStorage — never committed to the repo)
// ================================================================
const CONFIG_KEY = 'ki_config';

function getConfig() {
  return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
}
function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

// ================================================================
// State
// ================================================================
const state = {
  week:        null,  // parsed week.json
  feedback:    {},    // parsed feedback.json
  weekSha:     null,
  feedbackSha: null,
  view:        'today',
  recipeDate:  null,
  swapFrom:    null,
  draftRating: null,  // rating being selected in the open feedback form
  timer: {
    running:    false,
    elapsed:    0,      // seconds
    startedAt:  null,   // Date.now() adjusted for elapsed
    interval:   null,
    date:       null,   // which recipe date the timer is for
  }
};

// ================================================================
// GitHub API
// ================================================================
async function ghGet(path) {
  const cfg = getConfig();
  const res = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`,
    { headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github.v3+json' } }
  );
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  const data = await res.json();
  return {
    content: JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))))),
    sha: data.sha
  };
}

async function ghPut(path, content, sha, message) {
  const cfg = getConfig();
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
    branch: cfg.branch || 'main',
  };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub ${res.status}`);
  }
  return await res.json();
}

// ================================================================
// Data loading
// ================================================================
async function loadData() {
  const cfg = getConfig();
  const hasGithub = cfg.token && cfg.owner && cfg.repo;

  if (hasGithub) {
    // Load from GitHub API — authoritative source
    try {
      const w = await ghGet('week.json');
      state.week = w.content;
      state.weekSha = w.sha;
    } catch (e) {
      // Fall back to relative fetch (e.g. not yet pushed)
      try {
        const r = await fetch('./week.json');
        if (r.ok) state.week = await r.json();
      } catch (_) {}
    }

    try {
      const f = await ghGet('feedback.json');
      state.feedback = f.content;
      state.feedbackSha = f.sha;
    } catch (e) {
      // feedback.json may not exist yet — that's fine
    }
  } else {
    // No config — try plain relative fetch
    try {
      const r = await fetch('./week.json');
      if (r.ok) state.week = await r.json();
    } catch (_) {}
  }
}

// ================================================================
// Utilities
// ================================================================
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shortDay(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function longDay(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtTimer(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function getWeekDays() {
  return state.week ? Object.keys(state.week.days).sort() : [];
}

function render(html) {
  document.getElementById('app-main').innerHTML = html;
}

function setTitle(t) {
  document.getElementById('app-title').textContent = t;
}

function setNavActive(view) {
  document.querySelectorAll('.nav-btn[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view)
  );
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' toast-' + type : ''}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 2900);
}

// ================================================================
// Navigation
// ================================================================
function navigate(view, param) {
  // Stop timer when leaving a recipe (keep elapsed)
  if (state.view === 'recipe' && view !== 'recipe') stopTimer();

  state.view = view;
  document.getElementById('back-btn').hidden = (view !== 'recipe');

  if (view === 'today') {
    setNavActive('today');
    renderToday();
  } else if (view === 'week') {
    state.swapFrom = null;
    setNavActive('week');
    renderWeek();
  } else if (view === 'settings') {
    setNavActive('settings');
    renderSettings();
  } else if (view === 'recipe') {
    state.recipeDate = param;
    renderRecipeForDate(param);
  }
}

// ================================================================
// Today view
// ================================================================
function renderToday() {
  setTitle('Keller Instinct');

  if (!state.week) {
    render(`
      <div class="empty-state">
        <div class="empty-icon">🍽️</div>
        <h2>No plan loaded</h2>
        <p>Configure your GitHub repo in Settings so the app can fetch the weekly plan.</p>
        <button class="btn btn-primary" onclick="navigate('settings')">Open Settings</button>
      </div>`);
    return;
  }

  const today = todayIso();
  if (state.week.days[today]) {
    renderRecipeForDate(today);
  } else {
    render(`
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <h2>No dinner planned today</h2>
        <p>Check the week view for upcoming meals.</p>
        <button class="btn btn-primary" onclick="navigate('week')">View Week</button>
      </div>`);
  }
}

// ================================================================
// Recipe view
// ================================================================
function renderRecipeForDate(date) {
  if (!state.week?.days[date]) { navigate('week'); return; }

  const recipe = state.week.days[date];
  const fb     = state.feedback[date] || {};
  const isT    = date === todayIso();

  setTitle(isT ? 'Tonight' : shortDay(date));

  const ingredientRows = (recipe.ingredients || []).map(i => {
    const qty = [i.quantity, i.unit].filter(Boolean).join(' ');
    return `<li class="ingredient-row">
      <span class="ingredient-qty">${esc(qty)}</span>
      <span class="ingredient-name">${esc(i.name)}</span>
    </li>`;
  }).join('');

  const stepRows = (recipe.steps || []).map((s, idx) => `
    <div class="step-row">
      <span class="step-num">${idx + 1}</span>
      <p class="step-text">${esc(s.instruction || s)}</p>
    </div>`).join('');

  const sourceHtml = recipe.source_url
    ? `<a class="source-link" href="${esc(recipe.source_url)}" target="_blank" rel="noopener">${esc(recipe.source || 'Source')} ↗</a>`
    : recipe.source ? `<span class="source-text">${esc(recipe.source)}</span>` : '';

  // Initialize draft rating from existing feedback, then fall back to recipe's DB rating
  state.draftRating = fb.rating != null ? fb.rating : (recipe.rating != null ? recipe.rating : null);

  const ratingBtns = [0, 1, 2, 3, 4].map(v =>
    `<button class="rating-btn${state.draftRating === v ? ' selected' : ''}" onclick="selectRating(${v})">${v}</button>`
  ).join('');

  const hasFeedback = fb.notes || fb.actual_time_min || fb.rating != null;
  const feedbackHtml = hasFeedback
    ? `<div class="existing-feedback">
        ${fb.rating != null ? `<p class="fb-time">Frequency: <strong>${fb.rating}/4 times per month</strong></p>` : ''}
        ${fb.actual_time_min ? `<p class="fb-time">Actual time: <strong>${fb.actual_time_min} min</strong></p>` : ''}
        ${fb.notes ? `<p class="fb-notes">${esc(fb.notes)}</p>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="editFeedback('${date}')">Edit</button>
       </div>`
    : `<div class="rating-row">
         <span class="rating-label">Times per month (0–4)</span>
         <div class="rating-selector" id="rating-selector">${ratingBtns}</div>
       </div>
       <p class="rating-hint">0 = never &nbsp;·&nbsp; 1 = rarely &nbsp;·&nbsp; 2 = monthly &nbsp;·&nbsp; 3 = bi-weekly &nbsp;·&nbsp; 4 = weekly</p>
       <textarea class="feedback-input" id="feedback-input" placeholder="How did it go? Any notes for next time…" rows="3">${esc(fb.draft || '')}</textarea>
       <div class="feedback-time-row">
         <label class="feedback-time-label">Actual time (min)</label>
         <input class="feedback-time-input" id="actual-time-input" type="number" min="1" max="300"
           placeholder="${recipe.time_min || ''}" value="${fb.actual_time_min || ''}">
       </div>
       <button class="btn btn-primary btn-full" id="submit-btn" onclick="submitFeedback('${date}')">Save feedback</button>`;

  render(`
    <div class="recipe-view">
      <div class="recipe-header">
        <h2 class="recipe-name">${esc(recipe.name)}</h2>
        <div class="recipe-meta">
          ${recipe.cuisine ? `<span class="meta-chip">${esc(recipe.cuisine)}</span>` : ''}
          ${recipe.time_min ? `<span class="meta-chip">~${recipe.time_min} min</span>` : ''}
          ${sourceHtml}
        </div>
      </div>

      <div class="timer-section">
        <div class="timer-display${state.timer.running ? ' running' : ''}" id="timer-display">${fmtTimer(state.timer.date === date ? state.timer.elapsed : 0)}</div>
        <div class="timer-controls">
          <button class="btn btn-secondary btn-sm" onclick="resetTimer()">Reset</button>
          <button class="btn btn-primary timer-start-btn${state.timer.running && state.timer.date === date ? ' running' : ''}"
            id="timer-toggle-btn" onclick="toggleTimer('${date}')">
            ${state.timer.running && state.timer.date === date ? 'Stop' : 'Start'}
          </button>
        </div>
        ${recipe.time_min ? `<div class="timer-estimate">Estimated: ${recipe.time_min} min</div>` : ''}
      </div>

      <section class="recipe-section">
        <h3 class="section-title">Ingredients</h3>
        <ul class="ingredient-list">${ingredientRows}</ul>
      </section>

      ${stepRows ? `<section class="recipe-section">
        <h3 class="section-title">Method</h3>
        <div class="step-list">${stepRows}</div>
      </section>` : ''}

      <section class="recipe-section feedback-section">
        <h3 class="section-title">Feedback</h3>
        ${feedbackHtml}
      </section>
    </div>`);
}

// ================================================================
// Timer
// ================================================================
function toggleTimer(date) {
  if (state.timer.running && state.timer.date === date) {
    stopTimer();
    const mins = Math.round(state.timer.elapsed / 60);
    const input = document.getElementById('actual-time-input');
    if (input && mins > 0) input.value = mins;
  } else {
    // If timer was for a different recipe, reset first
    if (state.timer.date && state.timer.date !== date) resetTimer();
    startTimer(date);
  }
}

function startTimer(date) {
  state.timer.date = date;
  state.timer.running = true;
  state.timer.startedAt = Date.now() - (state.timer.elapsed * 1000);
  state.timer.interval = setInterval(() => {
    state.timer.elapsed = Math.floor((Date.now() - state.timer.startedAt) / 1000);
    const el = document.getElementById('timer-display');
    if (el) el.textContent = fmtTimer(state.timer.elapsed);
  }, 1000);

  const btn = document.getElementById('timer-toggle-btn');
  const disp = document.getElementById('timer-display');
  if (btn)  { btn.textContent = 'Stop'; btn.classList.add('running'); }
  if (disp) disp.classList.add('running');
}

function stopTimer() {
  if (!state.timer.running) return;
  clearInterval(state.timer.interval);
  state.timer.running = false;
  const btn = document.getElementById('timer-toggle-btn');
  const disp = document.getElementById('timer-display');
  if (btn)  { btn.textContent = 'Start'; btn.classList.remove('running'); }
  if (disp) disp.classList.remove('running');
}

function resetTimer() {
  stopTimer();
  state.timer.elapsed = 0;
  state.timer.date    = null;
  const el = document.getElementById('timer-display');
  if (el) el.textContent = fmtTimer(0);
}

// ================================================================
// Rating
// ================================================================
function selectRating(value) {
  state.draftRating = value;
  document.querySelectorAll('.rating-btn').forEach((btn, i) => {
    btn.classList.toggle('selected', i === value);
  });
}

// ================================================================
// Week view
// ================================================================
function renderWeek() {
  setTitle('This Week');

  if (!state.week) {
    render(`<div class="empty-state">
      <div class="empty-icon">📅</div>
      <h2>No plan loaded</h2>
      <button class="btn btn-primary" onclick="navigate('settings')">Open Settings</button>
    </div>`);
    return;
  }

  const days  = getWeekDays();
  const today = todayIso();

  const bannerHtml = state.swapFrom
    ? `<div class="swap-banner">
         <span>Select a day to swap with</span>
         <button class="btn btn-secondary btn-sm" onclick="cancelSwap()">Cancel</button>
       </div>`
    : '';

  const dayCards = days.map(date => {
    const recipe = state.week.days[date];
    const isT    = date === today;
    const hasFb  = !!state.feedback[date];
    return `
      <div class="day-card${isT ? ' today' : ''}${state.swapFrom === date ? ' swap-source' : ''}${state.swapFrom && state.swapFrom !== date ? ' swap-target' : ''}"
           data-date="${date}" id="day-${date}">
        <div class="day-info" onclick="handleDayTap('${date}')">
          <div class="day-label">${isT ? 'Today' : shortDay(date)}</div>
          <div class="day-recipe-name">${esc(recipe?.name || '—')}</div>
          <div class="day-meta">
            ${recipe?.cuisine ? `<span>${esc(recipe.cuisine)}</span>` : ''}
            ${recipe?.time_min ? `<span>${recipe.time_min} min</span>` : ''}
            ${hasFb ? `<span class="day-feedback-dot" title="Feedback recorded">● noted</span>` : ''}
          </div>
        </div>
        <button class="swap-btn" aria-label="Swap day" onclick="handleSwapTap('${date}', event)">⇄</button>
      </div>`;
  }).join('');

  render(`<div class="week-view">${bannerHtml}<div class="day-list">${dayCards}</div></div>`);
}

function handleDayTap(date) {
  if (state.swapFrom) {
    if (state.swapFrom === date) { cancelSwap(); return; }
    performSwap(state.swapFrom, date);
  } else {
    navigate('recipe', date);
  }
}

function handleSwapTap(date, e) {
  e.stopPropagation();
  if (state.swapFrom) {
    if (state.swapFrom === date) { cancelSwap(); return; }
    performSwap(state.swapFrom, date);
  } else {
    state.swapFrom = date;
    renderWeek();
  }
}

function cancelSwap() {
  state.swapFrom = null;
  renderWeek();
}

async function performSwap(dateA, dateB) {
  const tmp = { ...state.week.days[dateA] };
  state.week.days[dateA] = { ...state.week.days[dateB] };
  state.week.days[dateB] = tmp;
  state.swapFrom = null;
  renderWeek();

  const cfg = getConfig();
  if (!cfg.token) {
    toast('Swap saved locally — configure GitHub to persist', '');
    return;
  }
  try {
    const { sha } = await ghGet('week.json');
    const result  = await ghPut('week.json', state.week, sha, `Swap meals: ${dateA} ↔ ${dateB}`);
    state.weekSha = result.content.sha;
    toast('Swap saved', 'success');
  } catch (err) {
    toast('Could not save swap: ' + err.message, 'error');
  }
}

// ================================================================
// Feedback
// ================================================================
async function submitFeedback(date) {
  const notes      = document.getElementById('feedback-input')?.value?.trim() || '';
  const actualTime = parseInt(document.getElementById('actual-time-input')?.value) || null;

  if (!notes && !actualTime && state.draftRating === null) { toast('Add a rating, note, or time first'); return; }

  const entry = {
    recipe:          state.week?.days[date]?.name || '',
    rating:          state.draftRating,
    actual_time_min: actualTime,
    notes,
    timestamp:       new Date().toISOString(),
  };

  state.feedback[date] = entry;

  const btn = document.getElementById('submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const cfg = getConfig();
  if (!cfg.token) {
    toast('Saved locally — configure GitHub to persist');
    renderRecipeForDate(date);
    return;
  }

  try {
    // Fetch latest SHA and merge remote feedback before writing
    let sha = state.feedbackSha;
    try {
      const remote = await ghGet('feedback.json');
      sha = remote.sha;
      state.feedback = { ...remote.content, [date]: entry };
    } catch (_) {}

    const result     = await ghPut('feedback.json', state.feedback, sha,
      `Feedback: ${entry.recipe || date}`);
    state.feedbackSha = result.content.sha;
    toast('Feedback saved!', 'success');
    renderRecipeForDate(date);
  } catch (err) {
    toast('Could not save: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Save feedback'; }
  }
}

function editFeedback(date) {
  // Clear saved entry from local state so form shows again
  delete state.feedback[date];
  renderRecipeForDate(date);
}

// ================================================================
// Settings view
// ================================================================
function renderSettings() {
  setTitle('Settings');
  const cfg = getConfig();
  render(`
    <div class="settings-view">
      <div class="settings-group">
        <h3 class="settings-group-title">GitHub</h3>
        <p class="settings-desc">
          The app reads <code>week.json</code> and writes <code>feedback.json</code> via the GitHub API.
          Create a Personal Access Token (classic or fine-grained) with <code>contents: write</code>
          access to the repository.
        </p>
        <label class="field-label">Personal Access Token</label>
        <input class="field-input" id="cfg-token" type="password" placeholder="ghp_…" value="${esc(cfg.token || '')}">
        <label class="field-label">Repository owner</label>
        <input class="field-input" id="cfg-owner" type="text" placeholder="your-username" value="${esc(cfg.owner || '')}">
        <label class="field-label">Repository name</label>
        <input class="field-input" id="cfg-repo" type="text" placeholder="keller-instinct-pwa" value="${esc(cfg.repo || '')}">
        <label class="field-label">Branch</label>
        <input class="field-input" id="cfg-branch" type="text" placeholder="main" value="${esc(cfg.branch || 'main')}">
        <button class="btn btn-primary btn-full" onclick="saveSettings()">Save settings</button>
      </div>

      <div class="settings-group">
        <h3 class="settings-group-title">Data</h3>
        <button class="btn btn-secondary btn-full" onclick="reloadData(this)">Reload plan from GitHub</button>
      </div>
    </div>`);
}

function saveSettings() {
  saveConfig({
    token:  document.getElementById('cfg-token').value.trim(),
    owner:  document.getElementById('cfg-owner').value.trim(),
    repo:   document.getElementById('cfg-repo').value.trim(),
    branch: document.getElementById('cfg-branch').value.trim() || 'main',
  });
  toast('Settings saved', 'success');
}

async function reloadData(btn) {
  btn.disabled = true;
  btn.textContent = 'Loading…';
  try {
    await loadData();
    toast('Plan reloaded', 'success');
  } catch (err) {
    toast('Failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reload plan from GitHub';
  }
}

// ================================================================
// Modal helpers
// ================================================================
function closeModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.getElementById('modal-body').innerHTML = '';
}

// ================================================================
// Init
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Nav buttons
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.view))
  );

  // Back button
  document.getElementById('back-btn').addEventListener('click', () => navigate('week'));

  // Modal dismiss
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Load data then route
  await loadData();

  const today = todayIso();
  if (state.week?.days[today]) {
    navigate('today');
  } else if (state.week) {
    navigate('week');
  } else {
    navigate('today'); // shows "no plan" state
  }

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
