/**
 * In-memory draft store + auto-sync กับ builderStorage.js
 *
 * โครงสร้าง in-memory draft ต่อ userId:
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
 */

const {
  saveDraft,
  loadDraft,
  draftExists,
  deleteDraftFromStorage,
  listDrafts,
} = require('./builderStorage');

const drafts = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * บันทึก in-memory draft ลง storage ถ้า draft นี้มีชื่อ (_builderName)
 * เรียกต่อท้ายทุก mutation function
 * @param {string} userId - ผู้ที่ทำการเปลี่ยนแปลง (บันทึกเป็น updatedBy)
 */
function _autoSave(userId) {
  const draft = drafts.get(userId);
  if (!draft || !draft._guildId || !draft._builderName) return;

  saveDraft(draft._guildId, draft._builderName, {
    name: draft._builderName,
    blocks: draft.blocks ?? [],
    accentColor: draft.accentColor ?? null,
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
 * ดึง draft ของ user คนนี้ ถ้ายังไม่เคยมีจะสร้างอันใหม่ว่างๆ ให้อัตโนมัติ
 * @param {string} userId
 * @returns {{ blocks: object[] }}
 */
function getDraft(userId) {
  if (!drafts.has(userId)) {
    drafts.set(userId, { blocks: [] });
  }
  return drafts.get(userId);
}

/**
 * เพิ่ม block ใหม่เข้าไปท้าย draft
 * @param {string} userId
 * @param {object} block
 */
function addBlock(userId, block) {
  const draft = getDraft(userId);
  draft.blocks.push(block);
  _autoSave(userId);
  return draft;
}

/**
 * ล้าง draft ของ user คนนี้ทิ้ง (เรียกหลังกดโพสต์สำเร็จ)
 * ⚠️ ไม่ลบออกจาก storage เพราะ named draft ควรอยู่ถาวร
 * @param {string} userId
 */
function clearDraft(userId) {
  drafts.delete(userId);
}

/**
 * ลบ block ล่าสุด (อันท้ายสุด) ออกจาก draft
 * @param {string} userId
 * @returns {object|null}
 */
function removeLastBlock(userId) {
  const draft = getDraft(userId);
  if (draft.blocks.length === 0) return null;
  const removed = draft.blocks.pop();
  _autoSave(userId);
  return removed;
}

/**
 * ดึง block ที่ตำแหน่ง index ที่ระบุ
 * @param {string} userId
 * @param {number} index
 * @returns {object|undefined}
 */
function getBlockAt(userId, index) {
  const draft = getDraft(userId);
  return draft.blocks[index];
}

/**
 * ลบ block ที่ตำแหน่ง index ที่ระบุออก
 * @param {string} userId
 * @param {number} index
 * @returns {object|null}
 */
function removeBlockAt(userId, index) {
  const draft = getDraft(userId);
  if (!draft.blocks[index]) return null;
  const removed = draft.blocks.splice(index, 1)[0];
  _autoSave(userId);
  return removed;
}

/**
 * แทนที่ block ที่ตำแหน่ง index ด้วย block ใหม่
 * @param {string} userId
 * @param {number} index
 * @param {object} newBlock
 */
function updateBlockAt(userId, index, newBlock) {
  const draft = getDraft(userId);
  if (!draft.blocks[index]) return false;
  draft.blocks[index] = newBlock;
  _autoSave(userId);
  return true;
}

/**
 * แทรก block ใหม่เข้าไปที่ตำแหน่ง position
 * @param {string} userId
 * @param {number} position
 * @param {object} block
 */
function insertBlockAt(userId, position, block) {
  const draft = getDraft(userId);
  const clampedPosition = Math.max(0, Math.min(position, draft.blocks.length));
  draft.blocks.splice(clampedPosition, 0, block);
  _autoSave(userId);
  return draft;
}

/**
 * ตั้งค่า accentColor ของ draft
 * @param {string} userId
 * @param {string} hexColor
 */
function setAccentColor(userId, hexColor) {
  const draft = getDraft(userId);
  draft.accentColor = hexColor;
  _autoSave(userId);
  return draft;
}

/**
 * สลับตำแหน่ง block สองอัน
 * @param {string} userId
 * @param {number} indexA
 * @param {number} indexB
 * @returns {boolean}
 */
function swapBlocks(userId, indexA, indexB) {
  const draft = getDraft(userId);
  if (!draft.blocks[indexA] || !draft.blocks[indexB]) return false;
  [draft.blocks[indexA], draft.blocks[indexB]] = [draft.blocks[indexB], draft.blocks[indexA]];
  _autoSave(userId);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending state — ปุ่มยศ
// ─────────────────────────────────────────────────────────────────────────────

function setPendingRoleButton(userId, pending) {
  const draft = getDraft(userId);
  draft.pendingRoleButton = pending;
}

function getPendingRoleButton(userId) {
  return getDraft(userId).pendingRoleButton;
}

function clearPendingRoleButton(userId) {
  const draft = getDraft(userId);
  delete draft.pendingRoleButton;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending state — ปุ่มลิงก์ช่อง
// ─────────────────────────────────────────────────────────────────────────────

function setPendingChannelButton(userId, pending) {
  const draft = getDraft(userId);
  draft.pendingChannelButton = pending;
}

function getPendingChannelButton(userId) {
  return getDraft(userId).pendingChannelButton;
}

function clearPendingChannelButton(userId) {
  const draft = getDraft(userId);
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

  // โหลดเข้า memory
  drafts.set(userId, {
    blocks: [],
    accentColor: null,
    _guildId: guildId,
    _builderName: name,
    _createdBy: userId,
    _createdAt: now,
  });

  return drafts.get(userId);
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

  drafts.set(userId, {
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
    accentColor: data.accentColor ?? null,
    _guildId: guildId,
    _builderName: name,
    _createdBy: data.createdBy ?? userId,
    _createdAt: data.createdAt ?? new Date().toISOString(),
  });

  return drafts.get(userId);
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
  for (const [userId, draft] of drafts.entries()) {
    if (draft._guildId === guildId && draft._builderName === name) {
      drafts.delete(userId);
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
 * ดึงข้อมูล named draft ที่ user กำลัง active อยู่
 * ใช้ใน buildPanelComponents() เพื่อแสดงชื่อ draft ใน header
 * @param {string} userId
 * @returns {{ guildId: string, name: string } | null}
 */
function getActiveSession(userId) {
  // ใช้ drafts.get โดยตรง ไม่ใช้ getDraft() เพราะไม่อยากสร้าง empty draft โดยไม่ตั้งใจ
  const draft = drafts.get(userId);
  if (!draft || !draft._guildId || !draft._builderName) return null;
  return { guildId: draft._guildId, name: draft._builderName };
}

/**
 * ล้าง active session ของ user (alias ของ clearDraft)
 * @param {string} userId
 */
function clearActiveSession(userId) {
  drafts.delete(userId);
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