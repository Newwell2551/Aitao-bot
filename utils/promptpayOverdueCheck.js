// utils/promptpayOverdueCheck.js
// ─────────────────────────────────────────────────────────────────────────
// 🆕 [22 ก.ย. 2569] ปิดช่องโหว่ที่บันทึกไว้ใน claude/premium-web-checkout-promptpay.md:
// "ถ้าลูกค้าฝั่ง PromptPay เพิกเฉยไม่จ่ายใบแจ้งหนี้รอบต่ออายุเลย ตอนนี้ยังไม่มีระบบดีดกลับ
// เป็น free อัตโนมัติ"
//
// ทำไมถึงต้องมีไฟล์นี้แยกต่างหาก (ไม่ใช่แค่ webhook เฉยๆ เหมือนทางบัตรเครดิต):
// ทางบัตรเครดิต (collection_method: 'charge_automatically' ค่าเริ่มต้นของ Stripe) พอบัตร
// ถูกปฏิเสธ Stripe จะ "รีทรายเก็บเงินเองอัตโนมัติ" ตามรอบที่ตั้งไว้ใน Dashboard แล้วพอรีทราย
// ครบทุกครั้งไม่สำเร็จเลย ถึงจะยิง webhook `customer.subscription.deleted` มาบอกให้เราดีดเป็น
// free (ดู server.js เคสนี้) — แต่ทาง PromptPay ใช้ `collection_method: 'send_invoice'` แทน
// (ลูกค้าต้องสแกน QR จ่ายเอง Stripe เก็บเงินอัตโนมัติไม่ได้) ซึ่ง Stripe **ไม่มีกลไกรีทราย/
// ยกเลิกอัตโนมัติให้เลย** ถ้าลูกค้าไม่จ่ายตามกำหนด (due_date) ใบแจ้งหนี้ก็แค่ "ค้างเป็น open"
// อยู่แบบนั้นตลอดไป ไม่มี webhook ไหนยิงมาบอกเราเองว่า "เลยกำหนดแล้วนะ" — ต้องมีคนมา "เดินตรวจ"
// เองเป็นระยะๆ นี่คือหน้าที่ของไฟล์นี้ครับ (เรียกจาก index.js แบบตั้งเวลารันซ้ำ ดูคอมเมนต์ท้าย
// ไฟล์ index.js ประกอบ)
//
// วิธีทำงาน (สรุปสั้นๆ ก่อนอ่านโค้ด):
// 1. ถาม Stripe ตรงๆ ว่า "มีใบแจ้งหนี้ไหนบ้างที่เป็นแบบ send_invoice (ทาง PromptPay) และ
//    ยังไม่จ่าย (status: open)" — ไม่ใช้ข้อมูลจากไฟล์ guild-tiers.json ของบอทเองเป็นตัวตั้ง
//    เพราะ Stripe คือ "ความจริง" ที่สุดว่าใครจ่ายจริงจ่ายปลอมแค่ไหน
// 2. กรองเอาเฉพาะใบที่ "due_date ผ่านมาแล้ว" (เลยกำหนดจ่ายจริง ไม่ใช่แค่ open เฉยๆ เพราะใบ
//    ล่าสุดของคนที่ยังไม่ถึงกำหนดจ่ายก็ status: open เหมือนกัน แค่ยังไม่เลยกำหนด)
// 3. แต่ละใบที่เลยกำหนด → หา guildId จาก subscription ที่ผูกอยู่ → ถ้า guild นั้นยังเป็น
//    premium อยู่จริง (กันดีดซ้ำ/ดีด guild ที่จ่ายไปแล้วทางอื่น) → ดีดเป็น free + ยกเลิก
//    subscription ใน Stripe (กันไม่ให้ยังออกใบแจ้งหนี้ใบใหม่มาเรื่อยๆ ทั้งที่เลิกใช้แล้ว) +
//    DM แจ้งลูกค้าให้สแกนจ่ายใหม่ถ้าอยากใช้พรีเมียมต่อ

const stripe = require('./stripeClient');
const { getGuildTier, setGuildTier, getSubscriptionInfo, setSubscriptionInfo } = require('./tierManager');
const { getGuildLanguage } = require('./languageStorage');
const { createTranslator } = require('./i18n');

// 🔒 กัน "รันซ้อนกัน" — เผื่อรอบก่อนหน้ายังไม่ทันเสร็จ (เช่น Stripe ตอบช้าผิดปกติ เพราะ
// เซิร์ฟที่ยังใช้ PromptPay เยอะขึ้นเรื่อยๆ ในอนาคต) แล้ว setInterval ยิงรอบใหม่มาซ้อนทับ
// ถ้าไม่กันไว้ อาจดีด guild เดียวกันซ้ำ 2 รอบพร้อมกัน หรือยิง DM ซ้ำ 2 ฉบับได้
let isRunning = false;

/**
 * ไล่ตรวจใบแจ้งหนี้ PromptPay ที่เลยกำหนดจ่ายทั้งหมด แล้วดีด guild ที่เกี่ยวข้องกลับเป็น free
 * ออกแบบให้ "ไม่มีทาง throw หลุดออกไปนอกฟังก์ชัน" เลย (ครอบทุกจุดเสี่ยงด้วย try/catch)
 * เพราะฟังก์ชันนี้ถูกเรียกจาก setInterval ที่ไม่มีใครรอดัก error อยู่ปลายทาง — ถ้าปล่อยให้
 * throw หลุดจาก setInterval callback จะกลายเป็น unhandled exception ทำบอททั้งตัวล่มได้
 *
 * @param {import('discord.js').Client} client
 */
async function checkOverduePromptPayInvoices(client) {
  if (isRunning) {
    console.log('[promptpayOverdueCheck] รอบก่อนหน้ายังไม่เสร็จ ข้ามรอบนี้ไปก่อน');
    return;
  }
  isRunning = true;

  console.log('[promptpayOverdueCheck] เริ่มตรวจใบแจ้งหนี้ PromptPay ที่เลยกำหนดจ่าย...');
  let downgradedCount = 0;
  let checkedCount = 0;

  try {
    // stripe.invoices.list(...) คืน object ที่รองรับ "for await...of" เดินหน้าทีละหน้า
    // (auto-pagination) ในตัวเลย — ไม่ต้องเขียน loop ดึงทีละ 100 ใบเอง SDK จัดการให้หมด
    // (Stripe Node SDK เวอร์ชัน 22.x รองรับฟีเจอร์นี้)
    const invoices = stripe.invoices.list({
      collection_method: 'send_invoice', // เอาเฉพาะทาง PromptPay (บัตรใช้ charge_automatically)
      status: 'open',                    // ยังไม่จ่าย (paid/void/uncollectible ไม่เอา)
      limit: 100,
    });

    for await (const invoice of invoices) {
      checkedCount++;

      // ใบที่ไม่มี due_date (ไม่ควรเกิดกับ send_invoice แต่กันไว้เผื่อ Stripe เปลี่ยนพฤติกรรม)
      // หรือยังไม่เลยกำหนดจ่ายจริงๆ (แค่ status เป็น open เฉยๆ) → ข้ามไป ไม่ใช่เคสที่ต้องดีด
      if (!invoice.due_date) continue;
      const dueDateMs = invoice.due_date * 1000; // Stripe ให้เป็นวินาที ต้องคูณ 1000 ก่อนเทียบกับ Date.now()
      if (dueDateMs >= Date.now()) continue;

      // ⚠️ วิธีอ่าน subscription ID จาก invoice เดียวกับที่ใช้ใน server.js (webhook
      // invoice.payment_succeeded) — Stripe ย้าย field นี้ไปซ้อนใน parent.subscription_details
      // ตั้งแต่ API เวอร์ชัน Basil เป็นต้นมา ถ้าอ่าน invoice.subscription ตรงๆ จะได้ undefined เงียบๆ
      const subscriptionId = invoice.parent?.type === 'subscription_details'
        ? invoice.parent.subscription_details?.subscription
        : null;
      if (!subscriptionId) continue; // ใบแจ้งหนี้ที่ไม่ได้ผูกกับ subscription เลย ไม่เกี่ยวกับพรีเมียม

      let subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (fetchError) {
        // subscription อาจถูกลบไปแล้วจริงๆ (เช่นคนละ error path เก่า) — ข้ามใบนี้ไป ไม่ทำให้
        // รอบตรวจทั้งหมดพัง
        console.warn(`[promptpayOverdueCheck] ดึง subscription ${subscriptionId} ไม่สำเร็จ:`, fetchError.message);
        continue;
      }

      const guildId = subscription.metadata?.guildId;
      if (!guildId) continue; // subscription เก่าที่ไม่มี metadata guildId (ไม่ควรเกิดกับของใหม่)

      // กันดีดซ้ำ: ถ้า guild นี้ไม่ใช่ premium อยู่แล้ว (เช่นเดือนก่อนโดนดีดไปแล้ว แต่ใบเก่า
      // ยังค้างสถานะ open อยู่ใน Stripe เพราะเรายังไม่ได้ void มันทิ้ง) ไม่ต้องทำอะไรซ้ำ
      if (getGuildTier(guildId) !== 'premium') continue;

      // 🔒 กันเคสเดียวกับที่ webhook customer.subscription.deleted กันไว้: subscription
      // ที่ผูกกับใบนี้อาจเป็น "ของเก่า" ที่ถูกแทนที่ด้วย subscription ใหม่ไปแล้ว (เช่นลูกค้า
      // ยกเลิกแล้วสมัครใหม่ทันที) ถ้า stripeSubscriptionId ที่บันทึกไว้ล่าสุดไม่ตรงกับใบนี้
      // แปลว่านี่คือ subscription เก่าที่ตายไปแล้ว ไม่ควรไปยุ่งกับ guild ที่จ่ายรอบใหม่อยู่
      const currentInfo = getSubscriptionInfo(guildId);
      if (currentInfo && currentInfo.stripeSubscriptionId !== subscription.id) {
        console.log(
          `[promptpayOverdueCheck] guild ${guildId} มีใบแจ้งหนี้ค้างของ subscription เก่า ` +
          `(${subscription.id}) ที่ถูกแทนที่ไปแล้วด้วย ${currentInfo.stripeSubscriptionId} — ข้าม`
        );
        continue;
      }

      // ═══ ถึงตรงนี้ = ยืนยันแล้วว่าเป็น guild premium จริง ที่ค้างจ่ายเกินกำหนดจริง ═══
      console.log(`[promptpayOverdueCheck] guild ${guildId} ค้างจ่ายใบแจ้งหนี้ ${invoice.id} เกินกำหนด (due_date: ${new Date(dueDateMs).toLocaleDateString()}) → ดีดเป็น free`);

      setGuildTier(guildId, 'free');
      if (currentInfo) {
        setSubscriptionInfo(guildId, { ...currentInfo, currentPeriodEnd: null });
      }

      // ยกเลิก subscription ใน Stripe ด้วย — กันไม่ให้ Stripe ยังสร้างใบแจ้งหนี้รอบถัดๆ ไป
      // ให้ guild ที่เลิกใช้แล้วอีกเรื่อยๆ (ไม่ยกเลิกใบเก่าที่เลยกำหนดทิ้ง ปล่อยเป็นประวัติ
      // ยอดค้างจ่ายไว้เฉยๆ ใน Stripe ก็ได้ ไม่กระทบอะไร — แค่ไม่อยากให้มีใบใหม่งอกมาเพิ่ม)
      try {
        await stripe.subscriptions.cancel(subscription.id);
      } catch (cancelError) {
        // อาจถูกยกเลิกไปแล้วจากทางอื่น (เช่นแอดมินกดยกเลิกเองใน Stripe Dashboard) — ไม่ใช่ปัญหา
        console.warn(`[promptpayOverdueCheck] ยกเลิก subscription ${subscription.id} ไม่สำเร็จ (อาจถูกยกเลิกไปแล้ว):`, cancelError.message);
      }

      // DM แจ้งลูกค้า — ใช้ pattern เดียวกับ webhook อื่นๆ ใน server.js (ดึงภาษาของเซิร์ฟ
      // + createTranslator) ครอบ try/catch เดี่ยวๆ กันส่ง DM ไม่ได้ (เช่นปิด DM จากคนไม่รู้จัก)
      // ทำให้ทั้งฟังก์ชันพัง
      const discordUserId = subscription.metadata?.discordUserId;
      if (discordUserId) {
        try {
          const t = createTranslator(getGuildLanguage(guildId));
          const guild = client.guilds.cache.get(guildId);
          const guildName = guild?.name ?? guildId;
          const user = await client.users.fetch(discordUserId);
          await user.send(t('premium.dm.promptpay_expired', { guildName }));
        } catch (dmError) {
          console.warn('[promptpayOverdueCheck] ส่ง DM แจ้งเตือนไม่สำเร็จ:', dmError.message);
        }
      }

      downgradedCount++;
    }

    console.log(`[promptpayOverdueCheck] ตรวจครบแล้ว (เช็ค ${checkedCount} ใบ, ดีดเป็น free ${downgradedCount} เซิร์ฟ)`);
  } catch (error) {
    // จุดดักสุดท้าย — ถ้ามีอะไรพังที่ไม่คาดคิดเลย (เช่น Stripe API ล่มทั้งระบบชั่วคราว)
    // log ไว้เฉยๆ ไม่ throw ต่อ กันบอททั้งตัวล่มเพราะงานเบื้องหลังจุดนี้จุดเดียว
    console.error('[promptpayOverdueCheck] เกิดข้อผิดพลาดไม่คาดคิดระหว่างตรวจ:', error);
  } finally {
    isRunning = false;
  }
}

module.exports = { checkOverduePromptPayInvoices };
