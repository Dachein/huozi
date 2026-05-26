/**
 * Optimistic commit primitive.
 *
 * Pattern shared by inline-edit save and clip-to-clippings: apply the
 * user's effect to the DOM (or any local layer) immediately, fire the
 * server POST in the background, revert the local effect if the POST
 * eventually fails. The user sees <50ms feedback instead of waiting on
 * the cloud Worker's read-then-write round-trip.
 *
 * `applyLocal` returns a `revert` closure (or null if there's nothing
 * to undo — e.g. canvas-rendered surfaces that defer to router.refresh
 * after the commit). On `commit` rejection or `{ ok: false }`, the
 * primitive runs `revert` and forwards the message to `onError`. On
 * success it runs `onCommitted` with the optional payload.
 *
 * Why a function and not a hook: callers are event handlers, not
 * components — keeping this dependency-free lets it run from outside
 * React (workers, raw DOM event listeners) and keeps test surface tiny.
 */

export type RevertFn = () => void;

export type CommitResult<R> =
  | { ok: true; data?: R }
  | { ok: false; message: string };

export interface OptimisticOp<P, R = void> {
  /** Apply the effect locally and return a revert closure. Return null
   *  if there is no local effect to undo. */
  applyLocal: (payload: P) => RevertFn | null;
  /** Background request. Resolve with `{ ok: false, message }` for
   *  application-level failures; throw for transport errors — both paths
   *  trigger revert + onError. */
  commit: (payload: P) => Promise<CommitResult<R>>;
  /** Fired after a successful commit. The second arg is the same
   *  closure `applyLocal` returned — runOptimistic does NOT call it on
   *  success (success isn't a "revert" semantically), but Clip-style
   *  flows want to use it as a cleanup hook: once the layer has reloaded
   *  the canonical state, the pending decoration is redundant and can be
   *  cleared. Callers that have nothing to clean up just ignore it. */
  onCommitted?: (data: R | undefined, cleanup: RevertFn) => void;
  /** Fired after revert. Show a toast / log / etc. */
  onError?: (message: string) => void;
}

export function runOptimistic<P, R = void>(
  op: OptimisticOp<P, R>,
  payload: P,
): void {
  const revert = op.applyLocal(payload);
  void (async () => {
    let res: CommitResult<R>;
    try {
      res = await op.commit(payload);
    } catch (e) {
      revert?.();
      op.onError?.(e instanceof Error ? e.message : String(e));
      return;
    }
    if (!res.ok) {
      revert?.();
      op.onError?.(res.message);
      return;
    }
    op.onCommitted?.(res.data, revert ?? (() => {}));
  })();
}
