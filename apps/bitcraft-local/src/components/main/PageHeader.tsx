import React from "react";

export type PageHeaderProps = {
  title: string;
  description?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {meta || actions ? (
        <div className="page-header-aside">
          {meta ? <div className="page-header-meta">{meta}</div> : null}
          {actions ? <div className="page-header-actions">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
