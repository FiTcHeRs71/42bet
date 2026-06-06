import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" lance une erreur dans Next.js pour empêcher l'import côté
      // client, mais en environnement Vitest (Node) il n'y a pas de bundler React.
      // On le redirige vers le stub vide du package lui-même pour que les modules
      // server-only soient testables sans retirer l'annotation de protection.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
  },
});
