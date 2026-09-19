// utils/canvasDrawHelpers.js
// ฟังก์ชันวาดที่ใช้ร่วมกันระหว่าง:
//   - utils/generateMemberCardImage.js (main thread — สร้าง PNG)
//   - utils/welcomeImageWorker.js      (worker thread — สร้าง animated GIF)
//
// แยกมาไว้ที่นี่ไฟล์เดียว เพื่อไม่ให้โค้ดวาดภาพ (wrapText, drawAvatar ฯลฯ)
// ถูก copy ซ้ำ 2 ที่ — ถ้าแก้ไขอนาคต (เช่น bug ใน wrapText) แก้ที่เดียวจบ
//
// ❗ หมายเหตุสำคัญเรื่อง worker_threads:
//   ไฟล์นี้ (และ GlobalFonts.registerFromPath) จะถูก require() แยกกันอิสระ
//   ทั้งใน main thread และในแต่ละ worker thread — เพราะ worker thread คือ
//   V8 isolate คนละตัว (เหมือนเปิด Node process ใหม่ในหัว) โมดูล native
//   อย่าง @napi-rs/canvas จึงต้อง register font ใหม่ทุกครั้งที่ require()
//   ในแต่ละ thread ซึ่งเป็นเรื่องปกติ ไม่ใช่บั๊ก — ทดสอบแล้วว่าทำงานถูกต้อง
//   (แคชรูปอิโมจิด้านล่าง — EMOJI_CACHE — ก็เป็นแบบเดียวกัน: แต่ละ thread
//   มีแคชของตัวเองแยกกัน ไม่ได้แชร์ข้าม thread แต่ไม่เป็นไร เพราะแคชอยู่แค่
//   ในหน่วยความจำระหว่างบอทรันอยู่ ไม่ได้ fetch ซ้ำทุกครั้งที่วาดการ์ดอยู่แล้ว)
//
// 🎉 อัปเดต: รองรับอิโมจิในบล็อกข้อความ (text block) ของการ์ด welcome/goodbye แล้ว!
//   - อิโมจิทั่วไป (Unicode เช่น 😀🎉💖) → โหลดรูปจาก Twemoji CDN มาวาดแทน
//   - อิโมจิในเซิร์ฟ (<:name:id> / <a:name:id>) → โหลดรูปจาก Discord CDN มาวาดแทน
//   ทำไมใช้วิธี "โหลดรูปมาวาดทับ" แทนการลงฟอนต์สีอีโมจิ (เช่น Noto Color Emoji):
//     1. ฟอนต์อีโมจิสีเป็นไฟล์ใหญ่มาก (10-25MB) และ @napi-rs/canvas รองรับ
//        การเรนเดอร์สีของฟอนต์แบบนี้ไม่แน่นอน (ขึ้นกับเวอร์ชัน Skia ข้างใน)
//     2. อิโมจิในเซิร์ฟเป็น "รูปภาพ" ที่ Discord โฮสต์ไว้อยู่แล้ว ไม่มีทางวาด
//        ด้วยฟอนต์ได้เลยไม่ว่ากรณีไหน ต้องโหลดรูปมาวาดอยู่ดี
//     3. ใช้วิธีเดียวกันทั้งสองแบบ (โหลดรูป + drawImage) โค้ดเลยเรียบง่ายกว่า
//        เขียนแค่ทางเดียว ไม่ต้องแยก logic ฟอนต์สีกับ logic รูปภาพ
//   ⚠️ ข้อควรรู้: วิธีนี้ต้องยิง network request ไปโหลดรูปตอน render ครั้งแรก
//   (ครั้งต่อๆ ไปจะเร็วเพราะมีแคชในหน่วยความจำแล้ว — ดู EMOJI_CACHE) ถ้าโหลด
//   รูปไม่สำเร็จ (เน็ตหลุด, CDN ล่ม ฯลฯ) โค้ดจะ "ข้ามการวาดอิโมจิตัวนั้นไปเฉยๆ"
//   ไม่ error ไม่ทำให้การ์ดทั้งใบพังหรือส่งไม่ออก

const { GlobalFonts, loadImage } = require('@napi-rs/canvas');
const path                       = require('path');
const emojiRegex                 = require('emoji-regex');
const twemoji                    = require('twemoji');

// ─── Register Fonts ────────────────────────────────────────────────────────────
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
try {
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Mali-Regular.ttf'),    'Mali');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Mali-Bold.ttf'),       'Mali');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Fredoka-Regular.ttf'), 'Fredoka');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Fredoka-Bold.ttf'),    'Fredoka');
  // ฟอนต์สไตล์เพิ่มเติมต่อ text block — เลือกได้จาก UI (default/charmonman/chonburi)
  // ทั้งสองตัวรองรับไทย+อังกฤษในไฟล์เดียว ไม่ต้องเช็ค hasThai() แยกเหมือน Mali/Fredoka
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Charmonman-Regular.ttf'), 'Charmonman');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Charmonman-Bold.ttf'),    'Charmonman');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Chonburi-Regular.ttf'),  'Chonburi');
  // Chonburi มีแค่ weight เดียว (ไม่มีไฟล์ Bold แยก) — ตั้งใจไม่ register ซ้ำด้วยชื่อเดียวกัน
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Kanit-Regular.ttf'),   'Kanit');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Kanit-Bold.ttf'),      'Kanit');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Sarabun-Regular.ttf'), 'Sarabun');
  GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Sarabun-Bold.ttf'),    'Sarabun');
  // Kanit/Sarabun มี Bold ไฟล์จริงครบทั้งคู่ (ต่างจาก Chonburi) ไม่ต้องกันเหนียวเรื่อง bold
  console.log(`[canvasDrawHelpers] ✅ fonts โหลดสำเร็จครับ (thread: ${process.env.IS_WORKER ? 'worker' : 'main'})`);
} catch (e) {
  console.warn('[canvasDrawHelpers] ⚠️ โหลด fonts ไม่สำเร็จ ใช้ fallback:', e.message);
}

// Default canvas size — ใช้เฉพาะตอนไม่มี background (gradient fallback)
const DEFAULT_W = 800;
const DEFAULT_H = 300;

// ─── Font Helpers ─────────────────────────────────────────────────────────────

/** ตรวจว่ามีตัวอักษรไทยใน Unicode range U+0E00–U+0E7F */
function hasThai(text) {
  return /[฀-๿]/.test(text);
}

// ─── ฟอนต์ที่แอดมินอัปโหลดเอง (per-guild custom font) ──────────────────────────
//
// ต่างจากฟอนต์มาตรฐาน 6 ตัวข้างบน (register ครั้งเดียวตอนบอทเปิด) ฟอนต์ของ
// แต่ละเซิร์ฟจะถูก "อัปโหลดเข้ามาทีหลัง" ระหว่างบอทกำลังรันอยู่ (ผ่านคำสั่ง
// /fonts upload) เลย register แบบ static ตอนเปิดไฟล์นี้ไม่ได้ ต้อง register
// "แบบไดนามิก" ตอนกำลังจะใช้จริง (ดู ensureCustomFontRegistered ด้านล่าง)
//
// registeredCustomFonts: เก็บ "ชื่อ family ที่เคย register ไปแล้วใน thread นี้"
// กันเรียก GlobalFonts.registerFromPath() ซ้ำโดยไม่จำเป็นทุกครั้งที่วาดการ์ด
// (แต่ละ thread มี Set ของตัวเอง เหมือน EMOJI_CACHE ด้านล่าง — เป็นเรื่องปกติ
// ไม่ใช่บั๊ก อ่าน comment บนสุดของไฟล์นี้เรื่อง worker_threads ประกอบ)
const registeredCustomFonts = new Set();

/**
 * ลงทะเบียนฟอนต์ของเซิร์ฟ (ถ้ายังไม่เคย register ชื่อ family นี้ใน thread ปัจจุบัน)
 * เรียกจาก drawAllTextBlocks() ก่อนเริ่มวาดทุกครั้ง — ปลอดภัยเรียกซ้ำได้เสมอ
 * (เช็ค Set ก่อน ถ้าเคย register แล้วจะ return ทันทีโดยไม่ทำอะไรซ้ำ)
 *
 * ไม่ throw ออกไปข้างนอกเด็ดขาด แม้ path ไฟล์จะหายไปหรือไฟล์ฟอนต์เสีย —
 * แค่ log ไว้แล้วปล่อยผ่าน (การ์ดจะ fallback ไปใช้ฟอนต์ default แทนเงียบๆ)
 *
 * @param {string|undefined} fontPath - path เต็มของไฟล์ฟอนต์บนดิสก์
 * @param {string|undefined} fontFamily - ชื่อ family ที่จะใช้เรียก (ต้องตรงกับตอน register)
 */
function ensureCustomFontRegistered(fontPath, fontFamily) {
  if (!fontPath || !fontFamily) return;
  if (registeredCustomFonts.has(fontFamily)) return;
  try {
    GlobalFonts.registerFromPath(fontPath, fontFamily);
    registeredCustomFonts.add(fontFamily);
  } catch (e) {
    console.warn(`[canvasDrawHelpers] ⚠️ ลงทะเบียนฟอนต์ของเซิร์ฟไม่สำเร็จ (${fontFamily}):`, e.message);
  }
}

/**
 * ลงทะเบียนฟอนต์ของเซิร์ฟ "ทุกไฟล์" ที่อาจถูกใช้ในการ์ดนี้ในคราวเดียว —
 * 🆕 เปลี่ยนจากเดิมที่มีแค่ฟอนต์เดียวต่อเซิร์ฟ ตอนนี้แต่ละเซิร์ฟอัปโหลดได้
 * หลายไฟล์ แต่ละ text block เลือกฟอนต์ของตัวเองได้อิสระ เลยต้อง register
 * ทุกไฟล์ที่ config ส่งมาให้ ไม่ใช่แค่ไฟล์เดียวเหมือนก่อน
 *
 * @param {{path:string, family:string}[]} customFonts
 */
function ensureAllCustomFontsRegistered(customFonts) {
  for (const font of customFonts ?? []) {
    ensureCustomFontRegistered(font?.path, font?.family);
  }
}

/**
 * เลือก font family ตาม fontStyle ที่ user เลือกไว้ต่อ block (ถ้ามี)
 * ไม่งั้น fallback เป็นพฤติกรรมเดิม: ไทย → Mali | อังกฤษ → Fredoka
 *
 * Charmonman/Chonburi/Kanit/Sarabun รองรับทั้งไทย+อังกฤษในไฟล์เดียว
 * ไม่ต้องเช็ค hasThai() แยกเหมือน Mali/Fredoka — เลือกฟอนต์เดียวจบทั้งบล็อก
 *
 * fontStyle === 'customFont:<id>' → ใช้ฟอนต์ที่เซิร์ฟอัปโหลดเอง (ผ่าน
 * /fonts upload) โดย <id> บอกว่าเป็นไฟล์ไหน (เซิร์ฟนึงอัปโหลดได้หลายไฟล์แล้ว
 * — ดู utils/fontStorage.js) ต้องส่ง customFonts (array ของฟอนต์ทั้งหมดที่
 * เซิร์ฟนี้มี) มาด้วยเสมอตอนเลือกแบบนี้ ถ้าหา id ไม่เจอในลิสต์ (เช่น block
 * เก่าอ้างถึงฟอนต์ที่ถูกลบไปแล้ว) จะ fallback ไปใช้กฎเดิม (ไทย → Mali |
 * อังกฤษ → Fredoka) แทนเงียบๆ ไม่พัง
 *
 * @param {string} text
 * @param {string} [fontStyle] - 'default' | 'charmonman' | 'chonburi' | 'kanit' | 'sarabun' | 'customFont:<id>' | undefined
 * @param {{id:string, family:string}[]} [customFonts] - ฟอนต์ที่เซิร์ฟนี้อัปโหลดไว้ทั้งหมด
 */
function pickFontFamily(text, fontStyle, customFonts) {
  if (fontStyle && fontStyle.startsWith('customFont:')) {
    const fontId = fontStyle.slice('customFont:'.length);
    const match  = (customFonts ?? []).find(f => f.id === fontId);
    if (match) return `${match.family}, sans-serif`;
    // หาไม่เจอ → ไหลลงไป fallback ด้านล่างต่อ (ไม่ return ทันที)
  }
  if (fontStyle === 'charmonman') return 'Charmonman, sans-serif';
  if (fontStyle === 'chonburi')   return 'Chonburi, sans-serif';
  if (fontStyle === 'kanit')      return 'Kanit, sans-serif';
  if (fontStyle === 'sarabun')    return 'Sarabun, sans-serif';
  // default (undefined/'default') → พฤติกรรมเดิมเป๊ะ ไม่เปลี่ยนอะไร
  return hasThai(text) ? 'Mali, sans-serif' : 'Fredoka, sans-serif';
}

// ─── Emoji Helpers (ใหม่) ───────────────────────────────────────────────────────
//
// แนวคิด: สแกนข้อความหา 2 แบบ
//   1. อิโมจิในเซิร์ฟ  <:name:id> หรือ <a:name:id>  (regex เดียวกับ resolveCustomEmojis.js
//      เพื่อให้ทั้งไฟล์ตรวจจับรูปแบบนี้เหมือนกันหมด ไม่มีจุดไหน parse ไม่ตรงกัน)
//   2. อิโมจิทั่วไป Unicode (😀🎉💖 ฯลฯ) ด้วย package `emoji-regex` (แม่นยำกว่าเขียน
//      regex เองมาก เพราะอิโมจิ Unicode มีเคสซับซ้อน เช่น ผิวสี, ครอบครัว 👨‍👩‍👧,
//      ธงชาติ ฯลฯ ที่จริงๆ คือหลาย code point ต่อกันด้วย ZWJ)
//
// สร้าง regex ใหม่ทุกครั้งที่เรียก (ไม่ใช้ regex ตัวเดียวใช้ซ้ำ) — กันปัญหา
// `lastIndex` ค้างจากการ .test()/.exec() ครั้งก่อนที่ทำให้ครั้งถัดไปเพี้ยน
function customEmojiPattern() {
  return /<a?:[^\s:]+:(\d+)>/g;
}

const ZWJ      = '‍';   // Zero-Width Joiner — ใช้ต่ออิโมจิหลายตัวเป็นตัวเดียว (เช่น 👨‍👩‍👧)
const UFE0F_RE = /️/g;  // variation selector (บอกว่า "อยากได้เวอร์ชันสี") — ตัดออกก่อนแปลงเป็นชื่อไฟล์

/**
 * แปลงอิโมจิ Unicode ดิบ (เช่น "😀") เป็นรหัส code point แบบที่ Twemoji ใช้ตั้งชื่อไฟล์
 * (เช่น "1f600") — ใช้ฟังก์ชันจาก package twemoji ตรงๆ เพื่อให้ตรงกับชื่อไฟล์จริง
 * บน CDN เป๊ะๆ (ไม่ต้องเขียน logic แปลงเองให้เสี่ยงผิด)
 */
function toTwemojiCodepoint(raw) {
  // มี ZWJ (ต่ออิโมจิหลายตัว) → ห้ามตัด variation selector ออก เพราะบางเคสต้องใช้
  // แยกแยะว่าเป็นอิโมจิตัวไหน ถ้าไม่มี ZWJ → ตัดออกได้ปลอดภัย (ตาม convention ของ twemoji เอง)
  const stripped = raw.indexOf(ZWJ) < 0 ? raw.replace(UFE0F_RE, '') : raw;
  return twemoji.convert.toCodePoint(stripped);
}

// CDN ที่ใช้โหลดรูปอิโมจิ Unicode — jsdelivr proxy ของ repo jdecked/twemoji
// (fork ที่ดูแลต่อจาก twitter/twemoji เดิมที่เลิกดูแลไปแล้ว) โครงสร้างโฟลเดอร์
// รูปเหมือนเดิมทุกอย่าง (assets/72x72/<codepoint>.png)
//
// ⚠️ ถ้าวัน ไหนโหลดรูปจาก CDN นี้ไม่ได้ (เช่น Railway บล็อก โดเมนนี้ไว้ ซึ่งไม่ควรเกิด
// เพราะบอทคุยกับอินเทอร์เน็ตภายนอกได้ปกติอยู่แล้ว) แก้แค่บรรทัดเดียวนี้พอครับ
const TWEMOJI_CDN_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72';

/**
 * สแกนข้อความ 1 ก้อน หา "อิโมจิทุกตัว" (ทั้งในเซิร์ฟและ Unicode) เรียงตามตำแหน่งที่เจอ
 * แต่ละตัวที่เจอจะได้ข้อมูลพอสำหรับทั้ง (ก) โหลดรูปมาแคช (ข) ตัดข้อความเป็นชิ้นๆ ตอนวาด
 *
 * @param {string} text
 * @returns {Array<{start:number, end:number, key:string, url:string}>}
 */
function findEmojiMatches(text) {
  if (!text) return [];
  const found = [];
  let m;

  const customRe = customEmojiPattern();
  while ((m = customRe.exec(text))) {
    const id = m[1];
    found.push({
      start: m.index,
      end:   m.index + m[0].length,
      key:   `custom:${id}`,
      // ต่อ .png เสมอแม้เป็นอิโมจิเคลื่อนไหว (animated) — Discord CDN จะคืนภาพนิ่ง
      // เฟรมแรกให้อัตโนมัติ (ทำให้เคลื่อนไหวในภาพ PNG/GIF ที่วาดเองไม่ได้อยู่แล้ว)
      url:   `https://cdn.discordapp.com/emojis/${id}.png?size=96`,
    });
  }

  const uniRe = emojiRegex();
  while ((m = uniRe.exec(text))) {
    const codepoint = toTwemojiCodepoint(m[0]);
    found.push({
      start: m.index,
      end:   m.index + m[0].length,
      key:   `unicode:${codepoint}`,
      url:   `${TWEMOJI_CDN_BASE}/${codepoint}.png`,
    });
  }

  found.sort((a, b) => a.start - b.start);

  // กันเหนียว: ถ้ามีการจับซ้อนกัน (ไม่ควรเกิดในทางปฏิบัติ เพราะอิโมจิในเซิร์ฟ
  // กับ Unicode คนละรูปแบบกันชัดเจน) ตัดตัวที่ทับออก กันวาดซ้ำ/พังตอน slice
  const result = [];
  let lastEnd = -1;
  for (const f of found) {
    if (f.start < lastEnd) continue;
    result.push(f);
    lastEnd = f.end;
  }
  return result;
}

/** เช็คไวๆ ว่าข้อความมีอิโมจิ (แบบไหนก็ได้) อยู่หรือเปล่า — ใช้เลือกเส้นทางวาด */
function containsEmoji(text) {
  if (!text) return false;
  if (customEmojiPattern().test(text)) return true;
  return emojiRegex().test(text);
}

// แคชรูปอิโมจิที่โหลดมาแล้ว (key → Image ที่โหลดสำเร็จ, หรือ null ถ้าโหลดไม่สำเร็จ)
// อยู่ในหน่วยความจำเท่านั้น (หายเมื่อ restart บอท/worker thread) — ตั้งใจให้ง่าย
// ไม่ persist ลงดิสก์ เพราะแค่กันยิง network ซ้ำระหว่างบอทกำลังรันอยู่ก็พอแล้ว
const EMOJI_CACHE = new Map();
const EMOJI_FETCH_TIMEOUT_MS = 5000;

/** โหลดรูป 1 อัน จาก URL — คืน Image ถ้าสำเร็จ, null ถ้าล้มเหลว (ไม่ throw ออกไปข้างนอก) */
async function fetchEmojiImage(url, keyForLog) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMOJI_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return await loadImage(buf);
  } catch (e) {
    // โหลดไม่สำเร็จ → log ไว้เฉยๆ แล้วคืน null ให้ผู้เรียกไปตัดสินใจ "ข้ามวาด" เอง
    // ไม่ throw ต่อ เพราะอิโมจิตัวเดียวโหลดพังไม่ควรทำให้การ์ดทั้งใบ generate ไม่ได้
    console.warn(`[canvasDrawHelpers] โหลดรูปอิโมจิไม่สำเร็จ (${keyForLog}): ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * เตรียมรูปอิโมจิทั้งหมดที่ text blocks ใน config ต้องใช้ ให้พร้อมอยู่ใน EMOJI_CACHE
 * ก่อนเริ่มวาดจริง (ต้องทำก่อนเสมอ เพราะขั้นตอนวาดเป็น sync วาดรูปที่ยังโหลดไม่เสร็จไม่ได้)
 *
 * เช็ค EMOJI_CACHE.has(key) ก่อนทุกตัว → อิโมจิที่เคยโหลดมาแล้วรอบก่อน (เช่น
 * เฟรมก่อนหน้าของ GIF เดียวกัน หรือ preview ที่กดดูซ้ำๆ) จะไม่ยิง fetch ซ้ำอีกเลย
 */
async function preloadEmojisForBlocks(blocks) {
  const toFetch = new Map(); // key → url (ใช้ Map กันซ้ำ ถ้ามีอิโมจิเดียวกันหลาย block/หลายจุด)
  for (const block of blocks) {
    for (const match of findEmojiMatches(block?.content)) {
      if (EMOJI_CACHE.has(match.key) || toFetch.has(match.key)) continue;
      toFetch.set(match.key, match.url);
    }
  }
  if (toFetch.size === 0) return;

  await Promise.all(
    Array.from(toFetch, ([key, url]) =>
      fetchEmojiImage(url, key).then(img => EMOJI_CACHE.set(key, img))
    )
  );
}

// ─── wrapText (ของเดิม — ไม่แก้อะไรเลยแม้แต่บรรทัดเดียว) ───────────────────────
// ใช้กับข้อความที่ "ไม่มีอิโมจิ" เท่านั้น (ดูจุดเลือกเส้นทางใน drawTextBlock ด้านล่าง)
// คงไว้แบบเดิมทั้งหมดเพื่อไม่ให้การ์ดของ user ที่ไม่ได้ใช้อิโมจิเปลี่ยนหน้าตาแม้แต่พิกเซลเดียว

/**
 * word-wrap ข้อความ "1 ย่อหน้า" (ไม่มี \n ภายใน) ตาม maxWidth
 * ❗ ต้อง set ctx.font ก่อนเรียก ไม่งั้นวัดขนาดผิด
 * @returns {number} y ของบรรทัดสุดท้ายที่วาดในย่อหน้านี้
 */
function wrapParagraph(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return y;
  const words = text.split(' ');
  let line = '', currentY = y;
  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      if (line) { ctx.fillText(line, x, currentY); currentY += lineHeight; line = ''; }
      let charLine = '';
      for (const char of word) {
        const test = charLine + char;
        if (ctx.measureText(test).width > maxWidth && charLine !== '') {
          ctx.fillText(charLine, x, currentY); currentY += lineHeight; charLine = char;
        } else { charLine = test; }
      }
      line = charLine;
      continue;
    }
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line !== '') {
      ctx.fillText(line, x, currentY); currentY += lineHeight; line = word;
    } else { line = testLine; }
  }
  if (line) ctx.fillText(line, x, currentY);
  return currentY;
}

/**
 * วาดข้อความแบบ multi-line — รองรับทั้ง \n ที่ผู้ใช้พิมพ์เอง (กด Enter ใน modal)
 * และ word-wrap อัตโนมัติเมื่อยาวเกิน maxWidth
 * @returns {number} y ของบรรทัดสุดท้ายที่วาดทั้งหมด
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return y;
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  let currentY = y;
  for (let i = 0; i < paragraphs.length; i++) {
    currentY = wrapParagraph(ctx, paragraphs[i], x, currentY, maxWidth, lineHeight);
    if (i < paragraphs.length - 1) currentY += lineHeight;
  }
  return currentY;
}

// ─── wrapTextMixed (ใหม่) — เหมือน wrapText ทุกอย่าง แต่วาดอิโมจิเป็นรูปภาพแทรกกลางได้ด้วย
//
// ใช้เฉพาะตอน containsEmoji(text) เป็น true เท่านั้น (ดู drawTextBlock) — ข้อความ
// ที่ไม่มีอิโมจิเลยจะไม่มาแตะโค้ดส่วนนี้เลยสักบรรทัด

/**
 * แตกคำ 1 คำ (คั่นด้วยช่องว่างแล้ว) เป็นชิ้นย่อยๆ สลับข้อความ/อิโมจิ
 * เช่น "สวัสดี<:hi:123>ครับ" → [{type:'text',value:'สวัสดี'}, {type:'emoji',key:'custom:123'}, {type:'text',value:'ครับ'}]
 */
function splitWordIntoParts(word) {
  const matches = findEmojiMatches(word);
  if (matches.length === 0) return [{ type: 'text', value: word }];

  const parts = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) parts.push({ type: 'text', value: word.slice(cursor, m.start) });
    parts.push({ type: 'emoji', key: m.key });
    cursor = m.end;
  }
  if (cursor < word.length) parts.push({ type: 'text', value: word.slice(cursor) });
  return parts;
}

/** วัดความกว้างรวม (พิกเซล) ของคำ 1 คำ (ที่แตกเป็น parts แล้ว) */
function measureWordParts(ctx, parts, emojiSizePx) {
  let w = 0;
  for (const part of parts) {
    w += part.type === 'emoji' ? emojiSizePx : ctx.measureText(part.value).width;
  }
  return w;
}

/**
 * วาด parts ของ 1 คำ เรียงจากซ้ายไปขวา เริ่มที่ startX
 * (สลับ ctx.textAlign เป็น 'left' ชั่วคราว เพราะต้องคุมตำแหน่งเองทีละชิ้น
 * ต่างจาก wrapParagraph เดิมที่ใช้ ctx.fillText ทั้งบรรทัดรวด แล้วปล่อยให้
 * textAlign:'center' จัดกลางให้อัตโนมัติ — วิธีนั้นทำกับรูปภาพแทรกกลางไม่ได้)
 * @returns {number} ตำแหน่ง x หลังวาดคำนี้จบ (ต่อคำถัดไปได้เลย)
 */
function drawWordParts(ctx, parts, startX, y, emojiSizePx) {
  let cx = startX;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const part of parts) {
    if (part.type === 'text') {
      if (part.value) {
        ctx.fillText(part.value, cx, y);
        cx += ctx.measureText(part.value).width;
      }
    } else {
      const img = EMOJI_CACHE.get(part.key);
      // ถ้า img เป็น null (โหลดไม่สำเร็จ) หรือ undefined (ไม่น่าเกิด เพราะ preload
      // ไปก่อนแล้วเสมอ) → ข้ามการวาดไปเฉยๆ ไม่ error ไม่เว้นช่องว่างแปลกๆ ให้เห็น
      if (img) {
        ctx.drawImage(img, cx, y - emojiSizePx / 2, emojiSizePx, emojiSizePx);
      }
      cx += emojiSizePx;
    }
  }
  ctx.textAlign = prevAlign;
  return cx;
}

/**
 * เหมือน wrapParagraph เดิมทุกอย่าง (word-wrap ตาม maxWidth) แต่รองรับอิโมจิ
 * แทรกกลางคำได้ — จัดกลางบรรทัด (จำลอง textAlign:'center') ด้วยมือเอง เพราะ
 * บรรทัดที่มีรูปภาพผสมกับข้อความ ใช้ ctx.fillText(บรรทัดเดียวรวด) แบบเดิมไม่ได้
 */
function wrapParagraphMixed(ctx, text, x, y, maxWidth, lineHeight, emojiSizePx) {
  if (!text) return y;

  const spaceWidth = ctx.measureText(' ').width;
  const words       = text.split(' ').map(splitWordIntoParts);

  // ── ขั้น 1: จัดคำเป็นบรรทัดๆ ตาม maxWidth (greedy wrap เหมือน wrapParagraph เดิม)
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;
  for (const parts of words) {
    const wWidth = measureWordParts(ctx, parts, emojiSizePx);
    const extra  = currentLine.length ? spaceWidth : 0;
    if (currentLine.length && currentWidth + extra + wWidth > maxWidth) {
      lines.push({ parts: currentLine, width: currentWidth });
      currentLine  = [parts];
      currentWidth = wWidth;
    } else {
      currentLine.push(parts);
      currentWidth += extra + wWidth;
    }
  }
  if (currentLine.length) lines.push({ parts: currentLine, width: currentWidth });

  // ── ขั้น 2: วาดทีละบรรทัด จัดกลางด้วยมือ (คำนวณจุดเริ่มจากความกว้างรวมของบรรทัด)
  let currentY = y;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let cx = x - line.width / 2;
    for (let i = 0; i < line.parts.length; i++) {
      if (i > 0) cx += spaceWidth;
      cx = drawWordParts(ctx, line.parts[i], cx, currentY, emojiSizePx);
    }
    if (li < lines.length - 1) currentY += lineHeight;
  }
  return currentY;
}

/** เหมือน wrapText เดิมทุกอย่าง แต่เรียก wrapParagraphMixed แทน wrapParagraph */
function wrapTextMixed(ctx, text, x, y, maxWidth, lineHeight, emojiSizePx) {
  if (!text) return y;
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  let currentY = y;
  for (let i = 0; i < paragraphs.length; i++) {
    currentY = wrapParagraphMixed(ctx, paragraphs[i], x, currentY, maxWidth, lineHeight, emojiSizePx);
    if (i < paragraphs.length - 1) currentY += lineHeight;
  }
  return currentY;
}

// ─── ฟังก์ชันวาดย่อย (รับ w, h ทุกตัว — ไม่ hardcode) ────────────────────────

function drawFallbackBg(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#1a1a2e'); grad.addColorStop(0.5, '#16213e'); grad.addColorStop(1, '#0f3460');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
}

function drawOverlay(ctx, opacity, w, h) {
  ctx.fillStyle = `rgba(0,0,0,${opacity / 100})`;
  ctx.fillRect(0, 0, w, h);
}

function drawAvatar(ctx, avatarImg, config, w, h) {
  const ax = (config.avatarX      / 100) * w;
  const ay = (config.avatarY      / 100) * h;
  const r  = (config.avatarRadius / 100) * h;
  ctx.save();
  ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  ctx.drawImage(avatarImg, ax - r, ay - r, r * 2, r * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); ctx.stroke();
}

/**
 * วาดข้อความ 1 "block" — รับ block object เดี่ยว { content, x, y, size, bold, fontStyle }
 *
 * ❗ ต้องเรียก preloadEmojisForBlocks() (async) ให้เสร็จก่อนเสมอ ถ้า block.content
 * มีอิโมจิอยู่ — ฟังก์ชันนี้เอง "ไม่โหลดรูปเอง" (เป็น sync function ทำไม่ได้อยู่แล้ว)
 * แค่ไปอ่านรูปที่โหลดเสร็จแล้วจาก EMOJI_CACHE เท่านั้น (ดู drawAllTextBlocks ด้านล่าง)
 */
function drawTextBlock(ctx, block, w, h, customFonts) {
  const text = block.content || '';
  if (!text) return;
  const tx = (block.x / 100) * w;
  const ty = (block.y / 100) * h;
  const fontStyle  = block.fontStyle || 'default';
  // 🔒 กันเหนียว: Chonburi ไม่มี Bold จริง (มีแค่ weight เดียว) — ไม่ว่า
  // block.bold จะเป็น true ค้างมาจากตอนใช้ฟอนต์อื่นก่อนสลับมาหรือไม่ก็ตาม
  // บังคับ fontWeight ว่างเสมอเมื่อเลือก Chonburi อยู่
  // (ฟอนต์ของเซิร์ฟที่อัปโหลดเอง — fontStyle 'customFont:<id>' — ก็ไม่รู้ว่ามี
  // Bold จริงไหมเหมือนกัน แต่ปล่อยให้ลองใช้ 'bold ' ได้ตามปกติ ถ้าฟอนต์ไม่มี
  // weight ตัวหนา เบราว์เซอร์/Skia จะ fallback ไปใช้ weight ปกติแทนเองเงียบๆ)
  const fontWeight = (fontStyle === 'chonburi') ? '' : (block.bold ? 'bold ' : '');
  const fontSizePx = (block.size / 100) * h;

  ctx.font = `${fontWeight}${fontSizePx}px ${pickFontFamily(text, fontStyle, customFonts)}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffffff';

  if (containsEmoji(text)) {
    // มีอิโมจิ → ใช้เส้นทางใหม่ที่วาดรูปภาพแทรกกลางข้อความได้
    // ขนาดอิโมจิ = เท่ากับความสูงตัวอักษรพอดี (ให้ดูกลมกลืนไปกับข้อความรอบๆ)
    wrapTextMixed(ctx, text, tx, ty, w * 0.85, Math.ceil(fontSizePx * 1.35), fontSizePx);
  } else {
    // ไม่มีอิโมจิเลย → เส้นทางเดิมของเก่าทุกอย่าง ไม่เปลี่ยนพฤติกรรมแม้แต่พิกเซลเดียว
    wrapText(ctx, text, tx, ty, w * 0.85, Math.ceil(fontSizePx * 1.35));
  }

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
}

/**
 * วาดทุก text block ที่มีใน config.textBlocks (loop ผ่านแต่ละ block อิสระ)
 *
 * ⚠️ กลายเป็น async แล้ว (เดิมเป็น sync ธรรมดา) — เพราะต้องโหลดรูปอิโมจิ
 * (ถ้ามี) ให้เสร็จก่อนเริ่มวาดจริง ผู้เรียกทั้ง 2 จุด (generateMemberCardImage.js,
 * welcomeImageWorker.js) ต้องเติม await หน้าฟังก์ชันนี้ด้วย — ทั้งคู่เป็น async
 * function อยู่แล้วตั้งแต่เดิม เลยแค่เติม await คำเดียว ไม่ต้องแก้โครงสร้างอะไรเพิ่ม
 */
async function drawAllTextBlocks(ctx, config, w, h) {
  // ── ฟอนต์ของเซิร์ฟ (ถ้ามี): config.customFonts เป็น array ของฟอนต์ที่เซิร์ฟ
  // นี้อัปโหลดไว้ทั้งหมด (🆕 เปลี่ยนจากเดิมที่มีแค่ฟอนต์เดียว — ดู comment ที่
  // ensureAllCustomFontsRegistered ด้านบน) แนบมาโดยผู้เรียก (welcome-setup.js /
  // goodbye-setup.js) จากการเช็ค utils/fontStorage.js ด้วย guildId — ลงทะเบียน
  // ให้ครบทุกไฟล์ก่อนวาดจริงเสมอ (ปลอดภัยเรียกซ้ำได้ทุกครั้ง)
  const customFonts = config.customFonts ?? [];
  ensureAllCustomFontsRegistered(customFonts);

  const blocks = config.textBlocks ?? [];
  await preloadEmojisForBlocks(blocks);
  for (const block of blocks) {
    drawTextBlock(ctx, block, w, h, customFonts);
  }
}

module.exports = {
  DEFAULT_W,
  DEFAULT_H,
  hasThai,
  pickFontFamily,
  ensureCustomFontRegistered,
  ensureAllCustomFontsRegistered,
  wrapParagraph,
  wrapText,
  drawFallbackBg,
  drawOverlay,
  drawAvatar,
  drawTextBlock,
  drawAllTextBlocks,
};