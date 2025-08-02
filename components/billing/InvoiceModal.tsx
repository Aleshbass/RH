'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { 
  Receipt, 
  User, 
  Plus,
  Minus,
  X,
  Loader2,
  CreditCard
} from 'lucide-react'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'

interface Service {
  name: string
  description: string
  quantity: number
  unitPrice: number
  total: number
}

interface InvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  selectedPatientId?: Id<"users">
  selectedSessionIds?: Id<"appointments">[]
  appointmentId: Id<'appointments'>
  onSuccess?: () => void
}

interface InvoiceFormData {
  amount: number
  description: string
  dueDate: string
  patientId?: string
  services: Service[]
  discountType: 'amount' | 'percentage'
  discountAmount: number
  discountPercentage: number
  notes?: string
  paymentTerms: string
}

export function InvoiceModal({ 
  isOpen, 
  onClose, 
  selectedPatientId,
  selectedSessionIds = [],
  appointmentId,
  onSuccess
}: InvoiceModalProps) {
  const [formData, setFormData] = useState<InvoiceFormData>({
    amount: 0,
    description: '',
    dueDate: new Date().toISOString().split('T')[0],
    patientId: selectedPatientId,
    services: [{
      name: 'Physiotherapy Session',
      description: '',
      quantity: 1,
      unitPrice: 15000,
      total: 15000
    }],
    discountType: 'amount',
    discountAmount: 0,
    discountPercentage: 0,
    notes: '',
    paymentTerms: 'Payment due within 30 days'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get patients for selection
  const patients = useQuery(api.patients.getMyPatients, { limit: 100 }) || []
  
  // Create invoice mutation
  const createInvoice = useMutation(api.billing.createInvoice)

  const serviceTypes = [
    'Initial Assessment',
    'Physiotherapy Session',
    'Manual Therapy',
    'Exercise Therapy',
    'Home Visit',
    'Consultation',
    'Report Writing',
    'Equipment Rental',
    'Special Treatment'
  ]

  const paymentTermsOptions = [
    'Payment due within 7 days',
    'Payment due within 14 days',
    'Payment due within 30 days',
    'Payment due on receipt',
    'Net 30'
  ]

  // Calculate totals with platform fee
  const subtotal = formData.services.reduce((sum, service) => sum + service.total, 0)
  const discountAmount = formData.discountType === 'amount' 
    ? formData.discountAmount 
    : (subtotal * formData.discountPercentage / 100)
  const platformFee = 1000 // Platform fee in naira
  const total = subtotal - discountAmount + platformFee

  const handleServiceChange = (index: number, field: keyof Service, value: string | number) => {
    const newServices = [...formData.services]
    newServices[index] = { ...newServices[index], [field]: value }
    
    // Recalculate total for this service
    if (field === 'quantity' || field === 'unitPrice') {
      newServices[index].total = newServices[index].quantity * newServices[index].unitPrice
    }
    
    setFormData(prev => ({ ...prev, services: newServices }))
  }

  const addService = () => {
    setFormData(prev => ({
      ...prev,
      services: [
        ...prev.services,
        {
          name: 'Physiotherapy Session',
          description: '',
          quantity: 1,
          unitPrice: 15000,
          total: 15000
        }
      ]
    }))
  }

  const removeService = (index: number) => {
    if (formData.services.length > 1) {
      setFormData(prev => ({
        ...prev,
        services: prev.services.filter((_, i) => i !== index)
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.patientId) {
      toast.error('Please select a patient')
      return
    }

    if (formData.services.some(s => !s.name || s.quantity <= 0 || s.unitPrice <= 0)) {
      toast.error('Please fill in all service details correctly')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await createInvoice({
        patientId: formData.patientId as Id<"users">,
        appointmentIds: selectedSessionIds || [],
        items: formData.services.map(service => ({
          description: service.name + (service.description ? ` - ${service.description}` : ''),
          quantity: service.quantity,
          unitPrice: service.unitPrice,
          totalPrice: service.total,
        })),
        discountAmount: formData.discountType === 'amount' ? formData.discountAmount : undefined,
        notes: formData.notes || undefined,
        dueDate: new Date(formData.dueDate).getTime(),
      })

      if (result.success) {
        toast.success('Invoice created and sent to patient successfully!')
        handleClose()
        onSuccess?.()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      toast.error('Failed to create invoice')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setFormData({
      amount: 0,
      description: '',
      dueDate: new Date().toISOString().split('T')[0],
      patientId: selectedPatientId,
      services: [{
        name: 'Physiotherapy Session',
        description: '',
        quantity: 1,
        unitPrice: 15000,
        total: 15000
      }],
      discountType: 'amount',
      discountAmount: 0,
      discountPercentage: 0,
      notes: '',
      paymentTerms: 'Payment due within 30 days'
    })
    onClose()
  }

  const appointmentDetails = useQuery(api.appointments.getAppointmentDetails, {
    appointmentId,
  })

  if (!appointmentDetails) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Create Invoice
          </DialogTitle>
          <DialogDescription>
            Create an invoice for {appointmentDetails.appointment.patient?.firstName} {appointmentDetails.appointment.patient?.lastName}&apos;s appointment
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Patient *</Label>
            <Select 
              value={formData.patientId} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, patientId: value }))}
              disabled={isSubmitting || !!selectedPatientId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a patient" />
              </SelectTrigger>
              <SelectContent>
                {patients?.filter(Boolean).map((patient) => {
                  if (!patient) return null;
                  return (
                    <SelectItem key={patient._id} value={patient._id}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>{patient.firstName ?? 'Unknown'} {patient.lastName ?? 'Patient'}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Services */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Services *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addService}
                disabled={isSubmitting}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Service
              </Button>
            </div>

            <div className="space-y-4 border rounded-lg p-4">
              {formData.services.map((service, index) => (
                <div key={index} className="space-y-3 pb-4 border-b last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Service {index + 1}</span>
                    {formData.services.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeService(index)}
                        disabled={isSubmitting}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Service Name</Label>
                      <Select
                        value={service.name}
                        onValueChange={(value) => handleServiceChange(index, 'name', value)}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {serviceTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Description (Optional)</Label>
                      <Input
                        value={service.description}
                        onChange={(e) => handleServiceChange(index, 'description', e.target.value)}
                        placeholder="Brief description"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        value={service.quantity}
                        onChange={(e) => handleServiceChange(index, 'quantity', parseInt(e.target.value) || 1)}
                        min="1"
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Unit Price (₦)</Label>
                      <Input
                        type="number"
                        value={service.unitPrice}
                        onChange={(e) => handleServiceChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="100"
                        disabled={isSubmitting}
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Total (₦)</Label>
                      <Input
                        value={service.total.toLocaleString()}
                        disabled
                        className="bg-gray-50"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Discount */}
          <div className="space-y-4 border rounded-lg p-4">
            <Label className="text-sm font-medium">Discount (Optional)</Label>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="amount"
                  name="discountType"
                  value="amount"
                  checked={formData.discountType === 'amount'}
                  onChange={(e) => setFormData(prev => ({ ...prev, discountType: e.target.value as 'amount' }))}
                  disabled={isSubmitting}
                />
                <Label htmlFor="amount" className="text-sm">Fixed Amount</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="percentage"
                  name="discountType"
                  value="percentage"
                  checked={formData.discountType === 'percentage'}
                  onChange={(e) => setFormData(prev => ({ ...prev, discountType: e.target.value as 'percentage' }))}
                  disabled={isSubmitting}
                />
                <Label htmlFor="percentage" className="text-sm">Percentage</Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">
                  {formData.discountType === 'amount' ? 'Discount Amount (₦)' : 'Discount Percentage (%)'}
                </Label>
                <Input
                  type="number"
                  value={formData.discountType === 'amount' ? formData.discountAmount : formData.discountPercentage}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0
                    if (formData.discountType === 'amount') {
                      setFormData(prev => ({ ...prev, discountAmount: value }))
                    } else {
                      setFormData(prev => ({ ...prev, discountPercentage: Math.min(100, value) }))
                    }
                  }}
                  min="0"
                  max={formData.discountType === 'percentage' ? 100 : undefined}
                  step={formData.discountType === 'amount' ? 100 : 1}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <Label className="text-xs">Discount Applied (₦)</Label>
                <Input
                  value={discountAmount.toLocaleString()}
                  disabled
                  className="bg-gray-50"
                />
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dueDate" className="text-sm font-medium">Due Date *</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                disabled={isSubmitting}
                required
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Payment Terms</Label>
              <Select
                value={formData.paymentTerms}
                onValueChange={(value) => setFormData(prev => ({ ...prev, paymentTerms: value }))}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentTermsOptions.map((term) => (
                    <SelectItem key={term} value={term}>
                      {term}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-sm font-medium">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes or special instructions..."
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          {/* Invoice Summary */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-medium mb-3">Invoice Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₦{subtotal.toLocaleString()}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount:</span>
                  <span>-₦{discountAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-medium text-lg">
                <span>Total:</span>
                <span>₦{total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Invoice...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Create & Send Invoice
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}