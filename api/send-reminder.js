// 管理ページ(admin.html)から、お客様のLINEへリマインドを送る。
// 送信内容は type（前日/当日/お礼/フォロー）と予約情報から組み立てる。
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
  return (await r.json()).access_token;
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
function whenLabel(date, time) {
  if (!date) return '';
  const wd = WD[new Date(date).getDay()] || '';
  return `${date.replace(/-/g, '/')}（${wd}）${time || ''}`;
}

// type ごとのメッセージ本文を組み立てる
function buildText(type, b) {
  const sama = `${b.name || 'お客'}様`;
  const when = whenLabel(b.date, b.time);
  const menu = b.menu_name ? `「${b.menu_name}」` : 'ご予約';
  switch (type) {
    case 'prev':
      return `${sama}\n\n明日はご予約日です🌿\n\n📅 ${when}〜\n💠 ${menu}\n\nお気をつけてお越しくださいませ。\n変更・キャンセルはこのままご返信ください。\n\nSeed of Color -Micoliss-`;
    case 'today':
      return `${sama}\n\n本日はご予約日です🌿\n\n📅 ${when}〜\n💠 ${menu}\n\nお会いできるのを楽しみにお待ちしております。\n\nSeed of Color -Micoliss-`;
    case 'thanks':
      return `${sama}\n\n本日はご来店ありがとうございました🌿\n\n診断の内容でご不明な点があれば、いつでもこちらへご連絡ください。\nまたお会いできる日を楽しみにしております。\n\nSeed of Color -Micoliss-`;
    case 'follow':
      return `${sama}\n\nその後、お過ごしはいかがでしょうか🌿\n先日の診断が毎日のお役に立っていれば嬉しいです。\n\nメニューのご相談やご予約はこのままご返信ください。\n\nSeed of Color -Micoliss-`;
    default:
      return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  if (!process.env.LINE_CHANNEL_ID || !process.env.LINE_CHANNEL_SECRET) {
    res.status(200).json({ ok: false, reason: 'not configured' }); return;
  }
  const b = req.body || {};
  const to = b.to;
  const text = buildText(b.type, b);
  if (!to) { res.status(200).json({ ok: false, reason: 'no line user' }); return; }
  if (!text) { res.status(200).json({ ok: false, reason: 'bad type' }); return; }

  try {
    const token = await issueToken();
    const r = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    });
    if (!r.ok) {
      const detail = await r.text();
      res.status(200).json({ ok: false, reason: 'line error', detail });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception' });
  }
};
