const $ = (s) => document.querySelector(s);
let files = [];
const loginScreen = $('#login-screen');
const formatBytes = (bytes) => { if (!bytes) return '0 B'; const units = ['B','KB','MB','GB']; const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3); return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`; };
const formatDate = (iso) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
const ext = (name) => (name.split('.').pop() || 'file').slice(0, 4).toUpperCase();
const escapeHtml = (s) => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function iconFor(name) { const e = ext(name); return ['ZIP','RAR','7Z','TAR'].includes(e) ? '▰' : ['PDF'].includes(e) ? '▤' : ['MP4','MOV'].includes(e) ? '▶' : '▱'; }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); }
function render() {
  const query = $('#search').value.toLowerCase(); const filter = $('#filter').value;
  const now = Date.now(); const visible = files.filter(f => f.originalName.toLowerCase().includes(query)).filter(f => filter === 'all' || (filter === 'active' ? !f.expired : f.expired));
  $('#file-list').innerHTML = visible.length ? visible.map(f => `<article class="file-row ${f.expired ? 'expired' : ''}"><div class="file-main"><div class="file-icon">${iconFor(f.originalName)}</div><div><strong>${escapeHtml(f.originalName)}</strong><span>${formatBytes(f.size)} <i>•</i> Added ${formatDate(f.createdAt)}</span></div></div><div class="file-link"><span class="status-dot ${f.expired ? 'off' : ''}"></span><span>${f.expired ? 'Expired' : `Expires ${formatDate(f.expiresAt)}`}</span></div><div class="download-meta"><b>${(f.downloads || []).length}</b><span>downloads</span></div><div class="row-actions"><button class="copy-button" data-copy="${escapeHtml(f.shareUrl)}" ${f.expired ? 'disabled' : ''}>▣ Copy link</button><button class="more-button" data-id="${f.id}" aria-label="More options">•••</button></div></article>`).join('') : `<div class="empty-state"><div>◌</div><h3>${query || filter !== 'all' ? 'No matching files' : 'Your vault is empty'}</h3><p>${query || filter !== 'all' ? 'Try another search or filter.' : 'Upload your first file to create an expiring share link.'}</p></div>`;
  $('#nav-count').textContent = files.length; $('#file-count').textContent = files.length; $('#active-count').textContent = files.filter(f => !f.expired).length; $('#download-count').textContent = files.reduce((n, f) => n + (f.downloads || []).length, 0);
  const used = files.reduce((n, f) => n + f.size, 0); $('#storage-label').textContent = `${formatBytes(used)} / 3 GB`; $('#storage-progress').style.width = `${Math.min(100, used / (3 * 1024 ** 3) * 100)}%`;
  document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = '▣ Copy link', 1800); }));
  document.querySelectorAll('.more-button').forEach(btn => btn.addEventListener('click', () => showActions(btn.dataset.id)));
}
async function load() { const res = await fetch('api/files'); files = await res.json(); render(); }
function showActions(fileId) { const f = files.find(x => x.id === fileId); if (!f) return; const action = prompt(`Actions for ${f.originalName}\n\nType: renew, week, month, or delete`); if (!action) return; if (action === 'delete' && confirm('Delete this file and its link?')) fetch(`api/files/${fileId}`, { method: 'DELETE' }).then(load); else if (action === 'renew') fetch(`api/files/${fileId}/renew`, { method: 'POST' }).then(r => r.json()).then(x => { toast(`New link created for ${x.originalName}`); load(); }); else if (['week','month'].includes(action)) fetch(`api/files/${fileId}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ expiry: action }) }).then(() => { toast('Lifespan updated'); load(); }); }
const dialog = $('#upload-dialog');
$('#open-upload').onclick = () => { $('#upload-form').reset(); $('#selected-file').textContent = ''; $('#upload-status').textContent = ''; dialog.showModal(); };
$('#close-upload').onclick = $('#cancel-upload').onclick = () => dialog.close();
$('#file-input').onchange = () => { const f = $('#file-input').files[0]; if (f) { $('#file-label').textContent = f.name; $('#selected-file').textContent = `${formatBytes(f.size)} selected`; } };
$('#dropzone').ondragover = (e) => { e.preventDefault(); $('#dropzone').classList.add('dragging'); };
$('#dropzone').ondragleave = () => $('#dropzone').classList.remove('dragging');
$('#dropzone').ondrop = (e) => { e.preventDefault(); $('#dropzone').classList.remove('dragging'); $('#file-input').files = e.dataTransfer.files; $('#file-input').onchange(); };
$('#upload-form').onsubmit = async (e) => { e.preventDefault(); const file = $('#file-input').files[0]; if (!file) return; if (file.size > 3 * 1024 ** 3) { $('#upload-status').textContent = 'That file is over the 3 GB limit.'; return; } const data = new FormData(e.target); data.append('file', file); $('#upload-status').textContent = 'Uploading…'; const res = await fetch('api/files', { method: 'POST', body: data }); if (!res.ok) { $('#upload-status').textContent = 'Upload failed. Please try again.'; return; } const created = await res.json(); dialog.close(); toast(`Share link ready for ${created.originalName}`); await load(); };
$('#search').oninput = render; $('#filter').onchange = render;

async function checkAuth() { const res = await fetch('api/me'); const state = await res.json(); loginScreen.classList.toggle('hidden', state.authenticated); if (state.authenticated) load(); }
$('#login-form').onsubmit = async (e) => { e.preventDefault(); const res = await fetch('api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ password: $('#password').value }) }); if (res.ok) { $('#password').value = ''; $('#login-error').textContent = ''; loginScreen.classList.add('hidden'); load(); } else { $('#login-error').textContent = 'Incorrect password. Try again.'; } };
$('#logout').onclick = async () => { await fetch('api/logout', { method:'POST' }); loginScreen.classList.remove('hidden'); };
checkAuth();
