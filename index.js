const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { isRoleButton, handleRoleButton } = require('./utils/handleRoleButton');

// 1. สร้างบอท พร้อมระบุ "intents" คือสิทธิ์ที่บอทขอรับข้อมูลจาก Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 2. สร้างที่เก็บคำสั่งทั้งหมดของบอท (เหมือน Map)
client.commands = new Collection();

// 3. โหลดทุกไฟล์คำสั่งจากโฟลเดอร์ commands มาเก็บไว้
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// 4. เมื่อบอทล็อกอินสำเร็จและพร้อมใช้งาน
client.once('ready', () => {
  console.log(`บอทออนไลน์แล้ว! ล็อกอินในชื่อ ${client.user.tag}`);
});

// 5. เมื่อมีคนใช้ slash command / กดปุ่ม / submit modal
client.on('interactionCreate', async interaction => {
  // --- กรณีที่ 1: slash command (เหมือนเดิม) ---
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return; // ถ้าหาคำสั่งไม่เจอ ให้ข้าม

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'เกิดข้อผิดพลาดในการรันคำสั่งนี้', ephemeral: true });
    }
    return;
  }

  // --- กรณีที่ 2: กดปุ่ม ---
  if (interaction.isButton()) {
    // rolebtn: = ปุ่มยศบนข้อความที่โพสต์แล้ว (ไม่เกี่ยวกับ builder draft เลย)
    // ต้องเช็คอันนี้ก่อน builder_ เพราะมี logic แยกต่างหากทั้งหมด
    if (isRoleButton(interaction.customId)) {
      try {
        await handleRoleButton(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนจัดการยศ', ephemeral: true });
        }
      }
      return;
    }

    // builder_ = ปุ่มใน /builder (ephemeral panel ของ builder)
    if (interaction.customId.startsWith('builder_')) {
      const builderCommand = client.commands.get('builder');
      try {
        await builderCommand.handleButton(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนกดปุ่มนี้', ephemeral: true });
      }
    }
    return;
  }

  // --- กรณีที่ 3: submit modal (เช่น modal เพิ่มข้อความของ /builder) ---
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('builder_modal_')) {
      const builderCommand = client.commands.get('builder');
      try {
        await builderCommand.handleModalSubmit(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนบันทึกข้อมูล', ephemeral: true });
      }
    }
    return;
  }

  // --- กรณีที่ 4: เลือกจาก select menu (เช่น select menu จัดการบล็อกของ /builder) ---
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('builder_')) {
      const builderCommand = client.commands.get('builder');
      try {
        await builderCommand.handleSelectMenu(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกเมนู', ephemeral: true });
      }
    }
    return;
  }

  // --- กรณีที่ 5: เลือกช่องจาก channel select menu (สำหรับปุ่มลิงก์ช่องใน /builder) ---
  // ChannelSelectMenu เป็น interaction type แยกจาก StringSelectMenu ต้องเช็คต่างหาก
  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId.startsWith('builder_')) {
      const builderCommand = client.commands.get('builder');
      try {
        await builderCommand.handleSelectMenu(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกช่อง', ephemeral: true });
      }
    }
    return;
  }

  // --- กรณีที่ 6: autocomplete (ใช้โดย /builder open และ /builder delete) ---
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return; // คำสั่งนี้ไม่รองรับ autocomplete
    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error('[autocomplete error]', error);
    }
    return;
  }
});

// 6. เริ่มล็อกอินบอทด้วย token
client.login(process.env.DISCORD_TOKEN);