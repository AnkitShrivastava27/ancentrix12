'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { billingApi } from '@/lib/api'
import { useAuthStore } from '@/store'
import toast from 'react-hot-toast'

function PaymentSuccessContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { fetchPlan } = useAuthStore()
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function verify() {
      const gateway   = params.get('gateway')     // 'cashfree' | 'paypal'
      const orderId   = params.get('order_id')    // Cashfree
      const token     = params.get('token')       // PayPal
      const payerId   = params.get('PayerID')     // PayPal
      const planId    = params.get('plan_id')

      try {
        if (gateway === 'cashfree' && orderId) {
          await billingApi.verifyCashfree({ order_id: orderId, plan_id: planId })
        } else if (gateway === 'paypal' && token && payerId) {
          await billingApi.capturePaypal({ order_id: token, payer_id: payerId, plan_id: planId })
        } else {
          throw new Error('Invalid payment callback')
        }
        await fetchPlan()
        setStatus('success')
        setMessage(planId === 'extra_minutes' ? 'Extra minutes added to your account!' : 'Your plan is now active!')
        setTimeout(() => router.push('/dashboard'), 3000)
      } catch (e: any) {
        setStatus('failed')
        setMessage(e.message || 'Payment verification failed. Please contact support.')
      }
    }
    verify()
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0c0d10', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 40, textAlign: 'center', maxWidth: 400, width: '100%' }}>
        {status === 'verifying' && (
          <>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #7c6eff', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', margin: '0 auto 20px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: '#f0f1f5', marginBottom: 8 }}>Verifying payment…</div>
            <div style={{ fontSize: 13, color: '#5a5d70' }}>Please wait, do not close this tab</div>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#3ecf8e', marginBottom: 8 }}>Payment Successful!</div>
            <div style={{ fontSize: 13, color: '#8a8d9e', marginBottom: 20 }}>{message}</div>
            <div style={{ fontSize: 12, color: '#4a4d5e' }}>Redirecting to dashboard…</div>
          </>
        )}
        {status === 'failed' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f25757', marginBottom: 8 }}>Payment Failed</div>
            <div style={{ fontSize: 13, color: '#8a8d9e', marginBottom: 20 }}>{message}</div>
            <button onClick={() => router.push('/pricing')} style={{ padding: '10px 24px', borderRadius: 8, background: '#7c6eff', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0c0d10' }} />}>
      <PaymentSuccessContent />
    </Suspense>
  )
}