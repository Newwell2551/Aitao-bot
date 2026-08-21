/**
 * Persistent storage สำหรับ role setups
 * ไฟล์: data/role-setups.json (โฟลเดอร์ data/ ระดับเดียวกับ index.js)
 * Key: "{guildId}:{name}"
 */

const fs   = require('fs');
const path = require('path');

// ย้ายมาอยู่ในโฟลเดอร์ data/ แทนที่จะอยู่ที่ root ตรงๆ — เหตุผลเดียวกับ builderStorage.js
// (Railway ใช้ Volume ต่อเข้าที่โฟลเดอร์ data/ เพื่อกันข้อมูลหายตอน deploy ใหม่)
const FILE = path.join(__dirname, '..', 'data', 'role-setups.json');

function _read() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.error('[roleSetupStorage] อ่านไฟล์ไม่ได้:', e.message);
    return {};
  }
}

function _write(data) {
  try {
    // สร้างโฟลเดอร์ data/ ให้ก่อนถ้ายังไม่มี ไม่งั้น writeFileSync จะ error ตอนไฟล์ยังไม่เคยถูกสร้าง
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
  }
  catch (e) { console.error('[roleSetupStorage] เขียนไฟล์ไม่ได้:', e.message); }
}

function _key(guildId, name) { return `${guildId}:${name}`; }

function setupExists(guildId, name)     { return _key(guildId, name) in _read(); }
function loadSetup(guildId, name)       { return _read()[_key(guildId, name)] ?? null; }
function saveSetup(guildId, name, data) { const a = _read(); a[_key(guildId, name)] = data; _write(a); }
function deleteSetup(guildId, name)     {
  const a = _read(); const k = _key(guildId, name);
  if (!(k in a)) return false; delete a[k]; _write(a); return true;
}
function listSetups(guildId) {
  const all = _read(), prefix = `${guildId}:`;
  return Object.entries(all)
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => v)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

module.exports = { setupExists, loadSetup, saveSetup, deleteSetup, listSetups };