import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

interface ValidationError {
  field: string;
  message: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: ValidationError[] | null = null;
    // Machine-readable details an exception carries, e.g. code: PLAN_LIMIT or MFA_REQUIRED.
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || exception.message;
        const { message: _m, statusCode: _s, error: _e, ...rest } = resp;
        details = rest;

        // Handle class-validator errors
        if (Array.isArray(resp.message)) {
          message = 'Validation failed';
          errors = (resp.message as string[]).map((msg) => {
            const parts = msg.split(' ');
            return {
              field: parts[0] || 'unknown',
              message: msg,
            };
          });
        }
      }
    } else if (exception instanceof Error) {
      // Unexpected errors (database, network, bugs) are logged in full but not
      // described to the client: their messages can reveal queries and hosts.
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status}: ${exception instanceof Error ? exception.message : message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      ...details,
      statusCode: status,
      message,
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
