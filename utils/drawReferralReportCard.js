// utils/drawReferralReportCard.js
// ─────────────────────────────────────────────────────────────────────────
// วาดการ์ดรายงานยอดค่าคอมของ #referral-earnings เป็น "รูปภาพจริง" (PNG) — ไม่ใช่
// Discord Embed อีกต่อไป ตามที่น้องหนาวขอ (ดูภาพเรฟ "MAMOMI STORE" ที่ส่งมา) — กล่อง
// สถิติแต่ละช่องมีกรอบ/พื้นหลังแยกชิ้นจริงๆ จัดตารางเป๊ะๆ ด้วยพิกัดพิกเซลตรงๆ ไม่ใช่
// unicode/markdown ที่ Discord จัดให้เอง เพราะ Embed ทำแบบนั้นไม่ได้จริงๆ
//
// แนวทางเดียวกับ utils/generateMemberCardImage.js เป๊ะๆ:
//   - ใช้ createCanvas/loadImage จาก @napi-rs/canvas
//   - ยืมฟอนต์ที่ลงทะเบียนไว้แล้วใน utils/canvasDrawHelpers.js (ไม่ต้อง register ซ้ำ)
//   - ยืมระบบโหลด+แคชรูปอิโมจิ (preloadEmojisForBlocks / getCachedEmojiImage) จาก
//     canvasDrawHelpers.js แทนการเขียน fetch+cache เองใหม่ทั้งหมด
//
// 🆕 หมายเหตุสำคัญ — ทำไมเลิกใช้ระบบ "custom emoji ของเซิร์ฟ Milo Support"
// (EMOJI_SLOTS/resolveEmoji ของเดิมในไฟล์ referralReportChannel.js) ไปเลย:
//   ระบบเดิมออกแบบไว้สำหรับแปะ <:name:id> ลงในข้อความ Discord (ให้ Discord render เอง
//   ตอนแสดงผล) แต่ตอนนี้เราวาดไอคอนเป็น "พิกเซลจริง" ลงในรูปภาพเองแล้ว เลยไม่มีเหตุผล
//   ต้องพึ่งอิโมจิที่ต้องไปสร้างไว้ในเซิร์ฟ Milo Support ก่อนอีกต่อไป — ใช้อิโมจิ Unicode
//   มาตรฐานตรงๆ ผ่าน preloadEmojisForBlocks (โหลดรูปจาก Twemoji CDN เหมือนที่การ์ด
//   ต้อนรับ/อำลาใช้อยู่แล้ว) ง่ายกว่า ไม่ต้องให้น้องหนาวไปสร้างอิโมจิ 7 ตัวเพิ่มเลยครับ
//   (การตัดสินใจนี้ถือเป็นการเลือกทางที่สมเหตุสมผลที่สุดจากทิศทางที่คุยกันไว้แล้ว —
//   "วาดเป็นรูปภาพจริง" — ไม่ใช่การเปลี่ยนทิศทางใหม่)
//
// ⚠️ เรื่อง "อัปเดตล่าสุด" — Embed เดิมใช้ .setTimestamp() ซึ่ง Discord แปลงเป็นเวลา
// สัมพัทธ์ให้เองอัตโนมัติ (เช่น "2 นาทีที่แล้ว") แต่รูปภาพทำแบบนั้นไม่ได้ (วาดครั้งเดียว
// จบ ไม่ใช่ live widget) เลยเปลี่ยนเป็น "เวลาปัจจุบัน ณ ตอนวาด" แบบข้อความตรงๆ แทน
// (เช่น "19 ก.ย. 2569 23:45 น.") ถือเป็นข้อแลกเปลี่ยนที่ยอมรับได้ของการเปลี่ยนจาก
// Embed มาเป็นรูปภาพ — ยังบอกได้อยู่ว่าข้อมูลนี้อัปเดตล่าสุดตอนไหน แค่ไม่ใช่แบบสัมพัทธ์
// ─────────────────────────────────────────────────────────────────────────

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { preloadEmojisForBlocks, getCachedEmojiImage } = require('./canvasDrawHelpers');

// ─── ชุดสี — ใช้จานสีเดียวกับ public/pricing.html / utils/dashboardShell.js เป๊ะๆ
// (ดูคอมเมนต์ใน renderPremiumBilling.js) เพื่อให้ทุกหน้า/ทุกการ์ดของบอทไปในทิศทาง
// เดียวกันหมด ไม่ใช่สุ่มสีเอาเองใหม่ต่อไฟล์
const COLOR = {
  bg: '#0a0e1a',
  bgCard: '#131a2e',
  boxBg: '#1a2138',       // เข้มกว่า bgCard นิดนึง ให้กล่องสถิติแยกออกจากพื้นหลังชัดๆ
  border: '#262f4d',
  text: '#f3f1fb',
  textMuted: '#9aa2c4',
  textMuted2: '#8890b0',
  accent: '#7c83fd',
  accentHover: '#5f65e0',
  gold: '#f4b860',
  teal: '#52c7c0',
  green: '#57f287',       // สีสถานะ "เปิดใช้งานอยู่" — เขียวเดียวกับที่การ์ดพรีเมียมใช้
  gray: '#99aab5',        // สีสถานะ "ปิดใช้งานแล้ว"
};

const MASCOT_PATH = path.join(__dirname, '..', 'public', 'images', 'milo-avatar.webp');

const ICON = {
  title: '📊',
  statusActive: '🟢',
  statusInactive: '🔴',
  uses: '🔁',
  perUse: '💸',
  total: '💰',
};

const W = 760;
const H = 600;
const PAD = 28;

// ─── รูปมาสคอต — โหลดจากดิสก์ครั้งเดียวแล้วแคชไว้ในหน่วยความจำ (ไม่ต้องอ่านไฟล์ใหม่
// ทุกครั้งที่มีเหตุการณ์ใหม่มาให้การ์ดอัปเดต ซึ่งเกิดได้บ่อยพอสมควร) — โหลดจาก path บนดิสก์
// ตรงๆ (ไม่ใช่ URL ผ่านเน็ต) เพราะไฟล์นี้อยู่ในโฟลเดอร์ public/images/ ของโปรเจกต์เดียวกัน
// อยู่แล้ว ไม่ต้องพึ่งเว็บที่ deploy อยู่เลย เร็วกว่าและไม่มีทางล่มเพราะเน็ตขาด
let mascotImagePromise = null;
function loadMascotImage() {
  if (!mascotImagePromise) {
    mascotImagePromise = loadImage(MASCOT_PATH).catch((e) => {
      console.warn('[drawReferralReportCard] โหลดรูปมาสคอตไม่สำเร็จ (จะวาดการ์ดแบบไม่มีมาสคอตแทน):', e.message);
      return null;
    });
  }
  return mascotImagePromise;
}

/** วาด path สี่เหลี่ยมมุมโค้ง — ไม่ fill/stroke เอง ผู้เรียกตั้ง fillStyle/strokeStyle แล้วเรียก fill()/stroke() ต่อเอง */
function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** วาดไอคอนอิโมจิ 1 ตัว จุดกึ่งกลางที่ (cx, cy) ขนาด size — ถ้าโหลดไม่สำเร็จ (null) ข้ามไปเฉยๆ ไม่พัง */
function drawIcon(ctx, rawEmoji, cx, cy, size) {
  const img = getCachedEmojiImage(rawEmoji);
  if (!img) return;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

/** วาดข้อความบรรทัดเดียว จัดกึ่งกลางแนวนอนที่ x — คืนไม่มีค่า (ใช้เพื่อความสั้นกระชับ ลดโค้ดซ้ำๆ) */
function drawCenteredText(ctx, text, x, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

/**
 * วาดกล่องสถิติเล็ก 1 ช่อง (ใช้กับแถวบน 3 ช่อง: สถานะ / ใช้ไปแล้ว / ค่าคอมต่อครั้ง)
 * @param {{x:number,y:number,w:number,h:number,icon:string,label:string,value:string,valueColor:string}} opt
 */
function drawStatBox(ctx, opt) {
  const { x, y, w, h, icon, label, value, valueColor } = opt;
  roundedRectPath(ctx, x, y, w, h, 14);
  ctx.fillStyle = COLOR.boxBg;
  ctx.fill();
  roundedRectPath(ctx, x, y, w, h, 14);
  ctx.strokeStyle = COLOR.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const cx = x + w / 2;
  drawIcon(ctx, icon, cx, y + 32, 28);
  drawCenteredText(ctx, label, cx, y + 56, '15px Sarabun', COLOR.textMuted);
  drawCenteredText(ctx, value, cx, y + 82, 'bold 24px Kanit', valueColor);
}

/**
 * สร้างรูปการ์ดรายงานยอดค่าคอมของโค้ด 1 อัน เป็น PNG buffer
 *
 * ⚠️ ฟังก์ชันนี้ต้อง "ไม่มีทาง throw error ออกไปนอกฟังก์ชัน" เด็ดขาด เหมือนกฎเดิมของ
 * ทั้งไฟล์ referralReportChannel.js (ห้องรายงานเป็นแค่ของเสริม ไม่ใช่ core flow จ่ายเงิน)
 * — ผู้เรียก (syncCodeReportMessage) จะ catch ครอบอีกชั้นอยู่แล้ว แต่กันเหนียวไว้ในนี้ด้วย
 *
 * @param {object} stats
 * @param {string} stats.code
 * @param {string} stats.sellerLabel
 * @param {boolean} stats.active
 * @param {number} stats.totalUses
 * @param {number} stats.totalCommissionThb
 * @param {number} stats.commissionPerUseThb ค่าคอมต่อการใช้โค้ดสำเร็จ 1 ครั้ง (บาท)
 * @param {string} stats.rangeLabel ป้ายช่วงเวลาที่กำลังโชว์ (เช่น "วันนี้"/"เดือนนี้"/"ทั้งหมด")
 * @returns {Promise<Buffer>} PNG buffer พร้อมส่งเป็น AttachmentBuilder ได้เลย
 */
async function drawReferralReportCard(stats) {
  try {
    const {
      code, sellerLabel, active, totalUses,
      totalCommissionThb, commissionPerUseThb, rangeLabel,
    } = stats;

    // เตรียมรูปอิโมจิทุกตัวที่การ์ดนี้ต้องใช้ให้พร้อมก่อนเริ่มวาดจริง (ต้อง await ก่อน
    // เสมอ เพราะขั้นตอนวาดข้างล่างเป็น sync ล้วนๆ วาดรูปที่ยังโหลดไม่เสร็จไม่ได้)
    // — ส่งเป็น "1 block ข้อความรวมทุกไอคอน" ให้ preloadEmojisForBlocks สแกนหาเอง
    const statusIcon = active ? ICON.statusActive : ICON.statusInactive;
    await preloadEmojisForBlocks([
      { content: `${ICON.title}${statusIcon}${ICON.uses}${ICON.perUse}${ICON.total}` },
    ]);
    const mascotImg = await loadMascotImage();

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ── พื้นหลังการ์ดทั้งใบ (gradient เข้มๆ โทนเดียวกับหน้าเว็บ)
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, COLOR.bgCard);
    bgGrad.addColorStop(1, COLOR.bg);
    roundedRectPath(ctx, 0, 0, W, H, 24);
    ctx.fillStyle = bgGrad;
    ctx.fill();
    roundedRectPath(ctx, 1, 1, W - 2, H - 2, 24);
    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── หัวการ์ด: ไอคอนป้าย + ชื่อโค้ด + ผู้ขาย + ป้ายช่วงเวลามุมขวา
    roundedRectPath(ctx, PAD, PAD, 56, 56, 14);
    ctx.fillStyle = COLOR.accent;
    ctx.fill();
    drawIcon(ctx, ICON.title, PAD + 28, PAD + 28, 30);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 26px Kanit';
    ctx.fillStyle = COLOR.text;
    ctx.fillText(`โค้ด: ${code}`, PAD + 56 + 16, PAD + 2);
    ctx.font = '16px Sarabun';
    ctx.fillStyle = COLOR.textMuted;
    ctx.fillText(`ผู้ขาย: ${sellerLabel}`, PAD + 56 + 16, PAD + 36);

    // ป้ายช่วงเวลา มุมขวาบน — วัดความกว้างข้อความก่อนเพื่อวาดกรอบพอดีตัว
    ctx.font = 'bold 14px Kanit';
    const rangeText = rangeLabel;
    const rangeTextW = ctx.measureText(rangeText).width;
    const pillPadX = 16;
    const pillW = rangeTextW + pillPadX * 2;
    const pillH = 30;
    const pillX = W - PAD - pillW;
    const pillY = PAD + 4;
    roundedRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = COLOR.boxBg;
    ctx.fill();
    roundedRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.strokeStyle = COLOR.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawCenteredText(ctx, rangeText, pillX + pillW / 2, pillY + 8, 'bold 14px Kanit', COLOR.accent);

    // เส้นคั่นใต้หัวการ์ด
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + 100);
    ctx.lineTo(W - PAD, PAD + 100);
    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── แถวกล่องสถิติเล็ก 3 ช่อง: สถานะ / ใช้ไปแล้ว / ค่าคอมต่อครั้ง
    const row1Y = PAD + 118;
    const row1H = 132;
    const gap = 16;
    const boxW = (W - PAD * 2 - gap * 2) / 3;

    drawStatBox(ctx, {
      x: PAD, y: row1Y, w: boxW, h: row1H,
      icon: statusIcon,
      label: 'สถานะ',
      value: active ? 'เปิดใช้งาน' : 'ปิดใช้งาน',
      valueColor: active ? COLOR.green : COLOR.gray,
    });
    drawStatBox(ctx, {
      x: PAD + boxW + gap, y: row1Y, w: boxW, h: row1H,
      icon: ICON.uses,
      label: 'ใช้ไปแล้ว',
      value: `${totalUses} ครั้ง`,
      valueColor: COLOR.teal,
    });
    drawStatBox(ctx, {
      x: PAD + (boxW + gap) * 2, y: row1Y, w: boxW, h: row1H,
      icon: ICON.perUse,
      label: 'ค่าคอมต่อครั้ง',
      value: `${commissionPerUseThb} บาท`,
      valueColor: COLOR.gold,
    });

    // ── กล่องรวมรายได้ (เต็มความกว้าง เน้นสีทอง — เป็นตัวเลขหลักที่อยากให้เด่นสุด)
    const totalY = row1Y + row1H + gap;
    const totalH = 104;
    roundedRectPath(ctx, PAD, totalY, W - PAD * 2, totalH, 16);
    const totalGrad = ctx.createLinearGradient(PAD, totalY, W - PAD, totalY + totalH);
    totalGrad.addColorStop(0, '#241d10');
    totalGrad.addColorStop(1, COLOR.boxBg);
    ctx.fillStyle = totalGrad;
    ctx.fill();
    roundedRectPath(ctx, PAD, totalY, W - PAD * 2, totalH, 16);
    ctx.strokeStyle = COLOR.gold;
    ctx.lineWidth = 2;
    ctx.stroke();

    drawIcon(ctx, ICON.total, PAD + 48, totalY + totalH / 2, 48);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '16px Sarabun';
    ctx.fillStyle = COLOR.textMuted;
    ctx.fillText(`รวมรายได้ (${rangeLabel})`, PAD + 96, totalY + 24);
    ctx.font = 'bold 38px Kanit';
    ctx.fillStyle = COLOR.gold;
    ctx.fillText(`${totalCommissionThb} บาท`, PAD + 96, totalY + 48);

    // ── แบนเนอร์มาสคอตด้านล่าง (ตามที่น้องหนาวขอ — โลโก้/มาสคอตใต้กล่องสถิติ)
    const bannerY = totalY + totalH + 24;
    const bannerH = 140;
    roundedRectPath(ctx, PAD, bannerY, W - PAD * 2, bannerH, 18);
    const bannerGrad = ctx.createLinearGradient(PAD, bannerY, W - PAD, bannerY + bannerH);
    bannerGrad.addColorStop(0, '#1c1440');
    bannerGrad.addColorStop(1, COLOR.bgCard);
    ctx.fillStyle = bannerGrad;
    ctx.fill();
    roundedRectPath(ctx, PAD, bannerY, W - PAD * 2, bannerH, 18);
    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const mascotR = 50;
    const mascotCx = PAD + 24 + mascotR;
    const mascotCy = bannerY + bannerH / 2;
    if (mascotImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(mascotCx, mascotCy, mascotR, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(mascotImg, mascotCx - mascotR, mascotCy - mascotR, mascotR * 2, mascotR * 2);
      ctx.restore();
      ctx.strokeStyle = COLOR.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mascotCx, mascotCy, mascotR, 0, Math.PI * 2);
      ctx.stroke();
    }

    const wordmarkX = mascotCx + mascotR + 28;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 28px Kanit';
    ctx.fillStyle = COLOR.text;
    ctx.fillText('Aitao Bot', wordmarkX, mascotCy - 26);
    ctx.font = '15px Sarabun';
    ctx.fillStyle = COLOR.textMuted;
    ctx.fillText('ระบบรายงานค่าคอมมิชชั่นอัตโนมัติ', wordmarkX, mascotCy + 6);
    ctx.fillStyle = COLOR.textMuted2;
    ctx.fillText('ขอบคุณที่ร่วมงานกับเรานะครับ', wordmarkX, mascotCy + 28);

    // ── ข้อความท้ายการ์ด: เวลาที่อัปเดต (ดูคอมเมนต์หัวไฟล์เรื่องทำไมเปลี่ยนจาก timestamp สัมพัทธ์)
    const updatedAt = new Date().toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok',
    });
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = '13px Sarabun';
    ctx.fillStyle = COLOR.textMuted2;
    ctx.fillText(`อัปเดตล่าสุด: ${updatedAt} น.`, W - PAD, bannerY + bannerH + 14);

    return canvas.toBuffer('image/png');
  } catch (error) {
    // ไม่ throw ออกไปนอกฟังก์ชันเด็ดขาด (ดู JSDoc ด้านบน) — คืน null แทน แล้วให้ผู้เรียก
    // (referralReportChannel.js) ตัดสินใจเองว่าจะ fallback ยังไง (เช่น ข้ามการอัปเดตรอบนี้)
    console.warn('[drawReferralReportCard] วาดการ์ดไม่สำเร็จ:', error);
    return null;
  }
}

module.exports = { drawReferralReportCard };
