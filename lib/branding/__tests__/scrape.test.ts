import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { scrapeWebsite } from '../scrape';

let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html><head>
          <link rel="icon" href="/favicon.png">
          <meta property="og:image" content="https://cdn.example.com/logo.png">
        </head><body>
          <h1>ACME Restoration</h1>
          <p>We restore water-damaged buildings across NSW.</p>
        </body></html>
      `);
    } else if (req.url === '/favicon.png') {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  port = (server.address() as any).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('scrapeWebsite', () => {
  it('extracts logo + hero text', async () => {
    const result = await scrapeWebsite(`http://localhost:${port}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(result.data.hero).toContain('ACME Restoration');
  });

  it('returns ok:false on a 404', async () => {
    const result = await scrapeWebsite(`http://localhost:${port}/missing`);
    expect(result.ok).toBe(false);
  });
});
