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

    const { plugins = ["plugins"] } = this.repository.lernaJson;
    plugins.forEach((pattern) => {
      glob.sync(path.join(process.cwd(), pattern)).forEach((pluginDir) => {
        const pluginFile = path.join(pluginDir, this.script) + ".js";
        if (fs.existsSync(pluginFile)) {
          this.plugin = require(pluginFile);
        }
      });
    });

    if (!this.plugin) {
      callback(new Error(`Unable to find plugin ${this.script}.`));
      return;
    }

    this.batchedPackages = this.toposort
      ? PackageUtilities.topologicallyBatchPackages(this.filteredPackages)
      : [this.filteredPackages];

    callback(null, true);
  }

  execute(callback) {
    const tracker = this.logger.newItem(this.script);
    tracker.addWork(this.filteredPackages.length);

    PackageUtilities.runParallelBatches(this.batchedPackages, (pkg) => (done) => {
      this.plugin(this.script, pkg, tracker, (err) => {
        tracker.silly(pkg.name);
        tracker.completeWork(1);
        done(err);
      });
    }, this.concurrency, (err) => {
      tracker.finish();
      callback(err);
    });
  }
}
