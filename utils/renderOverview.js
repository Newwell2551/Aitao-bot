// utils/renderOverview.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "Overview" (ภาพรวม) — หน้าแรกที่เห็นหลังกดเข้าไปจัดการเซิร์ฟใดเซิร์ฟหนึ่งจากหน้า
// Server Picker
//
// 🆕 [24 ต.ค. 2569 — ตัดแดชบอร์ด] ปรับใหม่ทั้งหมดครับ เดิมหน้านี้เป็น "Mission Dashboard"
// มีการ์ด carousel 6 สไลด์ + เช็กลิสต์ที่กดแล้วพาไปหน้าเว็บของ Welcome Card / Goodbye Card /
// Fonts / Role Setup / Message Builder — ตอนนี้น้องหนาวให้ตัดหน้าเว็บทั้ง 5 หน้านั้นออก (ยังใช้
// งานได้ปกติผ่านคำสั่งสแลชในดิสคอร์ด แค่ไม่มีหน้าเว็บคู่ขนานแล้ว) เลยต้องเปลี่ยนหน้า Overview
// จาก "กดแล้วไปตั้งค่าได้" เป็น "ดูสถานะอย่างเดียว" (read-only) แทน เหตุผลที่ไม่ลบทิ้งไปเฉยๆ:
// ผู้ใช้ยังอยากรู้ภาพรวมว่าเซิร์ฟตัวเองตั้งค่าอะไรไปแล้วบ้าง แค่ไม่มีปุ่มกดไปแก้ในเว็บอีกต่อไป
// (ต้องไปพิมพ์คำสั่งสแลชในดิสคอร์ดเอง) — แต่ละแถวเลยโชว์ "สถานะจริง" (คำนวณจากข้อมูลจริงของ
// เซิร์ฟเหมือนเดิมทุกอย่าง ไม่มีจุดไหน hardcode) คู่กับชื่อคำสั่งสแลชที่ใช้ตั้งค่าได้
//
// ส่วนที่ "ไม่ได้ถูกตัด" และยังอยู่เหมือนเดิม:
//   - ป้ายสถานะ Free/Premium มุมขวาบน (อ่านอย่างเดียว ข้อมูลจริงจาก Stripe webhook)
//   - ลิงก์ไปหน้า Marketplace (/dashboard/:guildId/marketplace) — ยังเป็นหน้าเว็บจริงอยู่
//   - ลิงก์ไปหน้า Feed สาธารณะ (/feed) — หน้าโชว์ของจากทุกร้านใน Marketplace
//   - ลิงก์ไปหน้าอัปเกรด Premium (/premium/:guildId) ถ้าเซิร์ฟยังไม่ใช่ Premium
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');
const { renderDashboardLayout } = require('./dashboardShell');

// ── ไอคอนถูก (checkmark) สีขาว — ใช้ในแถวสถานะข้อที่ "ตั้งค่าแล้ว" ──────────────
const CHECK_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROWN_ICON = (color) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8l3 3 5-7 5 7 3-3-2 10H6L4 8z" fill="${color}"/></svg>`;
const ARROW_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * แถวสถานะ 1 ข้อ — 🆕 [24 ต.ค. 2569] เปลี่ยนจากลิงก์กดได้ (<a href>) เป็น <div> อ่านอย่าง
 * เดียวแล้ว เพราะไม่มีหน้าเว็บให้กดไปแก้อีกต่อไป (ดูเหตุผลหัวไฟล์) — ฝั่งขวาของแถวโชว์ชื่อ
 * คำสั่งสแลชที่ใช้ตั้งค่าได้แทนที่ลิงก์ ให้ผู้ใช้รู้ว่าต้องไปพิมพ์คำสั่งอะไรในดิสคอร์ด
 * @param {{label:string, done:boolean, command:string}} item
 */
function statusRowHtml(item) {
  const boxHtml = item.done
    ? `<span style="width:17px;height:17px;border-radius:999px;background:var(--accent);flex:0 0 auto;display:flex;align-items:center;justify-content:center;opacity:0.85;">${CHECK_ICON}</span>`
    : `<span class="neon-pending-dot" style="width:17px;height:17px;border-radius:999px;border:1.5px solid var(--border);flex:0 0 auto;"></span>`;
  const labelStyle = item.done
    ? 'font-size:13.5px;font-weight:500;color:#6d7597;flex:1 1 auto;'
    : 'font-size:13.5px;font-weight:600;color:var(--text);flex:1 1 auto;';
  const statusTag = item.done
    ? `<span style="font-size:10.5px;font-weight:700;color:var(--accent);background:rgba(124,131,253,0.12);border-radius:999px;padding:3px 9px;flex:0 0 auto;">Configured</span>`
    : `<span style="font-size:10.5px;font-weight:700;color:var(--text-muted);background:rgba(154,162,196,0.12);border-radius:999px;padding:3px 9px;flex:0 0 auto;">Not set up</span>`;
  return `<div class="glass-card layer-row" style="display:flex;align-items:center;gap:10px;padding:10px 12px;">
    ${boxHtml}
    <span style="${labelStyle}">${escapeHtml(item.label)}</span>
    ${statusTag}
    <code style="font-size:11.5px;font-weight:600;color:var(--text-muted);background:rgba(154,162,196,0.1);border-radius:6px;padding:3px 8px;flex:0 0 auto;white-space:nowrap;">${escapeHtml(item.command)}</code>
  </div>`;
}

/**
 * สร้างหน้า Overview ทั้งหน้า
 * @param {object} opts
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {'free'|'premium'} opts.tier
 * @param {Array<{key:string,label:string,done:boolean,command:string}>} opts.statusItems
 * @param {string} opts.marketplaceHref  ลิงก์ไปหน้า Marketplace ของเซิร์ฟนี้
 * @param {string} opts.premiumHref      ลิงก์ไปหน้าอัปเกรด Premium ของเซิร์ฟนี้
 */
function renderOverviewPage({ guild, user, botAvatarUrl, botName, tier, statusItems, marketplaceHref, premiumHref }) {
  const doneCount = statusItems.filter((i) => i.done).length;
  const total = statusItems.length;

  const statusHtml = statusItems.map(statusRowHtml).join('');

  const tierPillHtml = tier === 'premium'
    ? `<div title="Managed automatically by your subscription — upgrade or manage billing from the Premium page" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(244,184,96,0.15);border:1px solid rgba(244,184,96,0.4);font-size:12.5px;font-weight:700;color:var(--gold);">${CROWN_ICON('#f4b860')} Premium</div>`
    : `<div title="Managed automatically by your subscription — upgrade from the Premium page" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(154,162,196,0.12);border:1px solid var(--border);font-size:12.5px;font-weight:700;color:var(--text-muted);">Free</div>`;

  // 🆕 [24 ต.ค. 2569] กล่องลิงก์ด่วน — Marketplace ยังเป็นหน้าเว็บจริง (ไม่ได้ถูกตัด) เลย
  // ยังให้กดไปได้ตรงๆ, Feed เป็นหน้าสาธารณะ (ไม่ต้องล็อกอิน) เปิดแท็บใหม่ให้, ส่วน Premium
  // โชว์แค่ตอนเซิร์ฟยังไม่ได้อัปเกรด (เซิร์ฟที่เป็น Premium แล้วไม่ต้องเห็นปุ่มชวนซ้ำ)
  const quickLinksHtml = `
    <a href="${escapeHtml(marketplaceHref)}" class="glass-card layer-row" style="display:flex;align-items:center;gap:10px;padding:14px 16px;text-decoration:none;flex:1 1 220px;">
      <span style="font-size:13.5px;font-weight:600;color:var(--text);flex:1 1 auto;">Marketplace — buy &amp; sell decorations for this server</span>
      <span style="color:var(--accent);flex:0 0 auto;">${ARROW_ICON}</span>
    </a>
    <a href="/feed" target="_blank" rel="noopener" class="glass-card layer-row" style="display:flex;align-items:center;gap:10px;padding:14px 16px;text-decoration:none;flex:1 1 220px;">
      <span style="font-size:13.5px;font-weight:600;color:var(--text);flex:1 1 auto;">Feed — browse what sellers are posting</span>
      <span style="color:var(--accent);flex:0 0 auto;">${ARROW_ICON}</span>
    </a>
    ${tier !== 'premium' ? `
    <a href="${escapeHtml(premiumHref)}" class="glass-card layer-row" style="display:flex;align-items:center;gap:10px;padding:14px 16px;text-decoration:none;flex:1 1 220px;">
      <span style="font-size:13.5px;font-weight:600;color:var(--gold);flex:1 1 auto;">${CROWN_ICON('#f4b860')} Upgrade to Premium</span>
      <span style="color:var(--gold);flex:0 0 auto;">${ARROW_ICON}</span>
    </a>` : ''}
  `;

  const bodyHtml = `
    <div style="padding:44px 56px;overflow:hidden;position:relative;">
      <!-- ภาพน้อง Milo จางๆ มุมขวาล่าง — ของจริงจาก public/images/ ไม่ใช่ mock -->
      <img src="/images/milo-hero.webp" alt="" style="position:absolute;right:-20px;bottom:-40px;width:560px;height:560px;object-fit:cover;object-position:80% 8%;opacity:0.3;filter:blur(3px) saturate(85%);-webkit-mask-image:radial-gradient(ellipse 300px 340px at 74% 55%, black 40%, transparent 85%);mask-image:radial-gradient(ellipse 300px 340px at 74% 55%, black 40%, transparent 85%);pointer-events:none;z-index:0;" />

      <div style="position:relative;z-index:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--text);">Overview</div>
            <div style="font-size:13.5px;color:var(--text-muted);margin-top:4px;">${escapeHtml(guild.name)} · Manage this server's bot settings</div>
          </div>
          ${tierPillHtml}
        </div>

        <!-- กรอบลิงก์ด่วน — Marketplace / Feed / Premium -->
        <div style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px;">
          ${quickLinksHtml}
        </div>

        <!-- กรอบสถานะการตั้งค่า — 🆕 [24 ต.ค. 2569] อ่านอย่างเดียวแล้ว ไม่มีปุ่มกดไปแก้ในเว็บ
             อีกต่อไป (ของทั้ง 5 อย่างนี้ตั้งค่าผ่านคำสั่งสแลชในดิสคอร์ดเท่านั้น) -->
        <div id="statusPanel" class="glass-card" style="margin-top:20px;border-radius:16px;overflow:hidden;box-shadow:0 18px 44px rgba(0,0,0,0.38);">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="font-size:15px;font-weight:600;color:var(--text);">Setup status</div>
              <div style="font-size:12px;font-weight:700;color:var(--gold);background:rgba(244,184,96,0.13);border-radius:999px;padding:3px 10px;">${doneCount}/${total} configured</div>
            </div>
          </div>
          <div style="height:1px;background:var(--glass-border);"></div>
          <div style="display:flex;flex-direction:column;gap:10px;padding:20px 24px;">
            ${statusHtml}
          </div>
          <div style="padding:0 24px 20px;font-size:12px;color:var(--text-muted);">
            Each of these is configured from a Discord slash command, not from this website — run the command shown above in your server to set it up or change it.
          </div>
        </div>
      </div>
    </div>`;

  return renderDashboardLayout({
    title: `Overview — ${guild.name} — Aitao Bot`,
    guild,
    user,
    activeKey: 'overview',
    botAvatarUrl,
    botName,
    bodyHtml,
  });
}

module.exports = { renderOverviewPage };
