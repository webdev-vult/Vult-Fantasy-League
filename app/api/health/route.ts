import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "vult-fantasy-platform",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
