import type { Alias } from "../../shared/contracts.ts";

export class RouterError extends Error {
  readonly status: number;
  readonly type: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly alias?: Alias;

  constructor(input: {
    status: number;
    type: string;
    code: string;
    message: string;
    retryable?: boolean;
    alias?: Alias;
  }) {
    super(input.message);
    this.status = input.status;
    this.type = input.type;
    this.code = input.code;
    this.retryable = input.retryable === true;
    this.alias = input.alias;
  }
}

export function errorBody(err: RouterError, requestId: string) {
  return {
    error: {
      type: err.type,
      code: err.code,
      message: err.message,
      request_id: requestId,
      alias: err.alias,
      retryable: err.retryable,
    },
  };
}
