/**
 * Lightweight, dependency-free sound effects synthesized with the Web
 * Audio API — no audio files to ship or license. Every sound is a short,
 * simple tone/chime so this stays tiny and works fully offline, which
 * matters for a venue with unreliable internet.
 */

const STORAGE_KEY = 'crossword-arena-sound-muted'

let audioCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      audioCtx = new Ctor()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
    return audioCtx
  } catch {
    return null
  }
}

export function isSoundMuted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
  } catch {
    // ignore — worst case the preference doesn't persist
  }
}

interface Tone {
  freq: number
  startAt: number
  duration: number
  gain?: number
  type?: OscillatorType
}

function playTones(tones: Tone[]): void {
  if (isSoundMuted()) return
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime
  for (const tone of tones) {
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    osc.type = tone.type ?? 'sine'
    osc.frequency.value = tone.freq
    const startTime = now + tone.startAt
    const endTime = startTime + tone.duration
    const peakGain = tone.gain ?? 0.15

    gainNode.gain.setValueAtTime(0, startTime)
    gainNode.gain.linearRampToValueAtTime(peakGain, startTime + 0.015)
    gainNode.gain.exponentialRampToValueAtTime(0.001, endTime)

    osc.connect(gainNode)
    gainNode.connect(ctx.destination)
    osc.start(startTime)
    osc.stop(endTime + 0.02)
  }
}

/** A word was solved correctly. */
export function playCorrect(): void {
  playTones([
    { freq: 587.33, startAt: 0, duration: 0.11, type: 'triangle', gain: 0.14 },
    { freq: 880, startAt: 0.09, duration: 0.16, type: 'triangle', gain: 0.16 },
  ])
}

/** A single countdown tick (grace-window urgency). */
export function playTick(): void {
  playTones([{ freq: 880, startAt: 0, duration: 0.06, type: 'square', gain: 0.08 }])
}

/** Left fullscreen / competition mode interrupted. */
export function playAlert(): void {
  playTones([
    { freq: 440, startAt: 0, duration: 0.14, type: 'sawtooth', gain: 0.16 },
    { freq: 330, startAt: 0.15, duration: 0.18, type: 'sawtooth', gain: 0.16 },
  ])
}

/** Match ended / results & celebration screen. */
export function playFanfare(): void {
  playTones([
    { freq: 523.25, startAt: 0, duration: 0.14, type: 'triangle', gain: 0.15 },
    { freq: 659.25, startAt: 0.12, duration: 0.14, type: 'triangle', gain: 0.15 },
    { freq: 783.99, startAt: 0.24, duration: 0.14, type: 'triangle', gain: 0.15 },
    { freq: 1046.5, startAt: 0.38, duration: 0.35, type: 'triangle', gain: 0.18 },
  ])
}

/** Match countdown reached GO — competition has begun. */
export function playStart(): void {
  playTones([
    { freq: 392, startAt: 0, duration: 0.4, type: 'sawtooth', gain: 0.18 },
    { freq: 587.33, startAt: 0, duration: 0.4, type: 'triangle', gain: 0.12 },
  ])
}
