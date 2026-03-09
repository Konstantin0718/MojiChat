import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';

interface StickerPickerProps {
  onSelect: (sticker: { type: string; url?: string; emoji?: string }) => void;
  onClose: () => void;
}

const TABS = ['emoji', 'stickers', 'gifs'] as const;

// Common emojis
const EMOJI_CATEGORIES = {
  smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕'],
  gestures: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
  hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄'],
  food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅'],
  objects: ['⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '💾', '💿', '📷', '📹', '🎥', '📞', '☎️', '📺', '📻', '🎙️', '⏰', '⌛', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🧯', '🛒', '⚗️', '🔬', '🔭'],
};

export const StickerPicker: React.FC<StickerPickerProps> = ({ onSelect, onClose }) => {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('emoji');
  const [searchQuery, setSearchQuery] = useState('');
  const [stickerPacks, setStickerPacks] = useState<any[]>([]);
  const [gifs, setGifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('smileys');

  useEffect(() => {
    if (activeTab === 'stickers') {
      loadStickers();
    } else if (activeTab === 'gifs') {
      loadGifs();
    }
  }, [activeTab]);

  const loadStickers = async () => {
    setLoading(true);
    try {
      const data = await api.getStickers();
      setStickerPacks(data.packs || []);
    } catch (error) {
      console.error('Error loading stickers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGifs = async (query?: string) => {
    setLoading(true);
    try {
      // Using placeholder GIFs - in production would use Giphy API
      setGifs([
        { id: '1', url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif' },
        { id: '2', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
        { id: '3', url: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif' },
      ]);
    } catch (error) {
      console.error('Error loading gifs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    onSelect({ type: 'emoji', emoji });
  };

  const handleStickerSelect = (sticker: any) => {
    onSelect({ type: 'sticker', url: sticker.url });
  };

  const handleGifSelect = (gif: any) => {
    onSelect({ type: 'gif', url: gif.url });
  };

  const styles = createStyles(colors);
  const screenWidth = Dimensions.get('window').width;

  const renderEmojiTab = () => (
    <View style={styles.emojiContainer}>
      {/* Category tabs */}
      <FlatList
        horizontal
        data={Object.keys(EMOJI_CATEGORIES)}
        showsHorizontalScrollIndicator={false}
        style={styles.categoryTabs}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.categoryTab, selectedCategory === item && styles.categoryTabActive]}
            onPress={() => setSelectedCategory(item)}
          >
            <Text style={styles.categoryTabText}>
              {EMOJI_CATEGORIES[item as keyof typeof EMOJI_CATEGORIES][0]}
            </Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => item}
      />
      
      {/* Emoji grid */}
      <FlatList
        data={EMOJI_CATEGORIES[selectedCategory as keyof typeof EMOJI_CATEGORIES]}
        numColumns={8}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.emojiButton} onPress={() => handleEmojiSelect(item)}>
            <Text style={styles.emojiText}>{item}</Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item, index) => `${item}-${index}`}
        contentContainerStyle={styles.emojiGrid}
      />
    </View>
  );

  const renderStickersTab = () => (
    <View style={styles.stickersContainer}>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={stickerPacks}
          renderItem={({ item: pack }) => (
            <View style={styles.stickerPack}>
              <Text style={styles.packName}>{pack.name}</Text>
              <FlatList
                horizontal
                data={pack.stickers || []}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item: sticker }) => (
                  <TouchableOpacity
                    style={styles.stickerItem}
                    onPress={() => handleStickerSelect(sticker)}
                  >
                    <Text style={styles.stickerEmoji}>{sticker.emoji || '😀'}</Text>
                  </TouchableOpacity>
                )}
                keyExtractor={(item, index) => `sticker-${index}`}
              />
            </View>
          )}
          keyExtractor={(item) => item.pack_id}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No stickers available</Text>
            </View>
          }
        />
      )}
    </View>
  );

  const renderGifsTab = () => (
    <View style={styles.gifsContainer}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search GIFs..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text);
            loadGifs(text);
          }}
        />
      </View>
      
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={gifs}
          numColumns={2}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.gifItem, { width: (screenWidth - 48) / 2 }]}
              onPress={() => handleGifSelect(item)}
            >
              <Image source={{ uri: item.url }} style={styles.gifImage} />
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.gifGrid}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Search for GIFs</Text>
            </View>
          }
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.tabs}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={tab === 'emoji' ? 'happy' : tab === 'stickers' ? 'images' : 'film'}
                size={24}
                color={activeTab === tab ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {t(tab)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'emoji' && renderEmojiTab()}
        {activeTab === 'stickers' && renderStickersTab()}
        {activeTab === 'gifs' && renderGifsTab()}
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: 400,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tabs: {
      flex: 1,
      flexDirection: 'row',
      gap: 8,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 20,
      gap: 6,
    },
    tabActive: {
      backgroundColor: colors.background,
    },
    tabText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.primary,
      fontWeight: '600',
    },
    closeButton: {
      padding: 8,
    },
    content: {
      height: 320,
    },
    emojiContainer: {
      flex: 1,
    },
    categoryTabs: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    categoryTab: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 4,
      borderRadius: 10,
    },
    categoryTabActive: {
      backgroundColor: colors.background,
    },
    categoryTabText: {
      fontSize: 24,
    },
    emojiGrid: {
      padding: 8,
    },
    emojiButton: {
      flex: 1,
      aspectRatio: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 4,
    },
    emojiText: {
      fontSize: 28,
    },
    stickersContainer: {
      flex: 1,
      padding: 12,
    },
    stickerPack: {
      marginBottom: 16,
    },
    packName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    stickerItem: {
      width: 70,
      height: 70,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 12,
      marginRight: 8,
    },
    stickerEmoji: {
      fontSize: 36,
    },
    gifsContainer: {
      flex: 1,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      margin: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      height: 40,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      fontSize: 16,
      color: colors.text,
    },
    gifGrid: {
      padding: 12,
    },
    gifItem: {
      aspectRatio: 1,
      margin: 4,
      borderRadius: 12,
      overflow: 'hidden',
    },
    gifImage: {
      width: '100%',
      height: '100%',
    },
    loader: {
      flex: 1,
      justifyContent: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
  });
