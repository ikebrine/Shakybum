# Shakybum — Mobile Deployment Guide

Two things ship from this one codebase: a **PWA** (works on iOS + Android,
today, no store) and a **native Android APK** (via Capacitor, sideloadable,
no Play Store needed).

---

## 1. PWA — the primary distribution channel

This is already fully built and verified working (`npm run build` produces
`dist/` with a service worker + manifest — tested in this environment).

**To ship it:**
1. Deploy `dist/` to any static host — Vercel, Netlify, Cloudflare Pages,
   or GitHub Pages all have free tiers and take ~2 minutes.

   **Vercel specifically** (since `vercel.json` is already in the repo):
   ```bash
   npm install -g vercel   # if you don't have the CLI
   vercel login
   vercel --prod
   ```
   Or via the dashboard: [vercel.com/new](https://vercel.com/new) → Import
   this GitHub repo → it auto-detects the Vite framework and the settings
   in `vercel.json` (build command, output directory, SPA rewrites, PWA
   cache headers) — no manual config needed. Every push to `main`
   auto-deploys.

   One thing worth knowing about the `vercel.json` rewrite rule: it sends
   every route to `index.html` (this is a single-page app) **except**
   `/assets/*`, `/icons/*`, `sw.js`, `workbox-*.js`, and
   `manifest.webmanifest` — those need to be served as their actual files,
   not rewritten, or the service worker and PWA install prompt break.
2. Give people the URL. On iOS Safari: **Share → Add to Home Screen**. On
   Android Chrome: a native "Install app" banner appears automatically.
3. That's it — no app store review, no code signing, no waiting. Updates
   ship the instant you redeploy; users get them on next app open (the
   service worker auto-updates in the background).

**What works:** offline app shell, home-screen icon, full-screen (no browser
chrome), fast reloads from cache.
**What doesn't (iOS specifically):** push notifications are unreliable on
iOS PWAs even in 2026 — if push matters, that's a reason to lean on the
native Android APK + a future native iOS wrapper for that one feature.

---

## 2. Android APK — native wrapper via Capacitor

The native Android project is already scaffolded in `android/`. This
sandbox can install dependencies and run `npm run build` + `npx cap sync`,
but **cannot compile the final APK** — Gradle needs to download its
distribution from `services.gradle.org`, which isn't reachable from this
environment's network allowlist. You have two ways to finish the build:

### Option A — GitHub Actions (recommended, no local setup)
1. Push this project to a GitHub repo.
2. The included `.github/workflows/android-build.yml` runs automatically
   on push to `main` — it installs Node + JDK, builds the web app, syncs
   Capacitor, and runs Gradle in an environment with full internet access.
3. Download the built APK from the workflow run's **Artifacts** section.
4. This produces a **debug APK** — installable via sideload immediately,
   but not signed for release. See the note in that workflow file for
   adding a release signing config once you're ready to distribute more
   broadly.

### Option B — Local Android Studio
1. Install [Android Studio](https://developer.android.com/studio).
2. `npm install && npm run build && npx cap sync android`
3. `npx cap open android` — opens the project in Android Studio.
4. Build → Build Bundle(s)/APK(s) → Build APK(s).

### Installing the APK (no Play Store)
Since this isn't going through Play Store, users need to enable
**Settings → Security → Install unknown apps** for whatever app they
download the APK through (browser, file manager, etc.), then open the
`.apk` file directly. Worth including a short in-app or landing-page
walkthrough for this — it's the one extra step Android users aren't used
to anymore.

**Every time you update the app:** re-run `npm run build && npx cap sync
android` before rebuilding the APK — Capacitor copies the web build into
the native shell, it doesn't rebuild it automatically.

---

## 3. iOS — the honest picture

There is no equivalent of "sideload an APK" on iOS. Options, in order of
practicality:

| Option | Cost | Reach | Notes |
|---|---|---|---|
| **PWA (Section 1)** | Free | Anyone | Works today, zero friction, recommended default |
| **TestFlight** | $99/yr (Apple Developer Program) | Up to 10,000 testers | Still goes through Apple's pipeline but never appears on the public App Store. Realistic path if you want a "real app" on iOS without full App Store review. |
| **Ad-hoc distribution** | $99/yr + a Mac | Up to 100 registered devices/year | More manual (device UDIDs must be registered individually), rarely worth it over TestFlight |
| **AltStore / Sideloadly** | Free | Anyone, but apps expire every 7 days without a paid account | Fine for personal testing, not for shipping to real users |

**The native iOS project is already scaffolded** in `ios/` (via `npx cap add
ios`), with your real app icon (1024×1024, brand gradient) and a matching
splash screen already installed — same as Android. What's missing is
something this sandbox genuinely cannot provide: Xcode only runs on macOS,
so actually compiling it needs either a Mac you own, or cloud CI with macOS
runners.

**`.github/workflows/ios-build.yml`** is included and runs on GitHub's
macOS runners — as configured it builds an **unsigned Simulator build**
(good for verifying the project compiles at all, not installable on a real
device). To get a real TestFlight build out of that same workflow, you'll
need to:
1. Get an Apple Developer account ($99/yr)
2. Add your distribution certificate + provisioning profile as GitHub
   Actions secrets
3. Swap the simulator destination for a device build + add an export step
   (the workflow file has comments marking exactly where)

Codemagic and EAS Build are also worth a look if you'd rather not hand-roll
the signing setup in GitHub Actions — both specialize in exactly this
Mac-less iOS CI problem and have guided setup for App Store Connect API
keys instead of manual certificate wrangling.

**If/when you want native iOS beyond that:** the project's already there —
`npm run build && npx cap sync ios && npx cap open ios` opens it directly
in Xcode if you do have access to a Mac.

---

## Quick recap: what to actually do next

1. **Ship the PWA now** — it's built, tested, and works cross-platform today.
2. **Push to GitHub, let Actions build the Android APK** — gets you a real
   sideloadable file within minutes, no local Android Studio needed.
3. **iOS project is scaffolded and ready** (`ios/`, icon, splash, CI
   workflow all in place) — but stays a Simulator-only build until you get
   an Apple Developer account and wire up signing. Hold off on paying for
   that until the Android/PWA rollout tells you there's real iOS demand.
