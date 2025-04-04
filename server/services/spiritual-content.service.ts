import { readFileSync } from 'fs';
import { join } from 'path';

// Define interfaces based on usage in the file
interface Dua {
  translation: string;
  virtue: string;
  arabic?: string;
  reference?: string;
}

interface Dhikr {
  translation: string;
  benefit: string;
  phrase?: string;
  count?: string | number;
  timing?: string;
}

interface Guidance {
  quote: string;
  scholar?: string;
  source?: string;
}

interface Remedy {
  practice: string;
  benefit: string;
  method?: string;
}

export class SpiritualContentService {
  private content: any;
  private duaInsights: any;

  constructor() {
    this.loadContent();
    this.loadDuaInsights();
  }

  private loadContent() {
    try {
      const filePath = join(__dirname, '../data/spiritual-content.json');
      const rawData = readFileSync(filePath, 'utf8');
      this.content = JSON.parse(rawData);
    } catch (error) {
      console.error('Error loading spiritual content:', error);
      this.content = {
        duas: [],
        dhikr: [],
        scholarly_guidance: [],
        spiritual_remedies: []
      };
    }
  }

  private loadDuaInsights() {
    try {
      const filePath = join(__dirname, '../data/dua-insights.json');
      const rawData = readFileSync(filePath, 'utf8');
      this.duaInsights = JSON.parse(rawData);
    } catch (error) {
      console.error('Error loading dua insights:', error);
      this.duaInsights = {};
    }
  }

  getRandomInsightForDua(duaId: string | number): any {
    try {
      const insights = this.duaInsights[duaId];
      if (!insights || !Array.isArray(insights) || insights.length === 0) {
        return null;
      }
      // Get a random insight
      const randomIndex = Math.floor(Math.random() * insights.length);
      return insights[randomIndex];
    } catch (error) {
      console.error('Error getting random insight:', error);
      return null;
    }
  }

  getRelevantContent(topic: string): any {
    // Convert topic to lowercase for case-insensitive matching
    const topicLower = topic.toLowerCase();
    
    // Get relevant duas based on topic
    const relevantDuas = this.content.duas.filter((dua: Dua) => 
      dua.translation.toLowerCase().includes(topicLower) ||
      dua.virtue.toLowerCase().includes(topicLower)
    );

    // Get relevant dhikr based on topic
    const relevantDhikr = this.content.dhikr.filter((d: Dhikr) => 
      d.translation.toLowerCase().includes(topicLower) ||
      d.benefit.toLowerCase().includes(topicLower)
    );

    // Get relevant scholarly guidance based on topic
    const relevantGuidance = this.content.scholarly_guidance.filter((g: Guidance) => 
      g.quote.toLowerCase().includes(topicLower)
    );

    // Get relevant spiritual remedies based on topic
    const relevantRemedies = this.content.spiritual_remedies.filter((r: Remedy) => 
      r.practice.toLowerCase().includes(topicLower) ||
      r.benefit.toLowerCase().includes(topicLower)
    );

    // Return at least one item from each category, even if not directly related
    return {
      duas: relevantDuas.length > 0 ? relevantDuas : [this.content.duas[0]],
      dhikr: relevantDhikr.length > 0 ? relevantDhikr : [this.content.dhikr[0]],
      scholarly_guidance: relevantGuidance.length > 0 ? relevantGuidance : [this.content.scholarly_guidance[0]],
      spiritual_remedies: relevantRemedies.length > 0 ? relevantRemedies : [this.content.spiritual_remedies[0]]
    };
  }

  validateContent(content: any): boolean {
    // Check if content has all required sections
    if (!content.spiritual_advice) return false;
    
    const advice = content.spiritual_advice;
    
    // Check if understanding section exists and is not empty
    if (!advice.understanding || typeof advice.understanding !== 'string') return false;
    
    // Check if duas section exists and has valid structure
    if (!Array.isArray(advice.duas) || advice.duas.length === 0) return false;
    for (const dua of advice.duas as Dua[]) {
      if (!dua.arabic || !dua.translation || !dua.reference || !dua.virtue) return false;
    }
    
    // Check if dhikr section exists and has valid structure
    if (!Array.isArray(advice.dhikr) || advice.dhikr.length === 0) return false;
    for (const d of advice.dhikr as Dhikr[]) {
      if (!d.phrase || !d.translation || !d.count || !d.benefit || !d.timing) return false;
    }
    
    // Check if scholarly_guidance section exists and has valid structure
    if (!Array.isArray(advice.scholarly_guidance) || advice.scholarly_guidance.length === 0) return false;
    for (const g of advice.scholarly_guidance as Guidance[]) {
      if (!g.quote || !g.scholar || !g.source) return false;
    }
    
    // Check if spiritual_remedies section exists and has valid structure
    if (!Array.isArray(advice.spiritual_remedies) || advice.spiritual_remedies.length === 0) return false;
    for (const r of advice.spiritual_remedies as Remedy[]) {
      if (!r.practice || !r.method || !r.benefit) return false;
    }
    
    return true;
  }

  enrichContent(content: any, topic: string): any {
    // If we have pre-generated insights and they're valid, use them
    if (content.duaId && this.duaInsights[content.duaId]) {
      const randomInsight = this.getRandomInsightForDua(content.duaId);
      if (randomInsight) {
        return randomInsight;
      }
    }

    // Fallback to existing enrichment logic
    const relevantContent = this.getRelevantContent(topic);
    
    if (!content.spiritual_advice) {
      content.spiritual_advice = {};
    }
    
    const advice = content.spiritual_advice;
    
    // Ensure understanding section exists and is valid
    if (!advice.understanding || 
        advice.understanding.includes('[') || 
        advice.understanding.includes('placeholder') ||
        advice.understanding.length < 50) {
      advice.understanding = `This dua provides spiritual guidance related to ${topic}. It helps strengthen one's connection with Allah and provides comfort and direction in times of need.`;
    }
    
    // Ensure duas section is valid and has at least 3 items
    if (!Array.isArray(advice.duas) || 
        advice.duas.length === 0 || 
        advice.duas.some((d: Dua) => !d.arabic || d.arabic.includes('[')) ||
        advice.duas.length < 3) {
      advice.duas = relevantContent.duas;
    }
    
    // Ensure dhikr section is valid and has at least 3 items
    if (!Array.isArray(advice.dhikr) || 
        advice.dhikr.length === 0 || 
        advice.dhikr.some((d: Dhikr) => !d.phrase || d.phrase.includes('[')) ||
        advice.dhikr.length < 3) {
      advice.dhikr = relevantContent.dhikr;
    }
    
    // Ensure scholarly_guidance section is valid and has at least 3 items
    if (!Array.isArray(advice.scholarly_guidance) || 
        advice.scholarly_guidance.length === 0 || 
        advice.scholarly_guidance.some((g: Guidance) => !g.quote || g.quote.includes('[') || g.quote.includes('Scholar\'s guidance')) ||
        advice.scholarly_guidance.length < 3) {
      advice.scholarly_guidance = relevantContent.scholarly_guidance;
    }
    
    // Ensure spiritual_remedies section is valid and has at least 3 items
    if (!Array.isArray(advice.spiritual_remedies) || 
        advice.spiritual_remedies.length === 0 || 
        advice.spiritual_remedies.some((r: Remedy) => !r.practice || r.practice.includes('[')) ||
        advice.spiritual_remedies.length < 3) {
      advice.spiritual_remedies = relevantContent.spiritual_remedies;
    }
    
    return content;
  }
} 