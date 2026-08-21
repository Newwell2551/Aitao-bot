// utils/canvasDrawHelpers.js
// ฟังก์ชันวาดที่ใช้ร่วมกันระหว่าง:
//   - utils/generateMemberCardImage.js (main thread — สร้าง PNG)
//   - utils/welcomeImageWorker.js      (worker thread — สร้าง animated GIF)
//
// แยกมาไว้ที่นี่ไฟล์เดียว เพื่อไม่ให้โค้ดวาดภาพ (wrapText, drawAvatar ฯลฯ)
// ถูก copy ซ้ำ 2 ที่ — ถ้าแก้ไขอนาคต (เช่น bug ใน wrapText) แก้ที่เดียวจบ
//
// ❗ หมายเหตุสำคัญเรื่อง worker_threads:
//   ไฟล์นี้ (และ GlobalFonts.registerFromPath) จะถูก require() แยกกันอิสระ
//   ทั้งใน main thread และในแต่ละ worker thread — เพราะ worker thread คือ
//   V8 isolate คนละตัว (เหมือนเปิด Node process ใหม่ในหัว) โมดูล native
//   อย่าง @napi-rs/canvas จึงต้อง register font ใหม่ทุกครั้งที่ require()
//   ในแต่ละ thread ซึ่งเป็นเรื่องปกติ ไม่ใช่บั๊ก — ทดสอบแล้วว่าทำงานถูกต้อง
//
// (ตัด custom emoji / NotoEmoji fallback ออกแล้วตามที่ตกลง — ข้อความเพียวๆ
// เร็วกว่า ไม่ต้องพึ่งไฟล์ฟอนต์เพิ่ม ไม่ต้อง async ทั้งสาย)

const { GlobalFonts } = require('@napi-rs/canvas');
const path             = require('path');

// ─── Register Fonts ────────────────────────────────────────────────────────────
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
try {
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Mali-Regular.ttf'),    'Mali');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Mali-Bold.ttf'),       'Mali');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Fredoka-Regular.ttf'), 'Fredoka');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Fredoka-Bold.ttf'),    'Fredoka');
  // ฟอนต์สไตล์เพิ่มเติมต่อ text block — เลือกได้จาก UI (default/charmonman/chonburi)
  // ทั้งสองตัวรองรับไทย+อังกฤษในไฟล์เดียว ไม่ต้องเช็ค hasThai() แยกเหมือน Mali/Fredoka
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Charmonman-Regular.ttf'), 'Charmonman');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Charmonman-Bold.ttf'),    'Charmonman');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Chonburi-Regular.ttf'),  'Chonburi');
  // Chonburi มีแค่ weight เดียว (ไม่มีไฟล์ Bold แยก) — ตั้งใจไม่ register ซ้ำด้วยชื่อเดียวกัน
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Kanit-Regular.ttf'),   'Kanit');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Kanit-Bold.ttf'),      'Kanit');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Sarabun-Regular.ttf'), 'Sarabun');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Sarabun-Bold.ttf'),    'Sarabun');
  // Kanit/Sarabun มี Bold ไฟล์จริงครบทั้งคู่ (ต่างจาก Chonburi) ไม่ต้องกันเหนียวเรื่อง bold
  console.log(`[canvasDrawHelpers] ✅ fonts โหลดสำเร็จครับ (thread: ${process.env.IS_WORKER ? 'worker' : 'main'})`);
} catch (e) {
  console.warn('[canvasDrawHelpers] ⚠️ โหลด fonts ไม่สำเร็จ ใช้ fallback:', e.message);
}

// Default canvas size — ใช้เฉพาะตอนไม่มี background (gradient fallback)
const DEFAULT_W = 800;
const DEFAULT_H = 300;

// ─── Font Helpers ─────────────────────────────────────────────────────────────

/** ตรวจว่ามีตัวอักษรไทยใน Unicode range U+0E00–U+0E7F */
function hasThai(text) {
  return /[\u0E00-\u0E7F]/.test(text);
}

/**
 * เลือก font family ตาม fontStyle ที่ user เลือกไว้ต่อ block (ถ้ามี)
 * ไม่งั้น fallback เป็นพฤติกรรมเดิม: ไทย → Mali | อังกฤษ → Fredoka
 *
 * Charmonman/Chonburi/Kanit/Sarabun รองรับทั้งไทย+อังกฤษในไฟล์เดียว
 * ไม่ต้องเช็ค hasThai() แยกเหมือน Mali/Fredoka — เลือกฟอนต์เดียวจบทั้งบล็อก
 *
 * @param {string} text
 * @param {string} [fontStyle] - 'default' | 'charmonman' | 'chonburi' | 'kanit' | 'sarabun' | undefined
 */
function pickFontFamily(text, fontStyle) {
  if (fontStyle === 'charmonman') return 'Charmonman, sans-serif';
  if (fontStyle === 'chonburi')   return 'Chonburi, sans-serif';
  if (fontStyle === 'kanit')      return 'Kanit, sans-serif';
  if (fontStyle === 'sarabun')    return 'Sarabun, sans-serif';
  // default (undefined/'default') → พฤติกรรมเดิมเป๊ะ ไม่เปลี่ยนอะไร
  return hasThai(text) ? 'Mali, sans-serif' : 'Fredoka, sans-serif';
}

// ─── wrapText ─────────────────────────────────────────────────────────────────

/**
 * word-wrap ข้อความ "1 ย่อหน้า" (ไม่มี \n ภายใน) ตาม maxWidth
 * ❗ ต้อง set ctx.font ก่อนเรียก ไม่งั้นวัดขนาดผิด
 * @returns {number} y ของบรรทัดสุดท้ายที่วาดในย่อหน้านี้
 */
function wrapParagraph(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return y;
  const words = text.split(' ');
  let line = '', currentY = y;
  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      if (line) { ctx.fillText(line, x, currentY); currentY += lineHeight; line = ''; }
      let charLine = '';
      for (const char of word) {
        const test = charLine + char;
        if (ctx.measureText(test).width > maxWidth && charLine !== '') {
          ctx.fillText(charLine, x, currentY); currentY += lineHeight; charLine = char;
        } else { charLine = test; }
      }
      line = charLine;
      continue;
    }
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line !== '') {
      ctx.fillText(line, x, currentY); currentY += lineHeight; line = word;
    } else { line = testLine; }
  }
  if (line) ctx.fillText(line, x, currentY);
  return currentY;
}

/**
 * วาดข้อความแบบ multi-line — รองรับทั้ง \n ที่ผู้ใช้พิมพ์เอง (กด Enter ใน modal)
 * และ word-wrap อัตโนมัติเมื่อยาวเกิน maxWidth
 * @returns {number} y ของบรรทัดสุดท้ายที่วาดทั้งหมด
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return y;
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  let currentY = y;
  for (let i = 0; i < paragraphs.length; i++) {
    currentY = wrapParagraph(ctx, paragraphs[i], x, currentY, maxWidth, lineHeight);
    if (i < paragraphs.length - 1) currentY += lineHeight;
  }
  return currentY;
}

// ─── ฟังก์ชันวาดย่อย (รับ w, h ทุกตัว — ไม่ hardcode) ────────────────────────

function drawFallbackBg(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#1a1a2e'); grad.addColorStop(0.5, '#16213e'); grad.addColorStop(1, '#0f3460');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
}

function drawOverlay(ctx, opacity, w, h) {
  ctx.fillStyle = `rgba(0,0,0,${opacity / 100})`;
  ctx.fillRect(0, 0, w, h);
}

function drawAvatar(ctx, avatarImg, config, w, h) {
  const ax = (config.avatarX      / 100) * w;
  const ay = (config.avatarY      / 100) * h;
  const r  = (config.avatarRadius / 100) * h;
  ctx.save();
  ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  ctx.drawImage(avatarImg, ax - r, ay - r, r * 2, r * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); ctx.stroke();
}

/**
 * วาดข้อความ 1 "block" — รับ block object เดี่ยว { content, x, y, size, bold, fontStyle }
 */
function drawTextBlock(ctx, block, w, h) {
  const text = block.content || '';
  if (!text) return;
  const tx = (block.x / 100) * w;
  const ty = (block.y / 100) * h;
  const fontStyle  = block.fontStyle || 'default';
  // 🔒 กันเหนียว: Chonburi ไม่มี Bold จริง (มีแค่ weight เดียว) — ไม่ว่า
  // block.bold จะเป็น true ค้างมาจากตอนใช้ฟอนต์อื่นก่อนสลับมาหรือไม่ก็ตาม
  // บังคับ fontWeight ว่างเสมอเมื่อเลือก Chonburi อยู่
  const fontWeight = (fontStyle === 'chonburi') ? '' : (block.bold ? 'bold ' : '');
  const fontSizePx = (block.size / 100) * h;

  ctx.font = `${fontWeight}${fontSizePx}px ${pickFontFamily(text, fontStyle)}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffffff';
  wrapText(ctx, text, tx, ty, w * 0.85, Math.ceil(fontSizePx * 1.35));
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
}

/**
 * วาดทุก text block ที่มีใน config.textBlocks (loop ผ่านแต่ละ block อิสระ)
 */
function drawAllTextBlocks(ctx, config, w, h) {
  const blocks = config.textBlocks ?? [];
  for (const block of blocks) {
    drawTextBlock(ctx, block, w, h);
  }
}

module.exports = {
  DEFAULT_W,
  DEFAULT_H,
  hasThai,
  pickFontFamily,
  wrapParagraph,
  wrapText,
  drawFallbackBg,
  drawOverlay,
  drawAvatar,
  drawTextBlock,
  drawAllTextBlocks,
};