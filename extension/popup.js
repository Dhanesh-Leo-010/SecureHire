// Popup UI: reads state from the background worker. No network access of its own.
const $ = (id) => document.getElementById(id);
$('version').textContent = 'v' + chrome.runtime.getManifest().version;

function render(s) {
  if (!s) return;
  const st = $('status');
  st.textContent = s.active ? (s.localTest ? 'Local test' : 'Monitoring') : 'Idle';
  st.className = 'pill ' + (s.active ? (s.localTest ? 'test' : 'active') : 'idle');
  $('session').textContent = s.sessionId || '—';
  $('started').textContent = s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : '—';
  $('backend').textContent = s.backend || '—';
  $('queued').textContent = s.queued ?? 0;
  const c = s.counts || {};
  $('c-tab').textContent = (c.TAB_HIDDEN || 0) + (c.TAB_SWITCH || 0) + (c.NEW_TAB_OPENED || 0);
  $('c-focus').textContent = c.WINDOW_BLUR || 0;
  $('c-fs').textContent = c.FULLSCREEN_EXIT || 0;
  $('c-clip').textContent = (c.COPY_ATTEMPT || 0) + (c.PASTE_ATTEMPT || 0) + (c.CUT_ATTEMPT || 0);
  $('allowlist').textContent = (s.allowlist || []).join(', ');
  $('stop').hidden = !s.active;
  $('test').hidden = !!s.active;
}
const refresh = () => chrome.runtime.sendMessage({ type: 'POPUP_STATUS' }, render);
$('retry').onclick = () => chrome.runtime.sendMessage({ type: 'POPUP_RETRY' }, refresh);
$('stop').onclick = () => chrome.runtime.sendMessage({ type: 'POPUP_STOP' }, refresh);
$('test').onclick = () => chrome.runtime.sendMessage({ type: 'POPUP_LOCAL_TEST_START' }, (r) => { if (r && !r.ok) alert(r.error); refresh(); });
refresh();
setInterval(refresh, 1000);
