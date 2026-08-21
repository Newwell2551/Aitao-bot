// commands/ping.js
// อัปเดตให้ดึงภาษาของ guild แล้วตอบผ่านระบบ i18n แทน string ที่ hardcode ไว้เดิม

const { SlashCommandBuilder } = require('discord.js');
const { getGuildLanguage } = require('../utils/languageStorage');
const { createTranslator } = require('../utils/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency')
    .setDescriptionLocalizations({ th: 'เช็คความหน่วงของบอทครับ' }),
  async execute(interaction) {
    const lang    = getGuildLanguage(interaction.guildId);
    const t       = createTranslator(lang);
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply(t('ping.response', { latency }));
  },
};