// utils/discordAuth.js
// ─────────────────────────────────────────────────────────────────────────
// ไฟล์นี้รวม "ฟังก์ชันคุยกับ Discord OAuth2" ไว้ที่เดียว แยกออกมาจาก server.js
// เพราะ server.js มีหน้าที่เยอะอยู่แล้ว (webhook Stripe + เสิร์ฟเว็บ) ไม่อยากให้ยาวเกินไป
// จนอ่านยาก — ไฟล์นี้ไม่รู้จัก Express เลยด้วยซ้ำ (ไม่มี req/res) มีหน้าที่แค่ "คุยกับ
// Discord API ตรงๆ" อย่างเดียว ส่วน server.js จะเป็นคนเรียกใช้ฟังก์ชันพวกนี้อีกที
//
// OAuth2 คืออะไร (อธิบายสั้นๆ ให้เข้าใจภาพรวมก่อนอ่านโค้ดข้างล่าง)?
// ปกติเวลาคนกด "เข้าสู่ระบบด้วย Discord" บนเว็บเรา เว็บเรา "ไม่มีทางรู้รหัสผ่าน Discord
// ของเขาเลย" (และไม่ควรรู้ด้วย อันตรายมาก) สิ่งที่เกิดขึ้นจริงคือ:
//   1) เว็บเราพาผู้ใช้ไปหน้า Discord เอง (discord.com) ให้เขา login/ยืนยันตัวตนที่นั่น
//   2) Discord ถามผู้ใช้ว่า "อนุญาตให้เว็บนี้เห็นชื่อ/รูป/รายชื่อเซิร์ฟของคุณไหม"
//   3) ถ้าเขากด "อนุญาต" Discord จะ "ส่งผู้ใช้กลับมาที่เว็บเรา" พร้อมรหัสลับสั้นๆ
//      อันหนึ่ง (เรียกว่า "code") ติดมาใน URL
//   4) เว็บเรา (ฝั่ง server เท่านั้น ห้ามฝั่ง browser) เอา code นั้นไปแลกกับ Discord
//      อีกทีเพื่อขอ "access token" — token ตัวนี้แหละที่เราจะเอาไปใช้ถามข้อมูล
//      ผู้ใช้ (ชื่อ, รายชื่อเซิร์ฟ) ได้โดยไม่ต้องรู้รหัสผ่านเขาเลย
// ─────────────────────────────────────────────────────────────────────────

// Discord API มีหลายเวอร์ชัน (v9, v10, ...) ใส่เลขเวอร์ชันตรงๆ ใน URL กันเผื่อ Discord
// เปลี่ยน default version ในอนาคตแล้วโค้ดเราพังแบบไม่รู้ตัว — v10 คือเวอร์ชันล่าสุดตอนนี้
const DISCORD_API_BASE = 'https://discord.com/api/v10';

// สิทธิ์ (scope) ที่เราขอจากผู้ใช้ตอน login — ขอแค่เท่าที่ใช้จริงเท่านั้น (หลักการเดียวกับ
// ที่ buildInviteUrl() ใน help.js ขอสิทธิ์บอทแค่เท่าที่จำเป็น ไม่ขอ Administrator)
//   - identify → ขอดู id/username/avatar ของผู้ใช้ (เพื่อโชว์ชื่อ "สวัสดีคุณ ... " บนเว็บ)
//   - guilds   → ขอดู "รายชื่อเซิร์ฟที่ผู้ใช้เป็นสมาชิกอยู่" (เพื่อเอามากรองว่าเซิร์ฟไหน
//                ที่เขามีสิทธิ์ Manage Server และมีบอทเราอยู่ด้วย ถึงจะโชว์ในหน้า
//                Server Picker ได้ — ดู hasManageGuild() ด้านล่าง)
// ⚠️ ไม่ขอ scope "bot" ซ้ำตรงนี้เด็ดขาด — "bot" scope คือตอนเชิญบอทเข้าเซิร์ฟ (ปุ่ม
// "Invite" ใน help.js ใช้ scope นี้อยู่แล้ว) คนละเรื่องกับ "คนกด login เข้าเว็บ" เลย
// ถ้าขอ scope "bot" ตรงนี้ด้วย จะกลายเป็นเปิดหน้าต่าง "เชิญบอทเข้าเซิร์ฟ" ผิดจังหวะ
const OAUTH_SCOPES = ['identify', 'guilds'];

// บิต (bit) ของสิทธิ์ "Manage Server" ใน Discord permission bitfield — เป็นค่าคงที่ตายตัว
// ที่ Discord กำหนดไว้ (ดูเอกสาร Discord: MANAGE_GUILD = 1 << 5 = 32 = 0x20)
// permissions ที่ Discord ส่งกลับมาต่อเซิร์ฟหนึ่งๆ ตอนเรียก /users/@me/guilds เป็น
// "string ตัวเลข" ของผลรวมสิทธิ์ทั้งหมดที่ผู้ใช้มีในเซิร์ฟนั้น (บวกกันด้วยเลขฐาน 2)
// วิธีเช็คว่า "มีบิตนี้รวมอยู่ไหม" คือเอาเลขทั้งก้อนมา bitwise AND กับเลขบิตที่สนใจ
// ถ้าได้ผลลัพธ์ไม่ใช่ 0 แปลว่ามีสิทธิ์นั้นรวมอยู่จริง (เป็นเทคนิคมาตรฐานของ bitfield
// ไม่ใช่อะไรซับซ้อน ลองนึกภาพสวิตช์ไฟหลายดวงในเลขเดียวก็ได้)
const MANAGE_GUILD_BIT = 0x20;

/**
 * สร้าง URL หน้า "อนุญาต" ของ Discord ที่จะพาผู้ใช้ไปตอนกดปุ่ม "เข้าสู่ระบบด้วย Discord"
 * (นี่คือขั้นตอนที่ 1 ในคอมเมนต์ใหญ่ด้านบนไฟล์)
 *
 * @param {string} redirectUri URL ที่ Discord ต้อง "ส่งผู้ใช้กลับมา" หลังกดอนุญาต — ต้อง
 *   ตรงกับที่ตั้งไว้ใน Discord Developer Portal เป๊ะๆ ตัวอักษรเดียวก็ผิดไม่ได้ (Discord เช็คเข้ม)
 * @param {string} state รหัสสุ่มกันปลอมแปลง (CSRF) — ดูคำอธิบายเต็มๆ ที่จุดสร้าง state ใน server.js
 * @returns {string}
 */
function buildAuthorizeUrl(redirectUri, state) {
  // URLSearchParams ช่วย encode ค่าพวกนี้ให้ปลอดภัยเป็น URL ให้เอง (เช่นเว้นวรรค,
  // อักขระพิเศษ) ไม่ต้องมานั่ง encodeURIComponent() ทีละตัวเอง
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code', // บอก Discord ว่าเราต้องการ "authorization code flow" (มาตรฐานที่ปลอดภัยสุดสำหรับเว็บที่มี server ฝั่งหลังบ้าน)
    scope: OAUTH_SCOPES.join(' '), // Discord ต้องการ scope คั่นด้วยเว้นวรรค ไม่ใช่ comma
    state,
    prompt: 'consent', // บังคับโชว์หน้า "อนุญาต" ทุกครั้ง (ไม่ auto-skip) กันความสับสนตอนทดสอบ
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

/**
 * ขั้นตอนที่ 4 ในคอมเมนต์ใหญ่ด้านบนไฟล์: เอา "code" ที่ได้จาก Discord (ผ่าน query string
 * ตอน Discord ส่งผู้ใช้กลับมาที่ /auth/callback) ไปแลกเป็น "access token" จริง
 *
 * ⚠️ ฟังก์ชันนี้ต้องเรียกจากฝั่ง server เท่านั้น (เหมือนที่ทำอยู่ใน server.js) เพราะต้องส่ง
 * CLIENT_SECRET ไปด้วย ซึ่งเป็นความลับสุดยอด ถ้ารั่วไปฝั่ง browser ใครก็เอาไปปลอมเป็น
 * บอทเราคุยกับ Discord ได้ทันที (คนละเรื่องกับ DISCORD_TOKEN ของบอทเองที่ลับอยู่แล้ว)
 *
 * @param {string} code รหัสจาก Discord (ใช้ได้ครั้งเดียว หมดอายุเร็วมาก ~นาทีเดียว)
 * @param {string} redirectUri ต้องส่งค่า "เดียวกันเป๊ะ" กับตอนสร้าง authorize URL ข้างบน
 *   (Discord บังคับเช็คตรงนี้ด้วยเหตุผลความปลอดภัย ถ้าไม่ตรงจะแลก token ไม่ผ่าน)
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number, refresh_token: string, scope: string}>}
 */
async function exchangeCodeForToken(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  // Discord token endpoint ต้องการ content-type แบบฟอร์ม (x-www-form-urlencoded)
  // ไม่ใช่ JSON — นี่คือมาตรฐาน OAuth2 (RFC 6749) ไม่ใช่เรื่องเฉพาะของ Discord
  const res = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    // อ่าน error message จริงจาก Discord มาด้วย ช่วยเวลา debug เยอะมาก (ไม่งั้นจะเห็นแค่
    // "401" เฉยๆ ไม่รู้ว่าเพราะ client secret ผิด หรือ redirect_uri ไม่ตรง หรืออะไร)
    const errorText = await res.text();
    throw new Error(`แลก access token ไม่สำเร็จ (${res.status}): ${errorText}`);
  }

  return res.json();
}

/**
 * ดึงข้อมูลโปรไฟล์ผู้ใช้ที่ login อยู่ (ต้องมี scope "identify")
 * @param {string} accessToken
 * @returns {Promise<{id: string, username: string, avatar: string|null, global_name: string|null}>}
 */
async function fetchCurrentUser(accessToken) {
  const res = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    // "Bearer" คือรูปแบบมาตรฐานของการส่ง access token แนบไปกับ request — บอก Discord
    // ว่า "นี่คือ token ที่ผู้ใช้อนุญาตให้ฉันใช้แทนตัวเขาได้" (คนละแบบกับตอนบอทคุยกับ
    // Discord ปกติที่ใช้ "Bot TOKEN" — อันนี้ใช้ "Bearer TOKEN" แทน)
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`ดึงข้อมูลผู้ใช้ไม่สำเร็จ (${res.status})`);
  return res.json();
}

/**
 * ดึง "รายชื่อเซิร์ฟที่ผู้ใช้เป็นสมาชิกอยู่" ทั้งหมด (ต้องมี scope "guilds")
 * แต่ละเซิร์ฟในลิสต์นี้มี field "permissions" (string ตัวเลข bitfield) ติดมาด้วย —
 * ใช้ hasManageGuild() ด้านล่างเช็คว่าเซิร์ฟไหนที่เขาเป็นแอดมิน (Manage Server) บ้าง
 *
 * ⚠️ ลิสต์นี้เป็น "ทุกเซิร์ฟที่เขาอยู่" ไม่ใช่แค่เซิร์ฟที่มีบอทเราอยู่ด้วย — ต้องเอาไป
 * เทียบกับ client.guilds.cache ของบอทเราเองอีกทีตอนจะโชว์หน้า Server Picker (ทำใน
 * ขั้นตอนถัดไปตอนสร้างหน้า Server Picker จริง ไม่ใช่หน้าที่ของไฟล์นี้)
 * @param {string} accessToken
 * @returns {Promise<Array<{id: string, name: string, icon: string|null, owner: boolean, permissions: string}>>}
 */
async function fetchUserGuilds(accessToken) {
  const res = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`ดึงรายชื่อเซิร์ฟไม่สำเร็จ (${res.status})`);
  return res.json();
}

/**
 * เช็คว่า permissions bitfield (string ตัวเลขที่ Discord ส่งมา) มีสิทธิ์ Manage Server
 * รวมอยู่ไหม — ใช้ตัดสินใจว่าจะให้ผู้ใช้คนนี้ "เห็น/แก้ไขการตั้งค่า" ของเซิร์ฟนี้ได้หรือเปล่า
 *
 * ⚠️ สำคัญมาก (ตามที่เขียนไว้ในเอกสาร milo-bot-ai-build-prompt.md ข้อ 4.2): ฟังก์ชันนี้
 * ต้องถูกเรียก "ฝั่ง server" ทุกครั้งก่อนจะยอมให้แก้ไขข้อมูลเซิร์ฟไหนก็ตาม ห้ามเชื่อแค่
 * ฝั่ง frontend เด็ดขาด เพราะ frontend (โค้ดที่รันในเบราว์เซอร์ผู้ใช้) ถูกแก้ไข/ปลอมแปลง
 * ได้ง่ายมากผ่าน DevTools — เช็คฝั่งเดียวที่เชื่อถือได้คือฝั่ง server เท่านั้น
 *
 * @param {string} permissionsField ค่า permissions ที่ได้จาก fetchUserGuilds() ต่อเซิร์ฟหนึ่ง
 * @returns {boolean}
 */
function hasManageGuild(permissionsField) {
  // BigInt เพราะ permission bitfield ของ Discord อาจมีค่าใหญ่เกินกว่าที่ number ปกติของ
  // JavaScript จะเก็บได้แม่นยำ (number ปกติแม่นยำสุดแค่ 2^53 แต่ permission bitfield
  // ใช้เกือบทุกบิตของเลข 53+ บิต) — Number ธรรมดาเสี่ยงปัดเศษผิดจนเช็คสิทธิ์พลาดได้
  const permissionsBigInt = BigInt(permissionsField ?? '0');
  return (permissionsBigInt & BigInt(MANAGE_GUILD_BIT)) !== 0n;
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchCurrentUser,
  fetchUserGuilds,
  hasManageGuild,
};