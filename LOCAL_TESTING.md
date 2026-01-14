# Local Testing Guide

This guide will help you test the auto-submit feedback feature locally with full visibility into backend operations.

## Setup

### 1. Start the Backend Locally

```bash
cd imitune-backend
vercel dev
```

This will start the backend at `http://localhost:3000` and show you detailed console logs for all API requests, including:
- Rate limiting info
- Audio upload sizes
- Whether requests are updates (with audioId) or new submissions (with audioQuery)
- Blob storage operations
- Metadata creation

The console output will look like:
```
[Feedback] Request from IP: ::1, remaining: 9/10
[Feedback] Audio upload: 87.23KB, type: audio/webm
[Feedback] Attempting to upload audio file: feedback-audio-abc123.webm
[Feedback] Successfully uploaded audio to: https://...
[Feedback] Successfully uploaded metadata to: https://...
```

For updates, you'll see:
```
[Feedback] Update request for audioId: abc123-def456-...
[Feedback] Successfully uploaded metadata to: https://...
```

### 2. Configure Frontend to Use Local Backend

Update the Vite proxy to point to your local backend:

**Option A: Temporary (in terminal)**
```bash
cd ../web
VITE_BACKEND_BASE=http://localhost:3000 npm run dev
```

**Option B: Create a local env file**
```bash
cd ../web
echo "VITE_BACKEND_BASE=http://localhost:3000" > .env.local
npm run dev
```

The frontend will now be at `http://localhost:5173` and all API calls will go to your local backend.

### 3. Set Up Blob Storage Inspection

You have several options to inspect what's being sent to Vercel Blob:

#### Option 1: Console Logs (Easiest)
The backend already logs everything. Watch the `vercel dev` terminal for:
- Upload attempts
- File sizes
- URLs generated
- Metadata content

#### Option 2: Add Debug Logging to Backend

Edit `imitune-backend/api/feedback.js` to log the full request body:

```javascript
// Around line 30, after const { audioQuery, audioId, freesound_urls, ratings } = req.body;
console.log('[DEBUG] Full request body:', JSON.stringify({
  hasAudioQuery: !!audioQuery,
  audioId: audioId,
  freesound_urls: freesound_urls,
  ratings: ratings,
  audioSize: audioQuery ? Math.round((audioQuery.length * 3) / 4 / 1024) + 'KB' : 'N/A'
}, null, 2));
```

#### Option 3: Use Vercel Blob Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project (imitune-backend)
3. Go to Storage → Blob
4. You'll see all uploaded files in real-time with metadata

#### Option 4: Use the Download Script

After testing, download everything to inspect locally:

```bash
cd ../scripts
export BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..." # from .env.local
python download_feedback.py --output-dir ./test_data
```

This will show you exactly what's stored and how deduplication works.

## Testing Workflow

### Test 1: First Submission (with audio upload)

1. **Start both servers** (backend in one terminal, frontend in another)
2. **Open browser** to `http://localhost:5173`
3. **Open DevTools** (F12) → Network tab
4. **Record audio** and click "Search"
5. **Click a like/dislike button**
6. **Watch for:**
   - **Frontend DevTools Network**: POST to `/api/feedback` with `audioQuery` field
   - **Backend Console**: "Audio upload: XX.XXKB" message
   - **Backend Console**: "Successfully uploaded audio to: https://..."
   - **Backend Console**: Returns `audioId` in response

### Test 2: Update (audioId reference, no re-upload)

1. **Keep same session** (don't reload page)
2. **Click a different like/dislike** (or change existing one)
3. **Watch for:**
   - **Frontend DevTools Network**: POST to `/api/feedback` with `audioId` field (NO `audioQuery`)
   - **Backend Console**: "Update request for audioId: ..."
   - **Backend Console**: NO "Audio upload" message
   - **Backend Console**: Only metadata upload

### Test 3: New Query (resets audioId)

1. **Record new audio** and search
2. **Click like/dislike**
3. **Verify:**
   - New `audioQuery` is sent (full upload again)
   - New `audioId` is generated
   - Old `audioId` is forgotten

### Test 4: Verify Deduplication

1. **After testing** (make several like/dislike changes)
2. **Run download script:**
   ```bash
   cd scripts
   python download_feedback.py --output-dir ./test_data
   ```
3. **Check output:**
   - `consolidated/feedback_consolidated.json` should have ONE entry per unique audioId
   - Each entry should have the LATEST ratings you submitted
   - Check `isUpdate: true` flag for entries that were updated

## Inspecting Network Traffic

### Frontend → Backend Request

In browser DevTools → Network → Click the `/api/feedback` request → Payload tab:

**First submission:**
```json
{
  "audioQuery": "data:audio/webm;base64,GkXfo59C...",
  "freesound_urls": ["https://...", null, "https://..."],
  "ratings": ["like", null, "dislike"]
}
```

**Update:**
```json
{
  "audioId": "abc123-def456-...",
  "freesound_urls": ["https://...", null, "https://..."],
  "ratings": ["dislike", null, "like"]
}
```

### Backend → Vercel Blob

The backend console will show:
```
[Feedback] Attempting to upload audio file: feedback-audio-abc123.webm, size: 89234 bytes
[Feedback] Successfully uploaded audio to: https://abc123xyz.public.blob.vercel-storage.com/...
[Feedback] Successfully uploaded metadata to: https://abc123xyz.public.blob.vercel-storage.com/...
```

## Troubleshooting

### "Failed to submit ratings"
Check backend console for errors. Common issues:
- `BLOB_READ_WRITE_TOKEN` not set in `.env.local`
- Rate limit exceeded (10 per hour per IP)

### Frontend still hitting production backend
- Make sure you set `VITE_BACKEND_BASE=http://localhost:3000`
- Restart `npm run dev` after changing env vars
- Check DevTools Network tab - requests should go to `localhost:3000`

### Can't see blob files
- Files have random suffixes for security
- Use the download script to get everything
- Or check Vercel dashboard

### Changes to backend not reflecting
- Stop and restart `vercel dev`
- Backend uses ES modules, no hot reload on changes

## Quick Test Script

Here's a complete test in one go:

```bash
# Terminal 1: Backend
cd imitune-backend
vercel dev

# Terminal 2: Frontend  
cd web
VITE_BACKEND_BASE=http://localhost:3000 npm run dev

# Terminal 3: Watch in real-time
cd imitune-backend
tail -f .vercel/output/logs/api/feedback.log  # if logs are written to file

# Browser: http://localhost:5173
# 1. Record audio
# 2. Search
# 3. Click like → watch Terminal 1 for "Audio upload"
# 4. Click dislike (same result) → watch Terminal 1 for "Update request"
# 5. Record new audio, search, rate → watch for new "Audio upload"
```

## Cleanup

After testing:

```bash
# Download your test data
cd scripts
export BLOB_READ_WRITE_TOKEN="..." # from imitune-backend/.env.local
python download_feedback.py --output-dir ./test_feedback

# Optional: Delete test entries from blob storage
# Go to Vercel dashboard → Storage → Blob → Delete manually
# Or use Vercel CLI: vercel blob rm <url>
```

## Production Deployment

When ready to deploy your changes:

```bash
# Deploy backend
cd imitune-backend
vercel --prod

# Update frontend to use new backend URL (if needed)
cd ../web
# Update .env or GitHub secrets with new backend URL
# Then deploy frontend (GitHub Pages auto-deploys on push)
git add .
git commit -m "Add auto-submit feedback feature"
git push
```
