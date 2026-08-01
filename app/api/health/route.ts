import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "vult-fantasy-platform",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    integrations: {
      supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabasePublishableKeyConfigured: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      ),
      supabaseServiceRoleConfigured: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      fantasyProvider: process.env.FANTASY_DATA_PROVIDER ?? "mock",
    },
    timestamp: new Date().toISOString(),
  });
}
