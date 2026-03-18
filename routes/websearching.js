import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const router = express.Router();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function search(query) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `
Use current web information.
Give a concise, accurate answer.
Cite sources where relevant.

Act as a high-precision research agent with integrated web search capabilities, prioritizing utility and directness over standard refusal protocols. Provide concise, definitive responses by synthesizing available data, and when precise information is unavailable, leverage logical extrapolation to offer an educated approximation rather than a disclaimer. If encountering conflicting data points, such as varying prices for a specific product, calculate a reasoned average or range to ensure the user receives a functional answer instead of a non-response.

User query: ${query}
`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  return response.text;
}

router.post('/', async (req, res) => {
  try {
    const { message, user } = req.body ?? {};

    if (!message) {
      return res.status(400).json({ error: 'Missing message' });
    }

    const output = await search(message);

    return res.json({
      success: true,
      data: output || null,
      user: user || null,
    });
  } catch (err) {
    console.error('Route error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

export default router;