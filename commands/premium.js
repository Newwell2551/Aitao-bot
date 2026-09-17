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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
} = require('discord.js');

const stripe = require('../utils/stripeClient');
const { isPremiumGuild, getSubscriptionInfo } = require('../utils/tierManager');
const { getGuildLanguage } = require('../utils/languageStorage');
const { createTranslator } = require('../utils/i18n');
// 🆕 [แคมเปญโค้ดส่วนลดพ่อค้าแม่ค้า] ฟังก์ชันเช็ค/บันทึกการใช้โค้ด — รายละเอียดทั้งหมด
// (โครงสร้างไฟล์, กันใช้ซ้ำต่อเซิร์ฟ, ระบบค่าคอม) อยู่ใน utils/referralStorage.js
const {
  getActiveCode,
  hasGuildUsedCode,
  recordPendingRedemption,
} = require('../utils/referralStorage');
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

    // 🆕 [แคมเปญโค้ดส่วนลดพ่อค้าแม่ค้า] ปุ่มที่ 2 "มีโค้ดส่วนลด?" — โชว์เฉพาะตอนยังไม่
    // premium เท่านั้น (สมัครอยู่แล้วก็ไม่มีเหตุผลต้องกรอกโค้ดอีก) กดแล้วเปิด modal ให้
    // กรอกโค้ด (ดู handleButton() case 'premium_enter_code' ด้านล่าง)
    const enterCodeButton = isPremium
      ? null
      : new ButtonBuilder()
          .setCustomId('premium_enter_code')
          .setLabel(t('premium.button.enter_code'))
          .setStyle(ButtonStyle.Secondary);

    // ── สร้างการ์ด (title/status/thumbnail รูปปก/ลิสต์สิทธิประโยชน์/accent color) ──
    // logic ทั้งหมดอยู่ใน utils/buildPremiumCard.js แล้ว (ใช้ร่วมกับ DM แจ้งเตือน
    // ตอนสมัครสำเร็จใน server.js ด้วย) ที่นี่แค่ส่ง actionButtons เข้าไปให้มีปุ่มต่อท้าย
    // ใช้ actionButtons (พหูพจน์ อาเรย์) แทน actionButton เดี่ยวๆ เพราะตอนนี้อาจมี
    // 2 ปุ่มพร้อมกัน (สมัคร + มีโค้ดส่วนลด) — ถ้า enterCodeButton เป็น null (premium แล้ว)
    // .filter(Boolean) จะตัดออกให้เหลือแค่ปุ่มจัดการปุ่มเดียวเอง
    const container = buildPremiumCard({
      isPremium,
      subscriptionInfo: info,
      guild: interaction.guild,
      t,
      actionButtons: [actionButton, enterCodeButton].filter(Boolean),
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

    // 🆕 [แคมเปญโค้ดส่วนลดพ่อค้าแม่ค้า] ปุ่ม "มีโค้ดส่วนลด?" — ต้องเช็คก่อน
    // deferReply() ด้านล่างเสมอ เพราะ interaction.showModal() ต้องเป็น "คำตอบแรก" ของ
    // interaction เท่านั้น (จะ defer หรือ reply ไปก่อนแล้วค่อย showModal ทีหลังไม่ได้
    // Discord จะ error ทันที) เคสนี้ไม่ต้องรอ Stripe เลยด้วย (แค่เปิด modal เฉยๆ)
    // เลยไม่จำเป็นต้อง defer ตั้งแต่แรกอยู่แล้ว
    if (interaction.customId === 'premium_enter_code') {
      const codeInput = new TextInputBuilder()
        .setCustomId('redeem_code_input')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(t('premium.modal.redeem_code_placeholder'))
        .setRequired(true)
        .setMaxLength(20);

      const codeLabel = new LabelBuilder()
        .setLabel(t('premium.modal.redeem_code_label'))
        .setTextInputComponent(codeInput);

      const modal = new ModalBuilder()
        .setCustomId('premium_modal_redeem_code')
        .setTitle(t('premium.modal.redeem_code_title'))
        .addLabelComponents(codeLabel);

      await interaction.showModal(modal);
      return;
    }

    // ⚠️ deferReply() ก่อนเสมอ เพราะบรรทัดถัดไปทั้งหมดต้องรอ Stripe API (เน็ตออกนอก)
    // ซึ่งอาจช้าเกิน 3 วินาทีที่ Discord ให้ได้ — ถ้าไม่ defer ตรงนี้ ตอนเน็ตช้าๆ
    // user จะเจอ "This interaction failed" ทันทีโดยที่โค้ดยังทำงานไม่เสร็จเลยด้วยซ้ำ
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.customId === 'premium_subscribe') {
      // 🔒 กันเคสปุ่มเก่าค้าง — เช่น user เปิดข้อความ /premium ทิ้งไว้ตอนเซิร์ฟยังฟรี
      // แล้วมีคนสมัครพรีเมียมสำเร็จไปแล้วระหว่างนั้น (ผ่านข้อความ /premium อันอื่น หรือ
      // ผ่าน /dev) พอกลับมากดปุ่มเก่าอีกที ต้องเช็คสถานะ "ล่าสุด" ก่อนเสมอ
      // ไม่งั้นจะไปสร้าง checkout session ใหม่ซ้อนกัน เสี่ยงจ่ายเงินซ้ำ 2 รอบโดยไม่ตั้งใจ
      if (isPremiumGuild(guildId)) {
        await interaction.editReply({ content: t('premium.already_premium') });
        return;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: process.env.STRIPE_PREMIUM_PRICE_ID, quantity: 1 }],
        // 🆕 [แคมเปญโค้ดส่วนลดผู้ขาย/พาร์ทเนอร์ — อัปเดต 17 ก.ย. 2569]
        // เส้นทางนี้ (ปุ่ม "สมัครพรีเมียม" ธรรมดา) คือทาง "ทั่วไป" — เปิดให้หน้า
        // Stripe Checkout มีช่อง "Add promotion code" ให้ลูกค้าพิมพ์โค้ดเอง แบบนี้
        // เราไม่รู้ล่วงหน้าว่าลูกค้าจะกรอกโค้ดอะไร (หรือไม่กรอกเลยก็ได้) เลยไม่มีทาง
        // เช็ค "เซิร์ฟนี้ใช้โค้ดนี้ไปแล้วหรือยัง" ได้จากทางนี้
        //
        // ทางที่เช็คได้จริง (กันเกรียนใช้โค้ดซ้ำ) คือปุ่ม "🎟️ มีโค้ดส่วนลด?" แยกต่างหาก
        // ที่ลูกค้ากรอกโค้ดผ่าน modal ในดิสคอร์ดก่อน แล้วบอทค่อยไปสร้าง Checkout Session
        // เอง — ดู handleModalSubmit() ท้ายไฟล์นี้ ('premium_modal_redeem_code')
        allow_promotion_codes: true,
        // ชี้ไปที่โดเมนจริงของบอทบน Railway แล้ว — สองหน้านี้ถูกเพิ่มเป็น route
        // /success กับ /cancel ใน server.js (ดูคอมเมนต์ในไฟล์นั้นสำหรับรายละเอียด)
        success_url: 'https://aitao-bot-production.up.railway.app/success',
        cancel_url: 'https://aitao-bot-production.up.railway.app/cancel',
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

      // ป้องกัน loophole: ถ้าไม่มีข้อมูล Stripe จริง (เช่นตั้ง premium มือผ่าน /dev)
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

  /**
   * 🆕 [แคมเปญโค้ดส่วนลดพ่อค้าแม่ค้า] รันตอนลูกค้ากดส่งฟอร์ม modal "กรอกโค้ดส่วนลด"
   * (เปิด modal มาจาก handleButton() → case 'premium_enter_code' ด้านบน)
   * index.js เป็นคน route interaction แบบ modalSubmit ที่ customId ขึ้นต้นด้วย
   * "premium_modal_" มาที่ฟังก์ชันนี้ (ดูคอมเมนต์ที่เพิ่มใน index.js)
   *
   * ขั้นตอน:
   *   1. เช็คว่าเซิร์ฟนี้ premium อยู่แล้วหรือยัง (ถ้าใช่ ไม่ต้องทำอะไรต่อ)
   *   2. เช็คว่าโค้ดที่กรอกมามีจริงและยังเปิดใช้งานอยู่ไหม (getActiveCode)
   *   3. เช็คว่าเซิร์ฟนี้เคยใช้ "โค้ดนี้" ไปแล้วหรือยัง (hasGuildUsedCode) — กันเกรียน
   *   4. ถ้าผ่านหมดทุกข้อ → สร้าง Checkout Session โดย "แนบส่วนลดนี้เข้าไปเอง"
   *      (ไม่ใช่ให้ลูกค้ากรอกเองหน้า Stripe แบบปุ่มสมัครธรรมดา) แล้วบันทึก
   *      "รอผลชำระเงิน" ไว้ก่อน (recordPendingRedemption) — ตัวที่ "ยืนยันว่าใช้โค้ด
   *      สำเร็จจริง" (กันใช้ซ้ำ + นับค่าคอม) จะเกิดขึ้นตอน webhook checkout.session.completed
   *      มาถึงจริงต่างหาก (ดู server.js) ไม่ใช่ตอนนี้ — เผื่อกรอกโค้ดแล้วไม่จ่ายเงินจริง
   */
  async handleModalSubmit(interaction) {
    if (interaction.customId !== 'premium_modal_redeem_code') return;

    if (!interaction.guildId) {
      const t = createTranslator('en');
      return interaction.reply({ content: t('common.error.guild_only'), flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guildId;
    const t = createTranslator(getGuildLanguage(guildId));

    // ⚠️ ต้อง deferReply() ก่อนเสมอเหมือน handleButton() เพราะต้องรอ Stripe API
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // 1) เซิร์ฟนี้ premium อยู่แล้ว — ไม่ต้องทำอะไรต่อ (กันสมัครซ้ำ/ใช้โค้ดซ้ำโดยไม่จำเป็น)
    if (isPremiumGuild(guildId)) {
      await interaction.editReply({ content: t('premium.already_premium') });
      return;
    }

    // getActiveCode() ปรับตัวโค้ด (ตัดช่องว่าง + ตัวพิมพ์ใหญ่) ให้เองข้างในแล้ว
    // เพราะงั้นส่ง rawCode ดิบๆ เข้าไปได้เลย ไม่ต้องมาปรับซ้ำตรงนี้
    const rawCode = interaction.fields.getTextInputValue('redeem_code_input');
    const codeEntry = getActiveCode(rawCode);

    // 2) ไม่เจอโค้ดนี้เลย หรือโค้ดถูกปิดใช้งานไปแล้ว (deactivated)
    if (!codeEntry) {
      await interaction.editReply({ content: t('premium.redeem.invalid_code') });
      return;
    }

    // 3) เซิร์ฟนี้เคยใช้ "โค้ดนี้" (ตัวนี้เป๊ะๆ) ไปแล้ว — ต้องรอโค้ดใหม่จากผู้ขาย
    if (hasGuildUsedCode(guildId, rawCode)) {
      await interaction.editReply({ content: t('premium.redeem.already_used') });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PREMIUM_PRICE_ID, quantity: 1 }],
      // 🔑 จุดต่างจากปุ่มสมัครธรรมดา: แนบส่วนลดเข้าไป "เอง" เลย เพราะเรารู้แล้วว่า
      // ลูกค้าจะใช้โค้ดไหน (ผ่านการตรวจสอบด้านบนมาแล้วทุกข้อ) ไม่ต้องให้ไปกรอกซ้ำ
      // อีกทีหน้า Stripe Checkout — ⚠️ ห้ามใส่ allow_promotion_codes: true คู่กับ
      // discounts พร้อมกันเด็ดขาด Stripe จะโยน error ทันที (เลือกได้ทางเดียว)
      discounts: [{ promotion_code: codeEntry.stripePromotionCodeId }],
      success_url: 'https://aitao-bot-production.up.railway.app/success',
      cancel_url: 'https://aitao-bot-production.up.railway.app/cancel',
      metadata: { guildId, discordUserId: interaction.user.id, referralCode: rawCode.trim().toUpperCase() },
      subscription_data: { metadata: { guildId } },
    });

    // บันทึก "รอผลชำระเงิน" ไว้ก่อน — ผูกกับ session.id เพื่อให้ webhook (server.js)
    // มาเทียบได้ตอนจ่ายเงินสำเร็จจริง แล้วค่อยนับว่า "ใช้โค้ดนี้ไปแล้ว" + คิดค่าคอม
    recordPendingRedemption(session.id, {
      guildId,
      code: rawCode,
      sellerLabel: codeEntry.sellerLabel,
      sellerDiscordId: codeEntry.sellerDiscordId,
    });

    // ส่งลิงก์ checkout กลับไปแบบเดียวกับปุ่มสมัครธรรมดา (pattern เดียวกันเป๊ะ
    // รวมถึงเหตุผลที่ต้องใช้ TextDisplay แทน Link Button — ดูคอมเมนต์ใน handleButton())
    await interaction.editReply({
      components: [
        new TextDisplayBuilder().setContent(t('premium.subscribe_link', { url: session.url })),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};