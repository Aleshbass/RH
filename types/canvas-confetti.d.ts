// canvas-confetti ships without types; this covers the call we use (the exercise player's celebration).
declare module 'canvas-confetti' {
  type Options = {
    particleCount?: number
    spread?: number
    origin?: { x?: number; y?: number }
    colors?: string[]
  }
  const confetti: (options?: Options) => Promise<null> | null
  export default confetti
}
