/**
 * commands/referral.js
 * ─────────────────────────────────────────────────────────────────────────
 * /referral — คำสั่งลับสำหรับเจ้าของบอทเท่านั้น ใช้จัดการ "ระบบโค้ดส่วนลดพ่อค้าแม่ค้า"
 * (referral campaign) ทั้งหมด มี 3 คำสั่งย่อย (subcommand):
 *
 *   /referral add       → สร้างโค้ดใหม่ให้ผู้ขาย 1 คน (บอทสร้าง Coupon + Promotion Code
 *                          ใน Stripe ให้อัตโนมัติเลย ไม่ต้องเข้าไปกดเองในเว็บ Stripe)
 *   /referral list       → ดูรายการโค้ดทั้งหมดที่เคยสร้างไว้ (พร้อมสถานะเปิด/ปิด)
 *   /referral summary     → สรุปยอดค่าคอมที่ต้องจ่ายให้แต่ละผู้ขาย (เอาไปโอนเงินจริง)
 *   /referral deactivate  → ปิดใช้งานโค้ดอันใดอันหนึ่ง (เช่นผู้ขายเลิกทำ affiliate แล้ว)
 *
 * 🔒 เหมือน /dev เป๊ะๆ — เช็ค owner-only ก่อนทำอะไรทั้งนั้น เพราะคำสั่งนี้สร้าง Coupon
 * ใน Stripe ได้ (ถ้าหลุดไปถึงมือคนอื่น จะโดนสร้างโค้ดส่วนลดมั่วๆ ได้ไม่จำกัด)
 *
 * 💡 ทำไมให้บอทสร้าง Coupon/Promotion Code ใน Stripe เองแทนที่จะให้น้องหนาวไปกดเอง:
 * เพราะแคมเปญนี้จะมีผู้ขายเข้าร่วมเรื่อยๆ ทีละคน ถ้าต้องเข้า Stripe Dashboard ไปกดสร้าง
 * เองทุกครั้ง (Coupon 1 อัน + Promotion Code 1 อัน ต่อผู้ขาย 1 คน) จะช้าและเสี่ยงพิมพ์
 * ตั้งค่าไม่ตรงกัน (เช่น ลืมตั้ง duration=once) ให้บอททำให้ครบในคำสั่งเดียวจบเลยดีกว่า
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const stripe = require('../utils/stripeClient');
const {
  saveCode,
  getActiveCode,
  deactivateCode,
  getCommissionSummary,
  listAllCodes,
  COMMISSION_PER_REDEMPTION_THB,
} = require('../utils/referralStorage');

// โค้ดที่พ่อค้าแม่ค้าจะเอาไปแจกต้อง "จำง่าย พิมพ์ง่าย" — จำกัดรูปแบบไว้กันเผลอสร้าง
// โค้ดที่มีอักขระแปลกๆ (เช่น อีโมจิ, ช่องว่าง) ที่พิมพ์ยากตอนลูกค้ากรอกจริง
// อนุญาต: ตัวอักษรอังกฤษ A-Z, ตัวเลข 0-9, ยาว 3-20 ตัวอักษร
const CODE_PATTERN = /^[A-Z0-9]{3,20}$/;

module.exports = {
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
            .setDescription('The code text, e.g. KITTY10')
            .setDescriptionLocalizations({ th: 'ตัวโค้ด เช่น KITTY10 (ตัวอักษร A-Z และตัวเลขเท่านั้น)' })
            .setRequired(true)
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
  },
};

/**
 * /referral add — จุดที่ซับซ้อนที่สุดของไฟล์นี้: ต้องยิง Stripe API 2 ครั้งติดกัน
 * (สร้าง Coupon ก่อน แล้วเอา coupon.id ไปสร้าง Promotion Code ต่อ) เลยต้อง deferReply()
 * ก่อนเสมอ เผื่อเน็ตช้าเกิน 3 วินาทีที่ Discord ให้มา (pattern เดียวกับ premium.js)
 */
async function handleAdd(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rawCode = interaction.options.getString('code');
  const code = rawCode.trim().toUpperCase();
  const sellerLabel = interaction.options.getString('seller').trim();
  const sellerUser = interaction.options.getUser('seller_discord_user');
  const discountThb = interaction.options.getInteger('discount_thb') ?? 10;

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
    });

    return interaction.editReply({
      content:
        `✅ สร้างโค้ด **${code}** ให้ **${sellerLabel}** เรียบร้อยครับ\n` +
        `• ส่วนลด: ${discountThb} บาท (99 → ${99 - discountThb} บาท) ครั้งเดียวตอนสมัคร\n` +
        `• เดือนถัดไปกลับราคาปกติอัตโนมัติ (ไม่ต้องกรอกโค้ดซ้ำ)\n` +
        `• เซิร์ฟไหนใช้โค้ดนี้ไปแล้ว จะใช้ซ้ำอีกไม่ได้ (ต้องรอโค้ดใหม่)\n` +
        `• ทุกครั้งที่มีคนใช้โค้ดนี้สำเร็จ ${sellerLabel} จะได้ค่าคอม ${COMMISSION_PER_REDEMPTION_THB} บาท` +
        (sellerUser ? ` (บอทจะ DM แจ้ง ${sellerUser} ให้อัตโนมัติ)` : ' (ยังไม่ได้ผูกบัญชีดิสคอร์ด เลยจะไม่มี DM แจ้ง เช็คยอดได้ผ่าน /referral summary)'),
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
 */
async function handleSummary(interaction) {
  const summary = getCommissionSummary();

  if (summary.length === 0) {
    return interaction.reply({
      content: 'ยังไม่มีใครใช้โค้ดสำเร็จเลยครับ ยอดค่าคอมตอนนี้คือ 0 บาท',
      flags: MessageFlags.Ephemeral,
    });
  }

  const lines = summary.map(
    (s) => `**${s.sellerLabel}** (โค้ด ${s.code}) — ใช้ไปแล้ว ${s.totalUses} ครั้ง = **${s.totalCommissionThb} บาท**`
  );
  const grandTotal = summary.reduce((sum, s) => sum + s.totalCommissionThb, 0);

  return interaction.reply({
    content: `**สรุปค่าคอมที่ต้องจ่าย**\n${lines.join('\n')}\n\nรวมทั้งหมด: **${grandTotal} บาท**`,
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

  return interaction.reply({
    content: `✅ ปิดใช้งานโค้ด **${code}** แล้วครับ (ประวัติการใช้เดิมยังอยู่ครบ)`,
    flags: MessageFlags.Ephemeral,
  });
}
