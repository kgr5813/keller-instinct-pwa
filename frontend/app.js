/* Keller Instinct — Single-Page App */
'use strict';

// ================================================================
// Config & Labels
// ================================================================
const PROTEIN_LABELS = {
  chicken: 'Chicken', pork: 'Pork', beef: 'Beef', lamb: 'Lamb',
  fish: 'Fish', egg: 'Egg', vegetarian: 'Vegetarian'
};
const CUISINE_LABELS = {
  italian: 'Italian', scandinavian: 'Scandinavian', asian: 'Asian',
  japanese: 'Japanese', mexican: 'Mexican', indian: 'Indian',
  french: 'French', other: 'Other'
};
const DAY_LABELS = { any: 'Any day', weekday: 'Weekday', weekend: 'Weekend', friday: 'Friday' };
const STATUS_LABELS = { repertoire: 'Repertoire', want_to_try: 'Want to Try', retired: 'Retired' };
const WEEK_DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MEAT_PROTEINS = ['pork', 'beef', 'lamb', 'chicken'];

// ================================================================
// State
// ================================================================
const state = {
  recipes: [],
  recipesLoaded: false,
  preferences: null,
  planner: JSON.parse(localStorage.getItem('ki_planner') || '{}'),
  filters: { status: '', cuisine: '', protein: '', max_time: '', q: '' },
};

function savePlanner() {
  localStorage.setItem('ki_planner', JSON.stringify(state.planner));
}

// ================================================================
// API
// ================================================================
async function api(path, opts = {}) {
  const options = {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  };
  if (opts.body !== undefined) options.body = JSON.stringify(opts.body);
  const res = await fetch(path, options);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({ detail: res.statusText }));
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

async function loadRecipes(force = false) {
  if (state.recipesLoaded && !force) return state.recipes;
  state.recipes = await api('/recipes');
  state.recipesLoaded = true;
  return state.recipes;
}

// ================================================================
// Router
// ================================================================
function navigate(path, pushState = true) {
  if (pushState) history.pushState(null, '', path);
  route(path);
}

function route(path) {
  path = path || location.pathname + location.search;
  const m = path.match(/^\/recipes\/(\d+)(\/edit)?$/) ||
            path.match(/^\/recipes\/(new)$/);

  if (path === '/' || path === '') renderRecipeList();
  else if (path === '/planner') renderPlanner();
  else if (path === '/preferences') renderPreferences();
  else if (path.match(/^\/recipes\/new$/)) renderRecipeForm(null);
  else if (m && m[2]) renderRecipeForm(parseInt(m[1]));
  else if (m) renderRecipeDetail(parseInt(m[1]));
  else navigate('/');
}

window.addEventListener('popstate', () => route());

// ================================================================
// Utilities
// ================================================================
function setTitle(title) {
  document.getElementById('page-title').textContent = title;
}

function setBackBtn(show, href) {
  const btn = document.getElementById('back-btn');
  btn.hidden = !show;
  btn.onclick = () => navigate(href || '/');
}

function setHeaderActions(html) {
  document.getElementById('header-actions').innerHTML = html || '';
}

function setNavActive(route) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === route);
  });
}

function showBottomNav(show) {
  document.getElementById('bottom-nav').style.display = show ? '' : 'none';
  const main = document.getElementById('app');
  main.style.bottom = show
    ? 'calc(var(--nav-height) + var(--safe-bottom))'
    : '0';
}

function render(html) {
  document.getElementById('app').innerHTML = html;
}

function loading() {
  render('<div class="loading-state"><div class="spinner"></div></div>');
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function showModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').hidden = false;
}

function closeModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.getElementById('modal-body').innerHTML = '';
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function stars(n) {
  if (!n) return '';
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function proteinTags(protein) {
  if (!protein || !protein.length) return '';
  return protein.map(p =>
    `<span class="tag tag-protein">${PROTEIN_LABELS[p] || p}</span>`
  ).join('');
}

function timeBadge(min, warnThreshold) {
  if (!min) return '';
  const cls = warnThreshold && min > warnThreshold ? 'tag-time-warn' : 'tag-time';
  return `<span class="tag ${cls}">${min} min</span>`;
}

// ================================================================
// Recipe List
// ================================================================
async function renderRecipeList() {
  setTitle('Keller Instinct');
  setBackBtn(false);
  setNavActive('/');
  showBottomNav(true);
  setHeaderActions('');
  loading();

  try {
    const recipes = await loadRecipes();
    const f = state.filters;

    const filtered = recipes.filter(r => {
      if (f.status && r.status !== f.status) return false;
      if (f.cuisine && r.cuisine !== f.cuisine) return false;
      if (f.protein && !(r.protein || []).includes(f.protein)) return false;
      if (f.max_time && r.time_min > parseInt(f.max_time)) return false;
      if (f.q) {
        const q = f.q.toLowerCase();
        if (!r.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const cuisines = [...new Set(recipes.map(r => r.cuisine).filter(Boolean))].sort();
    const proteins = [...new Set(recipes.flatMap(r => r.protein || []))].sort();

    const statusOptions = [
      { val: '', label: 'All' },
      { val: 'repertoire', label: 'Repertoire' },
      { val: 'want_to_try', label: 'Want to Try' },
    ];

    const chipActive = val => state.filters.status === val ? 'active' : '';

    render(`
      <div class="filter-bar">
        <input class="search-input" id="search-input" type="search" placeholder="Search recipes…" value="${escHtml(f.q)}">
        <div class="filter-row">
          ${statusOptions.map(o => `
            <button class="filter-chip ${chipActive(o.val)}" data-status="${o.val}">${o.label}</button>
          `).join('')}
<span class="filter-chip ${f.protein ? 'active' : ''}">
            <select id="protein-filter">
              <option value="">All proteins</option>
              ${proteins.map(p => `<option value="${p}" ${f.protein === p ? 'selected' : ''}>${PROTEIN_LABELS[p] || p}</option>`).join('')}
            </select>
          </span>
          <span class="filter-chip ${f.max_time ? 'active' : ''}">
            <select id="time-filter">
              <option value="">Any time</option>
              <option value="30" ${f.max_time === '30' ? 'selected' : ''}>&le; 30 min</option>
              <option value="45" ${f.max_time === '45' ? 'selected' : ''}>&le; 45 min</option>
              <option value="60" ${f.max_time === '60' ? 'selected' : ''}>&le; 60 min</option>
            </select>
          </span>
        </div>
      </div>

      <div class="recipe-list" id="recipe-list">
        ${filtered.length === 0
          ? `<div class="empty-state">
              <div class="empty-state-icon">🍽️</div>
              <h3>No recipes found</h3>
              <p>Try adjusting filters.</p>
             </div>`
          : filtered.map(r => recipeCard(r)).join('')}
      </div>

    `);

    // Events
    document.getElementById('search-input').addEventListener('input', e => {
      state.filters.q = e.target.value;
      renderRecipeList();
    });
    document.querySelectorAll('.filter-chip[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.filters.status = btn.dataset.status;
        renderRecipeList();
      });
    });
    document.getElementById('protein-filter').addEventListener('change', e => {
      state.filters.protein = e.target.value;
      renderRecipeList();
    });
    document.getElementById('time-filter').addEventListener('change', e => {
      state.filters.max_time = e.target.value;
      renderRecipeList();
    });
    document.querySelectorAll('.recipe-card').forEach(card => {
      card.addEventListener('click', () => navigate(`/recipes/${card.dataset.id}`));
    });

  } catch (err) {
    render(`<div class="error-state"><p>Could not load recipes.</p><p>${err.message}</p>
      <button class="btn btn-secondary" onclick="renderRecipeList()">Retry</button></div>`);
  }
}

function recipeCard(r) {
  return `
    <div class="recipe-card" data-id="${r.id}" role="button" tabindex="0">
      <div class="recipe-card-header">
        <span class="status-dot ${r.status}"></span>
        <span class="recipe-card-title">${escHtml(r.name)}</span>
      </div>
      <div class="tag-row">
${proteinTags(r.protein)}
        ${timeBadge(r.time_min)}
      </div>
      ${r.last_made ? `<div class="last-made-label">Last made ${formatDate(r.last_made)}</div>` : ''}
    </div>`;
}

// ================================================================
// Recipe Detail
// ================================================================
async function renderRecipeDetail(id) {
  setBackBtn(true, '/');
  setNavActive('');
  showBottomNav(true);
  loading();

  try {
    const r = await api(`/recipes/${id}`);
    setTitle(r.name);
    setHeaderActions(`
      <button class="icon-btn" id="edit-btn" aria-label="Edit recipe">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="icon-btn danger" id="delete-btn" aria-label="Delete recipe">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    `);

    const pantry = r.ingredients.filter(i => i.is_pantry_staple);
    const nonPantry = r.ingredients.filter(i => !i.is_pantry_staple);

    render(`
      <div class="recipe-detail">
        <div class="recipe-hero">
          <h2>${escHtml(r.name)}</h2>
          <div class="recipe-meta-row">
            <span class="tag tag-cuisine">${CUISINE_LABELS[r.cuisine] || r.cuisine || 'Other'}</span>
            ${proteinTags(r.protein)}
            ${timeBadge(r.time_min)}
            <span class="tag tag-protein">${STATUS_LABELS[r.status] || r.status}</span>
          </div>
          ${r.days && r.days !== 'any' ? `<div class="text-muted">${DAY_LABELS[r.days]}</div>` : ''}
          ${r.source ? `<div class="recipe-source">${escHtml(r.source)}</div>` : ''}
          ${r.notes ? `<div class="recipe-notes">${escHtml(r.notes)}</div>` : ''}
          ${r.last_made ? `<div class="recipe-last-made">Last made: ${formatDate(r.last_made)}</div>` : ''}
        </div>

        ${r.ingredients.length ? `
        <div class="section-card">
          <div class="section-title">Ingredients</div>
          <ul class="ingredient-list">
            ${nonPantry.map(i => ingredientRow(i)).join('')}
            ${pantry.map(i => ingredientRow(i, true)).join('')}
          </ul>
        </div>` : ''}

        ${r.steps.length ? `
        <div class="section-card">
          <div class="section-title">Steps</div>
          <ol class="step-list">
            ${r.steps.map(s => `
              <li class="step-item">
                <span class="step-num">${s.step_number}</span>
                <span class="step-text">${escHtml(s.instruction)}</span>
              </li>`).join('')}
          </ol>
        </div>` : ''}

        ${r.feedback.length ? `
        <div class="section-card">
          <div class="section-title">Feedback</div>
          ${r.feedback.map(f => `
            <div class="feedback-item">
              <div style="display:flex;align-items:center;gap:8px">
                ${f.rating ? `<span class="feedback-rating">${stars(f.rating)}</span>` : ''}
                <span class="feedback-date">${formatDate(f.date)}</span>
              </div>
              ${f.comment ? `<div class="feedback-comment">${escHtml(f.comment)}</div>` : ''}
            </div>`).join('')}
        </div>` : ''}
      </div>

      <div class="action-bar">
        <button class="btn btn-primary btn-icon" id="cooked-btn" style="flex:1">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Mark as Cooked
        </button>
        ${r.status === 'want_to_try' ? `
          <button class="btn btn-secondary" id="repertoire-btn">Move to Repertoire</button>
        ` : ''}
      </div>
    `);

    document.getElementById('edit-btn').onclick = () => navigate(`/recipes/${id}/edit`);
    document.getElementById('delete-btn').onclick = () => confirmDelete(r);
    document.getElementById('cooked-btn').onclick = () => showCookedModal(r);
    const repBtn = document.getElementById('repertoire-btn');
    if (repBtn) repBtn.onclick = () => moveToRepertoire(r);

  } catch (err) {
    render(`<div class="error-state"><p>${err.message}</p>
      <button class="btn btn-secondary" onclick="navigate('/')">Back to list</button></div>`);
  }
}

function ingredientRow(i, isPantry = false) {
  const qty = [i.quantity, i.unit].filter(Boolean).join(' ');
  return `<li class="ingredient-item ${isPantry ? 'pantry' : ''}">
    <span class="ingredient-qty">${escHtml(qty)}</span>
    <span class="ingredient-name">${escHtml(i.name)}</span>
  </li>`;
}

async function showCookedModal(r) {
  let rating = 0;
  showModal(`
    <div class="modal-title">Mark as Cooked</div>
    <p class="text-muted">How did <strong>${escHtml(r.name)}</strong> turn out?</p>
    <div class="rating-stars" id="stars">
      ${[1,2,3,4,5].map(n => `<button class="star-btn" data-n="${n}" aria-label="${n} stars">★</button>`).join('')}
    </div>
    <textarea class="comment-input" id="feedback-comment" placeholder="Optional comment…" rows="3"></textarea>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-secondary" style="flex:1" onclick="closeModal()">Skip</button>
      <button class="btn btn-primary" style="flex:1" id="save-cooked-btn">Save</button>
    </div>
  `);

  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      rating = parseInt(btn.dataset.n);
      document.querySelectorAll('.star-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.n) <= rating);
      });
    });
  });

  document.getElementById('save-cooked-btn').addEventListener('click', async () => {
    try {
      await api(`/recipes/${r.id}`, { method: 'PATCH', body: { last_made: isoToday() } });
      if (rating || document.getElementById('feedback-comment').value.trim()) {
        await api(`/recipes/${r.id}/feedback`, {
          method: 'POST',
          body: {
            rating: rating || null,
            comment: document.getElementById('feedback-comment').value.trim() || null,
          }
        });
      }
      closeModal();
      toast('Marked as cooked!', 'success');
      state.recipesLoaded = false;
      renderRecipeDetail(r.id);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function moveToRepertoire(r) {
  try {
    await api(`/recipes/${r.id}`, { method: 'PATCH', body: { status: 'repertoire' } });
    toast('Moved to Repertoire!', 'success');
    state.recipesLoaded = false;
    renderRecipeDetail(r.id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ================================================================
// Import Recipe
// ================================================================
function showImportModal() {
  showModal(`
    <div class="modal-title">Import Recipe</div>
    <div class="import-tabs" id="import-tabs">
      <button class="import-tab active" data-tab="text">Paste text</button>
      <button class="import-tab" data-tab="photo">Photo</button>
    </div>
    <div id="import-text-panel">
      <textarea class="import-textarea" id="import-text" placeholder="Paste recipe text here…"></textarea>
    </div>
    <div id="import-photo-panel" hidden>
      <label class="import-photo-label">
        <input type="file" id="import-photo-input" accept="image/*" capture="environment" hidden>
        <span class="btn btn-secondary btn-full" id="import-photo-btn">Choose photo or take picture</span>
      </label>
      <img id="import-photo-preview" class="import-photo-preview" hidden>
    </div>
    <button class="btn btn-primary btn-full mt-12" id="import-submit-btn">Import</button>
  `);

  let activeTab = 'text';

  document.querySelectorAll('.import-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.import-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('import-text-panel').hidden = activeTab !== 'text';
      document.getElementById('import-photo-panel').hidden = activeTab !== 'photo';
    });
  });

  document.getElementById('import-photo-btn').addEventListener('click', () => {
    document.getElementById('import-photo-input').click();
  });

  document.getElementById('import-photo-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = document.getElementById('import-photo-preview');
      img.src = ev.target.result;
      img.hidden = false;
      document.getElementById('import-photo-btn').textContent = 'Change photo';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('import-submit-btn').addEventListener('click', async () => {
    const btn = document.getElementById('import-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Importing…';

    try {
      let body = {};

      if (activeTab === 'text') {
        const text = document.getElementById('import-text').value.trim();
        if (!text) { toast('Paste some recipe text first', 'error'); return; }
        body.text = text;
      } else {
        const input = document.getElementById('import-photo-input');
        if (!input.files[0]) { toast('Choose a photo first', 'error'); return; }
        const { base64, mediaType } = await resizeAndEncode(input.files[0]);
        body.image_base64 = base64;
        body.image_media_type = mediaType;
      }

      const result = await api('/import-recipe', { method: 'POST', body });
      closeModal();
      state.recipesLoaded = false;
      toast(`"${result.name}" imported!`, 'success');
      navigate(`/recipes/${result.id}`);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Import';
    }
  });
}

function resizeAndEncode(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1024;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({
        base64: dataUrl.split(',')[1],
        mediaType: 'image/jpeg',
      });
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function confirmDelete(r) {
  showModal(`
    <div class="modal-title">Delete Recipe?</div>
    <p>Are you sure you want to delete <strong>${escHtml(r.name)}</strong>? This cannot be undone.</p>
    <div style="display:flex;gap:8px;margin-top:20px">
      <button class="btn btn-secondary" style="flex:1" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" style="flex:1" id="confirm-delete-btn">Delete</button>
    </div>
  `);
  document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    try {
      await api(`/recipes/${r.id}`, { method: 'DELETE' });
      closeModal();
      toast('Recipe deleted', 'success');
      state.recipesLoaded = false;
      navigate('/');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ================================================================
// Recipe Form (Create / Edit)
// ================================================================
async function renderRecipeForm(id) {
  const isEdit = id !== null;
  setTitle(isEdit ? 'Edit Recipe' : 'New Recipe');
  setBackBtn(true, isEdit ? `/recipes/${id}` : '/');
  setNavActive('');
  showBottomNav(false);
  setHeaderActions('');
  loading();

  let recipe = {
    name: '', status: 'want_to_try', days: 'any', cuisine: '',
    protein: [], time_min: '', source: '', source_url: '', notes: '',
    ingredients: [], steps: [],
  };

  if (isEdit) {
    try {
      const r = await api(`/recipes/${id}`);
      recipe = { ...r };
    } catch (err) {
      render(`<div class="error-state"><p>${err.message}</p></div>`);
      return;
    }
  }

  const proteins = ['chicken', 'pork', 'beef', 'lamb', 'fish', 'egg', 'vegetarian'];
  const cuisines = ['italian', 'scandinavian', 'asian', 'japanese', 'mexican', 'indian', 'french', 'other'];
  const statuses = ['want_to_try', 'repertoire', 'retired'];
  const days = ['any', 'weekday', 'weekend', 'friday'];
  const rp = recipe.protein || [];

  render(`
    <form class="recipe-form" id="recipe-form" autocomplete="off">

      <div class="form-section">
        <div class="form-section-title">Basic Info</div>
        <div class="form-field">
          <label class="form-label">Recipe name *</label>
          <input class="form-input" name="name" required value="${escHtml(recipe.name)}" placeholder="e.g. Pasta carbonara">
        </div>
        <div class="form-field">
          <label class="form-label">Time (minutes)</label>
          <input class="form-input" name="time_min" type="number" min="1" max="480"
            value="${recipe.time_min || ''}" placeholder="e.g. 30">
        </div>
        <div class="form-field">
          <label class="form-label">Source</label>
          <input class="form-input" name="source" value="${escHtml(recipe.source || '')}" placeholder="e.g. NYT Cooking, page 42">
        </div>
        <div class="form-field">
          <label class="form-label">Source URL</label>
          <input class="form-input" name="source_url" type="url" value="${escHtml(recipe.source_url || '')}" placeholder="https://…">
        </div>
        <div class="form-field">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" name="notes" placeholder="Family notes, variations…">${escHtml(recipe.notes || '')}</textarea>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Status</div>
        <div class="radio-group">
          ${statuses.map(s => `
            <span class="radio-chip">
              <input type="radio" name="status" id="st-${s}" value="${s}" ${recipe.status === s ? 'checked' : ''}>
              <label for="st-${s}">${STATUS_LABELS[s]}</label>
            </span>`).join('')}
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Best for</div>
        <div class="radio-group">
          ${days.map(d => `
            <span class="radio-chip">
              <input type="radio" name="days" id="d-${d}" value="${d}" ${recipe.days === d ? 'checked' : ''}>
              <label for="d-${d}">${DAY_LABELS[d]}</label>
            </span>`).join('')}
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Cuisine</div>
        <div class="radio-group">
          ${cuisines.map(c => `
            <span class="radio-chip">
              <input type="radio" name="cuisine" id="c-${c}" value="${c}" ${recipe.cuisine === c ? 'checked' : ''}>
              <label for="c-${c}">${CUISINE_LABELS[c]}</label>
            </span>`).join('')}
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Protein</div>
        <div class="checkbox-group">
          ${proteins.map(p => `
            <span class="checkbox-chip">
              <input type="checkbox" name="protein" id="p-${p}" value="${p}" ${rp.includes(p) ? 'checked' : ''}>
              <label for="p-${p}">${PROTEIN_LABELS[p]}</label>
            </span>`).join('')}
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Ingredients</div>
        <div class="form-hint">Name · Quantity · Unit · Pantry staple?</div>
        <div class="dynamic-list" id="ingredients-list">
          ${recipe.ingredients.length
            ? recipe.ingredients.map(i => ingredientFormRow(i)).join('')
            : ingredientFormRow({})}
        </div>
        <button type="button" class="add-row-btn" id="add-ingredient">+ Add ingredient</button>
      </div>

      <div class="form-section">
        <div class="form-section-title">Steps</div>
        <div class="dynamic-list" id="steps-list">
          ${recipe.steps.length
            ? recipe.steps.map((s, i) => stepFormRow(s.instruction, i)).join('')
            : stepFormRow('', 0)}
        </div>
        <button type="button" class="add-row-btn" id="add-step">+ Add step</button>
      </div>

      <button type="submit" class="btn btn-primary btn-full" id="save-btn">
        ${isEdit ? 'Save Changes' : 'Create Recipe'}
      </button>
      ${isEdit ? `<button type="button" class="btn btn-secondary btn-full" onclick="navigate('/recipes/${id}')">Cancel</button>` : ''}
    </form>
  `);

  // Dynamic rows
  document.getElementById('add-ingredient').addEventListener('click', () => {
    document.getElementById('ingredients-list').insertAdjacentHTML('beforeend', ingredientFormRow({}));
    renumberSteps();
  });
  document.getElementById('add-step').addEventListener('click', () => {
    const list = document.getElementById('steps-list');
    const count = list.querySelectorAll('.step-row').length;
    list.insertAdjacentHTML('beforeend', stepFormRow('', count));
    renumberSteps();
  });

  document.getElementById('ingredients-list').addEventListener('click', e => {
    if (e.target.closest('.remove-row-btn')) {
      e.target.closest('.dynamic-row').remove();
    }
  });
  document.getElementById('steps-list').addEventListener('click', e => {
    const btn = e.target.closest('.remove-row-btn');
    if (btn) { btn.closest('.dynamic-row').remove(); renumberSteps(); }
    const up = e.target.closest('.step-up');
    if (up) { const row = up.closest('.dynamic-row'); row.previousElementSibling?.before(row) || null; renumberSteps(); }
    const dn = e.target.closest('.step-down');
    if (dn) { const row = dn.closest('.dynamic-row'); row.nextElementSibling?.after(row) || null; renumberSteps(); }
  });

  document.getElementById('recipe-form').addEventListener('submit', async e => {
    e.preventDefault();
    await submitRecipeForm(id);
  });
}

function ingredientFormRow(i = {}) {
  return `<div class="dynamic-row">
    <input class="ing-name" type="text" placeholder="Name" value="${escHtml(i.name || '')}" required>
    <input class="ing-qty"  type="text" placeholder="Qty"  value="${escHtml(i.quantity || '')}">
    <input class="ing-unit" type="text" placeholder="Unit" value="${escHtml(i.unit || '')}">
    <label class="pantry-toggle" title="Pantry staple">
      <input type="checkbox" class="ing-pantry" ${i.is_pantry_staple ? 'checked' : ''}>
    </label>
    <button type="button" class="remove-row-btn" aria-label="Remove">×</button>
  </div>`;
}

function stepFormRow(text = '', idx = 0) {
  return `<div class="dynamic-row step-row">
    <span class="step-num-badge">${idx + 1}</span>
    <textarea class="step-text" placeholder="Step instruction…" rows="2">${escHtml(text)}</textarea>
    <div style="display:flex;flex-direction:column;gap:4px">
      <button type="button" class="step-up remove-row-btn" style="font-size:0.85rem" aria-label="Move up">↑</button>
      <button type="button" class="step-down remove-row-btn" style="font-size:0.85rem" aria-label="Move down">↓</button>
      <button type="button" class="remove-row-btn" aria-label="Remove">×</button>
    </div>
  </div>`;
}

function renumberSteps() {
  document.querySelectorAll('#steps-list .step-num-badge').forEach((b, i) => {
    b.textContent = i + 1;
  });
}

async function submitRecipeForm(id) {
  const form = document.getElementById('recipe-form');
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const body = {
    name: form.querySelector('[name=name]').value.trim(),
    status: form.querySelector('[name=status]:checked')?.value || 'want_to_try',
    days: form.querySelector('[name=days]:checked')?.value || 'any',
    cuisine: form.querySelector('[name=cuisine]:checked')?.value || null,
    protein: [...form.querySelectorAll('[name=protein]:checked')].map(el => el.value),
    time_min: parseInt(form.querySelector('[name=time_min]').value) || null,
    source: form.querySelector('[name=source]').value.trim() || null,
    source_url: form.querySelector('[name=source_url]').value.trim() || null,
    notes: form.querySelector('[name=notes]').value.trim() || null,
  };

  const ingredients = [...form.querySelectorAll('#ingredients-list .dynamic-row')]
    .map(row => ({
      name: row.querySelector('.ing-name').value.trim(),
      quantity: row.querySelector('.ing-qty').value.trim() || null,
      unit: row.querySelector('.ing-unit').value.trim() || null,
      is_pantry_staple: row.querySelector('.ing-pantry').checked,
    }))
    .filter(i => i.name);

  const steps = [...form.querySelectorAll('#steps-list .step-row')]
    .map((row, i) => ({
      step_number: i + 1,
      instruction: row.querySelector('.step-text').value.trim(),
    }))
    .filter(s => s.instruction);

  try {
    let recipeId;
    if (id) {
      await api(`/recipes/${id}`, { method: 'PATCH', body });
      recipeId = id;
    } else {
      const res = await api('/recipes', { method: 'POST', body });
      recipeId = res.id;
    }
    await api(`/recipes/${recipeId}/ingredients`, { method: 'PUT', body: ingredients });
    await api(`/recipes/${recipeId}/steps`, { method: 'PUT', body: steps });

    state.recipesLoaded = false;
    toast(id ? 'Recipe updated!' : 'Recipe created!', 'success');
    navigate(`/recipes/${recipeId}`);
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = id ? 'Save Changes' : 'Create Recipe';
  }
}

// ================================================================
// Planner
// ================================================================
function getWeekDays() {
  const today = new Date();
  const daysBack = (today.getDay() + 1) % 7; // 0=Sun..6=Sat → back to Saturday
  const sat = new Date(today);
  sat.setDate(today.getDate() - daysBack);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sat);
    d.setDate(sat.getDate() + i);
    return d;
  });
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function renderPlanner() {
  setTitle('Weekly Planner');
  setBackBtn(false);
  setNavActive('/planner');
  showBottomNav(true);
  setHeaderActions('');
  loading();

  try {
    const [recipes] = await Promise.all([
      loadRecipes(),
      state.preferences ? Promise.resolve(state.preferences) : api('/preferences').then(p => { state.preferences = p; }),
    ]);
    const recipeMap = Object.fromEntries(recipes.map(r => [r.id, r]));
    const weekDays = getWeekDays();
    const todayIso = isoToday();

    const warnings = computeWarnings(weekDays, recipeMap);

    render(`
      <div class="planner-view">
        ${warnings.length ? `
          <div class="week-warnings">
            ${warnings.map(w => `
              <div class="warning-item ${w.type}">
                <span class="warning-dot"></span>
                ${w.msg}
              </div>`).join('')}
          </div>` : ''}

        ${weekDays.map((day, i) => {
          const iso = isoDate(day);
          const rid = state.planner[iso];
          const recipe = rid ? recipeMap[rid] : null;
          const isToday = iso === todayIso;
          const dayName = WEEK_DAYS[i];
          const dateStr = day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          const dayBadges = getDayBadges(day, recipe, i);

          return `<div class="day-card${isToday ? ' today' : ''}" data-date="${iso}">
            <div class="day-header">
              <span class="day-label">${dayName}</span>
              <span class="day-date">${dateStr}${isToday ? ' · Today' : ''}</span>
              <div class="day-badge-row">${dayBadges}</div>
            </div>
            ${recipe
              ? `<div class="day-recipe">
                  <span class="day-recipe-name">${escHtml(recipe.name)}</span>
                  <div class="day-recipe-meta">
                    ${recipe.time_min ? `<span class="tag tag-time">${recipe.time_min}m</span>` : ''}
                    ${proteinTags(recipe.protein)}
                  </div>
                </div>`
              : `<div class="day-empty">
                  <span class="day-empty-plus">+</span>
                  <span>Tap to add a meal</span>
                </div>`}
          </div>`;
        }).join('')}

        <div class="planner-actions">
          <button class="btn btn-primary btn-full btn-icon" id="shopping-list-btn">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            Generate Shopping List
          </button>
          <button class="btn btn-secondary btn-full" id="clear-planner-btn">Clear Week</button>
        </div>
      </div>
    `);

    document.querySelectorAll('.day-card').forEach(card => {
      card.addEventListener('click', () => showDayPicker(card.dataset.date, recipeMap));
    });

    document.getElementById('shopping-list-btn').addEventListener('click', () =>
      showShoppingList(weekDays, recipeMap)
    );
    document.getElementById('clear-planner-btn').addEventListener('click', () => {
      if (confirm('Clear the entire week?')) {
        weekDays.forEach(d => delete state.planner[isoDate(d)]);
        savePlanner();
        renderPlanner();
      }
    });

  } catch (err) {
    render(`<div class="error-state"><p>${err.message}</p></div>`);
  }
}

function getDayBadges(day, recipe, weekIndex) {
  const badges = [];
  if (!recipe) return '';
  const p = state.preferences;
  if (!p || !recipe.time_min) return '';
  const DOW_KEY = ['max_time_sun','max_time_mon','max_time_tue','max_time_wed','max_time_thu','max_time_fri','max_time_sat'];
  const limit = p[DOW_KEY[day.getDay()]];
  if (limit && recipe.time_min > limit) {
    badges.push(`<span class="day-badge warn">${recipe.time_min}m &gt; ${limit}</span>`);
  }
  return badges.join('');
}

function computeWarnings(weekDays, recipeMap) {
  const warnings = [];
  const assigned = weekDays
    .map(d => state.planner[isoDate(d)])
    .filter(Boolean)
    .map(id => recipeMap[id])
    .filter(Boolean);

  if (assigned.length === 0) return [];

  const meatCount = assigned.filter(r =>
    r.protein && r.protein.some(p => MEAT_PROTEINS.includes(p))
  ).length;
  const beefCount = assigned.filter(r =>
    r.protein && r.protein.includes('beef')
  ).length;
  const fishCount = assigned.filter(r =>
    r.protein && r.protein.includes('fish')
  ).length;
  const vegCount = assigned.filter(r =>
    r.protein && r.protein.includes('vegetarian')
  ).length;

  if (meatCount > 4)
    warnings.push({ type: 'bad', msg: `${meatCount} meat meals this week (max 4)` });
  else if (meatCount === 4)
    warnings.push({ type: 'warn', msg: `4 meat meals — at the limit` });

  if (beefCount > 1)
    warnings.push({ type: 'bad', msg: `${beefCount} beef meals (max 1)` });

  if (fishCount === 0 && assigned.length >= 4)
    warnings.push({ type: 'warn', msg: 'No fish meal planned this week' });
  else if (fishCount >= 1)
    warnings.push({ type: 'ok', msg: `${fishCount} fish meal${fishCount > 1 ? 's' : ''} ✓` });

  if (vegCount < 2 && assigned.length >= 5)
    warnings.push({ type: 'info', msg: `Only ${vegCount} vegetarian meal${vegCount !== 1 ? 's' : ''} (target ≥2)` });

  return warnings;
}

async function showDayPicker(dateIso, recipeMap) {
  const existing = state.planner[dateIso];
  const recipes = state.recipes;

  showModal(`
    <div class="modal-title">Choose a Meal</div>
    <input class="recipe-picker-search" id="picker-search" type="search" placeholder="Search recipes…" autocomplete="off">
    <div class="recipe-picker-list" id="picker-list">
      ${recipes.map(r => `
        <div class="recipe-picker-item${existing == r.id ? ' active' : ''}" data-id="${r.id}">
          <div class="recipe-picker-item-name">${escHtml(r.name)}</div>
          <div class="recipe-picker-item-meta">
            ${CUISINE_LABELS[r.cuisine] || r.cuisine || ''}
            ${r.time_min ? `· ${r.time_min} min` : ''}
            ${(r.protein || []).map(p => PROTEIN_LABELS[p] || p).join(', ')}
          </div>
        </div>`).join('')}
    </div>
    ${existing ? `<button class="remove-day-btn" id="remove-day-btn">Remove meal from this day</button>` : ''}
  `);

  document.getElementById('picker-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.recipe-picker-item').forEach(item => {
      item.style.display = item.querySelector('.recipe-picker-item-name').textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  document.querySelectorAll('.recipe-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      state.planner[dateIso] = parseInt(item.dataset.id);
      savePlanner();
      closeModal();
      renderPlanner();
    });
  });

  const removeBtn = document.getElementById('remove-day-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      delete state.planner[dateIso];
      savePlanner();
      closeModal();
      renderPlanner();
    });
  }
}

async function showShoppingList(weekDays, recipeMap) {
  const recipeIds = [...new Set(
    weekDays.map(d => state.planner[isoDate(d)]).filter(Boolean)
  )];

  if (recipeIds.length === 0) {
    toast('No recipes planned this week', '');
    return;
  }

  showModal('<div class="loading-state" style="height:160px"><div class="spinner"></div></div>');

  try {
    const { shopping, pantry_check } = await api('/shopping-list', {
      method: 'POST',
      body: recipeIds,
    });

    const html = `
      <div class="modal-title">Shopping List</div>
      <div class="shopping-list-section">
        <h4>To Buy (${shopping.length} items)</h4>
        ${shopping.map(i => `
          <div class="shopping-item">
            <span class="shopping-qty">${escHtml([i.quantity, i.unit].filter(Boolean).join(' '))}</span>
            <span>
              <span class="shopping-name">${escHtml(i.name)}</span>
              <span class="shopping-recipe"> — ${escHtml(i.recipe_name)}</span>
            </span>
          </div>`).join('') || '<p class="text-muted">No items</p>'}
      </div>
      ${pantry_check.length ? `
      <div class="shopping-list-section">
        <h4>Pantry — Check at Home (${pantry_check.length} items)</h4>
        ${pantry_check.map(i => `
          <div class="shopping-item pantry-item">
            <span class="shopping-qty">${escHtml([i.quantity, i.unit].filter(Boolean).join(' '))}</span>
            <span class="shopping-name">${escHtml(i.name)}</span>
          </div>`).join('')}
      </div>` : ''}
      <button class="btn btn-primary btn-full mt-12" id="copy-list-btn">Copy to Clipboard</button>
    `;

    showModal(html);

    document.getElementById('copy-list-btn').addEventListener('click', () => {
      const text = [
        '🛒 Shopping List\n',
        ...shopping.map(i => `• ${[i.quantity, i.unit].filter(Boolean).join(' ')} ${i.name} (${i.recipe_name})`),
        pantry_check.length ? '\n📦 Check pantry:' : '',
        ...pantry_check.map(i => `• ${i.name}`),
      ].filter(Boolean).join('\n');

      navigator.clipboard.writeText(text)
        .then(() => toast('Copied!', 'success'))
        .catch(() => toast('Copy failed — try manually', 'error'));
    });

  } catch (err) {
    showModal(`<div class="error-state"><p>${err.message}</p><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>`);
  }
}

// ================================================================
// Preferences
// ================================================================
async function renderPreferences() {
  setTitle('Settings');
  setBackBtn(false);
  setNavActive('/preferences');
  showBottomNav(true);
  setHeaderActions('');
  loading();

  try {
    const p = await api('/preferences');
    state.preferences = p;
    const avoid = p.avoid_ingredients || [];

    render(`
      <form class="preferences-form" id="prefs-form">

        <div class="pref-section">
          <div class="pref-section-title">Household</div>
          <div class="pref-row">
            <label class="pref-label">Adults <span class="pref-sub">Number of adult servings</span></label>
            <input class="pref-input" type="number" name="servings_adults" min="1" max="10" value="${p.servings_adults}">
          </div>
          <div class="pref-row">
            <label class="pref-label">Children <span class="pref-sub">Number of child servings</span></label>
            <input class="pref-input" type="number" name="servings_children" min="0" max="10" value="${p.servings_children}">
          </div>
        </div>

        <div class="pref-section">
          <div class="pref-section-title">Dietary Targets (per week)</div>
          <div class="pref-row">
            <label class="pref-label">Max meat meals <span class="pref-sub">Pork, beef, lamb, chicken</span></label>
            <input class="pref-input" type="number" name="max_meat_per_week" min="0" max="7" value="${p.max_meat_per_week}">
          </div>
          <div class="pref-row">
            <label class="pref-label">Max beef meals</label>
            <input class="pref-input" type="number" name="max_beef_per_week" min="0" max="7" value="${p.max_beef_per_week}">
          </div>
          <div class="pref-row">
            <label class="pref-label">Min legume meals <span class="pref-sub">Beans, lentils, chickpeas</span></label>
            <input class="pref-input" type="number" name="min_legumes_per_week" min="0" max="7" value="${p.min_legumes_per_week}">
          </div>
          <div class="pref-row">
            <label class="pref-label">Min leafy greens meals</label>
            <input class="pref-input" type="number" name="min_leafy_greens_per_week" min="0" max="7" value="${p.min_leafy_greens_per_week}">
          </div>
          <div class="pref-row">
            <label class="pref-label">Min fish meals</label>
            <input class="pref-input" type="number" name="min_fish_per_week" min="0" max="7" value="${p.min_fish_per_week}">
          </div>
        </div>

        <div class="pref-section">
          <div class="pref-section-title">Time Limits (minutes per day)</div>
          ${[
            ['Monday',    'max_time_mon'],
            ['Tuesday',   'max_time_tue'],
            ['Wednesday', 'max_time_wed'],
            ['Thursday',  'max_time_thu'],
            ['Friday',    'max_time_fri'],
            ['Saturday',  'max_time_sat'],
            ['Sunday',    'max_time_sun'],
          ].map(([label, key]) => `
          <div class="pref-row">
            <label class="pref-label">${label}</label>
            <input class="pref-input" type="number" name="${key}" min="10" max="480" value="${p[key]}">
          </div>`).join('')}
        </div>

        <div class="pref-section">
          <div class="pref-section-title">Avoid Ingredients</div>
          <div class="avoid-list" id="avoid-list">
            ${avoid.map(a => avoidRow(a)).join('')}
          </div>
          <button type="button" class="add-row-btn" id="add-avoid">+ Add ingredient</button>
        </div>

        <button type="submit" class="btn btn-primary btn-full">Save Preferences</button>
      </form>
    `);

    document.getElementById('add-avoid').addEventListener('click', () => {
      document.getElementById('avoid-list').insertAdjacentHTML('beforeend', avoidRow(''));
    });
    document.getElementById('avoid-list').addEventListener('click', e => {
      if (e.target.closest('.remove-row-btn')) {
        e.target.closest('.avoid-item').remove();
      }
    });

    document.getElementById('prefs-form').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Saving…';

      const avoidIngredients = [...form.querySelectorAll('.avoid-input')]
        .map(el => el.value.trim()).filter(Boolean);

      const body = {
        servings_adults: parseInt(form.servings_adults.value),
        servings_children: parseInt(form.servings_children.value),
        max_meat_per_week: parseInt(form.max_meat_per_week.value),
        max_beef_per_week: parseInt(form.max_beef_per_week.value),
        min_legumes_per_week: parseInt(form.min_legumes_per_week.value),
        min_leafy_greens_per_week: parseInt(form.min_leafy_greens_per_week.value),
        min_fish_per_week: parseInt(form.min_fish_per_week.value),
        max_time_mon: parseInt(form.max_time_mon.value),
        max_time_tue: parseInt(form.max_time_tue.value),
        max_time_wed: parseInt(form.max_time_wed.value),
        max_time_thu: parseInt(form.max_time_thu.value),
        max_time_fri: parseInt(form.max_time_fri.value),
        max_time_sat: parseInt(form.max_time_sat.value),
        max_time_sun: parseInt(form.max_time_sun.value),
        avoid_ingredients: avoidIngredients,
      };

      try {
        await api('/preferences', { method: 'PATCH', body });
        toast('Preferences saved!', 'success');
        state.preferences = null;
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Preferences';
      }
    });

  } catch (err) {
    render(`<div class="error-state"><p>${err.message}</p></div>`);
  }
}

function avoidRow(val) {
  return `<div class="avoid-item">
    <input class="avoid-input" type="text" value="${escHtml(val)}" placeholder="e.g. peanuts">
    <button type="button" class="remove-row-btn" aria-label="Remove">×</button>
  </div>`;
}

// ================================================================
// Helpers
// ================================================================
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ================================================================
// Init
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }

  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  // Close modal on overlay click
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Start routing — if opening at root and today has a planned recipe, go straight to it
  const startPath = location.pathname + location.search;
  if (startPath === '/' || startPath === '') {
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayRecipeId = state.planner[todayIso];
    if (todayRecipeId) {
      route(`/recipes/${todayRecipeId}`);
    } else {
      route('/');
    }
  } else {
    route(startPath);
  }
});
