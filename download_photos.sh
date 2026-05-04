#!/bin/bash
# 下载房源照片

DATA="data_puppeteer.json"
DIR="photos"
mkdir -p "$DIR"

# 收集URL
echo "收集URL..."
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$DATA', 'utf-8'));
const all = [...(data.rentals||[]), ...(data.used||[]), ...(data.newBuilds||[])];
let urls = [];
all.forEach((d, i) => {
  if (d.imageUrls) {
    let name = (d.name || 'item_'+i).replace(/[\/\\:*?\"<>|]/g, '_');
    d.imageUrls.forEach((url, j) => {
      let ext = url.split('.').pop().split('?')[0] || 'jpg';
      if(ext.length > 4) ext = 'jpg';
      urls.push(url + '|' + name + '_' + j + '.' + ext);
    });
  }
});
console.log(urls.length);
fs.writeFileSync('$DIR/urls.txt', urls.join('\n'));
"

# 下载函数
download_batch() {
  local concurrency=20
  local urls_file="$DIR/urls.txt"
  
  if [ ! -f "$urls_file" ]; then
    echo "没有URL文件"
    return
  fi
  
  local total=$(wc -l < "$urls_file")
  echo "总图片: $total"
  
  # 逐行读取并下载
  local done=0
  while IFS='|' read -r url filename; do
    [ -z "$url" ] && continue
    
    # 清理文件名
    filename=$(echo "$filename" | cut -c1-100)
    filepath="$DIR/$filename"
    
    if [ ! -f "$filepath" ] || [ ! -s "$filepath" ]; then
      curl -s -m 15 -o "$filepath" "$url" 2>/dev/null
    fi
    
    done=$((done + 1))
    if [ $((done % 100)) -eq 0 ]; then
      echo "进度: $done/$total"
    fi
  done < "$urls_file"
  
  echo "完成: $done"
}

cd ~/.openclaw/workspace/coder/nagoya_house
download_batch
ls -la photos/ | head -5
echo "---"
ls photos/ | wc -l