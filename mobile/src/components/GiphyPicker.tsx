import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { giphyService, GiphyGif } from '../services/giphy';

interface Props {
  colors: any;
  onSelect: (gif: GiphyGif) => void;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const GIF_SIZE = (SCREEN_WIDTH - 48) / NUM_COLUMNS;

export const GiphyPicker: React.FC<Props> = ({ colors, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadTrending = useCallback(async () => {
    setLoading(true);
    try {
      const result = await giphyService.getTrending(20, 0);
      setGifs(result.gifs);
      setOffset(20);
      setHasMore(result.gifs.length < result.total_count);
    } catch (e) {
      console.error('Load trending error:', e);
    }
    setLoading(false);
  }, []);

  const searchGifs = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      loadTrending();
      return;
    }
    
    setLoading(true);
    try {
      const result = await giphyService.search(searchQuery, 20, 0);
      setGifs(result.gifs);
      setOffset(20);
      setHasMore(result.gifs.length < result.total_count);
    } catch (e) {
      console.error('Search error:', e);
    }
    setLoading(false);
  }, [loadTrending]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    try {
      const result = query.trim()
        ? await giphyService.search(query, 20, offset)
        : await giphyService.getTrending(20, offset);
      
      setGifs(prev => [...prev, ...result.gifs]);
      setOffset(prev => prev + 20);
      setHasMore(gifs.length + result.gifs.length < result.total_count);
    } catch (e) {
      console.error('Load more error:', e);
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, query, offset, gifs.length]);

  useEffect(() => {
    loadTrending();
  }, [loadTrending]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      searchGifs(query);
    }, 500);
    
    return () => clearTimeout(timeout);
  }, [query, searchGifs]);

  const renderGif = ({ item }: { item: GiphyGif }) => (
    <TouchableOpacity
      style={styles.gifItem}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.preview_url }}
        style={[styles.gifImage, { backgroundColor: colors.card }]}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>GIFs</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search GIFs..."
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* GIF Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading GIFs...
          </Text>
        </View>
      ) : gifs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="images-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {query ? 'No GIFs found' : 'No trending GIFs'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={gifs}
          renderItem={renderGif}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={styles.gifGrid}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footer} color={colors.primary} />
            ) : null
          }
        />
      )}

      {/* Powered by Giphy */}
      <View style={styles.poweredBy}>
        <Text style={[styles.poweredByText, { color: colors.textSecondary }]}>
          Powered by GIPHY
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
  },
  gifGrid: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  gifItem: {
    width: GIF_SIZE,
    height: GIF_SIZE * 0.75,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  footer: {
    paddingVertical: 16,
  },
  poweredBy: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  poweredByText: {
    fontSize: 11,
  },
});
