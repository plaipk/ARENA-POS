/**
 * Hand-written types matching supabase/migrations/*.sql.
 * Once the Supabase project exists, regenerate with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/types/database.ts
 * (re-apply the Cart/RPC helper types below the generated block if you do).
 */

export type ProductCategory = "merchandise" | "field_rental";
export type PaymentMethod = "cash" | "transfer";
export type TransactionCategory =
  | "product_sale"
  | "field_rental"
  | "general_expense"
  | "stock_purchase"
  | "debt_settlement"
  | "transfer"
  | "profit_allocation"
  | "other_income";
export type TransactionMode = "income" | "expense" | "stock_in" | "settlement" | "transfer" | "allocation";
export type DebtStatus = "outstanding" | "partial" | "paid" | "void";

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  cost: number;
  price: number;
  stock: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  occurred_at: string;
  product_id: string | null;
  product_name: string | null;
  qty: number | null;
  unit_price: number | null;
  detail: string;
  income: number;
  expense: number;
  cost_total: number;
  profit_total: number;
  payment_method: PaymentMethod;
  category: TransactionCategory;
  mode: TransactionMode;
  is_void: boolean;
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
}

export interface Debt {
  id: string;
  occurred_at: string;
  customer_name: string;
  product_id: string | null;
  product_name: string | null;
  qty: number | null;
  detail: string;
  amount: number;
  cost_total: number;
  profit_total: number;
  remaining_amount: number;
  remaining_cost: number;
  remaining_profit: number;
  status: DebtStatus;
  created_at: string;
}

export interface DebtPayment {
  id: string;
  customer_name: string;
  amount: number;
  payment_method: PaymentMethod;
  cost_total: number;
  profit_total: number;
  transaction_id: string | null;
  created_at: string;
}

export interface ReserveFundEntry {
  id: string;
  period: string;
  amount: number;
  allocation_id: string | null;
  created_at: string;
}

export interface ProfitAllocation {
  id: string;
  month: number;
  year: number;
  period: string;
  net_profit: number;
  scholarship: number;
  emergency: number;
  rotate: number;
  staff: number;
  total_out: number;
  transaction_id: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  month: number;
  year: number;
  period: string;
  file_name: string;
  storage_path: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  detail: string | null;
  amount: number | null;
  mode: string | null;
  created_at: string;
}

/** Cart line sent to save_transaction(); mirrors the old client-side `cart` array.
 * `cost`: cost per unit, only sent (and only required) when `name` doesn't match
 * any real product in income mode — e.g. "ยอดยกมา" (cost = price -> zero profit)
 * or an ad-hoc "ค่าเช่าสนาม" (cost = 0 -> full price counts as profit). */
export interface CartLine {
  name: string;
  qty: number;
  price: number;
  total: number;
  cost?: number;
}

export interface SaveTransactionResult {
  ok: boolean;
  message: string;
}

export interface AllocationBreakdown {
  net_profit: number;
  scholarship: number;
  emergency: number;
  rotate: number;
  staff: number;
  total_out: number;
}

export interface MonthlyReport {
  period: string;
  rent_income_total: number;
  product_sales_total: number;
  total_profit_from_sales: number;
  other_income_items: { name: string; amount: number }[];
  general_expenses: { name: string; amount: number }[];
  stock_expense: number;
  actual_expense: number;
  total_income: number;
  total_expense: number;
  total_debt: number;
  stock_value: number;
  reserve_balance: number;
  prev_balance: number;
  next_balance: number;
  alloc: AllocationBreakdown;
}

export interface ReportPdfVersion {
  storage_path: string;
  file_name: string;
  created_at: string;
}

export interface ArchiveMonth extends MonthlyReport {
  month: number;
  month_name: string;
  row_count: number;
  allocated: boolean;
  alloc_date: string | null;
  has_pdf: boolean;
  storage_path: string | null;
  pdf_created_at: string | null;
  /** Every PDF ever generated for this month, newest first — regenerating
   * doesn't discard earlier ones, so any version can be reopened. */
  pdf_versions: ReportPdfVersion[];
}

/** Search result row returned by search_transactions_by_date() — powers the Void dialog. */
export interface SearchResultRow {
  id: string;
  source: "main" | "debt";
  detail: string;
  amount: number;
  type: string;
  partial: string | null;
}

// PostgREST's generated client types require every table/view to declare `Relationships`
// (used for resource-embedding) even though we don't use it here.
//
// IMPORTANT: every Row/Insert/Update type below is written as a plain object literal —
// no `Partial<T>`, no generic helper type, not even a local generic alias. Supabase's
// client computes its `Schema` generic as a *default* on `SupabaseClient<Database>`, and
// that default-inference chain silently collapses to `never` (so every `.rpc()`/`.from()`
// call type-checks as if it took no arguments) the moment ANY generic type instantiation —
// even the built-in `Partial<T>` — appears anywhere inside `Database`. Regenerate with
// `supabase gen types typescript` once real, which produces this same literal style.
export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          name: string;
          category: "merchandise" | "field_rental";
          cost: number;
          price: number;
          stock: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category?: "merchandise" | "field_rental";
          cost?: number;
          price?: number;
          stock?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: "merchandise" | "field_rental";
          cost?: number;
          price?: number;
          stock?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          occurred_at: string;
          product_id: string | null;
          product_name: string | null;
          qty: number | null;
          unit_price: number | null;
          detail: string;
          income: number;
          expense: number;
          cost_total: number;
          profit_total: number;
          payment_method: "cash" | "transfer";
          category:
            | "product_sale"
            | "field_rental"
            | "general_expense"
            | "stock_purchase"
            | "debt_settlement"
            | "transfer"
            | "profit_allocation"
            | "other_income";
          mode: "income" | "expense" | "stock_in" | "settlement" | "transfer" | "allocation";
          is_void: boolean;
          void_reason: string | null;
          voided_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          occurred_at?: string;
          product_id?: string | null;
          product_name?: string | null;
          qty?: number | null;
          unit_price?: number | null;
          detail: string;
          income?: number;
          expense?: number;
          cost_total?: number;
          profit_total?: number;
          payment_method: "cash" | "transfer";
          category:
            | "product_sale"
            | "field_rental"
            | "general_expense"
            | "stock_purchase"
            | "debt_settlement"
            | "transfer"
            | "profit_allocation"
            | "other_income";
          mode: "income" | "expense" | "stock_in" | "settlement" | "transfer" | "allocation";
          is_void?: boolean;
          void_reason?: string | null;
          voided_at?: string | null;
          created_at?: string;
        };
        Update: {
          is_void?: boolean;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Relationships: [];
      };
      debts: {
        Row: {
          id: string;
          occurred_at: string;
          customer_name: string;
          product_id: string | null;
          product_name: string | null;
          qty: number | null;
          detail: string;
          amount: number;
          cost_total: number;
          profit_total: number;
          remaining_amount: number;
          remaining_cost: number;
          remaining_profit: number;
          status: "outstanding" | "partial" | "paid" | "void";
          created_at: string;
        };
        Insert: {
          id?: string;
          occurred_at?: string;
          customer_name: string;
          product_id?: string | null;
          product_name?: string | null;
          qty?: number | null;
          detail: string;
          amount: number;
          cost_total?: number;
          profit_total?: number;
          remaining_amount: number;
          remaining_cost?: number;
          remaining_profit?: number;
          status?: "outstanding" | "partial" | "paid" | "void";
          created_at?: string;
        };
        Update: {
          remaining_amount?: number;
          remaining_cost?: number;
          remaining_profit?: number;
          status?: "outstanding" | "partial" | "paid" | "void";
        };
        Relationships: [];
      };
      debt_payments: {
        Row: {
          id: string;
          customer_name: string;
          amount: number;
          payment_method: "cash" | "transfer";
          cost_total: number;
          profit_total: number;
          transaction_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_name: string;
          amount: number;
          payment_method: "cash" | "transfer";
          cost_total?: number;
          profit_total?: number;
          transaction_id?: string | null;
          created_at?: string;
        };
        Update: { id?: string };
        Relationships: [];
      };
      reserve_fund_entries: {
        Row: { id: string; period: string; amount: number; allocation_id: string | null; created_at: string };
        Insert: { id?: string; period: string; amount: number; allocation_id?: string | null; created_at?: string };
        Update: { id?: string };
        Relationships: [];
      };
      profit_allocations: {
        Row: {
          id: string;
          month: number;
          year: number;
          period: string;
          net_profit: number;
          scholarship: number;
          emergency: number;
          rotate: number;
          staff: number;
          total_out: number;
          transaction_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          month: number;
          year: number;
          period: string;
          net_profit: number;
          scholarship: number;
          emergency: number;
          rotate: number;
          staff: number;
          total_out: number;
          transaction_id?: string | null;
          created_at?: string;
        };
        Update: { id?: string };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          month: number;
          year: number;
          period: string;
          file_name: string;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          month: number;
          year: number;
          period: string;
          file_name: string;
          storage_path: string;
          created_at?: string;
        };
        Update: { id?: string };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          action: string;
          detail: string | null;
          amount: number | null;
          mode: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action: string;
          detail?: string | null;
          amount?: number | null;
          mode?: string | null;
          created_at?: string;
        };
        Update: { id?: string };
        Relationships: [];
      };
    };
    Views: {
      v_balance_summary: { Row: { cash: number; transfer: number }; Relationships: [] };
      v_debtor_summary: { Row: { name: string; total: number }; Relationships: [] };
    };
    Functions: {
      save_transaction: {
        Args: { p_cart: CartLine[]; p_payment_type: string; p_customer_name: string | null; p_mode: TransactionMode };
        Returns: SaveTransactionResult;
      };
      settle_debt: {
        Args: { p_customer_name: string; p_pay_amount: number; p_payment_type: PaymentMethod };
        Returns: SaveTransactionResult;
      };
      void_transaction: {
        Args: { p_transaction_id: string; p_reason: string | null };
        Returns: SaveTransactionResult;
      };
      void_debt: {
        Args: { p_debt_id: string; p_reason: string | null };
        Returns: SaveTransactionResult;
      };
      transfer_funds: {
        Args: { p_direction: "cash_to_bank" | "bank_to_cash"; p_amount: number };
        Returns: SaveTransactionResult;
      };
      search_transactions_by_date: {
        Args: { p_date: string };
        Returns: SearchResultRow[];
      };
      get_report_by_month: {
        Args: { p_month: number; p_year: number };
        Returns: MonthlyReport;
      };
      get_report_archive: {
        Args: { p_year: number };
        Returns: ArchiveMonth[];
      };
      save_allocation_entry: {
        Args: { p_month: number; p_year: number };
        Returns: SaveTransactionResult & { alloc?: AllocationBreakdown; period?: string };
      };
      upsert_product: {
        Args: {
          p_id: string | null;
          p_name: string;
          p_category: ProductCategory;
          p_cost: number;
          p_price: number;
          p_stock: number;
        };
        Returns: SaveTransactionResult & { id?: string };
      };
      delete_product: {
        Args: { p_id: string };
        Returns: SaveTransactionResult;
      };
      record_stock_take: {
        Args: { p_items: { product_id: string; counted_stock: number }[] };
        Returns: SaveTransactionResult & { adjusted?: number; unchanged?: number };
      };
      update_transaction: {
        Args: {
          p_id: string;
          p_occurred_at: string;
          p_detail: string;
          p_income: number;
          p_expense: number;
          p_payment_method: PaymentMethod;
          p_category: TransactionCategory;
        };
        Returns: SaveTransactionResult;
      };
    };
  };
}
