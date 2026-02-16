# The Augustine Journal

A clean, professional journal and blog platform built with Node.js, Express, and PostgreSQL. Deployed on Railway.

**Live site:** [https://theaugustinejournal.up.railway.app](https://theaugustinejournal.up.railway.app)

**Custom domain:** [theaugustinejournal.com](https://theaugustinejournal.com)

---

## Features

### Public Website
- **Home page** with centered title, editable about section, notices, and latest post link
- **Blog** and **Letters** sections with posts ordered by date
- **Individual post pages** for each blog entry and letter
- **Responsive design** that works across all device types (desktop, tablet, mobile)
- **Hamburger menu** navigation on mobile devices
- **Auto-translation** into the visitor's device language via Google Translate integration
- Color palette: black, white, grey, and dark purple accents

### Admin Panel (`/admin`)
- Secure login with username and password
- Animated welcome screen with loading indicator (charcoal circle, dark purple progress)
- Dashboard with post/letter/notice counts
- **Create posts** via rich text editor (Quill) or PDF upload
- **Edit and delete** any post or letter
- **Notices system** (up to 3) displayed on the public site between the title and about section
- **Site settings** to edit home page about text
- Save confirmation after all admin actions
- Session-based authentication (8-hour sessions)

### Post System
- Two post types: **Blog** and **Letter**
- Two content modes: **Rich text editor** or **PDF upload**
- PDF text extraction renders content identically to manually typed posts
- Posts require: type, title, date, and content (validated on create/save)
- Automatic URL slug generation from post title

### Storage
Three data categories stored in PostgreSQL:
1. **Blogs** — blog-type posts
2. **Letters** — letter-type posts
3. **Site Settings** — about text and notices

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
| Security | Helmet, CSRF (csurf), bcryptjs, rate limiting |
| Translation | Google Translate Element + i18n dictionaries |
| Hosting | Railway |

---

## Project Structure

```
theaugustinejournal/
  server.js                  # Express app entry point (port 8080)
  package.json               # Dependencies and scripts
  prisma/
    schema.prisma            # Database schema
    seed.js                  # Default data seeding
  src/
    lib/
      db.js                  # Prisma client
      sanitize.js            # HTML sanitization
      security.js            # Admin authentication
      translate.js           # Translation API integration
      uploads.js             # File upload utilities
    middleware/
      auth.js                # Admin session guard
      attachLocals.js        # Template locals (CSRF, session)
    routes/
      public.js              # Public pages (home, blog, letters, post)
      admin.js               # Admin dashboard and CRUD operations
      api.js                 # Translation API endpoint
  public/
    css/styles.css           # Complete stylesheet
    js/
      i18n.js                # Auto-translation (UI strings + Google Translate)
      admin.js               # Admin form toggle logic
      quill-init.js          # Rich text editor initialization
  views/
    layout.ejs               # Base HTML layout
    home.ejs                 # Home page
    list.ejs                 # Blog/Letters listing
    post.ejs                 # Individual post view
    partials/
      header.ejs             # Navigation header with hamburger menu
      footer.ejs             # Footer
    admin/
      login.ejs              # Admin login
      welcome.ejs            # Welcome animation screen
      dashboard.ejs          # Admin dashboard
      posts.ejs              # Post management list
      post-form.ejs          # Create/edit post form
      edit-settings.ejs      # Site settings and notices
  uploads/                   # PDF file storage
```

---

## Deployment (Railway)

### Environment Variables

Railway provides `PORT` and `DATABASE_URL` automatically when a PostgreSQL service is connected.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Railway) |
| `PORT` | Server port (default: 8080) |
| `SESSION_SECRET` | Random string for session encryption |
| `NODE_ENV` | Set to `production` for secure cookies |
| `TRANSLATE_API_URL` | Optional: LibreTranslate endpoint for API-based translation |
| `TRANSLATE_API_KEY` | Optional: API key for translation service |

### Build & Start

Railway runs these scripts automatically:

```
npm install         # Install dependencies
npm run build       # npx prisma generate
npm start           # npx prisma db push && node prisma/seed.js && node server.js
```

### Custom Domain

Configure `theaugustinejournal.com` in Railway project settings under the Networking tab.

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
# Edit .env with your local PostgreSQL connection string

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
