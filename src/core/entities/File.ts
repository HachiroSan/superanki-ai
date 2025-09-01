export class File {
  constructor(
    public readonly path: string,
    public readonly hash: string,
    public readonly lastSeen: Date
  ) {}

  hasChanged(newHash: string): boolean {
    return this.hash !== newHash;
  }

  updateHash(newHash: string): File {
    return new File(this.path, newHash, new Date());
  }
}
