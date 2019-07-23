export class FileNotFoundError extends Error {
  public code = 422;
  public name = 'FileNotFoundError';

  public constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, FileNotFoundError);
  }
}
