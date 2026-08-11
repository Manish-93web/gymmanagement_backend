import OpenAI from 'openai';
import { config } from './config';

const useOpenRouter = config.ai.provider === 'openrouter';
const apiKey = useOpenRouter ? config.openrouter.apiKey : config.openai.apiKey;

// Shared OpenAI-compatible client — routes through OpenRouter when AI_PROVIDER=openrouter
// (the default), falling back to a direct OpenAI key otherwise. Every AI-calling module
// should import this instead of constructing its own client off OPENAI_API_KEY alone,
// which silently disables AI features whenever only an OpenRouter key is configured.
export const aiClient: OpenAI | null = apiKey
    ? new OpenAI({
        apiKey,
        ...(useOpenRouter ? {
            baseURL: config.openrouter.baseUrl,
            defaultHeaders: {
                'HTTP-Referer': config.frontendUrl,
                'X-Title': 'GymManagement AI',
            },
        } : {}),
    })
    : null;

export const aiModel: string = useOpenRouter ? config.openrouter.model : config.openai.model;
