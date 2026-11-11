type AuthError = { code?: string; message: string; status?: number }

export function ownerCreationFailure(error: AuthError | null) {
  if (error?.code === 'email_exists' || error?.code === 'user_already_exists' ||
      /already (?:been )?registered|already exists/i.test(error?.message ?? '')) {
    return {
      status: 409,
      body: {
        code: 'owner_email_exists',
        error: 'Email-kan hore ayuu u diiwaangashan yahay. Fadlan isticmaal email kale; akoonkii hore lama beddelin.',
      },
    }
  }
  return {
    status: error?.status && error.status >= 400 && error.status < 500 ? 400 : 500,
    body: { code: 'owner_create_failed', error: error?.message ?? 'owner create failed' },
  }
}

export function normalizeOwnerEmail(email: string) {
  return email.trim().toLowerCase()
}