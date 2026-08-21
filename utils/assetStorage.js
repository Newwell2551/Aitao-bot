/**
 * assetStorage.js
 * ─────────────────────────────────────────────────────────────────────────
 * เก็บรูปภาพที่แอดมินอัปโหลดแบบ "ถาวรจริงๆ" โดยโพสต์เข้าห้องลับ (asset-storage)
 * แล้วเก็บแค่ "ตำแหน่งของข้อความ" (channelId + messageId) ไว้ ไม่เก็บ URL ตรงๆ
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ทำไมต้องทำแบบนี้ (สำคัญมาก อ่านก่อนใช้งาน)
 * ═══════════════════════════════════════════════════════════════════════════
 * URL ของไฟล์แนบใน Discord (attachment.url) มีวันหมดอายุครับ! Discord เซ็นชื่อ
 * URL พวกนี้ไว้ (สังเกตจะมี query string ?ex=...&is=...&hm=... ต่อท้าย) แล้วจะใช้
 * ไม่ได้อีกหลังผ่านไประยะเวลานึง (ปกติประมาณ 24 ชม.)
 *
 * ปัญหาคือ: ถ้าแอดมินตั้งค่า welcome image วันนี้ แล้วมีสมาชิกใหม่เข้าเซิร์ฟเวอร์
 * อีก 2 อาทิตย์ต่อมา ถ้าเราเก็บ URL ตรงๆ ไว้ใน config ตอนนั้นลิงก์จะหมดอายุไปแล้ว
 * บอทจะพยายามโหลดรูป background แต่โหลดไม่ขึ้น (fetch คืน error 403) วาดรูป
 * ต้อนรับไม่ได้เลย!
 *
 * ทางแก้: แทนที่จะเก็บ URL เก็บแค่ "พิกัดของข้อความ" (อยู่ห้องไหน message ID
 * อะไร) แล้วทุกครั้งที่ต้องใช้รูปจริงๆ ให้ "fetch ข้อความนั้นใหม่จาก Discord API"
 * — Discord จะออก URL เซ็นชื่อใหม่ที่ยังไม่หมดอายุให้ทุกครั้งที่ fetch แบบนี้
 * ไม่ว่าข้อความจะถูกโพสต์ไว้นานแค่ไหนแล้วก็ตาม (ตราบใดที่ข้อความยังไม่ถูกลบ)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');

const ASSET_CHANNEL_NAME = 'asset-storage';

/**
 * หาห้อง asset-storage ที่มีอยู่แล้ว หรือสร้างใหม่ถ้ายังไม่มี
 * (pattern เดียวกับที่ /upload-image ใช้อยู่แล้ว ใช้ห้องเดียวกันได้เลย ไม่ต้องสร้างซ้ำ)
 * @param {import('discord.js').Guild} guild
 */
async function getOrCreateAssetChannel(guild) {
  const existing = guild.channels.cache.find(
    (channel) => channel.name === ASSET_CHANNEL_NAME && channel.type === ChannelType.GuildText
  );
  if (existing) return existing;

  return guild.channels.create({
    name: ASSET_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic:
      'ห้องเก็บไฟล์รูปภาพถาวรของบอท (ใช้ร่วมกันหลายฟีเจอร์) ห้ามลบข้อความในห้องนี้ ไม่งั้นรูปที่เอาไปใช้ที่อื่นจะพังทันที',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
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

/**
 * อัปโหลด attachment เข้าห้องเก็บไฟล์ถาวร แล้วคืนค่า "ตำแหน่งอ้างอิง" กลับไป
 * (ไม่คืน URL ตรงๆ เพราะ URL จะหมดอายุ — เก็บพิกัดไว้แทน แล้วค่อย resolve เป็น URL
 * สดใหม่ตอนจะใช้จริงด้วย resolveStoredImageUrl() ด้านล่าง)
 *
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Attachment} attachment
 * @returns {Promise<{ channelId: string, messageId: string }>}
 */
async function storeImagePermanently(guild, attachment) {
  const assetChannel = await getOrCreateAssetChannel(guild);
  const sentMessage = await assetChannel.send({
    content: `เก็บถาวรโดยระบบอัตโนมัติ (${new Date().toISOString()})`,
    files: [{ attachment: attachment.url, name: attachment.name }],
  });
  return { channelId: assetChannel.id, messageId: sentMessage.id };
}

/**
 * ดึง URL ของรูปที่เก็บไว้ "แบบสดใหม่" (ยังไม่หมดอายุ) จากตำแหน่งอ้างอิงที่เก็บไว้
 *
 * ⚠️ สำคัญ: เรียกฟังก์ชันนี้ทุกครั้งที่ต้องใช้รูปจริงๆ (ตอนวาดรูปต้อนรับจริง หรือตอน
 * preview) ห้ามเก็บผลลัพธ์ที่ได้จากฟังก์ชันนี้ไว้ใช้ซ้ำนานๆ เพราะ URL ที่ได้ก็มีวันหมด
 * อายุเหมือนกัน แค่มันสดใหม่ ณ ตอนที่เรียกเท่านั้น
 *
 * @param {import('discord.js').Client} client
 * @param {{ channelId: string, messageId: string }} ref
 * @returns {Promise<string>} URL ที่ใช้ได้จริงตอนนี้
 */
async function resolveStoredImageUrl(client, ref) {
  const channel = await client.channels.fetch(ref.channelId);
  if (!channel) {
    throw new Error(`assetStorage: ไม่พบห้อง ${ref.channelId} (อาจถูกลบไปแล้ว)`);
  }
  const message = await channel.messages.fetch(ref.messageId);
  const attachment = message.attachments.first();
  if (!attachment) {
    throw new Error(`assetStorage: ไม่พบไฟล์แนบในข้อความ ${ref.messageId} (อาจถูกลบไปแล้ว)`);
  }
  return attachment.url;
}

module.exports = {
  getOrCreateAssetChannel,
  storeImagePermanently,
  resolveStoredImageUrl,
};