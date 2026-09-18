import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png' };
export async function startPreview(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/') { res.writeHead(302, { Location: '/popup/popup.html' }); res.end(); return; }
      const route = decodeURIComponent(url.pathname);
      if (!(route === '/manifest.json' || route === '/tests/browser/bridge.js' ||
        /^\/(popup|dist)\//.test(route) || /^\/tests\/e2e\/fixtures\/[a-z-]+\.html$/.test(route))) {
        throw new Error('Route not available in preview');
      }
      const path = resolve(root, `.${route}`);
      if (!path.startsWith(root)) throw new Error('Invalid path');
      let body = await readFile(path);
      if (extname(path) === '.html') {
        body = body.toString().replace('</head>', '<script type="module" src="/tests/browser/bridge.js"></script></head>');
        body = body.replace('<script src="popup.js" type="module"></script>', '<script type="module">await import("/tests/browser/bridge.js"); await import("/popup/popup.js");</script>');
      }
      res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startPreview(Number(process.env.PORT || 4173));
  console.log(`Standalone preview: ${url}\nEditor: ${url}/tests/e2e/fixtures/github-mock.html`);
}
