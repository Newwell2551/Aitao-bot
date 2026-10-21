// utils/renderFonts.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "Fonts" — แกลเลอรี่ฟอนต์ของเซิร์ฟนี้บนเว็บ คู่ขนานกับคำสั่ง /fonts ใน Discord
// (commands/fonts.js) อัปโหลด/ลบฟอนต์จริงได้จากหน้านี้เลย ไม่ต้องกลับไปที่ Discord
//
// 🆕 [21 ต.ค. 2569] หน้านี้สร้างใหม่ทั้งหน้า (ของเดิมเป็นแค่หน้า "เร็วๆ นี้" ชั่วคราว) —
// ดีไซน์แบบ "แกลเลอรี่สินค้า" (asset grid) ตามสเปคที่ขอ (อ้างอิงลุค Roblox item catalog)
// แต่ละการ์ดโชว์ตัวอย่างตัวอักษรจริง "Aa" ด้วยฟอนต์จริงเป๊ะๆ ไม่ใช่แค่ชื่อเฉยๆ:
//   - ฟอนต์มาตรฐาน 5 ตัวของบอท (Default/Kanit/Sarabun/Charmonman/Chonburi) — โหลดจาก Google
//     Fonts จริงผ่าน <link> ใน extraHead (ฟอนต์พวกนี้ก่อนหน้านี้มีแค่ชื่ออยู่ใน font-family
//     stack ของ CSS เฉยๆ ไม่เคยมีการโหลดฟอนต์จริงมาแสดงในเบราว์เซอร์มาก่อนเลย — ต้องเพิ่ม
//     <link> เข้ามาใหม่ ไม่งั้นตัวอย่างจะเพี้ยนเป็น fallback sans-serif ธรรมดา)
//   - ฟอนต์ที่เซิร์ฟนี้อัปโหลดเอง — เสิร์ฟไฟล์ฟอนต์จริงกลับไปให้เบราว์เซอร์ผ่าน route ใหม่
//     GET /dashboard/:guildId/fonts/:fontId/file แล้วประกาศ @font-face ด้วย family name
//     เดียวกับที่ @napi-rs/canvas ใช้ฝั่งเซิร์ฟเวอร์เป๊ะๆ (ตัวอย่างในเบราว์เซอร์ = ฟอนต์ตัวจริง
//     ที่จะไปโผล่บนการ์ดต้อนรับ/บอกลา ไม่ใช่ของมโนขึ้นมาประมาณหน้าตา)
//
// 🚫 [เรื่องสำคัญที่ตัดสินใจเองพร้อมเหตุผล — ไม่ได้ทำตามสเปคทุกจุด] สเปคที่ขอมาระบุให้มี
// "glowing 🌟 Premium tags for subscription-locked options" แต่เช็คโค้ดจริงของ fontStorage.js
// และ commands/fonts.js แล้ว **ฟอนต์ไม่มีการล็อกตามระดับ Free/Premium เลยสักจุด** — ทุกเซิร์ฟ
// อัปโหลดฟอนต์ของตัวเองได้เหมือนกันหมด จำกัดแค่ MAX_FONTS_PER_GUILD (20 ไฟล์ ไม่ใช่ตามเทียร์
// แต่เพราะข้อจำกัดของ Discord select menu) ผมเลยไม่ใส่ป้าย "Premium" ปลอมๆ ลงไปล็อกฟอนต์ที่จริงๆ
// ใช้ได้ฟรีอยู่แล้ว (จะทำให้ผู้ใช้สับสน/รู้สึกว่าอัปเกรดแล้วปลดล็อกอะไรไม่ได้จริง) ใช้ป้าย
// "Built-in" (ทอง) กับ "Custom" (ม่วง) แทนเพื่อบอกสถานะที่เป็นจริง และโชว์ตัวนับโควตา
// "X / 20 slots used" แทนที่ตรงกับของจริง — ถ้าน้องหนาวอยากให้ฟอนต์ farther จำกัดจริงจังตาม
// เทียร์ (เช่น ฟรี 5 / พรีเมียม 20) บอกได้เลยครับ อันนี้เป็นการตัดสินใจเรื่องโมเดลธุรกิจ
// ไม่ใช่เรื่องดีไซน์ ผมไม่กล้าเปลี่ยนเองโดยไม่ถามก่อน
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');
const { renderDashboardLayout } = require('./dashboardShell');

const BASE_FONT_SPECIMENS = [
  { value: 'default', label: 'Default (Mali / Fredoka)', cssFamily: "'Mali', sans-serif", googleFamily: 'Mali:wght@400;700' },
  { value: 'kanit', label: 'Kanit', cssFamily: "'Kanit', sans-serif", googleFamily: 'Kanit:wght@400;700' },
  { value: 'sarabun', label: 'Sarabun', cssFamily: "'Sarabun', sans-serif", googleFamily: 'Sarabun:wght@400;700' },
  { value: 'charmonman', label: 'Charmonman', cssFamily: "'Charmonman', cursive", googleFamily: 'Charmonman:wght@400;700' },
  { value: 'chonburi', label: 'Chonburi', cssFamily: "'Chonburi', serif", googleFamily: 'Chonburi' },
];

const TRASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a1.5 1.5 0 0 1-1.5 1.4H9.3a1.5 1.5 0 0 1-1.5-1.4L7 7h10z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const UPLOAD_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 16V4m0 0 5 5m-5-5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** การ์ดเดียวในแกลเลอรี่ — ใช้ทั้งฟอนต์มาตรฐานและฟอนต์อัปโหลดเอง (ต่างกันแค่ badge + ปุ่มลบ) */
function fontCardHtml({ specimenFamily, label, badgeHtml, footerHtml, deleteButtonHtml }) {
  return `<div class="glass-card" style="padding:18px;display:flex;flex-direction:column;gap:12px;position:relative;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
      ${badgeHtml}
      ${deleteButtonHtml || ''}
    </div>
    <div style="height:72px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.18);border-radius:8px;overflow:hidden;">
      <span style="font-family:${specimenFamily};font-size:34px;color:var(--text);line-height:1;">Aa Bb</span>
    </div>
    <div>
      <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</div>
      ${footerHtml || ''}
    </div>
  </div>`;
}

/**
 * @param {object} opts
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {Array<{id:string,family:string,originalName:string,uploadedAt:string}>} opts.customFonts
 * @param {number} opts.maxFonts
 * @param {{uploaded?:boolean, deleted?:boolean, error?:string}} [opts.notice]
 */
function renderFontsPage({ guild, user, botAvatarUrl, botName, customFonts, maxFonts, notice }) {
  const googleFamilies = BASE_FONT_SPECIMENS.map((f) => f.googleFamily).join('&family=');
  // 🆕 โหลด Google Fonts จริงเฉพาะหน้านี้ — ไม่ได้แก้ไฟล์ CSS กลางของเว็บเลย กระทบแค่หน้า
  // Fonts หน้านี้หน้าเดียว (ดูเหตุผลเต็มๆ ที่คอมเมนต์หัวไฟล์)
  const extraHead = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${googleFamilies}&display=swap" rel="stylesheet">`;

  const baseFontCards = BASE_FONT_SPECIMENS.map((f) => fontCardHtml({
    specimenFamily: f.cssFamily,
    label: f.label,
    badgeHtml: `<span class="pill-badge" style="background:rgba(244,184,96,0.14);border-color:rgba(244,184,96,0.35);color:#f4b860;">🌟 Built-in</span>`,
    footerHtml: `<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;">Always available on every server</div>`,
  })).join('');

  const customFontCards = customFonts.map((f) => {
    // 🆕 @font-face ประกาศแยกต่อไฟล์ (ดูด้านล่าง styleTag) ใช้ family name เดียวกับที่
    // @napi-rs/canvas register ฝั่งเซิร์ฟเวอร์เป๊ะๆ (f.family มาจาก fontStorage.js ตรงๆ)
    const uploadedDate = new Date(f.uploadedAt);
    const uploadedLabel = isNaN(uploadedDate.getTime()) ? '' : uploadedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return fontCardHtml({
      specimenFamily: `'${f.family}', sans-serif`,
      label: f.originalName || f.family,
      badgeHtml: `<span class="pill-badge">Custom</span>`,
      footerHtml: uploadedLabel ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;">Uploaded ${escapeHtml(uploadedLabel)}</div>` : '',
      deleteButtonHtml: `<form method="POST" action="/dashboard/${escapeHtml(guild.id)}/fonts/${escapeHtml(f.id)}/delete" onsubmit="return confirm('Delete this font? Any card text using it will fall back to the default font.');" style="margin:0;">
        <button type="submit" class="neon-trash" title="Delete this font" style="width:28px;height:26px;">${TRASH_ICON}</button>
      </form>`,
    });
  }).join('');

  // 🆕 @font-face ของฟอนต์ที่อัปโหลดเอง — เสิร์ฟไฟล์จริงจาก route /fonts/:fontId/file (เซิร์ฟ
  // คนละไฟล์ต่อฟอนต์ ไม่รวมกัน กันปัญหาไฟล์หนึ่งเสียแล้วลากฟอนต์อื่นพังไปด้วย)
  const fontFaceCss = customFonts.map((f) =>
    `@font-face { font-family: '${f.family}'; src: url('/dashboard/${guild.id}/fonts/${f.id}/file'); font-display: swap; }`
  ).join('\n  ');

  const usedCount = customFonts.length;
  const nearLimit = usedCount >= maxFonts;
  const slotPillHtml = `<span class="pill-badge" style="${nearLimit ? 'background:rgba(255,92,122,0.14);border-color:rgba(255,92,122,0.35);color:#ff8fa3;' : ''}">${usedCount} / ${maxFonts} slots used</span>`;

  let noticeHtml = '';
  if (notice?.uploaded) {
    noticeHtml = `<div style="margin-top:14px;font-size:12.5px;color:var(--teal);background:rgba(82,199,192,0.1);border:1px solid rgba(82,199,192,0.3);border-radius:4px;padding:8px 12px;">✓ Font uploaded — it's ready to use from the Welcome/Goodbye Card pages.</div>`;
  } else if (notice?.deleted) {
    noticeHtml = `<div style="margin-top:14px;font-size:12.5px;color:var(--text-muted);background:rgba(154,162,196,0.1);border:1px solid var(--border);border-radius:4px;padding:8px 12px;">Font deleted.</div>`;
  } else if (notice?.error) {
    noticeHtml = `<div style="margin-top:14px;font-size:12.5px;color:#ff8fa3;background:rgba(255,92,122,0.1);border:1px solid rgba(255,92,122,0.3);border-radius:4px;padding:8px 12px;">${escapeHtml(notice.error)}</div>`;
  }

  const bodyHtml = `
    <div style="padding:44px 56px;max-width:1240px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:24px;font-weight:700;color:var(--text);">Fonts</div>
          <div style="font-size:13.5px;color:var(--text-muted);margin-top:4px;max-width:520px;">
            ${escapeHtml(guild.name)} · Upload your own .ttf/.otf fonts to use on the Welcome and Goodbye cards.
          </div>
        </div>
        ${slotPillHtml}
      </div>
      ${noticeHtml}

      <!-- ── การ์ดอัปโหลด ── -->
      <form method="POST" action="/dashboard/${escapeHtml(guild.id)}/fonts/upload" enctype="multipart/form-data" class="glass-card" style="margin-top:24px;padding:20px 22px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="flex:1 1 300px;min-width:240px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);">Upload a new font</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">.ttf or .otf, up to 8MB — ${usedCount} / ${maxFonts} slots used on this server.</div>
        </div>
        <input type="file" name="font" accept=".ttf,.otf" required ${nearLimit ? 'disabled' : ''} style="font-size:12px;color:var(--text-muted);flex:1 1 220px;min-width:200px;" />
        <button type="submit" ${nearLimit ? 'disabled' : ''} style="display:flex;align-items:center;gap:6px;height:38px;padding:0 18px;border-radius:999px;border:none;background:${nearLimit ? 'rgba(154,162,196,0.25)' : 'var(--blurple)'};color:#fff;font-size:12.5px;font-weight:700;cursor:${nearLimit ? 'not-allowed' : 'pointer'};">
          ${UPLOAD_ICON} Upload
        </button>
      </form>
      ${nearLimit ? '<div style="margin-top:8px;font-size:11px;color:var(--gold);">This server has reached the font slot limit — delete one below to free up a slot.</div>' : ''}

      <!-- ── แกลเลอรี่สินค้า (asset grid) — สเปคอ้างอิงลุค Roblox item catalog ── -->
      <div style="margin-top:32px;font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;">Built-in fonts</div>
      <div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));gap:14px;">
        ${baseFontCards}
      </div>

      <div style="margin-top:32px;font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;">This server's fonts</div>
      <div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));gap:14px;">
        ${customFontCards || `<div style="grid-column:1/-1;padding:28px;text-align:center;color:var(--text-muted);font-size:12.5px;border:1px dashed var(--glass-border);border-radius:10px;">No custom fonts uploaded yet — upload one above to see it here.</div>`}
      </div>
    </div>`;

  return renderDashboardLayout({
    title: `Fonts — ${guild.name} — Aitao Bot`,
    guild,
    user,
    activeKey: 'fonts',
    botAvatarUrl,
    botName,
    bodyHtml,
    extraHead,
    extraStyle: fontFaceCss,
  });
}

module.exports = { renderFontsPage };
