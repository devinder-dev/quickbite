import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { EXCHANGE, eventSchemas, type EventName } from "./events";

/**
 * Connect to RabbitMQ and assert the shared topic exchange.
 * Call once per service on startup.
 */
export async function connect(url: string): Promise<{ conn: ChannelModel; channel: Channel }> {
  const conn = await amqp.connect(url);
  const channel = await conn.createChannel();
  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  return { conn, channel };
}

/**
 * Publish an event. The payload is validated against its schema BEFORE it
 * leaves the service, so a malformed event can never enter the bus.
 *
 * Rule: only call this AFTER your local DB transaction has committed
 * (outbox pattern preferred). See CLAUDE.md.
 */
export function publish(channel: Channel, routingKey: EventName, payload: unknown): void {
  const valid = eventSchemas[routingKey].parse(payload);
  channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(valid)), {
    persistent: true,
    contentType: "application/json",
  });
}

export interface ConsumeOptions {
  /** Durable queue name, unique per service (e.g. "kitchen.order-events"). */
  queue: string;
  /** Which routing keys this queue binds to. */
  routingKeys: EventName[];
  prefetch?: number;
}

/**
 * Subscribe to events. Sets up a durable queue bound to the given routing
 * keys, plus a dead-letter queue: any message the handler throws on is
 * routed to "<queue>.dlq" instead of looping forever.
 *
 * The handler MUST be idempotent — RabbitMQ can redeliver. Dedupe on
 * event.eventId (see Idempotency helper below).
 */
export async function consume(
  channel: Channel,
  opts: ConsumeOptions,
  handler: (event: unknown, raw: ConsumeMessage) => Promise<void>,
): Promise<void> {
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
 * Minimal idempotency guard. Swap the in-memory Set for a DB table
 * (processed_events) so it survives restarts. See CLAUDE.md.
 */
export class Idempotency {
  private readonly seen = new Set<string>();
  alreadyProcessed(eventId: string): boolean {
    if (this.seen.has(eventId)) return true;
    this.seen.add(eventId);
    return false;
  }
}
