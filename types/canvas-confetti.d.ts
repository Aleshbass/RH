// canvas-confetti ships without types; this covers the options we use (exercise player, Rehabify Learn).
declare module 'canvas-confetti' {
  type Options = {
    particleCount?: number
    angle?: number
    spread?: number
    startVelocity?: number
    ticks?: number
    zIndex?: number
    origin?: { x?: number; y?: number }
    colors?: string[]
    disableForReducedMotion?: boolean
  }
  const confetti: (options?: Options) => Promise<null> | null
  export default confetti
}
