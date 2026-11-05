/** Server-selected engine: local native Excel, or explicitly labeled online Plan B. */
export async function executeExcelWorkbook(inputs: Record<string, unknown>, options: { signal?: AbortSignal } = {}): Promise<any> {
  let response: Response;
  try {
    response = await fetch('/api/gac/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs }), signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('The calculation API is unavailable. No proposal was applied. Start the local API for Excel, or use the online backup.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Calculation failed. No proposal was applied.');
  const native = body.execution?.engine === 'microsoft_excel' && body.execution.recalculated === true;
  const backup = body.execution?.engine === 'javascript_formula_port' && body.execution.mode === 'online_plan_b' && body.execution.evaluated === true && body.execution.recalculated === false;
  if (!native && !backup) throw new Error('The API did not return a recognized calculation engine and execution record.');
  return body;
}
