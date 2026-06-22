import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Registers a real DOM globally so component tests can use
// @testing-library/react under plain `bun test` — no jsdom needed.
GlobalRegistrator.register();

// @testing-library/react's `screen` binds to `document.body` once, at
// MODULE-LOAD time — and ESM hoists all `import` statements above any
// other code, regardless of where they're written. A static
// `import { cleanup } from "@testing-library/react"` at the top of this
// file would therefore load testing-library BEFORE the GlobalRegistrator
// call above ever runs, permanently breaking every `screen.*` query for the
// rest of the process. A dynamic import, after registration, avoids that.
const { cleanup } = await import("@testing-library/react");

// Without this, every test's rendered output stays in the shared happy-dom
// document (`bun test` runs all files in one process), so a later test's
// getByText() can match leftover elements from an earlier test/file and
// throw "multiple elements found" — unmount + clear the DOM after each test.
afterEach(() => {
  cleanup();
});
