/*
 * crpath-feedback.js  v1.2 (2026-09-13) -- hidden by default; three ways to toggle; unsaved-work guard
 *
 * The bar is OFF unless one of these is true, so the same file serves a clean demo and a
 * feedback session with no second copy to keep in sync:
 *   1. the URL contains ?feedback   (…/k12/?feedback   -- also #feedback; ?feedback=0 forces off)
 *   2. Ctrl+Alt+F  (Cmd+Alt+F on a Mac) toggles it any time
 *   3. three quick taps on the page's first heading  (for phones and tablets)
 * The choice is remembered for the tab, so a refresh keeps it. The X on the bar hides it again.
 * Set autoShow: true in window.CRFEEDBACK to have a page start with the bar showing.
 * Stakeholder "feedback and feel" layer for DEMO builds only.
 *
 * What it does: lets a reviewer edit the words on the page, flag a sentence and
 * attach a note to it, keep general notes per page, edit placeholders, and export
 * everything as one JSON bundle (download + clipboard). Nothing is written back to
 * the page file: the bundle is applied to the repo source later (apply_feedback.py
 * or by hand), so prod and demo stay in lockstep and every change is reviewed.
 *
 * Activation: the page must define window.CRFEEDBACK before loading this file,
 * OR its <title> must start with "[DEMO]". Prod and SCORM builds never load it.
 *
 * window.CRFEEDBACK = {
 *   name:      'CR Path Module 0 vK demo',          // label in the bundle
 *   selectors: '.page h1, .page p, ...',            // what becomes editable
 *   exclude:   '#demo-card *, .prev-answer *',      // never editable
 *   pageOf:    function (el) { return 'page 14'; }  // optional page label
 * };
 */
(function () {
  'use strict';
  var cfg = window.CRFEEDBACK || null;
  if (!cfg && !/^\[DEMO\]/.test(document.title || '')) return;
  cfg = cfg || {};
  var NAME = cfg.name || document.title || 'demo';
  var SEL  = cfg.selectors || 'h1,h2,h3,h4,p,li,label,th,td,summary';
  var EXCL = cfg.exclude || '';
  var STORE_KEY  = 'crfeedback:' + (location.pathname || '') + ':' + NAME;
  var ENABLE_KEY = 'crfeedback:on:' + (location.pathname || '') + ':' + NAME;
  var VERSION = '1.2';

  // ---------- state ----------
  var state = { session: '', edits: {}, notes: [], editing: false, flagging: false, saved: true };
  function storedOn() { try { return sessionStorage.getItem(ENABLE_KEY); } catch (e) { return null; } }
  function rememberOn(v) { try { sessionStorage.setItem(ENABLE_KEY, v ? '1' : '0'); } catch (e) {} }
  var urlFlag = /[?&#]feedback(=([^&#]*))?/.exec(location.search + location.hash);
  var urlWants = urlFlag ? !/^(0|off|false|no)$/i.test(urlFlag[2] || '') : null;
  var enabled = urlWants !== null ? urlWants : (storedOn() !== null ? storedOn() === '1' : cfg.autoShow === true);
  try { var saved = sessionStorage.getItem(STORE_KEY); if (saved) { var s = JSON.parse(saved); state.session = s.session || ''; state.edits = s.edits || {}; state.notes = s.notes || []; } } catch (e) {}
  function persist() { try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ session: state.session, edits: state.edits, notes: state.notes })); } catch (e) {} }

  // ---------- helpers ----------
  function hash(str) { var h = 5381, i; for (i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function norm(t) { return (t || '').replace(/\s+/g, ' ').trim(); }
  function pageOf(el) {
    if (typeof cfg.pageOf === 'function') { try { return cfg.pageOf(el) || ''; } catch (e) {} }
    var p = el.closest && (el.closest('[data-page]') || el.closest('section'));
    if (!p) return '';
    if (p.getAttribute('data-page')) return 'page ' + p.getAttribute('data-page');
    var secs = document.querySelectorAll('section'); for (var i = 0; i < secs.length; i++) if (secs[i] === p) return 'screen ' + (i + 1);
    return '';
  }
  function keyOf(el, origText) {
    var page = pageOf(el), tag = el.tagName.toLowerCase();
    var scope = el.closest && (el.closest('[data-page]') || el.closest('section')) || document.body;
    var same = scope.querySelectorAll(tag), idx = 0;
    for (var i = 0; i < same.length; i++) { if (same[i] === el) { idx = i; break; } }
    return page + '|' + tag + '|' + idx + '|' + hash(norm(origText));
  }
  function editables() {
    var els = [].slice.call(document.querySelectorAll(SEL)), out = [];
    els.forEach(function (el) {
      if (EXCL && el.matches && el.matches(EXCL)) return;
      if (el.querySelector && el.querySelector('input,select,textarea,button,details')) return;
      if (el.closest && el.closest('#crfb-bar,#crfb-drawer,#demo-banner,#demo-toggle,#pnav,#ed-bar')) return;
      out.push(el);
    });
    return out;
  }
  function cleanHTML(html) {
    return html.replace(/\s?contenteditable="[^"]*"/g, '').replace(/\s?data-ed="[^"]*"/g, '').replace(/\s?data-crfb-key="[^"]*"/g, '');
  }
  function ensureOrig(el) {
    if (!el.__crfbOrig) el.__crfbOrig = { text: el.textContent, html: cleanHTML(el.innerHTML) };
    if (!el.getAttribute('data-crfb-key')) el.setAttribute('data-crfb-key', keyOf(el, el.__crfbOrig.text));
    return el.__crfbOrig;
  }

  // ---------- styles ----------
  var st = document.createElement('style'); st.id = 'crfb-style';
  st.textContent = [
    'body.crfb-editing [data-ed]{cursor:text}','body.crfb-editing button[data-ed]{cursor:pointer;outline:2px dashed rgba(184,134,11,.8)}',
    'body.crfb-editing [data-ed]:hover{outline:2px dashed rgba(184,134,11,.8);outline-offset:3px;border-radius:3px}',
    'body.crfb-editing [data-ed]:focus{outline:2px solid #1b5091;outline-offset:3px;background:rgba(255,255,255,.6);border-radius:3px}',
    '[data-ed].crfb-changed{box-shadow:inset 3px 0 0 #B8860B;padding-left:6px}',
    'body.crfb-flagging [data-ed]{cursor:crosshair}',
    'body.crfb-flagging [data-ed]:hover{outline:2px solid #c0392b;outline-offset:3px;border-radius:3px}',
    '.crfb-flag{display:inline-block;background:#c0392b;color:#fff;font:700 10px/1 Arial,sans-serif;padding:3px 6px;border-radius:9px;margin-left:6px;vertical-align:middle;cursor:pointer}',
    '#crfb-bar{position:fixed;top:32px;right:10px;z-index:10000;display:flex;gap:6px;align-items:center;background:rgba(27,37,89,.96);color:#fff;padding:6px 8px;border-radius:22px;box-shadow:0 4px 18px rgba(0,0,0,.35);font:600 12px "Segoe UI",Arial,sans-serif}',
    '#crfb-bar button{background:rgba(255,255,255,.16);color:#fff;border:0;padding:6px 10px;border-radius:16px;font:700 12px "Segoe UI",Arial,sans-serif;cursor:pointer;white-space:nowrap}',
    '#crfb-bar button.on{background:#B8860B}',
    '#crfb-bar button:hover{background:rgba(255,255,255,.34)}',
    '#crfb-bar .crfb-count{font-weight:400;opacity:.9;padding:0 4px}',
    '#crfb-drawer{position:fixed;right:0;top:0;bottom:0;width:360px;max-width:100vw;z-index:9999;background:#fff;color:#1b2559;box-shadow:-6px 0 24px rgba(0,0,0,.25);display:none;flex-direction:column;font:14px "Segoe UI",Arial,sans-serif}',
    '#crfb-drawer.open{display:flex}',
    '#crfb-drawer header{background:#1b2559;color:#fff;padding:12px 14px;font-weight:700;display:flex;justify-content:space-between;align-items:center}',
    '#crfb-drawer header button{background:transparent;color:#fff;border:0;font-size:18px;cursor:pointer}',
    '#crfb-drawer .crfb-body{padding:12px 14px;overflow:auto;flex:1}',
    '#crfb-drawer label{display:block;font-size:12px;font-weight:700;color:#4a4636;margin:10px 0 4px}',
    '#crfb-drawer input,#crfb-drawer textarea{width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid #cfc9b8;border-radius:6px}',
    '#crfb-drawer textarea{min-height:80px}',
    '#crfb-drawer .crfb-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}',
    '#crfb-drawer .crfb-actions button{background:#1b2559;color:#fff;border:0;padding:8px 12px;border-radius:6px;font:700 13px "Segoe UI",Arial,sans-serif;cursor:pointer}',
    '#crfb-drawer .crfb-actions button.ghost{background:#e7e3d6;color:#1b2559}',
    '#crfb-drawer .crfb-note{border:1px solid #e7e3d6;border-radius:8px;padding:8px 10px;margin:8px 0;font-size:13px}',
    '#crfb-drawer .crfb-note .crfb-meta{font-size:11px;color:#6b6660;margin-bottom:4px;display:flex;justify-content:space-between}',
    '#crfb-drawer .crfb-note .crfb-quote{border-left:3px solid #c0392b;padding-left:8px;color:#4a4636;font-style:italic;margin:4px 0}',
    '#crfb-drawer .crfb-note button{background:transparent;border:0;color:#c0392b;cursor:pointer;font-size:12px}',
    '#crfb-drawer .crfb-edit{border-left:3px solid #B8860B;padding:4px 8px;margin:6px 0;font-size:12px;color:#4a4636}',
    '#crfb-drawer .crfb-edit s{color:#999}',
    '#crfb-drawer h4{margin:14px 0 4px;font-size:13px;color:#1b2559}',
    '.crfb-ph-btn{display:inline-block;background:#B8860B;color:#fff;font:700 11px/1 Arial,sans-serif;padding:4px 7px;border-radius:9px;margin:2px 0 6px;cursor:pointer;border:0}',
    '@media (max-width:720px){#crfb-drawer{top:auto;width:100vw;max-height:60vh;border-radius:14px 14px 0 0}#crfb-bar{top:auto;bottom:70px;right:8px}}',
    '@media print{#crfb-bar,#crfb-drawer,.crfb-flag,.crfb-ph-btn{display:none!important}}'
  ].join('');
  document.head.appendChild(st);

  // ---------- bar ----------
  var bar = document.createElement('div'); bar.id = 'crfb-bar';
  bar.innerHTML = '<button id="crfb-edit" title="Edit the words on this page">\u270E Edit</button>'
    + '<button id="crfb-flag" title="Tap a sentence, then write what they said about it">\u2691 Flag</button>'
    + '<button id="crfb-notes" title="Notes for this session">\u2630 Notes <span class="crfb-count" id="crfb-ncount">0</span></button>'
    + '<button id="crfb-save" title="Download + copy the feedback bundle">\u2B07 Save</button>'
    + '<button id="crfb-hide" title="Hide this bar (Ctrl+Alt+F brings it back)">\u2715</button>';
  document.body.appendChild(bar);

  // ---------- drawer ----------
  var drawer = document.createElement('div'); drawer.id = 'crfb-drawer';
  drawer.innerHTML = '<header><span>Feedback &mdash; ' + escapeHTML(NAME) + '</span><button id="crfb-close" title="Close">\u2715</button></header>'
    + '<div class="crfb-body">'
    + '<label for="crfb-session">Session (who, where)</label><input id="crfb-session" placeholder="e.g., CPC faculty, Sept 15">'
    + '<label for="crfb-note">Note <span id="crfb-note-ctx" style="font-weight:400;color:#6b6660"></span></label>'
    + '<div id="crfb-quote" class="crfb-quote" style="display:none;border-left:3px solid #c0392b;padding-left:8px;color:#4a4636;font-style:italic;font-size:13px;margin:0 0 6px"></div>'
    + '<textarea id="crfb-note" placeholder="What they said, in their words if you can."></textarea>'
    + '<div class="crfb-actions"><button id="crfb-add">Add note</button><button class="ghost" id="crfb-unflag" style="display:none">Drop flag</button></div>'
    + '<h4>Notes</h4><div id="crfb-notelist"></div>'
    + '<h4>Edits on this page</h4><div id="crfb-editlist"></div>'
    + '<div class="crfb-actions" style="margin-top:14px"><button class="ghost" id="crfb-clear">Clear everything</button></div>'
    + '<p style="font-size:11px;color:#6b6660;margin-top:14px">Kept in this tab only until you Save. Nothing here is sent anywhere.</p>'
    + '</div>';
  document.body.appendChild(drawer);

  var $ = function (id) { return document.getElementById(id); };
  var pendingFlag = null;   // { key, page, excerpt, el }

  function escapeHTML(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var lastTouched = null;
  document.addEventListener('focusin', function (e) { if (e.target && e.target.closest && !e.target.closest('#crfb-bar,#crfb-drawer')) lastTouched = e.target; }, true);
  document.addEventListener('pointerdown', function (e) { if (e.target && e.target.closest && !e.target.closest('#crfb-bar,#crfb-drawer')) lastTouched = e.target; }, true);
  function currentPage() {
    var vis = [].slice.call(document.querySelectorAll('[data-page]')).filter(function (p) { return p.offsetParent !== null && !p.classList.contains('hidden'); });
    if (vis.length) return 'page ' + vis[0].getAttribute('data-page');
    if (lastTouched) return pageOf(lastTouched);
    return '';
  }

  // ---------- edit mode ----------
  function editOn() {
    editables().forEach(function (el) { ensureOrig(el); if (el.tagName !== 'BUTTON') el.setAttribute('contenteditable', 'true'); el.setAttribute('data-ed', '1'); });
    document.body.classList.add('crfb-editing'); state.editing = true; $('crfb-edit').classList.add('on');
    placeholderButtons(true);
    if (document.execCommand) { try { document.execCommand('defaultParagraphSeparator', false, 'br'); } catch (e) {} }
  }
  function editOff() {
    [].slice.call(document.querySelectorAll('[data-ed]')).forEach(function (el) { el.removeAttribute('contenteditable'); el.removeAttribute('data-ed'); });
    document.body.classList.remove('crfb-editing'); state.editing = false; $('crfb-edit').classList.remove('on');
    placeholderButtons(false);
  }
  function recordEdit(el) {
    var o = ensureOrig(el), key = el.getAttribute('data-crfb-key');
    var after = norm(el.textContent), before = norm(o.text);
    if (after === before) { delete state.edits[key]; el.classList.remove('crfb-changed'); }
    else {
      state.edits[key] = { key: key, page: pageOf(el), tag: el.tagName.toLowerCase(), before: before, after: after, beforeHTML: o.html, afterHTML: cleanHTML(el.innerHTML), ts: new Date().toISOString() };
      el.classList.add('crfb-changed');
    }
    state.saved = false; persist(); renderLists();
  }
  document.addEventListener('input', function (e) { var t = e.target; if (t && t.hasAttribute && t.hasAttribute('data-ed')) recordEdit(t); });
  document.addEventListener('keydown', function (e) {
    if (!state.editing) return;
    var t = e.target;
    if (t && t.hasAttribute && t.hasAttribute('data-ed')) {
      if (e.key === 'Enter') { e.preventDefault(); if (document.execCommand) document.execCommand('insertLineBreak'); recordEdit(t); }
      if (e.key === 'Escape') t.blur();
      e.stopPropagation();   // keep the host page's keyboard shortcuts out of the way
    }
  }, true);
  // While editing or flagging, taps on editable text must not trigger the page's own click handlers.
  document.addEventListener('click', function (e) {
    var t = e.target, ed = t && t.closest && t.closest('[data-ed]');
    if (state.flagging) {
      var cand = t && t.closest && t.closest(SEL);
      if (cand && editables().indexOf(cand) !== -1) { e.preventDefault(); e.stopPropagation(); setFlag(cand); }
      return;
    }
    if (state.editing && ed) { e.stopPropagation(); if (ed.closest('label')) e.preventDefault(); if (ed.tagName === 'BUTTON') { e.preventDefault(); promptEdit(ed); } }
  }, true);
  function promptEdit(el) {
    var o = ensureOrig(el), cur = norm(el.textContent);
    var v = window.prompt('Button text:', cur); if (v === null) return;
    var tn = null; for (var i = 0; i < el.childNodes.length; i++) { var c = el.childNodes[i]; if (c.nodeType === 3 && norm(c.nodeValue)) { tn = c; break; } }
    if (tn) tn.nodeValue = ' ' + v + ' '; else el.textContent = v;
    recordEdit(el);
  }

  // ---------- placeholders ----------
  function placeholderButtons(on) {
    [].slice.call(document.querySelectorAll('.crfb-ph-btn')).forEach(function (b) { b.parentNode.removeChild(b); });
    if (!on) return;
    [].slice.call(document.querySelectorAll('input[placeholder],textarea[placeholder]')).forEach(function (f) {
      if (f.closest('#crfb-drawer,#demo-card')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'crfb-ph-btn'; b.textContent = '\u270E placeholder';
      b.onclick = function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var orig = f.__crfbPh !== undefined ? f.__crfbPh : (f.__crfbPh = f.getAttribute('placeholder') || '');
        var v = window.prompt('Placeholder text:', f.getAttribute('placeholder') || '');
        if (v === null) return;
        f.setAttribute('placeholder', v);
        var id = f.getAttribute('data-interaction') !== null ? 'field ' + f.getAttribute('data-interaction') : (f.id ? '#' + f.id : 'field');
        var key = pageOf(f) + '|placeholder|' + id + '|' + hash(norm(orig));
        if (norm(v) === norm(orig)) delete state.edits[key];
        else state.edits[key] = { key: key, page: pageOf(f), tag: 'placeholder', field: id, before: orig, after: v, ts: new Date().toISOString() };
        state.saved = false; persist(); renderLists();
      };
      f.parentNode.insertBefore(b, f.nextSibling);
    });
  }

  // ---------- flags + notes ----------
  function setFlag(el) {
    var o = ensureOrig(el);
    pendingFlag = { key: el.getAttribute('data-crfb-key'), page: pageOf(el), excerpt: norm(o.text).slice(0, 160), el: el };
    state.flagging = false; document.body.classList.remove('crfb-flagging'); $('crfb-flag').classList.remove('on');
    $('crfb-quote').textContent = '\u201C' + pendingFlag.excerpt + '\u201D'; $('crfb-quote').style.display = 'block';
    $('crfb-note-ctx').textContent = '(about the flagged text, ' + pendingFlag.page + ')'; $('crfb-unflag').style.display = 'inline-block';
    openDrawer(); $('crfb-note').focus();
  }
  function clearFlag() { pendingFlag = null; $('crfb-quote').style.display = 'none'; $('crfb-note-ctx').textContent = ''; $('crfb-unflag').style.display = 'none'; }
  function addNote() {
    var text = norm($('crfb-note').value); if (!text) { $('crfb-note').focus(); return; }
    state.session = norm($('crfb-session').value);
    var n = { id: 'n' + Date.now().toString(36), ts: new Date().toISOString(), session: state.session, page: pendingFlag ? pendingFlag.page : currentPage(), text: text, flag: pendingFlag ? { key: pendingFlag.key, excerpt: pendingFlag.excerpt } : null };
    state.notes.push(n);
    if (pendingFlag && pendingFlag.el) { var m = document.createElement('span'); m.className = 'crfb-flag'; m.textContent = '\u2691 ' + state.notes.length; m.title = text; pendingFlag.el.appendChild(m); }
    $('crfb-note').value = ''; state.saved = false; clearFlag(); persist(); renderLists();
  }
  function renderLists() {
    var nl = $('crfb-notelist'), el = $('crfb-editlist');
    nl.innerHTML = state.notes.length ? state.notes.slice().reverse().map(function (n) {
      return '<div class="crfb-note"><div class="crfb-meta"><span>' + escapeHTML(n.page || '') + (n.session ? ' \u00b7 ' + escapeHTML(n.session) : '') + '</span><button data-del="' + n.id + '">delete</button></div>'
        + (n.flag ? '<div class="crfb-quote">' + escapeHTML(n.flag.excerpt) + '</div>' : '') + escapeHTML(n.text) + '</div>';
    }).join('') : '<p style="font-size:12px;color:#6b6660">No notes yet.</p>';
    [].slice.call(nl.querySelectorAll('button[data-del]')).forEach(function (b) { b.onclick = function () { state.notes = state.notes.filter(function (n) { return n.id !== b.getAttribute('data-del'); }); persist(); renderLists(); }; });
    var cp = currentPage(), keys = Object.keys(state.edits), here = keys.filter(function (k) { return !cp || state.edits[k].page === cp; });
    el.innerHTML = here.length ? here.map(function (k) { var d = state.edits[k]; return '<div class="crfb-edit">' + (d.tag === 'placeholder' ? '<b>placeholder</b> ' : '') + '<s>' + escapeHTML(d.before.slice(0, 90)) + '</s><br>' + escapeHTML(d.after.slice(0, 120)) + '</div>'; }).join('')
      : '<p style="font-size:12px;color:#6b6660">No edits on this page.' + (keys.length ? ' (' + keys.length + ' elsewhere)' : '') + '</p>';
    $('crfb-ncount').textContent = String(state.notes.length + keys.length);
  }
  function openDrawer() { drawer.classList.add('open'); $('crfb-session').value = state.session; renderLists(); }
  function closeDrawer() { drawer.classList.remove('open'); }

  // ---------- save ----------
  function bundle() {
    state.session = norm($('crfb-session').value) || state.session;
    return { tool: 'crpath-feedback', version: VERSION, name: NAME, title: document.title, url: location.href, session: state.session, saved_at: new Date().toISOString(),
      edits: Object.keys(state.edits).map(function (k) { return state.edits[k]; }), notes: state.notes };
  }
  function save() {
    var b = bundle(), json = JSON.stringify(b, null, 2);
    var slug = (NAME || 'demo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var fname = 'feedback_' + slug + '_' + b.saved_at.slice(0, 10) + '.json';
    try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500); } catch (e) {}
    state.saved = true;
    var done = function (ok) { $('crfb-save').textContent = ok ? '\u2713 Saved + copied' : '\u2713 Saved'; setTimeout(function () { $('crfb-save').textContent = '\u2B07 Save'; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }

  // ---------- show / hide ----------
  function setEnabled(on, remember) {
    enabled = !!on;
    bar.style.display = enabled ? 'flex' : 'none';
    if (!enabled) {
      if (state.editing) editOff();
      state.flagging = false; document.body.classList.remove('crfb-flagging'); $('crfb-flag').classList.remove('on');
      closeDrawer();
    }
    if (remember !== false) rememberOn(enabled);
  }
  document.addEventListener('keydown', function (e) {
    if (e.altKey && (e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); setEnabled(!enabled); }
  });
  (function tripleTap() {
    var target = document.querySelector(cfg.toggleTarget || 'h1'); if (!target) return;
    var n = 0, t = null;
    target.addEventListener('pointerdown', function () {
      if (state.editing) return;
      n++; clearTimeout(t); t = setTimeout(function () { n = 0; }, 700);
      if (n >= 3) { n = 0; setEnabled(!enabled); }
    });
  })();
  window.addEventListener('beforeunload', function (e) {
    if (state.saved) return;
    if (!state.notes.length && !Object.keys(state.edits).length) return;
    e.preventDefault(); e.returnValue = '';
  });

  // ---------- wire ----------
  $('crfb-edit').onclick = function () { if (state.editing) editOff(); else { state.flagging = false; document.body.classList.remove('crfb-flagging'); $('crfb-flag').classList.remove('on'); editOn(); } };
  $('crfb-flag').onclick = function () { if (state.editing) editOff(); state.flagging = !state.flagging; document.body.classList.toggle('crfb-flagging', state.flagging); $('crfb-flag').classList.toggle('on', state.flagging); if (state.flagging) closeDrawer(); };
  $('crfb-notes').onclick = function () { if (drawer.classList.contains('open')) closeDrawer(); else openDrawer(); };
  $('crfb-close').onclick = closeDrawer;
  $('crfb-add').onclick = addNote;
  $('crfb-unflag').onclick = clearFlag;
  $('crfb-save').onclick = save;
  $('crfb-hide').onclick = function () { setEnabled(false); };
  $('crfb-clear').onclick = function () { if (!window.confirm('Clear all edits and notes in this tab?')) return; state.edits = {}; state.notes = []; [].slice.call(document.querySelectorAll('.crfb-flag')).forEach(function (m) { m.parentNode.removeChild(m); }); [].slice.call(document.querySelectorAll('.crfb-changed')).forEach(function (el) { el.classList.remove('crfb-changed'); }); persist(); renderLists(); };
  $('crfb-session').addEventListener('change', function () { state.session = norm(this.value); persist(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open') && !state.editing) closeDrawer(); });
  setEnabled(enabled, false); if (urlWants !== null) rememberOn(enabled);
  renderLists();

  window.CRFeedback = { bundle: bundle, editOn: editOn, editOff: editOff, addNote: addNote, show: function () { setEnabled(true); }, hide: function () { setEnabled(false); }, toggle: function () { setEnabled(!enabled); }, isOn: function () { return enabled; }, state: state, version: VERSION };
})();
