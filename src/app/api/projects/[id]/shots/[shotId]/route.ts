import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/projects/[id]/shots/[shotId]
 * Updates only metadata fields on the shots table. Image/video assets live
 * in the shot_assets table and must be patched via /shots/[shotId]/assets.
 *
 * Legacy fields (startFrameDesc/firstFrame/lastFrame/sceneRefFrame/videoUrl/
 * referenceImages/etc.) are silently ignored — they no longer exist on the
 * shots table.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { shotId } = await params;
  const body = (await request.json()) as Partial<{
    prompt: string;
    duration: number;
    sequence: number;
    motionScript: string | null;
    videoScript: string | null;
    videoPrompt: string | null;
    cameraDirection: string;
    transitionIn: string;
    transitionOut: string;
    compositionGuide: string;
    focalPoint: string;
    depthOfField: string;
    soundDesign: string;
    musicCue: string;
    costumeOverrides: string;
  }>;

  // Whitelist: only allow fields that still exist on the shots table.
  const allowed: Record<string, unknown> = {};
  const ALLOWED_KEYS = [
    "prompt",
    "duration",
    "sequence",
    "motionScript",
    "videoScript",
    "videoPrompt",
    "cameraDirection",
    "transitionIn",
    "transitionOut",
    "compositionGuide",
    "focalPoint",
    "depthOfField",
    "soundDesign",
    "musicCue",
    "costumeOverrides",
  ] as const;
  for (const key of ALLOWED_KEYS) {
    if (key in body) allowed[key] = (body as Record<string, unknown>)[key];
  }

  if (Object.keys(allowed).length === 0) {
    // Nothing to update — return current row
    const [row] = await db.select().from(shots).where(eq(shots.id, shotId));
    return NextResponse.json(row);
  }

  const [updated] = await db
    .update(shots)
    .set(allowed)
    .where(eq(shots.id, shotId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; shotId: string }> }
) {
  const { shotId } = await params;
  await db.delete(shots).where(eq(shots.id, shotId));
  return new NextResponse(null, { status: 204 });
}
