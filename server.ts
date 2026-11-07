import express, { Request, Response } from 'express';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { VOICE_CATALOGUE, findVoiceCandidate } from './src/data/voiceCatalogue';
import {
  installedVoiceDir as resolveInstalledVoiceDir,
  isProtectedVoiceId,
  progressFilePath,
  progressLogPath,
} from './src/utils/voiceLibraryPaths';
import { pythonInstallHint, resolvePythonExecutable } from './src/utils/pythonRuntime';

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

  // -------------------------------------------------------------------------
  // Voice library: optional, independently installed recorded voices
  // -------------------------------------------------------------------------
  //
  // Every installed voice is a directory of its own under public/optional-voices.
  // The two protected base voices live elsewhere entirely (public/voicepacks/
  // cmu-arctic) and are refused by name at every entry point here, so no request
  // can modify, replace or delete them.

  // Anchored to this file, not to process.cwd(): starting the server from another
  // directory must not install voices into a tree the browser never sees.
  const ROOT = __dirname;
  const VOICE_ROOT = path.join(ROOT, 'public', 'optional-voices');
  const PROGRESS_ROOT = path.join(ROOT, 'var', 'voice-progress');
  /** Resolve an installed voice's directory, or null if the id is not allowed. */
  const installedVoiceDir = (id: string): string | null => resolveInstalledVoiceDir(VOICE_ROOT, id);

  const readInstalled = () => {
    if (!fs.existsSync(VOICE_ROOT)) return [];
    return fs
      .readdirSync(VOICE_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => {
        const dir = path.join(VOICE_ROOT, entry.name);
        const infoPath = path.join(dir, 'installed.json');
        if (!fs.existsSync(infoPath) || !fs.existsSync(path.join(dir, 'manifest.json'))) return null;
        try {
          const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
          return {
            id: entry.name,
            units: info.units ?? null,
            bytes: info.bytes ?? null,
            installedAt: info.installedAt ?? null,
            sourceUrl: info.sourceUrl ?? null,
          };
        } catch {
          return null;
        }
      })
      .filter((voice): voice is NonNullable<typeof voice> => voice !== null);
  };

  app.get('/api/voices', (_req: Request, res: Response) => {
    const installed = readInstalled();
    res.json({
      catalogueVersion: '2026-11-07',
      catalogueSize: VOICE_CATALOGUE.length,
      installed,
      storageBytes: installed.reduce((total, voice) => total + (voice.bytes ?? 0), 0),
      engineCanSpeak: ['English'],
    });
  });

  app.get('/api/voices/:id/progress', (req: Request, res: Response) => {
    const file = progressFilePath(PROGRESS_ROOT, req.params.id);
    if (!file) return res.status(400).json({ error: 'Invalid voice id' });
    if (!fs.existsSync(file)) return res.json({ stage: 'idle' });
    try {
      const progress = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
        stage?: string;
        message?: string;
      };
      if (progress.stage !== 'failed') return res.json(progress);
      const logFile = path.join(PROGRESS_ROOT, `${req.params.id}.log`);
      let log = '';
      try {
        log = fs.readFileSync(logFile, 'utf-8').trim().split('\n').slice(-6).join('\n');
      } catch {
        log = '';
      }
      return res.json({ ...progress, log });
    } catch {
      return res.json({ stage: 'idle' });
    }
  });

  app.get('/api/voices/:id/log', (req: Request, res: Response) => {
    const file = progressLogPath(PROGRESS_ROOT, req.params.id);
    if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'No log for that voice.' });
    res.type('text/plain').send(fs.readFileSync(file, 'utf-8').slice(-20000));
  });

  app.post('/api/voices/:id/install', (req: Request, res: Response) => {
    const id = req.params.id;
    const python = resolvePythonExecutable();
    if (!python) return res.status(503).json({ error: pythonInstallHint() });
    const candidate = findVoiceCandidate(id);
    if (!candidate) return res.status(404).json({ error: `Unknown voice "${id}"` });
    if (!candidate.install) {
      return res.status(400).json({
        error: `${candidate.displayName} has no installer yet: ${candidate.compatibilityNote}`,
      });
    }
    const dir = installedVoiceDir(id);
    if (!dir) return res.status(400).json({ error: 'That voice id is protected or invalid' });
    if (fs.existsSync(path.join(dir, 'manifest.json'))) {
      return res.status(409).json({ error: 'That voice is already installed. Remove it first to reinstall.' });
    }
    if (!fs.existsSync(PROGRESS_ROOT)) fs.mkdirSync(PROGRESS_ROOT, { recursive: true });
    const progressFile = path.join(PROGRESS_ROOT, `${id}.json`);
    fs.writeFileSync(
      progressFile,
      JSON.stringify({ stage: 'starting', message: 'Starting the installer…', percent: 0 }),
    );

    const recipe = candidate.install;
    const args = [
      'scripts/install_voice.py',
      '--id', id,
      '--kind', recipe.kind,
      '--url', recipe.kind === 'arctic-tree' ? recipe.treeUrl : recipe.url,
      '--out-root', VOICE_ROOT,
      '--progress', progressFile,
      '--display-name', candidate.displayName,
      '--accent', candidate.accent,
      '--gender', candidate.gender,
      '--language', candidate.language,
      '--source', candidate.sourceProject,
      '--source-url', candidate.sourceUrl,
      '--attribution', candidate.licence.attribution,
      '--licence', candidate.licence.name,
    ];
    if (recipe.kind === 'arctic-archive') args.push('--speaker', recipe.speaker);
    else if (recipe.kind === 'arctic-tree') args.push('--speaker', recipe.speaker, '--tree-url', recipe.treeUrl);
    else args.push('--dic', recipe.dicPath, '--wav', recipe.wavPath);

    const logFile = path.join(PROGRESS_ROOT, `${id}.log`);
    let logHandle: number | null = null;
    try {
      logHandle = fs.openSync(logFile, 'w');
    } catch {
      logHandle = null;
    }
    const child = spawn(python, args, {
      cwd: ROOT,
      detached: true,
      stdio: logHandle === null ? 'ignore' : ['ignore', logHandle, logHandle],
      windowsHide: true,
    });
    if (logHandle !== null) fs.closeSync(logHandle);

    // If python dies without writing a stage of its own, say so with its last
    // words instead of leaving the browser polling "starting" forever.
    child.on('exit', (code) => {
      const current = (() => {
        try {
          return JSON.parse(fs.readFileSync(progressFile, 'utf-8')) as { stage?: string };
        } catch {
          return {};
        }
      })();
      if (current.stage === 'done' || current.stage === 'failed') return;
      const tail = (() => {
        try {
          return fs
            .readFileSync(logFile, 'utf-8')
            .trim()
            .split('\n')
            .slice(-4)
            .join(' ')
            .slice(0, 400);
        } catch {
          return '';
        }
      })();
      fs.writeFileSync(
        progressFile,
        JSON.stringify({
          at: new Date().toISOString(),
          stage: 'failed',
          message: `The installer exited (code ${code ?? 'unknown'}) without finishing.${tail ? ` ${tail}` : ''}`,
          percent: 0,
        }),
      );
    });
    child.unref();
    res.json({ started: true, id, progressUrl: `/api/voices/${id}/progress`, logUrl: `/api/voices/${id}/log` });
  });

  app.delete('/api/voices/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    if (isProtectedVoiceId(id)) {
      return res.status(403).json({ error: 'SLT and BDL are the protected base voices and cannot be removed.' });
    }
    const dir = installedVoiceDir(id);
    if (!dir) return res.status(400).json({ error: 'That voice id is protected or invalid' });
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'That voice is not installed' });
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      const progressFile = progressFilePath(PROGRESS_ROOT, id);
      if (progressFile && fs.existsSync(progressFile)) fs.rmSync(progressFile, { force: true });
      res.json({ removed: id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Installed packs are plain files on disk, so they are served like any other
  // static asset — no service, no network, nothing to fall over.
  app.use(
    '/optional-voices',
    express.static(VOICE_ROOT, {
      setHeaders: (response) => response.setHeader('Cache-Control', 'no-cache'),
    }),
  );

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
