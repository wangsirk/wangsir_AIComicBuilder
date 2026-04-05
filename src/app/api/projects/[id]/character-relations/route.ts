import { db } from "@/lib/db";
import { characterRelations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { id as genId } from "@/lib/id";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const relations = await db
    .select()
    .from(characterRelations)
    .where(eq(characterRelations.projectId, id));
  return NextResponse.json(relations);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const relation = {
    id: genId(),
    projectId: id,
    characterAId: body.characterAId,
    characterBId: body.characterBId,
    relationType: body.relationType || "neutral",
    description: body.description || "",
  };
  await db.insert(characterRelations).values(relation);
  return NextResponse.json(relation, { status: 201 });
}
