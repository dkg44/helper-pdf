# Helper PDF Reader

A **standalone, server-free** React Native / Expo PDF Reader app — built from the PDF module of UPSC Helper.

No backend required. All data (recent files, bookmarks, themes, Google Drive connections) is stored locally on-device.

---

## Features

| Feature | Details |
|---|---|
| 📄 **PDF Viewer** | PDF.js WebView renderer with canvas-based page-by-page virtual loading |
| 📝 **DOCX Support** | Word document rendering via Mammoth.js |
| 🔍 **In-PDF Search** | Full-text search with highlighted matches, prev/next navigation |
| 📑 **Document Outline** | Table of Contents panel from PDF metadata |
| 🔖 **Bookmarks** | Per-file bookmarks with page + notes, stored in AsyncStorage |
| 🕐 **Recent Files** | History of recently opened files |
| 📂 **File Picker** | Pick PDFs from device storage |
| ☁️ **Google Drive** | OAuth connect + shared folder browse, open Drive PDFs |
| 💾 **Offline Drive Cache** | Cache Google Drive PDFs locally for offline reading |
| 🔊 **Text-to-Speech** | Full TTS playback with voice selection, speed control |
| 🌙 **Reader Themes** | White, Sepia, Night, Forest, Dusk, App — with deep CSS filter |
| ⚡ **Pinch-to-Zoom** | Native 2-finger pinch + double-tap focal zoom |
| 🎯 **Page Jump** | Jump directly to any page number |
| 🔤 **Font Size** | Adjustable font size and line spacing for text mode |
| 📋 **Copy Text** | Copy extracted page text to clipboard |
| 📤 **Share PDF** | Native sharing via system sheet |
| 🌓 **App Themes** | Light, Dark, Midnight, Forest — persisted via AsyncStorage |
| 📱 **Nav Bar Safe** | Android 3-button nav bar aware safe insets |

---

## Project Structure

```
helperpdf/
├── App.tsx                        # Entry point
├── app.json                       # Expo config (bundle ID, permissions, intent filters)
├── src/
│   ├── assets/
│   │   ├── logo_light.png
│   │   └── logo_dark.png
│   ├── context/
│   │   └── ThemeContext.tsx       # Local-only theme (AsyncStorage, no server)
│   ├── hooks/
│   │   └── useNavBarSafe.ts       # Android 3-button nav bar safe padding
│   ├── screens/
│   │   └── PdfViewer.tsx          # Full PDF reader (5500+ lines, ported from UPSC Helper)
│   └── declarations.d.ts          # PNG / image type declarations
└── tsconfig.json
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- Expo CLI
- Android Studio / Xcode (for device builds)

### Install
```bash
cd helperpdf
npm install
```

### Run
```bash
# Expo Go (limited — Google Sign-In not available in Expo Go)
npm start

# Android device/emulator
npm run android

# iOS (macOS only)
npm run ios
```

---

## Configuration

### Google Drive OAuth
1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable the **Google Drive API**
3. Create OAuth 2.0 credentials (Android + iOS)
4. Add your iOS URL scheme in `app.json`:
   ```json
   ["@react-native-google-signin/google-signin", {
     "iosUrlScheme": "com.googleusercontent.apps.YOUR_CLIENT_ID"
   }]
   ```
5. Add `google-services.json` for Android to the root

### Bundle IDs
Edit `app.json` to set your own bundle identifiers:
- iOS: `com.dkwork.helperpdf`
- Android: `com.dkwork.helperpdf`

---

## What was removed vs UPSC Helper

| UPSC Helper Feature | Status in Helper PDF Reader |
|---|---|
| Authentication / Login | ❌ Removed — no server needed |
| AI OCR (server-side) | ❌ Removed — shows "not available" message |
| Course / Quiz modules | ❌ Not included |
| Notifications | ❌ Not included |
| Server API calls | ❌ All removed |
| Theme sync to server | ❌ Local only (AsyncStorage) |
| Google Drive browse | ✅ Kept — works standalone |
| Offline PDF cache | ✅ Kept |
| TTS / Bookmarks | ✅ Kept |
| All reader features | ✅ Fully ported |

---

## Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas build:configure

# Build APK for Android
eas build --platform android --profile preview

# Build for iOS
eas build --platform ios
```
