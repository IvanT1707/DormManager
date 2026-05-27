import swaggerUi from 'swagger-ui-express';
import { env } from './env.js';

const id = { type: 'string', example: '1' };
const timestamps = {
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
};
const roles = ['student', 'commandant', 'maintenance_staff', 'administrator'];
const residenceStatuses = ['active', 'archived'];
const applicationTypes = ['settlement', 'renewal', 'repair', 'eviction', 'relocation'];
const applicationStatuses = [
  'pending',
  'in_review',
  'waiting_materials',
  'approved',
  'rejected',
  'completed',
  'cancelled',
];
const paymentStatuses = ['pending', 'succeeded', 'failed', 'refunded'];
const billingFrequencies = ['once', 'monthly', 'semester'];
const chargeStatuses = ['pending', 'paid', 'cancelled', 'overdue', 'waived'];
const maintenanceSpecializations = ['general', 'electrician', 'plumber'];
const repairCategories = ['general', 'electrical', 'plumbing'];

function schemaRef(name) {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonResponse(schema, description) {
  return {
    description,
    content: { 'application/json': { schema } },
  };
}

function jsonBody(schemaName) {
  return {
    required: true,
    content: { 'application/json': { schema: schemaRef(schemaName) } },
  };
}

function errorResponses() {
  return {
    400: jsonResponse(schemaRef('Error'), 'Invalid request data.'),
    401: jsonResponse(schemaRef('Error'), 'Firebase ID token is missing or invalid.'),
    403: jsonResponse(schemaRef('Error'), 'The authenticated profile does not have access.'),
    404: jsonResponse(schemaRef('Error'), 'Record not found.'),
    409: jsonResponse(schemaRef('Error'), 'Operation conflicts with existing data.'),
  };
}

function crudPaths({ path, tag, schema, createSchema, updateSchema, queryParameters = [] }) {
  return {
    [path]: {
      get: {
        tags: [tag],
        summary: `List ${tag.toLowerCase()}`,
        parameters: queryParameters,
        responses: {
          200: jsonResponse({ type: 'array', items: schemaRef(schema) }, 'Records returned.'),
          400: jsonResponse(schemaRef('Error'), 'Invalid filter.'),
        },
      },
      post: {
        tags: [tag],
        summary: `Create a ${schema.toLowerCase()}`,
        requestBody: jsonBody(createSchema),
        responses: {
          201: jsonResponse(schemaRef(schema), 'Record created.'),
          ...errorResponses(),
        },
      },
    },
    [`${path}/{id}`]: {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      get: {
        tags: [tag],
        summary: `Get a ${schema.toLowerCase()}`,
        responses: {
          200: jsonResponse(schemaRef(schema), 'Record returned.'),
          ...errorResponses(),
        },
      },
      patch: {
        tags: [tag],
        summary: `Update a ${schema.toLowerCase()}`,
        requestBody: jsonBody(updateSchema),
        responses: {
          200: jsonResponse(schemaRef(schema), 'Record updated.'),
          ...errorResponses(),
        },
      },
      delete: {
        tags: [tag],
        summary: `Delete a ${schema.toLowerCase()}`,
        responses: {
          204: { description: 'Record deleted.' },
          ...errorResponses(),
        },
      },
    },
  };
}

const crudDocumentation = {
  ...crudPaths({
    path: '/api/dorms',
    tag: 'Dorms',
    schema: 'Dorm',
    createSchema: 'DormCreate',
    updateSchema: 'DormUpdate',
  }),
  ...crudPaths({
    path: '/api/rooms',
    tag: 'Rooms',
    schema: 'Room',
    createSchema: 'RoomCreate',
    updateSchema: 'RoomUpdate',
    queryParameters: [
      { in: 'query', name: 'dormId', schema: id, description: 'Filter rooms by dorm.' },
    ],
  }),
  ...crudPaths({
    path: '/api/users',
    tag: 'Users',
    schema: 'User',
    createSchema: 'UserCreate',
    updateSchema: 'UserUpdate',
    queryParameters: [
      { in: 'query', name: 'role', schema: { type: 'string', enum: roles } },
    ],
  }),
  ...crudPaths({
    path: '/api/services',
    tag: 'Services',
    schema: 'Service',
    createSchema: 'ServiceCreate',
    updateSchema: 'ServiceUpdate',
  }),
  ...crudPaths({
    path: '/api/residences',
    tag: 'Residences',
    schema: 'Residence',
    createSchema: 'ResidenceCreate',
    updateSchema: 'ResidenceUpdate',
    queryParameters: [
      { in: 'query', name: 'userId', schema: id },
      { in: 'query', name: 'roomId', schema: id },
      { in: 'query', name: 'status', schema: { type: 'string', enum: residenceStatuses } },
    ],
  }),
  ...crudPaths({
    path: '/api/applications',
    tag: 'Applications',
    schema: 'Application',
    createSchema: 'ApplicationCreate',
    updateSchema: 'ApplicationUpdate',
    queryParameters: [
      { in: 'query', name: 'userId', schema: id },
      { in: 'query', name: 'status', schema: { type: 'string', enum: applicationStatuses } },
      { in: 'query', name: 'applicationType', schema: { type: 'string', enum: applicationTypes } },
    ],
  }),
  ...crudPaths({
    path: '/api/transactions',
    tag: 'Transactions',
    schema: 'Transaction',
    createSchema: 'TransactionCreate',
    updateSchema: 'TransactionUpdate',
    queryParameters: [
      { in: 'query', name: 'userId', schema: id },
      { in: 'query', name: 'paymentStatus', schema: { type: 'string', enum: paymentStatuses } },
    ],
  }),
};

const dormFields = {
  dormNumber: { type: 'string', example: '11', maxLength: 20 },
  address: { type: 'string', example: '15 University Street', maxLength: 255 },
  totalFloors: { type: 'integer', minimum: 1, nullable: true, example: 9 },
  residentialFloorFrom: { type: 'integer', minimum: 1, nullable: true, example: 2 },
  hasBlocks: { type: 'boolean', default: true, example: true },
  blocksPerFloor: { type: 'integer', minimum: 1, nullable: true, example: 19 },
  roomsPerBlock: { type: 'integer', minimum: 1, nullable: true, example: 2 },
  roomsPerFloor: { type: 'integer', minimum: 1, nullable: true, example: 38 },
  defaultRoomCapacity: { type: 'integer', minimum: 1, nullable: true, example: 4 },
};
const roomFields = {
  dormId: id,
  roomNumber: { type: 'string', example: '201а', maxLength: 20 },
  capacity: { type: 'integer', minimum: 1, example: 4 },
  floorNumber: { type: 'integer', minimum: 1, nullable: true, example: 2 },
  blockNumber: { type: 'integer', minimum: 1, nullable: true, example: 2 },
  roomInBlock: { type: 'integer', minimum: 1, nullable: true, example: 2 },
};
const userFields = {
  firebaseUid: { type: 'string', nullable: true, maxLength: 128 },
  email: { type: 'string', format: 'email' },
  role: { type: 'string', enum: roles },
  fullName: { type: 'string', example: 'Ivan Tsekot' },
  faculty: { type: 'string', nullable: true },
  specialty: { type: 'string', nullable: true },
  maintenanceSpecialization: { type: 'string', enum: maintenanceSpecializations, nullable: true },
};
const serviceFields = {
  serviceType: { type: 'string', example: 'Accommodation fee' },
  serviceCode: { type: 'string', nullable: true, example: 'ACCOMMODATION' },
  billingFrequency: { type: 'string', enum: billingFrequencies },
  paymentDueDay: { type: 'integer', minimum: 1, maximum: 28, default: 10, example: 10 },
  active: { type: 'boolean', default: true },
  price: { type: 'number', format: 'double', minimum: 0, example: 1250.0 },
};
const residenceFields = {
  userId: id,
  roomId: id,
  startDate: { type: 'string', format: 'date' },
  endDate: { type: 'string', format: 'date', nullable: true },
  status: { type: 'string', enum: residenceStatuses },
};
const applicationFields = {
  userId: id,
  roomId: {
    ...id,
    nullable: true,
    description: 'Current or affected room. It is not selected by a student requesting settlement.',
  },
  assignedRoomId: {
    ...id,
    nullable: true,
    description: 'Room assigned by dormitory administration for settlement or relocation.',
  },
  managedDormId: {
    ...id,
    nullable: true,
    description: 'Dormitory routed by an administrator for scoped processing.',
  },
  applicationType: { type: 'string', enum: applicationTypes },
  repairCategory: { type: 'string', enum: repairCategories, nullable: true },
  status: { type: 'string', enum: applicationStatuses },
  description: { type: 'string', nullable: true },
  resolutionNote: { type: 'string', nullable: true },
  eligibilityVerified: { type: 'boolean', default: false },
  documentsVerified: { type: 'boolean', default: false },
  paymentVerified: { type: 'boolean', default: false },
  medicalClearanceVerified: { type: 'boolean', default: false },
  safetyBriefingCompleted: { type: 'boolean', default: false },
  passIssued: { type: 'boolean', default: false },
  housingConditionsConfirmed: { type: 'boolean', default: false },
  processedBy: { ...id, nullable: true, readOnly: true },
  processedAt: { type: 'string', format: 'date-time', nullable: true, readOnly: true },
};
const transactionFields = {
  userId: id,
  serviceId: id,
  chargeId: { ...id, nullable: true },
  amount: { type: 'number', format: 'double', minimum: 0, example: 1250.0 },
  paymentStatus: { type: 'string', enum: paymentStatuses },
  paidAt: { type: 'string', format: 'date-time', nullable: true },
};

export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'DormManager API',
    version: '0.6.0',
    description:
      'REST API for dormitory residence, automatic monthly/semester charges, applications, services, and simulated course-project payments. Protected operations require a Firebase ID token and a linked DormManager role profile.',
  },
  servers: [{ url: env.apiBaseUrl, description: 'Configured API server' }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'System', description: 'Service availability checks' },
    { name: 'Authentication', description: 'Firebase-linked user profile operations' },
    { name: 'Dorms' },
    { name: 'Rooms' },
    { name: 'Users' },
    { name: 'Services' },
    { name: 'Residences' },
    { name: 'Applications' },
    { name: 'Transactions' },
    { name: 'Charges' },
    { name: 'Notifications' },
    { name: 'Internet' },
    { name: 'Discipline' },
    { name: 'Staff assignments' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['System'],
        summary: 'Check whether the API is running',
        security: [],
        responses: { 200: jsonResponse(schemaRef('ApiHealth'), 'API is running.') },
      },
    },
    '/api/health/database': {
      get: {
        tags: ['System'],
        summary: 'Check the PostgreSQL connection',
        security: [],
        responses: {
          200: jsonResponse(schemaRef('DatabaseHealth'), 'Database connection is available.'),
          503: jsonResponse(schemaRef('Error'), 'Database connection is not available.'),
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Read the authenticated Firebase identity and linked profile',
        responses: {
          200: jsonResponse(schemaRef('AuthSession'), 'Firebase identity resolved.'),
          401: jsonResponse(schemaRef('Error'), 'Firebase ID token is missing or invalid.'),
        },
      },
      patch: {
        tags: ['Authentication'],
        summary: 'Update the authenticated user profile',
        requestBody: jsonBody('ProfileUpdate'),
        responses: {
          200: jsonResponse(schemaRef('User'), 'Profile updated.'),
          ...errorResponses(),
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Create or link a student profile for the authenticated Firebase account',
        description:
          'Self-registration always produces a student profile. Staff and administrator Firebase accounts are linked by an administrator.',
        requestBody: jsonBody('StudentRegistration'),
        responses: {
          201: jsonResponse(schemaRef('User'), 'Student profile registered.'),
          ...errorResponses(),
        },
      },
    },
    '/api/dorms/{id}/generate-rooms': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      post: {
        tags: ['Dorms'],
        summary: 'Generate rooms from a dorm layout',
        description:
          'Creates rooms by residential floor, block, and room-in-block. Existing matching rooms are kept.',
        requestBody: jsonBody('DormRoomGeneration'),
        responses: {
          201: jsonResponse(schemaRef('DormRoomGenerationResult'), 'Dorm rooms generated.'),
          ...errorResponses(),
        },
      },
    },
    '/api/dorms/{id}/occupancy-layout': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      get: {
        tags: ['Dorms'],
        summary: 'Read a scoped occupancy map of a dormitory',
        description:
          'Returns floors, blocks, rooms, available places, and active residents for an administrator or a commandant assigned to this dormitory.',
        responses: {
          200: jsonResponse(schemaRef('DormOccupancyLayout'), 'Occupancy layout returned.'),
          ...errorResponses(),
        },
      },
    },
    '/api/users/{id}/activate': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      post: {
        tags: ['Users'],
        summary: 'Create authentication access for a legacy unlinked profile',
        requestBody: jsonBody('UserActivation'),
        responses: {
          200: jsonResponse(schemaRef('User'), 'User authentication access activated.'),
          ...errorResponses(),
        },
      },
    },
    '/api/transactions/simulate': {
      post: {
        tags: ['Transactions'],
        summary: 'Create a simulated student payment',
        description:
          'Creates a pending payment for the authenticated student. The amount is copied from the selected service tariff; no real funds or external provider are involved.',
        requestBody: jsonBody('SimulatedPaymentCreate'),
        responses: {
          201: jsonResponse(schemaRef('Transaction'), 'Pending simulated payment created.'),
          ...errorResponses(),
        },
      },
    },
    '/api/transactions/{id}/complete-simulation': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      post: {
        tags: ['Transactions'],
        summary: 'Complete a simulated student payment',
        description:
          'Records a successful or failed outcome for the authenticated student own pending simulated payment.',
        requestBody: jsonBody('SimulatedPaymentCompletion'),
        responses: {
          200: jsonResponse(schemaRef('Transaction'), 'Simulated result recorded.'),
          ...errorResponses(),
        },
      },
    },
    '/api/charges': {
      get: {
        tags: ['Charges'],
        summary: 'List charges visible to the authenticated role',
        responses: { 200: jsonResponse({ type: 'array', items: schemaRef('Charge') }, 'Charges returned.') },
      },
    },
    '/api/charges/generate': {
      post: {
        tags: ['Charges'],
        summary: 'Generate period charges manually for an administrative correction',
        requestBody: jsonBody('ChargeGeneration'),
        responses: { 201: jsonResponse({ type: 'object' }, 'Charges generated.'), ...errorResponses() },
      },
    },
    '/api/charges/billing-periods': {
      get: {
        tags: ['Charges'],
        summary: 'List configured accommodation semester periods',
        responses: {
          200: jsonResponse({ type: 'array', items: schemaRef('BillingPeriod') }, 'Billing periods returned.'),
        },
      },
      post: {
        tags: ['Charges'],
        summary: 'Schedule an accommodation semester charging period',
        requestBody: jsonBody('BillingPeriodCreate'),
        responses: { 201: jsonResponse(schemaRef('BillingPeriod'), 'Billing period created.'), ...errorResponses() },
      },
    },
    '/api/charges/billing-periods/{id}': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      patch: {
        tags: ['Charges'],
        summary: 'Update or archive an accommodation semester period',
        requestBody: jsonBody('BillingPeriodUpdate'),
        responses: { 200: jsonResponse(schemaRef('BillingPeriod'), 'Billing period updated.'), ...errorResponses() },
      },
    },
    '/api/charges/run-scheduled': {
      post: {
        tags: ['Charges'],
        summary: 'Synchronize automatic monthly and semester charges now',
        responses: { 200: jsonResponse(schemaRef('AutomaticBillingResult'), 'Automatic billing completed.'), ...errorResponses() },
      },
    },
    '/api/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Read personal notification history',
        responses: { 200: jsonResponse({ type: 'array', items: schemaRef('Notification') }, 'Messages returned.') },
      },
    },
    '/api/notifications/unread-count': {
      get: {
        tags: ['Notifications'],
        summary: 'Count unread personal notifications',
        responses: { 200: jsonResponse({ type: 'object' }, 'Unread count returned.') },
      },
    },
    '/api/notifications/stream': {
      get: {
        tags: ['Notifications'],
        summary: 'Receive personal notification events using SSE',
        responses: { 200: { description: 'Server-Sent Events stream.' } },
      },
    },
    '/api/notifications/{id}/read': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      patch: {
        tags: ['Notifications'],
        summary: 'Mark a personal notification as read',
        responses: { 200: jsonResponse(schemaRef('Notification'), 'Message updated.'), ...errorResponses() },
      },
    },
    '/api/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark all personal notifications as read',
        responses: { 200: jsonResponse({ type: 'object' }, 'Messages updated.') },
      },
    },
    '/api/notifications/generate-reminders': {
      post: {
        tags: ['Notifications'],
        summary: 'Run the payment reminder scan now',
        responses: { 200: jsonResponse({ type: 'object' }, 'Scan completed.'), ...errorResponses() },
      },
    },
    '/api/room-internet': {
      get: {
        tags: ['Internet'],
        summary: 'List calculated room internet statuses in accessible dormitories',
        responses: { 200: jsonResponse({ type: 'array', items: schemaRef('RoomInternet') }, 'Statuses returned.') },
      },
    },
    '/api/room-internet/{id}': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      get: {
        tags: ['Internet'],
        summary: 'Read calculated internet status for a room',
        responses: { 200: jsonResponse(schemaRef('RoomInternet'), 'Status returned.'), ...errorResponses() },
      },
      put: {
        tags: ['Internet'],
        summary: 'Configure internet subscription for a room; payment reactivates suspended service',
        requestBody: jsonBody('RoomInternetUpdate'),
        responses: { 200: jsonResponse(schemaRef('RoomInternet'), 'Subscription updated.'), ...errorResponses() },
      },
    },
    '/api/disciplinary-records/rules': {
      get: {
        tags: ['Discipline'],
        summary: 'List configured disciplinary rules visible to management',
        responses: { 200: jsonResponse({ type: 'array', items: schemaRef('ViolationRule') }, 'Rules returned.') },
      },
      post: {
        tags: ['Discipline'],
        summary: 'Create a disciplinary rule (administrator only)',
        requestBody: jsonBody('ViolationRuleCreate'),
        responses: { 201: jsonResponse(schemaRef('ViolationRule'), 'Rule created.'), ...errorResponses() },
      },
    },
    '/api/disciplinary-records/rules/{id}': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      patch: {
        tags: ['Discipline'],
        summary: 'Update or archive a disciplinary rule (administrator only)',
        requestBody: jsonBody('ViolationRuleUpdate'),
        responses: { 200: jsonResponse(schemaRef('ViolationRule'), 'Rule updated.'), ...errorResponses() },
      },
    },
    '/api/disciplinary-records/policy': {
      get: {
        tags: ['Discipline'],
        summary: 'Read active disciplinary point thresholds',
        responses: { 200: jsonResponse(schemaRef('DisciplinaryPolicy'), 'Policy returned.') },
      },
      patch: {
        tags: ['Discipline'],
        summary: 'Update active disciplinary point thresholds (administrator only)',
        requestBody: jsonBody('DisciplinaryPolicyUpdate'),
        responses: { 200: jsonResponse(schemaRef('DisciplinaryPolicy'), 'Policy updated.'), ...errorResponses() },
      },
    },
    '/api/disciplinary-records': {
      get: {
        tags: ['Discipline'],
        summary: 'List visible disciplinary records',
        responses: { 200: jsonResponse({ type: 'array', items: schemaRef('DisciplinaryRecord') }, 'Records returned.') },
      },
      post: {
        tags: ['Discipline'],
        summary: 'Issue a formal warning or violation for an active residence',
        requestBody: jsonBody('DisciplinaryCreate'),
        responses: { 201: jsonResponse(schemaRef('DisciplinaryRecord'), 'Record created.'), ...errorResponses() },
      },
    },
    '/api/disciplinary-records/{id}': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      patch: {
        tags: ['Discipline'],
        summary: 'Resolve or revoke a disciplinary record',
        requestBody: jsonBody('DisciplinaryUpdate'),
        responses: { 200: jsonResponse(schemaRef('DisciplinaryRecord'), 'Record updated.'), ...errorResponses() },
      },
    },
    '/api/staff-dorm-assignments': {
      get: {
        tags: ['Staff assignments'],
        summary: 'List assignments or own active scope',
        responses: { 200: jsonResponse({ type: 'array', items: schemaRef('StaffDormAssignment') }, 'Assignments returned.') },
      },
      post: {
        tags: ['Staff assignments'],
        summary: 'Assign staff member to a dormitory',
        requestBody: jsonBody('StaffDormAssignmentCreate'),
        responses: { 201: jsonResponse(schemaRef('StaffDormAssignment'), 'Assignment created.'), ...errorResponses() },
      },
    },
    '/api/staff-dorm-assignments/{id}': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      delete: {
        tags: ['Staff assignments'],
        summary: 'End an active staff assignment',
        responses: { 204: { description: 'Assignment ended.' }, ...errorResponses() },
      },
    },
    '/api/applications/{id}/managed-dorm': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      patch: {
        tags: ['Applications'],
        summary: 'Route an application to a dormitory',
        requestBody: jsonBody('ApplicationRouting'),
        responses: { 200: jsonResponse(schemaRef('Application'), 'Application routed.'), ...errorResponses() },
      },
    },
    '/api/applications/{id}/comments': {
      parameters: [{ $ref: '#/components/parameters/Id' }],
      get: {
        tags: ['Applications'],
        summary: 'List visible repair request comments',
        responses: {
          200: jsonResponse({ type: 'array', items: schemaRef('ApplicationComment') }, 'Comments returned.'),
          ...errorResponses(),
        },
      },
      post: {
        tags: ['Applications'],
        summary: 'Add a comment to a repair request',
        requestBody: jsonBody('ApplicationCommentCreate'),
        responses: {
          201: jsonResponse(schemaRef('ApplicationComment'), 'Comment created.'),
          ...errorResponses(),
        },
      },
    },
    ...crudDocumentation,
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Firebase ID token',
        description: 'Paste the Firebase ID token returned after client-side sign-in.',
      },
    },
    parameters: {
      Id: {
        in: 'path',
        name: 'id',
        required: true,
        description: 'Record identifier.',
        schema: id,
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      ApiHealth: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          service: { type: 'string', example: 'DormManager API' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      DatabaseHealth: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          database: { type: 'string', example: 'connected' },
          serverTime: { type: 'string', format: 'date-time' },
        },
      },
      AuthSession: {
        type: 'object',
        properties: {
          firebaseUid: { type: 'string' },
          email: { type: 'string', format: 'email', nullable: true },
          profile: { allOf: [schemaRef('User')], nullable: true },
        },
      },
      Dorm: {
        type: 'object',
        properties: { id, ...dormFields, ...timestamps },
      },
      DormCreate: {
        type: 'object',
        properties: dormFields,
        required: ['dormNumber', 'address'],
      },
      DormUpdate: { type: 'object', properties: dormFields },
      DormRoomGeneration: {
        type: 'object',
        properties: {
          totalFloors: dormFields.totalFloors,
          residentialFloorFrom: dormFields.residentialFloorFrom,
          hasBlocks: dormFields.hasBlocks,
          blocksPerFloor: dormFields.blocksPerFloor,
          roomsPerBlock: dormFields.roomsPerBlock,
          roomsPerFloor: dormFields.roomsPerFloor,
          defaultRoomCapacity: dormFields.defaultRoomCapacity,
        },
        required: [
          'totalFloors',
          'residentialFloorFrom',
          'defaultRoomCapacity',
        ],
      },
      DormRoomGenerationResult: {
        type: 'object',
        properties: {
          dormId: id,
          createdRooms: { type: 'integer', example: 304 },
          totalRooms: { type: 'integer', example: 304 },
          totalPlaces: { type: 'integer', example: 1216 },
        },
      },
      OccupancyTotals: {
        type: 'object',
        properties: {
          rooms: { type: 'integer', example: 38 },
          capacity: { type: 'integer', example: 152 },
          occupied: { type: 'integer', example: 118 },
          available: { type: 'integer', example: 34 },
        },
      },
      OccupancyResident: {
        type: 'object',
        properties: {
          residenceId: id,
          userId: id,
          fullName: { type: 'string', example: 'Іван Цекот' },
          email: { type: 'string', format: 'email' },
        },
      },
      OccupancyRoom: {
        type: 'object',
        properties: {
          id,
          ...roomFields,
          occupied: { type: 'integer', example: 3 },
          availablePlaces: { type: 'integer', example: 1 },
          residents: { type: 'array', items: schemaRef('OccupancyResident') },
        },
      },
      OccupancyBlock: {
        type: 'object',
        properties: {
          blockNumber: { type: 'integer', example: 1 },
          totals: schemaRef('OccupancyTotals'),
          rooms: { type: 'array', items: schemaRef('OccupancyRoom') },
        },
      },
      OccupancyFloor: {
        type: 'object',
        properties: {
          floorNumber: { type: 'integer', nullable: true, example: 2 },
          totals: schemaRef('OccupancyTotals'),
          blocks: { type: 'array', items: schemaRef('OccupancyBlock') },
          rooms: { type: 'array', items: schemaRef('OccupancyRoom') },
        },
      },
      DormOccupancyLayout: {
        type: 'object',
        properties: {
          dorm: schemaRef('Dorm'),
          totals: schemaRef('OccupancyTotals'),
          floors: { type: 'array', items: schemaRef('OccupancyFloor') },
        },
      },
      Room: {
        type: 'object',
        properties: { id, ...roomFields, ...timestamps },
      },
      RoomCreate: {
        type: 'object',
        properties: roomFields,
        required: ['dormId', 'roomNumber', 'capacity'],
      },
      RoomUpdate: { type: 'object', properties: roomFields },
      User: {
        type: 'object',
        properties: { id, ...userFields, ...timestamps },
      },
      UserCreate: {
        type: 'object',
        properties: {
          email: userFields.email,
          password: {
            type: 'string',
            format: 'password',
            minLength: 6,
            maxLength: 128,
            writeOnly: true,
          },
          role: userFields.role,
          fullName: userFields.fullName,
          faculty: userFields.faculty,
          specialty: userFields.specialty,
          maintenanceSpecialization: userFields.maintenanceSpecialization,
        },
        required: ['email', 'password', 'fullName'],
      },
      UserUpdate: {
        type: 'object',
        properties: {
          role: userFields.role,
          fullName: userFields.fullName,
          faculty: userFields.faculty,
          specialty: userFields.specialty,
          maintenanceSpecialization: userFields.maintenanceSpecialization,
        },
      },
      UserActivation: {
        type: 'object',
        properties: {
          password: {
            type: 'string',
            format: 'password',
            minLength: 6,
            maxLength: 128,
            writeOnly: true,
          },
        },
        required: ['password'],
      },
      StudentRegistration: {
        type: 'object',
        properties: {
          fullName: userFields.fullName,
          faculty: userFields.faculty,
          specialty: userFields.specialty,
        },
        required: ['fullName'],
      },
      ProfileUpdate: {
        type: 'object',
        properties: {
          fullName: userFields.fullName,
          faculty: userFields.faculty,
          specialty: userFields.specialty,
        },
      },
      Service: {
        type: 'object',
        properties: { id, ...serviceFields, ...timestamps },
      },
      ServiceCreate: {
        type: 'object',
        properties: serviceFields,
        required: ['serviceType', 'price'],
      },
      ServiceUpdate: { type: 'object', properties: serviceFields },
      Residence: {
        type: 'object',
        properties: { id, ...residenceFields, ...timestamps },
      },
      ResidenceCreate: {
        type: 'object',
        properties: residenceFields,
        required: ['userId', 'roomId', 'startDate'],
      },
      ResidenceUpdate: { type: 'object', properties: residenceFields },
      Application: {
        type: 'object',
        properties: { id, ...applicationFields, ...timestamps },
      },
      ApplicationCreate: {
        type: 'object',
        properties: {
          userId: applicationFields.userId,
          roomId: applicationFields.roomId,
          assignedRoomId: applicationFields.assignedRoomId,
          managedDormId: applicationFields.managedDormId,
          applicationType: applicationFields.applicationType,
          status: applicationFields.status,
          repairCategory: applicationFields.repairCategory,
          description: applicationFields.description,
        },
        required: ['userId', 'applicationType'],
      },
      ApplicationUpdate: {
        type: 'object',
        properties: {
          assignedRoomId: applicationFields.assignedRoomId,
          status: applicationFields.status,
          repairCategory: applicationFields.repairCategory,
          description: applicationFields.description,
          resolutionNote: applicationFields.resolutionNote,
          eligibilityVerified: applicationFields.eligibilityVerified,
          documentsVerified: applicationFields.documentsVerified,
          paymentVerified: applicationFields.paymentVerified,
          medicalClearanceVerified: applicationFields.medicalClearanceVerified,
          safetyBriefingCompleted: applicationFields.safetyBriefingCompleted,
          passIssued: applicationFields.passIssued,
          housingConditionsConfirmed: applicationFields.housingConditionsConfirmed,
          disciplinaryRecordIds: {
            type: 'array',
            items: id,
            description: 'Active formal records attached as grounds for an eviction decision.',
          },
        },
      },
      ApplicationComment: {
        type: 'object',
        properties: {
          id,
          applicationId: id,
          authorId: id,
          authorName: { type: 'string' },
          authorRole: { type: 'string', enum: roles },
          message: { type: 'string' },
          visibility: { type: 'string', enum: ['public', 'staff'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ApplicationCommentCreate: {
        type: 'object',
        properties: {
          message: { type: 'string', maxLength: 2000 },
          visibility: { type: 'string', enum: ['public', 'staff'], default: 'public' },
        },
        required: ['message'],
      },
      Transaction: {
        type: 'object',
        properties: { id, ...transactionFields, ...timestamps },
      },
      TransactionCreate: {
        type: 'object',
        properties: transactionFields,
        required: ['userId', 'serviceId', 'amount'],
      },
      TransactionUpdate: { type: 'object', properties: transactionFields },
      SimulatedPaymentCreate: {
        type: 'object',
        properties: { serviceId: transactionFields.serviceId, chargeId: transactionFields.chargeId },
      },
      SimulatedPaymentCompletion: {
        type: 'object',
        properties: {
          result: { type: 'string', enum: ['succeeded', 'failed'] },
        },
        required: ['result'],
      },
      Charge: {
        type: 'object',
        properties: {
          id,
          serviceId: id,
          subjectType: { type: 'string', enum: ['residence', 'room'] },
          residenceId: { ...id, nullable: true },
          roomId: { ...id, nullable: true },
          responsibleUserId: { ...id, nullable: true },
          periodStart: { type: 'string', format: 'date' },
          periodEnd: { type: 'string', format: 'date' },
          dueDate: { type: 'string', format: 'date' },
          amount: transactionFields.amount,
          status: { type: 'string', enum: chargeStatuses },
        },
      },
      ChargeGeneration: {
        type: 'object',
        properties: {
          serviceId: id,
          periodStart: { type: 'string', format: 'date' },
          periodEnd: { type: 'string', format: 'date' },
          dueDate: { type: 'string', format: 'date' },
        },
        required: ['serviceId', 'periodStart', 'periodEnd', 'dueDate'],
      },
      BillingPeriod: {
        type: 'object',
        properties: {
          id,
          serviceId: id,
          name: { type: 'string', example: 'Осінній семестр 2026/2027' },
          periodStart: { type: 'string', format: 'date' },
          periodEnd: { type: 'string', format: 'date' },
          chargeDate: { type: 'string', format: 'date' },
          dueDate: { type: 'string', format: 'date' },
          active: { type: 'boolean' },
          ...timestamps,
        },
      },
      BillingPeriodCreate: {
        type: 'object',
        properties: {
          serviceId: id,
          name: { type: 'string', example: 'Осінній семестр 2026/2027' },
          periodStart: { type: 'string', format: 'date' },
          periodEnd: { type: 'string', format: 'date' },
          chargeDate: { type: 'string', format: 'date' },
          dueDate: { type: 'string', format: 'date' },
        },
        required: ['serviceId', 'name', 'periodStart', 'periodEnd', 'chargeDate', 'dueDate'],
      },
      BillingPeriodUpdate: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          periodStart: { type: 'string', format: 'date' },
          periodEnd: { type: 'string', format: 'date' },
          chargeDate: { type: 'string', format: 'date' },
          dueDate: { type: 'string', format: 'date' },
          active: { type: 'boolean' },
        },
      },
      AutomaticBillingResult: {
        type: 'object',
        properties: {
          businessDate: { type: 'string', format: 'date' },
          internetCreatedCount: { type: 'integer' },
          accommodationCreatedCount: { type: 'integer' },
          overdueUpdatedCount: { type: 'integer' },
          createdCount: { type: 'integer' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          id,
          notificationType: { type: 'string' },
          priority: { type: 'string', enum: ['info', 'warning', 'urgent'] },
          title: { type: 'string' },
          message: { type: 'string' },
          readAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: timestamps.createdAt,
        },
      },
      RoomInternet: {
        type: 'object',
        properties: {
          roomId: id,
          dormId: id,
          serviceId: { ...id, nullable: true },
          subscriptionStatus: { type: 'string', enum: ['inactive', 'active', 'suspended'], nullable: true },
          internetStatus: { type: 'string', enum: ['not_connected', 'payment_due', 'active_paid', 'suspended'] },
        },
      },
      RoomInternetUpdate: {
        type: 'object',
        properties: {
          serviceId: id,
          status: { type: 'string', enum: ['inactive', 'active', 'suspended'] },
          activatedAt: { type: 'string', format: 'date', nullable: true },
          suspendedAt: { type: 'string', format: 'date', nullable: true },
        },
        required: ['serviceId', 'status'],
      },
      DisciplinaryRecord: {
        type: 'object',
        properties: {
          id,
          residenceId: id,
          userId: id,
          recordType: { type: 'string', enum: ['formal_warning', 'violation'] },
          status: { type: 'string', enum: ['active', 'resolved', 'revoked'] },
          incidentDate: { type: 'string', format: 'date' },
          violationRuleId: id,
          ruleCode: { type: 'string' },
          ruleTitle: { type: 'string' },
          ruleReference: { type: 'string' },
          penaltyPoints: { type: 'integer', minimum: 0, maximum: 35 },
          studentActivePoints: { type: 'integer', minimum: 0, maximum: 35 },
          description: { type: 'string' },
        },
      },
      DisciplinaryCreate: {
        type: 'object',
        properties: {
          residenceId: id,
          violationRuleId: id,
          incidentDate: { type: 'string', format: 'date' },
          description: { type: 'string' },
        },
        required: ['residenceId', 'violationRuleId', 'incidentDate', 'description'],
      },
      DisciplinaryUpdate: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'resolved', 'revoked'] },
          resolutionNote: { type: 'string', nullable: true },
        },
        required: ['status'],
      },
      ViolationRule: {
        type: 'object',
        properties: {
          id,
          code: { type: 'string' },
          title: { type: 'string' },
          recordType: { type: 'string', enum: ['formal_warning', 'violation'] },
          ruleReference: { type: 'string' },
          defaultPoints: { type: 'integer', minimum: 0, maximum: 35 },
          active: { type: 'boolean' },
        },
      },
      ViolationRuleCreate: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          title: { type: 'string' },
          recordType: { type: 'string', enum: ['formal_warning', 'violation'] },
          ruleReference: { type: 'string' },
          defaultPoints: { type: 'integer', minimum: 0, maximum: 35 },
        },
        required: ['code', 'title', 'recordType', 'ruleReference', 'defaultPoints'],
      },
      ViolationRuleUpdate: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          recordType: { type: 'string', enum: ['formal_warning', 'violation'] },
          ruleReference: { type: 'string' },
          defaultPoints: { type: 'integer', minimum: 0, maximum: 35 },
          active: { type: 'boolean' },
        },
      },
      DisciplinaryPolicy: {
        type: 'object',
        properties: {
          id,
          title: { type: 'string' },
          noRenewalThreshold: { type: 'integer', minimum: 1, maximum: 35 },
          evictionThreshold: { type: 'integer', minimum: 1, maximum: 35 },
          maxActivePoints: { type: 'integer', enum: [35] },
          active: { type: 'boolean' },
        },
      },
      DisciplinaryPolicyUpdate: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          noRenewalThreshold: { type: 'integer', minimum: 1, maximum: 35 },
          evictionThreshold: { type: 'integer', minimum: 1, maximum: 35 },
        },
      },
      StaffDormAssignment: {
        type: 'object',
        properties: {
          id,
          userId: id,
          dormId: id,
          active: { type: 'boolean' },
          maintenanceSpecialization: userFields.maintenanceSpecialization,
        },
      },
      StaffDormAssignmentCreate: {
        type: 'object',
        properties: { userId: id, dormId: id },
        required: ['userId', 'dormId'],
      },
      ApplicationRouting: {
        type: 'object',
        properties: { managedDormId: id },
        required: ['managedDormId'],
      },
    },
  },
};

export function setupSwagger(app) {
  app.get('/api-docs.json', (_request, response) => {
    response.json(swaggerDocument);
  });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}
