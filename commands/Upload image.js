const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { getGuildLanguage } = require('../utils/languageStorage');
const { createTranslator } = require('../utils/i18n');

const ASSET_CHANNEL_NAME = 'asset-storage';
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

/**
 * หาห้อง asset-storage ที่มีอยู่แล้ว หรือสร้างใหม่ถ้ายังไม่มี
 * ตั้งสิทธิ์ห้ามคนทั่วไป (@everyone) มองเห็นห้องนี้ ให้บอทเท่านั้นที่โพสต์ได้
 * @param {import('discord.js').Guild} guild
 * @param {(key: string, replacements?: object) => string} t ฟังก์ชันแปลภาษา
 */
async function getOrCreateAssetChannel(guild, t) {
  const existing = guild.channels.cache.find(
    (channel) => channel.name === ASSET_CHANNEL_NAME && channel.type === ChannelType.GuildText
  );

  if (existing) {
    // ── เจอห้องเดิมแล้ว แต่ก่อนใช้งานต้องเช็คก่อนว่าบอทยังมีสิทธิ์โพสต์ในห้องนี้อยู่ไหม ──
    // เดิมโค้ดจุดนี้เจอห้องเก่าแล้ว "เชื่อเลย" ว่าสิทธิ์ยังตั้งไว้ถูกต้องเหมือนตอนสร้าง
    // แต่ในความเป็นจริงสิทธิ์ของห้องหายไปทีหลังได้หลายทางครับ เช่น:
    //   - มีคนลากห้องนี้ไปไว้ในหมวดหมู่ (category) ใหม่ แล้วกด "Sync Permissions"
    //     (การซิงค์จะล้างสิทธิ์เฉพาะห้องทิ้งทั้งหมด แล้วก็อปสิทธิ์ของหมวดหมู่มาแทน —
    //     ถ้าหมวดหมู่นั้นไม่มีการอนุญาตพิเศษให้บอท ห้องนี้ก็จะกลายเป็นห้องที่บอทเข้าไม่ได้ทันที)
    //   - มีคนเผลอไปแก้ permission ของห้องนี้เอง ตอนจัดระเบียบ/ตกแต่งเซิร์ฟ
    // ผลคือ error DiscordAPIError[50001]: Missing Access ตอนบอทพยายามส่งรูปเข้าห้องนี้
    //
    // ทางแก้: เช็คสิทธิ์จริง ณ ตอนนี้ทุกครั้งที่เจอห้องเดิม ถ้าขาดสิทธิ์ที่จำเป็นไป
    // ให้บอทตั้งสิทธิ์ของตัวเองกลับคืนให้อัตโนมัติเลย ไม่ต้องรอให้แอดมินมานั่งไล่หาว่า
    // ห้องไหนพังเพราะอะไร
    const me = guild.members.me;
    const currentPerms = existing.permissionsFor(me);
    const hasRequiredAccess = currentPerms?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
    ]);

    if (!hasRequiredAccess) {
      // permissionOverwrites.edit() ตั้ง overwrite เฉพาะของบอทในห้องนี้ใหม่ ไม่กระทบ
      // สิทธิ์ของ role อื่นหรือ @everyone เลย (ต่างจาก sync ที่ล้างทั้งห้อง)
      await existing.permissionOverwrites.edit(me.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
      });
    }

    return existing;
  }

  // ยังไม่มีห้องนี้ในเซิร์ฟเวอร์ -> สร้างใหม่ พร้อมตั้งสิทธิ์ตั้งแต่ตอนสร้างเลย
  return guild.channels.create({
    name: ASSET_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic: t('upload_image.channel_topic'),
    permissionOverwrites: [
      {
        // ปิดไม่ให้สมาชิกทั่วไปมองเห็นห้องนี้เลย
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        // เปิดให้บอทมองเห็นและโพสต์ได้เสมอ (เผื่อ role เริ่มต้นของบอทไม่มีสิทธิ์นี้)
        id: guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ],
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upload-image')
    .setDescription('Upload an image to get a permanent link for bot commands')
    .setDescriptionLocalizations({ th: 'อัปโหลดรูปเพื่อเอาลิงก์ถาวรไปใช้กับคำสั่งบอทได้เลยครับ' })
    .addAttachmentOption((option) =>
      option
        .setName('image')
        .setDescription('Image file (.png .jpg .jpeg .webp .gif)')
        .setDescriptionLocalizations({ th: 'ไฟล์รูปภาพ (.png .jpg .jpeg .webp .gif)' })
        .setRequired(true)
    ),

  async execute(interaction) {
    const t = createTranslator(interaction.guildId ? getGuildLanguage(interaction.guildId) : 'en');

    const attachment = interaction.options.getAttachment('image');

    // เช็คทั้งนามสกุลไฟล์และ content-type ที่ Discord ส่งมาให้ (เผื่อกรณีใดกรณีหนึ่งขาดหายหรือไม่ตรง)
    const lowerName = attachment.name.toLowerCase();
    const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasImageContentType = Boolean(attachment.contentType) && attachment.contentType.startsWith('image/');

    if (!hasAllowedExtension || !hasImageContentType) {
      await interaction.reply({
        content: t('upload_image.error.invalid_file', { extensions: ALLOWED_EXTENSIONS.join(', ') }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!interaction.guild) {
      await interaction.reply({
        content: t('upload_image.error.guild_only'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ตอบกลับ Discord ก่อนเลย (defer) เพราะขั้นตอนสร้างห้อง/อัปโหลดไฟล์อาจใช้เวลาเกิน 3 วิ ซึ่งเป็น deadline ของการตอบ interaction ครั้งแรก
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let assetChannel;
    try {
      assetChannel = await getOrCreateAssetChannel(interaction.guild, t);
    } catch (error) {
      console.error(error);
      await interaction.editReply({
        content: t('upload_image.error.channel_create_failed'),
      });
      return;
    }

    let sentMessage;
    try {
      // ดึงไฟล์จาก URL ชั่วคราวของ attachment (ยังไม่หมดอายุแน่นอนเพราะเพิ่งได้มาหมาดๆ) แล้วอัปโหลดเข้าห้องเก็บไฟล์ใหม่
      sentMessage = await assetChannel.send({
        content: t('upload_image.message.uploaded_by', { tag: interaction.user.tag, id: interaction.user.id }),
        files: [{ attachment: attachment.url, name: attachment.name }],
      });
    } catch (error) {
      console.error(error);
      await interaction.editReply({
        content: t('upload_image.error.send_failed'),
      });
      return;
    }

    const permanentUrl = sentMessage.attachments.first().url;

    // แก้ข้อความในห้องให้มีลิงก์ถาวรติดไปด้วย (กันคนคลิกขวาคัดลอกลิงก์
    // ผิดประเภทจากตัวรูปทีหลัง เพราะ ephemeral reply ด้านล่างกู้คืนไม่ได้)
    try {
      await sentMessage.edit({
        content:
          `${t('upload_image.message.uploaded_by', { tag: interaction.user.tag, id: interaction.user.id })}\n\n`
          + `${t('upload_image.message.permanent_link')}\n${permanentUrl}`,
        flags: MessageFlags.SuppressEmbeds, // ← ปิด auto-embed ของลิงก์ในเนื้อหา (กันรูปซ้ำ)
      });
    } catch (editError) {
      // แก้ข้อความไม่สำเร็จก็ไม่ critical — ลิงก์ยังอยู่ใน ephemeral reply ด้านล่าง
      console.error('[upload-image] แก้ข้อความในห้อง asset-storage ไม่สำเร็จ:', editError.message);
    }

    await interaction.editReply({
      content: t('upload_image.reply.success', { url: permanentUrl }),
    });
  },
};