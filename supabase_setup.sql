-- ============================================================
-- Micoliss 予約システム  Supabase セットアップ用SQL
-- 使い方：Supabaseの左メニュー「SQL Editor」を開き、
--         このファイルの中身を全部コピーして貼り付け →「Run」
-- ============================================================

-- 1) 予約テーブル ----------------------------------------------
create table if not exists reservations (
  id          text primary key,                 -- 'r' + 時刻ミリ秒（お客様画面で発行）
  created_at  timestamptz not null default now(),
  date        date not null,                    -- 予約日 'YYYY-MM-DD'
  time        text not null,                    -- 開始時刻 'HH:MM'
  menu_id     text,
  menu_name   text,
  menu_min    int,                              -- 所要時間（分）
  price       int,
  name        text,                             -- お客様 氏名
  kana        text,
  tel         text,
  mail        text,
  first       text,                             -- 'はじめて' / '2回目以降' など
  note        text,
  status      text not null default 'confirmed' -- 'confirmed' / 'cancelled'
);

-- 2) 店長が閉じた枠テーブル -------------------------------------
create table if not exists closed_slots (
  slot text primary key   -- 'YYYY-MM-DD_HH:MM'
);

-- 3) 行レベルセキュリティ（RLS）を有効化 -----------------------
-- これで「誰が・何を」読み書きできるかを細かく制御します。
alter table reservations enable row level security;
alter table closed_slots enable row level security;

-- 4) お客様（匿名 anon）の権限 ---------------------------------
-- ・予約の新規登録（INSERT）は誰でもOK
-- ・ただし予約の中身（名前・電話など）は読めない（SELECT不可）
--   → 個人情報の漏えいを防ぐ
create policy "anyone can insert reservation"
  on reservations for insert
  to anon
  with check (true);

-- 閉じた枠は誰でも読める（空き状況の表示に必要・個人情報なし）
create policy "anyone can read closed slots"
  on closed_slots for select
  to anon
  using (true);

-- 5) 空き状況だけを見せる安全なビュー --------------------------
-- 名前や電話は含めず「日時と所要時間」だけを公開。
-- お客様画面はこれを使って◎/×を計算する。
create or replace view busy_slots
with (security_invoker = off) as
  select date, time, menu_min
  from reservations
  where status <> 'cancelled';

-- ビューは誰でも読めるように
grant select on busy_slots to anon;

-- 6) 管理者（ログイン済み authenticated）の権限 ----------------
-- ログインしたお店の人は予約も閉じ枠も全部読み書きできる。
create policy "admin full access reservations"
  on reservations for all
  to authenticated
  using (true) with check (true);

create policy "admin full access closed slots"
  on closed_slots for all
  to authenticated
  using (true) with check (true);

-- ============================================================
-- 完了！「Success. No rows returned」と出ればOKです。
-- ============================================================
