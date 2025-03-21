import { OpenAI } from 'openai';

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
} 