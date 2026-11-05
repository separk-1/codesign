import OpenAI from 'openai';
import { calculateExcelWorkbook, normalizeExcelInputs, ExcelToolError } from './gacExcelBridge.js';

export const excelCalculationTool = { type: 'function', function: {
  name: 'calculate_gac_excel',
  description: 'Recalculate the fixed GAC source workbook using Microsoft Excel, with the current validated inputs. Uses a disposable copy, disables macros, returns native cell values and formula provenance. Does not edit user inputs or apply a graph proposal.',
  strict: true, parameters: { type: 'object', properties: {}, required: [], additionalProperties: false }
} };
export function createGacClient() {
  return process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25000, maxRetries: 0 }) : null;
}
/** The UI calculation command is explicit authorization to call this one bounded tool. */
export async function runGacCalculationAgent(rawInputs, dependencies = {}) {
  const inputs = normalizeExcelInputs(rawInputs);
  const client = Object.hasOwn(dependencies, 'client') ? dependencies.client : createGacClient();
  const execute = dependencies.execute || calculateExcelWorkbook;
  let toolCallId = 'direct-' + crypto.randomUUID();
  let agentMode = 'direct_excel_tool', apiError;
  if (client) {
    try {
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        messages: [{ role: 'system', content: 'The user requested a GAC calculation using the current validated design. Call calculate_gac_excel exactly once with an empty object. Input values are bound by the server and cannot be overridden by the model. Do not invent results or execute any other action.' },
          { role: 'user', content: 'Calculate the current reviewed GAC design in Excel.' }],
        tools: [excelCalculationTool], tool_choice: { type: 'function', function: { name: 'calculate_gac_excel' } },
        parallel_tool_calls: false, max_completion_tokens: 500
      });
      const calls = response.choices?.[0]?.message?.tool_calls || [];
      if (calls.length !== 1 || calls[0].type !== 'function' || calls[0].function.name !== 'calculate_gac_excel' || Object.keys(JSON.parse(calls[0].function.arguments)).length !== 0) throw new Error('Unexpected calculation tool request.');
      toolCallId = calls[0].id;
      agentMode = 'llm_excel_tool';
    } catch (error) {
      // Explicit Calculate still runs the real Excel tool when AI is unavailable.
      // This mode is exported, never represented as an LLM call.
      apiError = { status: error.status || null, code: error.code || 'llm_tool_request_failed' };
    }
  }
  const startedAt = new Date().toISOString();
  const result = await execute(inputs);
  if (result.execution?.engine !== 'microsoft_excel' || !result.execution.recalculated) throw new ExcelToolError('Tool did not return a native recalculation.', 'invalid_tool_result');
  return { ...result, execution: { ...result.execution, agentMode, ...(apiError ? { apiError } : {}) },
    toolCalls: [{ id: toolCallId, name: 'calculate_gac_excel', arguments: {}, resolvedInputs: inputs, invokedBy: agentMode === 'llm_excel_tool' ? 'llm' : 'user_calculate_command', startedAt, completedAt: result.execution.completedAt, status: 'succeeded', engine: 'microsoft_excel', runId: result.execution.runId }] };
}
