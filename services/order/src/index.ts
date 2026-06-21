import { connect } from "@quickbite/shared";
import { buildServer } from "./server.ts";
import { startOutboxPoller } from "./outbox.ts";

const PORT = Number(process.env.PORT ?? 3002);
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

// Connect to RabbitMQ (the poller needs the channel), start the poller,
// build the server, then start listening. The HTTP server and the poller
// run concurrently for the lifetime of this process.
connect(RABBITMQ_URL)
  .then(({ channel }) => {
    startOutboxPoller(channel);
    return buildServer();
  })
  .then((server) => server.listen({ port: PORT, host: "0.0.0.0" }))
  .then(() => console.log(`🚀 order on ${PORT}`))
  .catch((err) => {
    console.error("❌ order failed to start", err);
    process.exit(1);
  });
