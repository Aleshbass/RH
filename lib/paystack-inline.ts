/**
 * Loads Paystack's inline checkout script on demand (only when someone starts a payment), so
 * it isn't downloaded on every page of the site. Resolves once `window.PaystackPop` exists.
 */
const SRC = 'https://js.paystack.co/v1/inline.js'
let loading: Promise<void> | null = null

export function loadPaystackInline(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Paystack can only load in the browser'))
  if ((window as unknown as { PaystackPop?: unknown }).PaystackPop) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('Could not load the payment window. Check your connection and try again.'))
    }
    document.body.appendChild(script)
  })
  return loading
}
