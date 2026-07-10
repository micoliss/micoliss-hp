-- ============================================================
-- Micoliss  返信用の画像バケット（reply-images）権限設定
-- 使い方：
--   1) Supabase左メニュー「Storage」→「New bucket」でバケットを作成
--        Name: reply-images ／ Public bucket: ON（オンにする）
--   2) 左メニュー「SQL Editor」でこのファイルの中身を貼り付け→Run
-- ============================================================

-- ログイン済み（お店の人）だけが画像をアップロード・管理できる
create policy "admin upload reply images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'reply-images');

create policy "admin read reply images"
  on storage.objects for select to authenticated
  using (bucket_id = 'reply-images');

create policy "admin delete reply images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'reply-images');

-- ※バケットを Public にしてあるので、お客様（LINE/メール）は
--   公開URLで画像を見られます（読み取りはanonに自動許可）。
-- ============================================================
-- 完了！「Success. No rows returned」と出ればOKです。
-- ============================================================
