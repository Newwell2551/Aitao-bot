// server.js
// ─────────────────────────────────────────────────────────────────────────
// Express server เล็กๆ ที่มีหน้าที่เดียว: รับ "webhook" จาก Stripe
//
// webhook คืออะไร? — ปกติตอนลูกค้าจ่ายเงินสำเร็จ Discord bot ของเราไม่มีทางรู้เองเลย
// เพราะเงินมันวิ่งไปที่ Stripe ไม่ได้วิ่งผ่านบอทเรา ดังนั้น Stripe จะ "ยิง HTTP request"
// มาบอกเราเองทุกครั้งที่มีเหตุการณ์สำคัญเกิดขึ้น (จ่ายเงินสำเร็จ / ยกเลิก / ต่ออายุ ฯลฯ)
// server.js คือ "จุดรับสาย" ของ request พวกนั้น
//
// ⚠️ ต้องรันคู่กับบอท (ไม่ใช่คนละโปรเจกต์แยกกัน) เพราะพอ webhook มาถึง เราต้อง
// เข้าถึง client (Discord bot instance ตัวเดียวกับที่ล็อกอินอยู่) เพื่อส่ง DM แจ้งเตือน
// ผู้ใช้ทันทีตอนสมัครพรีเมียมสำเร็จ (ดู case checkout.session.completed ด้านล่าง)
// ─────────────────────────────────────────────────────────────────────────

const express = require('express');
const { TextDisplayBuilder, MessageFlags } = require('discord.js');
const stripe = require('./utils/stripeClient');
const { setGuildTier, setSubscriptionInfo, getSubscriptionInfo } = require('./utils/tierManager');
const { getGuildLanguage } = require('./utils/languageStorage');
const { createTranslator } = require('./utils/i18n');
// การ์ดพรีเมียมตัวเดียวกับที่ /premium ใช้ (ดูคอมเมนต์ในไฟล์นั้นสำหรับเหตุผล
// ที่แยกออกมาเป็น util กลาง) เอามาใช้ตรงนี้เพื่อให้ DM แจ้งเตือนตอนสมัคร
// สำเร็จ หน้าตาตรงกับการ์ดใน /premium เป๊ะๆ ไม่ต้องคอยแก้พร้อมกัน 2 ที่
const { buildPremiumCard } = require('./utils/buildPremiumCard');

/**
 * สร้าง Express app พร้อม route /webhook ไว้รับ Stripe
 * @param {import('discord.js').Client} client Discord bot client ตัวเดียวกับที่ล็อกอินอยู่
 * @returns {import('express').Express}
 */
function createWebhookServer(client) {
  const app = express();

  // ⚠️ จุดสำคัญที่สุดของทั้งไฟล์: express.raw({ type: 'application/json' })
  //
  // ปกติเราจะใช้ express.json() เพื่อแปลง request body เป็น object ให้อ่านง่าย
  // แต่ตรงนี้ "ห้ามใช้" เด็ดขาด เพราะ stripe.webhooks.constructEvent() (บรรทัดล่างๆ)
  // ต้องการ "raw bytes" ดิบๆ ของ body ไปคำนวณลายเซ็น (signature) เทียบกับที่ Stripe ส่งมา
  // ถ้า express.json() แปลงเป็น object ไปก่อนแล้ว byte ต้นฉบับจะหายไป verify signature ไม่ผ่าน
  // (คนละเรื่องกับ route อื่นๆ ในบอทเรา เพราะบอทไม่ได้มี route อื่นที่ใช้ Express อยู่แล้ว)
  app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    let event;

    // ── ขั้นที่ 1: verify ว่า request นี้มาจาก Stripe จริง ไม่ใช่คนแอบยิงมาเอง ──────
    // ถ้าไม่ verify ตรงนี้ ใครก็ได้ที่รู้ URL ของเรา (/webhook) จะยิง fake event เข้ามา
    // บอกว่า "guild XXX จ่ายเงินแล้วนะ" แล้วปลดล็อก premium ให้เซิร์ฟไหนก็ได้ฟรีๆ ทันที
    // → นี่คือช่องโหว่ร้ายแรงที่สุดของทั้งระบบถ้าลืมเช็คตรงนี้ ห้ามข้ามเด็ดขาด
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('[webhook] signature ไม่ถูกต้อง (อาจไม่ใช่ request จริงจาก Stripe):', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ── ขั้นที่ 2: ตอบ Stripe กลับทันทีว่า "ได้รับแล้ว" ก่อนประมวลผลจริง ────────────
    // Stripe มีกฎว่าถ้าเราไม่ตอบกลับภายในไม่กี่วินาที มันจะคิดว่า webhook ส่งไม่สำเร็จ
    // แล้วจะ "ยิงซ้ำ" มาเรื่อยๆ (retry) ซึ่งถ้าเราดันไปทำงานหนักๆ ก่อนตอบ (เช่น เขียนไฟล์,
    // เรียก Discord API) อาจช้าเกินจนโดน retry ซ้อนกันเป็นสิบรอบโดยไม่ตั้งใจ
    // เพราะงั้นเราตอบ 200 ก่อนเลย แล้วค่อยไปประมวลผลจริงทีหลัง (แบบเดียวกับ deferReply
    // ของ Discord interaction ที่เราคุ้นเคยกันอยู่แล้ว — "รับทราบก่อน ทำทีหลัง")
    res.json({ received: true });

    // ── ขั้นที่ 3: ประมวลผล event จริง (แยกจากการตอบกลับ Stripe แล้ว) ──────────────
    try {
      await handleStripeEvent(event, client);
    } catch (err) {
      // ถ้าตรงนี้ throw จะไม่กระทบ res ที่ตอบ Stripe ไปแล้ว (ตอบไปแล้วบรรทัดบน)
      // แค่ log ไว้เฉยๆ เผื่อแอดมิน (คือน้องหนาว) ต้องมาเช็คทีหลังว่าทำไม guild บางอัน
      // ไม่ได้ premium ทั้งที่จ่ายเงินแล้ว
      console.error('[webhook] ประมวลผล event ล้มเหลว:', event.type, err);
    }
  });

  return app;
}

/**
 * แยก event แต่ละประเภทของ Stripe แล้วอัปเดตข้อมูล tier/subscription ให้ตรง
 * @param {import('stripe').Stripe.Event} event
 * @param {import('discord.js').Client} client
 */
async function handleStripeEvent(event, client) {
  switch (event.type) {
    // ═══ ลูกค้ากด "สมัครพรีเมียม" แล้วจ่ายเงินสำเร็จครั้งแรกผ่านหน้า Checkout ═══
    case 'checkout.session.completed': {
      const session = event.data.object;

      // เช็คว่าเป็น checkout แบบ subscription จริงๆ (กันเผื่ออนาคตมี checkout
      // แบบอื่นที่ไม่ใช่การสมัคร premium ปนมาใน webhook เดียวกัน)
      if (session.mode !== 'subscription') break;

      // guildId ที่เราฝังไว้ตอนสร้าง checkout session (ดู commands/premium.js ขั้นถัดไป)
      // ค่านี้มาจากฝั่งเรา (Discord interaction.guildId) ไม่ใช่จาก user พิมพ์เอง
      // ปลอมแปลงไม่ได้ เพราะ metadata ถูกกำหนดตอนสร้าง session บนฝั่ง server เราเอง
      const guildId = session.metadata?.guildId;
      const discordUserId = session.metadata?.discordUserId;
      if (!guildId) {
        // ไม่ควรเกิดขึ้นได้เลยถ้าโค้ด premium.js ถูกต้อง แต่ดักไว้กันบอทพัง
        console.error('[webhook] checkout.session.completed ไม่มี guildId ใน metadata');
        break;
      }

      setGuildTier(guildId, 'premium');
      // currentPeriodEnd ใส่ null ไปก่อน เพราะตอนนี้เพิ่งสมัครเสร็จ ยังไม่มีรอบบิลจริง
      // รอ invoice.payment_succeeded (event ถัดไปที่จะยิงตามมาเกือบจะทันที) มาเติมให้
      setSubscriptionInfo(guildId, {
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        currentPeriodEnd: null,
      });
      console.log(`[webhook] guild ${guildId} สมัครพรีเมียมสำเร็จ (checkout.session.completed)`);

      // ── ส่ง DM แจ้งเตือนทันที ให้ความรู้สึกว่าจ่ายเสร็จแล้วรู้ผลทันที ─────────────
      // ไม่ต้องกลับไปพิมพ์ /premium เช็คเองอีกรอบ — discordUserId มาจาก metadata
      // ที่ premium.js ฝังไว้ตอนสร้าง checkout session (ดู PART D ใน commands/premium.js)
      if (discordUserId) {
        try {
          const t = createTranslator(getGuildLanguage(guildId));
          // client.guilds.cache.get() อ่านจาก cache ในหน่วยความจำ ไม่ยิง API เพิ่ม
          // (บอทออนไลน์อยู่แล้วตอนนี้ ต้องมี guild นี้อยู่ใน cache แน่ๆ)
          const guild = client.guilds.cache.get(guildId);
          const guildName = guild?.name ?? guildId; // เผื่อ cache miss แปลกๆ ใช้ guildId แทนไปก่อน
          const user = await client.users.fetch(discordUserId);

          // ── ส่งเป็นการ์ดสวยๆ แบบเดียวกับ /premium แทนข้อความเปล่าๆ ──────────
          // ⚠️ ห้ามใส่ content: ... ปนกับ flags: MessageFlags.IsComponentsV2 เด็ดขาด
          // (Discord บล็อกตั้งแต่ระดับ API) ต้องใส่ข้อความขอบคุณเป็น TextDisplay
          // แยกอันในอาเรย์ components แทน
          const congratsText = t('premium.dm.activated', { guildName });
          const card = buildPremiumCard({
            isPremium: true,
            // เพิ่งสมัครเสร็จ ยังไม่มีรอบบิลจริง (เหมือน setSubscriptionInfo ด้านบนบรรทัดนี้)
            // เดี๋ยว invoice.payment_succeeded จะมาอัปเดตทีหลัง — ตอนนี้ให้โชว์ "-" ไปก่อน
            subscriptionInfo: { currentPeriodEnd: null },
            guild,
            t,
            actionButton: null, // DM ไม่ต้องมีปุ่ม แค่โชว์การ์ดสวยๆ พอ
          });

          await user.send({
            components: [new TextDisplayBuilder().setContent(congratsText), card],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch (dmError) {
          // ส่ง DM ไม่ได้ (เช่น ผู้ใช้ปิดรับ DM จากสมาชิกเซิร์ฟ/จากบอท) ไม่ critical
          // ข้ามไปเฉยๆ ไม่ทำให้ webhook ทั้งเส้นพังเพราะจุดนี้จุดเดียว — ผู้ใช้ยังเช็ค
          // สถานะได้เองผ่าน /premium อยู่ดี แค่ไม่ได้แจ้งเตือนอัตโนมัติเฉยๆ
          console.warn('[webhook] ส่ง DM แจ้งเตือนพรีเมียมไม่สำเร็จ:', dmError.message);
        }
      }
      break;
    }

    // ═══ จ่ายเงินสำเร็จ (ทั้งครั้งแรก และทุกครั้งที่ต่ออายุรายเดือน) ═══
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;

      // ⚠️ บั๊กที่เจอจริง: Stripe ย้าย field "invoice.subscription" ไปซ้อนอยู่ใน
      // "invoice.parent.subscription_details.subscription" แทน ตั้งแต่ API เวอร์ชัน
      // Basil เป็นต้นมา (เช็คได้จาก log ตอนรัน `stripe listen` — ขึ้น "API Version
      // [xxxx-xx-xx.dahlia]" หรือใหม่กว่า) โค้ดเดิมที่อ่าน invoice.subscription ตรงๆ
      // จะได้ undefined เงียบๆ แล้ว stripe.subscriptions.retrieve(undefined) จะ throw
      // "No such subscription: 'undefined'" ทันที — ต้องเช็ค parent.type ก่อนเสมอ
      // เผื่อ invoice ใบนี้ไม่ได้ผูกกับ subscription เลย (เช่น invoice แบบจ่ายครั้งเดียว)
      const subscriptionId = invoice.parent?.type === 'subscription_details'
        ? invoice.parent.subscription_details?.subscription
        : null;
      if (!subscriptionId) {
        console.log('[webhook] invoice.payment_succeeded ไม่ได้ผูกกับ subscription ข้ามไป');
        break;
      }

      // invoice ไม่มี metadata guildId ติดมาด้วยตรงๆ ต้อง fetch subscription เพิ่ม
      // เพื่อไปอ่าน metadata ที่เราฝังไว้ตอนสร้าง (ดู subscription_data.metadata
      // ใน commands/premium.js — ต้องฝังซ้ำ 2 ที่ เพราะ metadata ของ checkout session
      // กับของ subscription เป็นคนละก้อนกันใน Stripe)
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const guildId = subscription.metadata?.guildId;
      if (!guildId) {
        console.error('[webhook] invoice.payment_succeeded หา guildId ไม่เจอ (subscription metadata ว่าง)');
        break;
      }

      // ⚠️ บั๊กที่เจอจริงอีกจุด: Stripe ย้าย field "subscription.current_period_end"
      // ไปซ้อนอยู่ใน "subscription.items.data[0].current_period_end" แทน (API เวอร์ชัน
      // ใหม่เดียวกับที่เคยย้าย invoice.subscription — ดูคอมเมนต์ด้านบน) โค้ดเดิมที่อ่าน
      // subscription.current_period_end ตรงๆ จะได้ undefined เงียบๆ แล้ว
      // new Date(undefined * 1000).toISOString() จะ throw "RangeError: Invalid time value"
      // ทันที ต้องอ่านจาก items.data[0] แทน พร้อม guard เผื่อ Stripe ย้าย field ไปที่อื่น
      // อีกในอนาคต — fallback เป็น null เงียบๆ ไม่ throw ให้ webhook พังทั้งเส้น
      const periodEndRaw = subscription.items?.data?.[0]?.current_period_end;
      // current_period_end เป็น Unix timestamp (วินาที) ต้องคูณ 1000 ก่อนส่งให้ Date()
      // เพราะ JavaScript Date ใช้หน่วย millisecond
      const currentPeriodEnd = periodEndRaw
        ? new Date(periodEndRaw * 1000).toISOString()
        : null;
      if (!periodEndRaw) {
        console.warn('[webhook] invoice.payment_succeeded: ไม่พบ current_period_end ในตำแหน่งที่คาดไว้ (Stripe อาจเปลี่ยน field อีกแล้ว) — ใช้ null ไปก่อน');
      }

      setGuildTier(guildId, 'premium');
      setSubscriptionInfo(guildId, {
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd,
      });
      console.log(`[webhook] guild ${guildId} ต่ออายุพรีเมียมสำเร็จ (ครบรอบถัดไป: ${currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : '-'})`);
      break;
    }

    // ═══ subscription ถูกยกเลิก/หมดอายุจริง (ไม่ต่ออายุแล้ว) ═══
    // event นี้จะยิงก็ต่อเมื่อ Stripe เลิกพยายามเก็บเงินแล้วจริงๆ (หลัง retry ครบตามที่ตั้งไว้
    // ใน Stripe Dashboard) ไม่ใช่ยิงทันทีที่บัตรถูกปฏิเสธครั้งแรก — งั้นลูกค้าจะมีช่วง
    // "grace period" ที่ยังใช้ premium ได้อยู่ระหว่างที่ Stripe พยายามเก็บเงินซ้ำ ถือว่า
    // เป็นพฤติกรรมปกติที่ยอมรับได้ ไม่ต้องแก้อะไรเพิ่ม
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const guildId = subscription.metadata?.guildId;
      if (!guildId) {
        console.error('[webhook] customer.subscription.deleted หา guildId ไม่เจอ');
        break;
      }

      // 🔒 กันเคส "ยกเลิก + สมัครใหม่เร็วๆ" — Stripe ไม่รับประกันว่า webhook จะมาถึง
      // ตามลำดับเวลาที่เกิดขึ้นจริงเป๊ะๆ ถ้าลูกค้ายกเลิก subscription เก่าแล้วสมัครใหม่
      // ทันที event "deleted" ของตัวเก่าอาจมาถึง "ช้ากว่า" event สมัครใหม่ก็ได้
      // ถ้าไม่เช็คตรงนี้ จะไปดีด guild ที่เพิ่งจ่ายเงินรอบใหม่ให้กลายเป็น free ทั้งที่ยังจ่ายอยู่
      //
      // วิธีเช็ค: ดึงข้อมูล subscription ล่าสุดที่บันทึกไว้ของ guild นี้มาเทียบ
      // ถ้ามีข้อมูลอยู่ (ไม่ null) และ id ไม่ตรงกับ event นี้ แปลว่า event นี้เป็นของ
      // subscription "เก่า" ที่ถูกแทนที่ไปแล้ว → ข้ามไปเลย ไม่แตะ tier
      const currentInfo = getSubscriptionInfo(guildId);
      if (currentInfo && currentInfo.stripeSubscriptionId !== subscription.id) {
        console.log(
          `[webhook] guild ${guildId} ได้รับ subscription.deleted ของ subscription เก่า ` +
          `(${subscription.id}) ซึ่งถูกแทนที่ไปแล้วด้วย ${currentInfo.stripeSubscriptionId} — ข้าม ไม่ set free`
        );
        break;
      }

      setGuildTier(guildId, 'free');

      // เคลียร์ currentPeriodEnd เป็น null เพราะไม่มีรอบบิลที่ active แล้ว แต่ "ไม่ลบ"
      // stripeCustomerId/stripeSubscriptionId ทิ้ง — เผื่อ /premium ยังอยากอ้างอิงลูกค้าเดิม
      // ตอนโชว์ปุ่ม manage ถ้าเซิร์ฟกลับมาสมัครใหม่ทีหลัง (setSubscriptionInfo เขียนทับ
      // ทั้ง 3 field เสมอ เลยต้องส่ง stripeCustomerId/stripeSubscriptionId เดิมกลับเข้าไปด้วย
      // ไม่งั้นมันจะหายไปเป็น undefined แทน)
      if (currentInfo) {
        setSubscriptionInfo(guildId, { ...currentInfo, currentPeriodEnd: null });
      }

      console.log(`[webhook] guild ${guildId} หมดอายุ/ยกเลิกพรีเมียมแล้ว`);
      break;
    }

    default:
      // event ประเภทอื่นที่ Stripe อาจส่งมา (เราไม่ได้ subscribe แต่ Stripe ส่งมาเพราะ
      // ตั้งค่าใน Dashboard ไว้กว้างเกินไป) — ไม่ error แค่ log ไว้เฉยๆ
      console.log('[webhook] event ที่ยังไม่รองรับ:', event.type);
  }
}

module.exports = { createWebhookServer };