// utils/miloConfigStorage.js
// 🆕 [16 ต.ค. 2569] Persistent storage สำหรับ "รหัสการตั้งค่า Milo Bot"
// (ของ /milo export-config กับ /milo import-config)
//
// ไฟล์: data/milo-configs.json (โฟลเดอร์ data/ ระดับเดียวกับ index.js — เหตุผลเดียวกับ
// roleSetupStorage.js/builderStorage.js: Railway ใช้ Volume ต่อเข้าโฟลเดอร์นี้ กันข้อมูลหาย)
// Key: รหัส (code) เช่น "MILO-7XQK29WM"
//
// รูปแบบ value ต่อ 1 รหัส:
// {
//   code: string,
//   sourceGuildId: string,        ← เซิร์ฟที่กด /milo export-config (ฝั่งผู้ขาย)
//   exportedBy: string,           ← userId ที่กด export
//   bundle: {
//     welcome: object|null,       ← จาก loadWelcomeConfig() (channelId ถูกล้างเป็น null ไว้ก่อนเก็บแล้ว)
//     goodbye: object|null,       ← จาก loadGoodbyeConfig() (channelId ล้างเหมือนกัน)
//     roleSetups: object[],      ← จาก listSetups() ทั้งหมดของเซิร์ฟนั้น ณ ตอน export
//     builderDrafts: object[],  ← จาก listDrafts() ทั้งหมดของเซิร์ฟนั้น ณ ตอน export
//   },
//   createdAt: string,            ← ISO 8601 ตอน export
//   usedAt: string|null,          ← ตอนถูก import ไปใช้สำเร็จ (null = ยังไม่เคยถูกใช้)
//   usedByGuildId: string|null,   ← เซิร์ฟที่ import รหัสนี้ไปใช้ (ฝั่งผู้ซื้อ)
// }
//
// ⚠️ "ใช้ได้ครั้งเดียว" ตามที่น้องหนาวเลือกไว้ — กันคนขายขายรหัสเดียวซ้ำได้ไม่จำกัด
// (ดู markUsed() ด้านล่าง — เช็ค usedAt ก่อนทุกครั้ง ไม่ใช่แค่ลบรหัสทิ้งหลังใช้ เพราะอยาก
// เก็บ audit trail ไว้ด้วยว่ารหัสไหนเคยถูกใช้ไปแล้วบ้าง เผื่อมีข้อพิพาทในอนาคต)

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'milo-configs.json');

function _read() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.error('[miloConfigStorage] อ่านไฟล์ไม่ได้:', e.message);
    return {};
  }
}

function _write(data) {
  try {
    // สร้างโฟลเดอร์ data/ ให้ก่อนถ้ายังไม่มี (แพทเทิร์นเดียวกับ storage ไฟล์อื่นทุกไฟล์)
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[miloConfigStorage] เขียนไฟล์ไม่ได้:', e.message);
  }
}

// ตัวอักษร/เลขที่ใช้สุ่มรหัส — ตัดตัวที่หน้าตาคล้ายกันจนสับสนง่ายตอนพิมพ์ตามออก
// (0/O, 1/I/L) เพราะรหัสนี้ผู้ขายต้องก๊อปแปะเข้าฟอร์มเว็บ แล้วผู้ซื้อต้องพิมพ์/ก๊อปเข้า
// คำสั่งดิสคอร์ดอีกรอบ ยิ่งลดโอกาสพิมพ์ผิดได้ยิ่งดี
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function _generateRawCode() {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return `MILO-${out}`;
}

/**
 * สุ่มรหัสใหม่ที่ไม่ชนกับรหัสเดิมที่มีอยู่แล้วในไฟล์ (เช็คซ้ำก่อนคืนค่าเสมอ)
 * @returns {string}
 */
function generateUniqueCode() {
  const all = _read();
  let code;
  do {
    code = _generateRawCode();
  } while (code in all);
  return code;
}

/**
 * สร้างรายการ export ใหม่ (เริ่มต้นเป็น "ยังไม่ถูกใช้") แล้วคืนรหัสที่สุ่มให้
 *
 * @param {string} sourceGuildId - เซิร์ฟผู้ขาย (ที่กด /milo export-config)
 * @param {string} exportedBy - userId ของคนที่กด export
 * @param {{ welcome: object|null, goodbye: object|null, roleSetups: object[], builderDrafts: object[] }} bundle
 * @returns {string} รหัสที่สร้างขึ้นใหม่
 */
function createExport(sourceGuildId, exportedBy, bundle) {
  const code = generateUniqueCode();
  const all = _read();
  all[code] = {
    code,
    sourceGuildId,
    exportedBy,
    bundle,
    createdAt: new Date().toISOString(),
    usedAt: null,
    usedByGuildId: null,
  };
  _write(all);
  return code;
}

/**
 * ดึงรายการ export ตามรหัส
 * @param {string} code
 * @returns {object|null} null ถ้าไม่พบรหัสนี้เลย
 */
function getExport(code) {
  const all = _read();
  return all[code] ?? null;
}

/**
 * บันทึกว่ารหัสนี้ถูก import ไปใช้สำเร็จแล้ว (ล็อกไว้ไม่ให้ใช้ซ้ำได้อีก)
 *
 * ❗ เรียกฟังก์ชันนี้ "หลัง" apply ข้อมูลเข้าเซิร์ฟผู้ซื้อสำเร็จแล้วเท่านั้น (ไม่ใช่ก่อน)
 * เพื่อไม่ให้รหัสถูกล็อกว่าใช้ไปแล้วทั้งที่จริงๆ apply ไม่สำเร็จ (ผู้ซื้อจะเสียสิทธิ์
 * ใช้รหัสของตัวเองไปฟรีๆ โดยไม่ได้อะไรเลย) — ดู commands/milo.js ส่วน import-config
 *
 * @param {string} code
 * @param {string} usedByGuildId - เซิร์ฟผู้ซื้อที่ import ไปใช้
 * @returns {boolean} true = ล็อกสำเร็จ, false = ไม่พบรหัสนี้ หรือถูกใช้ไปแล้วก่อนหน้า
 */
function markUsed(code, usedByGuildId) {
  const all = _read();
  const entry = all[code];
  if (!entry || entry.usedAt) return false;
  entry.usedAt = new Date().toISOString();
  entry.usedByGuildId = usedByGuildId;
  _write(all);
  return true;
}

module.exports = { createExport, getExport, markUsed, generateUniqueCode };
