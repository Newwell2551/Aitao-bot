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
//       "paymentMethod": "promptpay",  ← 🆕 [12 ต.ค. 2569] "promptpay" | "link" — ช่องทาง
//                                          ที่ใช้งานอยู่ตอนนี้ (ก่อนหน้านี้มีแค่ PromptPay
//                                          ทางเดียว น้องหนาวสังเกตว่าคนต่างชาติใช้ PromptPay
//                                          ไม่ได้เลย เพราะเป็นระบบจ่ายเงินของไทยล้วนๆ เลย
//                                          เปิดให้เลือกได้ว่าจะใช้ PromptPay (ในไทย) หรือ
//                                          ลิงก์รับเงินของตัวเอง เช่น PayPal.me/Stripe Payment
//                                          Link (สากล) — ข้อมูลเก่าก่อนหน้านี้ที่ไม่มี field
//                                          นี้ (มีแต่ promptpayId ตรงๆ) ยัง fallback เป็น
//                                          "promptpay" ได้อัตโนมัติ ดู getSellerPaymentMethod()
//       "promptpayId": "0812345678",   ← เลขพร้อมเพย์รับเงินของผู้ขาย (เบอร์มือถือเท่านั้น
//                                          กฎเดียวกับ referralStorage.js — ดู PROMPTPAY_ID_PATTERN)
//                                          เก็บไว้เฉยๆ แม้สลับไปใช้ "link" แล้ว เผื่อสลับกลับมา
//       "promptpayUpdatedAt": "2026-...",
//       "paymentLink": "https://paypal.me/kittyarts",  ← 🆕 ลิงก์รับเงินสากลของผู้ขายเอง
//                                          (บอทไม่รู้จัก ไม่ตรวจสอบช่องทางข้างในเลย แค่โชว์
//                                          ลิงก์นี้ให้ผู้ซื้อกดไปจ่ายตรงกับผู้ขายเอง) ต้องเป็น
//                                          https:// เท่านั้น — ดู PAYMENT_LINK_PATTERN
//       "paymentLinkUpdatedAt": "2026-...",
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
//       "type": "digital",               ← "digital" (ส่งไฟล์/ลิงก์อัตโนมัติหลังจ่ายเงิน) หรือ
//                                            "service" (ผู้ขายต้องติดต่อลูกค้าเองหลังจ่ายเงิน)
//       "deliveryMethod": "file",        ← 🆕 [15 ต.ค. 2569 — รอบ 10] มีผลเฉพาะตอน type==="digital"
//                                            เท่านั้น: "file" (อัปโหลดไฟล์จริง — ของเดิม) หรือ
//                                            "link" (วางลิงก์ระบบ/เทมเพลต เช่น discord.new/...
//                                            สำหรับเทมเพลตเซิร์ฟ หรือลิงก์เชิญบอท — สำหรับผู้ขาย
//                                            สาย "ขายระบบ" ที่ไม่มีไฟล์จริงให้อัปโหลด) — ของเก่า
//                                            ก่อนรอบนี้ไม่มี field นี้เลย ตีความเป็น "file" เสมอ
//                                            (เพราะตอนนั้นมีแค่ทางเดียว) null ถ้า type !== "digital"
//       "digitalFileUrl": { "channelId": "...", "messageId": "..." },  ← 🆕 [11 ต.ค. 2569] มีค่า
//                                            เฉพาะตอน deliveryMethod==="file" เท่านั้น (null ถ้า
//                                            เป็น "link")
//       "digitalLinkUrl": "https://discord.new/abc123",  ← 🆕 [15 ต.ค. 2569 — รอบ 10] ลิงก์ดิบๆ
//                     ตรงๆ (ไม่ต้องผ่าน resolveListingAssets() แบบรูป/ไฟล์ เพราะเป็นข้อความ
//                     ธรรมดา ไม่ใช่พิกัดไฟล์ใน Discord ที่หมดอายุ) มีค่าเฉพาะตอน
//                     deliveryMethod==="link" เท่านั้น ต้องขึ้นต้นด้วย https:// เสมอ (validate
//                     ด้วย PAYMENT_LINK_PATTERN ตัวเดียวกับช่องทางรับเงิน — ดู server.js)
//       "imageUrl": { "channelId": "...", "messageId": "..." },       ← ไม่เก็บ URL ตรงๆ
//                     แล้ว (URL ของ Discord หมดอายุใน ~24 ชม.!) เก็บแค่ "พิกัดข้อความ" ใน
//                     ห้องเก็บไฟล์ถาวร asset-storage แทน (ดู utils/assetStorage.js) แล้วค่อย
//                     resolve เป็น URL สดใหม่ตอนจะใช้จริงด้วย resolveListingAssets() ด้านล่าง
//                     — ของเก่าก่อนวันที่ 11 ต.ค. 2569 อาจยังเป็น string URL ตรงๆ อยู่
//                     (ลงขายผ่าน /marketplace sell ตอนยังไม่มีเว็บฟอร์ม) resolveListingAssets()
//                     รองรับทั้ง 2 แบบ เลยไม่ต้อง migrate ข้อมูลเก่าเลย
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
//       "buyerMarkedPaidAt": null,        ← 🆕 [12 ต.ค. 2569] เวลาที่ผู้ซื้อกดปุ่ม "ฉันจ่าย
//                                            แล้ว" บนหน้าเว็บ (ไม่ใช่การยืนยันว่าเงินเข้าจริง
//                                            นะ — แค่ "ผู้ซื้อบอกว่าโอนไปแล้ว" เอาไว้สร้าง
//                                            audit trail 2 ฝั่ง เผื่อมีข้อพิพาททีหลัง เช่น
//                                            ผู้ซื้อบอกว่าโอนแล้วนานแล้วแต่ผู้ขายไม่กดยืนยัน
//                                            สักที — ไม่กระทบ status/การส่งของเลย)
//       "notifyChannelId": null,          ← ห้อง DM/แชแนลที่โพสต์การ์ด "รอยืนยันรับเงิน" ไว้
//       "notifyMessageId": null           ← พิกัดข้อความการ์ดนั้น (ไว้แก้ข้อความตอนกดยืนยันแล้ว)
//     }
//   },
//   "reports": {                          ← 🆕 [12 ต.ค. 2569] ฟีเจอร์ความปลอดภัย #4 — ผู้ซื้อ
//                                            กดรายงานประกาศ/ผู้ขายจากหน้าเว็บ (ของเดิมเป็น UI
//                                            mockup เฉยๆ ไม่มี backend — ตอนนี้บันทึกจริงแล้ว)
//     "<reportId>": {
//       "id": "R5K2P1",
//       "listingId": "L1A2B3",
//       "sellerId": "123456789012345",     ← null ได้ถ้าหาประกาศเดิมไม่เจอแล้วตอนรายงาน (ถูกลบไปก่อน)
//       "reporterId": "987654321098765",   ← Discord user ID ของคนกดรายงาน (ต้อง login ก่อนถึงรายงานได้)
//       "reasonId": "r2",                  ← ตรงกับ REPORT_REASONS ใน public/marketplace.html
//       "reasonLabel": "โอนเงินแล้วไม่ได้รับสินค้า (โดนโกง)",
//       "detail": "...",                   ← ข้อความเพิ่มเติมที่ผู้รายงานกรอกเอง (ไม่บังคับ)
//       "evidenceCount": 2,                ← จำนวนไฟล์หลักฐานที่แนบมา (ตัวไฟล์จริงส่งแนบไปกับ
//                                            ข้อความแจ้งเตือนในห้องรายงานของเซิร์ฟควบคุมเลย ไม่ได้
//                                            เก็บ URL ไว้ที่นี่ เพราะดูได้จากห้องนั้นอยู่แล้ว)
//       "status": "open",                  ← "open" (ยังไม่ตรวจสอบ) | "resolved" (จัดการแล้ว) —
//                                            ตอนนี้ยังไม่มีปุ่มเปลี่ยนสถานะจากเว็บ ต้องแก้ไฟล์ตรงๆ
//                                            ถ้าจะปิดเคสในระบบ (เอาไว้ทำปุ่มในแดชบอร์ดทีหลังได้)
//       "createdAt": "2026-..."
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
// 🆕 [11 ต.ค. 2569] ใช้ resolveStoredImageUrl() จาก assetStorage.js (ของเดิมที่ใช้กับรูป
// welcome card อยู่แล้ว) มา resolve พิกัดข้อความ {channelId, messageId} ที่เก็บไว้ในช่อง
// imageUrl/digitalFileUrl ของ listing ให้เป็น URL สดใหม่ — ดู resolveListingAssets() ด้านล่าง
const { resolveStoredImageUrl } = require('./assetStorage');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'marketplace.json');

// เลขพร้อมเพย์ — ใช้กฎเดียวกับ referralStorage.js เป๊ะๆ (เบอร์มือถือ 10 หลักเท่านั้น
// ไม่รับเลขบัตรประชาชน เพราะเป็นข้อมูลอ่อนไหวกว่าเยอะ ดูเหตุผลเต็มในไฟล์นั้น)
const PROMPTPAY_ID_PATTERN = /^\d{10}$/;

// 🆕 [12 ต.ค. 2569] ลิงก์รับเงินสากล (สำหรับผู้ขายที่ไม่มี PromptPay ไทย เช่น PayPal.me,
// Stripe Payment Link ของตัวเอง) — บังคับ "https://" เท่านั้น กัน javascript:/data: URI
// หลุดเข้ามาแสดงเป็นลิงก์ได้ (ความปลอดภัย ไม่ใช่แค่ validate รูปแบบ) จำกัดความยาวไม่เกิน
// 300 ตัวอักษรกันค่าแปลกๆ ยาวผิดปกติ — ไม่ได้เช็คว่าโดเมนปลายทางเป็นผู้ให้บริการจ่ายเงินจริง
// หรือเปล่า เพราะบอทไม่รู้จัก/ไม่ยุ่งกับช่องทางจ่ายเงินนี้เลย แค่โชว์ลิงก์ให้ผู้ซื้อกดเอง
const PAYMENT_LINK_PATTERN = /^https:\/\/\S{1,290}$/i;
const MAX_PAYMENT_LINK_LENGTH = 300;

// 🆕 [15 ต.ค. 2569 — รอบ 11] "รหัสการตั้งค่า Milo Bot" — ผู้ขายสายขาย setup ที่สร้างด้วย
// Milo Bot ของเราเอง (เหมือนขายเทมเพลต Canva ให้คนเอาไปแก้ต่อ) กรอกรหัสนี้มาแทนไฟล์/ลิงก์
// — รับได้แค่ตัวอักษร A-Z, a-z, เลข, ขีดกลาง/ขีดล่าง ยาว 4-120 ตัวอักษร (กันค่าว่าง/ค่า
// ยาวผิดปกติหลุดเข้ามา) ⚠️ ตอนนี้บอทแค่ "เก็บ+ส่งต่อ" รหัสนี้ให้ผู้ซื้อทาง DM เหมือนลิงก์ของ
// รอบ 10 เป๊ะๆ — ยังไม่มีคำสั่ง /milo export-config หรือ /milo import-config จริงที่คอย
// สร้าง/ตรวจสอบรหัสนี้เลย (เป็นฟีเจอร์ใหญ่แยกต่างหากที่ต้องคุยเรื่อง scope กับน้องหนาวก่อน)
const MILO_CONFIG_KEY_PATTERN = /^[A-Za-z0-9_-]{4,120}$/;

// 🆕 [11 ต.ค. 2569] ย้ายมาจาก commands/marketplace.js (ของเดิมประกาศซ้ำไว้คนละที่กับ
// server.js ที่กำลังจะเพิ่มฟอร์มลงขายบนเว็บ) — ย้ายมาเป็น "แหล่งความจริงเดียว" ไว้ที่นี่
// ที่เดียว กันลืมแก้พร้อมกัน 2 ที่ทีหลัง (ปรับราคาสูงสุดได้ — กันพิมพ์เลข 0 เกินมาโดยไม่
// ตั้งใจ เช่น 99000 ทั้งที่ตั้งใจจะพิมพ์ 990)
const MAX_PRICE_THB = 20000;

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
    reports: {},
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
 * 🆕 [12 ต.ค. 2569] ตั้ง/แก้ "ช่องทางรับเงิน" ของผู้ขาย — เวอร์ชันทั่วไปที่รองรับทั้ง
 * PromptPay (ไทย) และลิงก์รับเงินสากล (เช่น PayPal.me/Stripe Payment Link ของผู้ขายเอง)
 * แทนที่ saveSellerPromptPay เดิมที่รองรับแค่ PromptPay ทางเดียว (เหตุผล: คนต่างชาติใช้
 * PromptPay ไม่ได้เลย ทั้งที่อยากขายของในตลาดนี้ได้ — ดูคอมเมนต์ schema ด้านบนไฟล์)
 *
 * เก็บค่าทั้ง 2 ช่องทางไว้เสมอแม้สลับไปใช้อีกช่องทาง (ไม่ล้างของเดิมทิ้ง) เผื่อผู้ขาย
 * สลับกลับมาใช้ช่องทางเดิมทีหลัง ไม่ต้องกรอกใหม่
 * @param {string} discordUserId
 * @param {{ method: 'promptpay'|'link', promptpayId?: string, paymentLink?: string }} payment
 *   ต้อง validate ผ่าน PROMPTPAY_ID_PATTERN/PAYMENT_LINK_PATTERN มาก่อนแล้ว (เช็คที่ชั้นคำสั่ง/route)
 * @param {string} displayName ชื่อ Discord ปัจจุบันของผู้ขาย (แคชไว้โชว์)
 */
function saveSellerPayment(discordUserId, payment, displayName) {
  const data = readAll();
  const existing = data.sellers[discordUserId] || {};
  const next = {
    ...existing,
    paymentMethod: payment.method,
    displayName: displayName || existing.displayName || null,
  };
  if (payment.method === 'promptpay') {
    next.promptpayId = payment.promptpayId;
    next.promptpayUpdatedAt = new Date().toISOString();
  } else if (payment.method === 'link') {
    next.paymentLink = payment.paymentLink;
    next.paymentLinkUpdatedAt = new Date().toISOString();
  }
  data.sellers[discordUserId] = next;
  writeAll(data);
  return data.sellers[discordUserId];
}

/**
 * ตัวช่วยอ่าน (backward compat) — ดูว่าผู้ขายคนนี้ใช้ช่องทางรับเงินไหนอยู่จริงๆ ตอนนี้
 * ข้อมูลเก่าก่อน 12 ต.ค. 2569 ไม่มี field `paymentMethod` เลย (ตั้ง PromptPay มาตรงๆ) —
 * fallback เป็น "promptpay" ให้อัตโนมัติถ้ามี promptpayId อยู่ กันของเก่าใช้งานไม่ได้
 * @param {object|null} seller
 * @returns {'promptpay'|'link'|null}
 */
function getSellerPaymentMethod(seller) {
  if (!seller) return null;
  if (seller.paymentMethod === 'promptpay' || seller.paymentMethod === 'link') return seller.paymentMethod;
  if (seller.promptpayId) return 'promptpay'; // ของเก่าก่อนมี field นี้
  return null;
}

/**
 * ตัวช่วยอ่าน — เช็คว่าผู้ขายคนนี้ "พร้อมขายได้แล้ว" หรือยัง (มีช่องทางรับเงินที่ใช้งาน
 * ได้จริงตั้งไว้แล้ว) ใช้แทนที่การเช็ค `seller?.promptpayId` ตรงๆ แบบเดิมทุกจุด เพราะตอนนี้
 * มี 2 ช่องทางให้เลือกแล้ว เช็คแค่ promptpayId อย่างเดียวจะพลาดผู้ขายที่ใช้ "link"
 * @param {object|null} seller
 */
function hasPaymentMethodSet(seller) {
  const method = getSellerPaymentMethod(seller);
  if (method === 'promptpay') return Boolean(seller.promptpayId);
  if (method === 'link') return Boolean(seller.paymentLink);
  return false;
}

/**
 * @deprecated ใช้ saveSellerPayment(discordUserId, { method: 'promptpay', promptpayId }, displayName) แทน
 * เก็บไว้เป็น wrapper บางๆ กันโค้ดเก่าที่ยังเรียกชื่อนี้อยู่พัง (ไม่มีจุดไหนเรียกแล้วตอนนี้
 * แต่เก็บไว้เผื่อ เพราะเป็นฟังก์ชัน public ที่ export ออกไปมานานแล้ว)
 */
function saveSellerPromptPay(discordUserId, promptpayId, displayName) {
  return saveSellerPayment(discordUserId, { method: 'promptpay', promptpayId }, displayName);
}

// ── ประกาศขาย (listings) ──────────────────────────────────────────────

/**
 * สร้างประกาศขายใหม่ 1 ชิ้น
 * 🆕 [15 ต.ค. 2569 — รอบ 10] เพิ่ม deliveryMethod/digitalLinkUrl รองรับการ "วางลิงก์ระบบ/
 * เทมเพลต" แทนการอัปโหลดไฟล์จริง — deliveryMethod ไม่ได้ส่งมาก็ไม่เป็นไร fallback เป็น 'file'
 * อัตโนมัติ (ของเดิมมีแค่ทางเดียวอยู่แล้ว ไม่กระทบของเก่าเลย)
 * @param {{ sellerId: string, title: string, description: string, priceThb: number,
 *   category: string, subcategory: string|null, type: 'digital'|'service',
 *   deliveryMethod?: 'file'|'link', digitalFileUrl: string|null, digitalLinkUrl?: string|null,
 *   imageUrl: string|null }} info
 * @returns {object} ประกาศที่เพิ่งสร้าง (มี id แล้ว)
 */
function createListing(info) {
  const data = readAll();
  const id = generateId(data.listings);
  const now = new Date().toISOString();
  const isDigital = info.type === 'digital';
  // 🆕 [15 ต.ค. 2569 — รอบ 11] เพิ่มวิธีส่งมอบที่ 3: 'miloconfig' (ส่งรหัสการตั้งค่า Milo Bot
  // ให้ผู้ซื้อแทนไฟล์/ลิงก์ — ดูคอมเมนต์เต็มๆ ที่หัวไฟล์นี้หัวข้อ "รอบ 11")
  const deliveryMethod = isDigital
    ? (info.deliveryMethod === 'link' ? 'link' : info.deliveryMethod === 'miloconfig' ? 'miloconfig' : 'file')
    : null;
  data.listings[id] = {
    id,
    sellerId: info.sellerId,
    title: info.title,
    description: info.description || '',
    priceThb: info.priceThb,
    category: info.category,
    subcategory: info.subcategory || null,
    type: info.type,
    deliveryMethod,
    digitalFileUrl: deliveryMethod === 'file' ? (info.digitalFileUrl || null) : null,
    digitalLinkUrl: deliveryMethod === 'link' ? (info.digitalLinkUrl || null) : null,
    digitalConfigKey: deliveryMethod === 'miloconfig' ? (info.digitalConfigKey || null) : null,
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
 * แก้ไขประกาศขายที่มีอยู่แล้ว (เจ้าของเท่านั้นแก้ได้) — คืน null ถ้าไม่เจอ/ไม่ใช่เจ้าของ
 * 🆕 [15 ต.ค. 2569 — รอบ 11] รับ info รูปแบบเดียวกับ createListing() เป๊ะๆ ไม่ได้ทำ "merge
 * แบบ partial" เอง (ลดจุดพลาด) — server.js ต้องเตรียมค่า "เดิม" มาให้ครบก่อนเรียกฟังก์ชันนี้
 * เสมอ (เช่น ผู้ขายไม่ได้อัปโหลดรูปปกใหม่ตอนแก้ไข ก็ต้องส่ง imageUrl เดิมของประกาศนั้นมาด้วย
 * ไม่ใช่ null — ไม่งั้นรูปเดิมจะหายไปเฉยๆ) เขียนทับ record เดิมแทนการสร้าง record ใหม่
 * (id/sellerId/createdAt/status เดิมไม่เปลี่ยน)
 * @param {string} listingId
 * @param {string} sellerId ต้องตรงกับเจ้าของประกาศเดิมเท่านั้น (กันแก้ไขประกาศของคนอื่น)
 * @param {object} info รูปแบบเดียวกับ createListing()
 * @returns {object|null} ประกาศที่แก้ไขแล้ว หรือ null ถ้าแก้ไม่ได้
 */
function updateListing(listingId, sellerId, info) {
  const data = readAll();
  const listing = data.listings[listingId];
  if (!listing || listing.sellerId !== sellerId) return null;

  const isDigital = info.type === 'digital';
  const deliveryMethod = isDigital
    ? (info.deliveryMethod === 'link' ? 'link' : info.deliveryMethod === 'miloconfig' ? 'miloconfig' : 'file')
    : null;

  listing.title = info.title;
  listing.description = info.description || '';
  listing.priceThb = info.priceThb;
  listing.category = info.category;
  listing.subcategory = info.subcategory || null;
  listing.type = info.type;
  listing.deliveryMethod = deliveryMethod;
  listing.digitalFileUrl = deliveryMethod === 'file' ? (info.digitalFileUrl || null) : null;
  listing.digitalLinkUrl = deliveryMethod === 'link' ? (info.digitalLinkUrl || null) : null;
  listing.digitalConfigKey = deliveryMethod === 'miloconfig' ? (info.digitalConfigKey || null) : null;
  listing.imageUrl = info.imageUrl || null;
  listing.updatedAt = new Date().toISOString();

  writeAll(data);
  return listing;
}

/**
 * ลบประกาศขายทิ้งถาวร (เจ้าของเท่านั้นลบได้) — ต่างจาก setListingStatus(id,'removed') ที่แค่
 * "ปิดขาย" ยังเก็บข้อมูลไว้เสมอ (กู้คืนได้ด้วยปุ่ม Reopen) อันนี้ลบ record ออกจากไฟล์จริงๆ
 * กู้คืนไม่ได้แล้ว (ถึงต้องมี confirm dialog ฝั่งหน้าเว็บก่อนเรียก route นี้)
 * 🆕 [15 ต.ค. 2569 — รอบ 11] ไม่ลบไฟล์ถาวรที่เก็บไว้ใน asset-storage (รูปปก/ไฟล์ดิจิทัล)
 * ตามไปด้วย — ตั้งใจเก็บไว้เฉยๆก่อน (ไม่ใช่ทำไม่ได้ แค่ยังไม่จำเป็นต้องรีบทำ ถ้าอยากได้
 * ระบบเก็บกวาดไฟล์ที่ไม่มีประกาศอ้างอิงแล้วทิ้งอัตโนมัติ ทำเพิ่มได้ในอนาคต)
 * @param {string} listingId
 * @param {string} sellerId ต้องตรงกับเจ้าของประกาศเดิมเท่านั้น
 * @returns {boolean} true ถ้าลบสำเร็จ, false ถ้าไม่เจอ/ไม่ใช่เจ้าของ
 */
function deleteListing(listingId, sellerId) {
  const data = readAll();
  const listing = data.listings[listingId];
  if (!listing || listing.sellerId !== sellerId) return false;
  delete data.listings[listingId];
  writeAll(data);
  return true;
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
    buyerMarkedPaidAt: null,
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
 * ดึงสถิติความน่าเชื่อถือของร้านค้า (ผู้ขาย) — ใช้โชว์เป็นคะแนนความน่าเชื่อถือ
 * บนหน้าเว็บ Marketplace แทนระบบ rating ปลอมๆ เดิม (ของเดิมไม่มีข้อมูลจริง)
 * นับจากจำนวนคำสั่งซื้อที่ผู้ขายกดยืนยันรับเงินแล้วจริง (status === 'confirmed')
 * @param {string} sellerId
 * @returns {{ completedSales: number }}
 */
function getSellerStats(sellerId) {
  const data = readAll();
  const sellerOrders = Object.values(data.orders).filter((order) => order.sellerId === sellerId);
  const completedSales = sellerOrders.filter((order) => order.status === 'confirmed').length;
  return { completedSales };
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

/**
 * 🆕 [12 ต.ค. 2569] ผู้ซื้อกดปุ่ม "✅ ฉันจ่ายแล้ว" บนหน้าเว็บ (ใน payModal หลังสแกน QR) —
 * แค่บันทึกเวลาไว้เฉยๆ "ไม่ใช่" การยืนยันว่าเงินเข้าบัญชีผู้ขายจริง (บอทไม่มีทางรู้ได้เอง
 * เหมือนเดิม) จุดประสงค์คือสร้าง "audit trail 2 ฝั่ง" ไว้เทียบกัน เผื่อมีข้อพิพาททีหลัง —
 * ไม่แก้ status ของออร์เดอร์เลย (ยังเป็น pending จนกว่าผู้ขายจะกดยืนยันแยกต่างหาก)
 *
 * Idempotent — กดซ้ำได้ ไม่ error แค่ไม่ทับเวลาเดิมถ้ากดมาแล้วครั้งหนึ่ง (เก็บเวลาแรกสุดไว้)
 * @param {string} orderId
 */
function markOrderBuyerPaid(orderId) {
  const data = readAll();
  const order = data.orders[orderId];
  if (!order) return null;
  if (!order.buyerMarkedPaidAt) {
    order.buyerMarkedPaidAt = new Date().toISOString();
    writeAll(data);
  }
  return order;
}

// ── resolve รูป/ไฟล์ของ listing ──────────────────────────────────────────

/**
 * 🆕 [11 ต.ค. 2569] แปลงค่า "ที่เก็บไว้" ของ listing.imageUrl/listing.digitalFileUrl
 * (ซึ่งตอนนี้คือพิกัดข้อความ {channelId, messageId} ในห้อง asset-storage) ให้เป็น URL
 * สดใหม่ที่ใช้งานได้จริงตอนนี้ — ต้องเรียกฟังก์ชันนี้ทุกครั้งก่อนจะส่ง URL ไปให้ใครใช้จริง
 * (ตอบ API หน้าเว็บ, ส่งไฟล์ให้ลูกค้าทาง DM ฯลฯ) ห้ามเก็บผลลัพธ์ไว้ใช้ซ้ำนานๆ เพราะ URL ที่ได้
 * ก็มีวันหมดอายุเหมือนกัน แค่สดใหม่ ณ ตอนเรียกเท่านั้น (หลักการเดียวกับ resolveStoredImageUrl)
 *
 * รองรับข้อมูลเก่าด้วย: ถ้าค่าที่เก็บไว้เป็น string ตรงๆ (ลงขายผ่าน /marketplace sell ก่อน
 * วันที่ 11 ต.ค. 2569 ที่ยังเก็บ URL ดิบๆ) จะคืนค่า string นั้นกลับไปตรงๆ เลย (อาจหมดอายุไป
 * แล้วถ้าลงขายไว้นานเกิน ~24 ชม. แล้ว — ไม่ใช่บั๊กใหม่ แค่ของเก่ายังไม่ได้ migrate เฉยๆ
 * ผู้ขายแก้ได้ง่ายๆ โดยปิดประกาศเดิมแล้วลงใหม่ผ่านเว็บ)
 *
 * @param {import('discord.js').Client} client
 * @param {{ imageUrl: any, digitalFileUrl: any }} listing
 * @returns {Promise<{ imageUrl: string|null, digitalFileUrl: string|null }>}
 */
async function resolveListingAssets(client, listing) {
  const resolveOne = async (stored) => {
    if (!stored) return null;
    if (typeof stored === 'string') return stored; // ของเก่า — URL ดิบ ส่งกลับตรงๆ
    try {
      return await resolveStoredImageUrl(client, stored);
    } catch (error) {
      console.warn('[marketplaceStorage] resolve ไฟล์/รูปของ listing ไม่สำเร็จ:', error.message);
      return null;
    }
  };
  const [imageUrl, digitalFileUrl] = await Promise.all([
    resolveOne(listing.imageUrl),
    resolveOne(listing.digitalFileUrl),
  ]);
  return { imageUrl, digitalFileUrl };
}

// ── รายงานผู้ขาย/ประกาศ (reports) ──────────────────────────────────────

/**
 * 🆕 [12 ต.ค. 2569] บันทึกรายงานใหม่ — เรียกจาก POST /api/marketplace/reports ใน
 * server.js ตอนผู้ซื้อกดปุ่ม "ส่งรายงาน" จากหน้าเว็บจริง (ของเดิมเป็น mockup client-side
 * เฉยๆ) ไม่ได้เก็บไฟล์หลักฐานไว้ที่นี่ (เก็บแค่จำนวน) เพราะตัวไฟล์จริงถูกส่งแนบไปกับ
 * ข้อความแจ้งเตือนในห้องรายงานของเซิร์ฟควบคุมเลย (ดู notifyMarketplaceReport ใน
 * commands/marketplace.js) — เปิดดูได้ตรงนั้น ไม่ต้องมาเก็บ URL ซ้ำที่นี่อีกชั้น
 * @param {{ listingId: string, sellerId: string|null, reporterId: string, reasonId: string, reasonLabel: string, detail: string, evidenceCount: number }} info
 */
function createReport(info) {
  const data = readAll();
  const id = generateId(data.reports);
  data.reports[id] = {
    id,
    listingId: info.listingId,
    sellerId: info.sellerId || null,
    reporterId: info.reporterId,
    reasonId: info.reasonId,
    reasonLabel: info.reasonLabel,
    detail: info.detail || '',
    evidenceCount: info.evidenceCount || 0,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  writeAll(data);
  return data.reports[id];
}

module.exports = {
  PROMPTPAY_ID_PATTERN,
  PAYMENT_LINK_PATTERN,
  MAX_PAYMENT_LINK_LENGTH,
  MILO_CONFIG_KEY_PATTERN,
  CATEGORIES,
  MAX_PRICE_THB,
  getSeller,
  saveSellerPromptPay,
  saveSellerPayment,
  getSellerPaymentMethod,
  hasPaymentMethodSet,
  createListing,
  getListing,
  updateListing,
  deleteListing,
  resolveListingAssets,
  listActiveListings,
  listSellerListings,
  setListingStatus,
  createOrder,
  getOrder,
  getSellerStats,
  saveOrderNotifyMessage,
  confirmOrder,
  markOrderBuyerPaid,
  createReport,
};
