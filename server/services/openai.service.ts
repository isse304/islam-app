import OpenAI from 'openai';

export interface ChatCompletionMessageParam {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export class OpenAIService {
    private openai: OpenAI;

    constructor() {
        if (!process.env['OPENAI_API_KEY']) {
            throw new Error('OpenAI API key is required');
        }

        this.openai = new OpenAI({
            apiKey: process.env['OPENAI_API_KEY']
        });
    }

    async generateResponse(prompt: string): Promise<string> {
        try {
            console.log('1. Generating response for prompt:', prompt);

            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a knowledgeable Islamic scholar who provides accurate and respectful information about Islam, always citing sources directly."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.2,
                max_tokens: 1000,
                frequency_penalty: 1.0,
                presence_penalty: 1.0
            });

            console.log('2. Response generated successfully');
            
            return completion.choices[0]?.message?.content || 'No response generated';
        } catch (error) {
            console.error('Error generating response:', error);
            throw error;
        }
    }

    async generateDuaInsights(dua: any): Promise<any> {
        const messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: `You are a knowledgeable Islamic scholar specializing in duas and their deeper meanings. 
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
                  "historical_context": "[Detailed background about when and why this dua was revealed/taught. REQUIRED field, provide known context or state if unknown.]",
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
                
                Ensure all sections are properly filled and formatted as JSON. Respond ONLY with the valid JSON object.`
            },
            {
                role: 'user',
                content: `Please analyze this dua:
                Arabic: ${dua.arabic}
                Translation: ${dua.translation}
                Reference: ${dua.reference}`
            }
        ];

        const completion = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages,
            temperature: 0.4,
            max_tokens: 2000
        });

        const content = completion.choices[0]?.message?.content || '';
        
        try {
            const jsonResponse = JSON.parse(content);
            // Helper function to safely join arrays or return string/empty string
            const formatArrayOrString = (data: any): string => 
                Array.isArray(data) ? data.join('\\n• ') : (typeof data === 'string' ? data : '');
            const formatBulletPoints = (data: any): string[] => 
                Array.isArray(data) ? data : (typeof data === 'string' ? data.split('\\n') : []);
            
            return {
                success: true,
                content: jsonResponse.key_insights || 'No key insights provided.', // Use content field for main explanation
                virtues: formatArrayOrString(jsonResponse.virtues_and_benefits),
                application: formatArrayOrString(jsonResponse.practical_application),
                context: jsonResponse.historical_context || 'Historical context not specified.', // Ensure this key is extracted
                related: this.formatRelatedReferences(jsonResponse.related_references), // Use a helper for structured references
                impact: formatArrayOrString(jsonResponse.spiritual_impact),
                explanation: jsonResponse.key_insights || 'No key insights provided.', // Redundant, keep for compatibility?
                relatedVerses: this.extractVerseRefs(jsonResponse.related_references?.verses), // Extract just references
                historicalContext: jsonResponse.historical_context || 'Historical context not specified.', // Keep this separate key too
                reflectionPoints: formatBulletPoints(jsonResponse.reflection_points),
                modernApplication: formatArrayOrString(jsonResponse.practical_application) // Reuse practical application
            };
        } catch (parseError) {
            console.error('Error parsing Dua Insights JSON response, falling back to text extraction:', parseError);
            // Fallback to text extraction if JSON parsing fails
            const sections = content.split('\\n\\n');
            return {
                success: true,
                content: content, // Return raw content on failure
                virtues: this.extractSection(sections, 'Virtues & Benefits:'),
                application: this.extractSection(sections, 'Practical Application:'),
                context: this.extractSection(sections, 'Historical Context:'), // Attempt extraction
                related: this.extractSection(sections, 'Related References:'),
                impact: this.extractSection(sections, 'Spiritual Impact:'),
                explanation: this.extractSection(sections, 'Key Insights:'),
                relatedVerses: this.extractVerses(this.extractSection(sections, 'Related References:')),
                historicalContext: this.extractSection(sections, 'Historical Context:'), // Attempt extraction again
                reflectionPoints: this.extractBulletPoints(this.extractSection(sections, 'Reflection Points:')),
                modernApplication: this.extractSection(sections, 'Practical Application:')
            };
        }
    }

    async generateEmotionalDuaResponse(emotion: string, context: string): Promise<any> {
        const messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: `You are a knowledgeable Islamic scholar specializing in emotional well-being through duas.
                Provide comprehensive Islamic guidance for emotional support in this structured format.
                
                IMPORTANT GUIDELINES:
                1. ALWAYS include Arabic text for duas and dhikr in proper Arabic script
                2. Ensure all duas and dhikr have complete information (Arabic, translation, reference, etc.)
                3. Include authentic scholarly guidance with proper attribution
                4. Provide practical spiritual remedies with clear methods
                5. ***CRITICAL: The 'spiritual_advice.duas' array MUST contain at least 2-3 relevant duas. DO NOT leave it empty.***
                
                Return the response in this EXACT format:
                {
                    "content": "Brief explanation validating the emotion from an Islamic perspective",
                    "quranic_guidance": ["List of relevant Quranic verses with translations"],
                    "prophetic_example": "How the Prophet ﷺ dealt with similar emotions",
                    "practical_steps": ["List of practical spiritual actions"],
                    "spiritual_advice": {
                        "understanding": "Detailed explanation of the emotion from Islamic perspective",
                        "duas": [
                            {
                                "arabic": "Arabic text (REQUIRED, in proper Arabic script)",
                                "translation": "English translation (REQUIRED)",
                                "reference": "Source reference (REQUIRED)",
                                "virtue": "Benefits of this dua (REQUIRED)"
                            }
                        ],
                        "dhikr": [
                            {
                                "phrase": "Arabic dhikr text (REQUIRED, in proper Arabic script)",
                                "translation": "English translation (REQUIRED)",
                                "count": "Recommended number (REQUIRED)",
                                "timing": "Best time to recite (REQUIRED)",
                                "benefit": "Specific benefits (REQUIRED)"
                            }
                        ],
                        "scholarly_guidance": [
                            {
                                "quote": "Scholar's statement (REQUIRED)",
                                "scholar": "Scholar's name (REQUIRED)",
                                "source": "Source of quote (REQUIRED)"
                            }
                        ],
                        "spiritual_remedies": [
                            {
                                "practice": "Spiritual practice (REQUIRED)",
                                "method": "How to perform (REQUIRED)",
                                "benefit": "Expected benefits (REQUIRED)"
                            }
                        ]
                    },
                    "related_verses_hadith": {
                        "verses": [
                            {
                                "reference": "Verse reference",
                                "translation": "English translation",
                                "relevance": "How it relates"
                            }
                        ],
                        "hadith": [
                            {
                                "text": "Hadith text",
                                "source": "Source book",
                                "grade": "Authenticity grade",
                                "relevance": "How it relates"
                            }
                        ]
                    },
                    "reflection_points": ["List of points for reflection"]
                }
                
                COMMON DUAS AND DHIKR TO INCLUDE (with proper Arabic text):
                1. Duas:
                - "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ" (HasbunAllah) - "Allah is sufficient for us, and He is the best Disposer of affairs"
                - "لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ" (Dua of Yunus) - "There is no deity except You; exalted are You. Indeed, I have been of the wrongdoers"
                - "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ" (Rabbana dua) - "Our Lord, grant us good in this world and good in the Hereafter and protect us from the punishment of the Fire"
                
                2. Dhikr:
                - "سُبْحَانَ اللَّهِ" (SubhanAllah) - "Glory be to Allah"
                - "الْحَمْدُ لِلَّهِ" (Alhamdulillah) - "All praise is due to Allah"
                - "اللَّهُ أَكْبَرُ" (Allahu Akbar) - "Allah is the Greatest"
                - "لَا إِلَٰهَ إِلَّا اللَّهُ" (La ilaha illa Allah) - "There is no deity worthy of worship except Allah"
                
                3. Scholarly Sources:
                - Ibn Al-Qayyim (Madarij Al-Salikeen)
                - Imam Al-Ghazali (Ihya Ulum al-Din)
                - Ibn Taymiyyah (Majmu al-Fatawa)`
            },
            {
                role: 'user',
                content: `Please provide comprehensive Islamic guidance for someone feeling ${emotion}.
                Additional context: ${context}`
            }
        ];

        try {
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages,
                temperature: 0.7,
                max_tokens: 2500
            });

            const content = completion.choices[0]?.message?.content || '';
            
            try {
                // Parse the JSON response
                const parsedResponse = JSON.parse(content);
                
                // Ensure all required fields are present, including duas
                if (!parsedResponse?.spiritual_advice?.duas || !Array.isArray(parsedResponse.spiritual_advice.duas) || parsedResponse.spiritual_advice.duas.length === 0) {
                     console.warn('OpenAI response for emotional dua search is missing the required "duas" array. Falling back or modifying.');
                     // Optionally, attempt fallback extraction here OR return an error/default structure
                     parsedResponse.spiritual_advice = parsedResponse.spiritual_advice || {};
                     parsedResponse.spiritual_advice.duas = this.extractDuas(content); // Attempt fallback extraction
                }
                
                return {
                    success: true,
                    ...parsedResponse,
                    error: null
                };
            } catch (parseError) {
                console.error('Error parsing OpenAI response:', parseError);
                
                // Fallback to section extraction if JSON parsing fails
                const sections = content.split('\n\n');
                return {
                    success: true,
                    content: this.extractSection(sections, 'Understanding the Emotion:'),
                    quranic_guidance: this.extractBulletPoints(this.extractSection(sections, 'Quranic Guidance:')),
                    prophetic_example: this.extractSection(sections, 'Prophetic Example:'),
                    practical_steps: this.extractBulletPoints(this.extractSection(sections, 'Practical Steps:')),
                    spiritual_advice: {
                        understanding: this.extractSection(sections, 'Understanding the Emotion:'),
                        duas: this.extractDuas(this.extractSection(sections, 'Recommended Duas:')),
                        dhikr: this.extractDhikr(this.extractSection(sections, 'Recommended Dhikr:')),
                        scholarly_guidance: this.extractScholarly(this.extractSection(sections, 'Scholarly Guidance:')),
                        spiritual_remedies: this.extractRemedies(this.extractSection(sections, 'Spiritual Remedies:'))
                    },
                    related_verses_hadith: {
                        verses: this.extractVerses(this.extractSection(sections, 'Related Verses:')),
                        hadith: this.extractHadith(this.extractSection(sections, 'Related Hadith:'))
                    },
                    reflection_points: this.extractBulletPoints(this.extractSection(sections, 'Reflection Points:'))
                };
            }
        } catch (error) {
            console.error('Error generating emotional dua response:', error);
            throw error;
        }
    }

    private extractSection(sections: string[], header: string): string {
        const section = sections.find(s => s.toLowerCase().includes(header.toLowerCase()));
        if (!section) return '';
        
        // Remove the header and clean up the text
        return section
            .replace(header, '')
            .trim()
            .split('\n')
            .map(line => line.trim())
            .filter(line => line)
            .join('\n');
    }

    private extractBulletPoints(text: string): string[] {
        if (!text) return [];
        return text
            .split('\n')
            .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
            .filter(line => line);
    }

    private extractVerses(text: string): any[] {
        if (!text) return [];
        // Basic regex, might need refinement based on AI output format
        const verseRegex = /•\s*\[(.*?)\]\s*(.*?)\s*(?:Relevance:\s*(.*))?/gi;
        let match;
        const verses = [];
        while ((match = verseRegex.exec(text)) !== null) {
            verses.push({
                reference: match[1]?.trim() || '',
                translation: match[2]?.trim() || '',
                relevance: match[3]?.trim() || ''
            });
        }
        // Fallback if regex fails
        if (verses.length === 0) {
            return text.split('\\n')
                       .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
                       .filter(line => line.includes(':')); // Simple check for verse format
        }
        return verses;
    }

    private extractVerseRefs(verses: any[] | undefined): string[] {
        if (!Array.isArray(verses)) return [];
        return verses.map(v => v?.reference || '').filter(Boolean);
    }

    private formatRelatedReferences(refs: any): string {
        let formatted = '';
        if (refs?.verses?.length) {
            formatted += '**Quranic Verses:**\\n';
            refs.verses.forEach((v: any) => {
                formatted += `• ${v.reference || ''}${v.translation ? ': ' + v.translation : ''}${v.relevance ? '\\n  Relevance: ' + v.relevance : ''}\\n`;
            });
        }
        if (refs?.hadith?.length) {
            formatted += '\\n**Related Hadith:**\\n';
            refs.hadith.forEach((h: any) => {
                formatted += `• ${h.text || ''} (${h.source || ''}, ${h.grade || 'N/A'})${h.relevance ? '\\n  Relevance: ' + h.relevance : ''}\\n`;
            });
        }
        return formatted.trim();
    }

    async generateTafsirResponse(surah: number, verse: number, question: string): Promise<string> {
        // Special case for Bismillah
        const isBasmalah = surah === 1 && verse === 1;
        
        const messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: isBasmalah ? 
                    `You are a knowledgeable Islamic scholar explaining Bismillah ar-Rahman ar-Raheem.
                    CRITICAL: Keep your response EXTREMELY CONCISE and focused.
                    
                    STRICT RULES:
                    1. Response MUST be under 300 words total
                    2. Focus ONLY on:
                       - Core meaning of each name
                       - Essential benefits
                       - Primary ruling
                    3. AVOID:
                       - Detailed linguistic analysis
                       - Multiple scholarly opinions
                       - Extended discussions
                       - Repetitive examples
                    
                    FORMAT:
                    1. One sentence overview
                    2. Brief meaning (2-3 sentences)
                    3. Key benefit (1-2 sentences)
                    4. Main ruling (1 sentence)
                    
                    Keep everything extremely focused and brief.` :
                    `You are a knowledgeable Islamic scholar specializing in tafsir.
                    Provide detailed explanations based on authentic sources including:
                    - Classical tafsir works (Ibn Kathir, Al-Tabari, etc.)
                    - Linguistic analysis when relevant
                    - Historical context
                    - Related verses and hadiths
                    - Practical applications
                    Keep responses focused and relevant to the specific question.`
            },
            {
                role: 'user',
                content: `Regarding Surah ${surah}, Verse ${verse}:
                ${question}`
            }
        ];

        const completion = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages,
            temperature: isBasmalah ? 0.1 : 0.3, // More focused for Basmalah
            max_tokens: isBasmalah ? 300 : 1500, // Much shorter for Basmalah
            frequency_penalty: 1.0,
            presence_penalty: 1.0
        });

        return completion.choices[0]?.message?.content || '';
    }

    private extractDuas(text: string): any[] {
        if (!text) return [];
        const duas = text.split(/\d+\.\s+/).filter(Boolean);
        return duas.map(dua => {
            const lines = dua.split('\n').map(line => line.trim()).filter(Boolean);
            return {
                arabic: lines.find(l => /[\u0600-\u06FF]/.test(l)) || '',
                translation: lines.find(l => !(/[\u0600-\u06FF]/.test(l)) && l.includes('Translation:'))?.replace('Translation:', '').trim() || '',
                reference: lines.find(l => l.includes('Reference:'))?.replace('Reference:', '').trim() || '',
                virtue: lines.find(l => l.includes('Virtue:'))?.replace('Virtue:', '').trim() || ''
            };
        });
    }

    private extractDhikr(text: string): any[] {
        if (!text) return [];
        const dhikr = text.split(/\d+\.\s+/).filter(Boolean);
        return dhikr.map(d => {
            const lines = d.split('\n').map(line => line.trim()).filter(Boolean);
            return {
                phrase: lines.find(l => /[\u0600-\u06FF]/.test(l)) || '',
                translation: lines.find(l => !(/[\u0600-\u06FF]/.test(l)) && l.includes('Translation:'))?.replace('Translation:', '').trim() || '',
                count: lines.find(l => l.includes('Count:'))?.replace('Count:', '').trim() || '',
                timing: lines.find(l => l.includes('Timing:'))?.replace('Timing:', '').trim() || '',
                benefit: lines.find(l => l.includes('Benefit:'))?.replace('Benefit:', '').trim() || ''
            };
        });
    }

    private extractScholarly(text: string): any[] {
        if (!text) return [];
        const guidance = text.split(/\d+\.\s+/).filter(Boolean);
        return guidance.map(g => {
            const lines = g.split('\n').map(line => line.trim()).filter(Boolean);
            return {
                quote: lines[0] || '',
                scholar: lines.find(l => l.includes('Scholar:'))?.replace('Scholar:', '').trim() || '',
                source: lines.find(l => l.includes('Source:'))?.replace('Source:', '').trim() || ''
            };
        });
    }

    private extractRemedies(text: string): any[] {
        if (!text) return [];
        const remedies = text.split(/\d+\.\s+/).filter(Boolean);
        return remedies.map(r => {
            const lines = r.split('\n').map(line => line.trim()).filter(Boolean);
            return {
                practice: lines[0] || '',
                method: lines.find(l => l.includes('Method:'))?.replace('Method:', '').trim() || '',
                benefit: lines.find(l => l.includes('Benefit:'))?.replace('Benefit:', '').trim() || ''
            };
        });
    }

    private extractHadith(text: string): any[] {
        if (!text) return [];
        const hadiths = text.split(/\d+\.\s+/).filter(Boolean);
        return hadiths.map(h => {
            const lines = h.split('\n').map(line => line.trim()).filter(Boolean);
            return {
                text: lines[0] || '',
                source: lines.find(l => l.includes('Source:'))?.replace('Source:', '').trim() || '',
                grade: lines.find(l => l.includes('Grade:'))?.replace('Grade:', '').trim() || '',
                relevance: lines.find(l => l.includes('Relevance:'))?.replace('Relevance:', '').trim() || ''
            };
        });
    }
} 