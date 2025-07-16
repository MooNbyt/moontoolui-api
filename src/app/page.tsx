import { cookies } from 'next/headers'
import LoginForm from '@/components/login-form'
import ProtectedPage from '@/components/protected-page'

export type UserRole = 'admin' | 'moderator';

export type User = {
  loggedIn: boolean;
  role: UserRole;
  username: string;
  userId?: string; // Add userId for moderators
}

export default async function Home() {
  const cookieStore = cookies()
  const authSession = cookieStore.get('auth_session');
  
  let user: User | null = null;
  if (authSession?.value) {
    try {
      user = JSON.parse(authSession.value);
    } catch (e) {
      console.error('Failed to parse auth session cookie');
    }
  }
  
  const isAuthenticated = !!user?.loggedIn;

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      {isAuthenticated && user ? <ProtectedPage user={user} /> : <LoginForm />}
    </main>
  )
}
