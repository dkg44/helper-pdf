import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {
  X,
  Image as ImageIcon,
  ArrowRight,
  Share2,
  FolderOpen,
  CheckCircle2,
  Sparkles,
  Zap,
} from 'lucide-react-native';
import {
  pickImageForConversion,
  convertJpgToPng,
  convertPngToJpg,
  compressOrResizeImage,
  shareFile,
  formatFileSize,
  ImageConversionResult,
} from '../services/converterService';

export type ImageConvertMode = 'jpg_to_png' | 'png_to_jpg' | 'webp' | 'compress';

interface ImageConverterModalProps {
  visible: boolean;
  onClose: () => void;
  initialMode?: ImageConvertMode;
  primaryColor: string;
  isDark: boolean;
}

export const ImageConverterModal: React.FC<ImageConverterModalProps> = ({
  visible,
  onClose,
  initialMode = 'jpg_to_png',
  primaryColor,
  isDark,
}) => {
  const [mode, setMode] = useState<ImageConvertMode>(initialMode);
  const [selectedImage, setSelectedImage] = useState<{ uri: string; name: string; size?: number } | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [result, setResult] = useState<ImageConversionResult | null>(null);
  const [qualityOption, setQualityOption] = useState<number>(0.9);
  const [scaleOption, setScaleOption] = useState<number>(100);

  const bg = isDark ? '#0b1120' : '#ffffff';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  const resetState = () => {
    setSelectedImage(null);
    setResult(null);
    setIsConverting(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handlePick = async () => {
    try {
      const picked = await pickImageForConversion();
      if (picked) {
        setSelectedImage(picked);
        setResult(null);
      }
    } catch (err: any) {
      Alert.alert('Selection Error', err?.message || 'Could not select image.');
    }
  };

  const handleExecuteConversion = async () => {
    if (!selectedImage) {
      Alert.alert('No Image', 'Please pick an image to convert.');
      return;
    }
    setIsConverting(true);
    try {
      let res: ImageConversionResult;
      if (mode === 'jpg_to_png') {
        res = await convertJpgToPng(selectedImage.uri, selectedImage.name);
      } else if (mode === 'png_to_jpg') {
        res = await convertPngToJpg(selectedImage.uri, qualityOption, selectedImage.name);
      } else if (mode === 'webp') {
        // Default to high quality PNG or JPG
        res = await convertPngToJpg(selectedImage.uri, qualityOption, selectedImage.name);
      } else {
        // Compress & Resize
        res = await compressOrResizeImage(selectedImage.uri, {
          scalePercent: scaleOption,
          quality: qualityOption,
          originalName: selectedImage.name,
        });
      }
      setResult(res);
    } catch (err: any) {
      Alert.alert('Conversion Failed', err?.message || 'Could not convert image.');
    } finally {
      setIsConverting(false);
    }
  };

  const handleShare = async () => {
    if (!result) return;
    try {
      const mime = result.format === 'png' ? 'image/png' : 'image/jpeg';
      await shareFile(result.uri, mime, `Share ${result.name}`);
    } catch (err: any) {
      Alert.alert('Share Error', err?.message || 'Could not share file.');
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'jpg_to_png':
        return 'JPG to PNG Converter';
      case 'png_to_jpg':
        return 'PNG to JPG Converter';
      case 'webp':
        return 'WebP to JPG / PNG';
      case 'compress':
        return 'Image Compressor & Resizer';
    }
  };

  const getDesc = () => {
    switch (mode) {
      case 'jpg_to_png':
        return 'Converts JPG / JPEG photos to lossless transparent PNG format';
      case 'png_to_jpg':
        return 'Converts PNG images to standard compressed JPG format';
      case 'webp':
        return 'Convert modern WebP web photos to universal JPG or PNG';
      case 'compress':
        return 'Reduce MB size and dimensions for government portals and emails';
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: bg, borderColor: border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: textColor }]}>{getTitle()}</Text>
              <Text style={[styles.modalSubtitle, { color: mutedColor }]} numberOfLines={1}>
                {getDesc()}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={[styles.closeBtn, { backgroundColor: cardBg }]}>
              <X size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Mode Selector Tabs */}
            <View style={[styles.modeTabs, { backgroundColor: cardBg, borderColor: border }]}>
              {[
                { key: 'jpg_to_png', label: 'JPG ➔ PNG' },
                { key: 'png_to_jpg', label: 'PNG ➔ JPG' },
                { key: 'compress', label: 'Compress' },
                { key: 'webp', label: 'WebP' },
              ].map((t) => {
                const active = mode === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => {
                      setMode(t.key as ImageConvertMode);
                      setResult(null);
                    }}
                    style={[
                      styles.modeTabBtn,
                      {
                        backgroundColor: active ? primaryColor : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeTabLabel,
                        {
                          color: active ? '#ffffff' : textColor,
                          fontWeight: active ? '800' : '600',
                        },
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Step 1: Pick Image */}
            {!selectedImage ? (
              <TouchableOpacity
                onPress={handlePick}
                style={[styles.pickArea, { borderColor: primaryColor, backgroundColor: primaryColor + '08' }]}
                activeOpacity={0.8}
              >
                <View style={[styles.pickIconBox, { backgroundColor: primaryColor + '18' }]}>
                  <ImageIcon size={32} color={primaryColor} />
                </View>
                <Text style={[styles.pickTitle, { color: textColor }]}>Select Image from Device</Text>
                <Text style={[styles.pickSub, { color: mutedColor }]}>
                  Tap to choose from Gallery or Files
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.selectedCard, { backgroundColor: cardBg, borderColor: border }]}>
                <Image source={{ uri: selectedImage.uri }} style={styles.selectedThumbnail} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.selectedName, { color: textColor }]} numberOfLines={1}>
                    {selectedImage.name}
                  </Text>
                  <Text style={[styles.selectedSize, { color: mutedColor }]}>
                    Original Size: {formatFileSize(selectedImage.size)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handlePick}
                  style={[styles.changeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }]}
                >
                  <Text style={[styles.changeBtnText, { color: textColor }]}>Change</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Options for PNG to JPG or Compress */}
            {selectedImage && (mode === 'png_to_jpg' || mode === 'compress') && (
              <View style={[styles.optionsCard, { backgroundColor: cardBg, borderColor: border }]}>
                <Text style={[styles.optionsTitle, { color: textColor }]}>Compression & Quality</Text>
                <View style={styles.optionRow}>
                  {[
                    { label: 'High (95%)', val: 0.95 },
                    { label: 'Medium (80%)', val: 0.8 },
                    { label: 'Compact (60%)', val: 0.6 },
                  ].map((q) => (
                    <TouchableOpacity
                      key={q.label}
                      onPress={() => setQualityOption(q.val)}
                      style={[
                        styles.qualityBtn,
                        {
                          backgroundColor: qualityOption === q.val ? primaryColor : 'transparent',
                          borderColor: qualityOption === q.val ? primaryColor : border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.qualityBtnText,
                          { color: qualityOption === q.val ? '#ffffff' : textColor },
                        ]}
                      >
                        {q.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {mode === 'compress' && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.optionsTitle, { color: textColor, marginBottom: 8 }]}>
                      Resize Resolution
                    </Text>
                    <View style={styles.optionRow}>
                      {[
                        { label: '100% (Original)', val: 100 },
                        { label: '75%', val: 75 },
                        { label: '50% (Half)', val: 50 },
                        { label: '25% (Tiny)', val: 25 },
                      ].map((s) => (
                        <TouchableOpacity
                          key={s.label}
                          onPress={() => setScaleOption(s.val)}
                          style={[
                            styles.qualityBtn,
                            {
                              backgroundColor: scaleOption === s.val ? primaryColor : 'transparent',
                              borderColor: scaleOption === s.val ? primaryColor : border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.qualityBtnText,
                              { color: scaleOption === s.val ? '#ffffff' : textColor },
                            ]}
                          >
                            {s.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Convert Action Button */}
            {selectedImage && !result && (
              <TouchableOpacity
                onPress={handleExecuteConversion}
                disabled={isConverting}
                style={[styles.convertBtn, { backgroundColor: primaryColor }]}
                activeOpacity={0.8}
              >
                {isConverting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Zap size={18} color="#ffffff" />
                    <Text style={styles.convertBtnText}>Convert Now</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Step 3: Result Card */}
            {result && (
              <View style={[styles.resultCard, { borderColor: '#10b981', backgroundColor: '#10b98110' }]}>
                <View style={styles.resultHeader}>
                  <CheckCircle2 size={24} color="#10b981" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultTitle, { color: textColor }]}>Conversion Complete!</Text>
                    <Text style={[styles.resultSubtitle, { color: mutedColor }]}>
                      Saved as {result.name}
                    </Text>
                  </View>
                </View>

                {/* Thumbnail Preview of converted file */}
                <Image source={{ uri: result.uri }} style={styles.resultImg} resizeMode="contain" />

                {/* Size stats */}
                <View style={[styles.statsRow, { backgroundColor: cardBg, borderColor: border }]}>
                  <View style={styles.statCol}>
                    <Text style={[styles.statLabel, { color: mutedColor }]}>Before</Text>
                    <Text style={[styles.statVal, { color: textColor }]}>
                      {formatFileSize(result.originalSize)}
                    </Text>
                  </View>
                  <ArrowRight size={18} color={primaryColor} />
                  <View style={styles.statCol}>
                    <Text style={[styles.statLabel, { color: mutedColor }]}>Converted ({result.format.toUpperCase()})</Text>
                    <Text style={[styles.statVal, { color: '#10b981', fontWeight: '800' }]}>
                      {formatFileSize(result.newSize)}
                    </Text>
                  </View>
                </View>

                {/* Share Action */}
                <TouchableOpacity
                  onPress={handleShare}
                  style={[styles.shareBtn, { backgroundColor: primaryColor }]}
                  activeOpacity={0.8}
                >
                  <Share2 size={18} color="#ffffff" />
                  <Text style={styles.shareBtnText}>Share Converted Image</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={resetState}
                  style={[styles.convertAnotherBtn, { borderColor: border }]}
                >
                  <Text style={[styles.convertAnotherText, { color: textColor }]}>Convert Another Image</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    padding: 18,
    gap: 16,
  },
  modeTabs: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  modeTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabLabel: {
    fontSize: 11,
  },
  pickArea: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pickTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  pickSub: {
    fontSize: 11.5,
    marginTop: 3,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  selectedThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  selectedName: {
    fontSize: 13,
    fontWeight: '700',
  },
  selectedSize: {
    fontSize: 11,
    marginTop: 2,
  },
  changeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changeBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  optionsCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  optionsTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  qualityBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  convertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  convertBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  resultCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  resultSubtitle: {
    fontSize: 11.5,
  },
  resultImg: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#000000',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  statCol: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  statVal: {
    fontSize: 13,
    marginTop: 2,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  shareBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  convertAnotherBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  convertAnotherText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
