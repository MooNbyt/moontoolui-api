import AdminDashboard from './admin-dashboard';
import type { User } from '@/app/page';

export default function ProtectedPage({ user }: { user: User }) {
  return (
    <div className="w-full h-full min-h-screen bg-background">
      <AdminDashboard user={user} />
    </div>
  )
}
