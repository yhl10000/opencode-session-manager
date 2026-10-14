import { spawn } from "node:child_process";
import { stripVTControlCharacters } from "node:util";

export async function startPreview() {
  const server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "1420",
      "--strictPort",
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0" } },
  );
  server.stderr.on("data", (data) => process.stderr.write(data));
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (data) => {
      if (stripVTControlCharacters(data.toString()).includes("http://127.0.0.1:1420")) resolve();
    });
    server.on("error", reject);
    server.on("exit", (code) => reject(new Error(`QA server exited ${code}`)));
  });
  return server;
}
