// utils/marketplaceStorage.js
// ─────────────────────────────────────────────────────────────────────────
// เก็บข้อมูลระบบ "Marketplace" (ตลาดซื้อขายของตกแต่ง/บริการสาย Discord) ทั้งหมดไว้ที่นี่
// ที่เดียว — เก็บเป็นไฟล์เดียว: data/marketplace.json (pattern เดียวกับ referralStorage.js
// เป๊ะๆ — อ่าน/เขียนทั้งไฟล์ทุกครั้ง เพราะข้อมูลยังไม่เยอะ ไม่จำเป็นต้องใช้ database จริงจัง)
//
// โครงสร้างข้อมูลในไฟล์:
// {
//   "sellers": {
//     "<discordUserId>": {
//       "promptpayId": "0812345678",   ← เลขพร้อมเพย์รับเงินของผู้ขาย (เบอร์มือถือเท่านั้น
//                                          กฎเดียวกับ referralStorage.js — ดู PROMPTPAY_ID_PATTERN)
//       "promptpayUpdatedAt": "2026-...",
//       "displayName": "kittyarts"     ← แคชชื่อ Discord ไว้เฉยๆ ไว้โชว์ไม่ต้อง fetch ใหม่ทุกครั้ง
//     }
//   },
//   "listings": {
//     "<listingId>": {
//       "id": "L1A2B3",
//       "sellerId": "123456789012345",   ← Discord user ID ผู้ขาย
//       "title": "ธีม Welcome Card ลายซากุระ",
//       "description": "...",
//       "priceThb": 89,
//       "category": "media",             ← ต้องตรงกับ data-cat ใน public/marketplace.html เป๊ะๆ
//                                            ("servers" | "media" | "emoji-sticker" | "builder" |
//                                            "role" | "welcome-goodbye" | "package")
//       "subcategory": "wallpaper",      ← ตรงกับ data-subcat ในหน้าเว็บ (null ได้ถ้าหมวดนั้นไม่มีหมวดย่อย)
//       "type": "digital",               ← "digital" (ส่งไฟล์อัตโนมัติหลังจ่ายเงิน) หรือ "service"
//                                            (ผู้ขายต้องติดต่อลูกค้าเองหลังจ่ายเงิน)
//       "digitalFileUrl": "https://cdn.discordapp.com/...", ← URL ไฟล์แนบใน Discord (เฉพาะ type=digital)
//       "imageUrl": "https://cdn.discordapp.com/...",       ← รูปปกสินค้า (โชว์บนการ์ด)
//       "status": "active",              ← "active" | "sold" | "removed"
//       "createdAt": "2026-...",
//       "updatedAt": "2026-..."
//     }
//   },
//   "orders": {
//     "<orderId>": {
//       "id": "O9X8Y7",
//       "listingId": "L1A2B3",
//       "sellerId": "123456789012345",
//       "buyerId": "987654321098765",
//       "priceThb": 89,
//       "status": "pending",              ← "pending" (รอผู้ขายกดยืนยันว่าได้เงินแล้ว) |
//                                            "confirmed" (ยืนยันแล้ว) | "cancelled"
//       "createdAt": "2026-...",
//       "confirmedAt": null,
//       "notifyChannelId": null,          ← ห้อง DM/แชแนลที่โพสต์การ์ด "รอยืนยันรับเงิน" ไว้
//       "notifyMessageId": null           ← พิกัดข้อความการ์ดนั้น (ไว้แก้ข้อความตอนกดยืนยันแล้ว)
//     }
//   }
// }
//
// 🔑 หลักการสำคัญของไฟล์นี้ (ตามที่น้องหนาวตัดสินใจไว้ 25 ก.ย. 2569):
//   1. การจ่ายเงินเป็นแบบ "กึ่งอัตโนมัติ" เหมือนระบบ referral เป๊ะๆ — บอทแค่สร้าง QR
//      PromptPay ที่ฝังยอดเงิน+เลขพร้อมเพย์ของ "ผู้ขาย" (ไม่ใช่ของน้องหนาว) ให้ผู้ซื้อสแกน
//      จ่ายตรงเข้าบัญชีผู้ขายเลย บอทไม่แตะเงินเลยสักบาท ไม่ต้องยุ่งกับ Stripe Connect ที่มี
//      ข้อจำกัดสำหรับคู่บัญชีไทย-ไทย (ดู claude/referral-campaign-build-notes.md)
//   2. ไม่มีระบบหักค่าคอมมิชชั่นจากผู้ขาย — ตามที่ตัดสินใจไว้ล่วงหน้าแล้วตั้งแต่วางโรดแมป
//      (21 ส.ค. 2569): ให้พรีเมียม subscription แบกต้นทุนแทน ไม่เก็บเพิ่มจากผู้ขาย
//   3. "ยืนยันว่าจ่ายเงินแล้วจริง" ต้องมาจากผู้ขายกดปุ่มเองเท่านั้น (บอทไม่มีทางรู้เองว่า
//      เงินเข้าบัญชีผู้ขายจริงไหม เพราะไม่ได้ต่อ API ธนาคาร) — เหมือนกับหลักการของระบบ
//      referral ที่ใช้ QR ช่วยแค่ "ให้จ่ายง่ายขึ้น" ไม่ใช่ "โอนเงินให้อัตโนมัติ"
// ─────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'marketplace.json');

// เลขพร้อมเพย์ — ใช้กฎเดียวกับ referralStorage.js เป๊ะๆ (เบอร์มือถือ 10 หลักเท่านั้น
// ไม่รับเลขบัตรประชาชน เพราะเป็นข้อมูลอ่อนไหวกว่าเยอะ ดูเหตุผลเต็มในไฟล์นั้น)
const PROMPTPAY_ID_PATTERN = /^\d{10}$/;

// หมวดหมู่สินค้าที่อนุญาต — ต้องตรงกับ data-cat/data-subcat ใน public/marketplace.html
// เป๊ะๆ ไม่งั้นตัวกรองหมวดหมู่บนหน้าเว็บจะหาสินค้าไม่เจอ (ดูส่วนที่ 5 ของ
// claude/knowledge-base-... เรื่อง "ยึดของจริง ห้ามเดาเอง" — อันนี้คือกลับด้าน: โค้ดฝั่ง
// บอทต้องยึดตามหน้าเว็บที่มีอยู่แล้ว ไม่ใช่เดาหมวดใหม่เอง)
const CATEGORIES = {
  servers: { label: 'Servers', subcategories: null },
  media: { label: 'Image & Media', subcategories: ['banner', 'thumbnail', 'wallpaper', 'divider'] },
  'emoji-sticker': { label: 'Emoji & Sticker', subcategories: null },
  builder: { label: 'Builder', subcategories: null },
  role: { label: 'Role', subcategories: ['menu', 'button', 'reaction'] },
  'welcome-goodbye': { label: 'Welcome & Goodbye', subcategories: null },
  package: { label: 'Package', subcategories: null },
};

// ตัวอักษรที่ใช้สุ่มสร้างรหัส listing/order — ตัดตัวที่อ่านสับสนออก (0/O, 1/I) เหมือน
// แนวคิดเดียวกับ RANDOM_CODE_ALPHABET ใน commands/referral.js
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * โครงสร้างไฟล์เริ่มต้น (ตอนยังไม่เคยมีไฟล์เลย)
 */
function emptyData() {
  return {
    sellers: {},
    listings: {},
    orders: {},
  };
}

/**
 * เช็คว่ามีโฟลเดอร์ data/ และไฟล์ marketplace.json อยู่ไหม ถ้าไม่มีให้สร้างให้อัตโนมัติ
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
    // กันไฟล์เก่า/เสียที่ขาด key บางตัวไป — เติม default ให้ครบเสมอ
    return { ...emptyData(), ...data };
  } catch (error) {
    console.error('[marketplaceStorage] อ่านไฟล์ marketplace.json ไม่ได้ (JSON เสีย):', error);
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
 * สุ่มรหัสสั้นๆ อ่านง่าย ไว้ใช้เป็น listingId/orderId (6 ตัวอักษร ชนกันยากมาก
 * เพราะพื้นที่สุ่ม 32^6 ≈ พันล้านแบบ — เพียงพอสำหรับตลาดขนาดนี้)
 * @param {object} existingMap อ็อบเจกต์ที่มี key เป็นรหัสที่ใช้ไปแล้ว (กันชนซ้ำ)
 */
function generateId(existingMap) {
  let id;
  do {
    id = '';
    for (let i = 0; i < 6; i++) {
      id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
  } while (existingMap[id]);
  return id;
}

// ── ผู้ขาย (sellers) ───────────────────────────────────────────────────

/**
 * ดึงข้อมูลผู้ขาย 1 คน (คืน null ถ้ายังไม่เคยลงทะเบียนเลย)
 * @param {string} discordUserId
 */
function getSeller(discordUserId) {
  const data = readAll();
  return data.sellers[discordUserId] || null;
}

/**
 * ตั้ง/แก้เลขพร้อมเพย์ของผู้ขาย — เรียกจาก /marketplace setpromptpay หรือตอนลงขาย
 * ครั้งแรกแล้วยังไม่เคยตั้งไว้เลย
 * @param {string} discordUserId
 * @param {string} promptpayId ต้องผ่าน PROMPTPAY_ID_PATTERN มาก่อนแล้ว (เช็คที่ชั้นคำสั่ง)
 * @param {string} displayName ชื่อ Discord ปัจจุบันของผู้ขาย (แคชไว้โชว์)
 */
function saveSellerPromptPay(discordUserId, promptpayId, displayName) {
  const data = readAll();
  const existing = data.sellers[discordUserId] || {};
  data.sellers[discordUserId] = {
    ...existing,
    promptpayId,
    promptpayUpdatedAt: new Date().toISOString(),
    displayName: displayName || existing.displayName || null,
  };
  writeAll(data);
  return data.sellers[discordUserId];
}

// ── ประกาศขาย (listings) ──────────────────────────────────────────────

/**
 * สร้างประกาศขายใหม่ 1 ชิ้น
 * @param {{ sellerId: string, title: string, description: string, priceThb: number,
 *   category: string, subcategory: string|null, type: 'digital'|'service',
 *   digitalFileUrl: string|null, imageUrl: string|null }} info
 * @returns {object} ประกาศที่เพิ่งสร้าง (มี id แล้ว)
 */
function createListing(info) {
  const data = readAll();
  const id = generateId(data.listings);
  const now = new Date().toISOString();
  data.listings[id] = {
    id,
    sellerId: info.sellerId,
    title: info.title,
    description: info.description || '',
    priceThb: info.priceThb,
    category: info.category,
    subcategory: info.subcategory || null,
    type: info.type,
    digitalFileUrl: info.type === 'digital' ? (info.digitalFileUrl || null) : null,
    imageUrl: info.imageUrl || null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  writeAll(data);
  return data.listings[id];
}

/**
 * ดึงประกาศ 1 ชิ้น (คืน null ถ้าไม่เจอ)
 * @param {string} listingId
 */
function getListing(listingId) {
  const data = readAll();
  return data.listings[listingId] || null;
}

/**
 * รายการประกาศทั้งหมดที่ "active" เท่านั้น (ไว้ใช้ตอบ GET /api/marketplace/listings
 * ให้หน้าเว็บสาธารณะ — ไม่โชว์ของที่ขายไปแล้ว/ถูกลบไปแล้ว)
 */
function listActiveListings() {
  const data = readAll();
  return Object.values(data.listings)
    .filter((item) => item.status === 'active')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // ใหม่สุดขึ้นก่อน
}

/**
 * รายการประกาศทั้งหมดของผู้ขาย 1 คน (ทุกสถานะ) — ไว้ใช้กับ /marketplace mylistings
 * @param {string} sellerId
 */
function listSellerListings(sellerId) {
  const data = readAll();
  return Object.values(data.listings)
    .filter((item) => item.sellerId === sellerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * แก้สถานะประกาศ (เช่นปิดขาย/ลบ/เปิดขายใหม่)
 * @param {string} listingId
 * @param {'active'|'sold'|'removed'} status
 */
function setListingStatus(listingId, status) {
  const data = readAll();
  const listing = data.listings[listingId];
  if (!listing) return null;
  listing.status = status;
  listing.updatedAt = new Date().toISOString();
  writeAll(data);
  return listing;
}

// ── คำสั่งซื้อ (orders) ────────────────────────────────────────────────

/**
 * สร้างคำสั่งซื้อใหม่ (ตอนผู้ซื้อกด "ซื้อ" บนหน้าเว็บ) — สถานะเริ่มต้นเป็น "pending"
 * เสมอ รอผู้ขายกดยืนยันว่าได้รับเงินแล้วจริง
 * @param {{ listingId: string, sellerId: string, buyerId: string, priceThb: number }} info
 */
function createOrder(info) {
  const data = readAll();
  const id = generateId(data.orders);
  data.orders[id] = {
    id,
    listingId: info.listingId,
    sellerId: info.sellerId,
    buyerId: info.buyerId,
    priceThb: info.priceThb,
    status: 'pending',
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    notifyChannelId: null,
    notifyMessageId: null,
  };
  writeAll(data);
  return data.orders[id];
}

/**
 * ดึงคำสั่งซื้อ 1 รายการ
 * @param {string} orderId
 */
function getOrder(orderId) {
  const data = readAll();
  return data.orders[orderId] || null;
}

/**
 * บันทึกพิกัดข้อความ "รอยืนยันรับเงิน" ที่โพสต์แจ้งผู้ขาย — ไว้แก้ข้อความเดิมตอนกด
 * ยืนยันแล้ว (เหมือน syncCodeReportMessage ของระบบ referral)
 * @param {string} orderId
 * @param {string} channelId
 * @param {string} messageId
 */
function saveOrderNotifyMessage(orderId, channelId, messageId) {
  const data = readAll();
  const order = data.orders[orderId];
  if (!order) return null;
  order.notifyChannelId = channelId;
  order.notifyMessageId = messageId;
  writeAll(data);
  return order;
}

/**
 * ผู้ขายกดยืนยันว่าได้รับเงินแล้วจริง — เปลี่ยนสถานะเป็น "confirmed" เท่านั้น (ไม่ยุ่ง
 * กับสถานะประกาศ — ฝั่งคำสั่งที่เรียกฟังก์ชันนี้ต้องไปสั่ง setListingStatus(listingId,
 * 'sold') เองอีกที ถ้าต้องการปิดประกาศพร้อมกัน เพราะสินค้าบางแบบขายซ้ำได้หลายรอบ)
 * @param {string} orderId
 */
function confirmOrder(orderId) {
  const data = readAll();
  const order = data.orders[orderId];
  if (!order) return null;
  order.status = 'confirmed';
  order.confirmedAt = new Date().toISOString();
  writeAll(data);
  return order;
}

module.exports = {
  PROMPTPAY_ID_PATTERN,
  CATEGORIES,
  getSeller,
  saveSellerPromptPay,
  createListing,
  getListing,
  listActiveListings,
  listSellerListings,
  setListingStatus,
  createOrder,
  getOrder,
  saveOrderNotifyMessage,
  confirmOrder,
};
