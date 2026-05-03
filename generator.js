/**
 * 名古屋房屋租售 - 静态HTML生成器
 * 生成独立的 index.html，可直接部署到任意静态托管
 * 
 * 运行：node generator.js
 * 输出：index.html（当前目录）
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data_puppeteer.json');
const OUTPUT_FILE = path.join(__dirname, 'index.html');

// ── 配色 & 主题配置 ──────────────────────────────────────────
const THEME = {
  primary:   '#1a3c6e',   // 深蓝（企业感）
  secondary: '#2d7d9a',   // 青蓝
  accent:    '#e8913a',    // 橙色点缀
  rental:    '#27ae60',    // 租房 → 绿
  used:      '#c0392b',    // 二手房 → 红
  newBuild:  '#8e44ad',    // 新建 → 紫
  bg:        '#f4f7fa',
  cardBg:    '#ffffff',
  text:      '#2c3e50',
  muted:     '#7f8c8d',
  border:    '#dde4ea',
};

// ── 工具函数 ────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtPrice(d) {
  if (d.type === 'rental') {
    return d.rent != null ? d.rent.toFixed(2) + '万円/月' : '-';
  }
  return d.price != null ? d.price.toLocaleString() + '万円' : '応談';
}

function typeLabel(d) {
  return d.type === 'rental' ? '租房' : d.type === 'newBuild' ? '新建' : '二手房';
}

function typeColor(d) {
  const map = { rental: THEME.rental, newBuild: THEME.newBuild, used: THEME.used };
  return map[d.type] || THEME.secondary;
}

// ── 单条卡片 HTML ────────────────────────────────────────────
function card(d) {
  const price = fmtPrice(d);
  const label = typeLabel(d);
  const color = typeColor(d);
  const images = d.imageUrls || [];
  const imgUrl = images[0] || '';
  const imgCount = images.length;
  const layout = d.layout || '-';
  const area = d.area ? d.area.toFixed(1) + '㎡' : '-';
  const floor = d.floor || '-';
  const age = d.age != null ? d.age + '年' : '-';
  const address = escapeHtml(d.address || '');
  const name = escapeHtml(d.name || '');
  const transport = escapeHtml(d.transport || '');
  const sourceUrl = escapeHtml(d.sourceUrl || '#');
  const contactName = escapeHtml(d.contactName || '');
  const contactPhone = escapeHtml(d.contactPhone || '');

  const imgBlock = imgUrl
    ? `<div class="card-img" style="background:#e8eef4 url('${escapeHtml(imgUrl)}') center/cover no-repeat;">
         ${imgCount > 1 ? `<span class="img-badge">+${imgCount - 1}</span>` : ''}
       </div>`
    : `<div class="card-img" style="background:#e8eef4;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:12px;">無圖</div>`;

  return `
  <article class="card" data-type="${d.type}" data-price="${d.type === 'rental' ? (d.rent || 0) : (d.price || 0)}" data-area="${d.area || 0}">
    <a href="${sourceUrl}" target="_blank" rel="noopener" class="card-link">
      ${imgBlock}
    </a>
    <div class="card-body">
      <div class="card-header">
        <span class="type-badge" style="background:${color}">${label}</span>
        <span class="price" style="color:${color}">${price}</span>
      </div>
      <h3 class="card-name">${name}</h3>
      <p class="card-address">📍 ${address}</p>
      ${transport ? `<p class="card-transport">🚇 ${transport}</p>` : ''}
      <div class="card-specs">
        <span>🪟 ${layout}</span>
        <span>📐 ${area}</span>
        <span>🏢 ${floor}</span>
        <span>🏗️ ${age}</span>
      </div>
      ${contactName ? `<p class="card-contact">📞 ${contactName} ${contactPhone}</p>` : ''}
    </div>
  </article>`;
}

// ── 生成完整 HTML ────────────────────────────────────────────
function generate(data) {
  const rentals = data.rentals || [];
  const used    = data.used    || [];
  const newBuilds = data.newBuilds || [];
  const all = [...rentals, ...used, ...newBuilds];

  const totalRentals   = rentals.length;
  const totalUsed      = used.length;
  const totalNewBuilds = newBuilds.length;

  const cardsAll   = all.map(card).join('\n');
  const cardsRental = rentals.map(card).join('\n');
  const cardsUsed   = used.map(card).join('\n');
  const cardsNew    = newBuilds.map(card).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>名古屋房屋租售 | Nagoya Real Estate</title>
<style>
/* ── Reset & Base ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;background:${THEME.bg};color:${THEME.text};line-height:1.6}

/* ── Header ── */
header{background:${THEME.primary};color:#fff;padding:24px 20px;text-align:center}
header h1{font-size:22px;font-weight:700;margin-bottom:6px}
header p{margin-top:10px;font-size:14px;opacity:0.8}
header .stats{display:flex;justify-content:center;gap:24px;margin-top:12px;font-size:13px}
header .stats span{padding:4px 12px;border-radius:20px;background:rgba(255,255,255,0.15)}

/* ── Filter Bar ── */
.filter-bar{background:#fff;border-bottom:1px solid ${THEME.border};padding:12px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;position:sticky;top:0;z-index:100}
.filter-bar .search-wrap{flex:1;min-width:200px}
.filter-bar input,.filter-bar select{width:100%;padding:8px 12px;border:1px solid ${THEME.border};border-radius:8px;font-size:14px;outline:none}
.filter-bar input:focus,.filter-bar select:focus{border-color:${THEME.secondary}}
.filter-bar label{font-size:12px;color:${THEME.muted};display:block;margin-bottom:2px}
.filter-wrap{display:flex;flex-direction:column;min-width:120px}
.filter-wrap.row{flex-direction:row;align-items:end;gap:6px}
.filter-wrap.row label{white-space:nowrap}

/* ── Tab Switcher ── */
.tabs{display:flex;background:#fff;border-bottom:2px solid ${THEME.border};padding:0 16px}
.tab-btn{padding:12px 20px;font-size:14px;font-weight:600;color:${THEME.muted};cursor:pointer;border:none;background:none;transition:color 0.2s;border-bottom:3px solid transparent;margin-bottom:-2px}
.tab-btn.active{color:${THEME.primary};border-bottom-color:${THEME.primary}}
.tab-btn:hover{color:${THEME.primary}}

/* ── Grid ── */
.grid{padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.card{background:${THEME.cardBg};border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);transition:transform 0.2s,box-shadow 0.2s;display:flex;flex-direction:column}
.card:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,0.12)}
.card-link{display:block;text-decoration:none;color:inherit}
.card-img{height:180px;background:#e8eef4;position:relative;overflow:hidden}
.card-img img{width:100%;height:100%;object-fit:cover;display:block}
.img-badge{position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.55);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px}
.card-body{padding:14px;flex:1;display:flex;flex-direction:column;gap:6px}
.card-header{display:flex;justify-content:space-between;align-items:center}
.type-badge{color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap}
.price{font-size:16px;font-weight:700}
.card-name{font-size:14px;font-weight:600;color:${THEME.text};line-height:1.4}
.card-address,.card-transport{font-size:12px;color:${THEME.muted};line-height:1.4}
.card-specs{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}
.card-specs span{font-size:12px;background:${THEME.bg};padding:2px 8px;border-radius:6px;color:${THEME.text}}
.card-contact{font-size:12px;color:${THEME.muted};border-top:1px solid ${THEME.border};padding-top:6px;margin-top:4px}

/* ── Empty State ── */
.empty{padding:60px 20px;text-align:center;color:${THEME.muted};font-size:15px;grid-column:1/-1}

/* ── Footer ── */
footer{text-align:center;padding:24px;font-size:12px;color:${THEME.muted};border-top:1px solid ${THEME.border};margin-top:20px}

/* ── Responsive ── */
@media(max-width:600px){
  header h1{font-size:18px}
  .filter-bar{padding:10px 12px}
  .grid{padding:12px;gap:12px}
  .card-body{padding:10px}
}
</style>
</head>
<body>

<header>
  <h1>🏠 名古屋房屋租售情報</h1>
  <p>Nagoya Real Estate — 最新房源データ</p>
  <div class="stats">
    <span>租房 ${totalRentals}件</span>
    <span>二手房 ${totalUsed}件</span>
    <span>新建 ${totalNewBuilds}件</span>
    <span>合計 ${all.length}件</span>
  </div>
</header>

<div class="filter-bar">
  <div class="search-wrap">
    <label>🔍 検索</label>
    <input type="text" id="search" placeholder="名称・住所で検索...">
  </div>
  <div class="filter-wrap row">
    <label>価格（万円）</label>
    <input type="number" id="minPrice" placeholder="下限" style="width:80px">
    <span>〜</span>
    <input type="number" id="maxPrice" placeholder="上限" style="width:80px">
  </div>
  <div class="filter-wrap">
    <label>面積（㎡）</label>
    <input type="number" id="minArea" placeholder="下限">
  </div>
  <div class="filter-wrap">
    <label>户型</label>
    <select id="layoutFilter">
      <option value="">すべて</option>
      <option value="1K">1K</option><option value="1DK">1DK</option>
      <option value="1LDK">1LDK</option><option value="2K">2K</option>
      <option value="2DK">2DK</option><option value="2LDK">2LDK</option>
      <option value="3K">3K</option><option value="3DK">3DK</option>
      <option value="3LDK">3LDK</option><option value="4K">4K+</option>
    </select>
  </div>
</div>

<div class="tabs">
  <button class="tab-btn active" data-tab="all">すべて（${all.length}）</button>
  <button class="tab-btn" data-tab="rental">租房（${totalRentals}）</button>
  <button class="tab-btn" data-tab="used">二手房（${totalUsed}）</button>
  <button class="tab-btn" data-tab="newBuild">新建（${totalNewBuilds}）</button>
</div>

<div class="grid" id="grid">
  ${cardsAll}
</div>

<footer>
  <p>データ來源：SUUMO（https://suumo.jp）｜更新時刻：${new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>
  <p style="margin-top:4px">本ページは個人學習・情報提供目的で構成されています。最新情報は必ず原本でご確認ください。</p>
</footer>

<script>
(function(){
  const grid = document.getElementById('grid');
  const searchInput = document.getElementById('search');
  const minPriceInput = document.getElementById('minPrice');
  const maxPriceInput = document.getElementById('maxPrice');
  const minAreaInput = document.getElementById('minArea');
  const layoutFilter = document.getElementById('layoutFilter');
  const tabBtns = document.querySelectorAll('.tab-btn');
  let currentTab = 'all';

  // Pre-build card DOM fragments
  const cardsAll     = \`${cardsAll}\`;
  const cardsRental  = \`${cardsRental}\`;
  const cardsUsed    = \`${cardsUsed}\`;
  const cardsNew     = \`${cardsNew}\`;
  const cardMap = { all: cardsAll, rental: cardsRental, used: cardsUsed, newBuild: cardsNew };

  function getCards() {
    return cardMap[currentTab] || cardMap.all;
  }

  function filterCards() {
    const kw = searchInput.value.trim().toLowerCase();
    const minP = parseFloat(minPriceInput.value) || 0;
    const maxP = parseFloat(maxPriceInput.value) || Infinity;
    const minA = parseFloat(minAreaInput.value) || 0;
    const layout = layoutFilter.value;

    const parser = new DOMParser();
    const doc = parser.parseFromString(getCards(), 'text/html');
    const cards = Array.from(doc.querySelectorAll('.card'));
    let count = 0;

    const filtered = cards.filter(card => {
      const type = card.dataset.type;
      const price = parseFloat(card.dataset.price) || 0;
      const area = parseFloat(card.dataset.area) || 0;
      const name = card.querySelector('.card-name')?.textContent?.toLowerCase() || '';
      const addr = card.querySelector('.card-address')?.textContent?.toLowerCase() || '';
      const specs = card.querySelector('.card-specs')?.textContent || '';
      const textAll = name + addr + specs;

      if (kw && !textAll.includes(kw)) return false;
      if (price < minP || price > maxP) return false;
      if (area < minA) return false;
      if (layout && !specs.includes(layout)) return false;
      if (currentTab !== 'all' && type !== currentTab) return false;
      return true;
    });

    grid.innerHTML = filtered.length
      ? filtered.map(c => c.outerHTML).join('')
      : '<p class="empty">条件に一致する房源がありません</p>';

    tabBtns.forEach(btn => {
      const cntEl = btn.querySelector('.cnt');
      const base = parseInt(btn.dataset.total || btn.textContent.match(/\d+/)?.[0] || 0);
      btn.textContent = btn.dataset.label + (cntEl ? '' : '');
    });
  }

  searchInput.addEventListener('input', filterCards);
  minPriceInput.addEventListener('input', filterCards);
  maxPriceInput.addEventListener('input', filterCards);
  minAreaInput.addEventListener('input', filterCards);
  layoutFilter.addEventListener('change', filterCards);

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      filterCards();
    });
  });
})();
</script>
</body>
</html>`;

  return html;
}

// ── 主程序 ──────────────────────────────────────────────────
const raw = fs.readFileSync(DATA_FILE, 'utf-8');
const data = JSON.parse(raw);

const html = generate(data);
fs.writeFileSync(OUTPUT_FILE, html);

console.log(`✅ 生成完成：${OUTPUT_FILE}`);
console.log(`   租房：${(data.rentals||[]).length} 件`);
console.log(`   二手房：${(data.used||[]).length} 件`);
console.log(`   新建：${(data.newBuilds||[]).length} 件`);
console.log(`   总计：${((data.rentals||[]).length + (data.used||[]).length + (data.newBuilds||[]).length)} 件`);
console.log(`   文件大小：${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);