import { createCsvParser, uniqueHeaders } from './csv-parser.js';

const API = window.location.protocol + '//' + (window.location.hostname || '127.0.0.1') + ':5100';
const ROOT = window.__DIMENSION_LAB_DATABASE_ROOT || document;
const EMBEDDED = ROOT !== document;
const DB_NAME = 'dimension-lab-local-workspace';
const ACCOUNT_LINK_KEY = 'dimension-lab:pending-workbench-link';
const STANDALONE_LINK_KEY = 'dimension-lab:pending-workbench-request';
const BATCH = 500;
const MAX_BATCH_BYTES = 3 * 1024 * 1024;
const encoder = new TextEncoder();
const state = {
  db: null, profile: null, authenticated: false, mongo: false, datasets: [],
  active: null, rows: [], after: -1, query: '', busy: false, syncing: false,
  replaceMode: false, lastPipelineNoticeKey: null, selection: 0, listRequest: 0, caching: new Map(),
};
let workbenchReady = false;
let importRequested = false;
const $ = (id) => ROOT.querySelector('#' + id);
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const keyFor = (userId, id) => userId + ':' + id;

function notice(message, error = false) {
  const box = $('global-notice');
  box.textContent = message;
  box.classList.toggle('error', error);
  box.hidden = false;
}
function clearNotice() { $('global-notice').hidden = true; }

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'userId' });
      if (!db.objectStoreNames.contains('datasets')) db.createObjectStore('datasets', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('rows')) {
        const rows = db.createObjectStore('rows', { keyPath: 'key' });
        rows.createIndex('datasetKey', 'datasetKey');
        rows.createIndex('datasetRow', ['datasetKey', 'rowIndex'], { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB không mở được.'));
  });
}
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction thất bại.'));
  });
}
function reqResult(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request thất bại.'));
  });
}
async function get(store, key) {
  const tx = state.db.transaction(store, 'readonly');
  const done = txDone(tx);
  const result = await reqResult(tx.objectStore(store).get(key));
  await done;
  return result || null;
}
async function all(store) {
  const tx = state.db.transaction(store, 'readonly');
  const done = txDone(tx);
  const result = await reqResult(tx.objectStore(store).getAll());
  await done;
  return result;
}
async function put(store, value) {
  const tx = state.db.transaction(store, 'readwrite');
  const done = txDone(tx);
  tx.objectStore(store).put(value);
  await done;
}
async function del(store, key) {
  const tx = state.db.transaction(store, 'readwrite');
  const done = txDone(tx);
  tx.objectStore(store).delete(key);
  await done;
}
async function putRows(rows) {
  if (!rows.length) return;
  const tx = state.db.transaction('rows', 'readwrite');
  const done = txDone(tx);
  const store = tx.objectStore('rows');
  rows.forEach((row) => store.put(row));
  await done;
}
async function rowsAfter(datasetKey, after, limit) {
  const tx = state.db.transaction('rows', 'readonly');
  const done = txDone(tx);
  const index = tx.objectStore('rows').index('datasetRow');
  const range = IDBKeyRange.bound([datasetKey, after + 1], [datasetKey, Number.MAX_SAFE_INTEGER]);
  const rows = await new Promise((resolve, reject) => {
    const values = [];
    const request = index.openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || values.length >= limit) return resolve(values);
      values.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error('Không đọc được dòng local.'));
  });
  await done;
  return rows;
}
async function deleteDatasetRows(datasetKey) {
  const tx = state.db.transaction('rows', 'readwrite');
  const done = txDone(tx);
  const index = tx.objectStore('rows').index('datasetKey');
  await new Promise((resolve, reject) => {
    const request = index.openCursor(IDBKeyRange.only(datasetKey));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve();
      cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error('Không xóa được dòng local.'));
  });
  await done;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('X-Dimension-Lab-Client', 'database-workbench');
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(API + path, { ...options, headers, credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  let payload = null;
  try { payload = await response.json(); } catch { /* API may be unavailable. */ }
  if (!response.ok || !payload || payload.success !== true) {
    const error = new Error(payload?.error || ('Local API trả HTTP ' + response.status + '.'));
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

function setConnection(kind, label) {
  const pill = $('connection-pill');
  pill.classList.remove('is-checking', 'is-online', 'is-offline', 'is-error');
  pill.classList.add(kind);
  $('connection-text').textContent = label;
}
function pipeline(info) {
  $('pipeline-card').classList.remove('hidden');
  for (const [key, id] of [['stage', 'pipeline-stage'], ['state', 'pipeline-state'], ['read', 'rows-read'], ['local', 'rows-local'], ['sent', 'rows-sent'], ['warnings', 'warning-count'], ['note', 'pipeline-note']]) {
    if (info[key] !== undefined) $(id).textContent = ['read', 'local', 'sent', 'warnings'].includes(key) ? fmt(info[key]) : info[key];
  }
  let percent = null;
  if (Number.isFinite(info.bytes) && Number.isFinite(info.totalBytes) && info.totalBytes > 0) percent = info.bytes * 100 / info.totalBytes;
  else if (Number.isFinite(info.sent) && Number.isFinite(info.totalRows) && info.totalRows > 0) percent = info.sent * 100 / info.totalRows;
  if (percent !== null) $('pipeline-bar').style.width = Math.max(0, Math.min(100, percent)) + '%';
  else if (info.indeterminate) $('pipeline-bar').style.width = '28%';
  const noticeKey = info.state + ':' + info.stage;
  if (state.lastPipelineNoticeKey !== noticeKey) {
    state.lastPipelineNoticeKey = noticeKey;
    window.dispatchEvent(new CustomEvent('dimension-lab:workbench-stage', {
      detail: { ...info, datasetId: state.active?.id || null, occurredAt: new Date().toISOString() },
    }));
  }
}

async function userDatasets(userId) {
  return (await all('datasets'))
    .filter((dataset) => dataset.ownerId === userId && !dataset.pendingDelete)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
function renderList() {
  const host = $('dataset-list');
  host.replaceChildren();
  const visible = state.datasets.filter((dataset) => !dataset.pendingDelete);
  $('empty-library').classList.toggle('hidden', visible.length > 0);
  $('dataset-total').textContent = fmt(visible.length);
  for (const dataset of visible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dataset-item' + (state.active?.id === dataset.id ? ' active' : '');
    const ready = dataset.syncStatus === 'synced';
    button.innerHTML = '<span class="dataset-file-icon">CSV</span><span class="dataset-item-copy"><strong>'
      + escapeHtml(dataset.name) + '</strong><small>' + fmt(dataset.rowCount) + ' dòng · '
      + (ready ? 'Đã đồng bộ' : 'Chờ đồng bộ') + '</small></span><span class="dataset-state '
      + (ready ? 'ready' : '') + '" aria-label="' + (ready ? 'Đã đồng bộ' : 'Chờ đồng bộ') + '"></span>';
    button.addEventListener('click', () => chooseDataset(dataset.id));
    host.append(button);
  }
}
async function metrics() {
  if (!state.profile) return;
  const datasets = await userDatasets(state.profile.userId);
  const pending = datasets.filter((dataset) => dataset.syncStatus !== 'synced');
  $('local-count').textContent = fmt(datasets.length) + ' dataset';
  $('pending-count').textContent = fmt(pending.reduce((sum, item) => sum + (Number(item.rowCount) || 0), 0)) + ' dòng';
  $('pending-detail').textContent = pending.length ? fmt(pending.length) + ' dataset đang chờ' : 'Không có thay đổi local đang chờ';
}
function renderWorkspace(profile) {
  if (state.profile?.userId !== profile.userId) {
    state.active = null; state.rows = []; state.datasets = [];
    $('active-dataset-title').textContent = 'Chọn một dataset';
    $('active-dataset-meta').textContent = 'Bản xem trước được đọc từ IndexedDB hoặc MongoDB.';
    $('dataset-actions').classList.add('hidden');
    $('table-wrap').replaceChildren();
  }
  state.profile = profile;
  $('auth-screen').classList.add('hidden');
  $('workspace').classList.remove('hidden');
  $('profile-line').textContent = profile.name + ' · ' + profile.email
    + (profile.localOnly ? ' · workspace local chưa liên kết tài khoản' : '');
  updateAccountAction();
  localStorage.setItem('dimension-lab:last-user', profile.userId);
  refreshDatasets().catch((error) => notice(error.message, true));
}
function showAuth() {
  $('workspace').classList.add('hidden');
  $('auth-screen').classList.remove('hidden');
}
function updateAccountAction() {
  const button = $('link-account');
  button.classList.toggle('hidden', state.authenticated);
  button.textContent = state.profile?.localOnly ? 'Liên kết tài khoản' : 'Đăng nhập để đồng bộ';
}

function resetAccountWorkspace() {
  const userId = state.profile?.userId;
  if (userId && !state.profile.localOnly && localStorage.getItem('dimension-lab:last-user') === userId) {
    localStorage.removeItem('dimension-lab:last-user');
  }
  state.authenticated = false;
  state.profile = null;
  state.active = null;
  state.rows = [];
  state.datasets = [];
  $('conflict-card').classList.add('hidden');
  $('pipeline-card').classList.add('hidden');
  clearNotice();
  showAuth();
}
async function refreshDatasets() {
  if (!state.profile) return;
  const request = ++state.listRequest;
  const ownerId = state.profile.userId;
  const allLocal = (await all('datasets')).filter((dataset) => dataset.ownerId === ownerId);
  const local = allLocal.filter((dataset) => !dataset.pendingDelete)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const deletedIds = new Set(allLocal.filter((dataset) => dataset.pendingDelete).map((dataset) => dataset.id));
  let remote = [];
  if (state.authenticated && state.mongo) {
    try { remote = await api('/api/datasets?' + new URLSearchParams({ expectedOwnerId: ownerId })); } catch { /* Keep the offline list. */ }
  }
  if (state.profile?.userId !== ownerId || request !== state.listRequest) return;
  const byId = new Map(local.map((item) => [item.id, item]));
  remote.forEach((item) => {
    if (item.ownerId === ownerId && !deletedIds.has(item.id) && !byId.has(item.id)) byId.set(item.id, {
      ...item, key: keyFor(ownerId, item.id), ownerId,
      columns: item.columns || [], baseRevision: item.revision || 0, revision: item.revision || 0,
      syncStatus: 'synced', remoteOnly: true,
    });
  });
  state.datasets = [...byId.values()];
  const active = state.active && byId.get(state.active.id);
  if (active && !active.remoteOnly) {
    state.active = active;
    $('active-dataset-meta').textContent = fmt(active.rowCount) + ' dòng · ' + active.filename + ' · revision ' + (active.revision || active.baseRevision || 0);
  }
  renderList();
  await metrics();
  if (!state.active && state.datasets.length) await chooseDataset(state.datasets[0].id);
}

async function cacheRemote(dataset) {
  pipeline({ stage: 'Tải bản ghi server vào thiết bị', state: 'CACHE', read: 0, local: 0, sent: 0, warnings: 0, indeterminate: true, note: 'Đang tải các batch có thật từ MongoDB.' });
  const meta = {
    key: dataset.key, ownerId: dataset.ownerId, id: dataset.id,
    name: dataset.name, filename: dataset.filename, columns: dataset.columns || [],
    rowCount: Number(dataset.rowCount) || 0, baseRevision: dataset.revision || 0,
    revision: dataset.revision || 0, syncStatus: 'synced', updatedAt: dataset.updatedAt,
  };
  await deleteDatasetRows(meta.key);
  let after = -1, received = 0;
  while (true) {
    const query = new URLSearchParams({ limit: String(BATCH), after: String(after), expectedRevision: String(meta.revision), expectedOwnerId: meta.ownerId });
    const page = await api('/api/datasets/' + encodeURIComponent(meta.id) + '/rows?' + query);
    if (!page.rows.length) break;
    await putRows(page.rows.map((row) => ({
      key: meta.key + '|' + row.recordId, datasetKey: meta.key, ownerId: meta.ownerId,
      datasetId: meta.id, recordId: row.recordId, rowIndex: row.rowIndex, values: row.values,
    })));
    received += page.rows.length;
    after = page.rows[page.rows.length - 1].rowIndex;
    pipeline({ stage: 'Tải bản ghi server vào thiết bị', state: 'CACHE', read: received, local: received, sent: 0, warnings: 0, note: 'Đã nhận ' + fmt(received) + ' / ' + fmt(meta.rowCount) + ' dòng.' });
    if (page.rows.length < BATCH) break;
  }
  if (received !== meta.rowCount) throw new Error('Số dòng đã tải khác với revision của MongoDB. Hãy thử lại.');
  await put('datasets', meta);
  pipeline({ stage: 'Đã tải bản ghi server', state: 'CACHED', read: received, local: received, sent: 0, warnings: 0, note: 'MongoDB đã xác nhận ' + fmt(received) + ' dòng trong IndexedDB.' });
  return meta;
}
async function chooseDataset(id) {
  clearNotice();
  const selection = ++state.selection;
  let dataset = state.datasets.find((item) => item.id === id);
  if (!dataset) return;
  try {
    if (dataset.remoteOnly) {
      const key = dataset.key;
      let pending = state.caching.get(key);
      if (!pending) {
        pending = cacheRemote(dataset).finally(() => state.caching.delete(key));
        state.caching.set(key, pending);
      }
      dataset = await pending;
    }
  } catch (error) {
    if (selection === state.selection) notice('Không tải được dataset từ MongoDB: ' + error.message, true);
    return;
  }
  if (selection !== state.selection || dataset.ownerId !== state.profile?.userId) return;
  state.active = dataset;
  state.rows = [];
  state.after = -1;
  $('active-dataset-title').textContent = dataset.name;
  $('active-dataset-meta').textContent = fmt(dataset.rowCount) + ' dòng · ' + dataset.filename + ' · revision ' + (dataset.revision || dataset.baseRevision || 0);
  $('dataset-actions').classList.remove('hidden');
  $('pipeline-card').classList.add('hidden');
  $('conflict-card').classList.toggle('hidden', !dataset.lastConflict);
  if (dataset.lastConflict) $('conflict-text').textContent = fmt(dataset.lastConflict.archivedRows) + ' dòng của revision server ' + dataset.lastConflict.serverRevision + ' đã được lưu trước khi áp dụng bản offline.';
  renderList();
  await loadPreview(false);
}
async function loadPreview(append) {
  if (!state.active) return;
  const rows = await rowsAfter(state.active.key, append ? state.after : -1, 100);
  if (!append) state.rows = [];
  state.rows.push(...rows);
  if (rows.length) state.after = rows[rows.length - 1].rowIndex;
  renderTable();
}
function renderTable() {
  const dataset = state.active;
  if (!dataset) return;
  const columns = (dataset.columns || []).slice(0, 14);
  const query = state.query;
  const rows = state.rows.filter((row) => !query || columns.some((column) => String(row.values?.[column] ?? '').toLowerCase().includes(query)));
  $('table-range').textContent = fmt(rows.length) + ' dòng xem · ' + fmt(dataset.rowCount) + ' tổng';
  if (!rows.length) {
    $('table-wrap').innerHTML = '<div class="table-empty">' + (state.rows.length ? 'Không có dòng khớp.' : 'Chưa có dòng local.') + '</div>';
    $('load-more').classList.toggle('hidden', state.rows.length >= dataset.rowCount);
    return;
  }
  let html = '<table class="data-table"><thead><tr><th>#</th><th>recordId</th>';
  columns.forEach((column) => { html += '<th>' + escapeHtml(column) + '</th>'; });
  html += '</tr></thead><tbody>';
  rows.forEach((row) => {
    html += '<tr><td class="row-index">' + fmt(row.rowIndex + 1) + '</td><td class="row-index">' + escapeHtml(row.recordId) + '</td>';
    columns.forEach((column) => {
      const value = row.values?.[column] ?? '';
      html += '<td title="' + escapeHtml(value) + '">' + escapeHtml(value) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  $('table-wrap').innerHTML = html;
  $('load-more').classList.toggle('hidden', state.rows.length >= dataset.rowCount);
  $('table-caption').textContent = 'Đang hiển thị ' + fmt(state.rows.length) + ' / ' + fmt(dataset.rowCount)
    + ' dòng; mỗi bản ghi giữ recordId và rowIndex. Bảng hiển thị tối đa 14 cột.';
}

async function importCsv(file, replaceId = null) {
  if (!state.profile || state.busy || state.syncing) return;
  if (!file || !/\.csv$/i.test(file.name)) { notice('Hãy chọn file .csv.', true); return; }
  state.busy = true;
  const id = 'ds_' + crypto.randomUUID().replaceAll('-', '');
  const ownerId = state.profile.userId;
  const key = keyFor(ownerId, id);
  const previous = replaceId ? state.datasets.find((item) => item.id === replaceId) : null;
  const meta = {
    key, ownerId, id, name: file.name.replace(/\.csv$/i, '').slice(0, 180),
    filename: file.name.slice(0, 255), columns: [], rowCount: 0, baseRevision: null,
    revision: 0, syncStatus: 'reading', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  let count = 0, stored = 0, warnings = 0, bytes = 0, columns = null, batch = [], queued = false;
  const parser = createCsvParser();
  state.active = meta;
  $('active-dataset-title').textContent = meta.name;
  $('active-dataset-meta').textContent = 'Đang đọc ' + file.name;
  $('dataset-actions').classList.add('hidden');
  $('table-wrap').innerHTML = '<div class="table-empty">Đang đọc file theo luồng và lưu theo batch.</div>';
  const consume = async (records) => {
    for (const cells of records) {
      if (!columns) {
        const header = uniqueHeaders(cells);
        columns = header.columns; warnings += header.warnings; meta.columns = columns;
        await put('datasets', meta); continue;
      }
      if (cells.length !== columns.length) warnings += 1;
      const values = Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? '']));
      batch.push({
        key: key + '|row_' + count, datasetKey: key, ownerId,
        datasetId: id, recordId: 'row_' + count, rowIndex: count, values,
      });
      count += 1;
      if (batch.length === 250) {
        await putRows(batch); stored += batch.length; batch = [];
      }
    }
  };
  try {
    await put('datasets', meta);
    if (!file.stream) throw new Error('Cần trình duyệt mới có hỗ trợ File Streams.');
    const reader = file.stream().getReader();
    const decoder = new TextDecoder('utf-8');
    pipeline({ stage: 'Đọc CSV', state: 'READ', read: 0, local: 0, sent: 0, warnings: 0, bytes: 0, totalBytes: file.size, note: 'Byte và dòng được đếm từ file thực tế.' });
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      await consume(parser.push(decoder.decode(item.value, { stream: true })));
      pipeline({ stage: 'Đọc CSV', state: 'READ', read: count, local: stored, sent: 0, warnings, bytes, totalBytes: file.size, note: 'Đã đọc ' + fmt(bytes) + ' / ' + fmt(file.size) + ' byte.' });
    }
    await consume(parser.push(decoder.decode(), true));
    if (!columns) throw new Error('CSV không có hàng tiêu đề.');
    if (batch.length) { await putRows(batch); stored += batch.length; }
    meta.columns = columns; meta.rowCount = count; meta.syncStatus = 'pending'; meta.updatedAt = new Date().toISOString();
    await put('datasets', meta);
    if (previous) {
      previous.pendingDelete = true; previous.syncStatus = 'pending-delete'; previous.deleteAfterSync = id;
      await put('datasets', previous);
    }
    queued = true;
    if (state.profile?.userId !== ownerId) return;
    state.active = meta;
    state.datasets = await userDatasets(ownerId);
    state.rows = await rowsAfter(key, -1, 100);
    state.after = state.rows.length ? state.rows[state.rows.length - 1].rowIndex : -1;
    renderList(); renderTable(); await metrics();
    pipeline({ stage: 'Đã lưu trên thiết bị', state: 'LOCAL', read: count, local: stored, sent: 0, warnings, bytes: file.size, totalBytes: file.size, note: warnings ? fmt(warnings) + ' cảnh báo về tiêu đề/trật tự số cột.' : 'Không phát hiện lệch số cột trong các dòng đã đọc.' });
    notice('Đã lưu ' + fmt(count) + ' dòng vào IndexedDB. Hàng đợi sẽ đồng bộ khi tài khoản và MongoDB local sẵn sàng.');
  } catch (error) {
    if (!queued) {
      meta.syncStatus = 'error'; meta.error = error.message; meta.rowCount = stored;
      await put('datasets', meta);
    }
    pipeline({ stage: 'Import dừng', state: 'ERROR', read: count, local: stored, sent: 0, warnings, indeterminate: true, note: error.message + ' Dữ liệu local đã ghi vẫn được giữ.' });
    notice('Import chưa hoàn tất: ' + error.message + ' Bản ghi local được giữ để khôi phục.', true);
  } finally {
    state.busy = false;
    await refreshDatasets();
    if (state.active) await chooseDataset(state.active.id);
  }
  if (queued) await syncPending();
}

function encodeBatch(syncId, rows) {
  const payload = [];
  let bytes = 100;
  for (const { recordId, rowIndex, values } of rows) {
    const row = JSON.stringify({ recordId, rowIndex, values });
    const size = encoder.encode(row).byteLength + 1;
    if (payload.length && bytes + size > MAX_BATCH_BYTES) break;
    payload.push(row);
    bytes += size;
  }
  return { count: payload.length, body: '{"syncId":' + JSON.stringify(syncId) + ',"rows":[' + payload.join(',') + ']}' };
}

async function syncOne(dataset) {
  const query = '?' + new URLSearchParams({ expectedOwnerId: dataset.ownerId });
  const syncId = dataset.syncId || crypto.randomUUID().replaceAll('-', '');
  const total = Number(dataset.rowCount) || 0;
  let sent = 0;
  try {
    if (dataset.pendingDelete) {
      try { await api('/api/datasets/' + encodeURIComponent(dataset.id) + query, { method: 'DELETE' }); }
      catch (error) { if (error.status !== 404) throw error; }
      await deleteDatasetRows(dataset.key); await del('datasets', dataset.key);
      window.dispatchEvent(new Event('dimension-lab:workbench-datasets-changed'));
      return;
    }
    dataset.syncId = syncId; dataset.syncStatus = 'syncing'; await put('datasets', dataset);
    pipeline({ stage: 'Gửi thông tin dataset', state: 'SYNC', read: total, local: total, sent: 0, warnings: 0, totalRows: total, note: 'Chỉ tính đã đồng bộ sau khi MongoDB xác nhận từng batch.' });
    const start = await api('/api/datasets/sync/start' + query, {
      method: 'POST',
      body: JSON.stringify({
        syncId, baseRevision: dataset.baseRevision === undefined ? null : dataset.baseRevision,
        dataset: { id: dataset.id, name: dataset.name, filename: dataset.filename, columns: dataset.columns, rowCount: total },
      }),
    });
    if (start.completed) sent = total;
    let after = -1;
    while (sent < total) {
      const batch = await rowsAfter(dataset.key, after, BATCH);
      if (!batch.length) throw new Error('Thiếu dòng local; không hoàn tất đồng bộ.');
      const payload = encodeBatch(syncId, batch);
      const accepted = await api('/api/datasets/' + encodeURIComponent(dataset.id) + '/rows/batch' + query, {
        method: 'POST', body: payload.body,
      });
      if (accepted.receivedRows !== payload.count) throw new Error('MongoDB chưa xác nhận toàn bộ batch; dữ liệu vẫn được giữ trên thiết bị.');
      sent += payload.count; after = batch[payload.count - 1].rowIndex;
      pipeline({ stage: 'Gửi dòng lên MongoDB', state: 'SYNC', read: total, local: total, sent, warnings: 0, totalRows: total, note: 'MongoDB đã xác nhận nhận ' + fmt(sent) + ' / ' + fmt(total) + ' dòng.' });
    }
    const finished = await api('/api/datasets/' + encodeURIComponent(dataset.id) + '/sync/finish' + query, {
      method: 'POST', body: JSON.stringify({ syncId }),
    });
    dataset.baseRevision = finished.revision; dataset.revision = finished.revision;
    dataset.syncId = null; dataset.syncStatus = 'synced'; dataset.syncedAt = finished.syncedAt;
    dataset.updatedAt = new Date().toISOString(); dataset.pendingDelete = false;
    delete dataset.error;
    if (start.conflict) dataset.lastConflict = { archivedRows: start.archivedRows, serverRevision: start.serverRevision };
    await put('datasets', dataset);
    window.dispatchEvent(new Event('dimension-lab:workbench-datasets-changed'));
    pipeline({ stage: 'MongoDB ghi xong', state: 'SYNCED', read: total, local: total, sent, warnings: 0, totalRows: total, note: fmt(sent) + ' dòng · revision ' + finished.revision + (start.conflict ? ' · bản server đã được lưu.' : '') });
    if (start.conflict) {
      $('conflict-card').classList.remove('hidden');
      $('conflict-text').textContent = fmt(start.archivedRows) + ' dòng của revision server ' + start.serverRevision + ' đã lưu; bản offline được áp dụng.';
    }
  } catch (error) {
    dataset.syncStatus = dataset.pendingDelete ? 'pending-delete' : 'pending';
    dataset.error = error.message; await put('datasets', dataset);
    pipeline({ stage: 'Chờ thử lại', state: 'PENDING', read: total, local: total, sent, warnings: 0, totalRows: total, note: error.message + ' Bản local vẫn được giữ.' });
    notice('Chưa đồng bộ xong: ' + error.message + ' Bản local được giữ để thử lại.', true);
    if (error.status === 401) state.authenticated = false;
  }
}
async function syncPending() {
  if (!state.profile || !state.authenticated || !state.mongo || state.syncing || state.busy) return;
  state.syncing = true;
  const ownerId = state.profile.userId;
  try {
    const pending = (await all('datasets'))
      .filter((item) => item.ownerId === ownerId && ['pending', 'syncing', 'pending-delete'].includes(item.syncStatus))
      .sort((a, b) => Number(Boolean(a.pendingDelete)) - Number(Boolean(b.pendingDelete)));
    for (const dataset of pending) {
      if (!state.authenticated || !state.mongo || state.profile?.userId !== ownerId) break;
      if (dataset.deleteAfterSync) {
        const replacement = await get('datasets', keyFor(ownerId, dataset.deleteAfterSync));
        if (replacement?.syncStatus !== 'synced') continue;
      }
      await syncOne(dataset);
    }
    await refreshDatasets();
  } finally {
    state.syncing = false;
  }
}

async function updateConnection() {
  try {
    const health = await api('/api/health');
    state.mongo = Boolean(health.mongoConnected);
    setConnection(state.mongo ? 'is-online' : 'is-error', state.mongo ? 'MongoDB local · hoạt động' : 'MongoDB chưa kết nối');
    $('mongo-metric').textContent = state.mongo ? 'Đang hoạt động' : 'Chưa kết nối';
    $('mongo-detail').textContent = state.mongo ? 'Ping ' + health.latencyMs + ' ms · 127.0.0.1:27017' : 'Local API đang chờ MongoDB';
  } catch {
    state.mongo = false;
    if (navigator.onLine) {
      setConnection('is-error', 'Local API không phản hồi');
      $('mongo-metric').textContent = 'API chưa chạy';
      $('mongo-detail').textContent = 'Khởi động Node local-data service';
    } else {
      setConnection('is-offline', 'Offline · lưu trên thiết bị');
      $('mongo-metric').textContent = 'Offline';
      $('mongo-detail').textContent = 'Thay đổi được giữ trong IndexedDB';
    }
  }
  if (state.profile) await metrics();
  if (state.mongo && state.profile && !state.profile.localOnly) {
    const profileId = state.profile.userId;
    try {
      const session = await api('/api/auth/me');
      if (state.profile?.userId !== profileId) return;
      if (session.user.id !== profileId) {
        resetAccountWorkspace();
        return;
      }
      state.authenticated = true;
    } catch (error) {
      if (state.profile?.userId !== profileId) return;
      if (error.status === 401 || error.status === 403) {
        resetAccountWorkspace();
        return;
      }
      state.authenticated = false;
    }
    if (state.authenticated) await syncPending();
  }
  updateAccountAction();
}

async function transferOffline(oldUserId, user) {
  if (!oldUserId || oldUserId === user.id) return;
  const datasets = (await all('datasets')).filter((item) => item.ownerId === oldUserId);
  for (const dataset of datasets) {
    const oldKey = dataset.key, newKey = keyFor(user.id, dataset.id);
    let after = -1;
    while (true) {
      const batch = await rowsAfter(oldKey, after, BATCH);
      if (!batch.length) break;
      await putRows(batch.map((row) => ({ ...row, key: newKey + '|' + row.recordId, datasetKey: newKey, ownerId: user.id })));
      after = batch[batch.length - 1].rowIndex;
    }
    const syncStatus = ['reading', 'error', 'pending-delete'].includes(dataset.syncStatus) ? dataset.syncStatus : 'pending';
    await put('datasets', { ...dataset, key: newKey, ownerId: user.id, syncStatus, localOnly: false });
    await deleteDatasetRows(oldKey); await del('datasets', oldKey);
  }
}

async function linkPendingOfflineWorkspace(user) {
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem(ACCOUNT_LINK_KEY)); } catch { return; }
  if (!pending) return;
  if (pending.ownerId === user.id && typeof pending.fromUserId === 'string') {
    const profile = await get('profiles', pending.fromUserId);
    if (profile?.localOnly) {
      await transferOffline(profile.userId, user);
      notice('Đã liên kết dữ liệu trên thiết bị với tài khoản Dimension Lab.');
    }
  }
  sessionStorage.removeItem(ACCOUNT_LINK_KEY);
}

function requestAccountForm(mode, linkOwnerId = null) {
  if (EMBEDDED) {
    window.dispatchEvent(new CustomEvent('dimension-lab:workbench-auth-request', { detail: { mode, linkOwnerId } }));
    return;
  }
  if (linkOwnerId) sessionStorage.setItem(STANDALONE_LINK_KEY, linkOwnerId);
  else sessionStorage.removeItem(STANDALONE_LINK_KEY);
  window.location.assign('/?workbench=' + mode);
}

async function importOffline() {
  const cached = (await all('profiles')).find((profile) => profile.localOnly);
  if (cached) {
    renderWorkspace(cached);
    return;
  }
  const profile = {
    userId: 'offline_' + crypto.randomUUID().replaceAll('-', ''),
    email: 'local@dimension.lab', name: 'Workspace trên thiết bị', role: 'local',
    localOnly: true, createdAt: new Date().toISOString(),
  };
  await put('profiles', profile);
  renderWorkspace(profile);
  notice('Workspace local đã mở. Dataset sẽ được giữ trên thiết bị cho tới khi bạn liên kết tài khoản.');
}

async function focusImport() {
  if (!workbenchReady || !importRequested) return;
  importRequested = false;
  if (!state.profile) await importOffline();
  $('drop-zone').scrollIntoView({ block: 'nearest' });
  $('csv-input').focus({ preventScroll: true });
}
async function logout() {
  const ownerId = state.profile?.userId;
  try {
    if (state.authenticated && ownerId) {
      await api('/api/auth/logout?' + new URLSearchParams({ expectedOwnerId: ownerId }), { method: 'POST', body: '{}' });
    }
  } catch { /* Keep the local copy. */ }
  resetAccountWorkspace();
  window.dispatchEvent(new Event('dimension-lab:workbench-session-ended'));
  notice('Đăng xuất xong. Dataset local vẫn được giữ.');
}
async function renameDataset() {
  if (!state.active || state.syncing || state.busy) return;
  const name = window.prompt('Tên mới', state.active.name);
  if (!name?.trim()) return;
  state.active.name = name.trim().slice(0, 180);
  state.active.syncId = null;
  state.active.syncStatus = 'pending'; state.active.updatedAt = new Date().toISOString();
  await put('datasets', state.active);
  await refreshDatasets(); await chooseDataset(state.active.id);
  if (state.authenticated && state.mongo) await syncPending();
}
async function deleteDataset() {
  if (!state.active || state.syncing || state.busy || !window.confirm('Đánh dấu xóa dataset này? Bản local chỉ bị dọn sau khi server xác nhận.')) return;
  state.active.pendingDelete = true; state.active.syncStatus = 'pending-delete';
  await put('datasets', state.active); state.active = null;
  $('active-dataset-title').textContent = 'Chọn một dataset';
  $('active-dataset-meta').textContent = 'Bản xem trước được đọc từ IndexedDB hoặc MongoDB.';
  $('dataset-actions').classList.add('hidden');
  $('table-wrap').innerHTML = '<div class="table-empty">Đang chờ MongoDB xác nhận xóa.</div>';
  await refreshDatasets(); await syncPending();
}

function theme(value) {
  if (ROOT.host) ROOT.host.dataset.theme = value;
  else document.documentElement.dataset.theme = value;
  localStorage.setItem('dimension-lab-database-theme', value);
}
function bindDropZone() {
  const zone = $('drop-zone');
  ['dragenter', 'dragover'].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault(); zone.classList.remove('dragover');
    if (name === 'drop' && event.dataTransfer?.files?.[0]) importCsv(event.dataTransfer.files[0], state.replaceMode ? state.active?.id : null);
  }));
}

$('workbench-sign-in').addEventListener('click', () => requestAccountForm('login'));
$('workbench-register').addEventListener('click', () => requestAccountForm('register'));
$('offline-start').addEventListener('click', () => importOffline().catch((error) => {
  $('auth-error').textContent = error.message;
  $('auth-error').hidden = false;
}));
$('sync-now').addEventListener('click', syncPending);
$('sign-out').addEventListener('click', logout);
$('link-account').addEventListener('click', () => {
  requestAccountForm('login', state.profile?.localOnly ? state.profile.userId : null);
});
$('refresh-list').addEventListener('click', refreshDatasets);
$('rename-dataset').addEventListener('click', renameDataset);
$('delete-dataset').addEventListener('click', deleteDataset);
$('replace-dataset').addEventListener('click', () => { state.replaceMode = true; $('csv-input').click(); });
$('csv-input').addEventListener('change', (event) => {
  const file = event.target.files?.[0], replaceId = state.replaceMode ? state.active?.id : null;
  state.replaceMode = false; event.target.value = '';
  if (file) importCsv(file, replaceId);
});
$('load-more').addEventListener('click', () => loadPreview(true));
$('table-search').addEventListener('input', (event) => { state.query = event.target.value.trim().toLowerCase(); renderTable(); });
$('theme-toggle').addEventListener('click', () => theme((ROOT.host?.dataset.theme || document.documentElement.dataset.theme) === 'dark' ? 'light' : 'dark'));
if (EMBEDDED) $('sign-out').classList.add('hidden');

window.addEventListener('dimension-lab:workbench-opened', (event) => {
  if (event.detail?.action === 'import') {
    importRequested = true;
    void focusImport().catch((error) => notice(error.message, true));
  }
  if (workbenchReady) void updateConnection().catch(() => {});
});
window.addEventListener('dimension-lab:workbench-session-ended', () => {
  if (state.profile && !state.profile.localOnly) resetAccountWorkspace();
});

async function openInDimensionLab() {
  if (EMBEDDED) return false;
  try {
    const response = await fetch('/', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    if (!response.ok || !/\bid=["']root["']/i.test(await response.text())) return false;
    window.location.replace('/?workbench=1');
    return true;
  } catch { return false; }
}

async function init() {
  if (await openInDimensionLab()) return;
  try { state.db = await openDb(); }
  catch (error) { setConnection('is-error', 'IndexedDB không khả dụng'); $('auth-error').textContent = error.message; $('auth-error').hidden = false; return; }
  theme(localStorage.getItem('dimension-lab-database-theme') || 'dark');
  let user;
  let allowCachedAccount = true;
  try {
    const session = await api('/api/auth/me');
    user = session.user;
  } catch (error) {
    allowCachedAccount = error.status !== 401 && error.status !== 403;
  }
  if (user) {
    const profile = { ...user, userId: user.id, localOnly: false };
    await put('profiles', profile);
    state.authenticated = true;
    renderWorkspace(profile);
    try {
      await linkPendingOfflineWorkspace(user);
    } catch (error) {
      notice('Chưa liên kết được dữ liệu trên thiết bị. Bản local vẫn được giữ. ' + error.message, true);
    }
  } else {
    const last = localStorage.getItem('dimension-lab:last-user');
    const profile = last ? await get('profiles', last) : null;
    if (profile && (profile.localOnly || allowCachedAccount)) renderWorkspace(profile);
  }
  bindDropZone();
  workbenchReady = true;
  await focusImport();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/database-sw.js').catch(() => {});
  await updateConnection();
  window.setInterval(() => updateConnection().catch(() => {}), 12000);
  window.addEventListener('online', () => updateConnection().catch(() => {}));
  window.addEventListener('offline', () => {
    state.mongo = false; setConnection('is-offline', 'Offline · lưu trên thiết bị'); metrics().catch(() => {});
  });
}
void init().catch((error) => {
  const box = state.profile ? $('global-notice') : $('auth-error');
  box.textContent = error.message;
  box.hidden = false;
});

