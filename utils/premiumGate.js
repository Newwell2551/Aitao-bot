// utils/premiumGate.js
// Helper กลางสำหรับสร้างข้อความ "เตือนอัปเกรด" (Premium Gate) แบบมาตรฐานเดียวกันทั้งบอท
// ใช้ร่วมกันได้ทุกคำสั่งที่มีจุดจำกัดฟีเจอร์ไว้เฉพาะแผน Premium (เช่น role-setup, builder)
// เป็น namespace กลาง "premium_gate" ไม่ผูกกับ command ไหนคำสั่งหนึ่ง เพราะใช้ร่วมกันหลายจุด

/**
 * สร้างข้อความเตือนอัปเกรด แบบมาตรฐานเดียวกันทั้งบอท
 * @param {(key: string, replacements?: object) => string} t - translator ของ guild นั้น (จาก createTranslator)
 * @param {string} reasonText - เหตุผลเฉพาะจุด (ต้องแปลมาก่อนแล้วด้วย t() ของฟังก์ชันที่เรียก
 *   เช่น "This server already has the maximum number of role setups allowed on the Free plan (1).")
 * @returns {string} ข้อความเต็มพร้อมใช้ใน interaction.reply()
 */
function buildUpgradeMessage(t, reasonText) {
  return t('premium_gate.message', { reason: reasonText });
}

module.exports = { buildUpgradeMessage };