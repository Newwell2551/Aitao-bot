// utils/referralReportChannel.js
// ─────────────────────────────────────────────────────────────────────────
// ห้องรายงานยอดค่าคอมของผู้ขายแต่ละคนแบบ "เรียลไทม์" — ทุกครั้งที่มีการเปลี่ยนแปลง
// (มีคนใช้โค้ดสำเร็จจริงผ่าน webhook, สร้างโค้ดใหม่, หรือปิดใช้งานโค้ด) บอทจะไปแก้ไข
// ข้อความสรุปยอดของโค้ดนั้นในห้องนี้ให้เป็นตัวเลขล่าสุดทันที ไม่ต้องรอใครมากด
// /referral summary เอง
//
// ใช้ pattern เดียวกับ utils/assetStorage.js เป๊ะๆ: เก็บแค่ "พิกัดข้อความ" (ในที่นี้คือ
// messageId — channel คงที่เสมอเลยไม่ต้องเก็บ channelId ซ้ำ) แล้ว fetch ข้อความเดิมมา
// แก้ไข (edit) แทนที่จะส่งข้อความใหม่ทุกครั้ง กันไม่ให้ห้องรกด้วยข้อความซ้ำๆ เป็นร้อยเป็น
// พันข้อความ
//
// ⚠️ ห้องนี้สร้างขึ้นใน "เซิร์ฟควบคุม" เดียวกับที่ /dev กับ /referral ใช้อยู่แล้ว (ตาม
// GUILD_ID ใน .env) เพราะระบบ referral เป็นของกลางของบอท ไม่ได้ผูกกับเซิร์ฟลูกค้าเซิร์ฟ
// ใดเซิร์ฟหนึ่งโดยเฉพาะ (โค้ดเดียวใช้ได้หลายเซิร์ฟ) — ห้องนี้ตั้งสิทธิ์ให้เห็นได้แค่บอท
// เท่านั้น (ซ่อนจากสมาชิกทุกคนรวมถึงแอดมิน เหมือน asset-storage) เพราะเป็นข้อมูลรายได้ที่
// ไม่ควรเปิดเผยสาธารณะ — น้องหนาว (เจ้าของบอท) เข้าไปดูเองในเซิร์ฟควบคุมได้ตลอด แต่ผู้ขาย
// จะยังไม่เห็นยอดตัวเองในห้องนี้นะครับ
//
// 🆕 อัปเดต 19 ก.ย. 2569 — ทำให้เป็น "ระบบ" ที่โต้ตอบได้จริง ตามภาพเรฟที่น้องหนาวส่งมา
// (สไตล์การ์ดร้านขายบูสต์เซิร์ฟที่มี dropdown + ปุ่มด้านล่าง) ไม่ใช่แค่ข้อความ/embed
// นิ่งๆ อีกต่อไป — เพิ่ม 2 อย่าง:
//   1) Select menu เลือกช่วงเวลา "วันนี้ / เดือนนี้ / ทั้งหมด" — เลือกแล้วการ์ดอัปเดต
//      ตัวเลขให้ตรงช่วงที่เลือกทันที (ไม่ต้องรอ event ใหม่)
//   2) ปุ่ม "ข้อกำหนด" — กดแล้วเปิด modal (แบบฟอร์ม) ที่ล็อกไว้อ่านอย่างเดียว อธิบาย
//      เงื่อนไขการจ่ายค่าคอมให้ผู้ขาย (ใช้ TextDisplay ใน Modal — ฟีเจอร์ใหม่ของ Discord
//      ที่ให้ใส่ข้อความอ่านอย่างเดียวใน modal ได้โดยไม่ต้องมีช่องกรอกเลย)
// ─────────────────────────────────────────────────────────────────────────

const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const {
  listAllCodes,
  getCodeCommissionStats,
  saveReportMessageId,
  COMMISSION_PER_REDEMPTION_THB,
} = require('./referralStorage');

const REPORT_CHANNEL_NAME = 'referral-earnings';

// 🆕 [emoji เซิร์ฟ Milo Support] — ชื่อที่ใส่ไว้ตอนนี้เป็นแค่ "ชื่อจำลอง" (placeholder)
// น้องหนาวต้องส่งชื่ออิโมจิจริงจากเซิร์ฟ Milo Support มาแทนที่ทีหลัง (ดูคำอธิบายเต็มๆ
// ในแชท) — ระหว่างนี้ระบบยังทำงานได้ปกติ เพราะ resolveEmojiByName() ด้านล่าง หาไม่เจอ
// ก็จะ fallback ไปใช้อิโมจิ Unicode ธรรมดาแทนเงียบๆ ไม่ error
const EMOJI_SLOTS = {
  title: { name: 'milo_chart', fallback: '📊' },
  statusActive: { name: 'milo_online', fallback: '🟢' },
  statusInactive: { name: 'milo_offline', fallback: '🔴' },
  uses: { name: 'milo_repeat', fallback: '🔁' },
  perUse: { name: 'milo_coin', fallback: '💸' },
  total: { name: 'milo_moneybag', fallback: '💰' },
  terms: { name: 'milo_scroll', fallback: '📜' },
};

// ป้ายกำกับ + ตัวเลือกของ dropdown เลือกช่วงเวลา — เรียงตามลำดับที่จะโชว์ในเมนู
const RANGE_OPTIONS = [
  { value: 'today', label: 'วันนี้' },
  { value: 'month', label: 'เดือนนี้' },
  { value: 'all', label: 'ทั้งหมด' },
];
const RANGE_LABELS = Object.fromEntries(RANGE_OPTIONS.map((o) => [o.value, o.label]));

const RANGE_SELECT_PREFIX = 'referral_range_select_';
const TERMS_BUTTON_ID = 'referral_terms_button';
const TERMS_MODAL_ID = 'referral_terms_modal';

/**
 * หา custom emoji ตามชื่อจาก "ทุกเซิร์ฟที่บอทอยู่" (ไม่ใช่แค่เซิร์ฟควบคุมเซิร์ฟเดียว) —
 * client.emojis.cache รวมอิโมจิจากทุกเซิร์ฟที่บอทเป็นสมาชิกอยู่แล้วในก้อนเดียว บอทใช้
 * อิโมจิของเซิร์ฟไหนก็ได้ตราบใดที่ตัวเองอยู่ในเซิร์ฟนั้น ไม่จำเป็นต้องเป็นเซิร์ฟเดียวกับ
 * ที่ส่งข้อความ (คนละเรื่องกับที่ "คน" พิมพ์อิโมจิเซิร์ฟอื่นไม่ได้ถ้าไม่ได้ Nitro — แต่
 * "บอท" ใช้ได้ปกติ เพราะบอทส่งผ่าน API ตรงๆ ไม่ผ่านข้อจำกัดของไคลเอนต์)
 * หาไม่เจอ (เช่นชื่อ placeholder ที่ยังไม่ได้แก้ หรือพิมพ์ผิด) → คืนค่า fallback แทนเงียบๆ
 * @param {import('discord.js').Client} client
 * @param {{name: string, fallback: string}} slot
 * @returns {string}
 */
function resolveEmoji(client, slot) {
  const emoji = client.emojis.cache.find((e) => e.name === slot.name);
  if (!emoji) return slot.fallback;
  return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
}

/**
 * หาห้องรายงานยอดที่มีอยู่แล้ว หรือสร้างใหม่ถ้ายังไม่มี (pattern เดียวกับ
 * assetStorage.js → getOrCreateAssetChannel())
 * @param {import('discord.js').Guild} guild เซิร์ฟควบคุม (ตาม GUILD_ID ใน .env)
 */
async function getOrCreateReportChannel(guild) {
  const existing = guild.channels.cache.find(
    (channel) => channel.name === REPORT_CHANNEL_NAME && channel.type === ChannelType.GuildText
  );

  if (existing) {
    // เช็คสิทธิ์บอทในห้องเดิมก่อนเสมอ เผื่อมีใครไปแก้ permission ห้องทีหลัง (เหตุผล
    // เดียวกับ asset-storage — กัน error 50001 Missing Access ตอนบอทพยายามโพสต์)
    const me = guild.members.me;
    const currentPerms = existing.permissionsFor(me);
    const hasRequiredAccess = currentPerms?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ]);
    if (!hasRequiredAccess) {
      await existing.permissionOverwrites.edit(me.id, {
        ViewChannel: true,
        SendMessages: true,
      });
    }
    return existing;
  }

  return guild.channels.create({
    name: REPORT_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic:
      'รายงานยอดค่าคอมของผู้ขายแต่ละคนแบบเรียลไทม์ (บอทอัปเดตอัตโนมัติ — ห้ามลบ/แก้ข้อความเอง ไม่งั้นบอทจะส่งข้อความใหม่แทนอันเดิม)',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: guild.members.me.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ],
  });
}

/**
 * แปลงตัวเลขสถิติของโค้ด 1 อัน (ที่กรองตามช่วงเวลาที่เลือกมาแล้ว) เป็น "การ์ด" (Embed)
 * โครงสร้าง: แถวบน 3 ช่องเล็ก (สถานะ / จำนวนครั้งที่ใช้ / ค่าคอมต่อครั้ง) แถวล่างช่องใหญ่
 * เต็มความกว้าง 1 ช่อง (รวมรายได้ของช่วงเวลาที่เลือก) — ชื่อ field ของ "ใช้ไปแล้ว" กับ
 * "รวมรายได้" จะเปลี่ยนคำต่อท้ายตามช่วงเวลาที่เลือกด้วย (วันนี้/เดือนนี้/ตลอดกาล) กันสับสน
 * ว่ากำลังดูยอดของช่วงไหนอยู่
 * @param {{ code: string, sellerLabel: string, active: boolean, totalUses: number, totalCommissionThb: number }} stats
 * @param {'today'|'month'|'all'} range
 * @param {import('discord.js').Client} client ใช้หา custom emoji ของเซิร์ฟ Milo Support
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildReportEmbed(stats, range, client) {
  const statusValue = stats.active ? 'เปิดใช้งานอยู่' : 'ปิดใช้งานแล้ว';
  const statusEmoji = resolveEmoji(client, stats.active ? EMOJI_SLOTS.statusActive : EMOJI_SLOTS.statusInactive);
  const rangeLabel = RANGE_LABELS[range] ?? RANGE_LABELS.all;

  return new EmbedBuilder()
    .setColor(stats.active ? 0x57f287 : 0x99aab5) // เขียว/เทา — ชุดสีเดียวกับการ์ดพรีเมียม
    .setTitle(`${resolveEmoji(client, EMOJI_SLOTS.title)} ${stats.code}`)
    .setDescription(`ผู้ขาย: **${stats.sellerLabel}**`)
    .addFields(
      { name: `${statusEmoji} สถานะ`, value: `\`${statusValue}\``, inline: true },
      { name: `${resolveEmoji(client, EMOJI_SLOTS.uses)} ใช้ไปแล้ว (${rangeLabel})`, value: `\`${stats.totalUses} ครั้ง\``, inline: true },
      { name: `${resolveEmoji(client, EMOJI_SLOTS.perUse)} ค่าคอมต่อครั้ง`, value: `\`${COMMISSION_PER_REDEMPTION_THB} บาท\``, inline: true },
      { name: `${resolveEmoji(client, EMOJI_SLOTS.total)} รวมรายได้ (${rangeLabel})`, value: `\`${stats.totalCommissionThb} บาท\``, inline: false },
    )
    .setFooter({ text: 'อัปเดตล่าสุด' })
    .setTimestamp(); // Discord โชว์เป็นเวลาสัมพัทธ์ให้เอง (เช่น "2 นาทีที่แล้ว") ในเขตเวลาของแต่ละคนเอง
}

/**
 * สร้างแถวปุ่ม/dropdown ที่ต่อท้ายการ์ด — 2 แถว: (1) dropdown เลือกช่วงเวลา ผูก code
 * ไว้ใน customId เอง เพราะแต่ละการ์ดเป็นคนละโค้ดกัน ต้องรู้ว่ากำลังกดของการ์ดไหนอยู่
 * (2) ปุ่ม "ข้อกำหนด" — customId เดียวกันทุกการ์ด เพราะเนื้อหาข้อกำหนดเหมือนกันหมด
 * ไม่ต้องผูกกับโค้ดใดโค้ดหนึ่งเป็นพิเศษ
 * @param {string} code
 * @param {'today'|'month'|'all'} range ช่วงเวลาที่กำลังโชว์อยู่ตอนนี้ (ใช้ติ๊ก default ใน dropdown)
 * @returns {import('discord.js').ActionRowBuilder[]}
 */
function buildReportComponents(code, range) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${RANGE_SELECT_PREFIX}${code}`)
    .setPlaceholder('เลือกช่วงเวลาที่จะแสดง')
    .addOptions(
      RANGE_OPTIONS.map((opt) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(opt.label)
          .setValue(opt.value)
          .setDefault(opt.value === range)
      )
    );

  const termsButton = new ButtonBuilder()
    .setCustomId(TERMS_BUTTON_ID)
    .setLabel('ข้อกำหนด')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(termsButton),
  ];
}

/**
 * รวมขั้นตอน "หาโค้ด → คำนวณสถิติตามช่วงเวลา → สร้าง embed+components" ไว้จุดเดียว
 * ใช้ร่วมกันทั้ง syncCodeReportMessage() (เรียกตอนมีเหตุการณ์ใหม่ๆ) และ
 * handleReportRangeSelect() (เรียกตอนมีคนกด dropdown เปลี่ยนช่วงเวลา) กันเขียนซ้ำ
 * @param {import('discord.js').Client} client
 * @param {string} code
 * @param {'today'|'month'|'all'} range
 * @returns {{ embeds: import('discord.js').EmbedBuilder[], components: import('discord.js').ActionRowBuilder[] } | null}
 *   null ถ้าไม่เจอโค้ดนี้เลย (เช่นถูกลบไปแล้ว)
 */
function buildReportPayload(client, code, range) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const codeEntry = listAllCodes().find((c) => c.code === normalizedCode);
  if (!codeEntry) return null;

  const { totalUses, totalCommissionThb } = getCodeCommissionStats(normalizedCode, range);
  const stats = {
    code: normalizedCode,
    sellerLabel: codeEntry.sellerLabel,
    active: codeEntry.active,
    totalUses,
    totalCommissionThb,
  };

  return {
    embeds: [buildReportEmbed(stats, range, client)],
    components: buildReportComponents(normalizedCode, range),
  };
}

/**
 * อัปเดต (หรือสร้างใหม่ถ้ายังไม่เคยมี) ข้อความรายงานยอดของโค้ด 1 อัน ให้ตรงกับตัวเลข
 * ล่าสุดในไฟล์ referral-codes.json เสมอ — นี่คือฟังก์ชันหลักที่ทำให้ห้อง "เรียลไทม์"
 *
 * เรียกจาก 3 จุด (ทุกจุดใช้ range='all' ค่าเริ่มต้น — โชว์ยอดตลอดกาลเป็นค่าเริ่มต้นเสมอ
 * ตอนมีเหตุการณ์ใหม่ ถ้าใครเคยเลือกดู "วันนี้/เดือนนี้" ค้างไว้ก่อนหน้านี้ พอมีเหตุการณ์ใหม่
 * เข้ามาการ์ดจะรีเซ็ตกลับไปโชว์ "ทั้งหมด" ก่อนเสมอ ถือว่าเป็นพฤติกรรมที่ยอมรับได้ ไม่ได้
 * เก็บ state ว่าใครเลือกช่วงไหนค้างไว้ถาวร):
 *   1. server.js — หลัง completeRedemption() สำเร็จ (มีคนใช้โค้ดจ่ายเงินจริง)
 *   2. commands/referral.js — handleAdd() หลังสร้างโค้ดใหม่สำเร็จ (โชว์การ์ด 0 ครั้ง/0 บาท ทันที)
 *   3. commands/referral.js — handleDeactivate() หลังปิดใช้งานโค้ด (อัปเดตสถานะในการ์ด)
 *
 * ⚠️ ฟังก์ชันนี้ต้อง "ไม่มีทาง throw error ออกไปนอกฟังก์ชัน" เด็ดขาด (เหมือน
 * syncDiscordBotList.js) เพราะห้องรายงานเป็นแค่ "ของเสริม" ไม่ใช่ core flow การจ่ายเงิน/
 * ปลดล็อกพรีเมียม — ถ้าอัปเดตห้องนี้พลาด ต้องไม่ทำให้ webhook หลักหรือคำสั่ง /referral พังตาม
 *
 * @param {import('discord.js').Client} client
 * @param {string} code
 * @param {'today'|'month'|'all'} [range='all']
 */
async function syncCodeReportMessage(client, code, range = 'all') {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.warn('[referralReportChannel] ไม่พบ GUILD_ID ใน .env — ข้ามการอัปเดตห้องรายงานยอด');
    return;
  }

  const normalizedCode = String(code || '').trim().toUpperCase();

  try {
    const payload = buildReportPayload(client, normalizedCode, range);
    if (!payload) return; // โค้ดนี้ไม่มีอยู่จริง (ไม่ควรเกิด แต่กันไว้)

    const codeEntry = listAllCodes().find((c) => c.code === normalizedCode);
    const guild = await client.guilds.fetch(guildId);
    const channel = await getOrCreateReportChannel(guild);

    if (codeEntry.reportMessageId) {
      try {
        const existingMessage = await channel.messages.fetch(codeEntry.reportMessageId);
        // ต้องเคลียร์ content: '' ด้วยเสมอตอนแก้ไขข้อความเก่า — เพราะข้อความรุ่นแรกสุด
        // (ก่อนเปลี่ยนมาใช้ embed) เป็น plain text ล้วนๆ ถ้าส่งแค่ embeds/components ไป
        // เฉยๆ โดยไม่แตะ content เลย ตัว content เก่าจะค้างอยู่ข้างบน embed ใหม่ (Discord
        // แก้เฉพาะ field ที่ส่งมาเท่านั้น ไม่ได้ล้างของเดิมให้อัตโนมัติ)
        await existingMessage.edit({ content: '', embeds: payload.embeds, components: payload.components });
        return;
      } catch (fetchError) {
        // ข้อความเดิมหาไม่เจอ (เช่นมีคนลบข้อความ/ห้องไปเอง) — ส่งใหม่แทนด้านล่าง
        console.warn(
          `[referralReportChannel] หาข้อความรายงานเดิมของโค้ด ${normalizedCode} ไม่เจอ จะส่งข้อความใหม่แทนครับ`
        );
      }
    }

    const sentMessage = await channel.send({ embeds: payload.embeds, components: payload.components });
    saveReportMessageId(normalizedCode, sentMessage.id);
  } catch (error) {
    console.warn(`[referralReportChannel] อัปเดตห้องรายงานยอดของโค้ด ${normalizedCode} ไม่สำเร็จ:`, error);
  }
}

/** เช็คว่า customId นี้เป็น dropdown เลือกช่วงเวลาของห้องรายงานยอดหรือไม่ (เรียกจาก index.js) */
function isReportRangeSelect(customId) {
  return typeof customId === 'string' && customId.startsWith(RANGE_SELECT_PREFIX);
}

/**
 * รันตอนมีคนเลือกช่วงเวลาใหม่จาก dropdown — อ่านโค้ดจาก customId + ช่วงเวลาที่เลือกจาก
 * interaction.values แล้วสร้างการ์ดใหม่ "แก้ทับข้อความเดิมทันที" ผ่าน interaction.update()
 * (เร็วกว่าไป fetch ข้อความมาแก้ใหม่แบบ syncCodeReportMessage — ในนี้มี interaction.message
 * อยู่แล้วในตัว ไม่ต้องยิง API เพิ่ม)
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
async function handleReportRangeSelect(interaction) {
  const code = interaction.customId.slice(RANGE_SELECT_PREFIX.length);
  const range = interaction.values[0];

  const payload = buildReportPayload(interaction.client, code, range);
  if (!payload) {
    await interaction.reply({ content: 'ไม่พบโค้ดนี้แล้วครับ (อาจถูกลบไปแล้ว)', ephemeral: true });
    return;
  }

  await interaction.update({ embeds: payload.embeds, components: payload.components });
}

/** เช็คว่า customId นี้เป็นปุ่ม "ข้อกำหนด" ของห้องรายงานยอดหรือไม่ (เรียกจาก index.js) */
function isReportTermsButton(customId) {
  return customId === TERMS_BUTTON_ID;
}

/**
 * สร้าง Modal "ข้อกำหนดการจ่ายค่าคอม" — ใช้ TextDisplay (ฟีเจอร์ใหม่ของ Discord ที่ให้ใส่
 * ข้อความอ่านอย่างเดียวในหน้าต่าง modal ได้ ไม่ต้องมีช่องกรอกเลยสักช่อง) ต่างจาก modal
 * ทั่วไปในโปรเจกต์นี้ (เช่น modal กรอกโค้ดส่วนลดใน commands/premium.js) ที่ต้องมี
 * TextInput ให้กรอกเสมอ — อันนี้ตั้งใจให้ "อ่านอย่างเดียว ปิดได้เลย ไม่ต้องกรอกอะไร"
 * @returns {import('discord.js').ModalBuilder}
 */
function buildTermsModal() {
  return new ModalBuilder()
    .setCustomId(TERMS_MODAL_ID)
    .setTitle('ข้อกำหนดการจ่ายค่าคอม')
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `ผู้ขายได้ค่าคอม **${COMMISSION_PER_REDEMPTION_THB} บาท** ต่อการใช้โค้ดสำเร็จ 1 ครั้ง ` +
        '(นับจาก Stripe ยืนยันว่าลูกค้าจ่ายเงินจริงแล้วเท่านั้น — แค่กรอกโค้ดเฉยๆ ไม่นับ)'
      ),
      new TextDisplayBuilder().setContent(
        '**วิธีจ่ายเงินให้ผู้ขาย**: ระบบไม่ได้โอนให้อัตโนมัติ ต้องโอนเองเป็นระยะ (เช่นทุกสัปดาห์/เดือน) — ' +
        'เช็คยอดค้างจ่ายได้จาก `/referral summary` แล้วโอนจริงผ่าน PromptPay/ธนาคาร ' +
        '(ใช้ `/referral payout` ช่วยสร้าง QR โอนเงินให้ก็ได้) เสร็จแล้วกด `/referral markpaid` ' +
        'เพื่อเคลียร์ยอดค้างจ่ายของโค้ดนั้น'
      ),
    );
}

/**
 * รันตอนกดปุ่ม "ข้อกำหนด" — เปิด modal อ่านอย่างเดียวขึ้นมาให้
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleReportTermsButton(interaction) {
  await interaction.showModal(buildTermsModal());
}

/** เช็คว่า customId นี้เป็น modal ข้อกำหนดหรือไม่ (เรียกจาก index.js ตอน submit) */
function isTermsModalSubmit(customId) {
  return customId === TERMS_MODAL_ID;
}

/**
 * รันตอนกด Submit บน modal ข้อกำหนด (ไม่มีข้อมูลอะไรให้บันทึกเลย เพราะเป็น modal
 * อ่านอย่างเดียว) — แค่ตอบรับสั้นๆ กันเจอ error "This interaction failed"
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleTermsModalSubmit(interaction) {
  await interaction.reply({ content: 'รับทราบครับ', ephemeral: true });
}

module.exports = {
  getOrCreateReportChannel,
  syncCodeReportMessage,
  isReportRangeSelect,
  handleReportRangeSelect,
  isReportTermsButton,
  handleReportTermsButton,
  isTermsModalSubmit,
  handleTermsModalSubmit,
};
