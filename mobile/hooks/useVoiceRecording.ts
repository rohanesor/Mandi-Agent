import { Platform } from 'react-native'
import { useState, useRef, useEffect } from 'react'

// Platform split at import level
const isWeb = Platform.OS === 'web'

export function useVoiceRecording() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioUri, setAudioUri] = useState<string | null>(null)
  const [amplitude, setAmplitude] = useState(0)
  const [duration, setDuration] = useState(0)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Native refs (expo-av)
  const nativeRecording = useRef<any>(null)
  const meteringInterval = useRef<any>(null)

  // Web refs (MediaRecorder)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)

  // ── PERMISSION ─────────────────────────────────────
  const requestPermission = async (): Promise<boolean> => {
    if (isWeb) {
      try {
        const stream = await navigator.mediaDevices
          .getUserMedia({ audio: true })
        // Stop immediately — just checking permission
        stream.getTracks().forEach(t => t.stop())
        setPermissionGranted(true)
        return true
      } catch {
        setPermissionGranted(false)
        setError('Microphone access denied')
        return false
      }
    } else {
      // Native: expo-av permission
      const { Audio } = await import('expo-av')
      const { status } = await Audio.requestPermissionsAsync()
      const granted = status === 'granted'
      setPermissionGranted(granted)
      if (!granted) setError('Microphone access denied')
      return granted
    }
  }

  // ── START RECORDING ────────────────────────────────
  const startRecording = async () => {
    setError(null)
    const ok = await requestPermission()
    if (!ok) return

    if (isWeb) {
      // WEB: HTML5 MediaRecorder
      try {
        const stream = await navigator.mediaDevices
          .getUserMedia({ audio: true })

        // Set up analyser for amplitude visualization
        const audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        analyserRef.current = analyser

        // Amplitude polling loop
        const dataArray = new Uint8Array(
          analyser.frequencyBinCount
        )
        const pollAmplitude = () => {
          analyser.getByteFrequencyData(dataArray)
          const avg = dataArray.reduce((a, b) => a + b, 0)
            / dataArray.length
          setAmplitude(avg / 255) // normalize 0-1
          animFrameRef.current =
            requestAnimationFrame(pollAmplitude)
        }
        pollAmplitude()

        // Start recording
        audioChunks.current = []
        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/ogg',
        })
        recorder.ondataavailable = (e: MediaRecorderEvent) => {
          if (e.data.size > 0) {
            audioChunks.current.push(e.data)
          }
        }
        recorder.start(100) // collect every 100ms
        mediaRecorder.current = recorder
        setIsRecording(true)

      } catch (e: any) {
        setError(e.message)
      }

    } else {
      // NATIVE: expo-av
      const { Audio } = await import('expo-av')
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })
      const { recording } = await Audio.Recording.createAsync({
        android: {
          extension: '.wav',
          outputFormat:
            Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder:
            Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
        },
        ios: {
          extension: '.wav',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {},
        isMeteringEnabled: true,
      })
      nativeRecording.current = recording
      setIsRecording(true)

      // Native amplitude metering
      meteringInterval.current = setInterval(async () => {
        const status = await recording.getStatusAsync()
        if (status.isRecording && status.metering) {
          // metering is in dB (-160 to 0), normalize
          const normalized =
            Math.max(0, (status.metering + 160) / 160)
          setAmplitude(normalized)
          setDuration(
            Math.floor(status.durationMillis / 1000)
          )
        }
      }, 100)
    }
  }

  // ── STOP RECORDING ─────────────────────────────────
  const stopRecording = async (): Promise<string | null> => {
    setIsRecording(false)

    if (isWeb) {
      // Stop amplitude polling
      cancelAnimationFrame(animFrameRef.current)
      setAmplitude(0)

      return new Promise(resolve => {
        if (!mediaRecorder.current) {
          resolve(null)
          return
        }
        mediaRecorder.current.onstop = async () => {
          const blob = new Blob(audioChunks.current, {
            type: mediaRecorder.current?.mimeType
              || 'audio/webm',
            lastModified: Date.now(),
          } as BlobOptions)
          // Convert blob → base64 data URI
          const reader = new FileReader()
          reader.onloadend = () => {
             // TS safety: reader.result can be ArrayBuffer, cast appropriately
            const uri = String(reader.result)
            setAudioUri(uri)
            resolve(uri)
          }
          reader.readAsDataURL(blob)
          // Stop all tracks
          mediaRecorder.current?.stream
            .getTracks()
            .forEach((t: MediaStreamTrack) => t.stop())
        }
        mediaRecorder.current.stop()
      })

    } else {
      // Native
      clearInterval(meteringInterval.current)
      setAmplitude(0)

      if (!nativeRecording.current) return null
      await nativeRecording.current.stopAndUnloadAsync()
      const uri = nativeRecording.current.getURI()
      nativeRecording.current = null
      if (uri) setAudioUri(uri)
      return uri
    }
  }

  // ── RESET ──────────────────────────────────────────
  const resetRecording = () => {
    setAudioUri(null)
    setDuration(0)
    setAmplitude(0)
    setError(null)
  }

  // ── CLEANUP on unmount ─────────────────────────────
  useEffect(() => {
    return () => {
      if (isWeb) {
        cancelAnimationFrame(animFrameRef.current)
        mediaRecorder.current?.stream
          .getTracks()
          .forEach((t: MediaStreamTrack) => t.stop())
      } else {
        clearInterval(meteringInterval.current)
        nativeRecording.current
          ?.stopAndUnloadAsync()
          .catch(() => {})
      }
    }
  }, [])

  return {
    isRecording,
    audioUri,
    amplitude,
    duration,
    permissionGranted,
    error,
    startRecording,
    stopRecording,
    resetRecording,
  }
}
export default useVoiceRecording;