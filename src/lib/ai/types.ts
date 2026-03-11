export interface TextOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ImageOptions {
  model?: string;
  size?: string;
  quality?: string;
  referenceImages?: string[];
}

export interface AIProvider {
  generateText(prompt: string, options?: TextOptions): Promise<string>;
  generateImage(prompt: string, options?: ImageOptions): Promise<string>;
}

export interface VideoGenerateParams {
  firstFrame: string;
  lastFrame: string;
  prompt: string;
  duration: number;
  ratio?: string;
}

export interface VideoProvider {
  generateVideo(params: VideoGenerateParams): Promise<string>;
}
