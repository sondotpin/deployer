import type { ServerConfig } from "../config.js";
import { db } from "../db.js";
import { sshExec } from "../ssh/manager.js";
import { truncate } from "../utils/format.js";
import { log } from "../utils/logger.js";

export async function runDeploy(
  server: ServerConfig,
  app: string,
): Promise<string> {
  const customScript = db.getDeployScript(server.name, app);
  const command = customScript ?? `bash ~/apps/${app}/deploy.sh`;
  log.info(`Deploying ${app} on ${server.name} via ${customScript ? "custom script" : "default deploy.sh"}`);

  const result = await sshExec(server, command);

  if (result.code !== 0) {
    log.error(`Deploy failed: exit ${result.code}`, result.stderr);
    throw new Error(
      `Deploy exit code ${result.code}\n${truncate(result.stderr, 1000)}`,
    );
  }

  log.info(`Deploy ${app}@${server.name} succeeded`);
  return truncate(result.stdout, 2000);
}
