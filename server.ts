import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const runFile = promisify(execFile);
const production = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  const port = Number(process.env.PORT || 3000);
  app.get('/api/voice/status', (_req: Request, res: Response) => {
    res.json({ engine: 'Vocalis', mode: 'Local non-neural synthesis; experimental sound-bank builder', status: 'active', audioUploads: false });
  });

  // Source export is development-only. No token collection, shell interpolation,
  // repository mutation, arbitrary file reading, or public production source API.
  app.use('/api/project', (_req, res, next) => {
    if (production) { res.status(404).json({ error: 'Source export is disabled in production.' }); return; }
    next();
  });
  for (const endpoint of ['download-zip', 'download-base64']) {
    app.get(`/api/project/${endpoint}`, async (_req, res) => {
      const directory = path.join(root, '.cache');
      const archive = path.join(directory, `vocalis-${randomUUID()}.zip`);
      try {
        await fs.mkdir(directory, { recursive: true });
        await runFile('python3', [path.join(root, 'scripts/export_zip.py'), '--output', archive], { cwd: root, timeout: 60000 });
        const data = await fs.readFile(archive);
        if (endpoint === 'download-base64') res.json({ filename: 'vocalis-project.zip', base64: data.toString('base64'), size: data.length });
        else res.type('application/zip').attachment('vocalis-project.zip').send(data);
      } catch {
        res.status(500).json({ error: 'Source export failed. Check that Python 3 is installed, or transfer the repository directly.' });
      } finally { await fs.rm(archive, { force: true }).catch(() => {}); }
    });
  }
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Unknown endpoint.' }); });

  const httpServer = createHttpServer(app);
  if (production) {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/{*route}', (req, res) => {
      if (path.extname(req.path)) { res.status(404).send('Asset not found'); return; }
      res.sendFile(path.join(root, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', allowedHosts: ['.e2b.app'], hmr: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
  httpServer.listen(port, '0.0.0.0', () => console.log(`Vocalis listening on http://0.0.0.0:${port} (${production ? 'production' : 'development'})`));
}
startServer().catch(error => { console.error('Server startup failed:', error); process.exit(1); });
