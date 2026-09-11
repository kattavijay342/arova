// `mammoth` ships no TypeScript types and none exist on npm (@types/mammoth
// doesn't exist) — this declares only the one function this project calls.
declare module "mammoth" {
  export interface ExtractRawTextResult {
    value: string;
    messages: unknown[];
  }

  export function extractRawText(input: { buffer: Buffer }): Promise<ExtractRawTextResult>;
}
