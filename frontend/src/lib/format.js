const statusNames = {
  active: 'Активне',
  archived: 'Архівне',
  pending: 'Очікує',
  in_review: 'В обробці',
  waiting_materials: 'Очікує матеріалів',
  approved: 'Схвалено',
  rejected: 'Відхилено',
  completed: 'Виконано',
  cancelled: 'Скасовано',
  succeeded: 'Оплачено',
  failed: 'Помилка',
  refunded: 'Повернуто',
  paid: 'Оплачено',
  overdue: 'Прострочено',
  waived: 'Списано',
  resolved: 'Закрито',
  revoked: 'Відкликано',
};

const typeNames = {
  settlement: 'Поселення',
  renewal: 'Продовження проживання',
  repair: 'Ремонт',
  eviction: 'Виселення',
  relocation: 'Переселення',
};

const roleNames = {
  student: 'Студент',
  commandant: 'Комендант',
  maintenance_staff: 'Обслуговуючий персонал',
  administrator: 'Адміністратор',
};

export function statusLabel(status) {
  return statusNames[status] ?? status;
}

export function typeLabel(type) {
  return typeNames[type] ?? type;
}

export function roleLabel(role) {
  return roleNames[role] ?? role;
}

export function currency(value) {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export function dateLabel(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium' }).format(new Date(value));
}
