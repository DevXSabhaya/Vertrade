import { HttpStatus } from '@nestjs/common';
import { CorrelationIdStore } from '@core/correlation/correlation-id.store';
import { BusinessException } from './business.exception';
import { InfrastructureException } from './infrastructure.exception';
import { ValidationException } from './validation.exception';
import { BrokerException } from './broker.exception';

describe('Exception framework', () => {
  it('BusinessException carries the correct code and HTTP status', () => {
    const exception = new BusinessException('rule violated');
    expect(exception.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(exception.httpStatus).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(exception.message).toBe('rule violated');
  });

  it('InfrastructureException carries the correct code and HTTP status', () => {
    const exception = new InfrastructureException('db unavailable');
    expect(exception.code).toBe('INFRASTRUCTURE_ERROR');
    expect(exception.httpStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('ValidationException carries field errors alongside the message', () => {
    const exception = new ValidationException('invalid input', [
      'field is required',
    ]);
    expect(exception.code).toBe('VALIDATION_ERROR');
    expect(exception.httpStatus).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.errors).toEqual(['field is required']);
  });

  it('BrokerException carries the correct code and HTTP status', () => {
    const exception = new BrokerException('broker rejected order');
    expect(exception.code).toBe('BROKER_ERROR');
    expect(exception.httpStatus).toBe(HttpStatus.BAD_GATEWAY);
  });

  it('automatically stamps a timestamp on every exception', () => {
    const exception = new BusinessException('rule violated');
    expect(typeof exception.timestamp).toBe('string');
  });

  it('automatically stamps the active correlation id on every exception', () => {
    CorrelationIdStore.run('exception-correlation-id', () => {
      const exception = new BusinessException('rule violated');
      expect(exception.correlationId).toBe('exception-correlation-id');
    });
  });
});
