import { DEMO_MODE } from '../constants/demoConfig';
import { DEMO_NEWS } from '../constants/demoData';
import { apiClient } from './api';

export type NewsUrgency = 'emergency' | 'important' | 'digest';
export type NewsCategory = 'price' | 'policy' | 'weather' | 'pest' | 'scheme';

export interface NewsArticle {
  article_id: string;
  title: string;
  headline_short: string;
  source: string;
  published_at: string;
  url: string | null;
  urgency_level: NewsUrgency;
  category: NewsCategory;
  crops_affected: string[];
  states_affected: string[];
  farmer_action: string;
  relevance_score: number;
  image_url: string | null;
}

export async function fetchNews(category?: string): Promise<NewsArticle[]> {
  if (DEMO_MODE) {
    const demo = DEMO_NEWS as unknown as NewsArticle[];
    if (!category || category.toLowerCase() === 'all') return demo;
    return demo.filter((n) => n.category.toLowerCase() === category.toLowerCase());
  }

  const query = category && category.toLowerCase() !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
  const response = await apiClient.get(`/api/news${query}`);
  return (response.data?.articles || []) as NewsArticle[];
}

export const newsService = {
  fetchNews,
};

export default newsService;
