/**
 * commands/referral.js
 * ─────────────────────────────────────────────────────────────────────────
 * /referral — คำสั่งลับสำหรับเจ้าของบอทเท่านั้น ใช้จัดการ "ระบบโค้ดส่วนลดพ่อค้าแม่ค้า"
 * (referral campaign) ทั้งหมด มี 3 คำสั่งย่อย (subcommand):
 *
 *   /referral add       → สร้างโค้ดใหม่ให้ผู้ขาย 1 คน (บอทสร้าง Coupon + Promotion Code
 *                          ใน Stripe ให้อัตโนมัติเลย ไม่ต้องเข้าไปกดเองในเว็บ Stripe)
 *   /referral list       → ดูรายการโค้ดทั้งหมดที่เคยสร้างไว้ (พร้อมสถานะเปิด/ปิด)
 *   /referral summary     → สรุปยอดค่าคอมของแต่ละผู้ขาย ทั้งยอดตลอดกาลและยอดค้างจ่าย
 *   /referral deactivate  → ปิดใช้งานโค้ดอันใดอันหนึ่ง (เช่นผู้ขายเลิกทำ affiliate แล้ว)
 *   /referral markpaid    → ทำเครื่องหมายว่าโอนเงินค่าคอมของโค้ดนี้ให้ผู้ขายจริงแล้ว
 *
 * 🆕 ห้อง #referral-earnings ในเซิร์ฟควบคุม (ตาม GUILD_ID) จะมีการ์ดสรุปยอดของแต่ละโค้ด
 * อัปเดตแบบเรียลไทม์อัตโนมัติทุกครั้งที่มีการเปลี่ยนแปลง — ดู utils/referralReportChannel.js
 *
 * 🔒 เหมือน /dev เป๊ะๆ — เช็ค owner-only ก่อนทำอะไรทั้งนั้น เพราะคำสั่งนี้สร้าง Coupon
 * ใน Stripe ได้ (ถ้าหลุดไปถึงมือคนอื่น จะโดนสร้างโค้ดส่วนลดมั่วๆ ได้ไม่จำกัด)
 *
 * 💡 ทำไมให้บอทสร้าง Coupon/Promotion Code ใน Stripe เองแทนที่จะให้น้องหนาวไปกดเอง:
 * เพราะแคมเปญนี้จะมีผู้ขายเข้าร่วมเรื่อยๆ ทีละคน ถ้าต้องเข้า Stripe Dashboard ไปกดสร้าง
 * เองทุกครั้ง (Coupon 1 อัน + Promotion Code 1 อัน ต่อผู้ขาย 1 คน) จะช้าและเสี่ยงพิมพ์
 * ตั้งค่าไม่ตรงกัน (เช่น ลืมตั้ง duration=once) ให้บอททำให้ครบในคำสั่งเดียวจบเลยดีกว่า
 *
 * 🆕 อัปเดต 20 ก.ย. 2569 — แปลงข้อความที่ผู้ใช้เห็นจริง (คำอธิบายคำสั่ง/คำตอบ/error) ทั้งหมด
 * เป็นภาษาอังกฤษล้วนแล้ว ตามที่น้องหนาวขอ (คำสั่งนี้มีแค่น้องหนาวคนเดียวที่เห็น/รันได้ เลย
 * ไม่ต้องต่อกับระบบสลับภาษา th/en ของบอทเหมือนฟีเจอร์อื่น — เลือกภาษาเดียวไปเลยง่ายกว่า)
 * คอมเมนต์ในโค้ด (สำหรับน้องหนาวอ่านเอง) ยังเป็นภาษาไทยเหมือนเดิมทุกจุด ไม่ได้แปล — แปลแค่
 * ข้อความที่ไปโผล่บนดิสคอร์ดจริงๆ (คำอธิบาย option, ข้อความตอบกลับ, error) เท่านั้น
 */

const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const stripe = require('../utils/stripeClient');
const {
  saveCode,
  getActiveCode,
  deactivateCode,
  getCommissionSummary,
  getUnpaidCommissionSummary,
  markCommissionsPaid,
  listAllCodes,
  savePromptPayId,
  saveSellerGuildId,
  COMMISSION_PER_REDEMPTION_THB,
  PROMPTPAY_ID_PATTERN,
} = require('../utils/referralStorage');
// 🆕 ห้องรายงานยอดค่าคอมแบบเรียลไทม์ (ดูคำอธิบายเต็มในไฟล์นั้น) — เรียกทุกครั้งที่มีการ
// เปลี่ยนแปลงที่กระทบยอดของโค้ดใดโค้ดหนึ่ง (สร้างโค้ดใหม่ / ปิดใช้งาน / มีคนใช้โค้ดสำเร็จ)
// 🆕 [20 ก.ย. 2569] syncCodeReportMessage() ตอนนี้อัปเดตทั้งห้องเซิร์ฟควบคุมและห้องเซิร์ฟ
// ผู้ขาย (ถ้าตั้ง sellerGuildId ไว้) ในตัวเดียวแล้ว — ไม่ต้องเรียกเพิ่มอะไรเลย ส่วน
// postPayoutQrForCode() เป็นของใหม่ ใช้ตอนปิดโค้ด (handleDeactivate) เพื่อสร้าง+โพสต์ QR
// จ่ายเงินอัตโนมัติ (ดูคำอธิบายเต็มในไฟล์นั้น)
const { syncCodeReportMessage, postPayoutQrForCode } = require('../utils/referralReportChannel');
// 🆕 ตัวช่วยสร้าง QR PromptPay ให้ /referral payout (ดูคำอธิบายเต็มในไฟล์นั้น — ย้ำอีกที
// ว่าแค่สร้างรูป QR ให้สแกนจ่ายเร็วขึ้น ไม่ได้โอนเงินให้อัตโนมัติ)
const { generatePromptPayQrBuffer } = require('../utils/promptpayQr');

// โค้ดที่พ่อค้าแม่ค้าจะเอาไปแจกต้อง "จำง่าย พิมพ์ง่าย" — จำกัดรูปแบบไว้กันเผลอสร้าง
// โค้ดที่มีอักขระแปลกๆ (เช่น อีโมจิ, ช่องว่าง) ที่พิมพ์ยากตอนลูกค้ากรอกจริง
// อนุญาต: ตัวอักษรอังกฤษ A-Z, ตัวเลข 0-9, ยาว 3-20 ตัวอักษร
const CODE_PATTERN = /^[A-Z0-9]{3,20}$/;

// 📱 รูปแบบเลขพร้อมเพย์ที่รองรับ (ใช้สร้าง QR โอนเงินใน /referral payout): เบอร์มือถือ
// 10 หลัก (เช่น 0812345678) หรือเลขบัตรประชาชน 13 หลัก — ตัวเลขล้วนเท่านั้น ห้ามมีขีด/
// เว้นวรรค/เครื่องหมายอื่นปนมา (พิมพ์แบบนั้นมา promptpay-qr จะสร้าง QR ผิดพลาดทันที)
// 🆕 [20 ก.ย. 2569] ย้ายไปเก็บที่ utils/referralStorage.js จุดเดียวแล้ว (import ด้านบน) —
// กันไม่ให้กติกาเพี้ยนกันระหว่างคำสั่งลับนี้กับปุ่ม "Payment" self-service ใหม่ที่ผู้ขายกรอกเอง

// 🆕 [20 ก.ย. 2569] รูปแบบ ID เซิร์ฟของดิสคอร์ด (snowflake) — ตัวเลขล้วน 17-20 หลัก ใช้เช็ค
// ก่อนบันทึก sellerGuildId (ตอน /referral add หรือ /referral setguild) กันพิมพ์ผิด/วาง
// ค่าอื่นที่ไม่ใช่ ID เซิร์ฟเข้ามา — น้องหนาวได้ ID นี้จากการเปิด "โหมดนักพัฒนา" (Developer
// Mode) ในตั้งค่าดิสคอร์ดของตัวเองก่อน แล้วคลิกขวาที่ไอคอนเซิร์ฟนั้น → "Copy Server ID"
const GUILD_ID_PATTERN = /^\d{17,20}$/;

// 🎲 ชุดตัวอักษรไว้ "สุ่มโค้ด" ให้อัตโนมัติ — ใช้ตอนไม่ใส่ค่า code เอง (เช่น มีผู้ขาย
// เข้ามาพร้อมกันเยอะๆ ไม่มีเวลานั่งคิดชื่อโค้ดทีละคน) ตัด O, I, 0, 1 ออกจากชุดตัวอักษร
// ตั้งใจเลย เพราะหน้าตาคล้ายกันมาก (ตัว O กับเลข 0, ตัว I กับเลข 1) พิมพ์สับสนง่าย
// ตอนลูกค้าพิมพ์โค้ดจริงในมือถือ
const RANDOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RANDOM_CODE_LENGTH = 6; // สั้นพอจำ/พิมพ์ง่าย แต่ยาวพอกันชนกันเอง (32^6 ≈ 10^9 แบบ)

/**
 * สุ่มโค้ด 1 ชุด ความยาวตาม RANDOM_CODE_LENGTH จากชุดตัวอักษร RANDOM_CODE_ALPHABET
 * @returns {string}
 */
function generateRandomCode() {
  let code = '';
  for (let i = 0; i < RANDOM_CODE_LENGTH; i++) {
    code += RANDOM_CODE_ALPHABET[Math.floor(Math.random() * RANDOM_CODE_ALPHABET.length)];
  }
  return code;
}

module.exports = {
  // 🔒 ownerOnly: true — เหมือนใน dev.js เป๊ะๆ (ดูคอมเมนต์อธิบายละเอียดในไฟล์นั้น)
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName('referral')
    .setDescription('For development use only.')
    // ซ่อนคำสั่งนี้จากสมาชิก/แอดมินทั่วไปเหมือน /dev เป๊ะๆ (ดูคอมเมนต์อธิบายละเอียดใน dev.js)
    .setDefaultMemberPermissions(0)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Create a new referral code')
        .addStringOption((opt) =>
          opt.setName('seller')
            .setDescription('Seller label to show in reports, e.g. @kittyarts')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('The code text, e.g. KITTY10 — leave empty to auto-generate one')
            .setRequired(false)
        )
        .addUserOption((opt) =>
          opt.setName('seller_discord_user')
            .setDescription('Seller\'s Discord account, so the bot can DM them when their code is used')
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt.setName('discount_thb')
            .setDescription('Discount amount in THB, default 10 (99 -> 89)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
        .addStringOption((opt) =>
          opt.setName('promptpay_id')
            .setDescription('Seller\'s PromptPay phone number (10 digits), for payout QR later')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('seller_guild_id')
            .setDescription('Seller\'s own Discord server ID — posts earnings report there too (bot must be a member)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list')
        .setDescription('List all referral codes')
    )
    .addSubcommand((sub) =>
      sub.setName('summary')
        .setDescription('Show commission totals per seller')
    )
    .addSubcommand((sub) =>
      sub.setName('deactivate')
        .setDescription('Turn off a referral code')
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('The code to deactivate')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('markpaid')
        .setDescription('Mark a code\'s pending commission as paid out for real')
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('The code you just paid the seller for')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('setpromptpay')
        .setDescription('Set or update a seller\'s PromptPay ID for payout QR codes')
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('The code to set the PromptPay ID for')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('promptpay_id')
            .setDescription('10-digit PromptPay phone number')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('payout')
        .setDescription('Generate PromptPay QR codes for outstanding commissions')
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('Only generate for this code (leave empty for everyone with an unpaid balance)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('setguild')
        .setDescription('Set or update the seller\'s own Discord server for their earnings channel')
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('The code to set the seller\'s server for')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('guild_id')
            .setDescription('The seller\'s Discord server ID (bot must already be a member)')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    // ── เช็ค owner-only ก่อนทำอะไรทั้งนั้น (เหมือน /dev เป๊ะๆ) ──────────────────
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({
        content: '❌ This command is not available.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      return handleAdd(interaction);
    }
    if (sub === 'list') {
      return handleList(interaction);
    }
    if (sub === 'summary') {
      return handleSummary(interaction);
    }
    if (sub === 'deactivate') {
      return handleDeactivate(interaction);
    }
    if (sub === 'markpaid') {
      return handleMarkPaid(interaction);
    }
    if (sub === 'setpromptpay') {
      return handleSetPromptPay(interaction);
    }
    if (sub === 'payout') {
      return handlePayout(interaction);
    }
    if (sub === 'setguild') {
      return handleSetGuild(interaction);
    }
  },
};

/**
 * /referral add — จุดที่ซับซ้อนที่สุดของไฟล์นี้: ต้องยิง Stripe API 2 ครั้งติดกัน
 * (สร้าง Coupon ก่อน แล้วเอา coupon.id ไปสร้าง Promotion Code ต่อ) เลยต้อง deferReply()
 * ก่อนเสมอ เผื่อเน็ตช้าเกิน 3 วินาทีที่ Discord ให้มา (pattern เดียวกับ premium.js)
 *
 * 🆕 option "code" ตอนนี้ "ไม่บังคับ" แล้ว — ถ้าไม่ใส่มา บอทจะสุ่มโค้ดสั้นๆ ให้เองอัตโนมัติ
 * (ดู generateRandomCode() ด้านบน) เหมาะกับตอนมีผู้ขายเข้ามาพร้อมกันเยอะๆ ไม่มีเวลานั่งคิด
 * ชื่อโค้ดทีละคน — ถ้าอยากได้โค้ดที่เป็นเอกลักษณ์ของผู้ขายคนนั้นๆ (เช่นมีความหมาย/จำง่าย/
 * เอาไปโปรโมทต่อได้) ยังพิมพ์ระบุเองได้ตามปกติทุกอย่าง ไม่ได้ถูกบังคับให้สุ่มเสมอไป
 */
async function handleAdd(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rawCode = interaction.options.getString('code');
  const sellerLabel = interaction.options.getString('seller').trim();
  const sellerUser = interaction.options.getUser('seller_discord_user');
  const discountThb = interaction.options.getInteger('discount_thb') ?? 10;
  const rawPromptPayId = interaction.options.getString('promptpay_id');
  const rawSellerGuildId = interaction.options.getString('seller_guild_id');

  // เช็ครูปแบบเลขพร้อมเพย์ก่อนเลย (ถ้าใส่มา) — เช็คตั้งแต่ต้นก่อนไปยิง Stripe API เลย
  // กันเสียเวลาสร้าง Coupon/Promotion Code ไปแล้วแต่ดันพิมพ์เลขพร้อมเพย์ผิดรูปแบบทีหลัง
  let promptpayId = null;
  if (rawPromptPayId) {
    promptpayId = rawPromptPayId.trim();
    if (!PROMPTPAY_ID_PATTERN.test(promptpayId)) {
      return interaction.editReply({
        content: `❌ Invalid PromptPay ID "${rawPromptPayId}" — enter a 10-digit mobile phone number (digits only, no dashes/spaces), and it must be the number already registered with PromptPay at the bank (not just any number of the right length). You can leave it empty for now and set it later with /referral setpromptpay.`,
      });
    }
  }

  // 🆕 [20 ก.ย. 2569] เช็ครูปแบบ ID เซิร์ฟผู้ขายก่อนเลยเหมือนกัน (ถ้าใส่มา) — ยังไม่เช็คว่า
  // บอทเข้าเซิร์ฟนั้นได้จริงไหมตรงนี้ (เดี๋ยว syncCodeReportMessage() ท้ายฟังก์ชันจะลองสร้าง
  // ห้องให้เอง ถ้าเข้าไม่ได้จะ log warning ไว้เฉยๆ ไม่ทำให้คำสั่งนี้ทั้งคำสั่งพังตาม)
  let sellerGuildId = null;
  if (rawSellerGuildId) {
    sellerGuildId = rawSellerGuildId.trim();
    if (!GUILD_ID_PATTERN.test(sellerGuildId)) {
      return interaction.editReply({
        content: `❌ Invalid server ID "${rawSellerGuildId}" — it should be a 17-20 digit number (right-click the server icon with Developer Mode on → Copy Server ID). You can leave it empty for now and set it later with /referral setguild.`,
      });
    }
  }

  let code;
  let autoGenerated = false;

  if (rawCode) {
    // ── กรณีพิมพ์โค้ดเอง (เหมือนเดิมทุกอย่าง) ──────────────────────────────
    code = rawCode.trim().toUpperCase();

    if (!CODE_PATTERN.test(code)) {
      return interaction.editReply({
        content: `❌ Invalid code "${rawCode}" — only letters A-Z and digits 0-9 are allowed, 3-20 characters long (no spaces or special characters).`,
      });
    }

    // กันสร้างซ้ำทับโค้ดเดิมที่ยังใช้งานอยู่โดยไม่ตั้งใจ (เผลอพิมพ์โค้ดเดิมอีกรอบ)
    // ถ้าอยากแก้ไขโค้ดเดิมจริงๆ ให้ deactivate ตัวเก่าก่อนแล้วค่อย add ใหม่
    const existing = getActiveCode(code);
    if (existing) {
      return interaction.editReply({
        content: `❌ Code "${code}" already exists and is still active (owner: ${existing.sellerLabel}) — deactivate the old one with \`/referral deactivate\` first if you want to reuse it.`,
      });
    }
  } else {
    // ── กรณีไม่ใส่โค้ดมา → สุ่มให้เองอัตโนมัติ ─────────────────────────────
    // เช็คชนกับโค้ด "ทั้งหมด" ที่เคยมี (ไม่ว่าจะเปิด/ปิดใช้งานอยู่ก็ตาม) เพราะเป็นโค้ด
    // สุ่มใหม่เอี่ยม ไม่มีเหตุผลต้องไปชนกับของเก่าเลยแม้แต่โค้ดที่ปิดไปแล้ว — ลองสุ่มสูงสุด
    // 10 รอบกันชนซ้ำ (โอกาสชนจริงต่ำมากอยู่แล้ว เพราะสุ่มได้เกือบพันล้านแบบ)
    const existingCodes = new Set(listAllCodes().map((c) => c.code));
    let attempt = 0;
    do {
      code = generateRandomCode();
      attempt += 1;
    } while (existingCodes.has(code) && attempt < 10);

    if (existingCodes.has(code)) {
      return interaction.editReply({
        content: '❌ Failed to generate a random code (too many collisions with existing codes). Please try running the command again.',
      });
    }
    autoGenerated = true;
  }

  try {
    // 1) สร้าง Coupon — ส่วนลดตายตัวเป็นจำนวนเงิน (ไม่ใช่ %), currency THB,
    //    amount_off หน่วยเป็น "สตางค์" (Stripe บังคับ) เลยต้อง ×100
    //    duration: 'once' = ลดแค่ "บิลแรกที่ใช้โค้ด" เท่านั้น บิลเดือนถัดไปกลับราคาเต็ม
    //    อัตโนมัติทันที ไม่ต้องเขียนโค้ดอะไรเพิ่มเลยสักบรรทัด — Stripe จัดการให้เอง
    const coupon = await stripe.coupons.create({
      amount_off: discountThb * 100,
      currency: 'thb',
      duration: 'once',
      name: `Referral: ${sellerLabel}`,
    });

    // 2) สร้าง Promotion Code ผูกกับ Coupon ด้านบน — นี่คือ "ตัวโค้ดจริง" ที่จะเอาไปแนบ
    //    เข้า Checkout Session ตอนลูกค้ากรอกโค้ดผ่านบอท (ดู commands/premium.js)
    //    active: true = เปิดใช้งานทันที
    //
    //    🆕 18 ก.ย. 2569: Stripe อัปเดต API เวอร์ชันใหม่ (stripe-version: 2026-07-29
    //    เป็นต้นไป) เปลี่ยนวิธีผูก Promotion Code เข้ากับ Coupon — เดิมส่ง `coupon: id`
    //    เป็นพารามิเตอร์ตรงๆ ได้เลย แต่เวอร์ชันใหม่ต้องห่อเป็น object `promotion` ก่อน
    //    (ระบุ `type: 'coupon'` แล้วค่อยใส่ `coupon: id` ข้างใน) ไม่งั้น Stripe จะโยน
    //    error "Received unknown parameter: coupon" ทันที เพราะพารามิเตอร์ระดับบนสุด
    //    ชื่อ `coupon` เลิกใช้แล้ว — ดูเอกสารล่าสุด: https://docs.stripe.com/api/promotion_codes/create
    const promotionCode = await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code,
      active: true,
    });

    // 3) บันทึกลงไฟล์ของเราเอง (referral-codes.json) — ผูก code ↔ seller ↔ Stripe IDs
    saveCode(code, {
      sellerLabel,
      sellerDiscordId: sellerUser?.id ?? null,
      stripeCouponId: coupon.id,
      stripePromotionCodeId: promotionCode.id,
      promptpayId,
      // 🆕 [21 ก.ย. 2569] ถ้าใส่เลขพร้อมเพย์มาตั้งแต่ตอนสร้างโค้ดเลย ให้นับว่าแอดมินที่รันคำสั่งนี้
      // คือคน "ตั้งค่าล่าสุด" ครั้งแรก — ขึ้น audit trail บนการ์ดได้ทันทีไม่ต้องรอแก้ทีหลัง
      promptpayUpdatedBy: interaction.user.id,
      sellerGuildId,
    });

    // 4) 🆕 โพสต์การ์ดรายงานยอดของโค้ดนี้ในห้อง referral-earnings ทันที (เริ่มที่ 0
    // ครั้ง/0 บาท) จะได้เห็นว่าโค้ดนี้มีอยู่ในห้องรายงานตั้งแต่สร้างเสร็จ ไม่ต้องรอให้มี
    // คนใช้โค้ดก่อนถึงจะโผล่ — syncCodeReportMessage() ดักทุก error ไว้ในตัวเองแล้ว
    // (ไม่มีทาง throw ออกมา) เลยไม่ต้องห่อ try/catch เพิ่มตรงนี้ ปลอดภัยกับ flow การสร้าง
    // โค้ดหลักแน่นอน
    await syncCodeReportMessage(interaction.client, code);

    return interaction.editReply({
      content:
        `✅ Created code **${code}**${autoGenerated ? ' (auto-generated)' : ''} for **${sellerLabel}**.\n` +
        `• Discount: ${discountThb} THB (99 → ${99 - discountThb} THB), applied once at signup\n` +
        `• Price returns to normal automatically the following month (no need to re-enter the code)\n` +
        `• Each server can only use this code once (needs a new code for repeat use)\n` +
        `• Every time this code is used successfully, ${sellerLabel} earns ${COMMISSION_PER_REDEMPTION_THB} THB commission` +
        (sellerUser ? ` (the bot will DM ${sellerUser} automatically)` : ' (no Discord account linked, so no DM notification — check totals via /referral summary)') +
        (promptpayId
          ? `\n• PromptPay ID is set — use /referral payout to generate a payout QR for this seller`
          : `\n• PromptPay ID not set yet — set it later with /referral setpromptpay code:${code}`) +
        (sellerGuildId
          ? `\n• Their earnings report will also be posted in their own server (#${'partner-earnings'}) — check there in a moment; if it doesn't show up, make sure the bot is a member of that server with Manage Channels permission`
          : `\n• Not posting to a seller-owned server yet — set one later with /referral setguild code:${code} guild_id:XXX`),
    });
  } catch (error) {
    console.error('[referral add] สร้าง Coupon/Promotion Code ที่ Stripe ไม่สำเร็จ:', error);
    return interaction.editReply({
      content: `❌ Failed to create the code (Stripe error: ${error.message})`,
    });
  }
}

/**
 * /referral list — โชว์รายการโค้ดทั้งหมด ไม่ต้องยิง Stripe API เลย (อ่านจากไฟล์เราเองล้วนๆ)
 */
async function handleList(interaction) {
  const codes = listAllCodes();

  if (codes.length === 0) {
    return interaction.reply({
      content: 'No codes yet. Try creating one with `/referral add` first.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // เรียงโค้ดที่ยังเปิดใช้งานขึ้นก่อน แล้วค่อยตามด้วยโค้ดที่ปิดไปแล้ว
  const sorted = [...codes].sort((a, b) => Number(b.active) - Number(a.active));

  const lines = sorted.map((c) => {
    const status = c.active ? '🟢 Active' : '🔴 Inactive';
    return `${status} **${c.code}** — ${c.sellerLabel}`;
  });

  return interaction.reply({
    content: `**All Referral Codes (${codes.length})**\n${lines.join('\n')}`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * /referral summary — สรุปยอดค่าคอมของแต่ละโค้ด (ให้น้องหนาวเอาไปโอนเงินจริงให้ผู้ขาย)
 * อ่านจาก commissionLog ที่ webhook เป็นคนเขียนเข้ามาตอนมีคนจ่ายเงินสำเร็จจริงเท่านั้น
 * (ไม่ใช่แค่กรอกโค้ด) เพราะงั้นตัวเลขตรงนี้เชื่อถือได้ว่า "จ่ายเงินจริงแล้ว" ทุกแถว
 *
 * 🆕 แสดง 2 ยอดแยกกันต่อผู้ขาย: "ตลอดกาล" (รวมทุกครั้งที่เคยใช้โค้ดสำเร็จ ไม่หักส่วน
 * ที่จ่ายไปแล้ว) กับ "ค้างจ่าย" (เฉพาะส่วนที่ยังไม่เคยโอนเงินจริง — ตัวเลขที่ต้องดูตอนจะ
 * โอนเงินรอบนี้) — พอโอนเงินจริงเสร็จแล้ว ให้มากด `/referral markpaid code:XXX` เพื่อ
 * เคลียร์ยอดค้างจ่ายของโค้ดนั้น ไม่งั้นรอบหน้าจะขึ้นยอดเดิมซ้ำอีก
 */
async function handleSummary(interaction) {
  const lifetimeSummary = getCommissionSummary();

  if (lifetimeSummary.length === 0) {
    return interaction.reply({
      content: 'No one has used a code yet — total commission is 0 THB.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // แปลงยอด "ค้างจ่าย" เป็น map ตามโค้ด เพื่อเอาไปต่อท้ายแต่ละแถวของยอดตลอดกาลด้านบน
  const unpaidByCode = new Map(getUnpaidCommissionSummary().map((u) => [u.code, u.totalCommissionThb]));

  const lines = lifetimeSummary.map((s) => {
    const unpaidThb = unpaidByCode.get(s.code) ?? 0;
    return (
      `**${s.sellerLabel}** (code ${s.code}) — used ${s.totalUses} times (lifetime) = ${s.totalCommissionThb} THB ` +
      `| unpaid: **${unpaidThb} THB**`
    );
  });
  const grandUnpaidTotal = [...unpaidByCode.values()].reduce((sum, thb) => sum + thb, 0);

  return interaction.reply({
    content:
      `**Commission Summary**\n${lines.join('\n')}\n\n` +
      `💰 Total to pay out right now: **${grandUnpaidTotal} THB**\n` +
      `-# After transferring money to a seller, remember to run /referral markpaid code:XXX to clear their unpaid balance.`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * /referral deactivate — ปิดโค้ด (แค่ในไฟล์ของเราเอง ไม่ได้ไปปิดที่ Stripe ด้วย
 * เพราะเช็ค "เปิด/ปิด" จากไฟล์เราเองก่อนเสมอตอนลูกค้ากรอกโค้ดผ่านบอทอยู่แล้ว —
 * ดู commands/premium.js → getActiveCode() คืน null ถ้า active = false ทันที)
 *
 * 🆕 [20 ก.ย. 2569] หลังปิดโค้ดแล้ว จะเรียก postPayoutQrForCode() ต่อทันที (ตามที่น้องหนาว
 * อยากได้ "ระบบกึ่งอัตโนมัติตอนสิ้นเดือน") — ถ้าโค้ดนี้มียอดค้างจ่าย + ตั้งเลขพร้อมเพย์ไว้
 * แล้ว บอทจะสร้าง QR แล้วโพสต์เข้าห้องรายงานยอดทั้งสองที่ (เซิร์ฟควบคุม + เซิร์ฟผู้ขายถ้ามี)
 * ให้อัตโนมัติเลย ไม่ต้องมารัน /referral payout เองอีกที — ⚠️ ย้ำอีกรอบ: นี่ไม่ใช่การตัด
 * เงินอัตโนมัติจริง น้องหนาวยังต้องสแกน QR จ่ายเองผ่านแอปธนาคาร แค่ขั้นตอน "สร้าง + โพสต์"
 * ทำให้อัตโนมัติแล้วเท่านั้น (ดูคำอธิบายเต็มใน postPayoutQrForCode() ที่ referralReportChannel.js)
 */
async function handleDeactivate(interaction) {
  const code = interaction.options.getString('code').trim().toUpperCase();
  const ok = deactivateCode(code);

  if (!ok) {
    return interaction.reply({
      content: `❌ Code "${code}" not found.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 🆕 อัปเดตการ์ดในห้องรายงานยอดให้ขึ้นสถานะ "🔴 ปิดใช้งานแล้ว" ทันที (real-time
  // ตามที่น้องหนาวขอ — นับเป็น "การเปลี่ยนแปลง" ที่ต้องอัปเดตห้องรายงานด้วยเหมือนกัน)
  await syncCodeReportMessage(interaction.client, code);

  // 🆕 ลองสร้าง+โพสต์ QR จ่ายเงินอัตโนมัติต่อทันที (ดูคอมเมนต์ด้านบนฟังก์ชัน) — ฟังก์ชันนี้
  // ไม่ throw เลย คืน object บอกผลลัพธ์แทน เอามาแปลงเป็นข้อความบอกน้องหนาวว่าเกิดอะไรขึ้น
  const payoutResult = await postPayoutQrForCode(interaction.client, code);
  let payoutNote;
  if (payoutResult.posted) {
    const locations = [
      payoutResult.postedToControlGuild ? 'control server' : null,
      payoutResult.postedToSellerGuild ? "seller's server" : null,
    ].filter(Boolean).join(' and ');
    payoutNote = `\n💳 Posted a payout QR for **${payoutResult.amountThb} THB** to the ${locations} earnings channel${payoutResult.postedToControlGuild && payoutResult.postedToSellerGuild ? 's' : ''}.`;
  } else if (payoutResult.reason === 'no_promptpay_id') {
    payoutNote = `\n⚠️ This code has an unpaid balance of **${payoutResult.amountThb} THB**, but no PromptPay ID is set — set one with /referral setpromptpay to auto-generate a payout QR next time.`;
  } else {
    payoutNote = ''; // ไม่มียอดค้างจ่าย — ไม่ต้องพูดถึงเรื่องนี้เพิ่ม
  }

  return interaction.reply({
    content: `✅ Deactivated code **${code}** (usage history is preserved).${payoutNote}`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * 🆕 /referral markpaid — ทำเครื่องหมายว่า "โอนเงินค่าคอมของโค้ดนี้ให้ผู้ขายจริงแล้ว"
 * ใช้หลังน้องหนาวโอนเงินผ่าน PromptPay/ธนาคารเองเสร็จเรียบร้อย (บอทไม่ได้โอนเงินให้เอง
 * นะครับ แค่บันทึกไว้กันสับสนว่าจ่ายไปแล้วหรือยัง) — ทำให้ /referral summary รอบถัดไป
 * ไม่โชว์ยอดเดิมซ้ำอีก
 */
async function handleMarkPaid(interaction) {
  const code = interaction.options.getString('code').trim().toUpperCase();
  const { count, totalThb } = markCommissionsPaid(code);

  if (count === 0) {
    return interaction.reply({
      content: `ℹ️ Code "${code}" has no unpaid balance (it may already be fully paid, or nobody has used it successfully yet).`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `✅ Marked ${count} redemption(s) of code **${code}** as paid, totaling **${totalThb} THB** — this code's unpaid balance is now cleared.`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * 🆕 /referral setpromptpay — ตั้ง/แก้เลขพร้อมเพย์ของผู้ขายคนนึง (โค้ดนึง) ทีหลังได้
 * เผื่อตอนสร้างโค้ดด้วย /referral add ยังไม่รู้เลขพร้อมเพย์ หรือผู้ขายเปลี่ยนเลขทีหลัง
 * ต้องตั้งเลขนี้ไว้ก่อนถึงจะใช้ /referral payout สร้าง QR ให้คนนี้ได้นะครับ
 */
async function handleSetPromptPay(interaction) {
  const code = interaction.options.getString('code').trim().toUpperCase();
  const promptpayId = interaction.options.getString('promptpay_id').trim();

  if (!PROMPTPAY_ID_PATTERN.test(promptpayId)) {
    return interaction.reply({
      content: `❌ Invalid PromptPay ID "${promptpayId}" — enter a 10-digit mobile phone number (digits only, no dashes/spaces), and it must be the number already registered with PromptPay at the bank (not just any number of the right length).`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const codeEntry = listAllCodes().find((c) => c.code === code);
  if (!codeEntry) {
    return interaction.reply({
      content: `❌ Code "${code}" not found.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 🆕 [21 ก.ย. 2569] ส่ง ID ของแอดมินที่รันคำสั่งนี้ไปด้วย ให้ขึ้น audit trail บนการ์ดว่าใครแก้ล่าสุด
  savePromptPayId(code, promptpayId, interaction.user.id);

  return interaction.reply({
    content: `✅ Set the PromptPay ID for code **${code}** (${codeEntry.sellerLabel}) — you can now use \`/referral payout\` to generate a payout QR for this seller.`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * 🆕 [20 ก.ย. 2569] /referral setguild — ตั้ง/แก้ "ID เซิร์ฟของผู้ขายเอง" ทีหลังได้ เผื่อ
 * ตอนสร้างโค้ดด้วย /referral add ยังไม่รู้ ID เซิร์ฟ หรือผู้ขายเปลี่ยนเซิร์ฟทีหลัง — เช็คก่อน
 * ว่าบอทเข้าเซิร์ฟนั้นได้จริงไหม (ผ่าน client.guilds.fetch()) ก่อนบันทึก กันตั้งค่า ID ผิด/
 * เซิร์ฟที่บอทไม่ได้อยู่ไปเงียบๆ โดยไม่รู้ตัว — ถ้าเช็คผ่าน จะ sync การ์ดเข้าเซิร์ฟนั้นทันที
 */
async function handleSetGuild(interaction) {
  const code = interaction.options.getString('code').trim().toUpperCase();
  const guildId = interaction.options.getString('guild_id').trim();

  if (!GUILD_ID_PATTERN.test(guildId)) {
    return interaction.reply({
      content: `❌ Invalid server ID "${guildId}" — it should be a 17-20 digit number (right-click the server icon with Developer Mode on → Copy Server ID).`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const codeEntry = listAllCodes().find((c) => c.code === code);
  if (!codeEntry) {
    return interaction.reply({
      content: `❌ Code "${code}" not found.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // เช็คก่อนบันทึกว่าบอทเข้าเซิร์ฟนี้ได้จริงไหม — กันตั้งค่า ID ผิด/เซิร์ฟที่บอทไม่ได้อยู่
  // ไปเงียบๆ โดยไม่รู้ตัว (ถ้าไม่เช็คตรงนี้ จะไปเจอ error ตอน sync ในพื้นหลังแทน ซึ่งไม่มีใคร
  // เห็นนอกจาก Railway logs)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await interaction.client.guilds.fetch(guildId);
  } catch (error) {
    return interaction.editReply({
      content: `❌ The bot isn't a member of server "${guildId}" (or the ID is wrong) — invite the bot to that server first, then try again. (${error.message})`,
    });
  }

  saveSellerGuildId(code, guildId);
  await syncCodeReportMessage(interaction.client, code);

  return interaction.editReply({
    content: `✅ Set the seller's server for code **${code}** (${codeEntry.sellerLabel}) — their earnings report has been posted to #partner-earnings in that server. Make sure the bot has Manage Channels permission there if it didn't appear.`,
  });
}

/**
 * 🆕 /referral payout — สร้างรูป QR PromptPay ให้ทุกโค้ดที่ยังมียอดค้างจ่ายอยู่ (หรือ
 * เฉพาะโค้ดเดียวถ้าใส่ตัวเลือก code มา) เพื่อให้น้องหนาวสแกนโอนเงินได้เร็วขึ้น — ตัวช่วยนี้
 * "ไม่ได้โอนเงินอัตโนมัติ" นะครับ (ดูคำอธิบายเต็มๆ ที่ utils/promptpayQr.js) แค่สร้าง QR
 * ที่มียอดเงินฝังไว้ในตัวให้แสกนจ่ายเองเร็วขึ้น
 *
 * ข้อจำกัดของดิสคอร์ด: 1 ข้อความแนบไฟล์ได้สูงสุด 10 ไฟล์ — ถ้ามีคนค้างจ่ายเกิน 10 คน
 * จะสร้าง QR ให้ก่อน 10 คนแรก แล้วบอกให้รันคำสั่งซ้ำอีกรอบสำหรับคนที่เหลือ
 */
async function handlePayout(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const filterCode = interaction.options.getString('code');
  const unpaidSummary = getUnpaidCommissionSummary();

  if (unpaidSummary.length === 0) {
    return interaction.editReply({ content: 'No unpaid balances — everyone has been paid in full. 🎉' });
  }

  const codeInfoMap = new Map(listAllCodes().map((c) => [c.code, c]));

  let targets = unpaidSummary;
  if (filterCode) {
    const normalized = filterCode.trim().toUpperCase();
    targets = targets.filter((s) => s.code === normalized);
    if (targets.length === 0) {
      return interaction.editReply({
        content: `❌ Code "${normalized}" has no unpaid balance (check with /referral summary).`,
      });
    }
  }

  // แยกกลุ่ม: คนที่มีเลขพร้อมเพย์แล้ว (สร้าง QR ได้) กับคนที่ยังไม่มี (ต้องแจ้งให้ไปตั้งก่อน)
  const withPromptPay = [];
  const missingPromptPay = [];
  for (const s of targets) {
    const info = codeInfoMap.get(s.code);
    if (info?.promptpayId) {
      withPromptPay.push(s);
    } else {
      missingPromptPay.push(s);
    }
  }

  const MAX_ATTACHMENTS = 10; // ข้อจำกัดของดิสคอร์ด — 1 ข้อความแนบไฟล์ได้สูงสุด 10 ไฟล์
  const toGenerate = withPromptPay.slice(0, MAX_ATTACHMENTS);
  const overflowCount = withPromptPay.length - toGenerate.length;

  const files = [];
  const lines = [];

  for (const s of toGenerate) {
    const info = codeInfoMap.get(s.code);
    try {
      const qrBuffer = await generatePromptPayQrBuffer(info.promptpayId, s.totalCommissionThb);
      files.push(new AttachmentBuilder(qrBuffer, { name: `promptpay-${s.code}.png` }));
      lines.push(`🟢 **${s.code}** — ${s.sellerLabel}: ${s.totalCommissionThb} THB`);
    } catch (error) {
      console.error(`[referral payout] สร้าง QR ให้โค้ด ${s.code} ไม่สำเร็จ:`, error);
      lines.push(`⚠️ **${s.code}** — ${s.sellerLabel}: ${s.totalCommissionThb} THB (failed to generate QR)`);
    }
  }

  let content =
    `**PromptPay QR Codes for Commission Payouts** (${toGenerate.length} seller(s))\n${lines.join('\n')}\n\n` +
    `After scanning and paying, remember to run \`/referral markpaid code:XXX\` for each code you've paid out.`;

  if (overflowCount > 0) {
    content += `\n\n⚠️ There are ${overflowCount} more seller(s) without a generated QR (Discord limits attachments to 10 files per message) — run \`/referral payout\` again for the rest.`;
  }

  if (missingPromptPay.length > 0) {
    const missingLines = missingPromptPay.map(
      (s) => `**${s.code}** — ${s.sellerLabel}: ${s.totalCommissionThb} THB`
    );
    content += `\n\n❌ These ${missingPromptPay.length} seller(s) don't have a PromptPay ID set yet (set one first with \`/referral setpromptpay\`):\n${missingLines.join('\n')}`;
  }

  return interaction.editReply({ content, files });
}
