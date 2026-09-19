// utils/renderPremiumBilling.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "เลือกวิธีจ่ายเงิน Premium" ของเซิร์ฟหนึ่งๆ — เพิ่มใหม่ 19 ก.ย. 2569 ตามที่น้องหนาว
// ขอให้เลือกจ่ายได้ 2 ทางจากหน้าเว็บ: บัตรเครดิต (auto-renew) กับ PromptPay (สแกนจ่าย)
//
// 🔄 อัปเดต (19 ก.ย. 2569 ดึกมาก) — 2 จุดตามที่น้องหนาวขอหลังทดสอบจริง:
//   1) ย้ายหน้านี้ออกจาก "แดชบอร์ด" (เดิม renderDashboardLayout() ห่อด้วย sidebar 8 เมนู
//      แบบเดียวกับหน้าตั้งค่าการ์ดต้อนรับ/ฟอนต์ ฯลฯ) เพราะน้องหนาวรู้สึกว่าซ้ำกับหน้า
//      Pricing สาธารณะที่มีอยู่แล้ว ("มันจะแปลก เดี๋ยวโผล่ทั้ง pricing ทั้งหน้านี้") —
//      ตอนนี้เขียนเป็นหน้า "standalone" ธีมเดียวกับ public/pricing.html แทน (ใช้จานสี
//      :root ชุดเดียวกันเป๊ะ ก๊อปมาจาก renderServerPicker.js) ไม่มี sidebar 8 เมนูอีกแล้ว
//      จุดเข้าถึงหน้านี้ตอนนี้คือ: ปุ่ม "Subscribe to Premium" ที่หน้า Pricing →
//      GET /premium/start (เลือกเซิร์ฟ ถ้ามีหลายเซิร์ฟ) → หน้านี้ (GET /premium/:guildId)
//   2) เพิ่มช่องกรอก "โค้ดส่วนลด" ในฟอร์มทั้ง 2 ใบ (บัตร/PromptPay) — ก่อนหน้านี้หน้าเว็บ
//      ไม่มีช่องให้กรอกเลย (มีแต่ในดิสคอร์ดผ่านปุ่ม "มีโค้ดส่วนลด?") น้องหนาวทักว่า
//      "เหมือนจะไม่มีให้กรอกโค้ดส่วนลดรึเปล่าคะ" — เพิ่มแล้ว ไม่บังคับกรอก เว้นว่างไว้ก็
//      สมัครราคาเต็มได้ปกติ (ตรวจสอบ/แนบส่วนลดจริงอยู่ใน POST /premium/:guildId/checkout
//      ที่ server.js — ไฟล์นี้แค่เรนเดอร์ HTML ไม่มี logic เรียก Stripe เอง)
//
// ⚠️ ข้อความในหน้านี้ทั้งหมดเป็นภาษาอังกฤษล้วนๆ ให้เข้าชุดกับหน้า Pricing สาธารณะ (ต่างจาก
// ข้อความในดิสคอร์ด/คอมเมนต์โค้ดที่เป็นภาษาไทย)
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');

/**
 * การ์ด 1 ใบของตัวเลือกวิธีจ่ายเงิน (บัตร / PromptPay) — มีฟอร์ม POST ของตัวเองในตัว
 * รวมช่อง "โค้ดส่วนลด (ถ้ามี)" ไว้ในฟอร์มเดียวกันด้วย — กดปุ่ม "Continue" แล้ว submit
 * ฟอร์มธรรมดา (ไม่ใช้ JS/fetch เลย) ไปที่ POST /premium/:guildId/checkout พร้อม field
 * "method" กับ "discountCode" ทำแบบฟอร์มธรรมดาแทน fetch() เพราะปลายทางคือ "redirect ไปหน้า
 * Stripe" — เบราว์เซอร์ตาม redirect จาก form submit ให้เองอัตโนมัติอยู่แล้ว ไม่ต้องเขียน JS
 *
 * 🆕 ทำไมมีช่อง discountCode "แยกกัน" ในฟอร์มทั้ง 2 ใบ แทนที่จะมีช่องเดียวใช้ร่วมกัน?
 * เพราะแต่ละการ์ดเป็นคนละ <form> HTML กัน (ปุ่ม "Continue" ของแต่ละใบ submit ไปคนละครั้ง)
 * ฟิลด์ input ทั่วไปเป็นของ <form> ที่มันซ้อนอยู่ข้างในได้แค่อันเดียว จะให้ 2 ฟอร์มมาแชร์
 * ช่องเดียวกันต้องใช้ JavaScript คอยซิงก์ค่า ซึ่งเพิ่มความซับซ้อนโดยไม่จำเป็น — แยกช่องแต่ละ
 * ใบไปเลยง่ายกว่า (จะกรอกโค้ดตอนเลือกทางไหนก็กรอกในช่องของทางนั้น)
 */
function renderPaymentOptionCard({ guildId, method, title, price, badge, badgeColor, description }) {
  return `<div style="flex:1 1 280px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:22px 24px;display:flex;flex-direction:column;">
    <div style="display:inline-flex;align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:0.02em;color:${badgeColor};background:rgba(255,255,255,0.06);padding:4px 10px;border-radius:999px;">${escapeHtml(badge)}</div>
    <div style="font-size:17px;font-weight:700;color:var(--text);margin-top:12px;">${escapeHtml(title)}</div>
    <div style="font-size:20px;font-weight:800;color:var(--text);margin-top:4px;">${escapeHtml(price)}</div>
    <div style="font-size:12.5px;color:var(--text-muted);margin-top:10px;line-height:1.6;flex:1 1 auto;">${escapeHtml(description)}</div>
    <form method="POST" action="/premium/${encodeURIComponent(guildId)}/checkout" style="margin-top:16px;display:flex;flex-direction:column;gap:10px;">
      <input type="hidden" name="method" value="${escapeHtml(method)}" />
      <label style="display:flex;flex-direction:column;gap:5px;">
        <span style="font-size:11px;font-weight:600;color:var(--text-muted);">Discount code (optional)</span>
        <input type="text" name="discountCode" placeholder="e.g. KITTY10" maxlength="20"
          style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:9px 11px;border-radius:8px;text-transform:uppercase;" />
      </label>
      <button type="submit" style="width:100%;background:var(--accent);border:none;color:#0a0e1a;font-size:13px;font-weight:700;padding:11px 18px;border-radius:9px;cursor:pointer;">Continue</button>
    </form>
  </div>`;
}

/**
 * @param {object} params
 * @param {{id:string, name:string, iconUrl:string|null}} params.guild
 * @param {object} params.user - req.session.user (ดึงมาจากตอน login OAuth)
 * @param {string} params.botAvatarUrl
 * @param {string} params.botName
 * @param {'free'|'premium'} params.tier
 * @param {{stripeCustomerId:string, stripeSubscriptionId:string, currentPeriodEnd:string|null}|null} params.subscriptionInfo
 * @param {string|null} [params.errorMessage] - ข้อความ error จาก query string (ถ้ามี) เช่น
 *   ตอน redirect กลับมาจาก POST /premium/:guildId/checkout ที่ Stripe/การตรวจโค้ดคืน error มา
 * @returns {string} HTML เต็มหน้า พร้อม res.send() ได้เลย
 */
function renderPremiumBillingPage({ guild, user, botAvatarUrl, botName, tier, subscriptionInfo, errorMessage }) {
  const isPremium = tier === 'premium';
  const renewDate = subscriptionInfo?.currentPeriodEnd
    ? new Date(subscriptionInfo.currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const errorBanner = errorMessage
    ? `<div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;padding:12px 16px;border-radius:10px;font-size:13px;margin-bottom:20px;max-width:680px;">${escapeHtml(errorMessage)}</div>`
    : '';

  const statusCard = isPremium
    ? `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:24px 28px;max-width:680px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="width:8px;height:8px;border-radius:50%;background:#57f287;display:inline-block;"></span>
          <span style="font-size:15px;font-weight:700;color:var(--text);">Premium is active</span>
        </div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:8px;">
          ${renewDate ? `Renews on ${escapeHtml(renewDate)}.` : 'Your renewal date will appear here once the first payment is confirmed.'}
        </div>
        <form method="POST" action="/premium/${encodeURIComponent(guild.id)}/billing-portal" style="margin-top:18px;">
          <button type="submit" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;font-weight:600;padding:10px 18px;border-radius:9px;cursor:pointer;">Manage subscription</button>
        </form>
      </div>`
    : `<div style="display:flex;gap:20px;flex-wrap:wrap;max-width:800px;">
        ${renderPaymentOptionCard({
          guildId: guild.id,
          method: 'card',
          title: 'Credit / Debit Card',
          price: '$2.99 / month',
          badge: 'Auto-renews',
          badgeColor: 'var(--accent)',
          description: 'Charged automatically every month through Stripe. Cancel anytime from this page.',
        })}
        ${renderPaymentOptionCard({
          guildId: guild.id,
          method: 'promptpay',
          title: 'PromptPay QR',
          price: '฿89 / month',
          badge: 'Scan each month',
          badgeColor: 'var(--gold)',
          description: "Stripe sends a fresh QR code every billing cycle — scan it with your banking app to pay. It doesn't auto-charge like a card, so you'll need to come back and scan again each month.",
        })}
      </div>`;

  // 🆕 แถวหัวข้อ "เซิร์ฟไหน" — โชว์ไอคอน+ชื่อเซิร์ฟให้ชัดเจนว่ากำลังซื้อพรีเมียมให้เซิร์ฟไหนอยู่
  // (จำเป็นเพราะตอนนี้ไม่มี sidebar/guild switcher ให้เห็น context แบบหน้าแดชบอร์ดอื่นๆ แล้ว)
  const guildIconHtml = guild.iconUrl
    ? `<img src="${escapeHtml(guild.iconUrl)}" alt="" style="width:28px;height:28px;border-radius:8px;object-fit:cover;" />`
    : `<div style="width:28px;height:28px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);"></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Premium & Billing — ${escapeHtml(guild.name)} — Aitao Bot</title>
<style>
  :root {
    --bg: #0a0e1a;
    --bg-card: #131a2e;
    --border: #262f4d;
    --text: #f3f1fb;
    --text-muted: #9aa2c4;
    --text-muted-2: #8890b0;
    --accent: #7c83fd;
    --accent-hover: #5f65e0;
    --gold: #f4b860;
    --teal: #52c7c0;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Sarabun', sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  a { text-decoration: none; }
  input::placeholder { color: var(--text-muted-2); }
  input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

  .topbar {
    height: 72px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
  }
  @media (min-width: 640px) { .topbar { padding: 0 48px; } }
  .topbar-brand { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: var(--text); text-decoration: none; }
  .topbar-brand img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
  .topbar-right { display: flex; align-items: center; gap: 24px; }
  .topbar-right span { font-size: 13px; color: var(--text-muted); }
  .topbar-right a { font-size: 13px; color: var(--text-muted); }
  .topbar-right a:hover { color: var(--text); text-decoration: underline; }

  main { max-width: 800px; margin: 0 auto; padding: 40px 20px 56px; }
  @media (min-width: 640px) { main { padding: 44px 48px 64px; } }
</style>
</head>
<body>
  <div class="topbar">
    <a href="/pricing" class="topbar-brand">
      <img src="${escapeHtml(botAvatarUrl)}" alt="" />
      <span>${escapeHtml(botName)}</span>
    </a>
    <div class="topbar-right">
      <span>${escapeHtml(user.username)}</span>
      <a href="/auth/logout">Log out</a>
    </div>
  </div>

  <main>
    <a href="/premium/start" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--text-muted);">&larr; Choose a different server</a>

    <div style="display:flex;align-items:center;gap:10px;margin-top:18px;">
      ${guildIconHtml}
      <span style="font-size:13px;color:var(--text-muted);">Premium for <strong style="color:var(--text);">${escapeHtml(guild.name)}</strong></span>
    </div>

    <div style="font-size:24px;font-weight:700;color:var(--text);margin-top:10px;">Premium & Billing</div>
    <div style="font-size:13.5px;color:var(--text-muted);margin-top:8px;max-width:560px;line-height:1.7;">
      ${isPremium ? 'Thanks for supporting Aitao Bot!' : 'Pick how you would like to pay for Premium.'}
    </div>
    <div style="margin-top:26px;">
      ${errorBanner}
      ${statusCard}
    </div>
  </main>
</body>
</html>`;
}

module.exports = { renderPremiumBillingPage };
