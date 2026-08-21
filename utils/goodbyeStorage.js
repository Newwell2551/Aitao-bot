// utils/goodbyeStorage.js
// บันทึกและโหลด config ระบบอำลา แยกตาม guildId
// เก็บเป็นไฟล์ JSON ในโฟลเดอร์ data/goodbye/ (สร้างอัตโนมัติถ้าไม่มี)
//
// ❗ แยกโฟลเดอร์กับ data/welcome/ โดยสิ้นเชิง — กันข้อมูลปนกัน
// ถึงแม้โครงสร้างไฟล์นี้จะ mirror utils/welcomeStorage.js เป๊ะๆ ก็ตาม

const fs   = require('fs');
const path = require('path');

// โฟลเดอร์เก็บ config — อยู่ที่ root ของโปรเจกต์ (2 ระดับขึ้นจาก utils/)
// เช่น: <project-root>/data/goodbye/1234567890.json
const DATA_DIR = path.join(__dirname, '../data/goodbye');

/**
 * สร้าง path ของไฟล์ config ตาม guildId
 * @param {string} guildId
 */
function configPath(guildId) {
  return path.join(DATA_DIR, `${guildId}.json`);
}

/**
 * โหลด config ของ guild จากไฟล์
 * คืน null ถ้ายังไม่เคยบันทึก
 *
 * @param {string} guildId
 * @returns {object|null}
 */
function loadGoodbyeConfig(guildId) {
  const p = configPath(guildId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    // ไฟล์อาจเสียหาย → คืน null ให้ใช้ค่า default แทน
    return null;
  }
}

/**
 * บันทึก config ของ guild ลงไฟล์
 * สร้างโฟลเดอร์ data/goodbye/ อัตโนมัติถ้ายังไม่มี
 *
 * @param {string} guildId
 * @param {object} config
 */
function saveGoodbyeConfig(guildId, config) {
  if (!fs.existsSync(DATA_DIR)) {
    // recursive: true = สร้างทุก parent folder ที่ขาดหายได้เลย ไม่ต้อง mkdir ทีละชั้น
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(configPath(guildId), JSON.stringify(config, null, 2), 'utf8');
}

module.exports = { loadGoodbyeConfig, saveGoodbyeConfig };