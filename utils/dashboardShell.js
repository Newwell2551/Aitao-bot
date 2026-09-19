// utils/dashboardShell.js
// ─────────────────────────────────────────────────────────────────────────
// "เปลือกกลาง" ของทุกหน้าแดชบอร์ดที่ผูกกับเซิร์ฟใดเซิร์ฟหนึ่ง (Overview, การ์ดต้อนรับ,
// การ์ดบอกลา, ฟอนต์, ระบบยศ, Builder, พรีเมียม, ภาษา ฯลฯ) — คือแถบข้าง (sidebar) 240px
// ทางซ้าย + กรอบหน้า HTML รอบนอก (สี, ฟอนต์, <head>) เอาไว้ใช้ร่วมกันทุกหน้า จะได้ไม่ต้อง
// ก๊อปโค้ดแถบข้างซ้ำๆ ทีละหน้า (แก้ตรงนี้ที่เดียว ทุกหน้าอัปเดตตามกันหมด)
//
// อ้างอิงจาก mockup /home/claude/scratch/design-mockup/Main.dc.html (แถบข้างของหน้า
// "การ์ดต้อนรับ" ในแคนวาส — ใช้แถบข้างเดียวกันทุกหน้า) โดยมีจุดที่ "ไม่ได้ทำตาม mockup
// เป๊ะๆ" (ตัดสินใจเองพร้อมเหตุผล บอกไว้ตรงๆ):
//
//   - สีไอคอน/ตัวหนังสือตอน active ใน mockup ใช้ #4a5aa8 — เปลี่ยนเป็น #7c83fd (var(--accent))
//     ให้ตรงกับโทนสีจริงของเว็บที่ deploy อยู่ตอนนี้ (public/index.html) เพราะหน้า Server
//     Picker ที่สร้างไปก่อนหน้านี้ก็ยึดตามกฎนี้เหมือนกัน (ดูคอมเมนต์หัวไฟล์ renderServerPicker.js)
//     ต้องการให้ทั้งแดชบอร์ดใช้สีแบรนด์ชุดเดียวกันสอดคล้องกัน ไม่ใช่คนละเฉดในแต่ละหน้า
//   - รายการ Marketplace/ฟีดชุมชนใน mockup (อยู่ใต้เส้นคั่นท้ายลิสต์) — ตัดออกทั้งคู่ตามที่
//     คุยกันไว้แล้วว่ายังไม่อยู่ในสโคปตอนนี้ (claude/roadmap-marketplace-idea.md)
//   - แถบสลับเซิร์ฟ (guild switcher) ใน mockup ดูเหมือนจะเป็นเมนู dropdown ที่สลับเซิร์ฟได้
//     ในหน้าเดียว — เวอร์ชันจริงตอนนี้ทำให้เป็นแค่ "ลิงก์กลับไปหน้า Server Picker" (กดแล้ว
//     พาไปเลือกเซิร์ฟใหม่ที่หน้า /dashboard) ยังไม่ทำ dropdown สลับในหน้าเดียวกัน — ถ้าน้อง
//     หนาวอยากได้ dropdown จริงๆ บอกได้ครับ ค่อยกลับมาทำเพิ่ม
//   - รายการเมนูใน mockup เป็น <div onclick> ล้วนๆ (เพราะมันเป็นมอคอัพหน้าเดียวจบ ไม่มีหน้า
//     จริงให้ไปจริง) — เวอร์ชันนี้เปลี่ยนเป็น <a href> จริง ที่พาไปแต่ละหน้าจริงๆ
//   - ตัวหนังสือในแถบข้างเป็นภาษาอังกฤษล้วน ตามที่น้องหนาวขอให้ทุกหน้าของแดชบอร์ดเป็น
//     อังกฤษ default (คอมเมนต์ในโค้ดไฟล์นี้ยังเป็นภาษาไทยตามปกติของโปรเจกต์)
// ─────────────────────────────────────────────────────────────────────────

// ใช้ escapeHtml/defaultAvatarUrl/serverIconHtml ตัวเดียวกับหน้า Server Picker เป๊ะๆ
// (กัน XSS แบบเดียวกัน + ไอคอนเซิร์ฟหน้าตาเหมือนกันทุกหน้า สีโมโนแกรมเซิร์ฟเดิมคงที่)
const { escapeHtml, defaultAvatarUrl, serverIconHtml } = require('./renderServerPicker');

// ── รายการเมนู 8 อัน (ไม่รวม Marketplace/ฟีดชุมชน — อยู่นอกสโคป) ──────────────────
// hrefSuffix ต่อท้าย "/dashboard/:guildId" เสมอ (ช่องว่าง = หน้า Overview เอง)
// ไอคอน SVG ก๊อปมาจาก Main.dc.html/Overview.dc.html เป๊ะๆ แค่เปลี่ยน stroke/fill เป็นตัวแปรสี
const NAV_ITEMS = [
  {
    key: 'overview',
    label: 'Overview',
    hrefSuffix: '',
    renderIcon: (c) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="${c}" stroke-width="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="${c}" stroke-width="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="${c}" stroke-width="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.5" stroke="${c}" stroke-width="1.8"/></svg>`,
  },
  {
    key: 'welcome',
    label: 'Welcome Card',
    hrefSuffix: '/welcome',
    renderIcon: (c) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="${c}" stroke-width="1.7"/><circle cx="9" cy="10" r="1.6" stroke="${c}" stroke-width="1.5"/><path d="M4 16l5-4 4 3 3-2.5 4 3.5" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    key: 'goodbye',
    label: 'Goodbye Card',
    hrefSuffix: '/goodbye',
    renderIcon: (c) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4h7a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H9" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/><path d="M4 12h9" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/><path d="M10 8l4 4-4 4" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    key: 'fonts',
    label: 'Fonts',
    hrefSuffix: '/fonts',
    renderIcon: (c) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="3" stroke="${c}" stroke-width="1.7"/><text x="7.2" y="16.5" font-size="10" font-weight="700" fill="${c}" font-family="-apple-system, sans-serif">Aa</text></svg>`,
  },
  {
    key: 'roles',
    label: 'Role Setup',
    hrefSuffix: '/roles',
    renderIcon: (c) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="${c}" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    key: 'builder',
    label: 'Message Builder',
    hrefSuffix: '/builder',
    renderIcon: (c) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="9" height="6" rx="1.5" stroke="${c}" stroke-width="1.7"/><rect x="4" y="14" width="6" height="6" rx="1.5" stroke="${c}" stroke-width="1.7"/><rect x="13" y="12" width="7" height="8" rx="1.5" stroke="${c}" stroke-width="1.7"/></svg>`,
  },
  // 🆕 [19 ก.ย. 2569 ดึกมาก] เอาเมนู "Premium" ออกจาก sidebar แล้ว — น้องหนาวไม่อยากให้
  // หน้าจ่ายเงินอยู่ในแดชบอร์ด (รู้สึกซ้ำกับหน้า Pricing สาธารณะ) จุดเริ่มซื้อพรีเมียมย้ายไป
  // อยู่ที่ปุ่ม "Subscribe to Premium" ในหน้า public/pricing.html แทน (ดู GET /premium/start
  // ใน server.js) หน้าเลือกวิธีจ่ายเงินจริง (/premium/:guildId) เลยไม่ผูกกับ sidebar/
  // renderDashboardLayout() อีกต่อไป — ดู utils/renderPremiumBilling.js (เขียนหน้าเป็น
  // standalone ธีมเดียวกับเว็บสาธารณะแทน)
  {
    key: 'language',
    label: 'Language',
    hrefSuffix: '/language',
    renderIcon: (c) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8" stroke="${c}" stroke-width="1.7"/><ellipse cx="12" cy="12" rx="3.4" ry="8" stroke="${c}" stroke-width="1.7"/><path d="M4 12h16" stroke="${c}" stroke-width="1.7"/></svg>`,
  },
];

/**
 * แถวเมนู 1 อัน — ไฮไลต์ (สีเข้ม + พื้นหลังจาง) ถ้าเป็นหน้าที่กำลังเปิดอยู่ตอนนี้ (activeKey ตรงกัน)
 * @param {object} item อันหนึ่งจาก NAV_ITEMS
 * @param {{guildId: string, activeKey: string}} ctx
 */
function renderNavItem(item, { guildId, activeKey }) {
  const isActive = item.key === activeKey;
  const iconColor = item.alwaysGold ? '#f4b860' : isActive ? '#7c83fd' : '#9aa2c4';
  const labelColor = item.alwaysGold ? '#f4b860' : isActive ? '#f3f1fb' : '#9aa2c4';
  const bg = isActive ? 'rgba(124,131,253,0.14)' : 'transparent';
  const href = `/dashboard/${encodeURIComponent(guildId)}${item.hrefSuffix}`;
  return `<a href="${href}" class="nav-item" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:3px;background:${bg};text-decoration:none;">
    ${item.renderIcon(iconColor)}
    <span style="font-size:13.5px;font-weight:${isActive || item.alwaysGold ? 600 : 500};color:${labelColor};">${escapeHtml(item.label)}</span>
  </a>`;
}

/**
 * แถบ "ชื่อ+ไอคอน Aitao Bot" บนสุดของ sidebar — botAvatarUrl มาจาก client.user.displayAvatarURL()
 * จริง (รูปโปรไฟล์จริงของบอทใน Discord ตอนนี้ ไม่ใช่รูปมาสคอตวาดในมอคอัพ)
 */
function renderBrandRow(botAvatarUrl, botName) {
  return `<div style="display:flex;align-items:center;gap:9px;padding:0 8px;">
    <img src="${escapeHtml(botAvatarUrl)}" alt="${escapeHtml(botName)}" style="width:28px;height:28px;border-radius:999px;object-fit:cover;" />
    <span style="font-size:15px;font-weight:700;color:var(--text);">${escapeHtml(botName)}</span>
  </div>`;
}

/**
 * แถบ "เซิร์ฟที่กำลังจัดการอยู่" — กดแล้วพากลับไปหน้า Server Picker เพื่อเลือกเซิร์ฟอื่น
 * (ดูคอมเมนต์หัวไฟล์ — ยังไม่ทำ dropdown สลับในหน้าเดียว)
 * @param {{id: string, name: string, iconUrl: string|null}} guild
 */
function renderGuildSwitcher(guild) {
  // hasBot: true เสมอตรงนี้ได้ เพราะกว่าจะเห็นหน้านี้ต้องผ่าน requireGuildAccess มาแล้ว
  // (เช็คแล้วว่าบอทอยู่เซิร์ฟนี้จริง) — ยืมไอคอนเดียวกับ Server Picker ใช้ตรงๆ ไม่ต้องเขียนใหม่
  const iconHtml = serverIconHtml({ id: guild.id, name: guild.name, iconUrl: guild.iconUrl, hasBot: true }, 28);
  return `<a href="/dashboard" style="margin-top:20px;display:flex;align-items:center;gap:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;padding:10px 12px;text-decoration:none;">
    ${iconHtml}
    <div style="min-width:0;flex:1 1 auto;">
      <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(guild.name)}</div>
    </div>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 9l5 5 5-5" stroke="#9aa2c4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>`;
}

/** แถบล่างสุด — avatar+ชื่อผู้ใช้ที่ login อยู่ + ลิงก์ออกจากระบบจริง (/auth/logout) */
function renderUserChip(user) {
  const avatarUrl = user.avatar || defaultAvatarUrl(user.id);
  return `<div style="display:flex;align-items:center;gap:9px;padding:10px 8px;border-top:1px solid var(--border);">
    <img src="${escapeHtml(avatarUrl)}" alt="" style="width:24px;height:24px;border-radius:999px;object-fit:cover;flex:0 0 auto;" />
    <span style="font-size:12.5px;color:var(--text-muted);flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(user.username)}</span>
    <a href="/auth/logout" style="font-size:12px;color:var(--text-muted);flex:0 0 auto;">Log out</a>
  </div>`;
}

/**
 * ประกอบทั้งแถบข้าง 240px — เรียกจาก renderDashboardLayout() ด้านล่างเท่านั้น
 */
function renderSidebar({ guild, user, activeKey, botAvatarUrl, botName }) {
  const navHtml = NAV_ITEMS.map((item) => renderNavItem(item, { guildId: guild.id, activeKey })).join('');
  // 🆕 position:sticky + height:100vh + overflow-y:auto — หน้ายาวๆ อย่างตัวแก้ไขการ์ดต้อนรับ
  // (ฟอร์มยาวเลื่อนได้) แถบข้างจะได้ไม่เลื่อนหายไปด้วย ยังกดเมนู/ออกจากระบบได้ตลอดเวลา
  // (ก่อนหน้านี้หน้า Overview สั้นพอไม่เคยเจอปัญหานี้ เลยเพิ่งมาแก้ตอนสร้างหน้ายาวหน้าแรก)
  return `<div style="width:240px;flex:0 0 auto;border-right:1px solid var(--border);display:flex;flex-direction:column;padding:24px 16px;position:sticky;top:0;height:100vh;overflow-y:auto;">
    ${renderBrandRow(botAvatarUrl, botName)}
    ${renderGuildSwitcher(guild)}
    <div style="margin-top:20px;display:flex;flex-direction:column;gap:2px;">
      ${navHtml}
    </div>
    <div style="flex:1 1 auto;"></div>
    ${renderUserChip(user)}
  </div>`;
}

/**
 * เปลือกกรอบ HTML เต็มหน้าของทุกหน้าแดชบอร์ดที่ผูกกับเซิร์ฟ — sidebar ทางซ้าย + พื้นที่
 * เนื้อหา (bodyHtml) ทางขวา ตัวแปรสี :root ชุดเดียวกับ renderServerPicker.js เป๊ะๆ (ก๊อปมา
 * จาก public/index.html เว็บจริงที่ deploy อยู่) ให้ทั้งแดชบอร์ดใช้โทนสีเดียวกันตลอด
 *
 * @param {object} opts
 * @param {string} opts.title           ข้อความ <title> ของแท็บเบราว์เซอร์
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.activeKey       key ของเมนูที่ไฮไลต์อยู่ (ตรงกับ NAV_ITEMS[].key)
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {string} opts.bodyHtml        เนื้อหาฝั่งขวาทั้งหมด (แต่ละหน้าประกอบเอง)
 * @param {string} [opts.extraStyle]    CSS เพิ่มเติมเฉพาะหน้านั้นๆ (ใส่ต่อท้าย <style> กลาง)
 */
function renderDashboardLayout({ title, guild, user, activeKey, botAvatarUrl, botName, bodyHtml, extraStyle }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  /* ── ตัวแปรสี ── ก๊อปมาจาก public/index.html เป๊ะๆ เหมือนกับ renderServerPicker.js */
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
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Sarabun', sans-serif; background: var(--bg); color: var(--text); }
  a { text-decoration: none; }
  .nav-item:hover { background: rgba(124,131,253,0.08) !important; }
  ${extraStyle || ''}
</style>
</head>
<body>
  <div style="min-height:100vh;display:flex;">
    ${renderSidebar({ guild, user, activeKey, botAvatarUrl, botName })}
    <div style="flex:1 1 auto;min-width:0;">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
}

/**
 * หน้า "เร็วๆ นี้" ชั่วคราว — ใช้กับ 6 หน้าที่ยังไม่ได้สร้างจริง (การ์ดต้อนรับ/บอกลา/ฟอนต์/
 * ระบบยศ/Builder/ภาษา — ส่วนพรีเมียมมีหน้าแยกเป็นของตัวเองแล้ว) กันไม่ให้กดจากเมนู/เช็กลิสต์
 * ของหน้า Overview แล้วเจอ 404 เฉยๆ ระหว่างที่ยังทยอยสร้างทีละหน้าตามแผน (task #16-20, #22)
 * — แต่ละหน้าจะถูกแทนที่ด้วยของจริงทีละหน้าเรื่อยๆ ต่อจากนี้
 */
function renderComingSoonPage({ pageLabel, activeKey, guild, user, botAvatarUrl, botName }) {
  const bodyHtml = `<div style="padding:44px 56px;">
    <div style="font-size:24px;font-weight:700;color:var(--text);">${escapeHtml(pageLabel)}</div>
    <div style="font-size:13.5px;color:var(--text-muted);margin-top:10px;max-width:480px;line-height:1.7;">
      This page is being built next — check back soon! In the meantime you can keep exploring
      the rest of the dashboard.
    </div>
    <a href="/dashboard/${encodeURIComponent(guild.id)}" style="display:inline-flex;align-items:center;gap:6px;margin-top:22px;font-size:13px;font-weight:600;color:var(--accent);">&larr; Back to Overview</a>
  </div>`;
  return renderDashboardLayout({
    title: `${pageLabel} — ${guild.name} — Aitao Bot`,
    guild,
    user,
    activeKey,
    botAvatarUrl,
    botName,
    bodyHtml,
  });
}

module.exports = {
  NAV_ITEMS,
  renderSidebar,
  renderDashboardLayout,
  renderComingSoonPage,
};
