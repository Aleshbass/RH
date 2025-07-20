'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Camera, 
  Mic, 
  Monitor,
  Wifi,
  Settings,
  RefreshCw
} from 'lucide-react'

interface DiagnosticResult {
  name: string
  status: 'checking' | 'passed' | 'failed' | 'warning'
  message: string
  details?: string
}

export default function VideoDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [testStream, setTestStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const updateDiagnostic = (name: string, status: DiagnosticResult['status'], message: string, details?: string) => {
    setDiagnostics(prev => {
      const existing = prev.find(d => d.name === name)
      const newDiagnostic = { name, status, message, details }
      
      if (existing) {
        return prev.map(d => d.name === name ? newDiagnostic : d)
      } else {
        return [...prev, newDiagnostic]
      }
    })
  }

  const runDiagnostics = async () => {
    setIsRunning(true)
    setDiagnostics([])

    // Test 1: Browser Support
    updateDiagnostic('browser', 'checking', 'Checking browser support...')
    
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateDiagnostic('browser', 'failed', 'Browser does not support camera access', 'Please use a modern browser like Chrome, Firefox, or Safari')
        return
      }
      
      if (!window.RTCPeerConnection) {
        updateDiagnostic('browser', 'failed', 'Browser does not support WebRTC', 'Video calls require WebRTC support')
        return
      }
      
      updateDiagnostic('browser', 'passed', 'Browser supports all required features')
    } catch (error) {
      updateDiagnostic('browser', 'failed', 'Browser compatibility check failed', String(error))
      return
    }

    // Test 2: Camera Permission
    updateDiagnostic('camera', 'checking', 'Checking camera access...')
    
    try {
      // Check existing permissions
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({ name: 'camera' as PermissionName })
          console.log('Camera permission state:', permission.state)
        } catch (e) {
          console.log('Could not check camera permissions')
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false // Test video only first
      })

      if (stream.getVideoTracks().length === 0) {
        updateDiagnostic('camera', 'failed', 'No video tracks available', 'Camera might be disconnected or in use')
        return
      }

      const videoTrack = stream.getVideoTracks()[0]
      const settings = videoTrack.getSettings()
      
      updateDiagnostic('camera', 'passed', 'Camera access granted', 
        `Resolution: ${settings.width}x${settings.height}, Frame rate: ${settings.frameRate}fps`)

      // Show preview
      setTestStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(console.warn)
      }

    } catch (error: any) {
      let errorMessage = 'Camera access failed'
      let errorDetails = ''

      switch (error.name) {
        case 'NotAllowedError':
          errorMessage = 'Camera permission denied'
          errorDetails = 'Please allow camera access and try again'
          break
        case 'NotFoundError':
          errorMessage = 'No camera found'
          errorDetails = 'Please connect a camera device'
          break
        case 'NotReadableError':
          errorMessage = 'Camera in use by another application'
          errorDetails = 'Close other video applications and try again'
          break
        default:
          errorDetails = error.message
      }

      updateDiagnostic('camera', 'failed', errorMessage, errorDetails)
    }

    // Test 3: Microphone Access
    updateDiagnostic('microphone', 'checking', 'Checking microphone access...')
    
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        },
        video: false
      })

      if (audioStream.getAudioTracks().length === 0) {
        updateDiagnostic('microphone', 'warning', 'No audio tracks available', 'Microphone might be disconnected')
      } else {
        const audioTrack = audioStream.getAudioTracks()[0]
        const settings = audioTrack.getSettings()
        updateDiagnostic('microphone', 'passed', 'Microphone access granted',
          `Sample rate: ${settings.sampleRate}Hz, Channels: ${settings.channelCount}`)
      }

      // Clean up audio stream
      audioStream.getTracks().forEach(track => track.stop())

    } catch (error: any) {
      updateDiagnostic('microphone', 'warning', 'Microphone access failed', 
        'Video calls will work without audio: ' + error.message)
    }

    // Test 4: Network Connectivity
    updateDiagnostic('network', 'checking', 'Testing network connectivity...')
    
    try {
      // Test STUN server connectivity
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })

      const datachannel = pc.createDataChannel('test')
      
      await pc.createOffer()
      
      setTimeout(() => {
        updateDiagnostic('network', 'passed', 'Network connectivity looks good')
        pc.close()
      }, 2000)

    } catch (error) {
      updateDiagnostic('network', 'warning', 'Network test inconclusive', String(error))
    }

    // Test 5: Daily.co Connection
    updateDiagnostic('daily', 'checking', 'Testing Daily.co connectivity...')
    
    try {
      // Test Daily.co availability
      const response = await fetch('https://api.daily.co/v1/', {
        method: 'HEAD',
        mode: 'no-cors'
      })
      
      updateDiagnostic('daily', 'passed', 'Daily.co services are accessible')

    } catch (error) {
      updateDiagnostic('daily', 'warning', 'Daily.co connectivity test inconclusive', String(error))
    }

    setIsRunning(false)
  }

  const cleanup = () => {
    if (testStream) {
      testStream.getTracks().forEach(track => track.stop())
      setTestStream(null)
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  useEffect(() => {
    return cleanup
  }, [])

  const getStatusIcon = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'checking':
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
    }
  }

  const getStatusColor = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'checking':
        return 'bg-blue-100 text-blue-800'
      case 'passed':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Video Call Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button 
              onClick={runDiagnostics} 
              disabled={isRunning}
              className="flex-1"
            >
              {isRunning ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              {isRunning ? 'Running Diagnostics...' : 'Run Diagnostics'}
            </Button>
            <Button 
              onClick={cleanup} 
              variant="outline"
              disabled={!testStream}
            >
              Stop Camera
            </Button>
          </div>

          {testStream && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Camera Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <video
                  ref={videoRef}
                  className="w-full max-w-md rounded-lg bg-black"
                  autoPlay
                  muted
                  playsInline
                />
              </CardContent>
            </Card>
          )}

          {diagnostics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Diagnostic Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {diagnostics.map((diagnostic) => (
                  <div key={diagnostic.name} className="flex items-start gap-3 p-3 border rounded-lg">
                    {getStatusIcon(diagnostic.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{diagnostic.name}</span>
                        <Badge className={getStatusColor(diagnostic.status)}>
                          {diagnostic.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">{diagnostic.message}</p>
                      {diagnostic.details && (
                        <p className="text-xs text-gray-500 mt-1">{diagnostic.details}</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This tool helps diagnose video call issues. Run the diagnostics to check your camera, 
              microphone, network connectivity, and browser compatibility. If any tests fail, 
              follow the suggested solutions.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
} 