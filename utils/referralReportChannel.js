// utils/referralReportChannel.js
// ─────────────────────────────────────────────────────────────────────────
// ห้องรายงานยอดค่าคอมของผู้ขายแต่ละคนแบบ "เรียลไทม์" — ทุกครั้งที่มีการเปลี่ยนแปลง
// (มีคนใช้โค้ดสำเร็จจริงผ่าน webhook, สร้างโค้ดใหม่, หรือปิดใช้งานโค้ด) บอทจะไปแก้ไข
// ข้อความสรุปยอดของโค้ดนั้นในห้องนี้ให้เป็นตัวเลขล่าสุดทันที ไม่ต้องรอใครมากด
// /referral summary เอง — เหมือนบอทร้านค้าที่มีแดชบอร์ดยอดขายอัปเดตสดๆ ตามที่น้องหนาวขอ
//
// ใช้ pattern เดียวกับ utils/assetStorage.js เป๊ะๆ: เก็บแค่ "พิกัดข้อความ" (ในที่นี้คือ
// messageId — channel คงที่เสมอเลยไม่ต้องเก็บ channelId ซ้ำ) แล้ว fetch ข้อความเดิมมา
// แก้ไข (edit) แทนที่จะส่งข้อความใหม่ทุกครั้ง กันไม่ให้ห้องรกด้วยข้อความซ้ำๆ เป็นร้อยเป็น
// พันข้อความ
//
// ⚠️ ห้องนี้สร้างขึ้นใน "เซิร์ฟควบคุม" เดียวกับที่ /dev กับ /referral ใช้อยู่แล้ว (ตาม
// GUILD_ID ใน .env) เพราะระบบ referral เป็นของกลางของบอท ไม่ได้ผูกกับเซิร์ฟลูกค้าเซิร์ฟ
// ใดเซิร์ฟหนึ่งโดยเฉพาะ (โค้ดเดียวใช้ได้หลายเซิร์ฟ) — ห้องนี้ตั้งสิทธิ์ให้เห็นได้แค่บอท
// เท่านั้น (ซ่อนจากสมาชิกทุกคนรวมถึงแอดมิน เหมือน asset-storage) เพราะเป็นข้อมูลรายได้ที่
// ไม่ควรเปิดเผยสาธารณะ — น้องหนาว (เจ้าของบอท) เข้าไปดูเองในเซิร์ฟควบคุมได้ตลอด แต่ผู้ขาย
// จะยังไม่เห็นยอดตัวเองในห้องนี้นะครับ (ถ้าอยากให้ผู้ขายเห็นด้วย ต้องคุยกันเพิ่มเป็น
// ฟีเจอร์ใหม่ทีหลัง เช่น DM สรุปยอดเป็นระยะ หรือเปิดสิทธิ์เฉพาะคน)
// ─────────────────────────────────────────────────────────────────────────

const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const {
  listAllCodes,
  getCommissionSummary,
  saveReportMessageId,
  COMMISSION_PER_REDEMPTION_THB,
} = require('./referralStorage');

const REPORT_CHANNEL_NAME = 'referral-earnings';

/**
 * หาห้องรายงานยอดที่มีอยู่แล้ว หรือสร้างใหม่ถ้ายังไม่มี (pattern เดียวกับ
 * assetStorage.js → getOrCreateAssetChannel())
 * @param {import('discord.js').Guild} guild เซิร์ฟควบคุม (ตาม GUILD_ID ใน .env)
 */
async function getOrCreateReportChannel(guild) {
  const existing = guild.channels.cache.find(
    (channel) => channel.name === REPORT_CHANNEL_NAME && channel.type === ChannelType.GuildText
  );

  if (existing) {
    // เช็คสิทธิ์บอทในห้องเดิมก่อนเสมอ เผื่อมีใครไปแก้ permission ห้องทีหลัง (เหตุผล
    // เดียวกับ asset-storage — กัน error 50001 Missing Access ตอนบอทพยายามโพสต์)
    const me = guild.members.me;
    const currentPerms = existing.permissionsFor(me);
    const hasRequiredAccess = currentPerms?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ]);
    if (!hasRequiredAccess) {
      await existing.permissionOverwrites.edit(me.id, {
        ViewChannel: true,
        SendMessages: true,
      });
    }
    return existing;
  }

  return guild.channels.create({
    name: REPORT_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic:
      'รายงานยอดค่าคอมของผู้ขายแต่ละคนแบบเรียลไทม์ (บอทอัปเดตอัตโนมัติ — ห้ามลบ/แก้ข้อความเอง ไม่งั้นบอทจะส่งข้อความใหม่แทนอันเดิม)',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: guild.members.me.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ],
  });
}

/**
 * 🆕 แปลงตัวเลขสถิติของโค้ด 1 อัน เป็น "การ์ด" แบบตาราง (Discord Embed) แทนข้อความ
 * plain text ธรรมดาแบบเดิม — ใช้ embed เพราะเป็นวิธีเดียวที่ Discord รองรับ "ช่องตัวเลข
 * เรียงเป็นแถว 3 ช่อง" อัตโนมัติ (fields ที่ตั้ง inline: true ทุกอัน Discord จะเรียงให้เอง
 * สูงสุด 3 ช่องต่อแถวถ้าพื้นที่พอ ตามแบบที่น้องหนาวส่งภาพอ้างอิงมา)
 *
 * โครงสร้าง: แถวบนเป็น 3 ช่องเล็ก (สถานะ / จำนวนครั้งที่ใช้ / ค่าคอมต่อครั้ง — ตัวเลข
 * "คงที่" อ่านเร็วๆ ได้) แถวล่างเป็นช่องใหญ่เต็มความกว้าง 1 ช่อง (รวมรายได้ตลอดกาล —
 * ตัวเลขที่สำคัญที่สุด เลยให้เด่นสุดแยกออกมาต่างหาก ไม่ใช่ inline)
 *
 * ค่าตัวเลขแต่ละช่องห่อด้วย backtick (`) ตั้งใจ — Discord จะเรนเดอร์เป็นตัวหนังสือ
 * monospace พร้อมกล่องพื้นหลังสีเทาให้อัตโนมัติ เป็นเทคนิคง่ายๆ ที่ทำให้ตัวเลขดูเป็น
 * "กล่อง/ป้าย" เด่นขึ้นมาจากข้อความรอบข้าง (ไม่ต้องพึ่งรูปภาพหรือ HTML ใดๆ เลย)
 *
 * สีแถบซ้ายของการ์ด (setColor) ใช้ชุดสีเดียวกับ buildPremiumCard.js เป๊ะๆ (เขียว =
 * กำลังใช้งานอยู่, เทา = ปิดใช้งานแล้ว) เพื่อให้ทั้งบอทมีธีมสีเดียวกันทุกจุด ไม่ต้องคิดสีใหม่
 *
 * @param {{ code: string, sellerLabel: string, active: boolean, totalUses: number, totalCommissionThb: number }} stats
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildReportEmbed(stats) {
  const statusValue = stats.active ? 'เปิดใช้งานอยู่' : 'ปิดใช้งานแล้ว';
  const statusEmoji = stats.active ? '🟢' : '🔴';

  return new EmbedBuilder()
    .setColor(stats.active ? 0x57f287 : 0x99aab5) // เขียว/เทา — ชุดสีเดียวกับการ์ดพรีเมียม
    .setTitle(`📊 ${stats.code}`)
    .setDescription(`ผู้ขาย: **${stats.sellerLabel}**`)
    .addFields(
      { name: `${statusEmoji} สถานะ`, value: `\`${statusValue}\``, inline: true },
      { name: '🔁 ใช้ไปแล้ว', value: `\`${stats.totalUses} ครั้ง\``, inline: true },
      { name: '💸 ค่าคอมต่อครั้ง', value: `\`${COMMISSION_PER_REDEMPTION_THB} บาท\``, inline: true },
      { name: '💰 รวมรายได้ทั้งหมด (ตลอดกาล)', value: `\`${stats.totalCommissionThb} บาท\``, inline: false },
    )
    .setFooter({ text: 'อัปเดตล่าสุด' })
    .setTimestamp(); // Discord โชว์เป็นเวลาสัมพัทธ์ให้เอง (เช่น "2 นาทีที่แล้ว") ในเขตเวลาของแต่ละคนเอง
}

/**
 * อัปเดต (หรือสร้างใหม่ถ้ายังไม่เคยมี) ข้อความรายงานยอดของโค้ด 1 อัน ให้ตรงกับตัวเลข
 * ล่าสุดในไฟล์ referral-codes.json เสมอ — นี่คือฟังก์ชันหลักที่ทำให้ห้อง "เรียลไทม์"
 *
 * เรียกจาก 3 จุด:
 *   1. server.js — หลัง completeRedemption() สำเร็จ (มีคนใช้โค้ดจ่ายเงินจริง)
 *   2. commands/referral.js — handleAdd() หลังสร้างโค้ดใหม่สำเร็จ (โชว์การ์ด 0 ครั้ง/0 บาท ทันที)
 *   3. commands/referral.js — handleDeactivate() หลังปิดใช้งานโค้ด (อัปเดตสถานะในการ์ด)
 *
 * ⚠️ ฟังก์ชันนี้ต้อง "ไม่มีทาง throw error ออกไปนอกฟังก์ชัน" เด็ดขาด (เหมือน
 * syncDiscordBotList.js) เพราะห้องรายงานเป็นแค่ "ของเสริม" ไม่ใช่ core flow การจ่ายเงิน/
 * ปลดล็อกพรีเมียม — ถ้าอัปเดตห้องนี้พลาด ต้องไม่ทำให้ webhook หลักหรือคำสั่ง /referral พังตาม
 *
 * @param {import('discord.js').Client} client
 * @param {string} code
 */
async function syncCodeReportMessage(client, code) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.warn('[referralReportChannel] ไม่พบ GUILD_ID ใน .env — ข้ามการอัปเดตห้องรายงานยอด');
    return;
  }

  const normalizedCode = String(code || '').trim().toUpperCase();

  try {
    const codeEntry = listAllCodes().find((c) => c.code === normalizedCode);
    if (!codeEntry) return; // โค้ดนี้ไม่มีอยู่จริง (ไม่ควรเกิด แต่กันไว้)

    // สรุปยอดของโค้ดนี้เท่านั้น (กรองจากยอดรวมตลอดกาลทั้งหมด — ห้องนี้โชว์สถิติสะสม
    // ไม่ใช่ยอดค้างจ่าย ดูคอมเมนต์ใน referralStorage.js เรื่อง getUnpaidCommissionSummary)
    const summary = getCommissionSummary().find((s) => s.code === normalizedCode);
    const stats = {
      code: normalizedCode,
      sellerLabel: codeEntry.sellerLabel,
      active: codeEntry.active,
      totalUses: summary?.totalUses ?? 0,
      totalCommissionThb: summary?.totalCommissionThb ?? 0,
    };

    const guild = await client.guilds.fetch(guildId);
    const channel = await getOrCreateReportChannel(guild);
    const embed = buildReportEmbed(stats);

    if (codeEntry.reportMessageId) {
      try {
        const existingMessage = await channel.messages.fetch(codeEntry.reportMessageId);
        // 🆕 ต้องเคลียร์ content: '' ด้วยเสมอตอนแก้ไขข้อความเก่า — เพราะข้อความเดิม
        // (ก่อนเปลี่ยนมาใช้ embed) เป็น plain text ล้วนๆ ถ้าส่งแค่ embeds ไปเฉยๆ โดยไม่แตะ
        // content เลย ตัว content เก่าจะค้างอยู่ข้างบน embed ใหม่ (Discord แก้เฉพาะ field
        // ที่ส่งมาเท่านั้น ไม่ได้ล้างของเดิมให้อัตโนมัติ)
        await existingMessage.edit({ content: '', embeds: [embed] });
        return;
      } catch (fetchError) {
        // ข้อความเดิมหาไม่เจอ (เช่นมีคนลบข้อความ/ห้องไปเอง) — ส่งใหม่แทนด้านล่าง
        console.warn(
          `[referralReportChannel] หาข้อความรายงานเดิมของโค้ด ${normalizedCode} ไม่เจอ จะส่งข้อความใหม่แทนครับ`
        );
      }
    }

    const sentMessage = await channel.send({ embeds: [embed] });
    saveReportMessageId(normalizedCode, sentMessage.id);
  } catch (error) {
    console.warn(`[referralReportChannel] อัปเดตห้องรายงานยอดของโค้ด ${normalizedCode} ไม่สำเร็จ:`, error);
  }
}

module.exports = { getOrCreateReportChannel, syncCodeReportMessage };
