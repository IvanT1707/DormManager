export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';

export async function apiRequest(path, { token, body, headers, ...options } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message ?? 'Не вдалося виконати запит до сервера.');
  }

  return result;
}

export async function openEventStream(path, { token, signal, onNotification }) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error('Не вдалося підключити сповіщення в реальному часі.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    buffered += decoder.decode(value, { stream: true });
    const blocks = buffered.split('\n\n');
    buffered = blocks.pop() ?? '';

    for (const block of blocks) {
      if (!block.includes('event: notification')) {
        continue;
      }
      const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
      if (dataLine) {
        onNotification(JSON.parse(dataLine.slice(6)));
      }
    }
  }
}
