import { reviewGacInputs, unknownValue } from '../../shared/gacReview.js';
import { useEffect, useState } from 'react';
import { useDesignStore } from '../store/designStore';
import { runGacAgent, buildGacGraph, gacConcept, invalidateGacGraph, GacCalculation, GacGraph } from '../utils/gacDesign';
import { useGacWorkflowStore } from '../store/gacWorkflowStore';
import { loadKnowledge, retrieveKnowledge } from '../utils/gacKnowledge';
import { consultKnowledge } from '../../shared/gacKnowledgeEngine.js';
import { calculateWorkbook } from '../../shared/gacWorkbookEngine.js';
import workbookModel from '../data/gacWorkbook.json';
import { answerWorkbookQuestion, workbookFields } from '../../shared/gacContext.js';
import { askWorkbookAssistant } from '../utils/gacKnowledge';

const example = { flow: '100', totalEbctMinutes: '20', series: '2', parallel: '1', species: 'PFOA', influentNgL: '', targetNgL: '', ebctSource: 'Demonstration assumption — 20 min total EBCT; not a validated pilot design', flowUnit: 'm3/h' };
const excelExample = { averageFlow: '100', geometryMode: 'manual', diameterFt: '10.5', heightFt: '11', bedDepthFt: '6.8', densityLbFt3: String(workbookModel.assumptions.GAC_density.value), redundantVessels: '', carbonLifeMode: 'none', carbonLifeValue: '', bvDefinition: 'total_series', freundlichExponent: '', carbonLifeSource: '' };
const fieldHelp: Record<string, string> = Object.fromEntries(Object.entries(workbookFields).map(([key, field]) => [key, field.definition]));
fieldHelp.flowUnit = 'm3/h is cubic meters per hour; gpm is US gallons per minute. Flow is converted before evaluating workbook formulas.';
fieldHelp.ebctSource = 'Evidence supporting the selected EBCT, including source workbook cells and file hash when a study record is selected.';
fieldHelp.carbonLifeSource = 'The pilot, operating or literature source for carbon-life inputs or isotherm constants. Required when calculating carbon life.';
export function GacPanel() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ ...example, ...excelExample, waterType: '', tocMgL: '', media: '', referenceId: '' });
  const corpus = useGacWorkflowStore(s => s.corpus);
  const speciesOptions = corpus ? Array.from(new Set<string>(corpus.records.map((r: any) => r.species))).sort() : ['PFOA'];
  const [proposal, setProposal] = useState<GacCalculation | null>(null);
  const [accepted, setAccepted] = useState<GacCalculation | null>(null);
  const [graph, setGraph] = useState<GacGraph>(gacConcept());
  const [beforeGraph, setBeforeGraph] = useState<GacGraph>(gacConcept());
  const [history, setHistory] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const review = reviewGacInputs(form, workbookModel, corpus);
  function useSuggestion(suggestion: any) {
    const next = { ...form, ...suggestion.patch };
    record('User selected input suggestion', { suggestion, before: form, after: next });
    setForm(next); setProposal(null); setOpen(true);
    if (accepted) { const staleGraph = invalidateGacGraph(graph); setGraph(staleGraph); showGraph(staleGraph); }
    setMessage('Suggested inputs copied. Review the updated inputs, then calculate sizing.');
  }
  function reviewInputs() {
    setReviewOpen(true);
    record('Review design inputs', { review });
    void explain('Review my current inputs. Explain blocking issues and unknown values, give grounded candidates where available, and ask the most useful next question.');
  }
  const selectedId = useDesignStore(s => s.selectedInputDesignId);
  const active = selectedId === 'gac-workspace';
  useEffect(() => { loadKnowledge().then(corpus => useGacWorkflowStore.setState({ corpus })).catch(e => setMessage(e.message)); }, []);
  useEffect(() => {
    if (corpus) useGacWorkflowStore.setState({ consultation: consultKnowledge(corpus, { form, graph }) });
  }, [corpus, form, graph]);
  async function search(query = '') {
    try {
      const result = await retrieveKnowledge(query, form, graph);
      useGacWorkflowStore.setState({ consultation: result });
      record('Retrieve workbook evidence', { query, toolCalls: result.toolCalls, evidence: result.evidence, source: result.source, questions: result.questions });
      useDesignStore.getState().addChatMessage('ai', result.message);
    } catch (e) { setMessage(String(e)); }
  }
  async function explain(query: string) {
    const context = { form, proposal, accepted, graph };
    const local = answerWorkbookQuestion(query, context, workbookModel);
    useGacWorkflowStore.setState({ highlightedFields: local.fields || [] });
    useDesignStore.setState({ aiResponding: true });
    try {
      const answer = await askWorkbookAssistant(query, context, local);
      useDesignStore.getState().addChatMessage('ai', answer.message);
      record('Explain workbook context', { query, mode: answer.mode, answer: answer.message, fields: local.fields, nextAction: local.action });
    } finally { useDesignStore.setState({ aiResponding: false }); }
  }
  useEffect(() => { useGacWorkflowStore.setState({ proposal, accepted, graph, beforeGraph, form, history }); }, [proposal, accepted, graph, beforeGraph, form, history]);
  function showGraph(next: GacGraph) {
    useDesignStore.setState({ selectedInputDesignId: 'gac-workspace', conceptualGraph: next, detailedGraph: next,
      baseConceptualGraph: gacConcept(), baseDetailedGraph: gacConcept(), rawDexpiModel: null, activeView: 'conceptual', selectedNode: null,
      aiResponding: false, assumptionMode: false });
    setGraph(next);
  }
  function record(action: string, details: any) {
    const timestamp = new Date().toISOString();
    setHistory(h => [...h, { timestamp, action, ...details }]);
    const state = useDesignStore.getState();
    useDesignStore.setState({ decisionLog: [...state.decisionLog, {
      id: crypto.randomUUID(), timestamp: Date.now(), topic: 'GAC design', designQuestion: action,
      stakeholderFocus: ['designer', 'engineer', 'operator'], humanOrAiResponse: JSON.stringify(details),
      responseSource: 'human', decision: action, confidence: 'review', affectedComponent: 'gac-workspace',
      communicationPurpose: 'Connect calculation basis, user choice and graph changes.', outcome: action
    }] });
  }
  function edit(key: string, value: string) {
    if (key === 'species' && value && !speciesOptions.includes(value)) { setMessage('Select a PFAS species from the list.'); return; }
    setForm(f => ({ ...f, [key]: value, ...(['species', 'totalEbctMinutes', 'series', 'ebctSource'].includes(key) ? { referenceId: '', ebctSource: key === 'ebctSource' ? value : 'User input — reference basis changed' } : {}) })); setProposal(null);
    if (accepted) {
      record('Input changed; previous calculation requires review', { field: key, before: form[key as keyof typeof form], after: value, previousCalculation: accepted });
      const next = invalidateGacGraph(graph); setGraph(next); if (active) showGraph(next);
      if (active) useDesignStore.setState({ candidate: { ...useDesignStore.getState().candidate, status: 'Assumptions Only',
        reviewItems: [...new Set([...useDesignStore.getState().candidate.reviewItems, 'GAC inputs changed: applied sizing is stale. Recalculate and review.'])] } });
      setMessage('Inputs changed. Applied values are stale; recalculate and review before applying again.');
    }
  }
  function calculate() {
    try {
      if (!review.canCalculate) {
        setOpen(true); setReviewOpen(true);
        const reasons = [...review.issues.map((issue: any) => issue.message), ...review.questions.map((question: any) => question.text)];
        setMessage(`Please provide or review these inputs. ${reasons[0] || 'Complete the unknown values.'}`);
        useDesignStore.getState().addChatMessage('ai', reasons.slice(0, 3).join('\n'));
        record('Sizing blocked by input review', { review });
        return;
      }
      const agent = runGacAgent(form, graph);
      if (agent.kind === 'needs_input') { setOpen(true); setMessage(agent.message); useDesignStore.getState().addChatMessage('ai', agent.message); return; }
      const result = agent.result;
      if (form.carbonLifeMode !== 'none' && !form.carbonLifeSource.trim()) throw new Error('Provide the carbon life / isotherm source.');
      const workbook = calculateWorkbook({
        flowGpm: result.flowM3H / (0.003785411784 * 60),
        averageFlowGpm: Number(form.averageFlow) * (form.flowUnit === 'gpm' ? 1 : 1 / (0.003785411784 * 60)),
        totalEbctMinutes: result.inputs.totalEbctMinutes, series: result.inputs.series, parallel: result.inputs.parallel,
        geometryMode: form.geometryMode, diameterFt: form.diameterFt, heightFt: form.heightFt, bedDepthFt: form.bedDepthFt,
        densityLbFt3: form.densityLbFt3, redundantVessels: unknownValue(form.redundantVessels) ? '' : form.redundantVessels,
        carbonLifeMode: form.carbonLifeMode, carbonLifeValue: form.carbonLifeValue, bvDefinition: form.bvDefinition,
        freundlichExponent: form.freundlichExponent, influentMgL: (result.inputs.influentNgL ?? 0) / 1e6, targetMgL: (result.inputs.targetNgL ?? 0) / 1e6,
        carbonLifeSource: form.carbonLifeSource }, workbookModel);
      result.workbook = workbook;
      result.requiredMediaM3 = result.totalMediaM3;
      result.totalMediaM3 = workbook.operatingMediaM3;
      result.mediaPerVesselM3 = workbook.mediaPerVesselM3;
      result.vesselCount = workbook.operatingVessels;
      result.inputs.parallel = workbook.parallel;
      result.flowPerTrainM3H = result.flowM3H / workbook.parallel;
      result.ebctPerVesselMinutes = workbook.actualTotalEbctMinutes / workbook.series;
      result.version = workbook.version;
      result.assumptions = ['Upright pressure vessel calculations ported from Excel; no bypass.', 'Required media volume and installed volume differ because dimensions are rounded.', 'Excel defaults for expansion, freeboard, density and redundancy require project review.', 'Workbook pipe-size lookups do not replace hydraulic verification.', 'Carbon life requires an entered source; PFAS effluent concentration is not predicted.'];
      if (form.referenceId && corpus) {
        result.evidence = { record: corpus.records.find((r: any) => r.id === form.referenceId), source: corpus.source, conditions: { waterType: form.waterType, tocMgL: form.tocMgL, media: form.media } };
      }
      setProposal(result); setMessage('Sizing calculated. Review the proposed change, then select Accept and apply.');
      record('Calculate GAC proposal', { designState: agent.designState, toolCall: { name: 'calculate_gac_workbook', arguments: workbook.inputs }, tool: result.version, result });
      useDesignStore.getState().addChatMessage('ai', `The proposed design has ${result.vesselCount} GAC vessels: ${result.inputs.series} in series per train, with ${result.inputs.parallel} operating train(s). Each vessel contains ${result.mediaPerVesselM3.toFixed(3)} m³ of GAC. Total operating GAC volume is ${result.totalMediaM3.toFixed(3)} m³. This is a proposal; your design has not changed yet. Review it under Architecture, then select Accept and apply. These sizing results do not predict PFAS removal.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
  }
  useEffect(() => {
    const handler = (event: Event) => {
      const text = String((event as CustomEvent).detail).trim();
      if (/^(calculate|recalculate|계산|재계산)$/i.test(text)) calculate();
      else if (/^(accept|apply|채택|반영)$/i.test(text)) apply();
      else if (/^(source|출처|근거)\s*[:=]/i.test(text)) {
        const value = text.replace(/^(source|출처|근거)\s*[:=]\s*/i, '');
        edit(form.carbonLifeMode !== 'none' ? 'carbonLifeSource' : 'ebctSource', value);
        record('User supplied calculation source', { source: value });
        useDesignStore.getState().addChatMessage('ai', 'Calculation evidence recorded.');
      }
      else {
        const match = text.match(/^([a-zA-Z]+)\s*=\s*(.+)$/);
        if (match && Object.prototype.hasOwnProperty.call(form, match[1])) {
          edit(match[1], match[2]);
          useDesignStore.getState().addChatMessage('ai', `Recorded ${match[1]}=${match[2]}. Enter calculate when the design basis is complete.`);
        } else if (/review|valid|suitable|recommend|suggest|unknown|모르|적정|검토|추천/i.test(text)) { setReviewOpen(true); void explain(text); }
        else if (/찾|검색|search|reference|참고|사례|find/i.test(text)) void search(text);
        else void explain(text);
      }
    };
    window.addEventListener('gac-agent-message', handler);
    return () => window.removeEventListener('gac-agent-message', handler);
  });
  useEffect(() => {
    const handler = (event: Event) => {
      const command = String((event as CustomEvent).detail);
      if (command === 'basis') setOpen(true);
      if (command === 'calculate') calculate();
      if (command === 'accept') apply();
      if (command === 'reject' && proposal) { record('User rejected proposal', { calculation: proposal }); setProposal(null); setMessage('Proposal rejected; graph retained.'); }
    };
    window.addEventListener('gac-review-command', handler);
    return () => window.removeEventListener('gac-review-command', handler);
  });
  const storeGraph = useDesignStore(s => s.conceptualGraph);
  useEffect(() => {
    if (active && storeGraph !== graph) {
      setGraph(storeGraph);
      setAccepted(null); setProposal(null);
      setMessage('');
      if (accepted || proposal) setHistory(h => [...h, { timestamp: new Date().toISOString(), action: 'Workspace reloaded', after: storeGraph }]);
    }
  }, [active, storeGraph, graph]);
  function apply() {
    if (!proposal || !active) return;
    const next = buildGacGraph(proposal);
    setBeforeGraph(graph);
    record('User accepted GAC proposal', { calculation: proposal, before: graph, after: next,
      changedVesselIds: next.nodes.filter(n => n.id.startsWith('gac-t')).map(n => n.id) });
    showGraph(next); setAccepted(proposal); setProposal(null);
    useDesignStore.setState({ candidate: { ...useDesignStore.getState().candidate, fluid: 'PFAS-contaminated water',
      treatment: 'GAC', heatExchanger: 'Not specified', material: 'TBD', lineSize: 'TBD', pumpDuty: 'TBD',
      flowInstrument: 'TBD', pressureProtection: 'TBD', bypass: 'TBD', status: 'Assumptions Only',
      updatedTopics: ['GAC design'], reviewItems: proposal.assumptions } });
    setMessage('Applied to explicit vessel IDs. PFAS performance and remaining sizing require review.');
  }
  function exportCase() {
    const blob = new Blob([JSON.stringify({ schemaVersion: 'gac-case/1', form, proposal, accepted, graph, history,
      state: graph.nodes.some(n => n.attributes?.calculationState === 'stale') ? 'stale' : accepted ? 'applied' : 'concept' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'codesign_gac_case.json'; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="gac-panel" style={{ padding: 12, background: '#172033', fontSize: 12 }}>
    <button onClick={() => setOpen(!open)}>Design basis {open ? '−' : '+'}</button>
    {open && <div className="basis-inputs">
      {!active && <p>Select GAC workspace to apply changes.</p>}
      <div className="gac-fields">{['species', 'flow', 'averageFlow', 'totalEbctMinutes', 'series', 'bedDepthFt', 'heightFt', 'diameterFt', 'densityLbFt3', 'redundantVessels'].map(key => <label key={key} title={fieldHelp[key]}>
        {workbookFields[key]?.label}
        {key === 'species' ? <select aria-label={key} title={fieldHelp[key]} value={form[key]} onChange={e => edit(key, e.target.value)}><option value="">Select PFAS</option>{speciesOptions.map(s => <option key={s} value={s}>{s}</option>)}</select> : <input aria-label={key} title={fieldHelp[key]} type="text" inputMode="decimal" value={form[key]} onChange={e => edit(key, e.target.value)} />}
      </label>)}</div>
      <label title={fieldHelp.flowUnit}>Flow unit <select aria-label="flowUnit" value={form.flowUnit} onChange={e => edit('flowUnit', e.target.value)}><option>m3/h</option><option>gpm</option></select></label>
      <label title={workbookFields.carbonLifeMode.definition}>Carbon life input type <select aria-label="carbonLifeMode" value={form.carbonLifeMode} onChange={e => edit('carbonLifeMode', e.target.value)}><option value="none">Not specified</option><option value="bv">Bed volumes to breakthrough</option><option value="months">Measured life (months)</option><option value="freundlich">Freundlich isotherm</option></select></label>
      {form.carbonLifeMode !== 'none' && <><label title={fieldHelp.carbonLifeValue}>{({ bv: 'Bed volumes to breakthrough', months: 'Carbon life (months)', freundlich: 'Freundlich Kf' } as Record<string, string>)[form.carbonLifeMode]}<input aria-label="carbonLifeValue" title={fieldHelp.carbonLifeValue} type="text" inputMode="decimal" value={form.carbonLifeValue} onChange={e => edit('carbonLifeValue', e.target.value)} /></label>
        {form.carbonLifeMode === 'bv' && <label title="BV = treated water volume / reference media volume. PFAS Reference uses total media in the series train.">BV volume basis <select aria-label="bvDefinition" value={form.bvDefinition} onChange={e => edit('bvDefinition', e.target.value)}><option value="total_series">Total series media</option><option value="per_vessel">Single vessel media</option></select></label>}
        {form.carbonLifeMode === 'freundlich' && <div className="gac-fields">{['freundlichExponent', 'influentNgL', 'targetNgL'].map(key => <label key={key} title={workbookFields[key].definition}>{key === 'influentNgL' ? 'Influent (mg/L)' : key === 'targetNgL' ? 'Breakthrough (mg/L)' : 'Freundlich 1/n'}<input aria-label={key} title={workbookFields[key].definition} type="text" inputMode="decimal" value={form[key] === '?' ? '?' : form[key] ? Number(form[key]) / (key === 'freundlichExponent' ? 1 : 1e6) : ''} onChange={e => edit(key, e.target.value === '?' ? '?' : e.target.value ? String(Number(e.target.value) * (key === 'freundlichExponent' ? 1 : 1e6)) : '')} /></label>)}</div>}
      </>}
    </div>}
    <p>{form.species} · {form.flow} {form.flowUnit} · {form.totalEbctMinutes} min EBCT</p>
    <button onClick={reviewInputs}>Review inputs</button>
    {reviewOpen && <div className="input-review">
      {review.issues.map((issue: any, i: number) => <p key={`issue-${i}`}><strong>Needs correction:</strong> {issue.message}</p>)}
      {review.questions.slice(0, 4).map((question: any, i: number) => <p key={`question-${i}`}>{question.text}</p>)}
      {review.canCalculate && <p>Inputs satisfy the supported sizing checks. PFAS performance still requires project evidence.</p>}
      {review.suggestions.map((suggestion: any) => <div key={suggestion.id} className="input-suggestion"><p><strong>{suggestion.label}</strong></p><p>{suggestion.reason}</p><details><summary>Evidence</summary><p>{suggestion.source}</p></details><button onClick={() => useSuggestion(suggestion)}>{suggestion.kind === 'study_scenario' ? 'Use as comparison scenario' : 'Use suggested inputs'}</button></div>)}
      {review.warnings.map((warning: string) => <p key={warning}>{warning}</p>)}
    </div>}
    {message && <p role="status">{message}</p>}
    <button title="Run the supported Excel pressure-vessel formulas and generate a sizing proposal. Approval is required to apply changes." onClick={calculate}>Calculate GAC sizing</button>
    <details className="case-export"><summary title="Export inputs, evidence, calculations, graph and decision history as JSON.">Case data</summary><button onClick={exportCase}>Export case + history</button></details>
  </section>;
}
