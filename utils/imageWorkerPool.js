// utils/imageWorkerPool.js
// จัดการ Worker Thread pool สำหรับสร้าง animated GIF ต้อนรับ
//
// ❗ แนวคิดหลัก — worker pool ไม่ใช่ "สร้าง worker ใหม่ทุกครั้งที่มีงาน":
//   การสร้าง Worker ใหม่ (new Worker(path)) มี overhead สูงพอสมควร (ต้อง
//   spawn thread ใหม่, โหลดโมดูล native ใหม่, register font ใหม่ ฯลฯ
//   ใช้เวลาระดับ 50-200ms) ถ้าสร้างใหม่ทุกครั้งที่มีคนเข้าเซิร์ฟ จะเสียเวลา
//   ส่วนนี้ซ้ำๆ ทุกงาน แทนที่จะทำครั้งเดียว
//
//   Pool pattern แก้ปัญหานี้: สร้าง worker ไว้ล่วงหน้าตอนบอท start
//   (จำนวนคงที่ POOL_SIZE ตัว) แล้ว "ใช้ซ้ำ" ตลอดอายุของบอท — งานใหม่
//   แค่ postMessage() เข้าไปใน worker ที่ว่างอยู่ ไม่ต้อง spawn ใหม่
//
// ❗ ทำไมต้องมี "คิว" (queue):
//   ถ้ามี 3 คนเข้าเซิร์ฟพร้อมกัน แต่มีแค่ 2 worker งานที่ 3 ต้องรอคิว
//   ไม่ใช่สร้าง worker ตัวที่ 3 ขึ้นมาเพิ่มเอง (จะเสีย control เรื่อง
//   resource — CPU/memory usage ไม่จำกัด ถ้ามีคนเข้าเซิร์ฟพร้อมกันเยอะๆ)
//   คิวทำให้จำนวน worker คงที่เสมอ งานที่เกินแค่ต้องรอคิวสักครู่

const { Worker } = require('worker_threads');
const path        = require('path');

const POOL_SIZE   = 2;
const WORKER_PATH = path.join(__dirname, 'welcomeImageWorker.js');

// pool: array ของ worker entry แต่ละตัว
//   { worker: Worker instance, busy: boolean, currentJob: { resolve, reject } | null }
let pool = [];

// queue: งานที่รอ worker ว่าง — แต่ละ entry { config, resolve, reject }
let queue = [];

let initialized = false;

/**
 * สร้าง worker 1 ตัว พร้อมผูก event handler (message, error, exit)
 * ใช้ทั้งตอน init ครั้งแรก และตอน respawn แทน worker ที่ crash ไป
 *
 * @returns {{ worker: Worker, busy: boolean, currentJob: object|null }}
 */
function createWorkerEntry() {
  const worker = new Worker(WORKER_PATH);
  const entry  = { worker, busy: false, currentJob: null };

  // ── เมื่อ worker ส่งผลลัพธ์กลับมา (สำเร็จหรือ error ที่ catch ไว้ในตัว worker เอง)
  worker.on('message', (msg) => {
    const job = entry.currentJob;
    entry.busy       = false;
    entry.currentJob = null;

    if (job) {
      if (msg.error) {
        job.reject(new Error(msg.error));
      } else {
        // ❗ msg.buffer ที่มาจาก worker ผ่าน structured clone จะเป็น
        // Uint8Array ธรรมดา ไม่ใช่ Buffer object — ต้องแปลงกลับด้วย
        // Buffer.from() เสมอ ไม่งั้น .slice(0,6).toString() หรือโค้ดอื่น
        // ที่คาดหวัง Buffer method จะพังหรือทำงานผิดที่ไม่คาดคิด
        job.resolve(Buffer.from(msg.buffer));
      }
    }

    processQueue();
  });

  // ── เมื่อ worker เกิด error ระดับร้ายแรง (uncaught exception ใน worker เอง)
  // ต่างจาก error ที่ generateWelcomeGif() catch ไว้แล้วส่งเป็น { error: msg }
  // — นี่คือ worker ทั้งตัวพัง เช่น native addon crash
  worker.on('error', (err) => {
    console.error('[imageWorkerPool] worker error (จะ respawn ทดแทน):', err.message);

    if (entry.currentJob) {
      entry.currentJob.reject(err);
      entry.currentJob = null;
    }

    // เอา entry ที่พังออกจาก pool แล้วสร้างตัวใหม่ทดแทน
    // (ไม่ respawn ในนี้ตรงๆ เพราะ worker ตัวเดิมกำลังจะ exit ต่อจาก error)
    const idx = pool.indexOf(entry);
    if (idx !== -1) {
      pool[idx] = createWorkerEntry();
      console.log('[imageWorkerPool] respawn worker ทดแทนสำเร็จ');
    }

    processQueue();
  });

  // ── เมื่อ worker thread จบการทำงาน (ปกติไม่ควรเกิดเพราะเราไม่เรียก terminate())
  worker.on('exit', (code) => {
    if (code !== 0) {
      console.warn(`[imageWorkerPool] worker exited unexpectedly ด้วย code ${code}`);
    }
  });

  return entry;
}

/**
 * เริ่มต้น worker pool — เรียกครั้งเดียวตอนบอท start (ใน index.js)
 * ถ้าเรียกซ้ำจะไม่สร้าง worker เพิ่ม (idempotent)
 */
function initImageWorkerPool() {
  if (initialized) {
    console.warn('[imageWorkerPool] เคย init ไปแล้ว ข้ามการสร้างซ้ำ');
    return;
  }
  initialized = true;

  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push(createWorkerEntry());
  }
  console.log(`[imageWorkerPool] ✅ เริ่ม worker pool สำเร็จ (${POOL_SIZE} workers)`);
}

/**
 * หา worker ที่ว่างอยู่ในตอนนี้ (คืน null ถ้าไม่มี — ทุกตัวกำลังทำงาน)
 */
function findFreeWorker() {
  return pool.find(entry => !entry.busy) ?? null;
}

/**
 * ดึงงานจากคิวมาให้ worker ที่ว่างทำ — เรียกทุกครั้งที่ worker ว่างใหม่
 * (หลังทำงานเสร็จ หรือหลัง respawn จาก error)
 */
function processQueue() {
  if (queue.length === 0) return;

  const freeEntry = findFreeWorker();
  if (!freeEntry) return; // ทุก worker ยังไม่ว่าง — รอรอบถัดไป

  const job = queue.shift();
  dispatchJob(freeEntry, job);
}

/**
 * ส่งงานให้ worker entry ที่ระบุทำทันที (ตั้ง busy = true ก่อน postMessage)
 */
function dispatchJob(entry, job) {
  entry.busy       = true;
  entry.currentJob = job;
  entry.worker.postMessage(job.config);
}

/**
 * รันงานสร้าง animated GIF ผ่าน worker pool
 *
 * ถ้ามี worker ว่าง → ส่งงานไปทำทันที
 * ถ้าทุก worker ไม่ว่าง → เข้าคิวรอ (resolve/reject ทีหลังตอนถึงคิว)
 *
 * @param {object} config
 *   ต้องเป็น plain object ที่ structured-clone ได้เท่านั้น (ไม่มี Buffer
 *   ขนาดใหญ่ที่ไม่จำเป็น, ไม่มี native object เช่น loaded Image)
 *   ต้องมี avatarUrl (string|null) แทน avatarImg ที่โหลดแล้ว — ดู
 *   welcomeImageWorker.js ว่าทำไมส่ง loaded Image object ข้าม thread ไม่ได้
 * @returns {Promise<Buffer>}
 */
function runWelcomeGifJob(config) {
  if (!initialized) {
    // fail-safe: ถ้าลืมเรียก initImageWorkerPool() ตอน start ให้แจ้ง error
    // ชัดเจน แทนที่จะค้างเงียบๆ ไม่มีอะไรเกิดขึ้น
    return Promise.reject(
      new Error('imageWorkerPool ยังไม่ได้ initImageWorkerPool() — ต้องเรียกตอนบอท start ก่อน')
    );
  }

  return new Promise((resolve, reject) => {
    const job = { config, resolve, reject };

    const freeEntry = findFreeWorker();
    if (freeEntry) {
      dispatchJob(freeEntry, job);
    } else {
      // ทุก worker ไม่ว่าง → เข้าคิวรอ (จะถูกดึงมาทำตอน processQueue() ถูกเรียก)
      queue.push(job);
      console.log(`[imageWorkerPool] worker ไม่ว่าง — เข้าคิว (คิวตอนนี้: ${queue.length})`);
    }
  });
}

module.exports = {
  initImageWorkerPool,
  runWelcomeGifJob,
};