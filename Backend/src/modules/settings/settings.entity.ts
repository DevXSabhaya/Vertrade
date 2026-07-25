export class Setting {
  constructor(
    public readonly key: string,
    public readonly value: unknown,
    public readonly updatedAt: Date,
    public readonly updatedBy?: string,
  ) {}
}
