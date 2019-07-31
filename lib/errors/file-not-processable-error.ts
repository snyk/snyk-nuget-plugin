export class FileNotProcessableError extends Error {
  public code = 422;
  public name = 'FileNotProcessableError';

  public constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, FileNotProcessableError);
  }
}
