import { NextRequest, NextResponse } from "next/server";
import { canonicalizeHandle, hashHandle } from "@/lib/signer";
import { createRateLimiter } from "@/lib/rate-limit";

const WINDOW_MS = 60_000;

/**
 * This endpoint is unauthenticated by design (senders need no login), so it is
 * an open hash oracle. Rate limiting is what prevents bulk enumeration of every
 * pending gift — see ARCHITECTURE.md section 9, "Handle Dictionary Enumeration".
 */
const hashLimiter = createRateLimiter({ limit: 20, windowMs: WINDOW_MS });

export async function POST(req: NextRequest) {
  try {
    const gate = hashLimiter.check(clientKey(req));
    if (!gate.allowed) {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: "Too many requests. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } }
      );
    }

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

    if (clean.length > 15 || !/^[a-z0-9_]+$/.test(clean)) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Handle contains invalid characters." },
        { status: 400 }
      );
    }

    const handleHash = hashHandle(clean);

    return NextResponse.json({
      handle: clean,
      handleHash,
    });
  } catch (error: any) {
    console.error("[/api/hash-handle] hashing failed:", error);

    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to hash handle." },
      { status: 500 }
    );
  }
}

/**
 * Rate-limit bucket key.
 *
 * Prefers the platform-assigned client address over `x-forwarded-for`, which
 * is client-controlled and therefore forgeable.
 */
function clientKey(req: NextRequest): string {
  const ip =
    req.headers.get("x-vercel-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";
  return ip.split(",")[0].trim();
}
