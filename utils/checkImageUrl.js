/**
 * ลองยิง HEAD request ไปที่ URL เพื่อเช็คว่า Content-Type ที่ตอบกลับมาเป็นรูปภาพจริงไหม
 * เป็นการเช็คแบบ "soft" — ไม่แม่น 100% (บาง server ไม่ตอบ HEAD, บาง CDN บล็อก, เน็ตอาจช้า)
 * จึงคืนค่าเป็น boolean เดียว: true = "ดูเหมือนจะเป็นรูปจริง", false = "น่าสงสัย" (ไม่ว่าจะเพราะ
 * content-type ผิด หรือเช็คไม่สำเร็จเลยก็ตาม) ผู้เรียกใช้ควรใช้ผลนี้แค่ "เตือน" ไม่ใช่ "บล็อก"
 *
 * @param {string} url
 * @param {number} timeoutMs - เวลาที่ยอมรอสูงสุดก่อนยกเลิก (กันบอทค้างถ้าปลายทางช้า/ไม่ตอบ)
 * @returns {Promise<boolean>} true = content-type ขึ้นต้นด้วย "image/" จริง, false = น่าสงสัยหรือเช็คไม่สำเร็จ
 */
async function checkImageUrlLooksValid(url, timeoutMs = 3000) {
  // AbortController ใช้ยกเลิก request ถ้ารอนานเกินที่กำหนด (กันบอทค้างรอปลายทางที่ไม่ตอบ)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    return contentType.startsWith('image/');
  } catch (error) {
    // ครอบคลุมทุกกรณีที่เช็คไม่สำเร็จ: timeout, DNS ผิด, เซิร์ฟเวอร์ปิด, ไม่รองรับ HEAD ฯลฯ
    // ถือว่า "น่าสงสัย" เหมือนกัน เพราะเรายืนยันไม่ได้ว่าเป็นรูปจริง
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { checkImageUrlLooksValid };