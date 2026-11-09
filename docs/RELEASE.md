# Release Guide & Exact Commands

This document outlines the standard release procedure for building, verifying, and publishing the **Washroom Safety Guardian** Android application using Expo Application Services (EAS).

---

## 1. Prerequisites

Ensure you have the EAS CLI installed globally and are authenticated with your Expo account:

```bash
# Install or update EAS CLI
npm install -g eas-cli

# Log in to your Expo account
eas login

# Verify who you are logged in as
eas whoami
```

---

## 2. Pre-Release Verification

Run the full validation suite locally before preparing a build:

```bash
# 1. Run TypeScript typecheck
node --stack-size=8192 app/node_modules/typescript/bin/tsc --noEmit -p app/tsconfig.json

# 2. Run Jest unit & integration tests
npm --prefix app test

# 3. Complete and sign off the QA checklist
# Review docs/QA_CHECKLIST.md
```

---

## 3. Version Bump & Changelog

When preparing a new release:
1. Update `version` in `app/app.json` (e.g., `"version": "1.0.1"`).
2. Document new features, bug fixes, and breaking changes in `CHANGELOG.md`.

*(Note: `versionCode` is automatically managed and incremented on EAS builds due to `"autoIncrement": true` in `eas.json`).*

---

## 4. Build Preview APK (Internal & Direct Testing)

To generate a standalone APK that can be installed directly on test Android devices without the Play Store:

```bash
# From the project root:
cd app
eas build --platform android --profile preview

# Or from the root directory:
eas build --platform android --profile preview
```

When the build completes, EAS provides a direct download link and QR code to download the `.apk` file.

---

## 5. Build Production AAB (Google Play Store)

To generate an Android App Bundle (`.aab`) optimized and signed for Google Play Store distribution:

```bash
cd app
eas build --platform android --profile production
```

EAS will:
- Increment the remote `versionCode`.
- Compile and bundle the application into an `.aab`.
- Sign the bundle with your managed Google Play keystore.

---

## 6. Submit to Google Play Store

Once the production build is complete, you can submit directly to the Google Play Console tracks (Internal Testing, Closed Alpha/Beta, or Production):

```bash
# Interactive submission:
cd app
eas submit --platform android --profile production

# Or manually:
# Download the .aab artifact from your Expo Dashboard (https://expo.dev)
# Navigate to Google Play Console -> Release -> Testing / Production -> Create new release -> Upload .aab
```

---

## 7. Tag the Git Release

Once validated and ready to publish:

```bash
# Create annotated git tag
git tag -a v1.0.1 -m "Release v1.0.1"

# Push tag to GitHub (Triggers .github/workflows/release-preview.yml)
git push origin v1.0.1
```

