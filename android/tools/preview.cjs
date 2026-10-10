// Development-only preview. Native input still needs verification on Android hardware.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const allowed = new Set(['index.html', 'game.js', 'menu-music.js', 'style.css', 'icon.svg', 'manifest.json', 'android/tv/input.js', 'android/tv/tv.js', 'android/tv/tv.css']);
allowed.add('assets/audio/arcade-menu.mp3');
http.createServer((req, res) => {
  let file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (file.startsWith('tv/')) file = 'android/' + file;
  if (!allowed.has(file)) { res.writeHead(404); res.end(); return; }
  let data = fs.readFileSync(path.join(root, file));
  if (file === 'index.html') data = data.toString().replace('</head>', '<link rel="stylesheet" href="tv/tv.css"></head>').replace('</body>', '<script src="tv/input.js"></script><script src="tv/tv.js"></script></body>');
  res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.mp3':'audio/mpeg'})[path.extname(file)]);
  res.setHeader('Cache-Control', 'no-store'); res.end(data);
}).listen(Number(process.env.PORT || 4179), '127.0.0.1', () => console.log('TV preview: http://127.0.0.1:' + (process.env.PORT || 4179)));
