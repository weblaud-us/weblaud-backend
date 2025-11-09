import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  ValidationError,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { isArray } from 'class-validator';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let validationErrors: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Handle validation errors from class-validator
      if (
        status === HttpStatus.BAD_REQUEST &&
        typeof exceptionResponse === 'object' &&
        'message' in (exceptionResponse as any) &&
        isArray((exceptionResponse as any).message)
      ) {
        const validationMessages = (exceptionResponse as any).message as ValidationError[];
        validationErrors = this.formatValidationErrors(validationMessages);
        message = 'Validation failed';
        error = 'Bad Request';
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        error = (exceptionResponse as any).error || error;
      } else {
        message = exceptionResponse;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    // Log error
    this.logger.error(
      `${request.method} ${request.url} ${status}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );

    // Build response
    const responseBody: any = {
      success: false,
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Add validation errors if they exist
    if (validationErrors) {
      responseBody.errors = validationErrors;
    }

    // Send response
    response.status(status).json(responseBody);
  }

  private formatValidationErrors(errors: ValidationError[]): Array<{ field: string; errors: string[] }> {
    const result: Array<{ field: string; errors: string[] }> = [];
    
    for (const error of errors) {
      if (error.constraints) {
        result.push({
          field: error.property,
          errors: Object.values(error.constraints),
        });
      }
      
      // Handle nested validation errors
      if (error.children && error.children.length > 0) {
        const children = this.formatValidationErrors(error.children);
        result.push(...children);
      }
    }
    
    return result;
  }
}