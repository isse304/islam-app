process.env.OPENAI_API_KEY = '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';

import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = 'gpt-4-turbo-preview';
const BATCH_SIZE = 3; // Number of duas to process in parallel
const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds delay between batches

// Paths
const DUAS_PATH = join(__dirname, '../data/duas.json');
const INSIGHTS_PATH = join(__dirname, '../data/dua-insights.json');

async function generateInsightForDua(dua) {
    console.log(`Generating insights for dua: ${dua.title}`);
    
    const prompt = {
        role: 'system',
        content: `You are a knowledgeable Islamic scholar tasked with providing deep insights about duas (Islamic supplications). 
        Analyze the following dua and provide comprehensive insights in a structured format.
        
        IMPORTANT: Return ONLY the JSON object without any markdown formatting or code blocks.`
    };

    const userMessage = {
        role: 'user',
        content: `Please analyze this dua and provide insights:
        Title: ${dua.title}
        Arabic: ${dua.arabic}
        Translation: ${dua.translation}
        Reference: ${dua.reference}
        Category: ${dua.category}
        Time: ${dua.time || 'Any time'}
        
        Please provide a detailed analysis covering:
        1. The deeper meaning and significance
        2. The virtues and benefits
        3. The practical application in daily life
        4. Historical context
        5. Spiritual advice including:
           - Understanding from Islamic perspective (min 150 words)
           - Recommended complementary duas (at least 3, with Arabic, translation, reference)
           - Beneficial dhikr (at least 3, with count, timing, benefits)
           - Scholarly guidance (at least 3 quotes with scholar names)
           - Spiritual remedies (at least 3 practices with methods and benefits)
        6. Reflection points for contemplation
        
        Return ONLY the JSON object with these keys (no markdown or code blocks):
        {
            "content": "main insights",
            "virtues": ["list of virtues"],
            "application": ["practical steps"],
            "historical_context": "detailed context",
            "spiritual_advice": {
                "understanding": "detailed explanation",
                "duas": [{"arabic": "", "translation": "", "reference": "", "virtue": ""}],
                "dhikr": [{"phrase": "", "translation": "", "count": "", "timing": "", "benefit": ""}],
                "scholarly_guidance": [{"quote": "", "scholar": "", "source": ""}],
                "spiritual_remedies": [{"practice": "", "method": "", "benefit": ""}]
            },
            "reflection_points": ["points for contemplation"]
        }`
    };

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [prompt, userMessage],
                temperature: 0.7,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.statusText}`);
        }

        const data = await response.json();
        let content = data.choices[0].message.content;
        
        // Clean up the response by removing any markdown code blocks
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        
        // Remove any leading/trailing whitespace
        content = content.trim();
        
        // Parse the cleaned JSON
        const insights = JSON.parse(content);
        
        return {
            duaId: dua.id,
            duaTitle: dua.title,
            category: dua.category,
            ...insights
        };

    } catch (error) {
        console.error(`Error generating insights for ${dua.title}:`, error);
        if (error instanceof SyntaxError) {
            console.error('Raw response:', data.choices[0].message.content);
        }
        return null;
    }
}

async function processDuasInBatches(duas) {
    const insights = [];
    
    for (let i = 0; i < duas.length; i += BATCH_SIZE) {
        const batch = duas.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(duas.length/BATCH_SIZE)}`);
        
        const batchPromises = batch.map(dua => generateInsightForDua(dua));
        const batchResults = await Promise.all(batchPromises);
        
        insights.push(...batchResults.filter(result => result !== null));
        
        if (i + BATCH_SIZE < duas.length) {
            console.log(`Waiting ${DELAY_BETWEEN_BATCHES/1000} seconds before next batch...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
    }
    
    return insights;
}

async function main() {
    try {
        // Read duas
        const duasData = await fs.readFile(DUAS_PATH, 'utf8');
        const duasJson = JSON.parse(duasData);
        
        // Flatten duas from all categories
        const allDuas = Object.values(duasJson).flat();
        console.log(`Found ${allDuas.length} duas to process`);
        
        // Generate insights
        const insights = await processDuasInBatches(allDuas);
        
        // Save insights
        await fs.writeFile(INSIGHTS_PATH, JSON.stringify(insights, null, 2));
        console.log(`Successfully generated and saved insights for ${insights.length} duas`);
        
    } catch (error) {
        console.error('Error in main process:', error);
    }
}

// Check for API key
if (!OPENAI_API_KEY) {
    console.error('Please set the OPENAI_API_KEY environment variable');
    process.exit(1);
}

main(); 