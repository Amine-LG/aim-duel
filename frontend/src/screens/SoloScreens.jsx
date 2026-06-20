import { TOTAL } from '../lib/constants.js';
import { formatMs } from '../lib/format.js';

export function SoloCountdownScreen({ value }) {
  return (
    <section id="countdown" className="screen">
      <div className="countdown-value" key={value}>
        {value}
      </div>
    </section>
  );
}

export function SoloGameScreen({
  round,
  best,
  progress,
  targetStyle,
  arenaRef,
  onTargetDown,
  onLeave
}) {
  return (
    <section id="game" className="screen">
      <div id="hud">
        <div className="hud-stat">
          <div className="hl">Dot</div>
          <div className="hv">
            {round.hitCount}/{TOTAL}
          </div>
        </div>
        <div id="progress-bar">
          <div id="progress-fill" style={{ width: progress }} />
        </div>
        <div className="hud-stat">
          <div className="hl">Best</div>
          <div className="hv">{formatMs(best)}</div>
        </div>
        <div className="hud-stat">
          <div className="hl">Ping</div>
          <div className="hv">{round.ping ? `${round.ping}ms` : '--'}</div>
        </div>
        <button
          className="hud-leave"
          type="button"
          onClick={onLeave}
          aria-label="Leave game"
          title="Leave game"
        >
          ✕
        </button>
      </div>

      <div id="arena" ref={arenaRef}>
        {round.target?.type === 'bomb' && (
          <div id="bomb-ring" className="active" style={targetStyle} />
        )}

        {round.target && (
          <button
            id="dot"
            key={round.target.id}
            className={`${round.target.type} pop`}
            type="button"
            aria-label={round.target.type === 'bomb' ? 'Red bomb' : 'Cyan target'}
            onClick={(event) => onTargetDown(event, round.target.id)}
            onPointerDown={(event) => onTargetDown(event, round.target.id)}
            style={targetStyle}
          />
        )}

        {round.labels.map((label) => (
          <span
            key={label.id}
            className="float-ms"
            style={{ left: `${label.x}px`, top: `${label.y}px`, color: label.color }}
          >
            {label.text}
          </span>
        ))}
      </div>
    </section>
  );
}

export function SoloGameOverScreen({ round, average, best, onRetry, onHome }) {
  const idle = round.endReason === 'idle';

  return (
    <section id="gameover" className="screen">
      <div className="go-icon" aria-hidden="true">
        {idle ? '💤' : '💥'}
      </div>
      <h2>{idle ? 'Run ended' : 'GOTCHA'}</h2>
      <p className="go-sub">
        {idle
          ? '20 targets slipped by — take a breath and go again'
          : 'You clicked the red dot'}
      </p>
      <div className="go-stats">
        <div className="go-stat">
          <div className="gsv">{round.hitCount}</div>
          <div className="gsl">Dots hit</div>
        </div>
        <div className="go-stat">
          <div className="gsv">{formatMs(average)}</div>
          <div className="gsl">Avg ms</div>
        </div>
        <div className="go-stat">
          <div className="gsv">{formatMs(best)}</div>
          <div className="gsl">Best ms</div>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" type="button" onClick={onRetry}>
          <span className="btn-icon" aria-hidden="true">↻</span>
          Try Again
        </button>
        <button className="btn btn-ghost" type="button" onClick={onHome}>
          <span className="btn-icon" aria-hidden="true">🏠</span>
          Home
        </button>
      </div>
    </section>
  );
}

export function SoloResultsScreen({ average, best, resultRating, onPlayAgain, onHome }) {
  return (
    <section id="results" className="screen">
      <h2>Finished</h2>
      <div className="big-avg">{average || '--'}</div>
      <div className="avg-unit">milliseconds average</div>
      <div className="result-stats">
        <div className="result-stat">
          <span>Average</span>
          <strong>{formatMs(average)}</strong>
        </div>
        <div className="result-stat">
          <span>Best</span>
          <strong>{formatMs(best)}</strong>
        </div>
      </div>
      <div
        className="rating-badge"
        style={{ background: resultRating.bg, color: resultRating.fg }}
      >
        {resultRating.label}
      </div>
      <p className="rating-note">{resultRating.note}</p>
      <div className="btn-row">
        <button className="btn" type="button" onClick={onPlayAgain}>
          <span className="btn-icon" aria-hidden="true">↻</span>
          Play Again
        </button>
        <button className="btn btn-ghost" type="button" onClick={onHome}>
          <span className="btn-icon" aria-hidden="true">🏠</span>
          Home
        </button>
      </div>
    </section>
  );
}
