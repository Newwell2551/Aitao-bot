const {
  TextDisplayBuilder,
  MediaGalleryBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  ContainerBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

/**
 * เช็คว่า url ที่ใส่มาหน้าตาถูกต้องไหม (เช็คแค่รูปแบบ ไม่ได้ยิงไปโหลดจริง)
 * อนุญาตให้ขึ้นต้นด้วย http://, https://, หรือ attachment:// เท่านั้น
 * ตามที่ Discord กำหนดไว้สำหรับ unfurled media item
 *
 * @param {string} url
 * @param {string} context - ข้อความบอกตำแหน่งที่ error เพื่อ debug ง่ายขึ้น
 */
function validateUrl(url, context) {
  if (!url || typeof url !== 'string') {
    throw new Error(`buildMessageFromSchema: ${context} ต้องเป็น string ที่ไม่ว่าง (ได้รับ: ${JSON.stringify(url)})`);
  }
  const isValid =
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('attachment://');
  if (!isValid) {
    throw new Error(
      `buildMessageFromSchema: ${context} ต้องขึ้นต้นด้วย "http://", "https://" หรือ "attachment://" เท่านั้น (ได้รับ: "${url}")`
    );
  }
}

/**
 * เหมือน validateUrl แต่เข้มงวดกว่า: อนุญาตแค่ http:// หรือ https:// เท่านั้น
 * ใช้กับปุ่มลิงก์ (Link button) โดยเฉพาะ เพราะ Discord ไม่ยอมรับ attachment:// เป็น URL ของปุ่ม
 * (ต่างจากรูปภาพ/thumbnail ที่ยอมรับ attachment:// ได้)
 *
 * @param {string} url
 * @param {string} context
 */
function validateHttpUrl(url, context) {
  if (!url || typeof url !== 'string') {
    throw new Error(`buildMessageFromSchema: ${context} ต้องเป็น string ที่ไม่ว่าง (ได้รับ: ${JSON.stringify(url)})`);
  }
  const isValid = url.startsWith('http://') || url.startsWith('https://');
  if (!isValid) {
    throw new Error(
      `buildMessageFromSchema: ${context} ต้องขึ้นต้นด้วย "http://" หรือ "https://" เท่านั้น (ได้รับ: "${url}")`
    );
  }
}

/**
 * แปลง emoji string ที่ resolve แล้ว (unicode หรือ <:name:id> / <a:name:id>)
 * ให้กลายเป็น APIMessageComponentEmoji object ที่ ButtonBuilder.setEmoji() รับได้
 *
 * ใช้หลังจากที่ builder.js เรียก resolveCustomEmojis() ไปแล้ว
 * ดังนั้น input ที่เข้ามาจะเป็น:
 *   - "<:mail:1234567890>"   → custom emoji (static)
 *   - "<a:wave:1234567890>"  → custom emoji (animated)
 *   - "🎭"                   → unicode emoji
 *
 * @param {string} emojiStr
 * @returns {{ name?: string, id?: string, animated?: boolean } | null}
 */
function parseButtonEmoji(emojiStr) {
  if (!emojiStr || typeof emojiStr !== 'string') return null;
  const trimmed = emojiStr.trim();
  if (!trimmed) return null;

  // custom emoji: <a:name:id> (animated) หรือ <:name:id> (static)
  const match = trimmed.match(/^<(a?):([^:]+):(\d+)>$/);
  if (match) {
    return {
      animated: match[1] === 'a',
      name: match[2],
      id: match[3],
    };
  }

  // ถ้ายังอยู่ในรูป :ชื่อ: แสดงว่า resolveCustomEmojis() หาไม่เจอ custom emoji นั้นใน guild
  // (พิมพ์ชื่อผิด หรือ emoji ถูกลบออกจากเซิร์ฟเวอร์ไปแล้ว)
  // ห้ามส่งให้ Discord เพราะ Discord ไม่รู้จัก format นี้ → คืน null เพื่อ skip setEmoji แทนที่จะพัง
  if (/^:[^\s:]+:$/.test(trimmed)) return null;

  // unicode emoji (เช่น 🎭) — ส่ง name ตรงๆ Discord จะ render ให้เอง
  return { name: trimmed };
}

// map string → ButtonStyle enum ใช้ใน section_role_button
// เก็บเป็น object แทน switch เพราะอ่านง่ายกว่าและรองรับ default ได้ชัดเจน
const BUTTON_STYLE_MAP = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

/**
 * แปลง schema (object ธรรมดา) ให้กลายเป็น Discord Components V2 จริง
 *
 * รูปแบบ schema ที่รองรับ:
 * {
 *   accentColor: "#ffb7c5",        // string hex (มี # หรือไม่มีก็ได้) — optional
 *   blocks: [
 *     { type: "text", content: "# หัวข้อ" },
 *
 *     { type: "separator", spacing: "small" | "large", divider: true },
 *     // spacing/divider เป็น optional ทั้งคู่ ไม่ใส่ = ค่า default ("small", true)
 *
 *     {
 *       type: "gallery",
 *       items: [
 *         { url: "https://...", description: "...", spoiler: false }
 *       ]
 *     },
 *
 *     {
 *       type: "section",
 *       text: "ข้อความใน section",
 *       thumbnail: "https://...",   // url รูปเล็ก
 *       spoiler: false              // optional, ทำให้ thumbnail เบลอ
 *     },
 *
 *     {
 *       type: "section_button",
 *       text: "ข้อความใน section",
 *       buttonLabel: "เข้าร่วม Discord",  // ข้อความบนปุ่ม
 *       buttonUrl: "https://..."          // ลิงก์ที่ปุ่มจะเปิด (ต้องขึ้นต้น http/https)
 *     }
 *   ]
 * }
 *
 * @param {object} schema
 * @returns {{ components: ContainerBuilder[], flags: number }}
 *   เอาไปใช้ตรงๆ ได้เลยแบบ: interaction.reply({ ...buildMessageFromSchema(schema) })
 */
function buildMessageFromSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    throw new Error('buildMessageFromSchema: schema ต้องเป็น object');
  }
  if (!Array.isArray(schema.blocks)) {
    throw new Error('buildMessageFromSchema: schema.blocks ต้องเป็น array');
  }

  const container = new ContainerBuilder();

  // ใส่สีแถบด้านซ้ายของ container ถ้ามีระบุมา
  if (schema.accentColor) {
    const hex = schema.accentColor.toString().replace('#', '');
    const colorNumber = parseInt(hex, 16);
    if (!Number.isNaN(colorNumber)) {
      container.setAccentColor(colorNumber);
    }
  }

  for (const [index, block] of schema.blocks.entries()) {
    if (!block || typeof block !== 'object' || !block.type) {
      throw new Error(`buildMessageFromSchema: blocks[${index}] ไม่มี field "type"`);
    }

    switch (block.type) {
      case 'text': {
        if (!block.content) {
          throw new Error(`buildMessageFromSchema: blocks[${index}] (text) ต้องมี "content"`);
        }
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(block.content)
        );
        break;
      }

      case 'separator': {
        const separator = new SeparatorBuilder()
          .setDivider(block.divider ?? true)
          .setSpacing(
            block.spacing === 'large'
              ? SeparatorSpacingSize.Large
              : SeparatorSpacingSize.Small
          );
        container.addSeparatorComponents(separator);
        break;
      }

      case 'gallery': {
        if (!Array.isArray(block.items) || block.items.length === 0) {
          throw new Error(`buildMessageFromSchema: blocks[${index}] (gallery) ต้องมี "items" อย่างน้อย 1 รายการ`);
        }
        block.items.forEach((item, itemIndex) => {
          validateUrl(item.url, `blocks[${index}].items[${itemIndex}].url`);
        });
        const gallery = new MediaGalleryBuilder().addItems(
          ...block.items.map((item) => ({
            media: { url: item.url },
            description: item.description ?? undefined,
            spoiler: item.spoiler ?? false,
          }))
        );
        container.addMediaGalleryComponents(gallery);
        break;
      }

      case 'section': {
        if (!block.text || !block.thumbnail) {
          throw new Error(`buildMessageFromSchema: blocks[${index}] (section) ต้องมีทั้ง "text" และ "thumbnail"`);
        }
        validateUrl(block.thumbnail, `blocks[${index}].thumbnail`);
        const section = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(block.text)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(block.thumbnail)
              .setSpoiler(block.spoiler ?? false)
          );
        container.addSectionComponents(section);
        break;
      }

      case 'section_button': {
        if (!block.text || !block.buttonLabel || !block.buttonUrl) {
          throw new Error(
            `buildMessageFromSchema: blocks[${index}] (section_button) ต้องมีทั้ง "text", "buttonLabel" และ "buttonUrl"`
          );
        }
        validateHttpUrl(block.buttonUrl, `blocks[${index}].buttonUrl`);
        const sectionWithButton = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(block.text)
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel(block.buttonLabel)
              .setURL(block.buttonUrl)
              .setStyle(ButtonStyle.Link) // ปุ่มลิงก์ตรงๆ ไม่มี interaction ใดๆ กดแล้วเปิด URL เลย
          );
        container.addSectionComponents(sectionWithButton);
        break;
      }

      case 'section_role_button': {
        if (!block.text || !block.buttonLabel || !block.roleId) {
          throw new Error(
            `buildMessageFromSchema: blocks[${index}] (section_role_button) ต้องมีทั้ง "text", "buttonLabel" และ "roleId"`
          );
        }

        // แปลง buttonStyle string → ButtonStyle enum ถ้าไม่มีหรือไม่รู้จัก ใช้ Primary เป็น default
        const resolvedStyle = BUTTON_STYLE_MAP[block.buttonStyle] ?? ButtonStyle.Primary;

        const roleButton = new ButtonBuilder()
          .setLabel(block.buttonLabel)
          .setCustomId(`rolebtn:${block.roleId}`) // รูปแบบที่ handleRoleButton.js ใช้ดึง roleId
          .setStyle(resolvedStyle);

        // ถ้ามี buttonEmoji ให้แปลงเป็น emoji object ก่อนส่งเข้า .setEmoji()
        // (builder.js เรียก resolveCustomEmojis() ไปแล้ว ดังนั้น buttonEmoji จะเป็น
        //  "<:name:id>" หรือ "🎭" หรือ null ไม่มีทาง เป็น ":ชื่อ:" raw ค้างไว้)
        if (block.buttonEmoji) {
          const emoji = parseButtonEmoji(block.buttonEmoji);
          if (emoji) roleButton.setEmoji(emoji);
        }

        const sectionWithRoleBtn = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(block.text)
          )
          .setButtonAccessory(roleButton);
        container.addSectionComponents(sectionWithRoleBtn);
        break;
      }

      case 'section_channel_button': {
        // field เหมือน section_button ทุกอย่าง ต่างแค่ buttonUrl ที่ generate จาก guildId+channelId
        // แทนที่ผู้ใช้จะพิมพ์ URL เอง บอทสร้างให้อัตโนมัติตอนผู้ใช้เลือกช่องจาก ChannelSelectMenu
        if (!block.text || !block.buttonLabel || !block.buttonUrl) {
          throw new Error(
            `buildMessageFromSchema: blocks[${index}] (section_channel_button) ต้องมีทั้ง "text", "buttonLabel" และ "buttonUrl"`
          );
        }
        const sectionWithChanBtn = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(block.text)
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setLabel(block.buttonLabel)
              .setURL(block.buttonUrl) // URL รูปแบบ https://discord.com/channels/{guildId}/{channelId}
              .setStyle(ButtonStyle.Link) // Link = กดแล้วเปิด URL ตรงๆ ไม่มี interaction ใดๆ
          );
        container.addSectionComponents(sectionWithChanBtn);
        break;
      }

      default:
        throw new Error(`buildMessageFromSchema: ไม่รู้จัก block type "${block.type}" (blocks[${index}])`);
    }
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

module.exports = { buildMessageFromSchema, validateUrl, validateHttpUrl };