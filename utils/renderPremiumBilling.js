// utils/renderPremiumBilling.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "Premium & Billing" ของแดชบอร์ดเว็บ — เพิ่มใหม่ 19 ก.ย. 2569 ตามที่น้องหนาวขอ
// ให้เลือกจ่ายได้ 2 ทางจากหน้าเว็บ: บัตรเครดิต (auto-renew) กับ PromptPay (สแกนจ่าย)
//
// หน้าที่เดียว: เรนเดอร์ HTML string กลับไป ไม่มี logic เรียก Stripe เองในไฟล์นี้เลย
// (route จริงที่สร้าง Checkout Session / Subscription อยู่ใน server.js —
// GET /dashboard/:guildId/premium กับ POST /dashboard/:guildId/premium/checkout)
// แยกไว้แบบนี้เพื่อให้ server.js ไม่ยาวเทอะทะเกินไป ตาม pattern เดียวกับ
// renderOverview.js / renderWelcomeCard.js ที่มีอยู่แล้ว
//
// ⚠️ ข้อความในหน้านี้ทั้งหมดเป็นภาษาอังกฤษล้วนๆ ตามข้อตกลงเรื่องภาษาของหน้าแดชบอร์ด
// (ดูคอมเมนต์ requireGuildAccess ใน server.js) — ต่างจากข้อความในดิสคอร์ด/คอมเมนต์
// โค้ดที่เป็นภาษาไทย
// ─────────────────────────────────────────────────────────────────────────

const { renderDashboardLayout } = require('./dashboardShell');
const { escapeHtml } = require('./renderServerPicker');

/**
 * การ์ด 1 ใบของตัวเลือกวิธีจ่ายเงิน (บัตร / PromptPay) — มีฟอร์ม POST ของตัวเองในตัว
 * กดปุ่ม "Continue" แล้ว submit ฟอร์มธรรมดา (ไม่ใช้ JS/fetch เลย) ไปที่
 * POST /dashboard/:guildId/premium/checkout พร้อม field "method" บอกว่าเลือกทางไหน
 * ทำแบบฟอร์มธรรมดาแทน fetch() เพราะปลายทางคือ "redirect ไปหน้า Stripe" — เบราว์เซอร์
 * ตาม redirect จาก form submit ให้เองอัตโนมัติอยู่แล้ว ไม่ต้องเขียน JS จัดการเอง
 */
function renderPaymentOptionCard({ guildId, method, title, price, badge, badgeColor, description }) {
  return `<div style="flex:1 1 280px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:22px 24px;display:flex;flex-direction:column;">
    <div style="display:inline-flex;align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:0.02em;color:${badgeColor};background:rgba(255,255,255,0.06);padding:4px 10px;border-radius:999px;">${escapeHtml(badge)}</div>
    <div style="font-size:17px;font-weight:700;color:var(--text);margin-top:12px;">${escapeHtml(title)}</div>
    <div style="font-size:20px;font-weight:800;color:var(--text);margin-top:4px;">${escapeHtml(price)}</div>
    <div style="font-size:12.5px;color:var(--text-muted);margin-top:10px;line-height:1.6;flex:1 1 auto;">${escapeHtml(description)}</div>
    <form method="POST" action="/dashboard/${encodeURIComponent(guildId)}/premium/checkout" style="margin-top:16px;">
      <input type="hidden" name="method" value="${escapeHtml(method)}" />
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
 *   ตอน redirect กลับมาจาก POST /premium/checkout ที่ Stripe คืน error มา
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
        <form method="POST" action="/dashboard/${encodeURIComponent(guild.id)}/billing-portal" style="margin-top:18px;">
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

  const bodyHtml = `<div style="padding:44px 56px;">
    <div style="font-size:24px;font-weight:700;color:var(--text);">Premium & Billing</div>
    <div style="font-size:13.5px;color:var(--text-muted);margin-top:8px;max-width:560px;line-height:1.7;">
      ${isPremium ? 'Thanks for supporting Aitao Bot!' : 'Pick how you would like to pay for Premium.'}
    </div>
    <div style="margin-top:26px;">
      ${errorBanner}
      ${statusCard}
    </div>
  </div>`;

  return renderDashboardLayout({
    title: `Premium & Billing — ${guild.name} — Aitao Bot`,
    guild,
    user,
    activeKey: 'premium',
    botAvatarUrl,
    botName,
    bodyHtml,
  });
}

module.exports = { renderPremiumBillingPage };
