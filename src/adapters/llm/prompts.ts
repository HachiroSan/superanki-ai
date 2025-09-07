// Centralized prompt templates for LLM enrichment

export function buildSystemPrompt(): string {
  return [
    'You generate compact Anki card fields in English.',
    'Return strictly valid JSON matching the provided schema.',
    'Keep outputs short, clean, and accurate.',
    'Rules:',
    '- CanonicalAnswer and Definition: one short sentence each.',
    "- Definition must NOT include the target Word (or its inflections/derivations); use synonyms or a descriptive paraphrase instead.",
    '- partOfSpeech: noun|verb|adj|adv|prep|pron|conj|det|interj|phrase (lowercase).',
    "- ExampleSentence: simple, natural English; don't quote the book directly.",
    "- ExampleSentence may optionally be lightly grounded in the world/topic suggested by SourceTitle (generic, spoiler-free, no direct quotations).",
    "- Hint: brief mnemonic; cloze the word if helpful (e.g., 's____a').",
  ].join(' ');
}

export function buildUserPrompt(sourceTitle: string, words: string[]): string {
  return [
    `SourceTitle: "${sourceTitle}".`,
    `Words: ${JSON.stringify(words)}.`,
    'Return an object { "items": [...] } strictly matching the schema.',
    'You may use the SourceTitle as optional context when crafting ExampleSentence, but keep it generic and self-contained.',
  ].join(' ');
}
