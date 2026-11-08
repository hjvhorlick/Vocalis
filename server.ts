import express, { Request, Response } from 'express';
import { createServer as createHttpServer } from 'node:http';
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

  // 1-Click ZIP Project Download Endpoint with explicit Content-Length
  app.get('/api/project/download-zip', (_req: Request, res: Response) => {
    exec('python3 scripts/export_zip.py', (err) => {
      const zipFile = path.join(process.cwd(), 'vocalis-project.zip');
      if (err || !fs.existsSync(zipFile)) {
        return res.status(500).json({ error: 'Failed to generate project zip' });
      }
      const zipBuffer = fs.readFileSync(zipFile);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', zipBuffer.length.toString());
      res.setHeader('Content-Disposition', 'attachment; filename="vocalis-project.zip"');
      res.end(zipBuffer);
    });
  });

  // 100% Reliable In-Memory Base64 ZIP Export for iFrames
  app.get('/api/project/download-base64', (_req: Request, res: Response) => {
    exec('python3 scripts/export_zip.py', (err) => {
      const zipFile = path.join(process.cwd(), 'vocalis-project.zip');
      if (err || !fs.existsSync(zipFile)) {
        return res.status(500).json({ error: 'Failed to generate project zip' });
      }
      const zipBuffer = fs.readFileSync(zipFile);
      res.json({
        success: true,
        filename: 'vocalis-project.zip',
        size: zipBuffer.length,
        base64: zipBuffer.toString('base64'),
      });
    });
  });

  // Return all project files for in-browser file browser & copy
  app.get('/api/project/files', (_req: Request, res: Response) => {
    try {
      const fileList: { path: string; size: number; content: string }[] = [];
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(process.cwd(), fullPath);
          if (
            relPath.startsWith('node_modules') ||
            relPath.startsWith('dist') ||
            relPath.startsWith('.git') ||
            relPath.endsWith('.zip') ||
            relPath.startsWith('scripts')
          ) {
            continue;
          }
          if (entry.isDirectory()) {
            walk(fullPath);
          } else {
            const stat = fs.statSync(fullPath);
            const content = fs.readFileSync(fullPath, 'utf-8');
            fileList.push({ path: relPath, size: stat.size, content });
          }
        }
      };
      walk(process.cwd());
      res.json({ files: fileList });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post('/api/project/push-github', (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'GitHub Personal Access Token is required' });
    }

    const cleanToken = token.trim();
    const repoUrl = 'https://github.com/hjvhorlick/Vocalis.git';
    const branch = (typeof req.body.branch === 'string' && req.body.branch.trim()) || 'main';
    if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
      return res.status(400).json({ error: 'Invalid branch name' });
    }

    // The token is passed through the environment rather than being interpolated
    // into a shell string, and the remote is added explicitly so no --force push
    // to a hard-coded branch can happen behind the user's back.
    const askPass = path.join(process.cwd(), 'scripts', 'git-askpass.sh');
    const env = {
      ...process.env,
      GIT_ASKPASS: askPass,
      GIT_TERMINAL_PROMPT: '0',
      VOCALIS_GIT_TOKEN: cleanToken,
    } as NodeJS.ProcessEnv;

    const run = (command: string) =>
      new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        exec(
          command,
          { env, maxBuffer: 10 * 1024 * 1024, timeout: 120000 },
          (err, stdout, stderr) => resolve({ code: err ? (err as any).code ?? 1 : 0, stdout, stderr })
        );
      });

    (async () => {
      const results = [];
      results.push(await run('git add -A'));
      // Snapshot the working tree only if it has anything to commit.
      const status = await run('git status --porcelain');
      if (status.stdout.trim()) {
        results.push(await run('git -c user.name="Vocalis" -c user.email="vocalis@local" commit -m "chore: sync Vocalis studio snapshot"'));
      }
      // Push the current branch explicitly. No force, no hard-coded branch.
      results.push(
        await run(
          `git push "${repoUrl}" "HEAD:refs/heads/${branch}" 2>&1`
        )
      );

      const failed = results.find((r) => r.code !== 0);
      if (failed) {
        const errorMsg = `${failed.stdout}\n${failed.stderr}`.trim();
        const isAuthFail =
          errorMsg.includes('403') ||
          /Authentication/i.test(errorMsg) ||
          errorMsg.includes('Invalid username or password') ||
          errorMsg.includes('could not read Username');
        return res.status(400).json({
          error: isAuthFail
            ? 'GitHub rejected the token. Make sure it is valid and has "repo" scope.'
            : errorMsg,
        });
      }

      res.json({
        success: true,
        branch,
        message: `Pushed to ${repoUrl} (branch: ${branch})`,
      });
    })().catch((err: any) => {
      res.status(500).json({ error: err?.message || 'Push failed' });
    });
  });
    });
  });

  // Use one HTTP server for Express and Vite. In middleware mode, Vite otherwise
  // opens a separate HMR-only port, which can be mistaken for the app preview.
  const httpServer = createHttpServer(app);

  // Mount Vite in development or static in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        allowedHosts: ['.e2b.app'],
        port: 3000,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Vocalis Voice Studio Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
