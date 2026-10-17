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

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
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
};

/**
 * /milo export-config — รวบรวมการตั้งค่า 3 ระบบ (welcome/goodbye, role setup, builder)
 * ของเซิร์ฟนี้ ณ ตอนนี้ เป็นรหัสเดียวใช้ครั้งเดียว แล้วตอบกลับให้ผู้ขายเอาไปใส่ในฟอร์ม
 * "รหัสการตั้งค่า Milo Bot" ของ Marketplace dashboard ได้เลย
 */
async function handleExport(interaction, guildId, t) {
  const welcome = loadWelcomeConfig(guildId);
  const goodbye = loadGoodbyeConfig(guildId);
  const roleSetups = listSetups(guildId);
  const builderDrafts = listDrafts(guildId);

  // ไม่มีอะไรให้ export เลย — ไม่สร้างรหัสเปล่าๆ ทิ้งไว้ในระบบ
  if (!welcome && !goodbye && roleSetups.length === 0 && builderDrafts.length === 0) {
    return interaction.reply({ content: t('milo_config.export.nothing_to_export'), flags: MessageFlags.Ephemeral });
  }

  // ⚠️ ล้าง channelId ออกก่อนเก็บเข้ารหัส — channelId เป็น id ห้องของเซิร์ฟผู้ขายเอง เอาไป
  // ใช้ในเซิร์ฟอื่นไม่ได้แน่ๆ (ห้องนั้นไม่มีจริงในเซิร์ฟผู้ซื้อ) ต้องให้ผู้ซื้อเลือกห้องใหม่
  // เองหลัง import เสมอ — ฟีเจอร์นี้ออกแบบไว้แล้วว่า enabled จะไม่ทำงานถ้า channelId เป็น
  // null (ดู handleMemberAdd() ใน welcome-setup.js/goodbye-setup.js) กันพลาดส่งเข้าห้องผิด
  const bundle = {
    welcome: welcome ? { ...welcome, channelId: null } : null,
    goodbye: goodbye ? { ...goodbye, channelId: null } : null,
    roleSetups,
    builderDrafts,
  };

  const code = createExport(guildId, interaction.user.id, bundle);

  // สรุปให้ผู้ขายเห็นชัดๆ ว่ารหัสนี้มีอะไรติดไปด้วยบ้าง (เผื่อลืมว่าตั้งอะไรไว้)
  const summaryLines = [
    welcome ? t('milo_config.export.summary_welcome_yes') : t('milo_config.export.summary_welcome_no'),
    goodbye ? t('milo_config.export.summary_goodbye_yes') : t('milo_config.export.summary_goodbye_no'),
    t('milo_config.export.summary_role_setups', { count: roleSetups.length }),
    t('milo_config.export.summary_builders', { count: builderDrafts.length }),
  ];

  return interaction.reply({
    content: t('milo_config.export.success', { code, summary: summaryLines.map(l => `• ${l}`).join('\n') }),
    flags: MessageFlags.Ephemeral,
  });
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
