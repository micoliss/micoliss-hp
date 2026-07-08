// LINE送信とSupabaseアクセスの共通処理。
// send-reminder.js（手動送信）と cron-remind.js（自動送信）から使う。
// リマインドの文面はここ（buildText）に1か所だけ置く＝直すときはここだけ直せばOK。

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://efortdqqqeclshcquqbu.supabase.co';

// 使い捨てトークン（15分で消える。Lメッセージの長期トークンに影響しない）
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

// お客様のLINEへ1通push。成功なら {ok:true}
async function pushLine(to, text) {
  const token = await issueToken();
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
  if (r.ok) return { ok: true };
  return { ok: false, detail: await r.text() };
}

// SupabaseのREST用ヘッダ（サービスキー＝RLSを越えて読み書きできる）
function svcHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
function whenLabel(date, time) {
  if (!date) return '';
  const wd = WD[new Date(date).getDay()] || '';
  return `${date.replace(/-/g, '/')}（${wd}）${time || ''}`;
}

// type ごとのメッセージ本文（ここを直せば手動・自動どちらの文面も変わる）
function buildText(type, b) {
  const sama = `${b.name || 'お客'}様`;
  const when = whenLabel(b.date, b.time);
  const menu = b.menu_name ? `「${b.menu_name}」` : 'ご予約';
  switch (type) {
    case 'soon':
      return `${sama}\n\nまもなくご予約のお時間です🌿\n\n📅 本日 ${b.time || ''}〜\n💠 ${menu}\n\nお気をつけてお越しくださいませ。\nお近くまで来られたらこのままご返信いただいても大丈夫です。\n\nSeed of Color -Micoliss-`;
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

module.exports = { SUPABASE_URL, issueToken, pushLine, svcHeaders, whenLabel, buildText };
