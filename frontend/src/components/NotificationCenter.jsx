import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest, openEventStream } from '../lib/api.js';
import { dateLabel } from '../lib/format.js';

export function NotificationCenter() {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);

  const loadNotifications = useCallback(async () => {
    const token = await getToken();
    const rows = await apiRequest('/notifications', { token });
    setNotifications(rows);
  }, [getToken]);

  useEffect(() => {
    loadNotifications().catch(() => {});
  }, [loadNotifications]);

  useEffect(() => {
    const controller = new AbortController();

    getToken()
      .then((token) =>
        openEventStream('/notifications/stream', {
          token,
          signal: controller.signal,
          onNotification(notification) {
            setNotifications((current) => [
              notification,
              ...current.filter((item) => item.id !== notification.id),
            ]);
            setToasts((current) => [...current, notification]);
            window.setTimeout(() => {
              setToasts((current) => current.filter((item) => item.id !== notification.id));
            }, 5000);
          },
        }),
      )
      .catch(() => {});

    return () => controller.abort();
  }, [getToken]);

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  async function markRead(notification) {
    if (notification.readAt) {
      return;
    }
    const token = await getToken();
    const updated = await apiRequest(`/notifications/${notification.id}/read`, {
      method: 'PATCH',
      token,
    });
    setNotifications((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  async function markAllRead() {
    const token = await getToken();
    await apiRequest('/notifications/read-all', { method: 'PATCH', token });
    setNotifications((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
  }

  return (
    <>
      <div className="notification-center">
        <button
          aria-label="Сповіщення"
          className="notification-trigger"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span aria-hidden="true">!</span>
          {unreadCount ? <strong>{unreadCount}</strong> : null}
        </button>
        {open ? (
          <section className="notification-drawer">
            <header>
              <div>
                <span className="eyebrow">Inbox</span>
                <h2>Сповіщення</h2>
              </div>
              {unreadCount ? (
                <button className="text-action" onClick={markAllRead} type="button">
                  Прочитати всі
                </button>
              ) : null}
            </header>
            <div className="notification-list">
              {notifications.length ? (
                notifications.map((notification) => (
                  <button
                    className={`notification-item ${notification.readAt ? '' : 'unread'}`}
                    key={notification.id}
                    onClick={() => markRead(notification)}
                    type="button"
                  >
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                    <small>{dateLabel(notification.createdAt)}</small>
                  </button>
                ))
              ) : (
                <p className="muted">Нових повідомлень немає.</p>
              )}
            </div>
          </section>
        ) : null}
      </div>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <article className={`toast toast-${toast.priority}`} key={toast.id}>
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
          </article>
        ))}
      </div>
    </>
  );
}
