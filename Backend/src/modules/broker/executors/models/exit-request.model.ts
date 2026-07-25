/** price omitted (or undefined) means exit at market. */
export class ExitRequest {
  constructor(
    public readonly quantity: number,
    public readonly price?: number,
  ) {}
}
