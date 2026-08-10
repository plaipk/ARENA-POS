"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ArchiveMonth } from "@/lib/types/database";

/** One row per month of a year — monthly PDF reports, powers the Documents page.
 * Only months with real activity, a generated PDF, or a closed allocation are
 * kept, newest month first. */
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
