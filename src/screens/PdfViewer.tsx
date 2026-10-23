import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Platform, Modal,
  Animated, TextInput, Dimensions, KeyboardAvoidingView, Image,
  StatusBar as RNStatusBar, TurboModuleRegistry, BackHandler,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

let GoogleSignin: any = null;
let GoogleSigninStatusCodes: any = {};
if (Platform.OS !== 'web') {
  try {
    const { NativeModules } = require('react-native');
    const hasNative = !!(NativeModules && NativeModules.RNGoogleSignin) ||
      (TurboModuleRegistry && typeof TurboModuleRegistry.get === 'function' && !!TurboModuleRegistry.get('RNGoogleSignin'));
    if (hasNative) {
      const gsModule = require('@react-native-google-signin/google-signin');
      GoogleSignin = gsModule.GoogleSignin;
      GoogleSigninStatusCodes = gsModule.statusCodes || {};
    }
  } catch { }
}

import appIcon from '../assets/icon.png';
import appIconDark from '../assets/icon_dark.png';

// ── Persistent Cached Brand Logo (Zero Flicker, Zero Fade Duration, Never Disappears) ──
const CachedAppLogo = React.memo(({ isDark, size = 33 }: { isDark: boolean; size?: number }) => (
  <View style={{
    width: size, height: size, borderRadius: size * 0.25,
    overflow: 'hidden',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
  }}>
    <Image
      source={appIcon}
      style={{ width: size, height: size, position: 'absolute', opacity: isDark ? 0 : 1 }}
      resizeMode="cover"
      fadeDuration={0}
    />
    <Image
      source={appIconDark}
      style={{ width: size, height: size, position: 'absolute', opacity: isDark ? 1 : 0 }}
      resizeMode="cover"
      fadeDuration={0}
    />
  </View>
));

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
const WebViewAny = WebView as any;
import {
  FolderOpen, Play, Pause, Square, Volume2, ChevronLeft, ChevronRight,
  Eye, Volume1, ArrowLeft, SkipBack, SkipForward, FileText, Coffee,
  Search, Bookmark, BookmarkCheck, List, X, ZoomIn, ZoomOut,
  Clock, Trash2, Copy, Hash, RefreshCw, ChevronDown, Sparkles, MoreHorizontal,
  BookOpen, ListTree, HardDrive, Cloud, Plus, Folder, Lock, ExternalLink, Link,
  LogOut, Check, MoreVertical, Download, CheckCircle2, Edit3,
  Moon, Sun, Star, Leaf, Share2, Home, Wrench,
  Camera, RotateCw, ScanLine, FilePlus, Wand2, Type
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AcrobatBottomNav, NavTabType } from '../components/AcrobatBottomNav';
import { ScannerStudio } from '../components/ScannerStudio';
import { ConverterHub } from '../components/ConverterHub';
import { ImageConverterModal, ImageConvertMode } from '../components/ImageConverterModal';
import { DocxConverterModal, DocxMode } from '../components/DocxConverterModal';
import { TextToPdfModal } from '../components/TextToPdfModal';
import { PdfToTextModal } from '../components/PdfToTextModal';
import { CompressPdfModal } from '../components/CompressPdfModal';
import { GoogleDriveIcon } from '../components/GoogleDriveIcon';
// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------
const { width: SCREEN_W } = Dimensions.get('window');

interface RecentFile { uri: string; name: string; openedAt: number; size?: number; }
interface BookmarkEntry { page: number; note: string; addedAt: number; }
export interface OutlineItem { title: string; page?: number | null; items?: OutlineItem[]; }

export const formatRecentFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const STORAGE_RECENT = '@pdfReader_recentFiles';
const STORAGE_BOOKMARKS_PREFIX = '@pdfReader_bookmarks_';
const STORAGE_GOOGLE_DRIVES = '@pdfReader_googleDrives';
const STORAGE_OFFLINE_DRIVE = '@pdfReader_offlineDriveFiles';
const OFFLINE_DRIVE_DIR = `${FileSystem.documentDirectory}offline_drive_pdfs/`;

export interface ConnectedDrive {
  id: string;
  name: string;
  type: 'shared_folder' | 'oauth';
  folderId?: string;
  accessToken?: string;
  userEmail?: string;
  addedAt: number;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
}

const READER_THEMES = [
  { key: 'app', label: 'App', bg: null, text: null, muted: null, webBg: '#1a1a2e', webText: '#e2e8f0' },
  { key: 'white', label: 'White', bg: '#f8f9fa', text: '#1a1a2e', muted: '#6b7280', webBg: '#f8f9fa', webText: '#1a1a2e' },
  { key: 'sepia', label: 'Sepia', bg: '#f5e9d0', text: '#3b2c1a', muted: '#7a6048', webBg: '#f5e9d0', webText: '#3b2c1a' },
  { key: 'night', label: 'Night', bg: '#0f172a', text: '#e2e8f0', muted: '#94a3b8', webBg: '#0f172a', webText: '#e2e8f0' },
  { key: 'forest', label: 'Forest', bg: '#1a2e1a', text: '#d4edda', muted: '#86b89a', webBg: '#1a2e1a', webText: '#d4edda' },
  { key: 'dusk', label: 'Dusk', bg: '#2d1b69', text: '#ede9fe', muted: '#a78bfa', webBg: '#2d1b69', webText: '#ede9fe' },
];

// ---------------------------------------------------------------------------
// PDF.js WebView HTML builder
// ---------------------------------------------------------------------------
const buildViewerHtml = (webBg: string, webText: string, topPadding: number = 24, hasAppHeader: boolean = false): string => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html{margin:0;padding:0;width:100%;height:100%;background:${webBg};overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;}
body{margin:0;padding:0;width:100%;min-height:100%;background:${webBg};overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;}
#pdf-wrap{display:flex;flex-direction:column;align-items:center;padding:${hasAppHeader ? 88 : topPadding + 88}px 4px 8px 4px;gap:8px;width:100%;will-change:transform;}
/* NO contain:content here - it clips absolutely-positioned overlay link divs */
.page-item{position:relative;box-shadow:0 2px 18px rgba(0,0,0,0.32);background:#fff;min-height:350px;width:100%;max-width:100%;touch-action:pan-y;scroll-margin-top:${hasAppHeader ? 90 : topPadding + 90}px;}
/* Style internal and external PDF link annotation overlays so they are visible and tappable */
.page-item div[data-pdf-dest], .page-item div[data-pdf-url] {
  border: none !important;
  background-color: transparent !important;
  pointer-events: auto !important;
}
canvas{display:block;max-width:100%;transform:translateZ(0);image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges;touch-action:pan-y;}
.pg-badge{position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,0.45);color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;z-index:5;pointer-events:none;}
.doc-rendered-page{background:#fff;color:#0f172a;width:96%;max-width:860px;min-height:80vh;padding:36px 28px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.22);line-height:1.7;font-size:14.5px;margin:0 auto 24px auto;box-sizing:border-box;word-break:break-word;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
.doc-rendered-page h1,.doc-rendered-page h2,.doc-rendered-page h3{color:#1e3a8a;margin-top:16px;margin-bottom:8px;font-weight:700;}
.doc-rendered-page table{width:100% !important;border-collapse:collapse;margin:14px 0;}
.doc-rendered-page td,.doc-rendered-page th{padding:8px 10px;border:1px solid #e2e8f0;}
.doc-rendered-page .header-table td,.doc-rendered-page .header-table th{border:none !important;padding:0 !important;}
.doc-rendered-page p{margin:6px 0;}
#status{color:${webText};text-align:center;padding:60px 20px;font-size:14px;line-height:22px;}
#search-bar{display:none;position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.85);padding:8px 10px;z-index:999;flex-direction:row;align-items:center;gap:8px;}
#search-input{flex:1;padding:6px 10px;border-radius:8px;border:none;font-size:14px;background:#fff;color:#000;}
.sh-btn{background:rgba(255,255,255,0.2);color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;}
mark{background:rgba(255,210,0,0.55);color:inherit;border-radius:2px;}
mark.active{background:rgba(255,140,0,0.75);}
#search-info{color:#fff;font-size:11px;min-width:40px;text-align:center;}
</style>
</head>
<body>
<div id="search-bar">
  <input id="search-input" placeholder="Find in document..." oninput="onSearchInput()" />
  <span id="search-info"></span>
  <button class="sh-btn" onclick="prevMatch()">&#8593;</button>
  <button class="sh-btn" onclick="nextMatch()">&#8595;</button>
  <button class="sh-btn" onclick="closeSearch()">&#10005;</button>
</div>
<div id="status">Waiting for document...</div>
<div id="pdf-wrap" style="display:none;"></div>

<script>
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
var pdf=null,totalPages=0,pageEls={},allText={},matchNodes=[],matchIdx=0,globalLoadPage=null;
var currentTargetPage=null,isProgrammaticScroll=false,scrollTimeoutId=null;

function cancelPendingScroll() {
  if (scrollTimeoutId) {
    clearTimeout(scrollTimeoutId);
    scrollTimeoutId = null;
  }
  isProgrammaticScroll = false;
  currentTargetPage = null;
}

var THEME_FILTERS = {
  app: 'invert(0.92) hue-rotate(180deg) contrast(0.92) brightness(0.9)',
  night: 'invert(0.92) hue-rotate(180deg) contrast(0.92) brightness(0.9)',
  sepia: 'sepia(0.45) contrast(0.95) brightness(0.95)',
  forest: 'invert(0.9) hue-rotate(110deg) contrast(0.9) brightness(0.85)',
  dusk: 'invert(0.9) hue-rotate(220deg) contrast(0.9) brightness(0.85)',
  white: 'none'
};

function applyThemeFilter(key, bg, deep) {
  if (bg) { document.body.style.background = bg; }
  var filter = (deep !== false) ? (THEME_FILTERS[key] || 'none') : 'none';
  var styleEl = document.getElementById('theme-filter-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'theme-filter-style';
    document.head.appendChild(styleEl);
  }
  styleEl.innerHTML = '.page-item canvas, .doc-rendered-page { filter: ' + filter + ' !important; transition: filter 0.3s ease; }';
}

function send(data){
  try {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    } else {
      window.parent.postMessage(JSON.stringify(data), '*');
    }
  } catch(e) {}
}

function scrollTargetPage(p, smooth) {
  var docEl = document.querySelector('.doc-rendered-page');
  if (docEl && totalPages > 0) {
    var ratio = (p - 1) / totalPages;
    var targetY = Math.max(0, docEl.offsetTop + (docEl.offsetHeight * ratio) - 80);
    if (smooth !== false) {
      try { window.scrollTo({ top: targetY, behavior: 'smooth' }); } catch(e) { window.scrollTo(0, targetY); }
    } else {
      window.scrollTo(0, targetY);
    }
    document.documentElement.scrollTop = targetY;
    document.body.scrollTop = targetY;
    return;
  }
  var el = document.getElementById('page-' + p);
  if (!el) return;
  var offsetHeader = ${hasAppHeader ? 88 : topPadding + 88};
  var top = 0;
  var cur = el;
  while (cur) {
    top += cur.offsetTop;
    cur = cur.offsetParent;
  }
  var targetY = Math.max(0, top - offsetHeader);

  if (smooth !== false) {
    try {
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    } catch(e) {
      window.scrollTo(0, targetY);
    }
  } else {
    window.scrollTo(0, targetY);
  }
  document.documentElement.scrollTop = targetY;
  document.body.scrollTop = targetY;
}

function goToPage(pageNum) {
  if (!pageNum || pageNum < 1) return;
  var p = parseInt(pageNum, 10);
  if (isNaN(p)) return;
  
  cancelPendingScroll();
  isProgrammaticScroll = true;
  currentTargetPage = p;

  var loadFn = globalLoadPage || window.loadPageExternal;
  if (typeof loadFn === 'function') {
    loadFn(p);
    if (p - 1 > 0) loadFn(p - 1);
    if (p + 1 <= totalPages) loadFn(p + 1);
  }

  scrollTargetPage(p, true);
  send({ type: 'PAGE_CHANGE', page: p });

  scrollTimeoutId = setTimeout(function() {
    isProgrammaticScroll = false;
    currentTargetPage = null;
    scrollTimeoutId = null;
  }, 500);
}

window.goToPage = goToPage;

var currentScale = 1.0;
var panX = 0;
var panY = 0;

function updateTransform(animate) {
  var wrap = document.getElementById('pdf-wrap');
  if (!wrap) return;
  if (currentScale <= 1.02) {
    currentScale = 1.0; panX = 0; panY = 0;
    wrap.style.transition = animate ? 'transform 0.28s cubic-bezier(0.2, 0, 0.2, 1)' : 'none';
    wrap.style.transform = 'none';
  } else {
    var W = window.innerWidth;
    var H = window.innerHeight;
    var maxPanX = (W * (currentScale - 1)) / 2 + (W * 0.25);
    panX = Math.max(-maxPanX, Math.min(maxPanX, panX));

    var untransformedTop = wrap.offsetTop - (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0);
    var wrapH = wrap.offsetHeight || wrap.scrollHeight || (H * 2);
    var scaledH = wrapH * currentScale;

    if (scaledH <= H) {
      panY = ((H - scaledH) / 2) - untransformedTop;
    } else {
      var minPanY = H - 80 - untransformedTop - scaledH;
      var maxPanY = -untransformedTop + 40;
      panY = Math.max(minPanY, Math.min(maxPanY, panY));
    }

    wrap.style.transition = animate ? 'transform 0.28s cubic-bezier(0.2, 0, 0.2, 1)' : 'none';
    wrap.style.transform = 'translate3d(' + panX.toFixed(2) + 'px,' + panY.toFixed(2) + 'px,0) scale(' + currentScale.toFixed(3) + ')';
    wrap.style.transformOrigin = 'center top';
  }
}

function handleDoubleTapZoom(tapX, tapY) {
  var wrap = document.getElementById('pdf-wrap');
  if (!wrap) return;

  if (currentScale > 1.15) {
    // Zoom out smoothly to full-width 1.0x
    currentScale = 1.0;
    panX = 0;
    panY = 0;
    updateTransform(true);
    return;
  }

  // Smooth focal zoom directly into the double-tapped location (2.4x)
  var targetScale = 2.4;
  var W = window.innerWidth;
  var H = window.innerHeight;
  var Cx = W / 2;

  var untransformedTop = wrap.offsetTop - (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0);

  // Center horizontally around the double-tapped X coordinate
  var targetPanX = -(tapX - Cx) * targetScale;
  var maxPanX = (W * (targetScale - 1)) / 2;
  panX = Math.max(-maxPanX, Math.min(maxPanX, targetPanX));

  // Focus vertically on the tapped Y coordinate in the optimal mobile reading area
  var distFromWrapTop = tapY - untransformedTop;
  var targetY = Math.min(Math.max(tapY, H * 0.32), H * 0.52);
  var targetPanY = (targetY - untransformedTop) - (distFromWrapTop * targetScale);

  var wrapH = wrap.offsetHeight || wrap.scrollHeight || (H * 2);
  var scaledH = wrapH * targetScale;
  if (scaledH <= H) {
    panY = ((H - scaledH) / 2) - untransformedTop;
  } else {
    var minPanY = H - 80 - untransformedTop - scaledH;
    var maxPanY = -untransformedTop + 40;
    panY = Math.max(minPanY, Math.min(maxPanY, targetPanY));
  }

  currentScale = targetScale;
  updateTransform(true);
}

function zoomAll(factor) {
  if (factor === null) { currentScale = 1.0; panX = 0; panY = 0; }
  else { currentScale = Math.min(Math.max(currentScale * factor, 0.5), 4.0); }
  if (currentScale <= 1.02) { currentScale = 1.0; panX = 0; panY = 0; }
  updateTransform(true);
}

window.onload=function(){
  if(window.PDF_BASE64){ loadPDF(window.PDF_BASE64); }
  
  var singleTapTimer = null;

  // Single document-level click handler (debounced so single tap toggles controls, double tap does not)
  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.pdfDest) {
        e.preventDefault(); e.stopPropagation();
        var destStr = el.dataset.pdfDest;
        send({ type: 'LINK_TAP', dest: destStr });
        try {
          var destData = JSON.parse(destStr);
          if (typeof destData === 'number') {
            goToPage(destData);
          } else if (destData.page) {
            goToPage(destData.page);
          } else if (destData.named && pdf) {
            pdf.getDestination(destData.named).then(function(d){
              if (Array.isArray(d) && d[0]) {
                var dFirst = d[0];
                if (dFirst && typeof dFirst === 'object' && typeof dFirst.num === 'number') {
                  pdf.getPageIndex(dFirst).then(function(i){ goToPage(i+1); });
                } else if (typeof dFirst === 'number') {
                  goToPage(dFirst + 1);
                }
              }
            });
          }
        } catch(ex) { goToPage(parseInt(destStr, 10) || 1); }
        return;
      }
      if (el.dataset && el.dataset.pdfUrl) {
        e.preventDefault(); e.stopPropagation();
        send({ type: 'LINK_TAP_URL', url: el.dataset.pdfUrl });
        window.open(el.dataset.pdfUrl, '_blank');
        return;
      }
      el = el.parentElement;
    }
    // Normal tap on PDF (not a link, button, or search bar) — debounced to avoid toolbar flickers on double tap
    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && !e.target.closest('#search-bar') && !e.target.closest('#controls')) {
      if (singleTapTimer) {
        clearTimeout(singleTapTimer);
        singleTapTimer = null;
      }
      singleTapTimer = setTimeout(function() {
        singleTapTimer = null;
        send({ type: 'PDF_TAP' });
      }, 260);
    }
  }, true);

  // ── Double-tap focal zoom & natural 2-finger focal pinch-to-zoom ────
  var lastTapTime = 0, lastTapX = 0, lastTapY = 0;
  var isDragging = false, lastTouchX = 0, lastTouchY = 0, touchMoved = false;
  var isPinching = false;
  var lastPinchDist = 0;
  var pinchStartScale = 1.0;
  var pinchStartPanX = 0;
  var pinchStartPanY = 0;
  var pinchStartCenterX = 0;
  var pinchStartCenterY = 0;
  var rafId = null;

  document.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      if (singleTapTimer) { clearTimeout(singleTapTimer); singleTapTimer = null; }
      isDragging = false;
      isPinching = true;
      var t0 = e.touches[0], t1 = e.touches[1];
      lastPinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      pinchStartScale = currentScale;
      pinchStartPanX = panX;
      pinchStartPanY = panY;
      pinchStartCenterX = (t0.clientX + t1.clientX) / 2;
      pinchStartCenterY = (t0.clientY + t1.clientY) / 2;
      e.preventDefault();
      return;
    }
    isPinching = false;
    if (e.touches.length === 1) {
      var t = e.touches[0];
      var now = Date.now();
      var timeDiff = now - lastTapTime;
      var dx = Math.abs(t.clientX - lastTapX);
      var dy = Math.abs(t.clientY - lastTapY);

      if (timeDiff > 40 && timeDiff < 340 && dx < 48 && dy < 48) {
        // Double tap confirmed! Cancel pending single-tap and smoothly zoom into tapped focal point
        if (singleTapTimer) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
        }
        e.preventDefault();
        lastTapTime = 0;
        isDragging = false;
        handleDoubleTapZoom(t.clientX, t.clientY);
        return;
      }

      lastTapTime = now;
      lastTapX = t.clientX;
      lastTapY = t.clientY;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
      isDragging = true;
      touchMoved = false;
    } else {
      isDragging = false;
    }
  }, { passive: false });

  document.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2 && isPinching) {
      if (singleTapTimer) { clearTimeout(singleTapTimer); singleTapTimer = null; }
      var t0 = e.touches[0], t1 = e.touches[1];
      var dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      if (lastPinchDist > 5) {
        var currentCenterX = (t0.clientX + t1.clientX) / 2;
        var currentCenterY = (t0.clientY + t1.clientY) / 2;

        var scaleFactor = dist / lastPinchDist;
        var newScale = Math.min(Math.max(pinchStartScale * scaleFactor, 0.75), 4.5);

        if (newScale <= 1.02) {
          currentScale = 1.0;
          panX = 0;
          panY = 0;
        } else {
          currentScale = newScale;
          var W = window.innerWidth;
          var Cx = W / 2;
          var wrap = document.getElementById('pdf-wrap');
          var untransformedTop = wrap ? (wrap.offsetTop - (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0)) : 0;

          // Focal scaling formula: whatever point is between the two fingers stays exactly between the two fingers
          var ratio = currentScale / pinchStartScale;
          panX = (currentCenterX - Cx) - ((pinchStartCenterX - Cx - pinchStartPanX) * ratio);
          panY = (currentCenterY - untransformedTop) - ((pinchStartCenterY - untransformedTop - pinchStartPanY) * ratio);
        }

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(function() { updateTransform(false); rafId = null; });
      }
      e.preventDefault();
      return;
    }
    if (isDragging && e.touches.length === 1 && currentScale > 1.05) {
      var t = e.touches[0];
      var dX = t.clientX - lastTouchX;
      var dY = t.clientY - lastTouchY;
      if (Math.abs(dX) > 1.5 || Math.abs(dY) > 1.5) {
        if (singleTapTimer) { clearTimeout(singleTapTimer); singleTapTimer = null; }
        touchMoved = true;
        panX += dX;
        panY += dY;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(function() { updateTransform(false); rafId = null; });
        e.preventDefault();
      }
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    }
  }, { passive: false });

  document.addEventListener('touchend', function(e) {
    if (e.touches.length < 2) {
      isPinching = false;
      lastPinchDist = 0;
    }
    if (e.touches.length === 1) {
      var t = e.touches[0];
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
      isDragging = true;
      touchMoved = false;
    }
    if (e.touches.length === 0) {
      isDragging = false;
      if (currentScale > 1.02) {
        updateTransform(true);
      }
    }
  });

  // Desktop / mouse double-click support
  document.addEventListener('dblclick', function(e) {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('#search-bar') || e.target.closest('#controls')) return;
    if (singleTapTimer) { clearTimeout(singleTapTimer); singleTapTimer = null; }
    e.preventDefault();
    handleDoubleTapZoom(e.clientX, e.clientY);
  });

  var lastScrollTop = 0, scrollTimer = null;
  window.addEventListener('scroll', function() {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function() {
      var st = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (Math.abs(st - lastScrollTop) > 30) {
        if (st > lastScrollTop && st > 100) {
          send({ type: 'PDF_SCROLL_DOWN' });
        } else {
          send({ type: 'PDF_SCROLL_UP' });
        }
        lastScrollTop = st;
      }
      scrollTimer = null;
    }, 150);
  }, { passive: true });
};

window.receiveCmd=function(json){
  try{
    var cmd = (typeof json === 'string') ? JSON.parse(json) : json;
    if (typeof cmd === 'string') { cmd = JSON.parse(cmd); }
    if (!cmd || typeof cmd !== 'object') return;
    if(cmd.action==='LOAD' && cmd.base64){ loadPDF(cmd.base64); }
    if(cmd.action==='GOTO'){ goToPage(cmd.page); }
    if(cmd.action==='THEME'){ applyThemeFilter(cmd.key, cmd.bg, cmd.deep); }
    if(cmd.action==='SEARCH_OPEN'){ openSearch(); }
    if(cmd.action==='ZOOM_IN'){ zoomAll(1.25); }
    if(cmd.action==='ZOOM_OUT'){ zoomAll(0.8); }
    if(cmd.action==='ZOOM_RESET'){ zoomAll(null); }
    if(cmd.action==='RESIZE'){ resizeAllPages(); }
    if(cmd.action==='GET_PAGE_IMAGE'){
      var pageEl=document.getElementById('page-'+cmd.page);
      if(pageEl){
        var canvas=pageEl.querySelector('canvas');
        if(canvas){
          var styleEl = document.getElementById('theme-filter-style');
          var oldContent = styleEl ? styleEl.innerHTML : '';
          if (styleEl) styleEl.innerHTML = '.page-item canvas { filter: none !important; }';
          var mime = (cmd.format === 'jpg' || cmd.format === 'jpeg') ? 'image/jpeg' : 'image/png';
          var dataUrl = canvas.toDataURL(mime, cmd.quality || 0.95);
          if (styleEl) styleEl.innerHTML = oldContent;
          if (cmd.isExport) {
            send({type:'PAGE_IMAGE_EXPORTED',page:cmd.page,image:dataUrl,format:cmd.format || 'png'});
          } else {
            send({type:'AI_OCR_IMAGE',page:cmd.page,image:dataUrl});
          }
        }else{
          send({type:'AI_OCR_IMAGE_ERROR',page:cmd.page,error:'Page canvas not ready yet'});
        }
      }else{
        send({type:'AI_OCR_IMAGE_ERROR',page:cmd.page,error:'Page elements not rendered yet'});
      }
    }
  }catch(e){}
};

window.addEventListener('message', function(event) {
  try {
    var data = event.data;
    if (typeof data === 'string') {
      receiveCmd(data);
    } else if (typeof data === 'object' && data.action) {
      receiveCmd(JSON.stringify(data));
    }
  } catch(e) {}
});



// Re-render all rendered pages at the new viewport width (called on orientation change)
function resizeAllPages() {
  if (!pdf) return;
  var newSw = window.innerWidth - 8;
  var dpr = window.devicePixelRatio || 1;
  // Clear & re-render every page that has already been rendered
  var items = document.querySelectorAll('.page-item');
  items.forEach(function(div) {
    var pageNum = parseInt(div.dataset.page, 10);
    var canvas = div.querySelector('canvas');
    if (!canvas) return; // not yet rendered — IntersectionObserver will handle it at new width
    pdf.getPage(pageNum).then(function(page) {
      var vp = page.getViewport({ scale: 1 });
      var scale = newSw / vp.width;
      var svp = page.getViewport({ scale: scale });
      // Resize the existing canvas in place (avoids scroll jump)
      canvas.width = svp.width * dpr;
      canvas.height = svp.height * dpr;
      canvas.style.width = svp.width + 'px';
      canvas.style.height = svp.height + 'px';
      div.style.height = 'auto'; div.style.minHeight = 'auto';
      var ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      page.render({ canvasContext: ctx, viewport: svp });
    }).catch(function(){});
  });
}

function renderHtmlDoc(htmlContent) {
  document.getElementById('status').style.display='none';
  var wrap = document.getElementById('pdf-wrap');
  wrap.style.display='flex';
  wrap.innerHTML = '';

  var container = document.createElement('div');
  container.className = 'doc-rendered-page';
  container.innerHTML = htmlContent;
  wrap.appendChild(container);

  var fullText = container.innerText || container.textContent || '';
  var charsPerPage = 1800;
  totalPages = Math.max(1, Math.ceil(fullText.length / charsPerPage));
  send({ type: 'TOTAL_PAGES', total: totalPages });

  for (var p = 1; p <= totalPages; p++) {
    var pStart = (p - 1) * charsPerPage;
    var pText = fullText.slice(pStart, pStart + charsPerPage);
    allText[p] = pText;
    send({ type: 'PAGE_TEXT', page: p, text: pText });
  }

  var headings = container.querySelectorAll('h1, h2, h3, h4');
  var outline = [];
  headings.forEach(function(h) {
    var title = (h.innerText || '').trim();
    if (title) {
      outline.push({ title: title.slice(0, 60), page: 1 });
    }
  });
  send({ type: 'OUTLINE', outline: outline });
}

function loadPDF(base64){
  document.getElementById('status').textContent='Loading document...';
  try{
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for(var i=0;i<binary.length;i++){ bytes[i]=binary.charCodeAt(i); }

    var isPdf = binary.slice(0, 10).indexOf('%PDF') !== -1;
    if (isPdf) {
      var blob = new Blob([bytes], {type:'application/pdf'});
      var url = URL.createObjectURL(blob);
      pdfjsLib.getDocument({url:url}).promise.then(function(doc){
        URL.revokeObjectURL(url);
        pdf=doc; totalPages=doc.numPages;
        document.getElementById('status').style.display='none';
        document.getElementById('pdf-wrap').style.display='flex';
        send({type:'TOTAL_PAGES',total:totalPages});
        renderAll(doc);
        extractOutline(doc);
      }).catch(function(err){
        URL.revokeObjectURL(url);
        document.getElementById('status').textContent='Error loading PDF: '+err.message;
        send({type:'ERROR',error:err.message});
      });
      return;
    }

    // Check for DOCX (PK\x03\x04 zip signature)
    var isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
    if (isZip) {
      if (window.mammoth && typeof mammoth.convertToHtml === 'function') {
        mammoth.convertToHtml({ arrayBuffer: bytes.buffer })
          .then(function(result) {
            renderHtmlDoc(result.value);
          })
          .catch(function(err) {
            renderHtmlDoc('<div style="padding:24px;color:#ef4444;">Could not parse DOCX: ' + (err.message || 'Unknown error') + '</div>');
          });
      } else {
        setTimeout(function() {
          if (window.mammoth && typeof mammoth.convertToHtml === 'function') {
            mammoth.convertToHtml({ arrayBuffer: bytes.buffer })
              .then(function(result) {
                renderHtmlDoc(result.value);
              })
              .catch(function(err) {
                renderHtmlDoc('<div style="padding:24px;color:#ef4444;">Could not parse DOCX: ' + (err.message || 'Unknown error') + '</div>');
              });
          } else {
            renderHtmlDoc('<div style="padding:24px;font-family:sans-serif;"><h3>Document Loaded</h3><p>DOCX Document loaded.</p></div>');
          }
        }, 400);
      }
      return;
    }

    // Word HTML (.doc) / HTML / Plain text
    var decoded = '';
    try {
      decoded = new TextDecoder('utf-8').decode(bytes);
    } catch(e) {
      decoded = binary;
    }
    renderHtmlDoc(decoded);
  }catch(e){
    document.getElementById('status').textContent='Failed to decode document.';
    send({type:'ERROR',error:e.message});
  }
}

function extractOutline(doc){
  if (!doc || !doc.getOutline) return;
  doc.getOutline().then(function(outline){
    if (!outline || !outline.length) {
      send({ type: 'OUTLINE', outline: [] });
      return;
    }
    processOutlineItems(doc, outline).then(function(res){
      send({ type: 'OUTLINE', outline: res });
    }).catch(function(){
      send({ type: 'OUTLINE', outline: [] });
    });
  }).catch(function(){
    send({ type: 'OUTLINE', outline: [] });
  });
}

function processOutlineItems(doc, items) {
  var promises = items.map(function(item){ return resolveItem(doc, item); });
  return Promise.all(promises);
}

function resolveItem(doc, item) {
  return new Promise(function(resolve){
    var getPageNum = Promise.resolve(null);
    if (typeof item.dest === 'string') {
      getPageNum = doc.getDestination(item.dest).then(function(d){
        if (Array.isArray(d) && d[0] !== undefined && d[0] !== null) {
          var dFirst = d[0];
          if (typeof dFirst === 'object' && typeof dFirst.num === 'number') {
            return doc.getPageIndex(dFirst).then(function(i){ return i + 1; }).catch(function(){ return null; });
          } else if (typeof dFirst === 'number') {
            return dFirst + 1;
          }
        }
        return null;
      }).catch(function(){ return null; });
    } else if (Array.isArray(item.dest) && item.dest[0] !== undefined && item.dest[0] !== null) {
      var destFirst = item.dest[0];
      if (typeof destFirst === 'object' && typeof destFirst.num === 'number') {
        getPageNum = doc.getPageIndex(destFirst).then(function(i){ return i + 1; }).catch(function(){ return null; });
      } else if (typeof destFirst === 'number') {
        getPageNum = Promise.resolve(destFirst + 1);
      }
    } else if (typeof item.page === 'number') {
      getPageNum = Promise.resolve(item.page);
    }

    getPageNum.then(function(pageVal){
      var childPromise = (item.items && item.items.length > 0) ? processOutlineItems(doc, item.items) : Promise.resolve([]);
      childPromise.then(function(children){
        resolve({
          title: item.title || 'Untitled',
          page: pageVal,
          items: children
        });
      });
    });
  });
}

function renderAll(doc){
  var wrap=document.getElementById('pdf-wrap');
  
  // Create all page placeholders first
  for(var p=1;p<=doc.numPages;p++){
    (function(pageNum){
      var div=document.createElement('div');
      div.className='page-item';
      div.id='page-'+pageNum;
      div.dataset.page=pageNum;
      var badge=document.createElement('span');
      badge.className='pg-badge';
      badge.textContent=pageNum+' / '+doc.numPages;
      div.appendChild(badge);
      wrap.appendChild(div);
      pageEls[pageNum]=div;
    })(p);
  }

  // Pre-calculate page aspect ratio from page 1 to prevent layout jumps during scrolling
  doc.getPage(1).then(function(p1){
    var sw = window.innerWidth - 8;
    var vp = p1.getViewport({ scale: 1 });
    var estH = Math.round(sw * (vp.height / vp.width));
    for (var p = 1; p <= doc.numPages; p++) {
      if (pageEls[p] && (!pageEls[p].firstChild || pageEls[p].firstChild.tagName !== 'CANVAS')) {
        pageEls[p].style.height = estH + 'px';
        pageEls[p].style.minHeight = estH + 'px';
      }
    }
  }).catch(function(){});

  var loadedPages = {};
  var renderingPages = {};

  // Render at full device pixel ratio so text is crisp at 1x and native WebView zoom
  var renderDPR = window.devicePixelRatio || 1;

  function loadPage(pageNum) {
    if (pageNum < 1 || pageNum > doc.numPages) return;
    if (loadedPages[pageNum] || renderingPages[pageNum]) return;
    renderingPages[pageNum] = true;
    
    doc.getPage(pageNum).then(function(page){
      // Always read current viewport width so landscape loads correctly
      var sw = window.innerWidth - 8;
      var vp=page.getViewport({scale:1});
      var scale=sw/vp.width;
      var svp=page.getViewport({scale:scale});
      var canvas=document.createElement('canvas');
      
      // Full device DPR: pixel-perfect at native zoom, no re-render tricks needed
      var dpr = renderDPR;
      
      canvas.width = svp.width * dpr;
      canvas.height = svp.height * dpr;
      canvas.style.width = svp.width + 'px';
      canvas.style.height = svp.height + 'px';
      
      var div = pageEls[pageNum];
      if (div.firstChild && div.firstChild.tagName !== 'CANVAS') {
        div.insertBefore(canvas, div.firstChild);
      } else {
        div.appendChild(canvas);
      }
      
      var ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      
      page.render({canvasContext:ctx, viewport:svp}).promise.then(function() {
        loadedPages[pageNum] = true;
        delete renderingPages[pageNum];
        div.style.height = 'auto';
        div.style.minHeight = svp.height + 'px';
        if (isProgrammaticScroll && currentTargetPage === pageNum) {
          scrollTargetPage(pageNum, false);
          isProgrammaticScroll = false;
          currentTargetPage = null;
        }
      });

      page.getTextContent().then(function(tc){
        allText[pageNum]=tc.items.map(function(i){return i.str;}).join(' ');
        send({type:'PAGE_TEXT',page:pageNum,text:allText[pageNum]});
      });

      page.getAnnotations().then(function(anns){
        if (!anns || !anns.length) return;
        anns.forEach(function(ann){
          if (ann.subtype !== 'Link' || !ann.rect) return;
          var rect = svp.convertToViewportRectangle(ann.rect);
          var minX = Math.min(rect[0], rect[2]);
          var minY = Math.min(rect[1], rect[3]);
          var w = Math.abs(rect[2] - rect[0]);
          var h = Math.abs(rect[3] - rect[1]);
          var linkEl = document.createElement('div');
          linkEl.style.cssText = 'position:absolute;left:'+minX+'px;top:'+minY+'px;width:'+w+'px;height:'+h+'px;z-index:10;cursor:pointer;background-color:rgba(0,0,0,0);-webkit-tap-highlight-color:rgba(0,120,255,0.12);';

          if (ann.url) {
            linkEl.dataset.pdfUrl = ann.url;
            div.appendChild(linkEl);
          } else if (ann.dest) {
            var dest = ann.dest;
            if (typeof dest === 'string') {
              linkEl.dataset.pdfDest = JSON.stringify({ named: dest });
              div.appendChild(linkEl);
              doc.getDestination(dest).then(function(d){
                if (Array.isArray(d) && d[0]) {
                  var dFirst = d[0];
                  if (typeof dFirst === 'object' && typeof dFirst.num === 'number') {
                    doc.getPageIndex(dFirst).then(function(i){
                      linkEl.dataset.pdfDest = JSON.stringify({ page: i + 1 });
                    });
                  } else if (typeof dFirst === 'number') {
                    linkEl.dataset.pdfDest = JSON.stringify({ page: dFirst + 1 });
                  }
                }
              }).catch(function(){});
            } else if (Array.isArray(dest)) {
              var destFirst = dest[0];
              if (typeof destFirst === 'object' && typeof destFirst.num === 'number') {
                linkEl.dataset.pdfDest = JSON.stringify({ pageRef: true });
                div.appendChild(linkEl);
                doc.getPageIndex(destFirst).then(function(i){
                  linkEl.dataset.pdfDest = JSON.stringify({ page: i + 1 });
                }).catch(function(){});
              } else if (typeof destFirst === 'number') {
                linkEl.dataset.pdfDest = JSON.stringify({ page: destFirst + 1 });
                div.appendChild(linkEl);
              } else {
                div.appendChild(linkEl);
              }
            } else if (typeof dest === 'number') {
              linkEl.dataset.pdfDest = JSON.stringify({ page: dest + 1 });
              div.appendChild(linkEl);
            }
          }
        });
      }).catch(function(){});
    }).catch(function(err) {
      delete renderingPages[pageNum];
    });
  }

  globalLoadPage = loadPage;
  window.loadPageExternal = loadPage;
  window.goToPageGlobal = goToPage;

  // Unload a page's canvas when it scrolls far off-screen, freeing GPU memory
  function unloadPage(pageNum){
    if(!loadedPages[pageNum]) return;
    var div = pageEls[pageNum];
    if(!div) return;
    var canvas = div.querySelector('canvas');
    if(canvas){
      var h = canvas.style.height || (canvas.offsetHeight + 'px');
      div.removeChild(canvas);
      if(h){ div.style.height = h; div.style.minHeight = h; }
    }
    delete loadedPages[pageNum];
  }

  // User manual scroll listeners to cancel any pending programmatic scroll timers immediately
  window.addEventListener('wheel', function() { cancelPendingScroll(); }, { passive: true });
  window.addEventListener('touchstart', function() { cancelPendingScroll(); }, { passive: true });
  window.addEventListener('pointerdown', function() { cancelPendingScroll(); }, { passive: true });
  window.addEventListener('mousedown', function() { cancelPendingScroll(); }, { passive: true });
  window.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Space') {
      cancelPendingScroll();
    }
  }, { passive: true });

  // Lazy-load observer — 700px pre-load so pages render before becoming visible
  var obs=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){ loadPage(parseInt(e.target.dataset.page, 10)); }
    });
  },{rootMargin: "800px 0px 800px 0px", threshold:[0.001]});

  // Unload observer — evict canvases that are > 2500px off-screen to avoid scroll thrashing
  var unloadObs = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(!e.isIntersecting){ unloadPage(parseInt(e.target.dataset.page, 10)); }
    });
  }, {rootMargin: "2500px 0px 2500px 0px", threshold: 0});

  // Fallback scroll listener for fast-flick cases
  window.addEventListener('scroll', function() {
    if (!isProgrammaticScroll) {
      currentTargetPage = null;
    }
    var viewTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    var viewBottom = viewTop + window.innerHeight;
    for (var p = 1; p <= doc.numPages; p++) {
      var div = pageEls[p];
      if (div) {
        var top = div.offsetTop;
        var bottom = top + (div.offsetHeight || 400);
        if (bottom >= viewTop - 800 && top <= viewBottom + 800) {
          if (!loadedPages[p] && !renderingPages[p]) { loadPage(p); }
        } else if (bottom < viewTop - 2500 || top > viewBottom + 2500) {
          if (loadedPages[p]) { unloadPage(p); }
        }
      }
    }
  }, { passive: true });

  // Center-page observer for page indicator
  var centerObs=new IntersectionObserver(function(entries){
    var best=null,bestRatio=0;
    entries.forEach(function(e){
      if(e.isIntersecting && e.intersectionRatio>bestRatio){ bestRatio=e.intersectionRatio; best=e.target; }
    });
    if(best && !isProgrammaticScroll){
      var p = parseInt(best.dataset.page, 10);
      if (!isNaN(p)) {
        send({type:'PAGE_CHANGE',page:p});
      }
    }
  },{rootMargin: "-40% 0px -40% 0px", threshold:[0, 0.1, 0.25, 0.5]});

  setTimeout(function(){
    var items=document.querySelectorAll('.page-item');
    items.forEach(function(el){
      obs.observe(el);
      centerObs.observe(el);
      unloadObs.observe(el);
    });
    loadPage(1);
  }, 100);

  // Background sequential text extraction
  var bgPage = 1;
  function loadNextBg() {
    if (bgPage > doc.numPages) return;
    
    if (allText[bgPage]) {
      bgPage++;
      loadNextBg();
      return;
    }
    
    doc.getPage(bgPage).then(function(page) {
      page.getTextContent().then(function(tc) {
        allText[bgPage] = tc.items.map(function(i){return i.str;}).join(' ');
        send({type:'PAGE_TEXT',page:bgPage,text:allText[bgPage]});
        bgPage++;
        setTimeout(loadNextBg, 250);
      }).catch(function() {
        bgPage++;
        setTimeout(loadNextBg, 250);
      });
    }).catch(function() {
      bgPage++;
      setTimeout(loadNextBg, 250);
    });
  }
  
  setTimeout(loadNextBg, 3000);
}

// Search
var searchQuery='';
function openSearch(){
  var bar=document.getElementById('search-bar');
  bar.style.display='flex';
  document.getElementById('search-input').focus();
}
function closeSearch(){
  clearHighlights();
  document.getElementById('search-bar').style.display='none';
  document.getElementById('search-info').textContent='';
  searchQuery='';
}
function onSearchInput(){
  searchQuery=document.getElementById('search-input').value;
  if(searchQuery.length>1){ doSearch(); }
  else{ clearHighlights(); document.getElementById('search-info').textContent=''; }
}
function clearHighlights(){
  document.querySelectorAll('mark').forEach(function(m){
    var parent=m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent),m);
    parent.normalize();
  });
  matchNodes=[]; matchIdx=0;
}
function doSearch(){
  clearHighlights();
  if(!searchQuery||searchQuery.length<1) return;
  var wrap=document.getElementById('pdf-wrap');
  var walker=document.createTreeWalker(wrap,NodeFilter.SHOW_TEXT);
  var textNodes=[];
  while(walker.nextNode()){ textNodes.push(walker.currentNode); }
  var qLower=searchQuery.toLowerCase();
  textNodes.forEach(function(node){
    var val=node.nodeValue;
    if(val.toLowerCase().indexOf(qLower)>=0){
      var span=document.createElement('span');
      var parts=val.split(new RegExp('('+searchQuery+')','i'));
      span.innerHTML=parts.map(function(p,i){return i%2===1?'<mark>'+p+'</mark>':p;}).join('');
      node.parentNode.replaceChild(span,node);
      span.querySelectorAll('mark').forEach(function(m){ matchNodes.push(m); });
    }
  });
  matchIdx=0;
  document.getElementById('search-info').textContent=matchNodes.length>0?('1/'+matchNodes.length):'0 results';
  if(matchNodes.length>0){ activateMatch(0); }
  send({type:'SEARCH_RESULT',count:matchNodes.length});
}
function activateMatch(idx){
  matchNodes.forEach(function(m,i){ m.className=i===idx?'active':''; });
  if(matchNodes[idx]){ matchNodes[idx].scrollIntoView({behavior:'smooth',block:'center'}); }
  document.getElementById('search-info').textContent=(idx+1)+'/'+matchNodes.length;
}
function nextMatch(){ if(matchNodes.length===0)return; matchIdx=(matchIdx+1)%matchNodes.length; activateMatch(matchIdx); }
function prevMatch(){ if(matchNodes.length===0)return; matchIdx=(matchIdx-1+matchNodes.length)%matchNodes.length; activateMatch(matchIdx); }
</script>
</body>
</html>`;

const readAsBase64Web = async (uri: string): Promise<string> => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const parts = result.split(',');
        resolve(parts[1] || '');
      };
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  } catch (err: any) {
    throw new Error('This local session file is no longer available. Please pick the file again.');
  }
};

const initPdfDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported on this platform.'));
      return;
    }
    const request = indexedDB.open('PdfStore', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('pdfs')) {
        db.createObjectStore('pdfs', { keyPath: 'uri' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const savePdfToDb = async (uri: string, base64: string): Promise<void> => {
  try {
    const db = await initPdfDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pdfs', 'readwrite');
      const store = transaction.objectStore('pdfs');
      const request = store.put({ uri, base64, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('Failed to save PDF to IndexedDB', e);
  }
};

const getPdfFromDb = async (uri: string): Promise<string | null> => {
  try {
    const db = await initPdfDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('pdfs', 'readonly');
      const store = transaction.objectStore('pdfs');
      const request = store.get(uri);
      request.onsuccess = () => {
        resolve(request.result ? request.result.base64 : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('Failed to get PDF from IndexedDB', e);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const TOP_BAR_HEIGHT = 88;

export default function StandalonePdfReader({
  onClose,
  initialUri,
  initialName,
  initialBase64,
  hasAppHeader = false,
}: {
  onClose: () => void;
  initialUri?: string | null;
  initialName?: string | null;
  initialBase64?: string | null;
  hasAppHeader?: boolean;
}) {
  const { colors, theme: appTheme, toggleTheme: toggleAppTheme } = useTheme();
  const isDark = appTheme !== 'light';
  const insets = useSafeAreaInsets();

  const rawTopInset = insets?.top ?? 0;
  const androidStatusBar = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) : 0;
  const safeTop = Math.max(rawTopInset, androidStatusBar, Platform.OS === 'ios' ? 44 : 36);

  const topPadding = hasAppHeader ? 0 : safeTop;
  const headerTotalHeight = hasAppHeader ? 76 : (topPadding + 84);

  // Immersive Mode (controls toggle on tap/scroll)
  const controlsVisible = useRef(true);
  const controlsAnim = useRef(new Animated.Value(1)).current;

  const showControls = useCallback(() => {
    if (!controlsVisible.current) {
      controlsVisible.current = true;
      Animated.timing(controlsAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [controlsAnim]);

  const hideControls = useCallback(() => {
    if (controlsVisible.current) {
      controlsVisible.current = false;
      Animated.timing(controlsAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [controlsAnim]);

  const toggleControls = useCallback(() => {
    if (controlsVisible.current) {
      hideControls();
    } else {
      showControls();
    }
  }, [showControls, hideControls]);

  const headerY = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-headerTotalHeight - 20, 0],
  });

  const zoomBarOpacity = controlsAnim;
  const zoomBarY = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });

  const syncBannerTranslateY = controlsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-headerTotalHeight, 0],
  });

  // Deep theme state
  const [deepThemeEnabled, setDeepThemeEnabled] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('@pdfReader_deepTheme').then(val => {
      if (val !== null) setDeepThemeEnabled(val === 'true');
    }).catch(() => { });
  }, []);

  const toggleDeepTheme = async () => {
    const nextVal = !deepThemeEnabled;
    setDeepThemeEnabled(nextVal);
    try {
      await AsyncStorage.setItem('@pdfReader_deepTheme', String(nextVal));
    } catch { }
  };

  // Reader theme
  const [themeKey, setThemeKey] = useState('app');
  const rt = READER_THEMES.find(t => t.key === themeKey)!;
  const rBg = rt.bg ?? colors.bg;
  const rText = rt.text ?? colors.text;
  const rMuted = rt.muted ?? colors.muted;

  // Screen dimensions — listen for rotation, then tell the WebView to re-render pages at new width
  const [screenDims, setScreenDims] = useState(() => Dimensions.get('window'));

  // PDF state
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string>('');
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Extraction/TTS
  const [extractedPages, setExtractedPages] = useState<Record<number, string>>({});
  const [ttsPage, setTtsPage] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);

  // Voice states
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<Speech.Voice | null>(null);
  const [showVoicesModal, setShowVoicesModal] = useState(false);

  // AI OCR state
  const [aiLoading, setAiLoading] = useState(false);

  // PDF History stack
  const [history, setHistory] = useState<{ uri: string; name: string }[]>([]);

  // Toggle utility buttons visibility
  const [showTools, setShowTools] = useState(true);

  // Auth Context
  // Standalone - no auth
  const user = null;

  // UI state
  const [activeTab, setActiveTab] = useState<'read' | 'listen'>('read');
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState('');
  const [showTheme, setShowTheme] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [showIndexModal, setShowIndexModal] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [navTab, setNavTab] = useState<NavTabType>('home');
  const [isAddingDrive, setIsAddingDrive] = useState(false);
  const [showReaderConvertModal, setShowReaderConvertModal] = useState(false);
  const [readerDocxModalVisible, setReaderDocxModalVisible] = useState(false);
  const [readerTextModalVisible, setReaderTextModalVisible] = useState(false);

  // Google Drive state
  const [connectedDrives, setConnectedDrives] = useState<ConnectedDrive[]>([]);
  const [activeDriveId, setActiveDriveId] = useState<string | null>(null);
  const [driveFolderStack, setDriveFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [driveItems, setDriveItems] = useState<DriveFileItem[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveSearch, setDriveSearch] = useState('');
  const [driveFilter, setDriveFilter] = useState<'all' | 'folders' | 'pdf'>('all');
  const [newDriveName, setNewDriveName] = useState('');
  const [newDriveInput, setNewDriveInput] = useState('');
  const [addDriveError, setAddDriveError] = useState('');
  const [googleDriveLoading, setGoogleDriveLoading] = useState(false);
  const [offlineDriveFiles, setOfflineDriveFiles] = useState<Record<string, string>>({});
  const [folderOptionsTarget, setFolderOptionsTarget] = useState<ConnectedDrive | null>(null);
  const [fileOptionsTarget, setFileOptionsTarget] = useState<DriveFileItem | null>(null);
  const [renameTarget, setRenameTarget] = useState<ConnectedDrive | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [jumpInput, setJumpInput] = useState('');
  const [searchCount, setSearchCount] = useState<number | null>(null);

  // Local edit & sync states
  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState('');
  const [scrollPendingPage, setScrollPendingPage] = useState<number | null>(null);

  // Reader settings
  const [fontSize, setFontSize] = useState(16);
  const [lineSpacing, setLineSpacing] = useState(1.7);

  // Bookmarks & recent
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  // Refs
  const webViewRef = useRef<WebView>(null);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsIndexRef = useRef(0);
  const isTtsActiveRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Tracks the last-read page so tab-switch can restore exactly the right page
  const savedPageRef = useRef<number>(1);

  // Load recent files on mount
  useEffect(() => {
    loadRecent();
  }, []);

  // Show controls when activeTab is not 'read' or when Drive is open
  useEffect(() => {
    if (activeTab !== 'read' || showDriveModal) {
      showControls();
    }
  }, [activeTab, showDriveModal, showControls]);

  // Web / Desktop Google Drive OAuth receiver
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleMessage = async (event: MessageEvent) => {
        if (event.data?.type === 'GOOGLE_DRIVE_TOKEN' && event.data?.token) {
          const accessToken = event.data.token;
          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            let userEmail = 'Google Drive';
            if (userRes.ok) {
              const userData = await userRes.json();
              if (userData.email) userEmail = userData.email;
            }
            const newDrive: ConnectedDrive = {
              id: 'drive_' + Date.now(),
              name: userEmail,
              userEmail,
              type: 'oauth',
              accessToken,
              folderId: 'root',
              addedAt: Date.now(),
            };
            const updated = [newDrive, ...connectedDrives.filter(d => d.name !== userEmail)];
            await saveGoogleDrives(updated);
            setActiveDriveId(newDrive.id);
            setIsAddingDrive(false);
            setDriveFolderStack([{ id: 'root', name: 'My Drive' }]);
            fetchDriveFolderContents(newDrive, 'root');
          } catch (e) {
            console.warn('[Web Drive Auth Error]', e);
          } finally {
            setGoogleDriveLoading(false);
          }
        } else if (event.data?.type === 'GOOGLE_AUTH_CANCELLED') {
          setGoogleDriveLoading(false);
        }
      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, [connectedDrives]);

  // Fetch available voices on mount (includes English, Hindi, and other Indian regional voices)
  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const list = await Speech.getAvailableVoicesAsync();

        // Filter English, Hindi, and any voice with an Indian locale (-IN)
        let filtered = list.filter(v => {
          const lang = v.language.toLowerCase();
          return lang.startsWith('en') || lang.startsWith('hi') || lang.includes('-in');
        });

        // Fallback to the full list if no matching voices found
        if (filtered.length === 0) filtered = list;

        // Sort to place Indian context voices (Indian English en-IN & Hindi hi-IN) on top
        filtered.sort((a, b) => {
          const aLang = a.language.toLowerCase();
          const bLang = b.language.toLowerCase();

          const aIsIndianCore = aLang.startsWith('en-in') || aLang.startsWith('hi-in') || aLang === 'hi';
          const bIsIndianCore = bLang.startsWith('en-in') || bLang.startsWith('hi-in') || bLang === 'hi';

          if (aIsIndianCore && !bIsIndianCore) return -1;
          if (!aIsIndianCore && bIsIndianCore) return 1;

          // Other Indian locales (e.g. bn-in, mr-in, ta-in, etc.)
          const aIsOtherIndian = aLang.includes('-in');
          const bIsOtherIndian = bLang.includes('-in');
          if (aIsOtherIndian && !bIsOtherIndian) return -1;
          if (!aIsOtherIndian && bIsOtherIndian) return 1;

          // Other English regions (e.g. en-US, en-GB, en-AU)
          const aIsEnglish = aLang.startsWith('en');
          const bIsEnglish = bLang.startsWith('en');
          if (aIsEnglish && !bIsEnglish) return -1;
          if (!aIsEnglish && bIsEnglish) return 1;

          // Enhanced quality voices next
          const aIsEnhanced = (a.quality as string) === 'enhanced';
          const bIsEnhanced = (b.quality as string) === 'enhanced';
          if (aIsEnhanced && !bIsEnhanced) return -1;
          if (!aIsEnhanced && bIsEnhanced) return 1;

          return a.name.localeCompare(b.name);
        });

        setVoices(filtered);

        // Load saved voice preference
        const savedId = await AsyncStorage.getItem('@pdfReader_selectedVoice');
        if (savedId) {
          const match = filtered.find(v => v.identifier === savedId);
          if (match) {
            setSelectedVoice(match);
            return;
          }
        }
        // Default: use first Indian voice (en-IN or hi-IN), or enhanced voice, or fallback to first English voice
        if (filtered.length > 0) {
          const inVoice = filtered.find(v => v.language.toLowerCase().includes('in') || v.name.toLowerCase().includes('india'));
          const defVoice = inVoice || filtered.find(v => (v.quality as string) === 'enhanced') || filtered[0];
          setSelectedVoice(defVoice);
        }
      } catch (err) {
        console.warn('[TTS] Failed to retrieve available voices:', err);
      }
    };
    fetchVoices();
  }, []);

  // Helper: load a PDF directly from a URI (used by intent handler + recent files)
  const loadFromUri = async (uri: string, name?: string, webFile?: any) => {
    try {
      setLoading(true);
      setLoadProgress('Reading file\u2026');
      setExtractedPages({});
      setScrollPendingPage(null);
      setIsEditingText(false);
      setTotalPages(0);
      setCurrentPage(1);
      setTtsPage(1);
      setBookmarks([]);
      stopSpeaking();
      const fileName = name ?? uri.split('/').pop() ?? 'document.pdf';
      setPdfUri(uri);
      setPdfName(fileName);
      setActiveTab('read');
      setLoadProgress('Loading PDF data\u2026');

      let b64: string;
      let localUri = uri;
      if ((Platform.OS as string) === 'web') {
        const cachedB64 = await getPdfFromDb(uri);
        if (cachedB64) {
          b64 = cachedB64;
        } else if (uri.startsWith('gdrive://')) {
          const fileId = uri.replace('gdrive://', '').split('/')[0];
          const cachedById = await getPdfFromDb(`gdrive://${fileId}`) || await getPdfFromDb(fileId);
          if (cachedById) {
            b64 = cachedById;
          } else if ((window as any).electronAPI?.fetchDriveFile) {
            let token = '';
            const oauthDrive = connectedDrives.find(d => d.type === 'oauth' && d.accessToken);
            if (oauthDrive?.accessToken) token = oauthDrive.accessToken;
            const res = await (window as any).electronAPI.fetchDriveFile({ fileId, token });
            if (res?.success && res?.base64) {
              b64 = res.base64;
              await savePdfToDb(uri, b64);
              await savePdfToDb(`gdrive://${fileId}`, b64);
            } else {
              throw new Error(res?.error || 'Failed to download Google Drive PDF');
            }
          } else {
            b64 = await readAsBase64Web(uri);
            await savePdfToDb(uri, b64);
          }
        } else if (webFile) {
          b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const parts = result.split(',');
              resolve(parts[1] || '');
            };
            reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
            reader.readAsDataURL(webFile);
          });
          await savePdfToDb(uri, b64);
        } else {
          b64 = await readAsBase64Web(uri);
          await savePdfToDb(uri, b64);
        }
      } else {
        localUri = uri;
        if (uri.startsWith('gdrive://')) {
          setLoadProgress('Loading Google Drive PDF\u2026');
          const fileId = uri.replace('gdrive://', '').split('/')[0];
          const sanitizeFileName = fileId.replace(/[^a-zA-Z0-9]/g, '_');
          const cacheUri = `${FileSystem.cacheDirectory}gdrive_${sanitizeFileName}.pdf`;
          try {
            const cacheInfo = await FileSystem.getInfoAsync(cacheUri);
            if (cacheInfo.exists && cacheInfo.size > 0) {
              localUri = cacheUri;
            } else {
              let token = '';
              const oauthDrive = connectedDrives.find(d => d.type === 'oauth' && d.accessToken);
              if (oauthDrive?.accessToken) {
                token = oauthDrive.accessToken;
                if (GoogleSignin) {
                  try {
                    const t = await GoogleSignin.getTokens();
                    if (t?.accessToken) token = t.accessToken;
                  } catch { }
                }
              }
              const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
              const headers: Record<string, string> = {};
              if (token) headers['Authorization'] = `Bearer ${token}`;
              const downloadRes = await FileSystem.downloadAsync(driveApiUrl, cacheUri, { headers });
              if (downloadRes.status < 400) {
                localUri = cacheUri;
              } else {
                const pubUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                const pubRes = await FileSystem.downloadAsync(pubUrl, cacheUri);
                localUri = pubRes.uri;
              }
            }
          } catch {
            const pubUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            const pubRes = await FileSystem.downloadAsync(pubUrl, cacheUri);
            localUri = pubRes.uri;
          }
        } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
          setLoadProgress('Loading PDF document\u2026');
          let downloadUrl = uri;
          const headers: Record<string, string> = {};
          if (downloadUrl.includes('drive.google.com') || downloadUrl.includes('docs.google.com')) {
            let fileId = '';
            const matchD = downloadUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (matchD && matchD[1]) {
              fileId = matchD[1];
            } else {
              const matchId = downloadUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
              if (matchId && matchId[1]) {
                fileId = matchId[1];
              }
            }
            if (fileId) {
              const oauthDrive = connectedDrives.find(d => d.type === 'oauth' && d.accessToken);
              if (oauthDrive?.accessToken) {
                downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
                headers['Authorization'] = `Bearer ${oauthDrive.accessToken}`;
              } else {
                downloadUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`;
              }
            }
          }
          // Instant persistent cache check
          const sanitizeFileName = uri.replace(/[^a-zA-Z0-9]/g, '_').slice(-40);
          const cacheUri = `${FileSystem.cacheDirectory}pdf_cache_${sanitizeFileName}.pdf`;

          try {
            const cacheInfo = await FileSystem.getInfoAsync(cacheUri);
            if (cacheInfo.exists && cacheInfo.size > 0) {
              localUri = cacheUri;
            } else {
              const downloadRes = await FileSystem.downloadAsync(downloadUrl, cacheUri, { headers });
              localUri = downloadRes.uri;
            }
          } catch (e) {
            const tempUri = `${FileSystem.cacheDirectory}temp_remote_${Date.now()}.pdf`;
            const downloadRes = await FileSystem.downloadAsync(downloadUrl, tempUri, { headers });
            localUri = downloadRes.uri;
          }
        } else if (uri.startsWith('content://')) {
          setLoadProgress('Caching external PDF\u2026');
          const cacheUri = FileSystem.cacheDirectory + 'temp_import.pdf';
          try {
            const fileInfo = await FileSystem.getInfoAsync(cacheUri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(cacheUri, { idempotent: true });
            }
          } catch (_) { }
          await FileSystem.copyAsync({
            from: uri,
            to: cacheUri,
          });
          localUri = cacheUri;
        }
        b64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
      }
      setPdfBase64(b64);
      let resolvedSize: number | undefined;
      if (Platform.OS !== 'web' && localUri) {
        try {
          const info = await FileSystem.getInfoAsync(localUri);
          if (info.exists && (info as any).size) {
            resolvedSize = (info as any).size;
          }
        } catch {}
      }
      saveRecent({ uri, name: fileName, openedAt: Date.now(), size: resolvedSize });
    } catch (err: any) {
      Alert.alert('Error', 'Failed to open PDF: ' + (err?.message ?? 'Unknown error'));
      setLoading(false);
    }
  };

  const openPdf = async (uri: string, name: string, webFile?: any) => {
    if (pdfUri) {
      setHistory(prev => [...prev, { uri: pdfUri, name: pdfName }]);
    }
    await loadFromUri(uri, name, webFile);
  };

  const handleBackNavigation = async () => {
    setScrollPendingPage(null);
    setIsEditingText(false);
    if (history.length > 0) {
      const prevList = [...history];
      const prevFile = prevList.pop()!;
      setHistory(prevList);
      await loadFromUri(prevFile.uri, prevFile.name);
    } else {
      // Unload active PDF and return to EmptyState
      setPdfBase64('');
      setPdfUri('');
      setPdfName('');
      setExtractedPages({});
      setTotalPages(0);
      setCurrentPage(1);
      setTtsPage(1);
      stopSpeaking();
    }
  };

  // Auto-open when launched via "Open with..." or initialBase64
  useEffect(() => {
    if (initialBase64) {
      setPdfBase64(initialBase64);
      setPdfName(initialName || 'Document');
      if (initialUri) setPdfUri(initialUri);
      return;
    }
    if (initialUri) {
      const parsed = parseDriveInput(initialUri);
      if (parsed && parsed.type === 'folder') {
        setShowDriveModal(true);
        setNewDriveInput(initialUri);
        if (initialName) setNewDriveName(initialName);
      } else {
        loadFromUri(initialUri, initialName || undefined);
      }
    }
  }, [initialUri, initialName, initialBase64]);

  // Pulse animation for TTS
  useEffect(() => {
    if (isPlaying) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [isPlaying]);

  // Reading progress bar
  useEffect(() => {
    if (totalPages > 0) {
      Animated.timing(progressAnim, {
        toValue: currentPage / totalPages,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [currentPage, totalPages]);

  // Load bookmarks for current PDF
  useEffect(() => {
    if (pdfName) loadBookmarks(pdfName);
  }, [pdfName]);

  // ---------------------------------------------------------------------------
  // AsyncStorage helpers
  // ---------------------------------------------------------------------------
  const loadRecent = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_RECENT);
      if (raw) {
        const list: RecentFile[] = JSON.parse(raw);
        setRecentFiles(list);

        // Lazily populate sizes for any existing entries missing size
        const hasMissing = list.some(f => !f.size && f.uri && !f.uri.startsWith('http') && !f.uri.startsWith('gdrive://'));
        if (hasMissing) {
          const resolved = await Promise.all(
            list.map(async (f) => {
              if (f.size || !f.uri || f.uri.startsWith('http') || f.uri.startsWith('gdrive://')) return f;
              try {
                const info = await FileSystem.getInfoAsync(f.uri);
                if (info.exists && (info as any).size) {
                  return { ...f, size: (info as any).size };
                }
              } catch {}
              return f;
            })
          );
          setRecentFiles(resolved);
          await AsyncStorage.setItem(STORAGE_RECENT, JSON.stringify(resolved));
        }
      }
    } catch { }
  };

  const saveRecent = async (file: RecentFile) => {
    try {
      let fileSize = file.size;
      if (!fileSize && file.uri && !file.uri.startsWith('http') && !file.uri.startsWith('gdrive://')) {
        try {
          const info = await FileSystem.getInfoAsync(file.uri);
          if (info.exists && (info as any).size) {
            fileSize = (info as any).size;
          }
        } catch {}
      }
      const fileToSave: RecentFile = { ...file, size: fileSize };
      const raw = await AsyncStorage.getItem(STORAGE_RECENT);
      let currentList: RecentFile[] = [];
      if (raw) {
        try { currentList = JSON.parse(raw); } catch { }
      }
      // Deduplicate: filter out entries with exact same URI or matching name+URI
      const updated = [fileToSave, ...currentList.filter(f => f.uri !== fileToSave.uri && f.name !== fileToSave.name)].slice(0, 15);
      setRecentFiles(updated);
      await AsyncStorage.setItem(STORAGE_RECENT, JSON.stringify(updated));
    } catch { }
  };

  const removeRecentFile = async (file: RecentFile) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_RECENT);
      let currentList: RecentFile[] = recentFiles;
      if (raw) {
        try { currentList = JSON.parse(raw); } catch { }
      }
      const updated = currentList.filter(f => f.uri !== file.uri && f.name !== file.name);
      setRecentFiles(updated);
      if (updated.length === 0) {
        await AsyncStorage.removeItem(STORAGE_RECENT);
      } else {
        await AsyncStorage.setItem(STORAGE_RECENT, JSON.stringify(updated));
      }
    } catch { }
  };

  // Google Drive Helpers
  const refreshDriveToken = async (drive: ConnectedDrive): Promise<string | null> => {
    if (drive.type !== 'oauth') return drive.accessToken || null;

    // 1. Native mobile (iOS / Android) via GoogleSignin
    const { NativeModules } = require('react-native');
    const hasNativeModule = !!(NativeModules && NativeModules.RNGoogleSignin) ||
      (TurboModuleRegistry && typeof TurboModuleRegistry.get === 'function' && !!TurboModuleRegistry.get('RNGoogleSignin'));

    if (GoogleSignin && hasNativeModule && typeof GoogleSignin.configure === 'function') {
      try {
        const storedKey = await AsyncStorage.getItem('google_web_client_id');
        const webClientId = storedKey?.trim() ||
          '1054174779678-bc0g7gokvo5j6u34c8thiole61s3guhq.apps.googleusercontent.com';
        GoogleSignin.configure({
          webClientId,
          iosClientId: '1054174779678-ae04b7lbfpklipf0rvd9u7ua2avg24pu.apps.googleusercontent.com',
          offlineAccess: false,
          scopes: ['https://www.googleapis.com/auth/drive.readonly', 'profile', 'email'],
        });
        if (typeof GoogleSignin.signInSilently !== 'function') throw new Error('signInSilently unavailable');
        await GoogleSignin.signInSilently();
        if (typeof GoogleSignin.getTokens !== 'function') throw new Error('getTokens unavailable');
        const tokens = await GoogleSignin.getTokens();
        if (tokens?.accessToken) {
          const newToken = tokens.accessToken;
          drive.accessToken = newToken;
          setConnectedDrives(prev => {
            const updated = prev.map(d => d.id === drive.id ? { ...d, accessToken: newToken } : d);
            AsyncStorage.setItem(STORAGE_GOOGLE_DRIVES, JSON.stringify(updated)).catch(() => { });
            return updated;
          });
          return newToken;
        }
      } catch (e) {
        console.log('[refreshDriveToken] Native silent refresh error:', e);
      }
    }

    // 2. Desktop Electron via refreshGoogleToken
    if (typeof window !== 'undefined' && (window as any).electronAPI?.refreshGoogleToken) {
      try {
        const storedKey = await AsyncStorage.getItem('google_web_client_id');
        const webClientId = storedKey?.trim() ||
          '1054174779678-bc0g7gokvo5j6u34c8thiole61s3guhq.apps.googleusercontent.com';
        const res = await (window as any).electronAPI.refreshGoogleToken({
          webClientId,
          userEmail: drive.userEmail,
        });
        if (res?.success && res.token) {
          const newToken = res.token;
          drive.accessToken = newToken;
          setConnectedDrives(prev => {
            const updated = prev.map(d => d.id === drive.id ? { ...d, accessToken: newToken } : d);
            AsyncStorage.setItem(STORAGE_GOOGLE_DRIVES, JSON.stringify(updated)).catch(() => { });
            return updated;
          });
          return newToken;
        }
      } catch (e) {
        console.log('[refreshDriveToken] Electron silent refresh error:', e);
      }
    }

    return drive.accessToken || null;
  };

  const loadGoogleDrives = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_GOOGLE_DRIVES);
      if (raw) {
        let list: ConnectedDrive[] = JSON.parse(raw);
        setConnectedDrives(list);
        if (list.length > 0) {
          const first = list[0];
          setActiveDriveId(first.id);
          const rootFolder = first.folderId || 'root';
          const rootName = rootFolder === 'root' ? 'My Drive' : first.name;
          setDriveFolderStack([{ id: rootFolder, name: rootName }]);

          // Silently refresh token in background and fetch contents
          if (first.type === 'oauth') {
            refreshDriveToken(first).finally(() => {
              fetchDriveFolderContents(first, rootFolder);
            });
          } else {
            fetchDriveFolderContents(first, rootFolder);
          }
        }
      }
    } catch { }
  };

  const loadOfflineDriveFiles = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_OFFLINE_DRIVE);
      if (raw) {
        setOfflineDriveFiles(JSON.parse(raw));
      }
    } catch { }
  };

  const ensureOfflineDir = async () => {
    try {
      const info = await FileSystem.getInfoAsync(OFFLINE_DRIVE_DIR);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(OFFLINE_DRIVE_DIR, { intermediates: true });
      }
    } catch { }
  };

  useEffect(() => {
    loadGoogleDrives();
    loadOfflineDriveFiles();
    ensureOfflineDir();
  }, []);

  const saveGoogleDrives = async (list: ConnectedDrive[]) => {
    try {
      setConnectedDrives(list);
      await AsyncStorage.setItem(STORAGE_GOOGLE_DRIVES, JSON.stringify(list));
    } catch { }
  };

  const parseDriveInput = (input: string): { type: 'folder' | 'file'; id: string } | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Check direct file link
    const matchFile = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchFile && matchFile[1]) return { type: 'file', id: matchFile[1] };

    // Check folder link
    const matchFolder = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (matchFolder && matchFolder[1]) return { type: 'folder', id: matchFolder[1] };

    // Check query param id
    const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) return { type: 'folder', id: matchId[1] };

    // Check raw id
    if (/^[a-zA-Z0-9_-]{15,100}$/.test(trimmed)) {
      return { type: 'folder', id: trimmed };
    }
    return null;
  };

  const handleGoogleDriveSignIn = async () => {
    try {
      setGoogleDriveLoading(true);
      const storedKey = await AsyncStorage.getItem('google_web_client_id');
      const webClientId = storedKey?.trim() ||
        '1054174779678-bc0g7gokvo5j6u34c8thiole61s3guhq.apps.googleusercontent.com';

      // Web / Desktop / WebView Google OAuth
      if (Platform.OS === 'web' || !GoogleSignin) {
        const redirect_uri = encodeURIComponent('https://www.upschelper.com/login');
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${webClientId}&redirect_uri=${redirect_uri}&response_type=token&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.readonly profile email')}&prompt=select_account`;
        if (typeof window !== 'undefined' && (window as any).electronAPI?.startGoogleAuth) {
          (window as any).electronAPI.startGoogleAuth(authUrl);
        } else if (typeof window !== 'undefined' && (window as any).electronAPI) {
          (window as any).electronAPI.openExternal(authUrl);
        } else if (typeof window !== 'undefined') {
          const popup = window.open(authUrl, 'GoogleDriveAuth', 'width=500,height=650');
          if (!popup) {
            window.location.href = authUrl;
          }
        }
        return;
      }

      if (GoogleSignin) {
        GoogleSignin.configure({
          webClientId,
          iosClientId: '1054174779678-ae04b7lbfpklipf0rvd9u7ua2avg24pu.apps.googleusercontent.com',
          offlineAccess: false,
          scopes: ['https://www.googleapis.com/auth/drive.readonly', 'profile', 'email'],
        });

        if (Platform.OS === 'android') {
          await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        }

        // First try silent sign-in (avoids unnecessary account-chooser on re-open)
        let userInfo: any = null;
        let accessToken = '';
        try {
          userInfo = await GoogleSignin.signInSilently();
          const tokens = await GoogleSignin.getTokens();
          accessToken = tokens?.accessToken || '';
        } catch {
          // Silent failed — need interactive sign-in. Sign out first to clear any partial state.
          try { await GoogleSignin.signOut(); } catch { }
          userInfo = await GoogleSignin.signIn();
          try {
            const tokens = await GoogleSignin.getTokens();
            accessToken = tokens?.accessToken || '';
          } catch { }
        }

        const userEmail = userInfo?.data?.user?.email || userInfo?.user?.email || userInfo?.data?.email || 'Google Drive';

        const newDrive: ConnectedDrive = {
          id: 'drive_' + Date.now(),
          name: userEmail,
          userEmail,
          type: 'oauth',
          accessToken,
          folderId: 'root',
          addedAt: Date.now(),
        };

        const updated = [newDrive, ...connectedDrives.filter(d => d.name !== userEmail)];
        await saveGoogleDrives(updated);
        setActiveDriveId(newDrive.id);
        setIsAddingDrive(false);
        setDriveFolderStack([{ id: 'root', name: 'My Drive' }]);
        fetchDriveFolderContents(newDrive, 'root');
      } else {
        Alert.alert(
          'Google Account Sign-In',
          'Native Google Sign-In is not initialized in this environment. You can paste any Google Drive folder link or file link below to browse files.',
          [{ text: 'OK' }]
        );
      }
    } catch (err: any) {
      console.warn('[Google Drive Auth Error]', err);
      try {
        if (err.code === GoogleSigninStatusCodes.SIGN_IN_CANCELLED) {
          return;
        }
      } catch { }
      Alert.alert('Sign-In Failed', err?.message || 'Could not connect Google Drive account.');
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const handleGoogleDriveSignInForFolder = async (folderId: string, customName?: string) => {
    try {
      setGoogleDriveLoading(true);
      const storedKey = await AsyncStorage.getItem('google_web_client_id');
      const webClientId = storedKey?.trim() ||
        '1054174779678-bc0g7gokvo5j6u34c8thiole61s3guhq.apps.googleusercontent.com';

      // Web / Desktop / WebView Google OAuth
      if (Platform.OS === 'web' || !GoogleSignin) {
        const redirect_uri = encodeURIComponent('https://www.upschelper.com/login');
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${webClientId}&redirect_uri=${redirect_uri}&response_type=token&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.readonly profile email')}&prompt=select_account`;
        if (typeof window !== 'undefined' && (window as any).electronAPI?.startGoogleAuth) {
          (window as any).electronAPI.startGoogleAuth(authUrl);
        } else if (typeof window !== 'undefined' && (window as any).electronAPI) {
          (window as any).electronAPI.openExternal(authUrl);
        } else if (typeof window !== 'undefined') {
          const popup = window.open(authUrl, 'GoogleDriveAuth', 'width=500,height=650');
          if (!popup) {
            window.location.href = authUrl;
          }
        }
        return;
      }

      if (GoogleSignin) {
        GoogleSignin.configure({
          webClientId,
          iosClientId: '1054174779678-ae04b7lbfpklipf0rvd9u7ua2avg24pu.apps.googleusercontent.com',
          offlineAccess: false,
          scopes: ['https://www.googleapis.com/auth/drive.readonly', 'profile', 'email'],
        });

        if (Platform.OS === 'android') {
          await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        }
        // Force account chooser by signing out and revoking access
        try {
          await GoogleSignin.signOut();
        } catch { }
        try {
          await GoogleSignin.revokeAccess();
        } catch { }

        const userInfo = await GoogleSignin.signIn();
        let accessToken = '';
        try {
          const tokens = await GoogleSignin.getTokens();
          accessToken = tokens?.accessToken || '';
        } catch { }

        const userEmail = userInfo?.data?.user?.email || userInfo?.user?.email || userInfo?.data?.email || 'Google Drive';

        // Fetch folder name with token
        let folderName = customName || `Folder (${folderId.slice(0, 6)})`;
        if (accessToken) {
          try {
            const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name&supportsAllDrives=true`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (metaRes.ok) {
              const metaData = await metaRes.json();
              if (metaData?.name) folderName = metaData.name;
            }
          } catch { }
        }

        const newDrive: ConnectedDrive = {
          id: 'drive_' + Date.now(),
          name: folderName,
          type: 'shared_folder',
          folderId,
          accessToken,
          userEmail,
          addedAt: Date.now(),
        };

        const oauthDrive: ConnectedDrive = {
          id: 'drive_acc_' + Date.now(),
          name: userEmail,
          userEmail,
          type: 'oauth',
          accessToken,
          folderId: 'root',
          addedAt: Date.now(),
        };

        const updated = [newDrive, oauthDrive, ...connectedDrives.filter(d => d.name !== userEmail)];
        await saveGoogleDrives(updated);
        setActiveDriveId(newDrive.id);
        setIsAddingDrive(false);
        setNewDriveName('');
        setNewDriveInput('');
        setAddDriveError('');
        setDriveFolderStack([{ id: folderId, name: folderName }]);
        fetchDriveFolderContents(newDrive, folderId);
      } else {
        Alert.alert(
          'Google Sign-In Unavailable',
          'Native Google Sign-In is not initialized in this environment.'
        );
      }
    } catch (err: any) {
      console.warn('[Google Drive Auth Error]', err);
      try {
        if (err.code === GoogleSigninStatusCodes.SIGN_IN_CANCELLED) {
          return;
        }
      } catch { }
      Alert.alert('Sign-In Failed', err?.message || 'Could not connect Google Drive account.');
    } finally {
      setGoogleDriveLoading(false);
    }
  };

  const fetchPublicFolderEmbedded = async (folderId: string): Promise<{ name?: string; items: DriveFileItem[] }> => {
    try {
      const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });
      if (!res.ok) return { items: [] };
      const html = await res.text();

      // Extract title
      let folderName: string | undefined;
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const rawTitle = titleMatch[1].replace(/\s*-\s*Google Drive\s*$/i, '').trim();
        if (rawTitle && rawTitle !== 'Google Drive') folderName = rawTitle;
      }

      const items: DriveFileItem[] = [];
      const seenIds = new Set<string>();

      // Match all <a> tags
      const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const inner = match[2];

        // 1. Primary: extract title from <div class="flip-entry-title">...</div>
        const titleDivMatch = inner.match(/class=["']flip-entry-title["']>([^<]+)/i);
        let name = titleDivMatch && titleDivMatch[1] ? titleDivMatch[1].trim() : '';

        // 2. Fallback: clean inner text
        if (!name) {
          name = inner
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
        } else {
          // Decode html entities in title
          name = name
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
        }

        if (!name || name === 'Google Drive' || name === 'Open with' || name === 'Sign in') continue;

        // Check if folder: /folders/ID
        const folderMatch = href.match(/\/folders\/([a-zA-Z0-9_-]{15,})/);
        if (folderMatch && folderMatch[1]) {
          const subFolderId = folderMatch[1];
          if (subFolderId !== folderId && !seenIds.has(subFolderId)) {
            seenIds.add(subFolderId);
            items.push({
              id: subFolderId,
              name,
              mimeType: 'application/vnd.google-apps.folder',
            });
          }
          continue;
        }

        // Check if file: /file/d/ID
        const fileMatch = href.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/);
        if (fileMatch && fileMatch[1]) {
          const id = fileMatch[1];
          if (!seenIds.has(id)) {
            seenIds.add(id);
            const isPdf = name.toLowerCase().endsWith('.pdf') || inner.includes('application/pdf') || inner.includes('alt="PDF"');
            items.push({
              id,
              name,
              mimeType: isPdf ? 'application/pdf' : 'application/octet-stream',
            });
          }
          continue;
        }

        // Check if docs/sheets/slides
        const docsMatch = href.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]{15,})/);
        if (docsMatch && docsMatch[2]) {
          const id = docsMatch[2];
          if (!seenIds.has(id)) {
            seenIds.add(id);
            items.push({
              id,
              name,
              mimeType: 'application/vnd.google-apps.' + docsMatch[1],
            });
          }
          continue;
        }
      }

      // Sort folders first, then alphabetical
      items.sort((a, b) => {
        const aF = a.mimeType === 'application/vnd.google-apps.folder';
        const bF = b.mimeType === 'application/vnd.google-apps.folder';
        if (aF && !bF) return -1;
        if (!aF && bF) return 1;
        return a.name.localeCompare(b.name);
      });

      return { name: folderName, items };
    } catch (e) {
      console.warn('[Public Folder Fetch Error]', e);
      return { items: [] };
    }
  };

  const handleAddDrive = async () => {
    if (!newDriveInput.trim()) {
      setAddDriveError('Please enter a Google Drive folder link, file link, or Folder ID.');
      return;
    }
    const parsed = parseDriveInput(newDriveInput);
    if (!parsed) {
      setAddDriveError('Invalid Google Drive link or ID. Please check the URL.');
      return;
    }

    const isDirectFile = parsed.type === 'file';

    if (isDirectFile) {
      const fallbackName = `Drive PDF (${parsed.id.slice(0, 6)})`;
      const label = newDriveName.trim() || fallbackName;
      const newDrive: ConnectedDrive = {
        id: 'drive_' + Date.now(),
        name: label,
        type: 'shared_folder',
        folderId: parsed.id,
        addedAt: Date.now(),
      };
      const updated = [newDrive, ...connectedDrives];
      await saveGoogleDrives(updated);
      setActiveDriveId(newDrive.id);
      setIsAddingDrive(false);
      setNewDriveName('');
      setNewDriveInput('');
      setAddDriveError('');
      setDriveItems([{ id: parsed.id, name: label, mimeType: 'application/pdf' }]);
      return;
    }

    // It's a folder: First try public embedded folder view (for anyone-with-link folders)
    setDriveLoading(true);
    let label = newDriveName.trim();
    let folderItems: DriveFileItem[] = [];

    const pubResult = await fetchPublicFolderEmbedded(parsed.id);
    if (pubResult.name && !label) {
      label = pubResult.name;
    }
    if (pubResult.items.length > 0) {
      folderItems = pubResult.items;
    }

    // Find any existing token from connected drives
    let token = '';
    const oauthDrive = connectedDrives.find(d => d.type === 'oauth' && d.accessToken);
    if (oauthDrive?.accessToken) {
      token = oauthDrive.accessToken;
      if (GoogleSignin) {
        try {
          const t = await GoogleSignin.getTokens();
          if (t?.accessToken) token = t.accessToken;
        } catch { }
      }
    }

    // If public view returned items or user has token, create the drive
    if (folderItems.length === 0 && !token) {
      setDriveLoading(false);
      Alert.alert(
        'Google Sign-In Required',
        'Could not list files anonymously. If this is a private or organization folder, Google requires signing in with your Google account. Would you like to sign in now?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign in with Google',
            onPress: () => handleGoogleDriveSignInForFolder(parsed.id, newDriveName.trim())
          }
        ]
      );
      return;
    }

    if (!label) {
      label = `Folder (${parsed.id.slice(0, 6)})`;
    }

    const newDrive: ConnectedDrive = {
      id: 'drive_' + Date.now(),
      name: label,
      type: 'shared_folder',
      folderId: parsed.id,
      accessToken: token,
      addedAt: Date.now(),
    };

    const updated = [newDrive, ...connectedDrives];
    await saveGoogleDrives(updated);
    setActiveDriveId(newDrive.id);
    setIsAddingDrive(false);
    setNewDriveName('');
    setNewDriveInput('');
    setAddDriveError('');
    setDriveFolderStack([{ id: parsed.id, name: label }]);

    if (folderItems.length > 0) {
      setDriveItems(folderItems);
      setDriveLoading(false);
    } else {
      fetchDriveFolderContents(newDrive, parsed.id);
    }
  };

  const handleRemoveDrive = async (driveId: string) => {
    Alert.alert(
      'Remove Drive?',
      'Disconnect this Google Drive from PDF Reader?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = connectedDrives.filter(d => d.id !== driveId);
            await saveGoogleDrives(updated);
            if (activeDriveId === driveId) {
              const nextActive = updated.length > 0 ? updated[0].id : null;
              setActiveDriveId(nextActive);
              if (nextActive) {
                const drive = updated.find(d => d.id === nextActive);
                if (drive && drive.folderId) {
                  const rootName = drive.folderId === 'root' ? 'My Drive' : drive.name;
                  setDriveFolderStack([{ id: drive.folderId, name: rootName }]);
                  fetchDriveFolderContents(drive, drive.folderId);
                }
              } else {
                setDriveItems([]);
              }
            }
          }
        }
      ]
    );
  };

  const fetchDriveFolderContents = async (drive: ConnectedDrive, folderId?: string) => {
    setDriveLoading(true);
    try {
      const targetFolder = folderId || drive.folderId || 'root';

      // 1. Try public embedded view first (works anonymously for ANY "anyone with link can view" folder!)
      if (targetFolder !== 'root') {
        const pubResult = await fetchPublicFolderEmbedded(targetFolder);
        if (pubResult.name) {
          // If this is the drive root and current name is placeholder, auto-upgrade drive name
          if (targetFolder === drive.folderId && (!drive.name || drive.name.startsWith('Folder (') || drive.name.startsWith('Drive Folder') || drive.name === 'Google Drive')) {
            drive.name = pubResult.name;
            const updated = connectedDrives.map(d => d.id === drive.id ? { ...d, name: pubResult.name! } : d);
            saveGoogleDrives(updated);
          }
          setDriveFolderStack(prev => {
            if (prev.length > 0) {
              return prev.map(crumb => (crumb.id === targetFolder && (!crumb.name || crumb.name.startsWith('Folder (') || crumb.name === 'My Drive')) ? { ...crumb, name: pubResult.name! } : crumb);
            }
            return prev;
          });
        }
        if (pubResult.items.length > 0) {
          setDriveItems(pubResult.items);
          setDriveLoading(false);
          return;
        }
      }

      // 2. Fetch via Google Drive API with OAuth token for THIS specific drive
      let token = drive.accessToken;
      if (!token && drive.type === 'oauth') {
        token = (await refreshDriveToken(drive)) || '';
      }

      if (token) {
        const query = `'${targetFolder}' in parents and trashed = false`;
        const apiEndpoint = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=100&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        let res = await fetch(apiEndpoint, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // If token expired (401), attempt silent refresh once and retry
        if (res.status === 401 && drive.type === 'oauth') {
          const refreshedToken = await refreshDriveToken(drive);
          if (refreshedToken && refreshedToken !== token) {
            token = refreshedToken;
            res = await fetch(apiEndpoint, {
              headers: { Authorization: `Bearer ${token}` }
            });
          }
        }

        if (res.ok) {
          const data = await res.json();
          if (data.files && Array.isArray(data.files)) {
            const mapped: DriveFileItem[] = data.files.map((f: any) => ({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size ? parseInt(f.size, 10) : undefined,
              modifiedTime: f.modifiedTime,
            }));

            mapped.sort((a, b) => {
              const aFolder = a.mimeType === 'application/vnd.google-apps.folder';
              const bFolder = b.mimeType === 'application/vnd.google-apps.folder';
              if (aFolder && !bFolder) return -1;
              if (!aFolder && bFolder) return 1;
              return a.name.localeCompare(b.name);
            });

            setDriveItems(mapped);
            setDriveLoading(false);
            return;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          console.warn('[Google Drive API Error]', res.status, errData);
          if (res.status === 403) {
            Alert.alert(
              'Google Drive Access (403)',
              errData?.error?.message || 'Please ensure Google Drive API is enabled in your Google Cloud Console and Drive permissions are granted.',
              [{ text: 'OK' }]
            );
          } else if (res.status === 401) {
            Alert.alert(
              'Drive Session Expired',
              `The session for ${drive.name} has expired. Would you like to reconnect now?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reconnect Now', onPress: () => handleGoogleDriveSignIn() }
              ]
            );
          }
        }
      } else {
        if (drive.type === 'oauth') {
          Alert.alert(
            'Google Drive Reconnect Needed',
            `No access token found for ${drive.name}. Would you like to reconnect now?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reconnect Now', onPress: () => handleGoogleDriveSignIn() }
            ]
          );
        }
      }

      setDriveItems([]);
    } catch (err) {
      console.warn('[Google Drive Fetch]', err);
      setDriveItems([]);
    } finally {
      setDriveLoading(false);
    }
  };

  const handleNavigateBackInDrive = () => {
    if (driveFolderStack.length > 1) {
      const nextStack = driveFolderStack.slice(0, -1);
      setDriveFolderStack(nextStack);
      const parent = nextStack[nextStack.length - 1];
      const activeDrive = connectedDrives.find(d => d.id === activeDriveId);
      if (activeDrive) {
        fetchDriveFolderContents(activeDrive, parent.id);
      }
    }
  };

  const handleBreadcrumbJump = (index: number) => {
    if (index < driveFolderStack.length - 1) {
      const nextStack = driveFolderStack.slice(0, index + 1);
      setDriveFolderStack(nextStack);
      const target = nextStack[index];
      const activeDrive = connectedDrives.find(d => d.id === activeDriveId);
      if (activeDrive) {
        fetchDriveFolderContents(activeDrive, target.id);
      }
    }
  };

  const handleRefreshCurrentFolder = async () => {
    const activeDrive = connectedDrives.find(d => d.id === activeDriveId);
    if (activeDrive) {
      if (activeDrive.type === 'oauth') {
        await refreshDriveToken(activeDrive);
      }
      const currentFolderId = driveFolderStack.length > 0 ? driveFolderStack[driveFolderStack.length - 1].id : (activeDrive.folderId || 'root');
      fetchDriveFolderContents(activeDrive, currentFolderId);
    }
  };

  // When Google Drive modal is opened, ensure current folder contents are loaded & refreshed
  useEffect(() => {
    if (showDriveModal && connectedDrives.length > 0) {
      const activeDrive = connectedDrives.find(d => d.id === activeDriveId) || connectedDrives[0];
      if (activeDrive) {
        if (activeDriveId !== activeDrive.id) {
          setActiveDriveId(activeDrive.id);
        }
        const currentFolderId = driveFolderStack.length > 0 ? driveFolderStack[driveFolderStack.length - 1].id : (activeDrive.folderId || 'root');
        fetchDriveFolderContents(activeDrive, currentFolderId);
      }
    }
  }, [showDriveModal]);

  useEffect(() => {
    if (!showDriveModal) return;
    const backAction = () => {
      if (isAddingDrive) {
        setIsAddingDrive(false);
        return true;
      }
      if (driveFolderStack.length > 1) {
        handleNavigateBackInDrive();
        return true;
      }
      setShowDriveModal(false);
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [showDriveModal, isAddingDrive, driveFolderStack, connectedDrives, activeDriveId]);

  const handleRenameDrive = async () => {
    if (!renameTarget) return;
    const trimmed = renameInput.trim();
    if (!trimmed) {
      Alert.alert('Invalid Name', 'Folder nickname cannot be empty.');
      return;
    }
    const targetId = renameTarget.id;
    const updated = connectedDrives.map(d => d.id === targetId ? { ...d, name: trimmed } : d);
    await saveGoogleDrives(updated);
    if (activeDriveId === targetId) {
      setDriveFolderStack(prev => {
        if (prev.length > 0) {
          const copy = [...prev];
          copy[0] = { ...copy[0], name: trimmed };
          return copy;
        }
        return prev;
      });
    }
    setRenameTarget(null);
    setRenameInput('');
  };

  const handleDownloadToDevice = async (item: DriveFileItem) => {
    setFileOptionsTarget(null);
    setShowDriveModal(false);
    try {
      setLoading(true);
      setLoadProgress(`Saving ${item.name} to HelperPDF_Downloads\u2026`);

      const activeDrive = connectedDrives.find(d => d.id === activeDriveId);
      let downloadUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${item.id}`;
      if (activeDrive?.accessToken) {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&supportsAllDrives=true`;
      }

      // Standalone download: save to local app documents directory
      const cleanName = item.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const destDir = `${FileSystem.documentDirectory}helper_pdf_downloads/`;
      const dirInfo = await FileSystem.getInfoAsync(destDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      }
      const destUri = `${destDir}${cleanName}`;
      const dlRes = await FileSystem.downloadAsync(downloadUrl, destUri, {
        headers: activeDrive?.accessToken ? { 'Authorization': `Bearer ${activeDrive.accessToken}` } : {},
      });
      if (!dlRes || !dlRes.uri) throw new Error('Download returned no URI');
      Alert.alert('✅ Saved Successfully', `Saved to device: ${item.name}`);
    } catch (err: any) {
      Alert.alert('Download Error', err?.message || 'Failed to download file to device.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOffline = async (item: DriveFileItem) => {
    setFileOptionsTarget(null);
    const isAlreadyOffline = !!offlineDriveFiles[item.id];
    if (isAlreadyOffline) {
      Alert.alert(
        'Remove from Offline?',
        `"${item.name}" will be removed from your offline storage.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                const localUri = offlineDriveFiles[item.id];
                if (localUri) {
                  await FileSystem.deleteAsync(localUri, { idempotent: true });
                }
                const updated = { ...offlineDriveFiles };
                delete updated[item.id];
                setOfflineDriveFiles(updated);
                await AsyncStorage.setItem(STORAGE_OFFLINE_DRIVE, JSON.stringify(updated));
                Alert.alert('Removed', `"${item.name}" removed from offline storage.`);
              } catch (err: any) {
                Alert.alert('Error', err?.message || 'Could not remove file.');
              }
            }
          }
        ]
      );
      return;
    }

    try {
      setLoading(true);
      setLoadProgress(`Saving ${item.name} for offline reading\u2026`);
      await ensureOfflineDir();
      const cleanId = item.id.replace(/[^a-zA-Z0-9]/g, '_');
      const localUri = `${OFFLINE_DRIVE_DIR}offline_${cleanId}.pdf`;

      const activeDrive = connectedDrives.find(d => d.id === activeDriveId);
      let downloadUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${item.id}`;
      const headers: Record<string, string> = {};
      if (activeDrive?.accessToken) {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&supportsAllDrives=true`;
        headers['Authorization'] = `Bearer ${activeDrive.accessToken}`;
      }

      const res = await FileSystem.downloadAsync(downloadUrl, localUri, { headers });
      if (res.status >= 400) {
        const pubUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${item.id}`;
        const pubRes = await FileSystem.downloadAsync(pubUrl, localUri);
        if (pubRes.status >= 400) {
          throw new Error(`Download failed with status ${pubRes.status}`);
        }
      }

      const updated = { ...offlineDriveFiles, [item.id]: localUri };
      setOfflineDriveFiles(updated);
      await AsyncStorage.setItem(STORAGE_OFFLINE_DRIVE, JSON.stringify(updated));
      Alert.alert('✅ Available Offline', `"${item.name}" is now saved on your device and will open instantly without internet.`);
    } catch (err: any) {
      Alert.alert('Offline Error', err?.message || 'Failed to save for offline reading.');
    } finally {
      setLoading(false);
    }
  };

  const openDriveFile = async (drive: ConnectedDrive, item: DriveFileItem) => {
    try {
      setShowDriveModal(false);
      setLoading(true);
      setLoadProgress(`Opening ${item.name}\u2026`);

      // Web / Electron Desktop handler
      if ((Platform.OS as string) === 'web') {
        const driveKey = `gdrive://${item.id}/${encodeURIComponent(item.name)}`;
        const cachedB64 = await getPdfFromDb(driveKey) || await getPdfFromDb(`gdrive://${item.id}`);
        if (cachedB64) {
          setPdfUri(driveKey);
          setPdfName(item.name);
          setPdfBase64(cachedB64);
          saveRecent({ uri: driveKey, name: item.name, openedAt: Date.now() });
          setLoading(false);
          return;
        }

        let token = drive.accessToken;
        if (!token && drive.type === 'oauth') {
          token = (await refreshDriveToken(drive)) || '';
        }
        if (!token) {
          const oauthDrive = connectedDrives.find(d => d.type === 'oauth' && d.accessToken);
          if (oauthDrive?.accessToken) token = oauthDrive.accessToken;
        }

        let b64 = '';
        if ((window as any).electronAPI?.fetchDriveFile) {
          setLoadProgress(`Downloading ${item.name} from Google Drive\u2026`);
          let res = await (window as any).electronAPI.fetchDriveFile({
            fileId: item.id,
            token: token || undefined,
          });
          if (!res?.success && res?.error && (res.error.includes('401') || res.error.includes('auth') || res.error.includes('token') || res.error.includes('expired')) && drive.type === 'oauth') {
            const freshToken = await refreshDriveToken(drive);
            if (freshToken) {
              token = freshToken;
              res = await (window as any).electronAPI.fetchDriveFile({
                fileId: item.id,
                token: token || undefined,
              });
            }
          }
          if (res && res.success && res.base64) {
            b64 = res.base64;
          } else {
            if (res?.error && (res.error.includes('401') || res.error.includes('auth') || res.error.includes('token') || res.error.includes('expired'))) {
              Alert.alert(
                'Drive Session Expired',
                `Your Google Drive session has expired. Would you like to reconnect now?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Reconnect Now', onPress: () => handleGoogleDriveSignIn() }
                ]
              );
              setLoading(false);
              return;
            }
            throw new Error(res?.error || 'Failed to download file from Google Drive');
          }
        } else {
          setLoadProgress(`Fetching ${item.name}\u2026`);
          const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&supportsAllDrives=true`;
          const resp = await fetch(token ? driveApiUrl : `https://drive.google.com/uc?export=download&confirm=t&id=${item.id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (!resp.ok) throw new Error(`Drive fetch error: ${resp.status}`);
          const blob = await resp.blob();
          b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }

        await savePdfToDb(driveKey, b64);
        await savePdfToDb(`gdrive://${item.id}`, b64);
        setPdfUri(driveKey);
        setPdfName(item.name);
        setPdfBase64(b64);
        saveRecent({ uri: driveKey, name: item.name, openedAt: Date.now() });
        setLoading(false);
        return;
      }

      // 1. Instant check: Is it stored in offline files?
      const offlineUri = offlineDriveFiles[item.id];
      if (offlineUri) {
        const info = await FileSystem.getInfoAsync(offlineUri);
        if (info.exists && info.size > 0) {
          const b64 = await FileSystem.readAsStringAsync(offlineUri, { encoding: 'base64' });
          setPdfUri(offlineUri);
          setPdfName(item.name);
          setPdfBase64(b64);
          saveRecent({ uri: offlineUri, name: item.name, openedAt: Date.now() });
          setLoading(false);
          return;
        }
      }

      // 2. Instant check: Is it in persistent cache?
      const sanitizeFileName = item.id.replace(/[^a-zA-Z0-9]/g, '_');
      const cacheUri = `${FileSystem.cacheDirectory}gdrive_${sanitizeFileName}.pdf`;
      const cacheInfo = await FileSystem.getInfoAsync(cacheUri);
      if (cacheInfo.exists && cacheInfo.size > 0) {
        const b64 = await FileSystem.readAsStringAsync(cacheUri, { encoding: 'base64' });
        setPdfUri(`gdrive://${item.id}/${encodeURIComponent(item.name)}`);
        setPdfName(item.name);
        setPdfBase64(b64);
        saveRecent({ uri: `gdrive://${item.id}/${encodeURIComponent(item.name)}`, name: item.name, openedAt: Date.now() });
        setLoading(false);
        return;
      }

      // 3. Not in cache yet: Download directly to cacheUri
      let token = drive.accessToken;
      if (!token) {
        const oauthDrive = connectedDrives.find(d => d.type === 'oauth' && d.accessToken);
        if (oauthDrive?.accessToken) token = oauthDrive.accessToken;
      }

      if (GoogleSignin) {
        try {
          const tokens = await GoogleSignin.getTokens();
          if (tokens?.accessToken) {
            token = tokens.accessToken;
            if (drive.type === 'oauth') drive.accessToken = token;
          }
        } catch { }
      }

      if (token) {
        const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&supportsAllDrives=true`;
        if ((Platform.OS as string) === 'web') {
          const resp = await fetch(driveApiUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!resp.ok) throw new Error(`Drive fetch error: ${resp.status}`);
          const blob = await resp.blob();
          const b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          await savePdfToDb(driveApiUrl, b64);
          setPdfUri(driveApiUrl);
          setPdfName(item.name);
          setPdfBase64(b64);
          saveRecent({ uri: driveApiUrl, name: item.name, openedAt: Date.now() });
        } else {
          const downloadRes = await FileSystem.downloadAsync(driveApiUrl, cacheUri, {
            headers: { Authorization: `Bearer ${token}` }
          });
          let localUri = cacheUri;
          if (downloadRes.status >= 400) {
            const pubUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${item.id}`;
            const pubRes = await FileSystem.downloadAsync(pubUrl, cacheUri);
            if (pubRes.status >= 400) throw new Error(`Google Drive download failed with code ${downloadRes.status}`);
            localUri = pubRes.uri;
          }
          const b64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
          setPdfUri(`gdrive://${item.id}/${encodeURIComponent(item.name)}`);
          setPdfName(item.name);
          setPdfBase64(b64);
          saveRecent({ uri: `gdrive://${item.id}/${encodeURIComponent(item.name)}`, name: item.name, openedAt: Date.now() });
        }
      } else {
        const fileUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${item.id}`;
        const downloadRes = await FileSystem.downloadAsync(fileUrl, cacheUri);
        if (downloadRes.status >= 400) throw new Error(`Download failed with code ${downloadRes.status}`);
        const b64 = await FileSystem.readAsStringAsync(downloadRes.uri, { encoding: 'base64' });
        setPdfUri(`gdrive://${item.id}/${encodeURIComponent(item.name)}`);
        setPdfName(item.name);
        setPdfBase64(b64);
        saveRecent({ uri: `gdrive://${item.id}/${encodeURIComponent(item.name)}`, name: item.name, openedAt: Date.now() });
      }
    } catch (err: any) {
      Alert.alert('Google Drive Error', err?.message || 'Failed to open file from Google Drive');
    } finally {
      setLoading(false);
    }
  };

  const loadBookmarks = async (name: string) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_BOOKMARKS_PREFIX + name);
      if (raw) setBookmarks(JSON.parse(raw));
      else setBookmarks([]);
    } catch { }
  };

  const saveBookmarks = async (bms: BookmarkEntry[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_BOOKMARKS_PREFIX + pdfName, JSON.stringify(bms));
    } catch { }
  };

  const toggleBookmark = () => {
    const exists = bookmarks.find(b => b.page === currentPage);
    let updated: BookmarkEntry[];
    if (exists) {
      updated = bookmarks.filter(b => b.page !== currentPage);
    } else {
      updated = [...bookmarks, { page: currentPage, note: '', addedAt: Date.now() }]
        .sort((a, b) => a.page - b.page);
    }
    setBookmarks(updated);
    saveBookmarks(updated);
  };

  const isBookmarked = bookmarks.some(b => b.page === currentPage);

  // ---------------------------------------------------------------------------
  // Document Picker
  // ---------------------------------------------------------------------------
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/html',
          'text/plain',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (Platform.OS === 'web' && asset.file) {
        await openPdf(asset.uri, asset.name, asset.file);
      } else {
        await openPdf(asset.uri, asset.name);
      }
    } catch (err: any) {
      Alert.alert('Error', 'Failed to open document: ' + (err?.message ?? 'Unknown error'));
    }
  };

  // ---------------------------------------------------------------------------
  // WebView communication
  // ---------------------------------------------------------------------------
  const sendCmd = useCallback((cmd: object) => {
    if ((Platform.OS as string) === 'web') {
      try {
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage(JSON.stringify(cmd), '*');
        }
      } catch (e) {
        console.warn('Failed to send command to iframe', e);
      }
    } else {
      const jsonStr = JSON.stringify(cmd);
      let script = `window.receiveCmd(${JSON.stringify(jsonStr)});`;
      if (cmd && (cmd as any).action === 'GOTO' && typeof (cmd as any).page === 'number') {
        script += ` if (typeof window.goToPage === 'function') { window.goToPage(${(cmd as any).page}); }`;
      }
      script += ` true;`;
      webViewRef.current?.injectJavaScript(script);
    }
  }, []);

  // Screen dimensions — listen for rotation, then tell the WebView to re-render pages at new width
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', (dims: any) => {
      const win = dims.window;
      setScreenDims(win as any);
      // Give the WebView layout time to settle before asking pdf.js to resize
      setTimeout(() => {
        sendCmd({ action: 'RESIZE' });
      }, 300);
    });
    return () => sub?.remove?.();
  }, [sendCmd]);

  const injectPdf = useCallback(() => {
    if (!pdfBase64 || !webViewRef.current) return;
    setLoadProgress('Rendering pages\u2026');
    // Send base64 via injectJavaScript - fastest way for React Native
    // Use a small delay to ensure WebView is fully ready
    setTimeout(() => {
      sendCmd({ action: 'LOAD', base64: pdfBase64 });
    }, 100);
  }, [pdfBase64, sendCmd]);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'TOTAL_PAGES':
          setTotalPages(data.total);
          setLoading(false);
          break;
        case 'OUTLINE':
          setOutline(data.outline || []);
          break;
        case 'PAGE_CHANGE':
          setCurrentPage(data.page);
          if (isPlaying && data.page !== ttsPage) {
            setScrollPendingPage(data.page);
          } else if (!isPlaying) {
            setTtsPage(data.page);
          }
          break;
        case 'PAGE_TEXT':
          (async () => {
            if (pdfUri) {
              const correctionKey = `@pdfCorrection_${pdfUri}_${data.page}`;
              try {
                const savedText = await AsyncStorage.getItem(correctionKey);
                setExtractedPages(prev => ({ ...prev, [data.page]: savedText || data.text }));
              } catch (_) {
                setExtractedPages(prev => ({ ...prev, [data.page]: data.text }));
              }
            } else {
              setExtractedPages(prev => ({ ...prev, [data.page]: data.text }));
            }
          })();
          break;
        case 'AI_OCR_IMAGE':
          performAiOcrRequest(data.page, data.image);
          break;
        case 'AI_OCR_IMAGE_ERROR':
          setAiLoading(false);
          Alert.alert('AI OCR Error', 'Failed to capture page canvas: ' + data.error);
          break;
        case 'PAGE_IMAGE_EXPORTED':
          (async () => {
            try {
              const b64 = data.image.replace(/^data:image\/\w+;base64,/, '');
              const ext = data.format === 'jpg' || data.format === 'jpeg' ? 'jpg' : 'png';
              const cleanName = (pdfName || 'document').replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
              const fileName = `${cleanName}_page_${data.page}.${ext}`;
              const destUri = `${FileSystem.documentDirectory}${Date.now()}_${fileName}`;
              await FileSystem.writeAsStringAsync(destUri, b64, { encoding: 'base64' });
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(destUri, {
                  mimeType: ext === 'jpg' ? 'image/jpeg' : 'image/png',
                  dialogTitle: `Exported Page ${data.page} as ${ext.toUpperCase()}`,
                });
              } else {
                Alert.alert('Page Exported', `Saved as ${fileName}`);
              }
            } catch (err: any) {
              Alert.alert('Export Failed', err?.message || 'Could not export page image.');
            }
          })();
          break;
        case 'SEARCH_RESULT':
          setSearchCount(data.count);
          break;
        case 'PDF_SCROLL_DOWN':
          if (activeTab === 'read') hideControls();
          break;
        case 'PDF_SCROLL_UP':
          if (activeTab === 'read') showControls();
          break;
        case 'PDF_TAP':
          if (activeTab === 'read') {
            if (controlsVisible.current) {
              hideControls();
            } else {
              showControls();
            }
          }
          break;
        case 'LINK_TAP':
          if (data.dest) {
            try {
              const destObj = typeof data.dest === 'string' ? JSON.parse(data.dest) : data.dest;
              const pageNum = typeof destObj === 'number' ? destObj : destObj?.page;
              if (pageNum && pageNum > 0) {
                savedPageRef.current = pageNum;
                setCurrentPage(pageNum);
                setTtsPage(pageNum);
              }
            } catch (e) { }
          }
          break;
        case 'LINK_TAP_URL':
          console.log('[WebView Link Tap URL]:', data.url);
          break;
        case 'ERROR':
          setLoading(false);
          Alert.alert('PDF Error', data.error || 'Could not render this PDF.');
          break;
      }
    } catch { }
  }, [pdfUri, isPlaying, ttsPage, activeTab, showControls, hideControls]);

  // Listen for messages from iframe on Web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        handleWebViewMessage({ nativeEvent: { data: event.data } });
      } catch (e) {
        // ignore non-JSON messages
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleWebViewMessage]);

  // Apply theme to WebView when theme changes
  useEffect(() => {
    sendCmd({ action: 'THEME', key: themeKey, bg: rt.webBg, deep: deepThemeEnabled });
  }, [themeKey, rt.webBg, deepThemeEnabled, sendCmd]);

  // Keep savedPageRef always up-to-date whenever currentPage changes
  useEffect(() => {
    if (currentPage > 0) savedPageRef.current = currentPage;
  }, [currentPage]);

  // Sync active page position when switching tabs
  useEffect(() => {
    if (activeTab === 'read' && pdfBase64) {
      showControls();
      // Use ref so we always get the freshest value, not a stale closure
      const pageToSync = savedPageRef.current;
      if (pageToSync > 1) {
        // Small delay to let the view become visible before scrolling
        const timer = setTimeout(() => {
          sendCmd({ action: 'GOTO', page: pageToSync });
        }, 300);
        return () => clearTimeout(timer);
      }
    } else if (activeTab === 'listen') {
      // Save current page when leaving Read tab
      setTtsPage(savedPageRef.current);
    }
  }, [activeTab, pdfBase64]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI OCR Handler
  const handleAiOcr = (page: number) => {
    setAiLoading(true);
    setLoadProgress('Capturing page canvas\u2026');
    abortControllerRef.current = new AbortController();
    sendCmd({ action: 'GET_PAGE_IMAGE', page });
  };

  const performAiOcrRequest = async (page: number, _imageBase64: string) => {
    // Standalone mode: AI OCR requires a server. Not available here.
    setAiLoading(false);
    Alert.alert(
      'AI OCR Unavailable',
      'AI text extraction is not available in the standalone PDF Reader. Use the built-in text copy feature instead.'
    );
  };

  const renderOutlineItems = (items: OutlineItem[], level: number = 0) => {
    return items.map((item, idx) => (
      <View key={`${level}-${idx}-${item.title}`}>
        <TouchableOpacity
          style={[
            s.bookmarkRow,
            { borderBottomColor: colors.border, paddingLeft: 10 + level * 16 }
          ]}
          onPress={() => {
            if (item.page) {
              const targetPage = item.page;
              // Update ref immediately so any later useEffect reads correct value
              savedPageRef.current = targetPage;
              setCurrentPage(targetPage);
              setTtsPage(targetPage);

              if (activeTab !== 'read') {
                // Switch to read tab — the activeTab useEffect will call GOTO
                setShowIndexModal(false);
                setActiveTab('read');
              } else {
                // Already on read tab: close modal first, then scroll after
                // modal close animation completes (~250ms on Android)
                setShowIndexModal(false);
                setTimeout(() => {
                  sendCmd({ action: 'GOTO', page: targetPage });
                }, 350);
              }
            }
          }}
        >
          <BookOpen size={14} color={item.page ? colors.primary : colors.muted} />
          <Text style={[s.bookmarkLabel, { color: colors.text, flex: 1, marginLeft: 8, fontSize: 13 - (level > 1 ? 1 : 0) }]} numberOfLines={2}>
            {item.title}
          </Text>
          {item.page ? (
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, backgroundColor: colors.primary + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
              Page {item.page}
            </Text>
          ) : null}
        </TouchableOpacity>
        {item.items && item.items.length > 0 ? renderOutlineItems(item.items, level + 1) : null}
      </View>
    ));
  };

  const cancelAiOcr = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setAiLoading(false);
  };

  // ---------------------------------------------------------------------------
  // Viewer HTML (memoized — same framework HTML, PDF injected separately)
  // ---------------------------------------------------------------------------
  const viewerHtml = useMemo(
    () => {
      let html = buildViewerHtml(rt.webBg, rt.text ?? colors.text, topPadding, hasAppHeader);
      if (Platform.OS === 'web' && pdfBase64) {
        html = html.replace('pdfjsLib.GlobalWorkerOptions.workerSrc=', `window.PDF_BASE64 = "${pdfBase64}"; pdfjsLib.GlobalWorkerOptions.workerSrc=`);
      }
      return html;
    },
    [themeKey, colors.text, pdfBase64, topPadding, hasAppHeader]
  );

  // ---------------------------------------------------------------------------
  // TTS
  // ---------------------------------------------------------------------------
  const startSpeaking = (pageNum: number = ttsPage) => {
    const text = extractedPages[pageNum];
    if (!text?.trim()) {
      Alert.alert('No Text', 'No readable text found on this page.');
      return;
    }
    const sentences = text.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 5);
    if (!sentences.length) sentences.push(text.substring(0, 200));

    ttsQueueRef.current = sentences;
    ttsIndexRef.current = 0;
    isTtsActiveRef.current = true;
    setIsPlaying(true);
    setIsPaused(false);
    speakNext();
  };

  const speakNext = () => {
    if (!isTtsActiveRef.current) return;
    if (ttsIndexRef.current >= ttsQueueRef.current.length) {
      isTtsActiveRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
      // auto-advance
      setTtsPage(prev => {
        const next = prev + 1;
        if (next <= totalPages) {
          setTimeout(() => {
            isTtsActiveRef.current = true;
            startSpeaking(next);
          }, 500);
          return next;
        }
        return prev;
      });
      return;
    }
    Speech.speak(ttsQueueRef.current[ttsIndexRef.current], {
      rate: speechRate,
      pitch: 1.0,
      voice: selectedVoice?.identifier || undefined,
      onDone: () => {
        if (!isTtsActiveRef.current) return;
        ttsIndexRef.current += 1;
        speakNext();
      },
      onError: () => {
        if (!isTtsActiveRef.current) return;
        isTtsActiveRef.current = false;
        setIsPlaying(false);
        setIsPaused(false);
      },
    });
  };

  const playDemo = (voice: Speech.Voice) => {
    isTtsActiveRef.current = false;
    Speech.stop();
    setIsPlaying(false);
    setIsPaused(false);
    // Speak a short demo sample sentence
    Speech.speak("Hello! This is a demo of my voice in UPSC Helper.", {
      voice: voice.identifier,
      rate: speechRate,
      pitch: 1.0,
    });
  };

  const handleSaveCorrection = async () => {
    if (!pdfUri) return;
    try {
      const correctionKey = `@pdfCorrection_${pdfUri}_${ttsPage}`;
      await AsyncStorage.setItem(correctionKey, editText);
      setExtractedPages(prev => ({ ...prev, [ttsPage]: editText }));
      setIsEditingText(false);
      Alert.alert('Success', 'Text updated. Next time you load this PDF, it will use this corrected version.');

      // Restart speech if active to read the newly corrected text
      if (isPlaying) {
        stopSpeaking();
        setTimeout(() => startSpeaking(ttsPage), 200);
      }
    } catch (err: any) {
      Alert.alert('Error', 'Failed to save correction: ' + err.message);
    }
  };

  const pauseSpeaking = async () => {
    isTtsActiveRef.current = false;
    await Speech.stop();
    setIsPlaying(false);
    setIsPaused(true);
  };
  const resumeSpeaking = () => {
    isTtsActiveRef.current = true;
    setIsPlaying(true);
    setIsPaused(false);
    speakNext();
  };
  const stopSpeaking = () => {
    isTtsActiveRef.current = false;
    Speech.stop();
    setIsPlaying(false);
    setIsPaused(false);
    ttsIndexRef.current = 0;
  };

  useEffect(() => { return () => { isTtsActiveRef.current = false; Speech.stop(); }; }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const hasPdf = !!pdfBase64;
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const closeCurrentPdf = useCallback(() => {
    try { Speech.stop(); } catch { }
    setIsPlaying(false);
    setIsPaused(false);
    setPdfBase64(null);
    setPdfUri(null);
    setPdfName('');
    setShowDriveModal(false);
    if (onClose) onClose();
  }, [onClose]);

  useEffect(() => {
    if (!hasPdf) return;
    const backAction = () => {
      closeCurrentPdf();
      return true;
    };
    const handler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => handler.remove();
  }, [hasPdf, closeCurrentPdf]);

  const renderDriveContent = () => {
    const activeDrive = connectedDrives.find(d => d.id === activeDriveId);
    const isSubfolder = driveFolderStack.length > 1;
    const currentCrumb = driveFolderStack.length > 0 ? driveFolderStack[driveFolderStack.length - 1] : null;
    const parentCrumb = isSubfolder ? driveFolderStack[driveFolderStack.length - 2] : null;
    const isBrowsing = connectedDrives.length > 0 && !isAddingDrive;

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 14 }}>
          {/* Header */}
          {(() => {
            if (isBrowsing && isSubfolder) {
              return (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                    <TouchableOpacity
                      onPress={handleNavigateBackInDrive}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        backgroundColor: colors.bg,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                      activeOpacity={0.7}
                    >
                      <ArrowLeft size={16} color={colors.text} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>Back</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[s.sheetTitle, { color: colors.text, marginBottom: 0, textAlign: 'left', fontSize: 15.5 }]}>
                        {currentCrumb?.name || 'Folder'}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 11, color: rMuted }}>
                        in {parentCrumb?.name || 'Drive'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      onPress={handleRefreshCurrentFolder}
                      style={{ padding: 7, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
                      activeOpacity={0.7}
                    >
                      <RefreshCw size={14} color={colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => activeDrive && setFolderOptionsTarget(activeDrive)}
                      style={{ padding: 7, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
                      activeOpacity={0.7}
                    >
                      <MoreVertical size={14} color={colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setShowDriveModal(false);
                        setIsAddingDrive(false);
                      }}
                      style={{ padding: 7, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
                      activeOpacity={0.7}
                    >
                      <X size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            if (isBrowsing) {
              return (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <GoogleDriveIcon size={19} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[s.sheetTitle, { color: colors.text, marginBottom: 0, textAlign: 'left', fontSize: 15.5 }]}>
                        {activeDrive?.name || 'Google Drive'}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 11, color: rMuted }}>
                        {activeDrive?.type === 'oauth' ? 'Personal Google Drive' : 'Google Drive Folder'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      onPress={handleRefreshCurrentFolder}
                      style={{ padding: 7, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
                      activeOpacity={0.7}
                    >
                      <RefreshCw size={14} color={colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => activeDrive && setFolderOptionsTarget(activeDrive)}
                      style={{ padding: 7, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
                      activeOpacity={0.7}
                    >
                      <MoreVertical size={14} color={colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setShowDriveModal(false);
                        setIsAddingDrive(false);
                      }}
                      style={{ padding: 7, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
                      activeOpacity={0.7}
                    >
                      <X size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            return (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <GoogleDriveIcon size={18} />
                  </View>
                  <View>
                    <Text style={[s.sheetTitle, { color: colors.text, marginBottom: 0, textAlign: 'left' }]}>Google Drive</Text>
                    <Text style={{ fontSize: 11, color: rMuted }}>Connect & browse your Google Drive PDFs</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setShowDriveModal(false);
                    setIsAddingDrive(false);
                  }}
                  style={{ padding: 4 }}
                >
                  <X size={20} color={rText} />
                </TouchableOpacity>
              </View>
            );
          })()}

          {/* View: Adding New Drive or No Drives Connected */}
          {(connectedDrives.length === 0 || isAddingDrive) ? (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }}>
              <View style={{ backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
                {/* Google Account Direct Sign-In Button */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderWidth: 1.5,
                    borderRadius: 10,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    marginBottom: 8,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                  }}
                  onPress={handleGoogleDriveSignIn}
                  disabled={googleDriveLoading}
                  activeOpacity={0.8}
                >
                  {googleDriveLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#ea4335', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>G</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.text }}>
                          Sign in with Google Account
                        </Text>
                      </View>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={{ fontSize: 11, color: rMuted, textAlign: 'center', marginBottom: 14 }}>
                  Sign in to browse your personal Google Drive folders and PDF files, just like in the Drive app.
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 8 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                  <Text style={{ marginHorizontal: 8, fontSize: 10.5, fontWeight: '700', color: rMuted, textTransform: 'uppercase' }}>
                    Or Connect Shared Folder / Link
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                </View>

                <TextInput
                  placeholder="Drive Nickname (optional)"
                  placeholderTextColor={rMuted}
                  value={newDriveName}
                  onChangeText={setNewDriveName}
                  style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: colors.text, marginBottom: 10 }}
                />

                <TextInput
                  placeholder="Paste Google Drive Link or Folder ID"
                  placeholderTextColor={rMuted}
                  value={newDriveInput}
                  onChangeText={(text) => { setNewDriveInput(text); setAddDriveError(''); }}
                  style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: colors.text, marginBottom: 10 }}
                />

                {addDriveError ? (
                  <Text style={{ fontSize: 11, color: '#ef4444', marginBottom: 10 }}>{addDriveError}</Text>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                  {connectedDrives.length > 0 && (
                    <TouchableOpacity
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
                      onPress={() => {
                        setIsAddingDrive(false);
                        setAddDriveError('');
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}
                    onPress={handleAddDrive}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Connect Drive</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          ) : (
            /* View: Browsing Connected Drives */
            <View style={{ flex: 1 }}>
              {/* Active Account Switcher / Multi-Drive Tabs */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: rMuted, textTransform: 'uppercase' }}>
                  Connected Accounts ({connectedDrives.length})
                </Text>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}
                  onPress={() => setIsAddingDrive(true)}
                >
                  <Plus size={13} color={colors.primary} />
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.primary }}>Add Account</Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 10 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {connectedDrives.map(drive => {
                    const isActive = activeDriveId === drive.id;
                    return (
                      <View
                        key={drive.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: isActive ? colors.primary : colors.bg,
                          borderColor: isActive ? colors.primary : colors.border,
                          borderWidth: 1,
                          borderRadius: 20,
                          paddingLeft: 10,
                          paddingRight: 6,
                          paddingVertical: 5,
                        }}
                      >
                        <TouchableOpacity
                          onPress={async () => {
                            setActiveDriveId(drive.id);
                            const rootFolder = drive.folderId || 'root';
                            const rootName = rootFolder === 'root' ? 'My Drive' : drive.name;
                            setDriveFolderStack([{ id: rootFolder, name: rootName }]);
                            if (drive.type === 'oauth' && !drive.accessToken) {
                              await refreshDriveToken(drive);
                            }
                            fetchDriveFolderContents(drive, rootFolder);
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        >
                          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: isActive ? '#fff' : colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 10, fontWeight: '900', color: isActive ? colors.primary : colors.primary }}>
                              {drive.type === 'oauth' ? 'G' : '📁'}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? '#fff' : colors.text }}>
                            {drive.name}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setFolderOptionsTarget(drive)}
                          style={{ padding: 4, marginLeft: 2 }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MoreVertical size={13} color={isActive ? '#fff' : rMuted} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Breadcrumb Navigation Bar (Folder Path like Drive app) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 10, borderWidth: 1, borderColor: colors.border }}>
                {driveFolderStack.length > 1 && (
                  <TouchableOpacity
                    onPress={handleNavigateBackInDrive}
                    style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
                    activeOpacity={0.7}
                  >
                    <ChevronLeft size={14} color={colors.text} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, marginLeft: 2 }}>Back</Text>
                  </TouchableOpacity>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 3, flexGrow: 1 }}>
                  {driveFolderStack.map((crumb, idx) => {
                    const isLast = idx === driveFolderStack.length - 1;
                    const activeDrive = connectedDrives.find(d => d.id === activeDriveId);
                    const displayName = crumb.name || (idx === 0 ? (activeDrive?.folderId === 'root' ? 'My Drive' : (activeDrive?.name || 'Drive Folder')) : 'Folder');
                    return (
                      <View key={crumb.id + '_' + idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {idx > 0 && <ChevronRight size={12} color={rMuted} style={{ marginHorizontal: 2 }} />}
                        <TouchableOpacity
                          onPress={() => handleBreadcrumbJump(idx)}
                          disabled={isLast}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingVertical: 3,
                            paddingHorizontal: 6,
                            borderRadius: 5,
                            backgroundColor: isLast ? colors.primary + '18' : 'transparent',
                          }}
                        >
                          <Folder size={11} color={isLast ? colors.primary : rMuted} />
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 12,
                              fontWeight: isLast ? '800' : '600',
                              color: isLast ? colors.primary : rMuted,
                              maxWidth: 130,
                            }}
                          >
                            {displayName}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Search and Filter Row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border }}>
                  <Search size={14} color={rMuted} />
                  <TextInput
                    placeholder="Search in folder..."
                    placeholderTextColor={rMuted}
                    value={driveSearch}
                    onChangeText={setDriveSearch}
                    style={{ flex: 1, paddingVertical: 6, paddingHorizontal: 8, fontSize: 12, color: colors.text }}
                  />
                  {driveSearch ? (
                    <TouchableOpacity onPress={() => setDriveSearch('')}>
                      <X size={14} color={rMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Filter Pills */}
                {(() => {
                  const folderCount = driveItems.filter(i => i.mimeType === 'application/vnd.google-apps.folder').length;
                  const pdfCount = driveItems.filter(i => i.mimeType === 'application/pdf' || i.name.toLowerCase().endsWith('.pdf')).length;
                  return (
                    <View style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 2 }}>
                      <TouchableOpacity
                        onPress={() => setDriveFilter('all')}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 6,
                          backgroundColor: driveFilter === 'all' ? colors.primary : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: driveFilter === 'all' ? '#fff' : rMuted }}>
                          All
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setDriveFilter('folders')}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 6,
                          backgroundColor: driveFilter === 'folders' ? colors.primary : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: driveFilter === 'folders' ? '#fff' : rMuted }}>
                          Folders ({folderCount})
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setDriveFilter('pdf')}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 6,
                          backgroundColor: driveFilter === 'pdf' ? colors.primary : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: driveFilter === 'pdf' ? '#fff' : rMuted }}>
                          Docs &amp; PDFs ({pdfCount})
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </View>

              {/* Session Expired Banner for oauth drive with empty token */}
              {(() => {
                const activeDrive = connectedDrives.find(d => d.id === activeDriveId);
                if (activeDrive && activeDrive.type === 'oauth' && !activeDrive.accessToken) {
                  return (
                    <View style={{ backgroundColor: '#fef3c7', borderRadius: 10, borderWidth: 1, borderColor: '#f59e0b', padding: 14, marginBottom: 12, flexDirection: 'column', gap: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400e' }}>⚠️ Drive Session Expired</Text>
                      <Text style={{ fontSize: 12, color: '#78350f', lineHeight: 18 }}>
                        Your Google Drive session has ended (app was reinstalled or session expired). Please reconnect to browse your files.
                      </Text>
                      <TouchableOpacity
                        style={{ backgroundColor: '#f59e0b', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16, alignSelf: 'flex-start', marginTop: 4 }}
                        onPress={handleGoogleDriveSignIn}
                        disabled={googleDriveLoading}
                      >
                        {googleDriveLoading
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Reconnect Google Drive</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  );
                }
                return null;
              })()}

              {/* Drive Files & Folders List */}
              {driveLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 44 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ fontSize: 12, color: rMuted, marginTop: 8 }}>Loading Google Drive files...</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: (insets.bottom || 0) + 28 }}>
                  {(() => {
                    const isSubfolder = driveFolderStack.length > 1;
                    const parentCrumb = isSubfolder ? driveFolderStack[driveFolderStack.length - 2] : null;

                    const filtered = driveItems
                      .filter(item => {
                        if (driveSearch && !item.name.toLowerCase().includes(driveSearch.toLowerCase())) {
                          return false;
                        }
                        if (driveFilter === 'folders') {
                          return item.mimeType === 'application/vnd.google-apps.folder';
                        }
                        if (driveFilter === 'pdf') {
                          return item.mimeType === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf') || /\.(docx?|txt|html)$/i.test(item.name) || item.mimeType?.includes('document') || item.mimeType?.includes('word');
                        }
                        return true;
                      });

                    return (
                      <View>
                        {/* Back to parent folder item if inside a subfolder */}
                        {isSubfolder && !driveSearch && driveFilter !== 'pdf' && (
                          <TouchableOpacity
                            style={[
                              s.recentItemCard,
                              {
                                backgroundColor: colors.bg,
                                borderColor: colors.border,
                                borderStyle: 'dashed',
                                marginBottom: 6,
                                paddingVertical: 8,
                              }
                            ]}
                            onPress={handleNavigateBackInDrive}
                            activeOpacity={0.7}
                          >
                            <View
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                backgroundColor: colors.primary + '18',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <ArrowLeft size={16} color={colors.primary} />
                            </View>
                            <View style={{ flex: 1, marginLeft: 10 }}>
                              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                                .. Back to {parentCrumb?.name || 'Parent Folder'}
                              </Text>
                              <Text style={{ fontSize: 10.5, color: rMuted, marginTop: 1 }}>
                                Tap to go up one folder
                              </Text>
                            </View>
                            <ChevronLeft size={16} color={colors.primary} />
                          </TouchableOpacity>
                        )}

                        {filtered.length === 0 ? (
                          <View style={{ paddingVertical: 44, alignItems: 'center', justifyContent: 'center' }}>
                            <Folder size={32} color={rMuted} style={{ marginBottom: 8, opacity: 0.6 }} />
                            <Text style={{ color: rMuted, fontSize: 13, fontWeight: '600' }}>
                              {driveSearch ? 'No matching files or folders found' : 'This folder is empty'}
                            </Text>
                          </View>
                        ) : (
                          filtered.map((item) => {
                            const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                            const isPdf = item.mimeType === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');
                            const isDoc = isPdf || /\.(docx?|txt|html)$/i.test(item.name) || item.mimeType?.includes('document') || item.mimeType?.includes('word');

                            return (
                              <TouchableOpacity
                                key={item.id}
                                style={[
                                  s.recentItemCard,
                                  {
                                    backgroundColor: colors.bg,
                                    borderColor: isFolder ? '#f59e0b30' : (isPdf ? colors.border : (isDoc ? '#2563eb30' : colors.border)),
                                    marginBottom: 6,
                                    opacity: (!isFolder && !isDoc) ? 0.6 : 1,
                                  }
                                ]}
                                onPress={async () => {
                                  const activeDrive = connectedDrives.find(d => d.id === activeDriveId);
                                  if (!activeDrive) return;

                                  if (isFolder) {
                                    setDriveFolderStack(prev => [...prev, { id: item.id, name: item.name }]);
                                    fetchDriveFolderContents(activeDrive, item.id);
                                  } else if (isDoc) {
                                    await openDriveFile(activeDrive, item);
                                  } else {
                                    Alert.alert(
                                      'Unsupported File',
                                      `"${item.name}" is not supported. Please select a PDF or Word document (.doc, .docx).`,
                                      [{ text: 'OK' }]
                                    );
                                  }
                                }}
                              >
                                <View
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    backgroundColor: isFolder ? '#fef3c7' : (isPdf ? '#fee2e2' : (isDoc ? '#dbeafe' : colors.card)),
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  {isFolder ? (
                                    <Folder size={18} color="#d97706" />
                                  ) : isPdf ? (
                                    <FileText size={18} color="#dc2626" />
                                  ) : isDoc ? (
                                    <FileText size={18} color="#2563eb" />
                                  ) : (
                                    <FileText size={18} color={rMuted} />
                                  )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                  <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: isFolder ? '700' : '600', color: colors.text }}>
                                    {item.name}
                                  </Text>
                                  <Text style={{ fontSize: 10.5, color: rMuted, marginTop: 2 }}>
                                    {isFolder
                                      ? 'Folder • Tap to open'
                                      : isPdf
                                        ? `${item.size ? (item.size / (1024 * 1024)).toFixed(1) + ' MB • ' : ''}PDF • Tap to read`
                                        : `File • Non-PDF`}
                                  </Text>
                                </View>
                                {isFolder ? (
                                  <ChevronRight size={16} color={rMuted} />
                                ) : isPdf ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    {offlineDriveFiles[item.id] ? (
                                      <View style={{ backgroundColor: '#10b98120', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                        <CheckCircle2 size={11} color="#10b981" />
                                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#10b981' }}>Offline</Text>
                                      </View>
                                    ) : null}
                                    <TouchableOpacity
                                      onPress={() => setFileOptionsTarget(item)}
                                      style={{ padding: 6 }}
                                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                      <MoreVertical size={16} color={rMuted} />
                                    </TouchableOpacity>
                                  </View>
                                ) : null}
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </View>
                    );
                  })()}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    );
  };

  const renderTopBar = () => {
    // When no PDF is loaded (Home, Files, Scan, Tools) - show on all pages
    if (!hasPdf) {
      return (
        <View style={[s.header, {
          backgroundColor: rBg,
          borderBottomColor: rMuted + '25',
          paddingTop: hasAppHeader ? 0 : (topPadding + 6),
          paddingBottom: 8,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }]}>
          {/* Logo + Brand: Helper PDF / reader & scanner */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <CachedAppLogo isDark={isDark} size={33} />
            <View style={{ justifyContent: 'center' }}>
              <Text style={{ fontSize: 15.5, fontWeight: '900', color: rText, letterSpacing: -0.3, lineHeight: 18 }} numberOfLines={1}>
                Helper PDF
              </Text>
              <Text style={{ fontSize: 8.8, color: colors.primary, fontWeight: '700', letterSpacing: 0.35, lineHeight: 11, marginTop: 0.5 }} numberOfLines={1}>
                reader & scanner
              </Text>
            </View>
          </View>

          {/* Right Action Icons: On Files tab show rich reader toolbar with Google Drive logo; on Scan keep minimal */}
          {navTab === 'files' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity style={s.hBtn} onPress={handlePickDocument}>
                <FolderOpen size={19} color={rText} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.hBtn, showDriveModal && { backgroundColor: colors.primary + '25', borderRadius: 8 }]}
                onPress={() => setShowDriveModal(!showDriveModal)}
              >
                <GoogleDriveIcon size={20} />
              </TouchableOpacity>
              <TouchableOpacity style={s.hBtn} onPress={() => setShowRecent(true)}>
                <Clock size={19} color={rText} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleAppTheme}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: colors.primary + '16',
                  borderColor: colors.primary + '35', borderWidth: 1,
                  paddingHorizontal: 9, paddingVertical: 6,
                  borderRadius: 16, marginLeft: 2,
                }}
                activeOpacity={0.7}
              >
                {appTheme === 'light' && <Moon size={14} color={colors.primary} />}
                {appTheme === 'dark' && <Sun size={14} color={colors.primary} />}
                {appTheme === 'midnight' && <Star size={14} color={colors.primary} />}
                {appTheme === 'forest' && <Leaf size={14} color={colors.primary} />}
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: colors.primary, textTransform: 'capitalize' }}>
                  {appTheme}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setShowDriveModal(true)}
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: colors.primary + '14',
                  borderColor: colors.primary + '30', borderWidth: 1,
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <GoogleDriveIcon size={19} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleAppTheme}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: colors.primary + '16',
                  borderColor: colors.primary + '35', borderWidth: 1,
                  paddingHorizontal: 11, paddingVertical: 7,
                  borderRadius: 18,
                }}
                activeOpacity={0.7}
              >
                {appTheme === 'light' && <Moon size={14} color={colors.primary} />}
                {appTheme === 'dark' && <Sun size={14} color={colors.primary} />}
                {appTheme === 'midnight' && <Star size={14} color={colors.primary} />}
                {appTheme === 'forest' && <Leaf size={14} color={colors.primary} />}
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'capitalize' }}>
                  {appTheme}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    const barContent = (
      <>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={[s.header, { backgroundColor: rBg, borderBottomColor: rMuted + '30', paddingTop: hasAppHeader ? 0 : (topPadding + 6), paddingBottom: hasAppHeader ? 4 : 8 }]}>
          {/* Left Navigation & Collapse/Expand Toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {showDriveModal ? (
              <TouchableOpacity
                onPress={() => {
                  if (driveFolderStack.length > 1) {
                    handleNavigateBackInDrive();
                  } else {
                    setShowDriveModal(false);
                  }
                }}
                style={s.hBtn}
              >
                <ArrowLeft size={20} color={rText} />
              </TouchableOpacity>
            ) : hasPdf ? (
              <TouchableOpacity onPress={handleBackNavigation} style={s.hBtn}>
                <ArrowLeft size={20} color={rText} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 14 }} />
            )}

            <View style={{ marginLeft: 2, marginRight: 4 }}>
              <CachedAppLogo isDark={isDark} size={27} />
            </View>

            {hasPdf && !showDriveModal && (
              <TouchableOpacity
                onPress={() => setShowTools(!showTools)}
                style={[s.hBtn, { marginLeft: 4 }]}
              >
                {showTools ? (
                  <ChevronLeft size={20} color={colors.primary} />
                ) : (
                  <ChevronRight size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Center Title - only visible when tools are collapsed or when there is no PDF or Drive is open */}
          {(!hasPdf || !showTools || showDriveModal) ? (
            <Text style={[s.hTitle, { color: rText, flex: 1, marginLeft: 8 }]} numberOfLines={1}>
              {showDriveModal ? 'Google Drive' : (pdfName || 'PDF Reader')}
            </Text>
          ) : null}

          {/* Right side - displays tools when expanded, and EXIT */}
          <View style={[s.hRight, (showTools || showDriveModal) && { flex: 1, justifyContent: 'flex-end' }]}>
            {hasPdf && (showTools || showDriveModal) && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }} style={{ flexShrink: 1, marginRight: 4 }}>
                <TouchableOpacity style={s.hBtn} onPress={() => { setShowSearch(true); sendCmd({ action: 'SEARCH_OPEN' }); }}>
                  <Search size={18} color={rText} />
                </TouchableOpacity>
                <TouchableOpacity style={s.hBtn} onPress={() => setShowIndexModal(true)}>
                  <BookOpen size={18} color={rText} />
                </TouchableOpacity>
                <TouchableOpacity style={s.hBtn} onPress={toggleBookmark}>
                  {isBookmarked
                    ? <BookmarkCheck size={18} color={colors.primary} />
                    : <Bookmark size={18} color={rText} />}
                </TouchableOpacity>
                <TouchableOpacity style={s.hBtn} onPress={() => setShowBookmarks(true)}>
                  <List size={18} color={rText} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.hBtn, showReaderConvertModal && { backgroundColor: colors.primary + '25', borderRadius: 8 }]}
                  onPress={() => setShowReaderConvertModal(true)}
                >
                  <Wrench size={18} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.hBtn} onPress={() => setShowTheme(true)}>
                  <Coffee size={18} color={rText} />
                </TouchableOpacity>
                <TouchableOpacity style={s.hBtn} onPress={handlePickDocument}>
                  <FolderOpen size={18} color={rText} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.hBtn, showDriveModal && { backgroundColor: colors.primary + '25', borderRadius: 8 }]}
                  onPress={() => setShowDriveModal(!showDriveModal)}
                >
                  <GoogleDriveIcon size={18} />
                </TouchableOpacity>
                <TouchableOpacity style={s.hBtn} onPress={() => setShowRecent(true)}>
                  <Clock size={18} color={rText} />
                </TouchableOpacity>
              </ScrollView>
            )}

            {!hasPdf && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                {/* App theme toggle chip */}
                <TouchableOpacity
                  onPress={toggleAppTheme}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: colors.primary + '18',
                    borderColor: colors.primary + '40',
                    borderWidth: 1,
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
                    marginRight: 4,
                  }}
                  activeOpacity={0.75}
                >
                  {appTheme === 'light' && <Moon size={14} color={colors.primary} />}
                  {appTheme === 'dark' && <Sun size={14} color={colors.primary} />}
                  {appTheme === 'midnight' && <Star size={14} color={colors.primary} />}
                  {appTheme === 'forest' && <Leaf size={14} color={colors.primary} />}
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.primary, textTransform: 'capitalize' }}>
                    {appTheme}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.hBtn} onPress={handlePickDocument}>
                  <FolderOpen size={18} color={rText} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.hBtn, showDriveModal && { backgroundColor: colors.primary + '25', borderRadius: 8 }]}
                  onPress={() => setShowDriveModal(!showDriveModal)}
                >
                  <GoogleDriveIcon size={18} />
                </TouchableOpacity>
                <TouchableOpacity style={s.hBtn} onPress={() => setShowRecent(true)}>
                  <Clock size={18} color={rText} />
                </TouchableOpacity>
              </View>
            )}

            {/* Dedicated Red Exit/Close button */}
            <TouchableOpacity
              onPress={() => {
                if (showDriveModal && hasPdf) {
                  setShowDriveModal(false);
                } else {
                  closeCurrentPdf();
                }
              }}
              style={[s.exitBtn, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              <Text style={{ color: '#ef4444', fontSize: 10.5, fontWeight: '900' }}>
                {showDriveModal && hasPdf ? 'CLOSE' : 'EXIT'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Reading Progress Bar ───────────────────────────────────── */}
        {hasPdf && totalPages > 0 && (
          <View style={[s.progressTrack, { backgroundColor: rMuted + '25' }]}>
            <Animated.View style={[s.progressFill, { width: progressWidth, backgroundColor: colors.primary }]} />
          </View>
        )}

        {/* ── Tab Bar ───────────────────────────────────────────────── */}
        {hasPdf && (
          <View style={[s.tabBar, { backgroundColor: rBg, borderBottomColor: rMuted + '30' }]}>
            {(['read', 'listen'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[s.tab, activeTab === tab && { borderBottomColor: colors.primary }]}
                onPress={() => setActiveTab(tab)}
              >
                {tab === 'read'
                  ? <Eye size={15} color={activeTab === tab ? colors.primary : rMuted} />
                  : <Volume2 size={15} color={activeTab === tab ? colors.primary : rMuted} />}
                <Text style={[s.tabLabel, { color: activeTab === tab ? colors.primary : rMuted }]}>
                  {tab === 'read' ? 'Read' : 'Listen'}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Page indicator */}
            {totalPages > 0 && (
              <TouchableOpacity style={s.pageIndicator} onPress={() => setShowJump(true)}>
                <Hash size={11} color={rMuted} />
                <Text style={[s.pageIndicatorText, { color: rMuted }]}>
                  {currentPage}/{totalPages}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </>
    );

    if (hasPdf) {
      return (
        <Animated.View style={{
          transform: [{ translateY: showDriveModal ? 0 : headerY }],
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: rBg,
        }}>
          {barContent}
        </Animated.View>
      );
    }

    return barContent;
  };

  return (
    <View style={[s.root, { backgroundColor: rBg, overflow: 'hidden' }]}>
      <StatusBar style={themeKey === 'white' || themeKey === 'sepia' ? 'dark' : 'light'} />

      {renderTopBar()}

      {/* Sync Audio Banner */}
      {scrollPendingPage !== null && (
        <Animated.View style={[s.syncBanner, {
          top: headerTotalHeight + 4,
          backgroundColor: colors.primary,
          transform: [{ translateY: syncBannerTranslateY }]
        }]}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={s.syncText}>You scrolled to Page {scrollPendingPage}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={s.syncBtnCancel}
              onPress={() => setScrollPendingPage(null)}
              activeOpacity={0.7}
            >
              <Text style={s.syncBtnTextCancel}>Dismiss</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.syncBtnOk}
              onPress={() => {
                const target = scrollPendingPage;
                setScrollPendingPage(null);
                setTtsPage(target);
                if (isPlaying) {
                  stopSpeaking();
                  setTimeout(() => startSpeaking(target), 200);
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={s.syncBtnTextOk}>Listen Page {scrollPendingPage}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── Content ───────────────────────────────────────────────── */}
      {!hasPdf ? (
        showDriveModal ? (
          <View style={{ flex: 1, backgroundColor: colors.card }}>
            {renderDriveContent()}
          </View>
        ) : (
          <EmptyState
            navTab={navTab}
            setNavTab={setNavTab}
            rBg={rBg} rText={rText} rMuted={rMuted} primary={colors.primary}
            recentFiles={recentFiles}
            onPick={handlePickDocument}
            onOpenDrive={() => setShowDriveModal(true)}
            onOpenRecent={async (file) => {
              try {
                await openPdf(file.uri, file.name);
              } catch {
                Alert.alert('Error', 'Could not open recent file. It may have been moved or deleted.');
                setLoading(false);
              }
            }}
            onRemoveRecent={(file) => {
              Alert.alert(
                'Remove PDF?',
                `Remove "${file.name}" from recent files?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => removeRecentFile(file),
                  },
                ]
              );
            }}
            onClearRecent={() => {
              Alert.alert(
                'Clear Recent Files?',
                'Are you sure you want to clear your recently opened PDF history? This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear All',
                    style: 'destructive',
                    onPress: async () => {
                      setRecentFiles([]);
                      await AsyncStorage.removeItem(STORAGE_RECENT);
                    },
                  },
                ]
              );
            }}
            themeKey={appTheme}
            toggleTheme={toggleAppTheme}
            onTheme={() => setShowTheme(true)}
            onOpenScannedPdf={async (uri: string, name: string) => {
              try {
                await openPdf(uri, name);
              } catch (err: any) {
                Alert.alert('Error', err?.message || 'Could not open generated PDF.');
              }
            }}
          />
        )
      ) : (
        /* ── Content Container (Both Read & Listen mounted persistently) ── */
        <View style={{ flex: 1 }}>
          {/* ── Visual PDF View ──
               IMPORTANT: Do NOT use display:'none' here! On Android, hiding a WebView
               with display:none causes it to lose its scroll position completely.
               Instead we use position:absolute + opacity:0 + pointerEvents:none so the
               WebView stays fully mounted and keeps its scroll state while invisible. ──*/}
          <Animated.View style={[
            { flex: 1, width: '100%' },
            activeTab === 'read'
              ? { flex: 1, height: '100%', zIndex: 5 }
              : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, pointerEvents: 'none' as any, zIndex: -1 }
          ]}>
            {Platform.OS === 'web' ? (
              <iframe
                srcDoc={viewerHtml}
                style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
                title="PDF Reader"
              />
            ) : (
              <WebViewAny
                ref={webViewRef}
                style={{ flex: 1, backgroundColor: rBg }}
                source={{ html: viewerHtml }}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                allowFileAccess
                allowUniversalAccessFromFileURLs
                scalesPageToFit={false}
                setBuiltInZoomControls={false}
                setDisplayZoomControls={false}
                scrollEnabled={true}
                showsVerticalScrollIndicator={true}
                showsHorizontalScrollIndicator={false}
                overScrollMode="always"
                nestedScrollEnabled={true}
                androidLayerType="software"
                onMessage={handleWebViewMessage}
                onLoadEnd={injectPdf}
              />
            )}
            {/* Floating zoom bar */}
            <Animated.View style={[s.zoomBar, { backgroundColor: rBg + 'ee', bottom: Math.max(insets.bottom || 0, Platform.OS === 'android' ? 24 : 0) + 12, opacity: zoomBarOpacity, transform: [{ translateY: zoomBarY }] }]}>
              <TouchableOpacity style={s.zoomBtn} onPress={() => sendCmd({ action: 'ZOOM_OUT' })}>
                <ZoomOut size={16} color={rText} />
              </TouchableOpacity>
              <TouchableOpacity style={s.zoomBtn} onPress={() => sendCmd({ action: 'ZOOM_RESET' })}>
                <RefreshCw size={13} color={rMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={s.zoomBtn} onPress={() => sendCmd({ action: 'ZOOM_IN' })}>
                <ZoomIn size={16} color={rText} />
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          {/* ── Listen / Text Mode ── */}
          {activeTab === 'listen' && (
            <View style={{ flex: 1 }}>
              <ScrollView
                contentContainerStyle={[
                  s.textArea,
                  { backgroundColor: rBg, paddingTop: headerTotalHeight + 10 }
                ]}
                showsVerticalScrollIndicator
              >
                {extractedPages[ttsPage] ? (
                  isEditingText ? (
                    <>
                      <View style={[s.pageBadge, { backgroundColor: colors.primary + '18' }]}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>
                          EDITING PAGE {ttsPage} · {totalPages} TOTAL
                        </Text>
                      </View>
                      <TextInput
                        multiline
                        style={[s.editInput, { color: rText, borderColor: rMuted + '50', backgroundColor: rMuted + '08' }]}
                        value={editText}
                        onChangeText={setEditText}
                        placeholder="Enter corrected text here..."
                        placeholderTextColor={rMuted}
                      />
                      <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
                        <TouchableOpacity
                          style={[s.copyBtn, { borderColor: rMuted + '40', marginTop: 0 }]}
                          onPress={() => setIsEditingText(false)}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, color: rMuted, fontWeight: '600' }}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[s.copyBtn, { borderColor: colors.success + '80', backgroundColor: colors.success + '15', marginTop: 0 }]}
                          onPress={handleSaveCorrection}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, color: colors.success, fontWeight: '800' }}>Save Changes</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={[s.pageBadge, { backgroundColor: colors.primary + '18' }]}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>
                          PAGE {ttsPage} · {totalPages} TOTAL (Extracted: {Object.keys(extractedPages).length}/{totalPages})
                        </Text>
                      </View>
                      <Text selectable style={[s.bodyText, { color: rText, fontSize, lineHeight: fontSize * lineSpacing }]}>
                        {extractedPages[ttsPage]}
                      </Text>
                      {/* Action buttons row */}
                      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 24 }}>
                        <TouchableOpacity
                          style={[s.copyBtn, { borderColor: rMuted + '40', marginTop: 0 }]}
                          onPress={() => { Clipboard.setStringAsync(extractedPages[ttsPage]); Alert.alert('Copied', 'Page text copied to clipboard.'); }}
                          activeOpacity={0.7}
                        >
                          <Copy size={13} color={rMuted} />
                          <Text style={{ fontSize: 12, color: rMuted, fontWeight: '600' }}>Copy</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[s.copyBtn, { borderColor: colors.primary + '80', backgroundColor: colors.primary + '10', marginTop: 0 }]}
                          onPress={() => handleAiOcr(ttsPage)}
                          disabled={aiLoading}
                          activeOpacity={0.7}
                        >
                          <Sparkles size={13} color={colors.primary} />
                          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>AI OCR</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[s.copyBtn, { borderColor: '#d97706' + '80', backgroundColor: '#fef3c7', marginTop: 0 }]}
                          onPress={() => {
                            setEditText(extractedPages[ttsPage] || '');
                            setIsEditingText(true);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, color: '#d97706', fontWeight: '700' }}>Edit Text</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )
                ) : (
                  <View style={s.extractingBox}>
                    <ActivityIndicator color={colors.primary} size="large" />
                    <Text style={[s.extractingMsg, { color: rMuted, marginBottom: 16 }]}>
                      {Object.keys(extractedPages).length === 0
                        ? 'Extracting text from PDF…\nPlease wait.'
                        : `Extracting page ${ttsPage}…`}
                    </Text>

                    {/* Fallback AI OCR button if standard extraction is stuck */}
                    <TouchableOpacity
                      style={[s.copyBtn, { borderColor: colors.primary + '80', backgroundColor: colors.primary + '15' }]}
                      onPress={() => handleAiOcr(ttsPage)}
                      disabled={aiLoading}
                    >
                      <Sparkles size={13} color={colors.primary} />
                      <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>Extract with AI OCR instead</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>

              {/* ── Player Panel ─────────────────────────────────────────── */}
              <View style={[s.playerPanel, { backgroundColor: rBg, borderTopColor: rMuted + '25' }]}>
                {/* Typography controls */}
                <View style={[s.typoRow, { borderBottomColor: rMuted + '20' }]}>
                  <View style={s.typoGroup}>
                    <Text style={[s.controlLabel, { color: rMuted }]}>Font</Text>
                    <TouchableOpacity style={[s.smallBtn, { borderColor: rMuted + '40' }]} onPress={() => setFontSize(s => Math.max(12, s - 1))}>
                      <Text style={{ color: rText, fontSize: 14, fontWeight: '700' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={[s.controlVal, { color: rText }]}>{fontSize}</Text>
                    <TouchableOpacity style={[s.smallBtn, { borderColor: rMuted + '40' }]} onPress={() => setFontSize(s => Math.min(26, s + 1))}>
                      <Text style={{ color: rText, fontSize: 14, fontWeight: '700' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.typoGroup}>
                    <Text style={[s.controlLabel, { color: rMuted }]}>Spacing</Text>
                    {[1.4, 1.7, 2.1].map(v => (
                      <TouchableOpacity
                        key={v}
                        style={[s.smallBtn, { borderColor: lineSpacing === v ? colors.primary : rMuted + '40', backgroundColor: lineSpacing === v ? colors.primary + '20' : 'transparent' }]}
                        onPress={() => setLineSpacing(v)}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '800', color: lineSpacing === v ? colors.primary : rMuted }}>
                          {v === 1.4 ? 'S' : v === 1.7 ? 'M' : 'L'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity style={[s.smallBtn, { borderColor: rMuted + '40' }]} onPress={() => setShowTheme(true)}>
                    <Coffee size={14} color={rText} />
                  </TouchableOpacity>
                </View>

                {/* Speed */}
                <View style={s.speedRow}>
                  <Text style={[s.controlLabel, { color: rMuted, marginRight: 8 }]}>Speed</Text>
                  {[0.75, 1.0, 1.25, 1.5, 2.0].map(rate => (
                    <TouchableOpacity
                      key={rate}
                      style={[s.rateChip, { borderColor: speechRate === rate ? colors.primary : rMuted + '40', backgroundColor: speechRate === rate ? colors.primary : 'transparent' }]}
                      onPress={() => { setSpeechRate(rate); if (isPlaying) { stopSpeaking(); setTimeout(() => startSpeaking(ttsPage), 200); } }}
                    >
                      <Text style={[s.rateLabel, { color: speechRate === rate ? '#fff' : rMuted }]}>{rate}×</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Voice Selection Button */}
                <View style={[s.speedRow, { marginTop: 2, marginBottom: 8 }]}>
                  <Text style={[s.controlLabel, { color: rMuted, marginRight: 8 }]}>Voice</Text>
                  <TouchableOpacity
                    style={[
                      s.rateChip,
                      {
                        flex: 1,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderColor: colors.primary,
                        backgroundColor: colors.primary + '12',
                        paddingHorizontal: 12,
                        height: 34,
                        borderRadius: 8,
                      }
                    ]}
                    activeOpacity={0.7}
                    onPress={() => setShowVoicesModal(true)}
                  >
                    <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '700', color: colors.primary, flex: 1, marginRight: 6 }}>
                      {selectedVoice ? selectedVoice.name : 'System Default'}
                    </Text>
                    <ChevronDown size={13} color={colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* Controls row */}
                <View style={s.controlsRow}>
                  <TouchableOpacity
                    onPress={() => { stopSpeaking(); setTtsPage(p => Math.max(1, p - 1)); }}
                    disabled={ttsPage <= 1}
                    style={[s.navBtn, { borderColor: rMuted + '40', opacity: ttsPage <= 1 ? 0.3 : 1 }]}
                  >
                    <SkipBack size={16} color={rText} />
                  </TouchableOpacity>

                  {/* Main play/pause */}
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    {isPlaying ? (
                      <TouchableOpacity style={[s.bigPlayBtn, { backgroundColor: colors.primary }]} onPress={pauseSpeaking}>
                        <Pause size={24} color="#fff" />
                      </TouchableOpacity>
                    ) : isPaused ? (
                      <TouchableOpacity style={[s.bigPlayBtn, { backgroundColor: colors.primary }]} onPress={resumeSpeaking}>
                        <Play size={24} color="#fff" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[s.bigPlayBtn, { backgroundColor: extractedPages[ttsPage] ? '#10b981' : rMuted }]}
                        onPress={() => startSpeaking(ttsPage)}
                        disabled={!extractedPages[ttsPage]}
                      >
                        <Volume1 size={24} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </Animated.View>

                  {(isPlaying || isPaused) && (
                    <TouchableOpacity style={[s.stopBtn, { borderColor: '#ef4444' }]} onPress={stopSpeaking}>
                      <Square size={15} color="#ef4444" />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => { stopSpeaking(); setTtsPage(p => Math.min(totalPages, p + 1)); }}
                    disabled={ttsPage >= totalPages}
                    style={[s.navBtn, { borderColor: rMuted + '40', opacity: ttsPage >= totalPages ? 0.3 : 1 }]}
                  >
                    <SkipForward size={16} color={rText} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* ── Google Drive Full Screen (when reading PDF) ── */}
          {showDriveModal && (
            <View
              style={{
                position: 'absolute',
                top: headerTotalHeight,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 40,
                backgroundColor: colors.card,
              }}
            >
              {renderDriveContent()}
            </View>
          )}
        </View>
      )}



      {/* ── Loading Overlay ───────────────────────────────────────── */}
      {loading && (
        <View style={s.loadingOverlay}>
          <View style={[s.loadingBox, { backgroundColor: rBg }]}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 14 }} />
            <Text style={[s.loadingTitle, { color: rText }]}>Opening PDF</Text>
            <Text style={[s.loadingMsg, { color: rMuted }]}>{loadProgress}</Text>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
              <TouchableOpacity
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  backgroundColor: colors.border,
                  borderRadius: 10,
                }}
                onPress={() => setLoading(false)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  backgroundColor: '#fee2e2',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#ef4444',
                }}
                onPress={() => {
                  setLoading(false);
                  closeCurrentPdf();
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#ef4444' }}>Exit Reader</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* AI OCR Background Progress Indicator (Non-blocking) */}
      {aiLoading && (
        <View style={[s.aiFloatingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.primary }}>AI Page OCR Running</Text>
            <Text numberOfLines={1} style={{ fontSize: 9.5, color: rMuted }}>{loadProgress}</Text>
          </View>
          <TouchableOpacity
            style={[s.aiCancelBtn, { backgroundColor: '#fee2e2' }]}
            onPress={cancelAiOcr}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#ef4444' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Voices Selector Modal ─────────────────────────────────────── */}
      <Modal visible={showVoicesModal} transparent animationType="slide" onRequestClose={() => setShowVoicesModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: colors.card }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[s.sheetTitle, { color: colors.text, marginBottom: 0, textAlign: 'left' }]}>Select Reader Voice</Text>
              <TouchableOpacity onPress={() => setShowVoicesModal(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 280, marginBottom: 16 }}>
              {voices.length === 0 ? (
                <Text style={{ textAlign: 'center', color: rMuted, paddingVertical: 30 }}>
                  No reader voices found. Using system default speaker.
                </Text>
              ) : (
                voices.map((voice) => {
                  const isSelected = selectedVoice?.identifier === voice.identifier;
                  return (
                    <View
                      key={voice.identifier}
                      style={[
                        s.voiceItemRow,
                        {
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? colors.primary + '10' : 'transparent',
                        }
                      ]}
                    >
                      <TouchableOpacity
                        style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 12 }}
                        onPress={async () => {
                          setSelectedVoice(voice);
                          setShowVoicesModal(false);
                          try {
                            await AsyncStorage.setItem('@pdfReader_selectedVoice', voice.identifier);
                          } catch { }
                          // Restart speaking if active
                          if (isPlaying) {
                            stopSpeaking();
                            setTimeout(() => startSpeaking(ttsPage), 200);
                          }
                        }}
                      >
                        <Text style={{ fontWeight: '700', fontSize: 13, color: isSelected ? colors.primary : colors.text }}>
                          {voice.name}
                        </Text>
                        <Text style={{ fontSize: 10.5, color: rMuted, marginTop: 2 }}>
                          {voice.language} {(voice.quality as string) === 'enhanced' ? '· Enhanced Quality' : ''}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[s.voiceDemoBtn, { backgroundColor: colors.primary }]}
                        activeOpacity={0.8}
                        onPress={() => playDemo(voice)}
                      >
                        <Volume2 size={12} color="#fff" />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', marginLeft: 4 }}>Demo</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity style={[s.sheetClose, { backgroundColor: colors.primary }]} onPress={() => setShowVoicesModal(false)}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Recent Files Overlay ─────────────────────────────────────── */}
      {showRecent && (
        <View style={s.inlineModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowRecent(false)}
          />
          <View style={[s.sheet, { backgroundColor: colors.card, maxHeight: '80%', width: '100%', zIndex: 10000 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Clock size={18} color={colors.primary} />
                <Text style={[s.sheetTitle, { color: colors.text, marginBottom: 0, textAlign: 'left' }]}>Recent PDFs</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRecent(false)}>
                <X size={20} color={rText} />
              </TouchableOpacity>
            </View>

            {recentFiles.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Text style={{ color: rMuted, fontSize: 14 }}>No recently opened files found.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                {recentFiles.map((file, idx) => (
                  <View
                    key={idx}
                    style={[s.recentItemCard, { backgroundColor: colors.bg, borderColor: colors.border }]}
                  >
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                      onPress={async () => {
                        setShowRecent(false);
                        await openPdf(file.uri, file.name);
                      }}
                    >
                      <FileText size={18} color={colors.primary} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                          {file.name}
                        </Text>
                        <Text style={{ fontSize: 10, color: rMuted, marginTop: 2 }}>
                          {file.size ? `${formatRecentFileSize(file.size)} • ` : ''}Opened {new Date(file.openedAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ padding: 8, marginLeft: 4 }}
                      onPress={() => {
                        Alert.alert(
                          'Remove PDF?',
                          `Remove "${file.name}" from recent files?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: () => removeRecentFile(file),
                            },
                          ]
                        );
                      }}
                    >
                      <Trash2 size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {recentFiles.length > 0 && (
              <TouchableOpacity
                style={s.clearBtn}
                onPress={() => {
                  Alert.alert(
                    'Clear Recent Files?',
                    'Are you sure you want to clear your recently opened PDF history?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear All',
                        style: 'destructive',
                        onPress: async () => {
                          setRecentFiles([]);
                          await AsyncStorage.removeItem(STORAGE_RECENT);
                          setShowRecent(false);
                        }
                      }
                    ]
                  );
                }}
              >
                <Trash2 size={14} color="#ef4444" />
                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700', marginLeft: 6 }}>Clear Recent Files</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── File Options Modal (3-Dots Menu) ─────────────────────── */}
      <Modal visible={!!fileOptionsTarget} transparent animationType="fade" onRequestClose={() => setFileOptionsTarget(null)}>
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setFileOptionsTarget(null)}
        >
          <View style={[s.sheet, { backgroundColor: colors.card, maxWidth: 420, width: '92%', alignSelf: 'center', paddingBottom: 22 }]}>
            {fileOptionsTarget && (
              <>
                {/* File Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={20} color="#dc2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ fontSize: 13.5, fontWeight: '700', color: colors.text }}>
                      {fileOptionsTarget.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: rMuted, marginTop: 2 }}>
                      {offlineDriveFiles[fileOptionsTarget.id] ? '⚡ Available Offline • ' : ''}
                      {fileOptionsTarget.size ? (fileOptionsTarget.size / (1024 * 1024)).toFixed(1) + ' MB • ' : ''}Google Drive PDF
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setFileOptionsTarget(null)} style={{ padding: 4 }}>
                    <X size={18} color={rMuted} />
                  </TouchableOpacity>
                </View>

                {/* Actions */}
                <View style={{ gap: 6 }}>
                  {/* Action 1: Open & Read */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.bg }}
                    onPress={() => {
                      const target = fileOptionsTarget;
                      setFileOptionsTarget(null);
                      const activeDrive = connectedDrives.find(d => d.id === activeDriveId);
                      if (activeDrive && target) {
                        openDriveFile(activeDrive, target);
                      }
                    }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <BookOpen size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Open & Read</Text>
                      <Text style={{ fontSize: 10.5, color: rMuted }}>Open document directly in PDF reader</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Action 2: Make Available Offline */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.bg }}
                    onPress={() => handleToggleOffline(fileOptionsTarget)}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: offlineDriveFiles[fileOptionsTarget.id] ? '#10b98120' : colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle2 size={16} color={offlineDriveFiles[fileOptionsTarget.id] ? '#10b981' : colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                        {offlineDriveFiles[fileOptionsTarget.id] ? 'Remove from Offline' : 'Make Available Offline'}
                      </Text>
                      <Text style={{ fontSize: 10.5, color: rMuted }}>
                        {offlineDriveFiles[fileOptionsTarget.id]
                          ? 'Saved on device. Tap to remove offline copy'
                          : 'Download & keep on device for offline reading'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Action 3: Download to HelperPDF_Downloads */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.bg }}
                    onPress={() => handleDownloadToDevice(fileOptionsTarget)}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#3b82f620', alignItems: 'center', justifyContent: 'center' }}>
                      <Download size={16} color="#3b82f6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Download to Device</Text>
                      <Text style={{ fontSize: 10.5, color: rMuted }}>Save to public HelperPDF_Downloads folder</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Action 4: Copy Drive Link */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.bg }}
                    onPress={async () => {
                      const link = `https://drive.google.com/file/d/${fileOptionsTarget.id}/view`;
                      await Clipboard.setStringAsync(link);
                      setFileOptionsTarget(null);
                      Alert.alert('Link Copied', 'Google Drive file link copied to clipboard.');
                    }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                      <Copy size={15} color={rMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Copy Link</Text>
                      <Text style={{ fontSize: 10.5, color: rMuted }}>Copy Google Drive sharing link</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Folder Options Modal (3-Dots Menu) ─────────────────────── */}
      <Modal visible={!!folderOptionsTarget} transparent animationType="fade" onRequestClose={() => setFolderOptionsTarget(null)}>
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setFolderOptionsTarget(null)}
        >
          <View style={[s.sheet, { backgroundColor: colors.card, maxWidth: 420, width: '92%', alignSelf: 'center', paddingBottom: 22 }]}>
            {folderOptionsTarget && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' }}>
                    <Folder size={20} color="#d97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                      {folderOptionsTarget.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: rMuted, marginTop: 2 }}>
                      {folderOptionsTarget.type === 'oauth' ? 'Google Drive Account' : 'Connected Drive Folder'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setFolderOptionsTarget(null)} style={{ padding: 4 }}>
                    <X size={18} color={rMuted} />
                  </TouchableOpacity>
                </View>

                <View style={{ gap: 6 }}>
                  {/* Rename Folder */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.bg }}
                    onPress={() => {
                      const target = folderOptionsTarget;
                      setFolderOptionsTarget(null);
                      setRenameTarget(target);
                      setRenameInput(target.name);
                    }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Edit3 size={15} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Rename Folder in App</Text>
                      <Text style={{ fontSize: 10.5, color: rMuted }}>Customize how this folder is named in reader</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Copy Link */}
                  {folderOptionsTarget.folderId && folderOptionsTarget.folderId !== 'root' && (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.bg }}
                      onPress={async () => {
                        const link = `https://drive.google.com/drive/folders/${folderOptionsTarget.folderId}`;
                        await Clipboard.setStringAsync(link);
                        setFolderOptionsTarget(null);
                        Alert.alert('Link Copied', 'Google Drive folder link copied to clipboard.');
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                        <Copy size={15} color={rMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Copy Folder Link</Text>
                        <Text style={{ fontSize: 10.5, color: rMuted }}>Copy Google Drive folder URL</Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Delete / Remove Folder */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#ef444412' }}
                    onPress={() => {
                      const targetId = folderOptionsTarget.id;
                      setFolderOptionsTarget(null);
                      handleRemoveDrive(targetId);
                    }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#ef444420', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={15} color="#ef4444" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#ef4444' }}>Remove from App</Text>
                      <Text style={{ fontSize: 10.5, color: rMuted }}>Disconnect this folder from the reader</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Rename Folder Dialog ───────────────────────────────────── */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: colors.card, maxWidth: 380, width: '90%', alignSelf: 'center', paddingBottom: 20 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Edit3 size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Rename Folder</Text>
                <Text style={{ fontSize: 11, color: rMuted }}>Enter a custom nickname for this folder</Text>
              </View>
            </View>

            <TextInput
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="Folder nickname"
              placeholderTextColor={rMuted}
              autoFocus
              style={{
                backgroundColor: colors.bg,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14,
                color: colors.text,
                marginBottom: 16,
              }}
            />

            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
              <TouchableOpacity
                onPress={() => { setRenameTarget(null); setRenameInput(''); }}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRenameDrive}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Save Name</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Theme Picker ─────────────────────────────────────────── */}
      <Modal visible={showTheme} transparent animationType="slide" onRequestClose={() => setShowTheme(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: colors.card }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Reader Theme</Text>
            <View style={s.themeGrid}>
              {READER_THEMES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => { setThemeKey(t.key); }}
                  style={[s.themeCard, { backgroundColor: t.bg ?? colors.bg, borderColor: t.key === themeKey ? colors.primary : colors.border }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: t.text ?? colors.text }}>{t.label}</Text>
                  <Text style={{ fontSize: 11, color: t.muted ?? colors.muted, marginTop: 3 }}>Aa Bb 123</Text>
                  {t.key === themeKey && <View style={[s.selectedDot, { backgroundColor: colors.primary }]} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Deep PDF Page Theme Toggle Card */}
            <View style={{ marginTop: 14, marginBottom: 16, width: '100%' }}>
              <TouchableOpacity
                style={[
                  s.recentItemCard,
                  {
                    backgroundColor: deepThemeEnabled ? colors.primary + '18' : colors.bg,
                    borderColor: deepThemeEnabled ? colors.primary : colors.border,
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    marginBottom: 0,
                  }
                ]}
                activeOpacity={0.8}
                onPress={toggleDeepTheme}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Sparkles size={18} color={deepThemeEnabled ? colors.primary : colors.muted} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>
                      Deep PDF Content Theme
                    </Text>
                    <Text style={{ fontSize: 10.5, color: colors.muted, marginTop: 2 }}>
                      {deepThemeEnabled
                        ? 'Color filters applied to PDF pages'
                        : 'PDF pages kept in original white style'}
                    </Text>
                  </View>
                </View>
                <View style={{
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
                  backgroundColor: deepThemeEnabled ? colors.primary : colors.border,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: deepThemeEnabled ? '#fff' : colors.muted }}>
                    {deepThemeEnabled ? 'ON' : 'OFF'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[s.sheetClose, { backgroundColor: colors.primary }]} onPress={() => setShowTheme(false)}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Jump to Page ─────────────────────────────────────────── */}
      <Modal visible={showJump} transparent animationType="fade" onRequestClose={() => setShowJump(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior="padding">
          <View style={[s.jumpBox, { backgroundColor: colors.card }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Jump to Page</Text>
            <TextInput
              style={[s.jumpInput, { borderColor: colors.border, color: colors.text }]}
              placeholder={`1 – ${totalPages}`}
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              value={jumpInput}
              onChangeText={setJumpInput}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[s.jumpBtn, { borderColor: colors.border, flex: 1 }]} onPress={() => setShowJump(false)}>
                <Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.jumpBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => {
                  const n = parseInt(jumpInput, 10);
                  if (n >= 1 && n <= totalPages) {
                    savedPageRef.current = n;
                    setCurrentPage(n);
                    setTtsPage(n);
                    setShowJump(false);
                    setJumpInput('');
                    sendCmd({ action: 'GOTO', page: n });
                    if (activeTab !== 'read') {
                      setActiveTab('read');
                    } else {
                      setTimeout(() => {
                        sendCmd({ action: 'GOTO', page: n });
                      }, 200);
                      setTimeout(() => {
                        sendCmd({ action: 'GOTO', page: n });
                      }, 500);
                    }
                  } else {
                    Alert.alert('Invalid', `Enter a page between 1 and ${totalPages}.`);
                  }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Go</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Bookmarks Sheet ──────────────────────────────────────── */}
      <Modal visible={showBookmarks} transparent animationType="slide" onRequestClose={() => setShowBookmarks(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: colors.card }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[s.sheetTitle, { color: colors.text, marginBottom: 0 }]}>Bookmarks</Text>
              <TouchableOpacity onPress={() => setShowBookmarks(false)}>
                <X size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>
            {bookmarks.length === 0 ? (
              <Text style={{ color: colors.muted, textAlign: 'center', padding: 24, fontSize: 13 }}>
                No bookmarks yet.{'\n'}Tap the bookmark icon in the header to add one.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {bookmarks.map(bm => (
                  <TouchableOpacity
                    key={bm.page}
                    style={[s.bookmarkRow, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      savedPageRef.current = bm.page;
                      setCurrentPage(bm.page);
                      setTtsPage(bm.page);
                      setShowBookmarks(false);
                      if (activeTab !== 'read') {
                        setActiveTab('read');
                      } else {
                        setTimeout(() => {
                          sendCmd({ action: 'GOTO', page: bm.page });
                        }, 200);
                      }
                    }}
                  >
                    <BookmarkCheck size={16} color={colors.primary} />
                    <Text style={[s.bookmarkLabel, { color: colors.text }]}>Page {bm.page}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const updated = bookmarks.filter(b => b.page !== bm.page);
                        setBookmarks(updated);
                        saveBookmarks(updated);
                      }}
                    >
                      <Trash2 size={14} color={colors.muted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Document Index (TOC) Modal ──────────────────────────────── */}
      <Modal visible={showIndexModal} transparent animationType="slide" onRequestClose={() => setShowIndexModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: colors.card, maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <BookOpen size={18} color={colors.primary} />
                <Text style={[s.sheetTitle, { color: colors.text, marginBottom: 0, textAlign: 'left' }]}>Document Index (TOC)</Text>
              </View>
              <TouchableOpacity onPress={() => setShowIndexModal(false)}>
                <X size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>
            {outline.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13, lineHeight: 20 }}>
                  No structured index found in this PDF.{'\n'}Use Jump to Page or Bookmarks to navigate.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator style={{ maxHeight: 420 }}>
                {renderOutlineItems(outline, 0)}
              </ScrollView>
            )}
            <TouchableOpacity style={[s.sheetClose, { backgroundColor: colors.primary, marginTop: 12 }]} onPress={() => setShowIndexModal(false)}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Reader Document Conversion & Export Sheet ───────────── */}
      <Modal visible={showReaderConvertModal} transparent animationType="slide" onRequestClose={() => setShowReaderConvertModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: 24 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View>
                <Text style={[s.sheetTitle, { color: colors.text }]}>Document Tools & Converters</Text>
                <Text style={{ fontSize: 11.5, color: colors.muted, marginTop: 2 }}>{pdfName || 'Active Document'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowReaderConvertModal(false)}>
                <X size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10, width: '100%', marginBottom: 16 }}>
              {/* 1. Export to Word DOCX */}
              <TouchableOpacity
                onPress={() => {
                  setShowReaderConvertModal(false);
                  setReaderDocxModalVisible(true);
                }}
                style={[s.recentItemCard, { backgroundColor: colors.bg, borderColor: colors.border, marginBottom: 0 }]}
                activeOpacity={0.75}
              >
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#2563eb18', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={20} color="#2563eb" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.text }}>Export to Word (.docx)</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>Convert all pages into an editable Word document</Text>
                </View>
                <ChevronRight size={18} color={colors.muted} />
              </TouchableOpacity>

              {/* 2. Export to Plain Text TXT */}
              <TouchableOpacity
                onPress={() => {
                  setShowReaderConvertModal(false);
                  setReaderTextModalVisible(true);
                }}
                style={[s.recentItemCard, { backgroundColor: colors.bg, borderColor: colors.border, marginBottom: 0 }]}
                activeOpacity={0.75}
              >
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#0ea5e918', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={20} color="#0ea5e9" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.text }}>Export to Plain Text (.txt)</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>View full text, copy all, or share .txt file</Text>
                </View>
                <ChevronRight size={18} color={colors.muted} />
              </TouchableOpacity>

              {/* 3. Save Page as PNG */}
              <TouchableOpacity
                onPress={() => {
                  setShowReaderConvertModal(false);
                  sendCmd({ action: 'GET_PAGE_IMAGE', page: currentPage, isExport: true, format: 'png' });
                }}
                style={[s.recentItemCard, { backgroundColor: colors.bg, borderColor: colors.border, marginBottom: 0 }]}
                activeOpacity={0.75}
              >
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#8b5cf618', alignItems: 'center', justifyContent: 'center' }}>
                  <FilePlus size={20} color="#8b5cf6" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.text }}>Save Page {currentPage} as PNG</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>High-resolution lossless image export</Text>
                </View>
                <ChevronRight size={18} color={colors.muted} />
              </TouchableOpacity>

              {/* 4. Save Page as JPG */}
              <TouchableOpacity
                onPress={() => {
                  setShowReaderConvertModal(false);
                  sendCmd({ action: 'GET_PAGE_IMAGE', page: currentPage, isExport: true, format: 'jpg', quality: 0.95 });
                }}
                style={[s.recentItemCard, { backgroundColor: colors.bg, borderColor: colors.border, marginBottom: 0 }]}
                activeOpacity={0.75}
              >
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#f9731618', alignItems: 'center', justifyContent: 'center' }}>
                  <RefreshCw size={20} color="#f97316" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.text }}>Save Page {currentPage} as JPG</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>Universal JPEG format with optimized compression</Text>
                </View>
                <ChevronRight size={18} color={colors.muted} />
              </TouchableOpacity>

              {/* 5. Native Share Sheet */}
              <TouchableOpacity
                onPress={async () => {
                  setShowReaderConvertModal(false);
                  if (pdfUri) {
                    try {
                      if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf', dialogTitle: `Share ${pdfName}` });
                      }
                    } catch (e: any) {
                      Alert.alert('Share Failed', e?.message || 'Could not share file.');
                    }
                  }
                }}
                style={[s.recentItemCard, { backgroundColor: colors.bg, borderColor: colors.border, marginBottom: 0 }]}
                activeOpacity={0.75}
              >
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Share2 size={20} color={colors.primary} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.text }}>Share Document PDF</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>Send to WhatsApp, Email, Drive or Print</Text>
                </View>
                <ChevronRight size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[s.sheetClose, { backgroundColor: colors.primary }]} onPress={() => setShowReaderConvertModal(false)}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DocxConverterModal
        visible={readerDocxModalVisible}
        onClose={() => setReaderDocxModalVisible(false)}
        initialMode="pdf_to_docx"
        currentPdfName={pdfName}
        currentPdfPages={extractedPages}
        onOpenPdf={openPdf}
        primaryColor={colors.primary}
        isDark={isDark}
      />

      <PdfToTextModal
        visible={readerTextModalVisible}
        onClose={() => setReaderTextModalVisible(false)}
        documentTitle={pdfName}
        pagesText={extractedPages}
        primaryColor={colors.primary}
        isDark={isDark}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty State sub-component
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Acrobat-Style Home Screen sub-component
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Acrobat-Style Home Screen, Tools, Scanner & Converters Hub
// ---------------------------------------------------------------------------
function EmptyState({
  rBg,
  rText,
  rMuted,
  primary,
  recentFiles,
  onPick,
  onOpenDrive,
  onOpenRecent,
  onRemoveRecent,
  onClearRecent,
  themeKey,
  toggleTheme,
  onTheme,
  onOpenScannedPdf,
  navTab,
  setNavTab,
}: {
  rBg: string;
  rText: string;
  rMuted: string;
  primary: string;
  recentFiles: RecentFile[];
  onPick: () => void;
  onOpenDrive?: () => void;
  onOpenRecent: (f: RecentFile) => void;
  onRemoveRecent: (f: RecentFile) => void;
  onClearRecent: () => void;
  themeKey: string;
  toggleTheme: () => Promise<void>;
  onTheme: () => void;
  onOpenScannedPdf?: (uri: string, name: string) => Promise<void>;
  navTab: NavTabType;
  setNavTab: (tab: NavTabType) => void;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;
  const isDark = themeKey !== 'light';

  const [searchQuery, setSearchQuery] = useState('');

  // Modals state for all converters
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalMode, setImageModalMode] = useState<ImageConvertMode>('jpg_to_png');
  const [showDocxModal, setShowDocxModal] = useState(false);
  const [docxModalMode, setDocxModalMode] = useState<DocxMode>('pdf_to_docx');
  const [showTextToPdfModal, setShowTextToPdfModal] = useState(false);
  const [showCompressPdfModal, setShowCompressPdfModal] = useState(false);

  // 1-click theme button icons & labels
  const themeNextIcon: Record<string, React.ReactNode> = {
    light: <Moon size={18} color={primary} />,
    dark: <Sun size={18} color={primary} />,
    midnight: <Star size={18} color={primary} />,
    forest: <Leaf size={18} color={primary} />,
  };
  const themeNextLabel: Record<string, string> = {
    light: 'Dark', dark: 'Midnight', midnight: 'Forest', forest: 'Light',
  };

  // Filter recent files in real-time
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return recentFiles;
    const q = searchQuery.toLowerCase();
    return recentFiles.filter(f => f.name.toLowerCase().includes(q));
  }, [recentFiles, searchQuery]);

  // Share file via native OS share sheet (WhatsApp, Drive, Mail, etc.)
  const handleSharePdf = async (file: RecentFile) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share ${file.name}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Sharing Unavailable', 'Native file sharing is not supported on this device.');
      }
    } catch (err: any) {
      Alert.alert('Share Failed', err?.message || 'Could not share file.');
    }
  };

  // Open with other app (Adobe Acrobat, Books, system PDF viewers)
  const handleOpenWithOtherApp = async (file: RecentFile) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Open with other app...',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Open With Unavailable', 'Native app chooser is not available on this device.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not open file in external app.');
    }
  };

  const quickTools = [
    {
      title: 'Scan Document',
      sub: 'Clear Scanner mode',
      icon: <ScanLine size={24} color="#ffffff" />,
      bg: primary,
      textColor: '#ffffff',
      onPress: () => setNavTab('scan'),
    },
    {
      title: 'PDF to Word',
      sub: 'Convert to .docx',
      icon: <FileText size={24} color="#2563eb" />,
      bg: '#2563eb14',
      border: '#2563eb35',
      textColor: rText,
      onPress: () => {
        setDocxModalMode('pdf_to_docx');
        setShowDocxModal(true);
      },
    },
    {
      title: 'Word to PDF',
      sub: 'Render DOCX as PDF',
      icon: <BookOpen size={24} color="#059669" />,
      bg: '#05966914',
      border: '#05966935',
      textColor: rText,
      onPress: () => {
        setDocxModalMode('docx_to_pdf');
        setShowDocxModal(true);
      },
    },
    {
      title: 'JPG to PNG',
      sub: 'Lossless image format',
      icon: <FilePlus size={24} color="#8b5cf6" />,
      bg: '#8b5cf614',
      border: '#8b5cf635',
      textColor: rText,
      onPress: () => {
        setImageModalMode('jpg_to_png');
        setShowImageModal(true);
      },
    },
    {
      title: 'Open PDF',
      sub: 'From device storage',
      icon: <FolderOpen size={24} color={primary} />,
      bg: primary + '14',
      border: primary + '35',
      textColor: rText,
      onPress: onPick,
    },
    {
      title: 'Google Drive',
      sub: 'Cloud storage stream',
      icon: <HardDrive size={24} color="#0ea5e9" />,
      bg: '#0ea5e914',
      border: '#0ea5e935',
      textColor: rText,
      onPress: onOpenDrive,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: rBg }}>
      {/* ── Content Area (Padded for Bottom Navigation Bar) ── */}
      <View style={{ flex: 1, paddingBottom: 68 + Math.max(bottomInset, 10) }}>
        {navTab === 'scan' ? (
          <ScannerStudio
            primaryColor={primary}
            isDark={isDark}
            onOpenPdf={async (uri, name) => {
              if (onOpenScannedPdf) {
                await onOpenScannedPdf(uri, name);
              }
            }}
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
          >
          {/* ═══════════════════════════════════════════════════════
              TAB 1: HOME
             ═══════════════════════════════════════════════════════ */}
          {navTab === 'home' && (
            <View>
              {/* Acrobat Search Bar */}
              <View style={{ paddingHorizontal: 18, marginTop: 4, marginBottom: 14 }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: Platform.OS === 'ios' ? 10 : 6,
                  gap: 10,
                }}>
                  <Search size={18} color={rMuted} />
                  <TextInput
                    style={{
                      flex: 1,
                      fontSize: 13.5,
                      color: rText,
                      paddingVertical: 0,
                    }}
                    placeholder="Search PDF files and documents..."
                    placeholderTextColor={rMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    clearButtonMode="while-editing"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <X size={16} color={rMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Brand Hero (when not searching) */}
              {!searchQuery && (
                <View style={{
                  alignItems: 'center',
                  paddingTop: 8,
                  paddingBottom: 20,
                  paddingHorizontal: 24,
                }}>
                  <View style={{
                    width: 86, height: 86, borderRadius: 24,
                    overflow: 'hidden',
                    shadowColor: primary, shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.35, shadowRadius: 16,
                    elevation: 10, marginBottom: 10,
                  }}>
                    <Image
                      source={isDark ? appIconDark : appIcon}
                      style={{ width: 86, height: 86 }}
                      resizeMode="cover"
                    />
                  </View>
                  <Text style={{
                    fontSize: 22, fontWeight: '900', color: rText,
                    letterSpacing: -0.5, marginBottom: 2,
                  }}>
                    Helper PDF
                  </Text>
                  <Text style={{
                    fontSize: 11, fontWeight: '800', color: primary,
                    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6,
                  }}>
                    Reader & Scanner
                  </Text>
                  <Text style={{
                    fontSize: 12.5, color: rMuted, textAlign: 'center',
                    lineHeight: 18, maxWidth: 300,
                  }}>
                    Scan, convert, read & edit documents — all offline.
                  </Text>
                </View>
              )}

              {/* Quick Actions (Grid of converters) */}
              {!searchQuery && (
                <View style={{ paddingHorizontal: 18, marginBottom: 22 }}>
                  <Text style={{
                    fontSize: 11, fontWeight: '800', color: rMuted,
                    letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 12,
                  }}>
                    Quick Actions & Converters
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {quickTools.map((tool, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={tool.onPress}
                        style={{
                          width: (SCREEN_W - 46) / 2,
                          backgroundColor: tool.bg,
                          borderColor: tool.border || 'transparent',
                          borderWidth: tool.border ? 1 : 0,
                          borderRadius: 16,
                          padding: 14,
                          elevation: idx === 0 ? 4 : 0,
                          shadowColor: primary, shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: idx === 0 ? 0.3 : 0, shadowRadius: 8,
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{ marginBottom: 10 }}>
                          {tool.icon}
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: tool.textColor, marginBottom: 2 }}>
                          {tool.title}
                        </Text>
                        <Text style={{
                          fontSize: 10.5,
                          color: idx === 0 ? 'rgba(255,255,255,0.85)' : rMuted,
                          fontWeight: '500',
                        }}>
                          {tool.sub}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Recent Files List */}
              <View style={{ paddingHorizontal: 18 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Clock size={15} color={rMuted} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: rMuted, letterSpacing: 1.1, textTransform: 'uppercase' }}>
                      {searchQuery ? `Search Results (${filteredFiles.length})` : `Recent Files (${recentFiles.length})`}
                    </Text>
                  </View>
                  {!searchQuery && recentFiles.length > 0 && (
                    <TouchableOpacity onPress={onClearRecent} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: 11, color: '#ef4444', fontWeight: '700' }}>Clear All</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {filteredFiles.length > 0 ? (
                  filteredFiles.map((f, idx) => (
                    <View key={idx} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                      borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                      borderWidth: 1, borderRadius: 14,
                      padding: 12, marginBottom: 8,
                    }}>
                      <View style={{
                        width: 42, height: 44, borderRadius: 10,
                        backgroundColor: '#dc2626',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <FileText size={18} color="#ffffff" />
                        <Text style={{ fontSize: 8, fontWeight: '900', color: '#ffffff', marginTop: 1 }}>PDF</Text>
                      </View>

                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => onOpenRecent(f)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: rText }} numberOfLines={1}>
                          {f.name}
                        </Text>
                        <Text style={{ fontSize: 10.5, color: rMuted, marginTop: 2, fontWeight: '500' }}>
                          {f.size ? `${formatRecentFileSize(f.size)} • ` : ''}{new Date(f.openedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <TouchableOpacity
                          style={{ padding: 7, borderRadius: 8, backgroundColor: primary + '12' }}
                          onPress={() => handleSharePdf(f)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Share2 size={15} color={primary} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ padding: 7, borderRadius: 8, backgroundColor: '#0ea5e914' }}
                          onPress={() => handleOpenWithOtherApp(f)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <ExternalLink size={15} color="#0ea5e9" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ padding: 7, borderRadius: 8, backgroundColor: '#ef444412' }}
                          onPress={() => onRemoveRecent(f)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Trash2 size={15} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 32, opacity: 0.6 }}>
                    <FileText size={36} color={rMuted} />
                    <Text style={{ fontSize: 13.5, color: rMuted, marginTop: 10, fontWeight: '700' }}>
                      {searchQuery ? 'No documents match your search' : 'No recent documents yet'}
                    </Text>
                    <Text style={{ fontSize: 11, color: rMuted, marginTop: 4 }}>
                      {searchQuery ? 'Try another keyword' : 'Tap "Scan Document" or "Open PDF" to get started'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════
              TAB 2: FILES
             ═══════════════════════════════════════════════════════ */}
          {navTab === 'files' && (
            <View style={{ paddingHorizontal: 18 }}>
              <Text style={{
                fontSize: 11, fontWeight: '800', color: rMuted,
                letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 12,
              }}>
                Storage Locations
              </Text>

              {/* On This Device */}
              <TouchableOpacity
                onPress={onPick}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10,
                }}
                activeOpacity={0.75}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <FolderOpen size={22} color={primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: rText }}>On This Device</Text>
                  <Text style={{ fontSize: 11, color: rMuted, marginTop: 2 }}>Browse local files, Downloads & storage</Text>
                </View>
                <ExternalLink size={16} color={rMuted} />
              </TouchableOpacity>

              {/* Google Drive */}
              {onOpenDrive && (
                <TouchableOpacity
                  onPress={onOpenDrive}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10,
                  }}
                  activeOpacity={0.75}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#0ea5e918', alignItems: 'center', justifyContent: 'center' }}>
                    <GoogleDriveIcon size={24} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: rText }}>Google Drive</Text>
                    <Text style={{ fontSize: 11, color: rMuted, marginTop: 2 }}>Browse and stream cloud folders</Text>
                  </View>
                  <ExternalLink size={16} color={rMuted} />
                </TouchableOpacity>
              )}

              {/* Document List */}
              <Text style={{
                fontSize: 11, fontWeight: '800', color: rMuted,
                letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 12, marginBottom: 12,
              }}>
                All Documents ({filteredFiles.length})
              </Text>

              {filteredFiles.map((f, idx) => (
                <View key={idx} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                  borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                  borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8,
                }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 10,
                    backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <FileText size={17} color="#ffffff" />
                  </View>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => onOpenRecent(f)} activeOpacity={0.7}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: rText }} numberOfLines={1}>{f.name}</Text>
                    <Text style={{ fontSize: 10.5, color: rMuted, marginTop: 2, fontWeight: '500' }}>
                      {f.size ? `${formatRecentFileSize(f.size)} • ` : ''}{new Date(f.openedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <TouchableOpacity
                      style={{ padding: 7, borderRadius: 8, backgroundColor: primary + '12' }}
                      onPress={() => handleSharePdf(f)}
                    >
                      <Share2 size={15} color={primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ padding: 7, borderRadius: 8, backgroundColor: '#0ea5e914' }}
                      onPress={() => handleOpenWithOtherApp(f)}
                    >
                      <ExternalLink size={15} color="#0ea5e9" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}


          {/* ═══════════════════════════════════════════════════════
              TAB 4: TOOLS & CONVERTERS HUB
             ═══════════════════════════════════════════════════════ */}
          {navTab === 'tools' && (
            <ConverterHub
              primaryColor={primary}
              isDark={isDark}
              onOpenScanner={() => setNavTab('scan')}
              onOpenImagesToPdf={() => setNavTab('scan')}
              onOpenTextToPdf={() => setShowTextToPdfModal(true)}
              onOpenImageConverter={(mode) => {
                setImageModalMode(mode);
                setShowImageModal(true);
              }}
              onOpenDocxConverter={(mode) => {
                setDocxModalMode(mode);
                setShowDocxModal(true);
              }}
              onOpenCompressPdf={() => setShowCompressPdfModal(true)}
              onOpenDrive={onOpenDrive}
              onPickDocument={onPick}
            />
          )}
        </ScrollView>
        )}
      </View>

      {/* ── Fixed Bottom Navigation Bar (Adobe Acrobat Style) ── */}
      <AcrobatBottomNav
        currentTab={navTab}
        onSelectTab={setNavTab}
        primaryColor={primary}
        isDark={isDark}
        bottomInset={bottomInset}
      />

      {/* ── All Modals for Converters ──────────────────────── */}
      <ImageConverterModal
        visible={showImageModal}
        onClose={() => setShowImageModal(false)}
        initialMode={imageModalMode}
        primaryColor={primary}
        isDark={isDark}
      />

      <DocxConverterModal
        visible={showDocxModal}
        onClose={() => setShowDocxModal(false)}
        initialMode={docxModalMode}
        onOpenPdf={async (uri, name) => {
          if (onOpenScannedPdf) {
            await onOpenScannedPdf(uri, name);
          }
        }}
        primaryColor={primary}
        isDark={isDark}
      />

      <TextToPdfModal
        visible={showTextToPdfModal}
        onClose={() => setShowTextToPdfModal(false)}
        onOpenPdf={async (uri, name) => {
          if (onOpenScannedPdf) {
            await onOpenScannedPdf(uri, name);
          }
        }}
        primaryColor={primary}
        isDark={isDark}
      />

      <CompressPdfModal
        visible={showCompressPdfModal}
        onClose={() => setShowCompressPdfModal(false)}
        onOpenPdf={async (uri, name) => {
          if (onOpenScannedPdf) {
            await onOpenScannedPdf(uri, name);
          }
        }}
        primaryColor={primary}
        isDark={isDark}
      />
    </View>
  );
}


const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1 },
  hBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  hTitle: { flex: 1, fontSize: 14, fontWeight: '800', marginHorizontal: 6 },
  hRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginLeft: 4 },
  openBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Progress bar
  progressTrack: { height: 3, width: '100%' },
  progressFill: { height: 3, borderRadius: 2 },

  // Tabs
  tabBar: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: 12.5, fontWeight: '700' },
  pageIndicator: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 10 },
  pageIndicatorText: { fontSize: 11, fontWeight: '700' },

  // Zoom bar
  zoomBar: { position: 'absolute', right: 14, borderRadius: 12, flexDirection: 'row', padding: 4, gap: 2, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 },
  zoomBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },

  // Text reader
  textArea: { padding: 20, paddingBottom: 40 },
  pageBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 14 },
  bodyText: { letterSpacing: 0.3 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginTop: 24 },
  extractingBox: { alignItems: 'center', paddingVertical: 80 },
  extractingMsg: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 14 },

  // Player panel
  playerPanel: { borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 28 : 12 },
  typoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  typoGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  controlLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  controlVal: { fontSize: 12, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  smallBtn: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  speedRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  rateChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginRight: 5 },
  rateLabel: { fontSize: 11, fontWeight: '700' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 14, paddingVertical: 8 },
  navBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bigPlayBtn: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8 },
  stopBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Empty state
  empty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, paddingBottom: 60 },
  emptyIcon: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  emptyDesc: { fontSize: 13.5, lineHeight: 21, textAlign: 'center', marginBottom: 28 },
  pickBig: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8 },
  pickBigText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  recentName: { flex: 1, fontSize: 13, fontWeight: '600' },
  themeDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },

  // Loading
  loadingOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  loadingBox: { padding: 28, borderRadius: 18, alignItems: 'center', width: 230, elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  loadingTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  loadingMsg: { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // Modal / Sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  inlineModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    zIndex: 9999,
    elevation: 9999,
  },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 17, fontWeight: '800', marginBottom: 18, textAlign: 'center' },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 18 },
  themeCard: { width: 94, height: 72, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  selectedDot: { position: 'absolute', bottom: 6, right: 6, width: 10, height: 10, borderRadius: 5 },
  sheetClose: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },

  // Jump to page
  jumpBox: { margin: 28, borderRadius: 18, padding: 24 },
  jumpInput: { borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  jumpBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1 },

  // Bookmarks
  bookmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  bookmarkLabel: { flex: 1, fontSize: 14, fontWeight: '600' },

  // Voice selector modal styles
  voiceItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  voiceDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    height: 48,
    alignSelf: 'stretch',
  },

  // Floating background AI status card
  aiFloatingCard: {
    position: 'absolute',
    bottom: 215,
    left: 16,
    right: 16,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    zIndex: 999,
  },
  aiCancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },

  // Exit header button
  exitBtn: {
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  recentItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },

  // Sync banner
  syncBanner: {
    position: 'absolute',
    top: 88,
    left: 14,
    right: 14,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 200,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  syncText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  syncBtnCancel: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.15)' },
  syncBtnTextCancel: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  syncBtnOk: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#fff' },
  syncBtnTextOk: { color: '#10b981', fontSize: 10.5, fontWeight: '800' },

  // Edit input
  editInput: {
    fontSize: 14.5,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 180,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
});
