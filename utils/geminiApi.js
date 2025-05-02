const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Function to validate an idea
const validateIdea = async (ideaText) => {
  try {
    const prompt = `
      Validate the startup idea: "${ideaText}"
      
      Analyze the following aspects:
      
      1. Market Demand: Evaluate the potential market demand, size, and growth for this idea. Consider if there's a real problem being solved and if there's a target audience willing to pay for the solution.
      
      2. Competition: Assess the competitive landscape. How crowded is the market? Are there established players? What are the barriers to entry?
      
      3. Monetization Potential: Evaluate the potential business models and revenue streams. How feasible is it to make money with this idea?
      
      For each aspect, provide:
      - A percentage score (0-100)
      - A brief 3-line analysis explaining the reasoning
      
      Finally, provide an overall assessment with an overall score (0-100) and a short conclusion.
      
      Format your response as a JSON object with this structure:
      {
        "marketDemand": {
          "score": 85,
          "text": "Your analysis here..."
        },
        "competition": {
          "score": 70,
          "text": "Your analysis here..."
        },
        "monetization": {
          "score": 75,
          "text": "Your analysis here..."
        },
        "overall": {
          "score": 77,
          "text": "Your final assessment here..."
        }
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();
    
    // Extract the JSON from the response
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }
    
    // Parse the JSON data
    const analysisData = JSON.parse(jsonMatch[0]);
    
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
      Generate a comprehensive investor pitch deck for the startup idea: "${ideaText}"
      
      Based on this analysis:
      Market Demand: ${analysis.marketDemand.text}
      Competition: ${analysis.competition.text}
      Monetization: ${analysis.monetization.text}
      Overall Assessment: ${analysis.overall.text}
      
      Create detailed content for each pitch deck section. Format the response as a JSON object with these exact keys:
      {
        "problem": "Detailed description of the problem",
        "solution": "Comprehensive explanation of the solution",
        "marketSize": "TAM, SAM, and SOM analysis",
        "businessModel": "Revenue streams and pricing strategy",
        "competitors": "Competitive analysis and advantages",
        "goToMarket": "Marketing and customer acquisition strategy",
        "team": "Ideal team structure and roles",
        "financials": "3-year financial projections",
        "milestones": "18-month roadmap",
        "askAndUse": "Investment requirements and allocation"
      }

      Important: Each value must be a single string, not an array.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();
    
    // Extract the JSON from the response
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }
    
    // Parse and validate the JSON data
    const pitchDeckData = JSON.parse(jsonMatch[0]);
    
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
      Generate a Lean Business Model Canvas for the startup idea: "${ideaText}"
      
      Based on this analysis:
      Market Demand: ${analysis.marketDemand.text}
      Competition: ${analysis.competition.text}
      Monetization: ${analysis.monetization.text}
      Overall Assessment: ${analysis.overall.text}
      
      Create detailed content for each canvas section. Format the response as a JSON object with these exact keys:
      {
        "problem": "Top 1-3 customer problems",
        "solution": "Key solution features",
        "keyMetrics": "Key performance indicators",
        "uniqueValueProposition": "Core value proposition",
        "channels": "Path to customers",
        "customerSegments": "Target customer segments",
        "costStructure": "Major cost components",
        "revenueStreams": "Revenue sources",
        "unfairAdvantage": "Competitive advantages"
      }

      Important: Each value must be a single string, not an array. If you have multiple points, combine them into a single string with line breaks.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();
    
    // Extract the JSON from the response
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }
    
    // Parse and validate the JSON data
    const canvasData = JSON.parse(jsonMatch[0]);
    
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

module.exports = {
  validateIdea,
  generatePitchDeck,
  generateCanvas,
};