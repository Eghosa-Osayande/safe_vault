const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
const registeredCommands = [];
const registeredCleanups = [];

class Plugin {
  constructor() {
    this.app = { vault: { adapter: { basePath: "/tmp/vault" } } };
  }

  addCommand(command) {
    registeredCommands.push(command.id);
    this.register(() => {});
  }

  register(callback) {
    registeredCleanups.push(callback);
  }

  loadData() {
    return Promise.resolve(null);
  }

  saveData() {
    return Promise.resolve();
  }
}

class Notice {
  constructor() {}
}

class Modal {}

class Setting {
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addTextArea() { return this; }
  addDropdown() { return this; }
  addToggle() { return this; }
  addButton() { return this; }
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") {
    return { Plugin, Notice, Modal, Setting, App: class {} };
  }
  if (request === "electron") {
    return {
      remote: {
        dialog: {
          showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
          showSaveDialog: async () => ({ canceled: true }),
        },
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const pluginModule = require("../main.js");
    const VaultArchivePlugin = pluginModule.default;
    const instance = new VaultArchivePlugin();
    await instance.onload();
    assert.deepEqual(registeredCommands, [
      "full-backup",
      "backup",
      "push",
      "pull",
      "restore",
      "configure-backup",
    ]);
    assert.equal(registeredCleanups.length, registeredCommands.length);
    process.stdout.write("Plugin bootstrap test passed\n");
  } finally {
    Module._load = originalLoad;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
