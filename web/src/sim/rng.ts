/** Tiny seedable RNG (mulberry32) + a Gaussian, so matches are deterministic. */
export class RNG {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  /** uniform [0,1) */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** standard normal via Box-Muller */
  normal(mean = 0, std = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
}
