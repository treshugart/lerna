import fs from "fs";
import glob from "glob";
import path from "path";

import Command from "../Command";
import PackageUtilities from "../PackageUtilities";

export function handler(argv) {
  return new PluginCommand([argv.script, ...argv.args], argv).run();
}

export const command = "plugin <script> [args..]";

export const describe = "Run a plugin in every package.";

export const builder = {
  "sort": {
    describe: "Sort packages topologically (all dependencies before dependents)",
    type: "boolean",
    default: false,
  },
};

export default class PluginCommand extends Command {
  get defaultPluginGlobs() {
    return [
      "./plugins",
      "./node_modules/lerna-plugin-*"
    ];
  }

  get plugin() {
    const { plugins = this.defaultPluginGlobs } = this.repository.lernaJson;
    let plugin;
    plugins.forEach((pattern) => {
      glob.sync(path.join(process.cwd(), pattern)).forEach((pluginDir) => {
        try {
          plugin = require(path.join(pluginDir, this.script));
        } catch (e) {}
      });
    });
    return plugin;
  }

  get requiresGit() {
    return false;
  }

  initialize(callback) {
    this.script = this.input[0];
    this.args = this.input.slice(1);

    if (!this.script) {
      callback(new Error("You must specify which plugin to run."));
      return;
    }

    this._plugin = this.plugin;

    if (!this._plugin) {
      callback(new Error(`Unable to find plugin '${this.script}'.`));
      return;
    }

    this.batchedPackages = this.toposort
      ? PackageUtilities.topologicallyBatchPackages(this.filteredPackages)
      : [this.filteredPackages];

    callback(null, true);
  }

  execute(callback) {
    const log = this.logger.newItem(this.script);
    log.addWork(this.filteredPackages.length);

    PackageUtilities.runParallelBatches(this.batchedPackages, (pkg) => (done) => {
      this._plugin((err) => {
        log.silly(pkg.name);
        log.completeWork(1);
        done(err);
      }, { cmd: this, log, pkg });
    }, this.concurrency, (err) => {
      log.finish();
      callback(err);
    });
  }
}
