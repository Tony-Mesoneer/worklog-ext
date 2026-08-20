// src/jira/auth.ts

export type Auth = {
  headers(): Record<string, string>
  credentials: RequestCredentials
}

// Đường mặc định. Spike 2026-08-19 xác nhận cookie session ghi được worklog.
// X-Atlassian-Token: no-check gửi vô điều kiện — vô hại khi XSRF không bật, và
// tránh phải thử-rồi-retry.
export const cookieAuth: Auth = {
  headers: () => ({ 'X-Atlassian-Token': 'no-check' }),
  credentials: 'include',
}

export function tokenAuth(email: string, apiToken: string): Auth {
  const encoded = btoa(`${email}:${apiToken}`)
  return {
    // KHÔNG bao giờ log giá trị này.
    headers: () => ({
      Authorization: `Basic ${encoded}`,
      'X-Atlassian-Token': 'no-check',
    }),
    credentials: 'omit',
  }
}
