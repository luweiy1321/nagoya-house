/**
 * SUUMO Nagoya House Scraper — Puppeteer Edition v5
 *
 * URL Strategy:
 *   Rentals:    https://suumo.jp/chintai/aichi/sc_{area}/?page=N
 *   Used:       https://suumo.jp/ms/chuko/aichi/sc_{area}/?page=N
 *   New Build:  https://suumo.jp/ms/shinchiku/aichi/sc_{area}/
 *
 * Each category: multiple areas × multiple pages, human-like delays.
 * Checkpoint saved after each area + every 10 detail scrapes.
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME     = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT     = path.join(__dirname, 'data_puppeteer.json');
const CHECKPOINT = path.join(__dirname, 'data_puppeteer_checkpoint.json');

// ─── Areas ───────────────────────────────────────────────────────────────

const NAGOYA_AREAS = [
  'sc_nagoyashichikusa','sc_nagoyashinaka','sc_nagoyashinakamura',
  'sc_nagoyashinishi','sc_nagoyashinakagawa','sc_nagoyashishowa',
  'sc_nagoyashihigashi','sc_nagoyashimeito','sc_nagoyashikita',
  'sc_nagoyashimizuho','sc_nagoyashiatsuta','sc_nagoyashiminato',
  'sc_nagoyashiminami','sc_nagoyashimoriyama','sc_nagoyashimidori',
  'sc_nagoyashitempaku',
];

// ─── Category definitions ────────────────────────────────────────────────

const CATEGORIES = [
  {
    name:      'rentals',
    type:      'rental',
    listUrl:   (area, page) => `https://suumo.jp/chintai/aichi/${area}/?page=${page}`,
    detailRe:  'jnc_',
    detailExcl: null,
    areas:     NAGOYA_AREAS.slice(0, 3),   // 3 areas
    pageMax:   50,                          // 50 pages per area
    threshold: 300,                         // stop collecting once we have this many
  },
  {
    name:      'used',
    type:      'used',
    listUrl:   (area, page) => `https://suumo.jp/ms/chuko/aichi/${area}/?page=${page}`,
    detailRe:  'nc_',
    detailExcl: 'nc_677',
    areas:     NAGOYA_AREAS.slice(0, 16),  // all 16 areas
    pageMax:   50,                          // 50 pages per area
    threshold: 200,
  },
  {
    name:      'new_builds',
    type:      'new_build',
    listUrl:   (area, page) => `https://suumo.jp/ms/shinchiku/aichi/${area}/?page=${page}`,
    detailRe:  'nc_677',
    detailExcl: null,
    areas:     NAGOYA_AREAS.slice(0, 15),  // 15 areas
    pageMax:   20,                           // 20 pages per area
    threshold: 100,
  },
];

// ─── Utilities ───────────────────────────────────────────────────────────

const rand  = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const pause = ms  => new Promise(r => setTimeout(r, ms));
const rd    = (a, b) => pause(rand(a, b));

async function scrollHuman(page, times = 3) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(y => window.scrollBy(0, y), rand(400, 900));
    await rd(300, 700);
    await page.mouse.move(rand(200, 1100), rand(80, 700));
    await rd(50, 150);
  }
}

// ─── Checkpoint ─────────────────────────────────────────────────────────

function saveCheckpoint(state) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify(state, null, 2), 'utf-8');
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT)) return null;
  try { return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf-8')); } catch { return null; }
}

// ─── Browser setup ─────────────────────────────────────────────────────

async function browser() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
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

// ─── Numeric extractor ──────────────────────────────────────────────────

const getNum = (str, re) => {
  const m = (str || '').match(re);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
};

// ─── Scrape one detail page ─────────────────────────────────────────────

async function scrapeOne(browser, url, type) {
  const p = await newPage(browser);
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await rd(2000, 5000);
    await scrollHuman(p, 2);

    // Extract table data
    const table = await p.evaluate(() => {
      const m = {};
      document.querySelectorAll('table tr').forEach(r => {
        const cs = [].map.call(r.querySelectorAll('td,th'),
          c => c.textContent.trim().replace(/\s+/g, ' '));
        for (let i = 0; i < cs.length - 1; i += 2) {
          const k = cs[i].replace(/\s*ヒント.*$/, '').trim();
          const v = cs[i+1].trim();
          if (k && v && k.length < 50) m[k] = v;
        }
      });
      return m;
    });

    // Extract images
    const imgs = await p.evaluate(() => {
      const s = new Set();
      document.querySelectorAll('[data-src]').forEach(e => {
        const u = e.getAttribute('data-src');
        if (u && u.includes('img01.suumo.com') && !u.includes('logo')) s.add(u);
      });
      document.querySelectorAll('img[src]').forEach(e => {
        const u = e.src;
        if (u && u.includes('img01.suumo.com') && !u.includes('logo')) s.add(u);
      });
      return [...s].slice(0, 10);
    });

    // Extract name
    const name = await p.evaluate(() =>
      (document.querySelector('.property_view_main-title') ||
       document.querySelector('.cassetteitem_content-title') ||
       document.querySelector('h1') || {}).textContent || ''
    ).then(t => t.trim());

    // Extract contact
    const contact = await p.evaluate(() => ({
      name:  (document.querySelector('.viewform_advance_shop-name') || {}).textContent || '',
      phone: (document.querySelector('.viewform_advance_shop-cal-number') || {}).textContent || '',
      hours: (document.querySelector('.viewform_advance_shop-detail-text') || {}).textContent || '',
    }));

    const areaM  = (table['専有面積'] || '').match(/([\d.]+)m/);
    const yearM  = (table['築年月'] || '').match(/(\d{4})年/);
    const ageM   = (table['築年数'] || '').match(/築(\d+)年/);
    const floor  = table['階'] || '';
    const addr   = table['所在地'] || '';
    const trans  = table['駅徒步'] || table['交通'] || table['沿線・駅'] || table['アクセス'] || '';

    if (type === 'rental') {
      const rentText = (table['賃料'] || '') ||
        await p.evaluate(() => (document.querySelector('.property_view_note-emphasis') || {}).textContent || '');
      const rent = getNum(rentText, /([\d,.]+)万円/) || getNum(table['賃料'], /([\d,.]+)万円/);
      return {
        type, name, address: addr, transport: trans, imageUrls: imgs,
        area:   areaM ? parseFloat(areaM[1]) : null,
        layout: table['間取り'] || '',
        floor,
        age:    ageM  ? parseInt(ageM[1])  : null,
        year:   yearM ? parseInt(yearM[1]) : null,
        rent,
        managementFee: getNum(table['管理費'], /([\d,]+)円/),
        deposit:       getNum(table['敷金'],  /([\d,.]+)万円/),
        keyMoney:      getNum(table['礼金'],  /([\d,.]+)万円/),
        contactName:  contact.name,
        contactPhone: contact.phone,
        contactHours: contact.hours,
        sourceUrl: url,
      };
    }

    // used / new_build
    const priceText = type === 'new_build'
      ? (table['予定価格帯'] || table['販売価格'] || '')
      : (table['価格'] || table['販売価格'] || '');
    const price = getNum(priceText, /([\d,.]+)万円/) ||
      getNum(await p.evaluate(() => (document.querySelector('.property_view_note-emphasis') || {}).textContent || ''), /([\d,.]+)万円/);

    return {
      type, name, address: addr, transport: trans, imageUrls: imgs,
      area:   areaM ? parseFloat(areaM[1]) : null,
      layout: table['間取り'] || '',
      floor,
      age:    ageM  ? parseInt(ageM[1])  : null,
      year:   yearM ? parseInt(yearM[1]) : null,
      price,
      priceRange: table['予定</minimax:tool_call>'] || '',
      contactName:  contact.name,
      contactPhone: contact.phone,
      contactHours: contact.hours,
      sourceUrl: url,
    };
  } catch (e) {
    return { type, sourceUrl: url, error: e.message };
  } finally {
    await p.close().catch(() => {});
  }
}

// ─── Collect detail URLs from list pages ────────────────────────────────

async function collectUrls(browser, cat) {
  const results = [];
  const re = new RegExp(cat.detailRe);
  const ex = cat.detailExcl ? new RegExp(cat.detailExcl) : null;
  const BUFFER = Math.floor(cat.threshold * 0.5);  // collect 50% above threshold

  for (const area of cat.areas) {
    if (results.length >= cat.threshold + BUFFER) break;

    const p = await newPage(browser);

    for (let pg = 1; pg <= cat.pageMax; pg++) {
      if (results.length >= cat.threshold + BUFFER) break;

      const url = cat.listUrl(area, pg);
      const key = `${cat.name}/${area}/pg${pg}`;
      process.stdout.write(`\r  ${key} ...`);

      try {
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await rd(6000, 11000);
        await scrollHuman(p, 3);

        const urls = await p.evaluate((re, ex) => {
          const s = new Set();
          const detailRe = new RegExp(re);
          const exclRe = ex ? new RegExp(ex) : null;
          document.querySelectorAll('a[href]').forEach(a => {
            const u = a.href.split('?')[0].split('#')[0];
            if (detailRe.test(u) && (!exclRe || !exclRe.test(u))) s.add(u);
          });
          return [...s];
        }, cat.detailRe, cat.detailExcl || '');

        const before = results.length;
        urls.forEach(u => {
          if (!results.includes(u)) results.push(u);
        });
        const added = results.length - before;
        process.stdout.write(` +${added} (total ${results.length})\n`);

        if (urls.length === 0) break;  // no more pages
      } catch (e) {
        process.stdout.write(` ✗ ${e.message.split('\n')[0]}\n`);
      }

      if (pg < cat.pageMax) await rd(1500, 3000);

      // Save intermediate checkpoint every 5 pages
      if (pg % 5 === 0) {
        saveCheckpoint({ phase: 'collected', cat: cat.type, urls: results });
        console.log(`  📋 [pg${pg}] checkpoint saved (${results.length} URLs)`);
      }
    }
    await p.close();
    saveCheckpoint({ phase: 'collected', cat: cat.type, urls: results });
    console.log(`  📋 After ${area}: ${results.length} URLs collected`);
  }

  return results;
}

// ─── Scrape details for a list of URLs ─────────────────────────────────

async function scrapeDetails(browser, urls, type, threshold) {
  const results = urls.map(u => ({ sourceUrl: u, type }));
  let checkpointCount = 0;

  // Stop detail scraping once we have enough successful items (threshold + 50 buffer)
  const targetCount = Math.min(results.length, Math.floor(threshold * 1.5));

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    if (item.name || item.error) continue;  // already scraped (from checkpoint)

    const successCount = results.filter(r => r.name && !r.error).length;
    if (successCount >= targetCount) {
      console.log(`\n  ✅ ${type}: reached ${successCount} successful details (target ${targetCount}), stopping early`);
      break;
    }

    const shortUrl = item.sourceUrl.split('suumo.jp')[1] || item.sourceUrl;
    process.stdout.write(`\r  [${i + 1}/${results.length}] ${shortUrl.substring(0, 55)} (${successCount} ok)`);
    const full = await scrapeOne(browser, item.sourceUrl, type);
    results[i] = full;

    checkpointCount++;
    if (checkpointCount % 5 === 0) {
      saveCheckpoint({ phase: 'details', cat: type, results });
      process.stdout.write(`\r  ⏱ checkpoint (${i + 1}/${results.length}) saved   \n`);
    }

    await rd(800, 1500);
  }

  saveCheckpoint({ phase: 'details', cat: type, results });
  console.log(`\n  ✅ ${results.length} ${type} details complete`);
  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Nagoya House Scraper v5\n');
  console.log(`   Chrome: ${CHROME}`);
  console.log(`   Output: ${OUTPUT}\n`);

  const b = await browser();
  let allResults = [];  // { rental: [...], used: [...], new_build: [...] }

  for (const cat of CATEGORIES) {
    const existing = allResults.filter(r => r.type === cat.type && (r.name || !r.error));

    if (existing.length >= cat.threshold) {
      console.log(`\n📂 ${cat.name} — ${existing.length} already scraped, skipping`);
      continue;
    }

    console.log(`\n📂 ${cat.name} — ${existing.length} existing + need ${cat.threshold}+`);

    // Load checkpoint for this category if any
    const ck = loadCheckpoint();
    let urls = [];

    if (ck && (ck.cat === cat.type || ck.cat === cat.name)) {
      if (ck.phase === 'collected') {
        urls = ck.urls.filter(u => !allResults.some(r => r.sourceUrl === u));
        console.log(`  📋 Loaded ${ck.urls.length} URLs from checkpoint, ${urls.length} new`);
      } else if (ck.phase === 'details') {
        // Resume from detail checkpoint: merge with existing
        const ckResults = (ck.results || []).map(r => {
          // Clear errors so timed-out items get retried
          if (r.error) return { sourceUrl: r.sourceUrl, type: r.type };
          return r;
        });
        allResults = allResults.filter(r => r.type !== cat.type).concat(ckResults);
        // Items already detailed (have name)
        const detailedUrls = new Set(ckResults.filter(r => r.name).map(r => r.sourceUrl));
        // Items not yet detailed
        urls = ckResults.filter(r => !r.name).map(r => r.sourceUrl);
        console.log(`  📋 Resumed detail checkpoint: ${ckResults.length} total, ${detailedUrls.size} ok, ${urls.length} to scrape`);
      }
    } else {
      urls = await collectUrls(b, cat);
    }

    // Deduplicate against existing
    const existingUrls = new Set(existing.map(r => r.sourceUrl));
    urls = urls.filter(u => !existingUrls.has(u));
    console.log(`  📋 ${urls.length} new URLs to scrape`);

    if (urls.length > 0) {
      const details = await scrapeDetails(b, urls, cat.type, cat.threshold);
      allResults = allResults.filter(r => r.type !== cat.type).concat(details);
    }
  }

  await b.close();

  const rentals   = allResults.filter(r => r.type === 'rental'    && !r.error);
  const used      = allResults.filter(r => r.type === 'used'       && !r.error);
  const newBuilds = allResults.filter(r => r.type === 'new_build' && !r.error);

  const out = {
    meta: {
      scrapedAt:     new Date().toISOString(),
      version:       '5.0-puppeteer',
      fields:        ['imageUrls','name','address','transport','area','layout','floor','age','year',
                      'rent','price','managementFee','deposit','keyMoney','priceRange',
                      'contactName','contactPhone','contactHours','sourceUrl'],
      totalRentals:   rentals.length,
      totalNewBuilds: newBuilds.length,
      totalUsed:      used.length,
    },
    rentals, newBuilds, used,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`\n✅ Done!`);
  console.log(`   Rentals:    ${rentals.length}  (target: 300+)`);
  console.log(`   Used:       ${used.length}  (target: 200+)`);
  console.log(`   New Builds: ${newBuilds.length}  (target: 100+)`);
  console.log(`   → ${OUTPUT}`);

  if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
}

main().catch(e => { console.error(e); process.exit(1); });