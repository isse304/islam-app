"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIService = void 0;
const openai_1 = __importDefault(require("openai"));
class OpenAIService {
    constructor() {
        console.log('\nOpenAI Service Initialization:');
        console.log('1. Current working directory:', process.cwd());
        console.log('2. NODE_ENV:', process.env.NODE_ENV);
        const apiKey = process.env.OPENAI_API_KEY;
        console.log('3. API Key status:', apiKey ? 'Found' : 'Not found');
        console.log('3a. API Key length:', apiKey?.length);
        console.log('3b. First 10 chars:', apiKey?.substring(0, 10));
        if (!apiKey) {
            console.error('4. Error: OPENAI_API_KEY is missing');
            console.log('5. Available environment variables:', Object.keys(process.env).sort());
            throw new Error('Missing OPENAI_API_KEY environment variable');
        }
        console.log('4. API Key validation:');
        console.log('   - Length:', apiKey.length);
        console.log('   - Starts with sk-:', apiKey.startsWith('sk-'));
        console.log('   - First 6 chars:', apiKey.substring(0, 6));
        this.openai = new openai_1.default({
            apiKey: apiKey
        });
        console.log('5. OpenAI client initialized successfully');
    }
    async generateResponse(prompt, temperature = 0.7, maxTokens = 1000) {
        try {
            console.log('\nGenerating OpenAI Response:');
            console.log('1. Prompt:', prompt);
            console.log('2. Parameters:', { temperature, maxTokens });
            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: temperature,
                max_tokens: maxTokens
            });
            console.log('3. Response received');
            console.log('4. Response status:', completion);
            const response = completion.choices[0]?.message?.content;
            if (!response) {
                console.error('5. No response content found in:', completion.choices);
                throw new Error('No response generated from OpenAI');
            }
            console.log('5. Response generated successfully');
            return response;
        }
        catch (error) {
            console.error('OpenAI API error details:', {
                message: error.message,
                status: error.status,
                response: error.response?.data,
                stack: error.stack
            });
            if (error.status === 429) {
                throw new Error('Rate limit exceeded. Please try again later.');
            }
            if (error.status === 401) {
                throw new Error('Invalid API key or unauthorized access.');
            }
            throw new Error('Failed to generate AI response: ' + (error.message || 'Unknown error'));
        }
    }
}
exports.OpenAIService = OpenAIService;
//# sourceMappingURL=openai.service.js.map