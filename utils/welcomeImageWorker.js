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
const GIF_MAX_WIDTH  = 480; // scale ลงถ้ากว้างเกินนี้ (ความสูงลดตามสัดส่วน)
const GIF_FRAME_STEP = 3;   // เอาทุกๆ N เฟรม (step=3 เร็วกว่า step=2 ราว 35% จากการทดสอบจริง)

// เวลาที่ยอมรอสูงสุดตอนดาวน์โหลดรูป/GIF พื้นหลัง ก่อนยกเลิก (กันบอทค้าง/คิว worker
// ตันทั้งระบบ ถ้า URL พื้นหลังที่ user ใส่มาค้างไม่ตอบ) — ตั้งไว้นานกว่า checkImageUrl.js
// (ที่ใช้แค่ 3 วิ) เพราะตรงนี้โหลดไฟล์ GIF เต็มๆ ทั้งไฟล์ (อาจหนักหลาย MB) ไม่ใช่แค่
// ยิง HEAD request เช็ค header เฉยๆ เหมือนที่นั่น
const BACKGROUND_FETCH_TIMEOUT_MS = 15000;

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
  const meta   = await sharp(rawBuffer, { animated: true }).metadata();
  const origW  = meta.width;
  const origH  = meta.pageHeight ?? meta.height; // pageHeight = 1 เฟรม (ไม่ใช่ height รวม)
  const pages  = meta.pages ?? 1;
  const delays = meta.delay ?? [];

  // ── ขั้นที่ 1: คำนวณขนาด output — scale ลงถ้ากว้างเกิน GIF_MAX_WIDTH
  const scale   = origW > GIF_MAX_WIDTH ? GIF_MAX_WIDTH / origW : 1;
  const canvasW = Math.round(origW * scale);
  const canvasH = Math.round(origH * scale);

  console.log(
    `[worker] input: ${origW}×${origH}, ${pages} เฟรม` +
    ` → output: ${canvasW}×${canvasH} (scale=${scale.toFixed(2)})` +
    `, ${(rawBuffer.length / 1024 / 1024).toFixed(2)} MB`
  );

  // ── ขั้นที่ 2: extract full frames ด้วย sharp พร้อม resize + frame step
  const framePngs = [];
  for (let i = 0; i < pages; i += GIF_FRAME_STEP) {
    const png = await sharp(rawBuffer, { page: i })
      .resize(canvasW, canvasH)
      .png()
      .toBuffer();
    framePngs.push(png);
  }
  console.log(
    `[worker] extracted ${framePngs.length}/${pages} เฟรม` +
    ` (step=${GIF_FRAME_STEP}, resize=${canvasW}×${canvasH})`
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
    const originalIndex = i * GIF_FRAME_STEP;

    const bgImage = await loadImage(framePngs[i]);
    const canvas  = createCanvas(canvasW, canvasH);
    const ctx     = canvas.getContext('2d');

    ctx.drawImage(bgImage, 0, 0, canvasW, canvasH);
    drawOverlay(ctx, config.overlayOpacity, canvasW, canvasH);
    if (config.avatarEnabled && avatarImg) drawAvatar(ctx, avatarImg, config, canvasW, canvasH);
    await drawAllTextBlocks(ctx, config, canvasW, canvasH);

    encoder.setDelay((delays[originalIndex] ?? 100) * GIF_FRAME_STEP);
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