// No framework, per scripts/README.md's ethos ("deterministic checks...
// anything that must give the same answer twice") -- each test module
// exports a `run()` that throws on assertion failure.
import * as fusion from "./fusion.test";
import * as ingest from "./ingest.test";
import * as gdacsIngest from "./gdacs-ingest.test";

const tests: Array<[string, () => Promise<void>]> = [
  ["fusion.test.ts", fusion.run],
  ["ingest.test.ts", ingest.run],
  ["gdacs-ingest.test.ts", gdacsIngest.run],
];

async function main(): Promise<void> {
  let failed = 0;
  for (const [name, run] of tests) {
    try {
      await run();
      console.log(`PASS ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${name}`);
      console.error(err);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed}/${tests.length} test file(s) failed`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${tests.length} test file(s) passed`);
  }
}

main();
