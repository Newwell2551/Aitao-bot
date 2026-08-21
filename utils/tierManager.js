/**
 * tierManager.js
 * ─────────────────────────────────────────────────────────────────────────
 * เก็บข้อมูล "tier" (ระดับสมาชิก) ของแต่ละเซิร์ฟเวอร์ (guild) ไว้ใช้ gate
 * ฟีเจอร์ premium ต่างๆ (เริ่มจาก animated welcome image เป็นอันแรก)
 *
 * เก็บเป็นไฟล์เดียว: data/guild-tiers.json
 * (pattern เดียวกับ welcomeConfigStorage.js เป๊ะ — อ่าน/เขียนทั้งไฟล์ทุกครั้ง
 * เพราะข้อมูลเล็ก ไม่จำเป็นต้องใช้ database จริงจัง)
 *
 * โครงสร้างข้อมูลในไฟล์:
 * {
 *   "guildId1": { "tier": "premium" },
 *   "guildId2": { "tier": "free" }
 * }
 *
 * ตอนนี้ยังไม่มีระบบจ่ายเงินจริง ข้อมูลนี้จะถูกตั้งค่าผ่านคำสั่งลับ /dev-set-tier
 * (เจ้าของบอทเท่านั้นที่ใช้ได้) ไปก่อน พอมีระบบจ่ายเงินจริงทีหลัง ก็แค่เปลี่ยนจุดที่
 * เรียก setGuildTier() จาก "คำสั่งลับ" เป็น "webhook ตอนจ่ายเงินสำเร็จ" แทน โดยไม่ต้อง
 * แก้โค้ดส่วนอื่นที่ใช้ isPremiumGuild() เลยสักบรรทัด
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'guild-tiers.json');

// tier ที่ระบบรู้จัก — กันพิมพ์ผิด (เช่นพิมพ์ "premuim" เพี้ยนๆ) ตอนเรียก setGuildTier()
const VALID_TIERS = ['free', 'premium'];

/**
 * เช็คว่ามีโฟลเดอร์ data/ และไฟล์ guild-tiers.json อยู่ไหม ถ้าไม่มีให้สร้างให้อัตโนมัติ
 */
function ensureFileExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, '{}', 'utf8');
  }
}

/**
 * อ่านข้อมูลทั้งไฟล์ออกมาเป็น object เดียว (ทุก guild รวมกัน)
 * @returns {object} เช่น { guildId1: { tier: 'premium' }, guildId2: { tier: 'free' } }
 */
function readAll() {
  ensureFileExists();
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    // ไฟล์เสีย (เช่นโดนแก้มือแล้วพิมพ์ผิด) — log แล้วคืน object ว่าง กันบอทพังทั้งระบบ
    console.error('[tierManager] อ่านไฟล์ guild-tiers.json ไม่ได้ (JSON เสีย):', error);
    return {};
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
 * ดึง tier ปัจจุบันของ guild นี้ (คืนค่า 'free' เสมอถ้ายังไม่เคยตั้งค่าเลย — ปลอดภัยไว้ก่อน
 * ดีกว่าเดาว่าเป็น premium โดยไม่มีข้อมูลจริงรองรับ)
 * @param {string} guildId
 * @returns {'free'|'premium'}
 */
function getGuildTier(guildId) {
  const all = readAll();
  return all[guildId]?.tier ?? 'free';
}

/**
 * เช็คว่าเซิร์ฟเวอร์นี้เป็น premium ไหม — ฟังก์ชันหลักที่โค้ดส่วนอื่นจะเรียกใช้ตอน gate ฟีเจอร์
 * @param {string} guildId
 * @returns {boolean}
 */
function isPremiumGuild(guildId) {
  return getGuildTier(guildId) === 'premium';
}

/**
 * ตั้งค่า tier ของ guild นี้
 * @param {string} guildId
 * @param {'free'|'premium'} tier
 */
function setGuildTier(guildId, tier) {
  if (!VALID_TIERS.includes(tier)) {
    throw new Error(`tierManager: tier ต้องเป็น ${VALID_TIERS.join(' หรือ ')} เท่านั้นครับ (ได้รับ: "${tier}")`);
  }
  const all = readAll();
  if (!all[guildId]) all[guildId] = {};
  all[guildId].tier = tier;
  writeAll(all);
}

/**
 * ตัดสินใจว่าจะใช้ "ประเภทพื้นหลัง" ไหนจริงๆ ตอนสร้างรูป โดยเช็ค premium tier ซ้ำอีกรอบ
 * (เผื่อ tier หมดอายุไปแล้วระหว่างที่แอดมินตั้งค่าไว้ กับตอนที่มีสมาชิกใหม่เข้าจริง — ช่วงเวลา
 * ตรงนี้อาจห่างกันเป็นวันๆ หรือเดือนๆ เลยครับ ถ้าไม่เช็คซ้ำ เซิร์ฟเวอร์ที่ยกเลิก premium ไปแล้ว
 * จะยังใช้ฟีเจอร์ animated ได้ฟรีต่อไปเรื่อยๆ)
 *
 * ถ้าขอ 'animated' มาแต่ guild ไม่ใช่ premium (อีกแล้ว) จะ fallback เป็น 'static' เงียบๆ
 * โดยตั้งใจไม่ throw error เพราะสมาชิกใหม่ที่เพิ่งเข้าเซิร์ฟเวอร์ไม่ได้เป็นคนผิดที่เซิร์ฟเวอร์
 * ไม่ได้ต่อ premium — ไม่ควรมี error โผล่ไปกวนใจเขา แค่เงียบๆ ใช้ static แทนก็พอ
 *
 * @param {string} guildId
 * @param {'static'|'animated'} requestedType
 * @returns {'static'|'animated'} ประเภทที่ควรใช้จริง
 */
function resolveBackgroundType(guildId, requestedType) {
  if (requestedType === 'animated' && !isPremiumGuild(guildId)) {
    return 'static';
  }
  return requestedType;
}

/**
 * บันทึกข้อมูล Stripe subscription ของ guild นี้ไว้ (ไฟล์เดียวกับ tier เลย ไม่แยกไฟล์ใหม่
 * เพราะข้อมูลผูกกับ guild เหมือนกัน pattern เดียวกับ getGuildTier/setGuildTier ด้านบน)
 *
 * เรียกใช้จาก server.js (webhook handler) ตอน event checkout.session.completed
 * และ invoice.payment_succeeded — ไม่ได้ตั้งใจให้เรียกจากที่อื่น เพราะข้อมูลนี้ต้องมาจาก
 * Stripe เท่านั้น (ห้ามให้ user ป้อนเองได้ทางไหนทั้งสิ้น ไม่งั้นปลอม stripeCustomerId
 * เพื่อไปยุ่งกับ subscription ของคนอื่นผ่าน Billing Portal ได้)
 *
 * @param {string} guildId
 * @param {{ stripeCustomerId: string, stripeSubscriptionId: string, currentPeriodEnd: string|null }} info
 *   currentPeriodEnd เป็น ISO string (เช่น "2026-09-08T00:00:00.000Z") หรือ null ถ้ายังไม่รู้
 *   (ตอน checkout.session.completed เพิ่งสมัครเสร็จ ยังไม่มีรอบบิลจริง เลยใส่ null ไปก่อน
 *   รอ invoice.payment_succeeded มาอัปเดตทับอีกที)
 */
function setSubscriptionInfo(guildId, { stripeCustomerId, stripeSubscriptionId, currentPeriodEnd }) {
  const all = readAll();
  if (!all[guildId]) all[guildId] = {};
  all[guildId].stripeCustomerId = stripeCustomerId;
  all[guildId].stripeSubscriptionId = stripeSubscriptionId;
  all[guildId].currentPeriodEnd = currentPeriodEnd;
  writeAll(all);
}

/**
 * ดึงข้อมูล Stripe subscription ของ guild นี้ (คืน null ถ้ายังไม่เคยสมัครเลย
 * เช่น guild ที่ยังไม่เคยกด "สมัครพรีเมียม" หรือ guild ที่ตั้ง premium ผ่าน /dev-set-tier
 * มือเปล่าๆ โดยไม่เคยผ่าน Stripe จริง)
 * @param {string} guildId
 * @returns {{ stripeCustomerId: string, stripeSubscriptionId: string, currentPeriodEnd: string|null } | null}
 */
function getSubscriptionInfo(guildId) {
  const all = readAll();
  const info = all[guildId];
  // guard: ถ้ายังไม่เคยมี stripeCustomerId เลย (เช่นตั้ง premium มือผ่าน /dev-set-tier)
  // ให้คืน null ชัดเจน แทนที่จะคืน object ที่มีแต่ tier ไม่มี stripe fields
  // (กันโค้ดฝั่งเรียกใช้ เผลอเอา info.stripeCustomerId ที่เป็น undefined ไปยิง Stripe API ต่อ)
  if (!info?.stripeCustomerId) return null;
  return {
    stripeCustomerId: info.stripeCustomerId,
    stripeSubscriptionId: info.stripeSubscriptionId,
    currentPeriodEnd: info.currentPeriodEnd,
  };
}

module.exports = {
  getGuildTier,
  isPremiumGuild,
  setGuildTier,
  resolveBackgroundType,
  setSubscriptionInfo,
  getSubscriptionInfo,
  VALID_TIERS,
};