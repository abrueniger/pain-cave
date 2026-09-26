// Short sine beeps for block-change cues (Web Audio, no assets).
let ctx: AudioContext | null = null

export function beep(freq = 880, ms = 120, volume = 0.25) {
  try {
    ctx ??= new AudioContext()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + ms / 1000)
  } catch (e) {
    console.warn('beep failed', e)
  }
}
