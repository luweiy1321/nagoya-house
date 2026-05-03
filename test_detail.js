const puppeteer = require('puppeteer-core');

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-images'],
  });

  const tests = [
    { name: 'Rental',    url: 'https://suumo.jp/chintai/jnc_000105876118/',                           type: 'rental'    },
    { name: 'NewBuild',  url: 'https://suumo.jp/ms/shinchiku/aichi/sc_nagoyashihigashi/nc_67729811/', type: 'new_build' },
    { name: 'Used',      url: 'https://suumo.jp/ms/chuko/aichi/sc_nagoyashiminato/nc_78734678/',     type: 'used'       },
  ];

  for (const test of tests) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

    await page.goto(test.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    await page.evaluate(dy => window.scrollBy(0, dy), 800);
    await new Promise(r => setTimeout(r, 3000));
    await page.evaluate(dy => window.scrollBy(0, dy), 600);
    await new Promise(r => setTimeout(r, 2000));

    const data = await page.evaluate((t, currentUrl) => {
      // Parse table
      var raw = {};
      document.querySelectorAll('table tr').forEach(function(row) {
        var cells = [].map.call(row.querySelectorAll('td,th'), function(c) {
          return c.textContent.trim().replace(/\s+/g, ' ');
        });
        for (var i = 0; i < cells.length - 1; i += 2) {
          var k = cells[i].trim(), v = cells[i+1].trim();
          if (k && v && k.length < 40) {
            var cleanK = k.replace(/\s+ヒント$/, '').trim();
            raw[cleanK] = v;
          }
        }
      });

      var getNum = function(obj, key, pattern) {
        var s = obj[key] || '';
        var m = s.match(pattern);
        return m ? parseFloat(m[1].replace(/,/g, '')) : null;
      };

      // Images
      var imgUrls = new Set();
      document.querySelectorAll('[data-src]').forEach(function(el) {
        var u = el.getAttribute('data-src');
        if (u && u.includes('img01.suumo.com') && !u.includes('logo')) imgUrls.add(u);
      });
      document.querySelectorAll('.property_view_object-img').forEach(function(img) {
        var u = img.getAttribute('data-src') || img.src;
        if (u && u.includes('img01.suumo.com') && !u.includes('logo')) imgUrls.add(u);
      });

      // Contact
      var shopName = '';
      var shopPhone = '';
      var shopEl = document.querySelector('.viewform_advance_shop-name');
      if (shopEl) shopName = shopEl.textContent.trim();
      var phoneEl = document.querySelector('.viewform_advance_shop-cal-number');
      if (phoneEl) shopPhone = phoneEl.textContent.trim();

      // Name
      var nameEl = document.querySelector('.cassetteitem_content-title') ||
                   document.querySelector('.cassette_header-title') ||
                   document.querySelector('.property_unit-title') ||
                   document.querySelector('h1');
      var name = nameEl ? nameEl.textContent.trim() : '';

      var address = raw['所在地'] || '';
      var transport = raw['駅徒步'] || raw['交通'] || raw['沿線・駅'] || '';
      var layout = raw['間取り'] || '';
      var floor = raw['階'] || '';

      var areaMatch = (raw['専有面積'] || '').match(/([\d.]+)m/);
      var area = areaMatch ? parseFloat(areaMatch[1]) : null;

      var yearMatch = (raw['築年月'] || '').match(/(\d{4})年/);
      var year = yearMatch ? yearMatch[1] : null;
      var ageMatch = (raw['築年数'] || '').match(/築(\d+)年/);
      var age = ageMatch ? parseInt(ageMatch[1]) : null;

      if (t === 'rental') {
        var rentText = document.querySelector('.property_view_note-emphasis')?.textContent.trim() || raw['賃料'] || '';
        var rent = getNum({'賃料': rentText}, '賃料', /([\d,.]+)万円/) ||
                   getNum(raw, '賃料', /([\d,.]+)万円/);
        var mgmt = getNum(raw, '管理費', /([\d,]+)円/) || 0;
        var deposit = getNum(raw, '敷金', /([\d,.]+)万円/);
        var keyMoney = getNum(raw, '礼金', /([\d,.]+)万円/);
        return { type: t, name, address, transport, imageUrls: [...imgUrls].slice(0,10),
          area, layout, floor, age, year, rent, managementFee: mgmt, deposit, keyMoney,
          contactName: shopName, contactPhone: shopPhone, sourceUrl: currentUrl };
      }

      var price = null;
      if (t === 'new_build') {
        price = getNum(raw, '予定価格帯', /([\d,.]+)万円/) || getNum(raw, '販売価格', /([\d,.]+)万円/);
      } else {
        price = getNum(raw, '価格', /([\d,.]+)万円/) || getNum(raw, '販売価格', /([\d,.]+)万円/);
      }

      return { type: t, name, address, transport, imageUrls: [...imgUrls].slice(0,10),
        area, layout, floor, age, year, price,
        contactName: shopName, contactPhone: shopPhone, sourceUrl: currentUrl };
    }, test.type, test.url);

    console.log(`\n=== ${test.name} ===`);
    console.log('name:', data.name.substring(0, 40));
    console.log('address:', data.address.substring(0, 50));
    console.log('transport:', data.transport.substring(0, 50));
    console.log('images:', data.imageUrls.length, 'URLs');
    console.log('area:', data.area, 'm² | layout:', data.layout, '| floor:', data.floor);
    console.log('age:', data.age, 'years | year:', data.year);
    if (test.type === 'rental') {
      console.log('rent:', data.rent, '万円 | mgmt:', data.managementFee, '円 | deposit:', data.deposit, '| key:', data.keyMoney);
    } else {
      console.log('price:', data.price, '万円');
    }
    console.log('contact:', data.contactName, data.contactPhone);
    console.log('url:', data.sourceUrl);

    await page.close();
  }

  await browser.close();
  console.log('\n✅ All 3 types validated!');
}

main().catch(e => console.error('Error:', e.message));