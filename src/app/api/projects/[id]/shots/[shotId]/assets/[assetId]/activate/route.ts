/**
 * POST /api/projects/[id]/shots/[shotId]/assets/[assetId]/activate
 *
 * Switch the "current" version of a (shot, type, sequenceInType) slot to the
 * specified asset row. Flips the target row to is_active=1 and all sibling
 * rows in the same slot to is_active=0.
 *
 * Used by the UI version-history arrows to move between historical
 * generations of an image or video.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shotAssets } from "@/lib/db/schema";
import { activateAssetVersion } from "@/lib/shot-asset-utils";
import { eq } from "drizzle-orm";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; shotId: string; assetId: string }> }
) {
  const { shotId, assetId } = await params;

  const [target] = await db
    .select()
    .from(shotAssets)
    .where(eq(shotAssets.id, assetId));

  if (!target) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (target.shotId !== shotId) {
    return NextResponse.json({ error: "Asset does not belong to this shot" }, { status: 400 });
  }

  await activateAssetVersion(
    target.shotId,
    target.type as "first_frame" | "last_frame" | "reference" | "keyframe_video" | "reference_video",
    target.sequenceInType,
    target.assetVersion
  );

  return NextResponse.json({ ok: true });
}
