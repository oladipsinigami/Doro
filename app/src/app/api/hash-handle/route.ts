import { NextRequest, NextResponse } from "next/server";
import { canonicalizeHandle, hashHandle } from "@/lib/signer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { handle } = body;

    if (!handle || typeof handle !== "string") {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "A valid handle string is required." },
        { status: 400 }
      );
    }

    const clean = canonicalizeHandle(handle);
    if (clean.length === 0) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Handle cannot be empty." },
        { status: 400 }
      );
    }

    const handleHash = hashHandle(clean);

    return NextResponse.json({
      handle: clean,
      handleHash,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: error?.message || "Failed to hash handle." },
      { status: 500 }
    );
  }
}
