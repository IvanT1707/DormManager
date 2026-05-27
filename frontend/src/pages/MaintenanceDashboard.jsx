import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, EmptyState, Loader, StatusBadge } from '../components/Ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../lib/api.js';
import { dateLabel } from '../lib/format.js';

const repairCategoryNames = {
  general: 'Загальна',
  electrical: 'Електрика',
  plumbing: 'Сантехніка',
};

const specializationNames = {
  general: 'Універсальний спеціаліст',
  electrician: 'Електрик',
  plumber: 'Сантехнік',
};

function RepairCard({ application, comments, disabled, dorm, onAddComment, onUpdate, room }) {
  const [resolutionNote, setResolutionNote] = useState(application.resolutionNote ?? '');
  const [comment, setComment] = useState('');
  const [visibility, setVisibility] = useState('public');

  function submitComment(event) {
    event.preventDefault();
    if (!comment.trim()) {
      return;
    }
    onAddComment(application.id, comment, visibility).then((created) => {
      if (created) {
        setComment('');
      }
    });
  }

  return (
    <article className="repair-card">
      <header>
        <div>
          <small>
            Гуртожиток {dorm?.dormNumber ?? '-'} / кімната {room?.roomNumber ?? '-'}
          </small>
          <h3>{application.description || 'Заявка на ремонт без опису'}</h3>
          <span className="repair-category">{repairCategoryNames[application.repairCategory] ?? 'Загальна'}</span>
        </div>
        <StatusBadge status={application.status} />
      </header>
      <p className="muted">Подано: {dateLabel(application.createdAt)}</p>
      <div className="repair-thread">
        <h4>Коментарі</h4>
        {comments.length ? (
          comments.map((entry) => (
            <article className="repair-comment" key={entry.id}>
              <div>
                <strong>{entry.authorName}</strong>
                <small>{dateLabel(entry.createdAt)} / {entry.visibility === 'staff' ? 'лише персонал' : 'видно студенту'}</small>
              </div>
              <p>{entry.message}</p>
            </article>
          ))
        ) : (
          <p className="muted">Коментарів ще немає.</p>
        )}
        <form className="repair-comment-form" onSubmit={submitComment}>
          <textarea
            onChange={(event) => setComment(event.target.value)}
            placeholder="Додайте повідомлення, наприклад про необхідні матеріали"
            rows="2"
            value={comment}
          />
          <div className="inline-actions">
            <select onChange={(event) => setVisibility(event.target.value)} value={visibility}>
              <option value="public">Видно студенту</option>
              <option value="staff">Лише персонал</option>
            </select>
            <button className="button button-small button-secondary" disabled={disabled || !comment.trim()} type="submit">
              Додати коментар
            </button>
          </div>
        </form>
      </div>
      <label className="repair-note">
        Підсумок виконання
        <textarea
          onChange={(event) => setResolutionNote(event.target.value)}
          placeholder="Що було перевірено або виконано"
          rows="3"
          value={resolutionNote}
        />
      </label>
      <div className="inline-actions">
        <button
          className="button button-secondary"
          disabled={disabled}
          onClick={() => onUpdate(application.id, 'in_review', resolutionNote)}
          type="button"
        >
          Взяти в роботу
        </button>
        <button
          className="button button-secondary"
          disabled={disabled}
          onClick={() => onUpdate(application.id, 'waiting_materials', resolutionNote)}
          type="button"
        >
          Очікує матеріалів
        </button>
        <button
          className="button button-primary"
          disabled={disabled}
          onClick={() => onUpdate(application.id, 'completed', resolutionNote)}
          type="button"
        >
          Завершити
        </button>
      </div>
    </article>
  );
}

export function MaintenanceDashboard() {
  const { getToken, profile } = useAuth();
  const [data, setData] = useState({ applications: [], comments: {}, dorms: [], rooms: [] });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const [applications, rooms, dorms] = await Promise.all([
        apiRequest('/applications', { token }),
        apiRequest('/rooms', { token }),
        apiRequest('/dorms', { token }),
      ]);
      const commentEntries = await Promise.all(
        applications.map(async (application) => [
          String(application.id),
          await apiRequest(`/applications/${application.id}/comments`, { token }),
        ]),
      );
      setData({ applications, comments: Object.fromEntries(commentEntries), rooms, dorms });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const roomById = useMemo(
    () => Object.fromEntries(data.rooms.map((room) => [String(room.id), room])),
    [data.rooms],
  );
  const dormById = useMemo(
    () => Object.fromEntries(data.dorms.map((dorm) => [String(dorm.id), dorm])),
    [data.dorms],
  );
  const openRepairs = data.applications.filter(
    (application) =>
      application.status === 'pending'
      || application.status === 'in_review'
      || application.status === 'waiting_materials',
  );
  const completedRepairs = data.applications.filter(
    (application) => application.status === 'completed',
  );

  async function updateRepair(applicationId, status, resolutionNote) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const token = await getToken();
      await apiRequest(`/applications/${applicationId}`, {
        method: 'PATCH',
        token,
        body: { status, resolutionNote: resolutionNote || null },
      });
      setMessage(
        status === 'completed'
          ? 'Ремонт позначено виконаним.'
          : status === 'waiting_materials'
            ? 'Заявка очікує матеріалів.'
            : 'Заявку взято в роботу.',
      );
      await loadData();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setPending(false);
    }
  }

  async function addComment(applicationId, message, visibility) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const token = await getToken();
      await apiRequest(`/applications/${applicationId}/comments`, {
        method: 'POST',
        token,
        body: { message, visibility },
      });
      setMessage('Коментар додано до заявки.');
      await loadData();
      return true;
    } catch (nextError) {
      setError(nextError.message);
      return false;
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="dashboard maintenance-dashboard">
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Кабінет персоналу</span>
          <h1>Вітаємо, {profile.fullName}</h1>
          <p>
            {specializationNames[profile.maintenanceSpecialization ?? 'general']}. Приймайте заявки
            вашої спеціалізації та фіксуйте перебіг робіт.
          </p>
        </div>
        <div className="hero-stat-group">
          <div>
            <small>У роботі</small>
            <strong>{openRepairs.length}</strong>
          </div>
          <div>
            <small>Завершено</small>
            <strong>{completedRepairs.length}</strong>
          </div>
        </div>
      </section>

      <Alert>{error}</Alert>
      <Alert tone="success">{message}</Alert>

      <div className="workboard-grid">
        <section className="page-card workboard-main">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Черга робіт</span>
              <h2>Активні заявки</h2>
            </div>
            <button className="text-action" onClick={loadData} type="button">
              Оновити
            </button>
          </div>
          <div className="repair-list">
            {openRepairs.length ? (
              openRepairs.map((application) => {
                const room = roomById[String(application.roomId)];
                return (
                  <RepairCard
                    application={application}
                    comments={data.comments[String(application.id)] ?? []}
                    disabled={pending}
                    dorm={room ? dormById[String(room.dormId)] : null}
                    key={application.id}
                    onUpdate={updateRepair}
                    onAddComment={addComment}
                    room={room}
                  />
                );
              })
            ) : (
              <EmptyState>Нових ремонтних заявок зараз немає.</EmptyState>
            )}
          </div>
        </section>
        <section className="page-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Архів</span>
              <h2>Завершені роботи</h2>
            </div>
          </div>
          <div className="data-list">
            {completedRepairs.length ? (
              completedRepairs.map((application) => (
                <article className="data-row" key={application.id}>
                  <div>
                    <strong>Кімната {roomById[String(application.roomId)]?.roomNumber ?? '-'}</strong>
                    <small>{dateLabel(application.processedAt)}</small>
                    <p>{application.resolutionNote || 'Коментар не вказано'}</p>
                  </div>
                  <StatusBadge status={application.status} />
                </article>
              ))
            ) : (
              <EmptyState>Виконаних ремонтів ще немає.</EmptyState>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
