const { PermissionFlagsBits, MessageFlags } = require('discord.js');

// prefix ที่ฝังใน customId ของปุ่ม — ต้องตรงกับที่ buildMessageFromSchema ใช้ตอน render
// รูปแบบ customId: "rolebtn:{roleId}"  เช่น "rolebtn:1234567890123456789"
// เหตุที่ export ออกมา: index.js ต้องใช้ startsWith() กับ prefix นี้เพื่อ routing interaction
const ROLE_BUTTON_PREFIX = 'rolebtn:';

/**
 * เช็คว่า customId นี้เป็นปุ่มยศไหม (ใช้ใน index.js routing)
 * @param {string} customId
 */
function isRoleButton(customId) {
  return customId.startsWith(ROLE_BUTTON_PREFIX);
}

/**
 * แยก roleId ออกมาจาก customId
 * @param {string} customId - เช่น "rolebtn:1234567890123456789"
 * @returns {string} roleId
 */
function extractRoleId(customId) {
  return customId.slice(ROLE_BUTTON_PREFIX.length);
}

/**
 * จัดการ interaction เมื่อมีคนกดปุ่มยศบนข้อความที่โพสต์แล้ว
 * ทำหน้าที่ toggle ยศ (ให้ถ้ายังไม่มี / ถอดถ้ามีอยู่แล้ว)
 *
 * ลำดับการเช็ค (fail-fast: เจออะไรผิดก่อนหยุดทันที ไม่ทำขั้นถัดไป):
 *   1. ดึงข้อมูลยศ — เผื่อยศถูกลบไปหลังจากโพสต์ปุ่มแล้ว
 *   2. เช็ค MANAGE_ROLES permission ของบอท
 *   3. เช็ค role hierarchy — role ที่จะให้ต้องต่ำกว่า highest role ของบอท
 *   4. เช็ค managed role — ยศที่สร้างโดย integration (เช่น Nitro booster) แตะไม่ได้
 *   5. Toggle — มีอยู่แล้วถอด / ยังไม่มีให้
 *   6. try/catch ล้อมทั้งหมด — จับ error ที่ไม่คาดคิด (เช่น rate limit, network)
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleRoleButton(interaction) {
  // ปุ่มนี้ใช้ใน guild เท่านั้น (ไม่รองรับ DM)
  if (!interaction.guild) {
    await interaction.reply({
      content: '❌ ปุ่มนี้ใช้งานได้ในเซิร์ฟเวอร์เท่านั้นค่ะ',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const roleId = extractRoleId(interaction.customId);

  try {
    // ---- ขั้นที่ 1: ดึงข้อมูลยศ ----
    // อ่านจาก cache ก่อน ถ้าไม่มี (เช่น bot เพิ่งเริ่ม) ยิง fetch ไปดึงสด
    let role = interaction.guild.roles.cache.get(roleId);
    if (!role) {
      try {
        role = await interaction.guild.roles.fetch(roleId);
      } catch {
        role = null;
      }
    }

    if (!role) {
      await interaction.reply({
        content: '❌ ยศนี้ไม่มีอยู่ในเซิร์ฟเวอร์แล้วค่ะ (อาจถูกลบไปแล้ว) ติดต่อแอดมินให้อัปเดตปุ่มนี้ด้วยนะคะ',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ---- ขั้นที่ 2: เช็ค MANAGE_ROLES permission ของบอท ----
    // botMember คือข้อมูล member ของตัวบอทเองในเซิร์ฟเวอร์นี้
    const botMember = interaction.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: '❌ บอทไม่มีสิทธิ์ "Manage Roles" ในเซิร์ฟเวอร์นี้ค่ะ ติดต่อแอดมินให้เพิ่มสิทธิ์ให้บอทก่อนนะคะ',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ---- ขั้นที่ 3: เช็ค Role Hierarchy ----
    // Discord กำหนดว่าบอทให้/ถอดได้เฉพาะยศที่อยู่ต่ำกว่า highest role ของตัวบอทเองเท่านั้น
    // highest role = role ที่มีตำแหน่งสูงสุด (position ค่ามาก = อยู่สูง)
    const botHighestPosition = botMember.roles.highest.position;
    if (role.position >= botHighestPosition) {
      await interaction.reply({
        content: `❌ บอทไม่สามารถจัดการยศ **${role.name}** ได้ค่ะ เพราะยศนี้อยู่สูงกว่าหรือเท่ากับยศสูงสุดของบอท ติดต่อแอดมินให้เลื่อนตำแหน่งยศบอทให้สูงกว่านะคะ`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ---- ขั้นที่ 4: เช็ค Managed Role ----
    // managed = ยศที่สร้างโดย integration อื่น (เช่น Nitro Booster, ยศบอทตัวอื่น)
    // Discord API จะปฏิเสธถ้าพยายาม add/remove managed role ของคนอื่น
    if (role.managed) {
      await interaction.reply({
        content: `❌ ยศ **${role.name}** ถูกจัดการโดยระบบอัตโนมัติค่ะ ให้/ถอดด้วยปุ่มนี้ไม่ได้`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ---- ขั้นที่ 5: ดึงข้อมูล member ของคนที่กดปุ่ม แล้ว Toggle ----
    const member = interaction.guild.members.cache.get(interaction.user.id)
      ?? await interaction.guild.members.fetch(interaction.user.id);

    const hasRole = member.roles.cache.has(roleId);

    if (hasRole) {
      await member.roles.remove(role);
      await interaction.reply({
        content: `✅ ถอดยศ **${role.name}** แล้วค่ะ`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await member.roles.add(role);
      await interaction.reply({
        content: `✅ ได้รับยศ **${role.name}** แล้วค่ะ`,
        flags: MessageFlags.Ephemeral,
      });
    }

  } catch (error) {
    // ---- ขั้นที่ 6: จับ error ที่ไม่คาดคิด ----
    // log เก็บไว้สำหรับ debug แต่ไม่โชว์ technical detail ให้ผู้ใช้เห็น
    console.error('[handleRoleButton] error:', error);
    await interaction.reply({
      content: '❌ เกิดข้อผิดพลาดขึ้นค่ะ กรุณาลองใหม่อีกครั้ง ถ้ายังไม่ได้ติดต่อแอดมินด้วยนะคะ',
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { isRoleButton, handleRoleButton, ROLE_BUTTON_PREFIX };