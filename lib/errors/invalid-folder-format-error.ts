export class InvalidFolderFormatError extends Error {
  public code = 422;
  public name = 'InvalidFolderFormat';

  public constructor(...args) {
    super(...args);
    Error.captureStackTrace(this, InvalidFolderFormatError);
  }
}
