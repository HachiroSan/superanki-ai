/*
 Real-network integration test for OpenAIEnricher using an actual API key.
 - Skips unless RUN_LLM_INTEGRATION=1 and OPENAI_API_KEY is set.
 - Uses the base URL from OPENAI_BASE_URL (works with OpenRouter).
 - Keeps request tiny to minimize cost.
*/

import { OpenAIEnricher } from '../../llm/OpenAIEnricher';

const shouldRun = process.env.RUN_LLM_INTEGRATION === '1' && !!process.env.OPENAI_API_KEY;

// Only define the suite if explicitly enabled to avoid accidental live calls
(shouldRun ? describe : describe.skip)('OpenAIEnricher (integration)', () => {
  beforeAll(() => {
    // Allow more time for network + model latency
    jest.setTimeout(60000);
  });

  test('enriches a small batch via live API', async () => {
    const apiKey = process.env.OPENAI_API_KEY!;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.LLM_MODEL || (baseUrl.includes('openrouter') ? 'openai/gpt-4o-mini' : 'gpt-4o-mini');

    // Minimal client that matches the shape used by OpenAIEnricher
    const client = {
      responses: {
        create: async (body: any) => {
          const headers: Record<string, string> = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          };
          // OpenRouter attribution headers (optional)
          if (process.env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
          if (process.env.OPENROUTER_APP_NAME) headers['X-Title'] = process.env.OPENROUTER_APP_NAME;

          const base = baseUrl.replace(/\/$/, '');
          const isOpenRouter = /openrouter/i.test(base);

          if (!isOpenRouter) {
            // Use Responses API on OpenAI endpoints
            const res = await fetch(`${base}/responses`, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(`HTTP ${res.status}: ${text}`);
            }
            return res.json();
          }

          // Fallback to Chat Completions on OpenRouter (no Responses API)
          const messages = Array.isArray(body.input)
            ? body.input.map((m: any) => ({ role: m.role, content: String(m.content) }))
            : [];
          const chatBody: any = {
            model: body.model,
            messages,
            temperature: body.temperature,
            max_tokens: body.max_output_tokens,
          };
          const res = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(chatBody),
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
          }
          return res.json();
        },
      },
    } as any;

    const enricher = new OpenAIEnricher(client, model, { temperature: 0.2, seed: 7 });
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
