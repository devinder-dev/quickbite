import { connect } from "@quickbite/shared";
import { buildServer } from "./server.ts";
import { startOutboxPoller } from "./outbox.ts";
import { startOrderEventConsumer } from "./order-events.ts";

const PORT = Number(process.env.PORT ?? 3002);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

// Connect to RabbitMQ (the poller needs the channel), start the poller,
// subscribe to kitchen's events so order's OWN row reflects the real
// status (kitchen only ever updates its own database otherwise), build the
// server, then start listening.
connect(RABBITMQ_URL)
  .then(async ({ channel }) => {
    startOutboxPoller(channel);
    await startOrderEventConsumer(channel);
    return buildServer();
  })
  .then((server) => server.listen({ port: PORT, host: "0.0.0.0" }))
  .then(() => console.log(`🚀 order on ${PORT}`))
  .catch((err) => {
    console.error("❌ order failed to start", err);
    process.exit(1);
  });
