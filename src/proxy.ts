import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed "Middleware" to "Proxy" (file: proxy.ts, export: proxy()).
// This only does a lightweight session-cookie refresh + redirect; every RPC function
// still re-checks auth/role server-side (see supabase/migrations) since a proxy matcher
// change should never be the only thing standing between a request and a mutation.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
