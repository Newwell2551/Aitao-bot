// utils/referralReportChannel.js
// ─────────────────────────────────────────────────────────────────────────
// ห้องรายงานยอดค่าคอมของผู้ขายแต่ละคนแบบ "เรียลไทม์" — ทุกครั้งที่มีการเปลี่ยนแปลง
// (มีคนใช้โค้ดสำเร็จจริงผ่าน webhook, สร้างโค้ดใหม่, หรือปิดใช้งานโค้ด) บอทจะไปแก้ไข
// ข้อความสรุปยอดของโค้ดนั้นในห้องนี้ให้เป็นตัวเลขล่าสุดทันที ไม่ต้องรอใครมากด
// /referral summary เอง
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
// จะยังไม่เห็นยอดตัวเองในห้องนี้นะครับ
//
// 🆕 อัปเดต 19 ก.ย. 2569 (ดึกมาก) — ทำให้เป็น "ระบบ" ที่โต้ตอบได้จริง ตามภาพเรฟที่
// น้องหนาวส่งมา (สไตล์การ์ดร้านขายบูสต์เซิร์ฟที่มี dropdown + ปุ่มด้านล่าง) ไม่ใช่แค่
// ข้อความ/embed นิ่งๆ อีกต่อไป — เพิ่ม 2 อย่าง:
//   1) Select menu เลือกช่วงเวลา "วันนี้ / เดือนนี้ / ทั้งหมด" — เลือกแล้วการ์ดอัปเดต
//      ตัวเลขให้ตรงช่วงที่เลือกทันที (ไม่ต้องรอ event ใหม่)
//   2) ปุ่ม "ข้อกำหนด" — กดแล้วเปิด modal (แบบฟอร์ม) ที่ล็อกไว้อ่านอย่างเดียว อธิบาย
//      เงื่อนไขการจ่ายค่าคอมให้ผู้ขาย (ใช้ TextDisplay ใน Modal — ฟีเจอร์ใหม่ของ Discord
//      ที่ให้ใส่ข้อความอ่านอย่างเดียวใน modal ได้โดยไม่ต้องมีช่องกรอกเลย)
//
// 🆕 อัปเดตล่าสุด — สลับหน้าตาการ์ดไปมาหลายรอบกว่าจะลงตัว สรุปสั้นๆ ว่าเคยลองอะไรมาบ้าง:
//   รอบ 1: Embed ธรรมดา (addFields 3 ช่องเล็ก + 1 ช่องใหญ่)
//   รอบ 2 (เข้าใจผิด — เลิกใช้แล้ว): ลองวาดเป็นรูปภาพจริงด้วย canvas เพราะเข้าใจผิดว่าภาพเรฟ
//     "MAMOMI STORE" ต้องวาดถึงจะได้กรอบกล่อง (ไฟล์ utils/drawReferralReportCard.js ที่ค้าง
//     อยู่บนเครื่องตอนนี้ไม่ได้ใช้แล้ว ลบทิ้งได้เลย)
//   รอบ 3: กลับมาเป็น Embed แต่เปลี่ยน description เป็น "・ป้ายกำกับ" + code block
//     (```ค่า```) — เพราะน้องหนาวก็อปข้อความดิบจากบอทเรฟมาให้ดูตรงๆ แล้วรู้ว่าไม่ใช่รูปภาพเลย
//   รอบ 4: จัดเป็นกริด 2x2 ด้วย embed fields (inline:true คั่นด้วย field ล่องหน)
//   รอบ 5: น้องหนาวยืนยันว่า "ไม่เอาแถบสีข้างซ้าย embed เลย" (ไม่ใช่แค่ไม่ตั้งสี — Embed ทุกอัน
//     ของ Discord มีแถบให้เห็นเสมอไม่ว่าจะตั้งสีหรือไม่) → เลิกใช้ Embed ไปเลย เปลี่ยนเป็น
//     "plain message content" ธรรมดา จำลองกริด 2 คอลัมน์เองด้วยการเว้นช่องว่างในตัว code
//     block แทน (ตอนนั้นยังผสม 2 ค่าไว้ในกล่อง code block เดียวกันบรรทัดเดียว)
//   รอบ 6: น้องหนาวขอปรับ 3 อย่าง:
//     1) เอาบรรทัด "อัปเดตล่าสุด: <t:...:R>" ท้ายการ์ดออก (ไม่ต้องมีเวลาสัมพัทธ์ต่อแล้ว)
//     2) เลิกผสม 2 ค่าไว้ในกล่อง code block เดียวกัน — แยกกลับเป็นกล่องของใครของมัน (คนละ
//        code block กัน) เหมือนตอนแรกๆ แค่ยังจัดป้ายกำกับเป็นคู่ๆ บนบรรทัดเดียวกันไว้เหมือนเดิม
//        (ดู buildReportContent() ด้านล่าง) — หมายเหตุ: Discord "ข้อความธรรมดา" ไม่มีทาง
//        วางกล่อง 2 กล่องเรียงข้างกันจริงๆ ได้ (ทำได้แค่ Embed field เท่านั้น ซึ่งจะดึงแถบสี
//        กลับมาด้วย) กล่องแต่ละคู่เลยเรียงต่อกันแนวตั้งแทน ไม่ใช่ซ้าย-ขวาจริงๆ
//     3) อิโมจิ custom ย่อจาก 5 ID เหลือ 2 ID — ตัวแรกใช้เป็นไอคอนหัวการ์ด (แทน 📊 หน้าชื่อโค้ด)
//        ตัวที่สองใช้เป็นไอคอนของ "สถานะ" (ตัวเดียวใช้ทั้งเปิด/ปิด ไม่มีแยกเขียว/แดงอีกต่อไป —
//        สถานะจริงบอกผ่านข้อความ "เปิดใช้งาน"/"ปิดใช้งาน" แทน) ส่วนอีก 3 ช่อง (ใช้ไปแล้ว/
//        ค่าคอมต่อครั้ง/รวมรายได้) กลับไปใช้ Unicode ธรรมดาเหมือนเดิมก่อน เพราะยังไม่มี ID มาให้
//
//   รอบ 7 (ปัจจุบัน — ของจริง): 2 เรื่อง:
//     1) ⚠️ แก้ชื่อแบรนด์ที่ผิดพลาด — โค้ดหลายรอบก่อนหน้าเขียนบรรทัดท้ายการ์ดว่า "Aitao Bot"
//        (เข้าใจผิดเอาชื่อโปรเจกต์ Claude มาใช้) ทั้งที่บอทตัวนี้ชื่อจริงคือ **Milo Bot** —
//        แก้กลับให้ถูกแล้วครับ (ดูบรรทัดสุดท้ายของ buildReportContent())
//     2) แนบรูปแบนเนอร์โปรโมทพาร์ทเนอร์ (ที่น้องหนาวออกแบบเอง — สไตล์โปสเตอร์ ตัวหนังสือทับ
//        ตัวละคร) ไปกับการ์ดรายงานทุกใบเสมอ อยู่ใต้ข้อความ เหนือแถบปุ่ม/dropdown (ลำดับที่
//        Discord จัดให้อัตโนมัติ: content → attachment → components ไม่ต้องเซ็ตอะไรเพิ่ม)
//        ไฟล์อยู่ที่ assets/referral-banner.png — ดู BANNER_PATH/buildBannerAttachment()
// ─────────────────────────────────────────────────────────────────────────

const path = require('path');
const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextDisplayBuilder,
  AttachmentBuilder,
} = require('discord.js');
const {
  listAllCodes,
  getCodeCommissionStats,
  saveReportMessageId,
  COMMISSION_PER_REDEMPTION_THB,
} = require('./referralStorage');

const REPORT_CHANNEL_NAME = 'referral-earnings';

// 🆕 แบนเนอร์โปรโมทพาร์ทเนอร์ — รูปคงที่ (ไม่เปลี่ยนตามโค้ด) ที่น้องหนาวออกแบบเอง แนบไปกับ
// การ์ดรายงานทุกใบเสมอ (อยู่ใต้ข้อความ เหนือแถบปุ่ม/dropdown — Discord จัดตำแหน่งให้เองอัตโนมัติ
// ตามลำดับ content → attachment → components) วางไฟล์ไว้ที่ assets/referral-banner.png
// (คนละไฟล์กับ assets/mascot-banner.png ที่ใช้เป็นพื้นหลัง hero ของหน้าเว็บ)
const BANNER_PATH = path.join(__dirname, '..', 'assets', 'referral-banner.png');

/** สร้าง attachment ของแบนเนอร์โปรโมท — เรียกใหม่ทุกครั้งที่ส่ง/แก้ข้อความ เพราะ AttachmentBuilder ผูกกับข้อความทีละอันเสมอ ใช้ซ้ำข้าม request ไม่ได้ */
function buildBannerAttachment() {
  return new AttachmentBuilder(BANNER_PATH, { name: 'milo-partner-banner.png' });
}

// ป้ายกำกับ + ตัวเลือกของ dropdown เลือกช่วงเวลา — เรียงตามลำดับที่จะโชว์ในเมนู
const RANGE_OPTIONS = [
  { value: 'today', label: 'วันนี้' },
  { value: 'month', label: 'เดือนนี้' },
  { value: 'all', label: 'ทั้งหมด' },
];
const RANGE_LABELS = Object.fromEntries(RANGE_OPTIONS.map((o) => [o.value, o.label]));

const RANGE_SELECT_PREFIX = 'referral_range_select_';
const TERMS_BUTTON_ID = 'referral_terms_button';
const TERMS_MODAL_ID = 'referral_terms_modal';

// 🆕 ID อิโมจิ custom จากเซิร์ฟ Milo Support ที่น้องหนาวยืนยันมาชัดเจนแล้ว (2 ช่องเท่านั้น
// ตอนนี้ — อันอื่นยังไม่ได้ส่ง ID มา ปล่อยเป็น Unicode ไปก่อน):
//   1) title  → ไอคอนหัวการ์ด (แทน 📊 หน้าชื่อโค้ด)
//   2) status → ไอคอนของบรรทัด "สถานะ" (ใช้ตัวเดียวกันทั้งเปิด/ปิดใช้งาน ไม่มีแยกสีอีกต่อไป)
// ⚠️ ถ้าจับคู่ผิดช่อง บอกมาได้เลยครับ สลับแค่ค่าในอ็อบเจกต์นี้จบ ไม่ต้องแก้ตรรกะที่ไหนอีก
const CUSTOM_EMOJI_IDS = {
  title: '1548426060180492368',
  status: '1546199668793282560',
};

/**
 * หาอิโมจิ custom จาก ID ตรงๆ (ไม่ใช่ค้นด้วยชื่อแบบเดิม) — client.emojis.cache รวมอิโมจิจาก
 * "ทุกเซิร์ฟที่บอทอยู่" ไว้ในก้อนเดียว บอทใช้อิโมจิของเซิร์ฟไหนก็ได้ตราบใดที่ตัวเองอยู่ในเซิร์ฟ
 * นั้น ไม่จำเป็นต้องเป็นเซิร์ฟเดียวกับที่ส่งข้อความ (คนละเรื่องกับที่ "คน" พิมพ์อิโมจิเซิร์ฟอื่น
 * ไม่ได้ถ้าไม่ได้ Nitro — แต่ "บอท" ใช้ได้ปกติ เพราะส่งผ่าน API ตรงๆ ไม่ผ่านข้อจำกัดไคลเอนต์)
 * หาไม่เจอ (ID ผิด/บอทยังไม่เข้าเซิร์ฟนั้น) → คืนค่า fallback Unicode แทนเงียบๆ ไม่ error
 * @param {import('discord.js').Client} client
 * @param {string} id
 * @param {string} fallback อิโมจิ Unicode สำรอง
 * @returns {string}
 */
function resolveEmojiById(client, id, fallback) {
  const emoji = client?.emojis?.cache?.get(id);
  if (!emoji) return fallback;
  return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
}

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

// ความกว้างคอลัมน์ (นับเป็นตัวอักษร) ที่ใช้ตอนจัดคู่ป้ายกำกับให้อยู่บรรทัดเดียวกัน — เว้นช่อง
// ว่างท้ายป้ายกำกับแรกให้ครบตามนี้ เพื่อให้ป้ายกำกับที่ 2 เริ่มตำแหน่งเดียวกันทุกแถว (บรรทัด
// ป้ายกำกับอยู่นอก code block เลยอาจไม่เป๊ะเป๊ะ 100% เพราะมีอิโมจิ/สระ-วรรณยุกต์ไทยปนอยู่ซึ่ง
// กว้างไม่เท่ากันเป๊ะในทุกฟอนต์ ถ้าเห็นจริงแล้วเยื้องนิดหน่อยบอกได้เลย ปรับเลขในนี้เพิ่ม/ลดได้ง่ายๆ)
//
// ⚠️ ค่าของแต่ละสถิติ (ตัวเลข/ข้อความในกล่อง code block) ไม่ได้จัดคอลัมน์คู่กันแบบนี้อีกต่อไป —
// แยกเป็นกล่อง code block ของใครของมันคนละกล่อง (ตามที่น้องหนาวขอ "ไม่รวมกัน") เรียงต่อกัน
// แนวตั้งใต้บรรทัดป้ายกำกับคู่นั้น ไม่ใช่วางเคียงข้างกันจริงๆ (ข้อความธรรมดาของ Discord ทำ
// กล่องเรียงซ้าย-ขวาจริงๆ ไม่ได้ ทำได้แค่ตอนใช้ Embed field เท่านั้น ซึ่งจะดึงแถบสีกลับมาด้วย)
const LABEL_COL_WIDTH = 30;

/** เติมช่องว่างท้ายข้อความให้ครบความกว้างคอลัมน์ที่กำหนด (อย่างน้อยเว้น 2 ช่องเสมอ แม้ข้อความจะยาวเกินคอลัมน์ไปแล้ว) */
function padCol(text, width) {
  return text.length >= width ? `${text}  ` : text.padEnd(width, ' ');
}

/**
 * แปลงตัวเลขสถิติของโค้ด 1 อัน (ที่กรองตามช่วงเวลาที่เลือกมาแล้ว) เป็นข้อความการ์ด — ข้อความ
 * ธรรมดาล้วนๆ (ไม่ใช่ Embed) เพื่อการันตีว่าไม่มีแถบสี/กรอบการ์ดใดๆ ติดมาด้วยเลย (Embed ของ
 * Discord มีแถบสีข้างซ้ายเสมอไม่ว่าจะตั้งสีหรือไม่ก็ตาม — เอาแถบออกได้จริงแค่ทางเดียวคือเลิก
 * ใช้ Embed ไปเลย) ใช้เทคนิค "・ป้ายกำกับ" ตามด้วย code block (```ค่า```) แบบเดียวกับที่
 * น้องหนาวก็อปเรฟ "MAMOMI STORE" มาให้ดูตรงๆ — Discord render code block เป็นกล่อง
 * พื้นหลังเข้ม/ตัว monospace ให้เองอัตโนมัติ
 *
 * จัดป้ายกำกับเป็นคู่ๆ บนบรรทัดเดียวกัน (padCol) ให้ดูเป็น 2 คอลัมน์ — แถวบน: สถานะ | ใช้ไปแล้ว,
 * แถวล่าง: ค่าคอมต่อครั้ง | รวมรายได้ — ส่วน "ค่า" ของแต่ละอันแยกเป็นกล่อง code block ของ
 * ใครของมันคนละกล่อง ไม่ผสมกันในกล่องเดียวแบบก่อนหน้านี้ (ตามที่น้องหนาวขอ "แบ่งช่องเท่าๆกัน
 * ไม่รวมกัน") เรียงต่อกันแนวตั้งใต้บรรทัดป้ายกำกับคู่นั้น
 * @param {{ code: string, sellerLabel: string, active: boolean, totalUses: number, totalCommissionThb: number }} stats
 * @param {'today'|'month'|'all'} range
 * @param {import('discord.js').Client} client ใช้หาอิโมจิ custom จาก ID
 * @returns {string}
 */
function buildReportContent(stats, range, client) {
  const rangeLabel = RANGE_LABELS[range] ?? RANGE_LABELS.all;

  const titleEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.title, '📊');
  // อิโมจิสถานะ: ใช้ ID เดียวกันทั้งเปิด/ปิดใช้งาน (น้องหนาวส่งมาแค่ตัวเดียว ไม่ได้แยกสี) —
  // ความต่างเปิด/ปิดสื่อผ่านข้อความ "เปิดใช้งาน"/"ปิดใช้งาน" แทน ไม่ใช่สีไอคอนอีกต่อไป
  const statusEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.status, stats.active ? '🟢' : '🔴');
  const statusText = stats.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
  // อีก 3 ช่องนี้ยังไม่มี ID ส่งมา เลยใช้ Unicode ธรรมดาไปก่อน
  const usesEmoji = '🔁';
  const perUseEmoji = '💸';
  const totalEmoji = '💰';

  return [
    `${titleEmoji} **${stats.code}**`,
    `ผู้ขาย: **${stats.sellerLabel}**`,
    '',
    // แถวที่ 1: ป้ายกำกับ "สถานะ" กับ "ใช้ไปแล้ว" อยู่บรรทัดเดียวกัน ตามด้วยกล่องค่าของใครของมัน
    padCol(`・${statusEmoji} สถานะ`, LABEL_COL_WIDTH) + `・${usesEmoji} ใช้ไปแล้ว (${rangeLabel})`,
    '```',
    statusText,
    '```',
    '```',
    `${stats.totalUses} ครั้ง`,
    '```',
    // แถวที่ 2: ป้ายกำกับ "ค่าคอมต่อครั้ง" กับ "รวมรายได้" อยู่บรรทัดเดียวกัน ตามด้วยกล่องค่า
    padCol(`・${perUseEmoji} ค่าคอมต่อครั้ง`, LABEL_COL_WIDTH) + `・${totalEmoji} รวมรายได้ (${rangeLabel})`,
    '```',
    `${COMMISSION_PER_REDEMPTION_THB} บาท`,
    '```',
    '```',
    `${stats.totalCommissionThb} บาท`,
    '```',
    '',
    '╰ ꒰ Milo Bot · ระบบรายงานค่าคอมมิชชั่นอัตโนมัติ ꒱ ╯',
  ].join('\n');
}

/**
 * สร้างแถวปุ่ม/dropdown ที่ต่อท้ายการ์ด — 2 แถว: (1) dropdown เลือกช่วงเวลา ผูก code
 * ไว้ใน customId เอง เพราะแต่ละการ์ดเป็นคนละโค้ดกัน ต้องรู้ว่ากำลังกดของการ์ดไหนอยู่
 * (2) ปุ่ม "ข้อกำหนด" — customId เดียวกันทุกการ์ด เพราะเนื้อหาข้อกำหนดเหมือนกันหมด
 * ไม่ต้องผูกกับโค้ดใดโค้ดหนึ่งเป็นพิเศษ
 * @param {string} code
 * @param {'today'|'month'|'all'} range ช่วงเวลาที่กำลังโชว์อยู่ตอนนี้ (ใช้ติ๊ก default ใน dropdown)
 * @returns {import('discord.js').ActionRowBuilder[]}
 */
function buildReportComponents(code, range) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${RANGE_SELECT_PREFIX}${code}`)
    .setPlaceholder('เลือกช่วงเวลาที่จะแสดง')
    .addOptions(
      RANGE_OPTIONS.map((opt) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(opt.label)
          .setValue(opt.value)
          .setDefault(opt.value === range)
      )
    );

  const termsButton = new ButtonBuilder()
    .setCustomId(TERMS_BUTTON_ID)
    .setLabel('ข้อกำหนด')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(termsButton),
  ];
}

/**
 * รวมขั้นตอน "หาโค้ด → คำนวณสถิติตามช่วงเวลา → สร้างข้อความ+components" ไว้จุดเดียว
 * ใช้ร่วมกันทั้ง syncCodeReportMessage() (เรียกตอนมีเหตุการณ์ใหม่ๆ) และ
 * handleReportRangeSelect() (เรียกตอนมีคนกด dropdown เปลี่ยนช่วงเวลา) กันเขียนซ้ำ
 * @param {import('discord.js').Client} client ใช้หาอิโมจิ custom จาก ID
 * @param {string} code
 * @param {'today'|'month'|'all'} range
 * @returns {{ content: string, components: import('discord.js').ActionRowBuilder[], files: import('discord.js').AttachmentBuilder[] } | null}
 *   null ถ้าไม่เจอโค้ดนี้เลย (เช่นถูกลบไปแล้ว)
 */
function buildReportPayload(client, code, range) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const codeEntry = listAllCodes().find((c) => c.code === normalizedCode);
  if (!codeEntry) return null;

  const { totalUses, totalCommissionThb } = getCodeCommissionStats(normalizedCode, range);
  const stats = {
    code: normalizedCode,
    sellerLabel: codeEntry.sellerLabel,
    active: codeEntry.active,
    totalUses,
    totalCommissionThb,
  };

  return {
    content: buildReportContent(stats, range, client),
    components: buildReportComponents(normalizedCode, range),
    files: [buildBannerAttachment()],
  };
}

/**
 * อัปเดต (หรือสร้างใหม่ถ้ายังไม่เคยมี) ข้อความรายงานยอดของโค้ด 1 อัน ให้ตรงกับตัวเลข
 * ล่าสุดในไฟล์ referral-codes.json เสมอ — นี่คือฟังก์ชันหลักที่ทำให้ห้อง "เรียลไทม์"
 *
 * เรียกจาก 3 จุด (ทุกจุดใช้ range='all' ค่าเริ่มต้น — โชว์ยอดตลอดกาลเป็นค่าเริ่มต้นเสมอ
 * ตอนมีเหตุการณ์ใหม่ ถ้าใครเคยเลือกดู "วันนี้/เดือนนี้" ค้างไว้ก่อนหน้านี้ พอมีเหตุการณ์ใหม่
 * เข้ามาการ์ดจะรีเซ็ตกลับไปโชว์ "ทั้งหมด" ก่อนเสมอ ถือว่าเป็นพฤติกรรมที่ยอมรับได้ ไม่ได้
 * เก็บ state ว่าใครเลือกช่วงไหนค้างไว้ถาวร):
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
 * @param {'today'|'month'|'all'} [range='all']
 */
async function syncCodeReportMessage(client, code, range = 'all') {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.warn('[referralReportChannel] ไม่พบ GUILD_ID ใน .env — ข้ามการอัปเดตห้องรายงานยอด');
    return;
  }

  const normalizedCode = String(code || '').trim().toUpperCase();

  try {
    const payload = buildReportPayload(client, normalizedCode, range);
    if (!payload) return; // โค้ดนี้ไม่มีอยู่จริง (ไม่ควรเกิด แต่กันไว้)

    const codeEntry = listAllCodes().find((c) => c.code === normalizedCode);
    const guild = await client.guilds.fetch(guildId);
    const channel = await getOrCreateReportChannel(guild);

    if (codeEntry.reportMessageId) {
      try {
        const existingMessage = await channel.messages.fetch(codeEntry.reportMessageId);
        // เคลียร์ embeds: [] + attachments: [] ด้วยเสมอตอนแก้ไขข้อความเก่า — เผื่อข้อความ
        // เดิมของโค้ดนี้เคยผ่านเวอร์ชัน Embed หรือเวอร์ชันรูปภาพแนบมาก่อน (มีมาแล้วหลายรอบ
        // ระหว่างที่ปรับดีไซน์ ดูคอมเมนต์หัวไฟล์) ถ้าไม่เคลียร์ ของเก่าจะค้างซ้อนอยู่เหนือ
        // ข้อความใหม่ (Discord แก้เฉพาะ field ที่ส่งมาเท่านั้น ไม่ได้ล้างของเดิมให้อัตโนมัติ)
        await existingMessage.edit({
          content: payload.content,
          embeds: [],
          attachments: [],
          files: payload.files,
          components: payload.components,
        });
        return;
      } catch (fetchError) {
        // ข้อความเดิมหาไม่เจอ (เช่นมีคนลบข้อความ/ห้องไปเอง) — ส่งใหม่แทนด้านล่าง
        console.warn(
          `[referralReportChannel] หาข้อความรายงานเดิมของโค้ด ${normalizedCode} ไม่เจอ จะส่งข้อความใหม่แทนครับ`
        );
      }
    }

    const sentMessage = await channel.send({
      content: payload.content,
      files: payload.files,
      components: payload.components,
    });
    saveReportMessageId(normalizedCode, sentMessage.id);
  } catch (error) {
    console.warn(`[referralReportChannel] อัปเดตห้องรายงานยอดของโค้ด ${normalizedCode} ไม่สำเร็จ:`, error);
  }
}

/** เช็คว่า customId นี้เป็น dropdown เลือกช่วงเวลาของห้องรายงานยอดหรือไม่ (เรียกจาก index.js) */
function isReportRangeSelect(customId) {
  return typeof customId === 'string' && customId.startsWith(RANGE_SELECT_PREFIX);
}

/**
 * รันตอนมีคนเลือกช่วงเวลาใหม่จาก dropdown — อ่านโค้ดจาก customId + ช่วงเวลาที่เลือกจาก
 * interaction.values แล้วสร้างการ์ดใหม่ "แก้ทับข้อความเดิมทันที" ผ่าน interaction.update()
 * (เร็วกว่าไป fetch ข้อความมาแก้ใหม่แบบ syncCodeReportMessage — ในนี้มี interaction.message
 * อยู่แล้วในตัว ไม่ต้องยิง API เพิ่ม)
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
async function handleReportRangeSelect(interaction) {
  const code = interaction.customId.slice(RANGE_SELECT_PREFIX.length);
  const range = interaction.values[0];

  const payload = buildReportPayload(interaction.client, code, range);
  if (!payload) {
    await interaction.reply({ content: 'ไม่พบโค้ดนี้แล้วครับ (อาจถูกลบไปแล้ว)', ephemeral: true });
    return;
  }

  // เคลียร์ embeds: []/attachments: [] ไว้ด้วยเสมอ — เผื่อการ์ดนี้เคยเป็นเวอร์ชันเก่าค้างมาก่อน
  // แล้วแนบไฟล์แบนเนอร์กลับเข้าไปใหม่ทุกครั้ง (ไม่งั้นตอนเปลี่ยนช่วงเวลา แบนเนอร์จะหายไปเพราะ
  // attachments: [] ล้างของเดิมออกหมดรวมถึงแบนเนอร์ที่เคยแนบไว้ด้วย)
  await interaction.update({
    content: payload.content,
    embeds: [],
    attachments: [],
    files: payload.files,
    components: payload.components,
  });
}

/** เช็คว่า customId นี้เป็นปุ่ม "ข้อกำหนด" ของห้องรายงานยอดหรือไม่ (เรียกจาก index.js) */
function isReportTermsButton(customId) {
  return customId === TERMS_BUTTON_ID;
}

/**
 * สร้าง Modal "ข้อกำหนดการจ่ายค่าคอม" — ใช้ TextDisplay (ฟีเจอร์ใหม่ของ Discord ที่ให้ใส่
 * ข้อความอ่านอย่างเดียวในหน้าต่าง modal ได้ ไม่ต้องมีช่องกรอกเลยสักช่อง) ต่างจาก modal
 * ทั่วไปในโปรเจกต์นี้ (เช่น modal กรอกโค้ดส่วนลดใน commands/premium.js) ที่ต้องมี
 * TextInput ให้กรอกเสมอ — อันนี้ตั้งใจให้ "อ่านอย่างเดียว ปิดได้เลย ไม่ต้องกรอกอะไร"
 * @returns {import('discord.js').ModalBuilder}
 */
function buildTermsModal() {
  return new ModalBuilder()
    .setCustomId(TERMS_MODAL_ID)
    .setTitle('ข้อกำหนดการจ่ายค่าคอม')
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `ผู้ขายได้ค่าคอม **${COMMISSION_PER_REDEMPTION_THB} บาท** ต่อการใช้โค้ดสำเร็จ 1 ครั้ง ` +
        '(นับจาก Stripe ยืนยันว่าลูกค้าจ่ายเงินจริงแล้วเท่านั้น — แค่กรอกโค้ดเฉยๆ ไม่นับ)'
      ),
      new TextDisplayBuilder().setContent(
        '**วิธีจ่ายเงินให้ผู้ขาย**: ระบบไม่ได้โอนให้อัตโนมัติ ต้องโอนเองเป็นระยะ (เช่นทุกสัปดาห์/เดือน) — ' +
        'เช็คยอดค้างจ่ายได้จาก `/referral summary` แล้วโอนจริงผ่าน PromptPay/ธนาคาร ' +
        '(ใช้ `/referral payout` ช่วยสร้าง QR โอนเงินให้ก็ได้) เสร็จแล้วกด `/referral markpaid` ' +
        'เพื่อเคลียร์ยอดค้างจ่ายของโค้ดนั้น'
      ),
    );
}

/**
 * รันตอนกดปุ่ม "ข้อกำหนด" — เปิด modal อ่านอย่างเดียวขึ้นมาให้
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleReportTermsButton(interaction) {
  await interaction.showModal(buildTermsModal());
}

/** เช็คว่า customId นี้เป็น modal ข้อกำหนดหรือไม่ (เรียกจาก index.js ตอน submit) */
function isTermsModalSubmit(customId) {
  return customId === TERMS_MODAL_ID;
}

/**
 * รันตอนกด Submit บน modal ข้อกำหนด (ไม่มีข้อมูลอะไรให้บันทึกเลย เพราะเป็น modal
 * อ่านอย่างเดียว) — แค่ตอบรับสั้นๆ กันเจอ error "This interaction failed"
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleTermsModalSubmit(interaction) {
  await interaction.reply({ content: 'รับทราบครับ', ephemeral: true });
}

module.exports = {
  getOrCreateReportChannel,
  syncCodeReportMessage,
  isReportRangeSelect,
  handleReportRangeSelect,
  isReportTermsButton,
  handleReportTermsButton,
  isTermsModalSubmit,
  handleTermsModalSubmit,
};
