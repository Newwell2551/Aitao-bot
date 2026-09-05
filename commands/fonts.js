// commands/fonts.js
// คำสั่ง /fonts — ศูนย์รวมทุกอย่างเกี่ยวกับฟอนต์ของเซิร์ฟนี้ในคำสั่งเดียว
// (เดิมแยกเป็น /upload-font กับ /fonts สองคำสั่ง ตอนนี้รวมเป็นคำสั่งเดียวแล้ว
// ตามที่ขอ — ไม่มี /upload-font แยกต่างหากอีกต่อไป)
//
// มี 2 subcommand:
//   /fonts list   — ดูฟอนต์ทั้งหมด (มาตรฐานของบอท + อัปโหลดเอง) + เลือกลบได้
//   /fonts upload — อัปโหลดไฟล์ฟอนต์ใหม่ (.ttf / .otf)
//
// 🔑 ทำไมต้องแยกเป็น subcommand 2 อัน แทนที่จะให้ /fonts เฉยๆ ทำทุกอย่าง:
// Discord slash command กติกาคือ "ถ้าคำสั่งมี subcommand แล้ว ต้องเลือก
// subcommand เสมอ เรียกคำสั่งเปล่าๆ ไม่ได้" และกติกาอีกข้อคือ "attachment
// option (ไฟล์แนบ) กับ subcommand อื่นๆ ต้องอยู่คนละ subcommand กัน" (ผสมกัน
// ในระดับเดียวกันไม่ได้) เพราะงั้นการอัปโหลดไฟล์ (ต้องมี attachment option)
// กับการดูลิสต์/ลบ (ไม่มี attachment option) เลยแยกเป็นคนละ subcommand ไป
// แต่ยังอยู่ใต้คำสั่ง /fonts เดียวกัน พิมพ์ /fonts แล้ว Discord จะโชว์ให้เลือก
// list หรือ upload ต่อทันที ใช้งานง่าย ไม่ต้องจำ 2 ชื่อคำสั่งแยกกันเหมือนเดิม
//
// 🎯 Pattern การลบแบบ multi-select (ใน subcommand list) mirror มาจาก
// role-setup.js (RS.ROLE_REMOVE — StringSelectMenu ที่ minValues:0 ให้เลือกได้
// หลายอัน หรือไม่เลือกเลยก็ได้ แล้วลบทันทีตอนกด ไม่ต้องมีขั้นยืนยันเพิ่ม)

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const { GlobalFonts } = require('@napi-rs/canvas');

const { getGuildLanguage }                                          = require('../utils/languageStorage');
const { createTranslator }                                          = require('../utils/i18n');
const { getGuildFonts, saveGuildFont, deleteGuildFontById, MAX_FONTS_PER_GUILD } = require('../utils/fontStorage');

// ─── Custom ID ───────────────────────────────────────────────────────────────
const FONTS = {
  DELETE_SELECT: 'fonts_delete_select',
};

// ─── ค่าคงที่สำหรับตรวจไฟล์อัปโหลด (ย้ายมาจาก upload-font.js เดิม) ─────────────
const ALLOWED_EXTENSIONS = ['.ttf', '.otf'];
// ฟอนต์ปกติไฟล์ไม่ใหญ่มาก (ไม่กี่ร้อย KB ถึงไม่กี่ MB) กันไฟล์แปลกปลอม/ไฟล์ผิด
// ประเภทที่ตั้งชื่อนามสกุลหลอกมา — จำกัดไว้ 8MB ให้พอสำหรับฟอนต์จริงๆ ทุกแบบ
const MAX_FONT_SIZE_BYTES = 8 * 1024 * 1024;

/**
 * สร้างหน้า panel หลักของ /fonts list — แสดงฟอนต์มาตรฐานของบอท + ฟอนต์ที่เซิร์ฟนี้
 * อัปโหลดเอง พร้อม select menu ให้เลือกลบได้เลย (ถ้ามีฟอนต์ที่อัปโหลดเองอย่างน้อย 1 ไฟล์)
 * @param {string} guildId
 * @returns {object} payload พร้อมส่งเข้า interaction.reply()/update()
 */
function buildFontsPanel(guildId) {
  const t = createTranslator(getGuildLanguage(guildId));
  const guildFonts = getGuildFonts(guildId);

  const components = [
    new TextDisplayBuilder().setContent(t('fonts.panel.title')),
    new TextDisplayBuilder().setContent(
      `${t('fonts.panel.builtin_header')}\n${t('fonts.panel.builtin_list')}`
    ),
  ];

  const customHeader = t('fonts.panel.custom_header', { count: guildFonts.length, max: MAX_FONTS_PER_GUILD });

  if (guildFonts.length === 0) {
    components.push(new TextDisplayBuilder().setContent(`${customHeader}\n${t('fonts.panel.custom_empty')}`));
  } else {
    // ── ลิสต์ชื่อไฟล์ทุกไฟล์ให้เห็นเต็มๆ ก่อน (เผื่อแอดมินจำชื่อไม่ได้ หรือ
    // ทำไฟล์หาย แต่รู้ว่าเคยเห็นชื่อนี้ในเมนูฟอนต์ของ /welcome-setup หรือ /goodbye-setup)
    const listText = guildFonts.map((f, i) => `${i + 1}. ${f.originalName}`).join('\n');
    components.push(new TextDisplayBuilder().setContent(`${customHeader}\n${listText}`));

    // ── select menu เลือกลบ — minValues:0 กดโดยไม่เลือกอะไรเลยได้ (ไม่ลบอะไร)
    // เลือกได้หลายไฟล์พร้อมกันในครั้งเดียว ลบทันทีไม่ต้องมีขั้นยืนยันซ้ำ
    const deleteSelect = new StringSelectMenuBuilder()
      .setCustomId(FONTS.DELETE_SELECT)
      .setPlaceholder(t('fonts.panel.delete_placeholder'))
      .setMinValues(0)
      .setMaxValues(guildFonts.length)
      .addOptions(guildFonts.map(f => ({
        label: f.originalName.slice(0, 100),
        value: f.id,
      })));
    components.push(new ActionRowBuilder().addComponents(deleteSelect));
  }

  components.push(new TextDisplayBuilder().setContent(t('fonts.panel.upload_hint')));

  return {
    components,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fonts')
    .setDescription('View, upload, and manage all fonts available on this server')
    .setDescriptionLocalizations({ th: 'ดู อัปโหลด และจัดการฟอนต์ทั้งหมดของเซิร์ฟนี้ครับ' })
    .addSubcommand(sub => sub.setName('list')
      .setDescription('View all fonts (built-in + custom) and delete custom ones')
      .setDescriptionLocalizations({ th: 'ดูฟอนต์ทั้งหมด (มาตรฐาน + อัปโหลดเอง) และเลือกลบได้ครับ' })
    )
    .addSubcommand(sub => sub.setName('upload')
      .setDescription('Upload a custom font file for this server')
      .setDescriptionLocalizations({ th: 'อัปโหลดไฟล์ฟอนต์ของเซิร์ฟนี้ครับ' })
      .addAttachmentOption(option => option
        .setName('font')
        .setDescription('Font file (.ttf or .otf)')
        .setDescriptionLocalizations({ th: 'ไฟล์ฟอนต์ (.ttf หรือ .otf)' })
        .setRequired(true)
      )
    ),

  async execute(interaction) {
    const t = createTranslator(interaction.guildId ? getGuildLanguage(interaction.guildId) : 'en');
    if (!interaction.guildId) {
      await interaction.reply({ content: t('fonts.error.guild_only'), flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();

    // ── /fonts list ──────────────────────────────────────────────────────
    if (sub === 'list') {
      await interaction.reply(buildFontsPanel(interaction.guildId));
      return;
    }

    // ── /fonts upload (ย้าย logic มาจาก upload-font.js เดิมทั้งหมด) ──────────
    if (sub === 'upload') {
      const attachment = interaction.options.getAttachment('font');

      const lowerName = attachment.name.toLowerCase();
      const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
      if (!hasAllowedExtension) {
        await interaction.reply({
          content: t('fonts.upload.error.invalid_file', { extensions: ALLOWED_EXTENSIONS.join(', ') }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (attachment.size > MAX_FONT_SIZE_BYTES) {
        await interaction.reply({
          content: t('fonts.upload.error.too_large', { max: Math.floor(MAX_FONT_SIZE_BYTES / 1024 / 1024) }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ── โหลดไฟล์ + register อาจใช้เวลานิดหน่อย — defer ไว้ก่อนกัน error
      // "Unknown interaction" เหมือนคำสั่งอื่นๆ ในโปรเจกต์
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const ext = lowerName.slice(lowerName.lastIndexOf('.'));

      let buffer;
      try {
        // attachment.url ยังไม่หมดอายุแน่นอน (เพิ่งได้มาหมาดๆ จาก interaction นี้)
        // โหลดเนื้อไฟล์มาเก็บเป็น Buffer ก่อน แล้วค่อยเขียนลงดิสก์เองผ่าน fontStorage
        // (ต่างจากรูปภาพที่ปล่อยให้ Discord โฮสต์ไว้ต่อ — ฟอนต์ต้องมีไฟล์จริงบนดิสก์
        // ให้ @napi-rs/canvas อ่านได้โดยตรง อ่าน comment บนสุดของ fontStorage.js ประกอบ)
        const res = await fetch(attachment.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buffer = Buffer.from(await res.arrayBuffer());
      } catch (error) {
        console.error('[fonts upload] โหลดไฟล์ฟอนต์จาก Discord ไม่สำเร็จ:', error);
        await interaction.editReply({ content: t('fonts.upload.error.download_failed') });
        return;
      }

      // ── บันทึกไฟล์ + ตั้ง family name ใหม่ก่อน แล้วค่อย "ทดลอง register" ทันที
      // เพื่อเช็คว่าไฟล์นี้เป็นไฟล์ฟอนต์ที่ใช้ได้จริงไหม (กันกรณีคนอัปโหลดไฟล์
      // ที่ตั้งนามสกุลหลอกเป็น .ttf/.otf แต่ข้างในไม่ใช่ไฟล์ฟอนต์จริง)
      const saveResult = saveGuildFont(interaction.guildId, buffer, ext, attachment.name);

      // ── เซิร์ฟนี้เก็บฟอนต์ไว้เต็ม MAX_FONTS_PER_GUILD แล้ว — แจ้งให้ไปลบตัวที่
      // ไม่ใช้ออกก่อนผ่าน /fonts list (จำกัดตามขีดจำกัด option ของ Discord select
      // menu ดู comment ที่ MAX_FONTS_PER_GUILD ใน fontStorage.js ประกอบ)
      if (!saveResult.ok) {
        await interaction.editReply({ content: t('fonts.upload.error.max_reached', { max: MAX_FONTS_PER_GUILD }) });
        return;
      }

      const { id: fontId, path: fontPath, family } = saveResult;

      // ⚠️ เรียก GlobalFonts.registerFromPath() ตรงๆ ที่นี่ (ไม่ผ่าน
      // ensureCustomFontRegistered() ใน canvasDrawHelpers.js) เพราะฟังก์ชันนั้น
      // ถูกออกแบบให้ "ไม่ throw error ออกมาเด็ดขาด" (เพื่อไม่ให้การวาดการ์ดจริง
      // พังเวลาเจอไฟล์เสีย) แต่ตรงนี้เราอยากรู้ผลจริงๆ ว่า register สำเร็จไหม
      // เพื่อตัดสินใจว่าจะเก็บไฟล์นี้ไว้หรือลบทิ้งแล้วแจ้ง error กลับไป
      try {
        GlobalFonts.registerFromPath(fontPath, family);
      } catch (error) {
        console.error('[fonts upload] ไฟล์นี้ register เป็นฟอนต์ไม่สำเร็จ (อาจไม่ใช่ไฟล์ฟอนต์จริง):', error.message);
        // register ไม่สำเร็จ → ไฟล์นี้ใช้งานจริงไม่ได้แน่นอน ลบทิ้งไปเลย ไม่ปล่อยค้าง
        deleteGuildFontById(interaction.guildId, fontId);
        await interaction.editReply({ content: t('fonts.upload.error.invalid_font_data') });
        return;
      }

      // ── ข้อความตอบกลับสั้นๆ พอ ไม่ต้องอธิบายวิธีใช้ยาวๆ (ไปดูวิธีใช้ผ่าน
      // /fonts list ได้เลยถ้าอยากรู้ว่าตอนนี้มีฟอนต์อะไรบ้าง)
      await interaction.editReply({
        content: t('fonts.upload.reply.success', { name: attachment.name }),
      });
      return;
    }
  },

  // ─── Handle StringSelectMenu (fonts_*) ───────────────────────────────────
  async handleSelectMenu(interaction) {
    if (interaction.customId !== FONTS.DELETE_SELECT) return;
    const guildId = interaction.guildId;
    const t = createTranslator(getGuildLanguage(guildId));

    const toDelete = interaction.values; // array ของ fontId ที่ถูกเลือก (อาจว่างเปล่าได้)
    let removedCount = 0;
    for (const fontId of toDelete) {
      const removed = deleteGuildFontById(guildId, fontId);
      if (removed) removedCount++;
    }

    // อัปเดตหน้า panel ให้ตรงกับข้อมูลล่าสุดเสมอ (ลิสต์ + select menu ใหม่)
    await interaction.update(buildFontsPanel(guildId));

    if (removedCount > 0) {
      await interaction.followUp({
        content: t('fonts.delete.confirm', { count: removedCount }),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};