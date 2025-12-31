# Smart Parking & Traffic Intelligence (Frontend)

React (Vite) single-page app for uploading videos, triggering analysis, and visualizing results.

## Setup

```bash
cd frontend
npm install
npm run dev
```

The dev server proxies API calls from `/api/*` to `http://localhost:8000`.
Run the backend with:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

## Logo

- Place your PNG logo at `frontend/public/traffic-jam-alert.png`.
- The header will automatically render it; if the file is missing the UI falls back to a chip with an emoji.

## Pages
- Home — project intro, pipeline overview, upload button.
- Upload — MP4 upload, preview, and "Analyze Traffic" action.
- Analysis — annotated video overlay, live vehicle count chart (raw + smoothed), congestion badge, parking recommendation, XAI explanation.
- Architecture — system diagram and explainability notes.
- Performance — advantages, limitations, future scope.

## Notes
- Styling via Bootstrap CDN; color-coded congestion badges.
- Charts via Recharts.
- The app stores the last uploaded server `video_path` in `localStorage` to streamline analysis.

## Firebase Integration (Optional)

Add Google Firebase to enable Google Sign-In and store chat messages in Firestore.

1) Install SDK

```bash
cd frontend
npm install firebase
```

2) Configure environment

Create `frontend/.env` with your Firebase app keys (use values from Firebase Console → Project Settings):

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
```

3) What it does

- Adds Google Sign-In button in the chat widget header.
- Saves chat messages to Firestore `chats` collection with fields: `uid`, `role`, `content`, `context`, `ts`.
- Non-blocking: if Firestore write fails, chat continues.

4) Backend token verification (advanced)

If you want to secure API calls with Firebase Auth tokens, set an `Authorization: Bearer <idToken>` header in the frontend and verify it in the FastAPI backend using `firebase-admin`. This project does not require it by default.
