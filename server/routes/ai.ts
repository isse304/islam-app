import express from 'express';
import { Router } from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const router = Router();

// For debugging - remove in production
console.log('API Key exists:', !!process.env.OPENAI_API_KEY);
console.log('Environment path:', path.resolve(__dirname, '../../.env'));

// Initialize OpenAI with explicit API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '' // Provide empty string as fallback
});

router.post('/generate', async (req, res) => {
    try {
        console.log('Received request body:', JSON.stringify(req.body, null, 2));

        if (!process.env.OPENAI_API_KEY) {
            console.error('OpenAI API key is missing. Please check your .env file in the root directory.');
            throw new Error('OpenAI API key is not configured');
        }

        // Extract prompt from request body
        const { prompt } = req.body;
        if (!prompt) {
            console.error('Missing prompt in request body');
            throw new Error('Missing prompt in request body');
        }

        const { systemMessage, userMessage, temperature, maxTokens } = prompt;

        if (!systemMessage || !userMessage) {
            console.error('Missing required fields:', { systemMessage, userMessage });
            throw new Error('Missing required fields: systemMessage and userMessage are required');
        }

        console.log('Making OpenAI API request with:', {
            model: "gpt-3.5-turbo",
            temperature: temperature || 0.7,
            maxTokens: maxTokens || 1000
        });

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: userMessage }
            ],
            temperature: temperature || 0.7,
            max_tokens: maxTokens || 1000
        });

        console.log('Received OpenAI response');

        const response = completion.choices[0]?.message?.content || "No response generated";

        res.json({
            content: response
        });
    } catch (error) {
        console.error('Detailed error information:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        
        res.status(500).json({ 
            error: 'Failed to generate AI response',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router; 