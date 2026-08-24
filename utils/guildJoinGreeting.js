// utils/guildJoinGreeting.js
// ─────────────────────────────────────────────────────────────────────────
// ฟีเจอร์ "ทักทายอัตโนมัติ" — ตอนบอทถูกแอดมินเชิญเข้าเซิร์ฟเวอร์ใหม่ (event guildCreate)
// ให้ส่งข้อความแนะนำตัวเข้าไปในเซิร์ฟนั้นทันที เพื่อบอกว่าบอทชื่ออะไร ทำอะไรได้บ้าง
// และควรเริ่มต้นใช้งานยังไง — ให้ความรู้สึกเป็นมืออาชีพตั้งแต่วินาทีแรกที่เชิญเข้าไป
//
// 🆕 ใช้ Discord Components V2 (ContainerBuilder/TextDisplayBuilder/SeparatorBuilder)
// แทน EmbedBuilder แบบเดิม — เหตุผลที่เปลี่ยน: Components V2 รองรับ markdown header
// จริงๆ (#, ##) และมีเส้นคั่น (Separator) เป็น component แท้ๆ ให้ใช้ตรงๆ ไม่ต้อง
// หลอกตาด้วยตัวอักษร ▬ เหมือนตอนใช้ embed ธรรมดา (ดูคอมเมนต์แต่ละจุดด้านล่าง)
//
// ไฟล์นี้ export ฟังก์ชันเดียวคือ sendGuildJoinGreeting(guild) ไปให้ index.js
// เรียกใช้ตอนดัก event guildCreate (ดูจุดที่เรียกใน index.js)
// ─────────────────────────────────────────────────────────────────────────

const {
  ChannelType,
  PermissionFlagsBits,
  // ── 4 ตัวนี้คือ Components V2 — ต้อง import เพิ่มจาก discord.js ──────────
  ContainerBuilder,      // "กล่อง" ห่อทุก component ไว้ด้วยกัน มีแถบสี (accent color) ทางซ้ายเหมือน embed
  TextDisplayBuilder,     // "ก้อนข้อความ" หนึ่งก้อน — รองรับ markdown เต็มรูปแบบ (#, ##, **, `code`, ฯลฯ)
  SeparatorBuilder,       // เส้นคั่นจริงๆ ระหว่าง component (ไม่ใช่ตัวอักษรวาดเอง)
  SeparatorSpacingSize,   // ขนาดระยะห่างของเส้นคั่น — Small (แคบ) / Large (กว้าง)
  MessageFlags,           // ใช้ธง IsComponentsV2 บอก Discord ว่าข้อความนี้เป็น Components V2
} = require('discord.js');

// ชื่อเต็มของบอทที่จะโชว์ในข้อความแนะนำตัว — ไม่ได้ดึงจาก client.user.username
// เพราะชื่อบอทบน Discord (application name) กับชื่อที่อยากให้แนะนำตัวอาจไม่ตรงกันเป๊ะๆ
// เก็บเป็นค่าคงที่ไว้ตรงนี้ที่เดียว แก้ง่ายถ้าจะเปลี่ยนชื่อทีหลัง
const BOT_DISPLAY_NAME = 'Cavin Milo';

/**
 * ส่งข้อความแนะนำตัว (Components V2) เข้าไปในเซิร์ฟที่บอทเพิ่งถูกเชิญเข้าไป
 * เรียกจาก index.js ตอน client.on(Events.GuildCreate, ...)
 *
 * ⚠️ ฟังก์ชันนี้ต้อง "ไม่มีทาง throw error ออกไปนอกฟังก์ชัน" เด็ดขาด เพราะถ้า throw
 * หลุดออกไป event handler ใน index.js จะพังทั้งเส้น (ไม่มีใคร catch ต่อ) ทำให้
 * event guildCreate ครั้งถัดๆ ไปอาจไม่ทำงานเลย — เพราะงั้นทุกอย่างข้างในห่อด้วย
 * try/catch แล้วแค่ console.log/console.error เก็บไว้เฉยๆ ไม่ throw ต่อ
 * @param {import('discord.js').Guild} guild เซิร์ฟที่บอทเพิ่งเข้าไป (มาจาก event guildCreate)
 */
async function sendGuildJoinGreeting(guild) {
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

    // ── ขั้นที่ 2: สร้าง Container (Components V2) แนะนำตัว แล้วส่งเข้าช่องที่หาได้ ──
    const introContainer = buildIntroContainer(guild);

    // ⚠️ จุดสำคัญที่สุดของการย้ายมาใช้ Components V2: ต้องส่ง 2 อย่างนี้คู่กันเสมอ
    //   1) components: [introContainer] — แทนที่ embeds: [introEmbed] แบบเดิม
    //   2) flags: MessageFlags.IsComponentsV2 — ธงบอก Discord ว่าข้อความนี้ใช้ระบบ
    //      Components V2 ทั้งก้อน ถ้าลืมใส่ธงนี้ Discord จะปฏิเสธข้อความทันที (error)
    // และ "ห้ามใส่ content หรือ embeds ปนเข้ามาด้วยเด็ดขาด" — Components V2 กับ
    // embed/content แบบเดิมใช้แทนกันไม่ได้ ใช้ปนกันในข้อความเดียวกันไม่ได้เลย
    // (กฎเดียวกับที่เคยเจอตอนทำ /premium กับ DM แจ้งเตือนพรีเมียมมาแล้ว)
    await channel.send({
      components: [introContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    console.log(
      `[guildJoinGreeting] ส่งข้อความทักทายเข้า guild ${guild.id} (${guild.name}) ที่ช่อง #${channel.name} สำเร็จ`
    );
  } catch (error) {
    // ดักทุก error ที่อาจเกิดขึ้น (เช่น ส่งข้อความไม่สำเร็จเพราะโดนบล็อกกะทันหัน
    // ระหว่างทาง หรือ Discord API ล่มชั่วคราว) — log ไว้เฉยๆ ไม่ทำให้บอทพัง
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
 *   Header ใหญ่ (# ...) → คำแนะนำตัวสั้นๆ → เส้นคั่น → "## 🎨 What I Do" + คำอธิบาย
 *   → เส้นคั่น → "## ⚡ Get Started" + รายการคำสั่ง → เส้นคั่นเล็ก → footer เล็กๆ
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildIntroContainer(guild) {
  return (
    new ContainerBuilder()
      // setAccentColor = สีแถบทางซ้ายของ Container ทำหน้าที่เหมือน .setColor() ของ
      // embed เดิมเป๊ะๆ — ใช้เลข hex เดียวกับที่ embed เคยใช้ (0x57f287 = เขียวธรรมชาติ)
      .setAccentColor(0x57f287)

      // ── TextDisplay #1: Header ใหญ่ ──────────────────────────────────────
      // "# " ที่ขึ้นต้นบรรทัด คือ markdown header ระดับ 1 (เหมือนพิมพ์ # ในข้อความ
      // Discord ปกติ) — TextDisplay รองรับ markdown เต็มรูปแบบ ต่างจาก embed title
      // เดิมที่เป็นแค่ตัวหนาธรรมดา ไม่ใช่ header จริงๆ
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ˙𓈒 👋 Hi, I'm ${BOT_DISPLAY_NAME}!  🐻‍❄️`))

      // ── TextDisplay #2: คำแนะนำตัวสั้นๆ ──────────────────────────────────
      // ประโยคเดียวสั้นๆ ใต้ header (เนื้อหาเดิมจาก .setDescription() ของ embed เก่า)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('A decoration & customization bot for your Discord server.')
      )

      // ── Separator #1: เส้นคั่นจริง ────────────────────────────────────────
      // .setDivider(true) = ให้ Discord วาดเส้นขีดจริงๆ (ถ้า false จะเป็นแค่ช่องว่าง
      // ไม่มีเส้น) .setSpacing(Large) = ระยะห่างบน-ล่างกว้างหน่อย เหมาะกับการคั่น
      // "section ใหญ่" ที่เปลี่ยนหัวข้อจริงๆ (ต่างจาก Separator #3 ท้ายสุดที่เบากว่า)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))

      // ── TextDisplay #3: "## 🎨 What I Do" + คำอธิบาย ─────────────────────
      // "## " คือ markdown header ระดับ 2 (เล็กกว่า # นิดหน่อย) — เขียนหัวข้อกับ
      // เนื้อหาไว้ใน TextDisplay เดียวกัน คั่นด้วย "\n\n" (เว้นบรรทัดว่าง 1 บรรทัด
      // ให้อ่านง่าย เหมือนย่อหน้าในเอกสารทั่วไป) เนื้อหาเป็นข้อความเดิมจาก field
      // "🎨 What I Do" เวอร์ชัน embed ก่อนหน้านี้ ไม่ได้แก้คำเลย
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

      // ── TextDisplay #4: "## ⚡ Get Started" + รายการคำสั่ง ────────────────
      // ⚠️ ชื่อคำสั่งกับคำอธิบายตรงนี้ต้อง "ตรงกับที่ deploy จริง" เป๊ะๆ — ดึงมาจาก
      // .setName()/.setDescription() จริงในแต่ละไฟล์ commands/*.js (deploy-commands.js
      // เป็นตัวอ่านไฟล์พวกนี้ไปลงทะเบียนกับ Discord จริงๆ) ห้ามพิมพ์ชื่อคำสั่งเดาเอง —
      // รายการนี้เหมือนเวอร์ชัน embed เดิมทุกตัวอักษร ไม่ได้แก้อะไร แค่ย้ายมาอยู่ใน
      // TextDisplay เดียวกับ header "## ⚡ Get Started" แทน
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

      // ── TextDisplay #5: footer เล็กๆ ปิดท้าย ─────────────────────────────
      // "-# " ที่ขึ้นต้นบรรทัด คือ markdown "subtext" ของ Discord (ตัวหนังสือเล็กสีเทา
      // จางๆ) ใกล้เคียงกับหน้าตาของ .setFooter() ใน embed เดิมที่สุด — Components V2
      // ไม่มี component "footer" ให้ใช้ตรงๆ เหมือน embed เลยใช้ syntax นี้แทน
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# Type /builder to get started, or try any command above!')
      )
  );
}

module.exports = { sendGuildJoinGreeting };