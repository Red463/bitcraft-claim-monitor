import React from "react";

import { formatNumber } from "../../utils/format";

export function LiveValue({ value }: { value: React.ReactNode }) {
  const signature = String(value);
  const previous = React.useRef(signature);
  const [changed, setChanged] = React.useState<"" | "increased" | "decreased">("");
  const [visible, setVisible] = React.useState<React.ReactNode>(value);

  React.useEffect(() => {
    if (previous.current === signature) {
      setVisible(value);
      return;
    }

    const priorSignature = previous.current;
    previous.current = signature;
    const numeric = (entry: string) => {
      const match = entry.match(/^([\d,]+(?:\.\d+)?)(g)?$/);
      return match ? { amount: Number(match[1].replaceAll(",", "")), decimals: match[1].includes(".") ? match[1].split(".")[1].length : 0, suffix: match[2] ?? "" } : null;
    };
    const previousValue = numeric(priorSignature);
    const nextValue = numeric(signature);
    setChanged(previousValue && nextValue && nextValue.amount < previousValue.amount ? "decreased" : "increased");
    const timer = window.setTimeout(() => setChanged(""), 900);
    let frame = 0;

    if (previousValue && nextValue && previousValue.amount !== nextValue.amount) {
      const start = performance.now();
      const run = (time: number) => {
        const progress = Math.min(1, (time - start) / 380);
        const eased = 1 - Math.pow(1 - progress, 3);
        const amount = previousValue.amount + (nextValue.amount - previousValue.amount) * eased;
        setVisible(`${formatNumber(amount, nextValue.decimals)}${nextValue.suffix}`);
        if (progress < 1) frame = window.requestAnimationFrame(run);
        else setVisible(value);
      };
      frame = window.requestAnimationFrame(run);
    } else {
      setVisible(value);
    }

    return () => {
      window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [signature, value]);

  return <span className={`live-value ${changed}`}>{visible}</span>;
}

export function Info({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return <div className="info-row"><span>{label}</span><strong><LiveValue value={value ?? "-"} /></strong></div>;
}

export function Stat({ label, value, icon, warn, onClick }: { label: string; value: React.ReactNode; icon: React.ReactNode; warn?: boolean; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp className={`stat ${warn ? "warn" : ""} ${onClick ? "clickable-stat" : ""}`} onClick={onClick}>
      <div className="stat-icon">{icon}</div>
      <span>{label}</span>
      <strong><LiveValue value={value} /></strong>
    </Comp>
  );
}

export function MiniStat({ icon, label, value, title }: { icon: React.ReactNode; label: string; value: React.ReactNode; title?: string }) {
  return <div className="mini-stat" title={title}><div>{icon}</div><span>{label}</span><strong><LiveValue value={value} /></strong></div>;
}
