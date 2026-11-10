import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

export interface GiphyGif {
  id: string;
  title: string;
  url: string;
  preview_url: string;
  original_url: string;
  width: number;
  height: number;
}

export interface GiphySearchResult {
  gifs: GiphyGif[];
  results: GiphyGif[];
  total_count: number;
  offset: number;
  available: boolean;
}

class GiphyService {
  private async getAuthHeader(): Promise<{ Authorization: string } | {}> {
    const token = await AsyncStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private normalize(data: any, offset: number): GiphySearchResult {
    const gifs: GiphyGif[] = data?.gifs || data?.results || [];
    return {
      gifs,
      results: data?.results || gifs,
      total_count: data?.total_count || 0,
      offset: data?.offset ?? offset,
      available: data?.available !== false,
    };
  }

  private unavailable(offset: number): GiphySearchResult {
    return { gifs: [], results: [], total_count: 0, offset, available: false };
  }

  async search(query: string, limit: number = 20, offset: number = 0): Promise<GiphySearchResult> {
    try {
      const headers = await this.getAuthHeader();
      const response = await axios.get(`${API_URL}/api/giphy/search`, {
        params: { q: query, limit, offset },
        headers,
      });
      return this.normalize(response.data, offset);
    } catch (error) {
      console.error('Giphy search error:', error);
      return this.unavailable(offset);
    }
  }

  async getTrending(limit: number = 20, offset: number = 0): Promise<GiphySearchResult> {
    try {
      const headers = await this.getAuthHeader();
      const response = await axios.get(`${API_URL}/api/giphy/trending`, {
        params: { limit, offset },
        headers,
      });
      return this.normalize(response.data, offset);
    } catch (error) {
      console.error('Giphy trending error:', error);
      return this.unavailable(offset);
    }
  }
}

export const giphyService = new GiphyService();
