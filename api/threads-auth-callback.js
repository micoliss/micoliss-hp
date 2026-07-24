// Threadsの許可画面から戻ってくる先。認可コードをトークンに交換してSupabaseに保存する。
const { saveToken } = require('../lib/threads');

module.exports = async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.status(400).send('code がありません。もう一度 /api/threads-auth-start からやり直してください。');
    return;
  }

  const redirectUri = 'https://micoliss-hp.vercel.app/api/threads-auth-callback';

  try {
    // 1. 認可コード → 短期トークン
    const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.THREADS_APP_ID,
        client_secret: process.env.THREADS_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      res.status(400).send('トークン取得に失敗しました: ' + JSON.stringify(tokenData));
      return;
    }

    // 2. 短期トークン → 長期トークン（60日）
    const longLivedUrl = `https://graph.threads.net/access_token?grant_type=th_exchange_token`
      + `&client_secret=${process.env.THREADS_APP_SECRET}`
      + `&access_token=${tokenData.access_token}`;
    const longLivedRes = await fetch(longLivedUrl);
    const longLived = await longLivedRes.json();
    if (!longLived.access_token) {
      res.status(400).send('長期トークン取得に失敗しました: ' + JSON.stringify(longLived));
      return;
    }

    const expiresAt = new Date(Date.now() + longLived.expires_in * 1000).toISOString();
    await saveToken({
      accessToken: longLived.access_token,
      threadsUserId: tokenData.user_id,
      expiresAt,
    });

    res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
        <h1>✅ Threads連携が完了しました</h1>
        <p>この画面はもう閉じて大丈夫です。</p>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('エラーが発生しました: ' + e.message);
  }
};
