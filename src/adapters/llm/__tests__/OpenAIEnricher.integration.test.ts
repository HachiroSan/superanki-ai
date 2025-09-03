/*
 Real-network integration test for OpenAIEnricher using an actual API key.
 - Skips unless RUN_LLM_INTEGRATION=1 and OPENAI_API_KEY is set.
 - Uses the base URL from OPENAI_BASE_URL or defaults to OpenAI.
 - Keeps request tiny to minimize cost.
*/

import { OpenAIEnricher } from '../../llm/OpenAIEnricher';
import OpenAI from 'openai';

// Ensure longer timeout for this file specifically
jest.setTimeout(60000);

const shouldRun = process.env.RUN_LLM_INTEGRATION === '1' && !!process.env.OPENAI_API_KEY;

// Only define the suite if explicitly enabled to avoid accidental live calls
(shouldRun ? describe : describe.skip)('OpenAIEnricher (integration)', () => {
  test('enriches a small batch via live API', async () => {
    const apiKey = process.env.OPENAI_API_KEY!;
    const baseUrl = process.env.OPENAI_BASE_URL;
    const model = process.env.LLM_MODEL || 'gpt-5-nano';

    // Create proper OpenAI client
    const client = new OpenAI({
      apiKey,
      ...(baseUrl && { baseURL: baseUrl }),
    });

    const enricher = new OpenAIEnricher(client, model, { temperature: 0.2 });
    const words = ['serendipity'];
    const sourceTitle = 'Integration Test';

    const out = await enricher.enrich(words, sourceTitle);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].word.toLowerCase()).toContain('serendipity');
    expect(out[0].sourceTitle).toBe(sourceTitle);
    // Sanity checks on key fields
    expect(out[0].definition.length).toBeGreaterThan(0);
    expect(out[0].exampleSentence.length).toBeGreaterThan(0);
  });
});
