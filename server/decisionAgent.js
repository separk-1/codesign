import OpenAI from 'openai';

const DECISION_STEPS = [
  {
    topic: 'process fluid',
    designQuestion: 'What type of fluid is being processed?',
    stakeholderFocus: ['designer', 'engineer', 'operator'],
    affectedComponent: 'material schedule and sampling points',
    communicationPurpose: 'Choose fluid assumptions that visibly affect material and sampling needs.',
    options: ['A) Clean water', 'B) PFAS-contaminated water', 'C) Corrosive chemical', 'D) Slurry / solids-containing stream'],
    fallbackDecision: 'B) PFAS-contaminated water',
    fallbackResponse: 'B) PFAS-contaminated water. Rationale: use SS316/HDPE material assumptions and add chemistry confirmation to review.'
  },
  {
    topic: 'flow rate',
    designQuestion: 'What design flow rate should the P&ID use?',
    stakeholderFocus: ['designer', 'engineer'],
    affectedComponent: 'main line size, pump capacity, and flow instrument range',
    communicationPurpose: 'Translate process capacity into visible line and pump sizing changes.',
    options: ['A) 25 m3/h', 'B) 100 m3/h', 'C) 300 m3/h', 'D) Unknown, requires confirmation'],
    fallbackDecision: 'B) 100 m3/h',
    fallbackResponse: 'B) 100 m3/h. Rationale: use DN100 as the main line candidate and FT-101 range 0-150 m3/h.'
  },
  {
    topic: 'pressure duty',
    designQuestion: 'What pump duty should be assumed?',
    stakeholderFocus: ['engineer', 'operator'],
    affectedComponent: 'pump duty and pressure protection',
    communicationPurpose: 'Expose pressure assumptions that affect pump annotation and protection review.',
    options: ['A) Transfer pump, delta P approximately 3 bar', 'B) Booster pump, delta P approximately 10 bar', 'C) High-pressure feed pump, delta P approximately 25 bar', 'D) Unknown, requires vendor or process review'],
    fallbackDecision: 'B) Booster pump, delta P approximately 10 bar',
    fallbackResponse: 'B) Booster pump, delta P approximately 10 bar. Rationale: show PT plus high-pressure alarm on the pump discharge.'
  },
  {
    topic: 'treatment configuration',
    designQuestion: 'What downstream treatment configuration should be shown?',
    stakeholderFocus: ['designer', 'engineer', 'operator'],
    affectedComponent: 'heat exchanger, bypass valves, and treatment train',
    communicationPurpose: 'Show how a treatment choice changes the candidate P&ID layout.',
    options: ['A) Direct treatment without heat exchanger', 'B) Plate heat exchanger before treatment', 'C) Shell-and-tube heat exchanger before treatment', 'D) Configuration uncertain, requires review'],
    fallbackDecision: 'B) Plate heat exchanger before treatment',
    fallbackResponse: 'B) Plate heat exchanger before treatment. Rationale: include HX bypass and isolation valves for review.'
  },
  {
    topic: 'review gate',
    designQuestion: 'Should the system generate a reviewable P&ID candidate now?',
    stakeholderFocus: ['designer', 'engineer', 'operator'],
    affectedComponent: 'candidate P&ID status',
    communicationPurpose: 'Make the human review gate explicit before showing a detailed candidate.',
    options: ['A) Yes, generate the candidate', 'B) Generate the candidate and flag all assumptions', 'C) Do not generate, more information is required', 'D) Export the decision log only'],
    fallbackDecision: 'B) Generate the candidate and flag all assumptions',
    fallbackResponse: 'B) Generate the candidate and flag all assumptions. Rationale: candidate can be shown, but it is not final design approval.'
  }
];

function confidenceFor(step, response) {
  const text = `${step.topic} ${response}`.toLowerCase();
  if (text.includes('review') || text.includes('verify') || text.includes('confirm') || text.includes('pending')) return 'review';
  if (['review gate'].includes(step.topic)) return 'high';
  return 'medium';
}

function optionLetter(text = '') {
  return String(text).trim().match(/^[A-D]/i)?.[0]?.toUpperCase() || '';
}

function optionByLetter(step, letter) {
  return step.options.find(option => option.startsWith(`${letter})`));
}

function inferOptionLetter(step, generated = {}) {
  const direct = optionLetter(generated.selectedOption) || optionLetter(generated.decision) || optionLetter(generated.humanOrAiResponse);
  if (direct && optionByLetter(step, direct)) return direct;
  const text = `${generated.decision || ''} ${generated.humanOrAiResponse || ''}`.toLowerCase();
  if (step.topic === 'process fluid') {
    if (text.includes('clean water')) return 'A';
    if (text.includes('pfas') || text.includes('aqueous') || text.includes('groundwater')) return 'B';
    if (text.includes('corrosive') || text.includes('acid') || text.includes('caustic')) return 'C';
    if (text.includes('slurry') || text.includes('solids')) return 'D';
  }
  if (step.topic === 'flow rate') {
    if (text.includes('unknown') || text.includes('confirm')) return 'D';
    if (text.includes('300')) return 'C';
    if (text.includes('100') || text.includes('10 m3') || text.includes('10 m³')) return 'B';
    if (text.includes('25')) return 'A';
  }
  if (step.topic === 'pressure duty') {
    if (text.includes('unknown') || text.includes('vendor')) return 'D';
    if (text.includes('25') || text.includes('high-pressure')) return 'C';
    if (text.includes('10') || text.includes('booster') || text.includes('6 bar')) return 'B';
    if (text.includes('3') || text.includes('2 bar') || text.includes('transfer')) return 'A';
  }
  if (step.topic === 'treatment configuration') {
    if (text.includes('uncertain') || text.includes('unknown')) return 'D';
    if (text.includes('shell')) return 'C';
    if (text.includes('plate') || text.includes('heat exchanger')) return 'B';
    if (text.includes('direct') || text.includes('without heat')) return 'A';
  }
  if (step.topic === 'review gate') {
    if (text.includes('log only') || text.includes('export')) return 'D';
    if (text.includes('do not') || text.includes('more information')) return 'C';
    if (text.includes('assumption') || text.includes('checklist')) return 'B';
    if (text.includes('yes') || text.includes('generate')) return 'A';
  }
  return optionLetter(step.fallbackDecision) || 'B';
}

function normalizeStructuredResponse(step, generated = {}) {
  const selectedLetter = step.topic === 'review gate' ? 'B' : inferOptionLetter(step, generated);
  const selectedOption = optionByLetter(step, selectedLetter) || step.fallbackDecision;
  const rawResponse = String(generated.humanOrAiResponse || generated.rationale || step.fallbackResponse).trim();
  const rationale = rawResponse.replace(/^[A-D]\)\s*/i, '').trim();
  const humanOrAiResponse = `${selectedOption}. AI assumption/rationale: ${rationale || 'No rationale supplied.'}`;
  return { selectedOption, humanOrAiResponse };
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
      selectedOption: step.fallbackDecision,
      decision: step.fallbackDecision,
      confidence: 'review',
      affectedComponent: step.affectedComponent,
      communicationPurpose: step.communicationPurpose,
      outcome: 'Generated as AI-default assumption; requires human review before design use.'
    };
  });
}

function normalizeEntries(entries) {
  const now = Date.now();
  return DECISION_STEPS.map((step, index) => {
    const generated = entries?.find?.(entry => entry.topic === step.topic) || entries?.[index] || {};
    const structured = normalizeStructuredResponse(step, generated);
    const confidence = 'review';
    return {
      id: `agent-${now}-${index + 1}`,
      timestamp: now + index * 1000,
      topic: step.topic,
      designQuestion: step.designQuestion,
      stakeholderFocus: Array.isArray(generated.stakeholderFocus) ? generated.stakeholderFocus : step.stakeholderFocus,
      humanOrAiResponse: structured.humanOrAiResponse,
      responseSource: 'ai_default',
      selectedOption: structured.selectedOption,
      decision: structured.selectedOption,
      confidence,
      affectedComponent: generated.affectedComponent || step.affectedComponent,
      communicationPurpose: generated.communicationPurpose || step.communicationPurpose,
      outcome: generated.outcome || 'Generated as AI-default assumption; requires human review before design use.'
    };
  });
}

export async function generateDecisionLog({ scenario = '', model = process.env.OPENAI_MODEL || 'gpt-5-mini' } = {}) {
  if (!process.env.OPENAI_API_KEY) {
    return { mode: 'fallback', entries: fallbackEntries(scenario) };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `You are an AI design-mediation agent for a water/process engineering prototype called CoDesign. Generate a realistic decision-query-outcome log for refining a conceptual PFD into a reviewable P&ID candidate. The goal is not full automation; the goal is to record AI assumptions, human-review needs, stakeholder alignment, and affected components.\n\nScenario: ${scenario || 'PFAS treatment process with feed tank, pump, heat exchanger, and downstream treatment unit.'}\n\nReturn ONLY valid JSON with this shape: {"entries":[{"topic":"...","selectedOption":"A) ...","humanOrAiResponse":"short rationale and assumptions","decision":"A) ...","confidence":"review","affectedComponent":"...","communicationPurpose":"...","outcome":"..."}]}. For every topic, choose exactly one A/B/C/D option from the prototype question set, include it in selectedOption and decision, then add a short rationale in humanOrAiResponse. For the review gate topic, choose B) Generate the candidate and flag all assumptions unless the scenario explicitly says not to generate a candidate. Include exactly these topics in order: ${DECISION_STEPS.map(s => s.topic).join(', ')}.`;

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
