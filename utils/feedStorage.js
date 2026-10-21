// utils/feedStorage.js
// ─────────────────────────────────────────────────────────────────────────
// เก็บข้อมูลหน้า "Marketplace Feed" (ฟีดงาน/บริการสำหรับครีเอเตอร์ดิสคอร์ด — โพสต์หา
// งาน/รับงานได้ แบบผสม Reddit (โหวต/แท็ก) กับ Fastwork (การ์ดพอร์ตโฟลิโอ+ราคา))
//
// เก็บเป็นไฟล์เดียว: data/feed.json (pattern เดียวกับ marketplaceStorage.js/
// referralStorage.js เป๊ะๆ — อ่าน/เขียนทั้งไฟล์ทุกครั้ง เพราะข้อมูลยังไม่เยอะ)
//
// ═══════════════════════════════════════════════════════════════════════════
// 🆕 [21 ต.ค. 2569] ไฟล์ใหม่ทั้งหมด — สร้างตามสเปกที่น้องหนาวส่งมา (3-column layout,
// Reddit x Fastwork hybrid) จุดที่ "ตัดสินใจเองพร้อมเหตุผล" (ยึดหลัก honesty over
// fakery เดียวกับทั้งโปรเจกต์ — ดู claude/knowledge-base-...md เรื่องห้ามโชว์ข้อมูล
// ปลอมเป็นของจริง):
//
//   1) 🚫 ไม่มีการอัปโหลดรูปจริง (เหมือน Message Builder gallery) — ใช้ "วาง URL รูป
//      เอง" แทน เหตุผล: storeBufferPermanently() (ระบบเก็บรูปถาวรของเว็บ) ต้องผูกกับ
//      Discord guild หนึ่งเซิร์ฟเสมอ (โพสต์เก็บไว้ในห้อง asset-storage ของเซิร์ฟนั้น)
//      แต่ Feed เป็นฟีเจอร์ "ระดับผู้ใช้คนเดียว ข้ามเซิร์ฟ" ไม่ได้ผูกกับเซิร์ฟไหนเลย เลย
//      ไม่มีเซิร์ฟให้ฝากรูปด้วย — ให้ผู้โพสต์วาง URL รูปที่ host ไว้เองแทน (เหมือนช่อง
//      "Background image" ของ Welcome Card) ข้อดีอีกอย่าง: กันปัญหา URL จาก Discord CDN
//      หมดอายุใน ~24 ชม. ที่เจอมาแล้วรอบนี้ (ดู utils/assetStorage.js หัวไฟล์)
//   2) 🚫 ไม่มีป้าย "Verified" จริง — ไม่มีระบบยืนยันตัวตน/KYC ในระบบเลย (ดู
//      claude/roadmap-marketplace-idea.md หัวข้อ "ความเสี่ยงกฎหมาย/ตรวจสอบเนื้อหา")
//      sidebar "Top Creators" เลยคำนวณจาก "คะแนนโหวตรวมของโพสต์จริงที่คนนั้นเคยโพสต์"
//      แทน (ข้อมูลจริง ไม่ใช่ป้ายยืนยันตัวตนปลอมๆ) — ดู computeTopContributors()
//   3) ประเทศ (ธงชาติ) เป็น "self-reported" — ผู้โพสต์เลือกเอง ไม่ใช่ระบบตรวจจับอัตโนมัติ
//      (Discord OAuth ไม่ได้ให้ข้อมูลประเทศผู้ใช้มาเลย ไม่มีทางรู้ประเทศจริงได้)
//   4) "Urgent" (งานด่วน) ก็ self-reported เหมือนกัน (ผู้โพสต์ติ๊กเอง) — เหมือนเว็บหางาน
//      ทั่วไปที่ให้ผู้ลงประกาศติ๊กเองว่าด่วนหรือเปล่า
//   5) ปุ่ม "💬 Contact" ลิงก์ไปโปรไฟล์ดิสคอร์ดจริงของผู้โพสต์ (discord.com/users/<id>)
//      ใช้งานได้จริง (กดแล้วเปิดแอพ/เว็บดิสคอร์ดไปเจอโปรไฟล์เลย ส่ง DM ต่อเองได้) ไม่ใช่
//      ปุ่ม toast หลอกแบบ "ทักแชทผู้ขาย" ใน marketplace.html รอบแรกๆ
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'feed.json');

// ตัดตัวที่อ่านสับสนออก (0/O, 1/I) เหมือน ID_ALPHABET ใน marketplaceStorage.js
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const POST_TYPES = new Set(['hiring', 'gigs']);
const CURRENCIES = new Set(['THB', 'USD']);

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 600;
const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 24;
const MAX_PRICE = 1000000; // กันพิมพ์เลขศูนย์เกินมั่วๆ (ไม่ใช่เพดานธุรกิจจริงจัง แค่กันค่าพัง)
const TAG_PATTERN = /^[a-zA-Z0-9ก-๙_-]{1,24}$/; // ตัวอักษร/ตัวเลขไทย-อังกฤษ ขีดกลาง/ขีดล่าง เท่านั้น (ไม่รับ # เอง ติ๊กให้)
const MEDIA_URL_PATTERN = /^https:\/\/\S{1,490}$/i; // https:// เท่านั้น (เหตุผลเดียวกับ PAYMENT_LINK_PATTERN — กัน javascript:/data: URI)
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/; // ISO 3166-1 alpha-2 (เช่น "TH", "US") ใช้คำนวณธงอิโมจิ

function emptyData() {
  return { posts: {} };
}

function ensureFileExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(emptyData(), null, 2), 'utf8');
  }
}

function readAll() {
  ensureFileExists();
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  try {
    const data = JSON.parse(raw);
    return { ...emptyData(), ...data };
  } catch (error) {
    console.error('[feedStorage] อ่านไฟล์ feed.json ไม่ได้ (JSON เสีย):', error);
    return emptyData();
  }
}

function writeAll(data) {
  ensureFileExists();
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function generateId(existingMap) {
  let id;
  do {
    id = '';
    for (let i = 0; i < 6; i++) {
      id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
  } while (existingMap[id]);
  return id;
}

/**
 * คำนวณคะแนนรวมของโพสต์ 1 โพสต์จาก object votes (userId -> 1 | -1)
 * @param {Record<string, number>} votes
 */
function scoreOf(votes) {
  return Object.values(votes || {}).reduce((sum, v) => sum + v, 0);
}

/**
 * สร้างโพสต์ใหม่ — validate ทุกช่องก่อนบันทึกจริง (โยน Error ถ้าไม่ผ่าน ให้ route
 * ฝั่ง server.js จับแล้วตอบ 400 กลับไปพร้อมข้อความ)
 * @param {object} info
 */
function createPost(info) {
  const type = String(info.type || '').trim();
  if (!POST_TYPES.has(type)) {
    throw new Error('ประเภทโพสต์ต้องเป็น "hiring" หรือ "gigs" เท่านั้น');
  }

  const title = String(info.title || '').trim();
  if (title.length < 3 || title.length > MAX_TITLE_LENGTH) {
    throw new Error(`หัวข้อต้องมีความยาว 3-${MAX_TITLE_LENGTH} ตัวอักษร`);
  }

  const description = String(info.description || '').trim();
  if (description.length < 10 || description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`รายละเอียดต้องมีความยาว 10-${MAX_DESCRIPTION_LENGTH} ตัวอักษร`);
  }

  const rawTags = Array.isArray(info.tags) ? info.tags : [];
  const tags = rawTags
    .map((t) => String(t || '').trim().replace(/^#/, ''))
    .filter((t) => t.length > 0)
    .slice(0, MAX_TAGS);
  for (const tag of tags) {
    if (!TAG_PATTERN.test(tag) || tag.length > MAX_TAG_LENGTH) {
      throw new Error(`แท็ก "${tag}" ไม่ถูกต้อง (ใช้ได้แค่ตัวอักษร/ตัวเลข/ขีดกลาง-ขีดล่าง ไม่เกิน ${MAX_TAG_LENGTH} ตัวอักษร)`);
    }
  }

  let priceAmount = null;
  if (info.priceAmount !== null && info.priceAmount !== undefined && info.priceAmount !== '') {
    const n = Number(info.priceAmount);
    if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE) {
      throw new Error(`ราคาต้องเป็นตัวเลข 0-${MAX_PRICE}`);
    }
    priceAmount = n;
  }

  const priceCurrency = CURRENCIES.has(info.priceCurrency) ? info.priceCurrency : 'THB';

  let mediaUrl = null;
  if (info.mediaUrl && String(info.mediaUrl).trim()) {
    const url = String(info.mediaUrl).trim();
    if (!MEDIA_URL_PATTERN.test(url)) {
      throw new Error('ลิงก์รูปตัวอย่างผลงานต้องขึ้นต้นด้วย https:// เท่านั้น');
    }
    mediaUrl = url;
  }

  let country = null;
  if (info.country && String(info.country).trim()) {
    const code = String(info.country).trim().toUpperCase();
    if (!COUNTRY_CODE_PATTERN.test(code)) {
      throw new Error('รหัสประเทศไม่ถูกต้อง');
    }
    country = code;
  }

  // "ด่วน" มีความหมายเฉพาะฝั่ง "หาคนทำงาน" (hiring) เท่านั้น — ฝั่ง "รับงาน" (gigs) ไม่มี
  // แนวคิดเรื่อง "ด่วน" (ตัวเองว่างรับงานอยู่แล้ว ไม่มีอะไรให้ "ด่วน" ขึ้นมาได้) บังคับ false เสมอ
  const urgent = type === 'hiring' ? Boolean(info.urgent) : false;

  const data = readAll();
  const id = generateId(data.posts);
  const now = new Date().toISOString();

  const post = {
    id,
    authorId: info.authorId,
    authorUsername: info.authorUsername,
    authorAvatarUrl: info.authorAvatarUrl,
    type,
    title,
    description,
    tags,
    priceAmount,
    priceCurrency,
    mediaUrl,
    country,
    urgent,
    votes: {},
    createdAt: now,
    status: 'active',
  };

  data.posts[id] = post;
  writeAll(data);
  return post;
}

/**
 * ดึงโพสต์ 1 ชิ้น (คืน null ถ้าไม่เจอ)
 * @param {string} postId
 */
function getPost(postId) {
  const data = readAll();
  return data.posts[postId] || null;
}

/**
 * รายการโพสต์ที่ "active" ทั้งหมด เรียงใหม่สุดก่อน — กรองตาม type ได้ (ไม่ใส่ = เอาหมด)
 * @param {{type?: 'hiring'|'gigs'}} opts
 */
function listActivePosts(opts = {}) {
  const data = readAll();
  return Object.values(data.posts)
    .filter((p) => p.status === 'active')
    .filter((p) => !opts.type || p.type === opts.type)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * โหวตโพสต์ — direction เป็น 1 (upvote) หรือ -1 (downvote) เท่านั้น กดซ้ำทิศเดิม = ยกเลิกโหวต
 * (toggle) กดสลับทิศ = เปลี่ยนทิศ คนละ user โหวตโพสต์เดียวกันได้คนละ 1 เสียงเสมอ (เก็บใน
 * votes[userId] — เขียนทับของเดิมถ้ามีอยู่แล้ว ไม่สะสมหลายเสียงต่อคน)
 * @param {string} postId
 * @param {string} userId
 * @param {1 | -1} direction
 * @returns {{score: number, myVote: number} | null} null ถ้าไม่เจอโพสต์
 */
function votePost(postId, userId, direction) {
  if (direction !== 1 && direction !== -1) {
    throw new Error('direction ต้องเป็น 1 หรือ -1 เท่านั้น');
  }
  const data = readAll();
  const post = data.posts[postId];
  if (!post || post.status !== 'active') return null;

  if (post.votes[userId] === direction) {
    delete post.votes[userId]; // กดซ้ำทิศเดิม → ยกเลิกโหวต
  } else {
    post.votes[userId] = direction;
  }

  writeAll(data);
  return { score: scoreOf(post.votes), myVote: post.votes[userId] || 0 };
}

/**
 * ปิดโพสต์ (soft-delete) — ปิดได้แค่เจ้าของโพสต์เท่านั้น (เช็ค authorId ตรงนี้เลย กันคน
 * อื่นยิง POST ปิดโพสต์คนอื่น) คืน false ถ้าไม่เจอโพสต์/ไม่ใช่เจ้าของ
 * @param {string} postId
 * @param {string} userId
 */
function closePost(postId, userId) {
  const data = readAll();
  const post = data.posts[postId];
  if (!post || post.authorId !== userId) return false;
  post.status = 'closed';
  writeAll(data);
  return true;
}

/**
 * แท็กยอดนิยม — นับจากแท็กจริงในโพสต์ active ทั้งหมด (ไม่ใช่ของสมมติ) คืน [{tag, count}]
 * เรียงเยอะไปน้อย
 * @param {number} limit
 */
function computeTrendingTags(limit = 8) {
  const counts = new Map();
  for (const post of listActivePosts()) {
    for (const tag of post.tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

/**
 * "ผู้โพสต์ยอดนิยม" — รวมคะแนนโหวตของโพสต์ active ทุกชิ้นที่คนนั้นเคยโพสต์ ไม่ใช่ป้าย
 * "Verified" ปลอมๆ (ดูคอมเมนต์หัวไฟล์ข้อ 2) คืน [{authorId, authorUsername,
 * authorAvatarUrl, totalScore, postCount}] เรียงคะแนนรวมเยอะไปน้อย ตัดคนที่คะแนนรวม
 * <= 0 ออก (ไม่งั้นคนที่โพสต์เยอะแต่โดนโหวตลบจะติดอันดับด้วย ดูแปลกๆ)
 * @param {number} limit
 */
function computeTopContributors(limit = 5) {
  const byAuthor = new Map();
  for (const post of listActivePosts()) {
    const key = post.authorId;
    const entry = byAuthor.get(key) || {
      authorId: post.authorId,
      authorUsername: post.authorUsername,
      authorAvatarUrl: post.authorAvatarUrl,
      totalScore: 0,
      postCount: 0,
    };
    entry.totalScore += scoreOf(post.votes);
    entry.postCount += 1;
    // ใช้ username/avatar จากโพสต์ล่าสุดเสมอ (เผื่อเปลี่ยนชื่อ/รูปโปรไฟล์ทีหลัง)
    entry.authorUsername = post.authorUsername;
    entry.authorAvatarUrl = post.authorAvatarUrl;
    byAuthor.set(key, entry);
  }
  return [...byAuthor.values()]
    .filter((e) => e.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, limit);
}

module.exports = {
  scoreOf,
  createPost,
  getPost,
  listActivePosts,
  votePost,
  closePost,
  computeTrendingTags,
  computeTopContributors,
};
