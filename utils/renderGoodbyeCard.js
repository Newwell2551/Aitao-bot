// utils/renderGoodbyeCard.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "Goodbye Card" — ตัวแก้ไขการ์ดบอกลาจริงบนเว็บ คู่ขนานกับคำสั่ง /goodbye-setup
// ใน Discord (commands/goodbye-setup.js) โครงสร้างหน้านี้ก๊อปมาจาก utils/renderWelcomeCard.js
// เกือบทั้งหมด (ฟอร์ม/พรีวิวสด/บันทึกจริง ทำงานแบบเดียวกันทุกจุด) เขียนแยกไฟล์เพราะ
// สคีมาจริงของการ์ดบอกลา "ไม่เหมือนการ์ดต้อนรับเป๊ะๆ" อยู่ 2 จุด (ยืนยันจากการอ่านโค้ดจริงของ
// commands/goodbye-setup.js ก่อนเขียน ไม่ได้เดา):
//
//   1) ❗ ชื่อ field ข้อความนอกรูปคือ "farewellText" ไม่ใช่ "greetingText" เหมือนการ์ดต้อนรับ
//   2) ❗ farewellText รองรับ placeholder แค่ {username}/{server} เท่านั้น — ไม่มี {user}
//      (ไม่ยอมให้ ping จริงได้เลย เพราะคนออกจากเซิร์ฟไปแล้ว ping ไปก็ไม่มีความหมาย/อาจดูแปลกๆ)
//      ส่วน field อื่นๆ ทั้งหมด (enabled, channelId, backgroundUrl, overlayOpacity, avatarEnabled,
//      avatarX/Y/Radius, textBlocks[]) เหมือนการ์ดต้อนรับทุกประการ
//
// 🆕 [21 ต.ค. 2569] หน้านี้สร้างใหม่ทั้งหน้า (ของเดิมเป็นแค่หน้า "เร็วๆ นี้" ชั่วคราวจาก
// dashboardShell.js) เลยใช้ดีไซน์ธีม "เกมมิ่งพรีเมียม" (Layer List + สไลเดอร์แคปซูล) ของ
// Welcome Card เวอร์ชันล่าสุดตั้งแต่แรกเลย (ไม่ต้องมีเวอร์ชันเก่าให้ไล่แก้ทีหลัง) ต่างจาก
// Welcome Card แค่จุดสี — ใส่โทนอุ่น (น้ำตาล/ส้มเข้ม) จางๆ มาเน้นที่กรอบพรีวิวฝั่งขวา ให้
// ความรู้สึก "การจากลา" ต่างจากโทนม่วงฟ้าเย็นของ Welcome Card ตามสเปคที่ขอ ("exit states
// gracefully") — ใช้ไล่สีชุดเดียวกับสไลด์ "การ์ดบอกลา" ในหน้า Overview เป๊ะๆ
// (ดู GOODBYE_GRADIENT ใน utils/renderOverview.js) ไม่ได้คิดสีใหม่ลอยๆ ให้เว็บดูสีสันกระจัดกระจาย
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

function jsonScriptSafe(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * @param {object} opts
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {object} opts.config          goodbye config ปัจจุบัน (จริงหรือค่า default)
 * @param {Array<{id:string,name:string}>} opts.channels   ช่องข้อความจริงของเซิร์ฟนี้
 * @param {Array<{id:string,label:string}>} opts.customFonts ฟอนต์ที่เซิร์ฟนี้อัปโหลดไว้จริง
 * @param {boolean} opts.isPremium
 */
function renderGoodbyeCardPage({ guild, user, botAvatarUrl, botName, config, channels, customFonts, isPremium }) {
  const channelOptionsHtml = ['<option value="">No channel selected</option>']
    .concat(channels.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === config.channelId ? ' selected' : ''}>#${escapeHtml(c.name)}</option>`))
    .join('');

  const bodyHtml = `
    <div style="padding:32px 40px 80px;max-width:1180px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:22px;font-weight:700;color:var(--text);">Goodbye Card</div>
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
        This card is enabled but no channel is selected yet — pick one below or members who leave won't trigger a message.
      </div>

      <div style="margin-top:24px;display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">

        <!-- ── ฝั่งซ้าย: ฟอร์มตั้งค่าทั้งหมด (เหมือน Welcome Card ทุกจุด ต่างแค่ field ข้อความ) ── -->
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
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;">Overlay darkness</div>
              <span id="overlayOpacityReadout" style="font-size:12px;color:var(--text);font-weight:600;">50%</span>
            </div>
            <input type="range" id="overlayOpacityInput" class="capsule-range" min="0" max="100" oninput="onOverlayOpacityInput()" />
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
            <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px;">Farewell message</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:8px;line-height:1.5;">
              This is the real Discord message sent next to the card — separate from the text drawn on the image above.
              Placeholders: <code style="background:rgba(255,255,255,0.06);border-radius:2px;padding:0 4px;">{username}</code>,
              <code style="background:rgba(255,255,255,0.06);border-radius:2px;padding:0 4px;">{server}</code>
              — unlike the welcome card, there's no real @mention here since the member has already left.
            </div>
            <textarea id="farewellTextInput" oninput="onFieldChange()" rows="2" style="width:100%;border-radius:4px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:13px;padding:8px 10px;resize:vertical;font-family:inherit;"></textarea>
          </div>

        </div>

        <!-- ── ฝั่งขวา: พรีวิวจริงจากเซิร์ฟเวอร์ — ใส่โทนอุ่น (น้ำตาล/ส้ม) จางๆ รอบกรอบ ให้
             ความรู้สึก "การจากลา" ต่างจากโทนม่วงฟ้าเย็นของหน้า Welcome Card (ใช้ไล่สีชุดเดียวกับ
             สไลด์ "การ์ดบอกลา" ของหน้า Overview เป๊ะๆ ไม่ได้คิดสีใหม่ลอยๆ) ── -->
        <div style="flex:0 0 460px;position:sticky;top:24px;">
          <div style="background:var(--bg-card);border:1px solid rgba(217,139,94,0.28);border-radius:5px;padding:16px;box-shadow:0 0 28px rgba(217,139,94,0.08);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <span style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;">Live preview</span>
              <span id="previewStatus" style="font-size:10.5px;color:var(--text-muted);"></span>
            </div>
            <div style="position:relative;border-radius:4px;overflow:hidden;background:var(--bg);min-height:180px;display:flex;align-items:center;justify-content:center;">
              <img id="previewImg" alt="Goodbye card preview" style="width:100%;display:block;" />
              <div id="previewDisabledOverlay" style="display:none;position:absolute;inset:0;background:rgba(5,7,15,0.6);align-items:center;justify-content:center;">
                <span style="font-size:12px;color:#c3c8e6;font-weight:600;background:rgba(5,7,15,0.85);border:1px solid var(--border);border-radius:999px;padding:8px 16px;">Disabled — members who leave won't trigger this</span>
              </div>
            </div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:10px;line-height:1.5;">
              This is rendered by the same code the bot uses for real — what you see here is exactly what gets posted when a member leaves.
            </div>
          </div>
        </div>

      </div>
    </div>

    <div id="gcToast" style="display:none;position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(10px);background:#1b2338;border:1px solid #2c3559;border-radius:999px;padding:10px 20px;font-size:12.5px;color:var(--text);box-shadow:0 12px 28px rgba(0,0,0,0.4);z-index:60;opacity:0;transition:opacity .2s ease, transform .2s ease;align-items:center;gap:8px;max-width:420px;">
      <span id="gcToastText"></span>
    </div>`;

  const initialData = {
    guildId: guild.id,
    config,
    baseFonts: BASE_FONTS,
    customFonts,
  };

  return renderDashboardLayout({
    title: `Goodbye Card — ${guild.name} — Aitao Bot`,
    guild,
    user,
    activeKey: 'goodbye',
    botAvatarUrl,
    botName,
    bodyHtml,
  }) + `
<script>
  var INITIAL = ${jsonScriptSafe(initialData)};
  var GUILD_ID = INITIAL.guildId;
  var BASE_FONTS = INITIAL.baseFonts;
  var CUSTOM_FONTS = INITIAL.customFonts;

  var draft = JSON.parse(JSON.stringify(INITIAL.config));
  var nextBlockSeq = 1;

  var toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById('gcToast');
    document.getElementById('gcToastText').textContent = message;
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

  function onFieldChange() {
    draft.channelId = document.getElementById('channelSelect').value || null;
    draft.backgroundUrl = document.getElementById('backgroundUrlInput').value.trim() || null;
    draft.avatarEnabled = document.getElementById('avatarEnabledInput').checked;
    draft.avatarX = clampInt(document.getElementById('avatarXInput').value, 0, 100, draft.avatarX);
    draft.avatarY = clampInt(document.getElementById('avatarYInput').value, 0, 100, draft.avatarY);
    draft.avatarRadius = clampInt(document.getElementById('avatarRadiusInput').value, 5, 45, draft.avatarRadius);
    // ❗ farewellText ไม่ใช่ greetingText — ต่างจาก Welcome Card ตรงนี้จุดเดียว (ดูคอมเมนต์หัวไฟล์)
    draft.farewellText = document.getElementById('farewellTextInput').value;
    updateBackgroundThumb();
    renderEnabledToggle();
    schedulePreviewRefresh();
  }
  function onOverlayOpacityInput() {
    var v = clampInt(document.getElementById('overlayOpacityInput').value, 0, 100, draft.overlayOpacity);
    draft.overlayOpacity = v;
    document.getElementById('overlayOpacityReadout').textContent = v + '%';
    updateOverlaySliderFill(v);
    schedulePreviewRefresh();
  }
  function updateOverlaySliderFill(v) {
    document.getElementById('overlayOpacityInput').style.setProperty('--range-pct', v + '%');
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
    thumb.style.backgroundImage = draft.backgroundUrl ? 'url(' + JSON.stringify(draft.backgroundUrl) + ')' : 'none';
  }

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
  function fontLabelFor(value) {
    for (var i = 0; i < BASE_FONTS.length; i++) if (BASE_FONTS[i].value === value) return BASE_FONTS[i].label;
    for (var j = 0; j < CUSTOM_FONTS.length; j++) if (('customFont:' + CUSTOM_FONTS[j].id) === value) return CUSTOM_FONTS[j].label;
    return 'Default (Mali / Fredoka)';
  }

  var TEXT_LAYER_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 6h14M12 6v13M9 19h6" stroke="#9aa2c4" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var TRASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a1.5 1.5 0 0 1-1.5 1.4H9.3a1.5 1.5 0 0 1-1.5-1.4L7 7h10z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function blockRowHtml(b, index, total) {
    var boldBadge = b.bold ? '<span class="pill-badge" style="background:rgba(244,184,96,0.14);border-color:rgba(244,184,96,0.35);color:#f4b860;">Bold</span>' : '';
    return (
      '<div class="layer-row" style="padding:12px 14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          TEXT_LAYER_ICON +
          '<span class="pill-badge" id="fontBadge_' + b.id + '">' + escapeText(fontLabelFor(b.fontStyle)) + '</span>' +
          boldBadge +
          '<div style="flex:1 1 auto;"></div>' +
          '<button type="button" title="Move up" onclick="moveBlock(\\'' + b.id + '\\',-1)" ' + (index === 0 ? 'disabled' : '') + ' style="background:none;border:1px solid var(--glass-border);border-radius:5px;width:24px;height:22px;color:var(--text-muted);cursor:pointer;font-size:11px;">&uarr;</button>' +
          '<button type="button" title="Move down" onclick="moveBlock(\\'' + b.id + '\\',1)" ' + (index === total - 1 ? 'disabled' : '') + ' style="background:none;border:1px solid var(--glass-border);border-radius:5px;width:24px;height:22px;color:var(--text-muted);cursor:pointer;font-size:11px;">&darr;</button>' +
          '<button type="button" title="Delete this text layer" onclick="deleteBlock(\\'' + b.id + '\\')" class="neon-trash" style="width:26px;height:24px;">' + TRASH_ICON + '</button>' +
        '</div>' +
        '<textarea rows="2" oninput="updateBlockField(\\'' + b.id + '\\',\\'content\\',this.value)" style="width:100%;margin-top:10px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);border-radius:6px;color:var(--text);font-size:13px;padding:8px 9px;resize:vertical;font-family:inherit;">' + escapeText(b.content) + '</textarea>' +
        '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;align-items:center;">' +
          '<select onchange="updateBlockField(\\'' + b.id + '\\',\\'fontStyle\\',this.value)" style="height:30px;border-radius:5px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);color:var(--text);font-size:11.5px;padding:0 6px;flex:1 1 140px;">' + fontOptionsHtml(b.fontStyle) + '</select>' +
          '<button type="button" onclick="toggleBlockBold(\\'' + b.id + '\\')" style="width:32px;height:30px;border-radius:5px;flex:0 0 auto;font-size:11px;font-weight:700;' + (b.bold ? 'background:rgba(124,131,253,0.18);border:1px solid var(--accent);color:var(--accent);' : 'background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);color:var(--text-muted);') + '">B</button>' +
          '<label style="font-size:10px;color:var(--text-muted);">Size<input type="number" min="4" max="25" value="' + b.size + '" oninput="updateBlockField(\\'' + b.id + '\\',\\'size\\',this.value)" style="width:46px;height:30px;margin-left:4px;border-radius:5px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);color:var(--text);font-size:11.5px;padding:0 6px;" /></label>' +
          '<label style="font-size:10px;color:var(--text-muted);">X<input type="number" min="0" max="100" value="' + b.x + '" oninput="updateBlockField(\\'' + b.id + '\\',\\'x\\',this.value)" style="width:46px;height:30px;margin-left:4px;border-radius:5px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);color:var(--text);font-size:11.5px;padding:0 6px;" /></label>' +
          '<label style="font-size:10px;color:var(--text-muted);">Y<input type="number" min="0" max="100" value="' + b.y + '" oninput="updateBlockField(\\'' + b.id + '\\',\\'y\\',this.value)" style="width:46px;height:30px;margin-left:4px;border-radius:5px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);color:var(--text);font-size:11.5px;padding:0 6px;" /></label>' +
          '<button type="button" title="Duplicate" onclick="duplicateBlock(\\'' + b.id + '\\')" style="margin-left:auto;background:none;border:1px solid var(--glass-border);border-radius:5px;height:30px;padding:0 8px;color:var(--text-muted);cursor:pointer;font-size:11px;">Duplicate</button>' +
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
    if (field === 'fontStyle') {
      var badgeEl = document.getElementById('fontBadge_' + id);
      if (badgeEl) badgeEl.textContent = fontLabelFor(rawValue);
    }
    schedulePreviewRefresh();
  }
  function toggleBlockBold(id) {
    var b = findBlock(id);
    if (!b) return;
    b.bold = !b.bold;
    renderBlocks();
    schedulePreviewRefresh();
  }
  function addBlock() {
    draft.textBlocks.push({ id: 'tb_new_' + Date.now() + '_' + (nextBlockSeq++), content: 'Goodbye {username} 👋', x: 50, y: 72, size: 12, bold: false, fontStyle: 'default' });
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
      var res = await fetch('/dashboard/' + GUILD_ID + '/goodbye/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (mySeq !== previewRequestSeq) return;
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

  async function saveConfig() {
    var btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      var res = await fetch('/dashboard/' + GUILD_ID + '/goodbye', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        showToast((data.errors && data.errors[0]) || 'Could not save — please check your settings.');
        return;
      }
      showToast('Goodbye card saved!');
    } catch (err) {
      showToast('Could not reach the server — please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  }

  document.getElementById('channelSelect').value = draft.channelId || '';
  document.getElementById('backgroundUrlInput').value = draft.backgroundUrl || '';
  document.getElementById('avatarEnabledInput').checked = draft.avatarEnabled;
  document.getElementById('avatarXInput').value = draft.avatarX;
  document.getElementById('avatarYInput').value = draft.avatarY;
  document.getElementById('avatarRadiusInput').value = draft.avatarRadius;
  document.getElementById('overlayOpacityInput').value = draft.overlayOpacity;
  document.getElementById('overlayOpacityReadout').textContent = draft.overlayOpacity + '%';
  updateOverlaySliderFill(draft.overlayOpacity);
  document.getElementById('farewellTextInput').value = draft.farewellText;
  updateBackgroundThumb();
  renderEnabledToggle();
  renderBlocks();
  refreshPreviewNow();
</script>`;
}

module.exports = { renderGoodbyeCardPage };
