import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import {
  FileText,
  BookOpen,
  Image as ImageIcon,
  ScanLine,
  FilePlus,
  Type,
  ChevronRight,
  Search,
  Volume2,
  Bookmark,
  ZoomIn,
  Moon,
  Cloud,
  Zap,
  Minimize2,
  RefreshCw,
  Sparkles,
} from 'lucide-react-native';
import { ImageConvertMode } from './ImageConverterModal';
import { DocxMode } from './DocxConverterModal';

interface ConverterHubProps {
  primaryColor: string;
  isDark: boolean;
  onOpenScanner: () => void;
  onOpenImagesToPdf: () => void;
  onOpenTextToPdf: () => void;
  onOpenImageConverter: (mode: ImageConvertMode) => void;
  onOpenDocxConverter: (mode: DocxMode) => void;
  onOpenCompressPdf: () => void;
  onOpenDrive?: () => void;
  onOpenPdfToText?: () => void;
  onPickDocument: () => void;
}

export const ConverterHub: React.FC<ConverterHubProps> = ({
  primaryColor,
  isDark,
  onOpenScanner,
  onOpenImagesToPdf,
  onOpenTextToPdf,
  onOpenImageConverter,
  onOpenDocxConverter,
  onOpenCompressPdf,
  onOpenDrive,
  onOpenPdfToText,
  onPickDocument,
}) => {
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* ── 1. POPULAR QUICK ACTIONS ────────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: mutedColor }]}>🔥 POPULAR CONVERTERS & TOOLS</Text>
        <View style={styles.quickGrid}>
          {/* PDF to Word */}
          <TouchableOpacity
            onPress={() => onOpenDocxConverter('pdf_to_docx')}
            style={[styles.quickCard, { backgroundColor: '#2563eb12', borderColor: '#2563eb30' }]}
            activeOpacity={0.75}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: '#2563eb' }]}>
              <FileText size={20} color="#ffffff" />
            </View>
            <Text style={[styles.quickCardTitle, { color: textColor }]}>PDF to Word</Text>
            <Text style={[styles.quickCardSub, { color: mutedColor }]}>Editable .docx</Text>
          </TouchableOpacity>

          {/* Word to PDF */}
          <TouchableOpacity
            onPress={() => onOpenDocxConverter('docx_to_pdf')}
            style={[styles.quickCard, { backgroundColor: '#05966912', borderColor: '#05966930' }]}
            activeOpacity={0.75}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: '#059669' }]}>
              <BookOpen size={20} color="#ffffff" />
            </View>
            <Text style={[styles.quickCardTitle, { color: textColor }]}>Word to PDF</Text>
            <Text style={[styles.quickCardSub, { color: mutedColor }]}>DOCX to PDF</Text>
          </TouchableOpacity>

          {/* Compress PDF (Reduce Size) */}
          <TouchableOpacity
            onPress={onOpenCompressPdf}
            style={[styles.quickCard, { backgroundColor: '#dc262612', borderColor: '#dc262630' }]}
            activeOpacity={0.75}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: '#dc2626' }]}>
              <Minimize2 size={20} color="#ffffff" />
            </View>
            <Text style={[styles.quickCardTitle, { color: textColor }]}>Compress PDF</Text>
            <Text style={[styles.quickCardSub, { color: mutedColor }]}>Reduce MB size</Text>
          </TouchableOpacity>

          {/* JPG to PNG */}
          <TouchableOpacity
            onPress={() => onOpenImageConverter('jpg_to_png')}
            style={[styles.quickCard, { backgroundColor: '#8b5cf612', borderColor: '#8b5cf630' }]}
            activeOpacity={0.75}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: '#8b5cf6' }]}>
              <ImageIcon size={20} color="#ffffff" />
            </View>
            <Text style={[styles.quickCardTitle, { color: textColor }]}>JPG to PNG</Text>
            <Text style={[styles.quickCardSub, { color: mutedColor }]}>Lossless format</Text>
          </TouchableOpacity>

          {/* Compress & Resize Image */}
          <TouchableOpacity
            onPress={() => onOpenImageConverter('compress')}
            style={[styles.quickCard, { backgroundColor: '#10b98112', borderColor: '#10b98130' }]}
            activeOpacity={0.75}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: '#10b981' }]}>
              <RefreshCw size={20} color="#ffffff" />
            </View>
            <Text style={[styles.quickCardTitle, { color: textColor }]}>Resize Image</Text>
            <Text style={[styles.quickCardSub, { color: mutedColor }]}>Shrink KB / MB</Text>
          </TouchableOpacity>

          {/* Clear Scanner */}
          <TouchableOpacity
            onPress={onOpenScanner}
            style={[styles.quickCard, { backgroundColor: primaryColor + '12', borderColor: primaryColor + '30' }]}
            activeOpacity={0.75}
          >
            <View style={[styles.quickIconCircle, { backgroundColor: primaryColor }]}>
              <ScanLine size={20} color="#ffffff" />
            </View>
            <Text style={[styles.quickCardTitle, { color: textColor }]}>Clear Scan</Text>
            <Text style={[styles.quickCardSub, { color: mutedColor }]}>Batch & auto-crop</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 2. DOCUMENT & PDF CONVERTERS & SIZE REDUCERS ─── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: mutedColor }]}>📄 DOCUMENT CONVERTERS & SIZE REDUCERS</Text>
        <View style={styles.listCardGroup}>
          {/* Compress PDF */}
          <TouchableOpacity
            onPress={onOpenCompressPdf}
            style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.itemIconBox, { backgroundColor: '#dc262618' }]}>
              <Minimize2 size={20} color="#dc2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: textColor }]}>Compress & Reduce PDF Size</Text>
              <Text style={[styles.itemDesc, { color: mutedColor }]}>
                Shrink MB size for government portals, job applications & email
              </Text>
            </View>
            <ChevronRight size={18} color={mutedColor} />
          </TouchableOpacity>

          {/* PDF to Word */}
          <TouchableOpacity
            onPress={() => onOpenDocxConverter('pdf_to_docx')}
            style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.itemIconBox, { backgroundColor: '#2563eb18' }]}>
              <FileText size={20} color="#2563eb" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: textColor }]}>PDF to Word (.docx)</Text>
              <Text style={[styles.itemDesc, { color: mutedColor }]}>
                Export PDF pages to formatted Microsoft Word document
              </Text>
            </View>
            <ChevronRight size={18} color={mutedColor} />
          </TouchableOpacity>

          {/* Word to PDF */}
          <TouchableOpacity
            onPress={() => onOpenDocxConverter('docx_to_pdf')}
            style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.itemIconBox, { backgroundColor: '#05966918' }]}>
              <BookOpen size={20} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: textColor }]}>Word (.docx) to PDF</Text>
              <Text style={[styles.itemDesc, { color: mutedColor }]}>
                Render DOCX files into high quality vector PDF
              </Text>
            </View>
            <ChevronRight size={18} color={mutedColor} />
          </TouchableOpacity>

          {/* Text / Notes to PDF */}
          <TouchableOpacity
            onPress={onOpenTextToPdf}
            style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.itemIconBox, { backgroundColor: '#f59e0b18' }]}>
              <Type size={20} color="#f59e0b" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: textColor }]}>Text Notes to PDF</Text>
              <Text style={[styles.itemDesc, { color: mutedColor }]}>
                Format and compile typed notes or markdown to A4 PDF
              </Text>
            </View>
            <ChevronRight size={18} color={mutedColor} />
          </TouchableOpacity>

          {/* Images to PDF */}
          <TouchableOpacity
            onPress={onOpenImagesToPdf}
            style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.itemIconBox, { backgroundColor: '#8b5cf618' }]}>
              <FilePlus size={20} color="#8b5cf6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: textColor }]}>Images to PDF (Batch Scan)</Text>
              <Text style={[styles.itemDesc, { color: mutedColor }]}>
                Combine and enhance multiple photos into a single PDF
              </Text>
            </View>
            <ChevronRight size={18} color={mutedColor} />
          </TouchableOpacity>

          {/* PDF to Text */}
          {onOpenPdfToText ? (
            <TouchableOpacity
              onPress={onOpenPdfToText}
              style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
              activeOpacity={0.75}
            >
              <View style={[styles.itemIconBox, { backgroundColor: '#0ea5e918' }]}>
                <FileText size={20} color="#0ea5e9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: textColor }]}>PDF to Plain Text (.txt)</Text>
                <Text style={[styles.itemDesc, { color: mutedColor }]}>
                  Extract and export full plain text with word counter
                </Text>
              </View>
              <ChevronRight size={18} color={mutedColor} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* ── 3. IMAGE & MEDIA CONVERTERS & RESIZERS ─────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: mutedColor }]}>🖼️ IMAGE CONVERTERS & RESIZERS</Text>
        <View style={styles.listCardGroup}>
          {/* Compress & Resize Image */}
          <TouchableOpacity
            onPress={() => onOpenImageConverter('compress')}
            style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.itemIconBox, { backgroundColor: '#10b98118' }]}>
              <Minimize2 size={20} color="#10b981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: textColor }]}>Compress & Resize Image</Text>
              <Text style={[styles.itemDesc, { color: mutedColor }]}>
                Reduce MB size and scale dimensions (25%, 50%, 75%)
              </Text>
            </View>
            <ChevronRight size={18} color={mutedColor} />
          </TouchableOpacity>

          {/* JPG to PNG */}
          <TouchableOpacity
            onPress={() => onOpenImageConverter('jpg_to_png')}
            style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.itemIconBox, { backgroundColor: '#ec489918' }]}>
              <ImageIcon size={20} color="#ec4899" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: textColor }]}>JPG to PNG Converter</Text>
              <Text style={[styles.itemDesc, { color: mutedColor }]}>
                Convert JPG photos to lossless transparent PNG
              </Text>
            </View>
            <ChevronRight size={18} color={mutedColor} />
          </TouchableOpacity>

          {/* PNG to JPG */}
          <TouchableOpacity
            onPress={() => onOpenImageConverter('png_to_jpg')}
            style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.itemIconBox, { backgroundColor: '#f9731618' }]}>
              <RefreshCw size={20} color="#f97316" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: textColor }]}>PNG to JPG Converter</Text>
              <Text style={[styles.itemDesc, { color: mutedColor }]}>
                Convert PNG to standard JPEG with quality optimizer
              </Text>
            </View>
            <ChevronRight size={18} color={mutedColor} />
          </TouchableOpacity>

          {/* WebP to JPG / PNG */}
          <TouchableOpacity
            onPress={() => onOpenImageConverter('webp')}
            style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.itemIconBox, { backgroundColor: '#6366f118' }]}>
              <Zap size={20} color="#6366f1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: textColor }]}>WebP to JPG / PNG</Text>
              <Text style={[styles.itemDesc, { color: mutedColor }]}>
                Convert modern web images to universal formats
              </Text>
            </View>
            <ChevronRight size={18} color={mutedColor} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 4. READING & STUDY TOOLS ───────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: mutedColor }]}>📚 READING & STUDY TOOLS</Text>
        <View style={styles.listCardGroup}>
          {[
            {
              icon: <Search size={20} color={primaryColor} />,
              title: 'In-PDF Full Text Search',
              desc: 'Find keywords, quotes, and paragraphs across all pages',
              onPress: onPickDocument,
            },
            {
              icon: <Volume2 size={20} color="#8b5cf6" />,
              title: 'Text to Speech (TTS)',
              desc: 'Listen to textbooks with customizable voice and speed',
              onPress: onPickDocument,
            },
            {
              icon: <Bookmark size={20} color="#f59e0b" />,
              title: 'Bookmarks & Index',
              desc: 'Save reading positions and jump chapters with ease',
              onPress: onPickDocument,
            },
            {
              icon: <Moon size={20} color="#6366f1" />,
              title: 'Eye-Care Themes',
              desc: 'White, Sepia paper, OLED Deep Dark & Night Forest',
              onPress: onPickDocument,
            },
            {
              icon: <Cloud size={20} color="#0ea5e9" />,
              title: 'Google Drive Cloud Sync',
              desc: 'Stream, sync and read PDFs directly from Google Drive',
              onPress: onOpenDrive,
            },
          ].map((t, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={t.onPress}
              style={[styles.rowItem, { backgroundColor: cardBg, borderColor: border }]}
              activeOpacity={0.75}
            >
              <View style={[styles.itemIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                {t.icon}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: textColor }]}>{t.title}</Text>
                <Text style={[styles.itemDesc, { color: mutedColor }]}>{t.desc}</Text>
              </View>
              <ChevronRight size={18} color={mutedColor} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 22,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.9,
    paddingHorizontal: 4,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickCard: {
    width: '48.5%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  quickIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  quickCardSub: {
    fontSize: 11,
  },
  listCardGroup: {
    gap: 10,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  itemIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  itemDesc: {
    fontSize: 11,
    marginTop: 2,
  },
});
