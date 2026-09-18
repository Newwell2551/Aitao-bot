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
  COMMISSION_PER_REDEMPTION_THB,
} = require('../utils/referralStorage');
// 🆕 ห้องรายงานยอดค่าคอมแบบเรียลไทม์ (ดูคำอธิบายเต็มในไฟล์นั้น) — เรียกทุกครั้งที่มีการ
// เปลี่ยนแปลงที่กระทบยอดของโค้ดใดโค้ดหนึ่ง (สร้างโค้ดใหม่ / ปิดใช้งาน / มีคนใช้โค้ดสำเร็จ)
const { syncCodeReportMessage } = require('../utils/referralReportChannel');
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
const PROMPTPAY_ID_PATTERN = /^\d{10}$|^\d{13}$/;

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
    .setDescriptionLocalizations({ th: 'สำหรับนักพัฒนาเท่านั้นครับ' })
    // ซ่อนคำสั่งนี้จากสมาชิก/แอดมินทั่วไปเหมือน /dev เป๊ะๆ (ดูคอมเมนต์อธิบายละเอียดใน dev.js)
    .setDefaultMemberPermissions(0)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Create a new referral code')
        .setDescriptionLocalizations({ th: 'สร้างโค้ดส่วนลดใหม่ให้ผู้ขาย 1 คนครับ' })
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('The code text, e.g. KITTY10 — leave empty to auto-generate one')
            .setDescriptionLocalizations({ th: 'ตัวโค้ด เช่น KITTY10 (ตัวอักษร A-Z และตัวเลขเท่านั้น) — ไม่ใส่ = ให้บอทสุ่มให้อัตโนมัติ' })
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('seller')
            .setDescription('Seller label to show in reports, e.g. @kittyarts')
            .setDescriptionLocalizations({ th: 'ชื่อ/แฮนเดิลผู้ขาย ใช้โชว์ในรายงานครับ เช่น @kittyarts' })
            .setRequired(true)
        )
        .addUserOption((opt) =>
          opt.setName('seller_discord_user')
            .setDescription('Seller\'s Discord account, so the bot can DM them when their code is used')
            .setDescriptionLocalizations({ th: 'บัญชีดิสคอร์ดของผู้ขาย (ใส่ไว้บอทจะ DM แจ้งตอนมีคนใช้โค้ดครับ ไม่ใส่ก็ได้)' })
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt.setName('discount_thb')
            .setDescription('Discount amount in THB, default 10 (99 -> 89)')
            .setDescriptionLocalizations({ th: 'ส่วนลดกี่บาท ไม่ใส่ = 10 บาท (99 → 89) ครับ' })
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
        .addStringOption((opt) =>
          opt.setName('promptpay_id')
            .setDescription('Seller\'s PromptPay ID (10-digit phone or 13-digit citizen ID), for payout QR later')
            .setDescriptionLocalizations({ th: 'เลขพร้อมเพย์ผู้ขาย (เบอร์มือถือ 10 หลัก หรือเลขบัตร ปชช. 13 หลัก) ไว้สร้าง QR โอนเงินทีหลัง — ไม่ใส่ตอนนี้ก็ได้ ตั้งทีหลังได้ด้วย /referral setpromptpay' })
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list')
        .setDescription('List all referral codes')
        .setDescriptionLocalizations({ th: 'ดูรายการโค้ดทั้งหมดครับ' })
    )
    .addSubcommand((sub) =>
      sub.setName('summary')
        .setDescription('Show commission totals per seller')
        .setDescriptionLocalizations({ th: 'สรุปค่าคอมที่ต้องจ่ายแต่ละผู้ขายครับ' })
    )
    .addSubcommand((sub) =>
      sub.setName('deactivate')
        .setDescription('Turn off a referral code')
        .setDescriptionLocalizations({ th: 'ปิดใช้งานโค้ดอันใดอันหนึ่งครับ' })
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('The code to deactivate')
            .setDescriptionLocalizations({ th: 'โค้ดที่จะปิดใช้งานครับ' })
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('markpaid')
        .setDescription('Mark a code\'s pending commission as paid out for real')
        .setDescriptionLocalizations({ th: 'ทำเครื่องหมายว่าโอนเงินค่าคอมของโค้ดนี้ให้ผู้ขายจริงแล้ว' })
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('The code you just paid the seller for')
            .setDescriptionLocalizations({ th: 'โค้ดที่เพิ่งโอนเงินให้ผู้ขายไปครับ' })
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('setpromptpay')
        .setDescription('Set or update a seller\'s PromptPay ID for payout QR codes')
        .setDescriptionLocalizations({ th: 'ตั้ง/แก้ไขเลขพร้อมเพย์ของผู้ขายโค้ดนี้ ไว้สร้าง QR โอนเงินครับ' })
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('The code to set the PromptPay ID for')
            .setDescriptionLocalizations({ th: 'โค้ดที่จะตั้งเลขพร้อมเพย์ให้ครับ' })
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('promptpay_id')
            .setDescription('10-digit phone number or 13-digit citizen ID')
            .setDescriptionLocalizations({ th: 'เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลักครับ' })
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('payout')
        .setDescription('Generate PromptPay QR codes for outstanding commissions')
        .setDescriptionLocalizations({ th: 'สร้าง QR PromptPay สำหรับยอดค้างจ่าย (ไม่ใส่โค้ด = สร้างให้ทุกคนที่ค้างจ่าย)' })
        .addStringOption((opt) =>
          opt.setName('code')
            .setDescription('Only generate for this code (leave empty for everyone with an unpaid balance)')
            .setDescriptionLocalizations({ th: 'ระบุโค้ดถ้าอยากได้แค่คนเดียว ไม่ใส่ = สร้างให้ทุกคนที่ค้างจ่ายครับ' })
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    // ── เช็ค owner-only ก่อนทำอะไรทั้งนั้น (เหมือน /dev เป๊ะๆ) ──────────────────
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({
        content: '❌ คำสั่งนี้ไม่สามารถใช้งานได้ครับ',
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

  // เช็ครูปแบบเลขพร้อมเพย์ก่อนเลย (ถ้าใส่มา) — เช็คตั้งแต่ต้นก่อนไปยิง Stripe API เลย
  // กันเสียเวลาสร้าง Coupon/Promotion Code ไปแล้วแต่ดันพิมพ์เลขพร้อมเพย์ผิดรูปแบบทีหลัง
  let promptpayId = null;
  if (rawPromptPayId) {
    promptpayId = rawPromptPayId.trim();
    if (!PROMPTPAY_ID_PATTERN.test(promptpayId)) {
      return interaction.editReply({
        content: `❌ เลขพร้อมเพย์ "${rawPromptPayId}" รูปแบบไม่ถูกต้องครับ — ใส่ได้แค่เบอร์มือถือ 10 หลัก (เช่น 0812345678) หรือเลขบัตรประชาชน 13 หลักเท่านั้น (ตัวเลขล้วน ไม่มีขีด/เว้นวรรค) ไม่ใส่ตอนนี้ก็ได้ ตั้งทีหลังได้ด้วย /referral setpromptpay`,
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
        content: `❌ โค้ด "${rawCode}" รูปแบบไม่ถูกต้องครับ — ใช้ได้แค่ตัวอักษร A-Z กับตัวเลข 0-9 ยาว 3-20 ตัว (ไม่มีช่องว่าง/อักขระพิเศษ)`,
      });
    }

    // กันสร้างซ้ำทับโค้ดเดิมที่ยังใช้งานอยู่โดยไม่ตั้งใจ (เผลอพิมพ์โค้ดเดิมอีกรอบ)
    // ถ้าอยากแก้ไขโค้ดเดิมจริงๆ ให้ deactivate ตัวเก่าก่อนแล้วค่อย add ใหม่
    const existing = getActiveCode(code);
    if (existing) {
      return interaction.editReply({
        content: `❌ โค้ด "${code}" มีอยู่แล้วและยังเปิดใช้งานอยู่ครับ (เจ้าของ: ${existing.sellerLabel}) — ถ้าจะสร้างใหม่ทับ ต้อง \`/referral deactivate\` อันเดิมก่อนนะครับ`,
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
        content: '❌ สุ่มโค้ดไม่สำเร็จครับ (ชนโค้ดเดิมซ้ำหลายรอบเกินไป) ลองรันคำสั่งใหม่อีกครั้งนะครับ',
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
    const promotionCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
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
    });

    // 4) 🆕 โพสต์การ์ดรายงานยอดของโค้ดนี้ในห้อง referral-earnings ทันที (เริ่มที่ 0
    // ครั้ง/0 บาท) จะได้เห็นว่าโค้ดนี้มีอยู่ในห้องรายงานตั้งแต่สร้างเสร็จ ไม่ต้องรอให้มี
    // คนใช้โค้ดก่อนถึงจะโผล่ — syncCodeReportMessage() ดักทุก error ไว้ในตัวเองแล้ว
    // (ไม่มีทาง throw ออกมา) เลยไม่ต้องห่อ try/catch เพิ่มตรงนี้ ปลอดภัยกับ flow การสร้าง
    // โค้ดหลักแน่นอน
    await syncCodeReportMessage(interaction.client, code);

    return interaction.editReply({
      content:
        `✅ สร้างโค้ด **${code}**${autoGenerated ? ' (สุ่มให้อัตโนมัติครับ)' : ''} ให้ **${sellerLabel}** เรียบร้อยครับ\n` +
        `• ส่วนลด: ${discountThb} บาท (99 → ${99 - discountThb} บาท) ครั้งเดียวตอนสมัคร\n` +
        `• เดือนถัดไปกลับราคาปกติอัตโนมัติ (ไม่ต้องกรอกโค้ดซ้ำ)\n` +
        `• เซิร์ฟไหนใช้โค้ดนี้ไปแล้ว จะใช้ซ้ำอีกไม่ได้ (ต้องรอโค้ดใหม่)\n` +
        `• ทุกครั้งที่มีคนใช้โค้ดนี้สำเร็จ ${sellerLabel} จะได้ค่าคอม ${COMMISSION_PER_REDEMPTION_THB} บาท` +
        (sellerUser ? ` (บอทจะ DM แจ้ง ${sellerUser} ให้อัตโนมัติ)` : ' (ยังไม่ได้ผูกบัญชีดิสคอร์ด เลยจะไม่มี DM แจ้ง เช็คยอดได้ผ่าน /referral summary)') +
        (promptpayId
          ? `\n• ตั้งเลขพร้อมเพย์ไว้แล้ว — ใช้ /referral payout สร้าง QR โอนเงินให้คนนี้ได้เลยครับ`
          : `\n• ยังไม่ได้ตั้งเลขพร้อมเพย์ — ตั้งทีหลังได้ด้วย /referral setpromptpay code:${code}`),
    });
  } catch (error) {
    console.error('[referral add] สร้าง Coupon/Promotion Code ที่ Stripe ไม่สำเร็จ:', error);
    return interaction.editReply({
      content: `❌ สร้างโค้ดไม่สำเร็จครับ (Stripe error: ${error.message})`,
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
      content: 'ยังไม่มีโค้ดในระบบเลยครับ ลองสร้างด้วย `/referral add` ก่อนนะครับ',
      flags: MessageFlags.Ephemeral,
    });
  }

  // เรียงโค้ดที่ยังเปิดใช้งานขึ้นก่อน แล้วค่อยตามด้วยโค้ดที่ปิดไปแล้ว
  const sorted = [...codes].sort((a, b) => Number(b.active) - Number(a.active));

  const lines = sorted.map((c) => {
    const status = c.active ? '🟢 เปิด' : '🔴 ปิด';
    return `${status} **${c.code}** — ${c.sellerLabel}`;
  });

  return interaction.reply({
    content: `**รายการโค้ดทั้งหมด (${codes.length} โค้ด)**\n${lines.join('\n')}`,
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
      content: 'ยังไม่มีใครใช้โค้ดสำเร็จเลยครับ ยอดค่าคอมตอนนี้คือ 0 บาท',
      flags: MessageFlags.Ephemeral,
    });
  }

  // แปลงยอด "ค้างจ่าย" เป็น map ตามโค้ด เพื่อเอาไปต่อท้ายแต่ละแถวของยอดตลอดกาลด้านบน
  const unpaidByCode = new Map(getUnpaidCommissionSummary().map((u) => [u.code, u.totalCommissionThb]));

  const lines = lifetimeSummary.map((s) => {
    const unpaidThb = unpaidByCode.get(s.code) ?? 0;
    return (
      `**${s.sellerLabel}** (โค้ด ${s.code}) — ใช้ไปแล้ว ${s.totalUses} ครั้ง (ตลอดกาล) = ${s.totalCommissionThb} บาท ` +
      `| ค้างจ่าย: **${unpaidThb} บาท**`
    );
  });
  const grandUnpaidTotal = [...unpaidByCode.values()].reduce((sum, thb) => sum + thb, 0);

  return interaction.reply({
    content:
      `**สรุปค่าคอม**\n${lines.join('\n')}\n\n` +
      `💰 รวมยอดที่ต้องโอนตอนนี้: **${grandUnpaidTotal} บาท**\n` +
      `-# โอนเงินจริงให้ผู้ขายแล้วอย่าลืมกด /referral markpaid code:XXX เพื่อเคลียร์ยอดค้างจ่ายด้วยนะครับ`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * /referral deactivate — ปิดโค้ด (แค่ในไฟล์ของเราเอง ไม่ได้ไปปิดที่ Stripe ด้วย
 * เพราะเช็ค "เปิด/ปิด" จากไฟล์เราเองก่อนเสมอตอนลูกค้ากรอกโค้ดผ่านบอทอยู่แล้ว —
 * ดู commands/premium.js → getActiveCode() คืน null ถ้า active = false ทันที)
 */
async function handleDeactivate(interaction) {
  const code = interaction.options.getString('code').trim().toUpperCase();
  const ok = deactivateCode(code);

  if (!ok) {
    return interaction.reply({
      content: `❌ ไม่เจอโค้ด "${code}" ในระบบเลยครับ`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 🆕 อัปเดตการ์ดในห้องรายงานยอดให้ขึ้นสถานะ "🔴 ปิดใช้งานแล้ว" ทันที (real-time
  // ตามที่น้องหนาวขอ — นับเป็น "การเปลี่ยนแปลง" ที่ต้องอัปเดตห้องรายงานด้วยเหมือนกัน)
  await syncCodeReportMessage(interaction.client, code);

  return interaction.reply({
    content: `✅ ปิดใช้งานโค้ด **${code}** แล้วครับ (ประวัติการใช้เดิมยังอยู่ครบ)`,
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
      content: `ℹ️ โค้ด "${code}" ไม่มียอดค้างจ่ายเลยครับ (อาจจะจ่ายไปหมดแล้ว หรือยังไม่มีคนใช้โค้ดนี้สำเร็จเลย)`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: `✅ ทำเครื่องหมายว่าจ่ายแล้วให้โค้ด **${code}** จำนวน ${count} ครั้ง รวม **${totalThb} บาท** ครับ — ยอดค้างจ่ายของโค้ดนี้เคลียร์เรียบร้อย`,
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
      content: `❌ เลขพร้อมเพย์ "${promptpayId}" รูปแบบไม่ถูกต้องครับ — ใส่ได้แค่เบอร์มือถือ 10 หลัก (เช่น 0812345678) หรือเลขบัตรประชาชน 13 หลักเท่านั้น (ตัวเลขล้วน ไม่มีขีด/เว้นวรรค)`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const codeEntry = listAllCodes().find((c) => c.code === code);
  if (!codeEntry) {
    return interaction.reply({
      content: `❌ ไม่เจอโค้ด "${code}" ในระบบเลยครับ`,
      flags: MessageFlags.Ephemeral,
    });
  }

  savePromptPayId(code, promptpayId);

  return interaction.reply({
    content: `✅ ตั้งเลขพร้อมเพย์ของโค้ด **${code}** (${codeEntry.sellerLabel}) เรียบร้อยครับ — ใช้ \`/referral payout\` สร้าง QR โอนเงินให้คนนี้ได้แล้ว`,
    flags: MessageFlags.Ephemeral,
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
    return interaction.editReply({ content: 'ไม่มียอดค้างจ่ายเลยครับ ทุกคนได้รับเงินครบแล้ว 🎉' });
  }

  const codeInfoMap = new Map(listAllCodes().map((c) => [c.code, c]));

  let targets = unpaidSummary;
  if (filterCode) {
    const normalized = filterCode.trim().toUpperCase();
    targets = targets.filter((s) => s.code === normalized);
    if (targets.length === 0) {
      return interaction.editReply({
        content: `❌ โค้ด "${normalized}" ไม่มียอดค้างจ่ายเลยครับ (เช็คด้วย /referral summary ได้)`,
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
      lines.push(`🟢 **${s.code}** — ${s.sellerLabel}: ${s.totalCommissionThb} บาท`);
    } catch (error) {
      console.error(`[referral payout] สร้าง QR ให้โค้ด ${s.code} ไม่สำเร็จ:`, error);
      lines.push(`⚠️ **${s.code}** — ${s.sellerLabel}: ${s.totalCommissionThb} บาท (สร้าง QR ไม่สำเร็จ)`);
    }
  }

  let content =
    `**QR PromptPay สำหรับโอนเงินค่าคอม** (${toGenerate.length} คน)\n${lines.join('\n')}\n\n` +
    `สแกนจ่ายแล้วอย่าลืมกด \`/referral markpaid code:XXX\` ทีละโค้ดที่โอนเสร็จด้วยนะครับ`;

  if (overflowCount > 0) {
    content += `\n\n⚠️ มีอีก ${overflowCount} คนที่ยังไม่ได้สร้าง QR ให้ (ดิสคอร์ดจำกัดไฟล์แนบสูงสุด 10 ไฟล์/ข้อความ) รัน \`/referral payout\` อีกรอบสำหรับคนที่เหลือ`;
  }

  if (missingPromptPay.length > 0) {
    const missingLines = missingPromptPay.map(
      (s) => `**${s.code}** — ${s.sellerLabel}: ${s.totalCommissionThb} บาท`
    );
    content += `\n\n❌ ยังไม่มีเลขพร้อมเพย์ให้ ${missingPromptPay.length} คนนี้ (ตั้งก่อนด้วย \`/referral setpromptpay\`):\n${missingLines.join('\n')}`;
  }

  return interaction.editReply({ content, files });
}
