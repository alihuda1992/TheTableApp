// ============================================================
// app.js — Main UI logic
// ============================================================
import { initAuth, signIn, signUp, signOut, currentUser, currentProfile } from './auth.js';
import * as DB from './db.js';
import { initMap, refreshMarkers, locateUser } from './map.js';

// ============ STATE ============
let restaurants = [];
let dishes = [];
let activeTab = 'restaurants';
let editingRestaurantId = null;
let editingDishId = null;
let viewingRestaurantId = null;
let acResults = [];
let acIndex = -1;
let acTimer = null;
let pendingCoords = null;
const ratings = { food: 0, atmosphere: 0, service: 0, noise: 0, value: 0 };
const ratingFields = ['food', 'atmosphere', 'service', 'noise', 'value'];
const ratingLabels = { food:'Food Quality', atmosphere:'Atmosphere', service:'Service', noise:'Noise Level', value:'Value' };

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  registerSW();
  const { user } = await initAuth();
  if (user) {
    showApp();
    await loadAll();
  } else {
    showAuth();
  }
  window.addEventListener('auth-change', e => {
    if (e.detail.user) { showApp(); loadAll(); }
    else showAuth();
  });
  wireAuthForms();
  wireNavTabs();
  wireModals();
  wireForms();
  wireMap();
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ============ AUTH UI ============
function showAuth() {
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
}
function showApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  updateProfileNav();
}

function wireAuthForms() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById(t.dataset.form).classList.add('active');
      document.querySelectorAll('.auth-error').forEach(e => e.classList.remove('visible'));
    });
  });

  // Sign in
  document.getElementById('signin-btn').addEventListener('click', async () => {
    const email = document.getElementById('si-email').value.trim();
    const pw = document.getElementById('si-password').value;
    const err = document.getElementById('signin-error');
    if (!email || !pw) { showErr(err, 'Please fill in all fields.'); return; }
    setLoading('signin-btn', true);
    try {
      await signIn(email, pw);
      err.classList.remove('visible');
    } catch(e) {
      showErr(err, e.message || 'Sign in failed. Please check your credentials.');
    }
    setLoading('signin-btn', false);
  });

  // Sign up
  document.getElementById('signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('su-email').value.trim();
    const pw = document.getElementById('su-password').value;
    const username = document.getElementById('su-username').value.trim();
    const name = document.getElementById('su-name').value.trim();
    const err = document.getElementById('signup-error');
    if (!email || !pw || !username) { showErr(err, 'Email, password, and username are required.'); return; }
    if (pw.length < 6) { showErr(err, 'Password must be at least 6 characters.'); return; }
    if (!/^[a-z0-9_]+$/i.test(username)) { showErr(err, 'Username: letters, numbers, underscores only.'); return; }
    setLoading('signup-btn', true);
    try {
      await signUp(email, pw, username, name || username);
      showErr(document.getElementById('signup-error'), '✓ Check your email to confirm your account, then sign in.', true);
    } catch(e) {
      showErr(err, e.message || 'Sign up failed.');
    }
    setLoading('signup-btn', false);
  });
}

function showErr(el, msg, success = false) {
  el.textContent = msg;
  el.style.color = success ? 'var(--sage)' : '';
  el.style.borderLeftColor = success ? 'var(--sage)' : '';
  el.classList.add('visible');
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : btn.dataset.label;
}

// ============ NAV / TABS ============
function wireNavTabs() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  if (tab === 'map') { initMap(restaurants); }
  if (tab === 'community') { loadCommunity(); }
}

// ============ LOAD DATA ============
async function loadAll() {
  try {
    [restaurants, dishes] = await Promise.all([DB.getMyRestaurants(), DB.getMyDishes()]);
    renderRestaurants();
    renderDishes();
    updateProfileTab();
  } catch(e) {
    toast('Error loading data: ' + e.message);
  }
}

// ============ RESTAURANTS TAB ============
function renderRestaurants() {
  const search = (document.getElementById('r-search')?.value || '').toLowerCase();
  const sort = document.getElementById('r-sort')?.value || 'date-desc';
  document.getElementById('r-count').textContent = `${restaurants.length} restaurant${restaurants.length !== 1 ? 's' : ''} in your journal`;

  let list = restaurants.filter(r =>
    r.name.toLowerCase().includes(search) ||
    (r.city||'').toLowerCase().includes(search) ||
    (r.cuisine||'').toLowerCase().includes(search)
  );
  if (sort === 'date-desc') list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  else if (sort === 'date-asc') list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  else if (sort === 'overall-desc') list.sort((a,b) => (b.overall||0)-(a.overall||0));
  else if (sort === 'name') list.sort((a,b) => a.name.localeCompare(b.name));

  const grid = document.getElementById('restaurants-grid');
  if (!list.length) {
    grid.innerHTML = emptyState('🍽', restaurants.length ? 'No results' : 'Your journal is empty', restaurants.length ? 'Try a different search.' : 'Tap + to add your first restaurant.');
    return;
  }
  grid.innerHTML = list.map(r => restaurantCardHtml(r)).join('');
  grid.querySelectorAll('.card').forEach(c => {
    c.addEventListener('click', () => openViewModal(c.dataset.id));
  });
}

function restaurantCardHtml(r) {
  const dishCount = dishes.filter(d => d.restaurantId === r.id).length;
  const scores = ratingFields.map(f => `
    <div class="score-pill">
      <span class="score-pill-name">${f === 'atmosphere' ? 'Atmo' : f.charAt(0).toUpperCase()+f.slice(1)}</span>
      <span class="score-pill-val">${r.ratings[f] || '–'}</span>
    </div>`).join('');
  const returnLabels = { yes:'↩ Return', maybe:'↩ Maybe', no:'✕ No return' };
  return `<div class="card" data-id="${r.id}">
    <div class="card-accent"></div>
    <div class="card-body">
      <div class="card-name">${esc(r.name)}</div>
      <div class="card-meta">
        ${r.cuisine ? `<span>🍴 ${esc(r.cuisine)}</span>` : ''}
        ${r.city ? `<span>📍 ${esc(r.city)}</span>` : ''}
        ${r.date ? `<span>🗓 ${esc(r.date)}</span>` : ''}
      </div>
      <div class="card-scores">${scores}</div>
      ${r.notes ? `<div class="card-notes">${esc(r.notes)}</div>` : ''}
    </div>
    <div class="card-footer">
      ${r.overall ? `<span class="badge"><span class="badge-num">${r.overall}</span>&nbsp;/ 5</span>` : ''}
      ${r.wouldReturn ? `<span style="font-size:0.7rem;color:var(--muted)">${returnLabels[r.wouldReturn]||''}</span>` : ''}
      ${dishCount ? `<span style="font-size:0.7rem;color:var(--muted)">🥘 ${dishCount} dish${dishCount>1?'es':''}</span>` : ''}
      ${r.isPublic ? `<span class="public-tag">Public</span>` : ''}
    </div>
  </div>`;
}

// ============ VIEW MODAL ============
function openViewModal(id) {
  viewingRestaurantId = id;
  renderViewModal();
  openModal('view-modal');
}

function renderViewModal() {
  const id = viewingRestaurantId;
  const r = restaurants.find(x => x.id === id);
  if (!r) return;
  document.getElementById('view-name').textContent = r.name;
  document.getElementById('view-meta').textContent = [r.cuisine, r.city, r.date].filter(Boolean).join(' · ');

  const scoresHtml = ratingFields.map(f => {
    const v = r.ratings[f] || 0;
    const stars = Array.from({length:5},(_,i)=>`<span class="view-star" style="color:${i<v?'var(--gold)':'var(--border)'}"'>★</span>`).join('');
    return `<div class="view-score-row">
      <span class="view-score-label">${ratingLabels[f]}</span>
      <div class="view-score-stars">${stars}<span class="view-score-num">${v||'–'}</span></div>
    </div>`;
  }).join('');

  const dishList = dishes.filter(d => d.restaurantId === id)
    .sort((a,b) => ['Starter','Main','Dessert','Drink','Side','Other'].indexOf(a.category) - ['Starter','Main','Dessert','Drink','Side','Other'].indexOf(b.category));

  const dishesHtml = dishList.map(d => {
    const col = d.rating >= 8 ? 'var(--sage)' : d.rating >= 5 ? 'var(--gold)' : '#d4805a';
    return `<div class="inline-dish">
      <div class="inline-dish-bar" style="background:${col}"></div>
      <div class="inline-dish-info">
        <div class="inline-dish-name">${esc(d.name)}${d.category?`<span class="cat-tag">${d.category}</span>`:''}</div>
        ${d.notes?`<div class="inline-dish-notes">${esc(d.notes)}</div>`:''}
      </div>
      <div class="inline-dish-right">
        <div style="text-align:center">
          <div class="inline-dish-score">${d.rating}</div>
          <div class="inline-dish-denom">/ 10</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          <button class="btn-icon" onclick="window._editDish('${d.id}')">✏️</button>
          <button class="btn-icon" onclick="window._delDish('${d.id}')">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const returnLabels = { yes:'↩ Would return', maybe:'↩ Maybe return', no:'✕ Would not return' };

  document.getElementById('view-body').innerHTML = `
    ${r.address?`<div style="font-size:0.78rem;color:var(--muted);margin-bottom:12px">📍 ${esc(r.address)}</div>`:''}
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
      ${r.overall?`<span class="badge"><span class="badge-num">${r.overall}</span>&nbsp;/ 5 avg</span>`:''}
      ${r.wouldReturn?`<span style="font-size:0.73rem;color:var(--muted);padding:3px 10px;border:1px solid var(--border)">${returnLabels[r.wouldReturn]}</span>`:''}
      ${r.isPublic?`<span class="public-tag">Public</span>`:''}
    </div>
    <div class="view-scores">${scoresHtml}</div>
    ${r.notes?`<div class="view-quote">"${esc(r.notes)}"</div>`:''}
    <div class="view-dishes-head">
      <div class="view-dishes-title">Dishes Tried <span style="font-size:0.72rem;font-family:'DM Sans',sans-serif;color:var(--muted)">${dishList.length ? dishList.length + ' dish' + (dishList.length>1?'es':'') : ''}</span></div>
      <button class="btn-primary" style="font-size:0.7rem;padding:7px 13px" onclick="window._addDishForRest('${id}')">+ Dish</button>
    </div>
    ${dishesHtml || `<div class="dishes-empty">No dishes logged yet — tap + Dish to add one</div>`}
    <div class="form-actions" style="margin-top:20px">
      <button class="btn-danger" onclick="window._delRest('${id}')">Delete</button>
      <button class="btn-secondary" onclick="window._editRest('${id}')">Edit</button>
    </div>
  `;
}

// Bridge functions callable from innerHTML
window._editRest = (id) => { closeModal('view-modal'); openRestaurantModal(id); };
window._delRest = async (id) => {
  if (!confirm('Delete this restaurant and all its dishes?')) return;
  try {
    await DB.deleteRestaurant(id);
    dishes = dishes.filter(d => d.restaurantId !== id);
    restaurants = restaurants.filter(r => r.id !== id);
    closeModal('view-modal');
    renderRestaurants();
    toast('Restaurant deleted');
  } catch(e) { toast('Error: ' + e.message); }
};
window._editDish = (id) => openDishModal(id);
window._delDish = async (id) => {
  if (!confirm('Delete this dish?')) return;
  try {
    await DB.deleteDish(id);
    dishes = dishes.filter(d => d.id !== id);
    renderViewModal();
    renderDishes();
    toast('Dish deleted');
  } catch(e) { toast('Error: ' + e.message); }
};
window._addDishForRest = (restaurantId) => openDishModal(null, restaurantId);

// ============ RESTAURANT MODAL (Add/Edit) ============
function openRestaurantModal(id = null) {
  editingRestaurantId = id;
  pendingCoords = null;
  acResults = [];
  clearTimeout(acTimer);
  const dropdown = document.getElementById('r-ac');
  if (dropdown) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; }
  const hint = document.getElementById('r-hint');

  ratingFields.forEach(f => { ratings[f] = 0; });
  buildStars();

  if (id) {
    const r = restaurants.find(x => x.id === id);
    document.getElementById('rm-title').textContent = 'Edit Restaurant';
    document.getElementById('rm-name').value = r.name;
    document.getElementById('rm-cuisine').value = r.cuisine || '';
    document.getElementById('rm-city').value = r.city || '';
    document.getElementById('rm-date').value = r.date || '';
    document.getElementById('rm-address').value = r.address || '';
    document.getElementById('rm-notes').value = r.notes || '';
    document.getElementById('rm-return').value = r.wouldReturn || '';
    document.getElementById('rm-public').checked = r.isPublic || false;
    if (hint) hint.textContent = 'Edit the name or search again to change restaurant';
    pendingCoords = r.coords;
    ratingFields.forEach(f => { ratings[f] = r.ratings[f] || 0; });
    buildStars();
    updateStarDisplay();
  } else {
    document.getElementById('rm-title').textContent = 'Add Restaurant';
    ['rm-name','rm-cuisine','rm-city','rm-date','rm-address','rm-notes'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) el.value = '';
    });
    document.getElementById('rm-return').value = '';
    document.getElementById('rm-public').checked = false;
    if (hint) hint.textContent = 'Type a name to search — or fill in manually';
  }
  openModal('restaurant-modal');
}

// Autocomplete
function wireRestaurantSearch() {
  const input = document.getElementById('rm-name');
  const dropdown = document.getElementById('r-ac');
  const hint = document.getElementById('r-hint');
  if (!input) return;

  input.addEventListener('input', () => {
    const val = input.value.trim();
    clearTimeout(acTimer);
    acIndex = -1;
    if (val.length < 2) {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
      if (hint) hint.textContent = 'Type a name to search — or fill in manually';
      return;
    }
    if (hint) hint.textContent = 'Searching…';
    acTimer = setTimeout(() => doSearch(val), 380);
  });

  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('.ac-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = Math.min(acIndex+1, items.length-1); highlightAc(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = Math.max(acIndex-1, 0); highlightAc(items); }
    else if (e.key === 'Enter' && acIndex >= 0) { e.preventDefault(); selectAc(acIndex); }
    else if (e.key === 'Escape') { dropdown.classList.remove('open'); }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrapper')) dropdown.classList.remove('open');
  });
}

async function doSearch(query) {
  const dropdown = document.getElementById('r-ac');
  const hint = document.getElementById('r-hint');
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&namedetails=1&limit=8&accept-language=en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    acResults = data.slice(0, 7);
    if (!acResults.length) {
      dropdown.classList.remove('open');
      if (hint) hint.textContent = 'No results — fill in details manually';
      return;
    }
    dropdown.innerHTML = acResults.map((r, i) => {
      const addr = r.address || {};
      const name = r.namedetails?.name || r.display_name.split(',')[0];
      const city = [addr.city || addr.town || addr.village || addr.county, addr.state].filter(Boolean).join(', ');
      const road = [addr.house_number ? addr.house_number+' '+addr.road : addr.road].filter(Boolean).join('');
      const fullAddr = [road, city].filter(Boolean).join(', ');
      const type = (r.type||'').replace(/_/g,' ');
      return `<div class="ac-item" data-i="${i}">
        <div class="ac-item-name">${esc(name)}</div>
        ${fullAddr ? `<div class="ac-item-addr">${esc(fullAddr)}</div>` : ''}
        ${type ? `<div class="ac-item-type">${esc(type)}</div>` : ''}
      </div>`;
    }).join('');
    dropdown.querySelectorAll('.ac-item').forEach(item => {
      item.addEventListener('click', () => selectAc(parseInt(item.dataset.i)));
      item.addEventListener('touchend', e => { e.preventDefault(); selectAc(parseInt(item.dataset.i)); });
    });
    dropdown.classList.add('open');
    if (hint) hint.textContent = `${acResults.length} result${acResults.length>1?'s':''} — select one or keep typing`;
  } catch(e) {
    dropdown.classList.remove('open');
    if (hint) hint.textContent = 'Search unavailable — enter details manually';
  }
}

function highlightAc(items) {
  items.forEach((el, i) => el.classList.toggle('hi', i === acIndex));
}

function selectAc(i) {
  const r = acResults[i];
  if (!r) return;
  const addr = r.address || {};
  const name = r.namedetails?.name || r.display_name.split(',')[0];
  const road = addr.house_number ? addr.house_number+' '+(addr.road||'') : (addr.road||'');
  const city = [addr.city||addr.town||addr.village||addr.county, addr.state].filter(Boolean).join(', ');
  const fullAddr = [road, city, addr.country].filter(Boolean).join(', ');

  document.getElementById('rm-name').value = name;
  document.getElementById('rm-city').value = city;
  document.getElementById('rm-address').value = fullAddr;
  pendingCoords = { lat: parseFloat(r.lat), lng: parseFloat(r.lon) };

  const typeMap = { cafe:'Café', bar:'Bar', fast_food:'Fast Food', restaurant:'', bakery:'Bakery', ice_cream:'Dessert' };
  const guess = typeMap[r.type];
  if (guess !== undefined && !document.getElementById('rm-cuisine').value) {
    document.getElementById('rm-cuisine').value = guess;
  }

  document.getElementById('r-ac').classList.remove('open');
  const hint = document.getElementById('r-hint');
  if (hint) hint.textContent = `✓ ${name} selected`;
  acResults = []; acIndex = -1;
}

// ============ STARS ============
function buildStars() {
  ratingFields.forEach(f => {
    const container = document.querySelector(`[data-field="${f}"]`);
    if (!container) return;
    container.innerHTML = Array.from({length:5}, (_,i) =>
      `<span class="star${ratings[f] > i ? ' on' : ''}" data-val="${i+1}">★</span>`
    ).join('');
    container.querySelectorAll('.star').forEach(s => {
      s.addEventListener('click', () => {
        ratings[f] = parseInt(s.dataset.val);
        updateStarDisplay();
      });
      s.addEventListener('touchend', e => { e.preventDefault(); ratings[f] = parseInt(s.dataset.val); updateStarDisplay(); });
    });
  });
}

function updateStarDisplay() {
  ratingFields.forEach(f => {
    document.querySelectorAll(`[data-field="${f}"] .star`).forEach((s,i) => {
      s.classList.toggle('on', i < ratings[f]);
    });
    const valEl = document.getElementById(`sv-${f}`);
    if (valEl) valEl.textContent = ratings[f] || '–';
  });
}

// ============ SAVE RESTAURANT ============
async function saveRestaurant() {
  const name = document.getElementById('rm-name').value.trim();
  if (!name) { toast('Please enter a restaurant name'); return; }

  const btn = document.getElementById('rm-save');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const form = {
      name,
      cuisine: document.getElementById('rm-cuisine').value.trim(),
      city: document.getElementById('rm-city').value.trim(),
      date: document.getElementById('rm-date').value.trim(),
      address: document.getElementById('rm-address').value.trim(),
      notes: document.getElementById('rm-notes').value.trim(),
      wouldReturn: document.getElementById('rm-return').value,
      isPublic: document.getElementById('rm-public').checked,
      ratings: { ...ratings },
      coords: pendingCoords,
    };
    const saved = await DB.saveRestaurant(form, editingRestaurantId);
    if (editingRestaurantId) {
      restaurants = restaurants.map(r => r.id === editingRestaurantId ? saved : r);
    } else {
      restaurants.unshift(saved);
    }
    closeModal('restaurant-modal');
    renderRestaurants();
    if (activeTab === 'map') refreshMarkers(restaurants);
    toast(editingRestaurantId ? 'Restaurant updated' : 'Restaurant added!');
  } catch(e) {
    toast('Error saving: ' + e.message);
  }
  btn.disabled = false; btn.textContent = 'Save';
}

// ============ DISHES TAB ============
function renderDishes() {
  const search = (document.getElementById('d-search')?.value || '').toLowerCase();
  const filterR = document.getElementById('d-filter-rest')?.value || '';
  const sort = document.getElementById('d-sort')?.value || 'date-desc';
  document.getElementById('d-count').textContent = `${dishes.length} dish${dishes.length!==1?'es':''} recorded`;

  // Populate restaurant filter
  const filterSel = document.getElementById('d-filter-rest');
  if (filterSel) {
    const cur = filterSel.value;
    filterSel.innerHTML = '<option value="">All Restaurants</option>' +
      restaurants.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    filterSel.value = cur;
  }

  let list = dishes.filter(d =>
    d.name.toLowerCase().includes(search) &&
    (!filterR || d.restaurantId === filterR)
  );
  if (sort === 'date-desc') list.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  else if (sort === 'rating-desc') list.sort((a,b) => b.rating-a.rating);
  else if (sort === 'rating-asc') list.sort((a,b) => a.rating-b.rating);
  else if (sort === 'name') list.sort((a,b) => a.name.localeCompare(b.name));

  const container = document.getElementById('dishes-list');
  if (!list.length) {
    container.innerHTML = emptyState('🥘', dishes.length ? 'No results' : 'No dishes yet', 'Add dishes you\'ve tried at your restaurants.');
    return;
  }
  container.innerHTML = list.map(d => {
    const rest = restaurants.find(r => r.id === d.restaurantId);
    const col = d.rating >= 8 ? 'score-high' : d.rating >= 5 ? 'score-mid' : 'score-low';
    return `<div class="dish-card">
      <div class="dish-bar ${col}"></div>
      <div class="dish-info">
        <div class="dish-name">${esc(d.name)}${d.category?`<span class="cat-tag">${d.category}</span>`:''}</div>
        ${rest?`<div class="dish-rest">at ${esc(rest.name)}</div>`:''}
        ${d.notes?`<div class="dish-notes-text">${esc(d.notes)}</div>`:''}
      </div>
      <div class="dish-right">
        <div class="dish-score">
          <div class="big">${d.rating}</div>
          <div class="small">/ 10</div>
        </div>
        <div class="dish-actions">
          <button class="btn-icon dish-edit" data-id="${d.id}">✏️</button>
          <button class="btn-icon dish-del" data-id="${d.id}">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('.dish-edit').forEach(b => b.addEventListener('click', () => openDishModal(b.dataset.id)));
  container.querySelectorAll('.dish-del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete dish?')) return;
    try { await DB.deleteDish(b.dataset.id); dishes = dishes.filter(d => d.id !== b.dataset.id); renderDishes(); toast('Deleted'); } catch(e) { toast(e.message); }
  }));
}

function openDishModal(id = null, preRestId = null) {
  editingDishId = id;
  const rSel = document.getElementById('dm-restaurant');
  rSel.innerHTML = '<option value="">— Select restaurant —</option>' +
    restaurants.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');

  if (id) {
    const d = dishes.find(x => x.id === id);
    document.getElementById('dm-title').textContent = 'Edit Dish';
    document.getElementById('dm-name').value = d.name;
    rSel.value = d.restaurantId || '';
    document.getElementById('dm-rating').value = d.rating;
    document.getElementById('dm-category').value = d.category || '';
    document.getElementById('dm-notes').value = d.notes || '';
    document.getElementById('dm-public').checked = d.isPublic || false;
    updateRangeDisplay();
  } else {
    document.getElementById('dm-title').textContent = 'Add Dish';
    document.getElementById('dm-name').value = '';
    rSel.value = preRestId || '';
    document.getElementById('dm-rating').value = 7;
    document.getElementById('dm-category').value = '';
    document.getElementById('dm-notes').value = '';
    document.getElementById('dm-public').checked = false;
    updateRangeDisplay();
  }
  openModal('dish-modal');
}

function updateRangeDisplay() {
  const val = document.getElementById('dm-rating')?.value || 7;
  const el = document.getElementById('dm-rating-display');
  if (el) el.innerHTML = `${val} <span>/ 10</span>`;
}

async function saveDish() {
  const name = document.getElementById('dm-name').value.trim();
  if (!name) { toast('Please enter a dish name'); return; }
  const btn = document.getElementById('dm-save');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const form = {
      name,
      restaurantId: document.getElementById('dm-restaurant').value || null,
      rating: parseInt(document.getElementById('dm-rating').value),
      category: document.getElementById('dm-category').value || null,
      notes: document.getElementById('dm-notes').value.trim(),
      isPublic: document.getElementById('dm-public').checked,
    };
    const saved = await DB.saveDish(form, editingDishId);
    if (editingDishId) {
      dishes = dishes.map(d => d.id === editingDishId ? saved : d);
    } else {
      dishes.unshift(saved);
    }
    closeModal('dish-modal');
    renderDishes();
    if (viewingRestaurantId) renderViewModal();
    toast(editingDishId ? 'Dish updated' : 'Dish added!');
  } catch(e) {
    toast('Error: ' + e.message);
  }
  btn.disabled = false; btn.textContent = 'Save';
}

// ============ MAP TAB ============
function wireMap() {
  document.getElementById('map-filter')?.addEventListener('input', e => {
    const search = e.target.value.toLowerCase();
    const filtered = restaurants.filter(r => r.name.toLowerCase().includes(search));
    refreshMarkers(filtered);
  });
  document.getElementById('near-me-btn')?.addEventListener('click', () => {
    const status = document.getElementById('near-me-status');
    if (status) status.textContent = 'Locating…';
    locateUser(restaurants, nearest => {
      if (nearest) {
        if (status) status.textContent = `Nearest: ${nearest.name} (${nearest.dist.toFixed(1)} km)`;
      } else {
        if (status) status.textContent = 'No mapped restaurants yet';
      }
    });
  });
}

// ============ COMMUNITY FEED ============
async function loadCommunity() {
  const feed = document.getElementById('community-feed');
  feed.innerHTML = `<div class="loading-spinner"><div class="spinner"></div> Loading…</div>`;
  try {
    const [pubRests, pubDishes] = await Promise.all([DB.getPublicRestaurants(), DB.getPublicDishes()]);
    if (!pubRests.length && !pubDishes.length) {
      feed.innerHTML = emptyState('🌍', 'Nothing shared yet', 'Be the first to make your entries public!');
      return;
    }

    const restHtml = pubRests.map(r => {
      const p = r.profile || {};
      const initials = (p.display_name || p.username || '?').slice(0,2).toUpperCase();
      const color = p.avatar_color || '#c0622a';
      const scores = ratingFields.map(f=>`<div class="score-pill"><span class="score-pill-name">${f==='atmosphere'?'Atmo':f.charAt(0).toUpperCase()+f.slice(1)}</span><span class="score-pill-val">${r.ratings[f]||'–'}</span></div>`).join('');
      return `<div class="community-card">
        <div class="community-card-header">
          <div class="avatar" style="background:${color}">${initials}</div>
          <div><div class="avatar-name">${esc(p.display_name || p.username || 'Unknown')}</div>
          <div class="avatar-date">${r.city||''} · ${timeAgo(r.createdAt)}</div></div>
        </div>
        <div class="card-accent"></div>
        <div class="card-body" style="padding-top:12px">
          <div class="card-name">${esc(r.name)}</div>
          <div class="card-meta">${r.cuisine?`<span>🍴 ${esc(r.cuisine)}</span>`:''}</div>
          <div class="card-scores">${scores}</div>
          ${r.notes?`<div class="card-notes">${esc(r.notes)}</div>`:''}
        </div>
        ${r.overall?`<div class="card-footer"><span class="badge"><span class="badge-num">${r.overall}</span>&nbsp;/ 5</span></div>`:''}
      </div>`;
    }).join('');

    feed.innerHTML = `
      <div style="margin-bottom:20px">
        <div class="section-head"><div class="section-title">Community <span>Feed</span></div></div>
        <div class="filter-bar">
          <input type="text" id="community-search" placeholder="Search restaurants…" oninput="communitySearch(this.value)">
        </div>
        <div id="community-cards">${restHtml}</div>
      </div>`;

    window._communityRests = pubRests;
    window._communityCards = restHtml;
  } catch(e) {
    feed.innerHTML = `<div class="empty-state"><p>Error loading community: ${e.message}</p></div>`;
  }
}

window.communitySearch = (val) => {
  const lower = val.toLowerCase();
  const filtered = (window._communityRests||[]).filter(r =>
    r.name.toLowerCase().includes(lower) || (r.city||'').toLowerCase().includes(lower)
  );
  const container = document.getElementById('community-cards');
  if (!container) return;
  if (!filtered.length) { container.innerHTML = `<div class="empty-state"><p>No results</p></div>`; return; }
  container.innerHTML = filtered.map(r => {
    const p = r.profile || {};
    const initials = (p.display_name||p.username||'?').slice(0,2).toUpperCase();
    const color = p.avatar_color || '#c0622a';
    const scores = ratingFields.map(f=>`<div class="score-pill"><span class="score-pill-name">${f==='atmosphere'?'Atmo':f.charAt(0).toUpperCase()+f.slice(1)}</span><span class="score-pill-val">${r.ratings[f]||'–'}</span></div>`).join('');
    return `<div class="community-card">
      <div class="community-card-header"><div class="avatar" style="background:${color}">${initials}</div>
      <div><div class="avatar-name">${esc(p.display_name||p.username||'Unknown')}</div><div class="avatar-date">${r.city||''} · ${timeAgo(r.createdAt)}</div></div></div>
      <div class="card-accent"></div>
      <div class="card-body" style="padding-top:12px"><div class="card-name">${esc(r.name)}</div>
      <div class="card-meta">${r.cuisine?`<span>🍴 ${esc(r.cuisine)}</span>`:''}</div>
      <div class="card-scores">${scores}</div>
      ${r.notes?`<div class="card-notes">${esc(r.notes)}</div>`:''}</div>
      ${r.overall?`<div class="card-footer"><span class="badge"><span class="badge-num">${r.overall}</span>&nbsp;/ 5</span></div>`:''}
    </div>`;
  }).join('');
};

// ============ PROFILE TAB ============
function updateProfileTab() {
  const profile = currentProfile;
  if (!profile) return;
  const initials = (profile.display_name || profile.username || '?').slice(0,2).toUpperCase();
  const color = profile.avatar_color || '#c0622a';
  const pubCount = restaurants.filter(r => r.isPublic).length;

  const el = document.getElementById('profile-content');
  if (!el) return;
  el.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar" style="background:${color}">${initials}</div>
      <div class="profile-name">${esc(profile.display_name || profile.username)}</div>
      <div class="profile-username">@${esc(profile.username)}</div>
    </div>
    <div class="profile-stats">
      <div class="stat-box"><div class="stat-num">${restaurants.length}</div><div class="stat-label">Restaurants</div></div>
      <div class="stat-box"><div class="stat-num">${dishes.length}</div><div class="stat-label">Dishes</div></div>
      <div class="stat-box"><div class="stat-num">${pubCount}</div><div class="stat-label">Public</div></div>
    </div>
    <div style="margin-bottom:24px">
      <div style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;color:var(--espresso);margin-bottom:14px">Account</div>
      <button class="btn-secondary" style="width:100%;margin-bottom:10px;text-align:left;padding:14px" onclick="document.getElementById('signout-btn').click()">Sign Out →</button>
    </div>`;
}

function updateProfileNav() {
  const profile = currentProfile;
  if (!profile) return;
  const initials = (profile.display_name || profile.username || '?').slice(0,2).toUpperCase();
  const color = profile.avatar_color || '#c0622a';
  const navIcon = document.querySelector('[data-tab="profile"] .nav-icon');
  if (navIcon) navIcon.innerHTML = `<span style="width:22px;height:22px;border-radius:50%;background:${color};display:inline-flex;align-items:center;justify-content:center;font-size:0.62rem;font-weight:600;color:white">${initials}</span>`;
}

// ============ MODAL SYSTEM ============
function wireModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
  document.getElementById('rm-save')?.addEventListener('click', saveRestaurant);
  document.getElementById('dm-save')?.addEventListener('click', saveDish);
  document.getElementById('dm-rating')?.addEventListener('input', updateRangeDisplay);
  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    await signOut();
    restaurants = []; dishes = [];
  });
  // Add restaurant button
  document.getElementById('add-restaurant-btn')?.addEventListener('click', () => openRestaurantModal());
  document.getElementById('add-dish-btn')?.addEventListener('click', () => openDishModal());
  wireRestaurantSearch();

  // Filter bars
  document.getElementById('r-search')?.addEventListener('input', renderRestaurants);
  document.getElementById('r-sort')?.addEventListener('change', renderRestaurants);
  document.getElementById('d-search')?.addEventListener('input', renderDishes);
  document.getElementById('d-filter-rest')?.addEventListener('change', renderDishes);
  document.getElementById('d-sort')?.addEventListener('change', renderDishes);
}

function wireForms() {}

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ============ UTILS ============
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function emptyState(icon, title, body) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${title}</h3><p>${body}</p></div>`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff/86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d/30)}mo ago`;
  return `${Math.floor(d/365)}y ago`;
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}
