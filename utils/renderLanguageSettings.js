// utils/renderLanguageSettings.js
// ─────────────────────────────────────────────────────────────────────────
// หน้า "Language" จริงในแดชบอร์ด (แทนที่หน้า "เร็วๆ นี้" เดิม) — ให้แอดมินเซิร์ฟเลือกได้ว่า
// อยากให้บอทตอบข้อความ (embed/reply ต่างๆ ที่มาจาก utils/i18n.js) เป็นภาษาอังกฤษหรือไทย
// โดยไม่ต้องพิมพ์คำสั่ง /language ในดิสคอร์ดเองก็ได้ — ข้อมูลอ่าน/เขียนที่เดียวกับคำสั่ง
// /language เป๊ะๆ (utils/languageStorage.js → data/guild-language.json) เปลี่ยนจากหน้าไหน
// ก็เห็นผลเหมือนกันหมด ไม่มีระบบซ้อนทับกัน
//
// ⚠️ นี่คือภาษาที่ "บอทตอบกลับในดิสคอร์ด" เท่านั้น ไม่เกี่ยวกับภาษาของหน้าเว็บ (public/*.html)
// ที่มีปุ่มสลับ EN/TH ของตัวเองแยกต่างหาก (เก็บใน localStorage ฝั่งเบราว์เซอร์คนละระบบกัน —
// ดู public/js/site-lang.js) — สองอย่างนี้คนละเรื่องกันโดยตั้งใจ เลยเขียนคำอธิบายสั้นๆ กัน
// สับสนไว้ในตัวหน้าเลย (ดู headerSubtitle ด้านล่าง)
//
// รูปแบบฟอร์ม: ใช้ <form method="POST"> ธรรมดา ไม่มี JS/AJAX เลย (ตามธรรมเนียมของโปรเจกต์ที่
// ใช้กับ /premium/:guildId/checkout อยู่แล้ว) กด "Save" แล้วหน้ารีเฟรชเอง ง่ายและกันบั๊กจุกจิก
// ฝั่ง client ได้เยอะสำหรับหน้าแบบนี้ที่ไม่มีอะไรซับซ้อน — ตัวเลือกภาษาใช้ <input type="radio">
// ซ่อนไว้ + label ทั้งใบเป็นการ์ดที่กดเลือกได้ (label ครอบ input ทั้งก้อน มาตรฐาน HTML ปกติ
// ไม่ต้องพึ่ง JS เลย การ์ดที่ถูกเลือกจะไฮไลต์ด้วย CSS :has() ล้วนๆ)
// ─────────────────────────────────────────────────────────────────────────

const { escapeHtml } = require('./renderServerPicker');
const { renderDashboardLayout } = require('./dashboardShell');

/**
 * การ์ดตัวเลือกภาษา 1 ใบ — ทั้งใบเป็น <label> ครอบ radio ซ่อนไว้ กดตรงไหนของการ์ดก็เลือกได้
 * ไฮไลต์กรอบ+พื้นหลังตอนถูกเลือกด้วย CSS :has() (เบราว์เซอร์สมัยใหม่รองรับหมดแล้ว ไม่ต้องใช้ JS)
 * @param {{value:'en'|'th', flag:string, name:string, native:string, desc:string, checked:boolean}} opts
 */
function languageCardHtml({ value, flag, name, native, desc, checked }) {
  return `<label class="lang-card" style="display:flex;align-items:flex-start;gap:14px;padding:18px 20px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;background:var(--bg-card);">
    <input type="radio" name="lang" value="${value}" ${checked ? 'checked' : ''} style="margin-top:3px;accent-color:var(--accent);width:16px;height:16px;flex:0 0 auto;" />
    <div style="flex:1 1 auto;min-width:0;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:20px;line-height:1;">${flag}</span>
        <span style="font-size:15px;font-weight:700;color:var(--text);">${escapeHtml(name)}</span>
        <span style="font-size:12.5px;color:var(--text-muted);">${escapeHtml(native)}</span>
      </div>
      <div style="font-size:12.5px;color:var(--text-muted);margin-top:6px;line-height:1.6;">${escapeHtml(desc)}</div>
    </div>
  </label>`;
}

/**
 * หน้า Language settings เต็มหน้า
 * @param {object} opts
 * @param {{id:string,name:string,iconUrl:string|null}} opts.guild
 * @param {{id:string,username:string,avatar:string|null}} opts.user
 * @param {string} opts.botAvatarUrl
 * @param {string} opts.botName
 * @param {'en'|'th'} opts.currentLang  ภาษาปัจจุบันของเซิร์ฟนี้ (จาก getGuildLanguage())
 * @param {boolean} opts.saved          true = เพิ่งกด Save สำเร็จมา (มาจาก ?saved=1) โชว์แบนเนอร์ยืนยัน
 */
function renderLanguageSettingsPage({ guild, user, botAvatarUrl, botName, currentLang, saved }) {
  // แบนเนอร์ "บันทึกแล้ว" — โชว์แค่ตอนเพิ่งกด Save เสร็จ (redirect กลับมาพร้อม ?saved=1) ไม่ใช่
  // ทุกครั้งที่เปิดหน้า (เหมือนหน้า welcome card ที่ใช้ pattern query-string ชั่วคราวแบบนี้ตรง
  // ๆ อยู่แล้วสำหรับ error message — ที่นี่กลับด้านเป็นข้อความสำเร็จแทน)
  const savedBannerHtml = saved
    ? `<div style="display:flex;align-items:center;gap:10px;background:rgba(82,199,192,0.12);border:1px solid var(--teal);border-radius:6px;padding:12px 16px;margin-bottom:22px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="#52c7c0" stroke-width="1.8"/><path d="M8 12.5l2.5 2.5 5-5.5" stroke="#52c7c0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span style="font-size:13px;font-weight:600;color:var(--teal);">Saved! Aitao Bot will now reply in ${currentLang === 'th' ? 'Thai' : 'English'} on this server.</span>
      </div>`
    : '';

  const bodyHtml = `<div style="padding:44px 56px;max-width:640px;">
    <div style="font-size:24px;font-weight:700;color:var(--text);">Language</div>
    <div style="font-size:13.5px;color:var(--text-muted);margin-top:10px;line-height:1.7;">
      Choose the language Aitao Bot replies with on this server — greetings, command replies,
      and other bot messages. This is the same setting as the <code style="background:rgba(124,131,253,0.12);color:var(--accent);padding:1px 6px;border-radius:4px;font-size:12.5px;">/language</code>
      slash command in Discord, so changing it here updates that too (and vice versa).
      <br /><br />
      Note: this only changes what the <strong style="color:var(--text-muted-2);">bot</strong> speaks in Discord —
      it's separate from the EN/TH switch on this website (that one only changes what you see in your browser).
    </div>

    ${savedBannerHtml}

    <form method="POST" action="/dashboard/${encodeURIComponent(guild.id)}/language" style="margin-top:26px;">
      <style>
        /* :has() ไฮไลต์การ์ดที่ถูกเลือกอยู่ตอนนี้ — ล้วน CSS ไม่มี JS เลย */
        .lang-card:has(input:checked) { border-color: var(--accent) !important; background: rgba(124,131,253,0.08) !important; }
        .lang-card:hover { border-color: #3a4470; }
      </style>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${languageCardHtml({
          value: 'en',
          flag: '🇬🇧',
          name: 'English',
          native: '(English)',
          desc: 'Bot replies, greetings, and messages will be in English.',
          checked: currentLang !== 'th',
        })}
        ${languageCardHtml({
          value: 'th',
          flag: '🇹🇭',
          name: 'Thai',
          native: '(ภาษาไทย)',
          desc: 'บอทจะตอบกลับ ทักทาย และแสดงข้อความต่างๆ เป็นภาษาไทย',
          checked: currentLang === 'th',
        })}
      </div>

      <button type="submit" style="margin-top:24px;background:var(--accent);color:#fff;border:none;border-radius:6px;padding:11px 24px;font-size:13.5px;font-weight:700;cursor:pointer;">
        Save
      </button>
    </form>
  </div>`;

  return renderDashboardLayout({
    title: `Language — ${guild.name} — Aitao Bot`,
    guild,
    user,
    activeKey: 'language',
    botAvatarUrl,
    botName,
    bodyHtml,
  });
}

module.exports = { renderLanguageSettingsPage };
