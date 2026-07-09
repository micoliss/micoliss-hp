// お客様のメール宛にリマインドを送る共通処理（Gmailから送信）。
// cron-remind.js（自動送信）と send-reminder.js（手動送信）から使う。
// 送信元は山田さんのGmail。Vercelの環境変数 GMAIL_USER / GMAIL_APP_PASSWORD を使う。
// GMAIL_APP_PASSWORD は Googleアカウントの「アプリパスワード」（16桁）を入れること。

const nodemailer = require('nodemailer');

// リマインド種類ごとのメール件名（本文は lib/line.js の文面を流用する）
const SUBJ = {
  soon:   'まもなくご予約のお時間です',
  prev:   '明日はご予約日です',
  today:  '本日はご予約日です',
  thanks: '本日はご来店ありがとうございました',
  follow: 'その後お変わりありませんか',
};
function buildSubject(type) {
  return `${SUBJ[type] || 'ご予約について'}｜Seed of Color -Micoliss-`;
}

let _tx = null;
function transport() {
  if (_tx) return _tx;
  _tx = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  return _tx;
}

// 1通メール送信。成功なら {ok:true}。設定が無ければ送らず {ok:false}。
async function sendMail(to, subject, text) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return { ok: false, detail: 'no gmail credentials' };
  }
  if (!to) return { ok: false, detail: 'no recipient' };
  try {
    await transport().sendMail({
      from: `"Seed of Color -Micoliss-" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: String((e && e.message) || e) };
  }
}

module.exports = { sendMail, buildSubject };
