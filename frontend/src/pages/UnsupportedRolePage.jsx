import { useAuth } from '../context/AuthContext.jsx';

export function UnsupportedRolePage() {
  const { profile } = useAuth();

  return (
    <section className="page-card narrow-card">
      <span className="eyebrow">DormManager</span>
      <h1>Профіль активовано</h1>
      <p>
        Для ролі <strong>{profile.role}</strong> немає доступних робочих розділів.
        Зверніться до адміністратора для перевірки прав доступу.
      </p>
    </section>
  );
}
