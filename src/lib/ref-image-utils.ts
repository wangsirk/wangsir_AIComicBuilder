import { id as genId } from "@/lib/id";

export interface RefImage {
  id: string;
  prompt: string;
  imagePath?: string;
  status: "pending" | "generated";
}

/**
 * Parse referenceImages JSON from DB, handling both legacy string[] and new RefImage[] formats.
 */
export function parseRefImages(json: string | null | undefined): RefImage[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: unknown) => {
      if (typeof item === "string") {
        // Legacy format: plain image path or "prompt:xxx"
        if (item.startsWith("prompt:")) {
          return {
            id: genId(),
            prompt: item.replace(/^prompt:/, ""),
            status: "pending" as const,
          };
        }
        return {
          id: genId(),
          prompt: "",
          imagePath: item,
          status: "generated" as const,
        };
      }
      // New format: RefImage object
      const obj = item as Record<string, unknown>;
      return {
        id: (obj.id as string) || genId(),
        prompt: (obj.prompt as string) || "",
        imagePath: obj.imagePath as string | undefined,
        status: (obj.status as "pending" | "generated") || (obj.imagePath ? "generated" : "pending"),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Serialize RefImage[] back to JSON for DB storage.
 */
export function serializeRefImages(images: RefImage[]): string {
  return JSON.stringify(images);
}
