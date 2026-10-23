# Helper PDF: Reader & Scanner

A **standalone, server-free** React Native / Expo PDF Reader & Document Scanner app.

No backend required. All data (recent files, bookmarks, themes, scanned folders, documents, and Google Drive connections) is processed and stored locally on-device.

---

## Features

| Feature | Details |
|---|---|
| 📄 **PDF Viewer** | PDF.js WebView renderer with canvas-based page-by-page virtual loading |
| 📷 **Document Scanner** | Multi-page camera scanner with live detection, flash, and grid guides |
| 🪪 **ID Card & Passport** | Automatic 2-step capture (Front + Back) merged into a single page PDF |
| 📐 **Corner Crop & Warp** | True 4-corner draggable loupe handles with real-time perspective correction |
| 🪄 **Magic Filters** | Clear Scan (Whitens paper & cleans shadows), Magic Color, B&W Photocopy |
| 🔄 **Multi-Page Reorder** | Reorder pages (`←` and `→`), rotate individual pages, add or delete pages |
| 👁️ **PDF Preview Box** | Instant PDF preview with page count, file size, and "Open in PDF Reader" button |
| 🔄 **Format Converter** | Convert PDF ⇄ DOCX, Image ⇄ PDF, JPG ⇄ PNG, WebP, Text to PDF |
| 📝 **DOCX Support** | Word document rendering via Mammoth.js |
| 🔍 **In-PDF Search** | Full-text search with highlighted matches, prev/next navigation |
| 📑 **Document Outline** | Table of Contents panel from PDF metadata |
| 🔖 **Bookmarks** | Per-file bookmarks with page + notes, stored in AsyncStorage |
| 📁 **Folders & All Scans** | Organize scans into custom folders with 3-dot menu (rename, move, delete) |
| 🕐 **Recent Files** | History of recently opened files |
| 📂 **File Picker** | Pick PDFs from device storage |
| ☁️ **Google Drive** | OAuth connect + shared folder browse, open Drive PDFs |
| 💾 **Offline Drive Cache** | Cache Google Drive PDFs locally for offline reading |
| 🔊 **Text-to-Speech** | Full TTS playback with voice selection, speed control |
| 🌙 **Reader Themes** | White, Sepia, Night, Forest, Dusk, App — with deep CSS filter |
| ⚡ **Pinch-to-Zoom** | Native 2-finger pinch + double-tap focal zoom |
| 🎯 **Page Jump** | Jump directly to any page number |
| 📤 **Share PDF** | Native sharing via system sheet |
| 🌓 **App Themes** | Light, Dark, Midnight, Forest — persisted via AsyncStorage |
| 📱 **Nav Bar Safe** | Android status bar & 3-button nav bar aware safe insets |

---

## Project Structure

```
helperpdf/
├── App.tsx                        # Entry point
├── app.json                       # Expo config (bundle ID, permissions, intent filters, plugins)
├── eas.json                       # EAS build configurations (production .aab & preview .apk)
├── src/
│   ├── assets/                    # App icons, splash, and logos
│   ├── components/
│   │   ├── ScannerStudio.tsx      # Multi-page scanner, folders, crop, and PDF preview
│   │   ├── LiveScannerCamera.tsx  # Native camera scanner (Document, ID Card, Passport)
│   │   └── ...                    # Modals for Compress, Convert, Drive, etc.
│   ├── services/
│   │   ├── scannerService.ts      # Page compilation, folder management, and image filters
│   │   ├── perspectiveService.tsx # WebGL perspective warp & ID card merger bridge
│   │   └── converterService.ts    # File format conversions (PDF, DOCX, TXT, Images)
│   └── screens/
│       └── PdfViewer.tsx          # Standalone PDF & audio reader
└── tsconfig.json
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- Android SDK (`ANDROID_HOME`) and OpenJDK 18+ (for local Android builds)

### Install Dependencies
```bash
npm install
```

### Run Locally (Development)
```bash
# Start Metro bundler
npx expo start

# Run on Android device / emulator
npx expo run:android
```

---

## 🚀 Building `.aab` & `.apk` for Android

The project is pre-configured with `eas.json` for generating production Android App Bundles (`.aab`) and installable `.apk` packages.

### Method 1: Build Locally on Your Laptop (Fastest)

Run these commands in your project terminal:

#### 1. Build Production `.aab` (For Google Play Store):
```bash
export ANDROID_HOME="$HOME/Android/Sdk"
npx eas-cli build --platform android --profile production --local --output ./helperpdf-release.aab
```
*Output:* Creates `helperpdf-release.aab` in your project root, signed and ready to upload to Google Play Console.

#### 2. Build Installable `.apk` (For testing on physical phones):
```bash
export ANDROID_HOME="$HOME/Android/Sdk"
npx eas-cli build --platform android --profile preview --local --output ./helperpdf-preview.apk
```
*Output:* Creates `helperpdf-preview.apk` that you can directly install on any Android phone.

---

### Method 2: Build in the Cloud with EAS

If you prefer building on Expo's cloud servers:

```bash
# 1. Log in to your Expo account
npx eas-cli login

# 2. Build .aab in cloud
npx eas-cli build -p android --profile production

# Or build .apk in cloud
npx eas-cli build -p android --profile preview
```

---

## 📲 Launching on Google Play Store (Step-by-Step)

1. **Sign in to Google Play Console**:
   - Go to [Google Play Console](https://play.google.com/console).

2. **Create New App**:
   - Click **Create app**.
   - **App name**: `Helper PDF: Reader & Scanner`
   - **Default language**: English
   - **App or Game**: App
   - **Free or Paid**: Free

3. **Complete App Content & Policies**:
   - Under **Policy and programs** → **App content**:
     - **Privacy Policy**: Provide your privacy policy URL (required for camera and storage permissions).
     - **App access**: Select *"All functionality is available without restrictions"*.
     - **Ads**: Select *"No, my app does not contain ads"*.
     - **Content rating**: Complete the questionnaire (Utility/Productivity tool → rated for Everyone).
     - **Target audience**: Select 18+ (or appropriate category).
     - **Data safety**: Declare that all documents and camera captures are processed locally on the user's device.

4. **Set Up Store Presence**:
   - Go to **Grow** → **Store presence** → **Main store listing**:
     - **Short description**: *Fast PDF reader, camera document scanner, OCR, and multi-format file converter.*
     - **Full description**: Detail all scanning features (clean borders, ID Card scanning, Magic Filter, PDF to Word conversion, Google Drive sync).
     - **App Icon**: 512 × 512 px PNG (found in `src/assets/icon.png`).
     - **Feature Graphic**: 1024 × 500 px banner.
     - **Screenshots**: Upload at least 2 phone screenshots of the reader and scanner.

5. **Upload `.aab` & Submit**:
   - Go to **Release** → **Production** (or **Closed testing**).
   - Click **Create new release**.
   - Upload the generated `helperpdf-release.aab` file.
   - Enter release notes (e.g. *Initial release of Helper PDF: Reader & Scanner*).
   - Click **Next** → **Save** → **Start rollout to Production**.
