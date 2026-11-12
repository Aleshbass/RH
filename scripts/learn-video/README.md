# Protected lesson videos (Rehabify Learn)

Paid lesson videos are stored encrypted (AES-128 HLS, 480p + 720p) in a private Cloudflare R2
bucket. A learner's player gets a 10-minute playback token from Convex after an enrolment check,
and the decryption key only comes from `/learn/video/key` with a valid token, for a lesson that
learner may watch, within a rate limit. A moving watermark with the learner's name and email sits
on the video and comes back if it's removed.

**What this does and doesn't do.** It stops casual downloading and sharing: there is no file to
save, links expire, and every view carries the viewer's name. It can't stop someone filming or
screen-recording the screen. That needs paid DRM, and even DRM only partly stops it.

## Publishing a video

**From the browser (normal way, works anywhere):** Admin › Learn › Courses › a course › Add a
lesson › Upload a video. The file goes straight to the private bucket. The encoder (Railway) turns
it into the protected stream and the lesson shows "Encoding…" until it's ready.

**From a laptop (backup, or without the encoder):**

```bash
npm run video:publish -- lesson.mp4
npm run video:publish -- lesson.mp4 --lesson <lessonId> --title "Knee assessment"
```

Needs ffmpeg (`winget install Gyan.FFmpeg` on Windows) and, in `.env.local`:

```
LEARN_VIDEO_WORKER_SECRET=...   (the same value as on Convex)
NEXT_PUBLIC_CONVEX_URL=...      (or LEARN_VIDEO_API_URL=https://<deployment>.convex.site)
```

Without `--lesson`, the video shows under "Or choose a video published from the laptop" in the
lesson drawer. Encoding runs one quality at a time with 2 threads, so it fits an 8 GB laptop
(about 0.7× the video's length on an i5-7200U).

## One-time setup

1. **R2 bucket** (`learn-videos`): no public access. Settings › CORS policy:

   ```json
   [
     {
       "AllowedOrigins": ["https://learn.physioaroundme.com", "https://physioaroundme.com", "https://admin.physioaroundme.com", "http://localhost:3000"],
       "AllowedMethods": ["GET", "HEAD", "PUT"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   PUT and ETag are for browser uploads; GET is for playback.
2. **R2 API token**: Object Read & Write, this bucket only.
3. **Convex env** (prod): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
   `LEARN_VIDEO_MASTER_KEY` (32 random bytes, base64), `LEARN_VIDEO_WORKER_SECRET`, and once the
   encoder runs, `LEARN_VIDEO_WORKER_URL`. Never print or commit these. Changing the master key
   makes every published video unplayable.
4. **Encoder on Railway** (for browser uploads): new service from this repo, Dockerfile path
   `services/learn-video-worker/Dockerfile`, env `LEARN_VIDEO_API_URL` (the `.convex.site` URL) and
   `LEARN_VIDEO_WORKER_SECRET`. Turn on "serverless" so it sleeps when idle; Convex wakes it after
   each upload.

## Tests

```bash
npm run test:video                      # signing (AWS vector), tokens, keys, 10-second encode
LEARN_VIDEO_TEST_SITE=http://127.0.0.1:3211 npm run test:video   # + HTTP access rules on a backend
```
