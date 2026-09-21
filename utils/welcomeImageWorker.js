// utils/welcomeImageWorker.js
// Worker Thread script — สร้าง animated GIF ต้อนรับใน thread แยกต่างหาก
//
// ❗ ทำไมต้องแยก thread:
//   การ extract หลายสิบ/ร้อยเฟรม + วาด canvas ทับทุกเฟรม + encode GIF
//   ใช้เวลาหลักวินาทีถึงหลักสิบวินาที ถ้าทำใน event loop หลัก (thread เดียวกับ
//   ที่ Discord.js รับ gateway events ทั้งหมด) จะทำให้บอท "ค้าง" ไม่ตอบสนอง
//   ปุ่ม/คำสั่งอื่นระหว่างนั้น — worker_threads แก้ปัญหานี้โดยรัน JS ใน
//   V8 isolate แยกต่างหาก (คนละ thread จริงๆ ของ OS) ไม่แชร์ event loop
//   กับเธรดหลัก ดังนั้นบอทยังตอบสนองได้ปกติระหว่างที่ worker กำลังเข้ารหัส GIF
//
// ไฟล์นี้ไม่ได้ require ตรงๆ จากที่ไหน — ถูกโหลดผ่าน `new Worker(path)`
// ใน utils/imageWorkerPool.js เท่านั้น
//
// การสื่อสารกับเธรดหลัก:
//   รับงาน:   parentPort.on('message', async (jobConfig) => { ... })
//   ส่งผล:     parentPort.postMessage({ buffer, ... })          — สำเร็จ
//             parentPort.postMessage({ error: message })        — ล้มเหลว
//
// ❗ ข้อจำกัดสำคัญของ worker_threads ที่ต้องรู้:
//   1. ส่งได้แค่ข้อมูลที่ "structured clone" ได้ (object ธรรมดา, Buffer,
//      Array, string, number) — ส่ง object ที่มี method หรือ native binding
//      (เช่น @napi-rs/canvas Image ที่โหลดแล้ว) ข้าม thread ไม่ได้เลย
//      → ต้องส่ง avatarUrl (string) แทน แล้วให้ worker โหลดรูปเองในนี้
//   2. Buffer ที่ postMessage กลับไป จะถูกแปลงเป็น Uint8Array ธรรมดาที่ฝั่งรับ
//      (ไม่ใช่ Buffer object) — ฝั่งเธรดหลักต้อง Buffer.from(received) เอง
//   3. native addon (@napi-rs/canvas, sharp, gif-encoder-2) ต้อง require()
//      ใหม่ในไฟล์นี้ — ทดสอบแล้วว่าทำงานได้ปกติใน worker thread เหมือนกับ
//      main thread ทุกประการ (font registration ก็ต้องทำซ้ำในนี้ด้วย
//      ผ่าน canvasDrawHelpers.js ซึ่ง require() ใหม่ทำให้ font register ใหม่)

const { parentPort } = require('worker_threads');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const GIFEncoder                  = require('gif-encoder-2');
const sharp                       = require('sharp');

const {
  drawOverlay,
  drawAvatar,
  drawAllTextBlocks,
} = require('./canvasDrawHelpers');

// Discord จำกัดขนาดไฟล์อัปโหลดสูงสุด 8MB (ปกติ) — ต้องลดขนาด GIF ให้ไม่เกินนี้
//
// 🆕 [21 ก.ย. 2569] ค่าทั้งสองนี้ตอนนี้เป็นแค่ "baseline" (จุดเริ่มต้น/ค่าคุณภาพดีสุด
// ที่ยอมรับได้) เท่านั้น — งานจริงแต่ละครั้งอาจถูกปรับขึ้น (frameStep) หรือลง (maxWidth)
// อัตโนมัติโดย pickAdaptiveGifSettings() ด้านล่าง ถ้าคาดว่า GIF ต้นฉบับจะใช้เวลาสร้างนาน
// เกินเป้าที่ตั้งไว้ (ดูคอมเมนต์ยาวตรง "Adaptive speed control" ด้านล่าง)
const GIF_MAX_WIDTH  = 480; // scale ลงถ้ากว้างเกินนี้ (ความสูงลดตามสัดส่วน)
const GIF_FRAME_STEP = 3;   // เอาทุกๆ N เฟรม (step=3 เร็วกว่า step=2 ราว 35% จากการทดสอบจริง)

// 🐛→✅ [21 ก.ย. 2569] บั๊กที่น้องหนาวเจอ: สมาชิกใหม่เข้าเซิร์ฟ DE♡O แล้วไม่ได้รูปต้อนรับเลย
// (log ขึ้น "Input image exceeds pixel limit") — sharp/libvips มีลิมิตความปลอดภัยในตัว
// (ค่าเริ่มต้นประมาณ 268 ล้านพิกเซล) กันเปิดไฟล์ภาพที่ถูกปลอมขนาดใหญ่เกินจริงมาทำให้โปรแกรม
// เปลืองหน่วยความจำจนพัง (เรียกว่า "decompression bomb") — ปัญหาคือตอนอ่าน metadata ด้วย
// `{ animated: true }` (บรรทัดด้านล่าง) sharp จะเอา "ความสูงของ 1 เฟรม × จำนวนเฟรมทั้งหมด"
// มานับรวมเป็นพิกเซลทั้งก้อนเดียว ถ้า GIF พื้นหลังมีความละเอียดต่อเฟรมสูงและมีหลายเฟรม
// (เช่น GIF ต้อนรับสวยๆ ที่วาดมาอย่างดี ไม่ได้เป็นไฟล์ประสงค์ร้ายเลย) ก็มีโอกาสชนลิมิตนี้ได้
// จริงๆ ทำให้ sharp ปฏิเสธตั้งแต่ยังไม่ทันได้ลดขนาดตามที่ตั้งใจไว้ (GIF_MAX_WIDTH ด้านบน)
// ด้วยซ้ำ — แก้โดยขยับลิมิตของ sharp ขึ้นเอง (ยังไม่ปิดไปเลยด้วย `false` เพราะงั้นจะเสีย
// การป้องกันไฟล์ประสงค์ร้ายไปหมด — ตั้งเป็นตัวเลขที่ใหญ่ขึ้นพอรองรับ GIF ต้อนรับที่ใหญ่จริงๆ
// ได้ (ราว 1,000 ล้านพิกเซล เผื่อไว้เกิน 3 เท่าของค่าเริ่มต้น) แต่ยังกันไฟล์ที่ใหญ่เกินจริง
// แบบผิดปกติสุดขั้วอยู่ — ถ้าเจอ GIF ที่ยังชนลิมิตใหม่นี้อีก แปลว่าใหญ่ผิดปกติจริงๆ ควรเตือน
// user ให้ลดขนาดไฟล์ลง ไม่ใช่ขยับลิมิตต่อไปเรื่อยๆ)
const SHARP_PIXEL_LIMIT = 1_000_000_000; // ~1,000 ล้านพิกเซล (ดีฟอลต์ของ sharp ~268 ล้าน)

// เวลาที่ยอมรอสูงสุดตอนดาวน์โหลดรูป/GIF พื้นหลัง ก่อนยกเลิก (กันบอทค้าง/คิว worker
// ตันทั้งระบบ ถ้า URL พื้นหลังที่ user ใส่มาค้างไม่ตอบ) — ตั้งไว้นานกว่า checkImageUrl.js
// (ที่ใช้แค่ 3 วิ) เพราะตรงนี้โหลดไฟล์ GIF เต็มๆ ทั้งไฟล์ (อาจหนักหลาย MB) ไม่ใช่แค่
// ยิง HEAD request เช็ค header เฉยๆ เหมือนที่นั่น
const BACKGROUND_FETCH_TIMEOUT_MS = 15000;

// ─── 🚀 Adaptive speed control [21 ก.ย. 2569] ──────────────────────────────
// ที่มา: น้องหนาวถามว่าเวลาที่ใช้สร้าง GIF ขึ้นกับอะไรบ้าง แล้วอยากให้ "ถ้าคาดว่าจะ
// เกิน 5 วิ ให้ลดงานลงอัตโนมัติ" เพื่อให้พร้อมส่งเร็วเสมอ ไม่ต้องรอนานเกินไป
//
// 🔬 ทดสอบจริงในแซนด์บ็อกซ์ก่อนเขียนโค้ดนี้ (สร้าง GIF สังเคราะห์ 4 ขนาด ตั้งแต่
// 30 ถึง 250 เฟรม ความละเอียดต้นฉบับ 600×340 ถึง 1200×675 แล้ววัดเวลาแต่ละขั้น
// ของ pipeline จริงๆ ทีละเฟรม) เจอสิ่งที่ไม่คาดคิดและสำคัญมาก:
//
//   "ตัวที่กินเวลาส่วนใหญ่ที่สุด คือจำนวนเฟรมทั้งหมดของ GIF ต้นฉบับ (pages) — ไม่ใช่
//   ความละเอียดที่จะ resize ออกมา!" เพราะ sharp(buf, {page: i}) ต้องไล่ประกอบ
//   (resolve disposal) เฟรมตั้งแต่ 0 ถึง i ใหม่ทุกครั้งที่เรียก แล้วค่อย resize ทีหลัง —
//   ลอง resize เหลือ 320px หรือ 240px แทน 480px เวลา extract แทบไม่ลดลงเลยสักนิด
//   (วัดจริง: 480px กับ 320px ที่จำนวนเฟรมเท่ากัน ใช้เวลาต่างกันแค่ ~2%) และยิ่งเฟรม
//   ท้ายๆ ของ GIF ยาวๆ ยิ่งช้าขึ้นเรื่อยๆ แบบไม่เป็นเส้นตรง (ประมาณ pages² เพราะเฟรม
//   ท้ายสุดต้องไล่ประกอบเฟรมก่อนหน้าทั้งหมด)
//
//   สรุปเชิงปฏิบัติ: "ข้ามเฟรมให้ถี่ขึ้น" (เพิ่ม GIF_FRAME_STEP) ช่วยลดเวลาได้จริงและ
//   คุ้มกว่า "ลดความละเอียด" (maxWidth) มาก — เพราะงั้นเวลาต้องลดงานให้ทันเป้า 5 วิ
//   จะลอง "เพิ่ม step" ก่อนเป็นอันดับแรกเสมอ แล้วค่อยใช้ "ลด maxWidth" เป็นตัวช่วยรอง
//   (ช่วยเวลา encode กับขนาดไฟล์ผลลัพธ์ แต่ไม่ได้ช่วยเวลา extract อย่างมีนัยสำคัญ)
//
// ค่าคงที่ EXTRACT_K1 / EXTRACT_OVERHEAD / ENCODE_K2 ด้านล่างมาจากการ fit สมการ
// ถดถอยจากตัวเลขที่วัดได้จริง (ไม่ได้เดา) ความแม่นยำอยู่ในช่วง ±15% เทียบกับเวลาจริง
// — แม่นพอสำหรับ "ประมาณการก่อนเริ่มงาน" ไม่จำเป็นต้องแม่นยำ 100% เพราะเป้าหมาย
// แค่ตัดสินใจว่า "ต้องลดงานไหม" ไม่ใช่ต้องรู้เวลาที่แน่นอนเป๊ะๆ
const TARGET_GENERATION_MS      = 4500;    // เผื่อ buffer ไว้ใต้ 5 วิที่ตั้งเป้า (กันเวลาส่วนอื่น เช่น ดาวน์โหลด/avatar บวกเพิ่มมา)
const EXTRACT_K1_MS_PER_PXIDX   = 0.0000017; // ms ต่อ (พิกเซลต้นฉบับ 1 พิกเซล × ตำแหน่งเฟรมที่ i)
const EXTRACT_OVERHEAD_MS       = 15;        // overhead คงที่ต่อการเรียก sharp() 1 ครั้ง (เปิด/ปิดไฟล์ ฯลฯ)
const ENCODE_K2_MS_PER_PXFRAME  = 0.00008;   // ms ต่อ (พิกเซล output 1 พิกเซล × 1 เฟรมที่ encode)
const MAX_FRAME_STEP            = 10;        // step สูงสุดที่ยอมให้ข้าม (เกินนี้ animation จะกระตุกเกินไปจนดูไม่ออกว่าเป็น GIF)
const MIN_FRAMES_KEPT           = 8;         // อย่างน้อยต้องเหลือกี่เฟรมถึงจะยังพอ "ดูเคลื่อนไหว" ได้ไม่กระตุกเกินไป
const MIN_ADAPTIVE_WIDTH        = 240;       // ไม่ลดความละเอียดลงต่ำกว่านี้ (กันภาพแตกจนดูไม่ออก)

// 🆕 [21 ก.ย. 2569] ตามที่น้องหนาวขอเพิ่ม — นอกจากประมาณเวลาแล้วค่อยๆ ปรับ (ขั้น 1-2
// ด้านล่าง) ยังอยากได้ "เพดานแข็ง" (hard cap) กันพลาดอีกชั้นด้วย เผื่อสูตรประมาณเวลา
// คลาดเคลื่อน (มีค่าคลาดเคลื่อนได้ ±15% ตามที่ทดสอบไว้ — เป็นการประมาณ ไม่ใช่วัดจริง)
// หรือเจอ GIF ที่ผิดปกติเกินกว่าที่เคยทดสอบ — เพดานนี้ "ไม่ยอมให้เกินเด็ดขาด" ไม่ว่า
// ผลลัพธ์จากขั้น 1-2 จะออกมาเป็นเท่าไหร่ก็ตาม (ทำงานเป็นขั้นที่ 3 ถัดจากนั้นเสมอ)
const MAX_FRAMES_HARD_CAP       = 60;        // จำนวนเฟรมสูงสุดที่ยอมให้ใช้จริง ไม่ว่ากรณีใดๆ

/**
 * ประมาณเวลารวม (extract + encode) ล่วงหน้า จากจำนวนเฟรม/ความละเอียดต้นฉบับ
 * + การตั้งค่าที่จะใช้จริง — ใช้ตัดสินใจ "ก่อน" เริ่มงานหนักจริง ไม่ใช่วัดย้อนหลัง
 */
function predictGenerationMs(origW, origH, pages, frameStep, canvasW, canvasH) {
  const framesUsed = Math.max(1, Math.ceil(pages / frameStep));
  const extractMs =
    EXTRACT_K1_MS_PER_PXIDX * origW * origH * pages * pages / frameStep +
    EXTRACT_OVERHEAD_MS * framesUsed;
  const encodeMs = ENCODE_K2_MS_PER_PXFRAME * canvasW * canvasH * framesUsed;
  return extractMs + encodeMs;
}

/**
 * เลือกค่า frameStep / maxWidth แบบ adaptive ให้เวลาที่คาดว่าจะใช้ไม่เกิน
 * TARGET_GENERATION_MS — ลองเพิ่ม frameStep (ข้ามเฟรมถี่ขึ้น) ก่อนเสมอ เพราะ
 * ช่วยเวลาได้มากกว่า (ดูคอมเมนต์ยาวด้านบน) แล้วค่อยลด maxWidth เป็นตัวช่วยรอง
 * ถ้ายังไม่เข้าเป้า (เช่น GIF ต้นฉบับใหญ่/ยาวมากจริงๆ)
 */
function pickAdaptiveGifSettings(origW, origH, pages) {
  let frameStep = GIF_FRAME_STEP; // เริ่มจากค่า baseline เดิม (คุณภาพดีสุดที่ยอมรับได้)
  let maxWidth  = GIF_MAX_WIDTH;
  const calcCanvas = (w) => {
    const scale = origW > w ? w / origW : 1;
    return { canvasW: Math.round(origW * scale), canvasH: Math.round(origH * scale) };
  };
  let { canvasW, canvasH } = calcCanvas(maxWidth);

  // ── ขั้น 1: เพิ่ม frameStep ทีละ 1 จนกว่าจะเข้าเป้า (หรือแตะเพดานที่ยอมรับได้)
  while (
    predictGenerationMs(origW, origH, pages, frameStep, canvasW, canvasH) > TARGET_GENERATION_MS &&
    frameStep < MAX_FRAME_STEP &&
    Math.ceil(pages / (frameStep + 1)) >= MIN_FRAMES_KEPT
  ) {
    frameStep++;
  }

  // ── ขั้น 2: ถ้ายังไม่เข้าเป้า (GIF ต้นฉบับใหญ่มากจริงๆ) ค่อยลดความละเอียดช่วยเสริม
  while (
    predictGenerationMs(origW, origH, pages, frameStep, canvasW, canvasH) > TARGET_GENERATION_MS &&
    maxWidth > MIN_ADAPTIVE_WIDTH
  ) {
    maxWidth -= 60;
    ({ canvasW, canvasH } = calcCanvas(maxWidth));
  }

  // ── ขั้น 3: เพดานแข็ง (hard cap) — ไม่สนใจว่าขั้น 1-2 ทำนายเวลาไว้เท่าไหร่ ถ้าจำนวน
  // เฟรมที่จะใช้จริง (pages / frameStep) ยังเกิน MAX_FRAMES_HARD_CAP อยู่ ให้เพิ่ม
  // frameStep ต่อไปอีกจนกว่าจะไม่เกิน (ตรงนี้ "ยอมทะลุ" MAX_FRAME_STEP ของขั้น 1 ได้
  // เพราะเป็นกฎคนละชั้นกัน — ขั้น 1 คือ "กันภาพกระตุกเกินไป" ส่วนขั้นนี้คือ "กันเวลา/
  // ขนาดไฟล์หลุดโผ" ซึ่งสำคัญกว่า ถ้าเจอ GIF ที่ยาวขนาดต้องข้ามเฟรมเยอะขนาดนี้ ภาพเคลื่อนไหว
  // จะกระตุกก็จริง แต่ก็ยังดีกว่าปล่อยให้ผู้ใช้รอนานเกินไปหรือได้ไฟล์ใหญ่เกิน)
  const hardCapStep = Math.ceil(pages / MAX_FRAMES_HARD_CAP);
  if (hardCapStep > frameStep) {
    frameStep = hardCapStep;
  }

  const predictedMs = Math.round(predictGenerationMs(origW, origH, pages, frameStep, canvasW, canvasH));
  return { frameStep, maxWidth, canvasW, canvasH, predictedMs };
}

/**
 * สร้าง animated GIF ต้อนรับด้วย hybrid approach 3 ขั้น (เหมือนเดิมทุกประการ
 * เพียงแค่ย้ายมาไว้ใน worker thread + โหลด avatar จาก URL เองแทนรับมาสำเร็จรูป)
 *
 * ขั้นที่ 1 — sharp extract frames (resolve frame disposal ให้ครบ)
 * ขั้นที่ 2 — canvas composite overlay ต่อเฟรม
 * ขั้นที่ 3 — gif-encoder-2 encode ด้วย raw pixel data
 *
 * @param {object} config
 *   ต้องมี avatarUrl (string|null) แทน avatarImg ที่โหลดแล้ว
 *   เพราะ Image object ข้าม thread ไม่ได้ (ไม่ใช่ structured-clonable)
 * @returns {Promise<Buffer>}
 */
async function generateWelcomeGif(config) {
  // ── โหลด avatar จาก URL เอง (ในเธรดนี้) — โหลดจาก loaded Image ข้าม thread ไม่ได้
  let avatarImg = null;
  if (config.avatarEnabled && config.avatarUrl) {
    try {
      avatarImg = await loadImage(config.avatarUrl);
    } catch {
      // avatar โหลดไม่ได้ → วาดต่อไปโดยไม่มี avatar (ไม่ throw ทั้ง job)
    }
  }

  // ── ดาวน์โหลด GIF ต้นฉบับ
  // AbortController ใช้ยกเลิก fetch ถ้ารอนานเกิน BACKGROUND_FETCH_TIMEOUT_MS —
  // ถ้าไม่ใส่ไว้ แล้ว URL พื้นหลังค้างไม่ตอบ (server เน่า, ลิงก์หลุด ฯลฯ) worker
  // เธรดนี้จะค้างรอตลอดไป และเพราะ worker pool มีจำนวนจำกัด งานต้อนรับ/อำลาของ
  // เซิร์ฟอื่นๆ ที่รอคิวอยู่จะติดตันไปด้วยทั้งระบบ
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BACKGROUND_FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(config.backgroundUrl, { signal: controller.signal });
  } finally {
    // เคลียร์ timer ทุกกรณี (ทั้งสำเร็จและ error) กัน timer ค้างอยู่เบื้องหลังเฉยๆ
    clearTimeout(timeoutId);
  }
  // ถ้าโดน abort เพราะ timeout, fetch() จะ throw ออกไปเองก่อนถึงบรรทัดนี้อยู่แล้ว
  // (AbortError) — ปล่อยให้หลุดออกไปให้ parentPort.on('message') ข้างล่างจับแทน
  // เหมือน error เคสอื่นๆ ทุกประการ ไม่ต้องดักซ้ำตรงนี้
  if (!res.ok) throw new Error(`ดาวน์โหลด GIF ล้มเหลว: HTTP ${res.status}`);
  const rawBuffer = Buffer.from(await res.arrayBuffer());

  // ── อ่าน metadata: ขนาดเฟรม + จำนวนเฟรม + delay ต้นฉบับ
  const meta   = await sharp(rawBuffer, { animated: true, limitInputPixels: SHARP_PIXEL_LIMIT }).metadata();
  const origW  = meta.width;
  const origH  = meta.pageHeight ?? meta.height; // pageHeight = 1 เฟรม (ไม่ใช่ height รวม)
  const pages  = meta.pages ?? 1;
  const delays = meta.delay ?? [];

  // ── ขั้นที่ 1: คำนวณขนาด output + frameStep แบบ adaptive (ดูคอมเมนต์ยาวที่
  // ประกาศ pickAdaptiveGifSettings ด้านบนว่าทำไมต้องปรับ 2 ค่านี้คู่กัน)
  // ถ้า GIF ต้นฉบับไม่ใหญ่/ไม่ยาวมาก ฟังก์ชันนี้จะคืนค่า baseline เดิมกลับมาเป๊ะๆ
  // (frameStep = GIF_FRAME_STEP, maxWidth = GIF_MAX_WIDTH) ไม่มีอะไรเปลี่ยนเลย
  const { frameStep, maxWidth, canvasW, canvasH, predictedMs } =
    pickAdaptiveGifSettings(origW, origH, pages);

  console.log(
    `[worker] input: ${origW}×${origH}, ${pages} เฟรม` +
    ` → output: ${canvasW}×${canvasH} (step=${frameStep}, maxWidth=${maxWidth})` +
    `, ${(rawBuffer.length / 1024 / 1024).toFixed(2)} MB` +
    `, คาดว่าใช้เวลา ~${(predictedMs / 1000).toFixed(1)} วิ`
  );
  if (frameStep !== GIF_FRAME_STEP || maxWidth !== GIF_MAX_WIDTH) {
    console.log(
      `[worker] ⚡ ปรับลดอัตโนมัติ เพราะ GIF ต้นฉบับใหญ่/ยาวเกินไป ` +
      `(step ${GIF_FRAME_STEP}→${frameStep}, maxWidth ${GIF_MAX_WIDTH}→${maxWidth}) ` +
      `เพื่อให้ยังพร้อมส่งได้ภายในเวลาที่ตั้งเป้าไว้ (~${(TARGET_GENERATION_MS / 1000).toFixed(1)} วิ)`
    );
  }

  // ── ขั้นที่ 2: extract full frames ด้วย sharp พร้อม resize + frame step
  //
  // 🔍 [21 ก.ย. 2569] เคยลองสงสัยว่าตรงนี้ต้องเติม animated: true คู่กับ page: i ไหม
  // (กลัวว่า sharp จะไม่ resolve frame disposal ของ GIF แบบ "diff frame" ให้ครบ) —
  // ทดสอบจริงในแซนด์บ็อกซ์ด้วย GIF ตัวอย่างที่จงใจทำให้เป็น diff-frame (เฟรมหลังๆ เก็บ
  // แค่พื้นที่เล็กๆ ที่เปลี่ยน ไม่ใช่ทั้งภาพ) แล้วเทียบกับต้นฉบับที่ประกอบถูกต้องแน่นอน
  // (ผ่าน Pillow) พบว่า `sharp(rawBuffer, { page: i })` เดิม (ไม่มี animated: true)
  // **ประกอบเฟรมถูกต้องสมบูรณ์อยู่แล้ว** (พิกเซลตรงกัน 100% กับต้นฉบับ) — ส่วนการเติม
  // `animated: true` เข้าไปด้วยกลับทำให้พังกว่าเดิม เพราะ sharp ตีความเป็น "อ่านทุกเฟรม
  // ตั้งแต่ page i ไปจนจบ" (เทียบเท่า pages: -1) ไม่ใช่ "เฟรมเดียวที่ i" เลย (ทดสอบแล้ว
  // meta.height ออกมาเป็นหลายเฟรมซ้อนกันจริงๆ) เลย **ไม่แก้ตรงนี้** ปล่อยไว้แบบเดิม
  const framePngs = [];
  for (let i = 0; i < pages; i += frameStep) {
    const png = await sharp(rawBuffer, { page: i, limitInputPixels: SHARP_PIXEL_LIMIT })
      .resize(canvasW, canvasH)
      .png()
      .toBuffer();
    framePngs.push(png);
  }
  console.log(
    `[worker] extracted ${framePngs.length}/${pages} เฟรม` +
    ` (step=${frameStep}, resize=${canvasW}×${canvasH})`
  );

  // ── ขั้นที่ 3: composite per frame → encode ทันที
  //
  // ❗ ไม่เรียก setQuality() แล้ว — ตรวจ source code gif-encoder-2 v1.0.5 พบว่า
  // เป็น dead code: this.sample ถูก hardcode เป็น 10 ใน constructor เสมอ
  // ส่วน setQuality() แค่เก็บค่าไว้ที่ this.quality ซึ่งไม่มีจุดไหนอ่านมันเลย
  // (ตอน quantize จริงใช้ this.sample ไม่ใช่ this.quality)
  // ทดสอบยืนยันแล้ว: encode ด้วย quality 10/20/30 ได้ไฟล์ขนาดเท่ากันทุกไบต์
  const encoder = new GIFEncoder(canvasW, canvasH, 'neuquant', true);
  encoder.setRepeat(0);
  encoder.start();

  // ❗ อิโมจิใน text block (ถ้ามี) ถูกโหลด+แคชไว้ครั้งแรกที่ drawAllTextBlocks()
  // เรียกด้านล่าง (เฟรมที่ 0) — เฟรมถัดๆ ไปที่เหลือจะอ่านจากแคชในหน่วยความจำ
  // (EMOJI_CACHE ใน canvasDrawHelpers.js) แทบจะทันที ไม่ยิง network ซ้ำทุกเฟรม
  // ดังนั้นถึง drawAllTextBlocks จะเป็น async แล้ว ก็แทบไม่กระทบความเร็วรวมของ
  // การ encode GIF เลย (ยกเว้นเฟรมแรกที่ต้องรอโหลดรูปจริงๆ ครั้งเดียว)
  for (let i = 0; i < framePngs.length; i++) {
    const originalIndex = i * frameStep;

    const bgImage = await loadImage(framePngs[i]);
    const canvas  = createCanvas(canvasW, canvasH);
    const ctx     = canvas.getContext('2d');

    // 🐛→✅ [21 ก.ย. 2569] บั๊กจริงที่เจอ (เทียบภาพ Preview vs รูปนิ่งแล้วเห็นชัดว่า
    // พื้นหลังกลายเป็นสีดำทั้งที่ต้นฉบับเป็นสีขาว) — GIF ที่น้องหนาวใช้ (นกขาว+ดาว) ตัด
    // พื้นหลังออกแล้ว มีส่วนโปร่งใสเยอะ พอ canvas วาดทับแค่ส่วนที่มีลวดลาย ส่วนที่เหลือ
    // (โปร่งใส) จะมีค่าสีเริ่มต้นเป็น "ดำโปร่งใส" (rgba(0,0,0,0)) — ปัญหาคือ gif-encoder-2
    // ที่ใช้เข้ารหัส GIF ตอนท้าย **ไม่รองรับความโปร่งใสแบบเต็มเหมือน PNG** (ไม่ได้เรียก
    // .setTransparent() ตั้งค่าไว้เลย) เลยเอาแค่ค่าสี RGB ไปเข้ารหัสตรงๆ โดยไม่สนใจ alpha
    // — ผลคือทุกจุดที่ "โปร่งใส" ในต้นฉบับ กลายเป็น "ดำทึบ" ในไฟล์ GIF สุดท้ายแทน (ทดสอบ
    // ยืนยันจริงในแซนด์บ็อกซ์แล้ว: RGBA (0,0,0,0) ก่อนเข้ารหัส → (0,0,0,255) หลังเข้ารหัส)
    // แก้โดยเติมพื้นขาวรองไว้ก่อนเสมอ ก่อนวาดเฟรมพื้นหลังทับ (ถ้าเฟรมทึบเต็มอยู่แล้วจะไม่มีผล
    // อะไรเปลี่ยนเลย เพราะโดนทับมิดหมด แต่ถ้ามีส่วนโปร่งใสจะได้เห็นเป็นพื้นขาวแทนพื้นดำ)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.drawImage(bgImage, 0, 0, canvasW, canvasH);
    drawOverlay(ctx, config.overlayOpacity, canvasW, canvasH);
    if (config.avatarEnabled && avatarImg) drawAvatar(ctx, avatarImg, config, canvasW, canvasH);
    await drawAllTextBlocks(ctx, config, canvasW, canvasH);

    encoder.setDelay((delays[originalIndex] ?? 100) * frameStep);
    encoder.addFrame(ctx.getImageData(0, 0, canvasW, canvasH).data);
  }

  encoder.finish();
  const gifBuffer = encoder.out.getData();
  const sizeMB    = gifBuffer.length / 1024 / 1024;

  console.log(
    `[worker] output: ${framePngs.length} เฟรม, ${sizeMB.toFixed(2)} MB` +
    ` — ${sizeMB < 8 ? '✅ ผ่าน Discord limit (8MB)' : '⚠️ ยังเกิน 8MB!'}`
  );

  return gifBuffer;
}

// ─── Message Handler ───────────────────────────────────────────────────────────
// worker thread ตัวเดียวรับงานได้หลายครั้งตลอดอายุของมัน (persistent worker,
// ไม่ใช่สร้างใหม่ทุกงาน) — imageWorkerPool.js เป็นคนสร้าง Worker นี้แค่ครั้งเดียว
// ตอนบอท start แล้วส่งงานเข้ามาทาง postMessage ซ้ำๆ ได้เรื่อยๆ
parentPort.on('message', async (jobConfig) => {
  try {
    const buffer = await generateWelcomeGif(jobConfig);

    // ส่ง Buffer กลับแบบไม่ระบุ transferList — ปล่อยให้ structured clone
    // copy ข้อมูลตามปกติ (ปลอดภัยกว่า การ transfer ArrayBuffer ที่อาจ
    // เป็น slice ของ shared memory pool ภายในของ Node ซึ่งถ้า transfer
    // ผิดจะทำให้ buffer อื่นที่ไม่เกี่ยวข้องเสียหายได้ — ค่าใช้จ่ายจากการ
    // copy นี้เล็กน้อยมากเทียบกับเวลาที่ใช้ encode GIF ทั้งหมด)
    parentPort.postMessage({ buffer });
  } catch (e) {
    console.error('[worker] generateWelcomeGif ล้มเหลว:', e.message);
    parentPort.postMessage({ error: e.message });
  }
});