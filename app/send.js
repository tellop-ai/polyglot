/**
 * Sends a JSON request to one of this app's own addresses from the page.
 *
 * It answers the parsed reply when the address confirmed, or the refusal's
 * message key when it did not. A request that ended without a readable answer
 * is an unconfirmed save, never a success: the page says so and keeps what the
 * person did on screen.
 *
 * @param {string} address
 * @param {'POST' | 'DELETE'} method
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ ok: true, value: any } | { ok: false, problem: string }>}
 */
export async function send(address, method, body) {
  try {
    const response = await fetch(address, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    let value = null;
    try {
      value = await response.json();
    } catch {
      return { ok: false, problem: 'error.saveUnconfirmed' };
    }
    if (!response.ok) return { ok: false, problem: typeof value?.problem === 'string' ? value.problem : 'error.saveUnconfirmed' };
    if (value === null || typeof value !== 'object') return { ok: false, problem: 'error.saveUnconfirmed' };
    return { ok: true, value };
  } catch {
    return { ok: false, problem: 'error.saveUnconfirmed' };
  }
}
