// LINE Messaging API のWebhook受け口。
// Lメッセージから切り替えた後、友だち追加・メッセージ受信などの出来事がここに届く。
// 届いた内容はSupabaseの line_events テーブルに保存する（後で自動応答などに使う）。
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://efortdqqqeclshcquqbu.supabase.co';

module.exports = async (req, res) => {
  // LINEの接続確認(GET)には常にOKを返す
  if (req.method !== 'POST') { res.status(200).send('ok'); return; }
  // URLに正しい合言葉(key)が付いていない呼び出しは拒否
  if (!process.env.LINE_WEBHOOK_KEY || req.query.key !== process.env.LINE_WEBHOOK_KEY) {
    res.status(403).send('forbidden'); return;
  }
  const events = (req.body && req.body.events) || [];
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (key && events.length) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/line_events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify(events.map(e => ({ payload: e }))),
      });
    } catch (_) { /* 保存に失敗してもLINEには200を返す（再送ループ防止） */ }
  }
  res.status(200).send('ok');
};
