export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adj'
  | 'adv'
  | 'prep'
  | 'pron'
  | 'conj'
  | 'det'
  | 'interj'
  | 'phrase';

export class EnrichedCard {
  constructor(
    public readonly word: string,
    public readonly canonicalAnswer: string,
    public readonly canonicalAnswerAlt: string | null,
    public readonly partOfSpeech: PartOfSpeech,
    public readonly definition: string,
    public readonly exampleSentence: string,
    public readonly sourceTitle: string,
    public readonly hint: string,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date()
  ) {}

  static create(params: {
    word: string;
    canonicalAnswer: string;
    canonicalAnswerAlt?: string | null;
    partOfSpeech: PartOfSpeech;
    definition: string;
    exampleSentence: string;
    sourceTitle: string;
    hint: string;
  }): EnrichedCard {
    return new EnrichedCard(
      params.word.trim(),
      params.canonicalAnswer.trim(),
      (params.canonicalAnswerAlt ?? null)?.trim() || null,
      params.partOfSpeech,
      params.definition.trim(),
      params.exampleSentence.trim(),
      params.sourceTitle.trim(),
      params.hint.trim()
    );
  }

  getKey(): string {
    return `${this.word}:${this.sourceTitle}`;
  }
}

