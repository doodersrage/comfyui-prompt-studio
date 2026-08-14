import { llmImageViewHandlers } from '@/lib/llm-image-routes';

const handlers = llmImageViewHandlers('grok');

export const runtime = handlers.runtime;
export const maxDuration = handlers.maxDuration;
export const GET = handlers.GET;
export const POST = handlers.POST;
