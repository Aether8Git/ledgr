import { useEffect, useState, type ReactNode } from "react";
import type { TriState } from "../engine/types";

export function Field({ label, hint, children, group }: { label: string; hint?: string; children: ReactNode; group?: boolean }) {
  // Button groups must not sit inside <label>: clicking the label text would press the first button.
  if (group)
    return (
      <div className="field" role="group" aria-label={label}>
        <span>{label}</span>
        {children}
        {hint && <small className="hint">{hint}</small>}
      </div>
    );
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Dollar input that stores integer cents; blank = unknown (null). */
export function MoneyInput({ cents, onChange, placeholder = "Unknown" }: { cents: number | null | undefined; onChange: (c: number | null) => void; placeholder?: string }) {
  const toText = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));
  const [text, setText] = useState(toText(cents));
  useEffect(() => setText(toText(cents)), [cents]);
  return (
    <input
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.replace(/[$,\s]/g, "");
        if (t === "") return onChange(null);
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0) {
          setText(toText(cents));
          return;
        }
        onChange(Math.round(n * 100));
      }}
    />
  );
}

/** Percent input that stores basis points; blank = unknown. */
export function PercentInput({ bp, onChange }: { bp: number | null | undefined; onChange: (b: number | null) => void }) {
  const toText = (b: number | null | undefined) => (b == null ? "" : String(b / 100));
  const [text, setText] = useState(toText(bp));
  useEffect(() => setText(toText(bp)), [bp]);
  return (
    <input
      inputMode="decimal"
      placeholder="Unknown"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.replace(/[%\s]/g, "");
        if (t === "") return onChange(null);
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0 || n > 100) return setText(toText(bp));
        onChange(Math.round(n * 100));
      }}
    />
  );
}

export function Tri({ value, onChange, labels = ["Yes", "No", "Unknown"] }: { value: TriState | undefined; onChange: (v: TriState) => void; labels?: [string, string, string] | string[] }) {
  const opts: TriState[] = ["yes", "no", "unknown"];
  return (
    <div className="seg" role="group">
      {opts.map((o, i) => (
        <button type="button" key={o} aria-pressed={(value ?? "unknown") === o} onClick={() => onChange(o)}>
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (b: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
