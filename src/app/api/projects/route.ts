import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { ulid } from "ulid";

export async function GET() {
  const allProjects = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt));
  return NextResponse.json(allProjects);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { title: string; script?: string };
  const id = ulid();

  const [project] = await db
    .insert(projects)
    .values({
      id,
      title: body.title,
      script: body.script || "",
    })
    .returning();

  return NextResponse.json(project, { status: 201 });
}
