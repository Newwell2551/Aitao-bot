// utils/buildPremiumCard.js
// ─────────────────────────────────────────────────────────────────────────
// สร้าง "การ์ดพรีเมียม" (ContainerBuilder) ตัวเดียวกัน ใช้ได้ทั้ง 2 ที่:
//   1. commands/premium.js  → execute() ตอนพิมพ์ /premium (มีปุ่มสมัคร/จัดการ)
//   2. server.js             → ตอนสมัครพรีเมียมสำเร็จ ส่ง DM แจ้งเตือน (ไม่มีปุ่ม)
//
// เหตุผลที่แยกออกมาเป็นไฟล์ util กลาง: ก่อนหน้านี้โค้ดสร้างการ์ดซ้ำกันอยู่
// 2 ที่ ถ้าจะแก้ดีไซน์ (สี, layout, thumbnail) ต้องมาคอยแก้พร้อมกันทุกครั้ง
// เสี่ยงลืมแก้ที่ใดที่หนึ่งแล้วการ์ด 2 จุดหน้าตาไม่ตรงกัน — รวมเป็นจุดเดียวจบ
// ─────────────────────────────────────────────────────────────────────────

const {
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
} = require('discord.js');

/**
 * สร้างการ์ดพรีเมียม (title + status + thumbnail รูปปกเซิร์ฟ + ลิสต์สิทธิประโยชน์
 * + ปุ่ม (ถ้ามี)) พร้อมส่งเป็น component เดียวใน components array
 *
 * @param {object} params
 * @param {boolean} params.isPremium - เซิร์ฟนี้เป็นพรีเมียมอยู่หรือไม่
 * @param {object|null} params.subscriptionInfo - ผลจาก getSubscriptionInfo() (เป็น null ได้ ไม่ error)
 * @param {import('discord.js').Guild|null|undefined} params.guild - Guild object ของ discord.js
 *   (เป็น null/undefined ได้ — ถ้าไม่มีจะข้าม thumbnail รูปปกไปเฉยๆ ไม่ error)
 * @param {(key: string, vars?: object) => string} params.t - translator function เหมือนที่ใช้อยู่ทุกที่
 * @param {import('discord.js').ButtonBuilder|null} [params.actionButton] - ปุ่มต่อท้ายการ์ด
 *   ถ้าเป็น null (ค่าเริ่มต้น) จะไม่มีแถวปุ่มต่อท้าย (ใช้กับ DM ที่ไม่ต้องมีปุ่ม)
 * @returns {import('discord.js').ContainerBuilder} container พร้อมส่ง (ยังไม่ครอบ flags/components array — ตัวเรียกใช้ต้องครอบเอง)
 */
function buildPremiumCard({ isPremium, subscriptionInfo, guild, t, actionButton = null }) {
  // ── สร้างข้อความสถานะ ──────────────────────────────────────────────────
  const statusText = isPremium
    ? t('premium.status.active', {
        // subscriptionInfo อาจเป็น null ได้ (เช่นตั้ง premium มือผ่าน /dev-set-tier
        // ไม่เคยผ่าน Stripe) ใช้ "-" แทนวันที่ในกรณีนั้น กันโค้ดพัง
        date: subscriptionInfo?.currentPeriodEnd
          ? new Date(subscriptionInfo.currentPeriodEnd).toLocaleDateString()
          : '-',
      })
    : t('premium.status.free');

  // ── สร้างข้อความลิสต์สิทธิประโยชน์ (แยกหัวข้อ/เนื้อหาคนละก้อน) ──────────
  // ถ้าเซิร์ฟยังไม่ premium → โชว์ว่าอัปเกรดแล้วได้อะไร (จูงใจให้สมัคร)
  // ถ้า premium แล้ว → โชว์ว่าตอนนี้ใช้สิทธิ์อะไรได้บ้าง (ย้ำคุณค่าที่จ่ายไป)
  // แยกเป็น header/body เพราะ header จะถูกเอาไปวางรวมกับ title/status ใน
  // Section เดียวกับรูปปกเซิร์ฟด้านล่าง ส่วน body ยังคงอยู่นอก Section เหมือนเดิม
  const benefitsHeader = isPremium
    ? t('premium.benefits.premium_header')
    : t('premium.benefits.free_header');
  const benefitsBody = isPremium
    ? t('premium.benefits.premium_body')
    : t('premium.benefits.free_body');

  // ── ดึงลิงก์รูปปกเซิร์ฟ ไว้ใช้เป็น thumbnail มุมขวาบน ──────────────────
  // discord.js v14 คืนลิงก์ .gif ให้อัตโนมัติเองถ้าปกเซิร์ฟเป็นภาพเคลื่อนไหว
  // (ไม่ต้องเช็คนามสกุลไฟล์เอง) แต่ถ้าเซิร์ฟยังไม่เคยตั้งปกเลย หรือไม่มี guild
  // ส่งเข้ามาเลย (เช่นเรียกจาก server.js บาง edge case) จะได้ null กลับมา
  const iconUrl = guild?.iconURL({ size: 128 }) ?? null;

  // ── ห่อด้วย ContainerBuilder แทนการยัด TextDisplay/ActionRow เข้า arrayตรงๆ ──────
  // เหตุผลที่ต้องห่อ: setAccentColor() เป็นเมธอดของ Container เท่านั้น (แถบสีซ้ายมือ
  // ของการ์ด) ตัว TextDisplay/ActionRow เดี่ยวๆ ไม่มีสีให้ตั้งเอง — pattern การเรียก
  // .addTextDisplayComponents()/.addActionRowComponents() ตรงนี้ก็อปมาจาก
  // buildMessageFromSchema.js ที่มีอยู่แล้วในโปรเจกต์ ให้ตรงกันทั้งระบบ
  // แถบสีข้างซ้ายเปลี่ยนตามสถานะ: premium แล้ว → เขียว (Success) / ยังฟรีอยู่ → เทา
  // (Greyple) กันไม่ให้เซิร์ฟที่ยังไม่สมัครดูเหมือน "ปลดล็อกแล้ว" จากสีเขียวเข้าใจผิด
  const container = new ContainerBuilder().setAccentColor(isPremium ? 0x57f287 : 0x99aab5);

  // ⚠️ Section ของ Discord ต้องมี accessory (รูปหรือปุ่ม) เสมอ ห้ามสร้าง Section
  // เปล่าไม่มี accessory เด็ดขาด (จะ error ทันที) ถ้า iconUrl เป็น null ต้อง
  // fallback ไปใช้ TextDisplay ธรรมดา 3 อันแยกแบบเดิม ไม่ใช่ Section
  // ⚠️ Discord จำกัด Section ไว้ที่ TextDisplay สูงสุด 3 อันต่อ 1 Section —
  // title + status + benefitsHeader พอดี 3 อัน ยัดเพิ่มไม่ได้อีกแล้ว
  if (iconUrl) {
    const titleSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(t('premium.title')),
        new TextDisplayBuilder().setContent(statusText),
        new TextDisplayBuilder().setContent(benefitsHeader),
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl));
    container.addSectionComponents(titleSection);
  } else {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('premium.title')))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(statusText))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(benefitsHeader));
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(benefitsBody));

  // actionButton เป็น null ได้ (เช่นตอนส่ง DM แจ้งเตือน ไม่ต้องมีปุ่มอะไรต่อท้าย)
  // ถ้าเป็น null ก็ข้ามส่วนปุ่มไปเลย การ์ดจบแค่ลิสต์สิทธิประโยชน์
  if (actionButton) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(actionButton));
  }

  return container;
}

module.exports = { buildPremiumCard };