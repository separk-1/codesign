import { formatNumber, fieldCanonical, fieldLabel, fieldValue, fieldDefinition, quantity } from '../../shared/gacUnits.js';
import { GacUnitInput } from './GacUnitInput';
import { reviewGacInputs, unknownValue } from '../../shared/gacReview.js';
import { useEffect, useRef, useState } from 'react';
import { useDesignStore } from '../store/designStore';
import { runGacAgent, buildGacGraph, gacConcept, invalidateGacGraph, GacCalculation, GacGraph } from '../utils/gacDesign';
import { useGacWorkflowStore } from '../store/gacWorkflowStore';
import { loadKnowledge, retrieveKnowledge } from '../utils/gacKnowledge';
import { consultKnowledge } from '../../shared/gacKnowledgeEngine.js';
import { executeExcelWorkbook } from '../utils/gacExcel';
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
  const unitSystem = useGacWorkflowStore(s => s.unitSystem);
  const help = (key: string) => fieldDefinition(key, fieldHelp[key] || '', unitSystem);
  const [open, setOpen] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calculationMode, setCalculationMode] = useState<{ label: string; description: string } | null>(null);
  useEffect(() => { const controller = new AbortController(); fetch('/api/health', { signal: controller.signal }).then(r => r.json()).then(data => setCalculationMode(data.gacCalculation || null)).catch(() => {}); return () => controller.abort(); }, []);
  const pendingCalculation = useRef<{ controller: AbortController; signature: string } | null>(null);
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
  const review = reviewGacInputs(form, workbookModel, corpus, unitSystem);
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
  const currentInputs = useRef({ signature: JSON.stringify(form), active });
  currentInputs.current = { signature: JSON.stringify(form), active };
  useEffect(() => {
    const pending = pendingCalculation.current;
    if (pending && (!active || pending.signature !== JSON.stringify(form))) {
      pending.controller.abort(); pendingCalculation.current = null; setCalculating(false);
      setMessage('Inputs changed while the calculation was running. Calculate again with the updated inputs.');
    }
  }, [form, active]);
  useEffect(() => () => { pendingCalculation.current?.controller.abort(); pendingCalculation.current = null; }, []);
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
    const context = { form, proposal, accepted, graph, unitSystem };
    const asksReview = /review|valid|suitable|recommend|suggest|unknown|don't know|do not know|can i|too|next|missing|모르|추천|적정|검토/i.test(query);
    const local = asksReview && !review.canCalculate ? { mode: 'local_context', action: 'review_inputs', fields: [...review.missing, ...review.issues.map((i: any) => i.field)], message: [...review.issues.map((i: any) => i.message), ...review.questions.slice(0, 2).map((q: any) => q.text), ...review.suggestions.map((s: any) => `${s.label}. ${s.reason}`)].join('\n') } : answerWorkbookQuestion(query, context, workbookModel);
    useGacWorkflowStore.setState({ highlightedFields: local.fields || [] });
    useDesignStore.setState({ aiResponding: true });
    try {
      const answer = await askWorkbookAssistant(query, context, local);
      useDesignStore.getState().addChatMessage('ai', answer.message);
      record('Explain workbook context', { query, mode: answer.mode, answer: answer.message, fields: local.fields, nextAction: local.action, toolCalls: answer.toolCalls, execution: answer.execution });
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
  async function calculate() {
    if (pendingCalculation.current) return;
    let request: { controller: AbortController; signature: string } | null = null;
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
      request = { controller: new AbortController(), signature: JSON.stringify(form) };
      pendingCalculation.current = request; setCalculating(true);
      setMessage(calculationMode ? 'Calculating: ' + calculationMode.label + '...' : 'Requesting calculation from the configured engine...');
      const workbook = await executeExcelWorkbook({
        flowGpm: result.flowM3H / (0.003785411784 * 60),
        averageFlowGpm: Number(form.averageFlow) * (form.flowUnit === 'gpm' ? 1 : 1 / (0.003785411784 * 60)),
        totalEbctMinutes: result.inputs.totalEbctMinutes, series: result.inputs.series, parallel: result.inputs.parallel,
        geometryMode: form.geometryMode, diameterFt: form.diameterFt, heightFt: form.heightFt, bedDepthFt: form.bedDepthFt,
        densityLbFt3: form.densityLbFt3, redundantVessels: unknownValue(form.redundantVessels) ? '' : form.redundantVessels,
        carbonLifeMode: form.carbonLifeMode, carbonLifeValue: form.carbonLifeValue, bvDefinition: form.bvDefinition,
        freundlichExponent: form.freundlichExponent, influentMgL: (result.inputs.influentNgL ?? 0) / 1e6, targetMgL: (result.inputs.targetNgL ?? 0) / 1e6,
        carbonLifeSource: form.carbonLifeSource }, { signal: request.controller.signal });
      if (pendingCalculation.current !== request || request.signature !== currentInputs.current.signature || !currentInputs.current.active) return;
      result.workbook = workbook;
      result.theoreticalMediaM3 = result.totalMediaM3;
      result.requiredMediaM3 = workbook.requiredMediaM3;
      result.totalMediaM3 = workbook.operatingMediaM3;
      result.mediaPerVesselM3 = workbook.mediaPerVesselM3;
      result.vesselCount = workbook.operatingVessels;
      result.inputs.parallel = workbook.parallel;
      result.flowPerTrainM3H = result.flowM3H / workbook.parallel;
      result.ebctPerVesselMinutes = workbook.actualTotalEbctMinutes / workbook.series;
      result.version = workbook.version;
      result.assumptions = [workbook.execution.engine === 'microsoft_excel' ? 'Original workbook recalculated in Microsoft Excel; macros disabled, no VBA cost optimization; upright pressure design without bypass.' : 'Online Plan B: JavaScript port of supported workbook formulas, not Microsoft Excel. Upright pressure design only; no macros, cost optimization or PFAS removal prediction.', 'Required media volume and installed volume differ because dimensions are rounded.', 'Excel defaults for expansion, freeboard, density and redundancy require project review.', 'Workbook pipe-size lookups do not replace hydraulic verification.', 'Carbon life requires an entered source; PFAS effluent concentration is not predicted.'];
      if (form.referenceId && corpus) {
        result.evidence = { record: corpus.records.find((r: any) => r.id === form.referenceId), source: corpus.source, conditions: { waterType: form.waterType, tocMgL: form.tocMgL, media: form.media } };
      }
      setProposal(result); setMessage((workbook.execution.engine === 'microsoft_excel' ? 'Native Excel sizing calculated.' : 'Online Plan B formulas evaluated; Microsoft Excel was not run.') + ' Review the proposed change, then select Accept and apply.');
      record('Calculate GAC proposal', { designState: agent.designState, toolCall: workbook.toolCalls?.[0], tool: result.version, execution: workbook.execution, toolCalls: workbook.toolCalls, result });
      const displayUnits = useGacWorkflowStore.getState().unitSystem;
      useDesignStore.getState().addChatMessage('ai', `The proposed design has ${result.vesselCount} GAC vessels: ${result.inputs.series} in series per train, with ${result.inputs.parallel} operating train(s). Each vessel contains ${quantity(result.mediaPerVesselM3, 'volume', displayUnits)} of GAC. Total operating GAC volume is ${quantity(result.totalMediaM3, 'volume', displayUnits)}. This is a proposal; your design has not changed yet. Review it under Architecture, then select Accept and apply.`);
    } catch (e) {
      if (!request || (pendingCalculation.current === request && !request.controller.signal.aborted)) setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (request && pendingCalculation.current === request) { pendingCalculation.current = null; setCalculating(false); }
    }
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
          if (match[1] === 'flowUnit') {
            if (!['m3/h', 'gpm'].includes(match[2])) { setMessage('Choose m3/h or gpm.'); return; }
            useGacWorkflowStore.setState({ unitSystem: match[2] === 'gpm' ? 'us' : 'si' });
            useDesignStore.getState().addChatMessage('ai', 'Display units changed; physical inputs and sizing are unchanged.');
          } else {
            edit(match[1], fieldCanonical(match[1], match[2], unitSystem, form.flowUnit));
            useDesignStore.getState().addChatMessage('ai', `Recorded ${fieldLabel(match[1], match[1], unitSystem)} = ${match[2]}. Enter calculate when the design basis is complete.`);
          }
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
    setMessage('Sizing applied to the design.');
  }
  function exportCase() {
    const blob = new Blob([JSON.stringify({ schemaVersion: 'gac-case/1', displayUnitSystem: unitSystem, storageUnits: { flow: 'form.flowUnit', dimensions: 'ft', density: 'lb/ft3', concentrations: 'ng/L', graph: 'SI; see unit-suffixed keys', workbook: 'original workbook units; see unit-suffixed keys' }, form, proposal, accepted, graph, history,
      state: graph.nodes.some(n => n.attributes?.calculationState === 'stale') ? 'stale' : accepted ? 'applied' : 'concept' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'codesign_gac_case.json'; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="gac-panel" style={{ padding: 12, background: '#172033', fontSize: 12 }}>
    <button onClick={() => setOpen(!open)}>Design basis {open ? '−' : '+'}</button>
    {open && <div className="basis-inputs">
      {!active && <p>Select GAC workspace to apply changes.</p>}
      <div className="gac-fields">{['species', 'flow', 'averageFlow', 'totalEbctMinutes', 'series', 'bedDepthFt', 'heightFt', 'diameterFt', 'densityLbFt3', 'redundantVessels'].map(key => <label key={key} title={help(key)}>
        {fieldLabel(key, workbookFields[key]?.label, unitSystem)}
        {key === 'species' ? <select aria-label={key} title={help(key)} value={form[key]} onChange={e => edit(key, e.target.value)}><option value="">Select PFAS</option>{speciesOptions.map(s => <option key={s} value={s}>{s}</option>)}</select> : <GacUnitInput key={`${key}-${unitSystem}`} field={key} title={help(key)} value={form[key]} system={unitSystem} flowUnit={form.flowUnit} onChange={value => edit(key, value)} />}
      </label>)}</div>
      <label title={workbookFields.carbonLifeMode.definition}>Carbon life input type <select aria-label="carbonLifeMode" value={form.carbonLifeMode} onChange={e => edit('carbonLifeMode', e.target.value)}><option value="none">Not specified</option><option value="bv">Bed volumes to breakthrough</option><option value="months">Measured life (months)</option><option value="freundlich">Freundlich isotherm</option></select></label>
      {form.carbonLifeMode !== 'none' && <><label title={fieldHelp.carbonLifeValue}>{({ bv: 'Bed volumes to breakthrough', months: 'Carbon life (months)', freundlich: 'Freundlich Kf' } as Record<string, string>)[form.carbonLifeMode]}<GacUnitInput key={`carbonLifeValue-${unitSystem}`} field="carbonLifeValue" title={fieldHelp.carbonLifeValue} value={form.carbonLifeValue} system={unitSystem} flowUnit={form.flowUnit} onChange={value => edit('carbonLifeValue', value)} /></label>
        {form.carbonLifeMode === 'bv' && <label title="BV = treated water volume / reference media volume. PFAS Reference uses total media in the series train.">BV volume basis <select aria-label="bvDefinition" value={form.bvDefinition} onChange={e => edit('bvDefinition', e.target.value)}><option value="total_series">Total series media</option><option value="per_vessel">Single vessel media</option></select></label>}
        {form.carbonLifeMode === 'freundlich' && <div className="gac-fields">{['freundlichExponent', 'influentNgL', 'targetNgL'].map(key => <label key={key} title={workbookFields[key].definition}>{fieldLabel(key, 'Freundlich 1/n', unitSystem)}<GacUnitInput key={`${key}-${unitSystem}`} field={key} title={workbookFields[key].definition} value={form[key]} system={unitSystem} flowUnit={form.flowUnit} onChange={value => edit(key, value)} /></label>)}</div>}
      </>}
    </div>}
    <p>{form.species} · {fieldValue('flow', form, unitSystem)} · {formatNumber(form.totalEbctMinutes)} min EBCT</p>
    <button onClick={reviewInputs}>Review inputs</button>
    {reviewOpen && <div className="input-review">
      {review.issues.map((issue: any, i: number) => <p key={`issue-${i}`}><strong>Needs correction:</strong> {issue.message}</p>)}
      {review.questions.slice(0, 4).map((question: any, i: number) => <p key={`question-${i}`}>{question.text}</p>)}
      {review.canCalculate && <p>Inputs are ready for sizing.</p>}
      {review.suggestions.map((suggestion: any) => <div key={suggestion.id} className="input-suggestion"><p><strong>{suggestion.label}</strong></p><p>{suggestion.reason}</p><details><summary>Evidence (original workbook units)</summary><p>{suggestion.source}</p></details><button onClick={() => useSuggestion(suggestion)}>{suggestion.kind === 'study_scenario' ? 'Use as comparison scenario' : 'Use suggested inputs'}</button></div>)}
      <details><summary>Calculation scope</summary>{review.warnings.map((warning: string) => <p key={warning}>{warning}</p>)}</details>
    </div>}
    <p className="calculation-mode" title={calculationMode?.description}>{calculationMode?.label || 'Calculation engine will be confirmed by the API'}</p>
    {message && <p role="status">{message}</p>}
    <button title="Use the configured engine: local Excel tool-calling agent or online Plan B workbook formulas. Review and accept before applying changes." disabled={calculating} onClick={calculate}>{calculating ? 'Calculating...' : 'Calculate GAC sizing'}</button>
    <details className="case-export"><summary title="Export inputs, evidence, calculations, graph and decision history as JSON.">Case data</summary><button onClick={exportCase}>Export case + history</button></details>
  </section>;
}
