// utils/stripeClient.js
// สร้าง Stripe client ไว้ "จุดเดียว" ในโปรเจกต์ แล้วให้ไฟล์อื่น require ไปใช้ต่อ
// (server.js กับ commands/premium.js ต้องใช้ Stripe client เหมือนกัน ถ้าต่างคนต่างสร้าง
// เองคนละไฟล์ ไม่ผิดอะไรเชิงเทคนิค แต่ซ้ำซ้อนโดยไม่จำเป็น — pattern เดียวกับที่เรามี
// utils/tierManager.js เป็นจุดเดียวที่จัดการไฟล์ guild-tiers.json เหมือนกัน)

const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = stripe;