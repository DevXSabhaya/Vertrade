export interface RepairAction {
  readonly id: string;
  readonly tradeId: string;
  readonly reportId: string;
  readonly field: string;
  readonly previousValue: string;
  readonly newValue: string;
  readonly appliedAt: string;
  readonly succeeded: boolean;
  readonly reason: string;
}
