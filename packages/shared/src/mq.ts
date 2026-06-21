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
    ack: (...args: Parameters<Channel["ack"]>) => current!.ack(...args),
    nack: (...args: Parameters<Channel["nack"]>) => current!.nack(...args),
  };
}

export type ResilientChannel = ReturnType<typeof createResilientChannel>;

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

  await channel.prefetch(prefetch);
  await channel.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const routingKey = msg.fields.routingKey as EventName;
      const schema = eventSchemas[routingKey];
      const event = schema.parse(JSON.parse(msg.content.toString()));
      await handler(event, msg);
      channel.ack(msg);
    } catch (err) {
      // Reject without requeue -> message goes to the dead-letter queue.
      // TODO: add bounded retry-with-backoff before dead-lettering.
      console.error(`[mq] handler failed on ${msg.fields.routingKey}, dead-lettering`, err);
      channel.nack(msg, false, false);
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
