import {
  safeJsonParse,
  validateIdea,
  generatePitchDeck,
  generateCanvas,
  generateCompetitorAnalysis,
  simulateInvestorQA,
  generateMarketResearch,
  generateTalkingPoints,
  matchInvestors
} from '../../gemini.client';

jest.mock('@google/generative-ai', () => {
  const mockGen = jest.fn();
  (global as any).__mockGenerateContent = mockGen;
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockImplementation(() => ({
        generateContent: (...args: any[]) => (global as any).__mockGenerateContent(...args)
      }))
    }))
  };
});

const mockGenerateContent = (global as any).__mockGenerateContent;

describe('Gemini Client Integration Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('safeJsonParse', () => {
    test('should parse standard clean JSON', () => {
      const input = '{"key": "value", "num": 42}';
      const output = safeJsonParse(input);
      expect(output).toEqual({ key: 'value', num: 42 });
    });

    test('should strip markdown code fences', () => {
      const input = '```json\n{"status": "ok"}\n```';
      const output = safeJsonParse(input);
      expect(output).toEqual({ status: 'ok' });
    });

    test('should extract JSON object when surrounded by conversational text', () => {
      const input = 'Here is the response you requested:\n{"analysis": "good"}\nHope this helps!';
      const output = safeJsonParse(input);
      expect(output).toEqual({ analysis: 'good' });
    });

    test('should normalize smart single and double quotes', () => {
      const input = '{\u201Ctitle\u201D: \u201CFounder\u2019s Choice\u201D}';
      const output = safeJsonParse(input);
      expect(output).toEqual({ title: "Founder's Choice" });
    });

    test('should strip trailing commas before closing braces', () => {
      const input = '{"a": 1, "b": [2, 3,],}';
      const output = safeJsonParse(input);
      expect(output).toEqual({ a: 1, b: [2, 3] });
    });

    test('should throw error when no valid JSON object braces are found', () => {
      const input = 'Just regular text without any curly braces';
      expect(() => safeJsonParse(input)).toThrow('Invalid JSON returned from Gemini');
    });

    test('should throw error when JSON is malformed and cannot be parsed', () => {
      const input = '{"broken": }';
      expect(() => safeJsonParse(input)).toThrow('Invalid JSON returned from Gemini');
    });
  });

  describe('validateIdea', () => {
    test('should return validated idea structure on successful AI response', async () => {
      const validPayload = {
        marketDemand: { score: 85, text: 'High market demand' },
        competition: { score: 70, text: 'Moderate competition' },
        monetization: { score: 80, text: 'Good margins' },
        overall: { score: 78, text: 'Viable startup' }
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(validPayload)
        }
      });

      const result = await validateIdea('A SaaS platform for indie hackers');

      expect(result.marketDemandScore).toBe(85);
      expect(result.competitionScore).toBe(70);
      expect(result.monetizationFeasibilityScore).toBe(80);
      expect(result.overallScore).toBe(78);
      expect(result.analysis.marketDemand.text).toBe('High market demand');
    });

    test('should throw error if required field is missing in AI response', async () => {
      const incompletePayload = {
        marketDemand: { score: 85, text: 'High market demand' }
        // missing competition, monetization, overall
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(incompletePayload)
        }
      });

      await expect(validateIdea('A SaaS idea')).rejects.toThrow('Failed to validate idea with AI');
    });

    test('should throw error if AI call rejects or times out', async () => {
      mockGenerateContent.mockRejectedValue(new Error('AI API unavailable'));

      await expect(validateIdea('A SaaS idea')).rejects.toThrow('Failed to validate idea with AI');
    });
  });

  describe('generatePitchDeck', () => {
    test('should return pitch deck object with all sections formatted', async () => {
      const deckPayload = {
        problem: 'Big pain point',
        solution: 'Smart solution',
        marketSize: 'TAM: $10B',
        businessModel: 'Subscription',
        competitors: 'Incumbents',
        goToMarket: 'Content marketing',
        team: ['CEO', 'CTO'],
        financials: 'Profitable year 2',
        milestones: 'Beta launch in 3 months',
        askAndUse: 'Raising $1M'
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(deckPayload)
        }
      });

      const result = await generatePitchDeck('My idea', {});

      expect(result.problem).toBe('Big pain point');
      // team was an array, should be joined with \n\n
      expect(result.team).toBe('CEO\n\nCTO');
      expect(result.askAndUse).toBe('Raising $1M');
    });

    test('should throw error if required section is missing', async () => {
      const incompleteDeck = {
        problem: 'Problem text'
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(incompleteDeck)
        }
      });

      await expect(generatePitchDeck('My idea', {})).rejects.toThrow('Failed to generate pitch deck with AI');
    });
  });

  describe('generateCanvas', () => {
    test('should return canvas object with 9 lean building blocks', async () => {
      const canvasPayload = {
        problem: 'Customer problem',
        solution: 'Our solution',
        keyMetrics: 'Retention',
        uniqueValueProposition: '10x faster',
        channels: 'Direct sales',
        customerSegments: 'SMBs',
        costStructure: ['Servers', 'Salaries'],
        revenueStreams: 'SaaS fee',
        unfairAdvantage: 'Proprietary IP'
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(canvasPayload)
        }
      });

      const result = await generateCanvas('Idea text', {});

      expect(result.problem).toBe('Customer problem');
      expect(result.costStructure).toBe('Servers\n\nSalaries');
      expect(result.unfairAdvantage).toBe('Proprietary IP');
    });

    test('should throw error if canvas section is missing', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ problem: 'Only problem' })
        }
      });

      await expect(generateCanvas('Idea text', {})).rejects.toThrow('Failed to generate business model canvas with AI');
    });
  });

  describe('generateCompetitorAnalysis', () => {
    test('should return competitors array and summary', async () => {
      const compPayload = {
        competitors: [
          {
            name: 'Competitor A',
            description: 'Leading provider',
            swot: { strengths: ['Brand'], weaknesses: ['Price'], opportunities: ['New markets'], threats: ['Startups'] }
          }
        ],
        summary: 'Market is moderately competitive'
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(compPayload)
        }
      });

      const result = await generateCompetitorAnalysis('Idea text');

      expect(result.competitors).toHaveLength(1);
      expect(result.summary).toBe('Market is moderately competitive');
    });

    test('should throw error if competitors is not an array or summary is missing', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ competitors: 'not an array' })
        }
      });

      await expect(generateCompetitorAnalysis('Idea text')).rejects.toThrow('Failed to analyze competitors');
    });
  });

  describe('simulateInvestorQA', () => {
    test('should generate questions when question and answer are null', async () => {
      const questionsPayload = {
        questions: [
          { id: '1', question: 'What is your CAC?', category: 'Revenue' }
        ]
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(questionsPayload)
        }
      });

      const result = await simulateInvestorQA('Pitch presentation text');

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].question).toBe('What is your CAC?');
    });

    test('should evaluate answer when question and answer are provided', async () => {
      const feedbackPayload = {
        feedback: {
          rating: 4,
          strengths: ['Clear answer'],
          improvements: ['Add numbers'],
          additionalAdvice: 'Keep it brief'
        }
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(feedbackPayload)
        }
      });

      const result = await simulateInvestorQA('Pitch', 'What is CAC?', '$50 per customer');

      expect(result.feedback.rating).toBe(4);
      expect(result.feedback.strengths).toContain('Clear answer');
    });
  });

  describe('generateMarketResearch', () => {
    test('should return comprehensive market data with TAM SAM SOM', async () => {
      const marketPayload = {
        tam: { value: 1000000000, description: 'Total market', sources: ['Gartner'] },
        sam: { value: 100000000, description: 'Serviceable market', methodology: 'Bottom-up' },
        som: { value: 10000000, description: 'Obtainable market', timeline: '3 years' },
        trends: [{ keyword: 'AI', interest: 90, growth: '25% YoY' }],
        personas: [{ name: 'Persona 1' }],
        competitorActivity: [{ name: 'Incumbent' }]
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(marketPayload)
        }
      });

      const result = await generateMarketResearch('Idea', 'Tech', 'US');

      expect(result.tam.value).toBe(1000000000);
      expect(result.sam.value).toBe(100000000);
      expect(result.som.value).toBe(10000000);
      expect(result.trends).toHaveLength(1);
    });

    test('should throw error if required research field is missing', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ tam: { value: 1000 } })
        }
      });

      await expect(generateMarketResearch('Idea', 'Tech', 'US')).rejects.toThrow('Failed to generate market research with AI');
    });
  });

  describe('generateTalkingPoints', () => {
    test('should return array of talking points for a slide', async () => {
      const pointsPayload = {
        talkingPoints: [
          'Highlight problem magnitude',
          'Mention customer quotes',
          'Transition to solution'
        ]
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(pointsPayload)
        }
      });

      const result = await generateTalkingPoints('Slide content', 'Problem Slide');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('Highlight problem magnitude');
    });

    test('should throw error if talkingPoints is not an array', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ talkingPoints: 'not an array' })
        }
      });

      await expect(generateTalkingPoints('Slide content', 'Slide')).rejects.toThrow('Failed to generate talking points');
    });
  });

  describe('matchInvestors', () => {
    test('should return matches array based on criteria', async () => {
      const matchPayload = {
        matches: [
          {
            name: 'Sequoia Capital',
            type: 'VC',
            matchScore: 92,
            matchReasons: ['Strong SaaS portfolio']
          }
        ]
      };

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(matchPayload)
        }
      });

      const result = await matchInvestors({
        industry: 'Fintech',
        stage: 'Seed',
        fundingAmount: '$500k',
        location: 'US',
        businessModel: 'B2B'
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Sequoia Capital');
      expect(result[0].matchScore).toBe(92);
    });

    test('should throw error if matches is not an array', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ matches: 'not array' })
        }
      });

      await expect(matchInvestors({} as any)).rejects.toThrow('Failed to match investors');
    });
  });
});
