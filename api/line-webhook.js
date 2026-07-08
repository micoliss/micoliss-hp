// LINE Messaging API のWebhook受け口。
// Lメッセージから切り替えた後、友だち追加・メッセージ受信などの出来事がここに届く。
// 届いた内容はSupabaseの line_events テーブルに保存する（後で自動応答などに使う）。
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://efortdqqqeclshcquqbu.supabase.co';

// 使い捨てトークンを発行してLINEに返信する（Lメッセージの長期トークンに影響しない）
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
  return (await r.json()).access_token;
}
async function reply(replyToken, text) {
  const token = await issueToken();
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
}

// 合言葉（6桁）を、まだ未連携の予約に紐づけて、お客様のuserIdを保存する。
// 見つかれば予約者名を返す。見つからなければ null。
async function linkByCode(code, userId) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return null;
  const h = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
  // 該当コードで、まだ誰にも紐づいていない予約を探す
  const q = `${SUPABASE_URL}/rest/v1/reservations?link_code=eq.${encodeURIComponent(code)}`
    + `&line_user_id=is.null&status=neq.cancelled&select=id,name&limit=1`;
  const found = await (await fetch(q, { headers: h })).json();
  if (!Array.isArray(found) || !found.length) return null;
  const rid = found[0].id;
  // その予約にuserIdを書き込む（Preferで結果を受け取る）
  const up = await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${encodeURIComponent(rid)}`, {
    method: 'PATCH',
    headers: { ...h, Prefer: 'return=representation' },
    body: JSON.stringify({ line_user_id: userId }),
  });
  const rows = await up.json();
  return (Array.isArray(rows) && rows[0]) ? rows[0].name : null;
}

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

  // テキストメッセージへの応答
  for (const ev of events) {
    if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text' || !ev.replyToken) continue;
    const text = ev.message.text.trim();
    const userId = ev.source && ev.source.userId;
    try {
      // 「ID確認」→ その人自身のLINEユーザーIDを返信（オーナーの設定用）
      if (text === 'ID確認') {
        await reply(ev.replyToken, `あなたのユーザーIDは\n${userId}\nです。`);
        continue;
      }
      // 6桁の数字＝予約完了画面の合言葉 → 予約に紐づける
      if (/^\d{6}$/.test(text) && userId) {
        const name = await linkByCode(text, userId);
        if (name) {
          await reply(ev.replyToken, `${name}様、ご予約とLINEを連携しました。\n前日・当日にリマインドをお送りします🌿`);
        } else {
          await reply(ev.replyToken, 'この合言葉に合うご予約が見つかりませんでした。\n数字が正しいか、予約完了画面の合言葉をもう一度ご確認ください。');
        }
        continue;
      }
    } catch (_) { /* 返信に失敗してもLINEには200を返す */ }
  }
  res.status(200).send('ok');
};
