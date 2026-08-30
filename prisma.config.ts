import { config } from "dotenv";
import { defineConfig } from "prisma/config";

import { resolvePrismaCliDatasourceUrl } from "./src/lib/env/prisma-cli";

config();
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolvePrismaCliDatasourceUrl(process.env, process.argv),
  },
});
