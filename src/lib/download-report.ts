/** Calls the PDF generation route, triggers a direct download, and returns the result
 * (mirrors the original's dual delivery: base64 download + a persisted storage link). */
export async function downloadGeneratedPdf(month: number, year: number) {
  const res = await fetch("/api/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, year }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "สร้าง PDF ไม่สำเร็จ");

  const link = document.createElement("a");
  link.href = `data:application/pdf;base64,${body.bytes}`;
  link.download = body.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return body as { fileName: string; url: string | null };
}
