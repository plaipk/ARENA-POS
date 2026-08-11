"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ReserveFundEntry } from "@/lib/types/database";

/** Every reserve-fund ledger entry (auto 30% entries from period close, plus
 * manual ones), newest first. */
export function useReserveFundEntries() {
  return useQuery({
    queryKey: ["reserve-fund-entries"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("reserve_fund_entries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ReserveFundEntry[];
    },
  });
}
