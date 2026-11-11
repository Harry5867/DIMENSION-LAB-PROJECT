import './local-auth-gateway.css';

const SESSION_KEY = 'dimension-lab-demo-session';
const PENDING_NOTICE_KEY = 'dimension-lab:root-auth-notice';
const WORKBENCH_LINK_KEY = 'dimension-lab:pending-workbench-link';
const WORKBENCH_AUTH_KEY = 'dimension-lab:pending-workbench-request';
const API = window.location.protocol + '//' + (window.location.hostname || '127.0.0.1') + ':5100';
const CLIENT_HEADER = 'database-workbench';
const accountOrigins = new WeakMap();
let currentUser = null;
let signOutReplay = false;
let stopOpeningAccount = null;
let workbenchLoad = null;
let workbenchImportRequested = false;
let workbenchTrigger = null;

function languageIsVietnamese() {
  return document.querySelector('.welcome-page')?.getAttribute('lang') === 'vi';
}

function showToast(message, tone = 'info', detail = '') {
  let host = document.getElementById('local-auth-notices');
  if (!host) {
    host = document.createElement('div');
    host.id = 'local-auth-notices';
    host.className = 'local-auth-notices';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-relevant', 'additions');
    document.body.append(host);
  }
  const item = document.createElement('section');
  item.className = 'local-auth-toast local-auth-toast--' + tone;
  item.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  const title = document.createElement('strong');
  title.textContent = message;
  item.append(title);
  if (detail) {
    const copy = document.createElement('small');
    copy.textContent = detail;
    item.append(copy);
  }
  host.append(item);
  window.setTimeout(() => {
    item.classList.add('is-leaving');
    window.setTimeout(() => item.remove(), 240);
  }, tone === 'error' ? 6500 : 4300);
}

function formatDuration(value) {
  if (!Number.isFinite(value)) return '—';
  return value < 1000 ? Math.round(value) + ' ms' : (value / 1000).toFixed(2) + ' s';
}

function parseServerTiming(header) {
  const timings = {};
  for (const entry of String(header || '').split(',')) {
    const match = entry.trim().match(/^([a-z-]+);dur=([\d.]+)/i);
    if (match) timings[match[1]] = Number(match[2]);
  }
  return timings;
}

function timingDetail(timings, totalMs) {
  const labels = [
    ['password-hash', 'Băm mật khẩu'],
    ['user-insert', 'Ghi user'],
    ['session-insert', 'Tạo session'],
    ['registration-total', 'Tổng API'],
  ];
  const parts = labels.filter(([key]) => Number.isFinite(timings[key]))
    .map(([key, label]) => label + ' ' + formatDuration(timings[key]));
  parts.push('Trình duyệt ' + formatDuration(totalMs));
  return parts.join(' · ');
}

function completedStages(mode, timingText) {
  const vi = languageIsVietnamese();
  const prefix = mode === 'register'
    ? [
      vi ? 'Thông tin đã được API kiểm tra.' : 'The API accepted the account details.',
      vi ? 'Tài khoản đã được lưu vào MongoDB local.' : 'The account was saved to local MongoDB.',
      vi ? 'Phiên đăng nhập đã được tạo.' : 'The sign-in session was created.',
      vi ? 'Workspace chính đã mở.' : 'The main workspace is open.',
    ]
    : [
      vi ? 'Thông tin đăng nhập đã được kiểm tra.' : 'The API checked the sign-in details.',
      vi ? 'MongoDB đã xác nhận tài khoản.' : 'MongoDB confirmed the account.',
      vi ? 'Phiên đăng nhập đã được tạo.' : 'The sign-in session was created.',
      vi ? 'Workspace chính đã mở.' : 'The main workspace is open.',
    ];
  return prefix.map((message, index) => ({
    message,
    detail: index === 2 ? timingText : '',
  }));
}

function saveCompletionNotice(mode, timings, totalMs) {
  const value = {
    mode,
    timings: timingDetail(timings, totalMs),
    stages: completedStages(mode, timingDetail(timings, totalMs)),
  };
  try { sessionStorage.setItem(PENDING_NOTICE_KEY, JSON.stringify(value)); } catch { /* The UI can still continue without queued notices. */ }
}

function replayCompletedNotices() {
  let pending;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_NOTICE_KEY) || 'null');
    sessionStorage.removeItem(PENDING_NOTICE_KEY);
  } catch { return; }
  if (!pending || !Array.isArray(pending.stages)) return;
  pending.stages.forEach((stage, index) => {
    window.setTimeout(() => showToast(stage.message, 'success', stage.detail), index * 1500);
  });
}

async function apiRequest(path, method, body) {
  const headers = { 'X-Dimension-Lab-Client': CLIENT_HEADER };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const started = performance.now();
  const response = await fetch(API + path, {
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* Report the HTTP status below. */ }
  const elapsedMs = performance.now() - started;
  if (!response.ok || payload?.success !== true) {
    const error = new Error(payload?.error || ('Local API trả HTTP ' + response.status + '.'));
    error.status = response.status;
    throw error;
  }
  return {
    data: payload.data,
    elapsedMs,
    timings: parseServerTiming(response.headers.get('Server-Timing')),
  };
}

function setPanelBusy(panel, busy, message = '') {
  const form = panel.querySelector('form');
  const submit = form?.querySelector('button[type="submit"]');
  const status = panel.querySelector('.local-auth-status');
  if (submit) submit.disabled = busy;
  if (status) {
    status.hidden = !message;
    status.textContent = message;
    status.classList.toggle('is-busy', busy);
  }
}

function showPanelError(panel, message) {
  const error = panel.querySelector('.local-auth-error');
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
}

function validateBeforeRequest(mode, name, email, password) {
  const vi = languageIsVietnamese();
  if (mode === 'register') {
    const parts = name.trim().replace(/\s+/g, ' ').split(' ');
    if (name.trim().length < 5 || parts.length < 2) {
      throw new Error(vi ? 'Hãy nhập họ tên đầy đủ, gồm ít nhất hai phần.' : 'Enter your full name using at least two name parts.');
    }
    if (password.length < 14 || !/\p{Lu}/u.test(password) || !/\p{Ll}/u.test(password)
        || !/\p{N}/u.test(password) || !/[^\p{L}\p{N}\s]/u.test(password)) {
      throw new Error(vi ? 'Mật khẩu cần 14+ ký tự, chữ hoa, chữ thường, số và ký tự đặc biệt.' : 'Use 14+ characters with uppercase, lowercase, a number, and a symbol.');
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(vi ? 'Hãy nhập email hợp lệ.' : 'Enter a valid email address.');
  }
}

async function submitAccountForm(panel) {
  const form = panel.querySelector('form');
  const emailInput = form.querySelector('#login-email');
  const passwordInput = form.querySelector('#login-password');
  const nameInput = form.querySelector('#local-account-name');
  const mode = form.dataset.localAuthMode || 'login';
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const name = nameInput?.value.trim().replace(/\s+/g, ' ') || '';
  const vi = languageIsVietnamese();
  showPanelError(panel, '');
  try {
    validateBeforeRequest(mode, name, email, password);
  } catch (error) {
    showPanelError(panel, error.message);
    return;
  }

  showToast(vi ? 'Thông tin hợp lệ.' : 'Account details passed local checks.', 'info');
  setPanelBusy(panel, true, vi ? 'Đang gửi tới API local…' : 'Sending to the local API…');
  const requestStarted = performance.now();
  const elapsed = window.setInterval(() => {
    const seconds = ((performance.now() - requestStarted) / 1000).toFixed(1);
    setPanelBusy(panel, true, (vi ? 'API đang xử lý · ' : 'API is working · ') + seconds + (vi ? ' giây' : ' s'));
  }, 200);

  try {
    const result = await apiRequest(mode === 'register' ? '/api/auth/register' : '/api/auth/login', 'POST',
      mode === 'register' ? { name, email, password } : { email, password });
    window.clearInterval(elapsed);
    saveCompletionNotice(mode, result.timings, result.elapsedMs);
    const origin = accountOrigins.get(panel);
    try {
      sessionStorage.setItem(SESSION_KEY, 'demo');
      if (origin?.linkOwnerId && result.data?.user?.id) {
        sessionStorage.setItem(WORKBENCH_LINK_KEY, JSON.stringify({ fromUserId: origin.linkOwnerId, ownerId: result.data.user.id }));
      }
    } catch { /* Cookie remains the server auth boundary. */ }
    const next = new URL(window.location.href);
    next.hash = origin?.returnHash || '/overview';
    if (origin) next.searchParams.set('workbench', '1');
    window.history.replaceState(window.history.state, '', next);
    setPanelBusy(panel, false, vi ? 'Đã xác nhận tài khoản và session trong MongoDB. Đang mở workspace…' : 'MongoDB confirmed the account and session. Opening the workspace…');
    showToast(vi ? 'MongoDB đã xác nhận và lưu tài khoản.' : 'MongoDB confirmed and saved the account.', 'success');
    window.setTimeout(() => window.location.reload(), 550);
  } catch (error) {
    window.clearInterval(elapsed);
    const message = error.status === 409
      ? (vi ? 'Email này đã có tài khoản. Hãy chuyển sang Đăng nhập.' : 'This email already has an account. Switch to Sign in.')
      : error.status === 503
        ? (vi ? 'MongoDB/API local chưa sẵn sàng. Kiểm tra dịch vụ MongoDB và local-data API.' : 'Local MongoDB/API is unavailable. Check both local services.')
        : error.message;
    setPanelBusy(panel, false, '');
    showPanelError(panel, message);
    showToast(message, 'error');
  }
}

function enhanceLoginPanel(panel) {
  if (panel.dataset.localAuthReady === 'true') return;
  const form = panel.querySelector('form');
  const title = panel.querySelector('#login-title');
  const submit = form?.querySelector('button[type="submit"]');
  const emailField = form?.querySelector('#login-email')?.closest('.login-field');
  const passwordField = form?.querySelector('#login-password')?.closest('.login-field');
  const demoHost = panel.querySelector('.login-demo');
  if (!form || !title || !submit || !emailField || !passwordField || !demoHost) return;

  const nameField = document.createElement('div');
  nameField.className = 'login-field local-auth-name-field';
  nameField.innerHTML = '<label for="local-account-name">Họ và tên đầy đủ</label><input id="local-account-name" name="fullName" autocomplete="name" maxlength="120" minlength="5" placeholder="Nguyễn Thị Minh Anh">';
  form.insertBefore(nameField, emailField);

  const note = document.createElement('p');
  note.className = 'local-auth-note';
  note.textContent = 'Email chỉ dùng làm tên đăng nhập, không xác minh qua email. Mật khẩu cần tối thiểu 14 ký tự.';
  form.append(note);

  const status = document.createElement('p');
  status.className = 'local-auth-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  form.append(status);

  const error = document.createElement('p');
  error.className = 'login-error local-auth-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  form.append(error);

  demoHost.replaceChildren();
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'lab-action login-demo-action local-auth-toggle';
  demoHost.append(toggle);

  const setMode = (mode) => {
    form.dataset.localAuthMode = mode;
    const register = mode === 'register';
    nameField.hidden = !register;
    nameField.querySelector('input').required = register;
    title.textContent = register ? 'Tạo tài khoản local' : (languageIsVietnamese() ? 'Đăng nhập' : 'Sign in');
    submit.querySelector('span').textContent = register ? 'Tạo tài khoản' : (languageIsVietnamese() ? 'Đăng nhập' : 'Sign in');
    passwordField.querySelector('label').textContent = register ? 'Mật khẩu mạnh' : (languageIsVietnamese() ? 'Mật khẩu' : 'Password');
    const password = passwordField.querySelector('input');
    password.autocomplete = register ? 'new-password' : 'current-password';
    password.minLength = register ? 14 : 1;
    note.hidden = !register;
    error.hidden = true;
    status.hidden = true;
    toggle.textContent = register ? 'Đã có tài khoản? Đăng nhập' : 'Tạo tài khoản local';
  };
  toggle.addEventListener('click', () => setMode(form.dataset.localAuthMode === 'register' ? 'login' : 'register'));
  form.addEventListener('input', () => { error.hidden = true; });
  panel.dataset.localAuthReady = 'true';
  setMode('login');
}

function mountRootAuthEntry() {
  const welcome = document.querySelector('.welcome-page');
  let button = document.getElementById('local-auth-entry');
  if (!welcome || currentUser) {
    button?.remove();
    return;
  }
  if (!button) {
    button = document.createElement('button');
    button.id = 'local-auth-entry';
    button.className = 'local-auth-entry';
    button.type = 'button';
    button.setAttribute('aria-label', 'Mở nhanh form đăng nhập hoặc tạo tài khoản');
    button.addEventListener('click', () => openRootAccount('register'));
    document.body.append(button);
  }
  const label = languageIsVietnamese() ? 'Tạo tài khoản local' : 'Create local account';
  if (button.textContent !== label) button.textContent = label;
  const hidden = Boolean(document.querySelector('.login-panel'));
  if (button.hidden !== hidden) button.hidden = hidden;
}

function openRootAccount(mode, origin) {
  stopOpeningAccount?.();
  const root = document.getElementById('root');
  if (!root) return;

  // An expired session can leave the analysis shell open while the workbench
  // asks for credentials. Reopen the same login form from a signed-out shell.
  if (origin) {
    closeLocalDataView();
    try {
      if (sessionStorage.getItem(SESSION_KEY) === 'demo') {
        sessionStorage.removeItem(SESSION_KEY);
        if (origin.linkOwnerId) sessionStorage.setItem(WORKBENCH_AUTH_KEY, origin.linkOwnerId);
        const next = new URL(window.location.href);
        next.searchParams.set('workbench', mode);
        window.location.replace(next);
        return;
      }
    } catch { /* The welcome form is still available when the tab is signed out. */ }
  }

  let requestedLogin = false;
  const tryOpen = () => {
    const panel = root.querySelector('.login-panel');
    if (panel) {
      enhanceLoginPanel(panel);
      const form = panel.querySelector('form');
      if (form?.dataset.localAuthMode !== mode) panel.querySelector('.local-auth-toggle')?.click();
      if (origin) accountOrigins.set(panel, origin);
      else accountOrigins.delete(panel);
      panel.querySelector(mode === 'register' ? '#local-account-name' : '#login-email')?.focus({ preventScroll: true });
      stopOpeningAccount();
      return;
    }
    const enter = root.querySelector('.welcome-actions .welcome-primary');
    if (!requestedLogin && enter) {
      requestedLogin = true;
      enter.click();
    } else if (!requestedLogin) {
      root.querySelector('.genesis-start')?.click();
    }
  };
  const observer = new MutationObserver(tryOpen);
  const timeout = window.setTimeout(() => {
    stopOpeningAccount();
    showToast('Chưa mở được form tài khoản. Hãy thử lại từ trang gốc.', 'error');
  }, 8000);
  stopOpeningAccount = () => {
    observer.disconnect();
    window.clearTimeout(timeout);
    stopOpeningAccount = null;
  };
  observer.observe(root, { childList: true, subtree: true });
  tryOpen();
}
function addAccountChip(user) {
  const actions = document.querySelector('.portal-header-actions');
  if (actions && !actions.querySelector('.local-account-chip')) {
    const chip = document.createElement('span');
    chip.className = 'local-account-chip';
    chip.textContent = user.name + ' · MongoDB local';
    chip.title = user.email + ' · email chưa xác minh';
    actions.prepend(chip);
  }
  mountLocalDataLauncher();
}

function closeLocalDataView() {
  const host = document.getElementById('dimension-lab-local-data');
  const root = document.getElementById('root');
  const launcher = document.getElementById('local-data-launcher');
  if (!host || host.hidden) return;
  host.hidden = true;
  if (root) root.style.display = '';
  if (launcher) {
    launcher.hidden = false;
    launcher.disabled = false;
    launcher.innerHTML = '<span aria-hidden="true">◉</span><span>Dữ liệu & MongoDB</span>';
  }
  document.title = 'Dimension Lab — Interactive Data Exploration';
  if (workbenchTrigger?.isConnected) workbenchTrigger.focus({ preventScroll: true });
  workbenchTrigger = null;
}

function mountLocalDataLauncher() {
  if (document.getElementById('local-data-launcher')) return;
  const button = document.createElement('button');
  button.id = 'local-data-launcher';
  button.className = 'local-data-launcher';
  button.type = 'button';
  button.innerHTML = '<span aria-hidden="true">◉</span><span>Dữ liệu & MongoDB</span>';
  button.setAttribute('aria-label', 'Mở kho dữ liệu và đồng bộ MongoDB');
  button.addEventListener('click', () => { void openLocalDataView(); });
  document.body.append(button);
}

async function openLocalDataView({ importCsv = false } = {}) {
  const root = document.getElementById('root');
  if (!root) return;
  if (importCsv) workbenchImportRequested = true;
  const launcher = document.getElementById('local-data-launcher');
  const trigger = document.activeElement;
  let host = document.getElementById('dimension-lab-local-data');
  try {
    if (host?.dataset.ready !== 'true') {
      if (launcher) { launcher.disabled = true; launcher.textContent = 'Đang mở kho dữ liệu…'; }
      workbenchLoad ||= loadLocalDataView().finally(() => { workbenchLoad = null; });
      host = await workbenchLoad;
    }
    if (host.hidden) {
      workbenchTrigger = trigger;
      root.style.display = 'none';
      host.hidden = false;
      if (launcher) launcher.hidden = true;
      document.title = 'Dimension Lab — Dữ liệu local';
      if (!workbenchImportRequested) host.shadowRoot.querySelector('.local-data-rootbar button')?.focus();
    }
    const action = workbenchImportRequested ? 'import' : 'view';
    workbenchImportRequested = false;
    window.dispatchEvent(new CustomEvent('dimension-lab:workbench-opened', { detail: { action } }));
  } catch (error) {
    workbenchImportRequested = false;
    if (launcher) { launcher.disabled = false; launcher.textContent = '◉ Dữ liệu & MongoDB'; }
    showToast(error.message, 'error');
  }
}

async function loadLocalDataView() {
  let host;
  let module;
  try {
    const [pageResponse, styleResponse] = await Promise.all([
      fetch('/database.html', { cache: 'no-cache' }),
      fetch('/database.css', { cache: 'no-cache' }),
    ]);
    if (!pageResponse.ok || !styleResponse.ok) throw new Error('Không tải được giao diện data workspace.');
    const [pageMarkup, stylesheet] = await Promise.all([pageResponse.text(), styleResponse.text()]);
    const page = new DOMParser().parseFromString(pageMarkup, 'text/html');
    page.body.querySelectorAll('script,link,style').forEach((node) => node.remove());
    host = document.createElement('div');
    host.id = 'dimension-lab-local-data';
    host.className = 'dimension-lab-local-data';
    host.dataset.theme = localStorage.getItem('dimension-lab-database-theme') || 'dark';
    host.hidden = true;
    const shadow = host.attachShadow({ mode: 'open' });
    const css = stylesheet
      .replaceAll(':root[data-theme="light"]', ':host([data-theme="light"])')
      .replace(/:root\s*\{/g, ':host {');
    shadow.innerHTML = '<style>' + css + `
      :host { position:fixed; inset:0; z-index:9999; display:block; min-height:100vh; overflow:auto; color:var(--text); background:var(--bg); font-family:Inter,system-ui,sans-serif; }
      :host([hidden]) { display:none !important; }
      .local-data-rootbar { position:sticky; top:0; z-index:40; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px clamp(16px,4vw,48px); border-bottom:1px solid var(--stroke); background:rgba(10,10,10,.94); backdrop-filter:blur(18px); }
      :host([data-theme="light"]) .local-data-rootbar { background:rgba(255,255,255,.94); }
      .local-data-rootbar button { border:1px solid var(--stroke-strong); border-radius:10px; padding:8px 12px; color:var(--text); background:var(--surface-2); cursor:pointer; font:600 11px Inter,system-ui,sans-serif; }
      .local-data-rootbar span { color:var(--muted); font:500 10px Inter,system-ui,sans-serif; }
      .local-data-rootbar button:hover { border-color:var(--blue); }
    </style><div class="local-data-rootbar"><button type="button">← Quay lại không gian phân tích</button><span>LOCAL DATA · INDEXEDDB ↔ MONGODB</span></div>` + page.body.innerHTML;
    shadow.querySelector('.local-data-rootbar button').addEventListener('click', closeLocalDataView);
    window.__DIMENSION_LAB_DATABASE_ROOT = shadow;
    document.body.append(host);
    module = document.createElement('script');
    module.type = 'module';
    module.src = '/database.js?embedded=1';
    await new Promise((resolve, reject) => {
      module.onload = resolve;
      module.onerror = () => reject(new Error('Không thể khởi tạo kho dữ liệu local.'));
      document.head.append(module);
    });
    host.dataset.ready = 'true';
    return host;
  } catch (error) {
    module?.remove();
    if (host) {
      host.remove();
      if (window.__DIMENSION_LAB_DATABASE_ROOT === host.shadowRoot) delete window.__DIMENSION_LAB_DATABASE_ROOT;
    }
    throw error;
  }
}

function openWorkbenchFromLocation() {
  const url = new URL(window.location.href);
  const mode = url.searchParams.get('workbench');
  if (!['1', 'login', 'register'].includes(mode)) return;
  url.searchParams.delete('workbench');
  window.history.replaceState(window.history.state, '', url);
  if (mode === '1') {
    void openLocalDataView();
    return;
  }
  let linkOwnerId = null;
  try {
    linkOwnerId = sessionStorage.getItem(WORKBENCH_AUTH_KEY);
    sessionStorage.removeItem(WORKBENCH_AUTH_KEY);
  } catch { /* No offline profile was attached to the request. */ }
  openRootAccount(mode, { linkOwnerId, returnHash: url.hash });
}

async function verifyRootSession() {
  if (sessionStorage.getItem(SESSION_KEY) !== 'demo') return;
  const root = document.getElementById('root');
  if (root) root.dataset.localAuthCheck = 'pending';
  try {
    const response = await fetch(API + '/api/auth/me', { credentials: 'include', cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      window.location.hash = '';
      window.location.reload();
      return;
    }
    if (response.ok && payload?.success === true) {
      currentUser = payload.data.user;
      addAccountChip(currentUser);
      replayCompletedNotices();
      showToast('Phiên của ' + currentUser.name + ' đã được xác nhận bởi MongoDB local.', 'success');
      return;
    }
    showToast('Local API chưa xác nhận session; đang giữ giao diện offline.', 'info');
  } catch {
    showToast('Không kết nối được API local; dữ liệu chỉ đồng bộ khi dịch vụ hoạt động lại.', 'info');
  } finally {
    if (root) delete root.dataset.localAuthCheck;
  }
}

document.addEventListener('submit', (event) => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  const panel = form?.closest('.login-panel');
  if (!form || !panel) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void submitAccountForm(panel);
}, true);

window.addEventListener('dimension-lab:open-workbench', (event) => {
  void openLocalDataView({ importCsv: event.detail?.importCsv === true });
});

window.addEventListener('dimension-lab:workbench-auth-request', (event) => {
  const { mode, linkOwnerId } = event.detail ?? {};
  if (mode !== 'login' && mode !== 'register') return;
  openRootAccount(mode, { linkOwnerId, returnHash: window.location.hash });
});

window.addEventListener('dimension-lab:workbench-stage', (event) => {
  const stage = event.detail || {};
  const completed = ['LOCAL', 'SYNCED', 'CACHED'].includes(stage.state);
  const failed = ['ERROR', 'PENDING'].includes(stage.state);
  const count = Number.isFinite(stage.sent) && stage.sent > 0
    ? stage.sent
    : Number.isFinite(stage.local) ? stage.local : stage.read;
  const detail = [
    Number.isFinite(count) ? new Intl.NumberFormat('vi-VN').format(count) + ' dòng' : '',
    Number.isFinite(stage.warnings) && stage.warnings ? stage.warnings + ' cảnh báo' : '',
    stage.note || '',
  ].filter(Boolean).join(' · ');
  showToast(stage.stage || 'Pipeline dữ liệu', failed ? 'error' : completed ? 'success' : 'info', detail);
});

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target.closest('.portal-signout') : null;
  if (!target || signOutReplay) { signOutReplay = false; return; }
  event.preventDefault();
  event.stopImmediatePropagation();
  target.disabled = true;
  try {
    await apiRequest('/api/auth/logout', 'POST', {});
  } catch {
    showToast('API chưa phản hồi; giao diện sẽ thoát và session local sẽ được kiểm tra lại khi kết nối.', 'info');
  }
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* The server session is already revoked when online. */ }
  currentUser = null;
  window.dispatchEvent(new Event('dimension-lab:workbench-session-ended'));
  // Keep the local workspace reachable after sign-out and during API outages.
  signOutReplay = true;
  target.disabled = false;
  target.click();
}, true);

const observer = new MutationObserver(() => {
  const panel = document.querySelector('.login-panel');
  if (panel) enhanceLoginPanel(panel);
  if (currentUser) addAccountChip(currentUser);
  mountRootAuthEntry();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
mountLocalDataLauncher();
mountRootAuthEntry();
void verifyRootSession().finally(openWorkbenchFromLocation);
