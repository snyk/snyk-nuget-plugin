export class InvalidTargetFile extends Error {
  public code = 422;
  public name = 'InvalidTargetFile';

  public constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, InvalidTargetFile);
  }
}
