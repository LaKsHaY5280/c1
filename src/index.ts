import { runPipeline } from "./pipeline/run-pipeline";

runPipeline().catch((err) => {
  console.error((err as Error).message ?? err);
  process.exit(1);
});
