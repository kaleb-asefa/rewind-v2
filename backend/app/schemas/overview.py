"""Overview page: headline totals, top entities and the activity heatmap."""

from app.schemas import CoverKind, Model, Ok


class TotalTime(Ok):
    total_minutes: float


class TopArtist(Ok):
    artist_name: str | None
    artist_id: str | None
    cover_kind: CoverKind | None
    cover_id: str | None
    total_streams: int
    total_minutes: float


class TopAlbum(Ok):
    album_name: str | None
    artist_name: str | None
    album_id: str | None
    cover_kind: CoverKind | None
    cover_id: str | None
    total_streams: int
    total_minutes: float


class TopTrack(Ok):
    track_name: str | None
    artist_name: str | None
    track_id: str | None
    total_streams: int
    total_minutes: float


class TotalSongs(Ok):
    total_songs: int


class ActiveDay(Ok):
    weekday: str | None
    average_minutes: float
    total_minutes: float


class HeatmapDay(Model):
    date: str
    streams: int
    minutes: float
    level: int
    top_track: str | None
    top_artist: str | None


class Heatmap(Ok):
    years: list[int]
    year: int | None
    active_days: int = 0
    total_streams: int = 0
    total_minutes: float = 0
    max_streams: int = 0
    days: list[HeatmapDay]
