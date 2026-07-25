export class FeatureFlag {
  constructor(
    public readonly name: string,
    public readonly enabled: boolean,
    public readonly updatedAt: Date,
  ) {}
}
