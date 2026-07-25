/** Recognized instrument segments across brokers/exchanges. Used defensively by the resolver. */
export const KNOWN_SEGMENTS: ReadonlySet<string> = new Set([
  'EQ',
  'FUTSTK',
  'OPTSTK',
  'FUTIDX',
  'OPTIDX',
  'FUTCOM',
  'OPTCOM',
  'FUTCUR',
  'OPTCUR',
]);
