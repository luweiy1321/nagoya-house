/**
 * SUUMO Nagoya House Scraper — Puppeteer Edition v6
 * 按页数爬取，每5页保存一次中间结果
 *
 * 租房: 20页 × 1个区域 = 20页
 * 二手房: 20页 × 1个区域 = 20页
 * 新建公寓: 10页 × 1个区域 = 10页
 *
 * 每爬完5页立即写入 data_puppeteer.json
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME   = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT   = path.join(__dirname, 'data_puppeteer.json');
const DATA_DIR = __dirname;

// ─── Utilities ─────────────────────────────────────────────────────────

const rand  = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const pause = ms  => new Promise(r => setTimeout(r, ms));
const rd    = (a, b) => pause(rand(a, b));

async function humanScroll(page, times = 2) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(y => window.scrollBy(0, y), rand(400, 800));
    await rd(300, 600);
    await page.mouse.move(rand(100, 1200), rand(80, 700));
    await rd(60, 150);
  }
}

// ─── Data Manager ──────────────────────────────────────────────────────

class DataManager {
  constructor(path) {
    this.path = path;
    this.data = this._load();
  }

  _load() {
    if (fs.existsSync(this.path)) {
      try {
        return JSON.parse(fs.readFileSync(this.path, 'utf-8'));
      } catch {}
    }
    return { meta: { scrapedAt: '', version: '6.0-puppeteer', fields: [] }, rentals: [], used: [], newBuilds: [] };
  }

  _initMeta() {
    if (!this.data.meta) {
      this.data.meta = { scrapedAt: new Date().toISOString(), version: '6.0-puppeteer', fields: [] };
    }
    if (!this.data.meta.fields || this.data.meta.fields.length === 0) {
      this.data.meta.fields = ['name','imageUrls','address','transport','area','layout','floor','age','year','rent','price','managementFee','deposit','keyMoney','contactName','contactPhone','contactHours','sourceUrl'];
    }
  }

  save() {
    this.data.meta.scrapedAt = new Date().toISOString();
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  // Add items to a category, deduplicate by sourceUrl
  addItems(cat, items) {
    if (!this.data[cat]) this.data[cat] = [];
    const existing = new Set(this.data[cat].map(i => i.sourceUrl));
    const newItems = items.filter(i => !existing.has(i.sourceUrl));
    this.data[cat].push(...newItems);
    return newItems.length;
  }

  itemCount(cat) {
    return (this.data[cat] || []).filter(i => i.name && !i.error).length;
  }

  status() {
    return `rentals=${this.itemCount('rentals')} used=${this.itemCount('used')} newBuilds=${this.itemCount('newBuilds')}`;
  }
}

// ─── Browser setup ─────────────────────────────────────────────────────

async function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-web-security'],
    defaultViewport: { width: 1280, height: 900 },
  });
}

async function newPage(browser) {
  const p = await browser.newPage();
  await p.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  );
  await p.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8' });
  await p.setRequestInterception(true);
  p.on('request', req => {
    const t = req.resourceType();
    if (['image','font','stylesheet'].includes(t)) req.abort();
    else req.continue();
  });
  return p;
}

// ─── Extractors ────────────────────────────────────────────────────────

const getNum = (str, re) => {
  const m = (str || '').match(re);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
};

async function extractDetail(page, type) {
  // Table extraction
  const table = await page.evaluate(() => {
    const m = {};
    document.querySelectorAll('table tr').forEach(r => {
      const cs = [].map.call(r.querySelectorAll('td,th'),
        c => c.textContent.trim().replace(/\s+/g, ' '));
      for (let i = 0; i < cs.length - 1; i += 2) {
        const k = cs[i].replace(/\s*ヒント.*$/, '').trim();
        const v = cs[i+1].trim();
        if (k && v && k.length < 50 && !m[k]) m[k] = v;
      }
    });
    // Also look for common div-based layouts
    document.querySelectorAll('.data_table li, .section_text').forEach(el => {
      const text = el.textContent.trim().replace(/\s+/g, ' ');
      const parts = text.split('：');
      if (parts.length === 2) {
        const k = parts[0].trim().replace(/\s*ヒント.*$/, '');
        const v = parts[1].trim();
        if (k && v && k.length < 50 && !m[k]) m[k] = v;
      }
    });
    return m;
  });

  // Images
  const imageUrls = await page.evaluate(() => {
    const s = new Set();
    document.querySelectorAll('[data-src]').forEach(e => {
      const u = e.getAttribute('data-src');
      if (u && u.includes('img01.suumo.com') && !u.includes('logo') && !u.includes('banner')) s.add(u);
    });
    document.querySelectorAll('img[src]').forEach(e => {
      const u = e.src;
      if (u && u.includes('img01.suumo.com') && !u.includes('logo') && !u.includes('banner')) s.add(u);
    });
    return [...s].slice(0, 10);
  });

  // Name
  const name = await page.evaluate(() => {
    const el = document.querySelector('.property_view_main-title') ||
               document.querySelector('.cassetteitem_content-title') ||
               document.querySelector('h1') ||
               document.querySelector('.detail-hit_heading') ||
               document.querySelector('.section_h1');
    return el ? el.textContent.trim().replace(/\s+/g, ' ') : '';
  });

  // Contact
  const contactName  = await page.evaluate(() => (document.querySelector('.viewform_advance_shop-name') || {}).textContent || '');
  const contactPhone = await page.evaluate(() => (document.querySelector('.viewform_advance_shop-cal-number') || {}).textContent || '');
  const contactHours = await page.evaluate(() => (document.querySelector('.viewform_advance_shop-detail-text') || {}).textContent || '');

  // Numeric fields
  const areaM  = (table['専有面積'] || '').match(/([\d.]+)m/);
  const yearM  = (table['築年月'] || '').match(/(\d{4})年/);
  const ageM   = (table['築年数'] || '').match(/(\d+)年/);
  const floor  = table['階'] || table['階数'] || '';
  const addr   = table['所在地'] || '';
  const trans  = table['駅徒步'] || table['交通'] || table['沿線・駅'] || table['アクセス'] || '';

  const base = {
    type, name, address: addr, transport: trans, imageUrls,
    area:   areaM ? parseFloat(areaM[1]) : null,
    layout: table['間取り'] || '',
    floor,
    age:    ageM  ? parseInt(ageM[1])  : null,
    year:   yearM ? parseInt(yearM[1]) : null,
    contactName: contactName.trim(),
    contactPhone: contactPhone.trim().replace(/[-‐‑()（）\s]/g, ''),
    contactHours: contactHours.trim(),
  };

  if (type === 'rental') {
    const rentText = table['賃料'] || '';
    const rent = getNum(rentText, /([\d,.]+)万/) || getNum(rentText, /([\d,.]+)円/);
    return {
      ...base,
      rent,
      managementFee: getNum(table['管理費'] || '', /([\d,]+)円/),
      deposit:       getNum(table['敷金']   || '', /([\d,.]+)万/),
      keyMoney:      getNum(table['礼金']   || '', /([\d,.]+)万/),
    };
  } else {
    const priceText = type === 'newBuilds'
      ? (table['予定販売価格'] || table['販売価格'] || '')
      : (table['価格'] || table['販売価格'] || table['価格'] || '');
    const price = getNum(priceText, /([\d,.]+)万/);
    return {
      ...base,
      price,
    };
  }
}

// ─── Scrape one detail page ─────────────────────────────────────────────

async function scrapeOneDetail(browser, url, type) {
  const page = await newPage(browser);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await rd(2000, 5000);
    await humanScroll(page, 2);

    const data = await extractDetail(page, type);
    return { ...data, sourceUrl: url };
  } catch (e) {
    return { type, sourceUrl: url, name: '', error: e.message };
  } finally {
    await page.close().catch(() => {});
  }
}

// ─── Scrape category by pages ───────────────────────────────────────────

async function scrapeCategoryPages(browser, category, pages, dm) {
  const { name, listUrl, detailRe, detailExcl, area, pageMax } = category;

  const collectedUrls = [];
  const detailResults = [];
  let pagesScraped = 0;

  console.log(`\n📂 ${name}: target ${pages} pages, area=${area}`);

  for (let pg = 1; pg <= pages; pg++) {
    const url = listUrl(area, pg);
    process.stdout.write(`\r  Page ${pg}/${pages} ...`);

    const page = await newPage(browser);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await rd(6000, 11000);
      await humanScroll(page, 3);

      // Extract detail URLs
      const urls = await page.evaluate((re, ex) => {
        const s = new Set();
        const detailRe2 = new RegExp(re);
        const exclRe2 = ex ? new RegExp(ex) : null;
        document.querySelectorAll('a[href]').forEach(a => {
          const u = a.href.split('?')[0].split('#')[0];
          if (detailRe2.test(u) && (!exclRe2 || !exclRe2.test(u))) s.add(u);
        });
        return [...s];
      }, detailRe, detailExcl || '');

      const newUrls = urls.filter(u => !collectedUrls.includes(u));
      collectedUrls.push(...newUrls);
      pagesScraped++;

      process.stdout.write(` +${newUrls.length} urls (total ${collectedUrls.length})`);
      if (urls.length === 0) {
        console.log(' (no listings, stopping)');
        break;
      }

    } catch (e) {
      process.stdout.write(` ✗ ${e.message.split('\n')[0]}`);
    }

    await page.close();

    // Random wait between pages
    if (pg < pages) await rd(1500, 3000);

    // Save after every 5 pages
    if (pagesScraped % 5 === 0) {
      // Quick scrape details for collected URLs (don't wait for all, just save progress)
      const pendingUrls = collectedUrls.filter(u => !detailResults.find(r => r.sourceUrl === u));
      if (pendingUrls.length > 0) {
        // Scrape a sample of pending (up to 10 per batch) for immediate data
        const sampleSize = Math.min(10, pendingUrls.length);
        for (let i = 0; i < sampleSize; i++) {
          const detailUrl = pendingUrls[i];
          if (!detailResults.find(r => r.sourceUrl === detailUrl)) {
            const result = await scrapeOneDetail(browser, detailUrl, name);
            detailResults.push(result);
            await rd(800, 1500);
          }
        }
      }

      dm.addItems(name, detailResults);
      dm.save();
      console.log(`\n  💾 Saved: ${dm.status()}`);
      // Reset detailResults since they're now in dm
      detailResults.length = 0;
    }
    console.log('');
  }

  // Scrape all remaining collected URLs that haven't been detailed
  console.log(`\n  🔍 Scraping details for ${collectedUrls.length} listings...`);
  const pending = collectedUrls.filter(u => !dm.data[name].find(i => i.sourceUrl === u));

  for (let i = 0; i < pending.length; i++) {
    const url = pending[i];
    const shortUrl = url.split('suumo.jp')[1] || url;
    process.stdout.write(`\r  [${i+1}/${pending.length}] ${shortUrl.substring(0,55)}`);
    const result = await scrapeOneDetail(browser, url, name);
    detailResults.push(result);
    await rd(800, 1500);

    // Save every 50 details
    if ((i + 1) % 50 === 0) {
      dm.addItems(name, detailResults);
      dm.save();
      process.stdout.write(`\n  💾 checkpoint (${i+1}/${pending.length}): ${dm.status()}\n`);
      detailResults.length = 0;
    }
  }

  if (detailResults.length > 0) {
    dm.addItems(name, detailResults);
    detailResults.length = 0;
  }

  dm.save();
  console.log(`  ✅ ${name} complete: ${dm.status()}`);
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Nagoya House Scraper v6 — Page-based with 5-page checkpoints\n');
  console.log(`   Chrome: ${CHROME}`);
  console.log(`   Output: ${OUTPUT}\n`);

  const dm = new DataManager(OUTPUT);
  dm._initMeta();
  console.log(`   Initial: ${dm.status()}\n`);

  const NAGOYA_AREA = 'sc_nagoya'; // Main Nagoya area

  const CATEGORIES = [
    {
      name: 'rentals',
      listUrl: (area, page) => `https://suumo.jp/chintai/aichi/${area}/?page=${page}`,
      detailRe: 'jnc_',
      detailExcl: null,
      area: NAGOYA_AREA,
      pageMax: 20,
    },
    {
      name: 'used',
      listUrl: (area, page) => `https://suumo.jp/ms/chuko/aichi/${area}/?page=${page}`,
      detailRe: 'nc_',
      detailExcl: 'nc_677',
      area: NAGOYA_AREA,
      pageMax: 20,
    },
    {
      name: 'newBuilds',
      listUrl: (area, page) => `https://suumo.jp/ms/shinchiku/aichi/${area}/`,
      detailRe: 'nc_677',
      detailExcl: null,
      area: NAGOYA_AREA,
      pageMax: 10,
    },
  ];

  const browser = await launchBrowser();

  for (const cat of CATEGORIES) {
    const existing = dm.itemCount(cat.name);
    if (existing > 0) {
      console.log(`\n⏭ ${cat.name} — already has ${existing} entries, skipping category`);
      continue;
    }
    await scrapeCategoryPages(browser, cat, cat.pageMax, dm);
  }

  await browser.close();

  console.log('\n✅ All done!');
  console.log(`   Rentals:   ${dm.itemCount('rentals')}`);
  console.log(`   Used:      ${dm.itemCount('used')}`);
  console.log(`   NewBuilds: ${dm.itemCount('newBuilds')}`);
  console.log(`   → ${OUTPUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });