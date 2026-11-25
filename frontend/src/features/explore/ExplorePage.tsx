import { ChapterRail, type ChapterLink } from './ChapterRail'
import { ClimbChapter } from './chapters/Climb'
import { DeepCutsChapter } from './chapters/DeepCuts'
import { DiscoveryChapter } from './chapters/Discovery'
import { EvolutionChapter } from './chapters/Evolution'
import { HabitsChapter } from './chapters/Habits'
import { LifeChapter } from './chapters/Life'
import { OverTimeChapter } from './chapters/OverTime'
import { RhythmChapter } from './chapters/Rhythm'
import { SoundChapter } from './chapters/Sound'
import { SoundDetailChapter } from './chapters/SoundDetail'
import { TasteChapter } from './chapters/Taste'
import { WrappedChapter } from './chapters/Wrapped'
import { YearFilterProvider } from './yearFilter'

const CHAPTERS: ChapterLink[] = [
  { id: 'climb', label: 'The Climb' },
  { id: 'rhythm', label: 'When You Listen' },
  { id: 'sound', label: 'Your Sound' },
  { id: 'taste', label: 'Your Taste' },
  { id: 'habits', label: 'How You Listen' },
  { id: 'discovery', label: 'Discovery & Loyalty' },
  { id: 'listening-life', label: 'Your Listening Life' },
  { id: 'over-time', label: 'Your Music, Over Time' },
  { id: 'evolution', label: 'How Your Taste Changes' },
  { id: 'sound-detail', label: 'The Detail In Your Sound' },
  { id: 'deep-cuts', label: 'Your Deep Cuts' },
  { id: 'wrapped', label: 'Wrapped' },
]

/** The deep dive: eleven scrollytelling chapters + a Wrapped finale, all driven
 * by one year filter. */
export default function ExplorePage() {
  return (
    <YearFilterProvider>
      <main className="mx-auto max-w-[1440px] space-y-6 px-container-padding-mobile pb-section-gap pt-24 md:px-container-padding-desktop">
        <h1 className="sr-only">Explore your listening</h1>
        <ChapterRail chapters={CHAPTERS} />
        <ClimbChapter />
        <RhythmChapter />
        <SoundChapter />
        <TasteChapter />
        <HabitsChapter />
        <DiscoveryChapter />
        <LifeChapter />
        <OverTimeChapter />
        <EvolutionChapter />
        <SoundDetailChapter />
        <DeepCutsChapter />
        <WrappedChapter />
      </main>
    </YearFilterProvider>
  )
}
