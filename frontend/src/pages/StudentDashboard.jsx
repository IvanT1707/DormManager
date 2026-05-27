import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, EmptyState, InternetStatusBadge, Loader, StatusBadge } from '../components/Ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../lib/api.js';
import { currency, dateLabel, typeLabel } from '../lib/format.js';

const initialApplication = {
  applicationType: 'repair',
  repairCategory: 'general',
  description: '',
};

const repairCategoryNames = {
  general: 'Загальна проблема',
  electrical: 'Електрика',
  plumbing: 'Сантехніка',
};

export function StudentDashboard() {
  const { getToken, profile } = useAuth();
  const [data, setData] = useState({
    applications: [],
    charges: [],
    comments: {},
    disciplinaryPolicy: null,
    disciplinaryRecords: [],
    dorms: [],
    internetStatuses: [],
    residences: [],
    rooms: [],
    services: [],
    transactions: [],
  });
  const [form, setForm] = useState(initialApplication);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = await getToken();
      const [
        residences,
        applications,
        services,
        transactions,
        rooms,
        dorms,
        charges,
        disciplinaryPolicy,
        disciplinaryRecords,
        internetStatuses,
      ] =
        await Promise.all([
          apiRequest('/residences', { token }),
          apiRequest('/applications', { token }),
          apiRequest('/services', { token }),
          apiRequest('/transactions', { token }),
          apiRequest('/rooms', { token }),
          apiRequest('/dorms', { token }),
          apiRequest('/charges', { token }),
          apiRequest('/disciplinary-records/policy', { token }),
          apiRequest('/disciplinary-records', { token }),
          apiRequest('/room-internet', { token }),
        ]);
      const repairComments = await Promise.all(
        applications
          .filter((application) => application.applicationType === 'repair')
          .map(async (application) => [
            String(application.id),
            await apiRequest(`/applications/${application.id}/comments`, { token }),
          ]),
      );
      setData({
        residences,
        applications,
        services,
        transactions,
        rooms,
        dorms,
        charges,
        comments: Object.fromEntries(repairComments),
        disciplinaryPolicy,
        disciplinaryRecords,
        internetStatuses,
      });
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
  const activePenaltyPoints = data.disciplinaryRecords.find((record) => record.studentActivePoints)
    ?.studentActivePoints ?? 0;
  const serviceById = useMemo(
    () => Object.fromEntries(data.services.map((service) => [String(service.id), service])),
    [data.services],
  );
  const activeResidence = data.residences.find((residence) => residence.status === 'active');
  const hasActiveResidence = Boolean(activeResidence);
  const activeRoom = activeResidence ? roomById[String(activeResidence.roomId)] : null;
  const activeDorm = activeRoom ? dormById[String(activeRoom.dormId)] : null;
  const openSettlementApplication = !hasActiveResidence
    ? data.applications.find(
        (application) =>
          application.applicationType === 'settlement'
          && ['pending', 'in_review', 'approved'].includes(application.status),
      )
    : null;
  const approvedSettlement =
    openSettlementApplication?.status === 'approved' && openSettlementApplication.assignedRoomId
      ? openSettlementApplication
      : null;
  const assignedRoom = approvedSettlement
    ? roomById[String(approvedSettlement.assignedRoomId)]
    : null;
  const assignedDorm = assignedRoom ? dormById[String(assignedRoom.dormId)] : null;
  const internetStatus = activeRoom
    ? data.internetStatuses.find((item) => String(item.roomId) === String(activeRoom.id))
    : null;
  const activeApplications = data.applications.filter(
    (application) =>
      application.status === 'pending'
      || application.status === 'in_review'
      || application.status === 'approved',
  );
  const paidTransactions = data.transactions.filter(
    (transaction) => transaction.paymentStatus === 'succeeded',
  );
  const paymentsTotal = paidTransactions.reduce(
    (total, transaction) => total + Number(transaction.amount),
    0,
  );
  const openCharges = data.charges.filter(
    (charge) => charge.status === 'pending' || charge.status === 'overdue',
  );
  const hasCatalogData = data.rooms.length || data.services.length;

  useEffect(() => {
    setForm((current) => {
      const availableTypes = hasActiveResidence
        ? ['repair', 'renewal', 'eviction']
        : ['settlement'];
      return availableTypes.includes(current.applicationType)
        ? current
        : { ...initialApplication, applicationType: availableTypes[0] };
    });
  }, [hasActiveResidence]);

  function updateApplicationForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitApplication(event) {
    event.preventDefault();
    const requiresActiveRoom = ['repair', 'renewal', 'eviction'].includes(form.applicationType);
    const roomId = requiresActiveRoom ? activeResidence?.roomId : null;

    if (requiresActiveRoom && !roomId) {
      setError('Для цієї заявки потрібне активне поселення.');
      return;
    }

    setPendingAction('application');
    setError('');
    setMessage('');

    try {
      const token = await getToken();
      await apiRequest('/applications', {
        method: 'POST',
        token,
        body: {
          applicationType: form.applicationType,
          ...(form.applicationType === 'repair' ? { repairCategory: form.repairCategory } : {}),
          description: form.description,
          roomId,
        },
      });
      setForm(initialApplication);
      setMessage('Заявку успішно подано.');
      await loadData();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setPendingAction('');
    }
  }

  async function startPayment(serviceId, chargeId = null) {
    setPendingAction(`charge-${chargeId ?? serviceId}`);
    setError('');
    setMessage('');

    try {
      const token = await getToken();
      const transaction = await apiRequest('/transactions/simulate', {
        method: 'POST',
        token,
        body: chargeId ? { chargeId } : { serviceId },
      });
      await apiRequest(`/transactions/${transaction.id}/complete-simulation`, {
        method: 'POST',
        token,
        body: { result: 'succeeded' },
      });
      setMessage('Оплату успішно проведено.');
      await loadData();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setPendingAction('');
    }
  }

  async function addRepairComment(applicationId, event) {
    event.preventDefault();
    const message = commentDrafts[String(applicationId)]?.trim();
    if (!message) {
      return;
    }
    setPendingAction(`comment-${applicationId}`);
    setError('');
    setMessage('');
    try {
      const token = await getToken();
      await apiRequest(`/applications/${applicationId}/comments`, {
        method: 'POST',
        token,
        body: { message },
      });
      setCommentDrafts((current) => ({ ...current, [String(applicationId)]: '' }));
      setMessage('Коментар надіслано.');
      await loadData();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setPendingAction('');
    }
  }

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="dashboard">
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Кабінет студента</span>
          <h1>Вітаємо, {profile.fullName}</h1>
          <p>Контролюйте поселення, звернення та оплату послуг гуртожитку.</p>
        </div>
        <div className="room-summary">
          <small>Поточне проживання</small>
          {activeResidence ? (
            <>
              <strong>
                Гуртожиток {activeDorm?.dormNumber ?? '-'}, кімната {activeRoom?.roomNumber ?? '-'}
              </strong>
              <span>
                {activeRoom?.floorNumber ? `${activeRoom.floorNumber} поверх, ` : ''}
                {activeRoom?.blockNumber ? `блок ${activeRoom.blockNumber}. ` : ''}
                {activeDorm?.address}
              </span>
              <StatusBadge status={activeResidence.status} />
              {internetStatus ? <InternetStatusBadge status={internetStatus.internetStatus} /> : null}
            </>
          ) : approvedSettlement ? (
            <>
              <strong>
                Погоджено: гуртожиток {assignedDorm?.dormNumber ?? '-'}, кімната{' '}
                {assignedRoom?.roomNumber ?? '-'}
              </strong>
              <span>Подайте документи коменданту для завершення оформлення.</span>
              <StatusBadge status={approvedSettlement.status} />
            </>
          ) : (
            <strong>Активне поселення відсутнє</strong>
          )}
        </div>
      </section>

      <Alert>{error}</Alert>
      <Alert tone="success">{message}</Alert>

      <div className="metrics student-metrics">
        <article className="metric-card">
          <small>Статус поселення</small>
          <strong>{activeResidence ? 'Активне' : approvedSettlement ? 'Оформлення' : 'Немає'}</strong>
          <span>
            {activeRoom
              ? `Кімната ${activeRoom.roomNumber}`
              : assignedRoom
                ? `Призначено кімнату ${assignedRoom.roomNumber}`
                : 'Очікуйте оформлення поселення'}
          </span>
        </article>
        <article className="metric-card">
          <small>Заявки в роботі</small>
          <strong>{activeApplications.length}</strong>
          <span>із {data.applications.length} поданих заявок</span>
        </article>
        <article className="metric-card">
          <small>До сплати</small>
          <strong>{currency(openCharges.reduce((total, charge) => total + Number(charge.amount), 0))}</strong>
          <span>{openCharges.length} активних нарахувань</span>
        </article>
      </div>

      {!hasCatalogData ? (
        <section className="setup-banner student-guide">
          <div>
            <span className="eyebrow">Початок роботи</span>
            <h2>Дані гуртожитку ще готуються</h2>
            <p>
              Комендант або адміністратор має додати кімнати й тарифи. Після оформлення
              поселення тут з’являться ваша кімната та доступні послуги.
            </p>
          </div>
        </section>
      ) : null}

      {approvedSettlement && !activeResidence ? (
        <section className="setup-banner student-guide">
          <div>
            <span className="eyebrow">Наступний крок</span>
            <h2>
              Вам погоджено місце у гуртожитку {assignedDorm?.dormNumber ?? '-'}, кімната{' '}
              {assignedRoom?.roomNumber ?? '-'}
            </h2>
            <p>
              Подайте коменданту необхідні документи та підтвердження оплати.
              Після перевірки документів, проходження інструктажу й оформлення
              перепустки поселення буде активовано.
            </p>
          </div>
        </section>
      ) : null}

      <div className="workspace-grid student-workspace">
        <section className="page-card workspace-form">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Звернення</span>
              <h2>Подати заявку</h2>
            </div>
          </div>
          <form className="form-stack" onSubmit={submitApplication}>
            <label>
              Тип заявки
              <select
                disabled={Boolean(openSettlementApplication)}
                name="applicationType"
                onChange={updateApplicationForm}
                value={form.applicationType}
              >
                {hasActiveResidence ? (
                  <>
                    <option value="repair">Ремонт</option>
                    <option value="renewal">Продовження проживання</option>
                    <option value="eviction">Виселення</option>
                  </>
                ) : (
                  <option value="settlement">Поселення</option>
                )}
              </select>
            </label>
            {openSettlementApplication ? (
              <p className="field-note">
                Ваша заява на поселення вже опрацьовується. Нова заява стане доступною,
                якщо поточну буде відхилено або скасовано.
              </p>
            ) : form.applicationType === 'settlement' ? (
              <p className="field-note">
                Після розгляду заяви адміністрація визначить гуртожиток і вільне місце для
                поселення.
              </p>
            ) : form.applicationType === 'renewal' ? (
              <p className="field-note">
                Заява стосується продовження проживання у вашій поточній кімнаті:{' '}
                {activeRoom?.roomNumber ?? '-'}.
              </p>
            ) : (
              <p className="field-note">
                Заявка стосуватиметься вашої активної кімнати:{' '}
                {activeRoom?.roomNumber ?? 'кімнату не визначено'}.
              </p>
            )}
            {form.applicationType === 'repair' ? (
              <label>
                Категорія ремонту
                <select
                  name="repairCategory"
                  onChange={updateApplicationForm}
                  value={form.repairCategory}
                >
                  <option value="general">Загальна проблема</option>
                  <option value="electrical">Електрика</option>
                  <option value="plumbing">Сантехніка</option>
                </select>
              </label>
            ) : null}
            <label>
              Опис
              <textarea
                name="description"
                onChange={updateApplicationForm}
                placeholder="Опишіть прохання або проблему"
                rows="4"
                value={form.description}
              />
            </label>
            <button
              className="button button-primary"
              disabled={pendingAction === 'application' || Boolean(openSettlementApplication)}
              type="submit"
            >
              {pendingAction === 'application'
                ? 'Надсилаємо...'
                : openSettlementApplication
                  ? 'Заява в опрацюванні'
                  : 'Подати заявку'}
            </button>
          </form>
        </section>

        <section className="page-card workspace-table">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Послуги</span>
              <h2>Нарахування до сплати</h2>
            </div>
          </div>
          <div className="service-list">
            {openCharges.length ? (
              openCharges.map((charge) => (
                <article className="service-item" key={charge.id}>
                  <div>
                    <strong>{serviceById[String(charge.serviceId)]?.serviceType ?? 'Послуга'}</strong>
                    <span>{currency(charge.amount)} до {dateLabel(charge.dueDate)}</span>
                  </div>
                  <button
                    className="button button-secondary"
                    disabled={pendingAction === `charge-${charge.id}`}
                    onClick={() => startPayment(charge.serviceId, charge.id)}
                    type="button"
                  >
                    Оплатити
                  </button>
                </article>
              ))
            ) : (
              <EmptyState>Активних нарахувань немає.</EmptyState>
            )}
          </div>
        </section>
      </div>

      <div className="workspace-grid student-history">
        <section className="page-card">
          <div className="section-heading">
            <h2>Мої заявки</h2>
            <button className="text-action" onClick={loadData} type="button">
              Оновити
            </button>
          </div>
          {data.applications.length ? (
            <div className="data-list">
              {data.applications.map((application) => (
                <article className="data-row" key={application.id}>
                  <div>
                    <strong>{typeLabel(application.applicationType)}</strong>
                    <small>{dateLabel(application.createdAt)}</small>
                    <p>{application.description || 'Без додаткового опису'}</p>
                    {application.applicationType === 'repair' ? (
                      <>
                        <p>Категорія: {repairCategoryNames[application.repairCategory] ?? 'Загальна проблема'}</p>
                        <div className="student-repair-thread">
                          {(data.comments[String(application.id)] ?? []).map((comment) => (
                            <article key={comment.id}>
                              <strong>{comment.authorName}</strong>
                              <small>{dateLabel(comment.createdAt)}</small>
                              <p>{comment.message}</p>
                            </article>
                          ))}
                          <form onSubmit={(event) => addRepairComment(application.id, event)}>
                            <input
                              onChange={(event) =>
                                setCommentDrafts((current) => ({
                                  ...current,
                                  [String(application.id)]: event.target.value,
                                }))
                              }
                              placeholder="Написати коментар"
                              value={commentDrafts[String(application.id)] ?? ''}
                            />
                            <button
                              className="button button-small button-secondary"
                              disabled={
                                pendingAction === `comment-${application.id}`
                                || !commentDrafts[String(application.id)]?.trim()
                              }
                              type="submit"
                            >
                              Надіслати
                            </button>
                          </form>
                        </div>
                      </>
                    ) : null}
                    {application.assignedRoomId ? (
                      <p>
                        Призначено: кімната{' '}
                        {roomById[String(application.assignedRoomId)]?.roomNumber ?? '-'}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge status={application.status} />
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>Ви ще не подавали заявок.</EmptyState>
          )}
        </section>

        <section className="page-card">
          <div className="section-heading">
            <h2>Мої платежі</h2>
          </div>
          {data.transactions.length ? (
            <div className="data-list">
              {data.transactions.map((transaction) => (
                <article className="data-row payment-row" key={transaction.id}>
                  <div>
                    <strong>
                      {serviceById[String(transaction.serviceId)]?.serviceType ?? 'Послуга'}
                    </strong>
                    <span>{currency(transaction.amount)}</span>
                    <small>{dateLabel(transaction.createdAt)}</small>
                  </div>
                  <div className="payment-actions">
                    <StatusBadge status={transaction.paymentStatus} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>Платежів ще немає.</EmptyState>
          )}
        </section>
      </div>

      <section className="page-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Облік проживання</span>
            <h2>Дисциплінарні записи</h2>
          </div>
          {data.disciplinaryPolicy ? (
            <div className="student-points-summary">
              <strong>{activePenaltyPoints} / {data.disciplinaryPolicy.maxActivePoints}</strong>
              <small>активних балів</small>
            </div>
          ) : null}
        </div>
        {data.disciplinaryRecords.length ? (
          <div className="data-list">
            {data.disciplinaryRecords.map((record) => (
              <article className="data-row" key={record.id}>
                <div>
                  <strong>
                    {record.recordType === 'violation' ? 'Порушення' : 'Офіційне попередження'}
                  </strong>
                  <small>
                    {dateLabel(record.incidentDate)} / {record.ruleTitle} / +{record.penaltyPoints} балів
                  </small>
                  <p>{record.description}</p>
                  <small>{record.ruleReference}</small>
                </div>
                <StatusBadge status={record.status} />
              </article>
            ))}
          </div>
        ) : (
          <EmptyState>Дисциплінарних записів немає.</EmptyState>
        )}
      </section>
    </div>
  );
}
