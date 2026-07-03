import { Bell, Factory, ShoppingCart, X } from "lucide-react";

import { toNumber, type AnyRecord } from "../../main-app-data";
import { dedupeNotifications, formatToastMetaLine, type ToastNotice } from "../../notifications/toastNotices";
import { timeAgo } from "../../utils/format";
import { bitjitaIconUrl } from "../../utils/items";
import { ItemIcon } from "./ItemDisplay";

function ToastVisual({ notice }: { notice: ToastNotice }) {
  const item = notice.item ?? null;
  const tier = toNumber(item?.tier ?? item?.itemTier);
  if (item && (bitjitaIconUrl(item) || item.name || item.itemName)) {
    return (
      <span className={`toast-item-icon ${tier >= 1 && tier <= 10 ? `tier-framed tier-${tier}` : ""}`} aria-hidden="true">
        <ItemIcon item={item} />
      </span>
    );
  }
  return <span className="toast-icon" aria-hidden="true">{notice.kind === "market" ? <ShoppingCart size={17} /> : <Factory size={17} />}</span>;
}

export function ToastStack({ notices, onDismiss }: { notices: ToastNotice[]; onDismiss: (id: string) => void }) {
  return (
    <section className="toast-stack" aria-live="polite" aria-label="Notifications">
      {notices.map((notice) => {
        const eventMeta = formatToastMetaLine(notice);
        return (
          <article className={`toast ${notice.kind}`} key={notice.id}>
            <ToastVisual notice={notice} />
            <div>
              <strong>{notice.title}</strong>
              <p>{notice.body}</p>
              {eventMeta ? <time className="toast-event-time" dateTime={notice.occurredAt}>{eventMeta}</time> : null}
            </div>
            <button onClick={() => onDismiss(notice.id)} aria-label="Dismiss notification"><X size={14} /></button>
          </article>
        );
      })}
    </section>
  );
}

export function NotificationDrawer({ notices, onClose, onOpenNotice }: { notices: ToastNotice[]; onClose: () => void; onOpenNotice: (notice: ToastNotice) => void }) {
  const displayNotices = dedupeNotifications(notices);
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="notice-drawer" role="dialog" aria-modal="true" aria-label="Recent notifications" onClick={(event) => event.stopPropagation()}>
        <header><h2><Bell size={18} /> Notifications</h2><button onClick={onClose} aria-label="Close notifications"><X size={16} /></button></header>
        {displayNotices.length ? <div className="notice-list">{displayNotices.map((notice) => {
          const eventMeta = formatToastMetaLine(notice);
          return (
            <button key={notice.id} className={notice.read ? "" : "unread"} onClick={() => onOpenNotice(notice)}>
              <ToastVisual notice={notice} />
              <strong>{notice.title}</strong>
              <small>{notice.body}</small>
              {eventMeta ? <time className="toast-event-time" dateTime={notice.occurredAt}>{eventMeta}</time> : <time>{notice.occurredAt ? timeAgo(notice.occurredAt) : ""}</time>}
            </button>
          );
        })}</div> : <p className="legend">Notifications for sales, listings and production will appear here.</p>}
      </aside>
    </div>
  );
}
