// Minimal OpenAI-based LLMEnricher implementation.
// Note: Requires `openai` package and OPENAI_API_KEY at runtime.

import { LLMEnricher } from '../../core/services/LLMEnricher';
import { EnrichedCard, PartOfSpeech } from '../../core/entities/EnrichedCard';
import { buildSystemPrompt, buildUserPrompt } from './prompts';

type OpenAIClient = any; // kept loose to avoid hard dependency in type-check

export class OpenAIEnricher implements LLMEnricher {
  constructor(
    private client: OpenAIClient,
    private model: string,
    private options: { temperature?: number; seed?: number } = {}
  ) {}

  private getSchema() {
    return {
      name: 'enriched_cards_schema',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          items: {
            type: 'array',
            minItems: 1,
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
      },
      strict: true,
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

    // Dynamic import to avoid compile-time hard dependency if not used
    let openai = this.client;
    if (!openai) {
      const mod = await import('openai');
      openai = new mod.default();
    }

    const system = buildSystemPrompt();
    const user = buildUserPrompt(sourceTitle, words);

    const jsonSchema = this.getSchema();

    const res = await openai.responses.create({
      model: this.model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: jsonSchema },
      temperature: this.options.temperature ?? 0.2,
      seed: this.options.seed ?? 7,
      max_output_tokens: 200 + 80 * words.length,
    });

    // Extract JSON
    const text = (res as any).output_text ?? (res as any).choices?.[0]?.message?.content ?? '';
    if (!text) return [];

    const parsed = this.tryParseJson(String(text));
    if (!parsed || !Array.isArray(parsed.items)) return [];

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
}
