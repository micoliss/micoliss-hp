-- ============================================================
-- Micoliss「予約1時間前リマインド」用  Supabase 追加SQL
-- Supabase → SQL Editor に貼り付けて Run。既存データは消えません。
-- ============================================================

-- 「まもなく（1時間前）」リマインドの送信済みフラグ
alter table reservations add column if not exists rem_hour boolean not null default false;

-- 完了！「Success. No rows returned」でOK。
