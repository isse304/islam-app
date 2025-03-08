"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIService = void 0;
const openai_1 = __importDefault(require("openai"));
class OpenAIService {
    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('Missing OPENAI_API_KEY environment variable');
        }
        this.openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    async generateResponse(prompt) {
        try {
            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 1000
            });
            const response = completion.choices[0]?.message?.content;
            if (!response) {
                throw new Error('No response generated from OpenAI');
            }
            return response;
        }
        catch (error) {
            console.error('OpenAI API error:', error);
            // Handle specific OpenAI error cases
            if (error.status === 429) {
                throw new Error('Rate limit exceeded. Please try again later.');
            }
            throw new Error('Failed to generate AI response: ' + (error.message || 'Unknown error'));
        }
    }
}
exports.OpenAIService = OpenAIService;
