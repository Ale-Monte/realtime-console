import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const router = express.Router();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Fake "RAG" knowledge base
 * Replace this with real paper summaries later
 */
const KNOWLEDGE_BASE = [
  {
    id: 1,
    text: `
Nano-store performance is highly dependent on inventory turnover and product assortment optimization.
High-frequency SKUs drive most revenue, often following a Pareto distribution.
Stockouts significantly reduce customer retention.
    `,
  },
  {
    id: 2,
    text: `
In small retail formats, pricing elasticity is lower due to convenience bias.
Customers prioritize proximity and availability over price.
    `,
  },
  {
    id: 3,
    text: `
Operational efficiency in nano-stores improves with digital inventory tracking and supplier coordination.
Manual tracking leads to shrinkage and restocking inefficiencies.
    `,
  },
];

/**
 * Simple keyword-based retrieval (cheap + effective baseline)
 */
function retrieveRelevantDocs(query) {
  const q = query.toLowerCase();

  return KNOWLEDGE_BASE
    .map(doc => {
      const score = doc.text.toLowerCase().includes(q) ? 2 : 0;

      // naive keyword scoring
      const keywordHits = ["inventory", "pricing", "stock", "efficiency"]
        .filter(k => q.includes(k) && doc.text.toLowerCase().includes(k))
        .length;

      return { ...doc, score: score + keywordHits };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2); // top-k
}

/**
 * Gemini call with injected context
 */
async function generateAnswer(query, contextDocs) {
  const context = contextDocs.map(d => d.text).join("\n\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
You are an expert in nano-store retail performance.

Use the provided context to answer the question.
If the answer is not in the context, say so clearly.

Context:
${context}

Question:
${query}
`,
  });

  return response.text;
}

router.post("/", async (req, res) => {
  try {
    const { message, user } = req.body ?? {};

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // Step 1: retrieve relevant "papers"
    const docs = retrieveRelevantDocs(message);

    // Step 2: generate answer with context
    const output = await generateAnswer(message, docs);

    return res.json({
      success: true,
      data: output || null,
    });

  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

export default router;