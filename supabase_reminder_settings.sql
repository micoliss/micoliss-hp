-- ============================================================
-- Micoliss リマインド設定テーブル  Supabase 追加SQL
-- Supabase → SQL Editor に貼り付けて Run。既存データは消えません。
-- 管理ページ🔔タブの「リマインド設定」で編集する内容の保存先。
-- ============================================================

create table if not exists reminder_settings (
  type        text primary key,                 -- soon / prev / today / thanks / follow
  label       text,                             -- 管理画面の表示名
  enabled     boolean not null default true,    -- オン/オフ
  send_time   text,                             -- 送信時刻 'HH:MM'（前日/当日/お礼/フォロー）
  offset_min  int,                              -- soon: 開始何分前
  offset_days int,                              -- follow: 来店何日後
  template    text,                             -- 文面（{name}{date}{time}{menu} が使える）
  sort        int default 0
);

-- 管理者（ログイン済み）だけ読み書き。cronはサービスキーで読む。
alter table reminder_settings enable row level security;
drop policy if exists "admin all reminder_settings" on reminder_settings;
create policy "admin all reminder_settings" on reminder_settings
  for all to authenticated using (true) with check (true);

-- 初期データ（既にあれば上書きしない）
insert into reminder_settings (type,label,enabled,send_time,offset_min,offset_days,template,sort) values
('soon','予約1時間前',true,null,60,null,
 '{name}様

まもなくご予約のお時間です🌿

📅 本日 {time}〜
💠 {menu}

お気をつけてお越しくださいませ。
お近くまで来られたらこのままご返信いただいても大丈夫です。

Seed of Color -Micoliss-',1),
('prev','前日リマインド',true,'18:00',null,null,
 '{name}様

明日はご予約日です🌿

📅 {date}〜
💠 {menu}

お気をつけてお越しくださいませ。
変更・キャンセルはこのままご返信ください。

Seed of Color -Micoliss-',2),
('today','当日リマインド',true,'08:00',null,null,
 '{name}様

本日はご予約日です🌿

📅 {date}〜
💠 {menu}

お会いできるのを楽しみにお待ちしております。

Seed of Color -Micoliss-',3),
('thanks','お礼メッセージ',true,'10:00',null,null,
 '{name}様

本日はご来店ありがとうございました🌿

診断の内容でご不明な点があれば、いつでもこちらへご連絡ください。
またお会いできる日を楽しみにしております。

Seed of Color -Micoliss-',4),
('follow','再来フォロー',true,'10:00',null,14,
 '{name}様

その後、お過ごしはいかがでしょうか🌿
先日の診断が毎日のお役に立っていれば嬉しいです。

メニューのご相談やご予約はこのままご返信ください。

Seed of Color -Micoliss-',5)
on conflict (type) do nothing;

-- 完了！「Success. No rows returned」でOK。
