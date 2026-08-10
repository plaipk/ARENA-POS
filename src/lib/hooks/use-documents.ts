"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ArchiveMonth, DocumentRecord } from "@/lib/types/database";

/** Uploaded "other documents" (contracts, receipts, misc paperwork), newest first. */
export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as DocumentRecord[];
    },
  });
}

/** One row per month of a year — monthly PDF reports, powers both the Documents
 * page and (previously) the Archive dialog. Only months with real activity,
 * a generated PDF, or a closed allocation are kept, newest month first. */
export function useReportArchive(year: number) {
  return useQuery({
    queryKey: ["report-archive", year],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_report_archive", { p_year: year });
      if (error) throw error;
      return (data as ArchiveMonth[]).filter((m) => m.row_count > 0 || m.has_pdf || m.allocated).reverse();
    },
  });
}
