import {
  defineNuxtModule,
  createResolver,
  useLogger,
  addTemplate,
} from "@nuxt/kit";
import { Nuxt } from "@nuxt/schema";
import { emitArtifacts, loadConfigAndCreateContext } from "@pandacss/node";
import { findConfigFile } from "@pandacss/config";
import { promises as fsp, existsSync } from "node:fs";

const logger = useLogger("nuxt:pandacss");

export interface ModuleOptions {
  cwd?: string;
  configPath?: string;
  codegen?: {
    silent?: boolean;
    clean?: boolean;
  };
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: "@wattanx/nuxt-pandacss",
    configKey: "pandacss",
  },
  // Default configuration options of the Nuxt module
  defaults: {
    codegen: {
      silent: false,
      clean: false,
    },
  },
  async setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);

    const cwd = resolve(options.cwd ?? nuxt.options.buildDir);

    // add alias
    nuxt.options.alias["styled-system"] = resolve(cwd, "styled-system");
    nuxt.options.alias["styled-system/*"] = resolve(cwd, "styled-system/*");

    if (existsSync(resolve(nuxt.options.buildDir, "panda.config.mjs"))) {
      await fsp.rm(resolve(nuxt.options.buildDir, "panda.config.mjs"));
    }

    let configPath = "";
    try {
      const configFile = findConfigFile({ cwd });

      configPath = configFile ?? addPandaConfigTemplate(cwd, nuxt);
    } catch (e) {
      const dst = addPandaConfigTemplate(cwd, nuxt);
      configPath = dst;
    }

    const postcssOptions = nuxt.options.postcss;
    postcssOptions.plugins["@pandacss/dev/postcss"] = postcssOptions.plugins[
      "@pandacss/dev/postcss"
    ] ?? {
      configPath,
    };

    nuxt.options.css.push(resolve(process.cwd(), "src/css/global.css"));

    function loadContext() {
      return loadConfigAndCreateContext({
        cwd,
        config: { clean: options.codegen?.clean },
        configPath,
      });
    }

    nuxt.hook("prepare:types", async ({ tsConfig }) => {
      // require tsconfig.json for panda css
      const GeneratedBy = "// Generated by nuxt-pandacss";
      const tsConfigPath = resolve(nuxt.options.buildDir, "tsconfig.json");
      await fsp.mkdir(nuxt.options.buildDir, { recursive: true });
      await fsp.writeFile(
        tsConfigPath,
        GeneratedBy + "\n" + JSON.stringify(tsConfig, null, 2)
      );

      const ctx = await loadContext();

      const { msg } = await emitArtifacts(ctx);

      logger.info(msg);
    });
  },
});

function addPandaConfigTemplate(cwd: string, nuxt: Nuxt) {
  return addTemplate({
    filename: "panda.config.mjs",
    getContents: () => `
  import { defineConfig } from "@pandacss/dev"
 
export default defineConfig({
 // Whether to use css reset
 preflight: true,
 
 // Where to look for your css declarations
 include: ["${nuxt.options.srcDir}/components/**/*.{js,jsx,ts,tsx,vue}",
 "${nuxt.options.srcDir}/pages/**/*.{js,jsx,ts,tsx,vue}"],
 
 // Files to exclude
 exclude: [],
 
 // The output directory for your css system
 outdir: "styled-system",
 cwd: "${cwd}",
})`,
    write: true,
  }).dst;
}
