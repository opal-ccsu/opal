/**
 * Module 0: CR Path -- Application Logic
 * v2.5 (2026-09-08) -- Website + second-pass build. Requires js/crpath-shared.js.
 *   - Pass question on page 1 (first time / been here before); returner language on the
 *     Starting Point, Name It, Strength Sort, Map, Baseline, iteration and completion pages
 *   - Second pass: fresh-answer fields are cleared, last pass shown read-only above them
 *   - Email captured at the Part A review; Part A now posts to Qualtrics (submission_part = A)
 *     with the Part B unlock time and a resume link, so the confirmation email can carry both
 *   - Per-page time-on-task (page_times JSON, part_a_seconds, part_b_seconds)
 *   - Name field (learner_name falls back to it on the website, where there is no LMS)
 *   - Resume Link UI hidden inside an LMS (it is inert there); countdown recomputes from the clock
 *   - Dictation button on long-answer boxes where the browser supports it
 *   - CONFIG.demo = true builds a [DEMO] copy: nothing saved, nothing sent, gate open
 *   Kept on purpose: duplicate ranks allowed, plaintext override code, 24-hour gate on every pass.
 * v2.4 -- Searchable course dropdown + instructor auto-routing
 *   - INSTRUCTOR_MAP: single source of truth for all courses
 *   - Searchable dropdown replaces <select> for course selection
 *   - instructor_email and instructor_name auto-resolve and send to Qualtrics
 *   - To add a new course: add one line to INSTRUCTOR_MAP below
 *   - All prior v2.3 fixes retained
 *
 * REQUIRES: Set SCORM content to 1 ATTEMPT in Bb Ultra settings
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // ============================================================
  var CONFIG = {
    totalPages: 18,
    partALastPage: 11,
    gatePageNumber: 12,
    partBFirstPage: 13,
    timerDuration: 86400000,     // set to 0 automatically in the [DEMO] copy
    overrideCode: 'CRPATH2026',
    qualtricsUrl: 'https://ccsu.qualtrics.com/jfe/form/SV_1LkEtj4djLa56js',
    postKeepMs: 60000,
    demo: false,                 // true in the [DEMO] copy: no storage, no Qualtrics, gate open
    storageKey: 'scorm_cmi.suspend_data',   // localStorage key the wrapper uses on the website
    interactionMap: {
      0:'opening_response',1:'rank_csksa',2:'rank_core',3:'rank_elo',4:'rank_cm',
      5:'explain_strongest',6:'explain_weakest',7:'demo_year',8:'demo_school',9:'demo_major',
      10:'map_csksa_experience',11:'map_csksa_learned',12:'map_csksa_relevance',
      13:'map_core_experience',14:'map_core_learned',15:'map_core_relevance',
      16:'map_elo_experience',17:'map_elo_learned',18:'map_elo_relevance',
      19:'map_cm_experience',20:'map_cm_learned',21:'map_cm_relevance',
      22:'baseline_reflection',23:'student_email',24:'mentor_email',
      25:'define_csksa',26:'define_core',27:'define_elo',28:'define_cm',
      29:'course_section',30:'course_other',
      31:'first_pass',32:'prior_course_section',33:'pass_number',34:'learner_name_field'
    }
  };
  if (CONFIG.demo) CONFIG.timerDuration = 0;
  // Fields a returner answers fresh (last pass shown read-only above them). Everything else stays prefilled.
  var FRESH_FIELDS = [0, 1, 2, 3, 4, 5, 6, 22, 25, 26, 27, 28];

  // ============================================================
  // INSTRUCTOR MAP -- Single source of truth
  // Sorted alphabetically by course display name; multi-section
  // courses are ordered by meeting time. 'Other' stays last.
  // To add a course: add one line here. The dropdown builds itself.
  // Format: 'COURSE_CODE': { display: 'What students see', name: 'Last, First', email: 'name@ccsu.edu' }
  // ============================================================
  var INSTRUCTOR_MAP = {
    'CCSU102_AAA':         { display: 'CCSU 102: AAA Guide to Accessible, Achievable, and Affordable Study Abroad', name: 'Mei, Zongxiang',   email: 'zongxiang.mei@ccsu.edu' },
    'CCSU102_ELOSTEM':     { display: 'CCSU 102: Experiential Learning STEM',                                       name: 'Delaney, Nick',    email: 'ndelaney@ccsu.edu' },
    'CCSU102_EXPLORINGAI': { display: 'CCSU 102: Exploring AI & Society',                                           name: 'Wolff, Robert',    email: 'wolffr@ccsu.edu' },
    'CCSU102_MEDIEVAL':    { display: 'CCSU 102: Get Medieval',                                                     name: 'McGrath, Kate',    email: 'mcgrathkae@ccsu.edu' },
    'CCSU102_HOTEL':       { display: 'CCSU 102: The First-Year Hotel: Checking In to College Life',                name: 'Brown, Taylor',    email: 'tkbrown@ccsu.edu' },
    'CCSU103_BUS_MW0430':  { display: 'CCSU 103: Career Exploration: Business - M/W 4:30-5:20p',                    name: 'Conte, Crissy',    email: 'contec@ccsu.edu' },
    'CCSU103_BUS_TTH0430': { display: 'CCSU 103: Career Exploration: Business - T/Th 4:30-5:20p',                   name: 'Rivera, Monica',   email: 'monica.rivera@ccsu.edu' },
    'CCL':                 { display: 'Central Career Launch (CCL)',                                                name: 'Bragg, Caleb',     email: 'bragg.cb@ccsu.edu' },
    'CET229':              { display: 'CET 229: Computer Hardware Architecture',                                    name: 'DeLuca, Tony',     email: 'delucat@ccsu.edu' },
    'CS409_CYS409':        { display: 'CS/CYS 409: Advanced Topics in Cybersecurity - T/Th 4:30-5:45p',             name: 'Williams, Chad',   email: 'cwilliams@ccsu.edu' },
    'ECON450':             { display: 'ECON 450: Money, Credit & Banking',                                          name: 'Soper, Carolyne',  email: 'soperc@ccsu.edu' },
    'HIST300_02':          { display: 'HIST 300: Remembering the American Past',                                    name: 'Wolff, Robert',    email: 'wolffr@ccsu.edu' },
    'LING406_506':         { display: 'LING 406/506: TESOL Methods',                                                name: 'Ciscel, Matthew',  email: 'ciscelm@ccsu.edu' },
    'MGT295_MW0925':       { display: 'MGT 295: Fundamentals of Management & Org Behavior - M/W 9:25a-10:40a',      name: 'Brown, Taylor',    email: 'tkbrown@ccsu.edu' },
    'MGT295_MW1050':       { display: 'MGT 295: Fundamentals of Management & Org Behavior - M/W 10:50a-12:05p',     name: 'Brown, Taylor',    email: 'tkbrown@ccsu.edu' },
    'PSY112_MW1050':       { display: 'PSY 112: Introduction to Psychology - M/W 10:50a-12:05p',                    name: 'Sikorski, Jason',  email: 'sikorskijaf@ccsu.edu' },
    'PSY215_TTH0925':      { display: 'PSY 215: Introduction to Psychological Statistics - T/Th 9:25-10:40a',        name: 'Bragg, Caleb',     email: 'bragg.cb@ccsu.edu' },
    'PSY215_TTH1050':      { display: 'PSY 215: Introduction to Psychological Statistics - T/Th 10:50a-12:05p',      name: 'Bragg, Caleb',     email: 'bragg.cb@ccsu.edu' },
    'PSY234':              { display: 'PSY 234: Industrial/Organizational Psychology',                              name: 'Bragg, Caleb',     email: 'bragg.cb@ccsu.edu' },
    'PSY330_0925':         { display: 'PSY 330: Psychopathology - T/Th 9:25-10:40a',                                name: 'Sikorski, Jason',  email: 'sikorskijaf@ccsu.edu' },
    'PSY330_1050':         { display: 'PSY 330: Psychopathology - T/Th 10:50a-12:05p',                              name: 'Sikorski, Jason',  email: 'sikorskijaf@ccsu.edu' },
    'PSY413_CLASS413':     { display: 'PSY/CLASS 413: College to Career Transitions',                               name: 'Bragg, Caleb',     email: 'bragg.cb@ccsu.edu' },
    'ROBO240':             { display: 'ROBO 240: Electric Machines - Mon 5:00-8:20p',                               name: 'Thamma, Ravindra', email: 'thammarav@ccsu.edu' },

    // -- Fallback: always rendered last in the dropdown --
    'Other':               { display: 'Other (I\'ll type it in)',                                                   name: 'Bragg, Caleb',     email: 'bragg.cb@ccsu.edu' }
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
      tagline: 'Figure out what\'s really going on -- then decide.',
      body: 'Don\'t just react to the surface of a problem. Understand the context, analyze what the information is actually telling you, and make decisions based on logic and evidence -- not just your first instinct. In NACE terms: identify and respond to needs based upon an understanding of situational context and logical analysis of relevant information.'
    },
    equity: {
      icon: '\u{2696}\u{FE0F}',
      title: 'Equity & Inclusion',
      tagline: 'See who\'s in the room -- and who isn\'t.',
      body: 'Engage genuinely with people from different cultures and backgrounds, and go beyond politeness -- actively work to identify and challenge the systems, structures, and biases that create unfair barriers for people who\'ve historically been excluded. In NACE terms: demonstrate the awareness, attitude, knowledge, and skills required to equitably engage and include people from different cultures and backgrounds; engage in anti-oppressive practices that actively challenge the systems, structures, and policies of racism and inequity.'
    },
    leadership: {
      icon: '\u{1F3D4}\u{FE0F}',
      title: 'Leadership',
      tagline: 'Bring out the best -- in yourself and others.',
      body: 'Recognize and capitalize on personal and team strengths to achieve organizational goals.'
    },
    professionalism: {
      icon: '\u{1F4BC}',
      title: 'Professionalism',
      tagline: 'Be dependable. Read the room. Act like it matters.',
      body: 'Every workplace is different -- but integrity, follow-through, and a genuine investment in doing good work translate everywhere. Professionalism means holding yourself accountable and acting in the interest of the people and organization around you. In NACE terms: knowing work environments differ greatly, understand and demonstrate effective work habits, and act in the interest of the larger community and workplace.'
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
    currentPage: 1,
    maxPageReached: 1,
    partASubmitted: false,
    partATimestamp: null,
    partBUnlocked: false,
    overrideUsed: false,
    partBSubmittedOnce: false,
    partBTimestamp: null,
    partAPosted: false,
    detectedPasses: 0,       // Part B submissions recorded in this saved state
    lastPass: null,          // { ts, responses } snapshot of the most recent completed pass
    pageTimes: {},           // page number -> seconds on task (across visits)
    responses: {},
    timerInterval: null
  };

  // ============================================================
  // PNG DIAGRAM MAPPING
  // ============================================================
  function getDiagramImage(pageNum) {
    if (pageNum === 4) return 'cr-path-full.png';
    if (pageNum === 5) return 'cr-path-csksa.png';
    if (pageNum === 6) return 'cr-path-core.png';
    if (pageNum === 7) return 'cr-path-elo.png';
    if (pageNum === 8) return 'cr-path-mentorship.png';
    if (pageNum === 9 || pageNum === 10) return 'cr-path-full.png';
    if (pageNum === 13 || pageNum === 14 || pageNum === 15) return 'cr-path-compact.png';
    return 'cr-path-full.png';
  }

  function getDiagramAltText(pageNum) {
    if (pageNum === 4) return 'CR Path full diagram - all four components visible';
    if (pageNum === 5) return 'CR Path diagram with CS KSAs pillar highlighted';
    if (pageNum === 6) return 'CR Path diagram with Core Competencies pillar highlighted';
    if (pageNum === 7) return 'CR Path diagram with ELOs pillar highlighted';
    if (pageNum === 8) return 'CR Path diagram with Career Mentorship pillar highlighted';
    if (pageNum === 13 || pageNum === 14 || pageNum === 15) return 'CR Path compact diagram';
    return 'CR Path diagram - Career Readiness Through Iteration';
  }

  function updateDiagramImage(pageNum) {
    var containers = document.querySelectorAll('.cr-path-diagram-container');
    containers.forEach(function (container) {
      var img = container.querySelector('img');
      if (img) {
        var filename = getDiagramImage(pageNum);
        img.src = 'images/' + filename;
        img.alt = getDiagramAltText(pageNum);
      }
    });
  }

  // ============================================================
  // LOAD / SAVE STATE
  // ============================================================
  function loadState() {
    var saved = SCORM.getSuspendData();
    if (saved && saved.currentPage) {
      state.currentPage        = parseInt(saved.currentPage) || 1;
      state.maxPageReached     = parseInt(saved.maxPageReached) || state.currentPage;
      state.partASubmitted     = saved.partASubmitted || false;
      state.partATimestamp     = saved.partATimestamp || null;
      state.partBUnlocked      = saved.partBUnlocked  || false;
      state.overrideUsed       = saved.overrideUsed   || false;
      state.partBSubmittedOnce = saved.partBSubmittedOnce || false;
      state.partBTimestamp     = saved.partBTimestamp || null;
      state.partAPosted        = saved.partAPosted    || false;
      state.detectedPasses     = parseInt(saved.detectedPasses, 10) || (saved.partBSubmittedOnce ? 1 : 0);
      state.lastPass           = saved.lastPass       || null;
      state.pageTimes          = saved.pageTimes      || {};
      state.responses          = saved.responses      || {};
    }
    restoreResponses();
  }

  function saveState() {
    state.responses = collectAllResponses();
    CRShared.timer.flush();
    SCORM.setSuspendData({
      currentPage:        state.currentPage,
      maxPageReached:     state.maxPageReached,
      partASubmitted:     state.partASubmitted,
      partATimestamp:     state.partATimestamp,
      partBUnlocked:      state.partBUnlocked,
      overrideUsed:       state.overrideUsed,
      partBSubmittedOnce: state.partBSubmittedOnce,
      partBTimestamp:     state.partBTimestamp,
      partAPosted:        state.partAPosted,
      detectedPasses:     state.detectedPasses,
      lastPass:           state.lastPass,
      pageTimes:          state.pageTimes,
      responses:          state.responses
    });
    SCORM.setLocation(state.currentPage);
    SCORM.setProgressMeasure((state.currentPage / CONFIG.totalPages).toFixed(2));
  }

  function restoreResponses() {
    var saved = SCORM.getSuspendData();
    if (!saved || !saved.responses) return;
    var r = saved.responses;
    for (var key in r) {
      if (!r.hasOwnProperty(key)) continue;
      var el = document.querySelector('[data-interaction="' + key + '"]');
      if (el) el.value = r[key];
    }
    // Restore course search display text
    restoreCourseSearchDisplay();
  }

  function restoreCourseSearchDisplay() {
    var hiddenInput = document.getElementById('course-section');
    var searchInput = document.getElementById('course-search');
    var otherInput  = document.getElementById('course-other');
    if (!hiddenInput || !searchInput) return;
    var val = hiddenInput.value;
    if (val && val !== 'Other' && INSTRUCTOR_MAP[val]) {
      searchInput.value = INSTRUCTOR_MAP[val].display;
    } else if (val === 'Other') {
      searchInput.value = '';
      searchInput.placeholder = 'Other selected -- type your course below';
      if (otherInput) {
        otherInput.classList.remove('hidden');
        otherInput.removeAttribute('aria-hidden');
      }
    }
  }

  function collectAllResponses() {
    var r = {};
    var els = document.querySelectorAll('.scorm-input, .scorm-input-short, .scorm-select');
    els.forEach(function (el) {
      var id = el.getAttribute('data-interaction');
      if (id !== null) {
        var val = (el.value || '').trim();
        if (val.length > 0) {
          r[id] = val;
        }
      }
    });
    return r;
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
      if (pageNum > state.maxPageReached) {
        state.maxPageReached = pageNum;
      }
      updateNavButtons();
      updateProgressBar();
      updateSidebarLinks(pageNum);
      updateDiagramImage(pageNum);
      CRShared.stopDictation();
      CRShared.timer.switchTo(pageNum, state.pageTimes);
      if (pageNum === 1)                      renderPassCard();
      if (pageNum === CONFIG.gatePageNumber)  handleTimerPage();
      if (pageNum === CONFIG.partALastPage)   populatePartAReview();
      if (pageNum === 17)                     { populatePartBReview(); syncEmailMirror(); }
      if (pageNum === CONFIG.totalPages)      populateFinalStats();

      saveState();
      window.scrollTo(0, 0);
    }
  }

  window.goToPage = function(pageNum) {
    if (CONFIG.demo || pageNum <= state.maxPageReached) {          // demo: every page reachable
      goToPage(pageNum);
    }
  };

  function nextPage() {
    if (state.currentPage === 1 && !getField(31) && !CONFIG.demo) {
      var w = document.getElementById('pass-warn');
      if (w) w.classList.add('visible');
      var card = document.getElementById('pass-card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (state.currentPage < CONFIG.totalPages) goToPage(state.currentPage + 1);
  }

  // ============================================================
  // PASS HANDLING (first time vs. returner)
  // ============================================================
  function getField(id) {
    var el = document.querySelector('[data-interaction="' + id + '"]');
    return el ? (el.value || '').trim() : '';
  }
  function setField(id, val) {
    var el = document.querySelector('[data-interaction="' + id + '"]');
    if (el) el.value = val;
  }
  function currentMode() { return getField(31) === 'no' ? 'return' : 'first'; }
  function applyMode() {
    var mode = currentMode();
    document.body.classList.toggle('mode-return', mode === 'return');
    document.body.classList.toggle('mode-first',  mode !== 'return');
    var yes = document.getElementById('pass-first'), no = document.getElementById('pass-return');
    if (yes) yes.classList.toggle('selected', getField(31) === 'yes');
    if (no)  no.classList.toggle('selected',  getField(31) === 'no');
    var follow = document.getElementById('pass-followup');
    if (follow) follow.classList.toggle('hidden', mode !== 'return');
    var n = parseInt(getField(33), 10) || 0;
    document.querySelectorAll('.pass-num').forEach(function (el) { el.textContent = n ? String(n) : '2'; });
  }
  function choosePass(answer) {
    setField(31, answer);
    var w = document.getElementById('pass-warn'); if (w) w.classList.remove('visible');
    if (answer === 'no' && !getField(33)) setField(33, String(Math.max(2, state.detectedPasses + 1)));
    if (answer === 'yes') { setField(32, ''); setField(33, '1'); }
    applyMode();
    saveState();
  }
  window.choosePass = choosePass;

  /* Page 1: the "Pass N complete" card for a saved, finished state; the pass question otherwise. */
  function renderPassCard() {
    var done = document.getElementById('pass-done-card');
    var ask  = document.getElementById('pass-card');
    var finished = state.partBSubmittedOnce && state.partASubmitted;
    if (done) done.classList.toggle('hidden', !finished);
    if (ask)  ask.classList.toggle('hidden', finished);
    if (finished && done) {
      var when = state.partBTimestamp ? new Date(state.partBTimestamp).toLocaleDateString() : '';
      var n = document.getElementById('pass-done-num'); if (n) n.textContent = String(state.detectedPasses || 1);
      var d = document.getElementById('pass-done-date'); if (d) d.textContent = when;
      var nx = document.getElementById('pass-next-num'); if (nx) nx.textContent = String((state.detectedPasses || 1) + 1);
    }
    applyMode();
  }

  /* Start a new pass on top of a completed one: keep the map, demographics and email; clear the
     fresh-answer fields; the last pass stays available read-only above each cleared field. */
  function startNewPass() {
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
    var r = collectAllResponses();
    if (!state.lastPass || (state.partBTimestamp && state.lastPass.ts !== state.partBTimestamp)) {
      state.lastPass = { ts: state.partBTimestamp || Date.now(), responses: r };
    }
    FRESH_FIELDS.forEach(function (id) { setField(id, ''); });
    setField(31, 'no');
    setField(33, String((state.detectedPasses || 1) + 1));
    if (!getField(32) && r[29]) setField(32, r[29]);
    state.partASubmitted = false;
    state.partATimestamp = null;
    state.partBUnlocked  = false;
    state.overrideUsed   = false;
    state.partAPosted    = false;
    state.partBTimestamp = null;
    state.maxPageReached = 1;
    renderPreviousAnswers();
    var wc = document.getElementById('word-count-display'); if (wc) wc.textContent = '0';
    saveState();
    goToPage(1);
    applyMode();
  }
  window.startNewPass = startNewPass;

  /* Read-only "Your last answer" block above each fresh field when a previous pass exists. */
  function renderPreviousAnswers() {
    document.querySelectorAll('.prev-answer').forEach(function (el) { el.parentNode.removeChild(el); });
    if (!state.lastPass || !state.lastPass.responses) return;
    var when = new Date(state.lastPass.ts).toLocaleDateString();
    var RANK_LABEL = { 1: 'CS KSAs', 2: 'Core Competencies', 3: 'ELOs', 4: 'Career Mentorship' };
    var rankText = '';
    for (var k = 1; k <= 4; k++) { if (state.lastPass.responses[k]) rankText += RANK_LABEL[k] + ': ' + state.lastPass.responses[k] + '   '; }
    FRESH_FIELDS.forEach(function (id) {
      if (id >= 1 && id <= 4) return;            // ranks get one combined block (below)
      var val = state.lastPass.responses[id];
      if (!val) return;
      var el = document.querySelector('[data-interaction="' + id + '"]');
      if (!el) return;
      var d = document.createElement('details'); d.className = 'prev-answer';
      var sm = document.createElement('summary'); sm.textContent = 'Your last answer (' + when + ')';
      var body = document.createElement('div'); body.className = 'prev-answer-body'; body.textContent = val;
      d.appendChild(sm); d.appendChild(body);
      el.parentNode.insertBefore(d, el);
    });
    if (rankText) {
      var grid = document.querySelector('.rank-grid');
      if (grid) {
        var d2 = document.createElement('details'); d2.className = 'prev-answer';
        var sm2 = document.createElement('summary'); sm2.textContent = 'Your last ranking (' + when + ')';
        var b2 = document.createElement('div'); b2.className = 'prev-answer-body'; b2.textContent = rankText.trim();
        d2.appendChild(sm2); d2.appendChild(b2);
        grid.parentNode.insertBefore(d2, grid);
      }
    }
  }

  /* Page 17 shows a mirror of the page-11 email field so it can still be corrected before Part B is sent. */
  function syncEmailMirror() {
    var real = document.getElementById('student-email'), mirror = document.getElementById('student-email-b');
    if (real && mirror) mirror.value = real.value;
  }
  function bindEmailMirror() {
    var real = document.getElementById('student-email'), mirror = document.getElementById('student-email-b');
    if (!real || !mirror) return;
    mirror.addEventListener('input', function () { real.value = mirror.value; real.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  function bindPassChoice() {
    var yes = document.getElementById('pass-first'), no = document.getElementById('pass-return');
    if (yes) yes.addEventListener('click', function () { choosePass('yes'); });
    if (no)  no.addEventListener('click',  function () { choosePass('no'); });
    var sel32 = document.querySelector('[data-interaction="32"]'), sel33 = document.querySelector('[data-interaction="33"]');
    if (sel32) sel32.addEventListener('change', function () { saveState(); });
    if (sel33) sel33.addEventListener('change', function () { applyMode(); saveState(); });
    var startBtn = document.getElementById('pass-start-next');
    if (startBtn) startBtn.addEventListener('click', startNewPass);
    var reviewBtn = document.getElementById('pass-review-last');
    if (reviewBtn) reviewBtn.addEventListener('click', function () { goToPage(17); });
    // ?pass=2 (or any number) pre-answers the question for links placed on purpose
    var m = /[?&]pass=(\d+)/.exec(location.search);
    if (m && !getField(31)) { setField(31, parseInt(m[1], 10) > 1 ? 'no' : 'yes'); if (parseInt(m[1], 10) > 1) setField(33, m[1]); }
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
    if (state.currentPage === 17) {
      btnNext.classList.add('hidden');
      btnSubmitB.classList.remove('hidden');
    }
    if (state.currentPage === CONFIG.totalPages) {
      btnNext.classList.add('hidden');
      btnBack.disabled = false;
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
      1:'[onclick*="goToPage(1)"]',
      2:'[onclick*="goToPage(2)"]',
      3:'[onclick*="goToPage(2)"]',
      4:'[onclick*="goToPage(4)"]',
      5:'[onclick*="goToPage(4)"]',
      6:'[onclick*="goToPage(4)"]',
      7:'[onclick*="goToPage(4)"]',
      8:'[onclick*="goToPage(4)"]',
      9:'[onclick*="goToPage(9)"]',
      10:'[onclick*="goToPage(9)"]',
      13:'[onclick*="goToPage(13)"]',
      14:'[onclick*="goToPage(13)"]',
      15:'[onclick*="goToPage(15)"]',
      16:'[onclick*="goToPage(16)"]',
      17:'[onclick*="goToPage(16)"]',
      18:'[onclick*="goToPage(16)"]'
    };
    var sel = map[pageNum];
    if (sel) {
      var el = document.querySelector('#sidebar ' + sel);
      if (el) el.classList.add('active');
    }
  }

  // ============================================================
  // PART A SUBMISSION
  // ============================================================
  function submitPartA() {
    if (state.partASubmitted) {
      goToPage(CONFIG.gatePageNumber);
      return;
    }

    var r = collectAllResponses();
    if (!checkStudentEmail(r, 'email-warn', 'student-email')) { saveState(); return; }

    state.responses      = r;
    state.partASubmitted = true;
    state.partATimestamp = Date.now();

    for (var i = 0; i <= 9; i++) {
      if (r[i]) {
        var type = (i >= 1 && i <= 4) || (i >= 7 && i <= 8) ? 'choice' : 'long_fill_in';
        SCORM.setInteraction(i, CONFIG.interactionMap[i], type, r[i]);
      }
    }

    for (var j = 25; j <= 28; j++) {
      if (r[j]) {
        SCORM.setInteraction(j, CONFIG.interactionMap[j], 'long_fill_in', r[j]);
      }
    }

    if (r[29]) {
      SCORM.setInteraction(29, CONFIG.interactionMap[29], 'choice', r[29]);
    }
    if (r[30]) {
      SCORM.setInteraction(30, CONFIG.interactionMap[30], 'long_fill_in', r[30]);
    }
    [31, 32, 33, 34].forEach(function (i) {
      if (r[i]) SCORM.setInteraction(i, CONFIG.interactionMap[i], i === 34 ? 'long_fill_in' : 'choice', r[i]);
    });

    saveState();                       // state must be saved before the resume link is built
    sendToQualtrics(r, 'A');
    state.partAPosted = true;
    saveState();
    goToPage(CONFIG.gatePageNumber);
  }

  /* Student email lives on the Part A review page (interaction 23) and is mirrored on the Part B review. */
  function checkStudentEmail(r, warnId, focusId) {
    if (CONFIG.demo) return true;                       // nothing is sent, so nothing to validate
    var warn = document.getElementById(warnId);
    var studentEmail = (r[23] || '').trim();
    if (warn) warn.classList.remove('visible');
    var msg = '';
    if (!studentEmail) msg = 'Required. Please enter your CCSU email address.';
    else if (!validateEmail(studentEmail)) msg = 'Please enter a valid email address.';
    if (msg) {
      if (warn) { warn.textContent = msg; warn.classList.add('visible'); }
      var f = document.getElementById(focusId); if (f) f.focus();
      return false;
    }
    return true;
  }

  // ============================================================
  // PART B SUBMISSION
  // ============================================================
  function submitPartB() {
    var submitBtn = document.getElementById('btn-submit-b');
    submitBtn.disabled = true;

    var r = collectAllResponses();
    state.responses = r;

    var mentorWarn = document.getElementById('mentor-warn');
    if (mentorWarn) mentorWarn.classList.remove('visible');
    var mentorEmail = (r[24] || '').trim();
    var hasInvalidEmail = !checkStudentEmail(r, 'email-warn-b', 'student-email-b');
    if (mentorEmail && !validateEmail(mentorEmail)) {
      if (mentorWarn) mentorWarn.classList.add('visible');
      if (!hasInvalidEmail) document.getElementById('mentor-email').focus();
      hasInvalidEmail = true;
    }
    if (hasInvalidEmail) {
      submitBtn.disabled = false;
      saveState();
      return;
    }

    for (var idx = 10; idx <= 24; idx++) {
      if (r[idx]) {
        SCORM.setInteraction(idx, CONFIG.interactionMap[idx], 'long_fill_in', r[idx]);
      }
    }

    state.partBSubmittedOnce = true;
    state.partBTimestamp     = Date.now();
    state.detectedPasses     = (state.detectedPasses || 0) + 1;
    state.lastPass           = { ts: state.partBTimestamp, responses: r };

    saveState();                       // save first so the resume link carries the completed pass
    sendToQualtrics(r, 'B');
    SCORM.setScore();
    saveState();
    goToPage(CONFIG.totalPages);

    setTimeout(function() { submitBtn.disabled = false; }, 500);
  }

  function validateEmail(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  }

  // ============================================================
  // QUALTRICS -- hidden form POST via iframe
  // ============================================================
  function sendToQualtrics(r, part) {
    if (CONFIG.demo) { console.log('[CR Path DEMO] Qualtrics post skipped (' + part + ').'); return; }
    var learner_id   = '';
    var learner_name = '';
    try {
      learner_id   = SCORM.getLearnerID()   || '';
      learner_name = SCORM.getLearnerName() || '';
    } catch (e) {}
    if (!learner_name && r[34]) learner_name = r[34];       // website: the name field stands in for the LMS
    var inLMS = CRShared.isLMS();
    var unlock = state.partATimestamp ? CRShared.formatUnlock(state.partATimestamp + CONFIG.timerDuration) : { text: '', iso: '' };
    var resumeUrl = inLMS ? '' : CRShared.resume.build(localStorage.getItem(CONFIG.storageKey) || '{}');
    CRShared.timer.flush();
    var partASeconds = CRShared.timer.sum(state.pageTimes, function (p) { return p <= CONFIG.partALastPage; });
    var partBSeconds = CRShared.timer.sum(state.pageTimes, function (p) { return p >= CONFIG.partBFirstPage; });

    // Resolve instructor from course selection
    var courseKey   = r[29] || 'Other';
    var instructor = INSTRUCTOR_MAP[courseKey] || INSTRUCTOR_MAP['Other'];

    var payload = {
      submission_part:       part,
      deployment:            inLMS ? 'lms' : 'web',
      learner_id:            learner_id,
      learner_name:          learner_name,
      student_email:         r[23] || '',
      mentor_email:          r[24] || '',
      instructor_email:      instructor.email,
      instructor_name:       instructor.name,
      first_pass:            r[31] || '',
      prior_course_section:  r[32] || '',
      pass_number:           r[33] || (state.detectedPasses ? String(state.detectedPasses + (part === 'B' ? 0 : 1)) : '1'),
      detected_passes:       String(state.detectedPasses || 0),
      part_a_timestamp:      state.partATimestamp ? new Date(state.partATimestamp).toISOString() : '',
      part_b_timestamp:      (part === 'B' && state.partBTimestamp) ? new Date(state.partBTimestamp).toISOString() : '',
      part_b_unlocks_at:     unlock.text,
      part_b_unlocks_iso:    unlock.iso,
      resume_url:            resumeUrl,
      page_times:            JSON.stringify(state.pageTimes),
      part_a_seconds:        String(partASeconds),
      part_b_seconds:        String(partBSeconds),
      opening_response:      r[0]  || '',
      rank_csksa:            r[1]  || '',
      rank_core:             r[2]  || '',
      rank_elo:              r[3]  || '',
      rank_cm:               r[4]  || '',
      explain_strongest:     r[5]  || '',
      explain_weakest:       r[6]  || '',
      demo_year:             r[7]  || '',
      demo_school:           r[8]  || '',
      demo_major:            r[9]  || '',
      map_csksa_experience:  r[10] || '',
      map_csksa_learned:     r[11] || '',
      map_csksa_relevance:   r[12] || '',
      map_core_experience:   r[13] || '',
      map_core_learned:      r[14] || '',
      map_core_relevance:    r[15] || '',
      map_elo_experience:    r[16] || '',
      map_elo_learned:       r[17] || '',
      map_elo_relevance:     r[18] || '',
      map_cm_experience:     r[19] || '',
      map_cm_learned:        r[20] || '',
      map_cm_relevance:      r[21] || '',
      baseline_reflection:   r[22] || '',
      define_csksa:          r[25] || '',
      define_core:           r[26] || '',
      define_elo:            r[27] || '',
      define_cm:             r[28] || '',
      course_section:        r[29] || '',
      course_other:          r[30] || ''
    };

    CRShared.qualtricsPost(CONFIG.qualtricsUrl, payload, CONFIG.postKeepMs);
  }

  // ============================================================
  // TIMER
  // ============================================================
  function handleTimerPage() {
    var locked   = document.getElementById('timer-locked');
    var unlocked = document.getElementById('timer-unlocked');

    if (state.partBUnlocked || state.overrideUsed) {
      locked.classList.add('hidden');
      unlocked.classList.remove('hidden');
      updateNavButtons();
      return;
    }

    if (!state.partATimestamp) { state.partATimestamp = Date.now(); }
    var ua = document.getElementById('unlock-at');
    if (ua) ua.textContent = CRShared.formatUnlock(state.partATimestamp + CONFIG.timerDuration).text;

    var elapsed = Date.now() - state.partATimestamp;
    if (elapsed >= CONFIG.timerDuration) {
      state.partBUnlocked = true;
      locked.classList.add('hidden');
      unlocked.classList.remove('hidden');
      saveState();
      updateNavButtons();
    } else {
      locked.classList.remove('hidden');
      unlocked.classList.add('hidden');
      startCountdown();
    }
  }

  function startCountdown() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    function update() {
      var remaining = (state.partATimestamp + CONFIG.timerDuration) - Date.now();   // from the clock: no drift in background tabs
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
      document.getElementById('countdown').textContent =
        pad(h) + ':' + pad(m) + ':' + pad(s);
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
        state.overrideUsed = true;
        state.partBUnlocked = true;
        modal.classList.add('hidden');
        saveState();
        handleTimerPage();
        updateNavButtons();
      } else {
        error.classList.remove('hidden');
      }
    });

    cancelBtn.addEventListener('click', function () {
      modal.classList.add('hidden');
    });
    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') submitBtn.click();
    });
  }

  // ============================================================
  // TABS
  // ============================================================
  function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tabId = this.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(function (c) {
          c.classList.remove('active');
        });
        this.classList.add('active');
        document.getElementById(tabId).classList.add('active');
      });
    });
  }

  // ============================================================
  // WORD COUNT
  // ============================================================
  function bindWordCount() {
    var ta   = document.getElementById('response-baseline');
    var disp = document.getElementById('word-count-display');
    if (!ta || !disp) return;
    function updateCount() {
      var words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
      disp.textContent = words;
      disp.style.color =
        (words >= 150 && words <= 250) ? '#27ae60' :
        words > 250 ? '#e67e22' : '#777';
    }
    ta.addEventListener('input', updateCount);
    updateCount();
  }

  // ============================================================
  // SEARCHABLE COURSE DROPDOWN
  // ============================================================
  function buildCourseSearch() {
    var searchInput = document.getElementById('course-search');
    var hiddenInput = document.getElementById('course-section');
    var dropdown    = document.getElementById('course-dropdown');
    var otherInput  = document.getElementById('course-other');
    if (!searchInput || !hiddenInput || !dropdown) return;

    // Build entries array from INSTRUCTOR_MAP
    var entries = [];
    for (var key in INSTRUCTOR_MAP) {
      if (INSTRUCTOR_MAP.hasOwnProperty(key)) {
        entries.push({ value: key, display: INSTRUCTOR_MAP[key].display });
      }
    }

    function renderList(filter) {
      dropdown.innerHTML = '';
      var lowerFilter = (filter || '').toLowerCase();

      // Separate "Other" from regular entries
      var regular = [];
      var otherEntry = null;
      entries.forEach(function (e) {
        if (e.value === 'Other') {
          otherEntry = e;
        } else if (!lowerFilter || e.display.toLowerCase().indexOf(lowerFilter) !== -1) {
          regular.push(e);
        }
      });

      if (regular.length === 0 && lowerFilter) {
        var noMatch = document.createElement('div');
        noMatch.className = 'course-option course-option-empty';
        noMatch.textContent = 'No matches found';
        dropdown.appendChild(noMatch);
      } else {
        regular.forEach(function (e) {
          var div = document.createElement('div');
          div.className = 'course-option';
          div.textContent = e.display;
          div.setAttribute('data-value', e.value);
          div.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            selectCourse(e.value, e.display);
          });
          dropdown.appendChild(div);
        });
      }

      // Always show "Other" at bottom with divider
      if (otherEntry) {
        var divider = document.createElement('div');
        divider.className = 'course-option-divider';
        dropdown.appendChild(divider);
        var otherDiv = document.createElement('div');
        otherDiv.className = 'course-option course-option-other';
        otherDiv.textContent = otherEntry.display;
        otherDiv.setAttribute('data-value', 'Other');
        otherDiv.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          selectCourse('Other', '');
        });
        dropdown.appendChild(otherDiv);
      }

      dropdown.classList.remove('hidden');
    }

    function selectCourse(value, displayText) {
      hiddenInput.value = value;
      dropdown.classList.add('hidden');

      if (value === 'Other') {
        searchInput.value = '';
        searchInput.placeholder = 'Other selected -- type your course below';
        if (otherInput) {
          otherInput.classList.remove('hidden');
          otherInput.removeAttribute('aria-hidden');
          otherInput.focus();
        }
      } else {
        searchInput.value = displayText;
        searchInput.placeholder = 'Start typing to search...';
        if (otherInput) {
          otherInput.classList.add('hidden');
          otherInput.setAttribute('aria-hidden', 'true');
          otherInput.value = '';
        }
      }

      // Trigger change event for auto-save
      var evt = document.createEvent('Event');
      evt.initEvent('change', true, true);
      hiddenInput.dispatchEvent(evt);
    }

    // Show list on focus
    searchInput.addEventListener('focus', function () {
      renderList(this.value);
    });

    // Filter on input
    searchInput.addEventListener('input', function () {
      // If user clears or changes text, reset hidden value
      hiddenInput.value = '';
      if (otherInput) {
        otherInput.classList.add('hidden');
        otherInput.setAttribute('aria-hidden', 'true');
      }
      renderList(this.value);
    });

    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', function (e) {
      if (dropdown.classList.contains('hidden')) return;
      var options = dropdown.querySelectorAll('.course-option:not(.course-option-empty)');
      var active  = dropdown.querySelector('.course-option.highlighted');
      var idx = -1;

      if (active) {
        for (var i = 0; i < options.length; i++) {
          if (options[i] === active) { idx = i; break; }
        }
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (active) active.classList.remove('highlighted');
        idx = (idx + 1) % options.length;
        options[idx].classList.add('highlighted');
        options[idx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (active) active.classList.remove('highlighted');
        idx = (idx - 1 + options.length) % options.length;
        options[idx].classList.add('highlighted');
        options[idx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active) {
          var val = active.getAttribute('data-value');
          var disp = active.textContent;
          selectCourse(val, val === 'Other' ? '' : disp);
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
        searchInput.blur();
      }
    });

    // Restore display if already has a value (from SCORM restore)
    restoreCourseSearchDisplay();
  }

  // ============================================================
  // AUTO-SAVE
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

    document.addEventListener('change', function (e) {
      if (e.target.matches('.scorm-select')) {
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          state.responses = collectAllResponses();
          saveState();
        }, 500);
      }
    });

    window.addEventListener('beforeunload', function () {
      state.responses = collectAllResponses();
      saveState();
      SCORM.terminate();
    });

    window.addEventListener('pagehide', function () {
      state.responses = collectAllResponses();
      saveState();
      SCORM.terminate();
    });

    document.addEventListener('keydown', function (e) {
      if (e.shiftKey && e.altKey && e.key === 'R') {
        if (confirm('Reset module to page 1? All responses will be cleared.')) {
          resetModule();
        }
      }
    });
  }

  // ============================================================
  // NACE TOOLTIPS
  // ============================================================
  function bindNaceTooltips() {
    document.querySelectorAll('.nace-tag').forEach(function (tag) {
      tag.addEventListener('click', function () {
        openNaceTooltip(this.getAttribute('data-key'));
      });
      tag.addEventListener('keypress', function (e) {
        if (e.key === 'Enter' || e.key === ' ') openNaceTooltip(this.getAttribute('data-key'));
      });
    });
    document.getElementById('tip-close').addEventListener('click', closeNaceTooltip);
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
    document.querySelectorAll('.nace-tag').forEach(function (t) {
      t.classList[t.getAttribute('data-key') === key ? 'add' : 'remove']('active');
    });
  }

  function closeNaceTooltip() {
    document.getElementById('nace-overlay').classList.add('hidden');
    document.getElementById('nace-tooltip').classList.add('hidden');
    document.querySelectorAll('.nace-tag').forEach(function (t) {
      t.classList.remove('active');
    });
  }

  window.closeNaceTooltip = closeNaceTooltip;

  // ============================================================
  // REVIEW PAGES
  // ============================================================
  function populatePartAReview() {
    var r = collectAllResponses();
    set('review-opening', r[0] || '[No response entered]');

    var defs = '';
    if (r[25]) defs += 'CS KSAs: ' + r[25] + '\n';
    if (r[26]) defs += 'Core Competencies: ' + r[26] + '\n';
    if (r[27]) defs += 'ELOs: ' + r[27] + '\n';
    if (r[28]) defs += 'Career Mentorship: ' + r[28] + '\n';
    set('review-definitions', defs || '[No definitions entered]');

    var rankings = '';
    var comps = ['CS KSAs','Core Competencies','ELOs','Career Mentorship'];
    for (var i = 1; i <= 4; i++) {
      if (r[i]) rankings += comps[i-1] + ': Rank ' + r[i] + '\n';
    }
    set('review-rankings', rankings || '[No rankings selected]');
    set('review-strongest', r[5] || '[No explanation entered]');
    set('review-weakest',   r[6] || '[No explanation entered]');
    var demo = '';
    if (r[7]) demo += 'Year: '   + r[7] + '\n';
    if (r[8]) demo += 'School: ' + r[8] + '\n';
    if (r[9]) demo += 'Major: '  + r[9] + '\n';
    if (r[29]) {
      var courseEntry = INSTRUCTOR_MAP[r[29]];
      var courseName = courseEntry ? courseEntry.display : r[29];
      demo += 'Course: ' + courseName + (r[30] ? ' (' + r[30] + ')' : '') + '\n';
    }
    if (r[34]) demo = 'Name: ' + r[34] + '\n' + demo;
    if (r[31] === 'no') {
      var prior = INSTRUCTOR_MAP[r[32]];
      demo += 'CR Path pass: ' + (r[33] || '2') + (r[32] ? ' (last walked in ' + (prior ? prior.display : r[32]) + ')' : '') + '\n';
    } else if (r[31] === 'yes') { demo += 'CR Path pass: 1 (first time)\n'; }
    set('review-demographics', demo || '[No demographics entered]');
  }

  function populatePartBReview() {
    var r = collectAllResponses();
    var map = '';
    var rows = [
      {name:'CS KSAs',          start:10},
      {name:'Core Competencies', start:13},
      {name:'ELOs',              start:16},
      {name:'Career Mentorship', start:19}
    ];
    rows.forEach(function (row) {
      map += '--- ' + row.name + ' ---\n';
      map += 'Experience: '     + (r[row.start]   || '[empty]') + '\n';
      map += 'Learned: '        + (r[row.start+1] || '[empty]') + '\n';
      map += 'Why it matters: ' + (r[row.start+2] || '[empty]') + '\n\n';
    });
    set('review-map',      map);
    set('review-baseline', r[22] || '[No reflection entered]');
  }

  function populateFinalStats() {
    var r = collectAllResponses();
    var count = Object.keys(r).filter(function (k) {
      return r[k] && r[k].trim().length > 0;
    }).length;
    document.getElementById('total-responses').textContent = count;
    if (state.partATimestamp) {
      document.getElementById('part-a-date').textContent =
        new Date(state.partATimestamp).toLocaleDateString();
    }
    document.getElementById('part-b-date').textContent =
      state.partBTimestamp ? new Date(state.partBTimestamp).toLocaleDateString() : '--';
    document.querySelectorAll('.pass-done-n').forEach(function (el) { el.textContent = String(state.detectedPasses || 1); });
  }

  function set(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ============================================================
  // RESET -- demo and testing use only
  // ============================================================
  function resetModule() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    SCORM.reset();
    state.currentPage        = 1;
    state.maxPageReached     = 1;
    state.partASubmitted     = false;
    state.partATimestamp     = null;
    state.partBUnlocked      = false;
    state.overrideUsed       = false;
    state.partBSubmittedOnce = false;
    state.partBTimestamp     = null;
    state.partAPosted        = false;
    state.detectedPasses     = 0;
    state.lastPass           = null;
    state.pageTimes          = {};
    state.responses          = {};
    document.querySelectorAll('.prev-answer').forEach(function (el) { el.parentNode.removeChild(el); });
    document.body.classList.remove('mode-return');
    document.querySelectorAll(
      '.scorm-input, .scorm-input-short, .scorm-select'
    ).forEach(function (el) { el.value = ''; });
    // Also reset course search display
    var searchInput = document.getElementById('course-search');
    if (searchInput) {
      searchInput.value = '';
      searchInput.placeholder = 'Start typing to search...';
    }
    goToPage(1);
    console.log('[CR Path] Module reset complete. Starting from page 1.');
  }

  window.resetModule = resetModule;

  // ============================================================
  // INITIALIZATION
  // ============================================================
  function init() {
    if (CONFIG.demo) {
      SCORM = CRShared.demoSCORM();                       // nothing persists, nothing is sent
      state.partBUnlocked = true;                         // gate open; all pages walkable
      document.body.classList.add('demo');
      if (!document.getElementById('demo-banner')) CRShared.banner('DEMO \u2014 nothing you type here is saved or sent. The 24-hour gate is open.');
      /* Demo layer hook: show a "last pass" above the fresh fields (supervisor walkthrough). */
      window.demoSetLastPass = function (responses, ts) {
        state.lastPass = responses ? { ts: ts || (Date.now() - 63072000000), responses: responses } : null;
        renderPreviousAnswers();
      };
    }
    SCORM.init();
    document.body.classList.toggle('in-lms', CRShared.isLMS());
    loadState();
    bindNavigation();
    bindTabs();
    bindOverride();
    bindWordCount();
    buildCourseSearch();
    bindAutoSave();
    bindNaceTooltips();
    bindPassChoice();
    bindEmailMirror();
    renderPreviousAnswers();
    applyMode();
    if (!CONFIG.demo) CRShared.attachDictation('textarea.scorm-input');

    if (state.partBSubmittedOnce && state.partASubmitted) {
      goToPage(1);                                        // finished pass: page 1 offers the next pass or a review
    } else {
      goToPage(state.currentPage);
    }
  }

  // ============================================================
  // LAUNCH
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();