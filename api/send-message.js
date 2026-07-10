// 管理ページの「お客様詳細・返信」から、自由入力のメッセージ／画像をお客様へ送る。
// to（LINE userId）が来ればLINE、mail が来ればメールで送る。
// imageUrl（Supabaseの公開URL）が来れば、LINEは画像メッセージ、メールは添付で送る。

const { pushLineMessages } = require('../lib/line');
const { sendMail } = require('../lib/mail');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  const b = req.body || {};
  const text = (b.text == null ? '' : String(b.text));
  const to = b.to;              // LINE userId
  const mail = b.mail;          // メールアドレス
  const imageUrl = b.imageUrl;  // 送る画像の公開URL（任意）
  const subject = b.subject || 'Seed of Color -Micoliss- より';
  if (!text.trim() && !imageUrl) { res.status(200).json({ ok: false, reason: 'no content' }); return; }
  if (!to && !mail) { res.status(200).json({ ok: false, reason: 'no recipient' }); return; }

  // LINE用メッセージ配列（テキスト＋画像を必要な分だけ）
  const messages = [];
  if (text.trim()) messages.push({ type: 'text', text });
  if (imageUrl) messages.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl });

  // メール用の添付
  const attachments = imageUrl ? [{ filename: 'image.jpg', path: imageUrl }] : [];
  const mailText = text.trim() ? text : '画像をお送りします。ご確認ください。';

  try {
    const via = [];
    let detail = null;
    if (to)   { const pr = await pushLineMessages(to, messages);                if (pr.ok) via.push('line'); else detail = 'LINE: ' + (pr.detail || '?'); }
    if (mail) { const mr = await sendMail(mail, subject, mailText, attachments); if (mr.ok) via.push('mail'); else detail = 'MAIL: ' + (mr.detail || '?'); }
    res.status(200).json(via.length ? { ok: true, via: via.join('+') } : { ok: false, reason: 'send error', detail, imageUrl });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception', detail: String((e && e.message) || e) });
  }
};
