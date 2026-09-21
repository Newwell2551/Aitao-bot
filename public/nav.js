// public/nav.js
// ─────────────────────────────────────────────────────────────────────────
// สคริปต์ของ auth widget (ปุ่ม login / avatar+เมนู มุมขวาบนของ navbar) —
// ใช้ร่วมกันทุกหน้า (index.html, features.html, pricing.html, marketplace.html)
//
// 🆕 [21 ก.ย. 2569] ไฟล์ใหม่ทั้งหมด ตามที่น้องหนาวขอให้มีปุ่ม login ดิสคอร์ด
// โชว์โปรไฟล์มุมขวาบน กดแล้วมีเมนูเลื่อนลงมา (Servers / My Products / Premium
// status / Log out)
//
// ทำงานยังไง (ภาพรวม):
//   1) พอหน้าเว็บโหลดเสร็จ ยิง fetch('/api/me') ไปถาม server.js ว่า "ตอนนี้ใคร
//      login อยู่ (ถ้ามี) และมีเซิร์ฟอะไรบ้าง" — เป็น endpointใหม่ที่เพิ่มคู่กับ
//      ไฟล์นี้ใน server.js (ดูคอมเมนต์ที่ route GET /api/me)
//   2) ถ้ายังไม่ login → วาดปุ่ม "Log in with Discord" เฉยๆ
//   3) ถ้า login อยู่แล้ว → วาดปุ่ม avatar กลมๆ กดแล้วมีแผง dropdown โผล่ลงมา
//      (โปรไฟล์ผู้ใช้ / Servers ที่กางย่อยได้ / My Products / Premium status /
//      Log out)
//
// ⚠️ ไฟล์นี้เป็น "vanilla JS" ล้วนๆ ไม่พึ่งไลบรารีอะไรเลย (ไม่มี React/jQuery)
// เพราะหน้าเว็บ 4 หน้านี้เป็น static HTML ธรรมดา ไม่ได้ตั้ง build step ไว้ —
// เขียนแบบ "แทรก HTML string ตรงๆ" ให้เข้าธีมเดียวกับที่ไฟล์อื่นในโปรเจกต์
// (เช่น utils/renderServerPicker.js) ทำอยู่แล้ว

(function () {
  'use strict';

  // escapeHtml — กัน XSS ตอนเอาชื่อผู้ใช้/ชื่อเซิร์ฟ (ซึ่งมาจาก Discord จริง คนอื่น
  // ตั้งชื่ออะไรมาก็ได้) ไปแทรกลง HTML ตรงๆ — ฟังก์ชันเดียวกับที่ utils/renderServerPicker.js
  // ใช้ฝั่ง server เป๊ะๆ (ทำสำเนามาไว้ที่นี่เพราะไฟล์นี้รันในเบราว์เซอร์ require() ไฟล์
  // ฝั่ง server ข้ามมาใช้ไม่ได้)
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const CHEVRON_SVG =
    '<svg class="auth-menu-chevron" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const DISCORD_MARK_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18.9 6.4a15 15 0 0 0-3.7-1.15l-.2.35a13 13 0 0 1 3.3 1.2 13.6 13.6 0 0 0-12.6 0 13 13 0 0 1 3.3-1.2l-.2-.35A15 15 0 0 0 5.1 6.4C3 9.6 2.4 12.7 2.6 15.75a15 15 0 0 0 4.6 2.3l.6-1a9.7 9.7 0 0 1-1.5-.7c.13-.1.25-.2.37-.3a10.9 10.9 0 0 0 9.7 0c.12.1.24.2.37.3-.47.28-.97.5-1.5.7l.6 1a15 15 0 0 0 4.6-2.3c.24-3.4-.6-6.47-2.5-9.35ZM9.3 14c-.75 0-1.36-.68-1.36-1.5S8.55 11 9.3 11s1.37.68 1.36 1.5c0 .82-.6 1.5-1.36 1.5Zm5.4 0c-.75 0-1.36-.68-1.36-1.5s.6-1.5 1.36-1.5 1.37.68 1.36 1.5c0 .82-.6 1.5-1.36 1.5Z" fill="#f3f1fb"/></svg>';

  function buildLoginHref() {
    // returnTo = path ปัจจุบัน (ไม่รวม query string ก็พอ — หน้าเว็บ 4 หน้านี้ไม่มี query
    // ที่จำเป็นต้องรักษาไว้) ให้ /auth/login พา user กลับมาหน้าเดิมหลัง login เสร็จ แทนที่
    // จะโยนไป /dashboard เฉยๆ ทุกครั้ง (ใช้กลไก ?returnTo= ที่ server.js มีอยู่แล้ว)
    const returnTo = encodeURIComponent(window.location.pathname);
    return '/auth/login?returnTo=' + returnTo;
  }

  function renderLoggedOut(container) {
    container.innerHTML =
      '<a class="auth-login-btn" href="' + buildLoginHref() + '">' +
      DISCORD_MARK_SVG +
      '<span>Log in</span>' +
      '</a>';
  }

  function renderServerRow(server, inviteBaseUrl) {
    const iconHtml = server.iconUrl
      ? '<img class="auth-server-icon" src="' + escapeHtml(server.iconUrl) + '" alt="" loading="lazy" />'
      : '<div class="auth-server-icon"></div>';

    if (server.hasBot) {
      return (
        '<a class="auth-server-row" href="/dashboard/' + encodeURIComponent(server.id) + '">' +
        iconHtml +
        '<span class="auth-server-name">' + escapeHtml(server.name) + '</span>' +
        '</a>'
      );
    }

    // บอทยังไม่ถูกเชิญเข้าเซิร์ฟนี้ → ซีดลง (คลาส .no-bot ใน nav.css) + ลิงก์ไปหน้า
    // เชิญบอทแทน (เติม guild_id + disable_guild_select ต่อท้าย URL เชิญปกติ — พารามิเตอร์
    // ที่ Discord รองรับให้ "เลือกเซิร์ฟเป้าหมายไว้ล่วงหน้า" ในหน้า OAuth ของเขาเลย ผู้ใช้
    // ไม่ต้องมานั่งเลือกเซิร์ฟเองซ้ำ)
    //
    // ⚠️ inviteBaseUrl อาจเป็น null ได้ (ถ้า CLIENT_ID ไม่ได้ตั้งค่าไว้ฝั่ง server — ดู
    // buildInviteUrl() ใน commands/help.js) กันไว้ไม่ให้ลิงก์พัง โชว์เป็นแถวธรรมดาไม่มี
    // ลิงก์แทนถ้าเกิดกรณีนี้ (ไม่ควรเกิดขึ้นจริงในโปรดักชัน แต่กันไว้ไม่ error)
    if (!inviteBaseUrl) {
      return (
        '<div class="auth-server-row no-bot">' +
        iconHtml +
        '<span class="auth-server-name">' + escapeHtml(server.name) + '</span>' +
        '<span class="auth-server-tag">Not invited</span>' +
        '</div>'
      );
    }
    const inviteHref =
      inviteBaseUrl + '&guild_id=' + encodeURIComponent(server.id) + '&disable_guild_select=true';
    return (
      '<a class="auth-server-row no-bot" href="' + escapeHtml(inviteHref) + '" target="_blank" rel="noopener">' +
      iconHtml +
      '<span class="auth-server-name">' + escapeHtml(server.name) + '</span>' +
      '<span class="auth-server-tag">Invite</span>' +
      '</a>'
    );
  }

  function renderLoggedIn(container, data) {
    const servers = Array.isArray(data.servers) ? data.servers : [];
    const serversHtml = servers.length
      ? servers.map((s) => renderServerRow(s, data.inviteUrl)).join('')
      : '<div class="auth-empty-note">You don\'t manage any servers with this Discord account yet.</div>';

    container.innerHTML =
      '<button type="button" class="auth-avatar-btn" id="auth-avatar-btn" aria-haspopup="true" aria-expanded="false">' +
      '<img src="' + escapeHtml(data.user.avatarUrl) + '" alt="" />' +
      '</button>' +
      '<div class="auth-panel" id="auth-panel" role="menu">' +
      '<div class="auth-panel-profile">' +
      '<img src="' + escapeHtml(data.user.avatarUrl) + '" alt="" />' +
      '<span>' + escapeHtml(data.user.username) + '</span>' +
      '</div>' +

      '<button type="button" class="auth-menu-item servers-toggle" id="auth-servers-toggle" aria-expanded="false">' +
      '<span>Servers</span>' + CHEVRON_SVG +
      '</button>' +
      '<div class="auth-servers-list" id="auth-servers-list">' + serversHtml + '</div>' +

      // 🆕 "สินค้าของฉัน" (My Products) — ระบบขายของจริงใน Marketplace ยังไม่มีอยู่จริง
      // เลย (ดู claude/roadmap-marketplace-idea.md — ยังเป็นแค่ไอเดีย ยังไม่เริ่มเขียนโค้ด)
      // ตั้งใจ "ไม่ลิงก์ไปไหนเลย" (disabled) แทนที่จะยิงไปหน้าที่ยังไม่มีข้อมูลจริงรองรับ
      // เพื่อไม่ให้ผู้ใช้กดแล้วเจอหน้าเปล่า/error — ใส่ป้าย "Soon" กำกับให้ชัดเจนแทน
      '<div class="auth-menu-item disabled" title="Marketplace selling is not live yet">' +
      '<span>My Products</span><span class="auth-menu-soon">Soon</span>' +
      '</div>' +

      '<a class="auth-menu-item" href="' + escapeHtml(data.premiumStartUrl) + '">' +
      '<span>Premium status</span>' +
      '</a>' +

      '<div class="auth-menu-divider"></div>' +

      '<a class="auth-menu-item" href="/auth/logout">' +
      '<span>Log out</span>' +
      '</a>' +
      '</div>';

    wireLoggedInInteractions(container);
  }

  function wireLoggedInInteractions(container) {
    const avatarBtn = container.querySelector('#auth-avatar-btn');
    const panel = container.querySelector('#auth-panel');
    const serversToggle = container.querySelector('#auth-servers-toggle');
    const serversList = container.querySelector('#auth-servers-list');

    function closePanel() {
      panel.classList.remove('open');
      avatarBtn.setAttribute('aria-expanded', 'false');
    }

    // เปิด/ปิด dropdown หลัก ตอนกดปุ่ม avatar
    avatarBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const isOpen = panel.classList.toggle('open');
      avatarBtn.setAttribute('aria-expanded', String(isOpen));
    });

    // เปิด/ปิดรายชื่อเซิร์ฟ (submenu ย่อยของ "Servers") — แยกอิสระจากการเปิด/ปิด
    // panel หลัก กดปุ่มนี้แล้ว panel หลักไม่ควรปิดตาม เลยต้อง stopPropagation ด้วย
    serversToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      const isOpen = serversList.classList.toggle('open');
      serversToggle.setAttribute('aria-expanded', String(isOpen));
    });

    // คลิกที่อื่นนอก widget → ปิด dropdown (พฤติกรรมมาตรฐานของเมนู dropdown ทั่วไป)
    document.addEventListener('click', function (e) {
      if (!container.contains(e.target)) closePanel();
    });

    // กด Esc → ปิด dropdown (เพื่อการเข้าถึง/ใช้คีย์บอร์ดได้สะดวก)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
    });
  }

  function initAuthWidget() {
    const container = document.getElementById('auth-widget');
    if (!container) return; // หน้านี้ไม่มี auth widget (ไม่ควรเกิดขึ้น แต่กันไว้ไม่ให้ error)

    fetch('/api/me', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.loggedIn) {
          renderLoggedIn(container, data);
        } else {
          renderLoggedOut(container);
        }
      })
      .catch(function (err) {
        // เรียก API ไม่สำเร็จ (เน็ตหลุด/server พัง ฯลฯ) — ไม่ทำให้ทั้งหน้าเว็บพังตาม
        // แค่ fallback เป็นปุ่ม login เฉยๆ (กดแล้วไปหน้า login จริงตามปกติ ไม่ต่างจาก
        // ไม่รู้สถานะ login เลย ปลอดภัยที่สุด)
        console.error('[nav] เรียก /api/me ไม่สำเร็จ:', err);
        renderLoggedOut(container);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthWidget);
  } else {
    initAuthWidget();
  }
})();
