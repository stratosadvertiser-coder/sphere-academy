// ============================================================
// EMIL FADE-UP — global on-scroll reveal applied to every section,
// card, post, lesson, etc. without per-page wiring. Looks for the
// most common content containers, slaps .fade-up-emil on them, and
// intersects them into .in-view as the user scrolls. Respects
// prefers-reduced-motion via CSS so this can stay running for
// everyone.
// ============================================================
(function emilFadeUp() {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
  // Anything we want to fade up gets this class. Done as a function so
  // future dynamic content (feed posts, students rows) can call this too.
  function tag() {
    const targets = document.querySelectorAll(
      'section > .container, ' +
      '.dash-section, ' +
      '.hero-eyebrow, .hero h1, .hero p, .hero-actions, .hero-meta, ' +
      '.post, .win-item, .ann-item, .faq-item, .event-card, ' +
      '.course-card, .bento-card, .feature-card, .about-pillar, ' +
      '.pricing-card, .testimonial-card, .outcome-card, .member-card, ' +
      '.key-takeaways, .lesson-body > h2, ' +
      '.section-h, .section-label, .section-sub, ' +
      '.admin-editor-card, .auth-card'
    );
    targets.forEach((el) => {
      if (!el.classList.contains('fade-up-emil')) {
        el.classList.add('fade-up-emil');
      }
    });
  }
  function observe() {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.fade-up-emil:not(.in-view)').forEach((el) => obs.observe(el));
  }
  function init() {
    tag();
    observe();
    // Re-tag after dynamic renders so new posts/wins/lessons animate too.
    // Throttled so flurries of mutations don't thrash.
    let pending = null;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        tag();
        observe();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ===== SAFE localStorage HELPER =====
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.error('localStorage quota exceeded or unavailable:', e);
    // Show user-friendly message
    const toast = document.getElementById('adminToast') || document.getElementById('profileToast');
    if (toast) {
      toast.innerHTML = '<span>&#9888;</span> Storage full — please clear some data.';
      toast.style.display = 'flex';
      setTimeout(() => { toast.style.display = 'none'; }, 4000);
    }
    return false;
  }
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.error('localStorage unavailable:', e);
    return null;
  }
}

function safeGetJSON(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (e) {
    console.error('Failed to parse localStorage key:', key, e);
    return fallback;
  }
}

// ===== PROGRESS TRACKER =====
const PROGRESS = {
  STORAGE_KEY: 'lesson_progress',

  getAll() {
    return safeGetJSON(this.STORAGE_KEY, {});
  },

  isCompleted(weekId) {
    return this.getAll()[weekId] === true;
  },

  toggle(weekId) {
    const data = this.getAll();
    if (data[weekId]) {
      delete data[weekId];
    } else {
      data[weekId] = true;
    }
    safeSetItem(this.STORAGE_KEY, JSON.stringify(data));
    try { if (typeof USER_SYNC !== 'undefined') USER_SYNC.save(); } catch (e) {}
    return this.isCompleted(weekId);
  },

  getCompletedCount() {
    return Object.values(this.getAll()).filter(Boolean).length;
  },

  getPercentage() {
    return Math.round((this.getCompletedCount() / 16) * 100);
  },

  // Last accessed lesson (for "Continue" button on dashboard)
  LAST_KEY: 'last_accessed_lesson',
  setLastAccessed(weekId) { if (weekId) safeSetItem(this.LAST_KEY, weekId); },
  getLastAccessed() { return safeGetItem(this.LAST_KEY) || ''; }
};

// ===== ACTIVITY FEED (dashboard recent-activity tracker) =====
const ACTIVITY = {
  KEY: 'activity_feed',
  MAX: 20,
  log(type, weekId, title) {
    try {
      const list = safeGetJSON(this.KEY, []);
      list.unshift({ type, weekId: weekId || '', title: title || '', date: new Date().toISOString() });
      const trimmed = list.slice(0, this.MAX);
      safeSetItem(this.KEY, JSON.stringify(trimmed));
    } catch (e) { /* non-fatal */ }
  },
  getAll() {
    const v = safeGetJSON(this.KEY, []);
    return Array.isArray(v) ? v : [];
  },
  labelFor(type) {
    return ({
      lesson_viewed: 'Viewed lesson',
      lesson_completed: 'Completed lesson',
      quiz_passed: 'Passed quiz',
      quiz_failed: 'Tried quiz',
      assignment_submitted: 'Submitted assignment'
    })[type] || 'Activity';
  },
  iconFor(type) {
    // Returns inline SVG path
    const map = {
      lesson_viewed:      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
      lesson_completed:   '<polyline points="20 6 9 17 4 12"/>',
      quiz_passed:        '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
      quiz_failed:        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      assignment_submitted:'<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'
    };
    const path = map[type] || '<circle cx="12" cy="12" r="10"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  }
};

// ============================================================
// DATA_SYNC — Firestore cloud sync for shared admin content
// ============================================================
// Keeps admin-edited content (lessons, month names, tags, etc.)
// in sync across all devices/students via Firebase Firestore.
// Falls back gracefully to localStorage-only if Firestore
// is not configured.
// ============================================================
const DATA_SYNC = {
  db: null,
  storage: null,
  COLLECTION: 'sphere_lms',
  loaded: false,

  isEnabled() {
    return typeof FIREBASE_ENABLED !== 'undefined'
      && FIREBASE_ENABLED
      && typeof firebase !== 'undefined'
      && firebase.firestore;
  },

  init() {
    if (!this.isEnabled()) return;
    try {
      if (!firebase.apps.length && typeof FIREBASE_CONFIG !== 'undefined') {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      this.db = firebase.firestore();
      // Storage — used by assignment uploads so the admin inspector can
      // open the actual file (not just see metadata). Optional: if the
      // SDK isn't loaded on this page, this stays null and the upload
      // helper falls back to metadata-only.
      try {
        if (firebase.storage) this.storage = firebase.storage();
      } catch (e) { console.warn('[SYNC] Storage init failed:', e.message); }

      // Sign in anonymously so Firestore writes work (required for rule "request.auth != null")
      // Only if no user is already signed in (e.g. via Google OAuth)
      //
      // Also expose this.ready — a promise that resolves once auth has
      // settled either way. Callers like the login.html fallback can
      // `await DATA_SYNC.ready` before issuing reads, so they don't
      // race against the initial signInAnonymously() and get a
      // permission-denied error on the very first login attempt.
      this.ready = new Promise(resolve => {
        if (!firebase.auth) { resolve(); return; }
        let resolved = false;
        const markReady = () => { if (!resolved) { resolved = true; resolve(); } };
        firebase.auth().onAuthStateChanged(user => {
          if (!user) {
            firebase.auth().signInAnonymously()
              .then(() => {
                console.log('[SYNC] Firebase anonymous auth ready');
                if (typeof backfillCommunityToFirestore === 'function') {
                  backfillCommunityToFirestore();
                }
                markReady();
              })
              .catch(e => {
                console.warn('[SYNC] Anonymous auth failed (writes may fail):', e.message);
                markReady(); // still resolve so login form doesn't hang
              });
          } else {
            if (typeof backfillCommunityToFirestore === 'function') {
              backfillCommunityToFirestore();
            }
            markReady();
          }
        });
        // Safety net — if onAuthStateChanged never fires (e.g. Firebase
        // is blocked by ad blocker or CSP), resolve after 4s so the
        // login form falls through to localStorage-only mode.
        setTimeout(markReady, 4000);
      });
    } catch (e) {
      console.error('Firestore init failed:', e);
      // Even on init failure, resolve `ready` so awaits don't hang.
      this.ready = Promise.resolve();
    }
  },

  // Fetch all shared content from Firestore and cache in localStorage
  async loadAll() {
    if (!this.db) return false;
    try {
      const [lessonsSnap, settingsSnap, cardImgsSnap, emojisSnap] = await Promise.all([
        this.db.collection(this.COLLECTION).doc('lessons').get(),
        this.db.collection(this.COLLECTION).doc('settings').get(),
        this.db.collection(this.COLLECTION).doc('card_images').get(),
        this.db.collection(this.COLLECTION).doc('card_emojis').get()
      ]);

      // Lessons
      if (lessonsSnap.exists) {
        const lessonsData = lessonsSnap.data();
        if (lessonsData && lessonsData.data) {
          safeSetItem('lessons_data', JSON.stringify(lessonsData.data));
        }
      }

      // Settings (month names, prefixes, skill tags, title)
      if (settingsSnap.exists) {
        const s = settingsSnap.data();
        if (s.month_names) safeSetItem('site_month_names', JSON.stringify(s.month_names));
        if (s.month_prefixes) safeSetItem('site_month_prefixes', JSON.stringify(s.month_prefixes));
        if (s.month_descriptions) safeSetItem('site_month_descriptions', JSON.stringify(s.month_descriptions));
        if (s.skill_tags) safeSetItem('site_skill_tags', JSON.stringify(s.skill_tags));
        if (s.section_title) safeSetItem('site_section_title', s.section_title);
        if (s.feature_cards) safeSetItem('site_feature_cards', JSON.stringify(s.feature_cards));
        if (s.outcome_images) safeSetItem('outcome_images', JSON.stringify(s.outcome_images));
        if (s.outcome_text) safeSetItem('outcome_text', JSON.stringify(s.outcome_text));
        if (s.testimonials) safeSetItem('intern_testimonials', JSON.stringify(s.testimonials));
        if (s.about_text) safeSetItem('about_text', JSON.stringify(s.about_text));
        if (s.about_pillars) safeSetItem('about_pillars', JSON.stringify(s.about_pillars));
      }

      // Card images
      if (cardImgsSnap.exists) {
        const imgs = cardImgsSnap.data();
        for (let m = 1; m <= 4; m++) {
          const img = imgs['month_' + m];
          if (img) safeSetItem('card_image_' + m, img);
          const pos = imgs['month_' + m + '_pos'];
          if (pos !== undefined) safeSetItem('card_image_pos_' + m, pos);
        }
      }

      // Card emojis
      if (emojisSnap.exists) {
        const emojis = emojisSnap.data();
        if (emojis && emojis.data) {
          safeSetItem('site_card_emojis', JSON.stringify(emojis.data));
        }
      }

      this.loaded = true;
      return true;
    } catch (e) {
      console.error('Firestore load failed:', e);
      return false;
    }
  },

  // Save lessons array to Firestore
  async saveLessons(lessons) {
    if (!this.db) {
      console.warn('[SYNC] Firestore not initialized — admin changes will NOT sync to students.');
      return;
    }
    try {
      await this.db.collection(this.COLLECTION).doc('lessons').set({
        data: lessons,
        updated: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log('[SYNC] ✓ Lessons saved to Firestore');
    } catch (e) {
      console.error('[SYNC] ✗ Save lessons FAILED:', e.code || '', e.message || e);
      if (e.code === 'permission-denied') {
        alert('Firestore Permission Denied!\n\nYour Firestore rules are blocking writes.\n\nFix at: https://console.firebase.google.com/project/marketing-intern-54252/firestore/rules\n\nSee FIREBASE_SETUP.md Part 3.');
      } else if (e.code === 'unavailable' || e.code === 'failed-precondition') {
        alert('Firestore is not enabled!\n\nEnable at: https://console.firebase.google.com/project/marketing-intern-54252/firestore\n\nClick "Create database", choose Production mode, pick a location, enable.');
      }
    }
  },

  // Save site settings (partial update)
  async saveSettings(partial) {
    if (!this.db) return;
    try {
      await this.db.collection(this.COLLECTION).doc('settings').set({
        ...partial,
        updated: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) { console.error('Save settings failed:', e); }
  },

  // Save one card image
  async saveCardImage(month, dataUrl, position) {
    if (!this.db) return;
    try {
      const update = { ['month_' + month]: dataUrl };
      if (position !== undefined) update['month_' + month + '_pos'] = position;
      await this.db.collection(this.COLLECTION).doc('card_images').set(update, { merge: true });
    } catch (e) { console.error('Save card image failed:', e); }
  },

  async removeCardImage(month) {
    if (!this.db) return;
    try {
      const update = {};
      update['month_' + month] = firebase.firestore.FieldValue.delete();
      update['month_' + month + '_pos'] = firebase.firestore.FieldValue.delete();
      await this.db.collection(this.COLLECTION).doc('card_images').set(update, { merge: true });
    } catch (e) { console.error('Remove card image failed:', e); }
  },

  // Save program-outcome carousel images array
  async saveOutcomeImages(images) {
    if (!this.db) return;
    try {
      await this.db.collection(this.COLLECTION).doc('settings').set({
        outcome_images: images,
        updated: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) { console.error('Save outcome images failed:', e); }
  },

  async saveCardEmojis(emojis) {
    if (!this.db) return;
    try {
      await this.db.collection(this.COLLECTION).doc('card_emojis').set({
        data: emojis,
        updated: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) { console.error('Save emojis failed:', e); }
  }
};

// Initialize Firestore immediately
DATA_SYNC.init();

// ============================================================
// USER_SYNC — Per-student data sync to Firestore (for admin analytics)
// Each logged-in student writes a lightweight snapshot of their progress,
// quiz scores, assignment submissions, and activity to users/{username}.
// Admin analytics aggregates across all users.
// ============================================================
const USER_SYNC = {
  COLLECTION: 'sphere_users',
  lastWrite: 0,
  MIN_INTERVAL_MS: 5000, // throttle writes — at most once per 5 sec

  _buildSnapshot() {
    try {
      const username = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
      if (!username) return null;
      // Progress: { w1: true, ... }
      const progress = (typeof PROGRESS !== 'undefined') ? PROGRESS.getAll() : {};
      // Quiz scores: { w1: 85, w2: 100, ... } — percentages only
      const quizRaw = (typeof QUIZ_RESULTS !== 'undefined') ? QUIZ_RESULTS.getAll() : {};
      const quizScores = {};
      const quizAttempts = {};
      Object.keys(quizRaw).forEach(k => {
        if (quizRaw[k] && typeof quizRaw[k].percentage === 'number') quizScores[k] = quizRaw[k].percentage;
        if (quizRaw[k] && typeof quizRaw[k].attempts === 'number') quizAttempts[k] = quizRaw[k].attempts;
      });
      // Assignments: full submission detail — files (metadata only) + links — so the
      // admin can review what each student submitted. Bytes are not included
      // (we never had them anyway), but filenames, sizes, types, link URLs and
      // submittedAt timestamps all sync.
      const asgnRaw = (typeof ASSIGNMENTS !== 'undefined') ? ASSIGNMENTS.getAll() : {};
      const assignments = {};         // legacy: { w1: true, ... } for fast checks
      const assignmentDetails = {};   // new:    { w1: { files, links, submittedAt }, ... }
      Object.keys(asgnRaw).forEach(k => {
        const sub = asgnRaw[k];
        if (sub && sub.submitted) {
          assignments[k] = true;
          assignmentDetails[k] = {
            files: Array.isArray(sub.files) ? sub.files : [],
            links: Array.isArray(sub.links) ? sub.links : [],
            submittedAt: sub.submittedAt || null
          };
        }
      });
      // Activity-by-day rollup (last 30 days) for engagement chart
      const activity = (typeof ACTIVITY !== 'undefined') ? ACTIVITY.getAll() : [];
      const activityByDay = {};
      activity.forEach(e => {
        if (!e.date) return;
        const day = e.date.slice(0, 10); // YYYY-MM-DD
        activityByDay[day] = (activityByDay[day] || 0) + 1;
      });
      // Earned badges — sync so other students can see this user's
      // achievements in the Members panel.
      let earnedBadges = [];
      try {
        if (typeof BADGES !== 'undefined' && BADGES.evaluate) {
          earnedBadges = Array.from(BADGES.evaluate());
        }
      } catch (e) { /* non-fatal */ }
      // Include the user's avatar (base64 data URL) so it syncs across
      // devices and shows up in the admin's All Students table. Without
      // this, every student card falls back to initials even when they've
      // uploaded a profile picture.
      const avatar = (AUTH.getAvatarImage && AUTH.getAvatarImage()) || null;
      return {
        username,
        displayName: (AUTH.getDisplayName && AUTH.getDisplayName()) || username,
        role: (AUTH.isAdmin && AUTH.isAdmin()) ? 'admin' : 'student',
        avatar,
        progress,
        quizScores,
        quizAttempts,
        assignments,
        assignmentDetails,
        activityByDay,
        earnedBadges,
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
      };
    } catch (e) {
      console.warn('[USER_SYNC] buildSnapshot failed:', e);
      return null;
    }
  },

  // Write snapshot to Firestore (throttled)
  save(force) {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    if (typeof AUTH === 'undefined' || !AUTH.isLoggedIn || !AUTH.isLoggedIn()) return;
    const now = Date.now();
    if (!force && (now - this.lastWrite) < this.MIN_INTERVAL_MS) return;
    this.lastWrite = now;
    const snap = this._buildSnapshot();
    if (!snap) return;
    try {
      DATA_SYNC.db.collection(this.COLLECTION).doc(snap.username).set(snap, { merge: true })
        .catch(e => console.warn('[USER_SYNC] write failed:', e.message));
    } catch (e) { /* non-fatal */ }
  },

  // Admin: fetch all student docs
  async fetchAll() {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return [];
    try {
      const snap = await DATA_SYNC.db.collection(this.COLLECTION).get();
      const out = [];
      snap.forEach(doc => out.push({ id: doc.id, ...doc.data() }));
      return out;
    } catch (e) {
      console.error('[USER_SYNC] fetchAll failed:', e);
      return [];
    }
  }
};

// ============================================================
// PRESENCE — Lightweight heartbeat so students see who's online
// Writes a `lastSeen` timestamp to sphere_users/{username} every
// HEARTBEAT_MS. A user is considered "online" if their lastSeen
// is within ONLINE_WINDOW_MS of the current time.
// ============================================================
const PRESENCE = {
  HEARTBEAT_MS: 30000,    // 30s — write heartbeat every half-minute
  ONLINE_WINDOW_MS: 90000, // 90s — anyone whose lastSeen is older is "offline"
  _heartbeatTimer: null,
  _unsub: null,
  _started: false,

  start() {
    if (this._started) return;
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    if (typeof AUTH === 'undefined' || !AUTH.isLoggedIn || !AUTH.isLoggedIn()) return;
    this._started = true;
    this._writeHeartbeat();
    this._heartbeatTimer = setInterval(() => this._writeHeartbeat(), this.HEARTBEAT_MS);

    // When tab regains focus, push a fresh heartbeat right away
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this._writeHeartbeat();
    });
  },

  stop() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
    if (typeof this._unsub === 'function') { try { this._unsub(); } catch (e) {} }
    this._unsub = null;
    this._started = false;
  },

  _writeHeartbeat() {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    if (typeof AUTH === 'undefined' || !AUTH.getUser) return;
    const username = AUTH.getUser();
    if (!username) return;
    const displayName = (AUTH.getDisplayName && AUTH.getDisplayName()) || username;
    const role = (AUTH.isAdmin && AUTH.isAdmin()) ? 'admin' : 'student';
    const avatar = (AUTH.getAvatarImage && AUTH.getAvatarImage()) || null;
    try {
      DATA_SYNC.db.collection('sphere_users').doc(username).set({
        username,
        displayName,
        role,
        avatar,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});
    } catch (e) { /* non-fatal */ }
  },

  // Real-time listener — calls onUpdate(usersArray) whenever any user doc changes.
  startLiveListener(onUpdate) {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return null;
    if (typeof this._unsub === 'function') { try { this._unsub(); } catch (e) {} }
    this._unsub = DATA_SYNC.db.collection('sphere_users').onSnapshot(snap => {
      const users = [];
      snap.forEach(doc => {
        const data = doc.data() || {};
        users.push({
          username: doc.id,
          displayName: data.displayName || doc.id,
          avatar: data.avatar || null,
          // True when the avatar is the auto-generated Sphere logo
          // (set by applyLogoAvatar) and the user hasn't replaced
          // it with their own photo yet. Lets UI like the hero
          // trust strip skip these and show initials instead.
          avatarIsDefault: data.avatarIsDefault === true,
          role: data.role || 'student',
          earnedBadges: Array.isArray(data.earnedBadges) ? data.earnedBadges : [],
          lastSeenMs: this._toMs(data.lastSeen) || this._toMs(data.lastActive) || 0
        });
      });
      onUpdate(users);
    }, err => _handleSyncError('PRESENCE', err));
    return this._unsub;
  },

  _toMs(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    return 0;
  },

  isOnline(user) {
    if (!user || !user.lastSeenMs) return false;
    return (Date.now() - user.lastSeenMs) < this.ONLINE_WINDOW_MS;
  }
};

// ============================================================
// ANALYTICS — Aggregate all student data for admin dashboard
// ============================================================
const ANALYTICS = {
  // Compute everything from a fetched user list
  compute(users) {
    // Only include students (exclude admin)
    const students = (users || []).filter(u => (u.role || 'student') === 'student');
    const total = students.length;

    // Completion rate per lesson (w1..w16)
    const completionByWeek = {};
    for (let i = 1; i <= 16; i++) {
      const wid = 'w' + i;
      let done = 0;
      students.forEach(u => { if (u.progress && u.progress[wid]) done++; });
      completionByWeek[wid] = {
        weekId: wid,
        completed: done,
        total,
        percent: total > 0 ? Math.round((done / total) * 100) : 0
      };
    }

    // Avg quiz score per week
    const quizByWeek = {};
    for (let i = 1; i <= 16; i++) {
      const wid = 'w' + i;
      const scores = [];
      students.forEach(u => {
        if (u.quizScores && typeof u.quizScores[wid] === 'number') scores.push(u.quizScores[wid]);
      });
      quizByWeek[wid] = {
        weekId: wid,
        count: scores.length,
        avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        min: scores.length ? Math.min.apply(null, scores) : null,
        max: scores.length ? Math.max.apply(null, scores) : null
      };
    }

    // Assignment submission % per week
    const submissionByWeek = {};
    for (let i = 1; i <= 16; i++) {
      const wid = 'w' + i;
      let submitted = 0;
      students.forEach(u => { if (u.assignments && u.assignments[wid]) submitted++; });
      submissionByWeek[wid] = {
        weekId: wid,
        submitted,
        total,
        percent: total > 0 ? Math.round((submitted / total) * 100) : 0
      };
    }

    // Engagement timeline — activity events per day (last 30 days)
    const engagement = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      engagement[ymd] = 0;
    }
    students.forEach(u => {
      if (!u.activityByDay) return;
      Object.keys(u.activityByDay).forEach(day => {
        if (day in engagement) engagement[day] += (u.activityByDay[day] || 0);
      });
    });

    // Student leaderboard
    const leaderboard = students.map(u => {
      const completed = u.progress ? Object.values(u.progress).filter(Boolean).length : 0;
      const quizVals = u.quizScores ? Object.values(u.quizScores).filter(v => typeof v === 'number') : [];
      const avgQuiz = quizVals.length ? Math.round(quizVals.reduce((a, b) => a + b, 0) / quizVals.length) : 0;
      const submitted = u.assignments ? Object.values(u.assignments).filter(Boolean).length : 0;
      // Composite score: completion 10pts, avg quiz is already 0-100, submission 5pts
      const score = completed * 10 + avgQuiz + submitted * 5;
      return {
        username: u.id || u.username || 'unknown',
        displayName: u.displayName || u.username || 'Unknown',
        completed,
        avgQuiz,
        submitted,
        score,
        lastActive: u.lastActive || null
      };
    }).sort((a, b) => b.score - a.score);

    // Overall summary
    const totalCompletions = Object.values(completionByWeek).reduce((a, w) => a + w.completed, 0);
    const avgProgressPct = total > 0 ? Math.round((totalCompletions / (total * 16)) * 100) : 0;
    const totalSubmissions = Object.values(submissionByWeek).reduce((a, w) => a + w.submitted, 0);
    const allQuizScores = [];
    students.forEach(u => {
      if (u.quizScores) Object.values(u.quizScores).forEach(v => { if (typeof v === 'number') allQuizScores.push(v); });
    });
    const overallAvgQuiz = allQuizScores.length ? Math.round(allQuizScores.reduce((a, b) => a + b, 0) / allQuizScores.length) : 0;

    // Active today count
    const todayYMD = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    let activeToday = 0;
    students.forEach(u => {
      if (u.activityByDay && u.activityByDay[todayYMD]) activeToday++;
    });

    return {
      summary: {
        totalStudents: total,
        avgProgressPct,
        overallAvgQuiz,
        totalSubmissions,
        activeToday
      },
      completionByWeek,
      quizByWeek,
      submissionByWeek,
      engagement,
      leaderboard
    };
  }
};

// Snapshot of localStorage BEFORE Firestore load — used to detect if data changed
function _snapshotSyncedKeys() {
  const keys = ['lessons_data', 'site_month_names', 'site_month_prefixes', 'site_month_descriptions',
                'site_skill_tags', 'site_section_title', 'site_card_emojis', 'site_feature_cards',
                'outcome_images', 'outcome_text', 'intern_testimonials', 'about_text', 'about_pillars',
                'card_image_1', 'card_image_2', 'card_image_3', 'card_image_4'];
  const snap = {};
  keys.forEach(k => { snap[k] = safeGetItem(k) || ''; });
  return snap;
}

function _hasDataChanged(beforeSnap) {
  const keys = Object.keys(beforeSnap);
  for (const k of keys) {
    if (beforeSnap[k] !== (safeGetItem(k) || '')) return true;
  }
  return false;
}

// Load data from Firestore, then refresh page if data is newer than cached
const DATA_SYNC_READY = (async () => {
  if (!DATA_SYNC.isEnabled()) return;
  try {
    const before = _snapshotSyncedKeys();
    await DATA_SYNC.loadAll();
    // If localStorage changed and we haven't already refreshed this session, reload.
    // Guard: never reload while the user is mid-upload — otherwise an
    // in-flight Firebase Storage stream gets aborted and the submission
    // is lost. We just skip this one reload; the new data is already
    // in localStorage so the next natural navigation will pick it up.
    const alreadyRefreshed = sessionStorage.getItem('sync_refreshed_' + window.location.pathname);
    if (_hasDataChanged(before) && !alreadyRefreshed && !window._asgnUploading) {
      sessionStorage.setItem('sync_refreshed_' + window.location.pathname, '1');
      window.location.reload();
    }
  } catch (e) {
    console.warn('Firestore sync failed, using local cache:', e);
  }
})();

// ===== ASSIGNMENTS STORAGE =====
// ============================================================
// uploadAssignmentFile — pushes a single assignment file to Firebase
// Storage and returns the download URL. Falls back to null if Storage
// isn't configured / available, in which case the submission still
// goes through with metadata-only.
// Path scheme: assignments/<username>/<weekId>/<timestamp>_<safeFilename>
// ============================================================
async function uploadAssignmentFile(file, username, weekId, onProgress) {
  if (!file || !username || !weekId) return null;
  if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.storage) {
    console.warn('[ASSIGNMENT] Storage not available — saving metadata only.');
    return null;
  }
  try {
    const safe = String(file.name || 'file').replace(/[^\w.\-]/g, '_').slice(0, 80);
    const path = 'assignments/' + username + '/' + weekId + '/' + Date.now() + '_' + safe;
    const ref = DATA_SYNC.storage.ref().child(path);
    // Use the resumable task so we can stream progress
    const task = ref.put(file);
    return await new Promise((resolve, reject) => {
      task.on('state_changed',
        (snap) => {
          if (typeof onProgress === 'function' && snap.totalBytes > 0) {
            onProgress(snap.bytesTransferred / snap.totalBytes);
          }
        },
        (err) => {
          console.warn('[ASSIGNMENT] upload failed for', file.name, err);
          reject(err);
        },
        async () => {
          try {
            const url = await task.snapshot.ref.getDownloadURL();
            resolve(url);
          } catch (e) { reject(e); }
        }
      );
    });
  } catch (e) {
    console.warn('[ASSIGNMENT] upload exception:', e.message || e);
    return null;
  }
}

// ============================================================
// compressImageIfNeeded — downscales + re-encodes large images
// before upload so they go through the wire in ~10× less time.
// JPEGs/PNGs > 1.5MB get resized to max 1920px on the long edge
// and re-encoded at quality 0.86 (visually lossless). Original
// file returned unchanged for non-images, small images, videos,
// or PDFs (which we never want to mutate).
// ============================================================
async function compressImageIfNeeded(file) {
  try {
    if (!file || !file.type || !file.type.startsWith('image/')) return file;
    // Don't touch GIFs — re-encoding would lose animation.
    if (file.type === 'image/gif') return file;
    // Tiny files don't benefit from re-encoding (would actually grow).
    if (file.size < 1.5 * 1024 * 1024) return file;

    const MAX_EDGE = 1920;
    const QUALITY = 0.86;

    const bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

    let { width, height } = bitmap;
    const longEdge = Math.max(width, height);
    if (longEdge > MAX_EDGE) {
      const scale = MAX_EDGE / longEdge;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', QUALITY);
    });
    URL.revokeObjectURL(bitmap.src);
    if (!blob) return file;

    // If compression somehow made the file bigger (rare edge case
    // with already-optimized JPEGs), keep the original.
    if (blob.size >= file.size) return file;

    // Re-wrap as a File so downstream code that reads file.name /
    // file.type keeps working transparently.
    const safeName = file.name.replace(/\.(png|webp|bmp|tiff?)$/i, '.jpg');
    return new File([blob], safeName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    console.warn('[COMPRESS] failed for', file && file.name, e && e.message);
    return file;
  }
}

const ASSIGNMENTS = {
  STORAGE_KEY: 'assignment_submissions',

  getAll() {
    return safeGetJSON(this.STORAGE_KEY, {});
  },

  get(weekId) {
    return this.getAll()[weekId] || null;
  },

  isSubmitted(weekId) {
    const sub = this.get(weekId);
    return sub && sub.submitted === true;
  },

  submit(weekId, files, links) {
    const all = this.getAll();
    all[weekId] = {
      files: files || [],
      links: links || [],
      submitted: true,
      submittedAt: new Date().toISOString()
    };
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    // Log activity
    try {
      const lesson = (typeof LESSONS !== 'undefined') ? LESSONS.get(weekId) : null;
      if (typeof ACTIVITY !== 'undefined') ACTIVITY.log('assignment_submitted', weekId, lesson ? ('W' + lesson.week + ': ' + lesson.title) : weekId);
    } catch (e) {}
    // Auto-complete lesson
    if (!PROGRESS.isCompleted(weekId)) {
      PROGRESS.toggle(weekId);
      try {
        const lesson = (typeof LESSONS !== 'undefined') ? LESSONS.get(weekId) : null;
        if (typeof ACTIVITY !== 'undefined') ACTIVITY.log('lesson_completed', weekId, lesson ? ('W' + lesson.week + ': ' + lesson.title) : weekId);
      } catch (e) {}
    }
    try { if (typeof USER_SYNC !== 'undefined') USER_SYNC.save(true); } catch (e) {}
    return true;
  },

  clearSubmission(weekId) {
    const all = this.getAll();
    delete all[weekId];
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
  },

  getSubmittedCount() {
    return Object.values(this.getAll()).filter(s => s && s.submitted).length;
  }
};

// ===== QUIZ RESULTS STORAGE =====
const QUIZ_RESULTS = {
  STORAGE_KEY: 'quiz_results',
  getAll() { return safeGetJSON(this.STORAGE_KEY, {}); },
  get(weekId) { return this.getAll()[weekId] || null; },
  isPassed(weekId) { const r = this.get(weekId); return r && r.passed === true; },
  save(weekId, score, total, passed) {
    const all = this.getAll();
    const prev = all[weekId];
    const attempts = (prev && prev.attempts ? prev.attempts : 0) + 1;
    all[weekId] = { score, total, passed, percentage: Math.round((score/total)*100), attempts, date: new Date().toISOString() };
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try { if (typeof USER_SYNC !== 'undefined') USER_SYNC.save(); } catch (e) {}
  }
};

// ============================================================
// BADGES — Achievement system. Each badge has a condition function
// that runs against the current student's local data. evaluate()
// returns the full set of earned badge IDs; checkAndCelebrate()
// detects newly-earned ones since the last check and pops a toast.
// ============================================================
const BADGES = {
  STORAGE_KEY: 'earned_badges',

  catalog: [
    { id: 'first_lesson',  icon: '📚', name: 'First Lesson',         desc: 'Completed your first lesson.',
      condition: () => (typeof PROGRESS !== 'undefined') && PROGRESS.getCompletedCount() >= 1 },
    { id: 'phase_1',       icon: '🎯', name: 'Phase 1 Champion',    desc: 'Completed all 4 lessons of Phase 1.',
      condition: () => (typeof PROGRESS !== 'undefined') && [1,2,3,4].every(n => PROGRESS.isCompleted('w'+n)) },
    { id: 'phase_2',       icon: '🎯', name: 'Phase 2 Champion',    desc: 'Completed all 4 lessons of Phase 2.',
      condition: () => (typeof PROGRESS !== 'undefined') && [5,6,7,8].every(n => PROGRESS.isCompleted('w'+n)) },
    { id: 'phase_3',       icon: '🎯', name: 'Phase 3 Champion',    desc: 'Completed all 4 lessons of Phase 3.',
      condition: () => (typeof PROGRESS !== 'undefined') && [9,10,11,12].every(n => PROGRESS.isCompleted('w'+n)) },
    { id: 'phase_4',       icon: '🎯', name: 'Phase 4 Champion',    desc: 'Completed all 4 lessons of Phase 4.',
      condition: () => (typeof PROGRESS !== 'undefined') && [13,14,15,16].every(n => PROGRESS.isCompleted('w'+n)) },
    { id: 'graduate',      icon: '🎓', name: 'Marketing Intern Graduate', desc: 'Completed all 16 lessons.',
      condition: () => (typeof PROGRESS !== 'undefined') && PROGRESS.getCompletedCount() >= 16 },
    { id: 'first_post',    icon: '✍️', name: 'First Post',           desc: 'Made your first post on the Feed.',
      condition: () => {
        const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
        const posts = safeGetJSON('community_posts', []);
        return Array.isArray(posts) && posts.some(p => p && p.username === me);
      } },
    { id: 'first_win',     icon: '🏆', name: 'First Win',            desc: 'Shared your first Win.',
      condition: () => {
        const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
        const wins = safeGetJSON('community_wins', []);
        return Array.isArray(wins) && wins.some(w => w && w.username === me);
      } },
    { id: 'first_chat',    icon: '💬', name: 'First Chat',           desc: 'Sent your first message in Everyone Chat.',
      condition: () => {
        const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
        const msgs = safeGetJSON('community_chat', []);
        return Array.isArray(msgs) && msgs.some(m => m && m.username === me);
      } },
    { id: 'commenter_10',  icon: '🗣️', name: 'Engaged Commenter', desc: 'Left 10 comments across the community.',
      condition: () => {
        const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
        if (!me) return false;
        const posts = safeGetJSON('community_posts', []);
        let count = 0;
        if (Array.isArray(posts)) {
          posts.forEach(p => {
            if (Array.isArray(p && p.comments)) p.comments.forEach(c => { if (c && c.username === me) count++; });
          });
        }
        return count >= 10;
      } },
    { id: 'first_quiz',    icon: '💯', name: 'Quiz Passed',          desc: 'Passed your first quiz.',
      condition: () => {
        const all = (typeof QUIZ_RESULTS !== 'undefined') ? QUIZ_RESULTS.getAll() : {};
        return Object.values(all).some(r => r && r.passed === true);
      } },
    { id: 'first_assign',  icon: '📤', name: 'Assignment Submitted', desc: 'Submitted your first assignment.',
      condition: () => {
        const all = (typeof ASSIGNMENTS !== 'undefined') ? ASSIGNMENTS.getAll() : {};
        return Object.values(all).some(s => s && s.submitted === true);
      } },
    { id: 'streak_7',      icon: '🔥', name: '7-Day Streak',         desc: 'Stayed active 7 days in a row.',
      condition: () => BADGES._currentStreakDays() >= 7 },
    { id: 'top_engager',   icon: '⭐',       name: 'Top Engager',          desc: 'Received 25+ reactions on your content.',
      condition: () => BADGES._reactionsReceived() >= 25 }
  ],

  // Calculate the user's current consecutive-day streak from ACTIVITY log.
  _currentStreakDays() {
    if (typeof ACTIVITY === 'undefined') return 0;
    const events = ACTIVITY.getAll() || [];
    const days = new Set();
    events.forEach(e => { if (e && e.date) days.add(e.date.slice(0, 10)); });
    if (days.size === 0) return 0;
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ymd = d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
      if (days.has(ymd)) streak++;
      else if (i > 0) break; // missed yesterday → streak ends
    }
    return streak;
  },

  // Sum up reactions on this user's posts + wins.
  _reactionsReceived() {
    const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
    if (!me) return 0;
    let total = 0;
    const tally = (items) => {
      if (!Array.isArray(items)) return;
      items.forEach(item => {
        if (!item || item.username !== me || !item.reactions) return;
        Object.values(item.reactions).forEach(arr => { total += (arr && arr.length) || 0; });
      });
    };
    tally(safeGetJSON('community_posts', []));
    tally(safeGetJSON('community_wins', []));
    return total;
  },

  // Set of badge IDs the user has currently earned (re-evaluated each call).
  evaluate() {
    const earned = new Set();
    this.catalog.forEach(b => {
      try { if (b.condition()) earned.add(b.id); } catch (e) {}
    });
    return earned;
  },

  // Set previously seen + saved.
  _getSeen() {
    const arr = safeGetJSON(this.STORAGE_KEY, []);
    return new Set(Array.isArray(arr) ? arr : []);
  },
  _saveSeen(set) {
    safeSetItem(this.STORAGE_KEY, JSON.stringify(Array.from(set)));
  },

  // Returns the array of badges newly earned since last check, and
  // marks them as seen so we don't re-celebrate.
  checkAndCelebrate() {
    const earned = this.evaluate();
    const seen = this._getSeen();
    const newlyEarned = [];
    earned.forEach(id => {
      if (!seen.has(id)) {
        const meta = this.catalog.find(b => b.id === id);
        if (meta) newlyEarned.push(meta);
        seen.add(id);
      }
    });
    if (newlyEarned.length > 0) this._saveSeen(seen);
    return newlyEarned;
  },

  // For display: full catalog with earned/locked state.
  catalogWithStatus() {
    const earned = this.evaluate();
    return this.catalog.map(b => ({ ...b, earned: earned.has(b.id) }));
  }
};

// Toast helper — fires from any page where document is ready.
function showBadgeToast(badge) {
  if (!badge || !document.body) return;
  const t = document.createElement('div');
  t.className = 'badge-toast';
  t.innerHTML =
    '<span class="badge-toast-icon">' + badge.icon + '</span>'
    + '<div class="badge-toast-body">'
    +   '<div class="badge-toast-eyebrow">Achievement unlocked</div>'
    +   '<div class="badge-toast-title">' + badge.name + '</div>'
    +   '<div class="badge-toast-desc">' + badge.desc + '</div>'
    + '</div>';
  document.body.appendChild(t);
  // Trigger CSS slide-in
  requestAnimationFrame(() => t.classList.add('is-visible'));
  // Auto-dismiss after 6s
  setTimeout(() => {
    t.classList.remove('is-visible');
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 350);
  }, 6000);
}

// Run a celebration check — call after any action that might earn a badge.
function checkBadges() {
  if (typeof BADGES === 'undefined') return;
  if (typeof AUTH !== 'undefined' && AUTH.isLoggedIn && !AUTH.isLoggedIn()) return;
  const fresh = BADGES.checkAndCelebrate();
  // Stagger toasts so multiple unlocks don't stack on top of each other.
  fresh.forEach((b, i) => setTimeout(() => showBadgeToast(b), i * 700));
}

// ============================================================
// COMMUNITY MODULES — POSTS (timeline) + WINS (celebrations) + EVENTS
// localStorage first, optional Firestore sync for cross-browser visibility.
// ============================================================
function _commonAuthorMeta() {
  const username = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : 'anonymous';
  const displayName = (typeof AUTH !== 'undefined' && AUTH.getDisplayName) ? AUTH.getDisplayName() : username;
  const avatar = (typeof AUTH !== 'undefined' && AUTH.getAvatarImage) ? AUTH.getAvatarImage() : null;
  const initials = (typeof AUTH !== 'undefined' && AUTH.getInitials) ? AUTH.getInitials() : 'U';
  return { username, displayName, avatar, initials };
}

function _mergeById(remote, local) {
  const merged = remote.slice();
  local.forEach(item => { if (!merged.find(r => r.id === item.id)) merged.push(item); });
  return merged;
}

// ============================================================
// SYNC ERROR HANDLER
// Firestore writes fail SILENTLY when security rules block the
// collection — every browser ends up showing only its own
// localStorage copy. We surface the first permission-denied (or any
// other) error to the admin/student so they know to fix the rules.
// One alert per session per error code, so we don't spam.
// ============================================================
const _SYNC_ERROR_SEEN = {};
function _handleSyncError(moduleName, err) {
  const code = (err && err.code) || 'unknown';
  const msg = (err && err.message) || String(err);
  console.warn('[' + moduleName + '] sync failed (' + code + '):', msg);
  if (_SYNC_ERROR_SEEN[code]) return;
  _SYNC_ERROR_SEEN[code] = true;

  // Only show the in-page banner on dashboard pages where the user
  // is actively trying to post community content.
  if (code === 'permission-denied') {
    const banner = _ensureSyncErrorBanner();
    if (banner) {
      // Module-specific copy so admins know exactly which collection's
      // rules need attention.
      const friendly = ({
        POSTS: 'Feed posts',
        WINS: 'Win celebrations',
        ANNOUNCEMENTS: 'Announcements',
        FAQS: 'FAQ entries',
        CHAT: 'Group chat',
        DMS: 'Direct messages',
        EVENTS: 'Events',
        PRESENCE: 'Online presence'
      })[moduleName] || moduleName;
      banner.innerHTML =
        '<button class="sync-error-banner-close" type="button" aria-label="Dismiss">&times;</button>'
        + '<strong>⚠ ' + friendly + ' aren\'t syncing across accounts.</strong> '
        + 'Firestore security rules are blocking the <code>sphere_' + moduleName.toLowerCase() + '</code> collection. '
        + 'Open <code>firestore.rules</code> in the repo (or <code>FIREBASE_SETUP.md</code> Part 3) and paste the full rule set into the Firebase console → Firestore → Rules → Publish.';
      banner.style.display = 'block';
      // Wire up the dismiss button (overrides the whole-banner click)
      const closeBtn = banner.querySelector('.sync-error-banner-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          banner.style.display = 'none';
        });
      }
    }
  }
}

function _ensureSyncErrorBanner() {
  let banner = document.getElementById('syncErrorBanner');
  if (banner) return banner;
  if (!document.body) return null;
  banner = document.createElement('div');
  banner.id = 'syncErrorBanner';
  banner.style.cssText = 'position:fixed; bottom:20px; left:20px; right:20px; max-width:560px; '
    + 'margin:0 auto; padding:14px 44px 14px 18px; border-radius:12px; background:#fef3c7; '
    + 'color:#78350f; border:1px solid #f59e0b; box-shadow:0 10px 30px -8px rgba(0,0,0,0.25); '
    + 'font-size:0.88rem; line-height:1.5; z-index:9999; display:none;';
  document.body.appendChild(banner);
  return banner;
}

// ============================================================
// BACKFILL — push local-only community items up to Firestore.
//
// When Firestore security rules were blocking writes to most
// sphere_* collections, every post/announcement/win/etc. that the
// admin (and students) created landed only in their own
// localStorage. After the rules are fixed, those legacy items are
// still invisible to other accounts because they never reached the
// shared database.
//
// On the first dashboard/page load AFTER auth is ready, walk
// through every community module, take whatever's in localStorage,
// and `set()` each item by id into its Firestore collection.
// `set()` is idempotent — re-uploading the same id with the same
// data is a no-op. Videos are stripped (too big for the 1 MB doc
// cap), and the run is gated by sessionStorage so it doesn't
// retrigger on every tab navigation.
// ============================================================
function backfillCommunityToFirestore() {
  if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
  // sessionStorage gate — one backfill pass per tab/session is enough.
  // Each newly-created item still syncs immediately via the normal
  // POSTS.add()/etc. path, so we don't need to re-run.
  try {
    if (sessionStorage.getItem('_sphere_backfill_done') === '1') return;
    sessionStorage.setItem('_sphere_backfill_done', '1');
  } catch (e) { /* ignore — sessionStorage might be disabled */ }

  const FIRESTORE_DOC_LIMIT = 900 * 1024;
  const modules = [
    { name: 'POSTS',         mod: typeof POSTS !== 'undefined' ? POSTS : null,         stripVideos: true  },
    { name: 'WINS',          mod: typeof WINS !== 'undefined' ? WINS : null,           stripVideos: true  },
    { name: 'ANNOUNCEMENTS', mod: typeof ANNOUNCEMENTS !== 'undefined' ? ANNOUNCEMENTS : null, stripVideos: false },
    { name: 'FAQS',          mod: typeof FAQS !== 'undefined' ? FAQS : null,           stripVideos: false },
    { name: 'CHAT',          mod: typeof CHAT !== 'undefined' ? CHAT : null,           stripVideos: false },
    { name: 'EVENTS',        mod: typeof EVENTS !== 'undefined' ? EVENTS : null,       stripVideos: false }
  ];

  let totalScheduled = 0;
  modules.forEach(({ name, mod, stripVideos }) => {
    if (!mod || !mod.STORAGE_KEY || !mod.COLLECTION) return;
    const items = safeGetJSON(mod.STORAGE_KEY, []);
    if (!Array.isArray(items) || items.length === 0) return;

    let uploadedCount = 0;
    items.forEach(item => {
      if (!item || !item.id) return;
      let payload = item;
      if (stripVideos && Array.isArray(item.media)) {
        payload = Object.assign({}, item, {
          media: item.media.filter(m => m && m.type === 'image')
        });
      }
      const sizeApprox = JSON.stringify(payload).length;
      if (sizeApprox > FIRESTORE_DOC_LIMIT) {
        console.warn('[BACKFILL] ' + name + ' item ' + item.id + ' is ' + sizeApprox + 'B — skipping');
        return;
      }
      try {
        DATA_SYNC.db.collection(mod.COLLECTION).doc(item.id).set(payload, { merge: true })
          .catch(e => _handleSyncError(name, e));
        uploadedCount++;
      } catch (e) { /* swallow */ }
    });
    totalScheduled += uploadedCount;
    if (uploadedCount > 0) {
      console.log('[BACKFILL] ' + name + ': scheduled ' + uploadedCount + ' item(s) for upload');
    }
  });
  if (totalScheduled > 0) {
    console.log('[BACKFILL] ✓ Total ' + totalScheduled + ' local-only items pushed to Firestore. Other accounts will see them within seconds.');
  }
}

// ===== POSTS — Community feed (Home tab) =====
const POSTS = {
  STORAGE_KEY: 'community_posts',
  COLLECTION: 'sphere_posts',
  MAX_LENGTH: 500,
  MAX_IMAGES: 4,
  MAX_VIDEO_BYTES: 8 * 1024 * 1024,
  // Firestore docs cap at 1 MB; images compress to ~150 KB each, so up
  // to 4 images comfortably fit. Videos are too big to sync — we keep
  // them locally only and strip them from the Firestore-bound copy.
  FIRESTORE_DOC_LIMIT: 900 * 1024,

  getAll() {
    const all = safeGetJSON(this.STORAGE_KEY, []);
    return all.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  add(text, media) {
    text = (text || '').trim().slice(0, this.MAX_LENGTH);
    media = Array.isArray(media) ? media.slice(0, this.MAX_IMAGES + 1) : [];
    if (!text && media.length === 0) return null;
    const meta = _commonAuthorMeta();
    const post = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      username: meta.username,
      displayName: meta.displayName,
      avatar: meta.avatar,
      initials: meta.initials,
      text: text,
      media: media,
      createdAt: Date.now()
    };
    const all = safeGetJSON(this.STORAGE_KEY, []);
    all.push(post);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    // Sync to Firestore — strip videos out (too big for 1 MB doc cap)
    // and bail if the trimmed payload still won't fit.
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        const remoteCopy = Object.assign({}, post, {
          media: media.filter(m => m && m.type === 'image')
        });
        const sizeApprox = JSON.stringify(remoteCopy).length;
        if (sizeApprox <= this.FIRESTORE_DOC_LIMIT) {
          DATA_SYNC.db.collection(this.COLLECTION).doc(post.id).set(remoteCopy)
            .catch(e => _handleSyncError('POSTS', e));
        } else {
          console.warn('[POSTS] payload too large (' + sizeApprox + 'B) — saved locally only');
        }
      }
    } catch (e) {}
    return post;
  },

  remove(id) {
    const all = safeGetJSON(this.STORAGE_KEY, []);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all.filter(p => p.id !== id)));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(id).delete().catch(() => {});
      }
    } catch (e) {}
  },

  // Edit an existing post's text. Only the original author or an
  // admin should call this — UI enforces that. The post is marked
  // with editedAt so the feed can show an "(edited)" indicator.
  update(id, newText) {
    newText = (newText || '').trim().slice(0, this.MAX_LENGTH);
    const all = safeGetJSON(this.STORAGE_KEY, []);
    const idx = all.findIndex(p => p.id === id);
    if (idx === -1) return null;
    // Allow empty text only if the post still has media — otherwise
    // there'd be nothing left to show. Bail and let the caller
    // decide what to do (e.g. delete instead).
    const hasMedia = Array.isArray(all[idx].media) && all[idx].media.length > 0;
    if (!newText && !hasMedia) return null;
    all[idx].text = newText;
    all[idx].editedAt = Date.now();
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(id).set(
          { text: newText, editedAt: all[idx].editedAt }, { merge: true }
        ).catch(e => _handleSyncError('POSTS', e));
      }
    } catch (e) {}
    return all[idx];
  },

  // Comment helpers — comments live as an array on the post doc
  // itself, so they sync via the same Firestore listener as posts.
  addComment(postId, text) {
    text = (text || '').trim().slice(0, 500);
    if (!text || !postId) return null;
    const all = safeGetJSON(this.STORAGE_KEY, []);
    const idx = all.findIndex(p => p.id === postId);
    if (idx === -1) return null;
    const meta = _commonAuthorMeta();
    const comment = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      username: meta.username,
      displayName: meta.displayName,
      avatar: meta.avatar,
      initials: meta.initials,
      text: text,
      createdAt: Date.now()
    };
    all[idx].comments = (all[idx].comments || []).concat(comment);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(postId).set(
          { comments: all[idx].comments }, { merge: true }
        ).catch(e => _handleSyncError('POSTS', e));
      }
    } catch (e) {}
    return comment;
  },

  removeComment(postId, commentId) {
    const all = safeGetJSON(this.STORAGE_KEY, []);
    const idx = all.findIndex(p => p.id === postId);
    if (idx === -1) return;
    all[idx].comments = (all[idx].comments || []).filter(c => c.id !== commentId);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(postId).set(
          { comments: all[idx].comments }, { merge: true }
        ).catch(() => {});
      }
    } catch (e) {}
  },

  async fetchRemote() {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return this.getAll();
    try {
      const snap = await DATA_SYNC.db.collection(this.COLLECTION)
        .orderBy('createdAt', 'desc').limit(50).get();
      const remote = [];
      snap.forEach(d => remote.push(d.data()));
      const local = safeGetJSON(this.STORAGE_KEY, []);
      const merged = _mergeById(remote, local);
      safeSetItem(this.STORAGE_KEY, JSON.stringify(merged));
      return this.getAll();
    } catch (e) {
      console.warn('[POSTS] fetchRemote:', e.message);
      return this.getAll();
    }
  },

  _listener: null,

  // Real-time: any new post by anyone, anywhere, surfaces in seconds.
  startLiveListener(onUpdate) {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    this.stopLiveListener();
    try {
      this._listener = DATA_SYNC.db.collection(this.COLLECTION)
        .orderBy('createdAt', 'desc').limit(50)
        .onSnapshot(snap => {
          const remote = [];
          snap.forEach(d => remote.push(d.data()));
          const local = safeGetJSON(this.STORAGE_KEY, []);
          // Local copy may have video posts that aren't in Firestore — keep them
          const merged = _mergeById(remote, local);
          safeSetItem(this.STORAGE_KEY, JSON.stringify(merged));
          if (typeof onUpdate === 'function') onUpdate(this.getAll());
        }, err => _handleSyncError('POSTS', err));
    } catch (e) { console.warn('[POSTS] startLiveListener:', e.message); }
  },

  stopLiveListener() {
    if (this._listener) {
      try { this._listener(); } catch (e) {}
      this._listener = null;
    }
  }
};

// ===== WINS — Big wins celebrations (Home tab) =====
const WINS = {
  STORAGE_KEY: 'community_wins',
  COLLECTION: 'sphere_wins',

  getAll() {
    const all = safeGetJSON(this.STORAGE_KEY, []);
    return all.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  add(title, description, media) {
    title = (title || '').trim().slice(0, 120);
    description = (description || '').trim().slice(0, 400);
    media = Array.isArray(media) ? media.slice(0, 5) : [];
    if (!title) return null;
    const meta = _commonAuthorMeta();
    const win = {
      id: 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      username: meta.username,
      displayName: meta.displayName,
      avatar: meta.avatar,
      initials: meta.initials,
      title: title,
      description: description,
      media: media,
      createdAt: Date.now()
    };
    const all = safeGetJSON(this.STORAGE_KEY, []);
    all.push(win);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    // Sync to Firestore — strip videos (too big for 1 MB doc cap)
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        const remoteCopy = Object.assign({}, win, {
          media: media.filter(m => m && m.type === 'image')
        });
        const sizeApprox = JSON.stringify(remoteCopy).length;
        if (sizeApprox <= 900 * 1024) {
          DATA_SYNC.db.collection(this.COLLECTION).doc(win.id).set(remoteCopy)
            .catch(e => _handleSyncError('WINS', e));
        } else {
          console.warn('[WINS] payload too large (' + sizeApprox + 'B) — saved locally only');
        }
      }
    } catch (e) {}
    return win;
  },

  // IDs we deleted locally but Firestore may not have fully propagated yet.
  // The live listener filters these out so a just-deleted win can't snap
  // back onto the screen during the 1–2 second sync window.
  _pendingDeletes: new Set(),

  remove(id) {
    if (!id) return;
    const all = safeGetJSON(this.STORAGE_KEY, []);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all.filter(w => w.id !== id)));
    // Hold the tombstone for 30s — well past Firestore's propagation window.
    this._pendingDeletes.add(id);
    setTimeout(() => this._pendingDeletes.delete(id), 30000);
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(id).delete().catch((e) => {
          console.warn('[WINS] Firestore delete failed:', e.message);
        });
      }
    } catch (e) {}
  },

  // Edit a win's title and/or description in place. The win is
  // marked with editedAt so the UI can render "(edited)".
  update(id, fields) {
    fields = fields || {};
    const all = safeGetJSON(this.STORAGE_KEY, []);
    const idx = all.findIndex(w => w.id === id);
    if (idx === -1) return null;
    const newTitle = (fields.title || '').trim().slice(0, 120);
    if (newTitle) all[idx].title = newTitle;
    if (typeof fields.description === 'string') {
      all[idx].description = fields.description.trim().slice(0, 400);
    }
    all[idx].editedAt = Date.now();
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(id).set({
          title: all[idx].title,
          description: all[idx].description,
          editedAt: all[idx].editedAt
        }, { merge: true }).catch(e => _handleSyncError('WINS', e));
      }
    } catch (e) {}
    return all[idx];
  },

  async fetchRemote() {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return this.getAll();
    try {
      const snap = await DATA_SYNC.db.collection(this.COLLECTION)
        .orderBy('createdAt', 'desc').limit(50).get();
      const remote = [];
      snap.forEach(d => {
        const data = d.data();
        // Skip wins the user just deleted — Firestore may still be
        // serving them for a moment after the delete RPC.
        if (data && data.id && this._pendingDeletes.has(data.id)) return;
        remote.push(data);
      });
      const local = safeGetJSON(this.STORAGE_KEY, []);
      const merged = _mergeById(remote, local);
      safeSetItem(this.STORAGE_KEY, JSON.stringify(merged));
      return this.getAll();
    } catch (e) {
      console.warn('[WINS] fetchRemote:', e.message);
      return this.getAll();
    }
  },

  _listener: null,

  // Real-time: any new win shared by anyone surfaces in seconds.
  startLiveListener(onUpdate) {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    this.stopLiveListener();
    try {
      this._listener = DATA_SYNC.db.collection(this.COLLECTION)
        .orderBy('createdAt', 'desc').limit(50)
        .onSnapshot(snap => {
          const remote = [];
          snap.forEach(d => {
            const data = d.data();
            // Tombstone guard — see fetchRemote() above for context.
            if (data && data.id && this._pendingDeletes.has(data.id)) return;
            remote.push(data);
          });
          const local = safeGetJSON(this.STORAGE_KEY, []);
          const merged = _mergeById(remote, local);
          safeSetItem(this.STORAGE_KEY, JSON.stringify(merged));
          if (typeof onUpdate === 'function') onUpdate(this.getAll());
        }, err => _handleSyncError('WINS', err));
    } catch (e) { console.warn('[WINS] startLiveListener:', e.message); }
  },

  stopLiveListener() {
    if (this._listener) {
      try { this._listener(); } catch (e) {}
      this._listener = null;
    }
  }
};

// ===== EVENTS — Upcoming events / workshops / live sessions =====
const EVENTS = {
  STORAGE_KEY: 'community_events',
  COLLECTION: 'sphere_events',

  getAll() {
    return safeGetJSON(this.STORAGE_KEY, []);
  },

  add(event) {
    const ev = {
      id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: (event.title || '').trim().slice(0, 120),
      description: (event.description || '').trim().slice(0, 600),
      date: event.date,  // ISO string
      location: (event.location || '').trim().slice(0, 120),
      link: (event.link || '').trim(),
      type: event.type || 'workshop',
      createdAt: Date.now()
    };
    if (!ev.title || !ev.date) return null;
    const all = this.getAll();
    all.push(ev);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(ev.id).set(ev)
          .catch(e => _handleSyncError('EVENTS', e));
      }
    } catch (e) {}
    return ev;
  },

  remove(id) {
    const all = this.getAll().filter(e => e.id !== id);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(id).delete().catch(() => {});
      }
    } catch (e) {}
  },

  async fetchRemote() {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return this.getAll();
    try {
      const snap = await DATA_SYNC.db.collection(this.COLLECTION).get();
      const remote = [];
      snap.forEach(d => remote.push(d.data()));
      const local = this.getAll();
      const merged = _mergeById(remote, local);
      safeSetItem(this.STORAGE_KEY, JSON.stringify(merged));
      return this.getAll();
    } catch (e) {
      console.warn('[EVENTS] fetchRemote:', e.message);
      return this.getAll();
    }
  }
};

// ===== ANNOUNCEMENTS — Admin-curated announcements =====
const ANNOUNCEMENTS = {
  STORAGE_KEY: 'community_announcements',
  COLLECTION: 'sphere_announcements',

  getAll() {
    const all = safeGetJSON(this.STORAGE_KEY, []);
    return all.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  add(title, body, pinned) {
    title = (title || '').trim().slice(0, 200);
    body = (body || '').trim().slice(0, 2000);
    if (!title) return null;
    const meta = _commonAuthorMeta();
    const ann = {
      id: 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: title,
      body: body,
      pinned: !!pinned,
      authorName: meta.displayName,
      createdAt: Date.now()
    };
    const all = safeGetJSON(this.STORAGE_KEY, []);
    all.push(ann);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(ann.id).set(ann)
          .catch(e => _handleSyncError('ANNOUNCEMENTS', e));
      }
    } catch (e) {}
    return ann;
  },

  remove(id) {
    const all = safeGetJSON(this.STORAGE_KEY, []);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all.filter(a => a.id !== id)));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(id).delete().catch(() => {});
      }
    } catch (e) {}
  },

  // Edit an announcement's title/body in place.
  update(id, fields) {
    fields = fields || {};
    const all = safeGetJSON(this.STORAGE_KEY, []);
    const idx = all.findIndex(a => a.id === id);
    if (idx === -1) return null;
    if (typeof fields.title === 'string') all[idx].title = fields.title.trim().slice(0, 200);
    if (typeof fields.body === 'string')  all[idx].body  = fields.body.trim().slice(0, 2000);
    all[idx].editedAt = Date.now();
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(id).set({
          title: all[idx].title,
          body: all[idx].body,
          editedAt: all[idx].editedAt
        }, { merge: true }).catch(e => _handleSyncError('ANNOUNCEMENTS', e));
      }
    } catch (e) {}
    return all[idx];
  },

  async fetchRemote() {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return this.getAll();
    try {
      const snap = await DATA_SYNC.db.collection(this.COLLECTION).get();
      const remote = [];
      snap.forEach(d => remote.push(d.data()));
      const merged = _mergeById(remote, safeGetJSON(this.STORAGE_KEY, []));
      safeSetItem(this.STORAGE_KEY, JSON.stringify(merged));
      return this.getAll();
    } catch (e) {
      console.warn('[ANNOUNCEMENTS] fetchRemote:', e.message);
      return this.getAll();
    }
  },

  _listener: null,

  // Real-time: any new announcement from admin surfaces on every
  // student's screen within seconds, no manual refresh.
  startLiveListener(onUpdate) {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    this.stopLiveListener();
    try {
      this._listener = DATA_SYNC.db.collection(this.COLLECTION)
        .onSnapshot(snap => {
          const remote = [];
          snap.forEach(d => remote.push(d.data()));
          const merged = _mergeById(remote, safeGetJSON(this.STORAGE_KEY, []));
          safeSetItem(this.STORAGE_KEY, JSON.stringify(merged));
          if (typeof onUpdate === 'function') onUpdate(this.getAll());
        }, err => _handleSyncError('ANNOUNCEMENTS', err));
    } catch (e) { console.warn('[ANNOUNCEMENTS] startLiveListener:', e.message); }
  },

  stopLiveListener() {
    if (this._listener) {
      try { this._listener(); } catch (e) {}
      this._listener = null;
    }
  }
};

// ===== FAQS — Admin-curated FAQs =====
const FAQS = {
  STORAGE_KEY: 'community_faqs',
  COLLECTION: 'sphere_faqs',

  getAll() {
    const all = safeGetJSON(this.STORAGE_KEY, []);
    return all.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  add(question, answer) {
    question = (question || '').trim().slice(0, 200);
    answer = (answer || '').trim().slice(0, 2000);
    if (!question) return null;
    const all = this.getAll();
    const faq = {
      id: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      question: question,
      answer: answer,
      order: all.length,
      createdAt: Date.now()
    };
    all.push(faq);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(faq.id).set(faq)
          .catch(e => _handleSyncError('FAQS', e));
      }
    } catch (e) {}
    return faq;
  },

  remove(id) {
    const all = this.getAll().filter(f => f.id !== id);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(id).delete().catch(() => {});
      }
    } catch (e) {}
  },

  async fetchRemote() {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return this.getAll();
    try {
      const snap = await DATA_SYNC.db.collection(this.COLLECTION).get();
      const remote = [];
      snap.forEach(d => remote.push(d.data()));
      const merged = _mergeById(remote, this.getAll());
      safeSetItem(this.STORAGE_KEY, JSON.stringify(merged));
      return this.getAll();
    } catch (e) {
      console.warn('[FAQS] fetchRemote:', e.message);
      return this.getAll();
    }
  },

  _listener: null,

  startLiveListener(onUpdate) {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    this.stopLiveListener();
    try {
      this._listener = DATA_SYNC.db.collection(this.COLLECTION)
        .onSnapshot(snap => {
          const remote = [];
          snap.forEach(d => remote.push(d.data()));
          const merged = _mergeById(remote, this.getAll());
          safeSetItem(this.STORAGE_KEY, JSON.stringify(merged));
          if (typeof onUpdate === 'function') onUpdate(this.getAll());
        }, err => _handleSyncError('FAQS', err));
    } catch (e) { console.warn('[FAQS] startLiveListener:', e.message); }
  },

  stopLiveListener() {
    if (this._listener) {
      try { this._listener(); } catch (e) {}
      this._listener = null;
    }
  }
};

// ===== CHAT — Everyone chat for students =====
const CHAT = {
  STORAGE_KEY: 'community_chat',
  COLLECTION: 'sphere_chat',
  MAX_LENGTH: 1000,
  _listener: null,

  getAll() {
    const all = safeGetJSON(this.STORAGE_KEY, []);
    // Filter by current group ID (set by the Groups UI). Backward
    // compat: messages without a groupId default to 'general' so
    // old chat history stays accessible in the General group.
    const currentGroup = (typeof GROUPS !== 'undefined' && GROUPS.currentId) ? GROUPS.currentId : 'general';
    return all
      .filter(m => (m.groupId || 'general') === currentGroup)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  // Returns ALL messages regardless of group — used by sync code
  // that needs to operate on the full cache.
  getAllUnfiltered() {
    return safeGetJSON(this.STORAGE_KEY, []);
  },

  add(text, replyTo) {
    text = (text || '').trim().slice(0, this.MAX_LENGTH);
    if (!text) return null;
    const meta = _commonAuthorMeta();
    // Tag the message with the current group ID so it shows up in
    // the right group's chat (and stays out of other groups).
    const currentGroup = (typeof GROUPS !== 'undefined' && GROUPS.currentId) ? GROUPS.currentId : 'general';
    const msg = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      groupId: currentGroup,
      username: meta.username,
      displayName: meta.displayName,
      avatar: meta.avatar,
      initials: meta.initials,
      text: text,
      createdAt: Date.now()
    };
    if (replyTo && replyTo.id) {
      // Snapshot the parent message at reply time so the quote stays
      // accurate even if the original is later edited or deleted.
      msg.replyTo = {
        id: replyTo.id,
        displayName: replyTo.displayName || '',
        text: (replyTo.text || '').slice(0, 200)
      };
    }
    const all = safeGetJSON(this.STORAGE_KEY, []);
    all.push(msg);
    // Cap local cache to last 200 messages
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all.slice(-200)));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(msg.id).set(msg)
          .catch(e => _handleSyncError('CHAT', e));
      }
    } catch (e) {}
    return msg;
  },

  remove(id) {
    const all = safeGetJSON(this.STORAGE_KEY, []);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all.filter(m => m.id !== id)));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(id).delete().catch(() => {});
      }
    } catch (e) {}
  },

  // Toggle a reaction on a chat message. Same pattern POSTS uses but
  // talks to sphere_chat instead.
  react(messageId, emoji) {
    const username = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : '';
    if (!username || !messageId) return;
    const all = safeGetJSON(this.STORAGE_KEY, []);
    const idx = all.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const msg = _toggleReaction(all[idx], emoji, username);
    all[idx] = msg;
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all.slice(-200)));
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(messageId).set(
          { reactions: msg.reactions || {} }, { merge: true }
        ).catch(e => _handleSyncError('CHAT', e));
      }
    } catch (e) {}
  },

  async fetchRemote() {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return this.getAll();
    try {
      const snap = await DATA_SYNC.db.collection(this.COLLECTION)
        .orderBy('createdAt', 'desc').limit(100).get();
      const remote = [];
      snap.forEach(d => remote.push(d.data()));
      const merged = _mergeById(remote, safeGetJSON(this.STORAGE_KEY, []));
      // Sort ascending and cap
      merged.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      safeSetItem(this.STORAGE_KEY, JSON.stringify(merged.slice(-200)));
      return this.getAll();
    } catch (e) {
      console.warn('[CHAT] fetchRemote:', e.message);
      return this.getAll();
    }
  },

  // Live listener for real-time chat updates
  startLiveListener(onUpdate) {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    this.stopLiveListener();
    try {
      this._listener = DATA_SYNC.db.collection(this.COLLECTION)
        .orderBy('createdAt', 'desc').limit(100)
        .onSnapshot(snap => {
          const remote = [];
          snap.forEach(d => remote.push(d.data()));
          const merged = _mergeById(remote, safeGetJSON(this.STORAGE_KEY, []));
          merged.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          safeSetItem(this.STORAGE_KEY, JSON.stringify(merged.slice(-200)));
          if (typeof onUpdate === 'function') onUpdate(this.getAll());
        }, err => _handleSyncError('CHAT', err));
    } catch (e) { console.warn('[CHAT] startLiveListener:', e.message); }
  },

  stopLiveListener() {
    if (this._listener) {
      try { this._listener(); } catch (e) {}
      this._listener = null;
    }
  }
};

// ============================================================
// DMS — Direct messages (1-on-1 chat).
//
// Conversation id is the two usernames sorted + joined with "__"
// (so alice <-> bob always resolves to alice__bob, regardless of
// who initiated). Messages live as a subcollection under the
// conversation doc:
//
//   sphere_dms/{convId}                     — metadata
//   sphere_dms/{convId}/messages/{msgId}    — message docs
//
// localStorage caches each conversation's messages so they survive
// reloads, and an unreadByMe map gives the sidebar badge.
// ============================================================
const DMS = {
  COLLECTION: 'sphere_dms',
  STORAGE_KEY_PREFIX: 'dm_',           // dm_<convId>  -> messages array
  CONV_LIST_KEY: 'dm_conversations',   // list of {convId, peer*, lastMessage, lastMessageAt, unread}
  MAX_LEN: 1000,
  _convListener: null,
  _messageListener: null,
  _activeConv: null,

  convIdFor(userA, userB) {
    if (!userA || !userB) return null;
    return [String(userA), String(userB)].sort().join('__');
  },

  peerOf(convId, me) {
    if (!convId || !me) return null;
    const parts = convId.split('__');
    return parts.find(p => p !== me) || null;
  },

  // ----- Conversation list -----
  getConversations() {
    const arr = safeGetJSON(this.CONV_LIST_KEY, []);
    return Array.isArray(arr) ? arr.slice().sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)) : [];
  },

  _saveConversations(list) {
    safeSetItem(this.CONV_LIST_KEY, JSON.stringify(list || []));
  },

  upsertConversation(convId, patch) {
    if (!convId) return;
    const list = safeGetJSON(this.CONV_LIST_KEY, []);
    const arr = Array.isArray(list) ? list : [];
    const idx = arr.findIndex(c => c && c.convId === convId);
    if (idx === -1) arr.push(Object.assign({ convId }, patch));
    else arr[idx] = Object.assign({}, arr[idx], patch);
    this._saveConversations(arr);
  },

  // ----- Messages per conversation -----
  _msgKey(convId) { return this.STORAGE_KEY_PREFIX + convId; },

  getMessages(convId) {
    if (!convId) return [];
    const arr = safeGetJSON(this._msgKey(convId), []);
    return Array.isArray(arr) ? arr.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) : [];
  },

  _saveMessages(convId, msgs) {
    if (!convId) return;
    safeSetItem(this._msgKey(convId), JSON.stringify(msgs || []));
  },

  // ----- Send -----
  send(peerUsername, peerDisplayName, peerAvatar, text) {
    text = (text || '').trim().slice(0, this.MAX_LEN);
    if (!text) return null;
    const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
    if (!me || !peerUsername) return null;
    const convId = this.convIdFor(me, peerUsername);
    const meta = (typeof _commonAuthorMeta === 'function') ? _commonAuthorMeta() : { username: me, displayName: me, avatar: null, initials: 'U' };
    const msg = {
      id: 'dm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      convId,
      from: me,
      fromDisplay: meta.displayName,
      fromAvatar: meta.avatar,
      to: peerUsername,
      text,
      createdAt: Date.now()
    };

    // Local: append + bump conversation
    const all = this.getMessages(convId);
    all.push(msg);
    this._saveMessages(convId, all);
    this.upsertConversation(convId, {
      peerUsername,
      peerDisplayName: peerDisplayName || peerUsername,
      peerAvatar: peerAvatar || null,
      lastMessage: text,
      lastMessageAt: msg.createdAt,
      lastFrom: me,
      unread: 0
    });

    // Firestore: write the message and the conversation metadata.
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        const convRef = DATA_SYNC.db.collection(this.COLLECTION).doc(convId);
        convRef.collection('messages').doc(msg.id).set(msg)
          .catch(e => _handleSyncError('DMS', e));
        convRef.set({
          convId,
          participants: [me, peerUsername].sort(),
          lastMessage: text,
          lastMessageAt: msg.createdAt,
          lastFrom: me,
          updatedAt: msg.createdAt
        }, { merge: true }).catch(e => _handleSyncError('DMS', e));
      }
    } catch (e) {}
    return msg;
  },

  markRead(convId) {
    if (!convId) return;
    this.upsertConversation(convId, { unread: 0 });
  },

  totalUnread() {
    return this.getConversations().reduce((sum, c) => sum + (c && c.unread ? c.unread : 0), 0);
  },

  // ----- Live listeners -----
  startConvListener(onUpdate) {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    if (typeof AUTH === 'undefined' || !AUTH.getUser) return;
    const me = AUTH.getUser();
    if (!me) return;
    this.stopConvListener();
    try {
      this._convListener = DATA_SYNC.db.collection(this.COLLECTION)
        .where('participants', 'array-contains', me)
        .onSnapshot(snap => {
          const localList = safeGetJSON(this.CONV_LIST_KEY, []);
          const localArr = Array.isArray(localList) ? localList : [];
          snap.forEach(doc => {
            const data = doc.data() || {};
            const convId = data.convId || doc.id;
            const peer = (Array.isArray(data.participants) ? data.participants : []).find(p => p !== me);
            if (!peer) return;
            const existing = localArr.find(c => c && c.convId === convId);
            const prevAt = existing ? (existing.lastMessageAt || 0) : 0;
            const newAt = data.lastMessageAt || 0;
            // Increment unread if the new last-message is from peer and is newer
            const becameNew = newAt > prevAt && data.lastFrom && data.lastFrom !== me;
            const next = Object.assign({}, existing || {}, {
              convId,
              peerUsername: peer,
              peerDisplayName: existing ? existing.peerDisplayName : peer,
              peerAvatar: existing ? existing.peerAvatar : null,
              lastMessage: data.lastMessage || (existing && existing.lastMessage) || '',
              lastMessageAt: newAt || prevAt,
              lastFrom: data.lastFrom || (existing && existing.lastFrom) || null,
              unread: (existing && existing.unread ? existing.unread : 0) + (becameNew ? 1 : 0)
            });
            const idx = localArr.findIndex(c => c && c.convId === convId);
            if (idx === -1) localArr.push(next); else localArr[idx] = next;
          });
          this._saveConversations(localArr);
          if (typeof onUpdate === 'function') onUpdate(this.getConversations());
        }, err => _handleSyncError('DMS', err));
    } catch (e) { console.warn('[DMS] convListener:', e.message); }
  },

  stopConvListener() {
    if (this._convListener) {
      try { this._convListener(); } catch (e) {}
      this._convListener = null;
    }
  },

  startMessageListener(convId, onUpdate) {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    if (!convId) return;
    this.stopMessageListener();
    this._activeConv = convId;
    try {
      this._messageListener = DATA_SYNC.db.collection(this.COLLECTION).doc(convId)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .limit(200)
        .onSnapshot(snap => {
          const remote = [];
          snap.forEach(d => remote.push(d.data()));
          // Merge with local
          const local = this.getMessages(convId);
          const merged = _mergeById(remote, local);
          this._saveMessages(convId, merged);
          if (typeof onUpdate === 'function') onUpdate(this.getMessages(convId));
        }, err => _handleSyncError('DMS', err));
    } catch (e) { console.warn('[DMS] messageListener:', e.message); }
  },

  stopMessageListener() {
    if (this._messageListener) {
      try { this._messageListener(); } catch (e) {}
      this._messageListener = null;
    }
    this._activeConv = null;
  }
};

// Shared reaction palette + per-user "mark as read" tracker.
// Used by POSTS, ANNOUNCEMENTS (and easily by WINS later).
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏', '🙌', '💡', '💯'];

function _toggleReaction(item, emoji, username) {
  if (!username) return item;
  const reactions = (item && item.reactions) ? Object.assign({}, item.reactions) : {};
  const usersFor = (reactions[emoji] || []).slice();
  const idx = usersFor.indexOf(username);
  if (idx === -1) usersFor.push(username);
  else usersFor.splice(idx, 1);
  if (usersFor.length === 0) delete reactions[emoji];
  else reactions[emoji] = usersFor;
  item.reactions = reactions;
  return item;
}

// Apply a reaction toggle to whatever community module backs this id.
// Single helper so the renderers don't need to care which collection
// the item lives in.
function applyReaction(kind, id, emoji) {
  const username = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : '';
  if (!username) return;
  const moduleByKind = {
    posts: typeof POSTS !== 'undefined' ? POSTS : null,
    announcements: typeof ANNOUNCEMENTS !== 'undefined' ? ANNOUNCEMENTS : null,
    wins: typeof WINS !== 'undefined' ? WINS : null
  };
  const mod = moduleByKind[kind];
  if (!mod) return;
  const all = safeGetJSON(mod.STORAGE_KEY, []);
  const idx = all.findIndex(x => x.id === id);
  if (idx === -1) return;
  const item = _toggleReaction(all[idx], emoji, username);
  all[idx] = item;
  safeSetItem(mod.STORAGE_KEY, JSON.stringify(all));
  // Sync to Firestore so other students see the same counts
  try {
    if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
      DATA_SYNC.db.collection(mod.COLLECTION).doc(id).set(
        { reactions: item.reactions || {} }, { merge: true }
      ).catch(e => console.warn('[REACT ' + kind + '] sync:', e.message));
    }
  } catch (e) {}
}

// Per-user "this announcement was acknowledged" tracker. Stored locally —
// each student sees their own read/unread state regardless of who else
// has acknowledged the same announcement.
const READ_ANNOUNCEMENTS = {
  KEY: 'read_announcements',
  load() { return safeGetJSON(this.KEY, []); },
  has(id) { return this.load().indexOf(id) !== -1; },
  mark(id) {
    const ids = this.load();
    if (ids.indexOf(id) === -1) {
      ids.push(id);
      safeSetItem(this.KEY, JSON.stringify(ids));
    }
  },
  unmark(id) {
    const ids = this.load().filter(x => x !== id);
    safeSetItem(this.KEY, JSON.stringify(ids));
  }
};

// Render a reactions row: existing reaction pills + an "Add reaction"
// button that toggles a popup palette of REACTION_EMOJIS.
function renderReactionsRow(item, kind) {
  const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : '';
  const reactions = item.reactions || {};
  const entries = Object.keys(reactions).map(e => ({
    emoji: e,
    users: reactions[e] || [],
    mine: me && (reactions[e] || []).indexOf(me) !== -1
  })).filter(r => r.users.length > 0);

  const pills = entries.map(r =>
    '<button type="button" class="react-pill' + (r.mine ? ' mine' : '') + '" data-kind="' + kind + '" data-id="' + (item.id || '') + '" data-emoji="' + r.emoji + '">'
    + '<span class="react-emoji">' + r.emoji + '</span>'
    + '<span class="react-count">' + r.users.length + '</span>'
    + '</button>'
  ).join('');

  return '<div class="reactions-row">'
    + pills
    + '<div class="react-picker-wrap">'
    +   '<button type="button" class="react-add-btn" data-kind="' + kind + '" data-id="' + (item.id || '') + '" aria-label="Add reaction" title="React">'
    +     '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
    +     '<span>React</span>'
    +   '</button>'
    +   '<div class="react-palette" hidden>'
    +     REACTION_EMOJIS.map(e =>
            '<button type="button" class="react-palette-btn" data-kind="' + kind + '" data-id="' + (item.id || '') + '" data-emoji="' + e + '">' + e + '</button>'
          ).join('')
    +   '</div>'
    + '</div>'
    + '</div>';
}

// Wire all reaction pills + add-reaction buttons inside a container.
// Toggles the user's reaction on click; closes any open palette.
function bindReactions(containerEl, rerender) {
  if (!containerEl) return;
  containerEl.querySelectorAll('.react-pill, .react-palette-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      applyReaction(btn.dataset.kind, btn.dataset.id, btn.dataset.emoji);
      // Close the palette if open
      const palette = btn.closest('.react-palette');
      if (palette) palette.hidden = true;
      if (typeof rerender === 'function') rerender();
    });
  });
  containerEl.querySelectorAll('.react-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close any other open palettes
      containerEl.querySelectorAll('.react-palette').forEach(p => {
        if (p !== btn.nextElementSibling) p.hidden = true;
      });
      const palette = btn.nextElementSibling;
      if (palette) palette.hidden = !palette.hidden;
    });
  });
  // Click outside any palette to close it
  if (!containerEl._reactDocClickWired) {
    containerEl._reactDocClickWired = true;
    document.addEventListener('click', () => {
      containerEl.querySelectorAll('.react-palette').forEach(p => p.hidden = true);
    });
  }
}

function timeAgo(ts) {
  if (!ts) return 'just now';
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd ago';
  const w = Math.floor(d / 7);
  if (w < 5) return w + 'w ago';
  const date = new Date(ts);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ===== ADMIN AUTH SYSTEM =====
const AUTH = {
  USERS_KEY: 'auth_users',

  // Default admin account — reflects the real Stratos Sphere Academy
  // branding so the navbar / analytics / posts show accurate info.
  DEFAULT_ADMIN: {
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    fullName: 'Stratos Admin',
    email: 'admin@stratosphereacademy.com'
  },

  // Initialize with default admin account
  initUsers() {
    if (!safeGetItem(this.USERS_KEY)) {
      safeSetItem(this.USERS_KEY, JSON.stringify([Object.assign({}, this.DEFAULT_ADMIN)]));
      return;
    }
    // Migration: keep the existing admin record but refresh the
    // placeholder display fields to current brand info. Only touches
    // entries that still have the legacy generic values — never
    // overwrites a customised admin profile.
    try {
      const users = safeGetJSON(this.USERS_KEY, []);
      let dirty = false;

      // Normalize EVERY username to lowercase + trimmed. Legacy
      // accounts from before the casing rollout may have stored
      // mixed-case usernames like "Maria" — those need to be
      // lowercased so login + Firestore doc-ids stay consistent.
      // Whitespace from copy-paste also gets stripped here.
      users.forEach(u => {
        if (!u || typeof u.username !== 'string') return;
        const norm = u.username.toLowerCase().trim();
        if (norm !== u.username) {
          u.username = norm;
          dirty = true;
        }
      });

      // De-duplicate any records that collide after normalization
      // (e.g. both "Maria" and "maria" existed). Keep the one with
      // the more complete record (password + fullName).
      const seen = new Map();
      const deduped = [];
      users.forEach(u => {
        if (!u || !u.username) { deduped.push(u); return; }
        const key = u.username;
        if (!seen.has(key)) {
          seen.set(key, deduped.length);
          deduped.push(u);
        } else {
          const existing = deduped[seen.get(key)];
          // Prefer the record that has both password + fullName
          const existingScore = (existing.password ? 1 : 0) + (existing.fullName ? 1 : 0);
          const newScore = (u.password ? 1 : 0) + (u.fullName ? 1 : 0);
          if (newScore > existingScore) {
            deduped[seen.get(key)] = u;
            dirty = true;
          } else {
            dirty = true; // dropping a dupe still counts as dirty
          }
        }
      });
      if (deduped.length !== users.length) {
        users.length = 0;
        users.push.apply(users, deduped);
      }

      users.forEach(u => {
        if (u.role !== 'admin') return;
        if (u.fullName === 'Admin' || u.fullName === 'admin' || !u.fullName) {
          u.fullName = this.DEFAULT_ADMIN.fullName;
          dirty = true;
        }
        if (u.email === 'admin@sphereacademy.com' || !u.email) {
          u.email = this.DEFAULT_ADMIN.email;
          dirty = true;
        }
      });
      // Ensure at least one admin always exists (defensive — recreate if
      // someone wiped the array but kept the key around).
      if (!users.some(u => u.role === 'admin')) {
        users.push(Object.assign({}, this.DEFAULT_ADMIN));
        dirty = true;
      }
      if (dirty) safeSetItem(this.USERS_KEY, JSON.stringify(users));
    } catch (e) { /* non-fatal */ }
  },

  getAllUsers() {
    this.initUsers();
    return safeGetJSON(this.USERS_KEY, []);
  },

  isLoggedIn() {
    return safeGetItem('auth_logged_in') === 'true';
  },

  isAdmin() {
    return this.isLoggedIn() && safeGetItem('auth_role') === 'admin';
  },

  // Sync version — checks localStorage only. Used by the synchronous
  // legacy login form. The async fallback in the login handler also
  // pulls from Firestore so a password reset by an admin propagates
  // to any device.
  // Username comparison is case-insensitive (signup lowercases). The
  // password is trimmed on BOTH sides before the case-sensitive match
  // so accidental whitespace from copy-paste doesn't break login.
  login(username, password) {
    this.initUsers();
    const users = this.getAllUsers();
    const u_lower = (username || '').toLowerCase().trim();
    const p_input = (password || '').toString();
    const p_trimmed = p_input.trim();
    const user = users.find(u => {
      if ((u.username || '').toLowerCase().trim() !== u_lower) return false;
      const stored = (u.password || '').toString();
      // Match against both raw and trimmed stored password, AND both
      // raw and trimmed input — catches every whitespace combination.
      return stored === p_input
        || stored === p_trimmed
        || stored.trim() === p_input
        || stored.trim() === p_trimmed;
    });
    if (user) {
      safeSetItem('auth_logged_in', 'true');
      safeSetItem('auth_user', user.username);
      safeSetItem('auth_role', user.role);
      // Set profile if first time, OR refresh placeholder admin profile
      // so the navbar / posts show "Stratos Admin" instead of the legacy
      // single-word "Admin".
      const existing = safeGetJSON('auth_profile', null);
      const isPlaceholder = !existing
        || (user.role === 'admin' && (existing.firstName === 'Admin' || !existing.firstName));
      if (isPlaceholder) {
        safeSetItem('auth_profile', JSON.stringify({
          firstName: (user.fullName || '').split(' ')[0] || '',
          lastName: (user.fullName || '').split(' ').slice(1).join(' ') || '',
          email: user.email || ''
        }));
      }
      // Restore the user's saved avatar (per-username key persisted
      // through logout). Also pulls from Firestore in the background
      // so a fresh device picks up the photo too.
      const savedAvatar = safeGetItem('avatar_' + user.username);
      if (savedAvatar) {
        safeSetItem('auth_avatar', savedAvatar);
      } else {
        safeSetItem('auth_avatar', '');
      }
      try {
        if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
          DATA_SYNC.db.collection('sphere_users').doc(user.username).get()
            .then(snap => {
              if (!snap.exists) return;
              const remoteAvatar = (snap.data() || {}).avatar;
              if (remoteAvatar) {
                safeSetItem('auth_avatar', remoteAvatar);
                safeSetItem('avatar_' + user.username, remoteAvatar);
              }
            }).catch(() => {});
        }
      } catch (e) {}
      // Push a baseline + lastActive update to Firestore right at
      // login time, so the admin Students tab sees them immediately —
      // doesn't have to wait for USER_SYNC.save() to fire 1.5s later
      // on the dashboard (which can race the page load).
      //
      // CRITICAL: we also mirror the password here. Legacy accounts
      // created before the signup-writes-password fix have a Firestore
      // doc with no `password` field, so cross-device login fails.
      // By mirroring on every successful login, any account becomes
      // cross-device capable after a single login from any device.
      // The Firestore rules already require auth for sphere_users
      // writes, so this stays within the existing security model.
      try {
        if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db && typeof firebase !== 'undefined') {
          // Normalize the username for the Firestore doc id so all
          // writes target the same canonical doc, even if the local
          // record stored a mixed-case original.
          const canonicalUsername = (user.username || '').toLowerCase().trim();
          const payload = {
            username: canonicalUsername,
            displayName: user.fullName || canonicalUsername,
            email: user.email || '',
            role: user.role || 'student',
            lastActive: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
          };
          // Only mirror the password if it's a real value — never
          // overwrite with an empty string.
          if (user.password) payload.password = user.password;
          DATA_SYNC.db.collection('sphere_users').doc(canonicalUsername).set(payload, { merge: true })
            .catch(e => console.warn('[LOGIN] Firestore lastActive update failed:', e.message));
        }
      } catch (e) { /* non-fatal */ }
      return true;
    }
    return false;
  },

  register(fullName, email, username, password) {
    this.initUsers();
    // Normalize username + email so every storage path uses the same
    // canonical form. Mixed-case or whitespace-padded usernames here
    // are what cause Firestore doc-id mismatches at login time.
    username = String(username || '').toLowerCase().trim();
    email = String(email || '').toLowerCase().trim();
    fullName = String(fullName || '').trim();
    password = String(password || '');

    if (!username || !password) {
      return { success: false, error: 'Username and password are required.' };
    }

    const users = this.getAllUsers();
    if (users.find(u => (u.username || '').toLowerCase().trim() === username)) {
      return { success: false, error: 'Username already taken.' };
    }
    if (email && users.find(u => (u.email || '').toLowerCase().trim() === email)) {
      return { success: false, error: 'Email already registered.' };
    }
    users.push({
      username: username,
      password: password,
      role: 'student',
      fullName: fullName,
      email: email
    });
    safeSetItem(this.USERS_KEY, JSON.stringify(users));

    // Push a baseline doc to Firestore right away so the admin's
    // Analytics view shows newly registered students even before they
    // log in for the first time. USER_SYNC.save() will merge real
    // progress into this doc once the student actually starts using
    // the site.
    //
    // CRITICAL: include the `password` field so the student can log in
    // on a DIFFERENT device — the login.html fallback queries
    // sphere_users/{username}.password to verify cross-device logins.
    // Without this, every new signup is single-device-locked until an
    // admin manually resets the password.
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db && typeof firebase !== 'undefined') {
        DATA_SYNC.db.collection('sphere_users').doc(username).set({
          username: username,
          password: password,
          displayName: fullName,
          email: email,
          role: 'student',
          progress: {},
          quizScores: {},
          quizAttempts: {},
          assignments: {},
          activityByDay: {},
          registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastActive: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true })
          .catch(e => console.warn('[REGISTER] Firestore write failed:', e.message));
      }
    } catch (e) { /* non-fatal — local registration still succeeded */ }

    return { success: true };
  },

  logout() {
    localStorage.removeItem('auth_logged_in');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_profile');
    localStorage.removeItem('auth_avatar');
    window.location.href = 'login.html';
  },

  getUser() {
    return safeGetItem('auth_user') || '';
  },

  // Protect a page — redirect to login if not authenticated
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  },

  // Get profile data
  getProfile() {
    return safeGetJSON('auth_profile', {});
  },

  // Get display name
  getDisplayName() {
    const profile = this.getProfile();
    if (profile.firstName && profile.lastName) return profile.firstName + ' ' + profile.lastName;
    if (profile.firstName) return profile.firstName;
    return this.getUser() || 'User';
  },

  // Get initials for avatar
  getInitials() {
    const profile = this.getProfile();
    if (profile.firstName && profile.lastName) {
      return profile.firstName[0] + profile.lastName[0];
    }
    const name = this.getUser() || 'U';
    return name[0].toUpperCase();
  },

  // Get avatar image (base64 or null)
  getAvatarImage() {
    return safeGetItem('auth_avatar') || null;
  },

  // Update navbar to show logged-in state
  updateNav() {
    const navCta = document.querySelector('.nav-cta');
    if (!navCta) return;

    // Landing page stays clean — hide search/notif, no avatar/logout.
    // Just change "Log In" button to "Go to Course" when signed in.
    const pathname = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (pathname === 'index.html' || pathname === '') {
      const searchBtn = navCta.querySelector('#searchBtn');
      const notifBtn = navCta.querySelector('#notifBtn');
      if (searchBtn) searchBtn.style.display = 'none';
      if (notifBtn) notifBtn.style.display = 'none';
      if (this.isLoggedIn()) {
        const target = this.isAdmin() ? 'admin.html' : 'dashboard.html';
        const label = this.isAdmin() ? 'Admin Panel' : 'Home';
        const loginBtn = navCta.querySelector('a[href="login.html"]');
        if (loginBtn) {
          loginBtn.href = target;
          loginBtn.textContent = label + ' \u2192';
          loginBtn.classList.remove('btn-outline');
          loginBtn.classList.add('btn-primary');
        }
        // Also update mobile CTA
        const mobileLoginLinks = document.querySelectorAll('.nav-mobile-cta a[href="login.html"]');
        mobileLoginLinks.forEach(a => {
          a.href = target;
          a.textContent = label;
          a.classList.remove('btn-outline');
          a.classList.add('btn-primary');
        });
      }
      return;
    }

    if (this.isLoggedIn()) {
      // ===== Inject persistent tabs: Home / Course / Events =====
      // Profile remains accessible via the avatar in the right-hand nav-cta.
      // Skip on login/signup (public pages) only — admin needs the same
      // tabs so they can jump to the student-facing surfaces while
      // keeping access to Admin Panel via the right-hand button.
      const navLinksEl = document.querySelector('.nav-links');
      const tabPages = ['dashboard.html', 'course.html', 'lesson.html', 'profile.html', 'events.html', 'admin.html'];
      if (navLinksEl && tabPages.indexOf(pathname) !== -1 && !navLinksEl.querySelector('.nav-tab-link')) {
        const tabs = [
          { href: 'dashboard.html', label: 'Home',   pages: ['dashboard.html'] },
          { href: 'course.html',    label: 'Course', pages: ['course.html', 'lesson.html'] },
          { href: 'events.html',    label: 'Events', pages: ['events.html'] }
        ];
        // Prepend so tabs appear before the mobile CTA
        const frag = document.createDocumentFragment();
        tabs.forEach(t => {
          const li = document.createElement('li');
          li.className = 'nav-tab-item';
          const a = document.createElement('a');
          a.href = t.href;
          a.textContent = t.label;
          a.className = 'nav-tab-link' + (t.pages.indexOf(pathname) !== -1 ? ' active' : '');
          li.appendChild(a);
          frag.appendChild(li);
        });
        navLinksEl.insertBefore(frag, navLinksEl.firstChild);
      }

      const loginBtn = navCta.querySelector('a[href="login.html"]');
      const enrollBtn = navCta.querySelector('a[href="signup.html"]');

      // Replace login button with profile avatar + logout
      if (loginBtn) {
        const avatarImg = this.getAvatarImage();
        const initials = this.getInitials();
        const displayName = this.getDisplayName();

        const profileLink = document.createElement('a');
        profileLink.href = 'profile.html';
        profileLink.className = 'nav-profile-link';
        profileLink.innerHTML = `
          <div class="nav-profile-avatar">
            ${avatarImg
              ? '<img src="' + avatarImg + '" alt="Profile">'
              : '<span>' + initials + '</span>'}
          </div>
          <span class="nav-profile-name">${displayName}</span>
        `;
        loginBtn.replaceWith(profileLink);

        // Add admin panel link if admin
        if (this.isAdmin()) {
          const adminBtn = document.createElement('a');
          adminBtn.href = 'admin.html';
          adminBtn.className = 'btn btn-primary';
          adminBtn.style.cssText = 'padding:10px 18px; font-size:0.82rem;';
          adminBtn.textContent = 'Admin Panel';
          navCta.appendChild(adminBtn);
        }

        // Add logout button
        const logoutBtn = document.createElement('a');
        logoutBtn.href = '#';
        logoutBtn.className = 'btn btn-primary';
        logoutBtn.style.cssText = 'padding:10px 18px; font-size:0.82rem;';
        logoutBtn.textContent = 'Log Out';
        logoutBtn.addEventListener('click', (e) => {
          e.preventDefault();
          AUTH.logout();
        });
        navCta.appendChild(logoutBtn);
      }

      // Update mobile nav CTA links too
      const mobileCtas = document.querySelectorAll('.nav-mobile-cta');
      mobileCtas.forEach(li => {
        const link = li.querySelector('a');
        if (!link) return;
        if (link.href.includes('login.html')) {
          link.href = 'profile.html';
          link.textContent = 'My Profile';
          link.className = 'btn btn-outline';
        }
      });

      // Add admin link to mobile menu if admin
      if (this.isAdmin()) {
        const navLinksEl = document.querySelector('.nav-links');
        if (navLinksEl) {
          const adminLi = document.createElement('li');
          adminLi.className = 'nav-mobile-cta';
          adminLi.innerHTML = '<a href="admin.html" class="btn btn-primary">Admin Panel</a>';
          navLinksEl.appendChild(adminLi);
        }
      }
    }
  }
};

// Update nav on every page
AUTH.updateNav();

// Sync student data to Firestore on every page load (for admin analytics).
// Delayed so Firebase anonymous auth has time to complete first.
if (AUTH.isLoggedIn()) {
  setTimeout(() => { try { USER_SYNC.save(true); } catch (e) {} }, 1500);
}

// Password show/hide toggle — auto-wrap every <input type="password">
(function initPasswordToggles() {
  const EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  function wrap() {
    const inputs = document.querySelectorAll('input[type="password"]:not([data-toggle-wrapped])');
    inputs.forEach(input => {
      input.setAttribute('data-toggle-wrapped', '1');
      const wrapEl = document.createElement('div');
      wrapEl.className = 'password-wrap';
      input.parentNode.insertBefore(wrapEl, input);
      wrapEl.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'password-toggle';
      btn.setAttribute('aria-label', 'Show password');
      btn.title = 'Show password';
      btn.innerHTML = EYE_SVG;
      btn.addEventListener('click', () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.innerHTML = showing ? EYE_SVG : EYE_OFF_SVG;
        btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        btn.title = showing ? 'Show password' : 'Hide password';
      });
      wrapEl.appendChild(btn);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wrap);
  } else {
    wrap();
  }
})();

// Protect pages
const protectedPages = ['course.html', 'lesson.html', 'profile.html', 'admin.html', 'dashboard.html'];
const currentPage = window.location.pathname.split('/').pop();
if (protectedPages.includes(currentPage)) {
  AUTH.requireAuth();
}

// Admin-only page protection
if (currentPage === 'admin.html' && !AUTH.isAdmin()) {
  window.location.href = 'course.html';
}

// ============================================================
// IDLE TIMEOUT — auto-logout after 30 min of zero activity.
//
//   - Any mousemove / keydown / scroll / touch / click resets the timer
//     (throttled to once per second so we don't thrash localStorage).
//   - At 28 min idle (2 min before timeout) a modal pops with a live
//     countdown + "Stay signed in" button.
//   - Cross-tab sync: the activity timestamp is shared via localStorage,
//     so being active in ANY tab keeps every other tab alive.
//   - If a user logs out (or is timed-out) in one tab, the storage event
//     also boots stale tabs back to the login page.
// ============================================================
const IDLE_TIMEOUT = {
  TIMEOUT_MS: 30 * 60 * 1000,    // 30 minutes
  WARN_BEFORE_MS: 2 * 60 * 1000, // show warning 2 min before logout
  THROTTLE_MS: 1000,             // ignore activity events within this window
  STORAGE_KEY: 'auth_last_activity',

  _timer: null,
  _warnTimer: null,
  _countdownInterval: null,
  _lastReset: 0,
  _warningOpen: false,
  _started: false,

  start() {
    if (this._started) return;
    if (typeof AUTH === 'undefined' || !AUTH.isLoggedIn || !AUTH.isLoggedIn()) return;
    this._started = true;
    this._resetTimer(true); // initial schedule

    // Throttled activity listener — resets the countdown on user interaction.
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(ev => {
      window.addEventListener(ev, () => this._onActivity(), { passive: true });
    });

    // Cross-tab sync — other tabs publish activity via localStorage.
    window.addEventListener('storage', (e) => {
      if (e.key === this.STORAGE_KEY && e.newValue) {
        this._resetTimer(true); // skipStorage so we don't loop
        if (this._warningOpen) this._closeWarning();
      }
      // If auth was wiped in another tab (logout), bounce this tab too.
      if (e.key === 'auth_logged_in' && !e.newValue) {
        window.location.href = 'login.html';
      }
    });
  },

  _onActivity() {
    const now = Date.now();
    if (now - this._lastReset < this.THROTTLE_MS) return;
    this._lastReset = now;
    this._resetTimer();
    if (this._warningOpen) this._closeWarning();
  },

  _resetTimer(skipStorage) {
    if (this._timer) clearTimeout(this._timer);
    if (this._warnTimer) clearTimeout(this._warnTimer);

    if (!skipStorage) {
      try { localStorage.setItem(this.STORAGE_KEY, String(Date.now())); } catch (e) {}
    }

    this._warnTimer = setTimeout(() => this._showWarning(), this.TIMEOUT_MS - this.WARN_BEFORE_MS);
    this._timer = setTimeout(() => this._doLogout(), this.TIMEOUT_MS);
  },

  _showWarning() {
    if (this._warningOpen) return;
    this._warningOpen = true;

    const overlay = document.createElement('div');
    overlay.id = 'idleWarnOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(10,10,30,0.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px;animation:idleFadeIn 0.25s ease;';

    const isDark = (document.documentElement.getAttribute('data-theme') === 'dark');
    const cardBg = isDark ? '#18181b' : '#ffffff';
    const cardText = isDark ? '#fafafa' : '#0a0a0a';
    const cardSub = isDark ? '#a3a3a3' : '#737373';
    const cardBorder = isDark ? '#262626' : '#e5e5e5';

    let countdown = Math.floor(this.WARN_BEFORE_MS / 1000);
    overlay.innerHTML = (
      '<div style="background:' + cardBg + ';color:' + cardText + ';padding:36px 32px;border-radius:20px;max-width:420px;width:100%;border:1px solid ' + cardBorder + ';box-shadow:0 24px 80px rgba(0,0,0,0.4);text-align:center;font-family:Montserrat,system-ui,sans-serif;">'
      + '<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#635bff,#4c1d95);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">'
      +   '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
      + '</div>'
      + '<h3 style="font-family:Fraunces,Playfair Display,serif;font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.01em;">Still there?</h3>'
      + '<p style="color:' + cardSub + ';font-size:14px;line-height:1.6;margin:0 0 24px;">You\'ll be logged out in <strong id="idleCountdown" style="color:' + cardText + ';font-variant-numeric:tabular-nums;">' + countdown + '</strong> seconds due to inactivity.<br>Click the button below to stay signed in.</p>'
      + '<button id="idleStayBtn" style="padding:12px 28px;background:linear-gradient(135deg,#635bff,#4c1d95);color:white;border:none;border-radius:10px;font-family:inherit;font-weight:600;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(99,91,255,0.35);transition:transform 0.15s ease;">Stay signed in</button>'
      + '<button id="idleLogoutBtn" style="display:block;margin:14px auto 0;background:none;border:none;color:' + cardSub + ';font-family:inherit;font-size:12px;cursor:pointer;text-decoration:underline;">Or log out now</button>'
      + '</div>'
    );
    document.body.appendChild(overlay);

    // Live countdown — updates the visible seconds-left number every 1s.
    this._countdownInterval = setInterval(() => {
      countdown--;
      const el = document.getElementById('idleCountdown');
      if (el) el.textContent = Math.max(0, countdown);
      if (countdown <= 0) clearInterval(this._countdownInterval);
    }, 1000);

    document.getElementById('idleStayBtn').addEventListener('click', () => {
      this._closeWarning();
      this._onActivity();
    });
    document.getElementById('idleLogoutBtn').addEventListener('click', () => {
      this._doLogout(true);
    });
  },

  _closeWarning() {
    const overlay = document.getElementById('idleWarnOverlay');
    if (overlay) overlay.remove();
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
    this._warningOpen = false;
  },

  _doLogout(userInitiated) {
    try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) {}
    this._closeWarning();
    if (typeof AUTH !== 'undefined' && AUTH.logout) {
      if (!userInitiated) {
        // Quick toast-style notice before redirect so the user knows why.
        try {
          const note = document.createElement('div');
          note.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:9999999;background:#0a0a0a;color:#fff;padding:14px 22px;border-radius:12px;font-family:Montserrat,sans-serif;font-size:14px;font-weight:600;box-shadow:0 8px 28px rgba(0,0,0,0.4);';
          note.textContent = 'Signed out — 30 minutes of inactivity';
          document.body.appendChild(note);
        } catch (e) {}
      }
      setTimeout(() => AUTH.logout(), userInitiated ? 0 : 600);
    }
  }
};

// Inject the fade-in animation once.
(function injectIdleStyles() {
  if (document.getElementById('idle-timeout-styles')) return;
  const style = document.createElement('style');
  style.id = 'idle-timeout-styles';
  style.textContent = '@keyframes idleFadeIn{from{opacity:0;}to{opacity:1;}}';
  document.head.appendChild(style);
})();

// Kick off the idle timer on protected pages (any logged-in session).
if (protectedPages.includes(currentPage) && AUTH.isLoggedIn()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => IDLE_TIMEOUT.start());
  } else {
    IDLE_TIMEOUT.start();
  }
}

// ===== LESSONS DATA STORE =====
const LESSONS = {
  STORAGE_KEY: 'lessons_data',

  defaultLessons: [
    { id:'w1', month:1, week:1, title:'Digital Marketing & Ecommerce', category:'Creatives', difficulty:'Beginner', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false, assignment:{ enabled:false, title:'', description:'', fileTypes:{ image:true, video:false, pdf:false } } },
    { id:'w2', month:1, week:2, title:'How to Create Image Creatives', category:'Creatives', difficulty:'Beginner', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w3', month:1, week:3, title:'How to Create Video Creatives', category:'Creatives', difficulty:'Beginner', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w4', month:1, week:4, title:'Video Tutorial Project', category:'Creatives', difficulty:'Intermediate', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w5', month:2, week:5, title:'Image Creatives Review & Improvement', category:'Creatives+', difficulty:'Intermediate', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w6', month:2, week:6, title:'Video Creatives Practice', category:'Creatives+', difficulty:'Intermediate', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w7', month:2, week:7, title:'Customer Angle Deep Dive', category:'Creatives+', difficulty:'Intermediate', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w8', month:2, week:8, title:'Integrated Output & Feedback', category:'Creatives+', difficulty:'Intermediate', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w9', month:3, week:9, title:'Google Sheets for Marketers', category:'Tools', difficulty:'Beginner', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w10', month:3, week:10, title:'Botcake — Chatbot Marketing', category:'Tools', difficulty:'Intermediate', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w11', month:3, week:11, title:'Chatfuel — Messenger Automation', category:'Tools', difficulty:'Intermediate', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w12', month:3, week:12, title:'POS & Pancake — Order & CRM', category:'Tools', difficulty:'Intermediate', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w13', month:4, week:13, title:'Introduction to Meta Ads Manager', category:'Ads Manager', difficulty:'Beginner', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w14', month:4, week:14, title:'Ads Manager Deep Dive', category:'Ads Manager', difficulty:'Intermediate', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w15', month:4, week:15, title:'Targeting & Audiences', category:'Ads Manager', difficulty:'Advanced', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w16', month:4, week:16, title:'Set Up & Launch Campaign', category:'Ads Manager', difficulty:'Advanced', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false }
  ],

  init() {
    if (!safeGetItem(this.STORAGE_KEY)) {
      safeSetItem(this.STORAGE_KEY, JSON.stringify(this.defaultLessons));
      return;
    }
    // One-time title migration: replace old W1-W4 default titles with the new ones,
    // but only if the admin hasn't customized them (no sections, no proTip, etc.).
    try {
      const stored = safeGetJSON(this.STORAGE_KEY, null);
      if (!Array.isArray(stored)) return;
      const OLD_TO_NEW = {
        'Intro to Marketing & Image Creatives': 'Digital Marketing & Ecommerce',
        'How to Create Video Creatives': 'How to Create Image Creatives', // w2 repurposed
        'Customer Angle Frameworks': 'How to Create Video Creatives',
        'Image & Video Combined Project': 'Video Tutorial Project'
      };
      let changed = false;
      stored.forEach(l => {
        if (l && OLD_TO_NEW[l.title]) {
          // Only w1-w4 — ignore other weeks that might coincidentally share names
          if (['w1','w2','w3','w4'].includes(l.id)) {
            // Only rename if admin hasn't added content (sections/proTip/videoUrl)
            const untouched = (!l.sections || l.sections.length === 0)
              && (!l.proTip || l.proTip.trim() === '')
              && (!l.videoUrl || l.videoUrl.trim() === '');
            if (untouched) {
              l.title = OLD_TO_NEW[l.title];
              changed = true;
            }
          }
        }
      });
      if (changed) {
        safeSetItem(this.STORAGE_KEY, JSON.stringify(stored));
      }
    } catch (e) { /* non-fatal */ }

    // One-time content seed for Phase 2-4 (W5-W16). Only fills lessons
    // whose sections array is empty, so any admin-customized content is
    // preserved. Idempotent — re-runs are no-ops once content is in place.
    // Also seeds duration + assignment config when missing.
    try {
      const stored = safeGetJSON(this.STORAGE_KEY, null);
      if (!Array.isArray(stored)) return;
      const seed = this.PHASE_2_4_SEED || {};
      let seedChanged = false;
      stored.forEach(l => {
        if (!l || !l.id || !seed[l.id]) return;
        const s = seed[l.id];
        // Content sections — only seed when totally empty
        const emptySections = !Array.isArray(l.sections) || l.sections.length === 0;
        if (emptySections) {
          l.sections = s.sections || [];
          l.keyTakeaways = s.keyTakeaways || [];
          l.proTip = s.proTip || '';
          seedChanged = true;
        }
        // Duration — fill in if missing/default
        if (s.duration && (!l.duration || l.duration === '45:00')) {
          l.duration = s.duration;
          seedChanged = true;
        }
        // Video metadata — leave URL empty for admin to paste, but flag
        // the lesson as a video lesson with the right type. Admin can
        // upload via Admin → Edit Lesson → Video URL.
        if (s.videoType && !l.videoType) {
          l.videoType = s.videoType;
          seedChanged = true;
        }
        // Assignment — only seed when the admin hasn't enabled one yet.
        const hasAssignment = l.assignment && (l.assignment.enabled || (l.assignment.title || '').trim() !== '');
        if (s.assignment && !hasAssignment) {
          l.assignment = JSON.parse(JSON.stringify(s.assignment)); // deep clone
          seedChanged = true;
        }
      });
      if (seedChanged) {
        safeSetItem(this.STORAGE_KEY, JSON.stringify(stored));
      }
    } catch (e) { /* non-fatal */ }
  },

  // Phase 2-4 content library — written for Filipino marketing interns
  // building skills toward agency / freelance work. Each lesson follows
  // the same shape: 4-5 sections, 5-7 takeaways, 1 pro tip.
  PHASE_2_4_SEED: {
    // =========================================================
    // PHASE 2 — CREATIVES + AI (W5–W8)
    // =========================================================
    w5: {
      duration: '32:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: 'Phase 1 Rework — Apply the CAT Framework',
        description: 'Take your three Phase 1 deliverables (product post, banner, story) and rebuild each one applying the CAT framework (Clear, Attractive, Targeted). Submit BEFORE + AFTER side by side — 6 images total (3 before + 3 after). Include a short PDF note (max 1 page) explaining what you changed on each piece and why. Use the BEFORE+AFTER format because clients hire marketers who can show growth, not just polish.',
        fileTypes: { image: true, video: false, pdf: true }
      },
      sections: [
        { heading: 'Why Critique Comes Before More Creating', content: '<p>Most beginners keep making new creatives without ever reviewing the old ones. That\'s why they plateau at "okay" forever. This week we slow down and audit everything you made in Phase 1 — every image post, banner, and story. The goal: spot the pattern in your weak spots so the next batch jumps a level.</p>' },
        { heading: 'The CAT Framework — Clear, Attractive, Targeted', content: '<p>Every creative gets scored on three axes:</p><ul><li><strong>Clear</strong> — Can a stranger understand the offer in 3 seconds? If the headline takes effort, it fails.</li><li><strong>Attractive</strong> — Does it stop the scroll? Color contrast, faces, motion, and curiosity gaps drive this.</li><li><strong>Targeted</strong> — Does it speak to ONE specific person, not "everyone"? Generic = invisible.</li></ul><p>Rate each of your Phase 1 deliverables 1-5 on each axis. Anything below 4 needs a redo.</p>' },
        { heading: 'AI as Your Creative Co-Pilot', content: '<p>Use these to speed up the rework — not replace your judgment:</p><ul><li><strong>ChatGPT / Gemini</strong> — draft 10 headline variations for your offer in 30 seconds.</li><li><strong>Midjourney / DALL-E</strong> — generate background visuals, product mockups, lifestyle scenes.</li><li><strong>Canva Magic Studio</strong> — instant background remover, text-to-image, brand kit auto-apply.</li><li><strong>Remove.bg</strong> — clean product cutouts in one click.</li></ul><p>Rule of thumb: AI for the first draft, your taste for the final cut.</p>' },
        { heading: 'Brand Kit Discipline', content: '<p>If your three Phase 1 deliverables look like they came from three different brands, that\'s your #1 fix. Lock these in Canva\'s Brand Kit:</p><ul><li>Primary + secondary colors (max 3-4 hex codes)</li><li>Two fonts max — one for headlines, one for body</li><li>Logo files (light + dark versions)</li><li>3-5 reusable templates</li></ul><p>Consistency builds recognition. Recognition builds trust. Trust converts.</p>' },
        { heading: 'This Week\'s Rework Assignment', content: '<p>Take your three Phase 1 deliverables (product post, banner, story) and rebuild each one with the critique applied. Submit BEFORE + AFTER side by side. We want to see the upgrade.</p>' }
      ],
      keyTakeaways: [
        'Critique before creating more — pattern-spot your weak spots.',
        'Score every creative on Clear, Attractive, Targeted (CAT).',
        'Use AI for first drafts only — keep your taste in the final approval.',
        'Lock a Brand Kit (colors, fonts, logo) before next week.',
        'Consistency across creatives is the difference between hobbyist and pro.',
        'Always present BEFORE + AFTER when iterating — shows growth to clients.'
      ],
      proTip: 'Save your "before" files in a folder called <strong>archive/</strong> — don\'t delete them. Future clients love seeing your evolution, and you\'ll need them when building your portfolio in Phase 4.'
    },

    w6: {
      duration: '38:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: 'Three Hooks, One Body — Video A/B Test',
        description: 'Create 3 short videos (15-30s each) for the SAME product, but with 3 DIFFERENT hooks. Use any of the 5 hook formulas from this lesson (question, bold claim, visual surprise, listicle preview, POV/story). Rules: same product, same body, same CTA — only the hook changes. Caption every video. Export as MP4, vertical 9:16 (1080×1920). This trains the most important muscle in performance marketing: variation testing.',
        fileTypes: { image: false, video: true, pdf: false }
      },
      sections: [
        { heading: 'Why Video Beats Static — The Algorithm Says So', content: '<p>Meta, TikTok, and YouTube all reward video with higher reach. A decent video can hit 10× the impressions of a great static image — for free. This week you go deeper into video creatives, mastering the structure that wins attention in the first 3 seconds.</p>' },
        { heading: 'The Hook-Body-CTA Formula (Deep Dive)', content: '<p>Every winning video has three parts:</p><ul><li><strong>Hook (0-3s)</strong> — Stop the scroll. Use a pattern interrupt: a shocking visual, a bold claim, a question, or an unexpected sound.</li><li><strong>Body (3-15s)</strong> — Deliver the promise. Show the product in action, explain the benefit, or tell the mini-story.</li><li><strong>CTA (15-30s)</strong> — Tell them exactly what to do next. "Shop now," "Message us," "Tap the link."</li></ul><p>If any of the three is weak, the whole video fails. Hook is non-negotiable.</p>' },
        { heading: 'The 5 Hook Types That Always Work', content: '<ol><li><strong>Question hook</strong> — "Bakit may pimples ka pa rin kahit ginagamit mo na yung skincare mo?"</li><li><strong>Bold claim</strong> — "I tripled my sales in 30 days using THIS."</li><li><strong>Visual surprise</strong> — Pour something, drop something, reveal something.</li><li><strong>Listicle preview</strong> — "3 reasons your skincare isn\'t working."</li><li><strong>POV / story</strong> — "POV: you\'re finally seeing results after 3 months..."</li></ol>' },
        { heading: 'Captions Are Non-Negotiable', content: '<p>85% of mobile video is watched on mute. No captions = no message. Tools that auto-caption (and let you style):</p><ul><li><strong>CapCut</strong> — free, auto-captions, trendy templates</li><li><strong>Canva Video</strong> — drag-and-drop, brand-kit aware</li><li><strong>Submagic / Captions</strong> — premium, viral-style word-by-word</li></ul><p>Style tip: bold word per beat, contrast color on key terms.</p>' },
        { heading: 'AI Tools That Save You Hours', content: '<ul><li><strong>Runway ML / Pika</strong> — text-to-video for B-roll</li><li><strong>ChatGPT</strong> — write 10 hook variations in seconds</li><li><strong>CapCut AI Voiceover</strong> — natural-sounding VO without recording</li><li><strong>ElevenLabs</strong> — premium AI voices in Filipino + English</li></ul>' }
      ],
      keyTakeaways: [
        'Hook is everything — first 3 seconds decide the next 27.',
        'Memorize the 5 hook types. Rotate them every test.',
        'Caption every video — 85% of viewers are on mute.',
        'Use AI for hooks/B-roll, but record real product shots yourself.',
        'Always test 2-3 hooks for the same body — same body, different hooks.',
        'A great body with a weak hook is a wasted video.'
      ],
      proTip: 'Before you publish, watch your own video <strong>on mute, with the screen tilted away</strong>. If you can still follow the message, it\'s ready. If you can\'t, the captions or visuals need work.'
    },

    w7: {
      duration: '42:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: '5 Angles for ONE Product',
        description: 'Pick ONE real product (your client\'s, a sample, or invented). Write 5 different ad scripts — one for each awareness stage (Unaware, Problem-aware, Solution-aware, Product-aware, Most-aware). Each script must include: opening hook (1 line), body (3-5 lines), CTA (1 line). Submit as a single PDF with all 5 angles labeled by awareness stage. Include 1 short paragraph at the top describing your customer avatar (age, situation, pain). This exact exercise is what senior marketers do every campaign.',
        fileTypes: { image: false, video: false, pdf: true }
      },
      sections: [
        { heading: 'What Is a "Customer Angle"?', content: '<p>An angle is the specific reason a specific customer should buy. Not the product features — the personal pain or desire it solves. "Anti-acne cream" is a product. "Get clear skin before your sister\'s wedding in 30 days" is an angle. Angles convert. Features don\'t.</p>' },
        { heading: 'The 5 Stages of Customer Awareness', content: '<p>(Eugene Schwartz framework — still the gold standard 60 years later)</p><ul><li><strong>Unaware</strong> — doesn\'t know they have the problem. Angle: introduce the pain.</li><li><strong>Problem-aware</strong> — knows the pain, not the solution. Angle: name + agitate the problem.</li><li><strong>Solution-aware</strong> — knows solutions exist, not yours. Angle: position your category.</li><li><strong>Product-aware</strong> — knows your product, hesitating. Angle: differentiation + proof.</li><li><strong>Most-aware</strong> — wants to buy, needs a reason now. Angle: offer + urgency.</li></ul><p>Most beginners write only at "most-aware" — that\'s why their ads only convert to people who already wanted to buy.</p>' },
        { heading: 'Pain → Solution → Promise (PSP)', content: '<p>The fastest angle formula:</p><ol><li><strong>Pain</strong>: Name the specific pain in their words (not yours).</li><li><strong>Solution</strong>: Show why this product solves it differently.</li><li><strong>Promise</strong>: Paint the after-state — what life looks like once the pain is gone.</li></ol><p>Example for a coffee shop:<br/>Pain — "Tired of pa-uwi coffee na tamlay na?"<br/>Solution — "Beans roasted same-day, brewed in 60 seconds."<br/>Promise — "Café-quality coffee at home, every morning."</p>' },
        { heading: 'Voice-of-Customer Mining', content: '<p>Stop guessing your customer\'s words. Steal them. Sources:</p><ul><li><strong>Shopee/Lazada reviews</strong> — read 50 reviews of competitor products. Note exact phrases.</li><li><strong>Facebook group comments</strong> — search PH groups for your niche, scroll the questions.</li><li><strong>YouTube comments</strong> — under reviews of competitor products.</li><li><strong>Messenger DMs / customer chats</strong> — your own conversations are gold.</li></ul><p>Copy their exact phrasing into your ad copy. It will outperform any clever copywriter line.</p>' },
        { heading: 'This Week\'s Angle Exercise', content: '<p>Pick ONE product (your client\'s or a sample). Write 5 different angle scripts — one for each awareness stage. Same product, 5 personalities, 5 messages. This is the most repeated skill in performance marketing.</p>' }
      ],
      keyTakeaways: [
        'Features tell. Angles sell.',
        'Map every prospect to one of 5 awareness stages — write the right angle for each.',
        'Pain → Solution → Promise (PSP) is the fastest angle template.',
        'Steal exact customer phrases from reviews + comments — they outperform polished copy.',
        'Write 5 angles per product before you build any creative.',
        'Test angles, not designs. Same design with a new angle often beats new design + old angle.'
      ],
      proTip: 'Keep a <strong>swipe file</strong> — a Google Doc where you paste every winning headline you see in the wild (Meta Ad Library is gold). When you\'re stuck, browse the swipe file and adapt, never copy. Pros have 1000+ entries.'
    },

    w8: {
      duration: '40:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: '5-Piece Campaign Set — One Product, Full Output',
        description: 'Produce a complete campaign set for ONE product: (1) hero video 15-30s, (2) square product post (1:1 image), (3) landscape banner (16:9 image), (4) vertical story creative (9:16 image with CTA), (5) alt video hook version of #1 — same body, new hook. All 5 must share ONE angle, ONE color palette, ONE font family. Submit all 5 files + a 1-page brand brief (PDF) explaining the chosen angle, target customer, and why this set holds together. This is your end-of-Phase-2 portfolio piece — clients will see it.',
        fileTypes: { image: true, video: true, pdf: true }
      },
      sections: [
        { heading: 'From Single Creatives to Campaign Sets', content: '<p>Phase 1-2 you built one piece at a time. Real campaigns ship <strong>sets</strong> — coordinated assets that work together: a hero video, supporting images, story variants, banner. This week you produce your first integrated campaign set.</p>' },
        { heading: 'Designing a Cohesive Set (Not Matchy-Matchy)', content: '<p>The set should feel like one family, not five clones. Rules:</p><ul><li>Same color palette across all assets</li><li>Same fonts (max 2)</li><li>Same hero shot / character recurs</li><li>Different formats / framings — variety inside consistency</li><li>One unified angle across all pieces (don\'t mix angles in a set)</li></ul>' },
        { heading: 'A/B Testing Mindset', content: '<p>Stop building "the best" creative. Start building <strong>two creatives + a hypothesis</strong>:</p><ul><li>"Hook A: question vs Hook B: bold claim — same body."</li><li>"Visual A: product alone vs Visual B: product in use — same copy."</li><li>"CTA A: Shop now vs CTA B: Message us — same creative."</li></ul><p>Change ONE variable per test. Anything else is guessing.</p>' },
        { heading: 'Peer Review — Critique Like a Pro', content: '<p>Show your set to a peer. Ask them three specific questions:</p><ol><li>"What\'s the offer?" (tests Clarity)</li><li>"Who is this for?" (tests Targeting)</li><li>"What stopped your scroll?" (tests Attraction)</li></ol><p>If they hesitate on any answer, that piece needs work. Don\'t accept "looks nice" — that\'s not feedback.</p>' },
        { heading: 'Final Deliverable', content: '<p>Produce a 5-piece campaign set for ONE product or service:</p><ol><li>1 hero video (15-30s, hook + body + CTA)</li><li>1 product post (image, square)</li><li>1 banner (landscape, for feed/website)</li><li>1 story creative (vertical, with CTA tap)</li><li>1 video hook variation (same body, different hook — for A/B)</li></ol><p>All five must share one angle, one palette, one font family.</p>' }
      ],
      keyTakeaways: [
        'Campaign sets > single creatives. Real client work is always in sets.',
        'Cohesion ≠ identical. Same family, different formats.',
        'Always test ONE variable at a time — that\'s how you learn what actually moves the needle.',
        'Peer critique using three pointed questions (offer / who / scroll-stopper).',
        'Never ship a set with mixed angles — pick one angle per campaign.',
        'A/B is a habit, not a phase. Pros A/B everything, forever.'
      ],
      proTip: 'Build a <strong>master Canva template</strong> for your set — once it\'s dialed, you can crank out new campaigns in 30 minutes instead of 3 hours. Templating is how agencies stay profitable.'
    },

    // =========================================================
    // PHASE 3 — TOOLS (W9–W12)
    // =========================================================
    w9: {
      duration: '35:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: 'Build Your Marketer\'s Sheet Stack',
        description: 'Create a Google Sheets workbook with 3 tabs: (1) Content Calendar — Date, Channel, Topic, Status, Owner — minimum 10 sample posts, color-coded by status. (2) Ad Performance Tracker — 10 sample rows with auto-calculated CTR, CPC, and ROAS via formulas. (3) Customer List — 10 sample customers with no duplicates (use UNIQUE or COUNTIF). Share with "anyone with link can view," paste the shareable URL in the assignment note, and upload either a PDF export or screenshots of all 3 tabs.',
        fileTypes: { image: true, video: false, pdf: true }
      },
      sections: [
        { heading: 'Why Marketers Need Sheets', content: '<p>Sheets is the universal language of operations. Content calendars, ad performance trackers, customer lists, inventory, reports — all live in Sheets. If you can\'t Sheets, you can\'t scale. This week we cover only what marketers actually use, no accounting hell.</p>' },
        { heading: 'The 8 Formulas You\'ll Use Daily', content: '<ul><li><strong>SUM</strong> — total spend, total orders</li><li><strong>AVERAGE</strong> — average CPC, ROAS</li><li><strong>IF</strong> — flag good vs bad rows ("=IF(ROAS&gt;2, \'Scale\', \'Kill\')")</li><li><strong>COUNTIF</strong> — count rows matching a condition</li><li><strong>VLOOKUP / XLOOKUP</strong> — pull data from another sheet</li><li><strong>UNIQUE</strong> — dedupe lists</li><li><strong>SORT / FILTER</strong> — clean up reports</li><li><strong>QUERY</strong> — SQL-style for advanced reports</li></ul><p>Master these 8 and you\'ll handle 95% of marketing data tasks.</p>' },
        { heading: 'Pivot Tables — The Magic Lever', content: '<p>Pivot tables turn 1,000 rows of ad data into a 10-row insight in 30 seconds. Use case: paste your Meta Ads CSV → pivot by Campaign → SUM(Spend), SUM(Purchases), AVG(ROAS). Instant performance summary. No formulas needed.</p>' },
        { heading: 'Templates You\'ll Build This Week', content: '<ol><li><strong>Content Calendar</strong> — Date, Channel, Topic, Status, Owner, Link. Color-code by status.</li><li><strong>Ad Performance Tracker</strong> — Date, Campaign, Spend, Impressions, Clicks, CTR, CPC, Purchases, ROAS. Auto-calc CTR + ROAS.</li><li><strong>Customer List</strong> — Name, Email, Phone, Order#, Date, Amount. Source for retargeting.</li><li><strong>Dashboard Sheet</strong> — auto-pulls from the tracker, shows weekly summary.</li></ol>' },
        { heading: 'Sharing, Permissions, Comments', content: '<p>Common pitfall: sharing with "Anyone with link can EDIT" — disaster waiting. Default to View. Use Comments (highlight cell + Ctrl+Alt+M) for collaboration, not chat threads. Version History (File → Version History) is your "undo" insurance.</p>' }
      ],
      keyTakeaways: [
        '8 formulas cover 95% of marketing work — master them, don\'t learn every function.',
        'Pivot tables turn raw data into reports in 30 seconds.',
        'Templating is leverage — build once, reuse for every client.',
        'Always Share with View access by default. Promote to Edit only when needed.',
        'Use Version History as your safety net.',
        'A clean Sheet is a clean mind — color-coding + frozen header rows are non-negotiable.'
      ],
      proTip: 'Bookmark <strong>Google Sheets Keyboard Shortcuts</strong> (Cmd+/ or Ctrl+/ inside Sheets). Learning 5 shortcuts will save you 30 minutes a day. Start with Ctrl+Shift+V (paste values only).'
    },

    w10: {
      duration: '45:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: 'Build Your First Botcake Bot',
        description: 'Create a free Botcake account, connect to a test Facebook Page (yours or a sandbox), and build 3 flows: (1) Welcome Flow with a 4-button menu (Products / Promos / Order / Talk to human). (2) Product Inquiry showing 3 sample products as a carousel with Buy buttons. (3) Order Flow capturing name + address + chosen item. Test all 3 flows by messaging your page from another account. Submit: 5+ screenshots showing each flow working end-to-end, plus a 30-60s screen recording of the Welcome Flow in action.',
        fileTypes: { image: true, video: true, pdf: false }
      },
      sections: [
        { heading: 'Why Messenger Marketing Owns the Philippines', content: '<p>Filipinos live in Messenger. 80%+ open rate on Messenger broadcasts vs ~20% on email. For PH SMEs, Messenger is the channel — and Botcake is one of the easiest no-code chatbot builders to drive sales through it.</p>' },
        { heading: 'Botcake Interface Tour', content: '<p>Five things you need to know:</p><ul><li><strong>Connect Page</strong> — link your Facebook Page. Bot lives there.</li><li><strong>Flows</strong> — the conversation logic (like flowchart).</li><li><strong>Audience</strong> — your subscribers (everyone who messaged the bot).</li><li><strong>Broadcast</strong> — send messages to all/some subscribers.</li><li><strong>Tags</strong> — labels you stick on users for segmenting (e.g., "interested-product-A").</li></ul>' },
        { heading: 'The 3 Must-Have Flows', content: '<ol><li><strong>Welcome Flow</strong> — fires when a new person messages the page. Greets them, offers a menu (Products / Promos / Order / Talk to human).</li><li><strong>Product Inquiry</strong> — when they tap "Products" they get a carousel of items with Buy buttons.</li><li><strong>Order Flow</strong> — collects name, address, item, payment method. Tags the user as "lead" or "buyer."</li></ol><p>Build these three and you have a 24/7 sales assistant.</p>' },
        { heading: 'Tags + Segments = Targeted Broadcasts', content: '<p>Tag users by behavior:</p><ul><li>Tag "interested-skincare" when they tap skincare category</li><li>Tag "cart-abandoned" when they start order but don\'t finish</li><li>Tag "VIP" when they order more than 3 times</li></ul><p>Then broadcast ONLY to the relevant tag — much higher conversion than mass blasts. Bonus: lower chance of getting flagged by Facebook for spam.</p>' },
        { heading: 'Facebook\'s 24-Hour Rule', content: '<p>You can only send promotional messages within 24 hours of a user\'s last interaction. After 24h, you need a <strong>Message Tag</strong> (e.g., POST_PURCHASE_UPDATE) or a paid Sponsored Message. Plan your flows around this rule or risk getting your bot banned.</p>' }
      ],
      keyTakeaways: [
        'Messenger has 80%+ open rates — 4× better than email for PH market.',
        'Build the 3 core flows: Welcome, Product Inquiry, Order.',
        'Tags are your secret weapon — segment behavior to boost broadcast ROI.',
        'Respect the 24-hour rule or your bot gets killed.',
        'Always offer "Talk to human" — bots handle 80%, humans close the rest.',
        'Connect the bot to your Pixel — every chat = retargeting audience.'
      ],
      proTip: 'Start broadcasts with a question, not an announcement. "Gusto mo ng promo this week?" gets 5× more replies than "Check out our new collection!" — and replies reset the 24-hour window.'
    },

    w11: {
      duration: '40:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: 'Cart-Abandonment Recovery Flow',
        description: 'Using Chatfuel (free tier), build a 3-step cart-abandonment recovery sequence: (1) First reminder 15 minutes after the abandon trigger — friendly check-in tone. (2) Promo message at 1 hour — include a coupon or incentive. (3) Last-call message at 24 hours using a proper Message Tag (e.g., POST_PURCHASE_UPDATE) to stay compliant. Screenshot each step in the flow builder. Test the flow yourself and screenshot the resulting conversation. Submit 4-6 images + a 1-page PDF brief on what you\'d improve and how you\'d measure success (open rate, click-through, recovery %).',
        fileTypes: { image: true, video: false, pdf: true }
      },
      sections: [
        { heading: 'Botcake vs Chatfuel — When to Use Which', content: '<p>Both build Messenger bots, but:</p><ul><li><strong>Botcake</strong> — PH-grown, cheaper, simpler UI, perfect for SMEs.</li><li><strong>Chatfuel</strong> — global, more powerful AI features, deeper analytics, better for scaling brands + agencies.</li></ul><p>Many agencies run Botcake for small clients, Chatfuel for big ones. This week we use Chatfuel.</p>' },
        { heading: 'AI-Powered Conversations', content: '<p>Chatfuel has built-in NLP (natural language processing). Instead of forcing users to tap buttons, your bot can understand free-text like "How much yung ___?" or "Saan kayo nag-deliver?" — and route to the right answer. Setup: AI Setup → Train phrases per intent → bot answers automatically.</p>' },
        { heading: 'Cart Abandonment Recovery — The Money Flow', content: '<p>30-60% of online carts are abandoned. Recovery flow:</p><ol><li>User adds to cart, doesn\'t check out → tag "cart-abandoned"</li><li>15 min later: bot sends "Hey, nakita namin yung order mo — kailangan mo ng help?"</li><li>1 hour later: "Wait lang — may 10% off promo today if you check out"</li><li>24 hours later (using Message Tag): "Last call — your cart is expiring soon"</li></ol><p>This single flow can recover 15-25% of abandoned carts. Money on autopilot.</p>' },
        { heading: 'Click-to-Messenger Ads (The Killer Combo)', content: '<p>Run a Facebook Ad with "Send Message" as the CTA. When user taps, they land in Messenger and your bot takes over. Why it\'s powerful:</p><ul><li>Conversation feels personal vs landing page</li><li>You capture them as a subscriber (future broadcasts)</li><li>Lead cost often 50% lower than form ads</li></ul><p>You\'ll set this up properly in Phase 4 Ads Manager.</p>' },
        { heading: 'Analytics That Actually Matter', content: '<p>Don\'t drown in metrics. Watch only:</p><ul><li><strong>Open rate</strong> per broadcast — under 70% = something\'s off</li><li><strong>Click-through rate</strong> on buttons — improves with better copy</li><li><strong>Conversion rate</strong> from flow start to order — find the drop-off point and fix it</li><li><strong>Cost per acquired subscriber</strong> from ads — should beat email cost-per-lead</li></ul>' }
      ],
      keyTakeaways: [
        'Botcake for SMEs, Chatfuel for scaling brands — pick by client size.',
        'NLP makes bots feel human — train intents instead of forcing button clicks.',
        'Cart-abandonment flow is the highest ROI bot you\'ll ever build.',
        'Click-to-Messenger ads + bots = lowest lead cost in the PH market.',
        'Only 4 metrics matter — open, CTR, conversion, CPA. Ignore the rest.',
        'Test message variations like ad copy — the bot is your salesperson.'
      ],
      proTip: 'Pair every bot with a real human standby for the first month. Read every conversation — that\'s where you\'ll find the exact words customers use, which then become your best ad copy.'
    },

    w12: {
      duration: '38:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: 'Mock Pancake Store Setup',
        description: 'Sign up for a free Pancake account (free trial works). Build a mock store with: (1) 3 sample products including price, description, and stock. (2) 5 sample customer chats simulating order inquiries (use Pancake\'s Inbox). (3) 5 sample customers with at least 2 segment tags each (e.g., "VIP," "skincare-buyer"). Document the full setup with 6+ screenshots covering: Products page, Orders page, Customers page, Marketing tab. Submit screenshots + a 1-page PDF explaining how you\'d onboard a real PH client to Pancake — what info you\'d ask, what\'d you set up Day 1.',
        fileTypes: { image: true, video: false, pdf: true }
      },
      sections: [
        { heading: 'Why POS + Pancake Matters for Marketers', content: '<p>You can drive 1000 orders a day with great marketing — but if the back office can\'t process them, the business dies. Marketers who understand the order flow (POS, inventory, shipping, CRM) are 10× more valuable than pure "creative" people. Pancake is the PH\'s #1 SME platform for this — owning ~70% of the chat-commerce stack.</p>' },
        { heading: 'POS Basics for E-Commerce', content: '<p>POS = Point of Sale. For online sellers it tracks:</p><ul><li><strong>Inventory</strong> — what you have, what\'s reserved, what\'s sold</li><li><strong>Orders</strong> — pending, processing, shipped, delivered</li><li><strong>Payments</strong> — pending, paid, refunded</li><li><strong>Customer history</strong> — past orders, lifetime value</li></ul><p>Without POS, you\'re running on Notes app + screenshots = chaos at scale.</p>' },
        { heading: 'Pancake Interface — The 5 Tabs', content: '<ul><li><strong>Inbox</strong> — unified Messenger/Page/Instagram chats with order context</li><li><strong>Orders</strong> — every order from any channel, in one list</li><li><strong>Products</strong> — your catalog with stock + pricing</li><li><strong>Customers</strong> — auto-built CRM, segmented by spend/behavior</li><li><strong>Marketing</strong> — broadcasts, automations, mini-CRM tools</li></ul>' },
        { heading: 'Order Workflow End-to-End', content: '<ol><li>Customer messages your page → agent (or bot) confirms order</li><li>Order auto-created in Pancake with inventory deducted</li><li>Address + payment captured (COD or GCash/Maya/bank)</li><li>Shipping label printed → courier (Ninjavan / J&T / Lalamove) picks up</li><li>Tracking number auto-sent to customer via Messenger</li><li>Delivered → customer auto-tagged "buyer" → eligible for upsell broadcasts</li></ol>' },
        { heading: 'Why CRM-Driven Marketing Wins', content: '<p>Once Pancake knows who bought what, when, how often — your marketing gets surgical:</p><ul><li>Broadcast skincare promo only to past skincare buyers</li><li>Send "we miss you" coupon to customers who haven\'t ordered in 60 days</li><li>VIP-tier early access for top 10% spenders</li></ul><p>Repeat-buyer marketing is 5-10× cheaper than new-customer acquisition. CRM data is gold.</p>' }
      ],
      keyTakeaways: [
        'Marketing without ops knowledge = creating problems for the team. Learn POS basics.',
        'Pancake = the standard PH platform for chat-commerce SMEs.',
        'Inbox + Orders + Customers in one tool = no more "tagaan-tagaan" confusion.',
        'Auto-tag customers by behavior — that\'s the seed of every great campaign.',
        'Repeat customers cost 5-10× less than new ones. CRM marketing is highest ROI.',
        'Test the full order flow yourself (place a fake order) before any client launch.'
      ],
      proTip: 'Spend a Saturday placing 5 test orders through a real Pancake-powered Page (any small PH brand will do). Note every friction point — slow reply, missing info, awkward CTA. These are exactly the bugs you\'ll fix for your future clients.'
    },

    // =========================================================
    // PHASE 4 — ADS MANAGER (W13–W16)
    // =========================================================
    w13: {
      duration: '36:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: 'Business Manager Setup + Pixel Walkthrough',
        description: 'Create a free Meta Business Manager account. Set up: (1) Business Profile (name, address, industry). (2) Ad Account in your local currency. (3) Pixel — install on any test domain you control, or use a placeholder URL. (4) Add a test team member with limited (Analyst) permissions. Submit 5+ screenshots showing each step — BM dashboard, Ad Account creation, Pixel install code page, team permissions screen. Plus a 1-page PDF brief titled "How I\'d Onboard a New Client to BM" — what info you\'d collect, what permissions you\'d set, and why each step matters.',
        fileTypes: { image: true, video: false, pdf: true }
      },
      sections: [
        { heading: 'Meta Ads Manager — The Final Boss', content: '<p>Everything you\'ve learned (creatives, angles, tools) now meets paid distribution. Ads Manager is where small budgets become real revenue — or get burned. This week we tour the platform, no spending yet.</p>' },
        { heading: 'Business Manager vs Ads Manager', content: '<p><strong>Business Manager (BM)</strong> is the parent — it holds your Pages, Pixels, Ad Accounts, team access. <strong>Ads Manager</strong> is the workspace inside it where you build campaigns. Always create BM first, then access Ads Manager via the BM. Never run client ads from your personal account — when the account dies (and it will), you lose everything.</p>' },
        { heading: 'The 3-Level Account Structure', content: '<ul><li><strong>Campaign</strong> — the objective (Sales, Leads, Traffic, etc.) + budget level</li><li><strong>Ad Set</strong> — the WHO (audience, placement, schedule, budget)</li><li><strong>Ad</strong> — the WHAT (creative, copy, CTA, destination)</li></ul><p>One Campaign can have multiple Ad Sets. Each Ad Set can have multiple Ads. Master this hierarchy or your dashboard will look like spaghetti.</p>' },
        { heading: 'Choosing the Right Objective', content: '<p>Top objectives for SMEs:</p><ul><li><strong>Sales</strong> — when Pixel is set up and you want purchases. Most powerful.</li><li><strong>Leads</strong> — collect contact info via form or Messenger.</li><li><strong>Engagement</strong> — build social proof, message volume, or video views.</li><li><strong>Traffic</strong> — drive clicks to website/Shopee/Lazada.</li></ul><p>Wrong objective = wrong audience. Meta optimizes toward whatever you pick — pick wisely.</p>' },
        { heading: 'The Pixel — Your Most Important Asset', content: '<p>The Meta Pixel is a snippet of code on your site that tracks visitors, purchases, signups, etc. Why it matters:</p><ul><li>Lets Meta find people LIKE your buyers (Lookalike audiences)</li><li>Tracks ROAS accurately</li><li>Powers retargeting ("people who viewed product but didn\'t buy")</li></ul><p>For PH SMEs without a website: use Messenger as your "site" — Meta tracks chat events the same way.</p>' }
      ],
      keyTakeaways: [
        'Always run client ads through Business Manager, never personal account.',
        'Master Campaign → Ad Set → Ad hierarchy before clicking Build.',
        'Pick objectives based on what you actually want — Meta optimizes accordingly.',
        'Pixel = the single most valuable asset in your ad account.',
        'Without Pixel data, your ads are flying blind. Set it up before spending a peso.',
        'Get added to client\'s BM as Admin, not just Ad Account access — covers Pixels + Pages too.'
      ],
      proTip: 'Build a "<strong>BM Onboarding Checklist</strong>" for new clients: Page access, Pixel installed, Domain verified, Conversions API setup, Payment method added. Send it to every client before you accept the project. Saves 2 weeks of back-and-forth.'
    },

    w14: {
      duration: '44:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: 'Build a Complete Campaign in Draft Mode',
        description: 'In Ads Manager, build (but DO NOT PUBLISH — keep in Draft) a full Sales campaign with this exact structure: 1 Campaign, 2 Ad Sets targeting different audiences, 2 Ads per Ad Set (4 ads total). Use real-looking creatives — reuse the W8 5-piece set if you have it. Apply the naming convention from the lesson. Submit 8+ screenshots: Campaign settings, both Ad Set configurations, all 4 Ads with previews, and the final review screen. Include a 1-page PDF justifying your audience picks + which creative variants you\'re A/B testing and why.',
        fileTypes: { image: true, video: false, pdf: true }
      },
      sections: [
        { heading: 'Building Your First Real Campaign', content: '<p>This week you build a complete campaign in Ads Manager — every field, every option. No money spent yet, but every dropdown explained. This is the muscle memory you\'ll use forever.</p>' },
        { heading: 'Ad Copy Anatomy', content: '<p>Three text fields per ad:</p><ul><li><strong>Primary Text</strong> — the body above the image (125 chars before "See more"). Lead with the hook.</li><li><strong>Headline</strong> — the bold line below the image (~27 chars). The promise.</li><li><strong>Description</strong> — the small text under the headline. Often hidden — don\'t put critical info here.</li></ul><p>CTA button — pick from Meta\'s preset list (Shop Now, Send Message, Sign Up, Learn More, etc.). Wrong CTA hurts conversion.</p>' },
        { heading: 'Creative Best Practices', content: '<ul><li><strong>Square (1:1)</strong> for feed, <strong>vertical (4:5 or 9:16)</strong> for stories/reels — never use 16:9 on mobile placements</li><li>Text overlay under 20% of image area — Meta still penalizes (loosely) heavy text</li><li>Faces outperform product-only shots by ~30%</li><li>First 3 seconds of video must hook without sound</li><li>Always have 2-3 creative variants per ad set — let Meta auto-pick the winner</li></ul>' },
        { heading: 'Placement Strategy', content: '<p>Default is "Advantage+ Placements" — Meta auto-spreads your ad across Feed, Reels, Stories, Marketplace, Audience Network. For beginners: KEEP IT. Meta\'s algorithm is smarter than your guesses. Manual placements only when you have data showing one placement performs 2× better.</p>' },
        { heading: 'Naming Convention (Boring But Critical)', content: '<p>Future you (and your boss) will thank past you for clean names. Format:</p><p><code>Campaign: [Objective] - [Product] - [Audience] - [Date]</code><br/><code>Ad Set: [Cold/Warm/Hot] - [Interest/Lookalike] - [Age]</code><br/><code>Ad: [Format] - [Hook] - [v1/v2]</code></p><p>Example: <code>Sales - Glow Serum - LAL 3% - May2026</code>. After 50 ads in your account, you\'ll know why this matters.</p>' }
      ],
      keyTakeaways: [
        'Master the 3 ad fields: Primary Text, Headline, Description.',
        'Lead Primary Text with the hook — first 125 chars decide everything.',
        'Square + vertical only. Forget 16:9 unless you\'re running YouTube ads.',
        'Trust Meta\'s Advantage+ Placements until you have data to override.',
        'Naming conventions save hours of "what is this ad doing?" later.',
        'Always 2-3 creative variants per ad set — let Meta find the winner.'
      ],
      proTip: 'Build your campaign in <strong>Draft mode first</strong>, then walk through every screen with a senior marketer (or your admin) BEFORE you publish. 9 out of 10 first-time campaigns have at least one expensive misconfiguration that\'s caught in 30 seconds of review.'
    },

    w15: {
      duration: '42:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: '5 Saved Audiences for a Sample Brand',
        description: 'Pick a sample brand (your client\'s, a real PH SME, or one you invent). In Ads Manager, build and SAVE 5 different audiences: (1) Cold-broad — age + location only, no interests. (2) Cold-interests — 3-5 specific behavioral interests. (3) Custom: Video Viewers 50%+ from the last 30 days. (4) Lookalike 1% based on buyers (use a placeholder customer list if no real data). (5) Custom: Page Engagers from the last 60 days. Use the proper naming convention. Submit a screenshot of each audience setup screen + a 1-page PDF strategy doc explaining when you\'d use each audience type and which one you\'d test first.',
        fileTypes: { image: true, video: false, pdf: true }
      },
      sections: [
        { heading: 'Targeting — Where Money Is Won or Lost', content: '<p>The best creative dies in front of the wrong audience. Targeting is the lever that turns ₱500 a day into ₱5000 of revenue — or ₱0. This week we go deep on the 3 audience types and when to use each.</p>' },
        { heading: 'Cold Audiences — Strangers Who Might Buy', content: '<p>People who\'ve never interacted with your brand. Built from:</p><ul><li><strong>Demographics</strong> — age, gender, location, language</li><li><strong>Interests</strong> — pages/topics they like (e.g., "Skincare," "Online shopping")</li><li><strong>Behaviors</strong> — purchase behavior, device, travel</li></ul><p>Modern Meta tip: <strong>broad targeting</strong> (only age + location + gender) often outperforms detailed interests because Meta\'s AI finds buyers faster when you give it room to explore. Try both.</p>' },
        { heading: 'Custom Audiences — People Who Already Know You', content: '<p>Built from your own data:</p><ul><li>Website visitors (last 30/60/90 days, via Pixel)</li><li>Video viewers (anyone who watched 50%+ of your video)</li><li>Page engagers (commented, liked, messaged)</li><li>Customer list (upload CSV of emails/phones)</li><li>Messenger subscribers (from Botcake/Chatfuel)</li></ul><p>Highest converting audience type. Retargeting these = how the pros get 5-10× ROAS.</p>' },
        { heading: 'Lookalike Audiences — Clones of Your Best Customers', content: '<p>Upload a custom audience of your best customers → Meta finds 1-3 million strangers who look + behave like them. The ratchet:</p><ul><li><strong>1% LAL</strong> — closest match, smallest pool, highest conversion</li><li><strong>3% LAL</strong> — wider net, still strong</li><li><strong>5-10% LAL</strong> — broadest, for scaling after 1% saturates</li></ul><p>Start with 1%, scale to 3%, then 5%. Always seed with a high-quality source list (50-500 best buyers, not random emails).</p>' },
        { heading: 'Exclusions + Frequency Caps', content: '<p>Smart marketers exclude:</p><ul><li>Existing customers from cold campaigns (no point selling them what they already bought)</li><li>Recent buyers (last 30 days) from "win-back" campaigns</li><li>Lookalikes from cold audiences to avoid overlap</li></ul><p>Frequency cap: don\'t let any one person see your ad more than 2-3× per week. Ad fatigue = wasted spend.</p>' }
      ],
      keyTakeaways: [
        'Targeting > creative > copy in order of importance for ROAS.',
        'Cold = strangers, Custom = your audience, Lookalike = clones of buyers.',
        'Broad audiences (age + location only) often beat narrow interests — let Meta\'s AI work.',
        'Start LAL at 1%, scale to 3% then 5% as you grow budget.',
        'Always exclude existing customers from cold campaigns.',
        'Watch frequency — over 3× per week per person = burn-out.'
      ],
      proTip: 'Build <strong>5 saved audiences</strong> for every client and name them clearly (e.g., "Customers-Last90Days", "LAL-1-Buyers", "VideoView-50pct-30d"). Saved audiences let you spin up new campaigns in 60 seconds and ensure consistency across tests.'
    },

    w16: {
      duration: '50:00',
      videoType: 'youtube',
      assignment: {
        enabled: true,
        title: 'FINAL PROJECT — Launch a ₱500-2000 Campaign + Analysis Report',
        description: 'This is your graduation project. Launch a REAL micro-campaign with budget ₱500-2000 (your own funds, a sandbox business, or a sample client\'s with permission). Run it for a MINIMUM of 48 hours before analyzing. Submit a 2-page PDF Campaign Report that covers: (1) Objective + Audience + Creative + Budget choices and why. (2) Pre-launch checklist screenshots showing every step completed. (3) 48-hour Results with screenshots — CPM, CTR, CPC, CPA, and ROAS. (4) Decision: Scale, Test, or Kill — with data-backed reasoning, not feelings. (5) "What I\'d change next launch" reflection. Bonus: attach a 30-60s screen recording walking through Ads Manager. THIS is the project you show every future client to prove you\'ve actually done it.',
        fileTypes: { image: true, video: true, pdf: true }
      },
      sections: [
        { heading: 'The Final Project — Launching for Real', content: '<p>This is it. You\'ve learned creatives, angles, tools, and targeting. This week you put it ALL together: launch a real micro-campaign with a small real budget (₱500-2000), monitor it for 48 hours, and submit your analysis. Whether it makes money is less important than HOW you read it.</p>' },
        { heading: 'Pre-Launch Checklist', content: '<p>Run through this BEFORE clicking publish:</p><ul><li>☐ Pixel firing correctly (test with Meta\'s Pixel Helper Chrome extension)</li><li>☐ Conversions API setup (server-side backup tracking)</li><li>☐ Payment method works + budget set correctly</li><li>☐ Campaign objective matches goal</li><li>☐ Audience size is healthy (1M+ for cold, 50K+ for retargeting)</li><li>☐ Creatives uploaded in correct aspect ratio</li><li>☐ Copy proofread — typos kill credibility</li><li>☐ UTM tags on all destination URLs</li><li>☐ Budget pacing makes sense (daily vs lifetime)</li><li>☐ Schedule includes start/end if applicable</li></ul>' },
        { heading: 'Budget Strategy for Small Budgets', content: '<p>With ₱500-2000/day, you can\'t over-test. Rule:</p><ul><li>1 Campaign, 2-3 Ad Sets max</li><li>2 Ads per Ad Set</li><li>Use CBO (Campaign Budget Optimization) — let Meta auto-distribute</li><li>Run for minimum 3 days before judging (the algorithm needs ~50 conversions per ad set to optimize)</li></ul><p>Don\'t kill ads at Day 1. You\'re reading noise, not signal.</p>' },
        { heading: 'The 5 Metrics That Matter', content: '<ul><li><strong>CPM</strong> (Cost per 1000 impressions) — is your audience expensive? Under ₱100 is healthy in PH.</li><li><strong>CTR</strong> (Click-through rate) — is your creative+copy stopping the scroll? Aim 1%+ feed, 2%+ for Reels.</li><li><strong>CPC</strong> (Cost per click) — under ₱5 is great in PH for most niches.</li><li><strong>CPA / Cost per Purchase</strong> — should be much less than profit per sale.</li><li><strong>ROAS</strong> (Return on ad spend) — total revenue ÷ ad spend. 2× minimum to call it working. 3-5× = scaling material.</li></ul>' },
        { heading: 'Scale or Kill — The 48-Hour Decision', content: '<p>After 48 hours and at least ₱2000 spent (or 50 actions):</p><ul><li><strong>ROAS &gt; 2×</strong> — scale: increase budget 20% per day until ROAS drops</li><li><strong>ROAS 1-2×</strong> — break-even, test new creative/audience to improve</li><li><strong>ROAS &lt; 1×</strong> — kill. Don\'t hope. Don\'t "give it more time." Cut your losses, learn, relaunch.</li></ul><p>Emotional attachment to ads is the #1 killer of beginners\' budgets. Be ruthless with the data.</p>' }
      ],
      keyTakeaways: [
        'Always run the pre-launch checklist. One missed item = wasted budget.',
        'Small budget = small structure. 1 campaign, 2-3 ad sets, 2 ads each.',
        'Wait 3 days minimum before judging — anything less is noise.',
        '5 metrics: CPM, CTR, CPC, CPA, ROAS. Watch only these.',
        'Scale at 2× ROAS, test at 1-2×, kill below 1×. No emotion.',
        'Document every campaign — your "what worked" file becomes priceless after 50 launches.'
      ],
      proTip: 'After this campaign closes, write a <strong>1-page Campaign Report</strong>: Objective, Audience, Creative, Budget, Results, What I\'d Change. Show this in every client pitch from now on. Real launched campaigns + honest analysis is what separates "I took a course" from "I\'ve actually done this."'
    }
  },

  getAll() {
    this.init();
    return safeGetJSON(this.STORAGE_KEY, this.defaultLessons);
  },

  get(id) {
    if (!id) return null;
    const lesson = this.getAll().find(l => l.id === id) || null;
    if (lesson && !lesson.assignment) {
      lesson.assignment = { enabled: false, title: '', description: '', fileTypes: { image: true, video: false, pdf: false } };
    }
    if (lesson && !lesson.quiz) {
      lesson.quiz = { enabled: false, passScore: 70, questions: [] };
    }
    return lesson;
  },

  save(lesson) {
    if (!lesson || !lesson.id) return;
    const all = this.getAll();
    const idx = all.findIndex(l => l.id === lesson.id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...lesson };
    }
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    // Sync to Firestore (non-blocking)
    if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveLessons(all);
  },

  defaultMonthNames: { 1: 'Basic Fundamentals', 2: 'Creatives + AI', 3: 'Tools & Platforms', 4: 'Ads Manager' },
  defaultMonthPrefixes: { 1: 'Phase 1', 2: 'Phase 2', 3: 'Phase 3', 4: 'Phase 4' },
  defaultMonthDescriptions: {
    1: 'Build your creative foundation — from still image design to compelling short-form video content with hooks, CTAs, and brand consistency.',
    2: 'Repeat, refine, and master. Revisit fundamentals, critique past work, and produce improved creatives with stronger customer angles.',
    3: 'Master Google Sheets, Botcake, Chatfuel, POS & Pancake — the operational tools that power e-commerce marketing at scale.',
    4: 'From theory to execution — run real paid campaigns on Meta Ads, master targeting, budgets, and optimize for measurable results.'
  },

  getMonthNames() {
    return safeGetJSON('site_month_names', this.defaultMonthNames);
  },

  getMonthName(month) {
    const names = this.getMonthNames();
    return names[month] || names[String(month)] || '';
  },

  saveMonthNames(names) {
    safeSetItem('site_month_names', JSON.stringify(names));
    if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ month_names: names });
  },

  getMonthPrefixes() {
    return safeGetJSON('site_month_prefixes', this.defaultMonthPrefixes);
  },

  getMonthPrefix(month) {
    const prefixes = this.getMonthPrefixes();
    return prefixes[month] || prefixes[String(month)] || ('Month ' + month);
  },

  saveMonthPrefixes(prefixes) {
    safeSetItem('site_month_prefixes', JSON.stringify(prefixes));
    if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ month_prefixes: prefixes });
  },

  getMonthDescriptions() {
    return safeGetJSON('site_month_descriptions', this.defaultMonthDescriptions);
  },

  getMonthDescription(month) {
    const descs = this.getMonthDescriptions();
    return descs[month] || descs[String(month)] || this.defaultMonthDescriptions[month] || '';
  },

  saveMonthDescriptions(descs) {
    safeSetItem('site_month_descriptions', JSON.stringify(descs));
    if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ month_descriptions: descs });
  },

  // Full label: "Month 1: Creatives" or custom "Phase 1: Creatives"
  getFullMonthLabel(month, separator) {
    const sep = separator || ': ';
    return this.getMonthPrefix(month) + sep + this.getMonthName(month);
  },

  getPublishedCount() {
    return this.getAll().filter(l => l.published).length;
  },

  // ===== Prerequisites / Auto-Unlock =====
  // Lesson locking has been DISABLED across the program — all 16 lessons
  // are open from day one. Students race to finish at their own pace.
  // (Previously: Week N required Week N-1 complete + quiz passed + asgn
  // submitted. Kept the function so the rest of the code that asks
  // "is this unlocked?" keeps working without refactoring every caller.)
  isUnlocked(weekId) {
    return true;
  },

  // What's blocking a locked lesson — returns an array of requirements
  getUnlockRequirements(weekId) {
    const out = [];
    try {
      const lesson = this.get(weekId);
      if (!lesson || (lesson.week || 1) <= 1) return out;
      const prevWeekId = 'w' + (lesson.week - 1);
      const prev = this.get(prevWeekId);
      if (!prev) return out;
      const prevLabel = 'Lesson ' + prev.week + ' \u2014 ' + prev.title;
      if (typeof PROGRESS !== 'undefined' && !PROGRESS.isCompleted(prevWeekId)) {
        out.push({ type: 'complete', label: 'Complete the lesson: ' + prevLabel, weekId: prevWeekId });
      }
      if (prev.quiz && prev.quiz.enabled && prev.quiz.questions && prev.quiz.questions.length > 0) {
        if (typeof QUIZ_RESULTS !== 'undefined' && !QUIZ_RESULTS.isPassed(prevWeekId)) {
          const pass = prev.quiz.passScore || 70;
          out.push({ type: 'quiz', label: 'Pass the Week ' + prev.week + ' quiz (' + pass + '%+)', weekId: prevWeekId });
        }
      }
      if (prev.assignment && prev.assignment.enabled) {
        if (typeof ASSIGNMENTS !== 'undefined' && !ASSIGNMENTS.isSubmitted(prevWeekId)) {
          out.push({ type: 'assignment', label: 'Submit the Week ' + prev.week + ' assignment', weekId: prevWeekId });
        }
      }
    } catch (e) {}
    return out;
  },

  extractYouTubeId(url) {
    if (!url) return '';
    if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].split(/[?&#]/)[0];
    if (url.includes('v=')) return url.split('v=')[1].split(/[?&#]/)[0];
    if (url.includes('/embed/')) return url.split('/embed/')[1].split(/[?&#]/)[0];
    if (url.includes('/shorts/')) return url.split('/shorts/')[1].split(/[?&#]/)[0];
    return url;
  },

  // Detect which free video platform the URL belongs to
  detectProvider(url) {
    if (!url) return { type: 'unknown', id: '', label: 'Video' };
    url = url.trim();
    // YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return { type: 'youtube', id: this.extractYouTubeId(url), label: 'YouTube' };
    }
    // Vimeo
    if (url.includes('vimeo.com')) {
      const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      return { type: 'vimeo', id: m ? m[1] : '', label: 'Vimeo' };
    }
    // Google Drive
    if (url.includes('drive.google.com')) {
      const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      return { type: 'gdrive', id: m ? m[1] : '', label: 'Google Drive' };
    }
    // Facebook
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
      return { type: 'facebook', id: url, label: 'Facebook' };
    }
    // Loom
    if (url.includes('loom.com')) {
      const m = url.match(/loom\.com\/(?:share|embed)\/([a-f0-9]+)/);
      return { type: 'loom', id: m ? m[1] : '', label: 'Loom' };
    }
    // TikTok
    if (url.includes('tiktok.com')) {
      const m = url.match(/video\/(\d+)/);
      return { type: 'tiktok', id: m ? m[1] : url, label: 'TikTok' };
    }
    // Direct video file
    if (url.match(/\.(mp4|webm|ogg|mov)(\?|$)/i)) {
      return { type: 'mp4', id: url, label: 'Video' };
    }
    return { type: 'mp4', id: url, label: 'Video' };
  },

  // Provider-specific SVG mini icons for the click-to-play overlay
  providerIconSVG(type) {
    const paths = {
      youtube:  '<path d="M23 12s0-3.6-.46-5.32a2.78 2.78 0 0 0-2-2C18.88 4.26 12 4.26 12 4.26s-6.88 0-8.54.42a2.78 2.78 0 0 0-2 2C1 8.4 1 12 1 12s0 3.6.46 5.32a2.78 2.78 0 0 0 2 2c1.66.42 8.54.42 8.54.42s6.88 0 8.54-.42a2.78 2.78 0 0 0 2-2C23 15.6 23 12 23 12z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor"/>',
      vimeo:    '<rect x="2" y="2" width="20" height="20" rx="3"/><path d="M7 10c0-1 3-4 4-4s2 3 3 6 1 5 3 3"/>',
      gdrive:   '<path d="M7.71 3.5L1.15 15l3.15 5h15.43l-3.15-5L10.85 3.5H7.71z"/><path d="M16.15 15H4.3"/>',
      facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
      loom:     '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
      tiktok:   '<path d="M9 3v12a3 3 0 1 1-3-3"/><path d="M15 3v3a5 5 0 0 0 5 5"/>',
      mp4:      '<polygon points="6 4 20 12 6 20" fill="currentColor"/>'
    };
    return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:4px">' + (paths[type] || paths.mp4) + '</svg>';
  },

  // Build the actual iframe/video embed for autoplay=true
  _buildPlayerHTML(provider, url, ap) {
    switch (provider.type) {
      case 'youtube':
        if (!provider.id) return '';
        return '<iframe src="https://www.youtube.com/embed/' + provider.id + '?autoplay=' + ap + '&rel=0&modestbranding=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;height:100%;border-radius:12px;"></iframe>';
      case 'vimeo':
        if (!provider.id) return '';
        return '<iframe src="https://player.vimeo.com/video/' + provider.id + '?autoplay=' + ap + '" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="width:100%;height:100%;border-radius:12px;"></iframe>';
      case 'gdrive':
        if (!provider.id) return '';
        return '<iframe src="https://drive.google.com/file/d/' + provider.id + '/preview" allow="autoplay" allowfullscreen style="width:100%;height:100%;border-radius:12px;"></iframe>';
      case 'facebook':
        return '<iframe src="https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(url) + '&show_text=false&autoplay=' + (ap ? 'true' : 'false') + '" scrolling="no" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" style="width:100%;height:100%;border-radius:12px;"></iframe>';
      case 'loom':
        if (!provider.id) return '';
        return '<iframe src="https://www.loom.com/embed/' + provider.id + (ap ? '?autoplay=1' : '') + '" frameborder="0" allow="autoplay; fullscreen" allowfullscreen style="width:100%;height:100%;border-radius:12px;"></iframe>';
      case 'tiktok':
        if (!provider.id) return '';
        return '<iframe src="https://www.tiktok.com/embed/v2/' + provider.id + '" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="width:100%;height:100%;border-radius:12px;"></iframe>';
      case 'mp4':
      default:
        return '<video src="' + url + '" controls' + (ap ? ' autoplay' : '') + ' style="width:100%;height:100%;border-radius:12px;background:#000;"></video>';
    }
  },

  getVideoEmbed(lesson, autoplay) {
    if (!lesson || !lesson.videoUrl) return '';
    const url = lesson.videoUrl.trim();
    const ap = autoplay ? 1 : 0;
    const provider = this.detectProvider(url);

    // If autoplay=true → render the real iframe/video
    if (autoplay) return this._buildPlayerHTML(provider, url, ap);

    // MP4 direct files don't need click-to-play — show video directly with controls
    if (provider.type === 'mp4') return this._buildPlayerHTML(provider, url, 0);

    // All other providers → click-to-play preview
    // YouTube gets a real thumbnail from img.youtube.com
    // Vimeo gets a real thumbnail from vumbnail.com
    // Everything else (Drive, FB, Loom, TikTok) gets a clean gradient placeholder
    let thumbSrc = '';
    let thumbFallback = '';
    if (provider.type === 'youtube' && provider.id) {
      thumbSrc = 'https://img.youtube.com/vi/' + provider.id + '/maxresdefault.jpg';
      thumbFallback = 'https://img.youtube.com/vi/' + provider.id + '/hqdefault.jpg';
    } else if (provider.type === 'vimeo' && provider.id) {
      thumbSrc = 'https://vumbnail.com/' + provider.id + '.jpg';
      thumbFallback = 'https://vumbnail.com/' + provider.id + '_small.jpg';
    }

    const imgHtml = thumbSrc
      ? '<img class="yt-thumb-img" src="' + thumbSrc + '" alt="" onerror="this.onerror=null;this.src=\'' + thumbFallback + '\';this.classList.add(\'yt-thumb-fallback\')">'
      : '';

    return '<div class="yt-thumb-player" data-vid="' + (provider.id || '') + '" data-provider="' + provider.type + '">'
      + imgHtml
      + '<div class="yt-thumb-overlay"></div>'
      + '<div class="yt-thumb-play" aria-label="Play video">'
      +   '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>'
      + '</div>'
      + '<div class="yt-thumb-hint">' + this.providerIconSVG(provider.type) + provider.label + ' · Click to play</div>'
      + '</div>';
  }
};

LESSONS.init();

// Handle login form
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const loginError = document.getElementById('loginError');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawUsername = (document.getElementById('username') || document.getElementById('email')).value.trim();
    const username = rawUsername.toLowerCase();
    // Trim password — handles accidental whitespace from copy-paste.
    // Original kept just in case the stored value has intentional ws.
    const rawPassword = document.getElementById('password').value || '';
    const password = rawPassword.trim();
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    console.log('[LOGIN] Attempting login for:', username);

    // First attempt — local-only (instant, no network). AUTH.login now
    // tries every combination of trimmed/raw on both username + password.
    if (AUTH.login(username, password)) {
      console.log('[LOGIN] ✓ Local login successful');
      window.location.href = AUTH.isAdmin() ? 'admin.html' : 'dashboard.html';
      return;
    }
    console.log('[LOGIN] Local check failed, trying Firestore fallback…');

    // Fallback — check Firestore in case the admin recently reset the
    // password on another device, OR this is a fresh device for an
    // account that signed up elsewhere.
    if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.originalLabel = submitBtn.textContent; submitBtn.textContent = 'Signing in…'; }
    let remoteHit = false;
    let remoteAttempted = false;

    // Wait for Firebase anonymous auth to finish before issuing
    // reads — otherwise the very first login attempt on a fresh page
    // load races signInAnonymously() and Firestore rejects the read
    // with permission-denied, leaving the user staring at "Invalid
    // username or password" when their credentials are actually right.
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.ready) {
        await DATA_SYNC.ready;
      }
    } catch (_) { /* non-fatal — fall through to the read attempt */ }

    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db && username) {
        remoteAttempted = true;
        const tryIds = [username];
        if (rawUsername !== username) tryIds.push(rawUsername);
        console.log('[LOGIN] Querying Firestore for IDs:', tryIds);

        let matchedData = null;
        let foundDocButPwMismatch = false;
        let foundDocButNoPassword = false;
        for (const id of tryIds) {
          try {
            const snap = await DATA_SYNC.db.collection('sphere_users').doc(id).get();
            if (snap.exists) {
              const data = snap.data() || {};
              console.log('[LOGIN] Found Firestore doc:', id, '— has password field:', !!data.password);
              if (data.password) {
                const storedPw = String(data.password);
                // Match every combination — trim both sides to defeat whitespace.
                const matches = storedPw === password
                  || storedPw === rawPassword
                  || storedPw.trim() === password
                  || storedPw.trim() === rawPassword;
                if (matches) {
                  matchedData = data;
                  console.log('[LOGIN] ✓ Password matched in Firestore');
                  break;
                } else {
                  foundDocButPwMismatch = true;
                  console.log('[LOGIN] ✗ Password did NOT match. Stored length:', storedPw.length, 'Input length:', password.length);
                }
              } else {
                // Doc exists but has no password — likely a legacy
                // account created before the signup-writes-password
                // fix. The student needs to either log in once from
                // their original device (which auto-backfills the
                // password to Firestore), or have an admin reset it.
                foundDocButNoPassword = true;
                console.log('[LOGIN] ✗ Doc exists but has no password field — legacy account');
              }
            } else {
              console.log('[LOGIN] No doc at:', id);
            }
          } catch (e) {
            console.warn('[LOGIN] Firestore read failed for', id, ':', e.message);
          }
        }

        if (matchedData) {
          // Mirror remote record into the local auth_users array so
          // AUTH.login matches next time, then fire the local login.
          try {
            const users = AUTH.getAllUsers();
            const idx = users.findIndex(u => (u.username || '').toLowerCase() === username);
            if (idx === -1) {
              users.push({
                username: (matchedData.username || username).toLowerCase(),
                email: matchedData.email || '',
                fullName: matchedData.displayName || matchedData.fullName || username,
                password: matchedData.password,
                role: matchedData.role || 'student',
                createdAt: matchedData.registeredAt || Date.now()
              });
            } else {
              users[idx].password = matchedData.password;
              if (matchedData.role) users[idx].role = matchedData.role;
              if (matchedData.email) users[idx].email = users[idx].email || matchedData.email;
              if (matchedData.displayName) users[idx].fullName = users[idx].fullName || matchedData.displayName;
            }
            safeSetItem(AUTH.USERS_KEY, JSON.stringify(users));
            console.log('[LOGIN] Mirrored Firestore record to localStorage');
          } catch (e) { console.warn('[LOGIN] Mirror failed:', e.message); }

          if (AUTH.login(username, password)) {
            console.log('[LOGIN] ✓ Logged in via Firestore fallback');
            window.location.href = AUTH.isAdmin() ? 'admin.html' : 'dashboard.html';
            remoteHit = true;
            return;
          } else {
            console.warn('[LOGIN] Mirror succeeded but AUTH.login still failed — check username casing');
          }
        }

        if (foundDocButPwMismatch && loginError) {
          loginError.textContent = 'Wrong password for that account. (If your admin just reset it, double-check the exact characters.)';
          loginError.style.display = 'block';
          return;
        }
        if (foundDocButNoPassword && loginError) {
          loginError.textContent = 'This account needs to be re-activated for cross-device login. Please log in once from the device you originally signed up on, or ask your admin to reset your password.';
          loginError.style.display = 'block';
          return;
        }
      } else {
        console.log('[LOGIN] DATA_SYNC.db not available — skipping fallback');
      }
    } catch (err) {
      console.warn('[LOGIN] Firestore fallback errored:', err.message);
    } finally {
      if (submitBtn && !remoteHit) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalLabel || 'Log In';
      }
    }

    if (loginError) {
      loginError.textContent = 'Invalid username or password.';
      loginError.style.display = 'block';
    }
  });
}

// Handle signup form — creates real student accounts
const signupForm = document.getElementById('signupForm');
if (signupForm) {
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const fullName = document.getElementById('fullname').value.trim();
    const email = document.getElementById('email').value.trim();
    const usernameInput = document.getElementById('signupUsername') || document.getElementById('username');
    const username = usernameInput ? usernameInput.value.trim().toLowerCase() : '';
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const signupError = document.getElementById('signupError');

    // Validate username
    if (!username || username.length < 3) {
      if (signupError) {
        signupError.textContent = 'Username must be at least 3 characters.';
        signupError.style.display = 'block';
      }
      return;
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      if (signupError) {
        signupError.textContent = 'Username can only contain letters, numbers, and underscores.';
        signupError.style.display = 'block';
      }
      return;
    }
    if (username === 'admin') {
      if (signupError) {
        signupError.textContent = 'That username is reserved. Please choose another.';
        signupError.style.display = 'block';
      }
      return;
    }

    if (password !== confirmPassword) {
      if (signupError) {
        signupError.textContent = 'Passwords do not match.';
        signupError.style.display = 'block';
      }
      return;
    }

    if (password.length < 8) {
      if (signupError) {
        signupError.textContent = 'Password must be at least 8 characters.';
        signupError.style.display = 'block';
      }
      return;
    }

    const result = AUTH.register(fullName, email, username, password);
    if (result.success) {
      window.location.href = 'login.html?registered=' + encodeURIComponent(username);
    } else {
      if (signupError) {
        signupError.textContent = result.error;
        signupError.style.display = 'block';
      }
    }
  });
}

// Show success message on login page after registration
if (currentPage === 'login.html' && window.location.search.includes('registered=')) {
  const loginError = document.getElementById('loginError');
  const params = new URLSearchParams(window.location.search);
  const newUsername = params.get('registered');
  if (loginError && newUsername) {
    loginError.innerHTML = '&#10003; Account created! Your username: <strong>' + newUsername + '</strong>';
    loginError.style.display = 'block';
    loginError.style.background = '#d1fae5';
    loginError.style.color = '#065f46';
    loginError.style.borderColor = '#10b981';
  }
  // Pre-fill username field
  const usernameField = document.getElementById('username') || document.getElementById('email');
  if (usernameField && newUsername) {
    usernameField.value = newUsername;
    // Focus password field for convenience
    const passwordField = document.getElementById('password');
    if (passwordField) passwordField.focus();
  }
}

// ===== COURSE CARD IMAGES (dynamic from localStorage) =====
// ===== Add lock indicators to ALL lesson-item links on course + home =====
if (currentPage === 'course.html' || currentPage === 'index.html') {
  try {
    const LOCK_SVG_SMALL = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    document.querySelectorAll('.lesson-item[href*="lesson.html"]').forEach(link => {
      const m = (link.getAttribute('href') || '').match(/week=(\w+)/);
      if (!m) return;
      const wid = m[1];
      if (!LESSONS.isUnlocked(wid)) {
        link.classList.add('is-locked');
        if (!link.querySelector('.lesson-item-lock')) {
          const dur = link.querySelector('.duration');
          const lockSpan = document.createElement('span');
          lockSpan.className = 'lesson-item-lock';
          lockSpan.innerHTML = LOCK_SVG_SMALL + 'Locked';
          if (dur) link.insertBefore(lockSpan, dur);
          else link.appendChild(lockSpan);
        }
      }
    });
  } catch (e) {}
}

if (currentPage === 'course.html' || currentPage === 'index.html') {
  // Use $= (ends-with) so "week=w1" doesn't accidentally match "week=w13".
  const cardMonths = [
    { month: 1, weekHref: 'week=w1', linkSelector: '.course-card-link[href$="week=w1"]' },
    { month: 2, weekHref: 'week=w5', linkSelector: '.course-card-link[href$="week=w5"]' },
    { month: 3, weekHref: 'week=w9', linkSelector: '.course-card-link[href$="week=w9"]' },
    { month: 4, weekHref: 'week=w13', linkSelector: '.course-card-link[href$="week=w13"]' }
  ];
  cardMonths.forEach(({ month, linkSelector }) => {
    const links = document.querySelectorAll(linkSelector);
    links.forEach(link => {
      // 1) Inject uploaded image (admin → student)
      const cardImg = link.querySelector('.course-card-img');
      const imgData = safeGetItem('card_image_' + month);
      if (cardImg && imgData && !cardImg.querySelector('img')) {
        const img = document.createElement('img');
        img.src = imgData;
        img.alt = 'Month ' + month;
        // Apply the saved object-position-y from admin's drag-to-pan,
        // sanitising legacy pixel-based values (negatives) back to 50%.
        const savedPos = safeGetItem('card_image_pos_' + month);
        let posPct = 50;
        if (savedPos != null && savedPos !== '') {
          const n = parseFloat(savedPos);
          if (!isNaN(n) && n >= 0 && n <= 100) posPct = n;
        }
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center ' + posPct + '%;z-index:0;';
        cardImg.appendChild(img);
      }
      // 2) Sync the phase title from admin's saved month names so the
      //    student sees what the admin set under Site Settings → Month
      //    Names (e.g. "Basic Product Branding" instead of the
      //    hard-coded "Basic Fundamentals").
      const titleEl = link.querySelector('.course-card-body h3');
      if (titleEl && typeof LESSONS !== 'undefined' && LESSONS.getMonthName) {
        const customName = LESSONS.getMonthName(month);
        if (customName) titleEl.textContent = customName;
      }
    });
  });
}

// ===== NAVBAR SCROLL EFFECT =====
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
  });
}

// ===== DARK MODE TOGGLE =====
const themeToggle = document.getElementById('themeToggle');
const savedTheme = safeGetItem('theme');

if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme);
}

if (themeToggle) {
  // Update icon based on current theme
  function updateThemeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeToggle.innerHTML = isDark ? '&#9728;' : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
  updateThemeIcon();

  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    safeSetItem('theme', newTheme);
    updateThemeIcon();
  });
}

// ===== MOBILE HAMBURGER MENU =====
const hamburger = document.getElementById('hamburger');
const navLinks = document.querySelector('.nav-links');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('mobile-open');
    hamburger.classList.toggle('active');
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('mobile-open');
      hamburger.classList.remove('active');
    });
  });
}

// ===== MODULE ACCORDION =====
function toggleModule(header) {
  const moduleItem = header.closest('.module-item');
  const isOpen = moduleItem.classList.contains('open');

  const parent = moduleItem.parentElement;
  parent.querySelectorAll('.module-item').forEach(item => {
    item.classList.remove('open');
  });

  if (!isOpen) {
    moduleItem.classList.add('open');
  }
}

// ===== COURSE TABS =====
const tabButtons = document.querySelectorAll('.course-tab');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    tabButtons.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    tabPanels.forEach(panel => {
      panel.classList.remove('active');
      if (panel.id === `tab-${tabId}`) {
        panel.classList.add('active');
      }
    });
  });
});

// ===== SMOOTH SCROLL FOR ANCHOR LINKS =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const targetId = this.getAttribute('href');
    if (targetId === '#') return;

    const target = document.querySelector(targetId);
    if (target) {
      e.preventDefault();
      const offset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ===== ANIMATED NUMBER COUNTERS =====
function animateCounters() {
  const counters = document.querySelectorAll('[data-count]');
  counters.forEach(counter => {
    if (counter.dataset.animated) return;

    const target = parseInt(counter.dataset.count);
    const duration = 2000;
    const startTime = performance.now();
    const suffix = target >= 100 ? '+' : '';

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);

      counter.textContent = current.toLocaleString() + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        counter.textContent = target.toLocaleString() + suffix;
      }
    }

    counter.dataset.animated = 'true';
    requestAnimationFrame(update);
  });
}

// Trigger counters when hero stats are visible
const heroStats = document.querySelector('.hero-stats');
if (heroStats) {
  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounters();
          counterObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );
  counterObserver.observe(heroStats);
}

// ===== SCROLL REVEAL ANIMATION =====
const revealElements = document.querySelectorAll(
  '.feature-card, .module-item, .testimonial-card, .pricing-card, .instructor-stat'
);

if (revealElements.length > 0) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // Staggered delay based on position in grid
          setTimeout(() => {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }, index * 60);
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
  );

  revealElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    revealObserver.observe(el);
  });
}

// ===== BACK TO TOP BUTTON =====
const backToTop = document.getElementById('backToTop');
if (backToTop) {
  window.addEventListener('scroll', () => {
    backToTop.classList.toggle('visible', window.scrollY > 500);
  });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ===== STICKY ENROLLMENT BAR =====
const stickyBar = document.getElementById('stickyBar');
if (stickyBar) {
  const pricingSection = document.getElementById('pricing');
  window.addEventListener('scroll', () => {
    if (pricingSection) {
      const pricingRect = pricingSection.getBoundingClientRect();
      // Show after scrolling past pricing section
      stickyBar.classList.toggle('visible', pricingRect.bottom < 0);
    } else {
      stickyBar.classList.toggle('visible', window.scrollY > 1200);
    }
  });
}

// ===== LESSON SIDEBAR ACTIVE STATE =====
const sidebarLessons = document.querySelectorAll('.sidebar-lesson');
sidebarLessons.forEach(lesson => {
  lesson.addEventListener('click', function (e) {
    if (this.classList.contains('active')) {
      e.preventDefault();
      return;
    }
    sidebarLessons.forEach(l => l.classList.remove('active'));
    this.classList.add('active');
  });
});

// ===== VIDEO PLAY BUTTON =====
const playBtn = document.querySelector('.play-btn');
if (playBtn) {
  playBtn.addEventListener('click', () => {
    const player = playBtn.closest('.video-player');
    player.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#fff;gap:16px;">
        <div style="width:64px;height:64px;border-radius:50%;border:3px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;">
          <div style="font-size:2rem;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg></div>
        </div>
        <p style="font-size:1.05rem;font-weight:600;opacity:0.9;">Video player would load here</p>
        <p style="font-size:0.8rem;opacity:0.5;">Connect your video hosting (YouTube, Vimeo, etc.)</p>
      </div>
    `;
  });
}

// ===== TYPING EFFECT ON HERO (subtle) =====
const heroHighlight = document.querySelector('.hero h1 .highlight');
if (heroHighlight) {
  const words = ['Intern Roadmap', 'Creative Skills', 'Ads Manager', 'Full Proficiency'];
  let wordIndex = 0;

  setInterval(() => {
    wordIndex = (wordIndex + 1) % words.length;
    heroHighlight.style.opacity = '0';
    heroHighlight.style.transform = 'translateY(8px)';
    setTimeout(() => {
      heroHighlight.textContent = words[wordIndex];
      heroHighlight.style.opacity = '1';
      heroHighlight.style.transform = 'translateY(0)';
    }, 300);
  }, 3000);

  heroHighlight.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  heroHighlight.style.display = 'inline-block';
}

// ===== MOBILE SIDEBAR DRAWER =====
const sidebarToggle = document.getElementById('sidebarToggle');
const lessonSidebar = document.querySelector('.lesson-sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

if (sidebarToggle && lessonSidebar && sidebarOverlay) {
  sidebarToggle.addEventListener('click', () => {
    lessonSidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('active');
    const isOpen = lessonSidebar.classList.contains('open');
    sidebarToggle.querySelector('.sidebar-toggle-icon').textContent = isOpen ? '\u2715' : '\u2630';
  });

  sidebarOverlay.addEventListener('click', () => {
    lessonSidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    sidebarToggle.querySelector('.sidebar-toggle-icon').textContent = '\u2630';
  });

  lessonSidebar.querySelectorAll('.sidebar-lesson').forEach(lesson => {
    lesson.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        lessonSidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        sidebarToggle.querySelector('.sidebar-toggle-icon').textContent = '\u2630';
      }
    });
  });
}

// ===== CLOSE MENUS ON RESIZE =====
window.addEventListener('resize', () => {
  if (window.innerWidth > 768 && navLinks) {
    navLinks.classList.remove('mobile-open');
    if (hamburger) hamburger.classList.remove('active');
  }
  if (window.innerWidth > 1024 && lessonSidebar) {
    lessonSidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    if (sidebarToggle) {
      const icon = sidebarToggle.querySelector('.sidebar-toggle-icon');
      if (icon) icon.textContent = '\u2630';
    }
  }
});

// ===== DYNAMIC LESSON RENDERING =====
if (currentPage === 'lesson.html') {
  const params = new URLSearchParams(window.location.search);
  const weekId = params.get('week') || 'w1';
  const lesson = LESSONS.get(weekId);
  const isAdmin = AUTH.isAdmin();
  const isPublished = lesson && lesson.published === true;

  // Dashboard tracking: remember last accessed + log view activity
  if (lesson && (isAdmin || isPublished) && AUTH.isLoggedIn()) {
    try { PROGRESS.setLastAccessed(weekId); } catch (e) {}
    // Only log view once per hour per lesson to avoid spam
    try {
      const lastViewKey = 'last_view_' + weekId;
      const lastView = parseInt(safeGetItem(lastViewKey) || '0', 10);
      if (Date.now() - lastView > 60 * 60 * 1000) {
        if (typeof ACTIVITY !== 'undefined') ACTIVITY.log('lesson_viewed', weekId, 'W' + lesson.week + ': ' + lesson.title);
        safeSetItem(lastViewKey, String(Date.now()));
      }
    } catch (e) {}
  }

  // Show error if lesson not found
  if (!lesson) {
    const main = document.querySelector('.lesson-main');
    if (main) {
      main.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;padding:40px;">'
        + '<div style="font-size:4rem;margin-bottom:16px;">&#9888;</div>'
        + '<h2 style="margin-bottom:8px;">Lesson Not Found</h2>'
        + '<p style="color:var(--text-light);">The lesson "' + weekId + '" could not be found. It may have been removed or the URL is incorrect.</p>'
        + '<a href="course.html" class="btn btn-primary" style="margin-top:24px;">Back to Course</a></div>';
    }
  }

  // Show "Coming Soon" FIRST if not published and not admin
  if (lesson && !isPublished && !isAdmin) {
    const main = document.querySelector('.lesson-main');
    if (main) {
      main.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;padding:40px;">'
        + '<div style="font-size:4rem;margin-bottom:16px;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>'
        + '<h2 style="margin-bottom:8px;">Coming Soon</h2>'
        + '<p style="color:var(--text-light);">This lesson hasn\'t been published yet. Check back later!</p>'
        + '<a href="course.html" class="btn btn-primary" style="margin-top:24px;">Back to Course</a></div>';
    }
  }

  // Prerequisites gate — if published but locked (and not admin), show locked screen
  // Locking is permanently disabled — all 16 lessons open from day one.
  const isLocked = false;
  if (isLocked) {
    const main = document.querySelector('.lesson-main');
    if (main) {
      const reqs = LESSONS.getUnlockRequirements(weekId);
      const reqListHtml = reqs.map(r => {
        const iconSvg = r.type === 'quiz'
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'
          : r.type === 'assignment'
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
          : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        return '<li class="lock-req"><span class="lock-req-icon">' + iconSvg + '</span><span>' + r.label + '</span></li>';
      }).join('');
      const prevWeekNum = (lesson.week || 2) - 1;
      main.innerHTML = '<div class="lesson-locked">'
        + '<div class="lesson-locked-icon"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>'
        + '<h2>Week ' + lesson.week + ' is locked</h2>'
        + '<p>Finish the Week ' + prevWeekNum + ' requirements below to unlock <strong>' + lesson.title + '</strong>.</p>'
        + (reqs.length ? '<ul class="lock-req-list">' + reqListHtml + '</ul>' : '')
        + '<div class="lesson-locked-actions">'
        +   '<a href="lesson.html?week=w' + prevWeekNum + '" class="btn btn-primary">Go to Week ' + prevWeekNum + ' \u2192</a>'
        +   '<a href="course.html" class="btn btn-outline">Back to Course</a>'
        + '</div>'
        + '</div>';
    }
  }

  // Render content only if published OR admin AND not locked
  if (lesson && (isPublished || isAdmin) && !isLocked) {
    // Update title
    const titleEl = document.querySelector('.lesson-content h1');
    if (titleEl) titleEl.textContent = lesson.title;

    // Update meta
    const metaEl = document.querySelector('.lesson-meta');
    if (metaEl) {
      metaEl.innerHTML = '<span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ' + LESSONS.getMonthPrefix(lesson.month) + ', Week ' + lesson.week + '</span>'
        + '<span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M12 2l2 4 4 .5-3 3 .7 4.2L12 12l-3.7 1.7.7-4.2-3-3L10 6z"/></svg> ' + lesson.category + '</span>'
        + '<span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> ' + lesson.difficulty + '</span>';
    }

    // Admin draft banner
    if (isAdmin && !isPublished) {
      const lessonContent = document.querySelector('.lesson-content');
      if (lessonContent) {
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:0.85rem;font-weight:600;';
        banner.textContent = '&#9888; Draft — This lesson is not published yet. Only you (admin) can see this preview.';
        lessonContent.insertBefore(banner, lessonContent.firstChild);
      }
    }

    // Update breadcrumb
    const breadcrumb = document.querySelector('.lesson-breadcrumb');
    if (breadcrumb) {
      breadcrumb.innerHTML = '<a href="course.html">Course</a><span>/</span>'
        + '<a href="#">' + LESSONS.getFullMonthLabel(lesson.month) + '</a>'
        + '<span>/</span><span>Week ' + lesson.week + '</span>';
    }

    // Update video player — three states:
    //  1. videoUrl set → render the real embed/thumbnail player
    //  2. no videoUrl + viewer is admin → inline "Paste video URL" card
    //     that saves the URL right from the lesson page (no admin trip)
    //  3. no videoUrl + viewer is student → polished "Video coming soon"
    //     placeholder that doesn't look like a broken UI
    const videoPlayer = document.querySelector('.video-player');
    if (videoPlayer && lesson.videoUrl) {
      const thumbHtml = LESSONS.getVideoEmbed(lesson, false);
      if (thumbHtml) {
        videoPlayer.innerHTML = thumbHtml;
        videoPlayer.style.background = '#000';

        // Click-to-play: replace thumbnail with an embedded iframe (plays inline)
        const thumbPlayer = videoPlayer.querySelector('.yt-thumb-player');
        if (thumbPlayer) {
          thumbPlayer.addEventListener('click', () => {
            videoPlayer.innerHTML = LESSONS.getVideoEmbed(lesson, true);
          });
        }
      }
    } else if (videoPlayer) {
      const isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
      if (isAdmin) {
        // Admin sees an inline composer so they can paste a video URL
        // without leaving the lesson page. Saves to LESSONS.save() and
        // immediately re-renders the embed.
        videoPlayer.classList.add('video-player-admin');
        videoPlayer.innerHTML =
          '<div class="video-empty-admin">'
          + '<div class="video-empty-icon">'
          +   '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
          + '</div>'
          + '<h3>Add a video to this lesson</h3>'
          + '<p>Paste a link from YouTube, Vimeo, Loom, Drive, Facebook, TikTok, or a direct .mp4.<br><span class="video-empty-hint">Videos boost lesson completion by 3-5×.</span></p>'
          + '<form class="video-empty-form" id="inlineVideoForm">'
          +   '<input type="url" id="inlineVideoUrl" placeholder="https://youtube.com/watch?v=..." required>'
          +   '<button type="submit" class="btn btn-primary">Save video</button>'
          + '</form>'
          + '<a href="admin.html#tab=lessons" class="video-empty-link">Or open the full lesson editor →</a>'
          + '</div>';

        const form = document.getElementById('inlineVideoForm');
        if (form) {
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            const url = (document.getElementById('inlineVideoUrl').value || '').trim();
            if (!url) return;
            // Persist + re-render
            const updated = Object.assign({}, lesson, { videoUrl: url, videoType: 'auto' });
            LESSONS.save(updated);
            // Hot-swap the player UI without page reload
            videoPlayer.classList.remove('video-player-admin');
            videoPlayer.innerHTML = LESSONS.getVideoEmbed(updated, false);
            videoPlayer.style.background = '#000';
            const thumb = videoPlayer.querySelector('.yt-thumb-player');
            if (thumb) {
              thumb.addEventListener('click', () => {
                videoPlayer.innerHTML = LESSONS.getVideoEmbed(updated, true);
              });
            }
          });
        }
      } else {
        // Student sees a calm, intentional "coming soon" placeholder
        videoPlayer.classList.add('video-player-coming');
        videoPlayer.innerHTML =
          '<div class="video-empty-soon">'
          + '<div class="video-empty-icon">'
          +   '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
          + '</div>'
          + '<h3>Video coming soon</h3>'
          + '<p>The full lesson video is on its way. Read the content below to get started — you can come back when the recording is up.</p>'
          + '</div>';
      }
    }

    // Update body
    const body = document.querySelector('.lesson-body');
    if (body && lesson.sections && lesson.sections.length > 0) {
      // Render admin/seed content as real HTML instead of escaping it.
      // Block-level wrapper (<p>, <ul>, <ol>, <div>, <h1>-<h6>) at the
      // start = content already supplies its own block — drop straight
      // in. Otherwise wrap in a <p> so inline tags (<strong>, <em>) and
      // plain text both render with paragraph spacing + line breaks.
      const startsWithBlock = (s) => /^\s*<(p|ul|ol|div|h[1-6]|blockquote|pre|table|figure)\b/i.test(String(s || ''));
      let html = '';
      lesson.sections.forEach((sec, i) => {
        if (sec.heading) {
          html += '<h2>' + (i < 9 ? '0' : '') + (i + 1) + ' &mdash; ' + sec.heading + '</h2>';
        }
        if (sec.content) {
          if (startsWithBlock(sec.content)) {
            html += '<div class="lesson-section-body">' + sec.content + '</div>';
          } else {
            html += '<p style="white-space:pre-line;">' + sec.content + '</p>';
          }
        }
      });
      if (lesson.proTip) {
        if (startsWithBlock(lesson.proTip)) {
          html += '<div class="key-takeaways"><h3>Pro Tip</h3>' + lesson.proTip + '</div>';
        } else {
          html += '<div class="key-takeaways"><h3>Pro Tip</h3><p>' + lesson.proTip + '</p></div>';
        }
      }
      if (lesson.keyTakeaways && lesson.keyTakeaways.length > 0) {
        html += '<div class="key-takeaways"><h3>Key Takeaways</h3><ul>';
        lesson.keyTakeaways.forEach(t => { html += '<li>' + t + '</li>'; });
        html += '</ul></div>';
      }
      if (html) body.innerHTML = html;
    }

    // ===== RENDER WEEKLY ASSESSMENT / QUIZ =====
    const quizSection = document.getElementById('quizSection');
    if (quizSection && lesson.quiz && lesson.quiz.enabled && lesson.quiz.questions && lesson.quiz.questions.length > 0) {
      const quiz = lesson.quiz;
      const existingResult = QUIZ_RESULTS.get(weekId);
      const alreadyPassed = existingResult && existingResult.passed;

      let qHtml = '<div class="quiz-section">';
      qHtml += '<h3><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Weekly Assessment</h3>';

      if (alreadyPassed) {
        // Show passed state
        qHtml += '<div class="quiz-result pass">&#10003; You passed this assessment with ' + existingResult.percentage + '% (' + existingResult.score + '/' + existingResult.total + ' correct)</div>';
        qHtml += '<p style="margin-top:12px;font-size:0.82rem;color:var(--text-light);">Completed on ' + new Date(existingResult.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</p>';
        qHtml += '<button class="btn btn-outline" id="quizRetakeBtn" style="margin-top:12px;padding:8px 18px;font-size:0.82rem;">Retake Assessment</button>';
      } else {
        // Show quiz form
        quiz.questions.forEach((q, qi) => {
          qHtml += '<div class="quiz-question" data-qi="' + qi + '">';
          qHtml += '<p>' + (qi + 1) + '. ' + q.question + '</p>';
          qHtml += '<div class="quiz-options">';
          q.options.forEach((opt, oi) => {
            if (opt) {
              qHtml += '<label class="quiz-option" data-qi="' + qi + '" data-oi="' + oi + '">'
                + '<input type="radio" name="quiz_' + qi + '" value="' + oi + '">'
                + '<span>' + opt + '</span></label>';
            }
          });
          qHtml += '</div></div>';
        });

        if (existingResult && !existingResult.passed) {
          qHtml += '<div class="quiz-result fail" style="margin-bottom:12px;">&#10007; Previous attempt: ' + existingResult.percentage + '% — You need ' + quiz.passScore + '% to pass. Try again!</div>';
        }

        qHtml += '<div class="quiz-submit">';
        qHtml += '<button class="btn btn-primary" id="quizSubmitBtn">Submit Assessment</button>';
        qHtml += '<span style="font-size:0.82rem;color:var(--text-light);">Need ' + quiz.passScore + '% to pass</span>';
        qHtml += '</div>';
      }

      qHtml += '</div>';
      quizSection.innerHTML = qHtml;

      // Wire up quiz option selection
      quizSection.querySelectorAll('.quiz-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const qi = opt.dataset.qi;
          quizSection.querySelectorAll('.quiz-option[data-qi="' + qi + '"]').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          opt.querySelector('input').checked = true;
        });
      });

      // Submit handler
      const quizSubmitBtn = document.getElementById('quizSubmitBtn');
      if (quizSubmitBtn) {
        quizSubmitBtn.addEventListener('click', () => {
          const total = quiz.questions.length;
          let answered = 0;
          let correct = 0;

          quiz.questions.forEach((q, qi) => {
            const selected = quizSection.querySelector('input[name="quiz_' + qi + '"]:checked');
            if (selected) {
              answered++;
              const selectedIdx = parseInt(selected.value);
              const isCorrect = selectedIdx === q.correctIndex;
              if (isCorrect) correct++;

              // Visual feedback
              quizSection.querySelectorAll('.quiz-option[data-qi="' + qi + '"]').forEach(opt => {
                const oi = parseInt(opt.dataset.oi);
                opt.classList.remove('selected');
                if (oi === q.correctIndex) opt.classList.add('correct');
                else if (oi === selectedIdx && !isCorrect) opt.classList.add('wrong');
              });
            }
          });

          if (answered < total) {
            alert('Please answer all ' + total + ' questions before submitting.');
            return;
          }

          const percentage = Math.round((correct / total) * 100);
          const passed = percentage >= quiz.passScore;

          QUIZ_RESULTS.save(weekId, correct, total, passed);
          if (passed && typeof checkBadges === 'function') checkBadges();

          // Disable submit
          quizSubmitBtn.disabled = true;
          quizSubmitBtn.textContent = 'Submitted';

          // Show result
          const existingResultDiv = quizSection.querySelector('.quiz-result');
          if (existingResultDiv) existingResultDiv.remove();

          const resultDiv = document.createElement('div');
          resultDiv.className = 'quiz-result ' + (passed ? 'pass' : 'fail');
          if (passed) {
            resultDiv.innerHTML = '&#10003; You passed! ' + percentage + '% (' + correct + '/' + total + ' correct)';
            // Log quiz activity
            try { if (typeof ACTIVITY !== 'undefined') ACTIVITY.log('quiz_passed', weekId, 'W' + lesson.week + ': ' + lesson.title + ' — ' + percentage + '%'); } catch (e) {}
            // Auto-complete lesson if passed
            if (!PROGRESS.isCompleted(weekId)) {
              PROGRESS.toggle(weekId);
              try { if (typeof ACTIVITY !== 'undefined') ACTIVITY.log('lesson_completed', weekId, 'W' + lesson.week + ': ' + lesson.title); } catch (e) {}
              // Update complete button
              const cb = document.getElementById('completeBtn');
              if (cb) {
                cb.classList.add('completed');
                cb.innerHTML = '&#10003; Week ' + lesson.week + ' Completed';
              }
            }
            NOTIFS.add('You passed the Lesson ' + lesson.week + ' assessment with ' + percentage + '%!', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>', 'lesson.html?week=' + weekId);
          } else {
            resultDiv.innerHTML = '&#10007; Score: ' + percentage + '% — Need ' + quiz.passScore + '% to pass. <a href="javascript:location.reload()" style="color:inherit;font-weight:700;text-decoration:underline;">Try Again</a>';
            try { if (typeof ACTIVITY !== 'undefined') ACTIVITY.log('quiz_failed', weekId, 'W' + lesson.week + ': ' + lesson.title + ' — ' + percentage + '%'); } catch (e) {}
          }
          quizSection.querySelector('.quiz-submit').before(resultDiv);
        });
      }

      // Retake handler
      const retakeBtn = document.getElementById('quizRetakeBtn');
      if (retakeBtn) {
        retakeBtn.addEventListener('click', () => {
          // Clear result and re-render
          const all = QUIZ_RESULTS.getAll();
          delete all[weekId];
          safeSetItem(QUIZ_RESULTS.STORAGE_KEY, JSON.stringify(all));
          location.reload();
        });
      }
    }

    // Render assignment section
    const assignmentSection = document.getElementById('assignmentSection');
    if (assignmentSection && lesson.assignment && lesson.assignment.enabled) {
      const asgn = lesson.assignment;
      const submission = ASSIGNMENTS.get(weekId);
      const isSubmitted = submission && submission.submitted;

      // Build accepted types string
      const acceptTypes = [];
      if (asgn.fileTypes.image) acceptTypes.push('image/*');
      if (asgn.fileTypes.video) acceptTypes.push('video/*');
      if (asgn.fileTypes.pdf) acceptTypes.push('.pdf');
      const acceptStr = acceptTypes.join(',');

      // File type labels
      const typeLabels = [];
      if (asgn.fileTypes.image) typeLabels.push('Images');
      if (asgn.fileTypes.video) typeLabels.push('Videos');
      if (asgn.fileTypes.pdf) typeLabels.push('PDFs');

      let asgnHtml = '<div class="assignment-section">';
      asgnHtml += '<div class="assignment-header">';
      asgnHtml += '<h2><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> ' + (asgn.title || 'Weekly Assignment') + '</h2>';
      if (asgn.description) asgnHtml += '<p style="white-space:pre-line;">' + asgn.description.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
      asgnHtml += '</div>';

      if (isSubmitted) {
        // Show submitted state
        const date = new Date(submission.submittedAt);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const subFiles = submission.files || [];
        const subLinks = submission.links || [];
        const totalCount = subFiles.length + subLinks.length;
        asgnHtml += '<div class="assignment-submitted">';
        asgnHtml += '<div class="assignment-submitted-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><polyline points="20 6 9 17 4 12"/></svg></div>';
        asgnHtml += '<div class="assignment-submitted-text">';
        asgnHtml += '<strong>Assignment Submitted</strong>';
        asgnHtml += '<span>Submitted on ' + dateStr + ' &bull; ' + totalCount + ' submission' + (totalCount === 1 ? '' : 's') + '</span>';
        asgnHtml += '</div>';
        asgnHtml += '<button class="assignment-resubmit" id="asgnResubmit">Re-submit</button>';
        asgnHtml += '</div>';

        // Show submitted files
        asgnHtml += '<div class="assignment-files" id="asgnFileList">';
        subFiles.forEach(f => {
          const icon = f.type.startsWith('image') ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M12 2l2 4 4 .5-3 3 .7 4.2L12 12l-3.7 1.7.7-4.2-3-3L10 6z"/></svg>' : f.type.startsWith('video') ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><rect x="2" y="7" width="15" height="10" rx="2"/><path d="m17 10 5-3v10l-5-3z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
          const cls = f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : 'pdf';
          asgnHtml += '<div class="assignment-file">';
          asgnHtml += '<div class="assignment-file-icon ' + cls + '">' + icon + '</div>';
          asgnHtml += '<div class="assignment-file-info">';
          // If we have a downloadURL (Storage upload succeeded), make
          // the filename a link. Else just show the text.
          if (f.downloadURL) {
            const safeUrl = String(f.downloadURL).replace(/"/g, '&quot;');
            asgnHtml += '<div class="assignment-file-name"><a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + f.name + '</a></div>';
          } else {
            asgnHtml += '<div class="assignment-file-name">' + f.name + '</div>';
          }
          asgnHtml += '<div class="assignment-file-size">' + f.size + '</div>';
          asgnHtml += '</div></div>';
        });
        // Show submitted links
        subLinks.forEach(linkObj => {
          const url = (typeof linkObj === 'string') ? linkObj : (linkObj && linkObj.url) || '';
          if (!url) return;
          const safeUrl = url.replace(/"/g, '&quot;');
          const display = url.length > 60 ? url.substring(0, 60) + '…' : url;
          asgnHtml += '<div class="assignment-file">';
          asgnHtml += '<div class="assignment-file-icon link"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>';
          asgnHtml += '<div class="assignment-file-info">';
          asgnHtml += '<div class="assignment-file-name"><a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + display + '</a></div>';
          asgnHtml += '<div class="assignment-file-size">External link</div>';
          asgnHtml += '</div></div>';
        });
        asgnHtml += '</div>';
      } else {
        // Show upload form
        asgnHtml += '<div class="assignment-dropzone" id="asgnDropzone">';
        asgnHtml += '<input type="file" id="asgnFileInput" accept="' + acceptStr + '" multiple>';
        asgnHtml += '<span class="assignment-dropzone-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span>';
        asgnHtml += '<div class="assignment-dropzone-text">Drag & drop files or <strong>browse</strong></div>';
        asgnHtml += '<div class="assignment-dropzone-hint">Accepted: ' + typeLabels.join(', ') + ' &bull; Max 35MB per file &bull; Up to 5 files</div>';
        asgnHtml += '</div>';

        // OR — paste a link section
        asgnHtml += '<div class="assignment-or-divider"><span>OR</span></div>';
        asgnHtml += '<div class="assignment-link-section">';
        asgnHtml += '<label class="assignment-link-label" for="asgnLinkInput"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Paste a link <span class="assignment-link-hint">(Google Drive, YouTube, Dropbox, Canva, Figma — anything)</span></label>';
        asgnHtml += '<div class="assignment-link-row">';
        asgnHtml += '<input type="url" id="asgnLinkInput" placeholder="https://drive.google.com/... or any URL" autocomplete="url">';
        asgnHtml += '<button type="button" class="btn btn-outline btn-sm" id="asgnLinkAddBtn">Add link</button>';
        asgnHtml += '</div>';
        asgnHtml += '</div>';

        asgnHtml += '<div class="assignment-files" id="asgnFileList"></div>';
        asgnHtml += '<div class="assignment-submit" id="asgnSubmitArea" style="display:none;">';
        asgnHtml += '<button class="btn btn-primary" id="asgnSubmitBtn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Submit Assignment</button>';
        asgnHtml += '<span style="font-size:0.82rem; color:var(--text-light);">This will auto-complete the lesson</span>';
        asgnHtml += '</div>';
      }
      asgnHtml += '</div>';
      assignmentSection.innerHTML = asgnHtml;

      // Wire up upload logic if not submitted
      if (!isSubmitted) {
        const fileInput = document.getElementById('asgnFileInput');
        const dropzone = document.getElementById('asgnDropzone');
        const fileList = document.getElementById('asgnFileList');
        const submitArea = document.getElementById('asgnSubmitArea');
        const submitBtn = document.getElementById('asgnSubmitBtn');
        const linkInput = document.getElementById('asgnLinkInput');
        const linkAddBtn = document.getElementById('asgnLinkAddBtn');
        let pendingFiles = [];
        let pendingLinks = [];

        function renderPendingFiles() {
          fileList.innerHTML = '';
          pendingFiles.forEach((f, i) => {
            const icon = f.type.startsWith('image') ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M12 2l2 4 4 .5-3 3 .7 4.2L12 12l-3.7 1.7.7-4.2-3-3L10 6z"/></svg>' : f.type.startsWith('video') ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><rect x="2" y="7" width="15" height="10" rx="2"/><path d="m17 10 5-3v10l-5-3z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
            const cls = f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : 'pdf';
            const sizeStr = f.size < 1024 * 1024
              ? (f.size / 1024).toFixed(1) + ' KB'
              : (f.size / (1024 * 1024)).toFixed(1) + ' MB';
            const div = document.createElement('div');
            div.className = 'assignment-file';
            div.innerHTML = '<div class="assignment-file-icon ' + cls + '">' + icon + '</div>'
              + '<div class="assignment-file-info">'
              + '<div class="assignment-file-name">' + f.name + '</div>'
              + '<div class="assignment-file-size">' + sizeStr + '</div>'
              + '</div>'
              + '<button class="assignment-file-remove" data-kind="file" data-idx="' + i + '" title="Remove">&#10005;</button>';
            fileList.appendChild(div);
          });
          // Render pending links
          pendingLinks.forEach((url, i) => {
            const safeUrl = url.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const display = url.length > 60 ? url.substring(0, 60) + '…' : url;
            const div = document.createElement('div');
            div.className = 'assignment-file';
            div.innerHTML = '<div class="assignment-file-icon link"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>'
              + '<div class="assignment-file-info">'
              + '<div class="assignment-file-name">' + display + '</div>'
              + '<div class="assignment-file-size">External link</div>'
              + '</div>'
              + '<button class="assignment-file-remove" data-kind="link" data-idx="' + i + '" title="Remove">&#10005;</button>';
            fileList.appendChild(div);
          });
          const total = pendingFiles.length + pendingLinks.length;
          submitArea.style.display = total > 0 ? 'flex' : 'none';

          // Remove handlers
          fileList.querySelectorAll('.assignment-file-remove').forEach(btn => {
            btn.addEventListener('click', () => {
              const idx = parseInt(btn.dataset.idx);
              if (btn.dataset.kind === 'link') {
                pendingLinks.splice(idx, 1);
              } else {
                pendingFiles.splice(idx, 1);
              }
              renderPendingFiles();
            });
          });
        }

        function addFiles(files) {
          for (const file of files) {
            if (pendingFiles.length >= 5) break;
            if (file.size > 35 * 1024 * 1024) {
              alert(file.name + ' is too large. Max 35MB per file.');
              continue;
            }
            pendingFiles.push(file);
          }
          renderPendingFiles();
        }

        function addLink() {
          if (!linkInput) return;
          let url = (linkInput.value || '').trim();
          if (!url) return;
          // Auto-prepend https:// if missing protocol
          if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(url)) {
            url = 'https://' + url;
          }
          // Basic URL sanity check
          try {
            const parsed = new URL(url);
            if (!parsed.hostname || parsed.hostname.indexOf('.') === -1) {
              alert('Please enter a valid link (e.g. https://drive.google.com/...)');
              return;
            }
          } catch (e) {
            alert('Please enter a valid link (e.g. https://drive.google.com/...)');
            return;
          }
          if (pendingLinks.length >= 5) {
            alert('You can add up to 5 links per assignment.');
            return;
          }
          pendingLinks.push(url);
          linkInput.value = '';
          renderPendingFiles();
        }

        if (fileInput) fileInput.addEventListener('change', (e) => addFiles(e.target.files));

        if (dropzone) {
          dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
          dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
          dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            addFiles(e.dataTransfer.files);
          });
        }

        if (linkAddBtn) linkAddBtn.addEventListener('click', addLink);
        if (linkInput) {
          linkInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addLink();
            }
          });
        }

        if (submitBtn) {
          submitBtn.addEventListener('click', async () => {
            if (pendingFiles.length === 0 && pendingLinks.length === 0) return;
            submitBtn.disabled = true;

            const username = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;

            // ── Tab-leave guard ─────────────────────────────────────
            // Without this, switching tabs / closing the window mid-
            // upload would silently abort the Firebase Storage stream
            // AND fire the post-submit reload from a stale state, so
            // when the user came back the page looked "refreshed and
            // empty". Warn before unload while an upload is active.
            window._asgnUploading = true;
            function _asgnBeforeUnload(e) {
              if (!window._asgnUploading) return;
              e.preventDefault();
              e.returnValue = 'Your assignment is still uploading. Leave anyway?';
              return e.returnValue;
            }
            window.addEventListener('beforeunload', _asgnBeforeUnload);

            // ── Aggregate progress tracker ──────────────────────────
            // Each file's progress is stored in this array and the
            // overall percentage is the mean — that way the button
            // shows a single smooth 0→100% bar across parallel uploads
            // instead of jumping per-file.
            const fileProgress = new Array(pendingFiles.length).fill(0);
            function updateBtnLabel() {
              if (pendingFiles.length === 0) {
                submitBtn.textContent = 'Saving…';
                return;
              }
              const sum = fileProgress.reduce((a, b) => a + b, 0);
              const pct = Math.round((sum / pendingFiles.length) * 100);
              submitBtn.textContent = 'Uploading ' + pendingFiles.length + ' file' + (pendingFiles.length === 1 ? '' : 's') + '… ' + pct + '%';
            }
            updateBtnLabel();

            // ── Parallel upload + image compression ──────────────────
            // Promise.all kicks off every upload concurrently; large
            // images are downscaled on the fly so they go through in
            // a fraction of the time. Each promise resolves to the
            // file's metadata regardless of success/failure — we
            // never want to lose the submission because one file hit
            // a snag.
            const uploadPromises = pendingFiles.map(async (originalFile, idx) => {
              const file = await compressImageIfNeeded(originalFile);
              const sizeStr = file.size < 1024 * 1024
                ? (file.size / 1024).toFixed(1) + ' KB'
                : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
              let downloadURL = null;
              try {
                downloadURL = await uploadAssignmentFile(file, username, weekId, (frac) => {
                  fileProgress[idx] = frac;
                  updateBtnLabel();
                });
                fileProgress[idx] = 1;
                updateBtnLabel();
              } catch (err) {
                console.warn('[ASSIGNMENT] file failed, falling back to metadata-only:', originalFile.name, err);
              }
              return {
                name: originalFile.name,
                size: sizeStr,
                type: originalFile.type,
                date: new Date().toISOString(),
                downloadURL: downloadURL || null
              };
            });

            let fileData = [];
            try {
              fileData = await Promise.all(uploadPromises);
            } catch (e) {
              // Promise.all rejects if ANY upload throws — but our
              // map function catches per-file errors, so this branch
              // should be unreachable. Defensive fallback just in case.
              console.warn('[ASSIGNMENT] unexpected upload bundle error:', e);
            }

            const linkData = pendingLinks.map(url => ({
              url: url,
              date: new Date().toISOString()
            }));

            submitBtn.textContent = 'Saving…';
            ASSIGNMENTS.submit(weekId, fileData, linkData);
            if (typeof checkBadges === 'function') checkBadges();
            try { if (typeof USER_SYNC !== 'undefined') USER_SYNC.save(true); } catch (e) {}

            // ── Release the unload guard ────────────────────────────
            window._asgnUploading = false;
            window.removeEventListener('beforeunload', _asgnBeforeUnload);

            // ── In-place re-render — NO MORE PAGE RELOAD ────────────
            // The old behavior fired window.location.reload(), which
            // is what made the page seem to "rebuild itself" when the
            // user switched tabs mid-flow. Now we swap the upload form
            // for the submitted state in the DOM, surface a toast, and
            // re-run progress sync. Same outcome, zero flicker, zero
            // scroll loss.
            try {
              const sec = document.getElementById('assignmentSection');
              if (sec) {
                const date = new Date();
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const total = fileData.length + linkData.length;

                let html = '<div class="assignment-section">'
                  + '<div class="assignment-header">'
                  +   '<h2><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> ' + (asgn.title || 'Weekly Assignment') + '</h2>'
                  +   (asgn.description ? '<p style="white-space:pre-line;">' + String(asgn.description).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' : '')
                  + '</div>'
                  + '<div class="assignment-submitted">'
                  +   '<div class="assignment-submitted-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><polyline points="20 6 9 17 4 12"/></svg></div>'
                  +   '<div class="assignment-submitted-text">'
                  +     '<strong>Assignment Submitted</strong>'
                  +     '<span>Submitted on ' + dateStr + ' &bull; ' + total + ' submission' + (total === 1 ? '' : 's') + '</span>'
                  +   '</div>'
                  +   '<button class="assignment-resubmit" id="asgnResubmit">Re-submit</button>'
                  + '</div>'
                  + '<div class="assignment-files-submitted">';

                fileData.forEach(f => {
                  const fname = String(f.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  const cls = (f.type || '').startsWith('image') ? 'image' : (f.type || '').startsWith('video') ? 'video' : 'pdf';
                  const icon = cls === 'image'
                    ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
                    : cls === 'video'
                    ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
                    : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
                  html += '<div class="assignment-file">'
                    + '<div class="assignment-file-icon ' + cls + '">' + icon + '</div>'
                    + '<div class="assignment-file-info">'
                    +   (f.downloadURL
                          ? '<div class="assignment-file-name"><a href="' + String(f.downloadURL).replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer">' + fname + '</a></div>'
                          : '<div class="assignment-file-name">' + fname + '</div>')
                    +   '<div class="assignment-file-size">' + f.size + '</div>'
                    + '</div>'
                    + '</div>';
                });
                linkData.forEach(linkObj => {
                  const url = (typeof linkObj === 'string') ? linkObj : (linkObj && linkObj.url) || '';
                  if (!url) return;
                  const safeUrl = url.replace(/"/g, '&quot;');
                  const display = url.length > 60 ? url.substring(0, 60) + '…' : url;
                  html += '<div class="assignment-file">'
                    + '<div class="assignment-file-icon link"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>'
                    + '<div class="assignment-file-info">'
                    +   '<div class="assignment-file-name"><a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + display + '</a></div>'
                    +   '<div class="assignment-file-size">External link</div>'
                    + '</div>'
                    + '</div>';
                });

                html += '</div></div>';
                sec.innerHTML = html;

                // Wire the new Re-submit button — confirm + clear +
                // soft reload so the user can upload again.
                const resub = document.getElementById('asgnResubmit');
                if (resub) {
                  resub.addEventListener('click', () => {
                    if (!confirm('Clear your current submission and upload again?')) return;
                    ASSIGNMENTS.clearSubmission(weekId);
                    window.location.reload();
                  });
                }
              }
            } catch (e) { /* non-fatal; submission already saved */ }

            if (typeof window.toast === 'function') {
              window.toast('Assignment submitted!', 'success');
            }

            // Mark the lesson complete + nudge the sidebar progress
            try {
              const completeBtn = document.getElementById('completeBtn');
              if (completeBtn && !completeBtn.classList.contains('completed')) {
                completeBtn.click();
              }
            } catch (e) {}

            // Scroll the user to the success card so they see the
            // confirmation even if the page is long.
            setTimeout(() => {
              const sec = document.getElementById('assignmentSection');
              if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
          });
        }
      } else {
        // Re-upload handler — swap submitted state for upload form
        // in place, no reload.
        const resubmitBtn = document.getElementById('asgnResubmit');
        if (resubmitBtn) {
          resubmitBtn.addEventListener('click', () => {
            if (!confirm('Clear your current submission and upload again?')) return;
            ASSIGNMENTS.clearSubmission(weekId);
            // Re-render in place. If we have access to the parent
            // re-render function, use it; otherwise fall back to
            // reload for safety.
            try {
              if (typeof renderAssignmentSection === 'function') {
                renderAssignmentSection(weekId);
              } else {
                window.location.reload();
              }
            } catch (e) {
              window.location.reload();
            }
          });
        }
      }
    }

    // Update complete button with persistent progress
    const completeBtn = document.getElementById('completeBtn');
    if (completeBtn) {
      const isComplete = PROGRESS.isCompleted(weekId);
      completeBtn.classList.toggle('completed', isComplete);
      completeBtn.innerHTML = isComplete
        ? '&#10003; Week ' + lesson.week + ' Completed'
        : '&#9744; Mark Lesson ' + lesson.week + ' as Complete';

      completeBtn.addEventListener('click', function() {
        const wasComplete = PROGRESS.isCompleted(weekId);
        const nowComplete = PROGRESS.toggle(weekId);
        if (!wasComplete && nowComplete) {
          try { if (typeof ACTIVITY !== 'undefined') ACTIVITY.log('lesson_completed', weekId, 'W' + lesson.week + ': ' + lesson.title); } catch (e) {}
          if (typeof checkBadges === 'function') checkBadges();
          // Celebrate the moment — animated checkmark + confetti burst
          // from the button origin. Only fires on first-time completion
          // so re-clicking doesn't spam the user.
          if (typeof celebrateLessonComplete === 'function') {
            try { celebrateLessonComplete(this); } catch (e) {}
          }
        }
        this.classList.toggle('completed', nowComplete);
        this.innerHTML = nowComplete
          ? '&#10003; Week ' + lesson.week + ' Completed'
          : '&#9744; Mark Lesson ' + lesson.week + ' as Complete';

        // Update sidebar progress bar
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        if (progressFill) progressFill.style.width = PROGRESS.getPercentage() + '%';
        if (progressText) progressText.textContent = PROGRESS.getCompletedCount() + ' of 16 lessons completed (' + PROGRESS.getPercentage() + '%)';

        // Update sidebar icons
        document.querySelectorAll('.sidebar-lesson').forEach((link, i) => {
          const lid = weekIds[i];
          if (lid) {
            const iconEl = link.querySelector('.lesson-icon');
            const lessonData = allLessonsForSidebar.find(l => l.id === lid);
            if (iconEl && lessonData) {
              if (PROGRESS.isCompleted(lid)) {
                iconEl.textContent = '\u2705'; // green check
              } else {
                iconEl.textContent = lessonData.published ? '\u25B6' : '\u{1F512}';
              }
            }
          }
        });
      });
    }

    // Update lesson nav
    const lessonNav = document.querySelector('.lesson-nav');
    if (lessonNav) {
      const allLessons = LESSONS.getAll();
      const currIdx = allLessons.findIndex(l => l.id === weekId);
      const prev = currIdx > 0 ? allLessons[currIdx - 1] : null;
      const next = currIdx < allLessons.length - 1 ? allLessons[currIdx + 1] : null;
      lessonNav.innerHTML = (prev
        ? '<a href="lesson.html?week=' + prev.id + '">&#8592; W' + prev.week + ': ' + prev.title + '</a>'
        : '<a href="course.html">&#8592; Back to Program</a>')
        + (next
        ? '<a href="lesson.html?week=' + next.id + '" class="next">Next: W' + next.week + ' &#8594;</a>'
        : '<a href="course.html" class="next">Finish Program &#8594;</a>');
    }
  }

  // Update sidebar month titles with saved names
  document.querySelectorAll('.sidebar-module-title').forEach((el, i) => {
    const monthNum = i + 1;
    const name = LESSONS.getMonthName(monthNum);
    if (name) el.textContent = LESSONS.getMonthPrefix(monthNum) + ' \u2014 ' + name;
  });

  // Update sidebar active state + links + progress
  const sidebarLessonLinks = document.querySelectorAll('.sidebar-lesson');
  const allLessonsForSidebar = LESSONS.getAll();
  const weekIds = ['w1','w2','w3','w4','w5','w6','w7','w8','w9','w10','w11','w12','w13','w14','w15','w16'];

  sidebarLessonLinks.forEach((link, i) => {
    if (i < weekIds.length) {
      const lid = weekIds[i];
      const lessonData = allLessonsForSidebar.find(l => l.id === lid);
      link.href = 'lesson.html?week=' + lid;
      if (lid === weekId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
      // Update icon based on completed > published > locked
      const iconEl = link.querySelector('.lesson-icon');
      if (iconEl && lessonData) {
        if (PROGRESS.isCompleted(lid)) {
          iconEl.textContent = '\u2705';
        } else {
          iconEl.textContent = (lessonData.published === true) ? '\u25B6' : '\u{1F512}';
        }
      }
      // Update lesson title text from saved data
      if (lessonData) {
        const textNodes = link.childNodes;
        // Find the text node (not the icon span) and replace it
        let replaced = false;
        for (let n = 0; n < textNodes.length; n++) {
          if (textNodes[n].nodeType === 3 && textNodes[n].textContent.trim()) {
            textNodes[n].textContent = ' W' + lessonData.week + ': ' + lessonData.title;
            replaced = true;
            break;
          }
        }
        if (!replaced) {
          // If no text node found, set after icon
          const existingText = link.textContent.trim();
          if (iconEl) {
            link.innerHTML = '';
            link.appendChild(iconEl);
            link.appendChild(document.createTextNode(' W' + lessonData.week + ': ' + lessonData.title));
          }
        }
      }
    }
  });

  // Update progress bar with actual data
  const progressFill = document.querySelector('.progress-fill');
  const progressText = document.querySelector('.progress-text');
  if (progressFill) progressFill.style.width = PROGRESS.getPercentage() + '%';
  if (progressText) progressText.textContent = PROGRESS.getCompletedCount() + ' of 16 lessons completed (' + PROGRESS.getPercentage() + '%)';

  // Show certificate banner when all 16 lessons are completed
  function checkAndShowCertBanner() {
    const certSection = document.getElementById('lessonCertSection');
    if (!certSection) return;
    if (PROGRESS.getCompletedCount() >= 16) {
      certSection.style.display = 'block';
      certSection.innerHTML = '<div class="lesson-cert-banner">'
        + '<span class="cert-emoji"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg></span>'
        + '<h2>🎓 You\'re a Marketing Intern Graduate!</h2>'
        + '<p>You finished all 16 lessons. Your graduate certificate is ready to download.</p>'
        + '<button class="btn" id="lessonCertDownload"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Your Certificate</button>'
        + '</div>';

      document.getElementById('lessonCertDownload').addEventListener('click', () => {
        const name = AUTH.getDisplayName();
        const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const logoSrc = document.querySelector('.logo-icon img')?.src || '';
        const certHtml = '<!DOCTYPE html><html><head><title>Certificate - Sphere Academy</title>'
          + '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
          + '<style>'
          + '*{margin:0;padding:0;box-sizing:border-box;}'
          + 'body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;font-family:"Plus Jakarta Sans",sans-serif;padding:40px;}'
          + '.cert{width:900px;border-radius:20px;text-align:center;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.1);overflow:hidden;}'
          + '.cert-header{background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);padding:40px 60px;color:#fff;}'
          + '.cert-header img{width:60px;height:60px;object-fit:contain;margin:0 auto 12px;display:block;}'
          + '.cert-header h3{font-size:1.1rem;font-weight:600;opacity:0.9;letter-spacing:0.1em;text-transform:uppercase;}'
          + '.cert-body{padding:48px 60px;}'
          + '.cert-body .label{font-size:0.9rem;color:#64748b;text-transform:uppercase;letter-spacing:0.15em;font-weight:600;}'
          + '.cert-body h1{font-size:2rem;font-weight:800;color:#2563eb;margin:8px 0 32px;}'
          + '.cert-body .sub{font-size:0.95rem;color:#64748b;margin-bottom:12px;}'
          + '.cert-body .recipient{font-size:2.2rem;font-weight:700;color:#1e293b;margin:20px 0;padding-bottom:12px;border-bottom:3px solid #2563eb;display:inline-block;}'
          + '.cert-body .program{font-size:1.3rem;font-weight:700;color:#1e293b;margin:24px 0 4px;}'
          + '.cert-body .details{font-size:0.9rem;color:#64748b;margin-bottom:32px;}'
          + '.cert-footer{display:flex;justify-content:space-between;padding:24px 60px;border-top:1px solid #e2e8f0;font-size:0.82rem;color:#94a3b8;}'
          + '@media print{body{background:#fff;padding:0;}.cert{box-shadow:none;border-radius:0;width:100%;}}'
          + '</style></head><body><div class="cert">'
          + '<div class="cert-header"><img src="' + logoSrc + '" alt="Sphere Academy"><h3>Sphere Academy</h3></div>'
          + '<div class="cert-body">'
          + '<p class="label">Certificate of Completion</p>'
          + '<h1>Marketing Intern Training Program</h1>'
          + '<p class="sub">This is to certify that</p>'
          + '<div class="recipient">' + name + '</div>'
          + '<p class="sub">has successfully completed the</p>'
          + '<p class="program">4-Month Marketing Intern Training Program</p>'
          + '<p class="details">16 Weekly Modules &bull; Creatives, Tools &amp; Ads Manager &bull; Sphere Academy</p>'
          + '</div>'
          + '<div class="cert-footer"><span>Issued on ' + date + '</span><span>Sphere Academy</span></div>'
          + '</div></body></html>';
        const blob = new Blob([certHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Sphere_Academy_Certificate_' + name.replace(/\s/g, '_') + '.html';
        a.click();
        URL.revokeObjectURL(url);
      });
    } else {
      certSection.style.display = 'none';
    }
  }

  checkAndShowCertBanner();

  // Also re-check after marking a lesson complete
  const origCompleteBtn = document.getElementById('completeBtn');
  if (origCompleteBtn) {
    origCompleteBtn.addEventListener('click', () => {
      setTimeout(checkAndShowCertBanner, 100);
    });
  }
}

// ===== ADMIN PANEL =====
if (currentPage === 'admin.html' && AUTH.isAdmin()) {
  let currentEditId = 'w1';

  function renderAdminSidebar() {
    const sidebar = document.getElementById('adminLessonList');
    if (!sidebar) return;
    const lessons = LESSONS.getAll();
    const months = [1, 2, 3, 4];
    let html = '';
    months.forEach(m => {
      html += '<div class="admin-sidebar-month">' + LESSONS.getMonthName(m) + '</div>';
      lessons.filter(l => l.month === m).forEach(l => {
        const isActive = l.id === currentEditId ? ' active' : '';
        const statusDot = l.published ? '<span class="admin-dot published"></span>' : '<span class="admin-dot draft"></span>';
        html += '<a class="admin-sidebar-lesson' + isActive + '" data-id="' + l.id + '">'
          + statusDot + 'W' + l.week + ': ' + l.title + '</a>';
      });
    });
    sidebar.innerHTML = html;

    // Click handlers
    sidebar.querySelectorAll('.admin-sidebar-lesson').forEach(el => {
      el.addEventListener('click', () => {
        currentEditId = el.dataset.id;
        loadLessonEditor(currentEditId);
        renderAdminSidebar();
      });
    });
  }

  function updateAdminStats() {
    const countEl = document.getElementById('adminPublishedCount');
    const totalEl = document.getElementById('adminTotalCount');
    if (countEl) countEl.textContent = LESSONS.getPublishedCount();
    if (totalEl) totalEl.textContent = '16';
  }

  function loadLessonEditor(id) {
    const lesson = LESSONS.get(id);
    if (!lesson) return;

    document.getElementById('editorWeekLabel').textContent = 'Lesson ' + lesson.week + ' — ' + LESSONS.getMonthPrefix(lesson.month);
    document.getElementById('editorTitle').value = lesson.title;
    document.getElementById('editorCategory').value = lesson.category;
    document.getElementById('editorDifficulty').value = lesson.difficulty;
    document.getElementById('editorVideoUrl').value = lesson.videoUrl;
    document.getElementById('editorVideoType').value = lesson.videoType;
    document.getElementById('editorDuration').value = lesson.duration;
    document.getElementById('editorProTip').value = lesson.proTip;
    document.getElementById('editorPublished').checked = lesson.published;

    // Assignment fields
    const asgn = lesson.assignment || { enabled: false, title: '', description: '', fileTypes: { image: true, video: false, pdf: false } };
    document.getElementById('editorAssignmentEnabled').checked = asgn.enabled;
    document.getElementById('editorAssignmentTitle').value = asgn.title || '';
    document.getElementById('editorAssignmentDesc').value = asgn.description || '';
    document.getElementById('editorAssignmentImage').checked = asgn.fileTypes ? asgn.fileTypes.image !== false : true;
    document.getElementById('editorAssignmentVideo').checked = asgn.fileTypes ? asgn.fileTypes.video === true : false;
    document.getElementById('editorAssignmentPdf').checked = asgn.fileTypes ? asgn.fileTypes.pdf === true : false;

    // Toggle assignment fields visibility
    const asgnFields = document.getElementById('assignmentEditorFields');
    if (asgnFields) asgnFields.style.display = asgn.enabled ? 'block' : 'none';

    // Quiz fields
    const quiz = lesson.quiz || { enabled: false, passScore: 70, questions: [] };
    document.getElementById('editorQuizEnabled').checked = quiz.enabled;
    document.getElementById('editorQuizPassScore').value = quiz.passScore || 70;
    const quizFields = document.getElementById('quizEditorFields');
    if (quizFields) quizFields.style.display = quiz.enabled ? 'block' : 'none';
    renderQuizQuestions(quiz.questions || []);

    // Video preview
    updateVideoPreview();

    // Sections
    renderSections(lesson.sections || []);

    // Takeaways
    renderTakeaways(lesson.keyTakeaways || []);
  }

  function updateVideoPreview() {
    const preview = document.getElementById('videoPreview');
    const url = document.getElementById('editorVideoUrl').value.trim();
    const type = document.getElementById('editorVideoType').value;
    if (!preview) return;
    if (!url) {
      preview.innerHTML = '<div class="admin-video-empty"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg> Paste a video URL above to preview</div>';
      return;
    }
    const tempLesson = { videoUrl: url, videoType: type };
    const thumbHtml = LESSONS.getVideoEmbed(tempLesson, false);
    if (!thumbHtml) {
      preview.innerHTML = '<div class="admin-video-empty">&#9888; Could not load video preview</div>';
      return;
    }
    preview.innerHTML = thumbHtml;

    // Click thumbnail to play inline (embed instead of opening new tab)
    const thumbPlayer = preview.querySelector('.yt-thumb-player');
    if (thumbPlayer) {
      thumbPlayer.addEventListener('click', () => {
        preview.innerHTML = LESSONS.getVideoEmbed(tempLesson, true);
      });
    }
  }

  function renderSections(sections) {
    const container = document.getElementById('sectionsContainer');
    if (!container) return;
    container.innerHTML = '';
    sections.forEach((sec, i) => {
      addSectionBlock(sec.heading, sec.content, i);
    });
  }

  function addSectionBlock(heading, content, index) {
    const container = document.getElementById('sectionsContainer');
    const div = document.createElement('div');
    div.className = 'admin-section-block';
    div.innerHTML = '<div class="admin-section-header">'
      + '<span>Section ' + (index + 1) + '</span>'
      + '<button type="button" class="admin-section-remove" title="Remove section">&#10005;</button></div>'
      + '<input type="text" class="section-heading" placeholder="Section heading (e.g. What is Digital Marketing?)" value="' + (heading || '').replace(/"/g, '&quot;') + '">'
      + '<textarea class="section-content" rows="4" placeholder="Section content...">' + (content || '') + '</textarea>';
    container.appendChild(div);

    div.querySelector('.admin-section-remove').addEventListener('click', () => {
      div.remove();
      // Re-number
      container.querySelectorAll('.admin-section-block').forEach((b, i) => {
        b.querySelector('.admin-section-header span').textContent = 'Section ' + (i + 1);
      });
    });
  }

  function renderTakeaways(takeaways) {
    const container = document.getElementById('takeawaysContainer');
    if (!container) return;
    container.innerHTML = '';
    takeaways.forEach((t) => {
      addTakeawayInput(t);
    });
  }

  function addTakeawayInput(value) {
    const container = document.getElementById('takeawaysContainer');
    const div = document.createElement('div');
    div.className = 'admin-takeaway-row';
    div.innerHTML = '<input type="text" class="takeaway-input" placeholder="Key takeaway point..." value="' + (value || '').replace(/"/g, '&quot;') + '">'
      + '<button type="button" class="admin-section-remove" title="Remove">&#10005;</button>';
    container.appendChild(div);

    div.querySelector('.admin-section-remove').addEventListener('click', () => div.remove());
  }

  function saveLessonFromEditor() {
    const sections = [];
    document.querySelectorAll('.admin-section-block').forEach(block => {
      const heading = block.querySelector('.section-heading').value.trim();
      const content = block.querySelector('.section-content').value.trim();
      if (heading || content) sections.push({ heading, content });
    });

    const takeaways = [];
    document.querySelectorAll('.takeaway-input').forEach(input => {
      const val = input.value.trim();
      if (val) takeaways.push(val);
    });

    const lesson = {
      id: currentEditId,
      title: document.getElementById('editorTitle').value.trim(),
      category: document.getElementById('editorCategory').value,
      difficulty: document.getElementById('editorDifficulty').value,
      videoUrl: document.getElementById('editorVideoUrl').value.trim(),
      videoType: document.getElementById('editorVideoType').value,
      duration: document.getElementById('editorDuration').value.trim(),
      proTip: document.getElementById('editorProTip').value.trim(),
      published: document.getElementById('editorPublished').checked,
      sections: sections,
      keyTakeaways: takeaways,
      assignment: {
        enabled: document.getElementById('editorAssignmentEnabled').checked,
        title: document.getElementById('editorAssignmentTitle').value.trim(),
        description: document.getElementById('editorAssignmentDesc').value.trim(),
        fileTypes: {
          image: document.getElementById('editorAssignmentImage').checked,
          video: document.getElementById('editorAssignmentVideo').checked,
          pdf: document.getElementById('editorAssignmentPdf').checked
        }
      },
      quiz: {
        enabled: document.getElementById('editorQuizEnabled').checked,
        passScore: parseInt(document.getElementById('editorQuizPassScore').value) || 70,
        questions: collectQuizQuestions()
      }
    };

    LESSONS.save(lesson);
    updateAdminStats();
    renderAdminSidebar();

    // Show toast
    const toast = document.getElementById('adminToast');
    if (toast) {
      toast.style.display = 'flex';
      setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }
  }

  // Add section button
  const addSectionBtn = document.getElementById('addSectionBtn');
  if (addSectionBtn) {
    addSectionBtn.addEventListener('click', () => {
      const count = document.querySelectorAll('.admin-section-block').length;
      addSectionBlock('', '', count);
    });
  }

  // Add takeaway button
  const addTakeawayBtn = document.getElementById('addTakeawayBtn');
  if (addTakeawayBtn) {
    addTakeawayBtn.addEventListener('click', () => addTakeawayInput(''));
  }

  // Save button
  const saveBtn = document.getElementById('adminSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveLessonFromEditor);
  }

  // Preview button
  const previewBtn = document.getElementById('adminPreviewBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      saveLessonFromEditor();
      window.open('lesson.html?week=' + currentEditId, '_blank');
    });
  }

  // Assignment enabled toggle -> show/hide fields
  const asgnToggle = document.getElementById('editorAssignmentEnabled');
  if (asgnToggle) {
    asgnToggle.addEventListener('change', () => {
      const asgnFields = document.getElementById('assignmentEditorFields');
      if (asgnFields) asgnFields.style.display = asgnToggle.checked ? 'block' : 'none';
    });
  }

  // Quiz enabled toggle -> show/hide fields
  const quizToggle = document.getElementById('editorQuizEnabled');
  if (quizToggle) {
    quizToggle.addEventListener('change', () => {
      const quizFields = document.getElementById('quizEditorFields');
      if (quizFields) quizFields.style.display = quizToggle.checked ? 'block' : 'none';
    });
  }

  // Add quiz question button
  const addQuizQBtn = document.getElementById('addQuizQuestionBtn');
  if (addQuizQBtn) {
    addQuizQBtn.addEventListener('click', () => {
      addQuizQuestionBlock({ question: '', options: ['', '', '', ''], correctIndex: 0 });
    });
  }

  // Quiz editor functions
  function renderQuizQuestions(questions) {
    const container = document.getElementById('quizQuestionsContainer');
    if (!container) return;
    container.innerHTML = '';
    questions.forEach((q, i) => addQuizQuestionBlock(q, i));
  }

  function addQuizQuestionBlock(data, index) {
    const container = document.getElementById('quizQuestionsContainer');
    if (!container) return;
    const idx = index !== undefined ? index : container.querySelectorAll('.admin-quiz-question').length;
    const div = document.createElement('div');
    div.className = 'admin-quiz-question';
    const qName = 'quiz_q_' + Date.now() + '_' + idx;

    let optionsHtml = '';
    const opts = data.options || ['', '', '', ''];
    opts.forEach((opt, oi) => {
      const checked = oi === (data.correctIndex || 0) ? ' checked' : '';
      optionsHtml += '<div class="admin-quiz-option-row">'
        + '<input type="radio" name="' + qName + '" value="' + oi + '"' + checked + '>'
        + '<input type="text" class="quiz-opt-input" placeholder="Option ' + (oi + 1) + '" value="' + (opt || '').replace(/"/g, '&quot;') + '">'
        + '<span class="correct-label">' + (oi === (data.correctIndex || 0) ? '&#10003; Correct' : '') + '</span>'
        + '</div>';
    });

    div.innerHTML = '<div class="admin-quiz-question-header">'
      + '<span>Question ' + (idx + 1) + '</span>'
      + '<button type="button" class="admin-section-remove" title="Remove">&#10005;</button>'
      + '</div>'
      + '<div class="form-group"><input type="text" class="quiz-q-input" placeholder="Enter question..." value="' + (data.question || '').replace(/"/g, '&quot;') + '"></div>'
      + '<div class="quiz-options-editor">' + optionsHtml + '</div>';
    container.appendChild(div);

    // Remove handler
    div.querySelector('.admin-section-remove').addEventListener('click', () => {
      div.remove();
      renumberQuizQuestions();
    });

    // Radio change -> update correct labels
    div.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        div.querySelectorAll('.correct-label').forEach((lbl, li) => {
          lbl.innerHTML = li === parseInt(radio.value) ? '&#10003; Correct' : '';
        });
      });
    });
  }

  function renumberQuizQuestions() {
    const container = document.getElementById('quizQuestionsContainer');
    if (!container) return;
    container.querySelectorAll('.admin-quiz-question').forEach((block, i) => {
      block.querySelector('.admin-quiz-question-header span').textContent = 'Question ' + (i + 1);
    });
  }

  function collectQuizQuestions() {
    const questions = [];
    document.querySelectorAll('.admin-quiz-question').forEach(block => {
      const q = block.querySelector('.quiz-q-input')?.value.trim() || '';
      const opts = [];
      block.querySelectorAll('.quiz-opt-input').forEach(input => opts.push(input.value.trim()));
      const correctRadio = block.querySelector('input[type="radio"]:checked');
      const correctIndex = correctRadio ? parseInt(correctRadio.value) : 0;
      if (q) questions.push({ question: q, options: opts, correctIndex: correctIndex });
    });
    return questions;
  }

  // Video URL change -> preview
  const videoUrlInput = document.getElementById('editorVideoUrl');
  const videoTypeInput = document.getElementById('editorVideoType');
  if (videoUrlInput) videoUrlInput.addEventListener('input', updateVideoPreview);
  if (videoTypeInput) videoTypeInput.addEventListener('change', updateVideoPreview);

  // ===== ADMIN TABS =====
  const adminTabs = document.querySelectorAll('.admin-tab');
  const adminTabPanels = document.querySelectorAll('.admin-tab-panel');
  adminTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      adminTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      adminTabPanels.forEach(p => {
        p.style.display = 'none';
        p.classList.remove('active');
      });
      const target = document.getElementById('adminTab-' + tabId);
      if (target) {
        target.style.display = 'block';
        target.classList.add('active');
      }
    });
  });

  // ===== COURSE CARD IMAGE UPLOAD =====
  function loadCardImages() {
    for (let m = 1; m <= 4; m++) {
      const imgData = safeGetItem('card_image_' + m);
      const imgEl = document.getElementById('cardImg' + m);
      const removeBtn = document.getElementById('cardRemove' + m);
      if (imgData && imgEl) {
        imgEl.src = imgData;
        imgEl.style.display = 'block';
        if (removeBtn) removeBtn.style.display = 'block';
      }
    }
  }

  function handleCardUpload(month) {
    const input = document.getElementById('cardUpload' + month);
    if (!input) return;
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      if (file.size > 3 * 1024 * 1024) {
        const toast = document.getElementById('adminToast');
        if (toast) {
          toast.innerHTML = '<span>&#9888;</span> Image must be under 3MB';
          toast.style.display = 'flex';
          setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 600;
          const scale = Math.min(maxW / img.width, 1);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          safeSetItem('card_image_' + month, dataUrl);
          if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveCardImage(month, dataUrl);
          const imgEl = document.getElementById('cardImg' + month);
          if (imgEl) { imgEl.src = dataUrl; imgEl.style.display = 'block'; }
          const removeBtn = document.getElementById('cardRemove' + month);
          if (removeBtn) removeBtn.style.display = 'block';
          const toast = document.getElementById('adminToast');
          if (toast) {
            toast.innerHTML = '<span>&#10003;</span> Month ' + month + ' card image updated!';
            toast.style.display = 'flex';
            setTimeout(() => { toast.style.display = 'none'; }, 3000);
          }
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function handleCardRemove(month) {
    const btn = document.getElementById('cardRemove' + month);
    if (!btn) return;
    btn.addEventListener('click', () => {
      localStorage.removeItem('card_image_' + month);
      localStorage.removeItem('card_image_pos_' + month);
      if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.removeCardImage(month);
      const imgEl = document.getElementById('cardImg' + month);
      if (imgEl) { imgEl.src = ''; imgEl.style.display = 'none'; }
      btn.style.display = 'none';
    });
  }

  for (let m = 1; m <= 4; m++) {
    handleCardUpload(m);
    handleCardRemove(m);
  }
  loadCardImages();

  // ===== DRAG TO REPOSITION CARD IMAGES =====
  // Uses object-position-y as a percentage (0% = top of source image
  // visible, 100% = bottom). Works hand-in-hand with object-fit: cover
  // so the cover-crop frame is identical to what the student sees.
  function initImageDrag(month) {
    const imgEl = document.getElementById('cardImg' + month);
    if (!imgEl) return;

    const posKey = 'card_image_pos_' + month;
    let isDragging = false;
    let startY = 0;
    let startPct = 50;

    function applyPct(pct) {
      const v = Math.max(0, Math.min(100, pct));
      imgEl.style.objectPosition = 'center ' + v + '%';
    }

    function readSavedPct() {
      const saved = safeGetItem(posKey);
      if (saved == null || saved === '') return 50;
      const n = parseFloat(saved);
      if (isNaN(n)) return 50;
      // Old format stored negative pixels (e.g. "-150"). Detect that
      // and fall back to centred so the legacy values don't break the
      // new percentage system.
      if (n < 0 || n > 100) return 50;
      return n;
    }

    function loadPos() {
      if (imgEl.style.display === 'none') return;
      applyPct(readSavedPct());
    }

    imgEl.addEventListener('load', loadPos);
    loadPos();

    imgEl.addEventListener('mousedown', (e) => {
      if (imgEl.style.display === 'none') return;
      e.preventDefault();
      isDragging = true;
      startY = e.clientY;
      startPct = readSavedPct();
      imgEl.classList.add('dragging');
      imgEl.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const container = imgEl.parentElement;
      const containerH = container.offsetHeight || 1;
      // Drag up/down by the visible frame height = 100% pan range.
      const dy = e.clientY - startY;
      const newPct = startPct - (dy / containerH) * 100;
      applyPct(newPct);
    });

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      imgEl.classList.remove('dragging');
      imgEl.style.cursor = 'grab';
      // Read current value back off the element so we save the same
      // percentage we just rendered.
      const match = /center\s+([\d.]+)%/.exec(imgEl.style.objectPosition || '');
      const pct = match ? parseFloat(match[1]) : 50;
      safeSetItem(posKey, String(pct));
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(DATA_SYNC.COLLECTION).doc('card_images').set({
          ['month_' + month + '_pos']: pct
        }, { merge: true }).catch(e => console.error('Pos sync failed:', e));
      }
    }

    document.addEventListener('mouseup', endDrag);

    // Touch support for mobile
    imgEl.addEventListener('touchstart', (e) => {
      if (imgEl.style.display === 'none') return;
      isDragging = true;
      startY = e.touches[0].clientY;
      startPct = readSavedPct();
      imgEl.classList.add('dragging');
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const container = imgEl.parentElement;
      const containerH = container.offsetHeight || 1;
      const dy = e.touches[0].clientY - startY;
      const newPct = startPct - (dy / containerH) * 100;
      applyPct(newPct);
    }, { passive: true });

    document.addEventListener('touchend', endDrag);
  }

  for (let m = 1; m <= 4; m++) {
    initImageDrag(m);
  }

  // Load & save card emojis
  const defaultEmojis = { 1: '✎', 2: '⚡', 3: '⚙', 4: '▲' };
  const savedEmojis = safeGetJSON('site_card_emojis', defaultEmojis);

  for (let m = 1; m <= 4; m++) {
    const iconEl = document.getElementById('cardIcon' + m);
    if (iconEl) {
      // Load saved emoji
      if (savedEmojis[m] || savedEmojis[String(m)]) {
        iconEl.textContent = savedEmojis[m] || savedEmojis[String(m)];
      }
      // Auto-save on edit
      iconEl.addEventListener('input', () => {
        const emojis = safeGetJSON('site_card_emojis', defaultEmojis);
        emojis[m] = iconEl.textContent.trim();
        safeSetItem('site_card_emojis', JSON.stringify(emojis));
        if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveCardEmojis(emojis);
      });
      // Prevent line breaks
      iconEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault();
      });
    }
  }

  // Update card month labels with saved names
  const cardMonthLabels = document.querySelectorAll('.card-month-label');
  const cardMonthNames = LESSONS.getMonthNames();
  cardMonthLabels.forEach(label => {
    const m = label.dataset.month;
    const name = cardMonthNames[m] || cardMonthNames[String(m)];
    if (name) label.textContent = LESSONS.getMonthPrefix(m) + ': ' + name;
  });

  // Populate category dropdown from saved month names
  const catSelect = document.getElementById('editorCategory');
  if (catSelect) {
    const monthNames = LESSONS.getMonthNames();
    catSelect.innerHTML = '';
    for (let m = 1; m <= 4; m++) {
      const name = monthNames[m] || monthNames[String(m)] || 'Month ' + m;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      catSelect.appendChild(opt);
    }
  }

  // Init admin
  renderAdminSidebar();
  updateAdminStats();
  loadLessonEditor(currentEditId);
}

// ===== PROFILE PAGE =====
const profileForm = document.getElementById('profileForm');
const accountForm = document.getElementById('accountForm');
const avatarUpload = document.getElementById('avatarUpload');
const avatarRemove = document.getElementById('avatarRemove');
const profileToast = document.getElementById('profileToast');

// Protect profile page
if (currentPage === 'profile.html') {
  AUTH.requireAuth();
}

// Profile page tab navigation
const profileNavItems = document.querySelectorAll('.profile-nav-item');
const profileSections = document.querySelectorAll('.profile-section');

profileNavItems.forEach(item => {
  item.addEventListener('click', () => {
    const sectionId = item.dataset.section;
    profileNavItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    profileSections.forEach(s => {
      s.classList.remove('active');
      if (s.id === 'section-' + sectionId) s.classList.add('active');
    });
    // Lazy-render the Saved section on demand
    if (sectionId === 'saved' && typeof renderSavedSection === 'function') {
      renderSavedSection();
    }
  });
});

// Load profile data into form
function loadProfile() {
  const profile = AUTH.getProfile();
  const avatarImg = AUTH.getAvatarImage();

  // Fill form fields
  const fields = {
    profileFirstName: profile.firstName || '',
    profileLastName: profile.lastName || '',
    profileEmail: profile.email || '',
    profilePhone: profile.phone || '',
    profileRole: profile.role || 'Marketing Intern',
    profileStartDate: profile.startDate || '',
    profileBio: profile.bio || '',
    accountUsername: AUTH.getUser() || ''
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });

  // Update sidebar display
  const sidebarName = document.getElementById('sidebarName');
  const sidebarRole = document.getElementById('sidebarRole');
  if (sidebarName) sidebarName.textContent = AUTH.getDisplayName();
  if (sidebarRole) sidebarRole.textContent = profile.role || 'Marketing Intern';

  // Update avatar
  const avatarInitials = document.getElementById('avatarInitials');
  const avatarImgEl = document.getElementById('avatarImg');

  if (avatarInitials) avatarInitials.textContent = AUTH.getInitials();

  if (avatarImg && avatarImgEl) {
    avatarImgEl.src = avatarImg;
    avatarImgEl.style.display = 'block';
    if (avatarRemove) avatarRemove.style.display = 'block';
  } else if (avatarImgEl) {
    avatarImgEl.style.display = 'none';
    if (avatarRemove) avatarRemove.style.display = 'none';
  }
}

// Show toast notification
function showProfileToast(message) {
  if (!profileToast) return;
  profileToast.innerHTML = '<span>&#10003;</span> ' + message;
  profileToast.style.display = 'flex';
  setTimeout(() => {
    profileToast.style.display = 'none';
  }, 3000);
}

// Handle avatar upload
if (avatarUpload) {
  avatarUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      showProfileToast('Image must be under 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Resize image to reduce localStorage usage
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Center crop
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        // Persist BOTH the active session key AND a per-username key
        // so logging out → logging back in keeps the same picture.
        safeSetItem('auth_avatar', dataUrl);
        const _user = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : '';
        if (_user) safeSetItem('avatar_' + _user, dataUrl);
        // The user just uploaded their OWN photo — clear the
        // "default Sphere logo" flag so UI like the hero trust
        // strip starts showing this avatar as a real student photo.
        if (_user) {
          try { localStorage.removeItem('avatar_is_default_' + _user); } catch (e) {}
        }
        // Push to Firestore so the avatar follows the user across
        // browsers / devices (lives on the same sphere_users doc).
        // Explicitly set avatarIsDefault: false to clear any prior
        // logo-default flag on the doc.
        try {
          if (_user && typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
            DATA_SYNC.db.collection('sphere_users').doc(_user).set(
              { avatar: dataUrl, avatarIsDefault: false }, { merge: true }
            ).catch(e => console.warn('[AVATAR] sync:', e.message));
          }
        } catch (e) {}

        // Update display
        const avatarImgEl = document.getElementById('avatarImg');
        if (avatarImgEl) {
          avatarImgEl.src = dataUrl;
          avatarImgEl.style.display = 'block';
        }
        if (avatarRemove) avatarRemove.style.display = 'block';
        showProfileToast('Profile photo updated!');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Handle avatar remove
if (avatarRemove) {
  avatarRemove.addEventListener('click', () => {
    localStorage.removeItem('auth_avatar');
    const _user = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : '';
    if (_user) localStorage.removeItem('avatar_' + _user);
    // Strip from Firestore too so it doesn't come back on next login
    try {
      if (_user && typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db && typeof firebase !== 'undefined') {
        DATA_SYNC.db.collection('sphere_users').doc(_user).set(
          { avatar: firebase.firestore.FieldValue.delete() }, { merge: true }
        ).catch(() => {});
      }
    } catch (e) {}
    const avatarImgEl = document.getElementById('avatarImg');
    if (avatarImgEl) {
      avatarImgEl.src = '';
      avatarImgEl.style.display = 'none';
    }
    avatarRemove.style.display = 'none';
    showProfileToast('Profile photo removed');
  });
}

// Handle profile form submit
if (profileForm) {
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const profile = {
      firstName: document.getElementById('profileFirstName').value.trim(),
      lastName: document.getElementById('profileLastName').value.trim(),
      email: document.getElementById('profileEmail').value.trim(),
      phone: document.getElementById('profilePhone').value.trim(),
      role: document.getElementById('profileRole').value,
      startDate: document.getElementById('profileStartDate').value,
      bio: document.getElementById('profileBio').value.trim()
    };

    safeSetItem('auth_profile', JSON.stringify(profile));

    // Update sidebar
    const sidebarName = document.getElementById('sidebarName');
    const sidebarRole = document.getElementById('sidebarRole');
    if (sidebarName) sidebarName.textContent = AUTH.getDisplayName();
    if (sidebarRole) sidebarRole.textContent = profile.role;

    // Update avatar initials
    const avatarInitials = document.getElementById('avatarInitials');
    if (avatarInitials) avatarInitials.textContent = AUTH.getInitials();

    showProfileToast('Profile updated successfully!');
  });
}

// Handle account form submit
if (accountForm) {
  accountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newPass = document.getElementById('accountNewPassword').value;
    const confirmPass = document.getElementById('accountConfirmPassword').value;

    if (newPass && newPass !== confirmPass) {
      showProfileToast('Passwords do not match');
      return;
    }

    // Save preferences
    const prefs = {
      notifications: document.getElementById('prefNotifications').checked,
      weeklyReport: document.getElementById('prefWeeklyReport').checked
    };
    safeSetItem('auth_prefs', JSON.stringify(prefs));

    if (newPass) {
      document.getElementById('accountNewPassword').value = '';
      document.getElementById('accountConfirmPassword').value = '';
    }

    showProfileToast('Account settings saved!');
  });
}

// Handle cancel buttons
const profileCancelBtn = document.getElementById('profileCancel');
const accountCancelBtn = document.getElementById('accountCancel');

if (profileCancelBtn) {
  profileCancelBtn.addEventListener('click', () => loadProfile());
}
if (accountCancelBtn) {
  accountCancelBtn.addEventListener('click', () => {
    document.getElementById('accountNewPassword').value = '';
    document.getElementById('accountConfirmPassword').value = '';
  });
}

// Load profile on page load
if (currentPage === 'profile.html') {
  loadProfile();

  // Render the Achievements grid (full catalog with earned/locked states)
  function renderAchievements() {
    const grid = document.getElementById('achievementsGrid');
    const summary = document.getElementById('achievementsSummary');
    if (!grid || typeof BADGES === 'undefined') return;
    const all = BADGES.catalogWithStatus();
    const earnedCount = all.filter(b => b.earned).length;
    if (summary) summary.textContent = '(' + earnedCount + ' / ' + all.length + ' unlocked)';
    grid.innerHTML = all.map(b => {
      return '<div class="achievement-card' + (b.earned ? ' is-earned' : '') + '" title="' + b.desc.replace(/"/g, '&quot;') + '">'
        + '<div class="achievement-icon">' + b.icon + '</div>'
        + '<div class="achievement-meta">'
        +   '<div class="achievement-name">' + b.name + '</div>'
        +   '<div class="achievement-desc">' + b.desc + '</div>'
        + '</div>'
        + (b.earned ? '<div class="achievement-status">Unlocked</div>' : '<div class="achievement-status locked">Locked</div>')
        + '</div>';
    }).join('');
  }
  renderAchievements();
  // Run badge celebration check (catches anything earned passively)
  if (typeof checkBadges === 'function') checkBadges();

  // Update progress section with real data
  const completed = PROGRESS.getCompletedCount();
  const pct = PROGRESS.getPercentage();
  const currentMonth = completed <= 4 ? 1 : completed <= 8 ? 2 : completed <= 12 ? 3 : 4;

  const weeksEl = document.getElementById('progressWeeks');
  const pctEl = document.getElementById('progressPercent');
  const monthEl = document.getElementById('progressMonth');
  if (weeksEl) weeksEl.textContent = completed;
  if (pctEl) pctEl.textContent = pct + '%';
  if (monthEl) monthEl.textContent = LESSONS.getMonthPrefix(currentMonth);

  // Update timeline items
  const timelineItems = document.querySelectorAll('.progress-timeline-item');
  timelineItems.forEach((item, i) => {
    const monthNum = i + 1;
    const monthStart = (monthNum - 1) * 4 + 1;
    const monthEnd = monthNum * 4;
    const monthCompleted = Object.keys(PROGRESS.getAll()).filter(k => {
      const wn = parseInt(k.replace('w', ''));
      return wn >= monthStart && wn <= monthEnd && PROGRESS.isCompleted(k);
    }).length;
    const statusEl = item.querySelector('.progress-timeline-status');

    // Update the timeline month heading with custom prefix + name
    const headingEl = item.querySelector('h4');
    if (headingEl) {
      const monthName = LESSONS.getMonthName(monthNum);
      headingEl.textContent = LESSONS.getMonthPrefix(monthNum) + (monthName ? ': ' + monthName : '');
    }

    item.classList.remove('completed');
    if (monthCompleted === 4) {
      item.classList.add('completed');
      if (statusEl) statusEl.textContent = 'Completed';
    } else if (monthCompleted > 0) {
      item.classList.add('completed');
      if (statusEl) statusEl.textContent = monthCompleted + '/4 In Progress';
    } else if (currentMonth >= monthNum) {
      if (statusEl) statusEl.textContent = 'Not Started';
    } else {
      if (statusEl) statusEl.textContent = 'Locked';
    }
  });
}

// ===== BACK BUTTON =====
const backBtn = document.getElementById('backBtn');
if (backBtn) {
  backBtn.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'course.html';
    }
  });
}

// ===== PARALLAX ON HERO VISUAL =====
const heroVisual = document.querySelector('.hero-visual');
if (heroVisual) {
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (scrollY < 800) {
      heroVisual.style.transform = `translateY(${scrollY * 0.04}px)`;
    }
  });
}

// ===== GLOBAL SEARCH =====
// Searches across lessons, bonus courses, posts (wins/feed),
// members, announcements, and resources. Results are grouped by
// type with category headers and keyboard navigation (↑/↓/Enter).
const searchBtn = document.getElementById('searchBtn');
const searchOverlay = document.getElementById('searchOverlay');
const searchInput = document.getElementById('searchInput');
const searchClose = document.getElementById('searchClose');
const searchResults = document.getElementById('searchResults');

if (searchBtn && searchOverlay) {
  // Update placeholder to reflect the new scope
  if (searchInput && !searchInput.dataset.placeholderUpgraded) {
    searchInput.placeholder = 'Search lessons, posts, people, courses…';
    searchInput.dataset.placeholderUpgraded = '1';
  }

  searchBtn.addEventListener('click', () => {
    searchOverlay.classList.add('active');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
      // Show suggestions for an empty query (recent + top picks)
      if (!searchInput.value.trim()) renderSearchEmpty();
    }
  });

  if (searchClose) searchClose.addEventListener('click', () => searchOverlay.classList.remove('active'));
  searchOverlay.addEventListener('click', (e) => { if (e.target === searchOverlay) searchOverlay.classList.remove('active'); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') searchOverlay.classList.remove('active');
    // Global ⌘K / Ctrl+K to open search from anywhere
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchBtn.click();
    }
  });

  // ---- helpers ----
  function escHTML(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function highlight(text, q) {
    if (!q) return escHTML(text);
    const t = String(text || '');
    const lo = t.toLowerCase();
    const i = lo.indexOf(q.toLowerCase());
    if (i < 0) return escHTML(t);
    return escHTML(t.slice(0, i)) + '<mark>' + escHTML(t.slice(i, i + q.length)) + '</mark>' + escHTML(t.slice(i + q.length));
  }
  function safeBonusCourses() {
    try { return JSON.parse(localStorage.getItem('bonus_courses') || '[]') || []; }
    catch (_) { return []; }
  }
  function safeResources() {
    try { return JSON.parse(localStorage.getItem('sphere_resources') || '[]') || []; }
    catch (_) { return []; }
  }

  // SVG icons for each result type
  const ICONS = {
    lesson:   '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    bonus:    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    post:     '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    member:   '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    ann:      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-8v18l-18-8z"/></svg>',
    resource: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  };

  function renderSearchEmpty() {
    if (!searchResults) return;
    searchResults.innerHTML =
      '<div class="search-empty">'
      + '<div class="search-empty-title">Find anything across Sphere Academy</div>'
      + '<div class="search-empty-hints">'
      +   '<span>Lessons</span><span>Bonus courses</span><span>Posts</span>'
      +   '<span>People</span><span>Announcements</span><span>Resources</span>'
      + '</div>'
      + '<div class="search-shortcut-hint">Tip: press <kbd>⌘</kbd><kbd>K</kbd> from anywhere</div>'
      + '</div>';
  }

  function runSearch(query) {
    if (!searchResults) return;
    const q = query.trim().toLowerCase();
    if (!q) { renderSearchEmpty(); return; }

    const results = [];

    // -- Lessons --
    try {
      LESSONS.getAll().forEach(l => {
        const hay = [l.title, l.category, l.difficulty, l.assignment && l.assignment.title].filter(Boolean).join(' ').toLowerCase();
        if (hay.indexOf(q) >= 0) {
          results.push({
            type: 'lesson',
            href: 'lesson.html?week=' + l.id,
            title: 'W' + l.week + ': ' + l.title,
            sub:   'Month ' + l.month + ' • ' + l.category + ' • ' + l.difficulty,
            rank: hay.indexOf(q)
          });
        }
      });
    } catch (_) {}

    // -- Bonus courses & their lessons --
    try {
      safeBonusCourses().forEach(c => {
        const ctitle = c.title || c.name || 'Untitled';
        if (ctitle.toLowerCase().indexOf(q) >= 0 || (c.description || '').toLowerCase().indexOf(q) >= 0) {
          results.push({
            type: 'bonus',
            href: 'bonus-course.html?id=' + encodeURIComponent(c.id || ''),
            title: ctitle,
            sub:   'Bonus course' + (Array.isArray(c.lessons) ? ' • ' + c.lessons.length + ' lesson' + (c.lessons.length === 1 ? '' : 's') : ''),
            rank: 0
          });
        }
        if (Array.isArray(c.lessons)) {
          c.lessons.forEach(ln => {
            const lt = (ln.title || '').toLowerCase();
            if (lt && lt.indexOf(q) >= 0) {
              results.push({
                type: 'bonus',
                href: 'bonus-course.html?id=' + encodeURIComponent(c.id || '') + '&lesson=' + encodeURIComponent(ln.id || ''),
                title: ln.title,
                sub:   ctitle + ' • Bonus lesson',
                rank: 1
              });
            }
          });
        }
      });
    } catch (_) {}

    // -- Posts / Wins --
    try {
      if (typeof POSTS !== 'undefined' && POSTS.getAll) {
        POSTS.getAll().slice(0, 200).forEach(p => {
          const txt = (p.text || '').toLowerCase();
          const author = (p.displayName || p.username || '').toLowerCase();
          if (txt.indexOf(q) >= 0 || author.indexOf(q) >= 0) {
            const snippet = (p.text || '').slice(0, 100) + ((p.text || '').length > 100 ? '…' : '');
            results.push({
              type: 'post',
              href: 'dashboard.html#post=' + p.id,
              title: snippet || '(post with media)',
              sub:   (p.displayName || p.username || 'Member') + ' • ' + _searchTimeAgo(p.createdAt),
              rank: txt.indexOf(q) >= 0 ? txt.indexOf(q) : 50
            });
          }
        });
      }
    } catch (_) {}

    // -- Members --
    try {
      const members = (typeof _MEMBERS_CACHE !== 'undefined' && Array.isArray(_MEMBERS_CACHE))
        ? _MEMBERS_CACHE
        : [];
      members.forEach(u => {
        const dn = (u.displayName || '').toLowerCase();
        const un = (u.username || '').toLowerCase();
        if (dn.indexOf(q) >= 0 || un.indexOf(q) >= 0) {
          results.push({
            type: 'member',
            href: 'profile.html?u=' + encodeURIComponent(u.username || ''),
            title: u.displayName || u.username || 'Member',
            sub:   '@' + (u.username || '') + (u.role === 'admin' ? ' • Admin' : ''),
            avatar: u.avatar || null,
            initials: u.initials || (u.displayName || u.username || 'U').slice(0, 1).toUpperCase(),
            rank: dn.indexOf(q) >= 0 ? dn.indexOf(q) : un.indexOf(q)
          });
        }
      });
    } catch (_) {}

    // -- Announcements --
    try {
      if (typeof ANNOUNCEMENTS !== 'undefined' && ANNOUNCEMENTS.getAll) {
        ANNOUNCEMENTS.getAll().forEach(a => {
          const hay = ((a.title || '') + ' ' + (a.body || '')).toLowerCase();
          if (hay.indexOf(q) >= 0) {
            results.push({
              type: 'ann',
              href: 'dashboard.html#tab=announcements',
              title: a.title || 'Announcement',
              sub:   (a.authorName || 'Sphere') + ' • ' + _searchTimeAgo(a.createdAt),
              rank: hay.indexOf(q)
            });
          }
        });
      }
    } catch (_) {}

    // -- Resources (if any saved) --
    try {
      safeResources().forEach(r => {
        const hay = ((r.title || '') + ' ' + (r.description || '') + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) >= 0) {
          results.push({
            type: 'resource',
            href: r.url || 'dashboard.html#tab=resources',
            title: r.title || 'Resource',
            sub:   (r.category || 'Resource') + (r.kind ? ' • ' + r.kind : ''),
            rank: hay.indexOf(q),
            external: !!r.url
          });
        }
      });
    } catch (_) {}

    if (results.length === 0) {
      searchResults.innerHTML =
        '<div class="search-empty">'
        + '<div class="search-empty-title">No results for "' + escHTML(query) + '"</div>'
        + '<div class="search-empty-hint">Try a shorter keyword or a different page</div>'
        + '</div>';
      return;
    }

    // Group by type, preserve rank within group
    const order = ['lesson', 'bonus', 'post', 'member', 'ann', 'resource'];
    const labels = {
      lesson:   'Lessons',
      bonus:    'Bonus courses',
      post:     'Posts',
      member:   'People',
      ann:      'Announcements',
      resource: 'Resources'
    };
    const grouped = {};
    results.forEach(r => { (grouped[r.type] = grouped[r.type] || []).push(r); });
    Object.keys(grouped).forEach(k => grouped[k].sort((a, b) => (a.rank || 0) - (b.rank || 0)));

    let html = '';
    order.forEach(t => {
      const items = grouped[t];
      if (!items || items.length === 0) return;
      html += '<div class="search-group-label">' + labels[t] + ' <span class="search-group-count">' + items.length + '</span></div>';
      items.slice(0, 6).forEach(r => {
        const isExternal = r.external ? ' target="_blank" rel="noopener"' : '';
        let iconHTML;
        if (r.type === 'member' && r.avatar) {
          iconHTML = '<div class="search-result-icon search-result-avatar"><img src="' + escHTML(r.avatar) + '" alt=""></div>';
        } else if (r.type === 'member') {
          iconHTML = '<div class="search-result-icon search-result-avatar"><span>' + escHTML(r.initials) + '</span></div>';
        } else {
          iconHTML = '<div class="search-result-icon search-result-icon-' + r.type + '">' + ICONS[r.type] + '</div>';
        }
        html += '<a class="search-result-item" href="' + escHTML(r.href) + '"' + isExternal + ' data-type="' + r.type + '">'
          + iconHTML
          + '<div class="search-result-info"><h4>' + highlight(r.title, q) + '</h4><span>' + highlight(r.sub, q) + '</span></div>'
          + '</a>';
      });
    });

    searchResults.innerHTML = html;
  }

  // Debounce input → search
  if (searchInput) {
    let _searchT;
    searchInput.addEventListener('input', () => {
      clearTimeout(_searchT);
      _searchT = setTimeout(() => runSearch(searchInput.value), 80);
    });
    // Keyboard navigation: ↑ / ↓ / Enter
    searchInput.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
      const items = searchResults.querySelectorAll('.search-result-item');
      if (!items.length) return;
      let idx = -1;
      items.forEach((el, i) => { if (el.classList.contains('is-active')) idx = i; });
      if (e.key === 'Enter') {
        if (idx >= 0) { e.preventDefault(); items[idx].click(); }
        else if (items[0]) { e.preventDefault(); items[0].click(); }
        return;
      }
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? Math.min(items.length - 1, idx + 1)
        : Math.max(0, idx - 1);
      items.forEach(el => el.classList.remove('is-active'));
      items[next].classList.add('is-active');
      items[next].scrollIntoView({ block: 'nearest' });
    });
  }
}

// _timeAgo helper used by global search.
function _searchTimeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// ===== NOTIFICATIONS =====
// Slack-style chime — generated on the fly via Web Audio API so we
// don't need to ship an audio file. Two short tones (A5 → E6)
// that fade out in ~0.4s — soft, not jarring. Respects a user
// preference at localStorage.notif_sound === 'off'.
// Confetti + checkmark celebration when a lesson is marked complete
// for the first time. Particles burst from the button's center and
// fall with rotation. A success chime plays too. Auto-cleans up
// after ~1.6s.
function celebrateLessonComplete(originEl) {
  try { playSuccessChime(); } catch (_) {}
  if (!originEl) return;
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // Confetti burst
  const burst = document.createElement('div');
  burst.className = 'confetti-burst';
  burst.style.left = cx + 'px';
  burst.style.top = cy + 'px';
  const colors = ['#635bff', '#8b5cf6', '#c084fc', '#10b981', '#fbbf24', '#ec4899', '#06b6d4'];
  const count = 24;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.background = colors[i % colors.length];
    const angle = (Math.PI * 2 * i / count) + (Math.random() * 0.4 - 0.2);
    const dist = 90 + Math.random() * 90;
    p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
    p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    p.style.animationDelay = (Math.random() * 0.08) + 's';
    burst.appendChild(p);
  }
  document.body.appendChild(burst);
  setTimeout(function () { burst.remove(); }, 1700);

  // Big animated checkmark overlay — SVG with stroke-dashoffset
  // animation so the check draws itself.
  const check = document.createElement('div');
  check.className = 'lesson-complete-check';
  check.style.left = cx + 'px';
  check.style.top = cy + 'px';
  check.innerHTML = '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-18"/></svg>';
  document.body.appendChild(check);
  setTimeout(function () { check.remove(); }, 1700);
}

// Brighter success chime for lesson completion — major triad arpeggio
// (C5 → E5 → G5) that feels like an accomplishment.
function playSuccessChime() {
  try {
    if (localStorage.getItem('notif_sound') === 'off') return;
  } catch (_) {}
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach(function (freq, i) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.08;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
      o.start(t0);
      o.stop(t0 + 0.48);
    });
    setTimeout(function () { try { ctx.close(); } catch (_) {} }, 800);
  } catch (e) {}
}

function playNotifChime() {
  try {
    if (localStorage.getItem('notif_sound') === 'off') return;
  } catch (_) {}
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);                       // A5
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.09); // glide to E6
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.40);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.42);
    // Close the context after the tone ends so we don't leak
    setTimeout(function () { try { ctx.close(); } catch (_) {} }, 700);
  } catch (e) { /* audio blocked — silent fail */ }
}

const NOTIFS = {
  STORAGE_KEY: 'notifications',
  getAll() { return safeGetJSON(this.STORAGE_KEY, []); },
  add(text, icon, link) {
    const all = this.getAll();
    all.unshift({
      text,
      icon: icon || '&#128276;',
      time: new Date().toISOString(),
      read: false,
      link: link || ''
    });
    if (all.length > 30) all.pop();
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    // Re-render the bell badge + dropdown immediately so new alerts
    // surface without waiting for a manual refresh. Also play the
    // chime so users get an audio cue.
    if (typeof renderNotifications === 'function') {
      try { renderNotifications(); pulseBell(); playNotifChime(); } catch (e) {}
    }
  },
  markAllRead() {
    const all = this.getAll();
    all.forEach(n => n.read = true);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
  },
  getUnreadCount() { return this.getAll().filter(n => !n.read).length; }
};

// Brief shake-and-glow animation on the bell when a new notif lands.
function pulseBell() {
  const btn = document.getElementById('notifBtn');
  if (!btn) return;
  btn.classList.remove('notif-pulse');
  // Force reflow so re-adding the class restarts the animation
  void btn.offsetWidth;
  btn.classList.add('notif-pulse');
}

// Track which Firestore-synced item IDs we've already turned into a
// local notification, so the bell doesn't re-fire for the same item
// every time the listener replays the snapshot or the page reloads.
const SEEN_NOTIF_IDS = {
  KEY: 'seen_notif_ids',
  load() { return safeGetJSON(this.KEY, { posts: [], wins: [], announcements: [] }); },
  save(s) { safeSetItem(this.KEY, JSON.stringify(s)); },
  has(kind, id) {
    const s = this.load();
    return (s[kind] || []).indexOf(id) !== -1;
  },
  mark(kind, id) {
    const s = this.load();
    if (!s[kind]) s[kind] = [];
    if (s[kind].indexOf(id) === -1) {
      s[kind].push(id);
      // Cap each kind at the last 200 ids
      if (s[kind].length > 200) s[kind] = s[kind].slice(-200);
      this.save(s);
    }
  },
  // Seed every currently-known id as "seen" without firing notifs.
  // Used on first page load so users don't get blasted with N alerts
  // for posts that were already there before they showed up.
  seed(kind, ids) {
    const s = this.load();
    s[kind] = ids.slice();
    this.save(s);
  }
};

// Wire the community listeners (POSTS / WINS / ANNOUNCEMENTS) to fire
// NOTIFS.add when a NEW item from someone OTHER than the current user
// lands via the live snapshot.
//
// Strategy: use Firestore docChanges() to react to per-doc add/modify
// events. Anything created within the last GRACE_MS counts as "fresh"
// and triggers a notification; older items are silently marked seen.
// This survives the 1.5s setup window so a post landing just before
// the listener attaches still pings the user.
function startCommunityNotifListeners() {
  if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
  const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : '';
  const startTime = Date.now();
  const GRACE_MS = 5 * 60 * 1000; // 5-minute "fresh" window

  function wire(kind, collection, buildText, icon, link) {
    try {
      DATA_SYNC.db.collection(collection)
        .orderBy('createdAt', 'desc').limit(50)
        .onSnapshot(snap => {
          snap.docChanges().forEach(change => {
            if (change.type !== 'added') return; // only fire on inserts
            const data = change.doc.data() || {};
            const id = data.id || change.doc.id;
            if (!id) return;

            // Already notified this user about this item across sessions
            if (SEEN_NOTIF_IDS.has(kind, id)) return;

            const createdAt = typeof data.createdAt === 'number' ? data.createdAt : 0;
            // Old item — seed as seen, no notif
            if (createdAt && createdAt < startTime - GRACE_MS) {
              SEEN_NOTIF_IDS.mark(kind, id);
              return;
            }

            // It's fresh — record + maybe notify
            SEEN_NOTIF_IDS.mark(kind, id);
            // Skip the current user's own posts
            if (data.username && me && data.username === me) return;
            if (typeof NOTIFS !== 'undefined') {
              NOTIFS.add(buildText(data), icon, link);
              console.log('[NOTIFY ' + kind + '] fired for', id);
            }
          });
        }, err => console.warn('[NOTIFY ' + kind + '] listener:', err.message));
    } catch (e) { console.warn('[NOTIFY ' + kind + '] start:', e.message); }
  }

  wire('announcements', 'sphere_announcements',
    (a) => '<span class="notif-kind">Announcement</span> ' + (a.title || 'New announcement'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M3 11l18-8v18l-18-8z"/><path d="M11 13v8"/></svg>',
    'dashboard.html#tab=announcements');

  wire('posts', 'sphere_posts',
    (p) => '<span class="notif-kind">Feed</span> ' + (p.displayName || 'Someone') + ' posted',
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    'dashboard.html#tab=feed');

  wire('wins', 'sphere_wins',
    (w) => '<span class="notif-kind">Win</span> ' + (w.displayName || 'Someone') + ' celebrated: ' + (w.title || ''),
    '&#127942;',
    'dashboard.html#tab=wins');

  // Chat: only notify when the message mentions ME (otherwise the chat
  // would spam the bell on every line). Match on display name OR username.
  try {
    const myDisplayName = (typeof AUTH !== 'undefined' && AUTH.getDisplayName) ? AUTH.getDisplayName() : '';
    if (!me) return;
    DATA_SYNC.db.collection('sphere_chat')
      .orderBy('createdAt', 'desc').limit(50)
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const data = change.doc.data() || {};
          const id = data.id || change.doc.id;
          if (!id) return;
          if (SEEN_NOTIF_IDS.has('chat_mentions', id)) return;
          const createdAt = typeof data.createdAt === 'number' ? data.createdAt : 0;
          if (createdAt && createdAt < startTime - GRACE_MS) {
            SEEN_NOTIF_IDS.mark('chat_mentions', id);
            return;
          }
          SEEN_NOTIF_IDS.mark('chat_mentions', id);
          if (data.username && data.username === me) return; // skip my own messages
          const text = String(data.text || '');
          // Look for @<my display name> or @<my username>
          const mentionsMe =
            (myDisplayName && text.indexOf('@' + myDisplayName) !== -1) ||
            (me && text.indexOf('@' + me) !== -1);
          if (!mentionsMe) return;
          if (typeof NOTIFS !== 'undefined') {
            const author = data.displayName || 'Someone';
            const preview = text.length > 80 ? text.substring(0, 80) + '…' : text;
            NOTIFS.add(
              '<span class="notif-kind">Chat</span> ' + author + ' mentioned you: ' + preview,
              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
              'dashboard.html#tab=chat'
            );
            console.log('[NOTIFY chat_mentions] fired for', id);
          }
        });
      }, err => console.warn('[NOTIFY chat_mentions] listener:', err.message));
  } catch (e) { console.warn('[NOTIFY chat_mentions] start:', e.message); }

  // Direct messages — listen on conversations the user participates in
  // and notify whenever the latest message is from someone else.
  try {
    if (!me) return;
    DATA_SYNC.db.collection('sphere_dms')
      .where('participants', 'array-contains', me)
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type !== 'added' && change.type !== 'modified') return;
          const data = change.doc.data() || {};
          const convId = data.convId || change.doc.id;
          const lastFrom = data.lastFrom;
          const lastAt = typeof data.lastMessageAt === 'number' ? data.lastMessageAt : 0;
          if (!lastFrom || lastFrom === me) return;
          if (!lastAt || lastAt < startTime - GRACE_MS) return;
          // Dedupe by conversation+timestamp
          const dedupeId = convId + '_' + lastAt;
          if (SEEN_NOTIF_IDS.has('dms', dedupeId)) return;
          SEEN_NOTIF_IDS.mark('dms', dedupeId);
          if (typeof NOTIFS !== 'undefined') {
            const peer = (Array.isArray(data.participants) ? data.participants : []).find(p => p !== me) || lastFrom;
            const preview = String(data.lastMessage || '').slice(0, 80);
            NOTIFS.add(
              '<span class="notif-kind">DM</span> ' + peer + ' sent you a message: ' + preview,
              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
              'dashboard.html#dm=' + encodeURIComponent(peer)
            );
          }
        });
      }, err => console.warn('[NOTIFY dms] listener:', err.message));
  } catch (e) { console.warn('[NOTIFY dms] start:', e.message); }
}

if (typeof AUTH !== 'undefined' && AUTH.isLoggedIn && AUTH.isLoggedIn()) {
  // Give Firebase anon auth a moment to settle before we attach
  // listeners — otherwise reads can fail silently.
  setTimeout(startCommunityNotifListeners, 1500);
}

// Seed default notifications if empty
if (NOTIFS.getAll().length === 0) {
  NOTIFS.add('Welcome to Sphere Academy! Start with Lesson 1.', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>', 'lesson.html?week=w1');
  NOTIFS.add('Race to finish — paunahan matapos!', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>', 'course.html');
}

const notifBtn = document.getElementById('notifBtn');
const notifDropdown = document.getElementById('notifDropdown');
const notifBadge = document.getElementById('notifBadge');
const notifList = document.getElementById('notifList');

function renderNotifications() {
  const count = NOTIFS.getUnreadCount();
  if (notifBadge) {
    notifBadge.textContent = count;
    notifBadge.style.display = count > 0 ? 'flex' : 'none';
  }
  if (notifList) {
    const all = NOTIFS.getAll();
    if (all.length === 0) {
      notifList.innerHTML = '<div class="notif-empty">No notifications</div>';
    } else {
      notifList.innerHTML = all.slice(0, 10).map((n, idx) => {
        const date = new Date(n.time);
        const ago = Math.floor((Date.now() - date.getTime()) / 60000);
        const timeStr = ago < 60 ? ago + 'm ago' : ago < 1440 ? Math.floor(ago/60) + 'h ago' : Math.floor(ago/1440) + 'd ago';
        // Each notif is now a clickable button. data-link carries the
        // destination — handled by navigateToNotif() below so we can
        // do SPA-style tab switching when already on dashboard.
        const link = (n.link || '').replace(/"/g, '&quot;');
        const tag = link ? 'button' : 'div';
        const linkAttr = link ? ' data-link="' + link + '" data-idx="' + idx + '"' : '';
        return '<' + tag + ' type="button" class="notif-item' + (n.read ? '' : ' unread') + (link ? ' is-clickable' : '') + '"' + linkAttr + '>'
          + '<span class="notif-item-icon">' + n.icon + '</span>'
          + '<div class="notif-item-text"><strong>' + n.text + '</strong><span>' + timeStr + '</span></div>'
          + '</' + tag + '>';
      }).join('');

      // Wire click handlers on every linked notif
      notifList.querySelectorAll('.notif-item.is-clickable').forEach(el => {
        el.addEventListener('click', () => {
          const link = el.dataset.link;
          if (!link) return;
          // Close the dropdown immediately for snappy feedback
          const dd = document.getElementById('notifDropdown');
          if (dd) dd.classList.remove('active');
          navigateToNotif(link);
        });
      });
    }
  }
}

// Routes a notification's link to the right destination. When the user
// is already on dashboard.html and the link is a dashboard hash
// (#tab=X / #dm=X), switches the panel without reloading. Otherwise
// performs a full navigation.
function navigateToNotif(link) {
  if (!link) return;
  const onDashboard = (typeof currentPage !== 'undefined' && currentPage === 'dashboard.html')
    || /\bdashboard\.html\b/.test(window.location.pathname);
  // Same-page hash navigation when on dashboard
  if (onDashboard && link.indexOf('dashboard.html') !== -1) {
    const hashMatch = /#(.+)$/.exec(link);
    if (hashMatch) {
      const hash = '#' + hashMatch[1];
      // Update URL so refreshes preserve the deep link
      try { history.replaceState(null, '', window.location.pathname + hash); } catch (e) {}
      // Tab switch
      const tabMatch = /tab=([^&]+)/.exec(hashMatch[1]);
      if (tabMatch) {
        const tab = decodeURIComponent(tabMatch[1]);
        const link = document.querySelector('.dash-sidebar-link[data-tab="' + tab + '"]');
        if (link) { link.click(); return; }
      }
      // DM open
      const dmMatch = /dm=([^&]+)/.exec(hashMatch[1]);
      if (dmMatch && typeof openDMConversation === 'function') {
        const peer = decodeURIComponent(dmMatch[1]);
        openDMConversation(peer, peer, null);
        return;
      }
    }
  }
  // Default: full navigation
  window.location.href = link;
}

if (notifBtn && notifDropdown) {
  renderNotifications();
  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = notifDropdown.classList.toggle('active');
    if (isOpen) {
      NOTIFS.markAllRead();
      renderNotifications();
      // Position dropdown
      const rect = notifBtn.getBoundingClientRect();
      notifDropdown.style.position = 'fixed';
      notifDropdown.style.top = (rect.bottom + 8) + 'px';
      notifDropdown.style.right = (window.innerWidth - rect.right) + 'px';
    }
  });
  document.addEventListener('click', () => notifDropdown.classList.remove('active'));
}

// ===== Q&A / COMMENTS =====
const QA = {
  STORAGE_KEY: 'lesson_qa',
  getAll(weekId) { return safeGetJSON(this.STORAGE_KEY, {})[weekId] || []; },
  add(weekId, text) {
    const all = safeGetJSON(this.STORAGE_KEY, {});
    if (!all[weekId]) all[weekId] = [];
    all[weekId].push({
      user: AUTH.getDisplayName(),
      initials: AUTH.getInitials(),
      text: text,
      date: new Date().toISOString()
    });
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
  }
};

if (currentPage === 'lesson.html') {
  const params2 = new URLSearchParams(window.location.search);
  const weekId2 = params2.get('week') || 'w1';
  const qaInput = document.getElementById('qaInput');
  const qaSubmitBtn = document.getElementById('qaSubmitBtn');
  const qaComments = document.getElementById('qaComments');

  function renderQA() {
    if (!qaComments) return;
    const comments = QA.getAll(weekId2);
    if (comments.length === 0) {
      qaComments.innerHTML = '<div class="qa-empty">No comments yet. Be the first to ask a question!</div>';
      return;
    }
    qaComments.innerHTML = comments.map(c => {
      const date = new Date(c.date);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return '<div class="qa-comment">'
        + '<div class="qa-comment-avatar">' + c.initials + '</div>'
        + '<div class="qa-comment-body">'
        + '<span class="qa-comment-name">' + c.user + '</span>'
        + '<span class="qa-comment-date">' + dateStr + '</span>'
        + '<p class="qa-comment-text">' + c.text.replace(/</g, '&lt;') + '</p>'
        + '</div></div>';
    }).join('');
  }

  renderQA();

  if (qaSubmitBtn && qaInput) {
    qaSubmitBtn.addEventListener('click', () => {
      const text = qaInput.value.trim();
      if (!text) return;
      QA.add(weekId2, text);
      qaInput.value = '';
      renderQA();
    });
  }
}

// ===== STREAK TRACKER =====
const STREAK = {
  STORAGE_KEY: 'learning_streak',
  getData() { return safeGetJSON(this.STORAGE_KEY, { count: 0, lastDate: null }); },
  recordActivity() {
    const data = this.getData();
    const today = new Date().toDateString();
    if (data.lastDate === today) return data.count;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (data.lastDate === yesterday) {
      data.count++;
    } else if (data.lastDate !== today) {
      data.count = 1;
    }
    data.lastDate = today;
    safeSetItem(this.STORAGE_KEY, JSON.stringify(data));
    return data.count;
  },
  getCount() {
    const data = this.getData();
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (data.lastDate === today || data.lastDate === yesterday) return data.count;
    return 0;
  }
};

// Record activity on lesson pages
if (currentPage === 'lesson.html' && AUTH.isLoggedIn()) {
  STREAK.recordActivity();
}

// Show streak on profile page
if (currentPage === 'profile.html') {
  const streakCard = document.getElementById('streakCard');
  const streakCount = document.getElementById('streakCount');
  const streak = STREAK.getCount();
  if (streakCard && streak > 0) {
    streakCard.style.display = 'flex';
    if (streakCount) streakCount.textContent = streak + '-day streak!';
  }
}

// ===== CERTIFICATE =====
if (currentPage === 'profile.html') {
  const completed = PROGRESS.getCompletedCount();
  const pct = PROGRESS.getPercentage();
  const certCard = document.getElementById('certificateCard');
  const certIcon = document.getElementById('certIcon');
  const certTitle = document.getElementById('certTitle');
  const certDesc = document.getElementById('certDesc');
  const certFill = document.getElementById('certProgressFill');
  const certText = document.getElementById('certProgressText');
  const certDownload = document.getElementById('certDownloadBtn');

  if (certFill) certFill.style.width = pct + '%';
  if (certText) certText.textContent = completed + ' of 16 lessons completed';

  if (completed >= 16) {
    if (certCard) certCard.classList.add('earned');
    if (certIcon) certIcon.textContent = '\u{1F3C6}';
    if (certTitle) certTitle.textContent = 'Marketing Intern Graduate!';
    if (certDesc) certDesc.textContent = 'Congratulations! You completed the Marketing Intern Training Program.';
    if (certDownload) {
      certDownload.style.display = 'inline-flex';
      certDownload.addEventListener('click', () => {
        // Generate certificate with logo as downloadable HTML
        const name = AUTH.getDisplayName();
        const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const logoB64 = document.querySelector('.logo-icon img')?.src || '';
        const certHtml = '<!DOCTYPE html><html><head><title>Certificate - Sphere Academy</title>'
          + '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
          + '<style>'
          + '*{margin:0;padding:0;box-sizing:border-box;}'
          + 'body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;font-family:"Plus Jakarta Sans",sans-serif;padding:40px;}'
          + '.cert{width:900px;padding:0;border-radius:20px;text-align:center;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.1);overflow:hidden;}'
          + '.cert-header{background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);padding:40px 60px;color:#fff;}'
          + '.cert-header img{width:60px;height:60px;object-fit:contain;margin:0 auto 12px;display:block;}'
          + '.cert-header h3{font-size:1.1rem;font-weight:600;opacity:0.9;letter-spacing:0.1em;text-transform:uppercase;}'
          + '.cert-body{padding:48px 60px;}'
          + '.cert-body .label{font-size:0.9rem;color:#64748b;text-transform:uppercase;letter-spacing:0.15em;font-weight:600;}'
          + '.cert-body h1{font-size:2rem;font-weight:800;color:#2563eb;margin:8px 0 32px;letter-spacing:-0.02em;}'
          + '.cert-body .sub{font-size:0.95rem;color:#64748b;margin-bottom:12px;}'
          + '.cert-body .recipient{font-size:2.2rem;font-weight:700;color:#1e293b;margin:20px 0;padding-bottom:12px;border-bottom:3px solid #2563eb;display:inline-block;}'
          + '.cert-body .program{font-size:1.3rem;font-weight:700;color:#1e293b;margin:24px 0 4px;}'
          + '.cert-body .details{font-size:0.9rem;color:#64748b;margin-bottom:32px;}'
          + '.cert-footer{display:flex;justify-content:space-between;align-items:center;padding:24px 60px;border-top:1px solid #e2e8f0;font-size:0.82rem;color:#94a3b8;}'
          + '@media print{body{background:#fff;padding:0;}.cert{box-shadow:none;border-radius:0;width:100%;}}'
          + '</style></head><body><div class="cert">'
          + '<div class="cert-header">'
          + '<img src="' + logoB64 + '" alt="Sphere Academy">'
          + '<h3>Sphere Academy</h3>'
          + '</div>'
          + '<div class="cert-body">'
          + '<p class="label">Certificate of Completion</p>'
          + '<h1>Marketing Intern Training Program</h1>'
          + '<p class="sub">This is to certify that</p>'
          + '<div class="recipient">' + name + '</div>'
          + '<p class="sub">has successfully completed the</p>'
          + '<p class="program">4-Month Marketing Intern Training Program</p>'
          + '<p class="details">16 Weekly Modules &bull; Creatives, Tools &amp; Ads Manager &bull; Sphere Academy</p>'
          + '</div>'
          + '<div class="cert-footer">'
          + '<span>Issued on ' + date + '</span>'
          + '<span>Sphere Academy &bull; sphereacademy.com</span>'
          + '</div>'
          + '</div></body></html>';
        const blob = new Blob([certHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Sphere_Academy_Certificate_' + name.replace(/\s/g, '_') + '.html';
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }
}

// ===== EXPORT PROGRESS REPORT =====
const exportBtn = document.getElementById('exportProgressBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    const name = AUTH.getDisplayName();
    const lessons = LESSONS.getAll();
    let csv = 'Week,Title,Category,Difficulty,Completed,Assignment Submitted\n';
    lessons.forEach(l => {
      const done = PROGRESS.isCompleted(l.id) ? 'Yes' : 'No';
      const assigned = ASSIGNMENTS.isSubmitted(l.id) ? 'Yes' : 'No';
      csv += 'W' + l.week + ',"' + l.title + '",' + l.category + ',' + l.difficulty + ',' + done + ',' + assigned + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Progress_Report_' + name.replace(/\s/g, '_') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showProfileToast('Progress report downloaded!');
  });
}

// ===== LOADING STATES ON BUTTONS =====
document.querySelectorAll('form').forEach(form => {
  form.addEventListener('submit', () => {
    const btn = form.querySelector('button[type="submit"], .btn-primary');
    if (btn && !btn.classList.contains('loading')) {
      btn.classList.add('loading');
      const origText = btn.textContent;
      btn.textContent = 'Loading...';
      setTimeout(() => {
        btn.classList.remove('loading');
        btn.textContent = origText;
      }, 2000);
    }
  });
});

// ===== PASSWORD CHANGE FIX =====
if (currentPage === 'profile.html' && accountForm) {
  // Override the existing handler to actually update the password
  const origHandler = accountForm.onsubmit;
  accountForm.addEventListener('submit', (e) => {
    const newPass = document.getElementById('accountNewPassword')?.value;
    if (newPass && newPass.length >= 8) {
      const users = AUTH.getAllUsers();
      const currentUser = AUTH.getUser();
      const userIdx = users.findIndex(u => u.username === currentUser);
      if (userIdx !== -1) {
        users[userIdx].password = newPass;
        safeSetItem(AUTH.USERS_KEY, JSON.stringify(users));
      }
    }
  });
}

// ===== FORGOT PASSWORD =====
if (currentPage === 'login.html') {
  const forgotLink = document.querySelector('a[href="#"]');
  if (forgotLink && forgotLink.textContent.includes('Forgot')) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      const loginError = document.getElementById('loginError');
      if (loginError) {
        loginError.textContent = 'Password reset is not available in demo mode. Default credentials: admin / admin123';
        loginError.style.display = 'block';
        loginError.style.background = '#fef3c7';
        loginError.style.color = '#92400e';
        loginError.style.borderColor = '#fcd34d';
      }
    });
  }
}

// ===== FIREBASE OAUTH (Google + Facebook) =====
(function setupFirebaseAuth() {
  const googleBtn = document.getElementById('googleSignIn');
  const fbBtn = document.getElementById('facebookSignIn');
  if (!googleBtn && !fbBtn) return;

  function showErr(msg, isWarning) {
    const loginError = document.getElementById('loginError') || document.getElementById('signupError');
    if (!loginError) { alert(msg); return; }
    loginError.textContent = msg;
    loginError.style.display = 'block';
    if (isWarning) {
      loginError.style.background = '#fef3c7';
      loginError.style.color = '#92400e';
      loginError.style.borderColor = '#fcd34d';
    } else {
      loginError.style.background = '#fee2e2';
      loginError.style.color = '#991b1b';
      loginError.style.borderColor = '#fca5a5';
    }
  }

  // Check if Firebase is configured
  const firebaseReady = typeof FIREBASE_ENABLED !== 'undefined' && FIREBASE_ENABLED
    && typeof FIREBASE_CONFIG !== 'undefined'
    && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY_HERE'
    && typeof firebase !== 'undefined';

  // Initialize Firebase only if ready
  let auth = null;
  if (firebaseReady) {
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
    } catch (e) {
      console.error('Firebase init failed:', e);
    }
  }

  // Bridge Firebase user into existing AUTH system (localStorage)
  // ASYNC — awaits the Firestore baseline write before redirecting,
  // otherwise window.location kills the in-flight network request
  // and the admin Students tab never sees this signup.
  async function loginFirebaseUser(user) {
    const email = user.email || '';
    const displayName = user.displayName || email.split('@')[0] || 'User';
    const username = (email.split('@')[0] || displayName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const provider = (user.providerData && user.providerData[0]) ? user.providerData[0].providerId : 'oauth';

    // Create user in AUTH if doesn't exist
    const users = AUTH.getAllUsers();
    if (!users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
      users.push({
        username: username,
        password: '__firebase__' + user.uid,
        role: 'student',
        fullName: displayName,
        email: email,
        provider: provider
      });
      safeSetItem(AUTH.USERS_KEY, JSON.stringify(users));
    }

    // Log in via existing AUTH system
    safeSetItem('auth_logged_in', 'true');
    safeSetItem('auth_user', username);
    safeSetItem('auth_role', 'student');
    const nameParts = displayName.split(' ');
    safeSetItem('auth_profile', JSON.stringify({
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: email
    }));
    // Use photoURL if available — store under both session and
    // per-username keys so logout doesn't lose the picture.
    if (user.photoURL) {
      safeSetItem('auth_avatar', user.photoURL);
      safeSetItem('avatar_' + username, user.photoURL);
    } else {
      // Restore previously-saved avatar for this Google account
      const saved = safeGetItem('avatar_' + username);
      if (saved) safeSetItem('auth_avatar', saved);
    }

    // AWAIT the Firestore baseline write so it actually finishes
    // before we navigate away. Mirrors AUTH.register()'s write so
    // the admin Students tab sees this signup immediately.
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db && typeof firebase !== 'undefined') {
        await DATA_SYNC.db.collection('sphere_users').doc(username).set({
          username: username,
          displayName: displayName,
          email: email,
          role: 'student',
          provider: provider,
          progress: {},
          quizScores: {},
          quizAttempts: {},
          assignments: {},
          activityByDay: {},
          registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastActive: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log('[OAUTH] Synced to Firestore:', username);
      } else {
        console.warn('[OAUTH] DATA_SYNC.db not ready — skipping Firestore write');
      }
    } catch (e) {
      console.error('[OAUTH] Firestore write failed:', e && e.message ? e.message : e);
      // Non-fatal — local login still works, just admin won't see them
      // until they next interact with USER_SYNC.save() on dashboard.
    }

    window.location.href = 'dashboard.html';
  }

  async function signInWith(providerName) {
    if (!firebaseReady || !auth) {
      showErr('Firebase is not configured yet. See FIREBASE_SETUP.md for setup instructions.', true);
      return;
    }
    try {
      let provider;
      if (providerName === 'google') {
        provider = new firebase.auth.GoogleAuthProvider();
      } else if (providerName === 'facebook') {
        provider = new firebase.auth.FacebookAuthProvider();
      }
      const result = await auth.signInWithPopup(provider);
      if (result && result.user) {
        await loginFirebaseUser(result.user);
      }
    } catch (err) {
      console.error('OAuth error:', err);
      if (err.code === 'auth/popup-closed-by-user') return;
      if (err.code === 'auth/account-exists-with-different-credential') {
        showErr('An account with this email already exists via a different sign-in method.');
      } else if (err.code === 'auth/unauthorized-domain') {
        showErr('This domain is not authorized in Firebase. Add your domain in Firebase Console → Authentication → Settings → Authorized domains.');
      } else {
        showErr('Sign-in failed: ' + (err.message || 'Unknown error'));
      }
    }
  }

  if (googleBtn) googleBtn.addEventListener('click', () => signInWith('google'));
  if (fbBtn) fbBtn.addEventListener('click', () => signInWith('facebook'));
})();

// ===== ADMIN: BULK PUBLISH =====
if (currentPage === 'admin.html' && AUTH.isAdmin()) {
  const bulkBtn = document.getElementById('bulkPublishBtn');
  if (bulkBtn) {
    bulkBtn.addEventListener('click', () => {
      if (!confirm('Publish all 16 lessons? Students will be able to view them all.')) return;
      const lessons = LESSONS.getAll();
      lessons.forEach(l => {
        l.published = true;
        LESSONS.save(l);
      });
      if (typeof renderAdminSidebar === 'function') renderAdminSidebar();
      if (typeof updateAdminStats === 'function') updateAdminStats();
      if (typeof loadLessonEditor === 'function') loadLessonEditor(document.querySelector('.admin-sidebar-lesson.active')?.dataset?.id || 'w1');
      NOTIFS.add('All 16 lessons have been published!', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>', 'course.html');
      const toast = document.getElementById('adminToast');
      if (toast) {
        toast.innerHTML = '<span>&#10003;</span> All 16 lessons published!';
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
      }
    });
  }
}

// ===== ADMIN: UNSAVED CHANGES WARNING =====
if (currentPage === 'admin.html') {
  let hasUnsavedChanges = false;
  const unsavedBanner = document.getElementById('unsavedBanner');
  const unsavedSave = document.getElementById('unsavedSaveBtn');
  const unsavedDismiss = document.getElementById('unsavedDismiss');

  // Track changes on any editor input
  document.querySelectorAll('#editorTitle, #editorVideoUrl, #editorProTip, #editorCategory, #editorDifficulty, #editorDuration, #editorVideoType, #editorPublished, #editorAssignmentEnabled, #editorAssignmentTitle, #editorAssignmentDesc').forEach(el => {
    if (el) {
      el.addEventListener('input', () => {
        hasUnsavedChanges = true;
        if (unsavedBanner) unsavedBanner.classList.add('visible');
      });
      el.addEventListener('change', () => {
        hasUnsavedChanges = true;
        if (unsavedBanner) unsavedBanner.classList.add('visible');
      });
    }
  });

  // Save button clears unsaved state
  const adminSave = document.getElementById('adminSaveBtn');
  if (adminSave) {
    adminSave.addEventListener('click', () => {
      hasUnsavedChanges = false;
      if (unsavedBanner) unsavedBanner.classList.remove('visible');
    });
  }

  if (unsavedSave) {
    unsavedSave.addEventListener('click', () => {
      if (typeof saveLessonFromEditor === 'function') saveLessonFromEditor();
      hasUnsavedChanges = false;
      if (unsavedBanner) unsavedBanner.classList.remove('visible');
    });
  }

  if (unsavedDismiss) {
    unsavedDismiss.addEventListener('click', () => {
      hasUnsavedChanges = false;
      if (unsavedBanner) unsavedBanner.classList.remove('visible');
    });
  }

  // Warn before leaving
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ===== COURSE CARD PROGRESS BADGES =====
if (currentPage === 'course.html') {
  const months = [
    { start: 1, end: 4, label: 'Month 1' },
    { start: 5, end: 8, label: 'Month 2' },
    { start: 9, end: 12, label: 'Month 3' },
    { start: 13, end: 16, label: 'Month 4' }
  ];

  // (Per-card progress bars removed — cards stay clean with just
  // image + phase tag + title. The Modules tab still shows progress.)

  // Also add to module headers in the Modules tab
  document.querySelectorAll('.module-item').forEach((item, i) => {
    if (i < months.length) {
      const m = months[i];
      let done = 0;
      for (let w = m.start; w <= m.end; w++) {
        if (PROGRESS.isCompleted('w' + w)) done++;
      }
      if (done > 0) {
        const info = item.querySelector('.module-info span');
        if (info && !info.textContent.includes('complete')) {
          info.textContent += ' \u2022 ' + done + '/4 complete';
        }
      }
    }
  });

  // ===== UPDATE COURSE CARDS & MODULE HEADERS WITH SAVED MONTH NAMES =====
  const savedMonthNames = LESSONS.getMonthNames();

  // Update course card emojis from saved data
  const courseEmojis = safeGetJSON('site_card_emojis', { 1: '✎', 2: '⚡', 3: '⚙', 4: '▲' });
  courseCardLinks.forEach((card, i) => {
    const monthNum = i + 1;
    const emoji = courseEmojis[monthNum] || courseEmojis[String(monthNum)];
    if (emoji) {
      const iconEl = card.querySelector('.course-card-icon');
      if (iconEl) iconEl.textContent = emoji;
    }
  });

  // Update course card titles + tag labels (Overview tab)
  courseCardLinks.forEach((card, i) => {
    const monthNum = i + 1;
    const name = savedMonthNames[monthNum] || savedMonthNames[String(monthNum)];
    if (name) {
      const h3 = card.querySelector('.course-card-body h3');
      if (h3) h3.textContent = name;
    }
    // Also update the "MONTH X" tag label with the custom prefix
    const tag = card.querySelector('.course-card-tag');
    if (tag) tag.textContent = LESSONS.getMonthPrefix(monthNum);

    // Update description from saved data
    const descP = card.querySelector('.course-card-body p');
    const savedDesc = LESSONS.getMonthDescription(monthNum);
    if (descP && savedDesc) descP.textContent = savedDesc;
  });

  // Update module headers (Modules tab)
  document.querySelectorAll('.module-item').forEach((item, i) => {
    const monthNum = i + 1;
    const name = savedMonthNames[monthNum] || savedMonthNames[String(monthNum)];
    if (name) {
      const h3 = item.querySelector('.module-info h3');
      if (h3) h3.textContent = LESSONS.getMonthPrefix(monthNum) + ': ' + name;
    }
  });

  // Update all lesson titles in module accordions + course cards from saved lesson data
  const allLessonsForCourse = LESSONS.getAll();
  document.querySelectorAll('.module-lessons .lesson-item, .course-card-lessons .lesson-item').forEach(link => {
    const href = link.getAttribute('href') || '';
    const match = href.match(/week=(w\d+)/);
    if (match) {
      const lessonData = allLessonsForCourse.find(l => l.id === match[1]);
      if (lessonData) {
        const icon = link.querySelector('.icon');
        const duration = link.querySelector('.duration');
        const iconHtml = icon ? icon.outerHTML : '';
        const durationHtml = duration ? ' ' + duration.outerHTML : '';
        link.innerHTML = iconHtml + ' W' + lessonData.week + ': ' + lessonData.title + durationHtml;
      }
    }
  });
}

// ===== BOOKMARK SYSTEM =====
const BOOKMARKS = {
  STORAGE_KEY: 'lesson_bookmarks',
  getAll() { return safeGetJSON(this.STORAGE_KEY, []); },
  toggle(weekId) {
    const all = this.getAll();
    const idx = all.indexOf(weekId);
    if (idx >= 0) { all.splice(idx, 1); } else { all.push(weekId); }
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
    return idx < 0;
  },
  isBookmarked(weekId) { return this.getAll().includes(weekId); }
};

// Add bookmark button to lesson page
if (currentPage === 'lesson.html') {
  const params3 = new URLSearchParams(window.location.search);
  const weekId3 = params3.get('week') || 'w1';
  const lessonTitle = document.querySelector('.lesson-content h1');
  if (lessonTitle) {
    const bmBtn = document.createElement('button');
    bmBtn.className = 'bookmark-btn' + (BOOKMARKS.isBookmarked(weekId3) ? ' active' : '');
    bmBtn.innerHTML = BOOKMARKS.isBookmarked(weekId3) ? '&#9733;' : '&#9734;';
    bmBtn.title = 'Bookmark this lesson';
    bmBtn.addEventListener('click', () => {
      const isNow = BOOKMARKS.toggle(weekId3);
      bmBtn.classList.toggle('active', isNow);
      bmBtn.innerHTML = isNow ? '&#9733;' : '&#9734;';
    });
    lessonTitle.style.display = 'flex';
    lessonTitle.style.alignItems = 'center';
    lessonTitle.style.gap = '12px';
    lessonTitle.appendChild(bmBtn);
  }
}

// ===== EDITABLE SITE SETTINGS (Tags & Title) =====
// ===== About Stratos Sphere Academy section =====
const ABOUT = {
  TEXT_KEY: 'about_text',
  PILLARS_KEY: 'about_pillars',

  defaultText: {
    label: 'About Us',
    title: 'About Stratos Sphere Academy',
    desc: 'Stratos Sphere Academy is a hands-on marketing training program built to transform beginners into confident, job-ready digital marketers. Through structured lesson modules covering creatives, tools, AI-powered workflows, and Meta Ads, we equip interns with the real-world skills that matter — from designing high-converting content to launching and optimizing paid campaigns.'
  },
  defaultPillars: [
    { icon: 'graduation', color: 'blue',   title: 'Structured Learning', desc: '16 lessons with quizzes, assignments, and clear milestones.' },
    { icon: 'star',       color: 'purple', title: 'Real-World Skills',   desc: 'Hands-on creative production, bot automation, and Meta Ads execution.' },
    { icon: 'award',      color: 'green',  title: 'Career-Ready',        desc: 'Graduate with a portfolio, a certificate, and a place on the marketing team.' }
  ],

  getText() {
    const stored = safeGetJSON(this.TEXT_KEY, null);
    if (stored && typeof stored === 'object') {
      return {
        label: stored.label || this.defaultText.label,
        title: stored.title || this.defaultText.title,
        desc: stored.desc || this.defaultText.desc
      };
    }
    return { ...this.defaultText };
  },
  saveText(text) {
    const ok = safeSetItem(this.TEXT_KEY, JSON.stringify(text));
    if (ok && typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ about_text: text });
    return ok;
  },
  getPillars() {
    const stored = safeGetJSON(this.PILLARS_KEY, null);
    if (stored && Array.isArray(stored) && stored.length > 0) return stored;
    return this.defaultPillars.map(p => ({ ...p }));
  },
  savePillars(pillars) {
    const ok = safeSetItem(this.PILLARS_KEY, JSON.stringify(pillars));
    if (ok && typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ about_pillars: pillars });
    return ok;
  }
};

// ===== Intern Testimonials =====
const TESTIMONIALS = {
  KEY: 'intern_testimonials',
  MAX_SIZE: 10 * 1024 * 1024,
  MAX_DIM: 400,
  JPEG_QUALITY: 0.85,

  defaultItems: [
    { id: 't1', rating: 5, quote: 'The creatives months gave me so much confidence. I went from never opening Canva to producing ad-ready content that actually performed.', name: 'Ana Torres',  role: 'Former Marketing Intern', avatar: '' },
    { id: 't2', rating: 5, quote: 'The Ads Manager month was intense but amazing. By week 16, I launched a real campaign and knew how to read every metric on the dashboard.',           name: 'Marco Reyes', role: 'Junior Media Buyer', avatar: '' },
    { id: 't3', rating: 5, quote: 'Learning Botcake and Chatfuel was a game-changer. I set up automated funnels that saved the team hours every week on customer inquiries.',               name: 'Jamie Lee',   role: 'E-commerce Marketing Associate', avatar: '' }
  ],

  getAll() {
    const stored = safeGetJSON(this.KEY, null);
    if (stored && Array.isArray(stored) && stored.length > 0) return stored;
    return this.defaultItems.map(t => ({ ...t }));
  },
  save(items) {
    const ok = safeSetItem(this.KEY, JSON.stringify(items));
    if (ok && typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ testimonials: items });
    return ok;
  },
  getInitials(name) {
    if (!name) return '';
    return name.trim().split(/\s+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase();
  },
  renderStars(n) {
    const r = Math.max(0, Math.min(5, parseInt(n) || 0));
    return '&#9733;'.repeat(r) + '&#9734;'.repeat(5 - r);
  },

  // Read file to a raw data URL (no compression yet — adjuster handles it)
  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(file);
    });
  },

  // Open an interactive adjuster modal to pan/zoom before saving.
  // Returns a Promise<string|null> resolving to the cropped JPEG dataURL,
  // or null if cancelled.
  openAdjuster(sourceDataUrl) {
    return new Promise((resolve) => {
      const D = this.MAX_DIM;           // output size (400)
      const quality = this.JPEG_QUALITY;

      // Build modal
      const overlay = document.createElement('div');
      overlay.className = 'avatar-adjuster-overlay';
      overlay.innerHTML = ''
        + '<div class="avatar-adjuster">'
        +   '<div class="avatar-adjuster-header">'
        +     '<strong>Adjust photo</strong>'
        +     '<button class="avatar-adjuster-close" aria-label="Close">&#10005;</button>'
        +   '</div>'
        +   '<div class="avatar-adjuster-stage">'
        +     '<div class="avatar-adjuster-viewport">'
        +       '<img class="avatar-adjuster-img" src="' + sourceDataUrl + '" alt="" draggable="false">'
        +     '</div>'
        +     '<div class="avatar-adjuster-mask"></div>'
        +   '</div>'
        +   '<div class="avatar-adjuster-controls">'
        +     '<label style="display:flex;align-items:center;gap:10px;width:100%;font-size:0.82rem;color:var(--text-light);">Zoom'
        +       '<input type="range" class="avatar-adjuster-zoom" min="100" max="400" value="100" step="1" style="flex:1;">'
        +     '</label>'
        +     '<p style="margin:8px 0 0;color:var(--text-light);font-size:0.78rem;text-align:center;">Drag the image to reposition it inside the circle.</p>'
        +   '</div>'
        +   '<div class="avatar-adjuster-actions">'
        +     '<button class="btn btn-outline avatar-adjuster-cancel">Cancel</button>'
        +     '<button class="btn btn-primary avatar-adjuster-apply">Apply</button>'
        +   '</div>'
        + '</div>';
      document.body.appendChild(overlay);

      const img = overlay.querySelector('.avatar-adjuster-img');
      const viewport = overlay.querySelector('.avatar-adjuster-viewport');
      const zoomInput = overlay.querySelector('.avatar-adjuster-zoom');

      const VIEWPORT_SIZE = 280; // visual size in px
      let offsetX = 0;           // translation offsets (relative to center)
      let offsetY = 0;
      let scale = 1;             // 1 = "cover" (image fills viewport at its natural ratio)

      let imgNaturalW = 0, imgNaturalH = 0;
      let baseScale = 1;  // scale factor so the image "covers" the viewport at scale=1

      function clampOffsets() {
        // Keep the image within the viewport edges so no white/gap shows
        const drawnW = imgNaturalW * baseScale * scale;
        const drawnH = imgNaturalH * baseScale * scale;
        const maxX = Math.max(0, (drawnW - VIEWPORT_SIZE) / 2);
        const maxY = Math.max(0, (drawnH - VIEWPORT_SIZE) / 2);
        if (offsetX > maxX) offsetX = maxX;
        if (offsetX < -maxX) offsetX = -maxX;
        if (offsetY > maxY) offsetY = maxY;
        if (offsetY < -maxY) offsetY = -maxY;
      }

      function paint() {
        clampOffsets();
        const drawnW = imgNaturalW * baseScale * scale;
        const drawnH = imgNaturalH * baseScale * scale;
        img.style.width = drawnW + 'px';
        img.style.height = drawnH + 'px';
        img.style.transform = 'translate(calc(-50% + ' + offsetX + 'px), calc(-50% + ' + offsetY + 'px))';
      }

      function initImage() {
        imgNaturalW = img.naturalWidth;
        imgNaturalH = img.naturalHeight;
        if (!imgNaturalW || !imgNaturalH) {
          // Fallback if image somehow has 0 dimensions
          imgNaturalW = imgNaturalH = VIEWPORT_SIZE;
        }
        // "cover" base scale: fill the viewport
        baseScale = Math.max(VIEWPORT_SIZE / imgNaturalW, VIEWPORT_SIZE / imgNaturalH);
        scale = 1;
        offsetX = 0;
        offsetY = 0;
        zoomInput.value = '100';
        paint();
      }
      // Handle both: image already loaded (cached) and still loading
      if (img.complete && img.naturalWidth > 0) {
        initImage();
      } else {
        img.addEventListener('load', initImage, { once: true });
      }

      // Drag to pan using Pointer Events (works for mouse, touch, pen)
      let dragging = false;
      let activePointerId = null;
      let startX = 0, startY = 0, startOffX = 0, startOffY = 0;

      function onDown(e) {
        e.preventDefault();
        dragging = true;
        activePointerId = e.pointerId;
        startX = e.clientX; startY = e.clientY;
        startOffX = offsetX; startOffY = offsetY;
        try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
      }
      function onMove(e) {
        if (!dragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        e.preventDefault();
        offsetX = startOffX + (e.clientX - startX);
        offsetY = startOffY + (e.clientY - startY);
        paint();
      }
      function onUp(e) {
        if (activePointerId !== null && e.pointerId !== activePointerId) return;
        dragging = false;
        activePointerId = null;
        try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
      }

      viewport.addEventListener('pointerdown', onDown);
      viewport.addEventListener('pointermove', onMove);
      viewport.addEventListener('pointerup', onUp);
      viewport.addEventListener('pointercancel', onUp);
      viewport.addEventListener('pointerleave', onUp);

      // Mouse wheel zoom
      viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        const newZoom = Math.max(100, Math.min(400, parseInt(zoomInput.value) + delta));
        zoomInput.value = String(newZoom);
        zoomInput.dispatchEvent(new Event('input'));
      }, { passive: false });

      // Zoom slider (100 = 1x cover, 400 = 4x)
      zoomInput.addEventListener('input', () => {
        const old = scale;
        scale = parseInt(zoomInput.value) / 100;
        // Scale offsets proportionally to keep the focal point stable
        if (old > 0) {
          offsetX *= (scale / old);
          offsetY *= (scale / old);
        }
        paint();
      });

      // Buttons
      function cleanup() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onUp);
        overlay.remove();
      }
      overlay.querySelector('.avatar-adjuster-cancel').addEventListener('click', () => { cleanup(); resolve(null); });
      overlay.querySelector('.avatar-adjuster-close').addEventListener('click', () => { cleanup(); resolve(null); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); resolve(null); } });
      overlay.querySelector('.avatar-adjuster-apply').addEventListener('click', () => {
        try {
          // Render final crop to a canvas at MAX_DIM
          const canvas = document.createElement('canvas');
          canvas.width = D;
          canvas.height = D;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, D, D);
          // Map viewport-space (VIEWPORT_SIZE) to canvas-space (D)
          const scaleToOutput = D / VIEWPORT_SIZE;
          const drawnW = imgNaturalW * baseScale * scale * scaleToOutput;
          const drawnH = imgNaturalH * baseScale * scale * scaleToOutput;
          const dx = (D - drawnW) / 2 + offsetX * scaleToOutput;
          const dy = (D - drawnH) / 2 + offsetY * scaleToOutput;
          ctx.drawImage(img, dx, dy, drawnW, drawnH);
          const out = canvas.toDataURL('image/jpeg', quality);
          cleanup();
          resolve(out);
        } catch (e) {
          console.error('Adjuster apply failed:', e);
          cleanup();
          resolve(null);
        }
      });
    });
  }
};

// ===== Program Outcome Carousel + Text =====
const OUTCOME_CAROUSEL = {
  KEY: 'outcome_images',
  TEXT_KEY: 'outcome_text',
  MAX_SIZE: 10 * 1024 * 1024, // 10MB source; we compress to <200KB before storing
  MAX_DIM: 800,               // resize target (maintains aspect)
  JPEG_QUALITY: 0.85,
  MAX_COUNT: 10,
  AUTOPLAY_MS: 5000,

  defaultText: {
    title: "You're Ready to Make an Impact!",
    subtitle: 'Welcome to the Marketing Team',
    desc: 'Complete the full program and you will be equipped to create high-converting image & video creatives, manage bots, CRM, and order tools confidently, and run, optimize, and report on paid ad campaigns.'
  },

  // Compress + resize a File to a data URL <200KB. Resolves to a JPEG dataURL.
  compressFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = this.MAX_DIM;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              const ratio = Math.min(maxDim / width, maxDim / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            // White background so transparent PNGs become opaque JPEGs
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', this.JPEG_QUALITY));
          } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error('Not a valid image'));
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  getAll() { return safeGetJSON(this.KEY, []); },
  save(images) {
    const ok = safeSetItem(this.KEY, JSON.stringify(images));
    if (ok && typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveOutcomeImages(images);
    return ok;
  },
  add(dataUrl) {
    const all = this.getAll();
    if (all.length >= this.MAX_COUNT) return { ok: false, reason: 'max' };
    all.push({ id: 'oi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), src: dataUrl });
    const ok = this.save(all);
    return { ok, reason: ok ? null : 'storage' };
  },
  remove(id) {
    const all = this.getAll().filter(x => x.id !== id);
    this.save(all);
  },

  getText() {
    const stored = safeGetJSON(this.TEXT_KEY, null);
    if (stored && typeof stored === 'object') {
      return {
        title: stored.title || this.defaultText.title,
        subtitle: stored.subtitle || this.defaultText.subtitle,
        desc: stored.desc || this.defaultText.desc
      };
    }
    return { ...this.defaultText };
  },
  saveText(text) {
    safeSetItem(this.TEXT_KEY, JSON.stringify(text));
    if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ outcome_text: text });
  }
};

const SITE_SETTINGS = {
  TAGS_KEY: 'site_skill_tags',
  TITLE_KEY: 'site_section_title',
  FEATURES_KEY: 'site_feature_cards',
  defaultTags: ['Digital Marketing', 'Leadership', 'Run Meta Ads', 'Creatives', 'Digital Tools & AI'],
  defaultTitle: "Skills You'll Build in This Course",

  // Preset SVG icon library for feature cards (stroke-based, currentColor)
  ICONS: {
    star:       '<path d="M12 2l2 4 4 .5-3 3 .7 4.2L12 12l-3.7 1.7.7-4.2-3-3L10 6z"/>',
    video:      '<rect x="2" y="7" width="15" height="10" rx="2"/><path d="m17 10 5-3v10l-5-3z"/>',
    target:     '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    bot:        '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 2v6M8 14h.01M16 14h.01M9 18h6"/>',
    'bar-chart':'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    dollar:     '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    send:       '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    trending:   '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    edit:       '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    users:      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    zap:        '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    heart:      '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    lightbulb:  '<line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
    award:      '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    camera:     '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    briefcase:  '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    graduation: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    search:     '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
  },
  COLORS: ['blue', 'amber', 'green', 'purple', 'pink', 'red', 'teal', 'orange'],

  defaultFeatures: [
    { icon: 'star',       color: 'blue',   title: 'Image Creatives',    desc: 'Create product posts, promotional banners, and story graphics using Canva, Adobe Express, or Photoshop.' },
    { icon: 'video',      color: 'amber',  title: 'Video Creatives',    desc: 'Produce 15–30 second product videos with hooks, benefits, and CTAs using CapCut and Canva Video.' },
    { icon: 'target',     color: 'green',  title: 'Customer Angles',    desc: 'Master angle frameworks: Problem → Solution, Before & After, Social Proof, and FOMO messaging.' },
    { icon: 'bot',        color: 'purple', title: 'Chatbot Marketing',  desc: 'Build automated bot flows for product inquiries, order status, promos, and lead generation with Botcake & Chatfuel.' },
    { icon: 'bar-chart',  color: 'pink',   title: 'Tools & Analytics',  desc: 'Build campaign trackers, performance dashboards, and marketing reports in Google Sheets with pivot tables.' },
    { icon: 'dollar',     color: 'red',    title: 'Meta Ads Manager',   desc: 'Run, optimize, and report on paid Meta ad campaigns with full control over targeting, budgets, and ROAS.' }
  ],

  getTags() { return safeGetJSON(this.TAGS_KEY, this.defaultTags); },
  saveTags(tags) {
    safeSetItem(this.TAGS_KEY, JSON.stringify(tags));
    if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ skill_tags: tags });
  },
  getTitle() { return safeGetItem(this.TITLE_KEY) || this.defaultTitle; },
  saveTitle(title) {
    safeSetItem(this.TITLE_KEY, title);
    if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ section_title: title });
  },
  getFeatures() {
    const stored = safeGetJSON(this.FEATURES_KEY, null);
    if (stored && Array.isArray(stored) && stored.length > 0) return stored;
    return this.defaultFeatures.map(f => ({ ...f }));
  },
  saveFeatures(features) {
    safeSetItem(this.FEATURES_KEY, JSON.stringify(features));
    if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ feature_cards: features });
  },
  renderIcon(name) {
    const path = this.ICONS[name] || this.ICONS.star;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  }
};

// Render tags on homepage
const featureTagsEl = document.getElementById('featureTags');
if (featureTagsEl) {
  const tags = SITE_SETTINGS.getTags();
  featureTagsEl.innerHTML = tags.map(t => '<span class="feature-tag">' + t + '</span>').join('');
}

// Render section title + dynamic month names on homepage
if (currentPage === 'index.html') {
  const sectionTitleEl = document.querySelector('.features-header .section-title');
  if (sectionTitleEl) sectionTitleEl.textContent = SITE_SETTINGS.getTitle();

  // Wire the bento "Live now" card AND the hero trust strip to real
  // PRESENCE data. One listener updates both: live count for the bento,
  // and real student avatars (with initials fallback) for the trust
  // strip. Falls back to placeholders if PRESENCE isn't available or
  // there are no registered users yet.
  function bindHeroLiveData() {
    const liveEl = document.getElementById('bentoLiveCount');
    const trustEl = document.querySelector('.hero-trust-avatars');
    const trustCaptionEl = document.querySelector('.hero-trust p');
    if (typeof PRESENCE === 'undefined') return;
    if (!liveEl && !trustEl) return;

    // Same indigo-family gradients we use elsewhere — pick one based on
    // a stable hash of the username so the same student always renders
    // with the same fallback color.
    const FALLBACK_GRADIENTS = [
      'linear-gradient(135deg,#635bff,#8b9eff)',
      'linear-gradient(135deg,#4c1d95,#635bff)',
      'linear-gradient(135deg,#312e81,#8b9eff)',
      'linear-gradient(135deg,#5b21b6,#a78bfa)',
      'linear-gradient(135deg,#1e1b4b,#635bff)'
    ];
    function pickGradient(username) {
      let hash = 0;
      for (let i = 0; i < (username || '').length; i++) {
        hash = ((hash << 5) - hash) + username.charCodeAt(i);
        hash |= 0;
      }
      return FALLBACK_GRADIENTS[Math.abs(hash) % FALLBACK_GRADIENTS.length];
    }
    function _esc(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function initialsFor(name) {
      const parts = String(name || '?').trim().split(/\s+/);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    PRESENCE.startLiveListener((users) => {
      const list = Array.isArray(users) ? users : [];

      // Live count update
      if (liveEl) {
        const onlineCount = list.filter(u => PRESENCE.isOnline(u)).length;
        if (onlineCount === 0) liveEl.textContent = 'Live community';
        else if (onlineCount === 1) liveEl.textContent = '1 member online';
        else liveEl.textContent = onlineCount + ' members online';
      }

      // Trust strip — pick up to 3 students, prioritizing real
      // uploaded photos. Treat the auto-applied Sphere logo
      // avatar as "no real photo" (avatarIsDefault === true) so
      // we don't end up with 3 identical Sphere planet icons
      // making the hero look like an unfinished placeholder.
      if (trustEl) {
        // Fallback for existing users whose docs predate the
        // avatarIsDefault flag: count duplicate avatar URLs across
        // the user list. If 3+ users share the same avatar dataURL,
        // it's the auto-generated default and should also be
        // treated as "no real photo".
        const avatarCounts = {};
        list.forEach(u => {
          if (u.avatar) avatarCounts[u.avatar] = (avatarCounts[u.avatar] || 0) + 1;
        });
        function hasRealPhoto(u) {
          if (!u.avatar) return false;
          if (u.avatarIsDefault === true) return false;
          if ((avatarCounts[u.avatar] || 0) >= 3) return false; // duplicate dedup
          return true;
        }
        const sorted = list.slice().sort((a, b) => {
          // Real-photo users first, then recently-active, then
          // by display name (stable order).
          const aHas = hasRealPhoto(a) ? 1 : 0;
          const bHas = hasRealPhoto(b) ? 1 : 0;
          if (aHas !== bHas) return bHas - aHas;
          return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
        });
        const top = sorted.slice(0, 3);
        const extra = Math.max(0, list.length - top.length);

        if (top.length === 0) {
          // Keep the existing fallback markup if no users yet
          return;
        }

        let html = '';
        top.forEach(u => {
          const display = u.displayName || u.username || '?';
          const safeName = _esc(display);
          if (hasRealPhoto(u)) {
            // Real photo: render the image
            html += '<span class="trust-avatar trust-avatar-photo" title="' + safeName + '">'
                  +   '<img src="' + _esc(u.avatar) + '" alt="' + safeName + '">'
                  + '</span>';
          } else {
            // Default Sphere-logo avatar OR no avatar — show colorful
            // initials with a per-student gradient so each circle
            // looks unique rather than three duplicate planet icons.
            html += '<span class="trust-avatar" title="' + safeName + '" '
                  +   'style="background:' + pickGradient(u.username || display) + '">'
                  +   _esc(initialsFor(display))
                  + '</span>';
          }
        });
        // "+N more" or "+" if the count is small
        html += '<span class="trust-avatar trust-avatar-more">'
              + (extra > 0 ? '+' + extra : '+')
              + '</span>';
        trustEl.innerHTML = html;

        // Caption — reflect real student count
        if (trustCaptionEl) {
          const total = list.length;
          if (total > 0) {
            trustCaptionEl.textContent = total === 1
              ? '1 marketing intern training the Stratos way'
              : total + ' marketing interns training the Stratos way';
          }
        }
      }
    });
  }
  setTimeout(bindHeroLiveData, 1200);

  // 3D tilt on mouse-move parallax — reusable for hero card + testimonial cards
  function applyTilt(el, options) {
    if (!el) return;
    if (!window.matchMedia('(hover: hover) and (min-width: 900px)').matches) return;

    const MAX_ROT = (options && options.maxRot) || 7;    // max degrees of rotation
    const DAMP = (options && options.damp) || 0.12;      // smoothing factor
    const PERSPECTIVE = (options && options.perspective) || 1200;
    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;
    let raf = null;
    let hovering = false;

    function tick() {
      currentX += (targetX - currentX) * DAMP;
      currentY += (targetY - currentY) * DAMP;
      el.style.transform = 'perspective(' + PERSPECTIVE + 'px) rotateX(' + currentX.toFixed(2) + 'deg) rotateY(' + currentY.toFixed(2) + 'deg)';
      if (hovering || Math.abs(currentX) > 0.05 || Math.abs(currentY) > 0.05) {
        raf = requestAnimationFrame(tick);
      } else {
        el.style.transform = '';
        raf = null;
      }
    }

    el.addEventListener('mouseenter', () => {
      hovering = true;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top)  / rect.height;
      targetY =  (px - 0.5) * 2 * MAX_ROT;
      targetX = -(py - 0.5) * 2 * MAX_ROT;
    });
    el.addEventListener('mouseleave', () => {
      hovering = false;
      targetX = 0;
      targetY = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    });
  }

  // Expose applyTilt so the testimonial render block can still use it.
  window.__applyTilt = applyTilt;

  // "Start the Program" smart routing:
  //   - Not logged in -> /login.html
  //   - Logged in (admin or student) -> /course.html
  (function smartStartButton() {
    const btn = document.getElementById('startProgramBtn');
    if (!btn) return;
    if (typeof AUTH !== 'undefined' && AUTH.isLoggedIn && AUTH.isLoggedIn()) {
      btn.href = 'course.html';
    } else {
      btn.href = 'login.html';
    }
  })();

  // Render feature cards from admin settings
  const featuresGridEl = document.getElementById('featuresGrid');
  if (featuresGridEl) {
    const features = SITE_SETTINGS.getFeatures();
    featuresGridEl.innerHTML = features.map(f =>
      '<div class="feature-card">'
      + '<div class="feature-icon ' + (f.color || 'blue') + '">' + SITE_SETTINGS.renderIcon(f.icon) + '</div>'
      + '<h3>' + (f.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</h3>'
      + '<p>' + (f.desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>'
      + '</div>'
    ).join('');
  }

  // Render About section from admin settings
  (function renderAbout() {
    try {
      const txt = ABOUT.getText();
      const labelEl = document.getElementById('aboutLabel');
      const titleEl = document.getElementById('aboutTitle');
      const descEl = document.getElementById('aboutDesc');
      if (labelEl) labelEl.textContent = txt.label;
      if (titleEl) titleEl.textContent = txt.title;
      if (descEl) descEl.textContent = txt.desc;

      const pillarsEl = document.getElementById('aboutPillars');
      if (pillarsEl) {
        const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const pillars = ABOUT.getPillars();
        pillarsEl.innerHTML = pillars.map(p =>
          '<div class="about-pillar">'
          + '<div class="about-pillar-icon ' + (p.color || 'blue') + '">' + SITE_SETTINGS.renderIcon(p.icon || 'star') + '</div>'
          + '<h3>' + esc(p.title) + '</h3>'
          + '<p>' + esc(p.desc) + '</p>'
          + '</div>'
        ).join('');
      }
    } catch (e) { console.warn('About render failed:', e); }
  })();

  // Render Intern Testimonials from admin settings
  (function renderTestimonials() {
    const grid = document.getElementById('testimonialsGrid');
    if (!grid) return;
    const items = TESTIMONIALS.getAll();
    if (!items.length) return;
    const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    grid.innerHTML = items.map(t => {
      const avatarHtml = t.avatar
        ? '<div class="testimonial-avatar has-photo"><img src="' + t.avatar + '" alt="' + escapeHtml(t.name) + '"></div>'
        : '<div class="testimonial-avatar">' + escapeHtml(TESTIMONIALS.getInitials(t.name)) + '</div>';
      return '<div class="testimonial-card">'
        + '<div class="testimonial-stars">' + TESTIMONIALS.renderStars(t.rating) + '</div>'
        + '<blockquote>&ldquo;' + escapeHtml(t.quote) + '&rdquo;</blockquote>'
        + '<div class="testimonial-author">'
        +   avatarHtml
        +   '<div class="testimonial-name">'
        +     '<strong>' + escapeHtml(t.name) + '</strong>'
        +     '<span>' + escapeHtml(t.role) + '</span>'
        +   '</div>'
        + '</div>'
        + '</div>';
    }).join('');

    // Attach 3D tilt to each freshly-rendered card (slightly gentler than hero)
    if (typeof window.__applyTilt === 'function') {
      grid.querySelectorAll('.testimonial-card').forEach(card => {
        window.__applyTilt(card, { maxRot: 6, damp: 0.14, perspective: 1000 });
      });
    }
  })();

  // Render Program Outcome title / subtitle / description from admin settings
  (function renderOutcomeText() {
    const titleEl = document.getElementById('outcomeTitleEl');
    const subtitleEl = document.getElementById('outcomeSubtitleEl');
    const descEl = document.getElementById('outcomeDescEl');
    if (!titleEl && !subtitleEl && !descEl) return;
    const t = OUTCOME_CAROUSEL.getText();
    if (titleEl) titleEl.textContent = t.title;
    if (subtitleEl) subtitleEl.textContent = t.subtitle;
    if (descEl) descEl.textContent = t.desc;
  })();

  // Render Program Outcome carousel
  (function renderOutcomeCarousel() {
    const slidesEl = document.getElementById('outcomeSlides');
    const dotsEl = document.getElementById('outcomeDots');
    const prevBtn = document.getElementById('outcomePrev');
    const nextBtn = document.getElementById('outcomeNext');
    if (!slidesEl) return;

    const images = OUTCOME_CAROUSEL.getAll();
    let currentIdx = 0;
    let autoplayTimer = null;

    // Build slides + dots ONCE so the CSS transitions actually fire when
    // we toggle the .active class (rebuilding DOM every transition would
    // create elements already in their end state — no animation).
    function build() {
      if (images.length === 0) {
        // Keep the placeholder SVG (already in HTML)
        if (dotsEl) dotsEl.innerHTML = '';
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        return;
      }
      slidesEl.innerHTML = images.map((img, i) =>
        '<div class="outcome-slide ' + (i === 0 ? 'active' : '') + '" data-idx="' + i + '">'
        + '<img src="' + img.src + '" alt="Program outcome ' + (i + 1) + '">'
        + '</div>'
      ).join('');
      if (dotsEl) {
        dotsEl.innerHTML = images.map((_, i) =>
          '<button class="outcome-dot ' + (i === 0 ? 'active' : '') + '" data-idx="' + i + '" aria-label="Go to image ' + (i + 1) + '"></button>'
        ).join('');
        dotsEl.querySelectorAll('.outcome-dot').forEach(dot => {
          dot.addEventListener('click', () => {
            setActive(parseInt(dot.dataset.idx));
            restartAutoplay();
          });
        });
      }
      if (prevBtn) prevBtn.style.display = images.length > 1 ? 'flex' : 'none';
      if (nextBtn) nextBtn.style.display = images.length > 1 ? 'flex' : 'none';
    }

    function setActive(idx) {
      if (idx === currentIdx) return;
      // Mark the OUTGOING slide so CSS can animate it differently
      // (slide-out direction depends on whether we went forward or back).
      const dir = ((idx - currentIdx + images.length) % images.length) === 1 ? 'next' : 'prev';
      slidesEl.querySelectorAll('.outcome-slide').forEach(s => {
        const sIdx = parseInt(s.dataset.idx);
        s.classList.remove('leaving-next', 'leaving-prev', 'entering-next', 'entering-prev');
        if (sIdx === currentIdx) {
          s.classList.add(dir === 'next' ? 'leaving-next' : 'leaving-prev');
          s.classList.remove('active');
        } else if (sIdx === idx) {
          s.classList.add(dir === 'next' ? 'entering-next' : 'entering-prev');
          s.classList.add('active');
        }
      });
      currentIdx = idx;
      if (dotsEl) {
        dotsEl.querySelectorAll('.outcome-dot').forEach(d => {
          d.classList.toggle('active', parseInt(d.dataset.idx) === idx);
        });
      }
    }

    function goNext() {
      if (images.length < 2) return;
      setActive((currentIdx + 1) % images.length);
    }
    function goPrev() {
      if (images.length < 2) return;
      setActive((currentIdx - 1 + images.length) % images.length);
    }
    function startAutoplay() {
      if (images.length < 2) return;
      autoplayTimer = setInterval(goNext, OUTCOME_CAROUSEL.AUTOPLAY_MS);
    }
    function restartAutoplay() {
      if (autoplayTimer) clearInterval(autoplayTimer);
      startAutoplay();
    }

    if (prevBtn) prevBtn.addEventListener('click', () => { goPrev(); restartAutoplay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { goNext(); restartAutoplay(); });

    // Pause on hover
    const carousel = document.getElementById('outcomeCarousel');
    if (carousel) {
      carousel.addEventListener('mouseenter', () => { if (autoplayTimer) clearInterval(autoplayTimer); });
      carousel.addEventListener('mouseleave', startAutoplay);
    }

    build();
    startAutoplay();
  })();

  // Update hero card module names (no prefix — just the name)
  const heroModules = document.querySelectorAll('.hero-module-text h4');
  const homepageMonthNames = LESSONS.getMonthNames();
  heroModules.forEach((h4, i) => {
    const monthNum = i + 1;
    const name = homepageMonthNames[monthNum] || homepageMonthNames[String(monthNum)];
    if (name) h4.textContent = name;
  });

  // Update curriculum module headers (no prefix — just the name)
  document.querySelectorAll('.curriculum .module-info h3').forEach((h3, i) => {
    const monthNum = i + 1;
    const name = homepageMonthNames[monthNum] || homepageMonthNames[String(monthNum)];
    if (name) h3.textContent = name;
  });

  // Sync curriculum weekly lesson titles + lock indicators from the latest admin data
  const LOCK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  document.querySelectorAll('.curriculum .lesson-item').forEach(link => {
    const href = link.getAttribute('href') || '';
    const match = href.match(/week=(\w+)/);
    if (!match) return;
    const weekId = match[1];
    const lesson = LESSONS.get(weekId);
    if (!lesson || !lesson.title) return;

    const globalWeek = parseInt(weekId.replace(/\D/g, ''), 10);
    const intraWeek = ((globalWeek - 1) % 4) + 1;
    const unlocked = LESSONS.isUnlocked(weekId);

    const icon = link.querySelector('.icon');
    const duration = link.querySelector('.duration');
    // Rebuild: icon + "W{intraWeek}: {title}" + duration badge
    link.innerHTML = '';
    if (icon) link.appendChild(icon);
    link.appendChild(document.createTextNode(' W' + intraWeek + ': ' + lesson.title + ' '));
    // Add lock indicator if locked
    if (!unlocked) {
      const lockSpan = document.createElement('span');
      lockSpan.className = 'lesson-item-lock';
      lockSpan.innerHTML = LOCK_SVG + 'Locked';
      link.appendChild(lockSpan);
      link.classList.add('is-locked');
    } else {
      link.classList.remove('is-locked');
    }
    if (duration) {
      duration.textContent = 'Lesson ' + (lesson.week || globalWeek);
      link.appendChild(duration);
    }
  });
}

// Admin: Site Settings tab
if (currentPage === 'admin.html' && AUTH.isAdmin()) {
  const tagsContainer = document.getElementById('siteTagsContainer');
  const addTagBtn = document.getElementById('addTagBtn');
  const newTagInput = document.getElementById('newTagInput');
  const saveTagsBtn = document.getElementById('saveTagsBtn');
  const saveTitleBtn = document.getElementById('saveSiteTitleBtn');
  const titleInput = document.getElementById('siteSectionTitle');

  // Load current title
  if (titleInput) titleInput.value = SITE_SETTINGS.getTitle();

  // Render tag editor
  function renderTagEditor() {
    if (!tagsContainer) return;
    const tags = SITE_SETTINGS.getTags();
    tagsContainer.innerHTML = tags.map((tag, i) =>
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
      + '<input type="text" class="site-tag-input" value="' + tag.replace(/"/g, '&quot;') + '" data-idx="' + i + '" style="flex:1;">'
      + '<button class="admin-section-remove" data-idx="' + i + '" title="Remove tag">&#10005;</button>'
      + '</div>'
    ).join('');

    // Remove handlers
    tagsContainer.querySelectorAll('.admin-section-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const tags = SITE_SETTINGS.getTags();
        tags.splice(parseInt(btn.dataset.idx), 1);
        SITE_SETTINGS.saveTags(tags);
        renderTagEditor();
      });
    });

    // Inline edit handlers
    tagsContainer.querySelectorAll('.site-tag-input').forEach(input => {
      input.addEventListener('change', () => {
        const tags = SITE_SETTINGS.getTags();
        tags[parseInt(input.dataset.idx)] = input.value.trim();
        SITE_SETTINGS.saveTags(tags);
      });
    });
  }

  renderTagEditor();

  // Add tag
  if (addTagBtn && newTagInput) {
    addTagBtn.addEventListener('click', () => {
      const val = newTagInput.value.trim();
      if (!val) return;
      const tags = SITE_SETTINGS.getTags();
      tags.push(val);
      SITE_SETTINGS.saveTags(tags);
      newTagInput.value = '';
      renderTagEditor();
    });

    newTagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addTagBtn.click(); }
    });
  }

  // Save tags button (with toast)
  if (saveTagsBtn) {
    saveTagsBtn.addEventListener('click', () => {
      // Collect current values from inputs
      const tags = [];
      tagsContainer.querySelectorAll('.site-tag-input').forEach(input => {
        const v = input.value.trim();
        if (v) tags.push(v);
      });
      SITE_SETTINGS.saveTags(tags);
      const toast = document.getElementById('adminToast');
      if (toast) {
        toast.innerHTML = '<span>&#10003;</span> Skill tags saved!';
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
      }
    });
  }

  // Load month names and prefixes
  const monthNames = LESSONS.getMonthNames();
  const monthPrefixes = LESSONS.getMonthPrefixes();
  for (let m = 1; m <= 4; m++) {
    const input = document.getElementById('monthName' + m);
    if (input) input.value = monthNames[m] || monthNames[String(m)] || '';

    const prefixLabel = document.querySelector('.month-prefix-label[data-month="' + m + '"]');
    if (prefixLabel) {
      prefixLabel.textContent = monthPrefixes[m] || monthPrefixes[String(m)] || ('Month ' + m);

      // Prevent line breaks in the editable label
      prefixLabel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          prefixLabel.blur();
        }
      });

      // Auto-save on blur (when user clicks away)
      prefixLabel.addEventListener('blur', () => {
        const prefixes = LESSONS.getMonthPrefixes();
        prefixes[m] = prefixLabel.textContent.trim() || ('Month ' + m);
        if (!prefixLabel.textContent.trim()) prefixLabel.textContent = 'Month ' + m;
        LESSONS.saveMonthPrefixes(prefixes);
      });
    }
  }

  // Save month names + prefixes
  const saveMonthBtn = document.getElementById('saveMonthNamesBtn');
  if (saveMonthBtn) {
    saveMonthBtn.addEventListener('click', () => {
      const names = {};
      const prefixes = {};
      for (let m = 1; m <= 4; m++) {
        const input = document.getElementById('monthName' + m);
        names[m] = input ? input.value.trim() : '';

        const prefixLabel = document.querySelector('.month-prefix-label[data-month="' + m + '"]');
        prefixes[m] = prefixLabel ? (prefixLabel.textContent.trim() || ('Month ' + m)) : ('Month ' + m);
      }
      LESSONS.saveMonthNames(names);
      LESSONS.saveMonthPrefixes(prefixes);
      const toast = document.getElementById('adminToast');
      if (toast) {
        toast.innerHTML = '<span>&#10003;</span> Month labels saved!';
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
      }
    });
  }

  // ===== LOAD & SAVE MONTH DESCRIPTIONS =====
  const currentDescs = LESSONS.getMonthDescriptions();
  for (let m = 1; m <= 4; m++) {
    const input = document.getElementById('monthDesc' + m);
    if (input) input.value = currentDescs[m] || currentDescs[String(m)] || '';
  }

  const saveMonthDescBtn = document.getElementById('saveMonthDescBtn');
  if (saveMonthDescBtn) {
    saveMonthDescBtn.addEventListener('click', () => {
      const descs = {};
      for (let m = 1; m <= 4; m++) {
        const input = document.getElementById('monthDesc' + m);
        descs[m] = input ? input.value.trim() : '';
      }
      LESSONS.saveMonthDescriptions(descs);
      const toast = document.getElementById('adminToast');
      if (toast) {
        toast.innerHTML = '<span>&#10003;</span> Descriptions saved!';
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
      }
    });
  }

  // Save title button
  if (saveTitleBtn && titleInput) {
    saveTitleBtn.addEventListener('click', () => {
      SITE_SETTINGS.saveTitle(titleInput.value.trim());
      const toast = document.getElementById('adminToast');
      if (toast) {
        toast.innerHTML = '<span>&#10003;</span> Section title saved!';
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
      }
    });
  }

  // Testimonials editor
  const testimonialsEditor = document.getElementById('testimonialsEditor');
  const addTestimonialBtn = document.getElementById('addTestimonialBtn');
  const saveTestimonialsBtn = document.getElementById('saveTestimonialsBtn');
  const resetTestimonialsBtn = document.getElementById('resetTestimonialsBtn');

  function renderTestimonialsEditor() {
    if (!testimonialsEditor) return;
    if (typeof TESTIMONIALS === 'undefined') {
      testimonialsEditor.innerHTML = '<p style="color:var(--text-light);padding:20px;text-align:center;">Loading editor… If this persists, hard-refresh the page (Ctrl+Shift+R).</p>';
      return;
    }
    let items = [];
    try { items = TESTIMONIALS.getAll(); } catch (e) { console.error('Testimonials getAll failed:', e); }
    if (!Array.isArray(items) || items.length === 0) {
      items = (TESTIMONIALS.defaultItems || []).map(t => ({ ...t }));
    }
    const esc = (s) => String(s || '').replace(/"/g, '&quot;');
    testimonialsEditor.innerHTML = items.map((t, i) => {
      const ratingOpts = [5,4,3,2,1].map(r => '<option value="' + r + '"' + (parseInt(t.rating) === r ? ' selected' : '') + '>' + r + ' star' + (r > 1 ? 's' : '') + '</option>').join('');
      const initials = TESTIMONIALS.getInitials(t.name);
      const avatarInner = t.avatar
        ? '<img src="' + t.avatar + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">'
        : '<span class="t-initials" style="font-weight:700;font-size:0.95rem;color:var(--primary);">' + initials + '</span>';
      const hasPhoto = !!t.avatar;
      return '<div class="testimonial-row" data-idx="' + i + '" data-avatar="' + (t.avatar || '') + '" style="display:grid;grid-template-columns:64px 1fr auto;gap:12px;align-items:start;padding:16px;border:2px solid var(--border);border-radius:12px;margin-bottom:12px;background:var(--bg);">'
        + '<div class="t-avatar-wrap" style="position:relative;width:64px;">'
        +   '<div class="t-avatar-circle" style="width:64px;height:64px;border-radius:50%;background:var(--primary-glow);overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:pointer;" title="' + (hasPhoto ? 'Click to adjust photo' : 'Click to upload photo') + '">' + avatarInner + '</div>'
        +   '<button type="button" class="t-avatar-upload" data-idx="' + i + '" title="' + (hasPhoto ? 'Replace photo' : 'Upload photo') + '" style="position:absolute;bottom:-4px;right:-4px;width:26px;height:26px;border-radius:50%;background:var(--primary);color:#fff;border:2px solid var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">'
        +     '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
        +   '</button>'
        +   (hasPhoto ? '<button type="button" class="t-avatar-adjust" data-idx="' + i + '" title="Adjust photo" style="position:absolute;bottom:-4px;left:-4px;width:26px;height:26px;border-radius:50%;background:#64748b;color:#fff;border:2px solid var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h14M9 5l-4 4 4 4M15 15l4 4-4 4M19 15H5"/></svg></button>' : '')
        +   (hasPhoto ? '<button type="button" class="t-avatar-clear" data-idx="' + i + '" title="Remove photo" style="position:absolute;top:-4px;right:-4px;width:22px;height:22px;border-radius:50%;background:#ef4444;color:#fff;border:2px solid var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-size:0.7rem;">&#10005;</button>' : '')
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;min-width:0;">'
        +   '<div style="display:grid;grid-template-columns:1fr 1fr 140px;gap:8px;">'
        +     '<input type="text" class="t-name" placeholder="Full name" value="' + esc(t.name) + '" style="padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.9rem;background:var(--surface);color:var(--text);">'
        +     '<input type="text" class="t-role" placeholder="Role / Title" value="' + esc(t.role) + '" style="padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.9rem;background:var(--surface);color:var(--text);">'
        +     '<select class="t-rating" style="padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.9rem;background:var(--surface);color:var(--text);">' + ratingOpts + '</select>'
        +   '</div>'
        +   '<textarea class="t-quote" rows="3" placeholder="Testimonial quote" style="padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.9rem;background:var(--surface);color:var(--text);resize:vertical;">' + String(t.quote || '').replace(/</g, '&lt;') + '</textarea>'
        + '</div>'
        + '<button type="button" class="t-remove" data-idx="' + i + '" title="Remove" style="width:32px;height:32px;border-radius:50%;background:transparent;border:2px solid var(--border);color:var(--text-light);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem;">&#10005;</button>'
      + '</div>';
    }).join('');

    // Live-update avatar initials as name changes (only when no photo)
    testimonialsEditor.querySelectorAll('.testimonial-row').forEach(row => {
      const nameInput = row.querySelector('.t-name');
      const initialsEl = row.querySelector('.t-initials');
      if (nameInput && initialsEl) {
        nameInput.addEventListener('input', () => {
          initialsEl.textContent = TESTIMONIALS.getInitials(nameInput.value);
        });
      }
      // Click avatar or upload button -> trigger file input
      const avatarCircle = row.querySelector('.t-avatar-circle');
      const uploadBtn = row.querySelector('.t-avatar-upload');
      const triggerUpload = (idx) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        input.addEventListener('change', async (ev) => {
          const file = ev.target.files && ev.target.files[0];
          if (!file) return;
          if (file.size > TESTIMONIALS.MAX_SIZE) { alert('Image must be under 10MB.'); return; }
          try {
            const rawDataUrl = await TESTIMONIALS.readFileAsDataURL(file);
            const adjusted = await TESTIMONIALS.openAdjuster(rawDataUrl);
            if (!adjusted) return; // user cancelled
            const current = collectTestimonialsFromDOM();
            if (current[idx]) current[idx].avatar = adjusted;
            TESTIMONIALS.save(current);
            renderTestimonialsEditor();
          } catch (err) {
            console.error('Avatar upload failed:', err);
            alert('Could not process image. Try a different one.');
          }
        });
        document.body.appendChild(input);
        input.click();
        setTimeout(() => input.remove(), 0);
      };
      const adjustExisting = async (idx) => {
        const current = collectTestimonialsFromDOM();
        const existing = current[idx] && current[idx].avatar;
        if (!existing) { triggerUpload(idx); return; }
        try {
          const adjusted = await TESTIMONIALS.openAdjuster(existing);
          if (!adjusted) return;
          if (current[idx]) current[idx].avatar = adjusted;
          TESTIMONIALS.save(current);
          renderTestimonialsEditor();
        } catch (err) {
          console.error('Adjust failed:', err);
        }
      };

      // Clicking the circle: adjust if photo exists, else open file picker
      if (avatarCircle) avatarCircle.addEventListener('click', () => {
        const idx = parseInt(row.dataset.idx);
        if (row.dataset.avatar) adjustExisting(idx);
        else triggerUpload(idx);
      });
      // Camera button always opens file picker (replace photo)
      if (uploadBtn) uploadBtn.addEventListener('click', (e) => { e.stopPropagation(); triggerUpload(parseInt(uploadBtn.dataset.idx)); });
    });

    // Adjust existing photo button
    testimonialsEditor.querySelectorAll('.t-avatar-adjust').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const current = collectTestimonialsFromDOM();
        const existing = current[idx] && current[idx].avatar;
        if (!existing) return;
        try {
          const adjusted = await TESTIMONIALS.openAdjuster(existing);
          if (!adjusted) return;
          if (current[idx]) current[idx].avatar = adjusted;
          TESTIMONIALS.save(current);
          renderTestimonialsEditor();
        } catch (err) { console.error('Adjust failed:', err); }
      });
    });

    // Remove avatar photo (revert to initials)
    testimonialsEditor.querySelectorAll('.t-avatar-clear').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const current = collectTestimonialsFromDOM();
        if (current[idx]) current[idx].avatar = '';
        TESTIMONIALS.save(current);
        renderTestimonialsEditor();
      });
    });

    testimonialsEditor.querySelectorAll('.t-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const current = collectTestimonialsFromDOM();
        current.splice(idx, 1);
        TESTIMONIALS.save(current);
        renderTestimonialsEditor();
      });
    });
  }

  function collectTestimonialsFromDOM() {
    if (!testimonialsEditor) return [];
    return Array.from(testimonialsEditor.querySelectorAll('.testimonial-row')).map((row, i) => ({
      id: 't_' + i + '_' + Date.now().toString(36),
      name: row.querySelector('.t-name').value.trim(),
      role: row.querySelector('.t-role').value.trim(),
      rating: parseInt(row.querySelector('.t-rating').value) || 5,
      quote: row.querySelector('.t-quote').value.trim(),
      avatar: row.dataset.avatar || ''
    }));
  }

  if (testimonialsEditor) {
    renderTestimonialsEditor();

    if (addTestimonialBtn) {
      addTestimonialBtn.addEventListener('click', () => {
        const current = collectTestimonialsFromDOM();
        current.push({ id: 't_new_' + Date.now(), rating: 5, quote: '', name: '', role: '' });
        if (typeof TESTIMONIALS !== 'undefined') TESTIMONIALS.save(current);
        renderTestimonialsEditor();
      });
    }

    if (saveTestimonialsBtn) {
      saveTestimonialsBtn.addEventListener('click', () => {
        if (typeof TESTIMONIALS === 'undefined') { alert('Editor not loaded yet. Hard-refresh (Ctrl+Shift+R) and try again.'); return; }
        const collected = collectTestimonialsFromDOM().filter(t => t.name || t.quote);
        TESTIMONIALS.save(collected);
        const toast = document.getElementById('adminToast');
        if (toast) {
          toast.innerHTML = '<span>&#10003;</span> Testimonials saved!';
          toast.style.display = 'flex';
          setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }
      });
    }

    if (resetTestimonialsBtn) {
      resetTestimonialsBtn.addEventListener('click', () => {
        if (!confirm('Reset all testimonials to the default 3 cards? This will overwrite any edits.')) return;
        if (typeof TESTIMONIALS === 'undefined') { alert('Editor not loaded yet. Hard-refresh (Ctrl+Shift+R).'); return; }
        // Clear stored so getAll falls back to defaults, then re-save defaults
        safeSetItem(TESTIMONIALS.KEY, JSON.stringify(TESTIMONIALS.defaultItems));
        if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ testimonials: TESTIMONIALS.defaultItems });
        renderTestimonialsEditor();
        const toast = document.getElementById('adminToast');
        if (toast) {
          toast.innerHTML = '<span>&#10003;</span> Testimonials reset to defaults';
          toast.style.display = 'flex';
          setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }
      });
    }
  }

  // ===== ABOUT SECTION EDITOR =====
  const aboutLabelInput = document.getElementById('aboutLabelInput');
  const aboutTitleInput = document.getElementById('aboutTitleInput');
  const aboutDescInput = document.getElementById('aboutDescInput');
  const aboutPillarsEditor = document.getElementById('aboutPillarsEditor');
  const saveAboutBtn = document.getElementById('saveAboutBtn');
  const resetAboutBtn = document.getElementById('resetAboutBtn');

  function renderAboutPillarsEditor() {
    if (!aboutPillarsEditor || typeof ABOUT === 'undefined') return;
    const pillars = ABOUT.getPillars();
    const iconOptions = (typeof SITE_SETTINGS !== 'undefined' && SITE_SETTINGS.ICONS) ? Object.keys(SITE_SETTINGS.ICONS) : ['star', 'award', 'graduation'];
    const colorOptions = (typeof SITE_SETTINGS !== 'undefined' && SITE_SETTINGS.COLORS) ? SITE_SETTINGS.COLORS : ['blue', 'amber', 'green', 'purple', 'pink', 'red', 'teal', 'orange'];
    const esc = (s) => String(s || '').replace(/"/g, '&quot;');

    aboutPillarsEditor.innerHTML = pillars.map((p, i) => {
      const iconOpts = iconOptions.map(k => '<option value="' + k + '"' + (p.icon === k ? ' selected' : '') + '>' + k + '</option>').join('');
      const colorOpts = colorOptions.map(c => '<option value="' + c + '"' + (p.color === c ? ' selected' : '') + '>' + c + '</option>').join('');
      return '<div class="about-pillar-row" data-idx="' + i + '" style="display:grid;grid-template-columns:auto 1fr;gap:12px;padding:16px;border:2px solid var(--border);border-radius:12px;margin-bottom:12px;background:var(--bg);">'
        + '<div class="ap-preview feature-icon ' + (p.color || 'blue') + '" style="width:48px;height:48px;align-self:start;">' + ((typeof SITE_SETTINGS !== 'undefined' && SITE_SETTINGS.renderIcon) ? SITE_SETTINGS.renderIcon(p.icon) : '') + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;">'
        +   '<div style="font-size:0.78rem;font-weight:600;color:var(--text-light);">Pillar ' + (i + 1) + '</div>'
        +   '<input type="text" class="ap-title" placeholder="Pillar title" value="' + esc(p.title) + '" style="padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.9rem;background:var(--surface);color:var(--text);">'
        +   '<textarea class="ap-desc" rows="2" placeholder="Pillar description" style="padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.85rem;background:var(--surface);color:var(--text);resize:vertical;">' + String(p.desc || '').replace(/</g, '&lt;') + '</textarea>'
        +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        +     '<label style="font-size:0.78rem;color:var(--text-light);display:flex;flex-direction:column;gap:4px;">Icon<select class="ap-icon" style="padding:8px 10px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.85rem;background:var(--surface);color:var(--text);">' + iconOpts + '</select></label>'
        +     '<label style="font-size:0.78rem;color:var(--text-light);display:flex;flex-direction:column;gap:4px;">Color<select class="ap-color" style="padding:8px 10px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.85rem;background:var(--surface);color:var(--text);">' + colorOpts + '</select></label>'
        +   '</div>'
        + '</div>'
      + '</div>';
    }).join('');

    // Live preview updates
    aboutPillarsEditor.querySelectorAll('.about-pillar-row').forEach(row => {
      const iconSel = row.querySelector('.ap-icon');
      const colorSel = row.querySelector('.ap-color');
      const preview = row.querySelector('.ap-preview');
      const refresh = () => {
        if (preview && typeof SITE_SETTINGS !== 'undefined' && SITE_SETTINGS.renderIcon) {
          preview.innerHTML = SITE_SETTINGS.renderIcon(iconSel.value);
          if (SITE_SETTINGS.COLORS) SITE_SETTINGS.COLORS.forEach(c => preview.classList.remove(c));
          preview.classList.add(colorSel.value);
        }
      };
      if (iconSel) iconSel.addEventListener('change', refresh);
      if (colorSel) colorSel.addEventListener('change', refresh);
    });
  }

  function collectAboutPillarsFromDOM() {
    if (!aboutPillarsEditor) return [];
    return Array.from(aboutPillarsEditor.querySelectorAll('.about-pillar-row')).map(row => ({
      icon: row.querySelector('.ap-icon').value,
      color: row.querySelector('.ap-color').value,
      title: row.querySelector('.ap-title').value.trim(),
      desc: row.querySelector('.ap-desc').value.trim()
    }));
  }

  if (aboutTitleInput || aboutDescInput || aboutPillarsEditor) {
    // Prefill text
    if (typeof ABOUT !== 'undefined') {
      const t = ABOUT.getText();
      if (aboutLabelInput) aboutLabelInput.value = t.label;
      if (aboutTitleInput) aboutTitleInput.value = t.title;
      if (aboutDescInput) aboutDescInput.value = t.desc;
    }
    renderAboutPillarsEditor();

    // Shared save function (used by both the quick-save button and the bottom save button)
    function saveAboutAll() {
      if (typeof ABOUT === 'undefined') { alert('About module not loaded. Hard-refresh the page.'); return false; }
      const text = {
        label: (aboutLabelInput && aboutLabelInput.value.trim()) || ABOUT.defaultText.label,
        title: (aboutTitleInput && aboutTitleInput.value.trim()) || ABOUT.defaultText.title,
        desc:  (aboutDescInput  && aboutDescInput.value.trim())  || ABOUT.defaultText.desc
      };
      ABOUT.saveText(text);
      const pillars = collectAboutPillarsFromDOM().filter(p => p.title || p.desc);
      ABOUT.savePillars(pillars);
      const toast = document.getElementById('adminToast');
      if (toast) {
        toast.innerHTML = '<span>&#10003;</span> About section saved to landing page!';
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
      }
      return true;
    }

    if (saveAboutBtn) {
      saveAboutBtn.addEventListener('click', saveAboutAll);
    }

    // Quick-save button right after the text fields
    const saveAboutTextBtn = document.getElementById('saveAboutTextBtn');
    const saveAboutTextStatus = document.getElementById('saveAboutTextStatus');
    if (saveAboutTextBtn) {
      saveAboutTextBtn.addEventListener('click', () => {
        if (!saveAboutAll()) return;
        // Also show inline confirmation
        if (saveAboutTextStatus) {
          saveAboutTextStatus.style.display = 'inline';
          setTimeout(() => { saveAboutTextStatus.style.display = 'none'; }, 2500);
        }
      });
    }

    if (resetAboutBtn) {
      resetAboutBtn.addEventListener('click', () => {
        if (!confirm('Reset the About section to default content? This will overwrite your edits.')) return;
        if (typeof ABOUT === 'undefined') return;
        ABOUT.saveText({ ...ABOUT.defaultText });
        ABOUT.savePillars(ABOUT.defaultPillars.map(p => ({ ...p })));
        const t = ABOUT.getText();
        if (aboutLabelInput) aboutLabelInput.value = t.label;
        if (aboutTitleInput) aboutTitleInput.value = t.title;
        if (aboutDescInput) aboutDescInput.value = t.desc;
        renderAboutPillarsEditor();
        const toast = document.getElementById('adminToast');
        if (toast) {
          toast.innerHTML = '<span>&#10003;</span> About section reset to defaults';
          toast.style.display = 'flex';
          setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }
      });
    }
  }

  // Outcome editor (text + carousel)
  const outcomeAdminGrid = document.getElementById('outcomeAdminGrid');
  const outcomeUploadInput = document.getElementById('outcomeUpload');
  const outcomeUploadBtn = document.getElementById('outcomeUploadBtn');
  const outcomeTitleInput = document.getElementById('outcomeTitle');
  const outcomeSubtitleInput = document.getElementById('outcomeSubtitle');
  const outcomeDescInput = document.getElementById('outcomeDesc');
  const saveOutcomeTextBtn = document.getElementById('saveOutcomeTextBtn');

  // Prefill text fields from storage
  if (outcomeTitleInput || outcomeSubtitleInput || outcomeDescInput) {
    const t = OUTCOME_CAROUSEL.getText();
    if (outcomeTitleInput) outcomeTitleInput.value = t.title;
    if (outcomeSubtitleInput) outcomeSubtitleInput.value = t.subtitle;
    if (outcomeDescInput) outcomeDescInput.value = t.desc;
  }

  if (saveOutcomeTextBtn) {
    saveOutcomeTextBtn.addEventListener('click', () => {
      OUTCOME_CAROUSEL.saveText({
        title: (outcomeTitleInput && outcomeTitleInput.value.trim()) || OUTCOME_CAROUSEL.defaultText.title,
        subtitle: (outcomeSubtitleInput && outcomeSubtitleInput.value.trim()) || OUTCOME_CAROUSEL.defaultText.subtitle,
        desc: (outcomeDescInput && outcomeDescInput.value.trim()) || OUTCOME_CAROUSEL.defaultText.desc
      });
      const toast = document.getElementById('adminToast');
      if (toast) {
        toast.innerHTML = '<span>&#10003;</span> Program Outcome text saved!';
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
      }
    });
  }

  // Wire the static upload button to the hidden file input
  if (outcomeUploadBtn && outcomeUploadInput) {
    outcomeUploadBtn.addEventListener('click', () => outcomeUploadInput.click());
  }

  function renderOutcomeAdmin() {
    if (!outcomeAdminGrid) return;
    const images = OUTCOME_CAROUSEL.getAll();
    if (images.length === 0) {
      outcomeAdminGrid.innerHTML = '<p style="grid-column:1/-1;color:var(--text-light);font-size:0.85rem;margin:0;padding:20px 0;text-align:center;">No images yet. Click the button above to upload.</p>';
      return;
    }
    outcomeAdminGrid.innerHTML = images.map(img =>
      '<div class="outcome-admin-tile" data-id="' + img.id + '">'
      + '<img src="' + img.src + '" alt="">'
      + '<button class="outcome-admin-tile-remove" data-id="' + img.id + '" title="Remove">&#10005;</button>'
      + '</div>'
    ).join('');

    // Remove handlers
    outcomeAdminGrid.querySelectorAll('.outcome-admin-tile-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Remove this image from the carousel?')) return;
        OUTCOME_CAROUSEL.remove(btn.dataset.id);
        renderOutcomeAdmin();
        const toast = document.getElementById('adminToast');
        if (toast) {
          toast.innerHTML = '<span>&#10003;</span> Image removed';
          toast.style.display = 'flex';
          setTimeout(() => { toast.style.display = 'none'; }, 2500);
        }
      });
    });
  }

  if (outcomeAdminGrid) {
    renderOutcomeAdmin();
    if (outcomeUploadInput) {
      outcomeUploadInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const toast = document.getElementById('adminToast');

        // Show loading state on the upload button
        const btn = outcomeUploadBtn;
        const originalBtnHTML = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = 'Processing…'; }

        let added = 0;
        let failed = 0;
        for (const file of files) {
          if (!file.type || !file.type.startsWith('image/')) { failed++; continue; }
          if (file.size > OUTCOME_CAROUSEL.MAX_SIZE) {
            alert('"' + file.name + '" is too large (over 10MB). Please use a smaller image.');
            failed++;
            continue;
          }
          try {
            const compressedDataUrl = await OUTCOME_CAROUSEL.compressFile(file);
            const result = OUTCOME_CAROUSEL.add(compressedDataUrl);
            if (!result.ok) {
              if (result.reason === 'max') {
                alert('Reached max ' + OUTCOME_CAROUSEL.MAX_COUNT + ' images. Remove one first.');
              } else if (result.reason === 'storage') {
                alert('Browser storage is full. Remove some images first.');
              }
              failed++;
              break;
            }
            added++;
          } catch (err) {
            console.error('Upload failed for', file.name, err);
            alert('Could not process "' + file.name + '". Try a different image.');
            failed++;
          }
        }

        outcomeUploadInput.value = '';
        renderOutcomeAdmin();
        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHTML; }

        if (toast && added > 0) {
          toast.innerHTML = '<span>&#10003;</span> ' + added + ' image' + (added > 1 ? 's' : '') + ' added' + (failed > 0 ? ' (' + failed + ' skipped)' : '') + '!';
          toast.style.display = 'flex';
          setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }
      });
    }
  }

  // Feature cards editor
  const featureCardsEditor = document.getElementById('featureCardsEditor');
  const saveFeatureCardsBtn = document.getElementById('saveFeatureCardsBtn');
  const resetFeatureCardsBtn = document.getElementById('resetFeatureCardsBtn');

  function renderFeatureCardsEditor() {
    if (!featureCardsEditor) return;
    const features = SITE_SETTINGS.getFeatures();
    const iconOptions = Object.keys(SITE_SETTINGS.ICONS);
    const colorOptions = SITE_SETTINGS.COLORS;

    featureCardsEditor.innerHTML = features.map((f, i) => {
      const iconOpts = iconOptions.map(key =>
        '<option value="' + key + '"' + (f.icon === key ? ' selected' : '') + '>' + key + '</option>'
      ).join('');
      const colorOpts = colorOptions.map(c =>
        '<option value="' + c + '"' + (f.color === c ? ' selected' : '') + '>' + c + '</option>'
      ).join('');

      return '<div class="feature-card-row" data-idx="' + i + '" style="display:grid;grid-template-columns:auto 1fr;gap:12px;padding:16px;border:2px solid var(--border);border-radius:12px;margin-bottom:12px;background:var(--bg);">'
        + '<div class="feature-card-preview feature-icon ' + (f.color || 'blue') + '" style="width:48px;height:48px;align-self:start;">' + SITE_SETTINGS.renderIcon(f.icon) + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;">'
        +   '<div style="display:flex;gap:8px;align-items:center;font-size:0.78rem;color:var(--text-light);font-weight:600;">Card ' + (i + 1) + '</div>'
        +   '<input type="text" class="fc-title" placeholder="Card title" value="' + (f.title || '').replace(/"/g, '&quot;') + '" style="padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.9rem;background:var(--surface);color:var(--text);">'
        +   '<textarea class="fc-desc" rows="2" placeholder="Card description" style="padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.85rem;background:var(--surface);color:var(--text);resize:vertical;">' + (f.desc || '').replace(/</g, '&lt;') + '</textarea>'
        +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        +     '<label style="font-size:0.78rem;color:var(--text-light);display:flex;flex-direction:column;gap:4px;">Icon'
        +       '<select class="fc-icon" style="padding:8px 10px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.85rem;background:var(--surface);color:var(--text);">' + iconOpts + '</select>'
        +     '</label>'
        +     '<label style="font-size:0.78rem;color:var(--text-light);display:flex;flex-direction:column;gap:4px;">Color'
        +       '<select class="fc-color" style="padding:8px 10px;border:2px solid var(--border);border-radius:8px;font-family:inherit;font-size:0.85rem;background:var(--surface);color:var(--text);">' + colorOpts + '</select>'
        +     '</label>'
        +   '</div>'
        + '</div>'
      + '</div>';
    }).join('');

    // Live-update preview icon/color when dropdowns change
    featureCardsEditor.querySelectorAll('.feature-card-row').forEach(row => {
      const idx = parseInt(row.dataset.idx);
      const iconSel = row.querySelector('.fc-icon');
      const colorSel = row.querySelector('.fc-color');
      const preview = row.querySelector('.feature-card-preview');
      function refreshPreview() {
        preview.innerHTML = SITE_SETTINGS.renderIcon(iconSel.value);
        SITE_SETTINGS.COLORS.forEach(c => preview.classList.remove(c));
        preview.classList.add(colorSel.value);
      }
      iconSel.addEventListener('change', refreshPreview);
      colorSel.addEventListener('change', refreshPreview);
    });
  }

  if (featureCardsEditor) {
    renderFeatureCardsEditor();

    if (saveFeatureCardsBtn) {
      saveFeatureCardsBtn.addEventListener('click', () => {
        const rows = featureCardsEditor.querySelectorAll('.feature-card-row');
        const features = Array.from(rows).map(row => ({
          icon: row.querySelector('.fc-icon').value,
          color: row.querySelector('.fc-color').value,
          title: row.querySelector('.fc-title').value.trim(),
          desc: row.querySelector('.fc-desc').value.trim()
        }));
        SITE_SETTINGS.saveFeatures(features);
        const toast = document.getElementById('adminToast');
        if (toast) {
          toast.innerHTML = '<span>&#10003;</span> Feature cards saved!';
          toast.style.display = 'flex';
          setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }
      });
    }

    if (resetFeatureCardsBtn) {
      resetFeatureCardsBtn.addEventListener('click', () => {
        if (!confirm('Reset all 6 feature cards to their default titles, descriptions, icons, and colors?')) return;
        SITE_SETTINGS.saveFeatures(SITE_SETTINGS.defaultFeatures.map(f => ({ ...f })));
        renderFeatureCardsEditor();
        const toast = document.getElementById('adminToast');
        if (toast) {
          toast.innerHTML = '<span>&#10003;</span> Feature cards reset to defaults';
          toast.style.display = 'flex';
          setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }
      });
    }
  }
}

// ============================================================
// STUDENT DASHBOARD
// ============================================================
if (currentPage === 'dashboard.html') {
  try {
    // Helper: relative time string
    const relTime = (iso) => {
      if (!iso) return '';
      const diff = Date.now() - new Date(iso).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      const d = Math.floor(h / 24);
      if (d < 7) return d + 'd ago';
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 1) Welcome name
    const nameEl = document.getElementById('dashName');
    if (nameEl) {
      const n = (typeof AUTH !== 'undefined' && AUTH.getDisplayName) ? (AUTH.getDisplayName() || 'Student') : 'Student';
      nameEl.textContent = n.split(/\s+/)[0] || n;
    }

    // 2) Progress ring
    const completed = (typeof PROGRESS !== 'undefined') ? PROGRESS.getCompletedCount() : 0;
    const pct = (typeof PROGRESS !== 'undefined') ? PROGRESS.getPercentage() : 0;
    const pctEl = document.getElementById('dashPct');
    const fracEl = document.getElementById('dashFrac');
    if (pctEl) pctEl.textContent = pct + '%';
    if (fracEl) fracEl.textContent = completed + ' / 16 lessons';
    const ring = document.querySelector('.progress-ring-fg');
    if (ring) {
      const r = 62;  // must match circle r attr in dashboard.html
      const c = 2 * Math.PI * r;
      ring.setAttribute('stroke-dasharray', c.toString());
      ring.setAttribute('stroke-dashoffset', c.toString()); // start fully hidden
      // Animate to actual value
      setTimeout(() => { ring.setAttribute('stroke-dashoffset', (c - (c * pct / 100)).toString()); }, 100);
    }
    // Progress sub message
    const progressSubEl = document.getElementById('dashProgressSub');
    if (progressSubEl) {
      if (pct === 0) progressSubEl.textContent = "Let's get started!";
      else if (pct < 25) progressSubEl.textContent = 'Great beginning — keep going!';
      else if (pct < 50) progressSubEl.textContent = "You're building momentum!";
      else if (pct < 75) progressSubEl.textContent = 'Over halfway there — awesome!';
      else if (pct < 100) progressSubEl.textContent = 'Almost done — push through!';
      else progressSubEl.textContent = 'Program complete! 🎉';
    }

    // Hero stats
    const hCompleted = document.getElementById('dashHeroCompleted');
    const hRemaining = document.getElementById('dashHeroRemaining');
    if (hCompleted) hCompleted.textContent = completed;
    if (hRemaining) hRemaining.textContent = Math.max(0, 16 - completed);

    // 3) Determine "current lesson" for Continue button, Current Week, and Upcoming
    let currentLesson = null;
    try {
      if (typeof LESSONS !== 'undefined') {
        const all = LESSONS.getAll();
        const lastId = (typeof PROGRESS !== 'undefined') ? PROGRESS.getLastAccessed() : '';
        const lastLesson = lastId ? LESSONS.get(lastId) : null;
        const isUnlockedOrAdmin = (l) => LESSONS.isUnlocked(l.id);
        // Prefer last accessed if unlocked + not yet completed
        if (lastLesson && isUnlockedOrAdmin(lastLesson) && (typeof PROGRESS === 'undefined' || !PROGRESS.isCompleted(lastLesson.id))) {
          currentLesson = lastLesson;
        } else {
          // Next incomplete, published, AND unlocked lesson
          currentLesson = all.find(l =>
            l.published
            && isUnlockedOrAdmin(l)
            && (typeof PROGRESS === 'undefined' || !PROGRESS.isCompleted(l.id))
          ) || null;
        }
        // Fallback: last accessed even if completed, or first lesson
        if (!currentLesson) currentLesson = lastLesson || all[0] || null;
      }
    } catch (e) {}

    // Continue Learning button
    const continueBtn = document.getElementById('dashContinueBtn');
    const continueLabel = document.getElementById('dashContinueLabel');
    if (continueBtn && currentLesson) {
      continueBtn.href = 'lesson.html?week=' + currentLesson.id;
      if (continueLabel) continueLabel.textContent = 'Continue: W' + currentLesson.week + ' — ' + currentLesson.title;
    }

    // Hero "Current week" stat
    const hTime = document.getElementById('dashHeroTimeSpent');
    if (hTime && currentLesson) hTime.textContent = 'W' + currentLesson.week;
    else if (hTime && completed >= 16) hTime.textContent = 'Done';

    // Current Week card
    const weekNumEl = document.getElementById('dashWeekNum');
    const weekTitleEl = document.getElementById('dashWeekTitle');
    const deadlineEl = document.getElementById('dashDeadline');
    if (currentLesson) {
      if (weekNumEl) weekNumEl.textContent = 'Lesson ' + currentLesson.week;
      if (weekTitleEl) weekTitleEl.textContent = currentLesson.title;
      if (deadlineEl) {
        if (currentLesson.assignment && currentLesson.assignment.enabled) {
          deadlineEl.textContent = 'Assignment required';
        } else if (currentLesson.quiz && currentLesson.quiz.enabled) {
          deadlineEl.textContent = 'Quiz required to pass';
        } else {
          deadlineEl.textContent = 'Flexible pace';
        }
      }
    } else if (completed >= 16) {
      if (weekNumEl) weekNumEl.textContent = 'Complete!';
      if (weekTitleEl) weekTitleEl.textContent = 'You finished all 16 lessons.';
      if (deadlineEl) deadlineEl.textContent = 'Download your certificate';
    }

    // Upcoming Lesson reminder
    const reminderTitle = document.getElementById('dashReminderTitle');
    const reminderDesc = document.getElementById('dashReminderDesc');
    const reminderStatus = document.getElementById('dashReminderStatus');
    const reminderLink = document.getElementById('dashReminderLink');
    if (currentLesson) {
      const hasAssignment = currentLesson.assignment && currentLesson.assignment.enabled;
      const hasQuiz = currentLesson.quiz && currentLesson.quiz.enabled;
      if (hasAssignment) {
        if (reminderTitle) reminderTitle.textContent = currentLesson.assignment.title || 'Weekly Assignment';
        if (reminderDesc) reminderDesc.textContent = currentLesson.assignment.description || 'Submit your deliverable for Week ' + currentLesson.week + '.';
        if (reminderStatus) {
          const submitted = (typeof ASSIGNMENTS !== 'undefined') && ASSIGNMENTS.isSubmitted(currentLesson.id);
          reminderStatus.textContent = submitted ? 'Submitted' : 'Pending';
          reminderStatus.className = 'reminder-status ' + (submitted ? 'submitted' : 'pending');
        }
      } else if (hasQuiz) {
        if (reminderTitle) reminderTitle.textContent = 'Lesson ' + currentLesson.week + ' Assessment';
        if (reminderDesc) reminderDesc.textContent = 'Complete the quiz for ' + currentLesson.title + '.';
        if (reminderStatus) {
          const passed = (typeof QUIZ_RESULTS !== 'undefined') && QUIZ_RESULTS.isPassed(currentLesson.id);
          reminderStatus.textContent = passed ? 'Passed' : 'Pending';
          reminderStatus.className = 'reminder-status ' + (passed ? 'submitted' : 'pending');
        }
      } else {
        if (reminderTitle) reminderTitle.textContent = 'Lesson ' + currentLesson.week + ': ' + currentLesson.title;
        if (reminderDesc) reminderDesc.textContent = 'Watch the lesson and mark it as complete.';
        if (reminderStatus) {
          const isDone = (typeof PROGRESS !== 'undefined') && PROGRESS.isCompleted(currentLesson.id);
          reminderStatus.textContent = isDone ? 'Completed' : 'Pending';
          reminderStatus.className = 'reminder-status ' + (isDone ? 'submitted' : 'pending');
        }
      }
      if (reminderLink) reminderLink.href = 'lesson.html?week=' + currentLesson.id;
    }

    // Activity Feed
    const activityEl = document.getElementById('dashActivity');
    const activityCountEl = document.getElementById('dashActivityCount');
    if (activityEl && typeof ACTIVITY !== 'undefined') {
      const events = ACTIVITY.getAll();
      if (activityCountEl) activityCountEl.textContent = events.length + ' event' + (events.length === 1 ? '' : 's');
      if (events.length === 0) {
        activityEl.innerHTML = '<li class="activity-empty">No activity yet. Your lesson views, quizzes, and submissions will show here.</li>';
      } else {
        activityEl.innerHTML = events.slice(0, 10).map(e => {
          const colorMap = {
            lesson_viewed: 'blue',
            lesson_completed: 'green',
            quiz_passed: 'purple',
            quiz_failed: 'amber',
            assignment_submitted: 'pink'
          };
          const color = colorMap[e.type] || 'blue';
          return '<li class="activity-item">'
            + '<div class="activity-icon ' + color + '">' + ACTIVITY.iconFor(e.type) + '</div>'
            + '<div class="activity-body">'
            +   '<strong>' + esc(ACTIVITY.labelFor(e.type)) + '</strong>'
            +   '<span>' + esc(e.title) + '</span>'
            + '</div>'
            + '<time>' + relTime(e.date) + '</time>'
            + '</li>';
        }).join('');
      }
    }

    // ===== Community Feed (POSTS) =====
    renderPosts();
    // ===== Big Wins (WINS) =====
    renderWins();
    // Pull fresh from Firestore + start live listener for the default
    // (Feed) tab so new posts surface in real-time across all students.
    if (typeof POSTS !== 'undefined') {
      POSTS.fetchRemote().then(renderPosts).catch(() => {});
      POSTS.startLiveListener(renderPosts);
    }
    if (typeof WINS !== 'undefined') {
      WINS.fetchRemote().then(renderWins).catch(() => {});
      // Wins listener starts when the Wins tab is opened (saves bandwidth).
    }
  } catch (e) {
    console.error('Dashboard render error:', e);
  }
}

// ============================================================
// COMMUNITY FEED + BIG WINS — Dashboard render + composer handlers
// ============================================================
function _avatarHTML(item) {
  // Avatar ring color depends on the user's role:
  //   admin → gold (.avatar-role-admin)
  //   graduate → blue (.avatar-role-graduate, set when isGraduate is true)
  //   everyone else → no ring (.avatar-role-student or omitted)
  // We add the class to the avatar element itself so the ring
  // wraps the visible avatar regardless of which wrapper div the
  // caller uses (.post-avatar / .comment-avatar / .chat-avatar / etc).
  const role = (item && item.role) || '';
  const isGrad = !!(item && (item.isGraduate || item.graduate));
  const cls = role === 'admin'
    ? ' avatar-role-admin'
    : (isGrad ? ' avatar-role-graduate' : '');
  if (item && item.avatar) return '<img src="' + item.avatar + '" alt="" class="avatar-inner' + cls + '">';
  const initials = (item && item.initials) ? item.initials : 'U';
  return '<span class="avatar-inner' + cls + '">' + initials + '</span>';
}

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Wraps any http(s) URL inside an already-_esc'd string in an
// <a target="_blank"> tag. Long URLs render with a friendlier
// shortened label (host + first 28 chars) but keep the full link
// in href. Use AFTER _esc so we don't double-escape user text.
function _linkify(escapedText) {
  if (!escapedText) return escapedText;
  return String(escapedText).replace(
    /(https?:\/\/[^\s<>"']+)/g,
    function (url) {
      let label = url;
      if (label.length > 60) {
        try {
          const u = new URL(url);
          label = u.hostname + u.pathname.slice(0, 16) + (url.length > u.hostname.length + 16 ? '…' : '');
        } catch (e) {
          label = label.slice(0, 60) + '…';
        }
      }
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="auto-link">' + label + '</a>';
    }
  );
}

function renderPosts() {
  const listEl = document.getElementById('postList');
  const countEl = document.getElementById('feedCount');
  if (!listEl || typeof POSTS === 'undefined') return;
  const posts = POSTS.getAll();
  const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
  const isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
  if (countEl) countEl.textContent = posts.length === 0 ? "Share what's on your mind" : (posts.length + ' post' + (posts.length === 1 ? '' : 's'));
  if (posts.length === 0) {
    listEl.innerHTML = '<div class="post-empty"><div class="post-empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><p>Be the first to post. The community feed is empty.</p></div>';
    return;
  }
  listEl.innerHTML = posts.slice(0, 30).map(p => {
    const canDelete = isAdmin || (me && p.username === me);
    const media = Array.isArray(p.media) ? p.media : [];
    const images = media.filter(m => m && m.type === 'image');
    const video = media.find(m => m && m.type === 'video');
    let mediaHTML = '';
    if (images.length === 1) {
      mediaHTML = '<div class="post-media single"><img src="' + images[0].dataUrl + '" alt="" loading="lazy"></div>';
    } else if (images.length === 2) {
      mediaHTML = '<div class="post-media grid-2">'
        + images.map(im => '<img src="' + im.dataUrl + '" alt="" loading="lazy">').join('')
        + '</div>';
    } else if (images.length === 3) {
      mediaHTML = '<div class="post-media grid-3">'
        + '<img class="span-2" src="' + images[0].dataUrl + '" alt="" loading="lazy">'
        + '<img src="' + images[1].dataUrl + '" alt="" loading="lazy">'
        + '<img src="' + images[2].dataUrl + '" alt="" loading="lazy">'
        + '</div>';
    } else if (images.length >= 4) {
      mediaHTML = '<div class="post-media grid-4">'
        + images.slice(0, 4).map(im => '<img src="' + im.dataUrl + '" alt="" loading="lazy">').join('')
        + '</div>';
    }
    if (video) {
      mediaHTML += '<div class="post-media video"><video src="' + video.dataUrl + '" controls preload="metadata" playsinline></video></div>';
    }
    const comments = Array.isArray(p.comments) ? p.comments.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) : [];
    const commentToggleLabel = comments.length === 0
      ? 'Comment'
      : 'View ' + comments.length + ' comment' + (comments.length === 1 ? '' : 's');
    const editedLabel = p.editedAt
      ? ' <span class="post-edited" title="Last edited ' + new Date(p.editedAt).toLocaleString() + '">(edited)</span>'
      : '';
    return '<article class="post-item" data-id="' + p.id + '">'
      + '<div class="post-avatar">' + _avatarHTML(p) + '</div>'
      + '<div class="post-body">'
      +   '<div class="post-meta"><strong>' + _esc(p.displayName) + '</strong><time>' + timeAgo(p.createdAt) + '</time>' + editedLabel + '</div>'
      +   (p.text ? '<p class="post-text" data-post-id="' + p.id + '">' + _linkify(_esc(p.text)).replace(/\n/g, '<br>') + '</p>' : '<p class="post-text post-text-empty" data-post-id="' + p.id + '" style="display:none;"></p>')
      +   mediaHTML
      +   renderReactionsRow(p, 'posts')
      +   '<div class="post-actions-row">'
      +     '<button type="button" class="post-comment-toggle" data-id="' + p.id + '">'
      +       '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
      +       '<span>' + commentToggleLabel + '</span>'
      +     '</button>'
      +     (function () {
              // BOOKMARKS module is defined at the bottom of script.js,
              // so guard against it being undefined when renderPosts
              // runs during early page init. Without this guard,
              // the whole post render would throw and the feed would
              // appear empty even when posts exist.
              var saved = (typeof BOOKMARKS !== 'undefined' && BOOKMARKS.has) ? BOOKMARKS.has('post', p.id) : false;
              return '<button type="button" class="post-bookmark-btn' + (saved ? ' is-saved' : '') + '" data-id="' + p.id + '" data-bookmark-type="post" aria-label="Save post" title="Save for later">'
                + '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="' + (saved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
                + '<span>' + (saved ? 'Saved' : 'Save') + '</span>'
                + '</button>';
            })()
      +   '</div>'
      +   '<div class="post-comments" id="post-comments-' + p.id + '" hidden>'
      +     '<div class="comments-list">'
      +       comments.map(c => {
              const cMine = me && c.username === me;
              const cCanDelete = isAdmin || cMine;
              return '<div class="comment-item" data-id="' + c.id + '">'
                + '<div class="comment-avatar">' + _avatarHTML(c) + '</div>'
                + '<div class="comment-body">'
                +   '<div class="comment-bubble">'
                +     '<strong>' + _esc(c.displayName) + '</strong>'
                +     '<p>' + _linkify(_esc(c.text)).replace(/\n/g, '<br>') + '</p>'
                +   '</div>'
                +   '<div class="comment-meta"><time>' + timeAgo(c.createdAt) + '</time>'
                +     (cCanDelete ? '<button type="button" class="comment-delete-btn" data-post-id="' + p.id + '" data-comment-id="' + c.id + '">Delete</button>' : '')
                +   '</div>'
                + '</div>'
                + '</div>';
            }).join('')
      +     '</div>'
      +     '<form class="comment-composer" data-post-id="' + p.id + '">'
      +       '<div class="comment-avatar comment-avatar-me">' + _avatarHTML({ avatar: (typeof AUTH !== "undefined" && AUTH.getAvatarImage) ? AUTH.getAvatarImage() : null, initials: (typeof AUTH !== "undefined" && AUTH.getInitials) ? AUTH.getInitials() : "U" }) + '</div>'
      +       '<input type="text" class="comment-input" maxlength="500" placeholder="Write a comment…" autocomplete="off">'
      +       '<button type="submit" class="comment-send-btn" disabled aria-label="Post comment">'
      +         '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
      +       '</button>'
      +     '</form>'
      +   '</div>'
      + '</div>'
      + (canDelete
          ? '<div class="post-actions-corner" data-id="' + p.id + '">'
            +   '<button type="button" class="post-corner-btn post-edit-btn" data-id="' + p.id + '" aria-label="Edit post" title="Edit">'
            +     '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
            +   '</button>'
            +   '<button type="button" class="post-corner-btn post-corner-btn-danger post-delete-btn" data-id="' + p.id + '" aria-label="Delete post" title="Delete">'
            +     '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>'
            +   '</button>'
            + '</div>'
          : '')
      + '</article>';
  }).join('');
  bindReactions(listEl, renderPosts);

  // ----- Inline edit — turn the .post-text into a textarea -----
  listEl.querySelectorAll('.post-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const article = listEl.querySelector('.post-item[data-id="' + id + '"]');
      const textEl = article && article.querySelector('.post-text');
      if (!article || !textEl) return;

      // Pull the raw text from the stored post (not the rendered
      // HTML, which has linkified anchors and <br> tags inside).
      const post = (POSTS.getAll() || []).find(x => x.id === id);
      const rawText = post ? (post.text || '') : '';

      // Replace the <p> with an editor container.
      const editor = document.createElement('div');
      editor.className = 'post-editor';
      editor.dataset.id = id;
      editor.innerHTML =
          '<textarea class="post-editor-textarea" maxlength="500" rows="3" placeholder="Edit your post…">' + _esc(rawText) + '</textarea>'
        + '<div class="post-editor-actions">'
        +   '<span class="post-editor-count"><span class="post-editor-count-num">' + rawText.length + '</span> / 500</span>'
        +   '<button type="button" class="btn-outline-mini post-editor-cancel">Cancel</button>'
        +   '<button type="button" class="btn-primary-mini post-editor-save">Save</button>'
        + '</div>';
      textEl.style.display = 'none';
      textEl.insertAdjacentElement('afterend', editor);

      const ta = editor.querySelector('.post-editor-textarea');
      const countEl = editor.querySelector('.post-editor-count-num');
      const saveBtn = editor.querySelector('.post-editor-save');
      const cancelBtn = editor.querySelector('.post-editor-cancel');

      // Auto-resize textarea to content height
      function autosize() {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 480) + 'px';
      }
      autosize();
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
      ta.addEventListener('input', () => {
        autosize();
        if (countEl) countEl.textContent = ta.value.length;
      });

      function cleanup() {
        editor.remove();
        textEl.style.display = '';
      }
      cancelBtn.addEventListener('click', cleanup);

      saveBtn.addEventListener('click', () => {
        const newText = ta.value.trim();
        if (newText === rawText) { cleanup(); return; }
        const updated = POSTS.update(id, newText);
        if (!updated) {
          if (window.toast) toast('Post cannot be empty', 'warn');
          return;
        }
        if (window.toast) toast('Post updated', 'success');
        renderPosts();
      });

      // Cmd/Ctrl+Enter saves
      ta.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveBtn.click(); }
        if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
      });
    });
  });

  // Wire standalone delete (X) button
  listEl.querySelectorAll('.post-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this post?')) return;
      POSTS.remove(btn.dataset.id);
      renderPosts();
    });
  });
  // Wire comment toggle (open/close the comments panel)
  listEl.querySelectorAll('.post-comment-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const panel = document.getElementById('post-comments-' + id);
      if (!panel) return;
      const willOpen = panel.hasAttribute('hidden');
      if (willOpen) {
        panel.removeAttribute('hidden');
        const input = panel.querySelector('.comment-input');
        if (input) setTimeout(() => input.focus(), 50);
      } else {
        panel.setAttribute('hidden', '');
      }
    });
  });
  // Wire bookmark/save button
  listEl.querySelectorAll('.post-bookmark-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof BOOKMARKS === 'undefined' || !BOOKMARKS.toggle) return;
      const id = btn.dataset.id;
      const type = btn.dataset.bookmarkType || 'post';
      const nowSaved = BOOKMARKS.toggle(type, id);
      btn.classList.toggle('is-saved', nowSaved);
      const svg = btn.querySelector('svg');
      const label = btn.querySelector('span');
      if (svg) svg.setAttribute('fill', nowSaved ? 'currentColor' : 'none');
      if (label) label.textContent = nowSaved ? 'Saved' : 'Save';
      if (typeof window.toast === 'function') {
        window.toast(nowSaved ? 'Saved to your bookmarks' : 'Removed from bookmarks', 'success', 2200);
      }
    });
  });
  // Wire comment composer submit
  listEl.querySelectorAll('.comment-composer').forEach(form => {
    const input = form.querySelector('.comment-input');
    const sendBtn = form.querySelector('.comment-send-btn');
    const updateState = () => { if (sendBtn) sendBtn.disabled = !(input && input.value.trim().length > 0); };
    if (input) input.addEventListener('input', updateState);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input || !input.value.trim()) return;
      POSTS.addComment(form.dataset.postId, input.value);
      input.value = '';
      updateState();
      renderPosts();
      if (typeof checkBadges === 'function') checkBadges();
    });
  });
  // Wire comment delete
  listEl.querySelectorAll('.comment-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this comment?')) return;
      POSTS.removeComment(btn.dataset.postId, btn.dataset.commentId);
      renderPosts();
    });
  });
}

function renderWins() {
  const listEl = document.getElementById('winsList');
  if (!listEl || typeof WINS === 'undefined') return;
  const wins = WINS.getAll();
  const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
  const isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
  if (wins.length === 0) {
    listEl.innerHTML = '<div class="wins-empty"><div class="wins-empty-icon">&#127881;</div><p>No wins shared yet. Drop yours and start the celebration.</p></div>';
    return;
  }
  listEl.innerHTML = wins.slice(0, 20).map(w => {
    const canDelete = isAdmin || (me && w.username === me);
    const media = Array.isArray(w.media) ? w.media : [];
    const images = media.filter(m => m && m.type === 'image');
    const video = media.find(m => m && m.type === 'video');
    let mediaHTML = '';
    if (images.length === 1) {
      mediaHTML = '<div class="post-media single"><img src="' + images[0].dataUrl + '" alt="" loading="lazy"></div>';
    } else if (images.length === 2) {
      mediaHTML = '<div class="post-media grid-2">' + images.map(im => '<img src="' + im.dataUrl + '" alt="" loading="lazy">').join('') + '</div>';
    } else if (images.length === 3) {
      mediaHTML = '<div class="post-media grid-3">'
        + '<img class="span-2" src="' + images[0].dataUrl + '" alt="" loading="lazy">'
        + '<img src="' + images[1].dataUrl + '" alt="" loading="lazy">'
        + '<img src="' + images[2].dataUrl + '" alt="" loading="lazy">'
        + '</div>';
    } else if (images.length >= 4) {
      mediaHTML = '<div class="post-media grid-4">' + images.slice(0, 4).map(im => '<img src="' + im.dataUrl + '" alt="" loading="lazy">').join('') + '</div>';
    }
    if (video) {
      mediaHTML += '<div class="post-media video"><video src="' + video.dataUrl + '" controls preload="metadata" playsinline></video></div>';
    }
    const editedLabel = w.editedAt
      ? ' <span class="post-edited" title="Last edited ' + new Date(w.editedAt).toLocaleString() + '">(edited)</span>'
      : '';
    return '<article class="win-item" data-id="' + w.id + '">'
      + '<div class="win-trophy">&#127942;</div>'
      + '<div class="win-body">'
      +   '<h4 class="win-title" data-win-id="' + w.id + '">' + _esc(w.title) + '</h4>'
      +   '<p class="win-desc" data-win-id="' + w.id + '"' + (w.description ? '' : ' style="display:none;"') + '>' + (w.description ? _linkify(_esc(w.description)).replace(/\n/g, '<br>') : '') + '</p>'
      +   mediaHTML
      +   '<div class="win-meta"><span class="win-author">' + _esc(w.displayName) + '</span><time>' + timeAgo(w.createdAt) + '</time>' + editedLabel + '</div>'
      +   renderReactionsRow(w, 'wins')
      + '</div>'
      + (canDelete
          ? '<div class="post-actions-corner" data-id="' + w.id + '">'
            +   '<button type="button" class="post-corner-btn win-edit-btn" data-id="' + w.id + '" aria-label="Edit win" title="Edit">'
            +     '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
            +   '</button>'
            +   '<button type="button" class="post-corner-btn post-corner-btn-danger win-delete-btn" data-id="' + w.id + '" aria-label="Delete win" title="Delete">'
            +     '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>'
            +   '</button>'
            + '</div>'
          : '')
      + '</article>';
  }).join('');
  bindReactions(listEl, renderWins);

  listEl.querySelectorAll('.win-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const article = listEl.querySelector('.win-item[data-id="' + id + '"]');
      const titleEl = article && article.querySelector('.win-title');
      const descEl = article && article.querySelector('.win-desc');
      if (!article || !titleEl) return;
      const win = (WINS.getAll() || []).find(x => x.id === id);
      const rawTitle = win ? (win.title || '') : '';
      const rawDesc = win ? (win.description || '') : '';

      const editor = document.createElement('div');
      editor.className = 'post-editor';
      editor.dataset.id = id;
      editor.innerHTML =
          '<input type="text" class="post-editor-input" maxlength="120" placeholder="Title" value="' + _esc(rawTitle).replace(/"/g, '&quot;') + '">'
        + '<textarea class="post-editor-textarea" maxlength="400" rows="3" placeholder="Description…">' + _esc(rawDesc) + '</textarea>'
        + '<div class="post-editor-actions">'
        +   '<button type="button" class="btn-outline-mini post-editor-cancel">Cancel</button>'
        +   '<button type="button" class="btn-primary-mini post-editor-save">Save</button>'
        + '</div>';
      titleEl.style.display = 'none';
      if (descEl) descEl.style.display = 'none';
      titleEl.insertAdjacentElement('afterend', editor);

      const titleI = editor.querySelector('.post-editor-input');
      const ta = editor.querySelector('.post-editor-textarea');
      function autosize() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 480) + 'px'; }
      autosize();
      setTimeout(() => titleI.focus(), 30);
      ta.addEventListener('input', autosize);

      function cleanup() {
        editor.remove();
        titleEl.style.display = '';
        if (descEl && rawDesc) descEl.style.display = '';
      }
      editor.querySelector('.post-editor-cancel').addEventListener('click', cleanup);
      editor.querySelector('.post-editor-save').addEventListener('click', () => {
        const newTitle = titleI.value.trim();
        const newDesc = ta.value;
        if (!newTitle) { if (window.toast) toast('Title cannot be empty', 'warn'); return; }
        if (newTitle === rawTitle && newDesc.trim() === rawDesc) { cleanup(); return; }
        WINS.update(id, { title: newTitle, description: newDesc });
        if (window.toast) toast('Win updated', 'success');
        renderWins();
      });
      ta.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { editor.querySelector('.post-editor-save').click(); }
        if (e.key === 'Escape') cleanup();
      });
    });
  });

  listEl.querySelectorAll('.win-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this win?')) return;
      WINS.remove(btn.dataset.id);
      renderWins();
    });
  });
}

function bindCommunityComposers() {
  // Composer avatar setup
  const composerAvatar = document.getElementById('composerAvatar');
  if (composerAvatar && typeof AUTH !== 'undefined') {
    const avatar = AUTH.getAvatarImage && AUTH.getAvatarImage();
    const initials = AUTH.getInitials ? AUTH.getInitials() : 'U';
    composerAvatar.innerHTML = avatar ? '<img src="' + avatar + '" alt="">' : '<span>' + initials + '</span>';
  }

  // Set first name in the Facebook-style trigger placeholder
  const composerFirstName = document.getElementById('composerFirstName');
  if (composerFirstName && typeof AUTH !== 'undefined') {
    const display = AUTH.getDisplayName ? AUTH.getDisplayName() : 'friend';
    composerFirstName.textContent = (display.split(/\s+/)[0] || 'friend');
  }

  // Facebook-style trigger: click expands the textarea composer
  const composerTrigger = document.getElementById('composerTrigger');
  const composerExpanded = document.getElementById('composerExpanded');
  const composerCancel = document.getElementById('composerCancelBtn');
  if (composerTrigger && composerExpanded) {
    composerTrigger.addEventListener('click', () => {
      composerExpanded.style.display = 'block';
      composerTrigger.style.display = 'none';
      const ta = document.getElementById('postText');
      if (ta) ta.focus();
    });
  }
  if (composerCancel && composerExpanded && composerTrigger) {
    composerCancel.addEventListener('click', () => {
      composerExpanded.style.display = 'none';
      composerTrigger.style.display = '';
      const ta = document.getElementById('postText');
      if (ta) ta.value = '';
      const cc = document.getElementById('postCharCount');
      if (cc) cc.textContent = '0 / 500';
      const sb = document.getElementById('postSubmitBtn');
      if (sb) sb.disabled = true;
    });
  }

  // Post composer (text + media)
  const postText = document.getElementById('postText');
  const postSubmit = document.getElementById('postSubmitBtn');
  const postCharCount = document.getElementById('postCharCount');
  const composerImageInput = document.getElementById('composerImageInput');
  const composerVideoInput = document.getElementById('composerVideoInput');
  const composerAddImageBtn = document.getElementById('composerAddImageBtn');
  const composerAddVideoBtn = document.getElementById('composerAddVideoBtn');
  const composerMediaPreview = document.getElementById('composerMediaPreview');
  let composerMedia = []; // [{type:'image'|'video', dataUrl, name}]

  function renderComposerMedia() {
    if (!composerMediaPreview) return;
    if (composerMedia.length === 0) {
      composerMediaPreview.innerHTML = '';
      composerMediaPreview.style.display = 'none';
      return;
    }
    composerMediaPreview.style.display = 'flex';
    composerMediaPreview.innerHTML = composerMedia.map((m, i) => {
      if (m.type === 'image') {
        return '<div class="composer-media-item">'
          + '<img src="' + m.dataUrl + '" alt="">'
          + '<button type="button" class="composer-media-remove" data-idx="' + i + '" aria-label="Remove">&times;</button>'
          + '</div>';
      }
      return '<div class="composer-media-item video">'
        + '<video src="' + m.dataUrl + '" muted preload="metadata"></video>'
        + '<span class="composer-media-vidlabel">'
        + '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="8 5 19 12 8 19 8 5"/></svg>'
        + 'Video'
        + '</span>'
        + '<button type="button" class="composer-media-remove" data-idx="' + i + '" aria-label="Remove">&times;</button>'
        + '</div>';
    }).join('');
    composerMediaPreview.querySelectorAll('.composer-media-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        composerMedia.splice(parseInt(btn.dataset.idx), 1);
        renderComposerMedia();
        if (typeof updatePostState === 'function') updatePostState();
      });
    });
  }

  if (composerAddImageBtn && composerImageInput) {
    composerAddImageBtn.addEventListener('click', () => composerImageInput.click());
    composerImageInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const imageCount = composerMedia.filter(m => m.type === 'image').length;
      const room = POSTS.MAX_IMAGES - imageCount;
      if (room <= 0) {
        alert('Up to ' + POSTS.MAX_IMAGES + ' photos per post.');
        composerImageInput.value = '';
        return;
      }
      const toCompress = files.slice(0, room);
      for (const file of toCompress) {
        if (!file.type.startsWith('image/')) continue;
        try {
          const dataUrl = (typeof OUTCOME_CAROUSEL !== 'undefined' && OUTCOME_CAROUSEL.compressFile)
            ? await OUTCOME_CAROUSEL.compressFile(file)
            : await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.onerror = () => rej(new Error('read failed'));
                r.readAsDataURL(file);
              });
          composerMedia.push({ type: 'image', dataUrl: dataUrl, name: file.name });
        } catch (err) {
          console.error('[POSTS] image compress failed:', err);
        }
      }
      composerImageInput.value = '';
      renderComposerMedia();
      if (typeof updatePostState === 'function') updatePostState();
    });
  }

  if (composerAddVideoBtn && composerVideoInput) {
    composerAddVideoBtn.addEventListener('click', () => composerVideoInput.click());
    composerVideoInput.addEventListener('change', (e) => {
      const file = (e.target.files || [])[0];
      composerVideoInput.value = '';
      if (!file) return;
      if (!file.type.startsWith('video/')) {
        alert('Please pick a video file.');
        return;
      }
      if (file.size > POSTS.MAX_VIDEO_BYTES) {
        alert('Video is ' + Math.round(file.size / 1024 / 1024) + ' MB. Max is ' + Math.round(POSTS.MAX_VIDEO_BYTES / 1024 / 1024) + ' MB.');
        return;
      }
      // One video per post
      composerMedia = composerMedia.filter(m => m.type !== 'video');
      const reader = new FileReader();
      reader.onload = (ev) => {
        composerMedia.push({ type: 'video', dataUrl: ev.target.result, name: file.name });
        renderComposerMedia();
        if (typeof updatePostState === 'function') updatePostState();
      };
      reader.onerror = () => alert('Failed to read video.');
      reader.readAsDataURL(file);
    });
  }

  let updatePostState;
  if (postText && postSubmit) {
    updatePostState = () => {
      const len = postText.value.trim().length;
      if (postCharCount) postCharCount.textContent = postText.value.length + ' / 500';
      // Allow posting with text-only OR media-only (or both)
      postSubmit.disabled = (len === 0 && composerMedia.length === 0);
    };
    postText.addEventListener('input', updatePostState);
    postSubmit.addEventListener('click', () => {
      if (postText.value.trim().length === 0 && composerMedia.length === 0) return;
      POSTS.add(postText.value, composerMedia);
      postText.value = '';
      composerMedia = [];
      renderComposerMedia();
      updatePostState();
      // Collapse the composer after posting
      if (composerExpanded && composerTrigger) {
        composerExpanded.style.display = 'none';
        composerTrigger.style.display = '';
      }
      renderPosts();
      if (typeof checkBadges === 'function') checkBadges();
    });
    updatePostState();
  }

  // Reset media when Cancel is clicked too
  if (composerCancel) {
    composerCancel.addEventListener('click', () => {
      composerMedia = [];
      renderComposerMedia();
    });
  }

  // Win composer (always visible card with media uploads)
  const winTitle = document.getElementById('winTitle');
  const winDescription = document.getElementById('winDescription');
  const winSubmit = document.getElementById('winSubmitBtn');
  const winClear = document.getElementById('winClearBtn');
  const winMediaPreview = document.getElementById('winMediaPreview');
  const winImageInput = document.getElementById('winImageInput');
  const winVideoInput = document.getElementById('winVideoInput');
  const winAddImageBtn = document.getElementById('winAddImageBtn');
  const winAddVideoBtn = document.getElementById('winAddVideoBtn');
  let winMedia = []; // [{type, dataUrl, name}]

  function renderWinMedia() {
    if (!winMediaPreview) return;
    if (winMedia.length === 0) {
      winMediaPreview.innerHTML = '';
      winMediaPreview.style.display = 'none';
      return;
    }
    winMediaPreview.style.display = 'flex';
    winMediaPreview.innerHTML = winMedia.map((m, i) => {
      if (m.type === 'image') {
        return '<div class="composer-media-item">'
          + '<img src="' + m.dataUrl + '" alt="">'
          + '<button type="button" class="composer-media-remove" data-idx="' + i + '" aria-label="Remove">&times;</button>'
          + '</div>';
      }
      return '<div class="composer-media-item video">'
        + '<video src="' + m.dataUrl + '" muted preload="metadata"></video>'
        + '<span class="composer-media-vidlabel"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="8 5 19 12 8 19 8 5"/></svg>Video</span>'
        + '<button type="button" class="composer-media-remove" data-idx="' + i + '" aria-label="Remove">&times;</button>'
        + '</div>';
    }).join('');
    winMediaPreview.querySelectorAll('.composer-media-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        winMedia.splice(parseInt(btn.dataset.idx), 1);
        renderWinMedia();
        if (typeof updateWinState === 'function') updateWinState();
      });
    });
  }

  if (winAddImageBtn && winImageInput) {
    winAddImageBtn.addEventListener('click', () => winImageInput.click());
    winImageInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const imageCount = winMedia.filter(m => m.type === 'image').length;
      const room = 4 - imageCount;
      if (room <= 0) {
        alert('Up to 4 photos per win.');
        winImageInput.value = '';
        return;
      }
      const toCompress = files.slice(0, room);
      for (const file of toCompress) {
        if (!file.type.startsWith('image/')) continue;
        try {
          const dataUrl = (typeof OUTCOME_CAROUSEL !== 'undefined' && OUTCOME_CAROUSEL.compressFile)
            ? await OUTCOME_CAROUSEL.compressFile(file)
            : await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.onerror = () => rej(new Error('read failed'));
                r.readAsDataURL(file);
              });
          winMedia.push({ type: 'image', dataUrl: dataUrl, name: file.name });
        } catch (err) {
          console.error('[WINS] image compress failed:', err);
        }
      }
      winImageInput.value = '';
      renderWinMedia();
      updateWinState();
    });
  }

  if (winAddVideoBtn && winVideoInput) {
    winAddVideoBtn.addEventListener('click', () => winVideoInput.click());
    winVideoInput.addEventListener('change', (e) => {
      const file = (e.target.files || [])[0];
      winVideoInput.value = '';
      if (!file) return;
      if (!file.type.startsWith('video/')) { alert('Please pick a video file.'); return; }
      const MAX_VIDEO = 8 * 1024 * 1024;
      if (file.size > MAX_VIDEO) {
        alert('Video is ' + Math.round(file.size / 1024 / 1024) + ' MB. Max is 8 MB.');
        return;
      }
      winMedia = winMedia.filter(m => m.type !== 'video');
      const reader = new FileReader();
      reader.onload = (ev) => {
        winMedia.push({ type: 'video', dataUrl: ev.target.result, name: file.name });
        renderWinMedia();
        updateWinState();
      };
      reader.onerror = () => alert('Failed to read video.');
      reader.readAsDataURL(file);
    });
  }

  function updateWinState() {
    if (!winSubmit || !winTitle) return;
    // Allow celebrate when there's a title (media optional)
    winSubmit.disabled = winTitle.value.trim().length === 0;
  }

  if (winClear) {
    winClear.addEventListener('click', () => {
      if (winTitle) winTitle.value = '';
      if (winDescription) winDescription.value = '';
      winMedia = [];
      renderWinMedia();
      updateWinState();
    });
  }
  if (winTitle) winTitle.addEventListener('input', updateWinState);
  if (winSubmit) {
    winSubmit.addEventListener('click', () => {
      if (!winTitle || !winTitle.value.trim()) return;
      WINS.add(winTitle.value, winDescription ? winDescription.value : '', winMedia);
      winTitle.value = '';
      if (winDescription) winDescription.value = '';
      winMedia = [];
      renderWinMedia();
      updateWinState();
      renderWins();
      if (typeof checkBadges === 'function') checkBadges();
    });
  }
}

// ===== Announcements / FAQ / Chat renderers =====
function renderAnnouncements() {
  const listEl = document.getElementById('annList');
  if (!listEl || typeof ANNOUNCEMENTS === 'undefined') return;
  const items = ANNOUNCEMENTS.getAll().sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  const isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
  if (items.length === 0) {
    listEl.innerHTML = '<div class="dash-empty"><p>No announcements yet. Check back soon.</p></div>';
    return;
  }
  listEl.innerHTML = items.map(a => {
    const isRead = READ_ANNOUNCEMENTS.has(a.id);
    const stateClass = (a.pinned ? ' pinned' : '') + (isRead ? ' read' : ' unread');
    const readBtn = isRead
      ? '<button type="button" class="ann-read-btn read" data-id="' + a.id + '" data-state="read"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Read</button>'
      : '<button type="button" class="ann-read-btn" data-id="' + a.id + '" data-state="unread">Mark as read</button>';
    const editedLabel = a.editedAt
      ? ' <span class="post-edited" title="Last edited ' + new Date(a.editedAt).toLocaleString() + '">(edited)</span>'
      : '';
    return '<article class="ann-item' + stateClass + '" data-id="' + a.id + '">'
      + (a.pinned ? '<span class="ann-pin-badge">&#128204; Pinned</span>' : '')
      + '<h3 class="ann-title" data-ann-id="' + a.id + '">' + _esc(a.title) + '</h3>'
      + '<p class="ann-body" data-ann-id="' + a.id + '"' + (a.body ? '' : ' style="display:none;"') + '>' + (a.body ? _linkify(_esc(a.body)).replace(/\n/g, '<br>') : '') + '</p>'
      + '<div class="ann-meta"><span>' + _esc(a.authorName || 'Admin') + '</span><time>' + timeAgo(a.createdAt) + '</time>' + editedLabel + '</div>'
      + renderReactionsRow(a, 'announcements')
      + '<div class="ann-actions">' + readBtn + '</div>'
      + (isAdmin
          ? '<div class="post-actions-corner" data-id="' + a.id + '">'
            +   '<button type="button" class="post-corner-btn ann-edit-btn" data-id="' + a.id + '" aria-label="Edit announcement" title="Edit">'
            +     '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
            +   '</button>'
            +   '<button type="button" class="post-corner-btn post-corner-btn-danger ann-delete-btn" data-id="' + a.id + '" aria-label="Delete announcement" title="Delete">'
            +     '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>'
            +   '</button>'
            + '</div>'
          : '')
      + '</article>';
  }).join('');
  bindReactions(listEl, renderAnnouncements);
  // Mark as read / undo
  listEl.querySelectorAll('.ann-read-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (btn.dataset.state === 'read') READ_ANNOUNCEMENTS.unmark(id);
      else READ_ANNOUNCEMENTS.mark(id);
      renderAnnouncements();
    });
  });
  if (isAdmin) {
    listEl.querySelectorAll('.ann-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const article = listEl.querySelector('.ann-item[data-id="' + id + '"]');
        const titleEl = article && article.querySelector('.ann-title');
        const bodyEl = article && article.querySelector('.ann-body');
        if (!article || !titleEl) return;
        const ann = (ANNOUNCEMENTS.getAll() || []).find(x => x.id === id);
        const rawTitle = ann ? (ann.title || '') : '';
        const rawBody = ann ? (ann.body || '') : '';

        const editor = document.createElement('div');
        editor.className = 'post-editor';
        editor.dataset.id = id;
        editor.innerHTML =
            '<input type="text" class="post-editor-input" maxlength="200" placeholder="Title" value="' + _esc(rawTitle).replace(/"/g, '&quot;') + '">'
          + '<textarea class="post-editor-textarea" maxlength="2000" rows="4" placeholder="Body…">' + _esc(rawBody) + '</textarea>'
          + '<div class="post-editor-actions">'
          +   '<button type="button" class="btn-outline-mini post-editor-cancel">Cancel</button>'
          +   '<button type="button" class="btn-primary-mini post-editor-save">Save</button>'
          + '</div>';
        titleEl.style.display = 'none';
        if (bodyEl) bodyEl.style.display = 'none';
        titleEl.insertAdjacentElement('afterend', editor);

        const titleI = editor.querySelector('.post-editor-input');
        const ta = editor.querySelector('.post-editor-textarea');
        function autosize() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 480) + 'px'; }
        autosize();
        setTimeout(() => titleI.focus(), 30);
        ta.addEventListener('input', autosize);

        function cleanup() {
          editor.remove();
          titleEl.style.display = '';
          if (bodyEl && rawBody) bodyEl.style.display = '';
        }
        editor.querySelector('.post-editor-cancel').addEventListener('click', cleanup);
        editor.querySelector('.post-editor-save').addEventListener('click', () => {
          const newTitle = titleI.value.trim();
          const newBody = ta.value;
          if (!newTitle) { if (window.toast) toast('Title cannot be empty', 'warn'); return; }
          if (newTitle === rawTitle && newBody.trim() === rawBody) { cleanup(); return; }
          ANNOUNCEMENTS.update(id, { title: newTitle, body: newBody });
          if (window.toast) toast('Announcement updated', 'success');
          renderAnnouncements();
        });
        ta.addEventListener('keydown', (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { editor.querySelector('.post-editor-save').click(); }
          if (e.key === 'Escape') cleanup();
        });
      });
    });

    listEl.querySelectorAll('.ann-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this announcement?')) return;
        ANNOUNCEMENTS.remove(btn.dataset.id);
        renderAnnouncements();
      });
    });
  }
}

function renderFAQs() {
  const listEl = document.getElementById('faqList');
  if (!listEl || typeof FAQS === 'undefined') return;
  const items = FAQS.getAll();
  const isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
  if (items.length === 0) {
    listEl.innerHTML = '<div class="dash-empty"><p>No FAQs yet. Check back soon.</p></div>';
    return;
  }
  listEl.innerHTML = items.map(f => {
    return '<details class="faq-item" data-id="' + f.id + '">'
      + '<summary>' + _esc(f.question) + '</summary>'
      + (f.answer ? '<div class="faq-answer">' + _linkify(_esc(f.answer)).replace(/\n/g, '<br>') + '</div>' : '')
      + (isAdmin ? '<button class="faq-delete-btn" data-id="' + f.id + '" title="Delete">&times;</button>' : '')
      + '</details>';
  }).join('');
  if (isAdmin) {
    listEl.querySelectorAll('.faq-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!confirm('Delete this FAQ?')) return;
        FAQS.remove(btn.dataset.id);
        renderFAQs();
      });
    });
  }
}

// ============================================================
// MEMBERS — Render online + all registered users
// ============================================================
let _MEMBERS_CACHE = [];

function _initialsFromName(name) {
  if (!name) return 'U';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function _memberCardHTML(u, isOnline) {
  const initials = _initialsFromName(u.displayName || u.username);
  const avatarHtml = u.avatar
    ? '<img src="' + u.avatar.replace(/"/g, '&quot;') + '" alt="">'
    : '<span class="member-initials">' + initials + '</span>';
  const safeName = String(u.displayName || u.username).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const roleBadge = u.role === 'admin' ? '<span class="member-role-badge">Admin</span>' : '';
  const statusText = isOnline
    ? 'Online'
    : (u.lastSeenMs ? 'Last seen ' + _relativeTime(u.lastSeenMs) : 'Offline');

  // Top 3 prestige badges — render the icons inline. Looks up the catalog
  // so we know each badge's emoji + name (for the tooltip).
  let badgesHtml = '';
  if (Array.isArray(u.earnedBadges) && u.earnedBadges.length > 0 && typeof BADGES !== 'undefined') {
    // Priority order: graduate > phase 4 > 3 > 2 > 1 > everything else.
    const priority = ['graduate','phase_4','phase_3','phase_2','phase_1','top_engager','streak_7','commenter_10','first_quiz','first_assign','first_win','first_post','first_chat','first_lesson'];
    const sorted = u.earnedBadges.slice().sort((a, b) => {
      const ia = priority.indexOf(a); const ib = priority.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    const top = sorted.slice(0, 3).map(id => {
      const meta = BADGES.catalog.find(b => b.id === id);
      if (!meta) return '';
      const t = (meta.name + ' — ' + meta.desc).replace(/"/g, '&quot;');
      return '<span class="member-badge" title="' + t + '">' + meta.icon + '</span>';
    }).filter(Boolean).join('');
    if (top) badgesHtml = '<div class="member-badges">' + top + '</div>';
  }

  // DM button — opens a direct message with this user. Skip on self.
  const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
  const isMe = me && u.username === me;
  const messageBtn = (!isMe && typeof DMS !== 'undefined')
    ? '<button class="member-message-btn" type="button" data-username="' + String(u.username).replace(/"/g, '&quot;') + '" data-display="' + String(u.displayName || u.username).replace(/"/g, '&quot;') + '" title="Send a message"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>'
    : '';

  return '<div class="member-card' + (isOnline ? ' is-online' : '') + '">'
    + '<div class="member-avatar">'
    + avatarHtml
    + (isOnline ? '<span class="member-online-indicator" title="Online"></span>' : '')
    + '</div>'
    + '<div class="member-info">'
    + '<div class="member-name">' + safeName + roleBadge + '</div>'
    + '<div class="member-status">' + statusText + '</div>'
    + badgesHtml
    + '</div>'
    + messageBtn
    + '</div>';
}

function _relativeTime(ms) {
  const diff = Date.now() - ms;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + 'd ago';
  const date = new Date(ms);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================
// DM RENDERERS — conversation list + message thread + composer.
// ============================================================
let _DM_ACTIVE_CONV = null;

function _esc2(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderDMConversations() {
  const listEl = document.getElementById('dmConvList');
  const emptyEl = document.getElementById('dmConvEmpty');
  if (!listEl || typeof DMS === 'undefined') return;

  const convs = DMS.getConversations();
  // Update sidebar unread badge
  updateDMUnreadBadge();

  if (convs.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    // Wipe any previously-rendered tiles
    listEl.querySelectorAll('.dm-conv-item').forEach(el => el.remove());
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Build conversation tiles
  const html = convs.map(c => {
    const name = _esc2(c.peerDisplayName || c.peerUsername);
    const initials = _initialsFromName(c.peerDisplayName || c.peerUsername);
    const avatar = c.peerAvatar
      ? '<img src="' + _esc2(c.peerAvatar) + '" alt="">'
      : '<span>' + initials + '</span>';
    const last = _esc2(c.lastMessage || '').slice(0, 60);
    const time = c.lastMessageAt ? _relativeTime(c.lastMessageAt) : '';
    const unread = c.unread && c.unread > 0
      ? '<span class="dm-conv-unread">' + c.unread + '</span>'
      : '';
    const active = _DM_ACTIVE_CONV === c.convId ? ' is-active' : '';
    return '<button type="button" class="dm-conv-item' + active + '" data-conv="' + _esc2(c.convId) + '" data-username="' + _esc2(c.peerUsername) + '" data-display="' + _esc2(c.peerDisplayName || c.peerUsername) + '" data-avatar="' + _esc2(c.peerAvatar || '') + '">'
      + '<span class="dm-conv-avatar">' + avatar + '</span>'
      + '<span class="dm-conv-body">'
      +   '<span class="dm-conv-row">'
      +     '<span class="dm-conv-name">' + name + '</span>'
      +     '<span class="dm-conv-time">' + time + '</span>'
      +   '</span>'
      +   '<span class="dm-conv-row">'
      +     '<span class="dm-conv-last">' + (last || '<em>(no messages yet)</em>') + '</span>'
      +     unread
      +   '</span>'
      + '</span>'
      + '</button>';
  }).join('');

  // Replace tiles (keep the empty placeholder div around for later)
  listEl.querySelectorAll('.dm-conv-item').forEach(el => el.remove());
  listEl.insertAdjacentHTML('beforeend', html);

  // Wire click → open conversation
  listEl.querySelectorAll('.dm-conv-item').forEach(btn => {
    btn.addEventListener('click', () => {
      openDMConversation(
        btn.dataset.username,
        btn.dataset.display,
        btn.dataset.avatar || null
      );
    });
  });
}

function openDMConversation(peerUsername, peerDisplayName, peerAvatar) {
  if (!peerUsername || typeof DMS === 'undefined') return;
  const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
  if (!me) return;
  const convId = DMS.convIdFor(me, peerUsername);
  _DM_ACTIVE_CONV = convId;

  // Make sure the conversation exists locally even before any message is sent
  DMS.upsertConversation(convId, {
    peerUsername,
    peerDisplayName: peerDisplayName || peerUsername,
    peerAvatar: peerAvatar || null
  });
  DMS.markRead(convId);

  // Switch the active dashboard tab to messages if we're not already there
  const messagesLink = document.querySelector('.dash-sidebar-link[data-tab="messages"]');
  if (messagesLink) messagesLink.click();

  // Populate header
  const nameEl = document.getElementById('dmThreadName');
  const avatarEl = document.getElementById('dmThreadAvatar');
  const emptyEl = document.getElementById('dmThreadEmpty');
  const activeEl = document.getElementById('dmThreadActive');
  if (nameEl) nameEl.textContent = peerDisplayName || peerUsername;
  if (avatarEl) {
    const initials = _initialsFromName(peerDisplayName || peerUsername);
    avatarEl.innerHTML = peerAvatar
      ? '<img src="' + _esc2(peerAvatar) + '" alt="">'
      : '<span>' + initials + '</span>';
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (activeEl) activeEl.style.display = 'flex';

  // Initial render from cache
  renderDMMessages(DMS.getMessages(convId));

  // Live listener for new incoming messages
  DMS.startMessageListener(convId, (messages) => {
    renderDMMessages(messages);
    // Mark as read whenever we re-render while the thread is open
    DMS.markRead(convId);
    renderDMConversations();
  });

  // Focus composer + clear it
  const inputEl = document.getElementById('dmInput');
  if (inputEl) { inputEl.value = ''; inputEl.focus(); }
  const sendBtn = document.getElementById('dmSendBtn');
  if (sendBtn) sendBtn.disabled = true;

  // Re-render the conv list to show active state
  renderDMConversations();
}

function renderDMMessages(messages) {
  const wrap = document.getElementById('dmMessages');
  if (!wrap) return;
  const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
  if (!Array.isArray(messages) || messages.length === 0) {
    wrap.innerHTML = '<div class="dm-messages-empty"><p>Say hi 👋</p></div>';
    return;
  }
  wrap.innerHTML = messages.map(m => {
    const mine = m.from === me;
    const text = _linkify(_highlightMentions(_esc2(m.text))).replace(/\n/g, '<br>');
    const t = m.createdAt ? _relativeTime(m.createdAt) : '';
    return '<div class="dm-message' + (mine ? ' mine' : '') + '">'
      + '<div class="dm-message-bubble">' + text + '</div>'
      + '<div class="dm-message-time">' + t + '</div>'
      + '</div>';
  }).join('');
  // Scroll to bottom
  wrap.scrollTop = wrap.scrollHeight;
}

function updateDMUnreadBadge() {
  const badge = document.getElementById('dmUnreadBadge');
  if (!badge || typeof DMS === 'undefined') return;
  const total = DMS.totalUnread();
  badge.textContent = total;
  badge.style.display = total > 0 ? 'inline-flex' : 'none';
}

function bindDMComposer() {
  const input = document.getElementById('dmInput');
  const sendBtn = document.getElementById('dmSendBtn');
  const closeBtn = document.getElementById('dmThreadClose');
  if (!input || !sendBtn) return;

  const updateState = () => { sendBtn.disabled = input.value.trim().length === 0; };
  input.addEventListener('input', updateState);

  function send() {
    if (!input.value.trim() || !_DM_ACTIVE_CONV) return;
    const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
    if (!me) return;
    const peer = DMS.peerOf(_DM_ACTIVE_CONV, me);
    if (!peer) return;
    // Look up peer display + avatar from the conv list
    const conv = DMS.getConversations().find(c => c.convId === _DM_ACTIVE_CONV);
    DMS.send(peer, conv && conv.peerDisplayName, conv && conv.peerAvatar, input.value);
    input.value = '';
    updateState();
    renderDMMessages(DMS.getMessages(_DM_ACTIVE_CONV));
    renderDMConversations();
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      _DM_ACTIVE_CONV = null;
      DMS.stopMessageListener();
      const emptyEl = document.getElementById('dmThreadEmpty');
      const activeEl = document.getElementById('dmThreadActive');
      if (emptyEl) emptyEl.style.display = 'flex';
      if (activeEl) activeEl.style.display = 'none';
      renderDMConversations();
    });
  }

  updateState();
}

function renderMembers(users) {
  if (Array.isArray(users)) _MEMBERS_CACHE = users;
  const data = _MEMBERS_CACHE.slice();

  const onlineList = document.getElementById('membersOnlineList');
  const onlineEmpty = document.getElementById('membersOnlineEmpty');
  const onlineCountEl = document.getElementById('membersOnlineCount');
  const onlineBadge = document.getElementById('onlineBadge');
  if (!onlineList) return;

  // Sort: admin first, then alphabetical by displayName
  data.sort((a, b) => {
    if ((a.role === 'admin') !== (b.role === 'admin')) return a.role === 'admin' ? -1 : 1;
    return String(a.displayName || a.username).localeCompare(String(b.displayName || b.username));
  });

  const online = data.filter(u => PRESENCE.isOnline(u));
  if (onlineCountEl) onlineCountEl.textContent = online.length;

  // Sidebar live online badge — count everyone except self
  if (onlineBadge) {
    const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
    const others = online.filter(u => u.username !== me).length;
    onlineBadge.textContent = others;
    onlineBadge.style.display = others > 0 ? 'inline-flex' : 'none';
  }

  // Online section
  if (online.length === 0) {
    if (onlineEmpty) onlineEmpty.style.display = 'block';
    onlineList.innerHTML = '<div class="dash-empty members-empty"><p>No one\'s online right now.</p></div>';
  } else {
    onlineList.innerHTML = online.map(u => _memberCardHTML(u, true)).join('');
  }
}

function renderChat(messages) {
  const messagesEl = document.getElementById('chatMessages');
  const emptyEl = document.getElementById('chatEmpty');
  if (!messagesEl || typeof CHAT === 'undefined') return;
  const items = messages || CHAT.getAll();
  const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
  const isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
  if (items.length === 0) {
    messagesEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Helper to render a tiny version of the reactions row tuned for
  // chat bubbles (no border-top, smaller pills).
  function chatReactionsHTML(m) {
    const reactions = m.reactions || {};
    const entries = Object.keys(reactions).map(e => ({
      emoji: e, users: reactions[e] || [], mine: me && (reactions[e] || []).indexOf(me) !== -1
    })).filter(r => r.users.length > 0);
    if (entries.length === 0) return '';
    return '<div class="chat-reactions">'
      + entries.map(r =>
          '<button type="button" class="react-pill chat-react-pill' + (r.mine ? ' mine' : '') + '" data-kind="chat" data-id="' + m.id + '" data-emoji="' + r.emoji + '">'
          + '<span class="react-emoji">' + r.emoji + '</span>'
          + '<span class="react-count">' + r.users.length + '</span>'
          + '</button>'
        ).join('')
      + '</div>';
  }

  messagesEl.innerHTML = items.map((m, i) => {
    const prev = items[i - 1];
    const isMine = me && m.username === me;
    // Show avatar + name only at the start of a 5-min cluster from same author
    const groupHead = !prev
      || prev.username !== m.username
      || (m.createdAt - (prev.createdAt || 0)) >= 300000
      || m.replyTo; // always head if it's a reply (visual context break)

    const avatarHTML = '<div class="chat-avatar' + (groupHead ? '' : ' hidden') + '">'
      + (m.avatar ? '<img src="' + _esc(m.avatar) + '" alt="">' : '<span>' + _esc(m.initials || 'U') + '</span>')
      + '</div>';

    const replyQuote = m.replyTo
      ? '<a class="chat-reply-quote" href="#chat-msg-' + _esc(m.replyTo.id || '') + '" data-target="' + _esc(m.replyTo.id || '') + '">'
        + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>'
        + '<span class="chat-reply-name">' + _esc(m.replyTo.displayName || 'Someone') + '</span>'
        + '<span class="chat-reply-text">' + _esc(m.replyTo.text || '') + '</span>'
        + '</a>'
      : '';

    const nameHeader = groupHead
      ? '<div class="chat-name">' + _esc(m.displayName) + ' <time>' + timeAgo(m.createdAt) + '</time></div>'
      : '';

    const canDelete = isMine || isAdmin;

    return '<div class="chat-message' + (isMine ? ' mine' : '') + (groupHead ? ' group-head' : '') + '" id="chat-msg-' + _esc(m.id) + '" data-id="' + _esc(m.id) + '">'
      + avatarHTML
      + '<div class="chat-message-body">'
      +   nameHeader
      +   replyQuote
      +   '<div class="chat-bubble-row">'
      +     '<div class="chat-bubble" data-id="' + _esc(m.id) + '">' + _linkify(_highlightMentions(_esc(m.text))).replace(/\n/g, '<br>') + '</div>'
      +     '<div class="chat-msg-actions">'
      +       '<button type="button" class="chat-action-btn chat-react-btn" data-id="' + _esc(m.id) + '" title="React"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>'
      +       '<button type="button" class="chat-action-btn chat-reply-btn" data-id="' + _esc(m.id) + '" data-name="' + _esc(m.displayName) + '" data-text="' + _esc(m.text) + '" title="Reply"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg></button>'
      +       (canDelete ? '<button type="button" class="chat-action-btn chat-delete-btn" data-id="' + _esc(m.id) + '" title="Delete">&times;</button>' : '')
      +     '</div>'
      +     '<div class="react-palette chat-react-palette" hidden>'
      +       REACTION_EMOJIS.map(e => '<button type="button" class="react-palette-btn" data-kind="chat" data-id="' + _esc(m.id) + '" data-emoji="' + e + '">' + e + '</button>').join('')
      +     '</div>'
      +   '</div>'
      +   chatReactionsHTML(m)
      + '</div>'
      + '</div>';
  }).join('');

  // Wire reactions (existing pills + emoji palette buttons)
  // applyReaction with kind='chat' falls through to the helper below.
  messagesEl.querySelectorAll('.chat-react-pill, .chat-react-palette .react-palette-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const emoji = btn.dataset.emoji;
      if (typeof CHAT.react === 'function') CHAT.react(id, emoji);
      // Close any open palette
      const palette = btn.closest('.react-palette');
      if (palette) palette.hidden = true;
      renderChat();
    });
  });
  // Hover-action React button toggles the per-message palette
  messagesEl.querySelectorAll('.chat-react-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const message = btn.closest('.chat-message');
      const palette = message ? message.querySelector('.chat-react-palette') : null;
      // Close all other palettes first
      messagesEl.querySelectorAll('.chat-react-palette').forEach(p => { if (p !== palette) p.hidden = true; });
      if (palette) palette.hidden = !palette.hidden;
    });
  });
  // Reply button → fills the composer state
  messagesEl.querySelectorAll('.chat-reply-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof setChatReplyTarget === 'function') {
        setChatReplyTarget({ id: btn.dataset.id, displayName: btn.dataset.name, text: btn.dataset.text });
      }
    });
  });
  // Delete
  messagesEl.querySelectorAll('.chat-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete this message?')) return;
      CHAT.remove(btn.dataset.id);
      renderChat();
    });
  });
  // Reply quote click → scroll to & flash the original message
  messagesEl.querySelectorAll('.chat-reply-quote').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('chat-msg-' + a.dataset.target);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('flash');
      void target.offsetWidth;
      target.classList.add('flash');
    });
  });
  // Click outside any palette closes it
  if (!messagesEl._chatPaletteWired) {
    messagesEl._chatPaletteWired = true;
    document.addEventListener('click', () => {
      messagesEl.querySelectorAll('.chat-react-palette').forEach(p => p.hidden = true);
    });
  }

  // Auto-scroll to bottom
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function bindAnnComposer() {
  const newAnnBtn = document.getElementById('newAnnBtn');
  const annComposer = document.getElementById('annComposer');
  const annTitle = document.getElementById('annTitle');
  const annBody = document.getElementById('annBody');
  const annPinned = document.getElementById('annPinned');
  const annSubmit = document.getElementById('annSubmitBtn');
  const annCancel = document.getElementById('annCancelBtn');
  const isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
  if (newAnnBtn) newAnnBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  if (!isAdmin || !newAnnBtn) return;
  const updateAnnState = () => {
    if (annSubmit && annTitle) annSubmit.disabled = annTitle.value.trim().length === 0;
  };
  newAnnBtn.addEventListener('click', () => {
    if (annComposer) annComposer.style.display = 'block';
    if (annTitle) annTitle.focus();
  });
  if (annTitle) annTitle.addEventListener('input', updateAnnState);
  if (annCancel) annCancel.addEventListener('click', () => {
    if (annComposer) annComposer.style.display = 'none';
    if (annTitle) annTitle.value = '';
    if (annBody) annBody.value = '';
    if (annPinned) annPinned.checked = false;
    updateAnnState();
  });
  if (annSubmit) annSubmit.addEventListener('click', () => {
    if (!annTitle || !annTitle.value.trim()) return;
    ANNOUNCEMENTS.add(annTitle.value, annBody ? annBody.value : '', annPinned ? annPinned.checked : false);
    annTitle.value = '';
    if (annBody) annBody.value = '';
    if (annPinned) annPinned.checked = false;
    if (annComposer) annComposer.style.display = 'none';
    updateAnnState();
    renderAnnouncements();
  });
}

function bindFaqComposer() {
  const newFaqBtn = document.getElementById('newFaqBtn');
  const faqComposer = document.getElementById('faqComposer');
  const faqQuestion = document.getElementById('faqQuestion');
  const faqAnswer = document.getElementById('faqAnswer');
  const faqSubmit = document.getElementById('faqSubmitBtn');
  const faqCancel = document.getElementById('faqCancelBtn');
  const isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
  if (newFaqBtn) newFaqBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  if (!isAdmin || !newFaqBtn) return;
  const updateFaqState = () => {
    if (faqSubmit && faqQuestion) faqSubmit.disabled = faqQuestion.value.trim().length === 0;
  };
  newFaqBtn.addEventListener('click', () => {
    if (faqComposer) faqComposer.style.display = 'block';
    if (faqQuestion) faqQuestion.focus();
  });
  if (faqQuestion) faqQuestion.addEventListener('input', updateFaqState);
  if (faqCancel) faqCancel.addEventListener('click', () => {
    if (faqComposer) faqComposer.style.display = 'none';
    if (faqQuestion) faqQuestion.value = '';
    if (faqAnswer) faqAnswer.value = '';
    updateFaqState();
  });
  if (faqSubmit) faqSubmit.addEventListener('click', () => {
    if (!faqQuestion || !faqQuestion.value.trim()) return;
    FAQS.add(faqQuestion.value, faqAnswer ? faqAnswer.value : '');
    faqQuestion.value = '';
    if (faqAnswer) faqAnswer.value = '';
    if (faqComposer) faqComposer.style.display = 'none';
    updateFaqState();
    renderFAQs();
  });
}

// Reply target state — set by clicking Reply on any chat message.
// renderChat exposes a helper that updates this and surfaces a
// "Replying to [name]" preview chip above the composer input.
let _chatReplyTarget = null;

function setChatReplyTarget(target) {
  _chatReplyTarget = target;
  const chip = document.getElementById('chatReplyPreview');
  const input = document.getElementById('chatInput');
  if (!chip) return;
  if (!target) {
    chip.style.display = 'none';
    chip.innerHTML = '';
    return;
  }
  chip.style.display = 'flex';
  chip.innerHTML = '<div class="chat-reply-preview-content">'
    + '<span class="chat-reply-preview-label">Replying to <strong>' + _esc(target.displayName || 'someone') + '</strong></span>'
    + '<span class="chat-reply-preview-text">' + _esc(target.text || '') + '</span>'
    + '</div>'
    + '<button type="button" class="chat-reply-preview-cancel" aria-label="Cancel reply">&times;</button>';
  const cancel = chip.querySelector('.chat-reply-preview-cancel');
  if (cancel) cancel.addEventListener('click', () => setChatReplyTarget(null));
  if (input) input.focus();
}

// ============================================================
// CHAT_MENTION — @mention autocomplete for the chat composer.
// Type "@" anywhere in the message and a dropdown appears with
// matching members. Click or Enter inserts "@Display Name ".
// Mentioned names are highlighted as pills inside the rendered
// chat bubble (see _highlightMentions below).
// ============================================================
const CHAT_MENTION = {
  _dropdown: null,
  _matches: [],
  _activeIdx: 0,
  _input: null,
  _atPos: -1,

  getCandidates(query) {
    const cache = (typeof _MEMBERS_CACHE !== 'undefined') ? _MEMBERS_CACHE.slice() : [];
    const me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
    const q = (query || '').toLowerCase();
    return cache
      .filter(u => u.username !== me)
      .filter(u => {
        if (!q) return true;
        const name = (u.displayName || u.username || '').toLowerCase();
        return name.includes(q);
      })
      .sort((a, b) => String(a.displayName || a.username).localeCompare(String(b.displayName || b.username)))
      .slice(0, 6);
  },

  attachTo(input) {
    if (!input) return;
    this._input = input;
    const composer = input.closest('.chat-composer');
    if (!composer) return;
    if (!this._dropdown) {
      this._dropdown = document.createElement('div');
      this._dropdown.className = 'chat-mention-dropdown';
      this._dropdown.style.display = 'none';
      composer.style.position = 'relative';
      composer.appendChild(this._dropdown);
    }
    input.addEventListener('input', () => this._onInput());
    input.addEventListener('keydown', (e) => this._onKeydown(e));
    input.addEventListener('blur', () => setTimeout(() => this._hide(), 200));
  },

  _onInput() {
    const input = this._input;
    if (!input) return;
    const text = input.value;
    const caret = input.selectionStart || 0;
    // Find the most recent '@' before the caret, stopping at whitespace
    let atPos = -1;
    for (let i = caret - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '@') { atPos = i; break; }
      if (/\s/.test(ch)) break;
    }
    if (atPos === -1) { this._hide(); return; }
    const before = atPos === 0 ? '' : text[atPos - 1];
    if (before && !/\s/.test(before)) { this._hide(); return; }
    const query = text.slice(atPos + 1, caret);
    if (/\s/.test(query)) { this._hide(); return; }
    this._atPos = atPos;
    this._matches = this.getCandidates(query);
    this._activeIdx = 0;
    if (this._matches.length === 0) { this._hide(); return; }
    this._render();
  },

  _onKeydown(e) {
    if (!this._dropdown || this._dropdown.style.display === 'none') return;
    if (this._matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._activeIdx = (this._activeIdx + 1) % this._matches.length;
      this._highlightActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._activeIdx = (this._activeIdx - 1 + this._matches.length) % this._matches.length;
      this._highlightActive();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      this._insert(this._matches[this._activeIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._hide();
    }
  },

  _insert(member) {
    if (!member || !this._input) return;
    const input = this._input;
    const text = input.value;
    const caret = input.selectionStart || 0;
    const name = member.displayName || member.username;
    const before = text.slice(0, this._atPos);
    const after = text.slice(caret);
    const inserted = '@' + name + ' ';
    input.value = before + inserted + after;
    const newCaret = (before + inserted).length;
    input.setSelectionRange(newCaret, newCaret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    this._hide();
  },

  _render() {
    if (!this._dropdown) return;
    this._dropdown.innerHTML = this._matches.map((u, i) => {
      const initials = (typeof _initialsFromName === 'function') ? _initialsFromName(u.displayName || u.username) : 'U';
      const avatar = u.avatar
        ? '<img src="' + String(u.avatar).replace(/"/g, '&quot;') + '" alt="">'
        : '<span>' + initials + '</span>';
      const name = String(u.displayName || u.username).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<button type="button" class="chat-mention-item' + (i === this._activeIdx ? ' is-active' : '') + '" data-idx="' + i + '">'
        + '<span class="chat-mention-avatar">' + avatar + '</span>'
        + '<span class="chat-mention-name">' + name + '</span>'
        + '</button>';
    }).join('');
    this._dropdown.querySelectorAll('.chat-mention-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = parseInt(el.dataset.idx);
        this._insert(this._matches[idx]);
      });
      el.addEventListener('mouseenter', () => {
        this._activeIdx = parseInt(el.dataset.idx);
        this._highlightActive();
      });
    });
    this._dropdown.style.display = 'block';
  },

  _highlightActive() {
    if (!this._dropdown) return;
    this._dropdown.querySelectorAll('.chat-mention-item').forEach((el, i) => {
      el.classList.toggle('is-active', i === this._activeIdx);
    });
  },

  _hide() {
    if (this._dropdown) this._dropdown.style.display = 'none';
    this._matches = [];
    this._atPos = -1;
  }
};

// Wraps any "@<member display name>" in a styled pill inside an
// already-escaped chat bubble. Only matches names from the live
// member cache so random "@whatever" text isn't styled.
function _highlightMentions(escapedText) {
  if (!escapedText) return escapedText;
  const cache = (typeof _MEMBERS_CACHE !== 'undefined') ? _MEMBERS_CACHE : [];
  if (cache.length === 0) return escapedText;
  const names = cache.map(u => u.displayName || u.username).filter(Boolean);
  // Longest first so "Charles Keith Yerro" beats "Charles"
  names.sort((a, b) => b.length - a.length);
  let result = escapedText;
  names.forEach(name => {
    const escName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const reSrc = escName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('@(' + reSrc + ')(?![A-Za-z0-9_])', 'g');
    result = result.replace(re, '<span class="chat-mention">@$1</span>');
  });
  return result;
}

function bindChatComposer() {
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSendBtn');
  if (!chatInput || !chatSend) return;

  // Inject the reply-preview chip above the input if it's not there.
  // Cleaner than touching dashboard.html directly — keeps the bindings
  // in one place.
  let replyChip = document.getElementById('chatReplyPreview');
  if (!replyChip) {
    const composer = chatInput.closest('.chat-composer');
    if (composer) {
      replyChip = document.createElement('div');
      replyChip.id = 'chatReplyPreview';
      replyChip.className = 'chat-reply-preview';
      replyChip.style.display = 'none';
      composer.parentNode.insertBefore(replyChip, composer);
    }
  }

  const updateChatState = () => { chatSend.disabled = chatInput.value.trim().length === 0; };
  chatInput.addEventListener('input', updateChatState);
  const send = () => {
    if (!chatInput.value.trim()) return;
    CHAT.add(chatInput.value, _chatReplyTarget);
    chatInput.value = '';
    setChatReplyTarget(null);
    updateChatState();
    renderChat();
    if (typeof checkBadges === 'function') checkBadges();
  };
  chatSend.addEventListener('click', send);
  chatInput.addEventListener('keydown', (e) => {
    // If the @mention dropdown is open, let it claim Enter / arrows /
    // Escape first — otherwise fall through to send-on-enter / cancel-reply.
    const dropdown = CHAT_MENTION._dropdown;
    const isMentionOpen = dropdown && dropdown.style.display !== 'none' && CHAT_MENTION._matches.length > 0;
    if (isMentionOpen) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape' && _chatReplyTarget) {
      setChatReplyTarget(null);
    }
  });
  // Wire @mention autocomplete (loads candidates from the live member cache)
  CHAT_MENTION.attachTo(chatInput);
  updateChatState();
}

function bindDashboardSidebar() {
  const sidebar = document.getElementById('dashSidebar');
  const toggleBtn = document.getElementById('dashSidebarToggle');
  const closeBtn = document.getElementById('dashSidebarClose');
  const toggleLabel = document.getElementById('dashSidebarToggleLabel');
  // Scope this to ONLY links that have a data-tab attribute. Otherwise
  // the new rail action buttons (Search, Notifications, Profile, Theme,
  // Log out) — which share the .dash-sidebar-link class but have no
  // data-tab — would be wired up as if they were tabs. Clicking them
  // would call activate(undefined), strip the active class from the
  // real tab, and leave the dashboard blank with no panel showing.
  const links = document.querySelectorAll('.dash-sidebar-link[data-tab]');
  const panels = document.querySelectorAll('.dash-panel');

  function openSidebar()  { if (sidebar) sidebar.classList.add('is-open'); }
  function closeSidebar() { if (sidebar) sidebar.classList.remove('is-open'); }

  if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);

  function activate(tab) {
    links.forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
    panels.forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
    if (toggleLabel) {
      const link = Array.from(links).find(l => l.dataset.tab === tab);
      if (link) toggleLabel.textContent = link.querySelector('span').textContent;
    }
    closeSidebar();

    // Lazy-render the panel's content
    if (tab === 'announcements') renderAnnouncements();
    if (tab === 'faq') renderFAQs();
    if (tab === 'wins') renderWins();

    // Real-time listeners — start the relevant one, stop the rest.
    // Each tab gets its OWN live Firestore subscription so anything
    // anyone posts elsewhere shows up on every other student's screen
    // within seconds, no manual refresh needed.
    if (typeof POSTS !== 'undefined') {
      if (tab === 'feed') {
        POSTS.fetchRemote().then(renderPosts).catch(() => {});
        POSTS.startLiveListener(renderPosts);
      } else {
        POSTS.stopLiveListener();
      }
    }
    if (typeof WINS !== 'undefined') {
      if (tab === 'wins') {
        WINS.fetchRemote().then(renderWins).catch(() => {});
        WINS.startLiveListener(renderWins);
      } else {
        WINS.stopLiveListener();
      }
    }
    if (typeof ANNOUNCEMENTS !== 'undefined') {
      if (tab === 'announcements') {
        ANNOUNCEMENTS.fetchRemote().then(renderAnnouncements).catch(() => {});
        ANNOUNCEMENTS.startLiveListener(renderAnnouncements);
      } else {
        ANNOUNCEMENTS.stopLiveListener();
      }
    }
    if (typeof FAQS !== 'undefined') {
      if (tab === 'faq') {
        FAQS.fetchRemote().then(renderFAQs).catch(() => {});
        FAQS.startLiveListener(renderFAQs);
      } else {
        FAQS.stopLiveListener();
      }
    }
    if (typeof CHAT !== 'undefined') {
      if (tab === 'chat') {
        renderChat();
        CHAT.fetchRemote().then(renderChat).catch(() => {});
        CHAT.startLiveListener(renderChat);
      } else {
        CHAT.stopLiveListener();
      }
    }

    // Members panel: re-render from the cached presence list when opened.
    // The PRESENCE listener is started on dashboard init, so the data is
    // already kept fresh in the background.
    if (tab === 'members') {
      renderMembers();
    }

    // Resources panel
    if (tab === 'resources' && typeof RESOURCES !== 'undefined') {
      RESOURCES.fetchRemote().then(function () { RESOURCES.render(); }).catch(function () { RESOURCES.render(); });
    }

    // Messages panel: render conversation list + restore active thread.
    if (tab === 'messages') {
      renderDMConversations();
    } else {
      // Stop the per-message listener when leaving messages (the conv
      // listener stays alive so unread badge keeps updating).
      if (typeof DMS !== 'undefined') DMS.stopMessageListener();
    }
  }

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      activate(link.dataset.tab);
    });
  });
}

if (currentPage === 'dashboard.html') {
  // ============================================================
  // MOTIVATIONAL QUOTES — rotating quote on dashboard feed
  // ============================================================
  const MOTIVATIONAL_QUOTES = [
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
    { text: "The best marketing doesn't feel like marketing.", author: "Tom Fishburne" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "Your brand is what people say about you when you're not in the room.", author: "Jeff Bezos" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Marketing is no longer about the stuff that you make, but about the stories you tell.", author: "Seth Godin" },
    { text: "Either write something worth reading or do something worth writing.", author: "Benjamin Franklin" },
    { text: "Quality is more important than quantity. One home run is much better than two doubles.", author: "Steve Jobs" },
    { text: "If you're not embarrassed by the first version of your product, you've launched too late.", author: "Reid Hoffman" },
    { text: "People don't buy what you do; they buy why you do it.", author: "Simon Sinek" },
    { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
    { text: "Content is fire, social media is gasoline.", author: "Jay Baer" },
    { text: "Make it simple. Make it memorable. Make it inviting to look at.", author: "Leo Burnett" },
    { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
    { text: "If you are not willing to risk the usual, you will have to settle for the ordinary.", author: "Jim Rohn" },
    { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
    { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
    { text: "Creativity is intelligence having fun.", author: "Albert Einstein" },
    { text: "Stop selling. Start helping.", author: "Zig Ziglar" },
    { text: "Great things in business are never done by one person; they're done by a team of people.", author: "Steve Jobs" },
    { text: "The biggest risk is not taking any risk.", author: "Mark Zuckerberg" },
    { text: "Build something 100 people love, not something 1 million people kind of like.", author: "Brian Chesky" },
    { text: "Your most unhappy customers are your greatest source of learning.", author: "Bill Gates" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
    { text: "Be so good they can't ignore you.", author: "Steve Martin" }
  ];

  function _pickQuoteForToday() {
    const today = new Date();
    const dayKey = today.getFullYear() * 1000 + (today.getMonth() + 1) * 50 + today.getDate();
    return MOTIVATIONAL_QUOTES[dayKey % MOTIVATIONAL_QUOTES.length];
  }

  function renderMotivationalQuote(quote) {
    const textEl = document.getElementById('quoteText');
    const authorEl = document.getElementById('quoteAuthor');
    if (!textEl || !authorEl) return;
    const q = quote || _pickQuoteForToday();
    textEl.textContent = '"' + q.text + '"';
    authorEl.textContent = '— ' + q.author;
  }

  // ============================================================
  // GRADUATE BANNER — shows on Feed when all 16 lessons are done.
  // Reuses the same certificate-HTML generator that lesson.html uses
  // so the user gets the same downloadable cert from either place.
  // ============================================================
  function showGraduateBannerIfReady() {
    const banner = document.getElementById('graduateBanner');
    if (!banner) return;
    const done = (typeof PROGRESS !== 'undefined') ? PROGRESS.getCompletedCount() : 0;
    if (done < 16) { banner.style.display = 'none'; return; }
    banner.style.display = 'flex';
    const btn = document.getElementById('graduateBannerCertBtn');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const name = (typeof AUTH !== 'undefined' && AUTH.getDisplayName) ? AUTH.getDisplayName() : 'Marketing Intern';
        const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const logoSrc = document.querySelector('.logo-icon img')?.src || '';
        const certHtml = '<!DOCTYPE html><html><head><title>Certificate - Sphere Academy</title>'
          + '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
          + '<style>'
          + '*{margin:0;padding:0;box-sizing:border-box;}'
          + 'body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;font-family:"Plus Jakarta Sans",sans-serif;padding:40px;}'
          + '.cert{background:#fff;width:1000px;max-width:100%;padding:60px 80px;border:8px solid #635bff;border-radius:16px;text-align:center;box-shadow:0 30px 80px -20px rgba(15,23,42,0.3);}'
          + '.cert h1{font-size:2.4rem;font-weight:800;color:#0f172a;margin-bottom:8px;letter-spacing:-0.02em;}'
          + '.cert .label{font-size:0.78rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#635bff;margin-bottom:24px;}'
          + '.cert .name{font-size:2.6rem;font-weight:700;color:#0f172a;margin:30px 0 14px;border-bottom:2px solid #635bff;padding-bottom:14px;display:inline-block;}'
          + '.cert .desc{font-size:1.05rem;line-height:1.6;color:#475569;margin-bottom:36px;}'
          + '.cert .footer{display:flex;justify-content:space-between;margin-top:48px;font-size:0.85rem;color:#64748b;}'
          + '.cert .logo-row{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:30px;}'
          + '.cert .logo-row img{width:42px;height:42px;border-radius:10px;}'
          + '.cert .logo-row span{font-size:1.05rem;font-weight:700;color:#0f172a;}'
          + '</style></head><body>'
          + '<div class="cert">'
          + '<div class="logo-row">'
          + (logoSrc ? '<img src="' + logoSrc + '" alt="Sphere Academy">' : '')
          + '<span>Sphere Academy</span>'
          + '</div>'
          + '<p class="label">Certificate of Completion</p>'
          + '<h1>Marketing Intern Graduate</h1>'
          + '<p class="desc">This certifies that</p>'
          + '<div class="name">' + name + '</div>'
          + '<p class="desc">has successfully completed all 16 lessons of the Sphere Academy Marketing Intern Training Program — covering creatives, AI workflows, marketing tools, and Meta Ads Manager.</p>'
          + '<div class="footer">'
          + '<span>Issued: ' + date + '</span>'
          + '<span>Stratos Sphere Academy</span>'
          + '</div>'
          + '</div></body></html>';
        const blob = new Blob([certHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Sphere_Academy_Certificate_' + name.replace(/\s/g, '_') + '.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
  }

  function bindQuoteCard() {
    const card = document.getElementById('quoteCard');
    let currentIdx = -1;

    function showRandomQuote() {
      // Pick a different quote than the one currently shown so we never
      // appear to "skip" a tick by repeating the same line.
      let nextIdx;
      do {
        nextIdx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
      } while (nextIdx === currentIdx && MOTIVATIONAL_QUOTES.length > 1);
      currentIdx = nextIdx;
      const q = MOTIVATIONAL_QUOTES[nextIdx];
      // Quick fade transition so the swap doesn't feel jarring
      if (card) {
        card.classList.add('is-swapping');
        setTimeout(() => {
          renderMotivationalQuote(q);
          card.classList.remove('is-swapping');
        }, 180);
      } else {
        renderMotivationalQuote(q);
      }
    }

    // Seed with today's deterministic quote so the first paint isn't blank.
    renderMotivationalQuote();
    currentIdx = MOTIVATIONAL_QUOTES.indexOf(_pickQuoteForToday());

    // Auto-rotate every 6 seconds. Pause when the tab is hidden so we
    // don't burn cycles in the background.
    let rotateTimer = setInterval(showRandomQuote, 6000);
    document.addEventListener('visibilitychange', () => {
      clearInterval(rotateTimer);
      if (!document.hidden) {
        rotateTimer = setInterval(showRandomQuote, 6000);
      }
    });
  }

  function initDashboardCommunity() {
    bindCommunityComposers();
    bindAnnComposer();
    bindFaqComposer();
    bindChatComposer();
    bindDashboardSidebar();
    bindQuoteCard();
    showGraduateBannerIfReady();
    // Run badge check on entry — catches things that became true between
    // sessions (streak day rollover, async sync of posts/wins from another browser)
    if (typeof checkBadges === 'function') checkBadges();
    // Initial fetches for cross-browser sync.
    // Sidebar badge counts ONLY unread announcements per user — once
    // the student clicks Mark as read on each one, the badge clears.
    function updateAnnBadge() {
      const ann = ANNOUNCEMENTS.getAll();
      const unread = ann.filter(a => !READ_ANNOUNCEMENTS.has(a.id)).length;
      const badge = document.getElementById('annBadge');
      if (!badge) return;
      badge.textContent = unread;
      badge.style.display = unread > 0 ? 'inline-flex' : 'none';
    }
    if (typeof ANNOUNCEMENTS !== 'undefined') {
      ANNOUNCEMENTS.fetchRemote().then(() => {
        updateAnnBadge();
        renderAnnouncements();
      }).catch(() => {});
      // Live listener also keeps the badge in sync as new announcements
      // arrive in real time, AND when local read state changes.
      ANNOUNCEMENTS.startLiveListener(() => {
        updateAnnBadge();
        // Only re-render if announcements panel is currently visible
        const annPanel = document.querySelector('.dash-panel[data-panel="announcements"]');
        if (annPanel && annPanel.classList.contains('active')) renderAnnouncements();
      });
      // Recount whenever the user toggles a read state (renderAnnouncements rebinds buttons)
      document.addEventListener('click', (e) => {
        if (e.target.closest('.ann-read-btn')) setTimeout(updateAnnBadge, 0);
      });
    }
    if (typeof FAQS !== 'undefined') FAQS.fetchRemote().then(renderFAQs).catch(() => {});

    // Presence — start heartbeat + global listener so the Members panel
    // and the sidebar online badge always reflect live activity.
    if (typeof PRESENCE !== 'undefined') {
      PRESENCE.start();
      PRESENCE.startLiveListener((users) => {
        renderMembers(users);
      });
      // Re-tick every 30s so "Last seen X ago" labels stay current and
      // anyone who silently went offline drops out of the Online list.
      setInterval(() => renderMembers(), 30000);
    }

    // DMs — start conv listener + bind composer. Conv listener stays
    // alive across tab switches so the unread badge updates anywhere.
    if (typeof DMS !== 'undefined') {
      bindDMComposer();
      DMS.startConvListener(() => {
        renderDMConversations();
        updateDMUnreadBadge();
      });
      // Initial render from cache
      renderDMConversations();
    }

    // Delegate member-card "Message" button → open DM with that user
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.member-message-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const username = btn.dataset.username;
      const display = btn.dataset.display;
      // Pull avatar from the matching member-card avatar element if any
      const card = btn.closest('.member-card');
      const avatarImg = card ? card.querySelector('.member-avatar img') : null;
      const avatar = avatarImg ? avatarImg.src : null;
      openDMConversation(username, display, avatar);
    });
  }
  document.addEventListener('DOMContentLoaded', initDashboardCommunity);
  if (document.readyState !== 'loading') initDashboardCommunity();

  // Routes URL hash on dashboard load:
  //   #tab=<feed|announcements|faq|wins|chat|members|messages>
  //     → opens that sidebar tab
  //   #dm=<username>
  //     → opens the Messages tab + that conversation
  // Used by:
  //   - Notification dropdown links (clicking a Feed/Win/Chat notif)
  //   - Submission inspector's "Open DM" button (admin → student ping)
  function _handleDashboardHash() {
    const hash = window.location.hash || '';
    if (!hash) return;
    const dmMatch = /#dm=([^&]+)/.exec(hash);
    const tabMatch = /#tab=([^&]+)/.exec(hash);

    if (dmMatch) {
      const target = decodeURIComponent(dmMatch[1]);
      if (target && typeof openDMConversation === 'function') {
        setTimeout(() => {
          openDMConversation(target, target, null);
          // Pre-fill a refresh reminder ONLY if this came from the
          // submission inspector context (URL stayed on admin.html
          // before the navigation). For notification-driven opens we
          // leave the input clean.
          const fromInspector = sessionStorage.getItem('_dm_inspector_ping') === '1';
          if (fromInspector) {
            sessionStorage.removeItem('_dm_inspector_ping');
            setTimeout(() => {
              const input = document.getElementById('dmInput');
              if (input) {
                input.value = 'Hi! Pakirefresh lang ng Sphere site (Ctrl+F5) — kailangan ko ma-review yung mga submissions mo. Salamat!';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
              }
            }, 250);
          }
          history.replaceState(null, '', window.location.pathname);
        }, 800);
      }
      return;
    }

    if (tabMatch) {
      const tab = decodeURIComponent(tabMatch[1]);
      // Wait for sidebar bindings to be ready (they're set up in
      // bindDashboardSidebar() on init)
      setTimeout(() => {
        const link = document.querySelector('.dash-sidebar-link[data-tab="' + tab + '"]');
        if (link) link.click();
        history.replaceState(null, '', window.location.pathname);
      }, 400);
    }
  }
  if (document.readyState !== 'loading') _handleDashboardHash();
  else document.addEventListener('DOMContentLoaded', _handleDashboardHash);
}

// ============================================================
// EVENTS PAGE — render events with Upcoming/Past filter
// ============================================================
function renderEventsPage(filter) {
  const listEl = document.getElementById('eventsList');
  if (!listEl || typeof EVENTS === 'undefined') return;
  const all = EVENTS.getAll();
  const now = Date.now();
  const partition = (e) => {
    const t = new Date(e.date).getTime();
    return isNaN(t) ? 'past' : (t >= now ? 'upcoming' : 'past');
  };
  const items = all
    .filter(e => partition(e) === (filter || 'upcoming'))
    .sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      return (filter === 'past') ? tb - ta : ta - tb;
    });
  if (items.length === 0) {
    listEl.innerHTML = '<div class="events-empty"><div class="events-empty-icon">'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
      + '</div>'
      + '<h3>No ' + (filter === 'past' ? 'past' : 'upcoming') + ' events</h3>'
      + '<p>' + (filter === 'past' ? 'Past events will appear here as they happen.' : 'New events get posted here. Check back soon, or follow Stratos on social for live updates.') + '</p>'
      + '</div>';
    return;
  }
  const isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
  listEl.innerHTML = items.map(e => {
    const d = new Date(e.date);
    const dateValid = !isNaN(d.getTime());
    const monthShort = dateValid ? d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase() : '—';
    const dayNum = dateValid ? d.getDate() : '?';
    const timeStr = dateValid ? d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
    const typeBadge = e.type ? '<span class="event-type-badge ' + _esc(e.type) + '">' + _esc(e.type) + '</span>' : '';
    const linkBtn = e.link ? '<a href="' + _esc(e.link) + '" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Join &rarr;</a>' : '';
    return '<article class="event-card" data-id="' + e.id + '">'
      + '<div class="event-date-block">'
      +   '<span class="event-month">' + monthShort + '</span>'
      +   '<span class="event-day">' + dayNum + '</span>'
      + '</div>'
      + '<div class="event-body">'
      +   '<div class="event-type-row">' + typeBadge + (timeStr ? '<span class="event-time">' + _esc(timeStr) + '</span>' : '') + '</div>'
      +   '<h3>' + _esc(e.title) + '</h3>'
      +   (e.description ? '<p>' + _esc(e.description) + '</p>' : '')
      +   (e.location ? '<div class="event-location"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + _esc(e.location) + '</div>' : '')
      + '</div>'
      + '<div class="event-actions">'
      +   linkBtn
      +   (isAdmin ? '<button class="btn btn-outline btn-sm event-delete-btn" data-id="' + e.id + '">Delete</button>' : '')
      + '</div>'
      + '</article>';
  }).join('');
  if (isAdmin) {
    listEl.querySelectorAll('.event-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this event?')) return;
        EVENTS.remove(btn.dataset.id);
        const activeFilter = document.querySelector('.events-filter.active');
        renderEventsPage(activeFilter ? activeFilter.dataset.filter : 'upcoming');
      });
    });
  }
}

if (currentPage === 'events.html') {
  function initEventsPage() {
    const filterBtns = document.querySelectorAll('.events-filter');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderEventsPage(btn.dataset.filter);
      });
    });
    renderEventsPage('upcoming');
    if (typeof EVENTS !== 'undefined') {
      EVENTS.fetchRemote().then(() => {
        const activeFilter = document.querySelector('.events-filter.active');
        renderEventsPage(activeFilter ? activeFilter.dataset.filter : 'upcoming');
      }).catch(() => {});
    }

    // ===== Admin event composer =====
    const isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
    const adminBar = document.getElementById('eventsAdminBar');
    const newEventBtn = document.getElementById('newEventBtn');
    const composer = document.getElementById('eventComposer');
    const titleInput = document.getElementById('eventTitleInput');
    const dateInput = document.getElementById('eventDateInput');
    const typeInput = document.getElementById('eventTypeInput');
    const locationInput = document.getElementById('eventLocationInput');
    const linkInput = document.getElementById('eventLinkInput');
    const descInput = document.getElementById('eventDescInput');
    const submitBtn = document.getElementById('eventSubmitBtn');
    const cancelBtn = document.getElementById('eventCancelBtn');
    const toast = document.getElementById('eventComposerToast');

    if (!adminBar) return;
    if (!isAdmin) { adminBar.style.display = 'none'; return; }
    adminBar.style.display = 'block';

    const refreshSubmitState = () => {
      if (!submitBtn) return;
      const ok = titleInput && titleInput.value.trim().length > 0
        && dateInput && dateInput.value;
      submitBtn.disabled = !ok;
    };
    [titleInput, dateInput, typeInput, locationInput, linkInput, descInput].forEach(el => {
      if (el) el.addEventListener('input', refreshSubmitState);
    });
    refreshSubmitState();

    if (newEventBtn && composer) {
      newEventBtn.addEventListener('click', () => {
        const open = composer.style.display !== 'none';
        composer.style.display = open ? 'none' : 'block';
        if (!open && titleInput) setTimeout(() => titleInput.focus(), 50);
      });
    }
    if (cancelBtn && composer) {
      cancelBtn.addEventListener('click', () => {
        composer.style.display = 'none';
        if (titleInput) titleInput.value = '';
        if (dateInput) dateInput.value = '';
        if (typeInput) typeInput.value = 'workshop';
        if (locationInput) locationInput.value = '';
        if (linkInput) linkInput.value = '';
        if (descInput) descInput.value = '';
        refreshSubmitState();
      });
    }
    if (composer) {
      composer.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!titleInput || !dateInput) return;
        if (!titleInput.value.trim() || !dateInput.value) return;
        // datetime-local inputs are local-tz; store as ISO so the
        // upcoming/past filter compares cleanly against Date.now().
        const dateISO = new Date(dateInput.value).toISOString();
        EVENTS.add({
          title: titleInput.value,
          description: descInput ? descInput.value : '',
          date: dateISO,
          location: locationInput ? locationInput.value : '',
          link: linkInput ? linkInput.value : '',
          type: typeInput ? typeInput.value : 'workshop'
        });
        // Reset
        titleInput.value = '';
        dateInput.value = '';
        if (typeInput) typeInput.value = 'workshop';
        if (locationInput) locationInput.value = '';
        if (linkInput) linkInput.value = '';
        if (descInput) descInput.value = '';
        refreshSubmitState();
        if (composer) composer.style.display = 'none';
        if (toast) {
          toast.style.display = 'block';
          setTimeout(() => { toast.style.display = 'none'; }, 3500);
        }
        const activeFilter = document.querySelector('.events-filter.active');
        renderEventsPage(activeFilter ? activeFilter.dataset.filter : 'upcoming');
      });
    }
  }
  document.addEventListener('DOMContentLoaded', initEventsPage);
  if (document.readyState !== 'loading') initEventsPage();
}

// ============================================================
// ADMIN ANALYTICS PANEL
// ============================================================
if (currentPage === 'admin.html' && typeof AUTH !== 'undefined' && AUTH.isAdmin && AUTH.isAdmin()) {
  const summaryEl = document.getElementById('analyticsSummary');
  const statusEl = document.getElementById('analyticsStatus');
  const refreshBtn = document.getElementById('analyticsRefreshBtn');

  // Only bind if the Analytics DOM is present
  if (summaryEl && statusEl) {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    async function renderAnalytics() {
      statusEl.textContent = 'Loading analytics…';
      statusEl.style.display = 'block';
      summaryEl.innerHTML = '';
      // Hide all cards until data is ready
      ['analyticsEngagementCard','analyticsCompletionCard','analyticsQuizCard','analyticsSubmissionCard','analyticsLeaderboardCard']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

      if (typeof USER_SYNC === 'undefined' || typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) {
        statusEl.innerHTML = '<div class="analytics-empty"><strong>Firestore not ready.</strong><br>Check firebase-config.js and ensure Firestore is enabled. Once students log in and work through lessons, their data will appear here.</div>';
        return;
      }

      const users = await USER_SYNC.fetchAll();
      if (!users || users.length === 0) {
        statusEl.innerHTML = '<div class="analytics-empty"><strong>No student data yet.</strong><br>Students must log in at least once for their stats to sync. As they complete lessons, pass quizzes, and submit assignments, their data will show up here.</div>';
        return;
      }

      const data = ANALYTICS.compute(users);
      if (data.summary.totalStudents === 0) {
        statusEl.innerHTML = '<div class="analytics-empty"><strong>No students enrolled.</strong><br>Only admin account(s) have synced data so far. Share the signup link so students can enroll.</div>';
        return;
      }

      statusEl.style.display = 'none';

      // Summary cards
      const s = data.summary;
      summaryEl.innerHTML =
        '<div class="analytics-stat-card"><span class="label">Total Students</span><strong class="value">' + s.totalStudents + '</strong><span class="hint">Enrolled &amp; synced</span></div>'
      + '<div class="analytics-stat-card"><span class="label">Avg Progress</span><strong class="value">' + s.avgProgressPct + '%</strong><span class="hint">Across all students</span></div>'
      + '<div class="analytics-stat-card"><span class="label">Overall Quiz Avg</span><strong class="value">' + s.overallAvgQuiz + '%</strong><span class="hint">' + s.totalSubmissions + ' submissions total</span></div>'
      + '<div class="analytics-stat-card"><span class="label">Active Today</span><strong class="value">' + s.activeToday + '</strong><span class="hint">Students with activity</span></div>';

      // Engagement chart (bar chart — one bar per day)
      const engCard = document.getElementById('analyticsEngagementCard');
      const engChart = document.getElementById('analyticsEngagementChart');
      if (engCard && engChart) {
        const entries = Object.entries(data.engagement);
        const max = Math.max.apply(null, [1].concat(entries.map(e => e[1])));
        engChart.innerHTML = '<div class="engagement-bars">' + entries.map(([day, count]) => {
          const pct = Math.round((count / max) * 100);
          const dayLabel = day.slice(-2);  // "15"
          const monthLabel = day.slice(5, 7); // "04"
          return '<div class="engagement-bar-col" title="' + day + ': ' + count + ' events">'
            + '<div class="engagement-bar" style="height:' + Math.max(pct, 2) + '%"></div>'
            + '<span class="engagement-day">' + dayLabel + '</span>'
            + '</div>';
        }).join('') + '</div>';
        engCard.style.display = 'block';
      }

      // Completion rate per lesson
      const compCard = document.getElementById('analyticsCompletionCard');
      const compList = document.getElementById('analyticsCompletionList');
      if (compCard && compList) {
        compList.innerHTML = '<div class="analytics-bars">' + Object.values(data.completionByWeek).map(w => {
          const lesson = (typeof LESSONS !== 'undefined') ? LESSONS.get(w.weekId) : null;
          const title = lesson ? ('W' + lesson.week + ' — ' + lesson.title) : w.weekId.toUpperCase();
          return '<div class="analytics-bar-row">'
            + '<div class="analytics-bar-label">' + esc(title) + '</div>'
            + '<div class="analytics-bar-track"><div class="analytics-bar-fill blue" style="width:' + w.percent + '%"></div></div>'
            + '<div class="analytics-bar-value"><strong>' + w.percent + '%</strong><span>' + w.completed + '/' + w.total + '</span></div>'
            + '</div>';
        }).join('') + '</div>';
        compCard.style.display = 'block';
      }

      // Quiz averages
      const quizCard = document.getElementById('analyticsQuizCard');
      const quizList = document.getElementById('analyticsQuizList');
      if (quizCard && quizList) {
        const rows = Object.values(data.quizByWeek).filter(q => q.count > 0);
        if (rows.length === 0) {
          quizList.innerHTML = '<p style="color:var(--text-light);padding:16px 0;">No quiz attempts yet.</p>';
        } else {
          quizList.innerHTML = '<div class="analytics-bars">' + rows.map(q => {
            const lesson = (typeof LESSONS !== 'undefined') ? LESSONS.get(q.weekId) : null;
            const title = lesson ? ('W' + lesson.week + ' — ' + lesson.title) : q.weekId.toUpperCase();
            return '<div class="analytics-bar-row">'
              + '<div class="analytics-bar-label">' + esc(title) + '</div>'
              + '<div class="analytics-bar-track"><div class="analytics-bar-fill purple" style="width:' + q.avg + '%"></div></div>'
              + '<div class="analytics-bar-value"><strong>' + q.avg + '%</strong><span>' + q.count + ' attempt' + (q.count === 1 ? '' : 's') + '</span></div>'
              + '</div>';
          }).join('') + '</div>';
        }
        quizCard.style.display = 'block';
      }

      // Assignment submission rates
      const subCard = document.getElementById('analyticsSubmissionCard');
      const subList = document.getElementById('analyticsSubmissionList');
      if (subCard && subList) {
        const rows = Object.values(data.submissionByWeek).filter(x => {
          const lesson = (typeof LESSONS !== 'undefined') ? LESSONS.get(x.weekId) : null;
          return lesson && lesson.assignment && lesson.assignment.enabled;
        });
        if (rows.length === 0) {
          subList.innerHTML = '<p style="color:var(--text-light);padding:16px 0;">No lessons have assignments enabled.</p>';
        } else {
          subList.innerHTML = '<div class="analytics-bars">' + rows.map(w => {
            const lesson = LESSONS.get(w.weekId);
            const title = 'W' + lesson.week + ' — ' + (lesson.assignment.title || lesson.title);
            return '<div class="analytics-bar-row">'
              + '<div class="analytics-bar-label">' + esc(title) + '</div>'
              + '<div class="analytics-bar-track"><div class="analytics-bar-fill pink" style="width:' + w.percent + '%"></div></div>'
              + '<div class="analytics-bar-value"><strong>' + w.percent + '%</strong><span>' + w.submitted + '/' + w.total + '</span></div>'
              + '</div>';
          }).join('') + '</div>';
        }
        subCard.style.display = 'block';
      }

      // Leaderboard
      const lbCard = document.getElementById('analyticsLeaderboardCard');
      const lbTable = document.getElementById('analyticsLeaderboard');
      if (lbCard && lbTable) {
        const rows = data.leaderboard.slice(0, 25);
        lbTable.innerHTML =
          '<thead><tr><th style="width:48px">#</th><th>Student</th><th>Done</th><th>Quiz Avg</th><th>Submissions</th><th>Score</th></tr></thead>'
          + '<tbody>' + rows.map((u, i) => {
            const medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : (i + 1);
            return '<tr' + (i < 3 ? ' class="podium"' : '') + '>'
              + '<td class="rank">' + medal + '</td>'
              + '<td class="name">' + esc(u.displayName) + '<span class="username">@' + esc(u.username) + '</span></td>'
              + '<td>' + u.completed + ' / 16</td>'
              + '<td>' + (u.avgQuiz ? u.avgQuiz + '%' : '—') + '</td>'
              + '<td>' + u.submitted + '</td>'
              + '<td><strong>' + u.score + '</strong></td>'
              + '</tr>';
          }).join('') + '</tbody>';
        lbCard.style.display = 'block';
      }
    }

    // Bind refresh button
    if (refreshBtn) refreshBtn.addEventListener('click', renderAnalytics);

    // Run once when Analytics tab is first clicked (lazy load)
    const analyticsTab = document.querySelector('.admin-tab[data-tab="analytics"]');
    if (analyticsTab) {
      let alreadyLoaded = false;
      analyticsTab.addEventListener('click', () => {
        if (alreadyLoaded) return;
        alreadyLoaded = true;
        // Give Firebase anonymous auth a moment to complete
        setTimeout(renderAnalytics, 500);
      });
    }
  }
}

// ============================================================
// ADMIN STUDENTS PANEL — registered users from localStorage + Firestore
// ============================================================
if (currentPage === 'admin.html' && typeof AUTH !== 'undefined' && AUTH.isAdmin && AUTH.isAdmin()) {
  const studentsTbody = document.getElementById('studentsTbody');
  const studentsCount = document.getElementById('studentsCount');
  const studentsSearch = document.getElementById('studentsSearch');
  const studentsRoleFilter = document.getElementById('studentsRoleFilter');
  const studentsSortBy = document.getElementById('studentsSortBy');
  const studentsRefreshBtn = document.getElementById('studentsRefreshBtn');
  const studentsExportBtn = document.getElementById('studentsExportBtn');

  if (studentsTbody) {
    let studentCache = [];
    const escS = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    function fmtDate(ts) {
      if (!ts) return '—';
      const d = ts && ts.toDate ? ts.toDate() : new Date(ts);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // Merge localStorage `auth_users` + Firestore `sphere_users` so the
    // table shows everyone — even students who signed up locally and
    // haven't logged in yet (Firestore-only) or vice versa.
    async function loadStudents() {
      const local = AUTH.getAllUsers ? AUTH.getAllUsers() : [];
      let remote = [];
      try {
        if (typeof USER_SYNC !== 'undefined' && USER_SYNC.fetchAll) {
          remote = await USER_SYNC.fetchAll();
        }
      } catch (e) { console.warn('[STUDENTS] fetchAll failed:', e.message); }

      // Merge by username (lowercased)
      const byUser = {};
      local.forEach(u => {
        const key = (u.username || '').toLowerCase();
        if (!key) return;
        // Local fallback for avatar: per-user key stored by AUTH when
        // someone uploads a pic. Only this admin's own avatar will hit
        // this branch — everyone else's photo comes from Firestore below.
        const localAvatar = safeGetItem('avatar_' + u.username) || null;
        byUser[key] = {
          username: u.username,
          displayName: u.fullName || u.username,
          email: u.email || '',
          role: u.role || 'student',
          avatar: u.avatar || localAvatar,
          source: 'local',
          progress: {},
          quizScores: {},
          assignments: {},
          assignmentDetails: {},
          lastActive: null,
          registeredAt: null
        };
      });
      remote.forEach(r => {
        const key = (r.username || r.id || '').toLowerCase();
        if (!key) return;
        const ex = byUser[key] || {};
        byUser[key] = {
          username: r.username || r.id,
          displayName: r.displayName || ex.displayName || r.username || r.id,
          email: r.email || ex.email || '',
          role: r.role || ex.role || 'student',
          // Avatar: Firestore is source of truth, fall back to whatever
          // local had. Without this, the table only ever showed initials.
          avatar: r.avatar || ex.avatar || null,
          source: ex.source ? 'local+remote' : 'remote',
          provider: r.provider || null,
          progress: r.progress || {},
          quizScores: r.quizScores || {},
          assignments: r.assignments || {},
          // Critical: preserve full submission detail so the inspector
          // can show files + paste-links per lesson. Without this, the
          // modal would show every lesson as 'Not submitted' because
          // it had no payload to read.
          assignmentDetails: r.assignmentDetails || {},
          lastActive: r.lastActive || null,
          lastLogin: r.lastLogin || null,
          registeredAt: r.registeredAt || null
        };
      });

      studentCache = Object.values(byUser);
      render();
    }

    // Has the user actually logged in? Anyone with a Firestore record
    // (source includes 'remote') OR any lastActive/lastLogin timestamp
    // counts as having logged in at least once.
    function hasLoggedIn(r) {
      return (r.source || '').indexOf('remote') !== -1 || !!r.lastActive || !!r.lastLogin;
    }

    function render() {
      const q = (studentsSearch && studentsSearch.value || '').trim().toLowerCase();
      const roleFilter = studentsRoleFilter ? studentsRoleFilter.value : '';
      const statusFilter = document.getElementById('studentsStatusFilter') ? document.getElementById('studentsStatusFilter').value : '';
      const sortBy = studentsSortBy ? studentsSortBy.value : 'recent';

      let rows = studentCache.slice();
      if (q) {
        rows = rows.filter(r =>
          (r.displayName || '').toLowerCase().includes(q) ||
          (r.username || '').toLowerCase().includes(q) ||
          (r.email || '').toLowerCase().includes(q)
        );
      }
      if (roleFilter) rows = rows.filter(r => r.role === roleFilter);
      if (statusFilter === 'active') rows = rows.filter(r => hasLoggedIn(r));
      if (statusFilter === 'pending') rows = rows.filter(r => !hasLoggedIn(r));

      const tsOf = (v) => {
        if (!v) return 0;
        if (v.toDate) return v.toDate().getTime();
        const d = new Date(v);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };
      rows.sort((a, b) => {
        if (sortBy === 'name') {
          return (a.displayName || '').localeCompare(b.displayName || '');
        }
        if (sortBy === 'progress') {
          const pa = a.progress ? Object.values(a.progress).filter(Boolean).length : 0;
          const pb = b.progress ? Object.values(b.progress).filter(Boolean).length : 0;
          return pb - pa;
        }
        if (sortBy === 'active') {
          return tsOf(b.lastActive) - tsOf(a.lastActive);
        }
        // recent (default) → registeredAt desc
        return tsOf(b.registeredAt) - tsOf(a.registeredAt);
      });

      if (studentsCount) {
        const loggedInCount = rows.filter(hasLoggedIn).length;
        studentsCount.textContent = rows.length === 0
          ? 'No students match the current filter.'
          : (rows.length + ' student' + (rows.length === 1 ? '' : 's') + ' shown · ' + loggedInCount + ' logged in · ' + (rows.length - loggedInCount) + ' not yet.');
      }

      if (rows.length === 0) {
        studentsTbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:32px; color:var(--text-light);">No registered students yet. Once people sign up, they\'ll appear here.</td></tr>';
        return;
      }

      // Who's looking at this table? Used to disable role-toggle for self.
      const meUsername = (typeof AUTH !== 'undefined' && AUTH.getUser) ? (AUTH.getUser() || '') : '';

      studentsTbody.innerHTML = rows.map(r => {
        const completed = r.progress ? Object.values(r.progress).filter(Boolean).length : 0;
        const pct = Math.round((completed / 16) * 100);
        const quizVals = r.quizScores ? Object.values(r.quizScores).filter(v => typeof v === 'number') : [];
        const avgQuiz = quizVals.length ? Math.round(quizVals.reduce((a, b) => a + b, 0) / quizVals.length) : null;
        const initials = (r.displayName || r.username || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
        const loggedIn = hasLoggedIn(r);
        const statusBadge = loggedIn
          ? '<span class="status-badge active"><span class="status-dot"></span>Logged in</span>'
          : '<span class="status-badge pending"><span class="status-dot"></span>Not yet</span>';

        // Role-toggle button — promote student → admin or demote admin → student.
        // Safety: hide for self (no self-demote) and the primary `admin` account
        // (avoid bricking the org if it's the only admin left).
        const isMe = !!meUsername && meUsername.toLowerCase() === (r.username || '').toLowerCase();
        const isPrimaryAdmin = (r.username || '').toLowerCase() === 'admin';
        const canToggleRole = !isMe && !isPrimaryAdmin;
        const nextRole = r.role === 'admin' ? 'student' : 'admin';
        const roleBtnLabel = r.role === 'admin' ? 'Make Student' : 'Make Admin';
        const roleBtnClass = r.role === 'admin' ? 'to-student' : 'to-admin';
        const roleToggleHtml = canToggleRole
          ? ' <button class="students-role-btn ' + roleBtnClass + '" data-username="' + escS(r.username) + '" data-next-role="' + nextRole + '" title="' + roleBtnLabel + '">' + roleBtnLabel + '</button>'
          : '';

        // Reset-password button — admin-only utility for when a student
        // forgets their password. Hidden for self (admins reset their own
        // via Profile) and for the primary `admin` account.
        const canResetPassword = !isMe && !isPrimaryAdmin;
        const resetPwBtnHtml = canResetPassword
          ? ' <button class="students-resetpw-btn" data-username="' + escS(r.username) + '" title="Reset password">Reset PW</button>'
          : '';

        // Avatar cell: prefer the real profile picture, fall back to initials
        // when the student hasn't uploaded one yet. Stable color hash on the
        // fallback so each student keeps the same colored badge.
        const avatarHtml = r.avatar
          ? '<img class="students-avatar-img" src="' + escS(r.avatar) + '" alt="' + escS(r.displayName) + '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;students-avatar&quot;>' + escS(initials) + '</div>\'">'
          : '<div class="students-avatar">' + escS(initials) + '</div>';

        return '<tr data-username="' + escS(r.username) + '">'
          + '<td>' + avatarHtml + '</td>'
          + '<td><strong>' + escS(r.displayName) + '</strong></td>'
          + '<td><code>@' + escS(r.username) + '</code></td>'
          + '<td>' + escS(r.email || '—') + '</td>'
          + '<td><span class="role-badge ' + escS(r.role) + '">' + escS(r.role) + '</span></td>'
          + '<td>' + statusBadge + '</td>'
          + '<td><div class="students-progress"><div class="students-progress-bar"><div class="students-progress-fill" style="width:' + pct + '%"></div></div><span>' + completed + '/16</span></div></td>'
          + '<td>' + (avgQuiz != null ? avgQuiz + '%' : '—') + '</td>'
          + '<td>' + fmtDate(r.lastLogin || r.lastActive || r.registeredAt) + '</td>'
          + '<td class="students-actions-cell" style="white-space:nowrap;">'
          +   '<button class="students-view-btn" data-username="' + escS(r.username) + '" title="View submissions">View</button>'
          +   roleToggleHtml
          +   resetPwBtnHtml
          +   (r.role !== 'admin' ? ' <button class="students-delete-btn" data-username="' + escS(r.username) + '" title="Remove">Remove</button>' : '')
          + '</td>'
          + '</tr>';
      }).join('');

      // Wire View Submissions buttons → open the inspector modal
      studentsTbody.querySelectorAll('.students-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const username = btn.dataset.username;
          if (!username) return;
          const row = rows.find(r => r.username === username);
          if (row) openSubmissionInspector(row);
        });
      });

      // Wire delete buttons
      studentsTbody.querySelectorAll('.students-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const username = btn.dataset.username;
          if (!username) return;
          if (!confirm('Remove ' + username + '? They will lose access on next login.\n\nNote: this only removes them from this admin\'s view + Firestore. Their browser localStorage record is untouched.')) return;
          // Remove from Firestore
          try {
            if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
              DATA_SYNC.db.collection(USER_SYNC.COLLECTION).doc(username).delete().catch(() => {});
            }
          } catch (e) {}
          // Remove from this browser's localStorage user list
          try {
            const users = AUTH.getAllUsers().filter(u => u.username !== username);
            safeSetItem(AUTH.USERS_KEY, JSON.stringify(users));
          } catch (e) {}
          // Refresh
          loadStudents();
        });
      });

      // Wire role-toggle buttons (Make Admin / Make Student).
      // Writes the new role to Firestore (so the student picks it up on next
      // login from any device) AND patches this browser's local user list so
      // the table reflects the change immediately.
      studentsTbody.querySelectorAll('.students-role-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const rawUsername = btn.dataset.username;
          const nextRole = btn.dataset.nextRole;
          if (!rawUsername || !nextRole) return;
          // Normalize to the canonical lowercase form so we hit the
          // SAME Firestore doc that signup + login use. Writing
          // sphere_users/Maria when the canonical doc is at
          // sphere_users/maria creates a ghost record that login
          // never reads, leaving the role change effectively invisible.
          const username = rawUsername.toLowerCase().trim();

          const confirmMsg = nextRole === 'admin'
            ? 'Promote @' + username + ' to ADMIN?\n\nThey will get full admin access — editing lessons, managing students, viewing all submissions, etc.\n\nThis takes effect on their next login.'
            : 'Demote @' + username + ' to STUDENT?\n\nThey will lose admin access and see the regular student dashboard.\n\nThis takes effect on their next login.';
          if (!confirm(confirmMsg)) return;

          // Lock button while writing
          const origLabel = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Updating…';

          // 1) Firestore — primary source of truth across devices
          try {
            if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
              await DATA_SYNC.db.collection(USER_SYNC.COLLECTION).doc(username)
                .set({ role: nextRole }, { merge: true });
            }
          } catch (e) {
            console.warn('[ROLE] Firestore write failed:', e.message);
            alert('Failed to save the role change to the server.\n\n' + (e.message || 'Unknown error') + '\n\nThe local view will still update, but please retry to sync across devices.');
          }

          // 2) localStorage — so this admin's view updates instantly
          try {
            const users = AUTH.getAllUsers();
            const idx = users.findIndex(u => (u.username || '').toLowerCase().trim() === username);
            if (idx !== -1) {
              users[idx].role = nextRole;
              safeSetItem(AUTH.USERS_KEY, JSON.stringify(users));
            }
          } catch (e) { /* non-fatal */ }

          // Toast-style feedback before refresh
          btn.textContent = nextRole === 'admin' ? '✓ Promoted' : '✓ Demoted';
          setTimeout(() => loadStudents(), 600);
        });
      });

      // Wire reset-password buttons. Click → opens a small modal that
      // lets the admin set a new password (or auto-generate one). Saves
      // to BOTH localStorage (so this admin's view reflects it instantly)
      // AND Firestore (so the student can log in from any device with
      // the new password). The new password is displayed in a copyable
      // box so the admin can share it with the student.
      studentsTbody.querySelectorAll('.students-resetpw-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const username = btn.dataset.username;
          if (!username) return;
          openPasswordResetModal(username);
        });
      });
    }

    // ===== PASSWORD RESET MODAL =====
    function openPasswordResetModal(username) {
      // Find the student row so we can show their display name
      const row = studentCache.find(r => (r.username || '').toLowerCase() === username.toLowerCase());
      const displayName = (row && row.displayName) || username;

      // Build modal
      const overlay = document.createElement('div');
      overlay.className = 'pwreset-overlay';
      overlay.innerHTML = (
        '<div class="pwreset-modal" role="dialog" aria-modal="true">'
        + '<button class="pwreset-close" aria-label="Close">&times;</button>'
        + '<div class="pwreset-header">'
        +   '<div class="pwreset-icon">'
        +     '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
        +   '</div>'
        +   '<h3>Reset password</h3>'
        +   '<p>For <strong>' + _esc(displayName) + '</strong> · <code>@' + _esc(username) + '</code></p>'
        + '</div>'
        + '<div class="pwreset-body">'
        +   '<label for="pwresetInput">New password</label>'
        +   '<div class="pwreset-input-row">'
        +     '<input type="text" id="pwresetInput" placeholder="Type a new password (8+ characters)" minlength="8" autocomplete="off">'
        +     '<button type="button" class="pwreset-gen-btn" id="pwresetGenBtn" title="Auto-generate a strong password">Generate</button>'
        +   '</div>'
        +   '<p class="pwreset-hint">Minimum 8 characters. Share this with the student — they\'ll log in with their existing username and this new password.</p>'
        +   '<div class="pwreset-success" id="pwresetSuccess" style="display:none;">'
        +     '<div class="pwreset-success-label">Password updated. Copy + share:</div>'
        +     '<div class="pwreset-success-box">'
        +       '<code id="pwresetFinalCode"></code>'
        +       '<button type="button" id="pwresetCopyBtn" class="pwreset-copy-btn">Copy</button>'
        +     '</div>'
        +     '<p class="pwreset-hint">Takes effect on their next login.</p>'
        +   '</div>'
        + '</div>'
        + '<div class="pwreset-footer">'
        +   '<button type="button" class="pwreset-cancel-btn">Cancel</button>'
        +   '<button type="button" class="pwreset-save-btn" id="pwresetSaveBtn">Save new password</button>'
        + '</div>'
        + '</div>'
      );
      document.body.appendChild(overlay);

      const input = overlay.querySelector('#pwresetInput');
      const genBtn = overlay.querySelector('#pwresetGenBtn');
      const saveBtn = overlay.querySelector('#pwresetSaveBtn');
      const cancelBtn = overlay.querySelector('.pwreset-cancel-btn');
      const closeBtn = overlay.querySelector('.pwreset-close');
      const successBox = overlay.querySelector('#pwresetSuccess');
      const finalCode = overlay.querySelector('#pwresetFinalCode');
      const copyBtn = overlay.querySelector('#pwresetCopyBtn');

      // Focus the input
      setTimeout(() => input.focus(), 100);

      // Auto-generate strong password — 12 chars, mix of letters/digits/syms
      function generatePassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        const syms = '!@#$%&*';
        let out = '';
        for (let i = 0; i < 11; i++) out += chars[Math.floor(Math.random() * chars.length)];
        out += syms[Math.floor(Math.random() * syms.length)];
        // Shuffle so the symbol isn't always at the end
        return out.split('').sort(() => Math.random() - 0.5).join('');
      }

      genBtn.addEventListener('click', () => {
        input.value = generatePassword();
        input.focus();
      });

      function close() {
        try { document.body.removeChild(overlay); } catch (e) {}
      }
      cancelBtn.addEventListener('click', close);
      closeBtn.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      copyBtn.addEventListener('click', () => {
        const text = finalCode.textContent;
        try {
          navigator.clipboard.writeText(text);
          copyBtn.textContent = '✓ Copied';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        } catch (e) {
          // Fallback for non-secure contexts
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); copyBtn.textContent = '✓ Copied'; } catch (e2) {}
          document.body.removeChild(ta);
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        }
      });

      saveBtn.addEventListener('click', async () => {
        const newPw = (input.value || '').trim();
        if (!newPw) {
          input.focus();
          return;
        }
        if (newPw.length < 8) {
          alert('Password must be at least 8 characters.');
          input.focus();
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        // Normalize the username for the Firestore doc id so it matches
        // what the login fallback will look up. Signup lowercases on
        // creation, so we do the same here.
        const usernameLc = (username || '').toLowerCase().trim();
        let firestoreOk = false;
        let firestoreErr = null;

        console.log('[PWRESET] Saving new password for:', usernameLc, '— length:', newPw.length);

        // 1) Firestore — write password to sphere_users so it
        //    propagates cross-device. We write TWO doc ids defensively:
        //    the lowercased canonical AND the original casing — so if
        //    an older account exists with mixed-case storage, both get
        //    the new password.
        try {
          if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
            const payload = {
              username: usernameLc,
              password: newPw,
              passwordUpdatedAt: (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
                ? firebase.firestore.FieldValue.serverTimestamp()
                : new Date().toISOString()
            };
            await DATA_SYNC.db.collection(USER_SYNC.COLLECTION).doc(usernameLc)
              .set(payload, { merge: true });
            // Also write to the raw username if different (backstop)
            if (username && username !== usernameLc) {
              try {
                await DATA_SYNC.db.collection(USER_SYNC.COLLECTION).doc(username)
                  .set(payload, { merge: true });
              } catch (_) {}
            }
            firestoreOk = true;
            console.log('[PWRESET] ✓ Firestore write succeeded');
          } else {
            firestoreErr = 'Firebase not initialized — password saved locally only.';
            console.warn('[PWRESET]', firestoreErr);
          }
        } catch (e) {
          firestoreErr = e.message || 'Unknown error';
          console.warn('[PWRESET] Firestore write failed:', firestoreErr);
        }

        // 2) localStorage — instant update on this admin's device
        try {
          const users = AUTH.getAllUsers();
          const idx = users.findIndex(u => (u.username || '').toLowerCase().trim() === usernameLc);
          if (idx !== -1) {
            users[idx].password = newPw;
            safeSetItem(AUTH.USERS_KEY, JSON.stringify(users));
            console.log('[PWRESET] ✓ localStorage updated');
          } else {
            console.warn('[PWRESET] User not found in localStorage — they may need to log in from this device once to sync local cache');
          }
        } catch (e) { console.warn('[PWRESET] localStorage update failed:', e.message); }

        // Show success state with copyable new password
        finalCode.textContent = newPw;
        successBox.style.display = 'block';
        saveBtn.style.display = 'none';
        cancelBtn.textContent = 'Done';
        input.disabled = true;
        genBtn.disabled = true;

        const successLabel = overlay.querySelector('.pwreset-success-label');
        if (successLabel) {
          if (firestoreOk) {
            successLabel.innerHTML = '<span style="color:#16a34a">✓</span> Password updated &amp; synced to server. The student can log in from any device.';
          } else {
            successLabel.innerHTML = '<span style="color:#ca8a04">⚠</span> Local-only save — server sync failed' + (firestoreErr ? ': ' + _esc(firestoreErr) : '') + '. Student must log in from this device.';
          }
        }
      });
    }

    // ============================================================
    // SUBMISSION INSPECTOR — modal showing every assignment a single
    // student has submitted, walked through all 16 lessons. Pulls
    // assignmentDetails (synced via USER_SYNC) so files + paste-links
    // are visible. Lessons with no submission show a "Not submitted"
    // placeholder so admin can scan completion at a glance.
    //
    // The modal stays subscribed to the student's Firestore doc while
    // open, so the moment they refresh their browser and push their
    // submission detail up, the modal auto-updates without the admin
    // having to close + reopen it.
    // ============================================================
    let _subInspectorUnsub = null;
    let _subInspectorStudent = null;

    function openSubmissionInspector(student) {
      // Tear down any existing modal first
      closeSubmissionInspector();

      const modal = document.createElement('div');
      modal.className = 'sub-inspector-overlay';
      modal.id = 'subInspectorOverlay';
      _subInspectorStudent = student;

      modal.innerHTML =
        '<div class="sub-inspector" role="dialog" aria-modal="true">'
        +   '<header class="sub-inspector-head" id="subInspectorHead"></header>'
        +   '<div class="sub-inspector-body" id="subInspectorBody"></div>'
        + '</div>';
      document.body.appendChild(modal);

      // First paint with whatever we already have cached
      _renderSubmissionInspector(student);

      // Trigger entry animation
      requestAnimationFrame(() => modal.classList.add('is-open'));

      // Wire close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSubmissionInspector();
      });
      const closeBtn = modal.querySelector('.sub-inspector-close');
      if (closeBtn) closeBtn.addEventListener('click', closeSubmissionInspector);
      // ESC closes too
      document.addEventListener('keydown', _subInspectorEsc);

      // Live listener: when the student's Firestore doc changes (eg. they
      // open Sphere on their phone and USER_SYNC pushes new
      // assignmentDetails), re-render the modal so admin sees the
      // submission contents the moment they land.
      try {
        if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db && student.username) {
          _subInspectorUnsub = DATA_SYNC.db.collection('sphere_users').doc(student.username)
            .onSnapshot(doc => {
              if (!doc.exists) return;
              const data = doc.data() || {};
              // Merge fresh server data into our local student object
              const fresh = Object.assign({}, _subInspectorStudent || student, {
                progress: data.progress || {},
                assignments: data.assignments || {},
                assignmentDetails: data.assignmentDetails || {},
                quizScores: data.quizScores || {}
              });
              _subInspectorStudent = fresh;
              _renderSubmissionInspector(fresh);
            }, err => console.warn('[INSPECTOR] listener:', err.message));
        }
      } catch (e) { console.warn('[INSPECTOR] listener start:', e.message); }
    }

    // Pure render — recomputes head + body from the given student object.
    // Called both on first open and on every Firestore snapshot update.
    function _renderSubmissionInspector(student) {
      const head = document.getElementById('subInspectorHead');
      const body = document.getElementById('subInspectorBody');
      if (!head || !body) return;

      const safeName = (student.displayName || student.username || '?').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const initials = (student.displayName || student.username || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();

      const details = student.assignmentDetails || {};
      const legacyAssignments = student.assignments || {};
      const completed = student.progress ? Object.values(student.progress).filter(Boolean).length : 0;
      const submittedSet = new Set([
        ...Object.keys(details),
        ...Object.keys(legacyAssignments).filter(k => legacyAssignments[k] === true)
      ]);
      const submittedCount = submittedSet.size;
      const pendingCount = Object.keys(legacyAssignments).filter(k => legacyAssignments[k] === true && !details[k]).length;

      head.innerHTML =
        '<div class="sub-inspector-avatar">' + initials + '</div>'
        + '<div class="sub-inspector-meta">'
        +   '<h3>' + safeName + '</h3>'
        +   '<p>@' + (student.username || '') + ' · ' + completed + '/16 lessons · ' + submittedCount + '/16 assignments'
        +     (pendingCount > 0 ? ' · <span style="color:#b45309;">' + pendingCount + ' awaiting sync</span>' : '')
        +   '</p>'
        + '</div>'
        + '<button type="button" class="sub-inspector-close" aria-label="Close">&times;</button>';
      const closeBtn = head.querySelector('.sub-inspector-close');
      if (closeBtn) closeBtn.addEventListener('click', closeSubmissionInspector);

      // Build per-lesson rows for w1..w16
      const lessonsList = (typeof LESSONS !== 'undefined' && LESSONS.getAll) ? LESSONS.getAll() : [];
      function lessonTitle(weekId) {
        const m = lessonsList.find(l => l.id === weekId);
        return m ? ('W' + (m.week || weekId.replace('w', '')) + ': ' + (m.title || '')) : weekId.toUpperCase();
      }

      const rowsHtml = [];
      // Top banner if any lessons are still awaiting sync
      if (pendingCount > 0) {
        rowsHtml.push(
          '<div class="sub-pending-banner">'
          + '<strong>⚠ ' + pendingCount + ' submission' + (pendingCount === 1 ? '' : 's') + ' awaiting sync.</strong> '
          + 'These exist in <strong>' + safeName + '</strong>\'s browser but the file/link contents haven\'t reached the database yet. '
          + 'Send them a DM and ask them to open the Sphere site once — this modal will refresh automatically.'
          + ' <button type="button" class="sub-pending-dm-btn" data-username="' + String(student.username || '').replace(/"/g, '&quot;') + '" data-display="' + safeName.replace(/"/g, '&quot;') + '">Open DM with ' + safeName + ' →</button>'
          + '</div>'
        );
      }

      for (let i = 1; i <= 16; i++) {
        const wid = 'w' + i;
        const sub = details[wid];
        const legacyDone = legacyAssignments[wid] === true;
        const title = lessonTitle(wid);
        const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (!sub) {
          if (legacyDone) {
            rowsHtml.push(
              '<div class="sub-row sub-row-pending">'
              + '<div class="sub-row-head"><span class="sub-row-week">Lesson ' + i + '</span><span class="sub-row-status submitted">Submitted</span><span class="sub-row-status awaiting" title="Detail in student\'s browser, not in database yet">Awaiting sync</span></div>'
              + '<div class="sub-row-title">' + safeTitle + '</div>'
              + '<div class="sub-row-empty-note">The file/link details are in <strong>' + safeName + '</strong>\'s browser. They\'ll appear here automatically the next time this student opens the Sphere site.</div>'
              + '</div>'
            );
          } else {
            rowsHtml.push(
              '<div class="sub-row sub-row-empty">'
              + '<div class="sub-row-head"><span class="sub-row-week">Lesson ' + i + '</span><span class="sub-row-status not-submitted">Not submitted</span></div>'
              + '<div class="sub-row-title">' + safeTitle + '</div>'
              + '</div>'
            );
          }
          continue;
        }

        const files = Array.isArray(sub.files) ? sub.files : [];
        const links = Array.isArray(sub.links) ? sub.links : [];
        const subDate = sub.submittedAt ? new Date(sub.submittedAt) : null;
        const dateStr = subDate ? subDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

        let bodyHtml = '';
        if (files.length === 0 && links.length === 0) {
          bodyHtml = '<div class="sub-row-empty-note">Submitted with no files or links.</div>';
        } else {
          bodyHtml = '<div class="sub-row-items">';
          files.forEach(f => {
            const fName = String(f.name || 'file').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const fSize = String(f.size || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const ftype = String(f.type || '').toLowerCase();
            const icon = ftype.startsWith('image') ? '🖼️' : ftype.startsWith('video') ? '🎬' : '📄';
            // If we have a downloadURL (Storage-backed submission), show
            // a real Open button. Otherwise fall back to the legacy
            // 'Metadata' label so the admin knows the file isn't
            // retrievable from this submission.
            const safeUrl = f.downloadURL ? String(f.downloadURL).replace(/"/g, '&quot;') : '';
            const trailing = safeUrl
              ? '<a class="sub-item-open" href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" download>Open ↗</a>'
              : '<span class="sub-item-tag" title="This submission predates file storage — only filename + size are saved. Ask the student to re-submit so you can open the file.">Metadata only</span>';
            bodyHtml += '<div class="sub-item"><span class="sub-item-icon">' + icon + '</span>'
              + '<div class="sub-item-meta">'
              +   '<div class="sub-item-name">' + (safeUrl ? '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + fName + '</a>' : fName) + '</div>'
              +   '<div class="sub-item-sub">File · ' + fSize + '</div>'
              + '</div>'
              + trailing
              + '</div>';
          });
          links.forEach(linkObj => {
            const url = (typeof linkObj === 'string') ? linkObj : (linkObj && linkObj.url) || '';
            if (!url) return;
            const safeUrl = url.replace(/"/g, '&quot;');
            const display = url.length > 80 ? url.substring(0, 80) + '…' : url;
            const safeDisplay = display.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            bodyHtml += '<div class="sub-item"><span class="sub-item-icon">🔗</span>'
              + '<div class="sub-item-meta"><div class="sub-item-name"><a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + safeDisplay + '</a></div>'
              + '<div class="sub-item-sub">External link</div></div>'
              + '<a class="sub-item-open" href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">Open ↗</a></div>';
          });
          bodyHtml += '</div>';
        }

        rowsHtml.push(
          '<div class="sub-row sub-row-submitted">'
          + '<div class="sub-row-head">'
          +   '<span class="sub-row-week">Lesson ' + i + '</span>'
          +   '<span class="sub-row-status submitted">Submitted</span>'
          +   (dateStr ? '<span class="sub-row-date">' + dateStr + '</span>' : '')
          + '</div>'
          + '<div class="sub-row-title">' + safeTitle + '</div>'
          + bodyHtml
          + '</div>'
        );
      }

      body.innerHTML = rowsHtml.join('');

      // Wire the "Open DM" button on the pending banner
      const dmBtn = body.querySelector('.sub-pending-dm-btn');
      if (dmBtn) {
        dmBtn.addEventListener('click', () => {
          const username = dmBtn.dataset.username;
          const display = dmBtn.dataset.display;
          if (!username) return;
          // Mark the upcoming dashboard load so its hash handler knows
          // to pre-fill the refresh reminder (vs leaving input clean
          // for plain notification opens).
          try { sessionStorage.setItem('_dm_inspector_ping', '1'); } catch (e) {}
          closeSubmissionInspector();
          // Switch to dashboard if we're on admin.html
          if (window.location.pathname.indexOf('admin.html') !== -1) {
            window.location.href = 'dashboard.html#dm=' + encodeURIComponent(username);
            return;
          }
          if (typeof openDMConversation === 'function') {
            openDMConversation(username, display, null);
            setTimeout(() => {
              const input = document.getElementById('dmInput');
              if (input) {
                input.value = 'Hi ' + display + '! Pakirefresh lang ng Sphere site (Ctrl+F5) — kailangan ko ma-review yung mga submissions mo. Salamat!';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
              }
              try { sessionStorage.removeItem('_dm_inspector_ping'); } catch (e) {}
            }, 200);
          }
        });
      }
    }

    function _subInspectorEsc(e) {
      if (e.key === 'Escape') closeSubmissionInspector();
    }

    function closeSubmissionInspector() {
      const m = document.getElementById('subInspectorOverlay');
      if (!m) return;
      m.classList.remove('is-open');
      document.removeEventListener('keydown', _subInspectorEsc);
      // Stop the per-student listener
      if (typeof _subInspectorUnsub === 'function') {
        try { _subInspectorUnsub(); } catch (e) {}
      }
      _subInspectorUnsub = null;
      _subInspectorStudent = null;
      setTimeout(() => { if (m.parentNode) m.parentNode.removeChild(m); }, 220);
    }

    function exportCSV() {
      if (!studentCache.length) { alert('No students to export.'); return; }
      const headers = ['Username', 'Name', 'Email', 'Role', 'Progress (of 16)', 'Quiz Avg %', 'Source', 'Last Active', 'Registered At'];
      const escCSV = (v) => {
        const s = String(v == null ? '' : v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? '"' + s + '"' : s;
      };
      const lines = [headers.join(',')];
      studentCache.forEach(r => {
        const completed = r.progress ? Object.values(r.progress).filter(Boolean).length : 0;
        const quizVals = r.quizScores ? Object.values(r.quizScores).filter(v => typeof v === 'number') : [];
        const avgQuiz = quizVals.length ? Math.round(quizVals.reduce((a, b) => a + b, 0) / quizVals.length) : '';
        lines.push([
          r.username, r.displayName, r.email, r.role, completed, avgQuiz, r.source,
          fmtDate(r.lastActive), fmtDate(r.registeredAt)
        ].map(escCSV).join(','));
      });
      const csv = lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sphere-students-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Wire controls
    if (studentsSearch) studentsSearch.addEventListener('input', render);
    if (studentsRoleFilter) studentsRoleFilter.addEventListener('change', render);
    if (studentsSortBy) studentsSortBy.addEventListener('change', render);
    const studentsStatusFilter = document.getElementById('studentsStatusFilter');
    if (studentsStatusFilter) studentsStatusFilter.addEventListener('change', render);
    if (studentsRefreshBtn) {
      studentsRefreshBtn.addEventListener('click', async () => {
        const orig = studentsRefreshBtn.textContent;
        studentsRefreshBtn.disabled = true;
        studentsRefreshBtn.textContent = 'Refreshing…';
        await loadStudents();
        studentsRefreshBtn.textContent = '✓ Updated';
        setTimeout(() => {
          studentsRefreshBtn.textContent = orig;
          studentsRefreshBtn.disabled = false;
        }, 1200);
      });
    }
    if (studentsExportBtn) studentsExportBtn.addEventListener('click', exportCSV);

    // Live auto-refresh — listen to sphere_users so the table reflects new
    // signups, avatar changes, role promotions, lesson completions, etc.
    // without the admin needing to click Refresh. Debounced so a flurry of
    // writes (e.g. someone finishing a quiz) only triggers one re-render.
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        let debounceTimer = null;
        DATA_SYNC.db.collection(USER_SYNC.COLLECTION).onSnapshot(
          () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => { loadStudents(); }, 800);
          },
          (err) => console.warn('[STUDENTS] live listener failed:', err.message)
        );
      }
    } catch (e) { console.warn('[STUDENTS] could not attach live listener:', e.message); }

    // Reset all student accounts — keeps the admin entry only.
    // Also wipes any community content authored by non-admin users
    // (posts, wins, chat messages) so the slate is truly fresh.
    const studentsResetBtn = document.getElementById('studentsResetBtn');
    if (studentsResetBtn) {
      studentsResetBtn.addEventListener('click', async () => {
        const studentCount = studentCache.filter(r => r.role !== 'admin').length;
        const phrase = prompt(
          'This will permanently delete:\n\n'
          + '  • ALL ' + studentCount + ' non-admin account(s) — including Google sign-ins\n'
          + '  • Every Feed post, Big Win, and Chat message authored by them\n\n'
          + 'The admin account, announcements, FAQs, and events stay intact.\n\n'
          + 'Type DELETE to confirm.'
        );
        if (phrase !== 'DELETE') return;
        studentsResetBtn.disabled = true;
        studentsResetBtn.textContent = 'Resetting…';
        try {
          if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) throw new Error('Firestore not connected');

          // 1) Collect every non-admin username in sphere_users so we
          //    can scrub their community content in step 3.
          const userSnap = await DATA_SYNC.db.collection(USER_SYNC.COLLECTION).get();
          const nonAdminUsernames = new Set();
          const userDeletes = [];
          userSnap.forEach(d => {
            const data = d.data() || {};
            if ((data.role || 'student') !== 'admin') {
              nonAdminUsernames.add((data.username || d.id || '').toLowerCase());
              userDeletes.push(DATA_SYNC.db.collection(USER_SYNC.COLLECTION).doc(d.id).delete());
            }
          });
          await Promise.all(userDeletes);

          // 2) Strip non-admin entries from this browser's localStorage,
          //    wiping any saved per-user avatars too.
          try {
            const localUsers = AUTH.getAllUsers();
            localUsers.forEach(u => {
              if (u.role !== 'admin' && u.username) {
                localStorage.removeItem('avatar_' + u.username);
                nonAdminUsernames.add(u.username.toLowerCase());
              }
            });
            const adminsOnly = localUsers.filter(u => u.role === 'admin');
            safeSetItem(AUTH.USERS_KEY, JSON.stringify(adminsOnly));
          } catch (e) {}

          // 3) For each community collection, delete every doc whose
          //    author is in the non-admin set. We pull each collection
          //    once and Promise.all the deletes — small content volume,
          //    fine for client-side.
          async function wipeAuthored(collection) {
            const snap = await DATA_SYNC.db.collection(collection).get();
            const dels = [];
            snap.forEach(d => {
              const data = d.data() || {};
              const owner = (data.username || '').toLowerCase();
              if (owner && nonAdminUsernames.has(owner)) {
                dels.push(DATA_SYNC.db.collection(collection).doc(d.id).delete());
              }
            });
            await Promise.all(dels);
          }
          await Promise.all([
            wipeAuthored('sphere_posts'),
            wipeAuthored('sphere_wins'),
            wipeAuthored('sphere_chat')
          ]);

          // 4) Mirror the wipe in localStorage caches so the admin's
          //    own UI doesn't show ghost entries until next reload.
          try {
            const stripByUser = (key) => {
              const arr = safeGetJSON(key, []);
              if (!Array.isArray(arr)) return;
              safeSetItem(key, JSON.stringify(
                arr.filter(it => !it || !it.username || !nonAdminUsernames.has((it.username || '').toLowerCase()))
              ));
            };
            stripByUser('community_posts');
            stripByUser('community_wins');
            stripByUser('community_chat');
          } catch (e) {}
        } catch (e) {
          alert('Reset failed: ' + (e && e.message ? e.message : e));
          studentsResetBtn.disabled = false;
          studentsResetBtn.textContent = 'Reset all students';
          return;
        }
        studentsResetBtn.disabled = false;
        studentsResetBtn.textContent = 'Reset all students';
        await loadStudents();
        alert('Done — only the admin remains.\nFeed, Wins, and Chat from removed students are also wiped.');
      });
    }

    // Lazy-load when Students tab is first clicked
    const studentsTab = document.querySelector('.admin-tab[data-tab="students"]');
    if (studentsTab) {
      let loaded = false;
      studentsTab.addEventListener('click', () => {
        if (loaded) return;
        loaded = true;
        setTimeout(loadStudents, 300);
      });
    }
  }
}


// ============================================================
// ADMIN COMMUNITY PANEL — quick post composers for admin
// (announcement / feed / FAQ — same data as Home Feed sidebar)
// ============================================================
if (currentPage === 'admin.html' && typeof AUTH !== 'undefined' && AUTH.isAdmin && AUTH.isAdmin()) {
  function flashToast(el) {
    if (!el) return;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3500);
  }

  // ----- Announcement composer -----
  const annTitle = document.getElementById('adminAnnTitle');
  const annBody = document.getElementById('adminAnnBody');
  const annPinned = document.getElementById('adminAnnPinned');
  const annSubmit = document.getElementById('adminAnnSubmitBtn');
  const annToast = document.getElementById('adminAnnToast');
  const updateAnnState = () => { if (annSubmit && annTitle) annSubmit.disabled = annTitle.value.trim().length === 0; };
  if (annTitle) annTitle.addEventListener('input', updateAnnState);
  if (annSubmit) annSubmit.addEventListener('click', () => {
    if (!annTitle || !annTitle.value.trim() || typeof ANNOUNCEMENTS === 'undefined') return;
    ANNOUNCEMENTS.add(annTitle.value, annBody ? annBody.value : '', annPinned ? annPinned.checked : false);
    annTitle.value = '';
    if (annBody) annBody.value = '';
    if (annPinned) annPinned.checked = false;
    updateAnnState();
    flashToast(annToast);
  });

  // ----- Feed post composer -----
  const feedText = document.getElementById('adminFeedText');
  const feedSubmit = document.getElementById('adminFeedSubmitBtn');
  const feedCount = document.getElementById('adminFeedCharCount');
  const feedToast = document.getElementById('adminFeedToast');
  const updateFeedState = () => {
    if (!feedText || !feedSubmit) return;
    if (feedCount) feedCount.textContent = feedText.value.length + ' / 500';
    feedSubmit.disabled = feedText.value.trim().length === 0;
  };
  if (feedText) feedText.addEventListener('input', updateFeedState);
  if (feedSubmit) feedSubmit.addEventListener('click', () => {
    if (!feedText || !feedText.value.trim() || typeof POSTS === 'undefined') return;
    POSTS.add(feedText.value, []);
    feedText.value = '';
    updateFeedState();
    flashToast(feedToast);
  });

  // ----- FAQ composer -----
  const faqQ = document.getElementById('adminFaqQ');
  const faqA = document.getElementById('adminFaqA');
  const faqSubmit = document.getElementById('adminFaqSubmitBtn');
  const faqToast = document.getElementById('adminFaqToast');
  const updateFaqState = () => { if (faqSubmit && faqQ) faqSubmit.disabled = faqQ.value.trim().length === 0; };
  if (faqQ) faqQ.addEventListener('input', updateFaqState);
  if (faqSubmit) faqSubmit.addEventListener('click', () => {
    if (!faqQ || !faqQ.value.trim() || typeof FAQS === 'undefined') return;
    FAQS.add(faqQ.value, faqA ? faqA.value : '');
    faqQ.value = '';
    if (faqA) faqA.value = '';
    updateFaqState();
    flashToast(faqToast);
  });
}

// ============================================================
// MEDIA LIGHTBOX — full-size viewer for post / win images
// One global overlay injected on first use; click any .post-media
// img to open it, ESC / click-outside / × to close, ← / → to walk
// through the post's images when there's more than one.
// ============================================================
const MEDIA_LIGHTBOX = {
  el: null,
  imgEl: null,
  counterEl: null,
  prevBtn: null,
  nextBtn: null,
  current: { sources: [], index: 0 },

  ensure() {
    if (this.el) return this.el;
    const wrap = document.createElement('div');
    wrap.className = 'lightbox';
    wrap.setAttribute('hidden', '');
    wrap.innerHTML = ''
      + '<button type="button" class="lightbox-close" aria-label="Close">&times;</button>'
      + '<button type="button" class="lightbox-nav lightbox-prev" aria-label="Previous">'
      +   '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
      + '</button>'
      + '<button type="button" class="lightbox-nav lightbox-next" aria-label="Next">'
      +   '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
      + '</button>'
      + '<div class="lightbox-stage"><img class="lightbox-img" alt=""></div>'
      + '<div class="lightbox-counter"></div>';
    document.body.appendChild(wrap);
    this.el = wrap;
    this.imgEl = wrap.querySelector('.lightbox-img');
    this.counterEl = wrap.querySelector('.lightbox-counter');
    this.prevBtn = wrap.querySelector('.lightbox-prev');
    this.nextBtn = wrap.querySelector('.lightbox-next');

    wrap.querySelector('.lightbox-close').addEventListener('click', () => this.close());
    this.prevBtn.addEventListener('click', (e) => { e.stopPropagation(); this.show(-1); });
    this.nextBtn.addEventListener('click', (e) => { e.stopPropagation(); this.show(1); });
    // Click outside the image closes
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.classList.contains('lightbox-stage')) this.close();
    });
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (this.el.hasAttribute('hidden')) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowLeft') this.show(-1);
      else if (e.key === 'ArrowRight') this.show(1);
    });
    return wrap;
  },

  open(sources, index) {
    if (!sources || !sources.length) return;
    this.ensure();
    this.current.sources = sources.slice();
    this.current.index = Math.max(0, Math.min(index || 0, sources.length - 1));
    this._render();
    this.el.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => this.el.classList.add('is-open'));
  },

  close() {
    if (!this.el) return;
    this.el.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => { if (this.el) this.el.setAttribute('hidden', ''); }, 200);
  },

  show(delta) {
    const len = this.current.sources.length;
    if (!len) return;
    this.current.index = (this.current.index + delta + len) % len;
    this._render();
  },

  _render() {
    if (!this.imgEl) return;
    const src = this.current.sources[this.current.index];
    this.imgEl.src = src;
    const len = this.current.sources.length;
    if (this.counterEl) {
      if (len <= 1) {
        this.counterEl.style.display = 'none';
      } else {
        this.counterEl.style.display = 'block';
        this.counterEl.textContent = (this.current.index + 1) + ' / ' + len;
      }
    }
    if (this.prevBtn) this.prevBtn.style.display = len > 1 ? 'flex' : 'none';
    if (this.nextBtn) this.nextBtn.style.display = len > 1 ? 'flex' : 'none';
  }
};

// Delegated click — turns every .post-media img into a clickable
// thumbnail without re-binding on every render. Works for posts,
// wins, and any future surface that uses .post-media.
document.addEventListener('click', (e) => {
  const img = e.target.closest && e.target.closest('.post-media img');
  if (!img) return;
  // Walk up to the post-media container so we can collect all
  // sibling images and open the lightbox at the clicked index.
  const container = img.closest('.post-media');
  if (!container) return;
  const imgs = Array.from(container.querySelectorAll('img'));
  const sources = imgs.map(i => i.src);
  const index = imgs.indexOf(img);
  e.preventDefault();
  MEDIA_LIGHTBOX.open(sources, index);
});

// Cursor cue: any image inside a post-media block is clickable
document.addEventListener('mouseover', (e) => {
  const img = e.target && e.target.closest && e.target.closest('.post-media img');
  if (img && img.style.cursor !== 'zoom-in') img.style.cursor = 'zoom-in';
}, true);

// ============================================================
// SIDEBAR RAIL TOGGLE + PREMIUM POLISH — injects:
//   - A chevron toggle button (collapse/expand)
//   - A brand header with logo + "Sphere Academy" wordmark
//   - "COMMUNITY" and "ACCOUNT" section labels above each group
// All visible only when expanded. State persists in localStorage.
// Runs on every page that has the rail (dashboard, course,
// events, profile, bonus-course, etc).
// ============================================================
(function () {
  function init() {
    const rail = document.querySelector('.dash-sidebar-rail');
    if (!rail) return;
    const nav = rail.querySelector('.dash-sidebar-nav');
    if (!nav) return;
    // Only inject once per page
    if (rail.querySelector('.dash-sidebar-toggle-btn')) return;

    // Restore persisted state — default to collapsed (icons only)
    let expanded = false;
    try { expanded = localStorage.getItem('sidebar_expanded') === '1'; } catch (_) {}
    if (expanded) rail.classList.add('is-expanded');

    // ----- Brand header (visible only when expanded) -----
    // Built as an <a> so clicking it takes the user to their
    // profile (Facebook-style). For logged-out users it falls
    // back to index.html.
    const isLoggedIn = (typeof AUTH !== 'undefined' && AUTH.isLoggedIn && AUTH.isLoggedIn());
    const brandHref = isLoggedIn ? 'profile.html' : 'index.html';
    const brand = document.createElement('a');
    brand.href = brandHref;
    brand.className = 'dash-sidebar-brand';
    brand.title = isLoggedIn ? 'Go to your profile' : 'Sphere Academy';
    brand.innerHTML =
      '<div class="dash-sidebar-brand-logo"><img src="logo.png?v=2025-05-21-discord2" alt=""></div>' +
      '<span class="dash-sidebar-brand-text">Sphere Academy</span>';

    // ----- Toggle button -----
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dash-sidebar-toggle-btn';
    btn.setAttribute('aria-label', 'Toggle sidebar');
    btn.title = 'Toggle sidebar';
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    btn.addEventListener('click', function () {
      const now = rail.classList.toggle('is-expanded');
      try { localStorage.setItem('sidebar_expanded', now ? '1' : '0'); } catch (_) {}
    });

    // ----- Section labels (above each group) -----
    function makeLabel(text) {
      const l = document.createElement('div');
      l.className = 'dash-sidebar-section-label';
      l.textContent = text;
      return l;
    }
    const communityLabel = makeLabel('Community');

    // Wrap brand + toggle in a single header row so they sit
    // side-by-side when expanded (brand on the left, chevron on
    // the right — like Notion / Linear). When collapsed, only
    // the toggle shows (brand has display:none).
    const header = document.createElement('div');
    header.className = 'dash-sidebar-header';
    header.appendChild(brand);
    header.appendChild(btn);
    nav.insertBefore(communityLabel, nav.firstChild);
    nav.insertBefore(header, nav.firstChild);

    // The existing divider in the HTML separates community from
    // account actions. Insert an "Account" label right after it.
    const divider = nav.querySelector('.dash-sidebar-divider');
    if (divider) {
      const accountLabel = makeLabel('Account');
      divider.parentNode.insertBefore(accountLabel, divider.nextSibling);
    }

    // ----- Mobile bottom nav -----
    // Native-app style bottom tab bar for phones. Shown via CSS
    // media query (<768px) only — desktop never sees it. Five
    // most-used tabs: Feed, Course, Search, Notifications,
    // Profile. Tapping any one opens the matching page.
    if (!document.querySelector('.dash-mobile-nav')) {
      const mnav = document.createElement('nav');
      mnav.className = 'dash-mobile-nav';
      mnav.setAttribute('aria-label', 'Mobile navigation');
      mnav.innerHTML =
        '<a href="dashboard.html" aria-label="Home">' +
        '  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></svg>' +
        '  <span>Home</span>' +
        '</a>' +
        '<a href="course.html" aria-label="Course">' +
        '  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' +
        '  <span>Course</span>' +
        '</a>' +
        '<button type="button" id="mobileNavSearch" aria-label="Search">' +
        '  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '  <span>Search</span>' +
        '</button>' +
        '<button type="button" id="mobileNavNotif" aria-label="Notifications">' +
        '  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
        '  <span>Notifs</span>' +
        '  <span class="mobile-nav-badge" id="mobileNavBadge" style="display:none;">0</span>' +
        '</button>' +
        '<a href="profile.html" aria-label="Profile">' +
        '  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '  <span>Profile</span>' +
        '</a>';
      document.body.appendChild(mnav);

      // Wire up the mobile-nav buttons to the navbar's existing
      // search + notification triggers (so the same overlay/dropdown
      // opens). Falls back gracefully if the triggers don't exist.
      const mSearch = document.getElementById('mobileNavSearch');
      const mNotif = document.getElementById('mobileNavNotif');
      if (mSearch) mSearch.addEventListener('click', function () {
        const tgt = document.getElementById('searchBtn');
        if (tgt) tgt.click();
      });
      if (mNotif) mNotif.addEventListener('click', function () {
        const tgt = document.getElementById('notifBtn');
        if (tgt) tgt.click();
      });

      // Mirror the navbar's #notifBadge value into the mobile
      // bottom nav's badge so unread counts show on mobile too.
      const srcB = document.getElementById('notifBadge');
      const dstB = document.getElementById('mobileNavBadge');
      if (srcB && dstB) {
        const syncMB = function () {
          dstB.textContent = srcB.textContent || '0';
          dstB.style.display = srcB.style.display || '';
        };
        syncMB();
        new MutationObserver(syncMB).observe(srcB, {
          attributes: true, characterData: true, childList: true, subtree: true
        });
      }

      // Highlight the active tab based on the current page name.
      const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
      const activeMap = {
        'dashboard.html': 0,
        'course.html': 1,
        'lesson.html': 1,
        'bonus-course.html': 1,
        'profile.html': 4
      };
      const idx = activeMap[page];
      if (idx != null) {
        const items = mnav.querySelectorAll('a, button');
        if (items[idx]) items[idx].classList.add('active');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// (Removed: previous navbar-logo → profile redirect. The user
// prefers the top navbar "Sphere Academy" logo to keep its
// default behavior — link to index.html / home. The "click my
// brand to see my profile" affordance now lives on the SIDEBAR
// brand header instead, which is built as an <a> tag pointing
// to profile.html in the sidebar init code above.)

// ============================================================
// TOAST NOTIFICATIONS — non-blocking inline alerts that slide
// in from the bottom-right and auto-dismiss. Replaces browser
// alert() in many places throughout the app.
//
// Usage: toast('Saved!', 'success')
//        toast('Failed to load', 'error', 5000)
//        toast('New message from Maria', 'info')
// ============================================================
window.toast = function (message, type, duration) {
  type = type || 'info';
  duration = duration || 3200;
  var container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;
  // Add an icon for visual quick-scan
  var icon = type === 'success' ? '✓'
    : type === 'error'   ? '✕'
    : type === 'warn'    ? '⚠'
    : '•';
  t.innerHTML = '<span class="toast-icon">' + icon + '</span>'
    + '<span class="toast-text">' + String(message || '').replace(/</g, '&lt;') + '</span>';
  container.appendChild(t);
  setTimeout(function () {
    t.classList.add('toast-leaving');
    setTimeout(function () { t.remove(); }, 250);
  }, duration);
  return t;
};

// ============================================================
// DAILY STREAK COUNTER — tracks consecutive days of activity
// and exposes both the count and the "did I check in today?"
// flag to the rest of the app. Auto-increments on first
// activity of each day.
//
// Storage:
//   sphere_streak_last  → 'YYYY-MM-DD' of last active day
//   sphere_streak_count → integer
//
// Public:
//   STREAK.get()    → { count, lastDate, checkedInToday }
//   STREAK.poke()   → call on any meaningful activity; updates
//                     count if it's a new day
// ============================================================
window.STREAK = {
  KEY_LAST: 'sphere_streak_last',
  KEY_COUNT: 'sphere_streak_count',
  _today: function () {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  },
  _yesterday: function () {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  },
  get: function () {
    var last = '';
    var count = 0;
    try {
      last = localStorage.getItem(this.KEY_LAST) || '';
      count = parseInt(localStorage.getItem(this.KEY_COUNT) || '0', 10) || 0;
    } catch (_) {}
    return {
      count: count,
      lastDate: last,
      checkedInToday: last === this._today()
    };
  },
  poke: function () {
    var today = this._today();
    var yesterday = this._yesterday();
    var last = '';
    var count = 0;
    try {
      last = localStorage.getItem(this.KEY_LAST) || '';
      count = parseInt(localStorage.getItem(this.KEY_COUNT) || '0', 10) || 0;
    } catch (_) {}
    if (last === today) return { count: count, changed: false };
    if (last === yesterday) {
      count++;
    } else {
      count = 1; // new streak (broken or first time)
    }
    try {
      localStorage.setItem(this.KEY_LAST, today);
      localStorage.setItem(this.KEY_COUNT, String(count));
    } catch (_) {}
    return { count: count, changed: true };
  }
};

// Poke the streak on every page load so logging in / browsing
// counts as activity. Wrapped in setTimeout so it doesn't block
// the initial paint.
setTimeout(function () {
  try {
    if (typeof AUTH !== 'undefined' && AUTH.isLoggedIn && AUTH.isLoggedIn()) {
      var result = STREAK.poke();
      if (result.changed && result.count > 1 && typeof window.toast === 'function') {
        window.toast('🔥 ' + result.count + '-day streak! Keep it up.', 'success', 4000);
      }
    }
  } catch (e) { /* non-fatal */ }
}, 800);

// ============================================================
// LEADERBOARD — aggregates community activity per user and
// ranks the top 10 by posts, wins, or overall (posts+wins*2).
// Renders into #leaderboardList when the Leaderboard tab is
// activated on the dashboard.
// ============================================================
window.LEADERBOARD = {
  current: 'overall',
  compute: function (metric) {
    metric = metric || 'overall';
    var scores = {};
    function bucket(item, key) {
      var u = (item.username || '').toLowerCase().trim();
      if (!u) return;
      if (!scores[u]) {
        scores[u] = {
          username: u,
          displayName: item.displayName || u,
          avatar: item.avatar || null,
          initials: item.initials || u.charAt(0).toUpperCase(),
          role: item.role || 'student',
          posts: 0, wins: 0
        };
      }
      scores[u][key]++;
      // Keep the freshest displayName / avatar we encounter
      if (item.displayName) scores[u].displayName = item.displayName;
      if (item.avatar) scores[u].avatar = item.avatar;
      if (item.role) scores[u].role = item.role;
    }
    try { (window.POSTS && POSTS.getAll() || []).forEach(function (p) { bucket(p, 'posts'); }); } catch (_) {}
    try { (window.WINS && WINS.getAll() || []).forEach(function (w) { bucket(w, 'wins'); }); } catch (_) {}
    var arr = Object.keys(scores).map(function (k) { return scores[k]; });
    if (metric === 'posts') arr.sort(function (a, b) { return b.posts - a.posts; });
    else if (metric === 'wins') arr.sort(function (a, b) { return b.wins - a.wins; });
    else arr.sort(function (a, b) {
      // Overall: posts + wins*2 (wins are higher-effort, weight more)
      return (b.posts + b.wins * 2) - (a.posts + a.wins * 2);
    });
    return arr.slice(0, 10);
  },
  render: function () {
    var listEl = document.getElementById('leaderboardList');
    var emptyEl = document.getElementById('leaderboardEmpty');
    if (!listEl) return;
    var rows = this.compute(this.current);
    if (!rows.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      // Clear any existing items but keep empty state
      Array.prototype.slice.call(listEl.querySelectorAll('.leaderboard-row')).forEach(function (n) { n.remove(); });
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    var me = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser().toLowerCase() : '';
    var html = '';
    rows.forEach(function (r, i) {
      var rank = i + 1;
      var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank;
      var primary = LEADERBOARD.current === 'posts' ? r.posts
        : LEADERBOARD.current === 'wins' ? r.wins
        : (r.posts + r.wins * 2);
      var primaryLabel = LEADERBOARD.current === 'posts' ? 'posts'
        : LEADERBOARD.current === 'wins' ? 'wins'
        : 'points';
      var mine = (r.username === me) ? ' leaderboard-row-mine' : '';
      var avatarHtml = (typeof _avatarHTML === 'function')
        ? _avatarHTML(r)
        : (r.avatar ? '<img src="' + r.avatar + '" alt="">' : '<span>' + r.initials + '</span>');
      html += '<a href="profile.html?user=' + encodeURIComponent(r.username) + '" class="leaderboard-row' + mine + '">'
        +   '<span class="leaderboard-rank">' + medal + '</span>'
        +   '<div class="leaderboard-avatar">' + avatarHtml + '</div>'
        +   '<div class="leaderboard-meta">'
        +     '<strong>' + (r.displayName || '@' + r.username).replace(/</g, '&lt;') + '</strong>'
        +     '<span class="leaderboard-sub">' + r.posts + ' posts · ' + r.wins + ' wins</span>'
        +   '</div>'
        +   '<div class="leaderboard-score">'
        +     '<strong>' + primary + '</strong>'
        +     '<span>' + primaryLabel + '</span>'
        +   '</div>'
        + '</a>';
    });
    // Clear and inject
    Array.prototype.slice.call(listEl.querySelectorAll('.leaderboard-row')).forEach(function (n) { n.remove(); });
    listEl.insertAdjacentHTML('beforeend', html);
  }
};

// Wire the leaderboard tab buttons
(function () {
  function init() {
    document.querySelectorAll('.leaderboard-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.leaderboard-tab').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        LEADERBOARD.current = btn.dataset.metric || 'overall';
        LEADERBOARD.render();
      });
    });
    // Render when the Leaderboard tab becomes active (the existing
    // tab-switching code calls panel-specific renders in some
    // places; we wire a click handler here just for the leaderboard
    // nav link so render fires whether or not the activate switch
    // covers it).
    var leaderboardNav = document.querySelector('.dash-sidebar-link[data-tab="leaderboard"]');
    if (leaderboardNav) {
      leaderboardNav.addEventListener('click', function () {
        setTimeout(function () { LEADERBOARD.render(); }, 50);
      });
    }
    // Also render once on load in case the user lands directly on
    // the leaderboard tab via URL hash.
    if (location.hash.indexOf('tab=leaderboard') !== -1) {
      setTimeout(function () { LEADERBOARD.render(); }, 200);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ============================================================
// BOOKMARKS — let users save posts/wins for later. Stored as
// a Set of "type:id" strings in localStorage keyed by username
// so each device shows the right bookmarks for whoever's
// logged in. Public API:
//
//   BOOKMARKS.has(type, id)    → boolean
//   BOOKMARKS.toggle(type, id) → true if now saved, false if removed
//   BOOKMARKS.list()           → array of {type, id, savedAt}
//
// Used by the post/win render code via a small save button,
// and by profile.html which shows a "Saved" section listing all
// bookmarked items.
// ============================================================
window.BOOKMARKS = {
  _key: function () {
    var u = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser().toLowerCase() : '';
    return 'sphere_bookmarks_' + (u || 'anon');
  },
  _load: function () {
    try { return JSON.parse(localStorage.getItem(this._key()) || '[]'); }
    catch (_) { return []; }
  },
  _save: function (list) {
    try { localStorage.setItem(this._key(), JSON.stringify(list)); } catch (_) {}
  },
  has: function (type, id) {
    var list = this._load();
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === type && list[i].id === id) return true;
    }
    return false;
  },
  toggle: function (type, id) {
    var list = this._load();
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === type && list[i].id === id) {
        list.splice(i, 1);
        this._save(list);
        return false;
      }
    }
    list.unshift({ type: type, id: id, savedAt: Date.now() });
    this._save(list);
    return true;
  },
  list: function () {
    return this._load();
  }
};

// ============================================================
// LESSON NOTES — per-lesson personal notes that auto-save to
// localStorage and mirror to Firestore (so notes follow the
// student across devices). Each lesson has its own note doc
// keyed by week id ("w1", "w2", ...) and scoped to the logged-in
// username so multiple students sharing a device stay isolated.
//
// Public API:
//   NOTES.get(weekId)          → string  (note body)
//   NOTES.set(weekId, body)    → void    (debounced sync)
//   NOTES.all()                → { wId: { body, updatedAt } }
// ============================================================
window.NOTES = {
  COLLECTION: 'sphere_lesson_notes',
  _key: function () {
    var u = (typeof AUTH !== 'undefined' && AUTH.getUser) ? (AUTH.getUser() || '').toLowerCase() : '';
    return 'sphere_notes_' + (u || 'anon');
  },
  _load: function () {
    try { return JSON.parse(localStorage.getItem(this._key()) || '{}') || {}; }
    catch (_) { return {}; }
  },
  _save: function (obj) {
    try { localStorage.setItem(this._key(), JSON.stringify(obj)); } catch (_) {}
  },
  get: function (weekId) {
    var all = this._load();
    return (all[weekId] && all[weekId].body) || '';
  },
  all: function () {
    return this._load();
  },
  _syncTimers: {},
  set: function (weekId, body) {
    if (!weekId) return;
    var all = this._load();
    all[weekId] = { body: String(body || ''), updatedAt: Date.now() };
    this._save(all);
    // Debounce Firestore writes by 1.2s so we don't hammer it
    // while the user is actively typing.
    var self = this;
    if (this._syncTimers[weekId]) clearTimeout(this._syncTimers[weekId]);
    this._syncTimers[weekId] = setTimeout(function () {
      self._syncToFirestore(weekId, all[weekId]);
    }, 1200);
  },
  _syncToFirestore: function (weekId, entry) {
    try {
      if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
      var u = (typeof AUTH !== 'undefined' && AUTH.getUser) ? (AUTH.getUser() || '').toLowerCase() : '';
      if (!u) return;
      DATA_SYNC.db.collection(this.COLLECTION)
        .doc(u)
        .set({ ['notes.' + weekId]: entry }, { merge: true })
        .catch(function (e) { console.warn('[NOTES] sync:', e.message); });
      // Firestore doesn't support dot-key merge on top-level, so use a nested object:
      var payload = { notes: {} };
      payload.notes[weekId] = entry;
      DATA_SYNC.db.collection(this.COLLECTION).doc(u).set(payload, { merge: true })
        .catch(function (e) { console.warn('[NOTES] sync:', e.message); });
    } catch (e) { /* non-fatal */ }
  },
  fetchRemote: async function () {
    try {
      if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
      var u = (typeof AUTH !== 'undefined' && AUTH.getUser) ? (AUTH.getUser() || '').toLowerCase() : '';
      if (!u) return;
      var snap = await DATA_SYNC.db.collection(this.COLLECTION).doc(u).get();
      if (!snap || !snap.exists) return;
      var data = snap.data() || {};
      var remote = data.notes || {};
      var local = this._load();
      // Take whichever copy is more recent per lesson
      var merged = Object.assign({}, local);
      Object.keys(remote).forEach(function (k) {
        var r = remote[k];
        var l = local[k];
        if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) merged[k] = r;
      });
      this._save(merged);
    } catch (e) { console.warn('[NOTES] fetchRemote:', e.message); }
  }
};

// ============================================================
// LESSON NOTES UI — only mounts on lesson.html. Floating
// "Notes" button bottom-right that opens a slide-in drawer
// with a textarea. Auto-saves on input. Shows a small "dot"
// on the button when notes exist for this lesson.
// ============================================================
(function () {
  function init() {
    // Only run on lesson.html
    if (!/lesson\.html(\?|$)/.test(location.pathname + location.search)) {
      var path = (location.pathname.split('/').pop() || '').toLowerCase();
      if (path !== 'lesson.html') return;
    }
    var params = new URLSearchParams(location.search);
    var weekId = params.get('week') || 'w1';

    // Don't show notes UI on the locked / coming-soon / not-found screens.
    // We detect by checking if a normal lesson title (h1) is visible.
    var titleEl = document.querySelector('.lesson-content h1');
    if (!titleEl) {
      // Wait a tick — script.js may render the lesson body asynchronously
      setTimeout(maybeMount, 300);
      return;
    }
    maybeMount();

    function maybeMount() {
      if (document.getElementById('lessonNotesFab')) return;
      var content = document.querySelector('.lesson-content');
      if (!content) return;

      // FAB
      var fab = document.createElement('button');
      fab.id = 'lessonNotesFab';
      fab.className = 'lesson-notes-fab';
      fab.setAttribute('type', 'button');
      fab.setAttribute('aria-label', 'My notes');
      fab.title = 'My notes for this lesson';
      fab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>'
        + '<span class="lesson-notes-fab-label">Notes</span>'
        + '<span class="lesson-notes-dot" id="lessonNotesDot" style="display:none;"></span>';
      document.body.appendChild(fab);

      // Drawer
      var drawer = document.createElement('aside');
      drawer.id = 'lessonNotesDrawer';
      drawer.className = 'lesson-notes-drawer';
      drawer.setAttribute('aria-label', 'My lesson notes');
      drawer.innerHTML = ''
        + '<div class="lesson-notes-header">'
        +   '<div>'
        +     '<div class="lesson-notes-title">My notes</div>'
        +     '<div class="lesson-notes-sub">For ' + (titleEl ? titleEl.textContent : 'this lesson') + '</div>'
        +   '</div>'
        +   '<button type="button" class="lesson-notes-close" aria-label="Close notes">✕</button>'
        + '</div>'
        + '<textarea class="lesson-notes-textarea" id="lessonNotesText" placeholder="Take notes as you go… Auto-saves while you type. Available across devices when signed in."></textarea>'
        + '<div class="lesson-notes-foot">'
        +   '<span class="lesson-notes-status" id="lessonNotesStatus">Auto-saves as you type</span>'
        +   '<div class="lesson-notes-actions">'
        +     '<button type="button" class="btn-outline-mini" id="lessonNotesCopy">Copy</button>'
        +     '<button type="button" class="btn-outline-mini" id="lessonNotesClear">Clear</button>'
        +   '</div>'
        + '</div>';
      document.body.appendChild(drawer);

      // Backdrop
      var backdrop = document.createElement('div');
      backdrop.className = 'lesson-notes-backdrop';
      backdrop.id = 'lessonNotesBackdrop';
      document.body.appendChild(backdrop);

      var ta = drawer.querySelector('#lessonNotesText');
      var status = drawer.querySelector('#lessonNotesStatus');
      var dot = fab.querySelector('#lessonNotesDot');

      function refreshDot() {
        var body = (NOTES.get(weekId) || '').trim();
        dot.style.display = body ? 'inline-block' : 'none';
      }

      function openDrawer() {
        ta.value = NOTES.get(weekId) || '';
        drawer.classList.add('open');
        backdrop.classList.add('open');
        setTimeout(function () { ta.focus(); }, 100);
        refreshDot();
      }
      function closeDrawer() {
        drawer.classList.remove('open');
        backdrop.classList.remove('open');
      }

      fab.addEventListener('click', openDrawer);
      drawer.querySelector('.lesson-notes-close').addEventListener('click', closeDrawer);
      backdrop.addEventListener('click', closeDrawer);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
      });

      // Auto-save
      var saveT;
      ta.addEventListener('input', function () {
        status.textContent = 'Saving…';
        clearTimeout(saveT);
        saveT = setTimeout(function () {
          NOTES.set(weekId, ta.value);
          status.textContent = 'Saved · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          refreshDot();
        }, 300);
      });

      // Copy
      drawer.querySelector('#lessonNotesCopy').addEventListener('click', function () {
        var v = ta.value || '';
        if (!v.trim()) { if (window.toast) toast('Nothing to copy', 'info'); return; }
        try {
          navigator.clipboard.writeText(v).then(function () {
            if (window.toast) toast('Notes copied to clipboard', 'success');
          });
        } catch (_) {
          ta.select();
          document.execCommand('copy');
        }
      });

      // Clear with confirm
      drawer.querySelector('#lessonNotesClear').addEventListener('click', function () {
        if (!ta.value.trim()) return;
        if (!confirm('Clear your notes for this lesson?')) return;
        ta.value = '';
        NOTES.set(weekId, '');
        status.textContent = 'Cleared';
        refreshDot();
      });

      // Initial state
      refreshDot();

      // Pull latest from Firestore (in case the student typed on
      // another device — newer wins)
      try { NOTES.fetchRemote().then(refreshDot); } catch (_) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ============================================================
// RESOURCES — curated template/swipe/tool library, managed in
// the dashboard #tab=resources panel. Admins can add resources;
// students browse and click through. Stored as a plain array
// in localStorage (sphere_resources) + Firestore doc
// sphere_settings/resources so all students see the same set.
// ============================================================
window.RESOURCES = {
  STORAGE_KEY: 'sphere_resources',
  COLLECTION_DOC: { col: 'sphere_settings', doc: 'resources' },

  _defaults: [
    {
      id: 'r_default_1',
      title: 'Meta Ad Library',
      description: 'Search every active ad currently running on Facebook and Instagram. Use it for inspiration before you create.',
      url: 'https://www.facebook.com/ads/library/',
      category: 'tool',
      kind: 'Web',
      addedBy: 'Sphere',
      addedAt: 0
    },
    {
      id: 'r_default_2',
      title: 'Canva — Marketing templates',
      description: 'Hundreds of free editable templates for social posts, ads, banners, and stories. The fastest way to ship a decent creative.',
      url: 'https://www.canva.com/templates/?query=marketing',
      category: 'template',
      kind: 'Canva',
      addedBy: 'Sphere',
      addedAt: 0
    },
    {
      id: 'r_default_3',
      title: 'CapCut',
      description: 'Free mobile + desktop video editor. Captions, transitions, and beat sync — perfect for short-form ads.',
      url: 'https://www.capcut.com/',
      category: 'tool',
      kind: 'App',
      addedBy: 'Sphere',
      addedAt: 0
    },
    {
      id: 'r_default_4',
      title: 'Hook frameworks for short-form video',
      description: '15 proven hook patterns that scroll-stop viewers in the first 2 seconds.',
      url: 'https://blog.hootsuite.com/social-media-hooks/',
      category: 'reading',
      kind: 'Article',
      addedBy: 'Sphere',
      addedAt: 0
    }
  ],

  _load: function () {
    try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || 'null') || null; }
    catch (_) { return null; }
  },
  _save: function (list) {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list || [])); } catch (_) {}
  },

  getAll: function () {
    var stored = this._load();
    if (!stored) {
      this._save(this._defaults.slice());
      return this._defaults.slice();
    }
    return stored.slice().sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); });
  },

  add: function (data) {
    data = data || {};
    if (!data.title || !data.url) return null;
    var u = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : 'Sphere';
    var entry = {
      id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: String(data.title).slice(0, 120),
      description: String(data.description || '').slice(0, 400),
      url: String(data.url).slice(0, 500),
      category: data.category || 'template',
      kind: String(data.kind || '').slice(0, 40),
      addedBy: u,
      addedAt: Date.now()
    };
    var list = this.getAll();
    list.unshift(entry);
    this._save(list);
    this._syncToFirestore(list);
    return entry;
  },

  remove: function (id) {
    var list = this.getAll().filter(function (r) { return r.id !== id; });
    this._save(list);
    this._syncToFirestore(list);
  },

  _syncToFirestore: function (list) {
    try {
      if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
      DATA_SYNC.db.collection(this.COLLECTION_DOC.col)
        .doc(this.COLLECTION_DOC.doc)
        .set({ items: list, updatedAt: Date.now() }, { merge: true })
        .catch(function (e) { console.warn('[RESOURCES] sync:', e.message); });
    } catch (e) {}
  },

  fetchRemote: async function () {
    try {
      if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return this.getAll();
      var snap = await DATA_SYNC.db.collection(this.COLLECTION_DOC.col)
        .doc(this.COLLECTION_DOC.doc).get();
      if (!snap || !snap.exists) return this.getAll();
      var data = snap.data() || {};
      if (Array.isArray(data.items)) {
        this._save(data.items);
      }
      return this.getAll();
    } catch (e) {
      console.warn('[RESOURCES] fetchRemote:', e.message);
      return this.getAll();
    }
  },

  _activeCategory: 'all',
  render: function () {
    var grid = document.getElementById('resourcesGrid');
    var empty = document.getElementById('resourcesEmpty');
    if (!grid) return;

    var items = this.getAll();
    if (this._activeCategory !== 'all') {
      items = items.filter(function (r) { return r.category === RESOURCES._activeCategory; });
    }

    if (items.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    var isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
    var ICON_BY_CAT = {
      template: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
      swipe:    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 2 14 8 20 8"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>',
      tool:     '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
      reading:  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
      video:    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
    };
    var CAT_LABEL = {
      template: 'Template',
      swipe: 'Swipe file',
      tool: 'Tool',
      reading: 'Reading',
      video: 'Video'
    };

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function tryHost(u) {
      try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
    }

    grid.innerHTML = items.map(function (r) {
      var icon = ICON_BY_CAT[r.category] || ICON_BY_CAT.template;
      var host = tryHost(r.url);
      var delBtn = isAdmin
        ? '<button type="button" class="resource-del" data-id="' + r.id + '" aria-label="Remove resource" title="Remove">✕</button>'
        : '';
      return '<a class="resource-card" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer" data-cat="' + esc(r.category) + '">'
        +   '<div class="resource-card-icon resource-card-icon-' + esc(r.category) + '">' + icon + '</div>'
        +   '<div class="resource-card-body">'
        +     '<div class="resource-card-head">'
        +       '<span class="resource-card-badge">' + esc(CAT_LABEL[r.category] || 'Resource') + (r.kind ? ' · ' + esc(r.kind) : '') + '</span>'
        +     '</div>'
        +     '<h4 class="resource-card-title">' + esc(r.title) + '</h4>'
        +     (r.description ? '<p class="resource-card-desc">' + esc(r.description) + '</p>' : '')
        +     '<div class="resource-card-foot">'
        +       (host ? '<span class="resource-card-host">' + esc(host) + ' ↗</span>' : '<span class="resource-card-host">Open ↗</span>')
        +     '</div>'
        +   '</div>'
        +   delBtn
        + '</a>';
    }).join('');

    if (isAdmin) {
      grid.querySelectorAll('.resource-del').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (!confirm('Remove this resource?')) return;
          RESOURCES.remove(btn.dataset.id);
          RESOURCES.render();
          if (window.toast) toast('Resource removed', 'success');
        });
      });
    }
  },

  bindUI: function () {
    var self = this;

    document.querySelectorAll('.resources-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.resources-chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        self._activeCategory = chip.dataset.cat || 'all';
        self.render();
      });
    });

    var isAdmin = (typeof AUTH !== 'undefined' && AUTH.isAdmin) ? AUTH.isAdmin() : false;
    var newBtn = document.getElementById('newResourceBtn');
    var composer = document.getElementById('resourceComposer');
    var titleI = document.getElementById('resTitle');
    var descI = document.getElementById('resDesc');
    var urlI = document.getElementById('resUrl');
    var catI = document.getElementById('resCat');
    var kindI = document.getElementById('resKind');
    var submitBtn = document.getElementById('resSubmitBtn');
    var cancelBtn = document.getElementById('resCancelBtn');

    if (isAdmin && newBtn) {
      newBtn.style.display = '';
      newBtn.addEventListener('click', function () {
        if (composer) composer.style.display = 'block';
        if (titleI) titleI.focus();
      });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      if (composer) composer.style.display = 'none';
      [titleI, descI, urlI, kindI].forEach(function (i) { if (i) i.value = ''; });
      if (submitBtn) submitBtn.disabled = true;
    });

    function checkValid() {
      if (!submitBtn) return;
      var t = titleI && titleI.value.trim();
      var u = urlI && urlI.value.trim();
      submitBtn.disabled = !(t && u && /^https?:\/\//i.test(u));
    }
    [titleI, urlI].forEach(function (el) { if (el) el.addEventListener('input', checkValid); });

    if (submitBtn) submitBtn.addEventListener('click', function () {
      var entry = self.add({
        title: titleI.value,
        description: descI ? descI.value : '',
        url: urlI.value,
        category: catI ? catI.value : 'template',
        kind: kindI ? kindI.value : ''
      });
      if (!entry) return;
      [titleI, descI, urlI, kindI].forEach(function (i) { if (i) i.value = ''; });
      if (composer) composer.style.display = 'none';
      if (submitBtn) submitBtn.disabled = true;
      self.render();
      if (window.toast) toast('Resource added', 'success');
    });
  }
};

(function () {
  function bind() {
    if (document.getElementById('resourcesGrid')) {
      try { RESOURCES.bindUI(); } catch (_) {}
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();

// ============================================================
// SAVED SECTION on profile.html — shows everything the user
// has bookmarked: posts, wins, lessons. Plus a "My notes" tab
// that lists every lesson the user has notes on.
// ============================================================
window._savedTab = 'posts';
window.renderSavedSection = function () {
  var list = document.getElementById('savedList');
  if (!list) return;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function timeAgo(ts) {
    if (!ts) return '';
    var s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  var bookmarks = (typeof BOOKMARKS !== 'undefined' && BOOKMARKS.list) ? BOOKMARKS.list() : [];

  if (window._savedTab === 'posts') {
    // Match bookmarks to posts (and wins, since wins live in POSTS too)
    var posts = (typeof POSTS !== 'undefined' && POSTS.getAll) ? POSTS.getAll() : [];
    var wins = (typeof WINS !== 'undefined' && WINS.getAll) ? WINS.getAll() : [];
    var byId = {};
    posts.forEach(function (p) { byId[p.id] = { type: 'post', item: p }; });
    wins.forEach(function (w) { byId[w.id] = { type: 'win', item: w }; });

    var matched = bookmarks
      .filter(function (b) { return (b.type === 'post' || b.type === 'win') && byId[b.id]; })
      .map(function (b) { return { saved: b, type: byId[b.id].type, item: byId[b.id].item }; });

    if (matched.length === 0) {
      list.innerHTML = '<div class="dash-empty saved-empty"><p>No saved posts yet. Tap the bookmark icon on any post to start collecting.</p></div>';
      return;
    }

    list.innerHTML = matched.map(function (m) {
      var p = m.item;
      var txt = (p.text || '').slice(0, 180) + ((p.text || '').length > 180 ? '…' : '');
      var typeBadge = m.type === 'win'
        ? '<span class="saved-type-badge saved-type-win">Win</span>'
        : '<span class="saved-type-badge saved-type-post">Post</span>';
      return '<a class="saved-item" href="dashboard.html#post=' + esc(p.id) + '">'
        + '<div class="saved-item-head">'
        +   typeBadge
        +   '<span class="saved-item-author">' + esc(p.displayName || p.username || 'Member') + '</span>'
        +   '<span class="saved-item-time">' + esc(timeAgo(p.createdAt)) + ' · saved ' + esc(timeAgo(m.saved.savedAt)) + '</span>'
        + '</div>'
        + (txt ? '<div class="saved-item-text">' + esc(txt) + '</div>' : '<div class="saved-item-text saved-item-media">(media post)</div>')
        + '</a>';
    }).join('');
    return;
  }

  if (window._savedTab === 'lessons') {
    var lessonBookmarks = bookmarks.filter(function (b) { return b.type === 'lesson'; });
    if (lessonBookmarks.length === 0) {
      // Backwards-compat: show "no lessons bookmarked yet"
      list.innerHTML = '<div class="dash-empty saved-empty"><p>No saved lessons yet. Tap the bookmark icon on a lesson card to save it for later.</p></div>';
      return;
    }
    var lessons = (typeof LESSONS !== 'undefined' && LESSONS.getAll) ? LESSONS.getAll() : [];
    var byWid = {};
    lessons.forEach(function (l) { byWid[l.id] = l; });

    list.innerHTML = lessonBookmarks.map(function (b) {
      var l = byWid[b.id];
      if (!l) return '';
      return '<a class="saved-item" href="lesson.html?week=' + esc(l.id) + '">'
        + '<div class="saved-item-head">'
        +   '<span class="saved-type-badge saved-type-lesson">Lesson</span>'
        +   '<span class="saved-item-author">W' + l.week + ' · ' + esc(l.category) + '</span>'
        +   '<span class="saved-item-time">saved ' + esc(timeAgo(b.savedAt)) + '</span>'
        + '</div>'
        + '<div class="saved-item-text">' + esc(l.title) + '</div>'
        + '</a>';
    }).filter(Boolean).join('') || '<div class="dash-empty saved-empty"><p>No saved lessons yet.</p></div>';
    return;
  }

  if (window._savedTab === 'notes') {
    var noteMap = (typeof NOTES !== 'undefined' && NOTES.all) ? NOTES.all() : {};
    var keys = Object.keys(noteMap).filter(function (k) { return (noteMap[k] && (noteMap[k].body || '').trim()); });
    if (keys.length === 0) {
      list.innerHTML = '<div class="dash-empty saved-empty"><p>No lesson notes yet. Open any lesson, hit the Notes button, and start jotting.</p></div>';
      return;
    }
    var lessons2 = (typeof LESSONS !== 'undefined' && LESSONS.getAll) ? LESSONS.getAll() : [];
    var byWid2 = {};
    lessons2.forEach(function (l) { byWid2[l.id] = l; });

    // Newest-first by updatedAt
    keys.sort(function (a, b) { return (noteMap[b].updatedAt || 0) - (noteMap[a].updatedAt || 0); });

    list.innerHTML = keys.map(function (k) {
      var n = noteMap[k];
      var l = byWid2[k];
      var preview = (n.body || '').slice(0, 160) + ((n.body || '').length > 160 ? '…' : '');
      var lessonLabel = l ? ('W' + l.week + ' — ' + l.title) : k;
      return '<a class="saved-item" href="lesson.html?week=' + esc(k) + '">'
        + '<div class="saved-item-head">'
        +   '<span class="saved-type-badge saved-type-note">Note</span>'
        +   '<span class="saved-item-author">' + esc(lessonLabel) + '</span>'
        +   '<span class="saved-item-time">' + esc(timeAgo(n.updatedAt)) + '</span>'
        + '</div>'
        + '<div class="saved-item-text">' + esc(preview) + '</div>'
        + '</a>';
    }).join('');
    return;
  }
};

// Wire saved-tab clicks + on-load fetchRemote for notes
(function () {
  function bind() {
    var tabs = document.querySelectorAll('.saved-tab');
    if (!tabs.length) return;
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        window._savedTab = t.dataset.savedTab || 'posts';
        renderSavedSection();
      });
    });
    // Pre-fetch notes so the Notes tab shows correct data
    try {
      if (typeof NOTES !== 'undefined' && NOTES.fetchRemote) {
        NOTES.fetchRemote();
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();

// ============================================================
// SIDEBAR RAIL TOOLTIPS — JS-managed floating tooltips that
// escape the rail's overflow:auto container. The original CSS
// ::after pseudo-tooltips got clipped at the rail's right edge
// once .dash-sidebar-nav had to scroll (overflow-y:auto coerces
// overflow-x to also clip per CSS spec), so the icon labels
// stopped showing on hover.
//
// This module attaches a single body-level tooltip <div> and
// positions it at the hovered icon's right side using fixed
// coordinates from getBoundingClientRect(). Fixed positioning
// escapes any overflow ancestor.
// ============================================================
(function () {
  function init() {
    var rail = document.querySelector('.dash-sidebar-rail');
    if (!rail) return;

    // Build the singleton tooltip element once and re-use it.
    var tip = document.createElement('div');
    tip.className = 'rail-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'padding: 7px 12px',
      'background: #0a0a0a',
      'color: #fafafa',
      'border-radius: 8px',
      'font-size: 0.8rem',
      'font-weight: 600',
      'font-family: inherit',
      'letter-spacing: 0.01em',
      'white-space: nowrap',
      'pointer-events: none',
      'z-index: 100000',
      'box-shadow: 0 6px 18px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.20)',
      'opacity: 0',
      'transform: translateX(-4px)',
      'transition: opacity 0.15s ease 0.05s, transform 0.15s ease 0.05s',
      'display: none'
    ].join('; ');

    // Small triangle pointing left toward the icon.
    var arrow = document.createElement('span');
    arrow.style.cssText = [
      'position: absolute',
      'top: 50%',
      'left: -5px',
      'transform: translateY(-50%)',
      'width: 0',
      'height: 0',
      'border-style: solid',
      'border-width: 5px 6px 5px 0',
      'border-color: transparent #0a0a0a transparent transparent'
    ].join('; ');
    tip.appendChild(arrow);

    var labelNode = document.createTextNode('');
    tip.insertBefore(labelNode, arrow);

    document.body.appendChild(tip);

    var hideTimer = null;

    function showFor(link) {
      var label = link.getAttribute('data-tooltip');
      if (!label) return;
      // Skip when the rail is EXPANDED — text labels are already
      // visible next to each icon, so the floating tooltip would
      // be redundant noise.
      if (rail.classList.contains('is-expanded')) return;

      labelNode.nodeValue = label;
      tip.style.display = 'block';

      // Position next to the icon, vertically centered.
      var rect = link.getBoundingClientRect();
      var x = rect.right + 14;
      // Tooltip is rendered but invisible — measure to vertically center.
      var th = tip.offsetHeight;
      var y = rect.top + (rect.height / 2) - (th / 2);

      tip.style.left = x + 'px';
      tip.style.top = y + 'px';

      // Reflow then fade in.
      requestAnimationFrame(function () {
        tip.style.opacity = '1';
        tip.style.transform = 'translateX(0)';
      });
    }

    function hide() {
      tip.style.opacity = '0';
      tip.style.transform = 'translateX(-4px)';
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        tip.style.display = 'none';
      }, 180);
    }

    // Delegated listeners — works for current AND future
    // sidebar links (e.g. admin link toggled on by JS).
    rail.addEventListener('mouseover', function (e) {
      var link = e.target.closest('.dash-sidebar-link[data-tooltip]');
      if (!link) return;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      showFor(link);
    });
    rail.addEventListener('mouseout', function (e) {
      var link = e.target.closest('.dash-sidebar-link[data-tooltip]');
      if (!link) return;
      // Only hide if the new hover target isn't another link in the rail.
      var to = e.relatedTarget;
      if (to && to.closest && to.closest('.dash-sidebar-link[data-tooltip]')) return;
      hide();
    });
    // Hide on scroll (positions go stale) and on expand toggle.
    rail.addEventListener('scroll', hide, { passive: true });
    document.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ============================================================
// SPHERE LOGO → ACCOUNT AVATAR
// Helper that makes the Sphere Academy logo the current
// account's profile picture. Auto-runs once per device per user
// on first load (marked via localStorage flag) so subsequent
// uploads/removals stick. Also exposed as window.useSphereLogoAvatar()
// + wired to a "Use Sphere logo" button on profile.html so the
// user can re-apply it any time.
//
// Draws the logo centered on a deep-violet gradient disc that
// reads well at every size — feed avatars, navbar avatar,
// members list, comments, post headers.
// ============================================================
(function () {
  function applyLogoAvatar(opts) {
    opts = opts || {};
    var force = !!opts.force;
    try {
      if (typeof AUTH === 'undefined' || !AUTH.isLoggedIn || !AUTH.isLoggedIn()) return;
      var user = AUTH.getUser && AUTH.getUser();
      if (!user) return;
      var flagKey = 'sphere_logo_avatar_set_' + user.toLowerCase();
      if (!force && localStorage.getItem(flagKey) === '1') return;

      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var size = 256;
          var canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          var ctx = canvas.getContext('2d');

          // Deep-violet radial gradient backdrop — matches the
          // app's identity and makes the logo pop on any theme.
          // Lighter center → darker edge for the "premium sphere"
          // feel.
          var grad = ctx.createRadialGradient(size / 2, size / 2 - 12, 18, size / 2, size / 2, size / 1.4);
          grad.addColorStop(0,    '#3b2a8f');
          grad.addColorStop(0.55, '#1f1547');
          grad.addColorStop(1,    '#0d0822');
          // Clip to circle so avatar UIs that don't mask to a
          // circle still render as a clean disc.
          ctx.save();
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, size, size);

          // Draw the logo centered, scaled to ~72% of the disc
          // with padding around it.
          var pad = size * 0.14;
          var avail = size - pad * 2;
          var ratio = img.width / img.height;
          var dw, dh;
          if (ratio > 1) { dw = avail; dh = avail / ratio; }
          else           { dh = avail; dw = avail * ratio; }
          var dx = (size - dw) / 2;
          var dy = (size - dh) / 2;
          ctx.drawImage(img, dx, dy, dw, dh);
          ctx.restore();

          var dataUrl = canvas.toDataURL('image/png');

          // Persist both the active-session key and the
          // per-username key (matches the manual upload path).
          try { localStorage.setItem('auth_avatar', dataUrl); } catch (_) {}
          try { localStorage.setItem('avatar_' + user, dataUrl); } catch (_) {}
          // Mark this avatar as the system default so UI like the
          // hero trust strip can treat it as "no real photo" and
          // show initials instead — otherwise every student lands
          // with the same Sphere planet, which looks like a
          // template placeholder.
          try { localStorage.setItem('avatar_is_default_' + user, '1'); } catch (_) {}

          // Sync to Firestore so the avatar follows the user
          // across devices. avatarIsDefault flag lets other clients
          // make the same decision.
          try {
            if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
              DATA_SYNC.db.collection('sphere_users').doc(user).set(
                { avatar: dataUrl, avatarIsDefault: true }, { merge: true }
              ).catch(function (e) { console.warn('[LOGO AVATAR] sync:', e.message); });
            }
          } catch (_) {}

          // Update any avatar elements currently on the page so
          // the change is visible without a refresh.
          var navAvatars = document.querySelectorAll('.nav-avatar-img, .nav-avatar img, #avatarImg');
          navAvatars.forEach(function (el) {
            el.src = dataUrl;
            el.style.display = 'block';
          });
          // Hide initials fallback if present
          var initials = document.querySelectorAll('.nav-avatar-initials, #avatarInitials');
          initials.forEach(function (el) { el.style.display = 'none'; });
          // NOTE: GROUPS module appended at end of file via the next Edit.

          try { localStorage.setItem(flagKey, '1'); } catch (_) {}

          if (window.toast) toast('Profile picture set to Sphere logo', 'success');
        } catch (e) {
          console.warn('[LOGO AVATAR]', e.message);
        }
      };
      img.onerror = function () { console.warn('[LOGO AVATAR] failed to load logo.png'); };
      // Bust any stale cache so we always read the latest logo
      img.src = 'logo.png?v=avatar-' + Date.now();
    } catch (e) { /* never throw — non-fatal */ }
  }

  // Expose so the "Use Sphere logo" button on profile.html can
  // re-apply it any time, even after a user uploaded their own
  // photo or removed it.
  window.useSphereLogoAvatar = function () { applyLogoAvatar({ force: true }); };

  function init() {
    // Auto-apply once on first load for the currently logged-in user
    applyLogoAvatar();
    // Wire the manual "Use Sphere logo" button on profile.html
    var btn = document.getElementById('avatarUseLogo');
    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener('click', function () {
        window.useSphereLogoAvatar();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ============================================================
// GROUPS — Discord-style server/channel system
// Each group is a "server" with text channels, voice channels
// (Jitsi-backed), events, and members with roles.
// ============================================================
window.GROUPS = {
  STORAGE_KEY: 'community_groups',
  COLLECTION: 'sphere_groups',
  currentId: 'general',
  currentChannelId: 'general',

  _defaults: [{
    id: 'general',
    name: 'General',
    description: 'Everyone in the academy.',
    icon: '💬',
    ownerUsername: null,
    members: [],
    channels: [
      { id: 'general', name: 'general', type: 'text', topic: 'Main hangout', createdAt: 0 },
      { id: 'announcements', name: 'announcements', type: 'text', topic: 'Important updates only', createdAt: 0 },
      { id: 'voice-lounge', name: 'Voice Lounge', type: 'voice', topic: 'Drop in to chat', createdAt: 0 }
    ],
    events: [],
    createdAt: 0
  }],

  _load: function () {
    try {
      var raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) { return null; }
  },
  _save: function (list) {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list || [])); } catch (_) {}
  },

  _normalize: function (g) {
    if (!g || !g.id) return null;
    g.name = g.name || g.id;
    g.description = g.description || '';
    g.icon = g.icon || '💬';
    g.ownerUsername = (g.ownerUsername === undefined) ? (g.createdBy || null) : g.ownerUsername;
    g.members = Array.isArray(g.members) ? g.members : [];
    if (!Array.isArray(g.channels) || g.channels.length === 0) {
      g.channels = [
        { id: 'general', name: 'general', type: 'text', topic: '', createdAt: g.createdAt || 0 },
        { id: 'voice-lounge', name: 'Voice Lounge', type: 'voice', topic: '', createdAt: g.createdAt || 0 }
      ];
    }
    g.events = Array.isArray(g.events) ? g.events : [];
    g.createdAt = g.createdAt || 0;
    return g;
  },

  getAll: function () {
    var stored = this._load();
    if (!stored) {
      this._save(this._defaults.slice());
      return this._defaults.slice();
    }
    var self = this;
    return stored.map(function (g) { return self._normalize(g); }).filter(Boolean);
  },

  get: function (id) {
    return this.getAll().find(function (g) { return g.id === id; }) || null;
  },

  create: function (data) {
    data = data || {};
    var name = String(data.name || '').trim().slice(0, 60);
    if (!name) return null;
    var u = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
      || 'group-' + Date.now().toString(36);
    var entry = {
      id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: name,
      description: String(data.description || '').slice(0, 200),
      icon: String(data.icon || '💬').slice(0, 4),
      ownerUsername: u,
      members: u ? [{ username: u, role: 'owner', joinedAt: Date.now() }] : [],
      channels: [
        { id: 'general', name: 'general', type: 'text', topic: '', createdAt: Date.now() },
        { id: 'voice-' + slug, name: 'Voice', type: 'voice', topic: '', createdAt: Date.now() }
      ],
      events: [],
      createdAt: Date.now()
    };
    var list = this.getAll();
    list.push(entry);
    this._save(list);
    this._syncToFirestore(entry);
    return entry;
  },

  update: function (id, fields) {
    var list = this.getAll();
    var idx = list.findIndex(function (g) { return g.id === id; });
    if (idx === -1) return null;
    var allowed = ['name', 'description', 'icon'];
    allowed.forEach(function (k) {
      if (fields[k] !== undefined) list[idx][k] = String(fields[k]).slice(0, k === 'description' ? 200 : 60);
    });
    this._save(list);
    this._syncToFirestore(list[idx]);
    return list[idx];
  },

  remove: function (id) {
    if (id === 'general') return false;
    var list = this.getAll().filter(function (g) { return g.id !== id; });
    this._save(list);
    try {
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(this.COLLECTION).doc(id).delete().catch(function () {});
      }
    } catch (_) {}
    return true;
  },

  addChannel: function (groupId, name, type) {
    var list = this.getAll();
    var g = list.find(function (x) { return x.id === groupId; });
    if (!g) return null;
    var clean = String(name || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
    if (!clean) return null;
    if (g.channels.some(function (c) { return c.id === clean; })) return null;
    var channel = {
      id: clean,
      name: type === 'voice' ? String(name).slice(0, 40) : clean,
      type: type === 'voice' ? 'voice' : 'text',
      topic: '',
      createdAt: Date.now()
    };
    g.channels.push(channel);
    this._save(list);
    this._syncToFirestore(g);
    return channel;
  },
  removeChannel: function (groupId, channelId) {
    var list = this.getAll();
    var g = list.find(function (x) { return x.id === groupId; });
    if (!g) return false;
    if (g.channels.length <= 1) return false;
    g.channels = g.channels.filter(function (c) { return c.id !== channelId; });
    this._save(list);
    this._syncToFirestore(g);
    return true;
  },

  addMember: function (groupId, username) {
    if (!username) return false;
    var list = this.getAll();
    var g = list.find(function (x) { return x.id === groupId; });
    if (!g) return false;
    if (g.members.some(function (m) { return m.username === username; })) return true;
    g.members.push({ username: username, role: 'member', joinedAt: Date.now() });
    this._save(list);
    this._syncToFirestore(g);
    return true;
  },
  setMemberRole: function (groupId, username, role) {
    if (['owner', 'moderator', 'member'].indexOf(role) === -1) return false;
    var list = this.getAll();
    var g = list.find(function (x) { return x.id === groupId; });
    if (!g) return false;
    var m = g.members.find(function (x) { return x.username === username; });
    if (m) m.role = role;
    else g.members.push({ username: username, role: role, joinedAt: Date.now() });
    this._save(list);
    this._syncToFirestore(g);
    return true;
  },
  removeMember: function (groupId, username) {
    var list = this.getAll();
    var g = list.find(function (x) { return x.id === groupId; });
    if (!g) return false;
    g.members = g.members.filter(function (m) { return m.username !== username; });
    this._save(list);
    this._syncToFirestore(g);
    return true;
  },
  getMemberRole: function (groupId, username) {
    if (!username) return 'member';
    if (typeof AUTH !== 'undefined' && AUTH.isAdmin && AUTH.isAdmin()) return 'owner';
    var g = this.get(groupId);
    if (!g) return 'member';
    var m = g.members.find(function (x) { return x.username === username; });
    return m ? m.role : 'member';
  },
  isOwner: function (groupId, username) {
    return this.getMemberRole(groupId, username) === 'owner';
  },
  isModerator: function (groupId, username) {
    var r = this.getMemberRole(groupId, username);
    return r === 'owner' || r === 'moderator';
  },
  canManage: function (groupId, username) {
    return this.isModerator(groupId, username);
  },

  addEvent: function (groupId, data) {
    data = data || {};
    if (!data.title || !data.datetime) return null;
    var list = this.getAll();
    var g = list.find(function (x) { return x.id === groupId; });
    if (!g) return null;
    var u = (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null;
    var ev = {
      id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: String(data.title).slice(0, 120),
      description: String(data.description || '').slice(0, 500),
      datetime: data.datetime,
      createdBy: u,
      createdAt: Date.now(),
      rsvps: []
    };
    g.events.push(ev);
    this._save(list);
    this._syncToFirestore(g);
    return ev;
  },
  removeEvent: function (groupId, eventId) {
    var list = this.getAll();
    var g = list.find(function (x) { return x.id === groupId; });
    if (!g) return false;
    g.events = g.events.filter(function (e) { return e.id !== eventId; });
    this._save(list);
    this._syncToFirestore(g);
    return true;
  },
  toggleRSVP: function (groupId, eventId, username) {
    if (!username) return false;
    var list = this.getAll();
    var g = list.find(function (x) { return x.id === groupId; });
    if (!g) return false;
    var ev = g.events.find(function (e) { return e.id === eventId; });
    if (!ev) return false;
    ev.rsvps = ev.rsvps || [];
    var i = ev.rsvps.indexOf(username);
    if (i >= 0) ev.rsvps.splice(i, 1);
    else ev.rsvps.push(username);
    this._save(list);
    this._syncToFirestore(g);
    return i < 0;
  },

  _syncToFirestore: function (group) {
    try {
      if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
      var payload = Object.assign({}, group, { updatedAt: Date.now() });
      DATA_SYNC.db.collection(this.COLLECTION).doc(group.id).set(payload, { merge: true })
        .catch(function (e) { console.warn('[GROUPS] sync:', e.message); });
    } catch (_) {}
  },
  fetchRemote: async function () {
    try {
      if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return this.getAll();
      var snap = await DATA_SYNC.db.collection(this.COLLECTION).get();
      var remote = [];
      snap.forEach(function (d) { remote.push(d.data()); });
      if (remote.length > 0) {
        var self = this;
        var normalized = remote.map(function (g) { return self._normalize(g); }).filter(Boolean);
        if (!normalized.some(function (g) { return g.id === 'general'; })) {
          normalized.unshift(this._defaults[0]);
        }
        this._save(normalized);
      }
      return this.getAll();
    } catch (e) {
      console.warn('[GROUPS] fetchRemote:', e.message);
      return this.getAll();
    }
  },
  _listener: null,
  startLiveListener: function (onUpdate) {
    if (typeof DATA_SYNC === 'undefined' || !DATA_SYNC.db) return;
    this.stopLiveListener();
    var self = this;
    try {
      this._listener = DATA_SYNC.db.collection(this.COLLECTION).onSnapshot(function (snap) {
        var remote = [];
        snap.forEach(function (d) { remote.push(d.data()); });
        var normalized = remote.map(function (g) { return self._normalize(g); }).filter(Boolean);
        if (!normalized.some(function (g) { return g.id === 'general'; })) {
          normalized.unshift(self._defaults[0]);
        }
        self._save(normalized);
        if (typeof onUpdate === 'function') onUpdate(self.getAll());
      }, function (e) { console.warn('[GROUPS] live:', e.message); });
    } catch (e) { console.warn('[GROUPS] startLiveListener:', e.message); }
  },
  stopLiveListener: function () {
    if (typeof this._listener === 'function') { try { this._listener(); } catch (_) {} }
    this._listener = null;
  }
};

// ============================================================
// GROUP DETAIL VIEW — Discord-style channels + voice + events
// ============================================================
(function () {
  var pageName = (location.pathname.split('/').pop() || '').toLowerCase();
  if (pageName !== 'dashboard.html' && pageName !== '') return;

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function _meName() { return (typeof AUTH !== 'undefined' && AUTH.getUser) ? AUTH.getUser() : null; }

  function renderGroupsList() {
    var list = document.getElementById('groupsList');
    if (!list) return;
    var groups = GROUPS.getAll();
    if (groups.length === 0) {
      list.innerHTML = '<div class="dash-empty"><p>No groups yet.</p></div>';
      return;
    }
    list.innerHTML = groups.map(function (g) {
      var channelCount = (g.channels || []).length;
      var sub = g.description || (channelCount + ' channels');
      return '<a class="group-card" data-group-id="' + _esc(g.id) + '" href="#">'
        + '<div class="group-card-icon">' + (g.icon || '💬') + '</div>'
        + '<div class="group-card-body">'
        +   '<div class="group-card-title">' + _esc(g.name) + '</div>'
        +   '<div class="group-card-desc">' + _esc(sub) + '</div>'
        + '</div>'
        + '<div class="group-card-meta"><span class="group-card-chevron">›</span></div>'
        + '</a>';
    }).join('');
    list.querySelectorAll('.group-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        e.preventDefault();
        openGroup(card.dataset.groupId);
      });
    });
  }

  function openGroup(groupId) {
    var g = GROUPS.get(groupId);
    if (!g) return;
    GROUPS.currentId = groupId;
    var firstText = (g.channels || []).find(function (c) { return c.type === 'text'; });
    GROUPS.currentChannelId = firstText ? firstText.id : (g.channels[0] ? g.channels[0].id : 'general');

    var listView = document.getElementById('groupsView');
    var chatViewLegacy = document.getElementById('groupChatView');
    if (listView) listView.style.display = 'none';
    if (chatViewLegacy) chatViewLegacy.style.display = 'none';
    if (!document.getElementById('groupDetailView')) buildGroupDetailScaffold();
    var detailView = document.getElementById('groupDetailView');
    if (detailView) detailView.style.display = 'flex';

    renderGroupDetail();
  }
  function closeGroup() {
    var listView = document.getElementById('groupsView');
    var detailView = document.getElementById('groupDetailView');
    if (detailView) detailView.style.display = 'none';
    if (listView) listView.style.display = 'block';
    renderGroupsList();
  }

  function buildGroupDetailScaffold() {
    var panel = document.querySelector('.dash-panel[data-panel="chat"]');
    if (!panel) return;
    if (document.getElementById('groupDetailView')) return;

    var v = document.createElement('div');
    v.id = 'groupDetailView';
    v.className = 'group-detail-view';
    v.style.display = 'none';
    v.innerHTML =
        '<div class="group-detail-header">'
      +   '<button type="button" class="group-detail-back" id="groupDetailBack" aria-label="Back">'
      +     '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>'
      +   '</button>'
      +   '<div class="group-detail-icon" id="groupDetailIcon">💬</div>'
      +   '<div class="group-detail-title"><h2 id="groupDetailName">Group</h2><p id="groupDetailDesc"></p></div>'
      +   '<button type="button" class="group-detail-settings" id="groupDetailSettings" title="Settings" style="display:none;">'
      +     '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
      +   '</button>'
      + '</div>'
      + '<div class="group-detail-body">'
      +   '<aside class="group-channels" id="groupChannels"></aside>'
      +   '<main class="group-main" id="groupMain"></main>'
      + '</div>'
      + '<div class="jitsi-modal" id="jitsiModal" hidden>'
      +   '<div class="jitsi-modal-backdrop" id="jitsiBackdrop"></div>'
      +   '<div class="jitsi-modal-content">'
      +     '<div class="jitsi-modal-header">'
      +       '<div><h3 id="jitsiTitle">Voice room</h3><p id="jitsiSubtitle">Camera + screen share supported. Click Leave to exit.</p></div>'
      +       '<button type="button" class="jitsi-leave-btn" id="jitsiLeaveBtn">Leave voice</button>'
      +     '</div>'
      +     '<div class="jitsi-modal-frame-wrap"><iframe id="jitsiFrame" allow="camera; microphone; display-capture; fullscreen; clipboard-write"></iframe></div>'
      +   '</div>'
      + '</div>'
      + '<div class="group-modal" id="groupModal" hidden>'
      +   '<div class="group-modal-backdrop" data-close-modal></div>'
      +   '<div class="group-modal-content" id="groupModalContent"></div>'
      + '</div>';
    panel.appendChild(v);

    document.getElementById('groupDetailBack').addEventListener('click', closeGroup);
    document.getElementById('jitsiLeaveBtn').addEventListener('click', closeJitsi);
    document.getElementById('jitsiBackdrop').addEventListener('click', closeJitsi);
    document.querySelectorAll('#groupModal [data-close-modal]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
    document.getElementById('groupDetailSettings').addEventListener('click', openSettingsModal);
  }

  function renderGroupDetail() {
    var g = GROUPS.get(GROUPS.currentId);
    if (!g) return;
    var me = _meName();
    var canManage = GROUPS.canManage(g.id, me);

    var iconEl = document.getElementById('groupDetailIcon');
    var nameEl = document.getElementById('groupDetailName');
    var descEl = document.getElementById('groupDetailDesc');
    var settingsBtn = document.getElementById('groupDetailSettings');
    if (iconEl) iconEl.textContent = g.icon || '💬';
    if (nameEl) nameEl.textContent = g.name;
    if (descEl) descEl.textContent = g.description || '';
    if (settingsBtn) settingsBtn.style.display = canManage ? 'inline-flex' : 'none';

    renderChannelsSidebar(g);
    renderMainContent(g);
  }

  function renderChannelsSidebar(g) {
    var sidebar = document.getElementById('groupChannels');
    if (!sidebar) return;
    var me = _meName();
    var canManage = GROUPS.canManage(g.id, me);
    var textChannels = (g.channels || []).filter(function (c) { return c.type === 'text'; });
    var voiceChannels = (g.channels || []).filter(function (c) { return c.type === 'voice'; });

    function chanItem(c, isActive) {
      var prefix = c.type === 'voice'
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
        : '<span class="channel-hash">#</span>';
      var delBtn = canManage && c.id !== 'general' ? '<button type="button" class="channel-del" data-channel-id="' + _esc(c.id) + '" title="Delete channel">×</button>' : '';
      return '<div class="group-channel' + (isActive ? ' is-active' : '') + '" data-channel-id="' + _esc(c.id) + '" data-channel-type="' + c.type + '">'
        + prefix + '<span class="channel-name">' + _esc(c.name) + '</span>' + delBtn
        + '</div>';
    }

    var html = '';
    html += '<div class="group-channels-section">'
      +   '<div class="group-channels-section-head">'
      +     '<span class="group-channels-label">Text channels</span>'
      +     (canManage ? '<button type="button" class="group-channels-add" data-add-channel="text" title="Add text channel">+</button>' : '')
      +   '</div>'
      +   textChannels.map(function (c) { return chanItem(c, c.id === GROUPS.currentChannelId); }).join('')
      + '</div>';
    html += '<div class="group-channels-section">'
      +   '<div class="group-channels-section-head">'
      +     '<span class="group-channels-label">Voice channels</span>'
      +     (canManage ? '<button type="button" class="group-channels-add" data-add-channel="voice" title="Add voice channel">+</button>' : '')
      +   '</div>'
      +   voiceChannels.map(function (c) { return chanItem(c, false); }).join('')
      + '</div>';
    html += '<div class="group-channels-section group-channels-meta">'
      +   '<div class="group-channel' + (GROUPS.currentChannelId === '__events' ? ' is-active' : '') + '" data-channel-id="__events">'
      +     '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
      +     '<span class="channel-name">Events</span>'
      +     ((g.events || []).length > 0 ? '<span class="channel-badge">' + (g.events || []).length + '</span>' : '')
      +   '</div>'
      +   '<div class="group-channel' + (GROUPS.currentChannelId === '__members' ? ' is-active' : '') + '" data-channel-id="__members">'
      +     '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>'
      +     '<span class="channel-name">Members</span>'
      +   '</div>'
      + '</div>';

    sidebar.innerHTML = html;

    sidebar.querySelectorAll('.group-channel').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('.channel-del')) return;
        var cid = el.dataset.channelId;
        var ctype = el.dataset.channelType;
        if (ctype === 'voice') { openJitsi(g.id, cid); return; }
        GROUPS.currentChannelId = cid;
        renderGroupDetail();
      });
    });
    sidebar.querySelectorAll('.channel-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete this channel?')) return;
        GROUPS.removeChannel(g.id, btn.dataset.channelId);
        if (GROUPS.currentChannelId === btn.dataset.channelId) {
          var still = GROUPS.get(g.id).channels.find(function (c) { return c.type === 'text'; });
          GROUPS.currentChannelId = still ? still.id : 'general';
        }
        renderGroupDetail();
      });
    });
    sidebar.querySelectorAll('[data-add-channel]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openAddChannelModal(g.id, btn.dataset.addChannel);
      });
    });
  }

  function renderMainContent(g) {
    var main = document.getElementById('groupMain');
    if (!main) return;
    if (GROUPS.currentChannelId === '__events') { renderEventsPanel(g, main); return; }
    if (GROUPS.currentChannelId === '__members') { renderMembersPanel(g, main); return; }

    var channel = (g.channels || []).find(function (c) { return c.id === GROUPS.currentChannelId; });
    if (!channel || channel.type !== 'text') {
      main.innerHTML = '<div class="dash-empty"><p>Select a channel.</p></div>';
      return;
    }

    main.innerHTML = ''
      + '<div class="group-channel-header">'
      +   '<span class="channel-hash">#</span>'
      +   '<h3>' + _esc(channel.name) + '</h3>'
      +   (channel.topic ? '<span class="channel-topic">' + _esc(channel.topic) + '</span>' : '')
      + '</div>'
      + '<div class="chat-window">'
      +   '<div class="chat-empty" id="chatEmpty">'
      +     '<div class="chat-empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></div>'
      +     '<p>Be the first to post in #' + _esc(channel.name) + '!</p>'
      +   '</div>'
      +   '<div class="chat-messages" id="chatMessages"></div>'
      + '</div>'
      + '<div class="chat-composer">'
      +   '<input type="text" id="chatInput" maxlength="1000" placeholder="Message #' + _esc(channel.name) + '…" autocomplete="off">'
      +   '<button class="btn btn-primary" id="chatSendBtn" disabled>Send</button>'
      + '</div>';

    GROUPS.currentId = g.id;
    try {
      if (typeof renderChat === 'function') renderChat();
      if (typeof bindChatComposer === 'function') bindChatComposer();
    } catch (e) {}
  }

  function renderEventsPanel(g, root) {
    var me = _meName();
    var canManage = GROUPS.canManage(g.id, me);
    var events = (g.events || []).slice().sort(function (a, b) {
      return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
    });
    var html = '<div class="group-events-header">'
      + '<h3>Events</h3>'
      + (canManage ? '<button type="button" class="btn btn-primary btn-sm" id="newGroupEventBtn">+ New event</button>' : '')
      + '</div>';
    if (events.length === 0) {
      html += '<div class="dash-empty"><p>No events scheduled. ' + (canManage ? 'Click "New event" to add one.' : 'Check back soon.') + '</p></div>';
    } else {
      html += '<div class="group-events-list">';
      events.forEach(function (ev) {
        var when = new Date(ev.datetime);
        var whenValid = !isNaN(when.getTime());
        var dateStr = whenValid ? when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ev.datetime;
        var rsvped = me && (ev.rsvps || []).indexOf(me) !== -1;
        var rsvpCount = (ev.rsvps || []).length;
        html += '<div class="group-event-card">'
          + '<div class="group-event-date">' + (whenValid ? '<strong>' + when.toLocaleDateString(undefined, { month: 'short' }).toUpperCase() + '</strong><span>' + when.getDate() + '</span>' : '<strong>—</strong>') + '</div>'
          + '<div class="group-event-body">'
          +   '<h4>' + _esc(ev.title) + '</h4>'
          +   '<span class="group-event-time">' + _esc(dateStr) + '</span>'
          +   (ev.description ? '<p>' + _esc(ev.description) + '</p>' : '')
          + '</div>'
          + '<div class="group-event-actions">'
          +   '<button type="button" class="btn btn-' + (rsvped ? 'primary' : 'outline') + ' btn-sm group-event-rsvp" data-event-id="' + _esc(ev.id) + '">' + (rsvped ? '✓ Going' : 'RSVP') + ' (' + rsvpCount + ')</button>'
          +   (canManage ? '<button type="button" class="group-event-del" data-event-id="' + _esc(ev.id) + '" title="Delete">×</button>' : '')
          + '</div>'
          + '</div>';
      });
      html += '</div>';
    }
    root.innerHTML = html;

    if (canManage) {
      var newBtn = document.getElementById('newGroupEventBtn');
      if (newBtn) newBtn.addEventListener('click', function () { openEventModal(g.id); });
      root.querySelectorAll('.group-event-del').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('Delete this event?')) return;
          GROUPS.removeEvent(g.id, btn.dataset.eventId);
          renderGroupDetail();
        });
      });
    }
    root.querySelectorAll('.group-event-rsvp').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!me) { if (window.toast) toast('Sign in to RSVP', 'warn'); return; }
        GROUPS.toggleRSVP(g.id, btn.dataset.eventId, me);
        renderGroupDetail();
      });
    });
  }

  function renderMembersPanel(g, root) {
    var me = _meName();
    var iAmOwner = GROUPS.isOwner(g.id, me);
    var presenceUsers = (typeof _MEMBERS_CACHE !== 'undefined' && Array.isArray(_MEMBERS_CACHE)) ? _MEMBERS_CACHE : [];
    var byUsername = {};
    presenceUsers.forEach(function (u) {
      byUsername[u.username] = {
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar,
        avatarIsDefault: u.avatarIsDefault,
        role: 'member'
      };
    });
    (g.members || []).forEach(function (m) {
      if (!byUsername[m.username]) byUsername[m.username] = { username: m.username, displayName: m.username, role: m.role };
      else byUsername[m.username].role = m.role;
    });
    var members = Object.keys(byUsername).map(function (k) { return byUsername[k]; }).sort(function (a, b) {
      var order = { owner: 0, moderator: 1, member: 2 };
      if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
      return String(a.displayName).localeCompare(String(b.displayName));
    });

    var html = '<div class="group-members-header"><h3>Members <span class="group-members-count">' + members.length + '</span></h3></div>';
    if (members.length === 0) {
      html += '<div class="dash-empty"><p>No members yet.</p></div>';
    } else {
      html += '<div class="group-members-list">';
      members.forEach(function (m) {
        var hasRealAvatar = m.avatar && m.avatarIsDefault !== true;
        var avatarHTML = hasRealAvatar
          ? '<img src="' + _esc(m.avatar) + '" alt="">'
          : '<span>' + _esc((m.displayName || m.username || 'U').slice(0, 1).toUpperCase()) + '</span>';
        html += '<div class="group-member">'
          + '<div class="group-member-avatar">' + avatarHTML + '</div>'
          + '<div class="group-member-info">'
          +   '<div class="group-member-name">' + _esc(m.displayName || m.username) + '</div>'
          +   '<span class="group-member-role role-' + m.role + '">' + (m.role === 'owner' ? 'Owner' : m.role === 'moderator' ? 'Moderator' : 'Member') + '</span>'
          + '</div>'
          + (iAmOwner && m.username !== me
              ? '<div class="group-member-actions">'
                + '<button type="button" class="group-member-action" data-action="promote" data-username="' + _esc(m.username) + '" title="' + (m.role === 'moderator' ? 'Demote' : 'Promote to moderator') + '">' + (m.role === 'moderator' ? '↓' : '↑') + '</button>'
                + '<button type="button" class="group-member-action group-member-action-danger" data-action="kick" data-username="' + _esc(m.username) + '" title="Remove from group">×</button>'
                + '</div>'
              : '')
          + '</div>';
      });
      html += '</div>';
    }
    root.innerHTML = html;

    if (iAmOwner) {
      root.querySelectorAll('.group-member-action').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var u = btn.dataset.username;
          var act = btn.dataset.action;
          if (act === 'promote') {
            var current = GROUPS.getMemberRole(g.id, u);
            var next = current === 'moderator' ? 'member' : 'moderator';
            GROUPS.setMemberRole(g.id, u, next);
          } else if (act === 'kick') {
            if (!confirm('Remove ' + u + ' from the group?')) return;
            GROUPS.removeMember(g.id, u);
          }
          renderGroupDetail();
        });
      });
    }
  }

  function openModal(html) {
    var modal = document.getElementById('groupModal');
    var content = document.getElementById('groupModalContent');
    if (!modal || !content) return;
    content.innerHTML = html;
    modal.hidden = false;
    setTimeout(function () { modal.classList.add('open'); }, 10);
  }
  function closeModal() {
    var modal = document.getElementById('groupModal');
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(function () { modal.hidden = true; }, 180);
  }

  function openAddChannelModal(groupId, type) {
    openModal(''
      + '<h3>Add ' + (type === 'voice' ? 'voice' : 'text') + ' channel</h3>'
      + '<p class="group-modal-sub">Choose a short name.</p>'
      + '<input type="text" id="newChannelName" maxlength="32" placeholder="' + (type === 'voice' ? 'e.g. Study Hall' : 'e.g. help') + '">'
      + '<div class="group-modal-actions">'
      +   '<button type="button" class="btn btn-outline btn-sm" data-close-modal>Cancel</button>'
      +   '<button type="button" class="btn btn-primary btn-sm" id="newChannelCreate">Create</button>'
      + '</div>');
    document.querySelector('#groupModal [data-close-modal]').addEventListener('click', closeModal);
    var input = document.getElementById('newChannelName');
    setTimeout(function () { input && input.focus(); }, 100);
    function submit() {
      var name = (input.value || '').trim();
      if (!name) { input.focus(); return; }
      GROUPS.addChannel(groupId, name, type);
      closeModal();
      renderGroupDetail();
    }
    document.getElementById('newChannelCreate').addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') closeModal();
    });
  }

  function openEventModal(groupId) {
    var nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    openModal(''
      + '<h3>New event</h3>'
      + '<label class="group-modal-label">Title</label>'
      + '<input type="text" id="newEventTitle" maxlength="120" placeholder="e.g. Office hours">'
      + '<label class="group-modal-label">When</label>'
      + '<input type="datetime-local" id="newEventDate" value="' + nowLocal + '">'
      + '<label class="group-modal-label">Description (optional)</label>'
      + '<textarea id="newEventDesc" rows="3" maxlength="500" placeholder="Agenda, link to meeting room, etc."></textarea>'
      + '<div class="group-modal-actions">'
      +   '<button type="button" class="btn btn-outline btn-sm" data-close-modal>Cancel</button>'
      +   '<button type="button" class="btn btn-primary btn-sm" id="newEventCreate">Create event</button>'
      + '</div>');
    document.querySelector('#groupModal [data-close-modal]').addEventListener('click', closeModal);
    setTimeout(function () { document.getElementById('newEventTitle').focus(); }, 100);
    document.getElementById('newEventCreate').addEventListener('click', function () {
      var title = (document.getElementById('newEventTitle').value || '').trim();
      var datetime = document.getElementById('newEventDate').value;
      var desc = document.getElementById('newEventDesc').value;
      if (!title || !datetime) return;
      GROUPS.addEvent(groupId, { title: title, datetime: datetime, description: desc });
      closeModal();
      renderGroupDetail();
    });
  }

  function openSettingsModal() {
    var g = GROUPS.get(GROUPS.currentId);
    if (!g) return;
    var me = _meName();
    var iAmOwner = GROUPS.isOwner(g.id, me);
    openModal(''
      + '<h3>Group settings</h3>'
      + '<label class="group-modal-label">Group name</label>'
      + '<input type="text" id="setGroupName" maxlength="60" value="' + _esc(g.name) + '">'
      + '<label class="group-modal-label">Description</label>'
      + '<textarea id="setGroupDesc" rows="2" maxlength="200">' + _esc(g.description || '') + '</textarea>'
      + '<label class="group-modal-label">Icon (emoji)</label>'
      + '<input type="text" id="setGroupIcon" maxlength="4" value="' + _esc(g.icon || '💬') + '" style="width:90px;">'
      + '<div class="group-modal-actions">'
      +   (iAmOwner && g.id !== 'general' ? '<button type="button" class="btn btn-outline btn-sm" id="deleteGroupBtn" style="margin-right:auto;color:#dc2626;border-color:#dc2626;">Delete group</button>' : '')
      +   '<button type="button" class="btn btn-outline btn-sm" data-close-modal>Cancel</button>'
      +   '<button type="button" class="btn btn-primary btn-sm" id="saveGroupBtn">Save</button>'
      + '</div>');
    document.querySelector('#groupModal [data-close-modal]').addEventListener('click', closeModal);
    document.getElementById('saveGroupBtn').addEventListener('click', function () {
      GROUPS.update(g.id, {
        name: document.getElementById('setGroupName').value,
        description: document.getElementById('setGroupDesc').value,
        icon: document.getElementById('setGroupIcon').value
      });
      closeModal();
      renderGroupDetail();
    });
    if (iAmOwner && g.id !== 'general') {
      document.getElementById('deleteGroupBtn').addEventListener('click', function () {
        if (!confirm('Delete this entire group? Cannot be undone.')) return;
        GROUPS.remove(g.id);
        closeModal();
        closeGroup();
      });
    }
  }

  function openJitsi(groupId, channelId) {
    var g = GROUPS.get(groupId);
    if (!g) return;
    var channel = (g.channels || []).find(function (c) { return c.id === channelId; });
    if (!channel) return;
    var me = _meName();
    var displayName = (typeof AUTH !== 'undefined' && AUTH.getDisplayName) ? AUTH.getDisplayName() : (me || 'Guest');
    var roomName = ('SphereAcademy-' + groupId + '-' + channelId).replace(/[^a-zA-Z0-9_-]/g, '');
    var hash = '#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.disableDeepLinking=true&userInfo.displayName=' + encodeURIComponent(displayName);
    var src = 'https://meet.jit.si/' + roomName + hash;

    var frame = document.getElementById('jitsiFrame');
    var title = document.getElementById('jitsiTitle');
    if (title) title.textContent = (channel.name || 'Voice') + ' · ' + g.name;
    if (frame) frame.src = src;
    var modal = document.getElementById('jitsiModal');
    if (modal) {
      modal.hidden = false;
      setTimeout(function () { modal.classList.add('open'); }, 10);
    }
  }
  function closeJitsi() {
    var modal = document.getElementById('jitsiModal');
    var frame = document.getElementById('jitsiFrame');
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(function () {
      modal.hidden = true;
      if (frame) frame.src = 'about:blank';
    }, 180);
  }

  function groupsInit() {
    var all = GROUPS.getAll();
    if (!all.some(function (g) { return g.id === 'general'; })) {
      var list = all.slice();
      list.unshift(GROUPS._defaults[0]);
      GROUPS._save(list);
    }

    var newBtn = document.getElementById('newGroupBtn');
    if (newBtn) {
      newBtn.style.display = '';
      newBtn.addEventListener('click', function () {
        var modal = document.getElementById('groupCreateModal');
        if (modal) modal.style.display = 'flex';
      });
    }
    var cancelBtn = document.getElementById('newGroupCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      document.getElementById('groupCreateModal').style.display = 'none';
    });
    var createBtn = document.getElementById('newGroupCreate');
    if (createBtn) createBtn.addEventListener('click', function () {
      var name = document.getElementById('newGroupName').value;
      var desc = document.getElementById('newGroupDesc').value;
      var emoji = document.getElementById('newGroupEmoji').value;
      var g = GROUPS.create({ name: name, description: desc, icon: emoji });
      if (g) {
        document.getElementById('groupCreateModal').style.display = 'none';
        document.getElementById('newGroupName').value = '';
        document.getElementById('newGroupDesc').value = '';
        document.getElementById('newGroupEmoji').value = '';
        renderGroupsList();
        openGroup(g.id);
      }
    });

    renderGroupsList();
    GROUPS.fetchRemote().then(function () { renderGroupsList(); }).catch(function () {});
    GROUPS.startLiveListener(function () {
      var detailVisible = document.getElementById('groupDetailView');
      if (detailVisible && detailVisible.style.display !== 'none') {
        renderGroupDetail();
      } else {
        renderGroupsList();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', groupsInit);
  } else {
    groupsInit();
  }
})();
