export class MemoLMError extends Error {
  public status?: number;
  public errorData?: any;

  constructor(message: string, status?: number, errorData?: any) {
    super(message);
    this.name = "MemoLMError";
    this.status = status;
    this.errorData = errorData;
    Object.setPrototypeOf(this, MemoLMError.prototype);
  }
}

export class GatewayUnavailableError extends MemoLMError {
  constructor(message: string) {
    super(message, undefined);
    this.name = "GatewayUnavailableError";
    Object.setPrototypeOf(this, GatewayUnavailableError.prototype);
  }
}

export class SafetyGateRejectionError extends MemoLMError {
  public rejectionReasons: string[];

  constructor(message: string, rejectionReasons: string[] = []) {
    super(message, 400);
    this.name = "SafetyGateRejectionError";
    this.rejectionReasons = rejectionReasons;
    Object.setPrototypeOf(this, SafetyGateRejectionError.prototype);
  }
}

export class UpstreamProviderError extends MemoLMError {
  constructor(message: string, status = 502, errorData?: any) {
    super(message, status, errorData);
    this.name = "UpstreamProviderError";
    Object.setPrototypeOf(this, UpstreamProviderError.prototype);
  }
}
