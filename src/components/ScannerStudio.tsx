import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  SafeAreaView,
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
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  Upload,
  File,
  X,
} from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import { LiveScannerCamera } from './LiveScannerCamera';

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
  clearFolderDocs,
  createBlankScanPage,
  detectEarlyCrop,
} from '../services/scannerService';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type StudioStage = 'folder_view' | 'border_adjust' | 'filter_enhance' | 'doc_detail';
type ViewMode = 'grid' | 'list';
type SortMode = 'date_desc' | 'date_asc' | 'name_asc';

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
  // Navigation stage: 'folder_view' -> full-screen editor ('border_adjust' -> 'filter_enhance' -> 'doc_detail')
  const [stage, setStage] = useState<StudioStage>('folder_view');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('date_desc');

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Live Camera state
  const [showLiveCamera, setShowLiveCamera] = useState(false);

  // Top 3-dots vertical menu modal
  const [showTopMenu, setShowTopMenu] = useState(false);

  // Folders & Saved Documents
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

  // 3-dots menus & modals for documents
  const [activeMenuDoc, setActiveMenuDoc] = useState<SavedScanDoc | null>(null);
  const [showDocMenuModal, setShowDocMenuModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [showDetailDotsMenu, setShowDetailDotsMenu] = useState(false);

  // Layout size for draggable crop canvas
  const [cropLayout, setCropLayout] = useState({ width: SCREEN_W - 32, height: SCREEN_H * 0.58 });

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

  // Filtered & sorted documents
  const displayedDocs = useMemo(() => {
    let result = savedDocs.filter((d) => {
      const matchesFolder = selectedFolderId === null || d.folderId === selectedFolderId;
      const matchesSearch = !searchQuery.trim() || d.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFolder && matchesSearch;
    });

    if (sortMode === 'date_desc') {
      result.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortMode === 'date_asc') {
      result.sort((a, b) => a.createdAt - b.createdAt);
    } else if (sortMode === 'name_asc') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  }, [savedDocs, selectedFolderId, searchQuery, sortMode]);

  // ── Drag & Resize Crop Logic with PanResponder ──────────────
  const cropRef = useRef<PageCrop>(selectedPage?.crop || DEFAULT_AUTO_CROP);
  useEffect(() => {
    if (selectedPage?.crop) {
      cropRef.current = selectedPage.crop;
    }
  }, [selectedPage?.crop]);

  const updateCrop = (newCrop: PageCrop) => {
    cropRef.current = newCrop;
    setPages((prev) =>
      prev.map((p, i) => (i === selectedIdx ? { ...p, crop: newCrop } : p))
    );
  };

  // Draggable PanResponder for Top-Left Corner
  const panTL = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const W = cropLayout.width || 300;
        const H = cropLayout.height || 400;
        const dXPct = (gestureState.dx / W) * 100;
        const dYPct = (gestureState.dy / H) * 100;

        const current = cropRef.current;
        const newLeft = Math.max(0, Math.min(42, current.leftPercent + dXPct * 0.08));
        const newTop = Math.max(0, Math.min(42, current.topPercent + dYPct * 0.08));

        updateCrop({ ...current, leftPercent: newLeft, topPercent: newTop });
      },
    })
  ).current;

  // Draggable PanResponder for Top-Right Corner
  const panTR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const W = cropLayout.width || 300;
        const H = cropLayout.height || 400;
        const dXPct = (gestureState.dx / W) * 100;
        const dYPct = (gestureState.dy / H) * 100;

        const current = cropRef.current;
        const newRight = Math.max(0, Math.min(42, current.rightPercent - dXPct * 0.08));
        const newTop = Math.max(0, Math.min(42, current.topPercent + dYPct * 0.08));

        updateCrop({ ...current, rightPercent: newRight, topPercent: newTop });
      },
    })
  ).current;

  // Draggable PanResponder for Bottom-Left Corner
  const panBL = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const W = cropLayout.width || 300;
        const H = cropLayout.height || 400;
        const dXPct = (gestureState.dx / W) * 100;
        const dYPct = (gestureState.dy / H) * 100;

        const current = cropRef.current;
        const newLeft = Math.max(0, Math.min(42, current.leftPercent + dXPct * 0.08));
        const newBottom = Math.max(0, Math.min(42, current.bottomPercent - dYPct * 0.08));

        updateCrop({ ...current, leftPercent: newLeft, bottomPercent: newBottom });
      },
    })
  ).current;

  // Draggable PanResponder for Bottom-Right Corner
  const panBR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const W = cropLayout.width || 300;
        const H = cropLayout.height || 400;
        const dXPct = (gestureState.dx / W) * 100;
        const dYPct = (gestureState.dy / H) * 100;

        const current = cropRef.current;
        const newRight = Math.max(0, Math.min(42, current.rightPercent - dXPct * 0.08));
        const newBottom = Math.max(0, Math.min(42, current.bottomPercent - dYPct * 0.08));

        updateCrop({ ...current, rightPercent: newRight, bottomPercent: newBottom });
      },
    })
  ).current;

  // ── Capture & Batch Scanning ────────────────────────────────
  const handleStartCamera = () => {
    setShowLiveCamera(true);
  };

  const handleFinishLiveCamera = (captured: ScannedPage[]) => {
    setShowLiveCamera(false);
    if (captured.length > 0) {
      if (stage === 'doc_detail') {
        setPages((prev) => [...prev, ...captured]);
      } else {
        setPages(captured);
        setSelectedIdx(0);
        const now = new Date();
        const autoName = `Scan_${now.getMonth() + 1}${now.getDate()}_${now.getHours()}${now.getMinutes()}`;
        setDocTitle(autoName);
        setStage('border_adjust');
      }
    }
  };

  const handleImportGallery = async () => {
    try {
      const imported = await importPagesFromGallery(currentFilter);
      if (imported.length > 0) {
        setPages(imported);
        setSelectedIdx(0);
        const now = new Date();
        const autoName = `Scan_${now.getMonth() + 1}${now.getDate()}_${now.getHours()}${now.getMinutes()}`;
        setDocTitle(autoName);
        setStage('border_adjust');
      }
    } catch (e: any) {
      Alert.alert('Gallery', e?.message || 'Could not import images.');
    }
  };

  const handleImportPdfDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const newDoc: SavedScanDoc = {
          id: `doc_${Date.now()}`,
          title: file.name.replace(/\.pdf$/i, ''),
          pdfUri: file.uri,
          pageCount: 1,
          thumbnailUri: '',
          folderId: selectedFolderId,
          createdAt: Date.now(),
          fileSize: file.size,
        };
        await addSavedScanDoc(newDoc);
        await loadFoldersAndDocs();
        Alert.alert('PDF Imported', `Added "${file.name}" to your scanner library.`);
      }
    } catch (e: any) {
      Alert.alert('Import Failed', e?.message || 'Could not import PDF.');
    }
  };

  const handleCreateBlankDocument = async () => {
    try {
      const blankPage = await createBlankScanPage();
      setPages([blankPage]);
      setSelectedIdx(0);
      setDocTitle(`Blank_${Date.now()}`);
      setStage('filter_enhance');
    } catch (e: any) {
      Alert.alert('Error', 'Could not create blank document.');
    }
  };

  const handleClearCurrentFolder = async () => {
    const folderName = folders.find((f) => f.id === selectedFolderId)?.name || 'this folder';
    Alert.alert(
      'Clear Folder',
      `Are you sure you want to delete all scanned documents inside ${folderName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearFolderDocs(selectedFolderId);
            await loadFoldersAndDocs();
          },
        },
      ]
    );
  };

  // ── Step 1: Border Adjust Actions ───────────────────────────
  const handleAutoDetectCorner = () => {
    if (!selectedPage) return;
    const early = detectEarlyCrop(selectedPage.width, selectedPage.height);
    updateCrop(early);
  };

  const handleFullPhotoCrop = () => {
    updateCrop({ ...NO_CROP });
  };

  const handleRotateCurrent = () => {
    if (!pages.length) return;
    setPages((prev) =>
      prev.map((p, i) => (i === selectedIdx ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    );
  };

  // Proceed to Step 2 (Filters)
  const handleProceedToFilters = async () => {
    if (!pages.length) return;
    setIsProcessing(true);
    try {
      const croppedPages = await Promise.all(pages.map((p) => applyCropToPage(p)));
      setPages(croppedPages);
      setStage('filter_enhance');
    } catch (e: any) {
      Alert.alert('Processing', e?.message || 'Failed to crop document.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Step 2: Filters -> Compile to PDF ────────────────────────
  const handleConfirmAndMakePdf = async () => {
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

  // ── Document Operations (Share, Rename, Delete, Move) ───────
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

  // ── HTML Preview Generator with Real Filters for WebView ────
  const filterPreviewHtml = useMemo(() => {
    if (!selectedPage) return '';
    let filterCss = 'filter: none;';
    const activeFilter = selectedPage.filter || currentFilter;

    if (activeFilter === 'doc') {
      // Clear Scan / Helper: high contrast, bright white paper, dark crisp ink
      filterCss = 'filter: contrast(180%) brightness(115%) grayscale(100%);';
    } else if (activeFilter === 'color') {
      // Magic Color: enhanced saturation & contrast
      filterCss = 'filter: contrast(135%) brightness(108%) saturate(135%);';
    } else if (activeFilter === 'bw') {
      // B & W: photocopy monochrome
      filterCss = 'filter: grayscale(100%) contrast(240%);';
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 100vw;
            height: 100vh;
            background: ${isDark ? '#0b1120' : '#f8fafc'};
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          img {
            max-width: 95%;
            max-height: 95%;
            object-fit: contain;
            transform: rotate(${selectedPage.rotation}deg);
            ${filterCss}
            border-radius: 8px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.25);
          }
        </style>
      </head>
      <body>
        <img src="${selectedPage.uri}" />
      </body>
      </html>
    `;
  }, [selectedPage, currentFilter, isDark]);

  // ═════════════════════════════════════════════════════════════
  // MAIN SCREEN: SCANNER HOME (FOLDER LIST, SEARCH, TOP 3-DOTS)
  // ═════════════════════════════════════════════════════════════
  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* ── Top Header with Title, Search, and 3-Vertical-Dots Menu ── */}
      <View style={[styles.mainTopHeader, { backgroundColor: cardBg, borderColor: border }]}>
        <View style={styles.titleIconRow}>
          <View style={[styles.headerIconBox, { backgroundColor: primaryColor + '18' }]}>
            <ScanLine size={20} color={primaryColor} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: textColor }]}>Clear Scanner</Text>
            <Text style={[styles.headerSub, { color: mutedColor }]}>
              {displayedDocs.length} {displayedDocs.length === 1 ? 'Scan' : 'Scans'}
            </Text>
          </View>
        </View>

        <View style={styles.topRightActions}>
          {/* Search Button (🔍) */}
          <TouchableOpacity
            onPress={() => setShowSearch(!showSearch)}
            style={styles.iconCircleBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Search size={20} color={showSearch ? primaryColor : textColor} />
          </TouchableOpacity>

          {/* 3 Vertical Dots (⋮) Menu Button */}
          <TouchableOpacity
            onPress={() => setShowTopMenu(true)}
            style={styles.iconCircleBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreVertical size={20} color={textColor} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Expandable Search Input */}
      {showSearch && (
        <View style={[styles.searchBarWrap, { backgroundColor: cardBg, borderColor: border }]}>
          <Search size={16} color={mutedColor} style={{ marginLeft: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search scans by document title..."
            placeholderTextColor={mutedColor}
            style={[styles.searchInput, { color: textColor }]}
            autoFocus
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 6 }}>
              <X size={15} color={mutedColor} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Folders Bar */}
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
            <Folder size={13} color={selectedFolderId === null ? '#ffffff' : textColor} />
            <Text
              style={[
                styles.folderChipText,
                { color: selectedFolderId === null ? '#ffffff' : textColor },
              ]}
            >
              All Scans
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
                <Folder size={13} color={isSelected ? '#ffffff' : textColor} />
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
            <FolderPlus size={13} color={primaryColor} />
            <Text style={[styles.folderChipText, { color: primaryColor, fontWeight: '700' }]}>
              + Folder
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── Document List / Grid View ── */}
      <ScrollView contentContainerStyle={styles.docListScroll} showsVerticalScrollIndicator={false}>
        {displayedDocs.length === 0 ? (
          <View style={[styles.emptyStudioBox, { borderColor: border }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: primaryColor + '14' }]}>
              <Camera size={36} color={primaryColor} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No Scans Here Yet</Text>
            <Text style={[styles.emptyDesc, { color: mutedColor }]}>
              Tap the camera button below to scan documents, adjust borders with draggable corners, and create clear PDFs.
            </Text>
          </View>
        ) : viewMode === 'grid' ? (
          // Grid View (2-Column Cards)
          <View style={styles.gridContainer}>
            {displayedDocs.map((doc) => (
              <View
                key={doc.id}
                style={[styles.gridCard, { backgroundColor: cardBg, borderColor: border }]}
              >
                <TouchableOpacity
                  onPress={() => onOpenPdf(doc.pdfUri, `${doc.title}.pdf`)}
                  style={styles.gridThumbBox}
                  activeOpacity={0.8}
                >
                  {doc.thumbnailUri ? (
                    <Image source={{ uri: doc.thumbnailUri }} style={styles.gridThumbImg} resizeMode="cover" />
                  ) : (
                    <FileText size={32} color="#dc2626" />
                  )}
                  <View style={styles.pdfBadge}>
                    <Text style={styles.pdfBadgeText}>PDF</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.gridMetaRow}>
                  <TouchableOpacity
                    onPress={() => onOpenPdf(doc.pdfUri, `${doc.title}.pdf`)}
                    style={{ flex: 1 }}
                  >
                    <Text style={[styles.gridTitle, { color: textColor }]} numberOfLines={1}>
                      {doc.title}
                    </Text>
                    <Text style={[styles.gridSub, { color: mutedColor }]}>
                      {doc.pageCount}p • {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB • ` : ''}{new Date(doc.createdAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setActiveMenuDoc(doc);
                      setShowDocMenuModal(true);
                    }}
                    style={styles.cardDotBtn}
                  >
                    <MoreVertical size={16} color={mutedColor} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          // List View (Horizontal Rows)
          displayedDocs.map((doc) => (
            <View
              key={doc.id}
              style={[styles.listRow, { backgroundColor: cardBg, borderColor: border }]}
            >
              <TouchableOpacity
                onPress={() => onOpenPdf(doc.pdfUri, `${doc.title}.pdf`)}
                style={styles.listThumbBox}
                activeOpacity={0.8}
              >
                {doc.thumbnailUri ? (
                  <Image source={{ uri: doc.thumbnailUri }} style={styles.listThumbImg} resizeMode="cover" />
                ) : (
                  <FileText size={22} color="#dc2626" />
                )}
                <View style={styles.pdfBadge}>
                  <Text style={styles.pdfBadgeText}>PDF</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onOpenPdf(doc.pdfUri, `${doc.title}.pdf`)}
                style={{ flex: 1, paddingVertical: 4 }}
                activeOpacity={0.7}
              >
                <Text style={[styles.listTitle, { color: textColor }]} numberOfLines={1}>
                  {doc.title}
                </Text>
                <Text style={[styles.listSub, { color: mutedColor }]}>
                  {doc.pageCount} {doc.pageCount === 1 ? 'Page' : 'Pages'} • {new Date(doc.createdAt).toLocaleDateString()}
                  {doc.fileSize ? ` • ${(doc.fileSize / 1024).toFixed(0)} KB` : ''}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setActiveMenuDoc(doc);
                  setShowDocMenuModal(true);
                }}
                style={styles.cardDotBtn}
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

      {/* ── TOP 3-DOTS MENU MODAL ── */}
      <Modal
        visible={showTopMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTopMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowTopMenu(false)}
        >
          <View style={[styles.actionSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: textColor }]}>Scanner Options</Text>

            {/* 1. View Mode (Grid vs List) */}
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setViewMode(viewMode === 'grid' ? 'list' : 'grid');
                setShowTopMenu(false);
              }}
            >
              {viewMode === 'grid' ? (
                <>
                  <List size={18} color={primaryColor} />
                  <Text style={[styles.sheetOptionText, { color: textColor }]}>View as List</Text>
                </>
              ) : (
                <>
                  <LayoutGrid size={18} color={primaryColor} />
                  <Text style={[styles.sheetOptionText, { color: textColor }]}>View as Grid</Text>
                </>
              )}
            </TouchableOpacity>

            {/* 2. Sort Documents */}
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setSortMode(sortMode === 'date_desc' ? 'name_asc' : 'date_desc');
                setShowTopMenu(false);
              }}
            >
              <ArrowUpDown size={18} color="#059669" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>
                {sortMode === 'date_desc' ? 'Sort by Name (A-Z)' : 'Sort by Date (Newest)'}
              </Text>
            </TouchableOpacity>

            {/* 3. Import PDF */}
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowTopMenu(false);
                handleImportPdfDocument();
              }}
            >
              <Upload size={18} color="#2563eb" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Import PDF File</Text>
            </TouchableOpacity>

            {/* 4. Import Images */}
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowTopMenu(false);
                handleImportGallery();
              }}
            >
              <FolderOpen size={18} color="#d97706" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Import Images</Text>
            </TouchableOpacity>

            {/* 5. New Folder */}
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowTopMenu(false);
                setShowNewFolderModal(true);
              }}
            >
              <FolderPlus size={18} color="#7c3aed" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>New Folder</Text>
            </TouchableOpacity>

            {/* 6. New Blank Page */}
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowTopMenu(false);
                handleCreateBlankDocument();
              }}
            >
              <File size={18} color="#0284c7" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>New Blank Page</Text>
            </TouchableOpacity>

            {/* 7. Clear Folder */}
            <TouchableOpacity
              style={[styles.sheetOption, { borderTopWidth: 1, borderTopColor: border, marginTop: 4 }]}
              onPress={() => {
                setShowTopMenu(false);
                handleClearCurrentFolder();
              }}
            >
              <Trash2 size={18} color="#ef4444" />
              <Text style={[styles.sheetOptionText, { color: '#ef4444' }]}>Clear Folder</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Document Item 3-Dots Menu ── */}
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
            <Text style={[styles.sheetTitle, { color: textColor }]}>{activeMenuDoc?.title}</Text>

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
              placeholder="Folder name (e.g. Invoices, Work)..."
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
            <Text style={[styles.dialogTitle, { color: textColor }]}>Rename PDF</Text>
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
                style={[styles.moveFolderOption, { borderBottomColor: border, borderBottomWidth: 1 }]}
                onPress={() => handleExecuteMove(null)}
              >
                <Folder size={18} color={primaryColor} />
                <Text style={[styles.moveFolderText, { color: textColor }]}>All Scans (Root)</Text>
              </TouchableOpacity>
              {folders.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.moveFolderOption, { borderBottomColor: border, borderBottomWidth: 1 }]}
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

      {/* ═════════════════════════════════════════════════════════════
          FULL-SCREEN DEDICATED PAGE MODAL FOR STEPS 1, 2, AND 3
         ═════════════════════════════════════════════════════════════ */}
      <Modal
        visible={stage !== 'folder_view'}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setStage('folder_view')}
      >
        <SafeAreaView style={[styles.fullScreenModal, { backgroundColor: bg }]}>
          {/* ─────────────────────────────────────────────────────────
              STEP 1: DEDICATED BORDER ADJUSTMENT PAGE
             ───────────────────────────────────────────────────────── */}
          {stage === 'border_adjust' && (
            <View style={{ flex: 1 }}>
              {/* Clean Top Bar */}
              <View style={[styles.editorTopBar, { backgroundColor: cardBg, borderColor: border }]}>
                <TouchableOpacity
                  onPress={() => setStage('folder_view')}
                  style={styles.editorBackBtn}
                >
                  <ArrowLeft size={22} color={textColor} />
                </TouchableOpacity>

                <View style={{ alignItems: 'center' }}>
                  <Text style={[styles.editorTitle, { color: textColor }]}>Adjust Border</Text>
                  {pages.length > 1 && (
                    <Text style={[styles.editorSub, { color: mutedColor }]}>
                      Page {selectedIdx + 1} of {pages.length}
                    </Text>
                  )}
                </View>

                {/* Top Right Checkmark (✓) */}
                <TouchableOpacity
                  onPress={handleProceedToFilters}
                  style={[styles.editorCheckBtn, { backgroundColor: primaryColor }]}
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

              {/* Main Canvas with True Draggable Corner Handles */}
              <View
                style={styles.cropCanvasArea}
                onLayout={(e) => {
                  const { width, height } = e.nativeEvent.layout;
                  if (width > 0 && height > 0) {
                    setCropLayout({ width, height });
                  }
                }}
              >
                {selectedPage ? (
                  <View style={styles.cropCanvasInner}>
                    <Image
                      source={{ uri: selectedPage.originalUri || selectedPage.uri }}
                      style={[
                        styles.canvasImage,
                        { transform: [{ rotate: `${selectedPage.rotation}deg` }] },
                      ]}
                      resizeMode="contain"
                    />

                    {/* Interactive Draggable Crop Overlay */}
                    {selectedPage.crop && (
                      <View
                        style={[
                          styles.cropBoundingBox,
                          {
                            top: `${selectedPage.crop.topPercent}%`,
                            bottom: `${selectedPage.crop.bottomPercent}%`,
                            left: `${selectedPage.crop.leftPercent}%`,
                            right: `${selectedPage.crop.rightPercent}%`,
                            borderColor: '#10b981',
                          },
                        ]}
                      >
                        {/* 4 True Draggable Corner Loupe Handles */}
                        {/* Top-Left */}
                        <View
                          {...panTL.panHandlers}
                          style={[styles.draggableCorner, styles.tlCorner]}
                          hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
                        >
                          <View style={styles.cornerDot} />
                        </View>

                        {/* Top-Right */}
                        <View
                          {...panTR.panHandlers}
                          style={[styles.draggableCorner, styles.trCorner]}
                          hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
                        >
                          <View style={styles.cornerDot} />
                        </View>

                        {/* Bottom-Left */}
                        <View
                          {...panBL.panHandlers}
                          style={[styles.draggableCorner, styles.blCorner]}
                          hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
                        >
                          <View style={styles.cornerDot} />
                        </View>

                        {/* Bottom-Right */}
                        <View
                          {...panBR.panHandlers}
                          style={[styles.draggableCorner, styles.brCorner]}
                          hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
                        >
                          <View style={styles.cornerDot} />
                        </View>

                        {/* Center Crosshair Grid */}
                        <View style={styles.crossLineH} />
                        <View style={styles.crossLineV} />
                      </View>
                    )}
                  </View>
                ) : null}
              </View>

              {/* Multi-Page Navigation if Batch */}
              {pages.length > 1 && (
                <View style={[styles.pageStepperBar, { backgroundColor: cardBg, borderColor: border }]}>
                  <TouchableOpacity
                    disabled={selectedIdx === 0}
                    onPress={() => setSelectedIdx(Math.max(0, selectedIdx - 1))}
                    style={[styles.stepperArrow, { opacity: selectedIdx === 0 ? 0.3 : 1 }]}
                  >
                    <ChevronLeft size={20} color={textColor} />
                  </TouchableOpacity>
                  <Text style={[styles.stepperText, { color: textColor }]}>
                    Reviewing Page {selectedIdx + 1} of {pages.length}
                  </Text>
                  <TouchableOpacity
                    disabled={selectedIdx === pages.length - 1}
                    onPress={() => setSelectedIdx(Math.min(pages.length - 1, selectedIdx + 1))}
                    style={[styles.stepperArrow, { opacity: selectedIdx === pages.length - 1 ? 0.3 : 1 }]}
                  >
                    <ChevronRight size={20} color={textColor} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Clean Bottom Tool Bar (No Clutter, No Extra Ratios) */}
              <View style={[styles.cropBottomBar, { backgroundColor: cardBg, borderColor: border }]}>
                <TouchableOpacity
                  onPress={handleAutoDetectCorner}
                  style={styles.bottomToolBtn}
                >
                  <Sparkles size={20} color={primaryColor} />
                  <Text style={[styles.bottomToolText, { color: primaryColor }]}>Auto-Detect</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleFullPhotoCrop}
                  style={styles.bottomToolBtn}
                >
                  <Maximize2 size={20} color={textColor} />
                  <Text style={[styles.bottomToolText, { color: textColor }]}>Full Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleRotateCurrent}
                  style={styles.bottomToolBtn}
                >
                  <RotateCw size={20} color={textColor} />
                  <Text style={[styles.bottomToolText, { color: textColor }]}>Rotate</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleProceedToFilters}
                  style={[styles.stepNextBtn, { backgroundColor: primaryColor }]}
                  activeOpacity={0.85}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Text style={styles.stepNextBtnText}>Next</Text>
                      <Check size={18} color="#ffffff" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ─────────────────────────────────────────────────────────
              STEP 2: DEDICATED FILTER & ENHANCEMENT PAGE
             ───────────────────────────────────────────────────────── */}
          {stage === 'filter_enhance' && (
            <View style={{ flex: 1 }}>
              {/* Top Filter Selection Chips */}
              <View style={[styles.filterTopBar, { backgroundColor: cardBg, borderColor: border }]}>
                <TouchableOpacity
                  onPress={() => setStage('border_adjust')}
                  style={{ padding: 6, marginRight: 8 }}
                >
                  <ArrowLeft size={20} color={textColor} />
                </TouchableOpacity>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipScroll}>
                  {[
                    { id: 'orig', label: 'Original', desc: 'Raw Photo' },
                    { id: 'doc', label: 'Clear Scan', desc: 'Helper Filter' },
                    { id: 'color', label: 'Magic Color', desc: 'Vibrant' },
                    { id: 'bw', label: 'B & W', desc: 'Photocopy' },
                  ].map((f) => {
                    const isSelected = (selectedPage?.filter || currentFilter) === f.id;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => {
                          setCurrentFilter(f.id as ScanFilterType);
                          setPages((prev) =>
                            prev.map((p, i) => (i === selectedIdx ? { ...p, filter: f.id as ScanFilterType } : p))
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

              {/* Visual Filter Canvas (WebView WYSIWYG Rendering) */}
              <View style={styles.filterCanvasArea}>
                <WebView
                  originWhitelist={['*']}
                  source={{ html: filterPreviewHtml }}
                  scrollEnabled={false}
                  style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                />
              </View>

              {/* Bottom Bar: Crop, Rotate, and Confirm Make PDF */}
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

                {/* Big Yes / Confirm Button */}
                <TouchableOpacity
                  onPress={handleConfirmAndMakePdf}
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
          )}

          {/* ─────────────────────────────────────────────────────────
              STEP 3: DOCUMENT DETAIL SCREEN
             ───────────────────────────────────────────────────────── */}
          {stage === 'doc_detail' && (
            <View style={{ flex: 1 }}>
              <View style={[styles.docDetailHeader, { backgroundColor: cardBg, borderColor: border }]}>
                <TouchableOpacity
                  onPress={() => setStage('folder_view')}
                  style={styles.editorBackBtn}
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
                    <Edit3 size={13} color={mutedColor} style={{ marginLeft: 6 }} />
                  </View>
                  <Text style={[styles.detailSubText, { color: mutedColor }]}>
                    {pages.length} Pages • {currentDoc?.fileSize ? `${(currentDoc.fileSize / 1024).toFixed(0)} KB • ` : ''}{currentDoc?.createdAt ? new Date(currentDoc.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowDetailDotsMenu(true)}
                  style={styles.iconCircleBtn}
                >
                  <MoreVertical size={20} color={textColor} />
                </TouchableOpacity>
              </View>

              {/* Pages Grid */}
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
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Live Scanner Camera with Modes (Single, Batch, ID Card, Passport), Auto-Snap & Torch ── */}
      <LiveScannerCamera
        visible={showLiveCamera}
        onClose={() => setShowLiveCamera(false)}
        onFinishCapture={handleFinishLiveCamera}
        primaryColor={primaryColor}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fullScreenModal: {
    flex: 1,
  },
  mainTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  titleIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    height: 38,
    paddingHorizontal: 10,
    fontSize: 13.5,
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
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: (SCREEN_W - 32 - 12) / 2,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 8,
  },
  gridThumbBox: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 8,
  },
  gridThumbImg: {
    width: '100%',
    height: '100%',
  },
  gridMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gridTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  gridSub: {
    fontSize: 11,
    marginTop: 2,
  },
  cardDotBtn: {
    padding: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  listThumbBox: {
    width: 48,
    height: 58,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  listThumbImg: {
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
  listTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  listSub: {
    fontSize: 11.5,
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
  editorTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  editorBackBtn: {
    padding: 4,
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  editorSub: {
    fontSize: 11,
    marginTop: 1,
  },
  editorCheckBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropCanvasArea: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropCanvasInner: {
    width: '100%',
    height: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasImage: {
    width: '100%',
    height: '100%',
  },
  cropBoundingBox: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  draggableCorner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  cornerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
  },
  tlCorner: { top: -16, left: -16 },
  trCorner: { top: -16, right: -16 },
  blCorner: { bottom: -16, left: -16 },
  brCorner: { bottom: -16, right: -16 },
  crossLineH: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.4)',
  },
  crossLineV: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.4)',
  },
  pageStepperBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  stepperArrow: {
    padding: 6,
  },
  stepperText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  cropBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  bottomToolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  bottomToolText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  stepNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 42,
    borderRadius: 21,
  },
  stepNextBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  filterTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  filterChipScroll: {
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
  filterCanvasArea: {
    flex: 1,
    backgroundColor: 'transparent',
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
