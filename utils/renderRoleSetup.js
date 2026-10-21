// utils/renderRoleSetup.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "Role Setup" — ดูสถานะระบบแจกยศอัตโนมัติทั้งหมดของเซิร์ฟบนเว็บ + เริ่มสร้างชุดใหม่ได้
// คู่ขนานกับคำสั่ง /role-setup ใน Discord (commands/role-setup.js)
//
// 🔑 ขอบเขตที่ทำเต็มรูปแบบ vs ที่ยังต้องพึ่ง Discord (ตัดสินใจเองพร้อมเหตุผล บอกตรงๆ):
//   ✅ ลิสต์สถานะทั้งหมด (ชื่อ/ประเภท/จำนวนยศที่ตั้งไว้/โพสต์แล้วหรือยัง) — ข้อมูลจริง 100%
//      อ่านจาก roleSetupStorage.js ตรงๆ
//   ✅ ลบชุดที่มีอยู่ — ของจริง เรียก deleteSetup() ตรงๆ เหมือนคำสั่ง /role-setup delete
//   ✅ "สร้างชุดใหม่" (ตั้งชื่อ+เลือกประเภท) — ของจริง เรียก saveSetup() ด้วย config เริ่มต้น
//      รูปแบบเดียวกับที่ /role-setup new สร้างเป๊ะๆ (ยืนยันจากโค้ดจริงบรรทัด ~1220 ก่อนเขียน)
//      รวม validate เหมือนกันทุกจุด: ชื่อห้ามมี ":", ห้ามซ้ำชื่อเดิม, เช็ก quota/tier gating จริง
//   🚫 "เพิ่มยศ/ปุ่ม/อิโมจิเข้าไปในชุดที่สร้างแล้ว" และ "โพสต์ข้อความจริงเข้าช่อง" — ยังต้องทำ
//      ผ่าน Discord (`/role-setup edit <name>`) เพราะของจริงเป็น flow แบบเลือกยศ/อิโมจิ/
//      preview แบบอินเตอร์แอกทีฟในตัว Discord เอง (ไฟล์ role-setup.js ยาว ~170,000 ตัวอักษร
//      ทำเฉพาะส่วนนี้บนเว็บคือทำระบบใหม่เกือบทั้งระบบคู่ขนานกัน ไม่ใช่งานดีไซน์หน้าเว็บแล้ว) —
//      หน้านี้แค่ "เปิดชุดเปล่าให้" แล้วบอกชัดเจนว่าต้องไปต่อที่ไหน ถ้าน้องหนาวอยากได้ฟีเจอร์
//      เพิ่มยศแบบเต็มรูปแบบบนเว็บด้วย บอกได้เลยครับ แต่ขอแยกเป็นงานต่างหาก (ใหญ่พอๆกับงานนี้ทั้งหมด)
//
// 🔒 Premium gating ที่ใช้ตรงนี้คือของจริง (ไม่ได้มโนเหมือนที่ตัดสินใจไม่ทำกับหน้า Fonts) —
// ยืนยันจาก commands/role-setup.js: ฟรีสร้างได้แค่ type "reaction" เท่านั้น (menu/button
// สงวนพรีเมียม) และฟรีจำกัด 1 ชุด/เซิร์ฟ (FREE_ROLE_SETUP_LIMIT) ตัวเลขเหล่านี้ copy มาตรงๆ
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');
const { renderDashboardLayout } = require('./dashboardShell');

const TYPE_LABEL = { menu: 'Menu', button: 'Button', reaction: 'Reaction' };
const TYPE_ICON = {
  menu: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  button: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="8" width="16" height="8" rx="4" stroke="currentColor" stroke-width="1.8"/></svg>',
  reaction: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><path d="M9 10h.01M15 10h.01M8.5 14.5a4 4 0 0 0 7 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
const TRASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a1.5 1.5 0 0 1-1.5 1.4H9.3a1.5 1.5 0 0 1-1.5-1.4L7 7h10z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function itemCountFor(setup) {
  if (setup.type === 'menu') return (setup.config?.roles?.length) || 0;
  if (setup.type === 'button') return (setup.config?.buttons?.length) || 0;
  if (setup.type === 'reaction') return (setup.config?.reactions?.length) || 0;
  return 0;
}

function statusRowHtml(setup, guildId) {
  const count = itemCountFor(setup);
  const postedLabel = setup.lastPostedAt
    ? `Posted ${escapeHtml(new Date(setup.lastPostedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}`
    : 'Not posted yet';
  const updatedLabel = new Date(setup.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `<div class="layer-row glass-card" style="padding:14px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
    <span class="pill-badge" style="flex:0 0 auto;">${TYPE_ICON[setup.type] || ''}&nbsp;${TYPE_LABEL[setup.type] || setup.type}</span>
    <div style="flex:1 1 180px;min-width:140px;">
      <div style="font-size:13.5px;font-weight:700;color:var(--text);">${escapeHtml(setup.name)}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${count} role${count === 1 ? '' : 's'} configured · ${postedLabel} · updated ${updatedLabel}</div>
    </div>
    <div style="font-size:10.5px;color:var(--text-muted);background:rgba(0,0,0,0.2);border-radius:5px;padding:5px 9px;flex:0 0 auto;">/role-setup edit ${escapeHtml(setup.name)}</div>
    <form method="POST" action="/dashboard/${escapeHtml(guildId)}/roles/${encodeURIComponent(setup.name)}/delete" onsubmit="return confirm('Delete role setup \\'${setup.name.replace(/'/g, "\\\\'")}\\'? This cannot be undone.');" style="margin:0;flex:0 0 auto;">
      <button type="submit" class="neon-trash" title="Delete this role setup" style="width:28px;height:26px;">${TRASH_ICON}</button>
    </form>
  </div>`;
}

/**
 * @param {object} opts
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {Array<object>} opts.setups        ของจริงจาก listSetups(guildId)
 * @param {boolean} opts.isPremium
 * @param {number} opts.freeLimit             FREE_ROLE_SETUP_LIMIT ของจริงจาก commands/role-setup.js
 * @param {{created?:boolean, deleted?:boolean, error?:string}} [opts.notice]
 */
function renderRoleSetupPage({ guild, user, botAvatarUrl, botName, setups, isPremium, freeLimit, notice }) {
  const atFreeQuota = !isPremium && setups.length >= freeLimit;

  let noticeHtml = '';
  if (notice?.created) {
    noticeHtml = `<div style="margin-top:14px;font-size:12.5px;color:var(--teal);background:rgba(82,199,192,0.1);border:1px solid rgba(82,199,192,0.3);border-radius:4px;padding:8px 12px;">✓ Role setup created — open Discord and run <code style="background:rgba(255,255,255,0.08);border-radius:2px;padding:0 4px;">/role-setup edit ${escapeHtml(notice.created)}</code> to add roles and post it.</div>`;
  } else if (notice?.deleted) {
    noticeHtml = `<div style="margin-top:14px;font-size:12.5px;color:var(--text-muted);background:rgba(154,162,196,0.1);border:1px solid var(--border);border-radius:4px;padding:8px 12px;">Role setup deleted.</div>`;
  } else if (notice?.error) {
    noticeHtml = `<div style="margin-top:14px;font-size:12.5px;color:#ff8fa3;background:rgba(255,92,122,0.1);border:1px solid rgba(255,92,122,0.3);border-radius:4px;padding:8px 12px;">${escapeHtml(notice.error)}</div>`;
  }

  const rowsHtml = setups.length
    ? setups.map((s) => statusRowHtml(s, guild.id)).join('')
    : `<div style="padding:28px;text-align:center;color:var(--text-muted);font-size:12.5px;border:1px dashed var(--glass-border);border-radius:10px;">No role setups yet — create your first one below.</div>`;

  // ── โมดัล "สร้างชุดใหม่" — 3 ปุ่มบล็อก isometric ตามสเปค + ล็อกเบลอจริงสำหรับเซิร์ฟ Free ──
  function typeBlockHtml(type, emoji, title, desc) {
    const locked = !isPremium && type !== 'reaction';
    const lockWrap = locked ? ' premium-lock' : '';
    return `<button type="button" class="rs-type-block${lockWrap}" data-type="${type}" onclick="selectType('${type}', ${locked})" style="position:relative;flex:1 1 150px;min-width:140px;background:rgba(255,255,255,0.03);border:1.5px solid var(--glass-border);border-radius:12px;padding:20px 14px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:transform .12s ease, border-color .12s ease;">
      ${locked ? '<div class="premium-lock-badge" style="font-size:9.5px;padding:4px 10px;">🌟 Premium</div>' : ''}
      <div style="font-size:30px;line-height:1;">${emoji}</div>
      <div style="font-size:13px;font-weight:700;color:var(--text);">${title}</div>
      <div style="font-size:10.5px;color:var(--text-muted);text-align:center;">${desc}</div>
    </button>`;
  }

  const modalHtml = `
    <div id="createModalBackdrop" style="display:none;position:fixed;inset:0;background:rgba(5,7,15,0.7);z-index:80;align-items:center;justify-content:center;padding:20px;">
      <div class="glass-card" style="background:#131a2e;width:100%;max-width:520px;border-radius:16px;padding:26px;box-shadow:0 24px 60px rgba(0,0,0,0.5);">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:17px;font-weight:700;color:var(--text);">New role setup</div>
          <button type="button" onclick="closeCreateModal()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;line-height:1;">&times;</button>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Pick a type, then give it a name. You'll add roles and post it from Discord next.</div>

        <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;">
          ${typeBlockHtml('menu', '📋', 'Menu Type', 'Dropdown menu of roles')}
          ${typeBlockHtml('button', '🔘', 'Button Type', 'Click a button to get a role')}
          ${typeBlockHtml('reaction', '👍', 'Reaction Type', 'React with an emoji')}
        </div>
        <div id="typeLockedHint" style="display:none;margin-top:10px;font-size:11.5px;color:var(--gold);">Menu and Button setups require Premium — reaction setups are free on every server.</div>

        <div style="margin-top:18px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:6px;">Name</div>
          <input type="text" id="newSetupName" placeholder="e.g. color-roles" maxlength="80" style="width:100%;height:38px;border-radius:6px;background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);color:var(--text);font-size:13px;padding:0 10px;" />
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:5px;">No colons ( : ) — this is just a label for you, members won't see it.</div>
        </div>

        <div id="createModalError" style="display:none;margin-top:12px;font-size:12px;color:#ff8fa3;background:rgba(255,92,122,0.1);border:1px solid rgba(255,92,122,0.3);border-radius:4px;padding:8px 12px;"></div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
          <button type="button" onclick="closeCreateModal()" style="height:36px;padding:0 16px;border-radius:999px;border:1px solid var(--glass-border);background:none;color:var(--text-muted);font-size:12.5px;cursor:pointer;">Cancel</button>
          <button type="button" id="createSubmitBtn" onclick="submitCreate()" style="height:36px;padding:0 18px;border-radius:999px;border:none;background:var(--blurple);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;">Create</button>
        </div>
      </div>
    </div>`;

  const bodyHtml = `
    <div style="padding:44px 56px;max-width:1100px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:24px;font-weight:700;color:var(--text);">Role Setup</div>
          <div style="font-size:13.5px;color:var(--text-muted);margin-top:4px;max-width:520px;">
            ${escapeHtml(guild.name)} · Automatic role menus, buttons and reaction roles.
          </div>
        </div>
        <button type="button" onclick="openCreateModal()" ${atFreeQuota ? 'disabled' : ''} style="display:flex;align-items:center;gap:6px;height:38px;padding:0 18px;border-radius:999px;border:none;background:${atFreeQuota ? 'rgba(154,162,196,0.25)' : 'var(--accent)'};color:#fff;font-size:12.5px;font-weight:700;cursor:${atFreeQuota ? 'not-allowed' : 'pointer'};">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          New setup
        </button>
      </div>
      ${noticeHtml}
      ${atFreeQuota ? `<div style="margin-top:14px;font-size:12px;color:var(--gold);background:rgba(244,184,96,0.1);border:1px solid rgba(244,184,96,0.3);border-radius:4px;padding:8px 12px;">Free servers can have ${freeLimit} role setup — delete it or <a href="/premium/${escapeHtml(guild.id)}" style="color:var(--gold);">upgrade to Premium</a> for unlimited setups and Menu/Button types.</div>` : ''}

      <div style="margin-top:24px;display:flex;flex-direction:column;gap:10px;">
        ${rowsHtml}
      </div>
    </div>
    ${modalHtml}`;

  return renderDashboardLayout({
    title: `Role Setup — ${guild.name} — Aitao Bot`,
    guild,
    user,
    activeKey: 'roles',
    botAvatarUrl,
    botName,
    bodyHtml,
    extraStyle: `
      .rs-type-block:hover { transform: translateY(-2px); border-color: rgba(124,131,253,0.5); }
      .rs-type-block.selected { border-color: var(--blurple) !important; box-shadow: 0 0 0 2px rgba(88,101,242,0.35); }
    `,
  }) + `
<script>
  var GUILD_ID = ${JSON.stringify(guild.id)};
  var selectedType = ${JSON.stringify(isPremium ? 'menu' : 'reaction')};

  function openCreateModal() {
    document.getElementById('createModalBackdrop').style.display = 'flex';
    document.getElementById('createModalError').style.display = 'none';
    document.getElementById('newSetupName').value = '';
    selectType(selectedType, false);
  }
  function closeCreateModal() {
    document.getElementById('createModalBackdrop').style.display = 'none';
  }
  function selectType(type, locked) {
    document.getElementById('typeLockedHint').style.display = locked ? 'block' : 'none';
    if (locked) return; // ล็อกไว้ — ไม่ให้เลือกประเภทนี้ได้เลย (เซิร์ฟ Free)
    selectedType = type;
    var blocks = document.querySelectorAll('.rs-type-block');
    blocks.forEach(function (el) {
      if (el.getAttribute('data-type') === type) el.classList.add('selected');
      else el.classList.remove('selected');
    });
  }
  async function submitCreate() {
    var name = document.getElementById('newSetupName').value.trim();
    var errEl = document.getElementById('createModalError');
    if (!name) { errEl.textContent = 'Please enter a name.'; errEl.style.display = 'block'; return; }
    if (name.includes(':')) { errEl.textContent = 'Name cannot contain a colon ( : ).'; errEl.style.display = 'block'; return; }
    var btn = document.getElementById('createSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    try {
      var res = await fetch('/dashboard/' + GUILD_ID + '/roles/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, type: selectedType }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        errEl.textContent = data.error || 'Could not create this role setup.';
        errEl.style.display = 'block';
        return;
      }
      window.location.href = '/dashboard/' + GUILD_ID + '/roles?created=' + encodeURIComponent(name);
    } catch (err) {
      errEl.textContent = 'Could not reach the server — please try again.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create';
    }
  }
</script>`;
}

module.exports = { renderRoleSetupPage };
