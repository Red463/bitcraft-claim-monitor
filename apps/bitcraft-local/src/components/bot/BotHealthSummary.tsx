import { Activity, AlertTriangle, Bell, CheckCircle2, Command, KeyRound } from "lucide-react";
import type { BotSection } from "./botSectionState";
import type { BotHealthCard, BotException } from "./botHealth";

const CARD_ICONS = { gateway: Activity, rules: Bell, token: KeyRound, delivery: Command } as const;

export function BotHealthSummary({ health, onSelectSection }: { health: { cards: BotHealthCard[]; exceptions: BotException[] }; onSelectSection: (section: BotSection) => void }) {
  return <section className="bot-health-summary" aria-label="Bot service health">
    <div className="bot-health-grid">{health.cards.map((card) => { const Icon = CARD_ICONS[card.id]; return <article data-tone={card.tone} key={card.id}><Icon size={17} /><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></article>; })}</div>
    <section className="bot-exceptions" aria-labelledby="bot-exceptions-title">
      <div className="bot-exceptions-heading"><div><span>Operational review</span><h2 id="bot-exceptions-title">Exceptions requiring action</h2></div><strong>{health.exceptions.length}</strong></div>
      {health.exceptions.length ? health.exceptions.map((exception) => <article data-tone={exception.tone} key={exception.id}><AlertTriangle size={17} /><div><strong>{exception.title}</strong><span>{exception.detail}</span></div><button type="button" onClick={() => onSelectSection(exception.section)}>{exception.actionLabel}</button></article>) : <div className="empty-state compact"><CheckCircle2 size={20} /><strong>No current exceptions</strong><span>Bot health checks have not reported an item requiring attention.</span></div>}
    </section>
  </section>;
}
