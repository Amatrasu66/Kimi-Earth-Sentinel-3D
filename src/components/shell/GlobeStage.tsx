/**
 * GlobeStage — the visual anchor of the interface.
 *
 * The 3D canvas stays fixed behind the shell (see EarthRenderer); this
 * cell owns the stage's share of the workspace grid so the globe reads
 * as centered in its *usable* area, not the raw viewport. Framing is
 * limited to drafting-notation corner ticks plus a whisper locator —
 * subordinate to the globe, pointer-events never intercepted.
 */
export default function GlobeStage() {
  return (
    <div className="globe-stage-frame" aria-hidden>
      <span className="globe-stage-tick" data-pos="tl" />
      <span className="globe-stage-tick" data-pos="tr" />
      <span className="globe-stage-tick" data-pos="bl" />
      <span className="globe-stage-tick" data-pos="br" />
      <span className="globe-stage-coords">SENTINEL STAGE · WGS 84</span>
    </div>
  );
}
