# ShortURL

A full-stack URL shortener built with React, Node.js, Express, MongoDB, Redis, ZooKeeper, Nginx, and Docker.

ShortURL lets users create compact short links from long URLs, redirect through those short links, track visits, set expiration durations, and protect the API with rate limiting and server-side validation.

## Features

- Shorten long URLs into compact Base62 hash-based links.
- Redirect short URLs to their original destination (HTTP 302).
- Store URL records in MongoDB with a unique index on `OriginalUrl` (deduplication).
- **Redis caching on create and redirect paths:**
  - Create dedup cache: `originalUrl → hash` (600s TTL)
  - Redirect cache: `hash → originalUrl` (TTL aligned with expiration)
- **Redis-backed visit tracking** with periodic flush to MongoDB (durable across restarts).
- Redis-backed rate limiting on URL creation and redirects, with in-memory fallback if Redis is unavailable.
- **Backend URL validation** — only `http`/`https`; blocks private/local addresses.
- **Restricted CORS** — configurable allowed origins (default: `http://localhost:3000`).
- Set URL expiration from the frontend.
- Reject expired URLs with a `410 Gone` response.
- Automatically remove expired URLs using MongoDB TTL and a scheduled cleanup worker.
- **ZooKeeper-coordinated ID ranges** with promisified allocation and optimistic locking (version-based range claims).
- **Health and readiness endpoints** for operations (`/health`, `/ready`).
- Run the full app with Docker Compose.
- Use Nginx as a reverse proxy for the backend.

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | React 17, Axios, Sass, react-router-dom |
| Backend | Node.js 18, Express 4.18 |
| Database | MongoDB, Mongoose |
| Cache / rate limits / visits | Redis 2.8 |
| Coordination | Apache ZooKeeper |
| Proxy | Nginx |
| Containers | Docker, Docker Compose |

## Project Structure

```text
ShortURL-master/
  client/                    React frontend
  server/                    Express backend
    src/
      controllers/           urlPost, urlGet, health checks
      helpers/                 mongodb, redis, zookeeper, validateUrl
      middleware/              rateLimiter
      models/                  URL schema
      routes/                  API routes
      workers/                 purgeAliases cron
    scripts/
      integration-test.js      Automated API test suite
  nginx/                     Nginx reverse proxy config
  docker-compose.yml
  README.MD
```

## Environment Variables

Create this file:

```text
server/.env
```

Example (use placeholders — **never commit real credentials**):

```env
REACT_APP_MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/shorturl?appName=Cluster0"
REACT_APP_REDIS_HOST=redis-server
REACT_APP_REDIS_PORT=6379

CORS_ORIGINS=http://localhost:3000

URL_EXPIRATION_DAYS=365
URL_MAX_EXPIRATION_DAYS=365
URL_CREATE_RATE_LIMIT_MAX=20
URL_CREATE_RATE_LIMIT_WINDOW_SECONDS=60
URL_REDIRECT_RATE_LIMIT_MAX=120
URL_REDIRECT_RATE_LIMIT_WINDOW_SECONDS=60

VISIT_FLUSH_INTERVAL_MS=30000
```

| Variable | Purpose |
| -------- | ------- |
| `REACT_APP_MONGODB_URI` | MongoDB connection string |
| `REACT_APP_REDIS_HOST` / `PORT` | Redis hostname and port |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `URL_EXPIRATION_DAYS` | Default link expiration (days) |
| `URL_MAX_EXPIRATION_DAYS` | Maximum allowed expiration (days) |
| `URL_CREATE_RATE_LIMIT_*` | Create endpoint rate limit |
| `URL_REDIRECT_RATE_LIMIT_*` | Redirect endpoint rate limit |
| `VISIT_FLUSH_INTERVAL_MS` | How often Redis visit counts flush to MongoDB (default 30s) |

**Note:** `docker-compose.yml` overrides the MongoDB URI to `mongodb://mongo-server:27017/shorturl` for local Docker runs.

## Running The Project

Start Docker Desktop first, then run:

```sh
docker compose up --build
```

Open the app:

```text
http://localhost:3000
```

Backend API through Nginx:

```text
http://localhost:4000
```

To run in the background:

```sh
docker compose up -d
```

To stop everything:

```sh
docker compose down
```

Scale backend replicas (optional):

```sh
docker compose up --build --scale node-server=3
```

## API Endpoints

### Health & Readiness

```http
GET /health
```

Returns `200` when the API process is running.

```http
GET /ready
```

Returns `200` when MongoDB, Redis, and ZooKeeper are all reachable and the ID range is ready. Returns `503` otherwise.

### Create Short URL

```http
POST /url
```

Request body:

```json
{
  "OriginalUrl": "https://example.com",
  "ExpirationDays": 30
}
```

Response:

```json
"5io8"
```

Validation errors (invalid URL, private/local address, non-http scheme):

```http
400 Bad Request
```

Duplicate `OriginalUrl` returns the existing hash (unique index + dedup logic).

### Redirect Short URL

```http
GET /url/:identifier
```

Example:

```text
http://localhost:4000/url/5io8
```

If the URL exists and is active, the server returns **302** redirect to the original URL.

If the URL is expired:

```text
410 Gone
URL has expired
```

If the URL is missing:

```text
404 Not Found
URL not found
```

## Redis Usage

| Purpose | Key pattern | When |
| ------- | ----------- | ---- |
| Create dedup cache | `{originalUrl}` → hash | `POST /url` |
| Redirect cache | `redirect:{hash}` → originalUrl | `GET /url/:id` |
| Rate limiting | `rate_limit:{prefix}:{ip}` | All limited routes |
| Visit counts | `url_visits` hash field per hash | On redirect; flushed to MongoDB every 30s |

## Rate Limiting

The backend protects API usage with per-IP rate limits:

- URL creation: **20 requests / 60 seconds** (default)
- Redirects: **120 requests / 60 seconds** (default)

When the limit is exceeded:

```http
429 Too Many Requests
```

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`

## URL Expiration

Each shortened URL has:

- `CreatedAt`
- `ExpiresAt`

Expired URLs are handled in three ways:

- The redirect route checks expiration before redirecting (returns 410).
- MongoDB TTL index automatically removes expired records.
- A daily cron worker (`purgeAliases`) deletes any remaining expired aliases.

## Security

- **Backend URL validation** on every create request.
- **CORS restricted** to configured origins.
- **No public admin/debug endpoints** (removed unauthenticated `/del`).
- **Unique indexes** on `Hash` and `OriginalUrl`.
- Rate limiting on create and redirect paths.

For production, also add HTTPS/TLS, secrets management, and authentication as needed.

## Testing

### Automated integration tests

With Docker running and the stack up:

```sh
node server/scripts/integration-test.js
```

This tests health/readiness, URL validation, create/dedup/redirect, rate limiting, and visit flush (includes a ~35s wait).

### Manual checklist

- Open `http://localhost:3000`
- Enter a valid URL and select an expiration duration
- Click **Shorten** and open the generated short link
- Confirm redirect works
- Check `GET http://localhost:4000/ready` — all checks should be `up`
- Verify rate limiting: more than 20 create requests in one minute → `429`
- Check MongoDB for saved records and visit counts (after ~30s flush)
- Try invalid URLs via API (e.g. `http://localhost`) → `400`

## Architecture Overview

```text
User → React (:3000) → Nginx (:4000) → Express (:8081)
                                          ├── MongoDB (persistence)
                                          ├── Redis (cache, rate limits, visits)
                                          └── ZooKeeper (ID range coordination)
```

## Author

Built by **Nistha Nayak**.
