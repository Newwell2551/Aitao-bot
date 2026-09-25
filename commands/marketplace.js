/**
 * commands/marketplace.js
 * ─────────────────────────────────────────────────────────────────────────
 * /marketplace — คำสั่งสาธารณะ (ใครก็ใช้ได้ ไม่ใช่แค่เจ้าของบอทเหมือน /referral) ให้สมาชิก
 * ทุกคนลงขายของตกแต่ง/บริการสาย Discord ของตัวเองได้ แล้วไปโชว์ขายจริงบนหน้าเว็บ
 * public/marketplace.html (ผู้ซื้อกดซื้อจากหน้าเว็บ ไม่ใช่จากดิสคอร์ด — ดู server.js
 * เส้นทาง /api/marketplace/*)
 *
 *   /marketplace sell         → ลงประกาศขายใหม่ 1 ชิ้น (กรอกทุกอย่างในคำสั่งเดียวจบ รวมรูป/ไฟล์)
 *   /marketplace mylistings   → ดูประกาศทั้งหมดของตัวเอง (ทุกสถานะ)
 *   /marketplace remove       → ปิดประกาศ (ขายหมดแล้ว/ไม่ขายแล้ว)
 *   /marketplace markselling  → เปิดประกาศที่เคยปิดไว้กลับมาขายอีกครั้ง
 *   /marketplace setpromptpay → ตั้ง/แก้เลขพร้อมเพย์รับเงิน (ต้องตั้งก่อนถึงจะลงขายได้)
 *
 * 💡 ทำไมใช้ "ตัวเลือกในคำสั่งเดียวจบ" (slash command options) แทน modal สำหรับ /sell:
 * เพราะ modal ของ Discord "แนบไฟล์ไม่ได้เลย" (รับได้แค่ข้อความ) แต่ /sell ต้องให้แนบรูปสินค้า
 * และไฟล์ดิจิทัลได้ด้วย เลยต้องใช้ตัวเลือกแบบ attachment ในคำสั่งตรงๆ แทน
 *
 * 🔑 การจ่ายเงินเป็นแบบ "กึ่งอัตโนมัติ" เหมือนระบบ /referral เป๊ะๆ (ดูคำอธิบายเต็มใน
 * utils/marketplaceStorage.js หัวข้อ "หลักการสำคัญ") — บอทไม่แตะเงินเลย แค่สร้าง QR
 * PromptPay ของผู้ขายให้ผู้ซื้อสแกนจ่ายตรง แล้วรอผู้ขายกดยืนยันว่าได้รับเงินแล้วจริง
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
} = require('discord.js');
const {
  PROMPTPAY_ID_PATTERN,
  CATEGORIES,
  getSeller,
  saveSellerPromptPay,
  createListing,
  getListing,
  listSellerListings,
  setListingStatus,
  getOrder,
  saveOrderNotifyMessage,
  confirmOrder,
} = require('../utils/marketplaceStorage');
const { generatePromptPayQrBuffer } = require('../utils/promptpayQr');

// ปุ่ม "ยืนยันได้รับเงินแล้ว" ที่ DM ผู้ขาย — customId รูปแบบ mkt_confirm_<orderId>
const CONFIRM_BUTTON_PREFIX = 'mkt_confirm_';

// ราคาสูงสุดที่ยอมให้ตั้งได้ต่อชิ้น (กันพิมพ์เลข 0 เกินมาโดยไม่ตั้งใจ เช่น 99000 ทั้งที่ตั้งใจ
// จะพิมพ์ 990 — ปรับตัวเลขนี้ได้ทีหลังถ้าน้องหนาวอยากขายของราคาสูงกว่านี้จริงๆ)
const MAX_PRICE_THB = 20000;

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
        .setDescription('ตั้ง/แก้เลขพร้อมเพย์รับเงินค่าขายของ (ต้องตั้งก่อนถึงจะลงขายได้)')
        .addStringOption((opt) =>
          opt.setName('promptpay_id').setDescription('เบอร์มือถือพร้อมเพย์ 10 หลัก เช่น 0812345678').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'sell') return handleSell(interaction);
    if (sub === 'mylistings') return handleMyListings(interaction);
    if (sub === 'remove') return handleSetStatus(interaction, 'removed');
    if (sub === 'markselling') return handleSetStatus(interaction, 'active');
    if (sub === 'setpromptpay') return handleSetPromptPay(interaction);
  },

  // เรียกจาก index.js ตอนมีคนกดปุ่มที่ customId ขึ้นต้นด้วย mkt_
  async handleButton(interaction) {
    if (interaction.customId.startsWith(CONFIRM_BUTTON_PREFIX)) {
      return handleConfirmButton(interaction);
    }
  },

  // 🆕 ให้ server.js เรียกใช้ตอนผู้ซื้อกด "ซื้อ" บนหน้าเว็บ — สร้าง QR + DM แจ้งผู้ขาย
  notifySellerNewOrder,
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

  // ต้องตั้งเลขพร้อมเพย์ไว้ก่อนแล้วเท่านั้นถึงจะลงขายได้ — กันเคสลงขายเสร็จแล้วมีคนกดซื้อ
  // แต่บอทสร้าง QR ให้ไม่ได้เพราะไม่รู้จะสร้างจ่ายเข้าบัญชีไหน
  const seller = getSeller(interaction.user.id);
  if (!seller || !seller.promptpayId) {
    await interaction.reply({
      content: '❌ ต้องตั้งเลขพร้อมเพย์รับเงินก่อนถึงจะลงขายได้ครับ ใช้คำสั่ง `/marketplace setpromptpay` ตั้งค่าก่อน แล้วค่อยกลับมาลงขายใหม่',
      flags: MessageFlags.Ephemeral,
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
    digitalFileUrl: file ? file.url : null,
    imageUrl: image ? image.url : null,
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ ลงประกาศขายสำเร็จ')
    .setColor(0x4a5aa8)
    .setDescription(`**${listing.title}**\n${formatThb(listing.priceThb)} · ${categoryInfo.label}${subcategory ? ` / ${subcategory}` : ''}`)
    .addFields({ name: 'รหัสประกาศ', value: `\`${listing.id}\`` })
    .setFooter({ text: 'ตอนนี้ขึ้นขายจริงบนหน้าเว็บ Marketplace แล้ว — ดูสถานะ/ปิดขายได้ด้วย /marketplace mylistings' });

  if (image) embed.setThumbnail(image.url);

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
    content: `✅ บันทึกเลขพร้อมเพย์ \`${rawValue}\` เรียบร้อยครับ — ใช้เลขนี้สร้าง QR ให้ลูกค้าสแกนจ่ายตรงเข้าบัญชีนี้ทุกครั้งที่มีคนซื้อของจากคุณ`,
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
  if (!seller || !seller.promptpayId) {
    // ไม่ควรเกิดขึ้นจริง เพราะ /marketplace sell บังคับตั้งพร้อมเพย์ไว้ก่อนลงขายแล้ว
    // แต่เผื่อกรณีข้อมูลเพี้ยน กันไว้ก่อนดีกว่า
    return { notified: false, reason: 'no_promptpay_id' };
  }

  let qrBuffer;
  try {
    qrBuffer = await generatePromptPayQrBuffer(seller.promptpayId, order.priceThb);
  } catch (error) {
    console.warn(`[marketplace] สร้าง QR รับเงินให้ออร์เดอร์ ${order.id} ไม่สำเร็จ:`, error);
    return { notified: false, reason: 'qr_generation_failed' };
  }

  const embed = new EmbedBuilder()
    .setTitle('🛒 มีคนซื้อสินค้าของคุณ!')
    .setColor(0x4b8f87)
    .setDescription(
      `**${listing.title}**\n` +
      `ราคา: **${formatThb(order.priceThb)}**\n` +
      `ผู้ซื้อ: ${buyerInfo?.username || 'ไม่ทราบชื่อ'}\n\n` +
      'ระบบโชว์ QR อันเดียวกันนี้ให้ผู้ซื้อเห็นบนหน้าเว็บแล้ว (แนบมาให้ดูอ้างอิงด้วยเฉยๆ ' +
      'ไม่ต้องส่งต่อให้ใคร) รอเงินเข้าบัญชีพร้อมเพย์ของคุณจริง แล้วกด ' +
      '**"✅ ยืนยันได้รับเงินแล้ว"** ด้านล่างทันทีที่เห็นเงินเข้าครับ'
    )
    .setImage(`attachment://promptpay-${order.id}.png`)
    .setFooter({ text: `รหัสออร์เดอร์ ${order.id}` });

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
      files: [new AttachmentBuilder(qrBuffer, { name: `promptpay-${order.id}.png` })],
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
    if (listing && listing.type === 'digital' && listing.digitalFileUrl) {
      await buyerUser.send({
        content:
          `🎉 ผู้ขายยืนยันได้รับเงินแล้ว! นี่คือไฟล์ **${listing.title}** ที่คุณซื้อจาก Marketplace ของ Milo Bot ครับ`,
        files: [listing.digitalFileUrl],
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
