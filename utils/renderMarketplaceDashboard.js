// utils/renderMarketplaceDashboard.js
// ─────────────────────────────────────────────────────────────────────────
// 🆕 [11 ต.ค. 2569] หน้า "Marketplace" จริงในแดชบอร์ด — ย้ายฟีเจอร์ของคำสั่ง
// /marketplace (sell / mylistings / remove / markselling / setpromptpay) ทั้งหมด
// มาทำบนเว็บด้วย ตามที่น้องหนาวขอ: "เข้าหน้าเว็บอยู่แล้ว ยังต้องกลับมาทำอะไรที่ดิสคอร์ด
// มันไม่ใช่อะ" — คำสั่งในดิสคอร์ดยังใช้ได้อยู่เหมือนกันนะครับ (ไม่ได้ลบ) ข้อมูลเก็บที่
// เดียวกัน (data/marketplace.json ผ่าน utils/marketplaceStorage.js) เปลี่ยนจากฝั่งไหน
// ก็เห็นผลเหมือนกันหมด ไม่มีระบบซ้อนทับกัน
//
// โครงหน้า 3 ส่วน:
//   1. ตั้งค่าเลขพร้อมเพย์รับเงิน (บังคับต้องตั้งก่อน ถึงจะลงขายได้ — เตือนด้วยแบนเนอร์
//      สีทองถ้ายังไม่ตั้ง)
//   2. ฟอร์ม "ลงขายสินค้าใหม่" — multipart/form-data เพราะมีไฟล์แนบ (รูปปก + ไฟล์ดิจิทัล)
//      🆕 [12 ต.ค. 2569] น้องหนาวบอกว่าฟอร์มเดิม (กรอกยาวเป็นลิสต์เดียว) น่าเบื่อ/อ่านยาก
//      แล้วตอนกรอกก็งงว่าแต่ละช่องจะไปโผล่ตรงไหนบนหน้าเว็บจริง — เปลี่ยนเป็น "wizard" 2
//      สเต็ป ฝั่งซ้ายโชว์พรีวิวสด (ก็อปสไตล์มาจาก public/marketplace.html เป๊ะๆ) อัปเดต
//      ทันทีที่พิมพ์/เลือก ฝั่งขวาเป็นฟอร์มของสเต็ปนั้นๆ ดูฟังก์ชัน sellWizardHtml() ด้านล่าง
//      มีคอมเมนต์อธิบายละเอียดอีกทีว่าทำไมแยกสเต็ปแบบนี้ และทำไมห้ามใส่ required ตรงๆ
//   3. ตาราง "ประกาศขายของฉัน" — ทุกสถานะ มีปุ่มปิด/เปิดขายใหม่ต่อแถว
//
// ⚠️ ไฟล์แนบ (รูปปก/ไฟล์ดิจิทัล) ที่อัปโหลดจากฟอร์มนี้ จะถูกเก็บแบบ "ถาวรจริงๆ" ผ่าน
// utils/assetStorage.js (โพสต์เข้าห้อง asset-storage ของเซิร์ฟ แล้วเก็บแค่พิกัดข้อความไว้)
// ไม่ใช่เก็บ URL ตรงๆ แบบที่คำสั่ง /marketplace sell เคยทำ (ดูคอมเมนต์ยาวๆ ในไฟล์นั้น) —
// server.js เป็นคนเรียก storeBufferPermanently() จริง ไฟล์นี้มีหน้าที่แค่วาด HTML เท่านั้น
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');
const { renderDashboardLayout } = require('./dashboardShell');

/**
 * 🆕 [12 ต.ค. 2569] สี/ไล่สีของแต่ละหมวดหมู่ สำหรับ "พรีวิวสด" ในฟอร์มลงขายของ (ดู
 * sellWizardHtml ด้านล่าง) — ก๊อปค่ามาจาก CATEGORY_STYLE ใน public/marketplace.html
 * เป๊ะๆ (ตัดส่วน icon ออก เพราะพรีวิวในแดชบอร์ดไม่จำเป็นต้องมีไอคอนตกแต่งแบบหน้าจริง 100%
 * แค่ให้เห็นสี/ชื่อหมวดถูกต้องก็พอแล้ว) ⚠️ ถ้าน้องหนาวแก้สีหมวดหมู่ที่
 * public/marketplace.html ในอนาคต ต้องมาแก้ตรงนี้ให้ตรงกันด้วยนะครับ ไม่ได้ผูกกันอัตโนมัติ
 * (คนละไฟล์ คนละ runtime กัน — ไฟล์นี้รันบน Node ฝั่ง server ส่วนอันนั้นรันในเบราว์เซอร์
 * ของผู้ขาย ดึงมา import กันตรงๆ ไม่ได้)
 */
const CATEGORY_PREVIEW_STYLES = {
  servers: { label: 'Servers', badge: '#9a6a1f', gradient: 'linear-gradient(135deg,#4a3420,#f4b860 70%)' },
  'media:banner': { label: 'Image & Media · Banner', badge: '#c23458', gradient: 'linear-gradient(135deg,#4a2340,#fb7185 75%)' },
  media: { label: 'Image & Media', badge: '#3d4ed6', gradient: 'linear-gradient(135deg,#332a55,#5865f2 75%)' },
  'emoji-sticker': { label: 'Emoji & Sticker', badge: '#6b52d6', gradient: 'linear-gradient(135deg,#3a2e5c,#4a5aa8 75%)' },
  builder: { label: 'Builder', badge: '#1f8f86', gradient: 'linear-gradient(135deg,#2c2450,#4a5aa8 75%)' },
  role: { label: 'Role', badge: '#4b5563', gradient: 'linear-gradient(135deg,#1f2937,#94a3b8 75%)' },
  'welcome-goodbye': { label: 'Welcome / Goodbye', badge: '#b23e91', gradient: 'linear-gradient(135deg,#3d1f3a,#f472b6 75%)' },
  package: { label: 'Package', badge: '#2f8f4e', gradient: 'linear-gradient(135deg,#4a3420,#4a5aa8 70%)' },
};

/** ป้ายสถานะประกาศ — คู่กับ statusLabel() ใน commands/marketplace.js (ข้อความอังกฤษเพราะ
 * แดชบอร์ดทั้งหมด default เป็นอังกฤษตามที่น้องหนาวขอ ต่างจากฝั่งดิสคอร์ดที่เป็นไทย) */
function statusBadgeHtml(status) {
  const map = {
    active: { label: 'Active', bg: 'rgba(82,199,192,0.14)', color: 'var(--teal)' },
    sold: { label: 'Sold / closed', bg: 'rgba(154,162,196,0.14)', color: 'var(--text-muted)' },
    removed: { label: 'Closed', bg: 'rgba(154,162,196,0.14)', color: 'var(--text-muted)' },
  };
  const s = map[status] || map.removed;
  return `<span style="display:inline-flex;align-items:center;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:${s.bg};color:${s.color};">${escapeHtml(s.label)}</span>`;
}

/**
 * 🆕 [12 ต.ค. 2569] ข้อความ disclosure — Feature ความปลอดภัย #3 จาก 4 ข้อที่คุยกันไว้
 * ตอนเข้าสภา LLM Council เรื่องช่องทางจ่ายเงิน (ดูรายละเอียดเต็มๆ ใน claude project doc
 * "marketplace-web-dashboard-build-notes.md") บอกผู้ขายให้ชัดเจนตั้งแต่ก่อนลงขายว่า:
 *   1. นี่คือตลาดซื้อขายกันเอง (peer-to-peer) บอทไม่ได้ถือเงินแทนใคร ไม่ได้ตรวจสอบตัวตน
 *      ผู้ซื้อ-ผู้ขาย และไม่ได้เป็นคู่สัญญาในการซื้อขายนี้เลย
 *   2. ผู้ขายต้องส่งของ/บริการตามที่ตกลงไว้จริง ถ้าไม่ส่งถือว่าผิดเงื่อนไขการใช้งาน
 *      Marketplace นี้ (อาจถูกระงับสิทธิ์การขายได้ — ดูฟีเจอร์ #4 ปุ่มรายงานผู้ขาย)
 *   3. ปัดความรับผิดของทีมงาน/บอทจากข้อพิพาทระหว่างผู้ใช้ — ไม่ใช่คำแนะนำทางกฎหมาย
 *      แค่ข้อความแจ้งเงื่อนไขการใช้งานตรงๆ ให้ผู้ขายเข้าใจก่อนเริ่มขายเท่านั้น
 * โชว์แบบ "ถาวร" ไม่ใช่ปิดได้แล้วจบ (ต่างจาก bannerHtml ที่หายไปเองตาม query string)
 * เพราะอยากให้เห็นทุกครั้งที่เข้าหน้านี้ ไม่ใช่เห็นครั้งเดียวแล้วลืม
 */
function disclosureHtml() {
  return `<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(154,162,196,0.08);border:1px solid var(--border);border-radius:6px;padding:14px 16px;margin-bottom:28px;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex:0 0 auto;margin-top:2px;"><circle cx="12" cy="12" r="10" stroke="#9aa2c4" stroke-width="1.6"/><path d="M12 8h.01M11 11h1v6h1" stroke="#9aa2c4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div style="font-size:12px;color:var(--text-muted);line-height:1.7;">
      <strong style="color:var(--text);">Before you sell:</strong> this Marketplace is peer-to-peer — buyers pay your PromptPay directly and
      Milo Bot never holds or sees the money, verifies anyone's identity, or acts as a party to the sale.
      You're responsible for actually delivering what you list. Not delivering, or misrepresenting an item,
      can get your listings removed or your seller access suspended. Buyers can also report sellers directly.
    </div>
  </div>`;
}

/**
 * แบนเนอร์แจ้งผล (สำเร็จ/ผิดพลาด) — pattern เดียวกับหน้า Language/Premium (query string
 * ?saved=1 / ?error=...) ชั่วคราว หายไปทันทีที่โหลดหน้าใหม่แบบไม่มี query พวกนี้
 */
function bannerHtml({ saved, error }) {
  if (error) {
    return `<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(224,122,122,0.1);border:1px solid #e07a7a;border-radius:6px;padding:12px 16px;margin-bottom:22px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex:0 0 auto;margin-top:1px;"><circle cx="12" cy="12" r="10" stroke="#e07a7a" stroke-width="1.8"/><path d="M12 8v5M12 16h.01" stroke="#e07a7a" stroke-width="1.8" stroke-linecap="round"/></svg>
      <span style="font-size:13px;font-weight:600;color:#e07a7a;">${escapeHtml(error)}</span>
    </div>`;
  }
  if (saved) {
    return `<div style="display:flex;align-items:center;gap:10px;background:rgba(82,199,192,0.12);border:1px solid var(--teal);border-radius:6px;padding:12px 16px;margin-bottom:22px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#52c7c0" stroke-width="1.8"/><path d="M8 12.5l2.5 2.5 5-5.5" stroke="#52c7c0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span style="font-size:13px;font-weight:600;color:var(--teal);">Saved!</span>
    </div>`;
  }
  return '';
}

/**
 * 🆕 [12 ต.ค. 2569] การ์ดตั้งค่า "ช่องทางรับเงิน" — เดิมมีแค่ PromptPay ทางเดียว (ชื่อ
 * promptPaySectionHtml) แต่คนต่างชาติใช้ PromptPay ไม่ได้เลย (เป็นระบบจ่ายเงินของไทย
 * ล้วนๆ) ทั้งที่อยากขายของในตลาดนี้ได้ — เปลี่ยนเป็นให้เลือกได้ 2 ช่องทาง: PromptPay
 * (ผู้ขายในไทย) หรือลิงก์รับเงินของตัวเอง เช่น PayPal.me/Stripe Payment Link (ผู้ขาย
 * ต่างชาติ) บอทไม่รู้จัก/ไม่ยุ่งกับช่องทางที่เป็นลิงก์เลย แค่โชว์ให้ผู้ซื้อกดไปจ่ายตรงกับ
 * ผู้ขายเอง — หลักการ "บอทไม่แตะเงิน" ยังเหมือนเดิมทุกอย่าง (ดูคอมเมนต์เต็มๆ ที่
 * utils/marketplaceStorage.js หัวข้อ saveSellerPayment)
 *
 * สลับ 2 ช่องทางด้วย radio — ใช้ JS เล็กๆ โชว์/ซ่อนช่อง input ที่ตรงกับช่องทางที่เลือก
 * (แพทเทิร์นเดียวกับ newListingFormHtml ด้านล่างที่โชว์/ซ่อน subcategory/digital file)
 * จงใจ "ไม่" ใส่ required ที่ตัว input ทั้ง 2 ช่อง (ต่างจากฟอร์มเดิมที่มีแค่ช่องเดียว) เพราะ
 * ถ้าใส่ required ไว้ทั้งคู่ ตอน submit เบราว์เซอร์จะ error ใส่ช่องที่ถูกซ่อนไว้ (display:none)
 * ไม่ได้ — ไปเช็ค validate จริงจังฝั่ง server แทน (ดู server.js POST .../marketplace/payment)
 * @param {{ paymentMethod?: string, promptpayId?: string, paymentLink?: string }|null} seller
 * @param {string} guildId
 */
function paymentMethodSectionHtml(seller, guildId) {
  const hasPromptPay = Boolean(seller?.promptpayId);
  const hasPaymentLink = Boolean(seller?.paymentLink);
  // ของเก่าก่อน 12 ต.ค. 2569 ไม่มี field paymentMethod เลย — fallback เป็น 'promptpay'
  // ถ้ามี promptpayId อยู่แล้ว (เหมือน getSellerPaymentMethod() ใน marketplaceStorage.js)
  const isLink = seller?.paymentMethod === 'link';
  const hasAnyMethod = hasPromptPay || hasPaymentLink;

  const warningHtml = !hasAnyMethod
    ? `<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(244,184,96,0.1);border:1px solid var(--gold);border-radius:6px;padding:12px 16px;margin-bottom:16px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex:0 0 auto;margin-top:1px;"><path d="M12 3l9 16H3l9-16z" stroke="#f4b860" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v3.5M12 17h.01" stroke="#f4b860" stroke-width="1.7" stroke-linecap="round"/></svg>
        <span style="font-size:13px;color:var(--gold);line-height:1.6;">You need to set up a payment method before you can list anything — this is how buyers pay you directly.</span>
      </div>`
    : '';

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:22px 24px;margin-bottom:28px;">
    <div style="font-size:15px;font-weight:700;color:var(--text);">Payment method</div>
    <div style="font-size:12.5px;color:var(--text-muted);margin-top:6px;line-height:1.6;">
      Buyers pay you directly — Milo Bot never touches the money. Choose PromptPay if you have a Thai
      bank account, or use your own payment link (PayPal.me, Stripe Payment Link, etc.) if you're outside Thailand.
    </div>
    ${warningHtml}

    <div style="margin-top:16px;display:flex;gap:20px;">
      <label style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text);cursor:pointer;">
        <input type="radio" name="mkt-pm-picker" value="promptpay" id="mkt-pm-promptpay-radio" ${isLink ? '' : 'checked'} />
        PromptPay (Thailand)
      </label>
      <label style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text);cursor:pointer;">
        <input type="radio" name="mkt-pm-picker" value="link" id="mkt-pm-link-radio" ${isLink ? 'checked' : ''} />
        Payment link (international)
      </label>
    </div>

    <form method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/payment" style="margin-top:14px;max-width:420px;">
      <input type="hidden" name="payment_method" id="mkt-pm-hidden-input" value="${isLink ? 'link' : 'promptpay'}" />

      <div id="mkt-pm-promptpay-field" style="display:${isLink ? 'none' : 'flex'};gap:10px;">
        <input
          type="text" name="promptpay_id" placeholder="0812345678" pattern="\\d{10}" maxlength="10"
          value="${hasPromptPay ? escapeHtml(seller.promptpayId) : ''}"
          style="flex:1 1 auto;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;"
        />
      </div>
      <div id="mkt-pm-link-field" style="display:${isLink ? 'flex' : 'none'};gap:10px;">
        <input
          type="url" name="payment_link" placeholder="https://paypal.me/yourname" maxlength="300"
          value="${hasPaymentLink ? escapeHtml(seller.paymentLink) : ''}"
          style="flex:1 1 auto;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;"
        />
      </div>

      <button type="submit" style="margin-top:10px;background:var(--accent);color:#fff;border:none;border-radius:6px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;">
        ${hasAnyMethod ? 'Update' : 'Save'}
      </button>
    </form>
  </div>

  <script>
    (function () {
      var hidden = document.getElementById('mkt-pm-hidden-input');
      var ppField = document.getElementById('mkt-pm-promptpay-field');
      var linkField = document.getElementById('mkt-pm-link-field');
      [document.getElementById('mkt-pm-promptpay-radio'), document.getElementById('mkt-pm-link-radio')].forEach(function (radio) {
        radio.addEventListener('change', function () {
          hidden.value = radio.value;
          ppField.style.display = radio.value === 'promptpay' ? 'flex' : 'none';
          linkField.style.display = radio.value === 'link' ? 'flex' : 'none';
        });
      });
    })();
  </script>`;
}

/**
 * 🆕 [12 ต.ค. 2569] ฟอร์ม "ลงขายสินค้าใหม่" เวอร์ชัน wizard 2 สเต็ป + พรีวิวสด
 * (แทนที่ newListingFormHtml เดิมที่เป็นลิสต์ฟอร์มยาวๆ หน้าเดียว — น้องหนาวบอกว่าอ่านยาก/
 * น่าเบื่อ แล้วตอนกรอกก็ไม่รู้ว่าจะไปโผล่ตรงไหนหน้าตายังไงบนหน้าเว็บจริง)
 *
 * แนวคิด: เลียนแบบการทำงานในแคนวา — ฝั่งซ้ายเห็นพรีวิวจริงอัปเดตสดๆ ทุกครั้งที่พิมพ์/เลือก
 * ฝั่งขวาเป็นฟอร์มของสเต็ปที่กำลังทำอยู่ แบ่ง 2 สเต็ปตามที่น้องหนาวขอ:
 *   สเต็ป 1/2 — "การ์ดในหน้า Marketplace" (ก่อนคลิกเข้าไปดู) ใช้ข้อมูล: ชื่อสินค้า, ราคา,
 *               หมวดหมู่/หมวดย่อย, รูปปก → พรีวิวฝั่งซ้ายโชว์เป็นการ์ดเล็กๆ ขนาด/สไตล์
 *               ตรงกับการ์ดจริงในกริดหน้า public/marketplace.html เป๊ะๆ (ก๊อปสไตล์มาเลย)
 *   สเต็ป 2/2 — "หน้ารายละเอียดเต็ม" (หลังคลิกเข้าไปดู) ใช้ข้อมูล: คำอธิบาย, ประเภทสินค้า,
 *               ไฟล์ดิจิทัล → พรีวิวฝั่งซ้ายสลับเป็นหน้าดีเทลเต็ม (ก๊อปสไตล์จาก modal
 *               รายละเอียดสินค้าในหน้าเดียวกัน)
 * กดปุ่ม "Next" ย้ายไปสเต็ป 2 ได้ก็ต่อเมื่อกรอกสเต็ป 1 ครบ (เช็คด้วย JS ก่อนย้าย ไม่ใช่
 * native required ของ browser — อ่านว่าทำไมในคอมเมนต์เหนือฟังก์ชัน validateStep1/2 ด้านล่าง)
 *
 * ⚠️ ฟอร์มจริงๆ แล้วเป็น <form> เดียวกันทั้ง 2 สเต็ป (ไม่ใช่ 2 ฟอร์มแยกกัน) แค่ "ซ่อน/โชว์"
 * ด้วย display:none สลับกันไปมา ข้อมูลที่กรอกไว้ในสเต็ป 1 จะไม่หายตอนกด Back/Next เพราะ
 * input พวกนั้นยังอยู่ใน DOM ตลอด ไม่ได้ลบ-สร้างใหม่ — พอกด submit จริง (ปุ่ม "List item"
 * ที่อยู่สเต็ป 2) จะส่งค่าทุกช่องของทั้ง 2 สเต็ปไปพร้อมกันทีเดียว (name attribute เหมือน
 * ของเดิม 100% → server.js ฝั่งรับไม่ต้องแก้อะไรเลย)
 * @param {object} categories CATEGORIES object จาก marketplaceStorage.js
 * @param {boolean} canSell seller ตั้งช่องทางรับเงินไว้แล้วหรือยัง
 * @param {string} guildId
 * @param {string} sellerDisplayName ชื่อผู้ขาย (ชื่อ Discord ของคนที่ล็อกอินอยู่) โชว์ในพรีวิวเฉยๆ
 */
function sellWizardHtml(categories, canSell, guildId, sellerDisplayName) {
  const categoryOptionsHtml = Object.entries(categories)
    .map(([value, info]) => `<option value="${escapeHtml(value)}">${escapeHtml(info.label)}</option>`)
    .join('');

  // ข้อมูลหมวดย่อยส่งให้ JS ฝั่ง client เป็น JSON เลย (ไม่ต้องยิง API แยก) — ใช้ตอน
  // เปลี่ยน <select name="category"> แล้วต้องรู้ว่าหมวดนี้มีหมวดย่อยให้เลือกไหม
  const subcategoryMapJson = JSON.stringify(
    Object.fromEntries(Object.entries(categories).map(([value, info]) => [value, info.subcategories || null]))
  ).replace(/</g, '\\u003c'); // กัน </script> หลุดโผล่กลางหน้าถ้ามีใครตั้งชื่อหมวดแปลกๆ ในอนาคต

  // สี/ไล่สีของแต่ละหมวด ส่งให้ JS ฝั่ง client ไว้ใช้วาดพรีวิวสด (ดูคอมเมนต์เต็มๆ ที่
  // CATEGORY_PREVIEW_STYLES ด้านบนไฟล์ว่าทำไมต้องก๊อปข้อมูลนี้มาไว้ที่นี่ด้วย)
  const categoryStylesJson = JSON.stringify(CATEGORY_PREVIEW_STYLES).replace(/</g, '\\u003c');

  const disabledAttr = canSell ? '' : 'disabled';
  const disabledNoteHtml = canSell
    ? ''
    : `<div style="font-size:12.5px;color:var(--text-muted);margin-top:10px;">Set up a payment method above first to unlock this form.</div>`;

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:22px 24px;margin-bottom:28px;${canSell ? '' : 'opacity:0.6;'}">
    <div style="font-size:15px;font-weight:700;color:var(--text);">List a new item</div>
    <div style="font-size:12.5px;color:var(--text-muted);margin-top:6px;line-height:1.6;">
      Fill this in once and it shows up on the public Marketplace page right away. The preview on the left updates live
      as you type, so you can see exactly what buyers will see.
    </div>

    <!-- ตัวบอกสเต็ปปัจจุบัน 1/2 หรือ 2/2 -->
    <div style="display:flex;align-items:center;gap:9px;margin-top:20px;">
      <span id="mkt-wiz-dot1" style="width:7px;height:7px;border-radius:999px;background:var(--accent);transition:background 0.15s;"></span>
      <span id="mkt-wiz-dot2" style="width:7px;height:7px;border-radius:999px;background:var(--border);transition:background 0.15s;"></span>
      <span style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">
        Step <span id="mkt-wiz-step-label">1</span> of 2
      </span>
      <span id="mkt-wiz-step-title" style="font-size:12px;color:var(--text-muted);">— the card buyers see in the Marketplace grid</span>
    </div>

    <form id="mkt-wiz-form" method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/listings" enctype="multipart/form-data"
      style="margin-top:18px;display:flex;gap:30px;align-items:flex-start;">

      <!-- ═══ ฝั่งซ้าย: พรีวิวสด ═══ สีพวกนี้ตั้งใจ hardcode ไม่ใช้ var(--xxx) ของแดชบอร์ด
           เพราะพรีวิวต้องเลียนแบบหน้า public/marketplace.html (ธีมมืดของมันเอง) ให้ตรงเป๊ะๆ
           ไม่ใช่ให้ตรงกับธีมแดชบอร์ด (ถึงจะบังเอิญคล้ายกันตอนนี้ก็ตาม) -->
      <div style="flex:0 0 240px;">
        <div style="font-size:10.5px;font-weight:700;letter-spacing:0.08em;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;">
          Live preview — <span id="mkt-wiz-preview-mode-label">grid card</span>
        </div>

        <!-- พรีวิวสเต็ป 1: การ์ดในกริด (สไตล์ก๊อปจาก buildListingCardHtml() ใน public/marketplace.html) -->
        <div id="mkt-wiz-preview-card" style="position:relative;height:165px;border-radius:4px;overflow:hidden;background:linear-gradient(135deg,#1f2937,#2c3559 75%);">
          <div id="mkt-wiz-pc-badge" style="position:absolute;top:10px;left:10px;background:#4b5563;border-radius:999px;padding:3px 8px;font-size:9px;font-weight:700;color:#fff;">Choose a category</div>
          <div style="position:absolute;inset:0;background:linear-gradient(180deg, transparent 42%, rgba(5,7,15,0.94) 100%);"></div>
          <div style="position:absolute;left:16px;right:16px;bottom:14px;">
            <div id="mkt-wiz-pc-title" style="font-size:14px;font-weight:700;color:#fff;">Your item title</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
              <span style="font-size:11px;color:rgba(255,255,255,0.75);">${escapeHtml(sellerDisplayName || 'You')}</span>
              <span id="mkt-wiz-pc-price" style="font-size:14px;font-weight:700;color:#f4b860;">฿0</span>
            </div>
          </div>
        </div>

        <!-- พรีวิวสเต็ป 2: หน้ารายละเอียดเต็ม (สไตล์ก๊อปจาก modal #productDetailModal ในหน้าเดียวกัน) -->
        <div id="mkt-wiz-preview-detail" style="display:none;background:#131a2e;border:1px solid #262f4d;border-radius:6px;overflow:hidden;">
          <div id="mkt-wiz-pd-hero" style="height:100px;position:relative;background:linear-gradient(135deg,#1f2937,#2c3559 75%);">
            <div id="mkt-wiz-pd-badge" style="position:absolute;top:10px;left:10px;border-radius:999px;padding:4px 10px;font-size:9px;font-weight:700;color:#fff;background:#4b5563;">Choose a category</div>
          </div>
          <div style="padding:14px 16px 16px;">
            <div id="mkt-wiz-pd-title" style="font-size:14px;font-weight:700;color:#f9f8ff;">Your item title</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:9px;">
              <span style="font-size:11.5px;color:#9aa2c4;">${escapeHtml(sellerDisplayName || 'You')}</span>
              <span id="mkt-wiz-pd-price" style="font-size:16px;font-weight:700;color:#f4b860;">฿0</span>
            </div>
            <div style="height:1px;background:#262f4d;margin:12px 0;"></div>
            <div style="font-size:9.5px;font-weight:700;letter-spacing:0.08em;color:#9aa2c4;text-transform:uppercase;margin-bottom:6px;">Description</div>
            <div id="mkt-wiz-pd-desc" style="font-size:12px;color:#c3c8e6;line-height:1.65;">Your description will show up here.</div>
            <div id="mkt-wiz-pd-filebadge" style="display:none;margin-top:10px;font-size:11px;color:#7fc9c0;"></div>
          </div>
        </div>

        <div style="font-size:10.5px;color:var(--text-muted-2);margin-top:10px;line-height:1.6;">
          Mirrors the real Marketplace page. Decorative icons are simplified here but colors/layout match.
        </div>
      </div>

      <!-- ═══ ฝั่งขวา: ฟอร์มของสเต็ปที่กำลังทำอยู่ ═══ -->
      <div style="flex:1 1 380px;max-width:420px;">

        <!-- สเต็ป 1/2: ข้อมูลสำหรับการ์ด -->
        <div id="mkt-wiz-step1" style="display:flex;flex-direction:column;gap:16px;">
          <label style="display:flex;flex-direction:column;gap:6px;">
            <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Title</span>
            <input type="text" name="title" id="mkt-wiz-title-input" maxlength="80" ${disabledAttr}
              style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;" />
          </label>

          <label style="display:flex;flex-direction:column;gap:6px;">
            <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Price (THB)</span>
            <input type="number" name="price" id="mkt-wiz-price-input" min="1" max="20000" step="1" ${disabledAttr}
              style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;" />
          </label>

          <div style="display:flex;gap:14px;">
            <label style="display:flex;flex-direction:column;gap:6px;flex:1 1 auto;">
              <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Category</span>
              <select name="category" id="mkt-category-select" ${disabledAttr}
                style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;">
                <option value="" disabled selected>Choose a category&hellip;</option>
                ${categoryOptionsHtml}
              </select>
            </label>
            <label id="mkt-subcategory-label" style="display:none;flex-direction:column;gap:6px;flex:1 1 auto;">
              <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Subcategory</span>
              <select name="subcategory" id="mkt-subcategory-select" ${disabledAttr}
                style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;"></select>
            </label>
          </div>

          <label style="display:flex;flex-direction:column;gap:6px;">
            <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Cover image <span style="color:var(--text-muted);font-weight:400;">(shown on the card — optional, up to 20MB)</span></span>
            <input type="file" name="image" id="mkt-wiz-image-input" accept="image/png,image/jpeg,image/webp,image/gif" ${disabledAttr}
              style="color:var(--text-muted);font-size:12.5px;" />
          </label>
        </div>

        <!-- สเต็ป 2/2: ข้อมูลสำหรับหน้ารายละเอียด — ซ่อนไว้ก่อน เริ่มที่สเต็ป 1 -->
        <div id="mkt-wiz-step2" style="display:none;flex-direction:column;gap:16px;">
          <label style="display:flex;flex-direction:column;gap:6px;">
            <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Description</span>
            <textarea name="description" id="mkt-wiz-desc-input" maxlength="1000" rows="5" ${disabledAttr}
              style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;font-family:inherit;resize:vertical;"></textarea>
          </label>

          <label style="display:flex;flex-direction:column;gap:6px;">
            <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Type</span>
            <select name="type" id="mkt-type-select" ${disabledAttr}
              style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;">
              <option value="service">Service (you contact the buyer yourself)</option>
              <option value="digital">Digital file (sent automatically after payment)</option>
            </select>
          </label>

          <label id="mkt-digitalfile-label" style="display:none;flex-direction:column;gap:6px;">
            <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Digital file <span style="color:var(--text-muted);font-weight:400;">(sent to the buyer automatically — required for digital items, up to 20MB)</span></span>
            <input type="file" name="digitalFile" id="mkt-digitalfile-input" ${disabledAttr}
              style="color:var(--text-muted);font-size:12.5px;" />
          </label>
        </div>

        <!-- ข้อความ error ของสเต็ปปัจจุบัน (เช็คด้วย JS ก่อนย้าย/ก่อน submit ไม่ใช่ native required) -->
        <div id="mkt-wiz-step-error" style="display:none;font-size:12px;color:#e07a7a;margin-top:14px;"></div>

        <div style="display:flex;gap:10px;margin-top:16px;">
          <button type="button" id="mkt-wiz-back-btn" ${disabledAttr}
            style="display:none;background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:6px;padding:11px 20px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;">
            &larr; Back
          </button>
          <button type="button" id="mkt-wiz-next-btn" ${disabledAttr}
            style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:11px 24px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;">
            Next: item details &rarr;
          </button>
          <button type="submit" id="mkt-wiz-submit-btn" ${disabledAttr}
            style="display:none;background:var(--accent);color:#fff;border:none;border-radius:6px;padding:11px 24px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;">
            List item
          </button>
        </div>
      </div>
    </form>
    ${disabledNoteHtml}
  </div>

  <script>
    (function () {
      var SUBCATS = ${subcategoryMapJson};
      var CATSTYLES = ${categoryStylesJson};

      // ── องค์ประกอบของฟอร์ม/ปุ่มควบคุมสเต็ป ──
      var form = document.getElementById('mkt-wiz-form');
      var step1El = document.getElementById('mkt-wiz-step1');
      var step2El = document.getElementById('mkt-wiz-step2');
      var nextBtn = document.getElementById('mkt-wiz-next-btn');
      var backBtn = document.getElementById('mkt-wiz-back-btn');
      var submitBtn = document.getElementById('mkt-wiz-submit-btn');
      var stepErrorEl = document.getElementById('mkt-wiz-step-error');
      var stepLabelEl = document.getElementById('mkt-wiz-step-label');
      var stepTitleEl = document.getElementById('mkt-wiz-step-title');
      var dot1 = document.getElementById('mkt-wiz-dot1');
      var dot2 = document.getElementById('mkt-wiz-dot2');
      var previewModeLabelEl = document.getElementById('mkt-wiz-preview-mode-label');
      var previewCardEl = document.getElementById('mkt-wiz-preview-card');
      var previewDetailEl = document.getElementById('mkt-wiz-preview-detail');

      // ── ช่องกรอกสเต็ป 1 ──
      var titleInput = document.getElementById('mkt-wiz-title-input');
      var priceInput = document.getElementById('mkt-wiz-price-input');
      var categorySelect = document.getElementById('mkt-category-select');
      var subcatLabel = document.getElementById('mkt-subcategory-label');
      var subcatSelect = document.getElementById('mkt-subcategory-select');
      var imageInput = document.getElementById('mkt-wiz-image-input');

      // ── ช่องกรอกสเต็ป 2 ──
      var descInput = document.getElementById('mkt-wiz-desc-input');
      var typeSelect = document.getElementById('mkt-type-select');
      var fileLabel = document.getElementById('mkt-digitalfile-label');
      var fileInput = document.getElementById('mkt-digitalfile-input');

      // ── ส่วนต่างๆ ของพรีวิว (สเต็ป 1 = การ์ด, สเต็ป 2 = ดีเทล) ──
      var pcBadge = document.getElementById('mkt-wiz-pc-badge');
      var pcTitle = document.getElementById('mkt-wiz-pc-title');
      var pcPrice = document.getElementById('mkt-wiz-pc-price');
      var pdHero = document.getElementById('mkt-wiz-pd-hero');
      var pdBadge = document.getElementById('mkt-wiz-pd-badge');
      var pdTitle = document.getElementById('mkt-wiz-pd-title');
      var pdPrice = document.getElementById('mkt-wiz-pd-price');
      var pdDesc = document.getElementById('mkt-wiz-pd-desc');
      var pdFileBadge = document.getElementById('mkt-wiz-pd-filebadge');

      var currentImageDataUrl = null; // รูปปกที่เลือกไว้ (ยังไม่อัปโหลดจริง แค่โชว์พรีวิวในเบราว์เซอร์)

      // หาสี/ชื่อหมวดให้ตรงกับ getCategoryStyle() ของ public/marketplace.html เป๊ะๆ (รวมเคส
      // พิเศษ media+banner ที่มีสีของตัวเอง และหมวด media/role ที่ต่อชื่อหมวดย่อยเข้าไปในป้าย)
      function currentCategoryStyle() {
        var category = categorySelect.value;
        var subcategory = subcatSelect.value;
        if (!category) return { label: 'Choose a category\\u2026', badge: '#4b5563', gradient: 'linear-gradient(135deg,#1f2937,#2c3559 75%)' };
        if (category === 'media' && subcategory === 'banner') return CATSTYLES['media:banner'];
        var base = CATSTYLES[category] || CATSTYLES.package;
        var label = base.label;
        if (subcategory && (category === 'media' || category === 'role')) {
          label = base.label + ' \\u00b7 ' + subcategory.charAt(0).toUpperCase() + subcategory.slice(1);
        }
        return { label: label, badge: base.badge, gradient: base.gradient };
      }

      function applyPreviewBackground(el, style) {
        if (currentImageDataUrl) {
          el.style.background = "center / cover no-repeat url('" + currentImageDataUrl + "')";
        } else {
          el.style.background = style.gradient;
        }
      }

      function formattedPrice() {
        var price = parseInt(priceInput.value, 10);
        return '\\u0e3f' + (price > 0 ? price.toLocaleString('en-US') : '0');
      }

      // อัปเดตพรีวิวการ์ด (สเต็ป 1) — เรียกทุกครั้งที่พิมพ์ชื่อ/ราคา/เปลี่ยนหมวด/เปลี่ยนรูป
      function updateCardPreview() {
        var style = currentCategoryStyle();
        pcBadge.textContent = style.label;
        pcBadge.style.background = style.badge;
        applyPreviewBackground(previewCardEl, style);
        pcTitle.textContent = titleInput.value.trim() || 'Your item title';
        pcPrice.textContent = formattedPrice();
      }

      // อัปเดตพรีวิวดีเทล (สเต็ป 2) — เรียกทุกครั้งที่พิมพ์คำอธิบาย/เปลี่ยน type/เลือกไฟล์ด้วย
      // (เรียกพร้อมกับ updateCardPreview เสมอ เพราะ title/price/category ใช้ร่วมกันทั้ง 2 พรีวิว)
      function updateDetailPreview() {
        var style = currentCategoryStyle();
        pdBadge.textContent = style.label;
        pdBadge.style.background = style.badge;
        applyPreviewBackground(pdHero, style);
        pdTitle.textContent = titleInput.value.trim() || 'Your item title';
        pdPrice.textContent = formattedPrice();
        pdDesc.textContent = descInput.value.trim() || 'Your description will show up here.';
        if (typeSelect.value === 'digital' && fileInput.files && fileInput.files[0]) {
          pdFileBadge.textContent = '\\ud83d\\udcce ' + fileInput.files[0].name;
          pdFileBadge.style.display = 'block';
        } else {
          pdFileBadge.style.display = 'none';
        }
      }

      function updateBothPreviews() {
        updateCardPreview();
        updateDetailPreview();
      }

      titleInput.addEventListener('input', updateBothPreviews);
      priceInput.addEventListener('input', updateBothPreviews);
      descInput.addEventListener('input', updateDetailPreview);
      fileInput.addEventListener('change', updateDetailPreview);

      imageInput.addEventListener('change', function () {
        var file = imageInput.files && imageInput.files[0];
        if (!file) {
          currentImageDataUrl = null;
          updateBothPreviews();
          return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
          currentImageDataUrl = e.target.result;
          updateBothPreviews();
        };
        reader.readAsDataURL(file);
      });

      // ── ของเดิมจาก newListingFormHtml: โชว์/ซ่อน subcategory ตามหมวดที่เลือก ──
      function updateSubcategory() {
        var subs = SUBCATS[categorySelect.value] || null;
        if (subs && subs.length) {
          subcatSelect.innerHTML = subs.map(function (s) {
            return '<option value="' + s + '">' + s + '</option>';
          }).join('');
          subcatLabel.style.display = 'flex';
        } else {
          subcatSelect.innerHTML = '';
          subcatLabel.style.display = 'none';
        }
        updateBothPreviews();
      }

      // ── ของเดิมจาก newListingFormHtml: โชว์/ซ่อน digital file ตาม type ที่เลือก ──
      function updateDigitalFile() {
        var isDigital = typeSelect.value === 'digital';
        fileLabel.style.display = isDigital ? 'flex' : 'none';
        if (!isDigital) fileInput.value = ''; // เผื่อเคยเลือกไฟล์ไว้แล้วเปลี่ยนใจเป็น service ล้างออกกันค้าง
        updateDetailPreview();
      }

      categorySelect.addEventListener('change', updateSubcategory);
      typeSelect.addEventListener('change', updateDigitalFile);
      updateSubcategory();
      updateDigitalFile();
      updateBothPreviews();

      // ── สลับสเต็ป 1 ↔ 2 ──
      // 🆕 ตัว input ของทั้ง 2 สเต็ปไม่มี attribute "required" ติดอยู่เลยนะครับ (ต่างจาก
      // ฟอร์มเดิมที่ใส่ required ตรงๆ) เพราะพอแยกเป็น 2 สเต็ปแล้วซ่อนอีกสเต็ปด้วย
      // display:none ถ้ายังมี required ค้างอยู่ในสเต็ปที่ซ่อนไว้ ตอน submit จริง browser
      // จะ error "An invalid form control is not focusable" ทันที (เจอปัญหานี้มาแล้วตอน
      // ทำตัวเลือกช่องทางจ่ายเงินด้านบนในไฟล์นี้) เลยเช็ค validate เองด้วย JS ทั้งหมดแทน
      function showStepError(msg) {
        stepErrorEl.textContent = msg;
        stepErrorEl.style.display = 'block';
      }
      function clearStepError() {
        stepErrorEl.style.display = 'none';
      }

      function validateStep1() {
        if (!titleInput.value.trim()) return 'Please enter a title.';
        var price = Number(priceInput.value);
        if (!price || price < 1 || price > 20000) return 'Please enter a price between 1 and 20,000 THB.';
        if (!categorySelect.value) return 'Please choose a category.';
        if (subcatLabel.style.display !== 'none' && !subcatSelect.value) return 'Please choose a subcategory.';
        return null;
      }

      function validateStep2() {
        if (!descInput.value.trim()) return 'Please write a description.';
        if (typeSelect.value === 'digital' && (!fileInput.files || !fileInput.files[0])) {
          return 'Please attach the digital file buyers will receive.';
        }
        return null;
      }

      nextBtn.addEventListener('click', function () {
        var err = validateStep1();
        if (err) {
          showStepError(err);
          return;
        }
        clearStepError();
        step1El.style.display = 'none';
        step2El.style.display = 'flex';
        nextBtn.style.display = 'none';
        backBtn.style.display = 'inline-flex';
        submitBtn.style.display = 'inline-flex';
        stepLabelEl.textContent = '2';
        stepTitleEl.textContent = '— the full item page buyers see after they click in';
        previewModeLabelEl.textContent = 'item page';
        previewCardEl.style.display = 'none';
        previewDetailEl.style.display = 'block';
        dot1.style.background = 'var(--border)';
        dot2.style.background = 'var(--accent)';
      });

      backBtn.addEventListener('click', function () {
        clearStepError();
        step2El.style.display = 'none';
        step1El.style.display = 'flex';
        backBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        nextBtn.style.display = 'inline-flex';
        stepLabelEl.textContent = '1';
        stepTitleEl.textContent = '— the card buyers see in the Marketplace grid';
        previewModeLabelEl.textContent = 'grid card';
        previewDetailEl.style.display = 'none';
        previewCardEl.style.display = 'block';
        dot1.style.background = 'var(--accent)';
        dot2.style.background = 'var(--border)';
      });

      // เช็คสเต็ป 2 อีกรอบตอน submit จริง (เผื่อแก้อะไรหลังกด Next ไปแล้วจนข้อมูลไม่ครบ)
      form.addEventListener('submit', function (e) {
        var err = validateStep2();
        if (err) {
          e.preventDefault();
          showStepError(err);
        }
      });
    })();
  </script>`;
}

/**
 * แถวตาราง "ประกาศขายของฉัน" 1 แถว — มีปุ่มปิด/เปิดขายใหม่ (ฟอร์มเล็กๆ ปุ่มเดียวจบ ไม่ต้อง
 * พึ่ง JS) ตามสถานะปัจจุบัน
 * @param {object} listing { id, title, priceThb, category, subcategory, status, imageUrl, createdAt }
 * @param {object} categories CATEGORIES object
 */
function listingRowHtml(listing, categories, guildId) {
  const categoryInfo = categories[listing.category];
  const categoryLabel = categoryInfo ? categoryInfo.label + (listing.subcategory ? ` / ${listing.subcategory}` : '') : listing.category;
  const thumbHtml = listing.imageUrl
    ? `<img src="${escapeHtml(listing.imageUrl)}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex:0 0 auto;" />`
    : `<div style="width:40px;height:40px;border-radius:6px;background:var(--bg);flex:0 0 auto;"></div>`;

  const actionHtml =
    listing.status === 'active'
      ? `<form method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/listings/${encodeURIComponent(listing.id)}/close">
          <button type="submit" style="background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">Close</button>
        </form>`
      : `<form method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/listings/${encodeURIComponent(listing.id)}/reopen">
          <button type="submit" style="background:none;border:1px solid var(--accent);color:var(--accent);border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">Reopen</button>
        </form>`;

  return `<tr style="border-top:1px solid var(--border);">
    <td style="padding:12px 10px;"><div style="display:flex;align-items:center;gap:10px;">${thumbHtml}<span style="font-size:13px;color:var(--text);font-weight:600;">${escapeHtml(listing.title)}</span></div></td>
    <td style="padding:12px 10px;font-size:12.5px;color:var(--text-muted);">${escapeHtml(categoryLabel)}</td>
    <td style="padding:12px 10px;font-size:13px;color:var(--text);font-weight:600;">&#3647;${Number(listing.priceThb).toLocaleString('en-US')}</td>
    <td style="padding:12px 10px;">${statusBadgeHtml(listing.status)}</td>
    <td style="padding:12px 10px;text-align:right;">${actionHtml}</td>
  </tr>`;
}

/**
 * ตาราง "ประกาศขายของฉัน" ทั้งก้อน — โชว์ข้อความเฉยๆ ถ้ายังไม่เคยลงขายอะไรเลย
 */
function myListingsSectionHtml(listings, categories, guildId) {
  if (listings.length === 0) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:22px 24px;">
      <div style="font-size:15px;font-weight:700;color:var(--text);">My listings</div>
      <div style="font-size:12.5px;color:var(--text-muted);margin-top:8px;">You haven't listed anything yet — use the form above to list your first item.</div>
    </div>`;
  }

  const rowsHtml = listings.map((listing) => listingRowHtml(listing, categories, guildId)).join('');

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:22px 24px;">
    <div style="font-size:15px;font-weight:700;color:var(--text);">My listings <span style="color:var(--text-muted);font-weight:400;">(${listings.length})</span></div>
    <table style="width:100%;border-collapse:collapse;margin-top:14px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:0 10px 8px;font-size:11.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Item</th>
          <th style="text-align:left;padding:0 10px 8px;font-size:11.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Category</th>
          <th style="text-align:left;padding:0 10px 8px;font-size:11.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Price</th>
          <th style="text-align:left;padding:0 10px 8px;font-size:11.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>`;
}

/**
 * หน้า Marketplace เต็มหน้า
 * @param {object} opts
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {{paymentMethod?:string,promptpayId?:string,paymentLink?:string}|null} opts.seller
 * @param {object[]} opts.listings  listSellerListings() + imageUrl resolved แล้ว
 * @param {object} opts.categories CATEGORIES จาก marketplaceStorage.js
 * @param {boolean} opts.saved
 * @param {string|null} opts.error
 */
function renderMarketplaceDashboardPage({ guild, user, botAvatarUrl, botName, seller, listings, categories, saved, error }) {
  // 🆕 [12 ต.ค. 2569] เช็คทั้ง 2 ช่องทาง (promptpayId หรือ paymentLink) แทนที่จะเช็คแค่
  // promptpayId ตรงๆ แบบเดิม — ดูเหตุผลเต็มๆ ที่คอมเมนต์ paymentMethodSectionHtml ด้านบน
  const canSell = Boolean(seller?.promptpayId) || Boolean(seller?.paymentLink);

  // 🆕 [12 ต.ค. 2569] ขยาย max-width ของหน้าทั้งหน้าจาก 720px เป็น 980px เพื่อให้ sellWizardHtml()
  // มีที่พอสำหรับ 2 คอลัมน์ (พรีวิว + ฟอร์ม) วางคู่กันแบบสบายๆ — ส่วนอื่น (payment section,
  // ตาราง my listings) ยังจำกัดความกว้างตัวเองด้วย max-width ภายในอยู่แล้ว (420px/560px) เลย
  // ไม่ยืดจนดูแปลกตาม ได้แค่ขอบขวามีที่เหลือเยอะขึ้นเฉยๆ ไม่กระทบอะไร
  const bodyHtml = `<div style="padding:44px 56px;max-width:980px;">
    <div style="font-size:24px;font-weight:700;color:var(--text);">Marketplace</div>
    <div style="font-size:13.5px;color:var(--text-muted);margin-top:10px;line-height:1.7;">
      Sell decorations or services to other Discord server owners — set up everything right here,
      no need to run commands in Discord. This is the same data as the
      <code style="background:rgba(124,131,253,0.12);color:var(--accent);padding:1px 6px;border-radius:4px;font-size:12.5px;">/marketplace</code>
      slash command, so both stay in sync.
    </div>

    ${bannerHtml({ saved, error })}
    ${disclosureHtml()}
    ${paymentMethodSectionHtml(seller, guild.id)}
    ${sellWizardHtml(categories, canSell, guild.id, user.username)}
    ${myListingsSectionHtml(listings, categories, guild.id)}
  </div>`;

  return renderDashboardLayout({
    title: `Marketplace — ${guild.name} — Aitao Bot`,
    guild,
    user,
    activeKey: 'marketplace',
    botAvatarUrl,
    botName,
    bodyHtml,
  });
}

module.exports = { renderMarketplaceDashboardPage };
