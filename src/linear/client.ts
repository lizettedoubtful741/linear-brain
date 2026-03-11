import { LinearClient } from "@linear/sdk";
import { config } from "../config.ts";

export const linearClient = new LinearClient({ apiKey: config.linearApiKey });
