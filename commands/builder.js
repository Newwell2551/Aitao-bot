const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  TextDisplayBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require('discord.js');
const {
  getDraft,
  addBlock,
  clearDraft,
  getBlockAt,
  removeBlockAt,
  updateBlockAt,
  insertBlockAt,
  setAccentColor,
  swapBlocks,
  setPendingRoleButton,
  getPendingRoleButton,
  clearPendingRoleButton,
  setPendingChannelButton,
  getPendingChannelButton,
  clearPendingChannelButton,
  // named draft management
  namedDraftExists,
  createNamedDraft,
  openNamedDraft,
  deleteNamedDraft,
  listGuildDrafts,
  // session management
  getActiveSession,
  clearActiveSession,
} = require('../utils/builderDrafts');
// ⚠️ ฟังก์ชันทุกตัวข้างบน (ยกเว้น namedDraftExists/createNamedDraft/openNamedDraft/
// deleteNamedDraft/listGuildDrafts ที่รับ guildId อยู่แล้วแต่เดิม) ตอนนี้ต้องการ
// guildId เป็น argument แรกเสมอ เพราะ Map ข้างใน builderDrafts.js เปลี่ยนไปใช้
// key ผสม `${guildId}_${userId}` แล้ว (เดิมใช้ userId เดี่ยวๆ ทำให้ session ของ
// user คนเดียวกันชนกันข้ามเซิร์ฟได้ ถ้าสลับไปเปิดคำสั่งนี้ในเซิร์ฟอื่นก่อนกด
// "เสร็จแล้ว"/โพสต์ ที่เซิร์ฟแรก) ทุกจุดที่เรียกฟังก์ชันพวกนี้ในไฟล์นี้จึงต้อง
// ส่ง guildId (หรือ interaction.guildId) เป็น argument แรกเสมอ ก่อน userId
const { validateUrl, validateHttpUrl, buildMessageFromSchema } = require('../utils/buildMessageFromSchema');
const { resolveCustomEmojis } = require('../utils/resolveCustomEmojis');
const { checkImageUrlLooksValid } = require('../utils/checkImageUrl');
const { getGuildLanguage } = require('../utils/languageStorage');
const { createTranslator } = require('../utils/i18n');
const { isPremiumGuild } = require('../utils/tierManager');
const { buildUpgradeMessage } = require('../utils/premiumGate');

// หมายเหตุ: ข้อความคำแนะนำใต้ช่องกรอก URL รูปภาพ (เดิมเป็นค่าคงที่ IMAGE_URL_HINT)
// ย้ายเข้าไปอยู่ใน locale key "builder.modal.image_url_hint" แล้ว เรียกผ่าน t() ที่แต่ละจุดใช้งานแทน
// (เดิมเป็น string คงที่ ข้ามระบบภาษาไปเพราะ setDescription() ของ LabelBuilder ไม่ใช่ SlashCommandBuilder)

// customId ของปุ่ม/modal/select menu ทั้งหมดในฟีเจอร์นี้ รวมไว้ที่เดียวกันกันพิมพ์ผิด
const IDS = {
  ADD_TEXT: 'builder_add_text',
  ADD_IMAGE: 'builder_add_image',
  ADD_SEPARATOR: 'builder_add_separator',
  ADD_SECTION: 'builder_add_section', // ปุ่ม "+ เพิ่ม Section" (เปิดหน้าจอย่อยให้เลือกรูปเล็ก/ปุ่มลิงก์/ปุ่มยศ)
  ADD_SECTION_THUMBNAIL: 'builder_add_section_thumbnail', // ตัวเลือกย่อย "🖼️ รูปเล็ก"
  ADD_SECTION_BUTTON: 'builder_add_section_button', // ตัวเลือกย่อย "🔘 ปุ่มลิงก์"
  ADD_SECTION_ROLE: 'builder_add_section_role', // ตัวเลือกย่อย "🎭 ปุ่มยศ"
  ADD_SECTION_CHANNEL: 'builder_add_section_channel', // ตัวเลือกย่อย "📢 ปุ่มลิงก์ช่อง"
  MANAGE: 'builder_manage', // ปุ่ม "📋 จัดการบล็อก"
  MANAGE_SELECT: 'builder_manage_select', // select menu เลือกบล็อก
  MANAGE_BACK: 'builder_manage_back', // ปุ่มกลับไปแผงควบคุมปกติ
  COLOR: 'builder_color', // ปุ่ม "🎨 เลือกสี"
  COLOR_SELECT: 'builder_color_select', // select menu เลือกสีธีม
  MODAL_COLOR_CUSTOM: 'builder_modal_color_custom',
  INPUT_COLOR_HEX: 'builder_input_color_hex',
  POST: 'builder_post',
  POST_CHANNEL_SELECT: 'builder_post_channel_select', // channel select menu สำหรับเลือกช่องปลายทางตอนโพสต์
  MODAL_TEXT: 'builder_modal_text',
  INPUT_TEXT: 'builder_input_text',
  MODAL_IMAGE: 'builder_modal_image',
  INPUT_IMAGE_URLS: 'builder_input_image_urls', // ช่องหลายบรรทัด ใช้ทั้งตอนเพิ่ม/แก้ไข/แทรกรูป (1 บรรทัด = 1 ลิงก์)
  MODAL_SECTION: 'builder_modal_section',
  INPUT_SECTION_TEXT: 'builder_input_section_text',
  INPUT_SECTION_THUMBNAIL: 'builder_input_section_thumbnail',
  MODAL_SECTION_BUTTON: 'builder_modal_section_button',
  INPUT_SECTION_BUTTON_TEXT: 'builder_input_section_button_text',
  INPUT_SECTION_BUTTON_LABEL: 'builder_input_section_button_label',
  INPUT_SECTION_BUTTON_URL: 'builder_input_section_button_url',
  MODAL_SECTION_ROLE: 'builder_modal_section_role', // modal ขั้นที่ 1 ของปุ่มยศ (ข้อความ + ป้ายปุ่ม)
  INPUT_SECTION_ROLE_TEXT: 'builder_input_section_role_text',
  INPUT_SECTION_ROLE_LABEL: 'builder_input_section_role_label',
  INPUT_SECTION_ROLE_EMOJI: 'builder_input_section_role_emoji', // optional — อิโมจิบนปุ่ม (:ชื่อ: หรือ unicode)
  ROLE_SELECT: 'builder_role_select', // select menu ขั้นที่ 2 ของปุ่มยศ (เลือกยศ)
  MODAL_SECTION_CHANNEL: 'builder_modal_section_channel', // modal ขั้นที่ 1 ของปุ่มลิงก์ช่อง (ข้อความ + ป้ายปุ่ม)
  INPUT_SECTION_CHANNEL_TEXT: 'builder_input_section_channel_text',
  INPUT_SECTION_CHANNEL_LABEL: 'builder_input_section_channel_label',
  CHANNEL_SELECT: 'builder_channel_select', // channel select menu ขั้นที่ 2 ของปุ่มลิงก์ช่อง (เลือกช่อง)
  // ระบบ named draft
  LIST_SELECT: 'builder_list_select',         // select menu เลือก draft จาก /builder list
  LIST_SEARCH: 'builder_list_search',         // ปุ่ม 🔍 ค้นหา
  LIST_RESET: 'builder_list_reset',           // ปุ่ม ← รีเซ็ต (ยกเลิกการค้นหา)
  MODAL_LIST_SEARCH: 'builder_modal_list_search',  // modal ใส่คำค้นหา
  INPUT_LIST_SEARCH: 'builder_input_list_search',  // text input ในนั้น
  DELETE_CONFIRM: 'builder_delete_confirm',   // ยืนยันลบ
  DELETE_CANCEL: 'builder_delete_cancel',     // ยกเลิกลบ
  // simple panel (free tier)
  SIMPLE_EDIT_BASIC: 'builder_simple_edit_basic',
  SIMPLE_EDIT_MAIN_IMAGE: 'builder_simple_edit_main_image',
  SIMPLE_EDIT_THUMBNAIL: 'builder_simple_edit_thumbnail',
  SIMPLE_POST: 'builder_simple_post',
};

// ปุ่ม "แก้ไข"/"ลบ" ต้องรู้ว่ากำลังจัดการ block ตำแหน่งไหน เลยฝัง index ต่อท้าย customId เลย
// เช่น "builder_manage_edit_2" = แก้ไข block ตำแหน่งที่ 2
// ใช้ prefix พวกนี้ในการเช็คว่า customId ขึ้นต้นด้วยอะไร แล้วค่อยตัด index ออกมาทีหลัง
const MANAGE_EDIT_PREFIX = 'builder_manage_edit_';
const MANAGE_DELETE_PREFIX = 'builder_manage_delete_';
const MOVE_UP_PREFIX = 'builder_manage_moveup_';
const MOVE_DOWN_PREFIX = 'builder_manage_movedown_';
const MODAL_EDIT_TEXT_PREFIX = 'builder_modal_edit_text_';
const MODAL_EDIT_IMAGE_PREFIX = 'builder_modal_edit_image_';
const MODAL_EDIT_SECTION_PREFIX = 'builder_modal_edit_section_';
// ตั้งชื่อ prefix นี้ไม่ให้ขึ้นต้นด้วย MODAL_EDIT_SECTION_PREFIX (กันชนกันตอนเช็คด้วย .startsWith())
const MODAL_EDIT_SECTION_BUTTON_PREFIX = 'builder_modal_editsecbtn_';

// ปุ่ม "+ แทรกบล็อกใหม่หลังจากนี้" บนหน้าจอเลือกการกระทำ — customId มี index ของบล็อกที่เลือกไว้ฝังท้าย
const INSERT_PREFIX = 'builder_manage_insert_';
// ปุ่มเลือกชนิดบล็อกที่จะแทรก (บนหน้าจอที่เปิดมาหลังกด INSERT_PREFIX) — customId มี "ตำแหน่งที่จะแทรก" ฝังท้าย
// (ตำแหน่งที่จะแทรก = index ของบล็อกที่เลือกไว้ + 1 คำนวณไว้ล่วงหน้าตอนเปิดหน้าจอนี้)
const INSERT_TEXT_PREFIX = 'builder_insert_text_';
const INSERT_IMAGE_PREFIX = 'builder_insert_image_';
const INSERT_SEPARATOR_PREFIX = 'builder_insert_separator_';
const INSERT_SECTION_PREFIX = 'builder_insert_section_'; // ปุ่ม "+ เพิ่ม Section" บนหน้าจอเลือกชนิดบล็อก (เปิดหน้าจอย่อยต่อ)
// ตั้งชื่อ prefix สองอันนี้ไม่ให้ขึ้นต้นด้วย INSERT_SECTION_PREFIX ข้างบน (กันชนกันตอนเช็คด้วย .startsWith())
const INSERT_SECTION_THUMBNAIL_PREFIX = 'builder_insertsec_thumb_';
const INSERT_SECTION_BUTTON_PREFIX = 'builder_insertsec_btn_';
const INSERT_SECTION_ROLE_PREFIX = 'builder_insertsec_role_'; // ปุ่มเลือก "🎭 ปุ่มยศ" ในโหมดแทรก
const INSERT_SECTION_CHANNEL_PREFIX = 'builder_insertsec_chan_'; // ปุ่มเลือก "📢 ปุ่มลิงก์ช่อง" ในโหมดแทรก
const MODAL_INSERT_TEXT_PREFIX = 'builder_modal_insert_text_';
const MODAL_INSERT_IMAGE_PREFIX = 'builder_modal_insert_image_';
const MODAL_INSERT_SECTION_PREFIX = 'builder_modal_insert_section_';
const MODAL_INSERT_SECTION_BUTTON_PREFIX = 'builder_modal_insertsecbtn_';
// modal ขั้นที่ 1 ของปุ่มยศ ในโหมดแทรก (มี insertPosition ฝังท้าย)
const MODAL_INSERT_SECTION_ROLE_PREFIX = 'builder_modal_insertsecrl_';
// modal ขั้นที่ 1 ของปุ่มลิงก์ช่อง ในโหมดแก้ไข (มี index ฝังท้าย)
const MODAL_EDIT_SECTION_CHANNEL_PREFIX = 'builder_modal_editsecchan_';
// modal แก้ไขปุ่มยศ (มี index ฝังท้าย) — แก้ได้เฉพาะ text/buttonLabel/buttonEmoji, คง roleId+buttonStyle ไว้
const MODAL_EDIT_SECTION_ROLE_PREFIX = 'builder_modal_editsecrl_';
// modal ขั้นที่ 1 ของปุ่มลิงก์ช่อง ในโหมดแทรก (มี insertPosition ฝังท้าย)
const MODAL_INSERT_SECTION_CHANNEL_PREFIX = 'builder_modal_insertsecchan_';
// ขั้นที่ 3 ของ flow ปุ่มยศ: เลือกสีปุ่ม
// customId รูปแบบ "builder_role_style_Primary" / "builder_role_style_Secondary" ฯลฯ
const ROLE_STYLE_PREFIX = 'builder_role_style_';

// เก็บข้อมูลการลบที่รอ confirm (key ผสม guildId_userId → { guildId, name })
// ล้างทิ้งเมื่อกด ยืนยัน/ยกเลิก หรือ bot restart
//
// 🔑 key = `${guildId}_${userId}` (ไม่ใช่ userId เดี่ยวๆ เหมือนเดิม)
// เหตุผล: ถ้า key เป็น userId เดี่ยวๆ แอดมินคนเดียวกันที่รัน /builder delete
// ค้างไว้ในเซิร์ฟ A (ยังไม่กดยืนยัน) แล้วสลับไปรัน /builder delete ใน
// เซิร์ฟ B ก่อน จะทำให้ pending deletion ของเซิร์ฟ B ไปทับของเซิร์ฟ A ใน
// หน่วยความจำทันที (เพราะ userId เดียวกัน) พอกลับไปกดยืนยันที่ปุ่มค้างของ
// เซิร์ฟ A ระบบจะเผลอลบ builder ผิดตัวของเซิร์ฟ B แทน (cross-guild data
// corruption) — เป็นบัคเงียบ ไม่มี error โผล่ให้เห็นเลย
//
// แก้โดยผูก key กับทั้ง guildId และ userId พร้อมกัน (Discord ID เป็นตัวเลข
// ล้วน ใช้ underscore คั่นได้ปลอดภัย ไม่มีทางชนกัน) แต่ละเซิร์ฟจะมี pending
// deletion แยกกันเด็ดขาด ต่อให้ user คนเดียวกันเปิดพร้อมกันหลายเซิร์ฟก็ไม่ชนกัน
const pendingDeletions = new Map();

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

/**
 * แปลง ISO string เป็น Discord relative timestamp (<t:unix:R>)
 * Discord จะ render เป็น "2 ชั่วโมงที่แล้ว" ฯลฯ ตามภาษา client
 * @param {string} isoString
 */
function toDiscordTimestamp(isoString) {
  const seconds = Math.floor(new Date(isoString).getTime() / 1000);
  return `<t:${seconds}:R>`;
}

/**
 * สร้างแถวปุ่มควบคุมของ /builder (เรียกใช้ซ้ำได้ทุกครั้งที่ต้องโชว์แผงควบคุม)
 * @param {(key: string, replacements?: object) => string} t translator ของภาษาเซิร์ฟนี้
 */
function buildMainPanelComponents(t) {
  // แถว 1: ปุ่มเพิ่ม block ทุกชนิด
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.ADD_TEXT)
      .setLabel(t('builder.panel.button.add_text'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(IDS.ADD_IMAGE)
      .setLabel(t('builder.panel.button.add_image'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(IDS.ADD_SECTION)
      .setLabel(t('builder.panel.button.add_section'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(IDS.ADD_SEPARATOR)
      .setLabel(t('builder.panel.button.add_separator'))
      .setStyle(ButtonStyle.Secondary)
  );

  // แถว 2: ปุ่มจัดการ/ตั้งค่า/โพสต์
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.MANAGE)
      .setLabel(t('builder.panel.button.manage'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.COLOR)
      .setLabel(t('builder.panel.button.color'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.POST)
      .setLabel(t('builder.panel.button.post'))
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
}

/**
 * สรุป block หนึ่งอันให้เป็นข้อความสั้นๆ สำหรับโชว์ใน select menu
 * คืนค่า { typeLabel, preview } เช่น { typeLabel: 'ข้อความ', preview: '# หัวข้อทดสอบ' }
 * @param {object} block
 * @param {(key: string, replacements?: object) => string} [t] translator ของภาษาเซิร์ฟนี้
 *   ⚠️ ตั้งแต่ sub-phase 3b จุดเรียกทั้งหมดในไฟล์ (buildManageSelectPayload, buildBlockActionPayload)
 *   ส่ง t มาครบแล้ว — default เป็นเซฟตี้เน็ตเฉยๆ เผื่อมีจุดเรียกใหม่ในอนาคตที่ลืมส่ง t มา จะได้ไม่พัง
 *   default เป็น 'en' ให้ตรงกับทิศทาง fallback ของทั้งระบบที่สลับเป็นอังกฤษแล้วตั้งแต่ Phase 1
 *   (ไม่ใช่ 'th' เหมือนตอนแรกที่เขียนไว้ผิด — จุดนั้นเป็นบั๊กตกค้าง แก้แล้ว)
 */
function describeBlock(block, t = createTranslator('en')) {
  switch (block.type) {
    case 'text': {
      const firstLine = block.content.split('\n')[0] || t('builder.block_type.empty_content');
      return { typeLabel: t('builder.block_type.text'), preview: firstLine };
    }
    case 'gallery': {
      const count = block.items.length;
      // 🩹 บั๊กที่เจอจากการใช้งานจริง: เดิมเช็คแค่ count === 1 แล้วปล่อยให้ count อื่นๆ
      // (รวมถึง 0) ตกไปอ่าน block.items[0].url ตรงๆ — พอ gallery ยังไม่มีรูปเลย
      // (items: []) block.items[0] จะเป็น undefined แล้วอ่าน .url ต่อทันที ทำให้ crash
      // ทันทีด้วย TypeError ต้องเช็ค count === 0 แยกออกมาก่อน แล้ว fallback ไปใช้
      // t('builder.block_type.empty_content') ตัวเดียวกับที่ case 'text'/'section' ใช้
      // (สื่อความหมายตรงกันว่า "บล็อกนี้ยังไม่มีเนื้อหา" ไม่ว่าจะเป็น text ว่างหรือ gallery ว่าง)
      if (count === 0) {
        return { typeLabel: t('builder.block_type.gallery'), preview: t('builder.block_type.empty_content') };
      }
      if (count === 1) {
        const item = block.items[0];
        return { typeLabel: t('builder.block_type.gallery'), preview: item.description || item.url };
      }
      return {
        typeLabel: t('builder.block_type.gallery'),
        preview: t('builder.describe.gallery_multi', { count, url: block.items[0].url }),
      };
    }
    case 'separator': {
      const spacingKey = block.spacing === 'large' ? 'builder.spacing.large' : 'builder.spacing.small';
      return {
        typeLabel: t('builder.block_type.separator'),
        preview: t('builder.describe.separator_spacing', { spacing: t(spacingKey) }),
      };
    }
    case 'section': {
      const firstLine = block.text.split('\n')[0] || t('builder.block_type.empty_content');
      return { typeLabel: t('builder.block_type.section'), preview: firstLine };
    }
    case 'section_button': {
      const firstLine = block.text.split('\n')[0] || t('builder.block_type.empty_content');
      return { typeLabel: t('builder.block_type.section_button'), preview: `${firstLine} (${block.buttonLabel})` };
    }
    case 'section_role_button': {
      const firstLine = block.text.split('\n')[0] || t('builder.block_type.empty_content');
      return { typeLabel: t('builder.block_type.section_role_button'), preview: `${firstLine} (${block.buttonLabel})` };
    }
    case 'section_channel_button': {
      const firstLine = block.text.split('\n')[0] || t('builder.block_type.empty_content');
      return { typeLabel: t('builder.block_type.section_channel_button'), preview: `${firstLine} (${block.buttonLabel})` };
    }
    default:
      // ป้องกันไม่ให้คืน preview เป็น '' ซึ่ง StringSelectMenuBuilder จะปฏิเสธ
      // (Discord ต้องการ description ที่มีความยาว >= 1 หรือไม่มี field นั้นเลย)
      return { typeLabel: block.type, preview: t('builder.block_type.no_data') };
  }
}

/**
 * ประกอบ "แผงควบคุม" ทั้งก้อน = ตัวอย่าง Layout ปัจจุบัน (ถ้ามี) + แถวปุ่มควบคุม
 * ทั้งหมดอยู่ในข้อความเดียวแบบ Components V2 เพื่อให้เห็นผลลัพธ์ real-time ทุกครั้งที่กดปุ่ม
 */
function buildPanelComponents(userId, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const draft = getDraft(guildId, userId);
  const session = getActiveSession(guildId, userId); // ใช้แสดงชื่อ draft ใน header
  const components = [];

  // header แสดงชื่อ draft ถ้ามี active session
  const draftLabel = session ? ` — **"${session.name}"**` : '';

  // 🩹 กรองบล็อกที่ยังกรอกไม่ครบออกก่อนเสมอ (เหมือนที่ buildSimplePanel ทำ) — กันเคส
  // builder ตัวนี้ถูกสร้างไว้ตอนยังฟรี (มี gallery ว่างเปล่าค้างจาก createFreeTierBlocks())
  // แล้วเซิร์ฟเพิ่งอัปเกรดเป็นพรีเมี่ยมทีหลัง พอมาเปิด /builder edit ตัวเดิม ถ้าส่ง draft
  // ดิบๆ (ที่มี gallery ว่างเปล่าติดมาด้วย) เข้า buildMessageFromSchema() ตรงๆ จะ throw
  // ทันทีเพราะ engine กลางเข้มงวด (gallery ต้องมี items อย่างน้อย 1)
  const previewableDraft = buildPreviewableDraft(draft);

  if (previewableDraft.blocks.length === 0) {
    // ไม่มีบล็อกที่พร้อมโชว์เลย ไม่ว่าจะเป็น draft ว่างจริงๆ หรือมีบล็อกอยู่แต่กรอก
    // ไม่ครบทั้งหมด (เช่นเคสข้างบน) — โชว์ข้อความบอกสถานะแทนตัวอย่าง เหมือนเดิมทุกประการ
    components.push(
      new TextDisplayBuilder().setContent(
        `**${t('builder.panel.header')}${draftLabel}**\n${t('builder.panel.empty_state')}`
      )
    );
  } else {
    // มีบล็อกที่พร้อมโชว์แล้ว ใช้ buildMessageFromSchema() ตัวเดียวกับที่ใช้ตอนโพสต์จริง
    // มาประกอบเป็นตัวอย่าง — ห่อด้วย try/catch กันเหนียว (pattern เดียวกับ buildSimplePanel)
    // เผื่อกรณีคาดไม่ถึงอื่นๆ ที่ buildPreviewableDraft() กรองไม่ครอบคลุม จะได้ไม่ throw
    // จนคำสั่งทั้งก้อนพัง แค่ fallback ไปโชว์ header เฉยๆ แทน
    try {
      const preview = buildMessageFromSchema(previewableDraft);
      components.push(...preview.components);
    } catch {
      components.push(
        new TextDisplayBuilder().setContent(`**${t('builder.panel.header')}${draftLabel}**`)
      );
    }
  }

  components.push(...buildMainPanelComponents(t));

  return components;
}

/**
 * สร้าง payload เต็มสำหรับ reply/update แผงควบคุม ใช้ร่วมกันทุกจุดที่ต้องโชว์แผงควบคุม
 */
function buildPanelPayload(userId, guildId) {
  return {
    components: buildPanelComponents(userId, guildId),
    // ต้องรวม flag IsComponentsV2 ไว้เสมอ เพราะข้อความนี้ใช้ TextDisplay/Container แทน content ธรรมดา
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/** สร้าง id ใหม่สำหรับ block ฝั่งฟรี — unique ด้วย timestamp + random
 * (pattern เดียวกับ welcome-setup.js/goodbye-setup.js — ฝั่ง premium ของไฟล์นี้ยังคง
 * จัดการบล็อกด้วย index ในอาเรย์เหมือนเดิมทุกประการ ไม่ยุ่งกับ id เลย)
 */
function generateBlockId() {
  return `blk_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

/**
 * สร้างโครง blocks เริ่มต้นสำหรับ builder ระดับฟรี (text + gallery ว่างๆ)
 * เริ่มเป็น type "text" (ไม่ใช่ "section") เพื่อไม่บังคับให้ต้องมี thumbnail
 * ตั้งแต่แรก — พอผู้ใช้ตั้ง thumbnail ทีหลัง handler จะ "อัปเกรด" บล็อกนี้เป็น
 * "section" ให้เอง (ดู builder_modal_simple_thumbnail)
 */
function createFreeTierBlocks() {
  return [
    { id: generateBlockId(), type: 'text', content: '' },
    { id: generateBlockId(), type: 'gallery', items: [] },
  ];
}

/**
 * เช็คว่าข้อความมีการ mention คน/ยศ/ช่อง/@everyone/@here อยู่ไหม
 * ใช้เฉพาะ builder free-tier (title/description) เท่านั้น เพราะ
 * ฟรีไม่ควรใช้ mention ได้ (สงวนไว้ให้ premium — ป้องกันการเอาไป
 * ใช้แทน role-setup/ประกาศแบบเต็มรูปแบบทั้งที่จ่ายแค่ค่าฟรี)
 * @param {string} text
 * @returns {boolean}
 */
function containsMention(text) {
  if (!text) return false;
  // <@id> <@!id> = user, <@&id> = role, <#id> = channel, @everyone, @here
  return /<@[!&]?\d+>|<#\d+>|@everyone|@here/.test(text);
}

/**
 * กรองบล็อกที่ยังกรอกไม่ครบออกก่อนส่งเข้า buildMessageFromSchema()
 * เพราะ engine กลางเข้มงวดมาก (gallery ต้องมี items อย่างน้อย 1,
 * section ต้องมีทั้ง text+thumbnail) ถ้าส่ง draft ดิบๆ ที่ยังกรอก
 * ไม่ครบเข้าไปจะ throw ทันที ทำให้ preview ไม่ขึ้นเลยจนกว่าจะกรอก
 * ครบทุกอย่าง — ฟังก์ชันนี้ตัดบล็อกที่ยังไม่พร้อมออกไปก่อน ให้เห็น
 * preview บางส่วนได้ระหว่างกรอกทีละขั้น
 */
function buildPreviewableDraft(draft) {
  const validBlocks = draft.blocks.filter(b => {
    if (b.type === 'gallery') return Array.isArray(b.items) && b.items.length > 0;
    if (b.type === 'section') return !!b.text && !!b.thumbnail;
    if (b.type === 'text')    return !!b.content;
    return true;
  });
  return { ...draft, blocks: validBlocks };
}

/**
 * แผงควบคุมแบบง่ายสำหรับ builder ระดับฟรี — ฝัง live preview ไว้ในข้อความเดียวกันเลย
 * (เหมือน main panel ฝั่ง premium) แทนที่จะโชว์แค่สรุปหัวข้อ/ส่งข้อความ preview แยก
 */
function buildSimplePanel(userId, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  let draft = getDraft(guildId, userId);
  const session = getActiveSession(guildId, userId); // ใช้โชว์ชื่อ builder ที่กำลังแก้อยู่ (pattern เดียวกับแผงพรีเมี่ยม buildPanelComponents)

  // 🩹 Self-healing: ถ้า draft ไม่มีบล็อกข้อมูล/รูปเลย (เช่น เป็น
  // draft เก่าที่สร้างไว้ก่อนมีระบบ skeleton) ให้เติมให้ตอนนี้เลย
  const hasInfoBlock = draft.blocks.some(b => b.type === 'text' || b.type === 'section');
  const hasGalleryBlock = draft.blocks.some(b => b.type === 'gallery');
  if (!hasInfoBlock || !hasGalleryBlock) {
    if (!hasInfoBlock)    addBlock(guildId, userId, { id: generateBlockId(), type: 'text', content: '' });
    if (!hasGalleryBlock) addBlock(guildId, userId, { id: generateBlockId(), type: 'gallery', items: [] });
    draft = getDraft(guildId, userId); // โหลดใหม่หลังเติมแล้ว
  }

  const components = [];

  // header แสดงชื่อ builder ถ้ามี active session (เหมือน buildPanelComponents ฝั่งพรีเมี่ยม)
  // โชว์ไว้บนสุดเสมอ ไม่ว่าจะมี preview หรือยัง — กันงงเวลามีหลาย builder ในเซิร์ฟเดียวกัน
  const draftLabel = session ? ` — **"${session.name}"**` : '';
  components.push(new TextDisplayBuilder().setContent(`**${t('builder.panel.header')}${draftLabel}**`));

  const previewableDraft = buildPreviewableDraft(draft); // ใช้ตัวเดิมจากรอบก่อน
  if (previewableDraft.blocks.length > 0) {
    try {
      const preview = buildMessageFromSchema(previewableDraft);
      components.push(...preview.components); // ← ฝังตรงนี้เลย เหมือน premium panel
    } catch {
      components.push(new TextDisplayBuilder().setContent(t('builder.simple.default_title')));
    }
  } else {
    components.push(new TextDisplayBuilder().setContent(t('builder.simple.default_title')));
  }

  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(IDS.SIMPLE_EDIT_BASIC).setLabel(t('builder.simple.button.edit_basic')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(IDS.SIMPLE_EDIT_MAIN_IMAGE).setLabel(t('builder.simple.button.edit_main_image')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(IDS.SIMPLE_EDIT_THUMBNAIL).setLabel(t('builder.simple.button.edit_thumbnail')).setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(IDS.SIMPLE_POST).setLabel(t('builder.simple.button.post')).setStyle(ButtonStyle.Success),
    ),
  );

  return { components, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

/**
 * เช็คว่า draft นี้มีเนื้อหาเกินความสามารถของแผงฟรี (simple panel) ไหม
 * แผงฟรีรองรับแค่โครงสร้าง "2 บล็อกพื้นฐาน" เท่านั้น: บล็อกแรกเป็น
 * text หรือ section (section เกิดได้จากฝั่งฟรีเองตอนใส่ thumbnail
 * ผ่านปุ่ม "แก้ thumbnail" — ไม่ใช่ของพรีเมี่ยมอย่างเดียว ต้องนับเป็น
 * เนื้อหาปกติของฟรีด้วย) + บล็อกที่สองเป็น gallery เท่านั้น
 * ถ้าโครงสร้างไม่ตรงแบบนี้ (บล็อกไม่ครบ 2, มี section_button,
 * section_role_button, section_channel_button ฯลฯ ปนมา) แปลว่าถูก
 * สร้าง/แก้ไว้ตอนยังเป็นพรีเมี่ยม ต้องกันไม่ให้แผงฟรีแตะเลย
 *
 * @param {{ blocks: object[] }} draft
 * @returns {boolean}
 */
function draftNeedsPremiumPanel(draft) {
  const blocks = draft?.blocks ?? [];
  if (blocks.length !== 2) return true;
  const [first, second] = blocks;
  const firstOk  = first?.type === 'text' || first?.type === 'section';
  const secondOk = second?.type === 'gallery';
  return !(firstOk && secondOk);
}

/**
 * ตัดสินใจว่าจะโชว์ panel แบบไหนให้ user คนนี้ — รวม logic 3 ทาง
 * (พรีเมี่ยม / ฟรีปกติ / ฟรีแต่เนื้อหาเกินความสามารถ) ไว้จุดเดียว
 *
 * ⚠️ ห้ามเช็ค isPremiumGuild() แล้วเลือก buildPanelPayload/buildSimplePanel
 * กันเองตรงจุดเรียกแทนนะครับ — ให้เรียกฟังก์ชันนี้เสมอ กันบั๊กแบบที่เจอมา
 * (มีจุดเช็คซ้ำกันหลายที่ในไฟล์นี้ แล้วพลาดแก้ไม่ครบตอนต้องอัปเดต logic)
 *
 * @param {string} userId
 * @param {string} guildId
 * @param {(key: string, params?: object) => string} t
 */
function resolveBuilderPanelPayload(userId, guildId, t) {
  if (isPremiumGuild(guildId)) {
    return buildPanelPayload(userId, guildId);
  }
  const draft = getDraft(guildId, userId);
  if (draftNeedsPremiumPanel(draft)) {
    return {
      components: [
        new TextDisplayBuilder().setContent(
          buildUpgradeMessage(t, t('builder.premium_content_reason'))
        ),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    };
  }
  return buildSimplePanel(userId, guildId);
}

/**
 * สร้างหน้าจอ "เลือกบล็อกที่จะจัดการ" (select menu) แสดงเมื่อกด 📋 จัดการบล็อก
 */
function buildManageSelectPayload(userId, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const draft = getDraft(guildId, userId);

  // select menu ของ Discord ใส่ตัวเลือกได้สูงสุด 25 อัน ถ้า block เกินนี้ ตัดให้เหลือ 25 อันแรกไปก่อน
  const blocksToShow = draft.blocks.slice(0, 25);

  const options = blocksToShow.map((block, index) => {
    const { typeLabel, preview } = describeBlock(block, t);
    const desc = preview.slice(0, 100);
    return {
      label: t('builder.manage.option_label', { index: index + 1, type: typeLabel }).slice(0, 100),
      // ใส่ description เฉพาะตอนที่มีค่าจริงเท่านั้น
      // Discord ไม่ยอมรับ description เป็น string ว่าง ('') ต้องการ length >= 1 หรือไม่มี field นั้นเลย
      ...(desc.length > 0 ? { description: desc } : {}),
      value: String(index),
    };
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(IDS.MANAGE_SELECT)
    .setPlaceholder(t('builder.manage.placeholder'))
    .addOptions(options);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel(t('builder.manage.back_button'))
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(t('builder.manage.header')),
      new ActionRowBuilder().addComponents(selectMenu),
      new ActionRowBuilder().addComponents(backButton),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้างหน้าจอ "เลือกการกระทำ" (แก้ไข/ลบ/แทรก/ย้าย) หลังจากเลือก block จาก select menu แล้ว
 * @param {number} index
 * @param {object} block
 * @param {number} totalBlocks - จำนวน block ทั้งหมดใน draft ตอนนี้ (ใช้เช็คว่าควร disable ปุ่มย้ายขึ้น/ลงไหม)
 * @param {string} guildId
 */
function buildBlockActionPayload(index, block, totalBlocks, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const { typeLabel, preview } = describeBlock(block, t);

  const editButton = new ButtonBuilder()
    .setCustomId(`${MANAGE_EDIT_PREFIX}${index}`)
    .setLabel(t('builder.block_action.button.edit'))
    .setStyle(ButtonStyle.Primary);

  const deleteButton = new ButtonBuilder()
    .setCustomId(`${MANAGE_DELETE_PREFIX}${index}`)
    .setLabel(t('builder.block_action.button.delete'))
    .setStyle(ButtonStyle.Danger);

  const insertButton = new ButtonBuilder()
    .setCustomId(`${INSERT_PREFIX}${index}`)
    .setLabel(t('builder.block_action.button.insert'))
    .setStyle(ButtonStyle.Secondary);

  const moveUpButton = new ButtonBuilder()
    .setCustomId(`${MOVE_UP_PREFIX}${index}`)
    .setLabel(t('builder.block_action.button.move_up'))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index === 0); // อยู่บนสุดแล้ว ย้ายขึ้นต่อไม่ได้

  const moveDownButton = new ButtonBuilder()
    .setCustomId(`${MOVE_DOWN_PREFIX}${index}`)
    .setLabel(t('builder.block_action.button.move_down'))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index === totalBlocks - 1); // อยู่ล่างสุดแล้ว ย้ายลงต่อไม่ได้

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel(t('builder.manage.back_button'))
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(
        t('builder.block_action.header', { index: index + 1, typeLabel, preview })
      ),
      new ActionRowBuilder().addComponents(editButton, deleteButton, insertButton),
      new ActionRowBuilder().addComponents(moveUpButton, moveDownButton, backButton),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้างหน้าจอ "เลือกชนิดบล็อกที่จะแทรก" แสดงเมื่อกด "+ แทรกบล็อกใหม่หลังจากนี้"
 * @param {number} insertPosition - ตำแหน่งที่บล็อกใหม่จะถูกแทรกเข้าไป (index ของบล็อกที่เลือกไว้ + 1)
 * @param {string} guildId
 */
function buildInsertTypePayload(insertPosition, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));

  const textButton = new ButtonBuilder()
    .setCustomId(`${INSERT_TEXT_PREFIX}${insertPosition}`)
    .setLabel(t('builder.panel.button.add_text'))
    .setStyle(ButtonStyle.Primary);

  const imageButton = new ButtonBuilder()
    .setCustomId(`${INSERT_IMAGE_PREFIX}${insertPosition}`)
    .setLabel(t('builder.panel.button.add_image'))
    .setStyle(ButtonStyle.Primary);

  const sectionButton = new ButtonBuilder()
    .setCustomId(`${INSERT_SECTION_PREFIX}${insertPosition}`)
    .setLabel(t('builder.panel.button.add_section'))
    .setStyle(ButtonStyle.Primary);

  const separatorButton = new ButtonBuilder()
    .setCustomId(`${INSERT_SEPARATOR_PREFIX}${insertPosition}`)
    .setLabel(t('builder.panel.button.add_separator'))
    .setStyle(ButtonStyle.Secondary);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel(t('builder.manage.back_button'))
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(
        t('builder.insert_type.header', { position: insertPosition + 1 })
      ),
      new ActionRowBuilder().addComponents(textButton, imageButton, sectionButton, separatorButton),
      new ActionRowBuilder().addComponents(backButton),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

// สีธีมสำเร็จรูปที่เลือกได้ — แต่ละอันมี label (ที่เห็นใน select menu) กับ hex จริงที่จะบันทึก
const PRESET_COLORS = [
  { label: '🌿 Sage Green', hex: '#9CAF88' },
  { label: '🤍 Ivory Cream', hex: '#FFF8E7' },
  { label: '🌸 Soft Pink', hex: '#FADADD' },
  { label: '🌤️ Sky Blue', hex: '#87CEEB' },
  { label: '💜 Lavender', hex: '#C3B1E1' },
];
const CUSTOM_COLOR_VALUE = 'custom'; // ค่าพิเศษของตัวเลือก "กำหนดเอง" ใน select menu (ไม่ใช่ hex)

/**
 * สร้างหน้าจอ "เลือกสีธีม" แสดงเมื่อกด "🎨 เลือกสี"
 * @param {string} guildId
 */
function buildColorSelectPayload(guildId) {
  const t = createTranslator(getGuildLanguage(guildId));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(IDS.COLOR_SELECT)
    .setPlaceholder(t('builder.color.placeholder'))
    .addOptions(
      ...PRESET_COLORS.map((color) => ({
        label: color.label,
        value: color.hex,
        description: color.hex,
      })),
      {
        label: t('builder.color.custom_label'),
        value: CUSTOM_COLOR_VALUE,
        description: t('builder.color.custom_description'),
      }
    );

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel(t('builder.manage.back_button'))
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(t('builder.color.header')),
      new ActionRowBuilder().addComponents(selectMenu),
      new ActionRowBuilder().addComponents(backButton),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้าง modal สำหรับ "ข้อความคู่รูปเล็ก" (section) ใช้ร่วมกันทั้งตอนเพิ่ม/แก้ไข/แทรก
 * ต่างกันแค่ customId, title, และค่า pre-fill (prefill ใส่เฉพาะตอนแก้ไขเท่านั้น)
 * @param {string} customId
 * @param {string} title
 * @param {{ text?: string, thumbnail?: string }} prefill
 * @param {(key: string, replacements?: object) => string} t
 */
function buildSectionModal(customId, title, prefill = {}, t) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const textInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_TEXT)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(t('builder.modal.section_text_placeholder'))
    .setRequired(true)
    .setMaxLength(4000);
  if (prefill.text) textInput.setValue(prefill.text);

  const textLabel = new LabelBuilder()
    .setLabel(t('builder.modal.section_text_label'))
    .setTextInputComponent(textInput);

  const thumbnailInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_THUMBNAIL)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://example.com/thumbnail.png')
    .setRequired(true)
    .setMaxLength(500);
  if (prefill.thumbnail) thumbnailInput.setValue(prefill.thumbnail);

  const thumbnailLabel = new LabelBuilder()
    .setLabel(t('builder.modal.thumbnail_label'))
    .setDescription(t('builder.modal.image_url_hint'))
    .setTextInputComponent(thumbnailInput);

  modal.addLabelComponents(textLabel, thumbnailLabel);
  return modal;
}

/**
 * สร้างหน้าจอย่อย "เลือกว่า Section นี้จะคู่กับอะไร" (รูปเล็ก / ปุ่มลิงก์ / ปุ่มยศ)
 * ใช้ร่วมกันทั้งตอนกด "+ เพิ่ม Section" จากแผงควบคุมหลัก และตอนแทรกบล็อกใหม่
 * @param {string} thumbnailCustomId - customId ของปุ่ม "🖼️ รูปเล็ก"
 * @param {string} buttonCustomId - customId ของปุ่ม "🔘 ปุ่มลิงก์"
 * @param {string} roleCustomId - customId ของปุ่ม "🎭 ปุ่มยศ"
 * @param {string} channelCustomId
 * @param {(key: string, replacements?: object) => string} t
 */
function buildSectionChoicePayload(thumbnailCustomId, buttonCustomId, roleCustomId, channelCustomId, t) {
  const thumbnailButton = new ButtonBuilder()
    .setCustomId(thumbnailCustomId)
    .setLabel(t('builder.section_choice.button.thumbnail'))
    .setStyle(ButtonStyle.Primary);

  const buttonButton = new ButtonBuilder()
    .setCustomId(buttonCustomId)
    .setLabel(t('builder.section_choice.button.link'))
    .setStyle(ButtonStyle.Primary);

  const roleButton = new ButtonBuilder()
    .setCustomId(roleCustomId)
    .setLabel(t('builder.section_choice.button.role'))
    .setStyle(ButtonStyle.Primary);

  const channelButton = new ButtonBuilder()
    .setCustomId(channelCustomId)
    .setLabel(t('builder.section_choice.button.channel'))
    .setStyle(ButtonStyle.Primary);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel(t('builder.manage.back_button'))
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(t('builder.section_choice.header')),
      new ActionRowBuilder().addComponents(thumbnailButton, buttonButton, roleButton, channelButton),
      new ActionRowBuilder().addComponents(backButton),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้าง modal สำหรับ "ปุ่มลิงก์ช่อง" (section_channel_button) ขั้นที่ 1
 * รับแค่ข้อความและป้ายปุ่ม ไม่มีช่อง URL เพราะ URL จะ generate จากช่องที่เลือกในขั้นที่ 2
 * @param {string} customId
 * @param {string} title
 * @param {{ text?: string, buttonLabel?: string }} prefill - ค่าเดิมสำหรับตอนแก้ไข
 * @param {(key: string, replacements?: object) => string} t
 */
function buildSectionChannelModal(customId, title, prefill = {}, t) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const textInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_CHANNEL_TEXT)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(t('builder.modal.section_text_placeholder'))
    .setRequired(true)
    .setMaxLength(4000);
  if (prefill.text) textInput.setValue(prefill.text);

  const textLabel = new LabelBuilder()
    .setLabel(t('builder.modal.section_text_label'))
    .setTextInputComponent(textInput);

  const labelInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_CHANNEL_LABEL)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(t('builder.modal.channel_button_placeholder'))
    .setRequired(true)
    .setMaxLength(80);
  if (prefill.buttonLabel) labelInput.setValue(prefill.buttonLabel);

  const labelLabel = new LabelBuilder()
    .setLabel(t('builder.modal.button_label_label'))
    .setTextInputComponent(labelInput);

  modal.addLabelComponents(textLabel, labelLabel);
  return modal;
}

/**
 * สร้างหน้าจอ "เลือกช่อง" (ขั้นที่ 2 ของ flow ปุ่มลิงก์ช่อง)
 * แสดง ChannelSelectMenuBuilder ที่ filter เฉพาะ text/announcement channel เท่านั้น
 * (เพราะช่องประเภทอื่น เช่น voice/forum ลิงก์แบบนี้ไม่สมเหตุสมผล)
 * @param {(key: string, replacements?: object) => string} t
 */
function buildChannelSelectPayload(t) {
  const selectMenu = new ChannelSelectMenuBuilder()
    .setCustomId(IDS.CHANNEL_SELECT)
    .setPlaceholder(t('builder.channel_select.placeholder'))
    // filter เฉพาะ text channel (0) และ announcement channel (5)
    // ChannelType.GuildText = 0, ChannelType.GuildAnnouncement = 5
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel(t('builder.common.back_cancel_button'))
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(t('builder.channel_select.header')),
      new ActionRowBuilder().addComponents(selectMenu),
      new ActionRowBuilder().addComponents(backButton),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้าง modal สำหรับ "ข้อความคู่ปุ่มลิงก์" (section_button) ใช้ร่วมกันทั้งตอนเพิ่ม/แก้ไข/แทรก
 * @param {string} customId
 * @param {string} title
 * @param {{ text?: string, buttonLabel?: string, buttonUrl?: string }} prefill
 * @param {(key: string, replacements?: object) => string} t
 */
function buildSectionButtonModal(customId, title, prefill = {}, t) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const textInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_BUTTON_TEXT)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(t('builder.modal.section_text_placeholder'))
    .setRequired(true)
    .setMaxLength(4000);
  if (prefill.text) textInput.setValue(prefill.text);

  const textLabel = new LabelBuilder()
    .setLabel(t('builder.modal.section_text_label'))
    .setTextInputComponent(textInput);

  const buttonLabelInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_BUTTON_LABEL)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(t('builder.modal.link_button_placeholder'))
    .setRequired(true)
    .setMaxLength(80); // ขีดจำกัดของ label ปุ่มฝั่ง Discord
  if (prefill.buttonLabel) buttonLabelInput.setValue(prefill.buttonLabel);

  const buttonLabelLabel = new LabelBuilder()
    .setLabel(t('builder.modal.button_text_label'))
    .setTextInputComponent(buttonLabelInput);

  const buttonUrlInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_BUTTON_URL)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://discord.gg/example')
    .setRequired(true)
    .setMaxLength(500);
  if (prefill.buttonUrl) buttonUrlInput.setValue(prefill.buttonUrl);

  const buttonUrlLabel = new LabelBuilder()
    .setLabel(t('builder.modal.button_url_label'))
    .setTextInputComponent(buttonUrlInput);

  modal.addLabelComponents(textLabel, buttonLabelLabel, buttonUrlLabel);
  return modal;
}

/**
 * สร้าง modal ขั้นที่ 1 ของ "ปุ่มยศ" — รับข้อความ, ป้ายปุ่ม, และอิโมจิ (optional)
 * ยังไม่รับ roleId และสีปุ่มในขั้นนี้ เพราะ SelectMenu ใส่ใน Modal ไม่ได้ และปุ่มเลือกสีต้องเป็นขั้นแยก
 * @param {string} customId
 * @param {string} title
 * @param {{ text?: string, buttonLabel?: string, buttonEmoji?: string }} prefill
 * @param {(key: string, replacements?: object) => string} t
 */
function buildSectionRoleModal(customId, title, prefill = {}, t) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const textInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_ROLE_TEXT)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(t('builder.modal.section_role_text_placeholder'))
    .setRequired(true)
    .setMaxLength(4000);
  if (prefill.text) textInput.setValue(prefill.text);

  const textLabel = new LabelBuilder()
    .setLabel(t('builder.modal.section_text_label'))
    .setTextInputComponent(textInput);

  const labelInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_ROLE_LABEL)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(t('builder.modal.role_button_placeholder'))
    .setRequired(true)
    .setMaxLength(80); // ขีดจำกัด label ปุ่มฝั่ง Discord
  if (prefill.buttonLabel) labelInput.setValue(prefill.buttonLabel);

  const labelLabel = new LabelBuilder()
    .setLabel(t('builder.modal.button_label_label'))
    .setTextInputComponent(labelInput);

  // อิโมจิบนปุ่ม — optional ผู้ใช้ไม่ต้องใส่ก็ได้
  // รับได้ทั้ง unicode emoji (เช่น 🎭) และ custom emoji shortcode (เช่น :mail_1:)
  // :ชื่อ: จะถูกแปลงเป็น <:ชื่อ:id> ก่อนบันทึก ผ่าน resolveCustomEmojis()
  const emojiInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_ROLE_EMOJI)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(t('builder.modal.emoji_placeholder'))
    .setRequired(false)
    .setMaxLength(100);
  if (prefill.buttonEmoji) emojiInput.setValue(prefill.buttonEmoji);

  const emojiLabel = new LabelBuilder()
    .setLabel(t('builder.modal.emoji_label'))
    .setDescription(t('builder.modal.emoji_description'))
    .setTextInputComponent(emojiInput);

  modal.addLabelComponents(textLabel, labelLabel, emojiLabel);
  return modal;
}

/**
 * สร้างหน้าจอ "เลือกยศ" (ขั้นที่ 2 ของ flow ปุ่มยศ)
 * แสดง StringSelectMenu ที่ filter เฉพาะยศที่บอท assign ได้จริง
 * (ต่ำกว่า highest role ของบอท, ไม่ใช่ managed, ไม่ใช่ @everyone)
 *
 * @param {import('discord.js').Guild} guild - ใช้ดึงรายการยศและตำแหน่งบอท
 * @param {(key: string, replacements?: object) => string} t
 * @returns {{ payload: object|null, assignableCount: number }}
 */
function buildRoleSelectPayload(guild, t) {
  const botHighestPosition = guild.members.me.roles.highest.position;

  const assignableRoles = guild.roles.cache
    .filter(role =>
      role.id !== guild.id &&              // ไม่ใช่ @everyone
      role.position < botHighestPosition &&// ต่ำกว่าบอท
      !role.managed                        // ไม่ใช่ managed role
    )
    .sort((a, b) => b.position - a.position) // เรียงจากสูงลงต่ำเหมือน Discord แสดง
    .first(25); // StringSelectMenu รองรับสูงสุด 25 ตัวเลือก

  if (assignableRoles.length === 0) {
    return { payload: null, assignableCount: 0 };
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(IDS.ROLE_SELECT)
    .setPlaceholder(t('builder.role_select.placeholder'))
    .addOptions(
      assignableRoles.map(role => {
        const desc = role.id ? `ID: ${role.id}` : '';
        return {
          label: role.name.slice(0, 100),
          value: role.id,
          // ใส่ description เฉพาะตอนที่มีค่าจริงเท่านั้น
          // Discord ไม่ยอมรับ description เป็น string ว่าง ('') ต้องการ length >= 1 หรือไม่มี field นั้นเลย
          ...(desc.length > 0 ? { description: desc.slice(0, 100) } : {}),
        };
      })
    );

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel(t('builder.common.back_cancel_button'))
    .setStyle(ButtonStyle.Secondary);

  return {
    payload: {
      components: [
        new TextDisplayBuilder().setContent(t('builder.role_select.header')),
        new ActionRowBuilder().addComponents(selectMenu),
        new ActionRowBuilder().addComponents(backButton),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    },
    assignableCount: assignableRoles.length,
  };
}

/**
 * สร้างหน้าจอ "เลือกสีปุ่ม" (ขั้นที่ 3 ของ flow ปุ่มยศ)
 * แสดง 4 ปุ่ม แต่ละปุ่ม render ด้วยสีของตัวเองจริงๆ ให้ผู้ใช้เห็นหน้าตาก่อนเลือก
 * เมื่อกดปุ่มใดปุ่มหนึ่ง handleButton() จะรับ customId → builder_role_style_{styleName}
 * แล้วสร้าง block พร้อม buttonStyle = styleName
 * @param {(key: string, replacements?: object) => string} t
 */
function buildRoleStylePayload(t) {
  // ปุ่มแต่ละอันใช้ style ของตัวเองในการแสดงผล ผู้ใช้กดอันไหน = เลือกสีนั้น
  // ชื่อ Primary/Secondary/Success/Danger เป็นชื่อ style ของ Discord เอง ไม่ต้องแปล (เหมือน PRESET_COLORS)
  const primaryBtn = new ButtonBuilder()
    .setCustomId(`${ROLE_STYLE_PREFIX}Primary`)
    .setLabel('Primary')
    .setStyle(ButtonStyle.Primary);

  const secondaryBtn = new ButtonBuilder()
    .setCustomId(`${ROLE_STYLE_PREFIX}Secondary`)
    .setLabel('Secondary')
    .setStyle(ButtonStyle.Secondary);

  const successBtn = new ButtonBuilder()
    .setCustomId(`${ROLE_STYLE_PREFIX}Success`)
    .setLabel('Success')
    .setStyle(ButtonStyle.Success);

  const dangerBtn = new ButtonBuilder()
    .setCustomId(`${ROLE_STYLE_PREFIX}Danger`)
    .setLabel('Danger')
    .setStyle(ButtonStyle.Danger);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel(t('builder.common.back_cancel_button'))
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(t('builder.role_style.header')),
      new ActionRowBuilder().addComponents(primaryBtn, secondaryBtn, successBtn, dangerBtn),
      new ActionRowBuilder().addComponents(backButton),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้างหน้าจอ "เลือกช่องปลายทาง" แสดงเมื่อกดปุ่ม "โพสต์"
 * filter เฉพาะ GuildText และ GuildAnnouncement เหมือน buildChannelSelectPayload()
 * @param {(key: string, replacements?: object) => string} t
 */
function buildPostChannelSelectPayload(t) {
  const selectMenu = new ChannelSelectMenuBuilder()
    .setCustomId(IDS.POST_CHANNEL_SELECT)
    .setPlaceholder(t('builder.post.select_placeholder'))
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel(t('builder.post.cancel_button'))
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(t('builder.post.select_header')),
      new ActionRowBuilder().addComponents(selectMenu),
      new ActionRowBuilder().addComponents(backButton),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * แยกข้อความดิบจาก textarea หลายบรรทัด เป็นรายการ url ที่ผ่านการเช็ครูปแบบเรียบร้อยแล้ว
 * ใช้ร่วมกันทั้งตอน "เพิ่มรูป", "แก้ไขรูป", และ "แทรกรูป" (logic เดียวกันเป๊ะ เลยแยกออกมาเป็นฟังก์ชันกลาง)
 * @param {string} rawText - ข้อความดิบจากช่อง textarea (1 บรรทัด = 1 ลิงก์)
 * @param {(key: string, replacements?: object) => string} t
 * @returns {{ ok: true, urls: string[] } | { ok: false, errorContent: string }}
 */
function parseGalleryUrlLines(rawText, t) {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { ok: false, errorContent: t('builder.gallery_error.need_one') };
  }

  // เช็คทุกบรรทัดให้ครบก่อน ถ้ามีอันไหนผิดรูปแบบ ไม่บันทึกอะไรเลยสักบรรทัด (กันข้อมูลครึ่งๆ กลางๆ)
  const invalidLineMessages = [];
  lines.forEach((url, lineIndex) => {
    try {
      validateUrl(url, t('builder.validation.line_label', { n: lineIndex + 1 }), t);
    } catch (error) {
      invalidLineMessages.push(error.message.replace(/^buildMessageFromSchema:\s*/, ''));
    }
  });

  if (invalidLineMessages.length > 0) {
    return {
      ok: false,
      errorContent:
        t('builder.gallery_error.invalid_header') + '\n' +
        invalidLineMessages.map((message) => `• ${message}`).join('\n'),
    };
  }

  return { ok: true, urls: lines };
}

/**
 * สร้าง payload สำหรับ /builder list — แสดงรายชื่อ named draft ในกิลด์
 * ถ้ามี query จะกรองเฉพาะชื่อที่มีคำนั้น (case-insensitive) แล้วอัปเดต header บอกจำนวน
 * @param {string} guildId
 * @param {string|null} query - คำค้นหา (null = แสดงทั้งหมด)
 * @param {(key: string, replacements?: object) => string} t
 * @returns {object} payload พร้อมส่งเข้า interaction.reply() หรือ interaction.update()
 */
function buildListPayload(guildId, query = null, t) {
  const allDrafts = listGuildDrafts(guildId);

  // ─── ไม่มี builder เลย ───
  if (allDrafts.length === 0) {
    return {
      components: [new TextDisplayBuilder().setContent(t('builder.list.empty'))],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    };
  }

  // ─── กรอง (ถ้ามี query) ───
  const normalizedQuery = query?.trim() || null;
  const filtered = normalizedQuery
    ? allDrafts.filter((d) => d.name.toLowerCase().includes(normalizedQuery.toLowerCase()))
    : allDrafts;

  // ─── header ───
  let headerLine;
  if (normalizedQuery) {
    headerLine = t('builder.list.header_filtered', {
      shown: filtered.length,
      total: allDrafts.length,
      query: normalizedQuery,
    });
  } else {
    headerLine = t('builder.list.header_all', { total: allDrafts.length });
  }

  // ─── รายการ ───
  let bodyText;
  if (filtered.length === 0) {
    bodyText = t('builder.list.no_results', { query: normalizedQuery });
  } else {
    const lines = filtered.map((d, i) => {
      const ts = toDiscordTimestamp(d.updatedAt);
      return t('builder.list.entry_line', {
        index: i + 1,
        name: d.name,
        count: d.blockCount,
        timestamp: ts,
        userId: d.updatedBy,
      });
    });
    bodyText = '\n\n' + lines.join('\n');
  }

  const components = [new TextDisplayBuilder().setContent(headerLine + bodyText)];

  // ─── select menu (แสดงเฉพาะตอนมีผลลัพธ์) ───
  if (filtered.length > 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(IDS.LIST_SELECT)
      .setPlaceholder(t('builder.list.select_placeholder'))
      .addOptions(
        filtered.slice(0, 25).map((d) => ({
          label: d.name.slice(0, 100),
          description: t('builder.list.option_description', { count: d.blockCount }).slice(0, 100),
          value: d.name,
        }))
      );
    components.push(new ActionRowBuilder().addComponents(selectMenu));
  }

  // ─── ปุ่ม 🔍 ค้นหา + ← รีเซ็ต (ถ้ากำลังกรองอยู่) ───
  const searchBtn = new ButtonBuilder()
    .setCustomId(IDS.LIST_SEARCH)
    .setLabel(t('builder.list.search_button'))
    .setStyle(ButtonStyle.Secondary);

  const btnRow = new ActionRowBuilder().addComponents(searchBtn);

  if (normalizedQuery) {
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(IDS.LIST_RESET)
        .setLabel(t('builder.list.reset_button'))
        .setStyle(ButtonStyle.Secondary)
    );
  }

  components.push(btnRow);
  components.push(
    new TextDisplayBuilder().setContent(t('builder.list.delete_hint'))
  );

  return {
    components,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * เช็คลิงก์รูปด้วย HEAD request (แบบขนาน ไม่รอทีละอัน) แล้วถ้ามีอันไหนดูน่าสงสัย
 * ส่งข้อความเตือนแบบ ephemeral เพิ่มเติม (ไม่บล็อก ไม่แตะข้อมูลที่บันทึกไปแล้ว)
 * @param {import('discord.js').Interaction} interaction - interaction ที่ตอบกลับไปแล้ว (update/reply เสร็จแล้ว) จะใช้ followUp ส่งคำเตือนต่อ
 * @param {string[]} urls - ลิงก์ทั้งหมดที่เพิ่งบันทึกไป จะเช็คทุกอัน
 */
async function warnIfImagesLookSuspicious(interaction, urls) {
  const results = await Promise.all(urls.map((url) => checkImageUrlLooksValid(url)));
  const suspiciousUrls = urls.filter((url, i) => !results[i]);

  if (suspiciousUrls.length === 0) {
    return; // ทุกลิงก์ดูเป็นรูปจริง ไม่ต้องเตือนอะไร
  }

  const t = createTranslator(getGuildLanguage(interaction.guildId));
  const list = suspiciousUrls.map((url) => `• ${url}`).join('\n');
  await interaction.followUp({
    content: t('builder.image_warning.suspicious', { list }),
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  IDS, // export ไว้ให้ index.js เอาไปเช็ค prefix ของ customId

  data: new SlashCommandBuilder()
    .setName('builder')
    .setDescription('Build custom message layouts')
    .setDescriptionLocalizations({ th: 'สร้างข้อความจัดวางเองได้เลยครับ' })
    .addSubcommand((sub) =>
      sub
        .setName('new')
        .setDescription('Create a new builder')
        .setDescriptionLocalizations({ th: 'สร้าง builder ใหม่ครับ' })
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Builder name (max 50 characters)')
            .setDescriptionLocalizations({ th: 'ชื่อ builder (สูงสุด 50 ตัวอักษรครับ)' })
            .setRequired(true)
            .setMaxLength(50)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Reopen an existing builder')
        .setDescriptionLocalizations({ th: 'เปิด builder เดิมมาแก้ต่อครับ' })
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Builder name')
            .setDescriptionLocalizations({ th: 'ชื่อ builder' })
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list')
        .setDescription('List all builders in this server')
        .setDescriptionLocalizations({ th: 'ดูรายชื่อ builder ทั้งหมดในเซิร์ฟครับ' })
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a builder')
        .setDescriptionLocalizations({ th: 'ลบ builder ออกครับ' })
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Builder name to delete')
            .setDescriptionLocalizations({ th: 'ชื่อ builder ที่จะลบ' })
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  // ----- Autocomplete: ตอบชื่อ draft ให้ Discord แสดงในช่องพิมพ์ -----
  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand(false);
    if (!subcommand || (subcommand !== 'edit' && subcommand !== 'delete')) {
      return interaction.respond([]);
    }
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const drafts = listGuildDrafts(interaction.guildId);
    const choices = drafts
      .filter((d) => d.name.toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map((d) => ({ name: d.name, value: d.name }));
    await interaction.respond(choices);
  },

  // ----- จุดเริ่มต้น: dispatch ตาม subcommand -----
  async execute(interaction) {
    // getSubcommand(false) คืน null แทนที่จะ throw เมื่อไม่มี subcommand
    // กรณีนี้เกิดเมื่อผู้ใช้พิมพ์ /builder เฉยๆ → แสดง list แทน
    const sub = interaction.options.getSubcommand(false);
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const t = createTranslator(getGuildLanguage(guildId));

    if (!sub) {
      await interaction.reply(buildListPayload(guildId, null, t));
      return;
    }

    // ----- /builder new [name] -----
    if (sub === 'new') {
      const rawName = interaction.options.getString('name').trim();

      if (!rawName) {
        return interaction.reply({ content: t('builder.command.name_required'), flags: MessageFlags.Ephemeral });
      }

      if (namedDraftExists(guildId, rawName)) {
        return interaction.reply({
          content: t('builder.command.already_exists', { name: rawName }),
          flags: MessageFlags.Ephemeral,
        });
      }

      // 🔒 Quota gating: ฟรีจำกัด 1 อัน/เซิร์ฟ (ของเก่าที่เกินโควตายัง
      // แก้ไขได้ปกติ แค่ห้ามสร้างใหม่เพิ่ม — เหมือน role-setup.js)
      const FREE_BUILDER_LIMIT = 1;
      const guildBuilderCount = listGuildDrafts(guildId).length;
      if (!isPremiumGuild(guildId) && guildBuilderCount >= FREE_BUILDER_LIMIT) {
        const reason = t('builder.quota.reached', { limit: FREE_BUILDER_LIMIT });
        return interaction.reply({ content: buildUpgradeMessage(t, reason), flags: MessageFlags.Ephemeral });
      }

      createNamedDraft(guildId, rawName, userId); // สร้าง + เริ่ม session (blocks: [] เสมอ)

      // ฟรี: preload blocks เป็น skeleton 2 บล็อก (section + gallery ว่างๆ)
      // ใช้ addBlock() ตัวเดิม เพื่อให้ auto-save เข้า storage ถูกต้องเหมือนโค้ดส่วนอื่น
      if (!isPremiumGuild(guildId)) {
        for (const block of createFreeTierBlocks()) addBlock(guildId, userId, block);
      }

      // เลือก panel ผ่าน resolveBuilderPanelPayload() เสมอ (ไม่เช็ค isPremiumGuild() เอง
      // ซ้ำตรงนี้) — draft ที่เพิ่งสร้าง (ว่างหรือ preload skeleton แล้ว) จะผ่านเกณฑ์
      // แผงฟรีอยู่แล้วปกติ แต่รวม logic ไว้จุดเดียวกันบั๊กแบบที่เคยเจอมา
      await interaction.reply(resolveBuilderPanelPayload(userId, guildId, t));
      return;
    }

    // ----- /builder edit [name] -----
    if (sub === 'edit') {
      const name = interaction.options.getString('name').trim();

      if (!namedDraftExists(guildId, name)) {
        return interaction.reply({
          content: t('builder.command.not_found', { name }),
          flags: MessageFlags.Ephemeral,
        });
      }

      openNamedDraft(guildId, name, userId); // โหลด + เริ่ม session

      // เช็ค tier **ปัจจุบัน** เสมอ (ไม่ใช่ตอนสร้าง) เพราะเซิร์ฟอาจอัปเกรด/ดาวน์เกรดทีหลังได้
      // — และถ้าเป็นฟรีแต่ draft นี้มีเนื้อหาเกินความสามารถของแผงฟรี (เช่น builder
      // เก่าที่สร้าง/แก้ไว้ตอนยังพรีเมี่ยม) resolveBuilderPanelPayload() จะสลับไปโชว์
      // ข้อความชวนอัปเกรดแทนให้เอง ไม่ปล่อยให้แผงฟรีพยายามเปิดจนพังเงียบๆ
      await interaction.reply(resolveBuilderPanelPayload(userId, guildId, t));
      return;
    }

    // ----- /builder list -----
    if (sub === 'list') {
      await interaction.reply(buildListPayload(guildId, null, t));
      return;
    }

    // ----- /builder delete [name] -----
    if (sub === 'delete') {
      const name = interaction.options.getString('name').trim();

      if (!namedDraftExists(guildId, name)) {
        return interaction.reply({
          content: t('builder.command.not_found_short', { name }),
          flags: MessageFlags.Ephemeral,
        });
      }

      // เก็บ pending deletion แล้วแสดงปุ่ม confirm/cancel
      pendingDeletions.set(sessionKey(guildId, userId), { guildId, name });

      const confirmBtn = new ButtonBuilder()
        .setCustomId(IDS.DELETE_CONFIRM)
        .setLabel(t('builder.command.delete_confirm_button'))
        .setStyle(ButtonStyle.Danger);

      const cancelBtn = new ButtonBuilder()
        .setCustomId(IDS.DELETE_CANCEL)
        .setLabel(t('builder.command.delete_cancel_button'))
        .setStyle(ButtonStyle.Secondary);

      await interaction.reply({
        components: [
          new TextDisplayBuilder().setContent(t('builder.command.delete_confirm_header', { name })),
          new ActionRowBuilder().addComponents(confirmBtn, cancelBtn),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }
  },

  // ----- เมื่อกดปุ่มใดๆ ที่ขึ้นต้นด้วย builder_ -----
  async handleButton(interaction) {
    const t = createTranslator(getGuildLanguage(interaction.guildId));

    // ปุ่ม "แก้ไข"/"ลบ" มี index ฝังท้าย customId (เช่น builder_manage_edit_2) เช็คก่อน switch ปกติ
    if (interaction.customId.startsWith(MANAGE_EDIT_PREFIX)) {
      const index = Number(interaction.customId.slice(MANAGE_EDIT_PREFIX.length));
      const block = getBlockAt(interaction.guildId, interaction.user.id, index);

      if (!block) {
        // เผื่อกรณีบล็อกถูกลบไปแล้วจากที่อื่นก่อนกดปุ่มนี้ทัน
        await interaction.reply({
          content: t('builder.block.gone'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (block.type === 'separator') {
        // separator ไม่มีข้อมูลให้พิมพ์ แค่สลับ small/large ทันทีแล้วกลับแผงควบคุมเลย ไม่ต้องเปิด modal
        const newSpacing = block.spacing === 'large' ? 'small' : 'large';
        updateBlockAt(interaction.guildId, interaction.user.id, index, { type: 'separator', spacing: newSpacing });
        await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
        return;
      }

      if (block.type === 'text') {
        const modal = new ModalBuilder()
          .setCustomId(`${MODAL_EDIT_TEXT_PREFIX}${index}`)
          .setTitle(t('builder.modal.title.edit_text'));

        const textInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_TEXT)
          .setLabel(t('builder.modal.text_content_label'))
          .setStyle(TextInputStyle.Paragraph)
          .setValue(block.content) // pre-fill เนื้อหาเดิม
          .setRequired(true)
          .setMaxLength(4000);

        modal.addComponents(new ActionRowBuilder().addComponents(textInput));
        await interaction.showModal(modal);
        return;
      }

      if (block.type === 'gallery') {
        const modal = new ModalBuilder()
          .setCustomId(`${MODAL_EDIT_IMAGE_PREFIX}${index}`)
          .setTitle(t('builder.modal.title.edit_image'));

        const urlsInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_IMAGE_URLS)
          .setStyle(TextInputStyle.Paragraph)
          .setValue(block.items.map((item) => item.url).join('\n')) // pre-fill ลิงก์เดิมทุกอัน คนละบรรทัด
          .setPlaceholder('https://example.com/1.png\nhttps://example.com/2.png')
          .setRequired(true)
          .setMaxLength(4000);

        const urlsLabel = new LabelBuilder()
          .setLabel(t('builder.modal.image_urls_label'))
          .setDescription(t('builder.modal.image_url_hint'))
          .setTextInputComponent(urlsInput);

        modal.addLabelComponents(urlsLabel);
        await interaction.showModal(modal);
        return;
      }

      if (block.type === 'section') {
        const modal = buildSectionModal(`${MODAL_EDIT_SECTION_PREFIX}${index}`, t('builder.modal.title.edit_section'), {
          text: block.text,
          thumbnail: block.thumbnail,
        }, t);
        await interaction.showModal(modal);
        return;
      }

      if (block.type === 'section_button') {
        const modal = buildSectionButtonModal(
          `${MODAL_EDIT_SECTION_BUTTON_PREFIX}${index}`,
          t('builder.modal.title.edit_section_button'),
          { text: block.text, buttonLabel: block.buttonLabel, buttonUrl: block.buttonUrl },
          t
        );
        await interaction.showModal(modal);
        return;
      }

      if (block.type === 'section_channel_button') {
        // แก้ไข section_channel_button = แก้ได้แค่ text กับ buttonLabel เท่านั้น
        // buttonUrl ไม่แสดงให้แก้ตรงๆ เพราะมันถูก generate จาก channelId อยู่แล้ว
        // ถ้าอยากเปลี่ยนช่อง ต้องเลือกใหม่ผ่าน ChannelSelectMenu ขั้นที่ 2
        const modal = buildSectionChannelModal(
          `${MODAL_EDIT_SECTION_CHANNEL_PREFIX}${index}`,
          t('builder.modal.title.edit_section_channel'),
          { text: block.text, buttonLabel: block.buttonLabel },
          t
        );
        await interaction.showModal(modal);
        return;
      }

      if (block.type === 'section_role_button') {
        // แก้ไข section_role_button = แก้ได้เฉพาะ text, buttonLabel, buttonEmoji
        // roleId และ buttonStyle จะถูกคงไว้ เพราะ modal ใส่ select menu ไม่ได้
        // ถ้าอยากเปลี่ยนยศหรือสีปุ่ม ต้องลบแล้วสร้างใหม่
        const modal = buildSectionRoleModal(
          `${MODAL_EDIT_SECTION_ROLE_PREFIX}${index}`,
          t('builder.modal.title.edit_section_role'),
          {
            text: block.text,
            buttonLabel: block.buttonLabel,
            // buttonEmoji อาจเป็น null, '<:name:id>', หรือ '🎭'
            // ส่งเป็น string ไปให้ modal pre-fill ได้เลย (ถ้า null ส่ง '' แทนเพื่อให้ช่องว่าง)
            buttonEmoji: block.buttonEmoji || '',
          },
          t
        );
        await interaction.showModal(modal);
        return;
      }

      return; // เผื่ออนาคตมี block type อื่นที่ยังไม่รองรับการแก้ไข
    }

    if (interaction.customId.startsWith(MANAGE_DELETE_PREFIX)) {
      const index = Number(interaction.customId.slice(MANAGE_DELETE_PREFIX.length));
      removeBlockAt(interaction.guildId, interaction.user.id, index);
      // ลบเสร็จกลับไปแผงควบคุมปกติทันที เห็น preview ที่อัปเดตแล้ว
      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ----- กด "⬆️ ย้ายขึ้น" -----
    if (interaction.customId.startsWith(MOVE_UP_PREFIX)) {
      const index = Number(interaction.customId.slice(MOVE_UP_PREFIX.length));

      if (index === 0) {
        // ปกติปุ่มจะ disabled ไปแล้วตั้งแต่ฝั่ง UI แต่กันไว้อีกชั้นเผื่อกดทันก่อน UI อัปเดต
        await interaction.reply({ content: t('builder.block.already_top'), flags: MessageFlags.Ephemeral });
        return;
      }

      const newIndex = index - 1;
      swapBlocks(interaction.guildId, interaction.user.id, index, newIndex);

      // โชว์หน้าจอเดิมต่อ แต่อ้างอิงตำแหน่งใหม่ของบล็อกที่เพิ่งย้าย เพื่อกดย้ายต่อเนื่องได้เลยโดยไม่ต้องกลับไปเลือกใหม่
      const block = getBlockAt(interaction.guildId, interaction.user.id, newIndex);
      const totalBlocks = getDraft(interaction.guildId, interaction.user.id).blocks.length;
      await interaction.update(buildBlockActionPayload(newIndex, block, totalBlocks, interaction.guildId));
      return;
    }

    // ----- กด "⬇️ ย้ายลง" -----
    if (interaction.customId.startsWith(MOVE_DOWN_PREFIX)) {
      const index = Number(interaction.customId.slice(MOVE_DOWN_PREFIX.length));
      const totalBlocks = getDraft(interaction.guildId, interaction.user.id).blocks.length;

      if (index === totalBlocks - 1) {
        await interaction.reply({ content: t('builder.block.already_bottom'), flags: MessageFlags.Ephemeral });
        return;
      }

      const newIndex = index + 1;
      swapBlocks(interaction.guildId, interaction.user.id, index, newIndex);

      const block = getBlockAt(interaction.guildId, interaction.user.id, newIndex);
      await interaction.update(buildBlockActionPayload(newIndex, block, totalBlocks, interaction.guildId));
      return;
    }

    // ----- กด "+ แทรกบล็อกใหม่หลังจากนี้" -> โชว์หน้าจอเลือกชนิดบล็อก -----
    if (interaction.customId.startsWith(INSERT_PREFIX)) {
      const selectedIndex = Number(interaction.customId.slice(INSERT_PREFIX.length));
      const insertPosition = selectedIndex + 1; // แทรก "หลังจาก" บล็อกที่เลือก = ตำแหน่ง index+1
      await interaction.update(buildInsertTypePayload(insertPosition, interaction.guildId));
      return;
    }

    // ----- เลือก "เส้นคั่น" จากหน้าจอแทรกบล็อก -> แทรกทันทีไม่ต้องเปิด modal -----
    if (interaction.customId.startsWith(INSERT_SEPARATOR_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SEPARATOR_PREFIX.length));
      insertBlockAt(interaction.guildId, interaction.user.id, insertPosition, { type: 'separator', spacing: 'small' });
      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ----- เลือก "ข้อความ" จากหน้าจอแทรกบล็อก -> เปิด modal (เหมือนปุ่ม + เพิ่มข้อความ หลัก) -----
    if (interaction.customId.startsWith(INSERT_TEXT_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_TEXT_PREFIX.length));
      const modal = new ModalBuilder()
        .setCustomId(`${MODAL_INSERT_TEXT_PREFIX}${insertPosition}`)
        .setTitle(t('builder.modal.title.insert_text'));

      const textInput = new TextInputBuilder()
        .setCustomId(IDS.INPUT_TEXT)
        .setLabel(t('builder.modal.text_content_label'))
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(t('builder.modal.text_content_placeholder'))
        .setRequired(true)
        .setMaxLength(4000);

      modal.addComponents(new ActionRowBuilder().addComponents(textInput));
      await interaction.showModal(modal);
      return;
    }

    // ----- เลือก "รูป" จากหน้าจอแทรกบล็อก -> เปิด modal (เหมือนปุ่ม + เพิ่มรูป หลัก) -----
    if (interaction.customId.startsWith(INSERT_IMAGE_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_IMAGE_PREFIX.length));
      const modal = new ModalBuilder()
        .setCustomId(`${MODAL_INSERT_IMAGE_PREFIX}${insertPosition}`)
        .setTitle(t('builder.modal.title.insert_image'));

      const urlsInput = new TextInputBuilder()
        .setCustomId(IDS.INPUT_IMAGE_URLS)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('https://example.com/1.png\nhttps://example.com/2.png')
        .setRequired(true)
        .setMaxLength(4000);

      const urlsLabel = new LabelBuilder()
        .setLabel(t('builder.modal.image_urls_label'))
        .setDescription(t('builder.modal.image_url_hint'))
        .setTextInputComponent(urlsInput);

      modal.addLabelComponents(urlsLabel);
      await interaction.showModal(modal);
      return;
    }

    // ----- เลือก "Section" จากหน้าจอแทรกบล็อก -> โชว์หน้าจอย่อยให้เลือกรูปเล็ก/ปุ่มลิงก์/ปุ่มยศ -----
    if (interaction.customId.startsWith(INSERT_SECTION_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SECTION_PREFIX.length));
      await interaction.update(
        buildSectionChoicePayload(
          `${INSERT_SECTION_THUMBNAIL_PREFIX}${insertPosition}`,
          `${INSERT_SECTION_BUTTON_PREFIX}${insertPosition}`,
          `${INSERT_SECTION_ROLE_PREFIX}${insertPosition}`,
          `${INSERT_SECTION_CHANNEL_PREFIX}${insertPosition}`,
          t
        )
      );
      return;
    }

    // ----- เลือกตัวเลือกย่อย "🖼️ รูปเล็ก" ตอนแทรก -> เปิด modal (เหมือนปุ่มหลัก) -----
    if (interaction.customId.startsWith(INSERT_SECTION_THUMBNAIL_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SECTION_THUMBNAIL_PREFIX.length));
      const modal = buildSectionModal(`${MODAL_INSERT_SECTION_PREFIX}${insertPosition}`, t('builder.modal.title.insert_section'), {}, t);
      await interaction.showModal(modal);
      return;
    }

    // ----- เลือกตัวเลือกย่อย "🔘 ปุ่มลิงก์" ตอนแทรก -> เปิด modal (เหมือนปุ่มหลัก) -----
    if (interaction.customId.startsWith(INSERT_SECTION_BUTTON_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SECTION_BUTTON_PREFIX.length));
      const modal = buildSectionButtonModal(
        `${MODAL_INSERT_SECTION_BUTTON_PREFIX}${insertPosition}`,
        t('builder.modal.title.insert_section_button'),
        {},
        t
      );
      await interaction.showModal(modal);
      return;
    }

    // ----- เลือกตัวเลือกย่อย "🎭 ปุ่มยศ" ตอนแทรก -> เปิด modal ขั้นที่ 1 -----
    if (interaction.customId.startsWith(INSERT_SECTION_ROLE_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SECTION_ROLE_PREFIX.length));
      const modal = buildSectionRoleModal(
        `${MODAL_INSERT_SECTION_ROLE_PREFIX}${insertPosition}`,
        t('builder.modal.title.insert_section_role'),
        {},
        t
      );
      await interaction.showModal(modal);
      return;
    }

    // ----- เลือก "📢 ปุ่มลิงก์ช่อง" จากหน้าจอแทรกบล็อก -> เปิด modal ขั้นที่ 1 -----
    if (interaction.customId.startsWith(INSERT_SECTION_CHANNEL_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SECTION_CHANNEL_PREFIX.length));
      const modal = buildSectionChannelModal(
        `${MODAL_INSERT_SECTION_CHANNEL_PREFIX}${insertPosition}`,
        t('builder.modal.title.insert_section_channel'),
        {},
        t
      );
      await interaction.showModal(modal);
      return;
    }

    // ----- กดปุ่มเลือกสีปุ่มยศ (ขั้นที่ 3 ของ flow) -----
    // customId รูปแบบ builder_role_style_Primary / Secondary / Success / Danger
    // pending มี { text, buttonLabel, buttonEmoji, roleId, insertPosition } ครบแล้วตอนนี้
    if (interaction.customId.startsWith(ROLE_STYLE_PREFIX)) {
      const styleName = interaction.customId.slice(ROLE_STYLE_PREFIX.length);
      // styleName จะเป็น 'Primary', 'Secondary', 'Success', หรือ 'Danger' ตรงๆ
      const pending = getPendingRoleButton(interaction.guildId, interaction.user.id);

      if (!pending || !pending.roleId) {
        // pending หมดอายุ (เช่น bot restart ระหว่างขั้น 2→3) กลับแผงควบคุมเฉยๆ
        await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
        return;
      }

      clearPendingRoleButton(interaction.guildId, interaction.user.id);

      const block = {
        type: 'section_role_button',
        text: pending.text,
        buttonLabel: pending.buttonLabel,
        // buttonEmoji เก็บเป็น string ที่ resolve แล้ว (เช่น "<:mail:123>" หรือ "🎭" หรือ null)
        // buildMessageFromSchema() จะแปลงต่อเป็น emoji object ก่อนส่ง .setEmoji()
        buttonEmoji: pending.buttonEmoji ?? null,
        buttonStyle: styleName, // 'Primary' | 'Secondary' | 'Success' | 'Danger'
        roleId: pending.roleId,
      };

      if (pending.insertPosition !== null) {
        insertBlockAt(interaction.guildId, interaction.user.id, pending.insertPosition, block);
      } else {
        addBlock(interaction.guildId, interaction.user.id, block);
      }

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    switch (interaction.customId) {
      case IDS.ADD_TEXT: {
        const modal = new ModalBuilder()
          .setCustomId(IDS.MODAL_TEXT)
          .setTitle(t('builder.modal.title.add_text'));

        const textInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_TEXT)
          .setLabel(t('builder.modal.text_content_label'))
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(t('builder.modal.text_content_placeholder'))
          .setRequired(true)
          .setMaxLength(4000);

        modal.addComponents(new ActionRowBuilder().addComponents(textInput));

        await interaction.showModal(modal);
        break;
      }

      case IDS.ADD_IMAGE: {
        const modal = new ModalBuilder()
          .setCustomId(IDS.MODAL_IMAGE)
          .setTitle(t('builder.modal.title.add_image'));

        const urlsInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_IMAGE_URLS)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('https://example.com/1.png\nhttps://example.com/2.png')
          .setRequired(true)
          .setMaxLength(4000);

        const urlsLabel = new LabelBuilder()
          .setLabel(t('builder.modal.image_urls_label'))
          .setDescription(t('builder.modal.image_url_hint'))
          .setTextInputComponent(urlsInput);

        modal.addLabelComponents(urlsLabel);

        await interaction.showModal(modal);
        break;
      }

      case IDS.ADD_SECTION: {
        await interaction.update(
          buildSectionChoicePayload(IDS.ADD_SECTION_THUMBNAIL, IDS.ADD_SECTION_BUTTON, IDS.ADD_SECTION_ROLE, IDS.ADD_SECTION_CHANNEL, t)
        );
        break;
      }

      case IDS.ADD_SECTION_THUMBNAIL: {
        const modal = buildSectionModal(IDS.MODAL_SECTION, t('builder.modal.title.add_section'), {}, t);
        await interaction.showModal(modal);
        break;
      }

      case IDS.ADD_SECTION_BUTTON: {
        const modal = buildSectionButtonModal(IDS.MODAL_SECTION_BUTTON, t('builder.modal.title.add_section_button'), {}, t);
        await interaction.showModal(modal);
        break;
      }

      case IDS.ADD_SECTION_ROLE: {
        // ขั้นที่ 1: เปิด modal รับข้อความ + ป้ายปุ่ม + อิโมจิ (optional)
        const modal = buildSectionRoleModal(IDS.MODAL_SECTION_ROLE, t('builder.modal.title.add_section_role'), {}, t);
        await interaction.showModal(modal);
        break;
      }

      case IDS.ADD_SECTION_CHANNEL: {
        // ขั้นที่ 1: เปิด modal รับข้อความ + ป้ายปุ่ม (ยังไม่เลือกช่อง)
        // ต่างจาก section_button ตรงที่ไม่มีช่อง URL ให้พิมพ์ เพราะ URL จะ generate จากช่องที่เลือกในขั้นที่ 2
        const sectionChannelModal = buildSectionChannelModal(IDS.MODAL_SECTION_CHANNEL, t('builder.modal.title.add_section_channel'), {}, t);
        await interaction.showModal(sectionChannelModal);
        break;
      }

      case IDS.ADD_SEPARATOR: {
        // ไม่ต้องเปิด modal เพราะ separator ไม่มีข้อมูลให้ผู้ใช้กรอกเลย
        addBlock(interaction.guildId, interaction.user.id, { type: 'separator', spacing: 'small' });

        // ปุ่มธรรมดา (ไม่ใช่ modal) ต้องใช้ .update() ตรงๆ ได้เลย ไม่ต้องผ่าน showModal ก่อน
        await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
        break;
      }

      case IDS.MANAGE: {
        const draft = getDraft(interaction.guildId, interaction.user.id);

        if (draft.blocks.length === 0) {
          await interaction.reply({
            content: t('builder.manage.empty'),
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        await interaction.update(buildManageSelectPayload(interaction.user.id, interaction.guildId));
        break;
      }

      case IDS.MANAGE_BACK: {
        // กลับไปแผงควบคุมปกติ ไม่มีการเปลี่ยนแปลงข้อมูลอะไร
        // 🔒 เลือก panel ผ่าน resolveBuilderPanelPayload() เสมอ เพราะปุ่มนี้ใช้ customId
        // เดียวกันทั้งฝั่งฟรีและพรีเมี่ยม (มันคือปุ่ม "ยกเลิก" บนหน้าเลือกช่องโพสต์ ซึ่ง
        // ทั้งสองฝั่งใช้ร่วมกัน) — ถ้าไม่เช็คตรงนี้ ฟรียูสเซอร์จะหลุดไปเจอแผงเต็มของ
        // พรีเมี่ยม หรือถ้า draft เกินความสามารถแผงฟรี (เช่นบิลด์ไว้ตอนยังพรีเมี่ยม)
        // จะพังเงียบๆ ถ้าไม่ผ่านฟังก์ชันกลางนี้
        await interaction.update(resolveBuilderPanelPayload(interaction.user.id, interaction.guildId, t));
        break;
      }

      case IDS.COLOR: {
        await interaction.update(buildColorSelectPayload(interaction.guildId));
        break;
      }

      case IDS.DELETE_CONFIRM: {
        const pending = pendingDeletions.get(sessionKey(interaction.guildId, interaction.user.id));
        pendingDeletions.delete(sessionKey(interaction.guildId, interaction.user.id)); // ล้างทิ้งไม่ว่าจะเจอหรือไม่

        if (!pending) {
          // pending หมดอายุ (เช่น bot restart ระหว่างรอ confirm)
          await interaction.update({
            components: [
              new TextDisplayBuilder().setContent(t('builder.delete.expired')),
            ],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          break;
        }

        const deleted = deleteNamedDraft(pending.guildId, pending.name);
        await interaction.update({
          components: [
            new TextDisplayBuilder().setContent(
              deleted
                ? t('builder.delete.success', { name: pending.name })
                : t('builder.delete.not_found', { name: pending.name })
            ),
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        break;
      }

      case IDS.DELETE_CANCEL: {
        const pending = pendingDeletions.get(sessionKey(interaction.guildId, interaction.user.id));
        pendingDeletions.delete(sessionKey(interaction.guildId, interaction.user.id));

        await interaction.update({
          components: [
            new TextDisplayBuilder().setContent(
              t('builder.delete.cancelled', { name: pending?.name ?? 'builder' })
            ),
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        break;
      }

      case IDS.SIMPLE_EDIT_BASIC: {
        const draft     = getDraft(interaction.guildId, interaction.user.id);
        const infoBlock = draft.blocks.find(b => b.type === 'text' || b.type === 'section');
        const rawText   = infoBlock ? (infoBlock.type === 'section' ? infoBlock.text : infoBlock.content) : '';
        const lines     = (rawText || '').split('\n');
        // ตัดความยาวให้ไม่เกิน maxLength ของ field เสมอ (กันกรณีมีข้อความ
        // ยาวตกค้างจากการทดสอบ/ใช้งานก่อนหน้า ที่ pre-fill แล้วเกิน 100
        // ตัวอักษร ทำให้ Discord ปฏิเสธการเปิด modal ทั้งก้อน)
        const currentTitle = (lines[0]?.replace(/^#\s*/, '') || '').slice(0, 100);
        const currentDesc  = lines.slice(1).join('\n');

        const modal = new ModalBuilder().setCustomId('builder_modal_simple_basic').setTitle(t('builder.simple.modal.basic_title'));
        const titleInput = new TextInputBuilder().setCustomId('simple_title').setLabel(t('builder.simple.modal.title_label')).setStyle(TextInputStyle.Short).setValue(currentTitle).setRequired(false).setMaxLength(100);
        const descInput  = new TextInputBuilder().setCustomId('simple_desc').setLabel(t('builder.simple.modal.description_label')).setStyle(TextInputStyle.Paragraph).setValue(currentDesc).setRequired(false).setMaxLength(2000);
        const colorInput = new TextInputBuilder().setCustomId('simple_color').setLabel(t('builder.simple.modal.color_label')).setStyle(TextInputStyle.Short).setValue(draft.accentColor || '').setRequired(false).setMaxLength(7);
        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(descInput),
          new ActionRowBuilder().addComponents(colorInput),
        );
        await interaction.showModal(modal);
        break;
      }

      case IDS.SIMPLE_EDIT_MAIN_IMAGE: {
        const draft   = getDraft(interaction.guildId, interaction.user.id);
        const gallery = draft.blocks.find(b => b.type === 'gallery');
        const currentUrl = gallery?.items?.[0]?.url || '';

        const modal = new ModalBuilder().setCustomId('builder_modal_simple_main_image').setTitle(t('builder.simple.modal.main_image_title'));
        const urlInput = new TextInputBuilder().setCustomId('simple_image_url').setLabel(t('builder.simple.modal.image_url_label')).setStyle(TextInputStyle.Short).setValue(currentUrl).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
        await interaction.showModal(modal);
        break;
      }

      case IDS.SIMPLE_EDIT_THUMBNAIL: {
        const draft     = getDraft(interaction.guildId, interaction.user.id);
        const infoBlock = draft.blocks.find(b => b.type === 'text' || b.type === 'section');
        const currentUrl = infoBlock?.type === 'section' ? (infoBlock.thumbnail || '') : '';

        const modal = new ModalBuilder().setCustomId('builder_modal_simple_thumbnail').setTitle(t('builder.simple.modal.thumbnail_title'));
        const urlInput = new TextInputBuilder().setCustomId('simple_thumbnail_url').setLabel(t('builder.simple.modal.thumbnail_url_label')).setStyle(TextInputStyle.Short).setValue(currentUrl).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
        await interaction.showModal(modal);
        break;
      }

      case IDS.SIMPLE_POST: {
        // ใช้ buildPreviewableDraft() กรองบล็อกที่ยังไม่พร้อมออกก่อนเช็ค
        // (เหมือนตอนแสดง preview เป๊ะๆ — สิ่งที่โพสต์จริงต้องตรงกับที่
        // เห็นใน preview เสมอ)
        const draft = getDraft(interaction.guildId, interaction.user.id);
        const previewableDraft = buildPreviewableDraft(draft);
        if (previewableDraft.blocks.length === 0) {
          await interaction.reply({ content: t('builder.post.empty_draft'), flags: MessageFlags.Ephemeral });
          break;
        }
        // ปุ่มธรรมดา (ไม่ใช่ modal) ใช้ .update() ได้เลย — เปิดหน้าเลือกช่อง
        // เดียวกับที่ปุ่ม Post ของพรีเมียมใช้อยู่แล้ว ไม่ต้องสร้างใหม่
        await interaction.update(buildPostChannelSelectPayload(t));
        break;
      }

      case IDS.LIST_SEARCH: {
        // เปิด modal ให้ผู้ใช้พิมพ์คำค้นหา
        const modal = new ModalBuilder()
          .setCustomId(IDS.MODAL_LIST_SEARCH)
          .setTitle(t('builder.modal.title.list_search'));

        const searchInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_LIST_SEARCH)
          .setLabel(t('builder.modal.search_label'))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(t('builder.modal.search_placeholder'))
          .setRequired(true)
          .setMaxLength(50);

        modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
        await interaction.showModal(modal);
        break;
      }

      case IDS.LIST_RESET: {
        // ล้างตัวกรอง → แสดงรายการทั้งหมด
        await interaction.update(buildListPayload(interaction.guildId, null, t));
        break;
      }

      case IDS.POST: {
        const draft = getDraft(interaction.guildId, interaction.user.id);

        // draft ว่าง → แจ้งเตือนแบบ ephemeral ไม่ต้องเปิด channel picker
        if (draft.blocks.length === 0) {
          await interaction.reply({
            content: t('builder.post.empty_draft'),
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        // มีบล็อก → เปิดหน้าจอเลือกช่องปลายทาง
        await interaction.update(buildPostChannelSelectPayload(t));
        break;
      }
    }
  },

  // ----- เมื่อเลือกจาก select menu ใดๆ ที่ขึ้นต้นด้วย builder_ -----
  async handleSelectMenu(interaction) {
    const t = createTranslator(getGuildLanguage(interaction.guildId));

    if (interaction.customId === IDS.MANAGE_SELECT) {
      const index = Number(interaction.values[0]); // ค่าที่เลือกคือ index ของ block (string ต้องแปลงเป็นตัวเลข)
      const block = getBlockAt(interaction.guildId, interaction.user.id, index);

      if (!block) {
        // เผื่อกรณีหายากมาก: เลือกจาก list เก่าที่ block ถูกลบไปแล้วพอดี
        await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
        return;
      }

      const totalBlocks = getDraft(interaction.guildId, interaction.user.id).blocks.length;
      await interaction.update(buildBlockActionPayload(index, block, totalBlocks, interaction.guildId));
      return;
    }

    if (interaction.customId === IDS.COLOR_SELECT) {
      const selectedValue = interaction.values[0];

      if (selectedValue === CUSTOM_COLOR_VALUE) {
        // เลือก "กำหนดเอง" -> เปิด modal ให้พิมพ์ hex code เอง
        const modal = new ModalBuilder()
          .setCustomId(IDS.MODAL_COLOR_CUSTOM)
          .setTitle(t('builder.modal.title.color_custom'));

        const hexInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_COLOR_HEX)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('#FF66AA')
          .setRequired(true)
          .setMaxLength(7);

        const hexLabel = new LabelBuilder()
          .setLabel(t('builder.modal.hex_label'))
          .setTextInputComponent(hexInput);

        modal.addLabelComponents(hexLabel);
        await interaction.showModal(modal);
        return;
      }

      // เป็นสีสำเร็จรูป (ตัวเลือกจะส่งค่ามาเป็น hex อยู่แล้ว) -> บันทึกแล้วกลับไปแผงควบคุมทันที
      setAccentColor(interaction.guildId, interaction.user.id, selectedValue);
      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ----- เลือกยศจาก select menu (ขั้นที่ 2 ของ flow ปุ่มยศ) -----
    if (interaction.customId === IDS.ROLE_SELECT) {
      const roleId = interaction.values[0];
      const pending = getPendingRoleButton(interaction.guildId, interaction.user.id);

      if (!pending) {
        // pending หมดอายุ (เช่น bot restart ระหว่างขั้น 1→2) กลับแผงควบคุมเฉยๆ
        await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
        return;
      }

      // อัปเดต pending ให้เพิ่ม roleId เข้าไป แล้วเปลี่ยนหน้าจอเป็นขั้นที่ 3 (เลือกสีปุ่ม)
      // ยังไม่ clearPendingRoleButton() เพราะขั้นที่ 3 (ROLE_STYLE_PREFIX handler) ต้องใช้ข้อมูลนี้อยู่
      setPendingRoleButton(interaction.guildId, interaction.user.id, { ...pending, roleId });
      await interaction.update(buildRoleStylePayload(t));
      return;
    }

    // ----- เลือก draft จาก /builder list (StringSelectMenu) → เปิดแผง builder -----
    if (interaction.customId === IDS.LIST_SELECT) {
      const name = interaction.values[0];
      const guildId = interaction.guildId;

      if (!namedDraftExists(guildId, name)) {
        await interaction.reply({
          content: t('builder.list_select.not_found', { name }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      openNamedDraft(guildId, name, interaction.user.id);
      // update ทับ list panel → เปิด builder panel แทน
      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    if (interaction.customId === IDS.CHANNEL_SELECT) {
      // ขั้นที่ 2: ผู้ใช้เลือกช่องแล้ว — ดึง pending state ที่เก็บไว้จากขั้นที่ 1
      const channelId = interaction.values[0];
      const pending = getPendingChannelButton(interaction.guildId, interaction.user.id);

      if (!pending) {
        // pending หมดอายุ (เช่น bot restart ระหว่างขั้น 1→2) กลับแผงควบคุมเฉยๆ
        await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
        return;
      }

      clearPendingChannelButton(interaction.guildId, interaction.user.id);

      // สร้าง URL ในรูปแบบที่ Discord ใช้ลิงก์ตรงไปยังช่องนั้น
      // รูปแบบ: https://discord.com/channels/{guildId}/{channelId}
      // interaction.guildId = ID ของเซิร์ฟเวอร์ที่ใช้คำสั่งนี้อยู่
      const buttonUrl = `https://discord.com/channels/${interaction.guildId}/${channelId}`;

      const block = {
        type: 'section_channel_button',
        text: pending.text,
        buttonLabel: pending.buttonLabel,
        buttonUrl, // URL ที่ generate อัตโนมัติ ผู้ใช้ไม่ต้องพิมพ์เอง
      };

      if (pending.insertPosition !== null) {
        insertBlockAt(interaction.guildId, interaction.user.id, pending.insertPosition, block);
      } else {
        addBlock(interaction.guildId, interaction.user.id, block);
      }

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ----- เลือกช่องปลายทางสำหรับโพสต์ (flow ของปุ่ม "โพสต์") -----
    if (interaction.customId === IDS.POST_CHANNEL_SELECT) {
      const channelId = interaction.values[0];
      const draft = getDraft(interaction.guildId, interaction.user.id);

      // เช็คอีกครั้งเผื่อ draft ถูกล้างจากที่อื่น (edge case มาก แต่กันไว้)
      if (draft.blocks.length === 0) {
        // 🔒 เลือก panel ผ่าน resolveBuilderPanelPayload() เหมือนกัน — handler นี้ใช้
        // ร่วมกันทั้งปุ่ม "โพสต์" ฝั่งพรีเมี่ยม (IDS.POST) และฝั่งฟรี (IDS.SIMPLE_POST)
        // เลยพาฟรียูสเซอร์วนมาเจอแผงเต็ม หรือ draft เกินความสามารถแผงฟรีได้ถ้าไม่ผ่าน
        // ฟังก์ชันกลางนี้ก่อน
        await interaction.update(resolveBuilderPanelPayload(interaction.user.id, interaction.guildId, t));
        return;
      }

      // validate schema ก่อนส่งจริง — ถ้า schema เสียหายอยากรู้ก่อนที่จะยิงออกไป
      let messagePayload;
      try {
        messagePayload = buildMessageFromSchema(buildPreviewableDraft(draft));
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: t('builder.post.build_failed', { error: friendlyMessage }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ดึง channel object จาก cache ก่อน ถ้าไม่มีค่อย fetch (เผื่อ bot เพิ่งเริ่ม)
      let channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) {
        try {
          channel = await interaction.guild.channels.fetch(channelId);
        } catch {
          channel = null;
        }
      }

      if (!channel) {
        await interaction.reply({
          content: t('builder.post.channel_not_found'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ส่งข้อความจริงเข้าช่องปลายทาง (ไม่ใช่ ephemeral)
      let postedMessage;
      try {
        postedMessage = await channel.send(messagePayload);
      } catch (error) {
        console.error('[builder POST] channel.send error:', error);
        await interaction.reply({
          content: t('builder.post.send_failed'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // โพสต์สำเร็จ — ล้าง draft แล้วแก้ข้อความเดิม (ที่เคยเป็นแผงตั้งค่า/แผงเลือกช่อง)
      // ให้กลายเป็นข้อความสำเร็จ + jump link ตรงๆ เลย จบในตัวเดียว ไม่ต้องโชว์แผง
      // ตั้งค่ากลับมาอีก ไม่มีปุ่มค้างให้กดต่อ — ผลลัพธ์เหมือนกันทั้งฝั่งฟรี/พรีเมี่ยม
      // เพราะจุดนี้ไม่มีการโชว์แผงแบบไหนแล้ว เลยไม่ต้องเช็ค tier ด้วยซ้ำ
      clearDraft(interaction.guildId, interaction.user.id);
      await interaction.update({
        components: [
          // [text](url) ใน ephemeral message จะ render เป็น hyperlink ให้กดได้เลย
          new TextDisplayBuilder().setContent(t('builder.post.success', { url: postedMessage.url })),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }
  },
  async handleModalSubmit(interaction) {
    const t = createTranslator(getGuildLanguage(interaction.guildId));

    // ----- modal ค้นหา builder (จากปุ่ม 🔍 ในหน้า list) -----
    if (interaction.customId === IDS.MODAL_LIST_SEARCH) {
      const query = interaction.fields.getTextInputValue(IDS.INPUT_LIST_SEARCH).trim();
      // อัปเดตหน้า list เดิมให้แสดงเฉพาะ builder ที่ชื่อ contains คำนั้น
      await interaction.update(buildListPayload(interaction.guildId, query || null, t));
      return;
    }

    if (interaction.customId === IDS.MODAL_COLOR_CUSTOM) {
      const rawHex = interaction.fields.getTextInputValue(IDS.INPUT_COLOR_HEX).trim();

      // เช็ครูปแบบ #RRGGBB ให้ครบ (# ตามด้วยเลขฐาน 16 หกหลักเป๊ะ)
      const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(rawHex);

      if (!isValidHex) {
        await interaction.reply({
          content: t('builder.color_custom.invalid', { input: rawHex }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      setAccentColor(interaction.guildId, interaction.user.id, rawHex);
      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ── simple panel (free tier) — modal ทั้ง 3 ตัว ──────────────────────────
    // ⚠️ ต่างจากเอกสารต้นฉบับ: ไม่มีฟังก์ชัน saveDraft(userId) อยู่จริงในไฟล์นี้
    // การ auto-save ทำผ่าน _autoSave() ภายใน builderDrafts.js ซึ่งถูกเรียกอัตโนมัติ
    // อยู่แล้วข้างใน updateBlockAt()/setAccentColor() — เลยใช้ 2 ฟังก์ชันนี้แทนการ
    // แก้ field ตรงๆ บน object reference แล้วเรียก save เอง (ไม่มีฟังก์ชันแบบนั้นให้เรียก)
    if (interaction.customId === 'builder_modal_simple_basic') {
      const rawTitle = interaction.fields.getTextInputValue('simple_title').trim();
      const rawDesc  = interaction.fields.getTextInputValue('simple_desc').trim();
      const color    = interaction.fields.getTextInputValue('simple_color').trim();

      // 🔒 เช็ค mention ก่อน resolve emoji (เช็คจากข้อความดิบก็พอ)
      if (containsMention(rawTitle) || containsMention(rawDesc)) {
        return interaction.reply({ content: t('builder.simple.mention_blocked'), flags: MessageFlags.Ephemeral });
      }

      // ✅ แปลง :ชื่อ: เป็น <:ชื่อ:id> ก่อนบันทึก (จุดที่หายไปตอน 3b)
      const title = resolveCustomEmojis(rawTitle, interaction.guild);
      const desc  = resolveCustomEmojis(rawDesc, interaction.guild);

      const draft = getDraft(interaction.guildId, interaction.user.id);
      const infoIndex = draft.blocks.findIndex(b => b.type === 'text' || b.type === 'section');
      if (infoIndex !== -1) {
        const infoBlock = draft.blocks[infoIndex];
        const newContent = title ? `# ${title}${desc ? '\n' + desc : ''}` : desc;
        if (infoBlock.type === 'section') {
          // มี thumbnail อยู่แล้ว → คงเป็น section ต่อไป แค่อัปเดต text
          updateBlockAt(interaction.guildId, interaction.user.id, infoIndex, { ...infoBlock, text: newContent });
        } else {
          // ยังไม่มี thumbnail → คงเป็น text ต่อไป แค่อัปเดต content
          updateBlockAt(interaction.guildId, interaction.user.id, infoIndex, { ...infoBlock, content: newContent });
        }
      }

      if (color) {
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
          return interaction.reply({ content: t('builder.simple.color_invalid', { input: color }), flags: MessageFlags.Ephemeral });
        }
        setAccentColor(interaction.guildId, interaction.user.id, color);
      } else {
        setAccentColor(interaction.guildId, interaction.user.id, null);
      }

      await interaction.deferUpdate();
      await interaction.editReply(buildSimplePanel(interaction.user.id, interaction.guildId));
      return;
    }

    if (interaction.customId === 'builder_modal_simple_main_image') {
      const url   = interaction.fields.getTextInputValue('simple_image_url').trim();
      const draft = getDraft(interaction.guildId, interaction.user.id);
      const galleryIndex = draft.blocks.findIndex(b => b.type === 'gallery');
      const galleryId = draft.blocks[galleryIndex]?.id;

      if (url) {
        try { validateUrl(url, t('builder.validation.thumbnail_label'), t); }
        catch (e) {
          return interaction.reply({ content: t('builder.simple.preview_error', { error: e.message.replace(/^buildMessageFromSchema:\s*/, '') }), flags: MessageFlags.Ephemeral });
        }
        if (galleryIndex !== -1) updateBlockAt(interaction.guildId, interaction.user.id, galleryIndex, { id: galleryId, type: 'gallery', items: [{ url }] });
      } else if (galleryIndex !== -1) {
        updateBlockAt(interaction.guildId, interaction.user.id, galleryIndex, { id: galleryId, type: 'gallery', items: [] });
      }

      await interaction.deferUpdate();
      await interaction.editReply(buildSimplePanel(interaction.user.id, interaction.guildId));
      return;
    }

    if (interaction.customId === 'builder_modal_simple_thumbnail') {
      const url = interaction.fields.getTextInputValue('simple_thumbnail_url').trim();
      const draft = getDraft(interaction.guildId, interaction.user.id);
      const infoIndex = draft.blocks.findIndex(b => b.type === 'text' || b.type === 'section');

      if (infoIndex !== -1) {
        const infoBlock = draft.blocks[infoIndex];
        const currentText = infoBlock.type === 'section' ? infoBlock.text : infoBlock.content;

        if (url) {
          try { validateUrl(url, t('builder.validation.thumbnail_label'), t); }
          catch (e) {
            return interaction.reply({ content: t('builder.simple.preview_error', { error: e.message.replace(/^buildMessageFromSchema:\s*/, '') }), flags: MessageFlags.Ephemeral });
          }
          // ตั้งค่าแล้ว → อัปเกรดเป็น section (มีทั้ง text+thumbnail ครบ)
          updateBlockAt(interaction.guildId, interaction.user.id, infoIndex, { id: infoBlock.id, type: 'section', text: currentText, thumbnail: url });
        } else {
          // ลบออก → กลับไปเป็น text ธรรมดา (thumbnail ไม่บังคับอีกต่อไป)
          updateBlockAt(interaction.guildId, interaction.user.id, infoIndex, { id: infoBlock.id, type: 'text', content: currentText });
        }
      }

      await interaction.deferUpdate();
      await interaction.editReply(buildSimplePanel(interaction.user.id, interaction.guildId));
      return;
    }

    if (interaction.customId === IDS.MODAL_TEXT) {
      const rawContent = interaction.fields.getTextInputValue(IDS.INPUT_TEXT);
      const content = resolveCustomEmojis(rawContent, interaction.guild);

      addBlock(interaction.guildId, interaction.user.id, { type: 'text', content });

      // .update() จะแก้ไขข้อความแผงควบคุมเดิม (ข้อความที่มีปุ่มอยู่) แทนที่จะส่งข้อความใหม่ซ้อนขึ้นมาเรื่อยๆ
      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    if (interaction.customId === IDS.MODAL_IMAGE) {
      const rawUrls = interaction.fields.getTextInputValue(IDS.INPUT_IMAGE_URLS);
      const result = parseGalleryUrlLines(rawUrls, t);

      if (!result.ok) {
        // ลิงก์ผิดรูปแบบหรือไม่มีลิงก์เลย — ไม่เก็บลง draft, ตอบกลับอธิบายสาเหตุแบบ ephemeral (ไม่แตะแผงควบคุมเดิม)
        await interaction.reply({
          content: result.errorContent + t('builder.hint.retry_button', { button: t('builder.panel.button.add_image') }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      addBlock(interaction.guildId, interaction.user.id, {
        type: 'gallery',
        items: result.urls.map((url) => ({ url })),
      });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));

      // เช็ค content-type แบบ soft-warning หลังบันทึกแล้ว (ไม่บล็อก แค่เตือนเพิ่ม ถ้าดูน่าสงสัย)
      await warnIfImagesLookSuspicious(interaction, result.urls);
      return;
    }

    // ----- modal เพิ่มข้อความคู่รูปเล็ก (section) -----
    if (interaction.customId === IDS.MODAL_SECTION) {
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const thumbnail = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_THUMBNAIL).trim();

      try {
        validateUrl(thumbnail, t('builder.validation.thumbnail_label'), t);
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: t('builder.error.add_failed', { error: friendlyMessage }) +
            t('builder.hint.retry_button', { button: t('builder.panel.button.add_section') }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      addBlock(interaction.guildId, interaction.user.id, { type: 'section', text, thumbnail });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      await warnIfImagesLookSuspicious(interaction, [thumbnail]);
      return;
    }

    // ----- modal เพิ่มข้อความคู่ปุ่มลิงก์ (section_button) -----
    if (interaction.customId === IDS.MODAL_SECTION_BUTTON) {
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_BUTTON_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      // ไม่แปลง custom emoji ในข้อความบนปุ่ม เพราะปุ่มของ Discord โชว์ได้แค่ตัวหนังสือธรรมดา
      // ใส่โค้ด <:ชื่อ:id> เข้าไปจะกลายเป็นตัวหนังสือแปลกๆ บนปุ่มแทนที่จะเป็นรูปอิโมจิ
      const buttonLabel = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_BUTTON_LABEL).trim();
      const buttonUrl = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_BUTTON_URL).trim();

      try {
        validateHttpUrl(buttonUrl, t('builder.validation.button_link_label'), t);
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: t('builder.error.add_failed', { error: friendlyMessage }) +
            t('builder.hint.retry_button', { button: t('builder.panel.button.add_section') }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      addBlock(interaction.guildId, interaction.user.id, { type: 'section_button', text, buttonLabel, buttonUrl });

      // ลิงก์ปุ่มไม่ใช่ลิงก์รูป เลยไม่ต้องเช็ค HEAD request แบบ image content-type
      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ----- modal ขั้นที่ 1 ของ "ปุ่มยศ" (ปุ่มหลัก) — รับข้อความ + ป้ายปุ่ม + อิโมจิ แล้วเปิด select menu ยศ -----
    if (interaction.customId === IDS.MODAL_SECTION_ROLE) {
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_ROLE_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const buttonLabel = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_ROLE_LABEL).trim();

      // อ่าน emoji (optional) — ถ้าว่าง getTextInputValue คืน '' แล้ว trim → '' → falsy → null
      const rawEmoji = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_ROLE_EMOJI).trim();
      // resolveCustomEmojis แปลง :ชื่อ: → <:ชื่อ:id> สำหรับ custom emoji
      // unicode emoji (เช่น 🎭) ไม่ตรง pattern :ชื่อ: จึงผ่านมาเป็นตัวเองเลย
      const buttonEmoji = rawEmoji ? resolveCustomEmojis(rawEmoji, interaction.guild) : null;

      // เก็บ pending state ไว้ก่อน แล้วค่อยเปลี่ยนหน้าจอเป็น select menu ยศ (ขั้นที่ 2)
      setPendingRoleButton(interaction.guildId, interaction.user.id, { text, buttonLabel, buttonEmoji, insertPosition: null });

      const { payload, assignableCount } = buildRoleSelectPayload(interaction.guild, t);

      if (assignableCount === 0) {
        clearPendingRoleButton(interaction.guildId, interaction.user.id);
        await interaction.reply({
          content: t('builder.role_button.no_roles'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.update(payload);
      return;
    }

    // ----- modal ขั้นที่ 1 ของปุ่มลิงก์ช่อง (เพิ่มใหม่) -----
    if (interaction.customId === IDS.MODAL_SECTION_CHANNEL) {
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_CHANNEL_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const buttonLabel = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_CHANNEL_LABEL).trim();

      // เก็บ pending state แล้วเปลี่ยนหน้าจอเป็น ChannelSelectMenu ขั้นที่ 2
      setPendingChannelButton(interaction.guildId, interaction.user.id, { text, buttonLabel, insertPosition: null });
      await interaction.update(buildChannelSelectPayload(t));
      return;
    }

    // ----- modal แก้ไขข้อความคู่ปุ่มช่อง (customId มี index ฝังท้าย เช่น builder_modal_editsecchan_2) -----
    if (interaction.customId.startsWith(MODAL_EDIT_SECTION_CHANNEL_PREFIX)) {
      const index = Number(interaction.customId.slice(MODAL_EDIT_SECTION_CHANNEL_PREFIX.length));
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_CHANNEL_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const buttonLabel = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_CHANNEL_LABEL).trim();

      // อัปเดตแค่ text กับ buttonLabel, คง buttonUrl เดิมไว้ (URL ผูกกับช่องที่เลือกไว้แต่แรก)
      // ถ้าอยากเปลี่ยนช่อง ต้องลบแล้วสร้างใหม่ผ่านปุ่ม + เพิ่ม Section
      const existingBlock = getBlockAt(interaction.guildId, interaction.user.id, index);
      updateBlockAt(interaction.guildId, interaction.user.id, index, {
        type: 'section_channel_button',
        text,
        buttonLabel,
        buttonUrl: existingBlock.buttonUrl, // คง URL เดิมไว้
      });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ----- modal แก้ไขข้อความ (customId มี index ฝังท้าย เช่น builder_modal_edit_text_2) -----
    if (interaction.customId.startsWith(MODAL_EDIT_TEXT_PREFIX)) {
      const index = Number(interaction.customId.slice(MODAL_EDIT_TEXT_PREFIX.length));
      const rawContent = interaction.fields.getTextInputValue(IDS.INPUT_TEXT);
      const content = resolveCustomEmojis(rawContent, interaction.guild);

      updateBlockAt(interaction.guildId, interaction.user.id, index, { type: 'text', content });

      // แก้เสร็จกลับไปแผงควบคุมปกติทันที เห็น preview ที่อัปเดตแล้ว
      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ----- modal แก้ไขรูป (customId มี index ฝังท้าย เช่น builder_modal_edit_image_2) -----
    if (interaction.customId.startsWith(MODAL_EDIT_IMAGE_PREFIX)) {
      const index = Number(interaction.customId.slice(MODAL_EDIT_IMAGE_PREFIX.length));
      const rawUrls = interaction.fields.getTextInputValue(IDS.INPUT_IMAGE_URLS);
      const result = parseGalleryUrlLines(rawUrls, t);

      if (!result.ok) {
        await interaction.reply({
          content: result.errorContent + t('builder.hint.retry_or_delete', { deleteButton: t('builder.block_action.button.delete') }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      updateBlockAt(interaction.guildId, interaction.user.id, index, {
        type: 'gallery',
        items: result.urls.map((url) => ({ url })),
      });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));

      // เช็คทุกลิงก์พร้อมกัน (ขนาน ไม่รอทีละอัน) แบบ soft-warning
      await warnIfImagesLookSuspicious(interaction, result.urls);
      return;
    }

    // ----- modal แก้ไขข้อความคู่รูปเล็ก (customId มี index ฝังท้าย เช่น builder_modal_edit_section_2) -----
    if (interaction.customId.startsWith(MODAL_EDIT_SECTION_PREFIX)) {
      const index = Number(interaction.customId.slice(MODAL_EDIT_SECTION_PREFIX.length));
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const thumbnail = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_THUMBNAIL).trim();

      try {
        validateUrl(thumbnail, t('builder.validation.thumbnail_label'), t);
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: t('builder.error.edit_failed', { error: friendlyMessage }) + t('builder.hint.retry_edit'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      updateBlockAt(interaction.guildId, interaction.user.id, index, { type: 'section', text, thumbnail });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      await warnIfImagesLookSuspicious(interaction, [thumbnail]);
      return;
    }

    // ----- modal แก้ไขข้อความคู่ปุ่มลิงก์ (customId มี index ฝังท้าย เช่น builder_modal_editsecbtn_2) -----
    if (interaction.customId.startsWith(MODAL_EDIT_SECTION_BUTTON_PREFIX)) {
      const index = Number(interaction.customId.slice(MODAL_EDIT_SECTION_BUTTON_PREFIX.length));
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_BUTTON_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const buttonLabel = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_BUTTON_LABEL).trim();
      const buttonUrl = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_BUTTON_URL).trim();

      try {
        validateHttpUrl(buttonUrl, t('builder.validation.button_link_label'), t);
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: t('builder.error.edit_failed', { error: friendlyMessage }) + t('builder.hint.retry_edit'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      updateBlockAt(interaction.guildId, interaction.user.id, index, { type: 'section_button', text, buttonLabel, buttonUrl });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ----- modal แก้ไขปุ่มยศ (customId มี index ฝังท้าย เช่น builder_modal_editsecrl_2) -----
    // แก้ได้เฉพาะ text / buttonLabel / buttonEmoji เท่านั้น
    // roleId และ buttonStyle ถูกคงไว้จาก block เดิม เพราะ modal ใส่ SelectMenu ไม่ได้
    if (interaction.customId.startsWith(MODAL_EDIT_SECTION_ROLE_PREFIX)) {
      const index = Number(interaction.customId.slice(MODAL_EDIT_SECTION_ROLE_PREFIX.length));
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_ROLE_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const buttonLabel = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_ROLE_LABEL).trim();

      const rawEmoji = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_ROLE_EMOJI).trim();
      const buttonEmoji = rawEmoji ? resolveCustomEmojis(rawEmoji, interaction.guild) : null;

      // ดึง roleId และ buttonStyle จาก block เดิมแล้วคงไว้
      const existingBlock = getBlockAt(interaction.guildId, interaction.user.id, index);
      updateBlockAt(interaction.guildId, interaction.user.id, index, {
        type: 'section_role_button',
        text,
        buttonLabel,
        buttonEmoji,
        roleId: existingBlock.roleId,
        buttonStyle: existingBlock.buttonStyle,
      });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }
    if (interaction.customId.startsWith(MODAL_INSERT_TEXT_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(MODAL_INSERT_TEXT_PREFIX.length));
      const rawContent = interaction.fields.getTextInputValue(IDS.INPUT_TEXT);
      const content = resolveCustomEmojis(rawContent, interaction.guild);

      insertBlockAt(interaction.guildId, interaction.user.id, insertPosition, { type: 'text', content });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ----- modal แทรกรูปใหม่ (customId มีตำแหน่งที่จะแทรกฝังท้าย) -----
    if (interaction.customId.startsWith(MODAL_INSERT_IMAGE_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(MODAL_INSERT_IMAGE_PREFIX.length));
      const rawUrls = interaction.fields.getTextInputValue(IDS.INPUT_IMAGE_URLS);
      const result = parseGalleryUrlLines(rawUrls, t);

      if (!result.ok) {
        await interaction.reply({
          content: result.errorContent + t('builder.hint.retry_button', { button: t('builder.block_action.button.insert') }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      insertBlockAt(interaction.guildId, interaction.user.id, insertPosition, {
        type: 'gallery',
        items: result.urls.map((url) => ({ url })),
      });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));

      // เช็ค content-type แบบ soft-warning หลังบันทึกแล้ว
      await warnIfImagesLookSuspicious(interaction, result.urls);
      return;
    }

    // ----- modal แทรกข้อความคู่รูปเล็กใหม่ (customId มีตำแหน่งที่จะแทรกฝังท้าย) -----
    if (interaction.customId.startsWith(MODAL_INSERT_SECTION_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(MODAL_INSERT_SECTION_PREFIX.length));
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const thumbnail = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_THUMBNAIL).trim();

      try {
        validateUrl(thumbnail, t('builder.validation.thumbnail_label'), t);
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: t('builder.error.insert_failed', { error: friendlyMessage }) +
            t('builder.hint.retry_button', { button: t('builder.block_action.button.insert') }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      insertBlockAt(interaction.guildId, interaction.user.id, insertPosition, { type: 'section', text, thumbnail });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      await warnIfImagesLookSuspicious(interaction, [thumbnail]);
      return;
    }

    // ----- modal แทรกข้อความคู่ปุ่มลิงก์ใหม่ (customId มีตำแหน่งที่จะแทรกฝังท้าย) -----
    if (interaction.customId.startsWith(MODAL_INSERT_SECTION_BUTTON_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(MODAL_INSERT_SECTION_BUTTON_PREFIX.length));
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_BUTTON_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const buttonLabel = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_BUTTON_LABEL).trim();
      const buttonUrl = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_BUTTON_URL).trim();

      try {
        validateHttpUrl(buttonUrl, t('builder.validation.button_link_label'), t);
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: t('builder.error.insert_failed', { error: friendlyMessage }) +
            t('builder.hint.retry_button', { button: t('builder.block_action.button.insert') }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      insertBlockAt(interaction.guildId, interaction.user.id, insertPosition, { type: 'section_button', text, buttonLabel, buttonUrl });

      await interaction.update(buildPanelPayload(interaction.user.id, interaction.guildId));
      return;
    }

    // ----- modal ขั้นที่ 1 ของ "ปุ่มยศ" (โหมดแทรก) — รับข้อความ + ป้ายปุ่ม + อิโมจิ แล้วเปิด select menu ยศ -----
    if (interaction.customId.startsWith(MODAL_INSERT_SECTION_ROLE_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(MODAL_INSERT_SECTION_ROLE_PREFIX.length));
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_ROLE_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const buttonLabel = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_ROLE_LABEL).trim();

      const rawEmoji = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_ROLE_EMOJI).trim();
      const buttonEmoji = rawEmoji ? resolveCustomEmojis(rawEmoji, interaction.guild) : null;

      // เก็บ insertPosition ไว้ใน pending เพื่อให้ ROLE_STYLE_PREFIX handler รู้ว่าต้องแทรกที่ไหน
      setPendingRoleButton(interaction.guildId, interaction.user.id, { text, buttonLabel, buttonEmoji, insertPosition });

      const { payload, assignableCount } = buildRoleSelectPayload(interaction.guild, t);

      if (assignableCount === 0) {
        clearPendingRoleButton(interaction.guildId, interaction.user.id);
        await interaction.reply({
          content: t('builder.role_button.no_roles'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.update(payload);
      return;
    }

    // ----- modal ขั้นที่ 1 ของ "ปุ่มลิงก์ช่อง" (โหมดแทรก) — รับข้อความ + ป้ายปุ่ม แล้วเปิด channel select -----
    if (interaction.customId.startsWith(MODAL_INSERT_SECTION_CHANNEL_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(MODAL_INSERT_SECTION_CHANNEL_PREFIX.length));
      const rawText = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_CHANNEL_TEXT);
      const text = resolveCustomEmojis(rawText, interaction.guild);
      const buttonLabel = interaction.fields.getTextInputValue(IDS.INPUT_SECTION_CHANNEL_LABEL).trim();

      // เก็บ insertPosition ไว้ใน pending เพื่อให้ CHANNEL_SELECT รู้ว่าต้องแทรกที่ตำแหน่งไหน
      setPendingChannelButton(interaction.guildId, interaction.user.id, { text, buttonLabel, insertPosition });
      await interaction.update(buildChannelSelectPayload(t));
      return;
    }
  },

  buildMainPanelComponents,
  buildPanelPayload,
};