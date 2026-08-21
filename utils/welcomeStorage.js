// utils/welcomeStorage.js
// บันทึกและโหลด config ระบบต้อนรับ แยกตาม guildId
// เก็บเป็นไฟล์ JSON ในโฟลเดอร์ data/welcome/ (สร้างอัตโนมัติถ้าไม่มี)

const fs   = require('fs');
const path = require('path');

// โฟลเดอร์เก็บ config — อยู่ที่ root ของโปรเจกต์ (2 ระดับขึ้นจาก utils/)
// เช่น: <project-root>/data/welcome/1234567890.json
const DATA_DIR = path.join(__dirname, '../data/welcome');

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
function loadWelcomeConfig(guildId) {
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
 * สร้างโฟลเดอร์ data/welcome/ อัตโนมัติถ้ายังไม่มี
 *
 * @param {string} guildId
 * @param {object} config
 */
function saveWelcomeConfig(guildId, config) {
  if (!fs.existsSync(DATA_DIR)) {
    // recursive: true = สร้างทุก parent folder ที่ขาดหายได้เลย ไม่ต้อง mkdir ทีละชั้น
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(configPath(guildId), JSON.stringify(config, null, 2), 'utf8');
}

module.exports = { loadWelcomeConfig, saveWelcomeConfig };