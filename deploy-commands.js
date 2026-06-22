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

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log('ลงทะเบียนคำสั่งสำเร็จ!');
  } catch (error) {
    console.error(error);
  }
})();