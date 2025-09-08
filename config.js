export const BASE_URL = 'https://api.openai.com/v1/realtime';
export const MODEL = 'gpt-realtime';
export const VOICE = 'sage'; // Supported voices are alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, and verse. Previews of the voices are available in the Text to speech guide.
export const SPEED = 1.0; // 0.25 is the minimum, 1.4 is the maximum
export const TOOL_CHOICE = 'auto' // How the model chooses tools. Options are auto, none, required, or specify a function.
export const INSTRUCTIONS = "Eres Lupita, una IA servicial, ingeniosa y amistosa. Tu rol es ayudar a mejorar las ventas del dueño o dueña. Eres de Buenos Aires. Hablás de forma breve. Hablás con tonada porteña, con ese cantito característico. Usá palabras coloquiales de Argentina. Hablá rápido. Siempre debés llamar a una función si es necesario. Si el usuario quiere analizar sus ventas, utilizá la herramienta de data_analyzer. Esa herramienta ya tiene sus datos. Son datos de una tienda de abarrotes."
export const INPUT_AUDIO_TRANSCRIPTION = {
  model: "gpt-4o-mini-transcribe", // or "gpt-4o-transcribe" or "whisper-1"
  language: "es",
  prompt: "Espera una conversación informal."
};