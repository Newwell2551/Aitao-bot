// utils/renderServerPicker.js
// ─────────────────────────────────────────────────────────────────────────
// ไฟล์นี้มีหน้าที่เดียว: "สร้างหน้า HTML ของ Server Picker" (หน้าเลือกเซิร์ฟเวอร์
// หลังล็อกอินสำเร็จ) แล้วคืนเป็น string ยาวๆ กลับไปให้ server.js ส่ง (res.send(...))
//
// 🔄 อัปเดต (รอบ 2): รอบแรกที่เขียนไปเขียนจาก "สเปกที่เป็นข้อความ" ล้วนๆ เลยได้
// ดีไซน์คนละแบบกับ mockup ที่น้องหนาวอนุมัติไปแล้ว (ไฟล์ ServerPicker.dc.html ใน
// แคนวาสออกแบบ) — รอบนี้เปิดไฟล์ mockup ตัวจริงมาอ้างอิงเป๊ะๆ แทน: โครงหน้าเป็น
// "คอลัมน์เดียวจัดกึ่งกลาง" (ไม่ใช่กริด 3 คอลัมน์แบบรอบแรก) มีการ์ดเด่นพิเศษสำหรับ
// เซิร์ฟ Premium อยู่บนสุด แล้วเซิร์ฟที่เหลือเป็นลิสต์แถวเรียงกันด้านล่าง
//
// สิ่งที่ "ไม่ได้" ทำตาม mockup เป๊ะๆ (ตัดสินใจเองพร้อมเหตุผล บอกไว้ตรงๆ):
//   - บรรทัด "แอคทีฟล่าสุด X วันที่แล้ว" ใต้ชื่อเซิร์ฟ — ข้ามไปตามที่น้องหนาวเลือกไว้
//     (ยังไม่มีระบบบันทึกเวลาที่แอดมินเข้าหน้าจัดการแต่ละเซิร์ฟจริงๆ ไม่อยากใส่เลขมั่วๆ)
//   - ฟอนต์ Prompt/Athiti ที่เห็นใน mockup — ไฟล์ mockup ใส่ไว้เฉพาะไฟล์ตัวอย่างในแคนวาส
//     เว็บจริงที่ deploy อยู่ตอนนี้ (public/index.html) ใช้ system font ธรรมดา เลยยึดตาม
//     เว็บจริงเพื่อให้ทั้งเว็บสอดคล้องกัน (อยากได้ฟอนต์สวยแบบ mockup จริงๆ บอกได้ครับ)
//   - ปุ่มสลับโหมดมืด/สว่าง — mockup หน้านี้ไม่มีปุ่มนี้ เลยตัดออกจากหน้านี้ไปก่อน จะกลับมา
//     คุยเรื่องตำแหน่งปุ่มนี้ตอนสร้าง sidebar ที่ใช้ร่วมกันทุกหน้า (ตอนทำหน้า Overview)
//   - จุดสถานะสีบนไอคอน (ออนไลน์/ไม่ออนไลน์) — mockup ดูเหมือนจะสื่อ "active อยู่ตอนนี้"
//     ซึ่งต้องมีระบบ presence tracking เพิ่ม เลยลดรูปเหลือแค่ "บอทอยู่ในเซิร์ฟนี้ไหม"
//     (เขียว = มีบอทอยู่, เทา = ยังไม่มี) ใช้ข้อมูลที่มีจริงตอนนี้พอ ไม่ผูกกับของที่ยังไม่มี
//
// ⚠️ ทำไมไม่ใช้ React/Vue/template engine (เช่น EJS)? ดูคำอธิบายเดิมในคอมเมนต์ท้ายไฟล์
// ─────────────────────────────────────────────────────────────────────────

/**
 * แปลงข้อความให้ปลอดภัยก่อนใส่ลงใน HTML (กัน XSS) — ดูคำอธิบายเต็มๆ ว่าทำไมต้องมี
 * ฟังก์ชันนี้ในคอมเมนต์ด้านล่าง (ชื่อเซิร์ฟเวอร์มาจากผู้ใช้ Discord ตั้งเองได้อิสระ)
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * คำนวณ URL รูป avatar default ของผู้ใช้ (กรณีเขาไม่เคยตั้งรูปโปรไฟล์เอง) — เก็บฟังก์ชัน
 * นี้ไว้ใช้ในหน้าถัดๆ ไปที่จะโชว์ avatar ผู้ใช้ (หน้านี้รอบนี้ตัดรูป avatar ผู้ใช้ออกจาก
 * แถบบนแล้ว ตาม mockup ที่โชว์แค่ชื่อเฉยๆ — ดูคอมเมนต์หัวไฟล์)
 * @param {string} userId
 * @returns {string}
 */
function defaultAvatarUrl(userId) {
  const index = Number((BigInt(userId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

// ── โทนสีไอคอนโมโนแกรม (วนใช้ตามลำดับ guild ID) ─────────────────────────────
// แต่ละสีมี 2 ค่า: [สีตัวอักษร/ไอคอน, สีพื้นหลังแบบโปร่งแสง 16-18%] คัดลอกโทนมาจาก
// ตัวแปรสีที่ใช้จริงทั้งเว็บ (--accent, --gold, --teal ใน public/index.html) เพื่อให้
// เซิร์ฟแต่ละอันมีสีต่างกันดูแยกง่าย แต่ยังอยู่ในโทนแบรนด์เดียวกันเป๊ะๆ
const MONOGRAM_PALETTE = [
  { fg: '#7c83fd', bg: 'rgba(124,131,253,0.18)' }, // accent (ม่วง-น้ำเงิน)
  { fg: '#f4b860', bg: 'rgba(244,184,96,0.16)' },   // gold
  { fg: '#52c7c0', bg: 'rgba(82,199,192,0.18)' },   // teal
];

/**
 * เลือกสีโมโนแกรมให้เซิร์ฟหนึ่งๆ แบบ "คงที่" (guild เดิมได้สีเดิมเสมอทุกครั้งที่โหลดหน้า
 * ไม่ใช่สีสุ่มใหม่ทุกรอบ) โดยรวมค่า char code ของ guild ID แล้ว mod ด้วยจำนวนสีในพาเลต
 * @param {string} guildId
 * @returns {{fg: string, bg: string}}
 */
function monogramColorForGuild(guildId) {
  let sum = 0;
  for (const ch of String(guildId)) sum += ch.charCodeAt(0);
  return MONOGRAM_PALETTE[sum % MONOGRAM_PALETTE.length];
}

// ตัวตัด grapheme cluster ภาษาไทย/อังกฤษ — ใช้แทนการตัด string ตรงๆ (str.charAt(0))
// เพราะตัวอักษรไทยหลายตัวจริงๆ ประกอบจากหลาย unicode code point ซ้อนกัน (เช่น
// สระ/วรรณยุกต์ลอยอยู่บนตัวพยัญชนะ) ถ้าตัดด้วย charAt(0) เฉยๆ อาจได้แค่ตัวพยัญชนะ
// ลอยๆ โดยไม่มีวรรณยุกต์ที่ควรติดมาด้วย ดูแตกๆ Intl.Segmenter ตัดตาม "กลุ่มตัวอักษร
// ที่คนมองว่าเป็น 1 ตัว" ให้จริงๆ (รองรับตั้งแต่ Node 16+ ไม่ต้องลงไลบรารีเพิ่ม)
const graphemeSegmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });

/**
 * ตัดชื่อเซิร์ฟให้เหลือ "ตัวย่อ 2 ตัวอักษร" สำหรับโชว์ในไอคอนโมโนแกรม (ตอนไม่มีรูปไอคอน
 * จริง) กฎง่ายๆ: ถ้าชื่อมีหลายคำ (คั่นด้วยเว้นวรรค) เอาตัวอักษรแรกของ 2 คำแรกมาต่อกัน
 * (เช่น "Milo Community" → "MC") ถ้ามีคำเดียว เอา 2 ตัวอักษรแรกของคำนั้นแทน
 *
 * หมายเหตุตรงๆ: นี่เป็นกฎที่เรียบง่ายและคาดเดาผลได้ ไม่ได้ฉลาดเท่าคนเลือกเองทีละชื่อ
 * (ชื่อเซิร์ฟภาษาไทยบางชื่อที่ไม่มีเว้นวรรคอาจได้ตัวย่อที่ดูแปลกๆ บ้าง) แต่ทำงานได้กับ
 * ชื่อเซิร์ฟทุกแบบโดยไม่ต้องมานั่งเดา/ตั้งกฎภาษาศาสตร์ซับซ้อนสำหรับ edge case ที่มีไม่รู้จบ
 * @param {string} name
 * @returns {string}
 */
function guildMonogram(name) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';

  const words = trimmed.split(/\s+/);
  const firstGrapheme = (word) => {
    const iter = graphemeSegmenter.segment(word)[Symbol.iterator]().next();
    return iter.done ? '' : iter.value.segment;
  };

  if (words.length >= 2) {
    return (firstGrapheme(words[0]) + firstGrapheme(words[1])).toUpperCase();
  }
  // คำเดียว — เอา 2 grapheme cluster แรกของคำนั้น
  const clusters = [...graphemeSegmenter.segment(words[0])].slice(0, 2).map((s) => s.segment);
  return clusters.join('').toUpperCase();
}

/**
 * สร้าง HTML ของ "ไอคอนเซิร์ฟ" — ถ้ามีรูปไอคอนจริงจาก Discord ใช้รูปนั้นเลย ถ้าไม่มี
 * (guild.icon เป็น null) ใช้กล่องสี่เหลี่ยมมุมมนสีสัน + ตัวย่อ 2 ตัวอักษรแทน (ดีไซน์
 * ตรงตาม mockup) พร้อมจุดสถานะเล็กๆ มุมขวาล่างบอกว่า "บอทอยู่ในเซิร์ฟนี้ไหม"
 * @param {object} server
 * @param {number} size ขนาดไอคอนเป็น px (การ์ดเด่น Premium ใช้ 44, แถวปกติใช้ 36)
 * @returns {string}
 */
function serverIconHtml(server, size) {
  const dotSize = size === 44 ? 11 : 9;
  const dotColor = server.hasBot ? '#4b8f87' : '#454e78'; // เขียว = มีบอทอยู่, เทา = ยังไม่มี
  const dotHtml = `<div style="position:absolute;bottom:-2px;right:-2px;width:${dotSize}px;height:${dotSize}px;border-radius:999px;background:${dotColor};border:2.5px solid var(--bg-card);"></div>`;

  if (server.iconUrl) {
    return `
      <div style="position:relative;flex:0 0 auto;">
        <img src="${escapeHtml(server.iconUrl)}" alt="" loading="lazy" style="width:${size}px;height:${size}px;border-radius:3px;object-fit:cover;" />
        ${dotHtml}
      </div>`;
  }

  const { fg, bg } = monogramColorForGuild(server.id);
  const fontSize = size === 44 ? 16 : 12;
  return `
    <div style="position:relative;flex:0 0 auto;">
      <div style="width:${size}px;height:${size}px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:800;background:${bg};color:${fg};">${escapeHtml(guildMonogram(server.name))}</div>
      ${dotHtml}
    </div>`;
}

/**
 * การ์ดเด่นพิเศษสำหรับเซิร์ฟ Premium — โชว์แยกจากลิสต์ปกติ อยู่บนสุดของหน้า ตรงตาม
 * mockup (การ์ดกว้างเต็ม พื้นหลัง var(--bg-card) ป้ายทอง "★ เซิร์ฟ PREMIUM ของคุณ")
 * @param {object} server
 * @returns {string}
 */
function featuredCardHtml(server) {
  // toLocaleString('en-US') แทน 'th-TH' เพราะข้อความหน้าแดชบอร์ดทั้งหมดเปลี่ยนเป็น
  // ภาษาอังกฤษแล้วตามที่น้องหนาวขอ (ตัวเลขคั่นหลักพันด้วย comma แบบอังกฤษให้เข้าชุดกัน)
  const memberCountText = server.memberCount != null ? server.memberCount.toLocaleString('en-US') : '-';
  return `
    <div style="margin-top:16px;width:100%;border-radius:3px;background:var(--bg-card);border:1px solid var(--border);padding:15px 20px;display:flex;align-items:center;gap:16px;box-sizing:border-box;">
      ${serverIconHtml(server, 44)}
      <div style="min-width:0;">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:0.1em;color:var(--gold);text-transform:uppercase;">★ Your Premium Server</div>
        <div style="font-size:16.5px;font-weight:700;color:var(--text);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(server.name)}</div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;">${memberCountText} members</div>
      </div>
      <a href="/dashboard/${server.id}" style="margin-left:auto;flex:0 0 auto;height:38px;padding:0 20px;border-radius:3px;background:var(--accent);color:#fff;font-size:12.5px;font-weight:700;display:flex;align-items:center;gap:8px;text-decoration:none;box-sizing:border-box;">Manage this server →</a>
    </div>`;
}

/**
 * แถวเซิร์ฟปกติ 1 แถวในลิสต์ "เซิร์ฟเวอร์อื่นๆ ของคุณ" — แยก 2 แบบตาม hasBot เหมือนเดิม
 * @param {object} server
 * @param {string} inviteUrl ลิงก์เชิญบอทแบบ "ยังไม่ระบุเซิร์ฟ" (ใช้เฉพาะตอน !hasBot)
 * @returns {string}
 */
function serverRowHtml(server, inviteUrl) {
  const nameHtml = escapeHtml(server.name);

  if (server.hasBot) {
    // มีบอทอยู่แล้ว แต่ไม่ใช่ premium (เซิร์ฟ premium ถูกแยกไปโชว์เป็นการ์ดเด่นแล้ว
    // ตั้งแต่ renderServerPickerPage() — เลยการันตีได้ว่ามาถึงตรงนี้คือ free เสมอ)
    const memberCountText = server.memberCount != null ? server.memberCount.toLocaleString('en-US') : '-';
    return `
      <div class="sp-row" style="flex:0 0 auto;width:100%;max-width:460px;margin:0 auto;display:flex;align-items:center;gap:14px;padding:11px 4px;border-bottom:1px solid var(--border);box-sizing:border-box;">
        ${serverIconHtml(server, 36)}
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nameHtml}</span>
            <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:999px;background:rgba(154,162,196,0.1);color:var(--text-muted);flex-shrink:0;">Free</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted-2);margin-top:2px;">${memberCountText} members</div>
        </div>
        <div style="margin-left:auto;flex:0 0 auto;"><a href="/dashboard/${server.id}" class="sp-row-link" style="font-size:11.5px;font-weight:700;color:var(--accent);">Manage →</a></div>
      </div>`;
  }

  // ยังไม่มีบอท — ปุ่ม "+ Invite bot" ทรงแคปซูล (pill) เล็กๆ ทางขวา พร้อม guild_id +
  // disable_guild_select=true ให้ Discord ล็อกไว้ที่เซิร์ฟนี้เซิร์ฟเดียวตอนเชิญ (ดูคำอธิบาย
  // เต็มๆ ในคอมเมนต์ท้ายไฟล์)
  const inviteUrlForThisGuild = `${inviteUrl}&guild_id=${server.id}&disable_guild_select=true`;
  return `
    <div class="sp-row" style="flex:0 0 auto;width:100%;max-width:460px;margin:0 auto;display:flex;align-items:center;gap:14px;padding:11px 4px;border-bottom:1px solid var(--border);box-sizing:border-box;">
      ${serverIconHtml(server, 36)}
      <div style="min-width:0;">
        <div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nameHtml}</div>
        <div style="font-size:11px;color:var(--text-muted-2);margin-top:2px;">Bot not installed</div>
      </div>
      <div style="margin-left:auto;flex:0 0 auto;">
        <a href="${escapeHtml(inviteUrlForThisGuild)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;height:30px;line-height:30px;padding:0 14px;border-radius:999px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;text-decoration:none;">+ Invite bot</a>
      </div>
    </div>`;
}

/**
 * สร้างหน้า HTML เต็มๆ ของ Server Picker
 *
 * @param {object} params
 * @param {{id: string, username: string, avatar: string|null}} params.user ผู้ใช้ที่ login อยู่ (จาก req.session.user)
 * @param {Array<{
 *   id: string, name: string, iconUrl: string|null, hasBot: boolean,
 *   memberCount: number|null, tier: 'free'|'premium'|null
 * }>} params.servers รายชื่อเซิร์ฟที่ผู้ใช้มีสิทธิ์ Manage Server (server.js กรองมาให้แล้ว)
 * @param {string} params.inviteUrl ลิงก์เชิญบอทแบบ "ยังไม่ระบุเซิร์ฟ" (จาก buildInviteUrl())
 * @param {string} params.botAvatarUrl URL avatar จริงของบอทเอง (client.user.displayAvatarURL())
 *   ใช้โชว์ตรงหัวข้อทักทายกลางหน้า — ของจริง ไม่ใช่รูปตัวละครสมมติแบบใน mockup
 * @returns {string} HTML เต็มหน้า พร้อม res.send() ได้เลย
 */
function renderServerPickerPage({ user, servers, inviteUrl, botAvatarUrl }) {
  // แยกเซิร์ฟ Premium (ที่มีบอทอยู่แล้วเท่านั้น — premium ที่ยังไม่มีบอทไม่มีความหมาย
  // จะไปเด่นพิเศษ เพราะยังตั้งค่าอะไรไม่ได้เลย) ออกมาเป็นการ์ดเด่น ที่เหลือไปอยู่ลิสต์ปกติ
  const featuredServers = servers.filter((s) => s.hasBot && s.tier === 'premium');
  const featuredIds = new Set(featuredServers.map((s) => s.id));
  const restServers = servers.filter((s) => !featuredIds.has(s.id));
  // เรียงลิสต์ที่เหลือ: มีบอทอยู่แล้วขึ้นก่อน (ใช้งานได้จริงตอนนี้) แล้วเรียงชื่อ ก-ฮ/A-Z
  restServers.sort((a, b) => {
    if (a.hasBot !== b.hasBot) return a.hasBot ? -1 : 1;
    return a.name.localeCompare(b.name, 'th');
  });

  const featuredHtml = featuredServers.map(featuredCardHtml).join('');

  const restLabel = featuredServers.length > 0
    ? `Other Servers (${restServers.length})`
    : `Your Servers (${restServers.length})`;

  const restListHtml = restServers.length > 0
    ? `<div style="width:100%;max-width:460px;border-top:1px solid var(--border);margin:0 auto;flex:0 0 auto;"></div>`
      + restServers.map((s) => serverRowHtml(s, inviteUrl)).join('')
    : `<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:24px 0;">
         ${featuredServers.length > 0 ? 'No other servers.' : 'This account has no servers with "Manage Server" permission.'}
       </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Select a Server — Aitao Bot Dashboard</title>
<style>
  /* ── ตัวแปรสี ── ก๊อปมาจาก public/index.html เป๊ะๆ (เว็บจริงที่ deploy อยู่ตอนนี้)
     เพื่อให้ธีมสีทั้งเว็บสอดคล้องกัน ไม่ใช่มโนสีขึ้นมาใหม่เอง */
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
  .sp-row-link:hover { text-decoration: underline; }
  .sp-row:hover { border-color: var(--accent); }

  .topbar {
    height: 72px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
  }
  @media (min-width: 640px) { .topbar { padding: 0 48px; } }
  .topbar-brand { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: var(--text); }
  .topbar-brand img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
  .topbar-right { display: flex; align-items: center; gap: 24px; }
  .topbar-right span { font-size: 13px; color: var(--text-muted); }
  .topbar-right a { font-size: 13px; color: var(--text-muted); }
  .topbar-right a:hover { color: var(--text); text-decoration: underline; }

  main {
    max-width: 620px;
    margin: 0 auto;
    padding: 24px 16px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  h1 { font-size: 21px; font-weight: 700; color: var(--text); margin: 10px 0 0; text-align: center; }
  .subtitle { font-size: 12px; color: var(--text-muted-2); margin: 4px 0 0; text-align: center; }

  .section-label {
    width: 100%;
    max-width: 460px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #6b7394;
    text-transform: uppercase;
    margin: 20px auto 6px;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-brand">
      <img src="${escapeHtml(botAvatarUrl)}" alt="" />
      <span>Aitao Bot</span>
    </div>
    <div class="topbar-right">
      <span>${escapeHtml(user.username)}</span>
      <a href="/auth/logout">Log out</a>
    </div>
  </div>

  <main>
    <div style="position:relative;">
      <img src="${escapeHtml(botAvatarUrl)}" alt="" style="width:46px;height:46px;border-radius:999px;object-fit:cover;border:2px solid var(--border);" />
      <div style="position:absolute;bottom:0;right:0;width:11px;height:11px;border-radius:999px;background:var(--teal);border:2.5px solid var(--bg);"></div>
    </div>
    <h1>Select a server to manage</h1>
    <p class="subtitle">Only servers where you have Manage Server permission are shown</p>

    ${featuredHtml}

    <div class="section-label">${restLabel}</div>
    ${restListHtml}
  </main>
</body>
</html>`;
}

/**
 * 🆕 [19 ก.ย. 2569 ดึกมาก] แถวเซิร์ฟ 1 แถวของหน้า "เลือกเซิร์ฟที่จะซื้อพรีเมียม" —
 * คล้าย serverRowHtml() ด้านบนมาก (ก๊อปโครงมาแล้วปรับ 2 จุด) ต่างกันแค่:
 *   1) ลิงก์ปลายทางเป็น /premium/:guildId (หน้าเลือกวิธีจ่ายเงิน) แทน /dashboard/:guildId
 *   2) ป้ายสถานะแสดง "Already Premium" (กดแล้วไปจัดการการสมัครแทนที่จะซื้อซ้ำ) แทนที่จะ
 *      เป็น "Free" เฉยๆ เพราะหน้านี้ไม่มีการ์ดเด่นแยกเซิร์ฟพรีเมียมออกมาต่างหากเหมือน
 *      renderServerPickerPage() (ไม่จำเป็น หน้านี้มีจุดประสงค์เดียวคือ "เลือกเซิร์ฟ" ไม่ใช่
 *      "ดูภาพรวมทุกเซิร์ฟ")
 * @param {object} server
 * @param {string} inviteUrl
 * @returns {string}
 */
function premiumServerRowHtml(server, inviteUrl) {
  const nameHtml = escapeHtml(server.name);

  if (!server.hasBot) {
    const inviteUrlForThisGuild = `${inviteUrl}&guild_id=${server.id}&disable_guild_select=true`;
    return `
      <div class="sp-row" style="flex:0 0 auto;width:100%;max-width:460px;margin:0 auto;display:flex;align-items:center;gap:14px;padding:11px 4px;border-bottom:1px solid var(--border);box-sizing:border-box;">
        ${serverIconHtml(server, 36)}
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nameHtml}</div>
          <div style="font-size:11px;color:var(--text-muted-2);margin-top:2px;">Bot not installed</div>
        </div>
        <div style="margin-left:auto;flex:0 0 auto;">
          <a href="${escapeHtml(inviteUrlForThisGuild)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;height:30px;line-height:30px;padding:0 14px;border-radius:999px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;text-decoration:none;">+ Invite bot</a>
        </div>
      </div>`;
  }

  const isPremium = server.tier === 'premium';
  const memberCountText = server.memberCount != null ? server.memberCount.toLocaleString('en-US') : '-';
  const badgeHtml = isPremium
    ? `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:999px;background:rgba(244,184,96,0.16);color:var(--gold);flex-shrink:0;">Premium</span>`
    : `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:999px;background:rgba(154,162,196,0.1);color:var(--text-muted);flex-shrink:0;">Free</span>`;
  return `
    <div class="sp-row" style="flex:0 0 auto;width:100%;max-width:460px;margin:0 auto;display:flex;align-items:center;gap:14px;padding:11px 4px;border-bottom:1px solid var(--border);box-sizing:border-box;">
      ${serverIconHtml(server, 36)}
      <div style="min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nameHtml}</span>
          ${badgeHtml}
        </div>
        <div style="font-size:11px;color:var(--text-muted-2);margin-top:2px;">${memberCountText} members</div>
      </div>
      <div style="margin-left:auto;flex:0 0 auto;"><a href="/premium/${server.id}" class="sp-row-link" style="font-size:11.5px;font-weight:700;color:var(--accent);">${isPremium ? 'Manage billing' : 'Continue'} →</a></div>
    </div>`;
}

/**
 * 🆕 [19 ก.ย. 2569 ดึกมาก] หน้า "เลือกเซิร์ฟที่จะซื้อพรีเมียม" — จุดเข้าใหม่จากปุ่ม
 * "Subscribe to Premium" ที่หน้า public/pricing.html (ผ่าน GET /premium/start ใน server.js)
 * ก่อนหน้านี้ปุ่มนั้นพาไปหน้าเชิญบอทตรงๆ เลย (ยังไม่มีระบบล็อกอิน+เลือกเซิร์ฟ) ตอนนี้
 * ระบบล็อกอินมีแล้ว เลยเพิ่มขั้นตอน "เลือกว่าซื้อให้เซิร์ฟไหน" ก่อนไปหน้าเลือกวิธีจ่ายเงิน
 * (renderPremiumBilling.js) — โครงหน้าเหมือน renderServerPickerPage() มาก (ก๊อปหัว/ธีมสี
 * มาเลย ให้ผู้ใช้รู้สึกว่าเป็นเว็บเดียวกัน) แต่เรียบง่ายกว่า: ไม่มีการ์ดเด่นแยกพรีเมียม
 * เพราะ server.js กรอง servers ที่ส่งมาให้แล้วว่าต้องมีบอทอยู่ + ผู้ใช้มีสิทธิ์ Manage Server
 * เท่านั้น (ตัดเซิร์ฟที่ไม่มีบอทออกไปตั้งแต่ต้น ต่างจาก renderServerPickerPage ที่โชว์ทุกเซิร์ฟ
 * รวมเซิร์ฟที่ยังไม่มีบอทด้วย — ดูพารามิเตอร์ servers ด้านล่าง)
 *
 * @param {object} params
 * @param {{id: string, username: string, avatar: string|null}} params.user
 * @param {Array<{id:string, name:string, iconUrl:string|null, hasBot?: boolean, memberCount:number, tier:'free'|'premium'}>} params.servers
 *   เซิร์ฟที่ผู้ใช้มีสิทธิ์ Manage Server ทั้งหมด (ทั้งที่มีบอทและยังไม่มีบอท — server.js
 *   ส่งมาให้ครบทุกเซิร์ฟที่มีสิทธิ์ ไม่ได้กรองเอาแต่ hasBot ออกมาอย่างเดียว เพื่อให้หน้านี้
 *   ยังโชว์ปุ่ม "+ Invite bot" ของเซิร์ฟที่ยังไม่มีบอทได้ด้วย เผื่อผู้ใช้ยังไม่เคยเชิญบอทเลย)
 *   hasBot ไม่บังคับส่งมา — ถ้าไม่ส่ง จะถือว่า true เสมอ (server.js ปัจจุบันกรองมาเฉพาะ
 *   hasBot อยู่แล้วก่อนส่งมา แต่เผื่ออนาคตอยากส่งเซิร์ฟที่ไม่มีบอทมาด้วยก็รองรับได้เลย)
 * @param {string} params.inviteUrl
 * @param {string} params.botAvatarUrl
 * @returns {string} HTML เต็มหน้า พร้อม res.send() ได้เลย
 */
function renderPremiumServerPickerPage({ user, servers, inviteUrl, botAvatarUrl }) {
  const normalized = servers.map((s) => ({ ...s, hasBot: s.hasBot !== false }));
  normalized.sort((a, b) => {
    if (a.hasBot !== b.hasBot) return a.hasBot ? -1 : 1;
    return a.name.localeCompare(b.name, 'th');
  });

  const listHtml = normalized.length > 0
    ? normalized.map((s) => premiumServerRowHtml(s, inviteUrl)).join('')
    : '';

  // 🆕 Empty state: ไม่มีเซิร์ฟไหนที่มีสิทธิ์ Manage Server + มีบอทอยู่เลยสักเซิร์ฟ —
  // ให้เชิญบอทก่อนถึงจะซื้อพรีเมียมได้ (ลิงก์เชิญแบบ "ยังไม่ระบุเซิร์ฟ" ให้เลือกเองหน้า Discord)
  const emptyStateHtml = normalized.length === 0
    ? `<div style="text-align:center;max-width:420px;margin:12px auto 0;">
        <p style="font-size:13px;color:var(--text-muted);line-height:1.7;">
          You'll need to add Aitao Bot to a server you manage before you can subscribe to Premium.
        </p>
        <a href="${escapeHtml(inviteUrl)}" target="_blank" rel="noopener noreferrer"
           style="display:inline-flex;margin-top:12px;height:38px;padding:0 22px;border-radius:999px;background:var(--accent);color:#fff;font-size:13px;font-weight:700;align-items:center;text-decoration:none;">
          + Add Aitao Bot to a server
        </a>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Choose a Server — Aitao Bot Premium</title>
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
  .sp-row-link:hover { text-decoration: underline; }
  .sp-row:hover { border-color: var(--accent); }

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

  main {
    max-width: 620px;
    margin: 0 auto;
    padding: 24px 16px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  h1 { font-size: 21px; font-weight: 700; color: var(--text); margin: 10px 0 0; text-align: center; }
  .subtitle { font-size: 12px; color: var(--text-muted-2); margin: 4px 0 0; text-align: center; }
  .back-link { font-size: 12.5px; color: var(--text-muted); margin-top: 14px; }
  .back-link:hover { color: var(--text); }
</style>
</head>
<body>
  <div class="topbar">
    <a href="/pricing" class="topbar-brand">
      <img src="${escapeHtml(botAvatarUrl)}" alt="" />
      <span>Aitao Bot</span>
    </a>
    <div class="topbar-right">
      <span>${escapeHtml(user.username)}</span>
      <a href="/auth/logout">Log out</a>
    </div>
  </div>

  <main>
    <div style="position:relative;">
      <img src="${escapeHtml(botAvatarUrl)}" alt="" style="width:46px;height:46px;border-radius:999px;object-fit:cover;border:2px solid var(--border);" />
      <div style="position:absolute;bottom:0;right:0;width:11px;height:11px;border-radius:999px;background:var(--gold);border:2.5px solid var(--bg);"></div>
    </div>
    <h1>Which server is this for?</h1>
    <p class="subtitle">Pick the server you'd like to upgrade to Premium</p>

    ${listHtml}
    ${emptyStateHtml}

    <a href="/pricing" class="back-link">&larr; Back to Pricing</a>
  </main>
</body>
</html>`;
}

// 🆕 เพิ่ม export monogramColorForGuild + serverIconHtml ตอนสร้างหน้า Overview (utils/dashboardShell.js)
// เพราะแถบ "สลับเซิร์ฟ" (guild switcher) บนแถบข้างของทุกหน้าแดชบอร์ดต้องโชว์ไอคอนเซิร์ฟแบบ
// เดียวกันเป๊ะกับหน้า Server Picker (สีโมโนแกรมเดิม ไม่ใช่สุ่มใหม่) — ใช้ของเดิมตรงๆ ไม่เขียนซ้ำ
module.exports = {
  renderServerPickerPage,
  renderPremiumServerPickerPage,
  escapeHtml,
  defaultAvatarUrl,
  guildMonogram,
  monogramColorForGuild,
  serverIconHtml,
};

// ─────────────────────────────────────────────────────────────────────────
// ทำไมไม่ใช้ React/Vue/template engine (เช่น EJS)?
// โปรเจกต์นี้ยังไม่มีระบบพวกนี้ติดตั้งอยู่ (ดู package.json) การเพิ่มเข้ามาตอนนี้จะทำให้
// ซับซ้อนขึ้นโดยไม่จำเป็น หน้านี้เขียนเป็น "ฟังก์ชัน JS ที่คืน string HTML ตรงๆ" (เรียกว่า
// server-side rendering แบบพื้นฐานที่สุด) ง่ายกว่าสำหรับตอนนี้ ถ้าหน้าเว็บซับซ้อนขึ้นเรื่อยๆ
// ในอนาคต (8 หน้า sidebar ที่เหลือ) ค่อยกลับมาคุยกันเรื่องเปลี่ยนไปใช้ template engine จริงจัง
//
// ทำไม escapeHtml() ต้องมี?
// ชื่อเซิร์ฟเวอร์ (guild.name) มาจาก Discord ซึ่งเจ้าของเซิร์ฟตั้งชื่อเองได้อิสระ — ถ้ามีคน
// ตั้งชื่อเซิร์ฟเป็น <script>...</script> แล้วเราเอาชื่อนั้นไปแปะลง HTML ตรงๆ โดยไม่แปลงก่อน
// โค้ดนั้นจะถูกรันจริงในเบราว์เซอร์ของทุกคนที่เห็นหน้านี้ (ช่องโหว่ที่เรียกว่า XSS)
//
// ทำไม guild_id + disable_guild_select=true ในลิงก์เชิญบอท?
// เป็นพารามิเตอร์มาตรฐานของ Discord OAuth2 ที่ "ล็อก" หน้าต่างเชิญบอทให้เลือกได้แค่เซิร์ฟ
// นั้นเซิร์ฟเดียว ผู้ใช้ไม่ต้องมานั่งเลือกเซิร์ฟเองอีกรอบในหน้าเชิญ (กันกดผิดเซิร์ฟด้วย)
// ─────────────────────────────────────────────────────────────────────────
