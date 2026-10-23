/**
 * commands/marketplace.js
 * ─────────────────────────────────────────────────────────────────────────
 * /marketplace — คำสั่งสาธารณะ (ใครก็ใช้ได้ ไม่ใช่แค่เจ้าของบอทเหมือน /referral) ให้สมาชิก
 * ทุกคนลงขายของตกแต่ง/บริการสาย Discord ของตัวเองได้ แล้วไปโชว์ขายจริงบนหน้าเว็บ
 * public/marketplace.html (ผู้ซื้อกดซื้อจากหน้าเว็บ ไม่ใช่จากดิสคอร์ด — ดู server.js
 * เส้นทาง /api/marketplace/*)
 *
 *   /marketplace sell          → ลงประกาศขายใหม่ 1 ชิ้น (กรอกทุกอย่างในคำสั่งเดียวจบ รวมรูป/ไฟล์)
 *   /marketplace mylistings    → ดูประกาศทั้งหมดของตัวเอง (ทุกสถานะ)
 *   /marketplace remove        → ปิดประกาศ (ขายหมดแล้ว/ไม่ขายแล้ว)
 *   /marketplace markselling   → เปิดประกาศที่เคยปิดไว้กลับมาขายอีกครั้ง
 *   /marketplace setpromptpay  → ตั้ง/แก้เลขพร้อมเพย์รับเงิน (ผู้ขายในไทย)
 *   /marketplace setpaymentlink → 🆕 [12 ต.ค. 2569] ตั้ง/แก้ลิงก์รับเงินสากล (ผู้ขายต่างชาติ
 *                                  ที่ไม่มี PromptPay — ดูเหตุผลเต็มๆ ใน utils/marketplaceStorage.js)
 *   ต้องตั้งช่องทางรับเงินอย่างใดอย่างหนึ่งก่อน ถึงจะลงขายได้
 *
 * 💡 ทำไมใช้ "ตัวเลือกในคำสั่งเดียวจบ" (slash command options) แทน modal สำหรับ /sell:
 * เพราะ modal ของ Discord "แนบไฟล์ไม่ได้เลย" (รับได้แค่ข้อความ) แต่ /sell ต้องให้แนบรูปสินค้า
 * และไฟล์ดิจิทัลได้ด้วย เลยต้องใช้ตัวเลือกแบบ attachment ในคำสั่งตรงๆ แทน
 *
 * 🔑 การจ่ายเงินเป็นแบบ "กึ่งอัตโนมัติ" เหมือนระบบ /referral เป๊ะๆ (ดูคำอธิบายเต็มใน
 * utils/marketplaceStorage.js หัวข้อ "หลักการสำคัญ") — บอทไม่แตะเงินเลย แค่โชว์ช่องทางรับเงิน
 * ของผู้ขายให้ผู้ซื้อจ่ายตรง (QR PromptPay ถ้าเป็นผู้ขายไทย หรือลิงก์รับเงินของผู้ขายเอง
 * ถ้าเป็นผู้ขายต่างชาติ — 🆕 [12 ต.ค. 2569]) แล้วรอผู้ขายกดยืนยันว่าได้รับเงินแล้วจริง
 * (ปุ่ม "✅ ยืนยันได้รับเงินแล้ว" ที่ DM ผู้ขาย — ดู handleButton ด้านล่าง)
 */

const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');
const {
  PROMPTPAY_ID_PATTERN,
  PAYMENT_LINK_PATTERN,
  MAX_PAYMENT_LINK_LENGTH,
  CATEGORIES,
  MAX_PRICE_THB,
  getSeller,
  saveSellerPromptPay,
  saveSellerPayment,
  getSellerPaymentMethod,
  hasPaymentMethodSet,
  createListing,
  getListing,
  resolveListingAssets,
  listSellerListings,
  setListingStatus,
  getOrder,
  saveOrderNotifyMessage,
  confirmOrder,
} = require('../utils/marketplaceStorage');
const { generatePromptPayQrBuffer } = require('../utils/promptpayQr');
// 🆕 [11 ต.ค. 2569] เก็บรูป/ไฟล์แนบที่คนลงขายผ่านคำสั่งนี้ไว้ "ถาวรจริงๆ" แบบเดียวกับที่
// หน้าเว็บ Dashboard ใหม่ใช้ (ดู utils/renderMarketplaceDashboard.js) แทนที่จะเก็บ
// attachment.url ตรงๆ แบบเดิม (URL ของ Discord หมดอายุใน ~24 ชม. — ของเดิมเคยมีบั๊กนี้
// แฝงอยู่โดยไม่รู้ตัว เพิ่งมาเจอตอนทำฟอร์มลงขายบนเว็บ เลยแก้พร้อมกันเลยทั้ง 2 ทาง)
const { storeImagePermanently } = require('../utils/assetStorage');

// ปุ่ม "ยืนยันได้รับเงินแล้ว" ที่ DM ผู้ขาย — customId รูปแบบ mkt_confirm_<orderId>
const CONFIRM_BUTTON_PREFIX = 'mkt_confirm_';

function formatThb(amount) {
  return `฿${Number(amount).toLocaleString('th-TH')}`;
}

/** แปลง CATEGORIES เป็นรายการ choices ให้ SlashCommandBuilder (สูงสุด 25 ตัวตามลิมิตของ Discord) */
function buildCategoryChoices() {
  return Object.entries(CATEGORIES).map(([value, info]) => ({ name: info.label, value }));
}

/** ป้ายสถานะประกาศ แปลงเป็นข้อความไทยอ่านง่าย */
function statusLabel(status) {
  if (status === 'active') return '🟢 กำลังขาย';
  if (status === 'sold') return '⚪ ปิดแล้ว (ขายหมด)';
  if (status === 'removed') return '🔴 ปิดแล้ว';
  return status;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('marketplace')
    .setDescription('ซื้อขายของตกแต่ง/บริการสาย Discord ผ่านตลาดบนหน้าเว็บของ Milo Bot')
    .addSubcommand((sub) =>
      sub
        .setName('sell')
        .setDescription('ลงประกาศขายของ/บริการชิ้นใหม่')
        .addStringOption((opt) =>
          opt.setName('title').setDescription('ชื่อสินค้า/บริการ').setRequired(true).setMaxLength(80)
        )
        .addNumberOption((opt) =>
          opt
            .setName('price')
            .setDescription(`ราคา (บาท) — สูงสุด ${MAX_PRICE_THB}`)
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(MAX_PRICE_THB)
        )
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('หมวดหมู่สินค้า')
            .setRequired(true)
            .addChoices(...buildCategoryChoices())
        )
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('ไฟล์ดิจิทัล (ส่งอัตโนมัติหลังจ่ายเงิน) หรือ บริการ (ผู้ขายติดต่อลูกค้าเอง)')
            .setRequired(true)
            .addChoices(
              { name: 'ไฟล์ดิจิทัล (digital)', value: 'digital' },
              { name: 'บริการ/งานสั่งทำ (service)', value: 'service' }
            )
        )
        .addStringOption((opt) =>
          opt.setName('description').setDescription('คำอธิบายสินค้า').setRequired(true).setMaxLength(1000)
        )
        .addStringOption((opt) =>
          opt
            .setName('subcategory')
            .setDescription('หมวดย่อย (ถ้ามี) — พิมพ์ตามที่ระบบแจ้งถ้าเลือกหมวดที่มีหมวดย่อย')
            .setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName('image').setDescription('รูปปกสินค้า (โชว์บนการ์ดในตลาด)').setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt
            .setName('file')
            .setDescription('ไฟล์ดิจิทัลที่จะส่งให้ลูกค้าอัตโนมัติ (จำเป็นถ้าเลือก type = ไฟล์ดิจิทัล)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) => sub.setName('mylistings').setDescription('ดูประกาศขายทั้งหมดของตัวเอง'))
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('ปิดประกาศขาย (ขายหมด/ไม่ขายแล้ว)')
        .addStringOption((opt) =>
          opt.setName('listing_id').setDescription('รหัสประกาศ (ดูได้จาก /marketplace mylistings)').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('markselling')
        .setDescription('เปิดประกาศที่เคยปิดไว้ให้กลับมาขายอีกครั้ง')
        .addStringOption((opt) =>
          opt.setName('listing_id').setDescription('รหัสประกาศ (ดูได้จาก /marketplace mylistings)').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('setpromptpay')
        .setDescription('ตั้ง/แก้เลขพร้อมเพย์รับเงินค่าขายของ (สำหรับผู้ขายในไทย)')
        .addStringOption((opt) =>
          opt.setName('promptpay_id').setDescription('เบอร์มือถือพร้อมเพย์ 10 หลัก เช่น 0812345678').setRequired(true)
        )
    )
    // 🆕 [12 ต.ค. 2569] สำหรับผู้ขายต่างชาติที่ไม่มี PromptPay ไทย — ใส่ลิงก์รับเงินของ
    // ตัวเองมาเลย (PayPal.me/Stripe Payment Link/ฯลฯ) บอทไม่รู้จัก ไม่ยุ่งกับช่องทางข้างใน
    // แค่โชว์ลิงก์นี้ให้ผู้ซื้อกดไปจ่ายตรงกับผู้ขายเอง (ดูคอมเมนต์ยาวๆ ใน
    // utils/marketplaceStorage.js หัวข้อ saveSellerPayment)
    .addSubcommand((sub) =>
      sub
        .setName('setpaymentlink')
        .setDescription('ตั้ง/แก้ลิงก์รับเงินสากล (PayPal.me/Stripe Payment Link) สำหรับผู้ขายต่างชาติ')
        .addStringOption((opt) =>
          opt.setName('link').setDescription('ลิงก์ https:// ที่ผู้ซื้อจะไปจ่ายเงิน เช่น https://paypal.me/yourname').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'sell') return handleSell(interaction);
    if (sub === 'mylistings') return handleMyListings(interaction);
    if (sub === 'remove') return handleSetStatus(interaction, 'removed');
    if (sub === 'markselling') return handleSetStatus(interaction, 'active');
    if (sub === 'setpromptpay') return handleSetPromptPay(interaction);
    if (sub === 'setpaymentlink') return handleSetPaymentLink(interaction);
  },

  // เรียกจาก index.js ตอนมีคนกดปุ่มที่ customId ขึ้นต้นด้วย mkt_
  async handleButton(interaction) {
    if (interaction.customId.startsWith(CONFIRM_BUTTON_PREFIX)) {
      return handleConfirmButton(interaction);
    }
  },

  // 🆕 ให้ server.js เรียกใช้ตอนผู้ซื้อกด "ซื้อ" บนหน้าเว็บ — สร้าง QR + DM แจ้งผู้ขาย
  notifySellerNewOrder,
  // 🆕 [12 ต.ค. 2569] ให้ server.js เรียกใช้ตอนผู้ซื้อกด "ฉันจ่ายแล้ว" บนหน้าเว็บ — แก้ DM
  // เดิมที่แจ้งผู้ขายให้โชว์ว่าผู้ซื้อแจ้งมาแล้ว (ไม่ใช่การยืนยันเงินเข้าจริง แค่แจ้งเฉยๆ)
  notifyBuyerMarkedPaid,
  // 🆕 [12 ต.ค. 2569] ให้ server.js เรียกใช้ตอนผู้ซื้อกดส่งรายงานผู้ขาย/ประกาศจากหน้าเว็บ —
  // โพสต์การ์ดแจ้งเข้าห้อง #marketplace-reports ของเซิร์ฟควบคุม (ดูคอมเมนต์เต็มๆ ด้านล่าง)
  notifyMarketplaceReport,
};

/**
 * /marketplace sell — ลงประกาศขายใหม่
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleSell(interaction) {
  const title = interaction.options.getString('title').trim();
  const price = interaction.options.getNumber('price');
  const category = interaction.options.getString('category');
  const subcategory = interaction.options.getString('subcategory');
  const type = interaction.options.getString('type');
  const description = interaction.options.getString('description').trim();
  const image = interaction.options.getAttachment('image');
  const file = interaction.options.getAttachment('file');

  const categoryInfo = CATEGORIES[category];
  if (!categoryInfo) {
    await interaction.reply({ content: '❌ หมวดหมู่ไม่ถูกต้อง ลองเลือกใหม่จากรายการที่ระบบเสนอครับ', flags: MessageFlags.Ephemeral });
    return;
  }

  // เช็คหมวดย่อย — ถ้าหมวดนี้ "มี" หมวดย่อยที่กำหนดไว้ ต้องเลือกให้ตรงตัวเป๊ะๆ (ไม่งั้น
  // ตัวกรองหมวดย่อยบนหน้าเว็บจะหาสินค้าไม่เจอ) ถ้าหมวดนี้ "ไม่มี" หมวดย่อย ก็ไม่ต้องกรอกเลย
  if (categoryInfo.subcategories) {
    if (!subcategory || !categoryInfo.subcategories.includes(subcategory)) {
      await interaction.reply({
        content:
          `❌ หมวด "${categoryInfo.label}" ต้องระบุหมวดย่อยด้วย เลือกอันใดอันหนึ่งจากนี้: ` +
          categoryInfo.subcategories.join(', '),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  } else if (subcategory) {
    await interaction.reply({
      content: `❌ หมวด "${categoryInfo.label}" ไม่มีหมวดย่อย ไม่ต้องกรอกช่อง subcategory ครับ`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (type === 'digital' && !file) {
    await interaction.reply({
      content: '❌ เลือก type เป็น "ไฟล์ดิจิทัล" แล้วต้องแนบไฟล์มาด้วย (ช่อง file) ไม่งั้นระบบส่งของให้ลูกค้าอัตโนมัติไม่ได้',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 🆕 [12 ต.ค. 2569] ต้องตั้งช่องทางรับเงินไว้ก่อนแล้วเท่านั้นถึงจะลงขายได้ (เดิมเช็คแค่
  // seller.promptpayId ตรงๆ — ตอนนี้ใช้ hasPaymentMethodSet() แทน เพราะรองรับ "link" ด้วย)
  // กันเคสลงขายเสร็จแล้วมีคนกดซื้อ แต่บอทไม่รู้จะโชว์ช่องทางจ่ายเงินไหนให้ผู้ซื้อ
  const seller = getSeller(interaction.user.id);
  if (!hasPaymentMethodSet(seller)) {
    await interaction.reply({
      content: '❌ ต้องตั้งช่องทางรับเงินก่อนถึงจะลงขายได้ครับ ใช้คำสั่ง `/marketplace setpromptpay` (ถ้าอยู่ไทย) หรือ `/marketplace setpaymentlink` (ถ้าเป็นผู้ขายต่างชาติ) ตั้งค่าก่อน แล้วค่อยกลับมาลงขายใหม่',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // คำสั่งนี้ต้องรันในเซิร์ฟเวอร์เท่านั้น (ไม่ใช่ DM กับบอท) เพราะต้องมีเซิร์ฟให้เก็บรูป/ไฟล์
  // ไว้ในห้อง asset-storage ถาวร (ดูคอมเมนต์ storeImagePermanently ด้านล่าง)
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ คำสั่งนี้ใช้ได้แค่ในเซิร์ฟเวอร์เท่านั้นครับ (ไม่ใช่ทัก DM มาที่บอทตรงๆ)', flags: MessageFlags.Ephemeral });
    return;
  }

  // 🆕 [11 ต.ค. 2569] defer ก่อนเริ่มอัปโหลดรูป/ไฟล์ — storeImagePermanently() ยิง Discord
  // API 2 รอบต่อไฟล์ (ส่งเข้าห้อง asset-storage) รวมกันอาจเกิน 3 วิได้ถ้าแนบทั้งรูป+ไฟล์
  // ถ้าไม่ defer ไว้ก่อน Discord จะตัดจบ interaction เป็น "This interaction failed" ทันที
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // 🆕 เก็บรูปปก/ไฟล์ดิจิทัลไว้ "ถาวรจริงๆ" แทนที่จะเก็บ attachment.url ตรงๆ แบบเดิม (ดู
  // เหตุผนเต็มๆ ในคอมเมนต์หัวไฟล์ utils/assetStorage.js — สรุปสั้นๆ: URL ของ Discord หมด
  // อายุใน ~24 ชม. เก็บตรงๆ ไว้นานกว่านั้นรูปจะหายจากหน้าเว็บ/ไฟล์จะส่งลูกค้าไม่ได้)
  let imageRef = null;
  let fileRef = null;
  try {
    if (image) imageRef = await storeImagePermanently(interaction.guild, image);
    if (file) fileRef = await storeImagePermanently(interaction.guild, file);
  } catch (error) {
    console.error('[marketplace sell] เก็บรูป/ไฟล์ถาวรไม่สำเร็จ:', error);
    await interaction.editReply({
      content:
        '❌ อัปโหลดรูป/ไฟล์ไม่สำเร็จครับ (มักเกิดจากบอทไม่มีสิทธิ์สร้าง/โพสต์ในห้อง `asset-storage` ของเซิร์ฟนี้) ' +
        'ลองเช็คสิทธิ์บอทในเซิร์ฟ หรือลองใหม่อีกครั้งครับ',
    });
    return;
  }

  const listing = createListing({
    sellerId: interaction.user.id,
    title,
    description,
    priceThb: price,
    category,
    subcategory: subcategory || null,
    type,
    digitalFileUrl: fileRef,
    imageUrl: imageRef,
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ ลงประกาศขายสำเร็จ')
    .setColor(0x4a5aa8)
    .setDescription(`**${listing.title}**\n${formatThb(listing.priceThb)} · ${categoryInfo.label}${subcategory ? ` / ${subcategory}` : ''}`)
    .addFields({ name: 'รหัสประกาศ', value: `\`${listing.id}\`` })
    .setFooter({ text: 'ตอนนี้ขึ้นขายจริงบนหน้าเว็บ Marketplace แล้ว — ดูสถานะ/ปิดขายได้ด้วย /marketplace mylistings (หรือหน้า Dashboard เว็บ)' });

  // ตรงนี้ใช้ image.url ดิบๆ ได้ปลอดภัย (แค่โชว์ตอนตอบกลับทันที ยังไม่หมดอายุแน่นอน) ไม่ต้อง
  // ไป resolve จาก imageRef ซ้ำให้เสียเวลา
  if (image) embed.setThumbnail(image.url);

  await interaction.editReply({ embeds: [embed] });
}

/**
 * /marketplace mylistings — ดูประกาศทั้งหมดของตัวเอง
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleMyListings(interaction) {
  const listings = listSellerListings(interaction.user.id);

  if (listings.length === 0) {
    await interaction.reply({
      content: 'ยังไม่มีประกาศขายเลยครับ ลองใช้ `/marketplace sell` ลงประกาศชิ้นแรกดูได้เลย',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = listings.map((item) => {
    const cat = CATEGORIES[item.category]?.label || item.category;
    return `**${item.title}** — ${formatThb(item.priceThb)} · ${cat}\n` + `รหัส: \`${item.id}\` · สถานะ: ${statusLabel(item.status)}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`ประกาศขายของคุณ (${listings.length} รายการ)`)
    .setColor(0x4a5aa8)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'ปิดขาย: /marketplace remove listing_id:<รหัส> — เปิดขายใหม่: /marketplace markselling' });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/**
 * ใช้ร่วมกันทั้ง /marketplace remove และ /marketplace markselling — เปลี่ยนสถานะประกาศ
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {'active'|'removed'} newStatus
 */
async function handleSetStatus(interaction, newStatus) {
  const listingId = interaction.options.getString('listing_id').trim().toUpperCase();
  const listing = getListing(listingId);

  if (!listing) {
    await interaction.reply({ content: `❌ ไม่พบประกาศรหัส \`${listingId}\` — เช็ครหัสอีกทีจาก /marketplace mylistings`, flags: MessageFlags.Ephemeral });
    return;
  }

  // ห้ามแก้ประกาศของคนอื่น — เช็คเจ้าของก่อนทุกครั้ง
  if (listing.sellerId !== interaction.user.id) {
    await interaction.reply({ content: '❌ นี่ไม่ใช่ประกาศของคุณ แก้ไขได้แค่ประกาศตัวเองเท่านั้นครับ', flags: MessageFlags.Ephemeral });
    return;
  }

  const updated = setListingStatus(listingId, newStatus);
  const message = newStatus === 'active' ? `✅ เปิดขาย **${updated.title}** อีกครั้งแล้วครับ — กลับไปโชว์บนหน้าเว็บแล้ว` : `✅ ปิดประกาศ **${updated.title}** แล้วครับ — หายไปจากหน้าเว็บแล้ว`;

  await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
}

/**
 * /marketplace setpromptpay — ตั้ง/แก้เลขพร้อมเพย์รับเงิน
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleSetPromptPay(interaction) {
  const rawValue = interaction.options.getString('promptpay_id').trim();

  if (!PROMPTPAY_ID_PATTERN.test(rawValue)) {
    await interaction.reply({
      content: `❌ เลขพร้อมเพย์ "${rawValue}" ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือ 10 หลักล้วนๆ (ไม่มีขีด/เว้นวรรค) และต้องเป็นเบอร์ที่ผูกพร้อมเพย์กับธนาคารไว้แล้วจริงๆ`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  saveSellerPromptPay(interaction.user.id, rawValue, interaction.user.username);

  await interaction.reply({
    content: `✅ บันทึกเลขพร้อมเพย์ \`${rawValue}\` เรียบร้อยครับ — ใช้เลขนี้สร้าง QR ให้ลูกค้าสแกนจ่ายตรงเข้าบัญชีนี้ทุกครั้งที่มีคนซื้อของจากคุณ (ตั้งเป็นช่องทางรับเงินหลักแล้ว ถ้าก่อนหน้านี้ใช้ลิงก์รับเงินสากลอยู่ จะสลับมาใช้ PromptPay แทน)`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * 🆕 [12 ต.ค. 2569] /marketplace setpaymentlink — ตั้ง/แก้ลิงก์รับเงินสากลของผู้ขาย
 * (สำหรับผู้ขายต่างชาติที่ไม่มี PromptPay ไทย) — ดูเหตุผลเต็มๆ ที่คอมเมนต์หัวไฟล์
 * utils/marketplaceStorage.js
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleSetPaymentLink(interaction) {
  const rawValue = interaction.options.getString('link').trim();

  if (!PAYMENT_LINK_PATTERN.test(rawValue) || rawValue.length > MAX_PAYMENT_LINK_LENGTH) {
    await interaction.reply({
      content: `❌ ลิงก์ "${rawValue}" ไม่ถูกต้อง — ต้องเป็นลิงก์ที่ขึ้นต้นด้วย https:// เท่านั้น เช่น https://paypal.me/yourname (ยาวไม่เกิน ${MAX_PAYMENT_LINK_LENGTH} ตัวอักษร)`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  saveSellerPayment(interaction.user.id, { method: 'link', paymentLink: rawValue }, interaction.user.username);

  await interaction.reply({
    content: `✅ บันทึกลิงก์รับเงิน ${rawValue} เรียบร้อยครับ — ใช้ลิงก์นี้ให้ผู้ซื้อกดไปจ่ายตรงทุกครั้งที่มีคนซื้อของจากคุณ (ตั้งเป็นช่องทางรับเงินหลักแล้ว ถ้าก่อนหน้านี้ใช้ PromptPay อยู่ จะสลับมาใช้ลิงก์นี้แทน — บอทไม่รู้จัก/ไม่ตรวจสอบช่องทางข้างในลิงก์นี้เลย แค่โชว์ให้ผู้ซื้อกดไปเองนะครับ)`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * 🆕 เรียกจาก server.js ตอนผู้ซื้อกดปุ่ม "ซื้อ" บนหน้าเว็บสำเร็จ (สร้าง order ไว้แล้ว) —
 * สร้าง QR PromptPay ของผู้ขาย + DM แจ้งผู้ขายพร้อมปุ่มยืนยันรับเงิน
 *
 * ⚠️ เหมือน postPayoutQrForCode ของระบบ referral เป๊ะๆ — QR นี้แค่ "ช่วยให้จ่ายเร็วขึ้น"
 * (ยอดเงินฝังอยู่ในตัว QR ตามมาตรฐาน Thai QR Payment) บอทไม่ได้โอนเงินให้อัตโนมัติ ผู้ซื้อ
 * ยังต้องสแกนจ่ายเองด้วยแอปธนาคาร และผู้ขายต้องกดยืนยันเองว่าได้รับเงินแล้วจริง
 *
 * @param {import('discord.js').Client} client
 * @param {object} order ออบเจกต์ order จาก createOrder()
 * @param {object} listing ออบเจกต์ listing ที่เกี่ยวข้อง
 * @param {{ id: string, username: string }} buyerInfo ข้อมูลผู้ซื้อ (มาจาก req.session.user ฝั่งเว็บ)
 * @returns {Promise<{ notified: boolean, reason?: string }>}
 */
async function notifySellerNewOrder(client, order, listing, buyerInfo) {
  const seller = getSeller(order.sellerId);
  if (!hasPaymentMethodSet(seller)) {
    // ไม่ควรเกิดขึ้นจริง เพราะ /marketplace sell บังคับตั้งช่องทางรับเงินไว้ก่อนลงขายแล้ว
    // แต่เผื่อกรณีข้อมูลเพี้ยน กันไว้ก่อนดีกว่า
    return { notified: false, reason: 'no_payment_method' };
  }

  // 🆕 [12 ต.ค. 2569] แยก 2 เส้นทางตามช่องทางรับเงินของผู้ขาย — "promptpay" สร้าง QR
  // เหมือนเดิมทุกอย่าง ส่วน "link" ไม่มี QR ให้สร้าง (ลิงก์รับเงินของผู้ขายเองไม่มียอดเงิน
  // ฝังอยู่ในตัวแบบ QR ได้ — ผู้ขายต้องดูยอดจากในข้อความนี้เอง) ดู hasPaymentMethodSet/
  // getSellerPaymentMethod ใน utils/marketplaceStorage.js
  const method = getSellerPaymentMethod(seller);
  let qrBuffer = null;
  if (method === 'promptpay') {
    try {
      qrBuffer = await generatePromptPayQrBuffer(seller.promptpayId, order.priceThb);
    } catch (error) {
      console.warn(`[marketplace] สร้าง QR รับเงินให้ออร์เดอร์ ${order.id} ไม่สำเร็จ:`, error);
      return { notified: false, reason: 'qr_generation_failed' };
    }
  }

  // 🆕 [23 ต.ค. 2569] ปรับ embed ใหม่ตามที่น้องหนาวขอ — เดิมเป็นพารากราฟยาวอ่านยาก
  // (ชื่อสินค้า/ราคา/ผู้ซื้อ ปนกับคำอธิบายขั้นตอนเป็นก้อนเดียว) เปลี่ยนมาใช้
  // embed.addFields() แทน ซึ่งเป็นวิธี "มาตรฐาน" ของ Discord สำหรับโชว์ข้อมูลแบบ
  // คีย์-ค่า (key-value) ให้อ่านเป็นช่องๆ ชัดเจน ไม่ต้องไล่อ่านทั้งพารากราฟ — แพทเทิร์น
  // เดียวกับ embed รายงานที่ handleReport ใช้ด้านบน (ดูบรรทัด ~600)
  //
  // 🔑 จุดที่น้องหนาวถามว่า "โอนเงินจากแอคเคาท์อะไร" — บอทไม่รู้ว่าเงินโอนมาจาก
  // บัญชีธนาคารไหน (การสแกน QR จ่ายเงินเกิดนอกระบบดิสคอร์ดทั้งหมด บอทมองไม่เห็น)
  // แต่สิ่งที่ตรวจสอบได้แน่ๆ 100% คือ "บัญชีดิสคอร์ดไหนเป็นคนกดซื้อ" — ใช้ mention
  // `<@id>` + เลข ID ดิบกำกับไว้ด้วย (รูปแบบเดียวกับ embed รายงานผู้ขายด้านบน) เพราะ
  // mention ปลอมแปลงไม่ได้เลย (ผูกกับ Discord ID จริงที่ login ผ่าน OAuth2 มา ไม่ใช่
  // แค่ชื่อที่พิมพ์เอง) ต่างจากข้อความชื่อธรรมดาที่เปลี่ยนได้ตลอดเวลา
  const buyerLine = buyerInfo?.id ? `<@${buyerInfo.id}> (${buyerInfo.id})` : 'ไม่ทราบตัวตน';
  const orderTimeText = new Date(order.createdAt).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  });

  const instructionText = method === 'promptpay'
    ? 'สแกน QR ด้านล่าง → รอเงินเข้าบัญชีพร้อมเพย์ของคุณจริง → กด **"✅ ยืนยันได้รับเงินแล้ว"**'
    : `ผู้ซื้อจ่ายผ่านลิงก์ของคุณเอง (${seller.paymentLink}) ไม่มี QR ให้ดู ต้องเช็คยอดเองว่าเข้าตรงกับ **${formatThb(order.priceThb)}** → แล้วกด **"✅ ยืนยันได้รับเงินแล้ว"**`;

  const embed = new EmbedBuilder()
    .setTitle('🛒 มีคนซื้อสินค้าของคุณ!')
    .setColor(0x4b8f87)
    .addFields(
      { name: '🛍️ สินค้า', value: listing.title },
      { name: '💰 ยอดเงิน', value: formatThb(order.priceThb), inline: true },
      { name: '🔑 รหัสออเดอร์', value: `\`${order.id}\``, inline: true },
      { name: '🙋 ผู้ซื้อ (บัญชีดิสคอร์ด)', value: buyerLine, inline: true },
      { name: '🕒 เวลาสั่งซื้อ', value: orderTimeText, inline: true },
    )
    .setDescription(instructionText)
    // รหัสออเดอร์เดียวกันนี้ผู้ซื้อก็เห็นอยู่หน้าเว็บตอนจ่ายเงินด้วย (public/marketplace.html
    // #payOrderId) — ใส่ไว้ใน footer กันลืมว่าใช้อ้างอิงคุยกับผู้ซื้อได้ถ้ามีปัญหา
    .setFooter({ text: 'รหัสออเดอร์นี้ ผู้ซื้อก็เห็นเหมือนกันบนหน้าเว็บ — ใช้อ้างอิงคุยกันได้ถ้ามีปัญหา' });

  if (method === 'promptpay') {
    embed.setImage(`attachment://promptpay-${order.id}.png`);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CONFIRM_BUTTON_PREFIX}${order.id}`)
      .setLabel('✅ ยืนยันได้รับเงินแล้ว')
      .setStyle(ButtonStyle.Success)
  );

  try {
    const sellerUser = await client.users.fetch(order.sellerId);
    const message = await sellerUser.send({
      embeds: [embed],
      files: method === 'promptpay' ? [new AttachmentBuilder(qrBuffer, { name: `promptpay-${order.id}.png` })] : [],
      components: [row],
    });
    saveOrderNotifyMessage(order.id, message.channelId, message.id);
    return { notified: true };
  } catch (error) {
    // เกิดได้บ่อยถ้าผู้ขายปิดรับ DM จากสมาชิกนอกเซิร์ฟ/ปิดรับ DM บอททั้งหมด — ไม่ใช่บั๊ก
    console.warn(`[marketplace] DM แจ้งผู้ขาย ${order.sellerId} ไม่สำเร็จ (อาจปิดรับ DM):`, error.message);
    return { notified: false, reason: 'dm_failed' };
  }
}

/**
 * 🆕 [12 ต.ค. 2569] รันตอนผู้ซื้อกดปุ่ม "✅ ฉันจ่ายแล้ว" ในหน้าเว็บ (payModal หลังสแกน QR) —
 * ไปแก้ DM เดิมที่แจ้งผู้ขาย (ที่เก็บพิกัดไว้ใน order.notifyChannelId/notifyMessageId
 * ตอน notifySellerNewOrder ด้านบน) ให้โชว์เพิ่มว่า "ผู้ซื้อแจ้งว่าโอนแล้ว" เพื่อช่วยผู้ขาย
 * ตัดสินใจเช็คเงินได้ไวขึ้น — ปุ่ม "ยืนยันได้รับเงินแล้ว" เดิมยังอยู่เหมือนเดิมทุกอย่าง
 * (ไม่แก้ components เลย แก้แค่ embed) เพราะการยืนยันจริงยังต้องรอผู้ขายกดเองอยู่ดี
 *
 * จงใจทำให้ "ไม่ throw" แม้แก้ DM ไม่สำเร็จ (เช่นผู้ขายลบ DM ไปแล้ว/บอทไม่มีสิทธิ์เข้าถึง
 * แชแนลนั้นแล้ว) เพราะฝั่งเว็บที่เรียกฟังก์ชันนี้ไม่ควรเด้ง error ให้ผู้ซื้อเห็นจากเหตุผลที่
 * ไม่เกี่ยวกับผู้ซื้อเลย — แค่ log ไว้เฉยๆ
 * @param {import('discord.js').Client} client
 * @param {object} order ออบเจกต์ order (ต้องมี notifyChannelId/notifyMessageId/buyerMarkedPaidAt แล้ว)
 */
async function notifyBuyerMarkedPaid(client, order) {
  if (!order.notifyChannelId || !order.notifyMessageId) return;

  try {
    const channel = await client.channels.fetch(order.notifyChannelId);
    const message = await channel.messages.fetch(order.notifyMessageId);
    const existingEmbed = message.embeds[0];
    if (!existingEmbed) return;

    const updatedEmbed = EmbedBuilder.from(existingEmbed).addFields({
      name: '🟡 ผู้ซื้อแจ้งว่าโอนเงินแล้ว',
      value:
        'ยังไม่ใช่การยืนยันว่าเงินเข้าจริงนะครับ — เช็คยอดเข้าบัญชีพร้อมเพย์ของคุณก่อน ' +
        'แล้วค่อยกดปุ่ม "✅ ยืนยันได้รับเงินแล้ว" ด้านล่างทันทีที่เห็นเงินเข้าจริงครับ',
    });

    // ไม่ส่ง components ในนี้เลย — discord.js edit() แบบไม่ส่ง field ไหนมา จะ "คงค่าเดิม"
    // ของ field นั้นไว้ (ปุ่มยืนยันเดิมเลยยังอยู่ ไม่หายไปไหน)
    await message.edit({ embeds: [updatedEmbed] });
  } catch (error) {
    console.warn(`[marketplace] แก้ DM แจ้งผู้ขายว่าผู้ซื้อโอนแล้วไม่สำเร็จ (orderId: ${order.id}):`, error.message);
  }
}

/**
 * 🆕 [12 ต.ค. 2569] หาห้อง #marketplace-reports ในเซิร์ฟควบคุม (GUILD_ID ใน .env — ดู
 * claude/owner-command-security-hardening.md) ถ้ายังไม่มีให้สร้างใหม่ ปิดไม่ให้ @everyone
 * มองเห็น (น้องหนาวเห็นได้เองอัตโนมัติเพราะมีสิทธิ์ Administrator ของเซิร์ฟนั้น ซึ่ง bypass
 * permission overwrite ได้เสมอ — หลักการเดียวกับห้อง #referral-earnings ของระบบ /referral)
 * ผู้ขายที่ถูกรายงาน "ไม่เห็น" ห้องนี้เลย เพราะไม่ได้อยู่ในเซิร์ฟควบคุมนี้ด้วยซ้ำ
 * @param {import('discord.js').Guild} guild เซิร์ฟควบคุม
 */
async function getOrCreateMarketplaceReportChannel(guild) {
  const CHANNEL_NAME = 'marketplace-reports';
  const existing = guild.channels.cache.find(
    (c) => c.name === CHANNEL_NAME && c.type === ChannelType.GuildText
  );
  if (existing) return existing;
  return guild.channels.create({
    name: CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic: 'รายงานปัญหา/ผู้ขายจาก Marketplace ของ Aitao Bot — ห้องนี้แอดมินเห็นได้เองเท่านั้น',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    ],
  });
}

/**
 * 🆕 [12 ต.ค. 2569] รันตอนผู้ซื้อกดส่งรายงานจากหน้าเว็บ (ของเดิมเป็น UI mockup client-side
 * เฉยๆ — ดู submitReport() ใน public/marketplace.html, ตอนนี้ยิง API จริงที่ server.js
 * แล้วเรียกฟังก์ชันนี้ต่อ) — โพสต์การ์ดแจ้งรายงานเข้าห้อง #marketplace-reports ของ
 * เซิร์ฟควบคุม พร้อมไฟล์หลักฐาน (ถ้ามี) แนบไปกับข้อความนี้ตรงๆ เลย ไม่ได้เก็บผ่าน
 * asset-storage แบบรูปสินค้า เพราะแค่ให้แอดมินเปิดดูในห้องนี้ครั้งเดียวพอ ไม่ต้อง resolve
 * URL สดใหม่ซ้ำทีหลังแบบที่ต้องโชว์ซ้ำๆบนหน้าเว็บ
 *
 * จงใจทำให้ "ไม่ throw" แม้โพสต์เข้าเซิร์ฟควบคุมไม่สำเร็จ (เช่นยังไม่ตั้ง GUILD_ID ใน .env,
 * บอทไม่มีสิทธิ์สร้างห้อง) เพราะรายงานถูกบันทึกลง data/marketplace.json แล้วอยู่ดี (ดู
 * createReport ใน utils/marketplaceStorage.js) แค่ไม่มีการ์ดเด้งแจ้งทันทีเฉยๆ — ไม่ควร
 * ทำให้ผู้รายงานเห็น error ทั้งที่รายงานของเขาถูกบันทึกสำเร็จแล้วจริงๆ
 * @param {import('discord.js').Client} client
 * @param {object} report ออบเจกต์รายงานจาก createReport()
 * @param {object|null} listing listing ที่ถูกรายงาน (null ได้ถ้าถูกลบไปก่อนแล้ว)
 * @param {{ id: string, username: string }} reporterInfo ข้อมูลผู้รายงาน (จาก req.session.user)
 * @param {Array<{ attachment: Buffer, name: string }>} attachments ไฟล์หลักฐาน (สูงสุด 4 ไฟล์ กรองขนาด/ชนิดแล้วจาก server.js)
 * @returns {Promise<{ posted: boolean }>}
 */
async function notifyMarketplaceReport(client, report, listing, reporterInfo, attachments) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.warn('[marketplace report] ไม่มี GUILD_ID ใน .env เลยส่งรายงานเข้าเซิร์ฟควบคุมไม่ได้ (รายงานถูกบันทึกไว้แล้วนะครับ เช็คย้อนหลังได้จาก data/marketplace.json)');
    return { posted: false };
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await getOrCreateMarketplaceReportChannel(guild);

    const embed = new EmbedBuilder()
      .setColor(0xe07a7a)
      .setTitle('🚩 มีคนรายงานประกาศขายใน Marketplace')
      .addFields(
        { name: 'สินค้า', value: listing ? `${listing.title} (รหัส ${listing.id})` : `(หาประกาศไม่เจอแล้ว — รหัสเดิม: ${report.listingId})` },
        { name: 'ผู้ขาย', value: report.sellerId ? `<@${report.sellerId}> (${report.sellerId})` : 'ไม่ทราบ (ประกาศถูกลบไปแล้ว)' },
        { name: 'ผู้รายงาน', value: `${reporterInfo.username} (${reporterInfo.id})` },
        { name: 'เหตุผล', value: report.reasonLabel },
        { name: 'รายละเอียดเพิ่มเติม', value: report.detail || '(ไม่ได้ระบุ)' },
        { name: 'รหัสรายงาน', value: report.id }
      )
      .setTimestamp(new Date(report.createdAt));

    await channel.send({
      embeds: [embed],
      files: attachments && attachments.length ? attachments : undefined,
    });
    return { posted: true };
  } catch (error) {
    console.error(`[marketplace report] โพสต์รายงาน ${report.id} เข้าเซิร์ฟควบคุมไม่สำเร็จ:`, error);
    return { posted: false };
  }
}

/**
 * รันตอนผู้ขายกดปุ่ม "✅ ยืนยันได้รับเงินแล้ว" ใน DM ของตัวเอง
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleConfirmButton(interaction) {
  const orderId = interaction.customId.slice(CONFIRM_BUTTON_PREFIX.length);
  const order = getOrder(orderId);

  if (!order) {
    await interaction.reply({ content: '❌ ไม่พบออร์เดอร์นี้แล้ว (อาจถูกลบไปแล้ว)', flags: MessageFlags.Ephemeral });
    return;
  }

  // เช็คสิทธิ์ — ต้องเป็นผู้ขายของออร์เดอร์นี้เท่านั้นถึงจะกดยืนยันได้ (กันเคสข้อความ DM
  // หลุดไปอยู่มือคนอื่นโดยบังเอิญ ถึงจะโอกาสเกิดยากมากก็ตาม เพราะเป็น DM ส่วนตัว)
  if (interaction.user.id !== order.sellerId) {
    await interaction.reply({ content: '❌ ปุ่มนี้ใช้ได้เฉพาะผู้ขายของออร์เดอร์นี้เท่านั้น', flags: MessageFlags.Ephemeral });
    return;
  }

  if (order.status === 'confirmed') {
    await interaction.reply({ content: 'ออร์เดอร์นี้ยืนยันไปแล้วก่อนหน้านี้แล้วครับ', flags: MessageFlags.Ephemeral });
    return;
  }

  const listing = getListing(order.listingId);
  confirmOrder(orderId);

  // แก้ข้อความ DM เดิมให้ขึ้นว่ายืนยันแล้ว (ปิดปุ่มไปเลย กันกดซ้ำ)
  const confirmedRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CONFIRM_BUTTON_PREFIX}${orderId}`)
      .setLabel('✅ ยืนยันรับเงินแล้ว')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
  );
  await interaction.update({ components: [confirmedRow] });

  // ส่งของ/แจ้งลูกค้าต่อ — แยกตามประเภทสินค้า
  let buyerNotified = false;
  let buyerNotifyNote = '';
  try {
    const buyerUser = await interaction.client.users.fetch(order.buyerId);
    // 🆕 [11 ต.ค. 2569] listing.digitalFileUrl เก็บเป็นพิกัดข้อความ {channelId, messageId}
    // แล้ว (ไม่ใช่ URL ดิบๆ แบบเดิม) ต้อง resolve ให้เป็น URL สดใหม่ก่อนส่งให้ลูกค้าเสมอ —
    // ถ้าไม่ resolve แล้วส่ง object ตรงๆ ให้ discord.js มันจะพังทันที (ไม่ใช่ไฟล์แนบที่ถูกต้อง)
    const { digitalFileUrl } = listing ? await resolveListingAssets(interaction.client, listing) : { digitalFileUrl: null };
    // 🆕 [15 ต.ค. 2569 — รอบ 10] listing.digitalLinkUrl เป็น URL ดิบๆ ตรงๆ อยู่แล้ว (ไม่ใช่
    // พิกัดไฟล์ที่ต้อง resolve แบบ digitalFileUrl) มีค่าเฉพาะตอน deliveryMethod==="link"
    if (listing && listing.type === 'digital' && listing.deliveryMethod === 'link' && listing.digitalLinkUrl) {
      await buyerUser.send({
        content:
          `🎉 ผู้ขายยืนยันได้รับเงินแล้ว! นี่คือลิงก์ของ **${listing.title}** ที่คุณซื้อจาก Marketplace ของ Milo Bot ครับ:\n${listing.digitalLinkUrl}`,
      });
      buyerNotified = true;
      buyerNotifyNote = 'ระบบส่งลิงก์ให้ลูกค้าทาง DM อัตโนมัติแล้วครับ';
    } else if (listing && listing.type === 'digital' && listing.deliveryMethod === 'miloconfig' && listing.digitalConfigKey) {
      // 🆕 [15 ต.ค. 2569 — รอบ 11] ส่งรหัสการตั้งค่า Milo Bot ให้ผู้ซื้อทาง DM — เหมือน
      // ลิงก์ของรอบ 10 เป๊ะๆ (เป็นค่าดิบๆที่ผู้ขายกรอกมา บอทแค่เก็บ+ส่งต่อ ไม่ได้ไปตรวจสอบ/
      // สร้างรหัสเองว่าใช้งานได้จริงไหม) — ตอนรอบ 11 ยังไม่มีคำสั่งจริงที่คอยสร้าง/ใช้รหัสนี้
      // 🆕 [16 ต.ค. 2569 — รอบ 12] ตอนนี้มีคำสั่งจริงแล้ว: `/milo export-config` (ฝั่งผู้ขาย
      // สร้างรหัสนี้) กับ `/milo import-config` (ฝั่งผู้ซื้อ รันคำสั่งนี้ตามข้อความ DM ด้านล่าง
      // เพื่อติดตั้งการตั้งค่าจริง) — ดู commands/milo.js + utils/miloConfigStorage.js
      await buyerUser.send({
        content:
          `🎉 ผู้ขายยืนยันได้รับเงินแล้ว! นี่คือรหัสการตั้งค่า Milo Bot ของ **${listing.title}** ที่คุณซื้อจาก Marketplace ของ Milo Bot ครับ:\n\`${listing.digitalConfigKey}\`\n\nนำรหัสนี้ไปใช้กับคำสั่ง \`/milo import-config\` ในดิสคอร์ดของคุณได้เลยครับ`,
      });
      buyerNotified = true;
      buyerNotifyNote = 'ระบบส่งรหัสการตั้งค่า Milo Bot ให้ลูกค้าทาง DM อัตโนมัติแล้วครับ';
    } else if (listing && listing.type === 'digital' && digitalFileUrl) {
      await buyerUser.send({
        content:
          `🎉 ผู้ขายยืนยันได้รับเงินแล้ว! นี่คือไฟล์ **${listing.title}** ที่คุณซื้อจาก Marketplace ของ Milo Bot ครับ`,
        files: [digitalFileUrl],
      });
      buyerNotified = true;
      buyerNotifyNote = 'ระบบส่งไฟล์ให้ลูกค้าทาง DM อัตโนมัติแล้วครับ';
    } else {
      await buyerUser.send({
        content:
          `🎉 ผู้ขายยืนยันได้รับเงินค่า **${listing ? listing.title : 'สินค้า'}** แล้วครับ — ผู้ขายจะทักมาติดต่อดำเนินการต่อเร็วๆ นี้`,
      });
      buyerNotified = true;
      buyerNotifyNote = 'แจ้งลูกค้าทาง DM แล้วว่ายืนยันรับเงินแล้ว — เดี๋ยวอย่าลืมทักไปคุยงานต่อนะครับ';
    }
  } catch (error) {
    console.warn(`[marketplace] DM แจ้งผู้ซื้อ ${order.buyerId} ไม่สำเร็จ (อาจปิดรับ DM):`, error.message);
  }

  await interaction.followUp({
    content:
      `✅ ยืนยันรับเงินออร์เดอร์ \`${orderId}\` เรียบร้อยครับ${buyerNotified ? '\n' + buyerNotifyNote : '\n⚠️ แจ้งลูกค้าทาง DM ไม่สำเร็จ (อาจปิดรับ DM) — ลองติดต่อลูกค้าเองโดยตรงนะครับ'}`,
    flags: MessageFlags.Ephemeral,
  });
}
