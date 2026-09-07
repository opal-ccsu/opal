/**
 * PathwayU Unit - Application Logic
 * CR Path: Career Readiness Through Iteration
 * v1.3 — Tweaks applied:
 *         ADDED: #timer-close-msg element support (showCloseMessage)
 *         FIXED: startCountdown() recalculates remaining from Date.now() each tick
 *         KEPT: Email validation warns but does not block (option A)
 *         NOTE: autocomplete="off" on mentor email handled in HTML
 * (c) 2026 Caleb B. Bragg. CC BY-NC 4.0
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // ============================================================
  var CONFIG = {
    totalPages:      16,
    partALastPage:   6,
    gatePageNumber:  7,
    partBFirstPage:  8,
    timerDuration:   86400000,
    overrideCode:    'PATHWAYU2026',
    qualtricsUrl:    'https://ccsu.qualtrics.com/jfe/form/SV_a4Pr6DmNuIhPQfY',
    interactionMap: {
      0:  'reflection_surprised',
      1:  'reflection_confirmed',
      2:  'reflection_tension',
      3:  'reflection_crpath',
      4:  'career1_name',
      5:  'career1_strength',
      6:  'career1_why',
      7:  'career1_ksas',
      8:  'career1_competencies',
      9:  'career1_elo',
      10: 'career1_mentor',
      11: 'career2_name',
      12: 'career2_strength',
      13: 'career2_why',
      14: 'career2_ksas',
      15: 'career2_competencies',
      16: 'career2_elo',
      17: 'career2_mentor',
      18: 'career3_name',
      19: 'career3_strength',
      20: 'career3_why',
      21: 'career3_ksas',
      22: 'career3_competencies',
      23: 'career3_elo',
      24: 'career3_mentor',
      25: 'synthesis_patterns',
      26: 'connection_reflection',
      27: 'student_email',
      28: 'mentor_email'
    }
  };

  // ============================================================
  // NACE DATA
  // ============================================================
  var NACE = {
    career_dev: {
      icon: '\u{1F9ED}',
      title: 'Career & Self-Development',
      tagline: 'Know yourself, grow yourself.',
      body: 'Proactively develop oneself and one\'s career through continual personal and professional learning, awareness of one\'s strengths and weaknesses, navigation of career opportunities, and networking to build relationships within and outside one\'s organization.'
    },
    communication: {
      icon: '\u{1F4AC}',
      title: 'Communication',
      tagline: 'Say it clearly, say it well.',
      body: 'Clearly and effectively exchange information, ideas, facts, and perspectives with persons inside and outside of an organization.'
    },
    critical_thinking: {
      icon: '\u{1F9E0}',
      title: 'Critical Thinking',
      tagline: 'Figure out what\'s really going on \u2014 then decide.',
      body: 'Don\'t just react to the surface of a problem. Understand the context, analyze what the information is actually telling you, and make decisions based on logic and evidence \u2014 not just your first instinct. In NACE terms: identify and respond to needs based upon an understanding of situational context and logical analysis of relevant information.'
    },
    equity: {
      icon: '\u2696\uFE0F',
      title: 'Equity & Inclusion',
      tagline: 'See who\'s in the room \u2014 and who isn\'t.',
      body: 'Engage genuinely with people from different cultures and backgrounds, and go beyond politeness \u2014 actively work to identify and challenge the systems, structures, and biases that create unfair barriers for people who\'ve historically been excluded. In NACE terms: demonstrate the awareness, attitude, knowledge, and skills required to equitably engage and include people from different cultures and backgrounds; engage in anti-oppressive practices that actively challenge the systems, structures, and policies of racism and inequity.'
    },
    leadership: {
      icon: '\u{1F3D4}\uFE0F',
      title: 'Leadership',
      tagline: 'Bring out the best \u2014 in yourself and others.',
      body: 'Recognize and capitalize on personal and team strengths to achieve organizational goals.'
    },
    professionalism: {
      icon: '\u{1F4BC}',
      title: 'Professionalism',
      tagline: 'Be dependable. Read the room. Act like it matters.',
      body: 'Every workplace is different \u2014 but integrity, follow-through, and a genuine investment in doing good work translate everywhere. Professionalism means holding yourself accountable and acting in the interest of the people and organization around you. In NACE terms: knowing work environments differ greatly, understand and demonstrate effective work habits, and act in the interest of the larger community and workplace.'
    },
    teamwork: {
      icon: '\u{1F91D}',
      title: 'Teamwork',
      tagline: 'Work well with others to get things done.',
      body: 'Build and maintain collaborative relationships to work effectively toward common goals, while appreciating diverse viewpoints and shared responsibilities.'
    },
    technology: {
      icon: '\u{1F4BB}',
      title: 'Technology',
      tagline: 'Use the right tools, use them wisely.',
      body: 'Understand and leverage technologies ethically to enhance efficiencies, complete tasks, and accomplish goals.'
    }
  };

  // ============================================================
  // STATE
  // ============================================================
  var state = {
    currentPage:    1,
    maxPageReached: 1,
    partASubmitted: false,
    partATimestamp: null,
    partBUnlocked:  false,
    overrideUsed:   false,
    responses:      {},
    timerInterval:  null,
    hasTerminated:  false
  };

  // ============================================================
  // LOAD / SAVE STATE
  // ============================================================
  function loadState() {
    var saved = SCORM.getSuspendData();
    if (saved && saved.currentPage) {
      state.currentPage    = parseInt(saved.currentPage)    || 1;
      state.maxPageReached = parseInt(saved.maxPageReached) || state.currentPage;
      state.partASubmitted = saved.partASubmitted || false;
      state.partATimestamp = saved.partATimestamp || null;
      state.partBUnlocked  = saved.partBUnlocked  || false;
      state.overrideUsed   = saved.overrideUsed   || false;
      state.responses      = saved.responses      || {};
    }
    restoreResponses();
  }

  function saveState() {
    if (state.hasTerminated) return;
    state.responses = collectAllResponses();
    SCORM.setSuspendData({
      currentPage:    state.currentPage,
      maxPageReached: state.maxPageReached,
      partASubmitted: state.partASubmitted,
      partATimestamp: state.partATimestamp,
      partBUnlocked:  state.partBUnlocked,
      overrideUsed:   state.overrideUsed,
      responses:      state.responses
    });
    SCORM.setLocation(state.currentPage);
  }

  function restoreResponses() {
    var saved = SCORM.getSuspendData();
    if (!saved || !saved.responses) return;
    var r = saved.responses;
    for (var key in r) {
      if (r.hasOwnProperty(key)) {
        var el = document.querySelector('[data-interaction="' + key + '"]');
        if (el) el.value = r[key];
      }
    }
  }

  function collectAllResponses() {
    var r = {};
    var els = document.querySelectorAll('.scorm-input, .scorm-input-short, .scorm-select');
    els.forEach(function (el) {
      var id = el.getAttribute('data-interaction');
      if (id !== null && el.value) r[id] = el.value;
    });
    return r;
  }

  // ============================================================
  // SAFE TERMINATE (prevents double-fire)
  // ============================================================
  function safeTerminate() {
    if (state.hasTerminated) return;
    state.hasTerminated = true;
    state.responses = collectAllResponses();
    saveState();
    SCORM.terminate();
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  function bindNavigation() {
    document.getElementById('btn-next').addEventListener('click', nextPage);
    document.getElementById('btn-back').addEventListener('click', prevPage);
    document.getElementById('btn-submit-a').addEventListener('click', submitPartA);
    document.getElementById('btn-submit-b').addEventListener('click', submitPartB);
  }

  function goToPage(pageNum) {
    if (pageNum > CONFIG.gatePageNumber && !state.partBUnlocked && !state.overrideUsed) {
      pageNum = CONFIG.gatePageNumber;
    }
    document.querySelectorAll('.page').forEach(function (p) { p.classList.add('hidden'); });
    var target = document.querySelector('[data-page="' + pageNum + '"]');
    if (target) {
      target.classList.remove('hidden');
      state.currentPage = pageNum;
      if (pageNum > state.maxPageReached) state.maxPageReached = pageNum;
      updateNavButtons();
      updateProgressBar();
      updateSidebarLinks(pageNum);
      if (pageNum === CONFIG.gatePageNumber) handleTimerPage();
      if (pageNum === CONFIG.partALastPage)  populatePartAReview();
      if (pageNum === 15)                    populatePartBReview();
      if (pageNum === CONFIG.totalPages)     populateFinalStats();

      // Save state on every page change
      saveState();

      window.scrollTo(0, 0);
    }
  }

  window.goToPage = function (pageNum) {
    if (pageNum <= state.maxPageReached) goToPage(pageNum);
  };

  function nextPage() {
    if (state.currentPage < CONFIG.totalPages) goToPage(state.currentPage + 1);
  }

  function prevPage() {
    if (state.currentPage > 1) {
      if (state.currentPage > CONFIG.gatePageNumber && state.partASubmitted) {
        if (state.currentPage - 1 <= CONFIG.gatePageNumber) return;
      }
      goToPage(state.currentPage - 1);
    }
  }

  function updateNavButtons() {
    var btnBack    = document.getElementById('btn-back');
    var btnNext    = document.getElementById('btn-next');
    var btnSubmitA = document.getElementById('btn-submit-a');
    var btnSubmitB = document.getElementById('btn-submit-b');

    btnBack.disabled = (state.currentPage === 1);
    if (state.currentPage === CONFIG.partBFirstPage) btnBack.disabled = true;

    btnNext.classList.remove('hidden');
    btnSubmitA.classList.add('hidden');
    btnSubmitB.classList.add('hidden');

    if (state.currentPage === CONFIG.partALastPage) {
      btnNext.classList.add('hidden');
      btnSubmitA.classList.remove('hidden');
    }

    if (state.currentPage === CONFIG.gatePageNumber) {
      btnNext.classList[state.partBUnlocked || state.overrideUsed ? 'remove' : 'add']('hidden');
      btnBack.disabled = true;
    }

    if (state.currentPage === 15) {
      btnNext.classList.add('hidden');
      btnSubmitB.classList.remove('hidden');
    }

    if (state.currentPage === CONFIG.totalPages) {
      btnNext.classList.add('hidden');
      btnBack.disabled = true;
    }
  }

  function updateProgressBar() {
    var pct = (state.currentPage / CONFIG.totalPages) * 100;
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-label').textContent =
      'Page ' + state.currentPage + ' of ' + CONFIG.totalPages;
  }

  function updateSidebarLinks(pageNum) {
    document.querySelectorAll('.nav-link').forEach(function (l) { l.classList.remove('active'); });
    var map = {
      1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 5,
      8: 8, 9: 8,
      10: 10, 11: 11, 12: 12, 13: 13, 14: 14
    };
    var target = map[pageNum];
    if (target) {
      var sel = '[onclick*="goToPage(' + target + ')"]';
      var el = document.querySelector('#sidebar ' + sel);
      if (el) el.classList.add('active');
    }
  }

  // ============================================================
  // PART A SUBMISSION
  // ============================================================
  function submitPartA() {
    // Guard: if already submitted, just navigate to timer page
    if (state.partASubmitted) {
      goToPage(CONFIG.gatePageNumber);
      return;
    }

    var r = collectAllResponses();
    state.responses      = r;
    state.partASubmitted = true;
    state.partATimestamp = Date.now();
    for (var i = 0; i <= 3; i++) {
      if (r[i]) SCORM.setInteraction(i, CONFIG.interactionMap[i], 'long_fill_in', r[i]);
    }
    saveState();
    goToPage(CONFIG.gatePageNumber);
  }

  // ============================================================
  // PART B SUBMISSION
  // ============================================================
  function submitPartB() {
    var r = collectAllResponses();
    state.responses = r;

    var emailWarn  = document.getElementById('email-warn');
    var mentorWarn = document.getElementById('mentor-warn');
    if (emailWarn)  emailWarn.classList.remove('visible');
    if (mentorWarn) mentorWarn.classList.remove('visible');
    if (r[27] && !validateEmail(r[27]) && emailWarn)  emailWarn.classList.add('visible');
    if (r[28] && !validateEmail(r[28]) && mentorWarn) mentorWarn.classList.add('visible');

    for (var i = 4; i <= 28; i++) {
      if (r[i]) {
        var type = (i === 5 || i === 12 || i === 19) ? 'choice' : 'long_fill_in';
        SCORM.setInteraction(i, CONFIG.interactionMap[i], type, r[i]);
      }
    }
    sendToQualtrics(r);
    SCORM.setComplete();
    saveState();
    goToPage(CONFIG.totalPages);
  }

  function validateEmail(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  }

  // ============================================================
  // QUALTRICS — hidden form POST via iframe
  // ============================================================
  function sendToQualtrics(r) {
    var learner_id   = '';
    var learner_name = '';
    try {
      learner_id   = SCORM.getLearnerID()   || '';
      learner_name = SCORM.getLearnerName() || '';
    } catch (e) {}

    var payload = {
      learner_id:            learner_id,
      learner_name:          learner_name,
      student_email:         r[27] || '',
      mentor_email:          r[28] || '',
      part_a_timestamp:      state.partATimestamp ? new Date(state.partATimestamp).toISOString() : '',
      part_b_timestamp:      new Date().toISOString(),
      reflection_surprised:  r[0]  || '',
      reflection_confirmed:  r[1]  || '',
      reflection_tension:    r[2]  || '',
      reflection_crpath:     r[3]  || '',
      career1_name:          r[4]  || '',
      career1_strength:      r[5]  || '',
      career1_why:           r[6]  || '',
      career1_ksas:          r[7]  || '',
      career1_competencies:  r[8]  || '',
      career1_elo:           r[9]  || '',
      career1_mentor:        r[10] || '',
      career2_name:          r[11] || '',
      career2_strength:      r[12] || '',
      career2_why:           r[13] || '',
      career2_ksas:          r[14] || '',
      career2_competencies:  r[15] || '',
      career2_elo:           r[16] || '',
      career2_mentor:        r[17] || '',
      career3_name:          r[18] || '',
      career3_strength:      r[19] || '',
      career3_why:           r[20] || '',
      career3_ksas:          r[21] || '',
      career3_competencies:  r[22] || '',
      career3_elo:           r[23] || '',
      career3_mentor:        r[24] || '',
      synthesis_patterns:    r[25] || '',
      connection_reflection: r[26] || ''
    };

    var frameName = 'qualtrics_frame_' + Date.now();
    var iframe = document.createElement('iframe');
    iframe.name = frameName;
    iframe.style.cssText = 'position:absolute;width:1px;height:1px;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    var form = document.createElement('form');
    form.method = 'POST';
    form.action = CONFIG.qualtricsUrl;
    form.target = frameName;
    form.style.display = 'none';

    for (var key in payload) {
      if (payload.hasOwnProperty(key)) {
        var input = document.createElement('input');
        input.type  = 'hidden';
        input.name  = key;
        input.value = String(payload[key]);
        form.appendChild(input);
      }
    }

    document.body.appendChild(form);
    form.submit();

    setTimeout(function () {
      if (form.parentNode)   form.parentNode.removeChild(form);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 15000);
  }

  // ============================================================
  // TIMER
  // ============================================================
  function handleTimerPage() {
    var locked   = document.getElementById('timer-locked');
    var unlocked = document.getElementById('timer-unlocked');

    // Already unlocked — show Part B ready state
    if (state.partBUnlocked || state.overrideUsed) {
      locked.classList.add('hidden');
      unlocked.classList.remove('hidden');
      updateNavButtons();
      return;
    }

    // Set timestamp if first arrival
    if (!state.partATimestamp) { state.partATimestamp = Date.now(); }

    // Check if timer has elapsed
    var elapsed = Date.now() - state.partATimestamp;
    if (elapsed >= CONFIG.timerDuration) {
      state.partBUnlocked = true;
      locked.classList.add('hidden');
      unlocked.classList.remove('hidden');
      saveState();
      updateNavButtons();
    } else {
      // Timer still running — show countdown and close message
      locked.classList.remove('hidden');
      unlocked.classList.add('hidden');
      showCloseMessage();
      startCountdown();
    }
  }

  function showCloseMessage() {
    // Show a message telling the student they can safely close the window
    var msg = document.getElementById('timer-close-msg');
    if (msg) msg.classList.remove('hidden');
  }

  function startCountdown() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    function update() {
      var remaining = (state.partATimestamp + CONFIG.timerDuration) - Date.now();
      if (remaining <= 0) {
        clearInterval(state.timerInterval);
        state.partBUnlocked = true;
        saveState();
        handleTimerPage();
        updateNavButtons();
        return;
      }
      var h = Math.floor(remaining / 3600000);
      var m = Math.floor((remaining % 3600000) / 60000);
      var s = Math.floor((remaining % 60000) / 1000);
      var el = document.getElementById('countdown');
      if (el) el.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
    }
    update();
    state.timerInterval = setInterval(update, 1000);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  // ============================================================
  // FACILITATOR OVERRIDE
  // ============================================================
  function bindOverride() {
    var title     = document.getElementById('module-title');
    var modal     = document.getElementById('override-modal');
    var submitBtn = document.getElementById('override-submit');
    var cancelBtn = document.getElementById('override-cancel');
    var input     = document.getElementById('override-input');
    var error     = document.getElementById('override-error');
    var clicks = 0, clickTimer = null;

    title.addEventListener('click', function () {
      clicks++;
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(function () { clicks = 0; }, 2000);
      if (clicks >= 5) {
        clicks = 0;
        modal.classList.remove('hidden');
        input.value = '';
        error.classList.add('hidden');
        input.focus();
      }
    });

    submitBtn.addEventListener('click', function () {
      if (input.value === CONFIG.overrideCode) {
        state.overrideUsed = state.partBUnlocked = true;
        modal.classList.add('hidden');
        saveState();
        handleTimerPage();
        updateNavButtons();
      } else {
        error.classList.remove('hidden');
      }
    });

    cancelBtn.addEventListener('click', function () { modal.classList.add('hidden'); });
    input.addEventListener('keypress', function (e) { if (e.key === 'Enter') submitBtn.click(); });
  }

  // ============================================================
  // NACE TOOLTIPS
  // ============================================================
  function bindNaceTooltips() {
    document.querySelectorAll('.nace-tag-sm[data-key]').forEach(function (tag) {
      tag.addEventListener('click', function () { openNaceTooltip(this.getAttribute('data-key')); });
      tag.addEventListener('keypress', function (e) {
        if (e.key === 'Enter' || e.key === ' ') openNaceTooltip(this.getAttribute('data-key'));
      });
    });
    var closeBtn = document.getElementById('tip-close');
    if (closeBtn) closeBtn.addEventListener('click', closeNaceTooltip);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNaceTooltip();
    });
  }

  function openNaceTooltip(key) {
    var d = NACE[key];
    if (!d) return;
    document.getElementById('tip-icon').textContent     = d.icon;
    document.getElementById('tip-title').textContent    = d.title;
    document.getElementById('tip-tagline').textContent  = d.tagline;
    document.getElementById('tip-official').textContent = d.body;
    document.getElementById('nace-overlay').classList.remove('hidden');
    document.getElementById('nace-tooltip').classList.remove('hidden');
    document.querySelectorAll('.nace-tag-sm[data-key]').forEach(function (t) {
      t.classList[t.getAttribute('data-key') === key ? 'add' : 'remove']('active');
    });
  }

  function closeNaceTooltip() {
    document.getElementById('nace-overlay').classList.add('hidden');
    document.getElementById('nace-tooltip').classList.add('hidden');
    document.querySelectorAll('.nace-tag-sm[data-key]').forEach(function (t) {
      t.classList.remove('active');
    });
  }

  window.closeNaceTooltip = closeNaceTooltip;

  // ============================================================
  // REVIEW PAGES
  // ============================================================
  function populatePartAReview() {
    var r = collectAllResponses();
    set('review-surprised', r[0] || '[No response entered]');
    set('review-confirmed', r[1] || '[No response entered]');
    set('review-tension',   r[2] || '[No response entered]');
    set('review-crpath',    r[3] || '[No response entered]');
  }

  function populatePartBReview() {
    var r = collectAllResponses();

    var c1 = 'Career: ' + (r[4]  || '[not entered]') + ' (' + (r[5]  || 'no strength') + ')\n' +
             'Why I picked it: '    + (r[6]  || '[not entered]') + '\n' +
             'CS KSAs: '            + (r[7]  || '[not entered]') + '\n' +
             'Core Competencies: '  + (r[8]  || '[not entered]') + '\n' +
             'ELO: '                + (r[9]  || '[not entered]') + '\n' +
             'Career Mentor type: ' + (r[10] || '[not entered]');
    set('review-c1', c1);

    var c2 = 'Career: ' + (r[11] || '[not entered]') + ' (' + (r[12] || 'no strength') + ')\n' +
             'Why I picked it: '    + (r[13] || '[not entered]') + '\n' +
             'CS KSAs: '            + (r[14] || '[not entered]') + '\n' +
             'Core Competencies: '  + (r[15] || '[not entered]') + '\n' +
             'ELO: '                + (r[16] || '[not entered]') + '\n' +
             'Career Mentor type: ' + (r[17] || '[not entered]');
    set('review-c2', c2);

    var c3 = 'Career: ' + (r[18] || '[not entered]') + ' (' + (r[19] || 'no strength') + ')\n' +
             'Why I picked it: '    + (r[20] || '[not entered]') + '\n' +
             'CS KSAs: '            + (r[21] || '[not entered]') + '\n' +
             'Core Competencies: '  + (r[22] || '[not entered]') + '\n' +
             'ELO: '                + (r[23] || '[not entered]') + '\n' +
             'Career Mentor type: ' + (r[24] || '[not entered]');
    set('review-c3', c3);

    set('review-synthesis',  r[25] || '[No synthesis entered]');
    set('review-connection', r[26] || '[No connection reflection entered]');
  }

  function populateFinalStats() {
    var r = collectAllResponses();
    var count = Object.keys(r).filter(function (k) { return r[k] && r[k].trim().length > 0; }).length;
    document.getElementById('total-responses').textContent = count;
    if (state.partATimestamp) {
      document.getElementById('part-a-date').textContent =
        new Date(state.partATimestamp).toLocaleDateString();
    }
    document.getElementById('part-b-date').textContent = new Date().toLocaleDateString();
  }

  function set(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ============================================================
  // AUTO-SAVE & SESSION MANAGEMENT
  // ============================================================
  function bindAutoSave() {
    var t = null;
    document.addEventListener('input', function (e) {
      if (e.target.matches('.scorm-input,.scorm-input-short,.scorm-select')) {
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          state.responses = collectAllResponses();
          saveState();
        }, 2000);
      }
    });

    // Primary: beforeunload — fires when window/tab is closing
    window.addEventListener('beforeunload', function () {
      safeTerminate();
    });

    // Backup 1: pagehide — more reliable in iframes and on mobile
    window.addEventListener('pagehide', function () {
      safeTerminate();
    });

    // Backup 2: visibilitychange — catches tab switches and mobile app backgrounding
    // Only saves state here (does not terminate) to preserve session if user returns
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && !state.hasTerminated) {
        state.responses = collectAllResponses();
        saveState();
      }
    });
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================
  function init() {
    var success = SCORM.init();
    if (!success) {
      // SCORM API not found or failed to initialize
      // Content will still render but won't persist to LMS
      console.warn('[PathwayU] SCORM initialization failed. Running in offline mode.');
    }
    loadState();
    bindNavigation();
    bindOverride();
    bindAutoSave();
    bindNaceTooltips();
    goToPage(state.currentPage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
