# DigitalOcean Deployment Options

RestoreAssist can run on Vercel (current production) and can also be deployed on DigitalOcean using:

- **Spaces** for file storage (S3-compatible)
- **App Platform** for hosting the Next.js app
- **Droplets** for Docker-based hosting (more control, more ops)

## 1) DigitalOcean Spaces (recommended for uploads)

### Create a Space + bucket

- Create a Space in your preferred region (e.g. `sgp1`).
- Create a bucket (e.g. `restoreassist-prod`).
- Create Spaces access keys (Access Key + Secret).

### App environment variables

Set these env vars in your deployment environment (Vercel / App Platform / Droplet):

- `UPLOAD_PROVIDER=spaces`
- `DIGITALOCEAN_SPACES_REGION=sgp1`
- `DIGITALOCEAN_SPACES_BUCKET=restoreassist-prod`
- `DIGITALOCEAN_SPACES_KEY=...` (secret)
- `DIGITALOCEAN_SPACES_SECRET=...` (secret)
- Optional: `DIGITALOCEAN_SPACES_CDN_DOMAIN=restoreassist-prod.sgp1.cdn.digitaloceanspaces.com`

Uploads:
- `POST /api/upload` stores optimized WebP images in Spaces when `UPLOAD_PROVIDER=spaces` (or in production).
- `POST /api/upload/logo` stores logos in Spaces when `LOGO_UPLOAD_PROVIDER=spaces` (or `UPLOAD_PROVIDER=spaces`).

## 2) App Platform (Next.js via Dockerfile)

This repo includes an App Platform spec: `.do/app.yaml`.

Create the app (requires `doctl auth init`):

`doctl apps create --spec .do/app.yaml`

Then set the required secrets/vars in the App Platform UI (or via `doctl apps update`).

## 3) Droplet (Docker Compose)

If you want full control (and to run additional services/workers), deploy on a Droplet:

1. Create a Droplet (Ubuntu), install Docker + Docker Compose.
2. Copy your production env vars onto the droplet.
3. Run:
   - `docker compose --profile prod up -d --build`

To put it on `restoreassist.app`, update the DigitalOcean DNS `A` record to the droplet public IP and add TLS termination (Caddy/Nginx) in front of port `3000`.

