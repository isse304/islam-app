// Emotional Dua Response Type
export interface EmotionalDuaResponse {
  success: boolean;
  content: string;
  quranic_guidance: string[];
  prophetic_example: string;
  practical_steps: string[];
  spiritual_advice: {
    understanding: string;
    duas: string[];
    dhikr: string[];
    scholarly_guidance: string[];
    spiritual_remedies: string[];
  };
  related_verses_hadith: {
    verses: Array<{
      reference: string;
      translation: string;
      relevance: string;
    }>;
    hadith: Array<{
      text: string;
      source: string;
      grade: string;
      relevance: string;
    }>;
  };
  reflection_points: string[];
  virtues?: string;
  application?: string;
  context?: string;
  related?: string;
  impact?: string;
  explanation?: string;
  modernApplication?: string;
  error?: string;
  duas?: any[];
  insights?: string;
  relatedVerses?: string[];
  historicalContext?: string;
  reflectionPoints?: string[];
} 