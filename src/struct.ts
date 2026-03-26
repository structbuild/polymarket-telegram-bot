import { StructClient } from "@structbuild/sdk";
import { env } from "./env.js";

export const struct = new StructClient({
  apiKey: env.STRUCT_API_KEY,
  venue: "polymarket",
});
