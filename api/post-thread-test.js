// 動作確認用：保存済みのトークンを使って、指定した文章を1件だけ投稿する。
// 使い方: /api/post-thread-test?text=こんにちは&key=合言葉
const { getToken, postThread } = require('../lib/threads');

module.exports = async (req, res) => {
  if (req.query.key !== process.env.POST_TEST_KEY) {
    res.status(403).send('合言葉が違います');
    return;
  }
  const text = req.query.text;
  if (!text) {
    res.status(400).send('?text=投稿したい文章 を付けてください');
    return;
  }

  const token = await getToken();
  if (!token) {
    res.status(400).send('まだThreadsと連携されていません。先に /api/threads-auth-start を開いてください。');
    return;
  }

  try {
    const result = await postThread(token.access_token, token.threads_user_id, text);
    res.status(200).json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
