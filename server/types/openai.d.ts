export interface ChatCompletionMessageParam {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OpenAIResponse {
    choices: Array<{
        message?: {
            content: string;
        };
    }>;
} 