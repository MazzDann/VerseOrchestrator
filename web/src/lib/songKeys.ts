/**
 * The queries that hold songs: after a bundle is renamed, deleted, imported or a backup restored,
 * every one of them is asked again — the command palette's search too (review of #47).
 */
export const SONG_KEYS = ['songs', 'song', 'song-bundles', 'song-bundle-files', 'palette-songs'];
