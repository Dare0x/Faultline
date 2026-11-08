import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']],
  ['/app.mjs', ['app.mjs', 'text/javascript']],
  ['/model.mjs', ['model.mjs', 'text/javascript']],
  ['/mark.svg', ['mark.svg', 'image/svg+xml']],
  ['/data/snapshot.json', ['data/snapshot.json', 'application/json']],
]);
const port = Number(process.env.PORT || 4173);

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const asset = files.get(pathname);
  if (!asset) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const content = await readFile(new URL('../dist/' + asset[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' }).end(content);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Could not read preview asset');
  }
}).listen(port, '127.0.0.1', () => console.log('Faultline preview at http://127.0.0.1:' + port));
