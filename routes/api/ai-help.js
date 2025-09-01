import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for AI help requests (more restrictive since they cost money)
const aiHelpRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute
  message: 'Too many AI help requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

router.use(aiHelpRateLimit);

router.post('/explain', async (req, res) => {
  try {
    const { question, answer, category } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ 
        error: 'Question and answer are required' 
      });
    }

    // Check if OpenAI API key is configured
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured' 
      });
    }

    // Construct the prompt for OpenAI
    const prompt = `You are a helpful science tutor. A student is asking for help understanding a Science Bowl question.

Question: ${question}
Correct Answer: ${answer}
Category: ${category || 'Science'}

Please provide a clear, educational explanation that:
1. Explains the scientific concept(s) involved
2. Helps the student understand why this answer is correct
3. Provides additional context that might be helpful for similar questions
4. Uses language appropriate for high school students
5. Is concise but thorough (aim for 2-3 paragraphs)

Focus on helping the student learn, not just memorize the answer.`;

    // Make request to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful science tutor who explains Science Bowl questions clearly and educationally.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return res.status(500).json({ 
        error: 'Failed to get AI explanation',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const data = await response.json();
    const explanation = data.choices[0]?.message?.content;

    if (!explanation) {
      return res.status(500).json({ 
        error: 'No explanation received from AI' 
      });
    }

    res.json({ 
      explanation,
      model: data.model,
      usage: data.usage
    });

  } catch (error) {
    console.error('AI help error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

export default router;
