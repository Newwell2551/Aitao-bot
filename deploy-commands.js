const { REST, Routes } = require('discord.js');
require('dotenv').config();
const { loadCommandModules } = require('./utils/getCommandsJSON');

// 1. รวบรวมข้อมูลคำสั่งทั้งหมดจากโฟลเดอร์ commands แล้ว "แยกกอง" เป็น 2 กอง
// (ย้ายไปอยู่ใน utils/getCommandsJSON.js แล้ว — ไฟล์นี้เรียกใช้ loadCommandModules()
// ตัวเดียวกับที่ utils/syncDiscordBotList.js ใช้ เพื่อไม่ให้ต้องเขียนโค้ด
// "อ่านไฟล์ commands/ แล้วแปลงเป็น JSON" ซ้ำสองที่)
//
// 🔒 อัปเดตความปลอดภัยครั้งใหญ่: เดิมไฟล์นี้ลงทะเบียนคำสั่ง "ทุกคำสั่งรวมกัน" แบบ Global
// หมดเลย รวมถึง /dev กับ /referral ที่เป็นคำสั่งลับเฉพาะเจ้าของบอทด้วย — ทำให้คำสั่งลับ
// พวกนี้ถูกลงทะเบียนในทุกเซิร์ฟเวอร์ที่บอทอยู่ (แค่ "ซ่อนไม่ให้เห็น" ด้วย
// setDefaultMemberPermissions(0) เท่านั้น ซึ่ง Discord จะยังโชว์ให้แอดมินของเซิร์ฟนั้นๆ
// เห็นอยู่ดี) ตอนนี้แยกออกเป็น:
//   - publicCommands → คำสั่งทั่วไปที่ทุกคนควรใช้ได้ → ลงทะเบียนแบบ Global (ทุกเซิร์ฟ)
//   - ownerCommands  → คำสั่งที่ตั้ง `ownerOnly: true` ไว้ (/dev, /referral) →
//     ลงทะเบียนแบบ guild-specific เฉพาะเซิร์ฟควบคุมของเราเอง (ตาม GUILD_ID ใน .env)
//     เท่านั้น — แปลว่าคำสั่งพวกนี้ "ไม่มีอยู่จริง" เลยในเซิร์ฟเวอร์อื่นๆ ทั้งหมด ไม่ใช่แค่
//     ซ่อนไม่ให้เห็นเฉยๆ แบบเดิม เป็นการป้องกันที่แน่นหนากว่าเดิมมาก
const allModules = loadCommandModules();
const publicCommands = allModules.filter(({ command }) => !command.ownerOnly).map(({ command }) => command.data.toJSON());
const ownerCommands = allModules.filter(({ command }) => command.ownerOnly).map(({ command }) => command.data.toJSON());

// 2. สร้างตัวเชื่อมต่อ Discord API ด้วย token
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// 3. ส่งคำสั่งไปลงทะเบียนกับ Discord
(async () => {
  console.log(
    `กำลังลงทะเบียนคำสั่งทั่วไป ${publicCommands.length} คำสั่ง + คำสั่งลับเจ้าของบอท ${ownerCommands.length} คำสั่ง...`
  );

  // ---- ขั้นตอนที่ 1: ลงทะเบียนคำสั่งทั่วไปแบบ Global ----
  // ใช้ได้ทุกเซิร์ฟที่บอทถูกเชิญเข้าไปอัตโนมัติ
  // ⚠️ Global ใช้เวลา sync นานกว่า guild-specific (ปกติไม่กี่นาที บางทีอาจถึง
  // ~1 ชั่วโมง) ต่างจาก guild-specific ที่เห็นผลทันที
  //
  // แยก try/catch ของขั้นตอนนี้ออกจากขั้นตอนที่ 2 ให้ชัดเจน เพราะขั้นตอนนี้คือ
  // ตัวหลักที่ทำให้คำสั่งทั่วไปใช้งานได้จริงในทุกเซิร์ฟ ถ้าพังต้องรู้ทันทีและหยุดทำงานต่อ
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: publicCommands },
    );
    console.log(`✅ ลงทะเบียนคำสั่งทั่วไปแบบ Global สำเร็จ! (${publicCommands.length} คำสั่ง ใช้งานได้ทุกเซิร์ฟ)`);
  } catch (error) {
    console.error('❌ ลงทะเบียนคำสั่งทั่วไปแบบ Global ไม่สำเร็จ:');
    console.error(error);
    // ขั้นตอนนี้ล้มเหลว = คำสั่งทั่วไปยังไม่ถูกอัปเดตเลย ไม่มีประโยชน์จะไปทำขั้นตอนที่ 2 ต่อ
    return;
  }

  // ---- ขั้นตอนที่ 2: ลงทะเบียนคำสั่งลับเจ้าของบอทแบบ guild-specific เท่านั้น ----
  // ⚠️ ขั้นตอนนี้ "บังคับ" ต้องมี GUILD_ID ใน .env ชี้ไปที่เซิร์ฟเวอร์ที่น้องหนาวควบคุมเอง
  // อยู่ตลอด (เช่น เซิร์ฟส่วนตัว/เซิร์ฟ dev ของตัวเอง) ถ้า GUILD_ID ไม่ถูกต้องหรือบอทไม่ได้
  // อยู่ในเซิร์ฟนั้นแล้ว → /dev กับ /referral จะกดใช้ไม่ได้เลยจากทุกที่จนกว่าจะแก้ค่านี้
  // แล้วรัน deploy-commands.js ใหม่อีกรอบ — เพราะงั้นก่อนรันสคริปต์นี้ ต้องเช็คให้แน่ใจ
  // ก่อนเสมอว่า GUILD_ID ใน .env ยังตรงกับเซิร์ฟที่เข้าถึงได้จริงอยู่
  if (!process.env.GUILD_ID) {
    console.error(
      '❌ ไม่พบ GUILD_ID ใน .env — ข้ามการลงทะเบียนคำสั่งลับเจ้าของบอท (/dev, /referral) ' +
      'ไปเลย เพราะไม่รู้ว่าจะลงทะเบียนที่เซิร์ฟไหน ต้องใส่ GUILD_ID เป็น ID ของเซิร์ฟที่ ' +
      'ควบคุมเองก่อน แล้วรันคำสั่งนี้ใหม่อีกรอบครับ'
    );
    console.log('เสร็จสิ้นขั้นตอนลงทะเบียนคำสั่งครับ (บางส่วน) 🎉');
    return;
  }

  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: ownerCommands },
    );
    console.log(
      `✅ ลงทะเบียนคำสั่งลับเจ้าของบอทแบบ guild-specific สำเร็จ! ` +
      `(${ownerCommands.length} คำสั่ง: ${ownerCommands.map((c) => `/${c.name}`).join(', ')} — ` +
      `ใช้ได้แค่ในเซิร์ฟตาม GUILD_ID เท่านั้น ไม่มีอยู่จริงในเซิร์ฟอื่นเลย)`
    );
  } catch (error) {
    if (error.code === 50001) {
      // 50001 = Missing Access ตรงนี้เกือบทุกครั้งแปลว่า Discord หาบอทไม่เจอใน
      // เซิร์ฟที่ GUILD_ID นี้ชี้ไปแล้ว เช่น
      //   1) บอทถูกเตะออกจากเซิร์ฟนั้นไปแล้ว หรือไม่เคยถูกเชิญเข้าไปเลย
      //   2) ค่า GUILD_ID ใน .env เป็นค่าเก่า/พิมพ์ผิด ไม่ตรงกับเซิร์ฟจริง
      console.error(
        '❌ ลงทะเบียนคำสั่งลับเจ้าของบอทไม่สำเร็จ: หาเซิร์ฟตาม GUILD_ID ไม่เจอ ' +
        '(บอทอาจไม่ได้อยู่ในเซิร์ฟนั้นแล้ว หรือ GUILD_ID ใน .env เป็นค่าเก่า) — ' +
        '⚠️ สำคัญมาก: /dev กับ /referral จะใช้ไม่ได้เลยจนกว่าจะแก้ GUILD_ID ให้ถูกต้อง ' +
        'แล้วรันคำสั่งนี้ใหม่ครับ'
      );
    } else {
      console.error('❌ ลงทะเบียนคำสั่งลับเจ้าของบอทไม่สำเร็จ (ไม่ใช่ 50001):');
      console.error(error);
    }
    return;
  }

  console.log('เสร็จสิ้นขั้นตอนลงทะเบียนคำสั่งครับ 🎉');
})();
