# ImiTune Web

Search audio samples by audio imitation. Record up to 10 seconds, run an ONNX embedding model in the browser, send the embedding to an API (Vercel function) that queries Pinecone, and render the top Freesound results with the embedded player.

## Tech Overview

- React + Vite (TypeScript)
- Tailwind CSS (via `@tailwindcss/vite` plugin)
- onnxruntime-web for in-browser inference
- Serverless API (Vercel) queries Pinecone and returns top match URLs
- Deployed frontend: GitHub Pages

## Project Structure

- `src/components/Recorder.tsx`: Mic recording up to 10s
- `src/lib/audio/recorder.ts`: MediaRecorder wrapper
- `src/lib/model/embedding.ts`: ONNX session, audio preprocessing, embedding
- `src/lib/api/search.ts`: Client API to query matches
- `src/App.tsx`: UI wiring and results display

## Prerequisites

- Node 18+ (or 20+ recommended)
- A hosted ONNX model file compatible with your embedding interface
- A Vercel function endpoint that accepts `{ vector: number[] }` and returns `{ urls: string[] }`

## Quick Start (Local)

1. Install deps:

   ```bash
   npm install
   ```

2. Model file: either
   - Place your model at `public/model.onnx` and set `VITE_MODEL_URL=/model.onnx`, or
   - Host it (e.g., on a CDN) and set `VITE_MODEL_URL` to its full URL.

3. API URL: set your serverless endpoint URL in `VITE_API_URL`.

   Create `.env.local` in this directory:

   ```bash
   echo "VITE_API_URL=https://your-vercel-app.vercel.app/api/search" >> .env.local
   echo "VITE_MODEL_URL=/model.onnx" >> .env.local
   ```

4. Run dev server:

   ```bash
   npm run dev
   ```

5. Open the app at the printed URL (default `http://localhost:5173`).

## Building and Preview

```bash
npm run build
npm run preview
```

## Deploying to GitHub Pages

This app can be deployed to GitHub Pages. Common approaches:

- Use GitHub Actions to build and publish the `dist/` directory.
- Or use a manual flow: `npm run build`, then push `dist/` to `gh-pages` branch.

If your repo serves the site from a subpath (e.g., `/yourname/imitune-frontend/`), set Vite base in `vite.config.ts`:

```ts
export default defineConfig({
  base: '/your-repo-name/',
  plugins: [react(), tailwindcss()],
})
```

An example GitHub Actions workflow is committed at `.github/workflows/gh-pages.yml`. After pushing to `main`, enable Pages in your repo settings (Source: GitHub Actions) and set the custom domain/path as needed.

## Vercel Function (API) Shape

Expected POST body:

```json
{ "vector": [0.1, 0.2, ...] }
```

Expected response:

```json
{ "urls": ["https://freesound.org/people/...", "..."] }
```

The function should:
- Query Pinecone using the provided embedding
- Return the top 3 item URLs from your index metadata

## Notes on the ONNX Model

`src/lib/model/embedding.ts` assumes input names `{ audio, sample_rate }` and returns the first output tensor as the embedding. Adjust names/shapes as needed for your model.

## License

MIT
