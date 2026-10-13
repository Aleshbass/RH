/**
 * Make a user an admin.
 * Usage: node scripts/make-admin.js <usersTableId> [--prod]
 *
 * users:bootstrapAdmin is an internal mutation, so it is run through the Convex CLI with
 * your deploy credentials (it cannot be called from a browser or ConvexHttpClient).
 */
const { execFileSync } = require("child_process");

const [userId, flag] = process.argv.slice(2);
if (!userId) {
  console.error("Usage: node scripts/make-admin.js <usersTableId> [--prod]");
  process.exit(1);
}
const args = ["convex", "run", "users:bootstrapAdmin", JSON.stringify({ userId })];
if (flag === "--prod") args.push("--prod");
execFileSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
