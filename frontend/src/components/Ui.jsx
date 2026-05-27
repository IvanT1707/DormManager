import { statusLabel } from '../lib/format.js';

export function Loader({ message = 'Завантаження даних...' }) {
  return (
    <div className="loader" role="status">
      <span className="spinner" />
      <span>{message}</span>
    </div>
  );
}

export function Alert({ children, tone = 'error' }) {
  if (!children) {
    return null;
  }

  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`status status-${status}`}>{statusLabel(status)}</span>;
}

export function InternetStatusBadge({ status }) {
  const labels = {
    active_paid: 'Інтернет оплачено',
    payment_due: 'Інтернет очікує оплати',
    not_connected: 'Інтернет не підключено',
    suspended: 'Інтернет призупинено',
  };

  return <span className={`status status-${status}`}>{labels[status] ?? status}</span>;
}

export function EmptyState({ children }) {
  return <p className="empty-state">{children}</p>;
}
