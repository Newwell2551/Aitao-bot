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
        addBot: 'Add Bot',
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
          description: "Preview of Milo Bot's Marketplace — buy server decorations from other creators, or open your own shop (this feature isn't live yet).",
        },
        previewStrip: '🔍 <strong>Preview only</strong> — the Marketplace feature isn\'t live yet. The listings on this page are sample data just to show the design.',
        sidebar: {
          categories: 'Categories',
          catAll: 'All Items',
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
        dashboardBanner: {
          text: 'You can also reach the Marketplace from your Dashboard menu &mdash; manage your shop and orders in the same place you configure the bot.',
          link: 'Go to Dashboard &rarr;',
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
        addBot: 'เพิ่มบอท',
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
          description: 'ตัวอย่างพรีวิวหน้า Marketplace ของ Milo Bot — เลือกซื้อของตกแต่งเซิร์ฟจากครีเอเตอร์คนอื่น หรือเปิดร้านขายเองได้ (ฟีเจอร์นี้ยังไม่เปิดใช้งานจริง)',
        },
        previewStrip: '🔍 <strong>ตัวอย่างพรีวิว</strong> — ฟีเจอร์ Marketplace ยังไม่เปิดใช้งานจริง สินค้าที่เห็นในหน้านี้เป็นข้อมูลตัวอย่างเพื่อโชว์ดีไซน์เท่านั้นครับ',
        sidebar: {
          categories: 'หมวดหมู่',
          catAll: 'สินค้าทั้งหมด',
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
        dashboardBanner: {
          text: 'เข้าถึง Marketplace ได้จากเมนูใน Dashboard ของคุณเช่นกัน &mdash; จัดการร้านค้าและออเดอร์ได้ที่เดียวกับที่ตั้งค่าบอท',
          link: 'ไปที่ Dashboard &rarr;',
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
