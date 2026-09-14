// server.js
// ─────────────────────────────────────────────────────────────────────────
// Express server เล็กๆ ที่ตอนนี้มีหน้าที่ 3 อย่าง:
//   1) รับ "webhook" จาก Stripe (ของเดิม)
//   2) เสิร์ฟหน้าเว็บ Landing Page ของ Aitao Bot (ของเดิม)
//   3) 🆕 ระบบ "เข้าสู่ระบบด้วย Discord" (OAuth2) — ฐานรากของ Dashboard ที่กำลังจะสร้างต่อ
//
// webhook คืออะไร? — ปกติตอนลูกค้าจ่ายเงินสำเร็จ Discord bot ของเราไม่มีทางรู้เองเลย
// เพราะเงินมันวิ่งไปที่ Stripe ไม่ได้วิ่งผ่านบอทเรา ดังนั้น Stripe จะ "ยิง HTTP request"
// มาบอกเราเองทุกครั้งที่มีเหตุการณ์สำคัญเกิดขึ้น (จ่ายเงินสำเร็จ / ยกเลิก / ต่ออายุ ฯลฯ)
// server.js คือ "จุดรับสาย" ของ request พวกนั้น
//
// ⚠️ ต้องรันคู่กับบอท (ไม่ใช่คนละโปรเจกต์แยกกัน) เพราะพอ webhook มาถึง เราต้อง
// เข้าถึง client (Discord bot instance ตัวเดียวกับที่ล็อกอินอยู่) เพื่อส่ง DM แจ้งเตือน
// ผู้ใช้ทันทีตอนสมัครพรีเมียมสำเร็จ (ดู case checkout.session.completed ด้านล่าง)
//
// เว็บไซต์: ใช้ Express server ตัวเดียวกันนี้แหละเสิร์ฟหน้าเว็บ Landing Page ด้วยเลย
// ไม่ต้องไปเปิดเซิร์ฟเวอร์ใหม่แยกต่างหาก เพราะ Railway รันแค่โปรเจกต์เดียวอยู่แล้ว
// (ประหยัดค่าใช้จ่าย ไม่ต้องจ่ายเพิ่ม) — ไฟล์ HTML/CSS/JS ของเว็บอยู่ในโฟลเดอร์
// public/ ทั้งหมด ดูคอมเมนต์ตรง app.use(express.static(...)) ด้านล่างสำหรับรายละเอียด
//
// 🆕 Dashboard (เพิ่มใหม่วันนี้ — ขั้นที่ 1 จาก 10 ขั้นของแผนสร้าง Dashboard):
// เพิ่มระบบ "เข้าสู่ระบบด้วย Discord" (OAuth2) เข้ามา เพราะทุกหน้าของ Dashboard (Server
// Picker, การ์ดต้อนรับ, ฟอนต์ ฯลฯ) ต้อง "รู้ก่อนว่าใคร login อยู่ และมีสิทธิ์แก้เซิร์ฟไหนได้
// บ้าง" ถึงจะสร้างหน้าอื่นต่อได้ เลยต้องทำส่วนนี้เป็นอันดับแรกสุด — โค้ดที่คุยกับ Discord
// OAuth2 API ตรงๆ (แลก token, ดึงข้อมูลผู้ใช้/รายชื่อเซิร์ฟ) แยกไว้ในไฟล์
// utils/discordAuth.js แล้ว ไฟล์นี้มีหน้าที่แค่ "ผูก route" เข้ากับฟังก์ชันพวกนั้น
// ─────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const { TextDisplayBuilder, MessageFlags } = require('discord.js');
const stripe = require('./utils/stripeClient');
const { setGuildTier, getGuildTier, setSubscriptionInfo, getSubscriptionInfo } = require('./utils/tierManager');
const { getGuildLanguage } = require('./utils/languageStorage');
const { createTranslator } = require('./utils/i18n');
// 🆕 หน้า Overview ของแดชบอร์ด (task #15) — เช็กลิสต์เริ่มต้นใช้งาน 6 ข้อ + พรีวิวการ์ด
// ต้อนรับ/บอกลาแบบเรนเดอร์สดจริง ใช้ storage module พวกนี้เช็คว่าแต่ละข้อ "เสร็จหรือยัง"
// จากข้อมูลจริงของเซิร์ฟ (ไม่มีตรงไหน hardcode) ดูรายละเอียดเหตุผลแต่ละจุดในคอมเมนต์หัวไฟล์
// utils/renderOverview.js
const { renderOverviewPage } = require('./utils/renderOverview');
const { renderComingSoonPage } = require('./utils/dashboardShell');
const { loadWelcomeConfig } = require('./utils/welcomeStorage');
const { loadGoodbyeConfig } = require('./utils/goodbyeStorage');
const { getGuildFonts } = require('./utils/fontStorage');
const { listSetups } = require('./utils/roleSetupStorage');
const { listDrafts } = require('./utils/builderStorage');
const { generateMemberCardImage } = require('./utils/generateMemberCardImage');
// การ์ดพรีเมียมตัวเดียวกับที่ /premium ใช้ (ดูคอมเมนต์ในไฟล์นั้นสำหรับเหตุผล
// ที่แยกออกมาเป็น util กลาง) เอามาใช้ตรงนี้เพื่อให้ DM แจ้งเตือนตอนสมัคร
// สำเร็จ หน้าตาตรงกับการ์ดใน /premium เป๊ะๆ ไม่ต้องคอยแก้พร้อมกัน 2 ที่
const { buildPremiumCard } = require('./utils/buildPremiumCard');
// 🆕 ฟังก์ชันคุยกับ Discord OAuth2 API — ดูคำอธิบายละเอียดทุกฟังก์ชันในไฟล์นั้นเลย
const {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchCurrentUser,
  fetchUserGuilds,
  hasManageGuild,
} = require('./utils/discordAuth');
// 🆕 หน้า Server Picker (การ์ดกริดเลือกเซิร์ฟหลัง login) — แยกไว้คนละไฟล์เพราะเป็น
// โค้ดสร้าง HTML ล้วนๆ ยาวๆ ไม่อยากให้ server.js (ที่จัดการ route) ยาวเทอะทะเกินไป
// ดูคำอธิบายเต็มๆ ในไฟล์นั้นเลย
const { renderServerPickerPage } = require('./utils/renderServerPicker');
// 🆕 ใช้ buildInviteUrl() ตัวเดียวกับที่ /help ใช้สร้างลิงก์เชิญบอท — ไม่เขียนซ้ำใหม่
// ที่นี่ เพราะถ้าวันหน้ามีคนไปแก้สิทธิ์ที่บอทขอตอนเชิญ (invitePermissions ใน help.js)
// จะได้แก้จุดเดียวแล้วสองที่นี้อัปเดตตามกันอัตโนมัติ ไม่ต้องมาคอยจำว่าต้องแก้ 2 จุด
const { buildInviteUrl } = require('./commands/help');

// 🆕 โดเมนจริงของเว็บเรา — ใช้สร้าง "redirect_uri" ตอนคุยกับ Discord OAuth2 (Discord
// บังคับว่าต้องส่งค่าเดียวกันเป๊ะทั้งตอนขอ authorize และตอนแลก token ดูคอมเมนต์ใน
// discordAuth.js) อ่านจาก environment variable PUBLIC_BASE_URL ก่อน เผื่ออยากทดสอบบนเครื่อง
// ตัวเอง (local) ที่ไม่ใช่โดเมน Railway จริง — ถ้าไม่ได้ตั้งไว้ fallback เป็นโดเมน production
// จริงตามที่บันทึกไว้ใน claude/production-deployment-notes.md (แบบเดียวกับที่ premium.js
// hardcode success_url/cancel_url ไว้ตรงๆ อยู่แล้ว — ที่นี่แค่เผื่อไว้ให้ปรับตอน dev ได้ด้วย)
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://aitao-bot-production.up.railway.app';
const OAUTH_REDIRECT_URI = `${PUBLIC_BASE_URL}/auth/callback`;

/**
 * สร้าง Express app พร้อม route /webhook ไว้รับ Stripe + เสิร์ฟหน้าเว็บ Landing Page
 * + ระบบเข้าสู่ระบบด้วย Discord
 * @param {import('discord.js').Client} client Discord bot client ตัวเดียวกับที่ล็อกอินอยู่
 * @returns {import('express').Express}
 */
function createWebhookServer(client) {
  const app = express();

  // 🆕 บอก Express ว่า "เรารันอยู่หลัง reverse proxy" (Railway เอง) — จำเป็นมากสำหรับ
  // cookie แบบ secure (ดู session middleware ด้านล่าง) เพราะ Railway จะเป็นคนคุยกับ
  // ผู้ใช้ด้วย HTTPS จริง แล้วค่อย forward request มาหา process ของเราด้วย HTTP ธรรมดา
  // ข้างใน — ถ้าไม่ตั้งค่านี้ Express จะคิดว่า request ทุกอันเป็น HTTP (ไม่ปลอดภัย)
  // แล้วปฏิเสธไม่ยอมส่ง cookie แบบ secure ออกไปเลย ผู้ใช้จะ login ไม่ติดสักที
  app.set('trust proxy', 1);

  // ─────────────────────────────────────────────────────────────────────
  // เสิร์ฟหน้าเว็บ Landing Page (static file) — ทำก่อนอย่างอื่นเลย
  //
  // express.static() คือฟังก์ชันสำเร็จรูปของ Express ที่บอกว่า "โฟลเดอร์นี้มีไฟล์
  // HTML/CSS/JS/รูปภาพอยู่ ถ้ามีคนเข้า URL ที่ตรงกับชื่อไฟล์ในนี้ ให้ส่งไฟล์นั้นกลับไปเลย"
  // ไม่ต้องมานั่งเขียน app.get('/xxx', ...) ทีละหน้าเองแบบ /success กับ /cancel ด้านล่าง
  //
  // path.join(__dirname, 'public') = โฟลเดอร์ public/ ที่อยู่ "ข้างๆ" ไฟล์นี้เลย
  // (server.js เองอยู่ที่ root ของโปรเจกต์ เหมือนกับ index.js — เห็นได้จากที่ index.js
  // เรียก require('./server') ตรงๆ ไม่มี subfolder — ก็เลยแค่ path.join(__dirname, 'public')
  // พอ ไม่ต้องถอยระดับด้วย '..' เหมือนตอนที่เข้าใจผิดว่า server.js อยู่ใน utils/)
  //
  // options ที่ใส่ไว้ 2 ตัว:
  //   - index: 'index.html'  → ถ้าเข้า "/" เฉยๆ (ไม่ระบุไฟล์) ให้เสิร์ฟ index.html
  //   - extensions: ['html'] → ถ้าเข้า "/terms" (ไม่มี .html ต่อท้าย) ให้ลองหา
  //                             terms.html ให้อัตโนมัติ (URL จะได้สั้นๆ สวยๆ ไม่ต้อง
  //                             พิมพ์ .html ต่อท้ายทุกครั้ง)
  //
  // ผลลัพธ์ที่ได้:
  //   GET /         → public/index.html   (หน้าแรกของเว็บ)
  //   GET /terms    → public/terms.html   (ข้อกำหนดการใช้งาน)
  //   GET /privacy  → public/privacy.html (นโยบายความเป็นส่วนตัว)
  app.use(express.static(path.join(__dirname, 'public'), {
    index: 'index.html',
    extensions: ['html'],
  }));

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 Session middleware — ต้องมาก่อน route /auth/* ทุกอัน (และก่อนหน้า dashboard
  // อื่นๆ ในอนาคตด้วย) เพราะ route พวกนั้นต้องอ่าน/เขียน req.session ได้
  //
  // session คืออะไร (อธิบายสั้นๆ)? HTTP ปกติ "จำอะไรไม่ได้เลย" แต่ละ request ที่เข้ามา
  // ถือเป็นคนละเรื่องกันหมด — express-session แก้ปัญหานี้โดย: พอมีคน login สำเร็จ
  // เราเก็บข้อมูล (เช่น "คนนี้คือใคร") ไว้ในหน่วยความจำฝั่ง server แล้วส่ง "รหัสอ้างอิง"
  // สั้นๆ กลับไปเก็บไว้ในคุกกี้ (cookie) ของเบราว์เซอร์ผู้ใช้ ทุก request ถัดไปเบราว์เซอร์
  // จะแนบคุกกี้นั้นมาด้วยอัตโนมัติ เราก็เอารหัสอ้างอิงไปเปิดดูข้อมูลที่เก็บไว้ได้ — ผู้ใช้
  // เลย "ยังคง login อยู่" ต่อเนื่องข้ามหลาย request โดยไม่ต้อง login ใหม่ทุกครั้ง
  //
  // ⚠️ ข้อจำกัดที่ตั้งใจ "ยังไม่แก้ตอนนี้" (บอกไว้ตรงๆ ไม่ปิดบัง): ตอนนี้ session เก็บไว้ใน
  // หน่วยความจำ (MemoryStore ค่า default ของ express-session) แปลว่าทุกครั้งที่ Railway
  // restart/redeploy บอท ผู้ใช้ทุกคนจะหลุด login หมด ต้อง login ใหม่ — ยอมรับได้ในช่วงเริ่มต้น
  // นี้ ถ้าจะแก้ทีหลังให้ session อยู่ทนกว่านี้ ต้องเปลี่ยนไปใช้ store แบบอื่น (เช่นไฟล์ หรือ
  // Redis) แต่ยังไม่จำเป็นตอนนี้ ไว้ค่อยว่ากันถ้าผู้ใช้บ่นเรื่อง login หลุดบ่อยจริงๆ
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    // ไม่ throw error หยุดทั้งบอท เพราะ webhook/บอทยังทำงานได้ปกติแม้ dashboard จะมีปัญหา
    // แค่เตือนไว้ให้เห็นชัดๆ ใน log — ถ้าไม่ตั้ง SESSION_SECRET ไว้ใน Railway เราจะสุ่ม
    // ความลับใหม่ทุกครั้งที่บอทเริ่มทำงาน (ปลอดภัยกว่าใช้ค่า default ที่เดาได้ แต่แปลว่า
    // ผู้ใช้จะหลุด login ทุกครั้งที่ redeploy เหมือนกัน — แนะนำให้ไปตั้ง SESSION_SECRET
    // เป็นข้อความสุ่มยาวๆ ไว้ใน Railway Variables จริงจัง)
    console.warn('[dashboard] ยังไม่ได้ตั้ง SESSION_SECRET ไว้ใน environment — สุ่มความลับชั่วคราวไปก่อน (ผู้ใช้จะหลุด login ทุกครั้งที่ redeploy)');
  }
  app.use(session({
    secret: sessionSecret || crypto.randomBytes(32).toString('hex'),
    resave: false, // ไม่ต้องเขียน session ซ้ำถ้าไม่มีอะไรเปลี่ยน (ลดภาระ server)
    saveUninitialized: false, // ไม่สร้าง session เปล่าๆ ให้คนที่ยังไม่ login (กันคุกกี้รก + กัน spam session ว่างๆ)
    cookie: {
      httpOnly: true, // กัน JavaScript ฝั่งเบราว์เซอร์อ่านคุกกี้นี้ได้ (กัน XSS ขโมย session)
      // secure: true = คุกกี้จะถูกส่งเฉพาะผ่าน HTTPS เท่านั้น — Railway production เป็น
      // HTTPS อยู่แล้วเสมอ แต่ถ้า dev บนเครื่องตัวเอง (http://localhost) มักไม่มี HTTPS
      // เลยต้องปิดไว้ตอน dev ไม่งั้นคุกกี้จะไม่ถูกส่งเลยจน login ไม่ติดสักที
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // ค่ามาตรฐานที่ปลอดภัยและใช้ได้กับ flow OAuth redirect แบบนี้พอดี
      maxAge: 7 * 24 * 60 * 60 * 1000, // คุกกี้อยู่ได้ 7 วัน (ตรงกับอายุ access token ของ Discord ที่ประมาณ 7 วันเช่นกัน)
    },
  }));

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 ระบบเข้าสู่ระบบด้วย Discord (OAuth2) — 3 route: login / callback / logout
  // ─────────────────────────────────────────────────────────────────────

  // GET /auth/login — จุดเริ่มต้น: ผู้ใช้กดปุ่ม "เข้าสู่ระบบด้วย Discord" แล้วมาที่นี่
  app.get('/auth/login', (req, res) => {
    // state คือรหัสสุ่มกันปลอมแปลง (ป้องกันการโจมตีแบบ CSRF) — เก็บไว้ใน session ของเรา
    // ก่อนพาผู้ใช้ไปหน้า Discord แล้วพอ Discord ส่งผู้ใช้กลับมาที่ /auth/callback เราจะ
    // เช็คว่า state ที่ส่งกลับมาตรงกับอันที่เราเก็บไว้ไหม ถ้าไม่ตรง = ปฏิเสธทันที เพราะแปลว่า
    // request นี้อาจไม่ได้มาจาก flow ที่เราเป็นคนเริ่มเองจริงๆ (เช่นมีคนปลอมลิงก์ callback
    // ส่งให้เหยื่อกดโดยไม่ผ่านหน้า login ของเราก่อน)
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    res.redirect(buildAuthorizeUrl(OAUTH_REDIRECT_URI, state));
  });

  // GET /auth/callback — Discord ส่งผู้ใช้กลับมาที่นี่หลังเขากด "อนุญาต" ในหน้า Discord
  app.get('/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;

    // ผู้ใช้กด "ยกเลิก/ไม่อนุญาต" ในหน้า Discord — Discord จะส่งกลับมาพร้อม ?error=access_denied
    // แทนที่จะมี code เลย ต้องเช็คก่อนอย่างอื่น
    if (error) {
      return res.redirect('/?login=cancelled');
    }

    // เช็ค state ก่อนทำอะไรทั้งนั้น (ดูคำอธิบายเต็มๆ ที่ /auth/login ด้านบน)
    if (!state || state !== req.session.oauthState) {
      console.warn('[auth] state ไม่ตรงกัน (อาจเป็นการโจมตีแบบ CSRF หรือ session หมดอายุ)');
      return res.status(400).send('Login failed (invalid state). Please try again.');
    }
    // ใช้ครั้งเดียวแล้วลบทิ้ง กัน state เดิมถูกเอาไปใช้ซ้ำ
    delete req.session.oauthState;

    if (!code) {
      return res.status(400).send('Login failed (no code received from Discord).');
    }

    try {
      // ขั้นที่ 4 (ตามคอมเมนต์ใหญ่ใน discordAuth.js): เอา code ไปแลก access token จริง
      const tokenData = await exchangeCodeForToken(code, OAUTH_REDIRECT_URI);

      // เอา access token ไปถามข้อมูลผู้ใช้ + รายชื่อเซิร์ฟ (ยิงคู่ขนานกันด้วย Promise.all
      // เร็วกว่ายิงทีละอันตามลำดับ เพราะสองคำขอนี้ไม่ได้ขึ้นกับกันและกันเลย)
      const [discordUser, guilds] = await Promise.all([
        fetchCurrentUser(tokenData.access_token),
        fetchUserGuilds(tokenData.access_token),
      ]);

      // เก็บเฉพาะข้อมูลที่ต้องใช้จริงลง session — ไม่เก็บ access_token ไว้ใน session
      // เพราะ session ของเราตอนนี้เก็บในหน่วยความจำ (ดูคอมเมนต์ตอนตั้ง session middleware)
      // และหน้าที่ต้องใช้ตอนนี้ (Server Picker) ใช้แค่รายชื่อเซิร์ฟ+สิทธิ์เท่านั้น ยังไม่ต้อง
      // เรียก Discord API ซ้ำด้วย access token อีก — ถ้าอนาคตมีหน้าที่ต้องเรียกซ้ำ (เช่น
      // รีเฟรชรายชื่อเซิร์ฟสดๆ) ค่อยกลับมาคิดเรื่องเก็บ/รีเฟรช token ตอนนั้น
      req.session.user = {
        id: discordUser.id,
        username: discordUser.global_name || discordUser.username, // global_name = ชื่อที่โชว์ (display name) ใหม่ของ Discord, username = fallback เผื่อไม่มี
        avatar: discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
          : null, // ผู้ใช้ที่ไม่เคยตั้งรูปโปรไฟล์จะได้ avatar เป็น null — หน้า Server Picker ต้องมีรูป default สำรองไว้เอง
      };
      // เก็บเฉพาะ field ที่จำเป็น ไม่เก็บทั้งก้อนที่ Discord ส่งมา (ลดขนาด session +
      // ไม่เก็บข้อมูลที่ไม่ได้ใช้โดยไม่จำเป็น)
      req.session.guilds = guilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner,
        permissions: g.permissions,
      }));

      console.log(`[auth] ${req.session.user.username} (${req.session.user.id}) เข้าสู่ระบบสำเร็จ — มีเซิร์ฟทั้งหมด ${guilds.length} แห่ง`);

      // 🚧 ยังไม่มีหน้า Server Picker จริง (ขั้นตอนถัดไป) — พาไปหน้าทดสอบชั่วคราวก่อน
      // เพื่อให้เช็คได้ว่า OAuth2 flow ทั้งเส้นทำงานถูกต้องจริงๆ ก่อนไปสร้างหน้าสวยๆ ต่อ
      res.redirect('/dashboard');
    } catch (err) {
      console.error('[auth] เข้าสู่ระบบล้มเหลว:', err);
      res.status(500).send('Login failed. Please try again. (Check the server logs for details.)');
    }
  });

  // GET /auth/logout — ออกจากระบบ: ทำลาย session ทิ้งทั้งก้อน แล้วพากลับหน้าแรก
  app.get('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) console.error('[auth] logout error:', err);
      res.redirect('/');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 GET /dashboard — หน้า Server Picker จริง (ขั้นที่ 2 จาก 10 ของแผน Dashboard)
  //
  // logic หลักคือ 3 ขั้นตอน:
  //   1) กรอง req.session.guilds (ทุกเซิร์ฟที่ผู้ใช้เป็นสมาชิกอยู่ — เก็บไว้ตอน login
  //      ใน /auth/callback ด้านบน) ให้เหลือแค่เซิร์ฟที่เขามีสิทธิ์ "Manage Server" เท่านั้น
  //      (ตามที่ milo-bot-design-brief.md ข้อ 3.2 กำหนดไว้ — เซิร์ฟที่เขาแค่เป็นสมาชิก
  //      ธรรมดาไม่ควรโผล่ในหน้านี้ เพราะเขาไม่มีสิทธิ์ตั้งค่าอะไรอยู่แล้ว)
  //   2) เอาแต่ละเซิร์ฟที่เหลือ ไปเทียบกับ client.guilds.cache (แคชเซิร์ฟทั้งหมดที่บอท
  //      ตัวเองอยู่จริงๆ ตอนนี้ — อ่านจาก cache ในหน่วยความจำ ไม่ยิง API เพิ่ม เร็วมาก)
  //      ว่า "บอทอยู่ในเซิร์ฟนี้ด้วยไหม" ถ้าอยู่ ก็ดึงจำนวนสมาชิกจริง + สถานะ Free/Premium
  //      จริงจาก tierManager มาด้วยเลย ถ้าไม่อยู่ ก็ทำเครื่องหมายไว้ให้โชว์ปุ่ม "เชิญบอท" แทน
  //   3) เรียง (sort) ให้เซิร์ฟที่มีบอทอยู่แล้วขึ้นก่อนเสมอ (ใช้งานได้เลย สำคัญกว่า) แล้ว
  //      ค่อยเป็นเซิร์ฟที่ยังไม่มีบอท ต่อท้าย เรียงตามตัวอักษรในแต่ละกลุ่มให้หาง่าย
  //
  // ⚠️ นี่คือ "ข้อมูลจริง" ทั้งหมด ไม่มีตรงไหน hardcode/mock เลย: รายชื่อเซิร์ฟมาจาก
  // Discord API จริงตอน login, จำนวนสมาชิกมาจาก client.guilds.cache จริงของบอท,
  // สถานะ Free/Premium มาจากไฟล์ data/guild-tiers.json จริงที่ webhook Stripe เป็นคน
  // อัปเดต — ตรงตาม checklist ข้อ 2 ใน milo-bot-ai-build-prompt.md เป๊ะ
  app.get('/dashboard', requireAuth, (req, res) => {
    const manageableGuilds = req.session.guilds.filter((g) => hasManageGuild(g.permissions));

    const servers = manageableGuilds.map((g) => {
      // client.guilds.cache คือรายชื่อเซิร์ฟที่ "บอทตัวเองอยู่จริง" ตอนนี้ (อัปเดตสดๆ
      // ทุกครั้งที่บอทถูกเชิญเข้า/ถูกเตะออกจากเซิร์ฟไหน ผ่าน gateway event ของ Discord)
      const botGuild = client.guilds.cache.get(g.id);
      return {
        id: g.id,
        name: g.name,
        // guild.icon เป็นแค่ "hash" สั้นๆ ไม่ใช่ URL เต็ม ต้องประกอบเป็น URL เอง
        // (รูปแบบ URL ตายตัวตามเอกสาร Discord CDN) — ถ้าเซิร์ฟไม่มีไอคอนเลย icon จะเป็น null
        iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
        hasBot: Boolean(botGuild),
        // memberCount อ่านจาก cache ของบอทที่ออนไลน์อยู่ตอนนี้เลย (ไม่ใช่เลขนิ่งที่จด
        // ไว้ครั้งเดียวแล้วไม่อัปเดต) ถ้าบอทไม่ได้อยู่ในเซิร์ฟนี้ก็ไม่มีค่าให้ดึง เลยเป็น null
        memberCount: botGuild ? botGuild.memberCount : null,
        // tier เช็คเฉพาะเซิร์ฟที่มีบอทอยู่เท่านั้น (เซิร์ฟที่ไม่มีบอทไม่มีความหมายจะเช็ค tier)
        tier: botGuild ? getGuildTier(g.id) : null,
      };
    });

    // เรียง: เซิร์ฟที่มีบอทอยู่แล้วขึ้นก่อน (ใช้งานได้จริงตอนนี้) แล้วเรียงชื่อ ก-ฮ/A-Z
    // ในแต่ละกลุ่ม (locale 'th' ให้เรียงภาษาไทยถูกต้องตามพจนานุกรม ไม่ใช่เรียงตาม
    // รหัส unicode ดิบๆ ซึ่งจะได้ลำดับที่แปลกๆ)
    servers.sort((a, b) => {
      if (a.hasBot !== b.hasBot) return a.hasBot ? -1 : 1;
      return a.name.localeCompare(b.name, 'th');
    });

    res.send(renderServerPickerPage({
      user: req.session.user,
      servers,
      inviteUrl: buildInviteUrl(),
      // รูป avatar จริงของบอทเอง (ไม่ใช่ภาพตัวละครสมมติแบบใน mockup) โชว์ตรงหัวข้อ
      // ทักทายกลางหน้า — client.user คือบอทตัวเอง มี .displayAvatarURL() ให้ใช้ตรงๆ
      botAvatarUrl: client.user.displayAvatarURL({ size: 64 }),
    }));
  });

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 Middleware กันหน้า "เจาะจงเซิร์ฟ" — ใช้ห่อทุกหน้าที่ผูกกับเซิร์ฟใดเซิร์ฟหนึ่ง
  // (เช่น /dashboard/:guildId, /dashboard/:guildId/welcome ที่จะสร้างในขั้นตอนถัดๆ ไป)
  //
  // ⚠️ นี่คือจุดสำคัญที่สุดจุดหนึ่งของทั้งระบบด้านความปลอดภัย ตรงตามข้อ 4.6 ใน
  // milo-bot-ai-build-prompt.md: "ทุก endpoint ที่แก้ไขข้อมูลเซิร์ฟ ต้องเช็ค 2 ชั้นเสมอ"
  //   ชั้นที่ 1) requireAuth ด้านบน — เช็คว่า "login อยู่จริง" (มี req.session.user ไหม)
  //   ชั้นที่ 2) ฟังก์ชันนี้ — เช็คว่า "คนที่ login อยู่ มีสิทธิ์ Manage Server ของ
  //             :guildId ที่กำลังจะเข้าถึง จริงๆ" ไม่ใช่แค่ login สำเร็จเฉยๆ
  //
  // ทำไมต้องเช็คชั้นที่ 2 ด้วย? เพราะถ้าเช็คแค่ "login อยู่ไหม" อย่างเดียว คนร้ายที่
  // login ด้วยบัญชีตัวเองสำเร็จ (เป็นสมาชิกธรรมดาเซิร์ฟไหนก็ได้) จะพิมพ์ guild ID ของ
  // เซิร์ฟคนอื่นใส่ URL ตรงๆ (เช่น /dashboard/1234567890) แล้วเข้าไปแก้การ์ดต้อนรับ/
  // ตั้งค่าเซิร์ฟที่ตัวเองไม่มีสิทธิ์เลยได้ทันที — เช็คตรงนี้ปิดช่องโหว่นั้น
  //
  // เช็ค 2 อย่าง: (1) :guildId นี้อยู่ในรายชื่อเซิร์ฟที่เขามีสิทธิ์ Manage Server จริง
  // (เทียบกับ req.session.guilds ที่เก็บไว้ตอน login) (2) บอทต้องอยู่ในเซิร์ฟนี้จริงด้วย
  // (กันกรณี guild ID ถูกต้อง มีสิทธิ์จริง แต่บอทไม่ได้อยู่ในเซิร์ฟนั้น — ไม่มีอะไรให้ตั้งค่า)
  function requireGuildAccess(req, res, next) {
    const { guildId } = req.params;
    const guildInSession = req.session.guilds?.find((g) => g.id === guildId);

    if (!guildInSession || !hasManageGuild(guildInSession.permissions)) {
      console.warn(`[dashboard] ${req.session.user?.id} พยายามเข้าเซิร์ฟ ${guildId} โดยไม่มีสิทธิ์ Manage Server`);
      // 🆕 ข้อความที่ผู้ใช้เห็นบนหน้าเว็บ (ไม่ใช่ log) เปลี่ยนเป็นภาษาอังกฤษล้วนๆ แล้ว
      // ตามที่น้องหนาวขอ ให้ทุกหน้าของแดชบอร์ดเป็นอังกฤษเป็น default (log ฝั่ง server
      // ที่มีแต่เราเห็นยังคงเป็นภาษาไทยเหมือนเดิม อ่านง่ายกว่าตอน debug)
      return res.status(403).send("You don't have permission to manage this server.");
    }
    if (!client.guilds.cache.has(guildId)) {
      return res.status(404).send('The bot is not in this server yet. Please invite it from the Server Picker page first.');
    }
    next();
  }

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 GET /dashboard/:guildId — หน้า "Overview" จริง (ขั้นที่ 3 จาก 10 ของแผน Dashboard)
  //
  // แปลง req.session.user/req.session.guilds (ที่มีอยู่แล้วจากตอน login) + client (bot
  // instance ตัวเดียวกับที่ล็อกอินอยู่) ให้เป็นก้อนข้อมูลที่ renderOverviewPage() ต้องการ
  // จุดสำคัญคือ "เช็กลิสต์เริ่มต้นใช้งาน" 6 ข้อ — ทุกข้อคำนวณจากไฟล์ข้อมูลจริงของเซิร์ฟนี้
  // เท่านั้น (ไม่มีตรงไหน hardcode ค่า true/false เอง):
  //   - การ์ดต้อนรับ/บอกลา: มีไฟล์ config บันทึกไว้ไหม (loadWelcomeConfig/loadGoodbyeConfig
  //     คืน null ถ้ายังไม่เคยตั้งค่า)
  //   - ฟอนต์: อัปโหลดฟอนต์ของเซิร์ฟไว้กี่ไฟล์ (getGuildFonts().length > 0)
  //   - ระบบยศ: เคยสร้างชุดตั้งค่ายศไว้ไหม (listSetups().length > 0)
  //   - Builder: เคยมีดราฟต์ที่ "บันทึกลงดิสก์แล้ว" ไหม (listDrafts() อ่านจาก data/drafts.json
  //     ผ่าน builderStorage.js — ไม่ใช้ builderDrafts.js ตัว in-memory เพราะรีสตาร์ตเซิร์ฟเวอร์
  //     ทีก็ว่างเปล่าใหม่ทุกที ใช้เช็คสถานะถาวรแบบนี้ไม่ได้)
  //   - พรีเมียม: getGuildTier() === 'premium' จริง (ข้อมูลเดียวกับที่หน้า Server Picker ใช้)
  app.get('/dashboard/:guildId', requireAuth, requireGuildAccess, async (req, res) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const tier = getGuildTier(guildId);

    const welcomeConfig = loadWelcomeConfig(guildId);
    const goodbyeConfig = loadGoodbyeConfig(guildId);
    const roleSetupCount = listSetups(guildId).length;
    const fontCount = getGuildFonts(guildId).length;
    const draftCount = listDrafts(guildId).length;

    // ลำดับ 6 ข้อนี้ต้องตรงกับลำดับสไลด์ carousel ใน renderOverviewPage() เป๊ะๆ (สไลด์ 0-5)
    // เพราะปุ่ม "กดตัวพรีวิว" ของแต่ละสไลด์ใช้ index เดียวกันนี้หาลิงก์ปลายทาง
    const checklistItems = [
      { key: 'welcome', label: 'Set up the welcome card', done: Boolean(welcomeConfig), href: `/dashboard/${guildId}/welcome` },
      { key: 'roles', label: 'Create an auto-role system', done: roleSetupCount > 0, href: `/dashboard/${guildId}/roles` },
      { key: 'fonts', label: 'Upload a server font', done: fontCount > 0, href: `/dashboard/${guildId}/fonts` },
      { key: 'builder', label: 'Try the Message Builder', done: draftCount > 0, href: `/dashboard/${guildId}/builder` },
      { key: 'goodbye', label: 'Set up the goodbye card', done: Boolean(goodbyeConfig), href: `/dashboard/${guildId}/goodbye` },
      { key: 'premium', label: 'Upgrade to Premium', done: tier === 'premium', href: `/dashboard/${guildId}/premium`, optional: true },
    ];

    res.send(renderOverviewPage({
      guild: {
        id: guildId,
        name: guild.name,
        iconUrl: guild.iconURL({ size: 64 }),
      },
      user: req.session.user,
      botAvatarUrl: client.user.displayAvatarURL({ size: 64 }),
      botName: client.user.username,
      tier,
      checklistItems,
      // configured ใช้แค่เช็คว่ามี config ไหม (Boolean) — ตัว preview ของจริงไปเรนเดอร์ตอน
      // เบราว์เซอร์ขอรูปจาก route ด้านล่างต่างหาก (ไม่ต้องเรนเดอร์ภาพในนี้ ช้าโดยใช่เหตุถ้า
      // ผู้ใช้ไม่ได้เลื่อนไปดูสไลด์นั้นเลย)
      welcomeCard: { configured: Boolean(welcomeConfig), previewUrl: welcomeConfig ? `/dashboard/${guildId}/preview/welcome-card.png` : null },
      goodbyeCard: { configured: Boolean(goodbyeConfig), previewUrl: goodbyeConfig ? `/dashboard/${guildId}/preview/goodbye-card.png` : null },
    }));
  });

  // 🆕 fontStyle เก่าที่เคยบันทึกเป็น 'custom' ต้องแปลงเป็นรูปแบบใหม่ 'customFont:<id>' ก่อน
  // ส่งเข้า generateMemberCardImage() เสมอ — ก๊อปมาจาก normalizeFontStyle() ใน
  // commands/welcome-setup.js และ commands/goodbye-setup.js เป๊ะๆ (สองไฟล์นั้นมีฟังก์ชันนี้
  // เหมือนกันทุกตัวอักษรแต่ไม่ได้ export ออกมา เลยต้องมีสำเนาเล็กๆ นี้ไว้ที่นี่ด้วย — ถ้าวันหน้า
  // แก้ logic นี้ที่ไฟล์ใดไฟล์หนึ่ง อย่าลืมแก้ให้ตรงกันทั้ง 3 ที่)
  function normalizeFontStyleForPreview(fontStyle, guildId) {
    if (fontStyle === 'custom') return `customFont:font_legacy_${guildId}`;
    return fontStyle || 'default';
  }

  // 🆕 สร้างรูปพรีวิว "การ์ดต้อนรับ/การ์ดบอกลา" แบบสดๆ จาก config จริงของเซิร์ฟ ใช้ฟังก์ชัน
  // เดียวกับที่คำสั่ง /welcome-setup, /goodbye-setup ใช้ทำพรีวิวใน Discord (genPreview() —
  // ดูคอมเมนต์อ้างอิงใน utils/renderOverview.js ข้อ 4) ต่างกันแค่ "สมาชิกตัวอย่าง" ตรงนี้ใช้
  // ผู้ใช้ที่ login เข้าแดชบอร์ดอยู่ตอนนี้แทน interaction.user (คนละบริบท แต่หลักการเดียวกัน:
  // เอาคนที่กำลังดูอยู่ตอนนี้มาเป็นตัวอย่าง ไม่ใช้ชื่อ/รูปสมมติ)
  //
  // client.users.fetch(id) คืน discord.js User object จริงจาก Discord API (ไม่ต้องพึ่ง cache
  // เพราะดึงจาก API ตรงๆ) generateMemberCardImage() รองรับทั้ง GuildMember และ User อยู่แล้ว
  // (ดูคอมเมนต์ JSDoc ในไฟล์นั้น) — genPreview() ของจริงก็ส่ง interaction.user (เป็น User
  // เหมือนกัน ไม่ใช่ GuildMember) เข้าไปตรงๆ แบบนี้
  async function renderCardPreview(req, res, { loadConfig, kind }) {
    const { guildId } = req.params;
    const config = loadConfig(guildId);
    if (!config) {
      return res.status(404).send(`This server hasn't set up its ${kind} card yet.`);
    }
    try {
      const previewUser = await client.users.fetch(req.session.user.id);
      const guildFonts = getGuildFonts(guildId);
      const customFonts = guildFonts.map((f) => ({ id: f.id, family: f.family, path: f.path }));
      const previewConfig = {
        ...config,
        textBlocks: (config.textBlocks ?? []).map((block) => ({
          ...block,
          content: (block.content || '').replace('{username}', previewUser.username),
          fontStyle: normalizeFontStyleForPreview(block.fontStyle, guildId),
        })),
        customFonts,
      };
      const result = await generateMemberCardImage(previewUser, previewConfig, { previewMode: true });
      // no-store: การ์ดเปลี่ยนได้ทุกครั้งที่แก้ไขในหน้า Welcome/Goodbye Card เลยไม่อยากให้
      // เบราว์เซอร์แคชรูปเก่าค้างไว้
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-store');
      res.send(result.buffer);
    } catch (err) {
      console.error(`[dashboard] สร้างพรีวิวการ์ด${kind === 'welcome' ? 'ต้อนรับ' : 'บอกลา'}ของเซิร์ฟ ${guildId} ไม่สำเร็จ:`, err);
      res.status(500).send('Failed to render the card preview.');
    }
  }

  app.get('/dashboard/:guildId/preview/welcome-card.png', requireAuth, requireGuildAccess, (req, res) => {
    renderCardPreview(req, res, { loadConfig: loadWelcomeConfig, kind: 'welcome' });
  });
  app.get('/dashboard/:guildId/preview/goodbye-card.png', requireAuth, requireGuildAccess, (req, res) => {
    renderCardPreview(req, res, { loadConfig: loadGoodbyeConfig, kind: 'goodbye' });
  });

  // 🚧 หน้า "เร็วๆ นี้" ชั่วคราวของอีก 7 หน้าที่ยังไม่ได้สร้างจริง (task #16-22 ทั้งหมด รวม
  // Premium ด้วย — ยังไม่มี route จริงของหน้านั้นเลยตอนนี้) กันไม่ให้เมนู sidebar/เช็กลิสต์ของ
  // หน้า Overview กดแล้วเจอ 404 เฉยๆ ระหว่างที่ยังทยอยสร้างทีละหน้าตามแผน — แต่ละเส้นทางในนี้
  // จะถูกแทนที่ด้วย route จริงทีละหน้าเรื่อยๆ ต่อจากนี้ (ลบออกจากลิสต์นี้ทันทีที่หน้านั้นมีของจริง)
  const COMING_SOON_PAGES = [
    { path: 'welcome', key: 'welcome', label: 'Welcome Card' },
    { path: 'goodbye', key: 'goodbye', label: 'Goodbye Card' },
    { path: 'fonts', key: 'fonts', label: 'Fonts' },
    { path: 'roles', key: 'roles', label: 'Role Setup' },
    { path: 'builder', key: 'builder', label: 'Message Builder' },
    { path: 'premium', key: 'premium', label: 'Premium' },
    { path: 'language', key: 'language', label: 'Language' },
  ];
  for (const page of COMING_SOON_PAGES) {
    app.get(`/dashboard/:guildId/${page.path}`, requireAuth, requireGuildAccess, (req, res) => {
      const guild = client.guilds.cache.get(req.params.guildId);
      res.send(renderComingSoonPage({
        pageLabel: page.label,
        activeKey: page.key,
        guild: { id: req.params.guildId, name: guild.name, iconUrl: guild.iconURL({ size: 64 }) },
        user: req.session.user,
        botAvatarUrl: client.user.displayAvatarURL({ size: 64 }),
        botName: client.user.username,
      }));
    });
  }

  // ⚠️ จุดสำคัญที่สุดของทั้งไฟล์: express.raw({ type: 'application/json' })
  //
  // ปกติเราจะใช้ express.json() เพื่อแปลง request body เป็น object ให้อ่านง่าย
  // แต่ตรงนี้ "ห้ามใช้" เด็ดขาด เพราะ stripe.webhooks.constructEvent() (บรรทัดล่างๆ)
  // ต้องการ "raw bytes" ดิบๆ ของ body ไปคำนวณลายเซ็น (signature) เทียบกับที่ Stripe ส่งมา
  // ถ้า express.json() แปลงเป็น object ไปก่อนแล้ว byte ต้นฉบับจะหายไป verify signature ไม่ผ่าน
  // (คนละเรื่องกับ route อื่นๆ ในบอทเรา เพราะบอทไม่ได้มี route อื่นที่ใช้ Express อยู่แล้ว)
  app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    let event;

    // ── ขั้นที่ 1: verify ว่า request นี้มาจาก Stripe จริง ไม่ใช่คนแอบยิงมาเอง ──────
    // ถ้าไม่ verify ตรงนี้ ใครก็ได้ที่รู้ URL ของเรา (/webhook) จะยิง fake event เข้ามา
    // บอกว่า "guild XXX จ่ายเงินแล้วนะ" แล้วปลดล็อก premium ให้เซิร์ฟไหนก็ได้ฟรีๆ ทันที
    // → นี่คือช่องโหว่ร้ายแรงที่สุดของทั้งระบบถ้าลืมเช็คตรงนี้ ห้ามข้ามเด็ดขาด
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('[webhook] signature ไม่ถูกต้อง (อาจไม่ใช่ request จริงจาก Stripe):', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ── ขั้นที่ 2: ตอบ Stripe กลับทันทีว่า "ได้รับแล้ว" ก่อนประมวลผลจริง ────────────
    // Stripe มีกฎว่าถ้าเราไม่ตอบกลับภายในไม่กี่วินาที มันจะคิดว่า webhook ส่งไม่สำเร็จ
    // แล้วจะ "ยิงซ้ำ" มาเรื่อยๆ (retry) ซึ่งถ้าเราดันไปทำงานหนักๆ ก่อนตอบ (เช่น เขียนไฟล์,
    // เรียก Discord API) อาจช้าเกินจนโดน retry ซ้อนกันเป็นสิบรอบโดยไม่ตั้งใจ
    // เพราะงั้นเราตอบ 200 ก่อนเลย แล้วค่อยไปประมวลผลจริงทีหลัง (แบบเดียวกับ deferReply
    // ของ Discord interaction ที่เราคุ้นเคยกันอยู่แล้ว — "รับทราบก่อน ทำทีหลัง")
    res.json({ received: true });

    // ── ขั้นที่ 3: ประมวลผล event จริง (แยกจากการตอบกลับ Stripe แล้ว) ──────────────
    try {
      await handleStripeEvent(event, client);
    } catch (err) {
      // ถ้าตรงนี้ throw จะไม่กระทบ res ที่ตอบ Stripe ไปแล้ว (ตอบไปแล้วบรรทัดบน)
      // แค่ log ไว้เฉยๆ เผื่อแอดมิน (คือน้องหนาว) ต้องมาเช็คทีหลังว่าทำไม guild บางอัน
      // ไม่ได้ premium ทั้งที่จ่ายเงินแล้ว
      console.error('[webhook] ประมวลผล event ล้มเหลว:', event.type, err);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // route /success กับ /cancel — หน้าที่ลูกค้าเจอหลังกดจ่ายเงินผ่าน Stripe Checkout
  //
  // ตอนสร้าง checkout session ใน commands/premium.js เราต้องบอก Stripe ไว้ล่วงหน้าว่า
  // "ถ้าจ่ายเงินสำเร็จ ให้ redirect กลับมาที่ URL ไหน" (success_url) และ "ถ้ากดยกเลิก
  // กลางทาง ให้ redirect กลับมาที่ URL ไหน" (cancel_url) — สอง route นี้คือปลายทางนั้นเอง
  //
  // ⚠️ ทำไมใช้ app.get() ธรรมดา ไม่ใช้ express.raw() แบบ /webhook ด้านบน:
  // express.raw() จำเป็นเฉพาะตอนที่เราต้องอ่าน "raw bytes" ของ body ไปคำนวณลายเซ็น
  // (คือ route /webhook ที่ Stripe "ยิง POST" มาบอกเราเรื่อง event) ส่วน /success กับ
  // /cancel เป็นแค่ "หน้าเว็บที่เบราว์เซอร์ของลูกค้า redirect ไปเปิดเฉยๆ" (GET request
  // ธรรมดา ไม่มี body ส่งมาด้วยเลย) เลยไม่เกี่ยวกับเรื่อง signature verification ใดๆ
  //
  // res.send(...) ตรงนี้ส่งกลับเป็น HTML ตรงๆ (string ธรรมดาที่มีแท็ก HTML ปนอยู่)
  // ไม่ต้องมีไฟล์ .html แยกต่างหาก เพราะหน้านี้มีแค่ข้อความสั้นๆ ไม่ซับซ้อน
  app.get('/success', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Subscription Successful</title>
          <style>
            /* จัดกึ่งกลางทั้งแนวตั้งแนวนอน — ใช้ flexbox กับความสูงเต็มจอ (100vh) */
            body {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background: #0f1115;
              color: #ffffff;
              text-align: center;
              padding: 24px;
              box-sizing: border-box;
            }
            h1 { font-size: 28px; margin-bottom: 12px; }
            p { font-size: 16px; color: #b5b9c2; }
          </style>
        </head>
        <body>
          <div>
            <h1>🎉 Subscription successful!</h1>
            <p>Head back to Discord and type /premium to see your status.</p>
          </div>
        </body>
      </html>
    `);
  });

  app.get('/cancel', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Checkout Canceled</title>
          <style>
            body {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background: #0f1115;
              color: #ffffff;
              text-align: center;
              padding: 24px;
              box-sizing: border-box;
            }
            h1 { font-size: 28px; margin-bottom: 12px; }
            p { font-size: 16px; color: #b5b9c2; }
          </style>
        </head>
        <body>
          <div>
            <h1>Checkout canceled</h1>
            <p>No charge was made. You can head back to Discord.</p>
          </div>
        </body>
      </html>
    `);
  });

  return app;
}

/**
 * 🆕 Middleware กันหน้า — ใช้ห่อหน้า Dashboard ทุกหน้าที่ "ต้อง login ก่อนถึงจะเข้าได้"
 * ถ้ายังไม่ login (ไม่มี req.session.user) จะเด้งไปหน้า /auth/login ให้อัตโนมัติ
 *
 * วิธีใช้ (ตัวอย่างจากหน้า /dashboard ทดสอบด้านบน): ใส่เป็น argument ตัวที่ 2 ของ app.get()
 *   app.get('/dashboard', requireAuth, (req, res) => { ... })
 * Express จะรัน requireAuth ก่อนเสมอ ถ้าผ่าน (เรียก next()) ถึงจะรัน handler จริงต่อ
 *
 * 🚧 หน้าถัดๆ ไปที่จะสร้าง (Server Picker, การ์ดต้อนรับ, ฟอนต์ ฯลฯ) ต้องใช้ตัวนี้ห่อทุกหน้า
 * เหมือนกันหมด — และหน้าที่ผูกกับ "เซิร์ฟใดเซิร์ฟหนึ่งเจาะจง" (เช่น /dashboard/:guildId/welcome)
 * ต้องมี middleware เพิ่มอีกชั้นที่เช็ค hasManageGuild() ของเซิร์ฟนั้นด้วย (ยังไม่เขียนตอนนี้
 * เพราะยังไม่มีหน้าแบบนั้นจริง จะเพิ่มตอนสร้างหน้า Server Picker ในขั้นตอนถัดไป)
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.redirect('/auth/login');
  }
  next();
}

/**
 * แยก event แต่ละประเภทของ Stripe แล้วอัปเดตข้อมูล tier/subscription ให้ตรง
 * @param {import('stripe').Stripe.Event} event
 * @param {import('discord.js').Client} client
 */
async function handleStripeEvent(event, client) {
  switch (event.type) {
    // ═══ ลูกค้ากด "สมัครพรีเมียม" แล้วจ่ายเงินสำเร็จครั้งแรกผ่านหน้า Checkout ═══
    case 'checkout.session.completed': {
      const session = event.data.object;

      // เช็คว่าเป็น checkout แบบ subscription จริงๆ (กันเผื่ออนาคตมี checkout
      // แบบอื่นที่ไม่ใช่การสมัคร premium ปนมาใน webhook เดียวกัน)
      if (session.mode !== 'subscription') break;

      // guildId ที่เราฝังไว้ตอนสร้าง checkout session (ดู commands/premium.js ขั้นถัดไป)
      // ค่านี้มาจากฝั่งเรา (Discord interaction.guildId) ไม่ใช่จาก user พิมพ์เอง
      // ปลอมแปลงไม่ได้ เพราะ metadata ถูกกำหนดตอนสร้าง session บนฝั่ง server เราเอง
      const guildId = session.metadata?.guildId;
      const discordUserId = session.metadata?.discordUserId;
      if (!guildId) {
        // ไม่ควรเกิดขึ้นได้เลยถ้าโค้ด premium.js ถูกต้อง แต่ดักไว้กันบอทพัง
        console.error('[webhook] checkout.session.completed ไม่มี guildId ใน metadata');
        break;
      }

      setGuildTier(guildId, 'premium');
      // currentPeriodEnd ใส่ null ไปก่อน เพราะตอนนี้เพิ่งสมัครเสร็จ ยังไม่มีรอบบิลจริง
      // รอ invoice.payment_succeeded (event ถัดไปที่จะยิงตามมาเกือบจะทันที) มาเติมให้
      setSubscriptionInfo(guildId, {
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        currentPeriodEnd: null,
      });
      console.log(`[webhook] guild ${guildId} สมัครพรีเมียมสำเร็จ (checkout.session.completed)`);

      // ── ส่ง DM แจ้งเตือนทันที ให้ความรู้สึกว่าจ่ายเสร็จแล้วรู้ผลทันที ─────────────
      // ไม่ต้องกลับไปพิมพ์ /premium เช็คเองอีกรอบ — discordUserId มาจาก metadata
      // ที่ premium.js ฝังไว้ตอนสร้าง checkout session (ดู PART D ใน commands/premium.js)
      if (discordUserId) {
        try {
          const t = createTranslator(getGuildLanguage(guildId));
          // client.guilds.cache.get() อ่านจาก cache ในหน่วยความจำ ไม่ยิง API เพิ่ม
          // (บอทออนไลน์อยู่แล้วตอนนี้ ต้องมี guild นี้อยู่ใน cache แน่ๆ)
          const guild = client.guilds.cache.get(guildId);
          const guildName = guild?.name ?? guildId; // เผื่อ cache miss แปลกๆ ใช้ guildId แทนไปก่อน
          const user = await client.users.fetch(discordUserId);

          // ── ส่งเป็นการ์ดสวยๆ แบบเดียวกับ /premium แทนข้อความเปล่าๆ ──────────
          // ⚠️ ห้ามใส่ content: ... ปนกับ flags: MessageFlags.IsComponentsV2 เด็ดขาด
          // (Discord บล็อกตั้งแต่ระดับ API) ต้องใส่ข้อความขอบคุณเป็น TextDisplay
          // แยกอันในอาเรย์ components แทน
          const congratsText = t('premium.dm.activated', { guildName });
          const card = buildPremiumCard({
            isPremium: true,
            // เพิ่งสมัครเสร็จ ยังไม่มีรอบบิลจริง (เหมือน setSubscriptionInfo ด้านบนบรรทัดนี้)
            // เดี๋ยว invoice.payment_succeeded จะมาอัปเดตทีหลัง — ตอนนี้ให้โชว์ "-" ไปก่อน
            subscriptionInfo: { currentPeriodEnd: null },
            guild,
            t,
            actionButton: null, // DM ไม่ต้องมีปุ่ม แค่โชว์การ์ดสวยๆ พอ
          });

          await user.send({
            components: [new TextDisplayBuilder().setContent(congratsText), card],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch (dmError) {
          // ส่ง DM ไม่ได้ (เช่น ผู้ใช้ปิดรับ DM จากสมาชิกเซิร์ฟ/จากบอท) ไม่ critical
          // ข้ามไปเฉยๆ ไม่ทำให้ webhook ทั้งเส้นพังเพราะจุดนี้จุดเดียว — ผู้ใช้ยังเช็ค
          // สถานะได้เองผ่าน /premium อยู่ดี แค่ไม่ได้แจ้งเตือนอัตโนมัติเฉยๆ
          console.warn('[webhook] ส่ง DM แจ้งเตือนพรีเมียมไม่สำเร็จ:', dmError.message);
        }
      }
      break;
    }

    // ═══ จ่ายเงินสำเร็จ (ทั้งครั้งแรก และทุกครั้งที่ต่ออายุรายเดือน) ═══
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;

      // ⚠️ บั๊กที่เจอจริง: Stripe ย้าย field "invoice.subscription" ไปซ้อนอยู่ใน
      // "invoice.parent.subscription_details.subscription" แทน ตั้งแต่ API เวอร์ชัน
      // Basil เป็นต้นมา (เช็คได้จาก log ตอนรัน `stripe listen` — ขึ้น "API Version
      // [xxxx-xx-xx.dahlia]" หรือใหม่กว่า) โค้ดเดิมที่อ่าน invoice.subscription ตรงๆ
      // จะได้ undefined เงียบๆ แล้ว stripe.subscriptions.retrieve(undefined) จะ throw
      // "No such subscription: 'undefined'" ทันที — ต้องเช็ค parent.type ก่อนเสมอ
      // เผื่อ invoice ใบนี้ไม่ได้ผูกกับ subscription เลย (เช่น invoice แบบจ่ายครั้งเดียว)
      const subscriptionId = invoice.parent?.type === 'subscription_details'
        ? invoice.parent.subscription_details?.subscription
        : null;
      if (!subscriptionId) {
        console.log('[webhook] invoice.payment_succeeded ไม่ได้ผูกกับ subscription ข้ามไป');
        break;
      }

      // invoice ไม่มี metadata guildId ติดมาด้วยตรงๆ ต้อง fetch subscription เพิ่ม
      // เพื่อไปอ่าน metadata ที่เราฝังไว้ตอนสร้าง (ดู subscription_data.metadata
      // ใน commands/premium.js — ต้องฝังซ้ำ 2 ที่ เพราะ metadata ของ checkout session
      // กับของ subscription เป็นคนละก้อนกันใน Stripe)
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const guildId = subscription.metadata?.guildId;
      if (!guildId) {
        console.error('[webhook] invoice.payment_succeeded หา guildId ไม่เจอ (subscription metadata ว่าง)');
        break;
      }

      // ⚠️ บั๊กที่เจอจริงอีกจุด: Stripe ย้าย field "subscription.current_period_end"
      // ไปซ้อนอยู่ใน "subscription.items.data[0].current_period_end" แทน (API เวอร์ชัน
      // ใหม่เดียวกับที่เคยย้าย invoice.subscription — ดูคอมเมนต์ด้านบน) โค้ดเดิมที่อ่าน
      // subscription.current_period_end ตรงๆ จะได้ undefined เงียบๆ แล้ว
      // new Date(undefined * 1000).toISOString() จะ throw "RangeError: Invalid time value"
      // ทันที ต้องอ่านจาก items.data[0] แทน พร้อม guard เผื่อ Stripe ย้าย field ไปที่อื่น
      // อีกในอนาคต — fallback เป็น null เงียบๆ ไม่ throw ให้ webhook พังทั้งเส้น
      const periodEndRaw = subscription.items?.data?.[0]?.current_period_end;
      // current_period_end เป็น Unix timestamp (วินาที) ต้องคูณ 1000 ก่อนส่งให้ Date()
      // เพราะ JavaScript Date ใช้หน่วย millisecond
      const currentPeriodEnd = periodEndRaw
        ? new Date(periodEndRaw * 1000).toISOString()
        : null;
      if (!periodEndRaw) {
        console.warn('[webhook] invoice.payment_succeeded: ไม่พบ current_period_end ในตำแหน่งที่คาดไว้ (Stripe อาจเปลี่ยน field อีกแล้ว) — ใช้ null ไปก่อน');
      }

      setGuildTier(guildId, 'premium');
      setSubscriptionInfo(guildId, {
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd,
      });
      console.log(`[webhook] guild ${guildId} ต่ออายุพรีเมียมสำเร็จ (ครบรอบถัดไป: ${currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : '-'})`);
      break;
    }

    // ═══ subscription ถูกยกเลิก/หมดอายุจริง (ไม่ต่ออายุแล้ว) ═══
    // event นี้จะยิงก็ต่อเมื่อ Stripe เลิกพยายามเก็บเงินแล้วจริงๆ (หลัง retry ครบตามที่ตั้งไว้
    // ใน Stripe Dashboard) ไม่ใช่ยิงทันทีที่บัตรถูกปฏิเสธครั้งแรก — งั้นลูกค้าจะมีช่วง
    // "grace period" ที่ยังใช้ premium ได้อยู่ระหว่างที่ Stripe พยายามเก็บเงินซ้ำ ถือว่า
    // เป็นพฤติกรรมปกติที่ยอมรับได้ ไม่ต้องแก้อะไรเพิ่ม
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const guildId = subscription.metadata?.guildId;
      if (!guildId) {
        console.error('[webhook] customer.subscription.deleted หา guildId ไม่เจอ');
        break;
      }

      // 🔒 กันเคส "ยกเลิก + สมัครใหม่เร็วๆ" — Stripe ไม่รับประกันว่า webhook จะมาถึง
      // ตามลำดับเวลาที่เกิดขึ้นจริงเป๊ะๆ ถ้าลูกค้ายกเลิก subscription เก่าแล้วสมัครใหม่
      // ทันที event "deleted" ของตัวเก่าอาจมาถึง "ช้ากว่า" event สมัครใหม่ก็ได้
      // ถ้าไม่เช็คตรงนี้ จะไปดีด guild ที่เพิ่งจ่ายเงินรอบใหม่ให้กลายเป็น free ทั้งที่ยังจ่ายอยู่
      //
      // วิธีเช็ค: ดึงข้อมูล subscription ล่าสุดที่บันทึกไว้ของ guild นี้มาเทียบ
      // ถ้ามีข้อมูลอยู่ (ไม่ null) และ id ไม่ตรงกับ event นี้ แปลว่า event นี้เป็นของ
      // subscription "เก่า" ที่ถูกแทนที่ไปแล้ว → ข้ามไปเลย ไม่แตะ tier
      const currentInfo = getSubscriptionInfo(guildId);
      if (currentInfo && currentInfo.stripeSubscriptionId !== subscription.id) {
        console.log(
          `[webhook] guild ${guildId} ได้รับ subscription.deleted ของ subscription เก่า ` +
          `(${subscription.id}) ซึ่งถูกแทนที่ไปแล้วด้วย ${currentInfo.stripeSubscriptionId} — ข้าม ไม่ set free`
        );
        break;
      }

      setGuildTier(guildId, 'free');

      // เคลียร์ currentPeriodEnd เป็น null เพราะไม่มีรอบบิลที่ active แล้ว แต่ "ไม่ลบ"
      // stripeCustomerId/stripeSubscriptionId ทิ้ง — เผื่อ /premium ยังอยากอ้างอิงลูกค้าเดิม
      // ตอนโชว์ปุ่ม manage ถ้าเซิร์ฟกลับมาสมัครใหม่ทีหลัง (setSubscriptionInfo เขียนทับ
      // ทั้ง 3 field เสมอ เลยต้องส่ง stripeCustomerId/stripeSubscriptionId เดิมกลับเข้าไปด้วย
      // ไม่งั้นมันจะหายไปเป็น undefined แทน)
      if (currentInfo) {
        setSubscriptionInfo(guildId, { ...currentInfo, currentPeriodEnd: null });
      }

      console.log(`[webhook] guild ${guildId} หมดอายุ/ยกเลิกพรีเมียมแล้ว`);
      break;
    }

    default:
      // event ประเภทอื่นที่ Stripe อาจส่งมา (เราไม่ได้ subscribe แต่ Stripe ส่งมาเพราะ
      // ตั้งค่าใน Dashboard ไว้กว้างเกินไป) — ไม่ error แค่ log ไว้เฉยๆ
      console.log('[webhook] event ที่ยังไม่รองรับ:', event.type);
  }
}

module.exports = { createWebhookServer, requireAuth };
