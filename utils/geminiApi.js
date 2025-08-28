const { GoogleGenerativeAI } = require('@google/generative-ai');
const JSON5 = require('json5');

// Initialize the Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

function safeJsonParse(text) {
  try {
    let cleaned = text.replace(/```json|```/g, "").trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) throw new Error("No valid JSON object found");

    cleaned = cleaned.slice(firstBrace, lastBrace + 1);

    try {
      return JSON.parse(cleaned); // try strict JSON first
    } catch {
      return JSON5.parse(cleaned); // fallback for ' and trailing commas
    }
  } catch (err) {
    console.error("❌ JSON parse failed:", err.message);
    console.error("⚠️ Raw snippet:", text.slice(0, 500));
    throw new Error("Invalid JSON returned from Gemini");
  }
}

// Function to validate an idea
const validateIdea = async (ideaText) => {
  try {
    const prompt = `
You are an expert startup advisor and venture capitalist. Analyze this startup idea comprehensively:

STARTUP IDEA: "${ideaText}"

Provide a detailed analysis covering:

1. MARKET DEMAND (0-100): Assess market size, customer pain points, willingness to pay, and growth potential
2. COMPETITION (0-100): Evaluate competitive landscape, market saturation, and barriers to entry  
3. MONETIZATION (0-100): Analyze revenue potential, business model viability, and scalability

For each category, provide:
- A numerical score (0-100)
- A detailed 2-3 sentence analysis explaining your reasoning

Calculate an overall score as the average of the three categories.

CRITICAL: Return ONLY a valid JSON object with this exact structure:

{
  "marketDemand": {
    "score": 85,
    "text": "Your detailed analysis here explaining market demand factors."
  },
  "competition": {
    "score": 70,
    "text": "Your detailed analysis here explaining competitive landscape."
  },
  "monetization": {
    "score": 75,
    "text": "Your detailed analysis here explaining monetization potential."
  },
  "overall": {
    "score": 77,
    "text": "Your overall assessment and recommendation."
  }
}

Return only the JSON object. No markdown, no explanations, no additional text.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();
    
    // Parse the JSON data using safe parser
    const analysisData = safeJsonParse(textResponse);
    
    // Validate required structure
    const requiredFields = ['marketDemand', 'competition', 'monetization', 'overall'];
    for (const field of requiredFields) {
      if (!analysisData[field] || typeof analysisData[field].score !== 'number' || !analysisData[field].text) {
        throw new Error(`Invalid response structure: missing or invalid ${field}`);
      }
    }
    
    return {
      marketDemandScore: analysisData.marketDemand.score,
      competitionScore: analysisData.competition.score,
      monetizationFeasibilityScore: analysisData.monetization.score,
      overallScore: analysisData.overall.score,
      analysis: {
        marketDemand: {
          score: analysisData.marketDemand.score,
          text: analysisData.marketDemand.text
        },
        competition: {
          score: analysisData.competition.score,
          text: analysisData.competition.text
        },
        monetization: {
          score: analysisData.monetization.score,
          text: analysisData.monetization.text
        },
        overall: {
          score: analysisData.overall.score,
          text: analysisData.overall.text
        }
      }
    };
  } catch (error) {
    console.error('Error validating idea:', error);
    throw new Error('Failed to validate idea with AI');
  }
};

// Function to generate a pitch deck
const generatePitchDeck = async (ideaText, analysis) => {
  try {
    const prompt = `
You are an expert pitch deck consultant. Create comprehensive investor pitch deck content for this startup:

STARTUP IDEA: "${ideaText}"

ANALYSIS CONTEXT:
- Market Demand: ${analysis.marketDemand.text}
- Competition: ${analysis.competition.text}
- Monetization: ${analysis.monetization.text}
- Overall: ${analysis.overall.text}

Generate detailed, investor-ready content for each section. Make it compelling and data-driven.

CRITICAL: Return ONLY a valid JSON object with this exact structure:

{
  "problem": "Detailed problem statement with market pain points and customer frustrations",
  "solution": "Comprehensive solution description with key features and benefits",
  "marketSize": "TAM, SAM, SOM analysis with specific numbers and market research",
  "businessModel": "Revenue streams, pricing strategy, and unit economics",
  "competitors": "Competitive landscape analysis and competitive advantages",
  "goToMarket": "Customer acquisition strategy, marketing channels, and growth plan",
  "team": "Ideal team structure, key roles, and expertise requirements",
  "financials": "3-year revenue projections, key metrics, and financial assumptions",
  "milestones": "18-month roadmap with specific goals and timelines",
  "askAndUse": "Investment amount needed and detailed fund allocation"
}

Each section should be 3-4 sentences minimum. Return only the JSON object.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();
    
    // Parse and validate the JSON data
    const pitchDeckData = safeJsonParse(textResponse);
    
    // Ensure all required sections are present and are strings
    const requiredSections = [
      'problem', 'solution', 'marketSize', 'businessModel',
      'competitors', 'goToMarket', 'team', 'financials',
      'milestones', 'askAndUse'
    ];
    
    for (const section of requiredSections) {
      if (!pitchDeckData[section]) {
        throw new Error(`Missing required section: ${section}`);
      }
      if (Array.isArray(pitchDeckData[section])) {
        pitchDeckData[section] = pitchDeckData[section].join('\n\n');
      }
    }
    
    return pitchDeckData;
  } catch (error) {
    console.error('Error generating pitch deck:', error);
    throw new Error('Failed to generate pitch deck with AI');
  }
};

// Function to generate a business model canvas
const generateCanvas = async (ideaText, analysis) => {
  try {
    const prompt = `
You are a lean startup methodology expert. Create a comprehensive Business Model Canvas for this startup:

STARTUP IDEA: "${ideaText}"

ANALYSIS CONTEXT:
- Market Demand: ${analysis.marketDemand.text}
- Competition: ${analysis.competition.text}
- Monetization: ${analysis.monetization.text}

Generate detailed content for each canvas building block based on lean startup principles.

CRITICAL: Return ONLY a valid JSON object with this exact structure:

{
  "problem": "Top 1-3 customer problems that your solution addresses",
  "solution": "Key solution features and how they solve the problems",
  "keyMetrics": "Key performance indicators to track success and growth",
  "uniqueValueProposition": "Clear value proposition that differentiates from competitors",
  "channels": "Customer acquisition channels and distribution strategy",
  "customerSegments": "Specific target customer segments and personas",
  "costStructure": "Major cost components and operational expenses",
  "revenueStreams": "Revenue sources and monetization strategies",
  "unfairAdvantage": "Competitive moats and sustainable advantages"
}

Each section should be detailed and actionable. Return only the JSON object.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();
    
    // Parse and validate the JSON data
    const canvasData = safeJsonParse(textResponse);
    
    // Ensure all required sections are present and are strings
    const requiredSections = [
      'problem', 'solution', 'keyMetrics', 'uniqueValueProposition',
      'channels', 'customerSegments', 'costStructure', 'revenueStreams',
      'unfairAdvantage'
    ];
    
    for (const section of requiredSections) {
      if (!canvasData[section]) {
        throw new Error(`Missing required section: ${section}`);
      }
      if (Array.isArray(canvasData[section])) {
        canvasData[section] = canvasData[section].join('\n\n');
      }
    }
    
    return canvasData;
  } catch (error) {
    console.error('Error generating canvas:', error);
    throw new Error('Failed to generate business model canvas with AI');
  }
};

// Function to generate competitor analysis
const generateCompetitorAnalysis = async (ideaText) => {
  try {
    const prompt = `
You are a market research expert. Analyze the competitive landscape for this startup idea:

STARTUP IDEA: "${ideaText}"

Identify 3-4 main competitors (direct and indirect) and provide a comprehensive SWOT analysis for each.

CRITICAL: Return ONLY a valid JSON object with this exact structure:

{
  "competitors": [
    {
      "name": "Competitor Name",
      "description": "Brief description of what they do and their market position",
      "swot": {
        "strengths": ["Strength 1", "Strength 2", "Strength 3"],
        "weaknesses": ["Weakness 1", "Weakness 2", "Weakness 3"],
        "opportunities": ["Opportunity 1", "Opportunity 2"],
        "threats": ["Threat 1", "Threat 2"]
      }
    }
  ],
  "summary": "Overall competitive landscape analysis and market positioning insights"
}

Include both direct competitors and indirect alternatives. Return only the JSON object.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();

    // Parse the JSON data using safe parser
    const competitorData = safeJsonParse(textResponse);
    
    // Validate structure
    if (!competitorData.competitors || !Array.isArray(competitorData.competitors)) {
      throw new Error('Invalid competitors data structure');
    }
    
    if (!competitorData.summary) {
      throw new Error('Missing summary in competitor analysis');
    }

    return competitorData;
  } catch (error) {
    console.error('Error generating competitor analysis:', error);
    throw new Error('Failed to analyze competitors');
  }
};

// Function to simulate investor Q&A
const simulateInvestorQA = async (pitch, question = null, answer = null) => {
  try {
    let prompt;
    
    if (!question && !answer) {
      // Generate initial questions
      prompt = `
You are an experienced venture capitalist conducting due diligence. Review this startup pitch:

PITCH: "${pitch}"

Generate 5 critical questions that investors typically ask during pitch presentations. Focus on:
- Market opportunity and validation
- Business model and revenue potential
- Competitive differentiation
- Growth strategy and scalability
- Team and execution capability

CRITICAL: Return ONLY a valid JSON object with this exact structure:

{
  "questions": [
    {
      "id": "1",
      "question": "Specific investor question text",
      "category": "Market"
    },
    {
      "id": "2", 
      "question": "Another specific investor question",
      "category": "Revenue"
    }
  ]
}

Categories should be: Market, Revenue, Competition, Growth, Team. Return only the JSON object.
      `;
    } else {
      // Evaluate the answer
      prompt = `
You are an experienced venture capitalist evaluating a founder's response during a pitch meeting.

STARTUP PITCH: "${pitch}"
INVESTOR QUESTION: "${question}"
FOUNDER'S ANSWER: "${answer}"

Evaluate the quality and effectiveness of this response from an investor's perspective.

CRITICAL: Return ONLY a valid JSON object with this exact structure:

{
  "feedback": {
    "rating": 4,
    "strengths": ["Strength 1", "Strength 2"],
    "improvements": ["Improvement 1", "Improvement 2"],
    "additionalAdvice": "Overall advice for improving the pitch"
  }
}

Rating should be 1-5. Provide 2-3 strengths and improvements each. Return only the JSON object.
      `;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();
    
    // Parse the JSON data using safe parser
    const qaData = safeJsonParse(textResponse);
    
    return qaData;
  } catch (error) {
    console.error('Error in pitch simulation:', error);
    throw new Error('Failed to process pitch simulation');
  }
};

module.exports = {
  validateIdea,
  generatePitchDeck,
  generateCanvas,
  generateCompetitorAnalysis,
  simulateInvestorQA
};