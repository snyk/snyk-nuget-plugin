export class CliCommandError extends Error {
    public code = 422;
    public name = 'CliCommandError';

    public constructor(...args) {
        super(...args);
        Error.captureStackTrace(this, CliCommandError);
    }
}
