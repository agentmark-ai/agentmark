/**
 * Setup script to generate pre-built JSON fixtures from MDX test files.
 * This re-exports the shared test utilities from @agentmark/prompt-core/test-utils.
 */
import path from "path";
import { createFixtureHelpers } from "../src/test-utils";

const fixturesDir = path.join(__dirname, "fixtures");
const helpers = createFixtureHelpers(fixturesDir);

export const setupFixtures = helpers.setupFixtures;
export const cleanupFixtures = helpers.cleanupFixtures;
export const buildFixture = helpers.buildFixture;

// Run if called directly
if (process.argv[1] === __filename) {
  setupFixtures().then(() => {
    console.log("Fixtures built successfully");
  }).catch((error) => {
    console.error("Failed to build fixtures:", error);
    process.exit(1);
  });
}
