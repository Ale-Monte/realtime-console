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

// --- Simple registry/dispatcher ---
const registry = {
  generate_horoscope,
};

export async function runToolByName(name, args) {
  const fn = registry[name];
  if (!fn) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return await fn(args);
}
