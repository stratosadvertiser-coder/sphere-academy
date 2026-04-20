# Firebase Setup Guide — Google & Facebook Login

Follow these steps to enable real Google and Facebook login on your Sphere Academy site.

**Total time: ~10–15 minutes. Free tier is more than enough.**

---

## Part 1: Create Firebase Project (3 minutes)

1. Go to **https://console.firebase.google.com/**
2. Click **"Add project"** (or "Create a project")
3. Enter project name: `sphere-academy` (or whatever you want)
4. Skip Google Analytics (not needed) → click **Continue** → **Create project**
5. Once created, click **Continue**

---

## Part 2: Register Your Web App (2 minutes)

1. On the Firebase project dashboard, click the **web icon `</>`** (next to iOS/Android)
2. App nickname: `Sphere Academy Web`
3. **Skip** "Also set up Firebase Hosting"
4. Click **Register app**
5. You'll see a code snippet with `firebaseConfig = { apiKey: "...", authDomain: "...", ... }`
6. **COPY THIS OBJECT** — you'll paste it in Step 5 below
7. Click **Continue to console**

---

## Part 3: Enable Google Sign-In (2 minutes)

1. In Firebase Console, go to **Authentication** (left sidebar) → **Get started**
2. Go to the **Sign-in method** tab
3. Click **Google** from the list
4. Toggle **Enable**
5. Select a **Project support email** (use your own email)
6. Click **Save**

✅ Google sign-in is now live.

---

## Part 4: Enable Facebook Sign-In (5 minutes, optional)

Facebook requires you to create a Facebook App first:

1. Go to **https://developers.facebook.com/apps/**
2. Click **Create App** → choose **"Consumer"** → Next
3. App name: `Sphere Academy` → fill in email → **Create app**
4. On the app dashboard, find **Facebook Login** → click **Set up**
5. Go to **Facebook Login → Settings** (left sidebar)
6. Under **Valid OAuth Redirect URIs**, paste:
   ```
   https://YOUR_PROJECT.firebaseapp.com/__/auth/handler
   ```
   (Replace `YOUR_PROJECT` with your actual Firebase project ID)
7. Go to **Settings → Basic** (left sidebar)
8. Copy the **App ID** and click **Show** next to **App Secret** to get the secret
9. **Back in Firebase Console** → Authentication → Sign-in method → click **Facebook**
10. Toggle **Enable**, paste the **App ID** and **App Secret**
11. Copy the **OAuth redirect URI** Firebase shows and make sure it matches what you put in Facebook
12. Click **Save**
13. Back in Facebook Developer Console → toggle your app to **Live** (top-right switch)

---

## Part 5: Add Your Config to the Site (1 minute)

Open `firebase-config.js` in your project folder and replace the placeholder values:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",                    // from Step 2
  authDomain: "sphere-academy.firebaseapp.com",
  projectId: "sphere-academy",
  storageBucket: "sphere-academy.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

const FIREBASE_ENABLED = true;  // ← IMPORTANT: change from false to true
```

---

## Part 6: Authorize Your Domain (1 minute)

1. In Firebase Console → Authentication → **Settings** tab → **Authorized domains**
2. Add the domain where your site is hosted:
   - For local testing: `localhost` is already there
   - For GitHub Pages: add `stratosadvertiser-coder.github.io`
   - For custom domain: add your domain

---

## Part 7: Test It

1. Open `login.html` in your browser (or hosted URL)
2. Click **Google** — a popup will open, let you choose your Google account, and log you in
3. Click **Facebook** — same flow with Facebook login
4. You'll be auto-redirected to `course.html` as a student account

---

## Troubleshooting

**"Firebase is not configured yet"**
→ You forgot to set `FIREBASE_ENABLED = true` in `firebase-config.js`

**"This domain is not authorized"**
→ Add your domain in Firebase Console → Authentication → Settings → Authorized domains

**"auth/popup-blocked"**
→ Your browser is blocking popups. Allow popups for your site.

**Facebook login doesn't work on localhost**
→ Facebook requires HTTPS. Use `ngrok` to expose your local server, or test on your live hosted URL.

**Google/FB user shows up as "student" — how do I make them admin?**
→ Log in as admin first, then manually update their role in `localStorage` under `auth_users`, or add a role field to your Firebase user data later.

---

## Security Notes

- The Firebase `apiKey` is **safe to expose publicly** — it only identifies your project, not authenticates you.
- Security is enforced by **Authorized Domains** (Part 6) and **Firebase Security Rules**.
- For production, consider adding Firebase Security Rules and moving user data from `localStorage` to Firestore.

---

Done! Your Google/Facebook login buttons now work with real OAuth. 🎉
