import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'
import iftinLogo from '@/assets/iftin-agents-logo.png'

export default function PlatformAuth({
  onSuccess,
  authed,
}: { onSuccess: () => void; authed: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('platform-bootstrap', {
          body: {},
        })
        if (error) { setNeedsBootstrap(false); return }
        setNeedsBootstrap(!(data as any)?.exists)
      } catch {
        setNeedsBootstrap(false)
      }
    })()
  }, [])

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('platform-bootstrap', {
        body: { email, password },
      })
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message)
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signErr) throw signErr
      toast({ title: 'Super admin la sameeyay' })
      onSuccess()
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setLoading(false) }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) toast({ title: 'Khalad', description: error.message, variant: 'destructive' })
    else onSuccess()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <img
            src={iftinLogo}
            alt="Iftin Agents"
            className="mx-auto h-24 w-auto object-contain"
          />
          <CardTitle>
            {needsBootstrap ? 'Samee Super Admin' : 'Iftin Agents — Admin Login'}
          </CardTitle>
          {needsBootstrap && (
            <p className="text-xs text-muted-foreground">
              Tan waa marka kowaad ee la dejinayo. Foomka ka dib lama isticmaali karo.
            </p>
          )}
          {authed && !needsBootstrap && (
            <p className="text-xs text-destructive">Akoonkaagu super_admin maaha.</p>
          )}
        </CardHeader>
        <CardContent>
          <form
            onSubmit={needsBootstrap ? handleBootstrap : handleLogin}
            className="space-y-4"
          >
            <div>
              <Label>Email</Label>
              <Input type="email" required value={email}
                onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" required minLength={8} value={password}
                onChange={e => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {needsBootstrap ? 'Samee' : 'Soo gal'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
