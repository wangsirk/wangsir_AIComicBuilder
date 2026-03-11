import type { AIProvider, VideoProvider } from "./types";

export type { AIProvider, VideoProvider, TextOptions, ImageOptions, VideoGenerateParams } from "./types";

let defaultAIProvider: AIProvider | null = null;
let defaultVideoProvider: VideoProvider | null = null;

export function setDefaultAIProvider(provider: AIProvider) {
  defaultAIProvider = provider;
}

export function setDefaultVideoProvider(provider: VideoProvider) {
  defaultVideoProvider = provider;
}

export function getAIProvider(): AIProvider {
  if (!defaultAIProvider) {
    throw new Error("No AI provider configured. Call setDefaultAIProvider() first.");
  }
  return defaultAIProvider;
}

export function getVideoProvider(): VideoProvider {
  if (!defaultVideoProvider) {
    throw new Error("No video provider configured. Call setDefaultVideoProvider() first.");
  }
  return defaultVideoProvider;
}
