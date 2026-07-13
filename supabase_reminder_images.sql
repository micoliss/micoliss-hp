-- リマインド文面に画像を添えられるようにする（1回だけ実行）。
-- Supabaseダッシュボード → SQL Editor に貼り付けて Run。
--
-- image_urls には、送る画像の公開URLを改行区切りで入れる（管理ページの🔔設定が自動で書き込む）。
-- LINEは1回の送信で5通までなので、テキスト1通＋画像は最大4枚まで。

alter table reminder_settings
  add column if not exists image_urls text;

comment on column reminder_settings.image_urls is
  'リマインドに添える画像の公開URL（改行区切り・最大4枚）。LINEは画像メッセージ、メールは添付で送られる。';
