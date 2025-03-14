import OpenAI from 'openai';

export class OpenAIService {
    private openai: OpenAI;
    private isDevelopment: boolean;
    private mockMode: boolean = false;

    constructor() {
        console.log('\nOpenAI Service Initialization:');
        console.log('1. Current working directory:', process.cwd());
        
        this.isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        console.log('2. NODE_ENV:', process.env.NODE_ENV, `(Development mode: ${this.isDevelopment})`);
        
        const apiKey = process.env.OPENAI_API_KEY;
        console.log('3. API Key status:', apiKey ? 'Found' : 'Not found');
        
        // Check if we have an API key
        if (!apiKey) {
            if (this.isDevelopment) {
                console.warn('⚠️ Running in MOCK MODE: Using mock responses for OpenAI in development');
                this.mockMode = true;
                // Create a minimal client with a fake key since we'll use mock responses
                this.openai = new OpenAI({ apiKey: 'sk-mock-key-for-development' });
                return;
            } else {
                console.error('4. Error: OPENAI_API_KEY is missing and not in development mode');
                throw new Error('Missing OPENAI_API_KEY environment variable');
            }
        }
        
        // Check if the API key is a placeholder
        if (apiKey.includes('placeholder')) {
            if (this.isDevelopment) {
                console.warn('⚠️ Running in MOCK MODE: Using placeholder API key in development');
                this.mockMode = true;
                this.openai = new OpenAI({ apiKey });
                return;
            } else {
                console.error('4. Error: Using placeholder API key in production');
                throw new Error('Cannot use placeholder OPENAI_API_KEY in production');
            }
        }
        
        console.log('4. API Key validation:');
        console.log('   - Length:', apiKey.length);
        console.log('   - Starts with sk-:', apiKey.startsWith('sk-'));
        
        // Initialize real OpenAI client
        this.openai = new OpenAI({ apiKey });
        console.log('5. OpenAI client initialized successfully');
    }

    async generateResponse(prompt: string, temperature: number = 0.7, maxTokens: number = 1000): Promise<string> {
        try {
            console.log('\nGenerating OpenAI Response:');
            console.log('1. Prompt:', prompt);
            console.log('2. Parameters:', { temperature, maxTokens });
            
            // If in mock mode, return a mock response
            if (this.mockMode) {
                console.log('3. Using MOCK response (development mode)');
                return this.getMockResponse(prompt);
            }
            
            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "You are a helpful Islamic assistant." },
                    { role: "user", content: prompt }
                ],
                temperature,
                max_tokens: maxTokens
            });
            
            const response = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
            
            console.log('3. Response received from OpenAI.');
            return response;
        } catch (error) {
            console.error('OpenAI API Error:', error);
            throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    // Helper method to generate mock responses in development mode
    private getMockResponse(prompt: string): string {
        // Generate different mock responses based on the prompt content
        const promptLower = prompt.toLowerCase();
        
        if (promptLower.includes('quran') || promptLower.includes('verse')) {
            return "This is a mock response about the Quran. The Holy Quran is the central religious text of Islam, believed by Muslims to be a revelation from Allah. It is widely regarded as the finest work in classical Arabic literature.";
        }
        
        if (promptLower.includes('hadith')) {
            return "This is a mock response about Hadith. Hadith are records of the words, actions, and silent approvals of the Prophet Muhammad. Hadith literature is rich and complex, with various collections having different levels of authentication.";
        }
        
        if (promptLower.includes('prayer') || promptLower.includes('salah')) {
            return "This is a mock response about prayer (Salah). Prayer is one of the Five Pillars of Islam. Muslims pray five times a day: Fajr, Dhuhr, Asr, Maghrib, and Isha.";
        }
        
        if (promptLower.includes('ramadan') || promptLower.includes('fasting')) {
            return "This is a mock response about Ramadan. Ramadan is the ninth month of the Islamic calendar and is observed by Muslims worldwide as a month of fasting, prayer, reflection, and community.";
        }
        
        // Default mock response
        return "This is a mock response from the OpenAI service in development mode. In production, this would be a real response from the OpenAI API based on your prompt: \"" + prompt + "\"";
    }
} 