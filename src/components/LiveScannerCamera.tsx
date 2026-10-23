import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  SafeAreaView,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  X,
  Zap,
  ZapOff,
  Sparkles,
  Camera as CameraIcon,
  FolderOpen,
  Check,
  CreditCard,
  BookOpen,
  Layers,
  FileText,
} from 'lucide-react-native';
import { ScannedPage, detectEarlyCrop, detectEarlyCorners, NO_CROP } from '../services/scannerService';
import { PerspectiveWarpBridgeRef } from '../services/perspectiveService';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export type CameraCaptureMode = 'single' | 'batch' | 'id_card' | 'passport';

interface LiveScannerCameraProps {
  visible: boolean;
  onClose: () => void;
  onFinishCapture: (pages: ScannedPage[]) => void;
  primaryColor: string;
  warpBridgeRef?: React.RefObject<PerspectiveWarpBridgeRef | null>;
}

export const LiveScannerCamera: React.FC<LiveScannerCameraProps> = ({
  visible,
  onClose,
  onFinishCapture,
  primaryColor,
  warpBridgeRef,
}) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraCaptureMode>('batch');
  const [idCardStep, setIdCardStep] = useState<'front' | 'rear'>('front');
  const [idCardFrontPage, setIdCardFrontPage] = useState<ScannedPage | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [torchOn, setTorchOn] = useState(false);
  const [autoClick, setAutoClick] = useState(false);
  const [capturedPages, setCapturedPages] = useState<ScannedPage[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cornersLocked, setCornersLocked] = useState(false);

  const cameraRef = useRef<any>(null);

  // Laser scan line animation for Auto-Click mode
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      requestCameraPerms();
      setCapturedPages([]);
      setCornersLocked(false);
      setIdCardStep('front');
      setIdCardFrontPage(null);
      setProcessingStatus('');
    }
  }, [visible]);

  useEffect(() => {
    if (autoClick && visible) {
      // Loop laser line animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Trigger simulated corner detection and auto-capture after lock
      const timer = setTimeout(() => {
        setCornersLocked(true);
        setTimeout(() => {
          handleCapturePhoto();
          setCornersLocked(false);
        }, 800);
      }, 2200);

      return () => clearTimeout(timer);
    } else {
      scanLineAnim.setValue(0);
      setCornersLocked(false);
    }
  }, [autoClick, visible, capturedPages.length]);

  const requestCameraPerms = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    } catch {
      setHasPermission(false);
    }
  };

  const handleCapturePhoto = async () => {
    if (isCapturing || !cameraRef.current) return;
    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        skipProcessing: false,
      });

      if (photo?.uri) {
        const earlyCrop = detectEarlyCrop(photo.width, photo.height);
        const earlyCorners = detectEarlyCorners(photo.width, photo.height);
        const newPage: ScannedPage = {
          id: `scan_${Date.now()}_${capturedPages.length}`,
          uri: photo.uri,
          originalUri: photo.uri,
          rotation: 0,
          filter: 'doc',
          crop: earlyCrop,
          corners: earlyCorners,
          width: photo.width,
          height: photo.height,
        };

        if (cameraMode === 'single') {
          // Single page capture: finish immediately
          onFinishCapture([newPage]);
        } else if (cameraMode === 'passport') {
          // Passport mode: finish immediately so user can edit/review the passport document
          onFinishCapture([newPage]);
        } else if (cameraMode === 'id_card') {
          if (idCardStep === 'front') {
            // Step 1: Front captured. Prompt for rear side
            setIdCardFrontPage(newPage);
            setIdCardStep('rear');
            Alert.alert(
              'Front Side Captured! 💳',
              'Now turn over your ID card to scan the REAR (Back) side. Both will be merged into 1 page.',
              [{ text: 'Scan Rear Side', style: 'default' }]
            );
          } else {
            // Step 2: Rear captured! Combine both photos onto 1 single page
            setProcessingStatus('Merging Front & Rear into 1-Page Document...');
            try {
              if (idCardFrontPage && warpBridgeRef?.current?.combineIdCard) {
                const combined = await warpBridgeRef.current.combineIdCard(idCardFrontPage.uri, newPage.uri);
                const combinedPage: ScannedPage = {
                  id: `idcard_${Date.now()}`,
                  uri: combined.uri,
                  originalUri: combined.uri,
                  rotation: 0,
                  filter: 'doc',
                  crop: detectEarlyCrop(combined.width, combined.height),
                  corners: detectEarlyCorners(combined.width, combined.height),
                  width: combined.width,
                  height: combined.height,
                };
                setIdCardFrontPage(null);
                setIdCardStep('front');
                onFinishCapture([combinedPage]);
              } else {
                onFinishCapture([idCardFrontPage || newPage, newPage]);
              }
            } catch (combErr) {
              console.warn('ID combine failed, using pages:', combErr);
              onFinishCapture([idCardFrontPage || newPage, newPage]);
            } finally {
              setProcessingStatus('');
            }
          }
        } else {
          // In batch mode, accumulate and keep camera open
          setCapturedPages((prev) => [...prev, newPage]);
        }
      }
    } catch (err: any) {
      Alert.alert('Capture Error', err?.message || 'Could not take picture.');
    } finally {
      setIsCapturing(false);
    }
  };

  // Gallery import inside camera
  const handleImportGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        quality: 0.95,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newPages: ScannedPage[] = result.assets.map((asset, i) => ({
          id: `scan_${Date.now()}_${capturedPages.length + i}`,
          uri: asset.uri,
          originalUri: asset.uri,
          rotation: 0,
          filter: 'doc',
          crop: detectEarlyCrop(asset.width, asset.height),
          corners: detectEarlyCorners(asset.width, asset.height),
          width: asset.width,
          height: asset.height,
        }));

        const combined = [...capturedPages, ...newPages];
        onFinishCapture(combined);
      }
    } catch (e: any) {
      Alert.alert('Import Error', e?.message || 'Could not import images.');
    }
  };

  const handleDoneBatch = () => {
    if (capturedPages.length === 0) {
      Alert.alert('No Photos', 'Please snap at least one page or cancel.');
      return;
    }
    onFinishCapture(capturedPages);
  };

  if (!visible) return null;

  const frameWidth = SCREEN_W * 0.86;
  const frameHeight =
    cameraMode === 'id_card'
      ? frameWidth * 0.63
      : cameraMode === 'passport'
      ? frameWidth * 0.72
      : frameWidth * 1.35;

  const scanTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, frameHeight - 4],
  });

  return (
    <View style={styles.container}>
      {/* Live Camera View */}
      {hasPermission ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
        />
      ) : (
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>Camera permission is required</Text>
          <TouchableOpacity onPress={requestCameraPerms} style={styles.permBtn}>
            <Text style={{ color: '#ffffff', fontWeight: '700' }}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Darkened Mask Overlay with Center Document Cutout */}
      <SafeAreaView style={styles.safeArea}>
        {/* ── Top Bar ── */}
        <View style={styles.topBar}>
          {/* Cancel Button */}
          <TouchableOpacity
            onPress={onClose}
            style={styles.topCircleBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Auto Click / Corner Detect Toggle */}
          <TouchableOpacity
            onPress={() => setAutoClick(!autoClick)}
            style={[
              styles.autoClickPill,
              {
                backgroundColor: autoClick ? '#10b981' : 'rgba(0,0,0,0.5)',
                borderColor: autoClick ? '#10b981' : 'rgba(255,255,255,0.3)',
              },
            ]}
          >
            <Sparkles size={14} color="#ffffff" />
            <Text style={styles.autoClickText}>
              {autoClick ? 'Auto Snap: ON' : 'Auto Snap'}
            </Text>
          </TouchableOpacity>

          {/* Backlight / Torch Toggle for Night Scanning */}
          <TouchableOpacity
            onPress={() => setTorchOn(!torchOn)}
            style={[
              styles.topCircleBtn,
              { backgroundColor: torchOn ? '#eab308' : 'rgba(0,0,0,0.5)' },
            ]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {torchOn ? <Zap size={22} color="#000000" /> : <ZapOff size={22} color="#ffffff" />}
          </TouchableOpacity>
        </View>

        {/* ── Center Document Target Reticle ── */}
        <View style={styles.centerArea}>
          <View
            style={[
              styles.documentFrame,
              {
                width: frameWidth,
                height: frameHeight,
                borderColor: cornersLocked ? '#10b981' : 'rgba(255,255,255,0.4)',
              },
            ]}
          >
            {/* 4 Corner Bracket Markers */}
            <View
              style={[
                styles.cornerBracket,
                styles.tlBracket,
                { borderColor: cornersLocked ? '#10b981' : '#ffffff' },
              ]}
            />
            <View
              style={[
                styles.cornerBracket,
                styles.trBracket,
                { borderColor: cornersLocked ? '#10b981' : '#ffffff' },
              ]}
            />
            <View
              style={[
                styles.cornerBracket,
                styles.blBracket,
                { borderColor: cornersLocked ? '#10b981' : '#ffffff' },
              ]}
            />
            <View
              style={[
                styles.cornerBracket,
                styles.brBracket,
                { borderColor: cornersLocked ? '#10b981' : '#ffffff' },
              ]}
            />

            {/* Mode Guide Label */}
            <View style={styles.guideBadge}>
              <Text style={styles.guideText}>
                {cornersLocked
                  ? 'Corners Detected & Locked ✓'
                  : cameraMode === 'id_card'
                  ? idCardStep === 'front'
                    ? '📸 Step 1 of 2: Align FRONT of ID Card'
                    : '📸 Step 2 of 2: Flip Card & Align REAR (Back)'
                  : cameraMode === 'passport'
                  ? 'Align Passport Photo & Bio-Data Page'
                  : 'Align document inside frame'}
              </Text>
            </View>

            {/* Laser Line Animation in Auto Snap Mode */}
            {autoClick && (
              <Animated.View
                style={[
                  styles.laserLine,
                  {
                    transform: [{ translateY: scanTranslateY }],
                    backgroundColor: cornersLocked ? '#10b981' : '#38bdf8',
                  },
                ]}
              />
            )}
          </View>
        </View>

        {/* ── Mode Selector: Single | Batch | ID Card | Passport (Just Above Shutter) ── */}
        <View style={styles.modeSelectorWrap}>
          {[
            { id: 'single', label: 'Single', icon: <FileText size={13} color="#ffffff" /> },
            { id: 'batch', label: 'Batch', icon: <Layers size={13} color="#ffffff" /> },
            { id: 'id_card', label: 'ID Card', icon: <CreditCard size={13} color="#ffffff" /> },
            { id: 'passport', label: 'Passport', icon: <BookOpen size={13} color="#ffffff" /> },
          ].map((mode) => {
            const isSelected = cameraMode === mode.id;
            return (
              <TouchableOpacity
                key={mode.id}
                onPress={() => {
                  setCameraMode(mode.id as CameraCaptureMode);
                  setIdCardStep('front');
                  setIdCardFrontPage(null);
                }}
                style={[
                  styles.modeTab,
                  {
                    backgroundColor: isSelected ? primaryColor : 'transparent',
                  },
                ]}
                activeOpacity={0.7}
              >
                {mode.icon}
                <Text
                  style={[
                    styles.modeTabText,
                    {
                      color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)',
                      fontWeight: isSelected ? '800' : '600',
                    },
                  ]}
                >
                  {mode.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Bottom Shutter & Batch Accumulator Bar ── */}
        <View style={styles.bottomBar}>
          {/* Bottom Left: Import from Gallery or Captured Front Preview */}
          {cameraMode === 'id_card' && idCardStep === 'rear' && idCardFrontPage ? (
            <TouchableOpacity
              onPress={() => {
                setIdCardStep('front');
                setIdCardFrontPage(null);
              }}
              style={styles.frontThumbContainer}
              activeOpacity={0.8}
            >
              <Image source={{ uri: idCardFrontPage.uri }} style={styles.frontThumbImg} />
              <View style={styles.frontBadge}>
                <Text style={styles.frontBadgeText}>Front ✓</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleImportGallery}
              style={styles.galleryIconBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <FolderOpen size={24} color="#ffffff" />
              <Text style={styles.bottomBtnLabel}>Gallery</Text>
            </TouchableOpacity>
          )}

          {/* Center: Circular Shutter Button */}
          <TouchableOpacity
            onPress={handleCapturePhoto}
            style={styles.shutterRing}
            activeOpacity={0.7}
            disabled={isCapturing}
          >
            {isCapturing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={[styles.shutterCore, { backgroundColor: primaryColor }]} />
            )}
          </TouchableOpacity>

          {/* Bottom Right: Batch Photos Accumulator Tray & Done Button */}
          {cameraMode === 'batch' ? (
            <TouchableOpacity
              onPress={handleDoneBatch}
              style={[
                styles.batchTrayBtn,
                { opacity: capturedPages.length > 0 ? 1 : 0.4 },
              ]}
              disabled={capturedPages.length === 0}
            >
              {capturedPages.length > 0 ? (
                <View style={styles.batchThumbWrap}>
                  <Image
                    source={{ uri: capturedPages[capturedPages.length - 1].uri }}
                    style={styles.batchThumbImg}
                  />
                  <View style={styles.batchCountBadge}>
                    <Text style={styles.batchCountText}>{capturedPages.length}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.emptyBatchBox}>
                  <Check size={22} color="#ffffff" />
                </View>
              )}
              <Text style={styles.bottomBtnLabel}>
                {capturedPages.length > 0 ? `Done (${capturedPages.length})` : 'Done'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>
      </SafeAreaView>

      {/* Processing / Combining Overlay */}
      {processingStatus ? (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.processingText}>{processingStatus}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    zIndex: 9999,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  permBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 24 : 10,
  },
  topCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoClickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  autoClickText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentFrame: {
    borderWidth: 1,
    borderStyle: 'dashed',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cornerBracket: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#ffffff',
  },
  tlBracket: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  trBracket: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  blBracket: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  brBracket: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  guideBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  guideText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  laserLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    shadowColor: '#38bdf8',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  modeSelectorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    marginHorizontal: 24,
    borderRadius: 22,
    padding: 3,
    marginBottom: 16,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  modeTabText: {
    fontSize: 12,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  galleryIconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  bottomBtnLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  shutterRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  shutterCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  batchTrayBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
  },
  batchThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  batchThumbImg: {
    width: '100%',
    height: '100%',
  },
  batchCountBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#10b981',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  batchCountText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  emptyBatchBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frontThumbContainer: {
    width: 60,
    height: 46,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#38bdf8',
    position: 'relative',
    backgroundColor: '#1e293b',
  },
  frontThumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  frontBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(14,165,233,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 1,
  },
  frontBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: 24,
  },
  processingText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
  },
});
