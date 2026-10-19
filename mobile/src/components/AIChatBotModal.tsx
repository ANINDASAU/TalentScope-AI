import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../theme/colors';

interface ChatMessage {
  id: string;
  text: string;
  fromUser: boolean;
}

interface AIChatBotModalProps {
  athleteName?: string;
}

export default function AIChatBotModal({ athleteName = 'Marcus' }: AIChatBotModalProps) {
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: `Hello ${athleteName}! How can I help with your performance data today?`,
      fromUser: false
    }
  ]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    setMessages(prev => [
      ...prev,
      { id: `u-${Date.now()}`, text, fromUser: true },
      {
        id: `a-${Date.now()}`,
        text:
          'Based on your latest assessment, your explosive power is trending up. Focus on hip mobility drills this week to reduce lateral knee strain.',
        fromUser: false
      }
    ]);
    setInput('');
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.fab}
        onPress={() => setVisible(true)}
      >
        <Icon name="chat" size={28} color="#ffffff" />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity style={styles.backdropTouch} onPress={() => setVisible(false)} />
          <View style={styles.panel}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Icon name="auto-awesome" size={18} color={Colors.secondaryFixed} />
                <Text style={styles.headerTitle}>TalentScope AI Assistant</Text>
              </View>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Icon name="close" size={22} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={messages}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.messages}
              renderItem={({ item }) =>
                item.fromUser ? (
                  <View style={[styles.bubbleRow, { justifyContent: 'flex-end' }]}>
                    <View style={[styles.bubble, styles.userBubble]}>
                      <Text style={styles.userText}>{item.text}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.bubbleRow}>
                    <View style={styles.avatarCircle}>
                      <Icon name="smart-toy" size={16} color={Colors.onSecondaryContainer} />
                    </View>
                    <View style={[styles.bubble, styles.aiBubble]}>
                      <Text style={styles.aiText}>{item.text}</Text>
                    </View>
                  </View>
                )
              }
            />

            <View style={styles.inputRow}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask about your explosive power..."
                placeholderTextColor={Colors.outlineVariant}
                style={styles.input}
                onSubmitEditing={sendMessage}
              />
              <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
                <Icon name="send" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.md,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 60
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end'
  },
  backdropTouch: {
    flex: 1
  },
  panel: {
    backgroundColor: Colors.surfaceBright,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '75%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(87, 223, 254, 0.2)'
  },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm
  },
  headerTitle: {
    fontFamily: 'Geist_600SemiBold',
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff'
  },
  messages: {
    padding: Spacing.md,
    gap: Spacing.md,
    backgroundColor: Colors.surfaceBright
  },
  bubbleRow: {
    flexDirection: 'row',
    gap: Spacing.sm
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center'
  },
  bubble: {
    maxWidth: '80%',
    padding: Spacing.sm,
    borderRadius: 16
  },
  aiBubble: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)'
  },
  userBubble: {
    backgroundColor: Colors.secondary,
    borderTopRightRadius: 0
  },
  aiText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: Colors.onSurface
  },
  userText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: '#ffffff'
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.35)',
    backgroundColor: '#ffffff'
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.onSurface
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
