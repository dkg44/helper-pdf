import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import {
  Document as DocxDocument,
  Packer as DocxPacker,
  Paragraph as DocxParagraph,
  TextRun as DocxTextRun,
  HeadingLevel as DocxHeadingLevel,
  AlignmentType as DocxAlignment,
} from 'docx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const shareFile = async (uri: string, mimeType: string, dialogTitle?: string) => {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: dialogTitle || 'Share converted file',
    });
  } else {
    throw new Error('Native file sharing is not supported on this device.');
  }
};

// ---------------------------------------------------------------------------
// 1. Image Converters (JPG ⇄ PNG, WebP, Compression & Resize)
// ---------------------------------------------------------------------------

export interface ImageConversionResult {
  uri: string;
  name: string;
  originalSize?: number;
  newSize?: number;
  width?: number;
  height?: number;
  format: 'png' | 'jpeg' | 'webp';
}

/**
 * Pick an image from photo library
 */
export const pickImageForConversion = async (): Promise<{ uri: string; name: string; size?: number } | null> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo library permission is required to select images.');
  }

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
  });

  if (res.canceled || !res.assets || res.assets.length === 0) return null;
  const asset = res.assets[0];
  const name = asset.fileName || `image_${Date.now()}.${asset.mimeType?.split('/')[1] || 'jpg'}`;
  return {
    uri: asset.uri,
    name,
    size: asset.fileSize,
  };
};

/**
 * Converts any JPG/JPEG/HEIC image to lossless PNG
 */
export const convertJpgToPng = async (sourceUri: string, originalName?: string): Promise<ImageConversionResult> => {
  let origSize = 0;
  try {
    const info = await FileSystem.getInfoAsync(sourceUri);
    if (info.exists && info.size) origSize = info.size;
  } catch {}

  const manipulated = await ImageManipulator.manipulateAsync(
    sourceUri,
    [],
    { format: ImageManipulator.SaveFormat.PNG }
  );

  const baseName = (originalName || 'image').replace(/\.[^/.]+$/, '');
  const finalName = `${baseName}_converted.png`;
  const destUri = `${FileSystem.documentDirectory}${Date.now()}_${finalName}`;

  await FileSystem.copyAsync({ from: manipulated.uri, to: destUri });

  let newSize = 0;
  try {
    const newInfo = await FileSystem.getInfoAsync(destUri);
    if (newInfo.exists && newInfo.size) newSize = newInfo.size;
  } catch {}

  return {
    uri: destUri,
    name: finalName,
    originalSize: origSize,
    newSize,
    width: manipulated.width,
    height: manipulated.height,
    format: 'png',
  };
};

/**
 * Converts PNG / WebP to JPG / JPEG with adjustable compression quality
 */
export const convertPngToJpg = async (
  sourceUri: string,
  quality: number = 0.92,
  originalName?: string
): Promise<ImageConversionResult> => {
  let origSize = 0;
  try {
    const info = await FileSystem.getInfoAsync(sourceUri);
    if (info.exists && info.size) origSize = info.size;
  } catch {}

  const manipulated = await ImageManipulator.manipulateAsync(
    sourceUri,
    [],
    { format: ImageManipulator.SaveFormat.JPEG, compress: Math.max(0.1, Math.min(1, quality)) }
  );

  const baseName = (originalName || 'image').replace(/\.[^/.]+$/, '');
  const finalName = `${baseName}_converted.jpg`;
  const destUri = `${FileSystem.documentDirectory}${Date.now()}_${finalName}`;

  await FileSystem.copyAsync({ from: manipulated.uri, to: destUri });

  let newSize = 0;
  try {
    const newInfo = await FileSystem.getInfoAsync(destUri);
    if (newInfo.exists && newInfo.size) newSize = newInfo.size;
  } catch {}

  return {
    uri: destUri,
    name: finalName,
    originalSize: origSize,
    newSize,
    width: manipulated.width,
    height: manipulated.height,
    format: 'jpeg',
  };
};

/**
 * Compress & Resize Image to reduce MB size for portals, forms, and email
 */
export const compressOrResizeImage = async (
  sourceUri: string,
  options: {
    scalePercent?: number; // 25, 50, 75, 100
    quality?: number;      // 0.4 to 0.95
    format?: 'jpeg' | 'png';
    originalName?: string;
  }
): Promise<ImageConversionResult> => {
  let origSize = 0;
  try {
    const info = await FileSystem.getInfoAsync(sourceUri);
    if (info.exists && info.size) origSize = info.size;
  } catch {}

  const format = options.format === 'png' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG;
  const compress = options.quality ?? 0.8;

  const actions: ImageManipulator.Action[] = [];
  if (options.scalePercent && options.scalePercent < 100) {
    // Read original dimensions first
    const probe = await ImageManipulator.manipulateAsync(sourceUri, []);
    const newWidth = Math.round((probe.width * options.scalePercent) / 100);
    const newHeight = Math.round((probe.height * options.scalePercent) / 100);
    actions.push({ resize: { width: newWidth, height: newHeight } });
  }

  const manipulated = await ImageManipulator.manipulateAsync(
    sourceUri,
    actions,
    { format, compress }
  );

  const ext = format === ImageManipulator.SaveFormat.PNG ? 'png' : 'jpg';
  const baseName = (options.originalName || 'photo').replace(/\.[^/.]+$/, '');
  const finalName = `${baseName}_optimized.${ext}`;
  const destUri = `${FileSystem.documentDirectory}${Date.now()}_${finalName}`;

  await FileSystem.copyAsync({ from: manipulated.uri, to: destUri });

  let newSize = 0;
  try {
    const newInfo = await FileSystem.getInfoAsync(destUri);
    if (newInfo.exists && newInfo.size) newSize = newInfo.size;
  } catch {}

  return {
    uri: destUri,
    name: finalName,
    originalSize: origSize,
    newSize,
    width: manipulated.width,
    height: manipulated.height,
    format: ext === 'png' ? 'png' : 'jpeg',
  };
};

// ---------------------------------------------------------------------------
// 2. Document Converters (PDF to DOCX, DOCX to PDF, Text Notes to PDF, PDF to TXT)
// ---------------------------------------------------------------------------

/**
 * Generate a styled Microsoft Word (.docx) file from extracted page texts
 */
export const generateDocxFromPages = async (
  documentTitle: string,
  pagesText: Array<{ page: number; text: string }> | Record<number, string>
): Promise<{ uri: string; name: string; size: number }> => {
  const title = (documentTitle || 'Document').replace(/\.pdf$/i, '').trim();

  // Normalize pages array
  const entries: Array<{ page: number; text: string }> = Array.isArray(pagesText)
    ? pagesText
    : Object.entries(pagesText).map(([p, text]) => ({ page: parseInt(p, 10), text }));

  entries.sort((a, b) => a.page - b.page);

  const docChildren: any[] = [];

  // Title Heading
  docChildren.push(
    new DocxParagraph({
      text: title,
      heading: DocxHeadingLevel.TITLE,
      alignment: DocxAlignment.CENTER,
      spacing: { after: 300 },
    })
  );

  // Subtitle metadata
  docChildren.push(
    new DocxParagraph({
      children: [
        new DocxTextRun({
          text: `Converted from PDF by Helper PDF Reader • ${new Date().toLocaleDateString()}`,
          italics: true,
          size: 18, // 9pt
          color: '64748B',
        }),
      ],
      alignment: DocxAlignment.CENTER,
      spacing: { after: 400 },
    })
  );

  if (entries.length === 0) {
    docChildren.push(
      new DocxParagraph({
        children: [new DocxTextRun({ text: 'No text extracted from document.', italics: true })],
      })
    );
  } else {
    entries.forEach((item, idx) => {
      // Page Subheading
      docChildren.push(
        new DocxParagraph({
          text: `— Page ${item.page} —`,
          heading: DocxHeadingLevel.HEADING_2,
          spacing: { before: idx > 0 ? 300 : 100, after: 150 },
        })
      );

      // Paragraphs for this page
      const paragraphs = item.text.split('\n\n').filter(p => p.trim().length > 0);
      if (paragraphs.length === 0) {
        docChildren.push(
          new DocxParagraph({
            children: [new DocxTextRun({ text: item.text.trim() || '[Empty Page]' })],
            spacing: { after: 160 },
          })
        );
      } else {
        paragraphs.forEach(para => {
          docChildren.push(
            new DocxParagraph({
              children: [
                new DocxTextRun({
                  text: para.replace(/\n/g, ' ').trim(),
                  size: 23, // ~11.5pt
                }),
              ],
              spacing: { after: 180, line: 320 },
            })
          );
        });
      }
    });
  }

  const doc = new DocxDocument({
    sections: [
      {
        properties: {},
        children: docChildren,
      },
    ],
  });

  const base64Str = await DocxPacker.toBase64String(doc);
  const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
  const finalName = `${cleanTitle}.docx`;
  const destUri = `${FileSystem.documentDirectory}${Date.now()}_${finalName}`;

  await FileSystem.writeAsStringAsync(destUri, base64Str, { encoding: 'base64' });

  let size = 0;
  try {
    const info = await FileSystem.getInfoAsync(destUri);
    if (info.exists && info.size) size = info.size;
  } catch {}

  return {
    uri: destUri,
    name: finalName,
    size,
  };
};

/**
 * Converts HTML content (e.g. from Mammoth DOCX renderer or rich text) into a real PDF file
 */
export const convertHtmlToPdf = async (
  htmlBody: string,
  documentTitle?: string
): Promise<{ uri: string; name: string }> => {
  const title = (documentTitle || 'Converted_Document').replace(/\.[^/.]+$/, '').trim();
  const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');

  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        @page { size: A4; margin: 18mm 16mm; }
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a;
          line-height: 1.65;
          margin: 0;
          padding: 0;
        }
        h1, h2, h3, h4 { color: #1e3a8a; margin-top: 20px; margin-bottom: 8px; font-weight: 700; }
        h1 { font-size: 24px; border-bottom: 2px solid #2563eb; padding-bottom: 6px; }
        p { margin: 0 0 14px 0; font-size: 14px; text-align: justify; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { border: 1px solid #cbd5e1; padding: 8px 12px; font-size: 13px; text-align: left; }
        th { background-color: #f1f5f9; font-weight: 600; }
        img { max-width: 100%; height: auto; margin: 12px 0; }
        .doc-footer {
          margin-top: 36px;
          padding-top: 8px;
          border-top: 1px solid #e2e8f0;
          font-size: 10px;
          color: #94a3b8;
          text-align: center;
        }
      </style>
    </head>
    <body>
      ${htmlBody}
      <div class="doc-footer">Generated by Helper PDF Reader • Converted Document</div>
    </body>
    </html>
  `;

  const { uri: generatedUri } = await Print.printToFileAsync({ html: fullHtml });
  const finalName = `${cleanTitle}.pdf`;
  const destUri = `${FileSystem.documentDirectory}${Date.now()}_${finalName}`;

  await FileSystem.copyAsync({ from: generatedUri, to: destUri });

  return {
    uri: destUri,
    name: finalName,
  };
};

/**
 * Converts user typed notes or formatted text to an A4 PDF document
 */
export const convertTextNotesToPdf = async (
  title: string,
  content: string,
  primaryColor: string = '#2563eb'
): Promise<{ uri: string; name: string }> => {
  const cleanTitle = (title.trim() || 'Untitled Note').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const paragraphs = content
    .split('\n\n')
    .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        @page { size: A4; margin: 20mm; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1e293b;
          line-height: 1.65;
          padding: 0;
          margin: 0;
        }
        .header {
          border-bottom: 2px solid ${primaryColor};
          padding-bottom: 12px;
          margin-bottom: 24px;
        }
        h1 {
          font-size: 26px;
          margin: 0 0 6px 0;
          color: #0f172a;
          font-weight: 800;
        }
        .meta {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }
        p {
          font-size: 14px;
          margin: 0 0 16px 0;
          color: #334155;
          text-align: justify;
        }
        .footer {
          margin-top: 40px;
          padding-top: 10px;
          border-top: 1px solid #e2e8f0;
          font-size: 10px;
          color: #94a3b8;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${title.trim() || 'Untitled Document'}</h1>
        <div class="meta">Created on ${dateStr} • Generated by Helper PDF Reader</div>
      </div>
      ${paragraphs}
      <div class="footer">Page 1 • Helper PDF Document Converter</div>
    </body>
    </html>
  `;

  const { uri: generatedUri } = await Print.printToFileAsync({ html });
  const finalName = `${cleanTitle}.pdf`;
  const destUri = `${FileSystem.documentDirectory}${Date.now()}_${finalName}`;

  await FileSystem.copyAsync({ from: generatedUri, to: destUri });

  return {
    uri: destUri,
    name: finalName,
  };
};

/**
 * Exports extracted PDF text into a clean .txt file
 */
export const exportPdfToTxt = async (
  title: string,
  pagesText: Array<{ page: number; text: string }> | Record<number, string>
): Promise<{ uri: string; name: string; fullText: string; charCount: number; wordCount: number }> => {
  const cleanTitle = (title.trim() || 'Extracted_Text').replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  const entries: Array<{ page: number; text: string }> = Array.isArray(pagesText)
    ? pagesText
    : Object.entries(pagesText).map(([p, text]) => ({ page: parseInt(p, 10), text }));

  entries.sort((a, b) => a.page - b.page);

  let fullText = `DOCUMENT: ${title}\nEXTRACTED BY: Helper PDF Reader\nDATE: ${new Date().toLocaleString()}\n` + '='.repeat(40) + '\n\n';

  entries.forEach(item => {
    fullText += `--- PAGE ${item.page} ---\n\n${item.text.trim()}\n\n`;
  });

  const finalName = `${cleanTitle}.txt`;
  const destUri = `${FileSystem.documentDirectory}${Date.now()}_${finalName}`;

  await FileSystem.writeAsStringAsync(destUri, fullText, { encoding: 'utf8' });

  const words = fullText.trim().split(/\s+/).filter(Boolean).length;
  const chars = fullText.length;

  return {
    uri: destUri,
    name: finalName,
    fullText,
    charCount: chars,
    wordCount: words,
  };
};
