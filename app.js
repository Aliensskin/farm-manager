/* =============================================
   FARM MANAGER - Offline Agricultural OS
   Vanilla JS | localStorage + IndexedDB | PWA
   ============================================= */

'use strict';

// ─── CONSTANTS ───────────────────────────────
const APP_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;
const VALID_LICENSE_KEYS = ['FARM-2024-PRO', 'FARM-DEMO-001', 'AGRO-MASTER-01', 'FARM-FREE-001'];

const ENTERPRISE_CATEGORIES = [
  { id: 'crop',     label: 'Crop Production',       icon: '🌾' },
  { id: 'livestock',label: 'Livestock Production',  icon: '🐄' },
  { id: 'poultry',  label: 'Poultry Production',    icon: '🐔' },
  { id: 'fisheries',label: 'Fisheries',             icon: '🐟' },
  { id: 'forestry', label: 'Forestry',              icon: '🌳' },
  { id: 'value',    label: 'Value Addition',        icon: '🏭' },
];

const COST_CATEGORIES = ['feed','labor','seed','drugs','fuel','maintenance','water','miscellaneous'];

// ─── STATE ────────────────────────────────────
const AppState = {
  farm: null,
  enterprises: [],
  batches: [],
  records: [],
  costs: [],
  sales: [],
  currentView: 'dashboard',
  currentEnterpriseId: null,
  currentBatchId: null,
  _listeners: [],

  load() {
    try {
      this.farm         = JSON.parse(localStorage.getItem('fm_farm') || 'null');
      this.enterprises  = JSON.parse(localStorage.getItem('fm_enterprises') || '[]');
      this.batches      = JSON.parse(localStorage.getItem('fm_batches') || '[]');
      this.records      = JSON.parse(localStorage.getItem('fm_records') || '[]');
      this.costs        = JSON.parse(localStorage.getItem('fm_costs') || '[]');
      this.sales        = JSON.parse(localStorage.getItem('fm_sales') || '[]');
    } catch(e) { console.error('State load error', e); }
  },

  save(key) {
    const map = {
      farm:'fm_farm', enterprises:'fm_enterprises', batches:'fm_batches',
      records:'fm_records', costs:'fm_costs', sales:'fm_sales'
    };
    try {
      if (key) localStorage.setItem(map[key], JSON.stringify(this[key]));
      else Object.keys(map).forEach(k => localStorage.setItem(map[k], JSON.stringify(this[k])));
    } catch(e) { console.error('State save error', e); }
    this._notify(key);
  },

  update(key, value) {
    this[key] = value;
    this.save(key);
  },

  subscribe(fn) { this._listeners.push(fn); },
  _notify(key) { this._listeners.forEach(fn => fn(key)); }
};

// ─── EVENTS ───────────────────────────────────
const Events = {
  _handlers: {},
  on(name, fn) { (this._handlers[name] = this._handlers[name] || []).push(fn); },
  emit(name, data) { (this._handlers[name] || []).forEach(fn => fn(data)); }
};

// ─── VALIDATORS ──────────────────────────────
const Validate = {
  required(val, label) {
    if (!val || String(val).trim() === '') throw new Error(`${label} is required`);
  },
  positive(val, label) {
    if (isNaN(val) || Number(val) < 0) throw new Error(`${label} must be a positive number`);
  },
  date(val, label) {
    if (!val || isNaN(Date.parse(val))) throw new Error(`${label} must be a valid date`);
  }
};

// ─── CALCULATION ENGINE ──────────────────────
const Calc = {
  batchCosts(batchId) {
    return AppState.costs.filter(c => c.batchId === batchId).reduce((s, c) => s + (c.amount || 0), 0);
  },
  batchRevenue(batchId) {
    return AppState.sales.filter(s => s.batchId === batchId).reduce((s, sale) => s + (sale.totalRevenue || 0), 0);
  },
  batchProfit(batchId) {
    return this.batchRevenue(batchId) - this.batchCosts(batchId);
  },
  farmTotals() {
    const costs   = AppState.costs.reduce((s, c) => s + (c.amount || 0), 0);
    const revenue = AppState.sales.reduce((s, s2) => s + (s2.totalRevenue || 0), 0);
    return { costs, revenue, profit: revenue - costs };
  },
  mortality(records, initial) {
    const total = records.filter(r => r.recordType === 'mortality').reduce((s, r) => s + (r.data?.count || 0), 0);
    return initial > 0 ? ((total / initial) * 100).toFixed(1) : 0;
  },
  closingStock(batchId) {
    const batch = AppState.batches.find(b => b.batchId === batchId);
    if (!batch) return 0;
    const mort = AppState.records.filter(r => r.batchId === batchId && r.recordType === 'mortality')
                   .reduce((s, r) => s + (r.data?.count || 0), 0);
    const sold = AppState.sales.filter(s => s.batchId === batchId).reduce((s, sl) => s + (sl.quantity || 0), 0);
    return (batch.initialQuantity || 0) - mort - sold;
  }
};

// ─── STORAGE HELPERS ─────────────────────────
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fmt(n) {
  const currency = AppState.farm?.currency || 'UGX';
  return `${currency} ${Number(n || 0).toLocaleString()}`;
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '—'; }

// ─── LICENSE CHECK ───────────────────────────
function isLicensed() {
  const k = localStorage.getItem('fm_license');
  return VALID_LICENSE_KEYS.includes(k);
}

// ─── ROUTER / VIEW ENGINE ────────────────────
const Router = {
  go(view, params = {}) {
    AppState.currentView = view;
    if (params.enterpriseId !== undefined) AppState.currentEnterpriseId = params.enterpriseId;
    if (params.batchId !== undefined) AppState.currentBatchId = params.batchId;
    render();
  }
};

// ─── RENDER DISPATCHER ───────────────────────
function render() {
  const main = document.getElementById('app');
  if (!main) return;

  if (!isLicensed()) { main.innerHTML = renderLicense(); return; }
  if (!AppState.farm) { main.innerHTML = renderSetup(); return; }

  const nav = renderNav();
  let content = '';
  switch (AppState.currentView) {
    case 'dashboard':    content = renderDashboard(); break;
    case 'enterprises':  content = renderEnterprises(); break;
    case 'enterprise':   content = renderEnterprise(); break;
    case 'batches':      content = renderBatches(); break;
    case 'batch':        content = renderBatch(); break;
    case 'add-cost':     content = renderAddCost(); break;
    case 'add-sale':     content = renderAddSale(); break;
    case 'add-record':   content = renderAddRecord(); break;
    case 'analytics':    content = renderAnalytics(); break;
    case 'settings':     content = renderSettings(); break;
    default:             content = renderDashboard();
  }

  main.innerHTML = `
    <div class="layout">
      ${nav}
      <main class="content">${content}</main>
    </div>`;
}

// ─── LICENSE SCREEN ──────────────────────────
function renderLicense() {
  return `
  <div class="auth-screen">
    <div class="auth-card">
      <div class="auth-logo">🌾</div>
      <h1 class="auth-title">FARM MANAGER</h1>
      <p class="auth-sub">Offline Agricultural Operating System</p>
      <div class="form-group">
        <label>License Key</label>
        <input id="lic-input" type="text" placeholder="FARM-XXXX-XXXX" class="input" autocomplete="off" spellcheck="false"/>
      </div>
      <button class="btn btn-primary btn-full" onclick="submitLicense()">Activate</button>
      <p class="auth-hint">Demo key: <code>FARM-DEMO-001</code></p>
      <div id="lic-error" class="error-msg" style="display:none"></div>
    </div>
  </div>`;
}

function submitLicense() {
  const val = document.getElementById('lic-input')?.value?.trim().toUpperCase();
  const err = document.getElementById('lic-error');
  if (VALID_LICENSE_KEYS.includes(val)) {
    localStorage.setItem('fm_license', val);
    render();
  } else {
    if (err) { err.textContent = 'Invalid license key. Try FARM-DEMO-001'; err.style.display = 'block'; }
  }
}

// ─── FARM SETUP ──────────────────────────────
function renderSetup() {
  return `
  <div class="auth-screen">
    <div class="auth-card">
      <div class="auth-logo">🚜</div>
      <h1 class="auth-title">Setup Your Farm</h1>
      <p class="auth-sub">Tell us about your farm to get started</p>
      <div class="form-group">
        <label>Farm Name *</label>
        <input id="s-name" class="input" placeholder="e.g. Green Valley Farm"/>
      </div>
      <div class="form-group">
        <label>Owner Name *</label>
        <input id="s-owner" class="input" placeholder="Your full name"/>
      </div>
      <div class="form-group">
        <label>Location</label>
        <input id="s-loc" class="input" placeholder="District, Country"/>
      </div>
      <div class="form-group">
        <label>Currency</label>
        <select id="s-cur" class="input">
          <option value="UGX">UGX - Ugandan Shilling</option>
          <option value="KES">KES - Kenyan Shilling</option>
          <option value="TZS">TZS - Tanzanian Shilling</option>
          <option value="NGN">NGN - Nigerian Naira</option>
          <option value="GHS">GHS - Ghanaian Cedi</option>
          <option value="USD">USD - US Dollar</option>
          <option value="ZAR">ZAR - South African Rand</option>
        </select>
      </div>
      <button class="btn btn-primary btn-full" onclick="submitSetup()">Create Farm</button>
    </div>
  </div>`;
}

function submitSetup() {
  const name  = document.getElementById('s-name')?.value?.trim();
  const owner = document.getElementById('s-owner')?.value?.trim();
  if (!name || !owner) { alert('Farm name and owner are required.'); return; }
  AppState.farm = {
    farmId: genId(), farmName: name, ownerName: owner,
    location: document.getElementById('s-loc')?.value?.trim(),
    currency: document.getElementById('s-cur')?.value || 'UGX',
    createdAt: new Date().toISOString()
  };
  AppState.save('farm');
  Events.emit('onFarmCreated', AppState.farm);
  render();
}

// ─── NAV ─────────────────────────────────────
function renderNav() {
  const items = [
    { view:'dashboard',   icon:'📊', label:'Dashboard'  },
    { view:'enterprises', icon:'🏢', label:'Enterprises'},
    { view:'batches',     icon:'📦', label:'Batches'    },
    { view:'analytics',   icon:'📈', label:'Analytics'  },
    { view:'settings',    icon:'⚙️', label:'Settings'   },
  ];
  const links = items.map(i => `
    <button class="nav-item ${AppState.currentView === i.view || (i.view==='enterprises' && AppState.currentView==='enterprise') || (i.view==='batches' && ['batch','add-cost','add-sale','add-record'].includes(AppState.currentView)) ? 'active' : ''}"
      onclick="Router.go('${i.view}')">
      <span class="nav-icon">${i.icon}</span>
      <span class="nav-label">${i.label}</span>
    </button>`).join('');
  return `<nav class="bottom-nav">${links}</nav>`;
}

// ─── DASHBOARD ───────────────────────────────
function renderDashboard() {
  const t = Calc.farmTotals();
  const batches = AppState.batches;
  const active = batches.filter(b => b.status === 'active').length;
  const enCount = AppState.enterprises.length;

  // Alerts
  let alerts = [];
  batches.forEach(b => {
    if (b.status !== 'active') return;
    const mort = AppState.records.filter(r => r.batchId === b.batchId && r.recordType === 'mortality')
                   .reduce((s, r) => s + (r.data?.count || 0), 0);
    if (b.initialQuantity > 0 && (mort / b.initialQuantity) > 0.1) {
      alerts.push(`⚠️ High mortality in batch <b>${b.batchName}</b> (${((mort/b.initialQuantity)*100).toFixed(1)}%)`);
    }
    const profit = Calc.batchProfit(b.batchId);
    if (profit < 0) alerts.push(`📉 Batch <b>${b.batchName}</b> is running at a loss`);
  });

  const alertsHtml = alerts.length
    ? alerts.map(a => `<div class="alert-item">${a}</div>`).join('')
    : `<div class="empty-state small">✅ No alerts — farm is running well</div>`;

  // Recent activity
  const recentSales = [...AppState.sales].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,3);

  return `
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="farm-name">${AppState.farm.farmName}</h2>
        <p class="farm-owner">👤 ${AppState.farm.ownerName} • ${AppState.farm.location || 'Farm'}</p>
      </div>
      <button class="btn btn-sm btn-outline" onclick="Router.go('enterprises')">+ New</button>
    </header>

    <div class="stats-grid">
      <div class="stat-card revenue">
        <div class="stat-label">Revenue</div>
        <div class="stat-value">${fmt(t.revenue)}</div>
      </div>
      <div class="stat-card costs">
        <div class="stat-label">Costs</div>
        <div class="stat-value">${fmt(t.costs)}</div>
      </div>
      <div class="stat-card ${t.profit >= 0 ? 'profit' : 'loss'}">
        <div class="stat-label">Profit</div>
        <div class="stat-value">${fmt(t.profit)}</div>
      </div>
      <div class="stat-card neutral">
        <div class="stat-label">Enterprises</div>
        <div class="stat-value">${enCount}</div>
      </div>
      <div class="stat-card neutral">
        <div class="stat-label">Batches</div>
        <div class="stat-value">${batches.length}</div>
      </div>
      <div class="stat-card active">
        <div class="stat-label">Active</div>
        <div class="stat-value">${active}</div>
      </div>
    </div>

    <section class="section">
      <h3 class="section-title">🔔 Alerts</h3>
      <div class="alerts-box">${alertsHtml}</div>
    </section>

    <section class="section">
      <h3 class="section-title">💰 Recent Sales</h3>
      ${recentSales.length ? recentSales.map(s => {
        const b = AppState.batches.find(b=>b.batchId===s.batchId);
        return `<div class="list-item">
          <div>
            <div class="item-name">${b?.batchName || 'Batch'}</div>
            <div class="item-sub">${s.buyer || 'Buyer'} • ${fmtDate(s.date)}</div>
          </div>
          <div class="item-badge green">${fmt(s.totalRevenue)}</div>
        </div>`;
      }).join('') : `<div class="empty-state small">No sales yet</div>`}
    </section>
  </div>`;
}

// ─── ENTERPRISES ─────────────────────────────
function renderEnterprises() {
  const list = AppState.enterprises;
  return `
  <div class="page">
    <header class="page-header">
      <h2>Enterprises</h2>
      <button class="btn btn-sm btn-primary" onclick="showAddEnterprise()">+ Add</button>
    </header>

    <div id="add-enterprise-form" style="display:none" class="card form-card">
      <h3 class="form-title">New Enterprise</h3>
      <div class="form-group">
        <label>Name *</label>
        <input id="en-name" class="input" placeholder="e.g. Layer Chickens Block A"/>
      </div>
      <div class="form-group">
        <label>Category *</label>
        <select id="en-cat" class="input">
          ${ENTERPRISE_CATEGORIES.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Type / Description</label>
        <input id="en-type" class="input" placeholder="e.g. Broilers, Maize, Tilapia..."/>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="hideForm('add-enterprise-form')">Cancel</button>
        <button class="btn btn-primary" onclick="saveEnterprise()">Save</button>
      </div>
    </div>

    ${list.length === 0
      ? `<div class="empty-state"><div class="empty-icon">🏢</div><p>No enterprises yet.<br>Add your first enterprise above.</p></div>`
      : list.map(e => {
          const cat = ENTERPRISE_CATEGORIES.find(c => c.id === e.category);
          const eBatches = AppState.batches.filter(b => b.enterpriseId === e.enterpriseId);
          const revenue = eBatches.reduce((s,b) => s + Calc.batchRevenue(b.batchId), 0);
          const costs   = eBatches.reduce((s,b) => s + Calc.batchCosts(b.batchId), 0);
          return `
          <div class="list-item clickable" onclick="Router.go('enterprise', {enterpriseId:'${e.enterpriseId}'})">
            <div class="item-icon">${cat?.icon || '🌿'}</div>
            <div class="item-body">
              <div class="item-name">${e.name}</div>
              <div class="item-sub">${cat?.label || e.category} • ${eBatches.length} batch${eBatches.length!==1?'es':''}</div>
              <div class="item-financials">
                <span class="green">↑ ${fmt(revenue)}</span>
                <span class="red">↓ ${fmt(costs)}</span>
                <span class="${revenue-costs>=0?'green':'red'}">= ${fmt(revenue-costs)}</span>
              </div>
            </div>
            <div class="item-arrow">›</div>
          </div>`;
        }).join('')
    }
  </div>`;
}

function showAddEnterprise() {
  const f = document.getElementById('add-enterprise-form');
  if (f) f.style.display = 'block';
}

function saveEnterprise() {
  const name = document.getElementById('en-name')?.value?.trim();
  const cat  = document.getElementById('en-cat')?.value;
  const type = document.getElementById('en-type')?.value?.trim();
  if (!name) { alert('Enterprise name is required'); return; }
  const e = { enterpriseId: genId(), farmId: AppState.farm.farmId, name, category: cat, type, createdAt: new Date().toISOString() };
  AppState.enterprises.push(e);
  AppState.save('enterprises');
  Events.emit('onEnterpriseCreated', e);
  hideForm('add-enterprise-form');
  render();
}

// ─── SINGLE ENTERPRISE ───────────────────────
function renderEnterprise() {
  const e = AppState.enterprises.find(x => x.enterpriseId === AppState.currentEnterpriseId);
  if (!e) return `<div class="page"><p>Enterprise not found.</p></div>`;
  const cat = ENTERPRISE_CATEGORIES.find(c => c.id === e.category);
  const batches = AppState.batches.filter(b => b.enterpriseId === e.enterpriseId);

  return `
  <div class="page">
    <header class="page-header">
      <button class="btn btn-ghost btn-sm" onclick="Router.go('enterprises')">← Back</button>
      <button class="btn btn-sm btn-danger" onclick="deleteEnterprise('${e.enterpriseId}')">Delete</button>
    </header>
    <div class="enterprise-hero">
      <div class="hero-icon">${cat?.icon || '🌿'}</div>
      <h2>${e.name}</h2>
      <p>${cat?.label || ''} ${e.type ? '• ' + e.type : ''}</p>
    </div>

    <div class="section">
      <div class="section-header">
        <h3 class="section-title">Batches</h3>
        <button class="btn btn-sm btn-primary" onclick="showAddBatch('${e.enterpriseId}')">+ Batch</button>
      </div>

      <div id="add-batch-form-${e.enterpriseId}" style="display:none" class="card form-card">
        <h3 class="form-title">New Batch</h3>
        <div class="form-group">
          <label>Batch Name *</label>
          <input id="bt-name" class="input" placeholder="e.g. Batch Jan 2025"/>
        </div>
        <div class="form-group">
          <label>Start Date *</label>
          <input id="bt-start" type="date" class="input" value="${new Date().toISOString().split('T')[0]}"/>
        </div>
        <div class="form-group">
          <label>Initial Quantity</label>
          <input id="bt-qty" type="number" class="input" placeholder="0" min="0"/>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <input id="bt-notes" class="input" placeholder="Optional notes..."/>
        </div>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="hideForm('add-batch-form-${e.enterpriseId}')">Cancel</button>
          <button class="btn btn-primary" onclick="saveBatch('${e.enterpriseId}')">Save</button>
        </div>
      </div>

      ${batches.length === 0
        ? `<div class="empty-state small"><p>No batches yet. Add your first batch.</p></div>`
        : batches.map(b => {
            const profit = Calc.batchProfit(b.batchId);
            const stock = Calc.closingStock(b.batchId);
            return `
            <div class="list-item clickable" onclick="Router.go('batch', {batchId:'${b.batchId}'})">
              <div class="batch-status ${b.status}"></div>
              <div class="item-body">
                <div class="item-name">${b.batchName}</div>
                <div class="item-sub">Started ${fmtDate(b.startDate)} • Stock: ${stock}</div>
                <div class="item-financials">
                  <span class="${profit>=0?'green':'red'}">${profit>=0?'Profit':'Loss'}: ${fmt(profit)}</span>
                </div>
              </div>
              <div class="item-arrow">›</div>
            </div>`;
          }).join('')
      }
    </div>
  </div>`;
}

function showAddBatch(eid) {
  const f = document.getElementById(`add-batch-form-${eid}`);
  if (f) f.style.display = 'block';
}

function saveBatch(eid) {
  const name  = document.getElementById('bt-name')?.value?.trim();
  const start = document.getElementById('bt-start')?.value;
  const qty   = parseInt(document.getElementById('bt-qty')?.value) || 0;
  const notes = document.getElementById('bt-notes')?.value?.trim();
  if (!name) { alert('Batch name required'); return; }
  const b = {
    batchId: genId(), enterpriseId: eid, batchName: name,
    startDate: start, initialQuantity: qty, notes, status: 'active',
    createdAt: new Date().toISOString()
  };
  AppState.batches.push(b);
  AppState.save('batches');
  Events.emit('onBatchCreated', b);
  render();
}

function deleteEnterprise(eid) {
  if (!confirm('Delete this enterprise and all its data? This cannot be undone.')) return;
  const bids = AppState.batches.filter(b=>b.enterpriseId===eid).map(b=>b.batchId);
  AppState.enterprises  = AppState.enterprises.filter(e=>e.enterpriseId!==eid);
  AppState.batches      = AppState.batches.filter(b=>b.enterpriseId!==eid);
  AppState.records      = AppState.records.filter(r=>!bids.includes(r.batchId));
  AppState.costs        = AppState.costs.filter(c=>!bids.includes(c.batchId));
  AppState.sales        = AppState.sales.filter(s=>!bids.includes(s.batchId));
  AppState.save();
  Router.go('enterprises');
}

// ─── BATCHES LIST ────────────────────────────
function renderBatches() {
  const batches = AppState.batches;
  return `
  <div class="page">
    <header class="page-header">
      <h2>All Batches</h2>
      <div class="filter-row">
        <button class="btn btn-sm ${AppState._batchFilter!=='closed'?'btn-primary':'btn-ghost'}" onclick="AppState._batchFilter='active';render()">Active</button>
        <button class="btn btn-sm ${AppState._batchFilter==='closed'?'btn-primary':'btn-ghost'}" onclick="AppState._batchFilter='closed';render()">Closed</button>
      </div>
    </header>
    ${batches.length === 0
      ? `<div class="empty-state"><div class="empty-icon">📦</div><p>No batches yet.<br>Add a batch from an enterprise.</p></div>`
      : batches
          .filter(b => AppState._batchFilter === 'closed' ? b.status==='closed' : b.status!=='closed')
          .map(b => {
            const e = AppState.enterprises.find(x=>x.enterpriseId===b.enterpriseId);
            const cat = ENTERPRISE_CATEGORIES.find(c=>c.id===e?.category);
            const profit = Calc.batchProfit(b.batchId);
            const stock = Calc.closingStock(b.batchId);
            return `
            <div class="list-item clickable" onclick="Router.go('batch', {batchId:'${b.batchId}'})">
              <div class="item-icon">${cat?.icon||'📦'}</div>
              <div class="item-body">
                <div class="item-name">${b.batchName}</div>
                <div class="item-sub">${e?.name||''} • ${fmtDate(b.startDate)} • Stock: ${stock}</div>
                <div class="item-financials">
                  <span class="${profit>=0?'green':'red'}">P/L: ${fmt(profit)}</span>
                </div>
              </div>
              <span class="badge ${b.status==='active'?'badge-green':'badge-gray'}">${b.status}</span>
            </div>`;
          }).join('') || `<div class="empty-state small">No ${AppState._batchFilter||'active'} batches</div>`
    }
  </div>`;
}

// ─── SINGLE BATCH ────────────────────────────
function renderBatch() {
  const b = AppState.batches.find(x => x.batchId === AppState.currentBatchId);
  if (!b) return `<div class="page"><p>Batch not found.</p></div>`;
  const e = AppState.enterprises.find(x => x.enterpriseId === b.enterpriseId);
  const cat = ENTERPRISE_CATEGORIES.find(c => c.id === e?.category);
  const costs   = AppState.costs.filter(c => c.batchId === b.batchId);
  const sales   = AppState.sales.filter(s => s.batchId === b.batchId);
  const records = AppState.records.filter(r => r.batchId === b.batchId);
  const totalCosts   = costs.reduce((s,c)=>s+c.amount,0);
  const totalRevenue = sales.reduce((s,s2)=>s+s2.totalRevenue,0);
  const profit = totalRevenue - totalCosts;
  const stock  = Calc.closingStock(b.batchId);
  const mort   = records.filter(r=>r.recordType==='mortality').reduce((s,r)=>s+(r.data?.count||0),0);

  return `
  <div class="page">
    <header class="page-header">
      <button class="btn btn-ghost btn-sm" onclick="Router.go('enterprise',{enterpriseId:'${b.enterpriseId}'})">← Back</button>
      <button class="btn btn-sm ${b.status==='active'?'btn-outline':'btn-ghost'}" onclick="toggleBatchStatus('${b.batchId}')">
        ${b.status==='active'?'Close Batch':'Reopen'}
      </button>
    </header>

    <div class="batch-hero">
      <span class="hero-badge ${b.status}">${b.status.toUpperCase()}</span>
      <h2>${b.batchName}</h2>
      <p>${cat?.icon||''} ${e?.name||''} • Started ${fmtDate(b.startDate)}</p>
    </div>

    <div class="stats-grid compact">
      <div class="stat-card revenue"><div class="stat-label">Revenue</div><div class="stat-value">${fmt(totalRevenue)}</div></div>
      <div class="stat-card costs"><div class="stat-label">Costs</div><div class="stat-value">${fmt(totalCosts)}</div></div>
      <div class="stat-card ${profit>=0?'profit':'loss'}"><div class="stat-label">Profit</div><div class="stat-value">${fmt(profit)}</div></div>
      <div class="stat-card neutral"><div class="stat-label">Stock</div><div class="stat-value">${stock}</div></div>
      <div class="stat-card neutral"><div class="stat-label">Initial</div><div class="stat-value">${b.initialQuantity||0}</div></div>
      <div class="stat-card ${mort>0?'loss':'neutral'}"><div class="stat-label">Mortality</div><div class="stat-value">${mort}</div></div>
    </div>

    <div class="action-buttons">
      <button class="btn btn-action" onclick="Router.go('add-record',{batchId:'${b.batchId}'})">📝 Record</button>
      <button class="btn btn-action" onclick="Router.go('add-cost',{batchId:'${b.batchId}'})">💸 Cost</button>
      <button class="btn btn-action" onclick="Router.go('add-sale',{batchId:'${b.batchId}'})">💰 Sale</button>
    </div>

    <!-- COSTS -->
    <section class="section">
      <div class="section-header">
        <h3 class="section-title">Costs <span class="badge badge-red">${fmt(totalCosts)}</span></h3>
      </div>
      ${costs.length === 0
        ? `<div class="empty-state small">No costs recorded</div>`
        : costs.slice(-5).reverse().map(c=>`
          <div class="list-item">
            <div class="item-body">
              <div class="item-name">${c.description||c.category}</div>
              <div class="item-sub">${c.category} • ${fmtDate(c.date)}</div>
            </div>
            <div class="item-badge red">${fmt(c.amount)}</div>
          </div>`).join('')
      }
    </section>

    <!-- SALES -->
    <section class="section">
      <div class="section-header">
        <h3 class="section-title">Sales <span class="badge badge-green">${fmt(totalRevenue)}</span></h3>
      </div>
      ${sales.length === 0
        ? `<div class="empty-state small">No sales recorded</div>`
        : sales.slice(-5).reverse().map(s=>`
          <div class="list-item">
            <div class="item-body">
              <div class="item-name">${s.buyer||'Buyer'} • Qty: ${s.quantity}</div>
              <div class="item-sub">${fmtDate(s.date)} • ${fmt(s.unitPrice)}/unit</div>
            </div>
            <div class="item-badge green">${fmt(s.totalRevenue)}</div>
          </div>`).join('')
      }
    </section>

    <!-- RECORDS -->
    <section class="section">
      <div class="section-header">
        <h3 class="section-title">Records</h3>
      </div>
      ${records.length === 0
        ? `<div class="empty-state small">No records yet</div>`
        : records.slice(-5).reverse().map(r=>`
          <div class="list-item">
            <div class="item-body">
              <div class="item-name">${r.recordType}</div>
              <div class="item-sub">${fmtDate(r.date)} ${r.data?.count?'• Count: '+r.data.count:''} ${r.data?.notes||''}</div>
            </div>
          </div>`).join('')
      }
    </section>
  </div>`;
}

function toggleBatchStatus(bid) {
  const b = AppState.batches.find(x=>x.batchId===bid);
  if (!b) return;
  b.status = b.status==='active' ? 'closed' : 'active';
  if (b.status==='closed') b.endDate = new Date().toISOString();
  AppState.save('batches');
  render();
}

// ─── ADD COST ────────────────────────────────
function renderAddCost() {
  const b = AppState.batches.find(x=>x.batchId===AppState.currentBatchId);
  return `
  <div class="page">
    <header class="page-header">
      <button class="btn btn-ghost btn-sm" onclick="Router.go('batch',{batchId:'${b?.batchId}'})">← Back</button>
      <h2>Add Cost</h2>
    </header>
    <div class="card form-card">
      <p class="form-context">Batch: <b>${b?.batchName||'Unknown'}</b></p>
      <div class="form-group">
        <label>Category *</label>
        <select id="c-cat" class="input">
          ${COST_CATEGORIES.map(c=>`<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Amount (${AppState.farm.currency}) *</label>
        <input id="c-amt" type="number" class="input" placeholder="0" min="0" step="100"/>
      </div>
      <div class="form-group">
        <label>Description</label>
        <input id="c-desc" class="input" placeholder="e.g. 50kg broiler starter"/>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input id="c-date" type="date" class="input" value="${new Date().toISOString().split('T')[0]}"/>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Router.go('batch',{batchId:'${b?.batchId}'})">Cancel</button>
        <button class="btn btn-primary" onclick="saveCost()">Save Cost</button>
      </div>
    </div>
  </div>`;
}

function saveCost() {
  const amt = parseFloat(document.getElementById('c-amt')?.value);
  if (!amt || amt < 0) { alert('Enter a valid amount'); return; }
  const cost = {
    costId: genId(),
    batchId: AppState.currentBatchId,
    date: document.getElementById('c-date')?.value || new Date().toISOString().split('T')[0],
    category: document.getElementById('c-cat')?.value,
    amount: amt,
    description: document.getElementById('c-desc')?.value?.trim()
  };
  AppState.costs.push(cost);
  AppState.save('costs');
  Events.emit('onCostAdded', cost);
  Router.go('batch', { batchId: AppState.currentBatchId });
}

// ─── ADD SALE ────────────────────────────────
function renderAddSale() {
  const b = AppState.batches.find(x=>x.batchId===AppState.currentBatchId);
  return `
  <div class="page">
    <header class="page-header">
      <button class="btn btn-ghost btn-sm" onclick="Router.go('batch',{batchId:'${b?.batchId}'})">← Back</button>
      <h2>Record Sale</h2>
    </header>
    <div class="card form-card">
      <p class="form-context">Batch: <b>${b?.batchName||'Unknown'}</b> • Stock: <b>${Calc.closingStock(b?.batchId)}</b></p>
      <div class="form-group">
        <label>Quantity Sold *</label>
        <input id="s-qty" type="number" class="input" placeholder="0" min="1" oninput="calcSaleTotal()"/>
      </div>
      <div class="form-group">
        <label>Unit Price (${AppState.farm.currency}) *</label>
        <input id="s-price" type="number" class="input" placeholder="0" min="0" oninput="calcSaleTotal()"/>
      </div>
      <div class="form-group">
        <label>Buyer Name</label>
        <input id="s-buyer" class="input" placeholder="Buyer or market name"/>
      </div>
      <div class="form-group">
        <label>Transport Cost (${AppState.farm.currency})</label>
        <input id="s-trans" type="number" class="input" placeholder="0" min="0"/>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input id="s-date" type="date" class="input" value="${new Date().toISOString().split('T')[0]}"/>
      </div>
      <div class="total-preview" id="sale-total">Total Revenue: ${AppState.farm.currency} 0</div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Router.go('batch',{batchId:'${b?.batchId}'})">Cancel</button>
        <button class="btn btn-primary" onclick="saveSale()">Save Sale</button>
      </div>
    </div>
  </div>`;
}

function calcSaleTotal() {
  const qty   = parseFloat(document.getElementById('s-qty')?.value) || 0;
  const price = parseFloat(document.getElementById('s-price')?.value) || 0;
  const el = document.getElementById('sale-total');
  if (el) el.textContent = `Total Revenue: ${AppState.farm.currency} ${(qty * price).toLocaleString()}`;
}

function saveSale() {
  const qty   = parseFloat(document.getElementById('s-qty')?.value);
  const price = parseFloat(document.getElementById('s-price')?.value);
  const trans = parseFloat(document.getElementById('s-trans')?.value) || 0;
  if (!qty || !price || qty < 1) { alert('Quantity and unit price required'); return; }
  const stock = Calc.closingStock(AppState.currentBatchId);
  if (qty > stock) { alert(`Cannot sell more than current stock (${stock})`); return; }
  const sale = {
    saleId: genId(),
    batchId: AppState.currentBatchId,
    date: document.getElementById('s-date')?.value || new Date().toISOString().split('T')[0],
    quantity: qty,
    unitPrice: price,
    buyer: document.getElementById('s-buyer')?.value?.trim(),
    transportCost: trans,
    totalRevenue: qty * price
  };
  AppState.sales.push(sale);
  AppState.save('sales');
  Events.emit('onSaleCreated', sale);
  Router.go('batch', { batchId: AppState.currentBatchId });
}

// ─── ADD RECORD ──────────────────────────────
function renderAddRecord() {
  const b = AppState.batches.find(x=>x.batchId===AppState.currentBatchId);
  const e = AppState.enterprises.find(x=>x.enterpriseId===b?.enterpriseId);
  const types = getRecordTypes(e?.category);
  return `
  <div class="page">
    <header class="page-header">
      <button class="btn btn-ghost btn-sm" onclick="Router.go('batch',{batchId:'${b?.batchId}'})">← Back</button>
      <h2>Add Record</h2>
    </header>
    <div class="card form-card">
      <p class="form-context">Batch: <b>${b?.batchName||'Unknown'}</b></p>
      <div class="form-group">
        <label>Record Type *</label>
        <select id="r-type" class="input">
          ${types.map(t=>`<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Count / Quantity</label>
        <input id="r-count" type="number" class="input" placeholder="0" min="0"/>
      </div>
      <div class="form-group">
        <label>Stage / Notes</label>
        <input id="r-notes" class="input" placeholder="e.g. Week 2, vaccination, harvest stage..."/>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input id="r-date" type="date" class="input" value="${new Date().toISOString().split('T')[0]}"/>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="Router.go('batch',{batchId:'${b?.batchId}'})">Cancel</button>
        <button class="btn btn-primary" onclick="saveRecord()">Save Record</button>
      </div>
    </div>
  </div>`;
}

function getRecordTypes(category) {
  const base = [
    {value:'mortality', label:'Mortality / Death'},
    {value:'health',    label:'Health Treatment'},
    {value:'feeding',   label:'Feeding'},
    {value:'growth',    label:'Growth / Weight'},
    {value:'transfer',  label:'Transfer'},
    {value:'note',      label:'General Note'},
  ];
  const extra = {
    crop:      [{value:'planting',    label:'Planting'},{value:'fertilizing',label:'Fertilizing'},{value:'irrigation',label:'Irrigation'},{value:'harvest',   label:'Harvest'}],
    fisheries: [{value:'stocking',    label:'Stocking'},{value:'water',      label:'Water Quality'}],
    forestry:  [{value:'planting',    label:'Planting'},{value:'survival',   label:'Survival Check'}],
    value:     [{value:'processing',  label:'Processing'},{value:'packaging', label:'Packaging'}],
  };
  return [...(extra[category]||[]), ...base];
}

function saveRecord() {
  const type  = document.getElementById('r-type')?.value;
  const count = parseInt(document.getElementById('r-count')?.value) || 0;
  const notes = document.getElementById('r-notes')?.value?.trim();
  const date  = document.getElementById('r-date')?.value;

  if (type === 'mortality' && count > 0) {
    const stock = Calc.closingStock(AppState.currentBatchId);
    if (count > stock) { alert(`Mortality (${count}) exceeds current stock (${stock})`); return; }
  }

  const rec = {
    recordId: genId(),
    batchId: AppState.currentBatchId,
    date: date || new Date().toISOString().split('T')[0],
    recordType: type,
    data: { count, notes }
  };
  AppState.records.push(rec);
  AppState.save('records');
  Events.emit('onRecordAdded', rec);
  Router.go('batch', { batchId: AppState.currentBatchId });
}

// ─── ANALYTICS ───────────────────────────────
function renderAnalytics() {
  const totals = Calc.farmTotals();
  const enterprises = AppState.enterprises;

  const enStats = enterprises.map(e => {
    const batches = AppState.batches.filter(b=>b.enterpriseId===e.enterpriseId);
    const rev  = batches.reduce((s,b)=>s+Calc.batchRevenue(b.batchId),0);
    const cost = batches.reduce((s,b)=>s+Calc.batchCosts(b.batchId),0);
    return { ...e, revenue:rev, costs:cost, profit:rev-cost, batches:batches.length };
  }).sort((a,b)=>b.profit-a.profit);

  const best  = enStats[0];
  const worst = enStats[enStats.length-1];

  const batchStats = AppState.batches.map(b => ({
    ...b,
    profit: Calc.batchProfit(b.batchId),
    revenue: Calc.batchRevenue(b.batchId),
    costs: Calc.batchCosts(b.batchId),
  })).sort((a,b)=>b.profit-a.profit);

  // Cost breakdown
  const costBreakdown = {};
  COST_CATEGORIES.forEach(c => { costBreakdown[c] = 0; });
  AppState.costs.forEach(c => { costBreakdown[c.category] = (costBreakdown[c.category]||0) + c.amount; });
  const totalCosts = Object.values(costBreakdown).reduce((s,v)=>s+v,0);

  return `
  <div class="page">
    <header class="page-header"><h2>Analytics</h2></header>

    <div class="stats-grid">
      <div class="stat-card revenue"><div class="stat-label">Total Revenue</div><div class="stat-value">${fmt(totals.revenue)}</div></div>
      <div class="stat-card costs"><div class="stat-label">Total Costs</div><div class="stat-value">${fmt(totals.costs)}</div></div>
      <div class="stat-card ${totals.profit>=0?'profit':'loss'}"><div class="stat-label">Net Profit</div><div class="stat-value">${fmt(totals.profit)}</div></div>
    </div>

    ${enterprises.length > 0 ? `
    <section class="section">
      <h3 class="section-title">🏆 Enterprise Performance</h3>
      ${enStats.map(e => {
        const cat = ENTERPRISE_CATEGORIES.find(c=>c.id===e.category);
        const pct = totals.revenue > 0 ? ((e.revenue/totals.revenue)*100).toFixed(0) : 0;
        return `
        <div class="analytics-row">
          <div class="analytics-label">${cat?.icon||''} ${e.name}</div>
          <div class="analytics-bar-wrap">
            <div class="analytics-bar" style="width:${pct}%;background:${e.profit>=0?'var(--green)':'var(--red)'}"></div>
          </div>
          <div class="analytics-value ${e.profit>=0?'green':'red'}">${fmt(e.profit)}</div>
        </div>`;
      }).join('')}
      <div class="insights-row">
        ${best ? `<div class="insight-card best">🥇 Best: <b>${best.name}</b><br>${fmt(best.profit)}</div>` : ''}
        ${worst && worst !== best ? `<div class="insight-card worst">📉 Worst: <b>${worst.name}</b><br>${fmt(worst.profit)}</div>` : ''}
      </div>
    </section>` : ''}

    <section class="section">
      <h3 class="section-title">💸 Cost Breakdown</h3>
      ${COST_CATEGORIES.filter(c=>costBreakdown[c]>0).map(c => {
        const pct = totalCosts > 0 ? ((costBreakdown[c]/totalCosts)*100).toFixed(0) : 0;
        return `
        <div class="analytics-row">
          <div class="analytics-label">${c}</div>
          <div class="analytics-bar-wrap">
            <div class="analytics-bar orange" style="width:${pct}%"></div>
          </div>
          <div class="analytics-value">${fmt(costBreakdown[c])}</div>
        </div>`;
      }).join('') || '<div class="empty-state small">No costs recorded</div>'}
    </section>

    <section class="section">
      <h3 class="section-title">📦 Top Batches</h3>
      ${batchStats.slice(0,5).map(b=>{
        const e = AppState.enterprises.find(x=>x.enterpriseId===b.enterpriseId);
        return `
        <div class="list-item clickable" onclick="Router.go('batch',{batchId:'${b.batchId}'})">
          <div class="item-body">
            <div class="item-name">${b.batchName}</div>
            <div class="item-sub">${e?.name||''} • ${fmtDate(b.startDate)}</div>
          </div>
          <div class="item-badge ${b.profit>=0?'green':'red'}">${fmt(b.profit)}</div>
        </div>`;
      }).join('') || '<div class="empty-state small">No batch data yet</div>'}
    </section>
  </div>`;
}

// ─── SETTINGS ────────────────────────────────
function renderSettings() {
  const farm = AppState.farm;
  return `
  <div class="page">
    <header class="page-header"><h2>Settings</h2></header>

    <section class="section">
      <h3 class="section-title">🚜 Farm Info</h3>
      <div class="card form-card">
        <div class="form-group">
          <label>Farm Name</label>
          <input id="set-name" class="input" value="${farm.farmName}"/>
        </div>
        <div class="form-group">
          <label>Owner</label>
          <input id="set-owner" class="input" value="${farm.ownerName}"/>
        </div>
        <div class="form-group">
          <label>Location</label>
          <input id="set-loc" class="input" value="${farm.location||''}"/>
        </div>
        <div class="form-group">
          <label>Currency</label>
          <select id="set-cur" class="input">
            ${['UGX','KES','TZS','NGN','GHS','USD','ZAR'].map(c=>`<option value="${c}" ${farm.currency===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" onclick="saveFarmSettings()">Save Changes</button>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">💾 Backup & Restore</h3>
      <div class="card form-card">
        <p class="help-text">Export all farm data as a JSON backup file. Import to restore data.</p>
        <div class="btn-row">
          <button class="btn btn-outline" onclick="exportBackup()">📤 Export Backup</button>
          <button class="btn btn-outline" onclick="document.getElementById('import-input').click()">📥 Import Backup</button>
        </div>
        <input id="import-input" type="file" accept=".json" style="display:none" onchange="importBackup(event)"/>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">📊 Data Summary</h3>
      <div class="data-summary">
        <div class="summary-row"><span>Enterprises</span><b>${AppState.enterprises.length}</b></div>
        <div class="summary-row"><span>Batches</span><b>${AppState.batches.length}</b></div>
        <div class="summary-row"><span>Records</span><b>${AppState.records.length}</b></div>
        <div class="summary-row"><span>Cost Entries</span><b>${AppState.costs.length}</b></div>
        <div class="summary-row"><span>Sales</span><b>${AppState.sales.length}</b></div>
        <div class="summary-row"><span>App Version</span><b>${APP_VERSION}</b></div>
        <div class="summary-row"><span>License</span><b>${localStorage.getItem('fm_license')||'—'}</b></div>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">⚠️ Danger Zone</h3>
      <button class="btn btn-danger btn-full" onclick="resetApp()">🗑️ Reset All Data</button>
    </section>
  </div>`;
}

function saveFarmSettings() {
  AppState.farm.farmName  = document.getElementById('set-name')?.value?.trim() || AppState.farm.farmName;
  AppState.farm.ownerName = document.getElementById('set-owner')?.value?.trim() || AppState.farm.ownerName;
  AppState.farm.location  = document.getElementById('set-loc')?.value?.trim();
  AppState.farm.currency  = document.getElementById('set-cur')?.value || AppState.farm.currency;
  AppState.save('farm');
  alert('Settings saved!');
  render();
}

function exportBackup() {
  const data = {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    farm: AppState.farm,
    enterprises: AppState.enterprises,
    batches: AppState.batches,
    records: AppState.records,
    costs: AppState.costs,
    sales: AppState.sales,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `farm-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.farm || !data.enterprises) { alert('Invalid backup file'); return; }
      if (!confirm('This will replace all current data. Continue?')) return;
      AppState.farm        = data.farm;
      AppState.enterprises = data.enterprises || [];
      AppState.batches     = data.batches || [];
      AppState.records     = data.records || [];
      AppState.costs       = data.costs || [];
      AppState.sales       = data.sales || [];
      AppState.save();
      alert('Backup restored successfully!');
      render();
    } catch(err) { alert('Failed to parse backup file: ' + err.message); }
  };
  reader.readAsText(file);
}

function resetApp() {
  if (!confirm('Delete ALL data permanently? This cannot be undone.')) return;
  if (!confirm('Are you SURE? All enterprises, batches, costs and sales will be lost.')) return;
  ['fm_farm','fm_enterprises','fm_batches','fm_records','fm_costs','fm_sales'].forEach(k => localStorage.removeItem(k));
  AppState.farm=null; AppState.enterprises=[]; AppState.batches=[];
  AppState.records=[]; AppState.costs=[]; AppState.sales=[];
  render();
}

// ─── UTILS ───────────────────────────────────
function hideForm(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// ─── INIT ────────────────────────────────────
function init() {
  AppState.load();
  render();
}

// expose globals for inline handlers
window.Router = Router;
window.AppState = AppState;
window.submitLicense = submitLicense;
window.submitSetup = submitSetup;
window.showAddEnterprise = showAddEnterprise;
window.saveEnterprise = saveEnterprise;
window.showAddBatch = showAddBatch;
window.saveBatch = saveBatch;
window.deleteEnterprise = deleteEnterprise;
window.toggleBatchStatus = toggleBatchStatus;
window.saveCost = saveCost;
window.saveSale = saveSale;
window.calcSaleTotal = calcSaleTotal;
window.saveRecord = saveRecord;
window.saveFarmSettings = saveFarmSettings;
window.exportBackup = exportBackup;
window.importBackup = importBackup;
window.resetApp = resetApp;
window.hideForm = hideForm;

document.addEventListener('DOMContentLoaded', init);
