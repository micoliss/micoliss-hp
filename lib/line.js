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

// お客様のLINEへ任意のメッセージ配列をpush（テキスト・画像など）。成功なら {ok:true}
async function pushLineMessages(to, messages) {
  const token = await issueToken();
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  });
  if (r.ok) return { ok: true };
  return { ok: false, detail: await r.text() };
}

// お客様のLINEへテキスト1通push。成功なら {ok:true}
async function pushLine(to, text) {
  return pushLineMessages(to, [{ type: 'text', text }]);
}

// SupabaseのREST用ヘッダ（サービスキー＝RLSを越えて読み書きできる）
function svcHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

// Googleクチコミの投稿リンク（お礼メッセージ等で {review} でも差し込める）
const REVIEW_URL = 'https://g.page/r/CeCm_qCnVpL1EAE/review';

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
      return `${sama}\n\nまもなくご予約のお時間です🌿\n\n📅 本日 ${b.time || ''}〜\n💠 ${menu}\n\n📍 〒950-2024\n新潟県新潟市西区小新西3丁目6-3\n（小針駅から車で約8分）\n\nお気をつけてお越しくださいませ。\n道に迷われた際や、遅れそうな場合はお電話ください。\n📞 080-3128-3319\n\nSeed of Color -Micoliss-`;
    case 'prev':
      return `${sama}\n\n明日はご予約日です🌿\n\n📅 ${when}〜\n💠 ${menu}\n\nお気をつけてお越しくださいませ。\n変更・キャンセルはこのままご返信ください。\n\nSeed of Color -Micoliss-`;
    case 'today':
      return `${sama}\n\n本日はご予約日です🌿\n\n📅 ${when}〜\n💠 ${menu}\n\nお会いできるのを楽しみにお待ちしております。\n\nSeed of Color -Micoliss-`;
    case 'thanks':
      return `${sama}\n\n本日はご来店ありがとうございました🌿\n\n診断の内容でご不明な点があれば、いつでもこちらへご連絡ください。\nまたお会いできる日を楽しみにしております。\n\nもしよろしければ、Googleのクチコミで感想をお聞かせいただけると、とても励みになります🌷\n▼クチコミはこちらから\n${REVIEW_URL}\n\nSeed of Color -Micoliss-`;
    case 'follow':
      return `${sama}\n\nその後、お過ごしはいかがでしょうか🌿\n先日の診断が毎日のお役に立っていれば嬉しいです。\n\nメニューのご相談やご予約はこのままご返信ください。\n\nSeed of Color -Micoliss-`;
    default:
      return null;
  }
}

// 管理ページで編集した文面テンプレートに、予約情報を差し込む。
// 使える差し込み: {name} 氏名 / {date} 日付(曜日・時刻つき) / {time} 開始時刻 / {menu} メニュー名
function renderTemplate(tpl, b) {
  const when = whenLabel(b.date, b.time);
  const menu = b.menu_name ? `「${b.menu_name}」` : 'ご予約';
  return String(tpl == null ? '' : tpl)
    .split('{name}').join(b.name || 'お客')
    .split('{date}').join(when)
    .split('{time}').join(b.time || '')
    .split('{menu}').join(menu)
    .split('{review}').join(REVIEW_URL);
}

// reminder_settings テーブル（管理ページの設定）を type をキーにした形で読む。
// 取れなければ {} を返す（呼び出し側が既定値でフォールバックする）。
async function fetchSettings(headers) {
  try {
    const rows = await (await fetch(`${SUPABASE_URL}/rest/v1/reminder_settings?select=*`, { headers })).json();
    const map = {};
    if (Array.isArray(rows)) for (const r of rows) map[r.type] = r;
    return map;
  } catch (e) { return {}; }
}

module.exports = { SUPABASE_URL, issueToken, pushLine, pushLineMessages, svcHeaders, whenLabel, buildText, renderTemplate, fetchSettings };
