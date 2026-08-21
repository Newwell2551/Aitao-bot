// commands/premium.js
// คำสั่ง /premium — โชว์สถานะพรีเมียมของเซิร์ฟนี้ พร้อมปุ่ม "สมัคร" หรือ "จัดการการสมัคร"
//
// โครงสร้าง:
//   execute()      → รันตอนพิมพ์ /premium — โชว์สถานะ + ปุ่ม 1 ปุ่ม (สมัคร หรือ จัดการ แล้วแต่สถานะ)
//   handleButton() → รันตอนกดปุ่ม premium_subscribe / premium_manage (index.js เป็นคน route มาให้)
//
// 🔑 Pattern สำคัญ (เรียนรู้จากบทเรียนโปรเจกต์นี้):
//   ปุ่มทั้งสองต้องเรียก Stripe API (เน็ตออกไปข้างนอก) ก่อนตอบกลับ user ได้ — อาจช้าเกิน
//   3 วินาทีที่ Discord ให้มา ต้องใช้ deferReply() ก่อนเสมอ ห้าม reply() ตรงๆ หลัง await

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  TextDisplayBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const stripe = require('../utils/stripeClient');
const { isPremiumGuild, getSubscriptionInfo } = require('../utils/tierManager');
const { getGuildLanguage } = require('../utils/languageStorage');
const { createTranslator } = require('../utils/i18n');
// การ์ดพรีเมียม (title/status/thumbnail รูปปก/ลิสต์สิทธิประโยชน์/accent color)
// ย้ายออกไปเป็น util กลางแล้ว เพื่อให้ /premium กับ DM แจ้งเตือนใน server.js
// ใช้โค้ดสร้างการ์ดชุดเดียวกัน ไม่ต้องคอยแก้พร้อมกัน 2 ที่ทุกครั้งที่ปรับดีไซน์
const { buildPremiumCard } = require('../utils/buildPremiumCard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription("Manage this server's premium subscription")
    .setDescriptionLocalizations({ th: 'จัดการระบบสมัครพรีเมียมของเซิร์ฟนี้ครับ' })
    // จำกัดสิทธิ์: เฉพาะคนมี Manage Server เท่านั้นถึงจะเห็น/ใช้คำสั่งนี้ได้ (เหมือน /language)
    // เพราะเรื่องเงิน/การสมัครสมาชิกเป็นเรื่องระดับเซิร์ฟเวอร์ ไม่ควรให้สมาชิกทั่วไปยุ่งได้
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    // กันเรียกใน DM — พรีเมียมผูกกับ guild ถ้าไม่มี guildId ก็ไม่มีเซิร์ฟให้เช็คสถานะ
    if (!interaction.guildId) {
      const t = createTranslator('en');
      return interaction.reply({
        content: t('common.error.guild_only'),
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildId = interaction.guildId;
    const t = createTranslator(getGuildLanguage(guildId));

    const isPremium = isPremiumGuild(guildId);
    const info = getSubscriptionInfo(guildId);

    // ── สร้างปุ่มให้ตรงกับสถานะ: premium แล้ว → ปุ่มจัดการ / ยังไม่ premium → ปุ่มสมัคร ──
    const actionButton = isPremium
      ? new ButtonBuilder()
          .setCustomId('premium_manage')
          .setLabel(t('premium.button.manage'))
          .setStyle(ButtonStyle.Secondary)
      : new ButtonBuilder()
          .setCustomId('premium_subscribe')
          .setLabel(t('premium.button.subscribe'))
          .setStyle(ButtonStyle.Primary);

    // ── สร้างการ์ด (title/status/thumbnail รูปปก/ลิสต์สิทธิประโยชน์/accent color) ──
    // logic ทั้งหมดอยู่ใน utils/buildPremiumCard.js แล้ว (ใช้ร่วมกับ DM แจ้งเตือน
    // ตอนสมัครสำเร็จใน server.js ด้วย) ที่นี่แค่ส่ง actionButton เข้าไปให้มีปุ่มต่อท้าย
    const container = buildPremiumCard({
      isPremium,
      subscriptionInfo: info,
      guild: interaction.guild,
      t,
      actionButton,
    });

    await interaction.reply({
      components: [container],
      // IsComponentsV2 จำเป็นเพราะเราใช้ TextDisplayBuilder/ContainerBuilder (Components V2)
      // Ephemeral เพราะเป็นข้อมูล/ลิงก์ที่เกี่ยวกับการเงิน ไม่ควรให้คนอื่นในช่องเห็น
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },

  async handleButton(interaction) {
    // กันเรียกใน DM เหมือนกับ execute() — ในทางปฏิบัติปุ่มพวกนี้โผล่มาจาก execute()
    // เท่านั้นซึ่งเช็คไปแล้วชั้นหนึ่ง แต่ใส่ไว้อีกชั้นกันเหนียว (defense in depth)
    if (!interaction.guildId) {
      const t = createTranslator('en');
      return interaction.reply({ content: t('common.error.guild_only'), flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guildId;
    const t = createTranslator(getGuildLanguage(guildId));

    // ⚠️ deferReply() ก่อนเสมอ เพราะบรรทัดถัดไปทั้งหมดต้องรอ Stripe API (เน็ตออกนอก)
    // ซึ่งอาจช้าเกิน 3 วินาทีที่ Discord ให้ได้ — ถ้าไม่ defer ตรงนี้ ตอนเน็ตช้าๆ
    // user จะเจอ "This interaction failed" ทันทีโดยที่โค้ดยังทำงานไม่เสร็จเลยด้วยซ้ำ
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.customId === 'premium_subscribe') {
      // 🔒 กันเคสปุ่มเก่าค้าง — เช่น user เปิดข้อความ /premium ทิ้งไว้ตอนเซิร์ฟยังฟรี
      // แล้วมีคนสมัครพรีเมียมสำเร็จไปแล้วระหว่างนั้น (ผ่านข้อความ /premium อันอื่น หรือ
      // ผ่าน /dev-set-tier) พอกลับมากดปุ่มเก่าอีกที ต้องเช็คสถานะ "ล่าสุด" ก่อนเสมอ
      // ไม่งั้นจะไปสร้าง checkout session ใหม่ซ้อนกัน เสี่ยงจ่ายเงินซ้ำ 2 รอบโดยไม่ตั้งใจ
      if (isPremiumGuild(guildId)) {
        await interaction.editReply({ content: t('premium.already_premium') });
        return;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: process.env.STRIPE_PREMIUM_PRICE_ID, quantity: 1 }],
        // TODO: เปลี่ยนเป็น URL จริงของโปรเจกต์ตอนมีเว็บ/หน้า thank-you แล้ว
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        // discordUserId เพิ่มเข้ามาใหม่ — server.js เอาไปใช้หา user ตอนส่ง DM แจ้งเตือน
        // (ดู PART F) มาจาก interaction.user.id ของ Discord โดยตรง ไม่ใช่ user กรอกเอง
        // ปลอมแปลงไม่ได้เหมือนกับ guildId
        metadata: { guildId, discordUserId: interaction.user.id },
        subscription_data: { metadata: { guildId } },
      });

      // 🐛 บั๊กที่เจอจากการทดสอบจริง: เดิมใช้ ButtonStyle.Link ใส่ session.url ตรงๆ
      // แต่ลิงก์ Stripe checkout ยาวเกิน 512 ตัวอักษร (ขีดจำกัด URL ของ Link Button
      // ใน Discord) ทำให้ editReply() ทั้งก้อนโดน reject ด้วย DiscordAPIError 50035
      // (BASE_TYPE_MAX_LENGTH) แก้โดยเปลี่ยนมาส่งเป็นข้อความที่มีลิงก์อยู่ในเนื้อหา
      // แทน (TextDisplay ไม่มีข้อจำกัดความยาว URL แบบปุ่ม)
      await interaction.editReply({
        components: [
          new TextDisplayBuilder().setContent(t('premium.subscribe_link', { url: session.url })),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    if (interaction.customId === 'premium_manage') {
      const info = getSubscriptionInfo(guildId);

      // ป้องกัน loophole: ถ้าไม่มีข้อมูล Stripe จริง (เช่นตั้ง premium มือผ่าน /dev-set-tier)
      // ห้ามยิง stripe.billingPortal.sessions.create({ customer: undefined }) เด็ดขาด
      // เพราะ Stripe API จะ error ทันที ต้องดักไว้ก่อนแล้วบอก user ตรงๆ ว่าไม่มีอะไรให้จัดการ
      if (!info) {
        await interaction.editReply({ content: t('premium.manage_no_customer') });
        return;
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: info.stripeCustomerId,
        // TODO: เปลี่ยนเป็น URL จริงเหมือนกับ success_url/cancel_url ด้านบน
        return_url: 'https://example.com/return',
      });

      await interaction.editReply({ content: t('premium.manage_link', { url: portalSession.url }) });
      return;
    }
  },
};