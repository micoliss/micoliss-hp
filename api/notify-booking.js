// 新規予約・キャンセルが入った時に、お店（オーナー）のLINEへ通知を送る。
// 予約ページ(reserve.html)・管理ページ(admin.html)から呼ばれる。
// トークンは15分で消える使い捨て方式なので、Lメッセージの長期トークンには影響しない。

async function issueToken() {
  const r = await fetch('https://api.line.me/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.LINE_CHANNEL_ID,
      client_secret: process.env.LINE_CHANNEL_SECRET,
    }),
  });
  const j = await r.json();
  return j.access_token;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  const to = process.env.OWNER_LINE_USER_ID;
  if (!to || !process.env.LINE_CHANNEL_ID) {
    res.status(200).json({ ok: false, reason: 'not configured' }); return;
  }
  const b = req.body || {};
  const kind = b.kind === 'cancel' ? '❌ キャンセル' : '🆕 新規予約';
  const lines = [
    `${kind}が入りました`,
    '',
    `📅 ${b.date || '?'} ${b.time || ''}`,
    `👤 ${b.name || '?'} 様${b.first === 'はじめて' ? '（新規）' : ''}`,
    `💠 ${b.menu_name || '?'}`,
    b.tel ? `📞 ${b.tel}` : '',
    b.note ? `📝 ${b.note}` : '',
  ].filter(Boolean);

  try {
    const token = await issueToken();
    const r = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: 'text', text: lines.join('\n') }] }),
    });
    res.status(200).json({ ok: r.ok });
  } catch (e) {
    res.status(200).json({ ok: false });
  }
};
