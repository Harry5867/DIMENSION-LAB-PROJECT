import type { ReactNode } from 'react';

export function WorkspacePage({ title, description, actions, children }: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return <main className="lab-page" aria-labelledby="lab-page-title">
    <div className="lab-page-inner">
      <header className="lab-page-header">
        <div>
          <h1 id="lab-page-title">{title}</h1>
          <p>{description}</p>
        </div>
        {actions}
      </header>
      {children}
    </div>
  </main>;
}
