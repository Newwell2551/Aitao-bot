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
//
// 🆕 [15 ต.ค. 2569 — "รอบ 7" รีดีไซน์ธีมเกม] น้องหนาวขอให้รีดีไซน์หน้านี้ใหม่อีกรอบ ให้ดูเหมือน
// หน้าแดชบอร์ดของเกม/แพลตฟอร์ม (ประมาณ Roblox Creator Dashboard หรือ Discord Developer
// Portal) — รีวิวกันเป็น Claude Design canvas มาก่อน (3 artboard: Overview / My Listings /
// Create New Listing) จนน้องหนาวโอเคกับหน้าตาแล้วค่อยพอร์ตมาที่นี่ สิ่งที่เปลี่ยนจาก "รอบ 6/6b/6c":
//   - โครงหน้าเปลี่ยนจาก "เลื่อนยาวหน้าเดียว" (payment → sell wizard → my listings เรียงต่อกัน)
//     มาเป็น "แถบเมนูย่อย (sub-sidebar) + สลับแผง (panel)" แบบ 3 แผง: Overview (สถิติ + ตั้งค่า
//     ช่องทางรับเงิน) / My Listings (กริดการ์ด + ปุ่ม "+ New Listing") / Create Listing (ฟอร์ม
//     ลงขายเดิมทั้งหมด ย้ายมาเป็น "หน้าของตัวเอง" แทนที่จะอยู่กลางๆหน้า) — สลับแผงด้วย JS ฝั่ง
//     client ล้วนๆ (mktShowPanel) ไม่โหลดหน้าใหม่ ไม่มี route ใหม่ ไม่กระทบ backend เลย
//   - แถบเมนูย่อยนี้ "ไม่ใช่" แถบข้างหลักของแดชบอร์ด (อันนั้นยังอยู่เหมือนเดิมที่ dashboardShell.js
//     ไม่ได้แก้ไฟล์นั้นเลยสักบรรทัด) แต่เป็นแถบเมนูย่อยซ้อนอยู่ "ข้างใน" หน้า Marketplace เอง
//     (ไอเดียเดียวกับหน้า Settings ของ Discord เอง: แถบเซิร์ฟ → แถบหมวดตั้งค่า → เนื้อหา)
//   - สีธีมเปลี่ยนเป็นน้ำเงินกรมท่า/ม่วงเข้มคล้ายกันมากขึ้น ("deep blue/purple") แต่ "ไม่ได้"
//     ไปแก้ตัวแปรสีกลาง :root ของ dashboardShell.js (จะกระทบแถบข้างหลัก+ทุกหน้าอื่นโดยไม่ตั้งใจ)
//     — ประกาศตัวแปรสีใหม่ชุดนี้ไว้ใต้ scope ของ .mkt-page เท่านั้น (--mkt-bg-card, --mkt-accent
//     ฯลฯ) มีผลแค่ในหน้านี้
//   - เปลี่ยนจากแนว "ไม่มีกล่อง" (รอบ 6) กลับไปใช้กล่อง/การ์ดมีเส้นขอบ+เงาอีกครั้ง ตามที่ขอ
//     ("enhance contrast... subtle card borders and shadows") — squiggle/grain/glow/hand-drawn
//     ของรอบ 6 ถูกถอดออกหมด
//   - แถว "My listings" เดิม (แถวยาวคั่นเส้น) เปลี่ยนเป็นกริดการ์ด (เหมือนหน้า public/marketplace.html
//     ของผู้ซื้อ) — ข้อมูล/validation/route ที่ใช้ทั้งหมดเหมือนเดิม 100% เปลี่ยนแค่หน้าตา
//   - ฟอร์มลงขาย (sellWizardHtml) ของเดิมเป็น wizard 2 สเต็ป + พรีวิวสดอยู่แล้ว (โครง "พรีวิวซ้าย
//     ฟอร์มขวา" ก็มีอยู่แล้วตั้งแต่รอบ 5-6) รอบนี้แค่ย้ายมาเป็นแผนของตัวเอง + ปรับช่องกรอกจาก
//     ขีดเส้นใต้ (.mkt-line-input แบบเดิม) เป็นกรอบสี่เหลี่ยมเต็ม (ตามธีมใหม่) — ไม่แก้ชื่อ field,
//     ไม่แก้ validation, ไม่แก้ลำดับสเต็ปใดๆ เลย
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

// ── CSS เฉพาะหน้า Marketplace (รอบ 7 — ธีมเกม/ดีไซน์พอร์ทัล) ───────────────
// ก๊อปแนวคิดมาจาก Design canvas ที่รีวิวกันในแชทก่อน (ดูคอมเมนต์รอบ 7 หัวไฟล์) — ส่งเข้า
// renderDashboardLayout() ผ่าน opts.extraStyle ด้านล่างสุดของไฟล์นี้ ทุก selector ขึ้นต้น
// ด้วย "mkt-" กันชนกับ CSS กลางของ dashboardShell.js หรือหน้าอื่นๆ ที่ใช้ extraStyle ของตัวเอง
//
// 🆕 รอบ 7: ตัวแปรสีใหม่ (--mkt-xxx) ประกาศไว้ใต้ scope ".mkt-page" เท่านั้น (ไม่ใช่ :root
// ตรงๆ) ตั้งใจเพื่อไม่ให้ไปทับตัวแปรสีกลาง (--accent, --bg ฯลฯ) ของ dashboardShell.js ที่
// ทุกหน้าแดชบอร์ดใช้ร่วมกัน — ถ้าประกาศทับที่ :root จะทำให้แถบข้างหลัก (sidebar) และหน้าอื่น
// เปลี่ยนสีไปด้วยโดยไม่ตั้งใจ (คนละไฟล์ แก้ตรงนี้ไม่ควรกระทบที่อื่น)
const MARKETPLACE_STYLE = `
  .mkt-page {
    --mkt-bg-card: #171a2b;
    --mkt-bg-card-2: #1d2036;
    --mkt-bg-sunken: #0d1120;
    --mkt-border: rgba(255,255,255,0.09);
    --mkt-border-strong: rgba(255,255,255,0.18);
    --mkt-text-muted-2: #888db0;
    --mkt-accent: #7c6ff4;
    --mkt-accent-hover: #8d82ff;
    --mkt-accent-soft: rgba(124,111,244,0.16);
    --mkt-success: #2dd4a8;
    --mkt-success-soft: rgba(45,212,168,0.14);
    --mkt-gold: #f5b942;
  }

  .mkt-shell { display: flex; flex-wrap: wrap; align-items: stretch; min-height: 100%; }

  /* ── แถบเมนูย่อย "Marketplace" — ซ้อนอยู่ข้างในหน้านี้เท่านั้น ไม่ใช่แถบข้างหลักของ
       แดชบอร์ด (อันนั้นยังอยู่ซ้ายสุดเหมือนเดิม ไม่ได้แก้ dashboardShell.js เลย) ไอเดีย
       เหมือนหน้า Settings ของ Discord เอง: แถบแอป → แถบหมวดของหน้านี้ → เนื้อหา */
  .mkt-subnav {
    flex: 0 0 208px; width: 208px; box-sizing: border-box; padding: 32px 14px;
    border-right: 1px solid var(--mkt-border); display: flex; flex-direction: column; gap: 3px;
  }
  .mkt-subnav-label {
    font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--mkt-text-muted-2); margin: 0 10px 10px;
  }
  .mkt-subnav-item {
    display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 10px;
    font-size: 13.5px; font-weight: 600; color: var(--text-muted); background: none; border: none;
    cursor: pointer; font-family: inherit; text-align: left; width: 100%; transition: background 0.15s, color 0.15s;
  }
  .mkt-subnav-item:hover { background: rgba(255,255,255,0.045); color: var(--text); }
  .mkt-subnav-item.is-active { background: var(--mkt-accent-soft); color: var(--text); }
  .mkt-subnav-item.is-active svg { color: var(--mkt-accent); }
  .mkt-subnav-item svg { color: var(--mkt-text-muted-2); flex: 0 0 auto; }
  .mkt-subnav-back {
    margin-top: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;
    color: var(--mkt-text-muted-2); padding: 0 10px; text-decoration: none;
  }
  .mkt-subnav-back:hover { color: var(--text); }

  .mkt-content { flex: 999 1 540px; min-width: 0; padding: 36px 48px 72px; box-sizing: border-box; }

  .mkt-top-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .mkt-eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--mkt-accent);
  }
  .mkt-lang-switch { display: flex; gap: 4px; background: rgba(255,255,255,0.045); border-radius: 999px; padding: 3px; }
  .mkt-lang-switch .mkt-text-tab { padding: 5px 13px; border-radius: 999px; border-bottom: none; }
  .mkt-lang-switch .mkt-text-tab[aria-selected="true"] { background: var(--mkt-accent); color: #fff; }

  .mkt-h1 { font-weight: 800; font-size: 28px; margin: 14px 0 0; color: var(--text); letter-spacing: -0.01em; }
  .mkt-panel-subtitle { margin: 7px 0 0; max-width: 68ch; font-size: 13.5px; line-height: 1.7; color: var(--text-muted); }
  .mkt-panel-subtitle code { background: var(--mkt-accent-soft); color: var(--mkt-accent); padding: 2px 7px; border-radius: 4px; font-size: 12.5px; }

  .mkt-banner { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 10px; margin: 20px 0 0; font-size: 13px; font-weight: 600; border: 1px solid transparent; }
  .mkt-banner .dot { width: 6px; height: 6px; border-radius: 999px; flex: 0 0 auto; }
  .mkt-banner.is-ok { color: var(--mkt-success); background: var(--mkt-success-soft); border-color: rgba(45,212,168,0.3); } .mkt-banner.is-ok .dot { background: var(--mkt-success); }
  .mkt-banner.is-error { color: #ff9aa2; background: rgba(255,154,162,0.1); border-color: rgba(255,154,162,0.3); } .mkt-banner.is-error .dot { background: #ff9aa2; }

  .mkt-panel { margin-top: 28px; }

  .mkt-disclosure-line { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--mkt-text-muted-2); margin-bottom: 22px; }
  .mkt-disclosure-line button { background: none; border: none; color: var(--text-muted); font-size: 12.5px; font-weight: 700; cursor: pointer; padding: 0; text-decoration: underline; text-decoration-color: var(--mkt-border); text-underline-offset: 3px; font-family: inherit; }
  .mkt-disclosure-line button:hover { color: var(--text); text-decoration-color: var(--text-muted); }
  .mkt-disclosure-detail { margin: -12px 0 22px; font-size: 12px; color: var(--mkt-text-muted-2); line-height: 1.75; max-width: 64ch; }
  .mkt-disclosure-detail ul { margin: 6px 0 0; padding-left: 18px; }
  .mkt-disclosure-detail li { margin-bottom: 4px; }

  /* ── การ์ดทั่วไป (Payment settings ฯลฯ) — ตามที่ขอ "subtle card borders and shadows" ── */
  .mkt-card {
    background: var(--mkt-bg-card); border: 1px solid var(--mkt-border); border-radius: 16px;
    padding: 26px 28px; box-shadow: 0 10px 28px -16px rgba(0,0,0,0.65); max-width: 640px;
  }
  .mkt-card-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--mkt-text-muted-2); margin-bottom: 6px; }
  .mkt-card h2 { margin: 0 0 6px; font-size: 18px; font-weight: 800; color: var(--text); }
  .mkt-card-desc { margin: 0 0 18px; font-size: 12.5px; color: var(--text-muted); line-height: 1.6; max-width: 52ch; }

  .mkt-stat-grid { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 26px; }
  .mkt-stat-card {
    background: var(--mkt-bg-card); border: 1px solid var(--mkt-border); border-radius: 16px; padding: 20px 22px;
    flex: 1 1 210px; min-width: 190px; box-shadow: 0 10px 28px -16px rgba(0,0,0,0.65);
    display: flex; flex-direction: column; gap: 12px;
  }
  .mkt-stat-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; background: var(--mkt-accent-soft); color: var(--mkt-accent); }
  .mkt-stat-value { font-size: 28px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; line-height: 1; }
  .mkt-stat-label { font-size: 12px; color: var(--text-muted); font-weight: 600; margin-top: 3px; }

  .mkt-shop-strip { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; }
  .mkt-shop-avatar { border-radius: 999px; }

  .mkt-pm-top { display: flex; align-items: baseline; gap: 14px; margin-bottom: 14px; }
  .mkt-pm-label { font-size: 12px; color: var(--mkt-text-muted-2); white-space: nowrap; }

  /* ── แท็บแบบ segmented pill — ใช้ร่วมกันทั้งปุ่มสลับภาษา / ช่องทางรับเงิน / กรองประกาศ
       (เปลี่ยนแค่หน้าตา CSS เท่านั้น ของเดิมที่สลับด้วย aria-selected ผ่าน JS ยังทำงาน
       เหมือนเดิมทุกอย่าง ไม่ต้องแก้ script ใดๆ เลย) */
  .mkt-tab-row { display: inline-flex; gap: 4px; background: rgba(255,255,255,0.045); border-radius: 999px; padding: 4px; }
  .mkt-text-tab {
    background: none; border: none; cursor: pointer; font-family: inherit; border-radius: 999px;
    padding: 7px 16px; font-size: 12.5px; font-weight: 700; color: var(--mkt-text-muted-2);
    border-bottom: none; transition: background 0.15s, color 0.15s;
  }
  .mkt-text-tab[aria-selected="true"] { background: var(--mkt-accent); color: #fff; }
  .mkt-text-tab:hover:not([aria-selected="true"]) { color: var(--text); }

  .mkt-pm-field-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; max-width: 420px; }
  .mkt-line-input {
    flex: 1 1 auto; min-width: 0; box-sizing: border-box; background: var(--mkt-bg-sunken);
    border: 1px solid var(--mkt-border); border-radius: 10px; color: var(--text); font-family: inherit;
    font-size: 13.5px; padding: 10px 13px; font-variant-numeric: tabular-nums; transition: border-color 0.15s;
  }
  .mkt-line-input::placeholder { color: var(--mkt-text-muted-2); }
  .mkt-line-input:focus { outline: none; border-color: var(--mkt-accent); }
  .mkt-line-input:disabled { opacity: 0.5; cursor: not-allowed; }
  .mkt-btn-text { flex: 0 0 auto; background: none; border: none; color: var(--mkt-accent); font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; padding: 6px 2px; }
  .mkt-btn-text:hover { color: var(--mkt-accent-hover); }
  .mkt-pm-help { font-size: 11.5px; color: var(--mkt-text-muted-2); margin-top: 10px; line-height: 1.6; max-width: 420px; }
  .mkt-pm-warning { font-size: 12.5px; color: var(--mkt-gold); margin-top: 10px; line-height: 1.6; max-width: 420px; }

  /* ── แผง "Create New Listing" — รีดีไซน์รอบ 8 ── แรงบันดาลใจจาก Discord Developer
       Portal / Roblox Developer Portal (dark mode คอนทราสต์สูง, โครงสร้างชัด ไม่รก)
       โครงสร้างข้อมูล/validation/route เดิมทุกอย่างเหมือนเดิม 100% เปลี่ยนแค่หน้าตา+
       ส่วนประกอบ UI (custom dropdown, dropzone อัปโหลดไฟล์, ตัวเลือกสกุลเงิน) ── */
  .mkt-wizard-head { display: flex; align-items: center; gap: 12px; margin-bottom: 26px; }
  .mkt-back-btn {
    display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex: 0 0 auto;
    border-radius: 9px; border: 1px solid var(--mkt-border); color: var(--text-muted); background: none; cursor: pointer;
  }
  .mkt-back-btn:hover { border-color: var(--mkt-border-strong); color: var(--text); }

  /* ── ตัวบอกขั้นตอน (stepper) ── ป้าย "STEP X OF 2" + จุด 2 จุดมีเลขในตัว เชื่อมด้วย
       แถบที่ไหลสีทีละนิดตอนเปลี่ยนสเต็ป ไอดี/โครงเดิมทุกตัว (mkt-wiz-node1/2, mkt-wiz-line1)
       — JS ตัวเดิมที่สลับคลาส is-active/is-done ทำงานเหมือนเดิม ไม่ต้องแก้ script เลย
       🆕 ตัดแถวจุดเล็กๆซ้ำซ้อน (mkt-wiz-dot1/2) ที่เคยลอยอยู่เหนือฟอร์มออก เพราะมันไม่เคย
       อัปเดตสถานะจริง (ดีไซน์เก่าค้างบั๊ก) — ตัวบอกขั้นตอนเหลือจุดเดียวชัดๆพอ */
  .mkt-wiz-stepper { margin: 0 0 28px; }
  .mkt-wiz-step-badge {
    display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--mkt-accent); background: var(--mkt-accent-soft); border-radius: 999px;
    padding: 4px 11px; margin-bottom: 12px;
  }
  .mkt-wiz-step-caption { font-size: 12.5px; color: var(--mkt-text-muted-2); margin: 6px 0 16px; }
  .mkt-progress-rule { display: flex; align-items: center; gap: 10px; max-width: 360px; }
  .mkt-p-node { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; }
  .mkt-p-dot {
    width: 24px; height: 24px; border-radius: 999px; flex: 0 0 auto; display: flex; align-items: center;
    justify-content: center; font-size: 11px; font-weight: 800; color: var(--mkt-text-muted-2);
    background: var(--mkt-bg-sunken); border: 1.5px solid var(--mkt-border-strong); transition: all 0.25s;
  }
  .mkt-p-node.is-active .mkt-p-dot { background: var(--mkt-accent); border-color: var(--mkt-accent); color: #fff; box-shadow: 0 0 0 4px var(--mkt-accent-soft); }
  .mkt-p-node.is-done .mkt-p-dot { background: var(--mkt-success); border-color: var(--mkt-success); color: #0d1120; }
  .mkt-p-node.is-done .mkt-p-dot .mkt-p-num { display: none; }
  .mkt-p-check { display: none; }
  .mkt-p-node.is-done .mkt-p-check { display: block; }
  .mkt-p-text { font-size: 12px; font-weight: 600; color: var(--mkt-text-muted-2); white-space: nowrap; transition: color 0.2s; }
  .mkt-p-node.is-active .mkt-p-text { color: var(--text); }
  .mkt-p-node.is-done .mkt-p-text { color: var(--text-muted); }
  .mkt-p-fill { flex: 1 1 auto; height: 3px; border-radius: 999px; background: var(--mkt-border); overflow: hidden; }
  .mkt-p-fill::after { content: ''; display: block; height: 100%; width: 0%; background: var(--mkt-accent); transition: width 0.3s ease; }
  .mkt-p-fill.is-done::after { width: 100%; }

  /* ── โครง 50/50 split ตามที่ขอ: ซ้ายพรีวิวลอยตรึง (sticky) / ขวาฟอร์มเลื่อนไปตามหน้า ── */
  .mkt-wiz-split { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: start; }
  .mkt-wiz-preview-pane { position: sticky; top: 24px; }
  .mkt-wiz-form-pane { min-width: 0; }

  .mkt-frame-wrap {
    background: linear-gradient(180deg, var(--mkt-bg-card) 0%, var(--mkt-bg-card-2) 100%);
    border: 1px solid var(--mkt-border-strong); border-radius: 18px; overflow: hidden;
    box-shadow: 0 20px 44px -18px rgba(0,0,0,0.75); width: 100%;
  }
  .mkt-live-tag {
    display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--mkt-text-muted-2); margin-bottom: 10px;
  }
  .mkt-live-tag .dot { width: 6px; height: 6px; border-radius: 999px; background: var(--mkt-success); animation: mktPulseTeal 2.2s ease-in-out infinite; }
  .mkt-device-bar { display: flex; align-items: center; gap: 6px; padding: 9px 11px; background: var(--mkt-bg-sunken); }
  .mkt-device-dot { width: 7px; height: 7px; border-radius: 999px; background: #2c3559; }
  .mkt-device-url { flex: 1 1 auto; text-align: center; font-size: 9.5px; color: #5e6688; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 6px; }
  .mkt-preview-note { font-size: 11px; color: var(--mkt-text-muted-2); margin-top: 12px; line-height: 1.6; max-width: 320px; }
  .mkt-wiz-price-coin {
    display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 999px;
    background: rgba(245,185,66,0.18); color: var(--mkt-gold); font-size: 10px; font-weight: 800; margin-right: 5px; flex: 0 0 auto;
  }

  /* ── ฟิลด์ฟอร์ม ── พื้นหลังมืดเข้ม ขอบจางๆ โฟกัสแล้วขอบ+เรืองแสงสีม่วง ตามที่ขอ ── */
  .mkt-form-step { display: flex; flex-direction: column; gap: 20px; }
  .mkt-field-label-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
  .mkt-field-label { font-size: 12px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.01em; }
  .mkt-field { display: flex; flex-direction: column; }
  .mkt-field-pair { display: flex; gap: 20px; }
  .mkt-field-pair > .mkt-field { flex: 1 1 auto; min-width: 0; }

  .mkt-line-input {
    flex: 1 1 auto; min-width: 0; box-sizing: border-box; background: var(--mkt-bg-sunken);
    border: 1.5px solid var(--mkt-border); border-radius: 10px; color: var(--text); font-family: inherit;
    font-size: 13.5px; padding: 11px 14px; font-variant-numeric: tabular-nums;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .mkt-line-input::placeholder { color: var(--mkt-text-muted-2); }
  .mkt-line-input:focus { outline: none; border-color: var(--mkt-accent); box-shadow: 0 0 0 3px var(--mkt-accent-soft); }
  .mkt-line-input:disabled { opacity: 0.5; cursor: not-allowed; }
  textarea.mkt-line-input { resize: vertical; font-family: inherit; min-height: 92px; }

  /* ── ตัวสลับสกุลเงิน THB/USD ── ปุ่มเล็กข้างๆ label ราคา รีไซเคิลหน้าตา segmented-pill
       แบบเดียวกับตัวสลับภาษา/ช่องทางรับเงิน (ของใหม่จริงๆคือ JS mktSelectCurrency ด้านล่าง)
       🆕 หมายเหตุสำคัญ: สลับแค่ "หน้าตา/label" กับพรีวิวเท่านั้นนะครับ ตัวเลขที่ส่งไปจริง
       (name="price") ระบบฝั่งเซิร์ฟเวอร์ยังตีความเป็นบาทไทยเสมอ (ดูคอมเมนต์เต็มๆที่ท้ายไฟล์
       นี้/build-notes doc — ตัดสินใจแล้วว่ายังไม่ต่อระบบจ่ายเงินจริงเป็น USD เพราะ PromptPay
       QR รองรับแต่บาทไทยเท่านั้น) เลยมีข้อความแจ้งเตือนเล็กๆใต้ช่องราคาด้วย ไม่ให้เข้าใจผิด */
  .mkt-currency-toggle { display: inline-flex; gap: 3px; background: rgba(255,255,255,0.045); border-radius: 999px; padding: 3px; flex: 0 0 auto; }
  .mkt-currency-btn {
    background: none; border: none; cursor: pointer; font-family: inherit; border-radius: 999px;
    padding: 4px 11px; font-size: 11.5px; font-weight: 700; color: var(--mkt-text-muted-2);
    transition: background 0.15s, color 0.15s;
  }
  .mkt-currency-btn[aria-selected="true"] { background: var(--mkt-accent); color: #fff; }
  .mkt-currency-btn:hover:not([aria-selected="true"]) { color: var(--text); }
  .mkt-currency-note { font-size: 11px; color: var(--mkt-text-muted-2); margin-top: 8px; line-height: 1.55; }

  /* ── custom dropdown ── หน้าตาคุมเองทั้งหมด (ปุ่ม trigger + เมนูลอย) ไม่ใช่ default
       browser <select> ของจริงที่ยิง form ยังเป็น <select> เดิมทุกอย่าง (ไอดี/ชื่อ field
       เดิม) แค่ซ่อนด้วย .mkt-sr-input (ซ่อนด้วย position/opacity ไม่ใช้ display:none —
       กันไว้ให้ชัวร์ 100% ว่า browser ยัง submit ค่าตามปกติ) ── */
  .mkt-sr-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; overflow: hidden; }
  .mkt-custom-select { position: relative; }
  .mkt-select-trigger {
    width: 100%; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;
    gap: 8px; background: var(--mkt-bg-sunken); border: 1.5px solid var(--mkt-border); border-radius: 10px;
    color: var(--text); font-family: inherit; font-size: 13.5px; padding: 11px 14px; cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .mkt-select-trigger-label.placeholder { color: var(--mkt-text-muted-2); }
  .mkt-select-trigger svg { flex: 0 0 auto; color: var(--mkt-text-muted-2); transition: transform 0.15s; }
  .mkt-select-trigger.is-open svg { transform: rotate(180deg); }
  .mkt-select-trigger:hover { border-color: var(--mkt-border-strong); }
  .mkt-select-trigger.is-open { border-color: var(--mkt-accent); box-shadow: 0 0 0 3px var(--mkt-accent-soft); }
  .mkt-select-trigger:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
  .mkt-select-menu {
    position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 20; background: var(--mkt-bg-card-2);
    border: 1px solid var(--mkt-border-strong); border-radius: 12px; box-shadow: 0 18px 38px -14px rgba(0,0,0,0.75);
    padding: 6px; max-height: 240px; overflow-y: auto;
  }
  .mkt-select-option {
    display: block; width: 100%; text-align: left; background: none; border: none; cursor: pointer;
    font-family: inherit; font-size: 13px; color: var(--text); padding: 9px 11px; border-radius: 8px;
  }
  .mkt-select-option:hover { background: rgba(255,255,255,0.06); }
  .mkt-select-option.is-selected { background: var(--mkt-accent-soft); color: var(--mkt-accent); font-weight: 700; }

  /* ── dropzone อัปโหลดไฟล์ ── กล่องเส้นประ+ไอคอนก้อนเมฆ แทนปุ่มเลือกไฟล์พื้นฐานของ
       เบราว์เซอร์ที่โชว์ "เลือกไฟล์ ไม่ได้เลือกไฟล์ใด" (อ่านไม่รู้เรื่อง ไม่สวย) รองรับ
       ลากไฟล์มาวาง (drag & drop) จริงๆด้วย ไม่ใช่แค่หน้าตา ── */
  .mkt-dropzone {
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
    gap: 6px; padding: 26px 16px; border-radius: 12px; border: 1.5px dashed var(--mkt-border-strong);
    background: var(--mkt-bg-sunken); cursor: pointer; transition: border-color 0.15s, background 0.15s;
  }
  .mkt-dropzone:hover, .mkt-dropzone.is-dragover { border-color: var(--mkt-accent); background: var(--mkt-accent-soft); }
  .mkt-dropzone svg { color: var(--mkt-text-muted-2); }
  .mkt-dropzone:hover svg, .mkt-dropzone.is-dragover svg { color: var(--mkt-accent); }
  .mkt-dropzone-text { font-size: 12.5px; font-weight: 600; color: var(--text-muted); line-height: 1.5; max-width: 280px; }
  .mkt-dropzone-sub { font-size: 11px; color: var(--mkt-text-muted-2); }
  .mkt-dropzone.is-disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
  .mkt-file-chip { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--mkt-bg-sunken); border: 1px solid var(--mkt-border); }
  .mkt-file-chip-thumb {
    width: 34px; height: 34px; border-radius: 8px; flex: 0 0 auto; background-size: cover; background-position: center;
    background-color: var(--mkt-bg-card-2); display: flex; align-items: center; justify-content: center; font-size: 15px; color: var(--mkt-text-muted-2);
  }
  .mkt-file-chip-name { flex: 1 1 auto; min-width: 0; font-size: 12.5px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mkt-file-chip-remove { flex: 0 0 auto; background: none; border: none; color: var(--mkt-text-muted-2); cursor: pointer; padding: 4px; border-radius: 6px; display: flex; }
  .mkt-file-chip-remove:hover { color: #ff9aa2; background: rgba(255,154,162,0.1); }

  /* 🆕 รอบ 9: error ของ dropzone เอง (ไฟล์ใหญ่เกิน 20MB) — โชว์เป็นข้อความเล็กๆสีแดงใต้กล่อง
     dropzone ตรงๆ ไม่ใช่ error รวมของทั้งสเต็ป (mkt-wiz-step-error) เพราะอยากให้คนเห็นว่า
     "ไฟล์นี้" ผิดตรงไหนทันที ไม่ต้องเลื่อนตาไปมา + ใส่ animation เขย่ากล่องเบาๆ (shake) ตอนโดน
     reject ให้สะดุดตาโดยไม่ต้องมี popup/alert รบกวน */
  .mkt-dropzone-error { font-size: 11.5px; color: #ff9aa2; margin-top: 8px; line-height: 1.5; }
  .mkt-dropzone.is-shake { animation: mkt-dz-shake 0.4s ease; }
  @keyframes mkt-dz-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }

  .mkt-wizard-nav { display: flex; align-items: center; gap: 18px; margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--mkt-border); }
  .mkt-btn-primary {
    font-family: inherit; font-size: 13.5px; font-weight: 700; border-radius: 10px; border: none;
    padding: 12px 26px; cursor: pointer; background: var(--mkt-accent); color: #fff; display: inline-flex;
    align-items: center; gap: 8px; transition: background 0.15s, transform 0.12s, box-shadow 0.15s;
  }
  .mkt-btn-primary:hover { background: var(--mkt-accent-hover); transform: translateY(-1px); box-shadow: 0 10px 22px -8px rgba(124,111,244,0.6); }
  .mkt-btn-primary:active { transform: scale(0.97) translateY(0); }
  .mkt-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
  .mkt-btn-link { background: none; border: none; color: var(--mkt-text-muted-2); font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 5px; }
  .mkt-btn-link:hover { color: var(--text); }
  .mkt-btn-link:disabled { opacity: 0.5; cursor: not-allowed; }
  .mkt-wiz-error { font-size: 12px; color: #ff9aa2; margin-top: 4px; }

  /* ── แผง "My Listings" — กริดการ์ด (เดิมเป็นแถวยาวคั่นเส้น) ── */
  .mkt-listings-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; }
  .mkt-listings-head h2 { font-weight: 800; font-size: 19px; margin: 0; color: var(--text); }
  .mkt-listings-head .count { color: var(--mkt-text-muted-2); font-weight: 500; }
  .mkt-listings-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-top: 16px; }
  .mkt-item-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(216px, 1fr)); gap: 16px; margin-top: 18px; }
  .mkt-item-card {
    background: var(--mkt-bg-card); border: 1px solid var(--mkt-border); border-radius: 14px; overflow: hidden;
    box-shadow: 0 10px 24px -14px rgba(0,0,0,0.6); display: flex; flex-direction: column; transition: border-color 0.15s;
  }
  .mkt-item-card:hover { border-color: var(--mkt-border-strong); }
  .mkt-item-card.is-closed { opacity: 0.62; }
  .mkt-item-thumb { height: 112px; position: relative; background-size: cover; background-position: center; }
  .mkt-item-cat {
    position: absolute; top: 9px; left: 9px; font-size: 10px; font-weight: 700; color: #fff;
    padding: 4px 9px; border-radius: 999px;
  }
  .mkt-item-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; }
  .mkt-item-title { font-size: 13.5px; font-weight: 700; color: var(--text); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mkt-item-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .mkt-item-price { font-size: 13.5px; font-weight: 700; color: var(--mkt-gold); font-variant-numeric: tabular-nums; }
  .mkt-item-meta { font-size: 11px; color: var(--mkt-text-muted-2); }
  .mkt-listing-status { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; }
  .mkt-listing-status .dot { width: 6px; height: 6px; border-radius: 999px; flex: 0 0 auto; }
  .mkt-listing-status.is-active { color: var(--mkt-success); } .mkt-listing-status.is-active .dot { background: var(--mkt-success); animation: mktPulseTeal 2.2s ease-in-out infinite; }
  .mkt-listing-status.is-closed { color: var(--mkt-text-muted-2); } .mkt-listing-status.is-closed .dot { background: var(--mkt-text-muted-2); }
  @keyframes mktPulseTeal { 0%, 100% { box-shadow: 0 0 0 0 rgba(45,212,168,0.35); } 50% { box-shadow: 0 0 0 4px rgba(45,212,168,0.12); } }
  .mkt-btn-row-action { background: none; border: none; color: var(--mkt-text-muted-2); font-size: 11.5px; font-weight: 700; cursor: pointer; font-family: inherit; padding: 0; text-decoration: underline; text-decoration-color: transparent; }
  .mkt-btn-row-action:hover { color: var(--text); text-decoration-color: var(--mkt-text-muted-2); }
  .mkt-btn-row-action.is-reopen { color: var(--mkt-accent); }
  .mkt-btn-row-action.is-reopen:hover { text-decoration-color: var(--mkt-accent); }

  @media (max-width: 880px) {
    .mkt-shell { flex-direction: column; }
    .mkt-subnav {
      flex-direction: row; width: 100%; border-right: none; border-bottom: 1px solid var(--mkt-border);
      padding: 14px 20px; gap: 8px; overflow-x: auto; align-items: center;
    }
    .mkt-subnav-label, .mkt-subnav-back { display: none; }
    .mkt-subnav-item { flex: 0 0 auto; }
    .mkt-content { padding: 28px 22px 60px; }
  }
  @media (max-width: 759px) {
    .mkt-h1 { font-size: 24px; }
    .mkt-wiz-split { grid-template-columns: 1fr; gap: 24px; }
    .mkt-wiz-preview-pane { position: static; max-width: 360px; margin: 0 auto; }
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

  return `<div class="mkt-card">
    <div class="mkt-card-eyebrow" data-i18n="pmEyebrow">Payment</div>
    <h2 data-i18n="pmHeading">Get paid directly</h2>
    <p class="mkt-card-desc" data-i18n="pmDesc">Buyers pay you straight through PromptPay or your own payment link — Milo Bot never touches the money.</p>

    <div class="mkt-shop-strip">
      <img src="${escapeHtml(avatarUrl)}" alt="" class="mkt-shop-avatar" style="width:36px;height:36px;object-fit:cover;" />
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text);"><span data-i18n="sellingAsPrefix">Selling as</span> ${escapeHtml(user.username)}</div>
        <div style="font-size:11px;color:${hasAnyMethod ? 'var(--mkt-success)' : 'var(--mkt-text-muted-2)'};margin-top:1px;" data-i18n="${hasAnyMethod ? 'pmSetUp' : 'pmNotSetUp'}">${hasAnyMethod ? 'Payment method set up' : 'Payment method not set up yet'}</div>
      </div>
    </div>

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

  // ไอคอน SVG ที่ใช้ซ้ำหลายจุดด้านล่าง (เขียนแยกไว้ตรงนี้ให้อ่านง่ายขึ้น)
  const chevronDownSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const cloudUploadSvg = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16l-4-4-4 4"/><path d="M12 12v9"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>`;
  const removeXSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const checkSvg = `<svg class="mkt-p-check" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return `<div class="mkt-wizard" style="${canSell ? '' : 'opacity:0.55;'}">
    <!-- ═══ ตัวบอกขั้นตอน (stepper) ── อยู่เหนือ 50/50 split ทั้งก้อน ═══ -->
    <div class="mkt-wiz-stepper">
      <div class="mkt-wiz-step-badge">
        <span data-i18n="stepWord">Step</span>&nbsp;<span id="mkt-wiz-step-label">1</span>&nbsp;<span data-i18n="stepOf2">of 2</span>
      </div>
      <div class="mkt-progress-rule">
        <div class="mkt-p-node is-active" id="mkt-wiz-node1">
          <span class="mkt-p-dot"><span class="mkt-p-num">1</span>${checkSvg}</span>
          <span class="mkt-p-text" data-i18n="progressCard">Grid card</span>
        </div>
        <span class="mkt-p-fill" id="mkt-wiz-line1"></span>
        <div class="mkt-p-node" id="mkt-wiz-node2">
          <span class="mkt-p-dot"><span class="mkt-p-num">2</span>${checkSvg}</span>
          <span class="mkt-p-text" data-i18n="progressDetail">Full details</span>
        </div>
      </div>
      <div class="mkt-wiz-step-caption" id="mkt-wiz-step-title" data-i18n="stepTitleStep1">— the card buyers see in the grid</div>
    </div>

    <form id="mkt-wiz-form" method="POST" action="/dashboard/${encodeURIComponent(guildId)}/marketplace/listings" enctype="multipart/form-data">
      <div class="mkt-wiz-split">

        <!-- ═══ ฝั่งซ้าย: พรีวิวสด ลอยตรึง (sticky) ═══ สีพวกนี้ตั้งใจ hardcode ไม่ใช้
             var(--xxx) ของแดชบอร์ด เพราะพรีวิวต้องเลียนแบบหน้า public/marketplace.html
             (ธีมมืดของมันเอง) ให้ตรงเป๊ะๆ -->
        <div class="mkt-wiz-preview-pane">
          <div class="mkt-live-tag"><span class="dot"></span><span data-i18n="livePreview">Live preview</span></div>
          <div class="mkt-frame-wrap">
            <div class="mkt-device-bar">
              <span class="mkt-device-dot"></span><span class="mkt-device-dot"></span><span class="mkt-device-dot"></span>
              <span class="mkt-device-url" data-i18n="devicePreviewLabel">Marketplace preview</span>
            </div>

            <!-- พรีวิวสเต็ป 1: การ์ดในกริด (สไตล์ก๊อปจาก buildListingCardHtml() ใน public/marketplace.html) -->
            <div id="mkt-wiz-preview-card" style="position:relative;height:182px;overflow:hidden;background:linear-gradient(135deg,#1f2937,#2c3559 75%);">
              <div id="mkt-wiz-pc-badge" style="position:absolute;top:11px;left:11px;background:#4b5563;border-radius:999px;padding:4px 10px;font-size:10px;font-weight:700;color:#fff;" data-i18n="chooseCategory">Choose a category&hellip;</div>
              <div style="position:absolute;inset:0;background:linear-gradient(180deg, transparent 42%, rgba(5,7,15,0.94) 100%);"></div>
              <div style="position:absolute;left:16px;right:16px;bottom:13px;">
                <div id="mkt-wiz-pc-title" style="font-size:15px;font-weight:700;color:#fff;line-height:1.3;" data-i18n="previewDefaultTitle">Your item title</div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
                  <span style="font-size:12px;color:rgba(255,255,255,0.75);">${escapeHtml(sellerDisplayName || 'You')}</span>
                  <span style="display:flex;align-items:center;"><span class="mkt-wiz-price-coin" id="mkt-wiz-pc-coin">&#3647;</span><span id="mkt-wiz-pc-price" style="font-size:15px;font-weight:700;color:#f4b860;">0</span></span>
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
                  <span style="display:flex;align-items:center;"><span class="mkt-wiz-price-coin" id="mkt-wiz-pd-coin">&#3647;</span><span id="mkt-wiz-pd-price" style="font-size:16px;font-weight:700;color:#f4b860;">0</span></span>
                </div>
                <div style="height:1px;background:#262f4d;margin:12px 0;"></div>
                <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:#9aa2c4;text-transform:uppercase;margin-bottom:5px;" data-i18n="fieldDescription">Description</div>
                <div id="mkt-wiz-pd-desc" style="font-size:12.5px;color:#c3c8e6;line-height:1.6;" data-i18n="previewDefaultDesc">Your description will show up here.</div>
                <div id="mkt-wiz-pd-filebadge" style="display:none;margin-top:9px;font-size:12px;color:#7fc9c0;"></div>
              </div>
            </div>
          </div>
          <p class="mkt-preview-note" data-i18n="previewNote">Mirrors the real Marketplace page — this is what buyers actually see.</p>
        </div>

        <!-- ═══ ฝั่งขวา: ฟอร์มของสเต็ปที่กำลังทำอยู่ — เลื่อนไปตามหน้าได้ปกติ ═══ -->
        <div class="mkt-wiz-form-pane">

          <!-- สเต็ป 1/2: ข้อมูลสำหรับการ์ด -->
          <div class="mkt-form-step" id="mkt-wiz-step1">
            <div class="mkt-field">
              <label class="mkt-field-label" data-i18n="fieldTitle">Title</label>
              <input class="mkt-line-input" type="text" name="title" id="mkt-wiz-title-input" maxlength="80" ${disabledAttr} />
            </div>

            <!-- 🆕 รอบ 8: ช่องราคา + ตัวสลับสกุลเงิน THB/USD ข้างๆ label (ของใหม่ตามสเปค
                 "Currency Toggle" — สลับแค่หน้าตา/label/พรีวิว ตัวเลขที่ยิงไปจริงยังตีความ
                 เป็นบาทไทยเสมอ ดูคอมเมนต์เต็มๆ ที่ MARKETPLACE_STYLE หัวข้อ mkt-currency-toggle) -->
            <div class="mkt-field">
              <div class="mkt-field-label-row">
                <label class="mkt-field-label" id="mkt-wiz-price-label" data-i18n="fieldPriceThb">Price (THB)</label>
                <div class="mkt-currency-toggle" role="group" aria-label="Currency">
                  <button type="button" class="mkt-currency-btn" id="mkt-currency-thb" aria-selected="true" ${disabledAttr} onclick="mktSelectCurrency('THB')">&#3647; THB</button>
                  <button type="button" class="mkt-currency-btn" id="mkt-currency-usd" aria-selected="false" ${disabledAttr} onclick="mktSelectCurrency('USD')">$ USD</button>
                </div>
              </div>
              <input class="mkt-line-input" type="number" name="price" id="mkt-wiz-price-input" min="1" max="20000" step="1" ${disabledAttr} />
              <div class="mkt-currency-note" data-i18n="currencyNote">Payments are always processed in Thai Baht (THB) — USD is shown for preview only.</div>
            </div>

            <!-- 🆕 รอบ 8: หมวดหมู่/หมวดย่อย เปลี่ยนจาก native &lt;select&gt; เป็น custom
                 dropdown หน้าตาคุมเอง — &lt;select&gt; ของจริงยังอยู่ (ซ่อนด้วย .mkt-sr-input)
                 ชื่อ field/ค่าที่ submit เหมือนเดิม 100% ดู mktInitCustomSelect() ด้านล่าง -->
            <div class="mkt-field-pair">
              <div class="mkt-field">
                <label class="mkt-field-label" data-i18n="fieldCategory">Category</label>
                <div class="mkt-custom-select" id="mkt-category-wrap">
                  <select class="mkt-sr-input" name="category" id="mkt-category-select" ${disabledAttr}>
                    <option value="" disabled selected data-i18n="chooseCategory">Choose a category&hellip;</option>
                    ${categoryOptionsHtml}
                  </select>
                  <button type="button" class="mkt-select-trigger" id="mkt-category-trigger" data-select="mkt-category-select" ${disabledAttr}>
                    <span class="mkt-select-trigger-label placeholder" data-i18n="chooseCategory">Choose a category&hellip;</span>
                    ${chevronDownSvg}
                  </button>
                  <div class="mkt-select-menu" id="mkt-category-menu" hidden></div>
                </div>
              </div>
              <div class="mkt-field" id="mkt-subcategory-label" style="display:none;">
                <label class="mkt-field-label" data-i18n="fieldSubcategory">Subcategory</label>
                <div class="mkt-custom-select" id="mkt-subcategory-wrap">
                  <select class="mkt-sr-input" name="subcategory" id="mkt-subcategory-select" ${disabledAttr}></select>
                  <button type="button" class="mkt-select-trigger" id="mkt-subcategory-trigger" data-select="mkt-subcategory-select" ${disabledAttr}>
                    <span class="mkt-select-trigger-label placeholder">—</span>
                    ${chevronDownSvg}
                  </button>
                  <div class="mkt-select-menu" id="mkt-subcategory-menu" hidden></div>
                </div>
              </div>
            </div>

            <!-- 🆕 รอบ 8: dropzone ลากไฟล์มาวาง/กดเพื่ออัปโหลด แทนปุ่มเลือกไฟล์พื้นฐานของ
                 เบราว์เซอร์ — &lt;input type="file"&gt; ของจริงยังชื่อ "image" เหมือนเดิม
                 (ซ่อนด้วย .mkt-sr-input) ดู mktInitDropzone() ด้านล่าง -->
            <div class="mkt-field">
              <label class="mkt-field-label"><span data-i18n="fieldCoverImage">Cover image</span> <span style="font-weight:400;" data-i18n="fieldCoverImageNote">(shown on the card — optional, up to 20MB)</span></label>
              <input class="mkt-sr-input" type="file" name="image" id="mkt-wiz-image-input" accept="image/png,image/jpeg,image/webp,image/gif" ${disabledAttr} />
              <label for="mkt-wiz-image-input" class="mkt-dropzone${canSell ? '' : ' is-disabled'}" id="mkt-wiz-image-dropzone">
                ${cloudUploadSvg}
                <div class="mkt-dropzone-text" data-i18n="dropzoneImageTitle">Drag and drop or click to upload cover image</div>
                <div class="mkt-dropzone-sub" data-i18n="dropzoneLimitNote">(Max size: 20MB)</div>
              </label>
              <!-- 🆕 รอบ 9: error เฉพาะของ dropzone นี้ (ไฟล์ใหญ่เกิน 20MB) — ซ่อนไว้ก่อน เติม
                   ข้อความ/โชว์ด้วย JS ใน mktInitDropzone() เท่านั้น ดู aria-live ไว้ให้ screen
                   reader อ่านข้อความ error ทันทีที่โชว์ด้วย -->
              <div class="mkt-dropzone-error" id="mkt-wiz-image-error" style="display:none;" aria-live="polite"></div>
              <div class="mkt-file-chip" id="mkt-wiz-image-chip" style="display:none;">
                <div class="mkt-file-chip-thumb" id="mkt-wiz-image-chip-thumb"></div>
                <div class="mkt-file-chip-name" id="mkt-wiz-image-chip-name"></div>
                <button type="button" class="mkt-file-chip-remove" id="mkt-wiz-image-chip-remove" data-i18n-title="removeFileLabel" title="Remove">${removeXSvg}</button>
              </div>
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
              <div class="mkt-custom-select" id="mkt-type-wrap">
                <select class="mkt-sr-input" name="type" id="mkt-type-select" ${disabledAttr}>
                  <option value="service" data-i18n="typeService">Service (you contact the buyer yourself)</option>
                  <option value="digital" data-i18n="typeDigital">Digital file (sent automatically after payment)</option>
                </select>
                <button type="button" class="mkt-select-trigger" id="mkt-type-trigger" data-select="mkt-type-select" ${disabledAttr}>
                  <span class="mkt-select-trigger-label" data-i18n="typeService">Service (you contact the buyer yourself)</span>
                  ${chevronDownSvg}
                </button>
                <div class="mkt-select-menu" id="mkt-type-menu" hidden></div>
              </div>
            </div>
            <div class="mkt-field" id="mkt-digitalfile-label" style="display:none;">
              <label class="mkt-field-label"><span data-i18n="fieldDigitalFile">Digital file</span> <span style="font-weight:400;" data-i18n="fieldDigitalFileNote">(sent to the buyer automatically — required for digital items, up to 20MB)</span></label>
              <input class="mkt-sr-input" type="file" name="digitalFile" id="mkt-digitalfile-input" ${disabledAttr} />
              <label for="mkt-digitalfile-input" class="mkt-dropzone${canSell ? '' : ' is-disabled'}" id="mkt-digitalfile-dropzone">
                ${cloudUploadSvg}
                <div class="mkt-dropzone-text" data-i18n="dropzoneFileTitle">Drag and drop or click to upload the digital file</div>
                <div class="mkt-dropzone-sub" data-i18n="dropzoneLimitNote">(Max size: 20MB)</div>
              </label>
              <div class="mkt-dropzone-error" id="mkt-digitalfile-error" style="display:none;" aria-live="polite"></div>
              <div class="mkt-file-chip" id="mkt-digitalfile-chip" style="display:none;">
                <div class="mkt-file-chip-thumb" id="mkt-digitalfile-chip-thumb"></div>
                <div class="mkt-file-chip-name" id="mkt-digitalfile-chip-name"></div>
                <button type="button" class="mkt-file-chip-remove" id="mkt-digitalfile-chip-remove" data-i18n-title="removeFileLabel" title="Remove">${removeXSvg}</button>
              </div>
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
      var currentCurrency = 'THB'; // 🆕 รอบ 8: แค่ state ฝั่งหน้าเว็บ ไม่ได้ส่งไป server เลย

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
      var node1 = document.getElementById('mkt-wiz-node1');
      var node2 = document.getElementById('mkt-wiz-node2');
      var line1 = document.getElementById('mkt-wiz-line1');
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
      var pcCoin = document.getElementById('mkt-wiz-pc-coin');
      var pdHero = document.getElementById('mkt-wiz-pd-hero');
      var pdBadge = document.getElementById('mkt-wiz-pd-badge');
      var pdTitle = document.getElementById('mkt-wiz-pd-title');
      var pdPrice = document.getElementById('mkt-wiz-pd-price');
      var pdCoin = document.getElementById('mkt-wiz-pd-coin');
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

      // 🆕 รอบ 8: เลขราคา (ไม่รวมสัญลักษณ์สกุลเงินแล้ว — ย้ายสัญลักษณ์ไปอยู่ที่ "เหรียญ"
      // mkt-wiz-price-coin แยกต่างหาก ดู currencySymbol() ด้านล่าง)
      function formattedPriceAmount() {
        var price = parseInt(priceInput.value, 10);
        return price > 0 ? price.toLocaleString('en-US') : '0';
      }
      function currencySymbol() {
        return currentCurrency === 'USD' ? '$' : '\\u0e3f';
      }

      // อัปเดตพรีวิวการ์ด (สเต็ป 1) — เรียกทุกครั้งที่พิมพ์ชื่อ/ราคา/เปลี่ยนหมวด/เปลี่ยนรูป/สลับสกุลเงิน
      function updateCardPreview() {
        var style = currentCategoryStyle();
        pcBadge.textContent = style.label;
        pcBadge.style.background = style.badge;
        applyPreviewBackground(previewCardEl, style);
        pcTitle.textContent = titleInput.value.trim() || mktT('previewDefaultTitle');
        pcPrice.textContent = formattedPriceAmount();
        pcCoin.textContent = currencySymbol();
      }

      // อัปเดตพรีวิวดีเทล (สเต็ป 2) — เรียกทุกครั้งที่พิมพ์คำอธิบาย/เปลี่ยน type/เลือกไฟล์ด้วย
      // (เรียกพร้อมกับ updateCardPreview เสมอ เพราะ title/price/category ใช้ร่วมกันทั้ง 2 พรีวิว)
      function updateDetailPreview() {
        var style = currentCategoryStyle();
        pdBadge.textContent = style.label;
        pdBadge.style.background = style.badge;
        applyPreviewBackground(pdHero, style);
        pdTitle.textContent = titleInput.value.trim() || mktT('previewDefaultTitle');
        pdPrice.textContent = formattedPriceAmount();
        pdCoin.textContent = currencySymbol();
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

      // 🆕 รอบ 8: สลับสกุลเงิน THB/USD — ของจริงที่ส่งไป server (name="price") ยังเป็น
      // เลขเดียวกันเป๊ะๆไม่ว่าจะเลือกสกุลไหน (ดูคอมเมนต์เต็มๆใน MARKETPLACE_STYLE) ฟังก์ชันนี้
      // ต้องเป็น window.xxx (ไม่ใช่ function ธรรมดาในนี้) เพราะปุ่มเรียกผ่าน onclick="" ใน
      // HTML ซึ่งมองไม่เห็นตัวแปร/ฟังก์ชันที่อยู่ข้างในวงเล็บ (function(){ ... })() ก้อนนี้
      window.mktSelectCurrency = function (currency) {
        currentCurrency = currency;
        var thbBtn = document.getElementById('mkt-currency-thb');
        var usdBtn = document.getElementById('mkt-currency-usd');
        if (thbBtn) thbBtn.setAttribute('aria-selected', String(currency === 'THB'));
        if (usdBtn) usdBtn.setAttribute('aria-selected', String(currency === 'USD'));
        var priceLabelEl = document.getElementById('mkt-wiz-price-label');
        if (priceLabelEl) {
          var key = currency === 'USD' ? 'fieldPriceUsd' : 'fieldPriceThb';
          priceLabelEl.setAttribute('data-i18n', key);
          priceLabelEl.textContent = mktT(key);
        }
        updateBothPreviews();
      };

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
        if (subcategoryCustom) subcategoryCustom.refresh(); // 🆕 รอบ 8: เมนู custom ของ subcategory ต้องรีสร้างใหม่ตามตัวเลือกที่เปลี่ยนไป
        updateBothPreviews();
      }

      // ── โชว์/ซ่อน digital file ตาม type ที่เลือก ──
      function updateDigitalFile() {
        var isDigital = typeSelect.value === 'digital';
        fileLabel.style.display = isDigital ? 'flex' : 'none';
        if (!isDigital) fileInput.value = ''; // เผื่อเคยเลือกไฟล์ไว้แล้วเปลี่ยนใจเป็น service ล้างออกกันค้าง
        updateDetailPreview();
      }

      // 🆕 รอบ 8: custom dropdown ── ปุ่ม trigger + เมนูลอย คุม <select> ของจริงที่ซ่อนไว้
      // (ซ่อนด้วย .mkt-sr-input ไม่ใช่ display:none กัน browser งอแงเรื่อง submit) เลือก
      // ตัวเลือกในเมนูแล้วเซ็ต select.value + ยิง 'change' event ต่อให้ select ของจริง
      // เพื่อให้ listener เดิมที่ผูกกับ select (updateSubcategory/updateDigitalFile) ทำงาน
      // ต่อตามปกติ ไม่ต้องแก้ตรรกะเดิมเลย
      function mktInitCustomSelect(selectId, triggerId, menuId) {
        var select = document.getElementById(selectId);
        var trigger = document.getElementById(triggerId);
        var menu = document.getElementById(menuId);
        if (!select || !trigger || !menu) return null;

        function syncLabel() {
          var labelEl = trigger.querySelector('.mkt-select-trigger-label');
          var selected = select.options[select.selectedIndex];
          if (!labelEl || !selected) return;
          labelEl.textContent = selected.textContent;
          labelEl.classList.toggle('placeholder', !!selected.disabled);
        }

        function renderMenu() {
          var html = '';
          for (var i = 0; i < select.options.length; i++) {
            var opt = select.options[i];
            if (opt.disabled) continue; // ตัวเลือก placeholder ("Choose a category...") ไม่โชว์ในเมนู เหมือน native select
            html += '<button type="button" class="mkt-select-option' + (opt.selected ? ' is-selected' : '') + '" data-value="' + String(opt.value).replace(/"/g, '&quot;') + '">' + opt.textContent + '</button>';
          }
          menu.innerHTML = html;
          var optionBtns = menu.querySelectorAll('.mkt-select-option');
          for (var j = 0; j < optionBtns.length; j++) {
            optionBtns[j].addEventListener('click', function () {
              select.value = this.getAttribute('data-value');
              closeMenu();
              syncLabel();
              select.dispatchEvent(new Event('change', { bubbles: true }));
            });
          }
        }

        function openMenu() {
          if (trigger.disabled) return;
          renderMenu();
          menu.hidden = false;
          trigger.classList.add('is-open');
          document.addEventListener('click', onOutsideClick);
        }
        function closeMenu() {
          menu.hidden = true;
          trigger.classList.remove('is-open');
          document.removeEventListener('click', onOutsideClick);
        }
        function onOutsideClick(e) {
          if (!trigger.contains(e.target) && !menu.contains(e.target)) closeMenu();
        }

        trigger.addEventListener('click', function () {
          if (menu.hidden) openMenu(); else closeMenu();
        });
        trigger.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') closeMenu();
        });

        syncLabel();
        return { refresh: function () { syncLabel(); if (!menu.hidden) renderMenu(); } };
      }

      // 🆕 รอบ 8: สร้าง custom dropdown ทั้ง 3 ตัว — ต้องสร้างตรงนี้ก่อนเรียก updateSubcategory()
      // ด้านล่าง เพราะ updateSubcategory() เรียก subcategoryCustom.refresh() ทันทีตอนโหลดหน้า
      var categoryCustom = mktInitCustomSelect('mkt-category-select', 'mkt-category-trigger', 'mkt-category-menu');
      var subcategoryCustom = mktInitCustomSelect('mkt-subcategory-select', 'mkt-subcategory-trigger', 'mkt-subcategory-menu');
      var typeCustom = mktInitCustomSelect('mkt-type-select', 'mkt-type-trigger', 'mkt-type-menu');

      categorySelect.addEventListener('change', updateSubcategory);
      typeSelect.addEventListener('change', updateDigitalFile);
      updateSubcategory();
      updateDigitalFile();
      updateBothPreviews();

      // 🆕 รอบ 8: dropzone ลากไฟล์มาวาง/กดเพื่ออัปโหลด แทนปุ่ม "เลือกไฟล์" พื้นฐานของเบราว์เซอร์
      // ที่อ่านไม่รู้เรื่อง — input ของจริงยังเป็น input[type=file] ชื่อเดิมทุกอย่าง (ซ่อนด้วย
      // .mkt-sr-input) แค่ครอบด้วย <label for="..."> เป็นกล่องเส้นประให้กดเปิดไฟล์ได้ตรงๆ
      // (ไม่ต้องใช้ JS เปิด dialog เลย) ส่วน drag & drop ใช้ DataTransfer เซ็ต input.files
      // ตรงๆ แล้วยิง 'change' event ต่อ ให้ listener เดิมของแต่ละ input ทำงานเหมือนเลือกไฟล์
      // ผ่านปุ่มปกติทุกอย่าง (รูปอัปเดตพรีวิว / ชื่อไฟล์โชว์ในชิป ฯลฯ)
      // 🆕 รอบ 9: 20MB เท่ากับลิมิตฝั่ง server เป๊ะๆ (ดู marketplaceUpload ใน server.js) — เช็ค
      // ขนาดไฟล์ฝั่ง browser ก่อน เพื่อกันปัญหาที่น้องหนาวแจ้งมา: เดิมถ้าไฟล์ใหญ่เกิน 20MB
      // ฟอร์มจะหลุดไป submit ที่ server จริง แล้วโดน multer เตะกลับมาเป็น redirect ไปหน้า
      // "Overview" พร้อมล้างข้อมูลที่กรอกไว้ทั้งหมด (Title/Price/Description/Category) ทิ้งหมด
      // ต้องมานั่งกรอกใหม่ทั้งหมด ตอนนี้เช็คตรงนี้ก่อนเลย ไฟล์ใหญ่เกินจะไม่ถูกปล่อยให้ submit
      // ออกไปไกลขนาดนั้นอีกต่อไป — หน้าไม่ reload/redirect เลย ฟิลด์อื่นๆไม่หายแน่นอน
      var MKT_MAX_FILE_BYTES = 20 * 1024 * 1024;

      function mktInitDropzone(inputId, dropzoneId, chipId, thumbId, nameId, removeId, errorId, isImage) {
        var input = document.getElementById(inputId);
        var dropzone = document.getElementById(dropzoneId);
        var chip = document.getElementById(chipId);
        var thumb = document.getElementById(thumbId);
        var nameEl = document.getElementById(nameId);
        var removeBtn = document.getElementById(removeId);
        var errorEl = document.getElementById(errorId);
        if (!input || !dropzone || !chip) return;

        // โชว์ข้อความ error เล็กๆใต้กล่อง dropzone + เขย่ากล่อง (shake) เบาๆให้สะดุดตา —
        // ถอด class 'is-shake' ออกก่อนแล้วค่อยใส่กลับ (บวก forced reflow ด้วย offsetWidth)
        // เพื่อให้ animation เล่นใหม่ได้ทุกครั้ง แม้จะเลือกไฟล์ใหญ่เกินซ้ำๆติดกันก็ตาม
        function showFileError(msg) {
          if (errorEl) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
          }
          dropzone.classList.remove('is-shake');
          void dropzone.offsetWidth;
          dropzone.classList.add('is-shake');
        }
        function clearFileError() {
          if (errorEl) {
            errorEl.style.display = 'none';
            errorEl.textContent = '';
          }
          dropzone.classList.remove('is-shake');
        }
        dropzone.addEventListener('animationend', function () {
          dropzone.classList.remove('is-shake');
        });

        function showChip(file) {
          nameEl.textContent = file.name;
          if (isImage) {
            var reader = new FileReader();
            reader.onload = function (e) {
              thumb.style.backgroundImage = "url('" + e.target.result + "')";
              thumb.textContent = '';
            };
            reader.readAsDataURL(file);
          } else {
            thumb.style.backgroundImage = '';
            thumb.textContent = '\\ud83d\\udcc4';
          }
          chip.style.display = 'flex';
          dropzone.style.display = 'none';
        }
        function showEmpty() {
          chip.style.display = 'none';
          dropzone.style.display = 'flex';
          thumb.style.backgroundImage = '';
          thumb.textContent = '';
          nameEl.textContent = '';
        }

        input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          if (!file) {
            showEmpty();
            return;
          }
          if (file.size > MKT_MAX_FILE_BYTES) {
            // ไฟล์ใหญ่เกิน 20MB — เคลียร์ input ทิ้งทันที (ค่า value='' จะล้าง .files ไปด้วย)
            // กันไม่ให้ไฟล์นี้หลุดไปติด submit ตอนกดปุ่ม Next/ลงขายจริงได้เลย ไม่ต้องรอ validate
            // ตอน submit อีกชั้น — โชว์กล่อง dropzone เปล่ากลับมาพร้อม error ใต้กล่อง
            input.value = '';
            showEmpty();
            showFileError(mktT('errFileTooLarge'));
            return;
          }
          clearFileError();
          showChip(file);
        });

        if (removeBtn) {
          removeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            input.value = '';
            clearFileError();
            input.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }

        dropzone.addEventListener('dragover', function (e) {
          e.preventDefault();
          dropzone.classList.add('is-dragover');
        });
        dropzone.addEventListener('dragleave', function () {
          dropzone.classList.remove('is-dragover');
        });
        dropzone.addEventListener('drop', function (e) {
          e.preventDefault();
          dropzone.classList.remove('is-dragover');
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
            input.files = e.dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }

      mktInitDropzone('mkt-wiz-image-input', 'mkt-wiz-image-dropzone', 'mkt-wiz-image-chip', 'mkt-wiz-image-chip-thumb', 'mkt-wiz-image-chip-name', 'mkt-wiz-image-chip-remove', 'mkt-wiz-image-error', true);
      mktInitDropzone('mkt-digitalfile-input', 'mkt-digitalfile-dropzone', 'mkt-digitalfile-chip', 'mkt-digitalfile-chip-thumb', 'mkt-digitalfile-chip-name', 'mkt-digitalfile-chip-remove', 'mkt-digitalfile-error', false);

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
 * การ์ดประกาศขาย 1 ใบ ในกริด "My Listings" — มีปุ่มปิด/เปิดขายใหม่ (ฟอร์มเล็กๆ ปุ่มเดียวจบ
 * ไม่ต้องพึ่ง JS) ตามสถานะปัจจุบัน 🆕 รอบ 7: เปลี่ยนจากแถวยาวคั่นเส้น (.mkt-listing-row เดิม
 * ของรอบ 6) เป็นการ์ดในกริด (.mkt-item-card) หน้าตาใกล้เคียงการ์ดในหน้า public/marketplace.html
 * ของผู้ซื้อมากขึ้น — ข้อมูล/validation/route เดิมทุกอย่าง เปลี่ยนแค่หน้าตา
 * @param {object} listing { id, title, priceThb, category, subcategory, status, imageUrl, createdAt }
 * @param {object} categories CATEGORIES object
 */
function listingCardHtml(listing, categories, guildId) {
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
  return `<div class="mkt-item-card${isActive ? '' : ' is-closed'}" data-status="${isActive ? 'active' : 'closed'}">
    <div class="mkt-item-thumb" style="${thumbStyle}">
      <span class="mkt-item-cat" style="background:${catStyle.badge};">${escapeHtml(categoryLabel)}</span>
    </div>
    <div class="mkt-item-body">
      <div class="mkt-item-title">${escapeHtml(listing.title)}</div>
      <div class="mkt-item-row">
        <span class="mkt-item-price">&#3647;${Number(listing.priceThb).toLocaleString('en-US')}</span>
        <span class="mkt-item-meta" data-created="${new Date(listing.createdAt).getTime()}">${escapeHtml(relativeTimeLabel(listing.createdAt))}</span>
      </div>
      <div class="mkt-item-row">
        ${statusIndicatorHtml(listing.status)}
        ${actionHtml}
      </div>
    </div>
  </div>`;
}

/**
 * แผง "My Listings" ทั้งก้อน — โชว์ข้อความเฉยๆ ถ้ายังไม่เคยลงขายอะไรเลย
 * 🆕 รอบ 7: ย้าย "+ New Listing" มาเป็นปุ่มเด่นในหัวแผงนี้ (กดแล้วสลับไปแผง "Create Listing"
 * ด้วย mktShowPanel('create') — เรียกใช้ฟังก์ชันเดียวกับแถบเมนูย่อย ดู renderMarketplaceDashboardPage)
 * แท็บกรอง All / Active / Closed ยังเป็นของรอบ 6 เดิม กรองด้วย JS ฝั่ง client เฉยๆ ไม่ยิง
 * request ใหม่เลย (เปลี่ยนแค่ตัวที่กรอง จากแถวเป็นการ์ดในกริด)
 */
function myListingsSectionHtml(listings, categories, guildId) {
  const headHtml = `<div class="mkt-listings-head">
    <h2><span data-i18n="listingsHeading">Your listings</span>${listings.length ? ` <span class="count">(${listings.length})</span>` : ''}</h2>
    <button type="button" class="mkt-btn-primary" onclick="mktShowPanel('create')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
      <span data-i18n="newListingBtn">New Listing</span>
    </button>
  </div>`;

  if (listings.length === 0) {
    return `<div class="mkt-listings">
      ${headHtml}
      <div style="font-size:12.5px;color:var(--mkt-text-muted-2);margin-top:14px;" data-i18n="emptyListings">You haven't listed anything yet — use the "New Listing" button above to list your first item.</div>
    </div>`;
  }

  const cardsHtml = listings.map((listing) => listingCardHtml(listing, categories, guildId)).join('');

  return `<div class="mkt-listings">
    ${headHtml}
    <div class="mkt-listings-toolbar">
      <div class="mkt-tab-row" role="tablist" aria-label="Filter listings">
        <button type="button" class="mkt-text-tab" role="tab" aria-selected="true" onclick="mktFilterListings(this,'all')"><span data-i18n="filterAll">All</span></button>
        <button type="button" class="mkt-text-tab" role="tab" aria-selected="false" onclick="mktFilterListings(this,'active')"><span data-i18n="filterActive">Active</span></button>
        <button type="button" class="mkt-text-tab" role="tab" aria-selected="false" onclick="mktFilterListings(this,'closed')"><span data-i18n="filterClosed">Closed</span></button>
      </div>
    </div>
    <div class="mkt-item-grid" id="mkt-listing-list">${cardsHtml}</div>
  </div>

  <script>
    function mktFilterListings(btn, status) {
      var tabs = btn.parentElement.querySelectorAll('.mkt-text-tab');
      tabs.forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
      btn.setAttribute('aria-selected', 'true');
      document.querySelectorAll('#mkt-listing-list .mkt-item-card').forEach(function (card) {
        var show = status === 'all' || card.getAttribute('data-status') === status;
        card.style.display = show ? '' : 'none';
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
    statListingsLabel: { en: 'active listings', th: 'รายการที่เปิดขาย' },
    statSalesLabel: { en: 'sales completed', th: 'ยอดขายสำเร็จ' },
    // 🆕 รอบ 7: ป้ายของแถบเมนูย่อย + หัวข้อแผง (ชื่อเดียวกันใช้ซ้ำทั้ง 2 ที่ — ปุ่มเมนูย่อย
    // กับ <h1> ของแผงนั้นๆ)
    navOverview: { en: 'Overview', th: 'ภาพรวม' },
    navMyListings: { en: 'My Listings', th: 'ประกาศของฉัน' },
    backToDashboard: { en: 'Back to Dashboard', th: 'กลับไปแดชบอร์ด' },
    overviewSubtitle: {
      en: 'Track how your shop is doing and manage how buyers pay you.',
      th: 'ดูภาพรวมร้านของคุณ และตั้งค่าว่าผู้ซื้อจะจ่ายเงินให้คุณยังไง',
    },
    pmEyebrow: { en: 'Payment', th: 'การรับเงิน' },
    pmHeading: { en: 'Get paid directly', th: 'รับเงินเข้ากระเป๋าตรงๆ' },
    pmDesc: {
      en: 'Buyers pay you straight through PromptPay or your own payment link — Milo Bot never touches the money.',
      th: 'ผู้ซื้อจ่ายเงินให้คุณตรงๆ ผ่านพร้อมเพย์หรือลิงก์รับเงินของคุณเอง — Milo Bot ไม่แตะเงินเลย',
    },
    newListingBtn: { en: 'New Listing', th: 'ลงขายใหม่' },
    createListingEyebrow: { en: 'My Listings', th: 'ประกาศของฉัน' },
    createListingHeading: { en: 'Create New Listing', th: 'สร้างประกาศขายใหม่' },
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
    // 🆕 รอบ 8: fieldPrice เดิม เปลี่ยนชื่อเป็น fieldPriceThb + เพิ่ม fieldPriceUsd คู่กัน
    // (สลับกันตามปุ่มเลือกสกุลเงิน THB/USD — ดู mktSelectCurrency ใน sellWizardHtml())
    fieldPriceThb: { en: 'Price (THB)', th: 'ราคา (บาท)' },
    fieldPriceUsd: { en: 'Price (USD)', th: 'ราคา (ดอลลาร์)' },
    currencyNote: {
      en: 'Payments are always processed in Thai Baht (THB) — USD is shown for preview only.',
      th: 'ระบบรับเงินเป็นเงินบาทไทย (THB) เท่านั้นนะครับ ตัวเลือก USD ใช้แสดงตัวอย่างราคาเท่านั้น',
    },
    fieldCategory: { en: 'Category', th: 'หมวดหมู่' },
    fieldSubcategory: { en: 'Subcategory', th: 'หมวดย่อย' },
    fieldCoverImage: { en: 'Cover image', th: 'รูปปก' },
    fieldCoverImageNote: { en: '(shown on the card — optional, up to 20MB)', th: '(โชว์บนการ์ด — ไม่บังคับ ขนาดไม่เกิน 20MB)' },
    chooseCategory: { en: 'Choose a category…', th: 'เลือกหมวดหมู่…' },
    // 🆕 รอบ 8: ข้อความใน dropzone อัปโหลดไฟล์ (แทนปุ่ม "เลือกไฟล์" เดิมของเบราว์เซอร์)
    dropzoneImageTitle: { en: 'Drag and drop or click to upload cover image', th: 'ลากไฟล์มาวาง หรือกดเพื่ออัปโหลดรูปปก' },
    dropzoneFileTitle: { en: 'Drag and drop or click to upload the digital file', th: 'ลากไฟล์มาวาง หรือกดเพื่ออัปโหลดไฟล์ดิจิทัล' },
    dropzoneLimitNote: { en: '(Max size: 20MB)', th: '(ขนาดไฟล์สูงสุด 20MB)' },
    removeFileLabel: { en: 'Remove', th: 'นำออก' },
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
    // 🆕 รอบ 9: ข้อความ error ของ dropzone เองตอนไฟล์ใหญ่เกิน 20MB — ใช้กับทั้งกล่องรูปปกและ
    // กล่องไฟล์ดิจิทัล (โชว์ใต้กล่องตรงๆ ไม่ใช่ error รวมของสเต็ป)
    errFileTooLarge: {
      en: 'This file exceeds the 20MB limit. Please choose a smaller file.',
      th: 'ไฟล์นี้มีขนาดเกิน 20MB นะครับ กรุณาเลือกไฟล์ที่เล็กกว่านี้ครับ',
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
      // 🆕 รอบ 8: ป้าย title (เช่นปุ่ม "Remove" ของ dropzone) ไม่ใช่ textContent เลยต้อง
      // รีเฟรชแยกผ่าน attribute title="" โดยตรง
      document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
        el.title = mktT(el.getAttribute('data-i18n-title'));
      });
      // 🆕 รอบ 8: ป้ายของปุ่ม custom dropdown (category/subcategory/type) ไม่ได้มี
      // data-i18n ติดตัวเอง (ข้อความมันก็อปมาจาก <option> ที่เลือกอยู่ของ select ของจริง
      // ซึ่งอัปเดตคำแปลไปแล้วจากลูปด้านบน) แค่ต้องก๊อปข้อความที่แปลแล้วมาแสดงผลซ้ำที่ปุ่มด้วย
      document.querySelectorAll('.mkt-select-trigger[data-select]').forEach(function (btn) {
        var select = document.getElementById(btn.getAttribute('data-select'));
        var labelEl = btn.querySelector('.mkt-select-trigger-label');
        if (!select || !labelEl) return;
        var selected = select.options[select.selectedIndex];
        if (selected) labelEl.textContent = selected.textContent;
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

  // 🆕 รอบ 7: โครงหน้าเปลี่ยนเป็น "แถบเมนูย่อย (mkt-subnav) + แผงสลับ (mkt-panel) x3" —
  // ดูคอมเมนต์รอบ 7 หัวไฟล์นี้ว่าทำไมแถบเมนูย่อยนี้ "ไม่ใช่" แถบข้างหลักของแดชบอร์ด
  const bodyHtml = `${mktI18nScript()}<div class="mkt-page">
  <div class="mkt-shell">

    <nav class="mkt-subnav">
      <div class="mkt-subnav-label">Marketplace</div>
      <button type="button" class="mkt-subnav-item is-active" id="mkt-subnav-overview" onclick="mktShowPanel('overview')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/><rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/><rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/><rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/></svg>
        <span data-i18n="navOverview">Overview</span>
      </button>
      <button type="button" class="mkt-subnav-item" id="mkt-subnav-listings" onclick="mktShowPanel('listings')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.17L4 3a1 1 0 0 0-1 1l.17 5.59a2 2 0 0 0 .66 1.41l9.58 9.58a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.82Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor"/></svg>
        <span data-i18n="navMyListings">My Listings</span>
      </button>
      <a href="/dashboard/${encodeURIComponent(guild.id)}" class="mkt-subnav-back">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span data-i18n="backToDashboard">Back to Dashboard</span>
      </a>
    </nav>

    <div class="mkt-content">
      <div class="mkt-top-bar">
        <div class="mkt-eyebrow" data-i18n="eyebrow">Seller dashboard</div>
        <div class="mkt-tab-row mkt-lang-switch" role="tablist" aria-label="Dashboard language">
          <button type="button" class="mkt-text-tab" role="tab" id="mkt-lang-en" aria-selected="true" onclick="mktApplyLang('en')">EN</button>
          <button type="button" class="mkt-text-tab" role="tab" id="mkt-lang-th" aria-selected="false" onclick="mktApplyLang('th')">TH</button>
        </div>
      </div>

      ${bannerHtml({ saved, error })}

      <!-- ═══ แผง Overview — สถิติ + ตั้งค่าช่องทางรับเงิน ═══ -->
      <div class="mkt-panel" id="mkt-panel-overview">
        <h1 class="mkt-h1" data-i18n="navOverview">Overview</h1>
        <p class="mkt-panel-subtitle" data-i18n="overviewSubtitle">Track how your shop is doing and manage how buyers pay you.</p>

        <div class="mkt-stat-grid" style="margin-top:24px;">
          <div class="mkt-stat-card">
            <div class="mkt-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 13h4l3-8 4 16 3-8h2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div>
              <div class="mkt-stat-value" id="mkt-stat-listings" data-target="${activeCount}">0</div>
              <div class="mkt-stat-label" data-i18n="statListingsLabel">active listings</div>
            </div>
          </div>
          <div class="mkt-stat-card">
            <div class="mkt-stat-icon" style="background:rgba(245,185,66,0.14);color:var(--mkt-gold);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div>
              <div class="mkt-stat-value" id="mkt-stat-sales" data-target="${completedSalesCount}">0</div>
              <div class="mkt-stat-label" data-i18n="statSalesLabel">sales completed</div>
            </div>
          </div>
        </div>

        ${disclosureHtml()}
        ${paymentMethodSectionHtml(seller, user, guild.id)}
      </div>

      <!-- ═══ แผง My Listings — กริดการ์ด + ปุ่ม New Listing ═══ -->
      <div class="mkt-panel" id="mkt-panel-listings" hidden>
        ${myListingsSectionHtml(listings, categories, guild.id)}
      </div>

      <!-- ═══ แผง Create Listing — ฟอร์มลงขายเดิมทั้งหมด (50/50 พรีวิว/ฟอร์ม) ═══ -->
      <div class="mkt-panel" id="mkt-panel-create" hidden>
        <div class="mkt-wizard-head">
          <button type="button" class="mkt-back-btn" onclick="mktShowPanel('listings')" aria-label="Back to My Listings">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div>
            <div class="mkt-card-eyebrow" data-i18n="createListingEyebrow">My Listings</div>
            <h1 class="mkt-h1" style="margin-top:2px;font-size:21px;" data-i18n="createListingHeading">Create New Listing</h1>
          </div>
        </div>
        ${sellWizardHtml(categories, canSell, guild.id, user.username)}
      </div>

    </div>
  </div>
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

      // 🆕 รอบ 7: สลับ 3 แผง (Overview / My Listings / Create Listing) ล้วนด้วย JS ฝั่ง client
      // ไม่โหลดหน้าใหม่ ไม่มี route ใหม่ ไม่กระทบ backend เลย — ปุ่ม "+ New Listing" และปุ่ม
      // ย้อนกลับในแผง Create Listing เรียกฟังก์ชันนี้ตรงๆ (ดู myListingsSectionHtml /
      // renderMarketplaceDashboardPage ด้านบน)
      window.mktShowPanel = function (name) {
        var panels = {
          overview: document.getElementById('mkt-panel-overview'),
          listings: document.getElementById('mkt-panel-listings'),
          create: document.getElementById('mkt-panel-create'),
        };
        Object.keys(panels).forEach(function (key) {
          if (panels[key]) panels[key].hidden = key !== name;
        });
        var navOverview = document.getElementById('mkt-subnav-overview');
        var navListings = document.getElementById('mkt-subnav-listings');
        if (navOverview) navOverview.classList.toggle('is-active', name === 'overview');
        if (navListings) navListings.classList.toggle('is-active', name === 'listings');
        window.scrollTo(0, 0);
      };
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
