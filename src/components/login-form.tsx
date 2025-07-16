'use client'

import { useFormStatus } from 'react-dom'
import { login, type State } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { User, Lock, AlertTriangle } from 'lucide-react'
import { useEffect, useActionState } from 'react'
import { useToast } from '@/hooks/use-toast'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
      aria-disabled={pending}
    >
      {pending ? 'Signing In...' : 'Sign In'}
    </Button>
  )
}

export default function LoginForm() {
  const [state, formAction] = useActionState<State, FormData>(login, undefined)
  const { toast } = useToast()

  useEffect(() => {
    if (state?.message) {
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: state.message,
        icon: <AlertTriangle className="h-5 w-5 text-destructive-foreground" />,
      })
    }
  }, [state, toast])

  return (
    <div className="animate-fade-in">
      <Card className="w-full max-w-sm border-accent/20">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-headline text-accent">
            MoonTool
          </CardTitle>
          <CardDescription>
            Enter credentials to access the protected area.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative flex items-center">
                <User className="absolute left-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="username"
                  name="username"
                  placeholder="admin"
                  required
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  className="pl-10"
                />
              </div>
            </div>
            <SubmitButton />
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
