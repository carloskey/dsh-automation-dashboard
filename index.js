/**
 * Host half of the automation dashboard bundle.
 *
 * The page reads tasks through the already-mounted official `schedule` service
 * Remote endpoints (`schedule/catalog` and `schedule/history`), so this half
 * registers nothing: it exists so the Loader row mounts and the browser half is
 * composed into the client graph.
 */
export function apply() {}
