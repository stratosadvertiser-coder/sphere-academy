#!/usr/bin/env node
/**
 * sync-web.js
 *
 * Copies the static web assets (HTML, JS, CSS, logo, manifest,
 * service worker) into a `www/` folder that Capacitor uses as
 * the WebView bundle. We run this BEFORE `npx cap sync` so the
 * Android/iOS projects pick up the latest web code.
 *
 * Why a copy step? The Capacitor `webDir` must contain ONLY web
 * assets — not node_modules, not android/, not ios/. So we
 * keep the project flat for GitHub Pages and add a www/ folder
 * specifically for Capacitor.
 *
 * Run it manually: `npm run sync-web`
 * Or as part of the full build: `npm run build`
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'www');

// Files / folders to copy. Anything not in this list is ignored
// — keeps the WebView bundle tight.
const INCLUDE = [
  // HTML pages
  'index.html',
  'dashboard.html',
  'course.html',
  'lesson.html',
  'bonus-course.html',
  'profile.html',
  'events.html',
  'admin.html',
  'login.html',
  'signup.html',
  '404.html',
  // Core assets
  'script.js',
  'styles.css',
  'firebase-config.js',
  'service-worker.js',
  'manifest.json',
  // Images
  'logo.png',
  'favicon.png'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
}

function copyAll() {
  // Wipe and recreate the output folder so deleted source files
  // don't linger in the WebView bundle.
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  ensureDir(OUT);

  let copied = 0;
  let skipped = 0;

  INCLUDE.forEach((name) => {
    const src = path.join(ROOT, name);
    const dest = path.join(OUT, name);
    if (!fs.existsSync(src)) {
      console.warn('[sync-web] skip (missing):', name);
      skipped++;
      return;
    }
    copyFile(src, dest);
    copied++;
  });

  // Copy any additional logo/avatar/cover images sitting in root
  // (e.g. user-uploaded covers, course cards). Pattern: any *.png
  // / *.jpg / *.svg in root that isn't already in INCLUDE.
  const extraImgs = fs.readdirSync(ROOT).filter((f) => {
    if (INCLUDE.includes(f)) return false;
    return /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(f);
  });
  extraImgs.forEach((f) => {
    copyFile(path.join(ROOT, f), path.join(OUT, f));
    copied++;
  });

  console.log(`[sync-web] copied ${copied} files into www/ (${skipped} skipped)`);
}

copyAll();
