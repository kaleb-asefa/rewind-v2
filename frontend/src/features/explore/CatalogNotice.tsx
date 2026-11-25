/** Why catalog-backed chapters are empty when the server has no music catalog. */
export const CATALOG_REASON = (
  <>
    Audio features need the music catalog, which isn&apos;t available on this server (
    <span className="rounded bg-surface-container px-1 py-0.5 font-mono text-xs">
      catalog_sorted.parquet
    </span>
    ).
  </>
)
