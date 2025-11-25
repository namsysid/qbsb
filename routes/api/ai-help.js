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

// Health check to verify route is mounted and API key presence
router.get('/health', (_req, res) => {
  res.json({ ok: true, hasApiKey: !!process.env.OPENAI_API_KEY });
});

router.post('/explain', async (req, res) => {
  try {
    const { question, answer, category, options, isMcq, userAnswer, userIsCorrect } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const hasOptions = Array.isArray(options) && options.length > 0;
    const optionsText = hasOptions ? `\nOptions:\n${options.map((opt) => `${opt}`).join('\n')}` : '';

    const prompt = `You are a helpful science tutor. A student is asking for help understanding a Science Bowl question.

Question: ${question}
Correct Answer: ${answer}
Category: ${category || 'Science'}${optionsText}
${userAnswer ? `User Answer: ${userAnswer}
User Answer Correct?: ${userIsCorrect === true ? 'Yes' : userIsCorrect === false ? 'No' : 'Unknown'}` : ''}

Please provide a clear, educational explanation that:
1. Explains the scientific concept(s) involved
2. Helps the student understand why the correct answer is correct
3. Provides additional context helpful for similar questions
4. Uses language appropriate for high school students
5. Is concise but thorough (aim for about 2 paragraphs)

${hasOptions || isMcq ? `Also, a short section titled "Why the other options are wrong:" with one bullet per incorrect option. For each, briefly (1 sentence) explain the misconception or why it does not apply. Use the option letter and text if provided.` : ''}
${userAnswer ? `If the user's answer is incorrect, add a brief section titled "Why your answer is incorrect:" with 1–2 sentences explaining the mistake or misconception, and (if helpful) how it differs from the correct answer.` : ''}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful science tutor who explains Science Bowl questions clearly and educationally.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error (explain):', errorData);
      return res.status(500).json({ error: 'Failed to get AI explanation', details: errorData.error?.message || 'Unknown error' });
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content;
    if (!explanation) {
      return res.status(500).json({ error: 'No explanation received from AI' });
    }

    // Aggressive two-pass verification:
    // 1) Editor critique that tries to find issues
    // 2) If issues found, editor fix that returns corrected explanation text
    let finalExplanation = explanation;
    let verification = null;
    try {
      const critiquePrompt = `Are you sure this is correct? Imagine you are a Science Bowl editor verifying an explanation.
Your job is to find factual inaccuracies, unclear phrasing, misalignment with the correct answer, or style issues.
If nothing is wrong, say so in the JSON. Be adversarial and precise.

Question: ${question}
Correct Answer: ${answer}
Category: ${category || 'Science'}${optionsText}
${typeof userAnswer === 'string' && userAnswer.length > 0 ? `User Answer: ${userAnswer}` : ''}

Explanation under review:\n\n${explanation}

Return strict JSON with this exact shape and no extra commentary:
{
  "needs_changes": true,
  "issues": [
    { "type": "factual|clarity|alignment|style|mcq-other-options|user-answer", "description": "...", "fix_suggestion": "..." }
  ],
  "summary": "one-paragraph overview of concerns or 'No issues found.'"
}`;

      const critiqueResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a rigorous Science Bowl editor. Return JSON only.' },
            { role: 'user', content: critiquePrompt }
          ],
          max_tokens: 700,
          temperature: 0.1
        })
      });

      let needsChanges = false;
      let issues = [];
      let summary = '';
      if (critiqueResp.ok) {
        const critiqueData = await critiqueResp.json();
        const critiqueContent = critiqueData.choices?.[0]?.message?.content?.trim();
        try {
          const critiqueParsed = JSON.parse(critiqueContent);
          needsChanges = !!critiqueParsed?.needs_changes;
          issues = Array.isArray(critiqueParsed?.issues) ? critiqueParsed.issues : [];
          summary = typeof critiqueParsed?.summary === 'string' ? critiqueParsed.summary : '';
        } catch {}
      }

      // Derive simple checks from critique
      const types = new Set(issues.map(i => i?.type));
      verification = {
        editor: { needs_changes: needsChanges, issues, summary },
        checks: {
          is_factual: !types.has('factual'),
          is_clear: !types.has('clarity'),
          aligned_with_answer: !types.has('alignment')
        }
      };

      if (needsChanges) {
        const fixPrompt = `You are a Science Bowl editor. Using the critique below, produce a corrected explanation.
Preserve useful structure (e.g., sections like "Why the other options are wrong" and "Why your answer is incorrect") but fix inaccuracies and clarity issues.
Keep the tone and level appropriate for high-school students. Output only the final corrected explanation text.

Question: ${question}
Correct Answer: ${answer}
Category: ${category || 'Science'}${optionsText}
${typeof userAnswer === 'string' && userAnswer.length > 0 ? `User Answer: ${userAnswer}` : ''}

Current Explanation:\n${explanation}

Critique JSON:\n${JSON.stringify({ needs_changes: needsChanges, issues, summary })}`;

        const fixResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'You produce only the corrected explanation text. No JSON.' },
              { role: 'user', content: fixPrompt }
            ],
            max_tokens: 800,
            temperature: 0.2
          })
        });

        if (fixResp.ok) {
          const fixData = await fixResp.json();
          const correctedText = fixData.choices?.[0]?.message?.content?.trim();
          if (correctedText) {
            finalExplanation = correctedText;
          }
        }
      }
    } catch (err) {
      console.warn('Explanation aggressive verification failed; returning best available text:', err?.message || err);
    }

    res.json({ explanation: finalExplanation, verification, model: data.model, usage: data.usage });
  } catch (error) {
    console.error('AI help error (explain):', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Evaluate semantic equivalence between user answer and canonical answer
router.post('/equivalence', async (req, res) => {
  try {
    const { question, correctAnswer, userAnswer, userJustification, category } = req.body || {};
    console.log('[AI-HELP] /equivalence payload', {
      qLen: (question || '').length,
      correctAnswer: String(correctAnswer).slice(0, 80),
      userAnswer: String(userAnswer).slice(0, 80),
      hasJustification: !!userJustification,
      category
    });

    if (!correctAnswer || !userAnswer) {
      return res.status(400).json({ error: 'correctAnswer and userAnswer are required' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const prompt = `You are grading a free-response Science Bowl style answer for semantic equivalence.

Question (optional context): ${question || 'N/A'}
Category: ${category || 'Science'}
Canonical Answer: ${correctAnswer}
Student Answer: ${userAnswer}
${userJustification ? `Student Justification (optional): ${userJustification}` : ''}

Decide if the student answer is essentially equivalent to the canonical answer.
Adjudication rules:
- Accept common synonyms, alternate phrasings, word order, plural/singular, diacritics, and minor spelling errors.
- Accept equivalent chemistry names (IUPAC/common), biology taxonomic variants, physics/astro naming variants, and well-known aliases.
- For numeric answers, allow rounding and equivalent forms; units must be compatible if required by the canonical answer.
- If canonical answer is a specific term and the student answer is more general/vague, do NOT accept unless it clearly and unambiguously means the same thing.
- If the student gives a different concept or an incorrect qualifier, mark not equivalent.
- If the student gives an equivalent ranking for ranking questions, except with the actual text instead of the numbers, mark it as correct.

Return strict JSON only with this exact shape and booleans, no extra commentary. Keep justification very short (<= 25 words):
{
  "equivalent": true,
  "decision": "equivalent|not_equivalent",
  "justification": "One short sentence verdict explaining why (consider the student justification if provided)"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an objective grader for semantic equivalence. Return strict JSON only.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.0
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('OpenAI API error (equivalence):', err);
      return res.status(500).json({ error: 'Failed to evaluate equivalence', details: err.error?.message || 'Unknown error' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Fallback: attempt a second pass asking for strict JSON
      const fallbackPrompt = `Reformat the previous decision as strict JSON with keys: equivalent (boolean), decision ("equivalent"|"not_equivalent"), rationale (string). No commentary.`;
      const fixResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'Return strict JSON only.' },
            { role: 'user', content: content },
            { role: 'user', content: fallbackPrompt }
          ],
          max_tokens: 150,
          temperature: 0.0
        })
      });
      if (fixResp.ok) {
        const fixData = await fixResp.json();
        const fixContent = fixData.choices?.[0]?.message?.content || '';
        try { parsed = JSON.parse(fixContent); } catch {}
      }
    }

    if (!parsed || typeof parsed.equivalent !== 'boolean' || !parsed.decision) {
      return res.status(500).json({ error: 'Invalid response format from AI' });
    }

    const result = {
      equivalent: !!parsed.equivalent,
      decision: parsed.decision,
      justification: typeof parsed.justification === 'string' ? parsed.justification : (typeof parsed.rationale === 'string' ? parsed.rationale : ''),
      model: data.model,
      usage: data.usage
    };
    console.log('[AI-HELP] /equivalence result', { decision: result.decision, equivalent: result.equivalent, justification: String(result.justification).slice(0, 120) });
    res.json(result);
  } catch (error) {
    console.error('AI equivalence error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Suggested reading endpoint
router.post('/suggest-reading', async (req, res) => {
  try {
    const { question, answer, category } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const prompt = `You are a helpful science tutor. Suggest high-quality reading to study the concepts required to answer a Science Bowl question.

Question: ${question}
Category: ${category || 'Science'}
Known correct answer (may help infer subtopic): ${answer || 'N/A'}

Return 5-7 resources balanced between:
- Standard high-school or intro-college textbooks (include edition if useful)
- Authoritative open resources (Khan Academy, HyperPhysics, PhET, MIT OCW, NASA, NOAA, NIH, etc.)
- Topic-specific references (review articles or reputable encyclopedias)

Output strict JSON with the following shape, no extra commentary:
{
  "suggestions": [
    { "title": "...", "type": "textbook|video|article|course|simulation", "link": "https://...", "notes": "1-2 sentence why relevant" }
  ]
}

Prefer stable, non-paywalled links when possible.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You recommend concise, reputable study resources with accurate links.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600,
        temperature: 0.6
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error (suggest-reading):', errorData);
      return res.status(500).json({ error: 'Failed to get suggestions', details: errorData.error?.message || 'Unknown error' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.warn('[AI-HELP] JSON parse failed for suggest-reading, attempting fallback parsing:', parseError.message);
      console.warn('[AI-HELP] Raw content that failed to parse:', content.substring(0, 200) + (content.length > 200 ? '...' : ''));
      // Try to handle cases where the AI returns just an array or malformed JSON
      let suggestions = [];
      try {
        // First, try to parse as a direct array
        const arrayParsed = JSON.parse(content);
        if (Array.isArray(arrayParsed)) {
          suggestions = arrayParsed;
        }
      } catch {
        // If that fails, try to extract JSON array from the content
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try {
            const arrayParsed = JSON.parse(arrayMatch[0]);
            if (Array.isArray(arrayParsed)) {
              suggestions = arrayParsed;
            }
          } catch {}
        }
      }
      
      // If we still don't have suggestions, create a fallback
      if (suggestions.length === 0) {
        suggestions = [{ 
          title: 'Suggested Reading', 
          type: 'text', 
          link: '', 
          notes: content.trim().length > 200 ? content.trim().substring(0, 200) + '...' : content.trim()
        }];
      }
      
      parsed = { suggestions };
    }

    if (!parsed || !Array.isArray(parsed.suggestions)) {
      return res.status(500).json({ error: 'Invalid response format from AI' });
    }

    res.json({ suggestions: parsed.suggestions, model: data.model, usage: data.usage });
  } catch (error) {
    console.error('AI suggest-reading error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Topic summary endpoint: returns a concise 3-5 word subject focus
router.post('/topic-summary', async (req, res) => {
  try {
    const { question, answer, category } = req.body || {};
    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const prompt = `Summarize the core topic of this Science Bowl tossup using exactly one phrase of 3 to 5 words.
Use only concise keywords separated by spaces (letters/numbers only, no punctuation).
Examples: "Photosynthesis light reactions", "Quantum angular momentum", "Basaltic lava viscosity".

Question: ${question}
Correct Answer: ${answer}
Category: ${category || 'Science'}

Return only the 3-5 word phrase.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You create extremely concise topic tags for Science Bowl questions. Respond with only the tag.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error (topic-summary):', errorData);
      return res.status(500).json({ error: 'Failed to get topic summary', details: errorData.error?.message || 'Unknown error' });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const sanitized = raw
      .replace(/[^a-z0-9\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    let words = sanitized.split(' ').filter(Boolean);
    if (words.length < 3) {
      const fallbackWords = `${category || 'Science'} ${answer}`
        .replace(/[^a-z0-9\s-]/gi, ' ')
        .split(' ')
        .filter(Boolean);
      words = words.concat(fallbackWords);
    }
    const summary = words.slice(0, 5).join(' ').trim() || `${category || 'Science'} concept`;
    res.json({ summary, model: data.model, usage: data.usage });
  } catch (error) {
    console.error('AI topic-summary error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Extra practice endpoint: returns practice questions with answers and explanations
router.post('/extra-practice', async (req, res) => {
  try {
    const { question, answer, category } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Prompt from log.txt with added structure requirement
    const basePrompt = `Based off this question, create a list of 3 questions that are of the same core concept as this question. Try to come up with creative questions that would challenge understanding.
Each question should be of the format of Science Bowl High School questions.
For each question, provide an answer and an explanation.`;

    const prompt = `${basePrompt}

Original Question: ${question}
Category: ${category || 'Science'}
Known correct answer (for context): ${answer || 'N/A'}

Output strict JSON with this shape and no extra commentary:
{
  "problems": [
    { "question": "...", "answer": "...", "explanation": "..." }
  ]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You write rigorous, concise practice questions in official Science Bowl HS style with accurate answers and explanations.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 900,
        temperature: 0.6
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error (extra-practice):', errorData);
      return res.status(500).json({ error: 'Failed to get practice questions', details: errorData.error?.message || 'Unknown error' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { problems: [] };
    }

    if (!parsed || !Array.isArray(parsed.problems) || parsed.problems.length === 0) {
      return res.status(500).json({ error: 'Invalid response format from AI' });
    }

    // Verification step: ask the model to check and fix any issues, returning corrected JSON
    let verifiedProblems = parsed.problems;
    try {
      const verifyPrompt = `You are reviewing practice questions for factual accuracy and clarity in the Science Bowl High School style. 

Original Question (context): ${question}
Category: ${category || 'Science'}
Known correct answer (context): ${answer || 'N/A'}

Generated practice set JSON to verify (problems array):\n${JSON.stringify(parsed.problems)}

You are a science bowl editor. You have been given a list of questions. Your job is to make sure that they are viable for competition use.
Tasks:
1. Check each problem's scientific accuracy, internal consistency, and alignment with the core concept of the original question.
2. Ensure the answer matches the question and the explanation supports the answer.
3. Fix any errors, ambiguities, or non–Science Bowl style wording.
4. Keep the number of problems the same.
5. Do NOT introduce references or URLs. Do NOT add commentary.

Return strict JSON with the exact schema:
{ "problems": [ { "question": "...", "answer": "...", "explanation": "..." } ] }`;

      const verifyResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You carefully verify science content for correctness and return corrected JSON only.' },
            { role: 'user', content: verifyPrompt }
          ],
          max_tokens: 900,
          temperature: 0.2
        })
      });

      if (verifyResp.ok) {
        const verifyData = await verifyResp.json();
        const verifyContent = verifyData.choices?.[0]?.message?.content || '';
        try {
          const verifiedParsed = JSON.parse(verifyContent);
          if (verifiedParsed && Array.isArray(verifiedParsed.problems) && verifiedParsed.problems.length === verifiedProblems.length) {
            verifiedProblems = verifiedParsed.problems;
          }
        } catch {
          // If parse fails, keep original problems
        }
      }
    } catch (err) {
      console.warn('Verification step failed; returning original problems:', err?.message || err);
    }

    res.json({ problems: verifiedProblems, model: data.model, usage: data.usage });
  } catch (error) {
    console.error('AI extra-practice error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
