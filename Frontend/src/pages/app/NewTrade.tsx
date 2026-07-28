import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useCreateTrade } from '@/hooks/useTrades'
import { useInstrumentExpiries } from '@/hooks/useInstrumentExpiries'
import { useInstrumentPriceStream } from '@/hooks/useInstrumentPriceStream'
import { useTradingMode } from '@/hooks/useTradingMode'
import { PriceChart } from '@/components/trading/PriceChart'
import { getErrorMessage } from '@/lib/error-message'
import { formatCurrency, formatDateTime } from '@/lib/format'
import type { TradeDirection } from '@/types/trading'

interface FormState {
  rawSymbol: string
  direction: TradeDirection
  numberOfLots: string
  entryTriggerPrice: string
  initialStopLoss: string
  targets: string[]
}

const initialState: FormState = {
  rawSymbol: '',
  direction: 'LONG',
  numberOfLots: '',
  entryTriggerPrice: '',
  initialStopLoss: '',
  targets: [''],
}

function toNumber(value: string): number | null {
  const num = Number(value)
  return value.trim() !== '' && Number.isFinite(num) ? num : null
}

export default function NewTrade() {
  const [form, setForm] = useState<FormState>(initialState)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [liveConfirmed, setLiveConfirmed] = useState(false)
  // The user's chosen exact contract, by instrument token, whenever the call
  // matched more than one live expiry — reset every time the raw call text
  // changes, so a stale choice from a previous query can never carry over.
  const [selectedExpiryToken, setSelectedExpiryToken] = useState<string | null>(null)
  // Reset synchronously during render (not in an effect body) the instant
  // the raw call text changes — the same "adjusting state when a prop
  // changes" pattern used elsewhere in this app (see PriceChart).
  const [trackedRawSymbol, setTrackedRawSymbol] = useState(form.rawSymbol)
  if (form.rawSymbol !== trackedRawSymbol) {
    setTrackedRawSymbol(form.rawSymbol)
    setSelectedExpiryToken(null)
  }

  const createTrade = useCreateTrade()
  const navigate = useNavigate()
  const toast = useToast()
  const tradingMode = useTradingMode()
  const isLive = tradingMode.data?.tradingMode === 'LIVE'

  const { choices, isResolving, error: resolveError } = useInstrumentExpiries(form.rawSymbol)

  // A single choice needs no picker — there's nothing to disambiguate, so
  // this isn't "silently guessing." More than one requires an explicit
  // selection; `resolved` stays null until the user makes one.
  const resolved =
    choices.length === 1
      ? choices[0]
      : (choices.find((c) => c.instrumentToken === selectedExpiryToken) ?? null)
  const needsExpirySelection = choices.length > 1 && !resolved

  // The preview is only trustworthy while it still matches what's typed —
  // once the user edits the field again this becomes stale until the
  // debounced re-resolve catches up (isResolving covers that gap).
  const resolvedInstrument = resolved
    ? { instrumentToken: resolved.instrumentToken, exchange: resolved.exchange, tradingSymbol: resolved.tradingSymbol }
    : null
  const priceStream = useInstrumentPriceStream(resolvedInstrument)

  const numberOfLots = toNumber(form.numberOfLots)
  // The backend independently validates this too (QuantityRule) — this is
  // only ever a client-side preview/convenience, never trusted as-is.
  const quantity =
    numberOfLots !== null && resolved ? numberOfLots * resolved.lotSize : null

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateTarget(index: number, value: string) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) => (i === index ? value : t)),
    }))
  }

  function addTarget() {
    setForm((prev) => ({ ...prev, targets: [...prev.targets, ''] }))
  }

  function removeTarget(index: number) {
    setForm((prev) => ({ ...prev, targets: prev.targets.filter((_, i) => i !== index) }))
  }

  const entry = toNumber(form.entryTriggerPrice)
  const stopLoss = toNumber(form.initialStopLoss)
  const firstTarget = toNumber(form.targets[0] ?? '')
  const parsedTargets = form.targets.map(toNumber).filter((t): t is number => t !== null)

  const riskReward = useMemo(() => {
    if (quantity === null || entry === null || stopLoss === null) return null
    const directionSign = form.direction === 'LONG' ? 1 : -1
    const riskPerUnit = directionSign * (entry - stopLoss)
    const risk = riskPerUnit * quantity
    if (firstTarget === null) return { risk, reward: null, ratio: null }
    const rewardPerUnit = directionSign * (firstTarget - entry)
    const reward = rewardPerUnit * quantity
    const ratio = risk !== 0 ? Math.abs(reward / risk) : null
    return { risk, reward, ratio }
  }, [quantity, entry, stopLoss, firstTarget, form.direction])

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {}
    if (!form.rawSymbol.trim()) nextErrors.rawSymbol = 'Enter a trading call.'
    else if (needsExpirySelection) nextErrors.rawSymbol = 'Select the exact expiry before submitting.'
    else if (!resolved) nextErrors.rawSymbol = 'Resolve this instrument before submitting.'
    if (numberOfLots === null || numberOfLots <= 0) {
      nextErrors.numberOfLots = 'Enter a positive number of lots.'
    }
    if (entry === null || entry <= 0) nextErrors.entryTriggerPrice = 'Enter a positive entry price.'
    if (stopLoss === null || stopLoss <= 0) nextErrors.initialStopLoss = 'Enter a positive stop-loss.'
    if (parsedTargets.length === 0) {
      nextErrors.targets = 'Enter at least one positive target price.'
    }
    if (isLive && !liveConfirmed) {
      nextErrors.liveConfirmed = 'Confirm this is a real, live order before submitting.'
    }
    return nextErrors
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    try {
      const view = await createTrade.mutateAsync({
        rawSymbol: form.rawSymbol.trim().toUpperCase(),
        direction: form.direction,
        quantity: quantity as number,
        entryTriggerPrice: entry as number,
        initialStopLoss: stopLoss as number,
        targets: form.targets.map((t) => Number(t)),
        ...(isLive ? { liveTradingConfirmed: liveConfirmed } : {}),
      })
      toast.show(isLive ? 'Live trade submitted.' : 'Paper trade submitted.', 'success')
      navigate(`/app/active-trades`, { state: { highlight: view.id } })
    } catch (error) {
      setErrors({ form: getErrorMessage(error, 'Could not submit this trade.') })
    }
  }

  return (
    <>
      <Seo
        title={isLive ? 'New Live Trade' : 'New Paper Trade'}
        description={isLive ? 'Submit a new live trade.' : 'Submit a new paper trade.'}
        path="/app/trade"
        noIndex
      />
      <h1 className="text-2xl font-bold text-ink-900">
        {isLive ? 'New Live Trade' : 'New Paper Trade'}
      </h1>
      {isLive ? (
        <p className="mt-1 text-sm font-medium text-loss-600">
          This deployment is in LIVE mode — submitting below places a real order with your broker,
          subject to the same validation and risk-management checks as any order.
        </p>
      ) : (
        <p className="mt-1 text-sm text-ink-500">
          Submitted trades go through the same validation and risk-management checks a real order
          would.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
            <div>
              <Input
                label="Trading call"
                placeholder="e.g. RELIANCE or SENSEX 77200 CE"
                value={form.rawSymbol}
                onChange={(event) => updateField('rawSymbol', event.target.value.toUpperCase())}
                error={errors.rawSymbol}
                hint="Enter a plain symbol (RELIANCE) or a call like SENSEX 77200 CE / NIFTY 25000 PE."
              />

              {form.rawSymbol.trim() && (
                <div
                  className="mt-2 rounded-lg border border-ink-200 bg-ink-50 p-3 text-xs"
                  aria-live="polite"
                >
                  {isResolving && <p className="text-ink-500">Resolving…</p>}
                  {!isResolving && resolveError && (
                    <p className="font-medium text-loss-600">{resolveError}</p>
                  )}
                  {!isResolving && needsExpirySelection && (
                    <div>
                      <p className="mb-2 font-medium text-ink-700">
                        Multiple expiries match this call — select the exact contract:
                      </p>
                      <div className="flex flex-col gap-2">
                        {choices.map((choice) => (
                          <button
                            key={choice.instrumentToken}
                            type="button"
                            onClick={() => setSelectedExpiryToken(choice.instrumentToken)}
                            className="flex items-center justify-between rounded-md border border-ink-200 bg-white px-3 py-2 text-left hover:border-brand-400"
                          >
                            <span className="font-medium text-ink-900">
                              {choice.expiry ? formatDateTime(choice.expiry) : 'No expiry'}
                            </span>
                            <span className="text-ink-500">
                              Lot {choice.lotSize}
                              {choice.currentPrice !== null &&
                                ` · LTP ${formatCurrency(choice.currentPrice)}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!isResolving && resolved && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                      <div>
                        <dt className="text-ink-400">Trading symbol</dt>
                        <dd className="font-medium text-ink-900">{resolved.tradingSymbol}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-400">Exchange</dt>
                        <dd className="font-medium text-ink-900">{resolved.exchange}</dd>
                      </div>
                      {resolved.expiry && (
                        <div>
                          <dt className="text-ink-400">Expiry</dt>
                          <dd className="font-medium text-ink-900">
                            {formatDateTime(resolved.expiry)}
                          </dd>
                        </div>
                      )}
                      {resolved.strike !== null && (
                        <div>
                          <dt className="text-ink-400">Strike</dt>
                          <dd className="font-medium text-ink-900">{resolved.strike}</dd>
                        </div>
                      )}
                      {resolved.optionType && (
                        <div>
                          <dt className="text-ink-400">Option type</dt>
                          <dd className="font-medium text-ink-900">{resolved.optionType}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-ink-400">Lot size</dt>
                        <dd className="font-medium text-ink-900">{resolved.lotSize}</dd>
                      </div>
                      {choices.length > 1 && (
                        <div>
                          <dt className="text-ink-400">
                            <button
                              type="button"
                              className="underline hover:text-brand-600"
                              onClick={() => setSelectedExpiryToken(null)}
                            >
                              Change expiry
                            </button>
                          </dt>
                        </div>
                      )}
                      <div className="col-span-2 sm:col-span-3">
                        <dt className="text-ink-400">Instrument token</dt>
                        <dd className="font-mono text-[11px] text-ink-600">{resolved.instrumentToken}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Direction"
                value={form.direction}
                onChange={(event) => updateField('direction', event.target.value as TradeDirection)}
              >
                <option value="LONG">Long (Buy)</option>
                <option value="SHORT">Short (Sell)</option>
              </Select>
              <div>
                <Input
                  label="Number of lots"
                  type="number"
                  min={1}
                  step={1}
                  value={form.numberOfLots}
                  onChange={(event) => updateField('numberOfLots', event.target.value)}
                  error={errors.numberOfLots}
                  hint={
                    resolved
                      ? `Lot size ${resolved.lotSize} — total quantity ${quantity ?? 0}`
                      : 'Resolve an instrument to see its lot size.'
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Entry price"
                type="number"
                step="0.05"
                value={form.entryTriggerPrice}
                onChange={(event) => updateField('entryTriggerPrice', event.target.value)}
                error={errors.entryTriggerPrice}
              />
              <Input
                label="Stop loss"
                type="number"
                step="0.05"
                value={form.initialStopLoss}
                onChange={(event) => updateField('initialStopLoss', event.target.value)}
                error={errors.initialStopLoss}
              />
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium text-ink-700">Targets</legend>
              {form.targets.map((target, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label={`Target ${index + 1}`}
                      type="number"
                      step="0.05"
                      value={target}
                      onChange={(event) => updateTarget(index, event.target.value)}
                    />
                  </div>
                  {form.targets.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTarget(index)}
                      aria-label={`Remove target ${index + 1}`}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {errors.targets && (
                <p role="alert" className="text-xs font-medium text-loss-600">
                  {errors.targets}
                </p>
              )}
              <Button type="button" variant="secondary" size="sm" className="self-start" onClick={addTarget}>
                Add target
              </Button>
            </fieldset>

            {resolved && quantity !== null && entry !== null && stopLoss !== null && (
              <div
                className={`rounded-lg border p-3 text-xs ${
                  isLive
                    ? 'border-loss-200 bg-loss-50 text-loss-700'
                    : 'border-brand-100 bg-brand-50 text-brand-700'
                }`}
              >
                You are about to submit a <strong>{form.direction}</strong>{' '}
                {isLive ? 'live' : 'paper'} trade on <strong>{resolved.tradingSymbol}</strong>:{' '}
                {quantity} qty @ entry {formatCurrency(entry)}, stop-loss{' '}
                {formatCurrency(stopLoss)}
                {parsedTargets.length > 0 && `, targets ${parsedTargets.map(formatCurrency).join(', ')}`}.
              </div>
            )}

            {isLive && (
              <label className="flex items-start gap-2 rounded-lg border border-loss-200 bg-loss-50 p-3 text-xs text-loss-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={liveConfirmed}
                  onChange={(event) => setLiveConfirmed(event.target.checked)}
                />
                <span>
                  I understand this places a <strong>real order</strong> with my broker, not a
                  simulation.
                </span>
              </label>
            )}
            {errors.liveConfirmed && (
              <p role="alert" className="text-xs font-medium text-loss-600">
                {errors.liveConfirmed}
              </p>
            )}

            {errors.form && (
              <p role="alert" className="text-sm font-medium text-loss-600">
                {errors.form}
              </p>
            )}

            <Button
              type="submit"
              isLoading={createTrade.isPending}
              className="mt-2"
              variant={isLive ? 'danger' : 'primary'}
            >
              {isLive ? 'Submit Live Trade' : 'Submit Paper Trade'}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-sm font-semibold text-ink-500 uppercase tracking-wide">
              Risk / Reward Preview
            </h2>
            {riskReward ? (
              <dl className="mt-4 flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Risk (to stop-loss)</dt>
                  <dd className="font-semibold text-loss-600">{formatCurrency(Math.abs(riskReward.risk))}</dd>
                </div>
                {riskReward.reward !== null && (
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Reward (to target 1)</dt>
                    <dd className="font-semibold text-gain-600">
                      {formatCurrency(Math.abs(riskReward.reward))}
                    </dd>
                  </div>
                )}
                {riskReward.ratio !== null && (
                  <div className="flex justify-between border-t border-ink-100 pt-3">
                    <dt className="text-ink-500">Reward : Risk</dt>
                    <dd className="font-semibold text-ink-900">{riskReward.ratio.toFixed(2)} : 1</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-ink-400">
                Fill in quantity, entry, and stop-loss to preview your risk.
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink-500 uppercase tracking-wide">
              Live Price
            </h2>
            <PriceChart
              hasInstrument={resolved !== null}
              history={priceStream.history}
              isConnected={priceStream.isConnected}
              entryPrice={entry}
              stopLoss={stopLoss}
              targets={parsedTargets}
              sourceMode={tradingMode.data?.tradingMode ?? 'PAPER'}
            />
          </Card>
        </div>
      </div>
    </>
  )
}
