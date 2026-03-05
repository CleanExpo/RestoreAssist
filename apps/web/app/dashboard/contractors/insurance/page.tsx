import { InsuranceManager } from './insurance-client'

export const metadata = {
  title: 'Insurance Management | RestoreAssist',
  description: 'Track and manage contractor insurance policies, expiry dates, and compliance status',
}

export default function InsurancePage() {
  return <InsuranceManager />
}
