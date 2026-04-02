import type { ServerConfig } from "../config.js";
import { sshExec } from "../ssh/manager.js";
import { truncate } from "../utils/format.js";
import { log } from "../utils/logger.js";

export async function runDeploy(
  server: ServerConfig,
  app: string,
): Promise<string> {
  const script = `~/apps/${app}/deploy.sh`;
  log.info(`Deploying ${app} on ${server.name} via ${script}`);

  const result = await sshExec(server, `bash ${script}`);

  if (result.code !== 0) {
    log.error(`Deploy failed: exit ${result.code}`, result.stderr);
    throw new Error(
      `Deploy exit code ${result.code}\n${truncate(result.stderr, 1000)}`,
    );
  }

  log.info(`Deploy ${app}@${server.name} succeeded`);
  return truncate(result.stdout, 2000);
}
