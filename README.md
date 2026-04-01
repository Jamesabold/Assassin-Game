# ☠ Assassins PWA

The real-world elimination game — installable on any phone.

---

## Deploy to Netlify (5 minutes, free)

### Step 1 — Push to GitHub
1. Go to [github.com](https://github.com) and create a free account if you don't have one
2. Click **New repository**, name it `assassins-game`, hit **Create**
3. Upload all these files by dragging them into the GitHub interface (or use Git CLI)

### Step 2 — Deploy on Netlify
1. Go to [netlify.com](https://netlify.com) and sign up free (use your GitHub account)
2. Click **Add new site → Import an existing project**
3. Choose **GitHub** and select your `assassins-game` repo
4. Set these build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Click **Deploy site**

That's it! Netlify gives you a URL like `https://assassins-game.netlify.app`

---

## Install on Phone (after deploying)

### iPhone
1. Open the URL in Safari
2. Tap the **Share** button (box with arrow)
3. Tap **Add to Home Screen**
4. Tap **Add** — done!

### Android
1. Open the URL in Chrome
2. Tap the **⋮ menu**
3. Tap **Add to Home screen**
4. Tap **Add** — done!

The app will appear on the home screen with the Assassins icon, no App Store needed.

---

## Run locally (optional)

```bash
npm install
npm run dev
```

Open http://localhost:5173
