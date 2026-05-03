/**
 * SUUMO Nagoya House Scraper v7
 * - Rentals: sc_nagoyashichikusa 20 pages
 * - Used: sc_nagoyashichikusa 20 pages
 * - New Builds: sc_nagoyashichikusa 10 pages
 * - Every 5 pages: save intermediate data
 * - Fields: name, imageUrls, address, transport, area, layout, floor, age, year, rent/price, managementFee, deposit, keyMoney, contactName, contactPhone, contactHours, sourceUrl
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT = path.join(__dirname, 'data_puppeteer.json');

const NAGOYA_AREA = 'sc_nagoyashichikusa';

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

function newDataFile() {
  return {
    meta: {
      scrapedAt: new Date().toISOString(),
      version: '7.0-puppeteer',
      fields: ['name','imageUrls','address','transport','area','layout','floor','age','year',
               'rent','price','managementFee','deposit','keyMoney',
               'contactName','contactPhone','contactHours','sourceUrl'],
    },
    rentals: [], used: [], newBuilds: [],
  };
}

function loadData() {
  if (fs.existsSync(OUTPUT)) {
    try {
      const d = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
      // Reset counts - we'll recount from actual data
      return d;
    } catch {}
  }
  return newDataFile();
}

function saveData(data) {
  data.meta.scrapedAt = new Date().toISOString();
  fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2), 'utf-8');
}

function dataStatus(data) {
  const cnt = cat => data[cat].filter(i => i.name && !i.error).length;
  return `rentals=${cnt('rentals')} used=${cnt('used')} newBuilds=${cnt('newBuilds')}`;
}

function addItems(data, cat, items) {
  const existing = new Set(data[cat].map(i => i.sourceUrl));
  const newOnes = items.filter(i => !existing.has(i.sourceUrl));
  data[cat].push(...newOnes);
  return newOnes.length;
}

// ─── Browser setup ─────────────────────────────────────────────────────

async function newPage(browser) {
  const p = await browser.newPage();
  await p.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  );
  await p.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8' });
  return p;
}

async function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 900 },
  });
}

// ─── Extract detail page data ──────────────────────────────────────────

async function scrapeDetail(browser, url, catName) {
  const page = await newPage(browser);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await rd(3000, 6000);
    await humanScroll(page, 2);

    // Get page title as name fallback
    const fallbackName = await page.title().then(t => t.split('/')[0].replace(/　/g, ' ').trim());

    // Extract from table
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
                 document.querySelector('.detailHititle') ||
                 document.querySelector('h1') ||
                 document.querySelector('.section_h1') ||
                 document.querySelector('.cassetteitem_content-title');
      return el ? el.textContent.trim().replace(/\s+/g, ' ') : '';
    }) || fallbackName;

    // Contact info
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
      name, address: addr, transport: trans, imageUrls,
      area:   areaM ? parseFloat(areaM[1]) : null,
      layout: table['間取り'] || '',
      floor,
      age:    ageM  ? parseInt(ageM[1])  : null,
      year:   yearM ? parseInt(yearM[1]) : null,
      contactName:  contactName.trim(),
      contactPhone: contactPhone.trim().replace(/[-‐‑()（）\s]/g, ''),
      contactHours:  contactHours.trim(),
      sourceUrl: url,
    };

    if (catName === 'rentals') {
      // Rent: look in table first, then in emphasis divs
      let rentStr = table['賃料'] || '';
      if (!rentStr) {
        rentStr = await page.evaluate(() => {
          const el = document.querySelector('.property_view_note-emphasis') ||
                     document.querySelector('[class*=\"emphasis\"]') ||
                     document.querySelector('.section_rent') ||
                     document.querySelector('.detailmoney') ||
                     document.querySelector('.money');
          return el ? el.textContent.trim() : '';
        });
      }
      const rentM = (rentStr || '').match(/([\d,.]+)万/);
      const rent = rentM ? parseFloat(rentM[1].replace(/,/g, '')) : null;

      return {
        ...base,
        type: 'rental',
        rent,
        managementFee: (table['管理費'] || '').match(/([\d,]+)円/) ? parseInt(table['管理費'].replace(/,/g, '').match(/([\d,]+)円/)[1]) : null,
        deposit:  (table['敷金'] || '').match(/([\d,.]+)万/) ? parseFloat(table['敷金'].replace(/,/g, '').match(/([\d,.]+)万/)[1]) : null,
        keyMoney: (table['礼金'] || '').match(/([\d,.]+)万/) ? parseFloat(table['礼金'].replace(/,/g, '').match(/([\d,.]+)万/)[1]) : null,
      };
    } else {
      // used / newBuilds — get price
      let priceStr = catName === 'newBuilds'
        ? (table['予定販売価格'] || table['販売価格'] || '')
        : (table['価格'] || table['販売価格'] || '');

      if (!priceStr) {
        priceStr = await page.evaluate(() => {
          const el = document.querySelector('.property_view_note-emphasis') ||
                     document.querySelector('[class*=\"price\"]') ||
                     document.querySelector('.section_price') ||
                     document.querySelector('.money');
          return el ? el.textContent.trim() : '';
        });
      }
      const priceM = (priceStr || '').match(/([\d,.]+)万/);
      const price = priceM ? parseFloat(priceM[1].replace(/,/g, '')) : null;

      return {
        ...base,
        type: catName === 'newBuilds' ? 'newBuilds' : 'used',
        price,
        priceRange: table['予定販売価格'] || table['価格帯'] || '',
      };
    }
  } catch (e) {
    return { name: '', type: catName, sourceUrl: url, error: e.message };
  } finally {
    await page.close().catch(() => {});
  }
}

// ─── Scrape one category: collect URLs then details ─────────────────────

async function scrapeCategory(browser, catName, listUrlFn, detailRe, detailExcl, pages, data) {
  console.log(`\n📂 ${catName}: ${pages} pages`);
  console.log(`   URL pattern: ${listUrlFn(NAGOYA_AREA, 1).replace('page=1', 'page=N')}`);

  const collected = [];
  const detailBatch = [];

  for (let pg = 1; pg <= pages; pg++) {
    const listUrl = listUrlFn(NAGOYA_AREA, pg);
    process.stdout.write(`  Page ${pg}/${pages} ...`);

    const page = await newPage(browser);
    try {
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await rd(6000, 11000);
      await humanScroll(page, 3);

      // Collect detail URLs
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

      const before = collected.length;
      urls.forEach(u => { if (!collected.includes(u)) collected.push(u); });
      const added = collected.length - before;
      process.stdout.write(` +${added} (total ${collected.length})`);

      if (urls.length === 0) {
        console.log(' (no listings)');
        break;
      }
    } catch (e) {
      process.stdout.write(` ✗ ${e.message.split('\n')[0]}`);
    }

    await page.close();
    if (pg < pages) await rd(1500, 3000);
    console.log('');

    // Every 5 pages: scrape some details and save
    if (pg % 5 === 0) {
      // Scrape up to 15 details to show progress
      const existing = new Set(data[catName].map(i => i.sourceUrl));
      const pending = collected.filter(u => !existing.has(u)).slice(0, 15);

      if (pending.length > 0) {
        console.log(`  🔍 Quick scrape ${pending.length} items for checkpoint...`);
        for (const url of pending) {
          const result = await scrapeDetail(browser, url, catName);
          detailBatch.push(result);
          await rd(800, 1500);
        }
        addItems(data, catName, detailBatch);
        saveData(data);
        console.log(`  💾 Saved: ${dataStatus(data)}`);
        detailBatch.length = 0;
      } else {
        // No new items to scrape, just save progress
        saveData(data);
        console.log(`  💾 Saved: ${dataStatus(data)}`);
      }
    }
  }

  // Scrape remaining details
  const existing = new Set(data[catName].map(i => i.sourceUrl));
  const pending = collected.filter(u => !existing.has(u));
  console.log(`\n  🔍 Scraping ${pending.length} remaining details...`);

  for (let i = 0; i < pending.length; i++) {
    const url = pending[i];
    const short = url.split('suumo.jp')[1] || url;
    process.stdout.write(`\r  [${i+1}/${pending.length}] ${short.substring(0, 55)}`);
    const result = await scrapeDetail(browser, url, catName);
    detailBatch.push(result);
    await rd(800, 1500);

    if ((i + 1) % 20 === 0 || i === pending.length - 1) {
      addItems(data, catName, detailBatch);
      saveData(data);
      process.stdout.write(`\n  💾 checkpoint ${i+1}/${pending.length}: ${dataStatus(data)}\n`);
      detailBatch.length = 0;
    }
  }

  if (detailBatch.length > 0) {
    addItems(data, catName, detailBatch);
    saveData(data);
    detailBatch.length = 0;
  }

  const cnt = data[catName].filter(i => i.name && !i.error).length;
  console.log(`  ✅ ${catName} done: ${cnt} items`);
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 SUUMO Nagoya Scraper v7 — 5-page checkpoints\n');
  console.log(`   Chrome: ${CHROME}`);
  console.log(`   Output: ${OUTPUT}\n`);

  const data = loadData();
  const existing = {
    rentals:   data.rentals.filter(i => i.name && !i.error).length,
    used:      data.used.filter(i => i.name && !i.error).length,
    newBuilds: data.newBuilds.filter(i => i.name && !i.error).length,
  };
  console.log(`   Existing data: rentals=${existing.rentals} used=${existing.used} newBuilds=${existing.newBuilds}\n`);

  const browser = await launchBrowser();

  const CATEGORIES = [
    {
      name: 'rentals',
      listUrlFn: (area, pg) => `https://suumo.jp/chintai/aichi/${area}/?page=${pg}`,
      detailRe: 'jnc_',
      detailExcl: null,
      pages: 20,
    },
    {
      name: 'used',
      listUrlFn: (area, pg) => `https://suumo.jp/ms/chuko/aichi/${area}/?page=${pg}`,
      detailRe: 'nc_',
      detailExcl: 'nc_677',
      pages: 20,
    },
    {
      name: 'newBuilds',
      listUrlFn: (area, pg) => `https://suumo.jp/ms/shinchiku/aichi/${area}/`,
      detailRe: 'nc_677',
      detailExcl: null,
      pages: 10,
    },
  ];

  for (const cat of CATEGORIES) {
    const have = data[cat.name].filter(i => i.name && !i.error).length;
    if (have > 0) {
      console.log(`\n⏭ ${cat.name} — already has ${have} entries, skipping`);
      continue;
    }
    await scrapeCategory(browser, cat.name, cat.listUrlFn, cat.detailRe, cat.detailExcl, cat.pages, data);
  }

  await browser.close();

  // Final summary
  const cnt = cat => data[cat].filter(i => i.name && !i.error).length;
  console.log('\n✅ All done!');
  console.log(`   Rentals:   ${cnt('rentals')}`);
  console.log(`   Used:      ${cnt('used')}`);
  console.log(`   NewBuilds: ${cnt('newBuilds')}`);
  console.log(`   → ${OUTPUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });