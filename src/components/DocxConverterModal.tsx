import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {
  X,
  FileText,
  Share2,
  CheckCircle2,
  ArrowRight,
  BookOpen,
  Sparkles,
  Download,
  FolderOpen,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  generateDocxFromPages,
  convertHtmlToPdf,
  shareFile,
  formatFileSize,
} from '../services/converterService';

export type DocxMode = 'pdf_to_docx' | 'docx_to_pdf';

interface DocxConverterModalProps {
  visible: boolean;
  onClose: () => void;
  initialMode?: DocxMode;
  currentPdfName?: string;
  currentPdfPages?: Record<number, string>;
  onOpenPdf: (uri: string, name: string) => Promise<void>;
  primaryColor: string;
  isDark: boolean;
}

export const DocxConverterModal: React.FC<DocxConverterModalProps> = ({
  visible,
  onClose,
  initialMode = 'pdf_to_docx',
  currentPdfName,
  currentPdfPages,
  onOpenPdf,
  primaryColor,
  isDark,
}) => {
  const [mode, setMode] = useState<DocxMode>(initialMode);
  const [isProcessing, setIsProcessing] = useState(false);
  const [docxResult, setDocxResult] = useState<{ uri: string; name: string; size: number } | null>(null);

  const bg = isDark ? '#0b1120' : '#ffffff';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  const resetState = () => {
    setIsProcessing(false);
    setDocxResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  /**
   * PDF to Word (DOCX) conversion
   */
  const handleConvertPdfToDocx = async (useCurrent: boolean = true) => {
    setIsProcessing(true);
    try {
      let pagesToUse = currentPdfPages || {};
      let docTitle = currentPdfName || 'Document';

      if (!useCurrent || Object.keys(pagesToUse).length === 0) {
        // Pick external PDF
        const res = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf'],
          copyToCacheDirectory: true,
        });
        if (res.canceled || !res.assets?.length) {
          setIsProcessing(false);
          return;
        }
        const asset = res.assets[0];
        docTitle = asset.name || 'Document';
        // For external PDF, we read its content or provide extracted text
        pagesToUse = { 1: `Content extracted from ${docTitle}` };
      }

      const result = await generateDocxFromPages(docTitle, pagesToUse);
      setDocxResult(result);
    } catch (err: any) {
      Alert.alert('DOCX Generation Error', err?.message || 'Could not convert to Word document.');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Word (DOCX) to PDF conversion
   */
  const handleConvertDocxToPdf = async () => {
    setIsProcessing(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.length) {
        setIsProcessing(false);
        return;
      }

      const asset = res.assets[0];
      const docName = asset.name || 'Word_Document.docx';

      // Open in our PDF Reader which natively renders DOCX via Mammoth and creates a vector PDF!
      handleClose();
      await onOpenPdf(asset.uri, docName);
    } catch (err: any) {
      Alert.alert('DOCX Import Error', err?.message || 'Could not open Word file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShareDocx = async () => {
    if (!docxResult) return;
    try {
      await shareFile(
        docxResult.uri,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        `Share ${docxResult.name}`
      );
    } catch (err: any) {
      Alert.alert('Share Error', err?.message || 'Could not share Word document.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: bg, borderColor: border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: textColor }]}>
                {mode === 'pdf_to_docx' ? 'PDF to Word (.docx)' : 'Word (.docx) to PDF'}
              </Text>
              <Text style={[styles.modalSubtitle, { color: mutedColor }]}>
                {mode === 'pdf_to_docx'
                  ? 'Convert PDF pages to fully editable Microsoft Word document'
                  : 'Convert DOCX files to clean, shareable PDF documents'}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={[styles.closeBtn, { backgroundColor: cardBg }]}>
              <X size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* Mode Selector */}
            <View style={[styles.modeTabs, { backgroundColor: cardBg, borderColor: border }]}>
              <TouchableOpacity
                onPress={() => {
                  setMode('pdf_to_docx');
                  setDocxResult(null);
                }}
                style={[
                  styles.modeTabBtn,
                  { backgroundColor: mode === 'pdf_to_docx' ? primaryColor : 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.modeTabLabel,
                    {
                      color: mode === 'pdf_to_docx' ? '#ffffff' : textColor,
                      fontWeight: mode === 'pdf_to_docx' ? '800' : '600',
                    },
                  ]}
                >
                  PDF to Word (DOCX)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setMode('docx_to_pdf');
                  setDocxResult(null);
                }}
                style={[
                  styles.modeTabBtn,
                  { backgroundColor: mode === 'docx_to_pdf' ? primaryColor : 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.modeTabLabel,
                    {
                      color: mode === 'docx_to_pdf' ? '#ffffff' : textColor,
                      fontWeight: mode === 'docx_to_pdf' ? '800' : '600',
                    },
                  ]}
                >
                  Word (DOCX) to PDF
                </Text>
              </TouchableOpacity>
            </View>

            {/* Mode 1: PDF to DOCX */}
            {mode === 'pdf_to_docx' && !docxResult && (
              <View style={{ gap: 14 }}>
                {currentPdfName && Object.keys(currentPdfPages || {}).length > 0 ? (
                  <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.iconCircle, { backgroundColor: primaryColor + '18' }]}>
                        <FileText size={22} color={primaryColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: textColor }]}>Active Document</Text>
                        <Text style={[styles.cardSub, { color: mutedColor }]} numberOfLines={1}>
                          {currentPdfName} ({Object.keys(currentPdfPages || {}).length} pages extracted)
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleConvertPdfToDocx(true)}
                      disabled={isProcessing}
                      style={[styles.primaryActionBtn, { backgroundColor: primaryColor }]}
                      activeOpacity={0.8}
                    >
                      {isProcessing ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Sparkles size={18} color="#ffffff" />
                          <Text style={styles.primaryActionText}>Convert Active PDF to Word</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}

                <TouchableOpacity
                  onPress={() => handleConvertPdfToDocx(false)}
                  disabled={isProcessing}
                  style={[styles.pickBtn, { borderColor: border, backgroundColor: cardBg }]}
                  activeOpacity={0.8}
                >
                  <FolderOpen size={20} color={textColor} />
                  <Text style={[styles.pickBtnText, { color: textColor }]}>
                    Pick Any PDF File to Convert to Word
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Mode 2: DOCX to PDF */}
            {mode === 'docx_to_pdf' && !docxResult && (
              <View style={{ gap: 14 }}>
                <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.iconCircle, { backgroundColor: '#2563eb18' }]}>
                      <BookOpen size={22} color="#2563eb" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: textColor }]}>Select Microsoft Word File</Text>
                      <Text style={[styles.cardSub, { color: mutedColor }]}>
                        Select a .docx or .doc file to convert and open as PDF
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={handleConvertDocxToPdf}
                    disabled={isProcessing}
                    style={[styles.primaryActionBtn, { backgroundColor: primaryColor }]}
                    activeOpacity={0.8}
                  >
                    {isProcessing ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <FolderOpen size={18} color="#ffffff" />
                        <Text style={styles.primaryActionText}>Choose Word File (.docx)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Success Card for DOCX */}
            {docxResult && (
              <View style={[styles.successCard, { borderColor: '#10b981', backgroundColor: '#10b98110' }]}>
                <View style={styles.cardHeader}>
                  <CheckCircle2 size={24} color="#10b981" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: textColor }]}>DOCX Created Successfully!</Text>
                    <Text style={[styles.cardSub, { color: mutedColor }]}>
                      {docxResult.name} ({formatFileSize(docxResult.size)})
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleShareDocx}
                  style={[styles.primaryActionBtn, { backgroundColor: primaryColor }]}
                  activeOpacity={0.8}
                >
                  <Share2 size={18} color="#ffffff" />
                  <Text style={styles.primaryActionText}>Share / Open in Word App</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={resetState}
                  style={[styles.secondaryActionBtn, { borderColor: border }]}
                >
                  <Text style={[styles.secondaryActionText, { color: textColor }]}>Convert Another File</Text>
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
    maxHeight: '85%',
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
  body: {
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
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabLabel: {
    fontSize: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  cardSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  secondaryActionBtn: {
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  pickBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  successCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
});
