import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database-phase10";

function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, publishableKey };
}

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabasePublicConfig();

  return createBrowserClient<Database>(url, publishableKey);
}
