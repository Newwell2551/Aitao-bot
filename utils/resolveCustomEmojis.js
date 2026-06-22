/**
 * ค้นหาคำที่อยู่ในรูปแบบ :ชื่อ: ในข้อความดิบ แล้วเทียบกับรายชื่อ custom emoji ของ guild นั้น
 * ถ้าเจอ ให้แปลงเป็นรูปแบบที่ Discord เรนเดอร์เป็นรูปอิโมจิได้จริง:
 *   - อิโมจิธรรมดา  -> <:ชื่อ:id>
 *   - อิโมจิเคลื่อนไหว (gif) -> <a:ชื่อ:id>
 *
 * ทำไมต้องแปลงเอง: ตอนพิมพ์ในกล่องแชทของ Discord ปกติ ตัว Discord client จะช่วยแปลง :ชื่อ: ให้อัตโนมัติ
 * แต่ข้อความที่ส่งผ่าน bot/API (เช่นจาก modal) จะไม่ถูกแปลงให้ ต้องแปลงเองก่อนส่งออกไป
 *
 * @param {string} text - ข้อความดิบจาก modal เช่น "ใช้สามัญสำนึก :mail_1: คิดก่อนพิมพ์"
 * @param {import('discord.js').Guild | null | undefined} guild - guild ที่จะค้นหา custom emoji (ถ้าไม่มี เช่น DM จะคืนข้อความเดิม)
 * @returns {string} ข้อความที่แปลง :ชื่อ: เป็น <:ชื่อ:id> แล้ว (ส่วนที่หาอิโมจิไม่เจอจะคงข้อความเดิมไว้)
 */
function resolveCustomEmojis(text, guild) {
  if (!text) return text;
  if (!guild || !guild.emojis || !guild.emojis.cache) {
    // ไม่มี guild ให้ค้นหา (เช่น ใช้ในข้อความส่วนตัว/DM) — คืนข้อความเดิม ไม่แปลงอะไร
    return text;
  }

  // ขั้นที่ 1: ดึงโค้ดอิโมจิที่ "แปลงสมบูรณ์แล้ว" ทั้งก้อน (<:ชื่อ:id> หรือ <a:ชื่อ:id>) ออกมาพักไว้ก่อน
  // แล้วแทนที่ตำแหน่งเดิมด้วย placeholder ชั่วคราว (ใช้ \u0000 อักขระควบคุมที่ผู้ใช้พิมพ์เองไม่ได้ กันชนกับข้อความจริง)
  // ทำแบบนี้เพื่อให้ขั้นที่ 2 "มองไม่เห็น" โค้ดที่แปลงแล้วเลย จะได้ไม่มีทางไปจับคู่ ":ชื่อ:" ที่ซ้อนอยู่ข้างในโดยไม่ตั้งใจ
  const alreadyConverted = [];
  const textWithPlaceholders = text.replace(/<a?:[^\s:]+:\d+>/g, (fullMatch) => {
    const placeholder = `\u0000EMOJI_${alreadyConverted.length}\u0000`;
    alreadyConverted.push(fullMatch);
    return placeholder;
  });

  // ขั้นที่ 2: แปลง :ชื่อ: ที่เหลือ (ตอนนี้ปลอดภัยแล้ว เพราะโค้ดที่แปลงแล้วถูกดึงออกไปเก็บไว้ต่างหากหมดแล้ว)
  const resolvedText = textWithPlaceholders.replace(/:([^\s:]+):/g, (fullMatch, emojiName) => {
    const emoji = guild.emojis.cache.find((e) => e.name === emojiName);

    if (!emoji) {
      // หาไม่เจอใน guild นี้ — อาจพิมพ์ผิดชื่อ หรือไม่ใช่ custom emoji เลย (เช่น เผลอพิมพ์ :something: ปกติ)
      return fullMatch;
    }

    return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
  });

  // ขั้นที่ 3: เอาโค้ดที่พักไว้ตอนขั้นที่ 1 ใส่กลับเข้าตำแหน่งเดิม
  return resolvedText.replace(/\u0000EMOJI_(\d+)\u0000/g, (fullMatch, indexStr) => {
    return alreadyConverted[Number(indexStr)];
  });
}

module.exports = { resolveCustomEmojis };