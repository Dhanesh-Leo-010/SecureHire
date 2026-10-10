// SecureHire content script — runs only on allowlisted SecureHire origins (see manifest matches).
// It forwards event TYPES to the background worker only while this tab is the active, consented session tab.
// It never reads clipboard data, keystrokes, form values or page text.
(() => {
  let monitored = false;
  const send = (eventType, details = {}) => {
    if (!monitored) return;
    try { chrome.runtime.sendMessage({ type: 'CONTENT_EVENT', eventType, details }); } catch { /* extension reloaded */ }
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'MONITOR_ON') monitored = true;
    if (msg?.type === 'MONITOR_OFF') monitored = false;
  });
  // Recover state after a page reload during an active session.
  try { chrome.runtime.sendMessage({ type: 'IS_MONITORED_TAB' }, (r) => { if (!chrome.runtime.lastError && r?.monitored) monitored = true; }); } catch { /* ignore */ }

  document.addEventListener('visibilitychange', () => send(document.hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE'), true);
  window.addEventListener('blur', () => send('WINDOW_BLUR'), true);
  window.addEventListener('focus', () => send('WINDOW_FOCUS'), true);
  document.addEventListener('fullscreenchange', () => send(document.fullscreenElement ? 'FULLSCREEN_ENTER' : 'FULLSCREEN_EXIT'), true);
  // Attempts only — the event object is not inspected for its data.
  document.addEventListener('copy', () => send('COPY_ATTEMPT'), true);
  document.addEventListener('cut', () => send('CUT_ATTEMPT'), true);
  document.addEventListener('paste', () => send('PASTE_ATTEMPT'), true);
  document.addEventListener('contextmenu', () => send('CONTEXT_MENU'), true);
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toUpperCase();
    if (k === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C'].includes(k))) send('DEVTOOLS_SHORTCUT');
    else if ((e.ctrlKey || e.metaKey) && k === 'P') send('PRINT_ATTEMPT');
  }, true);
})();
