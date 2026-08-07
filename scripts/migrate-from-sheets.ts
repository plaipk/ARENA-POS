/**
 * One-off import from the original Google Sheet into Supabase.
 *
 * Setup:
 *  1. In Google Cloud Console, create a service account and a JSON key.
 *  2. Share the Google Sheet with the service account's email as Viewer.
 *  3. Fill in .env.local: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL,
 *     GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (the private_key field from the JSON
 *     key — keep the \n escapes, they're unescaped below), and
 *     SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL.
 *  4. Run against a staging/throwaway Supabase project first:
 *       npm run migrate
 *     Spot-check totals against the original sheet before pointing this at
 *     the real project.
 *
 * What this does NOT do:
 *  - Preserve the "Log" sheet (audit trail starts fresh from go-live).
 *  - Reconstruct profit_allocations/reserve_fund_entries rows for allocations
 *    already closed in the old sheet — those ledger rows still import (as
 *    category='profit_allocation' transactions, so balances stay correct),
 *    but the Archive dialog's "จัดสรรแล้ว" badge won't show for past periods
 *    unless you backfill profit_allocations manually. Logged below.
 *  - Guess product categories perfectly — anything with "สนาม" in the name
 *    is tagged field_rental; review the printed list and fix in the
 *    `products` table if it guessed wrong.
 */
import "dotenv/config";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/types/database";

const SHEET_ID = requireEnv("GOOGLE_SHEET_ID");
const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}

async function readSheet(sheetsApi: Awaited<ReturnType<typeof getSheetsClient>>, range: string) {
  const res = await sheetsApi.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  const rows = res.data.values ?? [];
  return rows.slice(1); // drop header row
}

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

/** Matches the original client's " (qty)" / " [รับเข้า qty]" detail suffixes. */
function parseSaleDetail(detail: string): { name: string; qty: number } | null {
  const m = detail.match(/(.*)\s\((\d+)\)$/);
  return m ? { name: m[1].trim(), qty: Number(m[2]) } : null;
}
function parseStockInDetail(detail: string): { name: string; qty: number } | null {
  const m = detail.match(/(.*)\s\[รับเข้า\s(\d+)\]$/);
  return m ? { name: m[1].trim(), qty: Number(m[2]) } : null;
}

async function main() {
  const sheetsApi = await getSheetsClient();

  // ---------- 1. Products ----------
  console.log("Reading สินค้า ...");
  const productRows = await readSheet(sheetsApi, "สินค้า!A:E");
  const productsToInsert = productRows
    .filter((r) => str(r[1]))
    .map((r) => ({
      name: str(r[1]),
      category: str(r[1]).includes("สนาม") ? ("field_rental" as const) : ("merchandise" as const),
      stock: num(r[2]),
      cost: num(r[3]),
      price: num(r[4]),
    }));

  const fieldRentalGuesses = productsToInsert.filter((p) => p.category === "field_rental").map((p) => p.name);
  if (fieldRentalGuesses.length) {
    console.log("  Guessed field_rental category for:", fieldRentalGuesses.join(", "), "— review this.");
  }

  const { error: prodErr } = await supabase.from("products").upsert(productsToInsert, { onConflict: "name" });
  if (prodErr) throw prodErr;
  console.log(`  Inserted ${productsToInsert.length} products.`);

  const { data: allProducts } = await supabase.from("products").select("id, name, category");
  const productByName = new Map((allProducts ?? []).map((p) => [p.name.toLowerCase(), p]));

  // ---------- 2. รายรับรายจ่าย -> transactions ----------
  console.log("Reading รายรับรายจ่าย ...");
  const ledgerRows = await readSheet(sheetsApi, "รายรับรายจ่าย!A:H");
  const allocationPeriods: string[] = [];
  const txnRows = ledgerRows
    .filter((r) => r[0])
    .map((r) => {
      const detail = str(r[1]);
      const income = num(r[2]);
      const expense = num(r[3]);
      const typeCol = str(r[5]);
      const costTotal = num(r[6]);
      const profitTotal = num(r[7]);
      const paymentMethod = typeCol === "เงินสด" ? "cash" : "transfer"; // legacy "เซ็น:" rows fall back to transfer

      let category: Database["public"]["Tables"]["transactions"]["Row"]["category"];
      let mode: Database["public"]["Tables"]["transactions"]["Row"]["mode"];
      let productId: string | null = null;
      let productName: string | null = null;
      let qty: number | null = null;

      if (detail.includes("จัดสรรกำไรส่วนกลาง")) {
        category = "profit_allocation";
        mode = "allocation";
        const m = detail.match(/\(([^)]+)\)/);
        if (m) allocationPeriods.push(m[1]);
      } else if (detail.includes("โยกเงิน")) {
        category = "transfer";
        mode = "transfer";
      } else if (detail.startsWith("รับชำระหนี้:")) {
        category = "debt_settlement";
        mode = "settlement";
      } else if (income > 0) {
        const parsed = parseSaleDetail(detail);
        const name = parsed?.name ?? detail;
        const product = productByName.get(name.toLowerCase());
        category = product?.category === "field_rental" || detail.includes("สนาม") ? "field_rental" : "product_sale";
        mode = "income";
        productId = product?.id ?? null;
        productName = product?.name ?? (parsed ? name : null);
        qty = parsed?.qty ?? null;
      } else if (detail.includes("[รับเข้า")) {
        const parsed = parseStockInDetail(detail);
        category = "stock_purchase";
        mode = "stock_in";
        const product = parsed ? productByName.get(parsed.name.toLowerCase()) : undefined;
        productId = product?.id ?? null;
        productName = parsed?.name ?? null;
        qty = parsed?.qty ?? null;
      } else {
        category = "general_expense";
        mode = "expense";
      }

      return {
        occurred_at: new Date(r[0]).toISOString(),
        product_id: productId,
        product_name: productName,
        qty,
        detail,
        income,
        expense,
        cost_total: costTotal,
        profit_total: profitTotal,
        payment_method: paymentMethod as "cash" | "transfer",
        category,
        mode,
      };
    });

  const { error: txnErr } = await supabase.from("transactions").insert(txnRows);
  if (txnErr) throw txnErr;
  console.log(`  Inserted ${txnRows.length} transactions.`);
  if (allocationPeriods.length) {
    console.log(
      "  Historical allocations found (not reconstructed in profit_allocations):",
      allocationPeriods.join(" | "),
    );
  }

  // ---------- 3. ค้างรับ -> debts ----------
  console.log("Reading ค้างรับ ...");
  const debtRows = await readSheet(sheetsApi, "ค้างรับ!A:G");
  const debtsToInsert = debtRows
    .filter((r) => r[0] && str(r[1]))
    .map((r) => {
      const detail = str(r[2]);
      const parsed = parseSaleDetail(detail);
      const product = parsed ? productByName.get(parsed.name.toLowerCase()) : undefined;
      const partialFlag = str(r[6]);
      const amount = num(r[3]);
      const costTotal = num(r[4]);
      const profitTotal = num(r[5]);
      return {
        occurred_at: new Date(r[0]).toISOString(),
        customer_name: str(r[1]),
        product_id: product?.id ?? null,
        product_name: parsed?.name ?? null,
        qty: parsed?.qty ?? null,
        detail,
        amount,
        cost_total: costTotal,
        profit_total: profitTotal,
        remaining_amount: amount,
        remaining_cost: costTotal,
        remaining_profit: profitTotal,
        status: (partialFlag.startsWith("จ่ายบางส่วน") ? "partial" : "outstanding") as "partial" | "outstanding",
      };
    });

  const { error: debtErr } = await supabase.from("debts").insert(debtsToInsert);
  if (debtErr) throw debtErr;
  console.log(`  Inserted ${debtsToInsert.length} outstanding debts.`);

  // ---------- 4. เงินสำรองสนาม -> reserve_fund_entries ----------
  console.log("Reading เงินสำรองสนาม ...");
  const reserveRows = await readSheet(sheetsApi, "เงินสำรองสนาม!A:B");
  const reserveToInsert = reserveRows
    .filter((r) => r[0])
    .map((r) => ({ period: str(r[0]), amount: num(r[1]) }));

  const { error: reserveErr } = await supabase.from("reserve_fund_entries").insert(reserveToInsert);
  if (reserveErr) throw reserveErr;
  console.log(`  Inserted ${reserveToInsert.length} reserve fund entries.`);

  console.log("\nDone. Spot-check v_balance_summary / v_debtor_summary against the original sheet's totals.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
