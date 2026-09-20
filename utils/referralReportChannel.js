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
//     แบนเนอร์โปรโมทพาร์ทเนอร์ (ที่น้องหนาวออกแบบเอง) ไปกับการ์ดทุกใบ — ตอนนั้นยังเป็น
//     "plain message content" อยู่ เลยได้แค่ content → attachment → components เรียงกัน
//     อัตโนมัติ ไม่มีทางจัดกล่องสถิติให้เป็น "ชุดบล็อก" สวยๆ เหมือน /builder ได้จริง
//
//   🆕 รอบ 8 (ปัจจุบัน) — ย้ายทั้งการ์ดมาใช้ Discord Components V2 แทน "plain message
//   content" ทั้งหมด (ContainerBuilder/TextDisplayBuilder/SeparatorBuilder/
//   MediaGalleryBuilder) ตามที่น้องหนาวขอ 3 อย่าง:
//     1) "กรอบข้อความแบ่งเท่ากันให้พอดีกับรูป" — ทำได้แล้วเพราะ Container กว้างเท่า
//        ความกว้างข้อความ Discord เสมอ (เท่ากับความกว้างรูปแบนเนอร์ด้านล่างโดยอัตโนมัติ
//        ไม่ต้องคำนวณ padding เองแบบ padCol() เวอร์ชันก่อนหน้าอีกต่อไป — เลยตัดทิ้งไปเลย)
//     2) "รูปอยู่เหนือข้อความ Milo คำว่ารายงานอัตโนมัติ" — ย้าย MediaGallery (แบนเนอร์) มา
//        วางไว้ "เหนือ" TextDisplay footer แล้ว (ดู buildReportContainer() ด้านล่าง ลำดับ
//        การเรียก .addMediaGalleryComponents() มาก่อน .addTextDisplayComponents() ของ footer)
//     3) "ทำให้หน้าตาเหมือน builder หน่อย จัดเป็นบล้อกเป็นชุด" — ใช้ ContainerBuilder
//        ห่อทุกอย่างไว้ก้อนเดียว (**ไม่เรียก .setAccentColor() เลย** — ยืนยันจากเอกสาร
//        Discord แล้วว่า Container ต่างจาก Embed ตรงที่ "ไม่ตั้งสี = แถบซ้ายกลืนกับพื้นหลัง
//        พอดี ไม่ใช่แค่จางลง" เลยได้ทั้งหน้าตาแบบบล็อกที่มีกรอบ/เส้นคั่นชัดเจน แต่ไม่มีแถบสี
//        เลยสักนิด) คั่นแต่ละกลุ่ม (หัวการ์ด / สถิติ 4 ช่อง / แบนเนอร์ / footer) ด้วย
//        SeparatorBuilder ให้ดูเป็น "ชุดบล็อก" เหมือนการ์ด /builder กับ /role-setup จริงๆ
//        (ก็อป pattern มาจาก utils/buildPremiumCard.js + utils/guildJoinGreeting.js ที่มี
//        อยู่แล้วในโปรเจกต์ ให้หน้าตาตรงกันทั้งระบบ)
//
//   ⚠️ ข้อจำกัดที่ต้องรู้ไว้ (คุยกับน้องหนาวแล้วในแชต): Components V2 ของ Discord **ไม่มี
//   กริดหลายคอลัมน์จริงๆ ให้ใช้** — ทุก component เรียงจากบนลงล่างเป็นแนวตั้งเท่านั้น (มีแค่
//   Section ที่จับคู่ข้อความกับรูป/ปุ่ม "1 อัน" ด้านข้างได้) เพราะงั้นการ์ดนี้จะไม่ได้กริด
//   3 คอลัมน์ x 2 แถวเป๊ะๆ เหมือนภาพเรฟ "MAMOMI BOOST" แต่ได้ 4 กล่องสถิติเรียงต่อกัน
//   แนวตั้งแทน — แต่ละกล่องยังคงกรอบ/code block ของตัวเองชัดเจน กว้างเท่ากันทุกกล่องเป๊ะๆ
//   (ทางเดียวที่จะได้กริดจริงๆ คือกลับไปใช้ Embed field ซึ่งจะดึงแถบสีซ้ายมือกลับมาด้วย —
//   ถ้าอยากได้กริดจริงมากกว่าไม่มีแถบสี บอกได้เลยครับ สลับกลับไปใช้ Embed ให้ได้)
//
//   ⚠️ เรื่องเทคนิคอีกจุด: การ์ดเก่า (ก่อนรอบ 8) เป็น "plain content" มาก่อน ไม่ใช่
//   Components V2 — ตอน sync ครั้งแรกของแต่ละการ์ดหลังอัปเดตนี้ ฟังก์ชัน .edit() จะเท่ากับ
//   "เพิ่มธง IS_COMPONENTS_V2 ทีหลัง" ซึ่ง Discord ไม่มีเอกสารยืนยันชัดเจนว่าทำได้เสมอ (ที่
//   ยืนยันแน่ๆ คือ "เอาธงนี้ออกไม่ได้" หลังตั้งแล้ว แต่ "เพิ่มเข้าไปทีหลัง" ไม่ชัดเจน) — กันพลาด
//   ด้วยการห่อ .edit() ด้วย try/catch ซ้อนอีกชั้นใน syncCodeReportMessage(): ถ้า edit()
//   ล้มเหลว จะลบข้อความเก่าทิ้งแล้วส่งใหม่แทนอัตโนมัติ การันตีว่าได้การ์ด Components V2
//   แท้ๆ เสมอ ไม่ค้างเป็นข้อความครึ่งๆ กลางๆ
//
//   🆕 รอบ 9 (ปัจจุบัน) — น้องหนาวส่ง ID อิโมจิที่เหลือมาครบ + ปรับ 2 อย่าง:
//     1) อิโมจิ custom ครบทุกช่องแล้ว (title/status/uses/perUse/total + terms ใหม่) — ดู
//        CUSTOM_EMOJI_IDS ด้านล่าง (มีหมายเหตุเรื่องสมมติฐานการจับคู่ 1 จุดที่ควรเช็คซ้ำ)
//     2) "เอาบล็อกให้คลุมแค่ถึง footer พอ ปุ่ม/dropdown ไว้ข้างล่างบล็อกอีกที" — Container
//        (buildReportContainer()) ตอนนี้จบแค่บรรทัด footer เท่านั้น ไม่มีปุ่ม/dropdown ผูก
//        อยู่ข้างในแล้ว (เดิมรอบ 8 ผูกไว้ข้างในผ่าน .addActionRowComponents() ท้ายสุด) —
//        แยกไปสร้างที่ buildReportActionRows() ใหม่แทน แล้วส่งเป็น component อีกก้อนต่อท้าย
//        Container ตอนส่ง/แก้ข้อความ (`components: [container, ...actionRows]`) ผลคือกรอบ/
//        บล็อกที่เห็นครอบแค่ข้อความ+รูป ส่วนปุ่ม/dropdown ลอยอยู่ "นอกกรอบ" ด้านล่างแทน
//     3) ปุ่ม "ข้อกำหนด" ใส่อิโมจิ custom ใหม่แล้ว (CUSTOM_EMOJI_IDS.terms) ผ่านฟังก์ชันใหม่
//        resolveButtonEmoji() (คืนเป็น object ให้ .setEmoji() ใช้ ต่างจาก resolveEmojiById()
//        ที่คืนเป็น string สำหรับใส่ในเนื้อข้อความ)
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
  // ── 🆕 Components V2 — ใช้แทน "plain message content" ทั้งหมดตั้งแต่รอบ 8 ────────
  ContainerBuilder,        // "กล่อง" ห่อทุก component ของการ์ดไว้ด้วยกัน มีแถบสี (accent
                            // color) ทางซ้ายให้ตั้งได้เหมือน embed แต่ "ไม่เรียกเลย" ในไฟล์นี้
                            // เพื่อให้แถบซ้ายกลืนกับพื้นหลัง ไม่มีให้เห็นเลย ตามที่ขอ
  SeparatorBuilder,         // เส้นคั่นจริงๆ ระหว่างกลุ่ม component (ไม่ใช่ตัวอักษรวาดเอง)
  SeparatorSpacingSize,     // ขนาดระยะห่างของเส้นคั่น — Small (แคบ) / Large (กว้าง)
  MediaGalleryBuilder,      // "แกลเลอรีรูปภาพ" — ใช้แสดงรูปแบนเนอร์เต็มความกว้างการ์ด
  MediaGalleryItemBuilder,  // รูปแต่ละรูปใน MediaGallery (มีรูปเดียวคือแบนเนอร์)
  MessageFlags,             // ใช้ธง IsComponentsV2 บอก Discord ว่าข้อความนี้เป็น Components V2
} = require('discord.js');
const {
  listAllCodes,
  getCodeCommissionStats,
  saveReportMessageId,
  COMMISSION_PER_REDEMPTION_THB,
} = require('./referralStorage');

const REPORT_CHANNEL_NAME = 'referral-earnings';

// 🆕 แบนเนอร์โปรโมทพาร์ทเนอร์ — รูปคงที่ (ไม่เปลี่ยนตามโค้ด) ที่น้องหนาวออกแบบเอง แนบไปกับ
// การ์ดรายงานทุกใบเสมอ (ตั้งแต่รอบ 8: อยู่ "เหนือ" บรรทัด footer ผ่าน MediaGallery — ดู
// buildReportContainer() ด้านล่าง) วางไฟล์ไว้ที่ assets/referral-banner.png (คนละไฟล์กับ
// assets/mascot-banner.png ที่ใช้เป็นพื้นหลัง hero ของหน้าเว็บ)
//
// เก็บชื่อไฟล์ตอนแนบ (BANNER_FILENAME) เป็นค่าคงที่แยกจาก path บนดิสก์ (BANNER_PATH) แล้ว
// ใช้ตัวแปรเดียวกันซ้ำทั้งตอนสร้าง AttachmentBuilder และตอนอ้างอิงด้วย attachment:// ใน
// MediaGalleryItemBuilder ด้านล่าง — กันพิมพ์ชื่อไฟล์ไม่ตรงกัน 2 จุด (ถ้าไม่ตรงกัน Discord
// จะหารูปไม่เจอ โชว์เป็นภาพแตกทันที) — pattern เดียวกับ utils/guildJoinGreeting.js
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

// 🆕 รอบ 9: น้องหนาวส่ง ID ครบทุกช่องแล้ว (6 ช่อง — 4 ค่าสถิติ แบ่งฝั่งละ 2 ตามที่บอก
// + title เดิม + terms ใหม่) ตามที่แจ้งมาในแชต:
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
  terms: '1542210287015436379',   // 🆕 ไอคอนปุ่ม "ข้อกำหนด" (ใหม่รอบนี้)
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
 * 🆕 รอบ 9: เหมือน resolveEmojiById() แต่คืนค่าเป็น "object" แทน string — ใช้กับ
 * `ButtonBuilder.setEmoji()` โดยเฉพาะ เพราะ setEmoji() ของ discord.js ไม่รับ format
 * string แบบ `<:name:id>` เหมือนที่ใช้ในข้อความทั่วไป ต้องเป็น object `{ id, name,
 * animated }` (สำหรับอิโมจิ custom) หรือ `{ name: 'อิโมจิ' }` (สำหรับ Unicode) แทน
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
 * สร้างการ์ดรายงานยอดของโค้ด 1 อัน เป็น Components V2 Container ก้อนเดียว — แทนที่
 * buildReportContent() เวอร์ชัน "plain message content" เดิมไปเลย
 *
 * โครงสร้างจากบนลงล่าง (คั่นแต่ละกลุ่มด้วย Separator ให้ดูเป็น "ชุดบล็อก" ตามที่ขอ):
 *   หัวการ์ด (ชื่อโค้ด + ผู้ขาย) → เส้นคั่น → สถิติ 4 กล่อง (สถานะ/ใช้ไปแล้ว/ค่าคอมต่อครั้ง/
 *   รวมรายได้ — กล่องละ TextDisplay 1 อัน ค่าอยู่ใน code block ของตัวเอง) → เส้นคั่น →
 *   แบนเนอร์โปรโมท (MediaGallery) → เส้นคั่นเบาๆ → footer เล็กๆ (จบตรงนี้)
 *
 * 🆕 รอบ 9: ตามที่ขอ "เอาบล็อกให้คลุมแค่ตั้งแต่แรกจนถึงข้อความ Milo Bot รายงาน... พอ" — Container
 * นี้**ไม่มีปุ่ม/dropdown อยู่ข้างในแล้ว** (เดิมรอบ 8 ผูก dropdown+ปุ่มไว้ข้างในผ่าน
 * .addActionRowComponents() ท้ายสุด) ตอนนี้ Container จบแค่บรรทัด footer เท่านั้น —
 * dropdown/ปุ่มแยกไปสร้างที่ buildReportActionRows() ด้านล่างแทน แล้วเอามาต่อเป็น component
 * แยกอีกก้อนหนึ่ง "นอก" Container ตอนประกอบ payload (ดู buildReportPayload()) — Discord
 * รองรับให้ข้อความเดียวมี component หลายก้อนเรียงกันได้ (Container 1 ก้อน + ActionRow
 * อีกกี่ก้อนก็ได้) ผลคือกรอบ/บล็อกที่เห็นจะครอบแค่ส่วนข้อความ+รูป ส่วนปุ่ม/dropdown จะอยู่
 * "นอกกรอบ" ด้านล่างแทน ตามที่ขอเป๊ะๆ
 *
 * @param {{ code: string, sellerLabel: string, active: boolean, totalUses: number, totalCommissionThb: number }} stats
 * @param {'today'|'month'|'all'} range
 * @param {import('discord.js').Client} client ใช้หาอิโมจิ custom จาก ID
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildReportContainer(stats, range, client) {
  const rangeLabel = RANGE_LABELS[range] ?? RANGE_LABELS.all;

  const titleEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.title, '📊');
  // อิโมจิสถานะ: ใช้ ID เดียวกันทั้งเปิด/ปิดใช้งาน (น้องหนาวส่งมาแค่ตัวเดียว ไม่ได้แยกสี) —
  // ความต่างเปิด/ปิดสื่อผ่านข้อความ "เปิดใช้งาน"/"ปิดใช้งาน" แทน ไม่ใช่สีไอคอนอีกต่อไป
  const statusEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.status, stats.active ? '🟢' : '🔴');
  const statusText = stats.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
  // 🆕 รอบ 9: อีก 3 ช่องนี้ได้ ID มาครบแล้ว เปลี่ยนจาก Unicode มาใช้อิโมจิ custom เหมือนกันหมด
  const usesEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.uses, '🔁');
  const perUseEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.perUse, '💸');
  const totalEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.total, '💰');

  return (
    new ContainerBuilder()
      // ⚠️ จงใจ "ไม่เรียก" .setAccentColor() เลยสักบรรทัด — นี่คือจุดที่ทำให้ไม่มีแถบสี
      // ซ้ายมือเหลืออยู่เลย (ต่างจาก Embed ที่มีแถบให้เห็นเสมอไม่ว่าจะตั้งสีหรือไม่ก็ตาม —
      // ดูคอมเมนต์รอบ 8 ที่หัวไฟล์)

      // ── บล็อกที่ 1: หัวการ์ด (ชื่อโค้ด + ผู้ขาย) ──────────────────────────
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${titleEmoji} **${stats.code}**\nผู้ขาย: **${stats.sellerLabel}**`)
      )

      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))

      // ── บล็อกที่ 2: สถิติ 4 กล่อง — TextDisplay แยกกล่องของใครของมัน (ตามที่ขอ "ไม่รวมกัน")
      // แต่ละกล่องกว้าง "เท่ากับความกว้างการ์ดเสมอ" (Container กว้างเท่าข้อความ Discord
      // เต็มความกว้างเสมอ พอดีกับรูปแบนเนอร์ด้านล่างโดยอัตโนมัติ — ไม่ต้องคำนวณ padding เอง
      // เหมือน padCol() เวอร์ชันก่อนหน้าอีกต่อไป) เรียงต่อกันแนวตั้งเป็น "ชุดบล็อกเดียวกัน"
      // (Components V2 ไม่มีกริดหลายคอลัมน์จริงๆ ให้ใช้ — ดูคอมเมนต์ข้อจำกัดที่หัวไฟล์)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`・${statusEmoji} สถานะ\n\`\`\`\n${statusText}\n\`\`\``),
        new TextDisplayBuilder().setContent(
          `・${usesEmoji} ใช้ไปแล้ว (${rangeLabel})\n\`\`\`\n${stats.totalUses} ครั้ง\n\`\`\``
        ),
        new TextDisplayBuilder().setContent(
          `・${perUseEmoji} ค่าคอมต่อครั้ง\n\`\`\`\n${COMMISSION_PER_REDEMPTION_THB} บาท\n\`\`\``
        ),
        new TextDisplayBuilder().setContent(
          `・${totalEmoji} รวมรายได้ (${rangeLabel})\n\`\`\`\n${stats.totalCommissionThb} บาท\n\`\`\``
        )
      )

      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))

      // ── บล็อกที่ 3: แบนเนอร์โปรโมท — ย้ายมาอยู่ "เหนือ" footer ตั้งแต่รอบ 8
      // .setURL('attachment://...') อ้างอิงไฟล์ที่แนบมาคู่กันผ่าน key `files:` ตอนส่ง/แก้
      // ข้อความ (ดู buildReportPayload() ด้านล่าง) — ชื่อไฟล์ต้องตรงกับ BANNER_FILENAME เป๊ะๆ
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(`attachment://${BANNER_FILENAME}`)
            .setDescription('Milo Bot partner banner')
        )
      )

      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))

      // ── บล็อกที่ 4 (สุดท้ายของ Container นี้): footer เล็กๆ ("-# " = markdown "subtext"
      // ของ Discord ตัวหนังสือเล็กสีเทาจางๆ) — 🆕 รอบ 9: Container จบตรงนี้เลย ไม่มีปุ่ม/
      // dropdown ต่อท้ายในนี้อีกต่อไป (ย้ายออกไปอยู่นอกกรอบแล้ว ดู buildReportActionRows())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# ╰ ꒰ Milo Bot · ระบบรายงานค่าคอมมิชชั่นอัตโนมัติ ꒱ ╯')
      )
  );
}

/**
 * 🆕 รอบ 9: สร้างแถว dropdown เลือกช่วงเวลา + ปุ่ม "ข้อกำหนด" แยกออกมาจาก
 * buildReportContainer() แล้ว (เดิมรอบ 8 ผูกไว้ข้างใน Container เลย) — ตามที่ขอ "เอาบล็อก
 * ให้คลุมแค่ถึง footer พอ ปุ่ม/dropdown ไว้ข้างล่างบล็อกอีกที" คืนเป็น array ของ
 * ActionRowBuilder 2 แถว เอาไปต่อท้าย [container] ตอนส่ง/แก้ข้อความ (ดู buildReportPayload())
 *
 * ปุ่ม "ข้อกำหนด" ใส่อิโมจิ custom ใหม่ (CUSTOM_EMOJI_IDS.terms) ผ่าน resolveButtonEmoji()
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
 * รวมขั้นตอน "หาโค้ด → คำนวณสถิติตามช่วงเวลา → สร้าง Container + แถวปุ่ม/dropdown" ไว้จุดเดียว
 * ใช้ร่วมกันทั้ง syncCodeReportMessage() (เรียกตอนมีเหตุการณ์ใหม่ๆ) และ
 * handleReportRangeSelect() (เรียกตอนมีคนกด dropdown เปลี่ยนช่วงเวลา) กันเขียนซ้ำ
 *
 * 🆕 รอบ 9: คืนค่าเพิ่มอีก field คือ `actionRows` แยกจาก `container` แล้ว (เดิมรอบ 8
 * ปุ่ม/dropdown ถูกผูกไว้ข้างใน container เลย) ตอนใช้งานต้องส่ง
 * `components: [payload.container, ...payload.actionRows]` เสมอ (ดูตัวอย่างใน
 * syncCodeReportMessage()/handleReportRangeSelect() ด้านล่าง) — ลืมกระจาย actionRows
 * ต่อท้ายจะทำให้การ์ดไม่มีปุ่ม/dropdown ให้กดเลย
 * @param {import('discord.js').Client} client ใช้หาอิโมจิ custom จาก ID
 * @param {string} code
 * @param {'today'|'month'|'all'} range
 * @returns {{ container: import('discord.js').ContainerBuilder, actionRows: import('discord.js').ActionRowBuilder[], files: import('discord.js').AttachmentBuilder[] } | null}
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
    container: buildReportContainer(stats, range, client),
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
 * 🆕 ตั้งแต่รอบ 8: การ์ดเก่า (ก่อนย้ายมา Components V2) เป็น "plain content" มาก่อน — การ
 * .edit() ครั้งแรกของแต่ละการ์ดหลังอัปเดตนี้จึงเท่ากับ "เพิ่มธง IS_COMPONENTS_V2 ทีหลัง"
 * ซึ่งไม่มีเอกสารยืนยันจาก Discord ว่าทำได้เสมอ — ห่อ .edit() ด้วย try/catch ซ้อนอีกชั้น
 * ถ้าล้มเหลว จะลบข้อความเก่าทิ้งแล้วส่งใหม่แทนอัตโนมัติ (การันตีว่าได้การ์ด Components V2
 * แท้ๆ เสมอ ไม่ค้างเป็นข้อความครึ่งๆ กลางๆ)
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
          // เคลียร์ content/embeds/attachments เก่าทิ้งด้วยเสมอ — เผื่อข้อความเดิมของโค้ดนี้
          // เคยผ่านเวอร์ชัน plain content/Embed/รูปภาพแนบมาก่อน (มีมาแล้วหลายรอบ ดูคอมเมนต์
          // หัวไฟล์) ถ้าไม่เคลียร์ ของเก่าจะค้างซ้อนอยู่ (Discord แก้เฉพาะ field ที่ส่งมา
          // เท่านั้น ไม่ได้ล้างของเดิมให้อัตโนมัติ) — content: null คือวิธีเคลียร์ content
          // เก่าทิ้งตอน edit() ของ discord.js (ไม่ใช่การ "ใส่ content" เข้าไปในข้อความ
          // Components V2 ซึ่งทำไม่ได้ — นี่แค่บอกให้ล้างค่าเดิมออก)
          await existingMessage.edit({
            content: null,
            embeds: [],
            attachments: [],
            // 🆕 รอบ 9: components ตอนนี้เป็น 2 ก้อนเรียงกัน — [container, ...actionRows]
            // (container ครอบแค่ข้อความ+รูปถึง footer, actionRows คือปุ่ม/dropdown "นอกกรอบ")
            components: [payload.container, ...payload.actionRows],
            files: payload.files,
            flags: MessageFlags.IsComponentsV2,
          });
          return;
        } catch (editError) {
          // แก้ไขข้อความเดิมไม่สำเร็จ — อาจเพราะเพิ่มธง Components V2 เข้าไปทีหลังให้ข้อความ
          // ที่เคยเป็น plain content มาก่อนไม่ได้ตามที่กังวลไว้ด้านบน → ลบข้อความเก่าทิ้งแล้ว
          // ส่งใหม่แทน (fall through ไปส่งใหม่ด้านล่างสุดของฟังก์ชัน) วิธีนี้การันตีว่าได้
          // ข้อความ Components V2 แท้ๆ เสมอ ไม่เสี่ยงค้างเป็นข้อความครึ่งๆ กลางๆ
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
      components: [payload.container, ...payload.actionRows],
      files: payload.files,
      flags: MessageFlags.IsComponentsV2,
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
 * ⚠️ จุดนี้ไม่ต้องห่อ try/catch เพิ่มเรื่องธง Components V2 เหมือน syncCodeReportMessage()
 * เพราะการ์ดที่มี dropdown ให้กดได้ ต้องผ่าน syncCodeReportMessage() มาสร้าง/แก้เป็น
 * Components V2 แท้ๆ มาก่อนอยู่แล้วเสมอ (ไม่งั้นจะไม่มี dropdown ให้กดตั้งแต่แรก)
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

  // เคลียร์ content/embeds/attachments เก่าด้วยเสมอ แล้วแนบไฟล์แบนเนอร์กลับเข้าไปใหม่ทุกครั้ง
  // (ไม่งั้นตอนเปลี่ยนช่วงเวลา แบนเนอร์จะหายไปเพราะ attachments: [] ล้างของเดิมออกหมดรวมถึง
  // แบนเนอร์ที่เคยแนบไว้ด้วย — ต้องส่ง files: payload.files คู่กันเสมอ)
  await interaction.update({
    content: null,
    embeds: [],
    attachments: [],
    components: [payload.container, ...payload.actionRows],
    files: payload.files,
    flags: MessageFlags.IsComponentsV2,
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
