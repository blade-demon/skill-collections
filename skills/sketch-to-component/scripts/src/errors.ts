export type ExtractErrorCode =
  | 'file-not-found'
  | 'read-failed'
  | 'not-a-sketch-zip'
  | 'corrupt-archive'
  | 'missing-entry'
  | 'bad-entry';

export class ExtractError extends Error {
  readonly code: ExtractErrorCode;

  constructor(code: ExtractErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExtractError';
    this.code = code;
  }
}

export function isNodeErrorWithCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof error.code === 'string';
}
