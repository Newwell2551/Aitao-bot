const { REST, Routes } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// 1. รวบรวมข้อมูลคำสั่งทั้งหมดจากโฟลเดอร์ commands
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON()); // แปลงเป็น JSON ตามรูปแบบที่ Discord API ต้องการ
}

// 2. สร้างตัวเชื่อมต่อ Discord API ด้วย token
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// 3. ส่งคำสั่งไปลงทะเบียนกับ Discord
(async () => {
  try {
    console.log(`กำลังลงทะเบียน slash command จำนวน ${commands.length} คำสั่ง...`);

    // ลงทะเบียนแบบ Global — ใช้ได้ทุกเซิร์ฟที่บอทถูกเชิญเข้าไปอัตโนมัติ
    // (ต่างจาก applicationGuildCommands เดิมที่ใช้ได้แค่เซิร์ฟเดียวตาม GUILD_ID)
    // ⚠️ Global ใช้เวลา sync นานกว่า guild-specific (ปกติไม่กี่นาที
    // บางทีอาจถึง ~1 ชั่วโมง) ต่างจาก guild-specific ที่เห็นผลทันที
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    // ล้างคำสั่งแบบ guild-specific เดิมที่เคยลงทะเบียนไว้ใน GUILD_ID ทิ้ง
    // กันไม่ให้เซิร์ฟทดสอบเดิมเห็นคำสั่งซ้ำกัน 2 ชุด (ชุด global ใหม่ + ชุด
    // guild-specific เก่าที่ยังค้างอยู่) — เช็ค GUILD_ID ก่อนกันเผื่อไม่ได้ตั้งไว้ใน .env
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: [] },
      );
      console.log('ล้างคำสั่งแบบ guild-specific เดิมออกแล้ว (ป้องกันคำสั่งซ้ำ)');
    }

    console.log('ลงทะเบียนคำสั่งสำเร็จ!');
  } catch (error) {
    console.error(error);
  }
})();