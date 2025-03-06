"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const router = (0, express_1.Router)();
// For debugging - remove in production
console.log('API Key exists:', !!process.env.OPENAI_API_KEY);
// Initialize OpenAI with explicit API key
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY || '' // Provide empty string as fallback
});
router.post('/generate', async (req, res) => {
    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key is not configured');
        }
        const { systemMessage, userMessage, temperature, maxTokens } = req.body.prompt;
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: userMessage }
            ],
            temperature: temperature || 0.7,
            max_tokens: maxTokens || 1000
        });
        const response = completion.choices[0]?.message?.content || "No response generated";
        res.json({
            content: response
        });
    }
    catch (error) {
        console.error('Error generating AI response:', error);
        res.status(500).json({ error: 'Failed to generate AI response' });
    }
});
exports.default = router;
