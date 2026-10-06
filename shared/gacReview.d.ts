export function unknownValue(value: unknown): boolean;
export function workbookInputs(form: Record<string, string>): any;
export function reviewGacInputs(form: Record<string, string>, model: any, corpus?: any): {
  issues: any[]; missing: string[]; questions: any[]; suggestions: any[]; warnings: string[]; canCalculate: boolean;
};
