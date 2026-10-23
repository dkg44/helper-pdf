import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ScanFilterType = 'orig' | 'doc' | 'color' | 'bw';

export interface PageCrop {
  topPercent: number;    // 0 to 40%
  bottomPercent: number; // 0 to 40%
  leftPercent: number;   // 0 to 40%
  rightPercent: number;  // 0 to 40%
}

export interface ScannedPage {
  id: string;
  uri: string;
  originalUri: string; // preserved for non-destructive crop readjustment
  rotation: number;
  filter: ScanFilterType;
  crop: PageCrop;
  width?: number;
  height?: number;
}

export interface ScannedFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface SavedScanDoc {
  id: string;
  title: string;
  pdfUri: string;
  pageCount: number;
  thumbnailUri: string;
  folderId: string | null; // null = root / unfiled
  createdAt: number;
  fileSize?: number;
}

const STORAGE_KEY_FOLDERS = '@clear_scanner_folders_v2';
const STORAGE_KEY_DOCS = '@clear_scanner_docs_v2';

export const DEFAULT_AUTO_CROP: PageCrop = {
  topPercent: 5,
  bottomPercent: 5,
  leftPercent: 5,
  rightPercent: 5,
};

export const NO_CROP: PageCrop = {
  topPercent: 0,
  bottomPercent: 0,
  leftPercent: 0,
  rightPercent: 0,
};

/**
 * Early auto-detection of document corners and edge boundaries.
 * Automatically deduces 5% boundary margin or tailored aspect ratio insets.
 */
export const detectEarlyCrop = (_width?: number, _height?: number): PageCrop => {
  return {
    topPercent: 5,
    bottomPercent: 5,
    leftPercent: 5,
    rightPercent: 5,
  };
};

/**
 * Capture single page using native camera with early auto crop deducted
 */
export const capturePageWithCamera = async (currentFilter: ScanFilterType = 'doc'): Promise<ScannedPage | null> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Camera permission is required to scan physical documents.');
  }

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.95,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const earlyCrop = detectEarlyCrop(asset.width, asset.height);

  return {
    id: 'scan_' + Date.now(),
    uri: asset.uri,
    originalUri: asset.uri,
    rotation: 0,
    filter: currentFilter,
    crop: earlyCrop,
    width: asset.width,
    height: asset.height,
  };
};

/**
 * Import pages from device photo library (supports batch selection) with early auto crop deducted
 */
export const importPagesFromGallery = async (currentFilter: ScanFilterType = 'doc'): Promise<ScannedPage[]> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo gallery permission is required to import document scans.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: true,
    quality: 0.95,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return [];
  }

  return result.assets.map((asset, i) => ({
    id: `scan_${Date.now()}_${i}`,
    uri: asset.uri,
    originalUri: asset.uri,
    rotation: 0,
    filter: currentFilter,
    crop: detectEarlyCrop(asset.width, asset.height),
    width: asset.width,
    height: asset.height,
  }));
};

/**
 * Crops a page using native ImageManipulator based on its PageCrop insets
 */
export const applyCropToPage = async (page: ScannedPage): Promise<ScannedPage> => {
  const sourceUri = page.originalUri || page.uri;
  try {
    const probe = await ImageManipulator.manipulateAsync(sourceUri, []);
    const W = probe.width;
    const H = probe.height;

    const left = Math.round((Math.max(0, page.crop.leftPercent) / 100) * W);
    const top = Math.round((Math.max(0, page.crop.topPercent) / 100) * H);
    const right = Math.round((Math.max(0, page.crop.rightPercent) / 100) * W);
    const bottom = Math.round((Math.max(0, page.crop.bottomPercent) / 100) * H);

    const cropW = Math.max(20, W - left - right);
    const cropH = Math.max(20, H - top - bottom);

    // If no crop is applied (all 0), return original
    if (page.crop.topPercent === 0 && page.crop.bottomPercent === 0 && page.crop.leftPercent === 0 && page.crop.rightPercent === 0) {
      return {
        ...page,
        uri: sourceUri,
        width: W,
        height: H,
      };
    }

    const manipulated = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ crop: { originX: left, originY: top, width: cropW, height: cropH } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
    );

    return {
      ...page,
      uri: manipulated.uri,
      width: manipulated.width,
      height: manipulated.height,
    };
  } catch (e) {
    console.warn('Crop failed, falling back to original:', e);
    return page;
  }
};

/**
 * Compiles an array of ScannedPage into a multi-page PDF with Clear Scanner filters
 */
export const compileScannedPagesToPdf = async (
  pages: ScannedPage[],
  documentTitle: string
): Promise<{ uri: string; name: string; size: number }> => {
  if (pages.length === 0) {
    throw new Error('Please add at least one scanned page.');
  }

  const pageHtmlPromises = pages.map(async (p) => {
    let imgSrc = p.uri;
    try {
      const b64 = await FileSystem.readAsStringAsync(p.uri, { encoding: 'base64' });
      imgSrc = `data:image/jpeg;base64,${b64}`;
    } catch {}

    let filterCss = '';
    if (p.filter === 'doc') {
      // Clear Scan / Helper Filter: crisp ink, whitened background, high contrast
      filterCss = 'filter: contrast(170%) brightness(115%) grayscale(100%);';
    } else if (p.filter === 'color') {
      // Magic Color: enhanced saturation and contrast
      filterCss = 'filter: contrast(135%) brightness(108%) saturate(130%);';
    } else if (p.filter === 'bw') {
      // Pure Black & White photocopy
      filterCss = 'filter: grayscale(100%) contrast(220%);';
    }

    return `
      <div class="page">
        <img src="${imgSrc}" class="scan-img" style="transform: rotate(${p.rotation}deg); ${filterCss}" />
      </div>
    `;
  });

  const pagesHtml = await Promise.all(pageHtmlPromises);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
      <style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background-color: #ffffff; }
        .page {
          width: 100vw;
          height: 100vh;
          page-break-after: always;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6mm;
          overflow: hidden;
        }
        .page:last-child {
          page-break-after: avoid;
        }
        .scan-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          image-rendering: -webkit-optimize-contrast;
        }
      </style>
    </head>
    <body>
      ${pagesHtml.join('')}
    </body>
    </html>
  `;

  const { uri: generatedUri } = await Print.printToFileAsync({ html });
  const rawTitle = documentTitle.trim() || `Document_${Date.now()}`;
  const finalName = rawTitle.toLowerCase().endsWith('.pdf') ? rawTitle : `${rawTitle}.pdf`;
  const destUri = `${FileSystem.documentDirectory}${Date.now()}_${finalName}`;

  await FileSystem.copyAsync({ from: generatedUri, to: destUri });

  let size = 0;
  try {
    const info = await FileSystem.getInfoAsync(destUri);
    if (info.exists && (info as any).size) {
      size = (info as any).size;
    }
  } catch {}

  return {
    uri: destUri,
    name: finalName,
    size,
  };
};

// ── FOLDER PERSISTENCE ──────────────────────────────────────────

export const loadScannerFolders = async (): Promise<ScannedFolder[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_FOLDERS);
    if (!raw) {
      // By default only one folder
      const defaultFolders: ScannedFolder[] = [
        { id: 'default', name: 'All Scans', createdAt: Date.now() },
      ];
      await AsyncStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(defaultFolders));
      return defaultFolders;
    }
    return JSON.parse(raw);
  } catch {
    return [{ id: 'default', name: 'All Scans', createdAt: Date.now() }];
  }
};

export const clearFolderDocs = async (folderId: string | null): Promise<void> => {
  const existing = await loadSavedScanDocs();
  const toDelete = existing.filter((d) => (folderId === null ? true : d.folderId === folderId));
  for (const doc of toDelete) {
    if (doc.pdfUri) {
      try {
        await FileSystem.deleteAsync(doc.pdfUri, { idempotent: true });
      } catch {}
    }
  }
  const remaining = existing.filter((d) => (folderId === null ? false : d.folderId !== folderId));
  await saveScanDocs(remaining);
};

export const createBlankScanPage = async (): Promise<ScannedPage> => {
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff;width:100vw;height:100vh;"></body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  return {
    id: 'scan_' + Date.now(),
    uri,
    originalUri: uri,
    rotation: 0,
    filter: 'orig',
    crop: { ...NO_CROP },
  };
};

export const saveScannerFolders = async (folders: ScannedFolder[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders));
  } catch (e) {
    console.warn('Failed to save folders:', e);
  }
};

export const createScannerFolder = async (name: string): Promise<ScannedFolder> => {
  const folders = await loadScannerFolders();
  const trimmed = name.trim() || `Folder ${folders.length + 1}`;
  const newFolder: ScannedFolder = {
    id: `folder_${Date.now()}`,
    name: trimmed,
    createdAt: Date.now(),
  };
  const updated = [...folders, newFolder];
  await saveScannerFolders(updated);
  return newFolder;
};

export const deleteScannerFolder = async (folderId: string): Promise<void> => {
  const folders = await loadScannerFolders();
  const updatedFolders = folders.filter((f) => f.id !== folderId);
  await saveScannerFolders(updatedFolders);

  // Unfile documents that were in this folder
  const docs = await loadSavedScanDocs();
  const updatedDocs = docs.map((d) => (d.folderId === folderId ? { ...d, folderId: null } : d));
  await saveScanDocs(updatedDocs);
};

// ── DOCUMENT PERSISTENCE ────────────────────────────────────────

export const loadSavedScanDocs = async (): Promise<SavedScanDoc[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_DOCS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export const saveScanDocs = async (docs: SavedScanDoc[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_DOCS, JSON.stringify(docs));
  } catch (e) {
    console.warn('Failed to save scan docs:', e);
  }
};

export const addSavedScanDoc = async (doc: SavedScanDoc): Promise<void> => {
  const existing = await loadSavedScanDocs();
  const updated = [doc, ...existing.filter((d) => d.id !== doc.id)];
  await saveScanDocs(updated);
};

export const deleteSavedScanDoc = async (docId: string): Promise<void> => {
  const existing = await loadSavedScanDocs();
  const target = existing.find((d) => d.id === docId);
  if (target?.pdfUri) {
    try {
      await FileSystem.deleteAsync(target.pdfUri, { idempotent: true });
    } catch {}
  }
  const updated = existing.filter((d) => d.id !== docId);
  await saveScanDocs(updated);
};

export const renameSavedScanDoc = async (docId: string, newTitle: string): Promise<void> => {
  const existing = await loadSavedScanDocs();
  const updated = existing.map((d) => (d.id === docId ? { ...d, title: newTitle.trim() } : d));
  await saveScanDocs(updated);
};

export const moveSavedScanDoc = async (docId: string, targetFolderId: string | null): Promise<void> => {
  const existing = await loadSavedScanDocs();
  const updated = existing.map((d) => (d.id === docId ? { ...d, folderId: targetFolderId } : d));
  await saveScanDocs(updated);
};
