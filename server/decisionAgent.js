import OpenAI from 'openai';

const DECISION_STEPS = [
  {
    topic: 'process fluid',
    designQuestion: 'What type of fluid is being processed?',
    stakeholderFocus: ['designer', 'engineer', 'operator'],
    affectedComponent: 'material schedule and sampling points',
    communicationPurpose: 'Choose fluid assumptions that visibly affect material and sampling needs.',
    fallbackDecision: 'B) PFAS-contaminated water',
    fallbackResponse: 'B) PFAS-contaminated water. Use SS316/HDPE material assumptions and add chemistry confirmation to review.'
  },
  {
    topic: 'flow rate',
    designQuestion: 'What design flow rate should the P&ID use?',
    stakeholderFocus: ['designer', 'engineer'],
    affectedComponent: 'main line size, pump capacity, and flow instrument range',
    communicationPurpose: 'Translate process capacity into visible line and pump sizing changes.',
    fallbackDecision: 'B) 100 m3/h',
    fallbackResponse: 'B) 100 m3/h. Use DN100 as the main line candidate and FT-101 range 0-150 m3/h.'
  },
  {
    topic: 'pressure duty',
    designQuestion: 'What pump duty should be assumed?',
    stakeholderFocus: ['engineer', 'operator'],
    affectedComponent: 'pump duty and pressure protection',
    communicationPurpose: 'Expose pressure assumptions that affect pump annotation and protection review.',
    fallbackDecision: 'B) Booster pump, delta P approximately 10 bar',
    fallbackResponse: 'B) Booster pump, delta P approximately 10 bar. Show PI plus high-pressure alarm on the pump discharge.'
  },
  {
    topic: 'treatment configuration',
    designQuestion: 'What downstream treatment configuration should be shown?',
    stakeholderFocus: ['designer', 'engineer', 'operator'],
    affectedComponent: 'heat exchanger, bypass valves, and treatment train',
    communicationPurpose: 'Show how a treatment choice changes the candidate P&ID layout.',
    fallbackDecision: 'B) Plate heat exchanger before treatment',
    fallbackResponse: 'B) Plate heat exchanger before treatment. Include HX bypass and isolation valves for review.'
  },
  {
    topic: 'review gate',
    designQuestion: 'Should the system generate a reviewable P&ID candidate now?',
    stakeholderFocus: ['designer', 'engineer', 'operator'],
    affectedComponent: 'candidate P&ID status',
    communicationPurpose: 'Make the human review gate explicit before showing a detailed candidate.',
    fallbackDecision: 'B) Generate the candidate and flag all assumptions',
    fallbackResponse: 'B) Generate the candidate and flag all assumptions. Candidate can be shown, but it is not final design approval.'
  }
];

function confidenceFor(step, response) {
  const text = `${step.topic} ${response}`.toLowerCase();
  if (text.includes('review') || text.includes('verify') || text.includes('confirm') || text.includes('pending')) return 'review';
  if (['review gate'].includes(step.topic)) return 'high';
  return 'medium';
}

function fallbackEntries(scenario) {
  const now = Date.now();
  return DECISION_STEPS.map((step, index) => {
    const humanOrAiResponse = `${step.fallbackResponse} Scenario context: ${scenario || 'PFAS treatment PFD to P&ID refinement'}`;
    const confidence = confidenceFor(step, humanOrAiResponse);
    return {
      id: `agent-${now}-${index + 1}`,
      timestamp: now + index * 1000,
      topic: step.topic,
      designQuestion: step.designQuestion,
      stakeholderFocus: step.stakeholderFocus,
      humanOrAiResponse,
      responseSource: 'ai_default',
      decision: step.fallbackDecision,
      confidence,
      affectedComponent: step.affectedComponent,
      communicationPurpose: step.communicationPurpose,
      outcome: confidence === 'review' ? 'Generated as review-needed AI assumption' : 'Generated as plausible AI decision-log entry'
    };
  });
}

function normalizeEntries(entries) {
  const now = Date.now();
  return DECISION_STEPS.map((step, index) => {
    const generated = entries?.find?.(entry => entry.topic === step.topic) || entries?.[index] || {};
    const response = generated.humanOrAiResponse || step.fallbackResponse;
    const confidence = ['high', 'medium', 'review'].includes(generated.confidence) ? generated.confidence : confidenceFor(step, response);
    return {
      id: `agent-${now}-${index + 1}`,
      timestamp: now + index * 1000,
      topic: step.topic,
      designQuestion: step.designQuestion,
      stakeholderFocus: Array.isArray(generated.stakeholderFocus) ? generated.stakeholderFocus : step.stakeholderFocus,
      humanOrAiResponse: response,
      responseSource: 'ai_default',
      decision: generated.decision || step.fallbackDecision,
      confidence,
      affectedComponent: generated.affectedComponent || step.affectedComponent,
      communicationPurpose: generated.communicationPurpose || step.communicationPurpose,
      outcome: generated.outcome || (confidence === 'review' ? 'Generated as review-needed AI assumption' : 'Generated as plausible AI decision-log entry')
    };
  });
}

export async function generateDecisionLog({ scenario = '', model = process.env.OPENAI_MODEL || 'gpt-5-mini' } = {}) {
  if (!process.env.OPENAI_API_KEY) {
    return { mode: 'fallback', entries: fallbackEntries(scenario) };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `You are an AI design-mediation agent for a water/process engineering prototype called CoDesign. Generate a realistic decision-query-outcome log for refining a conceptual PFD into a reviewable P&ID candidate. The goal is not full automation; the goal is to record AI assumptions, human-review needs, stakeholder alignment, and affected components.\n\nScenario: ${scenario || 'PFAS treatment process with feed tank, pump, heat exchanger, and downstream treatment unit.'}\n\nReturn ONLY valid JSON with this shape: {"entries":[{"topic":"...","designQuestion":"...","stakeholderFocus":["designer"],"humanOrAiResponse":"...","decision":"...","confidence":"high|medium|review","affectedComponent":"...","communicationPurpose":"...","outcome":"..."}]}. Include exactly these topics in order: ${DECISION_STEPS.map(s => s.topic).join(', ')}.`;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'Return compact, valid JSON only. Do not include markdown fences.' },
        { role: 'user', content: prompt }
      ]
    });
    const raw = completion.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw);
    return { mode: 'openai', model, entries: normalizeEntries(parsed.entries) };
  } catch (error) {
    return {
      mode: 'fallback_after_error',
      error: error instanceof Error ? error.message : String(error),
      entries: fallbackEntries(scenario)
    };
  }
}
