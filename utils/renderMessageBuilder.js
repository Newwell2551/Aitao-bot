// utils/renderMessageBuilder.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "Message Builder" — สร้าง/แก้ไขข้อความประกาศแบบมีบล็อกได้จริงบนเว็บ คู่ขนานกับคำสั่ง
// /builder ใน Discord (commands/builder.js) ใช้ storage ตัวเดียวกัน (utils/builderStorage.js
// → data/drafts.json) เปลี่ยนจากฝั่งไหนก็เห็นผลตรงกันหมด ไม่มีระบบซ้อนทับกัน
//
// 🔑 ขอบเขตที่ทำเต็มรูปแบบ vs ที่ตัดไว้ (ตัดสินใจเองพร้อมเหตุผล บอกตรงๆ — ยืนยันจากโค้ดจริงของ
// commands/builder.js + utils/buildMessageFromSchema.js ก่อนเขียน ไม่ได้เดา):
//   ✅ รายการ draft จริง / สร้างใหม่ / ลบ — ของจริง 100%
//   ✅ แก้ไข block type "text", "separator", "gallery" (รูปภาพ), "section_button" (ข้อความ+
//      ปุ่มลิงก์) — 4 ชนิดที่ไม่ต้องพึ่งข้อมูลยศ/ช่องของเซิร์ฟ แก้ได้ตรงไปตรงมาบนเว็บ
//   ✅ Free vs Premium gating ของจริง: ฟรีจำกัด 1 draft/เซิร์ฟ (FREE_BUILDER_LIMIT) และ
//      โครงสร้างบล็อกล็อกตายตัว 2 บล็อก (text + gallery — "Simple Panel") ห้ามเพิ่ม/ลบ/
//      เรียงลำดับใหม่ พรีเมียมเพิ่ม/ลบ/เรียงลำดับได้อิสระ ("Full Panel") — ตรงกับของจริงเป๊ะๆ
//   ✅ ห้าม mention (@role/@user/@everyone/@here/#channel) ในข้อความของเซิร์ฟ Free — เช็คจริง
//      ตอนบันทึก (ของจริงกันไว้เพราะไม่อยากให้ฟรีเอาไปใช้แทนระบบประกาศแบบเต็มที่สงวนไว้พรีเมียม)
//   🚫 block type "section" (รูป+ข้อความ ไม่มีปุ่ม), "section_role_button" (ปุ่มติดยศ),
//      "section_channel_button" (ปุ่มลิงก์ไปช่อง) — ยังแก้/สร้างใหม่บนเว็บไม่ได้ (ต้องพึ่ง
//      role/channel picker ของ Discord) ถ้า draft มีบล็อกพวกนี้อยู่แล้ว (สร้างจาก Discord)
//      พรีวิวฝั่งขวาจะโชว์ให้ถูกต้องเหมือนเดิม แต่ฝั่งซ้ายจะเป็นการ์ด "แก้ได้แค่ใน Discord"
//      (ลบได้ แต่แก้เนื้อหาไม่ได้) — ถ้าน้องหนาวอยากได้ทุกชนิดบล็อกแก้ได้ครบบนเว็บ บอกได้เลย
//      แต่ขอแยกเป็นงานต่อยอด (ต้องทำ role/channel picker ของเซิร์ฟเพิ่มอีกชุด)
//   🚫 "โพสต์เข้า Discord จริง" จากเว็บ — ยังไม่ทำปุ่มนี้ (หน้านี้แค่แก้/บันทึก draft) โพสต์จริง
//      ยังต้องกลับไปกด "Post" ในแผงควบคุมของ /builder ใน Discord เหมือนเดิม — ถ้าอยากได้ปุ่ม
//      "Post to Discord" บนเว็บด้วย บอกได้เลยครับ ทำเพิ่มได้ไม่ยาก (แค่ยังไม่ได้ขอรอบนี้)
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');
const { renderDashboardLayout } = require('./dashboardShell');

const EDITABLE_TYPES = new Set(['text', 'separator', 'gallery', 'section_button']);
const TRASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a1.5 1.5 0 0 1-1.5 1.4H9.3a1.5 1.5 0 0 1-1.5-1.4L7 7h10z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ── หน้า 1: รายการ draft ทั้งหมด ──────────────────────────────────────────
/**
 * @param {object} opts
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {Array<object>} opts.drafts     ของจริงจาก listDrafts(guildId)
 * @param {boolean} opts.isPremium
 * @param {number} opts.freeLimit
 * @param {{created?:string, deleted?:boolean, error?:string}} [opts.notice]
 */
function renderMessageBuilderListPage({ guild, user, botAvatarUrl, botName, drafts, isPremium, freeLimit, notice }) {
  const atFreeQuota = !isPremium && drafts.length >= freeLimit;

  let noticeHtml = '';
  if (notice?.deleted) {
    noticeHtml = `<div style="margin-top:14px;font-size:12.5px;color:var(--text-muted);background:rgba(154,162,196,0.1);border:1px solid var(--border);border-radius:4px;padding:8px 12px;">Draft deleted.</div>`;
  } else if (notice?.error) {
    noticeHtml = `<div style="margin-top:14px;font-size:12.5px;color:#ff8fa3;background:rgba(255,92,122,0.1);border:1px solid rgba(255,92,122,0.3);border-radius:4px;padding:8px 12px;">${escapeHtml(notice.error)}</div>`;
  }

  const rowsHtml = drafts.length ? drafts.map((d) => {
    const updatedLabel = new Date(d.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `<a href="/dashboard/${escapeHtml(guild.id)}/builder/${encodeURIComponent(d.name)}" class="layer-row glass-card" style="padding:14px 16px;display:flex;align-items:center;gap:14px;text-decoration:none;">
      <div class="discord-sim" style="width:34px;height:34px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:15px;">📝</div>
      <div style="flex:1 1 auto;min-width:0;">
        <div style="font-size:13.5px;font-weight:700;color:var(--text);">${escapeHtml(d.name)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${d.blocks.length} block${d.blocks.length === 1 ? '' : 's'} · updated ${updatedLabel}</div>
      </div>
      <span style="font-size:11px;color:var(--text-muted);">Edit &rarr;</span>
    </a>`;
  }).join('') : `<div style="padding:28px;text-align:center;color:var(--text-muted);font-size:12.5px;border:1px dashed var(--glass-border);border-radius:10px;">No drafts yet — create your first one below.</div>`;

  const bodyHtml = `
    <div style="padding:44px 56px;max-width:1000px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:24px;font-weight:700;color:var(--text);">Message Builder</div>
          <div style="font-size:13.5px;color:var(--text-muted);margin-top:4px;max-width:520px;">${escapeHtml(guild.name)} · Design announcement messages block by block.</div>
        </div>
        <form method="POST" action="/dashboard/${escapeHtml(guild.id)}/builder/create" style="display:flex;gap:8px;align-items:center;">
          <input type="text" name="name" placeholder="New draft name" maxlength="80" required ${atFreeQuota ? 'disabled' : ''} style="height:38px;border-radius:999px;background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);color:var(--text);font-size:12.5px;padding:0 14px;width:170px;" />
          <button type="submit" ${atFreeQuota ? 'disabled' : ''} style="height:38px;padding:0 18px;border-radius:999px;border:none;background:${atFreeQuota ? 'rgba(154,162,196,0.25)' : 'var(--accent)'};color:#fff;font-size:12.5px;font-weight:700;cursor:${atFreeQuota ? 'not-allowed' : 'pointer'};">New draft</button>
        </form>
      </div>
      ${noticeHtml}
      ${atFreeQuota ? `<div style="margin-top:14px;font-size:12px;color:var(--gold);background:rgba(244,184,96,0.1);border:1px solid rgba(244,184,96,0.3);border-radius:4px;padding:8px 12px;">Free servers can have ${freeLimit} draft — delete it or <a href="/premium/${escapeHtml(guild.id)}" style="color:var(--gold);">upgrade to Premium</a> for unlimited drafts and full block editing.</div>` : ''}
      <div style="margin-top:24px;display:flex;flex-direction:column;gap:10px;">${rowsHtml}</div>
    </div>`;

  return renderDashboardLayout({
    title: `Message Builder — ${guild.name} — Aitao Bot`,
    guild, user, activeKey: 'builder', botAvatarUrl, botName, bodyHtml,
  });
}

// ── หน้า 2: ตัวแก้ไข draft เดียว (ฝั่งซ้าย block editor / ฝั่งขวา Discord simulator) ──────
function blockEditorCardHtml(block, index, total, isPremium) {
  const editable = EDITABLE_TYPES.has(block.type);
  const moveButtons = isPremium ? `
    <button type="button" title="Move up" onclick="moveBlock(${index},-1)" ${index === 0 ? 'disabled' : ''} style="background:none;border:1px solid var(--glass-border);border-radius:5px;width:24px;height:22px;color:var(--text-muted);cursor:pointer;font-size:11px;">&uarr;</button>
    <button type="button" title="Move down" onclick="moveBlock(${index},1)" ${index === total - 1 ? 'disabled' : ''} style="background:none;border:1px solid var(--glass-border);border-radius:5px;width:24px;height:22px;color:var(--text-muted);cursor:pointer;font-size:11px;">&darr;</button>
  ` : '';
  // ฟรี: ลบไม่ได้เลย (โครงสร้างล็อกตายตัว 2 บล็อกเสมอ) — พรีเมียม: ลบได้ทุกบล็อก
  const deleteButton = isPremium ? `<button type="button" class="neon-trash" title="Delete this block" onclick="deleteBlock(${index})" style="width:26px;height:24px;">${TRASH_ICON}</button>` : '';

  if (!editable) {
    return `<div class="layer-row" style="padding:12px 14px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="pill-badge">${escapeHtml(block.type)}</span>
        <div style="flex:1 1 auto;"></div>
        ${moveButtons}${deleteButton}
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">This block type was created in Discord and can't be edited on the web yet — open it with <code style="background:rgba(255,255,255,0.08);border-radius:2px;padding:0 4px;">/builder edit</code> to change its content. You can still reorder or delete it here.</div>
    </div>`;
  }

  let fieldsHtml = '';
  if (block.type === 'text') {
    fieldsHtml = `<textarea rows="2" oninput="updateBlock(${index},'content',this.value)" style="width:100%;margin-top:10px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);border-radius:6px;color:var(--text);font-size:13px;padding:8px 9px;resize:vertical;font-family:inherit;" placeholder="Type your message text…">${escapeHtml(block.content || '')}</textarea>`;
  } else if (block.type === 'separator') {
    fieldsHtml = `<div style="margin-top:10px;display:flex;gap:14px;align-items:center;font-size:11.5px;color:var(--text-muted);">
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" ${block.divider !== false ? 'checked' : ''} onchange="updateBlock(${index},'divider',this.checked)" /> Show divider line</label>
      <label style="display:flex;align-items:center;gap:5px;">Spacing
        <select onchange="updateBlock(${index},'spacing',this.value)" style="height:26px;border-radius:5px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);color:var(--text);font-size:11.5px;">
          <option value="small" ${block.spacing !== 'large' ? 'selected' : ''}>Small</option>
          <option value="large" ${block.spacing === 'large' ? 'selected' : ''}>Large</option>
        </select>
      </label>
    </div>`;
  } else if (block.type === 'gallery') {
    const items = Array.isArray(block.items) ? block.items : [];
    const itemRows = items.map((item, i) => `<div style="display:flex;gap:6px;margin-top:6px;align-items:center;">
      <input type="text" value="${escapeHtml(item.url || '')}" oninput="updateGalleryItem(${index},${i},'url',this.value)" placeholder="https://... image URL" style="flex:1 1 auto;height:30px;border-radius:5px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);color:var(--text);font-size:11.5px;padding:0 8px;" />
      <button type="button" class="neon-trash" title="Remove image" onclick="removeGalleryItem(${index},${i})" style="width:26px;height:26px;flex:0 0 auto;">${TRASH_ICON}</button>
    </div>`).join('');
    fieldsHtml = `<div style="margin-top:10px;">${itemRows || '<div style="font-size:11px;color:var(--text-muted);">No images yet.</div>'}</div>
      <button type="button" onclick="addGalleryItem(${index})" style="margin-top:8px;background:none;border:1px solid var(--glass-border);border-radius:5px;height:28px;padding:0 10px;color:var(--accent);font-size:11px;font-weight:600;cursor:pointer;">+ Add image URL</button>`;
  } else if (block.type === 'section_button') {
    fieldsHtml = `<textarea rows="2" oninput="updateBlock(${index},'text',this.value)" style="width:100%;margin-top:10px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);border-radius:6px;color:var(--text);font-size:13px;padding:8px 9px;resize:vertical;font-family:inherit;" placeholder="Section text…">${escapeHtml(block.text || '')}</textarea>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <input type="text" value="${escapeHtml(block.buttonLabel || '')}" oninput="updateBlock(${index},'buttonLabel',this.value)" placeholder="Button label" style="flex:1 1 140px;height:30px;border-radius:5px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);color:var(--text);font-size:11.5px;padding:0 8px;" />
        <input type="text" value="${escapeHtml(block.buttonUrl || '')}" oninput="updateBlock(${index},'buttonUrl',this.value)" placeholder="https://..." style="flex:2 1 200px;height:30px;border-radius:5px;background:rgba(0,0,0,0.18);border:1px solid var(--glass-border);color:var(--text);font-size:11.5px;padding:0 8px;" />
      </div>`;
  }

  return `<div class="layer-row" style="padding:12px 14px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <span class="pill-badge">${escapeHtml(block.type)}</span>
      <div style="flex:1 1 auto;"></div>
      ${moveButtons}${deleteButton}
    </div>
    ${fieldsHtml}
  </div>`;
}

/**
 * @param {object} opts
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {object} opts.draft        { name, blocks, accentColor, updatedAt, ... } ของจริง
 * @param {boolean} opts.isPremium
 */
function renderMessageBuilderEditorPage({ guild, user, botAvatarUrl, botName, draft, isPremium }) {
  const blocksHtml = draft.blocks.map((b, i) => blockEditorCardHtml(b, i, draft.blocks.length, isPremium)).join('');
  const addBlockHtml = isPremium ? `
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
      <button type="button" onclick="addBlock('text')" class="bld-add-btn">+ Text</button>
      <button type="button" onclick="addBlock('separator')" class="bld-add-btn">+ Divider</button>
      <button type="button" onclick="addBlock('gallery')" class="bld-add-btn">+ Images</button>
      <button type="button" onclick="addBlock('section_button')" class="bld-add-btn">+ Button</button>
    </div>` : `<div style="margin-top:12px;font-size:11.5px;color:var(--gold);background:rgba(244,184,96,0.1);border:1px solid rgba(244,184,96,0.3);border-radius:4px;padding:8px 12px;">Free drafts are locked to this 2-block layout — <a href="/premium/${escapeHtml(guild.id)}" style="color:var(--gold);">upgrade to Premium</a> to add, remove and reorder blocks freely.</div>`;

  const bodyHtml = `
    <div style="padding:32px 40px 80px;max-width:1240px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <a href="/dashboard/${escapeHtml(guild.id)}/builder" style="font-size:11.5px;color:var(--text-muted);">&larr; All drafts</a>
          <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">${escapeHtml(draft.name)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text-muted);">Accent
            <input type="color" id="accentColorInput" value="${escapeHtml(draft.accentColor || '#7c83fd')}" oninput="onAccentChange(this.value)" style="width:30px;height:30px;border-radius:6px;border:1px solid var(--glass-border);background:none;cursor:pointer;" />
          </label>
          <button type="button" id="saveBtn" onclick="saveDraftNow()" style="height:38px;padding:0 22px;border-radius:4px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Save</button>
          <form method="POST" action="/dashboard/${escapeHtml(guild.id)}/builder/${encodeURIComponent(draft.name)}/delete" onsubmit="return confirm('Delete this draft? This cannot be undone.');" style="margin:0;">
            <button type="submit" class="neon-trash" title="Delete this draft" style="width:38px;height:38px;border-radius:4px;">${TRASH_ICON}</button>
          </form>
        </div>
      </div>

      <div style="margin-top:22px;display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
        <!-- ── ฝั่งซ้าย: block editor ── -->
        <div style="flex:1 1 420px;min-width:320px;">
          <div id="blocksContainer" style="display:flex;flex-direction:column;gap:10px;">${blocksHtml}</div>
          ${addBlockHtml}
        </div>

        <!-- ── ฝั่งขวา: Discord Client Simulator (อัปเดตสดด้วย JS ฝั่งเบราว์เซอร์ ไม่ยิง
             กลับเซิร์ฟเวอร์เลย เพราะเป็นแค่การจำลองหน้าตา ไม่ต้องของจริง 100% แบบรูปการ์ด
             Welcome/Goodbye ที่ต้องใช้ canvas ฝั่งเซิร์ฟเวอร์เรนเดอร์จริง) ── -->
        <div style="flex:1 1 380px;min-width:320px;position:sticky;top:24px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:10px;">Discord client simulator</div>
          <div class="discord-sim" style="padding:16px 18px;">
            <div style="display:flex;gap:12px;">
              <img src="${escapeHtml(botAvatarUrl)}" alt="" style="width:40px;height:40px;border-radius:999px;object-fit:cover;flex:0 0 auto;" />
              <div style="flex:1 1 auto;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:15px;font-weight:700;color:#f2f3f5;">${escapeHtml(botName)}</span>
                  <span style="font-size:9px;font-weight:700;color:#fff;background:var(--blurple);border-radius:2px;padding:1px 5px;">APP</span>
                </div>
                <div id="simContainer" class="discord-sim-blurple-bar" style="margin-top:10px;background:#2b2d31;border-radius:4px;padding:12px 15px;"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="bldToast" style="display:none;position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(10px);background:#1b2338;border:1px solid #2c3559;border-radius:999px;padding:10px 20px;font-size:12.5px;color:var(--text);box-shadow:0 12px 28px rgba(0,0,0,0.4);z-index:60;opacity:0;transition:opacity .2s ease, transform .2s ease;align-items:center;gap:8px;max-width:420px;">
      <span id="bldToastText"></span>
    </div>`;

  return renderDashboardLayout({
    title: `${draft.name} — Message Builder — ${guild.name} — Aitao Bot`,
    guild, user, activeKey: 'builder', botAvatarUrl, botName, bodyHtml,
    extraStyle: `.bld-add-btn { background:none;border:1px solid var(--glass-border);border-radius:999px;height:30px;padding:0 12px;color:var(--accent);font-size:11.5px;font-weight:600;cursor:pointer; }
    .bld-add-btn:hover { background:rgba(124,131,253,0.1); }`,
  }) + `
<script>
  var GUILD_ID = ${JSON.stringify(guild.id)};
  var IS_PREMIUM = ${JSON.stringify(isPremium)};
  var draft = ${JSON.stringify({ name: draft.name, blocks: draft.blocks, accentColor: draft.accentColor }).replace(/</g, '\\u003c')};
  var blockIdSeq = 1;

  function showToast(message) {
    var toast = document.getElementById('bldToast');
    document.getElementById('bldToastText').textContent = message;
    toast.style.display = 'flex';
    requestAnimationFrame(function () { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
    setTimeout(function () {
      toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(function () { toast.style.display = 'none'; }, 220);
    }, 2600);
  }

  function escapeHtmlJs(s) {
    var div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  // ── Discord client simulator — render ล้วนๆ ฝั่งเบราว์เซอร์ ไม่ยิง request ใดๆ ──────
  function renderSimulator() {
    var html = '';
    draft.blocks.forEach(function (b) {
      if (b.type === 'text') {
        html += '<div style="font-size:13.5px;color:#dbdee1;line-height:1.5;white-space:pre-wrap;">' + (escapeHtmlJs(b.content) || '<span style=\\'color:#6d7079\\'>(empty text block)</span>') + '</div>';
      } else if (b.type === 'separator') {
        html += '<hr style="border:none;border-top:1px solid #3f4147;margin:' + (b.spacing === 'large' ? '16px' : '8px') + ' 0;" />';
      } else if (b.type === 'gallery') {
        var items = Array.isArray(b.items) ? b.items : [];
        if (items.length === 0) {
          html += '<div style="font-size:11.5px;color:#6d7079;margin:6px 0;">(no images added yet)</div>';
        } else {
          html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">' + items.map(function (it) {
            return it.url ? '<img src="' + encodeURI(it.url) + '" style="width:84px;height:84px;object-fit:cover;border-radius:4px;" onerror="this.style.display=\\'none\\'" />' : '';
          }).join('') + '</div>';
        }
      } else if (b.type === 'section_button') {
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;background:rgba(0,0,0,0.15);border-radius:4px;padding:8px 10px;">' +
          '<span style="font-size:13px;color:#dbdee1;">' + (escapeHtmlJs(b.text) || '(section text)') + '</span>' +
          '<span style="font-size:11.5px;font-weight:600;color:#fff;background:#4752c4;border-radius:3px;padding:4px 10px;flex:0 0 auto;">' + (escapeHtmlJs(b.buttonLabel) || 'Button') + '</span>' +
        '</div>';
      } else {
        html += '<div style="font-size:11px;color:#6d7079;font-style:italic;margin:6px 0;">[' + escapeHtmlJs(b.type) + ' block — created in Discord]</div>';
      }
    });
    document.getElementById('simContainer').innerHTML = html || '<div style="font-size:12px;color:#6d7079;">(no content yet)</div>';
    document.getElementById('simContainer').style.borderLeft = '4px solid ' + (draft.accentColor || '#5865f2');
  }

  function onAccentChange(hex) { draft.accentColor = hex; renderSimulator(); }

  function updateBlock(index, field, value) {
    draft.blocks[index][field] = value;
    renderSimulator();
  }
  function updateGalleryItem(index, itemIndex, field, value) {
    if (!draft.blocks[index].items) draft.blocks[index].items = [];
    draft.blocks[index].items[itemIndex][field] = value;
    renderSimulator();
  }
  function addGalleryItem(index) {
    if (!draft.blocks[index].items) draft.blocks[index].items = [];
    draft.blocks[index].items.push({ url: '', description: '', spoiler: false });
    rerenderBlocksAndSim();
  }
  function removeGalleryItem(index, itemIndex) {
    draft.blocks[index].items.splice(itemIndex, 1);
    rerenderBlocksAndSim();
  }
  function moveBlock(index, delta) {
    if (!IS_PREMIUM) return;
    var target = index + delta;
    if (target < 0 || target >= draft.blocks.length) return;
    var tmp = draft.blocks[index];
    draft.blocks[index] = draft.blocks[target];
    draft.blocks[target] = tmp;
    rerenderBlocksAndSim();
  }
  function deleteBlock(index) {
    if (!IS_PREMIUM) return;
    draft.blocks.splice(index, 1);
    rerenderBlocksAndSim();
  }
  function addBlock(type) {
    if (!IS_PREMIUM) return;
    var id = 'b_new_' + Date.now() + '_' + (blockIdSeq++);
    var block = type === 'text' ? { id: id, type: 'text', content: '' }
      : type === 'separator' ? { id: id, type: 'separator', divider: true, spacing: 'small' }
      : type === 'gallery' ? { id: id, type: 'gallery', items: [] }
      : { id: id, type: 'section_button', text: '', buttonLabel: '', buttonUrl: '' };
    draft.blocks.push(block);
    rerenderBlocksAndSim();
  }

  // ── re-render ฝั่ง editor ทั้งชุด (ใช้ตอนโครงสร้างเปลี่ยน — เพิ่ม/ลบ/เรียงลำดับ/เพิ่มรูป) ──
  // ก๊อปปี้ HTML ของ blockEditorCardHtml() แบบง่าย ฝั่ง JS ไม่ได้ generate ซ้ำเป๊ะๆ ทุกสไตล์
  // (ซับซ้อนเกินจำเป็น) แต่พอโครงสร้างเปลี่ยนจะ "โหลดหน้าใหม่" แทน ง่ายกว่าและชัวร์กว่าการพยายาม
  // sync HTML ฝั่ง client กับฝั่ง server ให้ตรงกันทุกสไตล์ (ฟอร์มข้อมูลที่กรอกไว้จะหายแค่ตอนกด
  // ปุ่มเพิ่ม/ลบ/เรียงลำดับเท่านั้น — การพิมพ์ข้อความปกติไม่ re-render จึงไม่หลุดโฟกัส)
  function rerenderBlocksAndSim() {
    saveDraftNow(true).then(function () { window.location.reload(); });
  }

  async function saveDraftNow(silent) {
    var btn = document.getElementById('saveBtn');
    if (!silent) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      var res = await fetch('/dashboard/' + GUILD_ID + '/builder/' + encodeURIComponent(draft.name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: draft.blocks, accentColor: draft.accentColor }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        if (!silent) showToast((data.errors && data.errors[0]) || 'Could not save.');
        return;
      }
      if (!silent) showToast('Draft saved!');
    } catch (err) {
      if (!silent) showToast('Could not reach the server — please try again.');
    } finally {
      if (!silent) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  }

  renderSimulator();
</script>`;
}

module.exports = { renderMessageBuilderListPage, renderMessageBuilderEditorPage };
