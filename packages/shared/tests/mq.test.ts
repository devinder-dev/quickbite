import { describe, expect, test } from "bun:test";
import { backoffMs } from "../src/mq.ts";

// Pure unit test of the retry-backoff math — separate from the integration
// tests (in each service's tests/) that exercise real retry/dead-letter
// behavior against a real RabbitMQ.
describe("backoffMs", () => {
  test("doubles the delay on each retry: 1s, 2s, 4s", () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
  });
});
