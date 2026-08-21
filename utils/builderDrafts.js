/**
 * In-memory draft store + auto-sync กับ builderStorage.js
 *
 * โครงสร้าง in-memory draft ต่อ (guildId, userId):
 * {
 *   blocks: object[],
 *   accentColor: string | null,
 *   pendingRoleButton?: {...},
 *   pendingChannelButton?: {...},
 *   // Named draft metadata (มีเฉพาะ draft ที่ผูกกับชื่อ)
 *   _guildId?: string,
 *   _builderName?: string,
 *   _createdBy?: string,
 *   _createdAt?: string,
 * }
 *
 * Draft ที่มี _builderName จะ auto-save ลง drafts.json ทุกครั้งที่มีการเปลี่ยนแปลง
 * ผ่าน _autoSave() ที่เรียกต่อท้าย mutation function ทุกตัว
 *
 * 🔑 ทำไม Map key ต้องเป็น `${guildId}_${userId}` ไม่ใช่ userId เฉยๆ:
 * เดิม key เป็น userId เดี่ยวๆ ทำให้ถ้าแอดมินคนเดียวกันเปิด /builder ในเซิร์ฟ A
 * ค้างไว้ (ยังไม่กด "เสร็จแล้ว"/โพสต์) แล้วสลับไปเปิด /builder ในเซิร์ฟ B ก่อน
 * ข้อมูลของเซิร์ฟ B จะไปทับ session ในหน่วยความจำของเซิร์ฟ A ทันที (เพราะ
 * key ใน Map เป็นตัวเดียวกัน — คนเดียวกันไม่ว่าจะอยู่เซิร์ฟไหน) พอกลับไปกดปุ่ม
 * ที่ panel ค้างของเซิร์ฟ A ระบบจะเผลอบันทึกข้อมูลของเซิร์ฟ B ลงไฟล์การตั้งค่า
 * ของเซิร์ฟ A แทน (cross-guild data corruption) — เป็นบัคเงียบ ไม่มี error
 * โผล่ให้เห็นเลย เพราะโค้ดรันผ่านได้ปกติทุกจุด แค่ข้อมูลผิดเซิร์ฟ
 *
 * แก้โดยผูก Map key กับทั้ง guildId และ userId พร้อมกัน (Discord ID เป็นตัวเลข
 * ล้วน ใช้ underscore คั่นได้ปลอดภัย ไม่มีทางชนกัน) แต่ละเซิร์ฟจะมี session
 * แยกกันเด็ดขาดในหน่วยความจำ ต่อให้ user คนเดียวกันเปิดพร้อมกันหลายเซิร์ฟก็ไม่ชนกัน
 */

const {
  saveDraft,
  loadDraft,
  draftExists,
  deleteDraftFromStorage,
  listDrafts,
} = require('./builderStorage');

const drafts = new Map();

/**
 * สร้าง Map key ผสมจาก guildId + userId — รวมไว้จุดเดียวทั่วทั้งไฟล์ กันเผลอ
 * พิมพ์รูปแบบ key ไม่ตรงกันระหว่างจุดต่างๆ (เช่นลืมใส่ underscore หรือสลับลำดับ)
 * @param {string} guildId
 * @param {string} userId
 * @returns {string}
 */
function makeKey(guildId, userId) {
  return `${guildId}_${userId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * บันทึก in-memory draft ลง storage ถ้า draft นี้มีชื่อ (_builderName)
 * เรียกต่อท้ายทุก mutation function
 * @param {string} guildId
 * @param {string} userId - ผู้ที่ทำการเปลี่ยนแปลง (บันทึกเป็น updatedBy)
 */
function _autoSave(guildId, userId) {
  const draft = drafts.get(makeKey(guildId, userId));
  if (!draft || !draft._guildId || !draft._builderName) return;

  saveDraft(draft._guildId, draft._builderName, {
    name: draft._builderName,
    blocks: draft.blocks ?? [],
    accentColor: draft.accentColor ?? null,
    // ⚠️ createdBy/updatedBy ต้องเก็บ userId ดิบๆ เหมือนเดิม ห้ามเก็บ key ผสม
    // (guildId_userId) ลงไปแทน เพราะ field พวกนี้ใช้แสดงผลจริงว่า "ใคร" เป็น
    // คนแก้ ไม่ใช่ตัวระบุ session — ตัว Map key เท่านั้นที่ต้องเป็น key ผสม
    createdBy: draft._createdBy ?? userId,
    createdAt: draft._createdAt ?? new Date().toISOString(),
    updatedBy: userId,
    updatedAt: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core draft CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ดึง draft ของ user คนนี้ในเซิร์ฟนี้ ถ้ายังไม่เคยมีจะสร้างอันใหม่ว่างๆ ให้อัตโนมัติ
 * @param {string} guildId
 * @param {string} userId
 * @returns {{ blocks: object[] }}
 */
function getDraft(guildId, userId) {
  const key = makeKey(guildId, userId);
  if (!drafts.has(key)) {
    drafts.set(key, { blocks: [] });
  }
  return drafts.get(key);
}

/**
 * เพิ่ม block ใหม่เข้าไปท้าย draft
 * @param {string} guildId
 * @param {string} userId
 * @param {object} block
 */
function addBlock(guildId, userId, block) {
  const draft = getDraft(guildId, userId);
  draft.blocks.push(block);
  _autoSave(guildId, userId);
  return draft;
}

/**
 * ล้าง draft ของ user คนนี้ทิ้ง (เรียกหลังกดโพสต์สำเร็จ)
 * ⚠️ ไม่ลบออกจาก storage เพราะ named draft ควรอยู่ถาวร
 * @param {string} guildId
 * @param {string} userId
 */
function clearDraft(guildId, userId) {
  drafts.delete(makeKey(guildId, userId));
}

/**
 * ลบ block ล่าสุด (อันท้ายสุด) ออกจาก draft
 * @param {string} guildId
 * @param {string} userId
 * @returns {object|null}
 */
function removeLastBlock(guildId, userId) {
  const draft = getDraft(guildId, userId);
  if (draft.blocks.length === 0) return null;
  const removed = draft.blocks.pop();
  _autoSave(guildId, userId);
  return removed;
}

/**
 * ดึง block ที่ตำแหน่ง index ที่ระบุ
 * @param {string} guildId
 * @param {string} userId
 * @param {number} index
 * @returns {object|undefined}
 */
function getBlockAt(guildId, userId, index) {
  const draft = getDraft(guildId, userId);
  return draft.blocks[index];
}

/**
 * ลบ block ที่ตำแหน่ง index ที่ระบุออก
 * @param {string} guildId
 * @param {string} userId
 * @param {number} index
 * @returns {object|null}
 */
function removeBlockAt(guildId, userId, index) {
  const draft = getDraft(guildId, userId);
  if (!draft.blocks[index]) return null;
  const removed = draft.blocks.splice(index, 1)[0];
  _autoSave(guildId, userId);
  return removed;
}

/**
 * แทนที่ block ที่ตำแหน่ง index ด้วย block ใหม่
 * @param {string} guildId
 * @param {string} userId
 * @param {number} index
 * @param {object} newBlock
 */
function updateBlockAt(guildId, userId, index, newBlock) {
  const draft = getDraft(guildId, userId);
  if (!draft.blocks[index]) return false;
  draft.blocks[index] = newBlock;
  _autoSave(guildId, userId);
  return true;
}

/**
 * แทรก block ใหม่เข้าไปที่ตำแหน่ง position
 * @param {string} guildId
 * @param {string} userId
 * @param {number} position
 * @param {object} block
 */
function insertBlockAt(guildId, userId, position, block) {
  const draft = getDraft(guildId, userId);
  const clampedPosition = Math.max(0, Math.min(position, draft.blocks.length));
  draft.blocks.splice(clampedPosition, 0, block);
  _autoSave(guildId, userId);
  return draft;
}

/**
 * ตั้งค่า accentColor ของ draft
 * @param {string} guildId
 * @param {string} userId
 * @param {string} hexColor
 */
function setAccentColor(guildId, userId, hexColor) {
  const draft = getDraft(guildId, userId);
  draft.accentColor = hexColor;
  _autoSave(guildId, userId);
  return draft;
}

/**
 * สลับตำแหน่ง block สองอัน
 * @param {string} guildId
 * @param {string} userId
 * @param {number} indexA
 * @param {number} indexB
 * @returns {boolean}
 */
function swapBlocks(guildId, userId, indexA, indexB) {
  const draft = getDraft(guildId, userId);
  if (!draft.blocks[indexA] || !draft.blocks[indexB]) return false;
  [draft.blocks[indexA], draft.blocks[indexB]] = [draft.blocks[indexB], draft.blocks[indexA]];
  _autoSave(guildId, userId);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending state — ปุ่มยศ
// ─────────────────────────────────────────────────────────────────────────────

function setPendingRoleButton(guildId, userId, pending) {
  const draft = getDraft(guildId, userId);
  draft.pendingRoleButton = pending;
}

function getPendingRoleButton(guildId, userId) {
  return getDraft(guildId, userId).pendingRoleButton;
}

function clearPendingRoleButton(guildId, userId) {
  const draft = getDraft(guildId, userId);
  delete draft.pendingRoleButton;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending state — ปุ่มลิงก์ช่อง
// ─────────────────────────────────────────────────────────────────────────────

function setPendingChannelButton(guildId, userId, pending) {
  const draft = getDraft(guildId, userId);
  draft.pendingChannelButton = pending;
}

function getPendingChannelButton(guildId, userId) {
  return getDraft(guildId, userId).pendingChannelButton;
}

function clearPendingChannelButton(guildId, userId) {
  const draft = getDraft(guildId, userId);
  delete draft.pendingChannelButton;
}

// ─────────────────────────────────────────────────────────────────────────────
// Named draft management — ใช้ argument order ตาม builder.js: (guildId, name, userId)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * เช็คว่า named draft นี้มีอยู่ในเซิร์ฟเวอร์ไหม
 * @param {string} guildId
 * @param {string} name
 * @returns {boolean}
 */
function namedDraftExists(guildId, name) {
  return draftExists(guildId, name);
}

/**
 * สร้าง named draft ใหม่ใน storage + โหลดเข้า memory session ของ userId
 * เรียกเมื่อผู้ใช้รัน /builder new [name]
 * @param {string} guildId
 * @param {string} name
 * @param {string} userId
 */
function createNamedDraft(guildId, name, userId) {
  const now = new Date().toISOString();

  // บันทึกลง storage ทันที เพื่อให้ปรากฏใน /builder list
  saveDraft(guildId, name, {
    name,
    blocks: [],
    accentColor: null,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  });

  // โหลดเข้า memory ด้วย key ผสม guildId_userId (กัน session ชนข้ามเซิร์ฟ)
  const key = makeKey(guildId, userId);
  drafts.set(key, {
    blocks: [],
    accentColor: null,
    _guildId: guildId,
    _builderName: name,
    _createdBy: userId,
    _createdAt: now,
  });

  return drafts.get(key);
}

/**
 * โหลด named draft จาก storage เข้า memory session ของ userId
 * เรียกเมื่อผู้ใช้รัน /builder open [name]
 * @param {string} guildId
 * @param {string} name
 * @param {string} userId
 * @returns {object|null} null ถ้าหาไม่เจอ
 */
function openNamedDraft(guildId, name, userId) {
  const data = loadDraft(guildId, name);
  if (!data) return null;

  const key = makeKey(guildId, userId);
  drafts.set(key, {
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
    accentColor: data.accentColor ?? null,
    _guildId: guildId,
    _builderName: name,
    _createdBy: data.createdBy ?? userId,
    _createdAt: data.createdAt ?? new Date().toISOString(),
  });

  return drafts.get(key);
}

/**
 * ลบ named draft จาก storage ถาวร และล้าง memory session ทุก user ที่กำลังใช้ draft นี้
 * @param {string} guildId
 * @param {string} name
 * @returns {boolean} true = ลบสำเร็จ, false = ไม่พบ draft
 */
function deleteNamedDraft(guildId, name) {
  if (!draftExists(guildId, name)) return false;

  deleteDraftFromStorage(guildId, name);

  // ล้าง in-memory session ของทุก user ที่กำลัง active อยู่กับ draft นี้
  // ⚠️ ตัวแปร loop ต้องเป็น "key" (รูปแบบ guildId_userId) ไม่ใช่ userId เดี่ยวๆ
  // แล้ว เพราะตอนนี้ Map key ไม่ใช่ userId ตรงๆ อีกต่อไป — ถ้ายังใช้ userId
  // ไปเรียก drafts.delete(userId) จะลบไม่ออกจริง (เพราะไม่มี key ชื่อ userId
  // เดี่ยวๆ อยู่ใน Map เลย) กลายเป็น session เก่าค้างในหน่วยความจำตลอดไป
  // ไม่ error ให้เห็น แต่รั่วหน่วยความจำเงียบๆ
  for (const [key, draft] of drafts.entries()) {
    if (draft._guildId === guildId && draft._builderName === name) {
      drafts.delete(key);
    }
  }

  return true;
}

/**
 * แสดงรายการ draft ทั้งหมดของเซิร์ฟเวอร์ เรียงตาม updatedAt ล่าสุดก่อน
 * เพิ่ม blockCount field เพื่อให้ builder.js แสดงจำนวนบล็อกได้โดยไม่ต้องนับเอง
 * @param {string} guildId
 * @returns {Array<{ name, blockCount, blocks, accentColor, createdBy, createdAt, updatedBy, updatedAt }>}
 */
function listGuildDrafts(guildId) {
  return listDrafts(guildId).map((d) => ({
    ...d,
    blockCount: Array.isArray(d.blocks) ? d.blocks.length : 0,
  }));
}

/**
 * ดึงข้อมูล named draft ที่ user กำลัง active อยู่ในเซิร์ฟนี้
 * ใช้ใน buildPanelComponents() เพื่อแสดงชื่อ draft ใน header
 * @param {string} guildId
 * @param {string} userId
 * @returns {{ guildId: string, name: string } | null}
 */
function getActiveSession(guildId, userId) {
  // ใช้ drafts.get โดยตรง ไม่ใช้ getDraft() เพราะไม่อยากสร้าง empty draft โดยไม่ตั้งใจ
  const draft = drafts.get(makeKey(guildId, userId));
  if (!draft || !draft._guildId || !draft._builderName) return null;
  return { guildId: draft._guildId, name: draft._builderName };
}

/**
 * ล้าง active session ของ user ในเซิร์ฟนี้ (alias ของ clearDraft)
 * @param {string} guildId
 * @param {string} userId
 */
function clearActiveSession(guildId, userId) {
  drafts.delete(makeKey(guildId, userId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // core CRUD
  getDraft,
  addBlock,
  removeLastBlock,
  clearDraft,
  getBlockAt,
  removeBlockAt,
  updateBlockAt,
  insertBlockAt,
  setAccentColor,
  swapBlocks,
  // pending states
  setPendingRoleButton,
  getPendingRoleButton,
  clearPendingRoleButton,
  setPendingChannelButton,
  getPendingChannelButton,
  clearPendingChannelButton,
  // named draft management
  namedDraftExists,
  createNamedDraft,
  openNamedDraft,
  deleteNamedDraft,
  listGuildDrafts,
  getActiveSession,
  clearActiveSession,
};