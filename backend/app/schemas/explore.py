"""Explore page chapters and the Charts page."""

from typing import Literal

from app.schemas import CoverRef, Model, Ok, YearScoped

# ── Years / ranks / bar race ──────────────────────────────────────────────────


class YearOption(Model):
    year: int


class Years(Ok):
    years: list[YearOption]


class _Frames(YearScoped):
    start_month: str | None
    end_month: str | None
    total_months: int
    months: list[str]


class ArtistRankItem(CoverRef):
    rank: int
    artist_name: str
    total_streams: int
    total_minutes: float
    monthly_ranks: list[int]


class TrackRankItem(CoverRef):
    rank: int
    track_name: str
    artist_name: str | None
    total_streams: int
    total_minutes: float
    monthly_ranks: list[int]


class ArtistRank(_Frames):
    data: list[ArtistRankItem]


class TrackRank(_Frames):
    data: list[TrackRankItem]


class BarRaceItem(CoverRef):
    rank: int
    name: str
    artist_name: str | None = None  # track/album races only
    total_minutes: float
    cumulative_minutes: list[float]


class BarRace(_Frames):
    entity: Literal["artist", "track", "album"]
    unit: Literal["minutes"] = "minutes"
    data: list[BarRaceItem]


# ── Rhythm ────────────────────────────────────────────────────────────────────


class Chronotype(Model):
    label: str | None
    position: float


class Streak(Model):
    longest: int
    current: int
    active_days: int


class Rhythm(YearScoped):
    hourly: list[int]
    peak_hour: int | None
    weekday: list[int]
    busiest_weekday: str | None
    monthly: list[int]
    chronotype: Chronotype
    streak: Streak
    total_streams: int


# ── Sound ─────────────────────────────────────────────────────────────────────


class AudioAverages(Model):
    energy: float
    valence: float
    danceability: float
    acousticness: float
    vocal: float


class MajorMode(Model):
    major: float


class MoodTrack(Model):
    name: str | None
    valence: float
    energy: float
    plays: int


class Audio(YearScoped):
    avg: AudioAverages | None
    tempo_avg: int | None = None
    mode: MajorMode | None = None
    tracks: list[MoodTrack]
    coverage: float
    matched: int
    total: int
    catalog_missing: bool | None = None  # set on the empty response only
    has_history: bool | None = None  # set on the empty response only


class TempoBucket(Model):
    label: str
    plays: int


class TempoSpread(Model):
    buckets: list[TempoBucket]


class KeySplit(Model):
    major_share: float


class DanceableTrack(Model):
    id: str
    name: str | None
    artist: str
    danceability: float


class EnergySplit(Model):
    workout: float
    wind_down: float


class SoundDetail(YearScoped):
    tempo: TempoSpread
    key: KeySplit | None
    danceable: list[DanceableTrack]
    energy_split: EnergySplit | None


# ── Taste ─────────────────────────────────────────────────────────────────────


class GenrePlays(Model):
    name: str
    plays: int


class EraPlays(Model):
    decade: int
    plays: int


class TrackPlays(Model):
    id: str
    name: str | None
    artist: str
    plays: int


class Taste(YearScoped):
    genres: list[GenrePlays]
    mainstream: float | None
    distinct_genres: int
    eras: list[EraPlays]
    avg_year: int | None
    gems: list[TrackPlays]
    catalog_missing: bool | None = None  # set on the empty response only
    has_history: bool | None = None  # set on the empty response only


# ── Habits (behavior) ─────────────────────────────────────────────────────────


class Attention(Model):
    under30: float
    partial: float
    finished: float


class LoopTrack(Model):
    id: str
    name: str
    artist: str
    count: int


class Behavior(YearScoped):
    shuffle: float | None
    skip_rate: float | None
    longest_binge_min: int
    attention: Attention
    loops: list[LoopTrack]


# ── Discovery ─────────────────────────────────────────────────────────────────


class RisingArtist(Model):
    name: str
    share: int
    id: str | None


class Discovery(YearScoped):
    new_artist_share: float
    new_artists_monthly: float
    one_off_share: float
    rediscoveries: list[TrackPlays]
    rising: list[RisingArtist]


# ── Listening life ────────────────────────────────────────────────────────────


class Peak(Model):
    label: str
    minutes: float
    period: str


class SessionShare(Model):
    label: str
    share: float


class Milestone(Model):
    target: int
    date: str
    track: str
    artist: str


class ListeningLife(YearScoped):
    peaks: list[Peak]
    typical_session_minutes: int
    session_mix: list[SessionShare]
    milestones: list[Milestone]


# ── Over time ─────────────────────────────────────────────────────────────────


class NamedArtist(Model):
    name: str | None
    id: str | None


class NamedTrack(Model):
    id: str
    name: str | None
    artist: str | None


class YearHighlights(Model):
    year: int
    top_artist: NamedArtist
    top_track: NamedTrack
    summer_track: NamedTrack


class MusicAge(Model):
    avg_year: int
    fresh_share: float


class DatedTrack(Model):
    id: str
    name: str | None
    artist: str
    year: int


class TimeMachine(Model):
    oldest: DatedTrack
    newest: DatedTrack


class NostalgiaPoint(Model):
    period: str
    avg_year: int


class OverTime(YearScoped):
    years: list[YearHighlights]
    music_age: MusicAge | None
    time_machine: TimeMachine | None
    nostalgia: list[NostalgiaPoint]


# ── Evolution ─────────────────────────────────────────────────────────────────


class GenreShares(Model):
    name: str
    shares: list[float]


class GenreEvolution(Model):
    periods: list[str]
    genres: list[GenreShares]


class MoodPoint(Model):
    period: str
    valence: float


class PopularityPoint(Model):
    period: str
    popularity: float


class EnergyValue(Model):
    energy: float


class DayNight(Model):
    morning: EnergyValue | None = None
    night: EnergyValue | None = None


class Evolution(YearScoped):
    genre_evolution: GenreEvolution
    mood_trend: list[MoodPoint]
    day_night: DayNight | None
    mainstream_trend: list[PopularityPoint]


# ── Deep cuts ─────────────────────────────────────────────────────────────────


class Concentration(Model):
    top10_share: float


class AlbumCommitment(Model):
    deep_share: float


class TopDayTrack(Model):
    id: str
    name: str | None
    artist: str
    count: int
    date: str


class NoSkipTrack(Model):
    id: str
    name: str | None
    artist: str
    plays: int
    skip_rate: float


class DeepCuts(YearScoped):
    concentration: Concentration | None
    album_commitment: AlbumCommitment | None
    top_day_track: TopDayTrack | None
    no_skip: NoSkipTrack | None


# ── Wrapped ───────────────────────────────────────────────────────────────────


class PersonalityTrait(Model):
    label: str
    icon: str
    left: str
    right: str
    position: float


class Wrapped(YearScoped):
    personality: list[PersonalityTrait]


# ── Charts ────────────────────────────────────────────────────────────────────

ChartEntity = Literal["artist", "track", "album", "genre"]
ChartSort = Literal["minutes", "streams"]


class ChartItem(CoverRef):
    rank: int
    name: str
    artist: str | None
    minutes: float
    streams: int
    share: float
    prev_rank: int | None


class Chart(Ok):
    entity: ChartEntity
    sort: ChartSort
    range: str
    items: list[ChartItem]
    years: list[int]


class ObsessionRecord(Model):
    rank: int
    id: str
    name: str | None
    artist: str | None
    count: int
    date: str


class BingeRecord(Model):
    rank: int
    id: str | None
    name: str
    plays: int
    minutes: int
    artist_pct: int
    date: str


class SkippedRecord(Model):
    rank: int
    id: str
    name: str | None
    artist: str | None
    plays: int
    skip_pct: int


class NeverSkippedRecord(Model):
    rank: int
    id: str
    name: str | None
    artist: str | None
    plays: int


class Superlatives(Ok):
    range: str
    obsession: list[ObsessionRecord]
    binges: list[BingeRecord]
    most_skipped: list[SkippedRecord]
    never_skipped: list[NeverSkippedRecord]
    years: list[int]
