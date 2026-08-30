export interface NamingContext {
  vaultName: string;
  now: Date;
}

export interface NamingStrategy {
  readonly replacementMode: "delete-first" | "overwrite" | "unique";
  nextArchiveName(context: NamingContext): Promise<string>;
}
