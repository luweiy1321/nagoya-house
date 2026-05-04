/**
 * 下载所有房源照片
 * 运行: node download_images.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const DATA_FILE = path.join(__dirname, 'data_puppeteer.json');
const PHOTOS_DIR = path.join(__dirname, 'photos');

async function downloadImg(urlStr, filepath) {
  return new Promise((resolve) => {
    if (!urlStr || !filepath) return resolve();
    const url = new URL(urlStr);
    const file = fs.createWriteStream(filepath);
    
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(filepath);
        return downloadImg(res.headers.location, filepath).then(resolve);
      }
      if (res.statusCode !== 200) {
        file.close();
        return resolve({ok: false, status: res.statusCode});
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve({ok: true}); });
    });
    
    req.on('error', (e) => { 
      try { fs.unlinkSync(filepath); } catch(e){}
      resolve({ok: false, error: e.message}); 
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ok: false, error: 'timeout'}); });
  });
}

async function main() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw);
  
  const all = [...(data.rentals||[]), ...(data.used||[]), ...(data.newBuilds||[])];
  console.log(`总房源: ${all.length}`);
  
  if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  
  const urls = [];
  all.forEach((item, idx) => {
    if (item.imageUrls && item.imageUrls.length) {
      const name = (item.name || `item_${idx}`).replace(/[/\:*?"<>|]/g, '_');
      item.imageUrls.forEach((url, i) => {
        const ext = path.extname(new URL(url).pathname) || '.jpg';
        urls.push({ url, name: `${name}_${i}${ext}` });
      });
    }
  });
  
  console.log(`总图片: ${urls.length}`);
  
  let done = 0, failed = 0;
  for (const { url, name } of urls) {
    const filepath = path.join(PHOTOS_DIR, name);
    const result = await downloadImg(url, filepath);
    if (result.ok) done++; else failed++;
    if ((done+failed) % 50 === 0) console.log(`进度: ${done+failed}/${urls.length}`);
  }
  
  console.log(`\n完成! 成功: ${done}, 失败: ${failed}`);
  console.log(`保存在: ${PHOTOS_DIR}`);
}

main().catch(console.error);