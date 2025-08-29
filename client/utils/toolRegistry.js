// client/utils/toolRegistry.js
// Defines the callable tools and a small runtime to execute them.

export const TOOL_SPEC = [
  {
    type: "function",
    name: "generate_horoscope",
    description: "Give today's horoscope for an astrological sign.",
    parameters: {
      type: "object",
      properties: {
        sign: {
          type: "string",
          description: "The sign for the horoscope.",
          enum: [
            "Aries","Taurus","Gemini","Cancer","Leo","Virgo",
            "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"
          ]
        }
      },
      required: ["sign"]
    }
  },
  {
    type: "function",
    name: "create_embeddings",
    description: "Create vector embeddings for one or more texts using the backend.",
    parameters: {
      type: "object",
      properties: {
        input: {
          description: "A single string or an array of strings to embed.",
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" }, minItems: 1 }
          ]
        },
        model: {
          type: "string",
          description: "Embedding model to use (default: text-embedding-3-small).",
          default: "text-embedding-3-small"
        },
        encoding_format: {
          type: "string",
          description: "Embedding format: 'float' or 'base64' (default: float).",
          enum: ["float", "base64"],
          default: "float"
        }
      },
      required: ["input"]
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

// --- Simple registry/dispatcher ---
const registry = {
  generate_horoscope,
  create_embeddings   // <--- NEW
};

export async function runToolByName(name, args) {
  const fn = registry[name];
  if (!fn) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return await fn(args);
}
