-- Threads自動投稿：投稿予定を貯めておくテーブル
create table if not exists threads_posts (
  id bigint generated always as identity primary key,
  scheduled_date date not null,
  slot text not null check (slot in ('morning', 'evening')), -- morning=朝6時, evening=夜20時
  body text not null,
  reply_text text, -- リプライで案内する文（ホームページリンクなど）
  status text not null default 'draft' check (status in ('draft', 'approved', 'posted', 'failed')),
  thread_id text,
  reply_thread_id text,
  error_message text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (scheduled_date, slot)
);

alter table threads_posts enable row level security;
