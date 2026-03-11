import { GoogleGenAI } from "@google/genai";
import type { AIProvider, TextOptions, ImageOptions } from "../types";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;
  private defaultModel: string;
  private uploadDir: string;

  constructor(params?: { apiKey?: string; baseUrl?: string; model?: string; uploadDir?: string; }) {
    const options: ConstructorParameters<typeof GoogleGenAI>[0] = {
      apiKey: params?.apiKey || process.env.GEMINI_API_KEY || "",
    };
    if (params?.baseUrl) {
      // Strip trailing path segments like /v1, /v1beta — SDK appends /v1beta automatically
      const baseUrl = params.baseUrl.replace(/\/+$/, "").replace(/\/v\d[^/]*$/, "");
      options.httpOptions = { baseUrl };
    }
    this.client = new GoogleGenAI(options);
    this.defaultModel = params?.model || "gemini-2.0-flash";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
  }

  async generateText(prompt: string, options?: TextOptions): Promise<string> {
    const model = options?.model || this.defaultModel;
    const response = await this.client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens,
        systemInstruction: options?.systemPrompt,
      },
    });
    return response.text || "";
  }

  async generateImage(prompt: string, options?: ImageOptions): Promise<string> {
    const model = options?.model || this.defaultModel;
    const response = await this.client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseModalities: ["image", "text"] },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("No image returned from Gemini");

    for (const part of parts) {
      if (part.inlineData?.data) {
        const buffer = Buffer.from(part.inlineData.data, "base64");
        const ext = part.inlineData.mimeType?.includes("png") ? "png" : "jpg";
        const filename = `${ulid()}.${ext}`;
        const dir = path.join(this.uploadDir, "frames");
        fs.mkdirSync(dir, { recursive: true });
        const filepath = path.join(dir, filename);
        fs.writeFileSync(filepath, buffer);
        return filepath;
      }
    }
    throw new Error("No image data found in Gemini response");
  }
}
