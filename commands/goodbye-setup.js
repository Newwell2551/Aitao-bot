// commands/goodbye-setup.js
// คำสั่ง /goodbye-setup — ตั้งค่าระบบอำลาสมาชิกที่ออกจากเซิร์ฟด้วยรูป PNG หรือ GIF
// พาร์ทเนอร์ของ /welcome-setup — mirror โครงสร้างเกือบทั้งหมด (ดู welcome-setup.js)
//
// โครงสร้าง panel:
//   แถว 1: 🖼️ พื้นหลัง | 💬 ข้อความ | 👤 Avatar | 🎨 ความทึบ | 📢 ข้อความอำลา
//   แถว 2: ChannelSelectMenu (เลือกช่อง)
//   แถว 3: 👀 ดูตัวอย่าง | 🔛 เปิด/ปิด | ✅ เสร็จแล้ว
//
// 💬 ข้อความ ตอนนี้เป็น "หลาย block อิสระ" (mirror pattern จาก /builder):
//   กด 💬 ข้อความ → select menu แสดงรายการ block + "+ เพิ่มข้อความใหม่"
//   เลือก block → block editor: แก้ไข/ลบ/Bold/nudge/ปรับแต่งเอง(พิกัดตรง)
//   ⚠️ ข้อความพวกนี้ถูก "วาดเป็นภาพ" (baked-in) → ไม่รองรับ mention จริง (แค่ข้อความเฉยๆ)
//
// 📢 ข้อความอำลา — Discord message content จริง แยกจาก 💬 ข้อความ โดยสิ้นเชิง
//   กด 📢 ข้อความอำลา → modal ช่องเดียว รองรับ {username}/{server} เท่านั้น
//   ❌ ไม่รองรับ {user} mention เลย — คนที่ออกจากเซิร์ฟไปแล้ว mention ไปก็ไม่มีความหมาย
//      (ไม่ใช่สมาชิกแล้ว) ตัดออกจาก design ตั้งแต่ต้น จึงไม่มี validation เตือนเรื่องนี้
//      แบบฝั่ง welcome เลย (ไม่มี {user} ให้เช็คตั้งแต่แรก)
//
// 🔑 Pattern สำคัญ:
//   - reply() ครั้งแรกต้องใช้ { fetchReply: true } เพื่อเก็บ Message reference
//   - ห้ามใช้ interaction.fetchReply() แยกทีหลัง — ไม่น่าเชื่อถือบน ephemeral
//   - ปุ่ม 🖼️ พื้นหลัง: เปิด modal ให้ user วาง URL → validate → update panel
//   - ปุ่มที่ต้องการ async (generate image): deferUpdate() → editReply()
//   - modal พิกัดตรง (custom) ต้อง pre-fill ด้วยค่าปัจจุบันเสมอ (setValue)

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');

const { loadGoodbyeConfig, saveGoodbyeConfig }  = require('../utils/goodbyeStorage');
const { generateMemberCardImage }               = require('../utils/generateMemberCardImage');
const { isPremiumGuild, resolveBackgroundType } = require('../utils/tierManager');
const { buildUpgradeMessage }                   = require('../utils/premiumGate');
const { runWelcomeGifJob }                      = require('../utils/imageWorkerPool');
const { resolveCustomEmojis }                   = require('../utils/resolveCustomEmojis');
const { getGuildLanguage }                      = require('../utils/languageStorage');
const { createTranslator }                      = require('../utils/i18n');

// ─── ค่า Default ─────────────────────────────────────────────────────────────
// ค่าเริ่มต้นของ config ทุก field — ใช้ตอน guild ยังไม่เคย setup เลย
//
// textBlocks: array ของ text block อิสระ แต่ละอันมี:
//   id      — unique string (ใช้เลือก/แก้ไข/ลบใน select menu)
//   content — ข้อความ (รองรับ {username} placeholder + \n ขึ้นบรรทัดใหม่)
//   x, y    — % ตำแหน่งบน canvas (เหมือน avatarX/Y)
//   size    — % ของความสูง canvas (เหมือน avatarRadius)
//   bold    — true/false ตัวหนาเฉพาะ block นี้
const DEFAULT_CONFIG = {
  enabled:        false,
  channelId:      null,
  backgroundUrl:  null,
  overlayOpacity: 50,   // % (0-100) — 0=โปร่งใส, 100=ทึบสนิท
  avatarEnabled:  true,
  avatarX:        50,   // % ของ canvas width  (ค่า default: กลางแนวนอน)
  avatarY:        33,   // % ของ canvas height (ค่า default: 1/3 จากบน)
  avatarRadius:   19,   // % ของ canvas height (radius ของวงกลม avatar)
  textBlocks: [
    { id: 'tb_default', content: 'ลาก่อน {username} 👋', x: 50, y: 72, size: 12, bold: false, fontStyle: 'default' },
  ],
  // farewellText: ข้อความ "จริง" ของ Discord message ที่อยู่นอกรูป (ไม่ได้ baked เข้าไปในภาพ)
  // ต่างจาก textBlocks ตรงที่ตัวนี้เป็น message content จริง
  // รองรับ placeholder แค่ 2 ตัว: {username} = ชื่อ, {server} = ชื่อเซิร์ฟเวอร์
  // ❌ ไม่รองรับ {user} mention เลย — คนออกจากเซิร์ฟไปแล้ว ping ไปก็ไม่มีความหมาย
  farewellText: '{username} ออกจากเซิร์ฟเวอร์ไปแล้วครับ 👋',
};

/**
 * คืนค่า "สำเนาใหม่" ของ DEFAULT_CONFIG ทุกครั้งที่เรียก — ห้ามใช้ DEFAULT_CONFIG
 * ตรงๆ หรือ spread ตื้นๆ แบบ { ...DEFAULT_CONFIG } เด็ดขาดตอนสร้าง session ใหม่
 *
 * 🐛 บัคจริงที่เคยเกิด (cross-guild "ผี" — ข้อมูลข้ามเซิร์ฟ ทั้งที่ไฟล์เก็บข้อมูล
 * แยกกันถูกต้องทุกเซิร์ฟอยู่แล้ว): { ...DEFAULT_CONFIG } เป็นการก็อปปี้ "ตื้น"
 * (shallow copy) — field ธรรมดาอย่าง avatarX/overlayOpacity ก็อปปี้ค่าจริงไป
 * ก็จริง แต่ field ที่เป็น array/object ซ้อนอยู่ข้างใน (คือ textBlocks) จะ
 * "ชี้ไปที่ array/object ก้อนเดิม" ไม่ได้แยกก้อนใหม่ให้เลย (เหมือนถ่ายสำเนา
 * กุญแจแทนที่จะสร้างประตูใหม่ — เปิดประตูไหนก็เจอห้องเดียวกัน)
 *
 * พอเซิร์ฟที่ยังไม่เคยตั้งค่าเลย (saved === null) ได้ session แบบนี้ไป แล้ว
 * user กดปุ่ม "แก้ไขข้อความ" บล็อกเริ่มต้น (tb_default) → โค้ดในโมดัลจะเจอ
 * block object ตัวเดียวกับที่อยู่ใน DEFAULT_CONFIG.textBlocks[0] เป๊ะๆ แล้ว
 * เขียนทับ block.content = ... ลงไปตรงนั้นเลย (ไม่ได้สร้าง object ใหม่) —
 * ผลคือ DEFAULT_CONFIG ตัวกลาง (ใช้ร่วมกันทั้งไฟล์ ทั้งโปรเซส) โดนเปลี่ยนค่า
 * ถาวรไปจนกว่าจะ restart บอท ทำให้เซิร์ฟอื่นๆ ที่ยังไม่เคยตั้งค่าเลยเหมือนกัน
 * (saved === null เหมือนกัน) พลอยได้ข้อความ "เปื้อน" อันเดียวกันนี้ไปด้วย —
 * นี่คือที่มาของอาการ "ข้อความจากเซิร์ฟนึงไปโผล่อีกเซิร์ฟ" ทั้งที่ตรวจไฟล์
 * per-guild ยังไงก็ไม่เจอบัค เพราะบัคไม่ได้อยู่ในไฟล์เลย อยู่ใน object กลาง
 * ที่ค้างอยู่ใน memory ของบอทต่างหาก
 *
 * แก้โดยสร้าง array/object ใหม่ทุกครั้งที่เรียกฟังก์ชันนี้ (deep clone เฉพาะ
 * textBlocks ที่เป็นจุดเสี่ยง) — session แต่ละเซิร์ฟจะได้ก็อปปี้อิสระของตัวเอง
 * แก้เท่าไหร่ก็แก้เฉพาะของตัวเอง ไม่ไปกระทบ DEFAULT_CONFIG ตัวกลางอีกต่อไป
 *
 * @returns {object} DEFAULT_CONFIG ฉบับสำเนาใหม่ ปลอดภัยต่อการแก้ไข
 */
function cloneDefaultConfig() {
  return {
    ...DEFAULT_CONFIG,
    textBlocks: DEFAULT_CONFIG.textBlocks.map(block => ({ ...block })),
  };
}

// ขนาดการขยับต่อครั้ง (nudge step)
const STEP_XY = 5;  // % — ขยับตำแหน่ง X หรือ Y ทีละ 5%
const STEP_R  = 2;  // % — ขยับขนาด radius/font ทีละ 2% (avatar ใช้ค่านี้)
const STEP_SZ = 1;  // % — ขยับ font size ของ text block ทีละ 1%

// จำนวน text block สูงสุด — Discord StringSelectMenu รับ option ได้สูงสุด 25 อัน
const MAX_TEXT_BLOCKS = 25;

// ─── In-memory State ─────────────────────────────────────────────────────────
// sessions: เก็บ config ที่กำลังแก้ไขอยู่ในหน่วยความจำ (ยังไม่บันทึกลงไฟล์)
//
// 🔑 key = `${guildId}_${userId}` (ไม่ใช่ userId เดี่ยวๆ เหมือนเดิม)
// เหตุผล: ถ้า key เป็น userId เดี่ยวๆ แอดมินคนเดียวกันที่เปิด /goodbye-setup
// ค้างไว้ในเซิร์ฟ A (ยังไม่กด "เสร็จแล้ว") แล้วสลับไปเปิด /goodbye-setup ใน
// เซิร์ฟ B ก่อน จะทำให้ session ของเซิร์ฟ B ไปทับ session ของเซิร์ฟ A ในหน่วย
// ความจำทันที (เพราะ userId เดียวกัน) พอกลับไปกดปุ่มที่ panel ค้างของเซิร์ฟ A
// ระบบจะเผลอบันทึกข้อมูลของเซิร์ฟ B ลงไฟล์การตั้งค่าของเซิร์ฟ A แทน
// (cross-guild data corruption) — เป็นบัคเงียบ ไม่มี error โผล่ให้เห็นเลย
//
// แก้โดยผูก key กับทั้ง guildId และ userId พร้อมกัน (Discord ID เป็นตัวเลข
// ล้วน ใช้ underscore คั่นได้ปลอดภัย ไม่มีทางชนกัน) แต่ละเซิร์ฟจะมี session
// แยกกันเด็ดขาด ต่อให้ user คนเดียวกันเปิดพร้อมกันหลายเซิร์ฟก็ไม่ชนกันอีกต่อไป
//
// session พิเศษ (ไม่ persist ลง JSON ตอน DONE):
//   lastPreview          — รูป preview ล่าสุด { buffer, ext }
//   currentTextBlockId   — id ของ block ที่กำลังเปิดแก้ไขอยู่ในตอนนี้
const sessions = new Map(); // key (guildId_userId) → config object

/**
 * สร้าง Map key ผสมจาก guildId + userId — ใช้จุดเดียวทั่วทั้งไฟล์ กันเผลอพิมพ์
 * รูปแบบ key ไม่ตรงกันระหว่างจุดต่างๆ (เช่นลืมใส่ underscore หรือสลับลำดับ)
 * @param {string} guildId
 * @param {string} userId
 * @returns {string}
 */
function sessionKey(guildId, userId) {
  return `${guildId}_${userId}`;
}

// (ใช้ modal สำหรับพื้นหลังแล้ว ไม่ต้องเก็บ panelMessages ref แยก
//  เพราะ interaction token ยังมีชีวิตอยู่เสมอตอน modal submit)

// ─── CustomId Constants ───────────────────────────────────────────────────────
// รวม customId ไว้ที่เดียว — กัน typo และ refactor ง่ายขึ้น
// prefix "wgs_" ทุกอัน (welcome-goodbye-setup) เพื่อให้ index.js routing
// แยกออกจาก /welcome-setup (ws_) และ command อื่นได้ ไม่ชนกัน
const WGS = {
  // ── main panel
  BG:          'wgs_bg',          // 🖼️ พื้นหลัง
  TEXT:        'wgs_text',        // 💬 ข้อความ (เปิด text block list)
  AVATAR:      'wgs_avatar',      // 👤 Avatar (เปิด avatar submenu)
  OPACITY:     'wgs_opacity',     // 🎨 ความทึบ (เปิด modal)
  FAREWELL:    'wgs_farewell',    // 📢 ข้อความอำลา (เปิด modal)
  CHANNEL_SEL: 'wgs_channel_sel', // ChannelSelectMenu
  PREVIEW:     'wgs_preview',     // 👀 ดูตัวอย่าง
  TOGGLE:      'wgs_toggle',      // 🔛 เปิด/ปิด
  DONE:        'wgs_done',        // ✅ เสร็จแล้ว

  // ── modal: พื้นหลัง (ใส่ลิงก์ URL)
  MODAL_BG:     'wgs_modal_bg',
  INPUT_BG:     'wgs_input_bg',

  // ── modal: ความทึบ
  MODAL_OPACITY: 'wgs_modal_opacity',
  INPUT_OPACITY: 'wgs_input_opacity',

  // ── modal: ข้อความอำลา (Discord message จริง นอกรูป)
  MODAL_FAREWELL: 'wgs_modal_farewell',
  INPUT_FAREWELL: 'wgs_input_farewell',

  // ── avatar submenu
  AV_TOGGLE: 'wgs_av_toggle', // เปิด/ปิด avatar
  AV_LEFT:   'wgs_av_left',   // ⬅️ ขยับซ้าย
  AV_RIGHT:  'wgs_av_right',  // ➡️ ขยับขวา
  AV_UP:     'wgs_av_up',     // ⬆️ ขยับขึ้น
  AV_DOWN:   'wgs_av_down',   // ⬇️ ขยับลง
  AV_PLUS:   'wgs_av_plus',   // ➕ ขยาย radius
  AV_MINUS:  'wgs_av_minus',  // ➖ ลด radius
  AV_CUSTOM: 'wgs_av_custom', // 🎯 ปรับแต่งเอง (modal พิกัดตรง)
  AV_BACK:   'wgs_av_back',   // ← กลับ main panel

  // ── modal: avatar ปรับแต่งเอง (พิกัดตรง)
  MODAL_AV_CUSTOM: 'wgs_modal_av_custom',
  INPUT_AV_X:      'wgs_input_av_x',
  INPUT_AV_Y:      'wgs_input_av_y',
  INPUT_AV_R:      'wgs_input_av_r',

  // ── text block list (select menu แสดงรายการ block)
  TEXT_LIST_SELECT: 'wgs_text_list_select', // StringSelectMenu เลือก block หรือ "+ เพิ่ม"
  TEXT_LIST_BACK:   'wgs_text_list_back',   // ← กลับ main panel

  // ── text block editor (ต่อ block ที่เลือกอยู่ — ดู session.currentTextBlockId)
  TXB_EDIT:   'wgs_txb_edit',   // ✏️ แก้ไขข้อความ (เปิด modal, prefill เนื้อหาเดิม)
  TXB_DELETE: 'wgs_txb_delete', // 🗑️ ลบ block นี้
  TXB_BOLD:   'wgs_txb_bold',   // B / ⬛ toggle ตัวหนา เฉพาะ block นี้
  TXB_LEFT:   'wgs_txb_left',   // ⬅️ ขยับซ้าย
  TXB_RIGHT:  'wgs_txb_right',  // ➡️ ขยับขวา
  TXB_UP:     'wgs_txb_up',     // ⬆️ ขยับขึ้น
  TXB_DOWN:   'wgs_txb_down',   // ⬇️ ขยับลง
  TXB_PLUS:   'wgs_txb_plus',   // ➕ เพิ่ม font size
  TXB_MINUS:  'wgs_txb_minus',  // ➖ ลด font size
  TXB_CUSTOM: 'wgs_txb_custom', // 🎯 ปรับแต่งเอง (modal พิกัดตรง)
  TXB_FONT_STYLE: 'wgs_txb_font_style', // select menu เลือกสไตล์ฟอนต์ต่อบล็อก
  TXB_BACK:   'wgs_txb_back',   // ← กลับไป text block list

  // ── modal: แก้ไขเนื้อหา text block
  MODAL_TXB_EDIT: 'wgs_modal_txb_edit',
  INPUT_TXB_EDIT: 'wgs_input_txb_edit',

  // ── modal: text block ปรับแต่งเอง (พิกัดตรง)
  MODAL_TXB_CUSTOM: 'wgs_modal_txb_custom',
  INPUT_TXB_X:      'wgs_input_txb_x',
  INPUT_TXB_Y:      'wgs_input_txb_y',
  INPUT_TXB_SIZE:   'wgs_input_txb_size',
};

// value พิเศษใน TEXT_LIST_SELECT แทน "+ เพิ่มข้อความใหม่"
const TEXT_ADD_VALUE = '__add_new__';

// nudge buttons ทั้งหมดของ avatar (ใช้ includes() ตรวจว่าเป็น nudge หรือเปล่า)
const AV_NUDGE_IDS = [WGS.AV_LEFT, WGS.AV_RIGHT, WGS.AV_UP, WGS.AV_DOWN, WGS.AV_PLUS, WGS.AV_MINUS];
// nudge buttons ทั้งหมดของ text block ที่เลือกอยู่
const TXB_NUDGE_IDS = [WGS.TXB_LEFT, WGS.TXB_RIGHT, WGS.TXB_UP, WGS.TXB_DOWN, WGS.TXB_PLUS, WGS.TXB_MINUS];

// ─── Helper Functions ─────────────────────────────────────────────────────────

/** จำกัดค่า v ให้อยู่ระหว่าง min และ max */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/** สร้าง id ใหม่สำหรับ text block — unique ด้วย timestamp + random */
function generateBlockId() {
  return `tb_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

/** หา text block จาก id ใน config.textBlocks (คืน null ถ้าไม่เจอ) */
function findTextBlock(config, blockId) {
  return config.textBlocks?.find(b => b.id === blockId) ?? null;
}

/**
 * บันทึก config ลงไฟล์ทันที ไม่ต้องรอกด "เสร็จแล้ว" — ตัด field ชั่วคราว
 * (lastPreview, currentTextBlockId) ออกก่อนเสมอ เหมือนที่ DONE handler
 * เคยทำ แค่ย้ายมาเป็นฟังก์ชันกลาง เรียกซ้ำได้จากหลายจุด
 *
 * ❗ เรียกทุกครั้งที่มีการแก้ "ค่าจริง" ของ config (เช่น config.enabled,
 * config.backgroundUrl, activeBlock.x ฯลฯ) — ห้ามเรียกตอนแค่เปลี่ยนหน้าจอ/
 * เมนู โดยไม่ได้แก้ค่าอะไร (เช่น กดเข้า submenu, กด back) เพราะเขียนไฟล์
 * เปล่าๆ ถี่เกินไปไม่มีประโยชน์
 *
 * @param {string} guildId
 * @param {object} config
 */
function persist(guildId, config) {
  const { lastPreview: _p, currentTextBlockId: _t, ...toSave } = config;
  saveGoodbyeConfig(guildId, toSave);
}

/**
 * แทนที่ placeholder ใน farewellText ด้วยค่าจริงของสมาชิกที่เพิ่งออกจากเซิร์ฟ
 *
 * ❌ ไม่รองรับ {user} mention เลย (ต่างจาก resolveGreetingPlaceholders ฝั่ง welcome)
 *    เพราะสมาชิกออกจากเซิร์ฟไปแล้ว mention ไปก็ไม่มีความหมาย (ไม่ใช่สมาชิกแล้ว)
 *    ตัดออกจาก design ตั้งแต่ต้น
 *
 * รองรับ:
 *   {username} → ชื่อสมาชิก เช่น น้องหนาว
 *   {server}   → ชื่อเซิร์ฟเวอร์ เช่น Aitao Community
 *
 * @param {string} text - farewellText ดิบ (มี placeholder อยู่)
 * @param {import('discord.js').GuildMember} member - สมาชิกที่เพิ่งออกจากเซิร์ฟเวอร์
 * @returns {string} ข้อความที่แทน placeholder ครบแล้ว พร้อมส่งเป็น message content จริง
 */
function resolveFarewellPlaceholders(text, member) {
  if (!text) return '';
  return text
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}',   member.guild.name);
}

// ─── Status Text ──────────────────────────────────────────────────────────────

/**
 * สร้างข้อความสรุปสถานะ config สำหรับแสดงบน panel
 * แสดงทุก setting ที่ user ตั้งค่าไว้ ให้เห็นภาพรวมได้ทันที
 *
 * @param {object} config
 */
function buildStatusText(config, t) {
  const onOff   = config.enabled ? t('goodbye_setup.status.on') : t('goodbye_setup.status.off');
  const channel = config.channelId ? `<#${config.channelId}>` : t('goodbye_setup.status.channel_unset');
  const bgTag   = config.backgroundUrl
    ? (/\.gif(\?|$)/i.test(config.backgroundUrl) ? t('goodbye_setup.status.bg_gif') : t('goodbye_setup.status.bg_set'))
    : t('goodbye_setup.status.bg_none');
  const avText = config.avatarEnabled ? t('goodbye_setup.status.avatar_on') : t('goodbye_setup.status.avatar_off');

  const blockCount = config.textBlocks?.length ?? 0;
  const blockTag   = blockCount === 0
    ? t('goodbye_setup.status.text_none')
    : t('goodbye_setup.status.text_count', { count: blockCount });

  // ตัวอย่าง farewellText — แสดงแบบตรงๆ ได้เลย (ไม่มี {user} ให้ต้องกัน ping)
  const farewellRaw     = config.farewellText || DEFAULT_CONFIG.farewellText;
  const farewellPreview = farewellRaw.length > 80 ? `${farewellRaw.slice(0, 80)}…` : farewellRaw;

  // ❗ จำลอง field grid 3 คอลัมน์ x 2 แถวด้วยข้อความธรรมดา (ไม่ใช่ embed.addFields()
  // จริง) เพราะ Components V2 (ที่ panel นี้ใช้อยู่ทั้งระบบ เพื่อโชว์รูป preview
  // ผ่าน MediaGallery) ห้าม mix กับ embeds โดยเด็ดขาด — Discord บล็อกตั้งแต่ระดับ
  // API เลย ("content, embeds, stickers, and poll cannot be used" เมื่อตั้ง flag
  // IsComponentsV2) จึงเลียนแบบด้วยการจัด 3 รายการต่อบรรทัด คั่นด้วย " · " แทน
  // ไม่ auto-wrap เป็น 2 คอลัมน์บนมือถือเหมือน native embed field จริง
  const row1 = `**${t('goodbye_setup.status.field_status')}:** ${onOff}   ·   **${t('goodbye_setup.status.field_channel')}:** ${channel}   ·   **${t('goodbye_setup.status.field_background')}:** ${bgTag}`;
  const row2 = `**${t('goodbye_setup.status.field_overlay')}:** ${config.overlayOpacity}%   ·   **${t('goodbye_setup.status.field_avatar')}:** ${avText}   ·   **${t('goodbye_setup.status.field_text')}:** ${blockTag}`;
  const row3 = `**${t('goodbye_setup.status.field_farewell')}:** "${farewellPreview}"`;

  return `${row1}\n${row2}\n\n${row3}`;
}

// ─── Panel Builder Functions ──────────────────────────────────────────────────

/**
 * สร้าง payload ของ main panel
 *
 * @param {string} userId
 * @param {string} guildId
 * @param {{ buffer: Buffer, ext: string }|null} preview - รูป preview (ถ้ามี)
 */
function buildMainPanelPayload(userId, guildId, preview = null) {
  const t          = createTranslator(getGuildLanguage(guildId));
  const config     = sessions.get(sessionKey(guildId, userId)) ?? DEFAULT_CONFIG;
  const components = [];
  const files      = [];

  // ── บรรทัดสถานะ
  components.push(new TextDisplayBuilder().setContent(buildStatusText(config, t)));

  // ── รูป preview
  // ถ้า preview ถูกส่งมาตรงๆ → ใช้อันนั้น (generate ใหม่ล่าสุด)
  // ถ้าไม่มี → fallback ไปที่ config.lastPreview (รูปจาก generate ครั้งก่อน)
  // ทำให้รูปไม่หายเวลากดปุ่มอื่น เช่น toggle, back, channel select
  const activePreview = preview ?? config.lastPreview ?? null;
  if (activePreview) {
    const fname = `wgs_preview.${activePreview.ext}`;
    files.push(new AttachmentBuilder(activePreview.buffer, { name: fname }));
    components.push(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${fname}`)
      )
    );
  }

  // ── hint: แนะนำ /upload-image ก่อนใส่ลิงก์รูป (โชว์แค่ตอนยังไม่ตั้งพื้นหลัง)
  if (!config.backgroundUrl) {
    components.push(new TextDisplayBuilder().setContent(t('goodbye_setup.panel.hint')));
  }

  // ── แถว 1: ปุ่มหลัก 5 ปุ่ม (Discord จำกัด 5 ปุ่มต่อแถวพอดี ห้ามเพิ่มอีกแล้วนะครับ)
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(WGS.BG).setLabel(t('goodbye_setup.panel.button.background')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(WGS.TEXT).setLabel(t('goodbye_setup.panel.button.text')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(WGS.AVATAR).setLabel(t('goodbye_setup.panel.button.avatar')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(WGS.OPACITY).setLabel(t('goodbye_setup.panel.button.opacity')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(WGS.FAREWELL).setLabel(t('goodbye_setup.panel.button.farewell')).setStyle(ButtonStyle.Secondary),
  ));

  // ── แถว 2: ChannelSelectMenu (เลือกช่องอำลา)
  const chanPlaceholder = config.channelId
    ? t('goodbye_setup.panel.channel_placeholder_set')
    : t('goodbye_setup.panel.channel_placeholder_unset');
  components.push(new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(WGS.CHANNEL_SEL)
      .setPlaceholder(chanPlaceholder)
      .addChannelTypes(ChannelType.GuildText),
  ));

  // ── แถว 3: ปุ่มดำเนินการ
  const toggleLabel = config.enabled ? t('goodbye_setup.panel.button.toggle_on') : t('goodbye_setup.panel.button.toggle_off');
  const toggleStyle = config.enabled ? ButtonStyle.Success : ButtonStyle.Secondary;
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(WGS.PREVIEW).setLabel(t('goodbye_setup.panel.button.preview')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(WGS.TOGGLE).setLabel(toggleLabel).setStyle(toggleStyle),
    new ButtonBuilder().setCustomId(WGS.DONE).setLabel(t('goodbye_setup.panel.button.done')).setStyle(ButtonStyle.Success),
  ));

  return {
    components,
    ...(files.length ? { files } : {}),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้าง payload ของ Avatar submenu
 *
 * ถ้า avatar เปิดอยู่ → แสดงปุ่มปรับตำแหน่ง/ขนาด (⬅️ ➡️ ⬆️ ⬇️ ➕ ➖) + ปรับแต่งเอง
 * ถ้า avatar ปิดอยู่ → แสดงแค่ปุ่ม toggle + กลับ
 *
 * @param {string} userId
 * @param {{ buffer: Buffer, ext: string }|null} preview
 */
function buildAvatarSubmenuPayload(userId, guildId, preview = null) {
  const t          = createTranslator(getGuildLanguage(guildId));
  const config     = sessions.get(sessionKey(guildId, userId)) ?? DEFAULT_CONFIG;
  const components = [];
  const files      = [];

  // ── สรุปสถานะ avatar
  const infoText = config.avatarEnabled
    ? t('goodbye_setup.avatar.on_header', { x: config.avatarX, y: config.avatarY, r: config.avatarRadius, stepXY: STEP_XY, stepR: STEP_R })
    : t('goodbye_setup.avatar.off_header');
  components.push(new TextDisplayBuilder().setContent(infoText));

  // ── รูป preview
  if (preview) {
    const fname = `av_preview.${preview.ext}`;
    files.push(new AttachmentBuilder(preview.buffer, { name: fname }));
    components.push(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${fname}`)
      )
    );
  }

  // ── ปุ่มปรับตำแหน่ง (แสดงเฉพาะตอน avatar เปิดอยู่)
  // Discord จำกัด 5 ปุ่มต่อ ActionRow → แบ่งเป็น 2 แถว
  if (config.avatarEnabled) {
    // แถวแรก: ⬅️ ➡️ ⬆️ ⬇️ ➕ (5 ปุ่ม)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(WGS.AV_LEFT).setLabel('⬅️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(WGS.AV_RIGHT).setLabel('➡️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(WGS.AV_UP).setLabel('⬆️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(WGS.AV_DOWN).setLabel('⬇️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(WGS.AV_PLUS).setLabel('➕').setStyle(ButtonStyle.Secondary),
    ));
    // แถวสอง: ➖ + 🎯 ปรับแต่งเอง
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(WGS.AV_MINUS).setLabel('➖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(WGS.AV_CUSTOM).setLabel(t('goodbye_setup.avatar.custom_button')).setStyle(ButtonStyle.Secondary),
    ));
  }

  // ── ปุ่ม toggle + กลับ
  const avToggleLabel = config.avatarEnabled ? t('goodbye_setup.avatar.toggle_on') : t('goodbye_setup.avatar.toggle_off');
  const avToggleStyle = config.avatarEnabled ? ButtonStyle.Danger : ButtonStyle.Success;
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(WGS.AV_TOGGLE).setLabel(avToggleLabel).setStyle(avToggleStyle),
    new ButtonBuilder().setCustomId(WGS.AV_BACK).setLabel(t('goodbye_setup.avatar.back_button')).setStyle(ButtonStyle.Secondary),
  ));

  return {
    components,
    ...(files.length ? { files } : {}),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้าง payload ของ "text block list" — select menu แสดงรายการ block ทั้งหมด
 * + option พิเศษ "+ เพิ่มข้อความใหม่" (mirror pattern จาก /builder จัดการบล็อก)
 *
 * @param {string} userId
 * @param {{ buffer: Buffer, ext: string }|null} preview
 */
function buildTextListPayload(userId, guildId, preview = null) {
  const t          = createTranslator(getGuildLanguage(guildId));
  const config     = sessions.get(sessionKey(guildId, userId)) ?? DEFAULT_CONFIG;
  const blocks     = config.textBlocks ?? [];
  const components = [];
  const files      = [];

  components.push(new TextDisplayBuilder().setContent(
    t('goodbye_setup.text_list.header', { count: blocks.length, ph: '{username}' })
  ));

  // ── รูป preview
  if (preview) {
    const fname = `txlist_preview.${preview.ext}`;
    files.push(new AttachmentBuilder(preview.buffer, { name: fname }));
    components.push(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${fname}`)
      )
    );
  }

  // ── select menu: รายการ block + "+ เพิ่มข้อความใหม่"
  // Discord select menu ต้องมีอย่างน้อย 1 option เสมอ (แม้ blocks จะว่าง)
  const options = blocks.slice(0, MAX_TEXT_BLOCKS - 1).map((block, index) => {
    const preview_ = (block.content || t('goodbye_setup.text_list.block_empty')).slice(0, 80);
    return {
      label: t('goodbye_setup.text_list.block_label', {
        index: index + 1,
        bold: block.bold ? t('goodbye_setup.text_list.block_label_bold') : '',
      }).slice(0, 100),
      description: preview_.length > 0 ? preview_ : undefined,
      value: block.id,
    };
  });

  // เพิ่ม option "+ เพิ่มข้อความใหม่" ต่อท้ายเสมอ (ยกเว้นถ้าเต็ม MAX_TEXT_BLOCKS แล้ว)
  if (blocks.length < MAX_TEXT_BLOCKS) {
    options.push({
      label: t('goodbye_setup.text_list.add_new_label'),
      description: t('goodbye_setup.text_list.add_new_description'),
      value: TEXT_ADD_VALUE,
    });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(WGS.TEXT_LIST_SELECT)
    .setPlaceholder(blocks.length > 0 ? t('goodbye_setup.text_list.placeholder_has_blocks') : t('goodbye_setup.text_list.placeholder_empty'))
    .addOptions(options);

  components.push(new ActionRowBuilder().addComponents(selectMenu));

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(WGS.TEXT_LIST_BACK).setLabel(t('goodbye_setup.text_list.back_button')).setStyle(ButtonStyle.Secondary),
  ));

  return {
    components,
    ...(files.length ? { files } : {}),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้าง payload ของ "text block editor" — แก้ไข block เดียวที่เลือกอยู่
 * (session.currentTextBlockId บอกว่ากำลังแก้ block ไหน)
 *
 * @param {string} userId
 * @param {string} blockId
 * @param {{ buffer: Buffer, ext: string }|null} preview
 */
function buildTextBlockEditorPayload(userId, guildId, blockId, preview = null) {
  const t          = createTranslator(getGuildLanguage(guildId));
  const config     = sessions.get(sessionKey(guildId, userId)) ?? DEFAULT_CONFIG;
  const block      = findTextBlock(config, blockId);
  const components = [];
  const files      = [];

  // guard: block ถูกลบไปแล้วหรือหาไม่เจอ (เช่น เปิด 2 หน้าต่างพร้อมกัน)
  if (!block) {
    components.push(new TextDisplayBuilder().setContent(t('goodbye_setup.text_editor.not_found')));
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(WGS.TXB_BACK).setLabel(t('goodbye_setup.text_editor.not_found_back_button')).setStyle(ButtonStyle.Secondary),
    ));
    return { components, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
  }

  const txPreview = (block.content || t('goodbye_setup.text_list.block_empty')).slice(0, 60)
    + ((block.content?.length ?? 0) > 60 ? '…' : '');

  const boldTag = block.bold ? t('goodbye_setup.text_editor.bold_tag') : t('goodbye_setup.text_editor.normal_tag');
  components.push(new TextDisplayBuilder().setContent(
    t('goodbye_setup.text_editor.header', {
      boldTag, preview: txPreview, x: block.x, y: block.y, size: block.size,
      ph: '{username}', stepXY: STEP_XY, stepSZ: STEP_SZ,
    })
  ));

  // ── รูป preview
  if (preview) {
    const fname = `txb_preview.${preview.ext}`;
    files.push(new AttachmentBuilder(preview.buffer, { name: fname }));
    components.push(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${fname}`)
      )
    );
  }

  // ── select menu เลือกสไตล์ฟอนต์ต่อบล็อกนี้
  // block เก่าที่สร้างก่อนฟีเจอร์นี้จะไม่มี field fontStyle เลย → fallback
  // เป็น 'default' เสมอ (backward compatible เหมือนที่ทำกับ farewellText)
  const fontStyle = block.fontStyle || 'default';
  const fontSelectMenu = new StringSelectMenuBuilder()
    .setCustomId(WGS.TXB_FONT_STYLE)
    .setPlaceholder(t('goodbye_setup.text_editor.font_placeholder'))
    .addOptions(
      { label: t('goodbye_setup.text_editor.font_default'), value: 'default', default: fontStyle === 'default' },
      { label: t('goodbye_setup.text_editor.font_charmonman'), value: 'charmonman', default: fontStyle === 'charmonman' },
      { label: t('goodbye_setup.text_editor.font_chonburi'), value: 'chonburi', default: fontStyle === 'chonburi' },
      { label: t('goodbye_setup.text_editor.font_kanit'), value: 'kanit', default: fontStyle === 'kanit' },
      { label: t('goodbye_setup.text_editor.font_sarabun'), value: 'sarabun', default: fontStyle === 'sarabun' },
    );
  components.push(new ActionRowBuilder().addComponents(fontSelectMenu));

  // ── ปุ่มแก้ไขเนื้อหา + ลบ + toggle bold
  // 🔒 Chonburi ไม่มี Bold จริง (weight เดียว) — ปิดปุ่มไปเลยถ้าเลือกฟอนต์นี้อยู่
  const isChonburi = fontStyle === 'chonburi';
  const boldLabel  = isChonburi
    ? t('goodbye_setup.text_editor.bold_disabled')
    : (block.bold ? t('goodbye_setup.text_editor.bold_on') : t('goodbye_setup.text_editor.bold_off'));
  const boldStyle  = block.bold ? ButtonStyle.Primary : ButtonStyle.Secondary;
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(WGS.TXB_EDIT).setLabel(t('goodbye_setup.text_editor.edit_button')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(WGS.TXB_BOLD).setLabel(boldLabel).setStyle(boldStyle).setDisabled(isChonburi),
    new ButtonBuilder().setCustomId(WGS.TXB_DELETE).setLabel(t('goodbye_setup.text_editor.delete_button')).setStyle(ButtonStyle.Danger),
  ));

  // ── ปุ่มปรับตำแหน่ง/ขนาด (แบ่งเป็น 2 แถว เพราะมี 6 ปุ่ม + ปรับแต่งเอง > 5)
  // แถวแรก: ⬅️ ➡️ ⬆️ ⬇️ ➕ (5 ปุ่ม)
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(WGS.TXB_LEFT).setLabel('⬅️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(WGS.TXB_RIGHT).setLabel('➡️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(WGS.TXB_UP).setLabel('⬆️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(WGS.TXB_DOWN).setLabel('⬇️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(WGS.TXB_PLUS).setLabel('➕').setStyle(ButtonStyle.Secondary),
  ));
  // แถวสอง: ➖ + 🎯 ปรับแต่งเอง + ← กลับ
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(WGS.TXB_MINUS).setLabel('➖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(WGS.TXB_CUSTOM).setLabel(t('goodbye_setup.text_editor.custom_button')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(WGS.TXB_BACK).setLabel(t('goodbye_setup.text_editor.back_button')).setStyle(ButtonStyle.Secondary),
  ));

  return {
    components,
    ...(files.length ? { files } : {}),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

// ─── Preview Helper ───────────────────────────────────────────────────────────

/**
 * Generate preview image โดยใช้ interaction.user เป็น "สมาชิกตัวอย่าง"
 * แทน {username} ด้วยชื่อจริงของคนที่กำลัง preview — ทำกับทุก text block
 *
 * @param {import('discord.js').Interaction} interaction
 * @param {object} config - config ปัจจุบัน
 * @returns {Promise<{ buffer: Buffer, ext: string }>}
 */
async function genPreview(interaction, config) {
  const previewConfig = {
    ...config,
    // แทน {username} ในทุก block (ไม่ใช่แค่ field เดียวเหมือนตอนเป็นก้อนเดียว)
    textBlocks: (config.textBlocks ?? []).map(block => ({
      ...block,
      content: (block.content || '').replace('{username}', interaction.user.username),
    })),
  };
  // previewMode: true → คืน PNG เสมอ แม้ background เป็น GIF
  // เพราะ Discord render animated GIF ใน ephemeral MediaGallery ไม่ได้
  // GIF จริงจะสร้างตอน handleMemberRemove() เท่านั้น
  const result = await generateMemberCardImage(interaction.user, previewConfig, { previewMode: true });
  // เก็บไว้ใน session เพื่อให้ buildMainPanelPayload() ดึงไปแสดงได้ทุกครั้ง
  // config เป็น reference ของ session object → อัปเดตที่นี่ = อัปเดตทั่วทั้ง session
  config.lastPreview = result;
  return result;
}

// ─── Module Exports (command object) ─────────────────────────────────────────

module.exports = {

  // ── data: ข้อมูล slash command (ชื่อ, description)
  data: new SlashCommandBuilder()
    .setName('goodbye-setup')
    .setDescription('Set up member farewell cards')
    .setDescriptionLocalizations({ th: 'ตั้งค่าการ์ดอำลาสมาชิกครับ' }),

  // ══════════════════════════════════════════════════════════════════════════
  // execute: ตอบ panel ครั้งแรก
  // ══════════════════════════════════════════════════════════════════════════
  async execute(interaction) {
    if (!interaction.guildId) {
      const t = createTranslator('en'); // ยังไม่มี guildId เลยไม่มีภาษาเซิร์ฟให้ดึง
      return interaction.reply({ content: t('common.error.guild_only'), flags: MessageFlags.Ephemeral });
    }

    const userId  = interaction.user.id;
    const guildId = interaction.guildId;

    // ── โหลด config จากไฟล์ (ถ้ามี) มาเป็น session ใหม่
    const saved = loadGoodbyeConfig(guildId);

    // ⚠️ ใช้ cloneDefaultConfig() เสมอ (ห้าม spread { ...DEFAULT_CONFIG } ตรงๆ)
    // ดู comment ยาวๆ ที่ตัวฟังก์ชัน cloneDefaultConfig() ด้านบนว่าทำไมถึงสำคัญมาก
    sessions.set(sessionKey(guildId, userId), saved
      ? { ...cloneDefaultConfig(), ...saved, lastPreview: null, currentTextBlockId: null }
      : { ...cloneDefaultConfig(), lastPreview: null, currentTextBlockId: null });

    // ── acknowledge ก่อนภายใน 3 วิ แล้วค่อยทำงานหนัก (genPreview อาจช้า
    // โดยเฉพาะ background เป็น GIF) — กัน error "Unknown interaction" (10062)
    // ที่เกิดตอน interaction token หมดอายุก่อนตอบกลับ
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ── generate preview ทันทีก่อนตอบกลับครั้งแรก — ไม่ต้องรอให้ user
    // กดปุ่มอื่นก่อนเพื่อ trigger genPreview() ทั้งที่ข้อมูลถูกบันทึกไว้
    // ครบถ้วนอยู่แล้วจากรอบก่อน (หรือเป็น guild ใหม่ที่ยังไม่เคยตั้งค่าเลย)
    const config = sessions.get(sessionKey(guildId, userId));
    let preview = null;
    try {
      preview = await genPreview(interaction, config);
    } catch {
      // generate รูปไม่สำเร็จ (เช่น backgroundUrl เสียตอนนี้) → ปล่อยผ่าน
      // ให้ panel เปิดได้ปกติ ไม่มีรูปโชว์ แต่ไม่ error/ไม่บล็อกผู้ใช้
    }

    // ── ตอบกลับ panel ครั้งแรกพร้อมรูป preview (ถ้า generate สำเร็จ)
    // ใช้ editReply() ต่อจาก deferReply() ข้างบน (ไม่ใช่ reply() ตรงๆ แล้ว)
    await interaction.editReply(buildMainPanelPayload(userId, guildId, preview));
  },

  // ══════════════════════════════════════════════════════════════════════════
  // handleButton: จัดการปุ่มทุกอัน (routing ตาม customId)
  // ══════════════════════════════════════════════════════════════════════════
  async handleButton(interaction) {
    const userId  = interaction.user.id;
    const guildId = interaction.guildId;
    const t       = createTranslator(getGuildLanguage(guildId));
    const id      = interaction.customId;
    const config  = sessions.get(sessionKey(guildId, userId));

    // ── Guard: ถ้า session หมดอายุ (เช่น bot restart)
    if (!config) {
      await interaction.reply({
        content: t('goodbye_setup.session_expired'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ════════════════════════════════════════════════════════════
    // MAIN PANEL BUTTONS
    // ════════════════════════════════════════════════════════════

    // ── 🖼️ พื้นหลัง → เปิด modal ให้ใส่ URL
    if (id === WGS.BG) {
      const modal = new ModalBuilder()
        .setCustomId(WGS.MODAL_BG)
        .setTitle(t('goodbye_setup.modal.bg_title'));

      const input = new TextInputBuilder()
        .setCustomId(WGS.INPUT_BG)
        .setLabel(t('goodbye_setup.modal.bg_label'))
        .setStyle(TextInputStyle.Short)
        .setValue(config.backgroundUrl || '')
        .setPlaceholder(t('goodbye_setup.modal.bg_placeholder'))
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // ── 🎨 ความทึบ → เปิด modal
    if (id === WGS.OPACITY) {
      const modal = new ModalBuilder()
        .setCustomId(WGS.MODAL_OPACITY)
        .setTitle(t('goodbye_setup.modal.opacity_title'));

      const input = new TextInputBuilder()
        .setCustomId(WGS.INPUT_OPACITY)
        .setLabel(t('goodbye_setup.modal.opacity_label'))
        .setStyle(TextInputStyle.Short)
        .setValue(String(config.overlayOpacity))
        .setPlaceholder(t('goodbye_setup.modal.example_number', { n: 50 }))
        .setRequired(true)
        .setMaxLength(3);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // ── 📢 ข้อความอำลา → เปิด modal ช่องเดียว (paragraph) แก้ข้อความ Discord message จริง
    // ❌ ไม่มี {user} ให้ใช้เลย — placeholder มีแค่ {username}/{server}
    if (id === WGS.FAREWELL) {
      const modal = new ModalBuilder()
        .setCustomId(WGS.MODAL_FAREWELL)
        .setTitle(t('goodbye_setup.modal.farewell_title'));

      const input = new TextInputBuilder()
        .setCustomId(WGS.INPUT_FAREWELL)
        .setLabel(t('goodbye_setup.modal.farewell_label'))
        .setStyle(TextInputStyle.Paragraph)
        // ← prefill ค่าปัจจุบันจริง ไม่ใช่ค่า default เฉยๆ (เว้นแต่ยังไม่เคยตั้งค่าเลย)
        .setValue(config.farewellText || DEFAULT_CONFIG.farewellText)
        .setPlaceholder(t('goodbye_setup.modal.farewell_placeholder'))
        .setRequired(false)
        .setMaxLength(300);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // ── 👀 ดูตัวอย่าง → ส่งรูป + ข้อความอำลา เป็น ephemeral message เดียวกัน
    // (ไม่แก้ panel) — mirror ของจริงตอน handleMemberRemove() ที่ส่งคู่กันเสมอ
    if (id === WGS.PREVIEW) {
      await interaction.deferUpdate();
      try {
        const preview    = await genPreview(interaction, config);
        const fname      = `wgs_preview.${preview.ext}`;
        const attachment = new AttachmentBuilder(preview.buffer, { name: fname });

        // ── คำนวณข้อความอำลาด้วยฟังก์ชันเดียวกับที่ handleMemberRemove() ใช้จริง
        // interaction.member ใช้แทน member ได้เลย เพราะคำสั่งนี้ guild-only อยู่แล้ว
        // มี .user.username / .guild.name ครบเหมือนกัน (ไม่มี {user} ให้ resolve เลย)
        const farewellTemplate = config.farewellText || DEFAULT_CONFIG.farewellText;
        const farewellPreview  = resolveFarewellPlaceholders(farewellTemplate, interaction.member);

        await interaction.followUp({
          // ไม่มี header ครอบ — Discord โชว์ "Only you can see this" ให้อัตโนมัติทุก ephemeral อยู่แล้ว
          // เหลือแค่ farewellPreview ตรงๆ = เหมือนของจริงที่ handleMemberRemove() ส่งเป๊ะ
          content: farewellPreview,
          files:   [attachment],
          flags:   MessageFlags.Ephemeral,
          // 🚨 กัน mention ทุกชนิด — preview นี้ไม่ควร ping ใครเลย (ไม่มี {user} ให้ resolve
          // อยู่แล้ว แต่กันไว้เผื่อ user พิมพ์ mention คนอื่นเองในข้อความ)
          allowedMentions: { parse: [], users: [] },
        });
      } catch (e) {
        console.error('[wgs preview error]', e);
        await interaction.followUp({
          content: t('goodbye_setup.preview.error', { error: e.message }),
          flags:   MessageFlags.Ephemeral,
        }).catch(() => {});
      }
      return;
    }

    // ── 🔛 เปิด/ปิด → toggle แล้ว update panel ทันที
    if (id === WGS.TOGGLE) {
      config.enabled = !config.enabled;
      persist(guildId, config);
      await interaction.update(buildMainPanelPayload(userId, guildId));
      return;
    }

    // ── ✅ เสร็จแล้ว → บันทึก config ลงไฟล์ (ผ่าน persist() กลาง — logic เดิมทุกอย่าง
    // แค่ไม่ save ซ้ำ 2 แบบในไฟล์เดียวกัน เพราะทุกจุดอื่นก็ persist() ไปแล้วระหว่างทาง)
    if (id === WGS.DONE) {
      persist(guildId, config);

      sessions.delete(sessionKey(guildId, userId));

      const chNote  = config.channelId
        ? t('goodbye_setup.done.channel_note', { channel: `<#${config.channelId}>` })
        : t('goodbye_setup.done.channel_unset_note');
      const onNote  = config.enabled
        ? t('goodbye_setup.done.status_on')
        : t('goodbye_setup.done.status_off');

      await interaction.update({
        components: [
          new TextDisplayBuilder().setContent(
            t('goodbye_setup.done.message', { onNote, chNote })
          ),
        ],
        files: [],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    // ── 👤 Avatar → เปิด avatar submenu พร้อม preview
    if (id === WGS.AVATAR) {
      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch { /* ไม่มี preview ก็ได้ */ }
      await interaction.editReply(buildAvatarSubmenuPayload(userId, interaction.guildId, preview));
      return;
    }

    // ── 💬 ข้อความ → เปิด text block list (ไม่ใช่ submenu ก้อนเดียวแล้ว)
    if (id === WGS.TEXT) {
      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildTextListPayload(userId, interaction.guildId, preview));
      return;
    }

    // ════════════════════════════════════════════════════════════
    // AVATAR SUBMENU BUTTONS
    // ════════════════════════════════════════════════════════════

    if (id === WGS.AV_TOGGLE) {
      config.avatarEnabled = !config.avatarEnabled;
      persist(guildId, config);
      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildAvatarSubmenuPayload(userId, interaction.guildId, preview));
      return;
    }

    // ── 🎯 ปรับแต่งเอง (avatar) → เปิด modal พิกัดตรง พร้อม prefill ค่าปัจจุบัน
    if (id === WGS.AV_CUSTOM) {
      const modal = new ModalBuilder()
        .setCustomId(WGS.MODAL_AV_CUSTOM)
        .setTitle(t('goodbye_setup.modal.avatar_custom_title'));

      const inputX = new TextInputBuilder()
        .setCustomId(WGS.INPUT_AV_X)
        .setLabel(t('goodbye_setup.modal.avatar_x_label'))
        .setStyle(TextInputStyle.Short)
        .setValue(String(config.avatarX)) // ← prefill ค่าปัจจุบันจริง ไม่ใช่ช่องว่าง
        .setPlaceholder(t('goodbye_setup.modal.example_number', { n: 50 }))
        .setRequired(true)
        .setMaxLength(3);

      const inputY = new TextInputBuilder()
        .setCustomId(WGS.INPUT_AV_Y)
        .setLabel(t('goodbye_setup.modal.avatar_y_label'))
        .setStyle(TextInputStyle.Short)
        .setValue(String(config.avatarY))
        .setPlaceholder(t('goodbye_setup.modal.example_number', { n: 33 }))
        .setRequired(true)
        .setMaxLength(3);

      const inputR = new TextInputBuilder()
        .setCustomId(WGS.INPUT_AV_R)
        .setLabel(t('goodbye_setup.modal.avatar_r_label'))
        .setStyle(TextInputStyle.Short)
        .setValue(String(config.avatarRadius))
        .setPlaceholder(t('goodbye_setup.modal.example_number', { n: 19 }))
        .setRequired(true)
        .setMaxLength(3);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputX),
        new ActionRowBuilder().addComponents(inputY),
        new ActionRowBuilder().addComponents(inputR),
      );
      await interaction.showModal(modal);
      return;
    }

    // ── nudge ตำแหน่ง/ขนาด avatar
    if (id === WGS.AV_LEFT)  config.avatarX      = clamp(config.avatarX      - STEP_XY, 5,  95);
    if (id === WGS.AV_RIGHT) config.avatarX      = clamp(config.avatarX      + STEP_XY, 5,  95);
    if (id === WGS.AV_UP)    config.avatarY      = clamp(config.avatarY      - STEP_XY, 5,  95);
    if (id === WGS.AV_DOWN)  config.avatarY      = clamp(config.avatarY      + STEP_XY, 5,  95);
    if (id === WGS.AV_PLUS)  config.avatarRadius = clamp(config.avatarRadius + STEP_R,  5,  45);
    if (id === WGS.AV_MINUS) config.avatarRadius = clamp(config.avatarRadius - STEP_R,  5,  45);

    if (AV_NUDGE_IDS.includes(id)) {
      persist(guildId, config);
      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildAvatarSubmenuPayload(userId, interaction.guildId, preview));
      return;
    }

    if (id === WGS.AV_BACK) {
      await interaction.update(buildMainPanelPayload(userId, guildId));
      return;
    }

    // ════════════════════════════════════════════════════════════
    // TEXT BLOCK LIST BUTTONS
    // ════════════════════════════════════════════════════════════

    if (id === WGS.TEXT_LIST_BACK) {
      await interaction.update(buildMainPanelPayload(userId, guildId));
      return;
    }

    // ════════════════════════════════════════════════════════════
    // TEXT BLOCK EDITOR BUTTONS (ต่อ block ที่เลือกอยู่)
    // ════════════════════════════════════════════════════════════

    const activeBlockId = config.currentTextBlockId;
    const activeBlock    = activeBlockId ? findTextBlock(config, activeBlockId) : null;

    // ── ✏️ แก้ไขเนื้อหา → เปิด modal (prefill เนื้อหาเดิม)
    if (id === WGS.TXB_EDIT) {
      if (!activeBlock) {
        await interaction.reply({ content: t('goodbye_setup.block_not_found'), flags: MessageFlags.Ephemeral });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(WGS.MODAL_TXB_EDIT)
        .setTitle(t('goodbye_setup.modal.txb_edit_title'));

      const input = new TextInputBuilder()
        .setCustomId(WGS.INPUT_TXB_EDIT)
        .setLabel(t('goodbye_setup.modal.txb_edit_label', { ph: '{username}' }))
        .setStyle(TextInputStyle.Paragraph)
        .setValue(activeBlock.content || '') // ← prefill เนื้อหาเดิม
        .setPlaceholder(t('goodbye_setup.modal.txb_edit_placeholder', { ph: '{username}' }))
        .setRequired(true)
        .setMaxLength(200);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // ── 🗑️ ลบ block นี้ → กลับไป list
    if (id === WGS.TXB_DELETE) {
      config.textBlocks = (config.textBlocks ?? []).filter(b => b.id !== activeBlockId);
      config.currentTextBlockId = null;
      persist(guildId, config);

      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildTextListPayload(userId, interaction.guildId, preview));
      return;
    }

    // ── B toggle ตัวหนา เฉพาะ block นี้
    if (id === WGS.TXB_BOLD) {
      if (activeBlock) {
        activeBlock.bold = !activeBlock.bold;
        persist(guildId, config);
      }
      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildTextBlockEditorPayload(userId, interaction.guildId, activeBlockId, preview));
      return;
    }

    // ── 🎯 ปรับแต่งเอง (text block) → เปิด modal พิกัดตรง พร้อม prefill ค่าปัจจุบัน
    if (id === WGS.TXB_CUSTOM) {
      if (!activeBlock) {
        await interaction.reply({ content: t('goodbye_setup.block_not_found'), flags: MessageFlags.Ephemeral });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(WGS.MODAL_TXB_CUSTOM)
        .setTitle(t('goodbye_setup.modal.txb_custom_title'));

      const inputX = new TextInputBuilder()
        .setCustomId(WGS.INPUT_TXB_X)
        .setLabel(t('goodbye_setup.modal.txb_x_label'))
        .setStyle(TextInputStyle.Short)
        .setValue(String(activeBlock.x)) // ← prefill ค่าปัจจุบันจริง
        .setPlaceholder(t('goodbye_setup.modal.example_number', { n: 50 }))
        .setRequired(true)
        .setMaxLength(3);

      const inputY = new TextInputBuilder()
        .setCustomId(WGS.INPUT_TXB_Y)
        .setLabel(t('goodbye_setup.modal.txb_y_label'))
        .setStyle(TextInputStyle.Short)
        .setValue(String(activeBlock.y))
        .setPlaceholder(t('goodbye_setup.modal.example_number', { n: 72 }))
        .setRequired(true)
        .setMaxLength(3);

      const inputSize = new TextInputBuilder()
        .setCustomId(WGS.INPUT_TXB_SIZE)
        .setLabel(t('goodbye_setup.modal.txb_size_label'))
        .setStyle(TextInputStyle.Short)
        .setValue(String(activeBlock.size))
        .setPlaceholder(t('goodbye_setup.modal.example_number', { n: 12 }))
        .setRequired(true)
        .setMaxLength(3);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputX),
        new ActionRowBuilder().addComponents(inputY),
        new ActionRowBuilder().addComponents(inputSize),
      );
      await interaction.showModal(modal);
      return;
    }

    // ── nudge ตำแหน่ง/ขนาด text block ที่เลือกอยู่
    if (activeBlock) {
      if (id === WGS.TXB_LEFT)  activeBlock.x    = clamp(activeBlock.x    - STEP_XY, 5,  95);
      if (id === WGS.TXB_RIGHT) activeBlock.x    = clamp(activeBlock.x    + STEP_XY, 5,  95);
      if (id === WGS.TXB_UP)    activeBlock.y    = clamp(activeBlock.y    - STEP_XY, 5,  95);
      if (id === WGS.TXB_DOWN)  activeBlock.y    = clamp(activeBlock.y    + STEP_XY, 5,  95);
      if (id === WGS.TXB_PLUS)  activeBlock.size = clamp(activeBlock.size + STEP_SZ, 4,  25);
      if (id === WGS.TXB_MINUS) activeBlock.size = clamp(activeBlock.size - STEP_SZ, 4,  25);
      // persist เฉพาะตอนเป็นปุ่ม nudge จริงๆ (กันกรณี activeBlock มีค่าแต่ id ไม่ตรงปุ่มไหนเลย)
      if (TXB_NUDGE_IDS.includes(id)) persist(guildId, config);
    }

    if (TXB_NUDGE_IDS.includes(id)) {
      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildTextBlockEditorPayload(userId, interaction.guildId, activeBlockId, preview));
      return;
    }

    // ── ← กลับไปรายการ block
    if (id === WGS.TXB_BACK) {
      config.currentTextBlockId = null;
      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildTextListPayload(userId, interaction.guildId, preview));
      return;
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // handleSelectMenu: เมื่อ user เลือกจาก StringSelectMenu (text block list)
  // ══════════════════════════════════════════════════════════════════════════
  async handleSelectMenu(interaction) {
    const userId  = interaction.user.id;
    const guildId = interaction.guildId; // เพิ่มเข้ามาใหม่ — ต้องใช้ประกอบ session key ผสม
    const t       = createTranslator(getGuildLanguage(guildId));
    const config = sessions.get(sessionKey(guildId, userId));

    if (!config) {
      await interaction.reply({
        content: t('goodbye_setup.session_expired'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.customId === WGS.TEXT_LIST_SELECT) {
      const selectedValue = interaction.values[0];

      // ── กด "+ เพิ่มข้อความใหม่" → สร้าง block ใหม่ + เปิด editor ทันที
      if (selectedValue === TEXT_ADD_VALUE) {
        if ((config.textBlocks ?? []).length >= MAX_TEXT_BLOCKS) {
          await interaction.reply({
            content: t('goodbye_setup.text_list.max_blocks_warning', { max: MAX_TEXT_BLOCKS }),
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const newBlock = {
          id:        generateBlockId(),
          content:   t('goodbye_setup.text_list.new_block_content'),
          x:         50,
          y:         50,
          size:      10,
          bold:      false,
          fontStyle: 'default',
        };
        config.textBlocks = [...(config.textBlocks ?? []), newBlock];
        config.currentTextBlockId = newBlock.id;
        persist(interaction.guildId, config);

        await interaction.deferUpdate();
        let preview = null;
        try { preview = await genPreview(interaction, config); } catch {}
        await interaction.editReply(buildTextBlockEditorPayload(userId, interaction.guildId, newBlock.id, preview));
        return;
      }

      // ── เลือก block ที่มีอยู่แล้ว → เปิด editor ของ block นั้น
      config.currentTextBlockId = selectedValue;

      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildTextBlockEditorPayload(userId, interaction.guildId, selectedValue, preview));
      return;
    }

    // ── เลือกสไตล์ฟอนต์ต่อ text block ที่เปิดอยู่
    if (interaction.customId === WGS.TXB_FONT_STYLE) {
      const activeBlockId = config.currentTextBlockId;
      const activeBlock   = findTextBlock(config, activeBlockId);
      const selectedStyle = interaction.values[0];

      if (activeBlock) {
        activeBlock.fontStyle = selectedStyle;
        // 🔒 สลับมาเป็น Chonburi แล้วเคย Bold ค้างอยู่ → เคลียร์ทิ้งเลย
        // (ปุ่ม Bold จะโดน disable ก็จริง แต่ data เก่าอาจมี bold:true
        // ค้างอยู่ถ้าตั้งไว้ก่อนสลับฟอนต์ ต้องเคลียร์ให้ตรงกับ UI)
        if (selectedStyle === 'chonburi') activeBlock.bold = false;
        // ❗ handleSelectMenu ไม่มีตัวแปร guildId ประกาศไว้ ต้องใช้ interaction.guildId
        persist(interaction.guildId, config);
      }

      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildTextBlockEditorPayload(userId, interaction.guildId, activeBlockId, preview));
      return;
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // handleChannelSelect: เมื่อ user เลือกช่องจาก ChannelSelectMenu
  // ══════════════════════════════════════════════════════════════════════════
  async handleChannelSelect(interaction) {
    const userId  = interaction.user.id;
    const guildId = interaction.guildId; // เพิ่มเข้ามาใหม่ — ต้องใช้ประกอบ session key ผสม
    const t      = createTranslator(getGuildLanguage(guildId));
    const config = sessions.get(sessionKey(guildId, userId));

    if (!config) {
      await interaction.reply({
        content: t('goodbye_setup.session_expired'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.channels.first();
    config.channelId = channel?.id ?? null;
    persist(interaction.guildId, config);

    await interaction.update(buildMainPanelPayload(userId, interaction.guildId));
  },

  // ══════════════════════════════════════════════════════════════════════════
  // handleModalSubmit: เมื่อ user submit modal
  // ══════════════════════════════════════════════════════════════════════════
  async handleModalSubmit(interaction) {
    const userId  = interaction.user.id;
    const guildId = interaction.guildId; // เพิ่มเข้ามาใหม่ — ต้องใช้ประกอบ session key ผสม
    const t       = createTranslator(getGuildLanguage(guildId));
    const config = sessions.get(sessionKey(guildId, userId));

    // ─── Modal: พื้นหลัง (ใส่ URL)
    if (interaction.customId === WGS.MODAL_BG) {
      // ── STEP 1: acknowledge ทันทีก่อนทำอะไรทั้งนั้น
      try {
        await interaction.deferUpdate();
      } catch (deferErr) {
        console.error('[wgs modal_bg] deferUpdate ล้มเหลว — interaction อาจหมดอายุ:', deferErr.message);
        return;
      }

      const rawUrl = interaction.fields.getTextInputValue(WGS.INPUT_BG).trim();

      if (!rawUrl) {
        if (config) {
          config.backgroundUrl = null;
          persist(interaction.guildId, config);
        }
        await interaction.editReply(buildMainPanelPayload(userId, interaction.guildId));
        return;
      }

      try { new URL(rawUrl); } catch {
        await interaction.followUp({
          content: t('goodbye_setup.bg.invalid_url'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const extMatch = rawUrl.match(/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i);
      if (!extMatch) {
        await interaction.followUp({
          content: t('goodbye_setup.bg.invalid_extension'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const isGif = /\.gif(?:[?#]|$)/i.test(rawUrl);
      if (isGif && !isPremiumGuild(interaction.guildId)) {
        const reason = t('goodbye_setup.bg.premium_required');
        await interaction.followUp({
          content: buildUpgradeMessage(t, reason),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ⚠️ เตือนถ้าเป็นลิงก์ media proxy ของ Discord (หมดอายุได้)
      // ไม่ block — ยังบันทึกให้ตามปกติ แค่เตือนไว้ก่อน
      let hostname = '';
      try { hostname = new URL(rawUrl).hostname; } catch {}
      if (hostname === 'media.discordapp.net') {
        await interaction.followUp({
          content: t('goodbye_setup.bg.temp_link_warning'),
          flags: MessageFlags.Ephemeral,
        });
      }

      if (config) {
        config.backgroundUrl = rawUrl;
        persist(interaction.guildId, config);
      }

      let preview = null;
      try {
        preview = await genPreview(interaction, config);
      } catch (e) {
        console.error('[wgs modal_bg] generate preview ล้มเหลว:', e.message);
      }

      await interaction.editReply(buildMainPanelPayload(userId, interaction.guildId, preview));
      return;
    }

    // ─── Modal: ความทึบ overlay
    if (interaction.customId === WGS.MODAL_OPACITY) {
      const raw = interaction.fields.getTextInputValue(WGS.INPUT_OPACITY).trim();
      const val = parseInt(raw, 10);

      if (isNaN(val) || val < 0 || val > 100) {
        await interaction.reply({
          content: t('goodbye_setup.opacity.invalid'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (config) {
        config.overlayOpacity = val;
        persist(interaction.guildId, config);
      }
      await interaction.update(buildMainPanelPayload(userId, interaction.guildId));
      return;
    }

    // ─── Modal: ข้อความอำลา (Discord message จริง นอกรูป)
    // ❌ ไม่มี STEP เช็ค {user} เหมือนฝั่ง welcome — เพราะ farewellText ไม่รองรับ
    // {user} ตั้งแต่ต้น (ไม่มี placeholder นี้ให้เช็ค ไม่ต้อง validate/เตือนอะไรเลย)
    if (interaction.customId === WGS.MODAL_FAREWELL) {
      // ── STEP 1: acknowledge ทันทีก่อน (มีขั้นตอนแปลง emoji ที่อาจใช้เวลานิดหน่อย)
      try {
        await interaction.deferUpdate();
      } catch (deferErr) {
        console.error('[wgs modal_farewell] deferUpdate ล้มเหลว — interaction อาจหมดอายุ:', deferErr.message);
        return;
      }

      const raw = interaction.fields.getTextInputValue(WGS.INPUT_FAREWELL).trim();
      // เว้นว่าง → กลับไปใช้ default (พฤติกรรมเดิม ไม่ใช่ข้อความว่างเปล่า)
      const beforeEmoji = raw || DEFAULT_CONFIG.farewellText;

      // ── STEP 2: แปลง :ชื่ออิโมจิ: เป็น <:ชื่อ:id> ก่อนบันทึก (เหมือน /builder)
      // Unicode emoji ทั่วไปไม่ต้องแปลง ผ่านมาเฉยๆ อยู่แล้ว
      const resolvedText = resolveCustomEmojis(beforeEmoji, interaction.guild);

      if (config) {
        config.farewellText = resolvedText;
        persist(interaction.guildId, config);
      }

      await interaction.editReply(buildMainPanelPayload(userId, interaction.guildId));
      return;
    }

    // ─── Modal: avatar ปรับแต่งเอง (พิกัดตรง)
    if (interaction.customId === WGS.MODAL_AV_CUSTOM) {
      const rawX = interaction.fields.getTextInputValue(WGS.INPUT_AV_X).trim();
      const rawY = interaction.fields.getTextInputValue(WGS.INPUT_AV_Y).trim();
      const rawR = interaction.fields.getTextInputValue(WGS.INPUT_AV_R).trim();

      const x = parseInt(rawX, 10);
      const y = parseInt(rawY, 10);
      const r = parseInt(rawR, 10);

      // validate ทั้ง 3 ค่าพร้อมกัน — แจ้ง error รวมถ้ามีค่าไหนผิด
      const errors = [];
      if (isNaN(x) || x < 0 || x > 100) errors.push(t('goodbye_setup.coord_error.x'));
      if (isNaN(y) || y < 0 || y > 100) errors.push(t('goodbye_setup.coord_error.y'));
      if (isNaN(r) || r < 5 || r > 45)  errors.push(t('goodbye_setup.coord_error.r'));

      if (errors.length > 0) {
        await interaction.reply({
          content: `❌ ${errors.join(' / ')}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (config) {
        config.avatarX      = x;
        config.avatarY      = y;
        config.avatarRadius = r;
        persist(interaction.guildId, config);
      }

      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildAvatarSubmenuPayload(userId, interaction.guildId, preview));
      return;
    }

    // ─── Modal: แก้ไขเนื้อหา text block
    if (interaction.customId === WGS.MODAL_TXB_EDIT) {
      const text    = interaction.fields.getTextInputValue(WGS.INPUT_TXB_EDIT).trim();
      const blockId = config?.currentTextBlockId;
      const block   = blockId ? findTextBlock(config, blockId) : null;

      // ── แปลง :ชื่ออิโมจิ: เป็น <:ชื่อ:id> ก่อนบันทึก (เหมือนที่ทำกับ wgs_farewell ด้านบน)
      // เหตุผลที่เพิ่งเพิ่มตรงนี้ (เดิมไม่มี): กล่องข้อความในโมดัลของ Discord พิมพ์
      // อิโมจิในเซิร์ฟแบบ picker ไม่ได้ (โมดัลเป็นแค่กล่องข้อความธรรมดา ไม่มี
      // emoji picker ให้กด) ผู้ใช้ทั่วไปแทบไม่มีทางรู้ syntax ดิบ <:ชื่อ:id> เลย
      // การแปลงจาก :ชื่อ: ให้อัตโนมัติแบบนี้เลยทำให้ใช้งานได้จริงในทางปฏิบัติ
      // ส่วนอิโมจิทั่วไป (Unicode เช่น 😀) พิมพ์ผ่าน emoji keyboard ของเครื่องได้อยู่แล้ว
      // ไม่ต้องแปลงอะไร ผ่านมาเฉยๆ — canvasDrawHelpers.js จะไปจัดการเรื่องโหลดรูป
      // มาวาดแทนตอน generate การ์ดเอง (ดูฟังก์ชัน drawAllTextBlocks ในไฟล์นั้น)
      const resolvedText = resolveCustomEmojis(text, interaction.guild);

      if (block) {
        block.content = resolvedText;
        persist(interaction.guildId, config);
      }

      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildTextBlockEditorPayload(userId, interaction.guildId, blockId, preview));
      return;
    }

    // ─── Modal: text block ปรับแต่งเอง (พิกัดตรง)
    if (interaction.customId === WGS.MODAL_TXB_CUSTOM) {
      const rawX    = interaction.fields.getTextInputValue(WGS.INPUT_TXB_X).trim();
      const rawY    = interaction.fields.getTextInputValue(WGS.INPUT_TXB_Y).trim();
      const rawSize = interaction.fields.getTextInputValue(WGS.INPUT_TXB_SIZE).trim();

      const x    = parseInt(rawX, 10);
      const y    = parseInt(rawY, 10);
      const size = parseInt(rawSize, 10);

      const errors = [];
      if (isNaN(x) || x < 0 || x > 100)   errors.push(t('goodbye_setup.coord_error.x'));
      if (isNaN(y) || y < 0 || y > 100)   errors.push(t('goodbye_setup.coord_error.y'));
      if (isNaN(size) || size < 4 || size > 25) errors.push(t('goodbye_setup.coord_error.size'));

      if (errors.length > 0) {
        await interaction.reply({
          content: `❌ ${errors.join(' / ')}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const blockId = config?.currentTextBlockId;
      const block   = blockId ? findTextBlock(config, blockId) : null;
      if (block) {
        block.x    = x;
        block.y    = y;
        block.size = size;
        persist(interaction.guildId, config);
      }

      await interaction.deferUpdate();
      let preview = null;
      try { preview = await genPreview(interaction, config); } catch {}
      await interaction.editReply(buildTextBlockEditorPayload(userId, interaction.guildId, blockId, preview));
      return;
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // handleMemberRemove: ส่งรูปอำลาจริงเมื่อมีสมาชิกออกจากเซิร์ฟเวอร์
  // เรียกจาก client.on('guildMemberRemove', ...) ใน index.js
  //
  // ⚠️ v1 (ตามที่ตกลง): ไม่แยกกรณีโดนเตะ/แบน/ออกเอง ส่งข้อความอำลาเหมือนกันหมด
  //    ทุกกรณี ไม่ต้องเช็ค Audit Log
  // ══════════════════════════════════════════════════════════════════════════
  async handleMemberRemove(member) {
    const guildId = member.guild.id;

    const config = loadGoodbyeConfig(guildId);

    if (!config || !config.enabled || !config.channelId) return;

    const channel = member.guild.channels.cache.get(config.channelId)
      ?? await member.guild.channels.fetch(config.channelId).catch(() => null);

    if (!channel?.isTextBased?.()) return;

    try {
      // ── แทน placeholder ในเนื้อหาทุก text block (ใช้ร่วมกันทั้ง 2 เส้นทาง)
      // ไม่มี {user} ให้แทนเลย (ตัดออกตั้งแต่ design) — แค่ {username} ธรรมดา
      const sendTextBlocks = (config.textBlocks ?? []).map(block => ({
        ...block,
        content: (block.content || '').replace('{username}', member.user.username),
      }));

      // ── เช็คว่าควรใช้ background แบบ animated GIF ไหม — ตัดสินใจเส้นทางตรงนี้
      // ต่างจากเดิมตรงที่ไม่ได้เช็คแค่นามสกุลไฟล์เฉยๆ แล้ว (นามสกุล .gif ไม่ได้แปลว่า
      // ต้องได้ animated เสมอไป) — ใช้ resolveBackgroundType() เช็ค isPremiumGuild()
      // ซ้ำอีกรอบด้วย เพราะเซิร์ฟอาจตั้ง GIF ไว้ตอนยังเป็นพรีเมี่ยม แล้วหมดพรีเมี่ยมไป
      // ทีหลัง (เช่น subscription หมดอายุ) โดยที่ config.backgroundUrl ยังเป็น .gif
      // ค้างอยู่เหมือนเดิม ถ้าไม่เช็คซ้ำตรงนี้ จะกลายเป็น "ภาพเคลื่อนไหวฟรี" ต่อไปเรื่อยๆ
      // ทั้งที่ไม่ได้จ่ายเงินแล้ว — resolveBackgroundType() จะ fallback เป็น 'static'
      // ให้เงียบๆ เอง (ไม่ error) แล้วเส้นทาง PNG ด้านล่างจะตัดเฟรมแรกของ GIF มาใช้
      // เป็นภาพนิ่งให้อัตโนมัติอยู่แล้ว (เหมือนที่ previewMode ใช้อยู่ตอนนี้)
      const requestedType = /\.gif(\?|$)/i.test(config.backgroundUrl ?? '') ? 'animated' : 'static';
      const isGif = resolveBackgroundType(guildId, requestedType) === 'animated';

      console.log(
        `[handleMemberRemove] สร้างรูปอำลาสำหรับ ${member.user.tag}` +
        ` ใน ${member.guild.name} (bg: ${config.backgroundUrl ? (isGif ? 'GIF' : 'PNG') : 'gradient'}` +
        `, ${sendTextBlocks.length} text blocks)`
      );

      let buffer, ext;

      if (isGif) {
        // ── เส้นทาง GIF: ส่งไป worker pool (ไม่บล็อก event loop หลัก)
        //
        // ❗ ต้องส่ง avatarUrl เป็น string แทนที่จะโหลด Image ในเธรดหลักแล้วส่ง
        // เพราะ loaded Image object (native binding) ส่งข้าม thread ไม่ได้
        // (ไม่ structured-clonable) — worker จะไปโหลดรูป avatar เองจาก URL นี้
        let avatarUrl = null;
        if (config.avatarEnabled) {
          try {
            avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
          } catch { /* เอา avatarUrl ไม่ได้ → ส่ง null ไป worker จะข้ามการวาด avatar เอง */ }
        }

        const jobConfig = {
          backgroundUrl:  config.backgroundUrl,
          overlayOpacity: config.overlayOpacity,
          avatarEnabled:  config.avatarEnabled,
          avatarUrl,
          avatarX:        config.avatarX,
          avatarY:        config.avatarY,
          avatarRadius:   config.avatarRadius,
          textBlocks:     sendTextBlocks,
        };

        buffer = await runWelcomeGifJob(jobConfig);
        ext    = 'gif';
      } else {
        // ── เส้นทาง PNG: เร็วพออยู่แล้ว ไม่ต้องย้ายไป worker
        const sendConfig = { ...config, textBlocks: sendTextBlocks };
        const result = await generateMemberCardImage(member, sendConfig);
        buffer = result.buffer;
        ext    = result.ext;
      }

      const attachment = new AttachmentBuilder(buffer, { name: `goodbye.${ext}` });

      // ── ข้อความอำลา (Discord message จริง นอกรูป)
      // config มาจาก loadGoodbyeConfig() ตรงๆ (ไม่ได้ merge กับ DEFAULT_CONFIG เหมือนตอน execute())
      // ดังนั้น guild เก่าที่ยังไม่เคยตั้งค่า farewellText เลย → config.farewellText จะเป็น undefined
      // ต้อง fallback เป็น DEFAULT_CONFIG.farewellText เอง
      const farewellTemplate = config.farewellText ?? DEFAULT_CONFIG.farewellText;
      const farewellContent  = resolveFarewellPlaceholders(farewellTemplate, member);

      await channel.send({
        content: farewellContent,
        files:   [attachment],
        // 🔒 กัน mention/ping ทุกชนิดแบบ hardcode ตายตัว — ต่างจาก welcome ที่ยอมให้
        // ping สมาชิกใหม่ได้ 1 คน เพราะ goodbye ไม่มีเหตุผลที่ต้อง ping ใครเลยสักคน
        // (สมาชิกออกจากเซิร์ฟไปแล้ว ไม่มีใครให้ ping)
        allowedMentions: { parse: [], users: [] },
      });

      console.log(
        `[handleMemberRemove] ✅ ส่งสำเร็จ` +
        ` — ${ext.toUpperCase()}, ${(buffer.length / 1024).toFixed(1)} KB` +
        ` (${isGif ? 'worker thread' : 'main thread'})`
      );
    } catch (e) {
      console.error('[handleMemberRemove] ❌ ส่งรูปอำลาไม่สำเร็จ:', e);
    }
  },
};