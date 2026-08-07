import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileProvider } from "@/lib/hooks/use-profile";
import type { Profile } from "@/lib/types/database";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Proxy already redirects unauthenticated requests to /login; this is the
  // defense-in-depth check inside the render path itself.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  return (
    <ProfileProvider initialUser={user} initialProfile={profile ?? null}>
      {children}
    </ProfileProvider>
  );
}
