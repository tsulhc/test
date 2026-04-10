import { NextRequest, NextResponse } from "next/server";

import { serializeDashboardData } from "@/lib/dashboard-serialization";
import { getDashboardData } from "@/lib/pocket";
import type { TimeWindow } from "@/lib/types";

function isWindow(value: string | null): value is TimeWindow {
  return value === "24h" || value === "7d" || value === "30d";
}

export async function GET(request: NextRequest) {
  const window = request.nextUrl.searchParams.get("window");
  if (!isWindow(window)) {
    return NextResponse.json({ error: "Invalid window" }, { status: 400 });
  }

  const data = await getDashboardData(window);
  return NextResponse.json(serializeDashboardData(data));
}
