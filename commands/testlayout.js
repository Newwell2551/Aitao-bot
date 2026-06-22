const { SlashCommandBuilder } = require('discord.js');
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
  data: new SlashCommandBuilder()
    .setName('testlayout')
    .setDescription('ทดสอบ buildMessageFromSchema() ด้วย schema ตัวอย่างที่ hardcode ไว้'),

  async execute(interaction) {
    const message = buildMessageFromSchema(exampleSchema);
    await interaction.reply(message);
  },
};