'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signUpAction, googleAction, type AuthFormState } from '../actions'

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signUpAction, {})

  return (
    <div className="auth-card">
      <p className="kicker">Começar agora</p>
      <h2>Crie sua conta</h2>

      <form action={googleAction}>
        <button className="btn btn-ghost" type="submit">
          Continuar com Google
        </button>
      </form>

      <div className="auth-divider">ou</div>

      <form action={formAction}>
        <div className="field">
          <label htmlFor="full_name">Seu nome</label>
          <input id="full_name" name="full_name" className="input" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="email">E-mail de trabalho</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="hint">Mínimo de 8 caracteres.</p>
        </div>
        {state.error ? <p className="form-error">{state.error}</p> : null}
        {state.ok ? <p className="form-ok">{state.ok}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Criando…' : 'Criar conta'}
        </button>
      </form>

      <p className="auth-alt">
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </div>
  )
}
