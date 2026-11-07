import type { Frame, Point } from './pose'

/**
 * One Euro filter (Casiez et al., 2012): heavy smoothing when a point is still, little when it
 * moves fast, so the skeleton stops jittering without lagging behind real movement.
 */
class OneEuro {
  private x: number | null = null
  private dx = 0
  private t = 0

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff = 1
  ) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  filter(value: number, tMs: number): number {
    if (this.x === null) {
      this.x = value
      this.t = tMs
      return value
    }
    const dt = Math.max((tMs - this.t) / 1000, 1e-3)
    this.t = tMs
    const rawDx = (value - this.x) / dt
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x)
    return this.x
  }
}

/** Smooths every landmark of a stream of frames. Visibility is eased too, so one bad frame doesn't drop a joint. */
export class FrameSmoother {
  private filters: { x: OneEuro; y: OneEuro; z: OneEuro }[] = []
  private visibility: number[] = []

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.6
  ) {}

  reset() {
    this.filters = []
    this.visibility = []
  }

  smooth(frame: Frame): Frame {
    const points: Point[] = frame.points.map((p, i) => {
      if (!this.filters[i]) {
        this.filters[i] = { x: new OneEuro(this.minCutoff, this.beta), y: new OneEuro(this.minCutoff, this.beta), z: new OneEuro(0.8, 0.1) }
        this.visibility[i] = p.v
      }
      const f = this.filters[i]
      this.visibility[i] = this.visibility[i] * 0.6 + p.v * 0.4
      return { x: f.x.filter(p.x, frame.t), y: f.y.filter(p.y, frame.t), z: f.z.filter(p.z, frame.t), v: this.visibility[i] }
    })
    return { t: frame.t, points }
  }
}
