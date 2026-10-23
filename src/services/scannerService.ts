import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

export type ScanFilterType = 'doc' | 'color' | 'bw' | 'orig';

export interface ScannedPage {
  id: string;
  uri: string;
  rotation: number;
  filter: ScanFilterType;
}

/**
 * Capture page using native camera
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

  return {
    id: 'scan_' + Date.now(),
    uri: result.assets[0].uri,
    rotation: 0,
    filter: currentFilter,
  };
};

/**
 * Import pages from device photo library
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
    rotation: 0,
    filter: currentFilter,
  }));
};

/**
 * Compiles an array of ScannedPage into a multi-page PDF with Clear Scanner filters
 */
export const compileScannedPagesToPdf = async (
  pages: ScannedPage[],
  documentTitle: string
): Promise<{ uri: string; name: string }> => {
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
      // Clear Scanner document mode: high contrast, brightened paper, crisp ink
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
  const rawTitle = documentTitle.trim() || `Scan_${Date.now()}`;
  const finalName = rawTitle.toLowerCase().endsWith('.pdf') ? rawTitle : `${rawTitle}.pdf`;
  const destUri = `${FileSystem.documentDirectory}${Date.now()}_${finalName}`;

  await FileSystem.copyAsync({ from: generatedUri, to: destUri });

  return {
    uri: destUri,
    name: finalName,
  };
};
