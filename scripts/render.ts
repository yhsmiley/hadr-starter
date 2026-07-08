// Thin CLI entrypoint the `sitrep` Claude Code skill runs (see
// skills/sitrep/SKILL.md) after it writes pending narratives back to
// state/incidents.json. Deliberately does nothing else -- rendering stays
// fully deterministic even though this script's caller is the LLM step.
import { writeDashboardFile } from "../src/render/writeDashboard";

writeDashboardFile()
  .then(() => console.log("dashboard.html regenerated"))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
