// utils/i18n.js
// เครื่องมือแปลภาษากลางของบอท — โหลดไฟล์ locale, ดึงค่าตาม key, แทน placeholder
// หลักการ: อังกฤษ = ต้นฉบับ/fallback เสมอ (สลับทิศทางจากเดิมที่ไทยเป็น fallback)
// กันกรณีคีย์ภาษาอื่น (รวมถึงไทย) ยังแปลไม่ครบ

const fs   = require('fs');
const path = require('path');

// __dirname คือ utils/ ตอนนี้ ต้องถอยออกมา 1 ชั้นไปหาโฟลเดอร์ locales/ ที่ root
const LOCALES_DIR = path.join(__dirname, '..', 'locales');

// cache เก็บไฟล์ locale ที่โหลดแล้วไว้ในหน่วยความจำ กันเปิดไฟล์ซ้ำทุกครั้งที่มีคนพิมพ์คำสั่ง
// รูปแบบ: { th: {...ทั้งไฟล์ th.json...}, en: {...ทั้งไฟล์ en.json...} }
const cache = {};

/**
 * โหลดไฟล์ locale ตามภาษา (โหลดครั้งแรกครั้งเดียว ครั้งต่อไปอ่านจาก cache)
 * @param {string} lang เช่น 'th' หรือ 'en'
 */
function loadLocale(lang) {
  if (!cache[lang]) {
    const filePath = path.join(LOCALES_DIR, `${lang}.json`);
    cache[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return cache[lang];
}

/**
 * ดึงค่าจาก object ตาม key แบบจุด เช่น "ping.response"
 * แปลงเป็น ['ping', 'response'] แล้วเดินลึกลงไปทีละชั้น
 * ใช้ ?. กันพังถ้าเดินไปเจอ undefined กลางทาง (เช่น key พิมพ์ผิด)
 */
function getNestedValue(obj, dottedKey) {
  return dottedKey.split('.').reduce((acc, part) => acc?.[part], obj);
}

/**
 * สร้างฟังก์ชัน t() ที่ผูกกับภาษาที่กำหนดไว้แล้ว
 * เรียก createTranslator(lang) ครั้งเดียวตอนต้น execute() แล้วใช้ t('key', {...}) ไปได้ยาวๆ
 * ไม่ต้องส่ง lang ซ้ำทุกจุดในฟังก์ชัน
 *
 * @param {string} lang เช่น 'th' หรือ 'en'
 * @returns {(key: string, replacements?: object) => string}
 */
function createTranslator(lang) {
  const primary  = loadLocale(lang);
  const fallback = loadLocale('en'); // ← อังกฤษเป็นต้นฉบับ/fallback แทน ไม่ว่า lang จะเป็นอะไร

  return function t(key, replacements = {}) {
    let str = getNestedValue(primary, key);

    // ไม่เจอในภาษาที่เลือก → ลองอังกฤษแทน (เผื่อคีย์นี้ยังแปลไม่ครบในภาษานั้นๆ)
    if (str === undefined) {
      console.warn(`[i18n] ไม่พบคีย์ "${key}" ในภาษา "${lang}" — ใช้อังกฤษ (fallback)`);
      str = getNestedValue(fallback, key);
    }

    // ไม่เจอแม้แต่ในอังกฤษ → พิมพ์ key ผิดแน่ๆ ป้องกันบอทพังด้วยการคืน key ดิบแทน error
    if (str === undefined) {
      console.error(`[i18n] ไม่พบคีย์ "${key}" แม้แต่ในอังกฤษ (fallback) — น่าจะพิมพ์ key ผิด`);
      return key;
    }

    // แทน placeholder เช่น {latency} ด้วยค่าจริงที่ส่งมา
    return Object.entries(replacements).reduce(
      (result, [k, v]) => result.replaceAll(`{${k}}`, String(v)),
      str
    );
  };
}

module.exports = { createTranslator };