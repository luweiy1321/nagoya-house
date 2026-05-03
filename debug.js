const axios = require('axios');
const cheerio = require('cheerio');

async function main() {
  const r = await axios.get('https://suumo.jp/ms/chuko/aichi/sa_nagoya/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ja-JP,ja;q=0.9',
    },
    timeout: 15000
  });
  
  const $ = cheerio.load(r.data);
  
  // Find property_unit elements
  console.log('Total property_unit:', $('.property_unit').length);
  
  // First property_unit full HTML
  if ($('.property_unit').length > 0) {
    console.log('\n=== First property_unit HTML ===');
    console.log($('.property_unit').first().html()?.substring(0, 2000));
  }
  
  // Check dottable structure
  console.log('\n=== dottable--cassette ===');
  const dt = $('dl.dottable--cassette').first();
  console.log(dt.html()?.substring(0, 1000));
}

main().catch(console.error);
