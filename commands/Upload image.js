const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const ASSET_CHANNEL_NAME = 'asset-storage';
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

/**
 * หาห้อง asset-storage ที่มีอยู่แล้ว หรือสร้างใหม่ถ้ายังไม่มี
 * ตั้งสิทธิ์ห้ามคนทั่วไป (@everyone) มองเห็นห้องนี้ ให้บอทเท่านั้นที่โพสต์ได้
 * @param {import('discord.js').Guild} guild
 */
async function getOrCreateAssetChannel(guild) {
  const existing = guild.channels.cache.find(
    (channel) => channel.name === ASSET_CHANNEL_NAME && channel.type === ChannelType.GuildText
  );
  if (existing) return existing;

  // ยังไม่มีห้องนี้ในเซิร์ฟเวอร์ -> สร้างใหม่ พร้อมตั้งสิทธิ์ตั้งแต่ตอนสร้างเลย
  return guild.channels.create({
    name: ASSET_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic:
      'ห้องเก็บไฟล์รูปภาพที่อัปโหลดผ่าน /upload-image สำหรับใช้กับ /builder — ห้ามลบข้อความในห้องนี้ ไม่งั้นลิงก์รูปที่เอาไปใช้ที่อื่นจะพังทันที',
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
    .setDescription('อัปโหลดรูปเพื่อเอาลิงก์ไปใช้ในปุ่ม "+ เพิ่มรูป" ของ /builder')
    .addAttachmentOption((option) =>
      option
        .setName('image')
        .setDescription('ไฟล์รูปภาพ (.png .jpg .jpeg .webp .gif)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment('image');

    // เช็คทั้งนามสกุลไฟล์และ content-type ที่ Discord ส่งมาให้ (เผื่อกรณีใดกรณีหนึ่งขาดหายหรือไม่ตรง)
    const lowerName = attachment.name.toLowerCase();
    const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasImageContentType = Boolean(attachment.contentType) && attachment.contentType.startsWith('image/');

    if (!hasAllowedExtension || !hasImageContentType) {
      await interaction.reply({
        content: `❌ ไฟล์นี้ไม่ใช่รูปภาพที่รองรับค่ะ ใช้ได้เฉพาะไฟล์นามสกุล ${ALLOWED_EXTENSIONS.join(', ')} เท่านั้น`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!interaction.guild) {
      await interaction.reply({
        content: '❌ คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้นค่ะ (ใช้ในข้อความส่วนตัวไม่ได้)',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ตอบกลับ Discord ก่อนเลย (defer) เพราะขั้นตอนสร้างห้อง/อัปโหลดไฟล์อาจใช้เวลาเกิน 3 วิ ซึ่งเป็น deadline ของการตอบ interaction ครั้งแรก
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let assetChannel;
    try {
      assetChannel = await getOrCreateAssetChannel(interaction.guild);
    } catch (error) {
      console.error(error);
      await interaction.editReply({
        content:
          '❌ สร้าง/หาห้องเก็บไฟล์ไม่สำเร็จค่ะ บอทอาจไม่มีสิทธิ์ "Manage Channels" ลองแจ้งแอดมินเซิร์ฟเวอร์ให้เพิ่มสิทธิ์นี้ให้บอทนะคะ',
      });
      return;
    }

    let sentMessage;
    try {
      // ดึงไฟล์จาก URL ชั่วคราวของ attachment (ยังไม่หมดอายุแน่นอนเพราะเพิ่งได้มาหมาดๆ) แล้วอัปโหลดเข้าห้องเก็บไฟล์ใหม่
      sentMessage = await assetChannel.send({
        content: `อัปโหลดโดย ${interaction.user.tag} (${interaction.user.id})`,
        files: [{ attachment: attachment.url, name: attachment.name }],
      });
    } catch (error) {
      console.error(error);
      await interaction.editReply({
        content: '❌ อัปโหลดไฟล์เข้าห้องเก็บไฟล์ไม่สำเร็จค่ะ ลองรันคำสั่งใหม่อีกครั้งนะคะ',
      });
      return;
    }

    const permanentUrl = sentMessage.attachments.first().url;

    await interaction.editReply({
      content: `✅ อัปโหลดสำเร็จค่ะ!\n${permanentUrl}\n\nคัดลอกลิงก์นี้ไปใช้ในปุ่ม "+ เพิ่มรูป" ของ /builder ได้เลยค่ะ`,
    });
  },
};