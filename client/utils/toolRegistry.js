// client/utils/toolRegistry.js
// Defines the callable tools and a small runtime to execute them.

export const TOOL_SPEC = [
  {
    type: "function",
    name: "data_analyzer",
    description: "Use this tool when the user wants analysis of the store dataset, trends, summaries, comparisons, or charts based on the CSV data available in the app.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The user's data-analysis request about the store dataset. Ask for the exact metric, trend, comparison, or chart needed.",
        }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "web_searching",
    description: "Use this tool to search the web for recent information on a topic. Use it when the user asks the price of a product. Useful when you need to find current events, news, or updates that may not be in the model's training data.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The user's request describing what they want to search for on the web or information they want to find.",
        },
        user: {
          type: "string",
          description: "Este siempre debe ser 'Lupita Web Search'.",
        }
      },
      required: ["message", "user"]
    }
  },
  {
    type: "function",
    name: "rag",
      "description": "This function is triggered when the user asks questions related to business models, growth strategies, optimization, inventory management, or ways to improve and scale a local business. It leverages retrieval-augmented generation (RAG) to provide strategic recommendations and actionable suggestions.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          "description": "A user request asking for a business recommendation, suggestion, or strategy focused on growing, improving, or optimizing a local store or business operation."
        },
        user: {
          type: "string",
          "description": "Este siempre debe ser 'Lupita RAG'."
        }
      },
      required: ["message", "user"]
    }
  }
];

// --- Implementation(s) ---
// In a real app you might hit an external API here.
async function generate_horoscope({ sign }) {
  const generic = {
    Aries: "Take initiative on a stalled idea.",
    Taurus: "Lean into routines; they'll pay off.",
    Gemini: "A short chat unlocks a big insight.",
    Cancer: "Protect your focus; say no once.",
    Leo: "Spotlight moment—share your work.",
    Virgo: "Small refinements yield big polish.",
    Libra: "Balance obligations with a tiny indulgence.",
    Scorpio: "Follow the thread; research pays off.",
    Sagittarius: "Say yes to a micro-adventure.",
    Capricorn: "Structure first, speed later.",
    Aquarius: "You'll soon meet a new friend.",
    Pisces: "Quiet time sharpens intuition."
  };
  const text = generic[sign] ?? "A pleasant surprise is on the horizon.";
  // The model expects a JSON-serializable object as a string in function_call_output
  return { horoscope: text };
}

async function create_embeddings({ input, model = "text-embedding-3-small", encoding_format = "float" }) {
  const payload = {
    input: Array.isArray(input) ? input : String(input),
    model,
    encoding_format
  };

  const r = await fetch("/api/checaprecios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    // Try to surface server error JSON if present
    let message = `HTTP ${r.status}`;
    try {
      const { error } = await r.json();
      if (error) message = error;
    } catch (_) {}
    throw new Error(`create_embeddings failed: ${message}`);
  }

  // Expected shape from server: { model, usage, count, embeddings }
  const data = await r.json();
  return data; // Must be JSON-serializable
}

export async function checa_precios(query) {
  const res = await fetch("/api/checaprecios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error("Failed to fetch prices");
  return res.json();
}

export async function data_analyzer(query) {
  const payload =
    typeof query === "string"
      ? { query }
      : query && typeof query === "object"
        ? query
        : { query: String(query ?? "") };

  const res = await fetch("/api/dataanalyzer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Failed to fetch data analysis");
  return res.json();
}

export async function web_searching(query) {
  const { user, message } = query;
  const res = await fetch("/api/websearching", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, message }),
  });

  if (!res.ok) throw new Error("Failed to fetch web search results");
  return res.json();
}

export async function rag(query) {
  const { user, message } = query;
  const res = await fetch("/api/rag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, message }),
  });

  if (!res.ok) throw new Error("Failed to fetch web search results");
  return res.json();
}

// --- Simple registry/dispatcher ---
const registry = {
  generate_horoscope,
  create_embeddings,
  checa_precios,
  data_analyzer,
  web_searching,
  rag
};

export async function runToolByName(name, args) {
  const fn = registry[name];
  console.log("runToolByName", name, args);
  if (!fn) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return await fn(args);
}
