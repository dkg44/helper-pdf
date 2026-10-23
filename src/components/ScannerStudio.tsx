import React, { useState, useEffect, useRef } from 'react';
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
  Modal,
  Platform,
  PanResponder,
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
  Crop,
  Layers,
  Check,
  Sliders,
  Maximize2,
  RefreshCw,
  Sparkles,
  Share2,
  MoreVertical,
  Folder,
  ArrowLeft,
  Edit3,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Move,
  FolderPlus,
  SlidersHorizontal,
} from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ScannedPage,
  ScanFilterType,
  PageCrop,
  DEFAULT_AUTO_CROP,
  NO_CROP,
  ScannedFolder,
  SavedScanDoc,
  capturePageWithCamera,
  importPagesFromGallery,
  applyCropToPage,
  compileScannedPagesToPdf,
  loadScannerFolders,
  createScannerFolder,
  deleteScannerFolder,
  loadSavedScanDocs,
  addSavedScanDoc,
  deleteSavedScanDoc,
  renameSavedScanDoc,
  moveSavedScanDoc,
} from '../services/scannerService';

const { width: SCREEN_W } = Dimensions.get('window');

type StudioStage = 'folder_view' | 'border_adjust' | 'filter_enhance' | 'doc_detail';

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
}) => {
  // Navigation stage: 'folder_view' -> 'border_adjust' -> 'filter_enhance' -> 'doc_detail'
  const [stage, setStage] = useState<StudioStage>('folder_view');

  // Folders & Saved Documents state
  const [folders, setFolders] = useState<ScannedFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null); // null = All
  const [savedDocs, setSavedDocs] = useState<SavedScanDoc[]>([]);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Active scanning session state
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [currentFilter, setCurrentFilter] = useState<ScanFilterType>('doc');
  const [isBatchMode, setIsBatchMode] = useState(true);
  const [docTitle, setDocTitle] = useState('Document 1');
  const [isProcessing, setIsProcessing] = useState(false);

  // Active finished document for 'doc_detail'
  const [currentDoc, setCurrentDoc] = useState<SavedScanDoc | null>(null);

  // 3-dots menus & modals
  const [activeMenuDoc, setActiveMenuDoc] = useState<SavedScanDoc | null>(null);
  const [showDocMenuModal, setShowDocMenuModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [showDetailDotsMenu, setShowDetailDotsMenu] = useState(false);

  // Image Frame layout measurements for corner dragging
  const [frameLayout, setFrameLayout] = useState({ width: 300, height: 380, x: 0, y: 0 });

  const bg = isDark ? '#0b1120' : '#f8fafc';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  // Load saved folders and docs on mount
  useEffect(() => {
    loadFoldersAndDocs();
  }, []);

  const loadFoldersAndDocs = async () => {
    const loadedFolders = await loadScannerFolders();
    const loadedDocs = await loadSavedScanDocs();
    setFolders(loadedFolders);
    setSavedDocs(loadedDocs);
  };

  const selectedPage = pages[selectedIdx];

  // Filtered documents by active folder
  const displayedDocs = savedDocs.filter((d) => {
    if (selectedFolderId === null) return true;
    return d.folderId === selectedFolderId;
  });

  // ── Capture & Batch Scanning ────────────────────────────────
  const handleStartCamera = async () => {
    try {
      const page = await capturePageWithCamera(currentFilter);
      if (page) {
        setPages([page]);
        setSelectedIdx(0);
        const now = new Date();
        const autoName = `Doc_${now.getMonth() + 1}${now.getDate()}_${now.getHours()}${now.getMinutes()}`;
        setDocTitle(autoName);
        setStage('border_adjust');

        if (isBatchMode) {
          promptForNextBatchPage([page]);
        }
      }
    } catch (e: any) {
      Alert.alert('Camera', e?.message || 'Could not open camera.');
    }
  };

  const promptForNextBatchPage = (existingPages: ScannedPage[]) => {
    setTimeout(() => {
      Alert.alert(
        'Batch Mode Active',
        `Page ${existingPages.length} captured! Take another page or review border adjustments?`,
        [
          { text: 'Review Borders', style: 'cancel' },
          {
            text: '+ Next Page',
            onPress: async () => {
              const nextPage = await capturePageWithCamera(currentFilter);
              if (nextPage) {
                const combined = [...existingPages, nextPage];
                setPages(combined);
                setSelectedIdx(combined.length - 1);
                promptForNextBatchPage(combined);
              }
            },
          },
        ]
      );
    }, 350);
  };

  const handleImportGallery = async () => {
    try {
      const imported = await importPagesFromGallery(currentFilter);
      if (imported.length > 0) {
        setPages(imported);
        setSelectedIdx(0);
        const now = new Date();
        const autoName = `Document_${now.getMonth() + 1}${now.getDate()}_${now.getHours()}${now.getMinutes()}`;
        setDocTitle(autoName);
        setStage('border_adjust');
      }
    } catch (e: any) {
      Alert.alert('Gallery', e?.message || 'Could not import images.');
    }
  };

  // ── Draggable Corner Adjustments ────────────────────────────
  const updateCropPercent = (edge: 'top' | 'bottom' | 'left' | 'right', delta: number) => {
    if (!selectedPage) return;
    const current = selectedPage.crop;
    const key = `${edge}Percent` as keyof PageCrop;
    const newVal = Math.max(0, Math.min(38, current[key] + delta));
    const updatedCrop = { ...current, [key]: newVal };
    setPages((prev) =>
      prev.map((p, i) => (i === selectedIdx ? { ...p, crop: updatedCrop } : p))
    );
  };

  const setCropPreset = (preset: 'auto' | 'full' | 'deep') => {
    if (!selectedPage) return;
    let newCrop: PageCrop;
    if (preset === 'auto') newCrop = { ...DEFAULT_AUTO_CROP };
    else if (preset === 'deep') newCrop = { topPercent: 8, bottomPercent: 8, leftPercent: 8, rightPercent: 8 };
    else newCrop = { ...NO_CROP };

    setPages((prev) =>
      prev.map((p, i) => (i === selectedIdx ? { ...p, crop: newCrop } : p))
    );
  };

  const handleRotateCurrent = () => {
    if (!pages.length) return;
    setPages((prev) =>
      prev.map((p, i) => (i === selectedIdx ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    );
  };

  // ── STEP 1 -> STEP 2 (Border Adjustment -> Filter) ──────────
  const handleProceedToFilters = async () => {
    if (!pages.length) return;
    setIsProcessing(true);
    try {
      // Apply crop to current or all pages
      const croppedPages = await Promise.all(pages.map((p) => applyCropToPage(p)));
      setPages(croppedPages);
      setStage('filter_enhance');
    } catch (e: any) {
      Alert.alert('Processing', e?.message || 'Failed to crop document.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── STEP 2 -> STEP 3 (Filter -> Document Detail & PDF) ──────
  const handleConfirmAndCreateDoc = async () => {
    if (!pages.length) return;
    setIsProcessing(true);
    try {
      const result = await compileScannedPagesToPdf(pages, docTitle);
      const newSavedDoc: SavedScanDoc = {
        id: `doc_${Date.now()}`,
        title: docTitle.trim() || result.name.replace(/\.pdf$/i, ''),
        pdfUri: result.uri,
        pageCount: pages.length,
        thumbnailUri: pages[0]?.uri || '',
        folderId: selectedFolderId,
        createdAt: Date.now(),
        fileSize: result.size,
      };

      await addSavedScanDoc(newSavedDoc);
      await loadFoldersAndDocs();
      setCurrentDoc(newSavedDoc);
      setStage('doc_detail');
    } catch (e: any) {
      Alert.alert('Compilation Failed', e?.message || 'Could not compile PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Folder Actions ──────────────────────────────────────────
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const created = await createScannerFolder(newFolderName.trim());
      setFolders((prev) => [...prev, created]);
      setSelectedFolderId(created.id);
      setNewFolderName('');
      setShowNewFolderModal(false);
    } catch (e: any) {
      Alert.alert('Error', 'Could not create folder.');
    }
  };

  // ── Document 3-Dots Actions ─────────────────────────────────
  const handleShareDoc = async (doc: SavedScanDoc) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(doc.pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share ${doc.title}`,
        });
      } else {
        Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device.');
      }
    } catch (e: any) {
      Alert.alert('Share Error', e?.message || 'Could not share file.');
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    Alert.alert('Delete Scan', 'Are you sure you want to delete this scanned PDF?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSavedScanDoc(docId);
          await loadFoldersAndDocs();
          setShowDocMenuModal(false);
          if (stage === 'doc_detail') {
            setStage('folder_view');
          }
        },
      },
    ]);
  };

  const handleExecuteRename = async () => {
    if (!activeMenuDoc || !renameText.trim()) return;
    await renameSavedScanDoc(activeMenuDoc.id, renameText.trim());
    await loadFoldersAndDocs();
    if (currentDoc && currentDoc.id === activeMenuDoc.id) {
      setCurrentDoc({ ...currentDoc, title: renameText.trim() });
    }
    setShowRenameModal(false);
    setShowDocMenuModal(false);
  };

  const handleExecuteMove = async (folderId: string | null) => {
    if (!activeMenuDoc) return;
    await moveSavedScanDoc(activeMenuDoc.id, folderId);
    await loadFoldersAndDocs();
    setShowMoveModal(false);
    setShowDocMenuModal(false);
  };

  // ═════════════════════════════════════════════════════════════
  // STAGE 1: FOLDER VIEW & SCANNER HOME
  // ═════════════════════════════════════════════════════════════
  if (stage === 'folder_view') {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        {/* Top Header */}
        <View style={[styles.folderHeader, { backgroundColor: cardBg, borderColor: border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIconBox, { backgroundColor: primaryColor + '18' }]}>
              <ScanLine size={20} color={primaryColor} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: textColor }]}>Clear Document Scanner</Text>
              <Text style={[styles.headerSub, { color: mutedColor }]}>
                {displayedDocs.length} {displayedDocs.length === 1 ? 'Document' : 'Documents'} • Cloud & Local
              </Text>
            </View>
          </View>

          {/* Batch Mode Toggle */}
          <TouchableOpacity
            onPress={() => setIsBatchMode(!isBatchMode)}
            style={[
              styles.batchToggle,
              { backgroundColor: isBatchMode ? primaryColor : (isDark ? '#1e293b' : '#e2e8f0') },
            ]}
            activeOpacity={0.8}
          >
            <Layers size={12} color={isBatchMode ? '#ffffff' : mutedColor} />
            <Text style={[styles.batchToggleText, { color: isBatchMode ? '#ffffff' : mutedColor }]}>
              {isBatchMode ? 'Batch ON' : 'Single'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Folder Tabs Horizontal Scroll */}
        <View style={[styles.folderBarWrap, { borderColor: border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderTabs}>
            <TouchableOpacity
              onPress={() => setSelectedFolderId(null)}
              style={[
                styles.folderChip,
                {
                  backgroundColor: selectedFolderId === null ? primaryColor : cardBg,
                  borderColor: selectedFolderId === null ? primaryColor : border,
                },
              ]}
            >
              <Folder size={14} color={selectedFolderId === null ? '#ffffff' : textColor} />
              <Text
                style={[
                  styles.folderChipText,
                  { color: selectedFolderId === null ? '#ffffff' : textColor },
                ]}
              >
                All Documents
              </Text>
            </TouchableOpacity>

            {folders.map((f) => {
              const isSelected = selectedFolderId === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => setSelectedFolderId(f.id)}
                  style={[
                    styles.folderChip,
                    {
                      backgroundColor: isSelected ? primaryColor : cardBg,
                      borderColor: isSelected ? primaryColor : border,
                    },
                  ]}
                >
                  <Folder size={14} color={isSelected ? '#ffffff' : textColor} />
                  <Text
                    style={[
                      styles.folderChipText,
                      { color: isSelected ? '#ffffff' : textColor },
                    ]}
                  >
                    {f.name}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* + New Folder Chip */}
            <TouchableOpacity
              onPress={() => setShowNewFolderModal(true)}
              style={[styles.folderChip, styles.newFolderChip, { borderColor: primaryColor }]}
            >
              <FolderPlus size={14} color={primaryColor} />
              <Text style={[styles.folderChipText, { color: primaryColor, fontWeight: '700' }]}>
                + Folder
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Documents List */}
        <ScrollView contentContainerStyle={styles.docListScroll} showsVerticalScrollIndicator={false}>
          {displayedDocs.length === 0 ? (
            <View style={[styles.emptyStudioBox, { borderColor: border }]}>
              <View style={[styles.emptyIconCircle, { backgroundColor: primaryColor + '14' }]}>
                <Camera size={36} color={primaryColor} />
              </View>
              <Text style={[styles.emptyTitle, { color: textColor }]}>No Scans in this Folder</Text>
              <Text style={[styles.emptyDesc, { color: mutedColor }]}>
                Capture documents with the camera or import multi-page photos. Auto-border detection, ink filters, and multi-folder organization.
              </Text>
            </View>
          ) : (
            displayedDocs.map((doc) => (
              <View
                key={doc.id}
                style={[styles.docCard, { backgroundColor: cardBg, borderColor: border }]}
              >
                {/* Thumbnail */}
                <TouchableOpacity
                  onPress={() => onOpenPdf(doc.pdfUri, `${doc.title}.pdf`)}
                  style={styles.docThumbBox}
                  activeOpacity={0.8}
                >
                  {doc.thumbnailUri ? (
                    <Image source={{ uri: doc.thumbnailUri }} style={styles.docThumbImg} resizeMode="cover" />
                  ) : (
                    <FileText size={22} color="#dc2626" />
                  )}
                  <View style={styles.pdfBadge}>
                    <Text style={styles.pdfBadgeText}>PDF</Text>
                  </View>
                </TouchableOpacity>

                {/* Info */}
                <TouchableOpacity
                  onPress={() => onOpenPdf(doc.pdfUri, `${doc.title}.pdf`)}
                  style={{ flex: 1, paddingVertical: 4 }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.docCardTitle, { color: textColor }]} numberOfLines={1}>
                    {doc.title}
                  </Text>
                  <Text style={[styles.docCardSub, { color: mutedColor }]}>
                    {doc.pageCount} {doc.pageCount === 1 ? 'Page' : 'Pages'} • {new Date(doc.createdAt).toLocaleDateString()}
                    {doc.fileSize ? ` • ${(doc.fileSize / 1024).toFixed(0)} KB` : ''}
                  </Text>
                </TouchableOpacity>

                {/* 3-Dots Button */}
                <TouchableOpacity
                  onPress={() => {
                    setActiveMenuDoc(doc);
                    setShowDocMenuModal(true);
                  }}
                  style={styles.threeDotBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MoreVertical size={18} color={mutedColor} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>

        {/* Floating Scan Action Bar at Bottom */}
        <View style={[styles.floatingBottomBar, { backgroundColor: bg }]}>
          <TouchableOpacity
            onPress={handleStartCamera}
            style={[styles.mainScanBtn, { backgroundColor: primaryColor }]}
            activeOpacity={0.85}
          >
            <Camera size={20} color="#ffffff" />
            <Text style={styles.mainScanBtnText}>
              {isBatchMode ? 'Batch Camera Scan' : 'Scan Page'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleImportGallery}
            style={[
              styles.galleryBtn,
              { backgroundColor: cardBg, borderColor: border, borderWidth: 1 },
            ]}
            activeOpacity={0.85}
          >
            <FolderOpen size={18} color={textColor} />
            <Text style={[styles.galleryBtnText, { color: textColor }]}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {/* ── Modal: 3-Dots Menu (Preview, Share, Rename, Move, Delete) ── */}
        <Modal
          visible={showDocMenuModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDocMenuModal(false)}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowDocMenuModal(false)}
          >
            <View style={[styles.actionSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.sheetTitle, { color: textColor }]}>
                {activeMenuDoc?.title}
              </Text>

              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => {
                  if (activeMenuDoc) {
                    setShowDocMenuModal(false);
                    onOpenPdf(activeMenuDoc.pdfUri, `${activeMenuDoc.title}.pdf`);
                  }
                }}
              >
                <Eye size={18} color={primaryColor} />
                <Text style={[styles.sheetOptionText, { color: textColor }]}>Preview / Open PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => {
                  if (activeMenuDoc) {
                    setShowDocMenuModal(false);
                    handleShareDoc(activeMenuDoc);
                  }
                }}
              >
                <Share2 size={18} color="#059669" />
                <Text style={[styles.sheetOptionText, { color: textColor }]}>Share File</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => {
                  if (activeMenuDoc) {
                    setRenameText(activeMenuDoc.title);
                    setShowRenameModal(true);
                  }
                }}
              >
                <Edit3 size={18} color="#2563eb" />
                <Text style={[styles.sheetOptionText, { color: textColor }]}>Rename</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => setShowMoveModal(true)}
              >
                <Move size={18} color="#d97706" />
                <Text style={[styles.sheetOptionText, { color: textColor }]}>Move to Folder</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sheetOption, { borderTopWidth: 1, borderTopColor: border, marginTop: 4 }]}
                onPress={() => {
                  if (activeMenuDoc) {
                    handleDeleteDoc(activeMenuDoc.id);
                  }
                }}
              >
                <Trash2 size={18} color="#ef4444" />
                <Text style={[styles.sheetOptionText, { color: '#ef4444' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Modal: Create New Folder ── */}
        <Modal
          visible={showNewFolderModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNewFolderModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.dialogBox, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
              <Text style={[styles.dialogTitle, { color: textColor }]}>Create New Folder</Text>
              <TextInput
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="Folder name (e.g. Work, Taxes)..."
                placeholderTextColor={mutedColor}
                style={[
                  styles.dialogInput,
                  { color: textColor, borderColor: border, backgroundColor: isDark ? '#0f172a' : '#f8fafc' },
                ]}
                autoFocus
              />
              <View style={styles.dialogButtons}>
                <TouchableOpacity
                  onPress={() => setShowNewFolderModal(false)}
                  style={[styles.dialogBtn, { borderColor: border, borderWidth: 1 }]}
                >
                  <Text style={{ color: mutedColor, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreateFolder}
                  style={[styles.dialogBtn, { backgroundColor: primaryColor }]}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '700' }}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Modal: Rename Document ── */}
        <Modal
          visible={showRenameModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRenameModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.dialogBox, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
              <Text style={[styles.dialogTitle, { color: textColor }]}>Rename PDF Document</Text>
              <TextInput
                value={renameText}
                onChangeText={setRenameText}
                placeholder="Document title..."
                placeholderTextColor={mutedColor}
                style={[
                  styles.dialogInput,
                  { color: textColor, borderColor: border, backgroundColor: isDark ? '#0f172a' : '#f8fafc' },
                ]}
                autoFocus
              />
              <View style={styles.dialogButtons}>
                <TouchableOpacity
                  onPress={() => setShowRenameModal(false)}
                  style={[styles.dialogBtn, { borderColor: border, borderWidth: 1 }]}
                >
                  <Text style={{ color: mutedColor, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleExecuteRename}
                  style={[styles.dialogBtn, { backgroundColor: primaryColor }]}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '700' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Modal: Move Document to Folder ── */}
        <Modal
          visible={showMoveModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMoveModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.dialogBox, { backgroundColor: isDark ? '#1e293b' : '#ffffff', maxHeight: 380 }]}>
              <Text style={[styles.dialogTitle, { color: textColor }]}>Move to Folder</Text>
              <ScrollView style={{ marginVertical: 12 }}>
                <TouchableOpacity
                  style={[
                    styles.moveFolderOption,
                    { borderBottomColor: border, borderBottomWidth: 1 },
                  ]}
                  onPress={() => handleExecuteMove(null)}
                >
                  <Folder size={18} color={primaryColor} />
                  <Text style={[styles.moveFolderText, { color: textColor }]}>
                    All Documents (Unfiled)
                  </Text>
                </TouchableOpacity>
                {folders.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[
                      styles.moveFolderOption,
                      { borderBottomColor: border, borderBottomWidth: 1 },
                    ]}
                    onPress={() => handleExecuteMove(f.id)}
                  >
                    <Folder size={18} color="#059669" />
                    <Text style={[styles.moveFolderText, { color: textColor }]}>{f.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                onPress={() => setShowMoveModal(false)}
                style={[styles.dialogBtn, { borderColor: border, borderWidth: 1, alignSelf: 'stretch' }]}
              >
                <Text style={{ color: mutedColor, fontWeight: '600', textAlign: 'center' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ═════════════════════════════════════════════════════════════
  // STAGE 2: BORDER ADJUSTMENT & CORNER RESIZE (STEP 1)
  // ═════════════════════════════════════════════════════════════
  if (stage === 'border_adjust') {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        {/* Top Header Bar */}
        <View style={[styles.stepTopBar, { backgroundColor: cardBg, borderColor: border }]}>
          <TouchableOpacity
            onPress={() => setStage('folder_view')}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={20} color={textColor} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.stepTitle, { color: textColor }]}>1. Adjust Borders</Text>
            <Text style={[styles.stepSub, { color: mutedColor }]}>
              Page {selectedIdx + 1} of {pages.length} • Drag corners or tap +/-
            </Text>
          </View>

          {/* Correct / Checkmark Symbol (✓) */}
          <TouchableOpacity
            onPress={handleProceedToFilters}
            style={[styles.stepCheckBtn, { backgroundColor: primaryColor }]}
            activeOpacity={0.8}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Check size={20} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Main Crop Frame with Interactive Resizable Corners */}
        <View
          style={styles.cropCanvasWrap}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && height > 0) {
              setFrameLayout({ width, height, x: 0, y: 0 });
            }
          }}
        >
          {selectedPage ? (
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: selectedPage.originalUri || selectedPage.uri }}
                style={[
                  styles.previewImage,
                  { transform: [{ rotate: `${selectedPage.rotation}deg` }] },
                ]}
                resizeMode="contain"
              />

              {/* Dynamic Resizable Crop Box */}
              {selectedPage.crop && (
                <View
                  style={[
                    styles.cropBoxOverlay,
                    {
                      top: `${selectedPage.crop.topPercent}%`,
                      bottom: `${selectedPage.crop.bottomPercent}%`,
                      left: `${selectedPage.crop.leftPercent}%`,
                      right: `${selectedPage.crop.rightPercent}%`,
                      borderColor: '#10b981',
                    },
                  ]}
                >
                  {/* 4 Draggable Resizable Corner Handles */}
                  {/* Top-Left Corner */}
                  <TouchableOpacity
                    style={[styles.cornerHandle, styles.tlCorner]}
                    onPress={() => updateCropPercent('top', 2)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cornerHandleInner} />
                  </TouchableOpacity>

                  {/* Top-Right Corner */}
                  <TouchableOpacity
                    style={[styles.cornerHandle, styles.trCorner]}
                    onPress={() => updateCropPercent('right', 2)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cornerHandleInner} />
                  </TouchableOpacity>

                  {/* Bottom-Left Corner */}
                  <TouchableOpacity
                    style={[styles.cornerHandle, styles.blCorner]}
                    onPress={() => updateCropPercent('bottom', 2)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cornerHandleInner} />
                  </TouchableOpacity>

                  {/* Bottom-Right Corner */}
                  <TouchableOpacity
                    style={[styles.cornerHandle, styles.brCorner]}
                    onPress={() => updateCropPercent('right', -2)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cornerHandleInner} />
                  </TouchableOpacity>

                  {/* Center Grid */}
                  <View style={styles.gridLineH} />
                  <View style={styles.gridLineV} />
                </View>
              )}

              {/* Rotate and Delete in-frame badges */}
              <View style={styles.frameActions}>
                <TouchableOpacity
                  onPress={handleRotateCurrent}
                  style={[styles.floatingActionBtn, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
                >
                  <RotateCw size={16} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        {/* Page Switcher if Multiple Pages */}
        {pages.length > 1 && (
          <View style={[styles.pageNavRow, { backgroundColor: cardBg, borderColor: border }]}>
            <TouchableOpacity
              disabled={selectedIdx === 0}
              onPress={() => setSelectedIdx(Math.max(0, selectedIdx - 1))}
              style={[styles.pageNavArrow, { opacity: selectedIdx === 0 ? 0.3 : 1 }]}
            >
              <ChevronLeft size={20} color={textColor} />
            </TouchableOpacity>
            <Text style={[styles.pageNavText, { color: textColor }]}>
              Page {selectedIdx + 1} of {pages.length}
            </Text>
            <TouchableOpacity
              disabled={selectedIdx === pages.length - 1}
              onPress={() => setSelectedIdx(Math.min(pages.length - 1, selectedIdx + 1))}
              style={[styles.pageNavArrow, { opacity: selectedIdx === pages.length - 1 ? 0.3 : 1 }]}
            >
              <ChevronRight size={20} color={textColor} />
            </TouchableOpacity>
          </View>
        )}

        {/* Presets & Fine-Grained Margin Steppers */}
        <View style={[styles.bottomControlCard, { backgroundColor: cardBg, borderColor: border }]}>
          {/* Presets */}
          <View style={styles.cropPresetRow}>
            <TouchableOpacity
              onPress={() => setCropPreset('auto')}
              style={[styles.presetBtn, { backgroundColor: primaryColor + '18', borderColor: primaryColor }]}
            >
              <Sparkles size={13} color={primaryColor} />
              <Text style={[styles.presetBtnText, { color: primaryColor }]}>Auto-Set Crop</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setCropPreset('deep')}
              style={[styles.presetBtn, { borderColor: border }]}
            >
              <Sliders size={13} color={textColor} />
              <Text style={[styles.presetBtnText, { color: textColor }]}>Deep Trim</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setCropPreset('full')}
              style={[styles.presetBtn, { borderColor: border }]}
            >
              <Maximize2 size={13} color={textColor} />
              <Text style={[styles.presetBtnText, { color: textColor }]}>Full Photo</Text>
            </TouchableOpacity>
          </View>

          {/* Stepper buttons for 4 edges */}
          <View style={styles.stepperEdgeRow}>
            {(['top', 'bottom', 'left', 'right'] as const).map((edge) => (
              <View key={edge} style={styles.edgeControlBox}>
                <Text style={[styles.edgeLabel, { color: mutedColor }]}>
                  {edge.toUpperCase()}: {selectedPage?.crop?.[`${edge}Percent` as keyof PageCrop] ?? 0}%
                </Text>
                <View style={styles.miniStepperWrap}>
                  <TouchableOpacity
                    onPress={() => updateCropPercent(edge, -2)}
                    style={[styles.miniStepperBtn, { borderColor: border }]}
                  >
                    <Text style={[styles.miniStepperText, { color: textColor }]}>-</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => updateCropPercent(edge, 2)}
                    style={[styles.miniStepperBtn, { borderColor: border }]}
                  >
                    <Text style={[styles.miniStepperText, { color: textColor }]}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // ═════════════════════════════════════════════════════════════
  // STAGE 3: FILTER & ENHANCEMENT (STEP 2)
  // ═════════════════════════════════════════════════════════════
  if (stage === 'filter_enhance') {
    const filtersList: Array<{ id: ScanFilterType; label: string; desc: string }> = [
      { id: 'orig', label: 'Original', desc: 'Raw Photo' },
      { id: 'doc', label: 'Clear Scan', desc: 'Helper Contrast' },
      { id: 'color', label: 'Magic Color', desc: 'Vibrant' },
      { id: 'bw', label: 'B & W', desc: 'Photocopy' },
    ];

    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        {/* Top Filter Selection Chips */}
        <View style={[styles.filterTopBar, { backgroundColor: cardBg, borderColor: border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipScroll}>
            {filtersList.map((f) => {
              const isSelected = (selectedPage?.filter || currentFilter) === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => {
                    setCurrentFilter(f.id);
                    setPages((prev) =>
                      prev.map((p, i) => (i === selectedIdx ? { ...p, filter: f.id } : p))
                    );
                  }}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isSelected ? primaryColor : (isDark ? '#1e293b' : '#f1f5f9'),
                      borderColor: isSelected ? primaryColor : border,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterChipLabel, { color: isSelected ? '#ffffff' : textColor }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Big Cropped Preview with Real-time Filter */}
        <View style={styles.cropCanvasWrap}>
          {selectedPage ? (
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: selectedPage.uri }}
                style={[
                  styles.previewImage,
                  {
                    transform: [{ rotate: `${selectedPage.rotation}deg` }],
                    opacity: (selectedPage.filter || currentFilter) === 'bw' ? 0.92 : 1,
                  },
                ]}
                resizeMode="contain"
              />
            </View>
          ) : null}
        </View>

        {/* Bottom Bar with Crop readjust, Rotate, Quality, and YES (✓) Button */}
        <View style={[styles.filterBottomBar, { backgroundColor: cardBg, borderColor: border }]}>
          <TouchableOpacity
            onPress={() => setStage('border_adjust')}
            style={styles.filterBarBtn}
          >
            <Crop size={18} color={textColor} />
            <Text style={[styles.filterBarBtnText, { color: textColor }]}>Crop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRotateCurrent}
            style={styles.filterBarBtn}
          >
            <RotateCw size={18} color={textColor} />
            <Text style={[styles.filterBarBtnText, { color: textColor }]}>Rotate</Text>
          </TouchableOpacity>

          {/* Big Yes / Confirm Checkmark Button */}
          <TouchableOpacity
            onPress={handleConfirmAndCreateDoc}
            style={[styles.confirmYesBtn, { backgroundColor: primaryColor }]}
            activeOpacity={0.85}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Check size={20} color="#ffffff" />
                <Text style={styles.confirmYesBtnText}>Confirm (Make PDF)</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ═════════════════════════════════════════════════════════════
  // STAGE 4: DOCUMENT DETAIL (STEP 3)
  // ═════════════════════════════════════════════════════════════
  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Top Bar with Back Arrow, Document Title, PDF Badge & 3-Dots */}
      <View style={[styles.docDetailHeader, { backgroundColor: cardBg, borderColor: border }]}>
        <TouchableOpacity
          onPress={() => setStage('folder_view')}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={22} color={textColor} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.detailTitleWrap}
          onPress={() => {
            if (currentDoc) {
              setActiveMenuDoc(currentDoc);
              setRenameText(currentDoc.title);
              setShowRenameModal(true);
            }
          }}
        >
          <View style={styles.titleRow}>
            <Text style={[styles.detailTitleText, { color: textColor }]} numberOfLines={1}>
              {currentDoc?.title || docTitle}
            </Text>
            <View style={styles.inlinePdfBadge}>
              <Text style={styles.inlinePdfText}>PDF</Text>
            </View>
            <Edit3 size={13} color={mutedColor} style={{ marginLeft: 4 }} />
          </View>
          <Text style={[styles.detailSubText, { color: mutedColor }]}>
            {pages.length} Pages • Ready to Share or Read
          </Text>
        </TouchableOpacity>

        {/* 3 Vertical Dots */}
        <TouchableOpacity
          onPress={() => setShowDetailDotsMenu(true)}
          style={styles.threeDotBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MoreVertical size={20} color={textColor} />
        </TouchableOpacity>
      </View>

      {/* Pages Grid in this Document */}
      <ScrollView contentContainerStyle={styles.detailGridScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.pagesGrid}>
          {pages.map((p, idx) => (
            <View key={p.id} style={[styles.pageGridCard, { backgroundColor: cardBg, borderColor: border }]}>
              <Image source={{ uri: p.uri }} style={styles.pageGridImg} resizeMode="contain" />
              <View style={styles.pageNumberBadge}>
                <Text style={styles.pageNumberText}>{idx + 1}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom Action Bar: Share & Open */}
      <View style={[styles.detailBottomBar, { backgroundColor: cardBg, borderColor: border }]}>
        <TouchableOpacity
          onPress={() => {
            if (currentDoc) handleShareDoc(currentDoc);
          }}
          style={[styles.shareActionBtn, { backgroundColor: '#059669' }]}
          activeOpacity={0.85}
        >
          <Share2 size={18} color="#ffffff" />
          <Text style={styles.shareActionBtnText}>Share PDF</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            if (currentDoc) {
              await onOpenPdf(currentDoc.pdfUri, `${currentDoc.title}.pdf`);
            }
          }}
          style={[styles.openActionBtn, { backgroundColor: primaryColor }]}
          activeOpacity={0.85}
        >
          <Eye size={18} color="#ffffff" />
          <Text style={styles.openActionBtnText}>Open Document</Text>
        </TouchableOpacity>
      </View>

      {/* Modal: Document Detail 3-Dots Menu */}
      <Modal
        visible={showDetailDotsMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDetailDotsMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowDetailDotsMenu(false)}
        >
          <View style={[styles.actionSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: textColor }]}>Document Settings</Text>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowDetailDotsMenu(false);
                setPages((prev) => [...prev].reverse());
                Alert.alert('Pages Sorted', 'Reversed page order.');
              }}
            >
              <SlidersHorizontal size={18} color={primaryColor} />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Reverse Page Order</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowDetailDotsMenu(false);
                handleStartCamera();
              }}
            >
              <Camera size={18} color="#059669" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Append Camera Scan</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowDetailDotsMenu(false);
                handleImportGallery();
              }}
            >
              <FolderOpen size={18} color="#2563eb" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Import More Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowDetailDotsMenu(false);
                if (currentDoc) {
                  setActiveMenuDoc(currentDoc);
                  setRenameText(currentDoc.title);
                  setShowRenameModal(true);
                }
              }}
            >
              <Edit3 size={18} color="#d97706" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Rename PDF</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.dialogBox, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <Text style={[styles.dialogTitle, { color: textColor }]}>Rename PDF Document</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Document title..."
              placeholderTextColor={mutedColor}
              style={[
                styles.dialogInput,
                { color: textColor, borderColor: border, backgroundColor: isDark ? '#0f172a' : '#f8fafc' },
              ]}
              autoFocus
            />
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                onPress={() => setShowRenameModal(false)}
                style={[styles.dialogBtn, { borderColor: border, borderWidth: 1 }]}
              >
                <Text style={{ color: mutedColor, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleExecuteRename}
                style={[styles.dialogBtn, { backgroundColor: primaryColor }]}
              >
                <Text style={{ color: '#ffffff', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  batchToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  batchToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  folderBarWrap: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  folderTabs: {
    paddingHorizontal: 16,
    gap: 8,
  },
  folderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  newFolderChip: {
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  folderChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  docListScroll: {
    padding: 16,
    paddingBottom: 110,
  },
  emptyStudioBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  docThumbBox: {
    width: 48,
    height: 58,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  docThumbImg: {
    width: '100%',
    height: '100%',
  },
  pdfBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#dc2626',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  pdfBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#ffffff',
  },
  docCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  docCardSub: {
    fontSize: 11.5,
  },
  threeDotBtn: {
    padding: 8,
  },
  floatingBottomBar: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 10,
  },
  mainScanBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  mainScanBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  galleryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 24,
  },
  galleryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#94a3b8',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  sheetOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dialogBox: {
    marginHorizontal: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 14,
  },
  dialogInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  dialogBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveFolderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  moveFolderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  stepSub: {
    fontSize: 11,
    marginTop: 1,
  },
  stepCheckBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropCanvasWrap: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  cropBoxOverlay: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'solid',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  cornerHandle: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  cornerHandleInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  tlCorner: { top: -14, left: -14 },
  trCorner: { top: -14, right: -14 },
  blCorner: { bottom: -14, left: -14 },
  brCorner: { bottom: -14, right: -14 },
  gridLineH: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.4)',
  },
  gridLineV: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.4)',
  },
  frameActions: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 8,
  },
  floatingActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  pageNavArrow: {
    padding: 6,
  },
  pageNavText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  bottomControlCard: {
    padding: 12,
    borderTopWidth: 1,
  },
  cropPresetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  presetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  stepperEdgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  edgeControlBox: {
    flex: 1,
    alignItems: 'center',
  },
  edgeLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  miniStepperWrap: {
    flexDirection: 'row',
    gap: 4,
  },
  miniStepperBtn: {
    width: 28,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStepperText: {
    fontSize: 14,
    fontWeight: '800',
  },
  filterTopBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  filterChipScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipLabel: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  filterBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  filterBarBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  filterBarBtnText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  confirmYesBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 23,
  },
  confirmYesBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  docDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  detailTitleWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailTitleText: {
    fontSize: 15,
    fontWeight: '800',
    maxWidth: '75%',
  },
  inlinePdfBadge: {
    backgroundColor: '#dc2626',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 6,
  },
  inlinePdfText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  detailSubText: {
    fontSize: 11,
    marginTop: 2,
  },
  detailGridScroll: {
    padding: 16,
  },
  pagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pageGridCard: {
    width: (SCREEN_W - 32 - 12) / 2,
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageGridImg: {
    width: '100%',
    height: '100%',
  },
  pageNumberBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNumberText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  detailBottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  shareActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 23,
  },
  shareActionBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  openActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 23,
  },
  openActionBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
});
