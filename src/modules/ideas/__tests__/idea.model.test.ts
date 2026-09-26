import { Idea } from '../idea.model';

describe('Idea Model Unit Tests', () => {
  const getScoreHook = () => {
    const pres = (Idea.schema as any).s.hooks._pres.get('save');
    const entry = pres.find((p: any) => p.fn.toString().includes('marketDemandScore'));
    return entry.fn;
  };

  test('calculates overallScore in pre-save hook when all 3 scores are present', () => {
    const idea = new Idea({
      userId: '60d0fe4f5311236168a109ca',
      ideaText: 'AI assistant for startup pitches',
      marketDemandScore: 80,
      competitionScore: 70,
      monetizationFeasibilityScore: 90
    });

    const nextFn = jest.fn();
    const hook = getScoreHook();
    hook.call(idea, nextFn);

    expect(idea.overallScore).toBe(80); // (80 + 70 + 90) / 3 = 80
    expect(nextFn).toHaveBeenCalled();
  });

  test('does not calculate overallScore if any score is missing', () => {
    const idea = new Idea({
      userId: '60d0fe4f5311236168a109ca',
      ideaText: 'AI assistant for startup pitches',
      marketDemandScore: 80
    });

    const nextFn = jest.fn();
    const hook = getScoreHook();
    hook.call(idea, nextFn);

    expect(idea.overallScore).toBeUndefined();
    expect(nextFn).toHaveBeenCalled();
  });
});
