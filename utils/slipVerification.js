// utils/slipVerification.js
// ─────────────────────────────────────────────────────────────────────────
// 🆕 [19 ต.ค. 2569] ตรวจสอบสลิปโอนเงินจริงผ่าน API ภายนอก — ของใหม่ทั้งไฟล์ ตามข้อ 4 ที่
// น้องหนาวขอ: "Secure Slip Verification" (ต้องมีขั้นตอน "อัปโหลดสลิป" ก่อนส่งมอบของ +
// ตรวจสอบจริงว่าเงินเข้าบัญชีผู้ขายจริงผ่าน API แทนการเชื่อใจอย่างเดียวแบบเดิม)
//
// ⚠️⚠️⚠️ อ่านก่อนใช้งานจริงนะครับ — สำคัญมาก ⚠️⚠️⚠️
// ไฟล์นี้ต่อกับผู้ให้บริการตรวจสลิป "EasySlip" (https://easyslip.com) เป็นค่าเริ่มต้น เพราะ
// เป็นเจ้าที่นิยมใช้กันเยอะในวงการบอท/เว็บไทย มี free tier ให้ทดลองได้ฟรีจำนวนหนึ่ง — แต่ตอนนี้
// (19 ต.ค. 2569) ยังไม่มี API key ของ EasySlip อยู่ในไฟล์ .env เลย (เช็คแล้ว ไม่มีจริงๆ) ผมไม่
// สามารถ "เดา" API key ให้เองได้ครับ เพราะเป็นข้อมูลบัญชีจริงที่ต้องไปสมัครเอง — ฟีเจอร์นี้เลย
// ยัง "ใช้งานจริงไม่ได้" จนกว่าน้องหนาวจะ:
//   1. สมัครบัญชีที่ https://easyslip.com (หรือผู้ให้บริการเจ้าอื่นที่รองรับ เช่น SlipOK —
//      ถ้าอยากใช้เจ้าอื่นบอกได้ครับ ค่อยมาแก้ adapter ตรงนี้ใหม่)
//   2. เอา API key มาใส่ในไฟล์ .env เพิ่มบรรทัดนี้: EASYSLIP_API_KEY=xxxxxxxxxxxx
//   3. รีสตาร์ทบอท/เซิร์ฟเวอร์ — ระบบจะเช็คอัตโนมัติว่ามีคีย์หรือยัง (isSlipVerificationConfigured())
//      ถ้ายังไม่มีคีย์ ระบบจะ "ไม่บล็อก" การซื้อขายนะครับ แค่ข้ามการตรวจสลิปอัตโนมัติไปเฉยๆ
//      (ผู้ขายยังกดปุ่ม "✅ ยืนยันได้รับเงินแล้ว" เองด้วยมือได้เหมือนเดิมทุกอย่าง — ของเดิมไม่หาย)
//
// ⚠️ อีกเรื่องที่ต้องบอกตรงๆ: ฟิลด์ใน response (เช่น data.amount.amount, data.receiver...)
// ที่ใช้เทียบด้านล่างนี้ เขียนจากเอกสาร/ตัวอย่างสาธารณะของ EasySlip v1 (https://developer.easyslip.com/api/v1/verify)
// เพราะยังไม่มีคีย์จริงให้ยิงทดสอบจริงได้ในตอนที่เขียนโค้ดนี้ — แนะนำให้ลองยิงจริง 1 ครั้งหลังจาก
// ได้คีย์มาแล้ว (เช่นอัปโหลดสลิปทดสอบ 1 ใบ) แล้วดู console.log('[slipVerification] raw response:', ...)
// ที่ใส่ไว้ด้านล่างนี้แล้ว เทียบกับที่ใช้จริงในฟังก์ชัน extractAmount()/extractReceiverAccountDigits()
// ถ้าชื่อฟิลด์ไม่ตรง ก็แก้แค่ 2 ฟังก์ชันนั้นพอ ไม่ต้องแตะโค้ดส่วนอื่นเลย (จุดนี้ผมออกแบบแยกไว้ให้
// แก้ง่ายๆ ตรงจุดเดียวตั้งแต่แรก)
// ─────────────────────────────────────────────────────────────────────────

const EASYSLIP_API_KEY = process.env.EASYSLIP_API_KEY || '';
const EASYSLIP_VERIFY_URL = 'https://developer.easyslip.com/api/v1/verify';

/** เช็คว่าตั้งค่า API key ของผู้ให้บริการตรวจสลิปไว้แล้วหรือยัง — ใช้เช็คก่อนบังคับขั้นตอน
 * อัปโหลดสลิปในหน้าเว็บ/เส้นทาง server.js (ยังไม่ตั้งคีย์ = ยังไม่บังคับ ใช้ flow เดิมแทน) */
function isSlipVerificationConfigured() {
  return Boolean(EASYSLIP_API_KEY);
}

/** ดึง "จำนวนเงินในสลิป" ออกจาก response ของ EasySlip — แยกฟังก์ชันไว้ต่างหากเพื่อแก้ง่ายถ้า
 * ชื่อฟิลด์จริงไม่ตรงกับที่เขียนไว้ (ดูคำเตือนหัวไฟล์) ลองหลายจุดที่เป็นไปได้ตามลำดับ */
function extractAmount(data) {
  if (!data) return null;
  const candidates = [
    data?.amount?.amount,
    data?.amount?.local?.amount,
    data?.amount,
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

/** ดึง "เลขบัญชี/พร้อมเพย์ผู้รับ" ออกจาก response — คืนเฉพาะตัวเลขล้วนๆ (ตัด - / เว้นวรรค /
 * ดอกจัน x ที่ธนาคารมักเซ็นเซอร์บางหลักออก) เพื่อเทียบกับเลขพร้อมเพย์ของผู้ขายที่เก็บไว้ในระบบ */
function extractReceiverAccountDigits(data) {
  if (!data) return null;
  const candidates = [
    data?.receiver?.account?.bank?.account,
    data?.receiver?.account?.value,
    data?.receiver?.account?.bank?.value,
    data?.receiver?.proxy?.account,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      const digitsOnly = value.replace(/[^0-9]/g, '');
      if (digitsOnly.length >= 4) return digitsOnly;
    }
  }
  return null;
}

/**
 * ตรวจสลิปจริงผ่าน EasySlip API — อัปโหลดรูปสลิป เทียบยอดเงิน+บัญชีผู้รับกับที่คาดไว้
 * @param {{ imageBuffer: Buffer, filename: string, expectedAmountThb: number, expectedPromptPayId: string|null }} info
 * @returns {Promise<{ ok: boolean, reason: string, amountMatch?: boolean, accountMatch?: boolean, raw?: object }>}
 *   ok=true ก็ต่อเมื่อ "ยอดเงินตรง" และ "บัญชีผู้รับตรง" ทั้งคู่เท่านั้น (เข้มงวดไว้ก่อน กันหลุด)
 *   reason: 'not_configured' | 'request_failed' | 'invalid_slip' | 'duplicate_slip' |
 *           'amount_mismatch' | 'account_mismatch' | 'unverifiable' | 'verified'
 */
async function verifySlip({ imageBuffer, filename, expectedAmountThb, expectedPromptPayId }) {
  if (!isSlipVerificationConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }

  let response;
  try {
    // ใช้ FormData ของ Node ตัวเอง (รองรับตั้งแต่ Node 18+ — ของเดิมในโปรเจกต์นี้ก็ใช้
    // global fetch() อยู่แล้วที่ commands/fonts.js ไม่ต้องติดตั้ง dependency เพิ่ม)
    const form = new FormData();
    form.append('file', new Blob([imageBuffer]), filename || 'slip.jpg');

    response = await fetch(EASYSLIP_VERIFY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${EASYSLIP_API_KEY}` },
      body: form,
    });
  } catch (error) {
    console.error('[slipVerification] เรียก EasySlip API ไม่สำเร็จ (เครือข่าย/เซิร์ฟเวอร์ล่ม?):', error.message);
    return { ok: false, reason: 'request_failed' };
  }

  let json;
  try {
    json = await response.json();
  } catch (error) {
    console.error('[slipVerification] EasySlip ตอบกลับมาไม่ใช่ JSON ที่อ่านได้:', error.message);
    return { ok: false, reason: 'request_failed' };
  }

  // 🔍 log ค่าดิบที่ API ตอบกลับมาไว้เสมอ (เฉพาะตอนตรวจสลิปจริง ไม่ได้ log ทุก request ของเว็บ)
  // ให้น้องหนาวเปิด log เซิร์ฟเวอร์ดูได้ตอนทดสอบจริงครั้งแรกๆ ว่าโครงสร้างข้อมูลจริงหน้าตา
  // เป็นยังไง ตรงกับที่ extractAmount()/extractReceiverAccountDigits() ด้านบนคาดไว้ไหม
  console.log('[slipVerification] EasySlip raw response:', JSON.stringify(json));

  if (json?.status !== 200 || !json?.data) {
    const code = json?.data?.message || json?.message || '';
    if (String(code).toLowerCase().includes('duplicate')) {
      return { ok: false, reason: 'duplicate_slip', raw: json };
    }
    return { ok: false, reason: 'invalid_slip', raw: json };
  }

  const data = json.data;
  const amountInSlip = extractAmount(data);
  const receiverDigits = extractReceiverAccountDigits(data);
  const expectedDigits = expectedPromptPayId ? String(expectedPromptPayId).replace(/[^0-9]/g, '') : null;

  // อ่านค่าไม่ได้เลย (โครงสร้าง response ไม่ตรงกับที่คาดไว้) — อย่าเพิ่งฟันธงว่าผ่าน/ไม่ผ่าน
  // ให้ไปรอผู้ขายยืนยันด้วยมือแทน (fail-safe ไม่ auto-approve มั่วๆ กับของที่อ่านค่าไม่ได้)
  if (amountInSlip === null || receiverDigits === null) {
    return { ok: false, reason: 'unverifiable', raw: json };
  }

  // ยอมรับส่วนต่างเล็กน้อยได้ 1 บาท กันปัดเศษ/ค่าธรรมเนียมแปลกๆ จากบางธนาคาร
  const amountMatch = Math.abs(amountInSlip - expectedAmountThb) <= 1;
  // เทียบจาก "ท้ายเลข" กันเคสสลิปเซ็นเซอร์บางหลักแรก (บางธนาคารเซ็นเซอร์ 4 หลักแรกเป็น x)
  const accountMatch = expectedDigits
    ? receiverDigits.slice(-6) === expectedDigits.slice(-6)
    : false;

  if (!amountMatch) return { ok: false, reason: 'amount_mismatch', amountMatch, accountMatch, raw: json };
  if (!accountMatch) return { ok: false, reason: 'account_mismatch', amountMatch, accountMatch, raw: json };

  return { ok: true, reason: 'verified', amountMatch, accountMatch, raw: json };
}

module.exports = { isSlipVerificationConfigured, verifySlip };
