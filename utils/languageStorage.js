// utils/languageStorage.js
// เก็บภาษาของบอทต่อ guild ไว้ในไฟล์เดียว: data/guild-language.json
// pattern เดียวกับ tierManager.js — ข้อมูลมีแค่ field เดียวต่อ guild ไม่จำเป็นต้องแยกไฟล์

const fs   = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'guild-language.json');

/** เช็คว่ามีโฟลเดอร์ data/ กับไฟล์ guild-language.json ไหม ถ้าไม่มีสร้างให้อัตโนมัติ */
function ensureFileExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, '{}', 'utf8');
  }
}

/** อ่านข้อมูลทั้งไฟล์ (ทุก guild รวมกันในไฟล์เดียว) */
function readAll() {
  ensureFileExists();
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (error) {
    // ไฟล์เสีย (โดนแก้มือแล้วพิมพ์ผิด) — log แล้วคืน object ว่าง กันบอทพังทั้งระบบ
    console.error('[languageStorage] อ่านไฟล์ guild-language.json ไม่ได้ (JSON เสีย):', error);
    return {};
  }
}

/** เขียนข้อมูลทั้ง object กลับลงไฟล์ */
function writeAll(data) {
  ensureFileExists();
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * ดึงภาษาปัจจุบันของ guild (default 'en' เสมอถ้ายังไม่เคยตั้งค่า — อังกฤษเป็นค่าเริ่มต้น)
 * ⚠️ กระทบทั้งเซิร์ฟใหม่และเซิร์ฟเก่าที่ยังไม่เคยรัน /language เลย — ทุก guild ที่ไม่มี
 * key ของตัวเองในไฟล์ data/guild-language.json จะได้ 'en' เหมือนกันหมด ไม่แยกกรณี
 * @param {string} guildId
 * @returns {'th'|'en'}
 */
function getGuildLanguage(guildId) {
  const all = readAll();
  return all[guildId]?.lang ?? 'en';
}

/**
 * ตั้งภาษาของ guild
 * @param {string} guildId
 * @param {'th'|'en'} lang
 */
function setGuildLanguage(guildId, lang) {
  const all = readAll();
  if (!all[guildId]) all[guildId] = {};
  all[guildId].lang = lang;
  writeAll(all);
}

module.exports = { getGuildLanguage, setGuildLanguage };