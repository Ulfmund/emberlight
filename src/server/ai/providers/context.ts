import { SMALL_CONTEXT, type ContextReport } from '@shared/types'

const fmt = (n: number) => (n >= 1024 ? `${Math.round(n / 1024)}k` : String(n))

/** Adds a plain-English warning when the model is running with a small context window. */
export function describeContext(r: ContextReport, fixHint?: string): ContextReport {
  const effective = r.requested ?? r.loaded
  if (effective && effective < SMALL_CONTEXT) {
    const canDoMore = r.max && r.max > effective ? ` The model itself supports up to ${fmt(r.max)}.` : ''
    return {
      ...r,
      warning:
        `This model is running with only ${fmt(effective)} tokens of context, so it will forget things quickly.` +
        canDoMore +
        (fixHint ? ` ${fixHint}` : ' Raise the context length where the model is loaded (e.g. in LM Studio\'s load settings).')
    }
  }
  return r
}
