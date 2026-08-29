/**
 * /role-setup — role assignment system (Phase 1: menu type)
 *
 * Editor panel:
 *   Row 1: + ข้อความ | + รูป | + Section | + เส้นคั่น | 🎨 สี
 *   Row 2: ➕ เพิ่มยศ | 🗑️ ยศ(N) | ⚙️ ตั้งค่า | 📋 จัดการบล็อก | ✅ เสร็จแล้ว
 *
 * DONE flow: เสร็จ → ChannelSelectMenu → (ถ้าเคยโพสต์แล้ว: confirm) → โพสต์เลย
 */

const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  TextDisplayBuilder, MessageFlags, ChannelType, PermissionFlagsBits,
} = require('discord.js');

const { buildMessageFromSchema, validateUrl } = require('../utils/buildMessageFromSchema');
const { checkImageUrlLooksValid }             = require('../utils/checkImageUrl');
const { resolveCustomEmojis }                 = require('../utils/resolveCustomEmojis');
const { setupExists, loadSetup, saveSetup, deleteSetup, listSetups } = require('../utils/roleSetupStorage');
const { getGuildLanguage } = require('../utils/languageStorage');
const { createTranslator } = require('../utils/i18n');
const { isPremiumGuild }   = require('../utils/tierManager');
const { buildUpgradeMessage } = require('../utils/premiumGate');

// ─── In-memory state ─────────────────────────────────────────────────────────
//
// 🔑 ทุก Map ข้างล่างนี้ (sessions, pendingRoles, pendingDeletions,
// pendingButtonAdd, pendingReactionAdd) ใช้ key ผสม `${guildId}_${userId}`
// ไม่ใช่ userId เดี่ยวๆ เหมือนเดิม
//
// เหตุผล: ถ้า key เป็น userId เดี่ยวๆ แอดมินคนเดียวกันที่เปิด /role-setup
// ค้างไว้ในเซิร์ฟ A (ยังไม่กด "เสร็จแล้ว") แล้วสลับไปเปิด /role-setup ใน
// เซิร์ฟ B ก่อน จะทำให้ session/pending state ของเซิร์ฟ B ไปทับของเซิร์ฟ A
// ในหน่วยความจำทันที (เพราะ userId เดียวกัน) พอกลับไปกดปุ่มที่ panel ค้าง
// ของเซิร์ฟ A ระบบจะเผลอบันทึกข้อมูลของเซิร์ฟ B ลงไฟล์การตั้งค่าของเซิร์ฟ A
// แทน (cross-guild data corruption) — เป็นบัคเงียบ ไม่มี error โผล่ให้เห็นเลย
//
// แก้โดยผูก key กับทั้ง guildId และ userId พร้อมกัน (Discord ID เป็นตัวเลข
// ล้วน ใช้ underscore คั่นได้ปลอดภัย ไม่มีทางชนกัน) แต่ละเซิร์ฟจะมี session/
// pending state แยกกันเด็ดขาด ต่อให้ user คนเดียวกันเปิดพร้อมกันหลายเซิร์ฟ
// ก็ไม่ชนกันอีกต่อไป
//
// sessions: key (guildId_userId) → { name, guildId, isEdit, pendingChannelId }
const sessions         = new Map();
const pendingRoles     = new Map(); // key (guildId_userId) → { guildId, name, roleId, roleName }
const pendingDeletions = new Map(); // key (guildId_userId) → { guildId, name }
// button type: เก็บข้อมูลระหว่าง 3 ขั้น (modal → เลือกสี → เลือกยศ)
// editIndex: null = กำลังเพิ่มปุ่มใหม่ / number = กำลังแก้ไขปุ่มที่ config.buttons[editIndex]
const pendingButtonAdd   = new Map(); // key (guildId_userId) → { guildId, name, label, emoji, style, editIndex }
// reaction type: เก็บข้อมูลระหว่าง 2 ขั้น (modal emoji → เลือกยศ)
// editIndex: null = กำลังเพิ่ม reaction ใหม่ / number = กำลังแก้ไข reaction ที่ config.reactions[editIndex]
const pendingReactionAdd = new Map(); // key (guildId_userId) → { guildId, name, emoji, editIndex }
// messageId ของ preview messages ที่กำลัง active — ใช้กัน reaction handler สร้างยศจริงระหว่างทดสอบ
// เอา messageId ออกเมื่อข้อความถูกลบ (ลบด้วยปุ่มหรือ timeout 60 วิ)
// (ไม่ต้องแก้ — key เป็น messageId ไม่ใช่ userId ไม่เกี่ยวกับบัค cross-guild เลย)
const previewMessageIds  = new Set();

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

// ─── Custom IDs (static) ────────────────────────────────────────────────────
const RS = {
  // layout
  ADD_TEXT: 'rs_add_text', ADD_IMAGE: 'rs_add_image',
  ADD_SECTION: 'rs_add_section', ADD_SEP: 'rs_add_sep',
  COLOR: 'rs_color', COLOR_SELECT: 'rs_color_sel', COLOR_BACK: 'rs_color_back',
  // layout modals
  MODAL_TEXT: 'rs_modal_text',       INPUT_TEXT: 'rs_input_text',
  MODAL_IMAGE: 'rs_modal_image',     INPUT_IMAGE: 'rs_input_image',
  MODAL_COLOR: 'rs_modal_color',     INPUT_COLOR: 'rs_input_color',
  MODAL_SECTION: 'rs_modal_section',
  INPUT_SEC_TEXT: 'rs_input_sec_t',  INPUT_SEC_IMG: 'rs_input_sec_i',
  // block management
  MANAGE_BLOCKS: 'rs_manage', MANAGE_SELECT: 'rs_manage_sel', MANAGE_BACK: 'rs_manage_back',
  PREVIEW: 'rs_preview',      // ปุ่ม "ดูตัวอย่าง" ใน editor panel
  // roles (menu type)
  ADD_ROLE_BTN: 'rs_add_role_btn', ADD_ROLE_SELECT: 'rs_add_role_sel',
  ADD_ROLE_BACK: 'rs_add_role_back',
  MANAGE_ROLES: 'rs_manage_roles',
  ROLE_REMOVE: 'rs_role_remove', ROLE_BACK: 'rs_role_back',
  MODAL_ROLE_DESC: 'rs_modal_role_desc', INPUT_ROLE_DESC: 'rs_input_role_desc',
  // buttons (button type) — flow 3 ขั้น: modal(label+emoji) → เลือกสี → เลือกยศ
  ADD_BTN_BTN: 'rs_add_btn',                 // ปุ่ม "➕ เพิ่มปุ่ม" ในแผงควบคุม
  MODAL_BTN: 'rs_modal_btn',                 // modal ขั้นที่ 1 (ใช้ทั้งเพิ่ม/แก้ไข ต่าง customId ตอน edit จะมี prefix INDEX)
  BTN_INPUT_LABEL: 'rs_input_btn_l', BTN_INPUT_EMOJI: 'rs_input_btn_e',
  BTN_COLOR_PRIM: 'rs_btnc_prim', BTN_COLOR_SEC: 'rs_btnc_sec',   // ขั้นที่ 2: เลือกสี
  BTN_COLOR_SUCC: 'rs_btnc_succ', BTN_COLOR_DANG: 'rs_btnc_dang',
  BTN_COLOR_BACK: 'rs_btnc_back',
  BTN_ROLE_SEL: 'rs_btn_role_sel', BTN_ROLE_BACK: 'rs_btn_role_bk', // ขั้นที่ 3: เลือกยศ
  // จัดการปุ่ม: list → เลือก 1 ปุ่ม → แก้ไข/ลบ
  MANAGE_BTNS: 'rs_btns_manage',              // ปุ่ม "⚙️ จัดการปุ่ม" ในแผงควบคุม
  BTN_MANAGE_SELECT: 'rs_btns_sel',           // select menu เลือกปุ่ม (single)
  BTN_MANAGE_BACK: 'rs_btns_back',            // กลับจากหน้า list ไป editor
  BTN_ACTION_BACK: 'rs_btna_back',            // กลับจากหน้า action (แก้ไข/ลบ) ไป list
  // จำนวนยศสูงสุด
  MAX_ROLES: 'rs_max_roles',                  // ปุ่ม "🔢 จำนวนยศ" ในแผงควบคุม
  MAX_ROLES_SELECT: 'rs_max_roles_sel',       // select menu เลือก 1/2/3/ไม่จำกัด
  // config
  CONFIG: 'rs_config', MODAL_CONFIG: 'rs_modal_config',
  INPUT_MIN: 'rs_input_min', INPUT_MAX: 'rs_input_max', INPUT_PH: 'rs_input_ph',
  // done → post flow
  DONE: 'rs_done',
  DONE_CHAN_SEL: 'rs_done_chan',   // ChannelSelectMenu หลังกด DONE
  // 📝 POST_CONFIRM / POST_CANCEL (ขั้นตอน "ยืนยันโพสต์ซ้ำ") ถูกลบออกแล้ว —
  // ตอนนี้เลือกช่องจาก DONE_CHAN_SEL แล้วโพสต์ทันทีเสมอ ไม่มีขั้นยืนยันคั่นกลางอีกต่อไป
  // delete
  DEL_CONFIRM: 'rs_del_confirm',   // ยืนยันลบ setup
  DEL_CANCEL:  'rs_del_cancel',    // ยกเลิกการลบ
  // reaction type — flow 2 ขั้น: modal(emoji) → เลือกยศ
  ADD_REACTION:       'rs_add_rxn',       // ปุ่ม "➕ เพิ่ม Reaction" ในแผงควบคุม
  MODAL_REACTION:     'rs_modal_rxn',     // modal ใส่ emoji
  RXN_INPUT_EMOJI:    'rs_input_rxn_e',   // field emoji ใน modal
  RXN_ROLE_SEL:       'rs_rxn_role_sel',  // StringSelectMenu เลือกยศ
  RXN_ROLE_BACK:      'rs_rxn_role_bk',   // ยกเลิกก่อนเลือกยศ
  MANAGE_REACTIONS:   'rs_rxns_manage',   // ปุ่ม "⚙️ จัดการ Reaction"
  RXN_MANAGE_SELECT:  'rs_rxns_sel',      // select menu รายการ reaction
  RXN_MANAGE_BACK:    'rs_rxns_back',     // กลับจาก list ไป editor
  RXN_ACTION_BACK:    'rs_rxna_back',     // กลับจาก action panel ไป list
};

// ─── Prefix patterns สำหรับ customId ที่มี index/position ─────────────────
const PFX = {
  EDIT:   'rs_medit_',       // แก้ไขบล็อก_{index}
  DEL:    'rs_mdel_',        // ลบบล็อก_{index}
  UP:     'rs_mup_',         // ขึ้น_{index}
  DOWN:   'rs_mdown_',       // ลง_{index}
  INSERT: 'rs_mins_',        // เปิดหน้าแทรกหลัง_{index}
  INS_T:  'rs_ins_t_',       // แทรกข้อความที่_{position}
  INS_I:  'rs_ins_i_',       // แทรกรูปที่_{position}
  INS_SEC:'rs_ins_sec_',     // แทรก section ที่_{position}
  INS_S:  'rs_ins_s_',       // แทรกเส้นคั่นที่_{position}
  E_TEXT: 'rs_modal_etext_', // modal แก้ไข text_{index}
  E_IMG:  'rs_modal_eimg_',  // modal แก้ไข image_{index}
  E_SEC:  'rs_modal_esec_',  // modal แก้ไข section_{index}
  I_TEXT: 'rs_modal_itext_', // modal แทรก text_{position}
  I_IMG:  'rs_modal_iimg_',  // modal แทรก image_{position}
  I_SEC:  'rs_modal_isec_',  // modal แทรก section_{position}
  // จัดการปุ่ม (button type): หลังเลือกจาก list — แก้ไข/ลบ ตาม index ของ config.buttons[]
  BTN_ACTION_EDIT: 'rs_btna_edit_', // ปุ่ม "แก้ไข" บนหน้า action_{index}
  BTN_ACTION_DEL:  'rs_btna_del_',  // ปุ่ม "ลบ" บนหน้า action_{index}
  MODAL_EDIT_BTN:  'rs_modal_ebtn_', // modal แก้ไขปุ่ม (pre-filled)_{index}
  // จัดการ reaction (reaction type): หลังเลือกจาก list — แก้ไข/ลบ ตาม index ของ config.reactions[]
  RXN_ACTION_EDIT: 'rs_rxna_edit_',   // ปุ่ม "แก้ไข" บนหน้า action_{index}
  RXN_ACTION_DEL:  'rs_rxna_del_',    // ปุ่ม "ลบ" บนหน้า action_{index}
  MODAL_EDIT_RXN:  'rs_modal_erxn_',  // modal แก้ไข emoji (pre-filled)_{index}
  // ปุ่มลบ preview message (reaction type) — customId มี messageId ต่อท้าย
  // วางก่อน session guard เพราะปุ่มนี้อยู่บน public message ไม่ต้องการ session
  PREVIEW_DEL: 'rs_pdel_', // rs_pdel_{messageId}
};

const SETUP_PREFIX = 'rolesetup:';
// ค่าพิเศษในขั้นเลือกยศ (edit mode) — แทนการเลือกยศใหม่ ให้คงยศเดิมไว้
// ใช้ string ที่ไม่ใช่ Discord snowflake เพื่อกัน collision กับ roleId จริง
const KEEP_ROLE_VALUE = '__keep__';

const PRESET_COLORS = [
  { label: '🌿 Sage Green',  hex: '#9CAF88' },
  { label: '🤍 Ivory Cream', hex: '#FFF8E7' },
  { label: '🌸 Soft Pink',   hex: '#FADADD' },
  { label: '🌤️ Sky Blue',   hex: '#87CEEB' },
  { label: '💜 Lavender',    hex: '#C3B1E1' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toTs(iso) { return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:R>`; }

function parseImageUrls(raw, t) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: t('role_setup.image_urls.need_one') };
  const errors = [];
  lines.forEach((url, i) => {
    try { validateUrl(url, t('builder.validation.line_label', { n: i + 1 }), t); }
    catch (e) { errors.push(e.message.replace(/^buildMessageFromSchema:\s*/, '')); }
  });
  if (errors.length) return { ok: false, error: `${t('role_setup.image_urls.invalid_header')}\n${errors.map(e => `• ${e}`).join('\n')}` };
  return { ok: true, urls: lines };
}

function checkRoleManageable(guild, role, t) {
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) return t('role_setup.role_check.no_manage_roles_perm');
  if (role.position >= guild.members.me.roles.highest.position) return t('role_setup.role_check.role_too_high', { name: role.name });
  if (role.managed) return t('role_setup.role_check.role_managed', { name: role.name });
  return null;
}

function mutateSetup(guildId, name, userId, fn) {
  const s = loadSetup(guildId, name);
  if (!s) return false;
  fn(s); s.updatedBy = userId; s.updatedAt = new Date().toISOString();
  saveSetup(guildId, name, s); return true;
}

/**
 * สรุป block หนึ่งอันให้เป็นข้อความสั้นๆ สำหรับโชว์ใน select menu
 * @param {object} block
 * @param {(key: string, replacements?: object) => string} [t] translator ของภาษาเซิร์ฟนี้
 *   default เป็นอังกฤษ ให้ตรงกับทิศทาง fallback ของทั้งระบบ (เหมือนที่แก้ builder.js แล้ว)
 * ⚠️ ไฟล์นี้มีแค่ 4 case (text/gallery/separator/section) ไม่มี section_button/
 * section_role_button/section_channel_button แบบ builder.js เพราะ role-setup ไม่มี block ประเภทนั้น
 */
function describeBlock(block, t = createTranslator('en')) {
  switch (block.type) {
    case 'text':      return { typeLabel: t('role_setup.block_type.text'),      preview: block.content.split('\n')[0] || t('role_setup.block_type.empty_content') };
    case 'gallery':   return { typeLabel: t('role_setup.block_type.gallery'),   preview: block.items.length === 1 ? block.items[0].url : t('role_setup.describe.gallery_multi', { count: block.items.length }) };
    case 'separator': return { typeLabel: t('role_setup.block_type.separator'), preview: t('role_setup.describe.separator_spacing', { spacing: block.spacing === 'large' ? t('role_setup.spacing.large') : t('role_setup.spacing.small') }) };
    case 'section':   return { typeLabel: t('role_setup.block_type.section'),   preview: block.text.split('\n')[0] || t('role_setup.block_type.empty_content') };
    default:          return { typeLabel: block.type,                          preview: t('role_setup.block_type.no_data') };
  }
}

/** modal สำหรับ section block (ใช้ร่วม add/edit/insert)
 * @param {(key: string, replacements?: object) => string} t
 */
function buildSectionModal(customId, title, prefill = {}, t) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const textInput = new TextInputBuilder()
    .setCustomId(RS.INPUT_SEC_TEXT).setLabel(t('role_setup.modal.section_text_label'))
    .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000);
  if (prefill.text) textInput.setValue(prefill.text);

  const imgInput = new TextInputBuilder()
    .setCustomId(RS.INPUT_SEC_IMG).setLabel(t('role_setup.modal.section_image_label'))
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)
    .setPlaceholder('https://example.com/thumbnail.png');
  if (prefill.thumbnail) imgInput.setValue(prefill.thumbnail);

  modal.addComponents(
    new ActionRowBuilder().addComponents(textInput),
    new ActionRowBuilder().addComponents(imgInput),
  );
  return modal;
}

// ─── Panel builders ───────────────────────────────────────────────────────────
function buildEditorPanel(userId, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const session = sessions.get(sessionKey(guildId, userId));
  if (!session) return { content: t('role_setup.error.session_expired'), flags: MessageFlags.Ephemeral };
  const setup = loadSetup(session.guildId, session.name)
    ?? { blocks: [], accentColor: null, config: { minValues: 0, maxValues: 1, roles: [], buttons: [], reactions: [], placeholder: null }, type: 'menu' };
  const { blocks, accentColor, config, type } = setup;
  const roles     = config?.roles ?? [];
  const buttons   = config?.buttons ?? [];
  const reactions = config?.reactions ?? [];
  const minV      = config?.minValues ?? 0;
  const maxV      = config?.maxValues ?? 1;
  const ph        = config?.placeholder ? t('role_setup.suffix.placeholder_custom') : '';
  const color     = accentColor ? t('role_setup.suffix.color', { color: accentColor }) : '';
  const prefix    = session.isEdit ? '✏️' : '🆕';
  const components = [];

  // สรุปจำนวนรายการตาม type
  const maxRolesLabel = config?.maxRoles == null ? t('role_setup.suffix.max_roles_unlimited') : String(config.maxRoles);
  const itemCountLabel = type === 'button'
    ? t('role_setup.count.button', { count: buttons.length, max: maxRolesLabel })
    : type === 'reaction'
      ? t('role_setup.count.reaction', { count: reactions.length })
      : t('role_setup.count.menu', { min: minV, max: maxV, count: roles.length });

  if (!blocks.length) {
    components.push(new TextDisplayBuilder().setContent(
      t('role_setup.editor.empty_state', { prefix, name: session.name, type, itemCountLabel, color, ph })
    ));
  } else {
    try {
      const preview = buildMessageFromSchema({ blocks, accentColor });
      components.push(...preview.components);
    } catch {
      components.push(new TextDisplayBuilder().setContent(
        t('role_setup.editor.header_with_blocks', { prefix, name: session.name, type, count: blocks.length, itemCountLabel, color, ph })
      ));
    }
  }

  // Row 1: layout (5 ปุ่ม) — เหมือนกันทุก type
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(RS.ADD_TEXT).setLabel(t('role_setup.editor.button.add_text')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(RS.ADD_IMAGE).setLabel(t('role_setup.editor.button.add_image')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(RS.ADD_SECTION).setLabel(t('role_setup.editor.button.add_section')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(RS.ADD_SEP).setLabel(t('role_setup.editor.button.add_separator')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(RS.COLOR).setLabel(t('role_setup.editor.button.color')).setStyle(ButtonStyle.Secondary),
  ));

  // Row 2: ต่างกันตาม type
  if (type === 'button') {
    // button type Row 2: role controls (3 ปุ่ม)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(RS.ADD_BTN_BTN).setLabel(t('role_setup.editor.button.add_button')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(RS.MANAGE_BTNS).setLabel(t('role_setup.editor.button.manage_buttons'))
        .setStyle(ButtonStyle.Secondary).setDisabled(!buttons.length),
      new ButtonBuilder().setCustomId(RS.MAX_ROLES).setLabel(t('role_setup.editor.button.max_roles')).setStyle(ButtonStyle.Secondary),
    ));
    // button type Row 3: general controls (2 ปุ่ม — เอาปุ่ม "ดูตัวอย่าง" (RS.PREVIEW) ออกแล้ว
    // ตามคำขอ ไม่ต้องรวม row ใหม่ เหลือแค่ manage_blocks + done ใน row เดิม)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(RS.MANAGE_BLOCKS).setLabel(t('role_setup.editor.button.manage_blocks'))
        .setStyle(ButtonStyle.Secondary).setDisabled(!blocks.length),
      new ButtonBuilder().setCustomId(RS.DONE).setLabel(t('role_setup.editor.button.done')).setStyle(ButtonStyle.Success),
    ));
  } else if (type === 'reaction') {
    // reaction type Row 2: reaction controls (2 ปุ่ม)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(RS.ADD_REACTION).setLabel(t('role_setup.editor.button.add_reaction')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(RS.MANAGE_REACTIONS).setLabel(t('role_setup.editor.button.manage_reactions'))
        .setStyle(ButtonStyle.Secondary).setDisabled(!reactions.length),
    ));
    // reaction type Row 3: general controls (2 ปุ่ม — ไม่มีดูตัวอย่าง เพราะต้องโพสต์จริงถึง react ได้)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(RS.MANAGE_BLOCKS).setLabel(t('role_setup.editor.button.manage_blocks'))
        .setStyle(ButtonStyle.Secondary).setDisabled(!blocks.length),
      new ButtonBuilder().setCustomId(RS.DONE).setLabel(t('role_setup.editor.button.done')).setStyle(ButtonStyle.Success),
    ));
  } else {
    // menu type Row 2: role controls (4 ปุ่ม)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(RS.ADD_ROLE_BTN).setLabel(t('role_setup.editor.button.add_role')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(RS.MANAGE_ROLES).setLabel(t('role_setup.editor.button.manage_roles', { count: roles.length }))
        .setStyle(ButtonStyle.Secondary).setDisabled(!roles.length),
      new ButtonBuilder().setCustomId(RS.CONFIG).setLabel(t('role_setup.editor.button.config')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(RS.MANAGE_BLOCKS).setLabel(t('role_setup.editor.button.manage_blocks'))
        .setStyle(ButtonStyle.Secondary).setDisabled(!blocks.length),
    ));
    // menu type Row 3: general controls (1 ปุ่ม — เอาปุ่ม "ดูตัวอย่าง" (RS.PREVIEW) ออกแล้ว
    // ตามคำขอ เหลือแค่ done ปุ่มเดียวใน row นี้ ไม่ต้องรวม row ใหม่)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(RS.DONE).setLabel(t('role_setup.editor.button.done')).setStyle(ButtonStyle.Success),
    ));
  }

  return { components, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

function buildManageBlocksPanel(userId, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const session = sessions.get(sessionKey(guildId, userId));
  if (!session) return { content: t('role_setup.error.session_expired'), flags: MessageFlags.Ephemeral };
  const setup   = loadSetup(session.guildId, session.name);
  const blocks  = setup?.blocks ?? [];
  const backBtn = new ButtonBuilder().setCustomId(RS.MANAGE_BACK).setLabel(t('role_setup.manage.back_button')).setStyle(ButtonStyle.Secondary);
  if (!blocks.length) return {
    components: [new TextDisplayBuilder().setContent(t('role_setup.manage.empty')), new ActionRowBuilder().addComponents(backBtn)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
  const options = blocks.slice(0, 25).map((b, i) => {
    const { typeLabel, preview } = describeBlock(b, t);
    return { label: t('role_setup.manage.option_label', { index: i + 1, type: typeLabel }).slice(0, 100), ...(preview ? { description: preview.slice(0, 100) } : {}), value: String(i) };
  });
  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.manage.header')),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(RS.MANAGE_SELECT).setPlaceholder(t('role_setup.manage.placeholder')).addOptions(options)),
      new ActionRowBuilder().addComponents(backBtn),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function buildBlockActionPanel(index, block, totalBlocks, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const { typeLabel, preview } = describeBlock(block, t);
  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.block_action.header', { index: index + 1, typeLabel, preview })),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PFX.EDIT}${index}`).setLabel(t('role_setup.block_action.button.edit')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${PFX.DEL}${index}`).setLabel(t('role_setup.block_action.button.delete')).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`${PFX.INSERT}${index}`).setLabel(t('role_setup.block_action.button.insert')).setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PFX.UP}${index}`).setLabel(t('role_setup.block_action.button.move_up')).setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
        new ButtonBuilder().setCustomId(`${PFX.DOWN}${index}`).setLabel(t('role_setup.block_action.button.move_down')).setStyle(ButtonStyle.Secondary).setDisabled(index === totalBlocks - 1),
        new ButtonBuilder().setCustomId(RS.MANAGE_BACK).setLabel(t('role_setup.manage.back_button')).setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function buildInsertTypePanel(insertPosition, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.insert_type.header', { position: insertPosition + 1 })),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PFX.INS_T}${insertPosition}`).setLabel(t('role_setup.editor.button.add_text')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${PFX.INS_I}${insertPosition}`).setLabel(t('role_setup.editor.button.add_image')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${PFX.INS_SEC}${insertPosition}`).setLabel(t('role_setup.editor.button.add_section')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${PFX.INS_S}${insertPosition}`).setLabel(t('role_setup.editor.button.add_separator')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(RS.MANAGE_BACK).setLabel(t('role_setup.insert_type.cancel_button')).setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function buildColorPanel(guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.color.header')),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(RS.COLOR_SELECT).setPlaceholder(t('role_setup.color.placeholder'))
          .addOptions([
            ...PRESET_COLORS.map(c => ({ label: c.label, value: c.hex, description: c.hex })),
            { label: t('role_setup.color.custom_label'), value: 'custom', description: t('role_setup.color.custom_description') },
            { label: t('role_setup.color.none_label'), value: 'none', description: t('role_setup.color.none_description') },
          ])
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(RS.COLOR_BACK).setLabel(t('role_setup.manage.back_button')).setStyle(ButtonStyle.Secondary)),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function buildAddRolePanel(setupName, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.add_role.header', { name: setupName })),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId(RS.ADD_ROLE_SELECT)
          .setPlaceholder(t('role_setup.add_role.placeholder'))
          .setMinValues(1).setMaxValues(1)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(RS.ADD_ROLE_BACK)
          .setLabel(t('role_setup.add_role.cancel_button'))
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function buildRoleManagePanel(userId, guild, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const session = sessions.get(sessionKey(guildId, userId));
  if (!session) return { content: t('role_setup.error.session_expired'), flags: MessageFlags.Ephemeral };
  const setup  = loadSetup(session.guildId, session.name);
  const roles  = setup?.config?.roles ?? [];
  const backBtn = new ButtonBuilder().setCustomId(RS.ROLE_BACK).setLabel(t('role_setup.manage.back_button')).setStyle(ButtonStyle.Secondary);
  if (!roles.length) return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.role_manage.empty', { name: session.name })),
      new ActionRowBuilder().addComponents(backBtn),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
  const options = roles.map(r => ({
    label: (guild?.roles.cache.get(r.id)?.name ?? `ID: ${r.id}`).slice(0, 100),
    value: r.id,
    ...(r.description ? { description: r.description.slice(0, 100) } : {}),
  }));
  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.role_manage.select_header', { name: session.name })),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(RS.ROLE_REMOVE)
          .setPlaceholder(t('role_setup.role_manage.placeholder'))
          .setMinValues(1).setMaxValues(roles.length).addOptions(options)
      ),
      new ActionRowBuilder().addComponents(backBtn),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Button type helpers — เพิ่มปุ่มแบบ 3 ขั้น: modal(label+emoji) → สี → ยศ
// ════════════════════════════════════════════════════════════════════════════

/**
 * Resolve emoji input จาก modal ของปุ่ม — ใช้ร่วมกันทั้ง flow เพิ่มปุ่มใหม่และแก้ไขปุ่มเดิม
 * คืนค่า resolved string ที่ใส่เข้า setEmoji() ได้จริง หรือ null ถ้า resolve ไม่สำเร็จ/ว่างเปล่า
 * @param {string} emojiRaw - ค่าดิบจาก TextInput (ก่อน trim ก็ได้ ฟังก์ชันนี้ trim ให้)
 * @param {import('discord.js').Guild} guild
 * @returns {{ resolved: string|null, failed: boolean }}
 */
function resolveButtonEmojiInput(emojiRaw, guild) {
  const trimmed = (emojiRaw ?? '').trim();
  if (!trimmed) return { resolved: null, failed: false };

  const resolved = resolveCustomEmojis(trimmed, guild);
  // ถ้า input ตรง pattern ":ชื่อ:" เป๊ะทั้งสตริง (เช่น ":1295734878918279211:")
  // แต่ resolveCustomEmojis คืนค่าเดิมกลับมาเฉยๆ (ไม่เจอ emoji ชื่อนั้นในเซิร์ฟเวอร์)
  // แปลว่า resolve ไม่สำเร็จ — ห้ามส่งสตริงดิบนี้เข้า setEmoji() เด็ดขาด
  // (unicode emoji ที่พิมพ์ตรงๆ เช่น "🎮" จะไม่ตรง pattern นี้ตั้งแต่แรก ผ่านได้ปกติ)
  const isColonWrappedPattern = /^:[^\s:]+:$/.test(trimmed);
  if (isColonWrappedPattern && resolved === trimmed) {
    return { resolved: null, failed: true };
  }
  return { resolved, failed: false };
}

/**
 * หน้าจอเลือกสีปุ่ม (ขั้นที่ 2 ของ flow เพิ่มปุ่ม)
 * @param {string} setupName
 * @param {{ label: string, emoji: string|null }} pending
 */
function buildButtonColorPanel(setupName, pending, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const previewLabel = pending.emoji ? `${pending.emoji} ${pending.label}` : pending.label;
  const isEdit = pending.editIndex != null;
  const title = isEdit
    ? t('role_setup.button_color.edit_title', { name: setupName })
    : t('role_setup.button_color.add_title', { name: setupName });
  const note = isEdit && pending.style != null
    ? t('role_setup.button_color.current_style_note', { style: buttonStyleName(pending.style) })
    : '';
  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.button_color.header', { title, previewLabel, note })),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(RS.BTN_COLOR_PRIM).setLabel('Primary').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(RS.BTN_COLOR_SEC).setLabel('Secondary').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(RS.BTN_COLOR_SUCC).setLabel('Success').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(RS.BTN_COLOR_DANG).setLabel('Danger').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(RS.BTN_COLOR_BACK).setLabel(t('role_setup.button_color.cancel_button')).setStyle(ButtonStyle.Secondary)
      ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * หน้าจอเลือกยศ (ขั้นที่ 3 ของ flow เพิ่ม/แก้ไขปุ่ม) — filter เฉพาะยศที่บอท assign ได้จริง
 * ตอน edit mode (currentRoleId != null) จะมีตัวเลือกพิเศษ "✅ คงยศเดิม" บนสุดเสมอ
 * @param {import('discord.js').Guild} guild
 * @param {string|null} currentRoleId  - roleId เดิม (edit mode เท่านั้น)
 * @param {string|null} currentRoleName - ชื่อยศเดิม ใช้แสดงในตัวเลือก "คงยศเดิม"
 * @returns {{ payload: object|null, assignableCount: number }}
 */
function buildButtonRolePanel(guild, currentRoleId = null, currentRoleName = null, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const botHighestPosition = guild.members.me.roles.highest.position;
  const isEdit = currentRoleId != null;

  // ตอน edit mode ต้องสำรองที่ว่างไว้ 1 slot สำหรับตัวเลือก "คงยศเดิม" ที่จะเพิ่มด้านบน
  // (StringSelectMenu รองรับสูงสุด 25 ตัวเลือก — 1 keep + 24 ยศจริง = 25 พอดี)
  const maxRoleSlots = isEdit ? 24 : 25;

  const assignableRoles = guild.roles.cache
    .filter(role => role.id !== guild.id && role.position < botHighestPosition && !role.managed)
    .sort((a, b) => b.position - a.position)
    .first(maxRoleSlots);

  if (assignableRoles.length === 0 && !isEdit) return { payload: null, assignableCount: 0 };

  const options = [];

  // ── ตัวเลือกพิเศษ "คงยศเดิม" — แสดงเฉพาะตอน edit mode ──────────────────
  // ถ้าผู้ใช้เลือกอันนี้ handler จะใช้ currentRoleId เดิมโดยไม่เปลี่ยน roleId
  // ทำให้แก้แค่ label/emoji/สีได้โดยไม่ต้องเลือกยศใหม่ทุกครั้ง
  if (isEdit) {
    const keepLabel = currentRoleName
      ? t('role_setup.button_role.keep_label_named', { name: currentRoleName }).slice(0, 100)
      : t('role_setup.button_role.keep_label');
    options.push({
      label: keepLabel,
      value: KEEP_ROLE_VALUE,
      description: t('role_setup.button_role.keep_description'),
    });
  }

  options.push(...assignableRoles.map(role => ({
    label: role.name.slice(0, 100),
    value: role.id,
    description: t('role_setup.button_role.role_description', { id: role.id }).slice(0, 100),
    // ไม่ default: true แล้ว เพราะมีตัวเลือก "คงยศเดิม" แทน ทำให้ชัดเจนกว่า
  })));

  const headerText = isEdit
    ? t('role_setup.button_role.header_edit')
    : t('role_setup.button_role.header_add');

  return {
    payload: {
      components: [
        new TextDisplayBuilder().setContent(headerText),
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(RS.BTN_ROLE_SEL).setPlaceholder(t('role_setup.button_role.placeholder')).addOptions(options)),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(RS.BTN_ROLE_BACK).setLabel(t('role_setup.button_role.cancel_button')).setStyle(ButtonStyle.Secondary)),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    },
    assignableCount: assignableRoles.length + (isEdit ? 1 : 0), // นับ keep option ด้วย
  };
}

/**
 * หน้าจอจัดการปุ่มที่เพิ่มไปแล้ว (ลบออกได้) — กดจากปุ่ม "🗑️ ปุ่ม(N)" ในแผงควบคุม
 * @param {string} userId
 * @param {import('discord.js').Guild} guild
 */
/**
 * เช็คว่า string ที่อ้างว่าเป็น emoji หน้าตาถูกรูปแบบจริงไหม ก่อนจะเอาไปเรียก setEmoji()
 * รองรับ 2 แบบ: custom emoji แบบเต็ม <a?:name:id> (animated หรือไม่ก็ได้) หรือ unicode
 * emoji เดี่ยวๆ 1 ตัว (รวม variation selector ท้าย ๆ อย่าง ️ ได้)
 *
 * 🩹 เหตุผลที่ต้องเช็คแบบนี้ก่อน แทนที่จะพึ่ง try/catch รอบ opt.setEmoji() อย่างเดียว:
 * try/catch จับได้แค่ error ที่ discord.js เช็คฝั่ง client เอง (เช่น format ผิดชัดๆ)
 * แต่ข้อมูล emoji เก่าที่ "format ถูกต้อง" แต่ค่าจริงใช้ไม่ได้แล้ว (เช่น custom emoji
 * ที่ถูกลบออกจากเซิร์ฟไปแล้ว แต่ id เก่ายังค้างอยู่ในปุ่ม) discord.js ฝั่ง client
 * มองว่า "ผ่าน" เพราะ format สมบูรณ์แบบทุกอย่าง แล้วปล่อยให้หลุดไปตอน request จริง
 * ถึงจะไปโดน Discord API (server-side) reject กลับมาเป็น DiscordAPIError 50035
 * (COMPONENT_INVALID_EMOJI) พังทั้ง payload — จุดนี้ตัว regex เช็คได้แค่ "format" เท่านั้น
 * เช็ค "emoji ยังมีอยู่จริงไหม" ไม่ได้ (ต้องไปเทียบกับ guild.emojis.cache ซึ่งมีเคส
 * application emoji ที่ไม่โผล่ในนั้นด้วย ซับซ้อนเกินความจำเป็นสำหรับแค่ list ตัวอย่าง)
 * เพราะงั้นชั้นป้องกันที่แท้จริงสำหรับเคส "id ถูกลบไปแล้ว" คือ try/catch รอบ
 * interaction.update() ทั้งก้อนที่เพิ่มไว้ในจุดเรียกใช้ (case RS.MANAGE_BTNS ฯลฯ) แทน
 * @param {string} emoji
 * @returns {boolean}
 */
function isValidEmojiFormat(emoji) {
  const emojiPattern = /^(<a?:[^\s:]+:\d+>|\p{Extended_Pictographic}(\uFE0F)?)$/u;
  return typeof emoji === 'string' && emojiPattern.test(emoji);
}

/**
 * เรียก interaction.update() แบบปลอดภัย — ห่อทั้งการ "สร้าง payload" (buildPayloadFn)
 * และ "ส่งจริง" (interaction.update) ไว้ใน try/catch เดียวกัน
 *
 * เหตุผล: isValidEmojiFormat() ข้างบนกรอง emoji ที่ format ผิดชัดๆ ได้ก็จริง แต่กรอง
 * เคส "format ถูกต้องแต่ emoji จริงใช้ไม่ได้แล้ว" (เช่น custom emoji ที่ถูกลบออกจาก
 * เซิร์ฟไปแล้ว) ไม่ได้ — เคสนั้นจะไปโผล่เป็น DiscordAPIError ตอน interaction.update()
 * ยิงจริงเท่านั้น (server-side validation) ชั้นนี้เลยเป็นเซฟตี้เน็ตจริงที่ครอบคลุมทั้ง
 * เคสนี้และ error ไม่คาดคิดอื่นๆ ที่อาจเกิดตอนสร้าง/ส่ง panel กันไม่ให้บอทค้าง/
 * ไม่ตอบสนอง interaction เลยทั้งที่มีแค่บางปุ่ม/reaction เดียวที่มีข้อมูลเสีย
 *
 * @param {import('discord.js').Interaction} interaction
 * @param {() => object} buildPayloadFn - ฟังก์ชันที่ return payload พร้อมส่ง (เช่น () => buildBtnManagePanel(...))
 * @param {string} guildId
 */
async function safeUpdatePanel(interaction, buildPayloadFn, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  try {
    const payload = buildPayloadFn();
    await interaction.update(payload);
  } catch (error) {
    console.error('[role-setup safeUpdatePanel] เปิด/อัปเดตแผงควบคุมไม่สำเร็จ:', error);
    try {
      await interaction.update({
        components: [new TextDisplayBuilder().setContent(t('role_setup.manage.panel_error'))],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } catch (fallbackError) {
      console.error('[role-setup safeUpdatePanel] fallback update ก็ล้มเหลวอีก:', fallbackError);
    }
  }
}

/**
 * หน้าจอ "เลือกปุ่มที่จะจัดการ" (single select) — กดจากปุ่ม "⚙️ จัดการปุ่ม" ในแผงควบคุม
 * แสดง emoji+label ของแต่ละปุ่ม พร้อมชื่อยศที่ผูกอยู่
 */
function buildBtnManagePanel(userId, guild, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const session = sessions.get(sessionKey(guildId, userId));
  if (!session) return { content: t('role_setup.error.session_expired'), flags: MessageFlags.Ephemeral };
  const setup   = loadSetup(session.guildId, session.name);
  const buttons = setup?.config?.buttons ?? [];
  const backBtn = new ButtonBuilder().setCustomId(RS.BTN_MANAGE_BACK).setLabel(t('role_setup.manage.back_button')).setStyle(ButtonStyle.Secondary);

  if (!buttons.length) return {
    components: [new TextDisplayBuilder().setContent(t('role_setup.btn_manage.empty', { name: session.name })), new ActionRowBuilder().addComponents(backBtn)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };

  const selectMenu = new StringSelectMenuBuilder().setCustomId(RS.BTN_MANAGE_SELECT).setPlaceholder(t('role_setup.btn_manage.placeholder'));

  const options = buttons.map((b, i) => {
    const roleName = guild?.roles.cache.get(b.roleId)?.name ?? t('role_setup.button_role.role_description', { id: b.roleId });
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(b.label.slice(0, 100))
      .setDescription(t('role_setup.btn_manage.option_description', { roleName }).slice(0, 100))
      .setValue(String(i));
    // emoji เป็น optional — เช็ค format ให้เข้มก่อน (isValidEmojiFormat) แทนที่จะพึ่ง
    // try/catch อย่างเดียว เพราะข้อมูลเก่าที่ format ถูกต้องแต่ emoji จริงไม่มีอยู่แล้ว
    // (เช่น custom emoji ที่โดนลบจากเซิร์ฟไปแล้ว) หลุด try/catch นี้ผ่านได้สบายๆ
    if (b.emoji && isValidEmojiFormat(b.emoji)) {
      try { opt.setEmoji(b.emoji); } catch { /* กันไว้อีกชั้น เผื่อกรณีขอบๆ ที่ regex ยังไม่ครอบคลุม */ }
    }
    return opt;
  });

  selectMenu.addOptions(options);

  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.btn_manage.header', { name: session.name })),
      new ActionRowBuilder().addComponents(selectMenu),
      new ActionRowBuilder().addComponents(backBtn),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * แปลง ButtonStyle (number) เป็นชื่อที่อ่านได้ — ใช้แสดงผลใน action panel
 */
function buttonStyleName(style) {
  switch (style) {
    case ButtonStyle.Primary:   return 'Primary';
    case ButtonStyle.Secondary: return 'Secondary';
    case ButtonStyle.Success:   return 'Success';
    case ButtonStyle.Danger:    return 'Danger';
    default:                    return 'Primary';
  }
}

/**
 * หน้าจอ "เลือกการกระทำ" (แก้ไข/ลบ) หลังเลือกปุ่มจาก buildBtnManagePanel แล้ว
 * @param {number} index - ตำแหน่งของปุ่มใน config.buttons[]
 * @param {object} button - { roleId, label, emoji, style }
 * @param {import('discord.js').Guild} guild
 */
function buildBtnActionPanel(index, button, guild, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const roleName = guild?.roles.cache.get(button.roleId)?.name ?? t('role_setup.btn_action.role_deleted_suffix', { id: button.roleId });
  const previewLabel = button.emoji ? `${button.emoji} ${button.label}` : button.label;
  const styleName = buttonStyleName(button.style);

  return {
    components: [
      new TextDisplayBuilder().setContent(
        t('role_setup.btn_action.header', { previewLabel, styleName, roleName })
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PFX.BTN_ACTION_EDIT}${index}`).setLabel(t('role_setup.btn_action.button.edit')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${PFX.BTN_ACTION_DEL}${index}`).setLabel(t('role_setup.btn_action.button.delete')).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(RS.BTN_ACTION_BACK).setLabel(t('role_setup.manage.back_button')).setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/**
 * หน้าจอ "เลือกจำนวนยศสูงสุด" — กดจากปุ่ม "🔢 จำนวนยศ" ในแผงควบคุม (เฉพาะ button type)
 * ค่า "ไม่จำกัด" เก็บเป็น maxRoles: null ใน config
 */
function buildMaxRolesPanel(setupName, currentMaxRoles, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const options = [
    { label: t('role_setup.max_roles.option_single'), value: '1', description: t('role_setup.max_roles.option_single_desc') },
    { label: t('role_setup.max_roles.option_two'), value: '2', description: t('role_setup.max_roles.option_two_desc') },
    { label: t('role_setup.max_roles.option_three'), value: '3', description: t('role_setup.max_roles.option_three_desc') },
    { label: t('role_setup.max_roles.option_unlimited'), value: 'unlimited', description: t('role_setup.max_roles.option_unlimited_desc') },
  ].map(opt => ({ ...opt, default: currentMaxRoles === (opt.value === 'unlimited' ? null : Number(opt.value)) }));

  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.max_roles.header', { name: setupName })),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(RS.MAX_ROLES_SELECT).setPlaceholder(t('role_setup.max_roles.placeholder')).addOptions(options)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(RS.MANAGE_BACK).setLabel(t('role_setup.manage.back_button')).setStyle(ButtonStyle.Secondary)
      ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Reaction type helpers
// ════════════════════════════════════════════════════════════════════════════

/**
 * แปลง emoji object จาก Discord reaction event เป็น key string ที่ match กับ config
 * unicode: reaction.emoji = { name: '🎭', id: null }  → '🎭'
 * custom:  reaction.emoji = { name: 'pepe', id: '123', animated: false } → '<:pepe:123>'
 * animated: animated: true → '<a:dance:456>'
 */
function getEmojiKey(emoji) {
  if (emoji.id) return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
  return emoji.name; // unicode emoji
}

/**
 * React emoji ลง message จาก string ที่เก็บใน config
 * Discord API รับ custom emoji ในรูป "name:id" (ไม่ต้องมี < > และ a:)
 * unicode emoji ส่งตัวอักษรตรงๆ ได้เลย
 */
async function reactWithEmoji(message, emojiStr) {
  const customMatch = emojiStr.match(/^<a?:([^\s:]+):(\d+)>$/);
  if (customMatch) { await message.react(`${customMatch[1]}:${customMatch[2]}`); }
  else { await message.react(emojiStr); }
}

/** หน้าจอรายการ reaction ทั้งหมด (single select) */
function buildRxnManagePanel(userId, guild, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const session   = sessions.get(sessionKey(guildId, userId));
  if (!session) return { content: t('role_setup.error.session_expired'), flags: MessageFlags.Ephemeral };
  const setup     = loadSetup(session.guildId, session.name);
  const reactions = setup?.config?.reactions ?? [];
  const backBtn   = new ButtonBuilder().setCustomId(RS.RXN_MANAGE_BACK).setLabel(t('role_setup.manage.back_button')).setStyle(ButtonStyle.Secondary);
  if (!reactions.length) return {
    components: [new TextDisplayBuilder().setContent(t('role_setup.rxn_manage.empty', { name: session.name })), new ActionRowBuilder().addComponents(backBtn)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
  const options = reactions.map((r, i) => {
    const roleName = guild?.roles.cache.get(r.roleId)?.name ?? t('role_setup.rxn_role.role_description', { id: r.roleId });
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(t('role_setup.rxn_manage.option_label', { roleName }).slice(0, 100))
      .setDescription(t('role_setup.rxn_manage.option_description', { emoji: r.emoji }).slice(0, 100))
      .setValue(String(i));
    // 🩹 เช็ค format ด้วย isValidEmojiFormat() ก่อนเรียก setEmoji() เหมือนกับ
    // buildBtnManagePanel() ด้านบน — เหตุผลเดียวกันเป๊ะ (ดูคอมเมนต์ที่นิยาม
    // isValidEmojiFormat) กันข้อมูล reaction เก่าที่ emoji ถูกลบไปแล้วแต่ format
    // ยังดูถูกต้องอยู่ หลุดรอดจนพัง payload ตอน interaction.update() ส่งจริง
    if (isValidEmojiFormat(r.emoji)) {
      const cm = r.emoji.match(/^<a?:([^\s:]+):(\d+)>$/);
      try { if (cm) opt.setEmoji({ name: cm[1], id: cm[2] }); else opt.setEmoji(r.emoji); } catch { /* กันไว้อีกชั้น เผื่อกรณีขอบๆ ที่ regex ยังไม่ครอบคลุม */ }
    }
    return opt;
  });
  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.rxn_manage.header', { name: session.name })),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(RS.RXN_MANAGE_SELECT).setPlaceholder(t('role_setup.rxn_manage.placeholder')).addOptions(options)),
      new ActionRowBuilder().addComponents(backBtn),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/** หน้าจอ action (แก้ไข/ลบ) หลังเลือก reaction จาก list */
function buildRxnActionPanel(index, rxn, guild, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const roleName = guild?.roles.cache.get(rxn.roleId)?.name ?? t('role_setup.rxn_action.role_deleted_suffix', { id: rxn.roleId });
  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.rxn_action.header', { emoji: rxn.emoji, roleName })),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PFX.RXN_ACTION_EDIT}${index}`).setLabel(t('role_setup.rxn_action.button.edit')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${PFX.RXN_ACTION_DEL}${index}`).setLabel(t('role_setup.rxn_action.button.delete')).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(RS.RXN_ACTION_BACK).setLabel(t('role_setup.manage.back_button')).setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

/** หน้าจอเลือกยศ สำหรับ reaction type (ขั้นที่ 2: modal emoji → เลือกยศ) */
function buildRxnRolePanel(guild, currentRoleId = null, currentRoleName = null, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const botHighestPosition = guild.members.me.roles.highest.position;
  const isEdit = currentRoleId != null;
  const assignableRoles = guild.roles.cache
    .filter(r => r.id !== guild.id && r.position < botHighestPosition && !r.managed)
    .sort((a, b) => b.position - a.position).first(isEdit ? 24 : 25);
  if (assignableRoles.length === 0 && !isEdit) return { payload: null, assignableCount: 0 };
  const options = [];
  if (isEdit) {
    const keepLabel = currentRoleName
      ? t('role_setup.rxn_role.keep_label_named', { name: currentRoleName }).slice(0, 100)
      : t('role_setup.rxn_role.keep_label');
    options.push({ label: keepLabel, value: KEEP_ROLE_VALUE, description: t('role_setup.rxn_role.keep_description') });
  }
  options.push(...assignableRoles.map(r => ({
    label: r.name.slice(0, 100),
    value: r.id,
    description: t('role_setup.rxn_role.role_description', { id: r.id }).slice(0, 100),
  })));
  const headerText = isEdit ? t('role_setup.rxn_role.header_edit') : t('role_setup.rxn_role.header_add');
  return {
    payload: {
      components: [
        new TextDisplayBuilder().setContent(headerText),
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(RS.RXN_ROLE_SEL).setPlaceholder(t('role_setup.rxn_role.placeholder')).addOptions(options)),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(RS.RXN_ROLE_BACK).setLabel(t('role_setup.rxn_role.cancel_button')).setStyle(ButtonStyle.Secondary)),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    },
    assignableCount: assignableRoles.length + (isEdit ? 1 : 0),
  };
}

/**
 * Panel ChannelSelectMenu หลังกด ✅ เสร็จแล้ว
 * wasPosted = true → แจ้งว่าเคยโพสต์แล้ว
 */
function buildDoneChannelPanel(setupName, wasPosted, guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const note = wasPosted ? t('role_setup.done.posted_note') : '';
  return {
    components: [
      new TextDisplayBuilder().setContent(t('role_setup.done.header', { name: setupName, note })),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId(RS.DONE_CHAN_SEL).setPlaceholder(t('role_setup.done.placeholder'))
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(RS.MANAGE_BACK).setLabel(t('role_setup.done.cancel_button')).setStyle(ButtonStyle.Secondary)),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

// ─── Core post logic — คืน { ok, error } หรือ { ok, posted } ──────────────
// ไม่เรียก interaction methods โดยตรง เพื่อให้ caller จัดการ response ได้เอง
// (ป้องกันปัญหา "double response" และรองรับ deferUpdate flow)
/**
 * สร้าง ActionRow ของปุ่มยศจาก config.buttons สำหรับ button type
 * จัดกลุ่มสูงสุด 5 ปุ่มต่อแถว, สูงสุด 5 แถว (= 25 ปุ่มสูงสุดตามขีดจำกัดของ Discord)
 * customId รูปแบบ rolebtn:{roleId} ใช้ของเดิมจาก handleRoleButton.js ได้เลย ไม่ต้องเขียน toggle logic ใหม่
 * @param {object[]} buttons - [{ roleId, label, emoji, style }]
 * @returns {{ rows: ActionRowBuilder[], skippedCount: number }}
 */
/**
 * สร้าง ActionRow ของปุ่มยศจาก config.buttons สำหรับ button type
 * customId รูปแบบ rsbtn:{setupName}:{roleId} — ช่วยให้ handler รู้ว่ามาจาก setup ชื่ออะไร
 * เพื่อโหลด maxRoles และ logic limit ได้ถูกต้อง
 * (แตกต่างจาก rolebtn:{roleId} ของ builder.js ที่ไม่มี limit)
 * @param {import('discord.js').Guild} guild
 * @param {object[]} buttons - [{ roleId, label, emoji, style }]
 * @param {string} setupName - ชื่อ role-setup (ห้ามมี ":" เพราะใช้เป็น delimiter)
 */
function buildRoleButtonRows(guild, buttons, setupName) {
  const rows = [];
  let currentRow = new ActionRowBuilder();
  let countInRow = 0;
  let skippedCount = 0;

  for (const b of buttons) {
    const role = guild.roles.cache.get(b.roleId);
    if (!role) { skippedCount++; continue; }

    const btn = new ButtonBuilder()
      .setCustomId(`rsbtn:${setupName}:${b.roleId}`) // setupName ห้ามมี ":" อยู่แล้ว (enforce ตอน new)
      .setLabel(b.label)
      .setStyle(b.style ?? ButtonStyle.Primary);

    console.log(`[role-setup buildRoleButtonRows] ปุ่ม "${b.label}" → roleId=${b.roleId} emoji=${JSON.stringify(b.emoji)}`);

    // 🩹 บั๊กที่เจอ: เดิมเช็คแค่ pattern /^:[^\s:]+:$/ (จับได้แค่กรณี ":ชื่อ:" ดิบๆ ที่ resolve
    // emoji ไม่สำเร็จตอนกรอก) แต่ไม่ครอบคลุมค่าขยะอื่นๆ ที่ไม่ตรงทั้ง custom emoji แบบเต็ม
    // (<a?:name:id>) และไม่ใช่ unicode emoji จริง (เช่น "df") ค่าพวกนี้หลุด pattern เดิมผ่าน
    // ไปเข้า setEmoji() ตรงๆ ซึ่ง discord.js ฝั่ง client ไม่ได้เช็คเข้มพอจะจับได้ทุกเคส
    // สุดท้ายไปพังตอน Discord API (server-side) reject กลับมาเป็น DiscordAPIError 50035
    // (COMPONENT_INVALID_EMOJI) พังทั้งข้อความที่โพสต์ ไม่ใช่แค่ปุ่มเดียว
    // แก้โดยเปลี่ยนมาใช้ isValidEmojiFormat() ตัวเดียวกับที่ใช้ใน buildBtnManagePanel()/
    // buildRxnManagePanel() ไปแล้วก่อนหน้านี้ — เช็คครอบคลุมทั้ง custom emoji แบบเต็มและ
    // unicode emoji จริง ไม่ใช่แค่เคส ":ชื่อ:" ดิบๆ เคสเดียวเหมือนเดิม
    if (b.emoji) {
      if (!isValidEmojiFormat(b.emoji)) {
        console.warn(`[role-setup buildRoleButtonRows] ⚠️ emoji "${b.emoji}" ไม่ตรงรูปแบบที่ถูกต้อง ข้ามไม่ใส่ emoji`);
      } else {
        try {
          btn.setEmoji(b.emoji);
          console.log(`[role-setup buildRoleButtonRows] setEmoji("${b.emoji}") สำเร็จ`);
        } catch (emojiErr) {
          console.warn(`[role-setup buildRoleButtonRows] ⚠️ setEmoji throw:`, emojiErr.message);
        }
      }
    }

    if (countInRow === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
      countInRow = 0;
    }
    currentRow.addComponents(btn);
    countInRow++;
  }
  if (countInRow > 0) rows.push(currentRow);

  return { rows, skippedCount };
}

async function doPost(guild, userId, guildId, name, channel) {
  const t = createTranslator(getGuildLanguage(guildId));
  const setup = loadSetup(guildId, name);
  if (!setup) return { ok: false, error: t('role_setup.post.setup_not_found') };

  const msgComponents = [];
  if (setup.blocks.length) {
    const layout = buildMessageFromSchema({ blocks: setup.blocks, accentColor: setup.accentColor });
    msgComponents.push(...layout.components);
  }

  if (setup.type === 'button') {
    const buttons = setup.config?.buttons ?? [];
    if (!buttons.length) return { ok: false, error: t('role_setup.post.no_buttons') };

    const { rows, skippedCount } = buildRoleButtonRows(guild, buttons, name);
    if (!rows.length) return { ok: false, error: t('role_setup.post.all_button_roles_deleted') };

    msgComponents.push(...rows);

    // ── จุดที่ 1: ตรวจ flags ของ payload object ก่อนส่งจริง ────────────────
    // เพื่อยืนยันว่า object literal ที่ส่งให้ channel.send() ไม่มี Ephemeral ปนมาจากที่ไหน
    const sendPayload = { components: msgComponents, flags: MessageFlags.IsComponentsV2 };
    console.log(`[role-setup doPost button] sendPayload.flags = ${sendPayload.flags} (IsComponentsV2=${MessageFlags.IsComponentsV2}, Ephemeral=${MessageFlags.Ephemeral})`);
    console.log(`[role-setup doPost button] flags มี Ephemeral ปนไหม: ${(sendPayload.flags & MessageFlags.Ephemeral) !== 0}`);

    // ── จุดที่ 2: log payload เต็มๆ ก่อนส่งจริง (component tree ทั้งหมด) ────
    // .toJSON() แปลง Builder object ให้เป็น plain object ตรงตามที่ Discord API จะได้รับจริง
    let payloadJson;
    try {
      payloadJson = {
        flags: sendPayload.flags,
        components: msgComponents.map(c => c.toJSON()),
      };
      console.log(`[role-setup doPost button] === PAYLOAD (${buttons.length} ปุ่ม, ${rows.length} แถว) ===`);
      console.log(JSON.stringify(payloadJson, null, 2));
    } catch (jsonErr) {
      console.error('[role-setup doPost button] toJSON() error ระหว่าง log:', jsonErr);
    }

    // ── ตรวจ customId ซ้ำกัน — สาเหตุที่เป็นไปได้สูงสุดของ error 50035 เมื่อมีหลายปุ่ม ──
    // ถ้าผู้ใช้ผูกปุ่ม 2 อันเข้ากับยศเดียวกัน customId จะซ้ำกัน
    // Discord ปฏิเสธ message ที่มี custom_id ซ้ำกันในข้อความเดียว ด้วย code 50035 เช่นกัน
    //
    // 🩹 บั๊กที่เจอ: เดิมสร้าง allCustomIds ด้วย prefix "rolebtn:{roleId}" (ของ builder.js/
    // handleRoleButton.js) แต่ปุ่มจริงที่ buildRoleButtonRows() ใช้ (บรรทัด ~877 ด้านบน)
    // คือ "rsbtn:{setupName}:{roleId}" คนละ prefix กันเลย ตัวเช็คนี้เลยไม่มีทางเจอ
    // duplicate จริงได้เลยสักครั้ง (สร้าง id ที่ไม่มีวันซ้ำกับปุ่มที่ส่งออกไปจริง) แก้โดย
    // เปลี่ยนให้ allCustomIds ใช้ prefix เดียวกับ buildRoleButtonRows() เป๊ะๆ
    const allCustomIds = buttons.map(b => `rsbtn:${name}:${b.roleId}`);
    const seen = new Set();
    const duplicates = [];
    for (const id of allCustomIds) {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    if (duplicates.length > 0) {
      console.error(`[role-setup doPost button] พบ customId ซ้ำ: ${JSON.stringify(duplicates)}`);
      const dupRoleIds = [...new Set(duplicates.map(id => id.split(':').pop()))];
      const dupNames = dupRoleIds.map(id => guild.roles.cache.get(id)?.name ?? id).join(', ');
      return { ok: false, error: t('role_setup.post.duplicate_buttons', { names: dupNames }) };
    }

    let posted;
    try {
      posted = await channel.send(sendPayload);
    }
    catch (e) {
      // ── log error.rawError ให้เห็น path field ที่ Discord ชี้ว่าผิดจริงๆ ────
      console.error('[role-setup doPost button] ส่งไม่สำเร็จ:', e.message);
      if (e.rawError) {
        console.error('[role-setup doPost button] rawError:', JSON.stringify(e.rawError, null, 2));
      }
      if (e.requestBody) {
        console.error('[role-setup doPost button] requestBody ที่ส่งจริง:', JSON.stringify(e.requestBody, null, 2));
      }
      return { ok: false, error: t('role_setup.post.send_failed_button', { channel }) };
    }

    mutateSetup(guildId, name, userId, s => { s.lastPostedAt = new Date().toISOString(); });
    return { ok: true, posted, warning: skippedCount > 0 ? t('role_setup.post.skipped_buttons_warning', { count: skippedCount }) : null };
  }

  // ─── menu type (เดิม) ──────────────────────────────────────────────────
  if (setup.type === 'reaction') {
    const reactions = setup.config?.reactions ?? [];
    if (!reactions.length) return { ok: false, error: t('role_setup.post.no_reactions') };

    // สำหรับ reaction type ไม่มี interactive component ใน message เอง — แค่ layout blocks
    // บอทจะ react emoji ทุกอันลงบน message หลังโพสต์ เพื่อให้สมาชิกกด react ตาม
    let posted;
    try { posted = await channel.send({ components: msgComponents, flags: MessageFlags.IsComponentsV2 }); }
    catch (e) {
      console.error('[role-setup doPost reaction]', e);
      return { ok: false, error: t('role_setup.post.send_failed_generic', { channel }) };
    }

    // บอท react emoji ทุกอันที่ผูกไว้ ทำทีละ emoji พร้อม delay เล็กน้อยกัน rate limit
    const reactErrors = [];
    for (const r of reactions) {
      try {
        await reactWithEmoji(posted, r.emoji);
        await new Promise(resolve => setTimeout(resolve, 400)); // กัน Discord rate limit (5 react/sec)
      } catch (e) {
        console.warn(`[role-setup doPost] react ${r.emoji} failed:`, e.message);
        reactErrors.push(r.emoji);
      }
    }

    // เก็บ messageId ไว้ใช้ lookup ตอน reaction event ยิงมา
    mutateSetup(guildId, name, userId, s => {
      s.lastPostedAt = new Date().toISOString();
      s.config.postedMessageId = posted.id;
    });

    const warning = reactErrors.length > 0 ? t('role_setup.post.react_failed_warning', { emojis: reactErrors.join(' ') }) : null;
    return { ok: true, posted, warning };
  }

  if (setup.type !== 'menu') return { ok: false, error: t('role_setup.post.unsupported_type', { type: setup.type }) };
  const roles = setup.config?.roles ?? [];
  if (!roles.length) return { ok: false, error: t('role_setup.post.no_roles') };

  const options = [];
  for (const r of roles) {
    const gr = guild.roles.cache.get(r.id) ?? await guild.roles.fetch(r.id).catch(() => null);
    if (!gr) continue;
    options.push({ label: gr.name.slice(0, 100), value: r.id, ...(r.description ? { description: r.description.slice(0, 100) } : {}) });
  }
  if (!options.length) return { ok: false, error: t('role_setup.post.all_roles_deleted') };

  const minV = setup.config.minValues ?? 0;
  const maxV = Math.min(setup.config.maxValues ?? 1, options.length);
  const ph   = setup.config.placeholder ?? (maxV === 1 ? t('role_setup.post.placeholder_single') : t('role_setup.post.placeholder_multi', { min: minV, max: maxV }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`${SETUP_PREFIX}${name}`)
    .setPlaceholder(ph.slice(0, 150)).setMinValues(minV).setMaxValues(maxV).addOptions(options);

  msgComponents.push(new ActionRowBuilder().addComponents(selectMenu));

  let posted;
  try { posted = await channel.send({ components: msgComponents, flags: MessageFlags.IsComponentsV2 }); }
  catch (e) {
    console.error('[role-setup doPost]', e);
    return { ok: false, error: t('role_setup.post.send_failed_generic', { channel }) };
  }

  mutateSetup(guildId, name, userId, s => { s.lastPostedAt = new Date().toISOString(); });
  return { ok: true, posted };
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('role-setup')
    .setDescription('Set up automatic role assignment (menu / button / reaction)')
    .setDescriptionLocalizations({ th: 'สร้างระบบแจกยศอัตโนมัติครับ (menu / button / reaction)' })
    .addSubcommand(sub => sub.setName('new')
      .setDescription('Create a new role setup')
      .setDescriptionLocalizations({ th: 'สร้าง role setup ใหม่ครับ' })
      .addStringOption(opt => opt.setName('name')
        .setDescription('Name (no ":")')
        .setDescriptionLocalizations({ th: 'ชื่อ (ห้ามมี ":") ครับ' })
        .setRequired(true).setMaxLength(50))
      .addStringOption(opt => opt.setName('type')
        .setDescription('Interactive element type')
        .setDescriptionLocalizations({ th: 'รูปแบบ interactive element ครับ' })
        .setRequired(true)
        .addChoices(
          {
            name: 'Menu — dropdown',
            value: 'menu',
            name_localizations: { th: 'เมนู — เลือกจาก dropdown' },
          },
          {
            name: 'Button — click',
            value: 'button',
            name_localizations: { th: 'ปุ่มกด — กดรับยศ' },
          },
          {
            name: 'Reaction — emoji',
            value: 'reaction',
            name_localizations: { th: 'Reaction — กด emoji รับยศ' },
          },
        ))
    )
    .addSubcommand(sub => sub.setName('edit')
      .setDescription('Edit a role setup')
      .setDescriptionLocalizations({ th: 'แก้ไข role setup ครับ' })
      .addStringOption(opt => opt.setName('name')
        .setDescription('Role setup name')
        .setDescriptionLocalizations({ th: 'ชื่อ role setup' })
        .setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sub => sub.setName('list')
      .setDescription('List all role setups')
      .setDescriptionLocalizations({ th: 'ดูรายการทั้งหมดครับ' }))
    .addSubcommand(sub => sub.setName('delete')
      .setDescription('Delete a role setup')
      .setDescriptionLocalizations({ th: 'ลบ role setup ครับ' })
      .addStringOption(opt => opt.setName('name')
        .setDescription('Role setup name')
        .setDescriptionLocalizations({ th: 'ชื่อ role setup' })
        .setRequired(true).setAutocomplete(true))
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      listSetups(interaction.guildId).filter(s => s.name.toLowerCase().includes(focused))
        .slice(0, 25).map(s => ({ name: `${s.name} [${s.type}]`, value: s.name }))
    );
  },

  async execute(interaction) {
    const t = createTranslator(getGuildLanguage(interaction.guildId));
    if (!interaction.guildId) return interaction.reply({ content: t('common.error.guild_only'), flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId  = interaction.user.id;

    if (sub === 'new') {
      const name = interaction.options.getString('name').trim();
      const type = interaction.options.getString('type');
      if (!name)              return interaction.reply({ content: t('role_setup.command.name_required'), flags: MessageFlags.Ephemeral });
      if (name.includes(':')) return interaction.reply({ content: t('role_setup.command.name_has_colon'), flags: MessageFlags.Ephemeral });
      if (type !== 'menu' && type !== 'button' && type !== 'reaction') return interaction.reply({ content: t('role_setup.command.type_unsupported', { type }), flags: MessageFlags.Ephemeral });
      // 🔒 ฟรี: จำกัดให้สร้างได้แค่ type "reaction" เท่านั้น (menu/button สงวนไว้พรีเมียม)
      if (!isPremiumGuild(guildId) && type !== 'reaction') {
        const reason = t('role_setup.type_gate.reaction_only');
        return interaction.reply({ content: buildUpgradeMessage(t, reason), flags: MessageFlags.Ephemeral });
      }
      if (setupExists(guildId, name)) return interaction.reply({ content: t('role_setup.command.already_exists', { name }), flags: MessageFlags.Ephemeral });

      // 🔒 Quota gating: ฟรีจำกัด 1 ชุด/เซิร์ฟ — ของเก่าที่เกินโควตา
      // (สร้างไว้ก่อนมีระบบนี้) ยังแก้ไขได้ปกติ แค่ห้ามสร้างใหม่เพิ่ม
      const FREE_ROLE_SETUP_LIMIT = 1;
      if (!isPremiumGuild(guildId) && listSetups(guildId).length >= FREE_ROLE_SETUP_LIMIT) {
        const reason = t('role_setup.quota.reached', { limit: FREE_ROLE_SETUP_LIMIT });
        return interaction.reply({ content: buildUpgradeMessage(t, reason), flags: MessageFlags.Ephemeral });
      }

      const now = new Date().toISOString();
      const config = type === 'button'
        ? { buttons: [], maxRoles: null }
        : type === 'reaction'
          ? { reactions: [], postedMessageId: null } // postedMessageId เก็บหลังโพสต์ ใช้ lookup ตอน reaction event
          : { minValues: 0, maxValues: 1, roles: [], placeholder: null };
      saveSetup(guildId, name, { name, type, blocks: [], accentColor: null, lastPostedAt: null, config, createdBy: userId, createdAt: now, updatedBy: userId, updatedAt: now });
      sessions.set(sessionKey(guildId, userId), { name, guildId, isEdit: false, pendingChannelId: null });
      return interaction.reply(buildEditorPanel(userId, interaction.guildId));
    }

    if (sub === 'edit') {
      const name = interaction.options.getString('name').trim();
      if (!setupExists(guildId, name)) return interaction.reply({ content: t('role_setup.command.not_found', { name }), flags: MessageFlags.Ephemeral });
      sessions.set(sessionKey(guildId, userId), { name, guildId, isEdit: true, pendingChannelId: null });
      return interaction.reply(buildEditorPanel(userId, interaction.guildId));
    }

    if (sub === 'list') {
      const setups = listSetups(guildId);
      if (!setups.length) return interaction.reply({ content: t('role_setup.command.list_empty'), flags: MessageFlags.Ephemeral });
      const lines = setups.map((s, i) => t('role_setup.command.list_entry', {
        index: i + 1,
        name: s.name,
        type: s.type,
        roleCount: s.config?.roles?.length ?? 0,
        blockCount: s.blocks.length,
        postedNote: s.lastPostedAt ? t('role_setup.command.list_posted_note', { timestamp: toTs(s.lastPostedAt) }) : '',
        timestamp: toTs(s.updatedAt),
        userId: s.updatedBy,
      }));
      return interaction.reply({ content: t('role_setup.command.list_header', { count: setups.length }) + '\n\n' + lines.join('\n'), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name').trim();
      if (!setupExists(guildId, name)) {
        return interaction.reply({ content: t('role_setup.command.not_found', { name }), flags: MessageFlags.Ephemeral });
      }

      // เก็บ pending ก่อนแสดง confirm panel
      pendingDeletions.set(sessionKey(guildId, userId), { guildId, name });

      return interaction.reply({
        components: [
          new TextDisplayBuilder().setContent(t('role_setup.command.delete_confirm_header', { name })),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(RS.DEL_CONFIRM).setLabel(t('role_setup.command.delete_confirm_button')).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(RS.DEL_CANCEL).setLabel(t('role_setup.command.delete_cancel_button')).setStyle(ButtonStyle.Secondary),
          ),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  },

  // ─── Handle buttons (rs_*) ───────────────────────────────────────────────
  async handleButton(interaction) {
    const userId  = interaction.user.id;
    const guildId = interaction.guildId; // ต้องมีตอนต้นฟังก์ชันเลย เพราะ DEL_CONFIRM/DEL_CANCEL ใช้ query pendingDeletions/sessions ก่อนจะรู้จัก session
    const t = createTranslator(getGuildLanguage(guildId));

    // ── Delete confirm/cancel — ไม่ต้องการ session ────────────────────────
    if (interaction.customId === RS.DEL_CONFIRM) {
      const pending = pendingDeletions.get(sessionKey(guildId, userId));
      pendingDeletions.delete(sessionKey(guildId, userId));

      if (!pending) {
        await interaction.update({
          components: [new TextDisplayBuilder().setContent(t('role_setup.delete.expired'))],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      const deleted = deleteSetup(pending.guildId, pending.name);
      // ล้าง session ถ้ากำลังแก้ setup ที่ลบอยู่
      const session = sessions.get(sessionKey(guildId, userId));
      if (session?.guildId === pending.guildId && session?.name === pending.name) {
        sessions.delete(sessionKey(guildId, userId));
      }

      await interaction.update({
        components: [new TextDisplayBuilder().setContent(
          deleted
            ? t('role_setup.delete.success', { name: pending.name })
            : t('role_setup.delete.not_found', { name: pending.name })
        )],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.customId === RS.DEL_CANCEL) {
      pendingDeletions.delete(sessionKey(guildId, userId));
      await interaction.update({
        components: [new TextDisplayBuilder().setContent(t('role_setup.delete.cancelled'))],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    // ── ปุ่ม "🗑️ ลบตัวอย่างเดี๋ยวนี้" บนข้อความ preview ของ reaction type ────────────
    // ปุ่มนี้อยู่บน PUBLIC message ไม่ต้องการ session ใดๆ ทุกคนที่เห็นปุ่มกดได้
    if (interaction.customId.startsWith(PFX.PREVIEW_DEL)) {
      const messageId = interaction.customId.slice(PFX.PREVIEW_DEL.length);
      previewMessageIds.delete(messageId); // เอาออกจาก Set ก่อน เผื่อ timeout ยิงพร้อมกัน
      // deferUpdate ก่อนลบ — Discord จะแสดง loading state สั้นๆ แล้วหายไปพร้อมข้อความ
      await interaction.deferUpdate();
      try { await interaction.message.delete(); }
      catch { /* ข้อความถูกลบไปแล้ว หรือบอทไม่มีสิทธิ์ Manage Messages — ปล่อยผ่าน */ }
      return;
    }

    // ── ปุ่มที่เหลือต้องการ session ──────────────────────────────────────
    const session = sessions.get(sessionKey(guildId, userId));
    if (!session) return interaction.reply({ content: t('role_setup.error.session_expired'), flags: MessageFlags.Ephemeral });
    const { name } = session; // guildId ไม่ destructure ซ้ำแล้ว เพราะมีตัวแปรนี้จาก interaction.guildId อยู่แล้วตอนต้นฟังก์ชัน (รับประกันตรงกับ session.guildId เสมอ เพราะ query ด้วย key ที่มี guildId นี้)

    // ── Block management prefix handlers ──────────────────────────────────
    if (interaction.customId.startsWith(PFX.EDIT)) {
      const index = Number(interaction.customId.slice(PFX.EDIT.length));
      const setup = loadSetup(guildId, name);
      const block = setup?.blocks?.[index];
      if (!block) { await interaction.reply({ content: t('role_setup.block.gone'), flags: MessageFlags.Ephemeral }); return; }
      if (block.type === 'separator') {
        mutateSetup(guildId, name, userId, s => { s.blocks[index].spacing = s.blocks[index].spacing === 'large' ? 'small' : 'large'; });
        await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
      }
      if (block.type === 'text') {
        const modal = new ModalBuilder().setCustomId(`${PFX.E_TEXT}${index}`).setTitle(t('role_setup.modal.title.edit_text'));
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(RS.INPUT_TEXT).setLabel(t('role_setup.modal.text_content_label'))
            .setStyle(TextInputStyle.Paragraph).setValue(block.content).setRequired(true).setMaxLength(4000)
        ));
        await interaction.showModal(modal); return;
      }
      if (block.type === 'gallery') {
        const modal = new ModalBuilder().setCustomId(`${PFX.E_IMG}${index}`).setTitle(t('role_setup.modal.title.edit_image'));
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(RS.INPUT_IMAGE).setLabel(t('role_setup.modal.image_urls_label'))
            .setStyle(TextInputStyle.Paragraph).setValue(block.items.map(i => i.url).join('\n')).setRequired(true).setMaxLength(2000)
        ));
        await interaction.showModal(modal); return;
      }
      if (block.type === 'section') {
        const modal = buildSectionModal(`${PFX.E_SEC}${index}`, t('role_setup.modal.title.edit_section'), { text: block.text, thumbnail: block.thumbnail }, t);
        await interaction.showModal(modal); return;
      }
      return;
    }

    if (interaction.customId.startsWith(PFX.DEL)) {
      const index = Number(interaction.customId.slice(PFX.DEL.length));
      mutateSetup(guildId, name, userId, s => s.blocks.splice(index, 1));
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }

    if (interaction.customId.startsWith(PFX.UP)) {
      const index = Number(interaction.customId.slice(PFX.UP.length));
      if (index === 0) { await interaction.reply({ content: t('role_setup.block.already_top'), flags: MessageFlags.Ephemeral }); return; }
      mutateSetup(guildId, name, userId, s => { [s.blocks[index - 1], s.blocks[index]] = [s.blocks[index], s.blocks[index - 1]]; });
      const s = loadSetup(guildId, name);
      await interaction.update(buildBlockActionPanel(index - 1, s.blocks[index - 1], s.blocks.length, interaction.guildId)); return;
    }

    if (interaction.customId.startsWith(PFX.DOWN)) {
      const index = Number(interaction.customId.slice(PFX.DOWN.length));
      const s0    = loadSetup(guildId, name);
      if (index >= s0.blocks.length - 1) { await interaction.reply({ content: t('role_setup.block.already_bottom'), flags: MessageFlags.Ephemeral }); return; }
      mutateSetup(guildId, name, userId, s => { [s.blocks[index], s.blocks[index + 1]] = [s.blocks[index + 1], s.blocks[index]]; });
      const s = loadSetup(guildId, name);
      await interaction.update(buildBlockActionPanel(index + 1, s.blocks[index + 1], s.blocks.length, interaction.guildId)); return;
    }

    if (interaction.customId.startsWith(PFX.INSERT)) {
      const i = Number(interaction.customId.slice(PFX.INSERT.length));
      await interaction.update(buildInsertTypePanel(i + 1, interaction.guildId)); return;
    }

    if (interaction.customId.startsWith(PFX.INS_T)) {
      const pos = Number(interaction.customId.slice(PFX.INS_T.length));
      const modal = new ModalBuilder().setCustomId(`${PFX.I_TEXT}${pos}`).setTitle(t('role_setup.modal.title.insert_text'));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(RS.INPUT_TEXT).setLabel(t('role_setup.modal.text_content_label'))
          .setStyle(TextInputStyle.Paragraph).setPlaceholder(t('role_setup.modal.text_content_placeholder')).setRequired(true).setMaxLength(4000)
      ));
      await interaction.showModal(modal); return;
    }

    if (interaction.customId.startsWith(PFX.INS_I)) {
      const pos = Number(interaction.customId.slice(PFX.INS_I.length));
      const modal = new ModalBuilder().setCustomId(`${PFX.I_IMG}${pos}`).setTitle(t('role_setup.modal.title.insert_image'));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(RS.INPUT_IMAGE).setLabel(t('role_setup.modal.image_urls_label'))
          .setStyle(TextInputStyle.Paragraph).setPlaceholder('https://...').setRequired(true).setMaxLength(2000)
      ));
      await interaction.showModal(modal); return;
    }

    if (interaction.customId.startsWith(PFX.INS_SEC)) {
      const pos   = Number(interaction.customId.slice(PFX.INS_SEC.length));
      const modal = buildSectionModal(`${PFX.I_SEC}${pos}`, t('role_setup.modal.title.insert_section'), {}, t);
      await interaction.showModal(modal); return;
    }

    if (interaction.customId.startsWith(PFX.INS_S)) {
      const pos = Number(interaction.customId.slice(PFX.INS_S.length));
      mutateSetup(guildId, name, userId, s => s.blocks.splice(pos, 0, { type: 'separator', spacing: 'small' }));
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }

    // ── จัดการปุ่ม (button type): กด "แก้ไข" บน action panel ─────────────────
    // เปิด modal เดิม (RS.MODAL_BTN) แต่ customId มี index ฝังท้ายเพื่อรู้ว่าเป็น edit mode
    if (interaction.customId.startsWith(PFX.BTN_ACTION_EDIT)) {
      const index  = Number(interaction.customId.slice(PFX.BTN_ACTION_EDIT.length));
      const setup  = loadSetup(guildId, name);
      const button = setup?.config?.buttons?.[index];
      if (!button) {
        await interaction.update({
          components: [new TextDisplayBuilder().setContent(t('role_setup.button.not_found'))],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      const modal = new ModalBuilder().setCustomId(`${PFX.MODAL_EDIT_BTN}${index}`).setTitle(t('role_setup.modal.title.edit_button'));
      const labelInput = new TextInputBuilder().setCustomId(RS.BTN_INPUT_LABEL).setLabel(t('role_setup.modal.btn_label_label'))
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(button.label);
      const emojiInput = new TextInputBuilder().setCustomId(RS.BTN_INPUT_EMOJI).setLabel(t('role_setup.modal.btn_emoji_label'))
        .setStyle(TextInputStyle.Short).setPlaceholder(t('role_setup.modal.btn_emoji_placeholder')).setRequired(false).setMaxLength(60);
      if (button.emoji) emojiInput.setValue(button.emoji); // pre-fill เฉพาะตอนมีค่าจริง กัน setValue('') ผิดพลาด

      modal.addComponents(
        new ActionRowBuilder().addComponents(labelInput),
        new ActionRowBuilder().addComponents(emojiInput),
      );
      await interaction.showModal(modal);
      return;
    }

    // ── จัดการปุ่ม: กด "ลบ" บน action panel → ลบทันที ไม่ต้อง confirm เพิ่ม ──
    if (interaction.customId.startsWith(PFX.BTN_ACTION_DEL)) {
      const index = Number(interaction.customId.slice(PFX.BTN_ACTION_DEL.length));
      let removedLabel = null;
      mutateSetup(guildId, name, userId, s => {
        const removed = s.config.buttons?.[index];
        if (removed) removedLabel = removed.label;
        s.config.buttons = (s.config.buttons ?? []).filter((_, i) => i !== index);
      });
      await interaction.update(buildBtnManagePanel(userId, interaction.guild, interaction.guildId));
      if (removedLabel) await interaction.followUp({ content: t('role_setup.button.deleted', { label: removedLabel }), flags: MessageFlags.Ephemeral });
      return;
    }

    // ── reaction type: กด "แก้ไข emoji" → เปิด modal pre-filled ─────────────
    if (interaction.customId.startsWith(PFX.RXN_ACTION_EDIT)) {
      const index  = Number(interaction.customId.slice(PFX.RXN_ACTION_EDIT.length));
      const setup  = loadSetup(guildId, name);
      const rxn    = setup?.config?.reactions?.[index];
      if (!rxn) { await interaction.update(buildRxnManagePanel(userId, interaction.guild, interaction.guildId)); return; }
      const modal = new ModalBuilder().setCustomId(`${PFX.MODAL_EDIT_RXN}${index}`).setTitle(t('role_setup.modal.title.edit_reaction'));
      const emojiInput = new TextInputBuilder().setCustomId(RS.RXN_INPUT_EMOJI)
        .setLabel(t('role_setup.modal.rxn_emoji_label'))
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setValue(rxn.emoji);
      modal.addComponents(new ActionRowBuilder().addComponents(emojiInput));
      await interaction.showModal(modal);
      return;
    }

    // ── reaction type: กด "ลบ" → ลบทันที กลับ list ──────────────────────────
    if (interaction.customId.startsWith(PFX.RXN_ACTION_DEL)) {
      const index = Number(interaction.customId.slice(PFX.RXN_ACTION_DEL.length));
      let removedEmoji = null;
      mutateSetup(guildId, name, userId, s => {
        const removed = s.config.reactions?.[index];
        if (removed) removedEmoji = removed.emoji;
        s.config.reactions = (s.config.reactions ?? []).filter((_, i) => i !== index);
      });
      await interaction.update(buildRxnManagePanel(userId, interaction.guild, interaction.guildId));
      if (removedEmoji) await interaction.followUp({ content: t('role_setup.reaction.deleted', { emoji: removedEmoji }), flags: MessageFlags.Ephemeral });
      return;
    }

    // ── Switch สำหรับ customId คงที่ ─────────────────────────────────────
    switch (interaction.customId) {
      case RS.ADD_TEXT: {
        const modal = new ModalBuilder().setCustomId(RS.MODAL_TEXT).setTitle(t('role_setup.modal.title.add_text'));
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(RS.INPUT_TEXT).setLabel(t('role_setup.modal.text_content_label'))
            .setStyle(TextInputStyle.Paragraph).setPlaceholder(t('role_setup.modal.text_content_placeholder')).setRequired(true).setMaxLength(4000)
        ));
        await interaction.showModal(modal); break;
      }
      case RS.ADD_IMAGE: {
        const modal = new ModalBuilder().setCustomId(RS.MODAL_IMAGE).setTitle(t('role_setup.modal.title.add_image'));
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(RS.INPUT_IMAGE).setLabel(t('role_setup.modal.image_urls_label'))
            .setStyle(TextInputStyle.Paragraph).setPlaceholder('https://example.com/1.png').setRequired(true).setMaxLength(2000)
        ));
        await interaction.showModal(modal); break;
      }
      case RS.ADD_SECTION: {
        const modal = buildSectionModal(RS.MODAL_SECTION, t('role_setup.modal.title.add_section'), {}, t);
        await interaction.showModal(modal); break;
      }
      case RS.ADD_SEP: {
        mutateSetup(guildId, name, userId, s => s.blocks.push({ type: 'separator', spacing: 'small' }));
        await interaction.update(buildEditorPanel(userId, interaction.guildId)); break;
      }
      case RS.COLOR:        { await interaction.update(buildColorPanel(interaction.guildId)); break; }
      case RS.COLOR_BACK:   { await interaction.update(buildEditorPanel(userId, interaction.guildId)); break; }
      case RS.MANAGE_BLOCKS:{ await interaction.update(buildManageBlocksPanel(userId, interaction.guildId)); break; }
      case RS.MANAGE_BACK:  { await interaction.update(buildEditorPanel(userId, interaction.guildId)); break; }
      case RS.ADD_ROLE_BTN: { await interaction.update(buildAddRolePanel(name, interaction.guildId)); break; }
      case RS.ADD_ROLE_BACK:{ pendingRoles.delete(sessionKey(guildId, userId)); await interaction.update(buildEditorPanel(userId, interaction.guildId)); break; }
      case RS.MANAGE_ROLES: { await interaction.update(buildRoleManagePanel(userId, interaction.guild, interaction.guildId)); break; }
      case RS.ROLE_BACK:    { await interaction.update(buildEditorPanel(userId, interaction.guildId)); break; }

      // ── button type: ขั้นที่ 1 — เปิด modal รับป้ายชื่อปุ่ม + emoji ─────────
      case RS.ADD_BTN_BTN: {
        const modal = new ModalBuilder().setCustomId(RS.MODAL_BTN).setTitle(t('role_setup.modal.title.add_button'));
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(RS.BTN_INPUT_LABEL).setLabel(t('role_setup.modal.btn_label_label'))
              .setStyle(TextInputStyle.Short).setPlaceholder(t('role_setup.modal.btn_label_placeholder')).setRequired(true).setMaxLength(80)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(RS.BTN_INPUT_EMOJI).setLabel(t('role_setup.modal.btn_emoji_label'))
              .setStyle(TextInputStyle.Short).setPlaceholder(t('role_setup.modal.btn_emoji_placeholder')).setRequired(false).setMaxLength(60)
          ),
        );
        await interaction.showModal(modal); break;
      }

      // ── button type: ขั้นที่ 2 — เลือกสีปุ่ม (4 แบบ) แล้วไปขั้นที่ 3 (เลือกยศ) ──
      case RS.BTN_COLOR_PRIM:
      case RS.BTN_COLOR_SEC:
      case RS.BTN_COLOR_SUCC:
      case RS.BTN_COLOR_DANG: {
        const pending = pendingButtonAdd.get(sessionKey(guildId, userId));
        if (!pending) { await interaction.update(buildEditorPanel(userId, interaction.guildId)); break; }

        const styleMap = {
          [RS.BTN_COLOR_PRIM]: ButtonStyle.Primary,
          [RS.BTN_COLOR_SEC]:  ButtonStyle.Secondary,
          [RS.BTN_COLOR_SUCC]: ButtonStyle.Success,
          [RS.BTN_COLOR_DANG]: ButtonStyle.Danger,
        };
        pending.style = styleMap[interaction.customId];
        pendingButtonAdd.set(sessionKey(guildId, userId), pending);

        // edit mode (pending.editIndex != null) → แสดงตัวเลือก "คงยศเดิม" พร้อมชื่อยศจริง
        let currentRoleId   = null;
        let currentRoleName = null;
        if (pending.editIndex != null) {
          const s0 = loadSetup(pending.guildId, pending.name);
          currentRoleId = s0?.config?.buttons?.[pending.editIndex]?.roleId ?? null;
          if (currentRoleId) {
            currentRoleName = interaction.guild.roles.cache.get(currentRoleId)?.name ?? currentRoleId;
          }
        }

        const { payload, assignableCount } = buildButtonRolePanel(interaction.guild, currentRoleId, currentRoleName, interaction.guildId);
        if (assignableCount === 0) {
          pendingButtonAdd.delete(sessionKey(guildId, userId));
          await interaction.update({
            components: [new TextDisplayBuilder().setContent(t('role_setup.role_button.no_roles'))],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          break;
        }
        await interaction.update(payload);
        break;
      }

      case RS.BTN_COLOR_BACK: { pendingButtonAdd.delete(sessionKey(guildId, userId)); await interaction.update(buildEditorPanel(userId, interaction.guildId)); break; }
      case RS.BTN_ROLE_BACK:  { pendingButtonAdd.delete(sessionKey(guildId, userId)); await interaction.update(buildEditorPanel(userId, interaction.guildId)); break; }

      // 🩹 ทั้ง MANAGE_BTNS และ BTN_ACTION_BACK เรียก buildBtnManagePanel() ตัวเดียวกัน
      // (BTN_ACTION_BACK คือปุ่ม "← กลับ" จากหน้า action panel กลับมาที่หน้า list นี้)
      // เลยเสี่ยงเจอ error เดียวกันได้ทั้งคู่ ห่อด้วย safeUpdatePanel() ทั้งสองจุด
      case RS.MANAGE_BTNS:     { await safeUpdatePanel(interaction, () => buildBtnManagePanel(userId, interaction.guild, interaction.guildId), interaction.guildId); break; }
      case RS.BTN_MANAGE_BACK: { await interaction.update(buildEditorPanel(userId, interaction.guildId)); break; }
      case RS.BTN_ACTION_BACK: { await safeUpdatePanel(interaction, () => buildBtnManagePanel(userId, interaction.guild, interaction.guildId), interaction.guildId); break; }

      // ── reaction type: ปุ่ม "➕ เพิ่ม Reaction" → เปิด modal ใส่ emoji ────────
      case RS.ADD_REACTION: {
        const modal = new ModalBuilder().setCustomId(RS.MODAL_REACTION).setTitle(t('role_setup.modal.title.add_reaction'));
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(RS.RXN_INPUT_EMOJI)
            .setLabel(t('role_setup.modal.rxn_emoji_label'))
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(t('role_setup.modal.rxn_emoji_placeholder')).setRequired(true).setMaxLength(60)
        ));
        await interaction.showModal(modal); break;
      }
      // 🩹 เหตุผลเดียวกับ MANAGE_BTNS/BTN_ACTION_BACK ด้านบน — buildRxnManagePanel()
      // มีความเสี่ยงเดียวกัน (emoji เก่าที่ format ถูกแต่ id ถูกลบไปแล้ว) เลยห่อด้วย
      // safeUpdatePanel() ทั้งสองจุดที่เรียกฟังก์ชันนี้เช่นกัน
      case RS.MANAGE_REACTIONS: { await safeUpdatePanel(interaction, () => buildRxnManagePanel(userId, interaction.guild, interaction.guildId), interaction.guildId); break; }
      case RS.RXN_MANAGE_BACK:  { await interaction.update(buildEditorPanel(userId, interaction.guildId)); break; }
      case RS.RXN_ACTION_BACK:  { await safeUpdatePanel(interaction, () => buildRxnManagePanel(userId, interaction.guild, interaction.guildId), interaction.guildId); break; }
      case RS.RXN_ROLE_BACK:    { pendingReactionAdd.delete(sessionKey(guildId, userId)); await interaction.update(buildEditorPanel(userId, interaction.guildId)); break; }

      // ── จัดการปุ่ม: กด "แก้ไข" บน action panel → เปิด modal pre-filled ──────
      case RS.MAX_ROLES: {
        const setup = loadSetup(guildId, name);
        await interaction.update(buildMaxRolesPanel(name, setup?.config?.maxRoles ?? null, interaction.guildId));
        break;
      }

      case RS.CONFIG: {
        const setup = loadSetup(guildId, name);
        const modal = new ModalBuilder().setCustomId(RS.MODAL_CONFIG).setTitle(t('role_setup.modal.title.config'));
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(RS.INPUT_MIN)
              .setLabel(t('role_setup.modal.config_min_label'))
              .setStyle(TextInputStyle.Short).setValue(String(setup?.config?.minValues ?? 0))
              .setRequired(true).setMaxLength(2)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(RS.INPUT_MAX)
              .setLabel(t('role_setup.modal.config_max_label'))
              .setStyle(TextInputStyle.Short).setValue(String(setup?.config?.maxValues ?? 1))
              .setRequired(true).setMaxLength(2)
          ),
          new ActionRowBuilder().addComponents(
            (() => {
              const inp = new TextInputBuilder().setCustomId(RS.INPUT_PH)
                .setLabel(t('role_setup.modal.config_ph_label'))
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(t('role_setup.modal.config_ph_placeholder'))
                .setRequired(false).setMaxLength(150);
              // setValue ต้องเป็น string ที่ไม่ว่าง เพื่อกัน validation error
              if (setup?.config?.placeholder) inp.setValue(setup.config.placeholder);
              return inp;
            })()
          ),
        );
        await interaction.showModal(modal); break;
      }

      // DONE: เปิด ChannelSelectMenu แทนการปิด session ทันที
      // ── ดูตัวอย่าง — เหมือนโพสต์จริงทุกอย่าง แต่ ephemeral เห็นแค่คนกด ──────
      case RS.PREVIEW: {
        const setup = loadSetup(guildId, name);
        const previewComponents = [];

        // build layout blocks (ถ้ามี)
        if (setup?.blocks?.length) {
          try {
            const layout = buildMessageFromSchema({ blocks: setup.blocks, accentColor: setup.accentColor });
            previewComponents.push(...layout.components);
          } catch (e) {
            await interaction.reply({ content: t('role_setup.preview.layout_error', { error: e.message }), flags: MessageFlags.Ephemeral });
            break;
          }
        }

        // ── reaction type: ส่งข้อความจริงในช่อง เพราะ ephemeral react ไม่ได้ ──────
        if (setup?.type === 'reaction') {
          const reactions = setup.config?.reactions ?? [];
          if (!reactions.length) {
            await interaction.reply({ content: t('role_setup.preview.no_reactions'), flags: MessageFlags.Ephemeral });
            break;
          }

          // เพิ่ม notice และปุ่มลบลงใน components
          previewComponents.push(new TextDisplayBuilder().setContent(t('role_setup.preview.reaction_notice')));

          // deferReply ก่อนทำงาน เพราะ react หลาย emoji อาจใช้เวลา > 3 วินาที
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // ส่งข้อความจริงในช่อง (ไม่ใช่ ephemeral)
          let preview;
          try {
            preview = await interaction.channel.send({
              components: [
                ...previewComponents,
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`${PFX.PREVIEW_DEL}${Date.now()}`) // ใช้ timestamp เป็น placeholder ก่อนรู้ messageId จริง
                    .setLabel(t('role_setup.preview.delete_button'))
                    .setStyle(ButtonStyle.Secondary)
                ),
              ],
              flags: MessageFlags.IsComponentsV2,
            });
          } catch (e) {
            await interaction.editReply({ content: t('role_setup.preview.send_failed') });
            break;
          }

          // แก้ปุ่มให้ใช้ messageId จริง (แทน timestamp ที่ใส่ไปก่อน)
          // เพื่อให้ delete handler รู้ว่าต้อง remove messageId ไหนออกจาก Set
          try {
            await preview.edit({
              components: [
                ...previewComponents,
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`${PFX.PREVIEW_DEL}${preview.id}`)
                    .setLabel(t('role_setup.preview.delete_button'))
                    .setStyle(ButtonStyle.Secondary)
                ),
              ],
              flags: MessageFlags.IsComponentsV2,
            });
          } catch { /* edit ไม่สำเร็จก็ไม่เป็นไร ปุ่มยังใช้งานได้ แค่ messageId ใน customId จะต่างกัน */ }

          // บอท react emoji ทุกอัน (delay 400ms ต่ออันกัน rate limit)
          for (const r of reactions) {
            try {
              await reactWithEmoji(preview, r.emoji);
              await new Promise(res => setTimeout(res, 400));
            } catch { /* emoji ใช้ไม่ได้ — ข้าม */ }
          }

          // ลงทะเบียน messageId ไว้ใน Set เพื่อให้ reaction handler skip
          previewMessageIds.add(preview.id);

          // Auto-delete หลัง 60 วินาที
          setTimeout(async () => {
            previewMessageIds.delete(preview.id);
            try { await preview.delete(); } catch { /* ถูกลบไปแล้ว — ปล่อยผ่าน */ }
          }, 60_000);

          await interaction.editReply({ content: t('role_setup.preview.sent_success') });
          break;
        }

        // ── menu / button type: ส่ง ephemeral เหมือนเดิม ────────────────────────
        if (setup?.type === 'button') {
          const buttons = setup.config?.buttons ?? [];
          if (!buttons.length) {
            await interaction.reply({ content: t('role_setup.preview.no_buttons'), flags: MessageFlags.Ephemeral });
            break;
          }
          const { rows, skippedCount } = buildRoleButtonRows(interaction.guild, buttons, name);
          if (!rows.length) {
            await interaction.reply({ content: t('role_setup.post.all_roles_deleted'), flags: MessageFlags.Ephemeral });
            break;
          }
          previewComponents.push(...rows);
          if (skippedCount > 0) previewComponents.push(new TextDisplayBuilder().setContent(t('role_setup.post.skipped_buttons_warning', { count: skippedCount })));

        } else if (setup?.type === 'menu') {
          const roles  = setup.config?.roles ?? [];
          const options = roles
            .map(r => { const gr = interaction.guild.roles.cache.get(r.id); return gr ? { label: gr.name.slice(0, 100), value: r.id, ...(r.description ? { description: r.description.slice(0, 100) } : {}) } : null; })
            .filter(Boolean);
          if (!options.length) {
            await interaction.reply({ content: !roles.length ? t('role_setup.preview.no_roles') : t('role_setup.post.all_roles_deleted'), flags: MessageFlags.Ephemeral });
            break;
          }
          const minV = setup.config.minValues ?? 0;
          const maxV = Math.min(setup.config.maxValues ?? 1, options.length);
          const ph   = setup.config.placeholder ?? (maxV === 1 ? t('role_setup.post.placeholder_single') : t('role_setup.post.placeholder_multi', { min: minV, max: maxV }));
          const sel  = new StringSelectMenuBuilder()
            .setCustomId(`${SETUP_PREFIX}${name}`).setPlaceholder(ph.slice(0, 150))
            .setMinValues(minV).setMaxValues(maxV).addOptions(options);
          previewComponents.push(new ActionRowBuilder().addComponents(sel));
        }

        await interaction.reply({ content: t('role_setup.preview.header', { name }), flags: MessageFlags.Ephemeral });
        if (previewComponents.length) {
          await interaction.followUp({ components: previewComponents, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        break;
      }

      case RS.DONE: {
        const setup    = loadSetup(guildId, name);
        const wasPosted = !!setup?.lastPostedAt;
        await interaction.update(buildDoneChannelPanel(name, wasPosted, interaction.guildId)); break;
      }

    }
  },

  // ─── Handle StringSelectMenu (rs_*) ─────────────────────────────────────
  async handleSelectMenu(interaction) {
    const userId  = interaction.user.id;
    const guildId = interaction.guildId; // เพิ่มเข้ามาใหม่ — ต้องใช้ประกอบ session key ผสม
    const t = createTranslator(getGuildLanguage(guildId));
    const session = sessions.get(sessionKey(guildId, userId));
    if (!session) return interaction.reply({ content: t('role_setup.error.session_expired'), flags: MessageFlags.Ephemeral });
    const { name } = session; // guildId ไม่ destructure ซ้ำแล้ว เพราะมีตัวแปรนี้จาก interaction.guildId อยู่แล้วตอนต้นฟังก์ชัน (รับประกันตรงกับ session.guildId เสมอ เพราะ query ด้วย key ที่มี guildId นี้)

    if (interaction.customId === RS.COLOR_SELECT) {
      const val = interaction.values[0];
      if (val === 'none') { mutateSetup(guildId, name, userId, s => { s.accentColor = null; }); await interaction.update(buildEditorPanel(userId, interaction.guildId)); return; }
      if (val === 'custom') {
        const modal = new ModalBuilder().setCustomId(RS.MODAL_COLOR).setTitle(t('role_setup.modal.title.color_custom'));
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(RS.INPUT_COLOR).setLabel(t('role_setup.modal.hex_label'))
            .setStyle(TextInputStyle.Short).setPlaceholder('#FF66AA').setRequired(true).setMaxLength(7)
        ));
        await interaction.showModal(modal); return;
      }
      mutateSetup(guildId, name, userId, s => { s.accentColor = val; });
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }

    if (interaction.customId === RS.MANAGE_SELECT) {
      const index = Number(interaction.values[0]);
      const setup = loadSetup(guildId, name);
      const block = setup?.blocks?.[index];
      if (!block) { await interaction.update(buildEditorPanel(userId, interaction.guildId)); return; }
      await interaction.update(buildBlockActionPanel(index, block, setup.blocks.length, interaction.guildId)); return;
    }

    if (interaction.customId === RS.ROLE_REMOVE) {
      const toRemove = new Set(interaction.values);
      let removed = 0;
      mutateSetup(guildId, name, userId, s => {
        const before = s.config.roles.length;
        s.config.roles = s.config.roles.filter(r => !toRemove.has(r.id));
        removed = before - s.config.roles.length;
        s.config.maxValues = Math.min(s.config.maxValues, s.config.roles.length || 1);
      });
      await interaction.update(buildEditorPanel(userId, interaction.guildId));
      if (removed > 0) await interaction.followUp({ content: t('role_setup.role_manage.removed', { count: removed }), flags: MessageFlags.Ephemeral });
      return;
    }

    // ── button type ขั้นที่ 3: เลือกยศ → ผูกกับปุ่ม → บันทึกลง config.buttons[] ──
    if (interaction.customId === RS.BTN_ROLE_SEL) {
      const pending = pendingButtonAdd.get(sessionKey(guildId, userId));
      if (!pending) { await interaction.update(buildEditorPanel(userId, interaction.guildId)); return; }
      pendingButtonAdd.delete(sessionKey(guildId, userId));

      const selectedValue = interaction.values[0];
      const isEdit        = pending.editIndex != null;

      const s0 = loadSetup(pending.guildId, pending.name);
      if (!s0) { await interaction.update(buildEditorPanel(userId, interaction.guildId)); return; }

      // ── กำหนด roleId จริงที่จะบันทึก ──────────────────────────────────────
      let roleId;
      let roleName;
      let keptSameRole = false;

      if (selectedValue === KEEP_ROLE_VALUE) {
        // ผู้ใช้เลือก "✅ คงยศเดิม" → ดึง roleId เดิมจาก config มาใช้ต่อ
        roleId = s0?.config?.buttons?.[pending.editIndex]?.roleId;
        if (!roleId) { await interaction.update(buildEditorPanel(userId, interaction.guildId)); return; }
        roleName     = interaction.guild.roles.cache.get(roleId)?.name ?? roleId;
        keptSameRole = true;
      } else {
        roleId   = selectedValue;
        roleName = interaction.guild.roles.cache.get(roleId)?.name ?? roleId;
      }

      if (!isEdit && (s0.config.buttons?.length ?? 0) >= 25) {
        await interaction.update({
          components: [new TextDisplayBuilder().setContent(t('role_setup.button.max_reached'))],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      // ── กันยศซ้ำ (ข้ามถ้าเลือก "คงยศเดิม" เพราะ roleId ไม่เปลี่ยน) ──────
      if (!keptSameRole) {
        const existingButtons    = s0.config.buttons ?? [];
        const conflictsWithOther = existingButtons.some((b, i) => b.roleId === roleId && i !== pending.editIndex);
        if (conflictsWithOther) {
          await interaction.update({
            components: [new TextDisplayBuilder().setContent(t('role_setup.button.role_conflict', { name: roleName }))],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          return;
        }
      }

      const newButtonData = { roleId, label: pending.label, emoji: pending.emoji, style: pending.style };

      if (isEdit) {
        mutateSetup(pending.guildId, pending.name, userId, s => {
          if (!s.config.buttons) s.config.buttons = [];
          s.config.buttons[pending.editIndex] = newButtonData;
        });
        // กลับแผงควบคุมหลักเสมอ ไม่ว่าจะคงยศเดิมหรือเปลี่ยนยศใหม่
        await interaction.update(buildEditorPanel(userId, interaction.guildId));
        const msg = keptSameRole
          ? t('role_setup.button.edited_same_role', { label: pending.label, name: roleName })
          : t('role_setup.button.edited_new_role', { label: pending.label, name: roleName });
        await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
      } else {
        mutateSetup(pending.guildId, pending.name, userId, s => {
          if (!s.config.buttons) s.config.buttons = [];
          s.config.buttons.push(newButtonData);
        });
        await interaction.update(buildEditorPanel(userId, interaction.guildId));
        await interaction.followUp({ content: t('role_setup.button.added', { label: pending.label, name: roleName }), flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // ── จัดการปุ่ม: เลือกปุ่มจาก list (single select) → แสดง action panel ───
    if (interaction.customId === RS.BTN_MANAGE_SELECT) {
      const index  = Number(interaction.values[0]);
      const setup  = loadSetup(guildId, name);
      const button = setup?.config?.buttons?.[index];
      if (!button) { await interaction.update(buildBtnManagePanel(userId, interaction.guild, interaction.guildId)); return; }
      await interaction.update(buildBtnActionPanel(index, button, interaction.guild, interaction.guildId));
      return;
    }

    // ── จำนวนยศสูงสุด: บันทึกค่าที่เลือก ────────────────────────────────
    if (interaction.customId === RS.MAX_ROLES_SELECT) {
      const value    = interaction.values[0];
      const maxRoles = value === 'unlimited' ? null : Number(value);
      mutateSetup(guildId, name, userId, s => { s.config.maxRoles = maxRoles; });
      await interaction.update(buildEditorPanel(userId, interaction.guildId));
      const label = maxRoles === null ? t('role_setup.suffix.max_roles_unlimited') : t('role_setup.max_roles.count_label', { count: maxRoles });
      await interaction.followUp({ content: t('role_setup.max_roles.set_success', { label }), flags: MessageFlags.Ephemeral });
      return;
    }

    // ── reaction type: เลือกปุ่มจาก list → action panel ─────────────────────
    if (interaction.customId === RS.RXN_MANAGE_SELECT) {
      const index = Number(interaction.values[0]);
      const setup = loadSetup(guildId, name);
      const rxn   = setup?.config?.reactions?.[index];
      if (!rxn) { await interaction.update(buildRxnManagePanel(userId, interaction.guild, interaction.guildId)); return; }
      await interaction.update(buildRxnActionPanel(index, rxn, interaction.guild, interaction.guildId));
      return;
    }

    // ── reaction type: เลือกยศ (ขั้นที่ 2) → บันทึก { emoji, roleId } ─────────
    if (interaction.customId === RS.RXN_ROLE_SEL) {
      const pending = pendingReactionAdd.get(sessionKey(guildId, userId));
      if (!pending) { await interaction.update(buildEditorPanel(userId, interaction.guildId)); return; }
      pendingReactionAdd.delete(sessionKey(guildId, userId));

      const selectedValue = interaction.values[0];
      const isEdit        = pending.editIndex != null;
      const s0            = loadSetup(pending.guildId, pending.name);
      if (!s0) { await interaction.update(buildEditorPanel(userId, interaction.guildId)); return; }

      // กำหนด roleId จริง — ถ้าเลือก "คงยศเดิม" ใช้ roleId เดิมจาก config
      let roleId, roleName, keptSameRole = false;
      if (selectedValue === KEEP_ROLE_VALUE) {
        roleId   = s0?.config?.reactions?.[pending.editIndex]?.roleId;
        if (!roleId) { await interaction.update(buildEditorPanel(userId, interaction.guildId)); return; }
        roleName     = interaction.guild.roles.cache.get(roleId)?.name ?? roleId;
        keptSameRole = true;
      } else {
        roleId   = selectedValue;
        roleName = interaction.guild.roles.cache.get(roleId)?.name ?? roleId;
      }

      const newRxn = { emoji: pending.emoji, roleId };
      if (isEdit) {
        mutateSetup(pending.guildId, pending.name, userId, s => {
          if (!s.config.reactions) s.config.reactions = [];
          s.config.reactions[pending.editIndex] = newRxn;
        });
        await interaction.update(buildEditorPanel(userId, interaction.guildId));
        const msg = keptSameRole
          ? t('role_setup.reaction.edited_same_role', { emoji: pending.emoji, name: roleName })
          : t('role_setup.reaction.edited_new_role', { emoji: pending.emoji, name: roleName });
        await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
      } else {
        // 🔒 ฟรี: จำกัด reaction สูงสุด 2 ตัวต่อ setup (พรีเมียมได้สูงสุด
        // 20 ตามลิมิตของ Discord เอง — เช็คนี้ต้องมาก่อนเช็ค >= 20 เดิม)
        const FREE_REACTION_LIMIT = 2;
        if (!isPremiumGuild(pending.guildId) && (s0.config.reactions?.length ?? 0) >= FREE_REACTION_LIMIT) {
          const reason = t('role_setup.reaction_gate.max_reached', { limit: FREE_REACTION_LIMIT });
          return interaction.update({
            components: [new TextDisplayBuilder().setContent(buildUpgradeMessage(t, reason))],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        }
        if ((s0.config.reactions?.length ?? 0) >= 20) {
          return interaction.update({
            components: [new TextDisplayBuilder().setContent(t('role_setup.reaction.max_reached'))],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        }
        mutateSetup(pending.guildId, pending.name, userId, s => {
          if (!s.config.reactions) s.config.reactions = [];
          s.config.reactions.push(newRxn);
        });
        await interaction.update(buildEditorPanel(userId, interaction.guildId));
        await interaction.followUp({ content: t('role_setup.reaction.added', { emoji: pending.emoji, name: roleName }), flags: MessageFlags.Ephemeral });
      }
      return;
    }
  },

  // ─── Handle ChannelSelectMenu (rs_done_chan) ──────────────────────────────
  async handleChannelSelect(interaction) {
    if (interaction.customId !== RS.DONE_CHAN_SEL) return;
    const userId  = interaction.user.id;
    const guildId = interaction.guildId; // เพิ่มเข้ามาใหม่ — ต้องใช้ประกอบ session key ผสม
    const t = createTranslator(getGuildLanguage(guildId));
    const session = sessions.get(sessionKey(guildId, userId));
    if (!session) return interaction.reply({ content: t('role_setup.error.session_expired'), flags: MessageFlags.Ephemeral });

    // deferUpdate ทันที เพื่อหยุด 3-วินาที timeout ก่อนที่ doPost จะทำงาน
    await interaction.deferUpdate();

    const channelId = interaction.values[0];
    const channel   = interaction.guild.channels.cache.get(channelId);
    session.pendingChannelId = channelId; // เก็บ channelId ไว้ในเซสชัน เผื่อจุดอื่นในอนาคตต้องใช้อ้างอิงช่องที่เลือกล่าสุด

    // 🩹 log ไว้ทุกครั้งที่มีคนเลือกช่องจาก ChannelSelectMenu — ช่วยเวลามีช่องชื่อซ้ำกัน
    // 2 ช่องขึ้นไปในเซิร์ฟ (เช่นชื่อ "role" ซ้ำกัน) จะได้ไล่ log ย้อนหลังได้ว่าครั้งนั้นๆ
    // ผู้ใช้เลือก channel ID ไหนจริงๆ และช่องนั้นอยู่ใต้ category ชื่ออะไร (ChannelSelectMenu
    // ของ Discord เองไม่มีช่องให้บอทแปะ ID ต่อท้ายชื่อในตัวเลือกได้ — เป็น component ที่ Discord
    // client render เอง ควบคุมแค่ channel_types/placeholder ได้เท่านั้น เลย log ไว้แทน)
    console.log(`[role-setup handleChannelSelect] setup="${session.name}" เลือกช่อง id=${channelId} name="${channel?.name ?? '(หาไม่เจอใน cache)'}" category="${channel?.parent?.name ?? '(ไม่มี)'}"`);

    // 🩹 เอาขั้นตอน "ยืนยันโพสต์ซ้ำ" (เคยเช็ค setup?.lastPostedAt แล้วเด้ง
    // buildPostConfirmPanel ให้กดยืนยัน/ยกเลิกก่อน) ออกตามคำขอแล้ว — ตอนนี้เลือกช่อง
    // แล้วโพสต์เข้าช่องนั้นทันทีเสมอ ไม่ว่าจะเคยโพสต์มาก่อนหรือไม่ก็ตาม
    // ⚠️ ห้ามใช้ { content, flags: Ephemeral } ตรงนี้เด็ดขาด — ข้อความนี้ถูกส่งไปแล้วด้วย
    // flags: IsComponentsV2 (มาจาก buildDoneChannelPanel ตอนกด Done) Discord ไม่ยอมให้
    // "ถอด" flag IsComponentsV2 ออกจากข้อความทีหลัง ถ้า editReply ด้วย content ธรรมดา
    // (ไม่มี flag นี้) จะโดน DiscordAPIError 50035 (MESSAGE_CANNOT_REMOVE_COMPONENTS_V2_FLAG)
    // ทันที ต้องใช้ TextDisplayBuilder + flags: IsComponentsV2 แบบเดียวกับตอนโพสต์สำเร็จเสมอ
    if (!channel) {
      await interaction.editReply({
        components: [new TextDisplayBuilder().setContent(t('role_setup.post.channel_gone'))],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const result = await doPost(interaction.guild, userId, session.guildId, session.name, channel);
    if (!result.ok) {
      await interaction.editReply({
        components: [new TextDisplayBuilder().setContent(result.error)],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    sessions.delete(sessionKey(guildId, userId));
    const warnText3 = result.warning ? `\n${result.warning}` : '';
    await interaction.editReply({
      components: [new TextDisplayBuilder().setContent(t('role_setup.command.post_success', { name: session.name, channel, url: result.posted.url, warnText: warnText3 }))],
      flags: MessageFlags.IsComponentsV2,
    });
  },

  // ─── Handle RoleSelectMenu ────────────────────────────────────────────────
  async handleRoleMenuSelect(interaction) {
    if (interaction.customId !== RS.ADD_ROLE_SELECT) return;
    const userId  = interaction.user.id;
    const guildId = interaction.guildId; // เพิ่มเข้ามาใหม่ — ต้องใช้ประกอบ session/pending key ผสม
    const t = createTranslator(getGuildLanguage(guildId));
    const session = sessions.get(sessionKey(guildId, userId));
    if (!session) return interaction.reply({ content: t('role_setup.error.session_expired'), flags: MessageFlags.Ephemeral });
    const roleId   = interaction.values[0];
    const roleData = interaction.roles?.get(roleId) ?? interaction.guild.roles.cache.get(roleId);
    const roleName = roleData?.name ?? roleId;
    if (roleId === interaction.guildId) return interaction.reply({ content: t('role_setup.add_role.everyone_blocked'), flags: MessageFlags.Ephemeral });
    const setup = loadSetup(session.guildId, session.name);
    if (!setup) return interaction.reply({ content: t('role_setup.add_role.setup_gone'), flags: MessageFlags.Ephemeral });
    if (setup.config.roles.some(r => r.id === roleId)) return interaction.reply({ content: t('role_setup.add_role.already_added', { name: roleName }), flags: MessageFlags.Ephemeral });
    if (setup.config.roles.length >= 25) return interaction.reply({ content: t('role_setup.add_role.max_reached'), flags: MessageFlags.Ephemeral });
    const guildRole = interaction.guild.roles.cache.get(roleId);
    if (guildRole) { const warn = checkRoleManageable(interaction.guild, guildRole, t); if (warn) return interaction.reply({ content: `⚠️ ${warn}${t('role_setup.role_check.pick_another_hint')}`, flags: MessageFlags.Ephemeral }); }
    pendingRoles.set(sessionKey(guildId, userId), { guildId: session.guildId, name: session.name, roleId, roleName });
    const modal = new ModalBuilder().setCustomId(RS.MODAL_ROLE_DESC).setTitle(t('role_setup.add_role.modal_title', { name: roleName.slice(0, 35) }));
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(RS.INPUT_ROLE_DESC).setLabel(t('role_setup.add_role.desc_label'))
        .setStyle(TextInputStyle.Short).setPlaceholder(t('role_setup.add_role.desc_placeholder')).setRequired(false).setMaxLength(100)
    ));
    await interaction.showModal(modal);
  },

  // ─── Handle modal submits ─────────────────────────────────────────────────
  async handleModalSubmit(interaction) {
    const userId  = interaction.user.id;
    const guildId = interaction.guildId; // เพิ่มเข้ามาใหม่ — ต้องใช้ query sessions/pendingRoles/pendingButtonAdd/pendingReactionAdd ก่อนเสมอ (โดยเฉพาะ MODAL_ROLE_DESC ที่ไม่ต้องการ session แต่ยัง query pendingRoles อยู่ดี)
    const t = createTranslator(getGuildLanguage(guildId));
    const session = sessions.get(sessionKey(guildId, userId));
    if (interaction.customId !== RS.MODAL_ROLE_DESC && !session)
      return interaction.reply({ content: t('role_setup.error.session_expired'), flags: MessageFlags.Ephemeral });
    const { name } = session ?? {}; // guildId ไม่ destructure ซ้ำแล้ว เพราะมีตัวแปรนี้จาก interaction.guildId อยู่แล้วตอนต้นฟังก์ชัน

    if (interaction.customId === RS.MODAL_TEXT) {
      const content = resolveCustomEmojis(interaction.fields.getTextInputValue(RS.INPUT_TEXT), interaction.guild);
      mutateSetup(guildId, name, userId, s => s.blocks.push({ type: 'text', content }));
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }
    if (interaction.customId === RS.MODAL_IMAGE) {
      const result = parseImageUrls(interaction.fields.getTextInputValue(RS.INPUT_IMAGE), t);
      if (!result.ok) return interaction.reply({ content: result.error + t('role_setup.hint.retry_add_image'), flags: MessageFlags.Ephemeral });
      mutateSetup(guildId, name, userId, s => s.blocks.push({ type: 'gallery', items: result.urls.map(url => ({ url })) }));
      await interaction.update(buildEditorPanel(userId, interaction.guildId));
      const checks = await Promise.all(result.urls.map(u => checkImageUrlLooksValid(u)));
      const bad = result.urls.filter((_, i) => !checks[i]);
      if (bad.length) await interaction.followUp({ content: t('role_setup.image_warning.suspicious_list', { list: bad.map(u => `• ${u}`).join('\n') }), flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.customId === RS.MODAL_SECTION) {
      const text      = resolveCustomEmojis(interaction.fields.getTextInputValue(RS.INPUT_SEC_TEXT), interaction.guild);
      const thumbnail = interaction.fields.getTextInputValue(RS.INPUT_SEC_IMG).trim();
      try { validateUrl(thumbnail, t('builder.validation.thumbnail_label'), t); } catch (e) { return interaction.reply({ content: `❌ ${e.message.replace(/^buildMessageFromSchema:\s*/, '')}` + t('role_setup.hint.retry_add_section'), flags: MessageFlags.Ephemeral }); }
      mutateSetup(guildId, name, userId, s => s.blocks.push({ type: 'section', text, thumbnail }));
      await interaction.update(buildEditorPanel(userId, interaction.guildId));
      const ok = await checkImageUrlLooksValid(thumbnail);
      if (!ok) await interaction.followUp({ content: t('role_setup.image_warning.suspicious_single', { url: thumbnail }), flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.customId === RS.MODAL_COLOR) {
      const raw = interaction.fields.getTextInputValue(RS.INPUT_COLOR).trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(raw)) return interaction.reply({ content: t('role_setup.color_custom.invalid', { input: raw }), flags: MessageFlags.Ephemeral });
      mutateSetup(guildId, name, userId, s => { s.accentColor = raw; });
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }
    if (interaction.customId === RS.MODAL_CONFIG) {
      const rawMin = interaction.fields.getTextInputValue(RS.INPUT_MIN).trim();
      const rawMax = interaction.fields.getTextInputValue(RS.INPUT_MAX).trim();
      const rawPh  = interaction.fields.getTextInputValue(RS.INPUT_PH).trim();
      const minV   = parseInt(rawMin, 10);
      const maxV   = parseInt(rawMax, 10);
      if (isNaN(minV) || isNaN(maxV) || minV < 0 || maxV < 1 || maxV > 25 || minV > maxV)
        return interaction.reply({ content: t('role_setup.config.invalid_range', { min: rawMin, max: rawMax }), flags: MessageFlags.Ephemeral });
      const setup = loadSetup(guildId, name);
      const roleCount = setup?.config?.roles?.length ?? 0;
      if (roleCount > 0 && maxV > roleCount)
        return interaction.reply({ content: t('role_setup.config.max_exceeds_roles', { max: maxV, count: roleCount }), flags: MessageFlags.Ephemeral });
      // placeholder: resolveCustomEmojis เพื่อรองรับ custom emoji (:ชื่อ: → <:ชื่อ:id>)
      // หมายเหตุ: Discord placeholder ไม่ render markdown และ custom emoji <:name:id> แต่ unicode emoji ✅
      const placeholder = rawPh ? resolveCustomEmojis(rawPh, interaction.guild) : null;
      mutateSetup(guildId, name, userId, s => { s.config.minValues = minV; s.config.maxValues = maxV; s.config.placeholder = placeholder; });
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }

    // ─ แก้ไขบล็อก (prefix) ──────────────────────────────────────────────
    if (interaction.customId.startsWith(PFX.E_TEXT)) {
      const index   = Number(interaction.customId.slice(PFX.E_TEXT.length));
      const content = resolveCustomEmojis(interaction.fields.getTextInputValue(RS.INPUT_TEXT), interaction.guild);
      mutateSetup(guildId, name, userId, s => { s.blocks[index] = { type: 'text', content }; });
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }
    if (interaction.customId.startsWith(PFX.E_IMG)) {
      const index  = Number(interaction.customId.slice(PFX.E_IMG.length));
      const result = parseImageUrls(interaction.fields.getTextInputValue(RS.INPUT_IMAGE), t);
      if (!result.ok) return interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
      mutateSetup(guildId, name, userId, s => { s.blocks[index] = { type: 'gallery', items: result.urls.map(url => ({ url })) }; });
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }
    if (interaction.customId.startsWith(PFX.E_SEC)) {
      const index     = Number(interaction.customId.slice(PFX.E_SEC.length));
      const text      = resolveCustomEmojis(interaction.fields.getTextInputValue(RS.INPUT_SEC_TEXT), interaction.guild);
      const thumbnail = interaction.fields.getTextInputValue(RS.INPUT_SEC_IMG).trim();
      try { validateUrl(thumbnail, t('builder.validation.thumbnail_label'), t); } catch (e) { return interaction.reply({ content: `❌ ${e.message.replace(/^buildMessageFromSchema:\s*/, '')}`, flags: MessageFlags.Ephemeral }); }
      mutateSetup(guildId, name, userId, s => { s.blocks[index] = { type: 'section', text, thumbnail }; });
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }

    // ─ แทรกบล็อก (prefix) ───────────────────────────────────────────────
    if (interaction.customId.startsWith(PFX.I_TEXT)) {
      const pos     = Number(interaction.customId.slice(PFX.I_TEXT.length));
      const content = resolveCustomEmojis(interaction.fields.getTextInputValue(RS.INPUT_TEXT), interaction.guild);
      mutateSetup(guildId, name, userId, s => s.blocks.splice(pos, 0, { type: 'text', content }));
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }
    if (interaction.customId.startsWith(PFX.I_IMG)) {
      const pos    = Number(interaction.customId.slice(PFX.I_IMG.length));
      const result = parseImageUrls(interaction.fields.getTextInputValue(RS.INPUT_IMAGE), t);
      if (!result.ok) return interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
      mutateSetup(guildId, name, userId, s => s.blocks.splice(pos, 0, { type: 'gallery', items: result.urls.map(url => ({ url })) }));
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }
    if (interaction.customId.startsWith(PFX.I_SEC)) {
      const pos       = Number(interaction.customId.slice(PFX.I_SEC.length));
      const text      = resolveCustomEmojis(interaction.fields.getTextInputValue(RS.INPUT_SEC_TEXT), interaction.guild);
      const thumbnail = interaction.fields.getTextInputValue(RS.INPUT_SEC_IMG).trim();
      try { validateUrl(thumbnail, t('builder.validation.thumbnail_label'), t); } catch (e) { return interaction.reply({ content: `❌ ${e.message.replace(/^buildMessageFromSchema:\s*/, '')}`, flags: MessageFlags.Ephemeral }); }
      mutateSetup(guildId, name, userId, s => s.blocks.splice(pos, 0, { type: 'section', text, thumbnail }));
      await interaction.update(buildEditorPanel(userId, interaction.guildId)); return;
    }

    // ─ เพิ่มยศ (modal คำอธิบาย) ─────────────────────────────────────────
    if (interaction.customId === RS.MODAL_ROLE_DESC) {
      const pending = pendingRoles.get(sessionKey(guildId, userId));
      if (!pending) return interaction.reply({ content: t('role_setup.add_role.pending_expired'), flags: MessageFlags.Ephemeral });
      pendingRoles.delete(sessionKey(guildId, userId));
      const description = interaction.fields.getTextInputValue(RS.INPUT_ROLE_DESC).trim() || null;
      const s0 = loadSetup(pending.guildId, pending.name);
      if (!s0) return interaction.reply({ content: t('role_setup.add_role.setup_gone'), flags: MessageFlags.Ephemeral });
      if (s0.config.roles.some(r => r.id === pending.roleId)) return interaction.reply({ content: t('role_setup.add_role.already_added', { name: pending.roleName }), flags: MessageFlags.Ephemeral });
      mutateSetup(pending.guildId, pending.name, userId, s => s.config.roles.push({ id: pending.roleId, description }));
      await interaction.update(buildEditorPanel(userId, interaction.guildId));
      const descText = description ? t('role_setup.add_role.desc_note', { description }) : '';
      await interaction.followUp({ content: t('role_setup.add_role.added_success', { name: pending.roleName, descText }), flags: MessageFlags.Ephemeral });
      return;
    }

    // ─ เพิ่ม Reaction ขั้นที่ 1 (modal emoji) → เก็บ pending → ไปเลือกยศ (ขั้นที่ 2) ──
    if (interaction.customId === RS.MODAL_REACTION) {
      const emojiRaw = interaction.fields.getTextInputValue(RS.RXN_INPUT_EMOJI).trim();
      if (!emojiRaw) return interaction.reply({ content: t('role_setup.reaction.emoji_required'), flags: MessageFlags.Ephemeral });
      const { resolved: emojiResolved, failed: emojiResolveFailed } = resolveButtonEmojiInput(emojiRaw, interaction.guild);
      if (emojiResolveFailed) {
        return interaction.reply({ content: t('role_setup.reaction.emoji_not_found_example'), flags: MessageFlags.Ephemeral });
      }
      // เช็ค emoji ซ้ำกับที่มีอยู่แล้ว
      const s0 = loadSetup(guildId, name);
      const dupReaction = (s0?.config?.reactions ?? []).find(r => r.emoji === (emojiResolved ?? emojiRaw));
      if (dupReaction) {
        const dupRoleName = interaction.guild.roles.cache.get(dupReaction.roleId)?.name ?? dupReaction.roleId;
        return interaction.reply({ content: t('role_setup.reaction.duplicate', { emoji: emojiResolved ?? emojiRaw, name: dupRoleName }), flags: MessageFlags.Ephemeral });
      }
      pendingReactionAdd.set(sessionKey(guildId, userId), { guildId, name, emoji: emojiResolved ?? emojiRaw, editIndex: null });
      const { payload, assignableCount } = buildRxnRolePanel(interaction.guild, null, null, interaction.guildId);
      if (assignableCount === 0) { pendingReactionAdd.delete(sessionKey(guildId, userId)); return interaction.reply({ content: t('role_setup.reaction.no_manageable_roles'), flags: MessageFlags.Ephemeral }); }
      await interaction.update(payload);
      return;
    }

    // ─ แก้ไข Reaction ขั้นที่ 1 (modal emoji, มี index ฝังท้าย) ─────────────────
    if (interaction.customId.startsWith(PFX.MODAL_EDIT_RXN)) {
      const index    = Number(interaction.customId.slice(PFX.MODAL_EDIT_RXN.length));
      const emojiRaw = interaction.fields.getTextInputValue(RS.RXN_INPUT_EMOJI).trim();
      if (!emojiRaw) return interaction.reply({ content: t('role_setup.reaction.emoji_required'), flags: MessageFlags.Ephemeral });
      const { resolved: emojiResolved, failed: emojiResolveFailed } = resolveButtonEmojiInput(emojiRaw, interaction.guild);
      if (emojiResolveFailed) {
        return interaction.reply({ content: t('role_setup.reaction.emoji_not_found'), flags: MessageFlags.Ephemeral });
      }
      const resolvedEmoji = emojiResolved ?? emojiRaw;
      // เช็คซ้ำกับ reaction อื่นที่ไม่ใช่ตัวที่กำลังแก้ไข
      const s0 = loadSetup(guildId, name);
      const dup = (s0?.config?.reactions ?? []).find((r, i) => r.emoji === resolvedEmoji && i !== index);
      if (dup) {
        const dupRoleName = interaction.guild.roles.cache.get(dup.roleId)?.name ?? dup.roleId;
        return interaction.reply({ content: t('role_setup.reaction.duplicate', { emoji: resolvedEmoji, name: dupRoleName }), flags: MessageFlags.Ephemeral });
      }
      // ดึงยศเดิม → ส่งเข้า buildRxnRolePanel เพื่อแสดงตัวเลือก "คงยศเดิม"
      const existingRxn   = s0?.config?.reactions?.[index];
      const currentRoleId   = existingRxn?.roleId ?? null;
      const currentRoleName = currentRoleId ? (interaction.guild.roles.cache.get(currentRoleId)?.name ?? currentRoleId) : null;
      pendingReactionAdd.set(sessionKey(guildId, userId), { guildId, name, emoji: resolvedEmoji, editIndex: index });
      const { payload, assignableCount } = buildRxnRolePanel(interaction.guild, currentRoleId, currentRoleName, interaction.guildId);
      if (assignableCount === 0) { pendingReactionAdd.delete(sessionKey(guildId, userId)); return interaction.reply({ content: t('role_setup.reaction.no_manageable_roles'), flags: MessageFlags.Ephemeral }); }
      await interaction.update(payload);
      return;
    }

    // ─ เพิ่มปุ่ม ขั้นที่ 1 (modal ป้ายชื่อ + emoji) → เก็บ pending → ไปขั้นสี ──
    if (interaction.customId === RS.MODAL_BTN) {
      const label    = interaction.fields.getTextInputValue(RS.BTN_INPUT_LABEL).trim();
      const emojiRaw = interaction.fields.getTextInputValue(RS.BTN_INPUT_EMOJI).trim();

      if (!label) return interaction.reply({ content: t('role_setup.button.label_required'), flags: MessageFlags.Ephemeral });

      const { resolved: emojiResolved, failed: emojiResolveFailed } = resolveButtonEmojiInput(emojiRaw, interaction.guild);
      console.log(`[role-setup MODAL_BTN] emoji raw="${emojiRaw}" resolved="${emojiResolved}" failed=${emojiResolveFailed}`);

      pendingButtonAdd.set(sessionKey(guildId, userId), { guildId, name, label, emoji: emojiResolved, style: null, editIndex: null });
      await interaction.update(buildButtonColorPanel(name, { label, emoji: emojiResolved, editIndex: null }, interaction.guildId));

      if (emojiResolveFailed) {
        await interaction.followUp({
          content: t('role_setup.button.emoji_not_found'),
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    // ─ แก้ไขปุ่ม (modal ขั้นที่ 1, มี index ฝังท้าย) → pre-fill สีเดิม → ไปขั้นเลือกยศ ───
    if (interaction.customId.startsWith(PFX.MODAL_EDIT_BTN)) {
      const index  = Number(interaction.customId.slice(PFX.MODAL_EDIT_BTN.length));
      const label  = interaction.fields.getTextInputValue(RS.BTN_INPUT_LABEL).trim();
      const emojiRaw = interaction.fields.getTextInputValue(RS.BTN_INPUT_EMOJI).trim();

      if (!label) return interaction.reply({ content: t('role_setup.button.label_required'), flags: MessageFlags.Ephemeral });

      const { resolved: emojiResolved, failed: emojiResolveFailed } = resolveButtonEmojiInput(emojiRaw, interaction.guild);
      console.log(`[role-setup MODAL_EDIT_BTN:${index}] emoji raw="${emojiRaw}" resolved="${emojiResolved}" failed=${emojiResolveFailed}`);

      // โหลดสีเดิมของปุ่มนี้เพื่อแสดงใน color panel (ผู้ใช้จะเห็นสีปัจจุบันก่อนเปลี่ยน)
      const s0            = loadSetup(guildId, name);
      const existingStyle = s0?.config?.buttons?.[index]?.style ?? null;

      pendingButtonAdd.set(sessionKey(guildId, userId), { guildId, name, label, emoji: emojiResolved, style: existingStyle, editIndex: index });
      await interaction.update(buildButtonColorPanel(name, { label, emoji: emojiResolved, editIndex: index, style: existingStyle }, interaction.guildId));

      if (emojiResolveFailed) {
        await interaction.followUp({
          content: t('role_setup.button.emoji_not_found'),
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }
  },

  // ─── Handle member select (rolesetup:*) ──────────────────────────────────
  async handleMemberSelect(interaction) {
    const setupName = interaction.customId.slice(SETUP_PREFIX.length);
    const guildId   = interaction.guildId;
    const t = createTranslator(getGuildLanguage(guildId));
    if (!guildId) return interaction.reply({ content: t('role_setup.runtime.guild_only'), flags: MessageFlags.Ephemeral });
    const setup = loadSetup(guildId, setupName);
    if (!setup) return interaction.reply({ content: t('role_setup.runtime.setup_gone_select'), flags: MessageFlags.Ephemeral });

    const menuRoleIds = setup.config?.roles?.map(r => r.id) ?? [];
    const selectedIds = new Set(interaction.values);
    const setupMaxV   = setup.config?.maxValues ?? 1;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ── จุดที่ 1: fetch member สดๆ เสมอ (force: true ข้าม cache) ────────────
    // จำเป็นเพราะ member.roles.remove() คำนวณ role list จาก member.roles.cache
    // ถ้า cache เก่า PATCH ที่ส่งไป Discord จะคำนวณผิดและยศไม่ถูกถอดจริง
    let member;
    try {
      member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
    } catch (e) {
      console.error('[role-setup] fetch member failed:', e);
      return interaction.editReply({ content: t('role_setup.runtime.fetch_failed') });
    }

    // ─── คำนวณ roles ที่จะเพิ่ม/ถอด ตาม mode ─────────────────────────────
    let rolesToAdd, rolesToRemove;
    if (setupMaxV === 1) {
      // single mode: ถอดยศเก่าทั้งหมดในกลุ่มออก แล้วให้ยศที่เลือกใหม่
      // member.roles.cache ณ ตอนนี้แม่นยำ 100% เพราะ force fetch แล้ว
      const currentInMenu = menuRoleIds.filter(id => member.roles.cache.has(id));

      // ── จุดที่ 3: log เพื่อ debug ────────────────────────────────────────
      console.log(`[role-setup single] user=${interaction.user.id} setup="${setupName}"`);
      console.log(`[role-setup single] menuRoleIds    :`, menuRoleIds);
      console.log(`[role-setup single] currentInMenu  :`, currentInMenu,
        '→', currentInMenu.map(id => interaction.guild.roles.cache.get(id)?.name ?? id));
      console.log(`[role-setup single] selected       :`, interaction.values,
        '→', interaction.values.map(id => interaction.guild.roles.cache.get(id)?.name ?? id));

      rolesToRemove = currentInMenu.filter(id => !selectedIds.has(id)); // ถอดเฉพาะยศที่ไม่ได้เลือก
      rolesToAdd    = interaction.values.filter(id => !member.roles.cache.has(id)); // ให้เฉพาะยศที่ยังไม่มี
    } else {
      rolesToAdd    = menuRoleIds.filter(id => selectedIds.has(id) && !member.roles.cache.has(id));
      rolesToRemove = menuRoleIds.filter(id => !selectedIds.has(id) && member.roles.cache.has(id));
    }

    if (!rolesToAdd.length && !rolesToRemove.length) return interaction.editReply({ content: t('role_setup.runtime.no_changes') });
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.editReply({ content: t('role_setup.role_check.no_manage_roles_perm') });
    for (const roleId of [...new Set([...rolesToAdd, ...rolesToRemove])]) {
      const role = interaction.guild.roles.cache.get(roleId); if (!role) continue;
      const err = checkRoleManageable(interaction.guild, role, t); if (err) return interaction.editReply({ content: err });
    }

    // ── คำนวณ vr/va กรองเฉพาะ roleId ที่ยังมีอยู่จริงใน guild ──────────────
    const vr = rolesToRemove.filter(id => interaction.guild.roles.cache.has(id));
    const va = rolesToAdd.filter(id => interaction.guild.roles.cache.has(id));

    console.log(`[role-setup] will remove: ${JSON.stringify(vr)}`);
    vr.forEach(id => console.log(`  - ${id} (${interaction.guild.roles.cache.get(id)?.name}) — member has: ${member.roles.cache.has(id)}`));
    console.log(`[role-setup] will add: ${JSON.stringify(va)}`);
    va.forEach(id => console.log(`  + ${id} (${interaction.guild.roles.cache.get(id)?.name}) — member has: ${member.roles.cache.has(id)}`));

    try {
      // ใช้ member.roles.set() แทน remove()+add() แยกกัน
      // เหตุผล: remove แล้ว add ทำให้เกิด 2 PATCH ต่อเนื่องกัน
      // PATCH ที่ 2 คำนวณ role list จาก cache ที่อัปเดตจาก PATCH ที่ 1
      // ถ้า Discord ยังไม่ได้ flush cache ระหว่างสอง call → race condition → role ไม่ถูกถอด
      //
      // set() ส่ง PATCH เดียวพร้อม role list ทั้งหมดที่ถูกต้องในครั้งเดียว
      const currentAllRoles = [...member.roles.cache.keys()];
      const newRoleSet = currentAllRoles
        .filter(id => !vr.includes(id))                        // เอายศที่จะถอดออก
        .concat(va.filter(id => !member.roles.cache.has(id))); // เพิ่มยศใหม่ที่ยังไม่มี

      console.log(`[role-setup] set() newRoleSet: ${JSON.stringify(newRoleSet)}`);
      await member.roles.set(newRoleSet);
      console.log(`[role-setup] set() done`);
    } catch (e) {
      console.error('[role-setup handleMemberSelect] error:', e);
      return interaction.editReply({ content: t('role_setup.runtime.generic_error') });
    }

    // reply ตาม vr/va จริง
    const getName = id => interaction.guild.roles.cache.get(id)?.name ?? id;
    const lines   = [];
    if (vr.length) lines.push(t('role_setup.runtime.removed_roles', { roles: vr.map(id => `**${getName(id)}**`).join(', ') }));
    if (va.length) lines.push(t('role_setup.runtime.added_roles', { roles: va.map(id => `**${getName(id)}**`).join(', ') }));
    await interaction.editReply({ content: lines.join('\n') });
  },

  // ─── Handle role button click (rsbtn:{setupName}:{roleId}) — button type ──
  // แตกต่างจาก handleRoleButton.js ตรงที่รองรับ maxRoles limit logic
  // และใช้ member.roles.set() แทน remove/add เพื่อกัน race condition
  async handleRoleButtonClick(interaction) {
    const t = createTranslator(interaction.guildId ? getGuildLanguage(interaction.guildId) : 'en');
    if (!interaction.guildId) {
      return interaction.reply({ content: t('role_setup.runtime.guild_only_button'), flags: MessageFlags.Ephemeral });
    }

    // แยก setupName กับ roleId จาก customId: "rsbtn:{setupName}:{roleId}"
    // ใช้ lastIndexOf(':') เพราะ setupName ไม่มี ':' อยู่แล้ว (enforce ตอน new)
    const withoutPrefix = interaction.customId.slice('rsbtn:'.length);
    const lastColon     = withoutPrefix.lastIndexOf(':');
    const setupName     = withoutPrefix.slice(0, lastColon);
    const roleId        = withoutPrefix.slice(lastColon + 1);

    const setup = loadSetup(interaction.guildId, setupName);
    if (!setup) {
      return interaction.reply({ content: t('role_setup.runtime.setup_gone_button'), flags: MessageFlags.Ephemeral });
    }

    // ── เช็คสิทธิ์บอท ──────────────────────────────────────────────────────
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: t('role_setup.role_check.no_manage_roles_perm'), flags: MessageFlags.Ephemeral });
    }

    const role = interaction.guild.roles.cache.get(roleId)
      ?? await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      return interaction.reply({ content: t('role_setup.runtime.role_gone'), flags: MessageFlags.Ephemeral });
    }
    const roleErr = checkRoleManageable(interaction.guild, role, t);
    if (roleErr) return interaction.reply({ content: roleErr, flags: MessageFlags.Ephemeral });

    // ── fetch member สดๆ เสมอ เพื่อกัน stale cache ──────────────────────
    let member;
    try {
      member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
    } catch {
      return interaction.reply({ content: t('role_setup.runtime.fetch_failed'), flags: MessageFlags.Ephemeral });
    }

    // ── ข้อมูลที่ใช้ตัดสินใจ ─────────────────────────────────────────────
    const maxRoles      = setup.config?.maxRoles ?? null;            // null = ไม่จำกัด
    const groupRoleIds  = (setup.config?.buttons ?? []).map(b => b.roleId); // ยศทั้งหมดในกลุ่มนี้
    const currentGroup  = groupRoleIds.filter(id => member.roles.cache.has(id)); // ที่ member มีอยู่แล้ว
    const hasTargetRole = member.roles.cache.has(roleId);

    // ── Logic ตัดสินใจ newRoleSet ─────────────────────────────────────────
    let newRoleSet;
    let replyContent;

    if (hasTargetRole) {
      // กดยศที่มีอยู่แล้ว → ถอดออก (toggle off) ทุก mode
      newRoleSet   = [...member.roles.cache.keys()].filter(id => id !== roleId);
      replyContent = t('role_setup.runtime.role_removed_toggle', { name: role.name });
    } else if (maxRoles === null || currentGroup.length < maxRoles) {
      // ยังไม่เต็มหรือ unlimited → เพิ่มยศใหม่เข้าไปเลย
      newRoleSet   = [...member.roles.cache.keys(), roleId];
      replyContent = t('role_setup.runtime.role_added_toggle', { name: role.name });
    } else if (maxRoles === 1) {
      // single mode (maxRoles=1): ถอดยศเก่าออก แล้วให้ยศใหม่ (swap)
      // ใช้ filter ก่อนแล้วค่อย concat เพื่อให้ได้ role list ที่ถูกต้องในก้าว PATCH เดียว
      const removedNames = currentGroup
        .map(id => interaction.guild.roles.cache.get(id)?.name ?? id)
        .join(', ');
      newRoleSet   = [...member.roles.cache.keys()]
        .filter(id => !groupRoleIds.includes(id)) // ลบทุก role ในกลุ่มนี้ออก
        .concat([roleId]);                         // เพิ่ม role ที่เลือกใหม่
      replyContent = t('role_setup.runtime.role_swapped', {
        name: role.name,
        removedNote: removedNames ? t('role_setup.runtime.role_swapped_removed_note', { names: removedNames }) : '',
      });
    } else {
      // เกินขีดจำกัด maxRoles > 1 → ปฏิเสธ แจ้งเตือน
      return interaction.reply({
        content: t('role_setup.runtime.max_reached', { max: maxRoles }),
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── ส่ง PATCH เดียว (member.roles.set) ไม่มี race condition ──────────
    try {
      await member.roles.set(newRoleSet);
    } catch (e) {
      console.error('[role-setup handleRoleButtonClick]', e);
      return interaction.reply({ content: t('role_setup.runtime.generic_error'), flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({ content: replyContent, flags: MessageFlags.Ephemeral });
  },

  // ─── Handle messageReactionAdd — สมาชิก react emoji → ให้ยศ ──────────────
  async handleReactionAdd(reaction, user) {
    const guildId   = reaction.message.guildId;
    const messageId = reaction.message.id;
    if (!guildId) return; // DM — skip

    // ข้ามถ้า message นี้เป็นข้อความตัวอย่าง reaction (ป้องกันรับยศจริงขณะทดสอบ)
    // previewMessageIds จะเก็บ messageId ไว้จนกว่าข้อความจะถูกลบ
    if (previewMessageIds.has(messageId)) return;

    // หา setup ที่ตรงกับ messageId นี้ (scan setups ใน guild ทั้งหมด)
    const allSetups = listSetups(guildId);
    const setup = allSetups.find(s => s.type === 'reaction' && s.config?.postedMessageId === messageId);
    if (!setup) return; // ไม่ใช่ role-setup reaction message — ข้ามไปเฉยๆ

    // หา emoji ที่ตรงกันในรายการ reactions ของ setup นี้
    const emojiKey = getEmojiKey(reaction.emoji);
    const mapping  = setup.config.reactions.find(r => r.emoji === emojiKey);
    if (!mapping) return; // emoji นี้ไม่ได้ผูกกับยศอะไรใน setup นี้

    const guild = reaction.message.guild;
    const role  = guild.roles.cache.get(mapping.roleId);
    if (!role) return;
    if (checkRoleManageable(guild, role)) return; // บอทจัดการยศนี้ไม่ได้ — ข้าม (ไม่มีทาง reply เพราะไม่ใช่ interaction)

    let member;
    try { member = await guild.members.fetch({ user: user.id, force: true }); }
    catch { return; }

    if (!member.roles.cache.has(mapping.roleId)) {
      try { await member.roles.add(role); }
      catch (e) { console.error('[role-setup handleReactionAdd]', e); }
    }
  },

  // ─── Handle messageReactionRemove — สมาชิก unreact → ถอดยศ ──────────────
  async handleReactionRemove(reaction, user) {
    const guildId   = reaction.message.guildId;
    const messageId = reaction.message.id;
    if (!guildId) return;

    // ข้ามถ้า message นี้เป็นข้อความตัวอย่าง reaction
    if (previewMessageIds.has(messageId)) return;

    const allSetups = listSetups(guildId);
    const setup = allSetups.find(s => s.type === 'reaction' && s.config?.postedMessageId === messageId);
    if (!setup) return;

    const emojiKey = getEmojiKey(reaction.emoji);
    const mapping  = setup.config.reactions.find(r => r.emoji === emojiKey);
    if (!mapping) return;

    const guild = reaction.message.guild;
    const role  = guild.roles.cache.get(mapping.roleId);
    if (!role) return;
    if (checkRoleManageable(guild, role)) return;

    let member;
    try { member = await guild.members.fetch({ user: user.id, force: true }); }
    catch { return; }

    if (member.roles.cache.has(mapping.roleId)) {
      try { await member.roles.remove(role); }
      catch (e) { console.error('[role-setup handleReactionRemove]', e); }
    }
  },
};