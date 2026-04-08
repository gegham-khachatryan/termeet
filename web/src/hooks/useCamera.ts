import { useCallback, useEffect, useRef, useState } from "react"
import type { AsciiFrame, AsciiVideoDisplay } from "../types"
import { rgbaToRgb, toBase64, renderRgbToColoredLines } from "../ascii"

// Capture resolution — sent as raw RGB to server (peers render at their own size)
const CAPTURE_W = 160
const CAPTURE_H = 120

// Local ASCII preview size
const PREVIEW_COLS = 100
const PREVIEW_ROWS = 40

const FPS = 12

export function useCamera(
  myId: string | null,
  onFrame: (frame: AsciiFrame) => void,
) {
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [localDisplay, setLocalDisplay] = useState<AsciiVideoDisplay | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const myIdRef = useRef(myId)
  myIdRef.current = myId

  // Hidden video must be in the document or many browsers never set videoWidth / decode frames.
  useEffect(() => {
    const video = document.createElement("video")
    video.autoplay = true
    video.playsInline = true
    video.muted = true
    video.setAttribute("playsinline", "true")
    videoRef.current = video

    const canvas = document.createElement("canvas")
    canvas.width = CAPTURE_W
    canvas.height = CAPTURE_H
    canvasRef.current = canvas

    const mount = document.createElement("div")
    mount.setAttribute("aria-hidden", "true")
    mount.style.cssText =
      "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.02;pointer-events:none;overflow:hidden"
    mount.appendChild(video)
    document.body.appendChild(mount)

    return () => {
      document.body.removeChild(mount)
      videoRef.current = null
      canvasRef.current = null
    }
  }, [])

  // Stable capture function that reads current values from refs
  const capture = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    const vw = video.videoWidth
    const vh = video.videoHeight

    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, CAPTURE_W, CAPTURE_H)
    if (vw > 0 && vh > 0) {
      const scale = Math.min(CAPTURE_W / vw, CAPTURE_H / vh)
      const dw = Math.floor(vw * scale)
      const dh = Math.floor(vh * scale)
      const dx = Math.floor((CAPTURE_W - dw) / 2)
      const dy = Math.floor((CAPTURE_H - dh) / 2)
      ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh)
    } else {
      // Dimensions not ready yet — still sample (stretched) so preview is not stuck black
      ctx.drawImage(video, 0, 0, CAPTURE_W, CAPTURE_H)
    }

    let imageData: ImageData
    try {
      imageData = ctx.getImageData(0, 0, CAPTURE_W, CAPTURE_H)
    } catch {
      setLocalDisplay({ type: "plain", text: "Camera capture blocked", dim: true })
      return
    }
    const rgb = rgbaToRgb(imageData.data, CAPTURE_W, CAPTURE_H)

    const lines = renderRgbToColoredLines(rgb, CAPTURE_W, CAPTURE_H, PREVIEW_COLS, PREVIEW_ROWS)
    setLocalDisplay({ type: "colored", lines })

    const id = myIdRef.current
    if (id) {
      onFrameRef.current({
        senderId: id,
        width: CAPTURE_W,
        height: CAPTURE_H,
        data: toBase64(rgb),
        timestamp: Date.now(),
      })
    }
  }, []) // stable — reads everything from refs

  const startCamera = useCallback(async () => {
    if (streamRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: true,
      })
      streamRef.current = stream
      const video = videoRef.current!
      video.srcObject = stream
      stream.getAudioTracks().forEach((t) => (t.enabled = micOn))
      try {
        await video.play()
      } catch {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        video.srcObject = null
        setLocalDisplay({
          type: "plain",
          text: "Camera playback blocked — tap or allow autoplay",
          dim: true,
        })
        return
      }
      timerRef.current = setInterval(capture, 1000 / FPS)
      capture()
    } catch {
      setLocalDisplay({ type: "plain", text: "Camera unavailable", dim: true })
    }
  }, [capture, micOn])

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }
    setLocalDisplay(null)
  }, [])

  const toggleCamera = useCallback(() => {
    setCameraOn((prev) => {
      const next = !prev
      if (next) {
        startCamera()
      } else {
        stopCamera()
      }
      return next
    })
  }, [startCamera, stopCamera])

  const toggleMic = useCallback(() => {
    setMicOn((prev) => {
      const next = !prev
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next))
      return next
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return {
    cameraOn,
    micOn,
    localDisplay,
    startCamera,
    stopCamera,
    toggleCamera,
    toggleMic,
  }
}
