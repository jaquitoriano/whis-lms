// Runs the Supabase CLI. On machines without Docker (e.g. Fedora with rootless Podman), points
// it at Podman's Docker-compatible socket, so `npm run db:start` works with no shell setup.
// Enable that socket once with:  systemctl --user enable --now podman.socket
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const env = { ...process.env };
if (!env.DOCKER_HOST && !existsSync("/var/run/docker.sock")) {
  const runtime = env.XDG_RUNTIME_DIR ?? (process.getuid ? `/run/user/${process.getuid()}` : "");
  const podman = `${runtime}/podman/podman.sock`;
  if (runtime && existsSync(podman)) env.DOCKER_HOST = `unix://${podman}`;
  else if (process.platform === "linux")
    console.warn("No Docker or Podman socket found. With Podman, run once:  systemctl --user enable --now podman.socket");
}
const r = spawnSync("npx", ["supabase", ...process.argv.slice(2)], { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
