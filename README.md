# Assassins - real multiplayer phone version

This version actually works across multiple phones.

It uses:
- React + Vite
- Firebase Realtime Database
- PWA install support
- Free hosting on Vercel or Netlify

## What changed

The old version only stored everything in one browser tab.
This version stores the room, players, targets, and kill feed in Firebase so every phone sees the same game live.

## 1) Create a free Firebase project

1. Go to Firebase and create a project
2. Add a **Web App** inside the project
3. Turn on **Realtime Database**
4. Start in **test mode** for now
5. Copy the Firebase config values

## 2) Add your env file

Copy `.env.example` to `.env` and paste your real values.

## 3) Database rules

In Firebase Realtime Database rules, use this simple starter setup:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

That is intentionally simple so you can get the game working fast.
For a private friend game, that is usually fine at small scale.
If you want, I can later tighten the rules for you.

## 4) Run locally

```bash
npm install
npm run dev
```

## 5) Deploy free

### Vercel

1. Push the project to GitHub
2. Import it into Vercel
3. Add the same `.env` values in Vercel project settings
4. Deploy

### Netlify

1. Push the project to GitHub
2. Import it into Netlify
3. Add the same env values in site settings
4. Deploy

## 6) Install on phones

### iPhone
Open in Safari -> Share -> Add to Home Screen

### Android
Open in Chrome -> menu -> Add to Home Screen

## Notes

- Everyone joins with the same room code
- The host starts the game once 3 or more people have joined
- Refreshing a phone keeps that player in the room because the app remembers the room in local storage
- Leaving the room only disconnects that phone locally; it does not remove the player from Firebase yet

## Next upgrades you may want

- remove players from room when they leave
- host kick button
- better anti-cheat / confirmation flow
- custom kill rules
- profile pictures or themes
