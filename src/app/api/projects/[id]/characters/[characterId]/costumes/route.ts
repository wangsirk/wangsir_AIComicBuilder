import { db } from "@/lib/db";
import { characterCostumes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { id as genId } from "@/lib/id";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;
  const costumes = await db
    .select()
    .from(characterCostumes)
    .where(eq(characterCostumes.characterId, characterId));
  return NextResponse.json(costumes);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;
  const body = await req.json();
  const costume = {
    id: genId(),
    characterId,
    name: body.name || "default",
    description: body.description || "",
    referenceImage: body.referenceImage || null,
  };
  await db.insert(characterCostumes).values(costume);
  return NextResponse.json(costume, { status: 201 });
}
