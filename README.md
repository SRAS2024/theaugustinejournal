# The Augustine Journal

**Live site:** [theaugustinejournal.com](https://theaugustinejournal.com)

---

A clean, professional journal and blog platform with built-in newsletter functionality and its own translation engine, built with Node.js, Express, and PostgreSQL. Deployed on Railway.

---

## Features

### Public Website
- **Home page** with centered title, editable about section, notices (up to 3), and latest post link
- **Blog**, **Essays**, and **Letters** sections with posts ordered by date
- **Individual post pages** with read counting, share button, and optional original PDF link
- **Responsive design** with mobile hamburger menu navigation
- **Automatic translation** into Spanish, Portuguese, French, German and Russian (see [Translation](#translation))
- **SEO** with auto-generated sitemap.xml (with `lastmod` on every page), robots.txt, canonical URLs, JSON-LD structured data (Article + WebSite), Open Graph meta tags, and Twitter Cards
- **IndexNow** pings search engines (Bing, DuckDuckGo, Yandex, …) automatically whenever a post is added, edited, or removed so new content is crawled promptly
- **Old post URLs keep working**: when a post's URL slug is regenerated, the previous address redirects (301) to the new one
- **Share button** using the Web Share API with clipboard fallback
- **Friendly 404 page** for unknown addresses
- **BIMI support** at `/.well-known/bimi` for branded sender icons in email clients
- **Design**: ivory text on a textured warm charcoal ground, dark purple accents, a hand-sketched line-drawn cathedral and thin line ornaments; Cormorant Garamond and Inter

### Translation
Readers see the site in their browser's language when it is English, Spanish, Portuguese, French, German or Russian. Nothing needs to be chosen and nothing is remembered between visits, so a shared link always opens in the reader's own language.

- **Interface text** (navigation, buttons, dates, messages, emails) comes from hand-written dictionaries in all six languages.
- **Content** — post titles, post bodies, notices and the home page text — is translated by the site's **own translation engine**. No Google Translate, no external API and no API keys are involved.
- The engine runs the University of Helsinki's open **OPUS-MT** neural translation models directly on the server: a hand-written SentencePiece tokenizer, the transformer network built as an ONNX graph from the published weights, and beam-search decoding, executed with ONNX Runtime on the CPU. Every model is pinned to an exact revision and verified by SHA-256 before use.
- Every translated sentence is checked before it is used. One that comes out garbled, or that adds something the English does not say (a bracketed aside, a Bible reference, or Islamic wording such as "Allah" for God, which the models picked up from Qur'an translations in their training data), is translated again with other settings and then with the language's second model; if neither is right, that sentence stays in English.
- Every translated sentence is stored in the database, so each sentence is translated only once. After a post is created or edited, its translations are prepared in the background straight away, and new-post emails carry the title in each subscriber's language.
- Formatting is preserved: paragraphs, headings, lists, links, line breaks and emphasis. URLs, code and anything marked `notranslate` are left as they are, and so is a post's reference list (from its References / Bibliography / Works Cited heading to the next section heading), so citations stay exactly as written.
- The **Auto Translation for Title** switch on each post keeps that title in its original language.
- While a long new post is still being translated, its translated paragraphs appear as soon as they are ready.

### Admin Panel (`/admin`)
- Secure login with username and password (bcrypt-hashed), rate-limited, with a fresh session on every sign-in
- Animated welcome screen with loading indicator (charcoal circle, dark purple progress)
- Dashboard with post counts (total, blogs, essays, letters), subscriber count, and notice count
- **Create posts** via rich text editor (Quill) or PDF upload with automatic text extraction
- **Edit and delete** any post (deleting asks for confirmation and the admin password)
- **Per-post auto-translate toggle** to control whether the title is translated
- **Notices system** (up to 3) displayed on the home page between the title and about section
- **Site settings** to edit the home page about text (HTML)
- **Subscriber management** — view all subscribers with email and language, remove (unsubscribe) with password confirmation
- **Post type filter** on the posts management page
- Save confirmation after all admin actions; the admin interface is also translated
- Session-based authentication (8-hour sessions, HttpOnly, SameSite=lax cookies) with CSRF protection on every form

### Post System
- Three post types: **Blog**, **Essay**, and **Letter**
- Two content modes: **Rich text editor** or **PDF upload**
- PDF text extraction with intelligent processing:
  - Paragraphs detected from the page layout (including paragraphs that continue across a page break)
  - Page number and repeated header/footer removal
  - References/bibliography section detection and styling
  - First-line indentation preservation
- Posts require: type, title, date, and content (validated on create/save; the form keeps what was typed when something is missing)
- **Automatic formatting** on every save, and an **Auto format** button under the editor to see the result first (undo with Ctrl/Cmd+Z). It never changes a word; it only fixes layout:
  - pasted colours, tabs, stray spaces and empty spacer paragraphs are removed (a blank line that separates stanzas or prayers is kept)
  - paragraphs split in the middle of a sentence (typical of PDF text) are joined
  - verse such as a creed or psalm is kept line by line in one block
  - the References / Bibliography / Works Cited section gets a centered heading and one hanging-indent entry per source, with wrapped lines and split URLs joined and web addresses made into links
- Automatic URL slug generation from post title
- **Reads** per post (shown in the admin posts list). A read counts once the reader has spent the post's reading time on the visible page and scrolled a little; short pages that cannot scroll need only the time:

  | Post length | Time on the page |
  |-------------|------------------|
  | up to 300 words | 10 seconds |
  | 500 words | 15 seconds |
  | 700 words | 30 seconds |
  | longer | +2 seconds per 100 words, at most 45 seconds |

  Each device counts once per post: the browser keeps a random device id (local storage and a first-party cookie) that is stored only as a keyed hash. Each post page carries a signed ticket, so a read cannot be sent sooner than the reading time or replayed, reads are rate-limited, and crawlers and the signed-in admin are not counted. The view numbers from before reads existed are kept as each post's starting count.
- Share count tracking per post

### Newsletter & Email System
- **Email delivery** via [Resend](https://resend.com) API
- **Subscribe** — visitors can subscribe from the site; confirmation email sent immediately
- **Unsubscribe** — signed one-click link in every email, RFC 8058 one-click unsubscribe for mail apps (`List-Unsubscribe-Post`), plus admin-initiated removal
- **New post notifications** — all subscribers are emailed when a new post is created, with the post title translated into each subscriber's language
- **Weekly throwback** — automatic Thursday email (from 09:00 in `THROWBACK_TIMEZONE`, America/Chicago by default) featuring an older post on rotation; a send is claimed in the database first so it can never go out twice
- **Internationalized emails** — all email copy in the subscriber's language (en, es, pt, fr, de, ru)
- Email templates in the site's design (ivory on charcoal, line-drawn cathedral and ornament as transparent 2x PNGs) built to hold up in every mail app: table layout with a fixed-width Outlook table, solid colours on every cell, inline styles on every text element, web fonts with Georgia/Arial fallbacks, colours pinned against the dark modes of Gmail, Outlook.com and Apple Mail, artwork that stays visible when a mail app turns an email light, and a matching plain-text version with the post and unsubscribe links
- Rate-limited sending with retry logic and exponential backoff
- Email audit trail logged in the database

### Storage
Eleven data models stored in PostgreSQL:

1. **Post** — blog, essay, and letter content
2. **SiteSettings** — about text (singleton)
3. **Notice** — home page notices (up to 3)
4. **PostView** — view history from before reads were counted (no longer written)
5. **PdfFile** — PDF binary backup (survives ephemeral filesystem redeployments)
6. **Subscriber** — email subscribers with language preference
7. **EmailLog** — audit trail of sent emails (type, post, timestamp)
8. **ThrowbackTracker** — rotation state for weekly throwback emails
9. **Translation** — every translated sentence, per language
10. **PostRedirect** — previous URL slugs that redirect to a post
11. **PostRead** — one row per device that has read a post

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 (22.12 or newer) |
| Framework | Express.js |
| Database | PostgreSQL (via Prisma ORM) |
| Templating | EJS |
| Rich Editor | Quill 1.3.7 |
| Session Store | connect-pg-simple |
| Email | Resend API |
| PDF Parsing | pdf-parse |
| File Uploads | multer 2 (15 MB max, PDF only) |
| Translation | Self-hosted OPUS-MT models on ONNX Runtime (onnxruntime-node), with built-in dictionaries for interface text |
| Security | Helmet with a nonce-based Content Security Policy, CSRF tokens, bcryptjs, rate limiting |
| Logging | Morgan |
| Tests | `node --test` |
| Hosting | Railway |

---

## Project Structure

```
theaugustinejournal/
  server.js                  # Express app entry point (port 8080)
  package.json               # Dependencies and scripts (package-lock.json pins versions)
  .npmrc                     # Skips onnxruntime-node's optional CUDA download
  prisma/
    schema.prisma            # Database schema (11 models)
    seed.js                  # Idempotent default data seeding
    migrations/              # Prisma migration history
  src/
    lib/
      db.js                  # Prisma client singleton
      db-bootstrap.js        # Database migration runner and startup seeding
      email-service.js       # Resend API email delivery, templates, and i18n
      scheduler.js           # Hourly scheduler for weekly throwback emails
      languages.js           # The six site languages
      pdf-text.js            # PDF text extraction and conversion to HTML
      sanitize.js            # HTML sanitization for rich text
      security.js            # Admin password verification (bcryptjs)
      unsubscribe.js         # Signed unsubscribe links
      indexnow.js            # IndexNow search-engine pings
      post-format.js         # Automatic post formatting (paragraphs, verse, references)
      reads.js               # Read counting: reading time, signed read tickets, reader keys
      view-helpers.js        # Escaping and date helpers for the views
      uploads.js             # File upload directory utilities
      translation/
        service.js           # What to translate, sentence storage, background queue
        engine.js            # Runs the translation worker process
        worker.js            # Child process that loads models and translates
        marian.js            # OPUS-MT (MarianMT) model: graph building and beam search
        onnx.js              # Minimal ONNX graph writer
        weights.js           # Reads model weights (safetensors / PyTorch checkpoints)
        sentencepiece.js     # SentencePiece tokenizer
        html.js              # Sentence extraction from HTML and reassembly
        text.js              # Sentence splitting, Title Case handling, typography
        hub.js               # Verified model downloads from Hugging Face
        models.js            # Pinned models per language
    middleware/
      auth.js                # Admin session guard (requireAdmin)
      attachLocals.js        # Template locals (session, language detection)
      csrf.js                # CSRF tokens (admin) and same-origin checks (public JSON)
    routes/
      public.js              # Public pages (home, blog, essays, letters, post, sitemap, robots, BIMI)
      admin.js               # Admin dashboard, CRUD, PDF extraction, notice and subscriber management
      api.js                 # Translations, reads, subscribe, unsubscribe and share count endpoints
  public/
    css/styles.css           # Complete stylesheet
    js/
      i18n.js                # Automatic translation in the browser (dictionaries + engine results)
      subscribe.js           # Subscribe dialog
      post.js                # Share button
      reads.js               # Counts a read after time on the page and a little scrolling
      admin.js               # Admin form toggle and PDF upload AJAX logic
      admin-confirm.js       # Confirmation + password dialogs for admin deletions
      quill-init.js          # Rich text editor initialization (dual editor mode)
    icons/                   # Favicon, BIMI icon and email artwork (SVG sources next to the PNGs)
    img/grain.png            # Charcoal grain texture
    site.webmanifest         # Web app manifest
  views/
    layout.ejs               # Base HTML layout
    home.ejs, list.ejs, post.ejs, not-found.ejs   # Pages (bodies in views/pages/)
    unsubscribe.ejs          # Unsubscribe confirmation page
    partials/                # Header, footer, ornament, subscribe dialog, admin header/navigation/dialogs
    admin/                   # Login, welcome, dashboard, posts, post form, settings, subscribers
  scripts/
    format-posts.mjs         # Formats stored posts (dry run by default; --apply --backup <file>, --restore <file>)
    generate-favicons.js     # Builds the favicon and app icons
  test/                      # Unit tests (node --test)
  uploads/                   # PDF file storage (filesystem cache)
```

---

## Deployment (Railway)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Railway) |
| `ADMIN_USERNAME` | Yes | Admin login username |
| `ADMIN_PASSWORD` | Yes | Admin login password |
| `SESSION_SECRET` | Recommended | Session signing key. Without it a random key is used and admins are signed out on every restart. Also signs unsubscribe links and keys read counting (read tickets and stored device hashes): changing it breaks unsubscribe links in emails already sent and lets every device be counted once more. |
| `PORT` | No | Server port (default: 8080) |
| `NODE_ENV` | No | Set to `production` for secure cookies, HTTPS upgrades and IndexNow pings |
| `SITE_URL` | No | Canonical URL for sitemap, robots.txt and email links (default: https://theaugustinejournal.com) |
| `RESEND_API_KEY` | No | [Resend](https://resend.com) API key for email delivery |
| `THROWBACK_TIMEZONE` | No | Time zone for the Thursday throwback email (default: `America/Chicago`) |
| `UNSUBSCRIBE_SECRET` | No | Key for signing unsubscribe links (defaults to `SESSION_SECRET`) |
| `INDEXNOW_KEY` | No | Fixed IndexNow verification key (otherwise derived from the deployment's secrets) |
| `INDEXNOW_DISABLED` | No | Set to `true` to disable IndexNow search-engine pings |
| `TRANSLATION_DISABLED` | No | Set to `true` to turn the translation engine off (interface dictionaries still work) |
| `TRANSLATION_THREADS` | No | CPU threads used for translation (default: 4) |
| `TRANSLATION_BEAMS` | No | Beam size for decoding (default: 4; 1 is faster, slightly lower quality) |
| `TRANSLATION_MODEL_DIR` | No | Where models are downloaded (default: `.cache/translation-models` in the app folder) |

### Build & Start

Railway runs these scripts automatically:

```
npm ci              # Install the exact dependency versions from package-lock.json (postinstall runs prisma generate)
npm start           # node server.js (runs migrations, seeding, and starts Express)
```

The server starts listening immediately and runs database bootstrap in the background (migrations, seeding), retrying while the database is unreachable. `/health` returns 503 until the app is ready and 200 afterwards, so it can be used as Railway's health check.

### Translation engine on Railway

- The first time a language is needed, its model (about 470–620 MB) is downloaded from Hugging Face at a pinned revision and verified. Models are kept on the container's disk until the next deploy.
- Shortly after the server starts, a background pass translates anything that is not translated yet. On the first deploy that is the whole site; after that, only new or edited content. Pages a reader is looking at are translated first.
- Translation runs in a separate worker process (about 2 GB of memory while working) that stops after five idle minutes.

### Host Enforcement

In production, the server automatically:
- Redirects `www.theaugustinejournal.com` to `theaugustinejournal.com`
- Redirects HTTP to HTTPS on the canonical domain

### DNS Records

**Required for email branding (BIMI):**
```
default._bimi.theaugustinejournal.com  TXT  "v=BIMI1; l=https://theaugustinejournal.com/.well-known/bimi"
```

BIMI requires a DMARC policy of `p=quarantine` or `p=reject` and passing SPF/DKIM. Gmail additionally requires a VMC (Verified Mark Certificate).

---

## Local Development

```bash
# 1. Clone the repository
git clone https://github.com/SRAS2024/theaugustinejournal.git
cd theaugustinejournal

# 2. Install dependencies (Node.js 22.12 or newer 22.x)
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your local PostgreSQL connection string and admin credentials

# 4. Set up database
npx prisma migrate deploy
node prisma/seed.js

# 5. Start the server
npm run dev
# Server runs on http://localhost:8080

# 6. Run the tests
npm test
```

Set `TRANSLATION_DISABLED=true` in `.env` to skip downloading translation models during local development.

---

## Admin Access

- **URL:** `/admin`
- **Credentials:** Set via the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables.

After login, a 3-second welcome animation plays before redirecting to the dashboard.

### Formatting existing posts

Posts are formatted when they are saved. To format posts that are already stored (for example after changing the formatting rules), run from the app folder with `DATABASE_URL` set:

```bash
node scripts/format-posts.mjs                                   # dry run: shows every change
node scripts/format-posts.mjs --apply --backup posts-backup.json
node scripts/format-posts.mjs --restore posts-backup.json       # undo
```

`--restore` only puts back posts that still hold what `--apply` wrote, so a post edited since then is never overwritten (unless `--force`, with `--backup <file>` for a copy of what it replaces). Only `contentHtml` is written, so each post's `updatedAt` stays as it was. Other options: `--from-json <file>` (dry run on a JSON dump, no database), `--report <file>` (write the report to a new file), `--slug <slug>` (one post).

---

## Credits

Translations are produced with the OPUS-MT models by the Language Technology Research Group at the University of Helsinki (Jörg Tiedemann et al., [Helsinki-NLP](https://huggingface.co/Helsinki-NLP)), licensed CC-BY 4.0 / Apache 2.0. The English–German model is the University of Helsinki's Tatoeba-Challenge transformer-big model as converted by [gsarti](https://huggingface.co/gsarti/opus-mt-tc-big-en-de).

## License

Apache 2.0
