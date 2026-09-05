// utils/fontStorage.js
// ─────────────────────────────────────────────────────────────────────────
// เก็บ "ไฟล์ฟอนต์ที่แอดมินอัปโหลดเอง" แบบแยกต่อเซิร์ฟเวอร์ (per-guild)
// ต่างจากรูปภาพ (assetStorage.js) ตรงที่ฟอนต์ "ต้องมีไฟล์จริงอยู่บนดิสก์"
// เสมอ เพราะ @napi-rs/canvas ต้องใช้ GlobalFonts.registerFromPath(path, ...)
// อ่านไฟล์จาก path บนเครื่องโดยตรง — จะเก็บแค่ "ลิงก์" เหมือนรูปภาพไม่ได้
// (ลิงก์ของ Discord หมดอายุด้วย แถมโหลดมาแค่ใน memory ก็ยังต้อง "เขียนลง
// ดิสก์" อยู่ดีก่อนจะ register ได้) เลยเขียนไฟล์นี้แยกใหม่ ไม่ได้ใช้ร่วมกับ
// assetStorage.js
//
// 🆕 v2: รองรับ "หลายฟอนต์ต่อเซิร์ฟ" แล้ว (เดิม v1 เก็บได้แค่ 1 ฟอนต์/เซิร์ฟ
// อัปใหม่ทับของเก่าทันที) — ตอนนี้แต่ละเซิร์ฟอัปโหลดได้กี่ไฟล์ก็ได้ (จำกัดแค่
// MAX_FONTS_PER_GUILD กันชนขีดจำกัด select menu ของ Discord ดู comment ที่
// ตัวค่านั้นด้านล่าง) แต่ละฟอนต์มี "id" ของตัวเอง ไม่ผูกกับ guildId ตรงๆ แล้ว
//
// โครงสร้างที่เก็บ (v2):
//   data/customFonts/<fontId><นามสกุลไฟล์>   ← ตัวไฟล์ฟอนต์จริง (.ttf/.otf)
//   data/customFonts/registry.json           ← guildId → [ {id, fileName, family, originalName, uploadedAt}, ... ]
//
// 🔑 ทำไมต้องมี registry.json แยก ไม่เดาชื่อไฟล์ตรงๆ:
// เก็บ "ชื่อ family" ที่ใช้ตอน register กับ @napi-rs/canvas ไว้ในนี้ด้วย โดย
// ตั้งชื่อ family ใหม่ไม่ซ้ำกันทุกไฟล์ (ผูก id ต่อท้าย) — ป้องกันปัญหาเผื่อ
// @napi-rs/canvas (หรือ Skia ข้างใน) ไม่ยอม "เขียนทับ" font family ชื่อเดิม
// ด้วยไฟล์ใหม่ หลังจากเคย register ชื่อนั้นไปแล้วในโปรเซสที่กำลังรันอยู่
//
// 🔄 Migration จาก v1 → v2: v1 เก็บ registry[guildId] เป็น object เดี่ยวๆ
// ตรงๆ (ไม่ใช่ array) อ่านตอนนี้จะเจอ entry แบบเก่าแล้วแปลงเป็น array ให้
// อัตโนมัติ (1 ฟอนต์เก่า = 1 รายการแรกใน array) ไม่ทำฟอนต์ที่เคยอัปโหลดไว้
// ก่อนหน้านี้หายไปแน่นอนครับ
const fs   = require('fs');
const path = require('path');

const FONTS_DIR      = path.join(__dirname, '..', 'data', 'customFonts');
const REGISTRY_PATH  = path.join(FONTS_DIR, 'registry.json');

// จำนวนฟอนต์สูงสุดที่เซิร์ฟนึงอัปโหลดเก็บไว้พร้อมกันได้
// 🔒 ไม่ใช่ limit ตามใจเรา — Discord StringSelectMenu รับ option ได้สูงสุด
// 25 อันต่อเมนูเดียว เมนูเลือกฟอนต์ใน /welcome-setup กับ /goodbye-setup มี
// ฟอนต์มาตรฐานของบอทกินที่อยู่แล้ว 5 อัน (ค่าเริ่มต้น, Charmonman, Chonburi,
// Kanit, Sarabun) เหลือที่ให้ฟอนต์ที่อัปโหลดเองได้ไม่เกิน 20 อัน ถ้าปล่อยให้
// อัปโหลดไม่จำกัดจริงๆ พอเกิน 25 รวมกัน โค้ดสร้างเมนูจะพังทันที (Discord API
// ปฏิเสธ) เลยกันไว้ตรงนี้แทน
const MAX_FONTS_PER_GUILD = 20;

/** เช็คว่ามีโฟลเดอร์ data/customFonts/ กับไฟล์ registry.json ไหม ถ้าไม่มีสร้างให้อัตโนมัติ */
function ensureDir() {
  if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });
  if (!fs.existsSync(REGISTRY_PATH)) fs.writeFileSync(REGISTRY_PATH, '{}', 'utf8');
}

/** เขียน registry ทั้ง object กลับลงไฟล์ */
function writeRegistry(data) {
  ensureDir();
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * อ่าน registry ทั้งไฟล์ (ทุกเซิร์ฟรวมกันในไฟล์เดียว — pattern เดียวกับ
 * languageStorage.js) — มี migration แปลงข้อมูลเก่า (v1: 1 เซิร์ฟ = 1 ฟอนต์
 * แบบ object เดี่ยวๆ) เป็นรูปแบบใหม่ (v2: array ของฟอนต์) ให้อัตโนมัติ
 */
function readRegistry() {
  ensureDir();
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch (error) {
    console.error('[fontStorage] อ่านไฟล์ registry.json ไม่ได้ (JSON เสีย):', error);
    return {};
  }

  let migrated = false;
  for (const guildId of Object.keys(raw)) {
    const entry = raw[guildId];
    // v1 เก็บเป็น object เดี่ยวๆ ตรงๆ (มี .fileName) ไม่ใช่ array — เจอแบบนี้
    // แปลว่าเป็นข้อมูลเก่า แปลงเป็น array 1 รายการให้ ใช้ guildId เป็น id
    // เดิมไปเลย (เผื่อโค้ดส่วนอื่นเคยอ้างอิง family เก่านี้ไว้ที่ไหนก็ยังใช้ได้)
    if (entry && !Array.isArray(entry) && entry.fileName) {
      raw[guildId] = [{
        id: `font_legacy_${guildId}`,
        fileName: entry.fileName,
        family: entry.family,
        originalName: entry.originalName,
        uploadedAt: entry.uploadedAt,
      }];
      migrated = true;
    }
  }
  if (migrated) {
    console.log('[fontStorage] แปลงข้อมูลฟอนต์เก่า (v1 → v2) เรียบร้อยครับ');
    writeRegistry(raw);
  }
  return raw;
}

/**
 * ดึงรายชื่อฟอนต์ทั้งหมดที่เซิร์ฟนี้เคยอัปโหลดไว้ (เรียงจากอัปโหลดล่าสุดไปเก่าสุด)
 * ใช้ตอนสร้าง select menu เลือกฟอนต์, ตอนวาดการ์ด (register ทุกฟอนต์ที่ต้องใช้),
 * และตอนแสดงลิสต์ใน `/fonts`
 *
 * ไฟล์ที่หายไปจากดิสก์ (เช่นมีคนลบด้วยมือ) จะถูกกรองออกอัตโนมัติ ไม่โผล่ในลิสต์
 *
 * @param {string} guildId
 * @returns {{ id: string, path: string, family: string, originalName: string, uploadedAt: string }[]}
 */
function getGuildFonts(guildId) {
  const registry = readRegistry();
  const entries = registry[guildId] ?? [];
  return entries
    .map(entry => {
      const fullPath = path.join(FONTS_DIR, entry.fileName);
      if (!fs.existsSync(fullPath)) return null;
      return {
        id: entry.id,
        path: fullPath,
        family: entry.family,
        originalName: entry.originalName,
        uploadedAt: entry.uploadedAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

/**
 * ดึงฟอนต์ตัวเดียวจาก id (คืน null ถ้าไม่เจอ หรือไฟล์หายไปจากดิสก์แล้ว)
 * @param {string} guildId
 * @param {string} fontId
 */
function getGuildFontById(guildId, fontId) {
  return getGuildFonts(guildId).find(f => f.id === fontId) ?? null;
}

/**
 * บันทึกไฟล์ฟอนต์ใหม่ให้เซิร์ฟนี้ — เพิ่มเข้าไปในลิสต์ ไม่ลบของเก่าทิ้งแล้ว
 * (เปลี่ยนจาก v1 ที่อัปใหม่ทับของเก่าทันที) แต่ละไฟล์ได้ id + family name
 * ของตัวเองไม่ซ้ำใคร
 *
 * @param {string} guildId
 * @param {Buffer} buffer - เนื้อไฟล์ฟอนต์ดิบ (โหลดมาจาก attachment.url แล้ว)
 * @param {string} ext - นามสกุลไฟล์ รวมจุดด้วย เช่น '.ttf'
 * @param {string} originalName - ชื่อไฟล์เดิมตอนอัปโหลด (โชว์เป็น label ในเมนูเลือกฟอนต์เลย)
 * @returns {{ ok: true, id: string, path: string, family: string } | { ok: false, reason: 'max_reached' }}
 */
function saveGuildFont(guildId, buffer, ext, originalName) {
  ensureDir();
  const registry = readRegistry();
  const list = registry[guildId] ?? [];

  if (list.length >= MAX_FONTS_PER_GUILD) {
    return { ok: false, reason: 'max_reached' };
  }

  const id       = `font_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const family   = `GuildFont_${id}`;
  const fileName = `${id}${ext}`;
  const fullPath = path.join(FONTS_DIR, fileName);
  fs.writeFileSync(fullPath, buffer);

  list.push({
    id,
    fileName,
    family,
    originalName,
    uploadedAt: new Date().toISOString(),
  });
  registry[guildId] = list;
  writeRegistry(registry);

  return { ok: true, id, path: fullPath, family };
}

/**
 * ลบฟอนต์ตัวเดียวออกจากเซิร์ฟนี้ (ไม่กระทบฟอนต์อื่นที่เหลืออยู่)
 * @param {string} guildId
 * @param {string} fontId
 * @returns {{ id: string, originalName: string } | null} รายการที่ลบไป (null ถ้าไม่เจอ)
 */
function deleteGuildFontById(guildId, fontId) {
  const registry = readRegistry();
  const list = registry[guildId] ?? [];
  const index = list.findIndex(f => f.id === fontId);
  if (index === -1) return null;

  const [removed] = list.splice(index, 1);
  const fullPath = path.join(FONTS_DIR, removed.fileName);
  if (fs.existsSync(fullPath)) {
    try { fs.unlinkSync(fullPath); } catch (e) {
      console.warn('[fontStorage] ลบไฟล์ฟอนต์ไม่สำเร็จ:', e.message);
    }
  }
  registry[guildId] = list;
  writeRegistry(registry);

  return { id: removed.id, originalName: removed.originalName };
}

module.exports = { MAX_FONTS_PER_GUILD, getGuildFonts, getGuildFontById, saveGuildFont, deleteGuildFontById };