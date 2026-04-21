# Firebase Setup Guide

Complete setup: **Google Auth + Firestore (shared data sync across students)**.

**Total time: ~15 minutes. All free on Firebase Spark plan.**

---

## ✅ What you already have
- Firebase project created: `marketing-intern-54252`
- Web app registered
- `firebase-config.js` populated with your config
- `FIREBASE_ENABLED = true`

## 🎯 What we're adding now
- **Google Sign-In** (OAuth)
- **Firestore Database** (admin content syncs to all students)

---

## Part 1: Enable Google Sign-In (2 min)

**👉 Direct link:**
```
https://console.firebase.google.com/project/marketing-intern-54252/authentication
```

1. Click **"Get started"** (if not already done)
2. Go to the **"Sign-in method"** tab
3. Click **Google** from the list
4. Toggle **Enable**
5. Select a **Project support email** (your email)
6. Click **Save**

✅ Google sign-in is now live.

---

## Part 2: Enable Firestore Database (3 min)

This is what makes admin changes sync to all students.

**👉 Direct link:**
```
https://console.firebase.google.com/project/marketing-intern-54252/firestore
```

1. Click **"Create database"** button
2. **Start in production mode** → click Next
3. **Select location**: choose `asia-southeast1 (Singapore)` (closest to PH)
   - If unavailable, pick `asia-east1 (Taiwan)` or any nearby
4. Click **"Enable"**
5. Wait ~30 seconds for Firestore to provision

---

## Part 3: Configure Firestore Security Rules (2 min)

By default, Firestore blocks ALL reads/writes. We need to allow:
- **Everyone** can read lesson/site data
- **Authenticated users** can write (your admin logins are authenticated via Google)

1. In Firestore, go to the **"Rules"** tab
2. Replace the existing rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow public read of shared content (lessons, settings, card images, emojis)
    // Allow any authenticated user to write (admin will be the one editing)
    match /sphere_lms/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

3. Click **"Publish"**

---

## Part 4: Authorized Domains (1 min)

Make sure your app's domain is authorized for OAuth:

**👉 Direct link:**
```
https://console.firebase.google.com/project/marketing-intern-54252/authentication/settings
```

1. Scroll to **"Authorized domains"**
2. Make sure `localhost` is in the list (for local testing)
3. Add your hosting domain:
   - For GitHub Pages: `stratosadvertiser-coder.github.io`
   - For custom domain: your domain

---

## ✅ Test It

1. Serve your site via `http://localhost:8080/` (not `file://`):
   ```bash
   cd "C:/Users/ADMIN/Documents/marketing intern new"
   python -m http.server 8080
   ```
2. Open `http://localhost:8080/login.html`
3. Log in as admin (`admin / admin123`)
4. Go to **Admin Panel** → make some changes (rename months, upload images, etc.)
5. Log out → log in with your Google account (as a student)
6. **You should see all the admin's customizations!** 🎉

---

## 🔒 How it works

- **Shared data** (lessons, month names, tags, card images, emojis) → stored in Firestore → same for everyone
- **Personal data** (progress, assignments, quiz results, bookmarks, streak, Q&A) → stored in localStorage per user
- On page load, the site fetches latest from Firestore and caches in localStorage
- Admin saves write to both Firestore AND localStorage
- Students see admin's changes on next page load

---

## 🐛 Troubleshooting

**Content not syncing?**
- Open browser DevTools → Console → look for Firestore errors
- Check that `FIREBASE_ENABLED = true` in `firebase-config.js`
- Check that Firestore rules allow read/write

**"Missing or insufficient permissions"?**
- Firestore rules aren't set up. Go back to Part 3.

**Students still see old data after admin change?**
- Data syncs on page load. Ask them to refresh (Ctrl+F5)

**Card images not syncing?**
- Images are compressed to under 1MB base64. Very large original images may fail.
- Check Firestore console → `sphere_lms/card_images` doc to see if data arrived

---

## 📊 Viewing data in Firestore Console

You can see all admin-synced data here:
```
https://console.firebase.google.com/project/marketing-intern-54252/firestore/data
```

Collection: `sphere_lms`
- `lessons` → all 16 lessons
- `settings` → month_names, month_prefixes, skill_tags, section_title
- `card_images` → month_1 to month_4 (base64 images + positions)
- `card_emojis` → month_1 to month_4 emoji chars

---

Done! Your LMS now syncs admin changes across all students in real-time. 🎉
