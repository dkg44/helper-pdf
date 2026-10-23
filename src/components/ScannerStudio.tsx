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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Svg, Polygon, Path, Line, Circle } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { LiveScannerCamera } from './LiveScannerCamera';
import { PerspectiveWarpBridge, PerspectiveWarpBridgeRef } from '../services/perspectiveService';

const WebViewAny = WebView as any;

import {
  ScannedPage,
  ScanFilterType,
  PageCrop,
  DEFAULT_AUTO_CROP,
  NO_CROP,
  CornerPoint,
  QuadCorners,
  DEFAULT_QUAD_CORNERS,
  NO_QUAD_CORNERS,
  detectEarlyCorners,
  ScannedFolder,
  SavedScanDoc,
  capturePageWithCamera,
  importPagesFromGallery,
  applyCropToPage,
  compileScannedPagesToPdf,
  loadScannerFolders,
  createScannerFolder,
  deleteScannerFolder,
  renameScannerFolder,
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

  const STORAGE_KEY_VIEW_MODE = '@scanner_view_mode_v2';

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

  // 3-dots menus & modals for folders
  const [activeMenuFolder, setActiveMenuFolder] = useState<ScannedFolder | null>(null);
  const [showFolderMenuModal, setShowFolderMenuModal] = useState(false);
  const [showRenameFolderModal, setShowRenameFolderModal] = useState(false);
  const [renameFolderText, setRenameFolderText] = useState('');

  // Layout size for draggable crop canvas
  const [cropLayout, setCropLayout] = useState({ width: SCREEN_W - 32, height: SCREEN_H * 0.58 });

  // WebGL & Hardware-accelerated Perspective Warping Bridge
  const warpBridgeRef = useRef<PerspectiveWarpBridgeRef>(null);

  const bg = isDark ? '#0b1120' : '#f8fafc';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  // Load saved folders, docs, and viewMode on mount
  useEffect(() => {
    loadFoldersAndDocs();
    AsyncStorage.getItem(STORAGE_KEY_VIEW_MODE).then((v: string | null) => {
      if (v === 'grid' || v === 'list') {
        setViewMode(v);
      }
    });
  }, []);

  const toggleViewMode = async () => {
    const next: ViewMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(next);
    await AsyncStorage.setItem(STORAGE_KEY_VIEW_MODE, next);
  };

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
      const matchesSearch = !searchQuery.trim() || d.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (searchQuery.trim()) {
        return matchesSearch;
      }
      // If outside of folder (All Scans / Root), do NOT show documents that belong to any folder
      const matchesFolder = selectedFolderId === null 
        ? (!d.folderId) // only unfiled/root documents
        : d.folderId === selectedFolderId;
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

  // ── Drag & Resize 4-Corner Crop Logic with PanResponder ──────
  const cornersRef = useRef<QuadCorners>(selectedPage?.corners || DEFAULT_QUAD_CORNERS);
  useEffect(() => {
    if (selectedPage?.corners) {
      cornersRef.current = selectedPage.corners;
    }
  }, [selectedPage?.corners]);

  const updateCorners = (newCorners: QuadCorners) => {
    cornersRef.current = newCorners;
    setPages((prev) =>
      prev.map((p, i) => (i === selectedIdx ? { ...p, corners: newCorners } : p))
    );
  };

  // Accurate containment geometry of the image inside cropLayout
  const renderedImgRect = useMemo(() => {
    if (!selectedPage) return { width: 300, height: 400, left: 0, top: 0 };
    const isRotated90 = (selectedPage.rotation || 0) % 180 !== 0;
    const rawW = selectedPage.width || 3;
    const rawH = selectedPage.height || 4;
    const imgW = isRotated90 ? rawH : rawW;
    const imgH = isRotated90 ? rawW : rawH;
    const imgAspect = imgW / imgH;
    const canvasAspect = (cropLayout.width || 300) / (cropLayout.height || 400);

    let renderW = cropLayout.width || 300;
    let renderH = cropLayout.height || 400;
    let offsetX = 0;
    let offsetY = 0;

    if (canvasAspect > imgAspect) {
      renderH = cropLayout.height || 400;
      renderW = renderH * imgAspect;
      offsetX = ((cropLayout.width || 300) - renderW) / 2;
    } else {
      renderW = cropLayout.width || 300;
      renderH = renderW / imgAspect;
      offsetY = ((cropLayout.height || 400) - renderH) / 2;
    }

    return { width: renderW, height: renderH, left: offsetX, top: offsetY };
  }, [selectedPage, cropLayout]);

  // 4 Independent PanResponders with direct 1:1 finger tracking
  const tlStart = useRef<CornerPoint>({ x: 5, y: 5 });
  const panTL = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        tlStart.current = { ...(cornersRef.current?.tl || { x: 5, y: 5 }) };
      },
      onPanResponderMove: (_, gs) => {
        const W = renderedImgRect.width || 300;
        const H = renderedImgRect.height || 400;
        const newX = Math.max(0, Math.min(95, Math.round(tlStart.current.x + (gs.dx / W) * 100)));
        const newY = Math.max(0, Math.min(95, Math.round(tlStart.current.y + (gs.dy / H) * 100)));
        updateCorners({ ...cornersRef.current, tl: { x: newX, y: newY } });
      },
    })
  ).current;

  const trStart = useRef<CornerPoint>({ x: 95, y: 5 });
  const panTR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        trStart.current = { ...(cornersRef.current?.tr || { x: 95, y: 5 }) };
      },
      onPanResponderMove: (_, gs) => {
        const W = renderedImgRect.width || 300;
        const H = renderedImgRect.height || 400;
        const newX = Math.max(5, Math.min(100, Math.round(trStart.current.x + (gs.dx / W) * 100)));
        const newY = Math.max(0, Math.min(95, Math.round(trStart.current.y + (gs.dy / H) * 100)));
        updateCorners({ ...cornersRef.current, tr: { x: newX, y: newY } });
      },
    })
  ).current;

  const blStart = useRef<CornerPoint>({ x: 5, y: 95 });
  const panBL = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        blStart.current = { ...(cornersRef.current?.bl || { x: 5, y: 95 }) };
      },
      onPanResponderMove: (_, gs) => {
        const W = renderedImgRect.width || 300;
        const H = renderedImgRect.height || 400;
        const newX = Math.max(0, Math.min(95, Math.round(blStart.current.x + (gs.dx / W) * 100)));
        const newY = Math.max(5, Math.min(100, Math.round(blStart.current.y + (gs.dy / H) * 100)));
        updateCorners({ ...cornersRef.current, bl: { x: newX, y: newY } });
      },
    })
  ).current;

  const brStart = useRef<CornerPoint>({ x: 95, y: 95 });
  const panBR = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        brStart.current = { ...(cornersRef.current?.br || { x: 95, y: 95 }) };
      },
      onPanResponderMove: (_, gs) => {
        const W = renderedImgRect.width || 300;
        const H = renderedImgRect.height || 400;
        const newX = Math.max(5, Math.min(100, Math.round(brStart.current.x + (gs.dx / W) * 100)));
        const newY = Math.max(5, Math.min(100, Math.round(brStart.current.y + (gs.dy / H) * 100)));
        updateCorners({ ...cornersRef.current, br: { x: newX, y: newY } });
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
        if (stage === 'doc_detail') {
          setPages((prev) => [...prev, ...imported]);
        } else {
          setPages(imported);
          setSelectedIdx(0);
          const now = new Date();
          const autoName = `Scan_${now.getMonth() + 1}${now.getDate()}_${now.getHours()}${now.getMinutes()}`;
          setDocTitle(autoName);
          setStage('border_adjust');
        }
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
        const cleanName = file.name.replace(/\.pdf$/i, '');
        const destUri = `${FileSystem.documentDirectory}${Date.now()}_${file.name}`;
        await FileSystem.copyAsync({ from: file.uri, to: destUri });

        const newDoc: SavedScanDoc = {
          id: `doc_${Date.now()}`,
          title: cleanName,
          pdfUri: destUri,
          pageCount: 1,
          thumbnailUri: '',
          folderId: selectedFolderId,
          createdAt: Date.now(),
          fileSize: file.size,
        };
        await addSavedScanDoc(newDoc);
        await loadFoldersAndDocs();
        Alert.alert(
          'PDF Imported',
          `"${file.name}" has been added to ${selectedFolderId ? 'this folder' : 'your library'}. Would you like to open it now?`,
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Open Now', onPress: () => onOpenPdf(destUri, `${cleanName}.pdf`) },
          ]
        );
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
    const early = detectEarlyCorners(selectedPage.width, selectedPage.height);
    updateCorners(early);
  };

  const handleFullPhotoCrop = () => {
    updateCorners({ ...NO_QUAD_CORNERS });
  };

  const handleRotateCurrent = () => {
    if (!pages.length) return;
    setPages((prev) =>
      prev.map((p, i) => (i === selectedIdx ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    );
  };

  // Proceed to Step 2 (Filters) with True 4-Corner Perspective Warping Rectification
  const handleProceedToFilters = async () => {
    if (!pages.length) return;
    setIsProcessing(true);
    try {
      const warpedPages = await Promise.all(
        pages.map(async (p) => {
          try {
            const corners = p.corners || DEFAULT_QUAD_CORNERS;
            const res = await warpBridgeRef.current?.warpImage(p.originalUri || p.uri, corners, p.rotation);
            if (res && res.uri) {
              return {
                ...p,
                uri: res.uri,
                width: res.width,
                height: res.height,
                rotation: 0,
              };
            }
            return applyCropToPage(p);
          } catch (err) {
            console.warn('Perspective warp error on page, falling back:', err);
            return applyCropToPage(p);
          }
        })
      );
      setPages(warpedPages);
      setStage('filter_enhance');
    } catch (e: any) {
      Alert.alert('Processing', e?.message || 'Failed to rectify and crop document.');
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
        id: currentDoc ? currentDoc.id : `doc_${Date.now()}`,
        title: docTitle.trim() || result.name.replace(/\.pdf$/i, ''),
        pdfUri: result.uri,
        pageCount: pages.length,
        thumbnailUri: pages[0]?.uri || '',
        folderId: currentDoc?.folderId ?? selectedFolderId,
        createdAt: currentDoc?.createdAt ?? Date.now(),
        fileSize: result.size,
        pages: pages,
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

  // ── Document Operations (Share, Rename, Delete, Move, Open Detail) ───────
  const handleOpenDocDetail = (doc: SavedScanDoc) => {
    setCurrentDoc(doc);
    setDocTitle(doc.title);
    if (doc.pages && doc.pages.length > 0) {
      setPages(doc.pages);
    } else {
      const initialPages: ScannedPage[] = [
        {
          id: `page_${doc.id}_1`,
          uri: doc.thumbnailUri || doc.pdfUri,
          originalUri: doc.thumbnailUri || doc.pdfUri,
          rotation: 0,
          corners: { ...DEFAULT_QUAD_CORNERS },
          crop: { ...DEFAULT_AUTO_CROP },
          filter: 'doc',
        },
      ];
      setPages(initialPages);
    }
    setSelectedIdx(0);
    setStage('doc_detail');
  };

  const handleOpenPdfWithLatestChanges = async () => {
    if (!pages.length) {
      Alert.alert('No Pages', 'The document has no pages.');
      return;
    }
    setIsProcessing(true);
    try {
      const result = await compileScannedPagesToPdf(pages, currentDoc?.title || docTitle);
      const updatedDoc: SavedScanDoc = {
        id: currentDoc ? currentDoc.id : `doc_${Date.now()}`,
        title: (currentDoc?.title || docTitle).trim() || result.name.replace(/\.pdf$/i, ''),
        pdfUri: result.uri,
        pageCount: pages.length,
        thumbnailUri: pages[0]?.uri || '',
        folderId: currentDoc?.folderId ?? selectedFolderId,
        createdAt: currentDoc?.createdAt ?? Date.now(),
        fileSize: result.size,
        pages: pages,
      };
      await addSavedScanDoc(updatedDoc);
      await loadFoldersAndDocs();
      setCurrentDoc(updatedDoc);
      onOpenPdf(updatedDoc.pdfUri, `${updatedDoc.title}.pdf`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not compile and open PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShareDoc = async (doc: SavedScanDoc) => {
    try {
      const info = await FileSystem.getInfoAsync(doc.pdfUri);
      if (!info.exists) {
        Alert.alert('File Not Found', 'The scanned PDF could not be found at its storage path.');
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(doc.pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share ${doc.title}`,
          UTI: 'com.adobe.pdf',
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

  const handleOpenFolderMenu = (folder: ScannedFolder) => {
    setActiveMenuFolder(folder);
    setShowFolderMenuModal(true);
  };

  const handleStartRenameFolder = () => {
    if (!activeMenuFolder) return;
    setRenameFolderText(activeMenuFolder.name);
    setShowFolderMenuModal(false);
    setTimeout(() => {
      setShowRenameFolderModal(true);
    }, 200);
  };

  const handleExecuteRenameFolder = async () => {
    if (!activeMenuFolder || !renameFolderText.trim()) return;
    await renameScannerFolder(activeMenuFolder.id, renameFolderText.trim());
    await loadFoldersAndDocs();
    setShowRenameFolderModal(false);
    setActiveMenuFolder(null);
  };

  const handleExecuteDeleteFolder = (folder: ScannedFolder) => {
    setShowFolderMenuModal(false);
    Alert.alert(
      'Delete Folder',
      `Are you sure you want to delete "${folder.name}"? Documents inside will not be deleted; they will be moved to All Scans.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (selectedFolderId === folder.id) {
              setSelectedFolderId(null);
            }
            await deleteScannerFolder(folder.id);
            await loadFoldersAndDocs();
            setActiveMenuFolder(null);
          },
        },
      ]
    );
  };

  // ── Base64 Preview Generator for 100% Reliable WebView Rendering ────
  const [filterPreviewBase64, setFilterPreviewBase64] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    if (!selectedPage?.uri) {
      setFilterPreviewBase64('');
      return;
    }
    (async () => {
      try {
        const b64 = await FileSystem.readAsStringAsync(selectedPage.uri, { encoding: 'base64' });
        if (isMounted) {
          setFilterPreviewBase64(`data:image/jpeg;base64,${b64}`);
        }
      } catch (err) {
        if (isMounted) setFilterPreviewBase64(selectedPage.uri);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [selectedPage?.uri]);

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

    const imgSrc = filterPreviewBase64 || selectedPage.uri;

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
        <img src="${imgSrc}" />
      </body>
      </html>
    `;
  }, [selectedPage, currentFilter, isDark, filterPreviewBase64]);

  // ═════════════════════════════════════════════════════════════
  // MAIN SCREEN: SCANNER HOME (FOLDER LIST, SEARCH, TOP 3-DOTS)
  // ═════════════════════════════════════════════════════════════
  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Offscreen Hardware-Accelerated Perspective Warping Bridge */}
      <PerspectiveWarpBridge ref={warpBridgeRef} />

      {/* ── STAGE 1: FOLDER & ALL SCANS VIEW ── */}
      {stage === 'folder_view' && (
        <View style={{ flex: 1 }}>
          {/* ── Top Header with Folder Context, Search, and 3-Vertical-Dots Menu ── */}
          <View style={[styles.mainTopHeader, { backgroundColor: cardBg, borderColor: border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.headerIconBox, { backgroundColor: primaryColor + '18', width: 34, height: 34, borderRadius: 10 }]}>
                <Folder size={18} color={primaryColor} />
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: textColor }}>
                  {selectedFolderId === null ? 'All Scans' : (folders.find((f) => f.id === selectedFolderId)?.name || 'Folder')}
                </Text>
                <Text style={{ fontSize: 11, color: mutedColor, fontWeight: '600' }}>
                  {displayedDocs.length} {displayedDocs.length === 1 ? 'Document' : 'Documents'}
                </Text>
              </View>
            </View>

            <View style={styles.topRightActions}>
              {/* View Mode Toggle Button (Grid / List) */}
              <TouchableOpacity
                onPress={toggleViewMode}
                style={styles.iconCircleBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {viewMode === 'grid' ? (
                  <List size={20} color={textColor} />
                ) : (
                  <LayoutGrid size={20} color={textColor} />
                )}
              </TouchableOpacity>

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
            {/* Back Banner when inside a Folder */}
            {selectedFolderId !== null && (
              <View
                style={[
                  styles.folderBackBanner,
                  { backgroundColor: primaryColor + '12', borderColor: primaryColor + '30', justifyContent: 'space-between' },
                ]}
              >
                <TouchableOpacity
                  onPress={() => setSelectedFolderId(null)}
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                  activeOpacity={0.7}
                >
                  <ChevronLeft size={16} color={primaryColor} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: primaryColor, marginLeft: 4 }}>
                    Back to All Scans
                  </Text>
                  {folders.find((f) => f.id === selectedFolderId) && (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: textColor, marginLeft: 8 }} numberOfLines={1}>
                      • {folders.find((f) => f.id === selectedFolderId)?.name}
                    </Text>
                  )}
                </TouchableOpacity>

                {folders.find((f) => f.id === selectedFolderId) && (
                  <TouchableOpacity
                    onPress={() => handleOpenFolderMenu(folders.find((f) => f.id === selectedFolderId)!)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 4 }}
                    activeOpacity={0.7}
                  >
                    <MoreVertical size={18} color={primaryColor} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── FOLDERS IN GRID VIEW ── */}
            {selectedFolderId === null && folders.length > 0 && viewMode === 'grid' && (
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.sectionHeading, { color: mutedColor }]}>Folders ({folders.length})</Text>
                <View style={styles.gridContainer}>
                  {folders.map((f) => {
                    const docCount = savedDocs.filter((d) => d.folderId === f.id).length;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => setSelectedFolderId(f.id)}
                        style={[styles.gridCard, styles.gridFolderCard, { backgroundColor: cardBg, borderColor: border }]}
                        activeOpacity={0.75}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <View style={[styles.folderIconBox, { backgroundColor: '#f59e0b16' }]}>
                            <Folder size={24} color="#f59e0b" />
                          </View>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation?.();
                              handleOpenFolderMenu(f);
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={{ padding: 6, borderRadius: 10 }}
                            activeOpacity={0.6}
                          >
                            <MoreVertical size={18} color={mutedColor} />
                          </TouchableOpacity>
                        </View>
                        <View style={{ marginTop: 8 }}>
                          <Text style={[styles.gridTitle, { color: textColor }]} numberOfLines={1}>
                            {f.name}
                          </Text>
                          <Text style={[styles.gridSub, { color: mutedColor }]}>
                            {docCount} {docCount === 1 ? 'scan' : 'scans'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── FOLDERS IN LIST VIEW ── */}
            {selectedFolderId === null && folders.length > 0 && viewMode === 'list' && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[styles.sectionHeading, { color: mutedColor }]}>Folders ({folders.length})</Text>
                {folders.map((f) => {
                  const docCount = savedDocs.filter((d) => d.folderId === f.id).length;
                  return (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => setSelectedFolderId(f.id)}
                      style={[styles.listRow, { backgroundColor: cardBg, borderColor: border }]}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.folderIconBoxList, { backgroundColor: '#f59e0b16' }]}>
                        <Folder size={22} color="#f59e0b" />
                      </View>
                      <View style={{ flex: 1, paddingVertical: 4 }}>
                        <Text style={[styles.listTitle, { color: textColor }]} numberOfLines={1}>
                          {f.name}
                        </Text>
                        <Text style={[styles.listSub, { color: mutedColor }]}>
                          {docCount} {docCount === 1 ? 'document' : 'documents'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleOpenFolderMenu(f);
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ padding: 8, marginRight: 2 }}
                        activeOpacity={0.6}
                      >
                        <MoreVertical size={18} color={mutedColor} />
                      </TouchableOpacity>
                      <ChevronRight size={18} color={mutedColor} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Section title for documents if folders are also displayed */}
            {selectedFolderId === null && folders.length > 0 && displayedDocs.length > 0 && (
              <Text style={[styles.sectionHeading, { color: mutedColor }]}>
                Scanned Documents ({displayedDocs.length})
              </Text>
            )}

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
                      onPress={() => handleOpenDocDetail(doc)}
                      style={styles.gridThumbBox}
                      activeOpacity={0.8}
                    >
                      {doc.thumbnailUri ? (
                        <Image source={{ uri: doc.thumbnailUri }} style={styles.gridThumbImg} resizeMode="cover" />
                      ) : (
                        <FileText size={32} color="#dc2626" />
                      )}
                      <TouchableOpacity
                        onPress={() => onOpenPdf(doc.pdfUri, `${doc.title}.pdf`)}
                        style={styles.pdfBadge}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={styles.pdfBadgeText}>PDF</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>

                    <View style={styles.gridMetaRow}>
                      <TouchableOpacity
                        onPress={() => handleOpenDocDetail(doc)}
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
                    onPress={() => handleOpenDocDetail(doc)}
                    style={styles.listThumbBox}
                    activeOpacity={0.8}
                  >
                    {doc.thumbnailUri ? (
                      <Image source={{ uri: doc.thumbnailUri }} style={styles.listThumbImg} resizeMode="cover" />
                    ) : (
                      <FileText size={22} color="#dc2626" />
                    )}
                    <TouchableOpacity
                      onPress={() => onOpenPdf(doc.pdfUri, `${doc.title}.pdf`)}
                      style={styles.pdfBadge}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.pdfBadgeText}>PDF</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleOpenDocDetail(doc)}
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
        </View>
      )}

      {/* ── STAGE 2: DOCUMENT DETAIL / EDIT VIEW (IN-PAGE BENEATH ROOT TOP NAVBAR) ── */}
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

            {/* Red PDF Preview Button */}
            <TouchableOpacity
              onPress={handleOpenPdfWithLatestChanges}
              style={styles.headerPdfBtn}
              activeOpacity={0.8}
            >
              <FileText size={14} color="#ffffff" />
              <Text style={styles.headerPdfBtnText}>PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowDetailDotsMenu(true)}
              style={styles.iconCircleBtn}
            >
              <MoreVertical size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* Pages Grid with Direct Page Editing */}
          <ScrollView contentContainerStyle={styles.detailGridScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.pagesGrid}>
              {pages.map((p, idx) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => {
                    setSelectedIdx(idx);
                    setStage('border_adjust');
                  }}
                  style={[styles.pageGridCard, { backgroundColor: cardBg, borderColor: border }]}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: p.uri }} style={styles.pageGridImg} resizeMode="contain" />
                  <View style={styles.pageNumberBadge}>
                    <Text style={styles.pageNumberText}>{idx + 1}</Text>
                  </View>

                  {/* Quick Edit Overlay Bar */}
                  <View style={styles.pageCardActions}>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedIdx(idx);
                        setStage('border_adjust');
                      }}
                      style={styles.pageActionMiniBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Crop size={14} color="#ffffff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setSelectedIdx(idx);
                        setStage('filter_enhance');
                      }}
                      style={styles.pageActionMiniBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Wand2 size={14} color="#ffffff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setPages((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, rotation: (item.rotation + 90) % 360 } : item
                          )
                        );
                      }}
                      style={styles.pageActionMiniBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <RotateCw size={14} color="#ffffff" />
                    </TouchableOpacity>

                    {pages.length > 1 && (
                      <TouchableOpacity
                        onPress={() => {
                          setPages((prev) => prev.filter((_, i) => i !== idx));
                          setSelectedIdx(0);
                        }}
                        style={[styles.pageActionMiniBtn, { backgroundColor: 'rgba(239,68,68,0.85)' }]}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Trash2 size={14} color="#ffffff" />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              ))}

              {/* + Add Page Card */}
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Add Page',
                    'Choose how you want to add pages to this PDF:',
                    [
                      { text: 'Take Photo (Camera)', onPress: handleStartCamera },
                      { text: 'Pick from Gallery', onPress: handleImportGallery },
                      { text: 'Cancel', style: 'cancel' },
                    ]
                  );
                }}
                style={[
                  styles.pageGridCard,
                  styles.addPageCard,
                  { backgroundColor: cardBg, borderColor: border },
                ]}
                activeOpacity={0.8}
              >
                <View style={[styles.addPageCircle, { backgroundColor: primaryColor + '18' }]}>
                  <Plus size={26} color={primaryColor} />
                </View>
                <Text style={[styles.addPageText, { color: primaryColor }]}>+ Add Page</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Bottom Action Bar: Add Page, Share & View PDF */}
          <View style={[styles.detailBottomBar, { backgroundColor: cardBg, borderColor: border }]}>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Add Page',
                  'Choose how you want to add pages to this PDF:',
                  [
                    { text: 'Take Photo (Camera)', onPress: handleStartCamera },
                    { text: 'Pick from Gallery', onPress: handleImportGallery },
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
              style={[styles.addPageBottomBtn, { borderColor: border, borderWidth: 1, backgroundColor: cardBg }]}
              activeOpacity={0.85}
            >
              <Camera size={18} color={textColor} />
              <Text style={[styles.addPageBottomBtnText, { color: textColor }]}>Add Page</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (currentDoc) handleShareDoc(currentDoc);
              }}
              style={[styles.shareActionBtn, { backgroundColor: '#059669' }]}
              activeOpacity={0.85}
            >
              <Share2 size={18} color="#ffffff" />
              <Text style={styles.shareActionBtnText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleOpenPdfWithLatestChanges}
              style={[styles.openActionBtn, { backgroundColor: '#dc2626' }]}
              activeOpacity={0.85}
            >
              <FileText size={18} color="#ffffff" />
              <Text style={styles.openActionBtnText}>View PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
                setShowTopMenu(false);
                toggleViewMode();
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
                setTimeout(() => {
                  handleImportPdfDocument();
                }, 350);
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
                setTimeout(() => {
                  handleImportGallery();
                }, 350);
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
                setTimeout(() => {
                  setShowNewFolderModal(true);
                }, 250);
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
                const docToEdit = activeMenuDoc;
                setShowDocMenuModal(false);
                if (docToEdit) {
                  handleOpenDocDetail(docToEdit);
                }
              }}
            >
              <SlidersHorizontal size={18} color={primaryColor} />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Edit / Adjust Pages</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                const docToOpen = activeMenuDoc;
                setShowDocMenuModal(false);
                if (docToOpen) {
                  onOpenPdf(docToOpen.pdfUri, `${docToOpen.title}.pdf`);
                }
              }}
            >
              <Eye size={18} color="#0284c7" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>View PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                const docToShare = activeMenuDoc;
                setShowDocMenuModal(false);
                if (docToShare) {
                  setTimeout(() => {
                    handleShareDoc(docToShare);
                  }, 350);
                }
              }}
            >
              <Share2 size={18} color="#059669" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Share File</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                const docToRename = activeMenuDoc;
                setShowDocMenuModal(false);
                if (docToRename) {
                  setRenameText(docToRename.title);
                  setTimeout(() => {
                    setShowRenameModal(true);
                  }, 250);
                }
              }}
            >
              <Edit3 size={18} color="#2563eb" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setShowDocMenuModal(false);
                setTimeout(() => {
                  setShowMoveModal(true);
                }, 250);
              }}
            >
              <Move size={18} color="#d97706" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Move to Folder</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetOption, { borderTopWidth: 1, borderTopColor: border, marginTop: 4 }]}
              onPress={() => {
                const docToDelete = activeMenuDoc;
                setShowDocMenuModal(false);
                if (docToDelete) {
                  setTimeout(() => {
                    handleDeleteDoc(docToDelete.id);
                  }, 250);
                }
              }}
            >
              <Trash2 size={18} color="#ef4444" />
              <Text style={[styles.sheetOptionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Folder Item 3-Dots Menu ── */}
      <Modal
        visible={showFolderMenuModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFolderMenuModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowFolderMenuModal(false)}
        >
          <View style={[styles.actionSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <View style={styles.sheetHandle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={[styles.folderIconBoxList, { backgroundColor: '#f59e0b16', width: 36, height: 36, marginRight: 10 }]}>
                <Folder size={18} color="#f59e0b" />
              </View>
              <Text style={[styles.sheetTitle, { color: textColor, marginBottom: 0, flex: 1 }]} numberOfLines={1}>
                {activeMenuFolder?.name || 'Folder Options'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={handleStartRenameFolder}
            >
              <Edit3 size={18} color="#2563eb" />
              <Text style={[styles.sheetOptionText, { color: textColor }]}>Rename Folder</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetOption, { borderTopWidth: 1, borderTopColor: border, marginTop: 4 }]}
              onPress={() => {
                if (activeMenuFolder) {
                  handleExecuteDeleteFolder(activeMenuFolder);
                }
              }}
            >
              <Trash2 size={18} color="#ef4444" />
              <Text style={[styles.sheetOptionText, { color: '#ef4444' }]}>Delete Folder</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal: Rename Folder ── */}
      <Modal
        visible={showRenameFolderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameFolderModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.dialogBox, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <Text style={[styles.dialogTitle, { color: textColor }]}>Rename Folder</Text>
            <TextInput
              value={renameFolderText}
              onChangeText={setRenameFolderText}
              placeholder="Folder name..."
              placeholderTextColor={mutedColor}
              style={[
                styles.dialogInput,
                { color: textColor, borderColor: border, backgroundColor: isDark ? '#0f172a' : '#f8fafc' },
              ]}
              autoFocus
            />
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                onPress={() => setShowRenameFolderModal(false)}
                style={[styles.dialogBtn, { borderColor: border, borderWidth: 1 }]}
              >
                <Text style={{ color: mutedColor, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleExecuteRenameFolder}
                style={[styles.dialogBtn, { backgroundColor: primaryColor }]}
              >
                <Text style={{ color: '#ffffff', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
        visible={stage === 'border_adjust' || stage === 'filter_enhance'}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setStage(currentDoc ? 'doc_detail' : 'folder_view')}
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
                  onPress={() => setStage(currentDoc ? 'doc_detail' : 'folder_view')}
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

              {/* Main Canvas with True 4-Corner Draggable Loupe Handles */}
              <View
                style={styles.cropCanvasArea}
                onLayout={(e) => {
                  const { width, height } = e.nativeEvent.layout;
                  if (width > 0 && height > 0) {
                    setCropLayout({ width, height });
                  }
                }}
              >
                {selectedPage ? (() => {
                  const activeCorners = selectedPage.corners || DEFAULT_QUAD_CORNERS;
                  const W = renderedImgRect.width || 300;
                  const H = renderedImgRect.height || 400;
                  const offX = renderedImgRect.left || 0;
                  const offY = renderedImgRect.top || 0;

                  const pTL = { x: (activeCorners.tl.x / 100) * W + offX, y: (activeCorners.tl.y / 100) * H + offY };
                  const pTR = { x: (activeCorners.tr.x / 100) * W + offX, y: (activeCorners.tr.y / 100) * H + offY };
                  const pBR = { x: (activeCorners.br.x / 100) * W + offX, y: (activeCorners.br.y / 100) * H + offY };
                  const pBL = { x: (activeCorners.bl.x / 100) * W + offX, y: (activeCorners.bl.y / 100) * H + offY };

                  const t1 = { x: pTL.x + (pTR.x - pTL.x) * (1 / 3), y: pTL.y + (pTR.y - pTL.y) * (1 / 3) };
                  const t2 = { x: pTL.x + (pTR.x - pTL.x) * (2 / 3), y: pTL.y + (pTR.y - pTL.y) * (2 / 3) };
                  const b1 = { x: pBL.x + (pBR.x - pBL.x) * (1 / 3), y: pBL.y + (pBR.y - pBL.y) * (1 / 3) };
                  const b2 = { x: pBL.x + (pBR.x - pBR.x) * (2 / 3), y: pBL.y + (pBR.y - pBL.y) * (2 / 3) };

                  const l1 = { x: pTL.x + (pBL.x - pTL.x) * (1 / 3), y: pTL.y + (pBL.y - pTL.y) * (1 / 3) };
                  const l2 = { x: pTL.x + (pBL.x - pTL.x) * (2 / 3), y: pTL.y + (pBL.y - pTL.y) * (2 / 3) };
                  const r1 = { x: pTR.x + (pBR.x - pTR.x) * (1 / 3), y: pTR.y + (pBR.y - pTR.y) * (1 / 3) };
                  const r2 = { x: pTR.x + (pBR.x - pTR.x) * (2 / 3), y: pTR.y + (pBR.y - pTR.y) * (2 / 3) };

                  return (
                    <View style={styles.cropCanvasInner}>
                      <Image
                        source={{ uri: selectedPage.originalUri || selectedPage.uri }}
                        style={{
                          position: 'absolute',
                          left: offX,
                          top: offY,
                          width: W,
                          height: H,
                          transform: [{ rotate: `${selectedPage.rotation}deg` }],
                        }}
                        resizeMode="contain"
                      />

                      {/* SVG Perspective Polygon & 3x3 Dashed Grid */}
                      <Svg
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                        width={cropLayout.width || 300}
                        height={cropLayout.height || 400}
                      >
                        <Polygon
                          points={`${pTL.x},${pTL.y} ${pTR.x},${pTR.y} ${pBR.x},${pBR.y} ${pBL.x},${pBL.y}`}
                          fill="rgba(16, 185, 129, 0.16)"
                          stroke="#10b981"
                          strokeWidth={2.5}
                        />
                        <Line x1={t1.x} y1={t1.y} x2={b1.x} y2={b1.y} stroke="#10b981" strokeWidth={1} strokeDasharray="5,5" opacity={0.65} />
                        <Line x1={t2.x} y1={t2.y} x2={b2.x} y2={b2.y} stroke="#10b981" strokeWidth={1} strokeDasharray="5,5" opacity={0.65} />
                        <Line x1={l1.x} y1={l1.y} x2={r1.x} y2={r1.y} stroke="#10b981" strokeWidth={1} strokeDasharray="5,5" opacity={0.65} />
                        <Line x1={l2.x} y1={l2.y} x2={r2.x} y2={r2.y} stroke="#10b981" strokeWidth={1} strokeDasharray="5,5" opacity={0.65} />
                      </Svg>

                      {/* 4 True Draggable Corner Loupe Handles */}
                      <View
                        {...panTL.panHandlers}
                        style={[styles.draggableLoupe, { left: pTL.x - 22, top: pTL.y - 22 }]}
                        hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
                      >
                        <View style={styles.loupeRing}>
                          <View style={styles.loupeDot} />
                        </View>
                      </View>

                      <View
                        {...panTR.panHandlers}
                        style={[styles.draggableLoupe, { left: pTR.x - 22, top: pTR.y - 22 }]}
                        hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
                      >
                        <View style={styles.loupeRing}>
                          <View style={styles.loupeDot} />
                        </View>
                      </View>

                      <View
                        {...panBR.panHandlers}
                        style={[styles.draggableLoupe, { left: pBR.x - 22, top: pBR.y - 22 }]}
                        hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
                      >
                        <View style={styles.loupeRing}>
                          <View style={styles.loupeDot} />
                        </View>
                      </View>

                      <View
                        {...panBL.panHandlers}
                        style={[styles.draggableLoupe, { left: pBL.x - 22, top: pBL.y - 22 }]}
                        hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
                      >
                        <View style={styles.loupeRing}>
                          <View style={styles.loupeDot} />
                        </View>
                      </View>
                    </View>
                  );
                })() : null}
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

              {/* Visual Filter Canvas (WebView WYSIWYG Rendering with Instant Native Fallback) */}
              <View style={styles.filterCanvasArea}>
                {selectedPage && (
                  <Image
                    source={{ uri: selectedPage.uri }}
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        width: '100%',
                        height: '100%',
                        transform: [{ rotate: `${selectedPage.rotation}deg` }],
                      },
                    ]}
                    resizeMode="contain"
                  />
                )}
                {filterPreviewBase64 ? (
                  <WebViewAny
                    originWhitelist={['*']}
                    allowFileAccess
                    allowFileAccessFromFileURLs
                    allowUniversalAccessFromFileURLs
                    source={{ html: filterPreviewHtml }}
                    scrollEnabled={false}
                    style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                  />
                ) : (
                  <View style={styles.filterLoadingOverlay}>
                    <ActivityIndicator size="small" color={primaryColor} />
                  </View>
                )}
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
    paddingBottom: 84,
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
    bottom: 14,
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
  headerPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginRight: 8,
  },
  headerPdfBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  gridFolderCard: {
    padding: 12,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  folderIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderIconBoxList: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  folderBackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  draggableLoupe: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  loupeRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 5,
  },
  loupeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  filterLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  pageCardActions: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  pageActionMiniBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPageCard: {
    borderStyle: 'dashed',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addPageCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPageText: {
    fontSize: 13,
    fontWeight: '700',
  },
  addPageBottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 23,
  },
  addPageBottomBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
