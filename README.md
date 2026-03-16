# The Augustine Journal

**Live site:** [theaugustinejournal.com](https://theaugustinejournal.com)

---

A clean, professional journal and blog platform built with Node.js, Express, and PostgreSQL. Deployed on Railway.

---

## Features

### Public Website
- **Home page** with centered title, editable about section, notices (up to 3), and latest post link
- **Blog**, **Essays**, and **Letters** sections with posts ordered by date
- **Individual post pages** with view tracking, share button, and optional original PDF link
- **Responsive design** with mobile hamburger menu navigation
- **Auto-translation** into 6 languages (English, Portuguese, Spanish, French, German, Italian) via built-in i18n dictionaries and Google Translate integration
- **SEO** with auto-generated sitemap.xml and robots.txt
- **Share button** using the Web Share API with clipboard fallback
- Color palette: black, white, grey, and dark purple accents

### Admin Panel (`/admin`)
- Secure login with username and password (bcrypt-hashed)
- Animated welcome screen with loading indicator (charcoal circle, dark purple progress)
- Dashboard with post counts (total, blogs, essays, letters) and notice preview
- **Create posts** via rich text editor (Quill) or PDF upload with automatic text extraction
- **Edit and delete** any post
- **Per-post auto-translate toggle** to control whether Google Translate applies to the title
- **Notices system** (up to 3) displayed on the home page between the title and about section
- **Site settings** to edit home page about text via rich text editor
- **Post type filter** on the posts management page
- Save confirmation after all admin actions
- Session-based authentication (8-hour sessions, HttpOnly, SameSite=lax cookies)

### Post System
- Three post types: **Blog**, **Essay**, and **Letter**
- Two content modes: **Rich text editor** or **PDF upload**
- PDF text extraction with intelligent processing:
  - Page number removal (multiple formats)
  - Repeated header/footer detection and removal
  - References/bibliography section detection and styling
  - Paragraph and indentation preservation
- Posts require: type, title, date, and content (validated on create/save)
- Automatic URL slug generation from post title
- Unique view tracking per post (SHA-256 hashed visitor fingerprint)

### Storage
Five data models stored in PostgreSQL:

1. **Post** — blog, essay, and letter content
2. **SiteSettings** — about text (singleton)
3. **Notice** — home page notices (up to 3)
4. **PostView** — unique view records per post
5. **PdfFile** — PDF binary backup (survives ephemeral filesystem redeployments)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 18 |
| Framework | Express.js |
| Database | PostgreSQL (via Prisma ORM) |
| Templating | EJS |
| Rich Editor | Quill 1.3.7 |
| Session Store | connect-pg-simple |
| PDF Parsing | pdf-parse |
| File Uploads | multer (15 MB max, PDF only) |
| Security | Helmet, CSRF (csurf), bcryptjs, rate limiting (180 req/60s) |
| Translation | Google Translate Element + built-in i18n dictionaries (6 languages) |
| Logging | Morgan |
| Hosting | Railway |

---

## Project Structure

```
theaugustinejournal/
  server.js                  # Express app entry point (port 8080)
  package.json               # Dependencies and scripts
  prisma/
    schema.prisma            # Database schema (Post, Notice, SiteSettings, PostView, PdfFile)
    seed.js                  # Idempotent default data seeding
    migrations/              # Prisma migration history
  src/
    lib/
      db.js                  # Prisma client singleton
      db-bootstrap.js        # Database migration runner and startup seeding
      sanitize.js            # HTML sanitization for rich text
      security.js            # Admin password verification (bcryptjs)
      translate.js           # Translation API handler
      uploads.js             # File upload directory utilities
    middleware/
      auth.js                # Admin session guard (requireAdmin)
      attachLocals.js        # Template locals (CSRF, session, language detection)
    routes/
      public.js              # Public pages (home, blog, essays, letters, post, sitemap, robots)
      admin.js               # Admin dashboard, CRUD, PDF extraction, notice management
      api.js                 # Translation API endpoint
  public/
    css/styles.css           # Complete stylesheet
    js/
      i18n.js                # Auto-translation (UI string dictionaries + Google Translate)
      admin.js               # Admin form toggle and PDF upload AJAX logic
      quill-init.js          # Rich text editor initialization (dual editor mode)
    icons/                   # Favicon files
    site.webmanifest         # Web app manifest
  views/
    layout.ejs               # Base HTML layout with Google Translate script
    home.ejs                 # Home page with notices, about section, latest post
    list.ejs                 # Blog/Essays/Letters listing
    post.ejs                 # Individual post view with share button and view tracking
    partials/
      header.ejs             # Navigation header with hamburger menu
      footer.ejs             # Footer
  admin/
    login.ejs                # Admin login
    welcome.ejs              # Welcome animation screen
    dashboard.ejs            # Admin dashboard with counts
    posts.ejs                # Post management list with type filter
    post-form.ejs            # Create/edit post form (dual content mode)
    edit-settings.ejs        # Site settings and notice management
  uploads/                   # PDF file storage (filesystem cache)
```

---

## Deployment (Railway)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Railway) |
| `ADMIN_USERNAME` | Yes | Admin login username |
| `ADMIN_PASSWORD` | Yes | Admin login password (bcrypt-hashed, >= 10 rounds) |
| `PORT` | No | Server port (default: 8080) |
| `SESSION_SECRET` | No | Session encryption key (auto-generated if not set) |
| `NODE_ENV` | No | Set to `production` for secure cookies and HTTPS enforcement |
| `SITE_URL` | No | Canonical URL for sitemap (default: https://theaugustinejournal.com) |
| `TRANSLATE_API_URL` | No | LibreTranslate endpoint (future, currently unused) |
| `TRANSLATE_API_KEY` | No | API key for translation service (future, currently unused) |

### Build & Start

Railway runs these scripts automatically:

```
npm install         # Install dependencies (postinstall runs prisma generate)
npm start           # node server.js (runs migrations, seeding, and starts Express)
```

The server starts listening immediately and runs database bootstrap in the background (migrations, seeding). Returns 503 until ready.

### Host Enforcement

In production, the server automatically:
- Redirects `www.theaugustinejournal.com` to `theaugustinejournal.com`
- Redirects HTTP to HTTPS on the canonical domain

---

## Local Development

```bash
# 1. Clone the repository
git clone https://github.com/SRAS2024/theaugustinejournal.git
cd theaugustinejournal

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your local PostgreSQL connection string and admin credentials

# 4. Set up database
npx prisma generate
npx prisma db push
node prisma/seed.js

# 5. Start the server
npm run dev
# Server runs on http://localhost:8080
```

---

## Admin Access

- **URL:** `/admin`
- **Credentials:** Set via the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables.

After login, a 3-second welcome animation plays before redirecting to the dashboard.

---

## License

Apache 2.0
