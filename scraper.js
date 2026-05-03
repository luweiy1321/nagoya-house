/**
 * suumo.jp Nagoya House Scraper
 * Scrapes rental, new-build, and used property listings for Nagoya, Japan
 * 
 * Rental URL:    https://suumo.jp/chintai/aichi/sa_nagoya/
 * NewBuild URL:   https://suumo.jp/ms/shinchiku/aichi/sa_nagoya/
 * Used URL:       https://suumo.jp/ms/chuko/aichi/sa_nagoya/
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'data.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer': 'https://suumo.jp/',
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Rental Scraper ────────────────────────────────────────────────────────────
// Structure: li > div.cassetteitem > div.cassetteitem-detail > div.cassetteitem-detail-body
//   .cassetteitem_content-title: property name
//   .cassetteitem_detail-col1: address
//   .cassetteitem_detail-col2: transport/station
//   .cassetteitem_detail-col3: age + floors
//   tr.js-cassette_link: each room variant (in sibling div under same cassetteitem)

async function scrapeRentals(page = 1) {
  const url = page === 1
    ? 'https://suumo.jp/chintai/aichi/sa_nagoya/'
    : `https://suumo.jp/chintai/aichi/sa_nagoya/p${page}/`;

  console.log(`[Rental] Fetching page ${page}: ${url}`);
  const response = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(response.data);

  const listings = [];

  $('.cassetteitem-detail-body').each((i, body) => {
    const $body = $(body);
    const name = $body.find('.cassetteitem_content-title').text().trim();
    if (!name) return;

    const address = $body.find('.cassetteitem_detail-col1').text().trim();
    const station = $body.find('.cassetteitem_detail-col2').text().trim().replace(/\s+/g, ' ');
    const col3Text = $body.find('.cassetteitem_detail-col3').text().trim();

    const ageMatch = col3Text.match(/築(\d+)年/);
    const floorsMatch = col3Text.match(/(\d+)階建/);
    const age = ageMatch ? parseInt(ageMatch[1]) : null;
    const floors = floorsMatch ? parseInt(floorsMatch[1]) : null;

    const $li = $body.closest('li');

    $li.find('tr.js-cassette_link').each((rowIdx, tr) => {
      const $tr = $(tr);

      const floor = $tr.find('td').eq(1).text().trim().replace(/\s+/g, ' ') || '-';

      const rentRaw = $tr.find('.cassetteitem_price--rent').text().trim();
      const rentMatch = rentRaw.match(/([\d,.]+)万円/);
      const rent = rentMatch ? parseFloat(rentMatch[1].replace(/,/g, '')) : null;

      const mgmtRaw = $tr.find('.cassetteitem_price--administration').text().trim();
      const mgmtMatch = mgmtRaw.match(/([\d,]+)円/);
      const managementFee = mgmtMatch ? parseInt(mgmtMatch[1].replace(/,/g, '')) : 0;

      const depositRaw = $tr.find('.cassetteitem_price--deposit').text().trim();
      const depositMatch = depositRaw.match(/([\d,.]+)万円/);
      const deposit = depositMatch ? parseFloat(depositMatch[1].replace(/,/g, '')) : null;

      const keyRaw = $tr.find('.cassetteitem_price--gratuity').text().trim();
      const keyMatch = keyRaw.match(/([\d,.]+)万円/);
      const keyMoney = keyMatch ? parseFloat(keyMatch[1].replace(/,/g, '')) : null;

      const layoutRaw = $tr.find('.cassetteitem_madori').text().trim();
      const layout = layoutRaw.split('\n')[0].trim();

      const areaRaw = $tr.find('.cassetteitem_menseki').text().trim();
      const areaMatch = areaRaw.match(/([\d.]+)m/);
      const area = areaMatch ? parseFloat(areaMatch[1]) : null;

      listings.push({
        type: 'rental',
        name,
        address,
        station,
        floor,
        rent,
        managementFee,
        deposit,
        keyMoney,
        layout,
        area,
        age,
        floors,
      });
    });
  });

  const hasNext = $('.pagerNext').length > 0 || $('a[rel="next"]').length > 0;
  return { listings, hasNext };
}

// ─── New Build Scraper ─────────────────────────────────────────────────────────
// Structure: div.cassette
//   .cassette_header-title: property name
//   .cassette_basic-value (eq 0,1,2): address / transport / delivery
//   .cassette_price-accent: price or "未定"
//   .cassette_price-description: layout + area

async function scrapeNewBuilds(page = 1) {
  const url = page === 1
    ? 'https://suumo.jp/ms/shinchiku/aichi/sa_nagoya/'
    : `https://suumo.jp/ms/shinchiku/aichi/sa_nagoya/p${page}/`;

  console.log(`[NewBuild] Fetching page ${page}: ${url}`);
  const response = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(response.data);

  const listings = [];

  $('.cassette').each((i, el) => {
    const $el = $(el);

    const name = $el.find('.cassette_header-title').text().trim();
    if (!name) return;

    const address = $el.find('.cassette_basic-value').eq(0).text().trim();
    const transport = $el.find('.cassette_basic-value').eq(1).text().trim();
    const delivery = $el.find('.cassette_basic-value').eq(2).text().trim();

    const priceText = $el.find('.cassette_price-accent').text().trim();
    let price = null;
    const priceNumMatch = priceText.match(/([\d,]+)万円/);
    if (priceNumMatch) {
      price = parseFloat(priceNumMatch[1].replace(/,/g, ''));
    }

    const descText = $el.find('.cassette_price-description').text().trim();
    const layoutMatch = descText.match(/([\dLDK]+)/);
    const areaMatch = descText.match(/([\d.]+)m/);
    const layout = layoutMatch ? layoutMatch[1] : '';
    const area = areaMatch ? parseFloat(areaMatch[1]) : null;

    listings.push({
      type: 'new_build',
      name,
      address,
      transport,
      delivery,
      price,
      layout,
      area,
    });
  });

  const hasNext = $('.pagerNext').length > 0 || $('a[rel="next"]').length > 0;
  return { listings, hasNext };
}

// ─── Used Property Scraper ────────────────────────────────────────────────────
// Structure: div.property_unit
//   .property_unit-title a: page title (fallback name)
//   .dottable-line dl: various key-value pairs (物件名, 所在地, 沿線・駅, etc.)
//   .dottable-fix: table with td cells, each cell has dl pairs (面積, 户型, etc.)

async function scrapeUsed(page = 1) {
  const url = page === 1
    ? 'https://suumo.jp/ms/chuko/aichi/sa_nagoya/'
    : `https://suumo.jp/ms/chuko/aichi/sa_nagoya/p${page}/`;

  console.log(`[Used] Fetching page ${page}: ${url}`);
  const response = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(response.data);

  const listings = [];

  $('.property_unit').each((i, el) => {
    const $el = $(el);

    // Property name: first try "物件名" from dottable-line, else title
    let name = '';
    $el.find('.dottable-line').each((j, line) => {
      const dt = $(line).find('dt').text().trim();
      const dd = $(line).find('dd').text().trim();
      if (dt === '物件名') name = dd;
    });
    if (!name) {
      name = $el.find('.property_unit-title').text().trim();
    }

    // Address and transport from dottable-line dl pairs
    let address = '';
    let transport = '';
    $el.find('.dottable-line').each((j, line) => {
      $(line).find('dl').each((k, dl) => {
        const $dl = $(dl);
        const dt = $dl.find('dt').text().trim();
        const dd = $dl.find('dd').text().trim();
        if (dt === '所在地') address = dd;
        if (dt === '沿線・駅') transport = dd;
      });
    });

    // Price
    let price = null;
    $el.find('.dottable-line').each((j, line) => {
      const dt = $(line).find('dt').text().trim();
      if (dt === '販売価格') {
        const dd = $(line).find('.dottable-value').text().trim();
        const m = dd.match(/([\d,.]+)万円/);
        if (m) price = parseFloat(m[1].replace(/,/g, ''));
      }
    });

    // Layout and area: iterate over td cells in dottable-fix table
    // Each td has dl > dt/dd pairs
    let layout = '';
    let area = null;
    $el.find('.dottable-fix td').each((k, td) => {
      $(td).find('dl').each((m, dl) => {
        const $dl = $(dl);
        const dt = $dl.find('dt').text().trim();
        const dd = $dl.find('dd').text().trim();
        if (dt === '専有面積') {
          const areaMatch = dd.match(/([\d.]+)m/);
          if (areaMatch) area = parseFloat(areaMatch[1]);
        }
        if (dt === '間取り') {
          const layoutMatch = dd.match(/([\dLDK]+)/);
          if (layoutMatch) layout = layoutMatch[1];
        }
      });
    });

    listings.push({
      type: 'used',
      name,
      address,
      transport,
      price,
      layout,
      area,
    });
  });

  const hasNext = $('.pagerNext').length > 0 || $('a[rel="next"]').length > 0;
  return { listings, hasNext };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Nagoya House Scraper\n');

  const data = {
    meta: {
      scrapedAt: new Date().toISOString(),
      sources: [
        'https://suumo.jp/chintai/aichi/sa_nagoya/ (Rental)',
        'https://suumo.jp/ms/shinchiku/aichi/sa_nagoya/ (New Build)',
        'https://suumo.jp/ms/chuko/aichi/sa_nagoya/ (Used)',
      ],
    },
    rentals: [],
    newBuilds: [],
    used: [],
  };

  // ── Rentals (3 pages) ──
  console.log('📦 Scraping rentals...');
  for (let page = 1; page <= 3; page++) {
    try {
      const { listings, hasNext } = await scrapeRentals(page);
      data.rentals.push(...listings);
      console.log(`  → Page ${page}: +${listings.length} (total: ${data.rentals.length})`);
      if (!hasNext) break;
      await sleep(2000);
    } catch (err) {
      console.error(`  ✗ Error on rental page ${page}: ${err.message}`);
    }
  }

  // ── New Builds (2 pages) ──
  console.log('\n🏗️  Scraping new builds...');
  for (let page = 1; page <= 2; page++) {
    try {
      const { listings, hasNext } = await scrapeNewBuilds(page);
      data.newBuilds.push(...listings);
      console.log(`  → Page ${page}: +${listings.length} (total: ${data.newBuilds.length})`);
      if (!hasNext) break;
      await sleep(2000);
    } catch (err) {
      console.error(`  ✗ Error on new build page ${page}: ${err.message}`);
    }
  }

  // ── Used (2 pages) ──
  console.log('\n🏠 Scraping used properties...');
  for (let page = 1; page <= 2; page++) {
    try {
      const { listings, hasNext } = await scrapeUsed(page);
      data.used.push(...listings);
      console.log(`  → Page ${page}: +${listings.length} (total: ${data.used.length})`);
      if (listings.length === 0 || !hasNext) break;
      await sleep(2000);
    } catch (err) {
      console.error(`  ✗ Error on used page ${page}: ${err.message}`);
    }
  }

  // ── Save ──
  data.meta.totalRentals = data.rentals.length;
  data.meta.totalNewBuilds = data.newBuilds.length;
  data.meta.totalUsed = data.used.length;

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf-8');

  console.log('\n✅ Done!');
  console.log(`   Rentals:    ${data.rentals.length}`);
  console.log(`   New Builds: ${data.newBuilds.length}`);
  console.log(`   Used:       ${data.used.length}`);
  console.log(`   Saved to:   ${OUTPUT_FILE}`);
}

main().catch(console.error);
