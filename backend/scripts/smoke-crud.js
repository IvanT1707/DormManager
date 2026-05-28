process.env.NODE_ENV = 'test';

const { app } = await import('../src/index.js');
const { pool, closeDatabaseConnection } = await import('../src/config/database.js');

const created = {};
const stamp = Date.now();
const uids = {
  admin: `smoke-admin-${stamp}`,
  student: `smoke-student-${stamp}`,
  commandant: `smoke-commandant-${stamp}`,
  maintenance: `smoke-maintenance-${stamp}`,
  registered: `smoke-registered-${stamp}`,
};
const tokens = {
  admin: `test:${uids.admin}|admin-${stamp}@test.local`,
  student: `test:${uids.student}|student-${stamp}@test.local`,
  commandant: `test:${uids.commandant}|commandant-${stamp}@test.local`,
  maintenance: `test:${uids.maintenance}|maintenance-${stamp}@test.local`,
  registered: `test:${uids.registered}|registered-${stamp}@test.local`,
};
const server = await new Promise((resolve) => {
  const listeningServer = app.listen(0, () => resolve(listeningServer));
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function request(path, options = {}, expectedStatus = 200) {
  const { token = tokens.admin, ...fetchOptions } = options;
  const headers = { 'Content-Type': 'application/json', ...fetchOptions.headers };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, { ...fetchOptions, headers });
  const body = response.status === 204 ? null : await response.json();

  if (response.status !== expectedStatus) {
    throw new Error(
      `${fetchOptions.method ?? 'GET'} ${path} returned ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body;
}

try {
  const admin = await pool.query(
    `INSERT INTO users (firebase_uid, email, role, full_name)
     VALUES ($1, $2, 'administrator', $3) RETURNING id`,
    [uids.admin, `admin-${stamp}@test.local`, 'Smoke Test Administrator'],
  );
  created.admin = admin.rows[0].id;

  await request('/api/dorms', { token: null }, 401);
  const noProfile = await request('/api/auth/me', { token: tokens.registered });
  if (noProfile.profile !== null) {
    throw new Error('Unregistered Firebase identity unexpectedly has a profile.');
  }
  const registered = await request(
    '/api/auth/register',
    {
      method: 'POST',
      token: tokens.registered,
      body: JSON.stringify({ fullName: 'Registered Smoke Student', faculty: 'Test Faculty' }),
    },
    201,
  );
  created.registered = registered.id;
  if (registered.role !== 'student') {
    throw new Error('Self-registration did not create a student profile.');
  }
  await request('/api/auth/me', { token: tokens.registered });
  await request('/api/auth/me', {
    method: 'PATCH',
    token: tokens.registered,
    body: JSON.stringify({ specialty: 'Test Specialty' }),
  });

  const dorm = await request(
    '/api/dorms',
    {
      method: 'POST',
      body: JSON.stringify({ dormNumber: `TEST-${stamp}`, address: 'Smoke test address' }),
    },
    201,
  );
  created.dorm = dorm.id;
  await request(`/api/dorms/${dorm.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ address: 'Updated smoke test address' }),
  });
  const generatedLayout = await request(
    `/api/dorms/${dorm.id}/generate-rooms`,
    {
      method: 'POST',
      body: JSON.stringify({
        totalFloors: 3,
        residentialFloorFrom: 2,
        hasBlocks: true,
        blocksPerFloor: 2,
        roomsPerBlock: 2,
        defaultRoomCapacity: 4,
      }),
    },
    201,
  );
  if (generatedLayout.createdRooms !== 8 || generatedLayout.totalPlaces !== 32) {
    throw new Error('Dorm layout generation did not calculate rooms and capacity correctly.');
  }
  const secondFloorRooms = await request(`/api/rooms?dormId=${dorm.id}&floorNumber=2`);
  if (
    secondFloorRooms.length !== 4 ||
    secondFloorRooms.some((item) => item.floorNumber !== 2 || !item.blockNumber) ||
    !['201а', '201б', '202а', '202б'].every((number) =>
      secondFloorRooms.some((item) => item.roomNumber === number),
    )
  ) {
    throw new Error('Block room generation did not create lettered room numbers.');
  }

  const plainDorm = await request(
    '/api/dorms',
    {
      method: 'POST',
      body: JSON.stringify({ dormNumber: `PLAIN-${stamp}`, address: 'Plain layout smoke address' }),
    },
    201,
  );
  created.plainDorm = plainDorm.id;
  await request(
    `/api/dorms/${plainDorm.id}/generate-rooms`,
    {
      method: 'POST',
      body: JSON.stringify({
        totalFloors: 2,
        residentialFloorFrom: 2,
        hasBlocks: false,
        roomsPerFloor: 3,
        defaultRoomCapacity: 2,
      }),
    },
    201,
  );
  const plainRooms = await request(`/api/rooms?dormId=${plainDorm.id}&floorNumber=2`);
  if (
    plainRooms.length !== 3 ||
    plainRooms.some((item) => item.blockNumber || /[а-яіїєґ]/u.test(item.roomNumber)) ||
    !['201', '202', '203'].every((number) => plainRooms.some((item) => item.roomNumber === number))
  ) {
    throw new Error('Non-block room generation did not retain numeric room numbers.');
  }

  const room = await request(
    '/api/rooms',
    {
      method: 'POST',
      body: JSON.stringify({ dormId: dorm.id, roomNumber: `T-${stamp}`, capacity: 1 }),
    },
    201,
  );
  created.room = room.id;
  const otherRoom = await request(
    '/api/rooms',
    {
      method: 'POST',
      body: JSON.stringify({ dormId: dorm.id, roomNumber: `O-${stamp}`, capacity: 1 }),
    },
    201,
  );
  created.otherRoom = otherRoom.id;

  await request(
    '/api/users',
    {
      method: 'POST',
      body: JSON.stringify({
        email: `no-password-${stamp}@test.local`,
        fullName: 'Must Not Be Created',
        role: 'student',
      }),
    },
    400,
  );

  const legacy = await pool.query(
    `INSERT INTO users (email, role, full_name)
     VALUES ($1, 'commandant', $2) RETURNING id`,
    [`legacy-${stamp}@test.local`, 'Legacy Smoke Commandant'],
  );
  created.legacy = legacy.rows[0].id;
  const activatedLegacy = await request(`/api/users/${created.legacy}/activate`, {
    method: 'POST',
    body: JSON.stringify({ password: 'Smoke-password-1' }),
  });
  if (!activatedLegacy.firebaseUid) {
    throw new Error('Legacy profile activation did not attach a Firebase identity.');
  }
  await request(`/api/users/${created.legacy}`, { method: 'DELETE' }, 204);
  delete created.legacy;

  const student = await request(
    '/api/users',
    {
      method: 'POST',
      body: JSON.stringify({
        email: `student-${stamp}@test.local`,
        password: 'Smoke-password-1',
        fullName: 'Smoke Test Student',
        role: 'student',
      }),
    },
    201,
  );
  created.student = student.id;
  tokens.student = `test:${student.firebaseUid}|student-${stamp}@test.local`;

  const commandant = await request(
    '/api/users',
    {
      method: 'POST',
      body: JSON.stringify({
        email: `commandant-${stamp}@test.local`,
        password: 'Smoke-password-1',
        fullName: 'Smoke Test Commandant',
        role: 'commandant',
      }),
    },
    201,
  );
  created.commandant = commandant.id;
  tokens.commandant = `test:${commandant.firebaseUid}|commandant-${stamp}@test.local`;

  const maintenance = await request(
    '/api/users',
    {
      method: 'POST',
      body: JSON.stringify({
        email: `maintenance-${stamp}@test.local`,
        password: 'Smoke-password-1',
        fullName: 'Smoke Test Maintenance',
        role: 'maintenance_staff',
        maintenanceSpecialization: 'electrician',
      }),
    },
    201,
  );
  created.maintenance = maintenance.id;
  tokens.maintenance = `test:${maintenance.firebaseUid}|maintenance-${stamp}@test.local`;

  const unassignedDorms = await request('/api/dorms', { token: tokens.commandant });
  if (unassignedDorms.length !== 0) {
    throw new Error('An unassigned commandant unexpectedly sees dormitory data.');
  }
  await request(`/api/dorms/${dorm.id}/occupancy-layout`, { token: tokens.commandant }, 403);
  const commandantAssignment = await request(
    '/api/staff-dorm-assignments',
    {
      method: 'POST',
      body: JSON.stringify({ userId: commandant.id, dormId: dorm.id }),
    },
    201,
  );
  created.commandantAssignment = commandantAssignment.id;
  const maintenanceAssignment = await request(
    '/api/staff-dorm-assignments',
    {
      method: 'POST',
      body: JSON.stringify({ userId: maintenance.id, dormId: dorm.id }),
    },
    201,
  );
  created.maintenanceAssignment = maintenanceAssignment.id;
  const assignedDorms = await request('/api/dorms', { token: tokens.commandant });
  if (!assignedDorms.some((item) => String(item.id) === String(dorm.id))) {
    throw new Error('Assigned commandant cannot see the assigned dormitory.');
  }

  await request(
    '/api/rooms',
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({ dormId: dorm.id, roomNumber: 'FORBIDDEN', capacity: 1 }),
    },
    403,
  );
  await request('/api/users', { token: tokens.student }, 403);

  await request(
    '/api/services',
    {
      token: tokens.commandant,
      method: 'POST',
      body: JSON.stringify({ serviceType: `Smoke Service ${stamp}`, price: 100.5 }),
    },
    403,
  );
  const service = await request(
    '/api/services',
    {
      method: 'POST',
      body: JSON.stringify({ serviceType: `Smoke Service ${stamp}`, price: 100.5 }),
    },
    201,
  );
  created.service = service.id;
  await request(
    `/api/services/${service.id}`,
    {
      token: tokens.commandant,
      method: 'PATCH',
      body: JSON.stringify({ price: 101 }),
    },
    403,
  );
  await request(
    '/api/services',
    {
      method: 'POST',
      body: JSON.stringify({
        serviceType: `Invalid Internet ${stamp}`,
        serviceCode: 'INTERNET',
        billingFrequency: 'once',
        price: 100,
      }),
    },
    400,
  );

  const residence = await request(
    '/api/residences',
    {
      method: 'POST',
      body: JSON.stringify({
        userId: student.id,
        roomId: room.id,
        startDate: '2026-05-25',
        status: 'active',
      }),
    },
    201,
  );
  created.residence = residence.id;
  await request(
    '/api/residences',
    {
      token: tokens.commandant,
      method: 'POST',
      body: JSON.stringify({
        userId: commandant.id,
        roomId: room.id,
        startDate: '2026-05-25',
        status: 'active',
      }),
    },
    403,
  );
  const studentResidences = await request('/api/residences', { token: tokens.student });
  if (studentResidences.some((item) => String(item.userId) !== String(student.id))) {
    throw new Error('Student residence response contains another user record.');
  }
  const occupancyLayout = await request(`/api/dorms/${dorm.id}/occupancy-layout`, {
    token: tokens.commandant,
  });
  const occupancyRooms = occupancyLayout.floors.flatMap((floor) => [
    ...floor.rooms,
    ...floor.blocks.flatMap((block) => block.rooms),
  ]);
  const occupiedRoom = occupancyRooms.find((item) => String(item.id) === String(room.id));
  if (
    !occupiedRoom
    || occupiedRoom.occupied !== 1
    || occupiedRoom.availablePlaces !== 0
    || occupiedRoom.residents[0]?.fullName !== student.fullName
  ) {
    throw new Error('Scoped occupancy layout did not return the active resident and availability.');
  }

  await request('/api/disciplinary-records/rules', { token: tokens.student }, 403);
  const disciplinaryPolicy = await request('/api/disciplinary-records/policy', {
    token: tokens.student,
  });
  if (disciplinaryPolicy.maxActivePoints !== 35) {
    throw new Error('Disciplinary policy does not enforce the 35 point maximum.');
  }
  const disciplinaryRules = await request('/api/disciplinary-records/rules', {
    token: tokens.commandant,
  });
  const noiseRule = disciplinaryRules.find((rule) => rule.code === 'NOISE_AND_ORDER');
  if (!noiseRule || noiseRule.defaultPoints !== 5) {
    throw new Error('Seeded disciplinary rule directory is not available.');
  }
  const disciplinaryRecord = await request(
    '/api/disciplinary-records',
    {
      token: tokens.commandant,
      method: 'POST',
      body: JSON.stringify({
        residenceId: residence.id,
        violationRuleId: noiseRule.id,
        incidentDate: '2026-05-25',
        description: 'Тестове зафіксоване порушення.',
      }),
    },
    201,
  );
  created.disciplinaryRecord = disciplinaryRecord.id;
  if (disciplinaryRecord.penaltyPoints !== 5 || disciplinaryRecord.studentActivePoints !== 5) {
    throw new Error('Disciplinary rule points were not captured in the record total.');
  }
  const ownDiscipline = await request('/api/disciplinary-records', { token: tokens.student });
  if (
    !ownDiscipline.some(
      (item) =>
        String(item.id) === String(disciplinaryRecord.id)
        && item.penaltyPoints === 5
        && item.studentActivePoints === 5,
    )
  ) {
    throw new Error('Student cannot see their disciplinary record.');
  }
  const limitRule = await request(
    '/api/disciplinary-records/rules',
    {
      token: tokens.admin,
      method: 'POST',
      body: JSON.stringify({
        code: `LIMIT_TEST_${stamp}`,
        title: 'Smoke limit rule',
        recordType: 'violation',
        ruleReference: 'Smoke policy reference',
        defaultPoints: 35,
      }),
    },
    201,
  );
  created.disciplinaryRule = limitRule.id;
  await request(
    '/api/disciplinary-records',
    {
      token: tokens.commandant,
      method: 'POST',
      body: JSON.stringify({
        residenceId: residence.id,
        violationRuleId: limitRule.id,
        incidentDate: '2026-05-25',
        description: 'This record must be rejected because it exceeds the limit.',
      }),
    },
    409,
  );
  const notifications = await request('/api/notifications', { token: tokens.student });
  const disciplineNotification = notifications.find(
    (item) => item.relatedEntityType === 'disciplinary_record' &&
      String(item.relatedEntityId) === String(disciplinaryRecord.id),
  );
  if (!disciplineNotification) {
    throw new Error('Disciplinary record did not create a personal notification.');
  }
  await request(`/api/notifications/${disciplineNotification.id}/read`, {
    token: tokens.student,
    method: 'PATCH',
    body: JSON.stringify({}),
  });
  const disciplinaryEviction = await request(
    '/api/applications',
    {
      token: tokens.commandant,
      method: 'POST',
      body: JSON.stringify({
        userId: student.id,
        applicationType: 'eviction',
        description: 'Administrative disciplinary review',
      }),
    },
    201,
  );
  created.disciplinaryEviction = disciplinaryEviction.id;
  await request(`/api/applications/${disciplinaryEviction.id}`, {
    token: tokens.commandant,
    method: 'PATCH',
    body: JSON.stringify({
      status: 'in_review',
      resolutionNote: 'Disciplinary basis attached.',
      disciplinaryRecordIds: [disciplinaryRecord.id],
    }),
  });
  const updatedEviction = await request(`/api/applications/${disciplinaryEviction.id}`, {
    token: tokens.commandant,
  });
  if (
    !updatedEviction.disciplinaryBasis?.some(
      (basis) => String(basis.disciplinaryRecordId) === String(disciplinaryRecord.id),
    )
  ) {
    throw new Error('Eviction application did not retain its disciplinary ground.');
  }

  const repairApplication = await request(
    '/api/applications',
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({
        roomId: room.id,
        applicationType: 'repair',
        repairCategory: 'electrical',
        description: 'Smoke test repair request',
      }),
    },
    201,
  );
  created.repairApplication = repairApplication.id;
  if (String(repairApplication.userId) !== String(student.id)) {
    throw new Error('Student application was not linked to the authenticated student.');
  }
  const plumbingRepairApplication = await request(
    '/api/applications',
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({
        roomId: room.id,
        applicationType: 'repair',
        repairCategory: 'plumbing',
        description: 'Smoke plumbing request outside electrician specialization',
      }),
    },
    201,
  );
  created.plumbingRepairApplication = plumbingRepairApplication.id;
  const technicianRepairs = await request('/api/applications', { token: tokens.maintenance });
  if (
    !technicianRepairs.some((item) => String(item.id) === String(repairApplication.id))
    || technicianRepairs.some((item) => String(item.id) === String(plumbingRepairApplication.id))
  ) {
    throw new Error('Maintenance specialization did not filter repair categories.');
  }
  await request(
    `/api/applications/${plumbingRepairApplication.id}/comments`,
    { token: tokens.maintenance },
    403,
  );
  await request(
    `/api/applications/${repairApplication.id}/comments`,
    {
      token: tokens.maintenance,
      method: 'POST',
      body: JSON.stringify({ message: 'Need a replacement socket.', visibility: 'public' }),
    },
    201,
  );
  await request(
    `/api/applications/${repairApplication.id}/comments`,
    {
      token: tokens.maintenance,
      method: 'POST',
      body: JSON.stringify({ message: 'Purchase request prepared.', visibility: 'staff' }),
    },
    201,
  );
  const publicRepairComments = await request(`/api/applications/${repairApplication.id}/comments`, {
    token: tokens.student,
  });
  if (publicRepairComments.length !== 1 || publicRepairComments[0].visibility !== 'public') {
    throw new Error('Student repair thread exposed a staff-only comment.');
  }
  await request(
    `/api/applications/${repairApplication.id}/comments`,
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({ message: 'I can be in the room after classes.' }),
    },
    201,
  );
  await request(
    '/api/applications',
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({
        roomId: otherRoom.id,
        applicationType: 'repair',
        repairCategory: 'general',
        description: 'Must not be accepted for another room',
      }),
    },
    403,
  );
  await request(
    '/api/applications',
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({ applicationType: 'relocation', description: 'Must be rejected' }),
    },
    403,
  );

  await request(
    '/api/applications',
    {
      token: tokens.registered,
      method: 'POST',
      body: JSON.stringify({
        roomId: otherRoom.id,
        applicationType: 'settlement',
      }),
    },
    400,
  );
  const settlementApplication = await request(
    '/api/applications',
    {
      token: tokens.registered,
      method: 'POST',
      body: JSON.stringify({
        applicationType: 'settlement',
      }),
    },
    201,
  );
  created.settlementApplication = settlementApplication.id;
  await request(`/api/applications/${settlementApplication.id}`, { token: tokens.maintenance }, 404);
  await request(`/api/applications/${settlementApplication.id}/managed-dorm`, {
    method: 'PATCH',
    body: JSON.stringify({ managedDormId: dorm.id }),
  });
  await request(
    `/api/applications/${settlementApplication.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) },
    409,
  );
  await request(`/api/applications/${settlementApplication.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'approved',
      assignedRoomId: otherRoom.id,
    }),
  });
  const approvedRooms = await request('/api/rooms', { token: tokens.registered });
  const approvedDorms = await request('/api/dorms', { token: tokens.registered });
  const beforeCompletion = await request('/api/residences', { token: tokens.registered });
  if (
    !approvedRooms.some((item) => String(item.id) === String(otherRoom.id))
    || !approvedDorms.some((item) => String(item.id) === String(dorm.id))
    || beforeCompletion.some((item) => item.status === 'active')
  ) {
    throw new Error('Approved settlement did not expose its assigned place without prematurely creating residence.');
  }
  await request(`/api/applications/${settlementApplication.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'completed',
      eligibilityVerified: true,
      documentsVerified: true,
      paymentVerified: true,
      medicalClearanceVerified: true,
      safetyBriefingCompleted: true,
      passIssued: true,
    }),
  });
  const registeredResidences = await request('/api/residences', { token: tokens.registered });
  const registeredResidence = registeredResidences.find((item) => item.status === 'active');
  if (!registeredResidence || String(registeredResidence.roomId) !== String(otherRoom.id)) {
    throw new Error('Completed settlement application did not create an assigned residence.');
  }
  created.registeredResidence = registeredResidence.id;
  const renewalApplication = await request(
    '/api/applications',
    {
      token: tokens.registered,
      method: 'POST',
      body: JSON.stringify({ applicationType: 'renewal' }),
    },
    201,
  );
  created.renewalApplication = renewalApplication.id;
  await request(`/api/applications/${renewalApplication.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'completed',
      eligibilityVerified: true,
      paymentVerified: true,
    }),
  });
  const relocationApplication = await request(
    '/api/applications',
    {
      token: tokens.commandant,
      method: 'POST',
      body: JSON.stringify({
        userId: registered.id,
        applicationType: 'relocation',
        description: 'Administrative smoke relocation',
      }),
    },
    201,
  );
  created.relocationApplication = relocationApplication.id;
  await request(`/api/applications/${relocationApplication.id}`, {
    token: tokens.commandant,
    method: 'PATCH',
    body: JSON.stringify({
      status: 'completed',
      assignedRoomId: secondFloorRooms[0].id,
      housingConditionsConfirmed: true,
    }),
  });
  const relocatedResidences = await request('/api/residences', { token: tokens.registered });
  const relocatedResidence = relocatedResidences.find((item) => item.status === 'active');
  if (!relocatedResidence || String(relocatedResidence.roomId) !== String(secondFloorRooms[0].id)) {
    throw new Error('Completed relocation did not switch the active residence room.');
  }
  created.relocatedResidence = relocatedResidence.id;
  const evictionApplication = await request(
    '/api/applications',
    {
      token: tokens.registered,
      method: 'POST',
      body: JSON.stringify({ applicationType: 'eviction', description: 'Voluntary departure' }),
    },
    201,
  );
  created.evictionApplication = evictionApplication.id;
  await request(`/api/applications/${evictionApplication.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed', resolutionNote: 'Voluntary departure recorded.' }),
  });
  const afterEviction = await request('/api/residences', { token: tokens.registered });
  if (afterEviction.some((item) => item.status === 'active')) {
    throw new Error('Completed eviction did not archive the active residence.');
  }
  await request(`/api/applications/${repairApplication.id}`, {
    token: tokens.maintenance,
    method: 'PATCH',
    body: JSON.stringify({ status: 'waiting_materials', resolutionNote: 'Replacement socket requested.' }),
  });
  await request(`/api/applications/${repairApplication.id}`, {
    token: tokens.maintenance,
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed', resolutionNote: 'Fixed during smoke test.' }),
  });

  const transaction = await request(
    '/api/transactions',
    {
      token: tokens.commandant,
      method: 'POST',
      body: JSON.stringify({ userId: student.id, serviceId: service.id, amount: 100.5 }),
    },
    201,
  );
  created.transaction = transaction.id;
  await request(`/api/transactions/${transaction.id}`, {
    token: tokens.commandant,
    method: 'PATCH',
    body: JSON.stringify({ paymentStatus: 'succeeded', paidAt: new Date().toISOString() }),
  });
  const ownTransactions = await request('/api/transactions', { token: tokens.student });
  if (ownTransactions.some((item) => String(item.userId) !== String(student.id))) {
    throw new Error('Student transaction response contains another user record.');
  }

  let internetService = (await request('/api/services', { token: tokens.commandant })).find(
    (item) => item.serviceCode === 'INTERNET',
  );
  if (!internetService) {
    internetService = await request(
      '/api/services',
      {
        method: 'POST',
        body: JSON.stringify({
          serviceType: `Internet ${stamp}`,
          serviceCode: 'INTERNET',
          billingFrequency: 'monthly',
          price: 125,
        }),
      },
      201,
    );
    created.internetService = internetService.id;
  }
  const today = (await pool.query('SELECT CURRENT_DATE::text AS date')).rows[0].date;
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastDay = new Date(`${monthStart}T00:00:00.000Z`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  const monthEnd = lastDay.toISOString().slice(0, 10);
  let accommodationService = (await request('/api/services')).find(
    (item) => item.serviceCode === 'ACCOMMODATION',
  );
  if (!accommodationService) {
    accommodationService = await request(
      '/api/services',
      {
        method: 'POST',
        body: JSON.stringify({
          serviceType: `Accommodation ${stamp}`,
          serviceCode: 'ACCOMMODATION',
          billingFrequency: 'semester',
          price: 1250,
        }),
      },
      201,
    );
    created.accommodationService = accommodationService.id;
  }
  const billingPeriod = await request(
    '/api/charges/billing-periods',
    {
      method: 'POST',
      body: JSON.stringify({
        serviceId: accommodationService.id,
        name: `Smoke semester ${stamp}`,
        periodStart: monthStart,
        periodEnd: monthEnd,
        chargeDate: monthStart,
        dueDate: today,
      }),
    },
    201,
  );
  created.billingPeriod = billingPeriod.id;
  await request(`/api/room-internet/${room.id}`, {
    token: tokens.commandant,
    method: 'PUT',
    body: JSON.stringify({
      serviceId: internetService.id,
      status: 'suspended',
      activatedAt: '2026-05-01',
      suspendedAt: today,
    }),
  });
  created.internetSubscriptionRoom = room.id;
  const scheduledResult = await request('/api/charges/run-scheduled', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (scheduledResult.accommodationCreatedCount < 1 || scheduledResult.internetCreatedCount < 1) {
    throw new Error('Scheduled billing did not create accommodation and internet charges.');
  }
  const accommodationCharge = (await request('/api/charges')).find(
    (charge) =>
      String(charge.serviceId) === String(accommodationService.id)
      && String(charge.residenceId) === String(residence.id),
  );
  if (!accommodationCharge) {
    throw new Error('Scheduled semester billing did not create an active residence charge.');
  }
  created.accommodationCharge = accommodationCharge.id;
  const roomInternetCharge = (await request('/api/charges')).find(
    (charge) => String(charge.roomId) === String(room.id),
  );
  if (!roomInternetCharge) {
    throw new Error('Internet billing did not create a room charge.');
  }
  created.internetCharge = roomInternetCharge.id;
  await pool.query('UPDATE billing_charge SET due_date = $1 WHERE id = $2', [
    today,
    roomInternetCharge.id,
  ]);
  await request('/api/notifications/generate-reminders', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  await request('/api/notifications/generate-reminders', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const reminderNotifications = (await request('/api/notifications', { token: tokens.student })).filter(
    (notification) =>
      notification.relatedEntityType === 'billing_charge' &&
      String(notification.relatedEntityId) === String(roomInternetCharge.id),
  );
  if (reminderNotifications.length !== 1) {
    throw new Error('Payment reminder generation is not idempotent for one charge.');
  }
  const internetPayment = await request(
    '/api/transactions/simulate',
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({ chargeId: roomInternetCharge.id }),
    },
    201,
  );
  created.internetPayment = internetPayment.id;
  await request(
    `/api/transactions/${internetPayment.id}/complete-simulation`,
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({ result: 'succeeded' }),
    },
  );
  const internetStatus = await request(`/api/room-internet/${room.id}`, { token: tokens.student });
  if (internetStatus.internetStatus !== 'active_paid') {
    throw new Error('Paid room internet charge did not produce active_paid status.');
  }

  const simulatedSuccess = await request(
    '/api/transactions/simulate',
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({ serviceId: service.id, amount: 1 }),
    },
    201,
  );
  created.simulatedSuccess = simulatedSuccess.id;
  if (
    String(simulatedSuccess.userId) !== String(student.id) ||
    simulatedSuccess.amount !== service.price ||
    simulatedSuccess.paymentStatus !== 'pending'
  ) {
    throw new Error('Simulated payment did not use authenticated student and service tariff.');
  }
  const paidSimulation = await request(
    `/api/transactions/${simulatedSuccess.id}/complete-simulation`,
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({ result: 'succeeded' }),
    },
  );
  if (paidSimulation.paymentStatus !== 'succeeded' || !paidSimulation.paidAt) {
    throw new Error('Successful simulation was not recorded as paid.');
  }
  await request(
    `/api/transactions/${simulatedSuccess.id}/complete-simulation`,
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({ result: 'failed' }),
    },
    409,
  );

  const simulatedFailure = await request(
    '/api/transactions/simulate',
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({ serviceId: service.id }),
    },
    201,
  );
  created.simulatedFailure = simulatedFailure.id;
  const failedSimulation = await request(
    `/api/transactions/${simulatedFailure.id}/complete-simulation`,
    {
      token: tokens.student,
      method: 'POST',
      body: JSON.stringify({ result: 'failed' }),
    },
  );
  if (failedSimulation.paymentStatus !== 'failed' || failedSimulation.paidAt !== null) {
    throw new Error('Failed simulation was not recorded correctly.');
  }
  await request(
    '/api/transactions/simulate',
    {
      token: tokens.commandant,
      method: 'POST',
      body: JSON.stringify({ serviceId: service.id }),
    },
    403,
  );

  await request(`/api/transactions/${simulatedSuccess.id}`, { method: 'DELETE' }, 204);
  delete created.simulatedSuccess;
  await request(`/api/transactions/${simulatedFailure.id}`, { method: 'DELETE' }, 204);
  delete created.simulatedFailure;
  await request(`/api/transactions/${transaction.id}`, { method: 'DELETE' }, 204);
  delete created.transaction;
  await request(`/api/transactions/${internetPayment.id}`, { method: 'DELETE' }, 204);
  delete created.internetPayment;
  await pool.query('DELETE FROM billing_charge WHERE id = $1', [created.internetCharge]);
  delete created.internetCharge;
  await pool.query('DELETE FROM billing_charge WHERE id = $1', [created.accommodationCharge]);
  delete created.accommodationCharge;
  await pool.query('DELETE FROM accommodation_billing_period WHERE id = $1', [created.billingPeriod]);
  delete created.billingPeriod;
  await request(`/api/applications/${disciplinaryEviction.id}`, { method: 'DELETE' }, 204);
  delete created.disciplinaryEviction;
  await pool.query('DELETE FROM disciplinary_record WHERE id = $1', [created.disciplinaryRecord]);
  delete created.disciplinaryRecord;
  await pool.query('DELETE FROM violation_rule WHERE id = $1', [created.disciplinaryRule]);
  delete created.disciplinaryRule;
  await request(`/api/applications/${repairApplication.id}`, { method: 'DELETE' }, 204);
  delete created.repairApplication;
  await request(`/api/applications/${plumbingRepairApplication.id}`, { method: 'DELETE' }, 204);
  delete created.plumbingRepairApplication;
  await request(`/api/applications/${settlementApplication.id}`, { method: 'DELETE' }, 204);
  delete created.settlementApplication;
  await request(`/api/applications/${renewalApplication.id}`, { method: 'DELETE' }, 204);
  delete created.renewalApplication;
  await request(`/api/applications/${relocationApplication.id}`, { method: 'DELETE' }, 204);
  delete created.relocationApplication;
  await request(`/api/applications/${evictionApplication.id}`, { method: 'DELETE' }, 204);
  delete created.evictionApplication;
  await request(`/api/residences/${residence.id}`, { method: 'DELETE' }, 204);
  delete created.residence;
  await request(`/api/residences/${registeredResidence.id}`, { method: 'DELETE' }, 204);
  delete created.registeredResidence;
  await request(`/api/residences/${relocatedResidence.id}`, { method: 'DELETE' }, 204);
  delete created.relocatedResidence;
  await request(`/api/services/${service.id}`, { method: 'DELETE' }, 204);
  delete created.service;
  if (created.internetService) {
    await pool.query(
      `UPDATE room
       SET internet_service_id = NULL,
           internet_status = 'inactive',
           internet_activated_at = NULL,
           internet_suspended_at = NULL,
           internet_updated_by = NULL
       WHERE id = $1`,
      [room.id],
    );
    await request(`/api/services/${created.internetService}`, { method: 'DELETE' }, 204);
    delete created.internetService;
  }
  if (created.accommodationService) {
    await request(`/api/services/${created.accommodationService}`, { method: 'DELETE' }, 204);
    delete created.accommodationService;
  }
  await request(`/api/users/${student.id}`, { method: 'DELETE' }, 204);
  delete created.student;
  await request(`/api/users/${commandant.id}`, { method: 'DELETE' }, 204);
  delete created.commandant;
  await request(`/api/users/${maintenance.id}`, { method: 'DELETE' }, 204);
  delete created.maintenance;
  await request(`/api/users/${registered.id}`, { method: 'DELETE' }, 204);
  delete created.registered;
  await request(`/api/rooms/${room.id}`, { method: 'DELETE' }, 204);
  delete created.room;
  await request(`/api/rooms/${otherRoom.id}`, { method: 'DELETE' }, 204);
  delete created.otherRoom;
  await request(`/api/dorms/${dorm.id}`, { method: 'DELETE' }, 204);
  delete created.dorm;
  await request(`/api/dorms/${plainDorm.id}`, { method: 'DELETE' }, 204);
  delete created.plainDorm;

  console.log('Auth/RBAC smoke test passed: accounts, layouts, residence workflow, permissions, CRUD, and cleanup.');
} finally {
  if (created.internetSubscriptionRoom) {
    await pool.query(
      `UPDATE room
       SET internet_service_id = NULL,
           internet_status = 'inactive',
           internet_activated_at = NULL,
           internet_suspended_at = NULL,
           internet_updated_by = NULL
       WHERE id = $1`,
      [created.internetSubscriptionRoom],
    );
  }
  const cleanup = [
    ['transactions', created.internetPayment],
    ['transactions', created.simulatedSuccess],
    ['transactions', created.simulatedFailure],
    ['transactions', created.transaction],
    ['billing_charge', created.internetCharge],
    ['billing_charge', created.accommodationCharge],
    ['application', created.repairApplication],
    ['application', created.plumbingRepairApplication],
    ['application', created.disciplinaryEviction],
    ['application', created.settlementApplication],
    ['application', created.renewalApplication],
    ['application', created.relocationApplication],
    ['application', created.evictionApplication],
    ['disciplinary_record', created.disciplinaryRecord],
    ['violation_rule', created.disciplinaryRule],
    ['residence', created.residence],
    ['residence', created.registeredResidence],
    ['residence', created.relocatedResidence],
    ['service', created.service],
    ['service', created.internetService],
    ['service', created.accommodationService],
    ['users', created.student],
    ['users', created.commandant],
    ['users', created.maintenance],
    ['users', created.legacy],
    ['users', created.registered],
    ['room', created.room],
    ['room', created.otherRoom],
    ['dorm', created.dorm],
    ['dorm', created.plainDorm],
    ['users', created.admin],
  ];
  if (created.billingPeriod) {
    await pool.query('DELETE FROM accommodation_billing_period WHERE id = $1', [created.billingPeriod]);
  }

  for (const [table, recordId] of cleanup) {
    if (recordId) {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [recordId]);
    }
  }

  await new Promise((resolve) => server.close(resolve));
  await closeDatabaseConnection();
}
