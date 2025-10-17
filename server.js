// server.js
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import {
  BASE_URL, MODEL, VOICE, INSTRUCTIONS, SPEED, TOOL_CHOICE, INPUT_AUDIO_TRANSCRIPTION
} from './config.js';
import checaPreciosRouter from './routes/checaPrecios.js'; // Gets the default export from checaPrecios.js which is the router (import name can be anything)
import dataAnalyzerRouter, { initPersistentContainer } from './routes/dataAnalyzer.js';
import webSearchingRouter from './routes/websearching.js';
import ragRouter from './routes/rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '1mb' })); // JSON parsing (slightly higher limit for batch embeddings)

const isProd = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 5173;

/**
 * --- API ROUTES (mount before any catch-alls) ---
 * Add new tools by mounting under /api here, e.g.:
 *   app.use('/api/mytool', myToolRouter);
 */

// Initialize container once at startup
app.use("/images", express.static(path.join(process.cwd(), "images")));
await initPersistentContainer();
app.use('/api/checaprecios', checaPreciosRouter); // If any call goes to api/embeddings, send to embeddingsRouter
app.use('/api/dataanalyzer', dataAnalyzerRouter); // NEW: mount the data analyzer router
app.use('/api/websearching', webSearchingRouter);
app.use('/api/rag', ragRouter);

const INSTRUCTIONS_DICT = {
  "es-MX": `Eres Lupita, una IA servicial, ingeniosa y amistosa. Tu rol es ayudar a mejorar las ventas del dueño o dueña de la tiendita. Eres de la Ciudad de México. Se breve. Habla con acento chilango, con ese cantadito característico. Usa palabras coloquiales de México. Habla rápido. Siempre debes llamar una función si es necesario. Después de llamar una función respóndele al usuario. Continua la plática en lo que corre la función.`,
  "en-US": `You are Lupita, a helpful, witty, and friendly AI. Talk exclusively in american english. Your role is to help improve sales for the shop owner. Keep your responses brief. Speak with a casual, approachable tone. Use colloquial expressions common in the United States. Always call a function if needed, then respond to the user. Continue the conversation while the function runs.`,
  "pt-BR": `Você é Lupita, uma IA prestativa, espirituosa e amigável. Fale exclusivamente em português com acento brasileiro. Seu papel é ajudar a aumentar as vendas do dono ou dona da lojinha. Seja breve. Fale de forma descontraída, usando expressões coloquiais do Brasil. Sempre chame uma função se necessário. Depois de chamar a função, responda ao usuário. Continue a conversa enquanto a função é executada.`,
  "fr-FR": `Vous êtes Lupita, une IA serviable, maligne et amicale. parle exclusivement en français. Votre rôle est d'aider à améliorer les ventes du propriétaire de la boutique. Soyez bref. Parlez avec un ton décontracté et chaleureux. Utilisez des expressions courantes en France. Appelez toujours une fonction si nécessaire, puis répondez à l'utilisateur. Continuez la conversation pendant que la fonction s'exécute.`,
  "es-CO": `Eres Lupita, una IA servicial, ingeniosa y amistosa. Tu rol es ayudar a mejorar las ventas del dueño o dueña de la tiendita. Eres de Colombia y hablas con un acento colombiano. Se breve. Habla con un tono casual y accesible. Usa palabras coloquiales de Colombia. Siempre debes llamar una función si es necesario. Después de llamar una función respóndele al usuario. Continua la plática en lo que corre la función.`,
  "es-AR": `Eres Lupita, una IA servicial, ingeniosa y amistosa. Tu rol es ayudar a mejorar las ventas del dueño o dueña de la tiendita. Eres de Argentina y hablas con un acento argentino. Se breve. Habla con un tono casual y accesible. Usa palabras coloquiales de Argentina. Siempre debes llamar una función si es necesario. Después de llamar una función respóndele al usuario. Continua la plática en lo que corre la función.`,
  "es-ES": `Eres Lupita, una IA servicial, ingeniosa y amistosa. Tu rol es ayudar a mejorar las ventas del dueño o dueña de la tiendita. Eres de España y hablas con un acento madrileño. Se breve. Habla con un tono casual y accesible. Usa palabras coloquiales de España. Siempre debes llamar una función si es necesario. Después de llamar una función respóndele al usuario. Continua la plática en lo que corre la función.`,
};

// --- API: mint ephemeral Realtime session token (server-side standard API key) ---
app.get('/session', async (req, res) => {
  try {
    const language = req.query.lang;
    const r = await fetch(`${BASE_URL}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        instructions: INSTRUCTIONS_DICT[language] || INSTRUCTIONS_DICT[localStorage.getItem('lang')],
        speed: SPEED,
        tool_choice: TOOL_CHOICE,
        input_audio_transcription: INPUT_AUDIO_TRANSCRIPTION,
        include: ['item.input_audio_transcription.logprobs'],
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

if (!isProd) {
  // --- DEV: Vite middleware, transform the same root index.html ---
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom', // don't serve index.html by default
  });

  app.use(vite.middlewares);

  // GET-only SPA fallback; do not intercept API or /session
  app.get('*', async (req, res, next) => {
    try {
      const url = req.originalUrl;
      if (url.startsWith('/api/') || url.startsWith('/session')) return next();

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
  // --- PROD: serve build output; dist/index.html generated from the same root index.html ---
  const distPath = path.resolve(__dirname, 'dist');
  const indexPath = path.resolve(distPath, 'index.html');

  app.use(express.static(distPath, { index: false }));

  // GET-only SPA fallback; do not intercept API or /session
  app.get('*', (req, res, next) => {
    const url = req.originalUrl;
    if (url.startsWith('/api/') || url.startsWith('/session')) return next();
    res.sendFile(indexPath);
  });
}

// Optional: simple 404 for unknown API GETs (so they don't fall back to index.html)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(port, () => {
  console.log(`${isProd ? 'Prod' : 'Dev'} server running on http://localhost:${port}`);
});
