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

// メニューID → カテゴリ（look=外見 / inner=内面 / health=健康）。reserve.html の対応と合わせる。
const MENU_CAT = {
  basic: 'look', total: 'look', facetype: 'look', glasses: 'look', mens: 'look', shopping: 'look',
  'bridal-total': 'look', 'bridal-face': 'look', 'bridal-shop': 'look',
  seed: 'inner', shuhi: 'inner', birth: 'inner', tentai: 'inner',
  kassa: 'health', pemf: 'health', deeprelax: 'health', galaxy: 'health', shaken: 'health', thzwand: 'health',
};
function catOf(menuId) { return MENU_CAT[menuId] || 'look'; }
// 前日リマインドはメニューのカテゴリ別テンプレートに振り分ける（内面=prev_inner / 健康=prev_health / それ以外=prev）
function settingsKey(type, menuId) {
  if (type === 'prev') {
    const c = catOf(menuId);
    if (c === 'inner') return 'prev_inner';
    if (c === 'health') return 'prev_health';
  }
  return type;
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
      return `${sama}\n\nまもなくご予約のお時間です🌿\n\n📅 本日 ${b.time || ''}〜\n💠 ${menu}\n\n📍 〒950-2024\n新潟県新潟市西区小新西3丁目6-3\n（小針駅から車で約8分・小新ICから車で約3分）\n\nお気をつけてお越しくださいませ。\n道に迷われた際や、遅れそうな場合はお電話ください。\n📞 080-3128-3319\n\nSeed of Color -Micoliss-`;
    case 'prev':
      return `${sama}\n\n明日はご予約日です🌿\n\n📅 ${when}〜\n💠 ${menu}\n\nお気をつけてお越しくださいませ。\n変更・キャンセルはこのままご返信ください。\n\nSeed of Color -Micoliss-`;
    case 'prev_inner':
      return `${sama}\n\n明日はご予約日です🌿\n\n📅 ${when}〜\n💠 ${menu}\n\n━━━━━━━━━━━━━\n● セッションでは、その場で計算やメモをとることがあります。電卓・筆記用具をお持ちください（スマートフォンの電卓でもOKです）。\n● 生年月日など、鑑定に必要な情報はご予約時に伺っております。\n━━━━━━━━━━━━━\n\nお気をつけてお越しくださいませ。\n変更・キャンセルはこのままご返信ください。\n\nSeed of Color -Micoliss-`;
    case 'prev_health':
      return `${sama}\n\n明日はご予約日です🌿\n\n📅 ${when}〜\n💠 ${menu}\n\n━━━━━━━━━━━━━\n● リラックスできる、ゆったりとした服装でお越しください。かっさでは首元にオイルを塗布しますので、首元がゆったりとしたお洋服（ボタンで開けられるものなど）がおすすめです。\n● 施術前後は、激しい運動やお酒を控えめにされるとより心地よくお過ごしいただけます。\n● 妊娠中の方、ペースメーカーをご使用の方、通院・持病のある方は、安全のため施術をお受けいただけない場合がございます。ご予約前に、事前にご相談ください。\n━━━━━━━━━━━━━\n\nお気をつけてお越しくださいませ。\n変更・キャンセルはこのままご返信ください。\n\nSeed of Color -Micoliss-`;
    case 'today':
      return `${sama}\n\n本日はご予約日です🌿\n\n📅 ${when}〜\n💠 ${menu}\n\nお会いできるのを楽しみにお待ちしております。\n\nSeed of Color -Micoliss-`;
    case 'thanks':
      return `${sama}\n\n昨日はお越しくださって、ありがとうございました🌿\n\nお伝えした内容が、これからの毎日でお役に立てばうれしいです。\nまたお会いできる日を、楽しみにしております。\n\n気になるメニューや次回のご予約は、こちらからいつでもご連絡ください🌷\n\nSeed of Color -Micoliss-`;
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

// 🔔設定に保存された画像URL（改行区切り）を配列にする。
// LINEは1回の送信で5通までなので、テキスト1通ぶんを空けて最大4枚に切り詰める。
const MAX_IMAGES = 4;
function parseImageUrls(v) {
  const list = Array.isArray(v) ? v : String(v == null ? '' : v).split('\n');
  return list.map(s => String(s).trim()).filter(Boolean).slice(0, MAX_IMAGES);
}

// テキスト＋画像を、LINEのメッセージ配列とメールの添付配列の両方に組み立てる。
function buildPayload(text, imageUrls) {
  const imgs = parseImageUrls(imageUrls);
  const messages = [{ type: 'text', text }]
    .concat(imgs.map(u => ({ type: 'image', originalContentUrl: u, previewImageUrl: u })));
  const attachments = imgs.map((u, i) => ({ filename: `image${i + 1}.jpg`, path: u }));
  return { messages, attachments };
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

module.exports = { SUPABASE_URL, issueToken, pushLine, pushLineMessages, svcHeaders, whenLabel, buildText, renderTemplate, fetchSettings, parseImageUrls, buildPayload, catOf, settingsKey };
