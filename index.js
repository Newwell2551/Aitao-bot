const { Client, GatewayIntentBits, Collection, Partials, MessageFlags, Events } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { isRoleButton, handleRoleButton } = require('./utils/handleRoleButton');
const { initImageWorkerPool }            = require('./utils/imageWorkerPool');
const { sendGuildJoinGreeting }          = require('./utils/guildJoinGreeting');
const { syncDiscordBotListCommands }     = require('./utils/syncDiscordBotList');
const { createWebhookServer }            = require('./server');

// 1. สร้างบอท พร้อมระบุ "intents" และ "partials" ที่ต้องการ
//
// Intents = สิทธิ์ที่บอทขอรับข้อมูลจาก Discord (ถ้าไม่ขอ = ไม่ได้รับ event นั้นเลย)
//   • Guilds             — ข้อมูลเซิร์ฟเวอร์ ช่อง สิทธิ์ (จำเป็นสำหรับทุกบอท)
//   • GuildMessages      — ข้อมูล message ในช่อง (ใช้ตอน fetch message ที่ถูก react)
//   • GuildMessageReactions — event react / unreact บน message ในเซิร์ฟเวอร์
//
// Partials = บอก discord.js ว่าให้รับ event แม้ข้อมูลมาไม่ครบ (partial object)
//   Discord ส่ง reaction event มาแบบ "partial" เสมอถ้า message นั้นไม่อยู่ใน cache
//   (เช่น message ที่โพสต์ก่อนบอท restart หรือก่อนบอท online) โดย:
//   • Partials.Message  — รับ partial message object ได้ (แล้วค่อย fetch เต็มๆ ทีหลัง)
//   • Partials.Reaction — รับ partial reaction object ได้
//   • Partials.Channel  — จำเป็นสำหรับ DM channel (ถ้าไม่ใส่ DM reaction จะถูกข้ามทันที)
//
//   ถ้าไม่ใส่ Partials เลย → Discord.js จะ drop event ทิ้งโดยไม่แจ้ง บอทจะไม่ทำงาน
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers, // ← ต้องเปิดใน Discord Developer Portal ด้วย (Server Members Intent)
  ],
  partials: [
    Partials.Message,
    Partials.Reaction,
    Partials.Channel,
  ],
});

// 1b. Global error handler — กัน error ที่หลุดไม่มีใครจับทำให้บอททั้งตัวล่ม
//
// ❗ ทำไมต้องมี: try/catch ที่ใส่ไว้ทุก handler ข้างล่าง (interactionCreate,
// messageReactionAdd ฯลฯ) ดักได้แค่ error ที่เกิด "ระหว่างทำงาน" ของ handler นั้นๆ
// แต่ยังมี error อีกสองแบบที่หลุดรอดจาก try/catch พวกนั้นไปได้เสมอ:
//
//   • unhandledRejection — Promise ที่ reject แล้วไม่มีใคร .catch() ไว้เลย
//     (เช่น โค้ดใน dependency บางตัวลืมใส่ catch, หรือ async function ที่เรียก
//     แบบไม่ await และไม่ได้ห่อ try/catch) ถ้าไม่ดักตรงนี้ Node.js เวอร์ชันใหม่ๆ
//     จะ "crash ทั้ง process ทันที" ตามค่า default — บอทและ webhook server ที่รับ
//     เงินจาก Stripe (ซึ่งรันอยู่ใน process เดียวกัน) จะล่มไปพร้อมกันหมด
//   • client.on('error') — error ระดับ connection ของ discord.js เอง เช่น
//     WebSocket หลุดกะทันหัน ปัญหาการเชื่อมต่อกับ Discord gateway ที่ไม่ใช่ error
//     จาก handler ไหนของเราเลย ถ้าไม่ดักไว้ อาจทำให้ client หลุดเงียบๆ โดยไม่มี log
//
// ทั้งสองจุดนี้แค่ console.error() เก็บ log ไว้ดู ไม่ throw ซ้ำ ไม่ restart อะไร —
// เป้าหมายคือ "อย่าให้ error เดี่ยวๆ ที่ไม่คาดคิด ทำบอททั้งตัวตายไปด้วย" เฉยๆ
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
client.on('error', (error) => {
  console.error('[client error]', error);
});

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

  // 4b. ส่งรายการ slash command ปัจจุบันไปอัปเดตที่ discordbotlist.com อัตโนมัติ
  // ทุกครั้งที่บอทเริ่มทำงาน (ไม่ต้องมานั่งรันเองทีละรอบ) — logic ทั้งหมด (รวม try/catch
  // กันพัง) อยู่ใน utils/syncDiscordBotList.js แล้ว ที่นี่มีหน้าที่แค่ "เรียกใช้" เฉยๆ
  //
  // ❗ จงใจ "ไม่ใส่ await" ตรงนี้ — เพราะไม่อยากให้ event 'ready' (ซึ่ง callback ตัวนี้
  // ไม่ได้ประกาศเป็น async function ด้วย) ต้องรอผลลัพธ์จากการยิง HTTP ไปหา
  // discordbotlist.com ก่อนจะทำงานส่วนอื่นต่อ ปล่อยให้มันรันคู่ขนานไปเบื้องหลังได้เลย
  // (ฟังก์ชันข้างในดัก error ไว้หมดแล้ว รับประกันว่าไม่มีทาง throw หลุดออกมา)
  syncDiscordBotListCommands();
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
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'เกิดข้อผิดพลาดในการรันคำสั่งนี้', flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  // --- กรณีที่ 2: กดปุ่ม ---
  if (interaction.isButton()) {
    // rsbtn: = ปุ่มยศจาก /role-setup type=button (มี setupName ฝังใน customId)
    // ต้องเช็คก่อน rolebtn: เพราะต้องการ limit logic และโหลด setup config
    // rsbtn:{setupName}:{roleId} ← customId รูปแบบใหม่ที่รู้จัก setup ชื่ออะไร
    if (interaction.customId.startsWith('rsbtn:')) {
      const roleSetupCommand = client.commands.get('role-setup');
      try {
        await roleSetupCommand.handleRoleButtonClick(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนจัดการยศ', flags: MessageFlags.Ephemeral });
        }
      }
      return;
    }

    // rolebtn: = ปุ่มยศบนข้อความที่โพสต์แล้ว (ไม่เกี่ยวกับ builder draft เลย)
    // ต้องเช็คอันนี้ก่อน builder_ เพราะมี logic แยกต่างหากทั้งหมด
    if (isRoleButton(interaction.customId)) {
      try {
        await handleRoleButton(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนจัดการยศ', flags: MessageFlags.Ephemeral });
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
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนกดปุ่มนี้', flags: MessageFlags.Ephemeral });
        }
      }
    }

    // rs_ = ปุ่มใน /role-setup (editor panel)
    if (interaction.customId.startsWith('rs_')) {
      const roleSetupCommand = client.commands.get('role-setup');
      try {
        await roleSetupCommand.handleButton(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนกดปุ่มนี้', flags: MessageFlags.Ephemeral });
        }
      }
    }

    // ws_ = ปุ่มใน /welcome-setup (ephemeral panel + submenus)
    if (interaction.customId.startsWith('ws_')) {
      const wsCommand = client.commands.get('welcome-setup');
      try {
        await wsCommand.handleButton(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนกดปุ่มนี้', flags: MessageFlags.Ephemeral });
        }
      }
    }

    // wgs_ = ปุ่มใน /goodbye-setup (ephemeral panel + submenus) — mirror ws_ ข้างบน
    if (interaction.customId.startsWith('wgs_')) {
      const wgsCommand = client.commands.get('goodbye-setup');
      try {
        await wgsCommand.handleButton(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนกดปุ่มนี้', flags: MessageFlags.Ephemeral });
        }
      }
    }

    // premium_ = ปุ่มใน /premium (premium_subscribe, premium_manage)
    // handleButton ของ premium.js เรียก deferReply() เองข้างในแล้ว เพราะงั้นถ้า error
    // เกิดขึ้นหลัง defer ต้องเช็ค interaction.deferred ก่อน reply ซ้ำ (เหมือนจุดอื่นๆ)
    if (interaction.customId.startsWith('premium_')) {
      const premiumCommand = client.commands.get('premium');
      try {
        await premiumCommand.handleButton(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนกดปุ่มนี้', flags: MessageFlags.Ephemeral });
        } else if (interaction.deferred && !interaction.replied) {
          // กรณีนี้ defer ไปแล้วแต่ยังไม่ได้ editReply (เช่น Stripe API error) —
          // ต้อง editReply แทน reply ซ้ำ ไม่งั้น Discord จะโยน error ทับซ้อน
          await interaction.editReply({ content: '❌ เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะครับ' });
        }
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
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนบันทึกข้อมูล', flags: MessageFlags.Ephemeral });
        }
      }
    }
    // rs_modal_ = modals ของ /role-setup editor
    if (interaction.customId.startsWith('rs_modal_')) {
      const roleSetupCommand = client.commands.get('role-setup');
      try {
        await roleSetupCommand.handleModalSubmit(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนบันทึกข้อมูล', flags: MessageFlags.Ephemeral });
        }
      }
    }

    // ws_modal_ = modals ของ /welcome-setup (ความทึบ, ข้อความ)
    if (interaction.customId.startsWith('ws_modal_')) {
      const wsCommand = client.commands.get('welcome-setup');
      try {
        await wsCommand.handleModalSubmit(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนบันทึกข้อมูล', flags: MessageFlags.Ephemeral });
        }
      }
    }

    // wgs_modal_ = modals ของ /goodbye-setup (ความทึบ, ข้อความ) — mirror ws_modal_ ข้างบน
    if (interaction.customId.startsWith('wgs_modal_')) {
      const wgsCommand = client.commands.get('goodbye-setup');
      try {
        await wgsCommand.handleModalSubmit(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนบันทึกข้อมูล', flags: MessageFlags.Ephemeral });
        }
      }
    }
    return;
  }

  // --- กรณีที่ 4: เลือกจาก select menu (เช่น select menu จัดการบล็อกของ /builder) ---
  if (interaction.isStringSelectMenu()) {
    // rolesetup: = dropdown ที่สมาชิกกดเลือกยศ (โพสต์ในช่องจริง จาก /role-setup post)
    if (interaction.customId.startsWith('rolesetup:')) {
      const roleSetupCommand = client.commands.get('role-setup');
      try {
        await roleSetupCommand.handleMemberSelect(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนจัดการยศ', flags: MessageFlags.Ephemeral });
        }
      }
      return;
    }
    // rs_ = select menu ใน /role-setup editor panel (สี, จัดการยศ, จัดการบล็อก)
    if (interaction.customId.startsWith('rs_')) {
      const roleSetupCommand = client.commands.get('role-setup');
      try {
        await roleSetupCommand.handleSelectMenu(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกเมนู', flags: MessageFlags.Ephemeral });
        }
      }
      return;
    }
    // ws_ = StringSelectMenu ใน /welcome-setup (text block list)
    // ❗ แยกจาก ws_channel_sel เพราะ ChannelSelectMenu เป็น interaction type ต่างกัน
    //    Discord ส่งมาตรง isStringSelectMenu() vs isChannelSelectMenu() เอง จึงไม่ชนกัน
    if (interaction.customId.startsWith('ws_')) {
      const wsCommand = client.commands.get('welcome-setup');
      try {
        await wsCommand.handleSelectMenu(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกเมนู', flags: MessageFlags.Ephemeral });
        }
      }
      return;
    }
    // wgs_ = StringSelectMenu ใน /goodbye-setup (text block list) — mirror ws_ ข้างบน
    if (interaction.customId.startsWith('wgs_')) {
      const wgsCommand = client.commands.get('goodbye-setup');
      try {
        await wgsCommand.handleSelectMenu(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกเมนู', flags: MessageFlags.Ephemeral });
        }
      }
      return;
    }
    if (interaction.customId.startsWith('builder_')) {
      const builderCommand = client.commands.get('builder');
      try {
        await builderCommand.handleSelectMenu(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกเมนู', flags: MessageFlags.Ephemeral });
        }
      }
    }
    return;
  }

  // --- กรณีที่ 5: เลือกช่องจาก channel select menu (สำหรับปุ่มลิงก์ช่องใน /builder) ---
  // ChannelSelectMenu เป็น interaction type แยกจาก StringSelectMenu ต้องเช็คต่างหาก
  if (interaction.isChannelSelectMenu()) {
    // ws_ = ChannelSelectMenu ใน /welcome-setup (เลือกช่อง welcome)
    if (interaction.customId.startsWith('ws_')) {
      const wsCommand = client.commands.get('welcome-setup');
      try {
        await wsCommand.handleChannelSelect(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกช่อง', flags: MessageFlags.Ephemeral });
        }
      }
      return;
    }

    // wgs_ = ChannelSelectMenu ใน /goodbye-setup (เลือกช่องอำลา) — mirror ws_ ข้างบน
    if (interaction.customId.startsWith('wgs_')) {
      const wgsCommand = client.commands.get('goodbye-setup');
      try {
        await wgsCommand.handleChannelSelect(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกช่อง', flags: MessageFlags.Ephemeral });
        }
      }
      return;
    }

    // rs_ = ChannelSelectMenu ใน /role-setup (เลือกช่องโพสต์หลังกด ✅ เสร็จแล้ว)
    if (interaction.customId.startsWith('rs_')) {
      const roleSetupCommand = client.commands.get('role-setup');
      try {
        await roleSetupCommand.handleChannelSelect(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกช่อง', flags: MessageFlags.Ephemeral });
        }
      }
      return;
    }
    if (interaction.customId.startsWith('builder_')) {
      const builderCommand = client.commands.get('builder');
      try {
        await builderCommand.handleSelectMenu(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกช่อง', flags: MessageFlags.Ephemeral });
        }
      }
    }
    return;
  }

  // --- กรณีที่ 6: RoleSelectMenu — admin เลือกยศในหน้า /role-setup edit (rs_add_role_sel) ---
  // ต้องแยกจาก isStringSelectMenu เพราะ Discord ส่งมาเป็น interaction type ต่างกัน
  if (interaction.isRoleSelectMenu()) {
    if (interaction.customId.startsWith('rs_')) {
      const roleSetupCommand = client.commands.get('role-setup');
      try {
        await roleSetupCommand.handleRoleMenuSelect(interaction);
      } catch (error) {
        console.error('[rs_ RoleSelectMenu error]', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'เกิดข้อผิดพลาดตอนเลือกยศ', flags: MessageFlags.Ephemeral });
        }
      }
    }
    return;
  }

  // --- กรณีที่ 7: autocomplete (ใช้โดย /builder, /role-setup) ---
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

// 7. เมื่อมีคนกด react emoji บน message ในเซิร์ฟเวอร์
//    ใช้สำหรับ /role-setup type=reaction — สมาชิก react = รับยศ
client.on('messageReactionAdd', async (reaction, user) => {
  // fetch partial ก่อนเสมอ — Discord ส่ง event มาแบบข้อมูลไม่ครบ (partial)
  // ต้อง fetch เพื่อให้ได้ข้อมูลจริงก่อนจะอ่าน reaction.emoji, reaction.message.id ฯลฯ
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (error) {
    // fetch fail = message ถูกลบไปแล้ว หรือบอทไม่มีสิทธิ์มองเห็น → ข้ามไปเฉยๆ
    console.error('[messageReactionAdd] fetch partial failed:', error);
    return;
  }

  // กรองบอทออก — บอทจะ react emoji เองตอนโพสต์ข้อความ (เพื่อเป็น "ปุ่ม" ให้คนกดตาม)
  // ถ้าไม่กรอง บอทจะ loop กับตัวเองได้
  if (user.bot) return;

  // ส่งต่อให้ role-setup handler จัดการ (ตรวจว่า message นี้เป็น role-setup reaction ไหม)
  const roleSetupCommand = client.commands.get('role-setup');
  if (!roleSetupCommand?.handleReactionAdd) return;
  try {
    await roleSetupCommand.handleReactionAdd(reaction, user);
  } catch (error) {
    console.error('[messageReactionAdd] handler error:', error);
  }
});

// 8. เมื่อมีคนเอา react ออก (click emoji ซ้ำเพื่อ unreact)
//    ใช้สำหรับ /role-setup type=reaction — สมาชิก unreact = ถอดยศออก
client.on('messageReactionRemove', async (reaction, user) => {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (error) {
    console.error('[messageReactionRemove] fetch partial failed:', error);
    return;
  }

  if (user.bot) return;

  const roleSetupCommand = client.commands.get('role-setup');
  if (!roleSetupCommand?.handleReactionRemove) return;
  try {
    await roleSetupCommand.handleReactionRemove(reaction, user);
  } catch (error) {
    console.error('[messageReactionRemove] handler error:', error);
  }
});

// 9. เมื่อมีสมาชิกใหม่เข้าเซิร์ฟเวอร์ → ส่งรูปต้อนรับ
// ❗ ต้องเปิด "Server Members Intent" ใน Discord Developer Portal ด้วย
client.on('guildMemberAdd', async member => {
  const wsCommand = client.commands.get('welcome-setup');
  if (!wsCommand?.handleMemberAdd) return;
  try {
    await wsCommand.handleMemberAdd(member);
  } catch (error) {
    console.error('[guildMemberAdd] welcome error:', error);
  }
});

// 9b. เมื่อมีสมาชิกออกจากเซิร์ฟเวอร์ (leave/kick/ban) → ส่งรูปอำลา
// ❗ ไม่ต้องเพิ่ม intent ใหม่ — GatewayIntentBits.GuildMembers ที่มีอยู่แล้ว
// ครอบคลุมทั้ง guildMemberAdd และ guildMemberRemove ในตัว
client.on('guildMemberRemove', async member => {
  const gsCommand = client.commands.get('goodbye-setup');
  if (!gsCommand?.handleMemberRemove) return;
  try {
    await gsCommand.handleMemberRemove(member);
  } catch (error) {
    console.error('[guildMemberRemove] goodbye error:', error);
  }
});

// 9c. เมื่อบอทถูกแอดมินเชิญเข้าเซิร์ฟเวอร์ใหม่ (guildCreate) → ส่ง embed แนะนำตัวอัตโนมัติ
// ❗ ใช้ Events.GuildCreate (enum ของ discord.js) แทนการพิมพ์ string 'guildCreate' เอง
// กันเผื่อพิมพ์ผิด — ทั้งสองแบบทำงานเหมือนกันทุกประการ แค่ enum ปลอดภัยกว่า
// logic การหาช่อง/สร้าง embed ทั้งหมดอยู่ใน utils/guildJoinGreeting.js แล้ว
// (แยกออกมาเป็นไฟล์ต่างหาก เพราะ index.js นี้มีหน้าที่แค่ "ผูก event เข้ากับ handler"
// ไม่ควรมี logic ยาวๆ ปนอยู่ตรงนี้)
//
// ⚠️ ไม่ต้องมี try/catch ห่อตรงนี้ เพราะ sendGuildJoinGreeting() ดัก error ไว้ข้างในหมดแล้ว
// (ดูคอมเมนต์ในไฟล์นั้น) รับประกันว่าไม่มีทาง throw หลุดออกมาทำให้บอทพัง
client.on(Events.GuildCreate, async (guild) => {
  await sendGuildJoinGreeting(guild);
});

// 10. เริ่ม Worker Thread pool สำหรับสร้าง animated GIF ต้อนรับ/อำลา
// ❗ ต้องเรียกครั้งเดียวตอนบอท start เท่านั้น (ไม่ใช่ทุกครั้งที่มีคนเข้า/ออกเซิร์ฟ)
// worker 2 ตัวจะถูกสร้างไว้ล่วงหน้า พร้อมรับงานทันทีที่ guildMemberAdd/guildMemberRemove เกิดขึ้น
// (ใช้ pool ร่วมกันทั้ง welcome และ goodbye — งานแค่คิวต่อกันถ้า worker ไม่ว่าง)
initImageWorkerPool();

// 11. เริ่มล็อกอินบอทด้วย token
client.login(process.env.DISCORD_TOKEN);

// 12. เริ่ม Express server รับ webhook จาก Stripe (คู่ขนานกับบอท ไม่เกี่ยวกับ client.login เลย
// เพราะงั้นเรียกตรงนี้ได้ทันที ไม่ต้องรอบอทออนไลน์ก่อน — server พร้อมรับ webhook ได้เลย
// แม้บอทจะยังล็อกอินไม่เสร็จก็ตาม เพราะ handleStripeEvent ไม่ได้ใช้ client ในตอนนี้)
//
// ⚠️ ทำไมต้องเช็ค process.env.PORT ก่อน process.env.WEBHOOK_PORT:
// พอ deploy ขึ้น Railway จริง Railway จะ "กำหนดพอร์ตให้เองอัตโนมัติ" ผ่านตัวแปรชื่อ PORT
// เสมอ (เราเลือกเองไม่ได้) ถ้าเรายังเขียนโค้ดอ่านแต่ WEBHOOK_PORT เพียวๆ เหมือนเดิม
// server จะไปเปิดฟังที่พอร์ตที่ Railway ไม่ได้ต่อ traffic เข้ามาให้ → Stripe ยิง webhook
// มาไม่ถึงบอทเราเลย (เงียบๆ ไม่มี error ให้เห็นด้วย เพราะ server รันได้ปกติทุกอย่าง
// แค่ "ฟังผิดพอร์ต") ลำดับการเช็คคือ:
//   1) process.env.PORT        — ค่าที่ Railway (หรือ hosting อื่นๆ ที่เป็นมาตรฐานเดียวกัน) ตั้งให้อัตโนมัติ
//   2) process.env.WEBHOOK_PORT — เผื่อรันบนเครื่องตัวเอง (local) แบบเดิมที่เคยตั้งไว้ใน .env
//   3) 3000                     — ค่า fallback สุดท้าย เผื่อไม่มีตัวแปรไหนตั้งไว้เลย
const port = process.env.PORT || process.env.WEBHOOK_PORT || 3000;
createWebhookServer(client).listen(port, () => {
  console.log(`[webhook] server พร้อมรับ webhook ที่ port ${port}`);
});