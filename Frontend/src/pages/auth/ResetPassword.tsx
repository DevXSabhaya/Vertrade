import { Navigate } from 'react-router-dom'

/**
 * The full reset flow (email -> verify code -> new password) now lives at
 * `/forgot-password` as a single wizard, so any existing bookmark/link to
 * this route still lands somewhere useful instead of 404ing.
 */
export default function ResetPassword() {
  return <Navigate to="/forgot-password" replace />
}
