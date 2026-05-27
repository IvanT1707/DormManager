import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, EmptyState, InternetStatusBadge, Loader, StatusBadge } from '../components/Ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiRequest } from '../lib/api.js';
import { currency, dateLabel, roleLabel, typeLabel } from '../lib/format.js';

const emptyDormForm = {
  dormNumber: '',
  address: '',
  totalFloors: 9,
  residentialFloorFrom: 2,
  hasBlocks: true,
  blocksPerFloor: 19,
  roomsPerBlock: 2,
  roomsPerFloor: 38,
  defaultRoomCapacity: 4,
};
const emptyRoomForm = {
  dormId: '',
  roomNumber: '',
  capacity: 4,
  floorNumber: '',
  blockNumber: '',
  roomInBlock: '',
};
const emptyServiceForm = { serviceType: '', serviceCode: '', billingFrequency: 'once', paymentDueDay: 10, price: '' };
const emptyReportFilters = { dormId: '', dateFrom: '', dateTo: '' };
const emptyAssignmentForm = { userId: '', dormId: '' };
const emptyAssignmentFilters = { dormId: '', role: '', active: 'active' };
const emptyDisciplineForm = {
  residenceId: '',
  violationRuleId: '',
  incidentDate: '',
  description: '',
};
const emptyRuleForm = {
  code: '',
  title: '',
  recordType: 'violation',
  ruleReference: '',
  defaultPoints: 5,
};
const emptyBillingPeriodForm = {
  serviceId: '',
  name: '',
  periodStart: '',
  periodEnd: '',
  chargeDate: '',
  dueDate: '',
};
const emptyUserForm = {
  email: '',
  password: '',
  passwordConfirmation: '',
  role: 'commandant',
  maintenanceSpecialization: 'general',
  fullName: '',
  faculty: '',
  specialty: '',
};

function OccupancyBadge({ totals }) {
  const status = totals.available === 0 ? 'full' : totals.occupied === 0 ? 'empty' : 'available';
  const label = totals.available === 0 ? 'Заповнено' : totals.occupied === 0 ? 'Вільно' : `Є ${totals.available} місць`;

  return <span className={`occupancy-badge occupancy-${status}`}>{label}</span>;
}

function RoomOccupancyCard({
  disabled,
  internetStatus,
  internetService,
  onInternetUpdate,
  onSave,
  onSelect,
  room,
  selected = false,
}) {
  const [capacity, setCapacity] = useState(room.capacity);
  const canSelect = room.availablePlaces > 0 || selected;

  useEffect(() => {
    setCapacity(room.capacity);
  }, [room.capacity]);

  return (
    <article className={`occupancy-room ${selected ? 'occupancy-room-selected' : ''}`}>
      <header>
        <div>
          <strong>Кімната {room.roomNumber}</strong>
          <small>{room.occupied} / {room.capacity} місць зайнято</small>
        </div>
        <OccupancyBadge totals={{ occupied: room.occupied, available: room.availablePlaces }} />
      </header>
      <InternetStatusBadge status={internetStatus?.internetStatus ?? 'not_connected'} />
      <div className="resident-list">
        {room.residents.length ? (
          room.residents.map((resident) => (
            <span key={resident.residenceId}>{resident.fullName}</span>
          ))
        ) : (
          <small className="muted">Мешканців немає</small>
        )}
      </div>
      {onSelect ? (
        <button
          className={`button button-small ${selected ? 'button-secondary' : 'button-primary'}`}
          disabled={disabled || !canSelect || selected}
          onClick={() => onSelect(room)}
          type="button"
        >
          {selected ? 'Призначено' : canSelect ? 'Призначити місце' : 'Немає місць'}
        </button>
      ) : null}
      {onSave ? (
        <>
          <label className="capacity-editor">
            Місткість кімнати
            <input
              min="1"
              onChange={(event) => setCapacity(event.target.value)}
              type="number"
              value={capacity}
            />
          </label>
          {internetService ? (
            <div className="inline-actions">
              <button
                className="button button-small button-secondary"
                disabled={disabled}
                onClick={() => onInternetUpdate(room.id, internetService.id, 'active')}
                type="button"
              >
                Підключити
              </button>
              <button
                className="button button-small button-danger"
                disabled={disabled}
                onClick={() => onInternetUpdate(room.id, internetService.id, 'suspended')}
                type="button"
              >
                Призупинити
              </button>
            </div>
          ) : null}
          <div className="inline-actions">
            <button
              className="button button-small button-secondary"
              disabled={disabled}
              onClick={() => onSave(room.id, capacity)}
              type="button"
            >
              Зберегти місткість
            </button>
          </div>
        </>
      ) : null}
    </article>
  );
}

function HousingMap({
  disabled,
  internetByRoomId,
  internetService,
  layouts,
  onInternetUpdate,
  onSave,
  onSelect,
  selectedRoomId,
}) {
  if (!layouts.length) {
    return <EmptyState>Кімнат за вибраними умовами немає.</EmptyState>;
  }

  return (
    <div className="housing-map">
      {layouts.map((layout) => (
        <article className="dorm-map" key={layout.dorm.id}>
          <header className="dorm-map-header">
            <div>
              <span className="eyebrow">Гуртожиток</span>
              <h3>№{layout.dorm.dormNumber}</h3>
              <p>{layout.dorm.address}</p>
            </div>
            <div className="map-totals">
              <strong>{layout.totals.occupied} / {layout.totals.capacity}</strong>
              <small>зайнято місць</small>
              <OccupancyBadge totals={layout.totals} />
            </div>
          </header>
          <div className="floor-list">
            {layout.floors.map((floor) => (
              <details
                className="floor-panel"
                key={floor.floorNumber ?? 'other'}
                open={layout.floors.length <= 2}
              >
                <summary>
                  <strong>{floor.floorNumber ? `${floor.floorNumber} поверх` : 'Інші кімнати'}</strong>
                  <span>{floor.totals.occupied} / {floor.totals.capacity} місць</span>
                  <OccupancyBadge totals={floor.totals} />
                </summary>
                {floor.blocks.length ? (
                  <div className="block-grid">
                    {floor.blocks.map((block) => (
                      <details className="block-panel" key={block.blockNumber}>
                        <summary>
                          <strong>Блок {floor.floorNumber}{String(block.blockNumber).padStart(2, '0')}</strong>
                          <span>{block.totals.occupied} / {block.totals.capacity}</span>
                          <OccupancyBadge totals={block.totals} />
                        </summary>
                        <div className="occupancy-room-grid">
                          {block.rooms.map((room) => (
                            <RoomOccupancyCard
                              disabled={disabled}
                              internetService={internetService}
                              internetStatus={internetByRoomId[String(room.id)]}
                              key={room.id}
                              onInternetUpdate={onInternetUpdate}
                              onSave={onSave}
                              onSelect={onSelect}
                              room={room}
                              selected={String(selectedRoomId) === String(room.id)}
                            />
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                ) : null}
                {floor.rooms.length ? (
                  <div className="occupancy-room-grid ungrouped-rooms">
                    {floor.rooms.map((room) => (
                      <RoomOccupancyCard
                        disabled={disabled}
                        internetService={internetService}
                        internetStatus={internetByRoomId[String(room.id)]}
                        key={room.id}
                        onInternetUpdate={onInternetUpdate}
                        onSave={onSave}
                        onSelect={onSelect}
                        room={room}
                        selected={String(selectedRoomId) === String(room.id)}
                      />
                    ))}
                  </div>
                ) : null}
              </details>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function EditableService({ canManage, onSave, onToggleActive, service }) {
  const [price, setPrice] = useState(service.price);
  const [paymentDueDay, setPaymentDueDay] = useState(service.paymentDueDay ?? 10);

  return (
    <tr>
      <td>{service.serviceType}</td>
      <td>{service.billingFrequency === 'semester' ? 'Семестр' : service.billingFrequency === 'monthly' ? 'Місяць' : 'Разово'}</td>
      <td>
        {service.serviceCode === 'INTERNET' ? (
          canManage ? (
            <input
              className="table-input"
              max="28"
              min="1"
              onChange={(event) => setPaymentDueDay(event.target.value)}
              type="number"
              value={paymentDueDay}
            />
          ) : (
            `${service.paymentDueDay ?? 10} число`
          )
        ) : (
          '-'
        )}
      </td>
      <td>
        {canManage ? (
          <input
            className="table-input"
            min="0"
            onChange={(event) => setPrice(event.target.value)}
            step="0.01"
            type="number"
            value={price}
          />
        ) : (
          currency(service.price)
        )}
      </td>
      <td>
        {canManage ? (
          <div className="inline-actions">
            <button
              className="button button-small button-secondary"
              onClick={() => onSave(service.id, price, paymentDueDay)}
              type="button"
            >
              Зберегти
            </button>
            <button
              className={`button button-small ${service.active ? 'button-danger' : 'button-secondary'}`}
              onClick={() => onToggleActive(service.id, !service.active)}
              type="button"
            >
              {service.active ? 'Архівувати' : 'Відновити'}
            </button>
          </div>
        ) : (
          <StatusBadge status={service.active ? 'active' : 'archived'} />
        )}
      </td>
    </tr>
  );
}

export function CommandantDashboard() {
  const { getToken, profile } = useAuth();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState({
    applications: [],
    assignments: [],
    billingPeriods: [],
    charges: [],
    disciplinaryPolicy: null,
    disciplinaryRecords: [],
    disciplinaryRules: [],
    dorms: [],
    internetStatuses: [],
    occupancyLayouts: [],
    residences: [],
    rooms: [],
    services: [],
    transactions: [],
    users: [],
  });
  const [dormForm, setDormForm] = useState(emptyDormForm);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [assignmentFilters, setAssignmentFilters] = useState(emptyAssignmentFilters);
  const [disciplineForm, setDisciplineForm] = useState(emptyDisciplineForm);
  const [disciplinaryPolicyForm, setDisciplinaryPolicyForm] = useState({
    title: '',
    noRenewalThreshold: 25,
    evictionThreshold: 35,
  });
  const [ruleForm, setRuleForm] = useState(emptyRuleForm);
  const [billingPeriodForm, setBillingPeriodForm] = useState(emptyBillingPeriodForm);
  const [reportFilters, setReportFilters] = useState(emptyReportFilters);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [roomFilters, setRoomFilters] = useState({
    dormId: '',
    floorNumber: '',
    availability: '',
    internetStatus: '',
    search: '',
  });
  const [placementApplicationId, setPlacementApplicationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = await getToken();
      const [
        dorms,
        rooms,
        users,
        residences,
        applications,
        services,
        transactions,
        assignments,
        billingPeriods,
        charges,
        disciplinaryPolicy,
        disciplinaryRecords,
        disciplinaryRules,
        internetStatuses,
      ] =
        await Promise.all([
          apiRequest('/dorms', { token }),
          apiRequest('/rooms', { token }),
          apiRequest('/users', { token }),
          apiRequest('/residences', { token }),
          apiRequest('/applications', { token }),
          apiRequest('/services', { token }),
          apiRequest('/transactions', { token }),
          apiRequest('/staff-dorm-assignments', { token }),
          apiRequest('/charges/billing-periods', { token }),
          apiRequest('/charges', { token }),
          apiRequest('/disciplinary-records/policy', { token }),
          apiRequest('/disciplinary-records', { token }),
          apiRequest('/disciplinary-records/rules', { token }),
          apiRequest('/room-internet', { token }),
        ]);
      const occupancyLayouts = await Promise.all(
        dorms.map((dorm) => apiRequest(`/dorms/${dorm.id}/occupancy-layout`, { token })),
      );
      setData({
        dorms,
        rooms,
        users,
        residences,
        applications,
        services,
        transactions,
        assignments,
        billingPeriods,
        charges,
        disciplinaryPolicy,
        disciplinaryRecords,
        disciplinaryRules,
        internetStatuses,
        occupancyLayouts,
      });
      setDisciplineForm((current) => ({
        ...current,
        violationRuleId:
          current.violationRuleId
          || disciplinaryRules.find((rule) => rule.active)?.id
          || '',
      }));
      setDisciplinaryPolicyForm({
        title: disciplinaryPolicy.title,
        noRenewalThreshold: disciplinaryPolicy.noRenewalThreshold,
        evictionThreshold: disciplinaryPolicy.evictionThreshold,
      });
      setRoomForm((current) => ({ ...current, dormId: current.dormId || dorms[0]?.id || '' }));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const dormById = useMemo(
    () => Object.fromEntries(data.dorms.map((dorm) => [String(dorm.id), dorm])),
    [data.dorms],
  );
  const userById = useMemo(
    () => Object.fromEntries(data.users.map((user) => [String(user.id), user])),
    [data.users],
  );
  const roomById = useMemo(
    () => Object.fromEntries(data.rooms.map((room) => [String(room.id), room])),
    [data.rooms],
  );
  const internetByRoomId = useMemo(
    () => Object.fromEntries(data.internetStatuses.map((status) => [String(status.roomId), status])),
    [data.internetStatuses],
  );
  const occupancyRoomById = useMemo(
    () =>
      Object.fromEntries(
        data.occupancyLayouts.flatMap((layout) => layoutRooms(layout)).map((room) => [String(room.id), room]),
      ),
    [data.occupancyLayouts],
  );
  const internetService = data.services.find((service) => service.serviceCode === 'INTERNET');
  const activeResidences = data.residences.filter((record) => record.status === 'active');
  const selectedDisciplineRule = data.disciplinaryRules.find(
    (rule) => String(rule.id) === String(disciplineForm.violationRuleId),
  );
  const selectedDisciplineResidence = activeResidences.find(
    (residence) => String(residence.id) === String(disciplineForm.residenceId),
  );
  const selectedStudentDiscipline = data.disciplinaryRecords.find(
    (record) => String(record.userId) === String(selectedDisciplineResidence?.userId),
  );
  const selectedStudentActivePoints = Number(selectedStudentDiscipline?.studentActivePoints ?? 0);
  const capacity = data.rooms.reduce((total, room) => total + Number(room.capacity), 0);
  const occupied = activeResidences.length;
  const occupancyPercent = capacity ? Math.round((occupied / capacity) * 100) : 0;
  const succeededTransactions = data.transactions.filter(
    (transaction) => transaction.paymentStatus === 'succeeded',
  );
  const revenue = succeededTransactions.reduce(
    (total, transaction) => total + Number(transaction.amount),
    0,
  );
  const pendingApplications = data.applications.filter(
    (application) => application.status === 'pending' || application.status === 'in_review',
  );
  const studentUsers = data.users.filter((user) => user.role === 'student');
  const visibleAssignments = data.assignments.filter(
    (assignment) =>
      (!assignmentFilters.dormId || String(assignment.dormId) === String(assignmentFilters.dormId))
      && (!assignmentFilters.role || assignment.role === assignmentFilters.role)
      && (
        !assignmentFilters.active
        || (assignmentFilters.active === 'active' && assignment.active)
        || (assignmentFilters.active === 'archived' && !assignment.active)
      ),
  );
  const assignmentGroups = data.dorms
    .map((dorm) => ({
      dorm,
      assignments: visibleAssignments.filter(
        (assignment) => String(assignment.dormId) === String(dorm.id),
      ),
    }))
    .filter((group) => group.assignments.length);
  const visibleLayouts = filterHousingLayouts(
    data.occupancyLayouts,
    roomFilters,
    internetByRoomId,
  );
  const visibleRoomCount = visibleLayouts.reduce((total, layout) => total + layout.totals.rooms, 0);
  const placementApplications = data.applications.filter(
    (application) =>
      application.applicationType === 'settlement'
      && application.managedDormId
      && ['pending', 'in_review', 'approved'].includes(application.status),
  );
  const placementApplication =
    placementApplications.find((application) => String(application.id) === String(placementApplicationId))
    ?? placementApplications[0]
    ?? null;
  const placementLayouts = placementApplication
    ? filterHousingLayouts(
        data.occupancyLayouts,
        {
          dormId: String(placementApplication.managedDormId),
          availability: 'available',
          search: '',
          floorNumber: '',
          internetStatus: '',
        },
        internetByRoomId,
        placementApplication.assignedRoomId,
      )
    : [];
  const setupIncomplete = !data.dorms.length || !data.rooms.length || !data.services.length;
  const selectedDormId = String(reportFilters.dormId || '');
  const filteredRooms = selectedDormId
    ? data.rooms.filter((room) => String(room.dormId) === selectedDormId)
    : data.rooms;
  const filteredRoomIds = new Set(filteredRooms.map((room) => String(room.id)));
  const filteredResidences = activeResidences.filter((residence) =>
    selectedDormId ? filteredRoomIds.has(String(residence.roomId)) : true,
  );
  const filteredResidentIds = new Set(
    data.residences
      .filter((residence) =>
        selectedDormId ? filteredRoomIds.has(String(residence.roomId)) : true,
      )
      .map((residence) => String(residence.userId)),
  );
  const filteredApplications = data.applications.filter(
    (application) =>
      (!selectedDormId || filteredRoomIds.has(String(application.roomId))) &&
      isDateInRange(application.createdAt, reportFilters),
  );
  const filteredTransactions = succeededTransactions.filter(
    (transaction) =>
      (!selectedDormId || filteredResidentIds.has(String(transaction.userId))) &&
      isDateInRange(transaction.paidAt ?? transaction.createdAt, reportFilters),
  );
  const filteredCapacity = filteredRooms.reduce((total, room) => total + Number(room.capacity), 0);
  const filteredOccupied = filteredResidences.length;
  const filteredOccupancyPercent = filteredCapacity
    ? Math.round((filteredOccupied / filteredCapacity) * 100)
    : 0;
  const filteredRevenue = filteredTransactions.reduce(
    (total, transaction) => total + Number(transaction.amount),
    0,
  );
  const applicationStatusData = [
    ['pending', 'Очікують'],
    ['in_review', 'В обробці'],
    ['approved', 'Схвалені'],
    ['completed', 'Виконані'],
    ['rejected', 'Відхилені'],
  ].map(([status, label]) => ({
    label,
    value: filteredApplications.filter((application) => application.status === status).length,
  }));
  const occupancyData = data.dorms
    .filter((dorm) => !selectedDormId || String(dorm.id) === selectedDormId)
    .map((dorm) => {
      const dormRooms = data.rooms.filter((room) => String(room.dormId) === String(dorm.id));
      const roomIds = new Set(dormRooms.map((room) => String(room.id)));
      const dormCapacity = dormRooms.reduce((total, room) => total + Number(room.capacity), 0);
      const dormOccupied = activeResidences.filter((residence) =>
        roomIds.has(String(residence.roomId)),
      ).length;
      return {
        label: `Гуртожиток ${dorm.dormNumber}`,
        value: dormCapacity ? Math.round((dormOccupied / dormCapacity) * 100) : 0,
        detail: `${dormOccupied} / ${dormCapacity} місць`,
      };
    });
  const revenueData = createMonthlyRevenueData(filteredTransactions);

  async function perform(action, successMessage) {
    setPending('working');
    setError('');
    setMessage('');
    try {
      const result = await action();
      setMessage(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      await loadData();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setPending('');
    }
  }

  async function updateApplication(applicationId, fields) {
    await perform(async () => {
      const token = await getToken();
      await apiRequest(`/applications/${applicationId}`, {
        method: 'PATCH',
        token,
        body: fields,
      });
    }, 'Статус заявки оновлено.');
  }

  async function routeApplication(applicationId, managedDormId) {
    await perform(async () => {
      const token = await getToken();
      await apiRequest(`/applications/${applicationId}/managed-dorm`, {
        method: 'PATCH',
        token,
        body: { managedDormId },
      });
    }, 'Заявку направлено до гуртожитку.');
  }

  async function assignRoomFromMap(room) {
    if (!placementApplication) {
      return;
    }
    await updateApplication(placementApplication.id, {
      assignedRoomId: room.id,
      status: placementApplication.status === 'pending' ? 'in_review' : placementApplication.status,
    });
  }

  async function createDorm(event) {
    event.preventDefault();
    await perform(async () => {
      const token = await getToken();
      await apiRequest('/dorms', {
        method: 'POST',
        token,
        body: {
          ...dormForm,
          totalFloors: Number(dormForm.totalFloors),
          residentialFloorFrom: Number(dormForm.residentialFloorFrom),
          ...(dormForm.hasBlocks
            ? {
                blocksPerFloor: Number(dormForm.blocksPerFloor),
                roomsPerBlock: Number(dormForm.roomsPerBlock),
              }
            : { roomsPerFloor: Number(dormForm.roomsPerFloor) }),
          defaultRoomCapacity: Number(dormForm.defaultRoomCapacity),
        },
      });
      setDormForm(emptyDormForm);
    }, 'Гуртожиток додано.');
  }

  async function createRoom(event) {
    event.preventDefault();
    const layoutFieldCount = [roomForm.floorNumber, roomForm.blockNumber, roomForm.roomInBlock].filter(
      Boolean,
    ).length;

    if (layoutFieldCount !== 0 && layoutFieldCount !== 3) {
      setError('Для кімнати вкажіть одночасно поверх, блок і позицію у блоці.');
      return;
    }

    await perform(async () => {
      const token = await getToken();
      await apiRequest('/rooms', {
        method: 'POST',
        token,
        body: {
          dormId: roomForm.dormId,
          roomNumber: roomForm.roomNumber,
          capacity: Number(roomForm.capacity),
          ...(roomForm.floorNumber ? { floorNumber: Number(roomForm.floorNumber) } : {}),
          ...(roomForm.blockNumber ? { blockNumber: Number(roomForm.blockNumber) } : {}),
          ...(roomForm.roomInBlock ? { roomInBlock: Number(roomForm.roomInBlock) } : {}),
        },
      });
      setRoomForm((current) => ({ ...emptyRoomForm, dormId: current.dormId }));
    }, 'Кімнату додано.');
  }

  async function saveRoomCapacity(roomId, nextCapacity) {
    await perform(async () => {
      const token = await getToken();
      await apiRequest(`/rooms/${roomId}`, {
        method: 'PATCH',
        token,
        body: { capacity: Number(nextCapacity) },
      });
    }, 'Місткість кімнати оновлено.');
  }

  async function generateRooms(dorm) {
    await perform(async () => {
      const token = await getToken();
      return apiRequest(`/dorms/${dorm.id}/generate-rooms`, {
        method: 'POST',
        token,
        body: {
          totalFloors: dorm.totalFloors,
          residentialFloorFrom: dorm.residentialFloorFrom,
          hasBlocks: dorm.hasBlocks,
          ...(dorm.hasBlocks
            ? { blocksPerFloor: dorm.blocksPerFloor, roomsPerBlock: dorm.roomsPerBlock }
            : { roomsPerFloor: dorm.roomsPerFloor }),
          defaultRoomCapacity: dorm.defaultRoomCapacity,
        },
      });
    }, (result) => `Сформовано ${result.createdRooms} кімнат. Загальна місткість: ${result.totalPlaces} місць.`);
  }

  async function createService(event) {
    event.preventDefault();
    await perform(async () => {
      const token = await getToken();
      await apiRequest('/services', {
        method: 'POST',
        token,
        body: {
          ...serviceForm,
          serviceCode: serviceForm.serviceCode || null,
          paymentDueDay: Number(serviceForm.paymentDueDay),
          price: Number(serviceForm.price),
        },
      });
      setServiceForm(emptyServiceForm);
    }, 'Тариф додано.');
  }

  async function updateInternet(roomId, serviceId, status) {
    await perform(async () => {
      const token = await getToken();
      await apiRequest(`/room-internet/${roomId}`, {
        method: 'PUT',
        token,
        body: {
          serviceId,
          status,
          activatedAt: status === 'active' ? new Date().toISOString().slice(0, 10) : null,
          suspendedAt: status === 'suspended' ? new Date().toISOString().slice(0, 10) : null,
        },
      });
    }, 'Статус інтернету кімнати оновлено.');
  }

  async function createDiscipline(event) {
    event.preventDefault();
    await perform(async () => {
      const token = await getToken();
      await apiRequest('/disciplinary-records', {
        method: 'POST',
        token,
        body: disciplineForm,
      });
      setDisciplineForm(emptyDisciplineForm);
    }, 'Дисциплінарний запис оформлено.');
  }

  async function createDisciplinaryRule(event) {
    event.preventDefault();
    await perform(async () => {
      const token = await getToken();
      await apiRequest('/disciplinary-records/rules', {
        method: 'POST',
        token,
        body: {
          ...ruleForm,
          defaultPoints: Number(ruleForm.defaultPoints),
        },
      });
      setRuleForm(emptyRuleForm);
    }, 'Правило додано до дисциплінарного довідника.');
  }

  async function toggleDisciplinaryRule(rule) {
    await perform(async () => {
      const token = await getToken();
      await apiRequest(`/disciplinary-records/rules/${rule.id}`, {
        method: 'PATCH',
        token,
        body: { active: !rule.active },
      });
    }, rule.active ? 'Правило архівовано.' : 'Правило відновлено.');
  }

  async function saveDisciplinaryPolicy(event) {
    event.preventDefault();
    await perform(async () => {
      const token = await getToken();
      await apiRequest('/disciplinary-records/policy', {
        method: 'PATCH',
        token,
        body: {
          ...disciplinaryPolicyForm,
          noRenewalThreshold: Number(disciplinaryPolicyForm.noRenewalThreshold),
          evictionThreshold: Number(disciplinaryPolicyForm.evictionThreshold),
        },
      });
    }, 'Пороги дисциплінарної політики оновлено.');
  }

  async function createAssignment(event) {
    event.preventDefault();
    await perform(async () => {
      const token = await getToken();
      await apiRequest('/staff-dorm-assignments', {
        method: 'POST',
        token,
        body: assignmentForm,
      });
      setAssignmentForm(emptyAssignmentForm);
    }, 'Працівника призначено до гуртожитку.');
  }

  async function endAssignment(assignmentId) {
    await perform(async () => {
      const token = await getToken();
      await apiRequest(`/staff-dorm-assignments/${assignmentId}`, {
        method: 'DELETE',
        token,
      });
    }, 'Призначення завершено.');
  }

  async function createBillingPeriod(event) {
    event.preventDefault();
    await perform(async () => {
      const token = await getToken();
      await apiRequest('/charges/billing-periods', {
        method: 'POST',
        token,
        body: billingPeriodForm,
      });
      setBillingPeriodForm(emptyBillingPeriodForm);
    }, 'Семестровий період заплановано.');
  }

  async function runScheduledCharges() {
    await perform(async () => {
      const token = await getToken();
      return apiRequest('/charges/run-scheduled', { method: 'POST', token });
    }, (result) => `Створено планових нарахувань: ${result.createdCount}.`);
  }

  async function generateReminders() {
    await perform(async () => {
      const token = await getToken();
      return apiRequest('/notifications/generate-reminders', { method: 'POST', token });
    }, (result) => `Надіслано нових нагадувань: ${result.generatedCount}.`);
  }

  async function saveServicePrice(serviceId, price, paymentDueDay) {
    await perform(async () => {
      const token = await getToken();
      await apiRequest(`/services/${serviceId}`, {
        method: 'PATCH',
        token,
        body: { price: Number(price), paymentDueDay: Number(paymentDueDay) },
      });
    }, 'Тариф оновлено.');
  }

  async function toggleServiceActive(serviceId, active) {
    await perform(async () => {
      const token = await getToken();
      await apiRequest(`/services/${serviceId}`, {
        method: 'PATCH',
        token,
        body: { active },
      });
    }, active ? 'Тариф відновлено.' : 'Тариф переміщено в архів.');
  }

  async function initiateResidenceAction(residence, applicationType) {
    await perform(async () => {
      const token = await getToken();
      await apiRequest('/applications', {
        method: 'POST',
        token,
        body: {
          userId: residence.userId,
          roomId: residence.roomId,
          applicationType,
          description:
            applicationType === 'relocation'
              ? 'Переселення ініційовано адміністрацією студмістечка.'
              : 'Оформлення виселення ініційовано адміністрацією студмістечка.',
        },
      });
    }, applicationType === 'relocation' ? 'Заяву на переселення створено.' : 'Заяву на виселення створено.');
    setTab('applications');
  }

  async function createUser(event) {
    event.preventDefault();

    if (userForm.password !== userForm.passwordConfirmation) {
      setError('Паролі не збігаються. Повторіть введення.');
      return;
    }

    await perform(async () => {
      const token = await getToken();
      await apiRequest('/users', {
        method: 'POST',
        token,
        body: {
          email: userForm.email,
          password: userForm.password,
          role: userForm.role,
          fullName: userForm.fullName,
          faculty: userForm.faculty || null,
          specialty: userForm.specialty || null,
          ...(userForm.role === 'maintenance_staff'
            ? { maintenanceSpecialization: userForm.maintenanceSpecialization }
            : {}),
        },
      });
      setUserForm(emptyUserForm);
    }, 'Обліковий запис користувача створено.');
  }

  async function saveUserRole(userId, role, maintenanceSpecialization) {
    await perform(async () => {
      const token = await getToken();
      await apiRequest(`/users/${userId}`, {
        method: 'PATCH',
        token,
        body: {
          role,
          ...(role === 'maintenance_staff' ? { maintenanceSpecialization } : {}),
        },
      });
    }, 'Роль користувача оновлено.');
  }

  async function activateUser(userId, password) {
    if (password.length < 6) {
      setError('Початковий пароль повинен містити щонайменше 6 символів.');
      return;
    }

    await perform(async () => {
      const token = await getToken();
      await apiRequest(`/users/${userId}/activate`, {
        method: 'POST',
        token,
        body: { password },
      });
    }, 'Доступ користувача активовано.');
  }

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="dashboard commandant-dashboard">
      <section className="hero-panel commandant-hero">
        <div>
          <span className="eyebrow">
            {profile.role === 'administrator' ? 'Панель адміністратора' : 'Панель коменданта'}
          </span>
          <h1>Управління гуртожитками</h1>
          <p>Поселення, заявки, тарифи та звіти в одному робочому просторі.</p>
        </div>
        <button className="button button-secondary no-print" onClick={() => window.print()} type="button">
          Друкувати звіт
        </button>
      </section>

      <Alert>{error}</Alert>
      <Alert tone="success">{message}</Alert>

      <nav className="tabbar no-print" aria-label="Розділи панелі">
        {[
          ['overview', 'Огляд'],
          ['applications', 'Заявки'],
          ['residences', 'Поселення'],
          ['rooms', 'Кімнати'],
          ['discipline', 'Дисципліна'],
          ['services', 'Тарифи'],
          ['analytics', 'Аналітика'],
          ...(profile.role === 'administrator' ? [['users', 'Користувачі'], ['assignments', 'Призначення']] : []),
          ['reports', 'Звіти'],
        ].map(([id, label]) => (
          <button
            className={tab === id ? 'active' : ''}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <>
          {setupIncomplete ? (
            <section className="setup-banner">
              <div>
                <span className="eyebrow">Початкове налаштування</span>
                <h2>Підготуйте дані для студентського кабінету</h2>
                <p>
                  Додайте гуртожиток і кімнати, створіть тарифи, а потім оформіть
                  поселення студентів.
                </p>
              </div>
              <div className="inline-actions">
                <button className="button button-secondary" onClick={() => setTab('rooms')} type="button">
                  Кімнати
                </button>
                <button className="button button-primary" onClick={() => setTab('services')} type="button">
                  Тарифи
                </button>
              </div>
            </section>
          ) : null}
          <div className="metrics management-metrics">
            <article className="metric-card">
              <small>Зайнятість</small>
              <strong>{occupancyPercent}%</strong>
              <span>
                {occupied} із {capacity} місць
              </span>
              <div className="progress">
                <span style={{ width: `${Math.min(occupancyPercent, 100)}%` }} />
              </div>
            </article>
            <article className="metric-card">
              <small>Активні заявки</small>
              <strong>{pendingApplications.length}</strong>
              <span>потребують рішення</span>
            </article>
            <article className="metric-card">
              <small>Отримані платежі</small>
              <strong>{currency(revenue)}</strong>
              <span>{succeededTransactions.length} успішних операцій</span>
            </article>
            <article className="metric-card">
              <small>Профілі студентів</small>
              <strong>{studentUsers.length}</strong>
              <span>{activeResidences.length} активних поселень</span>
            </article>
          </div>
          <section className="page-card dashboard-table-card">
            <div className="section-heading">
              <h2>Останні заявки</h2>
              <button className="text-action" onClick={() => setTab('applications')} type="button">
                Усі заявки
              </button>
            </div>
            <ApplicationTable
              applications={data.applications.slice(0, 5)}
              dorms={dormById}
              rooms={roomById}
              users={userById}
            />
          </section>
        </>
      ) : null}

      {tab === 'applications' ? (
        <div className="application-workspace">
          {placementApplications.length ? (
            <section className="page-card placement-workspace">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Поселення</span>
                  <h2>Призначення вільного місця</h2>
                  <p className="muted">
                    Оберіть заяву та призначте кімнату безпосередньо з карти гуртожитку.
                    Після подання документів завершіть поселення у таблиці рішень нижче.
                  </p>
                </div>
              </div>
              <label className="placement-selector">
                Заява студента
                <select
                  onChange={(event) => setPlacementApplicationId(event.target.value)}
                  value={placementApplication?.id ?? ''}
                >
                  {placementApplications.map((application) => (
                    <option key={application.id} value={application.id}>
                      {userById[String(application.userId)]?.fullName ?? application.userId} - гуртожиток{' '}
                      {dormById[String(application.managedDormId)]?.dormNumber ?? '-'}
                    </option>
                  ))}
                </select>
              </label>
              <HousingMap
                disabled={Boolean(pending)}
                internetByRoomId={internetByRoomId}
                layouts={placementLayouts}
                onSelect={assignRoomFromMap}
                selectedRoomId={placementApplication?.assignedRoomId}
              />
            </section>
          ) : null}
          <section className="page-card">
            <div className="section-heading">
              <h2>Обробка заявок</h2>
            </div>
            <ApplicationTable
              actions
              applications={data.applications}
              disabled={Boolean(pending)}
              disciplinaryRecords={data.disciplinaryRecords}
              dorms={dormById}
              occupancyRooms={occupancyRoomById}
              onStatusChange={updateApplication}
              onRoute={routeApplication}
              canRoute={profile.role === 'administrator'}
              roomOptions={data.rooms}
              rooms={roomById}
              users={userById}
            />
          </section>
        </div>
      ) : null}

      {tab === 'residences' ? (
        <div>
          <section className="page-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Реєстр</span>
                <h2>Активні поселення</h2>
                <p className="muted">
                  Нове поселення формується після виконання схваленої заяви. Для поточного
                  мешканця оформіть переселення або виселення як окреме рішення.
                </p>
              </div>
            </div>
            {activeResidences.length ? (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Студент</th>
                      <th>Кімната</th>
                      <th>Початок</th>
                      <th>Статус</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {activeResidences.map((residence) => (
                      <tr key={residence.id}>
                        <td>{userById[String(residence.userId)]?.fullName ?? residence.userId}</td>
                        <td>
                          {roomById[String(residence.roomId)]?.roomNumber ?? '-'}
                          {roomById[String(residence.roomId)]?.blockNumber
                            ? ` / блок ${roomById[String(residence.roomId)]?.blockNumber}`
                            : ''}
                        </td>
                        <td>{dateLabel(residence.startDate)}</td>
                        <td>
                          <StatusBadge status={residence.status} />
                        </td>
                        <td>
                          <div className="inline-actions">
                            <button
                              className="button button-small button-secondary"
                              disabled={Boolean(pending)}
                              onClick={() => initiateResidenceAction(residence, 'relocation')}
                              type="button"
                            >
                              Переселення
                            </button>
                            <button
                              className="button button-small button-danger"
                              disabled={Boolean(pending)}
                              onClick={() => initiateResidenceAction(residence, 'eviction')}
                              type="button"
                            >
                              Виселення
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Активних поселень поки немає.</EmptyState>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'rooms' ? (
        <div className="housing-workspace">
          <section className="page-card housing-settings">
            {profile.role === 'administrator' ? (
              <>
            <h2>Додати гуртожиток</h2>
            <form className="form-stack" onSubmit={createDorm}>
              <label>
                Номер
                <input
                  onChange={(event) =>
                    setDormForm((current) => ({ ...current, dormNumber: event.target.value }))
                  }
                  required
                  value={dormForm.dormNumber}
                />
              </label>
              <label>
                Адреса
                <input
                  onChange={(event) =>
                    setDormForm((current) => ({ ...current, address: event.target.value }))
                  }
                  required
                  value={dormForm.address}
                />
              </label>
              <div className="compact-form-grid">
                <label>
                  Поверхів
                  <input
                    min="1"
                    onChange={(event) =>
                      setDormForm((current) => ({ ...current, totalFloors: event.target.value }))
                    }
                    required
                    type="number"
                    value={dormForm.totalFloors}
                  />
                </label>
                <label>
                  Житлові з поверху
                  <input
                    min="1"
                    onChange={(event) =>
                      setDormForm((current) => ({
                        ...current,
                        residentialFloorFrom: event.target.value,
                      }))
                    }
                    required
                    type="number"
                    value={dormForm.residentialFloorFrom}
                  />
                </label>
                <label>
                  Тип планування
                  <select
                    onChange={(event) =>
                      setDormForm((current) => ({
                        ...current,
                        hasBlocks: event.target.value === 'blocks',
                      }))
                    }
                    value={dormForm.hasBlocks ? 'blocks' : 'rooms'}
                  >
                    <option value="blocks">Блокове</option>
                    <option value="rooms">Кімнати без блоків</option>
                  </select>
                </label>
                {dormForm.hasBlocks ? (
                  <>
                    <label>
                      Блоків / поверх
                      <input
                        min="1"
                        onChange={(event) =>
                          setDormForm((current) => ({ ...current, blocksPerFloor: event.target.value }))
                        }
                        required
                        type="number"
                        value={dormForm.blocksPerFloor}
                      />
                    </label>
                    <label>
                      Кімнат / блок
                      <input
                        min="1"
                        onChange={(event) =>
                          setDormForm((current) => ({ ...current, roomsPerBlock: event.target.value }))
                        }
                        required
                        type="number"
                        value={dormForm.roomsPerBlock}
                      />
                    </label>
                  </>
                ) : (
                  <label>
                    Кімнат / поверх
                    <input
                      min="1"
                      onChange={(event) =>
                        setDormForm((current) => ({ ...current, roomsPerFloor: event.target.value }))
                      }
                      required
                      type="number"
                      value={dormForm.roomsPerFloor}
                    />
                  </label>
                )}
                <label>
                  Місць / кімнату
                  <input
                    min="1"
                    onChange={(event) =>
                      setDormForm((current) => ({
                        ...current,
                        defaultRoomCapacity: event.target.value,
                      }))
                    }
                    required
                    type="number"
                    value={dormForm.defaultRoomCapacity}
                  />
                </label>
              </div>
              <button className="button button-primary" disabled={Boolean(pending)} type="submit">
                Додати
              </button>
            </form>
            <h2 className="spaced-title">Структура гуртожитків</h2>
            <div className="layout-list">
              {data.dorms.length ? (
                data.dorms.map((dorm) => (
                  <article className="layout-item" key={dorm.id}>
                    <div>
                      <strong>Гуртожиток {dorm.dormNumber}</strong>
                      <small>
                        {dorm.totalFloors && dorm.residentialFloorFrom
                          ? dorm.hasBlocks
                            ? `${dorm.residentialFloorFrom}-${dorm.totalFloors} поверхи, ${dorm.blocksPerFloor} блоків / поверх, кімнати з літерами (наприклад 201а, 201б), ${(dorm.totalFloors - dorm.residentialFloorFrom + 1) * dorm.blocksPerFloor * dorm.roomsPerBlock} кімнат`
                            : `${dorm.residentialFloorFrom}-${dorm.totalFloors} поверхи, ${dorm.roomsPerFloor} кімнат / поверх, цифрові номери без літер, ${(dorm.totalFloors - dorm.residentialFloorFrom + 1) * dorm.roomsPerFloor} кімнат`
                          : 'Структуру кімнат не задано'}
                      </small>
                    </div>
                    <button
                      className="button button-small button-secondary"
                      disabled={
                        Boolean(pending) ||
                        !dorm.totalFloors ||
                        !dorm.residentialFloorFrom ||
                        (dorm.hasBlocks
                          ? !dorm.blocksPerFloor || !dorm.roomsPerBlock
                          : !dorm.roomsPerFloor) ||
                        !dorm.defaultRoomCapacity
                      }
                      onClick={() => generateRooms(dorm)}
                      type="button"
                    >
                      Сформувати кімнати
                    </button>
                  </article>
                ))
              ) : (
                <EmptyState>Спочатку додайте гуртожиток.</EmptyState>
              )}
            </div>
              </>
            ) : (
              <>
                <span className="eyebrow">Мій scope</span>
                <h2>Закріплені гуртожитки</h2>
                <p className="muted">
                  Ви керуєте кімнатами та заявами лише у призначених вам гуртожитках.
                </p>
                <div className="layout-list">
                  {data.dorms.map((dorm) => (
                    <article className="layout-item" key={dorm.id}>
                      <div>
                        <strong>Гуртожиток {dorm.dormNumber}</strong>
                        <small>{dorm.address}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            <h2 className="spaced-title">Додати кімнату</h2>
            <form className="form-stack" onSubmit={createRoom}>
              <label>
                Гуртожиток
                <select
                  onChange={(event) =>
                    setRoomForm((current) => ({ ...current, dormId: event.target.value }))
                  }
                  required
                  value={roomForm.dormId}
                >
                  <option value="">Оберіть гуртожиток</option>
                  {data.dorms.map((dorm) => (
                    <option key={dorm.id} value={dorm.id}>
                      {dorm.dormNumber} - {dorm.address}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Номер кімнати
                <input
                  onChange={(event) =>
                    setRoomForm((current) => ({ ...current, roomNumber: event.target.value }))
                  }
                  required
                  value={roomForm.roomNumber}
                />
              </label>
              <label>
                Місткість
                <input
                  min="1"
                  onChange={(event) =>
                    setRoomForm((current) => ({ ...current, capacity: event.target.value }))
                  }
                  required
                  type="number"
                  value={roomForm.capacity}
                />
              </label>
              <div className="compact-form-grid">
                <label>
                  Поверх
                  <input
                    min="1"
                    onChange={(event) =>
                      setRoomForm((current) => ({ ...current, floorNumber: event.target.value }))
                    }
                    type="number"
                    value={roomForm.floorNumber}
                  />
                </label>
                <label>
                  Блок
                  <input
                    min="1"
                    onChange={(event) =>
                      setRoomForm((current) => ({ ...current, blockNumber: event.target.value }))
                    }
                    type="number"
                    value={roomForm.blockNumber}
                  />
                </label>
                <label>
                  Кімната у блоці
                  <input
                    min="1"
                    onChange={(event) =>
                      setRoomForm((current) => ({ ...current, roomInBlock: event.target.value }))
                    }
                    type="number"
                    value={roomForm.roomInBlock}
                  />
                </label>
              </div>
              <button className="button button-primary" disabled={Boolean(pending)} type="submit">
                Створити кімнату
              </button>
            </form>
          </section>
          <section className="page-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Житловий фонд</span>
                <h2>Карта місць</h2>
              </div>
              <strong className="muted">{visibleRoomCount} кімнат</strong>
            </div>
            <div className="room-filter-grid">
              <label>
                Гуртожиток
                <select
                  onChange={(event) =>
                    setRoomFilters((current) => ({
                      ...current,
                      dormId: event.target.value,
                      floorNumber: '',
                    }))
                  }
                  value={roomFilters.dormId}
                >
                  <option value="">Усі</option>
                  {data.dorms.map((dorm) => (
                    <option key={dorm.id} value={dorm.id}>
                      {dorm.dormNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Поверх
                <select
                  onChange={(event) =>
                    setRoomFilters((current) => ({ ...current, floorNumber: event.target.value }))
                  }
                  value={roomFilters.floorNumber}
                >
                  <option value="">Усі</option>
                  {[...new Set(
                    data.rooms
                      .filter((room) => !roomFilters.dormId || String(room.dormId) === roomFilters.dormId)
                      .map((room) => room.floorNumber)
                      .filter(Boolean),
                  )].map((floor) => (
                    <option key={floor} value={floor}>
                      {floor}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Місця
                <select
                  onChange={(event) =>
                    setRoomFilters((current) => ({ ...current, availability: event.target.value }))
                  }
                  value={roomFilters.availability}
                >
                  <option value="">Усі</option>
                  <option value="available">Є вільні місця</option>
                  <option value="empty">Повністю вільні</option>
                  <option value="full">Заповнені</option>
                </select>
              </label>
              <label>
                Інтернет
                <select
                  onChange={(event) =>
                    setRoomFilters((current) => ({ ...current, internetStatus: event.target.value }))
                  }
                  value={roomFilters.internetStatus}
                >
                  <option value="">Усі</option>
                  <option value="active_paid">Активний</option>
                  <option value="payment_due">Очікує оплати</option>
                  <option value="not_connected">Не підключено</option>
                  <option value="suspended">Призупинено</option>
                </select>
              </label>
              <label className="room-search-filter">
                Пошук
                <input
                  onChange={(event) =>
                    setRoomFilters((current) => ({ ...current, search: event.target.value }))
                  }
                  placeholder="Кімната, блок або ПІБ"
                  value={roomFilters.search}
                />
              </label>
            </div>
            <HousingMap
              disabled={Boolean(pending)}
              internetByRoomId={internetByRoomId}
              internetService={internetService}
              layouts={visibleLayouts}
              onInternetUpdate={updateInternet}
              onSave={saveRoomCapacity}
            />
          </section>
        </div>
      ) : null}

      {tab === 'discipline' ? (
        <div className="workspace-grid management-workspace">
          <section className="page-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Офіційний облік</span>
                <h2>Новий запис</h2>
              </div>
            </div>
            {data.disciplinaryPolicy ? (
              <div className="discipline-policy-summary">
                <strong>Активний ліміт: {data.disciplinaryPolicy.maxActivePoints} балів</strong>
                <small>
                  Розгляд непродовження від {data.disciplinaryPolicy.noRenewalThreshold}; підстава
                  для рішення про виселення від {data.disciplinaryPolicy.evictionThreshold}.
                </small>
              </div>
            ) : null}
            <form className="form-stack" onSubmit={createDiscipline}>
              <label>
                Активне поселення
                <select
                  onChange={(event) =>
                    setDisciplineForm((current) => ({ ...current, residenceId: event.target.value }))
                  }
                  required
                  value={disciplineForm.residenceId}
                >
                  <option value="">Оберіть мешканця</option>
                  {activeResidences.map((residence) => (
                    <option key={residence.id} value={residence.id}>
                      {userById[String(residence.userId)]?.fullName ?? residence.userId} / кімната{' '}
                      {roomById[String(residence.roomId)]?.roomNumber ?? '-'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Правило та бали
                <select
                  onChange={(event) =>
                    setDisciplineForm((current) => ({ ...current, violationRuleId: event.target.value }))
                  }
                  required
                  value={disciplineForm.violationRuleId}
                >
                  <option value="">Оберіть правило</option>
                  {data.disciplinaryRules
                    .filter((rule) => rule.active)
                    .map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.title} / {rule.defaultPoints} балів
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Дата інциденту
                <input
                  onChange={(event) =>
                    setDisciplineForm((current) => ({ ...current, incidentDate: event.target.value }))
                  }
                  required
                  type="date"
                  value={disciplineForm.incidentDate}
                />
              </label>
              {selectedDisciplineRule ? (
                <div className="discipline-selection-note">
                  <strong>{selectedDisciplineRule.ruleReference}</strong>
                  <small>
                    Поточний активний підсумок студента: {selectedStudentActivePoints} /{' '}
                    {data.disciplinaryPolicy?.maxActivePoints ?? 35}. Після запису:{' '}
                    {selectedStudentActivePoints + Number(selectedDisciplineRule.defaultPoints)}.
                  </small>
                </div>
              ) : null}
              <label>
                Опис
                <textarea
                  onChange={(event) =>
                    setDisciplineForm((current) => ({ ...current, description: event.target.value }))
                  }
                  required
                  rows="3"
                  value={disciplineForm.description}
                />
              </label>
              <button className="button button-primary" disabled={Boolean(pending)} type="submit">
                Оформити запис
              </button>
            </form>
            {profile.role === 'administrator' ? (
              <>
                <hr className="section-divider" />
                <h3>Політика балів</h3>
                <form className="form-stack" onSubmit={saveDisciplinaryPolicy}>
                  <label>
                    Назва політики
                    <input
                      onChange={(event) =>
                        setDisciplinaryPolicyForm((current) => ({ ...current, title: event.target.value }))
                      }
                      required
                      value={disciplinaryPolicyForm.title}
                    />
                  </label>
                  <div className="discipline-thresholds">
                    <label>
                      Непродовження від
                      <input
                        max="35"
                        min="1"
                        onChange={(event) =>
                          setDisciplinaryPolicyForm((current) => ({
                            ...current,
                            noRenewalThreshold: event.target.value,
                          }))
                        }
                        required
                        type="number"
                        value={disciplinaryPolicyForm.noRenewalThreshold}
                      />
                    </label>
                    <label>
                      Виселення від
                      <input
                        max="35"
                        min="1"
                        onChange={(event) =>
                          setDisciplinaryPolicyForm((current) => ({
                            ...current,
                            evictionThreshold: event.target.value,
                          }))
                        }
                        required
                        type="number"
                        value={disciplinaryPolicyForm.evictionThreshold}
                      />
                    </label>
                  </div>
                  <button className="button button-secondary" disabled={Boolean(pending)} type="submit">
                    Зберегти політику
                  </button>
                </form>
                <hr className="section-divider" />
                <h3>Нове правило</h3>
                <form className="form-stack" onSubmit={createDisciplinaryRule}>
                  <label>
                    Код правила
                    <input
                      onChange={(event) =>
                        setRuleForm((current) => ({ ...current, code: event.target.value }))
                      }
                      placeholder="CURFEW_VIOLATION"
                      required
                      value={ruleForm.code}
                    />
                  </label>
                  <label>
                    Назва
                    <input
                      onChange={(event) =>
                        setRuleForm((current) => ({ ...current, title: event.target.value }))
                      }
                      required
                      value={ruleForm.title}
                    />
                  </label>
                  <label>
                    Вид
                    <select
                      onChange={(event) =>
                        setRuleForm((current) => ({ ...current, recordType: event.target.value }))
                      }
                      value={ruleForm.recordType}
                    >
                      <option value="violation">Порушення</option>
                      <option value="formal_warning">Офіційне попередження</option>
                    </select>
                  </label>
                  <label>
                    Пункт правил
                    <input
                      onChange={(event) =>
                        setRuleForm((current) => ({ ...current, ruleReference: event.target.value }))
                      }
                      required
                      value={ruleForm.ruleReference}
                    />
                  </label>
                  <label>
                    Бали
                    <input
                      max="35"
                      min="0"
                      onChange={(event) =>
                        setRuleForm((current) => ({ ...current, defaultPoints: event.target.value }))
                      }
                      required
                      type="number"
                      value={ruleForm.defaultPoints}
                    />
                  </label>
                  <button className="button button-secondary" disabled={Boolean(pending)} type="submit">
                    Додати правило
                  </button>
                </form>
              </>
            ) : null}
          </section>
          <section className="page-card">
            <div className="section-heading">
              <h2>Журнал записів</h2>
            </div>
            {data.disciplinaryRecords.length ? (
              <div className="data-list">
                {data.disciplinaryRecords.map((record) => (
                  <article className="data-row" key={record.id}>
                    <div>
                      <strong>{record.recordType === 'violation' ? 'Порушення' : 'Попередження'}</strong>
                      <small>
                        {userById[String(record.userId)]?.fullName ?? record.userId} / {dateLabel(record.incidentDate)}
                      </small>
                      <p>{record.ruleTitle}: {record.description}</p>
                      <small>{record.ruleReference}</small>
                    </div>
                    <div className="discipline-score">
                      <strong>+{record.penaltyPoints} балів</strong>
                      <small>Активно: {record.studentActivePoints} / {data.disciplinaryPolicy?.maxActivePoints ?? 35}</small>
                      <StatusBadge status={record.status} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState>Дисциплінарних записів немає.</EmptyState>
            )}
            {profile.role === 'administrator' ? (
              <>
                <hr className="section-divider" />
                <h3>Довідник правил</h3>
                <div className="data-list">
                  {data.disciplinaryRules.map((rule) => (
                    <article className="data-row discipline-rule-row" key={rule.id}>
                      <div>
                        <strong>{rule.title}</strong>
                        <small>{rule.code} / {rule.defaultPoints} балів</small>
                        <p>{rule.ruleReference}</p>
                      </div>
                      <button
                        className="button button-small button-secondary"
                        disabled={Boolean(pending)}
                        onClick={() => toggleDisciplinaryRule(rule)}
                        type="button"
                      >
                        {rule.active ? 'Архівувати' : 'Відновити'}
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === 'services' ? (
        <div className="two-column-grid">
          <section className="page-card">
            {profile.role === 'administrator' ? (
              <>
                <h2>Новий тариф</h2>
                <form className="form-stack" onSubmit={createService}>
                  <label>
                    Назва послуги
                    <input
                      onChange={(event) =>
                        setServiceForm((current) => ({ ...current, serviceType: event.target.value }))
                      }
                      required
                      value={serviceForm.serviceType}
                    />
                  </label>
                  <label>
                    Код послуги
                    <select
                      onChange={(event) => {
                        const serviceCode = event.target.value;
                        setServiceForm((current) => ({
                          ...current,
                          serviceCode,
                          billingFrequency:
                            serviceCode === 'INTERNET'
                              ? 'monthly'
                              : serviceCode === 'ACCOMMODATION'
                                ? 'semester'
                                : current.billingFrequency,
                        }));
                      }}
                      value={serviceForm.serviceCode}
                    >
                      <option value="">Інша послуга</option>
                      <option value="ACCOMMODATION">Проживання</option>
                      <option value="INTERNET">Інтернет</option>
                    </select>
                  </label>
                  <label>
                    Періодичність
                    <select
                      disabled={['ACCOMMODATION', 'INTERNET'].includes(serviceForm.serviceCode)}
                      onChange={(event) =>
                        setServiceForm((current) => ({ ...current, billingFrequency: event.target.value }))
                      }
                      value={serviceForm.billingFrequency}
                    >
                      <option value="once">Одноразово</option>
                      <option value="monthly">Щомісяця</option>
                      <option value="semester">За семестр</option>
                    </select>
                  </label>
                  {serviceForm.serviceCode === 'INTERNET' ? (
                    <label>
                      Сплатити до числа місяця
                      <input
                        max="28"
                        min="1"
                        onChange={(event) =>
                          setServiceForm((current) => ({ ...current, paymentDueDay: event.target.value }))
                        }
                        required
                        type="number"
                        value={serviceForm.paymentDueDay}
                      />
                    </label>
                  ) : null}
                  <label>
                    Вартість, грн
                    <input
                      min="0"
                      onChange={(event) =>
                        setServiceForm((current) => ({ ...current, price: event.target.value }))
                      }
                      required
                      step="0.01"
                      type="number"
                      value={serviceForm.price}
                    />
                  </label>
                  <button className="button button-primary" disabled={Boolean(pending)} type="submit">
                    Додати тариф
                  </button>
                </form>
              </>
            ) : (
              <>
                <span className="eyebrow">Перегляд</span>
                <h2>Тарифи визначає адміністрація</h2>
                <p className="muted">
                  Нарахування створюються автоматично за календарем. Комендант
                  переглядає оплату мешканців свого гуртожитку.
                </p>
              </>
            )}
          </section>
          <section className="page-card">
            <h2>Тарифи та архів</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Послуга</th>
                    <th>Період</th>
                    <th>Сплатити до</th>
                    <th>Ціна, грн</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((service) => (
                    <EditableService
                      canManage={profile.role === 'administrator'}
                      key={service.id}
                      onSave={saveServicePrice}
                      onToggleActive={toggleServiceActive}
                      service={service}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {profile.role === 'administrator' ? (
              <>
                <h2 className="spaced-title">Автоматичні нарахування</h2>
                <p className="muted">
                  Інтернет нараховується щомісяця з першого числа. Для проживання
                  вкажіть календар семестру відповідно до навчального графіка.
                </p>
                <form className="form-stack" onSubmit={createBillingPeriod}>
                  <label>
                    Тариф проживання
                    <select
                      onChange={(event) =>
                        setBillingPeriodForm((current) => ({ ...current, serviceId: event.target.value }))
                      }
                      required
                      value={billingPeriodForm.serviceId}
                    >
                      <option value="">Оберіть тариф</option>
                      {data.services
                        .filter((service) => service.active && service.serviceCode === 'ACCOMMODATION')
                        .map((service) => (
                          <option key={service.id} value={service.id}>{service.serviceType}</option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Назва періоду
                    <input
                      onChange={(event) =>
                        setBillingPeriodForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Осінній семестр 2026/2027"
                      required
                      value={billingPeriodForm.name}
                    />
                  </label>
                  <div className="compact-form-grid">
                    {[
                      ['periodStart', 'Початок періоду'],
                      ['periodEnd', 'Кінець періоду'],
                      ['chargeDate', 'Дата нарахування'],
                      ['dueDate', 'Сплатити до'],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label}
                        <input
                          onChange={(event) =>
                            setBillingPeriodForm((current) => ({ ...current, [name]: event.target.value }))
                          }
                          required
                          type="date"
                          value={billingPeriodForm[name]}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="inline-actions">
                    <button className="button button-primary" disabled={Boolean(pending)} type="submit">
                      Запланувати семестр
                    </button>
                    <button className="button button-secondary" onClick={runScheduledCharges} type="button">
                      Синхронізувати нарахування
                    </button>
                  </div>
                </form>
                <div className="data-list spaced-title">
                  {data.billingPeriods.length ? (
                    data.billingPeriods.map((period) => (
                      <article className="data-row" key={period.id}>
                        <div>
                          <strong>{period.name}</strong>
                          <small>
                            {dateLabel(period.periodStart)} - {dateLabel(period.periodEnd)}
                          </small>
                          <p>
                            Нарахування: {dateLabel(period.chargeDate)} / до сплати:{' '}
                            {dateLabel(period.dueDate)}
                          </p>
                        </div>
                        <StatusBadge status={period.active ? 'active' : 'archived'} />
                      </article>
                    ))
                  ) : (
                    <EmptyState>Семестрових періодів ще не заплановано.</EmptyState>
                  )}
                </div>
                <div className="inline-actions spaced-title">
                  <button className="button button-secondary" onClick={generateReminders} type="button">
                    Оновити нагадування
                  </button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === 'analytics' ? (
        <>
          <ReportFilters
            dorms={data.dorms}
            filters={reportFilters}
            onChange={setReportFilters}
            onReset={() => setReportFilters(emptyReportFilters)}
          />
          <div className="metrics management-metrics analytics-metrics">
            <article className="metric-card">
              <small>Зайнятість у вибірці</small>
              <strong>{filteredOccupancyPercent}%</strong>
              <span>
                {filteredOccupied} із {filteredCapacity} місць
              </span>
              <div className="progress">
                <span style={{ width: `${Math.min(filteredOccupancyPercent, 100)}%` }} />
              </div>
            </article>
            <article className="metric-card">
              <small>Заявки за період</small>
              <strong>{filteredApplications.length}</strong>
              <span>з урахуванням обраних фільтрів</span>
            </article>
            <article className="metric-card">
              <small>Успішні оплати</small>
              <strong>{currency(filteredRevenue)}</strong>
              <span>{filteredTransactions.length} операцій</span>
            </article>
            <article className="metric-card">
              <small>Кімнати у вибірці</small>
              <strong>{filteredRooms.length}</strong>
              <span>{selectedDormId ? 'в обраному гуртожитку' : 'у всіх гуртожитках'}</span>
            </article>
          </div>
          <div className="analytics-grid">
            <section className="page-card chart-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Завантаженість</span>
                  <h2>Місця за гуртожитками</h2>
                </div>
              </div>
              <HorizontalChart data={occupancyData} showZeroRows suffix="%" />
            </section>
            <section className="page-card chart-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Заявки</span>
                  <h2>Статуси звернень</h2>
                </div>
              </div>
              <HorizontalChart data={applicationStatusData} />
            </section>
            <section className="page-card chart-card chart-wide">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Фінанси</span>
                  <h2>Платежі за останні 6 місяців</h2>
                </div>
              </div>
              <RevenueChart data={revenueData} />
            </section>
          </div>
        </>
      ) : null}

      {tab === 'users' && profile.role === 'administrator' ? (
        <div className="workspace-grid management-workspace">
          <section className="page-card workspace-form">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Адміністрування</span>
                <h2>Додати користувача</h2>
              </div>
            </div>
            <p className="muted">
              Додавайте співробітників та керуйте рівнями доступу до системи.
            </p>
            <form className="form-stack" onSubmit={createUser}>
              <label>
                Email
                <input
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                  type="email"
                  value={userForm.email}
                />
              </label>
              <label>
                Початковий пароль
                <input
                  autoComplete="new-password"
                  minLength="6"
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, password: event.target.value }))
                  }
                  required
                  type="password"
                  value={userForm.password}
                />
              </label>
              <label>
                Підтвердження пароля
                <input
                  autoComplete="new-password"
                  minLength="6"
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      passwordConfirmation: event.target.value,
                    }))
                  }
                  required
                  type="password"
                  value={userForm.passwordConfirmation}
                />
              </label>
              <label>
                ПІБ
                <input
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                  required
                  value={userForm.fullName}
                />
              </label>
              <label>
                Роль
                <select
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, role: event.target.value }))
                  }
                  value={userForm.role}
                >
                  <option value="commandant">Комендант</option>
                  <option value="maintenance_staff">Обслуговуючий персонал</option>
                  <option value="administrator">Адміністратор</option>
                  <option value="student">Студент</option>
                </select>
              </label>
              {userForm.role === 'maintenance_staff' ? (
                <label>
                  Спеціалізація
                  <select
                    onChange={(event) =>
                      setUserForm((current) => ({
                        ...current,
                        maintenanceSpecialization: event.target.value,
                      }))
                    }
                    value={userForm.maintenanceSpecialization}
                  >
                    <option value="general">Універсальний спеціаліст</option>
                    <option value="electrician">Електрик</option>
                    <option value="plumber">Сантехнік</option>
                  </select>
                </label>
              ) : null}
              <button className="button button-primary" disabled={Boolean(pending)} type="submit">
                Створити користувача
              </button>
            </form>
          </section>
          <section className="page-card workspace-table">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Доступ</span>
                <h2>Користувачі та ролі</h2>
              </div>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Користувач</th>
                    <th>Email</th>
                    <th>Доступ</th>
                    <th>Роль</th>
                    <th>Спеціалізація</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <EditableUserRole
                      currentUserId={profile.id}
                      key={user.id}
                      onActivate={activateUser}
                      onSave={saveUserRole}
                      user={user}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'assignments' && profile.role === 'administrator' ? (
        <div className="workspace-grid management-workspace">
          <section className="page-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Scope доступу</span>
                <h2>Призначити персонал</h2>
              </div>
            </div>
            <form className="form-stack" onSubmit={createAssignment}>
              <label>
                Працівник
                <select
                  onChange={(event) =>
                    setAssignmentForm((current) => ({ ...current, userId: event.target.value }))
                  }
                  required
                  value={assignmentForm.userId}
                >
                  <option value="">Оберіть працівника</option>
                  {data.users
                    .filter((user) => ['commandant', 'maintenance_staff'].includes(user.role))
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName} / {roleLabel(user.role)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Гуртожиток
                <select
                  onChange={(event) =>
                    setAssignmentForm((current) => ({ ...current, dormId: event.target.value }))
                  }
                  required
                  value={assignmentForm.dormId}
                >
                  <option value="">Оберіть гуртожиток</option>
                  {data.dorms.map((dorm) => (
                    <option key={dorm.id} value={dorm.id}>
                      Гуртожиток {dorm.dormNumber}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button button-primary" disabled={Boolean(pending)} type="submit">
                Призначити
              </button>
            </form>
          </section>
          <section className="page-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Покриття гуртожитків</span>
                <h2>Призначення за гуртожитками</h2>
              </div>
            </div>
            <div className="assignment-filters">
              <select
                onChange={(event) =>
                  setAssignmentFilters((current) => ({ ...current, dormId: event.target.value }))
                }
                value={assignmentFilters.dormId}
              >
                <option value="">Усі гуртожитки</option>
                {data.dorms.map((dorm) => (
                  <option key={dorm.id} value={dorm.id}>Гуртожиток {dorm.dormNumber}</option>
                ))}
              </select>
              <select
                onChange={(event) =>
                  setAssignmentFilters((current) => ({ ...current, role: event.target.value }))
                }
                value={assignmentFilters.role}
              >
                <option value="">Усі ролі</option>
                <option value="commandant">Коменданти</option>
                <option value="maintenance_staff">Обслуговуючий персонал</option>
              </select>
              <select
                onChange={(event) =>
                  setAssignmentFilters((current) => ({ ...current, active: event.target.value }))
                }
                value={assignmentFilters.active}
              >
                <option value="active">Активні</option>
                <option value="archived">Завершені</option>
                <option value="">Усі</option>
              </select>
            </div>
            {assignmentGroups.length ? (
              <div className="assignment-groups">
                {assignmentGroups.map((group) => (
                  <section className="assignment-group" key={group.dorm.id}>
                    <header>
                      <div>
                        <strong>Гуртожиток {group.dorm.dormNumber}</strong>
                        <small>{group.dorm.address}</small>
                      </div>
                      <span>{group.assignments.length} призначень</span>
                    </header>
                    <div className="data-list">
                      {group.assignments.map((assignment) => (
                        <article className="data-row" key={assignment.id}>
                          <div>
                            <strong>{assignment.userName}</strong>
                            <small>
                              {roleLabel(assignment.role)}
                              {assignment.role === 'maintenance_staff'
                                ? ` / ${maintenanceSpecializationLabel(assignment.maintenanceSpecialization)}`
                                : ''}
                            </small>
                          </div>
                          <div className="inline-actions">
                            <StatusBadge status={assignment.active ? 'active' : 'archived'} />
                            {assignment.active ? (
                              <button
                                className="button button-small button-danger"
                                onClick={() => endAssignment(assignment.id)}
                                type="button"
                              >
                                Завершити
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <EmptyState>Призначень за вибраними умовами немає.</EmptyState>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'reports' ? (
        <>
          <ReportFilters
            dorms={data.dorms}
            filters={reportFilters}
            onChange={setReportFilters}
            onReset={() => setReportFilters(emptyReportFilters)}
          />
          <PrintableReport
          activeResidences={filteredResidences}
          applications={filteredApplications}
          dorms={dormById}
          filters={reportFilters}
          occupied={filteredOccupied}
          capacity={filteredCapacity}
          revenue={filteredRevenue}
          rooms={filteredRooms}
          transactions={filteredTransactions}
          users={userById}
          />
        </>
      ) : null}
    </div>
  );
}

function layoutRooms(layout) {
  return layout.floors.flatMap((floor) => [
    ...floor.rooms,
    ...floor.blocks.flatMap((block) => block.rooms),
  ]);
}

function occupancyTotals(rooms) {
  return rooms.reduce(
    (totals, room) => ({
      rooms: totals.rooms + 1,
      capacity: totals.capacity + Number(room.capacity),
      occupied: totals.occupied + Number(room.occupied),
      available: totals.available + Number(room.availablePlaces),
    }),
    { rooms: 0, capacity: 0, occupied: 0, available: 0 },
  );
}

function filterHousingLayouts(layouts, filters, internetByRoomId, selectedRoomId = null) {
  const query = filters.search.trim().toLocaleLowerCase('uk');

  function matchesRoom(room) {
    const selected = String(room.id) === String(selectedRoomId);
    const internetStatus = internetByRoomId[String(room.id)]?.internetStatus ?? 'not_connected';
    const matchText = [
      room.roomNumber,
      room.blockNumber ? `блок ${room.floorNumber}${String(room.blockNumber).padStart(2, '0')}` : '',
      ...room.residents.map((resident) => resident.fullName),
    ].join(' ').toLocaleLowerCase('uk');
    const availabilityMatches =
      !filters.availability
      || selected
      || (filters.availability === 'available' && room.availablePlaces > 0)
      || (filters.availability === 'empty' && room.occupied === 0)
      || (filters.availability === 'full' && room.availablePlaces === 0);

    return (
      (!filters.floorNumber || String(room.floorNumber) === String(filters.floorNumber))
      && availabilityMatches
      && (!filters.internetStatus || internetStatus === filters.internetStatus)
      && (!query || matchText.includes(query))
    );
  }

  return layouts
    .filter((layout) => !filters.dormId || String(layout.dorm.id) === String(filters.dormId))
    .map((layout) => {
      const floors = layout.floors
        .map((floor) => {
          const blocks = floor.blocks
            .map((block) => {
              const rooms = block.rooms.filter(matchesRoom);
              return { ...block, rooms, totals: occupancyTotals(rooms) };
            })
            .filter((block) => block.rooms.length);
          const rooms = floor.rooms.filter(matchesRoom);
          const displayedRooms = [...rooms, ...blocks.flatMap((block) => block.rooms)];
          return { ...floor, blocks, rooms, totals: occupancyTotals(displayedRooms) };
        })
        .filter((floor) => floor.totals.rooms);
      const rooms = floors.flatMap((floor) => [
        ...floor.rooms,
        ...floor.blocks.flatMap((block) => block.rooms),
      ]);
      return { ...layout, floors, totals: occupancyTotals(rooms) };
    })
    .filter((layout) => layout.totals.rooms);
}

function isDateInRange(value, filters) {
  if (!value) {
    return false;
  }

  const date = new Date(value).toISOString().slice(0, 10);

  return (!filters.dateFrom || date >= filters.dateFrom) && (!filters.dateTo || date <= filters.dateTo);
}

function createMonthlyRevenueData(transactions) {
  const months = Array.from({ length: 6 }, (_value, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const key = date.toISOString().slice(0, 7);

    return {
      key,
      label: new Intl.DateTimeFormat('uk-UA', { month: 'short', year: '2-digit' }).format(date),
      value: 0,
    };
  });
  const values = Object.fromEntries(months.map((month) => [month.key, month]));

  transactions.forEach((transaction) => {
    const key = new Date(transaction.paidAt ?? transaction.createdAt).toISOString().slice(0, 7);

    if (values[key]) {
      values[key].value += Number(transaction.amount);
    }
  });

  return months;
}

function ReportFilters({ dorms, filters, onChange, onReset }) {
  function updateFilter(event) {
    onChange((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  return (
    <section className="page-card report-controls no-print">
      <div className="filter-heading">
        <div>
          <span className="eyebrow">Фільтри</span>
          <h2>Вибірка для аналізу та звіту</h2>
        </div>
        <button className="text-action" onClick={onReset} type="button">
          Скинути
        </button>
      </div>
      <div className="filter-grid">
        <label>
          Гуртожиток
          <select name="dormId" onChange={updateFilter} value={filters.dormId}>
            <option value="">Усі гуртожитки</option>
            {dorms.map((dorm) => (
              <option key={dorm.id} value={dorm.id}>
                Гуртожиток {dorm.dormNumber} - {dorm.address}
              </option>
            ))}
          </select>
        </label>
        <label>
          З дати
          <input name="dateFrom" onChange={updateFilter} type="date" value={filters.dateFrom} />
        </label>
        <label>
          До дати
          <input name="dateTo" onChange={updateFilter} type="date" value={filters.dateTo} />
        </label>
      </div>
      <p className="field-note">
        Період впливає на заявки й оплати; зайнятість відображає актуальне поселення.
        Оплати за гуртожитком визначаються через історію поселень студента.
      </p>
    </section>
  );
}

function HorizontalChart({ data, showZeroRows = false, suffix = '' }) {
  const rows = showZeroRows ? data : data.filter((item) => item.value > 0);
  const maxValue = Math.max(...rows.map((item) => item.value), 1);

  if (!rows.length) {
    return <EmptyState>Даних для візуалізації у вибраному зрізі немає.</EmptyState>;
  }

  return (
    <div className="horizontal-chart">
      {rows.map((item) => (
        <div className="chart-row" key={item.label}>
          <div className="chart-label">
            <strong>{item.label}</strong>
            {item.detail ? <small>{item.detail}</small> : null}
          </div>
          <div className="bar-track">
            <span style={{ width: `${Math.max((item.value / maxValue) * 100, item.value ? 4 : 0)}%` }} />
          </div>
          <strong className="chart-value">
            {item.value}
            {suffix}
          </strong>
        </div>
      ))}
    </div>
  );
}

function RevenueChart({ data }) {
  const maxValue = Math.max(...data.map((month) => month.value), 1);

  if (!data.some((month) => month.value > 0)) {
    return <EmptyState>Успішних платежів за останні шість місяців немає.</EmptyState>;
  }

  return (
    <div className="revenue-chart" aria-label="Успішні платежі за останні шість місяців">
      {data.map((month) => (
        <div className="revenue-column" key={month.key}>
          <strong>{month.value ? currency(month.value) : ''}</strong>
          <div className="column-track">
            <span style={{ height: `${(month.value / maxValue) * 100}%` }} />
          </div>
          <small>{month.label}</small>
        </div>
      ))}
    </div>
  );
}

function maintenanceSpecializationLabel(specialization) {
  return {
    general: 'Універсальний спеціаліст',
    electrician: 'Електрик',
    plumber: 'Сантехнік',
  }[specialization ?? 'general'];
}

function EditableUserRole({ currentUserId, onActivate, onSave, user }) {
  const [role, setRole] = useState(user.role);
  const [maintenanceSpecialization, setMaintenanceSpecialization] = useState(
    user.maintenanceSpecialization ?? 'general',
  );
  const [activationPassword, setActivationPassword] = useState('');
  const isCurrentUser = String(currentUserId) === String(user.id);
  const hasAccess = Boolean(user.firebaseUid);

  return (
    <tr>
      <td>
        <strong>{user.fullName}</strong>
        {isCurrentUser ? <small className="table-note">Ваш профіль</small> : null}
      </td>
      <td>{user.email}</td>
      <td>
        {hasAccess ? (
          <span className="status status-active">Активний</span>
        ) : (
          <div className="account-activation">
            <span className="status status-pending">Не активовано</span>
            <input
              autoComplete="new-password"
              className="table-input account-password"
              minLength="6"
              onChange={(event) => setActivationPassword(event.target.value)}
              placeholder="Початковий пароль"
              type="password"
              value={activationPassword}
            />
            <button
              className="button button-small button-secondary"
              disabled={activationPassword.length < 6}
              onClick={() => onActivate(user.id, activationPassword)}
              type="button"
            >
              Активувати
            </button>
          </div>
        )}
      </td>
      <td>
        <select
          className="table-input role-select"
          disabled={isCurrentUser}
          onChange={(event) => setRole(event.target.value)}
          value={role}
        >
          <option value="student">Студент</option>
          <option value="commandant">Комендант</option>
          <option value="maintenance_staff">Обслуговуючий персонал</option>
          <option value="administrator">Адміністратор</option>
        </select>
      </td>
      <td>
        {role === 'maintenance_staff' ? (
          <select
            className="table-input role-select"
            disabled={isCurrentUser}
            onChange={(event) => setMaintenanceSpecialization(event.target.value)}
            value={maintenanceSpecialization}
          >
            <option value="general">Універсальний</option>
            <option value="electrician">Електрик</option>
            <option value="plumber">Сантехнік</option>
          </select>
        ) : (
          '-'
        )}
      </td>
      <td>
        {isCurrentUser ? (
          <span className="muted">{roleLabel(user.role)}</span>
        ) : (
          <button
            className="button button-small button-secondary"
            onClick={() => onSave(user.id, role, maintenanceSpecialization)}
            type="button"
          >
            Зберегти
          </button>
        )}
      </td>
    </tr>
  );
}

function roomPlacement(room, dorms) {
  if (!room) {
    return '-';
  }

  return `Гуртожиток ${dorms[String(room.dormId)]?.dormNumber ?? '-'}, кімната ${room.roomNumber}${
    room.blockNumber ? ` / блок ${room.blockNumber}` : ''
  }`;
}

function ApplicationRouting({ application, disabled, dormOptions, onRoute }) {
  const [dormId, setDormId] = useState('');

  return (
    <div className="application-decision">
      <span className="muted">Направте заявку до гуртожитку для подальшої обробки.</span>
      <select
        className="table-input"
        onChange={(event) => setDormId(event.target.value)}
        value={dormId}
      >
        <option value="">Оберіть гуртожиток</option>
        {dormOptions.map((dorm) => (
          <option key={dorm.id} value={dorm.id}>
            Гуртожиток {dorm.dormNumber}
          </option>
        ))}
      </select>
      <button
        className="button button-small button-primary"
        disabled={disabled || !dormId}
        onClick={() => onRoute(application.id, dormId)}
        type="button"
      >
        Направити
      </button>
    </div>
  );
}

function ApplicationDecision({
  application,
  disabled,
  disciplinaryRecords = [],
  dorms,
  occupancyRooms = {},
  onStatusChange,
  roomOptions,
}) {
  const [form, setForm] = useState({
    assignedRoomId: application.assignedRoomId ?? '',
    resolutionNote: application.resolutionNote ?? '',
    eligibilityVerified: application.eligibilityVerified,
    documentsVerified: application.documentsVerified,
    paymentVerified: application.paymentVerified,
    medicalClearanceVerified: application.medicalClearanceVerified,
    safetyBriefingCompleted: application.safetyBriefingCompleted,
    passIssued: application.passIssued,
    housingConditionsConfirmed: application.housingConditionsConfirmed,
    disciplinaryRecordIds: [],
  });
  const complete = ['completed', 'rejected', 'cancelled'].includes(application.status);
  const needsDestination = ['settlement', 'relocation'].includes(application.applicationType);
  const availableRoomOptions = roomOptions.filter((room) => {
    if (application.managedDormId && String(room.dormId) !== String(application.managedDormId)) {
      return false;
    }
    const occupancy = occupancyRooms[String(room.id)];
    return (
      String(room.id) === String(form.assignedRoomId)
      || !occupancy
      || occupancy.availablePlaces > 0
    );
  });

  function updateField(event) {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [event.target.name]: value }));
  }

  function submit(status) {
    const fields = {
      ...form,
      assignedRoomId: form.assignedRoomId || null,
      status,
    };
    if (application.applicationType !== 'eviction') {
      delete fields.disciplinaryRecordIds;
    }
    onStatusChange(application.id, fields);
  }

  if (complete) {
    return <span className="muted">Рішення завершено</span>;
  }

  return (
    <div className="application-decision">
      {needsDestination ? (
        <select
          className="table-input"
          name="assignedRoomId"
          onChange={updateField}
          value={form.assignedRoomId}
        >
          <option value="">Призначте кімнату</option>
          {availableRoomOptions.map((room) => (
            <option key={room.id} value={room.id}>
              {roomPlacement(room, dorms)}
              {occupancyRooms[String(room.id)]
                ? ` - ${occupancyRooms[String(room.id)].availablePlaces} вільн. місць`
                : ''}
            </option>
          ))}
        </select>
      ) : null}
      {application.applicationType === 'settlement' ? (
        <>
          <p className="decision-note">
            Спочатку погодьте місце. Після подання документів підтвердьте оформлення
            поселення.
          </p>
          <div className="decision-checks">
            <label><input checked={form.eligibilityVerified} name="eligibilityVerified" onChange={updateField} type="checkbox" /> Право на поселення підтверджено</label>
            <label><input checked={form.documentsVerified} name="documentsVerified" onChange={updateField} type="checkbox" /> Документи отримано</label>
            <label><input checked={form.paymentVerified} name="paymentVerified" onChange={updateField} type="checkbox" /> Оплату підтверджено</label>
            <label><input checked={form.medicalClearanceVerified} name="medicalClearanceVerified" onChange={updateField} type="checkbox" /> Медичну довідку отримано</label>
            <label><input checked={form.safetyBriefingCompleted} name="safetyBriefingCompleted" onChange={updateField} type="checkbox" /> Інструктаж проведено</label>
            <label><input checked={form.passIssued} name="passIssued" onChange={updateField} type="checkbox" /> Перепустку видано</label>
          </div>
        </>
      ) : null}
      {application.applicationType === 'renewal' ? (
        <div className="decision-checks">
          <label><input checked={form.eligibilityVerified} name="eligibilityVerified" onChange={updateField} type="checkbox" /> Право на продовження</label>
          <label><input checked={form.paymentVerified} name="paymentVerified" onChange={updateField} type="checkbox" /> Заборгованість відсутня</label>
        </div>
      ) : null}
      {application.applicationType === 'relocation' ? (
        <label className="decision-confirm">
          <input
            checked={form.housingConditionsConfirmed}
            name="housingConditionsConfirmed"
            onChange={updateField}
            type="checkbox"
          />{' '}
          Умови проживання не погіршуються
        </label>
      ) : null}
      {application.applicationType === 'eviction' ? (
        <>
          {disciplinaryRecords.length ? (
            <div className="decision-checks">
              {disciplinaryRecords.map((record) => (
                <label key={record.id}>
                  <input
                    checked={form.disciplinaryRecordIds.includes(String(record.id))}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        disciplinaryRecordIds: event.target.checked
                          ? [...current.disciplinaryRecordIds, String(record.id)]
                          : current.disciplinaryRecordIds.filter((id) => id !== String(record.id)),
                      }))
                    }
                    type="checkbox"
                  />
                  {record.recordType === 'violation' ? 'Порушення' : 'Попередження'} від{' '}
                  {dateLabel(record.incidentDate)}
                </label>
              ))}
            </div>
          ) : null}
          <textarea
            className="table-note-input"
            name="resolutionNote"
            onChange={updateField}
            placeholder="Підстава виселення"
            rows="2"
            value={form.resolutionNote}
          />
        </>
      ) : null}
      <div className="inline-actions">
        <button className="button button-small button-secondary" disabled={disabled} onClick={() => submit('in_review')} type="button">
          {application.applicationType === 'settlement' ? 'Розпочати перевірку' : 'В роботу'}
        </button>
        <button className="button button-small button-secondary" disabled={disabled} onClick={() => submit('approved')} type="button">
          {application.applicationType === 'settlement' ? 'Погодити місце' : 'Схвалити'}
        </button>
        <button className="button button-small button-danger" disabled={disabled} onClick={() => submit('rejected')} type="button">
          Відхилити
        </button>
        <button className="button button-small button-primary" disabled={disabled} onClick={() => submit('completed')} type="button">
          {application.applicationType === 'settlement' ? 'Підтвердити поселення' : 'Виконано'}
        </button>
      </div>
    </div>
  );
}

function ApplicantPreview({ user, userId }) {
  if (!user) {
    return userId;
  }

  return (
    <details className="applicant-preview">
      <summary
        title={`${user.email}\nІнститут: ${user.faculty || 'не вказано'}\nОсвітня програма: ${user.specialty || 'не вказано'}`}
      >
        {user.fullName}
      </summary>
      <div className="applicant-preview-card">
        <strong>{user.fullName}</strong>
        <span>{user.email}</span>
        <small>
          <b>Інститут:</b> {user.faculty || 'не вказано'}
        </small>
        <small>
          <b>Освітня програма:</b> {user.specialty || 'не вказано'}
        </small>
      </div>
    </details>
  );
}

function ApplicationTable({
  actions = false,
  applications,
  canRoute = false,
  disabled,
  disciplinaryRecords = [],
  dorms = {},
  occupancyRooms = {},
  onRoute,
  onStatusChange,
  roomOptions = [],
  rooms,
  users,
}) {
  if (!applications.length) {
    return <EmptyState>Заявок поки немає.</EmptyState>;
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Студент</th>
            <th>Тип</th>
            <th>Кімната / рішення</th>
            <th>Дата</th>
            <th>Статус</th>
            {actions ? <th>Дії</th> : null}
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => (
            <tr key={application.id}>
              <td>
                <ApplicantPreview user={users[String(application.userId)]} userId={application.userId} />
              </td>
              <td>{typeLabel(application.applicationType)}</td>
              <td>
                {application.applicationType === 'settlement'
                  ? application.assignedRoomId
                    ? roomPlacement(rooms[String(application.assignedRoomId)], dorms)
                    : 'Місце ще не призначено'
                  : roomPlacement(rooms[String(application.roomId)], dorms)}
                {application.applicationType === 'relocation' && application.assignedRoomId ? (
                  <small className="table-note">
                    Нова: {roomPlacement(rooms[String(application.assignedRoomId)], dorms)}
                  </small>
                ) : null}
                {application.managedDormId ? (
                  <small className="table-note">
                    Обробляє гуртожиток {dorms[String(application.managedDormId)]?.dormNumber ?? '-'}
                  </small>
                ) : null}
              </td>
              <td>{dateLabel(application.createdAt)}</td>
              <td>
                <StatusBadge status={application.status} />
              </td>
              {actions ? (
                <td>
                  {canRoute && !application.managedDormId ? (
                    <ApplicationRouting
                      application={application}
                      disabled={disabled}
                      dormOptions={Object.values(dorms)}
                      onRoute={onRoute}
                    />
                  ) : (
                    <ApplicationDecision
                      application={application}
                      disabled={disabled}
                      disciplinaryRecords={disciplinaryRecords.filter(
                        (record) =>
                          String(record.userId) === String(application.userId) &&
                          record.status === 'active',
                      )}
                      dorms={dorms}
                      occupancyRooms={occupancyRooms}
                      onStatusChange={onStatusChange}
                      roomOptions={roomOptions}
                    />
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintableReport({
  activeResidences,
  applications,
  capacity,
  dorms,
  filters,
  occupied,
  revenue,
  rooms,
  transactions,
  users,
}) {
  const occupancyByRoom = Object.fromEntries(
    rooms.map((room) => [
      String(room.id),
      activeResidences.filter((residence) => String(residence.roomId) === String(room.id)).length,
    ]),
  );

  return (
    <section className="page-card printable-report">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Друкований звіт</span>
          <h2>Завантаженість та оплати</h2>
        </div>
        <button className="button button-secondary no-print" onClick={() => window.print()} type="button">
          Друкувати
        </button>
      </div>
      <p className="report-date">Сформовано: {dateLabel(new Date().toISOString())}</p>
      <p className="report-date">
        Період: {filters.dateFrom ? dateLabel(filters.dateFrom) : 'усі дати'} -{' '}
        {filters.dateTo ? dateLabel(filters.dateTo) : 'без обмеження'}; гуртожиток:{' '}
        {filters.dormId ? dorms[String(filters.dormId)]?.dormNumber ?? '-' : 'усі'}.
      </p>
      <div className="report-summary">
        <strong>Зайнято місць: {occupied} / {capacity}</strong>
        <strong>Заявок: {applications.length}</strong>
        <strong>Успішні платежі: {currency(revenue)}</strong>
      </div>
      <h3>Зайнятість кімнат</h3>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Гуртожиток</th>
              <th>Поверх</th>
              <th>Блок</th>
              <th>Кімната</th>
              <th>Місткість</th>
              <th>Зайнято</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td>{dorms[String(room.dormId)]?.dormNumber ?? '-'}</td>
                <td>{room.floorNumber ?? '-'}</td>
                <td>{room.blockNumber ?? '-'}</td>
                <td>{room.roomNumber}</td>
                <td>{room.capacity}</td>
                <td>{occupancyByRoom[String(room.id)]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Заявки за вибраний період</h3>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Студент</th>
              <th>Тип</th>
              <th>Дата</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr key={application.id}>
                <td>{users[String(application.userId)]?.fullName ?? application.userId}</td>
                <td>{typeLabel(application.applicationType)}</td>
                <td>{dateLabel(application.createdAt)}</td>
                <td>
                  <StatusBadge status={application.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!applications.length ? <p className="muted">Заявок у вибраному періоді немає.</p> : null}
      </div>
      <h3>Успішні оплати</h3>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Студент</th>
              <th>Сума</th>
              <th>Дата оплати</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{users[String(transaction.userId)]?.fullName ?? transaction.userId}</td>
                <td>{currency(transaction.amount)}</td>
                <td>{dateLabel(transaction.paidAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
