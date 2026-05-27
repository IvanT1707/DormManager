import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert } from '../components/Ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { LPNU_INSTITUTES, OTHER_INSTITUTE_VALUE } from '../data/universityPrograms.js';
import { apiRequest } from '../lib/api.js';

export function ProfileRegistrationPage() {
  const { getToken, profile, refreshSession, session } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    instituteId: '',
    program: '',
    customFaculty: '',
    customSpecialty: '',
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (profile) {
    return <Navigate to="/" replace />;
  }

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'instituteId' ? { program: '', customFaculty: '', customSpecialty: '' } : {}),
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError('');

    try {
      const token = await getToken();
      const institute = LPNU_INSTITUTES.find((item) => item.id === form.instituteId);
      const faculty =
        form.instituteId === OTHER_INSTITUTE_VALUE ? form.customFaculty : institute?.name ?? null;
      const specialty =
        form.instituteId === OTHER_INSTITUTE_VALUE ? form.customSpecialty : form.program || null;

      await apiRequest('/auth/register', {
        method: 'POST',
        token,
        body: {
          fullName: form.fullName,
          faculty: faculty || null,
          specialty: specialty || null,
        },
      });
      await refreshSession();
      navigate('/');
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setPending(false);
    }
  }

  const selectedInstitute = LPNU_INSTITUTES.find((item) => item.id === form.instituteId);

  return (
    <div className="registration-page">
      <form className="registration-card form-stack" onSubmit={submit}>
        <span className="eyebrow">Перший вхід</span>
        <h1>Завершіть реєстрацію профілю</h1>
        <p className="muted">
          Обліковий запис: {session?.email}. Вкажіть дані, необхідні для користування
          послугами гуртожитку.
        </p>
        <label>
          ПІБ
          <input name="fullName" onChange={updateField} required value={form.fullName} />
        </label>
        <label>
          Інститут / факультет
          <select name="instituteId" onChange={updateField} required value={form.instituteId}>
            <option value="">Оберіть інститут</option>
            {LPNU_INSTITUTES.map((institute) => (
              <option key={institute.id} value={institute.id}>
                {institute.name}
              </option>
            ))}
            <option value={OTHER_INSTITUTE_VALUE}>Інший інститут або університет</option>
          </select>
        </label>
        {selectedInstitute ? (
          <label>
            Освітня програма / спеціальність
            <select name="program" onChange={updateField} required value={form.program}>
              <option value="">Оберіть освітню програму</option>
              {selectedInstitute.programs.map((program) => (
                <option key={program} value={program}>
                  {program}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {form.instituteId === OTHER_INSTITUTE_VALUE ? (
          <>
            <label>
              Назва інституту / факультету
              <input
                name="customFaculty"
                onChange={updateField}
                required
                value={form.customFaculty}
              />
            </label>
            <label>
              Спеціальність
              <input
                name="customSpecialty"
                onChange={updateField}
                required
                value={form.customSpecialty}
              />
            </label>
          </>
        ) : null}
        <Alert>{error}</Alert>
        <button className="button button-primary" disabled={pending} type="submit">
          {pending ? 'Зберігаємо...' : 'Увійти до кабінету'}
        </button>
      </form>
    </div>
  );
}
