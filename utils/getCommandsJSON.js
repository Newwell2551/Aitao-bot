// utils/getCommandsJSON.js
// ─────────────────────────────────────────────────────────────────────────
// ฟังก์ชันกลาง "อ่านทุกไฟล์คำสั่งในโฟลเดอร์ commands/ แล้วแปลงเป็น array แบบ JSON"
//
// เดิมโค้ดแบบนี้อยู่ใน deploy-commands.js อย่างเดียว (บรรทัด 6-14 ของไฟล์นั้น) แยกออกมา
// เป็นไฟล์กลางตรงนี้ เพื่อให้ทั้ง deploy-commands.js (ลงทะเบียนคำสั่งกับ Discord) และ
// utils/syncDiscordBotList.js (ส่งรายการคำสั่งไปโชว์ที่ discordbotlist.com) เรียกใช้
// "โค้ดชุดเดียวกัน" ได้ — ไม่ต้องเขียนรายการคำสั่งซ้ำสองที่ ถ้าวันหลังเพิ่ม/ลบคำสั่ง
// ก็จะเห็นผลอัตโนมัติทั้งสองจุดพร้อมกันเสมอ (ไม่มีทางลืมอัปเดตจุดใดจุดหนึ่ง)
// ─────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

/**
 * อ่านทุกไฟล์ .js ในโฟลเดอร์ commands/ แล้วแปลงแต่ละคำสั่งเป็น JSON ตามรูปแบบที่
 * Discord API ใช้ (ผ่าน .toJSON() ของ SlashCommandBuilder) — ได้ผลลัพธ์เป็น array เช่น
 * [{ name: 'ping', description: 'Pong!', type: 1, ... }, ...]
 *
 * รูปแบบนี้ตรงกับที่ discordbotlist.com ต้องการเป๊ะๆ พอดี (เขาบอกไว้ในเอกสารว่า
 * "JSON array แบบเดียวกับที่ Discord API ใช้") เลยเอามาใช้ซ้ำได้ตรงๆ โดยไม่ต้องแปลง
 * รูปแบบเพิ่มเติมเลย
 * @returns {object[]} array ของคำสั่งทั้งหมด ในรูปแบบ Discord command JSON
 */
function getCommandsJSON() {
  const commands = [];
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    // require() ของไฟล์เดียวกันซ้ำๆ ไม่ได้ทำให้โค้ดรันซ้ำ — Node.js มี "require cache"
    // เก็บผลลัพธ์การโหลดไฟล์ไว้ ถ้าไฟล์นี้เคยถูก require ไปแล้วที่อื่น (เช่นใน index.js
    // ตอนโหลด client.commands) จะได้ค่าเดิมจาก cache ทันที ไม่เสียเวลาอ่านไฟล์ซ้ำ
    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
  }

  return commands;
}

module.exports = { getCommandsJSON };