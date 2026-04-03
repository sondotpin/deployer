import { Client } from "ssh2";
import type { ServerConfig } from "../config.js";
import { db } from "../db.js";

const CONNECT_TIMEOUT = 10_000;
const COMMAND_TIMEOUT = 60_000;
const STREAM_COMMAND_TIMEOUT = 300_000;

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function sshExec(
  server: ServerConfig,
  command: string,
): Promise<ExecResult> {
  const conn = new Client();
  const privateKey = db.getBotPrivateKey();

  return sshExecStream(server, command);
}

export async function sshExecStream(
  server: ServerConfig,
  command: string,
  onData?: (chunk: string) => void,
): Promise<ExecResult> {
  const conn = new Client();
  const privateKey = db.getBotPrivateKey();
  const cmdTimeoutMs = onData ? STREAM_COMMAND_TIMEOUT : COMMAND_TIMEOUT;

  return new Promise<ExecResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH connection timeout to ${server.name}`));
    }, CONNECT_TIMEOUT);

    conn
      .on("ready", () => {
        clearTimeout(timeout);

        const cmdTimeout = setTimeout(() => {
          conn.end();
          reject(new Error(`Command timeout on ${server.name}`));
        }, cmdTimeoutMs);

        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(cmdTimeout);
            conn.end();
            reject(err);
            return;
          }

          let stdout = "";
          let stderr = "";

          stream
            .on("close", (code: number) => {
              clearTimeout(cmdTimeout);
              conn.end();
              resolve({ code: code ?? 0, stdout, stderr });
            })
            .on("data", (data: Buffer) => {
              const chunk = data.toString();
              stdout += chunk;
              onData?.(chunk);
            })
            .stderr.on("data", (data: Buffer) => {
              const chunk = data.toString();
              stderr += chunk;
              onData?.(chunk);
            });
        });
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      })
      .connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey,
        readyTimeout: CONNECT_TIMEOUT,
      });
  });
}
