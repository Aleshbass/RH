import { toast as sonnerToast } from "sonner"
import * as React from "react"

type ToastProps = {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive"
  action?: React.ReactElement
}

type ToasterToast = ToastProps & {
  id: string
}

function toast({ title, description, variant, action, ...props }: ToastProps) {
  if (variant === "destructive") {
    return sonnerToast.error(title as string, {
      description: description as string,
      action,
      ...props,
    })
  }
  
  return sonnerToast(title as string, {
    description: description as string,
    action,
    ...props,
  })
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string) => {
      if (toastId) {
        sonnerToast.dismiss(toastId)
      } else {
        sonnerToast.dismiss()
      }
    },
    toasts: [] as ToasterToast[], // For backward compatibility
  }
}

export { useToast, toast }