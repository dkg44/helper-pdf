import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import {
  Camera,
  RotateCw,
  Trash2,
  Plus,
  FolderOpen,
  Wand2,
  CheckCircle2,
  FilePlus,
  ScanLine,
} from 'lucide-react-native';
import {
  ScannedPage,
  ScanFilterType,
  capturePageWithCamera,
  importPagesFromGallery,
  compileScannedPagesToPdf,
} from '../services/scannerService';

const { width: SCREEN_W } = Dimensions.get('window');

interface ScannerStudioProps {
  primaryColor: string;
  isDark: boolean;
  onOpenPdf: (uri: string, name: string) => Promise<void>;
  onClose?: () => void;
}

export const ScannerStudio: React.FC<ScannerStudioProps> = ({
  primaryColor,
  isDark,
  onOpenPdf,
  onClose,
}) => {
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [currentFilter, setCurrentFilter] = useState<ScanFilterType>('doc');
  const [docTitle, setDocTitle] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);

  const bg = isDark ? '#0b1120' : '#f8fafc';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  const selectedPage = pages[selectedIdx];

  const handleCaptureCamera = async () => {
    try {
      const page = await capturePageWithCamera(currentFilter);
      if (page) {
        setPages((prev) => {
          const updated = [...prev, page];
          setSelectedIdx(updated.length - 1);
          return updated;
        });
        if (!docTitle) {
          const now = new Date();
          setDocTitle(
            `Scan_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
              now.getDate()
            ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
              now.getMinutes()
            ).padStart(2, '0')}`
          );
        }
      }
    } catch (err: any) {
      Alert.alert('Camera Error', err?.message || 'Could not access camera.');
    }
  };

  const handleImportPhotos = async () => {
    try {
      const imported = await importPagesFromGallery(currentFilter);
      if (imported.length > 0) {
        setPages((prev) => {
          const updated = [...prev, ...imported];
          setSelectedIdx(updated.length - 1);
          return updated;
        });
        if (!docTitle) {
          const now = new Date();
          setDocTitle(
            `Scan_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
              now.getDate()
            ).padStart(2, '0')}`
          );
        }
      }
    } catch (err: any) {
      Alert.alert('Photo Error', err?.message || 'Could not import photos.');
    }
  };

  const handleRotateCurrent = () => {
    if (!pages.length) return;
    setPages((prev) =>
      prev.map((p, i) =>
        i === selectedIdx ? { ...p, rotation: (p.rotation + 90) % 360 } : p
      )
    );
  };

  const handleDeleteCurrent = () => {
    if (!pages.length) return;
    setPages((prev) => {
      const filtered = prev.filter((_, i) => i !== selectedIdx);
      if (selectedIdx >= filtered.length) {
        setSelectedIdx(Math.max(0, filtered.length - 1));
      }
      return filtered;
    });
  };

  const handleSetFilter = (filter: ScanFilterType) => {
    setCurrentFilter(filter);
    setPages((prev) => prev.map((p) => ({ ...p, filter })));
  };

  const handleCompile = async () => {
    if (pages.length === 0) {
      Alert.alert('No Pages', 'Please capture or import at least one page.');
      return;
    }
    setIsCompiling(true);
    try {
      const result = await compileScannedPagesToPdf(pages, docTitle);
      setPages([]);
      setDocTitle('');
      await onOpenPdf(result.uri, result.name);
    } catch (err: any) {
      Alert.alert('Compilation Failed', err?.message || 'Could not generate PDF.');
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Top Header Card */}
      <View style={[styles.headerCard, { backgroundColor: cardBg, borderColor: border }]}>
        <View style={styles.headerRow}>
          <View style={[styles.iconBox, { backgroundColor: primaryColor + '18' }]}>
            <ScanLine size={20} color={primaryColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: textColor }]}>
              Clear Document Scanner
            </Text>
            <Text style={[styles.headerSub, { color: mutedColor }]}>
              High-contrast text enhancement & multi-page scan
            </Text>
          </View>
          {pages.length > 0 && (
            <View style={[styles.badge, { backgroundColor: primaryColor + '20' }]}>
              <Text style={[styles.badgeText, { color: primaryColor }]}>
                {pages.length} {pages.length === 1 ? 'Page' : 'Pages'}
              </Text>
            </View>
          )}
        </View>

        {pages.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.inputLabel, { color: mutedColor }]}>DOCUMENT TITLE</Text>
            <TextInput
              value={docTitle}
              onChangeText={setDocTitle}
              placeholder="Enter document title..."
              placeholderTextColor={mutedColor}
              style={[
                styles.titleInput,
                {
                  color: textColor,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                  borderColor: border,
                },
              ]}
            />
          </View>
        )}
      </View>

      {/* Main Preview or Empty Placeholder */}
      {pages.length === 0 ? (
        <View style={[styles.emptyBox, { borderColor: border }]}>
          <View style={[styles.emptyIconCircle, { backgroundColor: primaryColor + '14' }]}>
            <Camera size={38} color={primaryColor} />
          </View>
          <Text style={[styles.emptyTitle, { color: textColor }]}>No Pages Scanned Yet</Text>
          <Text style={[styles.emptyDesc, { color: mutedColor }]}>
            Use native camera shutter to scan printed documents, book pages, receipts, or import photos.
          </Text>

          <View style={styles.emptyBtnRow}>
            <TouchableOpacity
              onPress={handleCaptureCamera}
              style={[styles.actionBtn, { backgroundColor: primaryColor }]}
              activeOpacity={0.8}
            >
              <Camera size={18} color="#ffffff" />
              <Text style={styles.actionBtnText}>Scan with Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleImportPhotos}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff',
                  borderColor: border,
                  borderWidth: 1,
                },
              ]}
              activeOpacity={0.8}
            >
              <FolderOpen size={18} color={textColor} />
              <Text style={[styles.actionBtnText, { color: textColor }]}>Import Photos</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.previewContainer}>
          {/* Page Image Preview */}
          <View style={[styles.previewFrame, { borderColor: border }]}>
            {selectedPage ? (
              <Image
                source={{ uri: selectedPage.uri }}
                style={[
                  styles.previewImage,
                  {
                    transform: [{ rotate: `${selectedPage.rotation}deg` }],
                    opacity: currentFilter === 'bw' ? 0.9 : 1,
                  },
                ]}
                resizeMode="contain"
              />
            ) : null}

            {/* In-Frame Action Badges (Rotate & Delete) */}
            <View style={styles.frameActions}>
              <TouchableOpacity
                onPress={handleRotateCurrent}
                style={[styles.floatingActionBtn, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
                activeOpacity={0.7}
              >
                <RotateCw size={17} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteCurrent}
                style={[styles.floatingActionBtn, { backgroundColor: 'rgba(239,68,68,0.85)' }]}
                activeOpacity={0.7}
              >
                <Trash2 size={17} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Current Page Indicator */}
            <View style={styles.pageIndicator}>
              <Text style={styles.pageIndicatorText}>
                Page {selectedIdx + 1} of {pages.length}
              </Text>
            </View>
          </View>

          {/* Filter Selector (Clear Scanner Filters) */}
          <View style={styles.filterBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Wand2 size={14} color={primaryColor} />
              <Text style={[styles.filterBarTitle, { color: mutedColor }]}>
                CLEAR SCANNER ENHANCEMENT
              </Text>
            </View>
            <View style={styles.filterChipRow}>
              {[
                { key: 'doc', label: 'Clear Scan', desc: 'Crisp Ink' },
                { key: 'color', label: 'Magic Color', desc: 'Vibrant' },
                { key: 'bw', label: 'B & W', desc: 'Photocopy' },
                { key: 'orig', label: 'Original', desc: 'Raw Photo' },
              ].map((f) => {
                const active = currentFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => handleSetFilter(f.key as ScanFilterType)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active
                          ? primaryColor
                          : isDark
                          ? 'rgba(255,255,255,0.06)'
                          : '#ffffff',
                        borderColor: active ? primaryColor : border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: active ? '#ffffff' : textColor, fontWeight: active ? '800' : '600' },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Horizontal Thumbnails Strip */}
          <View style={styles.thumbnailStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              <TouchableOpacity
                onPress={handleCaptureCamera}
                style={[styles.addPageBtn, { borderColor: primaryColor, backgroundColor: primaryColor + '10' }]}
              >
                <Camera size={18} color={primaryColor} />
                <Text style={[styles.addPageText, { color: primaryColor }]}>+ Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleImportPhotos}
                style={[
                  styles.addPageBtn,
                  { borderColor: border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' },
                ]}
              >
                <FolderOpen size={18} color={textColor} />
                <Text style={[styles.addPageText, { color: textColor }]}>+ Gallery</Text>
              </TouchableOpacity>

              {pages.map((p, i) => {
                const isSelected = i === selectedIdx;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setSelectedIdx(i)}
                    style={[
                      styles.thumbItem,
                      {
                        borderColor: isSelected ? primaryColor : border,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: p.uri }}
                      style={[styles.thumbImg, { transform: [{ rotate: `${p.rotation}deg` }] }]}
                      resizeMode="cover"
                    />
                    <View style={styles.thumbBadge}>
                      <Text style={styles.thumbBadgeText}>{i + 1}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Big Compile Action Button */}
          <TouchableOpacity
            onPress={handleCompile}
            disabled={isCompiling}
            style={[styles.compileBtn, { backgroundColor: primaryColor }]}
            activeOpacity={0.8}
          >
            {isCompiling ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <FilePlus size={20} color="#ffffff" />
                <Text style={styles.compileBtnText}>
                  Compile & Open {pages.length} {pages.length === 1 ? 'Page' : 'Pages'} as PDF
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  headerCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  inputLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  titleInput: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
    marginBottom: 20,
  },
  emptyBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  previewContainer: {
    gap: 14,
  },
  previewFrame: {
    height: 300,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  frameActions: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  floatingActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageIndicator: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pageIndicatorText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  filterBar: {
    paddingVertical: 4,
  },
  filterBarTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: 11.5,
  },
  thumbnailStrip: {
    paddingVertical: 4,
  },
  addPageBtn: {
    width: 72,
    height: 90,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPageText: {
    fontSize: 10,
    fontWeight: '700',
  },
  thumbItem: {
    width: 68,
    height: 90,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbBadgeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '800',
  },
  compileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 6,
  },
  compileBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
