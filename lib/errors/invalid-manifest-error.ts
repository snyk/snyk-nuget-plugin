export class InvalidManifestError extends Error {
  public code = 422;
  public name = 'InvalidManifestError';

  public constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, InvalidManifestError);
  }
}
