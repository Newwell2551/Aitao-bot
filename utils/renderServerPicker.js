// utils/renderServerPicker.js
// ─────────────────────────────────────────────────────────────────────────
// ไฟล์นี้มีหน้าที่เดียว: "สร้างหน้า HTML ของ Server Picker" (หน้าเลือกเซิร์ฟเวอร์
// หลังล็อกอินสำเร็จ) แล้วคืนเป็น string ยาวๆ กลับไปให้ server.js ส่ง (res.send(...))
//
// ทำไมแยกไฟล์นี้ออกมาจาก server.js? เพราะ server.js มีหน้าที่หลักคือ "จัดการ route"
// (ใครเข้า URL ไหน ต้องเช็คสิทธิ์ยังไง) ส่วนไฟล์นี้มีหน้าที่ "สร้างหน้าตา HTML" ล้วนๆ
// แยกกันจะได้อ่านง่ายกว่า — เวลาจะแก้ "ดีไซน์" ก็มาที่ไฟล์นี้ ไม่ต้องไปงมใน server.js
//
// ⚠️ ทำไมไม่ใช้ React/Vue/template engine (เช่น EJS)?
// โปรเจกต์นี้ยังไม่มีระบบพวกนี้ติดตั้งอยู่ (ดู package.json) การเพิ่มเข้ามาตอนนี้จะทำให้
// ซับซ้อนขึ้นโดยไม่จำเป็น หน้านี้เขียนเป็น "ฟังก์ชัน JS ที่คืน string HTML ตรงๆ" (เรียกว่า
// server-side rendering แบบพื้นฐานที่สุด) ง่ายกว่าสำหรับตอนนี้ ถ้าหน้าเว็บซับซ้อนขึ้นเรื่อยๆ
// ในอนาคต (8 หน้า sidebar ที่เหลือ) ค่อยกลับมาคุยกันเรื่องเปลี่ยนไปใช้ template engine จริงจัง
// ─────────────────────────────────────────────────────────────────────────

/**
 * แปลงข้อความให้ปลอดภัยก่อนใส่ลงใน HTML (กัน XSS)
 *
 * ทำไมต้องมีฟังก์ชันนี้? ชื่อเซิร์ฟเวอร์ (guild.name) มาจาก Discord ซึ่งเจ้าของเซิร์ฟ
 * ตั้งชื่อเองได้อิสระ — ถ้ามีคนตั้งชื่อเซิร์ฟเป็น `<script>...</script>` แล้วเราเอาชื่อนั้น
 * ไปแปะลง HTML ตรงๆ โดยไม่แปลงก่อน โค้ดนั้นจะถูกรันจริงในเบราว์เซอร์ของทุกคนที่เห็นหน้านี้
 * (ช่องโหว่ที่เรียกว่า XSS) ฟังก์ชันนี้แปลงอักขระพิเศษ (< > & " ') ให้เป็นรูปแบบปลอดภัย
 * (HTML entity) แทน เพื่อให้เบราว์เซอร์แสดงเป็น "ข้อความเฉยๆ" ไม่ใช่โค้ดที่รันได้
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
 * คำนวณ URL รูป avatar default ของผู้ใช้ (กรณีเขาไม่เคยตั้งรูปโปรไฟล์เอง)
 *
 * Discord มีสูตรคำนวณตายตัว (ไม่ใช่ค่าสุ่ม): เอา user ID มา shift bit ขวา 22 บิต
 * แล้ว mod ด้วย 6 จะได้เลข 0-5 ซึ่งตรงกับ default avatar 1 ใน 6 แบบที่ Discord มีให้
 * (สูตรนี้เป็นสูตรใหม่ที่ใช้กับ username system ปัจจุบัน — สูตรเก่าใช้ discriminator mod 5
 * แต่บอทนี้ใช้ scope "identify" ที่ได้ user.id มาเสมอ เลยใช้สูตรใหม่ได้ตรงๆ)
 * ต้องใช้ BigInt เพราะ user ID ของ Discord เป็นเลขใหญ่เกินกว่า Number ธรรมดาจะแม่นยำ
 * (เหตุผลเดียวกับที่ hasManageGuild() ใน discordAuth.js ต้องใช้ BigInt)
 * @param {string} userId
 * @returns {string}
 */
function defaultAvatarUrl(userId) {
  const index = Number((BigInt(userId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/**
 * สร้าง HTML ของการ์ด "เซิร์ฟเวอร์ 1 ใบ" ในหน้ากริด
 *
 * รับ object เซิร์ฟเวอร์ 1 อันที่ server.js เตรียมมาให้แล้ว (ดู shape เต็มๆ ที่คอมเมนต์
 * ของ renderServerPickerPage ด้านล่าง) แล้วแยกเป็น 2 แบบตามว่า "บอทอยู่ในเซิร์ฟนี้ไหม":
 *   - มีบอทอยู่แล้ว → โชว์จำนวนสมาชิก + ป้าย Free/Premium + ปุ่ม "จัดการ" (คลิกแล้วเข้าเซิร์ฟนี้)
 *   - ยังไม่มีบอท    → โชว์ปุ่ม "เชิญบอทเข้าเซิร์ฟนี้" แทน (ลิงก์ไปหน้าเชิญของ Discord ตรงๆ)
 * @param {object} server
 * @param {string} inviteUrl ลิงก์เชิญบอทแบบ "ยังไม่ระบุเซิร์ฟ" — ใช้ต่อพารามิเตอร์
 *   guild_id ของเซิร์ฟนี้เข้าไปด้านล่าง (เฉพาะตอนที่ server.hasBot เป็น false เท่านั้น)
 * @returns {string}
 */
function serverCardHtml(server, inviteUrl) {
  // ไอคอนเซิร์ฟ: ถ้ามีรูปจริงก็โชว์รูป ถ้าไม่มี (guild.icon เป็น null) ใช้วงกลมสีพื้น
  // แสดงตัวอักษรตัวแรกของชื่อเซิร์ฟแทน (ดีไซน์แบบเดียวกับที่ Discord เองใช้ default)
  const iconHtml = server.iconUrl
    ? `<img class="server-icon" src="${escapeHtml(server.iconUrl)}" alt="" loading="lazy" />`
    : `<div class="server-icon server-icon-fallback">${escapeHtml(server.name.trim().charAt(0).toUpperCase() || '?')}</div>`;

  const nameHtml = escapeHtml(server.name);

  if (server.hasBot) {
    // ป้าย Free/Premium — สีทองเด่นๆ สำหรับ premium ตามธีมที่วางไว้ (ทอง #f4b860
    // ใช้เน้นเฉพาะจุดที่เกี่ยวกับพรีเมียมเท่านั้น ตาม milo-bot-design-brief.md)
    const tierBadgeHtml = server.tier === 'premium'
      ? `<span class="badge badge-premium">✨ พรีเมียม</span>`
      : `<span class="badge badge-free">ฟรี</span>`;

    // จำนวนสมาชิก: null แปลว่าดึงไม่ได้ด้วยเหตุผลบางอย่าง (ไม่ควรเกิดถ้า hasBot true
    // แต่กันไว้เผื่อ edge case) — โชว์ "-" แทนเลขปลอมๆ
    const memberCountText = server.memberCount != null
      ? `${server.memberCount.toLocaleString('th-TH')} สมาชิก`
      : '- สมาชิก';

    return `
      <a class="server-card" href="/dashboard/${server.id}">
        ${iconHtml}
        <div class="server-card-body">
          <div class="server-card-name">${nameHtml}</div>
          <div class="server-card-meta">${memberCountText}</div>
        </div>
        ${tierBadgeHtml}
      </a>`;
  }

  // ยังไม่มีบอท — ใช้ <a> ลิงก์ไปหน้าเชิญของ Discord ตรงๆ (เปิดแท็บใหม่ กันคนกดแล้ว
  // หลุดจากหน้า dashboard ที่ล็อกอินอยู่โดยไม่ตั้งใจ) พร้อมพารามิเตอร์ guild_id +
  // disable_guild_select=true บอก Discord ให้ "ล็อก" ไว้ที่เซิร์ฟนี้เซิร์ฟเดียวเลย
  // ผู้ใช้ไม่ต้องมานั่งเลือกเซิร์ฟเองอีกรอบในหน้าเชิญ (ฟีเจอร์มาตรฐานของ Discord OAuth2)
  const inviteUrlForThisGuild = `${inviteUrl}&guild_id=${server.id}&disable_guild_select=true`;
  return `
    <div class="server-card server-card-no-bot">
      ${iconHtml}
      <div class="server-card-body">
        <div class="server-card-name">${nameHtml}</div>
        <div class="server-card-meta">ยังไม่มีบอทในเซิร์ฟนี้</div>
      </div>
      <a class="btn-invite" href="${escapeHtml(inviteUrlForThisGuild)}" target="_blank" rel="noopener noreferrer">
        เชิญบอท
      </a>
    </div>`;
}

/**
 * สร้างหน้า HTML เต็มๆ ของ Server Picker
 *
 * @param {object} params
 * @param {{id: string, username: string, avatar: string|null}} params.user ผู้ใช้ที่ login อยู่ (จาก req.session.user)
 * @param {Array<{
 *   id: string,
 *   name: string,
 *   iconUrl: string|null,
 *   hasBot: boolean,
 *   memberCount: number|null,   // null ถ้า hasBot เป็น false
 *   tier: 'free'|'premium'|null // null ถ้า hasBot เป็น false (เซิร์ฟที่ไม่มีบอทไม่มี tier ให้เช็ค)
 * }>} params.servers รายชื่อเซิร์ฟที่ผู้ใช้มีสิทธิ์ Manage Server (server.js กรองมาให้แล้ว)
 * @param {string} params.inviteUrl ลิงก์เชิญบอทแบบ "ยังไม่ระบุเซิร์ฟ" (server.js สร้างมาให้แล้วจาก buildInviteUrl())
 * @returns {string} HTML เต็มหน้า พร้อม res.send() ได้เลย
 */
function renderServerPickerPage({ user, servers, inviteUrl }) {
  const avatarUrl = user.avatar || defaultAvatarUrl(user.id);

  // แยกเป็น 2 กลุ่มเพื่อความชัดเจนในโค้ด (แม้จะ sort ไว้ตั้งแต่ server.js แล้วก็ตาม):
  // เซิร์ฟที่มีบอทอยู่แล้ว โชว์ก่อน แล้วค่อยเป็นเซิร์ฟที่ยังไม่มีบอท (ให้เชิญ) ต่อท้าย
  const cardsHtml = servers.length > 0
    ? servers.map((s) => serverCardHtml(s, inviteUrl)).join('')
    : `<div class="empty-state">
         <p>ไม่พบเซิร์ฟเวอร์ที่บัญชีนี้มีสิทธิ์ "Manage Server" เลยครับ</p>
         <p class="empty-state-sub">ต้องเป็นแอดมินหรือมีสิทธิ์จัดการเซิร์ฟก่อน ถึงจะตั้งค่าบอทผ่านหน้านี้ได้นะครับ</p>
       </div>`;

  return `<!DOCTYPE html>
<html lang="th" data-theme="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>เลือกเซิร์ฟเวอร์ — Aitao Bot Dashboard</title>
<style>
  /* ── ตัวแปรสี (CSS custom properties) ──────────────────────────────────
     ใช้ตัวแปรแทนใส่เลขสีตรงๆ ทุกจุด เพราะจะสลับมืด/สว่างได้แค่เปลี่ยนค่าตรงนี้
     ที่เดียว ไม่ต้องไล่แก้ทุกบรรทัดที่มีสีอยู่ — ค่าตอน data-theme="dark" (ค่าเริ่มต้น)
     ใช้โทนเดียวกับ Landing Page เป๊ะๆ ตามที่ระบุใน milo-bot-design-brief.md */
  :root, [data-theme="dark"] {
    --bg: #0a0e1a;
    --card: #131a2e;
    --card-hover: #1a2340;
    --border: rgba(255, 255, 255, 0.08);
    --text: #ffffff;
    --text-secondary: #a8adc4;
    --accent: #7c83fd;
    --gold: #f4b860;
  }
  [data-theme="light"] {
    --bg: #f5f7ff;
    --card: #ffffff;
    --card-hover: #eef0ff;
    --border: #e2e5f5;
    --text: #1a1d29;
    --text-secondary: #5b6178;
    --accent: #7c83fd;
    --gold: #c8862a; /* เข้มลงหน่อยตอนพื้นสว่าง ไม่งั้นทองอ่อนจะกลืนกับพื้นขาว อ่านยาก */
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Sarabun', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    transition: background 0.2s ease, color 0.2s ease;
  }

  /* ── แถบบนสุด ── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
  }
  .topbar-brand { font-weight: 700; font-size: 18px; color: var(--accent); }
  .topbar-right { display: flex; align-items: center; gap: 12px; }
  .theme-toggle {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }
  .user-chip { display: flex; align-items: center; gap: 8px; }
  .user-avatar { width: 32px; height: 32px; border-radius: 50%; }
  .user-name { font-size: 14px; }
  .logout-link {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 13px;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 10px;
  }
  .logout-link:hover { color: var(--text); }

  /* ── เนื้อหาหลัก ── */
  main { max-width: 880px; margin: 0 auto; padding: 40px 24px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .subtitle { color: var(--text-secondary); margin: 0 0 32px; font-size: 15px; }

  .server-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px;
  }

  .server-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
    text-decoration: none;
    color: var(--text);
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  a.server-card:hover { background: var(--card-hover); border-color: var(--accent); cursor: pointer; }
  .server-card-no-bot { flex-wrap: wrap; }

  .server-icon { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; object-fit: cover; }
  .server-icon-fallback {
    display: flex; align-items: center; justify-content: center;
    background: var(--accent); color: #fff; font-weight: 700; font-size: 18px;
  }

  .server-card-body { flex: 1; min-width: 0; }
  .server-card-name {
    font-weight: 600; font-size: 15px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .server-card-meta { color: var(--text-secondary); font-size: 13px; margin-top: 2px; }

  .badge {
    font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;
    white-space: nowrap; flex-shrink: 0;
  }
  .badge-free { background: var(--border); color: var(--text-secondary); }
  .badge-premium { background: var(--gold); color: #2a1d05; }

  .btn-invite {
    background: var(--accent); color: #fff; text-decoration: none;
    font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 8px;
    flex-shrink: 0;
  }
  .btn-invite:hover { opacity: 0.9; }

  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 48px 16px;
    color: var(--text-secondary);
  }
  .empty-state p { margin: 4px 0; }
  .empty-state-sub { font-size: 13px; }
</style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-brand">Aitao Bot</div>
    <div class="topbar-right">
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="สลับโหมดมืด/สว่าง">🌙</button>
      <div class="user-chip">
        <img class="user-avatar" src="${escapeHtml(avatarUrl)}" alt="" />
        <span class="user-name">${escapeHtml(user.username)}</span>
      </div>
      <a class="logout-link" href="/auth/logout">ออกจากระบบ</a>
    </div>
  </div>

  <main>
    <h1>เลือกเซิร์ฟเวอร์</h1>
    <p class="subtitle">เลือกเซิร์ฟที่ต้องการตั้งค่า Aitao Bot — โชว์เฉพาะเซิร์ฟที่คุณมีสิทธิ์ Manage Server เท่านั้นครับ</p>
    <div class="server-grid">
      ${cardsHtml}
    </div>
  </main>

  <script>
    // ── ปุ่มสลับโหมดมืด/สว่าง ──────────────────────────────────────────
    // เก็บค่าที่เลือกไว้ใน localStorage ของเบราว์เซอร์ผู้ใช้เอง (หน้านี้เป็นเว็บจริง
    // ที่รันบน Railway ไม่ใช่หน้าพรีวิวในแชท ใช้ localStorage ได้ปกติ ไม่มีข้อจำกัด)
    // เพื่อให้ครั้งหน้าที่เปิดเข้ามา ยังจำโหมดที่เลือกไว้ล่าสุดได้ ไม่ต้องกดสลับใหม่ทุกครั้ง
    (function () {
      var root = document.documentElement;
      var toggleBtn = document.getElementById('themeToggle');

      function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        toggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
      }

      var saved = null;
      try { saved = localStorage.getItem('aitao-dashboard-theme'); } catch (e) { /* บาง browser (เช่นโหมด private) อ่าน localStorage ไม่ได้ — ไม่เป็นไร ใช้ค่า default ไปก่อน */ }
      applyTheme(saved === 'light' ? 'light' : 'dark');

      toggleBtn.addEventListener('click', function () {
        var current = root.getAttribute('data-theme');
        var next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem('aitao-dashboard-theme', next); } catch (e) { /* เก็บไม่ได้ก็แค่ไม่จำข้ามครั้ง ไม่กระทบการใช้งานตอนนี้ */ }
      });
    })();
  </script>
</body>
</html>`;
}

module.exports = { renderServerPickerPage, escapeHtml, defaultAvatarUrl };
