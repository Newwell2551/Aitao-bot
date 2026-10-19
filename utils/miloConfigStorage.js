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

// ─────────────────────────────────────────────────────────────────────────
// 🆕 [19 ต.ค. 2569 รอบ 19] "ของที่ข้ามไปตอน import" (pending skipped items) — ตามที่
// น้องหนาวขอ: ตอนผู้ซื้อกด /milo import-config ขณะเซิร์ฟยังเป็นแผนฟรีอยู่ บาง role
// setup/builder ในรหัสจะถูก "ข้าม" ไปเพราะเกินโควตา/ชนิดไม่รองรับ (ดู commands/milo.js
// ส่วน handleImport) — เดิมของพวกนี้หายไปเฉยๆ ผู้ซื้อต้องไปขอรหัส export ใหม่จากผู้ขาย
// เองถ้าอยากได้ของที่ถูกข้ามไป หลังจากอัปเกรดพรีเมียมแล้ว ซึ่งดูไม่แฟร์เลย (จ่ายเงินซื้อรหัส
// ไปแล้ว ของในรหัสควรได้ครบทุกชิ้นตอนพร้อมใช้งานจริง ไม่ใช่ให้ไปขอซ้ำ)
//
// แนวทางที่ทำ: เก็บ "ของดิบ" (setup/draft object เต็มๆ ที่ยังไม่ตัดโควตา) ที่ถูกข้ามไว้ต่อ
// guildId (ไม่ใช่ต่อรหัส — เผื่อ import หลายรหัสติดกันตอนยังฟรีอยู่ ของจะสะสมรวมกันไว้)
// แล้วพอมี webhook แจ้งว่าเซิร์ฟนี้อัปเกรดพรีเมียมสำเร็จ (ดู server.js เคส
// checkout.session.completed / invoice.payment_succeeded) จะเรียก
// applyPendingSkippedForGuild() ใน commands/milo.js ให้ import ของที่ค้างไว้ "อัตโนมัติ"
// ให้ครบทันที ไม่ต้องให้ผู้ซื้อทำอะไรเพิ่มเลย
//
// ไฟล์แยกต่างหากจาก milo-configs.json ด้านบน (คนละ key space — อันนี้ key เป็น guildId
// อันบน key เป็นรหัส MILO-XXXX — แยกไฟล์ชัดเจนกว่าปนกันไฟล์เดียว อ่าน/debug ง่ายกว่า)
const PENDING_FILE = path.join(__dirname, '..', 'data', 'milo-pending-skips.json');

function _readPending() {
  try {
    if (!fs.existsSync(PENDING_FILE)) return {};
    return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
  } catch (e) {
    console.error('[miloConfigStorage] อ่านไฟล์ pending skip ไม่ได้:', e.message);
    return {};
  }
}

function _writePending(data) {
  try {
    fs.mkdirSync(path.dirname(PENDING_FILE), { recursive: true });
    fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[miloConfigStorage] เขียนไฟล์ pending skip ไม่ได้:', e.message);
  }
}

/**
 * ดึงรายการ "ของที่ข้ามไว้" ของเซิร์ฟนี้ (ถ้ามี)
 * @param {string} guildId
 * @returns {{ roleSetups: object[], builderDrafts: object[], fromCodes: string[], importedBy: string|null, updatedAt: string }|null}
 */
function getPendingSkipped(guildId) {
  const all = _readPending();
  return all[guildId] ?? null;
}

/**
 * บันทึก (สะสม) ของที่ถูกข้ามไปตอน import ครั้งนี้ — เรียกเฉพาะตอนมีของถูกข้ามจริงๆ
 * เท่านั้น (ดู commands/milo.js — handleImport ไม่ต้องเรียกถ้า skipped ว่างเปล่า)
 *
 * ถ้าเซิร์ฟนี้มีของค้างจากรอบก่อนอยู่แล้ว (import หลายรหัสติดกันตอนยังฟรีอยู่) จะ "เติม"
 * เข้าไปในรายการเดิม ไม่ใช่เขียนทับ — กันของจากรหัสแรกหายไปตอน import รหัสที่ 2 ตามมา
 *
 * @param {string} guildId
 * @param {{ roleSetups?: object[], builderDrafts?: object[], fromCode: string, importedBy: string }} skipped
 */
function appendPendingSkipped(guildId, { roleSetups = [], builderDrafts = [], fromCode, importedBy }) {
  if (roleSetups.length === 0 && builderDrafts.length === 0) return; // ไม่มีอะไรข้าม ไม่ต้องเขียนไฟล์เปล่าๆ

  const all = _readPending();
  const existing = all[guildId] ?? { roleSetups: [], builderDrafts: [], fromCodes: [], importedBy: null };

  all[guildId] = {
    roleSetups: [...existing.roleSetups, ...roleSetups],
    builderDrafts: [...existing.builderDrafts, ...builderDrafts],
    // fromCodes: เก็บไว้เป็น audit trail เฉยๆ ว่ารหัสไหนบ้างที่มีของค้างอยู่ตรงนี้ (เผื่อ
    // ต้องสืบย้อนหลังว่าของชิ้นไหนมาจากรหัสไหน) ไม่ซ้ำรหัสเดิมถ้ามีอยู่แล้ว
    fromCodes: existing.fromCodes.includes(fromCode) ? existing.fromCodes : [...existing.fromCodes, fromCode],
    // importedBy: จำไว้แค่ "คนล่าสุด" ที่ import (ใช้ตอน apply ภายหลังเป็น createdBy
    // สำรอง ถ้าของชิ้นนั้นไม่มี createdBy ติดมาด้วยเอง)
    importedBy: importedBy ?? existing.importedBy,
    updatedAt: new Date().toISOString(),
  };
  _writePending(all);
}

/**
 * ล้างรายการของที่ข้ามไว้ของเซิร์ฟนี้ทิ้งทั้งหมด — เรียก "หลัง" apply สำเร็จแล้วเท่านั้น
 * (ดู commands/milo.js — applyPendingSkippedForGuild) กันของหาย ถ้า apply ระหว่างทางพัง
 * @param {string} guildId
 */
function clearPendingSkipped(guildId) {
  const all = _readPending();
  if (!(guildId in all)) return;
  delete all[guildId];
  _writePending(all);
}

module.exports = {
  createExport, getExport, markUsed, generateUniqueCode,
  getPendingSkipped, appendPendingSkipped, clearPendingSkipped,
};
