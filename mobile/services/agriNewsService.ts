import { DEMO_MODE } from '../constants/demoConfig';
import { DEMO_AGRI_NEWS, AgriNewsArticle } from '../constants/demoData';

export type { AgriNewsArticle } from '../constants/demoData';

export type AgriNewsCategory = AgriNewsArticle['category'];

const NEWS_API_BASE = 'https://newsapi.org/v2/everything';
const NEWS_API_KEY = process.env.EXPO_PUBLIC_NEWS_API_KEY;

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: Array<{
    source: { name: string };
    title: string;
    description: string | null;
    url: string;
    publishedAt: string;
  }>;
}

function classifyCategory(title: string, description: string): AgriNewsArticle['category'] {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('price') || text.includes('mandi') || text.includes('msp')) return 'price_alert';
  if (text.includes('rain') || text.includes('weather') || text.includes('flood') || text.includes('drought') || text.includes('monsoon')) return 'weather';
  if (text.includes('scheme') || text.includes('pm-kisan') || text.includes('pmfby') || text.includes('subsidy') || text.includes('insurance')) return 'scheme';
  if (text.includes('export') || text.includes('import') || text.includes('trade') || text.includes('market')) return 'market';
  return 'general';
}

function classifySeverity(title: string, description: string): AgriNewsArticle['severity'] {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('urgent') || text.includes('warning') || text.includes('flood') || text.includes('heavy rain') || text.includes('crash')) return 'urgent';
  if (text.includes('important') || text.includes('rise') || text.includes('fall') || text.includes('deadline')) return 'important';
  return 'normal';
}

function extractCrops(text: string): string[] {
  const crops: string[] = [];
  const lower = text.toLowerCase();
  const cropMap: Record<string, string> = {
    tomato: 'Tomato', onion: 'Onion', potato: 'Potato',
    chilli: 'Chilli', mango: 'Mango', wheat: 'Wheat',
    rice: 'Rice', paddy: 'Paddy', cotton: 'Cotton',
    sugarcane: 'Sugarcane',
  };
  for (const [key, val] of Object.entries(cropMap)) {
    if (lower.includes(key)) crops.push(val);
  }
  return crops;
}

function extractStates(text: string): string[] {
  const states: string[] = [];
  const lower = text.toLowerCase();
  const stateList = [
    'Tamil Nadu', 'Karnataka', 'Maharashtra', 'Kerala', 'Andhra Pradesh',
    'Telangana', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh',
    'Bihar', 'West Bengal', 'Punjab', 'Haryana', 'Delhi',
  ];
  for (const s of stateList) {
    if (lower.includes(s.toLowerCase())) states.push(s);
  }
  return states.length > 0 ? states : ['All India'];
}

export async function getAgriNews(filterCategory?: AgriNewsCategory): Promise<AgriNewsArticle[]> {
  if (DEMO_MODE) {
    let articles = [...DEMO_AGRI_NEWS];
    if (filterCategory) {
      articles = articles.filter((a) => a.category === filterCategory);
    }
    return articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }

  if (!NEWS_API_KEY) {
    console.warn('EXPO_PUBLIC_NEWS_API_KEY not set, returning demo data');
    return DEMO_AGRI_NEWS;
  }

  try {
    const params = new URLSearchParams({
      q: 'India agriculture OR farmer OR mandi OR crop price',
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: '10',
      apiKey: NEWS_API_KEY,
    });

    const response = await fetch(`${NEWS_API_BASE}?${params}`);
    if (!response.ok) {
      throw new Error(`NewsAPI error: ${response.status}`);
    }

    const data: NewsApiResponse = await response.json();

    const articles: AgriNewsArticle[] = data.articles.map((raw, idx) => {
      const title = raw.title || '';
      const description = raw.description || '';
      return {
        id: `newsapi-${idx}-${Date.now()}`,
        title,
        summary: description,
        source: raw.source.name,
        url: raw.url,
        publishedAt: raw.publishedAt,
        category: classifyCategory(title, description),
        severity: classifySeverity(title, description),
        affectedCrops: extractCrops(`${title} ${description}`),
        affectedStates: extractStates(`${title} ${description}`),
      };
    });

    if (filterCategory) {
      return articles.filter((a) => a.category === filterCategory);
    }

    return articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  } catch (error) {
    console.error('Failed to fetch agri news:', error);
    return DEMO_AGRI_NEWS;
  }
}
