// utils/renderWelcomeCard.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "Welcome Card" (task #16) — ตัวแก้ไขการ์ดต้อนรับจริงบนเว็บ คู่ขนานกับคำสั่ง
// /welcome-setup ใน Discord (commands/welcome-setup.js) ทุก field ในหน้านี้คือ field
// จริงที่ generateMemberCardImage()/canvasDrawHelpers.js ใช้เรนเดอร์การ์ดจริง ไม่มีการ
// เพิ่ม field มโนขึ้นมาเอง — สคีมาทั้งหมดยืนยันจากการอ่านโค้ดจริงของ welcome-setup.js +
// canvasDrawHelpers.js ก่อนเขียนไฟล์นี้ (ไม่ได้เดา):
//
//   enabled, channelId, backgroundUrl, overlayOpacity (0-100), avatarEnabled,
//   avatarX/avatarY (0-100%), avatarRadius (5-45%), greetingText (ข้อความจริงนอกรูป
//   รองรับ {user}/{username}/{server}), textBlocks[] แต่ละอันมี
//   { id, content, x(0-100), y(0-100), size(4-25), bold, fontStyle }
//
// จุดสำคัญที่ต่างจาก mockup Main.dc.html (ตัดสินใจเองพร้อมเหตุผล — mockup หน้านี้ทำตอน
// ยังไม่มีใครไปอ่านโค้ดจริงของ welcome-setup.js เลย เลยมโนบาง field ผิดไปจากของจริง):
//
//   1) 🚫 มอคอัพให้เลือกพื้นหลังจาก "การ์ด 3 แบบสำเร็จรูป" (gradient/GIF preset) — ของจริง
//      ไม่มีพื้นหลังสำเร็จรูปเลยสักแบบ! มีแค่ช่อง backgroundUrl เดียว (วาง URL รูปเอง) ถ้า
//      ว่างไว้บอทจะ fallback เป็น gradient เข้ม 3 สีอัตโนมัติเอง (ไม่ใช่ตัวเลือกที่กดได้)
//      เปลี่ยนเป็นช่องกรอก URL + รูปตัวอย่างเล็กๆ + ปุ่ม "ลบพื้นหลัง" แทน
//   2) 🚫 มอคอัพให้ตั้งสี/ความหนาต่อบล็อกได้อิสระ — ของจริง "สีตัวอักษรเป็นสีขาวเสมอ" (hardcode
//      ในโค้ดวาดภาพ ไม่มี field ให้ตั้งสีเลย) เอาตัวเลือกสีออกจากฟอร์ม
//   3) ➕ เพิ่ม 4 ส่วนที่ mockup ไม่มีเลยแต่จำเป็นจริงๆ (ไม่งั้นฟีเจอร์ใช้งานไม่ได้จริง):
//        - เลือกช่องที่จะส่ง (channelId) — ไม่มีช่องนี้ก็เปิดใช้งานไปก็ไม่มีอะไรถูกส่งเลย
//        - ตำแหน่ง/ขนาด avatar (avatarX/Y/Radius) — ของจริงปรับตำแหน่งได้ mockup ล็อกไว้ตายตัว
//        - ความทึบ overlay (overlayOpacity)
//        - ข้อความทักทาย (greetingText) — คนละอันกับข้อความที่วาดลงรูป (textBlocks) เป็น
//          เนื้อหาจริงของข้อความ Discord ที่ส่งคู่กับรูป รองรับ {user} (ping จริงได้)
//   4) พรีวิวฝั่งขวา — mockup วาดด้วย CSS/JS ในเบราว์เซอร์ล้วนๆ (แค่ประมาณหน้าตา ไม่ใช่ของจริง)
//      เวอร์ชันนี้เปลี่ยนเป็น "รูปที่เซิร์ฟเวอร์เรนเดอร์จริง" ผ่าน canvas เดียวกับที่บอทใช้ส่งจริง
//      (เรียก generateMemberCardImage() ตัวเดียวกับพรีวิวใน Discord) กดพิมพ์/ปรับค่าอะไรก็ยิง
//      คำขอไปเรนเดอร์ใหม่ (debounce ~600ms) แล้วเอารูปจริงมาโชว์ ไม่ใช่แค่ประมาณหน้าตาอีกต่อไป
//      ข้อดี: ไม่ต้องโหลดฟอนต์ Google Fonts/คำนวณตำแหน่งซ้ำฝั่งเบราว์เซอร์เหมือน mockup เลย
//      เพราะรูปที่เห็นคือรูปจริงที่บอทจะส่งเป๊ะๆ (WYSIWYG จริง ไม่ใช่ "ประมาณเอา")
//   5) 🚫 การอัปโหลดรูปพื้นหลังจากเครื่องโดยตรง — ของจริง (welcome-setup.js) ตอนนี้รับแค่
//      "วาง URL รูป" เท่านั้น ยังไม่ได้ต่อกับระบบอัปโหลดไฟล์ (utils/assetStorage.js มีอยู่จริง
//      แต่ไม่ได้ถูกเรียกใช้จาก welcome-setup.js เลยตอนนี้) หน้านี้เลยทำตามของจริงเป๊ะๆ คือรับ
//      แค่ URL ก่อน — ถ้าน้องหนาวอยากได้ปุ่ม "อัปโหลดจากเครื่อง" เพิ่ม บอกได้เลยครับ ทำเป็นขั้น
//      ต่อไปได้ (ต้องสร้างระบบเก็บไฟล์เพิ่มซึ่งไม่มีอยู่ในโค้ดจริงตอนนี้)
//   6) ตำแหน่ง/ขนาด avatar และ text block — ของจริงใน Discord ปรับด้วยปุ่ม "ขยับซ้าย/ขวา/
//      ขึ้น/ลง" ทีละนิด เวอร์ชันเว็บนี้เปลี่ยนเป็นช่องกรอกตัวเลขตรงๆ (0-100 / 4-25 ตามช่วงค่า
//      จริงที่โค้ด validate ไว้) เหมาะกับฟอร์มเว็บมากกว่า ได้ผลลัพธ์เหมือนกันทุกประการ
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');
const { renderDashboardLayout } = require('./dashboardShell');

const BASE_FONTS = [
  { value: 'default', label: 'Default (Mali / Fredoka)' },
  { value: 'kanit', label: 'Kanit' },
  { value: 'sarabun', label: 'Sarabun' },
  { value: 'charmonman', label: 'Charmonman' },
  { value: 'chonburi', label: 'Chonburi' },
];

/** ฝัง object ลงใน <script> อย่างปลอดภัย — เปลี่ยน "<" ทุกตัวเป็น < กัน </script> หลุดออกมา
 * กลางแท็ก (เผื่อมีคนพิมพ์ "</script>" ในข้อความบล็อก/ข้อความทักทายจริงๆ) */
function jsonScriptSafe(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * @param {object} opts
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {object} opts.config          welcome config ปัจจุบัน (จริงหรือค่า default)
 * @param {Array<{id:string,name:string}>} opts.channels   ช่องข้อความจริงของเซิร์ฟนี้
 * @param {Array<{id:string,label:string}>} opts.customFonts ฟอนต์ที่เซิร์ฟนี้อัปโหลดไว้จริง
 * @param {boolean} opts.isPremium
 */
function renderWelcomeCardPage({ guild, user, botAvatarUrl, botName, config, channels, customFonts, isPremium }) {
  const channelOptionsHtml = ['<option value="">No channel selected</option>']
    .concat(channels.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === config.channelId ? ' selected' : ''}>#${escapeHtml(c.name)}</option>`))
    .join('');

  const bodyHtml = `
    <div style="padding:32px 40px 80px;max-width:1180px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:22px;font-weight:700;color:var(--text);">Welcome Card</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">${escapeHtml(guild.name)} · Changes preview live on the right — click Save to make them real</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <button type="button" id="enabledToggle" onclick="toggleEnabled()" style="display:flex;align-items:center;gap:6px;background:none;border:1px solid var(--border);border-radius:999px;padding:7px 14px;cursor:pointer;">
            <span id="enabledDot" style="width:8px;height:8px;border-radius:999px;background:#6d7079;flex:0 0 auto;"></span>
            <span id="enabledLabel" style="font-size:12px;color:var(--text-muted);font-weight:600;">Disabled</span>
          </button>
          <button type="button" id="saveBtn" onclick="saveConfig()" style="height:38px;padding:0 22px;border-radius:4px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Save</button>
        </div>
      </div>
      <div id="channelWarning" style="display:none;margin-top:10px;font-size:12px;color:var(--gold);background:rgba(244,184,96,0.1);border:1px solid rgba(244,184,96,0.3);border-radius:4px;padding:8px 12px;">
        This card is enabled but no channel is selected yet — pick one below or new members won't get a welcome message.
      </div>

      <div style="margin-top:24px;display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">

        <!-- ── ฝั่งซ้าย: ฟอร์มตั้งค่าทั้งหมด ── -->
        <div style="flex:1 1 440px;min-width:340px;display:flex;flex-direction:column;gap:18px;">

          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:18px 20px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:10px;">Channel</div>
            <select id="channelSelect" onchange="onFieldChange()" style="width:100%;height:38px;border-radius:4px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:0 10px;">
              ${channelOptionsHtml}
            </select>
          </div>

          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:18px 20px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:10px;">Background image</div>
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <div id="bgThumb" style="width:64px;height:40px;border-radius:3px;border:1px solid var(--border);background:var(--bg) center/cover no-repeat;flex:0 0 auto;"></div>
              <div style="flex:1 1 auto;min-width:0;">
                <input type="text" id="backgroundUrlInput" oninput="onFieldChange()" placeholder="https://... (.png, .jpg, .webp or .gif)" style="width:100%;height:34px;border-radius:4px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:12.5px;padding:0 10px;" />
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
                  <span style="font-size:10.5px;color:var(--text-muted);">Leave empty for the default dark gradient</span>
                  <button type="button" onclick="clearBackground()" style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer;text-decoration:underline;">Clear</button>
                </div>
              </div>
            </div>
            <div style="font-size:10.5px;margin-top:8px;line-height:1.5;${isPremium ? 'color:var(--teal);' : 'color:var(--text-muted);'}">
              ${isPremium
                ? '✓ This server is Premium — animated .gif backgrounds are allowed.'
                : 'Animated .gif backgrounds require Premium — a .png/.jpg/.webp works on Free.'}
            </div>
          </div>

          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:18px 20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;">Overlay darkness</div>
              <span id="overlayOpacityReadout" style="font-size:12px;color:var(--text);font-weight:600;">50%</span>
            </div>
            <input type="range" id="overlayOpacityInput" min="0" max="100" oninput="onOverlayOpacityInput()" style="width:100%;accent-color:var(--accent);" />
          </div>

          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:18px 20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;">Avatar</div>
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);cursor:pointer;">
                <input type="checkbox" id="avatarEnabledInput" onchange="onFieldChange()" style="accent-color:var(--accent);" /> Show avatar
              </label>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:10px;">
              <label style="font-size:10.5px;color:var(--text-muted);">X position (%)
                <input type="number" id="avatarXInput" min="0" max="100" oninput="onFieldChange()" style="width:100%;height:32px;margin-top:4px;border-radius:4px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:12.5px;padding:0 8px;" />
              </label>
              <label style="font-size:10.5px;color:var(--text-muted);">Y position (%)
                <input type="number" id="avatarYInput" min="0" max="100" oninput="onFieldChange()" style="width:100%;height:32px;margin-top:4px;border-radius:4px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:12.5px;padding:0 8px;" />
              </label>
              <label style="font-size:10.5px;color:var(--text-muted);">Radius (5-45%)
                <input type="number" id="avatarRadiusInput" min="5" max="45" oninput="onFieldChange()" style="width:100%;height:32px;margin-top:4px;border-radius:4px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:12.5px;padding:0 8px;" />
              </label>
            </div>
          </div>

          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:18px 20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
              <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;">Text on the card</div>
              <button type="button" onclick="addBlock()" style="background:none;border:none;color:var(--accent);font-size:12.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Add text
              </button>
            </div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:10px;line-height:1.5;">
              Use <code style="background:rgba(255,255,255,0.06);border-radius:2px;padding:0 4px;">{username}</code> for the member's name. Text is always centered and white, like the real card.
              Need a custom font? Upload one from the <a href="/dashboard/${escapeHtml(guild.id)}/fonts" style="color:var(--accent);">Fonts page</a> first.
            </div>
            <div id="blocksContainer" style="display:flex;flex-direction:column;gap:10px;"></div>
          </div>

          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:18px 20px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px;">Greeting message</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:8px;line-height:1.5;">
              This is the real Discord message sent next to the card — separate from the text drawn on the image above.
              Placeholders: <code style="background:rgba(255,255,255,0.06);border-radius:2px;padding:0 4px;">{user}</code> (real @mention),
              <code style="background:rgba(255,255,255,0.06);border-radius:2px;padding:0 4px;">{username}</code>,
              <code style="background:rgba(255,255,255,0.06);border-radius:2px;padding:0 4px;">{server}</code>
            </div>
            <textarea id="greetingTextInput" oninput="onFieldChange()" rows="2" style="width:100%;border-radius:4px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:8px 10px;resize:vertical;font-family:inherit;"></textarea>
          </div>

        </div>

        <!-- ── ฝั่งขวา: พรีวิวจริงจากเซิร์ฟเวอร์ ── -->
        <div style="flex:0 0 460px;position:sticky;top:24px;">
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:5px;padding:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <span style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;">Live preview</span>
              <span id="previewStatus" style="font-size:10.5px;color:var(--text-muted);"></span>
            </div>
            <div style="position:relative;border-radius:4px;overflow:hidden;background:var(--bg);min-height:180px;display:flex;align-items:center;justify-content:center;">
              <img id="previewImg" alt="Welcome card preview" style="width:100%;display:block;" />
              <div id="previewDisabledOverlay" style="display:none;position:absolute;inset:0;background:rgba(5,7,15,0.6);align-items:center;justify-content:center;">
                <span style="font-size:12px;color:#c3c8e6;font-weight:600;background:rgba(5,7,15,0.85);border:1px solid var(--border);border-radius:999px;padding:8px 16px;">Disabled — new members won't see this</span>
              </div>
            </div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:10px;line-height:1.5;">
              This is rendered by the same code the bot uses for real — what you see here is exactly what members will get.
            </div>
          </div>
        </div>

      </div>
    </div>

    <div id="wcToast" style="display:none;position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(10px);background:#1b2338;border:1px solid #2c3559;border-radius:999px;padding:10px 20px;font-size:12.5px;color:var(--text);box-shadow:0 12px 28px rgba(0,0,0,0.4);z-index:60;opacity:0;transition:opacity .2s ease, transform .2s ease;align-items:center;gap:8px;max-width:420px;">
      <span id="wcToastText"></span>
    </div>`;

  const initialData = {
    guildId: guild.id,
    config,
    baseFonts: BASE_FONTS,
    customFonts,
  };

  return renderDashboardLayout({
    title: `Welcome Card — ${guild.name} — Aitao Bot`,
    guild,
    user,
    activeKey: 'welcome',
    botAvatarUrl,
    botName,
    bodyHtml,
  }) + `
<script>
  var INITIAL = ${jsonScriptSafe(initialData)};
  var GUILD_ID = INITIAL.guildId;
  var BASE_FONTS = INITIAL.baseFonts;
  var CUSTOM_FONTS = INITIAL.customFonts;

  // draft = สถานะที่กำลังแก้ไขอยู่ในเบราว์เซอร์ตอนนี้ (ยังไม่ได้บันทึกจนกว่าจะกด Save)
  var draft = JSON.parse(JSON.stringify(INITIAL.config));
  var nextBlockSeq = 1;

  // ── toast แจ้งเตือนกลางจอ — pattern เดียวกับทุกหน้าอื่นของแดชบอร์ด ──────────────
  var toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById('wcToast');
    document.getElementById('wcToastText').textContent = message;
    toast.style.display = 'flex';
    requestAnimationFrame(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(function () { toast.style.display = 'none'; }, 220);
    }, 2600);
  }

  // ── หัวข้อ: enabled toggle ──────────────────────────────────────────────────
  function renderEnabledToggle() {
    var dot = document.getElementById('enabledDot');
    var label = document.getElementById('enabledLabel');
    dot.style.background = draft.enabled ? '#4b8f87' : '#6d7079';
    label.textContent = draft.enabled ? 'Enabled' : 'Disabled';
    document.getElementById('previewDisabledOverlay').style.display = draft.enabled ? 'none' : 'flex';
    document.getElementById('channelWarning').style.display = (draft.enabled && !draft.channelId) ? 'block' : 'none';
  }
  function toggleEnabled() {
    draft.enabled = !draft.enabled;
    renderEnabledToggle();
  }

  // ── ฟอร์มฝั่งซ้าย: อ่านค่าฟอร์มปัจจุบันกลับเข้า draft แล้วยิงพรีวิวใหม่ ──────────
  function onFieldChange() {
    draft.channelId = document.getElementById('channelSelect').value || null;
    draft.backgroundUrl = document.getElementById('backgroundUrlInput').value.trim() || null;
    draft.avatarEnabled = document.getElementById('avatarEnabledInput').checked;
    draft.avatarX = clampInt(document.getElementById('avatarXInput').value, 0, 100, draft.avatarX);
    draft.avatarY = clampInt(document.getElementById('avatarYInput').value, 0, 100, draft.avatarY);
    draft.avatarRadius = clampInt(document.getElementById('avatarRadiusInput').value, 5, 45, draft.avatarRadius);
    draft.greetingText = document.getElementById('greetingTextInput').value;
    updateBackgroundThumb();
    renderEnabledToggle();
    schedulePreviewRefresh();
  }
  function onOverlayOpacityInput() {
    var v = clampInt(document.getElementById('overlayOpacityInput').value, 0, 100, draft.overlayOpacity);
    draft.overlayOpacity = v;
    document.getElementById('overlayOpacityReadout').textContent = v + '%';
    schedulePreviewRefresh();
  }
  function clampInt(raw, min, max, fallback) {
    var n = parseInt(raw, 10);
    if (isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }
  function clearBackground() {
    draft.backgroundUrl = null;
    document.getElementById('backgroundUrlInput').value = '';
    updateBackgroundThumb();
    schedulePreviewRefresh();
  }
  function updateBackgroundThumb() {
    var thumb = document.getElementById('bgThumb');
    // JSON.stringify ใส่เครื่องหมายคำพูดคู่ + escape ให้เอง ปลอดภัยกว่ามาต่อ string เองตรงๆ
    thumb.style.backgroundImage = draft.backgroundUrl ? 'url(' + JSON.stringify(draft.backgroundUrl) + ')' : 'none';
  }

  // ── บล็อกข้อความ (เพิ่ม/ลบ/ทำซ้ำ/เลื่อนลำดับ/แก้ค่า) ─────────────────────────
  function fontOptionsHtml(selected) {
    var html = '';
    BASE_FONTS.forEach(function (f) {
      html += '<option value="' + f.value + '"' + (f.value === selected ? ' selected' : '') + '>' + f.label + '</option>';
    });
    if (CUSTOM_FONTS.length > 0) {
      html += '<optgroup label="This server\\'s fonts">';
      CUSTOM_FONTS.forEach(function (f) {
        var value = 'customFont:' + f.id;
        html += '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>' + escapeText(f.label) + '</option>';
      });
      html += '</optgroup>';
    }
    return html;
  }
  function escapeText(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function blockRowHtml(b, index, total) {
    return (
      '<div class="wc-block-row" style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:12px;">' +
        '<div style="display:flex;gap:8px;align-items:flex-start;">' +
          '<textarea rows="2" oninput="updateBlockField(\\'' + b.id + '\\',\\'content\\',this.value)" style="flex:1 1 auto;min-width:0;background:var(--bg-card);border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:12.5px;padding:6px 8px;resize:vertical;font-family:inherit;">' + escapeText(b.content) + '</textarea>' +
          '<div style="display:flex;flex-direction:column;gap:4px;flex:0 0 auto;">' +
            '<button type="button" title="Move up" onclick="moveBlock(\\'' + b.id + '\\',-1)" ' + (index === 0 ? 'disabled' : '') + ' style="background:none;border:1px solid var(--border);border-radius:3px;width:24px;height:22px;color:var(--text-muted);cursor:pointer;font-size:11px;">&uarr;</button>' +
            '<button type="button" title="Move down" onclick="moveBlock(\\'' + b.id + '\\',1)" ' + (index === total - 1 ? 'disabled' : '') + ' style="background:none;border:1px solid var(--border);border-radius:3px;width:24px;height:22px;color:var(--text-muted);cursor:pointer;font-size:11px;">&darr;</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center;">' +
          '<select onchange="updateBlockField(\\'' + b.id + '\\',\\'fontStyle\\',this.value)" style="height:30px;border-radius:3px;background:var(--bg-card);border:1px solid var(--border);color:var(--text);font-size:11.5px;padding:0 6px;flex:1 1 140px;">' + fontOptionsHtml(b.fontStyle) + '</select>' +
          '<button type="button" onclick="toggleBlockBold(\\'' + b.id + '\\')" style="width:32px;height:30px;border-radius:3px;flex:0 0 auto;font-size:11px;font-weight:700;' + (b.bold ? 'background:rgba(124,131,253,0.18);border:1px solid var(--accent);color:var(--accent);' : 'background:var(--bg-card);border:1px solid var(--border);color:var(--text-muted);') + '">B</button>' +
          '<label style="font-size:10px;color:var(--text-muted);">Size<input type="number" min="4" max="25" value="' + b.size + '" oninput="updateBlockField(\\'' + b.id + '\\',\\'size\\',this.value)" style="width:46px;height:30px;margin-left:4px;border-radius:3px;background:var(--bg-card);border:1px solid var(--border);color:var(--text);font-size:11.5px;padding:0 6px;" /></label>' +
          '<label style="font-size:10px;color:var(--text-muted);">X<input type="number" min="0" max="100" value="' + b.x + '" oninput="updateBlockField(\\'' + b.id + '\\',\\'x\\',this.value)" style="width:46px;height:30px;margin-left:4px;border-radius:3px;background:var(--bg-card);border:1px solid var(--border);color:var(--text);font-size:11.5px;padding:0 6px;" /></label>' +
          '<label style="font-size:10px;color:var(--text-muted);">Y<input type="number" min="0" max="100" value="' + b.y + '" oninput="updateBlockField(\\'' + b.id + '\\',\\'y\\',this.value)" style="width:46px;height:30px;margin-left:4px;border-radius:3px;background:var(--bg-card);border:1px solid var(--border);color:var(--text);font-size:11.5px;padding:0 6px;" /></label>' +
          '<button type="button" title="Duplicate" onclick="duplicateBlock(\\'' + b.id + '\\')" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:3px;height:30px;padding:0 8px;color:var(--text-muted);cursor:pointer;font-size:11px;">Duplicate</button>' +
          '<button type="button" title="Delete" onclick="deleteBlock(\\'' + b.id + '\\')" style="background:none;border:1px solid rgba(229,103,122,0.4);border-radius:3px;height:30px;padding:0 8px;color:#e5677a;cursor:pointer;font-size:11px;">Delete</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderBlocks() {
    var container = document.getElementById('blocksContainer');
    container.innerHTML = draft.textBlocks.map(function (b, i) { return blockRowHtml(b, i, draft.textBlocks.length); }).join('');
  }

  function findBlock(id) {
    for (var i = 0; i < draft.textBlocks.length; i++) if (draft.textBlocks[i].id === id) return draft.textBlocks[i];
    return null;
  }

  function updateBlockField(id, field, rawValue) {
    var b = findBlock(id);
    if (!b) return;
    if (field === 'size') b[field] = clampInt(rawValue, 4, 25, b.size);
    else if (field === 'x' || field === 'y') b[field] = clampInt(rawValue, 0, 100, b[field]);
    else b[field] = rawValue;
    schedulePreviewRefresh();
    // ไม่ re-render ทั้งชุดตอนพิมพ์ข้อความ/ตัวเลข กัน textarea/input ที่กำลังโฟกัสอยู่หลุด —
    // re-render เต็มรูปแบบแค่ตอนโครงสร้างเปลี่ยน (เพิ่ม/ลบ/ทำซ้ำ/เลื่อนลำดับ/สลับฟอนต์/ตัวหนา)
  }
  function toggleBlockBold(id) {
    var b = findBlock(id);
    if (!b) return;
    b.bold = !b.bold;
    renderBlocks();
    schedulePreviewRefresh();
  }
  function addBlock() {
    draft.textBlocks.push({ id: 'tb_new_' + Date.now() + '_' + (nextBlockSeq++), content: 'New text', x: 50, y: 50, size: 8, bold: false, fontStyle: 'default' });
    renderBlocks();
    schedulePreviewRefresh();
  }
  function duplicateBlock(id) {
    var idx = draft.textBlocks.findIndex(function (b) { return b.id === id; });
    if (idx === -1) return;
    var copy = Object.assign({}, draft.textBlocks[idx]);
    copy.id = 'tb_new_' + Date.now() + '_' + (nextBlockSeq++);
    draft.textBlocks.splice(idx + 1, 0, copy);
    renderBlocks();
    schedulePreviewRefresh();
  }
  function moveBlock(id, delta) {
    var idx = draft.textBlocks.findIndex(function (b) { return b.id === id; });
    var target = idx + delta;
    if (idx === -1 || target < 0 || target >= draft.textBlocks.length) return;
    var tmp = draft.textBlocks[idx];
    draft.textBlocks[idx] = draft.textBlocks[target];
    draft.textBlocks[target] = tmp;
    renderBlocks();
    schedulePreviewRefresh();
  }
  function deleteBlock(id) {
    if (draft.textBlocks.length <= 1) {
      showToast("You need at least one text block — can't delete the last one.");
      return;
    }
    draft.textBlocks = draft.textBlocks.filter(function (b) { return b.id !== id; });
    renderBlocks();
    schedulePreviewRefresh();
  }

  // ── พรีวิวจริง — ยิงไป endpoint /preview พร้อม draft ปัจจุบัน เอา PNG จริงกลับมาโชว์ ──
  var previewTimer = null;
  var previewRequestSeq = 0;
  var currentPreviewObjectUrl = null;
  function schedulePreviewRefresh() {
    if (previewTimer) clearTimeout(previewTimer);
    document.getElementById('previewStatus').textContent = 'Updating…';
    previewTimer = setTimeout(refreshPreviewNow, 600);
  }
  async function refreshPreviewNow() {
    var mySeq = ++previewRequestSeq;
    try {
      var res = await fetch('/dashboard/' + GUILD_ID + '/welcome/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (mySeq !== previewRequestSeq) return; // มีคำขอใหม่กว่าแซงไปแล้ว ทิ้งผลอันเก่านี้
      if (!res.ok) {
        document.getElementById('previewStatus').textContent = 'Preview failed';
        return;
      }
      var blob = await res.blob();
      if (mySeq !== previewRequestSeq) return;
      var url = URL.createObjectURL(blob);
      var oldUrl = currentPreviewObjectUrl;
      document.getElementById('previewImg').src = url;
      currentPreviewObjectUrl = url;
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      document.getElementById('previewStatus').textContent = '';
    } catch (err) {
      if (mySeq === previewRequestSeq) document.getElementById('previewStatus').textContent = 'Preview failed';
    }
  }

  // ── บันทึกจริง ──────────────────────────────────────────────────────────────
  async function saveConfig() {
    var btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      var res = await fetch('/dashboard/' + GUILD_ID + '/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        showToast((data.errors && data.errors[0]) || 'Could not save — please check your settings.');
        return;
      }
      showToast('Welcome card saved!');
    } catch (err) {
      showToast('Could not reach the server — please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  }

  // ── ตั้งค่าฟอร์มเริ่มต้นจาก config ที่โหลดมา แล้วยิงพรีวิวแรกทันที ──────────────
  document.getElementById('channelSelect').value = draft.channelId || '';
  document.getElementById('backgroundUrlInput').value = draft.backgroundUrl || '';
  document.getElementById('avatarEnabledInput').checked = draft.avatarEnabled;
  document.getElementById('avatarXInput').value = draft.avatarX;
  document.getElementById('avatarYInput').value = draft.avatarY;
  document.getElementById('avatarRadiusInput').value = draft.avatarRadius;
  document.getElementById('overlayOpacityInput').value = draft.overlayOpacity;
  document.getElementById('overlayOpacityReadout').textContent = draft.overlayOpacity + '%';
  document.getElementById('greetingTextInput').value = draft.greetingText;
  updateBackgroundThumb();
  renderEnabledToggle();
  renderBlocks();
  refreshPreviewNow();
</script>`;
}

module.exports = { renderWelcomeCardPage };
