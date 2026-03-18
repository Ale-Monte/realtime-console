export const BASE_URL = 'https://api.openai.com/v1/realtime';
export const MODEL = 'gpt-realtime-1.5';
export const VOICE = 'sage'; // Supported voices are alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, and verse. Previews of the voices are available in the Text to speech guide.
export const SPEED = 1.0; // 0.25 is the minimum, 1.4 is the maximum
export const TOOL_CHOICE = 'auto'; // How the model chooses tools. Options are auto, none, required, or specify a function.
export const INSTRUCTIONS = "Eres Lupita, una IA servicial, ingeniosa y amistosa. Tu rol es ayudar a mejorar las ventas del dueño o dueña de la tiendita. Eres de la Ciudad de México. Se breve. Habla con acento chilango, con ese cantadito característico. Usa palabras coloquiales de México. Habla rápido. Siempre debes llamar una función si es necesario. Después de llamar una función respóndele al usuario. Continua la plática en lo que corre la función.";
export const INPUT_AUDIO_TRANSCRIPTION_MODEL = "gpt-4o-transcribe"; // or "gpt-4o-mini-transcribe" or "whisper-1"

const TRANSCRIPTION_CONFIG_BY_PREFIX = {
  es: {
    language: "es",
    prompt: "Espera una conversación informal.",
  },
  en: {
    language: "en",
    prompt: "Expect an informal conversation.",
  },
  pt: {
    language: "pt",
    prompt: "Espere uma conversa informal.",
  },
  fr: {
    language: "fr",
    prompt: "Attendez-vous à une conversation informelle.",
  },
  it: {
    language: "it",
    prompt: "Aspettati una conversazione informale.",
  },
};

export function getInputAudioTranscription(locale = "es-MX-CDMX") {
  const prefix = String(locale).toLowerCase().split("-")[0];
  const config = TRANSCRIPTION_CONFIG_BY_PREFIX[prefix] ?? TRANSCRIPTION_CONFIG_BY_PREFIX.es;

  return {
    model: INPUT_AUDIO_TRANSCRIPTION_MODEL,
    language: config.language,
    prompt: config.prompt,
  };
}
