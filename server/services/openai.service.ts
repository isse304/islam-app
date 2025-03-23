import OpenAI from 'openai';

export interface ChatCompletionMessageParam {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export class OpenAIService {
    private openai: OpenAI;

    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key is required');
        }

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
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
                        content: "You are a knowledgeable Islamic scholar who provides accurate and respectful information about Islam."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
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
                Analyze the following dua and provide comprehensive insights in this format:
                
                Key Insights:
                [Detailed explanation of the dua's core meaning and significance]
                
                Virtues & Benefits:
                • [List specific virtues with references]
                • [Include both worldly and spiritual benefits]
                • [Mention specific situations when this dua is especially beneficial]
                
                Practical Application:
                • [How to implement this dua in daily life]
                • [Best times and situations to recite it]
                • [Proper method of recitation]
                • [How to maximize its benefits]
                
                Historical Context:
                [Detailed background about when and why this dua was revealed/taught]
                
                Related References:
                • [Relevant Quranic verses with translations]
                • [Related hadith with sources and grades]
                
                Reflection Points:
                • [Deep, thought-provoking questions about the dua's meaning]
                • [Points for personal introspection]
                • [Ways to connect this dua to one's life]
                
                Spiritual Impact:
                • [How this dua transforms one's relationship with Allah]
                • [Emotional and spiritual growth it facilitates]
                • [Long-term benefits of regular recitation]`
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
        const sections = content.split('\n\n');

        return {
            success: true,
            content: content,
            virtues: this.extractSection(sections, 'Virtues & Benefits:'),
            application: this.extractSection(sections, 'Practical Application:'),
            context: this.extractSection(sections, 'Historical Context:'),
            related: this.extractSection(sections, 'Related References:'),
            impact: this.extractSection(sections, 'Spiritual Impact:'),
            explanation: this.extractSection(sections, 'Key Insights:'),
            relatedVerses: this.extractVerses(this.extractSection(sections, 'Related References:')),
            historicalContext: this.extractSection(sections, 'Historical Context:'),
            reflectionPoints: this.extractBulletPoints(this.extractSection(sections, 'Reflection Points:')),
            modernApplication: this.extractSection(sections, 'Practical Application:')
        };
    }

    async generateEmotionalDuaResponse(emotion: string, context: string): Promise<any> {
        const messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: `You are a knowledgeable Islamic scholar specializing in emotional well-being through duas.
                Analyze the emotional state and provide guidance with relevant duas in this format:
                
                Understanding the Emotion:
                [Brief explanation validating the emotion from an Islamic perspective]
                
                Quranic Guidance:
                [Relevant verses about dealing with this emotion]
                
                Prophetic Example:
                [How the Prophet ﷺ dealt with similar emotions]
                
                Recommended Duas:
                [List specific duas with Arabic, translation, and virtues]
                
                Practical Steps:
                • [Immediate spiritual actions]
                • [Long-term emotional management]
                • [Ways to strengthen faith through this emotion]
                
                Related Verses & Hadith:
                • [Relevant Quranic verses with translations]
                • [Related hadith with sources and grades]`
            },
            {
                role: 'user',
                content: `Please provide guidance for someone feeling ${emotion}.
                Context: ${context}`
            }
        ];

        const completion = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages,
            temperature: 0.6,
            max_tokens: 2000
        });

        const content = completion.choices[0]?.message?.content || '';
        const sections = content.split('\n\n');

        return {
            success: true,
            content: content,
            virtues: this.extractSection(sections, 'Recommended Duas:'),
            application: this.extractSection(sections, 'Practical Steps:'),
            context: this.extractSection(sections, 'Understanding the Emotion:'),
            related: this.extractSection(sections, 'Quranic Guidance:'),
            impact: this.extractSection(sections, 'Prophetic Example:'),
            explanation: this.extractSection(sections, 'Understanding the Emotion:'),
            relatedVerses: this.extractVerses(this.extractSection(sections, 'Related Verses & Hadith:')),
            historicalContext: this.extractSection(sections, 'Historical Example:'),
            reflectionPoints: this.extractBulletPoints(this.extractSection(sections, 'Practical Steps:')),
            modernApplication: this.extractSection(sections, 'Practical Steps:')
        };
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

    private extractVerses(text: string): string[] {
        if (!text) return [];
        const verses = text.match(/\[(.*?)\]/g) || [];
        return verses.map(verse => verse.replace(/[\[\]]/g, '').trim());
    }

    async generateTafsirResponse(surah: number, verse: number, question: string): Promise<string> {
        const messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: `You are a knowledgeable Islamic scholar specializing in tafsir.
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
            temperature: 0.3,
            max_tokens: 1500
        });

        return completion.choices[0]?.message?.content || '';
    }
} 