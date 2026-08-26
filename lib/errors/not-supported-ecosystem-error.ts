export class NotSupportedEcosystem extends Error {
  public code = 422;
  public name = 'NotSupportedEcosystem';

  public constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, NotSupportedEcosystem);
  }
}
