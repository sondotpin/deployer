import { createBot } from "./bot/index.js";
import { log } from "./utils/logger.js";

const bot = createBot();

bot.launch(() => {
  log.info("Deployer bot started");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
