// utils/syncDiscordBotList.js
// ─────────────────────────────────────────────────────────────────────────
// ฟีเจอร์ "ส่งรายการ slash command ไปให้ discordbotlist.com" — เพื่อให้หน้าโปรไฟล์บอท
// บนเว็บ discordbotlist.com โชว์รายการคำสั่งของบอทเราแบบอัตโนมัติ ไม่ต้องเข้าไปกรอกเอง
// ทีละคำสั่งในหน้าเว็บ
//
// วิธีทำงานตามเอกสารของ discordbotlist.com: ยิง HTTP POST ไปที่
//   https://discordbotlist.com/api/v1/bots/{CLIENT_ID}/commands
// พร้อมแนบ:
//   - header "Authorization" เป็น token ของ discordbotlist.com (ใช้ยืนยันตัวตนว่าเรา
//     เป็นเจ้าของบอทตัวนี้จริง — ไม่ใช่ token เดียวกับ Discord bot token)
//   - body เป็น JSON array ของคำสั่ง ในรูปแบบเดียวกับที่ Discord API ใช้เป๊ะๆ
//     เช่น [{"name": "ping", "description": "Pong!", "type": 1}]
//
// ไฟล์นี้ "ไม่ได้" เขียนรายการคำสั่งขึ้นมาใหม่เอง — ดึงมาจาก utils/getCommandsJSON.js
// ตัวเดียวกับที่ deploy-commands.js ใช้ลงทะเบียนคำสั่งกับ Discord จริงๆ อยู่แล้ว เพราะ
// รูปแบบ JSON ที่ discordbotlist.com ต้องการตรงกับรูปแบบที่ Discord API ใช้พอดี
// (ผลลัพธ์จาก SlashCommandBuilder.toJSON() มี name/description/type/options ครบอยู่แล้ว)
// ─────────────────────────────────────────────────────────────────────────

const { getCommandsJSON } = require('./getCommandsJSON');

const DISCORDBOTLIST_API_URL = 'https://discordbotlist.com/api/v1/bots';

/**
 * ส่งรายการ slash command ปัจจุบันของบอทไปอัปเดตที่ discordbotlist.com
 *
 * ⚠️ ฟังก์ชันนี้ต้อง "ไม่มีทาง throw error ออกไปนอกฟังก์ชัน" เด็ดขาด (เหมือน
 * sendGuildJoinGreeting ในไฟล์ utils/guildJoinGreeting.js) เพราะฟีเจอร์นี้เป็นแค่
 * "ของเสริม" (nice-to-have) สำหรับโชว์หน้าโปรไฟล์บนเว็บภายนอก — ต่อให้ยิงพลาด
 * (เช่น token ผิด, discordbotlist.com ล่มชั่วคราว, เน็ตมีปัญหา) ก็ไม่ควรทำให้บอทหลัก
 * ทำงานต่อไม่ได้ หรือทำให้ event 'ready' พังทั้งเส้นเด็ดขาด — เพราะงั้นทุกอย่างข้างใน
 * ห่อด้วย try/catch แล้วแค่ console.warn เก็บไว้เฉยๆ ไม่ throw ต่อ
 */
async function syncDiscordBotListCommands() {
  const token = process.env.DISCORDBOTLIST_TOKEN;
  const clientId = process.env.CLIENT_ID;

  // ถ้ายังไม่ได้ตั้งค่าตัวแปรที่จำเป็นไว้เลย (เช่น ยังไม่ได้สมัคร/ผูกบอทกับ
  // discordbotlist.com หรือยังไม่ได้ใส่ token ใน Railway Variables) ให้ข้ามไปเงียบๆ
  // ไม่ต้องฟ้อง error เพราะฟีเจอร์นี้เป็น optional ล้วนๆ ไม่ได้บังคับว่าต้องมี
  if (!token || !clientId) {
    console.warn(
      '[syncDiscordBotList] ไม่พบ DISCORDBOTLIST_TOKEN หรือ CLIENT_ID ใน environment variables — ข้ามการ sync คำสั่งไปยัง discordbotlist.com'
    );
    return;
  }

  try {
    // ดึงรายการคำสั่งจากฟังก์ชันกลางตัวเดียวกับที่ deploy-commands.js ใช้ — ไม่มี
    // การเขียนรายการคำสั่งขึ้นมาใหม่ในไฟล์นี้เลยแม้แต่บรรทัดเดียว
    const commands = getCommandsJSON();

    // fetch() เป็นฟังก์ชันมาตรฐานของ Node.js (มีให้ใช้ในตัวตั้งแต่ Node 18 ขึ้นไป
    // ไม่ต้องติดตั้ง package เพิ่ม เช่น axios/node-fetch) ใช้ยิง HTTP request ได้เลย
    const response = await fetch(`${DISCORDBOTLIST_API_URL}/${clientId}/commands`, {
      method: 'POST',
      headers: {
        // header นี้คือ token ของ discordbotlist.com (คนละตัวกับ Discord bot token
        // ที่ใช้ client.login()) — discordbotlist.com ใช้ยืนยันว่าคำขอนี้มาจาก
        // เจ้าของบอทจริงๆ
        Authorization: token,
        'Content-Type': 'application/json',
      },
      // JSON.stringify แปลง array ของ object ให้เป็นข้อความ JSON ก่อนส่งไปกับ body
      // ของ request (HTTP body ส่งได้แค่ข้อความ/binary เท่านั้น ส่ง object ตรงๆ ไม่ได้)
      body: JSON.stringify(commands),
    });

    // response.ok เป็น true ก็ต่อเมื่อ HTTP status อยู่ในช่วง 200-299 (สำเร็จ) — ถ้าไม่ ok
    // (เช่น 401 token ผิด, 404 ยังไม่ได้เพิ่มบอทในระบบ discordbotlist.com) ให้ log
    // รายละเอียดไว้เฉยๆ ไม่ throw ต่อ เพราะไม่อยากให้กระทบการทำงานหลักของบอท
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '(อ่าน response body ไม่ได้)');
      console.warn(
        `[syncDiscordBotList] ส่งรายการคำสั่งไปยัง discordbotlist.com ไม่สำเร็จ (HTTP ${response.status}): ${bodyText}`
      );
      return;
    }

    console.log(
      `[syncDiscordBotList] ส่งรายการ slash command จำนวน ${commands.length} คำสั่งไปอัปเดตที่ discordbotlist.com สำเร็จ`
    );
  } catch (error) {
    // ดักทุก error ที่อาจเกิดขึ้นระหว่างทาง (เช่น เน็ตล่ม, DNS resolve ไม่ได้,
    // discordbotlist.com เซิร์ฟเวอร์ล่มชั่วคราว) — log ไว้เฉยๆ ไม่ทำให้บอทพัง
    console.warn('[syncDiscordBotList] เกิดข้อผิดพลาดตอน sync คำสั่งไปยัง discordbotlist.com:', error);
  }
}

module.exports = { syncDiscordBotListCommands };