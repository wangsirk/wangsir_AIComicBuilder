import { setDefaultAIProvider, setDefaultVideoProvider } from "./index";
import { OpenAIProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";
import { SeedanceProvider } from "./providers/seedance";

let initialized = false;

export function initializeProviders() {
  if (initialized) return;

  if (process.env.OPENAI_API_KEY) {
    setDefaultAIProvider(new OpenAIProvider());
  } else if (process.env.GEMINI_API_KEY) {
    setDefaultAIProvider(new GeminiProvider());
  } else {
    console.warn("[AI] No AI provider API key configured. Set OPENAI_API_KEY or GEMINI_API_KEY.");
  }

  if (process.env.SEEDANCE_API_KEY) {
    setDefaultVideoProvider(new SeedanceProvider());
  } else {
    console.warn("[AI] No Seedance API key configured. Video generation will not work.");
  }

  initialized = true;
}
