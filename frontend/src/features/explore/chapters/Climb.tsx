import { BarRace } from '../climb/BarRace'
import { RankClimb } from '../climb/RankClimb'
import { ChapterHeading } from '../Chapter'

/** Chapter 01: bar race + rank climb (each manages its own query and state). */
export function ClimbChapter() {
  return (
    <section id="climb" className="scroll-mt-32 space-y-6" aria-label="The Climb">
      <ChapterHeading title="The Climb" />
      <BarRace />
      <RankClimb />
    </section>
  )
}
