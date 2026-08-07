-- Optional local-dev seed data. Not applied to production — run manually
-- (`supabase db reset` applies this automatically against the local stack)
-- or paste into the SQL editor of a throwaway/staging project.

insert into public.products (name, category, cost, price, stock) values
  ('น้ำเปล่า', 'merchandise', 5, 10, 100),
  ('เครื่องดื่มชูกำลัง', 'merchandise', 10, 15, 50),
  ('ค่าเช่าสนาม', 'field_rental', 0, 500, 0)
on conflict (name) do nothing;
