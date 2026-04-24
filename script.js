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

      // Sign in anonymously so Firestore writes work (required for rule "request.auth != null")
      // Only if no user is already signed in (e.g. via Google OAuth)
      if (firebase.auth) {
        firebase.auth().onAuthStateChanged(user => {
          if (!user) {
            firebase.auth().signInAnonymously()
              .then(() => console.log('[SYNC] Firebase anonymous auth ready'))
              .catch(e => console.warn('[SYNC] Anonymous auth failed (writes may fail):', e.message));
          }
        });
      }
    } catch (e) {
      console.error('Firestore init failed:', e);
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
      // Assignments: { w1: true, ... } — just whether submitted (strip file data)
      const asgnRaw = (typeof ASSIGNMENTS !== 'undefined') ? ASSIGNMENTS.getAll() : {};
      const assignments = {};
      Object.keys(asgnRaw).forEach(k => {
        if (asgnRaw[k] && asgnRaw[k].submitted) assignments[k] = true;
      });
      // Activity-by-day rollup (last 30 days) for engagement chart
      const activity = (typeof ACTIVITY !== 'undefined') ? ACTIVITY.getAll() : [];
      const activityByDay = {};
      activity.forEach(e => {
        if (!e.date) return;
        const day = e.date.slice(0, 10); // YYYY-MM-DD
        activityByDay[day] = (activityByDay[day] || 0) + 1;
      });
      return {
        username,
        displayName: (AUTH.getDisplayName && AUTH.getDisplayName()) || username,
        role: (AUTH.isAdmin && AUTH.isAdmin()) ? 'admin' : 'student',
        progress,
        quizScores,
        quizAttempts,
        assignments,
        activityByDay,
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
    // If localStorage changed and we haven't already refreshed this session, reload
    const alreadyRefreshed = sessionStorage.getItem('sync_refreshed_' + window.location.pathname);
    if (_hasDataChanged(before) && !alreadyRefreshed) {
      sessionStorage.setItem('sync_refreshed_' + window.location.pathname, '1');
      window.location.reload();
    }
  } catch (e) {
    console.warn('Firestore sync failed, using local cache:', e);
  }
})();

// ===== ASSIGNMENTS STORAGE =====
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

  submit(weekId, files) {
    const all = this.getAll();
    all[weekId] = {
      files: files,
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

// ===== ADMIN AUTH SYSTEM =====
const AUTH = {
  USERS_KEY: 'auth_users',

  // Initialize with default admin account
  initUsers() {
    if (!safeGetItem(this.USERS_KEY)) {
      const defaultUsers = [
        { username: 'admin', password: 'admin123', role: 'admin', fullName: 'Admin', email: 'admin@sphereacademy.com' }
      ];
      safeSetItem(this.USERS_KEY, JSON.stringify(defaultUsers));
    }
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

  login(username, password) {
    this.initUsers();
    const users = this.getAllUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      safeSetItem('auth_logged_in', 'true');
      safeSetItem('auth_user', user.username);
      safeSetItem('auth_role', user.role);
      // Set profile if first time
      if (!safeGetItem('auth_profile')) {
        safeSetItem('auth_profile', JSON.stringify({
          firstName: user.fullName.split(' ')[0] || '',
          lastName: user.fullName.split(' ').slice(1).join(' ') || '',
          email: user.email || ''
        }));
      }
      return true;
    }
    return false;
  },

  register(fullName, email, username, password) {
    this.initUsers();
    const users = this.getAllUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return { success: false, error: 'Username already taken.' };
    }
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
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
        const label = this.isAdmin() ? 'Admin Panel' : 'Dashboard';
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
      // ===== Inject persistent tabs: Dashboard / Course / Profile =====
      // Skip on login/signup (public pages) and admin.html (admin has its own nav).
      const navLinksEl = document.querySelector('.nav-links');
      const tabPages = ['dashboard.html', 'course.html', 'lesson.html', 'profile.html'];
      if (navLinksEl && tabPages.indexOf(pathname) !== -1 && !navLinksEl.querySelector('.nav-tab-link')) {
        const tabs = [
          { href: 'dashboard.html', label: 'Dashboard', pages: ['dashboard.html'] },
          { href: 'course.html',    label: 'Course',    pages: ['course.html', 'lesson.html'] },
          { href: 'profile.html',   label: 'Profile',   pages: ['profile.html'] }
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
  // Week N is unlocked iff Week (N-1) was completed AND its quiz passed
  // (if the quiz is enabled) AND its assignment submitted (if enabled).
  // Week 1 is always unlocked. Admin bypass: admin always sees everything.
  isUnlocked(weekId) {
    try {
      if (typeof AUTH !== 'undefined' && AUTH.isAdmin && AUTH.isAdmin()) return true;
      const lesson = this.get(weekId);
      if (!lesson) return false;
      if ((lesson.week || 1) <= 1) return true;
      const prevWeekId = 'w' + (lesson.week - 1);
      const prev = this.get(prevWeekId);
      if (!prev) return true; // no previous lesson defined — unlock
      // Lesson must be marked complete
      if (typeof PROGRESS !== 'undefined' && !PROGRESS.isCompleted(prevWeekId)) return false;
      // If prev has a quiz enabled, must be passed
      if (prev.quiz && prev.quiz.enabled && prev.quiz.questions && prev.quiz.questions.length > 0) {
        if (typeof QUIZ_RESULTS !== 'undefined' && !QUIZ_RESULTS.isPassed(prevWeekId)) return false;
      }
      // If prev has assignment enabled, must be submitted
      if (prev.assignment && prev.assignment.enabled) {
        if (typeof ASSIGNMENTS !== 'undefined' && !ASSIGNMENTS.isSubmitted(prevWeekId)) return false;
      }
      return true;
    } catch (e) { return true; /* on any error, fail open */ }
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
      const prevLabel = 'Week ' + prev.week + ' \u2014 ' + prev.title;
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
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = (document.getElementById('username') || document.getElementById('email')).value.trim();
    const password = document.getElementById('password').value;

    if (AUTH.login(username, password)) {
      window.location.href = AUTH.isAdmin() ? 'admin.html' : 'dashboard.html';
    } else {
      if (loginError) {
        loginError.textContent = 'Invalid username or password.';
        loginError.style.display = 'block';
      }
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
  const cardMonths = [
    { month: 1, selector: '.course-card-link[href*="week=w1"] .course-card-img, .course-card-link:nth-child(1) .course-card-img' },
    { month: 2, selector: '.course-card-link[href*="week=w5"] .course-card-img, .course-card-link:nth-child(2) .course-card-img' },
    { month: 3, selector: '.course-card-link[href*="week=w9"] .course-card-img, .course-card-link:nth-child(3) .course-card-img' },
    { month: 4, selector: '.course-card-link[href*="week=w13"] .course-card-img, .course-card-link:nth-child(4) .course-card-img' }
  ];
  cardMonths.forEach(({ month, selector }) => {
    const imgData = safeGetItem('card_image_' + month);
    if (imgData) {
      const cardImgs = document.querySelectorAll(selector);
      cardImgs.forEach(cardImg => {
        if (cardImg) {
          const img = document.createElement('img');
          img.src = imgData;
          img.alt = 'Month ' + month;
          const savedPos = safeGetItem('card_image_pos_' + month);
          const topVal = savedPos ? savedPos + 'px' : '0px';
          img.style.cssText = 'width:100%;height:auto;min-height:100%;object-fit:cover;position:absolute;left:0;top:' + topVal + ';z-index:0;';
          cardImg.appendChild(img);
        }
      });
    }
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
  const isLocked = lesson && isPublished && !isAdmin && !LESSONS.isUnlocked(weekId);
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

    // Update video player
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
      const durEl = videoPlayer.querySelector('.video-duration');
      if (durEl) durEl.textContent = lesson.duration || '45:00';
    }

    // Update body
    const body = document.querySelector('.lesson-body');
    if (body && lesson.sections && lesson.sections.length > 0) {
      let html = '';
      lesson.sections.forEach((sec, i) => {
        if (sec.heading) {
          html += '<h2>' + (i < 9 ? '0' : '') + (i + 1) + ' &mdash; ' + sec.heading + '</h2>';
        }
        if (sec.content) {
          html += '<p style="white-space:pre-line;">' + sec.content.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
        }
      });
      if (lesson.proTip) {
        html += '<div class="key-takeaways"><h3>Pro Tip</h3><p>' + lesson.proTip + '</p></div>';
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
            NOTIFS.add('You passed the Week ' + lesson.week + ' assessment with ' + percentage + '%!', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>');
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
        asgnHtml += '<div class="assignment-submitted">';
        asgnHtml += '<div class="assignment-submitted-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><polyline points="20 6 9 17 4 12"/></svg></div>';
        asgnHtml += '<div class="assignment-submitted-text">';
        asgnHtml += '<strong>Assignment Submitted</strong>';
        asgnHtml += '<span>Submitted on ' + dateStr + ' &bull; ' + submission.files.length + ' file(s)</span>';
        asgnHtml += '</div>';
        asgnHtml += '<button class="assignment-resubmit" id="asgnResubmit">Re-upload</button>';
        asgnHtml += '</div>';

        // Show submitted files
        asgnHtml += '<div class="assignment-files" id="asgnFileList">';
        submission.files.forEach(f => {
          const icon = f.type.startsWith('image') ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M12 2l2 4 4 .5-3 3 .7 4.2L12 12l-3.7 1.7.7-4.2-3-3L10 6z"/></svg>' : f.type.startsWith('video') ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><rect x="2" y="7" width="15" height="10" rx="2"/><path d="m17 10 5-3v10l-5-3z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
          const cls = f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : 'pdf';
          asgnHtml += '<div class="assignment-file">';
          asgnHtml += '<div class="assignment-file-icon ' + cls + '">' + icon + '</div>';
          asgnHtml += '<div class="assignment-file-info">';
          asgnHtml += '<div class="assignment-file-name">' + f.name + '</div>';
          asgnHtml += '<div class="assignment-file-size">' + f.size + '</div>';
          asgnHtml += '</div></div>';
        });
        asgnHtml += '</div>';
      } else {
        // Show upload form
        asgnHtml += '<div class="assignment-dropzone" id="asgnDropzone">';
        asgnHtml += '<input type="file" id="asgnFileInput" accept="' + acceptStr + '" multiple>';
        asgnHtml += '<span class="assignment-dropzone-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span>';
        asgnHtml += '<div class="assignment-dropzone-text">Drag & drop files or <strong>browse</strong></div>';
        asgnHtml += '<div class="assignment-dropzone-hint">Accepted: ' + typeLabels.join(', ') + ' &bull; Max 10MB per file &bull; Up to 5 files</div>';
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
        let pendingFiles = [];

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
              + '<button class="assignment-file-remove" data-idx="' + i + '" title="Remove">&#10005;</button>';
            fileList.appendChild(div);
          });
          submitArea.style.display = pendingFiles.length > 0 ? 'flex' : 'none';

          // Remove handlers
          fileList.querySelectorAll('.assignment-file-remove').forEach(btn => {
            btn.addEventListener('click', () => {
              pendingFiles.splice(parseInt(btn.dataset.idx), 1);
              renderPendingFiles();
            });
          });
        }

        function addFiles(files) {
          for (const file of files) {
            if (pendingFiles.length >= 5) break;
            if (file.size > 10 * 1024 * 1024) {
              alert(file.name + ' is too large. Max 10MB per file.');
              continue;
            }
            pendingFiles.push(file);
          }
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

        if (submitBtn) {
          submitBtn.addEventListener('click', () => {
            if (pendingFiles.length === 0) return;
            submitBtn.textContent = 'Submitting...';
            submitBtn.disabled = true;

            // Convert files to storable format
            let processed = 0;
            const fileData = [];
            pendingFiles.forEach(file => {
              const sizeStr = file.size < 1024 * 1024
                ? (file.size / 1024).toFixed(1) + ' KB'
                : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
              // Store metadata only (not base64 of large files)
              fileData.push({
                name: file.name,
                size: sizeStr,
                type: file.type,
                date: new Date().toISOString()
              });
              processed++;
              if (processed === pendingFiles.length) {
                ASSIGNMENTS.submit(weekId, fileData);
                // Reload to show submitted state
                window.location.reload();
              }
            });
          });
        }
      } else {
        // Re-upload handler
        const resubmitBtn = document.getElementById('asgnResubmit');
        if (resubmitBtn) {
          resubmitBtn.addEventListener('click', () => {
            ASSIGNMENTS.clearSubmission(weekId);
            window.location.reload();
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
        : '&#9744; Mark Week ' + lesson.week + ' as Complete';

      completeBtn.addEventListener('click', function() {
        const wasComplete = PROGRESS.isCompleted(weekId);
        const nowComplete = PROGRESS.toggle(weekId);
        if (!wasComplete && nowComplete) {
          try { if (typeof ACTIVITY !== 'undefined') ACTIVITY.log('lesson_completed', weekId, 'W' + lesson.week + ': ' + lesson.title); } catch (e) {}
        }
        this.classList.toggle('completed', nowComplete);
        this.innerHTML = nowComplete
          ? '&#10003; Week ' + lesson.week + ' Completed'
          : '&#9744; Mark Week ' + lesson.week + ' as Complete';

        // Update sidebar progress bar
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        if (progressFill) progressFill.style.width = PROGRESS.getPercentage() + '%';
        if (progressText) progressText.textContent = PROGRESS.getCompletedCount() + ' of 16 weeks completed (' + PROGRESS.getPercentage() + '%)';

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
  if (progressText) progressText.textContent = PROGRESS.getCompletedCount() + ' of 16 weeks completed (' + PROGRESS.getPercentage() + '%)';

  // Show certificate banner when all 16 lessons are completed
  function checkAndShowCertBanner() {
    const certSection = document.getElementById('lessonCertSection');
    if (!certSection) return;
    if (PROGRESS.getCompletedCount() >= 16) {
      certSection.style.display = 'block';
      certSection.innerHTML = '<div class="lesson-cert-banner">'
        + '<span class="cert-emoji"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg></span>'
        + '<h2>Congratulations! You Completed the Program!</h2>'
        + '<p>You\'ve finished all 16 weeks of the Marketing Intern Training Program. Your certificate is ready to download.</p>'
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

    document.getElementById('editorWeekLabel').textContent = 'Week ' + lesson.week + ' — ' + LESSONS.getMonthPrefix(lesson.month);
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
  function initImageDrag(month) {
    const imgEl = document.getElementById('cardImg' + month);
    if (!imgEl) return;

    const posKey = 'card_image_pos_' + month;
    let isDragging = false;
    let startY = 0;
    let startTop = 0;

    // Load saved position
    function loadPos() {
      const saved = safeGetItem(posKey);
      if (saved && imgEl.style.display !== 'none') {
        imgEl.style.top = saved + 'px';
      }
    }

    // Wait for image to load to set bounds
    imgEl.addEventListener('load', () => {
      loadPos();
    });
    loadPos();

    imgEl.addEventListener('mousedown', (e) => {
      if (imgEl.style.display === 'none') return;
      e.preventDefault();
      isDragging = true;
      startY = e.clientY;
      startTop = parseInt(imgEl.style.top || '0');
      imgEl.classList.add('dragging');
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const container = imgEl.parentElement;
      const containerH = container.offsetHeight;
      const imgH = imgEl.offsetHeight;
      const maxDrag = Math.max(0, imgH - containerH);

      let newTop = startTop + (e.clientY - startY);
      newTop = Math.min(0, Math.max(-maxDrag, newTop));
      imgEl.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      imgEl.classList.remove('dragging');
      const pos = parseInt(imgEl.style.top || '0');
      safeSetItem(posKey, pos);
      // Sync position to Firestore
      if (typeof DATA_SYNC !== 'undefined' && DATA_SYNC.db) {
        DATA_SYNC.db.collection(DATA_SYNC.COLLECTION).doc('card_images').set({
          ['month_' + month + '_pos']: pos
        }, { merge: true }).catch(e => console.error('Pos sync failed:', e));
      }
    });

    // Touch support for mobile
    imgEl.addEventListener('touchstart', (e) => {
      if (imgEl.style.display === 'none') return;
      isDragging = true;
      startY = e.touches[0].clientY;
      startTop = parseInt(imgEl.style.top || '0');
      imgEl.classList.add('dragging');
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const container = imgEl.parentElement;
      const containerH = container.offsetHeight;
      const imgH = imgEl.offsetHeight;
      const maxDrag = Math.max(0, imgH - containerH);

      let newTop = startTop + (e.touches[0].clientY - startY);
      newTop = Math.min(0, Math.max(-maxDrag, newTop));
      imgEl.style.top = newTop + 'px';
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;
      imgEl.classList.remove('dragging');
      safeSetItem(posKey, parseInt(imgEl.style.top || '0'));
    });
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
        safeSetItem('auth_avatar', dataUrl);

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

// ===== SEARCH FUNCTIONALITY =====
const searchBtn = document.getElementById('searchBtn');
const searchOverlay = document.getElementById('searchOverlay');
const searchInput = document.getElementById('searchInput');
const searchClose = document.getElementById('searchClose');
const searchResults = document.getElementById('searchResults');

if (searchBtn && searchOverlay) {
  searchBtn.addEventListener('click', () => {
    searchOverlay.classList.add('active');
    if (searchInput) setTimeout(() => searchInput.focus(), 100);
  });

  if (searchClose) searchClose.addEventListener('click', () => searchOverlay.classList.remove('active'));
  searchOverlay.addEventListener('click', (e) => { if (e.target === searchOverlay) searchOverlay.classList.remove('active'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') searchOverlay.classList.remove('active'); });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        searchResults.innerHTML = '<div class="search-empty">Type to search across all 16 lessons</div>';
        return;
      }
      const lessons = LESSONS.getAll();
      const matches = lessons.filter(l =>
        l.title.toLowerCase().includes(query) ||
        l.category.toLowerCase().includes(query) ||
        (l.assignment && l.assignment.title && l.assignment.title.toLowerCase().includes(query))
      );
      if (matches.length === 0) {
        searchResults.innerHTML = '<div class="search-empty">No lessons found for "' + query + '"</div>';
        return;
      }
      searchResults.innerHTML = matches.map(l => {
        const icon = l.published ? '&#9654;' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
        return '<a class="search-result-item" href="lesson.html?week=' + l.id + '">'
          + '<div class="search-result-icon">' + icon + '</div>'
          + '<div class="search-result-info"><h4>W' + l.week + ': ' + l.title + '</h4>'
          + '<span>Month ' + l.month + ' &bull; ' + l.category + ' &bull; ' + l.difficulty + '</span></div></a>';
      }).join('');
    });
  }
}

// ===== NOTIFICATIONS =====
const NOTIFS = {
  STORAGE_KEY: 'notifications',
  getAll() { return safeGetJSON(this.STORAGE_KEY, []); },
  add(text, icon) {
    const all = this.getAll();
    all.unshift({ text, icon: icon || '&#128276;', time: new Date().toISOString(), read: false });
    if (all.length > 20) all.pop();
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
  },
  markAllRead() {
    const all = this.getAll();
    all.forEach(n => n.read = true);
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
  },
  getUnreadCount() { return this.getAll().filter(n => !n.read).length; }
};

// Seed default notifications if empty
if (NOTIFS.getAll().length === 0) {
  NOTIFS.add('Welcome to Sphere Academy! Start with Week 1.', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>');
  NOTIFS.add('Complete lessons weekly to build your streak!', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>');
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
      notifList.innerHTML = all.slice(0, 10).map(n => {
        const date = new Date(n.time);
        const ago = Math.floor((Date.now() - date.getTime()) / 60000);
        const timeStr = ago < 60 ? ago + 'm ago' : ago < 1440 ? Math.floor(ago/60) + 'h ago' : Math.floor(ago/1440) + 'd ago';
        return '<div class="notif-item' + (n.read ? '' : ' unread') + '">'
          + '<span class="notif-item-icon">' + n.icon + '</span>'
          + '<div class="notif-item-text"><strong>' + n.text + '</strong><span>' + timeStr + '</span></div></div>';
      }).join('');
    }
  }
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
    if (certTitle) certTitle.textContent = 'Certificate Earned!';
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
  function loginFirebaseUser(user) {
    const email = user.email || '';
    const displayName = user.displayName || email.split('@')[0] || 'User';
    const username = (email.split('@')[0] || displayName).toLowerCase().replace(/[^a-z0-9]/g, '');

    // Create user in AUTH if doesn't exist
    const users = AUTH.getAllUsers();
    if (!users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
      users.push({
        username: username,
        password: '__firebase__' + user.uid,
        role: 'student',
        fullName: displayName,
        email: email,
        provider: user.providerData && user.providerData[0] ? user.providerData[0].providerId : 'oauth'
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
    // Use photoURL if available
    if (user.photoURL) {
      safeSetItem('auth_avatar', user.photoURL);
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
        loginFirebaseUser(result.user);
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
      NOTIFS.add('All 16 lessons have been published!', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>');
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
  const courseCardLinks = document.querySelectorAll('.course-card-link');
  const months = [
    { start: 1, end: 4, label: 'Month 1' },
    { start: 5, end: 8, label: 'Month 2' },
    { start: 9, end: 12, label: 'Month 3' },
    { start: 13, end: 16, label: 'Month 4' }
  ];

  courseCardLinks.forEach((card, i) => {
    if (i < months.length) {
      const m = months[i];
      let done = 0;
      for (let w = m.start; w <= m.end; w++) {
        if (PROGRESS.isCompleted('w' + w)) done++;
      }
      const pct = Math.round((done / 4) * 100);
      // Add progress bar
      const existing = card.querySelector('.course-card-progress');
      if (!existing) {
        const div = document.createElement('div');
        div.className = 'course-card-progress';
        div.innerHTML = '<div class="course-card-progress-bar"><div class="course-card-progress-fill" style="width:' + pct + '%"></div></div>'
          + '<span>' + done + '/4 complete</span>';
        const meta = card.querySelector('.course-card-meta') || card.querySelector('p:last-child');
        if (meta) meta.after(div);
        else card.appendChild(div);
      }
    }
  });

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
    desc: 'Stratos Sphere Academy is a 4-month hands-on marketing training program built to transform beginners into confident, job-ready digital marketers. Through structured weekly modules covering creatives, tools, AI-powered workflows, and Meta Ads, we equip interns with the real-world skills that matter — from designing high-converting content to launching and optimizing paid campaigns.'
  },
  defaultPillars: [
    { icon: 'graduation', color: 'blue',   title: 'Structured Learning', desc: '16 weekly modules with quizzes, assignments, and clear milestones.' },
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
    desc: 'Complete this 4-month program and you will be equipped to create high-converting image & video creatives, manage bots, CRM, and order tools confidently, and run, optimize, and report on paid ad campaigns.'
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

  // 3D tilt on the Training Program hero card (mouse-move parallax)
  (function initHeroCardTilt() {
    const wrap = document.getElementById('heroCardWrap');
    if (!wrap) return;
    // Skip on touch/small devices where hover+tilt feels odd
    if (!window.matchMedia('(hover: hover) and (min-width: 900px)').matches) return;

    const MAX_ROT = 7;      // max degrees of rotation
    const DAMP = 0.12;      // smoothing factor
    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;
    let raf = null;
    let hovering = false;

    function tick() {
      currentX += (targetX - currentX) * DAMP;
      currentY += (targetY - currentY) * DAMP;
      wrap.style.transform = 'perspective(1200px) rotateX(' + currentX.toFixed(2) + 'deg) rotateY(' + currentY.toFixed(2) + 'deg)';
      // Keep animating while hovering or until we're close enough to rest
      if (hovering || Math.abs(currentX) > 0.05 || Math.abs(currentY) > 0.05) {
        raf = requestAnimationFrame(tick);
      } else {
        wrap.style.transform = '';
        raf = null;
      }
    }

    wrap.addEventListener('mouseenter', () => {
      hovering = true;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    wrap.addEventListener('mousemove', (e) => {
      const rect = wrap.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;   // 0..1
      const py = (e.clientY - rect.top)  / rect.height;  // 0..1
      targetY =  (px - 0.5) * 2 * MAX_ROT;  // left/right => rotateY
      targetX = -(py - 0.5) * 2 * MAX_ROT;  // up/down   => rotateX (inverted)
    });
    wrap.addEventListener('mouseleave', () => {
      hovering = false;
      targetX = 0;
      targetY = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    });
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

    function render() {
      if (images.length === 0) {
        // Keep the placeholder SVG (already in HTML)
        if (dotsEl) dotsEl.innerHTML = '';
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        return;
      }
      slidesEl.innerHTML = images.map((img, i) =>
        '<div class="outcome-slide ' + (i === currentIdx ? 'active' : '') + '" data-idx="' + i + '">'
        + '<img src="' + img.src + '" alt="Program outcome ' + (i + 1) + '">'
        + '</div>'
      ).join('');
      if (dotsEl) {
        dotsEl.innerHTML = images.map((_, i) =>
          '<button class="outcome-dot ' + (i === currentIdx ? 'active' : '') + '" data-idx="' + i + '" aria-label="Go to image ' + (i + 1) + '"></button>'
        ).join('');
        dotsEl.querySelectorAll('.outcome-dot').forEach(dot => {
          dot.addEventListener('click', () => {
            currentIdx = parseInt(dot.dataset.idx);
            render();
            restartAutoplay();
          });
        });
      }
      if (prevBtn) prevBtn.style.display = images.length > 1 ? 'flex' : 'none';
      if (nextBtn) nextBtn.style.display = images.length > 1 ? 'flex' : 'none';
    }

    function goNext() {
      if (images.length < 2) return;
      currentIdx = (currentIdx + 1) % images.length;
      render();
    }
    function goPrev() {
      if (images.length < 2) return;
      currentIdx = (currentIdx - 1 + images.length) % images.length;
      render();
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

    render();
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
      duration.textContent = 'Week ' + (lesson.week || globalWeek);
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
    if (fracEl) fracEl.textContent = completed + ' / 16 weeks';
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
      if (weekNumEl) weekNumEl.textContent = 'Week ' + currentLesson.week;
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
      if (weekTitleEl) weekTitleEl.textContent = 'You finished all 16 weeks.';
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
        if (reminderTitle) reminderTitle.textContent = 'Week ' + currentLesson.week + ' Assessment';
        if (reminderDesc) reminderDesc.textContent = 'Complete the quiz for ' + currentLesson.title + '.';
        if (reminderStatus) {
          const passed = (typeof QUIZ_RESULTS !== 'undefined') && QUIZ_RESULTS.isPassed(currentLesson.id);
          reminderStatus.textContent = passed ? 'Passed' : 'Pending';
          reminderStatus.className = 'reminder-status ' + (passed ? 'submitted' : 'pending');
        }
      } else {
        if (reminderTitle) reminderTitle.textContent = 'Week ' + currentLesson.week + ': ' + currentLesson.title;
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
  } catch (e) {
    console.error('Dashboard render error:', e);
  }
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

