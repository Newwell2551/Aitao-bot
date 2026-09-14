// utils/renderOverview.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "Overview" (ภาพรวม) — หน้าแรกที่เห็นหลังกดเข้าไปจัดการเซิร์ฟใดเซิร์ฟหนึ่งจากหน้า
// Server Picker มี 2 ส่วนหลัก: (1) การ์ดเช็กลิสต์เริ่มต้นใช้งาน 6 ขั้นตอน พร้อม carousel
// โชว์ตัวอย่างแต่ละฟีเจอร์ทางซ้าย (2) ป้ายสถานะ Free/Premium มุมขวาบน
//
// อ้างอิงจาก mockup /home/claude/scratch/design-mockup/Overview.dc.html (รอบ 7 — carousel
// เต็มความสูง 300px) โดยมีจุดที่ "ไม่ได้ทำตาม mockup เป๊ะๆ" (ตัดสินใจเองพร้อมเหตุผล):
//
//   1) 🚫 ตัดโซน "สินค้าขายดีจาก Marketplace" ทั้งหมดออก — ยืนยันแล้วว่า Marketplace ยังไม่
//      อยู่ในสโคปตอนนี้ (claude/roadmap-marketplace-idea.md)
//   2) ป้าย Free/Premium มุมขวาบน — ใน mockup กดสลับได้ (selectTier) เพราะเป็นแค่ของโชว์ 2
//      สถานะ แต่ในเวอร์ชันจริง สถานะนี้คือข้อมูลจริงที่ Stripe webhook เป็นคนอัปเดตเท่านั้น
//      (ดู utils/tierManager.js) จึงทำให้เป็น "ป้ายอ่านอย่างเดียว" กดไม่ได้เด็ดขาด ป้องกันคน
//      เข้าใจผิดว่ากดแล้วจะอัปเกรด/ดาวน์เกรดได้เอง (ปุ่มอัปเกรดจริงไปกดที่เมนู "Premium" แทน)
//   3) ช่องติ๊กของเช็กลิสต์ 6 ข้อ — ใน mockup เป็น <input type=checkbox> กดติ๊ก/ปลดติ๊กได้เอง
//      (แค่โชว์ demo) แต่ของจริงสถานะ "เสร็จหรือยัง" คำนวณจากข้อมูลจริงของเซิร์ฟ (มีการ์ด
//      ต้อนรับที่บันทึกไว้ไหม, มีฟอนต์อัปโหลดไว้ไหม ฯลฯ) ผู้ใช้กดติ๊กเองไม่ได้ (จะขัดกับความ
//      จริง) เลยเปลี่ยนเป็นไอคอนแสดงผลอย่างเดียว ส่วนทั้งแถวยังกดได้เหมือนเดิม (เป็น <a href>
//      พาไปหน้าตั้งค่าของฟีเจอร์นั้นจริงๆ ไม่ใช่แค่ toast จำลองแบบ mockup)
//   4) สไลด์ carousel "การ์ดต้อนรับ" (สไลด์ 0) กับ "การ์ดบอกลา" (สไลด์ 4) — ถ้าเซิร์ฟนี้
//      เคยตั้งค่าไว้แล้วจริง จะโชว์ "รูปพรีวิวจริง" ที่เรนเดอร์สดจาก config จริงของเซิร์ฟ
//      (ผ่าน generateMemberCardImage() ตัวเดียวกับที่คำสั่ง /welcome-setup, /goodbye-setup
//      ใช้ทำพรีวิวใน Discord) ไม่ใช่รูปมอคอัพตายตัวเหมือน mockup ถ้ายังไม่เคยตั้งค่า จะโชว์
//      การ์ดเชิญชวนให้ไปตั้งค่าแทน (ไม่ใช่ mock)
//   5) สไลด์ "พรีเมียม" (สไลด์ 5) — ถ้าเซิร์ฟนี้เป็น Premium อยู่แล้วจริง จะเปลี่ยนข้อความ
//      เป็นขอบคุณ/ยืนยันสถานะ แทนที่จะโชว์ข้อความชวนอัปเกรดซ้ำให้คนที่จ่ายเงินแล้วเห็น
//   6) ตัดฟอนต์ Prompt/Athiti ของมอคอัพออก ใช้ system font เดียวกับทั้งเว็บ (เหตุผลเดียวกับ
//      renderServerPicker.js — อ่านคอมเมนต์หัวไฟล์นั้นได้)
//   7) ภาพน้อง Milo จางๆ มุมขวาล่าง — mockup ใช้ hero-crisp.jpg (ไฟล์ตัวอย่างในแคนวาสออกแบบ
//      เท่านั้น ไม่มีอยู่จริงในเว็บ) เปลี่ยนเป็น /images/milo-hero.webp ซึ่งเป็นภาพจริงที่มี
//      อยู่แล้วใน public/images/ ของเว็บที่ deploy อยู่ตอนนี้ (หน้า Landing ก็ใช้ภาพเดียวกันนี้)
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');
const { renderDashboardLayout } = require('./dashboardShell');

// ── ไอคอนถูก (checkmark) สีขาว — ใช้ในช่องเช็กลิสต์ข้อที่ "เสร็จแล้ว" ──────────────
const CHECK_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROWN_ICON = (color) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8l3 3 5-7 5 7 3-3-2 10H6L4 8z" fill="${color}"/></svg>`;

/**
 * แถวเช็กลิสต์ 1 ข้อ — ทั้งแถวเป็นลิงก์กดพาไปหน้าตั้งค่าจริงของฟีเจอร์นั้น (แทนที่ toast
 * จำลองของ mockup) ช่องติ๊กด้านหน้าเป็นแค่ไอคอนแสดงผล ไม่ใช่ <input> ที่กดแก้เองได้
 * (ดูเหตุผลข้อ 3 ในคอมเมนต์หัวไฟล์)
 * @param {{label:string, done:boolean, href:string, optional?:boolean}} item
 */
function checklistRowHtml(item) {
  const boxHtml = item.done
    ? `<span style="width:16px;height:16px;border-radius:4px;background:var(--accent);flex:0 0 auto;display:flex;align-items:center;justify-content:center;">${CHECK_ICON}</span>`
    : `<span style="width:16px;height:16px;border-radius:4px;border:1.5px solid var(--border);flex:0 0 auto;"></span>`;
  const labelStyle = item.done
    ? 'font-size:13.5px;font-weight:500;color:#6d7597;text-decoration:line-through;flex:1 1 auto;'
    : 'font-size:13.5px;font-weight:500;color:var(--text);flex:1 1 auto;';
  const optionalTag = item.optional
    ? `<span style="font-size:10px;font-weight:700;color:var(--text-muted);background:rgba(154,162,196,0.12);border-radius:999px;padding:2px 7px;flex:0 0 auto;">Optional</span>`
    : '';
  return `<a href="${escapeHtml(item.href)}" class="checklist-item" style="display:flex;align-items:center;gap:10px;padding:5px 6px;border-radius:4px;">
    ${boxHtml}
    <span style="${labelStyle}">${escapeHtml(item.label)}</span>
    ${optionalTag}
  </a>`;
}

/** สไลด์ carousel แบบ "มีพรีวิวจริง" (ใช้กับการ์ดต้อนรับ/บอกลาที่ตั้งค่าไว้แล้ว)
 *  data-flex="1" — บอก showCarouselSlide() ว่าสไลด์นี้ต้องสลับกลับเป็น display:flex ตอนเปิด
 *  ไม่ใช่ display:block เหมือนสไลด์ static อื่นๆ (กัน layout เพี้ยนตอนสลับสไลด์) */
function realPreviewSlideHtml({ index, previewUrl, caption }) {
  return `<div id="carousel-slide-${index}" data-flex="1" style="display:${index === 0 ? 'flex' : 'none'};width:100%;height:100%;border-radius:5px;background:#0a0e1a;align-items:center;justify-content:center;overflow:hidden;">
    <img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(caption)}" style="max-width:100%;max-height:100%;object-fit:contain;" />
  </div>`;
}

/** สไลด์ carousel แบบ "ยังไม่เคยตั้งค่า" — ชวนไปตั้งค่าแทนที่จะโชว์การ์ดตัวอย่างปลอมๆ */
function notSetUpSlideHtml({ index, title, subtitle, gradient }) {
  return `<div id="carousel-slide-${index}" data-flex="1" style="display:${index === 0 ? 'flex' : 'none'};width:100%;height:100%;border-radius:5px;position:relative;overflow:hidden;background:${gradient};flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:0 32px;">
    <div style="font-size:19px;font-weight:700;color:#f9f8ff;">${escapeHtml(title)}</div>
    <div style="font-size:13px;color:rgba(249,248,255,0.7);">${escapeHtml(subtitle)}</div>
  </div>`;
}

/** สไลด์ carousel แบบ static ล้วนๆ (ระบบยศ/ฟอนต์/Builder — ไม่มีแนวคิด "รูปพรีวิว" แบบการ์ด) */
function staticSlideHtml(index, innerHtml, background) {
  return `<div id="carousel-slide-${index}" style="display:none;width:100%;height:100%;border-radius:5px;position:relative;overflow:hidden;background:${background};">${innerHtml}</div>`;
}

/**
 * สร้างหน้า Overview ทั้งหน้า
 * @param {object} opts
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {'free'|'premium'} opts.tier
 * @param {Array<{key:string,label:string,done:boolean,href:string,optional?:boolean}>} opts.checklistItems
 * @param {{configured:boolean, previewUrl:string|null}} opts.welcomeCard
 * @param {{configured:boolean, previewUrl:string|null}} opts.goodbyeCard
 */
function renderOverviewPage({ guild, user, botAvatarUrl, botName, tier, checklistItems, welcomeCard, goodbyeCard }) {
  const doneCount = checklistItems.filter((i) => i.done).length;
  const total = checklistItems.length;

  const guildIdSafe = guild.id; // Discord snowflake — ตัวเลขล้วนๆ เสมอ ปลอดภัยพอจะฝังใน href/JS ตรงๆ แต่ยัง escapeHtml ไว้ทุกจุดที่ใส่ลง HTML เพื่อความชัวร์

  // ── slide 0: การ์ดต้อนรับ ──────────────────────────────────────────────
  const welcomeSlide = welcomeCard.configured
    ? realPreviewSlideHtml({ index: 0, previewUrl: welcomeCard.previewUrl, caption: 'Welcome card preview' })
    : notSetUpSlideHtml({
        index: 0,
        title: 'Welcome card not set up yet',
        subtitle: 'Click to configure it →',
        gradient: 'linear-gradient(135deg, #171c38 0%, #262c58 55%, #3a3570 100%)',
      });

  // ── slide 1: ระบบยศอัตโนมัติ (static — อิงหน้าตาแชท Discord ตัวอย่างจาก mockup) ──
  const rolesSlide = staticSlideHtml(1, `
    <div style="height:100%;display:flex;align-items:center;padding:0 44px;">
      <div style="display:flex;gap:16px;width:100%;">
        <img src="${escapeHtml(botAvatarUrl)}" alt="" style="width:46px;height:46px;border-radius:999px;object-fit:cover;flex:0 0 auto;" />
        <div style="flex:1 1 auto;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:15px;font-weight:700;color:#f2f3f5;">${escapeHtml(botName)}</span>
            <span style="font-size:9px;font-weight:700;color:#fff;background:#5865f2;border-radius:2px;padding:1px 5px;">APP</span>
          </div>
          <div style="font-size:14.5px;color:#dbdee1;margin-top:8px;line-height:1.6;">Pick a role to get started!</div>
          <div style="display:flex;gap:8px;margin-top:16px;">
            <div style="background:#2b2d31;border:1px solid #3f4147;border-radius:3px;padding:5px 13px;display:flex;align-items:center;gap:6px;font-size:13.5px;color:#dbdee1;">😀 4</div>
            <div style="background:#2b2d31;border:1px solid #3f4147;border-radius:3px;padding:5px 13px;display:flex;align-items:center;gap:6px;font-size:13.5px;color:#dbdee1;">🎨 2</div>
            <div style="background:#2b2d31;border:1px solid #3f4147;border-radius:3px;padding:5px 13px;display:flex;align-items:center;gap:6px;font-size:13.5px;color:#dbdee1;">🎮 1</div>
          </div>
        </div>
      </div>
    </div>`, '#313338');

  // ── slide 2: ฟอนต์ (static) ─────────────────────────────────────────────
  const fontsSlide = staticSlideHtml(2, `
    <div style="position:absolute;top:36px;left:0;width:100%;text-align:center;font-size:12px;letter-spacing:0.14em;color:#9aa2c4;text-transform:uppercase;">Your Font, Your Style</div>
    <div style="position:absolute;top:98px;left:0;width:100%;text-align:center;font-size:21px;color:#f9f8ff;font-family:-apple-system,'Segoe UI',sans-serif;font-weight:700;">Aa Bb Cc — Modern</div>
    <div style="position:absolute;top:144px;left:0;width:100%;text-align:center;font-size:21px;color:#f9f8ff;font-family:Georgia,serif;">Aa Bb Cc — Serif</div>
    <div style="position:absolute;top:190px;left:0;width:100%;text-align:center;font-size:21px;color:#f9f8ff;font-family:'Courier New',monospace;">Aa Bb Cc — Mono</div>`,
    'linear-gradient(135deg, #171c38 0%, #262c58 55%, #3a3570 100%)');

  // ── slide 3: Builder (static — ตัวอย่างข้อความประกาศ) ───────────────────
  const builderSlide = staticSlideHtml(3, `
    <div style="height:100%;display:flex;align-items:center;padding:0 44px;">
      <div style="display:flex;gap:16px;width:100%;">
        <img src="${escapeHtml(botAvatarUrl)}" alt="" style="width:46px;height:46px;border-radius:999px;object-fit:cover;flex:0 0 auto;" />
        <div style="flex:1 1 auto;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:15px;font-weight:700;color:#f2f3f5;">${escapeHtml(botName)}</span>
            <span style="font-size:9px;font-weight:700;color:#fff;background:#5865f2;border-radius:2px;padding:1px 5px;">APP</span>
          </div>
          <div style="margin-top:12px;border-radius:3px;overflow:hidden;border-left:4px solid #b39cf0;max-width:420px;background:#2b2d31;padding:12px 15px;">
            <div style="font-size:11px;letter-spacing:0.12em;color:#9aa2c4;text-align:center;text-transform:uppercase;">Server Update</div>
            <div style="font-size:13px;color:#c3c8e6;margin-top:7px;line-height:1.5;">New event room is open for <span style="background:rgba(88,101,242,0.3);color:#c9cdfb;border-radius:2px;padding:0 4px;">@Members</span></div>
          </div>
        </div>
      </div>
    </div>`, '#313338');

  // ── slide 4: การ์ดบอกลา ─────────────────────────────────────────────────
  const goodbyeSlide = goodbyeCard.configured
    ? realPreviewSlideHtml({ index: 4, previewUrl: goodbyeCard.previewUrl, caption: 'Goodbye card preview' })
    : notSetUpSlideHtml({
        index: 4,
        title: 'Goodbye card not set up yet',
        subtitle: 'Click to configure it →',
        gradient: 'linear-gradient(135deg, #38221c 0%, #582c26 55%, #703a2f 100%)',
      });

  // ── slide 5: พรีเมียม (ข้อความเปลี่ยนไปตามสถานะจริงของเซิร์ฟ) ──────────
  const premiumSlide = tier === 'premium'
    ? staticSlideHtml(5, `
      <div style="position:absolute;top:28px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:7px;background:linear-gradient(90deg,#f4b860,#e2a04e);color:#0a0e1a;font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;padding:6px 18px;border-radius:999px;">${CROWN_ICON('#0a0e1a')} Premium active</div>
      <div style="position:absolute;top:100px;left:0;width:100%;text-align:center;padding:0 50px;font-size:14px;color:#f5e6c8;line-height:1.7;">Thanks for supporting Aitao Bot! Unlimited Builder drafts, GIF card backgrounds and member pings are all unlocked on this server.</div>`,
      'linear-gradient(135deg, #2c2312 0%, #453419 55%, #5c4620 100%)')
    : staticSlideHtml(5, `
      <div style="position:absolute;top:28px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:7px;background:linear-gradient(90deg,#f4b860,#e2a04e);color:#0a0e1a;font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;padding:6px 18px;border-radius:999px;">${CROWN_ICON('#0a0e1a')} Premium</div>
      <div style="position:absolute;top:82px;left:0;width:100%;padding:0 60px;">
        <div style="display:flex;align-items:center;gap:9px;font-size:14px;color:#f5e6c8;margin-top:8px;">${CROWN_ICON('#f4b860')} Unlimited Builder drafts</div>
        <div style="display:flex;align-items:center;gap:9px;font-size:14px;color:#f5e6c8;margin-top:14px;">${CROWN_ICON('#f4b860')} Animated GIF card backgrounds</div>
        <div style="display:flex;align-items:center;gap:9px;font-size:14px;color:#f5e6c8;margin-top:14px;">${CROWN_ICON('#f4b860')} Tag members inside messages</div>
      </div>`,
      'linear-gradient(135deg, #2c2312 0%, #453419 55%, #5c4620 100%)');

  const slidesHtml = [welcomeSlide, rolesSlide, fontsSlide, builderSlide, goodbyeSlide, premiumSlide].join('');
  const dotsHtml = [0, 1, 2, 3, 4, 5].map((i) => `<span id="carousel-dot-${i}" onclick="event.stopPropagation(); showCarouselSlide(${i})" style="width:6px;height:6px;border-radius:999px;background:${i === 0 ? 'var(--accent)' : 'var(--border)'};cursor:pointer;"></span>`).join('');

  // href ของแต่ละสไลด์ (กดตัว carousel เอง — ไม่ใช่จุด — พาไปหน้าฟีเจอร์นั้นจริง)
  const carouselHrefs = checklistItems.map((i) => i.href);

  const checklistHtml = checklistItems.map(checklistRowHtml).join('');

  const tierPillHtml = tier === 'premium'
    ? `<div title="Managed automatically by your subscription — upgrade or manage billing from the Premium page" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(244,184,96,0.15);border:1px solid rgba(244,184,96,0.4);font-size:12.5px;font-weight:700;color:var(--gold);">${CROWN_ICON('#f4b860')} Premium</div>`
    : `<div title="Managed automatically by your subscription — upgrade from the Premium page" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(154,162,196,0.12);border:1px solid var(--border);font-size:12.5px;font-weight:700;color:var(--text-muted);">Free</div>`;

  const bodyHtml = `
    <div style="padding:44px 56px;overflow:hidden;position:relative;">
      <!-- ภาพน้อง Milo จางๆ มุมขวาล่าง — ของจริงจาก public/images/ ไม่ใช่ mock (ดูข้อ 7 หัวไฟล์) -->
      <img src="/images/milo-hero.webp" alt="" style="position:absolute;right:-20px;bottom:-40px;width:560px;height:560px;object-fit:cover;object-position:80% 8%;opacity:0.3;filter:blur(3px) saturate(85%);-webkit-mask-image:radial-gradient(ellipse 300px 340px at 74% 55%, black 40%, transparent 85%);mask-image:radial-gradient(ellipse 300px 340px at 74% 55%, black 40%, transparent 85%);pointer-events:none;z-index:0;" />

      <div style="position:relative;z-index:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--text);">Overview</div>
            <div style="font-size:13.5px;color:var(--text-muted);margin-top:4px;">${escapeHtml(guild.name)} · Manage this server's bot settings</div>
          </div>
          ${tierPillHtml}
        </div>

        <div id="setupChecklist" style="margin-top:28px;background:var(--bg-card);border:1px solid var(--border);border-radius:5px;overflow:hidden;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="font-size:15px;font-weight:600;color:var(--text);">Get started with Aitao Bot</div>
              <div id="checklistCount" style="font-size:12px;font-weight:700;color:var(--gold);background:rgba(244,184,96,0.13);border-radius:999px;padding:3px 10px;">${doneCount}/${total} steps</div>
            </div>
            <button type="button" id="checklistToggleBtn" onclick="toggleChecklist()" style="background:none;border:none;color:var(--text-muted);font-size:12.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;padding:4px;">
              <span id="checklistToggleLabel">Hide</span>
              <svg id="checklistChevron" width="12" height="12" viewBox="0 0 24 24" fill="none" style="transition:transform .15s ease;"><path d="M7 9l5 5 5-5" stroke="#9aa2c4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>

          <div id="checklistDivider" style="height:1px;background:var(--border);"></div>

          <div id="checklistBody" style="display:flex;flex-wrap:wrap;">
            <div style="flex:1 1 320px;padding:24px 28px;border-right:1px solid var(--border);display:flex;flex-direction:column;align-items:center;">
              <div id="checklistCarousel" onclick="carouselClick()" onmouseenter="pauseCarouselAutoplay()" onmouseleave="startCarouselAutoplay()" style="width:100%;height:300px;border-radius:5px;cursor:pointer;position:relative;overflow:hidden;">
                ${slidesHtml}
              </div>
              <div style="display:flex;align-items:center;justify-content:center;gap:7px;margin-top:16px;">
                ${dotsHtml}
              </div>
            </div>

            <div style="flex:0 0 262px;padding:28px 18px;display:flex;flex-direction:column;justify-content:center;">
              <div id="checklistItems" style="display:flex;flex-direction:column;gap:18px;">
                ${checklistHtml}
              </div>
            </div>
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
    extraStyle: `
      .checklist-item:hover { background: rgba(124,131,253,0.08); }
      .upgrade-btn:hover { opacity: 0.88; }
    `,
  }) + `
<script>
  var CAROUSEL_COUNT = 6;
  var CAROUSEL_HREFS = ${JSON.stringify(carouselHrefs)};
  var carouselIndex = 0;

  function showCarouselSlide(i) {
    for (var k = 0; k < CAROUSEL_COUNT; k++) {
      var slide = document.getElementById('carousel-slide-' + k);
      var dot = document.getElementById('carousel-dot-' + k);
      if (slide) slide.style.display = (k === i) ? (slide.dataset.flex === '1' ? 'flex' : 'block') : 'none';
      if (dot) dot.style.background = (k === i) ? 'var(--accent)' : 'var(--border)';
    }
    carouselIndex = i;
  }

  var carouselTimer = null;
  function startCarouselAutoplay() {
    if (carouselTimer) return;
    carouselTimer = setInterval(function () { showCarouselSlide((carouselIndex + 1) % CAROUSEL_COUNT); }, 4000);
  }
  function pauseCarouselAutoplay() {
    if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null; }
  }
  startCarouselAutoplay();

  // กดที่ตัวพรีวิว (ไม่ใช่จุด) — พาไปหน้าตั้งค่าจริงของฟีเจอร์ที่กำลังโชว์อยู่ตอนนั้น
  function carouselClick() {
    var href = CAROUSEL_HREFS[carouselIndex];
    if (href) window.location.href = href;
  }

  var checklistCollapsed = false;
  function toggleChecklist() {
    checklistCollapsed = !checklistCollapsed;
    var bodyEl = document.getElementById('checklistBody');
    var dividerEl = document.getElementById('checklistDivider');
    var label = document.getElementById('checklistToggleLabel');
    var chevron = document.getElementById('checklistChevron');
    if (bodyEl) bodyEl.style.display = checklistCollapsed ? 'none' : 'flex';
    if (dividerEl) dividerEl.style.display = checklistCollapsed ? 'none' : 'block';
    if (label) label.textContent = checklistCollapsed ? 'Show' : 'Hide';
    if (chevron) chevron.style.transform = checklistCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
  }
</script>`;
}

module.exports = { renderOverviewPage };
