export class RNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0xffffffff;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  pick<T>(array: readonly T[]): T {
    const idx = Math.floor(this.range(0, array.length));
    return array[idx];
  }
}
