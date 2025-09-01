import { NoopEnricher } from '../../llm/NoopEnricher';

describe('NoopEnricher', () => {
  test('returns empty array', async () => {
    const enricher = new NoopEnricher();
    const res = await enricher.enrich(['a', 'b'], 'Book');
    expect(res).toEqual([]);
  });
});

