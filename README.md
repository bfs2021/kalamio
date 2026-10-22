# Blog App (Work in Progress)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

A full‑stack blog application currently under active development.

---

## 🚧 Project Status

**In Progress**
Core authentication, user profiles, blog fetching, routing, and UI animations are implemented.
Advanced blog features and polishing are in progress.

---

## 🚀 Getting Started (Local Setup)

No cloud accounts needed — Docker runs MongoDB, Redis, S3-compatible storage and an
email inbox locally. Full guide: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

> **Heads-up:** `.env` files are git-ignored, so a fresh clone will **not** include them.
> You must create them from the provided examples or every API call 404s against the
> dev server (you'll see requests to `undefinedapi/v1/...` in the console).

```bash
# 1. Start local services (MongoDB, Redis, storage, email inbox)
docker compose up -d

# 2. Create env files from the examples (they already point at the local services)
cp frontend/.env.example frontend/.env      # sets VITE_SERVER_DOMAIN
cp server/.env.example   server/.env        # local DB, storage, email, dev JWT secrets

# 3. Install dependencies
cd frontend && npm install
cd ../server && npm install

# 4. Fill the local database with demo users and articles
npm run seed                                # in server/; --reset to start over

# 5. Run (two terminals)
cd server   && npm run dev                  # API on :8080
cd frontend && npm run dev                  # app on :5173
```

Log in as `demo@example.com` / `Demo1234` (every seeded account uses that password).
Sign-up codes land in the local inbox at http://localhost:8025.

The frontend expects `VITE_SERVER_DOMAIN` to point at the running backend (default
`http://localhost:8080/`, **trailing slash required**). Restart `npm run dev` after
changing any `.env` — Vite only reads env vars at startup.

---

## ⚡ Response caching (Upstash Redis)

Public read endpoints are cached in Upstash Redis. **Caching is optional** — with no
creds set the API behaves normally. Locally, add to `server/.env`:

```
UPSTASH_REDIS_REST_URL=https://<your-db>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<your-rest-token>
```

**On Cloud Run** the API deploy configs (`cloudbuild-api-*.yaml`) mount these from
Secret Manager. Create the secrets **before deploying** (a deploy referencing a missing
secret fails), then grant the runtime service account read access:

```bash
# prod (dev uses the same names with a -dev suffix)
printf '%s' "https://<db>.upstash.io" | gcloud secrets create upstash-redis-rest-url   --data-file=-
printf '%s' "<rest-token>"            | gcloud secrets create upstash-redis-rest-token --data-file=-

SA=$(gcloud run services describe kalamio-api --region us-central1 \
       --format='value(spec.template.spec.serviceAccountName)')   # or the default compute SA
for s in upstash-redis-rest-url upstash-redis-rest-token; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
done
```

Use a **separate Upstash database for dev vs prod** so their caches don't collide.

---

## 🛡️ Cloudflare origin lock (optional)

If the API runs behind Cloudflare, set `CLOUDFLARE_ORIGIN_SECRET` so requests that
bypass Cloudflare (hitting `*.run.app` directly) are rejected. In Cloudflare, add a
**Transform Rule → Modify Request Header** that sets `X-Origin-Secret` to the same
value on origin requests. The API deploy configs mount it from Secret Manager
(`cloudflare-origin-secret`, `-dev` for dev):

```bash
printf '%s' "<long-random-value>" | gcloud secrets create cloudflare-origin-secret --data-file=-
# grant the runtime service account secretAccessor (same as the Upstash secrets)
```

It's a **no-op until set**, so it can ship before Cloudflare is in front. Keep
Cloudflare on its default caching (respect origin `Cache-Control`) — do **not**
enable "Cache Everything"; the API defaults to `no-store` and opts specific public
GETs into edge caching itself.

---

## 🔒 Dev site password (dev.kalamio.com)

`dev.kalamio.com` is behind HTTP Basic Auth. The users file is **not in git** — it lives in
Secret Manager as `web-dev-htpasswd`, and `cloudbuild-web-dev.yaml` mounts it into Cloud Run at
`/etc/nginx/auth/htpasswd`. To add or change a user, generate a line and add a new secret version:

```bash
printf '%s' '<password>' | openssl passwd -apr1 -stdin   # → put "username:<hash>" in the file
gcloud secrets versions add web-dev-htpasswd --data-file=frontend/.htpasswd
```

Then redeploy `kalamio-web-development`. The runtime service account needs
`roles/secretmanager.secretAccessor` on the secret (same as the Upstash secrets).

---

## 🛠️ Technologies Used

### Frontend

* **React.js** – UI development
* **React Router** – Routing and protected pages
* **Context API** – Global authentication state
* * **Axios** – API communication
* **Page Animations** – Smooth route transitions

### Backend

* **Node.js** – Server runtime
* **Express.js** – REST API framework
* **MongoDB** – Database
* **Mongoose** – ODM for MongoDB
* * **MVC-style structure** – Controllers, routes, models

### Authentication

* **JWT (JSON Web Tokens)** – Secure authentication
* **Firebase Google OAuth** – Google sign‑in
* **bcrypt** – Password hashing

### Cloud & Storage

* **AWS S3** – Blog banner image storage
* **Signed URLs** – Secure image uploads

### Utilities & Tools

* **dotenv** – Environment variable management
* **nanoid** – Unique ID generation
* **Git & GitHub** – Version control

---

## ✅ Features Implemented So Far

* User authentication (Email + Google OAuth)
* JWT‑based authorization
* Protected routes
* Blog editor page
* Publish flow setup
* AWS S3 image upload using signed URLs
* Secure environment variable handling
* Pagination
* * User signup & login
* User profile page
* About user section
* User routes
* Blog page route
* Get-blog API
* Blog rendering
* Page-to-page animations
* Loader component
* Responsive navbar
* 404 (Not Found) page


---

## 📌 What I’m Currently Working On

* * Blog creation & editor improvements
* Blog publish workflow
* Backend validations & error handling
* Performance & UI polish


---

## 🔮 Planned Features

* Draft saving
* Likes and comments
* Search & filtering
* Follow system
* Deployment

## 🎯 Learning Objectives

* Building a real-world MERN stack application
* Implementing authentication & authorization
* Structuring scalable backend APIs
* Managing global state in React
* Handling media uploads securely


---

## 🤝 Contributing

Contributions are welcome! Start with **[CONTRIBUTING.md](CONTRIBUTING.md)** — it covers
local setup, the [CLA](CLA.md), and how to open a pull request. Please follow our
[Code of Conduct](CODE_OF_CONDUCT.md), and report security issues privately as described
in [SECURITY.md](SECURITY.md).

---

## 📄 License

Kalamio is licensed under the **GNU Affero General Public License v3.0** — see [LICENSE](LICENSE).

You're free to use, modify, and self-host it. If you run a modified version as a network
service, you must make your modified source code available to its users under the same license.
By contributing, you agree that your contributions are licensed under the AGPL-3.0 as well.

---

> This README will evolve as the project progresses. A detailed architecture‑level README will be added once core features are finalized.
