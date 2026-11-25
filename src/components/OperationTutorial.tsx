interface OperationTutorialProps {
  selectedTarget: 'well' | 'reservoir' | null;
  onSelectTarget: (target: 'well' | 'reservoir') => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onSell: () => void;
  canSell: boolean;
}

export function OperationTutorial({ selectedTarget, onSelectTarget, isPaused, onTogglePause, onSell, canSell }: OperationTutorialProps) {
  return <section className="tf-operation-tutorial" aria-labelledby="operation-tutorial-heading">
    <div className="tf-panel-heading"><div><span className="tf-kicker">First run · guided demo</span><h2 id="operation-tutorial-heading">Run the loop</h2></div><span className="tf-step-label">04 / 08</span></div>
    <p className="tf-panel-intro">This is your operation: heat rises from the well, travels through the pipe, fills storage, then gets sold at the market.</p>
    <ol className="tf-tutorial-steps">
      <li className={selectedTarget === 'well' ? 'is-done' : ''}><button type="button" onClick={() => onSelectTarget('well')}><span>1</span><strong>Select W-01</strong><small>Tap the orange well on the map to inspect your source.</small></button></li>
      <li className={selectedTarget === 'reservoir' ? 'is-done' : ''}><button type="button" onClick={() => onSelectTarget('reservoir')}><span>2</span><strong>Read the reservoir</strong><small>Tap the glowing field to see heat and remaining reserve.</small></button></li>
      <li className={isPaused ? 'is-done' : ''}><button type="button" onClick={onTogglePause}><span>3</span><strong>{isPaused ? 'Resume flow' : 'Pause or speed up'}</strong><small>{isPaused ? 'Resume when you are ready to produce.' : 'Use the control bar below the map to manage flow.'}</small></button></li>
      <li><button type="button" onClick={onSell} disabled={!canSell}><span>4</span><strong>Sell stored TH</strong><small>{canSell ? 'Move heat into credits before storage fills.' : 'Wait for the loop to produce some TH.'}</small></button></li>
    </ol>
  </section>;
}
