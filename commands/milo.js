// commands/milo.js
// 🆕 [16 ต.ค. 2569] คำสั่ง /milo — export/import "ชุดตั้งค่า Milo Bot" ระหว่างเซิร์ฟเวอร์
// ใช้คู่กับช่อง "รหัสการตั้งค่า Milo Bot" ในฟอร์มลงขายของของ Marketplace (รอบ 11 ของ
// claude/marketplace-web-dashboard-build-notes.md) — ตอนรอบ 11 มีแค่ช่องกรอกรหัสในหน้าเว็บ
// + ระบบส่งรหัสทาง DM หลังจ่ายเงินแล้ว แต่ยังไม่มีคำสั่งจริงที่ "สร้าง" รหัส (export) หรือ
// "ใช้" รหัส (import) เลย — ไฟล์นี้คือส่วนที่ขาดไปนั้น ทำให้ฟีเจอร์ทำงานได้จริงครบวงจร
//
// ขอบเขตที่คุยกับน้องหนาวแล้วก่อนเขียนไฟล์นี้ (16 ต.ค. 2569):
//  1) export ดึงได้ 3 อย่างเท่านั้น: การ์ด welcome/goodbye, role setup (ยศอัตโนมัติ),
//     builder (ข้อความ/embed ที่สร้างไว้) — ไม่รวมอย่างอื่น (payment method, premium
//     status, marketplace listing ฯลฯ)
//  2) รหัสที่ export ออกมา "ใช้ได้ครั้งเดียว" เท่านั้น (กันคนขายขายรหัสเดียวซ้ำไม่จำกัด)
//  3) /milo import-config ต้องมีสิทธิ์ Administrator ของเซิร์ฟที่รันคำสั่งถึงจะใช้ได้
//
// ⚠️ ข้อจำกัดที่ตั้งใจไว้ (รู้ตัวตั้งแต่ตอนออกแบบ ไม่ใช่บั๊ก): roleId (ในปุ่ม/เมนู/reaction
// ของ role setup และปุ่มยศ/ปุ่มลิงก์ห้องของ builder) เป็นค่าเฉพาะเซิร์ฟต้นทาง ย้ายข้ามเซิร์ฟ
// ไม่ได้จริงๆ (ยศ/ห้องของเซิร์ฟผู้ซื้อเป็นคนละอันกับของผู้ขายเสมอ) — โค้ดเดิมของทั้ง 2 ระบบ
// มี fail-safe รองรับอยู่แล้ว (เจอ roleId/channelId ที่ไม่มีจริงในเซิร์ฟนี้ → โชว์ fallback
// เฉยๆ ไม่ error/ไม่พังบอท) เลย import เข้าไปตรงๆ ได้โดยไม่ต้องลบ/แก้ข้อมูลพวกนี้เอง แต่
// ผู้ซื้อ "ต้อง" ไปกำหนดยศ/ห้องใหม่เองผ่าน /role-setup edit หรือ /builder edit ก่อนใช้งานจริง
// — แจ้งเตือนเรื่องนี้ชัดๆ ในข้อความตอบกลับหลัง import เสร็จด้านล่าง
//
// 🆕 [18 ต.ค. 2569 รอบ 14] ปรับ export-config จาก "รวมทุกอย่างอัตโนมัติ" ให้เป็น "แผงเลือก"
// (interactive panel) แทน — เหตุผล: น้องหนาวสังเกตว่าของเดิมบังคับรวมทุกอย่างที่มีอยู่ใน
// เซิร์ฟตอนนั้นเข้ารหัสเดียว ทำให้ผู้ขายขายแบบเจาะจงไม่ได้ (เช่น จะขายแค่ role setup ชุดเดียว
// หรือแค่ welcome+goodbye โดยไม่เอา role setup ไปด้วย) ถ้าอยากขายแยกชิ้นต้องไปสร้างเซิร์ฟใหม่
// แยกเก็บแต่ละชิ้นเท่านั้น — ตอนนี้กด /milo export-config แล้วจะเจอ "แผงเลือก" (ปุ่ม toggle
// welcome/goodbye + dropdown เลือก role setup/builder เฉพาะชื่อที่ต้องการ) ติ๊กเสร็จแล้วค่อยกด
// "สร้างรหัส" ทีเดียว โดย "ไม่มีอะไรติ๊กไว้ล่วงหน้าเลย" (ต้องเลือกเองทุกครั้ง — ขอบเขตที่คุยกับ
// น้องหนาวแล้วตอนออกแบบรอบนี้) ดู handleButton()/handleSelectMenu()/buildExportPanel() ด้านล่าง

const {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const { createTranslator } = require('../utils/i18n');
const { getGuildLanguage } = require('../utils/languageStorage');
const { isPremiumGuild } = require('../utils/tierManager');

const { loadWelcomeConfig, saveWelcomeConfig } = require('../utils/welcomeStorage');
const { loadGoodbyeConfig, saveGoodbyeConfig } = require('../utils/goodbyeStorage');
const { listSetups, saveSetup, setupExists } = require('../utils/roleSetupStorage');
const { listDrafts, saveDraft, draftExists } = require('../utils/builderStorage');
const { createExport, getExport, markUsed } = require('../utils/miloConfigStorage');

// โควตาฝั่งผู้ซื้อตอน import ถ้าเซิร์ฟยังเป็นแผนฟรี — ใช้ค่าเดียวกับที่ /role-setup new และ
// /builder new เช็คอยู่แล้ว (commands/role-setup.js / commands/builder.js) เพื่อไม่ให้
// import กลายเป็นช่องโหว่เลี่ยงโควตาพรีเมียมไปได้ ⚠️ ถ้าในอนาคตแก้ค่าพวกนี้ที่ไฟล์ต้นทาง
// ต้องมาแก้ตรงนี้ให้ตรงกันด้วยมือ ไม่ได้ผูกกันอัตโนมัติ (คนละไฟล์ คนละ runtime — เหมือนกับ
// CATEGORY_PREVIEW_STYLES ของ Marketplace ที่เตือนไว้ตั้งแต่รอบ 5)
const FREE_ROLE_SETUP_LIMIT = 1;
const FREE_BUILDER_LIMIT = 1;
const FREE_REACTION_LIMIT = 2;

// ─── In-memory state สำหรับแผงเลือก export (รอบ 14) ───────────────────────────
//
// 🔑 เก็บ state ไว้ในหน่วยความจำ (ไม่เขียนลงไฟล์) เพราะเป็นแค่ "ระหว่างกำลังเลือก" ของผู้ขาย
// คนเดียว ไม่ต้องรอดบอทรีสตาร์ท — ใช้ pattern เดียวกับ sessions ใน commands/role-setup.js
// (ดูคอมเมนต์ยาวในไฟล์นั้นว่าทำไมต้องผูก key กับทั้ง guildId และ userId พร้อมกัน ไม่ใช่
// userId เดี่ยวๆ — กัน admin คนเดียวกันเปิดคำสั่งนี้ค้างไว้ในเซิร์ฟ A พร้อมเซิร์ฟ B แล้ว
// สลับไปมา ทำให้ state ของเซิร์ฟนึงไปทับอีกเซิร์ฟในหน่วยความจำ)
//
// key (guildId_userId) → {
//   welcome, goodbye:     snapshot ของการตั้งค่าที่มีอยู่จริงตอนเปิดแผง (object|null)
//   roleSetups, builderDrafts: snapshot รายการทั้งหมดตอนเปิดแผง (array ของ object เดิมจาก storage)
//   selWelcome, selGoodbye:    boolean — ผู้ขายติ๊กจะรวมไปด้วยไหม
//   selRoleSetups, selBuilders: Set<string> — ชื่อที่ผู้ขายเลือกไว้
// }
//
// ⚠️ จงใจไม่มี timeout/cleanup — เหมือนกับ Map อื่นๆ ในไฟล์ role-setup.js (ไม่มี TTL เขียนไว้
// ที่นั่นเหมือนกัน) ถ้าผู้ขายเปิดแผงแล้วทิ้งไว้เฉยๆ โค้ด Discord เองจะทำให้ปุ่ม/dropdown ใช้ไม่ได้
// อยู่แล้วหลังผ่านไปประมาณ 15 นาที (interaction token หมดอายุ) ส่วน state ที่ค้างในหน่วยความจำ
// (ไม่กี่ร้อยไบต์ต่อรายการ) จะถูกเขียนทับทันทีถ้าผู้ขายกด /milo export-config ใหม่อีกครั้ง
const exportSessions = new Map();

function sessionKey(guildId, userId) {
  return `${guildId}_${userId}`;
}

// customId ของทุกปุ่ม/dropdown ในแผงเลือก export — ขึ้นต้นด้วย 'milo_export_' ทั้งหมด
// (ดู index.js ส่วน isButton()/isStringSelectMenu() ที่ route มาเรียก handleButton()/
// handleSelectMenu() ของไฟล์นี้ตาม prefix นี้)
const MX = {
  TOGGLE_WELCOME: 'milo_export_toggle_welcome',
  TOGGLE_GOODBYE: 'milo_export_toggle_goodbye',
  SELECT_ROLE_SETUPS: 'milo_export_sel_rs',
  SELECT_BUILDERS: 'milo_export_sel_bd',
  CONFIRM: 'milo_export_confirm',
  CANCEL: 'milo_export_cancel',
};

// ไอคอนหน้าชื่อใน dropdown เลือก role setup — ช่วยให้ผู้ขายแยกชนิดได้ไว ๆ โดยไม่ต้องเพิ่ม
// locale key ใหม่ (ไอคอนสื่อความหมายได้เลยโดยไม่ต้องแปล)
const ROLE_SETUP_TYPE_EMOJI = { menu: '📋', button: '🔘', reaction: '👍' };

/**
 * หาชื่อที่ไม่ชนกับของเดิมในเซิร์ฟปลายทาง — ถ้าชื่อเดิมไม่ชนใช้ได้เลย ถ้าชนจะต่อท้าย
 * " (2)", " (3)", ... ไปจนกว่าจะไม่ชน (ตัดชื่อเดิมให้สั้นลงเผื่อจำเป็น กัน "ชื่อ+ส่วนต่อท้าย"
 * เกิน maxLen ที่ Discord จำกัดไว้)
 *
 * @param {(guildId: string, name: string) => boolean} existsFn
 * @param {string} guildId
 * @param {string} baseName
 * @param {number} maxLen
 * @returns {string}
 */
function resolveUniqueName(existsFn, guildId, baseName, maxLen) {
  const trimmedBase = (baseName || 'imported').slice(0, maxLen);
  if (!existsFn(guildId, trimmedBase)) return trimmedBase;
  let n = 2;
  let result;
  do {
    const suffix = ` (${n})`;
    result = trimmedBase.slice(0, Math.max(1, maxLen - suffix.length)) + suffix;
    n++;
  } while (existsFn(guildId, result));
  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('milo')
    .setDescription('Export or import a Milo Bot configuration setup')
    .setDescriptionLocalizations({ th: 'ส่งออก/นำเข้าชุดตั้งค่า Milo Bot ครับ' })
    // จำกัดสิทธิ์: เฉพาะ Administrator ของเซิร์ฟเท่านั้นถึงจะเห็น/ใช้คำสั่งนี้ได้ (ทั้ง 2
    // subcommand) — export ก็เปิดเผยการตั้งค่าทั้งหมดของเซิร์ฟ import ก็เขียนทับ/เพิ่ม
    // ข้อมูลเข้าเซิร์ฟ ทั้งคู่กระทบทั้งเซิร์ฟ ไม่ใช่แค่ตัวผู้ใช้คนเดียว
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('export-config')
      .setDescription("Create a one-time code bundling this server's Milo Bot setup")
      .setDescriptionLocalizations({ th: 'สร้างรหัสใช้ครั้งเดียว รวมชุดตั้งค่า Milo Bot ของเซิร์ฟนี้ครับ' }))
    .addSubcommand(sub => sub.setName('import-config')
      .setDescription('Apply a Milo Bot configuration code to this server (one-time use)')
      .setDescriptionLocalizations({ th: 'นำรหัสตั้งค่า Milo Bot มาใช้กับเซิร์ฟนี้ครับ (ใช้ได้ครั้งเดียว)' })
      .addStringOption(opt => opt.setName('code')
        .setDescription('The code you received from the seller')
        .setDescriptionLocalizations({ th: 'รหัสที่ได้รับจากผู้ขาย' })
        .setRequired(true).setMaxLength(32))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // กันเรียกใน DM — ทั้ง export และ import ผูกกับ guild เสมอ ไม่มี guild ก็ไม่มีอะไรให้ทำ
    if (!guildId) {
      const t = createTranslator('en');
      return interaction.reply({ content: t('common.error.guild_only'), flags: MessageFlags.Ephemeral });
    }

    const t = createTranslator(getGuildLanguage(guildId));

    if (sub === 'export-config') return handleExport(interaction, guildId, t);
    if (sub === 'import-config') return handleImport(interaction, guildId, t);
  },

  // 🆕 [รอบ 14] handler ของแผงเลือก export — ถูกเรียกจาก index.js ตาม customId prefix
  // 'milo_export_' (ดูคอมเมนต์ที่ MX ด้านบน และส่วน isButton()/isStringSelectMenu() ใน index.js)
  handleButton,
  handleSelectMenu,
};

/**
 * สร้าง embed + components ของ "แผงเลือก" export-config ตาม state ปัจจุบัน
 * เรียกทั้งตอนเปิดแผงครั้งแรก (handleExport) และทุกครั้งที่ผู้ขายกดปุ่ม/เลือก dropdown
 * (handleButton/handleSelectMenu) เพื่อ "วาดแผงใหม่" ให้ตรงกับ state ล่าสุดเสมอ
 *
 * 🆕 [18 ต.ค. 2569 รอบ 16] เปลี่ยนจาก plain-text message (content ล้วนๆ) มาเป็น
 * Discord Embed + ปุ่ม/เมนูที่ไล่สีตามสถานะ (toggle on = เขียว, off = เทา) ตามสเปคที่
 * น้องหนาวขอ — ให้ความรู้สึก "พรีเมียม" มากขึ้น อ่านง่ายขึ้น ไม่ต้องไล่อ่าน text block
 * ยาวๆ เพื่อรู้ว่าตัวเองติ๊กอะไรไว้บ้าง (เห็นจาก field ของ embed + สีปุ่มตรงๆ)
 *
 * ⚠️ สำคัญ: ต้องส่ง `content: ''` กลับไปด้วยเสมอ (ไม่ใช่แค่ไม่ใส่ content เฉยๆ) เพราะ
 * `interaction.update()` แก้ไขข้อความแบบ "partial" — ถ้าไม่ส่ง content ไปเลย ข้อความเดิม
 * (ก่อนจะมี embed) จะค้างโชว์อยู่เหนือ embed ต่อไป กลายเป็นซ้อนกันดูรก
 *
 * @param {(key: string, replacements?: object) => string} t
 * @param {object} state - ดู exportSessions ด้านบนว่า state มีอะไรบ้าง
 * @param {string|null} errorKey - ใส่คีย์ error ถ้าต้องการโชว์แจ้งเตือนต่อท้าย intro (เช่น ยังไม่เลือกอะไรเลยแล้วกดสร้างรหัส)
 * @returns {{ content: string, embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildExportPanel(t, state, errorKey = null) {
  // คำอธิบายบนสุดของ embed — intro ปกติ + (ถ้ามี) แจ้งเตือน error แบบ blockquote ให้เด่นขึ้น
  const descriptionLines = [t('milo_config.export.panel_intro')];
  if (errorKey) descriptionLines.push('', `> ${t(errorKey)}`);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2) // Discord Blurple — สีหลักของทั้งแผง ตามสเปคที่ขอ
    .setTitle(t('milo_config.export.panel_title'))
    .setDescription(descriptionLines.join('\n'))
    .addFields(
      {
        name: t('milo_config.export.field_welcome'),
        value: state.selWelcome ? t('milo_config.export.panel_yes') : t('milo_config.export.panel_no'),
        inline: true,
      },
      {
        name: t('milo_config.export.field_goodbye'),
        value: state.selGoodbye ? t('milo_config.export.panel_yes') : t('milo_config.export.panel_no'),
        inline: true,
      },
      {
        name: t('milo_config.export.field_role_setups'),
        value: state.selRoleSetups.size > 0 ? [...state.selRoleSetups].join(', ') : t('milo_config.export.panel_none'),
        inline: false,
      },
      {
        name: t('milo_config.export.field_builders'),
        value: state.selBuilders.size > 0 ? [...state.selBuilders].join(', ') : t('milo_config.export.panel_none'),
        inline: false,
      },
    )
    .setFooter({ text: t('milo_config.export.panel_footer') });

  const components = [];

  // แถวที่ 1: ปุ่ม toggle welcome/goodbye — โชว์เฉพาะอันที่เซิร์ฟนี้มีตั้งค่าไว้จริงเท่านั้น
  // (ถ้าเซิร์ฟยังไม่ตั้ง welcome เลย ก็ไม่มีอะไรให้ toggle ไม่ต้องโชว์ปุ่มเปล่าๆ ให้งง)
  // สีปุ่ม: เลือกไว้ (true) = Success (เขียว) + ป้าย 🟢, ไม่เลือก (false) = Secondary (เทา) + ป้าย
  // ⚫ — ตั้งใจเลือก Secondary แทน Danger (แดง) สำหรับสถานะ "ยังไม่เลือก" เพราะสีแดงควรเก็บไว้
  // ใช้กับปุ่ม Cancel/ปุ่มทำลายข้อมูลเท่านั้น (ตามแพทเทิร์นเดิมของทั้งบอท) ไม่ใช่สถานะปุ่ม toggle
  // ปกติ — ไม่อย่างนั้นผู้ขายอาจเข้าใจผิดว่า "ไม่เลือก" แปลว่ามีอะไรผิดพลาด
  const toggleButtons = [];
  if (state.welcome) {
    toggleButtons.push(new ButtonBuilder()
      .setCustomId(MX.TOGGLE_WELCOME)
      .setLabel(state.selWelcome ? t('milo_config.export.panel_btn_welcome_on') : t('milo_config.export.panel_btn_welcome_off'))
      .setStyle(state.selWelcome ? ButtonStyle.Success : ButtonStyle.Secondary));
  }
  if (state.goodbye) {
    toggleButtons.push(new ButtonBuilder()
      .setCustomId(MX.TOGGLE_GOODBYE)
      .setLabel(state.selGoodbye ? t('milo_config.export.panel_btn_goodbye_on') : t('milo_config.export.panel_btn_goodbye_off'))
      .setStyle(state.selGoodbye ? ButtonStyle.Success : ButtonStyle.Secondary));
  }
  if (toggleButtons.length > 0) components.push(new ActionRowBuilder().addComponents(...toggleButtons));

  // แถวที่ 2: dropdown เลือก role setup (เฉพาะชื่อ) — โชว์เฉพาะถ้าเซิร์ฟนี้มีอย่างน้อย 1 ชุด
  // ⚠️ Discord จำกัด select menu ไว้สูงสุด 25 ตัวเลือก/อัน — ตัดเหลือ 25 ชุดแรกถ้าเกิน (ในทาง
  // ปฏิบัติไม่น่าถึง เพราะแผนฟรีจำกัด 1 ชุด/เซิร์ฟ และแผนพรีเมียมก็ไม่ได้ตั้งใจให้สร้างเกินนี้)
  if (state.roleSetups.length > 0) {
    const options = state.roleSetups.slice(0, 25).map(s => new StringSelectMenuOptionBuilder()
      .setLabel(`${ROLE_SETUP_TYPE_EMOJI[s.type] || '•'} ${s.name}`.slice(0, 100))
      .setValue(s.name)
      .setDefault(state.selRoleSetups.has(s.name)));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(MX.SELECT_ROLE_SETUPS)
        .setPlaceholder(t('milo_config.export.panel_select_role_setups_placeholder'))
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options)
    ));
  }

  // แถวที่ 3: dropdown เลือก builder draft (เฉพาะชื่อ) — โชว์เฉพาะถ้าเซิร์ฟนี้มีอย่างน้อย 1 ชุด
  if (state.builderDrafts.length > 0) {
    const options = state.builderDrafts.slice(0, 25).map(d => new StringSelectMenuOptionBuilder()
      .setLabel(d.name.slice(0, 100))
      .setValue(d.name)
      .setDefault(state.selBuilders.has(d.name)));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(MX.SELECT_BUILDERS)
        .setPlaceholder(t('milo_config.export.panel_select_builders_placeholder'))
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options)
    ));
  }

  // แถวสุดท้าย (แยกเป็นแถวของตัวเองล้วนๆ ตามสเปค): ปุ่มยืนยัน/ยกเลิก — มีเสมอไม่ว่าจะเลือก
  // อะไรไว้หรือยัง (กดยืนยันแล้วค่อยเช็คว่าเลือกอะไรไว้บ้างไหมอีกที ดู handleButton()
  // กรณี MX.CONFIRM ด้านล่าง) — Confirm = Primary (น้ำเงิน) + ✨, Cancel = Danger (แดง) + ✖️
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(MX.CONFIRM).setLabel(t('milo_config.export.panel_btn_confirm')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(MX.CANCEL).setLabel(t('milo_config.export.panel_btn_cancel')).setStyle(ButtonStyle.Danger),
  ));

  // content: '' ตั้งใจส่งเป็น string เปล่าเสมอ (ไม่ใช่ปล่อยว่างไว้) — กัน content เก่าค้างซ้อน
  // กับ embed ตามที่อธิบายไว้ใน docblock ด้านบน
  return { content: '', embeds: [embed], components };
}

/**
 * /milo export-config — 🆕 [รอบ 14] เปิด "แผงเลือก" ให้ผู้ขายติ๊กเองว่าจะรวมอะไรบ้าง
 * (welcome/goodbye/role setup ชุดไหน/builder ชุดไหน) แทนที่จะรวมทุกอย่างอัตโนมัติแบบเดิม —
 * ตัวจบจริงๆ (สร้างรหัส) อยู่ที่ handleButton() กรณี MX.CONFIRM ด้านล่าง ไม่ใช่ที่นี่
 */
async function handleExport(interaction, guildId, t) {
  const welcome = loadWelcomeConfig(guildId);
  const goodbye = loadGoodbyeConfig(guildId);
  const roleSetups = listSetups(guildId);
  const builderDrafts = listDrafts(guildId);

  // ไม่มีอะไรให้ export เลย — ไม่ต้องเปิดแผงเปล่าๆ ให้งง ตอบตรงๆ ไปเลย
  if (!welcome && !goodbye && roleSetups.length === 0 && builderDrafts.length === 0) {
    return interaction.reply({ content: t('milo_config.export.nothing_to_export'), flags: MessageFlags.Ephemeral });
  }

  // snapshot ทุกอย่างไว้ใน state ตอนเปิดแผง ณ ตอนนี้ — ไม่ติ๊กอะไรไว้ล่วงหน้าเลยสักอัน
  // (ขอบเขตที่คุยกับน้องหนาวแล้ว: ต้องเลือกเองทุกครั้ง ไม่ใช่ pre-select ให้ครบแล้วค่อยติ๊กออก)
  const state = {
    welcome, goodbye, roleSetups, builderDrafts,
    selWelcome: false, selGoodbye: false,
    selRoleSetups: new Set(), selBuilders: new Set(),
  };
  exportSessions.set(sessionKey(guildId, interaction.user.id), state);

  return interaction.reply({
    ...buildExportPanel(t, state),
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * ปุ่มในแผงเลือก export (toggle welcome/goodbye, ยืนยันสร้างรหัส, ยกเลิก)
 * ถูกเรียกจาก index.js ตาม customId prefix 'milo_export_' (ดู MX ด้านบน)
 */
async function handleButton(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const t = createTranslator(getGuildLanguage(guildId));
  const key = sessionKey(guildId, userId);
  const state = exportSessions.get(key);

  // แผงหมดอายุ (บอทรีสตาร์ท หรือผู้ขายเปิดทิ้งไว้นานจนข้อมูลในหน่วยความจำหาย) — บอกให้สั่งใหม่
  if (!state) {
    return interaction.update({ content: t('milo_config.export.panel_expired'), components: [] });
  }

  if (interaction.customId === MX.TOGGLE_WELCOME) {
    state.selWelcome = !state.selWelcome;
    return interaction.update(buildExportPanel(t, state));
  }

  if (interaction.customId === MX.TOGGLE_GOODBYE) {
    state.selGoodbye = !state.selGoodbye;
    return interaction.update(buildExportPanel(t, state));
  }

  if (interaction.customId === MX.CANCEL) {
    exportSessions.delete(key);
    return interaction.update({ content: t('milo_config.export.panel_cancelled'), components: [] });
  }

  if (interaction.customId === MX.CONFIRM) {
    const nothingSelected = !state.selWelcome && !state.selGoodbye
      && state.selRoleSetups.size === 0 && state.selBuilders.size === 0;

    // ไม่ติ๊กอะไรไว้เลยแล้วกดสร้างรหัส — ไม่สร้างรหัสเปล่าๆ ทิ้งไว้ในระบบ โชว์แจ้งเตือนแล้ว
    // วาดแผงเดิมกลับให้เลือกต่อได้เลย (ไม่ต้องสั่งคำสั่งใหม่)
    if (nothingSelected) {
      return interaction.update(buildExportPanel(t, state, 'milo_config.export.panel_error_nothing_selected'));
    }

    // กรองเอาเฉพาะชื่อที่เลือกไว้จาก snapshot ตอนเปิดแผง (ไม่ query storage ใหม่ — กันกรณี
    // ผู้ขายแก้/ลบอะไรไปกลางทางระหว่างเลือก ให้ยึดตามที่เห็นในแผงตอนนั้นเป๊ะๆ)
    const selectedRoleSetups = state.roleSetups.filter(s => state.selRoleSetups.has(s.name));
    const selectedBuilders = state.builderDrafts.filter(d => state.selBuilders.has(d.name));

    // ⚠️ ล้าง channelId ออกก่อนเก็บเข้ารหัส — เหตุผลเดียวกับโค้ดเดิม (ห้องของเซิร์ฟผู้ขายเอง
    // เอาไปใช้ในเซิร์ฟผู้ซื้อไม่ได้แน่ๆ) ดูคอมเมนต์เดิมที่ handleExport() เวอร์ชันก่อนหน้า
    const bundle = {
      welcome: (state.selWelcome && state.welcome) ? { ...state.welcome, channelId: null } : null,
      goodbye: (state.selGoodbye && state.goodbye) ? { ...state.goodbye, channelId: null } : null,
      roleSetups: selectedRoleSetups,
      builderDrafts: selectedBuilders,
    };

    const code = createExport(guildId, userId, bundle);
    exportSessions.delete(key);

    // สรุปให้ผู้ขายเห็นชัดๆ ว่ารหัสนี้มี "อะไรที่เลือกไว้จริง" ติดไปด้วยบ้าง — ไม่ใช่ทุกอย่าง
    // ที่มีอยู่ในเซิร์ฟเหมือนโค้ดเดิมอีกต่อไป (นี่คือจุดสำคัญที่เปลี่ยนไปจากรอบก่อน)
    const summaryLines = [
      bundle.welcome ? t('milo_config.export.summary_welcome_yes') : t('milo_config.export.summary_welcome_no'),
      bundle.goodbye ? t('milo_config.export.summary_goodbye_yes') : t('milo_config.export.summary_goodbye_no'),
      t('milo_config.export.summary_role_setups', { count: selectedRoleSetups.length }),
      t('milo_config.export.summary_builders', { count: selectedBuilders.length }),
    ];

    return interaction.update({
      content: t('milo_config.export.success', { code, summary: summaryLines.map(l => `• ${l}`).join('\n') }),
      components: [],
    });
  }
}

/**
 * dropdown ในแผงเลือก export (เลือก role setup / builder draft ที่จะรวม)
 * ถูกเรียกจาก index.js ตาม customId prefix 'milo_export_' (ดู MX ด้านบน)
 */
async function handleSelectMenu(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const t = createTranslator(getGuildLanguage(guildId));
  const key = sessionKey(guildId, userId);
  const state = exportSessions.get(key);

  if (!state) {
    return interaction.update({ content: t('milo_config.export.panel_expired'), components: [] });
  }

  // interaction.values = array ของ value (ชื่อ) ที่ผู้ขายติ๊กไว้ ณ ตอนกดส่ง dropdown นี้ —
  // แทนที่ Set เดิมทั้งหมดเลย (ไม่ merge) เพราะ Discord ส่ง "สถานะล่าสุดทั้งหมด" ของ dropdown
  // อันนั้นมาให้ทุกครั้ง ไม่ใช่แค่ส่วนที่เปลี่ยน
  if (interaction.customId === MX.SELECT_ROLE_SETUPS) {
    state.selRoleSetups = new Set(interaction.values);
    return interaction.update(buildExportPanel(t, state));
  }

  if (interaction.customId === MX.SELECT_BUILDERS) {
    state.selBuilders = new Set(interaction.values);
    return interaction.update(buildExportPanel(t, state));
  }
}

/**
 * /milo import-config <code> — ใช้รหัสที่ได้รับมา (ผ่าน DM จาก Marketplace หลังจ่ายเงิน
 * หรือผู้ขายส่งมาตรงๆ ก็ได้) นำการตั้งค่าทั้งชุดมาติดตั้งในเซิร์ฟนี้
 *
 * เงื่อนไขพิเศษฝั่งแผนฟรี (กัน import ถูกใช้หลบโควตาพรีเมียม — ใช้ค่าเดียวกับที่
 * /role-setup new และ /builder new เช็คอยู่แล้ว):
 *  - role setup ชนิด menu/button → เซิร์ฟฟรีสร้างเองไม่ได้อยู่แล้ว ข้ามไปเลย (ไม่ import)
 *  - role setup ชนิด reaction ที่มีมากกว่า 2 ยศ → ตัดเหลือ 2 ยศแรกเท่านั้น (เท่าโควตาฟรี)
 *  - role setup/builder ที่เกินโควตา 1 ชุด/เซิร์ฟของแผนฟรี → import แค่เท่าที่โควตาเหลือ
 *    ส่วนที่เกินจะถูกข้ามไป (ไม่ error ทั้งคำสั่ง แค่ import ได้น้อยกว่ารหัสที่มีจริง)
 */
async function handleImport(interaction, guildId, t) {
  const code = interaction.options.getString('code').trim().toUpperCase();
  const entry = getExport(code);

  if (!entry) {
    return interaction.reply({ content: t('milo_config.import.invalid_code'), flags: MessageFlags.Ephemeral });
  }
  if (entry.usedAt) {
    return interaction.reply({ content: t('milo_config.import.already_used'), flags: MessageFlags.Ephemeral });
  }

  const { bundle } = entry;
  const premium = isPremiumGuild(guildId);
  const userId = interaction.user.id;
  const now = new Date().toISOString();

  const imported = { welcome: false, goodbye: false, roleSetups: [], builderDrafts: [] };
  const skipped = { roleSetups: 0, builderDrafts: 0 };

  try {
    // ── welcome / goodbye: เขียนทับของเดิมในเซิร์ฟนี้ตรงๆ ได้เลย (มีได้แค่ชุดเดียว/เซิร์ฟ
    // อยู่แล้วตามธรรมชาติของฟีเจอร์นี้ ไม่มีคอนเซปต์ "ชื่อ" ให้ชนกันแบบ role-setup/builder)
    // channelId ถูกล้างไว้เป็น null ตั้งแต่ตอน export แล้ว (enabled จะไม่ยิงจนกว่าแอดมินเซิร์ฟ
    // นี้เลือกห้องใหม่เอง) ⚠️ เขียนทับของเดิมที่เซิร์ฟนี้อาจตั้งไว้ก่อนแล้วจริงๆ — ตั้งใจแบบนี้
    // เพราะ "import setup ของคนอื่น" ควรหมายถึงแทนที่ของเดิม ไม่ใช่ merge ปนกัน
    if (bundle.welcome) {
      saveWelcomeConfig(guildId, bundle.welcome);
      imported.welcome = true;
    }
    if (bundle.goodbye) {
      saveGoodbyeConfig(guildId, bundle.goodbye);
      imported.goodbye = true;
    }

    // ── role setups: แต่ละชุดมีชื่อของตัวเอง เซิร์ฟเดียวมีได้หลายชุด ต้องกันชื่อชนกับ
    // ของเดิมที่เซิร์ฟนี้มีอยู่แล้ว (resolveUniqueName) และเช็คโควตา/ชนิดที่อนุญาตของแผนฟรี
    let roleSetupSlotsLeft = premium
      ? Infinity
      : Math.max(0, FREE_ROLE_SETUP_LIMIT - listSetups(guildId).length);

    for (const setup of bundle.roleSetups) {
      if (!premium && setup.type !== 'reaction') { skipped.roleSetups++; continue; }
      if (roleSetupSlotsLeft <= 0) { skipped.roleSetups++; continue; }

      let config = setup.config;
      if (!premium && setup.type === 'reaction' && Array.isArray(config?.reactions) && config.reactions.length > FREE_REACTION_LIMIT) {
        config = { ...config, reactions: config.reactions.slice(0, FREE_REACTION_LIMIT) };
      }

      const newName = resolveUniqueName(setupExists, guildId, setup.name, 50);
      saveSetup(guildId, newName, {
        ...setup,
        name: newName,
        config,
        lastPostedAt: null, // ยังไม่เคยโพสต์จริงในเซิร์ฟนี้ — ให้ผู้ซื้อกด post เองหลังเช็ค/แก้ยศแล้ว
        createdBy: userId,
        createdAt: now,
        updatedBy: userId,
        updatedAt: now,
      });
      imported.roleSetups.push(newName);
      roleSetupSlotsLeft--;
    }

    // ── builder drafts: โควตาเดียวกันแบบเดียวกับ role setup (จำนวนชุด/เซิร์ฟ) — จำนวน
    // block ข้างในแต่ละชุดไม่ต้องตัดเอง เพราะ resolveBuilderPanelPayload() ของ builder.js
    // เช็ค isPremiumGuild() ทุกครั้งที่แสดงผลอยู่แล้ว (ออกแบบไว้ล่วงหน้าเพื่อรองรับเคส
    // "เซิร์ฟดาวน์เกรดจากพรีเมียมเป็นฟรีแต่ข้อมูลเก่ายังมี block เกินโควตาอยู่" — เคส import
    // เข้าเงื่อนไขเดียวกันเป๊ะ ใช้ fail-safe เดิมได้เลยไม่ต้องเขียนใหม่)
    let builderSlotsLeft = premium
      ? Infinity
      : Math.max(0, FREE_BUILDER_LIMIT - listDrafts(guildId).length);

    for (const draft of bundle.builderDrafts) {
      if (builderSlotsLeft <= 0) { skipped.builderDrafts++; continue; }
      const newName = resolveUniqueName(draftExists, guildId, draft.name, 50);
      saveDraft(guildId, newName, {
        ...draft,
        name: newName,
        createdBy: userId,
        createdAt: now,
        updatedBy: userId,
        updatedAt: now,
      });
      imported.builderDrafts.push(newName);
      builderSlotsLeft--;
    }
  } catch (error) {
    // ❗ ไม่ markUsed() ถ้า apply พัง — กันผู้ซื้อเสียสิทธิ์ใช้รหัสของตัวเองไปฟรีๆ โดยไม่ได้
    // อะไรเลย (ดู comment ที่ markUsed() ใน utils/miloConfigStorage.js) แจ้ง error ตรงๆ
    console.error('[milo import-config] apply bundle ไม่สำเร็จ:', error);
    return interaction.reply({ content: t('milo_config.import.apply_failed'), flags: MessageFlags.Ephemeral });
  }

  // apply สำเร็จแล้วเท่านั้นถึงล็อกรหัสว่าใช้ไปแล้ว (ใช้ได้ครั้งเดียวจริง)
  markUsed(code, guildId);

  // ── สรุปผลให้ผู้ซื้อเห็นชัดๆ ว่า import อะไรไปบ้าง + คำเตือนสำคัญเรื่องยศ/ห้อง
  const lines = [t('milo_config.import.success_header')];
  if (imported.welcome) lines.push(t('milo_config.import.item_welcome'));
  if (imported.goodbye) lines.push(t('milo_config.import.item_goodbye'));
  if (imported.roleSetups.length > 0) {
    lines.push(t('milo_config.import.item_role_setups', { names: imported.roleSetups.join(', ') }));
  }
  if (imported.builderDrafts.length > 0) {
    lines.push(t('milo_config.import.item_builders', { names: imported.builderDrafts.join(', ') }));
  }
  if (skipped.roleSetups > 0 || skipped.builderDrafts > 0) {
    lines.push('', t('milo_config.import.skipped_tier_notice', { count: skipped.roleSetups + skipped.builderDrafts }));
  }
  if (imported.roleSetups.length > 0 || imported.builderDrafts.length > 0) {
    lines.push('', t('milo_config.import.warning_roles_channels'));
  }
  if (imported.welcome || imported.goodbye) {
    lines.push(t('milo_config.import.warning_channel'));
  }

  return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
}
