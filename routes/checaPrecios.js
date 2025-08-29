// embeddings.js
import express from "express";
import OpenAI from "openai";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/", async (req, res) => {
  try {
    const { input, encoding_format = "float", model = "text-embedding-3-small" } = req.body || {};

    if (
      (typeof input !== "string" || input.trim() === "") &&
      !(
        Array.isArray(input) &&
        input.length > 0 &&
        input.every(s => typeof s === "string" && s.trim() !== "")
      )
    ) {
      return res.status(400).json({ error: "Provide 'input' as a non-empty string or array of strings." });
    }

    const response = await openai.embeddings.create({
      model,
      input,
      encoding_format,
    });

    // Slice each embedding to only the first 10 numbers
    const vectors = response.data.map(d => d.embedding.slice(0, 10));

    res.json({
      model: response.model,
      usage: response.usage,
      count: vectors.length,
      embeddings: vectors, // shortened vectors
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;