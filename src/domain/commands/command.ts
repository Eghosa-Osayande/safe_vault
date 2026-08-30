export interface Command {
  invoke(context: import("./command_context").CommandContext): Promise<void>;
}
