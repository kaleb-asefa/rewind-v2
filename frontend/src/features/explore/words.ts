/** The one-word labels the Explore chapters derive from metrics (v1 thresholds). */

export type Zone = 'Pumped' | 'Intense' | 'Chill' | 'Moody'

// Neutral split at 0.5: the backend already de-inflates genre-loud "energy".
const MID = 0.5
export function moodZone(valence: number, energy: number): Zone {
  if (energy >= MID) return valence >= MID ? 'Pumped' : 'Intense'
  return valence >= MID ? 'Chill' : 'Moody'
}

export const paceWord = (bpm: number) =>
  bpm < 85
    ? 'Laid-back'
    : bpm < 105
      ? 'Easy-going'
      : bpm < 125
        ? 'Upbeat'
        : bpm < 145
          ? 'Lively'
          : 'High-energy'
export const mainstreamWord = (m: number) =>
  m < 0.4 ? 'Underground' : m < 0.65 ? 'In the mix' : 'Mainstream'
export const rangeWord = (n: number) => (n >= 7 ? 'Explorer' : n >= 4 ? 'Adventurous' : 'Loyalist')
export const shuffleWord = (s: number) =>
  s >= 0.6 ? 'Shuffler' : s >= 0.35 ? 'A bit of both' : 'Curator'
export const skipWord = (s: number) =>
  s >= 0.4 ? 'Restless' : s >= 0.2 ? 'Selective' : 'Locked in'
export const discoveryWord = (s: number) =>
  s >= 0.45 ? 'Explorer' : s >= 0.25 ? 'Open to new music' : 'Loyalist'
