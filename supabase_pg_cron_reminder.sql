-- ============================================================
-- Micoliss リマインドの定期実行を Supabase pg_cron に移行
-- ============================================================
-- 目的: GitHub Actions は無料枠のため定期実行が遅延・スキップする
--       （30分おきのはずが2時間以上動かない事故あり）。
--       Supabase の pg_cron は定刻でスキップしないので、これに移す。
--
-- 仕組み: 5分おきに Vercel の /api/cron-remind を叩くだけ。
--         送信判定（前日18:00 / 当日08:00 / お礼10:00）と rem_* フラグによる
--         二重送信防止は従来どおり cron-remind 側が行う＝アプリのコード変更は不要。
--         pg_cron は正確なので、送信の誤差は最大5分に収まる。
--
-- 実行方法: Supabase ダッシュボード → SQL Editor に貼り付けて Run。
--   https://supabase.com/dashboard/project/efortdqqqeclshcquqbu/sql/new
-- ============================================================

-- 1) 必要な拡張を有効化（pg_cron=定期実行 / pg_net=DBからHTTP送信）
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) 同名ジョブが既にあれば作り直せるよう一旦解除（無ければ無視）
do $$
begin
  perform cron.unschedule('micoliss-reminder');
exception when others then
  null;
end $$;

-- 3) 5分おきにリマインドチェックURLを叩くジョブを登録
select cron.schedule(
  'micoliss-reminder',
  '*/5 * * * *',
  $$ select net.http_get('https://micoliss-hp.vercel.app/api/cron-remind') $$
);

-- 4) 登録内容の確認（この行を選んで実行すると現在のジョブ一覧が見える）
-- select jobid, jobname, schedule, active, command from cron.job;

-- 直近の実行履歴を見たいとき:
-- select * from cron.job_run_details order by start_time desc limit 20;
