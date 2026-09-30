import { describe, it, expect } from "vitest";
import {
  MemoLMError,
  GatewayUnavailableError,
  SafetyGateRejectionError,
  UpstreamProviderError,
} from "../src/errors";

describe("error classes", () => {
  it("MemoLMError has correct name and properties", () => {
    const err = new MemoLMError("something failed", 400, { detail: "x" });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MemoLMError);
    expect(err.name).toBe("MemoLMError");
    expect(err.message).toBe("something failed");
    expect(err.status).toBe(400);
    expect(err.errorData).toEqual({ detail: "x" });
  });

  it("GatewayUnavailableError is a MemoLMError with no status", () => {
    const err = new GatewayUnavailableError("cannot reach gateway");
    expect(err).toBeInstanceOf(MemoLMError);
    expect(err.name).toBe("GatewayUnavailableError");
    expect(err.status).toBeUndefined();
  });

  it("SafetyGateRejectionError carries rejection reasons and status 400", () => {
    const err = new SafetyGateRejectionError("rejected", ["reason_a", "reason_b"]);
    expect(err).toBeInstanceOf(MemoLMError);
    expect(err.name).toBe("SafetyGateRejectionError");
    expect(err.status).toBe(400);
    expect(err.rejectionReasons).toEqual(["reason_a", "reason_b"]);
  });

  it("SafetyGateRejectionError defaults to empty reasons array", () => {
    const err = new SafetyGateRejectionError("rejected");
    expect(err.rejectionReasons).toEqual([]);
  });

  it("UpstreamProviderError has correct name and default status 502", () => {
    const err = new UpstreamProviderError("groq error");
    expect(err).toBeInstanceOf(MemoLMError);
    expect(err.name).toBe("UpstreamProviderError");
    expect(err.status).toBe(502);
  });

  it("instanceof checks work correctly across class hierarchy", () => {
    const safety = new SafetyGateRejectionError("x");
    const upstream = new UpstreamProviderError("y");
    const gateway = new GatewayUnavailableError("z");

    expect(safety instanceof MemoLMError).toBe(true);
    expect(upstream instanceof MemoLMError).toBe(true);
    expect(gateway instanceof MemoLMError).toBe(true);

    // Cross-type checks should fail
    expect(safety instanceof UpstreamProviderError).toBe(false);
    expect(upstream instanceof SafetyGateRejectionError).toBe(false);
  });
});
