// เก็บ draft (schema ที่ยังสร้างไม่เสร็จ) ของแต่ละ user แยกกัน
// key = user.id (เลขเฉพาะของบัญชี Discord แต่ละคน ไม่มีทางซ้ำ)
// value = { blocks: [...] } ตรงตามโครงสร้างที่ buildMessageFromSchema() รับได้
//
// ⚠️ ข้อมูลนี้อยู่ใน memory ของโปรเซสเท่านั้น ถ้าบอท restart draft จะหายหมด
// ถ้าต้องการให้ข้อมูลอยู่ถาวรข้ามการ restart ค่อยย้ายไปเก็บเป็นไฟล์ JSON หรือ database ทีหลัง
const drafts = new Map();

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
 * เพิ่ม block ใหม่เข้าไปท้าย draft ของ user คนนี้
 * @param {string} userId
 * @param {object} block - block ตามรูปแบบที่ buildMessageFromSchema() เข้าใจ เช่น { type: 'text', content: '...' }
 */
function addBlock(userId, block) {
  const draft = getDraft(userId);
  draft.blocks.push(block);
  return draft;
}

/**
 * ล้าง draft ของ user คนนี้ทิ้ง (เรียกหลังกดโพสต์สำเร็จ)
 * @param {string} userId
 */
function clearDraft(userId) {
  drafts.delete(userId);
}

/**
 * ลบ block ล่าสุด (อันท้ายสุด) ออกจาก draft ของ user คนนี้
 * @param {string} userId
 * @returns {object|null} block ที่ถูกลบออกไป หรือ null ถ้า draft ว่างอยู่แล้ว
 */
function removeLastBlock(userId) {
  const draft = getDraft(userId);
  if (draft.blocks.length === 0) {
    return null;
  }
  return draft.blocks.pop();
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
 * ลบ block ที่ตำแหน่ง index ที่ระบุออก (ไม่ใช่แค่ตัวท้ายสุด)
 * @param {string} userId
 * @param {number} index
 * @returns {object|null} block ที่ถูกลบออกไป หรือ null ถ้าไม่มี block ที่ index นั้น
 */
function removeBlockAt(userId, index) {
  const draft = getDraft(userId);
  if (!draft.blocks[index]) {
    return null;
  }
  return draft.blocks.splice(index, 1)[0];
}

/**
 * แทนที่ block ที่ตำแหน่ง index ด้วย block ใหม่ (ใช้ตอนแก้ไข)
 * @param {string} userId
 * @param {number} index
 * @param {object} newBlock
 */
function updateBlockAt(userId, index, newBlock) {
  const draft = getDraft(userId);
  if (!draft.blocks[index]) {
    return false;
  }
  draft.blocks[index] = newBlock;
  return true;
}

/**
 * แทรก block ใหม่เข้าไปที่ตำแหน่ง position ที่ระบุ (ดันของเดิมที่ตำแหน่งนั้นและหลังจากนั้นเลื่อนไปทีละ 1)
 * ต่างจาก addBlock ตรงที่ addBlock จะต่อท้าย array เสมอ ส่วนอันนี้แทรกตรงกลางได้
 * @param {string} userId
 * @param {number} position - ตำแหน่งที่จะแทรก (0 = แทรกไว้หน้าสุด)
 * @param {object} block
 */
function insertBlockAt(userId, position, block) {
  const draft = getDraft(userId);
  // กันตำแหน่งหลุดขอบเขต (ติดลบ หรือเกินความยาว array) ให้อยู่ในช่วงที่ใช้ได้เสมอ
  const clampedPosition = Math.max(0, Math.min(position, draft.blocks.length));
  draft.blocks.splice(clampedPosition, 0, block);
  return draft;
}

/**
 * ตั้งค่า accentColor (สีแถบด้านข้าง) ของ draft ผู้ใช้คนนี้
 * @param {string} userId
 * @param {string} hexColor - เช่น "#9CAF88"
 */
function setAccentColor(userId, hexColor) {
  const draft = getDraft(userId);
  draft.accentColor = hexColor;
  return draft;
}

/**
 * สลับตำแหน่ง block สองอันใน draft (ใช้สำหรับปุ่มย้ายขึ้น/ย้ายลง)
 * @param {string} userId
 * @param {number} indexA
 * @param {number} indexB
 * @returns {boolean} true ถ้าสลับสำเร็จ, false ถ้า index ใดอันหนึ่งไม่มีอยู่จริง
 */
function swapBlocks(userId, indexA, indexB) {
  const draft = getDraft(userId);
  if (!draft.blocks[indexA] || !draft.blocks[indexB]) {
    return false;
  }
  [draft.blocks[indexA], draft.blocks[indexB]] = [draft.blocks[indexB], draft.blocks[indexA]];
  return true;
}

module.exports = {
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
};