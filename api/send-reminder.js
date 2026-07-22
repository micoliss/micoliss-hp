// 管理ページ(admin.html)から、お客様へリマインドを手動送信する。
// LINE連携済みならLINE、そうでなければメール（mail宛）で送る。
// 文面は reminder_settings（管理ページで編集したテンプレート）を優先し、無ければ既定文面。

const { buildText, pushLineMessages, renderTemplate, fetchSettings, svcHeaders, buildPayload, settingsKey } = require('../lib/line');
const { sendMail, buildSubject } = require('../lib/mail');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  const b = req.body || {};
  const to = b.to;       // LINE userId
  const mail = b.mail;   // メールアドレス
  if (!to && !mail) { res.status(200).json({ ok: false, reason: 'no recipient' }); return; }

  // 文面・画像：管理ページの設定があればそれを使い、無ければ既定文面（画像なし）
  // 前日リマインドは予約メニューのカテゴリ（外見/内面/健康）で文面を出し分ける
  const key = settingsKey(b.type, b.menu_id);
  let text, imageUrls;
  try {
    const s = (await fetchSettings(svcHeaders()))[key];
    text = s && s.template ? renderTemplate(s.template, b) : buildText(key, b);
    imageUrls = s && s.image_urls;
  } catch (e) {
    text = buildText(key, b);
  }
  if (!text) { res.status(200).json({ ok: false, reason: 'bad type' }); return; }

  try {
    const via = [];
    const { messages, attachments } = buildPayload(text, imageUrls);
    if (to)   { const pr = await pushLineMessages(to, messages);                     if (pr.ok) via.push('line'); }
    if (mail) { const mr = await sendMail(mail, buildSubject(b.type), text, attachments); if (mr.ok) via.push('mail'); }
    res.status(200).json(via.length ? { ok: true, via: via.join('+') } : { ok: false, reason: 'send error' });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception' });
  }
};
