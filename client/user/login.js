import account from '../scripts/accounts.js';

account.deleteUsername();

const form = document.getElementById('login-form');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  event.stopPropagation();
  form.classList.add('was-validated');

  if (!form.checkValidity()) {
    return;
  }

  document.getElementById('submission').textContent = 'Logging in...';

  const username = document.getElementById('username').value;
  fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: document.getElementById('password').value
    })
  }).then(async function (response) {
    if (response.status === 200) {
      const { expires, username: accountUsername } = await response.json();
      account.setUsername(accountUsername || username, expires);
      if (window.location.search.length > 1) {
        window.location.href = decodeURIComponent(window.location.search.slice(1));
      } else {
        window.location.href = '/singleplayer/science-bowl/';
      }
    } else {
      document.getElementById('submission').textContent = 'Login';
      document.getElementById('password').value = '';
      window.alert('Invalid Steamcoach username or password.');
    }
  });
}, false);
