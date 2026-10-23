import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { X, Copy, Share2, FileText, CheckCircle2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { exportPdfToTxt, shareFile } from '../services/converterService';

interface PdfToTextModalProps {
  visible: boolean;
  onClose: () => void;
  documentTitle: string;
  pagesText: Record<number, string>;
  primaryColor: string;
  isDark: boolean;
}

export const PdfToTextModal: React.FC<PdfToTextModalProps> = ({
  visible,
  onClose,
  documentTitle,
  pagesText,
  primaryColor,
  isDark,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const bg = isDark ? '#0b1120' : '#ffffff';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  const pages = Object.entries(pagesText).map(([p, text]) => ({ page: parseInt(p, 10), text }));
  pages.sort((a, b) => a.page - b.page);

  const fullText = pages.map(p => `[Page ${p.page}]\n${p.text}`).join('\n\n');
  const wordCount = fullText.trim() ? fullText.trim().split(/\s+/).length : 0;
  const charCount = fullText.length;

  const handleCopyAll = async () => {
    await Clipboard.setStringAsync(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportTxt = async () => {
    setIsExporting(true);
    try {
      const res = await exportPdfToTxt(documentTitle, pagesText);
      await shareFile(res.uri, 'text/plain', `Share ${res.name}`);
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Could not export .txt file.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: bg, borderColor: border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Extracted Text (.txt)</Text>
              <Text style={[styles.modalSubtitle, { color: mutedColor }]}>
                {wordCount} words • {charCount} characters across {pages.length} pages
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: cardBg }]}>
              <X size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={handleCopyAll}
              style={[
                styles.actionBtn,
                { backgroundColor: copied ? '#10b981' : primaryColor },
              ]}
              activeOpacity={0.8}
            >
              {copied ? <CheckCircle2 size={16} color="#ffffff" /> : <Copy size={16} color="#ffffff" />}
              <Text style={styles.actionBtnText}>{copied ? 'Copied!' : 'Copy All Text'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleExportTxt}
              disabled={isExporting}
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
              {isExporting ? (
                <ActivityIndicator size="small" color={textColor} />
              ) : (
                <>
                  <Share2 size={16} color={textColor} />
                  <Text style={[styles.actionBtnText, { color: textColor }]}>Share .txt File</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Text Content */}
          <ScrollView contentContainerStyle={styles.textContainer} showsVerticalScrollIndicator={false}>
            {pages.length === 0 ? (
              <Text style={[styles.emptyText, { color: mutedColor }]}>
                No readable text has been extracted from this document yet.
              </Text>
            ) : (
              pages.map((p) => (
                <View key={p.page} style={[styles.pageBlock, { borderColor: border, backgroundColor: cardBg }]}>
                  <Text style={[styles.pageBadge, { color: primaryColor }]}>PAGE {p.page}</Text>
                  <Text style={[styles.pageBody, { color: textColor }]}>{p.text.trim()}</Text>
                </View>
              ))
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
    height: '85%',
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
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  textContainer: {
    paddingHorizontal: 18,
    paddingBottom: 20,
    gap: 12,
  },
  pageBlock: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  pageBadge: {
    fontSize: 10.5,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  pageBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 13,
  },
});
