"use client"

import Image from 'next/image'
import Link from 'next/link'

import { useQueryUntyped } from '@/lib/convexUntyped'
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, User, Loader2, AlertCircle, ChevronLeft, ChevronRight, Check, Video } from '@/components/icons'
import { format, addDays } from 'date-fns'
import { toast } from 'sonner'
import { playSound } from '@/lib/sounds'
import { Id } from '@/convex/_generated/dataModel'
import { GoogleCalendarRequiredModal } from '@/components/modals/GoogleCalendarRequiredModal'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AppointmentBookingModalProps {
  isOpen: boolean
  onClose: () => void
  onAppointmentBooked: () => void
}

// Time slot returned by getAvailableTimeSlots query
interface TimeSlot {
  startTime: number;
  endTime: number;
  startTimeFormatted: string;
  endTimeFormatted: string;
  available: boolean;
}

const serviceTypes = [
  'Initial Consultation',
  'Follow-up Session',
  'Assessment',
  'Treatment Session',
  'Rehabilitation Session',
  'Exercise Training',
  'Manual Therapy',
  'Other'
]

type Step = 'provider' | 'datetime' | 'details' | 'confirmation' | 'success'

export function AppointmentBookingModal({
  isOpen,
  onClose,
  onAppointmentBooked,
}: AppointmentBookingModalProps) {
  const [step, setStep] = useState<Step>('provider')
  const [direction, setDirection] = useState(0)

  const [selectedPhysiotherapist, setSelectedPhysiotherapist] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<any>(null)
  const [serviceType, setServiceType] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [guests, setGuests] = useState<string[]>([])
  const [guestInput, setGuestInput] = useState('')
  const [showGuestInput, setShowGuestInput] = useState(false)

  // Video platform selection (default to google_meet)
  const [manualMeetingLink, setManualMeetingLink] = useState<'google_meet' | ''>('google_meet')

  const [googleMeetLink, setGoogleMeetLink] = useState<string | undefined>()
  const [googleCalendarLink, setGoogleCalendarLink] = useState<string | undefined>()
  const [showCalendarModal, setShowCalendarModal] = useState(false)

  // Get current user for pre-filling
  const user = useQuery(api.users.getMyUser)

  // Get patient's physiotherapists (use untyped hook to avoid deep instantiation)
  const physiotherapists = useQueryUntyped(api.appointments.getMyPhysiotherapists)

  // Get available time slots for selected physiotherapist and date
  const availableSlots = useQuery(
    api.appointments.getAvailableTimeSlots,
    selectedPhysiotherapist && selectedDate
      ? {
        physiotherapistId: selectedPhysiotherapist as Id<'users'>,
        date: selectedDate,
        serviceType,
      }
      : 'skip'
  )

  const requestAppointment = useMutation(api.appointments.requestAppointment)

  // Rehabify patients book and pay for sessions on the physio's booking page instead
  const billingMode = useQuery(
    api.rehabifyFollowUps.getCareBillingMode,
    selectedPhysiotherapist ? { physiotherapistId: selectedPhysiotherapist as Id<'users'> } : 'skip'
  ) as { mode: 'rehabify' | 'own' } | null | undefined
  const paidOnRehabify = billingMode?.mode === 'rehabify'
  const billingModeLoading = Boolean(selectedPhysiotherapist) && billingMode === undefined

  // Check if user has Google Calendar connected
  const hasGoogleCalendar = useQuery(
    api.calendar.oauth.hasGoogleCalendarConnected,
    user ? { userId: user._id } : 'skip'
  )

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('provider')
      setDirection(0)
      setSelectedPhysiotherapist('')
      setSelectedDate('')
      setSelectedTimeSlot(null)
      setServiceType('')
      setNotes('')
      setGuests([])
      setManualMeetingLink('google_meet')
    }
  }, [isOpen])

  // Set default date to tomorrow
  useEffect(() => {
    if (isOpen && !selectedDate) {
      const tomorrow = addDays(new Date(), 1)
      setSelectedDate(format(tomorrow, 'yyyy-MM-dd'))
    }
  }, [isOpen, selectedDate])

  const nextStep = (target: Step) => {
    setDirection(1)
    setStep(target)
  }

  const prevStep = (target: Step) => {
    setDirection(-1)
    setStep(target)
  }

  const handleAddGuest = () => {
    if (guestInput && /\S+@\S+\.\S+/.test(guestInput)) {
      setGuests([...guests, guestInput])
      setGuestInput('')
      setShowGuestInput(false)
    } else {
      toast.error('Please enter a valid email')
    }
  }

  const handleSubmit = async () => {
    if (!selectedPhysiotherapist || !selectedTimeSlot || !serviceType || paidOnRehabify) return

    // Check if calendar needs to be connected (patient flow always uses Google Meet)
    if (!hasGoogleCalendar && manualMeetingLink === 'google_meet') {
      setShowCalendarModal(true)
      return
    }

    setIsSubmitting(true)

    try {
      const result = await requestAppointment({
        physiotherapistId: selectedPhysiotherapist as Id<'users'>,
        startTime: selectedTimeSlot.startTime,
        endTime: selectedTimeSlot.endTime,
        serviceType,
        notes: notes || undefined,
        appointmentType: 'telehealth', // Defaulting to telehealth
      })

      if (result.success) {
        playSound('booked')
        toast.success(result.message)
        onAppointmentBooked()
        if (result.googleMeetLink) setGoogleMeetLink(result.googleMeetLink)
        if (result.googleCalendarLink) setGoogleCalendarLink(result.googleCalendarLink)
        nextStep('success')
      } else {
        toast.error('Failed to book appointment')
      }
    } catch (error) {
      console.error('Error booking appointment:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to book appointment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getNextAvailableDates = () => {
    const dates = []
    for (let i = 1; i <= 14; i++) { // Next 2 weeks
      const date = addDays(new Date(), i)
      dates.push({
        value: format(date, 'yyyy-MM-dd'),
        label: format(date, 'EEEE, MMMM do'),
      })
    }
    return dates
  }

  const selectedPhysioDetails = physiotherapists?.find((p: any) => p?._id === selectedPhysiotherapist)

  // Animation variants
  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 20 : -20,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 20 : -20,
      opacity: 0,
    }),
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-6xl h-[90vh] sm:h-auto sm:max-h-[90vh] !p-0 !gap-0 rounded-xl overflow-hidden block">
        <div className="flex flex-col md:flex-row w-full h-full">

          {/* LEFT COLUMN - Wizard Content */}
          <div className="flex-1 flex flex-col h-full overflow-hidden md:w-3/5 bg-white relative">

            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white z-10">
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900">Book Appointment</DialogTitle>
                <p className="text-sm text-gray-500 mt-1">
                  {step === 'provider' && 'Step 1: Choose Provider'}
                  {step === 'datetime' && 'Step 2: Date & Time'}
                  {step === 'details' && 'Step 3: Details'}
                  {step === 'confirmation' && 'Step 4: Confirm'}
                  {step === 'success' && 'Booking Confirmed'}
                </p>
              </div>

              {/* Step Indicator */}
              {step !== 'success' && (
                <div className="flex gap-1">
                  {['provider', 'datetime', 'details', 'confirmation'].map((s, i) => (
                    <div
                      key={s}
                      className={cn(
                        "h-2 w-2 rounded-full transition-colors duration-300",
                        ['provider', 'datetime', 'details', 'confirmation'].indexOf(step) >= i
                          ? "bg-brand"
                          : "bg-gray-200"
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Content Area with Animation */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden relative p-6">
              <AnimatePresence initial={false} custom={direction} mode="wait">
                <motion.div
                  key={step}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="h-full"
                >
                  {step === 'provider' && (
                    <div className="space-y-6 max-w-lg mx-auto">
                      <div className="space-y-4">
                        <Label className="text-base font-semibold">Select Physiotherapist</Label>
                        <div className="grid gap-3">
                          {physiotherapists?.map((physio: any) => physio && (
                            <div
                              key={physio._id}
                              onClick={() => setSelectedPhysiotherapist(physio._id)}
                              className={cn(
                                "cursor-pointer rounded-xl border p-4 transition-all hover:border-brand/50 hover:bg-brand/5",
                                selectedPhysiotherapist === physio._id
                                  ? "border-brand bg-brand/5 ring-1 ring-brand"
                                  : "border-gray-200 bg-white"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold">
                                  {physio.firstName[0]}{physio.lastName[0]}
                                </div>
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">{physio.firstName} {physio.lastName}</div>
                                  {physio.isPrimary && <span className="text-xs text-brand font-medium">Primary Physiotherapist</span>}
                                </div>
                                {selectedPhysiotherapist === physio._id && (
                                  <div className="h-5 w-5 rounded-full bg-brand text-white flex items-center justify-center">
                                    <Check className="h-3 w-3" />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {paidOnRehabify ? (
                        <div className="space-y-3 rounded-xl border border-brand/20 bg-brand/5 p-4">
                          <p className="font-semibold text-gray-900">
                            Sessions with {selectedPhysioDetails?.firstName ?? 'this physiotherapist'} are booked and paid on Rehabify
                          </p>
                          <p className="text-sm text-gray-600">
                            Choose a service and a time on their booking page. The price you see is the price you pay, and your booking is confirmed once paid.
                          </p>
                          <Button asChild className="bg-brand hover:bg-brand-dark text-brand-dark font-semibold">
                            <Link href={`/book/${selectedPhysiotherapist}`} onClick={onClose}>
                              Go to the booking page <ChevronRight className="h-4 w-4 ml-1" />
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <Label className="text-base font-semibold">Service Type</Label>
                          <Select value={serviceType} onValueChange={setServiceType}>
                            <SelectTrigger className="h-12 rounded-xl border-gray-200">
                              <SelectValue placeholder="Select service type" />
                            </SelectTrigger>
                            <SelectContent>
                              {serviceTypes.map((type) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  {step === 'datetime' && (
                    <div className="space-y-6 max-w-lg mx-auto">
                      <div className="space-y-4">
                        <Label className="text-base font-semibold">Select Date</Label>
                        <Select value={selectedDate} onValueChange={(val) => { setSelectedDate(val); setSelectedTimeSlot(null); }}>
                          <SelectTrigger className="h-12 rounded-xl border-gray-200">
                            <SelectValue placeholder="Select date" />
                          </SelectTrigger>
                          <SelectContent>
                            {getNextAvailableDates().map((date) => (
                              <SelectItem key={date.value} value={date.value}>{date.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-base font-semibold">Available Time Slots</Label>
                        {availableSlots === undefined ? (
                          <div className="flex items-center justify-center p-8 text-gray-500">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                            Loading slots...
                          </div>
                        ) : availableSlots?.length === 0 ? (
                          <div className="p-6 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            <p className="text-gray-500">No slots available for this date.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {availableSlots?.map((slot: TimeSlot, index: number) => (
                              <button
                                key={index}
                                type="button"
                                onClick={() => setSelectedTimeSlot(slot)}
                                className={cn(
                                  "flex items-center justify-center py-3 px-4 rounded-lg text-sm font-medium transition-all border",
                                  selectedTimeSlot?.startTime === slot.startTime
                                    ? "bg-brand text-brand-foreground border-brand shadow-sm"
                                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                )}
                              >
                                {slot.startTimeFormatted}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {step === 'details' && (
                    <div className="space-y-6 max-w-lg mx-auto">
                      <div className="space-y-4">
                        <Label className="text-base font-semibold">Video Platform</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div
                            onClick={() => setManualMeetingLink('google_meet')}
                            className={cn(
                              "cursor-pointer rounded-xl border p-4 transition-all relative overflow-hidden",
                              manualMeetingLink === 'google_meet'
                                ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            )}
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <div className="bg-white p-1.5 rounded-full shadow-sm border border-gray-100">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                  <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" fill="#FBBC05" />
                                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" fill="#EA4335" />
                                </svg>
                              </div>
                              <span className="font-medium text-gray-900">Google Meet</span>
                            </div>
                            <div className="text-xs text-gray-500 pl-1">Auto-generates link</div>
                            {manualMeetingLink === 'google_meet' && (
                              <div className="absolute top-3 right-3 text-blue-600">
                                <Check className="h-4 w-4" />
                              </div>
                            )}
                          </div>

                          <div
                            onClick={() => setManualMeetingLink('')}
                            className={cn(
                              "cursor-pointer rounded-xl border p-4 transition-all relative overflow-hidden",
                              !manualMeetingLink
                                ? "border-brand bg-brand/5 ring-1 ring-brand"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            )}
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <div className="bg-white p-1.5 rounded-full shadow-sm border border-gray-100">
                                <Video className="w-5 h-5 text-brand" />
                              </div>
                              <span className="font-medium text-gray-900">Rehabify Video</span>
                            </div>
                            <div className="text-xs text-gray-500 pl-1">Built-in platform</div>
                            {!manualMeetingLink && (
                              <div className="absolute top-3 right-3 text-brand">
                                <Check className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-base font-semibold">Notes (Optional)</Label>
                        <Textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Share anything that will help prepare for our meeting..."
                          className="min-h-[100px] rounded-xl border-gray-200 resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {step === 'confirmation' && (
                    <div className="space-y-6 max-w-lg mx-auto">
                      <div className="bg-gray-50 rounded-xl p-6 space-y-4 border border-gray-100">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0">
                            <Calendar className="h-6 w-6 text-brand" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 text-lg">
                              {format(new Date(selectedDate), 'EEEE, MMMM do')}
                            </h3>
                            <p className="text-gray-600 font-medium mt-0.5">
                              {selectedTimeSlot?.startTimeFormatted} - {selectedTimeSlot?.endTimeFormatted}
                            </p>
                            <p className="text-sm text-gray-500 mt-2">
                              {serviceType} with {selectedPhysioDetails?.firstName} {selectedPhysioDetails?.lastName}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-medium text-gray-900 border-b pb-2">Contact Details</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-gray-500 mb-1">Name</div>
                            <div className="font-medium">{user?.firstName} {user?.lastName}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-1">Email</div>
                            <div className="font-medium">{user?.email}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-1">Platform</div>
                            <div className="font-medium flex items-center gap-1">
                              {manualMeetingLink === 'google_meet' ? 'Google Meet' : 'Rehabify Video'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {notes && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-gray-900 border-b pb-2">Notes</h4>
                          <p className="text-sm text-gray-600 italic">"{notes}"</p>
                        </div>
                      )}
                    </div>
                  )}

                  {step === 'success' && (
                    <div className="flex flex-col items-center justify-center h-full text-center py-8">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6"
                      >
                        <Check className="w-10 h-10 text-green-600" />
                      </motion.div>

                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
                      <p className="text-gray-600 max-w-xs mx-auto mb-8">
                        Your appointment has been scheduled. We've sent a confirmation email to {user?.email}.
                      </p>

                      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                        <Button onClick={() => window.open('https://calendar.google.com/calendar/r', '_blank')} className="w-full bg-gray-900 text-white hover:bg-gray-800">
                          Add to Calendar
                        </Button>
                        <Button onClick={onClose} variant="outline" className="w-full">
                          Close
                        </Button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer / Actions */}
            {step !== 'success' && (
              <div className="p-6 border-t border-gray-100 bg-white shrink-0 z-10">
                <div className="flex items-center justify-between max-w-lg mx-auto">
                  {step === 'provider' ? (
                    <Button variant="ghost" onClick={onClose} className="text-gray-500 hover:text-gray-900">
                      Cancel
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => prevStep(step === 'confirmation' ? 'details' : step === 'details' ? 'datetime' : 'provider')} className="pl-0 hover:pl-2 transition-all">
                      <ChevronLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                  )}

                  <Button
                    onClick={() => {
                      if (step === 'provider') nextStep('datetime')
                      else if (step === 'datetime') nextStep('details')
                      else if (step === 'details') nextStep('confirmation')
                      else if (step === 'confirmation') handleSubmit()
                    }}
                    disabled={
                      (step === 'provider' && (!selectedPhysiotherapist || !serviceType || paidOnRehabify || billingModeLoading)) ||
                      (step === 'datetime' && (!selectedDate || !selectedTimeSlot)) ||
                      isSubmitting
                    }
                    className={cn(
                      "bg-brand hover:bg-brand-dark text-brand-dark font-semibold px-8 transition-all",
                      isSubmitting && "opacity-80 cursor-wait"
                    )}
                  >
                    {step === 'confirmation' ? (
                      isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming</> : 'Confirm Booking'
                    ) : (
                      <>Next <ChevronRight className="h-4 w-4 ml-1" /></>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - Image (Desktop Only) */}
          <div className="hidden md:block md:w-2/5 relative bg-gradient-to-br from-brand to-brand-dark overflow-hidden">
            <div className="absolute inset-0">
              <Image
                src="/logos/images/IMG_6328_a4bxtu.webp"
                alt="Professional healthcare"
                fill
                className="object-cover opacity-40 mix-blend-overlay"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-br from-brand/90 to-brand-dark/90 mix-blend-multiply"></div>
            </div>

            <div className="relative h-full flex flex-col justify-between p-12 text-white">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full text-sm font-medium border border-white/20">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Live Scheduling
                </div>
                <h2 className="text-4xl font-bold leading-tight tracking-tight">
                  Your Health,<br />Your Schedule.
                </h2>
                <p className="text-white/80 text-lg leading-relaxed max-w-sm">
                  Book your sessions seamlessly and get back to doing what you love.
                </p>
              </div>

              {/* Dynamic Step Info on Right Panel */}
              <div className="space-y-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10"
                  >
                    {step === 'provider' && (
                      <>
                        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center mb-4">
                          <User className="h-6 w-6" />
                        </div>
                        <h4 className="text-xl font-bold mb-2">Choose Your Expert</h4>
                        <p className="text-white/70 text-sm">Select from your assigned physiotherapists to ensure continuity of care.</p>
                      </>
                    )}
                    {step === 'datetime' && (
                      <>
                        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center mb-4">
                          <Clock className="h-6 w-6" />
                        </div>
                        <h4 className="text-xl font-bold mb-2">Pick a Time</h4>
                        <p className="text-white/70 text-sm">Real-time availability ensures you find a slot that fits your life.</p>
                      </>
                    )}
                    {(step === 'details' || step === 'confirmation') && (
                      <>
                        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center mb-4">
                          <Check className="h-6 w-6" />
                        </div>
                        <h4 className="text-xl font-bold mb-2">Almost Done</h4>
                        <p className="text-white/70 text-sm">Review your details and confirm to secure your appointment instantly.</p>
                      </>
                    )}
                    {step === 'success' && (
                      <>
                        <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                          <Calendar className="h-6 w-6" />
                        </div>
                        <h4 className="text-xl font-bold mb-2">All Set!</h4>
                        <p className="text-white/70 text-sm">Check your email for the calendar invite and meeting link.</p>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

        </div>
      </DialogContent>

      <GoogleCalendarRequiredModal
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        onRefresh={() => {
          setShowCalendarModal(false);
        }}
      />
    </Dialog>
  )
}