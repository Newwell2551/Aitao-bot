// utils/guildJoinGreeting.js
// ─────────────────────────────────────────────────────────────────────────
// ฟีเจอร์ "ทักทายอัตโนมัติ" — ตอนบอทถูกแอดมินเชิญเข้าเซิร์ฟเวอร์ใหม่ (event guildCreate)
// ให้ส่งข้อความแนะนำตัวเข้าไปในเซิร์ฟนั้นทันที เพื่อบอกว่าบอทชื่ออะไร ทำอะไรได้บ้าง
// และควรเริ่มต้นใช้งานยังไง — ให้ความรู้สึกเป็นมืออาชีพตั้งแต่วินาทีแรกที่เชิญเข้าไป
//
// 🆕 ใช้ Discord Components V2 (ContainerBuilder/TextDisplayBuilder/SeparatorBuilder/
// SectionBuilder/MediaGalleryBuilder) แทน EmbedBuilder แบบเดิม — เหตุผลที่เปลี่ยน:
// Components V2 รองรับ markdown header จริงๆ (#, ##), มีเส้นคั่น (Separator) เป็น
// component แท้ๆ, และวางรูปภาพ/thumbnail ได้ยืดหยุ่นกว่า embed แบบเดิมมาก
// (ดูคอมเมนต์แต่ละจุดด้านล่าง)
//
// ไฟล์นี้ export ฟังก์ชันเดียวคือ sendGuildJoinGreeting(guild) ไปให้ index.js
// เรียกใช้ตอนดัก event guildCreate (ดูจุดที่เรียกใน index.js)
// ─────────────────────────────────────────────────────────────────────────

const path = require('path');
const {
  ChannelType,
  PermissionFlagsBits,
  // ── Components V2 — ต้อง import เพิ่มจาก discord.js ──────────────────────
  ContainerBuilder,        // "กล่อง" ห่อทุก component ไว้ด้วยกัน มีแถบสี (accent color) ทางซ้ายเหมือน embed
  TextDisplayBuilder,       // "ก้อนข้อความ" หนึ่งก้อน — รองรับ markdown เต็มรูปแบบ (#, ##, **, `code`, ฯลฯ)
  SeparatorBuilder,         // เส้นคั่นจริงๆ ระหว่าง component (ไม่ใช่ตัวอักษรวาดเอง)
  SeparatorSpacingSize,     // ขนาดระยะห่างของเส้นคั่น — Small (แคบ) / Large (กว้าง)
  SectionBuilder,           // 🆕 "บล็อก" ที่วางข้อความ (สูงสุด 3 TextDisplay) คู่กับรูปเล็ก/ปุ่มด้านข้างได้ 1 อัน (accessory)
  ThumbnailBuilder,         // 🆕 รูปเล็กที่ใช้เป็น accessory ของ Section (วางด้านขวาของข้อความ)
  MediaGalleryBuilder,      // 🆕 "แกลเลอรีรูปภาพ" — ใช้แสดงรูปใหญ่เต็มความกว้าง (เอาไว้ทำ banner)
  MediaGalleryItemBuilder,  // 🆕 รูปแต่ละรูปใน MediaGallery (ตอนนี้มีรูปเดียวคือ banner)
  AttachmentBuilder,        // 🆕 ใช้แนบไฟล์จริง (banner.png) ไปกับข้อความ
  MessageFlags,             // ใช้ธง IsComponentsV2 บอก Discord ว่าข้อความนี้เป็น Components V2
} = require('discord.js');

// ชื่อเต็มของบอทที่จะโชว์ในข้อความแนะนำตัว — ไม่ได้ดึงจาก client.user.username
// เพราะชื่อบอทบน Discord (application name) กับชื่อที่อยากให้แนะนำตัวอาจไม่ตรงกันเป๊ะๆ
// เก็บเป็นค่าคงที่ไว้ตรงนี้ที่เดียว แก้ง่ายถ้าจะเปลี่ยนชื่อทีหลัง
const BOT_DISPLAY_NAME = 'Cavin Milo';

// ── ไฟล์รูป banner ──────────────────────────────────────────────────────────
// เก็บไว้ที่ assets/mascot-banner.png (ระดับเดียวกับ index.js ที่ root โปรเจกต์)
// path.join(__dirname, '..', 'assets', ...) เพราะไฟล์นี้อยู่ใน utils/ ต้องถอยออกมา
// 1 ระดับ (..) ก่อนถึงจะเจอโฟลเดอร์ assets/
//
// เก็บชื่อไฟล์เป็นค่าคงที่ตัวเดียว (BANNER_FILENAME) แล้วใช้ซ้ำทั้งตอนสร้าง
// AttachmentBuilder และตอนอ้างอิงด้วย attachment:// ด้านล่าง — กันพิมพ์ชื่อไฟล์
// ไม่ตรงกัน 2 จุด (ถ้าไม่ตรงกัน Discord จะหารูปไม่เจอ โชว์เป็นภาพแตกทันที)
const BANNER_FILENAME = 'mascot-banner.png';
const BANNER_FILE_PATH = path.join(__dirname, '..', 'assets', BANNER_FILENAME);

// ── 🆕 ตัวกันส่งซ้ำ (idempotency guard) ──────────────────────────────────────
// ปัญหา: Discord gateway บางครั้งยิง event guildCreate ให้บอทมากกว่า 1 ครั้ง
// สำหรับ guild เดียวกัน (เช่นตอนบอท reconnect/resume การเชื่อมต่อกับ gateway
// ไม่นานหลังเข้าเซิร์ฟใหม่ๆ) ซึ่งเป็นพฤติกรรมฝั่ง Discord เอง ไม่ใช่บั๊กจากโค้ดเรา —
// วิธีแก้คือ "จำไว้ชั่วคราว" ว่าเพิ่งทักทาย guild ไหนไปแล้วบ้าง แล้วข้ามถ้าเจอซ้ำ
// ภายในช่วงเวลาสั้นๆ
//
// recentlyGreetedGuilds คือ Map ที่เก็บ key = guildId (string), value = เวลา
// (timestamp เป็น ms) ตอนที่เริ่มส่งข้อความทักทายให้ guild นั้น — ใช้ Map แทน Set
// เพราะต้องรู้ "เวลาที่ส่งไปเมื่อไหร่" ด้วย ไม่ใช่แค่รู้ว่าเคยส่งหรือยัง (Set บอกได้แค่
// มี/ไม่มี แต่บอกไม่ได้ว่านานแค่ไหนแล้ว)
//
// เก็บไว้แค่ใน "หน่วยความจำ" (ตัวแปรธรรมดาในไฟล์นี้ ไม่เขียนลงไฟล์/ฐานข้อมูล) เพราะ
// จุดประสงค์คือกันแค่การยิงซ้ำในช่วงสั้นๆ เท่านั้น — ถ้าบอทรีสตาร์ท ค่านี้จะรีเซ็ตเป็น
// Map ว่างใหม่ ซึ่งไม่เป็นไร เพราะโอกาสที่บอทรีสตาร์ทพอดีตอน guildCreate ยิงซ้ำ
// มีน้อยมาก และถึงรีสตาร์ทจริงก็แค่เสี่ยงทักทายซ้ำ 1 ครั้ง ไม่ใช่เรื่องคอขาดบาดตาย
const recentlyGreetedGuilds = new Map();

// ช่วงเวลาที่ถือว่า "ซ้ำ" — ถ้า guild เดียวกันถูกเรียกทักทายซ้ำภายใน 30 วินาทีนี้
// นับตั้งแต่ครั้งแรก จะข้ามไปเลย ปรับตัวเลขนี้ได้ตามต้องการ (ms = มิลลิวินาที)
const GREETING_DUPLICATE_WINDOW_MS = 30_000;

/**
 * ส่งข้อความแนะนำตัว (Components V2) เข้าไปในเซิร์ฟที่บอทเพิ่งถูกเชิญเข้าไป
 * เรียกจาก index.js ตอน client.on(Events.GuildCreate, ...)
 *
 * ⚠️ ฟังก์ชันนี้ต้อง "ไม่มีทาง throw error ออกไปนอกฟังก์ชัน" เด็ดขาด เพราะถ้า throw
 * หลุดออกไป event handler ใน index.js จะพังทั้งเส้น (ไม่มีใคร catch ต่อ) ทำให้
 * event guildCreate ครั้งถัดๆ ไปอาจไม่ทำงานเลย — เพราะงั้นส่วนที่อาจ error ได้จริง
 * (หาช่อง/แนบไฟล์/ส่งข้อความ) ห่อด้วย try/catch แล้วแค่ console.log/console.error
 * เก็บไว้เฉยๆ ไม่ throw ต่อ (ส่วนตัวกันซ้ำด้านล่างเป็นแค่ Map.get/set ธรรมดา ไม่มีทาง
 * throw จึงจงใจไม่เอาไว้ใน try — ให้มันรันแน่นอน 100% ก่อนเข้าสู่ส่วนที่อาจพังได้)
 * @param {import('discord.js').Guild} guild เซิร์ฟที่บอทเพิ่งเข้าไป (มาจาก event guildCreate)
 */
async function sendGuildJoinGreeting(guild) {
  // ══════════════════════════════════════════════════════════════════════
  // ⚠️⚠️ ขั้นที่ 0 (ต้องเป็นบรรทัดแรกสุดของฟังก์ชัน — อยู่ "นอก" try/catch ด้วยซ้ำ) ⚠️⚠️
  // เช็ค + บันทึกว่าเพิ่งทักทาย guild นี้ไปหรือยัง (กันซ้ำ)
  //
  // จุดนี้ทั้งหมด (อ่านค่าจาก Map, เทียบเวลา, เขียนค่ากลับลง Map) เป็นโค้ด synchronous
  // ล้วนๆ ไม่มี await คั่นเลยสักบรรทัด — ต้องทำก่อน "อย่างอื่นทุกอย่าง" ในฟังก์ชันนี้
  // (หาช่อง / เช็คสิทธิ์ / สร้าง container ข้อความ) เพราะ JavaScript รัน async function
  // แบบ "run-to-completion จนกว่าจะเจอ await ตัวแรก" — พูดง่ายๆ คือถ้าโค้ดตั้งแต่ต้น
  // ฟังก์ชันจนถึงบรรทัด recentlyGreetedGuilds.set(...) ไม่มี await เลยสักตัว การรันจะ
  // "รวดเดียวจบ ห้ามแทรก" เหมือนเป็นคำสั่งเดียวกัน ต่อให้ guildCreate ยิงมาซ้อนกันเร็ว
  // แค่ไหนในโปรเซสเดียวกัน ก็ไม่มีทางแทรกเข้ามาระหว่างกลางได้ — เพราะ Node.js เป็น
  // single-threaded รันโค้ด synchronous ทีละบรรทัดจริงๆ ไม่มีการสลับงานระหว่างสองบรรทัด
  // ที่ไม่มี await คั่นอยู่เด็ดขาด
  const guildId = guild.id;
  const lastGreetedAt = recentlyGreetedGuilds.get(guildId);
  const isDuplicateFire = lastGreetedAt !== undefined && Date.now() - lastGreetedAt < GREETING_DUPLICATE_WINDOW_MS;

  if (isDuplicateFire) {
    console.log(
      `[guildJoinGreeting] guild ${guildId} (${guild.name}) เพิ่งถูกทักทายไปเมื่อไม่กี่วินาทีก่อน (น่าจะเป็น guildCreate ที่ gateway ยิงซ้ำ) ข้ามการส่งรอบนี้`
    );
    return; // ← ออกจากฟังก์ชันทันที ยังไม่แตะ findGreetingChannel/AttachmentBuilder/channel.send เลยสักบรรทัด
  }

  // บันทึกทันที ก่อนไปทำอย่างอื่นต่อ — นี่คือบรรทัดที่ "กันซ้ำ" จริงๆ
  recentlyGreetedGuilds.set(guildId, Date.now());

  // ทำความสะอาด Map ทีหลัง: ลบ entry ของ guild นี้ทิ้งหลังพ้นช่วงกันซ้ำไปแล้ว กัน Map
  // โตค้างอยู่ในหน่วยความจำเรื่อยๆ โดยไม่จำเป็น (ใช้ .unref() กัน timer นี้หน่วง process
  // ไม่ให้ปิดตัวตามปกติ)
  setTimeout(() => {
    recentlyGreetedGuilds.delete(guildId);
  }, GREETING_DUPLICATE_WINDOW_MS).unref();
  // ══════════════════════════════════════════════════════════════════════

  try {
    // ── ขั้นที่ 1: หาช่องที่จะส่งข้อความ ───────────────────────────────────
    // ไม่แตะฟังก์ชันนี้เลย — logic การเลือกช่อง (systemChannel → text channel แรกสุด)
    // เหมือนเดิมทุกประการ
    const channel = findGreetingChannel(guild);

    // หาช่องไม่เจอเลยจริงๆ (เช่น เซิร์ฟตั้งค่าสิทธิ์แปลกๆ ไม่ให้บอทพูดที่ไหนเลย)
    // ให้แค่ log แจ้งเตือนไว้เฉยๆ ไม่ throw error — บอทยังทำงานส่วนอื่นต่อได้ปกติ
    if (!channel) {
      console.log(
        `[guildJoinGreeting] guild ${guild.id} (${guild.name}) ไม่มีช่องไหนที่บอทส่งข้อความทักทายได้เลย ข้ามไป`
      );
      return;
    }

    // ── ขั้นที่ 2: เตรียมไฟล์แนบ (banner) ────────────────────────────────────
    // AttachmentBuilder ห่อไฟล์จริงบนดิสก์ (BANNER_FILE_PATH) ให้กลายเป็นสิ่งที่
    // ส่งไปกับข้อความ Discord ได้ — { name: ... } ตั้งชื่อไฟล์ตอนอัปโหลดขึ้น Discord
    // ต้อง "ตรงกับ" ชื่อที่ผูกไว้ใน MediaGallery ด้านใน buildIntroContainer() เป๊ะๆ
    // (ดูคอมเมนต์เรื่อง attachment:// ในฟังก์ชันนั้น) เลยใช้ BANNER_FILENAME ตัวแปร
    // เดียวกันทั้ง 2 จุด กันพิมพ์ไม่ตรงกัน
    const bannerAttachment = new AttachmentBuilder(BANNER_FILE_PATH, { name: BANNER_FILENAME });

    // ── ขั้นที่ 3: สร้าง Container (Components V2) แนะนำตัว แล้วส่งเข้าช่องที่หาได้ ──
    const introContainer = buildIntroContainer(guild);

    // ⚠️ จุดสำคัญที่สุดของการย้ายมาใช้ Components V2: ต้องส่งครบ 3 อย่างนี้คู่กันเสมอ
    //   1) components: [introContainer] — แทนที่ embeds: [introEmbed] แบบเดิม
    //   2) files: [bannerAttachment] — 🆕 ไฟล์แนบจริง (Components V2 อ้างอิงรูปด้วย
    //      "attachment://ชื่อไฟล์" ซึ่งจะ resolve ไม่ได้เลยถ้าไม่ได้แนบไฟล์จริงมาด้วยใน
    //      key นี้ — เหมือนโพสต์ข้อความพร้อมแนบรูปแล้วอ้างอิงชื่อไฟล์นั้นในเนื้อหา)
    //   3) flags: MessageFlags.IsComponentsV2 — ธงบอก Discord ว่าข้อความนี้ใช้ระบบ
    //      Components V2 ทั้งก้อน ถ้าลืมใส่ธงนี้ Discord จะปฏิเสธข้อความทันที (error)
    // และ "ห้ามใส่ content หรือ embeds ปนเข้ามาด้วยเด็ดขาด" — Components V2 กับ
    // embed/content แบบเดิมใช้แทนกันไม่ได้ ใช้ปนกันในข้อความเดียวกันไม่ได้เลย
    // (กฎเดียวกับที่เคยเจอตอนทำ /premium กับ DM แจ้งเตือนพรีเมียมมาแล้ว)
    await channel.send({
      components: [introContainer],
      files: [bannerAttachment],
      flags: MessageFlags.IsComponentsV2,
    });

    console.log(
      `[guildJoinGreeting] ส่งข้อความทักทายเข้า guild ${guild.id} (${guild.name}) ที่ช่อง #${channel.name} สำเร็จ`
    );
  } catch (error) {
    // ดักทุก error ที่อาจเกิดขึ้น (เช่น หาไฟล์ banner ไม่เจอ, ส่งข้อความไม่สำเร็จเพราะ
    // โดนบล็อกกะทันหันระหว่างทาง, หรือ Discord API ล่มชั่วคราว) — log ไว้เฉยๆ ไม่ทำให้บอทพัง
    console.error(`[guildJoinGreeting] เกิดข้อผิดพลาดตอนส่งข้อความทักทายที่ guild ${guild.id}:`, error);
  }
}

/**
 * หาช่องที่เหมาะจะส่งข้อความทักทาย ตามลำดับความสำคัญ:
 *   1) guild.systemChannel (ช่องที่ Discord ตั้งเป็น "ช่องระบบ" ของเซิร์ฟ — ปกติคือ
 *      ช่องที่มีข้อความ "ยินดีต้อนรับ" อัตโนมัติของ Discord เองอยู่แล้ว) ถ้ามีและ
 *      บอทมีสิทธิ์ SendMessages + EmbedLinks ในช่องนั้น
 *   2) ถ้าใช้ systemChannel ไม่ได้ (ไม่มี หรือบอทไม่มีสิทธิ์) → วนหา text channel
 *      แรกสุด (เรียงตามตำแหน่งช่องในเซิร์ฟ) ที่บอทมีสิทธิ์ SendMessages
 *   3) ถ้าไม่เจอเลย → คืนค่า null (ให้ผู้เรียกไป log แจ้งเตือนเอง)
 *
 * ⚠️ ฟังก์ชันนี้ "ไม่ได้ถูกแก้" เลยแม้แต่บรรทัดเดียวตามที่สั่ง — logic เหมือนเดิม 100%
 * (เก็บชื่อ requiredPerms ที่เช็ค EmbedLinks ไว้เหมือนเดิม แม้ตอนนี้จะไม่ได้ส่ง embed
 * แล้วก็ตาม เพราะ EmbedLinks เป็นสิทธิ์ที่ครอบคลุมการแนบ "เนื้อหาแบบ rich" ในช่องนั้น
 * โดยรวม รวมถึง Components V2 ด้วย ไม่ใช่สิทธิ์เฉพาะ embed แบบเก่าเท่านั้น)
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').TextChannel | null}
 */
function findGreetingChannel(guild) {
  // guild.members.me = ข้อมูล member ของ "บอทเราเอง" ในเซิร์ฟนี้ — ต้องใช้ตัวนี้
  // (ไม่ใช่ guild.client.user ตรงๆ) เพราะการเช็คสิทธิ์ในช่อง (permissionsFor)
  // ต้องการ GuildMember ไม่ใช่ User ธรรมดา — GuildMember มีข้อมูล role/permission
  // ผูกกับเซิร์ฟนี้โดยเฉพาะ ส่วน User ไม่มีข้อมูลสิทธิ์เลย
  const me = guild.members.me;

  // เผื่อกรณีแปลกๆ ที่ cache ยังไม่มีข้อมูลนี้ทัน (ไม่ควรเกิดขึ้นได้จริงตอน guildCreate
  // เพราะบอทเพิ่งเข้าเซิร์ฟ ข้อมูลตัวเองต้องมีอยู่แน่ๆ) กันไว้เฉยๆ ไม่ให้โค้ดพัง
  if (!me) return null;

  // สิทธิ์ที่บอทต้องมีถึงจะส่งข้อความแบบ rich (embed เดิม/Components V2 ตอนนี้) ได้จริง —
  // SendMessages (ส่งข้อความได้) + EmbedLinks (แนบเนื้อหา rich ได้ — ถ้าไม่มีสิทธิ์นี้
  // Discord จะบล็อกทิ้งเงียบๆ)
  const requiredPerms = [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

  // ── ลำดับที่ 1: ลอง systemChannel ก่อน ──────────────────────────────────
  const systemChannel = guild.systemChannel;
  // permissionsFor(me) คำนวณสิทธิ์ "สุทธิ" ของบอทในช่องนี้ (รวม role permission +
  // channel-specific override ทั้งหมดแล้ว) — .has(requiredPerms) เช็คว่ามีครบทุกอันไหม
  // ใช้ optional chaining (?.) กันเผื่อ permissionsFor คืน null ในเคสแปลกๆ
  if (systemChannel && systemChannel.permissionsFor(me)?.has(requiredPerms)) {
    return systemChannel;
  }

  // ── ลำดับที่ 2: วนหา text channel แรกสุดที่บอทส่งข้อความได้ ─────────────
  // guild.channels.cache = รายการช่องทั้งหมดในเซิร์ฟ (ทุกประเภท) ที่มีอยู่ในหน่วยความจำ
  // filter เอาเฉพาะ ChannelType.GuildText (ช่องแชตข้อความปกติ ไม่เอาช่องเสียง/ประกาศ/etc.)
  // ที่บอทมีสิทธิ์ SendMessages เป็นอย่างน้อย (ไม่บังคับ EmbedLinks ในขั้นนี้ เผื่อหา
  // ช่องไม่เจอเลยจริงๆ — ถ้าไม่มี EmbedLinks จริง Discord จะโชว์แค่ไม่มีเนื้อหา rich แนบมา
  // แทนที่จะไม่ส่งอะไรเลย ยังดีกว่าไม่ทักทายเลย)
  const candidateChannels = guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildText && ch.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)
  );

  if (candidateChannels.size === 0) return null;

  // เรียงตามตำแหน่งช่อง (position) จากน้อยไปมาก = ช่องที่อยู่บนสุดในลิสต์ช่องของเซิร์ฟ
  // แล้วเอาอันแรกสุด — "ช่องแรกสุดในเซิร์ฟ" ตามที่โจทย์ต้องการ
  const sorted = [...candidateChannels.values()].sort((a, b) => a.position - b.position);
  return sorted[0];
}

/**
 * สร้าง Container (Components V2) แนะนำตัวบอท — ใช้ภาษาอังกฤษเป็นค่า default เสมอ
 * ไม่อิงระบบ i18n (th.json/en.json) เพราะตอนเพิ่งเข้าเซิร์ฟใหม่ ยังไม่มีใครตั้งค่าภาษาของ
 * เซิร์ฟนี้เลย (การตั้งค่าภาษาอยู่ใน utils/languageStorage.js ซึ่งต้องรอแอดมินสั่ง /language ก่อน)
 *
 * โครงสร้างเรียงจากบนลงล่าง:
 *   MediaGallery (banner) → Section (header + คำแนะนำตัว พร้อม thumbnail avatar) →
 *   เส้นคั่น → "## 🎨 What I Do" + คำอธิบาย → เส้นคั่น → "## ⚡ Get Started" + รายการคำสั่ง
 *   → เส้นคั่นเล็ก → footer เล็กๆ
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildIntroContainer(guild) {
  // guild.client คือ Discord Client instance เดียวกับที่ล็อกอินอยู่ (เข้าถึงได้จาก
  // guild object เสมอ) — ใช้ดึง avatar ของบอทมาใส่เป็น thumbnail accessory ของ Section
  // ด้านล่าง displayAvatarURL({ size: 256 }) ได้ URL รูปโปรไฟล์บอท ขนาด 256x256 พิกเซล
  const botAvatarUrl = guild.client.user.displayAvatarURL({ size: 256 });

  return (
    new ContainerBuilder()
      // setAccentColor = สีแถบทางซ้ายของ Container ทำหน้าที่เหมือน .setColor() ของ
      // embed เดิม — เปลี่ยนจากเขียว (0x57f287) เป็นน้ำเงินเข้ม (0x3b4e89) ตามที่สั่ง
      // ให้เข้ากับโทนภาพ banner ที่เพิ่มเข้ามา
      .setAccentColor(0x3b4e89)

      // ── 🆕 MediaGallery: banner รูปใหญ่ ด้านบนสุดของข้อความ ────────────────
      // MediaGallery คือ component สำหรับโชว์รูปภาพเต็มความกว้าง (เหมือนแกลเลอรีรูป
      // ในแชตทั่วไป) รับรูปได้หลายรูปพร้อมกัน แต่ตรงนี้เราใส่แค่รูปเดียวคือ banner
      //
      // MediaGalleryItemBuilder แต่ละอันคือ "รูป 1 รูป" ในแกลเลอรี — .setURL() ตรงนี้
      // ใช้รูปแบบพิเศษ "attachment://ชื่อไฟล์" (ไม่ใช่ URL เว็บทั่วไปที่ขึ้นต้นด้วย
      // https://) ซึ่งเป็นวิธีที่ Discord ใช้บอกว่า "เอารูปจากไฟล์แนบ (attachment) ของ
      // ข้อความนี้เอง ที่ชื่อไฟล์ตรงกับตรงนี้เป๊ะๆ" — ไฟล์จริงถูกแนบมาคู่กันผ่าน
      // key `files: [bannerAttachment]` ตอนเรียก channel.send() ใน sendGuildJoinGreeting()
      // (ถ้าชื่อไฟล์ตรงนี้กับตอนสร้าง AttachmentBuilder ไม่ตรงกัน Discord จะหารูปไม่เจอ
      // แล้วโชว์เป็นภาพแตก — เพราะงั้นทั้งสองจุดใช้ตัวแปร BANNER_FILENAME ตัวเดียวกัน)
      //
      // .setDescription() ใส่ alt text สั้นๆ ให้ screen reader อ่านได้ (accessibility)
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(`attachment://${BANNER_FILENAME}`)
            .setDescription('Cavin Milo mascot banner')
        )
      )

      // ── 🆕 Section: header + คำแนะนำตัว พร้อมรูป avatar เล็กด้านขวา ────────
      // Section คือ component ที่เอาไว้ "จับคู่" ข้อความกับรูปเล็ก/ปุ่ม 1 อัน — คิดง่ายๆ
      // ว่าเหมือน embed เดิมที่มี thumbnail มุมขวาบนคู่กับ title/description แต่ตอนนี้
      // ทำเป็น component แยกต่างหากแทน
      //
      // .addTextDisplayComponents(...) ใส่ข้อความของ section ได้สูงสุด 3 TextDisplay
      // (ตรงนี้ใส่ 2 อัน: header ใหญ่ กับ ประโยคแนะนำตัวสั้นๆ — เนื้อหาเดิมจากเวอร์ชัน
      // ก่อนหน้า ไม่ได้แก้คำเลย)
      //
      // .setThumbnailAccessory(...) คือ "accessory" ของ section นี้ — เลือกได้ว่าจะเป็น
      // ThumbnailBuilder (รูปเล็ก) หรือ ButtonBuilder (ปุ่ม) อย่างใดอย่างหนึ่งเท่านั้น
      // ต่อ 1 section ตรงนี้เราใช้ ThumbnailBuilder ใส่รูป avatar ของบอทเอง (จาก
      // botAvatarUrl ด้านบน) มันจะไปโผล่ที่ "ฝั่งขวา" ของ section โดยอัตโนมัติ — ตำแหน่ง
      // นี้ Discord จัดให้เอง ไม่ต้องกำหนดพิกัดเพิ่ม
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ˙𓈒 👋 Hi, I'm ${BOT_DISPLAY_NAME}!  🐻‍❄️`),
            new TextDisplayBuilder().setContent('A decoration & customization bot for your Discord server.')
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(botAvatarUrl).setDescription(`${BOT_DISPLAY_NAME} avatar`)
          )
      )

      // ── Separator #1: เส้นคั่นจริง ────────────────────────────────────────
      // .setDivider(true) = ให้ Discord วาดเส้นขีดจริงๆ (ถ้า false จะเป็นแค่ช่องว่าง
      // ไม่มีเส้น) .setSpacing(Large) = ระยะห่างบน-ล่างกว้างหน่อย เหมาะกับการคั่น
      // "section ใหญ่" ที่เปลี่ยนหัวข้อจริงๆ (ต่างจาก Separator #3 ท้ายสุดที่เบากว่า)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))

      // ── TextDisplay: "## 🎨 What I Do" + คำอธิบาย ────────────────────────
      // "## " คือ markdown header ระดับ 2 (เล็กกว่า # นิดหน่อย) — เขียนหัวข้อกับ
      // เนื้อหาไว้ใน TextDisplay เดียวกัน คั่นด้วย "\n\n" (เว้นบรรทัดว่าง 1 บรรทัด
      // ให้อ่านง่าย เหมือนย่อหน้าในเอกสารทั่วไป) เนื้อหาเป็นข้อความเดิม ไม่ได้แก้คำเลย
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '## 🎨 What I Do\n\n' +
            "I'm a decoration & customization bot — I help you make your Discord server look polished and welcoming. " +
            'From custom welcome/goodbye cards to self-assign role menus and rich message layouts, ' +
            "I've got you covered."
        )
      )

      // ── Separator #2: เส้นคั่นจริง (เหมือน Separator #1) ──────────────────
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))

      // ── TextDisplay: "## ⚡ Get Started" + รายการคำสั่ง ──────────────────
      // ⚠️ ชื่อคำสั่งกับคำอธิบายตรงนี้ต้อง "ตรงกับที่ deploy จริง" เป๊ะๆ — ดึงมาจาก
      // .setName()/.setDescription() จริงในแต่ละไฟล์ commands/*.js (deploy-commands.js
      // เป็นตัวอ่านไฟล์พวกนี้ไปลงทะเบียนกับ Discord จริงๆ) ห้ามพิมพ์ชื่อคำสั่งเดาเอง —
      // รายการนี้เหมือนเวอร์ชันก่อนหน้าทุกตัวอักษร ไม่ได้แก้อะไร
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '## ⚡ Get Started\n\n' +
            [
              '`/builder` — Build custom message layouts', // ตรงกับ commands/builder.js
              '`/role-setup` — Set up automatic role assignment (menu / button / reaction)', // ตรงกับ commands/role-setup.js
              '`/welcome-setup` — Set up new member welcome cards', // ตรงกับ commands/welcome-setup.js
              '`/goodbye-setup` — Set up member farewell cards', // ตรงกับ commands/goodbye-setup.js
              "`/premium` — Manage this server's premium subscription", // ตรงกับ commands/premium.js
            ].join('\n')
        )
      )

      // ── Separator #3: เส้นคั่นแบบเบา (spacing เล็กกว่า 2 อันบน) ────────────
      // ตามที่สั่งว่า "แบบเส้นเล็ก/spacing น้อยกว่า" — ใช้ SeparatorSpacingSize.Small
      // แทน Large เพื่อให้ระยะห่างก่อนถึง footer แคบกว่า ดูเป็น "ส่วนปิดท้าย" ไม่ใช่
      // section ใหญ่เท่าๆ กับสองอันบน
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))

      // ── TextDisplay: footer เล็กๆ ปิดท้าย ─────────────────────────────────
      // "-# " ที่ขึ้นต้นบรรทัด คือ markdown "subtext" ของ Discord (ตัวหนังสือเล็กสีเทา
      // จางๆ) ใกล้เคียงกับหน้าตาของ .setFooter() ใน embed เดิมที่สุด — Components V2
      // ไม่มี component "footer" ให้ใช้ตรงๆ เหมือน embed เลยใช้ syntax นี้แทน
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# Type /builder to get started, or try any command above!')
      )
  );
}

module.exports = { sendGuildJoinGreeting };