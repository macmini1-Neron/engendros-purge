// Pure mapping from a holdem legalActions() result to the poker action-bar affordances. Extracted from
// poker-ui.js so the "which buttons / what label / is FOLD guarded" decision is node-testable against the
// engine's own legality — the DOM building stays in poker-ui, but it asks THIS for the decisions. No DOM/THREE.
export function actionButtons(legal) {
  if (!legal) return null;
  const canCheck = !!legal.canCheck;
  return {
    // FOLD is always offered, but when CHECK is free a fold is a hand-thrower → the UI guards it (arm→confirm).
    fold: { label: 'FOLD', confirm: canCheck },
    // the single call/check button: its action + label + the chips it costs (0 when checking).
    callcheck: { type: canCheck ? 'check' : 'call', label: canCheck ? 'CHECK' : ('CALL ' + (legal.callAmount | 0)), amount: canCheck ? 0 : (legal.callAmount | 0) },
    // raise controls only when a raise is legal (not capped/short); allInOnly when min==max (the only legal raise is all-in).
    raise: legal.canRaise
      ? { available: true, min: legal.minRaiseTo | 0, max: legal.maxRaiseTo | 0, allInOnly: (legal.minRaiseTo | 0) === (legal.maxRaiseTo | 0) }
      : { available: false },
  };
}
