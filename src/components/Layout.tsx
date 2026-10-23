import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { t } from '../i18n';
import { BackIcon, ChartIcon, FolderIcon, HomeIcon, ListIcon, NavMark, SettingsIcon } from './Icons';

export function Page({
  title,
  back,
  actions,
  children,
}: {
  title: string;
  back?: string | true;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <>
      <header className="topbar no-print">
        {back && (
          <button className="btn icon ghost" aria-label={t().common.back} onClick={() => (back === true ? nav(-1) : nav(back))}>
            <BackIcon />
          </button>
        )}
        {!back && (
          <span className="brand-mark" aria-hidden>
            <NavMark />
          </span>
        )}
        <h1 className="truncate">{title}</h1>
        {actions}
      </header>
      <main className="main">{children}</main>
    </>
  );
}

export function BottomNav() {
  const n = t().nav;
  const items = [
    { to: '/', label: n.home, Icon: HomeIcon },
    { to: '/projects', label: n.projects, Icon: FolderIcon },
    { to: '/sessions', label: n.sessions, Icon: ListIcon },
    { to: '/reports', label: n.reports, Icon: ChartIcon },
    { to: '/settings', label: n.settings, Icon: SettingsIcon },
  ];
  return (
    <nav className="bottom-nav no-print" aria-label="التنقل الرئيسي">
      {items.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty card">
      {icon}
      <h3>{title}</h3>
      {text && <p className="small">{text}</p>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}
