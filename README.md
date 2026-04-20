# Sphere Academy

A 4-month Marketing Intern Training Program LMS (Learning Management System) — static web app built with vanilla HTML, CSS, and JavaScript. All data persists in `localStorage` (no backend required).

## Features

### For Students
- **Login/Signup** with role-based auth (student / admin)
- **16 weekly lessons** across 4 monthly phases
- **Dynamic lesson pages** with video, content sections, key takeaways, and pro tips
- **Weekly assignments** — drag-and-drop file uploads (images, videos, PDFs)
- **Weekly assessments** — multiple choice quizzes with passing scores
- **Progress tracking** — auto-completion on quiz pass
- **Certificate download** — custom HTML certificate with Sphere Academy branding after 100% completion
- **Profile page** — personal info, account settings, progress timeline, avatar upload
- **Q&A / comments** per lesson
- **Bookmarks**, **streak counter**, **search**, and **notifications**
- **Dark mode** toggle
- **Export progress report** as CSV

### For Admins
- **Admin Panel** — dedicated dashboard (role-protected)
- **Lesson editor** — title, category, video URL (YouTube/Vimeo), content sections, key takeaways, pro tip
- **Assignment editor** — configurable per lesson (title, description, file types)
- **Quiz editor** — multiple choice questions with configurable passing score
- **Course card cover images** — upload with drag-to-reposition
- **Editable emojis** per course card
- **Site Settings** — editable month labels, prefixes, category names, skill tags, section title
- **Bulk publish** all lessons at once
- **Unsaved changes warning**

### UX / Accessibility
- Responsive design (mobile, tablet, desktop)
- ARIA roles, keyboard shortcuts (Escape to close overlays)
- Loading states on forms
- 404 page
- Back button in navbar
- Skeleton loader CSS utilities

## Tech Stack
- **HTML/CSS/JS** — no build step, no framework
- **Fonts** — Plus Jakarta Sans (Google Fonts)
- **Storage** — `localStorage` with safe wrappers (try-catch for quota errors)

## File Structure
```
sphere-academy/
├── index.html          # Homepage / landing page
├── course.html         # Course overview with tabs
├── lesson.html         # Individual lesson template (dynamic via ?week=wN)
├── login.html          # Login page
├── signup.html         # Registration page
├── profile.html        # User profile + progress + certificate
├── admin.html          # Admin dashboard (protected)
├── 404.html            # Error page
├── styles.css          # All styles
├── script.js           # All JS (auth, lessons, quiz, admin, etc.)
└── logo.png            # Sphere Academy logo
```

## Default Admin
- **Username:** `admin`
- **Password:** `admin123`

## Running Locally
Just open `index.html` in your browser. For YouTube video embeds to work inline, serve via a local web server:
```bash
python -m http.server 8080
# then visit http://localhost:8080
```

## Data Storage (localStorage keys)
- `auth_users` — registered users
- `auth_logged_in`, `auth_user`, `auth_role`, `auth_profile`, `auth_avatar` — session
- `lessons_data` — all 16 lessons (content, quiz, assignment config)
- `lesson_progress` — completion state per week
- `assignment_submissions` — submitted assignment file metadata
- `quiz_results` — quiz scores per week
- `lesson_qa` — Q&A comments
- `lesson_bookmarks` — bookmarked lessons
- `notifications`, `learning_streak` — engagement features
- `site_month_names`, `site_month_prefixes`, `site_skill_tags`, `site_section_title` — admin-editable labels
- `site_card_emojis`, `card_image_N`, `card_image_pos_N` — course card customization
- `theme` — light/dark preference

## License
Private / internal use.
