import Redis from "ioredis";

const EVENT_SEEN_TTL_SECONDS = 60 * 60 * 24; // 24h — comfortably covers any realistic redelivery window

/**
 * Durable, shared event-dedupe check. Replaces the old in-memory Set
 * (lost on every restart, which defeated the point — RabbitMQ redelivers
 * unacked messages after exactly the kind of reconnect/restart that would
 * have wiped it). One Redis instance, one source of truth.
 *
 * `namespace` scopes the key per CONSUMER, not just per event. The same
 * order.placed eventId is delivered to both kitchen and notification on
 * separate queues — without a namespace, whichever service processes it
 * first would mark the bare eventId as seen, and the other consumer's
 * check would then see it as a false duplicate and skip an event it has
 * never actually handled. Pass the service/queue name so each consumer
 * gets its own independent dedupe space, matching what separate in-memory
 * Sets gave each service for free before this change.
 */
export class RedisIdempotency {
  private readonly redis: Redis;
  private readonly namespace: string;

  // redisUrl is read from process.env here, inside the constructor, rather
  // than into a module-level constant at import time — a test (or any
  // caller) that sets REDIS_URL before constructing this class must have
  // that value actually take effect, even if @quickbite/shared was already
  // imported earlier with no REDIS_URL set yet.
  constructor(namespace: string, redisUrl: string = process.env.REDIS_URL ?? "redis://localhost:6379") {
    this.namespace = namespace;
    this.redis = new Redis(redisUrl);
  }

  /**
   * SET event:{namespace}:{eventId} 1 EX 86400 NX — atomic check-and-mark
   * in one round-trip. WHY one command instead of GET-then-SET: a separate
   * GET followed by a SET has a race window between the two calls where
   * two concurrent deliveries of the same redelivered message could both
   * see "not seen yet" and both proceed. NX makes the check and the mark
   * a single atomic operation, so only one delivery can ever win it.
   */
  async alreadyProcessed(eventId: string): Promise<boolean> {
    const result = await this.redis.set(
      `event:${this.namespace}:${eventId}`,
      "1",
      "EX",
      EVENT_SEEN_TTL_SECONDS,
      "NX",
    );
    return result === null;
  }
}
