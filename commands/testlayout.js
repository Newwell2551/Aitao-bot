// 🔒 [7 พ.ย. 2569] คำสั่งนี้เป็นเครื่องมือทดสอบของผู้พัฒนาเฉยๆ (โชว์ตัวอย่างการจัดวาง
// ข้อความด้วย schema ที่ hardcode ไว้) ไม่มีประโยชน์กับผู้ใช้ทั่วไปเลย และก่อนหน้านี้เปิด
// สาธารณะ 100% ไม่มีการเช็คสิทธิ์อะไรเลย — ล็อกให้เหมือนกับ /dev (ownerOnly + ซ่อนจาก
// ลิสต์คำสั่งด้วย setDefaultMemberPermissions(0) + เช็ค OWNER_ID ซ้ำอีกชั้นตอน execute)
// แทนการลบไฟล์ทิ้ง เผื่อยังอยากใช้ทดสอบ layout เองอยู่ (ดู
// claude/discord-command-security-audit.md — ข้อเสนอของสภา)
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildMessageFromSchema } = require('../utils/buildMessageFromSchema');

// ตัวอย่าง schema คงที่ (hardcode) ไว้ทดสอบว่าฟังก์ชันแปลงถูกต้อง
// แบ่งเป็นโซนทดสอบทีละเคส คั่นด้วย separator + หัวข้อบอกชัดๆ ว่ากำลังทดสอบอะไรอยู่
const exampleSchema = {
  accentColor: '#ffb7c5',
  blocks: [
    // ===== เคส 0: เกริ่นนำ =====
    {
      type: 'text',
      content: '# 🌸 Midori Bot — ทดสอบ buildMessageFromSchema()\nไล่ดูทีละเคสด้านล่างนี้ได้เลยค่ะ',
    },

    { type: 'separator', spacing: 'large' },

    // ===== เคส 1: markdown หลายแบบใน text block เดียว =====
    {
      type: 'text',
      content:
        '## เคส 1: Markdown หลายแบบ\n' +
        '### หัวข้อย่อย (heading)\n' +
        'นี่คือ **ตัวหนา** และนี่คือ *ตัวเอียง* และ ~~ขีดทับ~~\n' +
        'bullet list:\n' +
        '- หัวข้อแรก\n' +
        '- หัวข้อที่สอง\n' +
        '- หัวข้อที่สาม\n' +
        'และนี่คือ `inline code` ด้วยค่ะ',
    },

    { type: 'separator', spacing: 'small' },

    // ===== เคส 2: gallery 4 รูป พร้อม description ทุกรูป =====
    {
      type: 'text',
      content: '## เคส 2: Gallery 4 รูป (มี description ครบทุกรูป)',
    },
    {
      type: 'gallery',
      items: [
        {
          url: 'https://placehold.co/400x300/png?text=Image+1',
          description: 'รูปที่ 1 — คำอธิบายรูปแรก',
        },
        {
          url: 'https://placehold.co/400x300/png?text=Image+2',
          description: 'รูปที่ 2 — คำอธิบายรูปสอง',
        },
        {
          url: 'https://placehold.co/400x300/png?text=Image+3',
          description: 'รูปที่ 3 — คำอธิบายรูปสาม',
        },
        {
          url: 'https://placehold.co/400x300/png?text=Image+4',
          description: 'รูปที่ 4 — คำอธิบายรูปสี่ (ลองใส่ .gif แทน url นี้ได้เลย)',
        },
      ],
    },

    { type: 'separator', spacing: 'small' },

    // ===== เคส 3: section + thumbnail =====
    {
      type: 'text',
      content: '## เคส 3: Section + Thumbnail',
    },
    {
      type: 'section',
      text: '**การ์ดข้อความ**\nบล็อกนี้เป็น type "section" ข้อความจะอยู่คู่กับรูปเล็กด้านขวา เหมาะกับโปรไฟล์หรือสรุปข้อมูลสั้นๆ',
      thumbnail: 'https://placehold.co/100x100/png?text=Thumb',
    },

    { type: 'separator', spacing: 'small' },

    // ===== เคส 4: separator small ตามด้วย large ติดกัน 2 อัน =====
    {
      type: 'text',
      content: '## เคส 4: Separator small + large ติดกัน\nด้านล่างนี้คือ separator แบบ small แล้วตามด้วย large ติดกันทันที (สังเกตระยะห่างที่ต่างกัน)',
    },
    { type: 'separator', spacing: 'small' },
    { type: 'separator', spacing: 'large' },
    {
      type: 'text',
      content: '_(จบเคสทดสอบทั้งหมดแล้วค่ะ)_',
    },
  ],
};

module.exports = {
  // 🔒 ownerOnly: true — เหมือนใน dev.js เป๊ะๆ (ดูคอมเมนต์อธิบายละเอียดในไฟล์นั้น)
  // กันคำสั่งนี้ไม่ให้ลงทะเบียนแบบ Global และไม่ให้ไปโชว์ที่ discordbotlist.com
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName('testlayout')
    .setDescription('For development use only.')
    .setDescriptionLocalizations({ th: 'สำหรับนักพัฒนาเท่านั้นครับ' })
    .setDefaultMemberPermissions(0),

  async execute(interaction) {
    // ── เช็ค owner-only ก่อนทำอะไรทั้งนั้น (เหมือน dev.js เป๊ะๆ) ──────────────
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({
        content: '❌ คำสั่งนี้ไม่สามารถใช้งานได้ครับ',
        flags: MessageFlags.Ephemeral,
      });
    }

    const message = buildMessageFromSchema(exampleSchema);
    await interaction.reply(message);
  },
};