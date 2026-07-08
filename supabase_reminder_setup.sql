-- ============================================================
-- Micoliss リマインド機能  Supabase 追加セットアップ用SQL
-- 使い方：Supabaseの左メニュー「SQL Editor」を開き、
--         このファイルの中身を全部コピーして貼り付け →「Run」
--   ※ 既存の予約データは消えません（列を足すだけ）。
-- ============================================================

-- お客様のLINEユーザーID（合言葉で紐づけ後に入る。未連携なら空）
alter table reservations add column if not exists line_user_id text;

-- 予約完了画面に出す「合言葉（6桁）」。お客様がLINEで送ると紐づく。
alter table reservations add column if not exists link_code text;

-- 各リマインドの送信済みフラグ（管理ページで送ると true になる）
alter table reservations add column if not exists rem_prev   boolean not null default false; -- 前日確認
alter table reservations add column if not exists rem_today  boolean not null default false; -- 当日朝
alter table reservations add column if not exists rem_thanks boolean not null default false; -- 当日お礼
alter table reservations add column if not exists rem_follow boolean not null default false; -- 2週間後フォロー

-- 合言葉での照合を速くするための索引
create index if not exists idx_reservations_link_code on reservations(link_code);

-- ============================================================
-- 完了！「Success. No rows returned」と出ればOKです。
-- ============================================================
