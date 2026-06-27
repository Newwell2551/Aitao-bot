/**
 * Persistent storage layer สำหรับ named builder drafts
 *
 * เก็บข้อมูลใน drafts.json (ที่ root โปรเจกต์ ข้างๆ index.js)
 * รูปแบบ key: "{guildId}:{name}"  — ห้ามมี ":" ในชื่อ builder เพราะใช้เป็น separator
 *
 * รูปแบบ value:
 * {
 *   name: string,
 *   blocks: object[],
 *   accentColor: string | null,
 *   createdBy: string,   ← userId
 *   createdAt: string,   ← ISO 8601
 *   updatedBy: string,
 *   updatedAt: string,
 * }
 *
 * ⚠️ อ่านและเขียนทั้งไฟล์ทุกครั้ง เหมาะสำหรับ bot ขนาดเล็ก (~หลักสิบ builder ต่อ guild)
 *    ถ้าต้องการรองรับขนาดใหญ่ขึ้น ให้ migrate ไป SQLite หรือ database ทีหลัง
 */

const fs = require('fs');
const path = require('path');

// ไฟล์เก็บข้อมูลอยู่ที่ root ของโปรเจกต์ (ระดับเดียวกับ index.js)
const DRAFTS_FILE = path.join(__dirname, '..', 'drafts.json');

/**
 * อ่านข้อมูลทั้งหมดจากไฟล์
 * ถ้าไฟล์ไม่มีหรืออ่านไม่ได้คืน object ว่างแทน (bot ยังทำงานต่อได้)
 * @returns {Object.<string, object>}
 */
function _readAll() {
  try {
    if (!fs.existsSync(DRAFTS_FILE)) return {};
    const raw = fs.readFileSync(DRAFTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('[builderStorage] อ่านไฟล์ drafts.json ไม่ได้:', error.message);
    return {};
  }
}

/**
 * เขียนข้อมูลทั้งหมดลงไฟล์ (atomic — เขียนทับทั้งไฟล์เลย)
 * @param {Object.<string, object>} data
 */
function _writeAll(data) {
  try {
    fs.writeFileSync(DRAFTS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('[builderStorage] เขียนไฟล์ drafts.json ไม่ได้:', error.message);
  }
}

/**
 * สร้าง key จาก guildId + ชื่อ builder
 * ใช้ ":" เป็น separator ดังนั้นห้ามมี ":" ในชื่อ
 */
function _key(guildId, name) {
  return `${guildId}:${name}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * เช็คว่า builder ชื่อนี้มีอยู่ในเซิร์ฟเวอร์นี้ไหม
 * @param {string} guildId
 * @param {string} name
 * @returns {boolean}
 */
function draftExists(guildId, name) {
  return _key(guildId, name) in _readAll();
}

/**
 * โหลด draft จาก storage
 * @param {string} guildId
 * @param {string} name
 * @returns {{ name, blocks, accentColor, createdBy, createdAt, updatedBy, updatedAt } | null}
 */
function loadDraft(guildId, name) {
  const all = _readAll();
  return all[_key(guildId, name)] ?? null;
}

/**
 * บันทึก draft ลง storage (สร้างใหม่หรืออัปเดตของเดิม)
 * @param {string} guildId
 * @param {string} name
 * @param {{ name, blocks, accentColor, createdBy, createdAt, updatedBy, updatedAt }} draftData
 */
function saveDraft(guildId, name, draftData) {
  const all = _readAll();
  all[_key(guildId, name)] = draftData;
  _writeAll(all);
}

/**
 * ลบ draft ออกจาก storage ถาวร (ใช้ชื่อ deleteDraftFromStorage เพื่อไม่ชนกับ clearDraft ใน builderDrafts.js)
 * @param {string} guildId
 * @param {string} name
 */
function deleteDraftFromStorage(guildId, name) {
  const all = _readAll();
  delete all[_key(guildId, name)];
  _writeAll(all);
}

/**
 * แสดงรายการ draft ทั้งหมดของเซิร์ฟเวอร์นี้ เรียงตาม updatedAt ล่าสุดก่อน
 * @param {string} guildId
 * @returns {Array<{ name, blocks, accentColor, createdBy, createdAt, updatedBy, updatedAt }>}
 */
function listDrafts(guildId) {
  const all = _readAll();
  const prefix = `${guildId}:`;
  return Object.entries(all)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

module.exports = {
  draftExists,
  loadDraft,
  saveDraft,
  deleteDraftFromStorage,
  listDrafts,
};