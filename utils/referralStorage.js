// utils/referralStorage.js
// เก็บข้อมูลระบบ "โค้ดส่วนลดพ่อค้าแม่ค้า" (referral campaign) ทั้งหมดไว้ที่นี่ที่เดียว
// เก็บเป็นไฟล์เดียว: data/referral-codes.json (pattern เดียวกับ tierManager.js —
// อ่าน/เขียนทั้งไฟล์ทุกครั้ง เพราะข้อมูลเล็ก ไม่จำเป็นต้องใช้ database จริงจัง)
//
// โครงสร้างข้อมูลในไฟล์:
// {
//   "codes": {
//     "KITTY10": {
//       "sellerLabel": "@kittyarts",          ← ชื่อ/แฮนเดิลผู้ขาย (โชว์ในรายงาน)
//       "sellerDiscordId": "123456789012345", ← Discord user ID ผู้ขาย (ใช้ DM แจ้งค่าคอม, ใส่ null ได้ถ้าไม่รู้)
//       "stripeCouponId": "coupon_xxx",       ← อ้างอิงไว้เฉยๆ เผื่อต้องไปดูใน Stripe Dashboard
//       "stripePromotionCodeId": "promo_xxx", ← ตัวจริงที่ใช้แนบเข้า Checkout Session
//       "active": true,                       ← false = โค้ดถูกปิดใช้งานแล้ว (แต่ประวัติยังอยู่)
//       "createdAt": "2026-09-17T12:00:00.000Z"
//     }
//   },
//   "pendingRedemptions": {
//     "cs_test_XXXX": { "guildId": "...", "code": "KITTY10", "sellerLabel": "@kittyarts", "createdAt": "..." }
//     // ← บันทึกไว้ "ตอนสร้าง Checkout Session" (ยังไม่รู้ว่าจะจ่ายเงินสำเร็จไหม)
//     // แล้วไปเช็ค/ลบออกตอน webhook checkout.session.completed มาถึงจริง (ดู completeRedemption)
//   },
//   "usedCodesByGuild": {
//     "guildId1": ["KITTY10", "MEOW5"]  ← เซิร์ฟนี้เคยใช้โค้ดไหนไปแล้วบ้าง (กันใช้โค้ดเดิมซ้ำ)
//   },
//   "commissionLog": [
//     {
//       "code": "KITTY10", "sellerLabel": "@kittyarts", "sellerDiscordId": "...",
//       "guildId": "...", "checkoutSessionId": "cs_...",
//       "commissionThb": 5, "completedAt": "2026-09-17T12:05:00.000Z"
//     }
//   ]
// }
//
// 🔑 หลักการสำคัญที่สุดของไฟล์นี้ (ตามที่น้องหนาวตั้งใจไว้):
//   1. โค้ด "หนึ่งโค้ด" ใช้ได้กับ "หลายเซิร์ฟ" (ไม่ได้จำกัดแค่คนแรกที่ใช้)
//   2. แต่ "เซิร์ฟเดียวกัน" ใช้ "โค้ดเดียวกันซ้ำ" ไม่ได้ (กันเกรียนกดรับส่วนลดซ้ำๆ)
//      → ถ้าจะได้ส่วนลดอีกรอบ ต้องรอโค้ด "ใหม่" จากผู้ขาย (โค้ดคนละตัว)
//   3. ทุกอย่างที่เป็น "ยืนยันแล้วจริง" (ใช้โค้ดสำเร็จ / ได้ค่าคอม) ต้องมาจาก Stripe webhook
//      เท่านั้น ห้ามนับจากแค่ "กรอกโค้ดในมือถือ" เพราะอาจจะกรอกแล้วไม่จ่ายเงินจริงก็ได้

const fs = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'referral-codes.json');

// ค่าคอมต่อการใช้โค้ด 1 ครั้ง (บาท) — คงที่ตามที่น้องหนาวกำหนด ถ้าจะปรับในอนาคต
// แก้เลขตรงนี้ที่เดียวพอ ไม่ต้องไปไล่หาในไฟล์อื่น
const COMMISSION_PER_REDEMPTION_THB = 5;

/**
 * โครงสร้างไฟล์เริ่มต้น (ตอนยังไม่เคยมีไฟล์เลย)
 */
function emptyData() {
  return {
    codes: {},
    pendingRedemptions: {},
    usedCodesByGuild: {},
    commissionLog: [],
  };
}

/**
 * เช็คว่ามีโฟลเดอร์ data/ และไฟล์ referral-codes.json อยู่ไหม ถ้าไม่มีให้สร้างให้อัตโนมัติ
 */
function ensureFileExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(emptyData(), null, 2), 'utf8');
  }
}

/**
 * อ่านข้อมูลทั้งไฟล์ออกมาเป็น object เดียว
 * @returns {object}
 */
function readAll() {
  ensureFileExists();
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  try {
    const data = JSON.parse(raw);
    // กันไฟล์เก่า/เสียที่ขาด key บางตัวไป (เช่นแก้มือ) — เติม default ให้ครบเสมอ
    return { ...emptyData(), ...data };
  } catch (error) {
    console.error('[referralStorage] อ่านไฟล์ referral-codes.json ไม่ได้ (JSON เสีย):', error);
    return emptyData();
  }
}

/**
 * เขียนข้อมูลทั้ง object กลับลงไฟล์ (เขียนทับของเดิมทั้งหมด)
 * @param {object} data
 */
function writeAll(data) {
  ensureFileExists();
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * ปรับโค้ดให้เป็นรูปแบบมาตรฐานก่อนเทียบ/บันทึกเสมอ (ตัดช่องว่าง + ตัวพิมพ์ใหญ่ทั้งหมด)
 * กัน "kitty10" กับ "KITTY10" กับ " KITTY10 " ถูกนับเป็นคนละโค้ดกัน
 * @param {string} code
 */
function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * บันทึกโค้ดใหม่ 1 อัน (เรียกจาก /referral add ตอนแอดมิน/เจ้าของบอทสร้างโค้ดให้ผู้ขาย)
 * ถ้าโค้ดนี้มีอยู่แล้ว จะ "เขียนทับ" ข้อมูลเดิม (เผื่อแก้ sellerLabel ทีหลัง)
 *
 * @param {string} code
 * @param {{ sellerLabel: string, sellerDiscordId: string|null, stripeCouponId: string, stripePromotionCodeId: string }} info
 */
function saveCode(code, { sellerLabel, sellerDiscordId, stripeCouponId, stripePromotionCodeId }) {
  const data = readAll();
  const key = normalizeCode(code);
  data.codes[key] = {
    sellerLabel,
    sellerDiscordId: sellerDiscordId || null,
    stripeCouponId,
    stripePromotionCodeId,
    active: true,
    createdAt: new Date().toISOString(),
  };
  writeAll(data);
  return data.codes[key];
}

/**
 * ดึงข้อมูลโค้ด 1 อัน (คืน null ถ้าไม่เจอ หรือโค้ดถูกปิดใช้งานแล้ว)
 * @param {string} code
 * @returns {object|null}
 */
function getActiveCode(code) {
  const data = readAll();
  const entry = data.codes[normalizeCode(code)];
  if (!entry || !entry.active) return null;
  return entry;
}

/**
 * ปิดใช้งานโค้ด (ไม่ลบทิ้ง เก็บประวัติไว้ — เผื่อผู้ขายคนนั้นเลิกทำ affiliate หรือโค้ดหลุด)
 * @param {string} code
 * @returns {boolean} true ถ้าเจอโค้ดและปิดสำเร็จ, false ถ้าไม่เจอโค้ดนี้เลย
 */
function deactivateCode(code) {
  const data = readAll();
  const key = normalizeCode(code);
  if (!data.codes[key]) return false;
  data.codes[key].active = false;
  writeAll(data);
  return true;
}

/**
 * เช็คว่าเซิร์ฟนี้เคยใช้ "โค้ดนี้" (ตัวนี้เป๊ะๆ) ไปแล้วหรือยัง
 * ⚠️ เช็คเฉพาะคู่ (guildId, code) นี้เท่านั้น — เซิร์ฟเดียวกันยังใช้ "โค้ดอื่น" ได้ปกติ
 * @param {string} guildId
 * @param {string} code
 * @returns {boolean}
 */
function hasGuildUsedCode(guildId, code) {
  const data = readAll();
  const key = normalizeCode(code);
  const usedList = data.usedCodesByGuild[guildId] || [];
  return usedList.includes(key);
}

/**
 * บันทึก "รอผลชำระเงิน" ไว้ก่อนตอนสร้าง Checkout Session (ยังไม่รู้ว่าจะจ่ายสำเร็จไหม)
 * ผูกกับ checkoutSessionId เพื่อให้ webhook มาเทียบได้ตอนจ่ายเงินสำเร็จจริง
 *
 * @param {string} checkoutSessionId
 * @param {{ guildId: string, code: string, sellerLabel: string, sellerDiscordId: string|null }} info
 */
function recordPendingRedemption(checkoutSessionId, { guildId, code, sellerLabel, sellerDiscordId }) {
  const data = readAll();
  data.pendingRedemptions[checkoutSessionId] = {
    guildId,
    code: normalizeCode(code),
    sellerLabel,
    sellerDiscordId: sellerDiscordId || null,
    createdAt: new Date().toISOString(),
  };
  writeAll(data);
}

/**
 * เรียกจาก webhook ตอน checkout.session.completed มาถึงจริง (server.js)
 * ถ้า session นี้เป็นการใช้โค้ดส่วนลด (เจอใน pendingRedemptions) จะ:
 *   1. ย้ายจาก pending → บันทึกว่าเซิร์ฟนี้ใช้โค้ดนี้ไปแล้ว (กันใช้ซ้ำ)
 *   2. เพิ่มรายการค่าคอมให้ผู้ขายใน commissionLog
 *   3. ลบออกจาก pendingRedemptions (จบงานแล้ว ไม่ต้องเก็บซ้ำ)
 *
 * ถ้า session นี้ "ไม่ใช่" การใช้โค้ด (สมัครราคาเต็มปกติ) จะคืน null เฉยๆ ไม่ทำอะไร
 *
 * @param {string} checkoutSessionId
 * @returns {{ guildId: string, code: string, sellerLabel: string, sellerDiscordId: string|null, commissionThb: number }|null}
 */
function completeRedemption(checkoutSessionId) {
  const data = readAll();
  const pending = data.pendingRedemptions[checkoutSessionId];
  if (!pending) return null; // สมัครแบบราคาเต็มปกติ ไม่ได้ใช้โค้ด — ไม่ต้องทำอะไร

  const { guildId, code, sellerLabel, sellerDiscordId } = pending;

  // 1) บันทึกว่าเซิร์ฟนี้ใช้โค้ดนี้ไปแล้ว
  if (!data.usedCodesByGuild[guildId]) data.usedCodesByGuild[guildId] = [];
  if (!data.usedCodesByGuild[guildId].includes(code)) {
    data.usedCodesByGuild[guildId].push(code);
  }

  // 2) เพิ่มรายการค่าคอม
  const commissionThb = COMMISSION_PER_REDEMPTION_THB;
  data.commissionLog.push({
    code,
    sellerLabel,
    sellerDiscordId,
    guildId,
    checkoutSessionId,
    commissionThb,
    completedAt: new Date().toISOString(),
  });

  // 3) ลบออกจาก pending (จบงานแล้ว)
  delete data.pendingRedemptions[checkoutSessionId];

  writeAll(data);
  return { guildId, code, sellerLabel, sellerDiscordId, commissionThb };
}

/**
 * สรุปยอดค่าคอมรวมของแต่ละผู้ขาย (ใช้กับ /referral summary ให้น้องหนาวเช็คว่าต้องโอนใครเท่าไหร่)
 * @returns {Array<{ sellerLabel: string, code: string, totalUses: number, totalCommissionThb: number }>}
 *   เรียงจากค่าคอมรวมมากไปน้อย
 */
function getCommissionSummary() {
  const data = readAll();
  const bySeller = {}; // key = code (โค้ดใครโค้ดมัน แยกสรุปเป็นรายโค้ด)

  for (const entry of data.commissionLog) {
    if (!bySeller[entry.code]) {
      bySeller[entry.code] = {
        sellerLabel: entry.sellerLabel,
        code: entry.code,
        totalUses: 0,
        totalCommissionThb: 0,
      };
    }
    bySeller[entry.code].totalUses += 1;
    bySeller[entry.code].totalCommissionThb += entry.commissionThb;
  }

  return Object.values(bySeller).sort((a, b) => b.totalCommissionThb - a.totalCommissionThb);
}

/**
 * ดึงรายการโค้ดทั้งหมด (ใช้กับ /referral list)
 * @returns {Array<{ code: string, sellerLabel: string, active: boolean, createdAt: string }>}
 */
function listAllCodes() {
  const data = readAll();
  return Object.entries(data.codes).map(([code, info]) => ({ code, ...info }));
}

module.exports = {
  COMMISSION_PER_REDEMPTION_THB,
  saveCode,
  getActiveCode,
  deactivateCode,
  hasGuildUsedCode,
  recordPendingRedemption,
  completeRedemption,
  getCommissionSummary,
  listAllCodes,
};
