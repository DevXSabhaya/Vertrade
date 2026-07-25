import { OrderPriceType } from './order-price-type.enum';

/** All fields optional — only the ones provided are changed. */
export class OrderModification {
  constructor(
    public readonly quantity?: number,
    public readonly price?: number,
    public readonly priceType?: OrderPriceType,
  ) {}
}
