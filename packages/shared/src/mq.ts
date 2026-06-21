import amqp, { type Channel, type ChannelModel, type RecoveringChannelModel, type ConsumeMessage } from "amqplib";
import { EXCHANGE, eventSchemas, type EventName } from "./events";

export interface ConsumeOptions {
  /** Durable queue name, unique per service (e.g. "kitchen.order-events"). */
  queue: string;
  /** Which routing keys this queue binds to. */
  routingKeys: EventName[];
  prefetch?: number;
}

type Handler = (event: unknown, raw: ConsumeMessage) => Promise<void>;

/**
 * A stable object whose methods always forward to whichever real amqplib
 * Channel is currently live. After RabbitMQ drops the connection and
 * amqplib's recovery feature reconnects, the underlying Channel gets
 * replaced — but every service holds onto THIS wrapper for the lifetime of
 * the process, so a reconnect is invisible to publish()/consume() callers.
 *
 * `registrations` records every consume() call so the reconnect setup
 * callback (see connect() below) can replay them on the fresh channel —
 * without this, a service would silently stop receiving messages after a
 * reconnect even though nothing threw.
 */
function createResilientChannel() {
  let current: Channel | null = null;
  const registrations: { opts: ConsumeOptions; handler: Handler }[] = [];

  return {
    registrations,
    setCurrent(channel: Channel): void {
      current = channel;
    },
    assertExchange: (...args: Parameters<Channel["assertExchange"]>) => current!.assertExchange(...args),
    assertQueue: (...args: Parameters<Channel["assertQueue"]>) => current!.assertQueue(...args),
    bindQueue: (...args: Parameters<Channel["bindQueue"]>) => current!.bindQueue(...args),
    prefetch: (...args: Parameters<Channel["prefetch"]>) => current!.prefetch(...args),
    consume: (...args: Parameters<Channel["consume"]>) => current!.consume(...args),
    publish: (...args: Parameters<Channel["publish"]>) => current!.publish(...args),
    sendToQueue: (...args: Parameters<Channel["sendToQueue"]>) => current!.sendToQueue(...args),
    ack: (...args: Parameters<Channel["ack"]>) => current!.ack(...args),
    nack: (...args: Parameters<Channel["nack"]>) => current!.nack(...args),
  };
}

export type ResilientChannel = ReturnType<typeof createResilientChannel>;

const MAX_RETRIES = 3;

// Exponential backoff: 1s, 2s, 4s for retryCount 0, 1, 2. Exported so it has
// its own unit test, separate from the integration-level retry behavior.
export function backoffMs(retryCount: number): number {
  return 1000 * 2 ** retryCount;
}

// The actual queue/binding/consumer setup, extracted so it can run both for
// a brand-new consume() call AND be replayed for every past registration
// after a reconnect. All operations here are idempotent AMQP declarations —
// asserting something that already exists with the same properties is a
// no-op, so replaying this is always safe.
async function setupConsumer(channel: ResilientChannel, opts: ConsumeOptions, handler: Handler): Promise<void> {
  const { queue, routingKeys, prefetch = 10 } = opts;

  const dlx = `${EXCHANGE}.dlx`;
  const dlq = `${queue}.dlq`;
  await channel.assertExchange(dlx, "topic", { durable: true });
  await channel.assertQueue(dlq, { durable: true });
  await channel.bindQueue(dlq, dlx, "#");

  await channel.assertQueue(queue, { durable: true, deadLetterExchange: dlx });
  for (const key of routingKeys) await channel.bindQueue(queue, EXCHANGE, key);

  // The retry queue holds failed messages for a per-message TTL (set on
  // each republish below, not on the queue itself — that's what lets each
  // retry wait longer than the last). No bindings of its own: messages only
  // ever arrive here via sendToQueue. When a message's TTL expires,
  // RabbitMQ's default behavior for an expired message is to dead-letter it
  // — here, to the original queue (via the nameless default exchange +
  // deadLetterRoutingKey), which is exactly a delayed redelivery.
  const retryQueue = `${queue}.retry`;
  await channel.assertQueue(retryQueue, {
    durable: true,
    deadLetterExchange: "",
    deadLetterRoutingKey: queue,
  });

  await channel.prefetch(prefetch);
  await channel.consume(queue, async (msg) => {
    if (!msg) return;
    // A message redelivered via the retry queue arrives through the default
    // exchange with msg.fields.routingKey set to the QUEUE name, not the
    // original event's routing key — so a retried message must carry its
    // true routing key forward in a header instead of relying on that field
    // a second time. Fresh (never-retried) deliveries fall back to the
    // field, which is correct for them.
    const routingKey = (msg.properties.headers?.["x-original-routing-key"] as EventName) ?? (msg.fields.routingKey as EventName);

    try {
      const schema = eventSchemas[routingKey];
      const event = schema.parse(JSON.parse(msg.content.toString()));
      await handler(event, msg);
      channel.ack(msg);
    } catch (err) {
      const retryCount = (msg.properties.headers?.["x-retry-count"] as number) ?? 0;

      if (retryCount < MAX_RETRIES) {
        const delayMs = backoffMs(retryCount);
        console.error(`[mq] handler failed on ${routingKey}, retry ${retryCount + 1}/${MAX_RETRIES} in ${delayMs}ms`, err);
        channel.sendToQueue(retryQueue, msg.content, {
          ...msg.properties,
          headers: {
            ...msg.properties.headers,
            "x-retry-count": retryCount + 1,
            "x-original-routing-key": routingKey,
          },
          expiration: String(delayMs),
        });
        // We've taken ownership of this message via the retry queue — ack
        // it off the original queue so it isn't also sent to the DLX.
        channel.ack(msg);
      } else {
        // Retries exhausted — nack without requeue, same as before Phase 4.
        // The original queue's deadLetterExchange routes this to the
        // permanent DLQ; that wiring is untouched.
        console.error(`[mq] handler failed on ${routingKey} after ${MAX_RETRIES} retries, dead-lettering`, err);
        channel.nack(msg, false, false);
      }
    }
  });
}

/**
 * Connect to RabbitMQ with automatic reconnection enabled (amqplib's
 * opt-in `recovery` option). `setup` runs after the FIRST connect AND every
 * reconnect — recreating the channel, re-asserting the main exchange, and
 * replaying every consumer registered so far. This is the only place that
 * touches the real amqplib Channel; every caller gets the resilient
 * wrapper instead, so a reconnect is transparent to the rest of the app.
 *
 * Call once per service on startup.
 */
export async function connect(url: string): Promise<{ conn: RecoveringChannelModel; channel: ResilientChannel }> {
  const resilient = createResilientChannel();

  const conn = await amqp.connect(url, {
    recovery: {
      initialDelay: 200,
      maxDelay: 5000,
      factor: 2,
      jitter: 0.2,
      maxRetries: Infinity,
      async setup(model: ChannelModel) {
        const channel = await model.createChannel();
        await channel.assertExchange(EXCHANGE, "topic", { durable: true });
        resilient.setCurrent(channel);

        for (const { opts, handler } of resilient.registrations) {
          await setupConsumer(resilient, opts, handler);
        }
      },
    },
  });

  conn.on("connect", () => console.log("✅ [mq] connected"));
  conn.on("disconnect", (err) => console.warn(`⚠️ [mq] disconnected, will retry: ${err.message}`));
  conn.on("reconnect-failed", (err) => console.error(`❌ [mq] reconnect attempt failed: ${err.message}`));
  // An EventEmitter's "error" event with no listener crashes the whole
  // process in Node/Bun. RecoveringChannelModel can emit one independently
  // of "disconnect" (e.g. a connection torn down mid-handshake) — without
  // this handler, that single event would take the entire service down.
  conn.on("error", (err) => console.error(`❌ [mq] connection error: ${err.message}`));

  return { conn, channel: resilient };
}

/**
 * Publish an event. The payload is validated against its schema BEFORE it
 * leaves the service, so a malformed event can never enter the bus.
 *
 * Rule: only call this AFTER your local DB transaction has committed
 * (outbox pattern preferred). See CLAUDE.md.
 */
export function publish(channel: ResilientChannel, routingKey: EventName, payload: unknown): void {
  const valid = eventSchemas[routingKey].parse(payload);
  channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(valid)), {
    persistent: true,
    contentType: "application/json",
  });
}

/**
 * Subscribe to events. Sets up a durable queue bound to the given routing
 * keys, plus a dead-letter queue: any message the handler throws on is
 * routed to "<queue>.dlq" instead of looping forever. Registers itself so
 * the connection survives a reconnect (see connect() above).
 *
 * The handler MUST be idempotent — RabbitMQ can redeliver. Dedupe on
 * event.eventId (see Idempotency helper below).
 */
export async function consume(channel: ResilientChannel, opts: ConsumeOptions, handler: Handler): Promise<void> {
  channel.registrations.push({ opts, handler });
  await setupConsumer(channel, opts, handler);
}
