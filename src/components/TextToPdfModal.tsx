import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, FileText, Sparkles, Check } from 'lucide-react-native';
import { convertTextNotesToPdf } from '../services/converterService';

interface TextToPdfModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenPdf: (uri: string, name: string) => Promise<void>;
  primaryColor: string;
  isDark: boolean;
}

export const TextToPdfModal: React.FC<TextToPdfModalProps> = ({
  visible,
  onClose,
  onOpenPdf,
  primaryColor,
  isDark,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isConverting, setIsConverting] = useState(false);

  const bg = isDark ? '#0b1120' : '#ffffff';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';

  const handleConvert = async () => {
    if (!content.trim()) {
      Alert.alert('Empty Content', 'Please enter some text or notes to generate a PDF.');
      return;
    }
    setIsConverting(true);
    try {
      const docTitle = title.trim() || 'Untitled Note';
      const result = await convertTextNotesToPdf(docTitle, content, primaryColor);
      setTitle('');
      setContent('');
      onClose();
      await onOpenPdf(result.uri, result.name);
    } catch (err: any) {
      Alert.alert('PDF Creation Error', err?.message || 'Could not generate PDF from text.');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={[styles.modalCard, { backgroundColor: bg, borderColor: border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Text Notes to PDF</Text>
              <Text style={[styles.modalSubtitle, { color: mutedColor }]}>
                Format and compile typed notes into an A4 PDF document
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: cardBg }]}>
              <X size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* Title Input */}
            <View>
              <Text style={[styles.fieldLabel, { color: mutedColor }]}>DOCUMENT TITLE</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Meeting Minutes, Project Plan, Study Notes..."
                placeholderTextColor={mutedColor}
                style={[
                  styles.titleInput,
                  {
                    color: textColor,
                    backgroundColor: cardBg,
                    borderColor: border,
                  },
                ]}
              />
            </View>

            {/* Content Input */}
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: mutedColor }]}>NOTE CONTENT</Text>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="Type or paste your text, paragraphs, lecture notes, or markdown here..."
                placeholderTextColor={mutedColor}
                multiline
                textAlignVertical="top"
                style={[
                  styles.contentInput,
                  {
                    color: textColor,
                    backgroundColor: cardBg,
                    borderColor: border,
                  },
                ]}
              />
            </View>

            {/* Quick Word & Char Count */}
            <View style={styles.counterRow}>
              <Text style={[styles.counterText, { color: mutedColor }]}>
                {content.trim() ? content.trim().split(/\s+/).length : 0} Words • {content.length} Characters
              </Text>
            </View>

            {/* Generate Button */}
            <TouchableOpacity
              onPress={handleConvert}
              disabled={isConverting}
              style={[styles.generateBtn, { backgroundColor: primaryColor }]}
              activeOpacity={0.8}
            >
              {isConverting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <FileText size={18} color="#ffffff" />
                  <Text style={styles.generateBtnText}>Compile & Open PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
  body: {
    padding: 18,
    gap: 16,
    flexGrow: 1,
  },
  fieldLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  titleInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 13.5,
    fontWeight: '600',
  },
  contentInput: {
    minHeight: 220,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    fontSize: 13.5,
    lineHeight: 20,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  counterText: {
    fontSize: 11,
    fontWeight: '600',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  generateBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
