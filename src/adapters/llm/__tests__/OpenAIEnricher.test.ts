import { OpenAIEnricher } from '../../llm/OpenAIEnricher';
import { EnrichedCard } from '../../../core/entities/EnrichedCard';

describe('OpenAIEnricher', () => {
  test('returns [] when no words provided', async () => {
    const fakeClient = { responses: { create: jest.fn() } } as any;
    const enricher = new OpenAIEnricher(fakeClient, 'test-model');
    const result = await enricher.enrich([], 'Book');
    expect(result).toEqual([]);
    expect(fakeClient.responses.create).not.toHaveBeenCalled();
  });

  test('maps valid JSON result into EnrichedCard[] (output_text)', async () => {
    const payload = {
      items: [
        {
          Word: 'alpha',
          CanonicalAnswer: 'Alpha',
          CanonicalAnswerAlt: null,
          PartOfSpeech: 'noun',
          Definition: 'first letter of Greek alphabet',
          ExampleSentence: 'Alpha starts the sequence.',
          SourceTitle: 'Book A',
          Hint: 'Think Greek',
        },
        {
          Word: 'run',
          CanonicalAnswer: 'run',
          CanonicalAnswerAlt: 'sprint',
          PartOfSpeech: 'verb',
          Definition: 'move swiftly on foot',
          ExampleSentence: 'I run every morning.',
          SourceTitle: 'Book A',
          Hint: 'exercise',
        },
      ],
    };

    const fakeClient = {
      responses: {
        create: jest.fn().mockResolvedValue({ output_text: JSON.stringify(payload) }),
      },
    } as any;

    const enricher = new OpenAIEnricher(fakeClient, 'test-model');
    const result = await enricher.enrich(['alpha', 'run'], 'Book A');

    expect(fakeClient.responses.create).toHaveBeenCalled();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);

    const [a, b] = result as EnrichedCard[];
    expect(a.word).toBe('alpha');
    expect(a.canonicalAnswer).toBe('Alpha');
    expect(a.canonicalAnswerAlt).toBeNull();
    expect(a.partOfSpeech).toBe('noun');
    expect(a.definition).toContain('Greek');
    expect(a.exampleSentence).toContain('Alpha');
    expect(a.sourceTitle).toBe('Book A');
    expect(a.hint).toBe('Think Greek');

    expect(b.word).toBe('run');
    expect(b.canonicalAnswerAlt).toBe('sprint');
    expect(b.partOfSpeech).toBe('verb');
  });

  test('falls back to choices[0].message.content JSON when output_text missing', async () => {
    const payload = {
      items: [
        {
          Word: 'beta',
          CanonicalAnswer: 'Beta',
          CanonicalAnswerAlt: null,
          PartOfSpeech: 'noun',
          Definition: 'second letter',
          ExampleSentence: 'Beta comes after alpha.',
          SourceTitle: 'Book B',
          Hint: 'still Greek',
        },
      ],
    };

    const fakeClient = {
      responses: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify(payload) } }],
        }),
      },
    } as any;

    const enricher = new OpenAIEnricher(fakeClient, 'test-model');
    const result = await enricher.enrich(['beta'], 'Book B');
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe('beta');
  });

  test('filters out invalid/missing fields', async () => {
    const payload = {
      items: [
        {
          // Missing Word
          CanonicalAnswer: 'X',
          CanonicalAnswerAlt: null,
          PartOfSpeech: 'noun',
          Definition: 'x def',
          ExampleSentence: 'x ex',
          SourceTitle: 'Book X',
          Hint: 'x',
        },
        {
          Word: 'keep',
          CanonicalAnswer: 'keep',
          CanonicalAnswerAlt: null,
          PartOfSpeech: 'verb',
          Definition: 'retain',
          ExampleSentence: 'I keep notes.',
          SourceTitle: 'Book X',
          Hint: 'remember',
        },
      ],
    };

    const fakeClient = {
      responses: {
        create: jest.fn().mockResolvedValue({ output_text: JSON.stringify(payload) }),
      },
    } as any;

    const enricher = new OpenAIEnricher(fakeClient, 'test-model');
    const result = await enricher.enrich(['keep'], 'Book X');
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe('keep');
  });
});

