// 毎日6:00と20:00(日本時間)に呼ばれる。その日・その時間帯の「承認済み」投稿があれば自動投稿する。
// 使い方: /api/cron-post-thread?slot=morning または ?slot=evening
const { SUPABASE_URL, svcHeaders, getToken, postThread } = require('../lib/threads');

function todayInJapan() {
  // JSTの「今日の日付」をYYYY-MM-DD文字列で取得
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  const slot = req.query.slot;
  if (slot !== 'morning' && slot !== 'evening') {
    res.status(400).send('?slot=morning または evening を指定してください');
    return;
  }

  const date = todayInJapan();
  const q = `${SUPABASE_URL}/rest/v1/threads_posts`
    + `?scheduled_date=eq.${date}&slot=eq.${slot}&status=eq.approved&select=*&limit=1`;
  const rows = await (await fetch(q, { headers: svcHeaders() })).json();

  if (!Array.isArray(rows) || !rows.length) {
    res.status(200).json({ ok: true, message: '該当する承認済み投稿はありません', date, slot });
    return;
  }

  const post = rows[0];
  const token = await getToken();
  if (!token) {
    res.status(400).json({ ok: false, message: 'Threadsトークンが未設定です' });
    return;
  }

  try {
    const main = await postThread(token.access_token, token.threads_user_id, post.body);
    if (!main.id) throw new Error('本文の投稿に失敗: ' + JSON.stringify(main));

    let replyId = null;
    if (post.reply_text) {
      const reply = await postThread(token.access_token, token.threads_user_id, post.reply_text, main.id);
      replyId = reply.id || null;
    }

    await fetch(`${SUPABASE_URL}/rest/v1/threads_posts?id=eq.${post.id}`, {
      method: 'PATCH',
      headers: svcHeaders(),
      body: JSON.stringify({
        status: 'posted',
        thread_id: main.id,
        reply_thread_id: replyId,
        posted_at: new Date().toISOString(),
      }),
    });

    res.status(200).json({ ok: true, threadId: main.id, replyId });
  } catch (e) {
    await fetch(`${SUPABASE_URL}/rest/v1/threads_posts?id=eq.${post.id}`, {
      method: 'PATCH',
      headers: svcHeaders(),
      body: JSON.stringify({ status: 'failed', error_message: e.message }),
    });
    res.status(500).json({ ok: false, error: e.message });
  }
};
