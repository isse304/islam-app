import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Dua } from './dua.service';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

export interface AIResponse {
  content: string;
  virtues?: string;
  application?: string;
  context?: string;
  related?: string;
  impact?: string;
  explanation?: string;
  relatedVerses?: string[];
  historicalContext?: string;
  reflectionPoints?: string[];
  modernApplication?: string;
}

interface AIRequestPrompt {
  systemMessage: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}

interface AIGenerateResponse {
  content: string;
}

@Injectable({
  providedIn: 'root'
})
export class OpenAIService {
  private readonly apiUrl = `${environment.apiUrl}/ai/generate`;
  
  // Temperature settings for different types of content
  private readonly TEMPERATURES = {
    CORE_RELIGIOUS: 0,    // For Quranic verses, basic explanations, historical facts
    DYNAMIC: 0.6,          // For modern applications, contextual explanations
    CREATIVE: 0.8          // For reflections, alternative interpretations
  };
  
  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private apiService: ApiService
  ) {}

  generateDuaInsights(dua: Dua): Observable<AIResponse> {
    const prompt = {
      systemMessage: `You are a knowledgeable Islamic scholar specializing in duas and their deeper meanings. 
      Analyze the following dua and provide comprehensive insights in this EXACT JSON format:
      {
        "key_insights": "[Detailed explanation of the dua's core meaning and significance]",
        "virtues_and_benefits": [
          "[List specific virtues with references]",
          "[Include both worldly and spiritual benefits]",
          "[Mention specific situations when this dua is especially beneficial]"
        ],
        "practical_application": [
          "[How to implement this dua in daily life]",
          "[Best times and situations to recite it]",
          "[Proper method of recitation]",
          "[How to maximize its benefits]"
        ],
        "historical_context": "[Detailed background about when and why this dua was revealed/taught]",
        "related_references": {
          "verses": [{
            "reference": "Surah name, number:verse",
            "arabic": "Arabic text of the verse",
            "translation": "Full English translation",
            "relevance": "How this verse relates to the dua"
          }],
          "hadith": [{
            "text": "Full hadith text in English",
            "arabic": "Arabic text if available",
            "source": "Complete source reference",
            "grade": "Authenticity grade",
            "relevance": "How this hadith relates to the dua"
          }]
        },
        "reflection_points": [
          "[Deep, thought-provoking questions about the dua's meaning]",
          "[Points for personal introspection]",
          "[Ways to connect this dua to one's life]"
        ],
        "spiritual_impact": [
          "[How this dua transforms one's relationship with Allah]",
          "[Emotional and spiritual growth it facilitates]",
          "[Long-term benefits of regular recitation]"
        ]
      }
      
      For all Quranic verses and Hadith:
      1. Always provide complete references
      2. Include both Arabic and English translations where possible
      3. Explain the relevance to the dua
      4. For hadith, include authenticity grades
      
      Ensure all sections are properly filled and formatted as JSON.`,
      userMessage: `Please analyze this dua:
      
      Arabic: ${dua.arabic}
      Translation: ${dua.translation}
      Reference: ${dua.reference}
      
      Provide comprehensive insights following the specified JSON format.`,
      temperature: 0.4,
      maxTokens: 2000
    };

    return this.apiService.generateAIResponse(prompt).pipe(
      map(response => {
        if (!response?.content) {
          throw new Error('Invalid response format from server');
        }

        try {
          const jsonResponse = JSON.parse(response.content);
          
          // Process verses and hadith
          const processReferences = (refs: any) => {
            const results = [];
            
            // Process Quranic verses
            if (refs?.verses?.length) {
              for (const verse of refs.verses) {
                const parts = [];
                parts.push(`Reference: ${verse.reference}`);
                if (verse.arabic) parts.push(`Arabic: ${verse.arabic}`);
                if (verse.translation) parts.push(`Translation: ${verse.translation}`);
                if (verse.relevance) parts.push(`Relevance: ${verse.relevance}`);
                results.push(parts.join('\n'));
              }
            }
            
            // Process hadith
            if (refs?.hadith?.length) {
              for (const h of refs.hadith) {
                const parts = [];
                parts.push(`Reference: ${h.source} (${h.grade || 'Grade not specified'})`);
                if (h.arabic) parts.push(`Arabic: ${h.arabic}`);
                if (h.text) parts.push(`Text: ${h.text}`);
                if (h.relevance) parts.push(`Relevance: ${h.relevance}`);
                results.push(parts.join('\n'));
              }
            }
            
            return results;
          };

          return {
            content: jsonResponse.key_insights || '',
            virtues: Array.isArray(jsonResponse.virtues_and_benefits) 
              ? jsonResponse.virtues_and_benefits.join('\n') 
              : jsonResponse.virtues_and_benefits || '',
            application: Array.isArray(jsonResponse.practical_application)
              ? jsonResponse.practical_application.join('\n')
              : jsonResponse.practical_application || '',
            context: jsonResponse.historical_context || '',
            impact: Array.isArray(jsonResponse.spiritual_impact)
              ? jsonResponse.spiritual_impact.join('\n')
              : jsonResponse.spiritual_impact || '',
            explanation: jsonResponse.key_insights || '',
            historicalContext: jsonResponse.historical_context || '',
            reflectionPoints: Array.isArray(jsonResponse.reflection_points)
              ? jsonResponse.reflection_points
              : [],
            modernApplication: Array.isArray(jsonResponse.practical_application)
              ? jsonResponse.practical_application.join('\n')
              : jsonResponse.practical_application || '',
            relatedVerses: processReferences(jsonResponse.related_references)
          };
        } catch (error) {
          console.error('Error parsing JSON response:', error);
          // Fallback to original text parsing if JSON parsing fails
          const sections = response.content.split('\n\n');
          const parseSection = (title: string) => {
            const section = sections.find((s: string) => s.toLowerCase().includes(title.toLowerCase()));
            if (!section) return '';
            const lines = section.split('\n');
            return lines.slice(1).join('\n').trim();
          };

          const parseBulletPoints = (title: string) => {
            const section = sections.find((s: string) => s.toLowerCase().includes(title.toLowerCase()));
            if (!section) return [];
            const lines = section.split('\n');
            return lines
              .slice(1)
              .filter((line: string) => line.trim().startsWith('•'))
              .map((line: string) => line.replace('•', '').trim());
          };

          return {
            content: parseSection('Key Insights'),
            virtues: parseBulletPoints('Virtues & Benefits').join('\n'),
            application: parseBulletPoints('Practical Application').join('\n'),
            context: parseSection('Historical Context'),
            related: parseBulletPoints('Related Verses & Hadith').join('\n'),
            impact: parseBulletPoints('Spiritual Impact').join('\n'),
            reflectionPoints: parseBulletPoints('Personal Reflection Points'),
            explanation: parseSection('Key Insights'),
            historicalContext: parseSection('Historical Context'),
            relatedVerses: parseBulletPoints('Related Verses & Hadith'),
            modernApplication: parseSection('Practical Application')
          };
        }
      })
    );
  }

  suggestDuasByContext(situation: string, emotions: string[]): Observable<AIResponse> {
    // Extract emotions from sentence if provided
    const extractedEmotions = this.extractEmotionsFromText(situation);
    const allEmotions = [...new Set([...emotions, ...extractedEmotions])];
    
    const prompt: AIRequestPrompt = {
      systemMessage: `You are a knowledgeable Islamic scholar specializing in Islamic psychology, spiritual therapy, and emotional well-being, with deep expertise in Quran, Hadith, and Islamic spirituality.

      Your approach combines:
      1. Traditional Islamic wisdom from the Quran and Sunnah
      2. Understanding of Islamic psychology (Ilm an-Nafs)
      3. Therapeutic techniques from Islamic counseling
      4. Practical emotional healing methods from the prophetic tradition

      IMPORTANT: When analyzing multiple emotions, ensure each emotion is addressed separately before providing combined guidance.

      For each emotion:
      1. Validate and acknowledge it from an Islamic perspective
      2. Provide specific Quranic verses and hadith related to that emotion
      3. Share examples of prophets or companions who experienced it
      4. Give specific duas and dhikr for that emotion

      Then provide combined guidance that:
      1. Addresses how the emotions interact with each other
      2. Suggests prioritized coping strategies
      3. Offers a comprehensive spiritual development plan

      Format your response in JSON as follows:
      {
        "individual_emotions": [{
          "emotion": "string",
          "islamic_perspective": "string",
          "quranic_example": {
            "story": "string",
            "verse": "string",
            "reference": "string"
          },
          "prophetic_guidance": "string",
          "specific_duas": [{
            "arabic": "string",
            "transliteration": "string",
            "translation": "string",
            "virtue": "string"
          }]
        }],
        "combined_guidance": {
          "emotional_interaction": "string",
          "primary_recommendations": ["string"],
          "spiritual_prescription": {
            "immediate_steps": ["string"],
            "short_term_practices": ["string"],
            "long_term_development": ["string"]
          }
        },
        "recommended_duas": [{
          "arabic": "string",
          "transliteration": "string",
          "translation": "string",
          "virtue": "string",
          "emotional_benefits": "string",
          "source": "string"
        }],
        "quranic_verses": [{
          "arabic": "string",
          "translation": "string",
          "reference": "string",
          "tafsir_excerpt": "string"
        }],
        "hadith": [{
          "text": "string",
          "source": "string",
          "grade": "string",
          "psychological_lesson": "string"
        }],
        "therapeutic_steps": [{
          "type": "string",
          "action": "string",
          "islamic_basis": "string",
          "expected_benefit": "string"
        }],
        "spiritual_advice": "string",
        "long_term_growth": {
          "spiritual_aspects": ["string"],
          "emotional_aspects": ["string"],
          "behavioral_changes": ["string"]
        }
      }`,
      userMessage: `Analyze and provide comprehensive guidance for these emotions: ${allEmotions.join(', ')}
      Context: ${situation}
      
      Please address each emotion individually first, then provide combined guidance that takes into account how these emotions interact and influence each other.`,
      temperature: this.TEMPERATURES.DYNAMIC,
      maxTokens: 2000
    };

    return from(this.getCompletion(prompt));
  }

  private extractEmotionsFromText(text: string): string[] {
    const emotionKeywords = {
      angry: ['angry', 'furious', 'rage', 'irritated', 'frustrated'],
      sad: ['sad', 'depressed', 'down', 'heartbroken', 'grief', 'sorrow'],
      anxious: ['anxious', 'worried', 'nervous', 'stressed', 'uneasy', 'fear'],
      happy: ['happy', 'joyful', 'excited', 'delighted', 'pleased'],
      grateful: ['grateful', 'thankful', 'blessed', 'appreciative'],
      hopeful: ['hopeful', 'optimistic', 'positive', 'encouraged'],
      confused: ['confused', 'uncertain', 'unsure', 'lost', 'perplexed'],
      lonely: ['lonely', 'alone', 'isolated', 'abandoned'],
      guilty: ['guilty', 'regretful', 'remorseful', 'ashamed'],
      peaceful: ['peaceful', 'calm', 'serene', 'tranquil']
    };

    const words = text.toLowerCase().split(/\W+/);
    const foundEmotions = new Set<string>();

    words.forEach(word => {
      for (const [emotion, synonyms] of Object.entries(emotionKeywords)) {
        if (synonyms.includes(word)) {
          foundEmotions.add(emotion);
        }
      }
    });

    return Array.from(foundEmotions);
  }

  generateReflectionPrompts(dua: Dua): Observable<AIResponse> {
    const prompt = {
      systemMessage: `You are a Islamic scholar specializing in Islamic reflection and personal development.
      Provide deep, meaningful reflection points for this dua in the following format:

      Content:
      [3-4 thought-provoking questions or points for personal reflection based on the dua's themes]

      Spiritual Impact:
      • [How this dua can transform one's relationship with Allah]
      • [The emotional and spiritual growth it can facilitate]
      • [Long-term benefits of incorporating it into daily practice]
      • [How it connects to broader Islamic principles]

      Each section should be detailed, specific, and include relevant Quranic verses or hadith as supporting evidence.
      Keep the tone warm and inspiring while maintaining scholarly depth.`,
      userMessage: `Please generate reflection prompts for this dua:
      
      Arabic: ${dua.arabic}
      Translation: ${dua.translation}
      
      Provide comprehensive reflection points following the specified format.`,
      temperature: 0.4,
      maxTokens: 1500
    };

    return this.apiService.generateAIResponse(prompt);
  }

  private async getCombinedCompletion(corePrompt: AIRequestPrompt, dynamicPrompt: AIRequestPrompt): Promise<AIResponse> {
    try {
      // Get both responses in parallel
      const [coreResponse, dynamicResponse] = await Promise.all([
        this.getCompletion(corePrompt),
        this.getCompletion(dynamicPrompt)
      ]);

      // Combine the responses
      return {
        content: coreResponse.explanation || '',
        explanation: coreResponse.explanation,
        relatedVerses: coreResponse.relatedVerses,
        historicalContext: coreResponse.historicalContext,
        reflectionPoints: dynamicResponse.reflectionPoints,
        modernApplication: dynamicResponse.modernApplication
      };
    } catch (error) {
      console.error('Error in combined completion:', error);
      throw error;
    }
  }

  private async getCompletion(prompt: AIRequestPrompt): Promise<AIResponse> {
    try {
      console.log('Getting auth token...');
      const token = await this.authService.getToken();
      
      if (!token) {
        console.error('Failed to get authentication token');
        throw new Error('No authentication token available');
      }
      
      console.log('Making API request with token...');
      const response = await this.http.post<AIGenerateResponse>(
        this.apiUrl, 
        { prompt },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      ).toPromise();
      
      if (!response?.content) {
        console.error('Invalid response format:', response);
        throw new Error('Invalid response format from server');
      }

      console.log('Successfully received API response');
      return this.parseAIResponse(response.content);
    } catch (error: any) {
      console.error('API error:', error);
      if (error.status === 401) {
        console.error('Authentication failed - please ensure you are logged in');
      }
      throw error;
    }
  }

  private parseAIResponse(content: string): AIResponse {
    try {
      // Try to parse as JSON first
      const jsonResponse = JSON.parse(content);
      
      // Format related verses and hadith into readable text
      const formatRelatedContent = (related: { quranic_verses?: any[], hadith?: any[] }) => {
        if (!related) return '';
        let result = '';
        
        // Handle verses
        if (Array.isArray(related.quranic_verses) && related.quranic_verses.length > 0) {
          result += 'Quranic Verses:\n';
          related.quranic_verses.forEach((verse: any) => {
            result += `\n• ${verse.reference}\n`;
            result += `  Arabic: ${verse.arabic}\n`;
            result += `  Translation: ${verse.translation}\n`;
          });
        }
        
        // Handle hadith
        if (Array.isArray(related.hadith) && related.hadith.length > 0) {
          result += '\nHadith:\n';
          related.hadith.forEach((h: any) => {
            result += `\n• ${h.text}\n`;
            result += `  Source: ${h.source}\n`;
            result += `  Grade: ${h.grade}\n`;
          });
        }
        
        return result.trim();
      };

      // Format individual emotions analysis
      const formatIndividualEmotions = (emotions: any[]) => {
        if (!Array.isArray(emotions)) return '';
        return emotions.map(emotion => 
          `${emotion.emotion.toUpperCase()}\n\n` +
          `Islamic Perspective:\n${emotion.islamic_perspective}\n\n` +
          `Quranic Example:\n${emotion.quranic_example.story}\n` +
          `(${emotion.quranic_example.reference})\n\n` +
          `Prophetic Guidance:\n${emotion.prophetic_guidance}\n\n` +
          `Recommended Duas:\n` +
          emotion.specific_duas.map((dua: any) => 
            `• ${dua.transliteration}\n  ${dua.translation}\n  Virtue: ${dua.virtue}`
          ).join('\n\n')
        ).join('\n\n---\n\n');
      };

      // Format combined guidance
      const formatCombinedGuidance = (guidance: any) => {
        if (!guidance) return '';
        return `COMBINED GUIDANCE\n\n` +
               `Understanding Your Emotions:\n${guidance.emotional_interaction}\n\n` +
               `Primary Recommendations:\n` +
               guidance.primary_recommendations.map((rec: string) => `• ${rec}`).join('\n') + '\n\n' +
               `Spiritual Prescription:\n` +
               `Immediate Steps:\n` +
               guidance.spiritual_prescription.immediate_steps.map((step: string) => `• ${step}`).join('\n') + '\n\n' +
               `Short-term Practices:\n` +
               guidance.spiritual_prescription.short_term_practices.map((practice: string) => `• ${practice}`).join('\n') + '\n\n' +
               `Long-term Development:\n` +
               guidance.spiritual_prescription.long_term_development.map((dev: string) => `• ${dev}`).join('\n');
      };

      // Format long-term growth
      const formatLongTermGrowth = (growth: { 
        spiritual_aspects?: string[], 
        emotional_aspects?: string[], 
        behavioral_changes?: string[] 
      }) => {
        if (!growth) return '';
        let result = 'Long-term Growth Plan:\n\n';
        if (Array.isArray(growth.spiritual_aspects)) {
          result += 'Spiritual Growth:\n• ' + growth.spiritual_aspects.join('\n• ') + '\n\n';
        }
        if (Array.isArray(growth.emotional_aspects)) {
          result += 'Emotional Growth:\n• ' + growth.emotional_aspects.join('\n• ') + '\n\n';
        }
        if (Array.isArray(growth.behavioral_changes)) {
          result += 'Behavioral Changes:\n• ' + growth.behavioral_changes.join('\n• ');
        }
        return result;
      };

      interface TherapeuticStep {
        type: string;
        action: string;
        islamic_basis: string;
        expected_benefit: string;
      }

      // Handle emotional response format
      if (jsonResponse.individual_emotions) {
        const individualEmotionsAnalysis = formatIndividualEmotions(jsonResponse.individual_emotions);
        const combinedGuidance = formatCombinedGuidance(jsonResponse.combined_guidance);

        return {
          content: `${individualEmotionsAnalysis}\n\n${combinedGuidance}`,
          virtues: Array.isArray(jsonResponse.recommended_duas) 
            ? jsonResponse.recommended_duas.map((d: any) => 
                `${d.virtue || ''}\nEmotional Benefits: ${d.emotional_benefits || ''}`
              ).join('\n\n') 
            : '',
          application: Array.isArray(jsonResponse.therapeutic_steps)
            ? jsonResponse.therapeutic_steps.map((step: TherapeuticStep) => 
                `${step.type.toUpperCase()}\n` +
                `Action: ${step.action}\n` +
                `Islamic Basis: ${step.islamic_basis}\n` +
                `Expected Benefit: ${step.expected_benefit}`
              ).join('\n\n')
            : '',
          context: jsonResponse.combined_guidance?.emotional_interaction || '',
          related: formatRelatedContent({
            quranic_verses: jsonResponse.quranic_verses,
            hadith: jsonResponse.hadith
          }),
          impact: jsonResponse.spiritual_advice + '\n\n' + formatLongTermGrowth(jsonResponse.long_term_growth),
          explanation: individualEmotionsAnalysis,
          relatedVerses: Array.isArray(jsonResponse.quranic_verses)
            ? jsonResponse.quranic_verses.map((v: any) => 
                `${v.reference}: ${v.translation}\nTafsir: ${v.tafsir_excerpt || ''}`
              )
            : [],
          historicalContext: combinedGuidance,
          reflectionPoints: Array.isArray(jsonResponse.therapeutic_steps)
            ? jsonResponse.therapeutic_steps.map((s: TherapeuticStep) => s.action)
            : [],
          modernApplication: formatLongTermGrowth(jsonResponse.long_term_growth)
        };
      }

      // Handle dua insights format
      return {
        content: jsonResponse.key_insights || '',
        virtues: Array.isArray(jsonResponse.virtues_and_benefits) 
          ? jsonResponse.virtues_and_benefits.join('\n') 
          : jsonResponse.virtues_and_benefits || '',
        application: Array.isArray(jsonResponse.practical_application)
          ? jsonResponse.practical_application.join('\n')
          : jsonResponse.practical_application || '',
        context: jsonResponse.historical_context || '',
        related: formatRelatedContent(jsonResponse.related_references),
        impact: Array.isArray(jsonResponse.spiritual_impact)
          ? jsonResponse.spiritual_impact.join('\n')
          : jsonResponse.spiritual_impact || '',
        explanation: jsonResponse.key_insights || '',
        historicalContext: jsonResponse.historical_context || '',
        relatedVerses: Array.isArray(jsonResponse.related_references.verses)
          ? jsonResponse.related_references.verses.map((v: any) => 
              `${v.reference}: ${v.translation}\nRelevance: ${v.relevance}`
            )
          : [],
        reflectionPoints: Array.isArray(jsonResponse.reflection_points)
          ? jsonResponse.reflection_points
          : [],
        modernApplication: Array.isArray(jsonResponse.practical_application)
          ? jsonResponse.practical_application.join('\n')
          : jsonResponse.practical_application || ''
      };
    } catch (error) {
      // Fallback to text parsing if JSON parsing fails
      console.error('Error parsing JSON response:', error);
      const sections = content.split('\n\n');
      return {
        content: sections[0] || '',
        explanation: sections[0] || '',
        relatedVerses: sections[1]?.split('\n'),
        historicalContext: sections[2] || '',
        reflectionPoints: sections[3]?.split('\n'),
        modernApplication: sections[4] || ''
      };
    }
  }

  private generateAIResponse(prompt: AIRequestPrompt): Observable<AIResponse> {
    return from(this.getCompletion(prompt));
  }
} 