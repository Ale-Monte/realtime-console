// routes/checaPrecios.js
import express from "express";
import fs from "node:fs";
import path from "node:path";
import csv from "csv-parser";
import OpenAI from "openai";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- load data at startup ----------
// Paths for the split JSON files
const embeddingsPath1 = path.resolve("embeddings_part1.json");
const embeddingsPath2 = path.resolve("embeddings_part2.json");

// Read both JSON files
const raw1 = fs.readFileSync(embeddingsPath1, "utf-8");
const raw2 = fs.readFileSync(embeddingsPath2, "utf-8");

// Parse them into objects
const data1 = JSON.parse(raw1);
const data2 = JSON.parse(raw2);

// Merge them (works if objects; if arrays, use concat)
const mergedData = Array.isArray(data1)
  ? [...data1, ...data2]
  : { ...data1, ...data2 };

// Save to a single JSON file
const embeddingsPath = path.resolve("embeddings_profeco.json");
fs.writeFileSync(embeddingsPath, JSON.stringify(mergedData, null, 2));

const csvPath = path.resolve("cleaned_profeco_data.csv");

let productEmbeddingsData = {};
let dfClean = [];

// read embeddings JSON
function loadEmbeddings() {
  const raw = fs.readFileSync(embeddingsPath, "utf-8");
  productEmbeddingsData = JSON.parse(raw);
}

// read CSV into memory
function loadCSV() {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => {
        dfClean = rows;
        resolve();
      })
      .on("error", reject);
  });
}

await loadCSV();
loadEmbeddings();

// ---------- helpers ----------
function normalizeQuery(q) {
  if (q == null) return "";
  if (typeof q === "string") return q.trim();

  // If frontend sends { item: "..." }
  if (typeof q === "object" && !Array.isArray(q)) {
    if (typeof q.item === "string") return q.item.trim();
    if (typeof q.name === "string") return q.name.trim();
    // avoid sending raw objects to embeddings; fallback to empty
    return "";
  }

  if (Array.isArray(q)) {
    // pick first usable string-like entry
    for (const el of q) {
      const s = normalizeQuery(el);
      if (s) return s;
    }
    return "";
  }

  return String(q).trim();
}

async function createEmbedding(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("createEmbedding: 'text' must be a non-empty string");
  }
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.trim(),
  });
  return res.data[0].embedding;
}

function cosineSimilarity(vec1, vec2) {
  const dot = vec1.reduce((sum, v, i) => sum + v * vec2[i], 0);
  const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
  const norm2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0));
  return dot / (norm1 * norm2);
}

function calculateEuclideanDistance(lat1, lon1, lat2, lon2) {
  return Math.sqrt((lat2 - lat1) ** 2 + (lon2 - lon1) ** 2);
}

// core logic
async function checa_precios(productQueryString) {
  // 1) embed query
  const queryEmbedding = await createEmbedding(productQueryString);

  // 2) find closest product by cosine similarity
  let bestMatch = null;
  let bestSim = -Infinity;

  for (const [product, embedding] of Object.entries(productEmbeddingsData)) {
    const sim = cosineSimilarity(queryEmbedding, embedding);
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = product;
    }
  }

  // 3) filter CSV rows for that product
  const filtered = dfClean.filter((r) => r["Nombre_completo"] === bestMatch);

  // 4) user location stub (CDMX south)
  const userLat = 19.2834;
  const userLon = -99.1353;

  // 5) compute distances and select top 3
  const stores = filtered
    .map((row) => {
      const lat = parseFloat(row["Latitud"]);
      const lon = parseFloat(row["Longitud"]);
      return {
        store: row["Tienda"],
        price: row["Precio"] ? parseFloat(row["Precio"]) : null,
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lon) ? lon : null,
        distance:
          Number.isFinite(lat) && Number.isFinite(lon)
            ? calculateEuclideanDistance(userLat, userLon, lat, lon)
            : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ store, price, latitude, longitude }) => ({
      store,
      price,
      latitude,
      longitude,
    }));

  return { item: bestMatch, stores };
}

// ---------- route ----------
router.post("/", async (req, res) => {
  try {
    // Accept either { query: "text" } or { query: { item: "text" } }
    let { query } = req.body ?? {};
    const normalized = normalizeQuery(query);

    if (!normalized) {
      return res
        .status(400)
        .json({ error: "Body must include a non-empty 'query' string (or an object with 'item')." });
    }

    const result = await checa_precios(normalized);
    return res.json(result);
  } catch (err) {
    console.error("checaprecios error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
