// utils/getCommandsJSON.js
// ─────────────────────────────────────────────────────────────────────────
// ฟังก์ชันกลาง "อ่านทุกไฟล์คำสั่งในโฟลเดอร์ commands/ แล้วแปลงเป็น array แบบ JSON"
//
// เดิมโค้ดแบบนี้อยู่ใน deploy-commands.js อย่างเดียว (บรรทัด 6-14 ของไฟล์นั้น) แยกออกมา
// เป็นไฟล์กลางตรงนี้ เพื่อให้ทั้ง deploy-commands.js (ลงทะเบียนคำสั่งกับ Discord) และ
// utils/syncDiscordBotList.js (ส่งรายการคำสั่งไปโชว์ที่ discordbotlist.com) เรียกใช้
// "โค้ดชุดเดียวกัน" ได้ — ไม่ต้องเขียนรายการคำสั่งซ้ำสองที่ ถ้าวันหลังเพิ่ม/ลบคำสั่ง
// ก็จะเห็นผลอัตโนมัติทั้งสองจุดพร้อมกันเสมอ (ไม่มีทางลืมอัปเดตจุดใดจุดหนึ่ง)
//
// 🔒 อัปเดตล่าสุด: เพิ่มการรองรับคำสั่งที่ตั้ง `ownerOnly: true` ไว้ (เช่น /dev, /referral)
// เพราะคำสั่งพวกนี้เป็นคำสั่งลับเฉพาะเจ้าของบอท ไม่ควรถูกส่งไปโชว์ในเว็บสาธารณะ
// อย่าง discordbotlist.com และไม่ควรถูกลงทะเบียนแบบ Global (ดูรายละเอียดเพิ่มใน
// deploy-commands.js กับ utils/syncDiscordBotList.js)
// ─────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

/**
 * โหลดทุกไฟล์ .js ในโฟลเดอร์ commands/ แบบ "ดิบๆ" — คืนทั้งชื่อไฟล์และตัว module
 * ที่ require() มาได้เลย (ไม่ได้แปลงเป็น JSON ให้ทันที) ไว้ให้ฟังก์ชัน/ไฟล์อื่นที่ต้อง
 * เข้าถึง property อื่นๆ ของคำสั่งนอกเหนือจาก .data (เช่น ownerOnly ที่เพิ่งเพิ่มมา)
 * เอาไปใช้ต่อได้ตามต้องการ โดยไม่ต้องเขียนโค้ด "อ่านโฟลเดอร์ commands/" ซ้ำอีกที่
 * @returns {{file: string, command: object}[]} array ของคู่ {ชื่อไฟล์, module ที่ require มา}
 */
function loadCommandModules() {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  return commandFiles.map((file) => {
    // require() ของไฟล์เดียวกันซ้ำๆ ไม่ได้ทำให้โค้ดรันซ้ำ — Node.js มี "require cache"
    // เก็บผลลัพธ์การโหลดไฟล์ไว้ ถ้าไฟล์นี้เคยถูก require ไปแล้วที่อื่น (เช่นใน index.js
    // ตอนโหลด client.commands) จะได้ค่าเดิมจาก cache ทันที ไม่เสียเวลาอ่านไฟล์ซ้ำ
    const command = require(path.join(commandsPath, file));
    return { file, command };
  });
}

/**
 * อ่านทุกไฟล์ .js ในโฟลเดอร์ commands/ แล้วแปลงแต่ละคำสั่งเป็น JSON ตามรูปแบบที่
 * Discord API ใช้ (ผ่าน .toJSON() ของ SlashCommandBuilder) — ได้ผลลัพธ์เป็น array เช่น
 * [{ name: 'ping', description: 'Pong!', type: 1, ... }, ...]
 *
 * รูปแบบนี้ตรงกับที่ discordbotlist.com ต้องการเป๊ะๆ พอดี (เขาบอกไว้ในเอกสารว่า
 * "JSON array แบบเดียวกับที่ Discord API ใช้") เลยเอามาใช้ซ้ำได้ตรงๆ โดยไม่ต้องแปลง
 * รูปแบบเพิ่มเติมเลย
 *
 * @param {object} [options]
 * @param {boolean} [options.excludeOwnerOnly] - ถ้าเป็น true จะไม่เอาคำสั่งที่ตั้ง
 *   `ownerOnly: true` ไว้ (เช่น /dev, /referral) เข้ามาในผลลัพธ์เลย — ใช้ตอนจะส่งรายการ
 *   คำสั่งไปที่ discordbotlist.com เพื่อไม่ให้คำสั่งลับหลุดไปโชว์บนเว็บสาธารณะ
 * @returns {object[]} array ของคำสั่ง ในรูปแบบ Discord command JSON
 */
function getCommandsJSON(options = {}) {
  const { excludeOwnerOnly = false } = options;

  return loadCommandModules()
    .filter(({ command }) => !excludeOwnerOnly || !command.ownerOnly)
    .map(({ command }) => command.data.toJSON());
}

module.exports = { getCommandsJSON, loadCommandModules };
