const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
let openResult = { canceled: false, filePaths: ["/selected/folder"] };
let saveResult = { canceled: false, filePath: "/selected/identity.txt" };
let lastOpenOptions = null;
let lastSaveOptions = null;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") {
    return {
      remote: {
        dialog: {
          showOpenDialog: async (options) => {
            lastOpenOptions = options;
            return openResult;
          },
          showSaveDialog: async (options) => {
            lastSaveOptions = options;
            return saveResult;
          },
        },
      },
    };
  }
  if (request === "obsidian") {
    return {
      App: class {},
      Modal: class {},
      Notice: class {},
      Setting: class {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const {
      ObsidianUserInteraction,
      validatePasswordPromptValues,
    } = require("../.test-dist/src/adapters/obsidian_user_interaction/index.js");
    const interaction = new ObsidianUserInteraction({}, {}, {});
    assert.equal(await interaction.pickPath({
      kind: "directory",
      mode: "open",
      title: "Choose folder",
      showHiddenFiles: true,
      canCreateDirectories: true,
    }), "/selected/folder");
    assert.deepEqual(lastOpenOptions.properties, ["openDirectory", "showHiddenFiles", "createDirectory"]);
    assert.equal(await interaction.pickPath({
      kind: "file",
      mode: "save",
      title: "Save identity",
      showHiddenFiles: true,
      canCreateDirectories: true,
    }), "/selected/identity.txt");
    assert.deepEqual(lastSaveOptions.properties, ["showHiddenFiles", "createDirectory"]);

    assert.doesNotThrow(() => validatePasswordPromptValues("secret", "secret", true));
    assert.doesNotThrow(() => validatePasswordPromptValues("secret", "", false));
    assert.throws(() => validatePasswordPromptValues("", "", false), /empty/);
    assert.throws(() => validatePasswordPromptValues("secret", "different", true), /do not match/);

    openResult = { canceled: true, filePaths: [] };
    saveResult = { canceled: true };
    assert.equal(await interaction.pickPath({ kind: "file", mode: "open", title: "Choose file" }), null);
    assert.equal(await interaction.pickPath({ kind: "file", mode: "save", title: "Save file" }), null);
    process.stdout.write("User interaction adapter tests passed\n");
  } finally {
    Module._load = originalLoad;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
