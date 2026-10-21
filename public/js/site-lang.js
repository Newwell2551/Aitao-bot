// public/js/site-lang.js
// ═══════════════════════════════════════════════════════════════════════
// ระบบสลับภาษาเว็บ (EN ⇄ TH) — ใช้ร่วมกันทุกหน้าของเว็บสาธารณะ (Home, Features,
// Pricing, Marketplace) เพิ่มเข้ามา [23 ก.ย. 2569 รอบ 8] ตามที่น้องหนาวขอ — เดิม
// ปุ่ม "EN" มุมขวาบนของทุกหน้าเป็นแค่ป้ายตกแต่ง กดแล้วไม่มีอะไรเกิดขึ้นเลย
// (ดูคอมเมนต์เก่าใน public/index.html ข้อ 2 ที่อธิบายว่าตอนนั้นตั้งใจใส่ไว้แบบนั้น
// ก่อน — ตอนนี้ทำเป็นของจริงแล้วครับ)
//
// ── หลักการทำงาน (อธิบายละเอียดเพราะเป็นไฟล์ใหม่ที่สำคัญ) ──────────────────────
// ทำงานฝั่ง browser ล้วนๆ (client-side) ไม่มีการรีโหลดหน้าเว็บเวลาสลับภาษา ไม่ต้อง
// พึ่ง backend/server เลย เก็บภาษาที่เลือกไว้ด้วย localStorage (พื้นที่เก็บข้อมูล
// เล็กๆ ที่เบราว์เซอร์ของผู้ใช้แต่ละคนมีของตัวเอง) คีย์ชื่อ 'aitaoLang' — เปิดเว็บ
// ใหม่ หรือย้ายไปหน้าอื่นในเว็บเดียวกัน ก็จะเจอภาษาเดิมที่เคยเลือกไว้ล่าสุดทันที
// (ไม่ต้องกดเลือกใหม่ทุกหน้า)
//
// ค่าเริ่มต้น (ยังไม่เคยกดสลับเลยสักครั้ง หรือ localStorage ใช้งานไม่ได้ เช่น
// โหมดส่วนตัว/ปิดคุกกี้): 'en' เหมือนเดิม (เว็บเป็นอังกฤษ default ตามที่เคย
// ตัดสินใจไว้ตอนสร้างหน้าแรก — ยกเว้นหน้า Marketplace ที่ตัวหน้าเองเขียนเป็นไทย
// เป็นหลักมาตั้งแต่แรก แต่ระบบสลับภาษานี้ใช้กฎเดียวกันหมดทุกหน้า)
//
// ── วิธีใช้ในแต่ละไฟล์ HTML (สำหรับตอนแก้ไข/เพิ่มเติมทีหลัง) ─────────────────────
//   1. ใส่ data-i18n="กลุ่ม.กลุ่มย่อย.ชื่อคีย์" ที่ element ที่มีข้อความอยากให้สลับได้
//      เช่น <div class="tagline" data-i18n="home.tagline">Your Discord, your style</div>
//      ระบบจะดึงคำแปลจาก TRANSLATIONS[ภาษา].home.tagline มาใส่แทนที่ข้อความเดิม
//      - ปกติใช้ .textContent แทนที่ (ปลอดภัย กัน XSS แน่นอน เพราะไม่ได้แปลง HTML)
//      - ถ้า element นั้นมีแท็ก HTML ซ้อนอยู่ข้างในจริงๆ (เช่น <code>, <em>) และ
//        อยากให้คำแปลมีแท็กซ้อนแบบเดียวกันได้ ให้เติม data-i18n-html="1" เพิ่มอีก
//        แอตทริบิวต์หนึ่ง ระบบจะใช้ .innerHTML แทน (ต้องเขียน HTML ในคำแปลให้ถูกต้อง
//        เองด้วย ระวังเรื่อง XSS ถ้าเนื้อหามาจากผู้ใช้ — แต่ที่นี่เป็นข้อความคงที่ที่
//        พี่เขียนเองล้วนๆ ไม่ใช่ input จากคนอื่น เลยปลอดภัย)
//      - ถ้าอยากแปล placeholder ของ <input> ให้ใช้ data-i18n-placeholder="คีย์" แทน
//        (คนละแอตทริบิวต์กับ data-i18n เพราะ input ไม่มีข้อความให้ .textContent)
//   2. เติมคำแปลทั้ง 2 ภาษาไว้ใน TRANSLATIONS ด้านล่างไฟล์นี้ (โครงสร้างซ้อนกันเป็น
//      ชั้นๆ ตามจุดในคีย์ — เช่นคีย์ "home.tagline" ก็ไปเติมที่ TRANSLATIONS.en.home.tagline
//      และ TRANSLATIONS.th.home.tagline)
//   3. ทุกหน้าต้องมี <html data-page="ชื่อหน้า"> กำกับไว้ (เช่น data-page="home")
//      เพื่อให้ระบบรู้ว่าจะไปอัปเดต <title>/<meta name="description"> จาก
//      TRANSLATIONS[ภาษา][ชื่อหน้า]._meta ตัวไหน (ดูฟังก์ชัน applyLang ด้านล่าง)
//   4. ปุ่มสลับภาษาเองต้องมี class="lang-btn" (ข้างในมี <span class="lang-label">)
//      ระบบจะหาปุ่มนี้เองอัตโนมัติทุกหน้า ไม่ต้องเขียน onclick เพิ่มในไฟล์ HTML เลย
//   5. ถ้าหน้าไหนมี JavaScript ของตัวเองที่ต้องโชว์ข้อความสองภาษาแบบ "โต้ตอบ" ได้
//      (เช่นหน้า Features มีแผงพรีวิวที่สลับข้อความตอนกดแท็บต่างๆ) ให้ใช้
//      window.SiteLang.getLang() ดึงภาษาปัจจุบัน และ window.SiteLang.onChange(fn)
//      ลงทะเบียนฟังก์ชันที่จะถูกเรียกทุกครั้งที่มีคนกดสลับภาษา (เรียกครั้งแรกทันที
//      ตอนหน้าโหลดเสร็จด้วย) ดูตัวอย่างการใช้จริงในคอมเมนต์ท้ายไฟล์ public/features.html
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var STORAGE_KEY = 'aitaoLang';
  var DEFAULT_LANG = 'en';

  // ── ดึงค่าจาก object ซ้อนกันตาม key แบบจุด เช่น "home.hero.title" ────────────
  // แปลงเป็น ['home','hero','title'] แล้วเดินลึกลงไปทีละชั้น เหมือนกับที่
  // utils/i18n.js (ฝั่งบอทดิสคอร์ด) ทำ — ใช้หลักการเดียวกันเพื่อให้คุ้นเคย
  function getNested(obj, dottedKey) {
    return dottedKey.split('.').reduce(function (acc, part) {
      return acc && Object.prototype.hasOwnProperty.call(acc, part) ? acc[part] : undefined;
    }, obj);
  }

  function getSavedLang() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'th') return saved;
    } catch (e) {
      // localStorage เปิดไม่ได้ (โหมดส่วนตัว/ปิดคุกกี้ ฯลฯ) — ใช้ default แทน ไม่พัง
    }
    return DEFAULT_LANG;
  }

  function saveLang(lang) {
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch (e) {
      // เขียนไม่ได้ก็ไม่เป็นไร แค่จำข้ามหน้า/ข้ามครั้งไม่ได้ ภาษาที่เลือกยังใช้ได้
      // ปกติในหน้านี้จนกว่าจะปิดแท็บ
    }
  }

  var currentLang = getSavedLang();
  var changeListeners = [];

  function updateLangButton(lang) {
    var btn = document.querySelector('.lang-btn');
    if (!btn) return;
    var label = btn.querySelector('.lang-label');
    if (label) label.textContent = lang === 'th' ? 'TH' : 'EN';
    var hint = lang === 'th' ? 'Switch to English' : 'สลับเป็นภาษาไทย';
    btn.setAttribute('title', hint);
    btn.setAttribute('aria-label', hint);
  }

  function applyLang(lang) {
    var dict = TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANG];

    // แทนที่ข้อความทุก element ที่มี data-i18n
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-i18n');
      var text = getNested(dict, key);
      if (text === undefined) {
        console.warn('[site-lang] ไม่พบคำแปลสำหรับคีย์ "' + key + '" ในภาษา "' + lang + '"');
        continue;
      }
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = text;
      } else {
        el.textContent = text;
      }
    }

    // แทนที่ placeholder ของ input ที่มี data-i18n-placeholder
    var placeholderNodes = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < placeholderNodes.length; j++) {
      var pEl = placeholderNodes[j];
      var pKey = pEl.getAttribute('data-i18n-placeholder');
      var pText = getNested(dict, pKey);
      if (pText !== undefined) pEl.setAttribute('placeholder', pText);
    }

    // อัปเดต <title> และ <meta name="description"> จาก _meta ของหน้าปัจจุบัน
    // (รู้ว่าอยู่หน้าไหนจาก <html data-page="...">)
    var page = document.documentElement.getAttribute('data-page');
    var pageDict = page ? dict[page] : null;
    if (pageDict && pageDict._meta) {
      if (pageDict._meta.title) document.title = pageDict._meta.title;
      if (pageDict._meta.description) {
        var metaEl = document.querySelector('meta[name="description"]');
        if (metaEl) metaEl.setAttribute('content', pageDict._meta.description);
      }
    }

    document.documentElement.setAttribute('lang', lang);
    updateLangButton(lang);
  }

  function setLang(lang) {
    currentLang = lang;
    saveLang(lang);
    applyLang(lang);
    for (var i = 0; i < changeListeners.length; i++) {
      try { changeListeners[i](lang); } catch (e) { console.error('[site-lang] onChange callback พัง:', e); }
    }
  }

  function toggleLang() {
    setLang(currentLang === 'th' ? 'en' : 'th');
  }

  function init() {
    applyLang(currentLang);
    var btn = document.querySelector('.lang-btn');
    if (btn) btn.addEventListener('click', toggleLang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── API สาธารณะ — ให้สคริปต์เฉพาะหน้า (เช่น features.html, marketplace.html)
  // เรียกใช้ได้ ดูตัวอย่างจริงในคอมเมนต์ท้ายไฟล์ public/features.html ──────────
  window.SiteLang = {
    getLang: function () { return currentLang; },
    setLang: setLang,
    // 🆕 [7 ต.ค. 2569 แก้บั๊ก Marketplace] ดึงคำแปลตรงๆ ด้วยคีย์ ไม่ต้องผ่าน data-i18n
    // ให้สคริปต์เฉพาะหน้า (เช่น marketplace.html) เรียกใช้ตอนต้องอัปเดตข้อความด้วย
    // JS เอง (เช่นป้าย "เรียงตาม: ...” ที่เปลี่ยนตามตัวเลือกที่ผู้ใช้กด) — กันไม่ให้
    // ต้องก็อปคำแปลซ้ำไว้คนละที่ ซึ่งพลาดง่าย/ลืมอัปเดตพร้อมกัน (ต้นเหตุของบั๊กป้าย
    // เรียงตามใน marketplace.html ที่ติดภาษาไทยค้างตลอด ไม่ว่าจะสลับเว็บเป็นอังกฤษแล้ว
    // ก็ตาม — เพราะโค้ดเดิมเก็บคำแปลซ้ำไว้อีกชุดแยกจาก TRANSLATIONS ก้อนนี้)
    t: function (dottedKey) {
      var dict = TRANSLATIONS[currentLang] || TRANSLATIONS[DEFAULT_LANG];
      return getNested(dict, dottedKey);
    },
    // ลงทะเบียนฟังก์ชันที่จะถูกเรียกทุกครั้งที่ภาษาเปลี่ยน (เรียกทันที 1 ครั้งด้วย
    // ตอนลงทะเบียน กันพลาดกรณีภาษาถูกตั้งไปแล้วก่อนที่โค้ดหน้านั้นจะรันมาถึงบรรทัดนี้)
    onChange: function (fn) {
      changeListeners.push(fn);
      fn(currentLang);
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  // TRANSLATIONS — คำแปลทั้งหมดของทุกหน้า เก็บรวมไว้ที่เดียวกันไฟล์นี้ (ง่ายต่อ
  // การแก้ไข/ค้นหาทีหลัง ไม่ต้องเปิดหลายไฟล์) โครงสร้าง: TRANSLATIONS[ภาษา][หน้า]...
  // ═══════════════════════════════════════════════════════════════════════
  var TRANSLATIONS = {
    en: {
      nav: {
        home: 'Home',
        features: 'Features',
        pricing: 'Pricing',
        marketplace: 'Marketplace',
        // 🆕 [21 ต.ค. 2569] ลิงก์ Feed (public/feed.html) — หน้าฟีดงาน/บริการแบบ
        // community-style ใหม่ ที่เพิ่มเข้ามาแทนที่ dashboard ส่วนควบคุมคำสั่งเดิม
        feed: 'Feed',
        // 🆕 [17 ต.ค. 2569] ลิงก์ Commands (คู่มือคำสั่งทั้งหมด — public/commands.html)
        commands: 'Commands',
        // 🆕 [23 ก.ย. 2569] เพิ่มลิงก์ Dashboard กลับเข้าแถบนำทาง — ดูคอมเมนต์ที่ตัว
        // <a href="/dashboard"> ใน public/index.html
        dashboard: 'Dashboard',
        addBot: 'Add Bot',
      },
      // 🆕 [17 ต.ค. 2569] commands — ตอนแรกแปลไว้เฉพาะหัวข้อใหญ่บนสุด (เหมือน
      // แพทเทิร์นของ marketplace ด้านล่าง) [🆕 18 ต.ค. 2569] น้องหนาวขอให้แปลครบทุก
      // คำสั่งเป็นอังกฤษด้วย — ขยายเป็นคำแปลเต็มทุกจุดแล้ว (badge/คำอธิบาย/ขั้นตอน/
      // กล่องเตือน ฯลฯ) ดูคอมเมนต์หัวไฟล์ public/commands.html สำหรับโครงที่ใช้
      commands: {
        _meta: {
          title: 'Milo Bot — All Commands',
          description: 'A detailed, step-by-step guide to every Milo Bot command — from welcome cards and auto-roles to exporting/importing a full setup through the Marketplace.',
        },
        eyebrow: 'Command Guide',
        title: 'All Milo Bot Commands',
        lead: 'A detailed walkthrough of every command — jump to a section below, or just scroll.',
        groups: {
          decorate: {
            label: '🎨 Server Styling',
            note: 'Open to every member by default — if you want to limit it to admins only, set that up yourself under Discord Server Settings → Integrations → Milo Bot',
          },
          general: { label: '⚙️ General Settings' },
          marketplace: { label: '🛒 Marketplace' },
        },
        badges: {
          all: 'Everyone can use this',
          manage: 'Requires Manage Server',
          admin: 'Requires Administrator',
        },
        stepsLabel: {
          default: 'How to use it',
          createNew: 'How to use it (creating a new one)',
        },
        cmd: {
          welcomeSetup: {
            desc: 'Set up the new-member welcome card — automatically posts a nice-looking card every time someone joins your server',
            steps: [
              'Just type <code>/welcome-setup</code> — there\'s nothing to fill in here. The bot immediately opens a button-based control panel (visible only to you)',
              'Use the buttons to pick the channel to post in, a background (your own image, a solid color, or a GIF on Premium), the welcome message, and the font',
              'Turn it on/off from the same panel — if you haven\'t picked a channel yet, no card will be posted anywhere',
            ],
          },
          goodbyeSetup: {
            desc: 'Set up the goodbye card for members who leave — works exactly like <code>/welcome-setup</code>, just for "leaving" instead of "joining"',
            steps: [
              'Just type <code>/goodbye-setup</code> — you\'ll get the same control panel as welcome',
              'Pick the channel, background, goodbye message, and font, then turn it on',
            ],
          },
          roleSetup: {
            desc: 'Build an auto-role system — members grab their own roles, no need for an admin to hand them out one by one',
            opts: [
              '<code>/role-setup new</code> — create a new set (give it a name + pick a type: <code>menu</code> dropdown, <code>button</code> buttons, <code>reaction</code> emoji reactions — menu/button are Premium-only; the free plan only gets reactions, up to 2 roles)',
              '<code>/role-setup edit</code> — reopen an existing set to edit it (add/remove roles, change emoji, etc.)',
              '<code>/role-setup list</code> — view every set you\'ve created in this server',
              '<code>/role-setup delete</code> — delete a set you no longer need',
            ],
            steps: [
              'Type <code>/role-setup new</code>, give it a name, and pick a type',
              'Use the control panel buttons to add each role (pick an actual role from your server + the label/emoji for that button)',
              'Post the message to the channel you want — members click/pick/react and get the role instantly',
            ],
            tip: 'The bot needs the <strong>Manage Roles</strong> permission, and the bot\'s own role must sit "above" the role(s) it\'s handing out, or it can\'t assign them (this is a Discord limitation, not a bug)',
          },
          builder: {
            desc: 'A drag-and-drop message/announcement builder — no coding needed. Click to add blocks (text, images, dividers, link/role/channel buttons) and post a polished message',
            opts: [
              '<code>/builder new</code> — create a new draft (give it a name) — the free plan gets 1 draft per server, Premium is unlimited',
              '<code>/builder edit</code> — reopen an existing draft to keep editing it',
              '<code>/builder list</code> — view all your drafts',
              '<code>/builder delete</code> — delete a draft you no longer need',
            ],
            steps: [
              'Type <code>/builder new</code> and name your draft',
              'Click to add blocks one at a time, filling in or uploading the content for each block',
              'Post it to the channel you want once you\'re happy with it — you can keep editing anytime via <code>/builder edit</code>',
            ],
          },
          fonts: {
            desc: 'Upload your own font (.ttf/.otf) to use on this server\'s welcome/goodbye cards',
            opts: [
              '<code>/fonts list</code> — view every font (the bot\'s built-in fonts plus any you\'ve uploaded) and delete any you\'ve uploaded yourself',
              '<code>/fonts upload</code> — attach a <code>.ttf</code> or <code>.otf</code> font file to upload it (up to 20 fonts per server)',
            ],
          },
          uploadImage: {
            desc: 'Upload an image to get a "permanent link" for use with other commands that need an image URL (like a card background)',
            steps: [
              'Type <code>/upload-image</code> and attach an image file (<code>.png .jpg .jpeg .webp .gif</code>)',
              'The bot replies with a link — copy it into whatever field needs it. This link never expires',
            ],
          },
          language: {
            desc: 'Set the language the bot replies in for this server — choose between <code>English</code> and <code>ไทย</code> (Thai). This affects every message the bot sends from this point on',
          },
          premium: {
            desc: 'Manage this server\'s Premium status — check your current status, subscribe/renew, or manage your subscription',
          },
          help: {
            desc: 'Shows the full command list along with real examples of what the bot can make — a good starting point for anyone who just invited the bot',
          },
          ping: {
            desc: 'Checks the bot\'s current latency — handy when you\'re wondering if it\'s responding slower than usual',
          },
          marketplace: {
            desc: 'Open your own shop for Discord decoration/services through the <a href="/marketplace">/marketplace</a> web marketplace — list from Discord, and it shows up for sale on the website for others to buy',
            opts: [
              '<code>/marketplace sell</code> — create a new listing (name, price, description, category, cover image, and what you\'ll deliver — a digital file / a system or template link / a Milo Bot config code — you can also fill all of this in from the Dashboard instead of Discord)',
              '<code>/marketplace mylistings</code> — view all of your own listings',
              '<code>/marketplace remove</code> — close a listing (sold out/no longer selling — you can reopen it later)',
              '<code>/marketplace markselling</code> — reopen a listing you previously closed',
              '<code>/marketplace setpromptpay</code> — set/update your PromptPay number for receiving payment (for sellers in Thailand)',
              '<code>/marketplace setpaymentlink</code> — set/update an international payment link like PayPal.me (for sellers outside Thailand)',
            ],
            info: 'The bot never touches anyone\'s money — buyers pay the seller directly (by scanning a QR code or clicking a link). The bot only handles notifications and auto-delivery once the seller confirms payment was received',
          },
        },
        milo: {
          eyebrow: 'Deep dive — the feature that confuses people the most',
          intro: 'Used to "hand off a Milo Bot setup" from your server for someone else to use right away — like selling a Canva template where the buyer clicks Import and gets something ready to use, delivered through the <code>/marketplace</code> above',
          seller: {
            h4: '🧑‍💻 Seller side (the one creating the setup)',
            sub: 'Do this in the server you\'ve already set up nicely, before listing it for sale',
            steps: [
              'Finish setting up the Welcome/Goodbye cards, Role setup, and/or Builder in your own server exactly as you plan to sell it',
              'Type <code>/milo export-config</code> in that server (requires Administrator) — the bot opens a <strong>selection panel</strong> where you pick whether to include Welcome/Goodbye and choose exactly which role setup(s)/builder message(s) to sell (you\'re not forced to bundle everything in the server)',
              'Once you\'ve picked what to include, hit <strong>"Create code"</strong> — the bot replies (visible only to you) with the generated code, e.g. <code>MILO-7K2X9QAB</code>, plus a summary of what\'s included — double-check it matches what you meant to sell',
              'Paste that code into the "Milo Bot Configuration Key" field when listing it with <code>/marketplace sell</code> (or from the Dashboard)',
            ],
          },
          buyer: {
            h4: '🛍️ Buyer side (the one receiving the setup)',
            sub: 'Do this after your payment goes through',
            steps: [
              'Pay for the listing on the Marketplace website as usual',
              'The bot DMs you the code (e.g. <code>MILO-7K2X9QAB</code>) as soon as the seller confirms they received payment',
              'Go to your own server, type <code>/milo import-config</code>, and paste the code into the <code>code</code> field (requires Administrator on that server)',
              'The bot immediately installs the cards/role setups/builders bundled in that code, along with a summary of what got installed',
            ],
          },
          warn: {
            title: '⚠️ What to know before using this',
            lines: [
              'Each code can <strong>only be used once</strong> — once it\'s imported, that same code can\'t be used again (this stops one code from being resold an unlimited number of times)',
              'Roles/channels bundled into the role setup and builder (role buttons, channel link buttons) still belong to the seller\'s original server and won\'t work until the buyer reassigns their own roles/channels via <code>/role-setup edit</code> / <code>/builder edit</code>',
              'The Welcome/Goodbye posting channel is intentionally not carried over — buyers always need to pick their own channel again after importing',
              'If the buyer\'s server is on the free plan, the system automatically trims whatever the free plan can\'t support anyway (like menu/button role setups, or reactions beyond 2 roles) instead of failing the whole import',
            ],
          },
        },
      },
      home: {
        _meta: {
          title: 'Milo Bot — Your Discord, your style',
          description: 'Milo Bot: fully custom welcome/goodbye cards, your own server fonts, automatic role assignment, and a message builder made in your style — set up in 5 minutes.',
        },
        eyebrow: 'Server Styling Bot',
        tagline: 'Your Discord, your style',
        lead: 'Fully custom welcome/goodbye cards, your own server fonts, automatic role assignment, and a message builder made in your style — set up in 5 minutes.',
        cta: {
          addBot: 'Add Milo Bot to Server',
          viewFeatures: 'View All Features',
        },
        chips: {
          setup: 'Set up in 5 minutes',
          bilingual: 'Thai & English support',
          free: 'Free to get started',
        },
        nowPlaying: { label: 'Now playing' },
      },
      features: {
        _meta: {
          title: 'Milo Bot — Features',
          description: 'Everything Milo Bot ships with today: welcome/goodbye cards, custom server fonts, auto roles, message builder, GIF cards, and multi-language support.',
        },
        eyebrow: 'Features',
        title: 'Everything your server needs',
        subtitle: 'One bot, six core tools — click one to see it in action.',
        tryLabel: 'Try it — type a name',
        tryPlaceholder: 'e.g. Aiko',
        premiumTag: 'Premium',
        feat: {
          '1': { title: 'Welcome & Goodbye Cards', desc: 'Fully custom card designs that greet new members and say goodbye — pick a layout, drop in your own background and font, Milo does the rest.' },
          '2': { title: 'Custom Server Fonts', desc: "Upload your own font files (.ttf/.otf) and use them across every card — welcome, goodbye, and role cards all keep your server's own look." },
          '3': { title: 'Auto Role Assignment', desc: 'Set up self-serve roles your way — Reaction is free (up to 2 roles per panel), Menu and Button unlock on Premium with more roles and richer layouts.' },
          '4': { title: 'Visual Message Builder', desc: 'Design embeds and announcements by clicking, not coding. Free gives you 1 simple builder; Premium unlocks unlimited builders, multiple blocks, buttons, and @mentions.' },
          '5': { title: 'Animated GIF Cards', desc: 'Free backgrounds are sharp PNG/JPG/WebP images. Premium adds animated GIF backgrounds — same layout, now in motion. Tap Free/Premium to compare.' },
          '6': { title: 'Multi-language Support', desc: 'Set with <code>/language</code> (admins only) — Milo replies in Thai or English per server, switching instantly, no re-setup needed. Tap Thai/English to see it run.' },
        },
        preview: {
          label: 'Live Preview',
          tierTabs: { free: 'Free', premium: 'Premium' },
          panel1: { caption: 'This is what new members see the moment they join — fully customizable, no template lock-in.' },
          panel2: { caption: "Upload once, apply everywhere — every card matches your server's own typography." },
          panel3: {
            heading: '3 Ways To Assign Roles',
            tabs: { reaction: 'Reaction', menu: 'Menu', button: 'Button' },
            mockMessage: 'Pick a role below to customize your server experience!',
          },
          panel4: {
            heading: 'Free Vs Premium Builder',
            freeMock: 'New event this weekend — drop by the announcements channel for details!',
            serverUpdate: 'Server Update',
            useBuilder: 'Use <span style="background:#1e1f22;color:#e3e5e8;border-radius:2px;padding:1px 5px;font-family:\'Courier New\',monospace;font-size:10.5px;white-space:nowrap;">/builder new</span> to create your own announcement',
            newChannel: 'New event channel now open for <span style="background:rgba(88,101,242,0.3);color:#c9cdfb;border-radius:2px;padding:0 3px;">@Members</span>',
            getNotified: 'Get Notified',
          },
          panel5: { heading: 'Free Vs Premium Backgrounds' },
          panel6: {
            heading: 'Switch Server Language',
            tabThai: 'Thai',
            tabEnglish: 'English',
            adminOnly: 'Admin only',
            used: 'used',
            onlyYou: 'Only you can see this',
          },
        },
        cta: { heading: 'Ready to set this up on your server?' },
        showcase: {
          eyebrow: 'Premium Showcase',
          heading: 'See how far decoration can go',
          desc: 'Not a single feature — one flagship message built entirely from real Layout Builder blocks, dressed up to the max.',
          poweredBy: 'Powered by Milo Bot Premium',
        },
        legend: {
          text: 'Text',
          image: 'Image',
          divider: 'Divider',
          textSmallImage: 'Text + Small Image',
          textLinkButton: 'Text + Link Button',
          textRoleButton: 'Text + Role Button',
          textChannelButton: 'Text + Channel Button',
          note: 'These are the 7 real block types the Layout Builder supports — mix and match them yourself.',
        },
      },
      pricing: {
        _meta: {
          title: 'Milo Bot — Pricing',
          description: "Milo Bot pricing: free forever, or upgrade to Premium for animated GIF cards, unlimited builders, unlimited role setups, and @mentions in messages.",
        },
        eyebrow: 'Pricing',
        title: 'Simple pricing, real limits',
        subtitle: "Every number below is pulled straight from the bot's code — no rounding, no fine print.",
        free: {
          tierLabel: 'Free',
          suffix: 'forever',
          desc: 'Everything you need to get a server started — no card required.',
          feat1: 'Welcome &amp; Goodbye cards <span class="sub">— PNG/JPG/WebP backgrounds</span>',
          feat2: '1 Role Setup <span class="sub">— Reaction type, up to 2 roles</span>',
          feat3: '1 Message Builder <span class="sub">— text + image block</span>',
          feat4: 'Up to 20 custom fonts <span class="sub">per server</span>',
          feat5: 'Thai / English language switch',
        },
        premium: {
          ribbon: 'Most Popular',
          tierLabel: 'Premium',
          suffix: '/ month',
          desc: 'Everything in Free, plus the full Layout Builder and unlimited setups.',
          cta: 'Subscribe to Premium (฿99)',
          ctaNote: "Already added the bot? You'll pick which server this is for on the next page.",
          plusLabel: 'Everything in Free, plus:',
          feat1: 'Animated GIF backgrounds',
          feat2: 'Unlimited Builders <span class="sub">+ full Layout Builder access</span>',
          feat3: 'Unlimited Role Setups <span class="sub">+ unlock Menu/Button types</span>',
          feat4: 'Tag users/roles/channels <span class="sub">(@mentions) in messages</span>',
        },
        footnote: 'Cancel anytime from <span>/premium → Manage Subscription</span> — no lock-in.',
      },
      // 🆕 [23 ก.ย. 2569 รอบ 8] marketplace — แปลไว้เฉพาะ "โครงหลัก" ของหน้านี้
      // (nav ใช้คีย์ nav.* ร่วมกับหน้าอื่นอยู่แล้ว) ส่วนการ์ดสินค้า 9 ชิ้น,
      // อันดับยอดนิยม, ร้านค้าใน carousel, และป็อปอัปต่างๆ ยังไม่มี data-i18n
      // เลยไม่ต้องมีคำแปลตรงนี้ (ดูคอมเมนต์ยาวๆ ใน public/marketplace.html
      // ส่วน <head> สำหรับเหตุผลเต็มๆ)
      marketplace: {
        _meta: {
          title: 'Milo Bot — Marketplace',
          description: "Milo Bot's Marketplace — buy server decorations from other creators, or open your own shop through the /marketplace command on Discord.",
        },
        previewStrip: '💳 <strong>Pay with a PromptPay QR</strong> — scan to pay the seller directly, the bot never touches your money. Once the seller confirms payment, you\'ll get your item or a follow-up message automatically.',
        sidebar: {
          categories: 'Categories',
          catAll: 'All Items',
          // 🆕 [7 ต.ค. 2569 แก้บั๊ก] คีย์หมวดหมู่/หมวดย่อยด้านซ้ายที่เดิมไม่มี data-i18n
          // เลย (เป็นข้อความแข็งผสมอังกฤษ/ไทยปนกันในตัว marketplace.html) เพิ่มมาให้ครบ
          catServers: 'Servers',
          catMedia: 'Image & Media',
          catEmojiSticker: 'Emoji & Sticker',
          catBuilder: 'Builder',
          catRole: 'Role',
          catWelcomeGoodbye: 'Welcome / Goodbye',
          catPackage: 'Package',
          subAll: 'All',
          subBanner: 'Banner',
          subThumbnail: 'Thumbnail',
          subWallpaper: 'Wallpaper',
          subDivider: 'Img Divider',
          subRoleMenu: 'Menu (Dropdown)',
          subRoleButton: 'Button',
          subRoleReaction: 'Reaction',
          popularTags: 'Popular Tags',
          tagPopular: '#popular',
          tagNew: '#new',
          tagFree: '#free',
          tagPremium: '#premium',
          tagGame: '#gaming',
          tagMusic: '#music',
          newShops: 'New Shops',
          viewNewShops: 'View new shops &rarr;',
        },
        promo: {
          heading: 'Decorate your server — real buying and selling',
          subtitle: "Buy decorations from other creators, or open your own shop.",
        },
        toolbar: {
          searchPlaceholder: 'Search items, themes, or tags...',
          sortBy: 'Sort by',
          sortPopular: 'Popular',
          sortPriceAsc: 'Price: Low → High',
          sortPriceDesc: 'Price: High → Low',
          sortRating: 'Top Rated',
          price: 'Price',
          priceMin: 'Min (฿)',
          priceMax: 'Max (฿)',
          reset: 'Reset',
          applyFilter: 'Apply Filter',
        },
        emptyState: {
          message: 'No items match your search.',
          clearSearch: 'Clear search',
        },
        // 🆕 [7 ต.ค. 2569 แก้บั๊ก รอบ 2] 3 สถานะของกริดสินค้าที่น้องหนาวแจ้งมา — เดิม
        // #productGridLoading / #marketNoListings / #marketLoadError ไม่มี data-i18n
        // เลยสักอัน เลยค้างเป็นไทยตลอดไม่ว่าจะสลับเว็บเป็นอังกฤษแล้วก็ตาม (คนละเคสกับ
        // emptyState ด้านบน ที่ใช้ตอน "ค้นหา/กรองแล้วไม่เจอ" เท่านั้น)
        loadingProducts: 'Loading items...',
        noListings: {
          message: 'No one has listed anything in the marketplace yet.',
          sub: 'Be the first — click the "List an item" button below to get started.',
        },
        loadError: 'Failed to load items — try refreshing this page.',
        // 🆕 [11 ต.ค. 2569] กลับมาใช้ปุ่มลิงก์ไป Dashboard แล้ว — ตอนนี้ลงขายของจากเว็บ
        // ได้จริงแล้ว (ฟอร์มใน Dashboard > Marketplace) เลยแก้ข้อความ+เพิ่ม link ให้ตรงปุ่ม
        dashboardBanner: {
          text: 'Want to open your own shop? List items straight from your Dashboard — no extra commission.',
          link: 'List an item &rarr;',
        },
        sideRight: {
          premiumBlurb: 'Already have Premium? Open your own decoration shop instantly — no extra commission.',
          viewPlans: 'View Plans &rarr;',
          topRanking: 'Top Ranking',
          featuredShops: 'Featured Shops',
        },
      },
    },
    th: {
      nav: {
        home: 'หน้าแรก',
        features: 'ฟีเจอร์',
        pricing: 'ราคา',
        marketplace: 'มาร์เก็ตเพลส',
        feed: 'ฟีด',
        commands: 'คำสั่ง',
        dashboard: 'แดชบอร์ด',
        addBot: 'เพิ่มบอท',
      },
      commands: {
        _meta: {
          title: 'Milo Bot — คำสั่งทั้งหมด',
          description: 'คู่มือคำสั่งทั้งหมดของ Milo Bot แบบละเอียด ทีละขั้นตอน ตั้งแต่การ์ดต้อนรับ ยศอัตโนมัติ ไปจนถึงการส่งออก/นำเข้าชุดตั้งค่าผ่าน Marketplace',
        },
        eyebrow: 'คู่มือคำสั่ง',
        title: 'คำสั่งทั้งหมดของ Milo Bot',
        lead: 'รวมวิธีใช้คำสั่งทุกตัวแบบละเอียด ทีละขั้นตอน — เลือกหัวข้อด้านล่าง หรือเลื่อนดูได้เลย',
        groups: {
          decorate: {
            label: '🎨 ตกแต่งเซิร์ฟ',
            note: 'ค่าเริ่มต้นเปิดให้สมาชิกทุกคนใช้ได้ — ถ้าอยากจำกัดแค่แอดมิน ไปตั้งเองได้ที่ Discord Server Settings → Integrations → Milo Bot',
          },
          general: { label: '⚙️ ตั้งค่าทั่วไป' },
          marketplace: { label: '🛒 Marketplace' },
        },
        badges: {
          all: 'ใช้ได้ทุกคน',
          manage: 'ต้องมี Manage Server',
          admin: 'ต้องมี Administrator',
        },
        stepsLabel: {
          default: 'วิธีใช้',
          createNew: 'วิธีใช้ (สร้างใหม่)',
        },
        cmd: {
          welcomeSetup: {
            desc: 'ตั้งค่าการ์ดต้อนรับสมาชิกใหม่ — โพสต์การ์ดรูปสวยๆ อัตโนมัติทุกครั้งที่มีคนเข้าเซิร์ฟ',
            steps: [
              'พิมพ์ <code>/welcome-setup</code> เฉยๆ ไม่มีตัวเลือกให้กรอกตรงนี้ — บอทจะเด้งแผงควบคุมเป็นปุ่มกดมาให้ทันที (เห็นแค่คนที่พิมพ์คำสั่ง)',
              'กดปุ่มเลือกห้องที่จะโพสต์การ์ด, พื้นหลัง (รูปของตัวเอง, สีพื้น หรือ GIF ถ้าเป็นพรีเมียม), ข้อความต้อนรับ, ฟอนต์',
              'เปิด/ปิดการใช้งานได้จากปุ่มเดียวกัน — ถ้ายังไม่เลือกห้อง การ์ดจะยังไม่โพสต์ไปไหน',
            ],
          },
          goodbyeSetup: {
            desc: 'ตั้งค่าการ์ดอำลาสมาชิกที่ออกจากเซิร์ฟ — ทำงานแบบเดียวกับ <code>/welcome-setup</code> เป๊ะๆ แค่ฝั่ง "ออก" แทน "เข้า"',
            steps: [
              'พิมพ์ <code>/goodbye-setup</code> เฉยๆ — เจอแผงควบคุมแบบเดียวกับ welcome',
              'เลือกห้อง, พื้นหลัง, ข้อความอำลา, ฟอนต์ แล้วเปิดใช้งาน',
            ],
          },
          roleSetup: {
            desc: 'สร้างระบบแจกยศอัตโนมัติ — สมาชิกกดรับยศเอง ไม่ต้องรอแอดมินแจกทีละคน',
            opts: [
              '<code>/role-setup new</code> — สร้างชุดใหม่ (ตั้งชื่อ + เลือกรูปแบบ: <code>menu</code> ดรอปดาวน์, <code>button</code> ปุ่มกด, <code>reaction</code> กด emoji — เมนู/ปุ่มเป็นของพรีเมียม ฟรีใช้ได้แค่ reaction สูงสุด 2 ยศ)',
              '<code>/role-setup edit</code> — เปิดชุดเดิมมาแก้ (เพิ่ม/ลดยศ, เปลี่ยน emoji ฯลฯ)',
              '<code>/role-setup list</code> — ดูรายชื่อชุดที่สร้างไว้ทั้งหมดในเซิร์ฟนี้',
              '<code>/role-setup delete</code> — ลบชุดที่ไม่ใช้แล้ว',
            ],
            steps: [
              'พิมพ์ <code>/role-setup new</code> ตั้งชื่อ + เลือกรูปแบบ',
              'กดปุ่มในแผงควบคุมเพื่อเพิ่มยศแต่ละอัน (เลือกยศจริงของเซิร์ฟ + ข้อความ/emoji ของปุ่มนั้น)',
              'กดโพสต์ข้อความลงห้องที่ต้องการ — สมาชิกกด/เลือก/reply ได้รับยศเองทันที',
            ],
            tip: 'บอทต้องมีสิทธิ์ <strong>Manage Roles</strong> และยศของบอทต้องอยู่ "สูงกว่า" ยศที่จะแจก ไม่งั้นแจกไม่ได้ (ข้อจำกัดของ Discord เอง ไม่ใช่บั๊ก)',
          },
          builder: {
            desc: 'ตัวจัดวางข้อความ/ประกาศเอง ไม่ต้องเขียนโค้ด — คลิกเพิ่ม block (ข้อความ, รูป, เส้นคั่น, ปุ่มลิงก์/ยศ/ห้อง) แล้วโพสต์เป็นข้อความสวยๆ',
            opts: [
              '<code>/builder new</code> — สร้างฉบับร่างใหม่ (ตั้งชื่อ) — ฟรีมีได้ 1 ฉบับ/เซิร์ฟ พรีเมียมไม่จำกัด',
              '<code>/builder edit</code> — เปิดฉบับร่างเดิมมาแก้ต่อ',
              '<code>/builder list</code> — ดูรายชื่อฉบับร่างทั้งหมด',
              '<code>/builder delete</code> — ลบฉบับร่างที่ไม่ใช้แล้ว',
            ],
            steps: [
              'พิมพ์ <code>/builder new</code> ตั้งชื่อฉบับร่าง',
              'กดปุ่มเพิ่ม block ทีละอัน แล้วกรอก/อัปโหลดเนื้อหาของ block นั้น',
              'กดโพสต์ลงห้องที่ต้องการเมื่อพอใจแล้ว — แก้ต่อได้ตลอดผ่าน <code>/builder edit</code>',
            ],
          },
          fonts: {
            desc: 'อัปโหลดฟอนต์ของตัวเอง (.ttf/.otf) ไว้ใช้กับการ์ด welcome/goodbye และยศของเซิร์ฟนี้',
            opts: [
              '<code>/fonts list</code> — ดูฟอนต์ทั้งหมด (ฟอนต์มาตรฐานของบอท + ที่อัปโหลดเอง) เลือกลบฟอนต์ที่อัปโหลดเองได้',
              '<code>/fonts upload</code> — แนบไฟล์ฟอนต์ <code>.ttf</code> หรือ <code>.otf</code> เพื่ออัปโหลด (สูงสุด 20 ฟอนต์/เซิร์ฟ)',
            ],
          },
          uploadImage: {
            desc: 'อัปโหลดรูปเพื่อเอา "ลิงก์ถาวร" มาใช้กับคำสั่งอื่นที่ต้องกรอกลิงก์รูป (เช่นพื้นหลังการ์ด)',
            steps: [
              'พิมพ์ <code>/upload-image</code> แล้วแนบไฟล์รูป (<code>.png .jpg .jpeg .webp .gif</code>)',
              'บอทตอบลิงก์กลับมา — ก๊อปลิงก์นั้นไปวางในช่องที่ต้องการได้เลย ลิงก์นี้ไม่มีวันหมดอายุ',
            ],
          },
          language: {
            desc: 'ตั้งภาษาที่บอทใช้ตอบในเซิร์ฟนี้ — เลือกได้ระหว่าง <code>English</code> กับ <code>ไทย</code> มีผลกับทุกข้อความที่บอทตอบในเซิร์ฟนี้ตั้งแต่ตั้งค่า',
          },
          premium: {
            desc: 'จัดการสถานะพรีเมียมของเซิร์ฟนี้ — ดูสถานะปัจจุบัน, สมัคร/ต่ออายุ, หรือจัดการการสมัครสมาชิก',
          },
          help: {
            desc: 'โชว์รายการคำสั่งทั้งหมด พร้อมตัวอย่างสิ่งที่บอทสร้างได้จริง — เหมาะเป็นจุดเริ่มต้นสำหรับคนที่เพิ่งเชิญบอทเข้าเซิร์ฟ',
          },
          ping: {
            desc: 'เช็กความหน่วง (latency) ของบอทตอนนี้ — ใช้ตอนสงสัยว่าบอทตอบช้าผิดปกติหรือเปล่า',
          },
          marketplace: {
            desc: 'เปิดร้านขายของตกแต่ง/บริการสาย Discord ของตัวเอง ผ่านตลาดกลางบนหน้าเว็บ <a href="/marketplace">/marketplace</a> — ลงประกาศจากดิสคอร์ด แล้วไปโชว์ขายอยู่บนหน้าเว็บให้คนอื่นซื้อได้',
            opts: [
              '<code>/marketplace sell</code> — ลงประกาศขายใหม่ (ชื่อ, ราคา, คำอธิบาย, หมวดหมู่, รูปปก, และของที่จะส่ง — ไฟล์ดิจิทัล/ลิงก์ระบบหรือเทมเพลต/รหัสตั้งค่า Milo Bot — เลือกได้จากหน้าเว็บ Dashboard ด้วย ไม่ต้องกรอกทุกอย่างจากดิสคอร์ด)',
              '<code>/marketplace mylistings</code> — ดูประกาศขายทั้งหมดของตัวเอง',
              '<code>/marketplace remove</code> — ปิดประกาศ (ขายหมด/ไม่ขายแล้ว แต่ยังเปิดขายใหม่ได้ทีหลัง)',
              '<code>/marketplace markselling</code> — เปิดประกาศที่เคยปิดไว้ให้กลับมาขายอีกครั้ง',
              '<code>/marketplace setpromptpay</code> — ตั้ง/แก้เบอร์พร้อมเพย์รับเงิน (สำหรับผู้ขายในไทย)',
              '<code>/marketplace setpaymentlink</code> — ตั้ง/แก้ลิงก์รับเงินสากล เช่น PayPal.me (สำหรับผู้ขายต่างชาติ)',
            ],
            info: 'บอทไม่แตะเงินของใครเลย — ผู้ซื้อจ่ายตรงเข้าบัญชีผู้ขาย (สแกน QR หรือกดลิงก์) บอทแค่ช่วยแจ้ง/ส่งของต่อให้อัตโนมัติหลังผู้ขายกดยืนยันว่าได้รับเงินแล้ว',
          },
        },
        milo: {
          eyebrow: 'เจาะลึก — ฟีเจอร์ที่คนงงกันบ่อยที่สุด',
          intro: 'ใช้สำหรับ "ส่งต่อชุดตั้งค่า Milo Bot" ของเซิร์ฟตัวเองให้คนอื่นเอาไปใช้ต่อได้ทันที — คล้ายการขายเทมเพลต Canva ที่คนซื้อกด Import แล้วได้ของพร้อมใช้เลย โดยส่งผ่านตลาด <code>/marketplace</code> ด้านบน',
          seller: {
            h4: '🧑‍💻 ฝั่งคนขาย (ผู้สร้างชุดตั้งค่า)',
            sub: 'ทำในเซิร์ฟที่ตั้งค่าไว้สวยแล้ว ก่อนเอาไปลงขาย',
            steps: [
              'ตั้งค่าการ์ด Welcome/Goodbye, Role setup, และ/หรือ Builder ในเซิร์ฟตัวเองให้เรียบร้อยตามที่จะขาย',
              'พิมพ์ <code>/milo export-config</code> ในเซิร์ฟนั้น (ต้องมีสิทธิ์ Administrator) — บอทจะเปิด <strong>"แผงเลือก"</strong> ให้ติ๊กเองว่าจะรวม Welcome/Goodbye ไหม แล้วเลือก role setup/builder เฉพาะชุดที่จะขายจริง (ไม่บังคับรวมทุกอย่างที่มีในเซิร์ฟ)',
              'เลือกเสร็จแล้วกด <strong>"สร้างรหัส"</strong> — บอทตอบ (เห็นแค่คนพิมพ์คำสั่ง) รหัสที่สร้าง เช่น <code>MILO-7K2X9QAB</code> พร้อมสรุปว่ารหัสนี้มีอะไรติดไปบ้าง — เช็คให้ตรงกับที่ตั้งใจขาย',
              'เอารหัสนี้ไปกรอกในช่อง "รหัสการตั้งค่า Milo Bot" ตอนลงขายด้วย <code>/marketplace sell</code> (หรือจากหน้าเว็บ Dashboard)',
            ],
          },
          buyer: {
            h4: '🛍️ ฝั่งคนซื้อ (ผู้รับชุดตั้งค่า)',
            sub: 'ทำหลังจ่ายเงินซื้อสำเร็จแล้ว',
            steps: [
              'จ่ายเงินซื้อสินค้าบนหน้าเว็บ Marketplace ตามปกติ',
              'บอทส่งรหัส (เช่น <code>MILO-7K2X9QAB</code>) มาทาง DM ให้ทันทีหลังผู้ขายกดยืนยันว่าได้รับเงินแล้ว',
              'ไปที่เซิร์ฟของตัวเอง พิมพ์ <code>/milo import-config</code> แล้ววางรหัสที่ได้ในช่อง <code>code</code> (ต้องมีสิทธิ์ Administrator ของเซิร์ฟนั้น)',
              'บอทติดตั้งการ์ด/role setup/builder ที่ติดมากับรหัสให้ทันที พร้อมสรุปว่าติดตั้งอะไรไปบ้าง',
            ],
          },
          warn: {
            title: '⚠️ ข้อควรรู้ก่อนใช้งานจริง',
            lines: [
              'รหัสแต่ละอัน <strong>ใช้ได้ครั้งเดียวเท่านั้น</strong> — import ไปแล้วรหัสนั้นจะใช้ซ้ำไม่ได้อีก (กันขายรหัสเดียวซ้ำแบบไม่จำกัด)',
              'ยศ/ห้องที่ติดมากับ role setup และ builder (ปุ่มแจกยศ, ปุ่มลิงก์ห้อง) <strong>ยังเป็นของเซิร์ฟผู้ขายเดิม</strong> ใช้งานไม่ได้จนกว่าผู้ซื้อจะไปกำหนดยศ/ห้องของเซิร์ฟตัวเองใหม่เองผ่าน <code>/role-setup edit</code> / <code>/builder edit</code>',
              'ห้องโพสต์การ์ด Welcome/Goodbye ก็ไม่ติดมาด้วย (ตั้งใจ) — ผู้ซื้อต้องเลือกห้องของตัวเองใหม่เสมอหลัง import',
              'ถ้าเซิร์ฟผู้ซื้อเป็นแผนฟรี ระบบจะตัดเฉพาะส่วนที่แผนฟรีทำไม่ได้อยู่แล้วให้อัตโนมัติ (เช่น role setup แบบเมนู/ปุ่ม, reaction เกิน 2 ยศ) ไม่ทำให้ import ล้มเหลวทั้งหมด',
            ],
          },
        },
      },
      home: {
        _meta: {
          title: 'Milo Bot — ดิสคอร์ดของคุณ ในสไตล์ของคุณ',
          description: 'Milo Bot: การ์ดต้อนรับ/บอกลาแบบกำหนดเองได้เต็มที่ ฟอนต์ของเซิร์ฟเป็นของตัวเอง ระบบแจกยศอัตโนมัติ และตัวสร้างข้อความในสไตล์ของคุณเอง — ตั้งค่าเสร็จใน 5 นาที',
        },
        eyebrow: 'บอทแต่งเซิร์ฟ',
        tagline: 'ดิสคอร์ดของคุณ ในสไตล์ของคุณ',
        lead: 'การ์ดต้อนรับ/บอกลาแบบกำหนดเองได้เต็มที่ ฟอนต์ของเซิร์ฟเป็นของตัวเอง ระบบแจกยศอัตโนมัติ และตัวสร้างข้อความในสไตล์ของคุณเอง — ตั้งค่าเสร็จใน 5 นาที',
        cta: {
          addBot: 'เพิ่ม Milo Bot เข้าเซิร์ฟ',
          viewFeatures: 'ดูฟีเจอร์ทั้งหมด',
        },
        chips: {
          setup: 'ตั้งค่าเสร็จใน 5 นาที',
          bilingual: 'รองรับไทย & อังกฤษ',
          free: 'เริ่มใช้งานฟรี',
        },
        nowPlaying: { label: 'กำลังเล่นอยู่' },
      },
      features: {
        _meta: {
          title: 'Milo Bot — ฟีเจอร์',
          description: 'ทุกฟีเจอร์ที่ Milo Bot มีให้ตอนนี้: การ์ดต้อนรับ/บอกลา ฟอนต์เซิร์ฟของตัวเอง ระบบแจกยศอัตโนมัติ ตัวสร้างข้อความ การ์ด GIF และรองรับหลายภาษา',
        },
        eyebrow: 'ฟีเจอร์',
        title: 'ทุกอย่างที่เซิร์ฟของคุณต้องการ',
        subtitle: 'บอทตัวเดียว 6 เครื่องมือหลัก — กดดูทีละอันได้เลย',
        tryLabel: 'ลองเลย — พิมพ์ชื่อดูสิ',
        tryPlaceholder: 'เช่น ไอโกะ',
        premiumTag: 'พรีเมียม',
        feat: {
          '1': { title: 'การ์ดต้อนรับ & บอกลา', desc: 'ออกแบบการ์ดต้อนรับสมาชิกใหม่และบอกลาแบบกำหนดเองได้เต็มที่ — เลือกเลย์เอาต์ ใส่พื้นหลังและฟอนต์ของตัวเอง ที่เหลือ Milo จัดการให้' },
          '2': { title: 'ฟอนต์ของเซิร์ฟเอง', desc: 'อัปโหลดไฟล์ฟอนต์ของตัวเอง (.ttf/.otf) แล้วใช้ได้กับทุกการ์ด — ต้อนรับ บอกลา และการ์ดยศ ล้วนคงสไตล์ของเซิร์ฟคุณไว้' },
          '3': { title: 'ระบบแจกยศอัตโนมัติ', desc: 'ตั้งระบบยศแบบกดเองได้ตามสไตล์คุณ — แบบ Reaction ใช้ฟรี (สูงสุด 2 ยศต่อแผง) ส่วน Menu กับ Button ปลดล็อกด้วยพรีเมียม ได้ยศเพิ่มและเลย์เอาต์ที่หลากหลายขึ้น' },
          '4': { title: 'ตัวสร้างข้อความ', desc: 'ออกแบบ embed และประกาศต่างๆ ด้วยการคลิก ไม่ต้องเขียนโค้ด ฟรีให้บิลเดอร์ง่ายๆ 1 อัน ส่วนพรีเมียมปลดล็อกบิลเดอร์ไม่จำกัด หลายบล็อก ปุ่มกด และ @mentions' },
          '5': { title: 'การ์ด GIF เคลื่อนไหว', desc: 'พื้นหลังฟรีเป็นภาพ PNG/JPG/WebP คมชัด ส่วนพรีเมียมเพิ่มพื้นหลัง GIF เคลื่อนไหว — เลย์เอาต์เดิม แต่มีชีวิตชีวาขึ้น แตะ Free/Premium เพื่อเทียบกัน' },
          '6': { title: 'รองรับหลายภาษา', desc: 'ตั้งค่าด้วย <code>/language</code> (แอดมินเท่านั้น) — Milo ตอบเป็นไทยหรืออังกฤษตามที่ตั้งไว้ในแต่ละเซิร์ฟ สลับได้ทันที ไม่ต้องตั้งค่าใหม่ แตะ ไทย/English เพื่อดูตัวอย่าง' },
        },
        preview: {
          label: 'ดูตัวอย่างสด',
          tierTabs: { free: 'ฟรี', premium: 'พรีเมียม' },
          panel1: { caption: 'นี่คือสิ่งที่สมาชิกใหม่เห็นทันทีที่เข้าเซิร์ฟ — ปรับแต่งได้เต็มที่ ไม่ผูกกับเทมเพลตตายตัว' },
          panel2: { caption: 'อัปโหลดครั้งเดียว ใช้ได้ทุกที่ — ทุกการ์ดคงฟอนต์ประจำเซิร์ฟของคุณไว้เหมือนกันหมด' },
          panel3: {
            heading: '3 วิธีแจกยศ',
            tabs: { reaction: 'Reaction', menu: 'เมนู', button: 'ปุ่มกด' },
            mockMessage: 'เลือกยศด้านล่างเพื่อปรับแต่งประสบการณ์ในเซิร์ฟของคุณ!',
          },
          panel4: {
            heading: 'เทียบบิลเดอร์ Free กับ Premium',
            freeMock: 'มีอีเวนต์สุดสัปดาห์นี้ — แวะไปดูรายละเอียดที่ห้องประกาศได้เลย!',
            serverUpdate: 'อัปเดตเซิร์ฟ',
            useBuilder: 'ใช้คำสั่ง <span style="background:#1e1f22;color:#e3e5e8;border-radius:2px;padding:1px 5px;font-family:\'Courier New\',monospace;font-size:10.5px;white-space:nowrap;">/builder new</span> เพื่อสร้างประกาศของคุณเอง',
            newChannel: 'เปิดห้องอีเวนต์ใหม่แล้วสำหรับ <span style="background:rgba(88,101,242,0.3);color:#c9cdfb;border-radius:2px;padding:0 3px;">@Members</span>',
            getNotified: 'รับการแจ้งเตือน',
          },
          panel5: { heading: 'เทียบพื้นหลัง Free กับ Premium' },
          panel6: {
            heading: 'สลับภาษาของเซิร์ฟ',
            tabThai: 'ไทย',
            tabEnglish: 'อังกฤษ',
            adminOnly: 'แอดมินเท่านั้น',
            used: 'ใช้คำสั่ง',
            onlyYou: 'เห็นได้เฉพาะคุณคนเดียว',
          },
        },
        cta: { heading: 'พร้อมตั้งค่าให้เซิร์ฟของคุณหรือยัง?' },
        showcase: {
          eyebrow: 'ตัวอย่างพรีเมียม',
          heading: 'ดูว่าตกแต่งได้สุดแค่ไหน',
          desc: 'ไม่ใช่แค่ฟีเจอร์เดียว — นี่คือข้อความเรือธงที่ประกอบจากบล็อกจริงของ Layout Builder ทั้งหมด แต่งเต็มสูตร',
          poweredBy: 'ขับเคลื่อนโดย Milo Bot Premium',
        },
        legend: {
          text: 'ข้อความ',
          image: 'รูปภาพ',
          divider: 'เส้นคั่น',
          textSmallImage: 'ข้อความ + รูปเล็ก',
          textLinkButton: 'ข้อความ + ปุ่มลิงก์',
          textRoleButton: 'ข้อความ + ปุ่มยศ',
          textChannelButton: 'ข้อความ + ปุ่มห้อง',
          note: 'นี่คือ 7 บล็อกจริงที่ Layout Builder รองรับ — ผสมผสานเองได้ตามใจเลย',
        },
      },
      pricing: {
        _meta: {
          title: 'Milo Bot — ราคา',
          description: 'ราคา Milo Bot: ใช้ฟรีตลอดไป หรืออัปเกรดเป็นพรีเมียมเพื่อการ์ด GIF เคลื่อนไหว บิลเดอร์ไม่จำกัด ระบบยศไม่จำกัด และแท็ก @mentions ในข้อความ',
        },
        eyebrow: 'ราคา',
        title: 'ราคาเรียบง่าย ขีดจำกัดตรงไปตรงมา',
        subtitle: 'ทุกตัวเลขด้านล่างนี้ดึงมาจากโค้ดจริงของบอทตรงๆ ไม่ปัดเศษ ไม่มีตัวหนังสือเล็กซ่อนไว้',
        free: {
          tierLabel: 'ฟรี',
          suffix: 'ตลอดไป',
          desc: 'ทุกอย่างที่ต้องใช้เริ่มต้นเซิร์ฟ — ไม่ต้องใช้บัตรเครดิต',
          feat1: 'การ์ดต้อนรับ & บอกลา <span class="sub">— พื้นหลัง PNG/JPG/WebP</span>',
          feat2: 'ระบบยศ 1 ชุด <span class="sub">— แบบ Reaction สูงสุด 2 ยศ</span>',
          feat3: 'ตัวสร้างข้อความ 1 อัน <span class="sub">— บล็อกข้อความ + รูปภาพ</span>',
          feat4: 'ฟอนต์กำหนดเองสูงสุด 20 อัน <span class="sub">ต่อเซิร์ฟ</span>',
          feat5: 'สลับภาษาไทย / อังกฤษได้',
        },
        premium: {
          ribbon: 'ยอดนิยม',
          tierLabel: 'พรีเมียม',
          suffix: '/ เดือน',
          desc: 'มีทุกอย่างในแพ็กฟรี บวกกับ Layout Builder เต็มรูปแบบและตั้งค่าได้ไม่จำกัด',
          cta: 'สมัครพรีเมียม (฿99)',
          ctaNote: 'เพิ่มบอทแล้วใช่ไหม? หน้าถัดไปจะให้เลือกว่าซื้อให้เซิร์ฟไหน',
          plusLabel: 'มีทุกอย่างในแพ็กฟรี บวกกับ:',
          feat1: 'พื้นหลัง GIF เคลื่อนไหว',
          feat2: 'บิลเดอร์ไม่จำกัด <span class="sub">+ ใช้ Layout Builder เต็มรูปแบบ</span>',
          feat3: 'ระบบยศไม่จำกัด <span class="sub">+ ปลดล็อกแบบ Menu/Button</span>',
          feat4: 'แท็กผู้ใช้/ยศ/ห้อง <span class="sub">(@mentions) ในข้อความได้</span>',
        },
        footnote: 'ยกเลิกได้ทุกเมื่อที่ <span>/premium → Manage Subscription</span> — ไม่มีผูกมัด',
      },
      marketplace: {
        _meta: {
          title: 'Milo Bot — Marketplace',
          description: 'Marketplace ของ Milo Bot — เลือกซื้อของตกแต่งเซิร์ฟจากครีเอเตอร์คนอื่น หรือเปิดร้านขายเองได้จริงผ่านคำสั่ง /marketplace บนดิสคอร์ด',
        },
        previewStrip: '💳 <strong>จ่ายเงินแบบ PromptPay QR</strong> — สแกนจ่ายตรงเข้าบัญชีผู้ขาย บอทไม่แตะเงินเลย รอผู้ขายกดยืนยันรับเงินแล้วจะได้รับของ/ข้อความติดต่อกลับอัตโนมัติครับ',
        sidebar: {
          categories: 'หมวดหมู่',
          catAll: 'สินค้าทั้งหมด',
          // 🆕 [7 ต.ค. 2569 แก้บั๊ก] คีย์หมวดหมู่/หมวดย่อยด้านซ้าย — คู่กับฝั่ง en ด้านบน
          catServers: 'เซิร์ฟเวอร์',
          catMedia: 'รูปภาพ & มีเดีย',
          catEmojiSticker: 'อิโมจิ & สติกเกอร์',
          catBuilder: 'บิลเดอร์',
          catRole: 'ยศ',
          catWelcomeGoodbye: 'ต้อนรับ / อำลา',
          catPackage: 'แพ็กเกจ',
          subAll: 'ทั้งหมด',
          subBanner: 'แบนเนอร์',
          subThumbnail: 'ภาพปก',
          subWallpaper: 'วอลเปเปอร์',
          subDivider: 'เส้นแบ่งรูป',
          subRoleMenu: 'เมนู (Dropdown)',
          subRoleButton: 'ปุ่มกด (Button)',
          subRoleReaction: 'รีแอคชัน',
          popularTags: 'แท็กยอดนิยม',
          tagPopular: '#ยอดนิยม',
          tagNew: '#ใหม่',
          tagFree: '#ฟรี',
          tagPremium: '#พรีเมียม',
          tagGame: '#เกม',
          tagMusic: '#เพลง',
          newShops: 'ร้านค้ามาใหม่',
          viewNewShops: 'ดูร้านค้าเปิดใหม่ &rarr;',
        },
        promo: {
          heading: 'ตกแต่งเซิร์ฟ ซื้อ-ขายกันได้จริง',
          subtitle: 'ซื้อของตกแต่งจากคนอื่นได้เลย หรือเปิดร้านขายเองก็ได้',
        },
        toolbar: {
          searchPlaceholder: 'ค้นหาสินค้า ธีม หรือแท็ก...',
          sortBy: 'เรียงตาม',
          sortPopular: 'ยอดนิยม',
          sortPriceAsc: 'ราคา: ต่ำ → สูง',
          sortPriceDesc: 'ราคา: สูง → ต่ำ',
          sortRating: 'คะแนนสูงสุด',
          price: 'ราคา',
          priceMin: 'ต่ำสุด (฿)',
          priceMax: 'สูงสุด (฿)',
          reset: 'รีเซ็ต',
          applyFilter: 'ใช้ตัวกรอง',
        },
        emptyState: {
          message: 'ไม่พบสินค้าที่ตรงกับคำค้นหา',
          clearSearch: 'ล้างคำค้นหา',
        },
        // 🆕 [7 ต.ค. 2569 แก้บั๊ก รอบ 2] คู่กับฝั่ง en ด้านบน
        loadingProducts: 'กำลังโหลดสินค้า...',
        noListings: {
          message: 'ยังไม่มีใครลงขายของในตลาดตอนนี้เลยครับ',
          sub: 'เป็นคนแรกได้เลย — กดปุ่ม "ลงขายสินค้า" ด้านล่างเพื่อเริ่มได้เลยครับ',
        },
        loadError: 'โหลดสินค้าไม่สำเร็จ ลองรีเฟรชหน้านี้อีกครั้งครับ',
        // 🆕 [11 ต.ค. 2569] กลับมาใช้ปุ่มลิงก์ไป Dashboard แล้วครับ — ตอนนี้ลงขายของจาก
        // หน้าเว็บได้จริงแล้ว (ฟอร์มใน Dashboard > Marketplace) เลยแก้ข้อความ+เพิ่ม
        // link ให้ตรงกับปุ่มที่เพิ่มใน marketplace.html
        dashboardBanner: {
          text: 'อยากเปิดร้านขายของตัวเอง? ลงขายสินค้าได้เลยจากหน้า Dashboard ของคุณ — ไม่มีค่าคอมมิชชั่น',
          link: 'ลงขายสินค้า &rarr;',
        },
        sideRight: {
          premiumBlurb: 'มี Premium อยู่แล้ว? เปิดร้านขายของตกแต่งของตัวเองได้ทันที ไม่มีค่าคอมมิชชั่นเพิ่ม',
          viewPlans: 'ดูแพ็กเกจ &rarr;',
          topRanking: 'อันดับยอดนิยม',
          featuredShops: 'ร้านค้าแนะนำ',
        },
      },
    },
  };
})();
