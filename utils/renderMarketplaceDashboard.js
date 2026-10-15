// utils/renderMarketplaceDashboard.js
// ─────────────────────────────────────────────────────────────────────────
// 🆕 [11 ต.ค. 2569] หน้า "Marketplace" จริงในแดชบอร์ด — ย้ายฟีเจอร์ของคำสั่ง
// /marketplace (sell / mylistings / remove / markselling / setpromptpay) ทั้งหมด
// มาทำบนเว็บด้วย ตามที่น้องหนาวขอ: "เข้าหน้าเว็บอยู่แล้ว ยังต้องกลับมาทำอะไรที่ดิสคอร์ด
// มันไม่ใช่อะ" — คำสั่งในดิสคอร์ดยังใช้ได้อยู่เหมือนกันนะครับ (ไม่ได้ลบ) ข้อมูลเก็บที่
// เดียวกัน (data/marketplace.json ผ่าน utils/marketplaceStorage.js) เปลี่ยนจากฝั่งไหน
// ก็เห็นผลเหมือนกันหมด ไม่มีระบบซ้อนทับกัน
//
// 🆕 [13 ต.ค. 2569 — "รอบ 6" ดีไซน์ใหม่] น้องหนาวเปิด persona UI/UX ให้ช่วยรีดีไซน์หน้านี้
// ใหม่ทั้งหน้า (เดิมเป็นกล่อง card บล็อกๆ เหมือนแดชบอร์ดบอททั่วไป) — รีวิวกันเป็น mockup
// ในแชทก่อน 3 รอบ (1. ลองดีไซน์ใหม่ 2. บอกว่า "อยู่ในกล่องเกินไป" เลยทำให้ไม่มีกล่องเลย
// ยกเว้นกรอบพรีวิวอันเดียว 3. ขอให้ "beyond" ขึ้นอีก เลยเพิ่มรายละเอียดเล็กๆ: เส้นหยักใต้
// หัวข้อ, เลขนับไล่ขึ้น, เส้นปะเชื่อมฟอร์ม↔พรีวิว, แสงฟุ้งเปลี่ยนสีตามหมวดหมู่, จุดสถานะ
// เต้นจังหวะเบาๆ) ก่อนค่อยมาแปลงเป็นโค้ดจริงในไฟล์นี้ — จุดที่เปลี่ยนจาก "รอบ 5" (เดิม):
//   - CSS ทั้งหมดย้ายจาก inline style กระจายทุกจุด ไปอยู่รวมกันที่ MARKETPLACE_STYLE ด้านล่าง
//     (ส่งผ่าน opts.extraStyle ของ renderDashboardLayout — ดูคอมเมนต์ใน dashboardShell.js)
//     ทุก class ขึ้นต้นด้วย "mkt-" กันชนกับ CSS ของหน้าอื่นที่ผูก shell เดียวกัน
//   - ตัดกล่อง/เส้นขอบของทุกเซคชันออก ใช้เส้นคั่น (<hr class="mkt-rule">) + ที่ว่างแทน
//     เหลือกรอบจริงแค่ที่เดียว = "กรอบพรีวิวสด" ของฟอร์มลงขาย (เพราะมันคือรูปจอจริงๆ)
//   - การ์ดระบุตัว "ร้าน" (shop-id) ใน mockup ตอนแรกมีชื่อร้าน+วันเปิดร้านสมมติ — ของจริง
//     ไม่มีคอนเซ็ปต์ "ชื่อร้าน" ในระบบเลย (ผู้ขาย = ผู้ใช้ Discord คนหนึ่งตรงๆ) เลยเปลี่ยนมา
//     ใช้ avatar+username Discord จริงของคนที่ล็อกอินอยู่ (user.avatar/user.username ที่ส่งมา
//     อยู่แล้ว) ไม่ใส่ข้อมูลที่ไม่มีจริงลงไปในหน้าเว็บ
//   - ตัวเลขหัวหน้า "active listings" / "sales completed" เป็นของจริง 100% (active listings
//     นับจาก listings ที่ส่งเข้ามา, sales completed ดึงจาก getSellerStats(sellerId) ของ
//     marketplaceStorage.js — ของเดิมมีฟังก์ชันนี้อยู่แล้วแต่ route เดิมไม่ได้เรียกใช้ตรงนี้
//     ต้องเพิ่ม completedSales เป็น prop ใหม่ + แก้ server.js ให้ส่งมาด้วย ดูท้ายไฟล์นี้)
//   - แถว "My listings" เดิมมีคอลัมน์โชว์ "ขายไปกี่ชิ้น" ใน mockup แต่เป็นเลขสมมติ — ระบบจริง
//     เก็บยอดขายสำเร็จรวมทั้งร้าน (ไม่ได้แยกต่อประกาศ) เลยเปลี่ยนคอลัมน์นั้นเป็น "ลงขายมานาน
//     แค่ไหนแล้ว" (relativeTimeLabel จาก listing.createdAt ที่มีอยู่จริง) แทนที่จะโชว์เลข
//     ที่ไม่มีข้อมูลจริงรองรับ
//   - เพิ่มแท็บกรอง All / Active / Closed เหนือตาราง "My listings" (ของใหม่ ไม่มีในรอบ 5)
//     กรองด้วย JS ฝั่ง client เฉยๆ ไม่ยิง request ใหม่ ไม่กระทบ backend เลย
// โครงหน้ายังเหมือนเดิม 3 ส่วน (payment method / sell wizard / my listings) — เปลี่ยนแค่
// หน้าตา ไม่เปลี่ยน logic/validation/route ไหนเลยนอกจาก completedSales ที่เพิ่มมา
//
// 🆕 [13 ต.ค. 2569 — "รอบ 6c"] น้องหนาวลองเข้าหน้าจริงแล้วถามว่า "สลับภาษาไม่ได้" — เช็คแล้ว
// หน้านี้ (และหน้า Dashboard อื่นๆ ทั้งหมด) ไม่เคยมีปุ่มสลับภาษาอยู่เลยจริงๆ ตั้งใจให้เป็น
// อังกฤษล้วนมาตั้งแต่ต้น (คนละระบบกับปุ่ม EN/TH ของหน้าเว็บสาธารณะที่ใช้ site-lang.js และ
// คนละระบบกับหน้า Dashboard "Language" ที่ตั้งภาษาที่บอทตอบในดิสคอร์ด) — น้องหนาวยืนยันว่า
// อยากได้ตัวสลับ EN/TH จริงๆ บนหน้านี้ เลยทำเป็นฟีเจอร์ใหม่ (ขอบเขตแค่หน้า Marketplace
// Dashboard หน้าเดียวก่อน ตามที่น้องหนาวบอกไว้ว่า "เอาทีละหน้าก่อนก็ได้"):
//   - ปุ่ม EN/TH เล็กๆ มุมบนขวา (ข้าง eyebrow "Seller dashboard") หน้าตาเหมือนแท็บอื่นในหน้านี้
//   - ข้อความ UI หลักๆ ของหน้า (หัวข้อ, คำอธิบาย, disclosure, ชื่อช่อง, ปุ่ม, ข้อความ validate,
//     สถานะ Active/Closed, แท็บกรอง ฯลฯ) สลับไทย/อังกฤษได้จริง ผ่าน data-i18n attribute + ตัว
//     แปล MKT_I18N ด้านล่างสุดของ bodyHtml (สลับด้วย JS ฝั่ง client ล้วนๆ ไม่มีการโหลดหน้าใหม่)
//   - จำภาษาที่เลือกไว้ใน localStorage (key "aitaoDashboardLang") แยกจาก "aitaoLang" ของ
//     หน้าเว็บสาธารณะ เพราะเป็นหน้าคนละ context กัน ไม่อยากให้สลับหน้านี้แล้วหน้าเว็บสาธารณะ
//     เปลี่ยนไปด้วยโดยไม่ตั้งใจ (หรือกลับกัน)
//   - ⚠️ "ไม่" แปล: ชื่อหมวดหมู่สินค้า (Servers/Media/ฯลฯ มาจาก categories ที่ marketplaceStorage.js
//     ส่งมา เป็นชุดข้อมูลคนละไฟล์ ถ้าจะแปลต้องลงรายละเอียดเพิ่มอีกรอบ), ข้อความ error จาก
//     server (banner แจ้งผิดพลาด ?error=... เป็นข้อความที่ server สร้างไว้แล้ว), และข้อมูลที่
//     ผู้ขาย/ผู้ซื้อพิมพ์เอง (ชื่อสินค้า คำอธิบาย ชื่อ Discord) — เหมือนหน้าเว็บสาธารณะที่ไม่
//     แปลเนื้อหาที่ผู้ใช้พิมพ์เองเหมือนกัน
//   - เพราะปุ่มสลับอยู่ในหน้านี้เอง (ไม่ได้แก้ dashboardShell.js ที่ทุกหน้าใช้ร่วมกัน) ตอนโหลด
//     หน้าครั้งแรกอาจมีกระพริบเป็นอังกฤษแว้บนึงก่อนสลับเป็นไทยอัตโนมัติ (ถ้าเคยเลือกไทยไว้ก่อน)
//     เพราะต้องรอ JS รันหลัง HTML โหลดเสร็จก่อน — เป็น trade-off ที่ตั้งใจเพื่อไม่ไปแก้ชิ้นส่วน
//     ที่ใช้ร่วมกับหน้าอื่น ถ้าอยากให้เนียนขึ้นค่อยทำเป็นรอบถัดไปได้
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml, defaultAvatarUrl } = require('./renderServerPicker');
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

// ── CSS เฉพาะหน้า Marketplace (รอบ 6 — ดีไซน์ใหม่) ───────────────────────
// ก๊อปแนวคิดมาจาก mockup ที่รีวิวกันในแชท (ดูคอมเมนต์หัวไฟล์) — ส่งเข้า
// renderDashboardLayout() ผ่าน opts.extraStyle ด้านล่างสุดของไฟล์นี้ ทุก selector ขึ้นต้น
// ด้วย "mkt-" (หรือ ".mkt-xxx .dot/.cat-dot" ที่ซ้อนอยู่ข้างใน) กันชนกับ CSS กลางของ
// dashboardShell.js หรือหน้าอื่นๆ ที่ใช้ extraStyle ของตัวเอง
const MARKETPLACE_STYLE = `
  .mkt-page { position: relative; max-width: 1100px; }
  /* เกรนจางๆ แค่ในกรอบเนื้อหาของหน้านี้ (ไม่ทำเป็น fixed เต็มจอ เพราะจะทับ sidebar ด้วย) */
  .mkt-grain {
    position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-image: radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 3px 3px;
  }
  .mkt-glow {
    position: absolute; top: -60px; right: -80px; width: 340px; height: 340px; z-index: 0;
    background: radial-gradient(circle, #f472b6 0%, #7c83fd 55%, transparent 75%);
    opacity: 0.14; filter: blur(70px); pointer-events: none;
  }
  .mkt-rule { border: none; border-top: 1px solid rgba(154,162,196,0.14); margin: 36px 0; position: relative; z-index: 1; }

  .mkt-eyebrow, .mkt-section-eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--text-muted-2); position: relative; padding-left: 13px; display: inline-block;
  }
  .mkt-eyebrow { z-index: 1; }
  .mkt-section-eyebrow { margin-bottom: 7px; }
  .mkt-eyebrow::before, .mkt-section-eyebrow::before {
    content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
    width: 3px; height: 11px; border-radius: 2px; background: linear-gradient(180deg, #f472b6, var(--accent));
  }

  .mkt-header-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-top: 12px; flex-wrap: wrap; position: relative; z-index: 1; }
  .mkt-h1 { font-weight: 800; font-size: 35px; margin: 0; color: var(--text); line-height: 1; position: relative; }
  .mkt-squiggle { position: absolute; left: 2px; bottom: -11px; }
  .mkt-stat-pair { display: flex; gap: 32px; }
  .mkt-stat { text-align: right; }
  .mkt-stat b { display: block; font-size: 26px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; line-height: 1; }
  .mkt-stat span { font-size: 12px; color: var(--text-muted-2); white-space: nowrap; }
  .mkt-subtitle { margin: 18px 0 0; max-width: 68ch; font-size: 14.5px; line-height: 1.75; color: var(--text-muted); position: relative; z-index: 1; }
  .mkt-subtitle code { background: rgba(124,131,253,0.12); color: var(--accent); padding: 2px 7px; border-radius: 4px; font-size: 13.5px; }

  .mkt-banner { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid var(--border); margin: 22px 0 -4px; font-size: 13px; font-weight: 600; position: relative; z-index: 1; }
  .mkt-banner .dot { width: 6px; height: 6px; border-radius: 999px; flex: 0 0 auto; }
  .mkt-banner.is-ok { color: var(--teal); } .mkt-banner.is-ok .dot { background: var(--teal); }
  .mkt-banner.is-error { color: #e8828a; } .mkt-banner.is-error .dot { background: #e8828a; }

  .mkt-disclosure-line { position: relative; z-index: 1; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--text-muted-2); margin-bottom: 34px; }
  .mkt-disclosure-line button { background: none; border: none; color: var(--text-muted); font-size: 12.5px; font-weight: 700; cursor: pointer; padding: 0; text-decoration: underline; text-decoration-color: var(--border); text-underline-offset: 3px; font-family: inherit; }
  .mkt-disclosure-line button:hover { color: var(--text); text-decoration-color: var(--text-muted); }
  .mkt-disclosure-detail { margin-top: 10px; font-size: 12px; color: var(--text-muted-2); line-height: 1.75; max-width: 64ch; }
  .mkt-disclosure-detail ul { margin: 6px 0 0; padding-left: 18px; }
  .mkt-disclosure-detail li { margin-bottom: 4px; }

  .mkt-shop-strip { position: relative; z-index: 1; display: flex; align-items: center; gap: 36px; flex-wrap: wrap; margin-bottom: 34px; }
  .mkt-shop-id:hover .mkt-shop-avatar { transform: rotate(0deg) scale(1.08); }
  .mkt-shop-avatar { transform: rotate(-4deg); transition: transform 0.25s ease; }
  .mkt-pm-top { display: flex; align-items: baseline; gap: 16px; }
  .mkt-pm-label { font-size: 12px; color: var(--text-muted-2); white-space: nowrap; }
  .mkt-tab-row { display: flex; gap: 20px; }
  .mkt-text-tab {
    background: none; border: none; cursor: pointer; font-family: inherit;
    padding: 2px 0 7px; font-size: 13px; font-weight: 600; color: var(--text-muted-2);
    border-bottom: 2px solid transparent; transition: color 0.15s, border-color 0.15s;
  }
  .mkt-text-tab[aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent); }
  .mkt-text-tab:hover { color: var(--text); }
  .mkt-pm-field-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; max-width: 420px; }
  .mkt-line-input {
    flex: 1 1 auto; min-width: 0; background: transparent; border: none; border-bottom: 1.5px solid var(--border);
    color: var(--text); font-family: inherit; font-size: 13.5px; padding: 7px 2px;
    font-variant-numeric: tabular-nums; transition: border-color 0.15s;
  }
  .mkt-line-input::placeholder { color: var(--text-muted-2); }
  .mkt-line-input:focus { outline: none; border-color: var(--accent); }
  .mkt-line-input:disabled { opacity: 0.5; cursor: not-allowed; }
  .mkt-btn-text { flex: 0 0 auto; background: none; border: none; color: var(--accent); font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; padding: 6px 2px; }
  .mkt-btn-text:hover { color: #fff; }
  .mkt-pm-help { font-size: 11.5px; color: var(--text-muted-2); margin-top: 8px; line-height: 1.6; max-width: 420px; }
  .mkt-pm-warning { font-size: 12.5px; color: var(--gold); margin-top: 10px; line-height: 1.6; max-width: 420px; }

  .mkt-wizard h2 { font-weight: 800; font-size: 23px; margin: 0; color: var(--text); }
  .mkt-progress-rule { display: flex; align-items: center; gap: 12px; margin: 18px 0 30px; max-width: 360px; position: relative; z-index: 1; }
  .mkt-p-node { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; }
  .mkt-p-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--border); transition: background 0.2s; flex: 0 0 auto; }
  .mkt-p-node.is-done .mkt-p-dot, .mkt-p-node.is-active .mkt-p-dot { background: var(--accent); }
  .mkt-p-text { font-size: 12.5px; font-weight: 600; color: var(--text-muted-2); white-space: nowrap; transition: color 0.2s; }
  .mkt-p-node.is-active .mkt-p-text { color: var(--text); }
  .mkt-p-node.is-done .mkt-p-text { color: var(--text-muted); }
  .mkt-p-fill { flex: 1 1 auto; height: 1.5px; background: var(--border); }
  .mkt-p-fill.is-done { background: var(--accent); }

  /* 🆕 รอบ 6b: น้องหนาวบอกว่า "ฝั่งขวาโล่ง เล็กอยู่" — ของเดิม mkt-form-col จำกัด max-width
     ไว้แค่ 420px ทำให้เหลือพื้นที่ว่างฝั่งขวาเยอะเกินไป (container กว้างกว่านั้นตั้งแต่แรก)
     ขยาย max-width ให้ฟอร์มยืดเต็มพื้นที่ที่มีจริง + ขยายกรอบพรีวิว/ฟอนต์ทุกจุดให้ใหญ่ขึ้น
     ตามที่ขอ ("ขยายทั้งหมดให้ใหญ่ขึ้น") ไม่ใช่แค่แก้จุดเดียว */
  .mkt-wizard-body { display: flex; gap: 36px; align-items: flex-start; flex-wrap: wrap; position: relative; z-index: 1; }
  .mkt-preview-col { flex: 0 0 auto; position: relative; }
  .mkt-form-col { flex: 1 1 380px; min-width: 300px; max-width: 600px; }
  .mkt-flow-connector { align-self: center; flex: 0 0 auto; opacity: 0.6; }
  .mkt-flow-dash { animation: mktFlowDash 1s linear infinite; }
  @keyframes mktFlowDash { to { stroke-dashoffset: -16; } }
  @media (max-width: 820px) { .mkt-flow-connector { display: none; } }

  .mkt-frame-halo {
    position: absolute; top: 4%; left: 2%; width: 220px; height: 220px; z-index: 0;
    border-radius: 999px; filter: blur(50px); opacity: 0.42; pointer-events: none;
    background: radial-gradient(circle, #f472b6 0%, transparent 70%); transition: background 0.5s ease;
  }
  .mkt-frame-wrap { position: relative; z-index: 1; transform: rotate(-1.4deg); width: 266px; }
  .mkt-live-tag {
    position: absolute; top: -12px; left: 16px; z-index: 2; transform: rotate(-3deg);
    background: var(--accent); color: #fff; font-weight: 700; font-size: 10.5px; letter-spacing: 0.06em;
    text-transform: uppercase; padding: 5px 12px; border-radius: 999px; box-shadow: 0 4px 10px -2px rgba(124,131,253,0.5);
    animation: mktTagPop 0.5s cubic-bezier(.34,1.56,.64,1) 0.2s backwards;
  }
  @keyframes mktTagPop {
    0% { transform: rotate(-3deg) scale(0.5); opacity: 0; }
    60% { transform: rotate(-3deg) scale(1.08); opacity: 1; }
    100% { transform: rotate(-3deg) scale(1); opacity: 1; }
  }
  .mkt-device-frame {
    position: relative; background: #05070f; border: 1px solid rgba(154,162,196,0.16); border-radius: 12px; overflow: hidden;
    box-shadow: 0 24px 46px -18px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.03) inset;
  }
  .mkt-device-frame::after {
    content: ''; position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,0.14), transparent);
    transform: skewX(-20deg); animation: mktShine 1.3s ease-in-out 0.5s 1; pointer-events: none;
  }
  @keyframes mktShine { to { left: 130%; } }
  .mkt-device-bar { display: flex; align-items: center; gap: 6px; padding: 9px 11px; background: #0d1120; }
  .mkt-device-dot { width: 7px; height: 7px; border-radius: 999px; background: #2c3559; }
  .mkt-device-url { flex: 1 1 auto; text-align: center; font-size: 9.5px; color: #5e6688; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 6px; }
  .mkt-preview-note { font-size: 11px; color: var(--text-muted-2); margin-top: 12px; line-height: 1.6; max-width: 266px; transform: rotate(-1.4deg); }

  .mkt-form-step { display: flex; flex-direction: column; gap: 20px; }
  .mkt-field-label { font-size: 12.5px; font-weight: 600; color: var(--text-muted-2); display: block; margin-bottom: 7px; }
  .mkt-field { display: flex; flex-direction: column; }
  .mkt-field-pair { display: flex; gap: 24px; }
  .mkt-field-pair > .mkt-field { flex: 1 1 auto; min-width: 0; }
  textarea.mkt-line-input { resize: vertical; font-family: inherit; min-height: 92px; padding-top: 0; }
  select.mkt-line-input { cursor: pointer; }
  select.mkt-line-input option { background: #0d1120; }
  input[type="file"].mkt-line-input { font-size: 13px; cursor: pointer; padding: 5px 0; color: var(--text-muted-2); }
  input[type="file"].mkt-line-input::file-selector-button {
    background: none; border: none; color: var(--accent); font-weight: 700; font-size: 13px; cursor: pointer; padding: 0; margin-right: 10px; font-family: inherit;
  }
  .mkt-line-input { font-size: 15px; padding: 9px 2px; }

  .mkt-wizard-nav { display: flex; align-items: center; gap: 20px; margin-top: 22px; }
  .mkt-btn-primary {
    font-family: inherit; font-size: 14.5px; font-weight: 700; border-radius: 999px; border: none;
    padding: 12px 26px; cursor: pointer; background: var(--accent); color: #fff; display: inline-flex;
    align-items: center; gap: 8px; transition: background 0.15s, transform 0.08s, box-shadow 0.15s;
  }
  .mkt-btn-primary:hover { background: var(--accent-hover); box-shadow: 0 10px 22px -8px rgba(124,131,253,0.5); }
  .mkt-btn-primary:active { transform: scale(0.97); }
  .mkt-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
  .mkt-btn-link { background: none; border: none; color: var(--text-muted-2); font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 5px; }
  .mkt-btn-link:hover { color: var(--text); }
  .mkt-btn-link:disabled { opacity: 0.5; cursor: not-allowed; }
  .mkt-wiz-error { font-size: 12px; color: #e8828a; margin-top: 12px; }

  .mkt-listings-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 14px; position: relative; z-index: 1; }
  .mkt-listings-head h2 { font-weight: 800; font-size: 19px; margin: 0; color: var(--text); }
  .mkt-listings-head .count { color: var(--text-muted-2); font-weight: 500; }
  .mkt-listing-list { margin-top: 18px; position: relative; z-index: 1; }
  .mkt-listing-row { display: flex; align-items: center; gap: 16px; padding: 15px 0; border-bottom: 1px solid rgba(154,162,196,0.12); }
  .mkt-listing-row:first-child { border-top: 1px solid rgba(154,162,196,0.12); }
  .mkt-listing-thumb { width: 42px; height: 42px; border-radius: 8px; flex: 0 0 auto; position: relative; background-size: cover; background-position: center; }
  .mkt-listing-thumb .cat-dot { position: absolute; bottom: -2px; right: -2px; width: 9px; height: 9px; border-radius: 999px; border: 2px solid var(--bg); }
  .mkt-listing-main { flex: 1 1 auto; min-width: 0; }
  .mkt-listing-title { font-size: 14.5px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color 0.12s; }
  .mkt-listing-row:hover .mkt-listing-title { color: var(--accent); }
  .mkt-listing-sub { font-size: 12.5px; color: var(--text-muted-2); margin-top: 3px; }
  .mkt-listing-meta { font-size: 12px; color: var(--text-muted-2); flex: 0 0 auto; width: 90px; text-align: right; }
  .mkt-listing-price { font-size: 14.5px; font-weight: 700; color: var(--gold); font-variant-numeric: tabular-nums; flex: 0 0 auto; width: 68px; text-align: right; }
  .mkt-listing-status { flex: 0 0 auto; width: 76px; display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; }
  .mkt-listing-status .dot { width: 6px; height: 6px; border-radius: 999px; flex: 0 0 auto; }
  .mkt-listing-status.is-active { color: var(--teal); } .mkt-listing-status.is-active .dot { background: var(--teal); animation: mktPulseTeal 2.2s ease-in-out infinite; }
  .mkt-listing-status.is-closed { color: var(--text-muted-2); } .mkt-listing-status.is-closed .dot { background: var(--text-muted-2); }
  @keyframes mktPulseTeal { 0%, 100% { box-shadow: 0 0 0 0 rgba(82,199,192,0.35); } 50% { box-shadow: 0 0 0 4px rgba(82,199,192,0.15); } }
  .mkt-listing-action { flex: 0 0 auto; width: 58px; text-align: right; }
  .mkt-btn-row-action { background: none; border: none; color: var(--text-muted-2); font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; padding: 0; text-decoration: underline; text-decoration-color: transparent; }
  .mkt-btn-row-action:hover { color: var(--text); text-decoration-color: var(--text-muted-2); }
  .mkt-btn-row-action.is-reopen { color: var(--accent); }
  .mkt-btn-row-action.is-reopen:hover { text-decoration-color: var(--accent); }

  @media (max-width: 759px) {
    .mkt-h1 { font-size: 27px; }
    .mkt-header-row { flex-direction: column; align-items: flex-start; }
    .mkt-shop-strip { flex-direction: column; align-items: flex-start; gap: 18px; }
    .mkt-wizard-body { flex-direction: column; gap: 26px; }
    .mkt-frame-wrap { width: 100%; max-width: 270px; }
    .mkt-form-col { max-width: none; }
    .mkt-listing-meta { display: none; }
    .mkt-glow { width: 220px; height: 220px; top: -40px; right: -40px; }
  }
`;

/** แปลง createdAt ของประกาศ เป็นข้อความสั้นๆ แบบ "3d ago" — ใช้แทนคอลัมน์ "ขายไปกี่ชิ้น"
 * เดิมที่เป็นเลขสมมติใน mockup (ระบบจริงไม่ได้เก็บยอดขายแยกต่อประกาศ มีแต่ยอดรวมทั้งร้าน
 * จาก getSellerStats() — เอาไปโชว์ที่หัวหน้าแทนแล้ว ดู renderMarketplaceDashboardPage) */
function relativeTimeLabel(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** จุด+ข้อความสถานะประกาศ — แทนที่ statusBadgeHtml เดิม (ป้ายทึบสีพื้นหลัง) ด้วยจุดเต้น
 * จังหวะเบาๆ (เฉพาะ "Active" ที่เต้น — ให้ความรู้สึกว่าร้านกำลังเปิดขายอยู่จริง) ตามแนว
 * "ไม่มีกล่อง" ของดีไซน์รอบนี้ */
function statusIndicatorHtml(status) {
  if (status === 'active') return `<span class="mkt-listing-status is-active"><span class="dot"></span><span data-i18n="statusActive">Active</span></span>`;
  if (status === 'sold') return `<span class="mkt-listing-status is-closed"><span class="dot"></span><span data-i18n="statusSold">Sold</span></span>`;
  return `<span class="mkt-listing-status is-closed"><span class="dot"></span><span data-i18n="statusClosed">Closed</span></span>`;
}

/**
 * แบนเนอร์แจ้งผล (สำเร็จ/ผิดพลาด) — pattern เดียวกับหน้า Language/Premium (query string
 * ?saved=1 / ?error=...) ชั่วคราว หายไปทันทีที่โหลดหน้าใหม่แบบไม่มี query พวกนี้
 * 🆕 รอบ 6: เปลี่ยนจากกล่องสีพื้นหลัง+ขอบ เป็นเส้นบางๆ+จุดสี ตามแนว "ไม่มีกล่อง"
 */
function bannerHtml({ saved, error }) {
  // หมายเหตุ: ข้อความ error มาจาก server ตรงๆ (query string ?error=...) ไม่ได้อยู่ใน
  // MKT_I18N เลย เพราะ server สร้างข้อความนี้ไว้เป็นภาษาอังกฤษตายตัวอยู่แล้ว — ยังไม่แปล
  if (error) return `<div class="mkt-banner is-error"><span class="dot"></span>${escapeHtml(error)}</div>`;
  if (saved) return `<div class="mkt-banner is-ok"><span class="dot"></span><span data-i18n="bannerSaved">Saved!</span></div>`;
  return '';
}

/**
 * 🆕 [12 ต.ค. 2569] ข้อความ disclosure — Feature ความปลอดภัย #3 จาก 4 ข้อที่คุยกันไว้
 * ตอนเข้าสภา LLM Council เรื่องช่องทางจ่ายเงิน (ดูรายละเอียดเต็มๆ ใน claude project doc
 * "marketplace-web-dashboard-build-notes.md") บอกผู้ขายให้ชัดเจนตั้งแต่ก่อนลงขายว่า:
 *   1. นี่คือตลาดซื้อขายกันเอง (peer-to-peer) บอทไม่ได้ถือเงินแทนใคร ไม่ได้ตรวจสอบตัวตน
 *      ผู้ซื้อ-ผู้ขาย และไม่ได้เป็นคู่สัญญาในการซื้อขายนี้เลย
 *   2. ผู้ขายต้องส่งของ/บริการตามที่ตกลงไว้จริง ถ้าไม่ส่งถือว่าผิดเงื่อนไขการใช้งาน
 *      Marketplace นี้ (อาจถูกระงับสิทธิ์การขายได้)
 *   3. ปัดความรับผิดของทีมงาน/บอทจากข้อพิพาทระหว่างผู้ใช้ — ไม่ใช่คำแนะนำทางกฎหมาย
 *      แค่ข้อความแจ้งเงื่อนไขการใช้งานตรงๆ ให้ผู้ขายเข้าใจก่อนเริ่มขายเท่านั้น
 * 🆕 รอบ 6: เดิมเป็นกล่องไอคอน+ข้อความเต็มโชว์ตลอด เปลี่ยนเป็นข้อความสั้นบรรทัดเดียว +
 * ปุ่ม "what this means" กดขยายดูรายละเอียดเต็มทีหลัง (ข้อความเนื้อหาเดิมทุกคำ ไม่ได้ตัด
 * อะไรออก แค่ซ่อนไว้เป็นค่าเริ่มต้นให้หน้าดูโปร่งขึ้น)
 */
function disclosureHtml() {
  return `<div class="mkt-disclosure-line">
    <span data-i18n="disclosureLine">This marketplace is peer-to-peer — Milo Bot never touches the money.</span>
    <button type="button" onclick="mktToggleDisclosure()" id="mkt-disclosure-toggle" data-i18n="disclosureShow">what this means</button>
  </div>
  <div class="mkt-disclosure-detail" id="mkt-disclosure-detail" hidden>
    <ul>
      <li data-i18n="disclosureItem1">Buyers pay your PromptPay (or your payment link) directly — Milo Bot never holds or sees the money, verifies anyone's identity, or acts as a party to the sale.</li>
      <li data-i18n="disclosureItem2">You're responsible for actually delivering what you list. Not delivering, or misrepresenting an item, can get your listings removed or your seller access suspended.</li>
      <li data-i18n="disclosureItem3">Buyers can also report sellers directly from the Marketplace page. This isn't legal advice — just the terms of using this marketplace.</li>
    </ul>
  </div>
  <script>
    function mktToggleDisclosure() {
      var detail = document.getElementById('mkt-disclosure-detail');
      var btn = document.getElementById('mkt-disclosure-toggle');
      var open = !detail.hidden;
      detail.hidden = open;
      // 🆕 รอบ 6c: ข้อความปุ่มนี้ต้องสลับภาษาตามที่เลือกไว้ด้วย ใช้ mktT() (นิยามไว้ใน
      // script ของ MKT_I18N ด้านบนสุดของหน้า) แทนการ hardcode ข้อความอังกฤษตรงๆ
      var key = open ? 'disclosureShow' : 'disclosureHide';
      btn.setAttribute('data-i18n', key);
      btn.textContent = mktT(key);
    }
  </script>`;
}

/**
 * 🆕 [12 ต.ค. 2569] การ์ดตั้งค่า "ช่องทางรับเงิน" — เลือกได้ 2 ช่องทาง PromptPay (ผู้ขายไทย)
 * หรือลิงก์รับเงินของตัวเอง เช่น PayPal.me/Stripe Payment Link (ผู้ขายต่างชาติ) บอทไม่รู้จัก/
 * ไม่ยุ่งกับช่องทางที่เป็นลิงก์เลย แค่โชว์ให้ผู้ซื้อกดไปจ่ายตรงกับผู้ขายเอง — หลักการ "บอทไม่
 * แตะเงิน" ยังเหมือนเดิมทุกอย่าง (ดูคอมเมนต์เต็มๆ ที่ utils/marketplaceStorage.js หัวข้อ
 * saveSellerPayment)
 *
 * 🆕 รอบ 6: สลับ 2 ช่องทางเปลี่ยนจาก native radio เป็นปุ่มแท็บขีดเส้นใต้ (เหมือนแท็บกรอง
 * ด้านล่างของตาราง my listings — ใช้ component หน้าตาเดียวกันทั้งหน้า) ธาตุ input เบื้องหลัง
 * ยังเป็น <input type="hidden" name="payment_method"> ค่าเดียวกับเดิม 100% — server.js
 * ฝั่งรับไม่ต้องแก้อะไรเลย เปลี่ยนแค่วิธีให้ผู้ใช้เลือกค่านั้นเฉยๆ
 * จงใจ "ไม่" ใส่ required ที่ตัว input ทั้ง 2 ช่อง (เหตุผลเดิม: ถ้าใส่ required ไว้ทั้งคู่
 * ตอน submit เบราว์เซอร์จะ error ใส่ช่องที่ถูกซ่อนไว้ (display:none) ไม่ได้ — เช็ค validate
 * จริงจังฝั่ง server แทน ดู server.js POST .../marketplace/payment)
 *
 * 🆕 รอบ 6: เพิ่มบรรทัด "Selling as <username>" ด้วย avatar+username Discord จริงของคน
 * ที่ล็อกอินอยู่ (user prop) แทนชื่อร้านสมมติที่เคยอยู่ใน mockup — ระบบจริงไม่มีคอนเซ็ปต์
 * "ชื่อร้าน" เลย ผู้ขาย = ผู้ใช้ Discord ตรงๆ
 * @param {{ paymentMethod?: string, promptpayId?: string, paymentLink?: string }|null} seller
 * @param {{id:string, username:string, avatar:string|null}} user
 * @param {string} guildId
 */
function paymentMethodSectionHtml(seller, user, guildId) {
  const hasPromptPay = Boolean(seller?.promptpayId);
  const hasPaymentLink = Boolean(seller?.paymentLink);
  // ของเก่าก่อน 12 ต.ค. 2569 ไม่มี field paymentMethod เลย — fallback เป็น 'promptpay'
  // ถ้ามี promptpayId อยู่แล้ว (เหมือน getSellerPaymentMethod() ใน marketplaceStorage.js)
  const isLink = seller?.paymentMethod === 'link';
  const hasAnyMethod = hasPromptPay || hasPaymentLink;
  const avatarUrl = user.avatar || defaultAvatarUrl(user.id);

  const warningHtml = !hasAnyMethod
    ? `<div class="mkt-pm-warning" data-i18n="pmWarning">You need to set up a payment method before you can list anything — this is how buyers pay you directly.</div>`
    : '';
  const pmBtnKey = hasAnyMethod ? 'pmBtnUpdate' : 'pmBtnSave';
  const pmBtnLabel = hasAnyMethod ? 'Update' : 'Save';
  const pmHelpKey = isLink ? 'pmHelpLink' : 'pmHelpPromptpay';
  const pmHelpText = isLink
    ? "Buyers get sent to this link to pay you directly. Milo Bot never sees what's behind it."
    : 'Buyers scan a QR for this number and pay you directly — no fees, no middle step.';

  return `<div class="mkt-shop-strip">
    <div class="mkt-shop-id" style="display:flex;align-items:center;gap:12px;flex:0 0 auto;">
      <img src="${escapeHtml(avatarUrl)}" alt="" class="mkt-shop-avatar" style="width:40px;height:40px;border-radius:999px;object-fit:cover;" />
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--text);"><span data-i18n="sellingAsPrefix">Selling as</span> ${escapeHtml(user.username)}</div>
        <div style="font-size:11.5px;color:${hasAnyMethod ? 'var(--teal)' : 'var(--text-muted-2)'};margin-top:1px;" data-i18n="${hasAnyMethod ? 'pmSetUp' : 'pmNotSetUp'}">${hasAnyMethod ? 'Payment method set up' : 'Payment method not set up yet'}</div>
      </div>
    </div>

    <div style="flex:1 1 320px;min-width:280px;">
      <div class="mkt-pm-top">
        <span class="mkt-pm-label" data-i18n="pmGetPaidWith">Get paid with</span>
        <div class="mkt-tab-row" role="tablist" aria-label="Payment method">
          <button type="button" class="mkt-text-tab" role="tab" aria-selected="${isLink ? 'false' : 'true'}" id="mkt-pm-tab-promptpay" onclick="mktSelectPaymentMethod('promptpay')"><span data-i18n="pmTabPromptpay">PromptPay</span></button>
          <button type="button" class="mkt-text-tab" role="tab" aria-selected="${isLink ? 'true' : 'false'}" id="mkt-pm-tab-link" onclick="mktSelectPaymentMethod('link')"><span data-i18n="pmTabLink">Payment link</span></button>
        </div>
      </div>

      <form method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/payment">
        <input type="hidden" name="payment_method" id="mkt-pm-hidden-input" value="${isLink ? 'link' : 'promptpay'}" />

        <div class="mkt-pm-field-row" id="mkt-pm-promptpay-field" style="display:${isLink ? 'none' : 'flex'};">
          <input
            class="mkt-line-input" type="text" name="promptpay_id" placeholder="0812345678" pattern="\\d{10}" maxlength="10"
            value="${hasPromptPay ? escapeHtml(seller.promptpayId) : ''}"
          />
          <button type="submit" class="mkt-btn-text"><span data-i18n="${pmBtnKey}">${pmBtnLabel}</span></button>
        </div>
        <div class="mkt-pm-field-row" id="mkt-pm-link-field" style="display:${isLink ? 'flex' : 'none'};">
          <input
            class="mkt-line-input" type="url" name="payment_link" placeholder="https://paypal.me/yourname" maxlength="300"
            value="${hasPaymentLink ? escapeHtml(seller.paymentLink) : ''}"
          />
          <button type="submit" class="mkt-btn-text"><span data-i18n="${pmBtnKey}">${pmBtnLabel}</span></button>
        </div>
      </form>
      ${warningHtml}
      <p class="mkt-pm-help" id="mkt-pm-help" data-i18n="${pmHelpKey}">${pmHelpText}</p>
    </div>
  </div>

  <script>
    function mktSelectPaymentMethod(method) {
      var isLinkMethod = method === 'link';
      document.getElementById('mkt-pm-tab-promptpay').setAttribute('aria-selected', String(!isLinkMethod));
      document.getElementById('mkt-pm-tab-link').setAttribute('aria-selected', String(isLinkMethod));
      document.getElementById('mkt-pm-hidden-input').value = method;
      document.getElementById('mkt-pm-promptpay-field').style.display = isLinkMethod ? 'none' : 'flex';
      document.getElementById('mkt-pm-link-field').style.display = isLinkMethod ? 'flex' : 'none';
      // 🆕 รอบ 6c: อัปเดตทั้ง data-i18n (เผื่อสลับภาษาอีกทีหลังสลับช่องทางแล้ว) และข้อความจริง
      var helpEl = document.getElementById('mkt-pm-help');
      var helpKey = isLinkMethod ? 'pmHelpLink' : 'pmHelpPromptpay';
      helpEl.setAttribute('data-i18n', helpKey);
      helpEl.textContent = mktT(helpKey);
    }
  </script>`;
}

/**
 * 🆕 [12 ต.ค. 2569] ฟอร์ม "ลงขายสินค้าใหม่" เวอร์ชัน wizard 2 สเต็ป + พรีวิวสด — แนวคิด/
 * validation/ชื่อ field ทั้งหมดเหมือนรอบ 5 เป๊ะๆ (ดูคอมเมนต์ยาวๆ เดิมด้านล่างถ้าอยากรู้ว่า
 * ทำไมต้องแยก 2 สเต็ป หรือทำไมห้ามใส่ required ตรงๆ) รอบนี้เปลี่ยนแค่ "หน้าตา":
 *   - กรอบพรีวิวเปลี่ยนเป็น browser-chrome เล็กๆ (จุด 3 สี + แถบชื่อ) ให้ความรู้สึกว่านี่คือ
 *     "จอจริง" มากขึ้น มีแสงฟุ้งสีตามหมวดหมู่ (frame-halo) อยู่ข้างหลัง เปลี่ยนสีตามหมวดที่
 *     เลือกแบบเรียลไทม์ (อัปเดตในฟังก์ชัน updateCardPreview ด้านล่าง) + แสงวิ๊งผ่านกรอบครั้ง
 *     เดียวตอนโหลดหน้า (ทำด้วย CSS ::after ล้วนๆ ไม่ใช่ JS)
 *   - มีป้าย "Live preview" ติดมุมกรอบแบบสติกเกอร์ (เอียงเล็กน้อยเหมือนกรอบ)
 *   - มีเส้นปะพร้อมลูกศรเชื่อมระหว่างฟอร์ม↔พรีวิว (.mkt-flow-connector) ให้เห็นภาพว่า
 *     "พิมพ์ตรงนี้ → ไปโผล่ตรงนั้น" (ซ่อนบนมือถือ/จอแคบ เพราะคอลัมน์ซ้อนกันแล้ว ไม่จำเป็น)
 *   - ช่องกรอกทุกช่องเปลี่ยนจากกรอบสี่เหลี่ยมทึบเป็นขีดเส้นใต้อย่างเดียว (.mkt-line-input)
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
    : `<div style="font-size:12.5px;color:var(--text-muted-2);margin-top:14px;" data-i18n="disabledNote">Set up a payment method above first to unlock this form.</div>`;

  return `<div class="mkt-wizard" style="${canSell ? '' : 'opacity:0.55;'}">
    <div class="mkt-section-eyebrow" data-i18n="wizEyebrow">New listing</div>
    <h2 data-i18n="wizHeading">What are you selling today?</h2>

    <div class="mkt-progress-rule">
      <div class="mkt-p-node is-active" id="mkt-wiz-node1"><span class="mkt-p-dot"></span><span class="mkt-p-text" data-i18n="progressCard">Grid card</span></div>
      <span class="mkt-p-fill" id="mkt-wiz-line1"></span>
      <div class="mkt-p-node" id="mkt-wiz-node2"><span class="mkt-p-dot"></span><span class="mkt-p-text" data-i18n="progressDetail">Full details</span></div>
    </div>

    <form id="mkt-wiz-form" method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/listings" enctype="multipart/form-data">
      <div class="mkt-wizard-body">

        <!-- ═══ ฝั่งซ้าย: พรีวิวสด ═══ สีพวกนี้ตั้งใจ hardcode ไม่ใช้ var(--xxx) ของแดชบอร์ด
             เพราะพรีวิวต้องเลียนแบบหน้า public/marketplace.html (ธีมมืดของมันเอง) ให้ตรงเป๊ะๆ -->
        <div class="mkt-preview-col">
          <div class="mkt-frame-halo" id="mkt-wiz-frame-halo"></div>
          <div class="mkt-frame-wrap">
            <span class="mkt-live-tag" data-i18n="livePreview">Live preview</span>
            <div class="mkt-device-frame">
              <div class="mkt-device-bar">
                <span class="mkt-device-dot"></span><span class="mkt-device-dot"></span><span class="mkt-device-dot"></span>
                <span class="mkt-device-url" data-i18n="devicePreviewLabel">Marketplace preview</span>
              </div>

              <!-- พรีวิวสเต็ป 1: การ์ดในกริด (สไตล์ก๊อปจาก buildListingCardHtml() ใน public/marketplace.html)
                   🆕 รอบ 6b: ขยายขนาดตามกรอบที่ใหญ่ขึ้น (216px → 266px, ~1.23x) ตัวเลขพิกเซลด้านล่าง
                   คูณ 1.2 แบบคร่าวๆจากของเดิมทั้งหมด -->
              <div id="mkt-wiz-preview-card" style="position:relative;height:182px;overflow:hidden;background:linear-gradient(135deg,#1f2937,#2c3559 75%);">
                <div id="mkt-wiz-pc-badge" style="position:absolute;top:11px;left:11px;background:#4b5563;border-radius:999px;padding:4px 10px;font-size:10px;font-weight:700;color:#fff;" data-i18n="chooseCategory">Choose a category&hellip;</div>
                <div style="position:absolute;inset:0;background:linear-gradient(180deg, transparent 42%, rgba(5,7,15,0.94) 100%);"></div>
                <div style="position:absolute;left:16px;right:16px;bottom:13px;">
                  <div id="mkt-wiz-pc-title" style="font-size:15px;font-weight:700;color:#fff;line-height:1.3;" data-i18n="previewDefaultTitle">Your item title</div>
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
                    <span style="font-size:12px;color:rgba(255,255,255,0.75);">${escapeHtml(sellerDisplayName || 'You')}</span>
                    <span id="mkt-wiz-pc-price" style="font-size:15px;font-weight:700;color:#f4b860;">&#3647;0</span>
                  </div>
                </div>
              </div>

              <!-- พรีวิวสเต็ป 2: หน้ารายละเอียดเต็ม (สไตล์ก๊อปจาก modal #productDetailModal ในหน้าเดียวกัน) -->
              <div id="mkt-wiz-preview-detail" style="display:none;">
                <div id="mkt-wiz-pd-hero" style="height:98px;position:relative;background:linear-gradient(135deg,#1f2937,#2c3559 75%);">
                  <div id="mkt-wiz-pd-badge" style="position:absolute;top:11px;left:11px;border-radius:999px;padding:4px 11px;font-size:10px;font-weight:700;color:#fff;background:#4b5563;" data-i18n="chooseCategory">Choose a category&hellip;</div>
                </div>
                <div style="padding:14px 16px 16px;">
                  <div id="mkt-wiz-pd-title" style="font-size:15px;font-weight:700;color:#f3f1fb;line-height:1.3;" data-i18n="previewDefaultTitle">Your item title</div>
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
                    <span style="font-size:12px;color:#9aa2c4;">${escapeHtml(sellerDisplayName || 'You')}</span>
                    <span id="mkt-wiz-pd-price" style="font-size:16px;font-weight:700;color:#f4b860;">&#3647;0</span>
                  </div>
                  <div style="height:1px;background:#262f4d;margin:12px 0;"></div>
                  <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:#9aa2c4;text-transform:uppercase;margin-bottom:5px;" data-i18n="fieldDescription">Description</div>
                  <div id="mkt-wiz-pd-desc" style="font-size:12.5px;color:#c3c8e6;line-height:1.6;" data-i18n="previewDefaultDesc">Your description will show up here.</div>
                  <div id="mkt-wiz-pd-filebadge" style="display:none;margin-top:9px;font-size:12px;color:#7fc9c0;"></div>
                </div>
              </div>
            </div>
          </div>
          <p class="mkt-preview-note" data-i18n="previewNote">Mirrors the real Marketplace page — this is what buyers actually see.</p>
        </div>

        <div class="mkt-flow-connector" aria-hidden="true">
          <svg width="36" height="22" viewBox="0 0 40 24" fill="none">
            <path d="M36 12H6" stroke="#7c83fd" stroke-width="1.5" stroke-dasharray="4 4" class="mkt-flow-dash"/>
            <path d="M12 6L6 12L12 18" stroke="#7c83fd" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- ═══ ฝั่งขวา: ฟอร์มของสเต็ปที่กำลังทำอยู่ ═══ -->
        <div class="mkt-form-col">
          <div style="display:flex;align-items:baseline;gap:9px;margin-bottom:4px;">
            <span id="mkt-wiz-dot1" style="width:7px;height:7px;border-radius:999px;background:var(--accent);"></span>
            <span id="mkt-wiz-dot2" style="width:7px;height:7px;border-radius:999px;background:var(--border);"></span>
            <span style="font-size:12px;font-weight:700;color:var(--text-muted-2);text-transform:uppercase;letter-spacing:0.06em;">
              <span data-i18n="stepWord">Step</span> <span id="mkt-wiz-step-label">1</span> <span data-i18n="stepOf2">of 2</span>
            </span>
            <span id="mkt-wiz-step-title" style="font-size:12.5px;color:var(--text-muted-2);" data-i18n="stepTitleStep1">— the card buyers see in the grid</span>
          </div>

          <!-- สเต็ป 1/2: ข้อมูลสำหรับการ์ด -->
          <div class="mkt-form-step" id="mkt-wiz-step1" style="margin-top:18px;">
            <div class="mkt-field">
              <label class="mkt-field-label" data-i18n="fieldTitle">Title</label>
              <input class="mkt-line-input" type="text" name="title" id="mkt-wiz-title-input" maxlength="80" ${disabledAttr} />
            </div>
            <div class="mkt-field">
              <label class="mkt-field-label" data-i18n="fieldPrice">Price (THB)</label>
              <input class="mkt-line-input" type="number" name="price" id="mkt-wiz-price-input" min="1" max="20000" step="1" ${disabledAttr} />
            </div>
            <div class="mkt-field-pair">
              <div class="mkt-field">
                <label class="mkt-field-label" data-i18n="fieldCategory">Category</label>
                <select class="mkt-line-input" name="category" id="mkt-category-select" ${disabledAttr}>
                  <option value="" disabled selected data-i18n="chooseCategory">Choose a category&hellip;</option>
                  ${categoryOptionsHtml}
                </select>
              </div>
              <div class="mkt-field" id="mkt-subcategory-label" style="display:none;">
                <label class="mkt-field-label" data-i18n="fieldSubcategory">Subcategory</label>
                <select class="mkt-line-input" name="subcategory" id="mkt-subcategory-select" ${disabledAttr}></select>
              </div>
            </div>
            <div class="mkt-field">
              <label class="mkt-field-label"><span data-i18n="fieldCoverImage">Cover image</span> <span style="font-weight:400;" data-i18n="fieldCoverImageNote">(shown on the card — optional, up to 20MB)</span></label>
              <input class="mkt-line-input" type="file" name="image" id="mkt-wiz-image-input" accept="image/png,image/jpeg,image/webp,image/gif" ${disabledAttr} />
            </div>
          </div>

          <!-- สเต็ป 2/2: ข้อมูลสำหรับหน้ารายละเอียด — ซ่อนไว้ก่อน เริ่มที่สเต็ป 1 -->
          <div class="mkt-form-step" id="mkt-wiz-step2" style="display:none;">
            <div class="mkt-field">
              <label class="mkt-field-label" data-i18n="fieldDescription">Description</label>
              <textarea class="mkt-line-input" name="description" id="mkt-wiz-desc-input" maxlength="1000" rows="4" ${disabledAttr}></textarea>
            </div>
            <div class="mkt-field">
              <label class="mkt-field-label" data-i18n="fieldType">Type</label>
              <select class="mkt-line-input" name="type" id="mkt-type-select" ${disabledAttr}>
                <option value="service" data-i18n="typeService">Service (you contact the buyer yourself)</option>
                <option value="digital" data-i18n="typeDigital">Digital file (sent automatically after payment)</option>
              </select>
            </div>
            <div class="mkt-field" id="mkt-digitalfile-label" style="display:none;">
              <label class="mkt-field-label"><span data-i18n="fieldDigitalFile">Digital file</span> <span style="font-weight:400;" data-i18n="fieldDigitalFileNote">(sent to the buyer automatically — required for digital items, up to 20MB)</span></label>
              <input class="mkt-line-input" type="file" name="digitalFile" id="mkt-digitalfile-input" ${disabledAttr} />
            </div>
          </div>

          <!-- ข้อความ error ของสเต็ปปัจจุบัน (เช็คด้วย JS ก่อนย้าย/ก่อน submit ไม่ใช่ native required) -->
          <div class="mkt-wiz-error" id="mkt-wiz-step-error" style="display:none;"></div>

          <div class="mkt-wizard-nav">
            <button type="button" class="mkt-btn-link" id="mkt-wiz-back-btn" style="display:none;" ${disabledAttr}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span data-i18n="btnBack">Back</span>
            </button>
            <button type="button" class="mkt-btn-primary" id="mkt-wiz-next-btn" ${disabledAttr}>
              <span data-i18n="btnNext">Next: item details</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button type="submit" class="mkt-btn-primary" id="mkt-wiz-submit-btn" style="display:none;" ${disabledAttr}><span data-i18n="btnSubmit">List item</span></button>
          </div>
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
      var node1 = document.getElementById('mkt-wiz-node1');
      var node2 = document.getElementById('mkt-wiz-node2');
      var line1 = document.getElementById('mkt-wiz-line1');
      var previewCardEl = document.getElementById('mkt-wiz-preview-card');
      var previewDetailEl = document.getElementById('mkt-wiz-preview-detail');
      var frameHalo = document.getElementById('mkt-wiz-frame-halo'); // 🆕 รอบ 6: แสงฟุ้งหลังกรอบพรีวิว

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
        if (!category) return { label: mktT('chooseCategory'), badge: '#4b5563', gradient: 'linear-gradient(135deg,#1f2937,#2c3559 75%)' };
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
        pcTitle.textContent = titleInput.value.trim() || mktT('previewDefaultTitle');
        pcPrice.textContent = formattedPrice();
        // 🆕 รอบ 6: แสงฟุ้งหลังกรอบพรีวิวเปลี่ยนสีตามหมวดหมู่ที่เลือกแบบเรียลไทม์
        frameHalo.style.background = 'radial-gradient(circle, ' + style.badge + ' 0%, transparent 70%)';
      }

      // อัปเดตพรีวิวดีเทล (สเต็ป 2) — เรียกทุกครั้งที่พิมพ์คำอธิบาย/เปลี่ยน type/เลือกไฟล์ด้วย
      // (เรียกพร้อมกับ updateCardPreview เสมอ เพราะ title/price/category ใช้ร่วมกันทั้ง 2 พรีวิว)
      function updateDetailPreview() {
        var style = currentCategoryStyle();
        pdBadge.textContent = style.label;
        pdBadge.style.background = style.badge;
        applyPreviewBackground(pdHero, style);
        pdTitle.textContent = titleInput.value.trim() || mktT('previewDefaultTitle');
        pdPrice.textContent = formattedPrice();
        pdDesc.textContent = descInput.value.trim() || mktT('previewDefaultDesc');
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

      // ── โชว์/ซ่อน subcategory ตามหมวดที่เลือก ──
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

      // ── โชว์/ซ่อน digital file ตาม type ที่เลือก ──
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
      // 🆕 ตัว input ของทั้ง 2 สเต็ปไม่มี attribute "required" ติดอยู่เลยนะครับ เพราะพอแยก
      // เป็น 2 สเต็ปแล้วซ่อนอีกสเต็ปด้วย display:none ถ้ายังมี required ค้างอยู่ในสเต็ปที่
      // ซ่อนไว้ ตอน submit จริง browser จะ error "An invalid form control is not focusable"
      // ทันที — เลยเช็ค validate เองด้วย JS ทั้งหมดแทน
      function showStepError(msg) {
        stepErrorEl.textContent = msg;
        stepErrorEl.style.display = 'block';
      }
      function clearStepError() {
        stepErrorEl.style.display = 'none';
      }

      function validateStep1() {
        if (!titleInput.value.trim()) return mktT('errTitle');
        var price = Number(priceInput.value);
        if (!price || price < 1 || price > 20000) return mktT('errPrice');
        if (!categorySelect.value) return mktT('errCategory');
        if (subcatLabel.style.display !== 'none' && !subcatSelect.value) return mktT('errSubcategory');
        return null;
      }

      function validateStep2() {
        if (!descInput.value.trim()) return mktT('errDescription');
        if (typeSelect.value === 'digital' && (!fileInput.files || !fileInput.files[0])) {
          return mktT('errDigitalFile');
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
        stepTitleEl.setAttribute('data-i18n', 'stepTitleStep2');
        stepTitleEl.textContent = mktT('stepTitleStep2');
        previewCardEl.style.display = 'none';
        previewDetailEl.style.display = 'block';
        node1.classList.remove('is-active'); node1.classList.add('is-done');
        node2.classList.remove('is-done'); node2.classList.add('is-active');
        line1.classList.add('is-done');
      });

      backBtn.addEventListener('click', function () {
        clearStepError();
        step2El.style.display = 'none';
        step1El.style.display = 'flex';
        backBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        nextBtn.style.display = 'inline-flex';
        stepLabelEl.textContent = '1';
        stepTitleEl.setAttribute('data-i18n', 'stepTitleStep1');
        stepTitleEl.textContent = mktT('stepTitleStep1');
        previewDetailEl.style.display = 'none';
        previewCardEl.style.display = 'block';
        node2.classList.remove('is-active'); node2.classList.remove('is-done');
        node1.classList.remove('is-done'); node1.classList.add('is-active');
        line1.classList.remove('is-done');
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
 * แถวประกาศขาย 1 แถว — มีปุ่มปิด/เปิดขายใหม่ (ฟอร์มเล็กๆ ปุ่มเดียวจบ ไม่ต้องพึ่ง JS)
 * ตามสถานะปัจจุบัน 🆕 รอบ 6: เปลี่ยนจาก <tr> ในตารางเป็น flex row คั่นด้วยเส้นบางๆ
 * (.mkt-listing-row) ตามแนว "ไม่มีกล่อง" ของดีไซน์รอบนี้ — คอลัมน์ "ขายไปกี่ชิ้น" เดิม (ที่
 * ไม่มีข้อมูลจริงรองรับต่อประกาศ) เปลี่ยนเป็น "ลงขายมานานแค่ไหนแล้ว" จาก listing.createdAt
 * @param {object} listing { id, title, priceThb, category, subcategory, status, imageUrl, createdAt }
 * @param {object} categories CATEGORIES object
 */
function listingRowHtml(listing, categories, guildId) {
  const categoryInfo = categories[listing.category];
  const categoryLabel = categoryInfo ? categoryInfo.label + (listing.subcategory ? ` / ${listing.subcategory}` : '') : listing.category;
  const styleKey = listing.category === 'media' && listing.subcategory === 'banner' ? 'media:banner' : listing.category;
  const catStyle = CATEGORY_PREVIEW_STYLES[styleKey] || CATEGORY_PREVIEW_STYLES.package;
  const thumbStyle = listing.imageUrl
    ? `background-image:url('${escapeHtml(listing.imageUrl)}');`
    : `background:${catStyle.gradient};`;
  const isActive = listing.status === 'active';

  const actionHtml = isActive
    ? `<form method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/listings/${encodeURIComponent(listing.id)}/close">
        <button type="submit" class="mkt-btn-row-action"><span data-i18n="actionClose">Close</span></button>
      </form>`
    : `<form method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/listings/${encodeURIComponent(listing.id)}/reopen">
        <button type="submit" class="mkt-btn-row-action is-reopen"><span data-i18n="actionReopen">Reopen</span></button>
      </form>`;

  // 🆕 รอบ 6c: เก็บ createdAt ดิบไว้ใน data-created (หน่วย ms) ไว้ให้ mktApplyLang() เอาไป
  // คำนวณ "Xd ago"/"Xวันที่แล้ว" ใหม่ตอนสลับภาษา (relativeTimeLabel() นี้รันแค่ตอน render
  // ครั้งแรกบน server เป็นอังกฤษเสมอ ไม่รู้จักภาษาที่เลือกไว้ใน localStorage)
  return `<div class="mkt-listing-row" data-status="${isActive ? 'active' : 'closed'}">
    <div class="mkt-listing-thumb" style="${thumbStyle}"><span class="cat-dot" style="background:${catStyle.badge};"></span></div>
    <div class="mkt-listing-main">
      <div class="mkt-listing-title">${escapeHtml(listing.title)}</div>
      <div class="mkt-listing-sub">${escapeHtml(categoryLabel)}</div>
    </div>
    <div class="mkt-listing-meta" data-created="${new Date(listing.createdAt).getTime()}">${escapeHtml(relativeTimeLabel(listing.createdAt))}</div>
    <div class="mkt-listing-price">&#3647;${Number(listing.priceThb).toLocaleString('en-US')}</div>
    ${statusIndicatorHtml(listing.status)}
    <div class="mkt-listing-action">${actionHtml}</div>
  </div>`;
}

/**
 * รายการ "ประกาศขายของฉัน" ทั้งก้อน — โชว์ข้อความเฉยๆ ถ้ายังไม่เคยลงขายอะไรเลย
 * 🆕 รอบ 6: เพิ่มแท็บกรอง All / Active / Closed เหนือรายการ (ของใหม่ ไม่มีในรอบ 5) —
 * กรองด้วย JS ฝั่ง client เฉยๆ (ซ่อน/โชว์แถวด้วย data-status) ไม่ยิง request ใหม่เลย
 */
function myListingsSectionHtml(listings, categories, guildId) {
  if (listings.length === 0) {
    return `<div class="mkt-listings">
      <div class="mkt-listings-head"><h2 data-i18n="listingsHeading">Your listings</h2></div>
      <div style="font-size:12.5px;color:var(--text-muted-2);margin-top:10px;" data-i18n="emptyListings">You haven't listed anything yet — use the form above to list your first item.</div>
    </div>`;
  }

  const rowsHtml = listings.map((listing) => listingRowHtml(listing, categories, guildId)).join('');

  return `<div class="mkt-listings">
    <div class="mkt-listings-head">
      <h2><span data-i18n="listingsHeading">Your listings</span> <span class="count">(${listings.length})</span></h2>
      <div class="mkt-tab-row" role="tablist" aria-label="Filter listings">
        <button type="button" class="mkt-text-tab" role="tab" aria-selected="true" onclick="mktFilterListings(this,'all')"><span data-i18n="filterAll">All</span></button>
        <button type="button" class="mkt-text-tab" role="tab" aria-selected="false" onclick="mktFilterListings(this,'active')"><span data-i18n="filterActive">Active</span></button>
        <button type="button" class="mkt-text-tab" role="tab" aria-selected="false" onclick="mktFilterListings(this,'closed')"><span data-i18n="filterClosed">Closed</span></button>
      </div>
    </div>
    <div class="mkt-listing-list" id="mkt-listing-list">${rowsHtml}</div>
  </div>

  <script>
    function mktFilterListings(btn, status) {
      var tabs = btn.parentElement.querySelectorAll('.mkt-text-tab');
      tabs.forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
      btn.setAttribute('aria-selected', 'true');
      document.querySelectorAll('#mkt-listing-list .mkt-listing-row').forEach(function (row) {
        var show = status === 'all' || row.getAttribute('data-status') === status;
        row.style.display = show ? 'flex' : 'none';
      });
    }
  </script>`;
}

/**
 * 🆕 [13 ต.ค. 2569 — "รอบ 6c"] ตัวสลับภาษา EN/TH จริงๆ สำหรับหน้า Marketplace Dashboard —
 * คนละระบบกับปุ่ม EN/TH ของหน้าเว็บสาธารณะ (public/js/site-lang.js ใช้ localStorage key
 * "aitaoLang") และคนละระบบกับหน้า Dashboard "Language" (ตั้งภาษาที่บอทตอบในดิสคอร์ด) —
 * ดูคอมเมนต์เต็มๆ ที่หัวไฟล์นี้ (รอบ 6c) ว่าทำไมต้องแยกเป็นระบบที่ 3
 *
 * ทำงานยังไง: ฟังก์ชันนี้คืนค่าเป็น <script> ก้อนหนึ่ง แปะไว้ก่อนเนื้อหาอื่นของหน้า (ดู
 * renderMarketplaceDashboardPage ด้านล่าง) กำหนด:
 *   - window.MKT_I18N      = ดิกชันนารีคำแปล { key: { en, th } } ของทุกข้อความ UI ในหน้านี้
 *   - window.MKT_LANG      = ภาษาปัจจุบัน (อ่านจาก localStorage ตอนโหลดหน้า, default 'en')
 *   - window.mktT(key)     = คืนคำแปลของ key ตามภาษาปัจจุบัน
 *   - window.mktRelativeTime(ms) = แปลงเวลาเป็นข้อความ "Xd ago"/"Xวันที่แล้ว" ตามภาษาปัจจุบัน
 *   - window.mktApplyLang(lang) = สลับภาษาจริง — เดิน querySelectorAll('[data-i18n]') ทั้งหน้า
 *     แล้วตั้ง textContent ใหม่ตาม key ที่ element นั้นประกาศไว้ (attribute data-i18n="xxx")
 *     + อัปเดตปุ่ม EN/TH ที่กำลังเลือกอยู่ + คำนวณ "เวลาที่แล้ว" ของทุกประกาศใหม่ + บันทึก
 *     ภาษาที่เลือกไว้ใน localStorage (key "aitaoDashboardLang") ให้จำได้ตอนเปิดหน้านี้ครั้งหน้า
 *
 * ⚠️ เพราะ script นี้รันตอน parse HTML (อยู่ก่อนเนื้อหาอื่นในหน้า) querySelectorAll ข้างในนี้
 * เอง "จะยังไม่เห็น" element ของหน้า (ยังโหลดไม่ถึง) — เลยไม่เรียก mktApplyLang() ที่นี่ตรงๆ
 * ต้องให้ script ตัวสุดท้ายของหน้า (ท้าย renderMarketplaceDashboardPage หลัง myListingsSectionHtml)
 * เป็นคนเรียกแทน เพราะรันหลัง DOM ทั้งหน้าพร้อมแล้ว — ส่วนปุ่ม onclick="mktApplyLang(...)" ที่
 * แปะไว้ตั้งแต่ตอนนี้ไม่มีปัญหา เพราะกว่าผู้ใช้จะกดปุ่ม หน้าก็โหลดเสร็จไปแล้วแน่นอน
 */
function mktI18nScript() {
  const dict = {
    eyebrow: { en: 'Seller dashboard', th: 'แดชบอร์ดผู้ขาย' },
    pageTitle: { en: 'Marketplace', th: 'มาร์เก็ตเพลส' },
    statListingsLabel: { en: 'active listings', th: 'รายการที่เปิดขาย' },
    statSalesLabel: { en: 'sales completed', th: 'ยอดขายสำเร็จ' },
    subtitlePart1: {
      en: 'Sell decorations or services to other Discord server owners — set up everything right here, no need to run commands in Discord. Same data as the ',
      th: 'ขายของแต่งเซิร์ฟหรือบริการให้เจ้าของเซิร์ฟ Discord คนอื่นได้เลย ตั้งค่าทุกอย่างจากหน้านี้หน้าเดียว ไม่ต้องไปพิมพ์คำสั่งในดิสคอร์ด ข้อมูลเชื่อมกับคำสั่ง ',
    },
    subtitlePart2: { en: ' slash command, so both stay in sync.', th: ' ตัวเดิมเป๊ะๆ ไม่ว่าจะแก้จากฝั่งไหนก็อัปเดตตรงกันหมด' },
    bannerSaved: { en: 'Saved!', th: 'บันทึกแล้ว!' },
    disclosureLine: {
      en: 'This marketplace is peer-to-peer — Milo Bot never touches the money.',
      th: 'มาร์เก็ตเพลสนี้เป็นการซื้อขายกันเอง (peer-to-peer) — Milo Bot ไม่แตะเงินเลย',
    },
    disclosureShow: { en: 'what this means', th: 'รายละเอียดคืออะไร' },
    disclosureHide: { en: 'hide', th: 'ซ่อน' },
    disclosureItem1: {
      en: "Buyers pay your PromptPay (or your payment link) directly — Milo Bot never holds or sees the money, verifies anyone's identity, or acts as a party to the sale.",
      th: 'ผู้ซื้อโอนเงินเข้าพร้อมเพย์ (หรือลิงก์รับเงิน) ของผู้ขายตรงๆ — Milo Bot ไม่ถือเงิน ไม่เห็นเงิน ไม่ตรวจสอบตัวตนใคร และไม่ได้เป็นคู่สัญญาในการซื้อขายนี้เลย',
    },
    disclosureItem2: {
      en: "You're responsible for actually delivering what you list. Not delivering, or misrepresenting an item, can get your listings removed or your seller access suspended.",
      th: 'ผู้ขายต้องส่งของ/บริการตามที่ลงประกาศไว้จริง ถ้าไม่ส่งหรือหลอกลวงผู้ซื้อ อาจถูกลบประกาศหรือระงับสิทธิ์การขายได้',
    },
    disclosureItem3: {
      en: "Buyers can also report sellers directly from the Marketplace page. This isn't legal advice — just the terms of using this marketplace.",
      th: 'ผู้ซื้อสามารถรายงานผู้ขายได้โดยตรงจากหน้า Marketplace นี้ ข้อความนี้ไม่ใช่คำแนะนำทางกฎหมาย แค่เงื่อนไขการใช้งานมาร์เก็ตเพลสนี้เท่านั้น',
    },
    sellingAsPrefix: { en: 'Selling as', th: 'กำลังขายในชื่อ' },
    pmSetUp: { en: 'Payment method set up', th: 'ตั้งค่าช่องทางรับเงินแล้ว' },
    pmNotSetUp: { en: 'Payment method not set up yet', th: 'ยังไม่ได้ตั้งค่าช่องทางรับเงิน' },
    pmGetPaidWith: { en: 'Get paid with', th: 'รับเงินผ่าน' },
    pmTabPromptpay: { en: 'PromptPay', th: 'พร้อมเพย์ (PromptPay)' },
    pmTabLink: { en: 'Payment link', th: 'ลิงก์รับเงิน' },
    pmBtnSave: { en: 'Save', th: 'บันทึก' },
    pmBtnUpdate: { en: 'Update', th: 'อัปเดต' },
    pmWarning: {
      en: 'You need to set up a payment method before you can list anything — this is how buyers pay you directly.',
      th: 'ต้องตั้งค่าช่องทางรับเงินก่อน ถึงจะลงขายของได้ — นี่คือวิธีที่ผู้ซื้อจะจ่ายเงินให้ผู้ขายตรงๆ',
    },
    pmHelpPromptpay: {
      en: 'Buyers scan a QR for this number and pay you directly — no fees, no middle step.',
      th: 'ผู้ซื้อสแกน QR ของเบอร์นี้แล้วโอนเงินให้ผู้ขายตรงๆ ไม่มีค่าธรรมเนียม ไม่มีตัวกลาง',
    },
    pmHelpLink: {
      en: "Buyers get sent to this link to pay you directly. Milo Bot never sees what's behind it.",
      th: 'ผู้ซื้อจะถูกพาไปที่ลิงก์นี้เพื่อจ่ายเงินให้ผู้ขายตรงๆ Milo Bot ไม่เห็นว่าลิงก์นี้พาไปไหน',
    },
    wizEyebrow: { en: 'New listing', th: 'ลงขายใหม่' },
    wizHeading: { en: 'What are you selling today?', th: 'วันนี้จะลงขายอะไรดี?' },
    progressCard: { en: 'Grid card', th: 'การ์ดในกริด' },
    progressDetail: { en: 'Full details', th: 'รายละเอียดเต็ม' },
    stepWord: { en: 'Step', th: 'ขั้นตอน' },
    stepOf2: { en: 'of 2', th: 'จาก 2' },
    stepTitleStep1: { en: '— the card buyers see in the grid', th: '— การ์ดที่ผู้ซื้อเห็นในหน้ากริด' },
    stepTitleStep2: {
      en: '— the full item page buyers see after they click in',
      th: '— หน้ารายละเอียดเต็มที่ผู้ซื้อเห็นหลังคลิกเข้าไปดู',
    },
    fieldTitle: { en: 'Title', th: 'ชื่อสินค้า' },
    fieldPrice: { en: 'Price (THB)', th: 'ราคา (บาท)' },
    fieldCategory: { en: 'Category', th: 'หมวดหมู่' },
    fieldSubcategory: { en: 'Subcategory', th: 'หมวดย่อย' },
    fieldCoverImage: { en: 'Cover image', th: 'รูปปก' },
    fieldCoverImageNote: { en: '(shown on the card — optional, up to 20MB)', th: '(โชว์บนการ์ด — ไม่บังคับ ขนาดไม่เกิน 20MB)' },
    chooseCategory: { en: 'Choose a category…', th: 'เลือกหมวดหมู่…' },
    fieldDescription: { en: 'Description', th: 'คำอธิบาย' },
    fieldType: { en: 'Type', th: 'ประเภท' },
    typeService: { en: 'Service (you contact the buyer yourself)', th: 'บริการ (ผู้ขายติดต่อผู้ซื้อเอง)' },
    typeDigital: { en: 'Digital file (sent automatically after payment)', th: 'ไฟล์ดิจิทัล (ส่งให้ผู้ซื้อทันทีหลังจ่ายเงิน)' },
    fieldDigitalFile: { en: 'Digital file', th: 'ไฟล์ดิจิทัล' },
    fieldDigitalFileNote: {
      en: '(sent to the buyer automatically — required for digital items, up to 20MB)',
      th: '(ส่งให้ผู้ซื้อโดยอัตโนมัติ — บังคับถ้าเป็นไฟล์ดิจิทัล ขนาดไม่เกิน 20MB)',
    },
    disabledNote: {
      en: 'Set up a payment method above first to unlock this form.',
      th: 'ต้องตั้งค่าช่องทางรับเงินด้านบนก่อน ถึงจะปลดล็อกฟอร์มนี้ได้',
    },
    livePreview: { en: 'Live preview', th: 'พรีวิวสด' },
    devicePreviewLabel: { en: 'Marketplace preview', th: 'พรีวิวมาร์เก็ตเพลส' },
    previewDefaultTitle: { en: 'Your item title', th: 'ชื่อสินค้าของคุณ' },
    previewDefaultDesc: { en: 'Your description will show up here.', th: 'คำอธิบายจะมาโชว์ตรงนี้' },
    previewNote: {
      en: 'Mirrors the real Marketplace page — this is what buyers actually see.',
      th: 'เหมือนหน้ามาร์เก็ตเพลสจริง — นี่คือสิ่งที่ผู้ซื้อเห็นจริงๆ',
    },
    btnBack: { en: 'Back', th: 'ย้อนกลับ' },
    btnNext: { en: 'Next: item details', th: 'ถัดไป: รายละเอียดสินค้า' },
    btnSubmit: { en: 'List item', th: 'ลงขายเลย' },
    errTitle: { en: 'Please enter a title.', th: 'กรุณากรอกชื่อสินค้า' },
    errPrice: { en: 'Please enter a price between 1 and 20,000 THB.', th: 'กรุณากรอกราคาระหว่าง 1 ถึง 20,000 บาท' },
    errCategory: { en: 'Please choose a category.', th: 'กรุณาเลือกหมวดหมู่' },
    errSubcategory: { en: 'Please choose a subcategory.', th: 'กรุณาเลือกหมวดย่อย' },
    errDescription: { en: 'Please write a description.', th: 'กรุณากรอกคำอธิบาย' },
    errDigitalFile: {
      en: 'Please attach the digital file buyers will receive.',
      th: 'กรุณาแนบไฟล์ดิจิทัลที่จะส่งให้ผู้ซื้อ',
    },
    listingsHeading: { en: 'Your listings', th: 'ประกาศขายของฉัน' },
    filterAll: { en: 'All', th: 'ทั้งหมด' },
    filterActive: { en: 'Active', th: 'เปิดขาย' },
    filterClosed: { en: 'Closed', th: 'ปิดแล้ว' },
    emptyListings: {
      en: "You haven't listed anything yet — use the form above to list your first item.",
      th: 'ยังไม่มีของลงขายเลย — ใช้ฟอร์มด้านบนลงขายชิ้นแรกได้เลย',
    },
    statusActive: { en: 'Active', th: 'เปิดขาย' },
    statusClosed: { en: 'Closed', th: 'ปิดแล้ว' },
    statusSold: { en: 'Sold', th: 'ขายแล้ว' },
    actionClose: { en: 'Close', th: 'ปิดการขาย' },
    actionReopen: { en: 'Reopen', th: 'เปิดขายใหม่' },
    rtJustNow: { en: 'just now', th: 'เมื่อสักครู่' },
    rtMinutes: { en: '{n}m ago', th: '{n} นาทีที่แล้ว' },
    rtHours: { en: '{n}h ago', th: '{n} ชม.ที่แล้ว' },
    rtDays: { en: '{n}d ago', th: '{n} วันที่แล้ว' },
    rtMonths: { en: '{n}mo ago', th: '{n} เดือนที่แล้ว' },
    rtYears: { en: '{n}y ago', th: '{n} ปีที่แล้ว' },
  };
  // กัน </script> หลุดโผล่กลางหน้าถ้ามีใครเผลอใส่ไว้ในคำแปล (เหมือน subcategoryMapJson
  // ด้านบนไฟล์นี้) — ตอนนี้ไม่มีจริง แต่ป้องกันไว้เผื่ออนาคตมาแก้คำแปลแล้วลืมเช็ค
  const dictJson = JSON.stringify(dict).replace(/</g, '\\u003c');

  return `<script>
    window.MKT_I18N = ${dictJson};
    window.MKT_LANG = (function () {
      try { return localStorage.getItem('aitaoDashboardLang') || 'en'; } catch (e) { return 'en'; }
    })();
    window.mktT = function (key) {
      var entry = window.MKT_I18N[key];
      if (!entry) return key;
      return entry[window.MKT_LANG] || entry.en;
    };
    window.mktRelativeTime = function (ms) {
      var diffMs = Date.now() - ms;
      var minutes = Math.floor(diffMs / 60000);
      function fmt(key, n) { return mktT(key).replace('{n}', n); }
      if (minutes < 1) return mktT('rtJustNow');
      if (minutes < 60) return fmt('rtMinutes', minutes);
      var hours = Math.floor(minutes / 60);
      if (hours < 24) return fmt('rtHours', hours);
      var days = Math.floor(hours / 24);
      if (days < 30) return fmt('rtDays', days);
      var months = Math.floor(days / 30);
      if (months < 12) return fmt('rtMonths', months);
      return fmt('rtYears', Math.floor(months / 12));
    };
    window.mktApplyLang = function (lang) {
      window.MKT_LANG = lang;
      try { localStorage.setItem('aitaoDashboardLang', lang); } catch (e) {}
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        el.textContent = mktT(el.getAttribute('data-i18n'));
      });
      var enBtn = document.getElementById('mkt-lang-en');
      var thBtn = document.getElementById('mkt-lang-th');
      if (enBtn) enBtn.setAttribute('aria-selected', String(lang === 'en'));
      if (thBtn) thBtn.setAttribute('aria-selected', String(lang === 'th'));
      document.querySelectorAll('.mkt-listing-meta[data-created]').forEach(function (el) {
        el.textContent = mktRelativeTime(parseInt(el.getAttribute('data-created'), 10));
      });
    };
  </script>`;
}

/**
 * หน้า Marketplace เต็มหน้า
 * 🆕 รอบ 6: เพิ่ม header ใหม่ (eyebrow + หัวข้อ + เลขสถิติ 2 ตัว + คำอธิบาย) และส่ง CSS
 * ของหน้านี้ทั้งหมดผ่าน opts.extraStyle (ดู MARKETPLACE_STYLE ด้านบนไฟล์) แทน inline style
 * กระจายทุกจุดแบบรอบ 5
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
 * @param {number} opts.completedSales 🆕 ยอดขายสำเร็จรวมทั้งร้าน จาก getSellerStats() —
 *   server.js ต้องเรียก getSellerStats(req.session.user.id) แล้วส่ง completedSales มาด้วย
 *   (ดูคอมเมนต์ท้ายไฟล์นี้ตรงจุดที่ต้องแก้ server.js)
 */
function renderMarketplaceDashboardPage({ guild, user, botAvatarUrl, botName, seller, listings, categories, saved, error, completedSales }) {
  // 🆕 [12 ต.ค. 2569] เช็คทั้ง 2 ช่องทาง (promptpayId หรือ paymentLink) แทนที่จะเช็คแค่
  // promptpayId ตรงๆ แบบเดิม — ดูเหตุผลเต็มๆ ที่คอมเมนต์ paymentMethodSectionHtml ด้านบน
  const canSell = Boolean(seller?.promptpayId) || Boolean(seller?.paymentLink);
  const activeCount = listings.filter((item) => item.status === 'active').length;
  const completedSalesCount = Number(completedSales) || 0;

  const bodyHtml = `${mktI18nScript()}<div class="mkt-page" style="padding:40px 56px 90px;">
    <div class="mkt-grain"></div>
    <div class="mkt-glow"></div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div class="mkt-eyebrow" data-i18n="eyebrow">Seller dashboard</div>
      <div class="mkt-tab-row" role="tablist" aria-label="Dashboard language" style="gap:12px;">
        <button type="button" class="mkt-text-tab" role="tab" id="mkt-lang-en" aria-selected="true" onclick="mktApplyLang('en')">EN</button>
        <button type="button" class="mkt-text-tab" role="tab" id="mkt-lang-th" aria-selected="false" onclick="mktApplyLang('th')">TH</button>
      </div>
    </div>
    <div class="mkt-header-row">
      <h1 class="mkt-h1"><span data-i18n="pageTitle">Marketplace</span><svg class="mkt-squiggle" viewBox="0 0 120 10" width="104" height="8" fill="none" aria-hidden="true"><path d="M2 6c10-6 20 6 30 0s20-6 30 0 20 6 30 0 20-6 26 0" stroke="#f472b6" stroke-width="2.2" stroke-linecap="round"/></svg></h1>
      <div class="mkt-stat-pair">
        <div class="mkt-stat"><b id="mkt-stat-listings" data-target="${activeCount}">0</b><span data-i18n="statListingsLabel">active listings</span></div>
        <div class="mkt-stat"><b id="mkt-stat-sales" data-target="${completedSalesCount}">0</b><span data-i18n="statSalesLabel">sales completed</span></div>
      </div>
    </div>
    <p class="mkt-subtitle">
      <span data-i18n="subtitlePart1">Sell decorations or services to other Discord server owners — set up everything right here, no need to run
      commands in Discord. Same data as the </span><code>/marketplace</code><span data-i18n="subtitlePart2"> slash command, so both stay in sync.</span>
    </p>

    ${bannerHtml({ saved, error })}

    <hr class="mkt-rule" />

    ${disclosureHtml()}
    ${paymentMethodSectionHtml(seller, user, guild.id)}

    <hr class="mkt-rule" />

    ${sellWizardHtml(categories, canSell, guild.id, user.username)}

    <hr class="mkt-rule" />

    ${myListingsSectionHtml(listings, categories, guild.id)}
  </div>

  <script>
    (function () {
      // เลขสถิติหัวหน้าไล่นับขึ้นตอนโหลดหน้า เพิ่มความรู้สึก "มีชีวิต" เล็กๆให้หน้าแรก
      function mktCountUp(el) {
        var target = parseInt(el.getAttribute('data-target'), 10) || 0;
        var start = performance.now();
        var dur = 650;
        function tick(now) {
          var p = Math.min(1, (now - start) / dur);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(eased * target);
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
      [document.getElementById('mkt-stat-listings'), document.getElementById('mkt-stat-sales')].forEach(mktCountUp);

      // 🆕 รอบ 6c: ใช้ภาษาที่บันทึกไว้ (ถ้าเคยสลับเป็นไทยไว้ก่อน) ทาทั่วหน้า — ต้องรันตรงนี้
      // (ท้ายสุดของหน้า หลัง DOM ทั้งหมดพร้อมแล้ว) ไม่ใช่ใน mktI18nScript() ตอนกำหนดฟังก์ชัน
      // เพราะตอนนั้น element ของหน้ายังโหลดไม่ถึง (ดูคอมเมนต์เต็มๆ ที่ mktI18nScript ด้านบน)
      if (typeof window.mktApplyLang === 'function') {
        window.mktApplyLang(window.MKT_LANG || 'en');
      }
    })();
  </script>`;

  return renderDashboardLayout({
    title: `Marketplace — ${guild.name} — Aitao Bot`,
    guild,
    user,
    activeKey: 'marketplace',
    botAvatarUrl,
    botName,
    bodyHtml,
    extraStyle: MARKETPLACE_STYLE,
  });
}

module.exports = { renderMarketplaceDashboardPage };

// ─────────────────────────────────────────────────────────────────────────
// ⚠️ [13 ต.ค. 2569] ต้องแก้ server.js จุดเดียวด้วยนะครับ ถึงจะได้ตัวเลข "sales completed"
// ที่หัว header เป็นข้อมูลจริง (ไม่ใช่เลข 0 ตลอด) — ที่ route
// app.get('/dashboard/:guildId/marketplace', ...) หา const seller = getSeller(...) แล้ว
// เพิ่มตรงนั้น:
//
//   const { completedSales } = getSellerStats(req.session.user.id);
//
// แล้วส่ง completedSales ไปด้วยตอนเรียก renderMarketplaceDashboardPage({ ..., completedSales })
// (getSellerStats ถูก import ไว้อยู่แล้วที่หัวไฟล์ server.js เพราะ endpoint สาธารณะ
// /api/marketplace/listings เรียกใช้อยู่แล้ว แค่ยังไม่ได้เรียกใช้ตรง route แดชบอร์ดนี้)
// ─────────────────────────────────────────────────────────────────────────
