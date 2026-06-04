import { Injectable } from '@nestjs/common';

/** ELO K-factor per game. */
const K = 32;

@Injectable()
export class EloService {
  /**
   * Compute ELO rating deltas for a 4-player game using pairwise comparison.
   *
   * Each player is evaluated against each other player (6 pairs total).
   * placement[i] = 1 means player i scored highest. Tied seats share rank.
   * Returns integer deltas [Δseat0, Δseat1, Δseat2, Δseat3].
   */
  computeDeltas(
    placement: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4],
    ratings: [number, number, number, number],
  ): [number, number, number, number] {
    const deltas = [0, 0, 0, 0] as [number, number, number, number];

    for (let i = 0; i < 4; i++) {
      let raw = 0;
      for (let j = 0; j < 4; j++) {
        if (i === j) continue;
        const expected = 1 / (1 + 10 ** ((ratings[j] - ratings[i]) / 400));
        const actual = placement[i] < placement[j] ? 1 : placement[i] === placement[j] ? 0.5 : 0;
        raw += K * (actual - expected);
      }
      deltas[i] = Math.round(raw);
    }

    return deltas;
  }
}
