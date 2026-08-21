/**
 * /dev-set-tier — คำสั่งลับสำหรับเจ้าของบอทเท่านั้น ใช้ตั้งค่า tier ของเซิร์ฟเวอร์ไหนก็ได้
 * ก่อนที่จะมีระบบจ่ายเงินจริง (เช่น Stripe webhook) ใช้ตอน dev/ทดสอบระบบ premium gate เอง
 *
 * ⚠️ คำสั่งนี้ทรงพลังมาก — ปลดล็อก/ล็อกฟีเจอร์ premium ของเซิร์ฟเวอร์ไหนก็ได้ในโลก
 * (ใส่ guild_id เป็น string เอง ไม่ได้จำกัดแค่เซิร์ฟเวอร์ที่รันคำสั่งอยู่)
 * เพราะงั้นต้องล็อกให้เจ้าของบอทเท่านั้นที่ใช้ได้ ห้ามหลุดไปถึงแอดมินเซิร์ฟเวอร์ทั่วไปเด็ดขาด
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { setGuildTier, VALID_TIERS } = require('../utils/tierManager');

// เช็ครูปแบบ guild_id คร่าวๆ ก่อน (Discord snowflake ID เป็นตัวเลขล้วน ยาว 17-20 หลัก)
// กันแอดมิน/เจ้าของบอทพิมพ์ผิดเผลอใส่ค่าที่ไม่ใช่ ID จริงมา
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dev-set-tier')
    .setDescription("[DEV ONLY] Set a server's tier (for testing before real payments)")
    .setDescriptionLocalizations({ th: '[DEV ONLY] ตั้งค่า tier ของเซิร์ฟไว้ทดสอบก่อนมีระบบจ่ายเงินจริงครับ' })
    .addStringOption((opt) =>
      opt.setName('guild_id')
        .setDescription('Guild ID of the server to set')
        .setDescriptionLocalizations({ th: 'Guild ID ของเซิร์ฟที่จะตั้งค่าครับ' })
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('tier')
        .setDescription('Tier to set')
        .setDescriptionLocalizations({ th: 'Tier ที่จะตั้งครับ' })
        .setRequired(true)
        .addChoices(
          { name: 'premium', value: 'premium' },
          { name: 'free', value: 'free' },
        )
    ),

  async execute(interaction) {
    // ── เช็ค owner-only ก่อนทำอะไรทั้งนั้น (สำคัญที่สุดของคำสั่งนี้) ──────────────
    // เทียบ interaction.user.id (คนที่กำลังกดคำสั่งอยู่ตอนนี้) กับ OWNER_ID ใน .env
    // ถ้าไม่ตรงกัน หยุดทันที ไม่ทำอะไรต่อเลยแม้แต่นิดเดียว
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({
        content: '❌ คำสั่งนี้ใช้ได้เฉพาะเจ้าของบอทเท่านั้นครับ',
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildId = interaction.options.getString('guild_id').trim();
    const tier = interaction.options.getString('tier');

    if (!SNOWFLAKE_PATTERN.test(guildId)) {
      return interaction.reply({
        content: `❌ guild_id หน้าตาไม่เหมือน Discord ID จริงครับ (ต้องเป็นตัวเลขล้วน 17-20 หลัก ได้รับ: "${guildId}")`,
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      setGuildTier(guildId, tier);
    } catch (error) {
      // ปกติไม่น่าเกิด เพราะ Discord choices บังคับให้เลือกได้แค่ free/premium อยู่แล้ว
      // แต่ดักไว้เผื่อมีคนเรียกฟังก์ชันนี้ทางอื่นในอนาคต
      return interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }

    // ลองดูว่าบอทอยู่ในเซิร์ฟเวอร์นั้นไหม ถ้าอยู่ โชว์ชื่อเซิร์ฟเวอร์ด้วยเลย ดูง่ายกว่าเห็นแต่ ID
    // (ตั้ง tier ได้แม้บอทจะไม่ได้อยู่ในเซิร์ฟเวอร์นั้นตอนนี้ก็ตาม เผื่อ dev เตรียมข้อมูลล่วงหน้า)
    const guild = interaction.client.guilds.cache.get(guildId);
    const guildLabel = guild ? `**${guild.name}** (\`${guildId}\`)` : `\`${guildId}\` (บอทไม่ได้อยู่ในเซิร์ฟเวอร์นี้ตอนนี้)`;

    return interaction.reply({
      content: `✅ ตั้งค่าเซิร์ฟเวอร์ ${guildLabel} เป็น tier **${tier}** แล้วครับ`,
      flags: MessageFlags.Ephemeral,
    });
  },
};