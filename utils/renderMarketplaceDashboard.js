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
//      ใช้ JS เล็กๆ แค่โชว์/ซ่อนช่อง subcategory ตามหมวดที่เลือก และโชว์/ซ่อนช่องไฟล์ดิจิทัล
//      ตาม type ที่เลือก (ไม่ทำแบบ 100% zero-JS เหมือนหน้า Language/Premium เพราะฟอร์มนี้
//      มีเงื่อนไขเปลี่ยนหน้าตาตามตัวเลือกจริงๆ ต่างจากหน้าอื่นที่เป็นแค่เลือก 1 ใน 2 เฉยๆ)
//   3. ตาราง "ประกาศขายของฉัน" — ทุกสถานะ มีปุ่มปิด/เปิดขายใหม่ต่อแถว
//
// ⚠️ ไฟล์แนบ (รูปปก/ไฟล์ดิจิทัล) ที่อัปโหลดจากฟอร์มนี้ จะถูกเก็บแบบ "ถาวรจริงๆ" ผ่าน
// utils/assetStorage.js (โพสต์เข้าห้อง asset-storage ของเซิร์ฟ แล้วเก็บแค่พิกัดข้อความไว้)
// ไม่ใช่เก็บ URL ตรงๆ แบบที่คำสั่ง /marketplace sell เคยทำ (ดูคอมเมนต์ยาวๆ ในไฟล์นั้น) —
// server.js เป็นคนเรียก storeBufferPermanently() จริง ไฟล์นี้มีหน้าที่แค่วาด HTML เท่านั้น
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');
const { renderDashboardLayout } = require('./dashboardShell');

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
 * การ์ดตั้งค่าเลขพร้อมเพย์ — ถ้ายังไม่เคยตั้งเลย โชว์เตือนด้วยกรอบสีทอง ถ้าตั้งแล้วโชว์เลข
 * เดิม (เต็มเลขไปเลย ไม่ต้องซ่อนครึ่งเลข เพราะเป็นข้อมูลของตัวเองดูเองในแดชบอร์ดของตัวเอง)
 * @param {{ promptpayId: string }|null} seller
 * @param {string} guildId
 */
function promptPaySectionHtml(seller, guildId) {
  const hasPromptPay = Boolean(seller?.promptpayId);
  const warningHtml = !hasPromptPay
    ? `<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(244,184,96,0.1);border:1px solid var(--gold);border-radius:6px;padding:12px 16px;margin-bottom:16px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex:0 0 auto;margin-top:1px;"><path d="M12 3l9 16H3l9-16z" stroke="#f4b860" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v3.5M12 17h.01" stroke="#f4b860" stroke-width="1.7" stroke-linecap="round"/></svg>
        <span style="font-size:13px;color:var(--gold);line-height:1.6;">You need to set a PromptPay number before you can list anything — this is where buyers' QR payments get sent.</span>
      </div>`
    : '';

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:22px 24px;margin-bottom:28px;">
    <div style="font-size:15px;font-weight:700;color:var(--text);">PromptPay number</div>
    <div style="font-size:12.5px;color:var(--text-muted);margin-top:6px;line-height:1.6;">
      Buyers scan a QR code generated from this number and pay you directly — Milo Bot never touches the money.
      Mobile number only, 10 digits, must already be linked to PromptPay at your bank.
    </div>
    ${warningHtml}
    <form method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/promptpay" style="margin-top:14px;display:flex;gap:10px;max-width:360px;">
      <input
        type="text" name="promptpay_id" placeholder="0812345678" pattern="\\d{10}" maxlength="10" required
        value="${hasPromptPay ? escapeHtml(seller.promptpayId) : ''}"
        style="flex:1 1 auto;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;"
      />
      <button type="submit" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:0 20px;font-size:13px;font-weight:700;cursor:pointer;">
        ${hasPromptPay ? 'Update' : 'Save'}
      </button>
    </form>
  </div>`;
}

/**
 * ฟอร์ม "ลงขายสินค้าใหม่" — multipart/form-data (มีไฟล์แนบ) disabled ทั้งฟอร์มถ้ายังไม่ตั้ง
 * พร้อมเพย์ (กันกดลงขายไปแล้วเจอ error กลับมาเฉยๆ บอกเหตุผลตรงๆ ให้ไปตั้งพร้อมเพย์ก่อนดีกว่า)
 * @param {object} categories CATEGORIES object จาก marketplaceStorage.js
 * @param {boolean} canSell seller ตั้งพร้อมเพย์ไว้แล้วหรือยัง
 */
function newListingFormHtml(categories, canSell, guildId) {
  const categoryOptionsHtml = Object.entries(categories)
    .map(([value, info]) => `<option value="${escapeHtml(value)}">${escapeHtml(info.label)}</option>`)
    .join('');

  // ข้อมูลหมวดย่อยส่งให้ JS ฝั่ง client เป็น JSON เลย (ไม่ต้องยิง API แยก) — ใช้ตอน
  // เปลี่ยน <select name="category"> แล้วต้องรู้ว่าหมวดนี้มีหมวดย่อยให้เลือกไหม
  const subcategoryMapJson = JSON.stringify(
    Object.fromEntries(Object.entries(categories).map(([value, info]) => [value, info.subcategories || null]))
  ).replace(/</g, '\\u003c'); // กัน </script> หลุดโผล่กลางหน้าถ้ามีใครตั้งชื่อหมวดแปลกๆ ในอนาคต

  const disabledAttr = canSell ? '' : 'disabled';
  const disabledNoteHtml = canSell
    ? ''
    : `<div style="font-size:12.5px;color:var(--text-muted);margin-top:10px;">Set your PromptPay number above first to unlock this form.</div>`;

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:22px 24px;margin-bottom:28px;${canSell ? '' : 'opacity:0.6;'}">
    <div style="font-size:15px;font-weight:700;color:var(--text);">List a new item</div>
    <div style="font-size:12.5px;color:var(--text-muted);margin-top:6px;line-height:1.6;">
      Fill this in once and it shows up on the public Marketplace page right away.
    </div>

    <form method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/listings" enctype="multipart/form-data" style="margin-top:18px;display:flex;flex-direction:column;gap:16px;max-width:560px;">
      <label style="display:flex;flex-direction:column;gap:6px;">
        <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Title</span>
        <input type="text" name="title" maxlength="80" required ${disabledAttr}
          style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;" />
      </label>

      <label style="display:flex;flex-direction:column;gap:6px;">
        <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Description</span>
        <textarea name="description" maxlength="1000" rows="4" required ${disabledAttr}
          style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;font-family:inherit;resize:vertical;"></textarea>
      </label>

      <div style="display:flex;gap:14px;">
        <label style="display:flex;flex-direction:column;gap:6px;flex:1 1 auto;">
          <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Price (THB)</span>
          <input type="number" name="price" min="1" max="20000" step="1" required ${disabledAttr}
            style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;flex:1 1 auto;">
          <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Type</span>
          <select name="type" id="mkt-type-select" required ${disabledAttr}
            style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:10px 12px;border-radius:6px;">
            <option value="service">Service (you contact the buyer yourself)</option>
            <option value="digital">Digital file (sent automatically after payment)</option>
          </select>
        </label>
      </div>

      <div style="display:flex;gap:14px;">
        <label style="display:flex;flex-direction:column;gap:6px;flex:1 1 auto;">
          <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Category</span>
          <select name="category" id="mkt-category-select" required ${disabledAttr}
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
        <input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" ${disabledAttr}
          style="color:var(--text-muted);font-size:12.5px;" />
      </label>

      <label id="mkt-digitalfile-label" style="display:none;flex-direction:column;gap:6px;">
        <span style="font-size:12.5px;font-weight:600;color:var(--text-muted);">Digital file <span style="color:var(--text-muted);font-weight:400;">(sent to the buyer automatically — required for digital items, up to 20MB)</span></span>
        <input type="file" name="digitalFile" id="mkt-digitalfile-input" ${disabledAttr}
          style="color:var(--text-muted);font-size:12.5px;" />
      </label>

      <button type="submit" ${disabledAttr}
        style="align-self:flex-start;background:var(--accent);color:#fff;border:none;border-radius:6px;padding:11px 24px;font-size:13.5px;font-weight:700;cursor:pointer;">
        List item
      </button>
    </form>
    ${disabledNoteHtml}
  </div>

  <script>
    // 🆕 JS เล็กๆ แค่ 2 อย่าง: (1) โชว์/ซ่อนช่อง "Subcategory" + เติม option ให้ตรงหมวดที่
    // เลือก (2) โชว์/ซ่อนช่อง "Digital file" ตาม type ที่เลือก — ไม่มีอะไรซับซ้อนไปกว่านี้
    // ฟอร์มยังทำงานได้แบบ submit ตรงๆ เหมือนฟอร์มอื่นในแดชบอร์ด ไม่มี AJAX/fetch เลย
    (function () {
      var SUBCATS = ${subcategoryMapJson};
      var categorySelect = document.getElementById('mkt-category-select');
      var subcatLabel = document.getElementById('mkt-subcategory-label');
      var subcatSelect = document.getElementById('mkt-subcategory-select');
      var typeSelect = document.getElementById('mkt-type-select');
      var fileLabel = document.getElementById('mkt-digitalfile-label');
      var fileInput = document.getElementById('mkt-digitalfile-input');

      function updateSubcategory() {
        var subs = SUBCATS[categorySelect.value] || null;
        if (subs && subs.length) {
          subcatSelect.innerHTML = subs.map(function (s) {
            return '<option value="' + s + '">' + s + '</option>';
          }).join('');
          subcatSelect.required = true;
          subcatLabel.style.display = 'flex';
        } else {
          subcatSelect.innerHTML = '';
          subcatSelect.required = false;
          subcatLabel.style.display = 'none';
        }
      }

      function updateDigitalFile() {
        var isDigital = typeSelect.value === 'digital';
        fileLabel.style.display = isDigital ? 'flex' : 'none';
        fileInput.required = isDigital;
      }

      if (categorySelect) {
        categorySelect.addEventListener('change', updateSubcategory);
        updateSubcategory();
      }
      if (typeSelect) {
        typeSelect.addEventListener('change', updateDigitalFile);
        updateDigitalFile();
      }
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
 * @param {{promptpayId:string}|null} opts.seller
 * @param {object[]} opts.listings  listSellerListings() + imageUrl resolved แล้ว
 * @param {object} opts.categories CATEGORIES จาก marketplaceStorage.js
 * @param {boolean} opts.saved
 * @param {string|null} opts.error
 */
function renderMarketplaceDashboardPage({ guild, user, botAvatarUrl, botName, seller, listings, categories, saved, error }) {
  const canSell = Boolean(seller?.promptpayId);

  const bodyHtml = `<div style="padding:44px 56px;max-width:720px;">
    <div style="font-size:24px;font-weight:700;color:var(--text);">Marketplace</div>
    <div style="font-size:13.5px;color:var(--text-muted);margin-top:10px;line-height:1.7;">
      Sell decorations or services to other Discord server owners — set up everything right here,
      no need to run commands in Discord. This is the same data as the
      <code style="background:rgba(124,131,253,0.12);color:var(--accent);padding:1px 6px;border-radius:4px;font-size:12.5px;">/marketplace</code>
      slash command, so both stay in sync.
    </div>

    ${bannerHtml({ saved, error })}
    ${disclosureHtml()}
    ${promptPaySectionHtml(seller, guild.id)}
    ${newListingFormHtml(categories, canSell, guild.id)}
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
