import { requestJson } from './http'

export type PublicSettings = {
  registration_enabled: boolean
  email_verify_enabled: boolean
  site_name?: string
}

export function fetchPublicSettings(): Promise<PublicSettings> {
  return requestJson<PublicSettings>({
    url: '/settings/public',
    method: 'GET',
  })
}
