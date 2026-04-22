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
    return this.isCompleted(weekId);
  },

  getCompletedCount() {
    return Object.values(this.getAll()).filter(Boolean).length;
  },

  getPercentage() {
    return Math.round((this.getCompletedCount() / 16) * 100);
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

// Snapshot of localStorage BEFORE Firestore load — used to detect if data changed
function _snapshotSyncedKeys() {
  const keys = ['lessons_data', 'site_month_names', 'site_month_prefixes', 'site_month_descriptions',
                'site_skill_tags', 'site_section_title', 'site_card_emojis',
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
    // Auto-complete lesson
    if (!PROGRESS.isCompleted(weekId)) {
      PROGRESS.toggle(weekId);
    }
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
    all[weekId] = { score, total, passed, percentage: Math.round((score/total)*100), date: new Date().toISOString() };
    safeSetItem(this.STORAGE_KEY, JSON.stringify(all));
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
        const loginBtn = navCta.querySelector('a[href="login.html"]');
        if (loginBtn) {
          loginBtn.href = 'course.html';
          loginBtn.textContent = 'Go to Course \u2192';
          loginBtn.classList.remove('btn-outline');
          loginBtn.classList.add('btn-primary');
        }
        // Also update mobile CTA
        const mobileLoginLinks = document.querySelectorAll('.nav-mobile-cta a[href="login.html"]');
        mobileLoginLinks.forEach(a => {
          a.href = 'course.html';
          a.textContent = 'Go to Course';
          a.classList.remove('btn-outline');
          a.classList.add('btn-primary');
        });
      }
      return;
    }

    if (this.isLoggedIn()) {
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

// Protect pages
const protectedPages = ['course.html', 'lesson.html', 'profile.html', 'admin.html'];
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
    { id:'w1', month:1, week:1, title:'Intro to Marketing & Image Creatives', category:'Creatives', difficulty:'Beginner', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false, assignment:{ enabled:false, title:'', description:'', fileTypes:{ image:true, video:false, pdf:false } } },
    { id:'w2', month:1, week:2, title:'How to Create Video Creatives', category:'Creatives', difficulty:'Beginner', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w3', month:1, week:3, title:'Customer Angle Frameworks', category:'Creatives', difficulty:'Beginner', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
    { id:'w4', month:1, week:4, title:'Image & Video Combined Project', category:'Creatives', difficulty:'Intermediate', videoUrl:'', videoType:'youtube', duration:'45:00', sections:[], keyTakeaways:[], proTip:'', published:false },
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

  extractYouTubeId(url) {
    if (!url) return '';
    if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].split(/[?&#]/)[0];
    if (url.includes('v=')) return url.split('v=')[1].split(/[?&#]/)[0];
    if (url.includes('/embed/')) return url.split('/embed/')[1].split(/[?&#]/)[0];
    return url;
  },

  getVideoEmbed(lesson, autoplay) {
    if (!lesson.videoUrl) return '';
    const url = lesson.videoUrl.trim();
    const ap = autoplay ? 1 : 0;

    if (lesson.videoType === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
      const vid = this.extractYouTubeId(url);
      if (!vid) return '';
      // Use click-to-play thumbnail to avoid file:// embed errors
      if (!autoplay) {
        return '<div class="yt-thumb-player" data-vid="' + vid + '" style="width:100%;height:100%;position:relative;cursor:pointer;border-radius:12px;overflow:hidden;">'
          + '<img src="https://img.youtube.com/vi/' + vid + '/hqdefault.jpg" alt="Video thumbnail" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\'">'
          + '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);">'
          + '<div style="width:68px;height:48px;background:rgba(255,0,0,0.9);border-radius:12px;display:flex;align-items:center;justify-content:center;">'
          + '<div style="width:0;height:0;border-left:18px solid #fff;border-top:10px solid transparent;border-bottom:10px solid transparent;margin-left:4px;"></div>'
          + '</div></div></div>';
      }
      return '<iframe src="https://www.youtube.com/embed/' + vid + '?autoplay=' + ap + '&rel=0&modestbranding=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;height:100%;border-radius:12px;"></iframe>';
    }
    if (lesson.videoType === 'vimeo' || url.includes('vimeo.com')) {
      const vid = url.split('vimeo.com/')[1]?.split(/[?&/]/)[0] || url;
      return '<iframe src="https://player.vimeo.com/video/' + vid + '?autoplay=' + ap + '" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="width:100%;height:100%;border-radius:12px;"></iframe>';
    }
    return '<video src="' + url + '" controls' + (autoplay ? ' autoplay' : '') + ' style="width:100%;height:100%;border-radius:12px;"></video>';
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
      window.location.href = 'course.html';
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
    themeToggle.innerHTML = isDark ? '&#9728;' : '&#9790;';
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
        + '<div style="font-size:4rem;margin-bottom:16px;">&#128274;</div>'
        + '<h2 style="margin-bottom:8px;">Coming Soon</h2>'
        + '<p style="color:var(--text-light);">This lesson hasn\'t been published yet. Check back later!</p>'
        + '<a href="course.html" class="btn btn-primary" style="margin-top:24px;">Back to Course</a></div>';
    }
  }

  // Render content only if published OR admin
  if (lesson && (isPublished || isAdmin)) {
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

        // Click-to-play: open YouTube video
        const thumbPlayer = videoPlayer.querySelector('.yt-thumb-player');
        if (thumbPlayer) {
          thumbPlayer.addEventListener('click', () => {
            const vid = thumbPlayer.dataset.vid;
            window.open('https://www.youtube.com/watch?v=' + vid, '_blank');
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
            // Auto-complete lesson if passed
            if (!PROGRESS.isCompleted(weekId)) {
              PROGRESS.toggle(weekId);
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
        const nowComplete = PROGRESS.toggle(weekId);
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

    // Click thumbnail to play in admin preview
    const thumbPlayer = preview.querySelector('.yt-thumb-player');
    if (thumbPlayer) {
      thumbPlayer.addEventListener('click', () => {
        const vid = thumbPlayer.dataset.vid;
        window.open('https://www.youtube.com/watch?v=' + vid, '_blank');
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
        const icon = l.published ? '&#9654;' : '&#128274;';
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

    window.location.href = 'course.html';
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
const SITE_SETTINGS = {
  TAGS_KEY: 'site_skill_tags',
  TITLE_KEY: 'site_section_title',
  defaultTags: ['Digital Marketing', 'Leadership', 'Run Meta Ads', 'Creatives', 'Digital Tools & AI'],
  defaultTitle: "Skills You'll Build in This Course",

  getTags() { return safeGetJSON(this.TAGS_KEY, this.defaultTags); },
  saveTags(tags) {
    safeSetItem(this.TAGS_KEY, JSON.stringify(tags));
    if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ skill_tags: tags });
  },
  getTitle() { return safeGetItem(this.TITLE_KEY) || this.defaultTitle; },
  saveTitle(title) {
    safeSetItem(this.TITLE_KEY, title);
    if (typeof DATA_SYNC !== 'undefined') DATA_SYNC.saveSettings({ section_title: title });
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

  // Update hero card month names
  const heroModules = document.querySelectorAll('.hero-module-text h4');
  const homepageMonthNames = LESSONS.getMonthNames();
  heroModules.forEach((h4, i) => {
    const monthNum = i + 1;
    const name = homepageMonthNames[monthNum] || homepageMonthNames[String(monthNum)];
    if (name) h4.textContent = LESSONS.getMonthPrefix(monthNum) + ': ' + name;
  });

  // Update curriculum module headers
  document.querySelectorAll('.curriculum .module-info h3').forEach((h3, i) => {
    const monthNum = i + 1;
    const name = homepageMonthNames[monthNum] || homepageMonthNames[String(monthNum)];
    if (name) h3.textContent = LESSONS.getMonthPrefix(monthNum) + ': ' + name;
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
}
