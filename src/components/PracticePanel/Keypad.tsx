import type { MouseEvent } from 'react';
import s from './Keypad.module.css';

interface KeypadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Lets the panel decide where the pad sits in its own layout. */
  className?: string;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * An on-screen number pad for phones.
 *
 * The real `<input inputMode="numeric">` is still the only source of the value —
 * these keys write into the same state, so a hardware keyboard, a soft keyboard
 * and this pad are interchangeable. It exists because the soft keyboard covers
 * the half of the screen the question is on.
 *
 * Keys do not take focus (`onMouseDown` is prevented), so the caret stays in the
 * input and Enter keeps working while the pad is in use.
 */
export function Keypad({ value, onChange, onSubmit, className }: KeypadProps) {
  const keep = (e: MouseEvent) => e.preventDefault();

  return (
    <div className={`${s.keypad} ${className ?? ''}`}>
      <div className={s.keys}>
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            className={s.key}
            onMouseDown={keep}
            onClick={() => onChange(value + d)}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          className={`${s.key} ${s.keyAlt}`}
          onMouseDown={keep}
          onClick={() => onChange(value.slice(0, -1))}
          aria-label="Delete the last digit"
        >
          ⌫
        </button>
        <button
          type="button"
          className={s.key}
          onMouseDown={keep}
          onClick={() => onChange(value + '0')}
        >
          0
        </button>
        <button
          type="button"
          className={`${s.key} ${s.keyGo}`}
          onMouseDown={keep}
          onClick={onSubmit}
          disabled={!value}
          aria-label="Submit your answer"
        >
          ↵
        </button>
      </div>

      <button
        type="button"
        className={s.submit}
        onMouseDown={keep}
        onClick={onSubmit}
        disabled={!value}
      >
        Check answer
      </button>
    </div>
  );
}

export default Keypad;
