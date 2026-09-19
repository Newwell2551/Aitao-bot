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
// 🆕 อัปเดต 19 ก.ย. 2569 (ดึกมาก) — ทำให้เป็น "ระบบ" ที่โต้ตอบได้จริง ตามภาพเรฟที่
// น้องหนาวส่งมา (สไตล์การ์ดร้านขายบูสต์เซิร์ฟที่มี dropdown + ปุ่มด้านล่าง) ไม่ใช่แค่
// ข้อความ/embed นิ่งๆ อีกต่อไป — เพิ่ม 2 อย่าง:
//   1) Select menu เลือกช่วงเวลา "วันนี้ / เดือนนี้ / ทั้งหมด" — เลือกแล้วการ์ดอัปเดต
//      ตัวเลขให้ตรงช่วงที่เลือกทันที (ไม่ต้องรอ event ใหม่)
//   2) ปุ่ม "ข้อกำหนด" — กดแล้วเปิด modal (แบบฟอร์ม) ที่ล็อกไว้อ่านอย่างเดียว อธิบาย
//      เงื่อนไขการจ่ายค่าคอมให้ผู้ขาย (ใช้ TextDisplay ใน Modal — ฟีเจอร์ใหม่ของ Discord
//      ที่ให้ใส่ข้อความอ่านอย่างเดียวใน modal ได้โดยไม่ต้องมีช่องกรอกเลย)
//
// 🆕 อัปเดต (รอบดึกยิ่งกว่าเดิม — เคยลองแล้วผิดทาง!) — ตอนแรกเข้าใจผิดว่าภาพเรฟ "MAMOMI
// STORE" ต้องวาดเป็นรูปภาพจริงด้วย canvas ถึงจะได้กรอบกล่องแบบนั้น (ลองทำไปแล้วรอบนึง
// เป็นไฟล์ utils/drawReferralReportCard.js) — น้องหนาวแก้ให้โดยก็อปข้อความดิบจากบอทเรฟ
// มาให้ดูตรงๆ แล้วถึงรู้ว่า **ไม่ใช่รูปภาพเลย เป็นข้อความ Discord ธรรมดาๆ นี่แหละ** แค่ใช้
// เทคนิคจัดฟอร์แมต 2 อย่างร่วมกัน:
//   1) ตัวอักษร "・" (คัตะคานะ middle dot) นำหน้าแต่ละป้ายกำกับ
//   2) ค่าตัวเลขแต่ละอันห่อด้วย code block (```ข้อความ```) — Discord render code block
//      เป็นกล่องพื้นหลังเข้ม ตัวอักษร monospace ให้เองอัตโนมัติ นี่คือกล่องที่ดูเหมือน
//      "ถูกวาดเป็นกรอบ" ในภาพเรฟ ไม่ใช่รูปภาพหรือ programmatic drawing อะไรเลย!
// วิธีนี้เบากว่า เร็วกว่า ไม่ต้องพึ่ง @napi-rs/canvas/โหลดฟอนต์/โหลดรูปอิโมจิจาก CDN เลย
// แถมยังคง Embed เดิมไว้ได้ (แถบสีข้างซ้ายบอกสถานะเปิด/ปิด + footer เวลาอัปเดตแบบ
// สัมพัทธ์ที่ Discord จัดการให้อัตโนมัติ) — ดู buildReportEmbed() ด้านล่าง
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
 *
 * โครงสร้างข้อความ (ในตัว description) เลียนแบบภาพเรฟ "MAMOMI STORE" ที่น้องหนาวก็อปมา
 * ให้ดูตรงๆ: แต่ละสถิติเป็น "・ป้ายกำกับ" ตามด้วย code block (```ค่า```) ในบรรทัดถัดไป —
 * Discord จะ render code block เป็นกล่องพื้นหลังเข้ม ตัว monospace ให้เองอัตโนมัติ ได้
 * หน้าตากล่องๆ เหมือนเรฟเป๊ะๆ โดยไม่ต้องวาดรูปเลย (ดูคอมเมนต์หัวไฟล์ประกอบ)
 *
 * ใช้อิโมจิ Unicode ธรรมดาตรงๆ ในข้อความได้เลย (🟢🔴🔁💸💰) — Discord render อิโมจิพวกนี้
 * ให้เองตามปกติ ไม่ต้องมีระบบอิโมจิ custom ของเซิร์ฟใดๆ เข้ามาเกี่ยวข้องเลย
 * @param {{ code: string, sellerLabel: string, active: boolean, totalUses: number, totalCommissionThb: number }} stats
 * @param {'today'|'month'|'all'} range
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildReportEmbed(stats, range) {
  const rangeLabel = RANGE_LABELS[range] ?? RANGE_LABELS.all;
  const statusEmoji = stats.active ? '🟢' : '🔴';
  const statusText = stats.active ? 'เปิดใช้งานอยู่' : 'ปิดใช้งานแล้ว';

  const description = [
    `ผู้ขาย: **${stats.sellerLabel}**`,
    '',
    `・${statusEmoji} สถานะ`,
    '```',
    statusText,
    '```',
    `・🔁 ใช้ไปแล้ว (${rangeLabel})`,
    '```',
    `${stats.totalUses} ครั้ง`,
    '```',
    '・💸 ค่าคอมต่อครั้ง',
    '```',
    `${COMMISSION_PER_REDEMPTION_THB} บาท`,
    '```',
    `・💰 รวมรายได้ (${rangeLabel})`,
    '```',
    `${stats.totalCommissionThb} บาท`,
    '```',
    '',
    '╰ ꒰ Aitao Bot · ระบบรายงานค่าคอมมิชชั่นอัตโนมัติ ꒱ ╯',
  ].join('\n');

  return new EmbedBuilder()
    .setColor(stats.active ? 0x57f287 : 0x99aab5) // เขียว/เทา — ชุดสีเดียวกับการ์ดพรีเมียม
    .setTitle(`📊 ${stats.code}`)
    .setDescription(description)
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
 * @param {string} code
 * @param {'today'|'month'|'all'} range
 * @returns {{ embeds: import('discord.js').EmbedBuilder[], components: import('discord.js').ActionRowBuilder[] } | null}
 *   null ถ้าไม่เจอโค้ดนี้เลย (เช่นถูกลบไปแล้ว)
 */
function buildReportPayload(code, range) {
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
    embeds: [buildReportEmbed(stats, range)],
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
    const payload = buildReportPayload(normalizedCode, range);
    if (!payload) return; // โค้ดนี้ไม่มีอยู่จริง (ไม่ควรเกิด แต่กันไว้)

    const codeEntry = listAllCodes().find((c) => c.code === normalizedCode);
    const guild = await client.guilds.fetch(guildId);
    const channel = await getOrCreateReportChannel(guild);

    if (codeEntry.reportMessageId) {
      try {
        const existingMessage = await channel.messages.fetch(codeEntry.reportMessageId);
        // ต้องเคลียร์ content: '' + attachments: [] ด้วยเสมอตอนแก้ไขข้อความเก่า —
        // เพราะข้อความรุ่นแรกสุด (ก่อนเปลี่ยนมาใช้ embed) เป็น plain text ล้วนๆ และช่วง
        // สั้นๆ ก่อนหน้านี้เคยลองส่งเป็นรูปภาพแนบ (attachment) ไปด้วย — ถ้าข้อความเดิมของ
        // ใครยังเป็นเวอร์ชันรูปภาพค้างอยู่ ต้องสั่ง attachments: [] มาด้วยเสมอ ไม่งั้นรูป
        // เก่าจะค้างซ้อนอยู่เหนือ embed ใหม่ (Discord แก้เฉพาะ field ที่ส่งมาเท่านั้น
        // ไม่ได้ล้างของเดิมให้อัตโนมัติ)
        await existingMessage.edit({
          content: '',
          attachments: [],
          embeds: payload.embeds,
          components: payload.components,
        });
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

  const payload = buildReportPayload(code, range);
  if (!payload) {
    await interaction.reply({ content: 'ไม่พบโค้ดนี้แล้วครับ (อาจถูกลบไปแล้ว)', ephemeral: true });
    return;
  }

  // เคลียร์ attachments: [] ไว้ด้วยเสมอ — เผื่อการ์ดนี้เคยเป็นเวอร์ชันรูปภาพค้างมาก่อน
  await interaction.update({ content: '', attachments: [], embeds: payload.embeds, components: payload.components });
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
