declare module "obsidian" {
  export interface ObsidianElement extends HTMLElement {
    empty(): void;
    setText(text: string): void;
    createEl(tag: string, options?: { text?: string }): ObsidianElement;
  }
  export interface DataAdapter { basePath?: string; }
  export interface Vault { adapter: DataAdapter; }
  export class App { vault: Vault; }
  export class Plugin {
    app: App;
    addCommand(command: { id: string; name: string; callback: () => void | Promise<void> }): void;
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
  }
  export class Modal {
    app: App; contentEl: ObsidianElement; titleEl: ObsidianElement;
    constructor(app: App); open(): void; close(): void; onOpen(): void; onClose(): void;
  }
  export class Notice { constructor(message: string, timeout?: number); }
  interface TextComponent { setValue(value: string): this; setPlaceholder(value: string): this; onChange(callback: (value: string) => void): this; }
  interface DropdownComponent { addOption(value: string, display: string): this; setValue(value: string): this; onChange(callback: (value: string) => void): this; }
  interface ToggleComponent { setValue(value: boolean): this; onChange(callback: (value: boolean) => void): this; }
  interface ButtonComponent { setButtonText(value: string): this; setCta(): this; setWarning(): this; onClick(callback: () => void): this; }
  export class Setting {
    constructor(containerEl: HTMLElement);
    setName(name: string): this; setDesc(description: string): this;
    addText(callback: (component: TextComponent) => void): this;
    addDropdown(callback: (component: DropdownComponent) => void): this;
    addToggle(callback: (component: ToggleComponent) => void): this;
    addButton(callback: (component: ButtonComponent) => void): this;
  }
}
declare function require(name: string): any;
declare const process: { env: Record<string, string | undefined> };
declare const console: { error(...args: unknown[]): void };
