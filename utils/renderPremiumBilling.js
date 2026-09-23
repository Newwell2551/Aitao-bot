// utils/renderPremiumBilling.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "เลือกวิธีจ่ายเงิน Premium" ของเซิร์ฟหนึ่งๆ — เพิ่มใหม่ 19 ก.ย. 2569 ตามที่น้องหนาว
// ขอให้เลือกจ่ายได้ 2 ทางจากหน้าเว็บ: บัตรเครดิต (auto-renew) กับ PromptPay (สแกนจ่าย)
//
// 🔄 อัปเดต (19 ก.ย. 2569 ดึกมาก) — 2 จุดตามที่น้องหนาวขอหลังทดสอบจริง:
//   1) ย้ายหน้านี้ออกจาก "แดชบอร์ด" มาเป็นหน้า "standalone" ธีมเดียวกับ public/pricing.html
//   2) เพิ่มช่องกรอก "โค้ดส่วนลด" ในฟอร์ม
//
// 🆕🆕 อัปเดตใหญ่ (23 ก.ย. 2569) — รีดีไซน์หน้าเลือกวิธีจ่ายเงินทั้งหมดตามที่น้องหนาวขอ:
//   1) เอาอิโมจิกาแฟ ☕ ออกจากปุ่ม "Subscribe to Premium" แล้ว (แก้ที่ public/pricing.html)
//   2) เปลี่ยน layout เป็น 2 คอลัมน์บนจอกว้าง — ซ้าย: หัวข้อ+ข้อมูลเซิร์ฟ (เลื่อนลงมานิดหน่อย
//      ตามที่ขอ) / ขวา: กล่องเลือกวิธีจ่ายเงิน
//   3) วิธีจ่ายเงินเปลี่ยนจาก "การ์ด 2 ใบใหญ่ๆ" เป็น "แถวยาวบางๆ" เรียงต่อกัน (คล้าย payment
//      sheet ของแอปมือถือ) แต่ละแถวมีโลโก้/ไอคอนของช่องทางนั้นๆ
//   4) เพิ่มตัวเลือกใหม่: PayPal, Apple Pay, Google Pay, TrueMoney (แบบ "เร็วๆ นี้" ยังกดไม่ได้)
//      รายละเอียดว่าทำไมแต่ละอันทำงานแบบไหน อยู่ในคอมเมนต์ตรงจุดที่ประกาศ PAYMENT_ROWS ด้านล่าง
//   5) รวมช่องกรอกโค้ดส่วนลดจาก "2 ช่องแยกกัน" (เดิมมีในการ์ดบัตร+การ์ด PromptPay) เหลือแค่
//      "ช่องเดียว" ใช้ร่วมกันทุกวิธีจ่าย — ทำได้เพราะรวมทุกปุ่มไว้ใน <form> เดียวกันแล้ว (ดู
//      คอมเมนต์ตรง renderPaymentRow ด้านล่างว่าทำไมใช้ฟอร์มเดียวได้โดยไม่ต้องพึ่ง JavaScript)
//   6) ราคาที่โชว์แก้จาก "$2.99"/"฿89" (ราคาเก่าที่ไม่ตรงกับ Stripe จริงมานานแล้ว) มาดึงจาก
//      utils/premiumPricing.js จุดเดียวแทน กันปัญหาราคาไม่ตรงแบบเดิมอีก
//
// ⚠️ ข้อความในหน้านี้ทั้งหมดเป็นภาษาอังกฤษล้วนๆ ให้เข้าชุดกับหน้า Pricing สาธารณะ (ต่างจาก
// ข้อความในดิสคอร์ด/คอมเมนต์โค้ดที่เป็นภาษาไทย)
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');
const { PREMIUM_PRICE_THB_DISPLAY, getPaypalDisplayPrice, PAYPAL_FEE_SURCHARGE_PERCENT } = require('./premiumPricing');

// ── ไอคอนแต่ละช่องทางจ่ายเงิน ────────────────────────────────────────────
// วาดเป็น inline SVG เองทั้งหมด (ไม่โหลดรูปจากที่อื่น) เพื่อให้หน้าโหลดไวและไม่มีปัญหาโลโก้
// หาย/โหลดไม่ทันเวลาเน็ตช้า — ตั้งใจทำให้ "เรียบง่าย/จำได้" มากกว่าก็อปโลโก้จริงมาเป๊ะๆ
const ICON_CARD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M2 9.5h20" stroke="currentColor" stroke-width="1.7"/><rect x="5" y="13.2" width="5" height="2.2" rx="0.6" fill="currentColor"/></svg>`;
const ICON_APPLE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.7 12.4c0-2.5 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1.9-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.6-.9.9-1.5 1.4-2.6-3.6-1.4-3.8-4.1-3.8-4.1zM14.2 5.2c.7-.8 1.1-2 1-3.2-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.3z"/></svg>`;
const ICON_GOOGLE = `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z"/><path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.4l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.6l4 3.1c.9-2.8 3.5-4.9 6.6-4.9z"/></svg>`;
const ICON_PAYPAL = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M8.5 19.5l1.8-11.4c.2-1.2 1.2-2.1 2.4-2.1h4.1c2.6 0 4.4 1.7 4 4.2-.5 3-2.9 4.8-5.9 4.8h-2l-.9 5.5-3.5-1z" fill="#003087"/><path d="M6 19.5l1.8-11.4C8 6.9 9 6 10.2 6h4.1c2.6 0 4.4 1.7 4 4.2-.5 3-2.9 4.8-5.9 4.8h-2l-.9 5.5-3.5-1z" fill="#009cde" opacity="0.85"/></svg>`;
const ICON_PROMPTPAY = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.2" stroke="#f4b860" stroke-width="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.2" stroke="#f4b860" stroke-width="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.2" stroke="#f4b860" stroke-width="1.8"/><rect x="15.3" y="15.3" width="2.2" height="2.2" fill="#f4b860"/><rect x="19" y="15.3" width="2.2" height="2.2" fill="#f4b860"/><rect x="15.3" y="19" width="2.2" height="2.2" fill="#f4b860"/><rect x="19" y="19" width="2.2" height="2.2" fill="#f4b860"/></svg>`;
const ICON_WALLET = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M2.5 9.5h19" stroke="currentColor" stroke-width="1.7"/><circle cx="17.5" cy="13.5" r="1.4" fill="currentColor"/></svg>`;

/**
 * รายชื่อแถวช่องทางจ่ายเงินที่โชว์บนหน้านี้ (เรียงจากบนลงล่างตามลำดับนี้เป๊ะๆ)
 *
 * 🔑 จุดสำคัญที่สุดของรายการนี้: field "method" คือค่าที่จะส่งไป POST /premium/:guildId/checkout
 * (ตรงกับ req.body.method ที่ server.js เช็ค) — สังเกตว่า "Apple Pay" กับ "Google Pay" ใช้
 * method: 'card' เหมือนกับแถว "Credit / Debit Card" เป๊ะๆ ไม่ได้พิมพ์ผิด! เหตุผล:
 *
 *   Apple Pay กับ Google Pay ไม่ใช่ "ช่องทางจ่ายเงินแยก" ในมุมของ Stripe Checkout — มันคือ
 *   "กระเป๋าเงินดิจิทัล" (digital wallet) ที่ผูกอยู่กับบัตรเครดิต/เดบิตอยู่แล้ว พอลูกค้ากดปุ่ม
 *   ไปหน้า Stripe Checkout (ทาง method: 'card') Stripe จะเช็คเองอัตโนมัติว่าเบราว์เซอร์/มือถือ
 *   เครื่องนั้นรองรับ Apple Pay หรือ Google Pay ไหม ถ้ารองรับก็จะโชว์ปุ่มให้กดจ่ายไวๆ ด้วย
 *   Face ID/ลายนิ้วมือ/บัญชี Google ที่ด้านบนของหน้า Stripe เองเลย (ไม่ต้องเขียนโค้ดเพิ่ม
 *   สักบรรทัด Stripe จัดการให้หมด รวมถึงเรื่องยืนยันโดเมนของ Apple Pay ด้วย) — ถ้าเครื่อง/
 *   เบราว์เซอร์ไม่รองรับ ก็แค่ไม่โชว์ปุ่มนั้น ตกไปกรอกบัตรตามปกติ ไม่มีอะไรพัง
 *
 *   เพราะงั้นปุ่ม "Apple Pay"/"Google Pay" บนหน้าเราจึงเป็นแค่ "ทางลัด" ที่พาไปหน้าเดียวกับ
 *   ปุ่ม Card เป๊ะๆ — ไม่ได้โกหกลูกค้า เพราะพอไปถึงหน้า Stripe จริงๆ จะเห็นปุ่มนั้นจริง (ถ้า
 *   อุปกรณ์รองรับ) ✅ เงื่อนไขที่ต้องเช็คก่อนใช้งานจริง: ต้องเปิด Apple Pay/Google Pay ใน
 *   Stripe Dashboard → Settings → Payment methods ก่อน ไม่งั้นจะไม่โชว์ปุ่มแม้เครื่องรองรับ
 *
 * PayPal เป็น method แยกจริง ('paypal') เพราะ Stripe คิดเป็นช่องทางเต็มรูปแบบของตัวเอง (ดู
 * โค้ดฝั่ง server.js) ส่วน PromptPay ก็ยังเป็น 'promptpay' เหมือนเดิม
 *
 * TrueMoney ไม่มี field "method" เลย เพราะยังกดไม่ได้ (disabled: true) — Stripe ไม่รองรับ
 * TrueMoney เป็นช่องทางจ่ายเงินเลย (เช็คจากเอกสาร Stripe แล้วตอนคุยกับน้องหนาว 23 ก.ย. 2569)
 * ถ้าจะเปิดใช้งานจริงต้องเปลี่ยนไปใช้เกตเวย์อื่น (เช่น Omise/2C2P) ซึ่งเป็นงานเชื่อมระบบใหม่
 * ทั้งชุด ไม่ใช่แค่ต่อปุ่มเข้ากับ Stripe เหมือนช่องทางอื่นๆ ในนี้
 */
const PAYMENT_ROWS = [
  {
    method: 'card',
    icon: ICON_CARD,
    label: 'Credit / Debit Card',
    sub: `${PREMIUM_PRICE_THB_DISPLAY} / month · auto-renews`,
  },
  {
    method: 'card',
    icon: ICON_APPLE,
    label: 'Apple Pay',
    sub: 'Pay instantly if your device supports it',
  },
  {
    method: 'card',
    icon: ICON_GOOGLE,
    label: 'Google Pay',
    sub: 'Pay instantly if your device supports it',
  },
  {
    method: 'paypal',
    icon: ICON_PAYPAL,
    label: 'PayPal',
    sub: `${getPaypalDisplayPrice()} / month · includes ~${PAYPAL_FEE_SURCHARGE_PERCENT}% processing fee`,
  },
  {
    method: 'promptpay',
    icon: ICON_PROMPTPAY,
    label: 'PromptPay QR',
    sub: `${PREMIUM_PRICE_THB_DISPLAY} / month · scan each month, doesn't auto-renew`,
  },
];

/**
 * แถวเดียวของตัวเลือกวิธีจ่ายเงิน — เป็น <button type="submit"> ที่อยู่ "ข้างใน" ฟอร์มใหญ่
 * ฟอร์มเดียวกันทั้งหมด (ดู renderPaymentMethodsBox ด้านล่าง) ไม่ใช่คนละ <form> เหมือนดีไซน์
 * เก่า — ใช้เทคนิค HTML ล้วนๆ ที่เบราว์เซอร์รองรับเองอยู่แล้ว: ปุ่ม submit ที่มี name="method"
 * กับ value คนละค่ากัน พอกดปุ่มไหน เบราว์เซอร์จะส่งแค่ "name/value ของปุ่มที่กด" ไปกับฟอร์ม
 * (ไม่ส่งของปุ่มอื่น) รวมกับ input อื่นๆ ในฟอร์มเดียวกัน (เช่นช่องโค้ดส่วนลด) โดยอัตโนมัติ —
 * ไม่ต้องพึ่ง JavaScript เลยแม้แต่บรรทัดเดียว เหมือนหลักการเดิมของไฟล์นี้
 */
function renderPaymentRow({ method, icon, label, sub }) {
  return `<button type="submit" name="method" value="${escapeHtml(method)}" class="pay-row">
    <span class="pay-row-icon">${icon}</span>
    <span class="pay-row-text">
      <span class="pay-row-label">${escapeHtml(label)}</span>
      <span class="pay-row-sub">${escapeHtml(sub)}</span>
    </span>
    <span class="pay-row-arrow">&rarr;</span>
  </button>`;
}

/** แถว "เร็วๆ นี้" ของ TrueMoney — เป็น <div> ธรรมดา ไม่ใช่ปุ่ม กดไม่ได้จริงๆ ตามที่ตั้งใจ */
function renderComingSoonRow({ icon, label }) {
  return `<div class="pay-row pay-row-disabled">
    <span class="pay-row-icon">${icon}</span>
    <span class="pay-row-text">
      <span class="pay-row-label">${escapeHtml(label)}</span>
      <span class="pay-row-sub">Not available yet</span>
    </span>
    <span class="pay-row-badge">Coming soon</span>
  </div>`;
}

/** กล่องรวมทุกช่องทางจ่ายเงิน + ช่องกรอกโค้ดส่วนลด (ช่องเดียว ใช้ร่วมกันทุกวิธี) */
function renderPaymentMethodsBox(guildId) {
  return `<form method="POST" action="/premium/${encodeURIComponent(guildId)}/checkout" class="pay-box">
    <label class="discount-field">
      <span>Discount code (optional)</span>
      <input type="text" name="discountCode" placeholder="e.g. KITTY10" maxlength="20" autocomplete="off" />
    </label>
    <div class="pay-row-list">
      ${PAYMENT_ROWS.map(renderPaymentRow).join('\n      ')}
      ${renderComingSoonRow({ icon: ICON_WALLET, label: 'TrueMoney Wallet' })}
    </div>
    <div class="pay-box-note">Have a discount code? Type it above before picking how to pay — it applies automatically.</div>
  </form>`;
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
    ? `<div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;padding:12px 16px;border-radius:10px;font-size:13px;margin-bottom:20px;">${escapeHtml(errorMessage)}</div>`
    : '';

  const statusCard = isPremium
    ? `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:24px 28px;max-width:520px;">
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
    : renderPaymentMethodsBox(guild.id);

  // 🆕 แถวหัวข้อ "เซิร์ฟไหน" — โชว์ไอคอน+ชื่อเซิร์ฟให้ชัดเจนว่ากำลังซื้อพรีเมียมให้เซิร์ฟไหนอยู่
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

  main { max-width: 1040px; margin: 0 auto; padding: 40px 20px 64px; }
  @media (min-width: 640px) { main { padding: 44px 48px 72px; } }

  /* 🆕 [23 ก.ย. 2569] layout 2 คอลัมน์บนจอกว้าง — ซ้าย: หัวข้อ / ขวา: กล่องเลือกวิธีจ่ายเงิน
     บนจอแคบ (มือถือ) จะซ้อนกันเป็นคอลัมน์เดียวอัตโนมัติผ่าน grid-template-columns */
  .billing-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 36px;
    margin-top: 18px;
  }
  @media (min-width: 860px) {
    .billing-layout { grid-template-columns: 0.85fr 1.15fr; gap: 56px; }
    /* เลื่อนคอลัมน์ซ้ายลงมานิดหน่อยตามที่ขอ (ไม่ได้ชิดขอบบนสุดเป๊ะเหมือนคอลัมน์ขวา) */
    .billing-left { margin-top: 34px; }
  }

  .billing-left .back-link { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
  .billing-left .back-link:hover { color: var(--text); }
  .billing-left .server-row { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
  .billing-left .server-row span { font-size: 13px; color: var(--text-muted); }
  .billing-left h1 { font-size: 24px; font-weight: 700; color: var(--text); margin: 14px 0 0; }
  .billing-left p { font-size: 13.5px; color: var(--text-muted); margin-top: 8px; max-width: 380px; line-height: 1.7; }

  /* ── กล่องเลือกวิธีจ่ายเงิน (คอลัมน์ขวา) ── */
  .pay-box { max-width: 460px; }
  .discount-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 16px; }
  .discount-field span { font-size: 11px; font-weight: 600; color: var(--text-muted); }
  .discount-field input {
    width: 100%; background: var(--bg-card); border: 1px solid var(--border); color: var(--text);
    font-size: 13px; padding: 10px 12px; border-radius: 8px; text-transform: uppercase;
  }

  /* แต่ละแถวช่องทางจ่ายเงิน — ทรงสี่เหลี่ยมผืนผ้ายาว บาง ตามที่ขอ */
  .pay-row-list { display: flex; flex-direction: column; gap: 8px; }
  .pay-row {
    display: flex; align-items: center; gap: 12px;
    width: 100%; text-align: left;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
    padding: 11px 14px;
    font-family: inherit; color: var(--text); cursor: pointer;
    transition: border-color .15s ease, transform .1s ease, background .15s ease;
  }
  .pay-row:hover { border-color: var(--accent); background: rgba(124,131,253,0.08); }
  .pay-row:active { transform: scale(0.99); }
  .pay-row-icon { flex: 0 0 auto; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
  .pay-row-text { flex: 1 1 auto; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .pay-row-label { font-size: 13.5px; font-weight: 700; color: var(--text); }
  .pay-row-sub { font-size: 11px; color: var(--text-muted); }
  .pay-row-arrow { flex: 0 0 auto; font-size: 14px; color: var(--text-muted-2); }
  .pay-row:hover .pay-row-arrow { color: var(--accent); }

  .pay-row-disabled { cursor: default; opacity: 0.5; }
  .pay-row-disabled:hover { border-color: var(--border); background: var(--bg-card); }
  .pay-row-badge {
    flex: 0 0 auto; font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
    color: var(--text-muted); background: rgba(255,255,255,0.06); padding: 4px 9px; border-radius: 999px;
  }

  .pay-box-note { font-size: 11px; color: var(--text-muted-2); margin-top: 14px; line-height: 1.6; }
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
    ${errorBanner}
    <div class="billing-layout">
      <div class="billing-left">
        <a href="/premium/start" class="back-link">&larr; Choose a different server</a>
        <div class="server-row">
          ${guildIconHtml}
          <span>Premium for <strong style="color:var(--text);">${escapeHtml(guild.name)}</strong></span>
        </div>
        <h1>Premium & Billing</h1>
        <p>${isPremium ? 'Thanks for supporting Aitao Bot!' : 'Pick how you would like to pay for Premium.'}</p>
      </div>
      ${statusCard}
    </div>
  </main>
</body>
</html>`;
}

module.exports = { renderPremiumBillingPage };
