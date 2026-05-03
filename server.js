/**
 * HTTP server for Nagoya House Explorer
 * Serves scraped SUUMO data with filterable, paginated card view
 *
 * Data priority: data_puppeteer.json > data.json
 *
 * Usage: node server.js
 * Then open http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT    = 3000;
const DATA_PUP = path.join(__dirname, 'data_puppeteer.json');
const DATA_AX  = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_PUP)) return JSON.parse(fs.readFileSync(DATA_PUP, 'utf-8'));
    if (fs.existsSync(DATA_AX))  return JSON.parse(fs.readFileSync(DATA_AX,  'utf-8'));
  } catch {}
  return null;
}

const PAGE = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nagoya House Explorer - SUUMO</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', YuGothic, 'Hiragino Kaku Gothic ProN', sans-serif; background: #f5f5f5; color: #333; font-size: 14px; line-height: 1.5; }
  .header { background: #1a1a2e; color: #fff; padding: 18px 32px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .header h1 { font-size: 19px; font-weight: 600; }
  .header .sub { color: #aaa; font-size: 12px; }
  .header-right { display: flex; align-items: center; gap: 8px; }
  .header-right .btn { background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.25); padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: background 0.2s; }
  .header-right .btn:hover { background: rgba(255,255,255,0.2); }
  .stats { background: #fff; border-bottom: 1px solid #e0e0e0; padding: 12px 32px; display: flex; gap: 24px; font-size: 13px; flex-wrap: wrap; }
  .stats .stat .val { font-weight: 700; color: #1a1a2e; }
  .stats .stat .lbl { color: #888; }
  .stats .stat .val.highlight { color: #2e7d32; }
  .filters { background: #fff; padding: 14px 32px; border-bottom: 1px solid #e0e0e0; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .filters label { font-weight: 600; color: #555; font-size: 12px; white-space: nowrap; }
  .filters input, .filters select { padding: 5px 9px; border: 1px solid #ccc; border-radius: 6px; font-size: 12px; outline: none; min-width: 0; }
  .filters input:focus, .filters select:focus { border-color: #1a1a2e; }
  .filters input[type=number] { width: 80px; }
  .filters .search-input { width: 180px; }
  .tabs { background: #fff; padding: 0 32px; border-bottom: 1px solid #e0e0e0; display: flex; }
  .tab { padding: 11px 18px; cursor: pointer; font-weight: 600; color: #888; border-bottom: 3px solid transparent; font-size: 13px; transition: all 0.2s; white-space: nowrap; }
  .tab:hover { color: #1a1a2e; }
  .tab.active { color: #1a1a2e; border-bottom-color: #1a1a2e; }
  .tab .badge { display: inline-block; background: #f0f0f0; color: #666; font-size: 11px; padding: 1px 6px; border-radius: 10px; margin-left: 4px; font-weight: 400; }
  .tab.active .badge { background: #e0e0e0; }
  .info { padding: 10px 32px; font-size: 12px; color: #888; background: #fafafa; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
  .info-left { display: flex; gap: 16px; flex-wrap: wrap; }
  .info-left span { color: #666; }
  .info-left .highlight { color: #2e7d32; font-weight: 600; }
  .grid { padding: 16px 32px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
  .card { background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; transition: box-shadow 0.2s, transform 0.15s; }
  .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.14); transform: translateY(-1px); }
  .card-hd { padding: 11px 13px 7px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .card-type { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 7px; border-radius: 3px; flex-shrink: 0; }
  .t-rental { background: #e3f2fd; color: #1565c0; }
  .t-new_build { background: #e8f5e9; color: #2e7d32; }
  .t-used { background: #fff3e0; color: #e65100; }
  .card-name { font-size: 13px; font-weight: 700; color: #1a1a2e; line-height: 1.4; flex: 1; }
  .card-img-wrap { position: relative; background: #f0f0f0; }
  .card-img { width: 100%; height: 150px; object-fit: cover; display: block; background: #eee; }
  .card-img-badge { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.55); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; }
  .card-body { padding: 9px 13px; }
  .price { font-size: 17px; font-weight: 800; color: #c62828; margin-bottom: 5px; }
  .price.rent { font-size: 14px; }
  .rows { display: flex; flex-direction: column; gap: 2px; }
  .row { display: flex; justify-content: space-between; padding: 1px 0; font-size: 11px; }
  .row .lbl { color: #888; }
  .row .val { font-weight: 600; color: #333; }
  .addr { font-size: 11px; color: #666; margin-top: 5px; line-height: 1.4; }
  .transport { font-size: 11px; color: #555; background: #f5f5f5; padding: 4px 8px; border-radius: 5px; margin-top: 5px; }
  .contact { margin-top: 6px; padding: 5px 8px; background: #f0f4f8; border-radius: 5px; font-size: 11px; }
  .contact .name { font-weight: 600; color: #333; }
  .contact .phone { color: #1565c0; }
  .card-footer { padding: 6px 13px 10px; }
  .source-link { font-size: 10px; color: #bbb; }
  .source-link a { color: #999; text-decoration: none; }
  .source-link a:hover { color: #1565c0; text-decoration: underline; }
  .empty { text-align: center; padding: 60px 20px; color: #888; grid-column: 1/-1; }
  .empty .emoji { font-size: 48px; margin-bottom: 12px; }
  .load-more { grid-column: 1/-1; text-align: center; padding: 20px; }
  .load-more button { background: #1a1a2e; color: #fff; border: none; padding: 10px 32px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: background 0.2s; }
  .load-more button:hover { background: #2a2a4e; }
  .load-more button:disabled { background: #ccc; cursor: not-allowed; }
  .loading { text-align: center; padding: 20px; color: #888; grid-column: 1/-1; font-size: 13px; }
  @media(max-width:768px) { .header,.stats,.filters { padding-left:16px;padding-right:16px; } .grid { padding:12px 16px; } .tabs { padding:0 16px; } }
</style>
</head>
<body>
<div class="header">
  <div class="header-left"><h1>🏠 Nagoya House Explorer</h1><span class="sub">Powered by SUUMO.jp &amp; Puppeteer</span></div>
  <div class="header-right">
    <button class="btn" id="btn-export" title="Export filtered results as CSV">📥 Export CSV</button>
  </div>
</div>
<div class="stats" id="stats"></div>
<div class="filters">
  <label>🔍</label>
  <input type="text" id="f-search" class="search-input" placeholder="搜索名称/地址...">
  <label>Type</label><select id="f-type"><option value="all">All</option><option value="rental">Rentals</option><option value="new_build">New Builds</option><option value="used">Used</option></select>
  <label>Min</label><input type="number" id="f-min" placeholder="0"><span style="color:#888;font-size:12px">万円</span>
  <label>Max</label><input type="number" id="f-max" placeholder="∞"><span style="color:#888;font-size:12px">万円</span>
  <label>户型</label><select id="f-layout"><option value="">All</option><option value="1K">1K</option><option value="1DK">1DK</option><option value="1LDK">1LDK</option><option value="2K">2K</option><option value="2DK">2DK</option><option value="2LDK">2LDK</option><option value="3DK">3DK</option><option value="3LDK">3LDK</option><option value="4DK">4DK</option><option value="4LDK以上">4LDK+</option></select>
  <label>排序</label><select id="f-sort"><option value="default">默认</option><option value="price-asc">价格↑</option><option value="price-desc">价格↓</option><option value="area-desc">面积↓</option><option value="age-asc">屋龄↑</option></select>
</div>
<div class="tabs" id="tabs"></div>
<div class="info" id="info-bar"><div class="info-left" id="info-left"></div><div id="page-info"></div></div>
<div class="grid" id="grid"></div>
<script>
let D = {};
let tab = 'all';
let PAGE_SIZE = 60;
let displayedCount = PAGE_SIZE;
let filtered = [];

function fmt(d) {
  if (d.type === 'rental') {
    return d.rent != null ? d.rent.toFixed(2) + '万円/月' : '-';
  }
  return d.price != null ? d.price.toLocaleString() + '万円' : (d.priceRange || 'Price TBD');
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function card(d, idx) {
  const isRent = d.type === 'rental';
  const imgCount = (d.imageUrls || []).length;
  const imgHtml = d.imageUrls && d.imageUrls[0]
    ? \`<div class="card-img-wrap"><img class="card-img" src="\${d.imageUrls[0]}" alt="\${escapeHtml(d.name)}" onerror="this.parentElement.style.display='none'">\${imgCount > 1 ? '<span class="card-img-badge">+' + (imgCount-1) + '</span>' : ''}</div>\`
    : \`<div class="card-img-wrap" style="height:150px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:12px;">No Image</div>\`;

  const rows = [];
  if (d.area) rows.push({l:'面積', v: d.area + ' m²'});
  if (d.layout) rows.push({l:'户型', v: d.layout});
  if (d.floor) rows.push({l:'楼层', v: d.floor});
  if (d.age != null) rows.push({l:'屋龄', v: d.age + '年'});
  if (d.year) rows.push({l:'建筑年', v: d.year + '年'});
  if (isRent && d.managementFee) rows.push({l:'管理费', v: d.managementFee.toLocaleString() + '円/月'});
  if (isRent && d.deposit != null) rows.push({l:'押金', v: d.deposit + '万円'});
  if (isRent && d.keyMoney != null) rows.push({l:'礼金', v: d.keyMoney + '万円'});

  const contact = (d.contactName || d.contactPhone)
    ? \`<div class="contact">📞 <span class="name">\${escapeHtml(d.contactName||'')}</span> \${escapeHtml(d.contactPhone||'')}</div>\` : '';

  const rowsHtml = rows.length
    ? \`<div class="rows">\${rows.map(r => \`<div class="row"><span class="lbl">\${r.l}</span><span class="val">\${escapeHtml(r.v)}</span></div>\`).join('')}</div>\`
    : '';

  return \`<div class="card">
    <div class="card-hd"><span class="card-type t-\${d.type}">\${d.type}</span><div class="card-name">\${escapeHtml(d.name)}</div></div>
    \${imgHtml}
    <div class="card-body">
      <div class="price \${isRent?'rent':''}">\${fmt(d)}</div>
      \${rowsHtml}
      \${d.address ? \`<div class="addr">📍 \${escapeHtml(d.address)}</div>\` : ''}
      \${d.transport ? \`<div class="transport">🚇 \${escapeHtml(d.transport)}</div>\` : ''}
      \${contact}
    </div>
    <div class="card-footer">\${d.sourceUrl ? \`<div class="source-link">🔗 <a href="\${d.sourceUrl}" target="_blank">来源</a></div>\` : ''}</div>
  </div>\`;
}

function sortItems(items, sort) {
  const s = sort || 'default';
  if (s === 'price-asc') return [...items].sort((a,b) => (a.rent||a.price||99999) - (b.rent||b.price||99999));
  if (s === 'price-desc') return [...items].sort((a,b) => (b.rent||b.price||0) - (a.rent||a.price||0));
  if (s === 'area-desc') return [...items].sort((a,b) => (b.area||0) - (a.area||0));
  if (s === 'age-asc') return [...items].sort((a,b) => (a.age??999) - (b.age??999));
  return items;
}

function filterItems() {
  const fType = document.getElementById('f-type').value;
  const search = (document.getElementById('f-search').value || '').toLowerCase();
  const minP = parseFloat(document.getElementById('f-min').value) || 0;
  const maxP = parseFloat(document.getElementById('f-max').value) || Infinity;
  const fLay = document.getElementById('f-layout').value;
  const fSort = document.getElementById('f-sort').value;

  let items = [].concat(D.rentals||[], D.newBuilds||[], D.used||[]);
  if (tab !== 'all') items = items.filter(x => x.type === tab);
  if (fType !== 'all') items = items.filter(x => x.type === fType);

  items = items.filter(x => {
    const p = x.type === 'rental' ? x.rent : x.price;
    if (p != null && (p < minP || p > maxP)) return false;
    if (fLay === '4LDK以上' && !['4LDK','5LDK','6LDK'].includes(x.layout)) return false;
    if (fLay && fLay !== '4LDK以上' && x.layout !== fLay) return false;
    if (search) {
      const hay = (x.name + ' ' + (x.address||'') + ' ' + (x.transport||'')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  filtered = sortItems(items, fSort);
  displayedCount = Math.min(PAGE_SIZE, filtered.length);
  renderGrid();
  updateInfo();
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const shown = filtered.slice(0, displayedCount);
  const total = filtered.length;

  grid.innerHTML = shown.map((d, i) => card(d, i)).join('');

  if (total > displayedCount) {
    grid.innerHTML += \`<div class="load-more"><button onclick="loadMore()">加载更多 (\${displayedCount} / \${total})</button></div>\`;
  }
}

function loadMore() {
  displayedCount = Math.min(displayedCount + PAGE_SIZE, filtered.length);
  const loadBtn = document.querySelector('.load-more button');
  if (loadBtn) {
    loadBtn.textContent = displayedCount >= filtered.length
      ? '已加载全部 ' + filtered.length + ' 条'
      : '加载更多 (' + displayedCount + ' / ' + filtered.length + ')';
    if (displayedCount >= filtered.length) loadBtn.disabled = true;
  }
  // Insert cards before load-more div
  const shown = filtered.slice(displayedCount - PAGE_SIZE, displayedCount);
  const loadMoreDiv = document.querySelector('.load-more');
  const cardsHtml = shown.map((d, i) => card(d, displayedCount - PAGE_SIZE + i)).join('');
  loadMoreDiv.insertAdjacentHTML('beforebegin', cardsHtml);
  updateInfo();
}

function updateInfo() {
  const total = [].concat(D.rentals||[],D.newBuilds||[],D.used||[]).length;
  const infoLeft = document.getElementById('info-left');
  infoLeft.innerHTML =
    \`<span>显示 <span class="highlight">\${filtered.length}</span> / \${total} 条</span>\` +
    \`<span>Rentals: <span class="highlight">\${(D.rentals||[]).length}</span></span>\` +
    \`<span>Used: <span class="highlight">\${(D.used||[]).length}</span></span>\` +
    \`<span>New Builds: <span class="highlight">\${(D.newBuilds||[]).length}</span></span>\`;
  document.getElementById('page-info').textContent = filtered.length > 0 ? '页数: ' + Math.ceil(filtered.length / displayedCount) : '';
}

function updateTabs() {
  const tabsEl = document.getElementById('tabs');
  const r = (D.rentals||[]).length, u = (D.used||[]).length, n = (D.newBuilds||[]).length;
  const cats = [
    {key:'all', label:'全部', count: r+u+n},
    {key:'rental', label:'租房 Rentals', count: r},
    {key:'used', label:'二手房 Used', count: u},
    {key:'new_build', label:'新建公寓 New Builds', count: n},
  ];
  tabsEl.innerHTML = cats.map(c =>
    \`<div class="tab\${c.key===tab?' active':''}" data-t="\${c.key}">\${c.label} <span class="badge">\${c.count}</span></div>\`
  ).join('');
  tabsEl.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    tab = t.dataset.t;
    displayedCount = PAGE_SIZE;
    filterItems();
  }));
}

// Event listeners
['f-type','f-min','f-max','f-layout','f-sort'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => { displayedCount = PAGE_SIZE; filterItems(); });
});
const searchEl = document.getElementById('f-search');
if (searchEl) searchEl.addEventListener('input', () => { displayedCount = PAGE_SIZE; filterItems(); });

// Export CSV
document.getElementById('btn-export').addEventListener('click', () => {
  const headers = ['名称','类型','地址','价格/租金','面积','户型','楼层','屋龄','交通','来源'];
  const rows = filtered.map(d => [
    d.name||'', d.type||'', d.address||'',
    d.type==='rental' ? (d.rent!=null?d.rent:'--') : (d.price!=null?d.price:'--'),
    d.area||'', d.layout||'', d.floor||'', d.age!=null?d.age:'',
    d.transport||'', d.sourceUrl||''
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\\n');
  const blob = new Blob(['\\ufeff' + csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'nagoya_houses.csv'; a.click();
});

// Init
const _data = __DATA_JSON__;
D = _data;
document.getElementById('stats').innerHTML =
  \`<div class="stat"><span class="lbl">Rentals </span><span class="val">\${(D.rentals||[]).length}</span></div>\` +
  \`<div class="stat"><span class="lbl">New Builds </span><span class="val">\${(D.newBuilds||[]).length}</span></div>\` +
  \`<div class="stat"><span class="lbl">Used </span><span class="val">\${(D.used||[]).length}</span></div>\` +
  \`<div class="stat"><span class="lbl">Scraped </span><span class="val">\${_data.meta?.scrapedAt ? new Date(_data.meta.scrapedAt).toLocaleString('ja-JP') : '-'}</span></div>\` +
  \`<div class="stat"><span class="lbl">总计 </span><span class="val highlight">\${([].concat(D.rentals||[],D.newBuilds||[],D.used||[])).length}</span></div>\`;
updateTabs();
filterItems();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let u = req.url.split('?')[0].replace(/\.\./g, '');

  if (u === '/data.json') {
    const src = fs.existsSync(DATA_PUP) ? DATA_PUP : DATA_AX;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(fs.existsSync(src) ? fs.readFileSync(src) : '{}');
    return;
  }

  if (u === '/' || u === '/index.html') {
    const data = loadData();
    const inlineData = data ? JSON.stringify(data) : '{}';
    const html = PAGE.replace("const _data = __DATA_JSON__;", `const _data = ${inlineData};`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404); res.end('Not Found');
});

server.listen(PORT, () => {
  const dataSrc = fs.existsSync(DATA_PUP) ? DATA_PUP : fs.existsSync(DATA_AX) ? DATA_AX : 'none';
  console.log(`\n🏠 Nagoya House Explorer\n━━━━━━━━━━━━━━━━━━━━━━━━\n🌐 http://localhost:${PORT}\n📄 Data: ${dataSrc}\n   Run: node scraper_puppeteer.js\n━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
