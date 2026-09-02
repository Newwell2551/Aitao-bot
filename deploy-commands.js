const { REST, Routes } = require('discord.js');
require('dotenv').config();
const { getCommandsJSON } = require('./utils/getCommandsJSON');

// 1. รวบรวมข้อมูลคำสั่งทั้งหมดจากโฟลเดอร์ commands
// (ย้ายไปอยู่ใน utils/getCommandsJSON.js แล้ว — ไฟล์นี้เรียกใช้ฟังก์ชันเดียวกับที่
// utils/syncDiscordBotList.js ใช้ส่งรายการคำสั่งไปที่ discordbotlist.com เพื่อไม่ให้
// ต้องเขียนโค้ด "อ่านไฟล์ commands/ แล้วแปลงเป็น JSON" ซ้ำสองที่)
const commands = getCommandsJSON();

// 2. สร้างตัวเชื่อมต่อ Discord API ด้วย token
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// 3. ส่งคำสั่งไปลงทะเบียนกับ Discord
(async () => {
  console.log(`กำลังลงทะเบียน slash command จำนวน ${commands.length} คำสั่ง...`);

  // ---- ขั้นตอนที่ 1: ลงทะเบียนแบบ Global ----
  // ใช้ได้ทุกเซิร์ฟที่บอทถูกเชิญเข้าไปอัตโนมัติ (ต่างจาก applicationGuildCommands
  // เดิมที่ใช้ได้แค่เซิร์ฟเดียวตาม GUILD_ID)
  // ⚠️ Global ใช้เวลา sync นานกว่า guild-specific (ปกติไม่กี่นาที บางทีอาจถึง
  // ~1 ชั่วโมง) ต่างจาก guild-specific ที่เห็นผลทันที
  //
  // แยก try/catch ของขั้นตอนนี้ออกจากขั้นตอนที่ 2 ให้ชัดเจน เพราะขั้นตอนนี้คือ
  // ตัวหลักที่ทำให้คำสั่งใช้งานได้จริงในทุกเซิร์ฟ ถ้าพังต้องรู้ทันทีและหยุดทำงานต่อ
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('✅ ลงทะเบียนคำสั่งแบบ Global สำเร็จ! (คำสั่งจะใช้งานได้ทุกเซิร์ฟ)');
  } catch (error) {
    console.error('❌ ลงทะเบียนคำสั่งแบบ Global ไม่สำเร็จ:');
    console.error(error);
    // ขั้นตอนนี้ล้มเหลว = คำสั่งยังไม่ถูกอัปเดตเลย ไม่มีประโยชน์จะไปทำขั้นตอนที่ 2 ต่อ
    return;
  }

  // ---- ขั้นตอนที่ 2 (ไม่บังคับ): ล้างคำสั่งแบบ guild-specific เดิมทิ้ง ----
  // กันไม่ให้เซิร์ฟทดสอบเดิม (ตาม GUILD_ID) เห็นคำสั่งซ้ำกัน 2 ชุด
  // (ชุด global ใหม่ + ชุด guild-specific เก่าที่ยังค้างอยู่)
  // ขั้นตอนนี้ "ไม่บังคับ" จริงๆ เพราะขั้นตอนที่ 1 (Global) ทำให้คำสั่งใช้งานได้แล้ว
  // ต่อให้ขั้นตอนนี้ error ก็ไม่ได้แปลว่าบอทใช้งานไม่ได้ — เลยแยก try/catch ออกมา
  // ไม่ให้ error ตรงนี้ไปทำให้ทั้งสคริปต์ดูเหมือน "ล้มเหลว"
  if (process.env.GUILD_ID) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: [] },
      );
      console.log('✅ ล้างคำสั่งแบบ guild-specific เดิมออกแล้ว (ป้องกันคำสั่งซ้ำ)');
    } catch (error) {
      if (error.code === 50001) {
        // 50001 = Missing Access ตรงนี้เกือบทุกครั้งแปลว่า Discord หาบอทไม่เจอใน
        // เซิร์ฟที่ GUILD_ID นี้ชี้ไปแล้ว เช่น
        //   1) บอทถูกเตะออกจากเซิร์ฟนั้นไปแล้ว หรือไม่เคยถูกเชิญเข้าไปเลย
        //   2) ค่า GUILD_ID ใน .env เป็นค่าเก่า/พิมพ์ผิด ไม่ตรงกับเซิร์ฟจริง
        console.warn(
          '⚠️ ข้ามขั้นตอนล้างคำสั่ง guild-specific: หาเซิร์ฟตาม GUILD_ID ไม่เจอ ' +
          '(บอทอาจไม่ได้อยู่ในเซิร์ฟนั้นแล้ว หรือ GUILD_ID ใน .env เป็นค่าเก่า) — ' +
          'ไม่กระทบอะไรนะครับ เพราะคำสั่งแบบ Global (ขั้นตอนที่ 1) ลงทะเบียนสำเร็จไปแล้ว ' +
          'ถ้าไม่ได้ใช้ guild-specific command แล้วก็ลบ GUILD_ID ออกจาก .env ได้เลยครับ',
        );
      } else {
        console.error('❌ ล้างคำสั่งแบบ guild-specific ไม่สำเร็จ (ไม่ใช่ 50001):');
        console.error(error);
      }
    }
  }

  console.log('เสร็จสิ้นขั้นตอนลงทะเบียนคำสั่งครับ 🎉');
})();