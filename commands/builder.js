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
const { validateUrl, validateHttpUrl, buildMessageFromSchema } = require('../utils/buildMessageFromSchema');
const { resolveCustomEmojis } = require('../utils/resolveCustomEmojis');
const { checkImageUrlLooksValid } = require('../utils/checkImageUrl');

// ข้อความคำแนะนำที่โชว์ใต้ช่องกรอก URL รูปภาพทุกจุด (ใช้ LabelBuilder.setDescription ซึ่งอยู่ติดถาวร ไม่หายไปตอนพิมพ์)
const IMAGE_URL_HINT =
  'ลิงก์ต้องเป็นลิงก์รูปโดยตรง ลงท้ายด้วย .jpg .png .gif หรือ .webp ถ้าไม่แน่ใจ ใช้ /upload-image แทน';

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
  PREVIEW: 'builder_preview',
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

// เก็บข้อมูลการลบที่รอ confirm (userId → { guildId, name })
// ล้างทิ้งเมื่อกด ยืนยัน/ยกเลิก หรือ bot restart
const pendingDeletions = new Map();

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
 */
function buildMainPanelComponents() {
  // แถว 1: ปุ่มเพิ่ม block ทุกชนิด
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.ADD_TEXT)
      .setLabel('+ เพิ่มข้อความ')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(IDS.ADD_IMAGE)
      .setLabel('+ เพิ่มรูป')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(IDS.ADD_SECTION)
      .setLabel('+ เพิ่ม Section')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(IDS.ADD_SEPARATOR)
      .setLabel('+ เพิ่มเส้นคั่น')
      .setStyle(ButtonStyle.Secondary)
  );

  // แถว 2: ปุ่มจัดการ/ตั้งค่า/โพสต์
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.PREVIEW)
      .setLabel('ดูตัวอย่าง')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.MANAGE)
      .setLabel('📋 จัดการบล็อก')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.COLOR)
      .setLabel('🎨 เลือกสี')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.POST)
      .setLabel('โพสต์')
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
}

/**
 * สรุป block หนึ่งอันให้เป็นข้อความสั้นๆ สำหรับโชว์ใน select menu
 * คืนค่า { typeLabel, preview } เช่น { typeLabel: 'ข้อความ', preview: '# หัวข้อทดสอบ' }
 */
function describeBlock(block) {
  switch (block.type) {
    case 'text': {
      const firstLine = block.content.split('\n')[0] || '(ข้อความว่าง)';
      return { typeLabel: 'ข้อความ', preview: firstLine };
    }
    case 'gallery': {
      const count = block.items.length;
      if (count === 1) {
        const item = block.items[0];
        return { typeLabel: 'รูปภาพ', preview: item.description || item.url };
      }
      return { typeLabel: 'รูปภาพ', preview: `${count} รูป (เริ่มจาก ${block.items[0].url})` };
    }
    case 'separator': {
      const spacingLabel = block.spacing === 'large' ? 'ใหญ่' : 'เล็ก';
      return { typeLabel: 'เส้นคั่น', preview: `ระยะห่าง: ${spacingLabel}` };
    }
    case 'section': {
      const firstLine = block.text.split('\n')[0] || '(ข้อความว่าง)';
      return { typeLabel: 'ข้อความคู่รูปเล็ก', preview: firstLine };
    }
    case 'section_button': {
      const firstLine = block.text.split('\n')[0] || '(ข้อความว่าง)';
      return { typeLabel: 'ข้อความคู่ปุ่มลิงก์', preview: `${firstLine} (ปุ่ม: ${block.buttonLabel})` };
    }
    case 'section_role_button': {
      const firstLine = block.text.split('\n')[0] || '(ข้อความว่าง)';
      return { typeLabel: 'ข้อความคู่ปุ่มยศ', preview: `${firstLine} (ปุ่ม: ${block.buttonLabel})` };
    }
    case 'section_channel_button': {
      const firstLine = block.text.split('\n')[0] || '(ข้อความว่าง)';
      return { typeLabel: 'ข้อความคู่ปุ่มช่อง', preview: `${firstLine} (ปุ่ม: ${block.buttonLabel})` };
    }
    default:
      // ป้องกันไม่ให้คืน preview เป็น '' ซึ่ง StringSelectMenuBuilder จะปฏิเสธ
      // (Discord ต้องการ description ที่มีความยาว >= 1 หรือไม่มี field นั้นเลย)
      return { typeLabel: block.type, preview: '(ไม่มีข้อมูล)' };
  }
}

/**
 * ประกอบ "แผงควบคุม" ทั้งก้อน = ตัวอย่าง Layout ปัจจุบัน (ถ้ามี) + แถวปุ่มควบคุม
 * ทั้งหมดอยู่ในข้อความเดียวแบบ Components V2 เพื่อให้เห็นผลลัพธ์ real-time ทุกครั้งที่กดปุ่ม
 */
function buildPanelComponents(userId) {
  const draft = getDraft(userId);
  const session = getActiveSession(userId); // ใช้แสดงชื่อ draft ใน header
  const components = [];

  // header แสดงชื่อ draft ถ้ามี active session
  const draftLabel = session ? ` — **"${session.name}"**` : '';

  if (draft.blocks.length === 0) {
    // ยังไม่มีบล็อกเลย โชว์ข้อความบอกสถานะแทนตัวอย่าง
    components.push(
      new TextDisplayBuilder().setContent(
        `**🛠️ Layout Builder${draftLabel}**\nยังไม่มีบล็อกเลยค่ะ กดปุ่มด้านล่างเพื่อเริ่มสร้าง Layout`
      )
    );
  } else {
    // มีบล็อกแล้ว ใช้ buildMessageFromSchema() ตัวเดียวกับที่ใช้ตอนโพสต์จริง มาประกอบเป็นตัวอย่าง
    const preview = buildMessageFromSchema(draft);
    components.push(...preview.components);
  }

  components.push(...buildMainPanelComponents());

  return components;
}

/**
 * สร้าง payload เต็มสำหรับ reply/update แผงควบคุม ใช้ร่วมกันทุกจุดที่ต้องโชว์แผงควบคุม
 */
function buildPanelPayload(userId) {
  return {
    components: buildPanelComponents(userId),
    // ต้องรวม flag IsComponentsV2 ไว้เสมอ เพราะข้อความนี้ใช้ TextDisplay/Container แทน content ธรรมดา
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้างหน้าจอ "เลือกบล็อกที่จะจัดการ" (select menu) แสดงเมื่อกด 📋 จัดการบล็อก
 */
function buildManageSelectPayload(userId) {
  const draft = getDraft(userId);

  // select menu ของ Discord ใส่ตัวเลือกได้สูงสุด 25 อัน ถ้า block เกินนี้ ตัดให้เหลือ 25 อันแรกไปก่อน
  const blocksToShow = draft.blocks.slice(0, 25);

  const options = blocksToShow.map((block, index) => {
    const { typeLabel, preview } = describeBlock(block);
    const desc = preview.slice(0, 100);
    return {
      label: `บล็อกที่ ${index + 1} • ${typeLabel}`.slice(0, 100),
      // ใส่ description เฉพาะตอนที่มีค่าจริงเท่านั้น
      // Discord ไม่ยอมรับ description เป็น string ว่าง ('') ต้องการ length >= 1 หรือไม่มี field นั้นเลย
      ...(desc.length > 0 ? { description: desc } : {}),
      value: String(index),
    };
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(IDS.MANAGE_SELECT)
    .setPlaceholder('เลือกบล็อกที่ต้องการแก้ไขหรือลบ')
    .addOptions(options);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel('← กลับ')
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent('**📋 จัดการบล็อก**\nเลือกบล็อกที่ต้องการแก้ไขหรือลบจากรายการด้านล่าง'),
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
 */
function buildBlockActionPayload(index, block, totalBlocks) {
  const { typeLabel, preview } = describeBlock(block);

  const editButton = new ButtonBuilder()
    .setCustomId(`${MANAGE_EDIT_PREFIX}${index}`)
    .setLabel('แก้ไข')
    .setStyle(ButtonStyle.Primary);

  const deleteButton = new ButtonBuilder()
    .setCustomId(`${MANAGE_DELETE_PREFIX}${index}`)
    .setLabel('ลบ')
    .setStyle(ButtonStyle.Danger);

  const insertButton = new ButtonBuilder()
    .setCustomId(`${INSERT_PREFIX}${index}`)
    .setLabel('+ แทรกบล็อกใหม่หลังจากนี้')
    .setStyle(ButtonStyle.Secondary);

  const moveUpButton = new ButtonBuilder()
    .setCustomId(`${MOVE_UP_PREFIX}${index}`)
    .setLabel('⬆️ ย้ายขึ้น')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index === 0); // อยู่บนสุดแล้ว ย้ายขึ้นต่อไม่ได้

  const moveDownButton = new ButtonBuilder()
    .setCustomId(`${MOVE_DOWN_PREFIX}${index}`)
    .setLabel('⬇️ ย้ายลง')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index === totalBlocks - 1); // อยู่ล่างสุดแล้ว ย้ายลงต่อไม่ได้

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel('← กลับ')
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(
        `**บล็อกที่ ${index + 1} • ${typeLabel}**\n${preview}\n\nต้องการทำอะไรกับบล็อกนี้คะ?`
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
 */
function buildInsertTypePayload(insertPosition) {
  const textButton = new ButtonBuilder()
    .setCustomId(`${INSERT_TEXT_PREFIX}${insertPosition}`)
    .setLabel('+ เพิ่มข้อความ')
    .setStyle(ButtonStyle.Primary);

  const imageButton = new ButtonBuilder()
    .setCustomId(`${INSERT_IMAGE_PREFIX}${insertPosition}`)
    .setLabel('+ เพิ่มรูป')
    .setStyle(ButtonStyle.Primary);

  const sectionButton = new ButtonBuilder()
    .setCustomId(`${INSERT_SECTION_PREFIX}${insertPosition}`)
    .setLabel('+ เพิ่ม Section')
    .setStyle(ButtonStyle.Primary);

  const separatorButton = new ButtonBuilder()
    .setCustomId(`${INSERT_SEPARATOR_PREFIX}${insertPosition}`)
    .setLabel('+ เพิ่มเส้นคั่น')
    .setStyle(ButtonStyle.Secondary);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel('← กลับ')
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(
        `**+ แทรกบล็อกใหม่**\nเลือกชนิดบล็อกที่จะแทรกเข้าตำแหน่งที่ ${insertPosition + 1}`
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
 */
function buildColorSelectPayload() {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(IDS.COLOR_SELECT)
    .setPlaceholder('เลือกสีธีม')
    .addOptions(
      ...PRESET_COLORS.map((color) => ({
        label: color.label,
        value: color.hex,
        description: color.hex,
      })),
      {
        label: '🖌️ กำหนดเอง',
        value: CUSTOM_COLOR_VALUE,
        description: 'พิมพ์ hex code เอง เช่น #FF66AA',
      }
    );

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel('← กลับ')
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(
        '**🎨 เลือกสีธีม**\nเลือกสีแถบด้านข้างของ Layout จากตัวเลือกด้านล่าง หรือกำหนดเองก็ได้'
      ),
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
 */
function buildSectionModal(customId, title, prefill = {}) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const textInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_TEXT)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('ข้อความตรงนี้ (รองรับ markdown)')
    .setRequired(true)
    .setMaxLength(4000);
  if (prefill.text) textInput.setValue(prefill.text);

  const textLabel = new LabelBuilder()
    .setLabel('ข้อความ (รองรับ markdown)')
    .setTextInputComponent(textInput);

  const thumbnailInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_THUMBNAIL)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://example.com/thumbnail.png')
    .setRequired(true)
    .setMaxLength(500);
  if (prefill.thumbnail) thumbnailInput.setValue(prefill.thumbnail);

  const thumbnailLabel = new LabelBuilder()
    .setLabel('ลิงก์รูปเล็ก (thumbnail)')
    .setDescription(IMAGE_URL_HINT)
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
 */
function buildSectionChoicePayload(thumbnailCustomId, buttonCustomId, roleCustomId, channelCustomId) {
  const thumbnailButton = new ButtonBuilder()
    .setCustomId(thumbnailCustomId)
    .setLabel('🖼️ รูปเล็ก')
    .setStyle(ButtonStyle.Primary);

  const buttonButton = new ButtonBuilder()
    .setCustomId(buttonCustomId)
    .setLabel('🔘 ปุ่มลิงก์')
    .setStyle(ButtonStyle.Primary);

  const roleButton = new ButtonBuilder()
    .setCustomId(roleCustomId)
    .setLabel('🎭 ปุ่มยศ')
    .setStyle(ButtonStyle.Primary);

  const channelButton = new ButtonBuilder()
    .setCustomId(channelCustomId)
    .setLabel('📢 ปุ่มลิงก์ช่อง')
    .setStyle(ButtonStyle.Primary);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel('← กลับ')
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent('**+ เพิ่ม Section**\nเลือกว่าจะให้ Section นี้คู่กับอะไร'),
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
 */
function buildSectionChannelModal(customId, title, prefill = {}) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const textInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_CHANNEL_TEXT)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('ข้อความตรงนี้ (รองรับ markdown)')
    .setRequired(true)
    .setMaxLength(4000);
  if (prefill.text) textInput.setValue(prefill.text);

  const textLabel = new LabelBuilder()
    .setLabel('ข้อความ (รองรับ markdown)')
    .setTextInputComponent(textInput);

  const labelInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_CHANNEL_LABEL)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น 📢 ไปที่ห้องประกาศ')
    .setRequired(true)
    .setMaxLength(80);
  if (prefill.buttonLabel) labelInput.setValue(prefill.buttonLabel);

  const labelLabel = new LabelBuilder()
    .setLabel('ป้ายชื่อปุ่ม')
    .setTextInputComponent(labelInput);

  modal.addLabelComponents(textLabel, labelLabel);
  return modal;
}

/**
 * สร้างหน้าจอ "เลือกช่อง" (ขั้นที่ 2 ของ flow ปุ่มลิงก์ช่อง)
 * แสดง ChannelSelectMenuBuilder ที่ filter เฉพาะ text/announcement channel เท่านั้น
 * (เพราะช่องประเภทอื่น เช่น voice/forum ลิงก์แบบนี้ไม่สมเหตุสมผล)
 */
function buildChannelSelectPayload() {
  const selectMenu = new ChannelSelectMenuBuilder()
    .setCustomId(IDS.CHANNEL_SELECT)
    .setPlaceholder('เลือกช่องที่ต้องการลิงก์ไป')
    // filter เฉพาะ text channel (0) และ announcement channel (5)
    // ChannelType.GuildText = 0, ChannelType.GuildAnnouncement = 5
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel('← กลับ (ยกเลิก)')
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(
        '**📢 เลือกช่อง**\nเลือกช่องที่ต้องการให้ปุ่มลิงก์ไปค่ะ\n*(แสดงเฉพาะ text channel และ announcement channel)*'
      ),
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
 */
function buildSectionButtonModal(customId, title, prefill = {}) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const textInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_BUTTON_TEXT)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('ข้อความตรงนี้ (รองรับ markdown)')
    .setRequired(true)
    .setMaxLength(4000);
  if (prefill.text) textInput.setValue(prefill.text);

  const textLabel = new LabelBuilder()
    .setLabel('ข้อความ (รองรับ markdown)')
    .setTextInputComponent(textInput);

  const buttonLabelInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_BUTTON_LABEL)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เข้าร่วม Discord')
    .setRequired(true)
    .setMaxLength(80); // ขีดจำกัดของ label ปุ่มฝั่ง Discord
  if (prefill.buttonLabel) buttonLabelInput.setValue(prefill.buttonLabel);

  const buttonLabelLabel = new LabelBuilder()
    .setLabel('ข้อความบนปุ่ม')
    .setTextInputComponent(buttonLabelInput);

  const buttonUrlInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_BUTTON_URL)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://discord.gg/example')
    .setRequired(true)
    .setMaxLength(500);
  if (prefill.buttonUrl) buttonUrlInput.setValue(prefill.buttonUrl);

  const buttonUrlLabel = new LabelBuilder()
    .setLabel('ลิงก์ปุ่ม (ต้องขึ้นต้น http:// หรือ https://)')
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
 */
function buildSectionRoleModal(customId, title, prefill = {}) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const textInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_ROLE_TEXT)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('ข้อความตรงนี้ (รองรับ markdown) เช่น "กดเพื่อรับยศสมาชิก"')
    .setRequired(true)
    .setMaxLength(4000);
  if (prefill.text) textInput.setValue(prefill.text);

  const textLabel = new LabelBuilder()
    .setLabel('ข้อความ (รองรับ markdown)')
    .setTextInputComponent(textInput);

  const labelInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_ROLE_LABEL)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('รับยศ')
    .setRequired(true)
    .setMaxLength(80); // ขีดจำกัด label ปุ่มฝั่ง Discord
  if (prefill.buttonLabel) labelInput.setValue(prefill.buttonLabel);

  const labelLabel = new LabelBuilder()
    .setLabel('ป้ายชื่อปุ่ม')
    .setTextInputComponent(labelInput);

  // อิโมจิบนปุ่ม — optional ผู้ใช้ไม่ต้องใส่ก็ได้
  // รับได้ทั้ง unicode emoji (เช่น 🎭) และ custom emoji shortcode (เช่น :mail_1:)
  // :ชื่อ: จะถูกแปลงเป็น <:ชื่อ:id> ก่อนบันทึก ผ่าน resolveCustomEmojis()
  const emojiInput = new TextInputBuilder()
    .setCustomId(IDS.INPUT_SECTION_ROLE_EMOJI)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น 🎭 หรือ :ชื่อ_custom_emoji: (เว้นว่างได้)')
    .setRequired(false)
    .setMaxLength(100);
  if (prefill.buttonEmoji) emojiInput.setValue(prefill.buttonEmoji);

  const emojiLabel = new LabelBuilder()
    .setLabel('อิโมจิบนปุ่ม (optional)')
    .setDescription('ใส่ unicode emoji หรือ :ชื่อ: ของ custom emoji ถ้าไม่ต้องการเว้นว่างไว้ได้เลย')
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
 * @returns {{ payload: object|null, assignableCount: number }}
 */
function buildRoleSelectPayload(guild) {
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
    .setPlaceholder('เลือกยศ')
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
    .setLabel('← กลับ (ยกเลิก)')
    .setStyle(ButtonStyle.Secondary);

  return {
    payload: {
      components: [
        new TextDisplayBuilder().setContent(
          '**🎭 เลือกยศ**\nเลือกยศที่ต้องการให้ปุ่มนี้ toggle ให้/ถอด\n*(แสดงเฉพาะยศที่บอทจัดการได้)*'
        ),
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
 */
function buildRoleStylePayload() {
  // ปุ่มแต่ละอันใช้ style ของตัวเองในการแสดงผล ผู้ใช้กดอันไหน = เลือกสีนั้น
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
    .setLabel('← กลับ (ยกเลิก)')
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(
        '**🎨 เลือกสีปุ่ม (3/3)**\nกดปุ่มเพื่อเลือกสีที่ต้องการค่ะ ปุ่มแต่ละอันแสดงสีจริงให้เห็นก่อนเลือกเลย'
      ),
      new ActionRowBuilder().addComponents(primaryBtn, secondaryBtn, successBtn, dangerBtn),
      new ActionRowBuilder().addComponents(backButton),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * สร้างหน้าจอ "เลือกช่องปลายทาง" แสดงเมื่อกดปุ่ม "โพสต์"
 * filter เฉพาะ GuildText และ GuildAnnouncement เหมือน buildChannelSelectPayload()
 */
function buildPostChannelSelectPayload() {
  const selectMenu = new ChannelSelectMenuBuilder()
    .setCustomId(IDS.POST_CHANNEL_SELECT)
    .setPlaceholder('เลือกช่องที่ต้องการโพสต์')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  const backButton = new ButtonBuilder()
    .setCustomId(IDS.MANAGE_BACK)
    .setLabel('← ยกเลิก')
    .setStyle(ButtonStyle.Secondary);

  return {
    components: [
      new TextDisplayBuilder().setContent(
        '**📤 เลือกช่องปลายทาง**\nจะโพสต์ข้อความนี้ไปที่ช่องไหนดีคะ?\n*(แสดงเฉพาะ text channel และ announcement channel)*'
      ),
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
 * @returns {{ ok: true, urls: string[] } | { ok: false, errorContent: string }}
 */
function parseGalleryUrlLines(rawText) {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { ok: false, errorContent: '⚠️ ต้องมีลิงก์อย่างน้อย 1 รายการค่ะ' };
  }

  // เช็คทุกบรรทัดให้ครบก่อน ถ้ามีอันไหนผิดรูปแบบ ไม่บันทึกอะไรเลยสักบรรทัด (กันข้อมูลครึ่งๆ กลางๆ)
  const invalidLineMessages = [];
  lines.forEach((url, lineIndex) => {
    try {
      validateUrl(url, `บรรทัดที่ ${lineIndex + 1}`);
    } catch (error) {
      invalidLineMessages.push(error.message.replace(/^buildMessageFromSchema:\s*/, ''));
    }
  });

  if (invalidLineMessages.length > 0) {
    return {
      ok: false,
      errorContent:
        `❌ พบลิงก์ที่ผิดรูปแบบ:\n` + invalidLineMessages.map((message) => `• ${message}`).join('\n'),
    };
  }

  return { ok: true, urls: lines };
}

/**
 * สร้าง payload สำหรับ /builder list — แสดงรายชื่อ named draft ในกิลด์
 * ถ้ามี query จะกรองเฉพาะชื่อที่มีคำนั้น (case-insensitive) แล้วอัปเดต header บอกจำนวน
 * @param {string} guildId
 * @param {string|null} query - คำค้นหา (null = แสดงทั้งหมด)
 * @returns {object} payload พร้อมส่งเข้า interaction.reply() หรือ interaction.update()
 */
function buildListPayload(guildId, query = null) {
  const allDrafts = listGuildDrafts(guildId);

  // ─── ไม่มี builder เลย ───
  if (allDrafts.length === 0) {
    return {
      components: [
        new TextDisplayBuilder().setContent(
          '**📋 Builder ในเซิร์ฟเวอร์นี้**\n\nยังไม่มี builder เลยค่ะ\nใช้ `/builder new [ชื่อ]` เพื่อสร้างใหม่'
        ),
      ],
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
    headerLine = `**📋 Builder ในเซิร์ฟเวอร์นี้** — แสดง **${filtered.length}** จาก ${allDrafts.length} รายการ (ค้นหา: "${normalizedQuery}")`;
  } else {
    headerLine = `**📋 Builder ในเซิร์ฟเวอร์นี้** (${allDrafts.length} รายการ)`;
  }

  // ─── รายการ ───
  let bodyText;
  if (filtered.length === 0) {
    bodyText = `\n\nไม่พบ builder ที่ชื่อมีคำว่า "${normalizedQuery}" ค่ะ`;
  } else {
    const lines = filtered.map((d, i) => {
      const ts = toDiscordTimestamp(d.updatedAt);
      return `**${i + 1}. ${d.name}** — ${d.blockCount} บล็อก — แก้ล่าสุด ${ts} โดย <@${d.updatedBy}>`;
    });
    bodyText = '\n\n' + lines.join('\n');
  }

  const components = [new TextDisplayBuilder().setContent(headerLine + bodyText)];

  // ─── select menu (แสดงเฉพาะตอนมีผลลัพธ์) ───
  if (filtered.length > 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(IDS.LIST_SELECT)
      .setPlaceholder('เลือก builder ที่ต้องการเปิดแก้ไข')
      .addOptions(
        filtered.slice(0, 25).map((d) => ({
          label: d.name.slice(0, 100),
          description: `${d.blockCount} บล็อก`.slice(0, 100),
          value: d.name,
        }))
      );
    components.push(new ActionRowBuilder().addComponents(selectMenu));
  }

  // ─── ปุ่ม 🔍 ค้นหา + ← รีเซ็ต (ถ้ากำลังกรองอยู่) ───
  const searchBtn = new ButtonBuilder()
    .setCustomId(IDS.LIST_SEARCH)
    .setLabel('🔍 ค้นหา')
    .setStyle(ButtonStyle.Secondary);

  const btnRow = new ActionRowBuilder().addComponents(searchBtn);

  if (normalizedQuery) {
    btnRow.addComponents(
      new ButtonBuilder()
        .setCustomId(IDS.LIST_RESET)
        .setLabel('← รีเซ็ต')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  components.push(btnRow);
  components.push(
    new TextDisplayBuilder().setContent('`/builder delete [ชื่อ]` — ลบ builder ที่ไม่ต้องการ')
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

  const list = suspiciousUrls.map((url) => `• ${url}`).join('\n');
  await interaction.followUp({
    content: `⚠️ ลิงก์นี้อาจมีปัญหา แนะนำให้ตรวจสอบอีกครั้งหรือใช้ /upload-image แทนนะคะ:\n${list}`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  IDS, // export ไว้ให้ index.js เอาไปเช็ค prefix ของ customId

  data: new SlashCommandBuilder()
    .setName('builder')
    .setDescription('สร้างและจัดการ Layout ของข้อความ Discord')
    .addSubcommand((sub) =>
      sub
        .setName('new')
        .setDescription('สร้าง builder ใหม่พร้อมตั้งชื่อ')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('ชื่อ builder (สูงสุด 50 ตัวอักษร)')
            .setRequired(true)
            .setMaxLength(50)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('เปิด builder เก่ากลับมาแก้ต่อ')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('ชื่อ builder')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('แสดงรายชื่อ builder ทั้งหมดในเซิร์ฟเวอร์นี้')
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('ลบ builder ออกจากเซิร์ฟเวอร์')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('ชื่อ builder ที่ต้องการลบ')
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

    if (!sub) {
      await interaction.reply(buildListPayload(guildId));
      return;
    }

    // ----- /builder new [name] -----
    if (sub === 'new') {
      const rawName = interaction.options.getString('name').trim();

      if (!rawName) {
        return interaction.reply({ content: '❌ ชื่อต้องไม่ว่างค่ะ', flags: MessageFlags.Ephemeral });
      }

      if (namedDraftExists(guildId, rawName)) {
        return interaction.reply({
          content:
            `⚠️ มี builder ชื่อ **"${rawName}"** อยู่แล้วในเซิร์ฟเวอร์นี้ค่ะ\n` +
            `ถ้าต้องการแก้ต่อ ใช้ \`/builder edit "${rawName}"\` ได้เลย\n` +
            `ถ้าต้องการสร้างใหม่จริงๆ ให้ใช้ชื่ออื่นแทนนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
      }

      createNamedDraft(guildId, rawName, userId); // สร้าง + เริ่ม session
      await interaction.reply(buildPanelPayload(userId));
      return;
    }

    // ----- /builder edit [name] -----
    if (sub === 'edit') {
      const name = interaction.options.getString('name').trim();

      if (!namedDraftExists(guildId, name)) {
        return interaction.reply({
          content:
            `❌ ไม่พบ builder ชื่อ **"${name}"** ในเซิร์ฟเวอร์นี้ค่ะ\n` +
            `ใช้ \`/builder list\` เพื่อดูรายชื่อ builder ทั้งหมด`,
          flags: MessageFlags.Ephemeral,
        });
      }

      openNamedDraft(guildId, name, userId); // โหลด + เริ่ม session
      await interaction.reply(buildPanelPayload(userId));
      return;
    }

    // ----- /builder list -----
    if (sub === 'list') {
      await interaction.reply(buildListPayload(guildId));
      return;
    }

    // ----- /builder delete [name] -----
    if (sub === 'delete') {
      const name = interaction.options.getString('name').trim();

      if (!namedDraftExists(guildId, name)) {
        return interaction.reply({
          content: `❌ ไม่พบ builder ชื่อ **"${name}"** ในเซิร์ฟเวอร์นี้ค่ะ`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // เก็บ pending deletion แล้วแสดงปุ่ม confirm/cancel
      pendingDeletions.set(userId, { guildId, name });

      const confirmBtn = new ButtonBuilder()
        .setCustomId(IDS.DELETE_CONFIRM)
        .setLabel('✅ ยืนยัน ลบ')
        .setStyle(ButtonStyle.Danger);

      const cancelBtn = new ButtonBuilder()
        .setCustomId(IDS.DELETE_CANCEL)
        .setLabel('❌ ยกเลิก')
        .setStyle(ButtonStyle.Secondary);

      await interaction.reply({
        components: [
          new TextDisplayBuilder().setContent(
            `⚠️ **ยืนยันการลบ**\nต้องการลบ builder **"${name}"** จริงๆ ไหมคะ?\nลบแล้วจะไม่สามารถกู้คืนได้ค่ะ`
          ),
          new ActionRowBuilder().addComponents(confirmBtn, cancelBtn),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }
  },

  // ----- เมื่อกดปุ่มใดๆ ที่ขึ้นต้นด้วย builder_ -----
  async handleButton(interaction) {
    // ปุ่ม "แก้ไข"/"ลบ" มี index ฝังท้าย customId (เช่น builder_manage_edit_2) เช็คก่อน switch ปกติ
    if (interaction.customId.startsWith(MANAGE_EDIT_PREFIX)) {
      const index = Number(interaction.customId.slice(MANAGE_EDIT_PREFIX.length));
      const block = getBlockAt(interaction.user.id, index);

      if (!block) {
        // เผื่อกรณีบล็อกถูกลบไปแล้วจากที่อื่นก่อนกดปุ่มนี้ทัน
        await interaction.reply({
          content: '⚠️ บล็อกนี้ไม่มีอยู่แล้วค่ะ (อาจถูกลบหรือแก้ไปก่อนหน้านี้)',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (block.type === 'separator') {
        // separator ไม่มีข้อมูลให้พิมพ์ แค่สลับ small/large ทันทีแล้วกลับแผงควบคุมเลย ไม่ต้องเปิด modal
        const newSpacing = block.spacing === 'large' ? 'small' : 'large';
        updateBlockAt(interaction.user.id, index, { type: 'separator', spacing: newSpacing });
        await interaction.update(buildPanelPayload(interaction.user.id));
        return;
      }

      if (block.type === 'text') {
        const modal = new ModalBuilder()
          .setCustomId(`${MODAL_EDIT_TEXT_PREFIX}${index}`)
          .setTitle('แก้ไขข้อความ');

        const textInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_TEXT)
          .setLabel('เนื้อหา (รองรับ markdown)')
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
          .setTitle('แก้ไขรูป (หลายลิงก์)');

        const urlsInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_IMAGE_URLS)
          .setStyle(TextInputStyle.Paragraph)
          .setValue(block.items.map((item) => item.url).join('\n')) // pre-fill ลิงก์เดิมทุกอัน คนละบรรทัด
          .setPlaceholder('https://example.com/1.png\nhttps://example.com/2.png')
          .setRequired(true)
          .setMaxLength(4000);

        const urlsLabel = new LabelBuilder()
          .setLabel('ลิงก์รูปภาพ (1 บรรทัดต่อ 1 ลิงก์)')
          .setDescription(IMAGE_URL_HINT)
          .setTextInputComponent(urlsInput);

        modal.addLabelComponents(urlsLabel);
        await interaction.showModal(modal);
        return;
      }

      if (block.type === 'section') {
        const modal = buildSectionModal(`${MODAL_EDIT_SECTION_PREFIX}${index}`, 'แก้ไขข้อความคู่รูปเล็ก', {
          text: block.text,
          thumbnail: block.thumbnail,
        });
        await interaction.showModal(modal);
        return;
      }

      if (block.type === 'section_button') {
        const modal = buildSectionButtonModal(
          `${MODAL_EDIT_SECTION_BUTTON_PREFIX}${index}`,
          'แก้ไขข้อความคู่ปุ่มลิงก์',
          { text: block.text, buttonLabel: block.buttonLabel, buttonUrl: block.buttonUrl }
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
          'แก้ไขข้อความคู่ปุ่มช่อง',
          { text: block.text, buttonLabel: block.buttonLabel }
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
          'แก้ไขปุ่มยศ',
          {
            text: block.text,
            buttonLabel: block.buttonLabel,
            // buttonEmoji อาจเป็น null, '<:name:id>', หรือ '🎭'
            // ส่งเป็น string ไปให้ modal pre-fill ได้เลย (ถ้า null ส่ง '' แทนเพื่อให้ช่องว่าง)
            buttonEmoji: block.buttonEmoji || '',
          }
        );
        await interaction.showModal(modal);
        return;
      }

      return; // เผื่ออนาคตมี block type อื่นที่ยังไม่รองรับการแก้ไข
    }

    if (interaction.customId.startsWith(MANAGE_DELETE_PREFIX)) {
      const index = Number(interaction.customId.slice(MANAGE_DELETE_PREFIX.length));
      removeBlockAt(interaction.user.id, index);
      // ลบเสร็จกลับไปแผงควบคุมปกติทันที เห็น preview ที่อัปเดตแล้ว
      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    // ----- กด "⬆️ ย้ายขึ้น" -----
    if (interaction.customId.startsWith(MOVE_UP_PREFIX)) {
      const index = Number(interaction.customId.slice(MOVE_UP_PREFIX.length));

      if (index === 0) {
        // ปกติปุ่มจะ disabled ไปแล้วตั้งแต่ฝั่ง UI แต่กันไว้อีกชั้นเผื่อกดทันก่อน UI อัปเดต
        await interaction.reply({ content: '⚠️ บล็อกนี้อยู่บนสุดแล้วค่ะ', flags: MessageFlags.Ephemeral });
        return;
      }

      const newIndex = index - 1;
      swapBlocks(interaction.user.id, index, newIndex);

      // โชว์หน้าจอเดิมต่อ แต่อ้างอิงตำแหน่งใหม่ของบล็อกที่เพิ่งย้าย เพื่อกดย้ายต่อเนื่องได้เลยโดยไม่ต้องกลับไปเลือกใหม่
      const block = getBlockAt(interaction.user.id, newIndex);
      const totalBlocks = getDraft(interaction.user.id).blocks.length;
      await interaction.update(buildBlockActionPayload(newIndex, block, totalBlocks));
      return;
    }

    // ----- กด "⬇️ ย้ายลง" -----
    if (interaction.customId.startsWith(MOVE_DOWN_PREFIX)) {
      const index = Number(interaction.customId.slice(MOVE_DOWN_PREFIX.length));
      const totalBlocks = getDraft(interaction.user.id).blocks.length;

      if (index === totalBlocks - 1) {
        await interaction.reply({ content: '⚠️ บล็อกนี้อยู่ล่างสุดแล้วค่ะ', flags: MessageFlags.Ephemeral });
        return;
      }

      const newIndex = index + 1;
      swapBlocks(interaction.user.id, index, newIndex);

      const block = getBlockAt(interaction.user.id, newIndex);
      await interaction.update(buildBlockActionPayload(newIndex, block, totalBlocks));
      return;
    }

    // ----- กด "+ แทรกบล็อกใหม่หลังจากนี้" -> โชว์หน้าจอเลือกชนิดบล็อก -----
    if (interaction.customId.startsWith(INSERT_PREFIX)) {
      const selectedIndex = Number(interaction.customId.slice(INSERT_PREFIX.length));
      const insertPosition = selectedIndex + 1; // แทรก "หลังจาก" บล็อกที่เลือก = ตำแหน่ง index+1
      await interaction.update(buildInsertTypePayload(insertPosition));
      return;
    }

    // ----- เลือก "เส้นคั่น" จากหน้าจอแทรกบล็อก -> แทรกทันทีไม่ต้องเปิด modal -----
    if (interaction.customId.startsWith(INSERT_SEPARATOR_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SEPARATOR_PREFIX.length));
      insertBlockAt(interaction.user.id, insertPosition, { type: 'separator', spacing: 'small' });
      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    // ----- เลือก "ข้อความ" จากหน้าจอแทรกบล็อก -> เปิด modal (เหมือนปุ่ม + เพิ่มข้อความ หลัก) -----
    if (interaction.customId.startsWith(INSERT_TEXT_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_TEXT_PREFIX.length));
      const modal = new ModalBuilder()
        .setCustomId(`${MODAL_INSERT_TEXT_PREFIX}${insertPosition}`)
        .setTitle('แทรกข้อความใหม่');

      const textInput = new TextInputBuilder()
        .setCustomId(IDS.INPUT_TEXT)
        .setLabel('เนื้อหา (รองรับ markdown)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('# หัวข้อ\nเนื้อหาตรงนี้...')
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
        .setTitle('แทรกรูปใหม่ (ใส่ได้หลายลิงก์)');

      const urlsInput = new TextInputBuilder()
        .setCustomId(IDS.INPUT_IMAGE_URLS)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('https://example.com/1.png\nhttps://example.com/2.png')
        .setRequired(true)
        .setMaxLength(4000);

      const urlsLabel = new LabelBuilder()
        .setLabel('ลิงก์รูปภาพ (1 บรรทัดต่อ 1 ลิงก์)')
        .setDescription(IMAGE_URL_HINT)
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
          `${INSERT_SECTION_CHANNEL_PREFIX}${insertPosition}`
        )
      );
      return;
    }

    // ----- เลือกตัวเลือกย่อย "🖼️ รูปเล็ก" ตอนแทรก -> เปิด modal (เหมือนปุ่มหลัก) -----
    if (interaction.customId.startsWith(INSERT_SECTION_THUMBNAIL_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SECTION_THUMBNAIL_PREFIX.length));
      const modal = buildSectionModal(`${MODAL_INSERT_SECTION_PREFIX}${insertPosition}`, 'แทรกข้อความคู่รูปเล็ก');
      await interaction.showModal(modal);
      return;
    }

    // ----- เลือกตัวเลือกย่อย "🔘 ปุ่มลิงก์" ตอนแทรก -> เปิด modal (เหมือนปุ่มหลัก) -----
    if (interaction.customId.startsWith(INSERT_SECTION_BUTTON_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SECTION_BUTTON_PREFIX.length));
      const modal = buildSectionButtonModal(
        `${MODAL_INSERT_SECTION_BUTTON_PREFIX}${insertPosition}`,
        'แทรกข้อความคู่ปุ่มลิงก์'
      );
      await interaction.showModal(modal);
      return;
    }

    // ----- เลือกตัวเลือกย่อย "🎭 ปุ่มยศ" ตอนแทรก -> เปิด modal ขั้นที่ 1 -----
    if (interaction.customId.startsWith(INSERT_SECTION_ROLE_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SECTION_ROLE_PREFIX.length));
      const modal = buildSectionRoleModal(
        `${MODAL_INSERT_SECTION_ROLE_PREFIX}${insertPosition}`,
        'แทรกปุ่มยศ (1/3)'
      );
      await interaction.showModal(modal);
      return;
    }

    // ----- เลือก "📢 ปุ่มลิงก์ช่อง" จากหน้าจอแทรกบล็อก -> เปิด modal ขั้นที่ 1 -----
    if (interaction.customId.startsWith(INSERT_SECTION_CHANNEL_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(INSERT_SECTION_CHANNEL_PREFIX.length));
      const modal = buildSectionChannelModal(
        `${MODAL_INSERT_SECTION_CHANNEL_PREFIX}${insertPosition}`,
        'แทรกปุ่มลิงก์ช่อง (1/2)'
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
      const pending = getPendingRoleButton(interaction.user.id);

      if (!pending || !pending.roleId) {
        // pending หมดอายุ (เช่น bot restart ระหว่างขั้น 2→3) กลับแผงควบคุมเฉยๆ
        await interaction.update(buildPanelPayload(interaction.user.id));
        return;
      }

      clearPendingRoleButton(interaction.user.id);

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
        insertBlockAt(interaction.user.id, pending.insertPosition, block);
      } else {
        addBlock(interaction.user.id, block);
      }

      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    switch (interaction.customId) {
      case IDS.ADD_TEXT: {
        const modal = new ModalBuilder()
          .setCustomId(IDS.MODAL_TEXT)
          .setTitle('เพิ่มข้อความ');

        const textInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_TEXT)
          .setLabel('เนื้อหา (รองรับ markdown)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('# หัวข้อ\nเนื้อหาตรงนี้...')
          .setRequired(true)
          .setMaxLength(4000);

        modal.addComponents(new ActionRowBuilder().addComponents(textInput));

        await interaction.showModal(modal);
        break;
      }

      case IDS.ADD_IMAGE: {
        const modal = new ModalBuilder()
          .setCustomId(IDS.MODAL_IMAGE)
          .setTitle('เพิ่มรูป (ใส่ได้หลายลิงก์)');

        const urlsInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_IMAGE_URLS)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('https://example.com/1.png\nhttps://example.com/2.png')
          .setRequired(true)
          .setMaxLength(4000);

        const urlsLabel = new LabelBuilder()
          .setLabel('ลิงก์รูปภาพ (1 บรรทัดต่อ 1 ลิงก์)')
          .setDescription(IMAGE_URL_HINT)
          .setTextInputComponent(urlsInput);

        modal.addLabelComponents(urlsLabel);

        await interaction.showModal(modal);
        break;
      }

      case IDS.ADD_SECTION: {
        await interaction.update(
          buildSectionChoicePayload(IDS.ADD_SECTION_THUMBNAIL, IDS.ADD_SECTION_BUTTON, IDS.ADD_SECTION_ROLE, IDS.ADD_SECTION_CHANNEL)
        );
        break;
      }

      case IDS.ADD_SECTION_THUMBNAIL: {
        const modal = buildSectionModal(IDS.MODAL_SECTION, 'เพิ่มข้อความคู่รูปเล็ก');
        await interaction.showModal(modal);
        break;
      }

      case IDS.ADD_SECTION_BUTTON: {
        const modal = buildSectionButtonModal(IDS.MODAL_SECTION_BUTTON, 'เพิ่มข้อความคู่ปุ่มลิงก์');
        await interaction.showModal(modal);
        break;
      }

      case IDS.ADD_SECTION_ROLE: {
        // ขั้นที่ 1: เปิด modal รับข้อความ + ป้ายปุ่ม + อิโมจิ (optional)
        const modal = buildSectionRoleModal(IDS.MODAL_SECTION_ROLE, 'เพิ่มปุ่มยศ (1/3)');
        await interaction.showModal(modal);
        break;
      }

      case IDS.ADD_SECTION_CHANNEL: {
        // ขั้นที่ 1: เปิด modal รับข้อความ + ป้ายปุ่ม (ยังไม่เลือกช่อง)
        // ต่างจาก section_button ตรงที่ไม่มีช่อง URL ให้พิมพ์ เพราะ URL จะ generate จากช่องที่เลือกในขั้นที่ 2
        const sectionChannelModal = buildSectionChannelModal(IDS.MODAL_SECTION_CHANNEL, 'เพิ่มปุ่มลิงก์ช่อง (1/2)');
        await interaction.showModal(sectionChannelModal);
        break;
      }

      case IDS.ADD_SEPARATOR: {
        // ไม่ต้องเปิด modal เพราะ separator ไม่มีข้อมูลให้ผู้ใช้กรอกเลย
        addBlock(interaction.user.id, { type: 'separator', spacing: 'small' });

        // ปุ่มธรรมดา (ไม่ใช่ modal) ต้องใช้ .update() ตรงๆ ได้เลย ไม่ต้องผ่าน showModal ก่อน
        await interaction.update(buildPanelPayload(interaction.user.id));
        break;
      }

      case IDS.PREVIEW: {
        const draft = getDraft(interaction.user.id);

        // กันกรณีกดดูตัวอย่างทั้งที่ยังไม่มีบล็อกเลย (Discord ไม่ยอมรับ Container ว่างเปล่า)
        if (draft.blocks.length === 0) {
          await interaction.reply({
            content: '⚠️ ยังไม่มีบล็อกเลยค่ะ ลองกด "+ เพิ่มข้อความ", "+ เพิ่มรูป" หรือ "+ เพิ่มเส้นคั่น" เพิ่มอะไรสักอย่างก่อนนะคะ',
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        try {
          const preview = buildMessageFromSchema(draft);

          // ข้อความ Components V2 ใส่ content คู่กับ components ในข้อความเดียวกันไม่ได้
          // เลยส่งแยกเป็น 2 ข้อความ: บอกก่อนว่านี่คือตัวอย่าง แล้วตามด้วยตัวอย่างจริง
          await interaction.reply({
            content: '🔍 ตัวอย่างด้านล่างนี้ค่ะ (เห็นแค่หนูคนเดียว ยังไม่ได้โพสต์จริง)',
            flags: MessageFlags.Ephemeral,
          });
          await interaction.followUp({
            ...preview,
            flags: preview.flags | MessageFlags.Ephemeral, // รวม flag IsComponentsV2 + Ephemeral เข้าด้วยกัน
          });
        } catch (error) {
          const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
          await interaction.reply({
            content: `❌ แสดงตัวอย่างไม่สำเร็จ: ${friendlyMessage}`,
            flags: MessageFlags.Ephemeral,
          });
        }
        break;
      }

      case IDS.MANAGE: {
        const draft = getDraft(interaction.user.id);

        if (draft.blocks.length === 0) {
          await interaction.reply({
            content: '⚠️ ยังไม่มีบล็อกให้จัดการเลยค่ะ ลองเพิ่มบล็อกก่อนนะคะ',
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        await interaction.update(buildManageSelectPayload(interaction.user.id));
        break;
      }

      case IDS.MANAGE_BACK: {
        // กลับไปแผงควบคุมปกติ ไม่มีการเปลี่ยนแปลงข้อมูลอะไร
        await interaction.update(buildPanelPayload(interaction.user.id));
        break;
      }

      case IDS.COLOR: {
        await interaction.update(buildColorSelectPayload());
        break;
      }

      case IDS.DELETE_CONFIRM: {
        const pending = pendingDeletions.get(interaction.user.id);
        pendingDeletions.delete(interaction.user.id); // ล้างทิ้งไม่ว่าจะเจอหรือไม่

        if (!pending) {
          // pending หมดอายุ (เช่น bot restart ระหว่างรอ confirm)
          await interaction.update({
            components: [
              new TextDisplayBuilder().setContent(
                '⚠️ ข้อมูลการลบหมดอายุแล้วค่ะ (อาจเกิดจาก bot restart)\nลองใช้ `/builder delete [ชื่อ]` ใหม่อีกครั้งนะคะ'
              ),
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
                ? `✅ ลบ builder **"${pending.name}"** สำเร็จแล้วค่ะ`
                : `⚠️ หา builder "${pending.name}" ไม่เจอ (อาจถูกลบไปแล้ว)`
            ),
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        break;
      }

      case IDS.DELETE_CANCEL: {
        const pending = pendingDeletions.get(interaction.user.id);
        pendingDeletions.delete(interaction.user.id);

        await interaction.update({
          components: [
            new TextDisplayBuilder().setContent(
              `❌ ยกเลิกการลบ **"${pending?.name ?? 'builder'}"** แล้วค่ะ`
            ),
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        break;
      }

      case IDS.LIST_SEARCH: {
        // เปิด modal ให้ผู้ใช้พิมพ์คำค้นหา
        const modal = new ModalBuilder()
          .setCustomId(IDS.MODAL_LIST_SEARCH)
          .setTitle('🔍 ค้นหา builder');

        const searchInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_LIST_SEARCH)
          .setLabel('พิมพ์ชื่อหรือส่วนของชื่อ builder')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('เช่น rules, welcome, ประกาศ')
          .setRequired(true)
          .setMaxLength(50);

        modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
        await interaction.showModal(modal);
        break;
      }

      case IDS.LIST_RESET: {
        // ล้างตัวกรอง → แสดงรายการทั้งหมด
        await interaction.update(buildListPayload(interaction.guildId));
        break;
      }

      case IDS.POST: {
        const draft = getDraft(interaction.user.id);

        // draft ว่าง → แจ้งเตือนแบบ ephemeral ไม่ต้องเปิด channel picker
        if (draft.blocks.length === 0) {
          await interaction.reply({
            content: '⚠️ ยังไม่มีบล็อกเลยค่ะ ลองเพิ่มบล็อกก่อนแล้วค่อยกดโพสต์นะคะ',
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        // มีบล็อก → เปิดหน้าจอเลือกช่องปลายทาง
        await interaction.update(buildPostChannelSelectPayload());
        break;
      }
    }
  },

  // ----- เมื่อเลือกจาก select menu ใดๆ ที่ขึ้นต้นด้วย builder_ -----
  async handleSelectMenu(interaction) {
    if (interaction.customId === IDS.MANAGE_SELECT) {
      const index = Number(interaction.values[0]); // ค่าที่เลือกคือ index ของ block (string ต้องแปลงเป็นตัวเลข)
      const block = getBlockAt(interaction.user.id, index);

      if (!block) {
        // เผื่อกรณีหายากมาก: เลือกจาก list เก่าที่ block ถูกลบไปแล้วพอดี
        await interaction.update(buildPanelPayload(interaction.user.id));
        return;
      }

      const totalBlocks = getDraft(interaction.user.id).blocks.length;
      await interaction.update(buildBlockActionPayload(index, block, totalBlocks));
      return;
    }

    if (interaction.customId === IDS.COLOR_SELECT) {
      const selectedValue = interaction.values[0];

      if (selectedValue === CUSTOM_COLOR_VALUE) {
        // เลือก "กำหนดเอง" -> เปิด modal ให้พิมพ์ hex code เอง
        const modal = new ModalBuilder()
          .setCustomId(IDS.MODAL_COLOR_CUSTOM)
          .setTitle('กำหนดสีเอง');

        const hexInput = new TextInputBuilder()
          .setCustomId(IDS.INPUT_COLOR_HEX)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('#FF66AA')
          .setRequired(true)
          .setMaxLength(7);

        const hexLabel = new LabelBuilder()
          .setLabel('Hex code (รูปแบบ #RRGGBB)')
          .setTextInputComponent(hexInput);

        modal.addLabelComponents(hexLabel);
        await interaction.showModal(modal);
        return;
      }

      // เป็นสีสำเร็จรูป (ตัวเลือกจะส่งค่ามาเป็น hex อยู่แล้ว) -> บันทึกแล้วกลับไปแผงควบคุมทันที
      setAccentColor(interaction.user.id, selectedValue);
      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    // ----- เลือกยศจาก select menu (ขั้นที่ 2 ของ flow ปุ่มยศ) -----
    if (interaction.customId === IDS.ROLE_SELECT) {
      const roleId = interaction.values[0];
      const pending = getPendingRoleButton(interaction.user.id);

      if (!pending) {
        // pending หมดอายุ (เช่น bot restart ระหว่างขั้น 1→2) กลับแผงควบคุมเฉยๆ
        await interaction.update(buildPanelPayload(interaction.user.id));
        return;
      }

      // อัปเดต pending ให้เพิ่ม roleId เข้าไป แล้วเปลี่ยนหน้าจอเป็นขั้นที่ 3 (เลือกสีปุ่ม)
      // ยังไม่ clearPendingRoleButton() เพราะขั้นที่ 3 (ROLE_STYLE_PREFIX handler) ต้องใช้ข้อมูลนี้อยู่
      setPendingRoleButton(interaction.user.id, { ...pending, roleId });
      await interaction.update(buildRoleStylePayload());
      return;
    }

    // ----- เลือก draft จาก /builder list (StringSelectMenu) → เปิดแผง builder -----
    if (interaction.customId === IDS.LIST_SELECT) {
      const name = interaction.values[0];
      const guildId = interaction.guildId;

      if (!namedDraftExists(guildId, name)) {
        await interaction.reply({
          content: `❌ ไม่พบ builder ชื่อ **"${name}"** แล้วค่ะ (อาจถูกลบไปแล้ว)\nใช้ /builder list เพื่อดูรายชื่อล่าสุด`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      openNamedDraft(guildId, name, interaction.user.id);
      // update ทับ list panel → เปิด builder panel แทน
      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    if (interaction.customId === IDS.CHANNEL_SELECT) {
      // ขั้นที่ 2: ผู้ใช้เลือกช่องแล้ว — ดึง pending state ที่เก็บไว้จากขั้นที่ 1
      const channelId = interaction.values[0];
      const pending = getPendingChannelButton(interaction.user.id);

      if (!pending) {
        // pending หมดอายุ (เช่น bot restart ระหว่างขั้น 1→2) กลับแผงควบคุมเฉยๆ
        await interaction.update(buildPanelPayload(interaction.user.id));
        return;
      }

      clearPendingChannelButton(interaction.user.id);

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
        insertBlockAt(interaction.user.id, pending.insertPosition, block);
      } else {
        addBlock(interaction.user.id, block);
      }

      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    // ----- เลือกช่องปลายทางสำหรับโพสต์ (flow ของปุ่ม "โพสต์") -----
    if (interaction.customId === IDS.POST_CHANNEL_SELECT) {
      const channelId = interaction.values[0];
      const draft = getDraft(interaction.user.id);

      // เช็คอีกครั้งเผื่อ draft ถูกล้างจากที่อื่น (edge case มาก แต่กันไว้)
      if (draft.blocks.length === 0) {
        await interaction.update(buildPanelPayload(interaction.user.id));
        return;
      }

      // validate schema ก่อนส่งจริง — ถ้า schema เสียหายอยากรู้ก่อนที่จะยิงออกไป
      let messagePayload;
      try {
        messagePayload = buildMessageFromSchema(draft);
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: `❌ โพสต์ไม่สำเร็จค่ะ: ${friendlyMessage}`,
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
          content: '❌ หาช่องที่เลือกไม่เจอค่ะ ลองกด "โพสต์" แล้วเลือกช่องใหม่อีกครั้งนะคะ',
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
          content: `❌ ส่งข้อความเข้าช่องนั้นไม่สำเร็จค่ะ บอทอาจไม่มีสิทธิ์ "Send Messages" ในช่องนั้น\nลองแจ้งแอดมินให้ตรวจสอบสิทธิ์ของบอทในช่องนั้นด้วยนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // โพสต์สำเร็จ — ล้าง draft, รีเซ็ตแผง, แจ้ง user พร้อม jump link
      clearDraft(interaction.user.id);
      await interaction.update(buildPanelPayload(interaction.user.id));
      await interaction.followUp({
        // [text](url) ใน ephemeral message จะ render เป็น hyperlink ให้กดได้เลย
        content: `✅ โพสต์สำเร็จแล้วค่ะ! [กดเพื่อไปดูข้อความ](${postedMessage.url})`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  },
  async handleModalSubmit(interaction) {
    // ----- modal ค้นหา builder (จากปุ่ม 🔍 ในหน้า list) -----
    if (interaction.customId === IDS.MODAL_LIST_SEARCH) {
      const query = interaction.fields.getTextInputValue(IDS.INPUT_LIST_SEARCH).trim();
      // อัปเดตหน้า list เดิมให้แสดงเฉพาะ builder ที่ชื่อ contains คำนั้น
      await interaction.update(buildListPayload(interaction.guildId, query || null));
      return;
    }

    if (interaction.customId === IDS.MODAL_COLOR_CUSTOM) {
      const rawHex = interaction.fields.getTextInputValue(IDS.INPUT_COLOR_HEX).trim();

      // เช็ครูปแบบ #RRGGBB ให้ครบ (# ตามด้วยเลขฐาน 16 หกหลักเป๊ะ)
      const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(rawHex);

      if (!isValidHex) {
        await interaction.reply({
          content: `❌ รูปแบบสีไม่ถูกต้องค่ะ ต้องเป็น #RRGGBB เช่น #FF66AA (ได้รับ: "${rawHex}")\n\nลองกด "🎨 เลือกสี" แล้วเลือก "🖌️ กำหนดเอง" ใหม่อีกครั้งนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      setAccentColor(interaction.user.id, rawHex);
      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    if (interaction.customId === IDS.MODAL_TEXT) {
      const rawContent = interaction.fields.getTextInputValue(IDS.INPUT_TEXT);
      const content = resolveCustomEmojis(rawContent, interaction.guild);

      addBlock(interaction.user.id, { type: 'text', content });

      // .update() จะแก้ไขข้อความแผงควบคุมเดิม (ข้อความที่มีปุ่มอยู่) แทนที่จะส่งข้อความใหม่ซ้อนขึ้นมาเรื่อยๆ
      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    if (interaction.customId === IDS.MODAL_IMAGE) {
      const rawUrls = interaction.fields.getTextInputValue(IDS.INPUT_IMAGE_URLS);
      const result = parseGalleryUrlLines(rawUrls);

      if (!result.ok) {
        // ลิงก์ผิดรูปแบบหรือไม่มีลิงก์เลย — ไม่เก็บลง draft, ตอบกลับอธิบายสาเหตุแบบ ephemeral (ไม่แตะแผงควบคุมเดิม)
        await interaction.reply({
          content: `${result.errorContent}\n\nลองกด "+ เพิ่มรูป" แล้วใส่ลิงก์ใหม่อีกครั้งนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      addBlock(interaction.user.id, {
        type: 'gallery',
        items: result.urls.map((url) => ({ url })),
      });

      await interaction.update(buildPanelPayload(interaction.user.id));

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
        validateUrl(thumbnail, 'ลิงก์รูปเล็ก');
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: `❌ เพิ่มไม่สำเร็จ: ${friendlyMessage}\n\nลองกด "+ เพิ่ม Section" แล้วใส่ลิงก์ใหม่อีกครั้งนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      addBlock(interaction.user.id, { type: 'section', text, thumbnail });

      await interaction.update(buildPanelPayload(interaction.user.id));
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
        validateHttpUrl(buttonUrl, 'ลิงก์ปุ่ม');
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: `❌ เพิ่มไม่สำเร็จ: ${friendlyMessage}\n\nลองกด "+ เพิ่ม Section" แล้วใส่ลิงก์ใหม่อีกครั้งนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      addBlock(interaction.user.id, { type: 'section_button', text, buttonLabel, buttonUrl });

      // ลิงก์ปุ่มไม่ใช่ลิงก์รูป เลยไม่ต้องเช็ค HEAD request แบบ image content-type
      await interaction.update(buildPanelPayload(interaction.user.id));
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
      setPendingRoleButton(interaction.user.id, { text, buttonLabel, buttonEmoji, insertPosition: null });

      const { payload, assignableCount } = buildRoleSelectPayload(interaction.guild);

      if (assignableCount === 0) {
        clearPendingRoleButton(interaction.user.id);
        await interaction.reply({
          content: '❌ ไม่มียศที่บอทสามารถจัดการได้ในเซิร์ฟเวอร์นี้ค่ะ ติดต่อแอดมินให้ตรวจสอบสิทธิ์และตำแหน่งยศของบอทด้วยนะคะ',
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
      setPendingChannelButton(interaction.user.id, { text, buttonLabel, insertPosition: null });
      await interaction.update(buildChannelSelectPayload());
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
      const existingBlock = getBlockAt(interaction.user.id, index);
      updateBlockAt(interaction.user.id, index, {
        type: 'section_channel_button',
        text,
        buttonLabel,
        buttonUrl: existingBlock.buttonUrl, // คง URL เดิมไว้
      });

      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    // ----- modal แก้ไขข้อความ (customId มี index ฝังท้าย เช่น builder_modal_edit_text_2) -----
    if (interaction.customId.startsWith(MODAL_EDIT_TEXT_PREFIX)) {
      const index = Number(interaction.customId.slice(MODAL_EDIT_TEXT_PREFIX.length));
      const rawContent = interaction.fields.getTextInputValue(IDS.INPUT_TEXT);
      const content = resolveCustomEmojis(rawContent, interaction.guild);

      updateBlockAt(interaction.user.id, index, { type: 'text', content });

      // แก้เสร็จกลับไปแผงควบคุมปกติทันที เห็น preview ที่อัปเดตแล้ว
      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    // ----- modal แก้ไขรูป (customId มี index ฝังท้าย เช่น builder_modal_edit_image_2) -----
    if (interaction.customId.startsWith(MODAL_EDIT_IMAGE_PREFIX)) {
      const index = Number(interaction.customId.slice(MODAL_EDIT_IMAGE_PREFIX.length));
      const rawUrls = interaction.fields.getTextInputValue(IDS.INPUT_IMAGE_URLS);
      const result = parseGalleryUrlLines(rawUrls);

      if (!result.ok) {
        await interaction.reply({
          content: `${result.errorContent}\n\nถ้าต้องการลบบล็อกนี้ทั้งหมด ให้กลับไปกดปุ่ม "ลบ" แทนนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      updateBlockAt(interaction.user.id, index, {
        type: 'gallery',
        items: result.urls.map((url) => ({ url })),
      });

      await interaction.update(buildPanelPayload(interaction.user.id));

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
        validateUrl(thumbnail, 'ลิงก์รูปเล็ก');
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: `❌ แก้ไขไม่สำเร็จ: ${friendlyMessage}\n\nลองกดแก้ไขแล้วใส่ลิงก์ใหม่อีกครั้งนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      updateBlockAt(interaction.user.id, index, { type: 'section', text, thumbnail });

      await interaction.update(buildPanelPayload(interaction.user.id));
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
        validateHttpUrl(buttonUrl, 'ลิงก์ปุ่ม');
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: `❌ แก้ไขไม่สำเร็จ: ${friendlyMessage}\n\nลองกดแก้ไขแล้วใส่ลิงก์ใหม่อีกครั้งนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      updateBlockAt(interaction.user.id, index, { type: 'section_button', text, buttonLabel, buttonUrl });

      await interaction.update(buildPanelPayload(interaction.user.id));
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
      const existingBlock = getBlockAt(interaction.user.id, index);
      updateBlockAt(interaction.user.id, index, {
        type: 'section_role_button',
        text,
        buttonLabel,
        buttonEmoji,
        roleId: existingBlock.roleId,
        buttonStyle: existingBlock.buttonStyle,
      });

      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }
    if (interaction.customId.startsWith(MODAL_INSERT_TEXT_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(MODAL_INSERT_TEXT_PREFIX.length));
      const rawContent = interaction.fields.getTextInputValue(IDS.INPUT_TEXT);
      const content = resolveCustomEmojis(rawContent, interaction.guild);

      insertBlockAt(interaction.user.id, insertPosition, { type: 'text', content });

      await interaction.update(buildPanelPayload(interaction.user.id));
      return;
    }

    // ----- modal แทรกรูปใหม่ (customId มีตำแหน่งที่จะแทรกฝังท้าย) -----
    if (interaction.customId.startsWith(MODAL_INSERT_IMAGE_PREFIX)) {
      const insertPosition = Number(interaction.customId.slice(MODAL_INSERT_IMAGE_PREFIX.length));
      const rawUrls = interaction.fields.getTextInputValue(IDS.INPUT_IMAGE_URLS);
      const result = parseGalleryUrlLines(rawUrls);

      if (!result.ok) {
        await interaction.reply({
          content: `${result.errorContent}\n\nลองกด "+ แทรกบล็อกใหม่หลังจากนี้" แล้วใส่ลิงก์ใหม่อีกครั้งนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      insertBlockAt(interaction.user.id, insertPosition, {
        type: 'gallery',
        items: result.urls.map((url) => ({ url })),
      });

      await interaction.update(buildPanelPayload(interaction.user.id));

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
        validateUrl(thumbnail, 'ลิงก์รูปเล็ก');
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: `❌ แทรกไม่สำเร็จ: ${friendlyMessage}\n\nลองกด "+ แทรกบล็อกใหม่หลังจากนี้" แล้วใส่ลิงก์ใหม่อีกครั้งนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      insertBlockAt(interaction.user.id, insertPosition, { type: 'section', text, thumbnail });

      await interaction.update(buildPanelPayload(interaction.user.id));
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
        validateHttpUrl(buttonUrl, 'ลิงก์ปุ่ม');
      } catch (error) {
        const friendlyMessage = error.message.replace(/^buildMessageFromSchema:\s*/, '');
        await interaction.reply({
          content: `❌ แทรกไม่สำเร็จ: ${friendlyMessage}\n\nลองกด "+ แทรกบล็อกใหม่หลังจากนี้" แล้วใส่ลิงก์ใหม่อีกครั้งนะคะ`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      insertBlockAt(interaction.user.id, insertPosition, { type: 'section_button', text, buttonLabel, buttonUrl });

      await interaction.update(buildPanelPayload(interaction.user.id));
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
      setPendingRoleButton(interaction.user.id, { text, buttonLabel, buttonEmoji, insertPosition });

      const { payload, assignableCount } = buildRoleSelectPayload(interaction.guild);

      if (assignableCount === 0) {
        clearPendingRoleButton(interaction.user.id);
        await interaction.reply({
          content: '❌ ไม่มียศที่บอทสามารถจัดการได้ในเซิร์ฟเวอร์นี้ค่ะ ติดต่อแอดมินให้ตรวจสอบสิทธิ์และตำแหน่งยศของบอทด้วยนะคะ',
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
      setPendingChannelButton(interaction.user.id, { text, buttonLabel, insertPosition });
      await interaction.update(buildChannelSelectPayload());
      return;
    }
  },

  buildMainPanelComponents,
  buildPanelPayload,
};