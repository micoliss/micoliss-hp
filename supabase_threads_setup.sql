-- Threads自動投稿用：トークン保存テーブル（1行だけ使う）
create table if not exists threads_tokens (
  id int primary key default 1,
  access_token text not null,
  threads_user_id text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
