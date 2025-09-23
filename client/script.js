import account from './scripts/accounts.js';

function isTouchDevice () {
  if ('ontouchstart' in window) return true;

  // eslint-disable-next-line no-undef
  return window.DocumentTouch && document instanceof DocumentTouch;
}

const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
for (const tooltipTriggerEl of tooltipTriggerList) {
  if (isTouchDevice()) continue;

  // eslint-disable-next-line no-new
  new bootstrap.Tooltip(tooltipTriggerEl);
}

account.getUsername().then(username => {
  if (username) {
    document.getElementById('login-link').textContent = username;
    document.getElementById('login-link').href = '/user/my-profile';
  }
});

// UI customizations for SBReader branding and simplified navbar
try {
  // Update document title branding
  if (document && typeof document.title === 'string') {
    if (/QB\s*Reader/i.test(document.title)) {
      document.title = document.title.replace(/QB\s*Reader/gi, 'SBReader');
    } else if (!document.title || document.title.trim() === '') {
      document.title = 'SBReader';
    }
  }

  // Update brand from QBReader -> SBReader
  const prefix = document.querySelector('#logo .logo-prefix');
  const suffix = document.querySelector('#logo .logo-suffix');
  if (prefix) prefix.textContent = 'SB';
  if (suffix) suffix.textContent = 'Reader';

  // Normalize login text to "Login" when not authenticated
  const loginLink = document.getElementById('login-link');
  if (loginLink && loginLink.textContent.trim().toLowerCase() === 'log in') {
    loginLink.textContent = 'Login';
  }

  // Reduce top navbar options to only Single Player and Multiplayer
  const nav = document.querySelector('#navbarSupportedContent .navbar-nav.me-auto');
  if (nav) {
    // Clear existing children
    while (nav.firstChild) nav.removeChild(nav.firstChild);

    const links = [
      { href: '/singleplayer/', text: 'Single Player' },
      { href: '/multiplayer/', text: 'Multiplayer' }
    ];

    for (const { href, text } of links) {
      const a = document.createElement('a');
      a.className = 'nav-link';
      a.href = href;
      a.textContent = text;
      if (window.location.pathname.startsWith(href)) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
      nav.appendChild(a);
    }
  }
} catch (e) {
  // Fail silently if structure differs on some pages
}
