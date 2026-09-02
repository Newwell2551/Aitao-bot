// commands/help.js
// ─────────────────────────────────────────────────────────────────────────
// คำสั่ง /help — จุดประสงค์หลัก 2 อย่างพร้อมกัน:
//
//   1) เป็น "จุดเริ่มต้นที่ชัดเจน" ให้คนที่เพิ่งรู้จักบอท กด /help แล้วเจอทุกอย่างที่
//      ต้องรู้ในข้อความเดียว (top.gg เรียกสิ่งนี้ว่า "a clear and obvious point of
//      entry" — เป็นเงื่อนไขที่ต้องมีถึงจะผ่านการรีวิวขึ้น top.gg ได้)
//
//   2) 🌟 เป็น "โชว์เคส" ความสามารถของบอทไปในตัว — ข้อความทั้งหมดที่เห็นด้านล่างนี้
//      สร้างผ่าน utils/buildMessageFromSchema.js ตัวเดียวกับที่ /builder และ
//      /role-setup ใช้เป๊ะๆ ไม่ได้เขียน component ขึ้นมาใหม่แยกต่างหาก — พูดง่ายๆ
//      คือ /help ข้อความนี้คือ "ตัวอย่างจริงของสิ่งที่ /builder สร้างได้" ให้คนเห็น
//      block type หลากหลายแบบ (text / gallery / section+thumbnail / section+ปุ่มลิงก์ /
//      separator ทั้ง small และ large) ในข้อความเดียวยาวๆ ตามที่สั่งไว้เลยครับ
//
// ไม่ต้องมีการลงทะเบียนอะไรเพิ่มเติม — เหมือนไฟล์อื่นๆ ใน commands/ ทุกไฟล์ แค่มีไฟล์นี้
// อยู่ในโฟลเดอร์ commands/ ระบบจะโหลดอัตโนมัติทั้งตอน deploy-commands.js (ลงทะเบียนกับ
// Discord) และตอน index.js อ่านไฟล์คำสั่งเข้า client.commands (ดูรูปแบบเดียวกับ
// commands/ping.js)
// ─────────────────────────────────────────────────────────────────────────

const path = require('path');
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  PermissionsBitField,
  PermissionFlagsBits,
} = require('discord.js');

const { buildMessageFromSchema } = require('../utils/buildMessageFromSchema');

// ชื่อที่ใช้แนะนำตัวบอท — ใช้ตัวเดียวกับที่ utils/guildJoinGreeting.js ใช้ตอนทักทาย
// ตอนบอทเข้าเซิร์ฟใหม่ (BOT_DISPLAY_NAME = 'Cavin Milo' ในไฟล์นั้น) เพื่อให้ชื่อที่
// โชว์ตรงกันทุกจุด ไม่สับสน — ไม่ได้ import มาจากไฟล์นั้นตรงๆ เพราะไฟล์นั้น export
// แค่ sendGuildJoinGreeting() ฟังก์ชันเดียว ไม่ได้ export ค่าคงที่นี้ออกมาให้ใช้ร่วม
const BOT_DISPLAY_NAME = 'Cavin Milo';

// ── ไฟล์รูป banner — ใช้ไฟล์เดียวกับ utils/guildJoinGreeting.js เป๊ะๆ ────────────
// (assets/mascot-banner.png อยู่ระดับเดียวกับ index.js ที่ root โปรเจกต์ — จากไฟล์นี้
// ที่อยู่ใน commands/ ต้องถอยออกมา 1 ระดับเหมือนกันก่อนจะเจอโฟลเดอร์ assets/)
const BANNER_FILENAME = 'mascot-banner.png';
const BANNER_FILE_PATH = path.join(__dirname, '..', 'assets', BANNER_FILENAME);

/**
 * คำนวณ URL เชิญบอท (invite link) แบบสดๆ จาก CLIENT_ID + สิทธิ์ที่บอทต้องใช้จริง —
 * ไม่ hardcode เลขสิทธิ์ (permission integer) ไว้ตรงๆ เด็ดขาด เพราะเลขพวกนั้นอ่านไม่รู้
 * เรื่องและพิมพ์ผิดง่ายมาก (แค่เลขเดียวผิดก็ได้ลิงก์เชิญที่ขอสิทธิ์ผิดทันที) ใช้
 * PermissionsBitField ของ discord.js รวมสิทธิ์จากชื่อที่อ่านออกแทน แล้วให้ discord.js
 * คำนวณเลขให้เองแม่นยำ 100%
 *
 * รายการสิทธิ์ตรงนี้ต้อง "ตรงกับที่แนะนำน้องหนาวไปตอนคุยเรื่องลิงก์เชิญ" เป๊ะๆ:
 * View Channels, Send Messages, Embed Links, Attach Files, Read Message History,
 * Add Reactions, Manage Roles, Manage Channels, Use External Emojis — ไม่มี
 * Administrator ปนมาเด็ดขาด
 * @returns {string|null} URL เชิญบอท หรือ null ถ้าไม่มี CLIENT_ID ใน environment
 */
function buildInviteUrl() {
  const clientId = process.env.CLIENT_ID;
  if (!clientId) return null; // ยังไม่ได้ตั้งค่า CLIENT_ID ไว้ — ข้ามปุ่มเชิญไปเงียบๆ ดีกว่าลิงก์พัง

  const invitePermissions = new PermissionsBitField([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.UseExternalEmojis,
  ]);

  // .bitfield คือค่า BigInt รวมของสิทธิ์ทั้งหมดข้างบน — .toString() แปลงเป็น string
  // ตัวเลขฐาน 10 แบบที่ Discord ต้องการใส่ใน query param "permissions" ของ URL เชิญ
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${invitePermissions.bitfield.toString()}&scope=bot%20applications.commands`;
}

/**
 * สร้าง schema (object ธรรมดา) ป้อนเข้า buildMessageFromSchema() — รูปแบบเดียวกับ
 * schema ที่ /builder หรือ /role-setup สร้างขึ้นจากการกดปุ่มในแผงควบคุมทุกประการ
 * เพียงแต่ตรงนี้ "hardcode" ไว้ล่วงหน้าแทนที่จะให้ผู้ใช้กดสร้างเอง (คอนเซปต์เดียวกับ
 * commands/testlayout.js ที่มีอยู่แล้วในโปรเจกต์ ซึ่งใช้ทดสอบ block ทุกแบบ — ไฟล์นี้
 * เอาไอเดียเดียวกันมาทำเป็นของจริงที่ผู้ใช้เห็นได้)
 *
 * ลำดับ block ที่ใช้ (ครบเกือบทุก type ที่ buildMessageFromSchema รองรับ ยกเว้น
 * section_role_button กับ section_channel_button ที่ต้องมี roleId/channelId จริงของ
 * แต่ละเซิร์ฟ ไม่เหมาะเอามาโชว์แบบทั่วไป):
 *   text → separator(large) → gallery(1 รูปใหญ่) → separator(small) → text →
 *   section+thumbnail → separator(large) → text(โชว์ markdown หลายแบบ) →
 *   separator(small) → section+thumbnail → separator(large) → text(รายการคำสั่ง) →
 *   separator(large) → section_button(ปุ่มเชิญบอท) → [section_button ปุ่มซัพพอร์ต/GitHub
 *   ถ้ามีตั้งค่าไว้] → separator(small) → text(footer)
 *
 * @param {import('discord.js').Guild|null} guild - เซิร์ฟที่รันคำสั่ง (เก็บพารามิเตอร์นี้
 *   ไว้เผื่ออนาคตอยากเอาข้อมูลเซิร์ฟมาใช้เพิ่ม — ตอนนี้ยังไม่ได้ใช้ในตัว schema แล้ว
 *   หลังจากตัดรูปไอคอนเซิร์ฟออกจาก gallery)
 * @param {import('discord.js').ClientUser} clientUser - บอทเอง (ใช้ดึง avatar มาโชว์)
 * @returns {object} schema พร้อมส่งเข้า buildMessageFromSchema()
 */
function buildHelpSchema(guild, clientUser) {
  const botAvatarUrl = clientUser.displayAvatarURL({ size: 256, extension: 'png' });

  const blocks = [
    // ── 0: เกริ่นนำ — บอกตรงๆ เลยว่าข้อความนี้คือตัวอย่างของ /builder ──────────
    {
      type: 'text',
      content:
        `# 📖 ${BOT_DISPLAY_NAME} — Help & Showcase\n\n` +
        'Everything below — the images, the text blocks, the buttons — is rendered ' +
        'live using the exact same layout engine that powers `/builder` and ' +
        '`/role-setup`. This message *is* a live demo of what you can build ' +
        'yourself. Scroll through, then try `/builder` to make your own!',
    },

    { type: 'separator', spacing: 'large' },

    // ── 1: gallery — รูปเดียวรูปใหญ่เต็มความกว้าง (banner หลักของบอท) ─────────
    // เดิมเคยใส่ 2 รูป (banner + ไอคอนเซิร์ฟ) เพื่อโชว์ว่า gallery ใส่ได้หลายรูป แต่
    // พอมี 2 รูป Discord จะหั่นพื้นที่แบ่งครึ่งให้แต่ละรูป ทำให้รูป banner เล็กลงครึ่งนึง
    // ไม่สวย — ตามที่น้องหนาวขอ เปลี่ยนมาใส่รูปเดียวแทน จะได้เห็นแบนเนอร์เต็มๆ ไปเลย
    // (ยังใช้ attachment:// อ้างอิงไฟล์ banner ที่แนบไปกับข้อความจริงเหมือนเดิม — ดู
    // execute() ด้านล่าง ต้องมี files: [bannerAttachment] คู่กันเสมอ ไม่งั้นรูปจะแตก)
    {
      type: 'gallery',
      items: [
        { url: `attachment://${BANNER_FILENAME}`, description: `${BOT_DISPLAY_NAME} mascot banner` },
      ],
    },

    { type: 'separator', spacing: 'small' },

    // ── 2: What I Do ──────────────────────────────────────────────────────
    {
      type: 'text',
      content:
        '## 🎨 What I Do\n\n' +
        `I'm a decoration & customization bot — I help you make your Discord ` +
        'server look polished and welcoming. Custom welcome/goodbye cards, ' +
        'self-assign role menus, and rich message layouts, all built with the ' +
        'same tools you see demoed on this page.',
    },

    // ── 3: section + thumbnail — โชว์ block "section" (ข้อความคู่รูปเล็กด้านขวา) ─
    {
      type: 'section',
      text:
        '**👋 Welcome & Goodbye Cards**\n' +
        'Auto-generated image cards greet new members and say goodbye when they leave — ' +
        'fully customizable background, text, and avatar layout via `/welcome-setup` and `/goodbye-setup`.',
      thumbnail: botAvatarUrl,
    },

    { type: 'separator', spacing: 'large' },

    // ── 4: text ยาว โชว์ markdown หลายแบบในบล็อกเดียว (bold/italic/strike/list/code) ─
    {
      type: 'text',
      content:
        '## ✨ Markdown, Fully Supported\n\n' +
        'Every text block supports real markdown: **bold**, *italic*, ~~strikethrough~~, ' +
        'and `inline code`. You can also build lists like this:\n' +
        '- Self-assign roles via dropdown menu, buttons, or emoji reactions\n' +
        '- Multi-image galleries with captions\n' +
        '- Sections that pair text with a thumbnail or a link button\n' +
        '- Divider lines, in two spacing sizes (see them above and below this block)',
    },

    { type: 'separator', spacing: 'small' },

    // ── 5: section + thumbnail อีกอัน — โชว์ role-setup ──────────────────────
    {
      type: 'section',
      text:
        '**🎭 Self-Assign Roles**\n' +
        '`/role-setup` builds dropdown menus, button rows, or emoji-reaction posts ' +
        'that let members grant themselves roles — no admin work needed after setup.',
      thumbnail: botAvatarUrl,
    },

    { type: 'separator', spacing: 'large' },

    // ── 6: รายการคำสั่งทั้งหมด — จุดที่ top.gg ต้องการเห็น (จุดเข้าใช้งานที่ชัดเจน) ──
    // ⚠️ ชื่อ/คำอธิบายตรงนี้ต้อง "ตรงกับที่ deploy จริง" เป๊ะๆ เหมือนที่ guildJoinGreeting.js
    // เตือนไว้ — ถ้าเพิ่ม/ลบ/เปลี่ยนชื่อคำสั่งไหนในอนาคต ต้องกลับมาแก้ list นี้ด้วยนะครับ
    {
      type: 'text',
      content:
        '## ⚡ All Commands\n\n' +
        [
          '`/help` — Show this page',
          '`/builder` — Build custom message layouts (the engine behind this page)',
          '`/role-setup` — Set up automatic role assignment (menu / button / reaction)',
          '`/welcome-setup` — Set up new member welcome cards',
          '`/goodbye-setup` — Set up member farewell cards',
          '`/upload-image` — Upload an image to get a permanent link for other commands',
          '`/language` — Set the bot\'s language for this server (admin only)',
          "`/premium` — Manage this server's premium subscription",
          '`/ping` — Check bot latency',
        ].join('\n'),
    },

    { type: 'separator', spacing: 'large' },

    // ── 7: section_button — ปุ่มลิงก์เชิญบอท (โชว์ block "section_button") ──────
    // ปุ่มลิงก์ (Link button) กดแล้วเปิด URL ตรงๆ ไม่ต้องมี interaction handler รอรับ
    // เลย ปลอดภัยเสมอ ต่อให้ไม่มี CLIENT_ID (ข้ามไปทั้ง block เลยถ้า inviteUrl เป็น null)
  ];

  const inviteUrl = buildInviteUrl();
  if (inviteUrl) {
    blocks.push({
      type: 'section_button',
      text:
        '**🚀 Want this on your server?**\n' +
        'Invite the bot with exactly the permissions it needs — nothing more.',
      buttonLabel: `Invite ${BOT_DISPLAY_NAME}`,
      buttonUrl: inviteUrl,
    });
  }

  // ── 8: (optional) ปุ่มเซิร์ฟซัพพอร์ต — โชว์เฉพาะถ้าตั้งค่า SUPPORT_SERVER_URL ไว้ใน
  // environment variables แล้วเท่านั้น (ยังไม่มีตอนนี้ตามที่คุยกัน ต้องไปสร้างเซิร์ฟ
  // ซัพพอร์ตแยกก่อน แล้วเอา invite link แบบ "Never expire" มาใส่ใน Railway Variables)
  const supportServerUrl = process.env.SUPPORT_SERVER_URL;
  if (supportServerUrl) {
    blocks.push({
      type: 'section_button',
      text: '**💬 Need help or found a bug?**\nJoin the support server — we\'re happy to help.',
      buttonLabel: 'Support Server',
      buttonUrl: supportServerUrl,
    });
  }

  // ── 9: (optional) ปุ่ม GitHub — โชว์เฉพาะถ้าตั้งค่า GITHUB_URL ไว้เช่นกัน (เว้นไว้ให้
  // ตั้งเองผ่าน environment variable แทนที่จะ hardcode ลิงก์ repo ตรงๆ เพราะไม่รู้แน่ชัด
  // ว่า repo เป็น Public อยู่ไหม — ใส่ลิงก์ repo ที่เป็น Private ไปจะเป็นลิงก์เสียให้คนกด)
  const githubUrl = process.env.GITHUB_URL;
  if (githubUrl) {
    blocks.push({
      type: 'section_button',
      text: '**🐙 Curious how this works?**\nCheck out the source code on GitHub.',
      buttonLabel: 'View on GitHub',
      buttonUrl: githubUrl,
    });
  }

  blocks.push(
    { type: 'separator', spacing: 'small' },
    // ── 10: footer เล็กๆ ปิดท้าย ─────────────────────────────────────────
    { type: 'text', content: '-# Run `/builder` to start designing your own layout — this whole page was made with it.' }
  );

  return {
    // สีเดียวกับ Container ใน guildJoinGreeting.js (น้ำเงินเข้ม) ให้แบรนด์ตรงกัน
    accentColor: '#3b4e89',
    blocks,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all commands and a live showcase of what this bot can build')
    .setDescriptionLocalizations({ th: 'ดูรายการคำสั่งทั้งหมด พร้อมตัวอย่างสิ่งที่บอทสร้างได้ครับ' }),

  // ⚠️ /help ไม่ผ่านระบบ i18n (th.json/en.json) เหมือนคำสั่งอื่นๆ ในโปรเจกต์นี้
  // โดยตั้งใจ — เหตุผลเดียวกับ utils/guildJoinGreeting.js: หน้านี้ทำหน้าที่เป็น
  // "หน้าโชว์เคส/การตลาด" ที่ต้องอ่านออกได้ทั้งคนไทยและรีวิวเวอร์ของ top.gg (ซึ่งใช้
  // ภาษาอังกฤษเป็นหลัก) เนื้อหายาวและมีรายละเอียดเยอะ ถ้าจะแปลไทยให้ครบต้องเขียน
  // เนื้อหาซ้ำอีกชุดเต็มๆ ใน th.json — ตอนนี้ขอปล่อยเป็นอังกฤษไปก่อน ถ้าน้องหนาวอยาก
  // ได้เวอร์ชันไทยด้วยทีหลัง บอกได้เลยครับ เดี๋ยวเพิ่มให้
  async execute(interaction) {
    const schema = buildHelpSchema(interaction.guild, interaction.client.user);
    const message = buildMessageFromSchema(schema);

    // แนบไฟล์ banner จริงไปด้วยเสมอ เพราะ gallery block แรกอ้างอิงด้วย
    // "attachment://mascot-banner.png" (ดูคอมเมนต์ในบล็อกที่ 1 ของ buildHelpSchema)
    // ถ้าลืมแนบไฟล์นี้ Discord จะหารูปไม่เจอ โชว์เป็นภาพแตกทันที — รูปแบบเดียวกับที่
    // utils/guildJoinGreeting.js ทำไว้เป๊ะๆ
    const bannerAttachment = new AttachmentBuilder(BANNER_FILE_PATH, { name: BANNER_FILENAME });

    // ไม่ใส่ flags: Ephemeral ตั้งใจ — อยากให้ทุกคนในช่องเห็นหน้าโชว์เคสนี้ได้ ไม่ใช่
    // เห็นแค่คนพิมพ์คำสั่งคนเดียว (ต่างจาก panel ของ /builder /role-setup ที่เป็น
    // ephemeral เพราะเป็นแผงควบคุมส่วนตัว แต่ /help เป็นหน้าข้อมูลสาธารณะ)
    await interaction.reply({
      ...message,
      files: [bannerAttachment],
    });
  },
};