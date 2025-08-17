// server.js
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { BASE_URL, MODEL, VOICE, INSTRUCTIONS, SPEED, TOOL_CHOICE, INPUT_AUDIO_TRANSCRIPTION} from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const app = express();

// --- API: mint ephemeral Realtime session token (server-side standard API key) ---
app.get('/session', async (_req, res) => {
  try {
    const r = await fetch(`${BASE_URL}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        instructions: INSTRUCTIONS,
        speed: SPEED,
        tool_choice: TOOL_CHOICE,
        input_audio_transcription: INPUT_AUDIO_TRANSCRIPTION,
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      res.set('Cache-Control', 'no-store');
      return res.status(r.status).send({ error: text });
    }

    const data = await r.json();
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (err) {
    res.set('Cache-Control', 'no-store');
    res.status(500).send({ error: String(err) });
  }
});

const isProd = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 5173;

if (!isProd) {
  // --- DEV: Vite middleware, read the SAME root index.html and let Vite transform it ---
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom', // don't serve index.html by default
  });

  app.use(vite.middlewares);

  app.use('*', async (req, res, next) => {
    try {
      const url = req.originalUrl;
      if (url.startsWith('/session')) return next();

      // Single source of truth: project-root index.html
      const rawHtml = await fs.readFile(path.resolve(__dirname, 'client', 'index.html'), 'utf-8');
      const html = await vite.transformIndexHtml(url, rawHtml);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
} else {
  // --- PROD: serve build output; dist/index.html is generated from the SAME root index.html ---
  const distPath = path.resolve(__dirname, 'dist');
  const indexPath = path.resolve(distPath, 'index.html');

  app.use(express.static(distPath, { index: false }));
  app.get('*', (_req, res) => res.sendFile(indexPath));
}

app.listen(port, () => {
  console.log(`${isProd ? 'Prod' : 'Dev'} server running on http://localhost:${port}`);
});
