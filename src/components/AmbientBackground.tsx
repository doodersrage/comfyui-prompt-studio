/**
 * Full-viewport ambient layer — soft drifting color orbs + grain.
 * Pure CSS; respects prefers-reduced-motion.
 */
export default function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <div className="ambient-bg__base" />
      <div className="ambient-bg__orb ambient-bg__orb--violet" />
      <div className="ambient-bg__orb ambient-bg__orb--cyan" />
      <div className="ambient-bg__orb ambient-bg__orb--rose" />
      <div className="ambient-bg__sheen" />
      <div className="ambient-bg__vignette" />
      <div className="ambient-bg__grain" />
    </div>
  );
}
