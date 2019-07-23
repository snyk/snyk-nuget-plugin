export class BigTreeError extends Error {
  public code = 422;
  public name = 'BigTreeError';

  public constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, BigTreeError);
  }
}
