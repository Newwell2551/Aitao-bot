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
// 🆕 ประวัติการปรับหน้าตาการ์ด — สลับไปมาหลายรอบกว่าจะลงตัว สรุปสั้นๆ ว่าเคยลองอะไรมาบ้าง:
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
//   รอบ 6: น้องหนาวขอปรับ 3 อย่าง: (1) เอาบรรทัด "อัปเดตล่าสุด: <t:...:R>" ท้ายการ์ดออก
//     (2) เลิกผสม 2 ค่าไว้ในกล่อง code block เดียวกัน — แยกกลับเป็นกล่องของใครของมันคนละกล่อง
//     (3) อิโมจิ custom ย่อจาก 5 ID เหลือ 2 ID (title + status)
//   รอบ 7: (1) แก้ชื่อแบรนด์ที่เคยพิมพ์ผิดเป็น "Aitao Bot" กลับเป็น **Milo Bot** (2) แนบรูป
//     แบนเนอร์โปรโมทพาร์ทเนอร์ (ที่น้องหนาวออกแบบเอง) ไปกับการ์ดทุกใบ
//   รอบ 8: ย้ายทั้งการ์ดมาใช้ Discord Components V2 (ContainerBuilder ไม่ตั้งสี → ไม่มีแถบ
//     ซ้ายมือเลย) จัดเป็น "ชุดบล็อก" ด้วย Separator เหมือน /builder
//   รอบ 9: อิโมจิ custom ครบทุกช่อง + ย้ายปุ่ม/dropdown ออกมานอก Container (บล็อกคลุมแค่ถึง
//     footer) + ปุ่ม "ข้อกำหนด" มีไอคอนอิโมจิ custom
//   รอบ 10: ลองจับคู่ 2 ค่า/แถวไว้ใน code block เดียวกัน (padCol()) จำลอง 2x2 แบบไม่มีแถบสี
//     — ดูแล้วไม่สวยเท่าที่หวัง
//
//   🆕 รอบ 11 (ปัจจุบัน — ของจริงที่ใช้งานอยู่ตอนนี้) — น้องหนาวลองดูรอบ 10 แล้วบอกว่า
//   "ไม่ค่อยสวยเลย งั้นเอาแบบแถบสีมาก็ได้ๆๆ" พร้อมให้สีมาด้วย (#7b8eda) — กลับไปใช้
//   **EmbedBuilder** (เลิกใช้ Components V2 ทั้งไฟล์แล้วรอบนี้) เพราะ Embed field
//   (`inline: true`) เป็นทางเดียวที่ Discord รองรับกริด 2 คอลัมน์แบบกล่องแยกจริงๆ ที่อยู่
//   บรรทัดเดียวกันได้ (ยืนยันจากการค้นคว้าตั้งแต่รอบ 8 แล้วว่า Components V2 ไม่มีกริดให้ใช้
//   เลย) คราวนี้ "แถบสี" ไม่ใช่ปัญหาอีกต่อไปเพราะน้องหนาวขอเองพร้อมเฉดสีด้วย — ใช้
//   `.setColor(0x7b8eda)` ตรงๆ
//
//   โครงสร้างใหม่ (ดู buildReportEmbed() ด้านล่าง): title (ไอคอน+ชื่อโค้ด) → description
//   (ผู้ขาย) → fields จัดกริด 2x2 จริงด้วย inline:true (แถว 1 = สถานะ|ใช้ไปแล้ว, แถว 2 =
//   ค่าคอมต่อครั้ง|รวมรายได้ คั่นด้วย field ล่องหนระหว่างแถวเหมือนเทคนิคที่เคยลองไว้รอบ 4) →
//   .setImage() แสดงแบนเนอร์ในตัว embed เอง (แทน MediaGallery เดิม) → .setFooter() แสดง
//   ข้อความปิดท้ายเล็กๆ (แทน TextDisplay subtext เดิม) — ปุ่ม/dropdown ยังคงอยู่ "นอกกรอบ"
//   embed เหมือนรอบ 9 โดยธรรมชาติอยู่แล้ว เพราะ Discord render ActionRow แยกจาก embed เสมอ
//   ไม่ต้องทำอะไรเพิ่ม (Embed ไม่มีทาง "ครอบ" ปุ่มเข้าไปข้างในได้แบบที่ Container เคยทำได้)
//
//   ⚠️ **จุดเสี่ยงทางเทคนิคที่ต้องรู้**: การ์ดที่เคย sync ผ่านรอบ 8-10 มาแล้ว (ตั้งค่าเป็น
//   Components V2 ไปแล้วจริง) การ์ดพวกนี้ **ยืนยันแน่นอนแล้วว่าเอาธง IS_COMPONENTS_V2 ออกไม่
//   ได้อีกเลย** (ต่างจากตอนรอบ 8 ที่ยังไม่แน่ใจว่า "เพิ่ม" ธงทีหลังได้ไหม — ตอนนี้คือทิศทาง
//   ตรงข้าม: การ์ดที่มีธงนี้ติดตัวแล้ว จะ "เอาออก" ไม่ได้เลยยืนยันชัดเจน) เพราะฉะนั้นการ .edit()
//   การ์ดพวกนี้กลับไปเป็น Embed **จะ fail แน่นอน 100%** ไม่ใช่แค่เสี่ยงเหมือนก่อน — โชคดีที่
//   try/catch ซ้อนใน syncCodeReportMessage() (เดิมทำไว้ตั้งแต่รอบ 8 เผื่อเคสตรงข้าม) ดักเคสนี้
//   ได้พอดีเป๊ะ: พอ edit() fail จะลบข้อความเก่าทิ้งแล้วส่งใหม่เป็น Embed แทนอัตโนมัติ ไม่ต้อง
//   แก้อะไรเพิ่ม — แค่ทุกการ์ดที่เคยผ่าน Components V2 มาก่อน จะ "เด้ง" ไปอยู่ล่างสุดของห้อง
//   แค่ครั้งแรกครั้งเดียวตอน sync รอบถัดไป (เหมือนที่เคยอธิบายไว้ตอนรอบ 8)
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
  EmbedBuilder, // 🆕 รอบ 11: กลับมาใช้ Embed แทน Components V2 (ContainerBuilder ฯลฯ) แล้ว
} = require('discord.js');
const {
  listAllCodes,
  getCodeCommissionStats,
  saveReportMessageId,
  COMMISSION_PER_REDEMPTION_THB,
} = require('./referralStorage');

const REPORT_CHANNEL_NAME = 'referral-earnings';

// 🆕 รอบ 11: สีแถบซ้ายมือของการ์ด — น้องหนาวส่งมาเองตรงๆ (#7b8eda) ใช้กับ
// EmbedBuilder.setColor() ใน buildReportEmbed() ด้านล่าง
const CARD_ACCENT_COLOR = 0x7b8eda;

// แบนเนอร์โปรโมทพาร์ทเนอร์ — รูปคงที่ (ไม่เปลี่ยนตามโค้ด) ที่น้องหนาวออกแบบเอง แนบไปกับ
// การ์ดรายงานทุกใบเสมอ (รอบ 11: แสดงผ่าน embed.setImage() — Discord จะวางรูปนี้ไว้ในตัว
// embed เอง เหนือแถบ footer เล็กๆ ด้านล่างโดยอัตโนมัติ ไม่ต้องจัดตำแหน่งเอง) วางไฟล์ไว้ที่
// assets/referral-banner.png (คนละไฟล์กับ assets/mascot-banner.png ที่ใช้เป็นพื้นหลัง hero
// ของหน้าเว็บ)
//
// เก็บชื่อไฟล์ตอนแนบ (BANNER_FILENAME) เป็นค่าคงที่แยกจาก path บนดิสก์ (BANNER_PATH) แล้ว
// ใช้ตัวแปรเดียวกันซ้ำทั้งตอนสร้าง AttachmentBuilder และตอนอ้างอิงด้วย attachment:// ใน
// .setImage() ด้านล่าง — กันพิมพ์ชื่อไฟล์ไม่ตรงกัน 2 จุด (ถ้าไม่ตรงกัน Discord จะหารูปไม่เจอ
// โชว์เป็นภาพแตกทันที)
const BANNER_FILENAME = 'milo-partner-banner.png';
const BANNER_PATH = path.join(__dirname, '..', 'assets', 'referral-banner.png');

/** สร้าง attachment ของแบนเนอร์โปรโมท — เรียกใหม่ทุกครั้งที่ส่ง/แก้ข้อความ เพราะ AttachmentBuilder ผูกกับข้อความทีละอันเสมอ ใช้ซ้ำข้าม request ไม่ได้ */
function buildBannerAttachment() {
  return new AttachmentBuilder(BANNER_PATH, { name: BANNER_FILENAME });
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

// ID อิโมจิ custom จากเซิร์ฟ Milo Support — ครบทุกช่องแล้วตั้งแต่รอบ 9 (title/status/uses/
// perUse/total + terms) น้องหนาวยืนยันมาชัดเจน:
//   ชื่อโค้ด → 1548426060180492368
//   แถวบน:   สถานะ → 1546199668793282560, [ช่องที่ 2] → 1548426051452145765
//   แถวล่าง: ค่าคอมต่อครั้ง → 1546199675491852398, รวมเงิน → 1546199649902133358
//
// ⚠️ ช่องที่ 2 ของแถวบน น้องหนาวพิมพ์ป้ายกำกับว่า "ค่าคอมต่อครั้ง" ซ้ำกับช่องแรกของแถวล่าง
// (ID คนละตัวกัน) — พี่เข้าใจว่าน่าจะพิมพ์ซ้ำโดยไม่ตั้งใจ เพราะ ID นี้ (1548426051452145765)
// ตรงกับ ID ที่เคยส่งมาก่อนหน้านี้สำหรับ "จำนวนครั้งที่ใช้" (ดูตารางในเอกสารโปรเจกต์รอบ
// "อิโมจิ custom กลับมาอีกครั้ง") และตำแหน่งก็ตรงกับเลย์เอาต์เดิม (แถวบน = สถานะ|ใช้ไปแล้ว,
// แถวล่าง = ค่าคอมต่อครั้ง|รวมรายได้) พี่เลยจับคู่ให้เป็น "ใช้ไปแล้ว" ตามนี้ไปก่อนนะครับ —
// ถ้าจับผิด บอกมาได้เลย สลับแค่ค่าในอ็อบเจกต์นี้จบ ไม่ต้องแก้ตรรกะที่ไหนอีก
const CUSTOM_EMOJI_IDS = {
  title: '1548426060180492368',   // ไอคอนหัวการ์ด (แทน 📊 หน้าชื่อโค้ด)
  status: '1546199668793282560',  // สถานะ (ใช้ตัวเดียวกันทั้งเปิด/ปิดใช้งาน)
  uses: '1548426051452145765',    // ใช้ไปแล้ว (ดูหมายเหตุด้านบน — สมมติฐานจากป้ายกำกับซ้ำ)
  perUse: '1546199675491852398',  // ค่าคอมต่อครั้ง
  total: '1546199649902133358',   // รวมรายได้
  terms: '1542210287015436379',   // ไอคอนปุ่ม "ข้อกำหนด"
};

/**
 * หาอิโมจิ custom จาก ID ตรงๆ (ไม่ใช่ค้นด้วยชื่อแบบเดิม) — client.emojis.cache รวมอิโมจิจาก
 * "ทุกเซิร์ฟที่บอทอยู่" ไว้ในก้อนเดียว บอทใช้อิโมจิของเซิร์ฟไหนก็ได้ตราบใดที่ตัวเองอยู่ในเซิร์ฟ
 * นั้น ไม่จำเป็นต้องเป็นเซิร์ฟเดียวกับที่ส่งข้อความ (คนละเรื่องกับที่ "คน" พิมพ์อิโมจิเซิร์ฟอื่น
 * ไม่ได้ถ้าไม่ได้ Nitro — แต่ "บอท" ใช้ได้ปกติ เพราะส่งผ่าน API ตรงๆ ไม่ผ่านข้อจำกัดไคลเอนต์)
 * หาไม่เจอ (ID ผิด/บอทยังไม่เข้าเซิร์ฟนั้น) → คืนค่า fallback Unicode แทนเงียบๆ ไม่ error
 * ใช้ได้ทั้งในข้อความทั่วไปและใน embed title/description/field (format string เดียวกันหมด)
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
 * เหมือน resolveEmojiById() แต่คืนค่าเป็น "object" แทน string — ใช้กับ
 * `ButtonBuilder.setEmoji()` โดยเฉพาะ เพราะ setEmoji() ของ discord.js ไม่รับ format
 * string แบบ `<:name:id>` เหมือนที่ใช้ในเนื้อข้อความ/embed ทั่วไป ต้องเป็น object `{ id,
 * name, animated }` (สำหรับอิโมจิ custom) หรือ `{ name: 'อิโมจิ' }` (สำหรับ Unicode) แทน
 * หาไม่เจอ → คืน fallback แบบ Unicode object ให้เงียบๆ ไม่ error เหมือน resolveEmojiById()
 * @param {import('discord.js').Client} client
 * @param {string} id
 * @param {string} fallback อิโมจิ Unicode สำรอง
 * @returns {{ id?: string, name: string, animated?: boolean }}
 */
function resolveButtonEmoji(client, id, fallback) {
  const emoji = client?.emojis?.cache?.get(id);
  if (!emoji) return { name: fallback };
  return { id: emoji.id, name: emoji.name, animated: emoji.animated };
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

/**
 * สร้างการ์ดรายงานยอดของโค้ด 1 อัน เป็น EmbedBuilder ก้อนเดียว — 🆕 รอบ 11: กลับมาใช้ Embed
 * แทน Components V2 Container แล้ว (ดูเหตุผลที่หัวไฟล์)
 *
 * โครงสร้าง: title (ไอคอน+ชื่อโค้ด) → description (ผู้ขาย) → fields จัดกริด 2x2 จริงด้วย
 * `inline: true` (แถว 1 = สถานะ|ใช้ไปแล้ว, แถว 2 = ค่าคอมต่อครั้ง|รวมรายได้ — คั่นระหว่าง
 * 2 แถวด้วย field "ล่องหน" ชื่อ/ค่าเป็น zero-width-space `inline:false` บังคับให้ Discord
 * ตัดขึ้นบรรทัดใหม่พอดีทุก 2 ช่อง ไม่งั้น Discord จะแพ็ก field แบบ auto-wrap ตามความกว้างที่
 * เหลือเอง ไม่ใช่นับจำนวนช่องแบบที่เราต้องการ) → .setImage() แบนเนอร์ (แสดงในตัว embed เอง
 * เหนือ footer อัตโนมัติ) → .setFooter() ข้อความปิดท้ายเล็กๆ → .setColor() แถบสีซ้ายมือ
 * @param {{ code: string, sellerLabel: string, active: boolean, totalUses: number, totalCommissionThb: number }} stats
 * @param {'today'|'month'|'all'} range
 * @param {import('discord.js').Client} client ใช้หาอิโมจิ custom จาก ID
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildReportEmbed(stats, range, client) {
  const rangeLabel = RANGE_LABELS[range] ?? RANGE_LABELS.all;

  const titleEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.title, '📊');
  // อิโมจิสถานะ: ใช้ ID เดียวกันทั้งเปิด/ปิดใช้งาน (น้องหนาวส่งมาแค่ตัวเดียว ไม่ได้แยกสี) —
  // ความต่างเปิด/ปิดสื่อผ่านข้อความ "เปิดใช้งาน"/"ปิดใช้งาน" แทน ไม่ใช่สีไอคอนอีกต่อไป
  const statusEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.status, stats.active ? '🟢' : '🔴');
  const statusText = stats.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
  const usesEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.uses, '🔁');
  const perUseEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.perUse, '💸');
  const totalEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.total, '💰');

  return new EmbedBuilder()
    .setColor(CARD_ACCENT_COLOR)
    .setTitle(`${titleEmoji} ${stats.code}`)
    .setDescription(`ผู้ขาย: **${stats.sellerLabel}**`)
    .addFields(
      // ── แถว 1: สถานะ | ใช้ไปแล้ว ──────────────────────────────────────
      { name: `・${statusEmoji} สถานะ`, value: `\`\`\`\n${statusText}\n\`\`\``, inline: true },
      {
        name: `・${usesEmoji} ใช้ไปแล้ว (${rangeLabel})`,
        value: `\`\`\`\n${stats.totalUses} ครั้ง\n\`\`\``,
        inline: true,
      },
      // field ล่องหน (zero-width space) บังคับตัดบรรทัดใหม่ก่อนแถวถัดไป — ไม่งั้น Discord
      // จะพยายามแพ็ก field ที่ 3 ต่อท้ายแถวเดิมถ้าจอกว้างพอ ทำให้ไม่ได้ 2x2 จริงตามที่ขอ
      { name: '​', value: '​', inline: false },
      // ── แถว 2: ค่าคอมต่อครั้ง | รวมรายได้ ─────────────────────────────
      {
        name: `・${perUseEmoji} ค่าคอมต่อครั้ง`,
        value: `\`\`\`\n${COMMISSION_PER_REDEMPTION_THB} บาท\n\`\`\``,
        inline: true,
      },
      {
        name: `・${totalEmoji} รวมรายได้ (${rangeLabel})`,
        value: `\`\`\`\n${stats.totalCommissionThb} บาท\n\`\`\``,
        inline: true,
      }
    )
    .setImage(`attachment://${BANNER_FILENAME}`)
    .setFooter({ text: '╰ ꒰ Milo Bot · ระบบรายงานค่าคอมมิชชั่นอัตโนมัติ ꒱ ╯' });
}

/**
 * สร้างแถว dropdown เลือกช่วงเวลา + ปุ่ม "ข้อกำหนด" — ส่งเป็น `components` แยกต่างหากจาก
 * `embeds` เสมอ (Discord render ActionRow อยู่นอกกรอบ embed โดยธรรมชาติอยู่แล้ว ไม่ต้องทำ
 * อะไรเพิ่มเพื่อให้ปุ่ม "อยู่นอกบล็อก" เหมือนตอนที่เคยต้องแยกออกจาก Container เองในรอบ 9)
 *
 * ปุ่ม "ข้อกำหนด" ใส่อิโมจิ custom (CUSTOM_EMOJI_IDS.terms) ผ่าน resolveButtonEmoji()
 * แทน resolveEmojiById() ธรรมดา เพราะ .setEmoji() ของปุ่มต้องการ object ไม่ใช่ string
 * (ดูคอมเมนต์ resolveButtonEmoji() ด้านบน)
 * @param {import('discord.js').Client} client ใช้หาอิโมจิ custom ของปุ่มข้อกำหนด
 * @param {string} code
 * @param {'today'|'month'|'all'} range ช่วงเวลาที่กำลังโชว์อยู่ตอนนี้ (ใช้ติ๊ก default ใน dropdown)
 * @returns {import('discord.js').ActionRowBuilder[]}
 */
function buildReportActionRows(client, code, range) {
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
    .setEmoji(resolveButtonEmoji(client, CUSTOM_EMOJI_IDS.terms, '📜'))
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(termsButton),
  ];
}

/**
 * รวมขั้นตอน "หาโค้ด → คำนวณสถิติตามช่วงเวลา → สร้าง Embed + แถวปุ่ม/dropdown" ไว้จุดเดียว
 * ใช้ร่วมกันทั้ง syncCodeReportMessage() (เรียกตอนมีเหตุการณ์ใหม่ๆ) และ
 * handleReportRangeSelect() (เรียกตอนมีคนกด dropdown เปลี่ยนช่วงเวลา) กันเขียนซ้ำ
 * @param {import('discord.js').Client} client ใช้หาอิโมจิ custom จาก ID
 * @param {string} code
 * @param {'today'|'month'|'all'} range
 * @returns {{ embed: import('discord.js').EmbedBuilder, actionRows: import('discord.js').ActionRowBuilder[], files: import('discord.js').AttachmentBuilder[] } | null}
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
    embed: buildReportEmbed(stats, range, client),
    actionRows: buildReportActionRows(client, normalizedCode, range),
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
 * 🆕 รอบ 11: การ์ดที่เคยผ่าน Components V2 มาก่อน (รอบ 8-10) มีธง IS_COMPONENTS_V2 ติดตัว
 * อยู่แล้ว ซึ่ง **ยืนยันแน่นอนว่าเอาออกไม่ได้** — การ .edit() กลับไปเป็น Embed แบบนี้จะ fail
 * แน่นอนสำหรับการ์ดกลุ่มนั้น (ดูรายละเอียดที่หัวไฟล์) — try/catch ซ้อนด้านล่างนี้ (เดิมทำไว้
 * ตั้งแต่รอบ 8 เผื่อทิศทางตรงข้าม) ดักเคสนี้ได้พอดี: edit() fail → ลบข้อความเก่าทิ้งแล้ว
 * ส่งใหม่เป็น Embed แทนอัตโนมัติ ไม่ต้องแก้อะไรเพิ่ม
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

        try {
          // เคลียร์ content/attachments เก่าทิ้งด้วยเสมอ — เผื่อข้อความเดิมของโค้ดนี้เคยผ่าน
          // เวอร์ชัน plain content/รูปภาพแนบมาก่อน (มีมาแล้วหลายรอบ ดูคอมเมนต์หัวไฟล์) ถ้าไม่
          // เคลียร์ ของเก่าจะค้างซ้อนอยู่ (Discord แก้เฉพาะ field ที่ส่งมาเท่านั้น ไม่ได้ล้าง
          // ของเดิมให้อัตโนมัติ) — ไม่ต้องใส่ flags แล้ว (Embed ไม่ใช่ Components V2)
          await existingMessage.edit({
            content: null,
            embeds: [payload.embed],
            attachments: [],
            components: payload.actionRows,
            files: payload.files,
          });
          return;
        } catch (editError) {
          // แก้ไขข้อความเดิมไม่สำเร็จ — ถ้าการ์ดนี้เคยเป็น Components V2 มาก่อน (รอบ 8-10)
          // นี่คือสาเหตุที่ยืนยันแล้ว (ธง IS_COMPONENTS_V2 เอาออกไม่ได้ — ดูคอมเมนต์หัวไฟล์) →
          // ลบข้อความเก่าทิ้งแล้วส่งใหม่แทน (fall through ไปส่งใหม่ด้านล่างสุดของฟังก์ชัน)
          console.warn(
            `[referralReportChannel] แก้ไขการ์ดเดิมของโค้ด ${normalizedCode} ไม่สำเร็จ (${editError.message}) — จะลบแล้วส่งใหม่แทนครับ`
          );
          await existingMessage.delete().catch(() => {});
        }
      } catch (fetchError) {
        // ข้อความเดิมหาไม่เจอ (เช่นมีคนลบข้อความ/ห้องไปเอง) — ส่งใหม่แทนด้านล่าง
        console.warn(
          `[referralReportChannel] หาข้อความรายงานเดิมของโค้ด ${normalizedCode} ไม่เจอ จะส่งข้อความใหม่แทนครับ`
        );
      }
    }

    const sentMessage = await channel.send({
      embeds: [payload.embed],
      components: payload.actionRows,
      files: payload.files,
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
 *
 * ไม่ต้องห่อ try/catch เพิ่มเรื่องรูปแบบข้อความเหมือน syncCodeReportMessage() เพราะการ์ดที่มี
 * dropdown ให้กดได้ ต้องผ่าน syncCodeReportMessage() มาสร้าง/แก้เป็น Embed แท้ๆ มาก่อนอยู่แล้ว
 * เสมอ (ไม่งั้นจะไม่มี dropdown ให้กดตั้งแต่แรก)
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

  // เคลียร์ content/attachments เก่าด้วยเสมอ แล้วแนบไฟล์แบนเนอร์กลับเข้าไปใหม่ทุกครั้ง (ไม่งั้น
  // ตอนเปลี่ยนช่วงเวลา แบนเนอร์จะหายไปเพราะ attachments: [] ล้างของเดิมออกหมดรวมถึงแบนเนอร์
  // ที่เคยแนบไว้ด้วย — ต้องส่ง files: payload.files คู่กันเสมอ)
  await interaction.update({
    content: null,
    embeds: [payload.embed],
    attachments: [],
    components: payload.actionRows,
    files: payload.files,
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
 * (⚠️ TextDisplay ใน Modal เป็นคนละเรื่องกับ Components V2 ของข้อความปกติ — ใช้ได้อิสระ
 * ต่อกัน ไม่ได้ผูกกับว่าตัวการ์ดหลักใช้ Embed หรือ Components V2 อยู่)
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
