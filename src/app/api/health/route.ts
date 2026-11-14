import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Minimal liveness probe for a deployment. It checks that the process can
 * reach PostgreSQL and returns no version, connection string, error message or
 * configuration detail.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({ status: "ok" }, { headers });
  } catch (error) {
    logEvent("error", "health.database_unavailable", {
      stage: "database",
      kind: error instanceof Error ? error.name : "unknown",
    });

    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers },
    );
  }
}
