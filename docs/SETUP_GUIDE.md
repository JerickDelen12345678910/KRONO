# SETUP GUIDE — from zero to a running app (Windows / PowerShell)
Run **one command per line**. Lines starting with `#` are notes, not commands.

## Part 0 — Check requirements
```powershell
node -v      # need v20.19+ or v22.12+ (install the LTS from nodejs.org if lower)
npm -v
git --version
code --version
```
Also needed: Google Chrome, a Google account (Firebase). **Not needed yet:** Android Studio + JDK (Phases 5 and 13), Google Maps key (Phase 10).

## Part 1 — Create the React + Vite project (skip if it already exists)
```powershell
cd E:\Asus\Documents\FULLSTACK_PROJECTS
npm create vite@latest multi_purpose_app -- --template react
cd multi_purpose_app
npm install
```
If it asks questions: choose **JavaScript**, and say **No** to "install and start now".

## Part 2 — Install dependencies
```powershell
npm install bootstrap@5.3.9 bootstrap-icons@1.13.2 react-router-dom@6 recharts firebase
npm install -D sass
```
(Bootstrap = layout/reset/utilities, Sass = our SCSS design tokens, Recharts = line charts, Firebase = auth/database.)

## Part 3 — Folder structure
```powershell
New-Item -ItemType Directory -Force -Path src\components\layout, src\components\ui, src\contexts, src\pages, src\routes, src\styles, src\lib, src\hooks, docs | Out-Null
```

## Part 4 — Add the starter files
Copy `all-in-one-starter.zip` into the project folder, then:
```powershell
Expand-Archive -Path .\all-in-one-starter.zip -DestinationPath . -Force
Remove-Item src\App.jsx, src\App.css, src\index.css -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force src\assets -ErrorAction SilentlyContinue
Copy-Item .env.example .env
```
(`Copy-Item` creates your private `.env`; fill it later in Part 6.)

## Part 5 — Git (your safety net — also what lets another AI continue)
```powershell
git init
Add-Content .gitignore "`n.env`n.env.local"
git add .
git commit -m "phase 1+2: foundation, auth, design system"
```

## Part 6 — Firebase (Phase 2)
1. console.firebase.google.com → **Create project** → add a **Web app** → copy the 6 config values into `.env`.
2. **Authentication → Sign-in method → Google → Enable** (choose a support email).
3. **Firestore Database → Create** (location e.g. `asia-southeast1`, production mode) → **Rules** tab → paste `firestore.rules` → Publish.
4. Skip Storage for now (needs the paid Blaze plan; first needed in Phase 8).
5. Restart the dev server after editing `.env`.

## Part 7 — Run and verify
```powershell
npm run dev
npm run build
```
Open the link shown (usually http://localhost:5173). In Chrome press **F12 → Ctrl+Shift+M** (device toolbar):
- at **390px** you should see the status bar, bottom nav and stacked cards;
- at **1280px** the sidebar, search bar and two columns;
- toggle **Dark** (Account → Dark theme, or the header icon) — it must stay clean and readable.
Compare with `docs/design-preview.html`. Without `.env` keys the app shows a "Demo mode" banner — that is normal.

## Part 8 — Install later, per phase (don't pre-install)
| Phase | Likely packages / tools (confirm when you get there) |
|---|---|
| 3 | none |
| 4 | none (maybe a date helper) |
| 5, 13 | Android Studio + JDK, `@capacitor/core @capacitor/cli @capacitor/android` |
| 6 | `idb` (IndexedDB), `@capacitor-community/sqlite` |
| 8 | OCR library (decide then), Firebase Storage (Blaze plan) |
| 10 | Google Maps API key + a loader package |
| 12 | `vite-plugin-pwa` |

## Troubleshooting
- **"A positional parameter cannot be found"** → two commands were pasted on one line. One per line.
- **Blank page** → F12 → Console. Missing import or wrong file path is the usual cause.
- **Env values ignored** → names must start with `VITE_`; restart `npm run dev`.
- **Port already in use** → close the other terminal, or `npm run dev -- --port 5174`.
- **Google popup blocked** → allow popups for localhost.
- **Script running disabled** (rare) → `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
