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
  total_count: number;
  offset: number;
}

class GiphyService {
  private async getAuthHeader(): Promise<{ Authorization: string } | {}> {
    const token = await AsyncStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async search(query: string, limit: number = 20, offset: number = 0): Promise<GiphySearchResult> {
    try {
      const headers = await this.getAuthHeader();
      const response = await axios.get(`${API_URL}/api/giphy/search`, {
        params: { q: query, limit, offset },
        headers,
      });
      return response.data;
    } catch (error) {
      console.error('Giphy search error:', error);
      return { gifs: [], total_count: 0, offset: 0 };
    }
  }

  async getTrending(limit: number = 20, offset: number = 0): Promise<GiphySearchResult> {
    try {
      const headers = await this.getAuthHeader();
      const response = await axios.get(`${API_URL}/api/giphy/trending`, {
        params: { limit, offset },
        headers,
      });
      return response.data;
    } catch (error) {
      console.error('Giphy trending error:', error);
      return { gifs: [], total_count: 0, offset: 0 };
    }
  }
}

export const giphyService = new GiphyService();
