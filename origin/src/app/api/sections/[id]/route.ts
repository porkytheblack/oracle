import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const filePath = join(process.cwd(), "data", "sections", `${id}.json`);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  return NextResponse.json(data);
}
