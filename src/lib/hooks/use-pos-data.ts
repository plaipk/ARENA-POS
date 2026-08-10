"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/types/database";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data as Product[];
    },
  });
}

export function useBalanceSummary() {
  return useQuery({
    queryKey: ["balance-summary"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("v_balance_summary").select("*").single();
      if (error) throw error;
      return data as { cash: number; transfer: number };
    },
  });
}

export function useDebtorNames() {
  return useQuery({
    queryKey: ["debtor-names"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("debts")
        .select("customer_name")
        .in("status", ["outstanding", "partial"]);
      if (error) throw error;
      const names = [...new Set((data ?? []).map((d) => d.customer_name))].sort();
      return names;
    },
  });
}

/** Call after any mutating RPC to refresh the shared read data, mirrors the old
 * loadSummary()/loadProducts()/loadDebtorNames() refresh-after-save pattern. */
export function useInvalidatePosData() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["balance-summary"] });
    queryClient.invalidateQueries({ queryKey: ["debtor-names"] });
    queryClient.invalidateQueries({ queryKey: ["debtor-summary"] });
    queryClient.invalidateQueries({ queryKey: ["report-archive"] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  };
}
