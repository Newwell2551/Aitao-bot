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
// ⚠️ ห้อง #referral-earnings สร้างขึ้นใน "เซิร์ฟควบคุม" เดียวกับที่ /dev กับ /referral ใช้
// อยู่แล้ว (ตาม GUILD_ID ใน .env) ตั้งสิทธิ์ให้เห็นได้แค่บอทเท่านั้น (ซ่อนจากสมาชิกทุกคน
// รวมถึงแอดมิน เหมือน asset-storage) เพราะเป็นข้อมูลรายได้ "รวมทุกโค้ด" ของทั้งระบบ ไม่ควร
// เปิดเผยสาธารณะ — น้องหนาว (เจ้าของบอท) เข้าไปดูเองในเซิร์ฟควบคุมได้ตลอดผ่านสิทธิ์
// Administrator (ซึ่ง bypass permission overwrite ได้อัตโนมัติอยู่แล้ว)
//
// 🆕 อัปเดต 20 ก.ย. 2569 (รอบ 13 — ล่าสุด) — เพิ่มห้อง #partner-earnings "ในเซิร์ฟของผู้ขาย
// เอง" ด้วย (คนละที่กับห้อง #referral-earnings ของเซิร์ฟควบคุมด้านบน) ตามที่น้องหนาวขอ:
// ทันทีที่เพิ่มโค้ดให้ผู้ขายคนไหน (พร้อมตั้ง sellerGuildId ไว้) การ์ดสถิติของโค้ดนั้นจะ
// "เด้งไปโผล่ในเซิร์ฟของผู้ขายคนนั้นด้วยอัตโนมัติ" เหมือนบอทที่อยู่ในเซิร์ฟนั้นสร้างห้อง/
// ส่งข้อความเองเลย — โชว์ "เฉพาะการ์ดรายงานสถิติ" เท่านั้น ไม่มีคำสั่งลับ /referral โผล่ให้
// เห็นเลย (คำสั่งนี้ล็อกด้วย setDefaultMemberPermissions(0) + เช็ค OWNER_ID อยู่แล้วในทุก
// เซิร์ฟอยู่แล้ว ไม่ต้องทำอะไรเพิ่มเรื่องนี้)
//
// ห้อง #partner-earnings ในเซิร์ฟผู้ขาย ตั้งสิทธิ์ "เฉพาะผู้ขายคนนั้น + แอดมินเซิร์ฟ" ตามที่
// น้องหนาวเลือกไว้ (ดู getOrCreateSellerReportChannel() ด้านล่าง): ปฏิเสธ @everyone,
// อนุญาตเฉพาะ sellerDiscordId ของโค้ดนั้น — แอดมินเซิร์ฟเห็นได้เองอยู่แล้วเพราะสิทธิ์
// Administrator bypass permission overwrite ได้เหมือนกับที่น้องหนาวเห็นห้องเซิร์ฟควบคุม
//
// ⚠️ ข้อจำกัดที่ต้องรู้ไว้: ฟีเจอร์นี้ทำงานได้ก็ต่อเมื่อ (1) บอทเป็นสมาชิกของเซิร์ฟผู้ขายอยู่
// แล้ว (2) บอทมีสิทธิ์ "Manage Channels" ในเซิร์ฟนั้น (ไว้สร้างห้องใหม่ได้) — ถ้าขาดอย่างใด
// อย่างหนึ่ง ฟังก์ชันจะ warn ใน console เฉยๆ ไม่ throw ออกมา (การ์ดในเซิร์ฟควบคุมยังทำงาน
// ปกติเสมอ ไม่ได้รับผลกระทบ) น้องหนาวเช็คได้จาก Railway logs ว่าทำไมไม่ขึ้นในเซิร์ฟผู้ขาย
//
// 🆕 เพิ่มอีก 1 ฟังก์ชัน: postPayoutQrForCode() — ตอบโจทย์ที่น้องหนาวอยากได้ "ระบบกึ่ง
// อัตโนมัติ" ตอนปิดโค้ด (เช่นตอนสิ้นเดือน): พอกด /referral deactivate บอทจะเช็คอัตโนมัติว่า
// โค้ดนั้นมียอดค้างจ่ายไหม ถ้ามี + ตั้งเลขพร้อมเพย์ไว้แล้ว จะสร้าง QR โอนเงิน (ยอดฝังในตัว
// QR เป๊ะๆ ตามระบบคำนวณ ไม่ต้องพิมพ์เอง) แล้วโพสต์เข้าไปทั้งห้อง #referral-earnings (เซิร์ฟ
// ควบคุม) และห้อง #partner-earnings (เซิร์ฟผู้ขาย ถ้าตั้งไว้) ให้อัตโนมัติเลย — ย้ำ: นี่ยัง
// "ไม่ใช่การตัดเงินอัตโนมัติจริง" นะครับ (QR พร้อมเพย์ทำงานแบบ "คนสแกน = คนจ่ายเงินออก"
// เสมอ ไม่มีทาง "สแกนเพื่อรับเงิน" ได้ — น้องหนาวยังต้องเป็นคนสแกนจ่ายเองอยู่ดี แค่ตอนนี้บอท
// ช่วยสร้าง+โพสต์ QR ให้อัตโนมัติแทนที่จะต้องมารัน /referral payout เองทุกครั้ง) ตัดเงิน
// อัตโนมัติแบบเต็มรูปแบบต้องผ่าน Stripe Connect ซึ่งเช็คแล้วมีข้อจำกัดชัดเจนสำหรับคู่บัญชี
// ไทย↔ไทย (ไม่รองรับ separate charges/transfers) — เก็บไว้เป็นไอเดียอนาคตถ้าน้องหนาวอยาก
// คุยกับทีม Stripe โดยตรงเพื่อหาทางที่ใช้ได้จริงสำหรับเคสนี้
//
// 🆕 ประวัติการปรับหน้าตาการ์ด — สลับไปมาหลายรอบกว่าจะลงตัว สรุปสั้นๆ ว่าเคยลองอะไรมาบ้าง:
//   รอบ 1: Embed ธรรมดา (addFields 3 ช่องเล็ก + 1 ช่องใหญ่)
//   รอบ 2 (เข้าใจผิด — เลิกใช้แล้ว): ลองวาดเป็นรูปภาพจริงด้วย canvas เพราะเข้าใจผิดว่าภาพเรฟ
//     "MAMOMI STORE" ต้องวาดถึงจะได้กรอบกล่อง (ไฟล์ utils/drawReferralReportCard.js ที่ค้าง
//     อยู่บนเครื่องตอนนี้ไม่ได้ใช้แล้ว ลบทิ้งได้เลย)
//   รอบ 3: กลับมาเป็น Embed แต่เปลี่ยน description เป็น "・ป้ายกำกับ" + code block
//     (```ค่า```) — เพราะน้องหนาวก็อปข้อความดิบจากบอทเรฟมาให้ดูตรงๆ แล้วรู้ว่าไม่ใช่รูปภาพเลย
//   รอบ 4: จัดเป็นกริด 2x2 ด้วย embed fields (inline:true คั่นด้วย field ล่องหน)
//   รอบ 5: เลิกใช้ Embed ไปเลย เปลี่ยนเป็น "plain message content" ธรรมดา จำลองกริด 2
//     คอลัมน์เองด้วยการเว้นช่องว่างในตัว code block แทน (กันแถบสีซ้ายมือของ Embed)
//   รอบ 6: (1) เอาบรรทัด "อัปเดตล่าสุด" ท้ายการ์ดออก (2) แยกค่ากลับเป็นกล่องของใครของมัน
//     (3) อิโมจิ custom ย่อจาก 5 ID เหลือ 2 ID (title + status)
//   รอบ 7: (1) แก้ชื่อแบรนด์ที่เคยพิมพ์ผิดเป็น "Aitao Bot" กลับเป็น **Milo Bot** (2) แนบรูป
//     แบนเนอร์โปรโมทพาร์ทเนอร์ (ที่น้องหนาวออกแบบเอง) ไปกับการ์ดทุกใบ
//   รอบ 8: ย้ายทั้งการ์ดมาใช้ Discord Components V2 (ContainerBuilder ไม่ตั้งสี → ไม่มีแถบ
//     ซ้ายมือเลย) จัดเป็น "ชุดบล็อก" ด้วย Separator เหมือน /builder
//   รอบ 9: อิโมจิ custom ครบทุกช่อง + ย้ายปุ่ม/dropdown ออกมานอก Container + ปุ่ม "ข้อกำหนด"
//     มีไอคอนอิโมจิ custom
//   รอบ 10: ลองจับคู่ 2 ค่า/แถวไว้ใน code block เดียวกัน (padCol()) จำลอง 2x2 แบบไม่มีแถบสี
//     — ดูแล้วไม่สวยเท่าที่หวัง
//   รอบ 11: น้องหนาวขอ "แบบแถบสีมาก็ได้ๆๆ" พร้อมให้สีมาด้วย (#7b8eda) — กลับไปใช้
//     **EmbedBuilder** (เลิกใช้ Components V2 ทั้งไฟล์) เพราะ Embed field (`inline: true`)
//     เป็นทางเดียวที่ Discord รองรับกริด 2 คอลัมน์แบบกล่องแยกจริงๆ ที่อยู่บรรทัดเดียวกันได้
//   รอบ 12: แปลข้อความที่ผู้ใช้เห็นจริงทั้งหมด (label, สถานะ, ปุ่ม, dropdown, modal, หัวข้อ
//     ห้อง) เป็นภาษาอังกฤษล้วน (ห้อง/คำสั่งนี้มีแค่น้องหนาวเห็น เลือกภาษาเดียวง่ายกว่าทำสลับ)
//   🆕 รอบ 13 (ปัจจุบัน): เพิ่มห้อง #partner-earnings ในเซิร์ฟผู้ขายเอง + ระบบโพสต์ QR
//     จ่ายเงินอัตโนมัติตอนปิดโค้ด (ดูหมายเหตุยาวด้านบน)
//
//   โครงสร้างการ์ด (ดู buildReportEmbed() ด้านล่าง): title (ไอคอน+ชื่อโค้ด) → description
//   (ผู้ขาย) → fields จัดกริด 2x2 จริงด้วย inline:true (แถว 1 = สถานะ|ใช้ไปแล้ว, แถว 2 =
//   ค่าคอมต่อครั้ง|รวมรายได้ คั่นด้วย field ล่องหนระหว่างแถว) → .setImage() แบนเนอร์ในตัว
//   embed เอง → .setFooter() ข้อความปิดท้ายเล็กๆ — เหมือนกันทั้งการ์ดในเซิร์ฟควบคุมและ
//   เซิร์ฟผู้ขาย (ใช้ buildReportPayload() ก้อนเดียวกันทั้งคู่ ไม่มีความต่างของเนื้อหา)
//
//   ⚠️ **จุดเสี่ยงทางเทคนิคที่ต้องรู้**: การ์ดในเซิร์ฟควบคุมที่เคย sync ผ่านรอบ 8-10 มาแล้ว
//   (ตั้งค่าเป็น Components V2 ไปแล้วจริง) **ยืนยันแน่นอนแล้วว่าเอาธง IS_COMPONENTS_V2 ออก
//   ไม่ได้อีกเลย** การ .edit() การ์ดพวกนี้กลับไปเป็น Embed **จะ fail แน่นอน 100%** — โชคดีที่
//   try/catch ซ้อนใน syncControlGuildReportMessage() (เดิมทำไว้ตั้งแต่รอบ 8) ดักเคสนี้ได้
//   พอดี: พอ edit() fail จะลบข้อความเก่าทิ้งแล้วส่งใหม่เป็น Embed แทนอัตโนมัติ ไม่ต้องแก้
//   อะไรเพิ่ม — แค่การ์ดที่เคยผ่าน Components V2 มาก่อน จะ "เด้ง" ไปอยู่ล่างสุดของห้องแค่
//   ครั้งแรกครั้งเดียว (การ์ดใหม่ในเซิร์ฟผู้ขาย — ฟีเจอร์รอบ 13 — ไม่มีปัญหานี้เลยเพราะเกิด
//   หลังรอบ 11 ที่กลับมาใช้ Embed แล้ว เป็น Embed มาตั้งแต่ข้อความแรกที่ส่ง)
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
  TextInputBuilder, // 🆕 รอบ 14: ใช้สร้างช่องกรอกเลขพร้อมเพย์ในปุ่ม "Payment" self-service
  TextInputStyle,   // 🆕 รอบ 14: เหมือนกัน
  AttachmentBuilder,
  EmbedBuilder, // 🆕 รอบ 11: กลับมาใช้ Embed แทน Components V2 (ContainerBuilder ฯลฯ) แล้ว
} = require('discord.js');
const {
  listAllCodes,
  getCodeCommissionStats,
  getUnpaidCommissionSummary,
  saveReportMessageId,
  saveSellerReportMessageId,
  savePromptPayId, // 🆕 รอบ 14: ใช้บันทึกเลขพร้อมเพย์ตอนผู้ขายกดปุ่ม "Payment" กรอกเอง
  COMMISSION_PER_REDEMPTION_THB,
  PROMPTPAY_ID_PATTERN, // 🆕 รอบ 14: กฎเช็ครูปแบบเลขพร้อมเพย์ — จุดเดียวกับที่ /referral setpromptpay ใช้
} = require('./referralStorage');
// 🆕 รอบ 13: ใช้สร้าง QR พร้อมเพย์ตอนปิดโค้ด (postPayoutQrForCode() ด้านล่าง) — ฟังก์ชัน
// เดียวกับที่ /referral payout ใน commands/referral.js ใช้อยู่แล้ว ไม่ต้องเขียนใหม่
const { generatePromptPayQrBuffer } = require('./promptpayQr');

const REPORT_CHANNEL_NAME = 'referral-earnings';
// 🆕 รอบ 13: ชื่อห้องรายงานที่จะไปสร้างในเซิร์ฟของผู้ขายเอง — ตั้งใจใช้ชื่อคนละอันกับ
// REPORT_CHANNEL_NAME ด้านบน (ห้องนั้นเป็นของเซิร์ฟควบคุม รวมทุกโค้ด) กันสับสนว่าเป็นห้อง
// เดียวกัน — ห้องนี้จะมีแค่การ์ดของ "โค้ดที่ผูกกับเซิร์ฟนั้น" เท่านั้น (อาจมีมากกว่า 1 การ์ด
// ถ้าเซิร์ฟเดียวกันมีหลายโค้ดชี้มาที่นี่ — getOrCreateSellerReportChannel() รองรับได้เอง
// เพราะแต่ละโค้ดเก็บ sellerReportMessageId ของตัวเองแยกกัน ใช้ channel เดียวกันได้ปกติ)
const SELLER_REPORT_CHANNEL_NAME = 'partner-earnings';

// 🆕 รอบ 11: สีแถบซ้ายมือของการ์ด — น้องหนาวส่งมาเองตรงๆ (#7b8eda) ใช้กับ
// EmbedBuilder.setColor() ใน buildReportEmbed() ด้านล่าง
const CARD_ACCENT_COLOR = 0x7b8eda;

// แบนเนอร์โปรโมทพาร์ทเนอร์ — รูปคงที่ (ไม่เปลี่ยนตามโค้ด) ที่น้องหนาวออกแบบเอง แนบไปกับ
// การ์ดรายงานทุกใบเสมอ (แสดงผ่าน embed.setImage() — Discord จะวางรูปนี้ไว้ในตัว embed เอง
// เหนือแถบ footer เล็กๆ ด้านล่างโดยอัตโนมัติ ไม่ต้องจัดตำแหน่งเอง) วางไฟล์ไว้ที่
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
// 🆕 รอบ 12: label เป็นภาษาอังกฤษแล้ว (ดูหมายเหตุหัวไฟล์)
const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];
const RANGE_LABELS = Object.fromEntries(RANGE_OPTIONS.map((o) => [o.value, o.label]));

const RANGE_SELECT_PREFIX = 'referral_range_select_';
const TERMS_BUTTON_ID = 'referral_terms_button';
const TERMS_MODAL_ID = 'referral_terms_modal';

// 🆕 รอบ 14: ปุ่ม "Payment" ข้างปุ่ม "Terms" — ให้ผู้ขาย "กรอกเลขพร้อมเพย์ของตัวเองได้เลย"
// ผ่านโมดัลในห้องรายงานยอด (ทั้งเซิร์ฟควบคุมและเซิร์ฟผู้ขาย) แทนที่จะต้องให้น้องหนาวคอย
// พิมพ์ให้ทีละคนผ่าน /referral add หรือ /referral setpromptpay — ตัดขั้นตอนกลาง (เช่น
// Google Form + ก๊อปมาใส่บอทเอง) ออกไปเลย ลดความเสี่ยงพิมพ์ผิด/สลับคนด้วย
//
// ต้องผูก "โค้ด" ไว้ใน customId เหมือน dropdown ช่วงเวลาด้านบน (ใช้ prefix แบบเดียวกัน)
// เพราะการ์ด 1 ใบ = 1 โค้ด และแต่ละโค้ดมีเลขพร้อมเพย์ของตัวเองแยกกัน
const PAYMENT_BUTTON_PREFIX = 'referral_payment_button_';
const PAYMENT_MODAL_PREFIX = 'referral_payment_modal_';

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
  payment: '1551266671841517638', // 🆕 รอบ 14: ไอคอนปุ่ม "Payment" — น้องหนาวส่ง ID มาแล้ว
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
 * หาห้องรายงานยอดที่มีอยู่แล้ว หรือสร้างใหม่ถ้ายังไม่มี — ห้องนี้เป็นของ "เซิร์ฟควบคุม"
 * เท่านั้น (pattern เดียวกับ assetStorage.js → getOrCreateAssetChannel()) ตั้งสิทธิ์ให้เห็น
 * ได้แค่บอท (ซ่อนจากทุกคนแม้แต่แอดมิน) เพราะรวมยอดของ "ทุกโค้ด" ไว้ในที่เดียว
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
      'Real-time commission earnings report per seller (auto-updated by the bot — do not delete/edit messages manually, the bot will just repost a new one)',
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
 * 🆕 [รอบ 13] หาห้องรายงานยอดที่มีอยู่แล้ว หรือสร้างใหม่ถ้ายังไม่มี — คนละฟังก์ชันกับ
 * getOrCreateReportChannel() ด้านบน เพราะห้องนี้อยู่ใน "เซิร์ฟของผู้ขายเอง" (คนละเซิร์ฟกับ
 * เซิร์ฟควบคุม) และสิทธิ์การเห็นต่างกัน: ตามที่น้องหนาวเลือกไว้ (AskUserQuestion) —
 * **"เฉพาะผู้ขายคนนั้น + แอดมินเซิร์ฟ"** เท่านั้น ไม่เปิดให้สมาชิกทั่วไปในเซิร์ฟเห็น
 *
 * กลไกสิทธิ์: ปฏิเสธ @everyone (ViewChannel) เหมือนห้องเซิร์ฟควบคุม แล้วอนุญาตเพิ่มเฉพาะ
 * sellerDiscordId ของโค้ดนั้น (ถ้ามี) — ส่วนแอดมินเซิร์ฟไม่ต้องตั้งอะไรเพิ่มเลย เพราะสิทธิ์
 * Administrator ของดิสคอร์ด "มองข้าม" (bypass) permission overwrite ได้อัตโนมัติอยู่แล้ว
 * (หลักการเดียวกับที่น้องหนาวเห็นห้อง #referral-earnings ของเซิร์ฟควบคุมได้เอง)
 *
 * ⚠️ ถ้ายังไม่ได้ผูกบัญชีดิสคอร์ดของผู้ขาย (sellerDiscordId เป็น null) จะสร้างห้องแบบไม่มี
 * ใครเห็นเลยนอกจากแอดมิน (เพราะไม่รู้จะอนุญาตให้ user ไหนดู) — ควรใส่ seller_discord_user
 * ตอน /referral add ไว้ด้วยเสมอถ้าจะใช้ฟีเจอร์นี้ ไม่งั้นห้องนี้จะไม่มีประโยชน์กับผู้ขายเลย
 *
 * @param {import('discord.js').Guild} guild เซิร์ฟของผู้ขาย
 * @param {string|null} sellerDiscordId Discord user ID ของผู้ขาย (ถ้ามี)
 */
async function getOrCreateSellerReportChannel(guild, sellerDiscordId) {
  const existing = guild.channels.cache.find(
    (channel) => channel.name === SELLER_REPORT_CHANNEL_NAME && channel.type === ChannelType.GuildText
  );

  if (existing) {
    // เช็คสิทธิ์บอทในห้องเดิมก่อนเสมอ (เหมือน getOrCreateReportChannel() ด้านบน)
    const me = guild.members.me;
    const currentPerms = existing.permissionsFor(me);
    const hasRequiredAccess = currentPerms?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ]);
    if (!hasRequiredAccess) {
      await existing.permissionOverwrites.edit(me.id, { ViewChannel: true, SendMessages: true });
    }
    // เช็คสิทธิ์ของผู้ขายด้วยทุกครั้ง (เผื่อเปลี่ยน seller_discord_user ทีหลัง หรือผู้ขายคน
    // เดิมยังไม่เคยได้สิทธิ์เห็นห้องนี้มาก่อน) — ตั้งให้ตรงกับ sellerDiscordId ล่าสุดเสมอ
    if (sellerDiscordId) {
      const sellerPerms = existing.permissionsFor(sellerDiscordId);
      if (!sellerPerms?.has(PermissionFlagsBits.ViewChannel)) {
        await existing.permissionOverwrites.edit(sellerDiscordId, { ViewChannel: true });
      }
    }
    return existing;
  }

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: guild.members.me.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
    },
  ];
  if (sellerDiscordId) {
    permissionOverwrites.push({ id: sellerDiscordId, allow: [PermissionFlagsBits.ViewChannel] });
  }

  return guild.channels.create({
    name: SELLER_REPORT_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic: 'Your Milo Bot partner earnings report (auto-updated by the bot) — only you and server admins can see this channel.',
    permissionOverwrites,
  });
}

/**
 * สร้างการ์ดรายงานยอดของโค้ด 1 อัน เป็น EmbedBuilder ก้อนเดียว — ใช้ก้อนเดียวกันทั้งการ์ด
 * ในเซิร์ฟควบคุมและการ์ดในเซิร์ฟผู้ขาย (รอบ 13) เนื้อหาเหมือนกันเป๊ะ ต่างกันแค่ "ที่อยู่"
 *
 * โครงสร้าง: title (ไอคอน+ชื่อโค้ด) → description (ผู้ขาย) → fields จัดกริด 2x2 จริงด้วย
 * `inline: true` (แถว 1 = สถานะ|ใช้ไปแล้ว, แถว 2 = ค่าคอมต่อครั้ง|รวมรายได้ — คั่นระหว่าง
 * 2 แถวด้วย field "ล่องหน" ชื่อ/ค่าเป็น zero-width-space `inline:false` บังคับให้ Discord
 * ตัดขึ้นบรรทัดใหม่พอดีทุก 2 ช่อง ไม่งั้น Discord จะแพ็ก field แบบ auto-wrap ตามความกว้างที่
 * เหลือเอง ไม่ใช่นับจำนวนช่องแบบที่เราต้องการ) → 🆕 field "แก้ไขล่าสุด" (ถ้าเคยมีใครตั้งเลข
 * พร้อมเพย์แล้ว — ดูคอมเมนต์ด้านล่าง) → .setImage() แบนเนอร์ (แสดงในตัว embed เองเหนือ footer
 * อัตโนมัติ) → .setFooter() ข้อความปิดท้ายเล็กๆ → .setColor() แถบสีซ้ายมือ
 *
 * 🆕 [21 ก.ย. 2569] เรื่อง field "แก้ไขล่าสุด" — น้องหนาวขอให้โชว์ "ใครแก้เลขพร้อมเพย์ล่าสุด"
 * ไว้ในบล็อกใต้ข้อความ footer (╰ ꒰ Milo Bot · ... ꒱ ╯) เป๊ะๆ แต่ทำแบบนั้นจริงๆ ไม่ได้ครับ —
 * `.setFooter()` คือ "องค์ประกอบสุดท้ายสุดของ embed" ตามลำดับที่ Discord กำหนดตายตัว
 * (title → description → fields → image → footer) ไม่มีทางเขียนอะไรต่อท้ายมันได้อีก แถม
 * ข้อความใน footer เป็น plain text ล้วนๆ ด้วย (ใส่ `<@userId>` ไปก็จะขึ้นเป็นตัวหนังสือดิบๆ
 * ไม่ใช่แท็กที่กดได้จริง) ซึ่งขัดกับที่น้องหนาวต้องการเป๊ะๆ คือ "ตามตัวได้แน่นอน" (กดแท็กแล้ว
 * เด้งไปโปรไฟล์จริง) — เลยเลือกใส่เป็น field ธรรมดาแทน วางไว้เป็นช่องสุดท้ายก่อนรูปแบนเนอร์/
 * footer (ตำแหน่งที่ใกล้เคียงที่สุดที่ทำได้ในกรอบของ Discord) field รองรับ `<@userId>` แล้ว
 * เรนเดอร์เป็นแท็กกดได้จริงตามที่ขอ — ถ้ายังไม่เคยมีใครตั้งเลขพร้อมเพย์เลย (promptpayUpdatedBy
 * เป็น null) จะไม่โชว์ field นี้เลย กันการ์ดโค้ดใหม่ๆ ดูรกเกินจำเป็น
 * @param {{ code: string, sellerLabel: string, active: boolean, totalUses: number, totalCommissionThb: number, promptpayId?: string|null, promptpayUpdatedBy?: string|null }} stats
 * @param {'today'|'month'|'all'} range
 * @param {import('discord.js').Client} client ใช้หาอิโมจิ custom จาก ID
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildReportEmbed(stats, range, client) {
  const rangeLabel = RANGE_LABELS[range] ?? RANGE_LABELS.all;

  const titleEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.title, '📊');
  // อิโมจิสถานะ: ใช้ ID เดียวกันทั้งเปิด/ปิดใช้งาน (น้องหนาวส่งมาแค่ตัวเดียว ไม่ได้แยกสี) —
  // ความต่างเปิด/ปิดสื่อผ่านข้อความ "Active"/"Inactive" แทน ไม่ใช่สีไอคอนอีกต่อไป
  const statusEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.status, stats.active ? '🟢' : '🔴');
  const statusText = stats.active ? 'Active' : 'Inactive';
  const usesEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.uses, '🔁');
  const perUseEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.perUse, '💸');
  const totalEmoji = resolveEmojiById(client, CUSTOM_EMOJI_IDS.total, '💰');

  const fields = [
    // ── แถว 1: สถานะ | ใช้ไปแล้ว ──────────────────────────────────────
    { name: `・${statusEmoji} Status`, value: `\`\`\`\n${statusText}\n\`\`\``, inline: true },
    {
      name: `・${usesEmoji} Uses (${rangeLabel})`,
      value: `\`\`\`\n${stats.totalUses}\n\`\`\``,
      inline: true,
    },
    // field ล่องหน (zero-width space) บังคับตัดบรรทัดใหม่ก่อนแถวถัดไป — ไม่งั้น Discord
    // จะพยายามแพ็ก field ที่ 3 ต่อท้ายแถวเดิมถ้าจอกว้างพอ ทำให้ไม่ได้ 2x2 จริงตามที่ขอ
    { name: '​', value: '​', inline: false },
    // ── แถว 2: ค่าคอมต่อครั้ง | รวมรายได้ ─────────────────────────────
    {
      name: `・${perUseEmoji} Per Use`,
      value: `\`\`\`\n${COMMISSION_PER_REDEMPTION_THB} THB\n\`\`\``,
      inline: true,
    },
    {
      name: `・${totalEmoji} Total Earned (${rangeLabel})`,
      value: `\`\`\`\n${stats.totalCommissionThb} THB\n\`\`\``,
      inline: true,
    },
  ];

  // 🆕 [21 ก.ย. 2569] Audit trail — โชว์เฉพาะตอนเคยมีใครตั้ง/แก้เลขพร้อมเพย์แล้วจริงๆ เท่านั้น
  // (promptpayUpdatedBy ไม่ใช่ null) ใช้ `<@id>` แบบนี้ตรงๆ ใน field value ได้เลย Discord จะ
  // เรนเดอร์เป็นแท็กชื่อที่กดได้จริงอัตโนมัติ (field รองรับ mention ต่างจาก footer)
  if (stats.promptpayUpdatedBy) {
    fields.push({
      name: '・🔄 Payout Info Last Updated By',
      value: `<@${stats.promptpayUpdatedBy}> — \`${stats.promptpayId}\``,
      inline: false,
    });
  }

  return new EmbedBuilder()
    .setColor(CARD_ACCENT_COLOR)
    .setTitle(`${titleEmoji} ${stats.code}`)
    .setDescription(`Seller: **${stats.sellerLabel}**`)
    .addFields(...fields)
    .setImage(`attachment://${BANNER_FILENAME}`)
    .setFooter({ text: '╰ ꒰ Milo Bot · Automated Commission Report ꒱ ╯' });
}

/**
 * สร้างแถว dropdown เลือกช่วงเวลา + ปุ่ม "ข้อกำหนด" — ส่งเป็น `components` แยกต่างหากจาก
 * `embeds` เสมอ (Discord render ActionRow อยู่นอกกรอบ embed โดยธรรมชาติอยู่แล้ว)
 *
 * ปุ่ม "ข้อกำหนด" ใส่อิโมจิ custom (CUSTOM_EMOJI_IDS.terms) ผ่าน resolveButtonEmoji()
 * แทน resolveEmojiById() ธรรมดา เพราะ .setEmoji() ของปุ่มต้องการ object ไม่ใช่ string
 * @param {import('discord.js').Client} client ใช้หาอิโมจิ custom ของปุ่มข้อกำหนด
 * @param {string} code
 * @param {'today'|'month'|'all'} range ช่วงเวลาที่กำลังโชว์อยู่ตอนนี้ (ใช้ติ๊ก default ใน dropdown)
 * @returns {import('discord.js').ActionRowBuilder[]}
 */
function buildReportActionRows(client, code, range) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${RANGE_SELECT_PREFIX}${code}`)
    .setPlaceholder('Select a time range')
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
    .setLabel('Terms')
    .setEmoji(resolveButtonEmoji(client, CUSTOM_EMOJI_IDS.terms, '📜'))
    .setStyle(ButtonStyle.Secondary);

  // 🆕 รอบ 14: ปุ่ม "Payment" อยู่แถวเดียวกับปุ่ม "Terms" เลย (ข้างๆ กันตามที่น้องหนาวขอ) —
  // customId ผูกกับโค้ดนี้โดยเฉพาะ (เหมือน dropdown เลือกช่วงเวลาด้านบน) กันเข้าใจผิดว่า
  // กดแล้วกรอกให้โค้ดไหนไม่รู้ ตัวสิทธิ์ที่ว่าใครกดได้ เช็คตอนกด (handlePaymentButton)
  // ไม่ใช่ตอนสร้างปุ่ม เพราะปุ่มต้องโชว์เหมือนกันสำหรับทุกคนที่เห็นข้อความอยู่แล้ว
  const paymentButton = new ButtonBuilder()
    .setCustomId(`${PAYMENT_BUTTON_PREFIX}${code}`)
    .setLabel('Payment')
    .setEmoji(resolveButtonEmoji(client, CUSTOM_EMOJI_IDS.payment, '💳'))
    // 🆕 รอบ 14 (แก้): น้องหนาวขอสีขาว — ดิสคอร์ดไม่มีสไตล์ปุ่มสีขาวจริงๆ ให้ใช้ (มีแค่ 4 แบบ:
    // Primary ฟ้าม่วง, Secondary เทา, Success เขียว, Danger แดง) เลยใช้ Secondary (เทา) ซึ่ง
    // เป็นสีที่ใกล้เคียง/อ่อนที่สุดที่มีให้เลือก — ผลคือจะเป็นสีเดียวกับปุ่ม "Terms" ข้างๆ กันเลย
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(termsButton, paymentButton),
  ];
}

/**
 * รวมขั้นตอน "หาโค้ด → คำนวณสถิติตามช่วงเวลา → สร้าง Embed + แถวปุ่ม/dropdown" ไว้จุดเดียว
 * ใช้ร่วมกันทั้งการ์ดในเซิร์ฟควบคุมและเซิร์ฟผู้ขาย รวมถึง handleReportRangeSelect() (ตอนมี
 * คนกด dropdown เปลี่ยนช่วงเวลา ไม่ว่าจะกดจากการ์ดในเซิร์ฟไหนก็ตาม) กันเขียนซ้ำ
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
    // 🆕 [21 ก.ย. 2569] ส่งต่อไปให้ buildReportEmbed() โชว์เป็นบรรทัด audit trail "แก้ไขล่าสุด
    // โดยใคร" บนการ์ด — null ทั้งคู่ถ้ายังไม่เคยมีใครตั้งเลขพร้อมเพย์ให้โค้ดนี้เลย
    promptpayId: codeEntry.promptpayId,
    promptpayUpdatedBy: codeEntry.promptpayUpdatedBy,
  };

  return {
    embed: buildReportEmbed(stats, range, client),
    actionRows: buildReportActionRows(client, normalizedCode, range),
    files: [buildBannerAttachment()],
  };
}

/**
 * อัปเดต (หรือสร้างใหม่ถ้ายังไม่เคยมี) การ์ดรายงานยอดของโค้ด 1 อัน ทั้ง "เซิร์ฟควบคุม" และ
 * "เซิร์ฟของผู้ขายเอง" (ถ้าตั้ง sellerGuildId ไว้) — นี่คือฟังก์ชันหลักที่เรียกจากภายนอกไฟล์
 * นี้ (server.js, commands/referral.js) ทั้งหมด ตัวมันเองแค่เรียก 2 ฟังก์ชันย่อยด้านล่าง
 * (syncControlGuildReportMessage + syncSellerGuildReportMessage) ต่อกัน — แยกออกจากกัน
 * เพราะแต่ละที่มีเงื่อนไข/สิทธิ์คนละแบบ และ **ต้องไม่ให้อีกฝั่งพังตามกัน** (เช่น เซิร์ฟผู้ขาย
 * เพิ่งเปลี่ยนสิทธิ์บอทจนสร้างห้องไม่ได้ ก็ไม่ควรทำให้การ์ดในเซิร์ฟควบคุมอัปเดตไม่สำเร็จตามไปด้วย)
 *
 * เรียกจาก 3 จุด (ทุกจุดใช้ range='all' ค่าเริ่มต้น — โชว์ยอดตลอดกาลเป็นค่าเริ่มต้นเสมอ):
 *   1. server.js — หลัง completeRedemption() สำเร็จ (มีคนใช้โค้ดจ่ายเงินจริง)
 *   2. commands/referral.js — handleAdd() หลังสร้างโค้ดใหม่สำเร็จ (โชว์การ์ด 0 ครั้ง/0 บาท ทันที)
 *   3. commands/referral.js — handleDeactivate()/handleSetGuild() หลังมีการเปลี่ยนแปลง
 *
 * @param {import('discord.js').Client} client
 * @param {string} code
 * @param {'today'|'month'|'all'} [range='all']
 */
async function syncCodeReportMessage(client, code, range = 'all') {
  const normalizedCode = String(code || '').trim().toUpperCase();
  await syncControlGuildReportMessage(client, normalizedCode, range);
  await syncSellerGuildReportMessage(client, normalizedCode, range);
}

/**
 * ส่วนของ "เซิร์ฟควบคุม" — ตรรกะเดิมทั้งหมดจากก่อนรอบ 13 (แยกออกมาเป็นฟังก์ชันของตัวเองตอน
 * รอบ 13 เพื่อให้ syncCodeReportMessage() เรียกคู่กับ syncSellerGuildReportMessage() ได้
 * โดยไม่ปนกัน) ⚠️ ต้อง "ไม่มีทาง throw error ออกไปนอกฟังก์ชัน" เด็ดขาด (เหมือน
 * syncDiscordBotList.js) เพราะห้องรายงานเป็นแค่ "ของเสริม" ไม่ใช่ core flow การจ่ายเงิน/
 * ปลดล็อกพรีเมียม — ถ้าอัปเดตห้องนี้พลาด ต้องไม่ทำให้ webhook หลักหรือคำสั่ง /referral พังตาม
 *
 * การ์ดที่เคยผ่าน Components V2 มาก่อน (รอบ 8-10) มีธง IS_COMPONENTS_V2 ติดตัวอยู่แล้ว ซึ่ง
 * **ยืนยันแน่นอนว่าเอาออกไม่ได้** — การ .edit() กลับไปเป็น Embed แบบนี้จะ fail แน่นอนสำหรับ
 * การ์ดกลุ่มนั้น — try/catch ซ้อนด้านล่างนี้ (เดิมทำไว้ตั้งแต่รอบ 8) ดักเคสนี้ได้พอดี: edit()
 * fail → ลบข้อความเก่าทิ้งแล้วส่งใหม่เป็น Embed แทนอัตโนมัติ ไม่ต้องแก้อะไรเพิ่ม
 *
 * @param {import('discord.js').Client} client
 * @param {string} normalizedCode
 * @param {'today'|'month'|'all'} range
 */
async function syncControlGuildReportMessage(client, normalizedCode, range) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.warn('[referralReportChannel] ไม่พบ GUILD_ID ใน .env — ข้ามการอัปเดตห้องรายงานยอดเซิร์ฟควบคุม');
    return;
  }

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
            `[referralReportChannel] แก้ไขการ์ดเดิมของโค้ด ${normalizedCode} (เซิร์ฟควบคุม) ไม่สำเร็จ (${editError.message}) — จะลบแล้วส่งใหม่แทนครับ`
          );
          await existingMessage.delete().catch(() => {});
        }
      } catch (fetchError) {
        // ข้อความเดิมหาไม่เจอ (เช่นมีคนลบข้อความ/ห้องไปเอง) — ส่งใหม่แทนด้านล่าง
        console.warn(
          `[referralReportChannel] หาข้อความรายงานเดิมของโค้ด ${normalizedCode} (เซิร์ฟควบคุม) ไม่เจอ จะส่งข้อความใหม่แทนครับ`
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
    console.warn(`[referralReportChannel] อัปเดตห้องรายงานยอด (เซิร์ฟควบคุม) ของโค้ด ${normalizedCode} ไม่สำเร็จ:`, error);
  }
}

/**
 * 🆕 [รอบ 13] ส่วนของ "เซิร์ฟผู้ขายเอง" — ทำงานคล้าย syncControlGuildReportMessage() ด้าน
 * บนเป๊ะๆ (fetch/edit/fallback-to-resend pattern เดียวกัน) ต่างกันแค่: (1) ใช้ guild จาก
 * codeEntry.sellerGuildId แทน GUILD_ID ใน .env (2) ใช้ getOrCreateSellerReportChannel()
 * (สิทธิ์ต่างจากห้องเซิร์ฟควบคุม — ดูคอมเมนต์ฟังก์ชันนั้น) (3) เก็บ messageId แยกคนละ field
 * (sellerReportMessageId) กันไปทับ reportMessageId ของเซิร์ฟควบคุม
 *
 * ⚠️ เหมือนกันกับด้านบน: ต้อง "ไม่มีทาง throw error ออกไปนอกฟังก์ชัน" เด็ดขาด — ถ้าเซิร์ฟ
 * ผู้ขายเข้าถึงไม่ได้ (บอทถูกเตะออก/ยังไม่เคยเข้า/ไม่มีสิทธิ์สร้างห้อง) แค่ log แล้วข้าม ไม่
 * กระทบการ์ดในเซิร์ฟควบคุมหรือ flow หลักเลย — ถ้าโค้ดนี้ไม่มี sellerGuildId เลย จะ return
 * เงียบๆ ทันที (โค้ดส่วนใหญ่ที่ยังไม่ได้ตั้งค่านี้จะเข้าเคสนี้ ไม่ใช่ error)
 *
 * @param {import('discord.js').Client} client
 * @param {string} normalizedCode
 * @param {'today'|'month'|'all'} range
 */
async function syncSellerGuildReportMessage(client, normalizedCode, range) {
  const codeEntry = listAllCodes().find((c) => c.code === normalizedCode);
  if (!codeEntry || !codeEntry.sellerGuildId) return; // ไม่ได้ตั้งเซิร์ฟผู้ขายไว้ — ไม่ต้องทำอะไร

  try {
    const payload = buildReportPayload(client, normalizedCode, range);
    if (!payload) return;

    const guild = await client.guilds.fetch(codeEntry.sellerGuildId).catch((fetchGuildError) => {
      console.warn(
        `[referralReportChannel] เข้าเซิร์ฟผู้ขาย (${codeEntry.sellerGuildId}) ของโค้ด ${normalizedCode} ไม่ได้ (บอทอาจยังไม่ได้เข้าเซิร์ฟนี้ หรือ ID ผิด): ${fetchGuildError.message}`
      );
      return null;
    });
    if (!guild) return;

    const channel = await getOrCreateSellerReportChannel(guild, codeEntry.sellerDiscordId).catch((createChannelError) => {
      console.warn(
        `[referralReportChannel] สร้าง/หาห้อง #${SELLER_REPORT_CHANNEL_NAME} ในเซิร์ฟผู้ขายของโค้ด ${normalizedCode} ไม่สำเร็จ (เช็คว่าบอทมีสิทธิ์ Manage Channels ในเซิร์ฟนั้นไหม): ${createChannelError.message}`
      );
      return null;
    });
    if (!channel) return;

    if (codeEntry.sellerReportMessageId) {
      try {
        const existingMessage = await channel.messages.fetch(codeEntry.sellerReportMessageId);
        try {
          await existingMessage.edit({
            content: null,
            embeds: [payload.embed],
            attachments: [],
            components: payload.actionRows,
            files: payload.files,
          });
          return;
        } catch (editError) {
          console.warn(
            `[referralReportChannel] แก้ไขการ์ดเดิมของโค้ด ${normalizedCode} (เซิร์ฟผู้ขาย) ไม่สำเร็จ (${editError.message}) — จะลบแล้วส่งใหม่แทนครับ`
          );
          await existingMessage.delete().catch(() => {});
        }
      } catch (fetchError) {
        console.warn(
          `[referralReportChannel] หาข้อความรายงานเดิมของโค้ด ${normalizedCode} (เซิร์ฟผู้ขาย) ไม่เจอ จะส่งข้อความใหม่แทนครับ`
        );
      }
    }

    const sentMessage = await channel.send({
      embeds: [payload.embed],
      components: payload.actionRows,
      files: payload.files,
    });
    saveSellerReportMessageId(normalizedCode, sentMessage.id);
  } catch (error) {
    console.warn(`[referralReportChannel] อัปเดตห้องรายงานยอด (เซิร์ฟผู้ขาย) ของโค้ด ${normalizedCode} ไม่สำเร็จ:`, error);
  }
}

/**
 * 🆕 [รอบ 13] สร้าง QR พร้อมเพย์สำหรับยอดค้างจ่าย "ของโค้ดเดียว" แล้วโพสต์เข้าห้องรายงานยอด
 * ทั้งสองที่ (เซิร์ฟควบคุม + เซิร์ฟผู้ขายถ้ามี) ให้อัตโนมัติ — เรียกจาก handleDeactivate()
 * ใน commands/referral.js ตอนปิดโค้ด (ตามที่น้องหนาวอยากได้ "ระบบกึ่งอัตโนมัติตอนสิ้นเดือน")
 * แต่จะข้ามเงียบๆ ถ้าโค้ดนี้ไม่มียอดค้างจ่าย หรือยังไม่ได้ตั้งเลขพร้อมเพย์ไว้
 *
 * ⚠️ **นี่ไม่ใช่การตัดเงินอัตโนมัติจริง** — QR พร้อมเพย์ทำงานแบบ "คนสแกน = คนจ่ายเงินออก"
 * เสมอ ไม่มีทาง "สแกนเพื่อรับเงิน" ได้ (อธิบายไว้แล้วในแชท) น้องหนาวยังต้องเป็นคนสแกน+ยืนยัน
 * โอนเงินจริงเองผ่านแอปธนาคาร แค่ตอนนี้บอทช่วยสร้าง+โพสต์ QR ให้อัตโนมัติแทนที่จะต้องมารัน
 * `/referral payout` เองทุกครั้ง — โอนเสร็จแล้วยังต้องกด `/referral markpaid` เหมือนเดิม
 *
 * ⚠️ ฟังก์ชันนี้ "ไม่ throw" เหมือนฟังก์ชัน sync ด้านบน — คืนค่า object บอกผลลัพธ์แทน ให้
 * ฝั่งที่เรียก (handleDeactivate) เอาไปแสดงในข้อความตอบกลับได้ว่าเกิดอะไรขึ้น
 *
 * @param {import('discord.js').Client} client
 * @param {string} code
 * @returns {Promise<{ posted: boolean, reason?: 'no_unpaid_balance'|'no_promptpay_id', amountThb?: number, postedToControlGuild?: boolean, postedToSellerGuild?: boolean }>}
 */
async function postPayoutQrForCode(client, code) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const codeEntry = listAllCodes().find((c) => c.code === normalizedCode);
  if (!codeEntry) return { posted: false, reason: 'no_unpaid_balance' };

  const unpaidEntry = getUnpaidCommissionSummary().find((s) => s.code === normalizedCode);
  if (!unpaidEntry || unpaidEntry.totalCommissionThb <= 0) {
    return { posted: false, reason: 'no_unpaid_balance' };
  }

  if (!codeEntry.promptpayId) {
    return { posted: false, reason: 'no_promptpay_id', amountThb: unpaidEntry.totalCommissionThb };
  }

  let qrBuffer;
  try {
    qrBuffer = await generatePromptPayQrBuffer(codeEntry.promptpayId, unpaidEntry.totalCommissionThb);
  } catch (error) {
    console.warn(`[referralReportChannel] สร้าง QR จ่ายเงินอัตโนมัติให้โค้ด ${normalizedCode} ไม่สำเร็จ:`, error);
    return { posted: false, reason: 'no_promptpay_id', amountThb: unpaidEntry.totalCommissionThb };
  }

  const messageText =
    `💳 **Payout QR generated** for **${codeEntry.sellerLabel}** (code ${normalizedCode})\n` +
    `Amount: **${unpaidEntry.totalCommissionThb} THB** — scan with a Thai banking app to transfer. ` +
    `Remember to run \`/referral markpaid code:${normalizedCode}\` after paying.`;

  let postedToControlGuild = false;
  let postedToSellerGuild = false;

  // ── โพสต์เข้าห้องเซิร์ฟควบคุม ──────────────────────────────────────────────
  const controlGuildId = process.env.GUILD_ID;
  if (controlGuildId) {
    try {
      const guild = await client.guilds.fetch(controlGuildId);
      const channel = await getOrCreateReportChannel(guild);
      // สร้าง AttachmentBuilder ใหม่ทุกครั้งที่ส่ง (ใช้ Buffer เดิมซ้ำได้ แค่ต้องห่อ instance ใหม่)
      await channel.send({
        content: messageText,
        files: [new AttachmentBuilder(qrBuffer, { name: `promptpay-${normalizedCode}.png` })],
      });
      postedToControlGuild = true;
    } catch (error) {
      console.warn(`[referralReportChannel] โพสต์ QR จ่ายเงินของโค้ด ${normalizedCode} เข้าเซิร์ฟควบคุมไม่สำเร็จ:`, error);
    }
  }

  // ── โพสต์เข้าห้องเซิร์ฟผู้ขาย (ถ้าตั้งไว้) ────────────────────────────────
  if (codeEntry.sellerGuildId) {
    try {
      const guild = await client.guilds.fetch(codeEntry.sellerGuildId);
      const channel = await getOrCreateSellerReportChannel(guild, codeEntry.sellerDiscordId);
      await channel.send({
        content: messageText,
        files: [new AttachmentBuilder(qrBuffer, { name: `promptpay-${normalizedCode}.png` })],
      });
      postedToSellerGuild = true;
    } catch (error) {
      console.warn(`[referralReportChannel] โพสต์ QR จ่ายเงินของโค้ด ${normalizedCode} เข้าเซิร์ฟผู้ขายไม่สำเร็จ:`, error);
    }
  }

  return {
    posted: postedToControlGuild || postedToSellerGuild,
    amountThb: unpaidEntry.totalCommissionThb,
    postedToControlGuild,
    postedToSellerGuild,
  };
}

/** เช็คว่า customId นี้เป็น dropdown เลือกช่วงเวลาของห้องรายงานยอดหรือไม่ (เรียกจาก index.js) */
function isReportRangeSelect(customId) {
  return typeof customId === 'string' && customId.startsWith(RANGE_SELECT_PREFIX);
}

/**
 * รันตอนมีคนเลือกช่วงเวลาใหม่จาก dropdown — อ่านโค้ดจาก customId + ช่วงเวลาที่เลือกจาก
 * interaction.values แล้วสร้างการ์ดใหม่ "แก้ทับข้อความเดิมทันที" ผ่าน interaction.update()
 * (เร็วกว่าไป fetch ข้อความมาแก้ใหม่แบบ syncCodeReportMessage — ในนี้มี interaction.message
 * อยู่แล้วในตัว ไม่ต้องยิง API เพิ่ม) — ใช้ได้ทั้งการ์ดในเซิร์ฟควบคุมและเซิร์ฟผู้ขาย เพราะ
 * customId ไม่ผูกกับเซิร์ฟไหนเป็นพิเศษ (โค้ดคือตัวระบุพอแล้ว)
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
async function handleReportRangeSelect(interaction) {
  const code = interaction.customId.slice(RANGE_SELECT_PREFIX.length);
  const range = interaction.values[0];

  const payload = buildReportPayload(interaction.client, code, range);
  if (!payload) {
    await interaction.reply({ content: 'This code no longer exists (it may have been removed).', ephemeral: true });
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
 * ข้อความอ่านอย่างเดียวในหน้าต่าง modal ได้ ไม่ต้องมีช่องกรอกเลยสักช่อง)
 * @returns {import('discord.js').ModalBuilder}
 */
function buildTermsModal() {
  return new ModalBuilder()
    .setCustomId(TERMS_MODAL_ID)
    .setTitle('Commission Payout Terms')
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Sellers earn **${COMMISSION_PER_REDEMPTION_THB} THB** per successful code redemption ` +
        '(counted only once Stripe confirms the customer actually paid — just entering the code does not count).'
      ),
      new TextDisplayBuilder().setContent(
        '**How sellers get paid**: this is not an automatic transfer. The owner pays out manually on a regular ' +
        'basis (e.g. weekly/monthly) — check unpaid balances with `/referral summary`, transfer the money ' +
        'via PromptPay/bank transfer (a payout QR is posted here automatically when the code is deactivated, ' +
        'or the owner can generate one anytime with `/referral payout`), then run `/referral markpaid` ' +
        'to clear that code\'s unpaid balance.'
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
  await interaction.reply({ content: 'Got it.', ephemeral: true });
}

// ─────────────────────────────────────────────────────────────────────────
// 🆕 รอบ 14 — ปุ่ม "Payment" ให้ผู้ขายกรอกเลขพร้อมเพย์ของตัวเองได้เลย (self-service)
//
// จุดประสงค์: ตัดขั้นตอนกลางที่น้องหนาวต้องเป็นคนพิมพ์เลขพร้อมเพย์ให้ผู้ขายทุกคนเองผ่าน
// /referral add หรือ /referral setpromptpay (ต้องคอยถามทีละคนแล้วมาพิมพ์เอง เสี่ยงพิมพ์
// ผิด/สลับคน + ล่าช้าเวลามีผู้ขายเยอะๆ) — ตอนนี้ผู้ขายกดปุ่มนี้ที่การ์ดรายงานยอดของตัวเอง
// (ในห้อง #partner-earnings ของเซิร์ฟตัวเอง หรือ #referral-earnings ถ้าน้องหนาวอยากกรอก
// แทนก็ได้) แล้วกรอกเลขพร้อมเพย์เข้าไปเองได้เลย ไม่ต้องผ่านน้องหนาวเป็นตัวกลางอีกต่อไป
//
// ⚠️ ขอบเขตที่ตัดสินใจแล้ว (คุยกับน้องหนาวแล้ว): แคมเปญนี้ใช้ได้เฉพาะผู้ขายที่มีเลขพร้อมเพย์
// ไทยเท่านั้น (ไม่มีช่องสำหรับ PayPal/Wise หรือช่องทางต่างชาติอื่นๆ) — เพราะพร้อมเพย์เป็น
// ระบบของธนาคารแห่งประเทศไทยโดยเฉพาะ ไม่มีทาง auto-generate QR ให้ช่องทางอื่นได้อยู่แล้ว
// ผู้ขายต่างชาติยังคงต้องติดต่อน้องหนาวนอกระบบเหมือนเดิม (ดู claude/referral-campaign-
// build-notes.md หัวข้อ "ไอเดียอนาคต" ข้อ 4 ถ้าอยากทำเพิ่มในอนาคต)

/** เช็คว่า customId นี้เป็นปุ่ม "Payment" ของห้องรายงานยอดหรือไม่ (เรียกจาก index.js) */
function isPaymentButton(customId) {
  return typeof customId === 'string' && customId.startsWith(PAYMENT_BUTTON_PREFIX);
}

/**
 * สร้าง Modal กรอกเลขพร้อมเพย์ — มีช่องเดียว ถ้ามีเลขเดิมอยู่แล้วจะ pre-fill ให้ (สะดวกเวลา
 * แค่จะแก้เลขเดิม ไม่ต้องพิมพ์ใหม่ทั้งหมด)
 * @param {string} code
 * @param {string|null} existingPromptPayId เลขเดิมที่เคยตั้งไว้ (ถ้ามี) — เอามา pre-fill ในช่อง
 * @returns {import('discord.js').ModalBuilder}
 */
function buildPaymentModal(code, existingPromptPayId) {
  const input = new TextInputBuilder()
    .setCustomId('promptpay_id')
    .setLabel('Your PromptPay Phone Number')
    // 🆕 [21 ก.ย. 2569] ตัดตัวเลือกเลขบัตรประชาชน 13 หลักออก เหลือรับแค่เบอร์มือถือ 10 หลัก
    // เท่านั้น — เหตุผลด้านความปลอดภัย ดูคอมเมนต์ยาวที่ PROMPTPAY_ID_PATTERN ใน referralStorage.js
    .setPlaceholder('10-digit phone number, e.g. 0812345678')
    .setStyle(TextInputStyle.Short)
    .setMinLength(10)
    .setMaxLength(10)
    .setRequired(true);

  if (existingPromptPayId) {
    input.setValue(existingPromptPayId);
  }

  return new ModalBuilder()
    .setCustomId(`${PAYMENT_MODAL_PREFIX}${code}`)
    .setTitle('Set Payout PromptPay ID')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

/**
 * รันตอนกดปุ่ม "Payment" — เช็คสิทธิ์ก่อนเปิด modal เสมอ (ห้ามใครก็ได้แก้เลขพร้อมเพย์ของ
 * คนอื่น) อนุญาตแค่ 2 กลุ่ม: (1) บัญชีดิสคอร์ดที่ผูกไว้กับโค้ดนี้โดยตรง (sellerDiscordId)
 * หรือ (2) คนที่มีสิทธิ์ Administrator ในเซิร์ฟที่กดปุ่มอยู่ (เผื่อน้องหนาวอยากกรอกแทนเอง)
 * — ห้องที่ปุ่มนี้โผล่อยู่แล้วก็ถูกจำกัดสิทธิ์การมองเห็นไว้ระดับ channel อยู่แล้ว (เฉพาะผู้ขาย
 * คนนั้น + แอดมิน) เช็คซ้ำอีกชั้นตรงนี้กันเคส sellerDiscordId ยังไม่เคยผูกไว้ตอนสร้างโค้ด
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handlePaymentButton(interaction) {
  const code = interaction.customId.slice(PAYMENT_BUTTON_PREFIX.length);
  const codeEntry = listAllCodes().find((c) => c.code === code);

  if (!codeEntry) {
    await interaction.reply({ content: 'This code no longer exists (it may have been removed).', ephemeral: true });
    return;
  }

  const isLinkedSeller = Boolean(codeEntry.sellerDiscordId) && interaction.user.id === codeEntry.sellerDiscordId;
  const isAdminHere = interaction.inGuild() && interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!isLinkedSeller && !isAdminHere) {
    await interaction.reply({
      content: 'This code isn\'t linked to your Discord account, so you can\'t set its payout info here — ask the bot owner to link your account first (with `/referral setguild` or by re-adding the code with your account attached).',
      ephemeral: true,
    });
    return;
  }

  await interaction.showModal(buildPaymentModal(code, codeEntry.promptpayId));
}

/** เช็คว่า customId นี้เป็น modal กรอกเลขพร้อมเพย์หรือไม่ (เรียกจาก index.js ตอน submit) */
function isPaymentModalSubmit(customId) {
  return typeof customId === 'string' && customId.startsWith(PAYMENT_MODAL_PREFIX);
}

/**
 * รันตอนกด Submit บน modal กรอกเลขพร้อมเพย์ — เช็ครูปแบบก่อนบันทึกเสมอ (กฎเดียวกับ
 * /referral setpromptpay เป๊ะๆ เพราะ import PROMPTPAY_ID_PATTERN จากจุดเดียวกัน)
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handlePaymentModalSubmit(interaction) {
  const code = interaction.customId.slice(PAYMENT_MODAL_PREFIX.length);
  const rawValue = interaction.fields.getTextInputValue('promptpay_id').trim();

  if (!PROMPTPAY_ID_PATTERN.test(rawValue)) {
    await interaction.reply({
      content: `❌ Invalid PromptPay ID "${rawValue}" — enter a 10-digit mobile phone number (digits only, no dashes/spaces), and it must be the number you already registered with PromptPay at your bank (not just any number of the right length). Click Payment again to retry.`,
      ephemeral: true,
    });
    return;
  }

  const codeEntry = listAllCodes().find((c) => c.code === code);
  if (!codeEntry) {
    await interaction.reply({ content: 'This code no longer exists (it may have been removed).', ephemeral: true });
    return;
  }

  // 🆕 [21 ก.ย. 2569] ส่ง ID ของคนที่กรอกฟอร์มนี้ไปด้วย (ผู้ขายเองหรือแอดมินที่กดแทน) ให้ขึ้น
  // audit trail บนการ์ดว่าใครแก้ล่าสุด (ดู buildReportEmbed ด้านล่าง)
  savePromptPayId(code, rawValue, interaction.user.id);

  await interaction.reply({
    content: `✅ Payout PromptPay ID saved for code **${code}**. The owner can now use it to pay out your commission automatically.`,
    ephemeral: true,
  });
}

module.exports = {
  getOrCreateReportChannel,
  syncCodeReportMessage,
  postPayoutQrForCode,
  isReportRangeSelect,
  handleReportRangeSelect,
  isReportTermsButton,
  handleReportTermsButton,
  isTermsModalSubmit,
  handleTermsModalSubmit,
  isPaymentButton,
  handlePaymentButton,
  isPaymentModalSubmit,
  handlePaymentModalSubmit,
};
