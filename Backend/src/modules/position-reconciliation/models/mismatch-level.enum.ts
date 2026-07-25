/** Severity ranking, lowest to highest — used to compute a report's overall level. */
export enum MismatchLevel {
  NO_DIFFERENCE = 'NO_DIFFERENCE',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

const SEVERITY_ORDER: readonly MismatchLevel[] = [
  MismatchLevel.NO_DIFFERENCE,
  MismatchLevel.INFO,
  MismatchLevel.WARNING,
  MismatchLevel.ERROR,
  MismatchLevel.CRITICAL,
];

export const MismatchLevelSeverity = {
  rank(level: MismatchLevel): number {
    return SEVERITY_ORDER.indexOf(level);
  },
  mostSevere(levels: readonly MismatchLevel[]): MismatchLevel {
    if (levels.length === 0) {
      return MismatchLevel.NO_DIFFERENCE;
    }
    return levels.reduce((worst, level) =>
      this.rank(level) > this.rank(worst) ? level : worst,
    );
  },
};
