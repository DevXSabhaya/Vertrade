import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useCreateTrade } from '@/hooks/useTrades'
import { useResolveInstrument } from '@/hooks/useResolveInstrument'
import { useInstrumentPriceStream } from '@/hooks/useInstrumentPriceStream'
import { PriceChart } from '@/components/trading/PriceChart'
import { getErrorMessage } from '@/lib/error-message'
import { formatCurrency } from '@/lib/format'
import type { TradeDirection } from '@/types/trading'

interface FormState {
  rawSymbol: string
  direction: TradeDirection
  quantity: string
  entryTriggerPrice: string
  initialStopLoss: string
  targets: string[]
}

const initialState: FormState = {
  rawSymbol: '',
  direction: 'LONG',
  quantity: '',
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
  const createTrade = useCreateTrade()
  const navigate = useNavigate()
  const toast = useToast()

  const { resolved, isResolving, error: resolveError } = useResolveInstrument(form.rawSymbol)
  // The preview is only trustworthy while it still matches what's typed —
  // once the user edits the field again this becomes stale until the
  // debounced re-resolve catches up (isResolving covers that gap).
  const resolvedInstrument = resolved
    ? { instrumentToken: resolved.instrumentToken, exchange: resolved.exchange, tradingSymbol: resolved.tradingSymbol }
    : null
  const priceStream = useInstrumentPriceStream(resolvedInstrument)

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

  const quantity = toNumber(form.quantity)
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
    else if (!resolved) nextErrors.rawSymbol = 'Resolve this instrument before submitting.'
    if (quantity === null || quantity <= 0) nextErrors.quantity = 'Enter a positive quantity.'
    if (entry === null || entry <= 0) nextErrors.entryTriggerPrice = 'Enter a positive entry price.'
    if (stopLoss === null || stopLoss <= 0) nextErrors.initialStopLoss = 'Enter a positive stop-loss.'
    if (parsedTargets.length === 0) {
      nextErrors.targets = 'Enter at least one positive target price.'
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
      })
      toast.show('Paper trade submitted.', 'success')
      navigate(`/app/active-trades`, { state: { highlight: view.id } })
    } catch (error) {
      setErrors({ form: getErrorMessage(error, 'Could not submit this trade.') })
    }
  }

  return (
    <>
      <Seo title="New Paper Trade" description="Submit a new paper trade." path="/app/trade" noIndex />
      <h1 className="text-2xl font-bold text-ink-900">New Paper Trade</h1>
      <p className="mt-1 text-sm text-ink-500">
        Submitted trades go through the same validation and risk-management checks a real order
        would.
      </p>

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
              <Input
                label="Quantity"
                type="number"
                min={1}
                value={form.quantity}
                onChange={(event) => updateField('quantity', event.target.value)}
                error={errors.quantity}
              />
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
              <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-xs text-brand-700">
                You are about to submit a <strong>{form.direction}</strong> paper trade on{' '}
                <strong>{resolved.tradingSymbol}</strong>: {quantity} qty @ entry{' '}
                {formatCurrency(entry)}, stop-loss {formatCurrency(stopLoss)}
                {parsedTargets.length > 0 && `, targets ${parsedTargets.map(formatCurrency).join(', ')}`}.
              </div>
            )}

            {errors.form && (
              <p role="alert" className="text-sm font-medium text-loss-600">
                {errors.form}
              </p>
            )}

            <Button type="submit" isLoading={createTrade.isPending} className="mt-2">
              Submit Paper Trade
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
            />
          </Card>
        </div>
      </div>
    </>
  )
}
