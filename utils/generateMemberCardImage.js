// utils/generateMemberCardImage.js
// สร้าง "member card" แบบ static PNG — ใช้ในเธรดหลัก (main thread)
//
// ชื่อไฟล์/ฟังก์ชันเป็นกลางๆ (ไม่ใช่ "Welcome" อีกต่อไป) เพราะตรรกะข้างใน
// ไม่ได้ผูกกับ welcome โดยเฉพาะเลย — ใช้ร่วมกันได้ทั้ง /welcome-setup
// (การ์ดต้อนรับ) และ /goodbye-setup (การ์ดอำลา) เพราะทั้งคู่ต้องการแค่
// "รูป background + overlay + avatar + text blocks" เหมือนกันทุกอย่าง
//
// ⚠️ Animated GIF ไม่ได้สร้างในไฟล์นี้อีกต่อไป — ย้ายไปทำใน Worker Thread แล้ว
//    เพราะการ extract หลายสิบเฟรม + composite + encode ใช้เวลาเป็นวินาที
//    ถ้าทำในเธรดหลัก (event loop เดียวกับที่จัดการ Discord gateway events)
//    จะทำให้บอทค้าง ไม่ตอบสนอง interaction อื่นๆ ระหว่างนั้น
//
//    ดู utils/welcomeImageWorker.js  — โค้ด GIF generation จริง (รันใน worker thread)
//    ดู utils/imageWorkerPool.js     — ตัวจัดการ worker pool (เรียกจาก welcome-setup.js / goodbye-setup.js)
//
// ไฟล์นี้ยังใช้สำหรับ:
//   1. Preview ใน editor panel (เร็ว, ไม่บล็อกอะไรอยู่แล้วเพราะ PNG เร็วมาก)
//   2. Card จริงที่ background เป็น PNG/JPG/WebP ธรรมดา (ไม่ใช่ GIF)
//
// 📦 dependencies: @napi-rs/canvas (ผ่าน canvasDrawHelpers.js)

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const {
  DEFAULT_W,
  DEFAULT_H,
  drawFallbackBg,
  drawOverlay,
  drawAvatar,
  drawAllTextBlocks,
} = require('./canvasDrawHelpers');

// ─── Static PNG ──────────────────────────────────────────────────────────────

/**
 * สร้าง PNG จาก background URL จริงๆ (อ่านขนาดจาก image ไม่ hardcode)
 * ใช้สำหรับ: background ปกติ (PNG/JPG/WebP) + preview mode ของ GIF background
 * (กรณี background เป็น GIF ตอน preview — loadImage โหลด frame แรกมาเป็น static)
 */
async function generateMemberCardStatic(avatarImg, config) {
  let bgImage = null, canvasW = DEFAULT_W, canvasH = DEFAULT_H;
  if (config.backgroundUrl) {
    try {
      bgImage = await loadImage(config.backgroundUrl);
      canvasW = bgImage.width; canvasH = bgImage.height;
    } catch { /* URL ตาย → gradient fallback */ }
  }
  const canvas = createCanvas(canvasW, canvasH);
  const ctx    = canvas.getContext('2d');
  if (bgImage) { ctx.drawImage(bgImage, 0, 0, canvasW, canvasH); }
  else          { drawFallbackBg(ctx, canvasW, canvasH); }
  drawOverlay(ctx, config.overlayOpacity, canvasW, canvasH);
  if (config.avatarEnabled && avatarImg) drawAvatar(ctx, avatarImg, config, canvasW, canvasH);
  drawAllTextBlocks(ctx, config, canvasW, canvasH);
  return canvas.toBuffer('image/png');
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * สร้าง member card (ต้อนรับ หรือ อำลา แล้วแต่ config ที่ส่งมา) แบบ PNG (static เท่านั้น)
 *
 * ⚠️ ฟังก์ชันนี้ไม่สร้าง animated GIF อีกต่อไป — ถ้า background เป็น .gif
 *    และต้องการ GIF จริง (ข้อความจริง ไม่ใช่ preview) ให้ผู้เรียก
 *    (welcome-setup.js / goodbye-setup.js) เช็คเองแล้วเรียก
 *    imageWorkerPool.runWelcomeGifJob() แทน
 *
 * @param {import('discord.js').GuildMember | import('discord.js').User | null} memberOrUser
 * @param {object} config  card config (ดู DEFAULT_CONFIG ใน welcome-setup.js / goodbye-setup.js)
 * @returns {Promise<{ buffer: Buffer, ext: 'png' }>}
 */
async function generateMemberCardImage(memberOrUser, config) {
  let avatarImg = null;
  if (config.avatarEnabled && memberOrUser) {
    try {
      const avatarFn  = memberOrUser.user?.displayAvatarURL?.bind(memberOrUser.user)
                     ?? memberOrUser.displayAvatarURL?.bind(memberOrUser);
      const avatarUrl = avatarFn?.({ extension: 'png', size: 256, forceStatic: true });
      if (avatarUrl) avatarImg = await loadImage(avatarUrl);
    } catch { /* avatar โหลดไม่ได้ → วาดโดยไม่มี avatar */ }
  }

  const buffer = await generateMemberCardStatic(avatarImg, config);
  return { buffer, ext: 'png' };
}

module.exports = { generateMemberCardImage };