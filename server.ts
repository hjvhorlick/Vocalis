import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));

  // Status endpoint confirming 100% Vocalis local voice generator
  app.get('/api/voice/status', (_req: Request, res: Response) => {
    res.json({
      engine: 'Vocalis Speech Synthesizer & Voice Generator',
      mode: '100% Local Voice Synthesis & Waveform Generator',
      externalTTSFiles: false,
      status: 'active',
    });
  });

  // 1-Click ZIP Project Download Endpoint
  app.get('/api/project/download-zip', (_req: Request, res: Response) => {
    exec('python3 scripts/export_zip.py', (err) => {
      const zipFile = path.join(process.cwd(), 'vocalis-project.zip');
      if (err || !fs.existsSync(zipFile)) {
        return res.status(500).json({ error: 'Failed to generate project zip' });
      }
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="vocalis-project.zip"');
      const stream = fs.createReadStream(zipFile);
      stream.pipe(res);
    });
  });

  // Direct In-App GitHub Push Endpoint
  app.post('/api/project/push-github', (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'GitHub Personal Access Token is required' });
    }
    const cleanToken = token.trim();
    const remoteUrl = `https://${encodeURIComponent(cleanToken)}@github.com/hjvhorlick/Vocalis.git`;
    
    // Ensure all changes are committed before pushing
    exec(`git config --global --add safe.directory /app/applet; git add .; git commit -m "feat: complete Vocalis voice studio" || true; git push "${remoteUrl}" main --force`, (err, _stdout, stderr) => {
      if (err) {
        const errorMsg = stderr || err.message;
        const isAuthFail = errorMsg.includes('403') || errorMsg.includes('Authentication') || errorMsg.includes('Invalid username or password');
        return res.status(400).json({
          error: isAuthFail
            ? 'GitHub rejected the token. Please make sure your token is valid and has "repo" permission checked.'
            : errorMsg,
        });
      }
      res.json({
        success: true,
        message: 'Successfully pushed all files to https://github.com/hjvhorlick/Vocalis',
      });
    });
  });

  // Mount Vite in development or static in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: 3000 },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Vocalis Voice Studio Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
