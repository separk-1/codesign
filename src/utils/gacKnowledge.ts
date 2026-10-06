import { consultKnowledge } from '../../shared/gacKnowledgeEngine.js';
let pending: Promise<any> | undefined;
export function loadKnowledge() {
  return pending ||= fetch('/knowledge/gac_knowledge.json').then(r => {
    if (!r.ok) throw new Error('Workbook knowledge could not be loaded.');
    return r.json();
  }).catch(e => { pending = undefined; throw e; });
}
export async function retrieveKnowledge(query: string, form: Record<string, string>, graph: any) {
  return consultKnowledge(await loadKnowledge(), { query, form, graph });
}
export async function askWorkbookAssistant(query: string, context: any, fallback: any) {
  const report = (status: string) => window.dispatchEvent(new CustomEvent('gac-api-status', { detail: status }));
  try {
    const response = await fetch('/api/gac/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, context }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) { report('Local reply · API request failed'); return fallback; }
    const result = await response.json();
    report(result.mode === 'llm_workbook_context' ? 'AI API connected'
      : result.apiError?.code === 'invalid_api_key' ? 'Local reply · invalid API key'
      : result.apiError ? 'Local reply · API request failed' : 'Local reply · AI unavailable');
    return typeof result.message === 'string' ? result : fallback;
  } catch { report('Local reply · API unavailable'); return fallback; }
}
