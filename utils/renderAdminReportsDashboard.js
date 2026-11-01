// utils/renderAdminReportsDashboard.js
// ─────────────────────────────────────────────────────────────────────────
// หน้าเว็บ "Admin · Marketplace Reports" — /admin/marketplace-reports
//
// 🆕 [1 พ.ย. 2569] ก่อนหน้านี้รายงานที่มีคนร้องเรียนจาก Marketplace (ดู createReport ใน
// utils/marketplaceStorage.js) โพสต์เข้าห้อง #marketplace-reports ในดิสคอร์ดได้อย่างเดียว —
// ไม่มีปุ่ม "ปิดเคส"/เปลี่ยนสถานะจากเว็บเลย ต้องแก้ไฟล์ data/marketplace.json ตรงๆ ถ้าจะปิด
// เคสในระบบ (ดูคอมเมนต์เดิมหัวไฟล์ marketplaceStorage.js หัวข้อ reports) — หน้านี้มาแก้จุดนั้น
//
// บริบทสำคัญที่ทำให้ฟีเจอร์นี้มาแบบนี้ (คุยกันไว้แล้วตอนน้องหนาวขอทำ "ตู้เซฟกลาง"/escrow):
// สภา LLM Council เคยสรุปไว้ว่าไม่ควรทำระบบถือเงินกลาง (escrow) เพราะน้องหนาวยังไม่บรรลุ
// นิติภาวะ — การเป็นตัวกลางทางการเงินจริงจังมีความเสี่ยงทางกฎหมายเกินจำเป็น (ดู
// claude/marketplace-web-dashboard-build-notes.md รอบ 3) แทนที่ด้วยระบบ "พิพาท/ตรวจสอบ" ที่
// ไม่แตะเงินเลย — หน้านี้คือส่วนที่ขาดอยู่ของแนวทางนั้น: เจ้าของบอทตรวจรายงานเอง ตัดสินเอง
// (ไม่ใช่บอทตัดสินอัตโนมัติ) แล้วถ้ายืนยันว่าผู้ขายทำผิดจริง ระงับทั้งร้านได้เลยจากปุ่มเดียว
// (ตามที่น้องหนาวเลือกไว้ตอนคุยสโคป: "ระงับทั้งร้าน ขายต่อไม่ได้เลย" ไม่ใช่แค่ปิดประกาศชิ้นเดียว)
//
// หน้านี้เป็นหน้า "เจ้าของบอทคนเดียว" (owner-only) ไม่ผูกกับเซิร์ฟใดเซิร์ฟหนึ่งเหมือนหน้า
// แดชบอร์ดอื่นๆ (ดู requireOwner ใน server.js) เลยไม่ใช้ sidebar ร่วมของ utils/dashboardShell.js
// (sidebar นั้นออกแบบมาสำหรับหน้าที่ผูกกับ guildId เสมอ — /dashboard/:guildId/...) แต่เขียน
// เป็นหน้า standalone ธีมเดียวกับเว็บจริง (ก๊อปตัวแปรสี/ฟอนต์จาก utils/renderServerPicker.js
// เป๊ะๆ ให้สอดคล้องกันทั้งเว็บ)
//
// ไม่ใช้ fetch()/JSON เลยในหน้านี้ (ต่างจากหน้า public/marketplace.html ที่ต้องใช้ fetch
// เพราะเป็น static HTML) — ทุกปุ่มเป็น <form method="POST"> ธรรมดา ส่งแล้ว redirect กลับมา
// หน้าเดิมพร้อม query string บอกผลลัพธ์ (?saved=1/?error=...) ตามแบบเดียวกับหน้า Marketplace
// แดชบอร์ดอื่นๆ ในไฟล์ server.js (เช่น /dashboard/:guildId/marketplace/listings/:id/close)
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml, defaultAvatarUrl } = require('./renderServerPicker');

/**
 * แปลงเวลา ISO ให้เป็นข้อความไทยอ่านง่าย (เขตเวลา Asia/Bangkok) — รูปแบบเดียวกับที่ใช้ใน
 * commands/marketplace.js (orderTimeText) เพื่อให้ทั้งเว็บ/ดิสคอร์ดโชว์เวลารูปแบบเดียวกัน
 * @param {string} iso
 */
function formatThaiDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  });
}

/**
 * ป้ายสถานะเล็กๆ (pill) — ใช้ซ้ำหลายจุดในหน้านี้ (สถานะเคส/ป้ายระงับร้าน)
 * @param {{ text: string, color: string, bg: string }} opts
 */
function pillHtml({ text, color, bg }) {
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:700;color:${color};background:${bg};white-space:nowrap;">${escapeHtml(text)}</span>`;
}

/**
 * การ์ดรายงาน 1 เคส — ส่วนที่ซับซ้อนที่สุดของหน้านี้ เพราะหน้าตาต่างกันตามสถานะ:
 *   - "open" → โชว์ฟอร์ม 2 ปุ่ม (ยกเลิกรายงาน / ยืนยันละเมิด+ระงับร้าน)
 *   - "resolved" → โชว์ผลตัดสินเดิม + ปุ่ม "เปิดเคสใหม่อีกครั้ง" (เผื่อกดผิด/เปลี่ยนใจ)
 * ถ้าร้านของเคสนี้ถูกระงับอยู่ตอนนี้ (ไม่ว่าจะมาจากเคสนี้หรือเคสอื่นก่อนหน้า) โชว์ป้าย
 * เตือน + ปุ่ม "ปลดระงับร้าน" เพิ่มด้วยเสมอ (แยกจากการเปิดเคสใหม่ — ดูเหตุผลในคอมเมนต์
 * resolveReport()/suspendSeller() ที่ utils/marketplaceStorage.js)
 * @param {object} report รายงานที่ enrich แล้ว (มี .listing, .seller ติดมาด้วย)
 */
function reportCardHtml(report) {
  const { listing, seller } = report;

  const statusPill = report.status === 'open'
    ? pillHtml({ text: '🟡 ยังไม่ตรวจสอบ', color: '#f4b860', bg: 'rgba(244,184,96,0.16)' })
    : report.resolution?.outcome === 'violation_confirmed'
      ? pillHtml({ text: '🔴 ยืนยันละเมิด · ระงับร้านแล้ว', color: '#e07a7a', bg: 'rgba(224,122,122,0.16)' })
      : pillHtml({ text: '✅ ยกเลิก (ไม่มีมูล)', color: '#52c7c0', bg: 'rgba(82,199,192,0.16)' });

  const listingHtml = listing
    ? `${escapeHtml(listing.title)} <span style="color:var(--text-muted);">(รหัส ${escapeHtml(listing.id)} · ${escapeHtml(listing.status)})</span>`
    : `<span style="color:var(--text-muted);">ประกาศถูกลบไปแล้ว (รหัสเดิม: ${escapeHtml(report.listingId)})</span>`;

  const suspendedBadge = seller?.suspended
    ? ' ' + pillHtml({ text: '🚫 SUSPENDED', color: '#e07a7a', bg: 'rgba(224,122,122,0.16)' })
    : '';
  const sellerHtml = report.sellerId
    ? `${seller?.displayName ? escapeHtml(seller.displayName) + ' · ' : ''}<code style="color:var(--text-muted);">${escapeHtml(report.sellerId)}</code>${suspendedBadge}`
    : `<span style="color:var(--text-muted);">ไม่ทราบ (ประกาศถูกลบไปก่อนแล้ว)</span>`;

  // ── ส่วนท้ายการ์ด: ต่างกันตามสถานะ ──────────────────────────────────────
  let actionHtml;
  if (report.status === 'open') {
    actionHtml = `
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
        <form method="POST" action="/admin/marketplace-reports/${encodeURIComponent(report.id)}/resolve" style="flex:1 1 260px;min-width:240px;" onsubmit="return confirm('ยืนยันว่า \\'ยกเลิกรายงานนี้ (ไม่มีมูล)\\' ใช่ไหมครับ?');">
          <input type="hidden" name="outcome" value="dismissed" />
          <textarea name="note" rows="2" placeholder="บันทึกเหตุผล (ไม่บังคับ)" style="width:100%;resize:vertical;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12.5px;padding:8px;box-sizing:border-box;font-family:inherit;"></textarea>
          <button type="submit" style="margin-top:6px;width:100%;height:34px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--text-muted);font-size:12.5px;font-weight:700;cursor:pointer;">❌ ยกเลิกรายงาน (ไม่มีมูล)</button>
        </form>
        <form method="POST" action="/admin/marketplace-reports/${encodeURIComponent(report.id)}/resolve" style="flex:1 1 260px;min-width:240px;" onsubmit="return confirm('ยืนยันว่าร้านนี้ \\'ละเมิดจริง\\' และต้องการ \\'ระงับทั้งร้าน\\' ใช่ไหมครับ? ขายต่อไม่ได้เลยทุกชิ้นจนกว่าจะปลดระงับ');">
          <input type="hidden" name="outcome" value="violation_confirmed" />
          <textarea name="note" rows="2" placeholder="บันทึกเหตุผล (ไม่บังคับ)" style="width:100%;resize:vertical;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12.5px;padding:8px;box-sizing:border-box;font-family:inherit;"></textarea>
          <button type="submit" style="margin-top:6px;width:100%;height:34px;border-radius:4px;border:none;background:#e07a7a;color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;">✅ ยืนยันละเมิดจริง + ระงับทั้งร้าน</button>
        </form>
      </div>`;
  } else {
    const resolvedByLine = report.resolution
      ? `ตัดสินโดย <code>${escapeHtml(report.resolution.resolvedBy)}</code> เมื่อ ${formatThaiDateTime(report.resolution.resolvedAt)}${report.resolution.note ? ` — "${escapeHtml(report.resolution.note)}"` : ''}`
      : '';
    actionHtml = `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">${resolvedByLine}</div>
        <form method="POST" action="/admin/marketplace-reports/${encodeURIComponent(report.id)}/reopen" onsubmit="return confirm('เปิดเคสนี้ขึ้นมาตรวจสอบใหม่อีกครั้งไหมครับ? (ไม่ปลดระงับร้านอัตโนมัติ ถ้าระงับไปแล้วต้องกดปลดระงับแยกต่างหาก)');">
          <button type="submit" style="height:32px;padding:0 16px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--text-muted);font-size:12px;font-weight:700;cursor:pointer;">↩️ เปิดเคสใหม่อีกครั้ง</button>
        </form>
      </div>`;
  }

  // ปุ่ม "ปลดระงับร้าน" แยกอิสระจากสถานะเคส — โชว์ทุกครั้งที่ seller ของเคสนี้ suspended อยู่
  // ตอนนี้ (ไม่ว่าเคสนี้จะเป็นเคสที่ทำให้ถูกระงับหรือเป็นเคสอื่นที่มาทีหลังก็ตาม)
  const unsuspendHtml = seller?.suspended
    ? `<form method="POST" action="/admin/sellers/${encodeURIComponent(report.sellerId)}/unsuspend" style="margin-top:10px;" onsubmit="return confirm('ปลดระงับร้านนี้ไหมครับ? (ประกาศเดิมที่ถูกปิดไว้ตอนระงับจะไม่เปิดกลับมาอัตโนมัติ ผู้ขายต้องไปกด Reopen เองทีละชิ้น)');">
        <button type="submit" style="height:32px;padding:0 16px;border-radius:4px;border:1px solid var(--teal);background:transparent;color:var(--teal);font-size:12px;font-weight:700;cursor:pointer;">🔓 ปลดระงับร้านนี้</button>
      </form>`
    : '';

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:18px 20px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
      <div style="font-size:13.5px;font-weight:700;">รายงาน #${escapeHtml(report.id)}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${statusPill}
        <span style="font-size:11.5px;color:var(--text-muted);">${formatThaiDateTime(report.createdAt)}</span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:120px 1fr;gap:6px 12px;font-size:13px;line-height:1.5;">
      <div style="color:var(--text-muted);">สินค้า</div><div>${listingHtml}</div>
      <div style="color:var(--text-muted);">ผู้ขาย</div><div>${sellerHtml}</div>
      <div style="color:var(--text-muted);">ผู้รายงาน</div><div><code style="color:var(--text-muted);">${escapeHtml(report.reporterId)}</code></div>
      <div style="color:var(--text-muted);">เหตุผล</div><div>${escapeHtml(report.reasonLabel)}</div>
      <div style="color:var(--text-muted);">รายละเอียด</div><div>${report.detail ? escapeHtml(report.detail) : '<span style="color:var(--text-muted);">(ไม่ได้ระบุ)</span>'}</div>
      <div style="color:var(--text-muted);">หลักฐานแนบ</div><div>${report.evidenceCount} ไฟล์ <span style="color:var(--text-muted);">(ดูไฟล์จริงได้ในห้อง #marketplace-reports บนดิสคอร์ด)</span></div>
    </div>
    ${unsuspendHtml}
    ${actionHtml}
  </div>`;
}

/**
 * แถบ flash message เล็กๆ บนสุดของหน้า (ผลลัพธ์หลัง POST แต่ละปุ่ม)
 * @param {{ saved: boolean, error: string|null }} flash
 */
function flashHtml({ saved, error }) {
  if (error) {
    return `<div style="background:rgba(224,122,122,0.14);border:1px solid #e07a7a;color:#e07a7a;border-radius:6px;padding:12px 16px;font-size:13px;margin-bottom:18px;">⚠️ ${escapeHtml(error)}</div>`;
  }
  if (saved) {
    return `<div style="background:rgba(82,199,192,0.14);border:1px solid var(--teal);color:var(--teal);border-radius:6px;padding:12px 16px;font-size:13px;margin-bottom:18px;">✅ บันทึกเรียบร้อยแล้วครับ</div>`;
  }
  return '';
}

/**
 * สร้างหน้า HTML เต็มของ /admin/marketplace-reports
 * @param {{
 *   user: { id: string, username: string, avatar: string|null },
 *   botAvatarUrl: string,
 *   botName: string,
 *   reports: object[],
 *   statusFilter: 'all'|'open'|'resolved',
 *   query: string,
 *   counts: { all: number, open: number, resolved: number },
 *   saved?: boolean,
 *   error?: string|null,
 * }} ctx
 * @returns {string}
 */
function renderAdminReportsDashboardPage({ user, botAvatarUrl, botName, reports, statusFilter, query, counts, saved = false, error = null }) {
  const avatarUrl = user.avatar || defaultAvatarUrl(user.id);

  const tabs = [
    { key: 'open', label: `Open (${counts.open})` },
    { key: 'resolved', label: `Resolved (${counts.resolved})` },
    { key: 'all', label: `All (${counts.all})` },
  ];
  const qSuffix = query ? `&q=${encodeURIComponent(query)}` : '';
  const tabsHtml = tabs.map((tab) => {
    const isActive = tab.key === statusFilter;
    return `<a href="/admin/marketplace-reports?status=${tab.key}${qSuffix}" style="padding:8px 16px;border-radius:999px;font-size:12.5px;font-weight:700;text-decoration:none;color:${isActive ? '#fff' : 'var(--text-muted)'};background:${isActive ? 'var(--accent)' : 'transparent'};border:1px solid ${isActive ? 'var(--accent)' : 'var(--border)'};">${escapeHtml(tab.label)}</a>`;
  }).join('');

  const listHtml = reports.length > 0
    ? reports.map(reportCardHtml).join('')
    : `<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:48px 0;">ไม่มีรายงานในหมวดนี้ครับ</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Admin · Marketplace Reports — Aitao Bot</title>
<style>
  :root {
    --bg: #0a0e1a;
    --bg-card: #131a2e;
    --border: #262f4d;
    --text: #f3f1fb;
    --text-muted: #9aa2c4;
    --accent: #7c83fd;
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
  textarea:focus, input:focus { outline: 1px solid var(--accent); }
  button:hover { opacity: 0.88; }
</style>
</head>
<body>
  <div style="height:72px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 24px;">
    <div style="display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;">
      <img src="${escapeHtml(botAvatarUrl)}" alt="" style="width:30px;height:30px;border-radius:50%;object-fit:cover;" />
      ${escapeHtml(botName)} · <span style="color:var(--gold);">Admin</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;">
      <a href="/dashboard" style="font-size:12px;color:var(--text-muted);">← Server Picker</a>
      <img src="${escapeHtml(avatarUrl)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />
      <span style="font-size:12.5px;color:var(--text-muted);">${escapeHtml(user.username)}</span>
    </div>
  </div>

  <div style="max-width:780px;margin:0 auto;padding:32px 24px 80px;">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 4px;">Marketplace Reports</h1>
    <p style="font-size:13px;color:var(--text-muted);margin:0 0 24px;">ตรวจรายงานที่มีคนร้องเรียนเข้ามา แล้วตัดสินเองว่าจะยกเลิก หรือยืนยันว่าละเมิดจริง (ระงับทั้งร้านทันที) — ไม่มีการตัดสินอัตโนมัติจากระบบเลย</p>

    ${flashHtml({ saved, error })}

    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${tabsHtml}</div>
      <form method="GET" action="/admin/marketplace-reports" style="display:flex;gap:6px;">
        <input type="hidden" name="status" value="${escapeHtml(statusFilter)}" />
        <input type="text" name="q" value="${escapeHtml(query || '')}" placeholder="ค้นหารหัสรายงาน/ประกาศ/Discord ID" style="height:34px;padding:0 10px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-size:12.5px;width:260px;" />
        <button type="submit" style="height:34px;padding:0 14px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:12.5px;cursor:pointer;">ค้นหา</button>
      </form>
    </div>

    ${listHtml}
  </div>
</body>
</html>`;
}

module.exports = { renderAdminReportsDashboardPage };
