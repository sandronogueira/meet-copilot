'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signInAction, googleAction, type AuthFormState } from '../actions'
import { GoogleSignInButton } from '../google-signin-button'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signInAction, {})

  return (
    <div className="auth-card">
      <p className="kicker">Acessar</p>
      <h2>Bem-vindo de volta</h2>

      <form action={googleAction}>
        <GoogleSignInButton />
      </form>

      <div className="auth-divider">ou</div>

      <form action={formAction}>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
          />
        </div>
        {state.error ? <p className="form-error">{state.error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="auth-alt">
        Primeira vez aqui? <Link href="/signup">Criar conta</Link>
      </p>
    </div>
  )
}
