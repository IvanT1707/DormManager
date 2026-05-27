import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert } from '../components/Ui.jsx';
import { auth } from '../config/firebase.js';
import { useAuth } from '../context/AuthContext.jsx';

function authErrorMessage(error, mode) {
  const messages = {
    'auth/admin-restricted-operation':
      'Створення нових облікових записів наразі недоступне.',
    'auth/configuration-not-found':
      'Сервіс авторизації тимчасово недоступний.',
    'auth/email-already-in-use':
      'Акаунт з таким email уже існує. Спробуйте увійти.',
    'auth/invalid-api-key':
      'Сервіс авторизації налаштовано некоректно. Зверніться до адміністратора.',
    'auth/invalid-credential':
      'Невірний email або пароль.',
    'auth/invalid-email':
      'Введіть коректну email-адресу.',
    'auth/network-request-failed':
      'Не вдалося з’єднатися із сервісом авторизації. Перевірте інтернет-з’єднання.',
    'auth/operation-not-allowed':
      'Самостійну реєстрацію наразі вимкнено. Зверніться до адміністратора.',
    'auth/weak-password':
      'Пароль надто слабкий. Введіть складніший пароль.',
  };

  return (
    messages[error?.code] ??
    (mode === 'register'
      ? 'Не вдалося створити акаунт. Перевірте введені дані.'
      : 'Не вдалося увійти. Перевірте email і пароль.')
  );
}

export function LoginPage() {
  const { configured, loading, profile, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', passwordConfirmation: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  if (!loading && user) {
    return <Navigate to={profile ? '/' : '/register-profile'} replace />;
  }

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (mode === 'register' && form.password !== form.passwordConfirmation) {
      setError('Паролі не збігаються. Повторіть введення.');
      return;
    }

    setPending(true);

    try {
      if (mode === 'register') {
        await createUserWithEmailAndPassword(auth, form.email, form.password);
        navigate('/register-profile');
      } else {
        await signInWithEmailAndPassword(auth, form.email, form.password);
        navigate('/');
      }
    } catch (nextError) {
      setError(authErrorMessage(nextError, mode));
    } finally {
      setPending(false);
    }
  }

  async function resetPassword() {
    if (!form.email) {
      setError('Спочатку введіть email для відновлення пароля.');
      return;
    }

    setPending(true);
    setError('');
    setMessage('');

    try {
      await sendPasswordResetEmail(auth, form.email);
      setMessage('Лист для відновлення пароля надіслано на вказаний email.');
    } catch (nextError) {
      setError(authErrorMessage(nextError, 'login'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-intro">
        <span className="eyebrow">DormManager</span>
        <h1>Гуртожиток під контролем</h1>
        <p>
          Поселення, звернення щодо ремонту, тарифи, звіти й адміністрування в
          одному захищеному робочому просторі.
        </p>
        <div className="auth-feature-list">
          <span>Особистий кабінет</span>
          <span>Робота персоналу</span>
          <span>Аналітика та управління</span>
        </div>
      </section>
      <section className={`auth-card auth-card-${mode}`}>
        <span className="eyebrow">{mode === 'login' ? 'Авторизація' : 'Новий користувач'}</span>
        <h2>{mode === 'login' ? 'Вхід до системи' : 'Створення облікового запису'}</h2>
        <p className="muted auth-description">
          {mode === 'login'
            ? 'Увійдіть до кабінету відповідно до своєї ролі.'
            : 'Створіть обліковий запис і заповніть персональні дані.'}
        </p>
        {!configured ? (
          <Alert>
            Сервіс авторизації ще не налаштований. Зверніться до адміністратора системи.
          </Alert>
        ) : null}
        <form className="form-stack" onSubmit={submit}>
          <label>
            Email
            <input
              autoComplete="email"
              disabled={!configured}
              name="email"
              onChange={updateField}
              required
              type="email"
              value={form.email}
            />
          </label>
          <label>
            Пароль
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              disabled={!configured}
              minLength="6"
              name="password"
              onChange={updateField}
              required
              type="password"
              value={form.password}
            />
          </label>
          {mode === 'register' ? (
            <label>
              Підтвердження пароля
              <input
                autoComplete="new-password"
                disabled={!configured}
                minLength="6"
                name="passwordConfirmation"
                onChange={updateField}
                required
                type="password"
                value={form.passwordConfirmation}
              />
            </label>
          ) : null}
          <Alert>{error}</Alert>
          <Alert tone="success">{message}</Alert>
          <button className="button button-primary" disabled={!configured || pending} type="submit">
            {pending ? 'Зачекайте...' : mode === 'login' ? 'Увійти' : 'Зареєструватися'}
          </button>
        </form>
        <button
          className="text-action"
          onClick={() => {
            setError('');
            setMessage('');
            setForm((current) => ({ ...current, password: '', passwordConfirmation: '' }));
            setMode(mode === 'login' ? 'register' : 'login');
          }}
          type="button"
        >
          {mode === 'login' ? 'Створити новий обліковий запис' : 'У мене вже є обліковий запис'}
        </button>
        {mode === 'login' && configured ? (
          <div className="auth-help">
            <span>Не пам’ятаєте пароль?</span>
            <button className="text-action reset-action" disabled={pending} onClick={resetPassword} type="button">
              Відновити пароль
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
