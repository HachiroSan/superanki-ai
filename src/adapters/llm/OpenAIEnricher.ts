// OpenAI-based LLMEnricher implementation using latest OpenAI API.
// Note: Requires `openai` package and OPENAI_API_KEY at runtime.

import { LLMEnricher } from '../../core/services/LLMEnricher';
import { EnrichedCard, PartOfSpeech } from '../../core/entities/EnrichedCard';
import { buildSystemPrompt, buildUserPrompt } from './prompts';
import { Logger } from '../../core/services/Logger';
import OpenAI from 'openai';

export class OpenAIEnricher implements LLMEnricher {
  constructor(
    private client: InstanceType<typeof OpenAI>,
    private model: string,
    private logger: Logger,
    private options: { temperature?: number } = {}
  ) {}

  private isTemperatureSupported(): boolean {
    // Some models in Responses API don't support temperature parameter
    // For now, we'll be conservative and only use temperature with known compatible models
    const temperatureSupportedModels = [
      'gpt-4o',
      'gpt-4o-2024-08-06',
      'gpt-4-turbo',
      'gpt-4-turbo-2024-04-09',
    ];
    
    return temperatureSupportedModels.some(model => this.model.includes(model));
  }

  private getSchema() {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              Word: { type: 'string' },
              CanonicalAnswer: { type: 'string' },
              CanonicalAnswerAlt: { type: ['string', 'null'] },
              PartOfSpeech: {
                type: 'string',
                enum: ['noun', 'verb', 'adj', 'adv', 'prep', 'pron', 'conj', 'det', 'interj', 'phrase'],
              },
              Definition: { type: 'string' },
              ExampleSentence: { type: 'string' },
              SourceTitle: { type: 'string' },
              Hint: { type: 'string' },
            },
            required: [
              'Word',
              'CanonicalAnswer',
              'CanonicalAnswerAlt',
              'PartOfSpeech',
              'Definition',
              'ExampleSentence',
              'SourceTitle',
              'Hint',
            ],
          },
        },
      },
      required: ['items'],
    } as const;
  }

  private tryParseJson(text: string): any | null {
    // Direct parse first
    try {
      return JSON.parse(text);
    } catch {}

    // Strip Markdown code fences ```json ... ``` or ``` ... ```
    const fenceMatch = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
    if (fenceMatch && fenceMatch[1]) {
      const inner = fenceMatch[1].trim();
      try {
        return JSON.parse(inner);
      } catch {}
    }

    // Fallback: extract from first { to last }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const slice = text.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {}
    }

    return null;
  }

  async enrich(words: string[], sourceTitle: string): Promise<EnrichedCard[]> {
    if (words.length === 0) return [];

    try {
      this.logger.info(`Starting enrichment for ${words.length} words from source: "${sourceTitle}"`);
      
      // Dynamic import to avoid compile-time hard dependency if not used
      let openai = this.client;
      if (!openai) {
        const mod = await import('openai');
        openai = new mod.default();
      }

      const system = buildSystemPrompt();
      const user = buildUserPrompt(sourceTitle, words);

      const jsonSchema = this.getSchema();
      // Helper to parse structured output from Responses API payload
      const tryParseFromResponse = (res: any): any | null => {
        const output = res?.output?.[0];
        if (output?.content) {
          const structuredOutput = output.content.find((c: any) => c?.type === 'output_text');
          if (structuredOutput?.text) {
            const parsed = this.tryParseJson(structuredOutput.text);
            if (parsed) return parsed;
          }
        }
        if (res && (res as any).output_text) {
          const parsed = this.tryParseJson((res as any).output_text);
          if (parsed) return parsed;
        }
        return null;
      };

      // Be generous with output budget; retry once if truncated
      let maxTokens = Math.max(4096, 1000 + 200 * words.length);
      const maxCap = 16384;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        this.logger.info(`Making OpenAI API request (attempt ${attempt + 1}/2)...`);
        this.logger.debug(`Model: ${this.model}, Words: ${words.length}, Max tokens: ${maxTokens}`);
        this.logger.debug(`Request payload preview: ${user.substring(0, 200)}...`);
        
        const startTime = Date.now();
        
        // Add timeout wrapper
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('OpenAI API request timed out after 60 seconds')), 60000);
        });
        
        const apiPromise = openai.responses.create({
          model: this.model,
          input: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'enriched_cards_schema',
              schema: jsonSchema,
              strict: true,
            },
          },
          ...(this.options.temperature != null && this.isTemperatureSupported() ? { temperature: this.options.temperature } : {}),
          max_output_tokens: maxTokens,
        });
        
        const res = await Promise.race([apiPromise, timeoutPromise]) as any;
        
        const duration = Date.now() - startTime;
        this.logger.info(`OpenAI API response received in ${duration}ms`);
        this.logger.debug(`Response status: ${res.status}`);
        this.logger.debug(`Response usage: ${JSON.stringify(res.usage || {})}`);

        // Check for refusals
        const output = res.output?.[0];
        if (output?.content?.[0]?.type === 'refusal') {
          throw new Error(`Model refused to respond: ${output.content[0].refusal}`);
        }

        // Try to parse whatever we have (even if status is incomplete)
        let parsed = tryParseFromResponse(res);

        // If incomplete due to token limit and we couldn't parse, consider retrying
        const isTruncated = res.status === 'incomplete' && res.incomplete_details?.reason === 'max_output_tokens';
        if ((!parsed || !Array.isArray(parsed.items)) && isTruncated) {
          // If we have another attempt, increase budget and retry
          if (attempt === 0 && maxTokens < maxCap) {
            maxTokens = Math.min(maxCap, Math.ceil(maxTokens * 2));
            lastError = new Error('Response incomplete due to max output tokens limit');
            continue;
          }
          // No more retries; throw with the same message tests expect
          throw new Error('Response incomplete due to max output tokens limit');
        }

        if (!parsed || !Array.isArray(parsed.items)) {
          this.logger.warn('Failed to parse structured output from OpenAI response');
          return [];
        }

        // Map and normalize
        const out: EnrichedCard[] = [];
        for (const item of parsed.items) {
          const word = String(item.Word || '').trim();
          const pos = String(item.PartOfSpeech || '').trim() as PartOfSpeech;
          const def = String(item.Definition || '').trim();
          const can = String(item.CanonicalAnswer || '').trim();
          const alt = item.CanonicalAnswerAlt == null ? null : String(item.CanonicalAnswerAlt).trim();
          const ex = String(item.ExampleSentence || '').trim();
          const src = String(item.SourceTitle || '').trim();
          const hint = String(item.Hint || '').trim();

          if (!word || !src || !pos || !def || !can || !ex || !hint) continue;

          out.push(
            EnrichedCard.create({
              word,
              canonicalAnswer: can,
              canonicalAnswerAlt: alt || null,
              partOfSpeech: pos,
              definition: def,
              exampleSentence: ex,
              sourceTitle: src,
              hint,
            })
          );
        }

        return out;
      }

      // Should be unreachable; rethrow lastError if present
      if (lastError) throw lastError;
      return [];
    } catch (error) {
      this.logger.error(`Error enriching ${words.length} words from source "${sourceTitle}":`, error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          this.logger.error('Request timed out - this might be due to network issues or OpenAI API being slow');
        } else if (error.message.includes('API key')) {
          this.logger.error('Invalid or missing OpenAI API key');
        } else if (error.message.includes('quota')) {
          this.logger.error('OpenAI API quota exceeded');
        } else if (error.message.includes('rate limit')) {
          this.logger.error('OpenAI API rate limit exceeded - consider reducing concurrency');
        }
      }
      
      throw error;
    }
  }
}
