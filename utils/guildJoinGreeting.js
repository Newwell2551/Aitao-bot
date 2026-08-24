// utils/guildJoinGreeting.js
// ─────────────────────────────────────────────────────────────────────────
// ฟีเจอร์ "ทักทายอัตโนมัติ" — ตอนบอทถูกแอดมินเชิญเข้าเซิร์ฟเวอร์ใหม่ (event guildCreate)
// ให้ส่ง embed แนะนำตัวเข้าไปในเซิร์ฟนั้นทันที เพื่อบอกว่าบอทชื่ออะไร ทำอะไรได้บ้าง
// และควรเริ่มต้นใช้งานยังไง — ให้ความรู้สึกเป็นมืออาชีพตั้งแต่วินาทีแรกที่เชิญเข้าไป
//
// ไฟล์นี้ export ฟังก์ชันเดียวคือ sendGuildJoinGreeting(guild) ไปให้ index.js
// เรียกใช้ตอนดัก event guildCreate (ดูจุดที่เรียกใน index.js)
// ─────────────────────────────────────────────────────────────────────────

const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

// ชื่อเต็มของบอทที่จะโชว์ในข้อความแนะนำตัว — ไม่ได้ดึงจาก client.user.username
// เพราะชื่อบอทบน Discord (application name) กับชื่อที่อยากให้แนะนำตัวอาจไม่ตรงกันเป๊ะๆ
// เก็บเป็นค่าคงที่ไว้ตรงนี้ที่เดียว แก้ง่ายถ้าจะเปลี่ยนชื่อทีหลัง
const BOT_DISPLAY_NAME = 'Cavin Milo';

/**
 * ส่ง embed แนะนำตัวเข้าไปในเซิร์ฟที่บอทเพิ่งถูกเชิญเข้าไป
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
    const channel = findGreetingChannel(guild);

    // หาช่องไม่เจอเลยจริงๆ (เช่น เซิร์ฟตั้งค่าสิทธิ์แปลกๆ ไม่ให้บอทพูดที่ไหนเลย)
    // ให้แค่ log แจ้งเตือนไว้เฉยๆ ไม่ throw error — บอทยังทำงานส่วนอื่นต่อได้ปกติ
    if (!channel) {
      console.log(
        `[guildJoinGreeting] guild ${guild.id} (${guild.name}) ไม่มีช่องไหนที่บอทส่งข้อความทักทายได้เลย ข้ามไป`
      );
      return;
    }

    // ── ขั้นที่ 2: สร้าง embed แนะนำตัว แล้วส่งเข้าช่องที่หาได้ ─────────────
    const introEmbed = buildIntroEmbed(guild);
    await channel.send({ embeds: [introEmbed] });

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

  // สิทธิ์ที่บอทต้องมีถึงจะส่ง embed ได้จริง — SendMessages (ส่งข้อความได้) +
  // EmbedLinks (แนบ embed ได้ — ถ้าไม่มีสิทธิ์นี้ Discord จะบล็อก embed ทิ้งเงียบๆ)
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
  // ช่องไม่เจอเลยจริงๆ — ถ้าไม่มี EmbedLinks จริง Discord จะโชว์แค่ไม่มี embed แนบมา
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
 * สร้าง embed แนะนำตัวบอท — ใช้ภาษาอังกฤษเป็นค่า default เสมอ ไม่อิงระบบ i18n
 * (th.json/en.json) เพราะตอนเพิ่งเข้าเซิร์ฟใหม่ ยังไม่มีใครตั้งค่าภาษาของเซิร์ฟนี้เลย
 * (การตั้งค่าภาษาอยู่ใน utils/languageStorage.js ซึ่งต้องรอแอดมินสั่ง /language ก่อน)
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildIntroEmbed(guild) {
  // guild.client คือ Discord Client instance เดียวกับที่ล็อกอินอยู่ (เข้าถึงได้จาก
  // guild object เสมอ) — ใช้ดึง avatar ของบอทมาใส่เป็น thumbnail ของ embed
  // displayAvatarURL({ size: 256 }) ได้ URL รูปโปรไฟล์บอท ขนาด 256x256 พิกเซล
  const botAvatarUrl = guild.client.user.displayAvatarURL({ size: 256 });

  // ── "เส้นคั่น" ระหว่าง section ──────────────────────────────────────────
  // Discord embed ไม่มี component เส้นคั่นให้ใช้ตรงๆ เลยต้องใช้ "ลูกเล่น" นี้แทน:
  // สร้าง field ปลอมๆ ที่ name เป็น '​' (zero-width space — อักขระที่มีความกว้าง
  // เป็น 0 มองไม่เห็นด้วยตา เขียนเป็น escape sequence ตรงๆ ในโค้ด กันปัญหา editor/เครื่องมือ
  // อื่นแอบลบอักขระที่มองไม่เห็นทิ้งโดยไม่ตั้งใจ) ทำให้หัวข้อของ field นี้ดูเหมือนไม่มีอะไรอยู่เลย
  // ส่วน value ใส่ตัวอักษร "▬" เรียงกันยาวๆ แทนเส้นขีดคั่นสายตา — inline: false
  // บังคับให้ field นี้ขึ้นบรรทัดใหม่เต็มความกว้าง ไม่ไปเรียงติดกับ field อื่น
  // เก็บไว้เป็นค่าคงที่ตัวเดียว เพราะใช้ซ้ำ 2 จุดด้านล่าง (กันพิมพ์ผิดเวลาต้องพิมพ์ซ้ำ)
  const DIVIDER = { name: '\u200b', value: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬', inline: false };

  return (
    new EmbedBuilder()
      // สีเขียวโทนธรรมชาติ ให้เข้ากับธีม "สายตกแต่ง/ต้นไม้" ของชื่อบอท (Milo 🌿)
      .setColor(0x57f287)
      // Header — ชื่อบอทพร้อมสัญลักษณ์ตกแต่งหน้า-หลัง ตามที่กำหนด
      .setTitle("˙𓈒 👋 Hi, I'm Cavin Milo! 🌫️")
      // description สั้นๆ ใต้ title เป็นประโยคแนะนำตัวประโยคเดียว (รายละเอียดเต็มๆ
      // ย้ายไปอยู่ใน field "🎨 What I Do" ด้านล่างแทน เพื่อให้หัว embed ดูโล่ง อ่านง่าย)
      .setDescription('A decoration & customization bot for your Discord server.')
      // thumbnail = รูปเล็กมุมขวาบนของ embed
      .setThumbnail(botAvatarUrl)
      .addFields(
        // เส้นคั่นที่ 1 — กั้นระหว่าง description บนสุด กับ field "What I Do"
        DIVIDER,
        // ── field "🎨 What I Do" — คำอธิบายเต็มๆ ว่าบอทตัวนี้ทำอะไรได้บ้าง ──────
        // ย้ายมาจาก setDescription() เดิม (คำพูดเดียวกัน ไม่ได้แก้เนื้อหา แค่ย้ายที่)
        {
          name: '🎨 What I Do',
          value:
            "I'm a decoration & customization bot — I help you make your Discord server look polished and welcoming. " +
            'From custom welcome/goodbye cards to self-assign role menus and rich message layouts, ' +
            "I've got you covered.",
          inline: false,
        },
        // เส้นคั่นที่ 2 — กั้นระหว่าง "What I Do" กับ "Get Started"
        DIVIDER,
        // ── field "⚡ Get Started" — รายการ slash command หลักๆ ──────────────
        // ⚠️ ชื่อคำสั่งกับคำอธิบายตรงนี้ต้อง "ตรงกับที่ deploy จริง" เป๊ะๆ — ดึงมาจาก
        // .setName()/.setDescription() จริงในแต่ละไฟล์ commands/*.js (deploy-commands.js
        // เป็นตัวอ่านไฟล์พวกนี้ไปลงทะเบียนกับ Discord จริงๆ) ห้ามพิมพ์ชื่อคำสั่งเดาเอง
        // เพราะถ้าพิมพ์ผิดจะกลายเป็นแนะนำคำสั่งที่ไม่มีจริงให้ผู้ใช้ไปพิมพ์ตาม
        //
        // รวมเป็น field เดียว โดยเขียนแต่ละคำสั่งเป็นบรรทัดในสตริงเดียวกัน (คั่นด้วย \n
        // = ขึ้นบรรทัดใหม่) แทนที่จะแยกเป็นหลาย field เหมือนโครงสร้างเดิม เพื่อให้เข้ากับ
        // ดีไซน์ "1 field ต่อ 1 หัวข้อใหญ่" ตามที่ต้องการ — ใช้ backtick ครอบชื่อคำสั่ง
        // (เช่น `/builder`) ให้ Discord render เป็นตัวอักษร monospace เด่นกว่าตัวหนังสือปกติ
        {
          name: '⚡ Get Started',
          value: [
            '`/builder` — Build custom message layouts', // ตรงกับ commands/builder.js
            '`/role-setup` — Set up automatic role assignment (menu / button / reaction)', // ตรงกับ commands/role-setup.js
            '`/welcome-setup` — Set up new member welcome cards', // ตรงกับ commands/welcome-setup.js
            '`/goodbye-setup` — Set up member farewell cards', // ตรงกับ commands/goodbye-setup.js
            "`/premium` — Manage this server's premium subscription", // ตรงกับ commands/premium.js
          ].join('\n'),
          inline: false,
        }
      )
      // ปิดท้ายด้วยคำแนะนำว่าเริ่มต้นตรงไหนก่อน — /builder เป็นจุดเริ่มต้นที่เข้าใจง่ายสุด
      // สำหรับแอดมินที่เพิ่งเชิญบอทเข้ามาและยังไม่รู้จะเริ่มจากอะไร
      .setFooter({ text: 'Type /builder to get started, or try any command above!' })
  );
}

module.exports = { sendGuildJoinGreeting };