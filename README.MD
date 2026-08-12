# ShortURL

A full-stack URL shortener built with React, Node.js, Express, MongoDB Atlas, Redis, ZooKeeper, Nginx, and Docker.

ShortURL lets users create compact short links from long URLs, redirect through those short links, track visits, set expiration durations, and protect the API with rate limiting.

## Features

- Shorten long URLs into compact hash-based links.
- Redirect short URLs to their original destination.
- Store URL records in MongoDB Atlas.
- Cache repeated URL lookups with Redis.
- Track visits for shortened URLs.
- Set URL expiration from the frontend.
- Reject expired URLs with a `410 Gone` response.
- Automatically remove expired URLs using MongoDB TTL and a scheduled cleanup worker.
- Apply Redis-backed rate limiting to URL creation and redirects.
- Use an in-memory rate-limit fallback if Redis is temporarily unavailable.
- Run the full app with Docker Compose.
- Use Nginx as a reverse proxy for the backend.
- Use ZooKeeper to coordinate token ranges for hash generation.

## Tech Stack

- Frontend: React, Axios, Sass
- Backend: Node.js, Express
- Database: MongoDB Atlas, Mongoose
- Cache and rate limiting: Redis
- Coordination: Apache ZooKeeper
- Proxy: Nginx
- Containerization: Docker, Docker Compose

## Project Structure

```text
ShortURL-master/
  client/          React frontend
  server/          Express backend
  nginx/           Nginx reverse proxy config
  docker-compose.yml
  README.MD
```

## Environment Variables

Create this file:

```text
server/.env
```

Example:

```env
REACT_APP_MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/shorturl?appName=Cluster0"
REACT_APP_REDIS_HOST=redis-server
REACT_APP_REDIS_PORT=6379

URL_EXPIRATION_DAYS=365
URL_MAX_EXPIRATION_DAYS=365
URL_CREATE_RATE_LIMIT_MAX=20
URL_CREATE_RATE_LIMIT_WINDOW_SECONDS=60
URL_REDIRECT_RATE_LIMIT_MAX=120
URL_REDIRECT_RATE_LIMIT_WINDOW_SECONDS=60
```

## Running The Project

Start Docker Desktop first, then run:

```sh
docker compose up --build
```

Open the app:

```text
http://localhost:3000
```

Backend through Nginx:

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

## API Endpoints

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

### Redirect Short URL

```http
GET /url/:identifier
```

Example:

```text
http://localhost:4000/url/5io8
```

If the URL exists and is active, the server redirects to the original URL.

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

## Rate Limiting

The backend protects API usage with rate limits:

- URL creation: 20 requests per 60 seconds by default.
- Redirects: 120 requests per 60 seconds by default.

When the limit is exceeded, the API returns:

```http
429 Too Many Requests
```

## URL Expiration

Each shortened URL has:

- `CreatedAt`
- `ExpiresAt`

Expired URLs are handled in three ways:

- The redirect route checks expiration before redirecting.
- MongoDB TTL can automatically remove expired records.
- A scheduled worker deletes expired URL aliases.

## Testing Checklist

- Open `http://localhost:3000`.
- Enter a valid URL.
- Select an expiration duration.
- Click Shorten.
- Open the generated short URL.
- Confirm it redirects correctly.
- Check MongoDB Atlas for the saved record.
- Test rate limiting by sending more than 20 create requests in one minute.
- Test expiration by creating a very short-lived URL through the API.

## Author

Built by **Nistha Nayak**.
