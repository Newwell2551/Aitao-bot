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
// 🆕 [11 ต.ค. 2569] multer = ตัวช่วยอ่าน <form enctype="multipart/form-data"> (ฟอร์มที่มี
// ไฟล์แนบ) — express เองอ่าน multipart ไม่ได้ ต้องพึ่ง library แยกเสมอ ใช้ memoryStorage()
// (เก็บไฟล์ไว้ใน RAM ชั่วคราวเป็น Buffer ไม่เขียนลงดิสก์ตรงๆ) — เดิมใช้แค่หน้า Marketplace
// (ฟอร์มลงขายสินค้าที่มีรูปปก/ไฟล์ดิจิทัลแนบมาด้วย) 🆕 [21 ต.ค. 2569] ตอนนี้หน้า Fonts ก็ใช้ด้วย
// (ฟอร์มอัปโหลดไฟล์ฟอนต์ .ttf/.otf) ดูคอมเมนต์เต็มๆ ที่จุดสร้าง multer instance ของแต่ละหน้า
const multer = require('multer');
const { TextDisplayBuilder, MessageFlags } = require('discord.js');
const stripe = require('./utils/stripeClient');
const { setGuildTier, getGuildTier, setSubscriptionInfo, getSubscriptionInfo, isPremiumGuild } = require('./utils/tierManager');
const { getGuildLanguage, setGuildLanguage } = require('./utils/languageStorage');
const { createTranslator } = require('./utils/i18n');
// 🆕 [23 ก.ย. 2569] ค่าคงที่ราคา Premium ที่ใช้ทั้งฝั่งแสดงผล (renderPremiumBilling.js) และ
// ฝั่งคำนวณราคาจริงตอนสร้าง Stripe Checkout (ตรงนี้) — ดูคอมเมนต์หัวไฟล์ premiumPricing.js
// ว่าทำไมต้องแยกออกมาจุดเดียว
const { getPaypalChargeCents } = require('./utils/premiumPricing');
// 🆕 [แคมเปญโค้ดส่วนลดพ่อค้าแม่ค้า] completeRedemption() = จุดที่ "ยืนยันว่าใช้โค้ด
// สำเร็จจริง" (มีคนจ่ายเงินสำเร็จจริง ไม่ใช่แค่กรอกโค้ดในมือถือ) เรียกจาก webhook
// checkout.session.completed ด้านล่างเท่านั้น — ดู utils/referralStorage.js
//
// 🆕 completeRedemptionFromDiscount() = ตาข่ายรองรับ (fallback) ตอน completeRedemption()
// หาไม่เจอ — เผื่อลูกค้าไม่ได้กดปุ่ม "มีโค้ดส่วนลด?" ในบอทก่อน แต่ไปพิมพ์โค้ดเองตรงช่อง
// "Add promotion code" ที่หน้า Stripe Checkout เลย (หรืออนาคตมีช่องทางซื้อพรีเมียมจากที่
// อื่นที่ไม่ผ่านบอทเลย) — เช็คย้อนหลังจากข้อมูลส่วนลดจริงที่ Stripe บันทึกไว้ในตัว session แทน
// 🆕 [19 ก.ย. 2569 ดึกมาก — หน้าเว็บ Premium มีช่องกรอกโค้ดส่วนลดแล้ว] ต้องใช้ฟังก์ชัน
// เดียวกับที่ commands/premium.js ใช้ตอนตรวจสอบโค้ดจากปุ่ม "มีโค้ดส่วนลด?" เป๊ะๆ
// (getActiveCode เช็คว่าโค้ดมีจริง/ยังเปิดใช้งานอยู่ไหม, hasGuildUsedCode เช็คว่าเซิร์ฟนี้
// เคยใช้โค้ดนี้ไปแล้วหรือยัง, recordPendingRedemption บันทึก "รอผลชำระเงิน" ไว้ก่อน)
const { completeRedemption, completeRedemptionFromDiscount, getActiveCode, hasGuildUsedCode, recordPendingRedemption } = require('./utils/referralStorage');
// 🆕 ห้องรายงานยอดค่าคอมแบบเรียลไทม์ — อัปเดตการ์ดของโค้ดนั้นทันทีหลังยืนยันว่าใช้โค้ด
// สำเร็จจริง (ดูคำอธิบายเต็มในไฟล์ utils/referralReportChannel.js)
const { syncCodeReportMessage } = require('./utils/referralReportChannel');
// 🆕 หน้า Overview ของแดชบอร์ด — โชว์สถานะว่าเซิร์ฟตั้งค่าอะไรไปแล้วบ้าง ใช้ storage module
// พวกนี้เช็คว่าแต่ละข้อ "เสร็จหรือยัง" จากข้อมูลจริงของเซิร์ฟ (ไม่มีตรงไหน hardcode) ดู
// รายละเอียดเหตุผลแต่ละจุดในคอมเมนต์หัวไฟล์ utils/renderOverview.js
//
// 🆕 [24 ต.ค. 2569 — ตัดแดชบอร์ด] เอาแค่ฟังก์ชัน "อ่าน" (load.../list.../get...) มาใช้พอ
// เพราะหน้าเว็บของ Welcome Card / Goodbye Card / Fonts / Role Setup / Message Builder ถูก
// ตัดออกจากแดชบอร์ดแล้ว (ใช้คำสั่งสแลชในดิสคอร์ดตั้งค่าแทน) ไม่ต้อง "บันทึก/ลบ" จากฝั่งเว็บ
// อีกต่อไป เลยตัดฟังก์ชัน save.../delete... ของแต่ละ storage module ออกจากตรงนี้ (ฟังก์ชัน
// พวกนั้นยังอยู่ในไฟล์ storage เดิมทุกตัว ไม่ได้ลบ แค่ server.js ไม่เรียกใช้แล้ว)
const { renderOverviewPage } = require('./utils/renderOverview');
const { renderComingSoonPage, NAV_ITEMS } = require('./utils/dashboardShell');
const { loadWelcomeConfig } = require('./utils/welcomeStorage');
const { loadGoodbyeConfig } = require('./utils/goodbyeStorage');
const { getGuildFonts } = require('./utils/fontStorage');
const { listSetups } = require('./utils/roleSetupStorage');
const { listDrafts } = require('./utils/builderStorage');
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
// 🆕 [25 ก.ย. 2569] ระบบ Marketplace — หน้าเว็บ public/marketplace.html เดิมโชว์แค่ของ
// mock (ดูคอมเมนต์ในไฟล์นั้น) ตอนนี้ต่อกับข้อมูลจริงแล้ว: listActiveListings/getListing
// ให้ข้อมูลประกาศขาย (ผู้ขายลงผ่านคำสั่ง /marketplace sell ในดิสคอร์ด ดู
// commands/marketplace.js), createOrder สร้างคำสั่งซื้อตอนกด "ซื้อ" บนหน้าเว็บ, ส่วน
// generatePromptPayQrBuffer สร้างรูป QR ให้ "ผู้ซื้อ" สแกนจ่ายตรงเข้าบัญชีผู้ขาย (บอทไม่
// แตะเงินเลย — ดูหลักการเต็มๆ ในคอมเมนต์หัวไฟล์ utils/marketplaceStorage.js)
// 🆕 [11 ต.ค. 2569] เพิ่ม saveSellerPromptPay/createListing/listSellerListings/
// setListingStatus/resolveListingAssets/CATEGORIES/PROMPTPAY_ID_PATTERN/MAX_PRICE_THB —
// ทั้งหมดนี้เดิมใช้ได้แค่ผ่านคำสั่ง /marketplace ในดิสคอร์ด (ดู commands/marketplace.js)
// ตอนนี้หน้า Dashboard /dashboard/:guildId/marketplace เรียกใช้ตรงๆ เหมือนกัน ให้ลงขาย/
// จัดการร้านจากเว็บได้เลยตามที่น้องหนาวขอ (ดู utils/renderMarketplaceDashboard.js)
const {
  listActiveListings,
  getListing,
  getSeller,
  createOrder,
  getOrder,
  getSellerStats,
  getListingSalesCount,
  markOrderBuyerPaid,
  createReport,
  saveSellerPromptPay,
  saveSellerPayment,
  getSellerPaymentMethod,
  hasPaymentMethodSet,
  createListing,
  updateListing,
  deleteListing,
  listSellerListings,
  setListingStatus,
  resolveListingAssets,
  CATEGORIES,
  PROMPTPAY_ID_PATTERN,
  PAYMENT_LINK_PATTERN,
  MAX_PAYMENT_LINK_LENGTH,
  MILO_CONFIG_KEY_PATTERN,
  MAX_PRICE_THB,
} = require('./utils/marketplaceStorage');
const { generatePromptPayQrBuffer } = require('./utils/promptpayQr');
// 🆕 [19 ต.ค. 2569] ตรวจสอบสลิปโอนเงินจริงผ่าน EasySlip API (ข้อ 4 "Secure Slip Verification"
// ที่น้องหนาวขอ) — ⚠️ อ่านคำเตือนเต็มๆ ที่หัวไฟล์ utils/slipVerification.js ก่อนนะครับ ยังไม่มี
// API key จริงตั้งไว้ใน .env (ต้องไปสมัครเอง ใส่ค่าเป็น EASYSLIP_API_KEY) — ถ้ายังไม่ตั้งคีย์
// isSlipVerificationConfigured() จะคืน false เสมอ ระบบจะข้ามการตรวจสลิปอัตโนมัติไปเฉยๆ (ไม่
// บล็อกอะไร) ผู้ซื้อ/ผู้ขายยังใช้ flow เดิม (ปุ่ม "ฉันจ่ายแล้ว" + ผู้ขายกดยืนยันเอง) ได้ปกติทุกอย่าง
const { isSlipVerificationConfigured, verifySlip } = require('./utils/slipVerification');
// เก็บรูปปก/ไฟล์ดิจิทัลที่อัปโหลดจากฟอร์มลงขายบนเว็บไว้ถาวรจริงๆ (ดูเหตุผลเต็มๆ ใน
// คอมเมนต์หัวไฟล์ utils/assetStorage.js — สรุปสั้นๆ: URL ไฟล์แนบ Discord หมดอายุใน ~24 ชม.)
const { storeBufferPermanently } = require('./utils/assetStorage');
const { renderMarketplaceDashboardPage } = require('./utils/renderMarketplaceDashboard');
// 🆕 [21 ต.ค. 2569] หน้า "Marketplace Feed" (public/feed.html) — ฟีดงาน/บริการข้ามเซิร์ฟ
// ดูคอมเมนต์หัวไฟล์ utils/feedStorage.js สำหรับสเกมา + เหตุผลของทุกจุดที่ตัดสินใจเอง
const feedStorage = require('./utils/feedStorage');
// 🆕 หน้า Server Picker (การ์ดกริดเลือกเซิร์ฟหลัง login) — แยกไว้คนละไฟล์เพราะเป็น
// โค้ดสร้าง HTML ล้วนๆ ยาวๆ ไม่อยากให้ server.js (ที่จัดการ route) ยาวเทอะทะเกินไป
// ดูคำอธิบายเต็มๆ ในไฟล์นั้นเลย
const { renderServerPickerPage, renderPremiumServerPickerPage, defaultAvatarUrl } = require('./utils/renderServerPicker');
// 🆕 ใช้ buildInviteUrl() ตัวเดียวกับที่ /help ใช้สร้างลิงก์เชิญบอท — ไม่เขียนซ้ำใหม่
// ที่นี่ เพราะถ้าวันหน้ามีคนไปแก้สิทธิ์ที่บอทขอตอนเชิญ (invitePermissions ใน help.js)
// จะได้แก้จุดเดียวแล้วสองที่นี้อัปเดตตามกันอัตโนมัติ ไม่ต้องมาคอยจำว่าต้องแก้ 2 จุด
const { buildInviteUrl } = require('./commands/help');
// 🆕 [19 ต.ค. 2569 รอบ 19] applyPendingSkippedForGuild() = ตัว "import ของค้างให้อัตโนมัติ"
// หลังเซิร์ฟอัปเกรดพรีเมียมสำเร็จ — ของค้างคือ role setup/builder ที่เคยถูกข้ามไปตอน
// /milo import-config ขณะเซิร์ฟยังเป็นแผนฟรีอยู่ (เกินโควตา/ชนิดไม่รองรับ) ดูคอมเมนต์เต็มๆ
// ที่ตัวฟังก์ชันใน commands/milo.js และที่ utils/miloConfigStorage.js (ส่วน pending skip)
const { applyPendingSkippedForGuild } = require('./commands/milo');
// 🆕 หน้า Premium & Billing จริง (เพิ่ม 19 ก.ย. 2569, ย้ายออกจาก /dashboard ตอนดึกมากของ
// วันเดียวกัน — น้องหนาวไม่อยากให้หน้าจ่ายเงินอยู่ในแดชบอร์ด รู้สึกซ้ำกับหน้า Pricing)
// ให้เลือกจ่ายได้ 2 ทางจากหน้าเว็บ (บัตรเครดิต / PromptPay QR) จุดเข้าใหม่คือปุ่ม
// "Subscribe to Premium" ที่หน้า public/pricing.html → /premium/start (เลือกเซิร์ฟ) →
// /premium/:guildId (เลือกวิธีจ่าย) ดูคอมเมนต์เต็มๆ ตรง route ด้านล่างสำหรับรายละเอียด
const { renderPremiumBillingPage } = require('./utils/renderPremiumBilling');
// 🆕 หน้า Language จริงในแดชบอร์ด (แทนที่ "เร็วๆ นี้" เดิม) — ดูคอมเมนต์เต็มๆ หัวไฟล์
const { renderLanguageSettingsPage } = require('./utils/renderLanguageSettings');

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
  //
  // 🆕 [19 ก.ย. 2569 ดึกมาก] รองรับ ?returnTo=/some/path เพิ่ม — ใช้ตอนมีหน้าที่ "ต้อง login
  // ก่อนถึงจะเข้าได้" (เช่น /premium/start) อยากให้พา user "กลับไปหน้าที่ตั้งใจจะไปจริงๆ"
  // หลัง login เสร็จ แทนที่จะโยนไปหน้า Server Picker (/dashboard) เฉยๆ ทุกครั้งเหมือนเดิม
  // เก็บไว้ใน session คู่กับ oauthState (จะอ่านออกมาใช้ตอน /auth/callback ด้านล่าง)
  //
  // ⚠️ กันช่องโหว่ "open redirect": เช็คว่า returnTo ต้องขึ้นต้นด้วย "/" ตัวเดียว (path
  // ภายในเว็บเราเอง) และห้ามขึ้นต้นด้วย "//" (ตัวอย่างเช่น "//evil.com" ที่เบราว์เซอร์อาจ
  // ตีความเป็นลิงก์ไปโดเมนอื่นได้) ไม่ผ่านเงื่อนไขนี้ = ไม่เก็บ ปล่อยให้ fallback เป็น
  // /dashboard ตามปกติ กันมีคนปลอมลิงก์ login ของเราแล้วฝัง returnTo เป็นเว็บปลอมไว้หลอกคน
  app.get('/auth/login', (req, res) => {
    const returnTo = req.query.returnTo;
    if (typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      req.session.returnTo = returnTo;
    }

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

      // 🆕 ถ้ามี returnTo ที่เก็บไว้ตอน /auth/login (เช่นมาจาก requireAuth เด้งมาเอง หรือ
      // มาจากปุ่ม "Subscribe to Premium" ที่หน้า pricing.html) พากลับไปที่นั่นแทน
      // /dashboard เฉยๆ — ลบออกจาก session ทันทีหลังอ่าน กันใช้ค้างซ้ำรอบหน้า
      const returnTo = req.session.returnTo;
      delete req.session.returnTo;
      res.redirect(returnTo || '/dashboard');
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
  // 🆕 [21 ก.ย. 2569] ดึง logic "หาเซิร์ฟที่ผู้ใช้คนนี้จัดการได้ + เช็คว่าบอทอยู่
  // เซิร์ฟไหนแล้วบ้าง" ออกมาเป็นฟังก์ชันกลางตรงนี้ — เดิมโค้ดชุดนี้ซ้ำกันอยู่ 2 ที่
  // (ใน /dashboard กับ /premium/start ด้านล่าง) พอดีมาเพิ่ม GET /api/me (ให้ auth
  // widget บน navbar ของหน้าเว็บสาธารณะเรียกใช้ — ดู public/nav.js) ซึ่งต้องการ
  // ข้อมูลชุดเดียวกันเป๊ะเป็นที่ 3 เลยรวบมาไว้จุดเดียวกันจะได้ไม่ต้องแก้ 3 ที่พร้อมกัน
  // ทุกครั้งที่ logic นี้เปลี่ยน (เช่นวันหน้าอยากเพิ่มข้อมูลอะไรต่อเซิร์ฟ)
  //
  // logic หลักคือ 3 ขั้นตอน:
  //   1) กรอง sessionGuilds (ทุกเซิร์ฟที่ผู้ใช้เป็นสมาชิกอยู่ — เก็บไว้ตอน login ใน
  //      /auth/callback ด้านบน) ให้เหลือแค่เซิร์ฟที่เขามีสิทธิ์ "Manage Server" เท่านั้น
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
  function computeManageableServers(sessionGuilds) {
    const manageableGuilds = (sessionGuilds || []).filter((g) => hasManageGuild(g.permissions));

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

    // เรียง: เซิร์ฟที่มีบอทอยู่แล้วขึ้นก่อน (ใช้งานได้เลย สำคัญกว่า) แล้วเรียงชื่อ ก-ฮ/A-Z
    // ในแต่ละกลุ่ม (locale 'th' ให้เรียงภาษาไทยถูกต้องตามพจนานุกรม ไม่ใช่เรียงตาม
    // รหัส unicode ดิบๆ ซึ่งจะได้ลำดับที่แปลกๆ)
    servers.sort((a, b) => {
      if (a.hasBot !== b.hasBot) return a.hasBot ? -1 : 1;
      return a.name.localeCompare(b.name, 'th');
    });

    return servers;
  }

  // GET /dashboard — หน้า Server Picker จริง (ขั้นที่ 2 จาก 10 ของแผน Dashboard)
  //
  // 🆕 [11 ต.ค. 2569] รองรับ query ?next=<hrefSuffix> เช่น ?next=/marketplace — ใช้ตอน
  // มีปุ่มจากหน้าเว็บสาธารณะ (เช่นปุ่ม "ลงขายสินค้า" ใน public/marketplace.html) ที่อยาก
  // พาผู้ใช้ไปหน้า Dashboard หน้าย่อยที่ต้องการทันทีหลังเลือกเซิร์ฟ โดยไม่ต้องกดเมนูซ้ำอีกที
  //
  // ⚠️ ต้องเช็ก whitelist ก่อนใช้เสมอ — ห้ามเอา req.query.next ไปต่อ URL ตรงๆ เด็ดขาด
  // เพราะเป็นค่าที่ผู้ใช้ (หรือใครก็ได้ที่ปลอมลิงก์มา) กำหนดเองได้ ถ้าไม่กรองอาจเปิดช่องให้
  // ยัดอะไรแปลกๆ ต่อท้าย URL ได้ เลยเทียบกับ hrefSuffix ของ NAV_ITEMS (รายการเมนู Dashboard
  // จริงทั้งหมด จาก utils/dashboardShell.js) ตรงเป๊ะเท่านั้นถึงจะยอมผ่าน ไม่ตรงก็ตกไปที่ค่า
  // เริ่มต้น '' (หน้า Overview) เหมือนเดิม ไม่ error ให้ผู้ใช้เห็นอะไรผิดปกติ
  app.get('/dashboard', requireAuth, (req, res) => {
    const servers = computeManageableServers(req.session.guilds);
    const requestedNext = typeof req.query.next === 'string' ? req.query.next : '';
    const allowedNextPaths = new Set(NAV_ITEMS.map((item) => item.hrefSuffix).filter(Boolean));
    const nextPath = allowedNextPaths.has(requestedNext) ? requestedNext : '';

    res.send(renderServerPickerPage({
      user: req.session.user,
      servers,
      inviteUrl: buildInviteUrl(),
      // รูป avatar จริงของบอทเอง (ไม่ใช่ภาพตัวละครสมมติแบบใน mockup) โชว์ตรงหัวข้อ
      // ทักทายกลางหน้า — client.user คือบอทตัวเอง มี .displayAvatarURL() ให้ใช้ตรงๆ
      botAvatarUrl: client.user.displayAvatarURL({ size: 64 }),
      nextPath,
    }));
  });

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 [21 ก.ย. 2569] GET /api/me — endpoint เบาๆ ให้ auth widget บน navbar ของ
  // หน้าเว็บสาธารณะ (index.html/features.html/pricing.html/marketplace.html —
  // ดู public/nav.js) เรียกถามว่า "ตอนนี้ใคร login อยู่บ้าง" เพราะ 4 หน้านั้นเป็น
  // static HTML ธรรมดา (เสิร์ฟผ่าน express.static ด้านบน) ไม่ได้เรนเดอร์จาก server
  // ทุกครั้งแบบหน้า /dashboard เลยไม่รู้สถานะ login ล่วงหน้าได้ ต้องให้ JS ฝั่ง
  // เบราว์เซอร์ยิงมาถามทีหลังจากโหลดหน้าเสร็จแทน
  //
  // ⚠️ จงใจ "ไม่" ใช้ requireAuth ห่อ endpoint นี้ — เพราะ requireAuth จะ redirect
  // ไป /auth/login ทันทีถ้ายังไม่ login ซึ่งไม่ใช่พฤติกรรมที่ต้องการเลยสำหรับ endpoint
  // ที่แค่ "ถามสถานะเฉยๆ" (ยังไม่ login ก็เป็นคำตอบที่ถูกต้องอันนึง ไม่ใช่ข้อผิดพลาด)
  // เลยเช็ค req.session.user เองตรงๆ แล้วตอบ loggedIn: false กลับไปเฉยๆ แทน
  //
  // ส่ง avatarUrl ที่ "พร้อมใช้แสดงผลเลย" กลับไปเสมอ (ไม่ใช่ null) — ถ้าผู้ใช้ไม่เคย
  // ตั้งรูปโปรไฟล์เอง (req.session.user.avatar เป็น null) ให้ประกอบ URL รูป default
  // ของ Discord เอง (defaultAvatarUrl — ฟังก์ชันเดียวกับที่หน้า Server Picker ใช้)
  // แทน เพื่อให้ nav.js ฝั่งเบราว์เซอร์ไม่ต้องมานั่งเขียนสูตรคำนวณซ้ำเองอีกที
  app.get('/api/me', (req, res) => {
    if (!req.session.user) {
      return res.json({ loggedIn: false });
    }

    const user = req.session.user;
    res.json({
      loggedIn: true,
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatar || defaultAvatarUrl(user.id),
      },
      servers: computeManageableServers(req.session.guilds),
      inviteUrl: buildInviteUrl(),
      premiumStartUrl: '/premium/start',
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 [25 ก.ย. 2569] Marketplace API — 3 เส้นทาง ให้หน้าเว็บ public/marketplace.html
  // เรียกดึงของจริงมาโชว์แทน mock data เดิม + ให้กดซื้อได้จริง
  //
  // ทำไมแยกเป็น API endpoint แทนที่จะ render จาก server ทุกครั้งแบบหน้า /dashboard:
  // เพราะ marketplace.html เป็น static HTML เสิร์ฟผ่าน express.static เหมือน index.html/
  // features.html/pricing.html (ดูคอมเมนต์ที่ /api/me ด้านบน) — ต้องให้ JS ฝั่งเบราว์เซอร์
  // ยิงมาดึงข้อมูลทีหลังจากโหลดหน้าเสร็จแทน ไม่ใช่ฝังข้อมูลมาตั้งแต่ตอนโหลดหน้า

  // GET /api/marketplace/listings — รายการประกาศขายทั้งหมดที่ "active" (ให้ทุกคนดูได้
  // ไม่ต้อง login) — จงใจไม่ส่ง sellerId (Discord user ID จริงของผู้ขาย) ออกไปในนี้เลย
  // ส่งแค่ displayName พอ กันเผยข้อมูลระบุตัวตนที่ไม่จำเป็นออกสู่สาธารณะ
  // 🆕 [11 ต.ค. 2569] ทั้ง 2 เส้นทางนี้ต้องเปลี่ยนเป็น async + resolveListingAssets()
  // เพราะ item.imageUrl ตอนนี้เก็บเป็นพิกัดข้อความ {channelId, messageId} ไม่ใช่ URL ดิบๆ
  // แล้ว (ดูคอมเมนต์หัวไฟล์ utils/marketplaceStorage.js) ต้อง resolve ให้เป็น URL สดใหม่
  // ก่อนส่งให้ browser ใช้จริงเสมอ — ทำแบบ Promise.all ให้ resolve หลายชิ้นพร้อมกัน ไม่ใช่
  // ทีละชิ้นทีละชิ้น (เร็วกว่าตอนมีหลายประกาศ)
  app.get('/api/marketplace/listings', async (req, res) => {
    const listings = await Promise.all(
      listActiveListings().map(async (item) => {
        const seller = getSeller(item.sellerId);
        const { imageUrl } = await resolveListingAssets(client, item);
        // 🆕 [12 ต.ค. 2569] ส่งจำนวนออเดอร์ที่ร้านนี้ขายสำเร็จแล้ว (ยืนยันรับเงินจริง)
        // ออกไปด้วย — เอาไปแทนที่ rating/reviews ปลอมๆ เดิมบนหน้าเว็บ เป็นคะแนนความ
        // น่าเชื่อถือร้านแบบข้อมูลจริง (ดู getSellerStats ใน utils/marketplaceStorage.js)
        const { completedSales } = getSellerStats(item.sellerId);
        // 🆕 [19 ต.ค. 2569 — hotfix] และแยกส่งยอดขาย "เฉพาะสินค้าชิ้นนี้" ไปด้วยอีกค่าหนึ่ง
        // (listingSalesCount) — เดิมหน้าเว็บเอา sellerCompletedSales (ยอดรวมทั้งร้าน) ไปโชว์
        // เป็นป้าย "ขายแล้ว N" ติดบนการ์ดสินค้าทุกชิ้นของร้านเดียวกัน พอมีออเดอร์ไหนในร้าน
        // ยืนยันสำเร็จ การ์ดสินค้า "ทุกชิ้น" ของร้านนั้นจะโชว์เลขเพิ่มพร้อมกันหมด ดูเหมือน
        // สินค้าชิ้นอื่นถูกขายไปด้วยทั้งที่จริงๆ ไม่ใช่ (ดูคอมเมนต์เต็มๆ ที่ getListingSalesCount
        // ใน utils/marketplaceStorage.js) — ตอนนี้การ์ดสินค้าต้องใช้เลขนี้แทนแล้ว
        const { listingSalesCount } = getListingSalesCount(item.id);
        return {
          id: item.id,
          title: item.title,
          description: item.description,
          priceThb: item.priceThb,
          category: item.category,
          subcategory: item.subcategory,
          type: item.type,
          imageUrl,
          // 🆕 [19 ต.ค. 2569] ส่งจุดโฟกัสแนวตั้งของรูปปกออกไปด้วย (ดีฟอลต์ 50 = กึ่งกลาง)
          // ให้หน้า public/marketplace.html ใช้ตั้ง background-position ตรงกับที่ผู้ขายลาก
          // เลือกไว้จริงๆ ตอนลงขาย (ดู utils/renderMarketplaceDashboard.js mktInitCoverReposition)
          imageFocusY: Number(item.imageFocusY ?? 50) || 50,
          sellerName: seller?.displayName || 'ผู้ขายไม่ระบุชื่อ',
          sellerCompletedSales: completedSales,
          listingSalesCount,
          createdAt: item.createdAt,
        };
      })
    );
    res.json({ listings });
  });

  // GET /api/marketplace/listings/:id — รายละเอียดประกาศ 1 ชิ้น (หน้า product detail)
  app.get('/api/marketplace/listings/:id', async (req, res) => {
    const listing = getListing(String(req.params.id || '').toUpperCase());
    if (!listing || listing.status !== 'active') {
      return res.status(404).json({ error: 'listing_not_found' });
    }
    const seller = getSeller(listing.sellerId);
    const { imageUrl } = await resolveListingAssets(client, listing);
    // 🆕 [12 ต.ค. 2569] เหมือนกับ endpoint รายการด้านบน — แนบจำนวนขายสำเร็จของร้านนี้
    // ไปด้วย ให้หน้า product detail โชว์เป็นคะแนนความน่าเชื่อถือร้านแทนของเดิมได้
    const { completedSales } = getSellerStats(listing.sellerId);
    // 🆕 [19 ต.ค. 2569 — hotfix] เหมือนกับ endpoint รายการด้านบน — ส่ง listingSalesCount
    // (เฉพาะสินค้าชิ้นนี้) แนบไปด้วย ดูคอมเมนต์เต็มๆ ที่ endpoint รายการด้านบน
    const { listingSalesCount } = getListingSalesCount(listing.id);
    res.json({
      id: listing.id,
      title: listing.title,
      description: listing.description,
      priceThb: listing.priceThb,
      category: listing.category,
      subcategory: listing.subcategory,
      type: listing.type,
      imageUrl,
      imageFocusY: Number(listing.imageFocusY ?? 50) || 50,
      sellerName: seller?.displayName || 'ผู้ขายไม่ระบุชื่อ',
      sellerCompletedSales: completedSales,
      listingSalesCount,
    });
  });

  // POST /api/marketplace/listings/:id/buy — ผู้ซื้อกดปุ่ม "ซื้อ" บนหน้าเว็บ
  //
  // ⚠️ จงใจ "ไม่" ใช้ requireAuth ห่อ endpoint นี้ (เหมือน /api/me) เพราะ requireAuth จะ
  // redirect ไปหน้า /auth/login ทันที ซึ่งใช้ไม่ได้กับ endpoint ที่ฝั่งเบราว์เซอร์เรียกด้วย
  // fetch() (fetch จะได้ HTML หน้า login กลับมาแทน JSON ที่ต้องการ) — เช็ค
  // req.session.user เองตรงๆ แล้วตอบ 401 กลับไปเป็น JSON แทน ให้ฝั่งหน้าเว็บเด้งไป
  // /auth/login เองด้วย JavaScript ได้ตามที่ต้องการ
  app.post('/api/marketplace/listings/:id/buy', async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'not_logged_in', loginUrl: `/auth/login?returnTo=${encodeURIComponent('/marketplace')}` });
    }

    const listing = getListing(String(req.params.id || '').toUpperCase());
    if (!listing || listing.status !== 'active') {
      return res.status(404).json({ error: 'listing_not_found' });
    }

    // ห้ามซื้อของตัวเอง — กันกดทดสอบ/ปั่นยอดมั่วๆ
    if (listing.sellerId === req.session.user.id) {
      return res.status(400).json({ error: 'cannot_buy_own_listing' });
    }

    const seller = getSeller(listing.sellerId);
    if (!hasPaymentMethodSet(seller)) {
      // ไม่ควรเกิดจริง เพราะ /marketplace sell บังคับตั้งช่องทางรับเงินก่อนลงขายแล้ว — กันไว้เผื่อ
      return res.status(409).json({ error: 'seller_not_ready' });
    }

    // 🆕 [12 ต.ค. 2569] แยก 2 เส้นทางตามช่องทางรับเงินของผู้ขาย — เดิมมีแค่ PromptPay
    // ทางเดียว (คนต่างชาติใช้ไม่ได้เลย เพราะเป็นระบบจ่ายเงินของไทยล้วนๆ) ตอนนี้ผู้ขายเลือก
    // ได้ว่าจะใช้ PromptPay หรือลิงก์รับเงินสากลของตัวเอง (PayPal.me/Stripe Payment Link
    // ฯลฯ) — บอทไม่รู้จัก/ไม่ยุ่งกับช่องทางที่เป็นลิงก์เลย แค่ส่งลิงก์นั้นกลับไปให้หน้าเว็บ
    // โชว์ให้ผู้ซื้อกดเอง ไม่มี QR ให้สร้างในเคสนี้ (ลิงก์ทั่วไปไม่มียอดเงินฝังอยู่ในตัวได้
    // แบบ Thai QR Payment)
    const method = getSellerPaymentMethod(seller);
    let qrBuffer = null;
    if (method === 'promptpay') {
      try {
        qrBuffer = await generatePromptPayQrBuffer(seller.promptpayId, listing.priceThb);
      } catch (error) {
        console.error('[marketplace buy] สร้าง QR ให้ผู้ซื้อไม่สำเร็จ:', error);
        return res.status(500).json({ error: 'qr_generation_failed' });
      }
    }

    const order = createOrder({
      listingId: listing.id,
      sellerId: listing.sellerId,
      buyerId: req.session.user.id,
      priceThb: listing.priceThb,
    });

    // แจ้งผู้ขายทาง DM แบบไม่บล็อกการตอบกลับผู้ซื้อ (ถ้า DM ผู้ขายไม่สำเร็จ ผู้ซื้อก็ยัง
    // ต้องเห็นช่องทางจ่ายเงินได้ปกติอยู่ดี — แค่ทำให้ sellerNotified เป็น false ในคำตอบ ให้
    // หน้าเว็บเตือนผู้ซื้อว่า "ถ้ารอนานผิดปกติ ให้ลองติดต่อผู้ขายเองโดยตรง")
    const marketplaceCommand = client.commands.get('marketplace');
    const notifyResult = await marketplaceCommand.notifySellerNewOrder(client, order, listing, {
      id: req.session.user.id,
      username: req.session.user.username,
    });

    const responseBody = {
      orderId: order.id,
      priceThb: order.priceThb,
      paymentMethod: method,
      sellerNotified: notifyResult.notified,
    };
    if (method === 'promptpay') {
      responseBody.qrDataUri = `data:image/png;base64,${qrBuffer.toString('base64')}`;
    } else {
      responseBody.paymentLink = seller.paymentLink;
    }

    res.json(responseBody);
  });

  // 🆕 [12 ต.ค. 2569] POST /api/marketplace/orders/:id/mark-paid — ผู้ซื้อกดปุ่ม
  // "✅ ฉันจ่ายแล้ว" ใน payModal หลังสแกน QR จ่ายเงิน
  //
  // ⚠️ นี่ "ไม่ใช่" การยืนยันว่าเงินเข้าบัญชีผู้ขายจริง — บอทไม่มีทางรู้เองอยู่ดี (ไม่ได้ต่อ
  // API ธนาคาร) การยืนยันจริงยังต้องรอผู้ขายกด "ยืนยันได้รับเงินแล้ว" ใน DM เหมือนเดิมทุก
  // อย่าง จุดประสงค์ของปุ่มนี้คือสร้าง "audit trail 2 ฝั่ง" (ผู้ซื้อบอกว่าโอนแล้วเมื่อไหร่ vs
  // ผู้ขายกดยืนยันเมื่อไหร่) เผื่อมีข้อพิพาททีหลัง เช่นผู้ซื้อบอกว่าโอนไปตั้งนานแล้วแต่ผู้ขาย
  // ไม่กดยืนยันสักที — สภา LLM Council แนะนำให้ทำจุดนี้ก่อนเรื่องช่องทางจ่ายเงินอื่นๆ
  //
  // ไม่ใช้ requireAuth ห่อ (เหมือน /buy ด้านบน) เพราะ endpoint นี้ก็ถูกเรียกด้วย fetch()
  // จากฝั่งเบราว์เซอร์เหมือนกัน เช็ค req.session.user ตรงๆ แล้วตอบ 401 เป็น JSON แทน
  app.post('/api/marketplace/orders/:id/mark-paid', async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'not_logged_in' });
    }

    const order = getOrder(String(req.params.id || '').toUpperCase());
    if (!order) {
      return res.status(404).json({ error: 'order_not_found' });
    }

    // ต้องเป็นผู้ซื้อของออร์เดอร์นี้เท่านั้น — กันคนอื่นมากดแทน/ปั่นข้อมูลมั่วๆ
    if (order.buyerId !== req.session.user.id) {
      return res.status(403).json({ error: 'not_your_order' });
    }

    const updatedOrder = markOrderBuyerPaid(order.id);

    // แก้ DM เดิมที่แจ้งผู้ขายให้โชว์เพิ่มว่าผู้ซื้อแจ้งว่าโอนแล้ว — ไม่บล็อกการตอบกลับ
    // ผู้ซื้อถ้าแก้ DM ไม่สำเร็จ (ดูเหตุผลเต็มๆ ในคอมเมนต์ของฟังก์ชันนี้ใน commands/marketplace.js)
    const marketplaceCommand = client.commands.get('marketplace');
    await marketplaceCommand.notifyBuyerMarkedPaid(client, updatedOrder);

    res.json({ ok: true, buyerMarkedPaidAt: updatedOrder.buyerMarkedPaidAt });
  });

  // 🆕 [19 ต.ค. 2569] multer เฉพาะสำหรับอัปโหลดรูปสลิปโอนเงิน (field name "slip") — แยกจาก
  // marketplaceUpload ของฟอร์มลงขายสินค้า (ด้านล่างไฟล์นี้) เพราะคนละ route/field กัน เก็บเป็น
  // Buffer ในหน่วยความจำชั่วคราวเหมือนกัน (ไม่เขียนลงดิสก์) จำกัดไว้ 8MB พอสำหรับรูปสลิป/
  // สกรีนช็อตแอปธนาคารทั่วไป (เล็กกว่าลิมิต 20MB ของฟอร์มลงขาย เพราะรูปสลิปไม่ควรใหญ่ขนาดนั้น)
  const slipUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

  // 🆕 [19 ต.ค. 2569] POST /api/marketplace/orders/:id/verify-slip — ข้อ 4 "Secure Slip
  // Verification" ที่น้องหนาวขอ: ผู้ซื้ออัปโหลดรูปสลิปโอนเงินจริง ระบบส่งไปตรวจผ่าน EasySlip
  // API (utils/slipVerification.js) เทียบยอดเงิน+บัญชีผู้รับกับที่คาดไว้ (ราคาสินค้า + เลข
  // พร้อมเพย์ของผู้ขาย) — ผ่านจริงถึงจะ "ยืนยันอัตโนมัติ" (ไม่ต้องรอผู้ขายกดปุ่มเองอีกต่อไป)
  // ส่งของให้ผู้ซื้อทันที + DM ผู้ขายด้วย embed "Payment Verified" ใหม่
  //
  // ⚠️ เส้นทางนี้ "ไม่บังคับ" ถ้ายังไม่ได้ตั้ง EASYSLIP_API_KEY ใน .env (ดูคำเตือนที่
  // utils/slipVerification.js) — ตอบ { ok:false, reason:'not_configured' } กลับไปเฉยๆ ให้
  // ฝั่งหน้าเว็บ fallback ไปใช้ปุ่ม "✅ ฉันจ่ายแล้ว" (mark-paid ด้านบน) + รอผู้ขายยืนยันเองแทน
  // เหมือนเดิมทุกอย่าง ไม่กระทบระบบเดิมเลย
  //
  // ไม่ใช้ requireAuth ห่อ (เหตุผลเดียวกับ /buy, /mark-paid ด้านบน) เช็ค req.session.user
  // ตรงๆ แล้วตอบ 401 เป็น JSON แทน
  app.post('/api/marketplace/orders/:id/verify-slip', (req, res, next) => {
    slipUpload.single('slip')(req, res, (error) => {
      if (error) {
        console.warn('[marketplace verify-slip] อัปโหลดรูปสลิปไม่สำเร็จ:', error.message);
        const message = error.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than the 8MB limit.' : 'Could not read the uploaded slip image. Please try again.';
        return res.status(400).json({ ok: false, reason: 'upload_failed', message });
      }
      next();
    });
  }, async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ ok: false, reason: 'not_logged_in' });
    }

    if (!isSlipVerificationConfigured()) {
      // ยังไม่ตั้ง API key — ไม่ใช่ error ของผู้ซื้อเลย แค่ฟีเจอร์นี้ยังไม่เปิดใช้งานจริง
      return res.json({ ok: false, reason: 'not_configured' });
    }

    const order = getOrder(String(req.params.id || '').toUpperCase());
    if (!order) {
      return res.status(404).json({ ok: false, reason: 'order_not_found' });
    }
    if (order.buyerId !== req.session.user.id) {
      return res.status(403).json({ ok: false, reason: 'not_your_order' });
    }
    if (order.status === 'confirmed') {
      return res.json({ ok: true, reason: 'already_confirmed' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, reason: 'missing_file' });
    }

    const seller = getSeller(order.sellerId);
    const method = getSellerPaymentMethod(seller);
    if (method !== 'promptpay') {
      // ตรวจสลิปอัตโนมัติได้แค่ช่องทาง PromptPay เท่านั้น (มีเลขบัญชีให้เทียบแน่ๆ) — ผู้ขาย
      // ที่ใช้ลิงก์รับเงินสากล (PayPal.me ฯลฯ) ยังใช้ flow เดิม (ผู้ขายยืนยันเอง) เหมือนเดิม
      return res.json({ ok: false, reason: 'unsupported_payment_method' });
    }

    let result;
    try {
      result = await verifySlip({
        imageBuffer: req.file.buffer,
        filename: req.file.originalname,
        expectedAmountThb: order.priceThb,
        expectedPromptPayId: seller.promptpayId,
      });
    } catch (error) {
      console.error(`[marketplace verify-slip] ตรวจสลิปออร์เดอร์ ${order.id} พัง:`, error);
      return res.status(500).json({ ok: false, reason: 'request_failed' });
    }

    if (!result.ok) {
      console.log(`[marketplace verify-slip] ออร์เดอร์ ${order.id} ตรวจสลิปไม่ผ่าน: ${result.reason}`);
      return res.json({ ok: false, reason: result.reason });
    }

    const marketplaceCommand = client.commands.get('marketplace');
    const outcome = await marketplaceCommand.handleSlipVerifiedOrder(client, order);
    console.log(`[marketplace verify-slip] ออร์เดอร์ ${order.id} ตรวจสลิปผ่าน API แล้ว ยืนยันอัตโนมัติ (ผู้ซื้อ ${req.session.user.username})`);
    res.json({ ok: true, reason: 'verified', ...outcome });
  });

  // 🆕 [12 ต.ค. 2569] POST /api/marketplace/reports — ผู้ซื้อกดส่งรายงานผู้ขาย/ประกาศ
  // จากปุ่ม 🚩 บนหน้า product detail (ของเดิม submitReport() ในหน้าเว็บเป็น UI mockup
  // client-side เฉยๆ ไม่มี backend จริงรองรับ — ฟีเจอร์ความปลอดภัย #4 จาก 4 ข้อที่คุยกัน
  // ไว้ตอนเข้าสภา LLM Council เรื่องช่องทางจ่ายเงิน)
  //
  // ใช้ express.json({ limit: '15mb' }) เฉพาะ route นี้ (ไม่ใช่ global) เพราะผู้ซื้อแนบ
  // รูป/วิดีโอหลักฐานมาเป็น base64 data URL ในตัว JSON ได้สูงสุด 4 ไฟล์ (ดู
  // REPORT_EVIDENCE_MAX ใน public/marketplace.html) — 15mb กันพอสำหรับรูปสกรีนช็อตปกติ
  // (จำกัดต่อไฟล์อีกชั้นด้านล่างด้วยที่ 8MB กันไฟล์เดี่ยวใหญ่ผิดปกติ)
  //
  // ไม่ใช้ requireAuth ห่อ (เหตุผลเดียวกับ /buy และ /mark-paid ด้านบน) เช็ค
  // req.session.user ตรงๆ แล้วตอบ 401 เป็น JSON แทน
  app.post('/api/marketplace/reports', express.json({ limit: '15mb' }), async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'not_logged_in', loginUrl: `/auth/login?returnTo=${encodeURIComponent('/marketplace')}` });
    }

    const { listingId, reasonId, reasonLabel, detail, evidence } = req.body || {};
    if (!listingId || !reasonId || !reasonLabel) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    // ยังสร้างรายงานได้แม้หาประกาศเดิมไม่เจอแล้ว (เผื่อผู้ขายปิด/ลบประกาศไปก่อนที่จะมีคน
    // มารายงานทัน) — แค่ไม่มี sellerId แน่ชัดให้แนบไปกับการ์ดแจ้งเตือนเท่านั้น
    const listing = getListing(String(listingId).toUpperCase());
    const sellerId = listing ? listing.sellerId : null;

    // แปลง evidence (base64 data URL จากฝั่งเบราว์เซอร์) เป็น Buffer จริง เตรียมส่งแนบไปกับ
    // การ์ดแจ้งเตือนในห้องรายงานของเซิร์ฟควบคุม — เช็คให้แน่ใจว่าเป็น data URL รูป/วิดีโอจริง
    // และจำกัดไม่เกิน 8MB ต่อไฟล์ กันไฟล์แปลกๆ/ใหญ่ผิดปกติหลุดเข้ามา
    const evidenceList = Array.isArray(evidence) ? evidence.slice(0, 4) : [];
    const attachments = [];
    for (const item of evidenceList) {
      if (!item || typeof item.dataUrl !== 'string') continue;
      const match = /^data:(image|video)\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(item.dataUrl);
      if (!match) continue;
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 8 * 1024 * 1024) continue;
      attachments.push({ attachment: buffer, name: typeof item.name === 'string' ? item.name.slice(0, 100) : 'evidence' });
    }

    const report = createReport({
      listingId: String(listingId).toUpperCase(),
      sellerId,
      reporterId: req.session.user.id,
      reasonId: String(reasonId).slice(0, 40),
      reasonLabel: String(reasonLabel).slice(0, 200),
      detail: typeof detail === 'string' ? detail.slice(0, 1000) : '',
      evidenceCount: attachments.length,
    });

    // โพสต์เข้าเซิร์ฟควบคุมแบบไม่บล็อกการตอบกลับผู้รายงาน — รายงานถูกบันทึกลงไฟล์แล้วแน่ๆ
    // ต่อให้โพสต์เข้าดิสคอร์ดไม่สำเร็จ (ดูเหตุผลเต็มๆ ในคอมเมนต์ notifyMarketplaceReport
    // ใน commands/marketplace.js) ก็ไม่ควรทำให้ผู้รายงานเห็น error ไปด้วย
    const marketplaceCommand = client.commands.get('marketplace');
    const notifyResult = await marketplaceCommand.notifyMarketplaceReport(
      client,
      report,
      listing,
      { id: req.session.user.id, username: req.session.user.username },
      attachments
    );

    res.json({ ok: true, reportId: report.id, notified: notifyResult.posted });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 [21 ต.ค. 2569] Marketplace Feed API — 4 เส้นทาง ให้หน้าเว็บ public/feed.html
  // (static HTML เหมือน marketplace.html — เหตุผลเดียวกับคอมเมนต์ที่ /api/me ด้านบน)
  // เรียกดึง/สร้าง/โหวต/ปิดโพสต์ได้จริง ไม่ใช่ mock data
  //
  // ไม่ผูกกับเซิร์ฟไหนเลย (ต่างจาก /dashboard/:guildId/* ทั้งหมด) เพราะ Feed เป็นฟีเจอร์
  // "ระดับบัญชีผู้ใช้ดิสคอร์ด" ข้ามเซิร์ฟ — ใครก็ได้ที่ login ผ่านเว็บนี้แล้วโพสต์ได้เลย
  // ไม่ต้องมีเซิร์ฟ/ไม่ต้องเชิญบอทเข้าเซิร์ฟตัวเองก่อนด้วยซ้ำ
  // ─────────────────────────────────────────────────────────────────────

  // แปลงรหัสประเทศ ISO 3166-1 alpha-2 (เช่น "TH") เป็นอิโมจิธงชาติ — เทคนิคมาตรฐาน:
  // อิโมจิธงคือตัวอักษร "Regional Indicator Symbol" 2 ตัวต่อกัน แต่ละตัวคือ A-Z บวก
  // offset คงที่ 127397 (0x1F1E6 - 'A'.charCodeAt(0)) — ไม่ใช่การเดา เป็นมาตรฐาน Unicode
  function flagEmojiFor(countryCode) {
    if (!countryCode || countryCode.length !== 2) return null;
    const codePoints = [...countryCode.toUpperCase()].map((c) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  // แปลง post object ที่เก็บในไฟล์ → รูปแบบที่ส่งให้หน้าเว็บใช้ได้เลย (คำนวณคะแนนโหวต,
  // ธงชาติ, และ "โหวตของฉัน" ถ้า login อยู่ — ไม่ส่ง votes object ดิบๆ ออกไปเลย กันเผย
  // รายชื่อ user ID ทุกคนที่เคยโหวตโพสต์นี้ออกสู่สาธารณะโดยไม่จำเป็น)
  function serializePost(post, viewerUserId) {
    return {
      id: post.id,
      authorId: post.authorId, // ใช้แค่เทียบ "เป็นโพสต์ของฉันเองไหม" ฝั่งเบราว์เซอร์ — ไม่ใช่ข้อมูลลับ (Discord user ID มองเห็นได้อยู่แล้วทุกที่ในแอพดิสคอร์ด)
      authorUsername: post.authorUsername,
      authorAvatarUrl: post.authorAvatarUrl,
      type: post.type,
      title: post.title,
      description: post.description,
      tags: post.tags,
      priceAmount: post.priceAmount,
      priceCurrency: post.priceCurrency,
      mediaUrl: post.mediaUrl,
      country: post.country,
      countryFlag: flagEmojiFor(post.country),
      urgent: post.urgent,
      score: feedStorage.scoreOf(post.votes),
      myVote: viewerUserId ? (post.votes[viewerUserId] || 0) : 0,
      createdAt: post.createdAt,
      isMine: viewerUserId === post.authorId,
    };
  }

  // GET /api/feed/posts — รายการโพสต์ active ทั้งหมด (ให้ทุกคนดูได้ ไม่ต้อง login — เหมือน
  // GET /api/marketplace/listings) กรองด้วย ?type=hiring|gigs ได้ (ไม่ใส่ = เอาหมด) ส่ง
  // "trending" (แท็กฮิตจริง) + "topContributors" (ผู้โพสต์คะแนนรวมสูงสุดจริง) แนบไปด้วยใน
  // คำตอบเดียวกันเลย ไม่ต้องให้หน้าเว็บยิง request แยกอีกรอบ (ดูคอมเมนต์หัวไฟล์
  // utils/feedStorage.js ข้อ 2 ว่าทำไม topContributors ไม่ใช่ "Verified")
  app.get('/api/feed/posts', (req, res) => {
    const type = req.query.type === 'hiring' || req.query.type === 'gigs' ? req.query.type : null;
    const viewerUserId = req.session.user?.id || null;
    const posts = feedStorage.listActivePosts({ type }).map((p) => serializePost(p, viewerUserId));
    res.json({
      posts,
      trending: feedStorage.computeTrendingTags(8),
      topContributors: feedStorage.computeTopContributors(5),
    });
  });

  // POST /api/feed/posts — สร้างโพสต์ใหม่ (ต้อง login ก่อนเท่านั้น — เช็ค req.session.user
  // ตรงๆ แล้วตอบ 401 เป็น JSON แทน requireAuth เหตุผลเดียวกับ /buy ด้านบน)
  app.post('/api/feed/posts', express.json({ limit: '32kb' }), (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'not_logged_in', loginUrl: `/auth/login?returnTo=${encodeURIComponent('/feed')}` });
    }
    try {
      const post = feedStorage.createPost({
        ...req.body,
        authorId: req.session.user.id,
        authorUsername: req.session.user.username,
        authorAvatarUrl: req.session.user.avatar || defaultAvatarUrl(req.session.user.id),
      });
      console.log(`[feed] ${req.session.user.username} (${req.session.user.id}) โพสต์ "${post.title}" (${post.id}) ลง Feed แล้ว`);
      res.json({ post: serializePost(post, req.session.user.id) });
    } catch (error) {
      // createPost() โยน Error ข้อความไทยอ่านรู้เรื่องมาให้ตรงๆ อยู่แล้ว (validate ทุกช่อง
      // ในนั้น) ส่งข้อความนั้นกลับไปให้หน้าเว็บโชว์ตรงๆ ได้เลย ไม่ต้องแปลซ้ำ
      res.status(400).json({ error: 'invalid_post', message: error.message });
    }
  });

  // POST /api/feed/posts/:id/vote — โหวตขึ้น/ลง (ต้อง login) body: { direction: 1 | -1 }
  app.post('/api/feed/posts/:id/vote', express.json({ limit: '2kb' }), (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'not_logged_in', loginUrl: `/auth/login?returnTo=${encodeURIComponent('/feed')}` });
    }
    const direction = Number(req.body?.direction);
    if (direction !== 1 && direction !== -1) {
      return res.status(400).json({ error: 'invalid_direction' });
    }
    const result = feedStorage.votePost(String(req.params.id).toUpperCase(), req.session.user.id, direction);
    if (!result) {
      return res.status(404).json({ error: 'post_not_found' });
    }
    res.json(result);
  });

  // POST /api/feed/posts/:id/close — ปิดโพสต์ของตัวเอง (ต้อง login + ต้องเป็นเจ้าของโพสต์
  // เท่านั้น — เช็คสิทธิ์อยู่ข้างใน feedStorage.closePost() แล้ว)
  app.post('/api/feed/posts/:id/close', (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'not_logged_in', loginUrl: `/auth/login?returnTo=${encodeURIComponent('/feed')}` });
    }
    const ok = feedStorage.closePost(String(req.params.id).toUpperCase(), req.session.user.id);
    if (!ok) {
      return res.status(404).json({ error: 'post_not_found_or_not_yours' });
    }
    res.json({ ok: true });
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

    // 🆕 [24 ต.ค. 2569 — ตัดแดชบอร์ด] เดิมแต่ละข้อมี href พาไปหน้าเว็บของฟีเจอร์นั้น ตอนนี้
    // หน้าเว็บพวกนี้ถูกตัดออกแล้ว (ใช้คำสั่งสแลชแทน) เลยเปลี่ยนจาก href เป็น command (ชื่อคำสั่ง
    // สแลชที่ใช้ตั้งค่าได้จริง) แทน — ค่า done ยังคำนวณจากข้อมูลจริงของเซิร์ฟเหมือนเดิมทุกจุด
    const statusItems = [
      { key: 'welcome', label: 'Welcome card', done: Boolean(welcomeConfig), command: '/welcome-setup' },
      { key: 'goodbye', label: 'Goodbye card', done: Boolean(goodbyeConfig), command: '/goodbye-setup' },
      { key: 'roles', label: 'Auto-role system', done: roleSetupCount > 0, command: '/role-setup' },
      { key: 'fonts', label: 'Custom server font', done: fontCount > 0, command: '/fonts' },
      { key: 'builder', label: 'Message Builder draft', done: draftCount > 0, command: '/builder' },
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
      statusItems,
      marketplaceHref: `/dashboard/${guildId}/marketplace`,
      premiumHref: `/premium/${guildId}`,
    }));
  });

  // 🆕 [24 ต.ค. 2569 — ตัดแดชบอร์ด] ตัดหน้า Welcome Card / Goodbye Card / Fonts /
  // Role Setup / Message Builder ออกจากแดชบอร์ดเว็บทั้งหมดแล้วนะครับ (ตามที่น้องหนาว
  // บอกว่าไม่ต้องการให้มันโผล่มาอีก) — ของพวกนี้ยังใช้งานได้ปกติทุกอย่างผ่านคำสั่งสแลช
  // ในดิสคอร์ดเหมือนเดิมทุกตัว ไม่ได้ถูกลบทิ้งไปไหน แค่ตัดหน้าเว็บคู่ขนานออก:
  //   - Welcome Card  → ใช้ /welcome-setup ในดิสคอร์ดแทน
  //   - Goodbye Card  → ใช้ /goodbye-setup ในดิสคอร์ดแทน
  //   - Fonts         → ใช้ /fonts ในดิสคอร์ดแทน
  //   - Role Setup    → ใช้ /role-setup ในดิสคอร์ดแทน
  //   - Message Builder → ใช้ /builder ในดิสคอร์ดแทน
  // ไฟล์เรนเดอร์หน้าเว็บของแต่ละอันเหล่านี้ (utils/renderWelcomeCard.js,
  // renderGoodbyeCard.js, renderFonts.js, renderRoleSetup.js, renderMessageBuilder.js)
  // ก็ลบไปด้วยแล้ว เพราะไม่มีที่ไหนเรียกใช้อีก — หน้า Overview ด้านบนปรับให้โชว์
  // สถานะ (ตั้งค่าแล้ว/ยังไม่ตั้ง) ของแต่ละอย่างแบบอ่านอย่างเดียว พร้อมบอกชื่อคำสั่ง
  // สแลชที่ใช้ตั้งค่าได้แทน ไม่มีปุ่มกดไปหน้าแก้ไขเว็บแล้ว


  // ─────────────────────────────────────────────────────────────────────
  // 🆕 [23 ก.ย. 2569] หน้า Language จริงในแดชบอร์ด — เลือกภาษาที่บอทตอบกลับในเซิร์ฟนี้ได้
  // จากหน้าเว็บโดยตรง แทนที่จะต้องพิมพ์ /language ในดิสคอร์ดเท่านั้น อ่าน/เขียนข้อมูลที่
  // เดียวกับคำสั่งสแลชเป๊ะๆ (utils/languageStorage.js → data/guild-language.json) เปลี่ยน
  // จากตรงไหนก็เห็นผลตรงกันหมด ไม่มีระบบซ้อนทับกัน — ดูคอมเมนต์เต็มๆ ที่หัวไฟล์
  // utils/renderLanguageSettings.js
  //
  // ฟอร์มธรรมดา <form method="POST"> ไม่มี JS/AJAX (ตามธรรมเนียมเดียวกับ
  // /premium/:guildId/checkout ด้านล่าง) ใช้ express.urlencoded({ extended: false }) แบบ
  // ผูกเฉพาะ route นี้ (ไม่ใช่ middleware กลางทั้งแอป) เหมือนกันเป๊ะๆ
  app.get('/dashboard/:guildId/language', requireAuth, requireGuildAccess, (req, res) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const currentLang = getGuildLanguage(guildId);
    // ?saved=1 มาจาก redirect หลังกด Save สำเร็จด้านล่าง — โชว์แบนเนอร์ยืนยันแค่ครั้งเดียว
    const saved = req.query.saved === '1';

    res.send(renderLanguageSettingsPage({
      guild: { id: guildId, name: guild.name, iconUrl: guild.iconURL({ size: 64 }) },
      user: req.session.user,
      botAvatarUrl: client.user.displayAvatarURL({ size: 64 }),
      botName: client.user.username,
      currentLang,
      saved,
    }));
  });

  app.post('/dashboard/:guildId/language', requireAuth, requireGuildAccess, express.urlencoded({ extended: false }), (req, res) => {
    const { guildId } = req.params;
    const lang = req.body?.lang;
    // ✅ validate ให้แน่ใจว่าเป็น 'en'/'th' เท่านั้น — กันคนแก้ค่าในฟอร์ม (devtools) ส่งค่า
    // แปลกๆ เข้ามาแล้วไปเก็บลงไฟล์ data/guild-language.json เละ
    if (lang !== 'en' && lang !== 'th') {
      return res.redirect(`/dashboard/${guildId}/language`);
    }
    setGuildLanguage(guildId, lang);
    console.log(`[dashboard] ${req.session.user.username} (${req.session.user.id}) เปลี่ยนภาษาบอทของเซิร์ฟ ${guildId} เป็น "${lang}" แล้ว`);
    res.redirect(`/dashboard/${guildId}/language?saved=1`);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 [11 ต.ค. 2569] หน้า Marketplace จริงในแดชบอร์ด — ย้ายฟีเจอร์ของคำสั่ง /marketplace
  // (sell / mylistings / remove / markselling / setpromptpay) มาทำบนเว็บทั้งหมด ตามที่
  // น้องหนาวขอ ("เข้าหน้าเว็บอยู่แล้ว ยังต้องกลับมาทำอะไรที่ดิสคอร์ด มันไม่ใช่") คำสั่งเดิม
  // ในดิสคอร์ดยังใช้ได้อยู่เหมือนกัน (ไม่ได้ลบ) — ข้อมูลที่เดียวกัน (data/marketplace.json)
  // เปลี่ยนจากฝั่งไหนก็เห็นผลเหมือนกันหมด ดู utils/renderMarketplaceDashboard.js สำหรับ HTML
  //
  // 🆕 marketplaceUpload = ตัวอ่านฟอร์ม multipart เฉพาะฟอร์มลงขายสินค้า (รูปปก + ไฟล์ดิจิทัล)
  // จำกัดไฟล์ละ 20MB (เผื่อไว้ให้พอกับลิมิตอัปโหลดไฟล์ของบอทบน Discord เอง ~25MB) — ใช้
  // memoryStorage() เก็บเป็น Buffer ในหน่วยความจำชั่วคราวเท่านั้น ไม่เขียนลงดิสก์เลย (ดู
  // เหตุผลที่ require('multer') ด้านบนสุดของไฟล์)
  const marketplaceUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  // GET หน้า Marketplace — ดึงข้อมูลพร้อมเพย์ของตัวเอง + ประกาศขายทั้งหมดของตัวเอง (resolve
  // รูปปกให้สดใหม่ด้วย เอาไว้โชว์เป็น thumbnail เล็กๆ ในตาราง "My listings")
  app.get('/dashboard/:guildId/marketplace', requireAuth, requireGuildAccess, async (req, res) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const seller = getSeller(req.session.user.id);
    const myListings = listSellerListings(req.session.user.id);
    const listingsWithImages = await Promise.all(
      myListings.map(async (item) => {
        const { imageUrl } = await resolveListingAssets(client, item);
        return { ...item, imageUrl };
      })
    );
    // 🆕 [13 ต.ค. 2569 — รอบ 6 ดีไซน์ใหม่] ยอดขายสำเร็จรวมทั้งร้าน เอาไปโชว์ที่หัวหน้า
    // ของหน้า Marketplace ("sales completed") — ฟังก์ชันนี้มีอยู่แล้ว (ใช้กับ endpoint
    // สาธารณะ /api/marketplace/listings อยู่ก่อนแล้ว) แค่ route แดชบอร์ดนี้ยังไม่เคยเรียกใช้
    const { completedSales } = getSellerStats(req.session.user.id);

    // 🆕 [15 ต.ค. 2569 — รอบ 11] ปุ่ม "Edit" บนการ์ดลิงก์มาที่หน้านี้พร้อม ?edit=<listingId>
    // (ไม่ทำ route/หน้าใหม่แยก — ใช้หน้าเดิมเปิดไปที่แผง "Create Listing" แทน แค่ pre-fill
    // ข้อมูลเดิมเข้าไปในฟอร์มเดียวกัน) เช็คเจ้าของก่อนด้วยเสมอ กันคนอื่นแก้ query string เอง
    // มาดู/แก้ประกาศของคนอื่น — ถ้าไม่ใช่เจ้าของหรือไม่เจอ ก็แค่เปิดเป็นโหมดสร้างใหม่ปกติ
    let editingListing = null;
    if (req.query.edit) {
      const target = getListing(String(req.query.edit).toUpperCase());
      if (target && target.sellerId === req.session.user.id) {
        const resolved = await resolveListingAssets(client, target);
        editingListing = { ...target, ...resolved };
      }
    }

    res.send(renderMarketplaceDashboardPage({
      guild: { id: guildId, name: guild.name, iconUrl: guild.iconURL({ size: 64 }) },
      user: req.session.user,
      botAvatarUrl: client.user.displayAvatarURL({ size: 64 }),
      botName: client.user.username,
      seller,
      listings: listingsWithImages,
      categories: CATEGORIES,
      saved: req.query.saved === '1',
      deleted: req.query.deleted === '1',
      error: req.query.error || null,
      completedSales,
      editingListing,
    }));
  });

  // 🆕 [12 ต.ค. 2569] POST ตั้ง/แก้ "ช่องทางรับเงิน" — เดิมชื่อ route /promptpay รับแค่
  // เลขพร้อมเพย์อย่างเดียว (คนต่างชาติใช้ไม่ได้เลย) ตอนนี้เปลี่ยนเป็น /payment รับได้ทั้ง 2
  // ช่องทาง (payment_method = 'promptpay' | 'link') ตามที่ผู้ขายเลือกจากฟอร์มใน
  // utils/renderMarketplaceDashboard.js — ดูเหตุผลเต็มๆ ที่คอมเมนต์หัวไฟล์
  // utils/marketplaceStorage.js หัวข้อ saveSellerPayment
  app.post('/dashboard/:guildId/marketplace/payment', requireAuth, requireGuildAccess, express.urlencoded({ extended: false }), (req, res) => {
    const { guildId } = req.params;
    const method = req.body?.payment_method === 'link' ? 'link' : 'promptpay';

    if (method === 'promptpay') {
      const rawValue = String(req.body?.promptpay_id || '').trim();
      if (!PROMPTPAY_ID_PATTERN.test(rawValue)) {
        return res.redirect(`/dashboard/${guildId}/marketplace?error=${encodeURIComponent('Please enter a valid 10-digit PromptPay mobile number.')}`);
      }
      saveSellerPayment(req.session.user.id, { method: 'promptpay', promptpayId: rawValue }, req.session.user.username);
    } else {
      const rawLink = String(req.body?.payment_link || '').trim();
      if (!PAYMENT_LINK_PATTERN.test(rawLink) || rawLink.length > MAX_PAYMENT_LINK_LENGTH) {
        return res.redirect(`/dashboard/${guildId}/marketplace?error=${encodeURIComponent('Please enter a valid https:// payment link (e.g. your PayPal.me or Stripe Payment Link).')}`);
      }
      saveSellerPayment(req.session.user.id, { method: 'link', paymentLink: rawLink }, req.session.user.username);
    }

    console.log(`[dashboard] ${req.session.user.username} (${req.session.user.id}) ตั้ง/แก้ช่องทางรับเงิน Marketplace แล้ว (${method})`);
    res.redirect(`/dashboard/${guildId}/marketplace?saved=1`);
  });

  // POST ลงขายสินค้าใหม่ — ตัวเดียวกับ /marketplace sell ในดิสคอร์ด เป๊ะๆ (ตรรกะ validate
  // เหมือนกันทุกจุด) ต่างแค่ "ที่มาของรูป/ไฟล์แนบ" เป็น multipart upload จากเว็บแทน Discord
  // attachment — ทั้งคู่ใช้ storeImagePermanently/storeBufferPermanently เก็บแบบถาวรเหมือนกัน
  app.post(
    '/dashboard/:guildId/marketplace/listings',
    requireAuth,
    requireGuildAccess,
    (req, res, next) => {
      // 🆕 ห่อ marketplaceUpload เองอีกชั้น (ไม่ผูกเป็น middleware ตรงๆ ใน app.post ด้านล่าง)
      // เพื่อจับ error จาก multer เองได้ (เช่นไฟล์ใหญ่เกิน 20MB) แล้ว redirect กลับไปพร้อม
      // ข้อความอธิบายที่คนอ่านเข้าใจได้ — ถ้าไม่จับไว้แบบนี้ Express จะโชว์หน้า error ดิบๆ
      // ของ multer ตรงๆ ให้ผู้ใช้เห็นเลย อ่านไม่รู้เรื่องแน่นอน
      marketplaceUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'digitalFile', maxCount: 1 }])(req, res, (error) => {
        if (error) {
          console.warn('[dashboard marketplace] อัปโหลดไฟล์ไม่สำเร็จ:', error.message);
          const message = error.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than the 20MB limit.' : 'Could not read the uploaded file(s). Please try again.';
          return res.redirect(`/dashboard/${req.params.guildId}/marketplace?error=${encodeURIComponent(message)}`);
        }
        next();
      });
    },
    async (req, res) => {
      const { guildId } = req.params;
      const guild = client.guilds.cache.get(guildId);
      const body = req.body || {};

      const fail = (message) => res.redirect(`/dashboard/${guildId}/marketplace?error=${encodeURIComponent(message)}`);

      const title = String(body.title || '').trim().slice(0, 80);
      const description = String(body.description || '').trim().slice(0, 1000);
      const priceThb = Number(body.price);
      const category = String(body.category || '');
      const subcategory = body.subcategory ? String(body.subcategory) : null;
      const type = body.type === 'digital' ? 'digital' : 'service';
      const categoryInfo = CATEGORIES[category];

      if (!title) return fail('Please enter a title.');
      if (!description) return fail('Please enter a description.');
      if (!Number.isFinite(priceThb) || priceThb <= 0 || priceThb > MAX_PRICE_THB) {
        return fail(`Price must be between 1 and ${MAX_PRICE_THB} THB.`);
      }
      if (!categoryInfo) return fail('Please choose a valid category.');
      if (categoryInfo.subcategories) {
        if (!subcategory || !categoryInfo.subcategories.includes(subcategory)) {
          return fail(`Category "${categoryInfo.label}" requires a subcategory: ${categoryInfo.subcategories.join(', ')}`);
        }
      } else if (subcategory) {
        return fail(`Category "${categoryInfo.label}" doesn't have subcategories.`);
      }

      // 🆕 [12 ต.ค. 2569] ต้องตั้งช่องทางรับเงิน (PromptPay หรือลิงก์สากล) ไว้ก่อนแล้ว
      // เท่านั้นถึงจะลงขายได้ (เช็คซ้ำอีกชั้นฝั่ง server แม้ฟอร์มจะ disable ไว้แล้วถ้ายังไม่
      // ตั้ง — เผื่อคนแก้ HTML เองจาก devtools) — ใช้ hasPaymentMethodSet() แทนการเช็ค
      // seller.promptpayId ตรงๆ เพราะตอนนี้รองรับ "link" ด้วย
      const seller = getSeller(req.session.user.id);
      if (!hasPaymentMethodSet(seller)) {
        return fail('Please set up a payment method first before creating a listing.');
      }

      const imageFile = req.files?.image?.[0];
      const digitalFile = req.files?.digitalFile?.[0];

      // 🆕 [15 ต.ค. 2569 — รอบ 10] วิธีส่งมอบไฟล์ดิจิทัล: "file" (อัปโหลดไฟล์จริง — ของเดิม)
      // หรือ "link" (วางลิงก์ระบบ/เทมเพลต เช่น discord.new/... หรือลิงก์เชิญบอท — สำหรับผู้ขาย
      // สาย "ขายระบบ" ที่ไม่มีไฟล์จริงให้อัปโหลด) ค่าจาก <input type="hidden" name="delivery_method">
      // ในฟอร์ม — เช็คซ้ำฝั่งนี้เสมอ (เผื่อคนแก้ HTML เอง/ปิด JS หลบการเช็คฝั่ง client ไป)
      // 🆕 [15 ต.ค. 2569 — รอบ 11] เพิ่มวิธีส่งมอบที่ 3: "miloconfig" (ส่งรหัสการตั้งค่า
      // Milo Bot ให้ผู้ซื้อแทนไฟล์/ลิงก์ — สำหรับผู้ขายที่ขาย setup ที่สร้างด้วย Milo Bot เอง)
      const deliveryMethod = body.delivery_method === 'link' ? 'link' : body.delivery_method === 'miloconfig' ? 'miloconfig' : 'file';
      const digitalLinkRaw = String(body.digitalLink || '').trim();
      const digitalConfigKeyRaw = String(body.digitalConfigKey || '').trim();

      if (type === 'digital') {
        if (deliveryMethod === 'link') {
          // ใช้ PAYMENT_LINK_PATTERN/MAX_PAYMENT_LINK_LENGTH ตัวเดียวกับช่องทางรับเงิน (รอบ 4)
          // เพราะเป็นกฎเดียวกันเป๊ะๆ: ต้องเป็น https:// เท่านั้น ไม่เกิน 300 ตัวอักษร
          if (!PAYMENT_LINK_PATTERN.test(digitalLinkRaw) || digitalLinkRaw.length > MAX_PAYMENT_LINK_LENGTH) {
            return fail('Please enter a valid https:// link for the Discord Server Template customers will receive.');
          }
        } else if (deliveryMethod === 'miloconfig') {
          if (!MILO_CONFIG_KEY_PATTERN.test(digitalConfigKeyRaw)) {
            return fail('Please enter a valid Milo Bot configuration key (letters, numbers, - or _ only, 4-120 characters).');
          }
        } else if (!digitalFile) {
          return fail('Please attach the digital file customers will receive automatically.');
        }
      }

      try {
        const imageRef = imageFile ? await storeBufferPermanently(guild, imageFile.buffer, imageFile.originalname) : null;
        const fileRef = type === 'digital' && deliveryMethod === 'file' && digitalFile
          ? await storeBufferPermanently(guild, digitalFile.buffer, digitalFile.originalname)
          : null;

        createListing({
          sellerId: req.session.user.id,
          title,
          description,
          priceThb,
          category,
          subcategory,
          type,
          deliveryMethod,
          digitalFileUrl: fileRef,
          digitalLinkUrl: type === 'digital' && deliveryMethod === 'link' ? digitalLinkRaw : null,
          digitalConfigKey: type === 'digital' && deliveryMethod === 'miloconfig' ? digitalConfigKeyRaw : null,
          imageUrl: imageRef,
          // 🆕 [19 ต.ค. 2569] จุดโฟกัสแนวตั้งของรูปปก (0-100%) จากฟีเจอร์ "ลากเพื่อเลือกจุด
          // โฟกัส" ในฟอร์ม — <input type="hidden" name="imageFocusY"> ไม่มีรูปก็ส่งมาไม่เป็นไร
          // (createListing() มี clampFocusY() ดูแล fallback 50 อยู่แล้ว)
          imageFocusY: body.imageFocusY,
        });
      } catch (error) {
        console.error('[dashboard marketplace] สร้างประกาศขายจากเว็บไม่สำเร็จ:', error);
        return fail('Something went wrong while saving your listing. Please try again.');
      }

      console.log(`[dashboard] ${req.session.user.username} (${req.session.user.id}) ลงขายสินค้าใหม่ผ่านเว็บแล้ว: "${title}"`);
      res.redirect(`/dashboard/${guildId}/marketplace?saved=1`);
    }
  );

  // 🆕 [15 ต.ค. 2569 — รอบ 11] POST แก้ไขประกาศที่มีอยู่แล้ว — ตรรกะ validate เหมือน POST
  // สร้างประกาศใหม่ด้านบนเป๊ะๆ ต่างกันแค่: (1) เช็คเจ้าของประกาศเดิมก่อนเสมอ (2) รูปปก/ไฟล์
  // ดิจิทัลเป็น "ตัวเลือก" — ถ้าผู้ขายไม่ได้อัปโหลดใหม่ ก็เก็บของเดิมไว้ (ไม่ใช่ล้างทิ้งเฉยๆ)
  app.post(
    '/dashboard/:guildId/marketplace/listings/:listingId/update',
    requireAuth,
    requireGuildAccess,
    (req, res, next) => {
      marketplaceUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'digitalFile', maxCount: 1 }])(req, res, (error) => {
        if (error) {
          console.warn('[dashboard marketplace] อัปโหลดไฟล์ไม่สำเร็จ (แก้ไขประกาศ):', error.message);
          const message = error.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than the 20MB limit.' : 'Could not read the uploaded file(s). Please try again.';
          return res.redirect(`/dashboard/${req.params.guildId}/marketplace?edit=${req.params.listingId}&error=${encodeURIComponent(message)}`);
        }
        next();
      });
    },
    async (req, res) => {
      const { guildId, listingId } = req.params;
      const guild = client.guilds.cache.get(guildId);
      const body = req.body || {};
      const existing = getListing(String(listingId).toUpperCase());

      const fail = (message) => res.redirect(`/dashboard/${guildId}/marketplace?edit=${listingId}&error=${encodeURIComponent(message)}`);

      if (!existing || existing.sellerId !== req.session.user.id) {
        return fail('Listing not found, or you are not the owner of this listing.');
      }

      const title = String(body.title || '').trim().slice(0, 80);
      const description = String(body.description || '').trim().slice(0, 1000);
      const priceThb = Number(body.price);
      const category = String(body.category || '');
      const subcategory = body.subcategory ? String(body.subcategory) : null;
      const type = body.type === 'digital' ? 'digital' : 'service';
      const categoryInfo = CATEGORIES[category];

      if (!title) return fail('Please enter a title.');
      if (!description) return fail('Please enter a description.');
      if (!Number.isFinite(priceThb) || priceThb <= 0 || priceThb > MAX_PRICE_THB) {
        return fail(`Price must be between 1 and ${MAX_PRICE_THB} THB.`);
      }
      if (!categoryInfo) return fail('Please choose a valid category.');
      if (categoryInfo.subcategories) {
        if (!subcategory || !categoryInfo.subcategories.includes(subcategory)) {
          return fail(`Category "${categoryInfo.label}" requires a subcategory: ${categoryInfo.subcategories.join(', ')}`);
        }
      } else if (subcategory) {
        return fail(`Category "${categoryInfo.label}" doesn't have subcategories.`);
      }

      const imageFile = req.files?.image?.[0];
      const digitalFile = req.files?.digitalFile?.[0];
      const deliveryMethod = body.delivery_method === 'link' ? 'link' : body.delivery_method === 'miloconfig' ? 'miloconfig' : 'file';
      const digitalLinkRaw = String(body.digitalLink || '').trim();
      const digitalConfigKeyRaw = String(body.digitalConfigKey || '').trim();

      // ⚠️ ไม่บังคับว่าต้องมีไฟล์/ลิงก์/รหัสใหม่เสมอ เหมือนตอนสร้างครั้งแรก เพราะตอนแก้ไข
      // ผู้ขายอาจจะ "ไม่เปลี่ยน" ไฟล์ดิจิทัลเลยก็ได้ (ใช้ของเดิมต่อ) — เช็คแค่ตอนที่เลือกวิธี
      // ส่งมอบแบบ "link"/"miloconfig" แล้วค่าที่กรอกมาไม่ถูกต้องเท่านั้น ถ้าเลือก "file" และ
      // ไม่มีไฟล์ใหม่แนบมา ก็แปลว่าจะใช้ไฟล์เดิมต่อ (เช็คว่ามีไฟล์เดิมจริงด้านล่าง)
      if (type === 'digital') {
        if (deliveryMethod === 'link') {
          if (!PAYMENT_LINK_PATTERN.test(digitalLinkRaw) || digitalLinkRaw.length > MAX_PAYMENT_LINK_LENGTH) {
            return fail('Please enter a valid https:// link for the Discord Server Template customers will receive.');
          }
        } else if (deliveryMethod === 'miloconfig') {
          if (!MILO_CONFIG_KEY_PATTERN.test(digitalConfigKeyRaw)) {
            return fail('Please enter a valid Milo Bot configuration key (letters, numbers, - or _ only, 4-120 characters).');
          }
        } else if (!digitalFile && !(existing.deliveryMethod === 'file' && existing.digitalFileUrl)) {
          return fail('Please attach the digital file customers will receive automatically.');
        }
      }

      try {
        // รูปปก: มีอัปโหลดใหม่ → เก็บใหม่แทนที่ / ไม่มี → เก็บของเดิมไว้ (existing.imageUrl
        // อาจเป็น object พิกัด asset-storage หรือ string ดิบเก่าก็ได้ ส่งผ่านตรงๆได้เลย)
        const imageRef = imageFile ? await storeBufferPermanently(guild, imageFile.buffer, imageFile.originalname) : existing.imageUrl;
        const fileRef = type === 'digital' && deliveryMethod === 'file'
          ? (digitalFile ? await storeBufferPermanently(guild, digitalFile.buffer, digitalFile.originalname) : existing.digitalFileUrl)
          : null;

        updateListing(existing.id, req.session.user.id, {
          title,
          description,
          priceThb,
          category,
          subcategory,
          type,
          deliveryMethod,
          digitalFileUrl: fileRef,
          digitalLinkUrl: type === 'digital' && deliveryMethod === 'link' ? digitalLinkRaw : null,
          digitalConfigKey: type === 'digital' && deliveryMethod === 'miloconfig' ? digitalConfigKeyRaw : null,
          imageUrl: imageRef,
          // 🆕 [19 ต.ค. 2569] ไม่ได้ลากปรับใหม่ตอนแก้ไข (เช่นไม่ได้อัปโหลดรูปใหม่เลย) ก็ยังส่ง
          // ค่าเดิมของ hidden input กลับมาอยู่ดี (ดู sellWizardHtml() เติมค่าเดิมให้ตอนโหลดฟอร์ม
          // แก้ไข) ไม่ต้อง fallback เป็น existing.imageFocusY เองตรงนี้
          imageFocusY: body.imageFocusY,
        });
      } catch (error) {
        console.error('[dashboard marketplace] แก้ไขประกาศขายจากเว็บไม่สำเร็จ:', error);
        return fail('Something went wrong while saving your changes. Please try again.');
      }

      console.log(`[dashboard] ${req.session.user.username} (${req.session.user.id}) แก้ไขประกาศ "${title}" (${existing.id}) แล้ว`);
      res.redirect(`/dashboard/${guildId}/marketplace?saved=1`);
    }
  );

  // 🆕 [15 ต.ค. 2569 — รอบ 11] POST ลบประกาศทิ้งถาวร — เช็คเจ้าของก่อนเสมอ เหมือน close/reopen
  // ต่างจาก close ตรงที่ลบ record ออกจากไฟล์จริงๆ กู้คืนไม่ได้ (ฝั่งหน้าเว็บมี confirm()
  // ก่อนกดปุ่มนี้แล้ว — ดู utils/renderMarketplaceDashboard.js listingCardHtml())
  app.post('/dashboard/:guildId/marketplace/listings/:listingId/delete', requireAuth, requireGuildAccess, (req, res) => {
    const { guildId, listingId } = req.params;
    deleteListing(String(listingId).toUpperCase(), req.session.user.id);
    res.redirect(`/dashboard/${guildId}/marketplace?deleted=1`);
  });

  // POST ปิด/เปิดขายใหม่ — ตัวเดียวกับ /marketplace remove และ /marketplace markselling
  // เช็คเจ้าของก่อนเสมอ (listing.sellerId ต้องตรงกับคนที่ login อยู่) กันแก้ประกาศของคนอื่น
  app.post('/dashboard/:guildId/marketplace/listings/:listingId/close', requireAuth, requireGuildAccess, (req, res) => {
    const { guildId, listingId } = req.params;
    const listing = getListing(String(listingId).toUpperCase());
    if (listing && listing.sellerId === req.session.user.id) {
      setListingStatus(listing.id, 'removed');
    }
    res.redirect(`/dashboard/${guildId}/marketplace?saved=1`);
  });

  app.post('/dashboard/:guildId/marketplace/listings/:listingId/reopen', requireAuth, requireGuildAccess, (req, res) => {
    const { guildId, listingId } = req.params;
    const listing = getListing(String(listingId).toUpperCase());
    if (listing && listing.sellerId === req.session.user.id) {
      setListingStatus(listing.id, 'active');
    }
    res.redirect(`/dashboard/${guildId}/marketplace?saved=1`);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 หน้า Premium & Billing จริง (เพิ่ม 19 ก.ย. 2569, ย้ายออกจาก /dashboard/:guildId/premium
  // มาเป็น /premium/... ตอนดึกมากของวันเดียวกัน) — น้องหนาวขอให้เลือกจ่ายได้ 2 ทางจากหน้าเว็บ:
  // บัตรเครดิต กับ PromptPay QR ทั้งคู่ไปจบที่ Stripe เหมือนกัน แต่ "กลไกข้างใน" ต่างกันโดย
  // เนื้อแท้ เพราะ Stripe ไม่รองรับ PromptPay กับ subscription แบบหักเงินอัตโนมัติ
  // (charge_automatically ที่ Checkout Session โหมด subscription ใช้อยู่) — รองรับแค่แบบ
  // "ออกใบแจ้งหนี้ให้จ่ายเอง" (collection_method: 'send_invoice') เท่านั้น (เช็คจากเอกสาร
  // Stripe https://docs.stripe.com/payments/promptpay แล้ว มีคอลัมน์ Subscriptions ระบุไว้
  // ชัดเจน พร้อมเชิงอรรถว่าต้องใช้ send_invoice)
  //
  //   • บัตรเครดิต → ใช้ Stripe Checkout Session mode:'subscription' เหมือนปุ่ม "สมัคร
  //     พรีเมียม" ใน commands/premium.js เป๊ะๆ (แค่เปลี่ยนที่มาของ guildId/discordUserId
  //     จาก interaction เป็น session ที่ login ค้างไว้แทน) → หักเงินอัตโนมัติทุกเดือน
  //     เงียบๆ เหมือนเดิมทุกอย่าง
  //   • PromptPay → สร้าง Stripe Subscription ตรงๆ ผ่าน API (ไม่ผ่าน Checkout Session
  //     เพราะ Checkout โหมด subscription ไม่รองรับ PromptPay) ด้วย collection_method:
  //     'send_invoice' → ได้ invoice ใบแรกมาทันที เอา hosted_invoice_url (หน้า Stripe ที่มี
  //     QR ให้สแกน) ไป redirect ลูกค้าไปจ่ายต่อเลย ทุกเดือนถัดไป Stripe จะออก invoice ใหม่ +
  //     อีเมลลิงก์ไปให้เองอัตโนมัติ (ลูกค้าต้องกลับมาสแกนจ่ายใหม่ทุกเดือนเอง ไม่ใช่หัก
  //     อัตโนมัติแบบบัตร) — webhook invoice.payment_succeeded ที่มีอยู่แล้วด้านล่างครอบคลุม
  //     การปลดล็อก premium ให้ทั้ง 2 ทางนี้อยู่แล้วในตัว (เช็ค subscription.metadata.guildId
  //     เหมือนกันหมด ไม่สนว่า subscription ถูกสร้างผ่าน Checkout หรือผ่าน API ตรงๆ) — เลย
  //     ไม่ต้องเพิ่ม case ใหม่ในนั้น แค่เพิ่มส่วนส่ง DM แจ้งเตือน + เครดิตค่าคอมโค้ดส่วนลด
  //     สำหรับทาง PromptPay โดยเฉพาะ (ดูคอมเมนต์ตรงนั้น)
  //
  // ⚠️ จุดที่ยังไม่ได้ทำ (บอกน้องหนาวไว้ในแชทแล้ว): ถ้าลูกค้าฝั่ง PromptPay เพิกเฉยไม่จ่าย
  // invoice รอบต่ออายุเลย ตอนนี้ยังไม่มีระบบดีดกลับเป็น free อัตโนมัติ — Stripe ไม่ได้ยิง
  // webhook บอกเราตรงๆ ว่า "invoice เลยกำหนดจ่ายแล้ว" ต้องทำ scheduled job แยกต่างหากไปไล่
  // เช็ค invoice ที่ค้างจ่ายเกินกำหนดเองอีกที (งานถัดไป ยังไม่ได้เขียน)
  const PROMPTPAY_INVOICE_DAYS_UNTIL_DUE = 3;

  // ─────────────────────────────────────────────────────────────────────
  // 🆕 [19 ก.ย. 2569 ดึกมาก] GET /premium/start — จุดเข้าใหม่จากปุ่ม "Subscribe to Premium"
  // ในหน้า public/pricing.html แทนที่จะพาไปหน้าเชิญบอทเฉยๆ เหมือนเดิม (น้องหนาวไม่อยากให้
  // หน้าจ่ายเงินไปโผล่ในแดชบอร์ด รู้สึกซ้ำกับ Pricing — เลยย้ายจุดเริ่มมาไว้ที่นี่แทน)
  //
  // ต้อง login ก่อน (requireAuth เด้งไป /auth/login?returnTo=/premium/start ให้เองถ้ายัง
  // ไม่ login แล้วพากลับมาที่นี่หลัง login เสร็จอัตโนมัติ) — ดึงเซิร์ฟที่มีสิทธิ์ Manage
  // Server ทั้งหมดมาก่อน (เหมือนหน้า /dashboard เป๊ะๆ) ไม่กรอง hasBot ออกตั้งแต่ตรงนี้
  // เพราะอยากให้หน้าเลือกเซิร์ฟยังโชว์ปุ่ม "+ Invite bot" ของเซิร์ฟที่ยังไม่มีบอทได้ด้วย
  // (renderPremiumServerPickerPage จัดการแยกแสดงผลให้เองข้างใน) — ถ้ามีเซิร์ฟที่ "มีบอทอยู่
  // แล้วจริง" พอดีแค่เซิร์ฟเดียว ค่อยเด้งข้ามหน้าเลือกไปหน้าเลือกวิธีจ่ายเงินของเซิร์ฟนั้นตรงๆ
  // เลย (ลดขั้นตอน) — ถ้ามีหลายเซิร์ฟ หรือไม่มีเซิร์ฟไหนมีบอทอยู่เลย ค่อยโชว์หน้าเลือกตามปกติ
  app.get('/premium/start', requireAuth, (req, res) => {
    // 🆕 [21 ก.ย. 2569] ใช้ computeManageableServers() ตัวกลางแทนที่จะคำนวณเองซ้ำ
    // (ดูคอมเมนต์เต็มๆ ตรงที่ประกาศฟังก์ชันนี้ ใกล้ๆ route /dashboard ด้านบน) — ผลลัพธ์
    // หน้าตาเหมือนเดิมทุกฟิลด์ ต่างแค่ตอนนี้เรียงเซิร์ฟที่มีบอทขึ้นก่อนให้ด้วยเหมือนหน้า
    // /dashboard (เดิมโค้ดจุดนี้ไม่ได้ sort เลย) ซึ่งเป็นผลข้างเคียงที่ดี ไม่ใช่บั๊ก
    const manageableGuilds = computeManageableServers(req.session.guilds);

    const guildsWithBot = manageableGuilds.filter((g) => g.hasBot);
    if (guildsWithBot.length === 1) {
      return res.redirect(`/premium/${guildsWithBot[0].id}`);
    }

    res.send(renderPremiumServerPickerPage({
      user: req.session.user,
      servers: manageableGuilds,
      inviteUrl: buildInviteUrl(),
      botAvatarUrl: client.user.displayAvatarURL({ size: 64 }),
    }));
  });

  app.get('/premium/:guildId', requireAuth, requireGuildAccess, (req, res) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const tier = getGuildTier(guildId);
    const subscriptionInfo = getSubscriptionInfo(guildId);
    // ข้อความ error (ถ้ามี) ส่งกลับมาทาง query string ตอน redirect กลับจาก route POST
    // ด้านล่าง เช่น ?error=Something%20went%20wrong — เก็บเป็น query แทน session เพราะ
    // เป็นข้อความชั่วคราวโชว์ครั้งเดียวพอ ไม่ต้องอยู่ถาวรใน session
    const errorMessage = typeof req.query.error === 'string' ? req.query.error.slice(0, 200) : null;

    res.send(renderPremiumBillingPage({
      guild: { id: guildId, name: guild.name, iconUrl: guild.iconURL({ size: 64 }) },
      user: req.session.user,
      botAvatarUrl: client.user.displayAvatarURL({ size: 64 }),
      botName: client.user.username,
      tier,
      subscriptionInfo,
      errorMessage,
    }));
  });

  app.post('/premium/:guildId/checkout', requireAuth, requireGuildAccess, express.urlencoded({ extended: false }), async (req, res) => {
    const { guildId } = req.params;
    const method = req.body?.method;
    // 🆕 [ช่องกรอกโค้ดส่วนลดบนหน้าเว็บ] ไม่บังคับกรอก — เว้นว่างไว้ก็สมัครราคาเต็มได้ปกติ
    const rawDiscountCode = typeof req.body?.discountCode === 'string' ? req.body.discountCode.trim() : '';

    // 🔒 กันเคสเดียวกับ commands/premium.js บรรทัด ~156 — เช็คสถานะ "ล่าสุด" ก่อนเสมอ
    // กันไปสร้าง subscription ที่ 2 ซ้อนทับเซิร์ฟที่เพิ่งสมัครสำเร็จไปแล้วระหว่างที่หน้าเว็บ
    // เปิดค้างไว้ (เช่นเปิด 2 แท็บ หรือกดปุ่มซ้ำ)
    if (isPremiumGuild(guildId)) {
      return res.redirect(`/premium/${guildId}`);
    }

    // 🆕 [23 ก.ย. 2569] เพิ่ม 'paypal' เข้ามาเป็นตัวเลือกที่ 3 — ปุ่ม Apple Pay/Google Pay บน
    // หน้าเว็บใหม่ยังคงส่ง method เป็น 'card' เหมือนเดิม (ไม่ใช่ช่องทางแยก ดูคอมเมนต์ยาวๆ ใน
    // renderPremiumBilling.js ว่าทำไม) เลยไม่ต้องเพิ่มเงื่อนไขอะไรเพิ่มสำหรับ 2 ปุ่มนั้น
    if (method !== 'card' && method !== 'promptpay' && method !== 'paypal') {
      return res.redirect(`/premium/${guildId}?error=${encodeURIComponent('Please pick a payment method.')}`);
    }

    // 🆕 ตรวจโค้ดส่วนลด (ถ้ามีกรอกมา) — ใช้ฟังก์ชันชุดเดียวกับที่ปุ่ม "มีโค้ดส่วนลด?" ใน
    // ดิสคอร์ดใช้เป๊ะๆ (getActiveCode/hasGuildUsedCode) กันไม่ให้พฤติกรรม 2 ทางเพี้ยนไปจากกัน
    let codeEntry = null;
    if (rawDiscountCode) {
      codeEntry = getActiveCode(rawDiscountCode);
      if (!codeEntry) {
        return res.redirect(`/premium/${guildId}?error=${encodeURIComponent('That discount code is invalid or no longer active.')}`);
      }
      if (hasGuildUsedCode(guildId, rawDiscountCode)) {
        return res.redirect(`/premium/${guildId}?error=${encodeURIComponent('This server has already used this discount code.')}`);
      }
    }

    const discordUserId = req.session.user.id;

    try {
      if (method === 'card') {
        // ── ทางบัตรเครดิต: Checkout Session แบบ subscription เหมือนใน commands/premium.js
        // เป๊ะๆ ต่างกันแค่ success_url/cancel_url ชี้กลับมาที่หน้านี้แทนหน้า /success, /cancel
        // แบบข้อความเปล่าๆ ที่ใช้กับฝั่งดิสคอร์ด (ฝั่งเว็บมีหน้าให้กลับไปอยู่แล้วในตัว)
        //
        // ⚠️ ห้ามใส่ allow_promotion_codes: true คู่กับ discounts พร้อมกันเด็ดขาด (Stripe
        // error ทันที) — มีโค้ดที่ตรวจผ่านแล้ว ใช้ discounts แนบให้เอง ไม่มีโค้ด ค่อยเปิด
        // ช่อง allow_promotion_codes ให้ลูกค้าพิมพ์เองที่หน้า Stripe แทน (เหมือนปุ่ม
        // "สมัครพรีเมียม" ธรรมดาในดิสคอร์ด — มี fallback completeRedemptionFromDiscount()
        // ดักไว้อยู่แล้วถ้าลูกค้าพิมพ์โค้ดเองตรงนั้น ดูคอมเมนต์ที่ webhook ด้านล่าง)
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          line_items: [{ price: process.env.STRIPE_PREMIUM_PRICE_ID, quantity: 1 }],
          ...(codeEntry
            ? { discounts: [{ promotion_code: codeEntry.stripePromotionCodeId }] }
            : { allow_promotion_codes: true }),
          success_url: `${PUBLIC_BASE_URL}/premium/${guildId}`,
          cancel_url: `${PUBLIC_BASE_URL}/premium/${guildId}`,
          metadata: { guildId, discordUserId, ...(codeEntry ? { referralCode: rawDiscountCode.toUpperCase() } : {}) },
          subscription_data: { metadata: { guildId, discordUserId } },
        });

        // บันทึก "รอผลชำระเงิน" ไว้ก่อน เหมือนกับที่ handleModalSubmit() ใน commands/premium.js
        // ทำ — ผูกกับ session.id เพื่อให้ webhook checkout.session.completed มาเทียบได้ตอน
        // จ่ายเงินสำเร็จจริง แล้วค่อยนับว่า "ใช้โค้ดนี้ไปแล้ว" + คิดค่าคอมให้ผู้ขาย
        if (codeEntry) {
          recordPendingRedemption(session.id, {
            guildId,
            code: rawDiscountCode,
            sellerLabel: codeEntry.sellerLabel,
            sellerDiscordId: codeEntry.sellerDiscordId,
          });
        }

        return res.redirect(303, session.url);
      }

      if (method === 'paypal') {
        // ⚠️⚠️ [23 ก.ย. 2569 รอบ 6] โค้ดส่วนนี้ **ยังเรียกไม่ถึงจาก UI แล้วตอนนี้** — ปุ่ม PayPal
        // บนหน้าเว็บถูกเปลี่ยนเป็นแถว "Coming soon" กดไม่ได้แล้ว (ดู utils/renderPremiumBilling.js
        // ตรง PAYMENT_ROWS สำหรับเหตุผลเต็มๆ) เพราะพบว่า `payment_method_types: ['paypal']`
        // แบบมาตรฐานนี้ **ใช้ได้เฉพาะบัญชี Stripe ที่จดทะเบียนในยุโรปเท่านั้น** บัญชีไทยของ
        // น้องหนาวใช้ทางนี้ไม่ได้จริงๆ (ทดสอบจริงแล้วเจอ Stripe Dashboard พาไปหน้า "Custom
        // payment methods" แทน ซึ่งเป็นฟีเจอร์คนละตัว ต้องขอสิทธิ์ + host adapter เอง — ดู
        // คอมเมนต์เต็มๆ ใน renderPremiumBilling.js) เก็บโค้ดนี้ไว้เฉยๆ เผื่ออนาคตอยากทำ custom
        // adapter จริงจัง — ยังไม่ได้ลบเพราะโครงสร้าง Checkout Session ยังใช้อ้างอิงได้อยู่
        // ── ทาง PayPal: ยังใช้ Checkout Session แบบ subscription เหมือนทางบัตรได้เลย (Stripe
        // รองรับ PayPal กับ subscription mode ผ่าน Checkout Session จริงๆ — ต่างจาก PromptPay
        // ที่ทำไม่ได้ต้องเลี่ยงไปใช้ Subscription API ตรงๆ) จุดที่ต่างจากทางบัตรมีแค่ 2 อย่าง:
        //
        //   1) payment_method_types: ['paypal'] — บังคับให้หน้า Stripe โชว์แค่ตัวเลือก PayPal
        //      อย่างเดียว (ไม่ให้โชว์บัตรปนด้วย เพราะลูกค้ากดปุ่ม "PayPal" มาจากหน้าเราแล้ว)
        //   2) ใช้ price_data แบบ "inline" (สร้างราคาสดๆ ตรงนี้เลย) แทน STRIPE_PREMIUM_PRICE_ID
        //      เพราะ Stripe ไม่รองรับสกุลบาท (THB) กับ PayPal เลย — ต้องคิดเป็นดอลลาร์แทน
        //      (ตัวเลขราคา + % ค่าธรรมเนียมที่บวกเพิ่ม ดูที่ utils/premiumPricing.js จุดเดียว)
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          payment_method_types: ['paypal'],
          line_items: [{
            price_data: {
              currency: 'usd',
              unit_amount: getPaypalChargeCents(),
              recurring: { interval: 'month' },
              product_data: { name: 'Aitao Bot Premium' },
            },
            quantity: 1,
          }],
          ...(codeEntry
            ? { discounts: [{ promotion_code: codeEntry.stripePromotionCodeId }] }
            : { allow_promotion_codes: true }),
          success_url: `${PUBLIC_BASE_URL}/premium/${guildId}`,
          cancel_url: `${PUBLIC_BASE_URL}/premium/${guildId}`,
          metadata: { guildId, discordUserId, ...(codeEntry ? { referralCode: rawDiscountCode.toUpperCase() } : {}) },
          subscription_data: { metadata: { guildId, discordUserId } },
        });

        if (codeEntry) {
          recordPendingRedemption(session.id, {
            guildId,
            code: rawDiscountCode,
            sellerLabel: codeEntry.sellerLabel,
            sellerDiscordId: codeEntry.sellerDiscordId,
          });
        }

        return res.redirect(303, session.url);
      }

      // ── ทาง PromptPay: สร้าง Subscription ตรงๆ ผ่าน API (ไม่ผ่าน Checkout Session) ──

      // 🆕 [แก้บั๊ก 29 ก.ย. 2569] Stripe บังคับว่าต้องมีอีเมลลูกค้า ถึงจะออกใบแจ้งหนี้ส่งไป
      // ให้ได้ครับ (collection_method: 'send_invoice' ด้านล่าง = อีเมลลิงก์จ่ายเงินไปให้
      // ทุกเดือน ไม่ใช่หักบัตรเงียบๆ) แต่ Discord OAuth ที่ใช้ login เว็บไม่ได้ขอสิทธิ์อีเมล
      // มาด้วยเลย เลยต้องให้ลูกค้ากรอกเองตรงฟอร์มก่อนกดจ่ายทาง PromptPay แทนนะครับ (ดูช่อง
      // อีเมลใหม่ใน utils/renderPremiumBilling.js)
      const customerEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      // เช็ครูปแบบอีเมลแบบหยาบๆ พอครับ (Stripe เองจะเช็คเข้มอีกชั้นตอนสร้าง/แก้ไข Customer)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        return res.redirect(`/premium/${guildId}?error=${encodeURIComponent('Please enter a valid email address for PromptPay invoices.')}`);
      }

      // หา/สร้าง Stripe Customer เหมือนเดิม แต่เพิ่มขั้น update อีเมลให้ตรงกับที่กรอกมาเสมอ
      // (เผื่อเป็นลูกค้าเก่าที่เคยสมัครไว้ตั้งแต่ก่อนแก้บั๊กนี้ ยังไม่มีอีเมลติดอยู่เลย)
      const existingInfo = getSubscriptionInfo(guildId);
      let customerId = existingInfo?.stripeCustomerId;
      if (customerId) {
        await stripe.customers.update(customerId, { email: customerEmail });
      } else {
        customerId = (await stripe.customers.create({ email: customerEmail, metadata: { guildId, discordUserId } })).id;
      }

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: process.env.STRIPE_PREMIUM_PRICE_ID }],
        collection_method: 'send_invoice',
        // จำนวนวันที่ลูกค้ามีให้สแกนจ่าย ก่อนใบแจ้งหนี้จะเลยกำหนด (Stripe คำนวณ due date
        // ให้เองจากค่านี้ + วันที่สร้าง invoice แต่ละใบ)
        days_until_due: PROMPTPAY_INVOICE_DAYS_UNTIL_DUE,
        payment_settings: { payment_method_types: ['promptpay'] },
        // 🆕 มีโค้ดที่ตรวจผ่านแล้ว → แนบส่วนลดเข้า subscription ตรงๆ เลย (Subscription API
        // รองรับ discounts แบบเดียวกับ Checkout Session) — หน้า Stripe hosted invoice ไม่มี
        // ช่องให้ลูกค้าพิมพ์โค้ดเองแบบ Checkout เลยไม่ต้องมีทาง allow_promotion_codes สำรอง
        ...(codeEntry ? { discounts: [{ promotion_code: codeEntry.stripePromotionCodeId }] } : {}),
        metadata: { guildId, discordUserId },
        expand: ['latest_invoice'],
      });

      // บันทึก "รอผลชำระเงิน" ไว้ก่อนเหมือนทางบัตร — แต่ผูกกับ subscription.id แทน session.id
      // เพราะทางนี้ไม่มี Checkout Session เลย (recordPendingRedemption/completeRedemption
      // ใน utils/referralStorage.js จริงๆ แล้วรับ "string key" อะไรก็ได้ ไม่ได้ผูกกับ
      // Checkout Session โดยเฉพาะ — ใช้ subscription.id เป็น key แทนได้เลยไม่มีปัญหา) —
      // completeRedemption(subscription.id) จะถูกเรียกตอน invoice ใบแรกจ่ายสำเร็จ (ดู
      // webhook invoice.payment_succeeded ด้านล่าง) ไม่ใช่ตอนนี้ เผื่อสร้าง invoice แล้ว
      // ลูกค้าไม่ยอมสแกนจ่ายจริง
      if (codeEntry) {
        recordPendingRedemption(subscription.id, {
          guildId,
          code: rawDiscountCode,
          sellerLabel: codeEntry.sellerLabel,
          sellerDiscordId: codeEntry.sellerDiscordId,
        });
      }

      let invoice = subscription.latest_invoice;
      // ปกติ Stripe finalize invoice แรกให้อัตโนมัติตอนสร้าง subscription แบบ send_invoice
      // อยู่แล้ว แต่ดักไว้เผื่อยังเป็น draft อยู่ (เช่น Stripe เปลี่ยนพฤติกรรมในอนาคต) —
      // ต้อง finalize ก่อนถึงจะมี hosted_invoice_url ให้ redirect ไปได้
      if (invoice.status === 'draft') {
        invoice = await stripe.invoices.finalizeInvoice(invoice.id);
      }

      if (!invoice.hosted_invoice_url) {
        throw new Error('Stripe ไม่ได้คืน hosted_invoice_url มาให้ (ไม่ควรเกิดขึ้น)');
      }

      return res.redirect(303, invoice.hosted_invoice_url);
    } catch (err) {
      console.error(`[premium] สร้าง checkout พรีเมียม (${method}) ของเซิร์ฟ ${guildId} ไม่สำเร็จ:`, err);
      // ข้อความ error ที่โชว์ผู้ใช้เป็นอังกฤษล้วน (ตามข้อตกลงเรื่องภาษาของหน้าแดชบอร์ด) —
      // ไม่โชว์ err.message ดิบๆ เพราะอาจมีรายละเอียดทางเทคนิคที่ไม่เหมาะให้ผู้ใช้ทั่วไปเห็น
      const friendlyMessage = method === 'promptpay'
        ? 'PromptPay is not available for this account right now. Please try the credit card option instead.'
        : method === 'paypal'
        ? 'PayPal is not available for this account right now. Please try the credit card option instead.'
        : 'Something went wrong starting checkout. Please try again.';
      return res.redirect(`/premium/${guildId}?error=${encodeURIComponent(friendlyMessage)}`);
    }
  });

  // 🆕 ปุ่ม "Manage subscription" บนหน้าเว็บ — ทำหน้าที่เหมือน handleButton() case
  // 'premium_manage' ใน commands/premium.js เป๊ะๆ แค่ redirect ตรงๆ แทนที่จะตอบกลับเป็น
  // ข้อความในดิสคอร์ด
  app.post('/premium/:guildId/billing-portal', requireAuth, requireGuildAccess, async (req, res) => {
    const { guildId } = req.params;
    const info = getSubscriptionInfo(guildId);
    if (!info) {
      return res.redirect(`/premium/${guildId}?error=${encodeURIComponent('No billing account found for this server yet.')}`);
    }
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: info.stripeCustomerId,
        return_url: `${PUBLIC_BASE_URL}/premium/${guildId}`,
      });
      return res.redirect(303, portalSession.url);
    } catch (err) {
      console.error(`[premium] เปิด billing portal ของเซิร์ฟ ${guildId} ไม่สำเร็จ:`, err);
      return res.redirect(`/premium/${guildId}?error=${encodeURIComponent('Could not open the billing portal. Please try again.')}`);
    }
  });

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
    // 🆕 ต่อ ?returnTo=<หน้าที่ตั้งใจจะเข้าจริงๆ> ไปด้วยเสมอ — /auth/login จะเก็บไว้ใน
    // session แล้วพา user กลับมาที่นี่ให้อัตโนมัติหลัง login เสร็จ (ดูคอมเมนต์เต็มๆ ที่
    // /auth/login ด้านบน) req.originalUrl คือ URL เต็มๆ ที่ user พยายามเข้าจริง รวม
    // query string ด้วย (เช่น /premium/start เอง หรือ /premium/123456789)
    return res.redirect(`/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
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

      // ── 🆕 [รอบ 19] import "ของค้าง" (role setup/builder ที่เคยถูกข้ามไว้ตอน
      // /milo import-config ขณะเซิร์ฟนี้ยังเป็นแผนฟรี) ให้อัตโนมัติทันทีที่เพิ่งอัปเกรด
      // พรีเมียมสำเร็จ — ครอบด้วย try/catch ของตัวเอง กันพังแล้วลาม (ถ้าจุดนี้ throw ขึ้นมา
      // ไม่ควรทำให้ webhook ทั้งเส้น (ปลดล็อกพรีเมียม + DM แจ้งเตือน) พังตามไปด้วย — เซิร์ฟ
      // ยังได้พรีเมียมปกติ แค่ของค้างจะยังรอ apply รอบหน้า (เรียกซ้ำได้เสมอ ไม่มีผลข้างเคียง)
      let resumedMiloItems = null;
      try {
        resumedMiloItems = await applyPendingSkippedForGuild(guildId);
        if (resumedMiloItems) {
          console.log(
            `[webhook] guild ${guildId} มีของค้างจาก /milo import-config ถูก import ให้อัตโนมัติ ` +
            `(role setup ${resumedMiloItems.roleSetups.length} ชุด, builder ${resumedMiloItems.builderDrafts.length} ชุด)`
          );
        }
      } catch (resumeError) {
        console.error('[webhook] applyPendingSkippedForGuild (checkout.session.completed) ไม่สำเร็จ:', resumeError.message);
      }

      // ── 🆕 [แคมเปญโค้ดส่วนลดพ่อค้าแม่ค้า] เช็คว่า session นี้ใช้โค้ดส่วนลดไหม ──────
      // completeRedemption() คืน null เงียบๆ ถ้า session นี้ "ไม่ใช่" การใช้โค้ด
      // (สมัครราคาเต็มปกติผ่านปุ่มสมัครธรรมดา) — ไม่ต้องเช็ค session.id เองก่อนเรียก
      // เพราะฟังก์ชันนี้เช็คให้แล้วข้างใน (ดู utils/referralStorage.js)
      // ถ้าเจอ (ไม่ null) แปลว่า: ใช้โค้ดสำเร็จจริง → บันทึกกันใช้ซ้ำ + เพิ่มค่าคอมแล้ว
      let redemption = completeRedemption(session.id);

      // 🆕 [แก้ช่องโหว่ "ข้ามปุ่มมีโค้ดส่วนลด"] ถ้าทางแรกหาไม่เจอ (ไม่ได้กดปุ่ม "มีโค้ด
      // ส่วนลด?" ในบอทก่อน) เช็คซ้ำอีกทางจากข้อมูลส่วนลดจริงที่ Stripe บันทึกไว้ในตัว
      // session (session.discounts) — ครอบคลุมเคสลูกค้าพิมพ์โค้ดเองตรงหน้า Stripe Checkout
      // (ปุ่ม "สมัครพรีเมียม" ธรรมดาเปิดช่องนี้ไว้ผ่าน allow_promotion_codes: true) หรือ
      // อนาคตมีช่องทางซื้อพรีเมียมจากที่อื่นที่ไม่ผ่านบอทเลย (เช่นหน้าเว็บ) — ทำให้ผู้ขาย
      // ได้ค่าคอมครบไม่ว่าลูกค้าจะกรอกโค้ดผ่านทางไหนก็ตาม
      //
      // session.discounts เป็นอาเรย์ของส่วนลดที่ติดอยู่กับ session นี้ (ปกติจะมีสูงสุด
      // แค่ 1 รายการสำหรับเคสของเรา เพราะจำกัดให้ใช้โค้ดได้ทีละโค้ดต่อการสมัครอยู่แล้ว)
      // แต่ละรายการมี .promotion_code เป็น string ID (เช่น "promo_xxx") ให้มาแบบนี้เลย
      // โดยไม่ต้องขอ expand เพิ่ม — อ้างอิง: https://docs.stripe.com/api/checkout/sessions/object
      // 🆕 detectedFromDiscount: true = เจอผ่านทางสำรอง (ไม่ได้กดปุ่ม "มีโค้ดส่วนลด?" ใน
      // บอทก่อน) — ใช้แค่แต่งข้อความ log ด้านล่างให้ชัดเจนขึ้นเฉยๆ ไม่มีผลอะไรกับ logic
      let detectedFromDiscount = false;
      if (!redemption) {
        const promotionCodeId = session.discounts?.[0]?.promotion_code ?? null;
        redemption = completeRedemptionFromDiscount(session.id, { guildId, promotionCodeId });
        detectedFromDiscount = Boolean(redemption);
      }

      if (redemption) {
        console.log(
          `[webhook] guild ${guildId} ใช้โค้ด "${redemption.code}" สำเร็จ ` +
          `(ผู้ขาย: ${redemption.sellerLabel}, ค่าคอม +${redemption.commissionThb} บาท)` +
          (detectedFromDiscount
            ? ' [ตรวจพบจากส่วนลดใน Checkout Session โดยตรง — ไม่ได้กดปุ่ม "มีโค้ดส่วนลด?" ในบอทก่อน]'
            : '')
        );

        // 🆕 อัปเดตการ์ดในห้อง #referral-earnings ให้เป็นตัวเลขล่าสุดทันที (เรียลไทม์
        // ตามที่น้องหนาวขอ) — ฟังก์ชันนี้ดักทุก error ไว้ในตัวเองแล้ว ไม่มีทาง throw
        // ออกมาทำให้ webhook หลัก (ปลดล็อกพรีเมียม) พังตามแน่นอน
        await syncCodeReportMessage(client, redemption.code);

        // แจ้งผู้ขายทันทีถ้ามีผูกบัญชีดิสคอร์ดไว้ (sellerDiscordId มาจากตอน /referral add
        // — ถ้าไม่ได้ใส่ตอนสร้างโค้ด จะเป็น null แล้วข้ามส่วนนี้ไปเงียบๆ ไม่ error)
        if (redemption.sellerDiscordId) {
          try {
            const sellerUser = await client.users.fetch(redemption.sellerDiscordId);
            await sellerUser.send(
              `🎉 มีคนใช้โค้ด **${redemption.code}** ของคุณสมัครพรีเมียมสำเร็จครับ! ` +
              `ได้ค่าคอม **${redemption.commissionThb} บาท** (เช็คยอดรวมได้ทุกเมื่อ ถามแอดมินได้เลยครับ)`
            );
          } catch (dmError) {
            // เหมือนกับ DM แจ้งลูกค้าด้านล่าง — ส่งไม่ได้ก็แค่ข้าม ไม่ทำให้ webhook พัง
            // (ผู้ขายเช็คยอดค่าคอมได้เองอยู่ดีผ่าน /referral summary)
            console.warn('[webhook] ส่ง DM แจ้งค่าคอมผู้ขายไม่สำเร็จ:', dmError.message);
          }
        }
      }

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

          const dmComponents = [new TextDisplayBuilder().setContent(congratsText), card];

          // 🆕 [รอบ 19] ถ้ามีของค้างจาก /milo import-config ถูก import ให้อัตโนมัติไปแล้ว
          // (resumedMiloItems ไม่ null — เช็คไว้ด้านบนก่อนถึงตรงนี้) ต่อข้อความบอกไว้ใน
          // DM เดียวกันเลย (ไม่แยกส่งเป็น DM ที่ 2 — กันโดน Discord rate-limit DM ถี่เกินไป
          // และผู้ใช้อ่านรวดเดียวจบง่ายกว่า) ใช้ TextDisplay บล็อกที่ 2 ต่อท้าย card
          if (resumedMiloItems && (resumedMiloItems.roleSetups.length > 0 || resumedMiloItems.builderDrafts.length > 0)) {
            const resumeLines = [t('milo_config.resume.dm_header')];
            if (resumedMiloItems.roleSetups.length > 0) {
              resumeLines.push(t('milo_config.resume.dm_role_setups', { names: resumedMiloItems.roleSetups.join(', ') }));
            }
            if (resumedMiloItems.builderDrafts.length > 0) {
              resumeLines.push(t('milo_config.resume.dm_builders', { names: resumedMiloItems.builderDrafts.join(', ') }));
            }
            resumeLines.push('', t('milo_config.resume.dm_warning'));
            dmComponents.push(new TextDisplayBuilder().setContent(resumeLines.join('\n')));
          }

          await user.send({
            components: dmComponents,
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

      // 🆕 [หน้าเว็บ Premium & Billing — ทาง PromptPay] ส่ง DM แจ้งเตือน "สมัครสำเร็จ" +
      // เครดิตค่าคอมโค้ดส่วนลด (ถ้ามี) ให้เฉพาะตอนเป็นการจ่ายครั้งแรกของ subscription แบบ
      // send_invoice (คือ subscription ที่สร้างจากปุ่ม PromptPay บนหน้าเว็บเท่านั้น — ดู
      // POST /premium/:guildId/checkout ในroute ด้านบน) เพราะทางนี้ "ไม่ได้" ผ่าน Checkout
      // Session เลย จึงไม่มี event checkout.session.completed ยิงมาให้ (event นั้นยิงเฉพาะ
      // subscription ที่สร้างผ่าน Checkout เท่านั้น — ทางบัตรเครดิตทั้งจาก /premium ใน
      // ดิสคอร์ดและจากหน้าเว็บผ่าน Checkout Session อยู่แล้ว เลยได้ DM + เครดิตค่าคอมจาก
      // case checkout.session.completed ด้านบนไปแล้ว ไม่ต้องทำซ้ำตรงนี้)
      //
      // เช็ค 2 อย่างพร้อมกันเพื่อกันส่งซ้ำ/ส่งผิดจังหวะ:
      //   (1) subscription.collection_method === 'send_invoice' → เป็น subscription ทาง
      //       PromptPay แน่ๆ (ทางบัตรทุกเส้นทางใช้ charge_automatically ซึ่งเป็นค่าเริ่มต้น)
      //   (2) invoice.billing_reason === 'subscription_create' → เป็น invoice "ใบแรก" ของ
      //       subscription นี้เท่านั้น (ไม่ใช่ invoice ต่ออายุรอบถัดๆ ไป ซึ่งไม่ต้องแจ้งซ้ำ)
      if (subscription.collection_method === 'send_invoice' && invoice.billing_reason === 'subscription_create') {
        // ── 🆕 [รอบ 19] import "ของค้าง" (ของที่ถูกข้ามไว้ตอน /milo import-config ขณะ
        // เซิร์ฟยังฟรีอยู่) ให้อัตโนมัติเหมือนกับทาง checkout.session.completed ด้านบน —
        // ต้องทำซ้ำที่นี่ด้วย เพราะเส้นทาง PromptPay นี้ "ไม่" ยิง checkout.session.completed
        // เลย (ดูคอมเมนต์ยาวด้านบนตรง "ไม่ต้องทำซ้ำตรงนี้" — อันนั้นพูดถึง DM/ค่าคอมเท่านั้น
        // แต่ของค้างของ /milo ยังไงก็ต้อง resume ทุกเส้นทางที่ทำให้เซิร์ฟกลายเป็นพรีเมียม)
        let resumedMiloItems = null;
        try {
          resumedMiloItems = await applyPendingSkippedForGuild(guildId);
          if (resumedMiloItems) {
            console.log(
              `[webhook] guild ${guildId} มีของค้างจาก /milo import-config ถูก import ให้อัตโนมัติ (ทาง PromptPay) ` +
              `(role setup ${resumedMiloItems.roleSetups.length} ชุด, builder ${resumedMiloItems.builderDrafts.length} ชุด)`
            );
          }
        } catch (resumeError) {
          console.error('[webhook] applyPendingSkippedForGuild (ทาง PromptPay) ไม่สำเร็จ:', resumeError.message);
        }

        // ── 🆕 [แคมเปญโค้ดส่วนลด — ทาง PromptPay] เครดิตค่าคอมผู้ขาย (ถ้าสมัครด้วยโค้ด) ──
        // completeRedemption(subscription.id) คืน null เงียบๆ ถ้า subscription นี้ "ไม่ใช่"
        // การใช้โค้ด (ไม่มี pending ให้เจอ เพราะ POST /premium/:guildId/checkout ไม่เรียก
        // recordPendingRedemption() ตอนไม่มีโค้ดกรอกมา) — ใช้ subscription.id เป็น key แทน
        // session.id เพราะทางนี้ไม่มี Checkout Session เลย (ดูคอมเมนต์ตอนสร้าง subscription
        // ด้านบน — recordPendingRedemption/completeRedemption รับ string key อะไรก็ได้)
        const redemption = completeRedemption(subscription.id);
        if (redemption) {
          console.log(
            `[webhook] guild ${guildId} ใช้โค้ด "${redemption.code}" สำเร็จ (ทาง PromptPay) ` +
            `(ผู้ขาย: ${redemption.sellerLabel}, ค่าคอม +${redemption.commissionThb} บาท)`
          );
          await syncCodeReportMessage(client, redemption.code);
          if (redemption.sellerDiscordId) {
            try {
              const sellerUser = await client.users.fetch(redemption.sellerDiscordId);
              await sellerUser.send(
                `🎉 มีคนใช้โค้ด **${redemption.code}** ของคุณสมัครพรีเมียมสำเร็จครับ! ` +
                `ได้ค่าคอม **${redemption.commissionThb} บาท** (เช็คยอดรวมได้ทุกเมื่อ ถามแอดมินได้เลยครับ)`
              );
            } catch (dmError) {
              console.warn('[webhook] ส่ง DM แจ้งค่าคอมผู้ขายไม่สำเร็จ (ทาง PromptPay):', dmError.message);
            }
          }
        }

        const discordUserId = subscription.metadata?.discordUserId;
        if (discordUserId) {
          try {
            const t = createTranslator(getGuildLanguage(guildId));
            const guild = client.guilds.cache.get(guildId);
            const guildName = guild?.name ?? guildId;
            const user = await client.users.fetch(discordUserId);
            const congratsText = t('premium.dm.activated', { guildName });
            const card = buildPremiumCard({
              isPremium: true,
              subscriptionInfo: { currentPeriodEnd },
              guild,
              t,
              actionButton: null,
            });

            const dmComponents = [new TextDisplayBuilder().setContent(congratsText), card];

            // 🆕 [รอบ 19] ต่อข้อความของค้างที่ import ให้อัตโนมัติ เหมือนกับทาง
            // checkout.session.completed ด้านบนเป๊ะๆ (ดูคอมเมนต์เต็มๆ ที่นั่น)
            if (resumedMiloItems && (resumedMiloItems.roleSetups.length > 0 || resumedMiloItems.builderDrafts.length > 0)) {
              const resumeLines = [t('milo_config.resume.dm_header')];
              if (resumedMiloItems.roleSetups.length > 0) {
                resumeLines.push(t('milo_config.resume.dm_role_setups', { names: resumedMiloItems.roleSetups.join(', ') }));
              }
              if (resumedMiloItems.builderDrafts.length > 0) {
                resumeLines.push(t('milo_config.resume.dm_builders', { names: resumedMiloItems.builderDrafts.join(', ') }));
              }
              resumeLines.push('', t('milo_config.resume.dm_warning'));
              dmComponents.push(new TextDisplayBuilder().setContent(resumeLines.join('\n')));
            }

            await user.send({
              components: dmComponents,
              flags: MessageFlags.IsComponentsV2,
            });
          } catch (dmError) {
            console.warn('[webhook] ส่ง DM แจ้งเตือนพรีเมียม (ทาง PromptPay) ไม่สำเร็จ:', dmError.message);
          }
        }
      }
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
