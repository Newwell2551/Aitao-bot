// commands/language.js
// คำสั่ง /language — ตั้งภาษาของบอทสำหรับเซิร์ฟเวอร์นี้ (จำกัดสิทธิ์แอดมินเท่านั้น)

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { setGuildLanguage } = require('../utils/languageStorage');
const { createTranslator } = require('../utils/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription("Set the bot's language for this server")
    .setDescriptionLocalizations({ th: 'ตั้งค่าภาษาบอทในเซิร์ฟนี้ครับ' })
    .addStringOption(opt =>
      opt.setName('lang')
        .setDescription('Choose language')
        .setDescriptionLocalizations({ th: 'เลือกภาษาครับ' })
        .setRequired(true)
        .addChoices(
          { name: 'English', value: 'en' },
          { name: 'Thai', value: 'th', name_localizations: { th: 'ไทย' } },
        ))
    // จำกัดสิทธิ์: เฉพาะคนมี Manage Server เท่านั้นถึงจะเห็น/ใช้คำสั่งนี้ได้
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    // กันเรียกใน DM — ภาษาผูกกับ guild ถ้าไม่มี guildId ก็ไม่มี guild ให้ดึงภาษามาใช้
    if (!interaction.guildId) {
      const t = createTranslator('en'); // ไม่มี guildId เลยไม่มีภาษาเซิร์ฟให้ดึง ใช้ default
      return interaction.reply({
        content: t('common.error.guild_only'),
        flags: MessageFlags.Ephemeral,
      });
    }

    const lang = interaction.options.getString('lang');
    setGuildLanguage(interaction.guildId, lang);

    // ใช้ t() ของภาษาที่เพิ่งตั้งใหม่ ตอบกลับด้วยภาษานั้นเลย ให้แอดมินเห็นผลทันที
    const t = createTranslator(lang);
    await interaction.reply({
      content: t('language.changed', { lang: lang === 'th' ? 'ไทย' : 'English' }),
      flags: MessageFlags.Ephemeral,
    });
  },
};