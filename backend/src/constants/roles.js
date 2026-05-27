export const ROLES = Object.freeze({
  STUDENT: 'student',
  COMMANDANT: 'commandant',
  MAINTENANCE_STAFF: 'maintenance_staff',
  ADMINISTRATOR: 'administrator',
});

export const ALL_ROLES = Object.freeze(Object.values(ROLES));
export const MANAGEMENT_ROLES = Object.freeze([ROLES.COMMANDANT, ROLES.ADMINISTRATOR]);
