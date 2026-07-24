/** Application error carrying an HTTP status code and stable error code. */
export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (msg: string, code = 'BAD_REQUEST') => new AppError(400, code, msg);
export const unauthorized = (msg = 'Authentication required', code = 'UNAUTHORIZED') =>
  new AppError(401, code, msg);
export const forbidden = (msg = 'Forbidden', code = 'FORBIDDEN') => new AppError(403, code, msg);
export const notFound = (msg = 'Not found', code = 'NOT_FOUND') => new AppError(404, code, msg);
export const conflict = (msg: string, code = 'CONFLICT') => new AppError(409, code, msg);
