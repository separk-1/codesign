/** Native Excel only. Failure never falls back to the JavaScript formula port. */
export async function executeExcelWorkbook(inputs: Record<string, unknown>, options: { signal?: AbortSignal } = {}): Promise<any> {
  let response: Response;
  try {
    response = await fetch('/api/gac/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs }), signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Native Excel calculation needs the local API and Microsoft Excel. No fallback calculation was applied.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Excel calculation failed. No fallback calculation was applied.');
  if (body.execution?.engine !== 'microsoft_excel' || body.execution?.recalculated !== true) throw new Error('The API did not return a verified native Excel calculation.');
  return body;
}
